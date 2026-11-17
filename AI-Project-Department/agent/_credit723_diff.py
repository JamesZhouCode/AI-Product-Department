# -*- coding: utf-8 -*-
"""授信部 723 家 × 储能链口径落标：找出不在 core / related_active 的主体。

输出：
  agent/data/credit723-scope-diff.csv   723 行全量比对照
  agent/data/credit723-gap434.csv       其中缺口明细（含分组、同品牌线索、可升级建议）
"""
import collections
import csv
import json
import re
import unicodedata
from pathlib import Path

TXT = Path("G:/对公经营智能化项目/授信部723家储能行业客户.txt")
AUDIT = Path("G:/对公经营智能化项目/储能产业链/储能产业链-口径落标-2026-10-22.csv")
# 可选：渠道取数方案里的「名称分型」列，用来解释证据为什么薄
TYPE_XLSX = Path("G:/对公经营智能化项目/储能产业链/新型储能723户-渠道取数方案.xlsx")
CHAIN = Path("frontend/public/data/industries/storage-chain.json")
OUT_ALL = Path("agent/data/credit723-scope-diff.csv")
OUT_GAP = Path("agent/data/credit723-gap434.csv")

KEEP = ("core_main", "core_related", "related_active")
LABEL = {
    "core_main": "核心·主业",
    "core_related": "核心·业务之一",
    "related_active": "关联·已参与",
    "related_potential": "关联·潜在供应",
    "pending_verify": "待核实",
}
SUFFIX = ("股份有限公司", "有限责任公司", "有限公司", "集团有限公司", "集团", "股份", "公司")
PROV = (
    "内蒙古", "黑龙江", "北京", "天津", "上海", "重庆", "河北", "山西", "辽宁", "吉林",
    "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东",
    "广西", "海南", "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆",
)
CITY = (
    "石家庄", "呼和浩特", "乌鲁木齐", "哈尔滨", "鄂尔多斯", "张家港", "连云港", "马鞍山",
    "深圳", "广州", "杭州", "南京", "苏州", "宁波", "无锡", "常州", "青岛", "成都", "武汉",
    "西安", "合肥", "长沙", "郑州", "济南", "厦门", "大连", "沈阳", "长春", "福州", "南昌",
    "昆明", "贵阳", "南宁", "太原", "兰州", "银川", "西宁", "海口", "温州", "嘉兴", "绍兴",
    "湖州", "金华", "台州", "泉州", "东莞", "佛山", "珠海", "中山", "惠州", "扬州", "镇江",
    "泰州", "盐城", "徐州", "南通", "淮安", "宿迁", "芜湖", "洛阳", "宜昌", "襄阳", "株洲",
    "湘潭", "绵阳", "德阳", "宜宾", "柳州", "包头", "昆山", "常熟", "江阴", "慈溪", "余姚",
    "晋江", "龙口", "招远", "烟台", "潍坊", "淄博", "济宁", "临沂", "保定", "唐山", "廊坊",
)
GENERIC = {"中科", "中电", "中国", "东方", "华能", "国网", "南网", "电力", "电气", "能源", "新能源", "科技", "智能"}


def norm(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", str(text)).strip()
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[（(](中国|集团|有限)[)）]", "", text)
    return text


def trim_suffix(text):
    changed = True
    while changed:
        changed = False
        for s in SUFFIX:
            if text.endswith(s) and len(text) > len(s) + 2:
                text = text[: -len(s)]
                changed = True
                break
    return text


def key(text):
    return norm(trim_suffix(norm(text)))


def brand(text):
    t = key(text)
    for p in PROV:
        if t.startswith(p) and len(t) > len(p) + 2:
            t = t[len(p):]
            if t.startswith("省") or t.startswith("市"):
                t = t[1:]
            break
    for c in CITY:
        if t.startswith(c) and len(t) > len(c) + 2:
            t = t[len(c):]
            if t.startswith("市") or t.startswith("县") or t.startswith("区"):
                t = t[1:]
            break
    return t


def lcp(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def load_name_types():
    """从渠道取数方案读「名称分型」，读不到就返回空表。"""
    if not TYPE_XLSX.exists():
        return {}
    try:
        import openpyxl
    except ImportError:
        return {}
    wb = openpyxl.load_workbook(TYPE_XLSX, read_only=True)
    if "4-723户渠道归属" not in wb.sheetnames:
        wb.close()
        return {}
    rows = list(wb["4-723户渠道归属"].iter_rows(values_only=True))
    hdr = rows[0]
    idx = {h: i for i, h in enumerate(hdr)}
    out = {}
    for r in rows[1:]:
        nm = norm(r[idx["客户名称"]]) if "客户名称" in idx else ""
        if nm:
            out[nm] = {
                "名称分型": r[idx["名称分型"]] if "名称分型" in idx else "",
                "清单三级": r[idx["三级"]] if "三级" in idx else "",
                "取数渠道": r[idx["主渠道"]] if "主渠道" in idx else "",
            }
    wb.close()
    return out


def main():
    audit = list(csv.DictReader(AUDIT.open(encoding="utf-8-sig")))
    by_name = {norm(r["name"]): r for r in audit}
    by_key = collections.defaultdict(list)
    for r in audit:
        by_key[key(r["name"])].append(r)

    chain = json.loads(CHAIN.read_text(encoding="utf-8"))
    comp = {c["name"]: c for c in chain["companies"]}
    alias_to_name = {}
    for c in chain["companies"]:
        alias_to_name.setdefault(norm(c["name"]), c["name"])
        for a in c.get("aliases") or []:
            alias_to_name.setdefault(norm(a), c["name"])

    scope_of = {c["name"]: by_name.get(norm(c["name"]), {}).get("scope", "") for c in chain["companies"]}
    keep_brands = [(c["name"], brand(c["name"])) for c in chain["companies"] if scope_of.get(c["name"]) in KEEP]

    equity = collections.defaultdict(set)
    for rel in chain["relations"]:
        if rel.get("relationType") in ("股权", "同一实控人"):
            equity[rel["from"]].add(rel["to"])
            equity[rel["to"]].add(rel["from"])

    names = [x.strip() for x in TXT.read_text(encoding="utf-8-sig").splitlines() if x.strip()]
    types = load_name_types()
    rows = []
    for name in names:
        n = norm(name)
        hit, how = by_name.get(n), "精确名称"
        if not hit and n in alias_to_name:
            hit, how = by_name.get(norm(alias_to_name[n])), "链上别名"
        if not hit and len(by_key.get(key(name), [])) == 1:
            hit, how = by_key[key(name)][0], "去后缀匹配"
        canon = hit["name"] if hit else ""
        c = comp.get(canon, {})
        t = types.get(norm(name), {})
        rows.append({
            "清单名称": name,
            "链上主体": canon,
            "匹配方式": how,
            "口径": hit["scope"] if hit else "不在链",
            "口径中文": LABEL.get(hit["scope"], "不在链") if hit else "不在链",
            "行业地位": hit["status"] if hit else "",
            "一级环节": hit["level1"] if hit else "",
            "二级环节": hit["segments"] if hit else "",
            "相关度": hit["relevance"] if hit else "",
            "证据等级": hit["evidence"] if hit else "",
            "来源清单": hit["source"] if hit else "",
            "省份": (c.get("region") or {}).get("province") or "",
            "城市": (c.get("region") or {}).get("city") or "",
            "上市": "是" if c.get("companyType") == "listed" else "否",
            "股票代码": c.get("stockCode") or "",
            "链内关系数": c.get("relationCount") or 0,
            "名称分型": t.get("名称分型") or "",
            "清单三级": t.get("清单三级") or "",
            "同品牌主体": "",
            "线索类型": "",
            "建议动作": "",
        })

    gap = [r for r in rows if r["口径"] not in KEEP]

    for r in gap:
        canon = r["链上主体"]
        peers = [p for p in equity.get(canon, ()) if canon and scope_of.get(p) in KEEP]
        brand_key = brand(r["清单名称"])
        best, best_len, best_brand = "", 0, ""
        for cn, cb in keep_brands:
            n = lcp(brand_key, cb)
            if n >= 3 and n > best_len:
                best, best_len, best_brand = cn, n, brand_key[:n]
        if best:
            r["同品牌主体"] = f"{best}（品牌「{best_brand}」）"

        if peers:
            r["线索类型"] = "集团内已有核心/已参与主体（股权/实控人边）"
            r["建议动作"] = "按集团证据复核主体，可升 related_active"
        elif best:
            r["线索类型"] = "同品牌/疑似集团关系"
            r["建议动作"] = "先核母子关系，再定主体口径"
        elif "储能" in r["清单名称"]:
            r["线索类型"] = "主体名含储能、无链内交易"
            r["建议动作"] = "优先补项目/中标证据"
        elif (r["链内关系数"] or 0) > 0:
            r["线索类型"] = "有链内交易但名不含储能"
            r["建议动作"] = "按交易证据补 related_active"
        else:
            r["线索类型"] = "仅名称/经营范围对口"
            r["建议动作"] = "抽 10% 核订单，否则维持潜在"

    OUT_ALL.parent.mkdir(parents=True, exist_ok=True)
    cols = list(rows[0].keys())
    for path, data in ((OUT_ALL, rows), (OUT_GAP, gap)):
        with path.open("w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=cols)
            w.writeheader()
            w.writerows(data)

    print(f"清单 {len(rows)} 家，全部命中链上主体")
    for k, v in collections.Counter(r["口径中文"] for r in rows).most_common():
        print(f"  {k}: {v}")
    print(f"在 core/已参与 {len(rows) - len(gap)}；不在 {len(gap)}\n")
    print("缺口按线索类型：")
    for k, v in collections.Counter(r["线索类型"] for r in gap).most_common():
        print(f"  {k}: {v}")
    print("\n缺口按省份前 12：")
    for k, v in collections.Counter(r["省份"] or "未知" for r in gap).most_common(12):
        print(f"  {k}: {v}")
    print("\n缺口按一级环节：")
    seg = collections.Counter()
    for r in gap:
        for s in (r["一级环节"] or "未归类").split("；"):
            seg[s] += 1
    for k, v in seg.most_common():
        print(f"  {k}: {v}")
    print("\n缺口按名称分型 × 口径：")
    for k, v in sorted(collections.Counter((r["名称分型"] or "未知", r["口径中文"]) for r in gap).items()):
        print(f"  {k}: {v}")
    print("\n同品牌线索：")
    for r in gap:
        if r["同品牌主体"]:
            print(f"  {r['清单名称']} -> {r['同品牌主体']}")
    print("\n写出", OUT_ALL, "/", OUT_GAP)


if __name__ == "__main__":
    main()
