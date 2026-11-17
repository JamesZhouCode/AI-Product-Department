# -*- coding: utf-8 -*-
"""算力产业链清单入链 —— 以统一社会信用代码为唯一主键。

源：G:/对公经营智能化项目/算力/算力产业链企业清单-全量整合版.xlsx 的「1-全量总表」

用法：
    python agent/ingest_compute.py             # 只读解析 + 出报告，不改任何文件
    python agent/ingest_compute.py --apply     # 写库 + 重建前端契约分片（先备份旧文件）

主键口径（与 agent/ingest.py 一致，双态）：
    18 位合规信用代码  -> company_key = credit_code, key_status = 'verified'
    缺码 / 占位符 '0'   -> company_key = 'pending:CP:<名称哈希>', key_status = 'pending_credit_code'
    绝不伪造代码，也绝不把 114 个 '0' 合并成一家。

解析规则（逐条可追溯）：
    - 名称取 C 列（修正后），为空回落 B 列
    - 同一信用代码多行 -> 合并为一条主体，序号最小者为主记录，其余记入 merged_rows
    - 同名不同码 -> 保留两条，标 name_conflict，交人工判定（不自动合并）
    - 信用代码校验位按 GB 32100-2015 校验，不合格单列，不当成有效码
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT_DIR = Path(__file__).resolve().parent
SOURCE = Path("G:/对公经营智能化项目/算力/算力产业链企业清单-全量整合版.xlsx")
SHEET = "1-全量总表"
LEGACY_SHARD = ROOT / "frontend" / "public" / "data" / "industries" / "companies-compute.json"
# 上一版（schemaVersion 2、无信用代码）的画像快照。首次入链时从 companies-compute.json 固化，
# 之后每次重跑都读这份，保证可重复执行、不会把已生成的新分片当成旧分片再迁一次。
LEGACY_SNAPSHOT = AGENT_DIR / "data" / "legacy-compute-v2.json"
OUT_SHARD = ROOT / "frontend" / "public" / "data" / "industries" / "companies-compute.json"
OUT_CHAIN = ROOT / "frontend" / "public" / "data" / "industries" / "compute-chain.json"
DB_FILE = AGENT_DIR / "data" / "chain.db"
SCHEMA_FILE = AGENT_DIR / "sql" / "schema.sqlite.sql"
REPORT_FILE = AGENT_DIR / "data" / "compute-ingest-report.json"
NORMALIZED_FILE = AGENT_DIR / "data" / "compute-companies.normalized.json"
INDUSTRY_CODE = "CP"
INDUSTRY_LABEL = "算力产业"

NOW = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")  # noqa: E731

# ---------------------------------------------------------------- 列索引
COL = {
    "seq": 0, "name": 1, "name_fixed": 2, "alias": 3, "listed": 4, "stock_code": 5,
    "board": 6, "listed_basis": 7, "subject_source": 8, "relevance": 9,
    "rel_basis": 10, "link_no": 11, "link_name": 12, "tier_path": 13,
    "link_basis": 14, "basis_layer": 15, "confidence": 16, "tier": 17,
    "market_cap": 18, "reg_capital": 19, "credit_code": 20, "all_sources": 21,
}

# ---------------------------------------------------------------- 环节体系
# 三级环节（清单 M 列）-> 二级（前端 level1）
SECONDARY_OF = {
    "AI芯片与加速卡": "算力芯片与核心器件",
    "存储与内存接口": "算力芯片与核心器件",
    "先进封装与测试": "算力芯片与核心器件",
    "PCB与覆铜板": "算力芯片与核心器件",
    "光芯片与光器件": "算力芯片与核心器件",
    "电源与供配电": "算力设备与网络",
    "AI服务器整机": "算力设备与网络",
    "交换机与网络设备": "算力设备与网络",
    "光模块与CPO": "算力设备与网络",
    "高速连接与铜缆": "算力设备与网络",
    "液冷温控": "算力设备与网络",
    "光纤光缆": "算力设备与网络",
    "机房建设与系统集成": "算力基础设施",
    "机房建设与集成": "算力基础设施",
    "IDC与智算中心": "算力基础设施",
    "算力租赁与运营": "算力服务与运营",
    "云计算与算力调度": "算力服务与运营",
    "运营商算力网络": "算力服务与运营",
    "数据中心运维": "算力服务与运营",
    "算力需求方/应用": "算力需求方",
    "算力需求方": "算力需求方",
}
SECONDARY_ORDER = ["算力芯片与核心器件", "算力设备与网络", "算力基础设施", "算力服务与运营", "算力需求方"]
SECONDARY_CODE = {name: f"{index + 1:02d}" for index, name in enumerate(SECONDARY_ORDER)}

TIER_MAP = {
    "龙头": ("leader", "龙头"),
    "腰部": ("core", "腰部"),
    "尾部": ("tail", "尾部"),
    "未评级": ("unrated", "未评级"),
    "待定": ("pending", "待定"),
    "不评级": ("na", "不评级"),
    "不适用": ("na", "不适用"),
}
CONFIDENCE_MAP = {"高": 0.9, "中": 0.7, "低": 0.5}
# 旧分片分层口径（龙头/骨干/长尾）-> 新清单口径（龙头/腰部/尾部）
LEGACY_TIER = {
    "龙头": ("leader", "龙头"),
    "骨干": ("core", "腰部"),
    "长尾": ("tail", "尾部"),
    "腰部": ("core", "腰部"),
    "尾部": ("tail", "尾部"),
}
BOARD_MAP = {
    "上交所科创板": "科创板",
    "上交所主板": "主板",
    "深交所创业板": "创业板",
    "深交所主板/中小板": "主板",
    "北交所": "北交所",
    "港交所": "港股",
    "境外": "境外",
}

# GB 32100-2015 校验字符集与权重
CREDIT_CHARSET = "0123456789ABCDEFGHJKLMNPQRTUWXY"
CREDIT_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28]
PLACEHOLDER_CODES = {"", "0", "—", "-", "/", "无", "N/A", "NA", "NULL", "NONE"}

# 匹配旧分片时剥离的地域前缀 / 组织形式后缀
REGION_PREFIX = (
    "北京市", "北京", "上海市", "上海", "天津市", "天津", "重庆市", "重庆",
    "深圳市", "深圳", "广州市", "广州", "杭州市", "杭州", "苏州市", "苏州",
    "无锡市", "无锡", "南京市", "南京", "成都市", "成都", "武汉市", "武汉",
    "西安市", "西安", "合肥市", "合肥", "长沙市", "长沙", "厦门市", "厦门",
    "青岛市", "青岛", "宁波市", "宁波", "济南市", "济南", "郑州市", "郑州",
    "福州市", "福州", "东莞市", "东莞", "珠海市", "珠海", "佛山市", "佛山",
    "常州市", "常州", "嘉兴市", "嘉兴", "绍兴市", "绍兴", "湖州市", "湖州",
    "南通市", "南通", "徐州市", "徐州", "烟台市", "烟台", "大连市", "大连",
    "沈阳市", "沈阳", "哈尔滨市", "哈尔滨", "长春市", "长春", "石家庄市", "石家庄",
    "太原市", "太原", "南昌市", "南昌", "贵阳市", "贵阳", "昆明市", "昆明",
    "南宁市", "南宁", "海口市", "海口", "兰州市", "兰州", "银川市", "银川",
    "西宁市", "西宁", "乌鲁木齐市", "乌鲁木齐", "呼和浩特市", "呼和浩特",
    "中国", "香港",
)
ORG_SUFFIX = (
    "股份有限公司", "有限责任公司", "有限公司", "集团有限公司", "集团",
    "控股集团", "控股", "总公司", "分公司",
)


# ---------------------------------------------------------------- 基础工具
def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in ("none", "nan"):
        return ""
    return text


def norm_name(value: str) -> str:
    """名称归一：全半角统一、去空白、括号统一。"""
    text = unicodedata.normalize("NFKC", clean(value))
    text = re.sub(r"\s+", "", text)
    return text.upper()


def match_key(value: str) -> str:
    """匹配专用的强归一：去掉地域前缀与组织形式后缀，只留字号。"""
    text = norm_name(value)
    for prefix in sorted(REGION_PREFIX, key=len, reverse=True):
        if text.startswith(norm_name(prefix)) and len(text) > len(prefix) + 2:
            text = text[len(norm_name(prefix)):]
            break
    for suffix in sorted(ORG_SUFFIX, key=len, reverse=True):
        if text.endswith(norm_name(suffix)) and len(text) > len(suffix) + 1:
            text = text[: -len(norm_name(suffix))]
            break
    return text


def credit_check_char(body17: str) -> str | None:
    """按 GB 32100-2015 算第 18 位校验码。"""
    if len(body17) != 17 or any(ch not in CREDIT_CHARSET for ch in body17):
        return None
    total = sum(CREDIT_CHARSET.index(ch) * weight for ch, weight in zip(body17, CREDIT_WEIGHTS))
    expected = 31 - total % 31
    if expected == 31:
        expected = 0
    return CREDIT_CHARSET[expected]


def credit_checksum_ok(code: str) -> bool:
    if len(code) != 18:
        return False
    if code[17] not in CREDIT_CHARSET:
        return False
    return credit_check_char(code[:17]) == code[17]


def norm_credit(raw) -> tuple[str | None, str, str | None]:
    """返回 (规范化代码, 状态, 原值)。

    状态：
        verified        18 位、校验位通过
        checksum_fixed  18 位、校验位不通过，按 GB 32100 修正末位后通过（假定前 17 位无误）
        malformed       长度或字符集不合规，原样保留，进 pending 桶
        missing         空 / 占位符 '0' / '—'
    """
    text = clean(raw).upper()
    text = re.sub(r"\s+", "", text)
    if text in PLACEHOLDER_CODES:
        return None, "missing", None
    if re.fullmatch(r"[0-9A-Z]{18}", text):
        if credit_checksum_ok(text):
            return text, "verified", None
        fixed = credit_check_char(text[:17])
        if fixed and text[:17] + fixed != text:
            return text[:17] + fixed, "checksum_fixed", text
        return text, "malformed", None
    return text, "malformed", None


def as_number(value):
    if value is None or isinstance(value, (int, float)):
        return value
    text = clean(value).replace(",", "")
    if text in ("", "—", "-"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


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
def build_company(record: dict) -> dict:
    name = clean(record["name_fixed"]) or clean(record["name"])
    credit, credit_status, credit_raw = norm_credit(record["credit_code"])
    link_name = clean(record["link_name"]) or "未归类"
    secondary = SECONDARY_OF.get(link_name)
    tier_raw = clean(record["tier"]) or "未评级"
    tier, tier_label = TIER_MAP.get(tier_raw, ("unrated", tier_raw))
    relevance = clean(record["relevance"]) or "待核"
    listed_flag = clean(record["listed"])
    company_type = {"是": "listed", "上市公司子公司": "subsidiary"}.get(listed_flag, "ordinary")
    stock_code = clean(record["stock_code"])
    stock_code = "" if stock_code in ("—", "-", "") else stock_code
    confidence = CONFIDENCE_MAP.get(clean(record["confidence"]), 0.5)

    alias_pool = []
    for item in re.split(r"[、，,;；/]", clean(record["alias"])):
        item = item.strip()
        if item and norm_name(item) != norm_name(name):
            alias_pool.append(item)
    if clean(record["name"]) and norm_name(record["name"]) != norm_name(name):
        alias_pool.append(clean(record["name"]))

    return {
        "_excel_row": record["_excel_row"],
        "_seq": record["seq"],
        "_credit_raw": credit_raw or clean(record["credit_code"]),
        "_credit_status": credit_status,
        "creditCode": credit,
        "creditFixedFrom": credit_raw,
        "name": name,
        "normalizedName": norm_name(name),
        "matchKey": match_key(name),
        "aliases": sorted(set(alias_pool)),
        "companyType": company_type,
        "listedFlag": listed_flag,
        "stockCode": stock_code,
        "stockName": "",
        "board": BOARD_MAP.get(clean(record["board"]), ""),
        "isKey": relevance == "核心",
        "relevance": relevance,
        "relevanceBasis": clean(record["rel_basis"]),
        "linkNo": clean(record["link_no"]),
        "linkName": link_name,
        "tierPath": clean(record["tier_path"]),
        "chain": secondary or "未归类",
        "secondaryCode": SECONDARY_CODE.get(secondary or "", ""),
        "sector": link_name,
        "tertiaryCode": f"C{clean(record['link_no']) or '0'}",
        "linkBasis": clean(record["link_basis"]),
        "basisLayer": clean(record["basis_layer"]),
        "confidenceRaw": clean(record["confidence"]),
        "classificationConfidence": confidence,
        "tier": tier,
        "tierLabel": tier_label,
        "marketCap": as_number(record["market_cap"]),
        "regCapital": as_number(record["reg_capital"]),
        "subjectSource": clean(record["subject_source"]),
        "allSources": clean(record["all_sources"]),
        "listedBasis": clean(record["listed_basis"]),
        "_source_rows": [record["_excel_row"]],
        "_conflict": [],
    }


def merge_same_credit(groups: dict[str, list[dict]]) -> tuple[list[dict], list[dict]]:
    """同一信用代码多行合并。返回 (合并后主体, 合并明细)。"""
    merged: list[dict] = []
    details: list[dict] = []
    for key, records in groups.items():
        records.sort(key=lambda item: (item["_seq"] is None, item["_seq"] or 0, item["_excel_row"]))
        primary = dict(records[0])
        primary["aliases"] = list(primary["aliases"])
        for extra in records[1:]:
            primary["_source_rows"].extend(extra["_source_rows"])
            for alias in [extra["name"], *extra["aliases"]]:
                if alias and norm_name(alias) != norm_name(primary["name"]) and alias not in primary["aliases"]:
                    primary["aliases"].append(alias)
            for field in ("allSources", "relevanceBasis", "linkBasis"):
                if extra[field] and extra[field] not in (primary[field] or ""):
                    primary[field] = "；".join(filter(None, [primary[field], extra[field]]))
            if extra["linkName"] != primary["linkName"]:
                primary["_conflict"].append(
                    {"field": "linkName", "primary": primary["linkName"], "other": extra["linkName"],
                     "row": extra["_excel_row"]}
                )
            if extra["tierLabel"] != primary["tierLabel"]:
                primary["_conflict"].append(
                    {"field": "tierLabel", "primary": primary["tierLabel"], "other": extra["tierLabel"],
                     "row": extra["_excel_row"]}
                )
        if len(records) > 1:
            details.append({
                "creditCode": key,
                "name": primary["name"],
                "rows": primary["_source_rows"],
                "keptLink": primary["linkName"],
                "conflicts": primary["_conflict"],
            })
        merged.append(primary)
    return merged, details


def assign_keys(companies: list[dict]) -> None:
    """分配唯一主键与展示 id。"""
    used: Counter = Counter()
    for company in companies:
        credit = company["creditCode"]
        if credit and company["_credit_status"] in ("verified", "checksum_fixed"):
            company["keyStatus"] = "verified"
            company["companyKey"] = credit
            company["id"] = f"cp-{credit}"
        else:
            company["keyStatus"] = "pending_credit_code"
            base = company["normalizedName"]
            company["companyKey"] = f"pending:{INDUSTRY_CODE}:{sha1(base)[:12]}"
            company["id"] = f"cp-pending-{sha1(base)[:10]}"
        # 同码已合并，但 pending 名称哈希理论上仍可能撞车，做一次兜底
        used[company["companyKey"]] += 1
        if used[company["companyKey"]] > 1:
            company["companyKey"] = f"{company['companyKey']}~{used[company['companyKey']]}"
            company["id"] = f"{company['id']}~{used[company['companyKey']]}"


def attach_legacy(companies: list[dict], legacy_companies: list[dict]) -> dict:
    """把旧分片里已有的富字段（地址/坐标/主营/画像 id）按名称迁到新主体上。

    只对 schemaVersion <= 2 的老分片生效；已经带 keyStatus 的新分片直接跳过，
    避免重复执行时把新分片当成老分片再迁一次、污染 legacyId。
    """
    legacy_companies = [
        item for item in legacy_companies
        if not (item.get("keyStatus") or item.get("keyValue"))
    ]
    for company in companies:
        company["tierSource"] = "清单"
    by_key: dict[str, dict] = {}
    by_stock: dict[str, dict] = {}
    for company in companies:
        by_key.setdefault(company["matchKey"], company)
        if company["stockCode"]:
            by_stock.setdefault(company["stockCode"], company)

    matched, unmatched = [], []
    rich_fields = (
        "address", "addressSource", "addressType", "region", "regionStatus", "location",
        "locationStatus", "locationSource", "locationEvidence", "coreTechnology",
        "coreTechnologySource", "procurement", "products", "productsSource", "suppliers",
        "distributors", "equityRaw", "controller", "beneficiary", "bank", "research",
        "profileId", "stockName", "listedEvidence", "otherSource",
    )
    for old in legacy_companies:
        old_name = clean(old.get("name"))
        target = None
        old_match = match_key(old_name)
        if old_match and old_match in by_key:
            target = by_key[old_match]
        if target is None and clean(old.get("stockCode")) in by_stock:
            target = by_stock[clean(old.get("stockCode"))]
        if target is None:
            # 退一步：字号互相包含且长度 >= 4
            for key, candidate in by_key.items():
                if len(key) >= 4 and (key in old_match or old_match in key):
                    target = candidate
                    break
        if target is None:
            unmatched.append({"legacyId": old.get("id"), "name": old_name, "stockCode": old.get("stockCode")})
            continue
        filled = []
        for field in rich_fields:
            value = old.get(field)
            if value in (None, "", [], {}):
                continue
            if target.get(field) in (None, "", [], {}):
                target[field] = value
                filled.append(field)
        target["legacyId"] = old.get("id")
        target["legacyName"] = old_name
        # 清单分层覆盖不足（1327 家未评级/待定）时，用旧分片已有分层兜底，并标出来源
        old_label = old.get("tierLabel")
        if target.get("tierLabel") in ("未评级", "待定") and old_label in LEGACY_TIER:
            target["tier"], target["tierLabel"] = LEGACY_TIER[old_label]
            target["tierSource"] = "旧分片兜底"
        if old.get("grade") and not target.get("grade"):
            target["grade"] = old["grade"]
        if old.get("fillMark") and not target.get("fillMark"):
            target["fillMark"] = old["fillMark"]
        if old.get("tags"):
            merged_tags = set(target.get("tags") or []) | set(old["tags"])
            target["tags"] = sorted(merged_tags)
        matched.append({
            "legacyId": old.get("id"), "legacyName": old_name,
            "newId": target["id"], "newName": target["name"],
            "filled": filled,
        })
    return {"matched": matched, "unmatched": unmatched}


# ---------------------------------------------------------------- 报告
def summarize(companies: list[dict], raw_rows: list[dict], merge_details: list[dict],
              legacy_result: dict) -> dict:
    credit_status = Counter(c["_credit_status"] for c in companies)
    key_status = Counter(c["keyStatus"] for c in companies)
    secondary = Counter(c["chain"] for c in companies)
    tertiary = Counter(c["linkName"] for c in companies)
    tier = Counter(c["tierLabel"] for c in companies)
    relevance = Counter(c["relevance"] for c in companies)
    company_type = Counter(c["companyType"] for c in companies)
    confidence = Counter(c["confidenceRaw"] for c in companies)
    basis_layer = Counter(c["basisLayer"] for c in companies)

    # 同名不同码
    by_name: dict[str, list[dict]] = defaultdict(list)
    for company in companies:
        by_name[company["normalizedName"]].append(company)
    name_conflicts = []
    for name, items in by_name.items():
        if len(items) > 1:
            name_conflicts.append({
                "name": items[0]["name"],
                "codes": [item["creditCode"] or item["_credit_raw"] for item in items],
                "ids": [item["id"] for item in items],
                "rows": [item["_source_rows"][0] for item in items],
            })

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
    missing_codes = [
        {"row": c["_source_rows"][0], "name": c["name"], "linkName": c["linkName"],
         "raw": c["_credit_raw"], "status": c["_credit_status"]}
        for c in companies if c["_credit_status"] in ("missing", "malformed")
    ]
    tier_source = Counter(c.get("tierSource") or "清单" for c in companies)

    # 旧分片 590 家 -> 新主体的覆盖情况
    legacy_codes = {c.get("legacyId") for c in companies if c.get("legacyId")}
    legacy_total = len(legacy_result["matched"]) + len(legacy_result["unmatched"])

    return {
        "source": str(SOURCE),
        "sheet": SHEET,
        "rawRows": len(raw_rows),
        "uniqueSubjects": len(companies),
        "creditStatus": dict(credit_status),
        "keyStatus": dict(key_status),
        "creditCoverage": f"{key_status.get('verified', 0)}/{len(companies)}",
        "creditCoverageRate": round(key_status.get("verified", 0) / max(len(companies), 1) * 100, 2),
        "bySecondary": dict(secondary),
        "byTertiary": dict(tertiary),
        "byTier": dict(tier),
        "byRelevance": dict(relevance),
        "byCompanyType": dict(company_type),
        "byConfidence": dict(confidence),
        "byBasisLayer": dict(basis_layer),
        "mergedSameCredit": merge_details,
        "mergedSameCreditCount": len(merge_details),
        "nameConflicts": name_conflicts,
        "nameConflictCount": len(name_conflicts),
        "invalidCreditCodes": bad_codes,
        "fixedCreditCodes": fixed_codes,
        "missingCreditCodes": missing_codes,
        "tierSource": dict(tier_source),
        "legacyShard": {
            "total": legacy_total,
            "matched": len(legacy_result["matched"]),
            "unmatched": len(legacy_result["unmatched"]),
            "unmatchedItems": legacy_result["unmatched"],
            "matchedWithNoRichFields": sum(1 for item in legacy_result["matched"] if not item["filled"]),
            "legacyCodesReused": len(legacy_codes),
        },
    }


def print_summary(report: dict) -> None:
    print("=" * 78)
    print("算力产业链清单 · 入链解析报告（只读，未改动任何数据）")
    print("=" * 78)
    print(f"源文件        {report['source']}")
    print(f"源表          {report['sheet']}")
    print(f"明细行数      {report['rawRows']}")
    print(f"唯一主体数    {report['uniqueSubjects']}  （同码多行已合并 {report['mergedSameCreditCount']} 组）")
    print(f"信用代码覆盖  {report['creditCoverage']}  {report['creditCoverageRate']}%")
    print(f"主键状态      verified={report['keyStatus'].get('verified', 0)}  "
          f"pending_credit_code={report['keyStatus'].get('pending_credit_code', 0)}")
    print(f"代码可信度    {report['creditStatus']}")
    print()
    print("按二级环节（level1）：")
    for name, count in sorted(report["bySecondary"].items(), key=lambda kv: -kv[1]):
        print(f"  {name:<12} {count:>5}")
    print()
    print("按三级环节（清单 18+1 环节）：")
    for name, count in sorted(report["byTertiary"].items(), key=lambda kv: -kv[1]):
        print(f"  {name:<20} {count:>5}")
    print()
    print(f"分层：{report['byTier']}")
    print(f"相关性：{report['byRelevance']}")
    print(f"主体类型：{report['byCompanyType']}")
    print(f"置信度：{report['byConfidence']}")
    print()
    print(f"同名不同码：{report['nameConflictCount']} 组  （未自动合并，需人工判定）")
    for item in report["nameConflicts"][:10]:
        print(f"  - {item['name']}  codes={item['codes']}  rows={item['rows']}")
    print(f"信用代码校验位修正末位：{len(report['fixedCreditCodes'])} 条（前 17 位视为无误）")
    for item in report["fixedCreditCodes"]:
        print(f"  - 第{item['row']}行 {item['name']}  {item['raw']} -> {item['fixed']}")
    print(f"信用代码不合规（长度/字符集）：{len(report['invalidCreditCodes'])} 条")
    for item in report["invalidCreditCodes"][:10]:
        print(f"  - 第{item['row']}行 {item['name']}  raw={item['raw']}  {item['status']}")
    print(f"缺码（占位符/空）：{len(report['missingCreditCodes'])} 条")
    print(f"分层来源：{report['tierSource']}")
    print()
    legacy = report["legacyShard"]
    print(f"旧分片 {legacy['total']} 家：匹配上 {legacy['matched']}，未匹配 {legacy['unmatched']}")
    if legacy["unmatchedItems"]:
        print("  未匹配（旧分片有、新清单无，或名称/代码都对不上）：")
        for item in legacy["unmatchedItems"][:15]:
            print(f"    - {item['legacyId']} {item['name']}  {item.get('stockCode') or ''}")
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
    # 旧库可能建过同名唯一索引，按信用代码为主键后要放开
    conn.execute("drop index if exists ux_company_name_industry")
    conn.execute("delete from relation where industry_code = ?", (INDUSTRY_CODE,))
    conn.execute("delete from company_chain_tag where industry_code = ?", (INDUSTRY_CODE,))
    conn.execute("delete from company where industry_code = ?", (INDUSTRY_CODE,))
    conn.execute(
        "insert into industry(code, label, shard_file, imported_at, company_count, counts_json) "
        "values (?,?,?,?,0,?) on conflict(code) do update set label=excluded.label, "
        "shard_file=excluded.shard_file, imported_at=excluded.imported_at, counts_json=excluded.counts_json",
        (INDUSTRY_CODE, INDUSTRY_LABEL, "industries/companies-compute.json", NOW(),
         json.dumps(report, ensure_ascii=False)),
    )

    for company in companies:
        region = company.get("region") or {}
        location = company.get("location") or {}
        # 跨链主体（同一信用代码已存在于其它产业链，如储能）分配行业级主键，
        # 避免 company_key 主键冲突；credit_code 仍保留，按 (industry_code, credit_code) 唯一。
        existing = conn.execute(
            "select industry_code from company where company_key = ?", (company["companyKey"],)
        ).fetchone()
        if existing and existing[0] != INDUSTRY_CODE:
            company["companyKey"] = f"{company['companyKey']}::{INDUSTRY_CODE}"
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
                region.get("province"), region.get("city"), region.get("district"),
                company.get("address"), location.get("lng"), location.get("lat"),
                location.get("precision"),
                company.get("products"), company.get("coreTechnology"),
                "compute-excel-2026-10-20",
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
             f"清单.{company['basisLayer'] or '未标'}", NOW()),
        )
    conn.execute("update industry set company_count = ? where code = ?", (len(companies), INDUSTRY_CODE))
    conn.commit()
    total = conn.execute("select count(*) from company where industry_code = ?", (INDUSTRY_CODE,)).fetchone()[0]
    conn.close()
    return {"industryCode": INDUSTRY_CODE, "companies": total}


# ---------------------------------------------------------------- 导出分片
def export_shard(companies: list[dict], raw_row_count: int | None = None) -> dict:
    """生成与现有前端契约同构的 companies-compute.json。"""
    out = []
    for company in companies:
        relevance = company["relevance"]
        grade = company.get("grade") or ("核心主业" if relevance == "核心" else "相关重要")
        base_tag = {"listed": "上市企业", "subsidiary": "上市公司子公司"}.get(
            company["companyType"], "非上市企业"
        )
        # 上市标签一律以本次清单为准，不继承旧画像里的「上市企业」（旧口径与新口径不同）
        legacy_tags = [
            tag for tag in (company.get("tags") or [])
            if tag not in ("上市企业", "上市公司子公司", "非上市企业")
        ]
        tags = [base_tag, *legacy_tags]
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
            "rawIndustry": company["linkName"],
            "sourceFlag": "Y",
            "chain": company["chain"],
            "level1": [company["chain"]],
            "level2": [company["sector"]],
            "secondaryIndustry": company["chain"],
            "secondaryCode": company["secondaryCode"],
            "sector": company["sector"],
            "tertiarySector": company["sector"],
            "tertiaryCode": company["tertiaryCode"],
            "classifications": [{
                "chain": company["chain"], "sector": company["sector"],
                "code": company["tertiaryCode"],
                "confidence": company["classificationConfidence"],
                "source": "算力产业链企业清单（全量整合版）",
            }],
            "secondaryCodes": [company["secondaryCode"]] if company["secondaryCode"] else [],
            "classificationStatus": "mapped" if company["linkNo"] not in ("", "0") else "code_missing",
            "classificationMethod": company["basisLayer"] or "清单未标",
            "classificationConfidence": company["classificationConfidence"],
            "classificationEvidence": company["linkBasis"],
            "address": company.get("address") or "",
            "addressSource": company.get("addressSource") or "",
            "addressType": company.get("addressType") or "",
            "region": company.get("region") or {"province": "", "city": "", "district": "", "street": ""},
            "regionStatus": company.get("regionStatus") or "待补",
            "location": company.get("location") or None,
            "locationStatus": company.get("locationStatus") or "待补",
            "locationSource": company.get("locationSource") or "",
            "locationEvidence": company.get("locationEvidence") or "",
            "coreTechnology": company.get("coreTechnology") or company["relevanceBasis"],
            "coreTechnologySource": company.get("coreTechnologySource") or "清单「相关性依据」",
            "procurement": company.get("procurement") or "",
            "products": company.get("products") or company["relevanceBasis"],
            "productsSource": company.get("productsSource") or "清单「相关性依据」",
            "suppliers": company.get("suppliers") or [],
            "distributors": company.get("distributors") or [],
            "equityRaw": company.get("equityRaw") or "",
            "controller": company.get("controller") or "",
            "beneficiary": company.get("beneficiary") or "",
            "evidence": company["allSources"],
            "tags": tags,
            "tagStatus": "已标记",
            "tagSource": "算力产业链企业清单",
            "bank": company.get("bank") or "",
            "research": company.get("research") or {},
            "profileId": company.get("profileId") or "",
            # 证券代码只挂在上市主体本身；上市公司子公司的代码是母公司的，单列 parentStockCode，
            # 避免下游把「子公司」统计成上市企业（清单口径：子公司不计入上市家数）
            "stockCode": company["stockCode"] if company["companyType"] == "listed" else "",
            "parentStockCode": company["stockCode"] if company["companyType"] != "listed" else "",
            "stockName": company.get("stockName") or "",
            "board": company["board"],
            "grade": grade,
            "fillMark": company.get("fillMark") or "保留",
            "tier": company["tier"],
            "tierLabel": company["tierLabel"],
            "relationCount": 0,
            "creditCode": company["creditCode"] or "",
            "creditFixedFrom": company.get("creditFixedFrom") or "",
            "keyStatus": company["keyStatus"],
            "keyValue": company["companyKey"],
            "relevance": relevance,
            "marketCap": company["marketCap"],
            "regCapital": company["regCapital"],
            "linkNo": company["linkNo"],
            "linkBasis": company["linkBasis"],
            "basisLayer": company["basisLayer"],
            "confidenceLabel": company["confidenceRaw"],
            "subjectSource": company["subjectSource"],
            "tierSource": company.get("tierSource") or "清单",
            "listStatus": "in-list",
            "mainBusiness": company["relevanceBasis"],
            "otherSource": company.get("otherSource") or "",
            "sourceRows": company["_source_rows"],
            "creditStatus": company["_credit_status"],
        }
        out.append(item)

    secondary = Counter(item["chain"] for item in out)
    tertiary = Counter(item["sector"] for item in out)
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
            "subsidiary": sum(1 for item in out if item["companyType"] == "subsidiary"),
            "neeqListed": 0,
            "key": sum(1 for item in out if item["isKey"]),
            "relationCount": 0,
            "mapped": len(out),
            "creditVerified": sum(1 for item in out if item["keyStatus"] == "verified"),
            "creditPending": sum(1 for item in out if item["keyStatus"] == "pending_credit_code"),
            "verifiedLocation": sum(1 for item in out if item["locationStatus"] == "已核实"),
            "candidateLocation": sum(1 for item in out if item["locationStatus"] == "候选"),
            "regionReferenceLocation": sum(1 for item in out if item["locationStatus"] == "区域参考"),
            "pendingLocation": sum(1 for item in out if item["locationStatus"] == "待补"),
            "missingAddress": sum(1 for item in out if not item["address"]),
            "classification": {
                "secondary": dict(secondary),
                "tertiary": dict(tertiary),
            },
            "headTiers": {
                "龙头": sum(1 for item in out if item["tierLabel"] == "龙头"),
                "腰部": sum(1 for item in out if item["tierLabel"] == "腰部"),
                "尾部": sum(1 for item in out if item["tierLabel"] == "尾部"),
                "未评级": sum(1 for item in out if item["tierLabel"] == "未评级"),
                "待定": sum(1 for item in out if item["tierLabel"] == "待定"),
                "不评级/不适用": sum(1 for item in out if item["tierLabel"] in ("不评级", "不适用")),
            },
            "tierSource": dict(Counter(item["tierSource"] for item in out)),
            "relationTypes": {},
        },
        "companies": out,
        "relations": [],
        "scope": "in-chain",
        "scopeNote": (
            "全量入链：主体范围为《算力产业链企业清单-全量整合版》1-全量总表全部明细行，"
            "按统一社会信用代码合并同码主体后逐家建账。唯一标识为统一社会信用代码（creditCode/keyValue）；"
            "缺少合规代码的主体以 pending:CP:<名称哈希> 占位，绝不伪造代码。"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="算力产业链清单入链（信用代码为主键）")
    parser.add_argument("--apply", action="store_true", help="写库并重建前端分片（会先备份旧文件）")
    parser.add_argument("--report", action="store_true", help="只打印上次报告")
    args = parser.parse_args()

    if args.report:
        if REPORT_FILE.exists():
            print_summary(json.loads(REPORT_FILE.read_text(encoding="utf-8")))
        else:
            print("还没有报告，先运行 python agent/ingest_compute.py")
        return

    if not SOURCE.exists():
        raise SystemExit(f"源文件不存在：{SOURCE}")

    raw_rows = read_rows()
    built = [build_company(record) for record in raw_rows]

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
    assign_keys(companies)

    legacy = {"matched": [], "unmatched": []}
    legacy_source = LEGACY_SNAPSHOT if LEGACY_SNAPSHOT.exists() else LEGACY_SHARD
    if legacy_source.exists():
        legacy_payload = json.loads(legacy_source.read_text(encoding="utf-8"))
        legacy = attach_legacy(companies, legacy_payload.get("companies") or [])
        legacy["source"] = str(legacy_source)

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

    # 备份 + 写入
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
    print(f"已写入库：{DB_FILE}  CP 链 {db_result['companies']} 家")
    print(f"已重建分片：{OUT_SHARD}  {len(shard['companies'])} 家")
    for backup in backups:
        print(f"旧文件备份：{backup}")
    print("注意：compute-chain.json 的统计骨架尚未重算，需运行 agent/rebuild_compute_chain.py")


if __name__ == "__main__":
    main()
