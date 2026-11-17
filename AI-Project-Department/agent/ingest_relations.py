# -*- coding: utf-8 -*-
"""算力产业链企业关系入链 —— 股权 / 关联方 / 客户 / 供应商。

源（均为「企业全称 + 证券代码」，无信用代码列，需映射到已入链主体）：
    G:/对公经营智能化项目/算力/算力产业链-股权穿透与关联方-初版.xlsx
        ├ 1-股权穿透总表      实控人 / 第一大股东 / CR10 / 股东户数
        ├ 2-十大股东明细      前十大股东及持股比例
        ├ 3-实控人集团归集    集团口径（本脚本按 controller 自建组，覆盖更完整）
        ├ 4-关联方候选        A 母子公司 / B 同集团 / D 同法定代表人
        ├ 5-企百科非上市穿透  12 家非上市重点主体实控人
        └ 6-客户与供应商集中度 CR5 / 关联方交易占比（风险信号）
    G:/对公经营智能化项目/算力/算力产业链-客户供应商关系-企百科.xlsx
        ├ 1-客户关系明细      52,543 条（主体是卖方）
        └ 2-供应商关系明细    18,404 条（主体是买方）

主键口径：与 ingest_compute.py 完全一致，一切落库/落盘记录都以
`company_key`（统一社会信用代码，缺码者为 pending:CP:*）为主键，
企业全称只作为可读字段与匹配入口。

映射规则（按可靠性排序，逐条留痕）：
    1. 证券代码（6 位）精确命中 —— 交易类关系表 96% 走这条
    2. 企业全称精确命中（含别名）
    3. 仍不命中 -> 记入 unmatched，不猜、不模糊合并

用法：
    python agent/ingest_relations.py            # 只读解析 + 出报告
    python agent/ingest_relations.py --apply    # 写库 + 写前端分片（先备份）
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

AGENT_DIR = Path(__file__).resolve().parent
ROOT = AGENT_DIR.parent
sys.path.insert(0, str(AGENT_DIR))

from ingest_compute import (  # noqa: E402
    DB_FILE,
    INDUSTRY_CODE,
    INDUSTRY_LABEL,
    OUT_CHAIN,
    OUT_SHARD,
    SCHEMA_FILE,
    clean,
    connect,
    norm_name,
)

SOURCE_EQUITY = Path("G:/对公经营智能化项目/算力/算力产业链-股权穿透与关联方-初版.xlsx")
SOURCE_TRADE = Path("G:/对公经营智能化项目/算力/算力产业链-客户供应商关系-企百科.xlsx")

OUT_RELATIONS = ROOT / "frontend" / "public" / "data" / "industries" / "compute-relations.json"
REPORT_FILE = AGENT_DIR / "data" / "compute-relations-report.json"

# 链外交易对手在详情页的保留条数（按金额降序）。全量明细留在链外分片里会到 13MB，
# 前端按需加载也吃不消；30 条覆盖每家 90% 以上的金额占比。
OUTSIDE_TOP_N = 30
# 交易金额为 0/空的记录仍保留（说明「有交易但未披露金额」），但排序垫底。

RELATION_LABELS = {
    "供应": "供应",
    "股权": "股权",
    "同一集团": "同一集团",
    "同一实控人": "同一实控人",
}

NOW = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")  # noqa: E731


# ---------------------------------------------------------------- 基础工具
def sha1(text: str, length: int = 10) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:length]


def as_num(value, default=None):
    if value is None or value == "":
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "").replace("%", "").strip()
    if not text or text in {"-", "—", "未取", "不适用"}:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def norm_company_name(value) -> str:
    """匹配用的强归一：去空格、全半角统一、去括号差异。"""
    text = clean(value).replace("（", "(").replace("）", ")")
    text = re.sub(r"\s+", "", text)
    return text


def normalize_stock(value) -> str:
    text = clean(value).upper().replace(".0", "")
    text = re.sub(r"[^0-9]", "", text)
    return text.zfill(6) if text and text != "0" else ""


def rel_id(*parts: str) -> str:
    return f"rel-cp-{sha1('|'.join(parts))}"


def iter_sheet(path: Path, sheet: str, header_row: int):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    worksheet = workbook[sheet]
    for row in worksheet.iter_rows(min_row=header_row + 1, values_only=True):
        if row and any(cell not in (None, "") for cell in row):
            yield row
    workbook.close()


# ---------------------------------------------------------------- 主体索引
class CompanyIndex:
    def __init__(self, companies: list[dict]):
        self.companies = companies
        self.by_key = {c["keyValue"]: c for c in companies}
        self.by_stock: dict[str, dict] = {}
        self.by_name: dict[str, dict] = {}
        for company in companies:
            stock = normalize_stock(company.get("stockCode"))
            if stock:
                self.by_stock.setdefault(stock, company)
            self.by_name.setdefault(norm_company_name(company["name"]), company)
            for alias in company.get("aliases") or []:
                self.by_name.setdefault(norm_company_name(alias), company)

    def find(self, name=None, stock=None) -> tuple[dict | None, str]:
        stock_key = normalize_stock(stock)
        if stock_key and stock_key in self.by_stock:
            return self.by_stock[stock_key], "stock_code"
        name_key = norm_company_name(name)
        if name_key and name_key in self.by_name:
            return self.by_name[name_key], "name"
        return None, "unmatched"


# ---------------------------------------------------------------- 各类关系
def read_equity(index: CompanyIndex, stats: dict) -> dict[str, dict]:
    """1-股权穿透总表：实控人 / 第一大股东 / 集中度（写公司字段，不产生边）。

    穿透总表口径（3,380 主体）大于本链（1,764），因此不把「表里但不在本链」的行算作
    未命中；只统计「本链有、穿透表无」，后者才是真正的数据缺口。
    """
    enrich: dict[str, dict] = {}
    hit_keys: set[str] = set()
    for row in iter_sheet(SOURCE_EQUITY, "1-股权穿透总表", 4):
        name, stock = row[1], row[5]
        company, how = index.find(name, stock)
        if not company:
            stats["equityOutOfChain"] += 1
            continue
        hit_keys.add(company["keyValue"])
        controller = clean(row[6])
        if not controller:
            stats["equityNoData"] += 1
            continue
        enrich[company["keyValue"]] = {
            "controller": controller,
            "controllerType": clean(row[7]) or None,
            "controllerStake": as_num(row[8]),
            "controlDepth": as_num(row[9]),
            "topHolder": clean(row[10]) or None,
            "topHolderStake": as_num(row[11]),
            "cr10": as_num(row[12]),
            "shareholderCount": as_num(row[14]),
            "legalPerson": clean(row[15]) or None,
            "equityProvince": clean(row[16]) or None,
            "equitySource": clean(row[17]) or "股权穿透总表",
            "equityMatch": how,
        }
        stats["equityMatched"] += 1
    stats["equityHitKeys"] = hit_keys
    return enrich


def read_shareholders(index: CompanyIndex, stats: dict) -> tuple[dict[str, list], list[dict]]:
    """2-十大股东明细：股东名单写公司资产；股东本身在链内的另生成股权边。"""
    holders: dict[str, list] = defaultdict(list)
    edges: list[dict] = []
    current = None
    current_key = None
    for row in iter_sheet(SOURCE_EQUITY, "2-十大股东明细", 4):
        if row[1]:
            current = row[1]
            company, _ = index.find(current, None)
            current_key = company["keyValue"] if company else None
        holder_name, pct = clean(row[4]), as_num(row[5])
        if not holder_name or not current_key:
            continue
        holders[current_key].append(
            {
                "name": holder_name,
                "pct": pct,
                "type": clean(row[6]) or None,
                "period": clean(row[3]) or None,
            }
        )
        holder_company, _ = index.find(holder_name, None)
        if holder_company and holder_company["keyValue"] != current_key:
            edges.append(
                {
                    "from": holder_company["name"],
                    "to": index.by_key[current_key]["name"],
                    "fromKey": holder_company["keyValue"],
                    "toKey": current_key,
                    "relationType": "股权",
                    "depth": 1,
                    "strength": "强",
                    "scope": "in-chain",
                    "sharePct": pct,
                    "relYear": None,
                    "sourceTable": "2-十大股东明细",
                    "basis": f"{holder_name} 持有 {index.by_key[current_key]['name']} {pct if pct is not None else '?'}% 股份",
                }
            )
            stats["shareholderEdges"] += 1
    for key, items in holders.items():
        items.sort(key=lambda item: (item["pct"] is None, -(item["pct"] or 0)))
        holders[key] = items[:10]
    return holders, edges


def read_related_parties(index: CompanyIndex, stats: dict) -> list[dict]:
    """4-关联方候选：274 对，A 母子公司（强）/ B 同集团（中）/ D 同法定代表人（弱）。"""
    type_map = {
        "A": ("股权", "强"),
        "B": ("同一集团", "中"),
        "D": ("同一实控人", "弱"),
    }
    edges: list[dict] = []
    for row in iter_sheet(SOURCE_EQUITY, "4-关联方候选", 4):
        raw_type = clean(row[0])
        a_name, b_name = clean(row[1]), clean(row[4])
        if not a_name or not b_name:
            continue
        prefix = raw_type[:1].upper()
        rel_type, strength = type_map.get(prefix, ("同一实控人", clean(row[8]) or "弱"))
        company_a, how_a = index.find(a_name, None)
        company_b, how_b = index.find(b_name, None)
        if company_a and company_b and company_a["keyValue"] == company_b["keyValue"]:
            # 同名两行在入链时已合并为同一主体（如青云科技），再连边就是自环。
            stats["relatedSelfLoop"] += 1
            continue
        both = bool(company_a and company_b)
        if both:
            stats["relatedBothIn"] += 1
        elif company_a or company_b:
            stats["relatedOneSide"] += 1
        edges.append(
            {
                "from": company_a["name"] if company_a else a_name,
                "to": company_b["name"] if company_b else b_name,
                "fromKey": company_a["keyValue"] if company_a else None,
                "toKey": company_b["keyValue"] if company_b else None,
                "relationType": rel_type,
                "depth": 1,
                "strength": strength,
                "scope": "in-chain" if both else "outside",
                "sourceTable": "4-关联方候选",
                "basis": clean(row[7]) or f"{a_name} 与 {b_name}：{raw_type}",
                "matchA": how_a,
                "matchB": how_b,
            }
        )
        stats["relatedEdges"] += 1
    return edges


def read_concentration(index: CompanyIndex, stats: dict) -> dict[str, dict]:
    """6-客户与供应商集中度：CR5 与关联方交易占比（风险信号，写公司字段）。"""
    enrich: dict[str, dict] = {}
    for row in iter_sheet(SOURCE_EQUITY, "6-客户与供应商集中度", 4):
        name, stock = row[0], row[2]
        company, _ = index.find(name, stock)
        if not company:
            stats["concentrationUnmatched"].append(clean(name))
            continue
        key = company["keyValue"]
        # 同一主体可能出现「名称变体」两行，保留字段更全的一条。
        if key in enrich and enrich[key].get("customerCr5") is not None:
            continue
        enrich[key] = {
            "customerCr5": as_num(row[5]),
            "top5CustomerAmount": as_num(row[6]),
            "relatedSaleShare": as_num(row[7]),
            "supplierCr5": as_num(row[8]),
            "top5SupplierAmount": as_num(row[9]),
            "relatedBuyShare": as_num(row[10]),
            "concentrationYear": clean(row[4]) or None,
            "concentrationFlag": clean(row[12]) or None,
            "concentrationStatus": clean(row[3]) or None,
        }
        stats["concentrationMatched"] += 1
    return enrich


def read_private_equity(index: CompanyIndex, stats: dict) -> dict[str, dict]:
    """5-企百科非上市穿透：12 家非上市重点主体的实控人与控制链。"""
    enrich: dict[str, dict] = {}
    for row in iter_sheet(SOURCE_EQUITY, "5-企百科非上市穿透", 4):
        name = clean(row[0])
        company, _ = index.find(name, None)
        if not company:
            stats["privateEquityUnmatched"].append(name)
            continue
        enrich[company["keyValue"]] = {
            "controller": clean(row[5]) or None,
            "controllerType": clean(row[6]) or None,
            "controllerStake": as_num(row[7]),
            "controlDepth": as_num(row[8]),
            "topHoldersText": clean(row[4]) or None,
            "ubo": clean(row[10]) or None,
            "controlPath": clean(row[12]) or None,
            "equitySource": "企百科穿透（非上市）",
        }
        stats["privateEquityMatched"] += 1
    return enrich


def read_trade(
    index: CompanyIndex, stats: dict
) -> tuple[list[dict], dict[str, dict[str, list]]]:
    """客户 / 供应商明细。链内成边，链外按金额取前 N 条进详情分片。"""
    edges: list[dict] = []
    outside: dict[str, dict[str, dict]] = defaultdict(dict)
    specs = [
        ("1-客户关系明细", "customer", "客户"),
        ("2-供应商关系明细", "supplier", "供应商"),
    ]
    for sheet, side, side_label in specs:
        bucket = stats[side]
        for row in iter_sheet(SOURCE_TRADE, sheet, 1):
            subject_name, stock, party = clean(row[1]), row[2], clean(row[5])
            if not subject_name or not party:
                continue
            subject, how = index.find(subject_name, stock)
            bucket["rows"] += 1
            if not subject:
                bucket["unmatched"] += 1
                continue
            bucket["matched"] += 1
            amount = as_num(row[9])
            share = as_num(row[10])
            date = clean(row[13]) or None
            year = None
            if date and re.match(r"^\d{4}", date):
                year = int(date[:4])
            counterpart, party_how = index.find(party, None)
            if counterpart:
                bucket["inChain"] += 1
                # 统一成「供应」方向：from 是卖方、to 是买方。
                from_name, to_name = (
                    (subject["name"], counterpart["name"])
                    if side == "customer"
                    else (counterpart["name"], subject["name"])
                )
                from_key, to_key = (
                    (subject["keyValue"], counterpart["keyValue"])
                    if side == "customer"
                    else (counterpart["keyValue"], subject["keyValue"])
                )
                edges.append(
                    {
                        "from": from_name,
                        "to": to_name,
                        "fromKey": from_key,
                        "toKey": to_key,
                        "relationType": "供应",
                        "depth": 1,
                        "scope": "in-chain",
                        "tradeSide": side,
                        "strength": "强" if share else "中",
                        "amount": amount,
                        "sharePct": share,
                        "relYear": year,
                        "relDate": date,
                        "sourceTable": sheet,
                        "source": clean(row[14]) or "企百科",
                        "basis": (
                            f"{subject['name']} 年报/公告披露的{side_label}"
                            f"：{party}"
                            + (f"，金额 {amount:,.2f} 万元" if amount else "")
                            + (f"，占总额 {share}%" if share else "")
                        ),
                        "match": party_how,
                    }
                )
            else:
                bucket["outside"] += 1
                key = subject["keyValue"]
                dedupe = (party, side)
                record = outside[key].get(dedupe)
                if record:
                    record["amount"] = (record["amount"] or 0) + (amount or 0)
                    record["count"] += 1
                    if date and (not record["lastDate"] or date > record["lastDate"]):
                        record["lastDate"] = date
                    if share and (record["sharePct"] is None or share > record["sharePct"]):
                        record["sharePct"] = share
                else:
                    outside[key][dedupe] = {
                        "name": party,
                        "amount": amount,
                        "sharePct": share,
                        "count": 1,
                        "lastDate": date,
                        "year": year,
                        "status": clean(row[7]) or None,
                        "enterpriseType": clean(row[8]) or None,
                        "source": clean(row[14]) or "企百科",
                        "note": clean(row[11]) or None,
                    }
    return edges, outside


def build_group_edges(index: CompanyIndex, stats: dict) -> list[dict]:
    """按实控人归集生成集团内两两关系（比 sheet 的「成员前 6 家」更完整）。"""
    groups: dict[str, list[dict]] = defaultdict(list)
    for company in index.companies:
        controller = (company.get("controller") or "").strip()
        if not controller or controller in {"无实际控制人", "未取", "不适用", "-"}:
            continue
        if controller.startswith("自然人"):
            continue
        groups[controller].append(company)
    edges: list[dict] = []
    for controller, members in groups.items():
        if len(members) < 2:
            continue
        stats["groups"] += 1
        stats["groupMembers"] += len(members)
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                a, b = members[i], members[j]
                if a["keyValue"] == b["keyValue"]:
                    continue
                edges.append(
                    {
                        "from": a["name"],
                        "to": b["name"],
                        "fromKey": a["keyValue"],
                        "toKey": b["keyValue"],
                        "relationType": "同一集团",
                        "depth": 2,
                        "scope": "in-chain",
                        "strength": "中",
                        "sourceTable": "3-实控人集团归集（按实控人重建）",
                        "basis": f"同受「{controller}」控制（集团归集口径，用于集团授信归口）",
                        "groupKey": controller,
                    }
                )
    return edges


# ---------------------------------------------------------------- 汇总与去重
def merge_edges(edges: list[dict], stats: dict) -> list[dict]:
    """同一对企业的同类关系合并：金额求和、占比取最大、日期取最近。"""
    merged: dict[str, dict] = {}
    for edge in edges:
        a = edge["fromKey"] or edge["from"]
        b = edge["toKey"] or edge["to"]
        # 集团 / 同实控人是无向关系：A→B 与 B→A 是同一条，按排序后的键合并。
        if edge["relationType"] in {"同一集团", "同一实控人"}:
            a, b = sorted([a, b])
        key = rel_id(a, b, edge["relationType"], edge.get("tradeSide") or "")
        existing = merged.get(key)
        if not existing:
            merged[key] = {
                **edge,
                "id": key,
                "amount": edge.get("amount"),
                "sharePct": edge.get("sharePct"),
                "recordCount": 1,
            }
            continue
        existing["recordCount"] += 1
        if edge.get("amount"):
            existing["amount"] = (existing.get("amount") or 0) + edge["amount"]
        if edge.get("sharePct") and (existing.get("sharePct") or 0) < edge["sharePct"]:
            existing["sharePct"] = edge["sharePct"]
        if edge.get("relDate") and (not existing.get("relDate") or edge["relDate"] > existing["relDate"]):
            existing["relDate"] = edge["relDate"]
            existing["relYear"] = edge.get("relYear")
        if edge.get("scope") == "in-chain":
            existing["scope"] = "in-chain"
    stats["edgesBeforeMerge"] = len(edges)
    stats["edgesAfterMerge"] = len(merged)
    return sorted(
        merged.values(),
        key=lambda item: (
            0 if item.get("scope") == "in-chain" else 1,
            item["relationType"],
            -(item.get("amount") or 0),
        ),
    )


def trim_outside(outside: dict[str, dict[str, dict]], stats: dict) -> dict[str, dict]:
    result: dict[str, dict] = {}
    global_names: set[str] = set()
    upstream_names: set[str] = set()  # 供应商侧：算力企业向其采购
    downstream_names: set[str] = set()  # 客户侧：算力企业向其销售
    for key, pairs in outside.items():
        customers = [v for (name, side), v in pairs.items() if side == "customer"]
        suppliers = [v for (name, side), v in pairs.items() if side == "supplier"]
        for items in (customers, suppliers):
            items.sort(key=lambda item: (item["amount"] is None, -(item["amount"] or 0)))
        for item in customers:
            global_names.add(item["name"])
            downstream_names.add(item["name"])
        for item in suppliers:
            global_names.add(item["name"])
            upstream_names.add(item["name"])
        stats["outsideCounterparties"] += len(pairs)
        result[key] = {
            "customers": customers[:OUTSIDE_TOP_N],
            "suppliers": suppliers[:OUTSIDE_TOP_N],
            "customerTotal": len(customers),
            "supplierTotal": len(suppliers),
            "customerAmount": round(sum(i["amount"] or 0 for i in customers), 2),
            "supplierAmount": round(sum(i["amount"] or 0 for i in suppliers), 2),
        }
        stats["outsideKept"] += min(len(customers), OUTSIDE_TOP_N) + min(
            len(suppliers), OUTSIDE_TOP_N
        )
    stats["outsideUniqueNames"] = len(global_names)
    stats["outsideUpstream"] = len(upstream_names)
    stats["outsideDownstream"] = len(downstream_names)
    return result


# ---------------------------------------------------------------- 落盘
def backup(path: Path) -> None:
    if path.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(path, path.with_name(f"{path.stem}.bak-{stamp}{path.suffix}"))


def write_db(relations: list[dict]) -> dict:
    conn = connect()
    try:
        # 老库补列（schema 里的 if not exists 不会给已有表加列）。
        existing_cols = {row[1] for row in conn.execute("pragma table_info(relation)")}
        for column, ddl in {
            "strength": "text",
            "scope": "text",
            "trade_side": "text",
            "amount": "real",
            "share_pct": "real",
            "rel_year": "integer",
            "rel_date": "text",
            "source_table": "text",
        }.items():
            if column not in existing_cols:
                conn.execute(f"alter table relation add column {column} {ddl}")

        conn.execute("delete from relation where industry_code = ?", (INDUSTRY_CODE,))
        rows = [
            (
                INDUSTRY_CODE,
                edge.get("fromKey"),
                edge.get("toKey"),
                edge["from"],
                edge["to"],
                edge["relationType"],
                {"强": 0.9, "中": 0.7, "弱": 0.5}.get(edge.get("strength"), 0.6),
                None,
                edge.get("basis"),
                edge.get("strength"),
                edge.get("scope"),
                edge.get("tradeSide"),
                edge.get("amount"),
                edge.get("sharePct"),
                edge.get("relYear"),
                edge.get("relDate"),
                edge.get("sourceTable"),
            )
            for edge in relations
        ]
        conn.executemany(
            """insert into relation
               (industry_code, from_key, to_key, from_name, to_name, rel_type, confidence,
                evidence_id, source_note, strength, scope, trade_side, amount, share_pct,
                rel_year, rel_date, source_table)
               values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            rows,
        )
        conn.commit()
        return {"written": len(rows)}
    finally:
        conn.close()


def compact_edge(edge: dict) -> dict:
    """只保留前端契约 + 展示需要的字段，去掉匹配中间态（match / recordCount / groupKey）。"""
    keys = (
        "id", "from", "to", "fromKey", "toKey", "relationType", "depth",
        "strength", "scope", "tradeSide", "amount", "sharePct", "relYear",
        "relDate", "source", "sourceTable", "basis",
    )
    return {k: edge[k] for k in keys if edge.get(k) not in (None, "", 0)}


def build_relations_step(
    companies: list[dict], relations: list[dict], stats: dict
) -> dict:
    """补齐流程页第 4 步「关系与图谱」卡片（对齐储能链 step4 的字段契约）。"""
    in_chain = [e for e in relations if e.get("scope") == "in-chain"]
    supply_n = sum(1 for e in in_chain if e["relationType"] == "供应")
    equity_n = sum(1 for e in in_chain if e["relationType"] != "供应")
    involved = {e.get("fromKey") for e in in_chain} | {e.get("toKey") for e in in_chain}
    involved.discard(None)
    total_n = len(companies)
    controller_n = sum(1 for c in companies if c.get("controller"))
    holders_n = sum(1 for c in companies if c.get("shareholders"))
    legal_n = sum(1 for c in companies if c.get("legalPerson"))
    cr_n = sum(1 for c in companies if c.get("customerCr5") is not None)
    trade_n = sum(
        1 for c in companies if c["keyValue"] in (stats.get("tradeKeys") or set())
    )

    def coverage(full: int, partial: int) -> dict:
        return {"full": full, "partial": partial, "missing": max(total_n - full - partial, 0)}

    return {
        "stats": {
            "total": len(in_chain),
            "supply": supply_n,
            "equity": equity_n,
            "companies": len(involved),
            "profiles": holders_n,
            "external": stats.get("outsideUniqueNames", 0),
            "externalUpstream": stats.get("outsideUpstream", 0),
            "externalDownstream": stats.get("outsideDownstream", 0),
        },
        "coverage": [
            {
                "key": "股权穿透",
                **coverage(controller_n, max(holders_n - controller_n, 0)),
            },
            {"key": "关键人", **coverage(legal_n, 0)},
            {"key": "供销关系", **coverage(trade_n, max(cr_n - trade_n, 0))},
            {"key": "关键人偏好", **coverage(0, 0)},
        ],
        "dimensions": [
            {"key": "equity", "label": "股权穿透", "note": "实际控制人 · 第一大股东 · 前十大股东"},
            {"key": "keyPersons", "label": "关键人", "note": "法定代表人（东财F10）"},
            {"key": "supplyChain", "label": "供销关系", "note": "客户 / 供应商明细（企百科）· 年报 CR5 集中度"},
            {"key": "preferences", "label": "关键人偏好", "note": "暂未采集，如实留白"},
            {"key": "external", "label": "链外关键配套", "note": "被算力企业点名但不在清单内的交易对手"},
        ],
        "detail": (
            f"以企百科客户 / 供应商明细（招投标 + 公开披露）与股权穿透为依据。关系边只保留两端"
            f"都在算力链 {total_n:,} 家在链主体之内的关系，当前识别 {len(in_chain):,} 条"
            f"（供销 {supply_n:,} · 股权与集团 {equity_n}），覆盖 {len(involved)} 家企业；"
            f"被点名但不在链内的交易对手另有 {stats.get('outsideUniqueNames', 0):,} 个，"
            f"在企业详情页按需展示，不进入链上关系图。"
        ),
    }


def write_outputs(
    companies: list[dict],
    enrich: dict[str, dict],
    holders: dict[str, list],
    relations: list[dict],
    outside: dict[str, dict],
    report: dict,
    run_stats: dict,
) -> None:
    # 1) 公司分片：写入实控人 / 股东 / 集中度字段
    for company in companies:
        key = company["keyValue"]
        patch = dict(enrich.get(key) or {})
        if key in holders:
            patch["shareholders"] = holders[key]
            patch["shareholderCount"] = patch.get("shareholderCount") or len(holders[key])
        if patch:
            patch.setdefault("equitySource", "股权穿透总表（东财F10 / 企百科）")
            company.update({k: v for k, v in patch.items() if v is not None})
        company["relationCount"] = 0

    chain_edges = [edge for edge in relations if edge.get("scope") == "in-chain"]
    counts_by_key: Counter = Counter()
    for edge in chain_edges:
        if edge.get("fromKey"):
            counts_by_key[edge["fromKey"]] += 1
        if edge.get("toKey"):
            counts_by_key[edge["toKey"]] += 1
    for company in companies:
        company["relationCount"] = counts_by_key.get(company["keyValue"], 0)

    shard = json.loads(OUT_SHARD.read_text(encoding="utf-8"))
    shard["companies"] = companies
    shard["counts"]["relationCount"] = len(chain_edges)
    shard["counts"]["relationTypes"] = dict(Counter(e["relationType"] for e in chain_edges))
    shard["counts"]["companiesWithRelation"] = len(counts_by_key)
    shard["relations"] = chain_edges
    shard["relationsGeneratedAt"] = NOW()
    shard["relationSources"] = {
        "股权穿透": "算力产业链-股权穿透与关联方-初版.xlsx",
        "客户与供应商": "算力产业链-客户供应商关系-企百科.xlsx",
        "口径": "两端均在算力链在链主体内的关系进 relations；对端为链外主体的交易明细进 compute-relations.json，按金额取前 30 条。",
    }
    backup(OUT_SHARD)
    OUT_SHARD.write_text(
        json.dumps(shard, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    # 2) 链视图：合并关系并重算统计
    chain = json.loads(OUT_CHAIN.read_text(encoding="utf-8"))
    kept = [r for r in (chain.get("relations") or []) if not str(r.get("id", "")).startswith("rel-cp-")]
    chain["relations"] = kept + [compact_edge(e) for e in chain_edges]
    stats = chain.setdefault("stats", {})
    stats["relationTypes"] = dict(Counter(e["relationType"] for e in chain["relations"]))
    stats["relations"] = len(chain["relations"])
    stats["relationCompanies"] = len(
        {e.get("fromKey") or e["from"] for e in chain["relations"]}
        | {e.get("toKey") or e["to"] for e in chain["relations"]}
    )
    stats["relationsInChain"] = len(chain_edges)
    stats["relationsNote"] = (
        "关系口径：股权（母子公司/前十大股东）、同一集团（实控人归集）、供应（客户/供应商交易）；"
        "仅两端都在算力链在链主体内的关系进入图谱，链外交易对手在详情页按需加载。"
    )
    # 流程页第 4 步卡片：覆盖度 / 统计 / 文案（与储能链 step4 同构）
    for step in chain.get("steps") or []:
        if step.get("id") == "relations":
            patch = build_relations_step(companies, chain["relations"], run_stats)
            step.update(patch)
            break
    backup(OUT_CHAIN)
    # 紧凑写盘：链文件含 5 个一级环节 + 1,764 家全量副本，缩进会让体积翻近一倍。
    OUT_CHAIN.write_text(
        json.dumps(chain, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    # 3) 关系明细分片（详情页按需加载）
    payload = {
        "generatedAt": NOW(),
        "industry": INDUSTRY_LABEL,
        "industryCode": INDUSTRY_CODE,
        "keyField": "keyValue（统一社会信用代码；缺码为 pending:CP:*）",
        "coverage": report["coverage"],
        "byCompany": {},
    }
    for company in companies:
        key = company["keyValue"]
        detail = {
            "name": company["name"],
            "creditCode": company.get("creditCode") or None,
            "controller": company.get("controller"),
            "controllerType": company.get("controllerType"),
            "controllerStake": company.get("controllerStake"),
            "controlDepth": company.get("controlDepth"),
            "topHolder": company.get("topHolder"),
            "topHolderStake": company.get("topHolderStake"),
            "cr10": company.get("cr10"),
            "shareholderCount": company.get("shareholderCount"),
            "shareholders": company.get("shareholders") or [],
            "customerCr5": company.get("customerCr5"),
            "supplierCr5": company.get("supplierCr5"),
            "relatedSaleShare": company.get("relatedSaleShare"),
            "relatedBuyShare": company.get("relatedBuyShare"),
            "concentrationYear": company.get("concentrationYear"),
            "concentrationFlag": company.get("concentrationFlag"),
            "customers": [],
            "suppliers": [],
            "customerTotal": 0,
            "supplierTotal": 0,
            "customerAmount": 0,
            "supplierAmount": 0,
        }
        if key in outside:
            detail.update(outside[key])
        payload["byCompany"][key] = detail
    OUT_RELATIONS.parent.mkdir(parents=True, exist_ok=True)
    backup(OUT_RELATIONS)
    OUT_RELATIONS.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )


# ---------------------------------------------------------------- 主流程
def run(apply: bool) -> None:
    shard = json.loads(OUT_SHARD.read_text(encoding="utf-8"))
    companies = shard["companies"]
    index = CompanyIndex(companies)
    print(f"在链主体 {len(companies)} 家；证券代码索引 {len(index.by_stock)}、名称索引 {len(index.by_name)}")

    stats: dict = {
        "equityMatched": 0,
        "equityOutOfChain": 0,
        "equityNoData": 0,
        "equityHitKeys": set(),
        "shareholderEdges": 0,
        "relatedBothIn": 0,
        "relatedOneSide": 0,
        "relatedEdges": 0,
        "relatedSelfLoop": 0,
        "concentrationMatched": 0,
        "concentrationUnmatched": [],
        "privateEquityMatched": 0,
        "privateEquityUnmatched": [],
        "groups": 0,
        "groupMembers": 0,
        "customer": defaultdict(int),
        "supplier": defaultdict(int),
        "outsideCounterparties": 0,
        "outsideKept": 0,
    }
    stats["customer"] = Counter()
    stats["supplier"] = Counter()

    equity = read_equity(index, stats)
    holders, holder_edges = read_shareholders(index, stats)
    related = read_related_parties(index, stats)
    concentration = read_concentration(index, stats)
    private_equity = read_private_equity(index, stats)

    # 合并非上市穿透（优先于 F10，非上市主体只有这一份数据）
    for key, patch in private_equity.items():
        current = equity.setdefault(key, {})
        for field, value in patch.items():
            if value not in (None, ""):
                current[field] = value

    for key, patch in concentration.items():
        equity.setdefault(key, {}).update(patch)

    # 先把实控人写回主体对象，集团归集才有 controller 可分组。
    for key, patch in equity.items():
        if key in index.by_key:
            index.by_key[key].update({k: v for k, v in patch.items() if v is not None})

    trade_edges, outside_raw = read_trade(index, stats)
    group_edges = build_group_edges(index, stats)

    all_edges = merge_edges(holder_edges + related + trade_edges + group_edges, stats)
    outside = trim_outside(outside_raw, stats)

    in_chain = [e for e in all_edges if e.get("scope") == "in-chain"]
    outside_edges = [e for e in all_edges if e.get("scope") != "in-chain"]
    type_counts = Counter(e["relationType"] for e in in_chain)

    trade_keys = set(outside_raw)
    trade_keys |= {e.get("fromKey") for e in trade_edges if e.get("tradeSide") == "customer"}
    trade_keys |= {e.get("toKey") for e in trade_edges if e.get("tradeSide") == "supplier"}
    trade_keys.discard(None)
    stats["tradeKeys"] = trade_keys

    equity_missing = [
        {"name": c["name"], "key": c["keyValue"]}
        for c in companies
        if c["keyValue"] not in stats["equityHitKeys"]
    ]

    report = {
        "generatedAt": NOW(),
        "industry": INDUSTRY_LABEL,
        "sources": [str(SOURCE_EQUITY), str(SOURCE_TRADE)],
        "companies": len(companies),
        "coverage": {
            "companies": len(companies),
            "equityMatched": stats["equityMatched"],
            "controllerFilled": sum(1 for c in companies if equity.get(c["keyValue"], {}).get("controller")),
            "shareholderFilled": len(holders),
            "concentrationFilled": len(concentration),
            "tradeCompanies": len(trade_keys),
            "tradeRows": stats["customer"]["rows"] + stats["supplier"]["rows"],
            "tradeMatched": stats["customer"]["matched"] + stats["supplier"]["matched"],
            "equityMissing": len(equity_missing),
        },
        "relations": {
            "inChain": len(in_chain),
            "outside": len(outside_edges),
            "byType": dict(type_counts),
            "edgesBeforeMerge": stats["edgesBeforeMerge"],
            "edgesAfterMerge": stats["edgesAfterMerge"],
            "shareholderEdges": stats["shareholderEdges"],
            "relatedPairs": stats["relatedEdges"],
            "relatedBothIn": stats["relatedBothIn"],
            "relatedOneSide": stats["relatedOneSide"],
            "groups": stats["groups"],
            "groupMembers": stats["groupMembers"],
        },
        "trade": {
            "customer": dict(stats["customer"]),
            "supplier": dict(stats["supplier"]),
        },
        "outside": {
            "counterparties": stats["outsideCounterparties"],
            "kept": stats["outsideKept"],
            "topN": OUTSIDE_TOP_N,
        },
        "unmatched": {
            "equityMissing": equity_missing[:50],
            "equityMissingCount": len(equity_missing),
            "equityOutOfChain": stats["equityOutOfChain"],
            "equityNoData": stats["equityNoData"],
            "concentration": stats["concentrationUnmatched"][:50],
            "concentrationCount": len(stats["concentrationUnmatched"]),
            "privateEquity": stats["privateEquityUnmatched"],
        },
    }

    print(f"股权穿透命中 {stats['equityMatched']} 家有实控人数据（表内另有 {stats['equityOutOfChain']} 行不属于本链）")
    print(f"本链主体缺穿透数据 {len(equity_missing)} 家")
    print(f"前十大股东覆盖 {len(holders)} 家；链内股东边 {stats['shareholderEdges']} 条")
    print(f"关联方候选 {stats['relatedEdges']} 对（两端在链内 {stats['relatedBothIn']}）")
    print(
        f"客户明细 {stats['customer']['rows']} 行 / 命中主体 {stats['customer']['matched']}；"
        f"链内 {stats['customer']['inChain']}、链外 {stats['customer']['outside']}"
    )
    print(
        f"供应商明细 {stats['supplier']['rows']} 行 / 命中主体 {stats['supplier']['matched']}；"
        f"链内 {stats['supplier']['inChain']}、链外 {stats['supplier']['outside']}"
    )
    print(f"集团归集 {stats['groups']} 组 / 成员 {stats['groupMembers']} 家")
    print(f"合并后链内关系 {len(in_chain)} 条：{dict(type_counts)}")
    print(f"链外交易对手 {stats['outsideCounterparties']} 个，详情页保留 {stats['outsideKept']} 条")

    if not apply:
        print("\n[只读] 未写入任何文件。加 --apply 落库并写前端分片。")
        return

    db_result = write_db(all_edges)
    write_outputs(companies, equity, holders, all_edges, outside, report, stats)
    report["db"] = db_result
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n已写库 {db_result['written']} 条关系；分片：{OUT_SHARD.name} / {OUT_CHAIN.name} / {OUT_RELATIONS.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="算力链企业关系入链")
    parser.add_argument("--apply", action="store_true", help="写库并写入前端分片")
    args = parser.parse_args()
    run(args.apply)


if __name__ == "__main__":
    main()
