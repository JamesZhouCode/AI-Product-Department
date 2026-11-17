# -*- coding: utf-8 -*-
"""step2: 应用归类，生成合并后的主体表 + 审计记录"""
import json, re, sys
sys.path.insert(0, "D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/.算力清单合并.ref/")
from mapping import (BLOCK_OF, SEG_ORDER, OLD_SEG, ODCC_DEFAULT, EM_DEFAULT,
                     OVR, NONENT, MERGE, SOURCE_SEG, merge_key)

BASE = "D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/.算力清单合并.ref/"
raw = json.load(open(BASE + "raw.json", encoding="utf-8"))

SUFFIX = ["股份有限公司", "有限责任公司", "有限公司", "集团股份公司", "集团"]
FOREIGN = {
    "Intel", "英特尔(中国)", "IBM", "Cavium", "超威半导体产品", "东芝", "WesternDigital",
    "施耐德", "ABB", "大金", "开利", "约克", "麦克维尔", "世图兹", "克莱门特",
    "康明斯", "卡特彼勒", "三菱", "德国MTU", "科勒", "威尔逊", "辛普森", "道康",
    "康普", "AmphenolICC", "安费诺", "台达电子", "维谛技术", "伊顿电源", "丹佛斯",
    "谷轮", "格兰富", "依必安派特", "亚马逊AWS", "希捷科技", "上海三星半导体",
    "是德科技", "康舒科技", "Amphenol", "Vertiv", "Schneider",
}


def norm(name: str) -> str:
    s = str(name).strip()
    s = str(name).replace("Ａ", "A")
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"^(\*?ST)", "", s)
    s = s.replace("股份有限公司", "").replace("有限责任公司", "").replace("有限公司", "")
    for suf in SUFFIX:
        if s.endswith(suf) and len(s) > len(suf) + 1:
            s = s[: -len(suf)]
    s = s.replace("中国联合网络通信", "中国联通")
    s = s.replace("中国移动通信集团", "中国移动")
    s = s.replace("中国电信集团", "中国电信")
    return s


def key_of(name: str) -> str:
    k = norm(name)
    k = merge_key(k)
    return k


ents, order = {}, []
records = []


def add(src, name, **kw):
    k = key_of(name)
    if k not in ents:
        ents[k] = {"key": k, "names": [], "srcs": [], "code": None, "exch": None,
                   "type": None, "seg": None, "note": None, "rel": None,
                   "ident": [], "odcc": None, "emind": None, "mcap": None,
                   "how": None, "block": None}
        order.append(k)
    e = ents[k]
    if name not in e["names"]:
        e["names"].append(name)
    if src not in e["srcs"]:
        e["srcs"].append(src)
    records.append(dict(src=src, name=name, key=k, **kw))
    return e


# ---- 原清单 ----
for x in raw["base"]:
    e = add("原清单", x["name"], cat=x.get("link"))
    e["code"] = str(x["code"]).zfill(6) if x["code"] else None
    e["exch"] = x["exch"]
    e["seg"] = OLD_SEG.get(x["link"], x["link"])
    e["type"] = "上市公司"
    e["note"] = x["note"]
    e["rel"] = "核心相关"
    e["how"] = "人工核定"

# ---- 信息源地图 83 ----
for x in raw["sourcemap"]:
    parts = [p.strip() for p in re.split(r"\s*/\s*", x["name"]) if p.strip()]
    if len(parts) == 1 and "/" in str(x["name"]):
        parts = [p.strip() for p in str(x["name"]).split("/") if p.strip()]
    for p in parts:
        e = add("信息源地图", p, cat=x.get("src"))
        if not e["seg"]:
            e["seg"] = OVR.get(key_of(p)) or SOURCE_SEG.get(str(x["seg"]).strip())
        if not e["type"]:
            e["type"] = x["type"]
        if not e["note"]:
            e["note"] = x["note"]
        e["ident"].append("信息源地图 · " + str(x["src"]))
        if not e["how"]:
            e["how"] = "人工核定"

# ---- ODCC ----
for x in raw["odcc"]:
    e = add("ODCC", x["name"], cat=x["cat"], member=x.get("member"))
    e["odcc"] = x["cat"]
    e["ident"].append("ODCC " + str(x["cat"]) + ("（成员单位）" if x["member"] == "是" else "（非会员）"))
    if not e["note"] and x["desc"]:
        e["note"] = str(x["desc"]).replace("\n", " ")[:90]

# ---- 智能计算联盟 ----
for x in raw["icc"]:
    e = add("智能计算联盟", x["name"], cat=x.get("level"))
    lv = str(x["level"] or "")
    if lv:
        e["ident"].append("中国智能计算产业联盟 · " + lv)

# ---- 方阵 ----
prev = None
for x in raw["fangzhen"]:
    if x.startswith("限公司") and prev:
        prev["names"].append(prev["names"][0] + x)
        records.append(dict(src="算力方阵", name=x, key=prev["key"]))
        prev["note"] = prev.get("note") or ("原名单换行断字，已合并为：" + prev["names"][-1])
        continue
    e = add("算力方阵", x, cat="成员单位")
    e["ident"].append("算力产业发展方阵 · 成员单位")
    prev = e

# ---- 东财算力概念 ----
for x in raw["aigu"]:
    e = add("东财算力概念", x["name"], cat=x.get("judge"))
    e["code"] = str(x["code"]).zfill(6)
    e["exch"] = x["board"]
    e["type"] = "上市公司"
    if not e["rel"]:
        e["rel"] = x["judge"]
    e["emind"] = x["emind"]
    e["mcap"] = x["mcap"]

# ---------------- 归类 ----------------
pending = []
for k in order:
    e = ents[k]
    if e["seg"]:
        continue
    if k in OVR:
        e["seg"] = OVR[k]
        e["how"] = "人工核定"
        continue
    if k in NONENT:
        e["seg"] = "算力需求方"
        e["how"] = "人工核定"
        e["type"] = "非企业主体"
        continue
    if e["odcc"] and e["odcc"] in ODCC_DEFAULT:
        e["seg"] = ODCC_DEFAULT[e["odcc"]]
        e["how"] = "规则推断"
        continue
    if e["emind"] and e["emind"] in EM_DEFAULT:
        e["seg"] = EM_DEFAULT[e["emind"]]
        e["how"] = "规则推断"
        continue
    e["seg"] = "待核实"
    e["how"] = "待核实"
    pending.append(k)

for k in order:
    ents[k]["block"] = BLOCK_OF.get(ents[k]["seg"] or "待核实", "待核实")

# ---------------- 类型 ----------------
for k in order:
    e = ents[k]
    if e["type"] == "非企业主体":
        continue
    if e["code"]:
        e["type"] = "上市公司"
    elif k in FOREIGN or any(n in FOREIGN for n in e["names"]):
        e["type"] = "外资企业"
    elif "分" in k and k.endswith("分"):
        e["type"] = "分支机构"
    elif "中国联通" in k or "中国移动" in k or "中国电信" in k:
        e["type"] = "集团/分支机构"
    elif any(x in k for x in ("集团", "控股")) and not e["code"]:
        e["type"] = "非上市企业"
    else:
        e["type"] = "非上市企业"

json.dump({"ents": ents, "order": order, "records": records},
          open(BASE + "merged.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("unique:", len(ents))
print("pending(no seg):", len(pending))
for p in pending:
    print("   P", p, ents[p]["srcs"], ents[p].get("odcc") or ents[p].get("emind") or "")
print()
import collections
print("types:", collections.Counter([ents[k]["type"] for k in order]))
print("how:", collections.Counter([ents[k]["how"] for k in order]))
print("weak:", sum(1 for k in order if ents[k]["rel"] == "弱相关/存疑"))
print()
print("待核实:")
print(" / ".join([k for k in order if ents[k]["seg"] == "待核实"]))
