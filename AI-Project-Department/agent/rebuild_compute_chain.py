# -*- coding: utf-8 -*-
"""按全量企业分片重算 compute-chain.json 的统计骨架。

只做三件事：
    1. levels / children 的成员与计数按新分片重算（保留原 note / order / code2 文案）
    2. positions / stats / distributions / warnings 同步重算
    3. 旧链里「不在新清单」的主体移入 otherCustomers（客户池），不从系统里消失

用法：
    python agent/rebuild_compute_chain.py            # 打印差异，不写文件
    python agent/rebuild_compute_chain.py --apply    # 备份后写回
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from ingest_compute import match_key

ROOT = Path(__file__).resolve().parents[1]
INDUSTRIES = ROOT / "frontend" / "public" / "data" / "industries"
SHARD_FILE = INDUSTRIES / "companies-compute.json"
CHAIN_FILE = INDUSTRIES / "compute-chain.json"
REPORT_FILE = Path(__file__).resolve().parent / "data" / "compute-chain-rebuild-report.json"

POSITION_OF = {
    "算力芯片与核心器件": "上游",
    "算力设备与网络": "中游",
    "算力基础设施": "下游",
    "算力服务与运营": "下游",
    "算力需求方": "需求侧",
}
LEVEL_ORDER = ["算力芯片与核心器件", "算力设备与网络", "算力基础设施", "算力服务与运营", "算力需求方"]
POSITION_ORDER = ["上游", "中游", "下游", "需求侧"]
DEFAULT_NOTES = {
    "算力需求方": "算力终端用户 · 需求侧",
}

# 算力链 step3（分层与画像）的分档规则。结构与储能链 heads.rule 保持同构，
# 供流程页的规则面板与评分引擎读取；档位名与清单口径一致（龙头/腰部/尾部）。
COMPUTE_HEAD_RULE = {
    "version": "2026-11-09",
    "label": "算力产业头部企业分档规则",
    "coverage": "3475 家在链企业（452 家上市 + 3012 家非上市；上市公司子公司 11 家不计入上市口径）",
    "basis": "以国内算力市场份额为主（区分芯片 / 整机 / 网络 / IDC / 云服务口径）",
    "scoreTotal": 100,
    "dimensionGroups": [
        {"key": "base", "label": "基础维度", "note": "量：企业现在有多大"},
        {"key": "moat", "label": "壁垒维度", "note": "质：领先能不能守住"},
    ],
    "dimensions": [
        {"key": "share", "label": "国内份额与排名", "kind": "base", "weight": 40, "enabled": True,
         "note": "区分 AI 芯片 / 服务器 / 交换 / 光模块 / IDC / 云调度细分口径"},
        {"key": "scale", "label": "规模与盈利", "kind": "base", "weight": 20, "enabled": True,
         "note": "营收规模、算力资产规模与毛利率"},
        {"key": "growth", "label": "客户结构与成长", "kind": "base", "weight": 15, "enabled": True,
         "note": "头部云厂 / 运营商占比与订单成长性"},
        {"key": "tech", "label": "技术壁垒", "kind": "moat", "weight": 25, "enabled": True,
         "note": "核心工艺、专利与标准话语权"},
        {"key": "cert", "label": "资质与认证壁垒", "kind": "moat", "weight": 0, "enabled": False,
         "note": "数据中心资质 / 安可目录 / 运营商集采入库"},
        {"key": "customer", "label": "客户壁垒", "kind": "moat", "weight": 0, "enabled": False,
         "note": "头部客户切换成本、长协与联合开发绑定"},
        {"key": "position", "label": "产业链卡位壁垒", "kind": "moat", "weight": 0, "enabled": False,
         "note": "关键环节稀缺卡位、上下游一体化程度"},
        {"key": "cost", "label": "一体化与成本壁垒", "kind": "moat", "weight": 0, "enabled": False,
         "note": "自供率、规模成本曲线与单位成本优势"},
    ],
    "moatGate": {
        "key": "moatGate",
        "enabled": False,
        "min": 70,
        "label": "壁垒分门槛",
        "desc": "启用后：总分达到龙头阈值、但壁垒分低于门槛的企业自动降为腰部，避免「大而不强」被误判为龙头。",
    },
    "tiers": [
        {"key": "leader", "label": "龙头", "min": 80, "max": None, "desc": "综合得分 ≥80，且通过全部硬门槛"},
        {"key": "core", "label": "腰部", "min": 60, "max": 79, "desc": "综合得分 60–79"},
        {"key": "tail", "label": "尾部", "min": 0, "max": 59, "desc": "综合得分 <60"},
    ],
    "hardGates": [
        "主业确属该环节",
        "有可查的国内份额 / 排名或头部客户证据",
        "具备该环节核心资质 / 认证之一",
        "至少具备一项可守的壁垒（技术 / 资质 / 客户 / 卡位 / 成本）",
    ],
    "sources": [
        "ODCC 开放数据中心委员会",
        "中国信通院（算力白皮书）",
        "IDC 圈 / DCM",
        "TrendForce / Dell'Oro / Omdia",
        "上市公司年报 / 公告",
        "券商研报",
        "招投标与行业新闻",
    ],
    "limitations": (
        "清单只对 705/3475 家给出头腰尾分层（上市样本为主），其余标为未评级/待定；"
        "无公开份额时以可查证据（出货 / 中标 / 客户 / 产能）做保守判断，依据列标注来源与年份。"
    ),
    "knownIssues": [
        {"topic": "分层覆盖率", "note": "清单分层仅覆盖 20%（705 家），头腰尾之外大量主体待评级，不强行分档。"},
        {"topic": "需求侧", "note": "算力需求方（终端用户）暂无龙头分层，只作获客视角观察，不参与授信分档。"},
        {"topic": "母子口径", "note": "上市公司子公司按独立法人计户，证券代码为其母公司代码，不计入上市家数。"},
        {"topic": "环节归属", "note": "四层证据逐条留痕（原表 / 人工复核 / 企业知识 / 名称行业词 / 行内库），可按依据层筛选复核。"},
    ],
}


def brief(company: dict) -> dict:
    """children 里内嵌的成员摘要（保留完整对象，前端详情要用）。"""
    return company


def head_member(company: dict) -> dict:
    return {
        "id": company["id"],
        "name": company["name"],
        "tier": company["tier"],
        "tierLabel": company["tierLabel"],
        "stockCode": company.get("stockCode") or "",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    shard = json.loads(SHARD_FILE.read_text(encoding="utf-8"))
    chain = json.loads(CHAIN_FILE.read_text(encoding="utf-8"))
    companies = shard["companies"]

    old_level_map = {level["label"]: level for level in chain.get("levels", [])}
    old_child_meta: dict[str, dict] = {}
    for level in chain.get("levels", []):
        for child in level.get("children", []):
            old_child_meta[child["label"]] = {
                "note": child.get("note") or "",
                "code2": child.get("code2"),
                "order": child.get("order"),
            }

    by_level1: dict[str, list[dict]] = defaultdict(list)
    for company in companies:
        by_level1[company["chain"]].append(company)

    new_levels = []
    for index, level1 in enumerate(LEVEL_ORDER, start=1):
        group = by_level1.get(level1)
        if not group:
            continue
        old_level = old_level_map.get(level1, {})
        by_level2: dict[str, list[dict]] = defaultdict(list)
        for company in group:
            by_level2[company["sector"]].append(company)

        children = []
        for child_index, (label, members) in enumerate(
            sorted(by_level2.items(), key=lambda kv: -len(kv[1])), start=1
        ):
            meta = old_child_meta.get(label, {})
            heads = [head_member(item) for item in members if item["tier"] == "leader"]
            grade_counter = Counter(item["grade"] for item in members)
            children.append({
                "order": meta.get("order") or child_index,
                "nodeKey": f"{index:02d}-{level1}-{label}",
                "code2": meta.get("code2") or f"C{child_index}",
                "label": label,
                "note": meta.get("note") or "",
                "companyCount": len(members),
                "listedCount": sum(1 for item in members if item["companyType"] == "listed"),
                "companies": [brief(item) for item in members],
                "heads": [{
                    "segment": label,
                    "declaredTotal": len(members),
                    "declaredHead": len(heads),
                    "leaderCount": len(heads),
                    "coreCount": sum(1 for item in members if item["tier"] == "core"),
                    "members": heads,
                }] if heads else [],
                "grades": [
                    {"grade": grade, "count": count}
                    for grade, count in grade_counter.most_common()
                ],
                "leaderCount": len(heads),
                "coreCount": sum(1 for item in members if item["tier"] == "core"),
                "tailCount": sum(1 for item in members if item["tier"] == "tail"),
                "otherCount": sum(1 for item in members if item["tier"] in ("unrated", "pending", "na")),
                "others": [],
            })

        new_levels.append({
            "code": old_level.get("code") or f"{index:02d}",
            "label": level1,
            "position": POSITION_OF[level1],
            "note": old_level.get("note") or DEFAULT_NOTES.get(level1, ""),
            "order": old_level.get("order") or index,
            "childCount": len(children),
            "companyCount": len(group),
            "companyRowCount": len(group),
            "leaderCount": sum(1 for item in group if item["tier"] == "leader"),
            "coreCount": sum(1 for item in group if item["tier"] == "core"),
            "tailCount": sum(1 for item in group if item["tier"] == "tail"),
            "children": children,
        })

    # positions
    new_positions = []
    for position in POSITION_ORDER:
        levels = [level for level in new_levels if level["position"] == position]
        if not levels:
            continue
        new_positions.append({
            "id": position,
            "label": position,
            "note": next((old.get("note", "") for old in chain.get("positions", []) if old["id"] == position), ""),
            "level1Count": len(levels),
            "level2Count": sum(level["childCount"] for level in levels),
            "companyCount": sum(level["companyCount"] for level in levels),
            "span": sum(level["companyCount"] for level in levels),
        })

    # stats
    old_stats = chain.get("stats") or {}
    listed = sum(1 for item in companies if item["companyType"] == "listed")
    new_stats = dict(old_stats)
    new_stats.update({
        "level1": len(new_levels),
        "level2": sum(level["childCount"] for level in new_levels),
        "rows": len(companies),
        "companies": len(companies),
        "listed": listed,
        "nonListed": len(companies) - listed,
        "leader": sum(1 for item in companies if item["tier"] == "leader"),
        "core": sum(1 for item in companies if item["tier"] == "core"),
        "tail": sum(1 for item in companies if item["tier"] == "tail"),
        "coreMain": sum(1 for item in companies if item["grade"] == "核心主业"),
        "coreGrade": sum(1 for item in companies if item["grade"] == "相关重要"),
        "important": len(companies),
        "creditVerified": shard["counts"].get("creditVerified", 0),
        "creditPending": shard["counts"].get("creditPending", 0),
        "placed": shard["counts"].get("verifiedLocation", 0)
        + shard["counts"].get("candidateLocation", 0)
        + shard["counts"].get("regionReferenceLocation", 0),
        "pendingLocation": shard["counts"].get("pendingLocation", 0),
    })

    # 清单外主体 -> 客户池
    new_name_keys = {match_key(item["name"]) for item in companies}
    new_name_keys |= {match_key(alias) for item in companies for alias in item.get("aliases") or []}
    new_stock = {item["stockCode"] for item in companies if item.get("stockCode")}
    new_ids = {item["id"] for item in companies}
    demoted = []
    for old in chain.get("companies", []):
        old_name = old.get("name") or ""
        if match_key(old_name) in new_name_keys:
            continue
        if old.get("stockCode") and old["stockCode"] in new_stock:
            continue
        if old.get("id") in new_ids:
            continue
        demoted.append({
            "name": old.get("name"),
            "creditCode": old.get("creditCode") or "",
            "codes": [],
            "nodeDetail": old.get("sector") or old.get("rawIndustry") or "",
            "primaryCode": old.get("tertiaryCode") or "",
            "address": old.get("address") or "",
            "mainBusiness": old.get("mainBusiness") or "",
            "source": "上一版算力链（不在本次清单内）",
            "verifyStatus": "清单外",
            "province": (old.get("region") or {}).get("province", ""),
            "city": (old.get("region") or {}).get("city", ""),
            "district": (old.get("region") or {}).get("district", ""),
            "location": old.get("location"),
            "locationStatus": old.get("locationStatus") or "待补",
            "locationPrecision": (old.get("location") or {}).get("precision") if old.get("location") else "",
        })

    other_customers = list(chain.get("otherCustomers") or [])
    existing_names = {item.get("name") for item in other_customers}
    appended = [item for item in demoted if item["name"] not in existing_names]
    other_customers.extend(appended)
    new_stats["otherCustomers"] = len(other_customers)

    # distributions
    grades = Counter(item["grade"] for item in companies)
    boards = Counter(item["board"] or "未上市" for item in companies)
    new_distributions = {
        "grades": [{"grade": key, "count": value} for key, value in grades.most_common()],
        "fillMarks": chain.get("distributions", {}).get("fillMarks", []),
        "boards": [{"board": key, "count": value} for key, value in boards.most_common()],
        "swSectors": chain.get("distributions", {}).get("swSectors", []),
    }

    warnings = dict(chain.get("warnings") or {})
    warnings["unclassified"] = sum(1 for item in companies if item["chain"] == "未归类")
    warnings["companiesWithoutRelationProfile"] = [
        item["name"] for item in companies if not item.get("profileId")
    ]
    warnings["territoryMissing"] = [
        item["name"] for item in companies if not item.get("address")
    ]

    # steps：保留标题与状态，重算统计数字与口径文案
    stats_by_key = new_stats
    subsidiary = sum(1 for item in companies if item["companyType"] == "subsidiary")
    unrated = sum(1 for item in companies if item["tier"] in ("unrated", "pending"))
    tier_counts = Counter(item["tier"] for item in companies)
    new_steps = []
    for step in chain.get("steps", []):
        step_id = step.get("id")
        if step_id == "nodes":
            new_steps.append({
                **step,
                "detail": (
                    "按算力从「芯片—整机—组网—机房—算力服务—行业应用」的交付链条，确定 "
                    f"{stats_by_key['level1']} 个一级环节、{stats_by_key['level2']} 个二级环节；"
                    "口径以《算力产业链企业清单-全量整合版》的 18+1 环节体系为准，需求侧（算力需求方）单列成组。"
                ),
                "stats": {"level1": stats_by_key["level1"], "level2": stats_by_key["level2"]},
            })
        elif step_id == "companies":
            demoted_note = len(demoted) or sum(
                1 for item in other_customers if item.get("verifyStatus") == "清单外"
            )
            new_steps.append({
                **step,
                "detail": (
                    "以《算力产业链企业清单-全量整合版》全量明细入链，按统一社会信用代码合并同码主体："
                    f"上市企业 {stats_by_key['listed']} 家、上市公司子公司 {subsidiary} 家、"
                    f"非上市 {stats_by_key['nonListed'] - subsidiary} 家；"
                    f"上一版链中不在本次清单的 {demoted_note} 家转入客户池，客户池合计 {len(other_customers)} 家。"
                ),
                "stats": {
                    "companies": stats_by_key["companies"],
                    "listed": stats_by_key["listed"],
                },
            })
        elif step_id == "tier":
            new_steps.append({
                **step,
                "detail": (
                    "分层以清单原判为准，上一版画像仅作兜底并标注来源：龙头 "
                    f"{tier_counts['leader']} 家、腰部 {tier_counts['core']} 家、尾部 {tier_counts['tail']} 家；"
                    f"清单未覆盖的 {unrated} 家标为未评级/待定，不强行分档。"
                    "属地优先取年报办公地址，无法核实的不作推测。"
                ),
                "stats": {
                    "leader": tier_counts["leader"],
                    "core": tier_counts["core"],
                    "tail": tier_counts["tail"],
                },
                # 储能链的 step3（heads）自带分档规则，算力链此前缺失导致打标页白屏，这里补齐
                "rule": COMPUTE_HEAD_RULE,
            })
        else:
            new_steps.append(step)

    new_chain = dict(chain)
    new_chain.update({
        "generatedAt": datetime.now().strftime("%Y-%m-%d"),
        "source": (
            "《算力产业链企业清单-全量整合版》1-全量总表（1,765 行明细 / 1,764 个主体，"
            "按统一社会信用代码合并同码主体）+ 上一版算力链存量画像"
        ),
        "stats": new_stats,
        "positions": new_positions,
        "levels": new_levels,
        "steps": new_steps,
        "companies": companies,
        "relations": [],
        "otherCustomers": other_customers,
        "distributions": new_distributions,
        "warnings": warnings,
    })

    report = {
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "companies": len(companies),
        "levels": [{"label": level["label"], "position": level["position"],
                    "companies": level["companyCount"], "children": level["childCount"]}
                   for level in new_levels],
        "statsBefore": {key: old_stats.get(key) for key in ("companies", "listed", "leader", "core", "tail", "level2")},
        "statsAfter": {key: new_stats.get(key) for key in ("companies", "listed", "leader", "core", "tail", "level2")},
        "demotedCount": len(demoted),
        "demoted": [item["name"] for item in demoted],
        "otherCustomersBefore": len(chain.get("otherCustomers") or []),
        "otherCustomersAfter": len(other_customers),
        "fileSizeMB": None,
    }

    print("=" * 74)
    print("compute-chain.json 重建预览")
    print("=" * 74)
    print(f"链内主体：{old_stats.get('companies')} -> {len(companies)}")
    print(f"二级环节：{old_stats.get('level2')} -> {new_stats['level2']}")
    print(f"一级环节：{old_stats.get('level1')} -> {new_stats['level1']}")
    print(f"上市：{old_stats.get('listed')} -> {new_stats['listed']}")
    print(f"龙头/腰部/尾部：{old_stats.get('leader')}/{old_stats.get('core')}/{old_stats.get('tail')}"
          f" -> {new_stats['leader']}/{new_stats['core']}/{new_stats['tail']}")
    print()
    for level in new_levels:
        print(f"  {level['code']} {level['label']:<10} {level['position']}  {level['companyCount']:>5} 家 / "
              f"{level['childCount']} 个三级环节 / 龙头 {level['leaderCount']}")
    print()
    print(f"清单外主体转入客户池：{len(demoted)} 家；客户池 {report['otherCustomersBefore']} -> {len(other_customers)}")
    for name in report["demoted"][:10]:
        print(f"  - {name}")

    if not args.apply:
        print()
        print("预览模式：未写文件。加 --apply 写回。")
        REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    backup = CHAIN_FILE.with_suffix(f".bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
    backup.write_bytes(CHAIN_FILE.read_bytes())
    CHAIN_FILE.write_text(json.dumps(new_chain, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    report["fileSizeMB"] = round(CHAIN_FILE.stat().st_size / 1024 / 1024, 2)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    print(f"已写回 {CHAIN_FILE}（{report['fileSizeMB']} MB）")
    print(f"备份：{backup}")


if __name__ == "__main__":
    main()
