"""按《储能行业口径判断》对 2,495 户清单逐户落标（只读分析，不改源表）。"""

import csv
import json
import collections
from pathlib import Path

import openpyxl

SRC = Path("G:/对公经营智能化项目/储能产业链/储能产业链-2495户企业全量数据.xlsx")
CHAIN = Path("D:/ai_project/AI-Project-Department/AI-Project-Department/frontend/public/data/industries/storage-chain.json")
OUT = Path("D:/ai_project/AI-Project-Department/AI-Project-Department/agent/data/scope-audit.json")


def g(row, idx, col):
    v = row[idx[col]]
    return "" if v is None else str(v).strip()


def norm_relevance(row, idx):
    raw = g(row, idx, "相关度(归一)")
    if raw:
        return raw
    raw2 = g(row, idx, "储能相关度(原值)")
    return {"核心主业": "核心", "相关重要": "相关", "边缘观察": "观察"}.get(raw2, "未评")


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True)
    ws = wb["01_全量企业主表"]
    rows = list(ws.iter_rows(values_only=True))
    hdr, data = rows[0], rows[1:]
    I = {h: i for i, h in enumerate(hdr)}

    chain = json.loads(CHAIN.read_text(encoding="utf-8"))
    relation_names = set()
    for rel in chain.get("relations", []):
        for side in ("from", "to"):
            if rel.get(side):
                relation_names.add(rel[side])

    def classify(row):
        name = g(row, I, "企业名称")
        segments = g(row, I, "二级环节编码")
        rel = norm_relevance(row, I)
        conf = g(row, I, "判定置信度")
        product = g(row, I, "主营/技术定位") or g(row, I, "主营摘要/主要储能产品")
        node_basis = g(row, I, "环节判定依据")
        status = g(row, I, "行业地位")
        has_rel = name in relation_names
        gap = []

        if not segments:
            return "pending_verify", "缺环节归属（问 2 未过）", "none", ["环节"]
        if rel == "核心":
            return "core_main", "相关度=核心主业，环节已定", ("A" if has_rel else "B"), ["证据条目落库"]
        if rel == "相关":
            return "core_related", "相关度=相关重要（储能非主业但已成规模）", ("A" if has_rel else "B"), ["证据条目落库"]
        if rel == "观察":
            return "related_active", "相关度=边缘观察（有参与、占比很小）", ("A" if has_rel else "B"), ["占比"]

        # 未评：先看能不能从别处拿到「已参与」证据
        if has_rel:
            return "related_active", "有链内供需关系（A 级），储能占比未评", "A", ["占比", "分部收入"]
        if status in ("行业龙头", "行业骨干"):
            gap = ["占比"]
            if status == "行业龙头":
                gap.append("龙头席位占比待核")
            return "related_active", "专家口径龙头/骨干 + 名录已定节点，储能占比未评", "B", gap
        if conf == "低" or (not product and "名称无" in node_basis):
            return "pending_verify", "环节仅按名称/附件推定，产品信息缺失", "none", ["产品", "客户", "项目"]
        if conf == "中":
            return "pending_verify", "环节依附件 + 名称语义推定，未经工商/官网核实", "C", ["产品", "客户"]
        if conf == "高":
            return "related_potential", "产品对口已核实，无订单/客户证据", "C", ["订单", "客户", "项目"]
        return "related_potential", "名录已定节点，无订单/客户/项目证据", "B", ["订单", "客户"]

    judged = []
    for row in data:
        scope, reason, level, gap = classify(row)
        judged.append(
            {
                "name": g(row, I, "企业名称"),
                "segments": g(row, I, "二级环节编码"),
                "level1": g(row, I, "一级环节"),
                "positions": g(row, I, "所处位置"),
                "status": g(row, I, "行业地位"),
                "relevance": norm_relevance(row, I),
                "source": g(row, I, "企业来源"),
                "listed": g(row, I, "是否上市公司"),
                "confidence": g(row, I, "判定置信度"),
                "scope": scope,
                "reason": reason,
                "evidence": level,
                "gaps": gap,
                "in_chain_relation": g(row, I, "企业名称") in relation_names,
            }
        )
    wb.close()

    order = ["core_main", "core_related", "related_active", "related_potential", "pending_verify"]
    overall = {s: sum(1 for i in judged if i["scope"] == s) for s in order}

    def split_counts(field):
        out = collections.defaultdict(lambda: collections.Counter())
        for item in judged:
            for key in [x.strip() for x in item[field].split("；") if x.strip()]:
                out[key][item["scope"]] += 1
        return {k: dict(v) for k, v in out.items()}

    # 龙头席位冲突
    seats = [i for i in judged if i["status"] == "行业龙头"]
    seat_out = [i for i in seats if i["scope"] not in ("core_main", "core_related")]

    # 缺口统计
    gap_counter = collections.Counter()
    for item in judged:
        for gp in item["gaps"]:
            gap_counter[gp] += 1

    summary = {
        "total": len(judged),
        "overall": overall,
        "evidence": dict(collections.Counter(i["evidence"] for i in judged).most_common()),
        "byPosition": split_counts("positions"),
        "byLevel1": split_counts("level1"),
        "byStatus": {
            s: dict(collections.Counter(i["scope"] for i in judged if i["status"] == s))
            for s in ("行业龙头", "行业骨干", "行业长尾")
        },
        "bySource": {
            s: dict(collections.Counter(i["scope"] for i in judged if i["source"] == s))
            for s in ("1977 户原清单", "补充客户清单（新增）")
        },
        "relevanceCovered": sum(1 for i in judged if i["relevance"] != "未评"),
        "chainRelationCompanies": len(relation_names),
        "withRelation": sum(1 for i in judged if i["in_chain_relation"]),
        "seatConflict": {
            "total": len(seats),
            "outsideCore": len(seat_out),
            "items": [f'{i["name"]}（{i["relevance"]}·{i["scope"]}）' for i in seat_out],
        },
        "gaps": dict(gap_counter.most_common()),
        "samples": {
            s: [i["name"] for i in judged if i["scope"] == s][:10] for s in order
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = OUT.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["name", "scope", "evidence", "relevance", "status", "level1", "segments", "source", "reason", "gaps"],
        )
        writer.writeheader()
        for item in judged:
            row = dict(item)
            row["gaps"] = "、".join(item["gaps"])
            writer.writerow({k: row[k] for k in writer.fieldnames})

    ct = collections.Counter((i["scope"], i["evidence"]) for i in judged)
    print("evidence x scope:", json.dumps({f"{k[0]}/{k[1]}": v for k, v in sorted(ct.items())}, ensure_ascii=False))

    print("total", summary["total"], summary["overall"])
    print("evidence", summary["evidence"])
    print("status", json.dumps(summary["byStatus"], ensure_ascii=False))
    print("source", json.dumps(summary["bySource"], ensure_ascii=False))
    print("position:")
    for k, v in summary["byPosition"].items():
        print("  ", k, v)
    print("level1:")
    for k, v in summary["byLevel1"].items():
        print("  ", k, v)
    print("seats", summary["seatConflict"]["total"], "outside", summary["seatConflict"]["outsideCore"])
    for x in summary["seatConflict"]["items"]:
        print("   -", x)
    print("gaps", summary["gaps"])
    print("relation companies", summary["chainRelationCompanies"], "withRelation rows", summary["withRelation"])


if __name__ == "__main__":
    main()
