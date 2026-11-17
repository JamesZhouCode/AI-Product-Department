# -*- coding: utf-8 -*-
"""step3: 补全股票代码、生成最终导出数据"""
import json, re, collections
import sys
sys.path.insert(0, "D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/.算力清单合并.ref/")
from mapping import SEG_ORDER, BLOCK_OF

BASE = "D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/.算力清单合并.ref/"
d = json.load(open(BASE + "merged.json", encoding="utf-8"))
ents, order, records = d["ents"], d["order"], d["records"]

# ---- A 股全量清单，用于补码 ----
ashare = json.load(open("D:/ai_project/AI-Project-Department/AI-Project-Department/frontend/docs/a-share-list.json",
                       encoding="utf-8"))["stocks"]
name2code = {}
for s in ashare:
    name2code.setdefault(s["name"].replace("Ａ", "A"), (s["code"], s.get("market") or s.get("exchange")))

filled = []
for k in order:
    e = ents[k]
    if e["code"]:
        continue
    cands = [k] + e["names"] + [k.replace("集团", "").replace("控股", "")]
    for nm in cands:
        nm2 = nm.replace("Ａ", "A")
        if nm2 in name2code:
            code, market = name2code[nm2]
            e["code"] = str(code).zfill(6)
            e["type"] = "上市公司"
            e["how"] = e["how"] or "人工核定"
            filled.append((k, e["code"]))
            break
print("补码:", filled)

# 交易所
def exch_of(code, cur):
    if cur and any(x in str(cur) for x in ("沪", "深", "北", "科创", "创业", "主板")):
        return str(cur)
    if not code:
        return "—"
    if code.startswith("6"):
        return "上交所科创板" if code.startswith("688") else "上交所主板"
    if code.startswith(("0", "3")):
        return "深交所创业板" if code.startswith("3") else "深交所主板"
    if code.startswith(("8", "4", "9")):
        return "北交所"
    return "—"


# 重复代码检查
bycode = collections.defaultdict(list)
for k in order:
    if ents[k]["code"]:
        bycode[ents[k]["code"]].append(k)
dup = {c: v for c, v in bycode.items() if len(v) > 1}
print("重复代码:", dup)

# ---- 展示名 ----
def short_of(e):
    # 优先取记录中最早出现的简称形态
    for nm in e["names"]:
        if len(nm) <= 12 and "有限公司" not in nm and "股份" not in nm:
            return nm
    return e["key"]


def full_of(e):
    cands = [n for n in e["names"] if "有限" in n or "股份" in n]
    return max(cands, key=len) if cands else e["key"]


# ---- 主清单 ----
main, weak, none = [], [], []
for k in order:
    e = ents[k]
    if e["type"] == "非企业主体":
        none.append(e)
        continue
    if e["rel"] == "弱相关/存疑" and e["srcs"] == ["东财算力概念"]:
        weak.append(e)
        continue
    main.append(e)

print("主清单:", len(main), "弱相关:", len(weak), "非企业:", len(none))

# 排序：板块 → 环节 → 上市公司优先 → 市值/名称
blk_rank = {"上游 · 核心器件": 0, "中游 · 设备与网络": 1, "下游 · 算力运营与服务": 2, "待核实": 3}
seg_rank = {s: i for i, s in enumerate(SEG_ORDER)}
main.sort(key=lambda e: (blk_rank.get(e["block"], 9), seg_rank.get(e["seg"], 99),
                         0 if e["type"] == "上市公司" else 1,
                         -(e.get("mcap") or 0), short_of(e)))

json.dump({"main": main, "weak": weak, "none": none, "records": records},
          open(BASE + "final.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok")
