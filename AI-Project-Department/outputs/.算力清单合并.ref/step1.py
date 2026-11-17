# -*- coding: utf-8 -*-
"""step1: 主体归并 + 未归类清单"""
import json, re, collections

BASE = "D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/.算力清单合并.ref/"
raw = json.load(open(BASE + "raw.json", encoding="utf-8"))

SUFFIX = [
    "股份有限公司", "有限责任公司", "有限公司", "集团有限公司", "集团股份公司",
    "集团", "公司", "（中国）", "(中国)",
]

def norm(name: str) -> str:
    s = str(name).strip()
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"\s+", "", s)
    for suf in SUFFIX:
        if s.endswith(suf) and len(s) > len(suf) + 1:
            s = s[: -len(suf)]
    s = s.replace("中国联合网络通信", "中国联通")
    s = s.replace("中国移动通信", "中国移动")
    s = s.replace("中国电信集团", "中国电信")
    s = s.replace("中国电信股份", "中国电信")
    return s

# 品牌/简称 → 规范名（人工维护）
ALIAS = {
    "华为": "华为技术", "华为信息技术": "华为技术",
    "阿里云": "阿里云计算", "阿里云计算": "阿里云计算",
    "腾讯": "腾讯科技(深圳)", "深圳市腾讯计算机系统": "腾讯科技(深圳)", "腾讯科技": "腾讯科技(深圳)",
    "百度": "北京百度网讯", "百度云": "北京百度网讯", "百度网讯": "北京百度网讯",
    "京东": "京东", "字节跳动": "字节跳动",
    "联想": "联想(北京)信息技术", "联想集团": "联想集团",
    "曙光": "曙光信息产业", "中科曙光": "曙光信息产业", "曙光信息产业": "曙光信息产业",
    "英特尔": "英特尔(中国)", "英特尔(中国)": "英特尔(中国)",
    "亚马逊aws": "亚马逊AWS", "aws": "亚马逊AWS",
    "数据港": "上海数据港", "上海数据港": "上海数据港",
    "世纪互联": "北京世纪互联宽带数据中心", "北京世纪互联宽带数据中心": "北京世纪互联宽带数据中心",
    "万国数据": "万国数据",
    "中国联通": "中国联通", "中国移动": "中国移动", "中国电信": "中国电信",
    "超聚变": "超聚变数字技术", "超聚变数字技术": "超聚变数字技术",
    "华鲲振宇": "四川华鲲振宇", "四川华鲲振宇": "四川华鲲振宇",
    "长江计算": "武汉长江计算", "武汉长江计算": "武汉长江计算",
    "宝德": "宝德计算机", "宝德计算机": "宝德计算机",
    "燧原": "上海燧原科技", "上海遂原科技": "上海燧原科技", "上海燧原科技": "上海燧原科技",
    "壁仞": "上海壁仞科技", "上海壁仞智能科技": "上海壁仞科技", "上海壁仞科技": "上海壁仞科技",
    "沐曦": "沐曦集成电路(上海)", "沐曦集成电路(上海)": "沐曦集成电路(上海)",
    "寒武纪": "北京中科寒武纪", "中科寒武纪": "北京中科寒武纪", "北京中科寒武纪": "北京中科寒武纪",
    "海光": "海光信息技术", "海光信息": "海光信息",
    "北龙超云": "北京北龙超级云计算", "北京北龙超级云计算": "北京北龙超级云计算",
    "北京超级云计算中心": "北京北龙超级云计算",
    "新华三": "新华三技术", "新华三技术": "新华三技术",
    "紫光股份": "紫光股份", "浪潮": "浪潮信息",
    "中科可控": "中科可控", "长城超云": "长城超云",
    "中兴": "中兴通讯", "中兴通讯": "中兴通讯",
    "优刻得": "优刻得科技", "青云": "青云科技", "青云科技": "青云科技",
    "北森": "北森", "商汤": "北京市商汤科技开发", "北京市商汤科技开发": "北京市商汤科技开发",
    "科大讯飞": "科大讯飞", "讯飞": "科大讯飞",
    "润泽": "润泽科技", "润泽科技": "润泽科技",
    "秦淮数据": "北京秦淮数据", "北京秦淮数据": "北京秦淮数据",
    "中金数据": "中金数据集团", "中金数据集团": "中金数据集团",
    "城地香江": "城地香江",
    "东方通": "北京东方通科技", "北京东方通科技": "北京东方通科技",
    "安擎": "安擎计算机信息", "安擎计算机信息": "安擎计算机信息",
    "无问芯穹": "上海无问芯穹智能科技", "上海无问芯穹智能科技": "上海无问芯穹智能科技",
    "清程极智": "北京清程极智科技", "北京清程极智科技": "北京清程极智科技",
    "并行科技": "北京并行科技", "北京并行科技": "北京并行科技",
    "中科驭数": "中科驭数(北京)", "中科驭数(北京)": "中科驭数(北京)",
    "星云智联": "珠海星云智联科技", "珠海星云智联科技": "珠海星云智联科技",
    "安费诺amphenol": "安费诺", "安费诺": "安费诺",
    "维谛技术vertiv": "维谛技术", "维谛技术": "维谛技术", "维谛": "维谛技术",
    "台达电子": "台达电子", "台达": "台达电子",
    "伊顿电源": "伊顿电源", "伊顿": "伊顿电源",
    "丹佛斯": "丹佛斯", "谷轮": "谷轮", "格兰富": "格兰富", "依必安派特": "依必安派特",
    "易事特": "易事特集团", "易事特集团": "易事特集团",
    "广电运通": "广电运通集团", "广电运通集团": "广电运通集团",
    "荣联科技": "荣联科技集团", "荣联科技集团": "荣联科技集团",
    "软通动力": "软通动力信息技术(集团)", "软通动力信息技术(集团)": "软通动力信息技术(集团)",
    "软通智慧": "软通智慧信息技术", "软通智慧信息技术": "软通智慧信息技术",
    "神州泰岳": "北京神州泰岳软件", "北京神州泰岳软件": "北京神州泰岳软件",
    "金山云": "北京金山云网络技术", "北京金山云网络技术": "北京金山云网络技术",
    "九章云极": "北京九章云极科技", "北京九章云极科技": "北京九章云极科技",
    "首都在线": "首都在线",
}


def key_of(name: str) -> str:
    n = norm(name)
    low = n.lower()
    if low in ALIAS:
        return ALIAS[low]
    for k, v in ALIAS.items():
        if low == k:
            return v
    return n


def alias_lookup(name: str):
    n = norm(name)
    if n.lower() in ALIAS:
        return ALIAS[n.lower()]
    return n


# ---------------- 建立实体登记 ----------------
ents = {}          # key -> entity
order = []
records = []       # 原始记录（审计用）

def add(src, name, **kw):
    k = alias_lookup(name)
    if k not in ents:
        ents[k] = {"key": k, "names": [], "srcs": [], "code": None, "exch": None,
                   "type": None, "block": None, "seg": None, "note": None,
                   "rel": None, "ident": [], "odcc": None}
        order.append(k)
    e = ents[k]
    if name not in e["names"]:
        e["names"].append(name)
    if src not in e["srcs"]:
        e["srcs"].append(src)
    records.append(dict(src=src, name=name, **kw))
    return e

for x in raw["base"]:
    e = add("原清单", x["name"])
    e["code"] = str(x["code"]).zfill(6) if x["code"] else None
    e["exch"] = x["exch"]
    e["seg"] = x["link"]
    e["block"] = x["seg"]
    e["type"] = "上市公司"
    e["note"] = x["note"]
    e["rel"] = "核心相关"

for x in raw["sourcemap"]:
    for part in re.split(r"\s*/\s*", x["name"]):
        if not part.strip():
            continue
        e = add("信息源地图", part.strip())
        e["seg"] = x["seg"]
        e["type"] = e["type"] or x["type"]
        e["note"] = e["note"] or x["note"]
        e["ident"].append("信息源地图：" + str(x["src"]))

for x in raw["odcc"]:
    e = add("ODCC", x["name"])
    e["odcc"] = x["cat"]
    e["ident"].append("ODCC " + str(x["cat"]) + ("·成员单位" if x["member"] == "是" else ""))
    if x["desc"] and not e["note"]:
        e["note"] = str(x["desc"]).replace("\n", " ")[:80]

for x in raw["icc"]:
    e = add("智能计算联盟", x["name"])
    lv = str(x["level"] or "")
    if lv and not any(ch.isdigit() for ch in lv):
        e["ident"].append("智能计算联盟·" + lv)
    elif lv:
        e["ident"].append("智能计算联盟·" + lv)

for x in raw["fangzhen"]:
    add("算力方阵", x)

for x in raw["aigu"]:
    e = add("东财算力概念", x["name"])
    e["code"] = str(x["code"]).zfill(6)
    e["exch"] = x["board"]
    e["type"] = "上市公司"
    e["rel"] = x["judge"]
    e["emind"] = x["emind"]

print("unique entities:", len(ents))
sizes = collections.Counter(len([r for r in records if alias_lookup(r["name"]) == k]) for k in ents)
print("multi-source entities:", sum(1 for k in ents if len(ents[k]["srcs"]) > 1))

# 未归类（无环节）主体
noSeg = [k for k in order if not ents[k]["seg"]]
print("no seg:", len(noSeg))

json.dump({"ents": ents, "order": order, "records": records},
          open(BASE + "registry.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# 打印疑似同一主体（包含关系）供人工确认
keys = [ents[k]["key"] for k in order]
sus = []
for i, a in enumerate(keys):
    for b in keys[i + 1:]:
        if len(a) >= 3 and len(b) >= 3 and (a in b or b in a):
            sus.append((a, b))
print("contains-suspect pairs:", len(sus))
for a, b in sus[:80]:
    print("   ", a, "|", b)
