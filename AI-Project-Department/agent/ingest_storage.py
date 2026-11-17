# -*- coding: utf-8 -*-
"""储能产业链 2,495 户全量清单入链 —— 以统一社会信用代码为唯一主键。

源：G:/对公经营智能化项目/储能产业链/储能产业链-2495户企业全量数据.xlsx 的「01_全量企业主表」

用法：
    python agent/ingest_storage.py             # 只读解析 + 出报告，不改任何文件
    python agent/ingest_storage.py --apply     # 写库 + 重建前端契约分片（先备份旧文件）

主键口径（与 agent/ingest_compute.py 一致，双态）：
    18 位合规信用代码  -> company_key = credit_code, key_status = 'verified'
    缺码 / 不合规      -> company_key = 'pending:ES:<名称哈希>', key_status = 'pending_credit_code'
    绝不伪造代码；同码多行合并为一条主体；同名不同码保留两条并标 name_conflict。

解析规则（逐条可追溯）：
    - 环节：主表「二级环节 / 二级环节编码」以「；」分隔可属多个环节，首个为主环节；
    - 分层：行业地位 行业龙头/行业骨干/行业长尾 -> tier leader/core/tail（储能口径：龙头/骨干/长尾）；
    - 相关度(归一) 观察/相关/核心 -> grade 边缘观察/相关重要/核心主业（与旧链分布口径对齐）；
    - 上市：以「是否上市公司 = 是」且股票代码非空为准；
    - 旧分片（1,977 户 schema v2）的富字段（地址/坐标/画像/研究）按名称+代码迁移。
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

AGENT_DIR = Path(__file__).resolve().parent
ROOT = AGENT_DIR.parent
sys.path.insert(0, str(AGENT_DIR))

from ingest_compute import (  # noqa: E402
    BOARD_MAP,
    DB_FILE,
    SCHEMA_FILE,
    as_number,
    attach_legacy,
    assign_keys,  # noqa: F401  (复用同名工具的注释口径)
    clean,
    merge_same_credit,
    norm_name,
    norm_credit,
    sha1,
)

# ingest_compute.assign_keys 写死 cp- 前缀，这里自定义 ES 版本。
INDUSTRY_CODE = "ES"
INDUSTRY_LABEL = "储能产业"

SOURCE = Path("G:/对公经营智能化项目/储能产业链/储能产业链-2495户企业全量数据.xlsx")
SHEET = "01_全量企业主表"
LEGACY_SHARD = ROOT / "frontend" / "public" / "data" / "industries" / "companies-storage.json"
OUT_SHARD = ROOT / "frontend" / "public" / "data" / "industries" / "companies-storage.json"
OUT_CHAIN = ROOT / "frontend" / "public" / "data" / "industries" / "storage-chain.json"
DB_FILE = DB_FILE  # noqa: 复用算力链同库
SCHEMA_FILE = SCHEMA_FILE
REPORT_FILE = AGENT_DIR / "data" / "storage-ingest-report.json"
NORMALIZED_FILE = AGENT_DIR / "data" / "storage-companies.normalized.json"

NOW = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")  # noqa: E731


def sha1s(text: str, length: int = 12) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:length]

# ---------------------------------------------------------------- 列索引（01_全量企业主表，34 列）
COL = {
    "seq": 0, "name": 1, "credit_code": 2, "credit_source": 3, "credit_note": 4,
    "level1": 5, "secondary": 6, "sec_code": 7, "position": 8, "cover_count": 9,
    "relevance_raw": 10, "relevance": 11, "tier": 12, "evidence_strength": 13,
    "tier_basis": 14, "listed": 15, "listed_status": 16, "stock_code": 17,
    "stock_name": 18, "board": 19, "main": 20, "main_brief": 21, "address": 22,
    "province": 23, "city": 24, "district": 25, "data_source": 26, "node_detail": 27,
    "plan_a": 28, "review": 29, "note": 30, "company_source": 31,
    "link_basis": 32, "confidence": 33,
}

# ---------------------------------------------------------------- 口径映射
TIER_MAP = {
    "行业龙头": ("leader", "龙头"),
    "行业骨干": ("core", "骨干"),
    "行业长尾": ("tail", "长尾"),
}
GRADE_MAP = {
    "核心": "核心主业",
    "相关": "相关重要",
    "观察": "边缘观察",
    "关联": "关联",
}
CONFIDENCE_MAP = {"高": 0.9, "中": 0.7, "低": 0.5}
NEW_SOURCE_MARK = "补充"
STORAGE_BOARD_MAP = {
    **BOARD_MAP,
    "深圳证券交易所": "深交所",
    "上海证券交易所": "上交所",
    "北京证券交易所": "北交所",
    "港交所（已退市）": "港交所",
}


def split_multi(value: str) -> list[str]:
    """「A；B」「A;B」「A、B」拆分并去空。"""
    text = clean(value)
    if not text:
        return []
    return [item.strip() for item in re.split(r"[；;\s]+", text) if item.strip()]


# ---------------------------------------------------------------- 读取 Excel
def read_rows() -> list[dict]:
    import openpyxl

    workbook = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    sheet = workbook[SHEET]
    rows: list[dict] = []
    for index, raw in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
        if raw is None or all(cell is None or clean(cell) == "" for cell in raw):
            continue
        record = {key: (raw[pos] if pos < len(raw) else None) for key, pos in COL.items()}
        record["_excel_row"] = index
        rows.append(record)
    workbook.close()
    return rows


# ---------------------------------------------------------------- 规范化
def merge_same_stock(companies: list[dict]) -> tuple[list[dict], list[dict]]:
    """同一股票代码的多行合并为同一上市主体。

    背景：上市主体工商更名前后两行会同时出现在源表（如「中创新航科技集团股份
    有限公司」与「中创新航科技股份有限公司」同为 3931.HK），更名前一行带合规
    信用代码、更名后一行缺码，缺码行无法按信用代码合并，这里按股票代码兜底：
    - 恰好一行有合规信用代码：缺码行并入有码行（保留有码行主名，缺码名进别名）；
    - 多行都有合规信用代码：可能是母子公司共用代码的源表口径问题，不自动合并，
      记入明细供人工判定。
    """
    by_stock: dict[str, list[dict]] = defaultdict(list)
    for company in companies:
        if company.get("stockCode"):
            by_stock[company["stockCode"]].append(company)

    details: list[dict] = []
    drop: set[int] = set()
    for code, rows in by_stock.items():
        if len(rows) < 2:
            continue
        verified = [
            item for item in rows
            if item["_credit_status"] in ("verified", "checksum_fixed")
        ]
        if len(verified) != 1:
            details.append({
                "creditCode": f"股票代码 {code}",
                "name": rows[0]["name"],
                "rows": [item["_excel_row"] for item in rows],
                "keptLink": rows[0]["linkName"],
                "conflicts": [{
                    "field": "stockCode",
                    "note": "多行均有合规信用代码或缺码行不唯一，未自动合并",
                }],
            })
            continue
        primary = verified[0]
        for extra in rows:
            if extra is primary:
                continue
            primary["_source_rows"].extend(extra["_source_rows"])
            for alias in [extra["name"], *extra["aliases"]]:
                if alias and norm_name(alias) != norm_name(primary["name"]) and alias not in primary["aliases"]:
                    primary["aliases"].append(alias)
            for field in ("allSources", "relevanceBasis"):
                if extra.get(field) and extra[field] not in (primary.get(field) or ""):
                    primary[field] = "；".join(filter(None, [primary[field], extra[field]]))
            drop.add(id(extra))
            details.append({
                "creditCode": f"股票代码 {code}",
                "name": primary["name"],
                "rows": [item["_excel_row"] for item in rows],
                "keptLink": primary["linkName"],
                "conflicts": [],
            })
    if not drop:
        return companies, details
    return [item for item in companies if id(item) not in drop], details


def build_company(record: dict) -> dict:
    name = clean(record["name"])
    credit, credit_status, credit_raw = norm_credit(record["credit_code"])
    level1_list = split_multi(record["level1"])
    secondary_list = split_multi(record["secondary"])
    code_list = split_multi(record["sec_code"])
    # 主环节 = 第一组；多环节全部保留进 classifications
    chain = level1_list[0] if level1_list else "未归类"
    sector = secondary_list[0] if secondary_list else "未归类"
    primary_code = code_list[0] if code_list else ""
    tier_raw = clean(record["tier"]) or ""
    tier, tier_label = TIER_MAP.get(tier_raw, ("unrated", tier_raw or "未评级"))
    relevance = clean(record["relevance"])
    grade = GRADE_MAP.get(relevance, relevance or "")
    stock_code = clean(record["stock_code"])
    listed_flag = clean(record["listed"])
    is_listed = listed_flag.startswith("是") and bool(stock_code)
    company_type = "listed" if is_listed else "ordinary"
    board_raw = clean(record["board"])

    alias_pool = []
    stock_name = clean(record["stock_name"])
    if stock_name and norm_name(stock_name) != norm_name(name):
        alias_pool.append(stock_name)

    return {
        "_excel_row": record["_excel_row"],
        "_seq": record["seq"],
        "_credit_raw": credit_raw or clean(record["credit_code"]),
        "_credit_status": credit_status,
        "creditCode": credit,
        "creditFixedFrom": credit_raw,
        "creditSource": clean(record["credit_source"]),
        "creditNote": clean(record["credit_note"]),
        "name": name,
        "normalizedName": norm_name(name),
        "matchKey": "",  # 由 ingest_compute.match_key 补（导入时填充）
        "aliases": sorted(set(alias_pool)),
        "companyType": company_type,
        "isKey": grade == "核心主业",
        "primaryIndustry": INDUSTRY_LABEL,
        "industryCode": INDUSTRY_CODE,
        "position": clean(record["position"]),
        "level1List": level1_list,
        "level2List": secondary_list,
        "codeList": code_list,
        "chain": chain,
        "secondaryCode": primary_code,
        "sector": sector,
        "linkName": sector,
        "coverCount": as_number(record["cover_count"]),
        "relevanceRaw": clean(record["relevance_raw"]),
        "relevance": relevance,
        "grade": grade,
        "tier": tier,
        "tierLabel": tier_label,
        "tierBasis": clean(record["tier_basis"]),
        "evidenceStrength": clean(record["evidence_strength"]),
        "listedStatus": clean(record["listed_status"]),
        "stockCode": stock_code if is_listed else "",
        "stockName": stock_name,
        "board": STORAGE_BOARD_MAP.get(board_raw, board_raw),
        "boardRaw": board_raw,
        "main": clean(record["main"]),
        "mainBrief": clean(record["main_brief"]),
        "address": clean(record["address"]),
        "province": clean(record["province"]),
        "city": clean(record["city"]),
        "district": clean(record["district"]),
        "dataSource": clean(record["data_source"]),
        "nodeDetail": clean(record["node_detail"]),
        "review": clean(record["review"]),
        "note": clean(record["note"]),
        "companySource": clean(record["company_source"]),
        "linkBasis": clean(record["link_basis"]),
        "relevanceBasis": clean(record["link_basis"]),
        "allSources": clean(record["data_source"]),
        "confidenceRaw": clean(record["confidence"]),
        "classificationConfidence": CONFIDENCE_MAP.get(clean(record["confidence"]), 0.6),
        "_source_rows": [record["_excel_row"]],
        "_conflict": [],
    }


def fill_match_keys(companies: list[dict]) -> None:
    from ingest_compute import match_key

    for company in companies:
        company["matchKey"] = match_key(company["name"])


# ---------------------------------------------------------------- 报告
def summarize(companies: list[dict], raw_rows: list[dict], merge_details: list[dict],
              legacy_result: dict) -> dict:
    credit_status = Counter(c["_credit_status"] for c in companies)
    key_status = Counter(c["keyStatus"] for c in companies)
    by_chain = Counter(c["chain"] for c in companies)
    by_sector = Counter(c["sector"] for c in companies)
    tier = Counter(c["tierLabel"] for c in companies)
    grade = Counter(c["grade"] for c in companies)
    company_type = Counter(c["companyType"] for c in companies)
    position = Counter(c["position"] for c in companies)
    by_source = Counter(
        ("补充清单" if NEW_SOURCE_MARK in (c.get("companySource") or "") else "原清单")
        for c in companies
    )

    by_name: dict[str, list[dict]] = defaultdict(list)
    for company in companies:
        by_name[company["normalizedName"]].append(company)
    name_conflicts = [
        {
            "name": items[0]["name"],
            "codes": [item["creditCode"] or item["_credit_raw"] for item in items],
            "ids": [item["id"] for item in items],
            "rows": [item["_source_rows"][0] for item in items],
        }
        for name, items in by_name.items() if len(items) > 1
    ]
    bad_codes = [
        {"row": c["_source_rows"][0], "name": c["name"], "raw": c["_credit_raw"],
         "status": c["_credit_status"]}
        for c in companies if c["_credit_status"] == "malformed"
    ]
    fixed_codes = [
        {"row": c["_source_rows"][0], "name": c["name"],
         "raw": c["creditFixedFrom"], "fixed": c["creditCode"]}
        for c in companies if c["_credit_status"] == "checksum_fixed"
    ]

    return {
        "source": str(SOURCE),
        "sheet": SHEET,
        "rawRows": len(raw_rows),
        "uniqueSubjects": len(companies),
        "creditStatus": dict(credit_status),
        "keyStatus": dict(key_status),
        "creditCoverage": f"{key_status.get('verified', 0)}/{len(companies)}",
        "creditCoverageRate": round(key_status.get("verified", 0) / max(len(companies), 1) * 100, 2),
        "byPosition": dict(position),
        "byChain": dict(by_chain),
        "bySector": dict(by_sector),
        "byTier": dict(tier),
        "byGrade": dict(grade),
        "byCompanyType": dict(company_type),
        "byCompanySource": dict(by_source),
        "mergedSameCredit": merge_details,
        "mergedSameCreditCount": len(merge_details),
        "nameConflicts": name_conflicts,
        "nameConflictCount": len(name_conflicts),
        "invalidCreditCodes": bad_codes,
        "fixedCreditCodes": fixed_codes,
        "tierSource": "清单.行业地位（全量覆盖）",
        "legacyShard": {
            "total": len(legacy_result["matched"]) + len(legacy_result["unmatched"]),
            "matched": len(legacy_result["matched"]),
            "unmatched": len(legacy_result["unmatched"]),
            "unmatchedItems": legacy_result["unmatched"],
            "matchedWithNoRichFields": sum(
                1 for item in legacy_result["matched"] if not item["filled"]
            ),
        },
    }


def print_summary(report: dict) -> None:
    print("=" * 78)
    print("储能产业链 2,495 户全量清单 · 入链解析报告（只读，未改动任何数据）")
    print("=" * 78)
    print(f"源文件        {report['source']}")
    print(f"明细行数      {report['rawRows']}")
    print(f"唯一主体数    {report['uniqueSubjects']}  （同码多行已合并 {report['mergedSameCreditCount']} 组）")
    print(f"信用代码覆盖  {report['creditCoverage']}  {report['creditCoverageRate']}%")
    print(f"主键状态      {report['keyStatus']}")
    print(f"代码可信度    {report['creditStatus']}")
    print()
    print("按位置 / 一级环节：")
    for name, count in sorted(report["byChain"].items(), key=lambda kv: -kv[1]):
        print(f"  {name:<14} {count:>5}")
    print(f"分层：{report['byTier']}")
    print(f"相关度(grade)：{report['byGrade']}")
    print(f"主体类型：{report['byCompanyType']}")
    print(f"来源：{report['byCompanySource']}")
    print()
    print(f"同名不同码：{report['nameConflictCount']} 组（未自动合并，需人工判定）")
    for item in report["nameConflicts"][:10]:
        print(f"  - {item['name']}  codes={item['codes']}  rows={item['rows']}")
    print(f"信用代码校验位修正：{len(report['fixedCreditCodes'])} 条")
    print(f"信用代码不合规：{len(report['invalidCreditCodes'])} 条")
    legacy = report["legacyShard"]
    print()
    print(f"旧分片 {legacy['total']} 家：匹配上 {legacy['matched']}，未匹配 {legacy['unmatched']}")
    for item in legacy["unmatchedItems"][:15]:
        print(f"    - {item.get('legacyId')} {item['name']}  {item.get('stockCode') or ''}")
    print("=" * 78)


# ---------------------------------------------------------------- 写库
def connect() -> sqlite3.Connection:
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    with SCHEMA_FILE.open(encoding="utf-8") as handle:
        conn.executescript(handle.read())
    return conn


def write_db(companies: list[dict], report: dict) -> dict:
    conn = connect()
    conn.execute("drop index if exists ux_company_name_industry")
    conn.execute("delete from relation where industry_code = ?", (INDUSTRY_CODE,))
    conn.execute("delete from company_chain_tag where industry_code = ?", (INDUSTRY_CODE,))
    conn.execute("delete from company where industry_code = ?", (INDUSTRY_CODE,))
    shared_count = 0
    conn.execute(
        "insert into industry(code, label, shard_file, imported_at, company_count, counts_json) "
        "values (?,?,?,?,0,?) on conflict(code) do update set label=excluded.label, "
        "shard_file=excluded.shard_file, imported_at=excluded.imported_at, counts_json=excluded.counts_json",
        (INDUSTRY_CODE, INDUSTRY_LABEL, "industries/companies-storage.json", NOW(),
         json.dumps(report, ensure_ascii=False)),
    )
    for company in companies:
        existing = conn.execute(
            "select industry_code from company where company_key = ?", (company["companyKey"],)
        ).fetchone()
        if existing and existing["industry_code"] != INDUSTRY_CODE:
            # 跨链共享主体（如同在算力链与储能链的中兴通讯）：
            # company 行全局唯一（company_key = 信用代码），保留首次入链产业，
            # 这里只补 ES 的链标签与别名。
            conn.execute(
                "insert or ignore into company_alias(company_key, alias, alias_type) values (?,?,?)",
                (company["companyKey"], company["name"], "cross-industry-name"),
            )
            for alias in company.get("aliases") or []:
                conn.execute(
                    "insert or ignore into company_alias(company_key, alias, alias_type) values (?,?,?)",
                    (company["companyKey"], alias, "source-alias"),
                )
            conn.execute(
                """insert or ignore into company_chain_tag(
                    company_key, industry_code, level1, level2, is_primary, confidence,
                    evidence_id, assigned_by, assigned_at
                ) values (?,?,?,?,?,?,?,?,?)""",
                (company["companyKey"], INDUSTRY_CODE, company["chain"], company["sector"], 1,
                 company["classificationConfidence"], None,
                 f"清单.{company.get('linkBasis') or '未标'}", NOW()),
            )
            shared_count += 1
            continue
        conn.execute(
            """insert into company(
                company_key, credit_code, key_status, name, norm_name, industry_code,
                chain, sector, tertiary_sector, company_type, is_listed, stock_code,
                province, city, district, address, lng, lat, geo_precision,
                products, core_technology, source_file, raw_json, updated_at
            ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                company["companyKey"], company["creditCode"], company["keyStatus"],
                company["name"], company["normalizedName"], INDUSTRY_CODE,
                company["chain"], company["sector"], company["sector"],
                company["companyType"], 1 if company["companyType"] == "listed" else 0,
                company["stockCode"] or None,
                company.get("province") or None, company.get("city") or None,
                company.get("district") or None,
                company.get("address"),
                (company.get("location") or {}).get("lng"),
                (company.get("location") or {}).get("lat"),
                (company.get("location") or {}).get("precision"),
                company.get("products"), company.get("main") or company.get("coreTechnology"),
                "storage-excel-2026-10-21",
                json.dumps(company, ensure_ascii=False), NOW(),
            ),
        )
        for alias in company.get("aliases") or []:
            conn.execute(
                "insert or ignore into company_alias(company_key, alias, alias_type) values (?,?,?)",
                (company["companyKey"], alias, "source-alias"),
            )
        conn.execute(
            """insert or ignore into company_chain_tag(
                company_key, industry_code, level1, level2, is_primary, confidence,
                evidence_id, assigned_by, assigned_at
            ) values (?,?,?,?,?,?,?,?,?)""",
            (company["companyKey"], INDUSTRY_CODE, company["chain"], company["sector"], 1,
             company["classificationConfidence"], None,
             f"清单.{company.get('linkBasis') or '未标'}", NOW()),
        )
    conn.execute("update industry set company_count = ? where code = ?", (len(companies), INDUSTRY_CODE))
    conn.commit()
    # 产业口径的企业数以链标签为准（含跨链共享主体）
    tagged = conn.execute(
        "select count(distinct company_key) from company_chain_tag where industry_code = ?",
        (INDUSTRY_CODE,),
    ).fetchone()[0]
    conn.execute("update industry set company_count = ? where code = ?", (tagged, INDUSTRY_CODE))
    conn.commit()
    total = tagged
    conn.close()
    return {"industryCode": INDUSTRY_CODE, "companies": total, "sharedWithOtherChains": shared_count}


# ---------------------------------------------------------------- 导出分片
def export_shard(companies: list[dict], raw_row_count: int | None = None) -> dict:
    out = []
    for company in companies:
        base_tag = "上市企业" if company["companyType"] == "listed" else "非上市企业"
        legacy_tags = [
            tag for tag in (company.get("tags") or [])
            if tag not in ("上市企业", "上市公司子公司", "非上市企业")
        ]
        classifications = []
        for i, sector in enumerate(company["level2List"]):
            chain = company["level1List"][i] if i < len(company["level1List"]) else company["chain"]
            code = company["codeList"][i] if i < len(company["codeList"]) else ""
            classifications.append({
                "chain": chain, "sector": sector, "code": code,
                "confidence": company["classificationConfidence"],
                "source": "储能产业链-2495户企业全量数据",
            })
        item = {
            "id": company["id"],
            "legacyId": company.get("legacyId"),
            "name": company["name"],
            "normalizedName": company["normalizedName"],
            "aliases": company["aliases"],
            "companyType": company["companyType"],
            "isKey": company["isKey"],
            "primaryIndustry": INDUSTRY_LABEL,
            "industryCode": INDUSTRY_CODE,
            "rawIndustry": company["sector"],
            "sourceFlag": "Y",
            "chain": company["chain"],
            "level1": company["level1List"] or [company["chain"]],
            "level2": company["level2List"] or [company["sector"]],
            "secondaryIndustry": company["chain"],
            "secondaryCode": company["secondaryCode"],
            "sector": company["sector"],
            "tertiarySector": company["sector"],
            "tertiaryCode": company["secondaryCode"],
            "classifications": classifications,
            "secondaryCodes": company["codeList"],
            "classificationStatus": "mapped" if company["secondaryCode"] else "code_missing",
            "classificationMethod": "清单.环节判定依据",
            "classificationConfidence": company["classificationConfidence"],
            "classificationEvidence": company["linkBasis"],
            "address": company.get("address") or "",
            "addressSource": company.get("addressSource") or "",
            "addressType": company.get("addressType") or "",
            "region": company.get("region") or {
                "province": company.get("province") or "",
                "city": company.get("city") or "",
                "district": company.get("district") or "",
                "street": "",
            },
            "regionStatus": company.get("regionStatus") or ("已核实" if company.get("province") else "待补"),
            "location": company.get("location") or None,
            "locationStatus": company.get("locationStatus") or "待补",
            "locationSource": company.get("locationSource") or "",
            "locationEvidence": company.get("locationEvidence") or "",
            "coreTechnology": company.get("coreTechnology") or company["main"],
            "coreTechnologySource": company.get("coreTechnologySource") or "清单「主营/技术定位」",
            "procurement": company.get("procurement") or "",
            "products": company.get("products") or company["mainBrief"] or company["main"],
            "productsSource": company.get("productsSource") or "清单「主营摘要/主要储能产品」",
            "suppliers": company.get("suppliers") or [],
            "distributors": company.get("distributors") or [],
            "equityRaw": company.get("equityRaw") or "",
            "controller": company.get("controller") or "",
            "beneficiary": company.get("beneficiary") or "",
            "evidence": company.get("evidence") or company["linkBasis"] or company["tierBasis"],
            "tags": [base_tag, *legacy_tags],
            "tagStatus": "已标记",
            "tagSource": "储能产业链-2495户企业全量数据",
            "bank": company.get("bank") or "",
            "research": company.get("research") or {},
            "profileId": company.get("profileId") or "",
            "stockCode": company["stockCode"],
            "parentStockCode": "",
            "stockName": company.get("stockName") or "",
            "board": company["board"],
            "grade": company["grade"],
            "fillMark": "补入" if NEW_SOURCE_MARK in (company.get("companySource") or "") else "保留",
            "tier": company["tier"],
            "tierLabel": company["tierLabel"],
            "relationCount": 0,
            "creditCode": company["creditCode"] or "",
            "creditFixedFrom": company.get("creditFixedFrom") or "",
            "creditSource": company.get("creditSource") or "",
            "keyStatus": company["keyStatus"],
            "keyValue": company["companyKey"],
            "relevance": company["relevance"],
            "tierBasis": company["tierBasis"],
            "evidenceStrength": company["evidenceStrength"],
            "position": company["position"],
            "companySource": company.get("companySource") or "",
            "listStatus": "in-list",
            "mainBusiness": company["main"],
            "otherSource": company.get("otherSource") or "",
            "sourceRows": company["_source_rows"],
            "creditStatus": company["_credit_status"],
        }
        out.append(item)

    listed = sum(1 for item in out if item["companyType"] == "listed")
    return {
        "generatedAt": datetime.now().strftime("%Y-%m-%d"),
        "schemaVersion": 3,
        "industry": INDUSTRY_LABEL,
        "industryCode": INDUSTRY_CODE,
        "counts": {
            "totalCompanies": len(out),
            "sourceRows": raw_row_count if raw_row_count is not None else len(out),
            "listed": listed,
            "ordinary": len(out) - listed,
            "nonListed": len(out) - listed,
            "neeqListed": 0,
            "key": sum(1 for item in out if item["isKey"]),
            "relationCount": 0,
            "mapped": sum(1 for item in out if item["classificationStatus"] == "mapped"),
            "creditVerified": sum(1 for item in out if item["keyStatus"] == "verified"),
            "creditPending": sum(1 for item in out if item["keyStatus"] == "pending_credit_code"),
            "verifiedLocation": sum(1 for item in out if item["locationStatus"] == "已核实"),
            "candidateLocation": sum(1 for item in out if item["locationStatus"] == "候选"),
            "regionReferenceLocation": sum(1 for item in out if item["locationStatus"] == "区域参考"),
            "pendingLocation": sum(1 for item in out if item["locationStatus"] == "待补"),
            "missingAddress": sum(1 for item in out if not item["address"]),
            "classification": {
                "secondary": dict(Counter(item["chain"] for item in out)),
                "tertiary": dict(Counter(item["sector"] for item in out)),
            },
            "headTiers": {
                "龙头": sum(1 for item in out if item["tierLabel"] == "龙头"),
                "骨干": sum(1 for item in out if item["tierLabel"] == "骨干"),
                "长尾": sum(1 for item in out if item["tierLabel"] == "长尾"),
                "未评级": sum(1 for item in out if item["tierLabel"] == "未评级"),
            },
            "tierSource": dict(Counter("清单" for _ in out)),
            "relationTypes": {},
        },
        "companies": out,
        "relations": [],
        "scope": "in-chain",
        "scopeNote": (
            "全量入链：主体范围为《储能产业链-2495户企业全量数据》01_全量企业主表全部明细行，"
            "按统一社会信用代码合并同码主体后逐家建账。唯一标识为统一社会信用代码（creditCode/keyValue）；"
            "缺少合规代码的主体以 pending:ES:<名称哈希> 占位，绝不伪造代码。"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="储能产业链 2,495 户全量清单入链（信用代码为主键）")
    parser.add_argument("--apply", action="store_true", help="写库并重建前端分片（会先备份旧文件）")
    parser.add_argument("--report", action="store_true", help="只打印上次报告")
    args = parser.parse_args()

    if args.report:
        if REPORT_FILE.exists():
            print_summary(json.loads(REPORT_FILE.read_text(encoding="utf-8")))
        else:
            print("还没有报告，先运行 python agent/ingest_storage.py")
        return

    if not SOURCE.exists():
        raise SystemExit(f"源文件不存在：{SOURCE}")

    raw_rows = read_rows()
    built = [build_company(record) for record in raw_rows]
    fill_match_keys(built)

    # 分组：合规码优先按码合并；缺码/坏码按名称+行号各自独立，绝不合并
    groups: dict[str, list[dict]] = defaultdict(list)
    for company in built:
        if company["_credit_status"] in ("verified", "checksum_fixed"):
            groups[f"code:{company['creditCode']}"].append(company)
        elif company["_credit_status"] == "malformed":
            groups[f"bad:{company['creditCode']}:{company['_excel_row']}"].append(company)
        else:
            groups[f"row:{company['_excel_row']}"].append(company)

    companies, merge_details = merge_same_credit(groups)
    # 同股票代码兜底合并（上市主体更名前后两行，缺码行并回有码行）
    companies, stock_details = merge_same_stock(companies)
    merge_details.extend(stock_details)
    fill_match_keys(companies)
    assign_keys(companies)
    # assign_keys 写的是 cp- 前缀（算力），这里改写为 es-
    for company in companies:
        if company["keyStatus"] == "verified":
            company["id"] = f"es-{company['companyKey']}"
        else:
            base = company["normalizedName"]
            company["companyKey"] = f"pending:ES:{sha1s(base)}"
            company["id"] = f"es-pending-{sha1s(base, 10)}"
    # 同码已合并，但 pending 名称哈希兜底查重
    used: Counter = Counter()
    for company in companies:
        used[company["companyKey"]] += 1
        if used[company["companyKey"]] > 1:
            company["companyKey"] = f"{company['companyKey']}~{used[company['companyKey']]}"
            company["id"] = f"{company['id']}~{used[company['companyKey']]}"

    legacy = {"matched": [], "unmatched": []}
    if LEGACY_SHARD.exists():
        legacy_payload = json.loads(LEGACY_SHARD.read_text(encoding="utf-8"))
        legacy = attach_legacy(companies, legacy_payload.get("companies") or [])
        legacy["source"] = str(LEGACY_SHARD)

    report = summarize(companies, raw_rows, merge_details, legacy)
    report["generatedAt"] = NOW()

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print_summary(report)

    if not args.apply:
        print()
        print("只读模式：未写入数据库、未改动前端分片。")
        print(f"报告已存：{REPORT_FILE}")
        print("确认口径无误后加 --apply 执行入链。")
        return

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backups = []
    for path in (OUT_SHARD, OUT_CHAIN):
        if path.exists():
            backup = path.with_suffix(f".bak-{stamp}.json")
            backup.write_bytes(path.read_bytes())
            backups.append(str(backup))

    NORMALIZED_FILE.write_text(
        json.dumps({"generatedAt": NOW(), "companies": companies}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    shard = export_shard(companies, len(raw_rows))
    OUT_SHARD.write_text(json.dumps(shard, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    db_result = write_db(companies, report["keyStatus"])

    print()
    print(f"已写入库：{DB_FILE}  ES 链 {db_result['companies']} 家")
    print(f"已重建分片：{OUT_SHARD}  {len(shard['companies'])} 家")
    for backup in backups:
        print(f"备份：{backup}")


if __name__ == "__main__":
    main()
