# -*- coding: utf-8 -*-
"""按 2,495 户新分片重建 storage-chain.json 的统计骨架。

只做四件事：
    1. levels / children 的成员与计数按新分片重算（保留原 note / order / code2 文案）
    2. positions / stats / distributions / warnings 同步重算
    3. 旧链 237 家上市企业的富画像（profile / territory / 证据）按名称+代码迁到新主体
    4. 旧链里「不在新清单」的主体移入 otherCustomers（客户池），不从系统里消失

用法：
    python agent/rebuild_storage_chain.py            # 打印差异，不写文件
    python agent/rebuild_storage_chain.py --apply    # 备份后写回
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent
ROOT = AGENT_DIR.parent
sys.path.insert(0, str(AGENT_DIR))

from ingest_compute import match_key  # noqa: E402

INDUSTRIES = ROOT / "frontend" / "public" / "data" / "industries"
SHARD_FILE = INDUSTRIES / "companies-storage.json"
CHAIN_FILE = INDUSTRIES / "storage-chain.json"
REPORT_FILE = AGENT_DIR / "data" / "storage-chain-rebuild-report.json"

POSITION_OF = {
    "资源与材料": "上游",
    "核心电子器件": "上游",
    "核心装备": "上游",
    "检测认证与标准": "上游",
    "电池与核心部件": "中游",
    "系统集成与工程建设": "中游",
    "应用与运营": "下游",
}
LEVEL_ORDER = list(POSITION_OF)
POSITION_ORDER = ["上游", "中游", "下游"]


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

    # ---- 旧链富画像迁移（237 家上市企业档案 -> 新主体） ----
    old_chain_by_key: dict[str, dict] = {}
    old_chain_by_stock: dict[str, dict] = {}
    for old in chain.get("companies", []):
        if old.get("name"):
            old_chain_by_key.setdefault(match_key(old["name"]), old)
        if old.get("fullName"):
            old_chain_by_key.setdefault(match_key(old["fullName"]), old)
        if old.get("code"):
            old_chain_by_stock.setdefault(str(old["code"]), old)
    RICH_FROM_CHAIN = (
        "code", "board", "swSector", "address", "products", "evidence", "grade",
        "fillMark", "tierSegments", "profile", "territory", "relationCount",
    )
    chain_attached = 0
    for company in companies:
        company_match = match_key(company["name"])
        target = (
            old_chain_by_key.get(company_match)
            or old_chain_by_stock.get(company.get("stockCode") or "")
        )
        if not target:
            continue
        filled = []
        for field in RICH_FROM_CHAIN:
            value = target.get(field)
            if value in (None, "", [], {}):
                continue
            if company.get(field) in (None, "", [], {}):
                company[field] = value
                filled.append(field)
        # 旧链短名（中国铝业）作为别名保留，便于关系表按简称匹配
        if target.get("name") and target["name"] != company["name"]:
            aliases = set(company.get("aliases") or []) | {target["name"]}
            company["aliases"] = sorted(aliases)
        if target.get("fullName") and target["fullName"] != company["name"]:
            company["fullName"] = target["fullName"]
        if filled:
            chain_attached += 1

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
            grade_counter = Counter(item["grade"] for item in members if item["grade"])
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
            "note": old_level.get("note") or "",
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
    # 旧口径的遗留键（上一版仅 237 家上市企业时的统计），整体清除避免误导
    for stale_key in ("edge", "related", "filled", "kept", "pool", "emptyNodes", "nodesWithoutHeads"):
        new_stats.pop(stale_key, None)
    new_stats.update({
        "level1": len(new_levels),
        "level2": sum(level["childCount"] for level in new_levels),
        "rows": len(companies),
        "companies": len(companies),
        # 源表明细行数（未去重口径）：跨环节 / 重复收录行按行计，页面顶部展示用
        "rawRows": shard.get("counts", {}).get("sourceRows") or len(companies),
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

    # 旧链主体不在新清单 -> 客户池
    new_name_keys = {match_key(item["name"]) for item in companies}
    new_name_keys |= {match_key(alias) for item in companies for alias in item.get("aliases") or []}
    new_stock = {item["stockCode"] for item in companies if item.get("stockCode")}
    new_ids = {item["id"] for item in companies}
    demoted = []
    for old in chain.get("companies", []):
        old_name = old.get("name") or ""
        if match_key(old_name) in new_name_keys:
            continue
        if old.get("fullName") and match_key(old["fullName"]) in new_name_keys:
            continue
        if old.get("code") and old["code"] in new_stock:
            continue
        if old.get("id") in new_ids:
            continue
        demoted.append({
            "name": old.get("name"),
            "creditCode": old.get("creditCode") or "",
            "codes": [],
            "nodeDetail": old.get("sector") or (old.get("level2") or [""])[0] or "",
            "primaryCode": "",
            "address": old.get("address") or "",
            "mainBusiness": old.get("products") or "",
            "source": "上一版储能链（不在本次 2,495 户清单内）",
            "verifyStatus": "清单外",
            "province": (old.get("territory") or {}).get("province", ""),
            "city": (old.get("territory") or {}).get("city", ""),
            "district": (old.get("territory") or {}).get("district", ""),
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
    grades = Counter(item["grade"] for item in companies if item["grade"])
    boards = Counter(item["board"] or "未上市" for item in companies)
    new_distributions = {
        "grades": [{"grade": key, "count": value} for key, value in grades.most_common()],
        "fillMarks": [
            {"k": "保留", "v": sum(1 for i in companies if i.get("fillMark") == "保留")},
            {"k": "补入", "v": sum(1 for i in companies if i.get("fillMark") == "补入")},
        ],
        "boards": [{"k": key, "v": value} for key, value in boards.most_common()],
        "swSectors": chain.get("distributions", {}).get("swSectors", []),
    }

    warnings = dict(chain.get("warnings") or {})
    warnings["unclassified"] = sum(1 for item in companies if item["chain"] == "未归类")
    warnings["territoryMissing"] = sum(1 for item in companies if not item.get("address"))
    # 缺口节点统一写「一级 / 二级」格式并去重（同一标签可能同时是一级与二级环节名），
    # 前端 headGapNodes 依赖该格式拆出一二级环节。
    seen_pairs: set[str] = set()
    gap_nodes: list[str] = []
    for level in new_levels:
        for child in level["children"]:
            if child["leaderCount"] == 0:
                pair = f"{level['label']} / {child['label']}"
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    gap_nodes.append(pair)
    warnings["nodesWithoutHeads"] = gap_nodes

    # steps：保留标题与状态，重算统计数字与口径文案
    new_steps = []
    for step in chain.get("steps", []):
        step_id = step.get("id")
        if step_id == "nodes":
            new_steps.append({
                **step,
                "detail": (
                    "依据权威资料与研报、工信部与行业协会口径确定一级/二级环节。储能产业当前为 "
                    f"{new_stats['level1']} 个一级环节、{new_stats['level2']} 个二级环节，自上游向下游并排展开。"
                ),
                "stats": {"level1": new_stats["level1"], "level2": new_stats["level2"]},
            })
        elif step_id == "companies":
            new_steps.append({
                **step,
                "title": "全量企业入链",
                "note": "把 2,495 户候选企业按二级环节归位，标注储能相关度与行业地位",
                "detail": (
                    "以《储能产业链-2495户企业全量数据》全量明细入链，按统一社会信用代码合并同码主体："
                    f"上市企业 {listed} 家、非上市 {new_stats['nonListed']} 家，合计 {len(companies):,} 家；"
                    f"其中 {shard['counts'].get('creditVerified', 0):,} 家已核验统一社会信用代码，"
                    f"{shard['counts'].get('creditPending', 0)} 家缺码按名称占位、绝不伪造代码。"
                    "同一企业可归属多个二级环节，展示时按环节分别出现、统计时按去重口径。"
                ),
                "stats": {
                    "companies": new_stats["companies"],
                    "rawRows": new_stats.get("rawRows"),
                    "listed": listed,
                    "nonListed": new_stats["nonListed"],
                    "total": new_stats["companies"],
                    "creditVerified": new_stats["creditVerified"],
                    "creditPending": new_stats["creditPending"],
                    "coreMain": new_stats["coreMain"],
                    "coreGrade": new_stats["coreGrade"],
                },
            })
        elif step_id == "heads":
            tier_counts = Counter(item["tierLabel"] for item in companies)
            rule = dict(step.get("rule") or {})
            rule["coverage"] = (
                f"{len(companies):,} 家在链企业（{listed} 家上市 + {new_stats['nonListed']:,} 家非上市），"
                "以清单「行业地位」判定为准（行业龙头/行业骨干/行业长尾）"
            )
            rule["limitations"] = (
                f"行业地位由清单逐户评定：龙头 {tier_counts['龙头']} 家、骨干 {tier_counts['骨干']} 家、"
                f"长尾 {tier_counts['长尾']} 家；"
                "相关度未评定的主体不参与龙头筛选，不强行分档。"
            )
            new_steps.append({
                **step,
                "title": "头部企业打标",
                "detail": (
                    "不做复杂评分，以清单「行业地位」为准：行业龙头进头部、行业骨干进腰部、"
                    f"行业长尾进尾部。{len(companies):,} 家企业全部完成评定：龙头 {tier_counts['龙头']} 家、"
                    f"骨干 {tier_counts['骨干']} 家、长尾 {tier_counts['长尾']} 家。"
                ),
                "stats": {
                    "leader": tier_counts["龙头"],
                    "core": tier_counts["骨干"],
                    "tail": tier_counts["长尾"],
                },
                "rule": rule,
            })
        else:
            new_steps.append(step)

    new_chain = dict(chain)
    new_chain.update({
        "generatedAt": datetime.now().strftime("%Y-%m-%d"),
        "source": {
            **(chain.get("source") or {}),
            "chain": "储能产业链-2495户企业全量数据.xlsx（01_全量企业主表，2,495 行明细 / 2,458 个主体，按统一社会信用代码合并同码主体）",
            "relations": "储能产业链-客户供应商关系-2026-10-21.xlsx + 储能产业链-企业关系图谱-2026-10-21.xlsx",
        },
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
        "chainRichProfilesAttached": chain_attached,
        "demotedCount": len(demoted),
        "demoted": [item["name"] for item in demoted],
        "otherCustomersBefore": len(chain.get("otherCustomers") or []),
        "otherCustomersAfter": len(other_customers),
        "fileSizeMB": None,
    }

    print("=" * 74)
    print("storage-chain.json 重建预览")
    print("=" * 74)
    print(f"链内主体：{old_stats.get('companies')} -> {len(companies)}")
    print(f"上市企业：{old_stats.get('listed')} -> {listed}")
    print(f"龙头/骨干/长尾：{old_stats.get('leader')}/{old_stats.get('core')}/{old_stats.get('tail')}"
          f" -> {new_stats['leader']}/{new_stats['core']}/{new_stats['tail']}")
    print(f"旧链富画像迁移：{chain_attached} 家")
    print()
    for level in new_levels:
        print(f"  {level['code']} {level['label']:<12} {level['position']}  {level['companyCount']:>5} 家 / "
              f"{level['childCount']} 个二级环节 / 龙头 {level['leaderCount']}")
    print()
    print(f"清单外主体转入客户池：{len(demoted)} 家")
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
    # 富画像（profile/territory/research 等）迁到的是内存里的分片 companies，
    # 必须同步写回分片：后续关系入链会用分片 companies 覆盖链内 companies，
    # 不写回分片会导致富画像在关系步骤被冲掉。
    shard_backup = SHARD_FILE.with_suffix(f".bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
    shard_backup.write_bytes(SHARD_FILE.read_bytes())
    shard["companies"] = companies
    SHARD_FILE.write_text(json.dumps(shard, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    report["fileSizeMB"] = round(CHAIN_FILE.stat().st_size / 1024 / 1024, 2)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    print(f"已写回 {CHAIN_FILE}（{report['fileSizeMB']} MB）与分片 {SHARD_FILE.name}")
    print(f"备份：{backup}")


if __name__ == "__main__":
    main()
