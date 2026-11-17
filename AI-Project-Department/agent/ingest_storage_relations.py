# -*- coding: utf-8 -*-
"""储能链企业关系入链 —— 企百科客供明细 + 股权穿透图谱 -> 链上关系边 + 详情分片。

源：
    G:/对公经营智能化项目/储能产业链/储能产业链-客户供应商关系-2026-10-21.xlsx
    G:/对公经营智能化项目/储能产业链/储能产业链-企业关系图谱-2026-10-21.xlsx

用法：
    python agent/ingest_storage_relations.py             # 只读解析 + 出报告
    python agent/ingest_storage_relations.py --apply     # 写库 + 更新链/分片（先备份）

产出：
    - storage-chain.json：链内关系边（供应 / 股权 / 同一实控人）+ step4 统计 + 公司富字段
    - companies-storage.json：实控人 / 股东 / 关系数回写
    - storage-relations.json：每家企业的客户/供应商明细（详情页按需加载）
    - SQLite relation 表（industry_code = 'ES'）

方向契约（与算力链一致）：供应边 from=供方（卖方）-> to=需方（买方）。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

AGENT_DIR = Path(__file__).resolve().parent
ROOT = AGENT_DIR.parent
sys.path.insert(0, str(AGENT_DIR))

from ingest_compute import DB_FILE, INDUSTRY_LABEL, SCHEMA_FILE, clean, norm_name  # noqa: E402
from ingest_storage import INDUSTRY_CODE  # noqa: E402

SOURCE_TRADE = Path("G:/对公经营智能化项目/储能产业链/储能产业链-客户供应商关系-2026-10-21.xlsx")
SOURCE_EQUITY = Path("G:/对公经营智能化项目/储能产业链/储能产业链-企业关系图谱-2026-10-21.xlsx")

INDUSTRIES = ROOT / "frontend" / "public" / "data" / "industries"
OUT_SHARD = INDUSTRIES / "companies-storage.json"
OUT_CHAIN = INDUSTRIES / "storage-chain.json"
OUT_RELATIONS = INDUSTRIES / "storage-relations.json"
REPORT_FILE = AGENT_DIR / "data" / "storage-relations-report.json"

# 链外交易对手在详情页的保留条数（按金额降序）。
TOP_N = 30

NOW = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")  # noqa: E731


def sha1s(text: str, length: int = 10) -> str:
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
    text = clean(value).replace("（", "(").replace("）", ")")
    text = re.sub(r"\s+", "", text)
    return text


def normalize_stock(value) -> str:
    text = clean(value).upper().replace(".0", "")
    digits = re.sub(r"[^0-9]", "", text)
    if digits:
        return digits
    return text


def rel_id(*parts: str) -> str:
    return "rel-es-" + sha1s("|".join(parts))


def iter_sheet(path: Path, sheet: str, header_row: int):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    worksheet = workbook[sheet]
    for row in worksheet.iter_rows(min_row=header_row + 1, values_only=True):
        if row and any(cell not in (None, "") for cell in row):
            yield row
    workbook.close()


def backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = path.with_suffix(f".bak-{stamp}.json")
    if path.exists():
        target.write_bytes(path.read_bytes())
    return target


# ---------------------------------------------------------------- 主体索引
class CompanyIndex:
    """两级查找：证券代码精确 -> 名称（含 matchKey 字号兜底）。"""

    def __init__(self, companies: list[dict]):
        self.companies = companies
        self.by_key = {c["keyValue"]: c for c in companies}
        self.by_stock: dict[str, dict] = {}
        self.by_name: dict[str, dict] = {}
        self.by_match: dict[str, dict] = {}
        for company in companies:
            stock = normalize_stock(company.get("stockCode"))
            if stock:
                self.by_stock.setdefault(stock, company)
            self.by_name.setdefault(norm_company_name(company["name"]), company)
            for alias in company.get("aliases") or []:
                self.by_name.setdefault(norm_company_name(alias), company)
            mk = (company.get("normalizedName") or "") and self._stripped(company["name"])
            if mk:
                self.by_match.setdefault(mk, company)

    @staticmethod
    def _stripped(name: str) -> str:
        text = norm_company_name(name)
        for suffix in ("股份有限公司", "有限责任公司", "有限公司", "集团公司"):
            if text.endswith(suffix) and len(text) > len(suffix) + 1:
                return text[: -len(suffix)]
        return text

    def find(self, name=None, stock=None) -> tuple[dict | None, str]:
        stock_key = normalize_stock(stock)
        if stock_key and stock_key in self.by_stock:
            return self.by_stock[stock_key], "stock_code"
        name_key = norm_company_name(name)
        if name_key and name_key in self.by_name:
            return self.by_name[name_key], "name"
        # 字号兜底：剥掉组织形式后互相包含
        if name_key:
            stripped = self._stripped(name or "")
            if stripped and len(stripped) >= 4:
                for key, company in self.by_match.items():
                    if stripped in key or key in stripped:
                        return company, "name_fuzzy"
        return None, "unmatched"


# ---------------------------------------------------------------- 股权（关系图谱文件）
def read_controller(index: CompanyIndex, stats: dict) -> dict[str, dict]:
    """02_实控人：疑似实际控制人 / 性质 / 持股比例（写公司字段，不产生边）。"""
    enrich: dict[str, dict] = {}
    for row in iter_sheet(SOURCE_EQUITY, "02_实控人", 3):
        name, stock = row[0], row[2]
        company, how = index.find(name, stock)
        if not company:
            stats["controllerOutOfChain"] += 1
            continue
        controller = clean(row[6])
        if not controller:
            stats["controllerNoData"] += 1
            continue
        enrich[company["keyValue"]] = {
            "controller": controller,
            "controllerType": clean(row[7]) or None,
            "controllerStake": as_num(row[8]),
            "equityMatch": how,
        }
        stats["controllerMatched"] += 1
    return enrich


def read_shareholders(index: CompanyIndex, stats: dict) -> tuple[dict[str, list], list[dict]]:
    """01_股权穿透_直接股东：十大股东名单 + 链内股东 -> 股权边。"""
    holders: dict[str, list] = defaultdict(list)
    edges: list[dict] = []
    for row in iter_sheet(SOURCE_EQUITY, "01_股权穿透_直接股东", 3):
        target_name, stock = row[0], row[2]
        company, how = index.find(target_name, stock)
        if not company:
            stats["shareholderTargetUnmatched"] += 1
            continue
        holder_name = clean(row[4])
        pct = as_num(row[8])
        if not holder_name:
            continue
        holders[company["keyValue"]].append({
            "name": holder_name,
            "pct": pct,
            "type": clean(row[9]) or None,
            "nature": clean(row[5]) or None,
            "rank": as_num(row[3]),
        })
        holder_company, holder_how = index.find(holder_name, None)
        if holder_company and holder_company["keyValue"] != company["keyValue"]:
            edges.append({
                "from": holder_company["name"],
                "to": company["name"],
                "fromKey": holder_company["keyValue"],
                "toKey": company["keyValue"],
                "relationType": "股权",
                "depth": 1,
                "strength": "强",
                "scope": "in-chain",
                "sharePct": pct,
                "sourceTable": "01_股权穿透_直接股东",
                "basis": f"{holder_name} 持有 {company['name']} {pct if pct is not None else '?'}% 股份",
            })
            stats["shareholderEdges"] += 1
        elif holder_how != "unmatched" and holder_company and holder_company["keyValue"] == company["keyValue"]:
            stats["shareholderSelfLoop"] += 1
    for key, items in holders.items():
        items.sort(key=lambda item: (item["pct"] is None, -(item["pct"] or 0)))
        holders[key] = items[:10]
    stats["shareholderFilled"] = len(holders)
    return holders, edges


def read_chain_holdings(index: CompanyIndex, stats: dict) -> list[dict]:
    """05_链内持股：股东本身是储能清单内企业的股权关系（直接给全称，精确匹配）。"""
    edges: list[dict] = []
    for row in iter_sheet(SOURCE_EQUITY, "05_链内持股", 3):
        holder_name, target_name = clean(row[0]), clean(row[1])
        if not holder_name or not target_name:
            continue
        holder_company, how_a = index.find(holder_name, None)
        target_company, how_b = index.find(target_name, None)
        if not holder_company or not target_company:
            stats["holdingsUnmatched"].append(f"{holder_name} -> {target_name}")
            continue
        if holder_company["keyValue"] == target_company["keyValue"]:
            stats["holdingsSelfLoop"] += 1
            continue
        pct = as_num(row[2])
        edges.append({
            "from": holder_company["name"],
            "to": target_company["name"],
            "fromKey": holder_company["keyValue"],
            "toKey": target_company["keyValue"],
            "relationType": "股权",
            "depth": 1,
            "strength": "强",
            "scope": "in-chain",
            "sharePct": pct,
            "relDate": clean(row[6]) or None,
            "sourceTable": "05_链内持股",
            "basis": clean(row[7]) or f"{holder_name} 持有 {target_name} {pct if pct is not None else '?'}% 股份",
        })
        stats["holdingsEdges"] += 1
    return edges


def read_clusters(index: CompanyIndex, stats: dict) -> list[dict]:
    """04_关联方聚类：只取「强（集团）」簇连「同一实控人」边；弱（行政归属）不连，避免噪声。"""
    edges: list[dict] = []
    for row in iter_sheet(SOURCE_EQUITY, "04_关联方聚类", 3):
        cluster_id, cluster_type = clean(row[0]), clean(row[1])
        strength = clean(row[2])
        core = clean(row[3])
        members_raw = clean(row[5])
        if not members_raw:
            continue
        if "弱" in strength:
            stats["clusterWeakSkipped"] += 1
            continue
        members = [item.strip() for item in re.split(r"[、；;,，]", members_raw) if item.strip()]
        resolved: list[dict] = []
        for name in members:
            company, _ = index.find(name, None)
            if company and all(c["keyValue"] != company["keyValue"] for c in resolved):
                resolved.append(company)
        if len(resolved) < 2:
            stats["clusterTooFew"] += 1
            continue
        for i in range(len(resolved)):
            for j in range(i + 1, len(resolved)):
                a, b = resolved[i], resolved[j]
                edges.append({
                    "from": a["name"],
                    "to": b["name"],
                    "fromKey": a["keyValue"],
                    "toKey": b["keyValue"],
                    "relationType": "同一实控人",
                    "depth": 1,
                    "strength": "强",
                    "scope": "in-chain",
                    "sourceTable": "04_关联方聚类",
                    "basis": f"{cluster_id}（{cluster_type}·{core}）：{clean(row[6]) or '同一实控人归集'}",
                })
                stats["clusterEdges"] += 1
    return edges


def read_summary_fallback(index: CompanyIndex, stats: dict) -> dict[str, dict]:
    """09_企业关系摘要：实控人/第一大股东兜底（02 实控人表缺行时补）。"""
    enrich: dict[str, dict] = {}
    for row in iter_sheet(SOURCE_EQUITY, "09_企业关系摘要", 3):
        company, _ = index.find(row[0], row[3])
        if not company:
            continue
        key = company["keyValue"]
        enrich[key] = {
            "topHolder": clean(row[7]) or None,
            "topHolderStake": as_num(row[8]),
            "keyPersonCount": as_num(row[10]),
            "clusterLabel": clean(row[12]) or None,
        }
        stats["summaryMatched"] += 1
    return enrich


# ---------------------------------------------------------------- 交易（客供文件）
def read_chain_supply(index: CompanyIndex, stats: dict) -> list[dict]:
    """04_链内关系：池内企业之间的有向边（供方 -> 需方）。"""
    edges: list[dict] = []
    for row in iter_sheet(SOURCE_TRADE, "04_链内关系", 3):
        supplier_name, buyer_name = clean(row[0]), clean(row[4])
        if not supplier_name or not buyer_name:
            continue
        supplier, how_a = index.find(supplier_name, None)
        buyer, how_b = index.find(buyer_name, None)
        if not supplier or not buyer:
            stats["supplyUnmatched"].append(f"{supplier_name} -> {buyer_name}")
            continue
        if supplier["keyValue"] == buyer["keyValue"]:
            stats["supplySelfLoop"] += 1
            continue
        evidence = clean(row[12])
        count = as_num(row[10])
        edges.append({
            "from": supplier["name"],
            "to": buyer["name"],
            "fromKey": supplier["keyValue"],
            "toKey": buyer["keyValue"],
            "relationType": "供应",
            "depth": 1,
            "strength": clean(row[11]) or "中",
            "scope": "in-chain",
            "tradeSide": "customer",
            "amount": as_num(row[8]),
            "count": as_num(row[9]),
            "evidenceCount": count,
            "source": evidence or "企百科",
            "sourceTable": "04_链内关系",
            "basis": f"{supplier_name} → {buyer_name}（{evidence or '企百科披露'}，{int(count) if count else '?'} 条证据）",
            "matchA": how_a,
            "matchB": how_b,
        })
        stats["supplyRows"] += 1
    return edges


def read_trade_detail(index: CompanyIndex, stats: dict) -> tuple[dict, dict, dict]:
    """02_客户明细 / 03_供应商明细：逐家企业的客户/供应商聚合（金额降序 top N）。"""
    def collect(sheet: str, side: str) -> tuple[dict, dict]:
        grouped: dict[str, dict] = defaultdict(lambda: defaultdict(dict))
        for row in iter_sheet(SOURCE_TRADE, sheet, 3):
            stock = row[0]
            company, _ = index.find(None, stock)
            if not company:
                stats[f"{side}TargetUnmatched"] += 1
                continue
            name = clean(row[7])
            if not name:
                continue
            entry = grouped[company["keyValue"]][name]
            entry["name"] = name
            entry["amount"] = (entry.get("amount") or 0) + (as_num(row[9]) or 0)
            entry["count"] = max(entry.get("count") or 0, as_num(row[12]) or 0)
            last = clean(row[11])
            if last and last > (entry.get("lastDate") or ""):
                entry["lastDate"] = last
            source = clean(row[13])
            if source:
                entry.setdefault("sources", set())
                entry["sources"].add(source)  # type: ignore[union-attr]
            entry["entid"] = clean(row[8]) or entry.get("entid")
        return grouped

    customers = collect("02_客户明细", "customer")
    suppliers = collect("03_供应商明细", "supplier")

    # 池外对手的工商状态（07_池外上下游）按名称回填
    registry: dict[str, dict] = {}
    for row in iter_sheet(SOURCE_TRADE, "07_池外上下游", 3):
        name = clean(row[0])
        if name:
            registry[name] = {
                "status": clean(row[10]) or None,
                "enterpriseType": clean(row[11]) or None,
            }

    def to_lists(grouped: dict, side: str) -> tuple[dict, dict]:
        per_company: dict[str, list] = {}
        totals: dict[str, dict] = {}
        for key, parties in grouped.items():
            items = []
            for name, entry in parties.items():
                reg = registry.get(name) or {}
                items.append({
                    "name": name,
                    "amount": entry.get("amount") or 0,
                    "count": entry.get("count"),
                    "lastDate": entry.get("lastDate"),
                    "source": "、".join(sorted(entry.get("sources") or [])) or None,
                    "status": reg.get("status"),
                    "enterpriseType": reg.get("enterpriseType"),
                })
            items.sort(key=lambda item: (-(item["amount"] or 0), item["name"]))
            totals[key] = {
                f"{side}Total": len(parties),
                f"{side}Amount": round(sum(entry["amount"] or 0 for entry in parties.values()), 2),
            }
            per_company[key] = items[:TOP_N]
        return per_company, totals

    customer_list, customer_totals = to_lists(customers, "customer")
    supplier_list, supplier_totals = to_lists(suppliers, "supplier")

    # 链外对手统计（按企业名称/别名判断是否在链内）
    chain_names = {c["name"] for c in index.companies}
    chain_names |= {alias for c in index.companies for alias in (c.get("aliases") or [])}
    outside_names: set[str] = set()
    outside_upstream: set[str] = set()
    outside_downstream: set[str] = set()
    for parties in customers.values():
        for name in parties:
            if name not in chain_names:
                outside_names.add(name)
                outside_downstream.add(name)  # 客户 = 需方 = 链的下游交易对手
    for parties in suppliers.values():
        for name in parties:
            if name not in chain_names:
                outside_names.add(name)
                outside_upstream.add(name)
    stats["outsideUniqueNames"] = len(outside_names)
    stats["outsideUpstream"] = len(outside_upstream)
    stats["outsideDownstream"] = len(outside_downstream)
    return customer_list, supplier_list, {"customer": customer_totals, "supplier": supplier_totals}


# ---------------------------------------------------------------- 边合并
def merge_edges(edges: list[dict], stats: dict) -> list[dict]:
    """无向去重：同一对企业 + 同一关系类型只保留信息最全的一条（金额求和 / 占比取最大）。"""
    merged: dict[tuple, dict] = {}
    for edge in edges:
        pair = tuple(sorted([edge.get("fromKey") or edge["from"], edge.get("toKey") or edge["to"]]))
        key = (pair, edge["relationType"])
        if key not in merged:
            merged[key] = dict(edge)
            continue
        old = merged[key]
        for field in ("amount",):
            old[field] = (old.get(field) or 0) + (edge.get(field) or 0)
        for field in ("sharePct", "evidenceCount", "count"):
            values = [old.get(field), edge.get(field)]
            values = [v for v in values if v is not None]
            if values:
                old[field] = max(values)
        for field in ("basis", "source", "relDate"):
            if edge.get(field) and not old.get(field):
                old[field] = edge[field]
        stats["mergedDuplicateEdges"] += 1
    out = list(merged.values())
    out.sort(key=lambda e: (e["relationType"], -(e.get("amount") or 0), e["from"], e["to"]))
    return out


# ---------------------------------------------------------------- 写库
def connect() -> sqlite3.Connection:
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    with SCHEMA_FILE.open(encoding="utf-8") as handle:
        conn.executescript(handle.read())
    return conn


def write_db(relations: list[dict]) -> dict:
    conn = connect()
    try:
        existing_cols = {row[1] for row in conn.execute("pragma table_info(relation)")}
        for column, ddl in {
            "strength": "text", "scope": "text", "trade_side": "text",
            "amount": "real", "share_pct": "real", "rel_year": "integer",
            "rel_date": "text", "source_table": "text",
        }.items():
            if column not in existing_cols:
                conn.execute(f"alter table relation add column {column} {ddl}")
        conn.execute("delete from relation where industry_code = ?", (INDUSTRY_CODE,))
        rows = [
            (
                INDUSTRY_CODE,
                edge.get("fromKey"), edge.get("toKey"), edge["from"], edge["to"],
                edge["relationType"],
                {"强": 0.9, "中": 0.7, "弱": 0.5}.get(edge.get("strength"), 0.6),
                None, edge.get("basis"), edge.get("strength"), edge.get("scope"),
                edge.get("tradeSide"), edge.get("amount"), edge.get("sharePct"),
                None, edge.get("relDate"), edge.get("sourceTable"),
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
    keys = (
        "id", "from", "to", "fromKey", "toKey", "relationType", "depth",
        "strength", "scope", "tradeSide", "amount", "sharePct", "relYear",
        "relDate", "source", "sourceTable", "basis",
    )
    return {k: edge[k] for k in keys if edge.get(k) not in (None, "", 0)}


def build_relations_step(companies: list[dict], relations: list[dict], stats: dict) -> dict:
    in_chain = [e for e in relations if e.get("scope") == "in-chain"]
    supply_n = sum(1 for e in in_chain if e["relationType"] == "供应")
    equity_n = sum(1 for e in in_chain if e["relationType"] != "供应")
    involved = {e.get("fromKey") for e in in_chain} | {e.get("toKey") for e in in_chain}
    involved.discard(None)
    total_n = len(companies)
    controller_n = sum(1 for c in companies if c.get("controller"))
    holders_n = sum(1 for c in companies if c.get("shareholders"))
    trade_n = sum(1 for c in companies if c["keyValue"] in (stats.get("tradeKeys") or set()))

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
            {"key": "股权穿透", **coverage(controller_n, max(holders_n - controller_n, 0))},
            {"key": "关键人", **coverage(sum(1 for c in companies if c.get("legalPerson")), 0)},
            {"key": "供销关系", **coverage(trade_n, 0)},
            {"key": "关键人偏好", **coverage(0, 0)},
        ],
        "dimensions": [
            {"key": "equity", "label": "股权穿透", "note": "实际控制人 · 第一大股东 · 前十大股东"},
            {"key": "keyPersons", "label": "关键人", "note": "法定代表人 / 董事长（东财F10）"},
            {"key": "supplyChain", "label": "供销关系", "note": "客户 / 供应商明细（企百科：招投标 + 公开披露）"},
            {"key": "preferences", "label": "关键人偏好", "note": "暂未采集，如实留白"},
            {"key": "external", "label": "链外关键配套", "note": "被储能企业点名但不在清单内的交易对手"},
        ],
        "detail": (
            f"以企百科客户 / 供应商明细（招投标 + 公开披露）与股权穿透图谱为依据。关系边只保留两端"
            f"都在储能链 {total_n:,} 家在链主体之内的关系，当前识别 {len(in_chain):,} 条"
            f"（供销 {supply_n:,} · 股权与集团 {equity_n}），覆盖 {len(involved)} 家企业；"
            f"被点名但不在链内的交易对手另有 {stats.get('outsideUniqueNames', 0):,} 个，"
            f"在企业详情页按需展示，不进入链上关系图。"
        ),
    }


# ---------------------------------------------------------------- 主流程
def run(apply: bool) -> None:
    shard = json.loads(OUT_SHARD.read_text(encoding="utf-8"))
    companies = shard["companies"]
    index = CompanyIndex(companies)
    print(f"在链主体 {len(companies)} 家；证券代码索引 {len(index.by_stock)}、名称索引 {len(index.by_name)}")

    stats: dict = {
        "controllerMatched": 0, "controllerOutOfChain": 0, "controllerNoData": 0,
        "shareholderEdges": 0, "shareholderFilled": 0, "shareholderSelfLoop": 0,
        "shareholderTargetUnmatched": 0,
        "holdingsEdges": 0, "holdingsSelfLoop": 0, "holdingsUnmatched": [],
        "clusterEdges": 0, "clusterWeakSkipped": 0, "clusterTooFew": 0,
        "supplyRows": 0, "supplySelfLoop": 0, "supplyUnmatched": [],
        "customerTargetUnmatched": 0, "supplierTargetUnmatched": 0,
        "mergedDuplicateEdges": 0,
        "summaryMatched": 0,
        "tradeKeys": set(),
        "outsideUniqueNames": 0, "outsideUpstream": 0, "outsideDownstream": 0,
    }

    controller = read_controller(index, stats)
    holders, holder_edges = read_shareholders(index, stats)
    holdings = read_chain_holdings(index, stats)
    clusters = read_clusters(index, stats)
    summary = read_summary_fallback(index, stats)
    supply = read_chain_supply(index, stats)
    customer_list, supplier_list, totals = read_trade_detail(index, stats)
    stats["tradeKeys"] = set(customer_list) | set(supplier_list)

    all_edges = holder_edges + holdings + clusters + supply
    relations = merge_edges(all_edges, stats)
    chain_edges = [e for e in relations if e.get("scope") == "in-chain"]
    for edge in relations:
        edge.setdefault("id", rel_id(edge.get("fromKey") or edge["from"], edge.get("toKey") or edge["to"], edge["relationType"]))
    for edge in chain_edges:
        edge["id"] = rel_id(edge.get("fromKey") or edge["from"], edge.get("toKey") or edge["to"], edge["relationType"])

    report = {
        "generatedAt": NOW(),
        "sourceTrade": str(SOURCE_TRADE),
        "sourceEquity": str(SOURCE_EQUITY),
        "coverage": {
            "companies": len(companies),
            "controllerMatched": stats["controllerMatched"],
            "controllerNoData": stats["controllerNoData"],
            "shareholderFilled": stats["shareholderFilled"],
            "tradeCompanies": len(stats["tradeKeys"]),
            "customerRowsTotal": sum(v["customerTotal"] for v in totals["customer"].values()),
            "supplierRowsTotal": sum(v["supplierTotal"] for v in totals["supplier"].values()),
            "supplyRows": stats["supplyRows"],
            "holdingsEdges": stats["holdingsEdges"],
            "clusterEdges": stats["clusterEdges"],
            "clusterWeakSkipped": stats["clusterWeakSkipped"],
            "mergedDuplicateEdges": stats["mergedDuplicateEdges"],
            "inChainEdges": len(chain_edges),
            "outsideUniqueNames": stats["outsideUniqueNames"],
            "outsideUpstream": stats["outsideUpstream"],
            "outsideDownstream": stats["outsideDownstream"],
        },
        "unmatchedSupply": stats["supplyUnmatched"][:50],
        "unmatchedHoldings": stats["holdingsUnmatched"][:50],
    }

    print("=" * 74)
    print("储能链关系入链解析（只读，未改动任何数据）")
    print("=" * 74)
    print(f"实控人：匹配 {stats['controllerMatched']} 家 / 链外 {stats['controllerOutOfChain']} / 无数据 {stats['controllerNoData']}")
    print(f"十大股东：{stats['shareholderFilled']} 家有股东名单，链内股东边 {stats['shareholderEdges']} 条")
    print(f"链内持股：{stats['holdingsEdges']} 条边；关联方聚类（强）：{stats['clusterEdges']} 条边（弱簇跳过 {stats['clusterWeakSkipped']}）")
    print(f"链内供应：明细 {stats['supplyRows']} 行 -> 合并后 {sum(1 for e in chain_edges if e['relationType'] == '供应')} 条边")
    print(f"供销明细：客户企业 {len(customer_list)} 家 / 供应商企业 {len(supplier_list)} 家")
    print(f"链外对手：去重 {stats['outsideUniqueNames']} 个（上游 {stats['outsideUpstream']} / 下游 {stats['outsideDownstream']}）")
    print(f"合并重复边：{stats['mergedDuplicateEdges']} 条")
    print(f"链内关系合计：{len(chain_edges)} 条")
    if stats["supplyUnmatched"]:
        print("供应未匹配样例：")
        for item in stats["supplyUnmatched"][:10]:
            print(f"  - {item}")
    print(f"报告将存：{REPORT_FILE}")

    if not apply:
        REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print()
        print("只读模式：未写入任何文件。确认后加 --apply。")
        return

    # 1) 公司富字段回写
    for company in companies:
        key = company["keyValue"]
        patch = dict(controller.get(key) or {})
        if key in holders:
            patch["shareholders"] = holders[key]
            patch["shareholderCount"] = patch.get("shareholderCount") or len(holders[key])
            cr10 = round(sum(item["pct"] or 0 for item in holders[key]), 2)
            patch["cr10"] = cr10 if cr10 > 0 else None
        if key in summary:
            for field in ("topHolder", "topHolderStake", "keyPersonCount", "clusterLabel"):
                if patch.get(field) in (None, "") and summary[key].get(field) is not None:
                    patch[field] = summary[key][field]
        if patch:
            patch.setdefault("equitySource", "储能产业链-企业关系图谱-2026-10-21")
            company.update({k: v for k, v in patch.items() if v is not None})
        company["relationCount"] = 0
    counts_by_key: Counter = Counter()
    for edge in chain_edges:
        if edge.get("fromKey"):
            counts_by_key[edge["fromKey"]] += 1
        if edge.get("toKey"):
            counts_by_key[edge["toKey"]] += 1
    for company in companies:
        company["relationCount"] = counts_by_key.get(company["keyValue"], 0)

    # 2) 分片写回
    shard["companies"] = companies
    shard["counts"]["relationCount"] = len(chain_edges)
    shard["counts"]["relationTypes"] = dict(Counter(e["relationType"] for e in chain_edges))
    shard["counts"]["companiesWithRelation"] = len(counts_by_key)
    shard["relations"] = [compact_edge(e) for e in chain_edges]
    shard["relationsGeneratedAt"] = NOW()
    shard["relationSources"] = {
        "股权穿透": "储能产业链-企业关系图谱-2026-10-21.xlsx",
        "客户与供应商": "储能产业链-客户供应商关系-2026-10-21.xlsx",
        "口径": "两端均在储能链在链主体内的关系进 relations；对端为链外主体的交易明细进 storage-relations.json，按金额取前 30 条。",
    }
    backup(OUT_SHARD)
    OUT_SHARD.write_text(json.dumps(shard, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # 3) 链视图：关系 + step4 + stats
    chain = json.loads(OUT_CHAIN.read_text(encoding="utf-8"))
    kept = [r for r in (chain.get("relations") or []) if not str(r.get("id", "")).startswith("rel-es-")]
    chain["relations"] = kept + [compact_edge(e) for e in chain_edges]
    stats_chain = chain.setdefault("stats", {})
    stats_chain["relationTypes"] = dict(Counter(e["relationType"] for e in chain["relations"]))
    stats_chain["relations"] = len(chain["relations"])
    stats_chain["relationSupply"] = sum(1 for e in chain["relations"] if e["relationType"] == "供应")
    stats_chain["relationEquity"] = sum(1 for e in chain["relations"] if e["relationType"] != "供应")
    stats_chain["relationCompanies"] = len(
        {e.get("fromKey") or e["from"] for e in chain["relations"]}
        | {e.get("toKey") or e["to"] for e in chain["relations"]}
    )
    stats_chain["relationsInChain"] = len(chain_edges)
    stats_chain["externalMentions"] = stats["outsideUniqueNames"]
    stats_chain["externalUpstream"] = stats["outsideUpstream"]
    stats_chain["externalDownstream"] = stats["outsideDownstream"]
    stats_chain["relationsNote"] = (
        "关系口径：股权（前十大股东 / 链内持股）、同一实控人（强聚类归集）、供应（企百科客供交易）；"
        "仅两端都在储能链在链主体内的关系进入图谱，链外交易对手在详情页按需加载。"
    )
    for step in chain.get("steps") or []:
        if step.get("id") == "relations":
            step.update(build_relations_step(companies, chain["relations"], stats))
            break
    # 链内 companies 同步富字段
    by_key = {c["keyValue"]: c for c in companies}
    for i, item in enumerate(chain.get("companies") or []):
        fresh = by_key.get(item.get("keyValue"))
        if fresh:
            chain["companies"][i] = fresh
    backup(OUT_CHAIN)
    OUT_CHAIN.write_text(json.dumps(chain, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # 4) 关系明细分片（详情页按需加载）
    payload = {
        "generatedAt": NOW(),
        "industry": INDUSTRY_LABEL,
        "industryCode": INDUSTRY_CODE,
        "keyField": "keyValue（统一社会信用代码；缺码为 pending:ES:*）",
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
            "customers": customer_list.get(key) or [],
            "suppliers": supplier_list.get(key) or [],
            "customerTotal": totals["customer"].get(key, {}).get("customerTotal", 0),
            "supplierTotal": totals["supplier"].get(key, {}).get("supplierTotal", 0),
            "customerAmount": totals["customer"].get(key, {}).get("customerAmount", 0),
            "supplierAmount": totals["supplier"].get(key, {}).get("supplierAmount", 0),
        }
        payload["byCompany"][key] = detail
    backup(OUT_RELATIONS)
    OUT_RELATIONS.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # 5) SQLite
    db_result = write_db(relations)

    report["dbWritten"] = db_result["written"]
    report["fileSizeMB"] = round(OUT_RELATIONS.stat().st_size / 1024 / 1024, 2)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    print(f"已写链内关系 {len(chain_edges)} 条 -> {OUT_CHAIN.name}")
    print(f"已写关系明细 {len(payload['byCompany'])} 家 -> {OUT_RELATIONS.name}（{report['fileSizeMB']} MB）")
    print(f"已写库 relation {db_result['written']} 条（industry ES）")


def main() -> None:
    parser = argparse.ArgumentParser(description="储能链企业关系入链")
    parser.add_argument("--apply", action="store_true", help="写库并更新链/分片（先备份）")
    args = parser.parse_args()
    if not SOURCE_TRADE.exists() or not SOURCE_EQUITY.exists():
        raise SystemExit("源文件不存在，请检查 G:/对公经营智能化项目/储能产业链/")
    run(apply=args.apply)


if __name__ == "__main__":
    main()
