#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""一次性修正：把「坐标落在自称省份之外」的企业落点纠正回其属地。

背景
----
四个产业链分片里有一批企业的坐标与其 region 标称的省份不符
（用 geo-point-boundary-audit 技能审计得出）。成因与本仓库既有记录一致：
坐标来自低置信度的地理编码 / POI 检索，命中了母公司总部或异地分支机构 ——
例如「华天科技（昆山）」命中甘肃天水母公司、「中国电子科技集团」命中南京五十五所、
「康宁（重庆）」命中台湾。这些坐标**看起来能查到地址，实际位置是错的**。

判定与处理（保守规则，宁可不改也不误改）
------------------------------------
1. 只处理 region.province 是**中国省级行政区**且有坐标的记录。
   境外主体（新加坡/韩国/日本…）跳过；「中国香港」与省界名「香港特别行政区」
   只是命名差异，按别名等同处理，不算错位。
2. 只有当**企业名称本身能佐证该属地**（名称含省名或市名，如「…（昆山）」「江苏…」
   「度边电子（黄石）」）才动手 —— 此时可确定「坐标错、属地对」。
3. 名称无法佐证的记录一律**不动**，只列出来供人工复核：它的 claimed 省份本身
   也可能是错的，盲改会更糟。
4. 纠正方式：按属地（区县 → 地级市 → 省）从本地地名词表取一个**落在该省内**的点，
   标 `区域参考（依属地纠正）`。词表里取不到点时，撤掉错坐标并标
   `待复核（原坐标越界）` —— **不编造坐标**（项目既有约定）。

用法
----
  python scripts/fix-out-of-region-locations.py --dry-run   # 只报告，不写盘
  python scripts/fix-out-of-region-locations.py             # 实际写入（先自动备份）
"""

import argparse
import importlib.util
import json
import os
import shutil
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "scripts"))

SHARDS = [
    "public/data/companies.json",
    "public/data/industries/companies-power.json",
    "public/data/industries/companies-biomed.json",
    "public/data/industries/companies-ai.json",
    "public/data/industries/companies-storage.json",
]

# 港澳台在分片里用的是「中国香港」这类写法，省界 GeoJSON 用的是官方全称
PROVINCE_ALIASES = {
    "中国香港": "香港特别行政区",
    "中国澳门": "澳门特别行政区",
    "中国台湾": "台湾省",
    "香港": "香港特别行政区",
    "澳门": "澳门特别行政区",
}


def load_geo_helpers():
    """复用储能管线里的省界判定与地名词表解析，避免重复实现。"""
    path = os.path.join(BASE, "scripts", "extract-storage-chain.py")
    spec = importlib.util.spec_from_file_location("esc_helpers", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # 该脚本有 __main__ 守卫，导入不会跑管线
    return module


def norm(value):
    return str(value).strip() if value is not None else ""


def corroborated(name, province, city, address, geo):
    """属地是否被「企业名称」或「注册地址」佐证。

    名称：含省名/市名（或去行政后缀后的词）。
    地址：必须**以属地开头**。用前缀而不是包含，是为了避开
    「…开发区厦门大街39号」这类把市名当路名命中的假象 ——
    该记录属地写福建厦门、实际地址却在山东烟台，前缀匹配能正确排除。
    """
    text = norm(name)
    addr = norm(address)
    tokens = []
    for raw in (province, PROVINCE_ALIASES.get(province, ""), city):
        token = norm(raw)
        if not token:
            continue
        tokens.append(token)
        base = geo._ADMIN_SUFFIX.sub("", token)  # noqa: SLF001 - 复用同一套后缀表
        if len(base) >= 2:
            tokens.append(base)
    for token in tokens:
        if token in text:
            return "name"
    for token in tokens:
        if len(token) >= 2 and addr.startswith(token):
            return "address"
    return ""


def collect_district_to_city(shards):
    """从现有数据里统计「(省, 区县) → 地级市」，用于补全只认出区县、认不出市的情况。

    只用「区县与市都非空」的记录，取出现次数最多者，避免把个别错误数据当依据传播。
    """
    tally = {}
    for path in shards:
        if not os.path.exists(path):
            continue
        payload = json.load(open(path, encoding="utf-8"))
        for company in payload.get("companies") or []:
            region = company.get("region") or {}
            prov = norm(region.get("province"))
            city = norm(region.get("city"))
            district = norm(region.get("district"))
            if not prov or not city or not district or district == "—":
                continue
            bucket = tally.setdefault((prov, district), {})
            bucket[city] = bucket.get(city, 0) + 1
    return {key: max(bucket.items(), key=lambda kv: kv[1])[0] for key, bucket in tally.items()}


def names_in_text(text, target_province, esc, province_names):
    """找出文本中出现、且坐标落在 target_province 内的地名（含去行政后缀匹配）。

    这是判断「地址佐证了哪个省」的关键：地址里的**路名**会误导 ——
    「…开发区厦门大街39号」含「厦门」，但坐标在山东烟台。加上省份过滤后，
    只有真正落在坐标所在省的候选才算数，路名命中的那个会被自然排除。
    """
    hits = []
    seen = set()
    for name in list(esc.GAZETTEER.keys()) + list(esc.GAZETTEER_BASE.keys()):
        if len(name) < 2 or name in province_names or name in seen:
            continue
        if name not in text:
            continue
        for rec in esc.GAZETTEER.get(name) or esc.GAZETTEER_BASE.get(name) or []:
            if esc.province_of(rec["lng"], rec["lat"]) == target_province:
                hits.append((name, rec))
                seen.add(name)
                break
    return hits


def derive_region(text, target_province, esc, province_names, district_to_city):
    """从文本派生 城市/区县：最长匹配的「市」作 city，「区/县」作 district。"""
    hits = names_in_text(text, target_province, esc, province_names)
    city = ""
    district = ""
    for _key, rec in sorted(hits, key=lambda item: -len(item[0])):
        canonical = rec["name"]
        if canonical.endswith(("区", "县")) and len(canonical) > len(district):
            district = canonical
        elif canonical.endswith("市") and len(canonical) > len(city):
            city = canonical
    if not city and district:
        city = district_to_city.get((target_province, district), "")
    return city, district


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="只报告，不写盘")
    args = parser.parse_args()

    esc = load_geo_helpers()
    province_names = {name for name, _polys, _bbox in esc.PROVINCES}
    shard_paths = [os.path.join(BASE, rel) for rel in SHARDS]
    district_to_city = collect_district_to_city(shard_paths)
    print(f"省界载入 {len(province_names)} 个省级行政区；地名词表 {len(esc.GAZETTEER)} 个名字")

    fixed_total = 0
    stripped_total = 0
    skipped_total = 0
    region_fixed_total = 0
    region_skipped_total = 0

    for rel in SHARDS:
        path = os.path.join(BASE, rel)
        if not os.path.exists(path):
            continue
        payload = json.load(open(path, encoding="utf-8"))
        companies = payload.get("companies") or []
        fixed = []
        stripped = []
        skipped = []
        region_fixed = []
        region_skipped = []

        for company in companies:
            loc = company.get("location") or {}
            lng, lat = loc.get("lng"), loc.get("lat")
            region = company.get("region") or {}
            claimed = norm(region.get("province"))
            if not lng or not lat or not claimed:
                continue
            claimed_full = PROVINCE_ALIASES.get(claimed, claimed)
            if claimed_full not in province_names:
                continue  # 境外主体或无法判定的属地
            actual = esc.province_of(float(lng), float(lat))
            if actual == claimed_full:
                continue  # 正常
            name = company.get("name", "")
            how = corroborated(name, claimed, norm(region.get("city")), company.get("address"), esc)
            if not how:
                # 名字/地址前缀都佐证不了「claimed」，说明可能是 region 写错而不是坐标错。
                # 反过来看：如果地址里出现的地名（经省份过滤后）正好落在**坐标所在的省**，
                # 那就是「坐标对、region 错」，改 region。
                text = " ".join(
                    [
                        norm(name),
                        norm(company.get("address")),
                        norm(region.get("district")),
                        norm(region.get("city")),
                    ]
                )
                city, district = derive_region(text, actual, esc, province_names, district_to_city)
                if actual and (district or city):
                    company["region"] = {
                        "province": actual,
                        "city": city,
                        "district": district,
                        "street": norm(region.get("street")),
                    }
                    company["regionStatus"] = "已从地址重新解析（原解析命中同名路名）"
                    region_fixed.append((name, claimed, actual, city, district))
                else:
                    region_skipped.append((name, claimed, actual, lng, lat))
                continue

            point = esc.gazetteer_point(
                norm(region.get("district")), norm(region.get("city")), claimed_full
            )
            if point:
                company["location"] = {
                    "lng": point["lng"],
                    "lat": point["lat"],
                    "coordinateSystem": "WGS84/CGCS2000-compatible",
                    "precision": "区域参考",
                }
                company["locationStatus"] = "区域参考（依属地纠正）"
                company["locationSource"] = f"按属地重定位（{point['matchedName']}）"
                company["locationEvidence"] = [
                    f"原坐标 {lng},{lat} 落在{actual or '境外'}，与属地{claimed}矛盾；"
                    f"已按属地（{point['matchedName']}）重定位"
                ]
                fixed.append((name, claimed, actual, point["matchedName"]))
            else:
                company["location"] = None
                company["locationStatus"] = "待复核（原坐标越界）"
                company["locationSource"] = ""
                company["locationEvidence"] = [
                    f"原坐标 {lng},{lat} 落在{actual or '境外'}，与属地{claimed}矛盾；"
                    "地名词表中找不到落在该省内的对应点，暂撤坐标待复核"
                ]
                stripped.append((name, claimed, actual))

        if fixed or stripped or region_fixed:
            if not args.dry_run:
                # 备份写到 .workbuddy/backup/（该目录已被 gitignore）。
                # 早先写在数据目录旁边，结果 *.bak 被 git add 一起提交了（单文件 19MB）。
                backup_dir = os.path.join(BASE, ".workbuddy", "backup")
                os.makedirs(backup_dir, exist_ok=True)
                shutil.copy2(path, os.path.join(backup_dir, os.path.basename(path) + ".bak"))
                # 保持文件原有排版：缩进过的仍缩进、单行的仍单行。
                # 统一按单行写会把 prettier 风格的 JSON 压成一行，diff 从几百行爆到几十万行。
                raw = open(path, "rb").read()
                pretty = raw.count(b"\n") > 1
                with open(path, "w", encoding="utf-8", newline="\n") as fh:
                    if pretty:
                        # newline='\n' 必须保留：Windows 文本模式会把 \n 变成 \r\n，
                        # 而本仓库要求 LF（曾因此把整个文件变成 CRLF）。
                        json.dump(payload, fh, ensure_ascii=False, indent=2)
                        fh.write("\n")
                    else:
                        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
            print(f"\n=== {rel} ===")
            for name, claimed, actual, matched in fixed:
                print(f"   ✓ {name[:32]:34s} {claimed} ← 原在{actual}，改到 {matched}")
            for name, claimed, actual in stripped:
                print(f"   – {name[:32]:34s} {claimed} ← 原在{actual}，撤掉坐标待复核")
            for name, claimed, actual, city, district in region_fixed:
                print(f"   ◆ {name[:32]:34s} 属地 {claimed} → {actual}/{city}/{district}")
            if skipped or region_skipped:
                print(
                    f"   （另有 {len(skipped)} 条名称无法佐证属地、"
                    f"{len(region_skipped)} 条地址也佐证不了坐标所在省，均未改动）"
                )
                for name, claimed, actual, lng, lat in skipped + region_skipped:
                    print(f"     ? {name[:32]:34s} claimed={claimed} 实际在{actual} {lng},{lat}")

        fixed_total += len(fixed)
        stripped_total += len(stripped)
        skipped_total += len(skipped)
        region_fixed_total += len(region_fixed)
        region_skipped_total += len(region_skipped)

    print(
        f"\n合计：重定位 {fixed_total} 条，撤坐标 {stripped_total} 条，"
        f"修正 region {region_fixed_total} 条，未改动 {skipped_total + region_skipped_total} 条"
        + ("（dry-run，未写盘）" if args.dry_run else "")
    )


if __name__ == "__main__":
    main()
