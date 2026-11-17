# -*- coding: utf-8 -*-
"""集成电路产业链建链数据生成 —— 依据《集成电路企业清单-按环节.xlsx》。

源：G:/对公经营智能化项目/集成电路/集成电路企业清单-按环节.xlsx
    「0 总览」+ 7 张环节分表（设计 / 材料 / 装备 / 制造 / 封测 / 配套 / 待研判）
主数据：frontend/public/data/companies.json（4,477 家在链主体，含地址 / 坐标 / 画像 / 关系）

用法：
    python agent/build_ic_chain.py             # 只解析 + 出报告，不写任何文件
    python agent/build_ic_chain.py --apply     # 写 ic-chain.json（先备份旧文件）

输出契约与 storage-chain.json / compute-chain.json 完全一致，前端「流程」页可直接消费。

口径（逐条可追溯，不臆造）：
    - 环节体系完全取自源表：7 个一级环节（含「待研判」），二级环节 = 表内「细分领域」列
    - 企业名录以源表明细行为准，按名称与 companies.json 对齐（当前 4,477 / 4,477 命中）
    - 分档不做份额评分，直接由源表两列判定：
          企业属性 = 重点                    -> 龙头 leader
          企业属性 = 一般 且 上市情况 = 上市  -> 骨干 core
          企业属性 = 一般 且 非上市          -> 长尾 tail
      grade 四档同样由这两列映射，规则写进 steps[2].rule.limitations，不生成分数
    - 关系边来自 companies.json 的 relations，两端都在链内才保留
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DATA = ROOT / "frontend" / "public" / "data"
MASTER_FILE = FRONTEND_DATA / "companies.json"
OUT_CHAIN = FRONTEND_DATA / "industries" / "ic-chain.json"

SOURCE = Path("G:/对公经营智能化项目/集成电路/集成电路企业清单-按环节.xlsx")

INDUSTRY_LABEL = "集成电路"
INDUSTRY_CODE = "IC"

# 分表名 → 一级环节标准名（分表名是「1 设计」这类短名，前端与 chainPalette 用全名）。
SHEET_LEVEL = {
    "设计": "集成电路设计",
    "材料": "集成电路材料",
    "装备": "基础电路装备",
    "制造": "集成电路制造",
    "封测": "集成电路封测",
    "配套": "集成电路配套",
    "待研判": "待研判",
}

# 供销口径的关系类型（其余计为股权 / 集团）
SUPPLY_TYPES = {"供应", "采购", "供销", "经销", "销售", "客户", "供应商"}

# 一级环节顺序与上下游归属：与 frontend/src/chainPalette.js 的 IC_CHAIN_PALETTE 一致。
LEVEL_META = {
    "集成电路材料": {"order": 1, "position": "上游", "note": "制造材料 · 封装材料"},
    "基础电路装备": {"order": 2, "position": "上游", "note": "前道设备 · 后道设备 · 零部件"},
    "集成电路设计": {"order": 3, "position": "中游", "note": "数字电路 · 模拟电路 · EDA/IP"},
    "集成电路制造": {"order": 4, "position": "中游", "note": "逻辑 · 存储 · 特色工艺"},
    "集成电路封测": {"order": 5, "position": "中游", "note": "先进封装 · 专业测试"},
    "集成电路配套": {"order": 6, "position": "下游", "note": "PCB · 分立器件 · 模组配套"},
    "待研判": {"order": 7, "position": "下游", "note": "主营环节归属待研判"},
}

POSITION_META = [
    {"id": "上游", "label": "上游", "note": "材料 · 装备"},
    {"id": "中游", "label": "中游", "note": "设计 · 制造 · 封测"},
    {"id": "下游", "label": "下游", "note": "配套 · 待研判"},
]

# 源表列位（0 起）：序号 / 企业名称 / 细分领域 / 企业属性 / 上市情况 / 省份 / 城市 / 区县 / 地址
COL_NAME = 1
COL_SECTOR = 2
COL_ATTR = 3
COL_LISTED = 4
COL_PROVINCE = 5
COL_CITY = 6
COL_DISTRICT = 7
COL_ADDRESS = 8

TIER_LABEL = {"leader": "龙头", "core": "骨干", "tail": "长尾"}

# 源表省份用短名（江苏 / 内蒙古自治区混用），系统内统一为全称；境外与特别行政区保持原值。
PROVINCE_FIX = {
    province: f"{province}省"
    for province in [
        "江苏", "上海", "广东", "浙江", "湖北", "北京", "安徽", "四川", "山东", "福建",
        "重庆", "天津", "辽宁", "河北", "湖南", "陕西", "河南", "黑龙江", "江西", "青海",
        "山西", "吉林", "云南", "贵州", "甘肃", "海南", "西藏", "宁夏", "新疆",
    ]
}
PROVINCE_FIX["上海"] = "上海市"
PROVINCE_FIX["北京"] = "北京市"
PROVINCE_FIX["天津"] = "天津市"
PROVINCE_FIX["重庆"] = "重庆市"
PROVINCE_FIX["内蒙古"] = "内蒙古自治区"


def norm(text) -> str:
    """企业名归一：全半角统一 + 去空白，仅用于匹配，不写回数据。"""
    value = unicodedata.normalize("NFKC", str(text or ""))
    return re.sub(r"\s+", "", value).strip()


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text in {"—", "-", "－", "/"} else text


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- 解析源表


def read_source() -> list[dict]:
    """读 7 张环节分表 → 逐行企业记录。表头固定在前 3 行（标题 / 统计 / 列名）。"""
    workbook = openpyxl.load_workbook(SOURCE, data_only=True)
    rows: list[dict] = []
    for sheet in workbook.worksheets[1:]:
        short = sheet.title.split(" ", 1)[1].strip() if " " in sheet.title else sheet.title
        level_label = SHEET_LEVEL.get(short, short)
        for raw in sheet.iter_rows(min_row=4, values_only=True):
            name = clean(raw[COL_NAME])
            if not name:
                continue
            rows.append(
                {
                    "level": level_label,
                    "name": name,
                    "sector": clean(raw[COL_SECTOR]) or "待研判",
                    "attr": clean(raw[COL_ATTR]),
                    "listed": clean(raw[COL_LISTED]) == "上市",
                    "province": clean(raw[COL_PROVINCE]),
                    "city": clean(raw[COL_CITY]),
                    "district": clean(raw[COL_DISTRICT]),
                    "address": clean(raw[COL_ADDRESS]) if len(raw) > COL_ADDRESS else "",
                }
            )
    return rows


def read_master() -> tuple[dict, list[dict], list[dict]]:
    payload = json.loads(MASTER_FILE.read_text(encoding="utf-8"))
    by_name = {}
    for company in payload.get("companies", []):
        by_name.setdefault(norm(company.get("name")), company)
    return payload, payload.get("companies", []), payload.get("relations", [])


# ---------------------------------------------------------------- 分档


def tier_of(row: dict) -> tuple[str, str, str]:
    """(tier, tierLabel, grade) —— 只映射源表两列，不做评分。"""
    key = row["attr"] == "重点"
    listed = row["listed"]
    if key:
        return "leader", TIER_LABEL["leader"], "核心主业" if listed else "核心"
    if listed:
        return "core", TIER_LABEL["core"], "相关重要"
    return "tail", TIER_LABEL["tail"], "边缘观察"


# ---------------------------------------------------------------- 企业对象


def build_company(row: dict, master: dict | None, relation_count: dict) -> dict:
    base = master or {}
    tier, tier_label, grade = tier_of(row)
    region = base.get("region") or {}
    # 属地优先用主数据（由注册地址解析、全称口径），源表短名（江苏）做回落。
    province = (
        clean(region.get("province"))
        or PROVINCE_FIX.get(row["province"], row["province"])
    )
    city = clean(region.get("city")) or row["city"]
    district = row["district"] or clean(region.get("district"))
    research = base.get("research") or {}
    return {
        "id": base.get("id") or f"ic-{norm(row['name'])}",
        "legacyId": base.get("legacyId"),
        "name": row["name"],
        "fullName": base.get("name") or row["name"],
        "normalizedName": base.get("normalizedName") or norm(row["name"]),
        "aliases": base.get("aliases") or [],
        "companyType": "key" if row["attr"] == "重点" else "ordinary",
        "isKey": row["attr"] == "重点",
        "listStatus": "上市" if row["listed"] else "非上市",
        "primaryIndustry": INDUSTRY_LABEL,
        "industryCode": INDUSTRY_CODE,
        "chain": row["level"],
        # 周报模型按 level1[0] / level2[0] 统计环节归属（与产业链地图口径一致）
        "level1": [row["level"]],
        "level2": [row["sector"]],
        "sector": row["sector"],
        "tertiarySector": base.get("tertiarySector") or row["sector"],
        "address": row["address"] or clean(base.get("address")),
        "region": {"province": province, "city": city, "district": district},
        "province": province,
        "city": city,
        "district": district,
        "products": base.get("products") or "",
        "coreTechnology": base.get("coreTechnology") or "",
        "controller": base.get("controller") or "",
        "beneficiary": base.get("beneficiary") or "",
        "profileId": base.get("profileId") or "",
        "code": base.get("stockCode") or "",
        "board": base.get("board") or "",
        "tier": tier,
        "tierLabel": tier_label,
        "grade": grade,
        "gradeLabel": "",
        "relationCount": relation_count.get(norm(row["name"]), 0),
        "research": {
            "status": research.get("status") or "",
            "source": research.get("source") or "",
            "confidence": research.get("confidence"),
            "addressType": research.get("addressType") or "",
        },
    }


# ---------------------------------------------------------------- 关系


def build_relations(raw_relations: list[dict], name_index: dict) -> tuple[list[dict], dict]:
    """只保留两端都在链内的关系；链外交易对手计数后单列，不进图谱。"""
    edges: list[dict] = []
    relation_count: dict[str, int] = collections.Counter()
    types = collections.Counter()
    for rel in raw_relations:
        source = norm(rel.get("from"))
        target = norm(rel.get("to"))
        if source not in name_index or target not in name_index:
            continue
        relation_type = rel.get("relationType") or "供应"
        types[relation_type] += 1
        edges.append(
            {
                "id": rel.get("id") or f"rel-ic-{len(edges) + 1:05d}",
                "from": rel.get("from"),
                "to": rel.get("to"),
                "sourceFromProfile": rel.get("sourceFromProfile") or rel.get("from"),
                "sourceToProfile": rel.get("sourceToProfile") or rel.get("to"),
                "relationType": relation_type,
                "depth": rel.get("depth") or 1,
                "strength": rel.get("strength") or "",
                "scope": "in-chain",
                "source": rel.get("source") or "",
            }
        )
        relation_count[source] += 1
        relation_count[target] += 1
    return edges, {"types": dict(types), "count": relation_count}


# ---------------------------------------------------------------- 环节骨架


def build_levels(rows: list[dict], companies_by_name: dict) -> tuple[list[dict], list[dict]]:
    grouped: dict[str, dict[str, list[dict]]] = collections.OrderedDict()
    for row in rows:
        grouped.setdefault(row["level"], collections.OrderedDict()).setdefault(
            row["sector"], []
        ).append(row)

    levels: list[dict] = []
    ordered = sorted(grouped.items(), key=lambda item: LEVEL_META.get(item[0], {}).get("order", 99))
    for index, (level_label, sectors) in enumerate(ordered, start=1):
        meta = LEVEL_META.get(level_label, {"order": index, "position": "下游", "note": ""})
        children = []
        seen_in_level: set[str] = set()
        rows_in_level = 0
        for sector_index, (sector_label, members) in enumerate(
            sorted(sectors.items(), key=lambda item: -len(item[1])), start=1
        ):
            sector_companies = []
            for member in members:
                company = companies_by_name.get(norm(member["name"]))
                if company is None:
                    continue
                sector_companies.append(company)
                seen_in_level.add(company["name"])
            rows_in_level += len(members)
            sector_companies.sort(
                key=lambda item: (item["tier"] != "leader", item["tier"] != "core", item["name"])
            )
            heads = []
            leaders = [item for item in sector_companies if item["tier"] == "leader"]
            if leaders:
                heads.append(
                    {
                        "segment": sector_label,
                        "declaredTotal": len(sector_companies),
                        "declaredHead": len(leaders),
                        "leaderCount": len(leaders),
                        "coreCount": sum(1 for item in sector_companies if item["tier"] == "core"),
                        "members": [
                            {
                                "id": item["id"],
                                "name": item["name"],
                                "tier": item["tier"],
                                "tierLabel": item["tierLabel"],
                                "stockCode": item["code"],
                            }
                            for item in leaders
                        ],
                    }
                )
            grade_counts = collections.Counter(item["grade"] for item in sector_companies)
            children.append(
                {
                    "order": sector_index,
                    "nodeKey": f"{index:02d}-{level_label}-{sector_label}",
                    "code2": f"{index:02d}{sector_index:02d}",
                    "label": sector_label,
                    "note": "",
                    "companyCount": len(sector_companies),
                    "listedCount": sum(1 for item in sector_companies if item["listStatus"] == "上市"),
                    "companies": sector_companies,
                    "heads": heads,
                    "grades": [
                        {"grade": grade, "count": count}
                        for grade, count in grade_counts.most_common()
                    ],
                    "leaderCount": sum(1 for item in sector_companies if item["tier"] == "leader"),
                    "coreCount": sum(1 for item in sector_companies if item["tier"] == "core"),
                    "tailCount": sum(1 for item in sector_companies if item["tier"] == "tail"),
                    "otherCount": 0,
                    "others": [],
                }
            )
        all_companies = [companies_by_name[norm(m["name"])] for m in [r for s in sectors.values() for r in s] if norm(m["name"]) in companies_by_name]
        levels.append(
            {
                "code": f"{index:02d}",
                "label": level_label,
                "position": meta["position"],
                "note": meta["note"],
                "order": index,
                "childCount": len(children),
                "companyCount": len(seen_in_level),
                "companyRowCount": len(all_companies),
                "leaderCount": sum(1 for item in all_companies if item["tier"] == "leader"),
                "coreCount": sum(1 for item in all_companies if item["tier"] == "core"),
                "tailCount": sum(1 for item in all_companies if item["tier"] == "tail"),
                "children": children,
            }
        )
    return levels, POSITION_META


def build_positions(levels: list[dict]) -> list[dict]:
    positions = []
    for meta in POSITION_META:
        matched = [level for level in levels if level["position"] == meta["id"]]
        positions.append(
            {
                "id": meta["id"],
                "label": meta["label"],
                "note": meta["note"],
                "level1Count": len(matched),
                "level2Count": sum(level["childCount"] for level in matched),
                # 上下游各自的去重企业数（同一企业可能跨环节，故不做加总校验）
                "companyCount": sum(level["companyCount"] for level in matched),
                "span": sum(level["companyCount"] for level in matched),
            }
        )
    return positions


def build_territory(companies: list[dict]) -> tuple[dict, dict]:
    listed = [item for item in companies if item["listStatus"] == "上市"]
    other = [item for item in companies if item["listStatus"] != "上市"]
    province_all = collections.Counter(item["province"] for item in companies if item["province"])
    city_all = collections.Counter(item["city"] for item in companies if item["city"])
    province_listed = collections.Counter(item["province"] for item in listed if item["province"])
    city_listed = collections.Counter(item["city"] for item in listed if item["city"])
    with_district = sum(1 for item in companies if item["district"])
    territory = {
        "total": len(companies),
        "listed": len(listed),
        "other": len(other),
        "withDistrict": with_district,
        "provinces": len(province_all),
        "cities": len(city_all),
        "topProvinces": [{"k": key, "v": value} for key, value in province_all.most_common(10)],
        "topCities": [{"k": key, "v": value} for key, value in city_all.most_common(10)],
    }
    customer_territory = {
        "total": len(companies),
        "listed": len(listed),
        "other": len(other),
        "provinces": len(province_all),
        "cities": len(city_all),
        "topProvinces": [
            {
                "k": key,
                "listed": province_listed.get(key, 0),
                "other": value - province_listed.get(key, 0),
            }
            for key, value in province_all.most_common(10)
        ],
        "topCities": [
            {
                "k": key,
                "listed": city_listed.get(key, 0),
                "other": value - city_listed.get(key, 0),
            }
            for key, value in city_all.most_common(10)
        ],
    }
    return territory, customer_territory


# ---------------------------------------------------------------- 步骤


def build_steps(levels: list[dict], companies: list[dict], relations: list[dict], stats: dict) -> list[dict]:
    level1 = len(levels)
    level2 = sum(level["childCount"] for level in levels)
    supply = sum(1 for rel in relations if rel["relationType"] in SUPPLY_TYPES)
    equity = len(relations) - supply
    covered = {norm(rel["from"]) for rel in relations} | {norm(rel["to"]) for rel in relations}
    profiled = sum(1 for item in companies if item["profileId"])
    with_relation = sum(1 for item in companies if item["relationCount"])

    head_rule = {
        "version": datetime.now().strftime("%Y-%m-%d"),
        "label": f"{INDUSTRY_LABEL}产业头部企业分档规则",
        "coverage": (
            f"{stats['companies']:,} 家在链企业（{stats['listed']:,} 家上市 + "
            f"{stats['nonListed']:,} 家非上市）"
        ),
        "basis": "以源清单「企业属性（重点 / 一般）」与「上市情况」两列为判定依据",
        "scoreTotal": 100,
        "dimensionGroups": [
            {"key": "base", "label": "基础维度", "note": "量：企业现在有多大"},
            {"key": "moat", "label": "壁垒维度", "note": "质：领先能不能守住"},
        ],
        "dimensions": [
            {
                "key": "share",
                "label": "国内份额与排名",
                "kind": "base",
                "weight": 40,
                "enabled": True,
                "note": "区分设计 / 制造 / 封测 / 材料 / 装备口径",
            },
            {
                "key": "scale",
                "label": "规模与盈利",
                "kind": "base",
                "weight": 20,
                "enabled": True,
                "note": "营收规模、产能与毛利率",
            },
            {
                "key": "growth",
                "label": "客户结构与成长",
                "kind": "base",
                "weight": 15,
                "enabled": True,
                "note": "头部客户占比与订单成长性",
            },
            {
                "key": "tech",
                "label": "技术壁垒",
                "kind": "moat",
                "weight": 25,
                "enabled": True,
                "note": "制程节点、工艺专利与标准话语权",
            },
        ],
        "moatGate": {
            "key": "moatGate",
            "enabled": False,
            "min": 70,
            "label": "壁垒分门槛",
            "desc": "启用后：总分达到龙头阈值、但壁垒分低于门槛的企业自动降为骨干。",
        },
        "tiers": [
            {"key": "leader", "label": "龙头", "min": 80, "max": None, "desc": "源清单标为「重点企业」"},
            {"key": "core", "label": "骨干", "min": 60, "max": 79, "desc": "非重点、但已上市"},
            {"key": "tail", "label": "长尾", "min": 0, "max": 59, "desc": "非重点、非上市"},
        ],
        "hardGates": ["主业确属该环节（源清单按环节分表逐户归位）"],
        "sources": [f"《{SOURCE.name}》按环节企业清单", "frontend/public/data/companies.json（地址 / 制品 / 关系）"],
        "limitations": (
            "本清单未提供份额、营收等评分数据，因此不做加权评分：分档直接由源表两列映射——"
            "「重点企业」记龙头，「非重点 + 上市」记骨干，其余记长尾；grade 四档（核心主业 / 核心 / "
            "相关重要 / 边缘观察）同样由这两列交叉映射。维度权重保留为可调口径，待补充份额数据后再启用评分。"
        ),
        "knownIssues": [
            "「待研判」135 家尚未确认主营环节，单列一个环节，不强行归入设计/制造/封测。",
            "22 家企业省市落在境外或缺失（中国香港 3 家、日本 / 韩国 / 新加坡各 1 家等），属地分布按原值展示。",
        ],
        "configurable": {
            "path": "headRule",
            "editable": ["dimensions[].weight", "dimensions[].enabled", "tiers[].min", "moatGate"],
        },
        "scoreSource": "none",
    }

    return [
        {
            "id": "nodes",
            "index": 1,
            "title": "形成环节骨架",
            "note": "先定一级、二级环节，把链的骨架搭起来",
            "detail": (
                f"环节体系取自《{SOURCE.name}》的环节分表：{level1} 个一级环节（含「待研判」）、"
                f"{level2} 个二级环节（= 表内「细分领域」列）。"
            ),
            "status": "ready",
            "stats": {"level1": level1, "level2": level2},
        },
        {
            "id": "companies",
            "index": 2,
            "title": "企业入链",
            "note": "把企业按主营归入唯一主环节",
            "detail": (
                f"{stats['companies']:,} 家企业按源表分表归入 7 个一级环节，"
                f"其中上市 {stats['listed']:,} 家、非上市 {stats['nonListed']:,} 家；"
                f"属地按源表省市字段展示，区县缺失 {stats['companies'] - stats['withDistrict']:,} 家。"
            ),
            "status": "ready",
            "stats": {
                "companies": stats["companies"],
                "listed": stats["listed"],
                "nonListed": stats["nonListed"],
                "rawRows": stats["rows"],
                # 「核心档」= 核心主业 + 核心（即源清单的重点企业 120 家）
                "coreMain": stats["coreMain"],
                "core": stats["coreGrade"],
                "coreGrade": stats["important"],
            },
        },
        {
            "id": "heads",
            "index": 3,
            "title": "头部企业打标",
            "note": "按清单「重点企业」标记与上市属性分层",
            "detail": (
                f"龙头 {stats['leader']:,} 家（源清单重点企业）、骨干 {stats['core']:,} 家（非重点但上市）、"
                f"长尾 {stats['tail']:,} 家。"
            ),
            "status": "ready",
            "stats": {
                "leader": stats["leader"],
                "core": stats["core"],
                "tail": stats["tail"],
                "coreMain": stats["coreMain"],
                "coreGrade": stats["coreGrade"],
                "important": stats["important"],
                "edge": stats["edge"],
            },
            "rule": head_rule,
        },
        {
            "id": "relations",
            "index": 4,
            "title": "关键关系展示",
            "note": "展示上市企业之间的供销、股权关系",
            "detail": (
                f"关系边来自 companies.json 已收录的公开供销 / 股权关系，只保留两端都在本链 "
                f"{stats['companies']:,} 家在链主体之内的关系，当前识别 {len(relations):,} 条"
                f"（供销 {supply:,} · 股权与集团 {equity:,}），覆盖 {len(covered):,} 家企业。"
            ),
            "status": "partial",
            "dimensions": [
                {"key": "equity", "label": "股权穿透", "note": "实际控制人 · 第一大股东 · 前十大股东"},
                {"key": "keyPersons", "label": "关键人", "note": "法定代表人 / 董事长"},
                {"key": "supplyChain", "label": "供销关系", "note": "客户 / 供应商明细"},
                {"key": "preferences", "label": "关键人偏好", "note": "暂未采集，如实留白"},
            ],
            "coverage": [
                {"key": "equity", "full": 0, "partial": 0, "missing": stats["companies"]},
                {
                    "key": "key_persons",
                    "full": profiled,
                    "partial": 0,
                    "missing": stats["companies"] - profiled,
                },
                {
                    "key": "supply_chain",
                    "full": with_relation,
                    "partial": 0,
                    "missing": stats["companies"] - with_relation,
                },
                {"key": "preferences", "full": 0, "partial": 0, "missing": stats["companies"]},
            ],
            "stats": {
                "total": len(relations),
                "supply": supply,
                "equity": equity,
                "companies": len(covered),
                "profiles": profiled,
                "external": 0,
                "externalUpstream": 0,
                "externalDownstream": 0,
            },
        },
    ]


# ---------------------------------------------------------------- 主流程


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="写 ic-chain.json")
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"源文件不存在：{SOURCE}")
        return 2

    rows = read_source()
    master_payload, master_companies, raw_relations = read_master()
    name_index = {norm(row["name"]): row for row in rows}
    master_by_norm = {norm(item.get("name")): item for item in master_companies}

    unmatched = [row["name"] for row in rows if norm(row["name"]) not in master_by_norm]
    relations, relation_stats = build_relations(raw_relations, name_index)

    companies = [
        build_company(row, master_by_norm.get(norm(row["name"])), relation_stats["count"])
        for row in rows
    ]

    by_name = {norm(item["name"]): item for item in companies}
    levels, _ = build_levels(rows, by_name)
    positions = build_positions(levels)
    territory, customer_territory = build_territory(companies)
    dedup = {item["name"]: item for item in companies}
    companies = list(dedup.values())

    grade_counts = collections.Counter(item["grade"] for item in companies)
    stats = {
        "level1": len(levels),
        "level2": sum(level["childCount"] for level in levels),
        "rows": len(rows),
        "companies": len(companies),
        "listed": sum(1 for item in companies if item["listStatus"] == "上市"),
        "nonListed": sum(1 for item in companies if item["listStatus"] != "上市"),
        "leader": sum(1 for item in companies if item["tier"] == "leader"),
        "core": sum(1 for item in companies if item["tier"] == "core"),
        "tail": sum(1 for item in companies if item["tier"] == "tail"),
        "coreMain": grade_counts.get("核心主业", 0),
        "coreGrade": grade_counts.get("核心", 0),
        "important": grade_counts.get("相关重要", 0),
        "edge": grade_counts.get("边缘观察", 0),
        "withDistrict": territory["withDistrict"],
        "relations": len(relations),
        "relationSupply": sum(1 for rel in relations if rel["relationType"] in SUPPLY_TYPES),
        "relationEquity": sum(1 for rel in relations if rel["relationType"] not in SUPPLY_TYPES),
        "relationCompanies": len(
            {norm(rel["from"]) for rel in relations} | {norm(rel["to"]) for rel in relations}
        ),
        "relationTypes": relation_stats["types"],
    }
    steps = build_steps(levels, companies, relations, stats)

    payload = {
        "schemaVersion": 2,
        "generatedAt": datetime.now().strftime("%Y-%m-%d"),
        "industry": INDUSTRY_LABEL,
        "industryCode": INDUSTRY_CODE,
        "source": (
            f"《{SOURCE.name}》环节分表（设计 / 材料 / 装备 / 制造 / 封测 / 配套 / 待研判，"
            f"{len(rows):,} 行明细 / {len(companies):,} 个主体）；"
            "地址、制品与技术标签、关系边沿用 public/data/companies.json"
        ),
        "stats": stats,
        "positions": positions,
        "levels": levels,
        "companies": companies,
        "relations": relations,
        "externalMentions": [],
        "externalVerified": [],
        "otherCustomers": [],
        "customerStats": {
            "listed": stats["listed"],
            "other": stats["nonListed"],
            "total": stats["companies"],
            "otherRealLocation": territory["withDistrict"],
            "otherRegionReference": stats["nonListed"] - territory["withDistrict"],
            "otherUnplaced": 0,
        },
        "territory": territory,
        "customerTerritory": customer_territory,
        "territoryNote": (
            f"属地按源表「省份 / 城市 / 区县」字段汇总，覆盖 {stats['companies']:,} 家在链主体；"
            f"境外与缺失地区按原值保留（中国香港、日本、韩国、新加坡等）。"
        ),
        "externalNote": "本链暂未采集链外交易对手明细，关系边仅含两端都在链内的记录。",
        "steps": steps,
        "distributions": {
            "grades": [
                {"grade": grade, "count": count} for grade, count in grade_counts.most_common()
            ],
            "fillMarks": [],
            "boards": [
                {"k": "上市", "v": stats["listed"]},
                {"k": "非上市", "v": stats["nonListed"]},
            ],
            "swSectors": [],
        },
        "warnings": {
            "unmatchedCompanies": unmatched,
            "noStockCode": sum(1 for item in companies if not item["code"]),
            "pendingSector": sum(1 for item in companies if item["chain"] == "待研判"),
        },
    }

    print(f"源表明细行：{len(rows):,}    唯一主体：{len(companies):,}")
    print(
        f"一级环节 {stats['level1']} / 二级环节 {stats['level2']} ｜ "
        f"上市 {stats['listed']:,} / 非上市 {stats['nonListed']:,}"
    )
    print(
        f"分档：龙头 {stats['leader']:,} · 骨干 {stats['core']} · 长尾 {stats['tail']:,}"
    )
    print(f"关系：{stats['relations']:,} 条 覆盖 {stats['relationCompanies']:,} 家  类型 {stats['relationTypes']}")
    print("环节分布：")
    for level in levels:
        print(
            f"  {level['code']} {level['label']:<8} {level['position']}  "
            f"{level['companyCount']:>5,} 家 / {level['childCount']} 个二级环节"
        )
    if unmatched:
        print(f"⚠ 未在 companies.json 命中的企业：{len(unmatched)} 家，例：{unmatched[:5]}")
    else:
        print("名称对齐：4,477 / 4,477 全部命中 companies.json")

    if not args.apply:
        print("\n（未写文件，加 --apply 生成 ic-chain.json）")
        return 0

    if OUT_CHAIN.exists():
        backup = OUT_CHAIN.with_suffix(f".bak-{datetime.now():%Y%m%d-%H%M%S}.json")
        shutil.copy2(OUT_CHAIN, backup)
        print(f"已备份旧文件 → {backup.name}")
    OUT_CHAIN.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"已写入 {OUT_CHAIN.relative_to(ROOT)}  ({OUT_CHAIN.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
