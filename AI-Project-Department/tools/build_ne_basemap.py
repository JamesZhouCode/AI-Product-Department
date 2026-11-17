#!/usr/bin/env python3
"""从 Natural Earth 生成中国区底图 GeoJSON（陆地 / 湖泊 / 河流 / 城市点）。

Natural Earth 全部数据为公有领域（public domain），官方条款明确：
  "No permission is needed to use Natural Earth. Crediting the authors is unnecessary."
可商用、可修改、不要求署名 —— 因此本生成物不再需要 OpenStreetMap 的 ODbL 署名。

用法（零第三方依赖，Python 3.7+）：
    python tools/build_ne_basemap.py            # 数据已在 tools/ne-data/ 时直接生成
    python tools/build_ne_basemap.py --download # 先从 naciscdn.org 拉取原始 shapefile

产物（写入 frontend/public/data/basemap/）：
    land.geojson     周边陆地（只作背景，不画国界线）
    lakes.geojson    湖泊面
    rivers.geojson   河流线
    cities.geojson   城市点（含中文名、人口、层级）

注意：本脚本刻意**不输出 Natural Earth 的国界/省界**。NE 的国界是国际口径
（台湾单列、藏南与阿克赛钦按实控线、南海诸岛缺失），与我国标准地图不一致，
直接使用会构成"问题地图"。国界与省界仍使用国内口径数据，见
frontend/public/data/china-provinces.geojson。
"""

import json
import math
import os
import struct
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NE_DIR = os.path.join(ROOT, "tools", "ne-data")
OUT_DIR = os.path.join(ROOT, "frontend", "public", "data", "basemap")

# 周边陆地范围（比中国大一圈，给邻国留出背景，但不下发全球数据）
LAND_BBOX = (58.0, -6.0, 152.0, 62.0)
# 湖泊/河流范围
WATER_BBOX = (70.0, 0.0, 140.0, 56.0)
# 城市点范围（含南海诸岛方向）
CITY_BBOX = (72.0, 2.0, 136.0, 54.0)

SOURCES = {
    "land": "https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip",
    "lakes": "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip",
    "rivers": "https://naciscdn.org/naturalearth/10m/physical/ne_10m_rivers_lake_centerlines.zip",
    "places": "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip",
}
DIRS = {"land": "land", "lakes": "lakes", "rivers": "rivers", "places": "places"}
STEMS = {
    "land": "ne_10m_land",
    "lakes": "ne_10m_lakes",
    "rivers": "ne_10m_rivers_lake_centerlines",
    "places": "ne_10m_populated_places",
}


# --------------------------- Shapefile 读取 ---------------------------


def read_dbf(path):
    """读取 DBF 属性表，返回 dict 列表（与 shp 记录顺序一致）。"""
    with open(path, "rb") as handle:
        header = handle.read(32)
        count = struct.unpack("<I", header[4:8])[0]
        header_len = struct.unpack("<H", header[8:10])[0]
        record_len = struct.unpack("<H", header[10:12])[0]
        fields = []
        while True:
            desc = handle.read(32)
            if not desc or desc[0] == 0x0D:
                break
            name = desc[:11].split(b"\x00")[0].decode("latin1").strip()
            fields.append((name, chr(desc[11]), desc[16]))
        handle.seek(header_len)
        rows = []
        for _ in range(count):
            raw = handle.read(record_len)
            if not raw:
                break
            pos = 1  # 跳过删除标记
            row = {}
            for name, ftype, flen in fields:
                chunk = raw[pos : pos + flen]
                pos += flen
                text = chunk.decode("utf-8", "replace").replace("\x00", "").strip()
                if ftype in ("N", "F"):
                    try:
                        row[name] = float(text) if "." in text else int(text)
                    except ValueError:
                        row[name] = None
                else:
                    row[name] = text
            rows.append(row)
        return rows


def read_shp(path):
    """读取 SHP 几何，返回 [(shape_type, parts)]；parts 为环/线的坐标列表。"""
    shapes = []
    with open(path, "rb") as handle:
        handle.seek(100)
        while True:
            rec = handle.read(8)
            if len(rec) < 8:
                break
            length = struct.unpack(">I", rec[4:8])[0] * 2
            body = handle.read(length)
            if len(body) < 4:
                break
            stype = struct.unpack("<i", body[0:4])[0]
            if stype == 0:
                shapes.append((0, []))
                continue
            if stype == 1:  # Point
                x, y = struct.unpack("<dd", body[4:20])
                shapes.append((1, [[(x, y)]]))
                continue
            if stype not in (3, 5):  # 其它类型（多点/多面片）本脚本不使用
                shapes.append((0, []))
                continue
            n_parts, n_points = struct.unpack("<ii", body[36:44])
            parts_idx = struct.unpack("<%di" % n_parts, body[44 : 44 + 4 * n_parts])
            pts_off = 44 + 4 * n_parts
            raw_pts = struct.unpack("<%dd" % (n_points * 2), body[pts_off : pts_off + 16 * n_points])
            pts = [(raw_pts[i], raw_pts[i + 1]) for i in range(0, len(raw_pts), 2)]
            rings = []
            for i, start in enumerate(parts_idx):
                end = parts_idx[i + 1] if i + 1 < len(parts_idx) else n_points
                rings.append(pts[start:end])
            shapes.append((stype, rings))
    return shapes


# --------------------------- 几何处理 ---------------------------


def dp_simplify(points, tolerance):
    """Douglas-Peucker 折线简化。"""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, best_idx = -1.0, -1
        for idx in range(start + 1, end):
            px, py = points[idx]
            if norm == 0:
                dist = math.hypot(px - ax, py - ay)
            else:
                dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if dist > best:
                best, best_idx = dist, idx
        if best > tolerance:
            keep[best_idx] = True
            stack.append((start, best_idx))
            stack.append((best_idx, end))
    return [p for p, k in zip(points, keep) if k]


def clip_ring(ring, bbox):
    """Sutherland-Hodgman：把闭合环裁剪到矩形内。"""
    minx, miny, maxx, maxy = bbox

    def clip_edge(points, inside, intersect):
        out = []
        for i in range(len(points)):
            cur = points[i]
            prev = points[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(intersect(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(intersect(prev, cur))
        return out

    def ix_vertical(p1, p2, x):
        t = (x - p1[0]) / (p2[0] - p1[0])
        return (x, p1[1] + t * (p2[1] - p1[1]))

    def ix_horizontal(p1, p2, y):
        t = (y - p1[1]) / (p2[1] - p1[1])
        return (p1[0] + t * (p2[0] - p1[0]), y)

    pts = ring
    pts = clip_edge(pts, lambda p: p[0] >= minx, lambda a, b: ix_vertical(a, b, minx))
    if not pts:
        return []
    pts = clip_edge(pts, lambda p: p[0] <= maxx, lambda a, b: ix_vertical(a, b, maxx))
    if not pts:
        return []
    pts = clip_edge(pts, lambda p: p[1] >= miny, lambda a, b: ix_horizontal(a, b, miny))
    if not pts:
        return []
    pts = clip_edge(pts, lambda p: p[1] <= maxy, lambda a, b: ix_horizontal(a, b, maxy))
    return pts


def clip_line(points, bbox):
    """把折线按矩形裁剪，返回若干段（矩形外的段丢弃）。"""
    minx, miny, maxx, maxy = bbox
    segments, current = [], []
    for x, y in points:
        if minx <= x <= maxx and miny <= y <= maxy:
            current.append((x, y))
        else:
            if len(current) > 1:
                segments.append(current)
            current = []
    if len(current) > 1:
        segments.append(current)
    return segments


def round_coords(points, digits=4):
    return [[round(x, digits), round(y, digits)] for x, y in points]


def points_in_bbox(points, bbox):
    for x, y in points:
        if bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3]:
            return True
    return False


# --------------------------- 数据生成 ---------------------------


def ensure_data(download=False):
    for key, url in SOURCES.items():
        stem = STEMS[key]
        target = os.path.join(NE_DIR, DIRS[key], stem + ".shp")
        if os.path.exists(target):
            continue
        if not download:
            raise SystemExit(
                "缺少 Natural Earth 数据：%s\n先执行 python tools/build_ne_basemap.py --download" % target
            )
        zip_path = os.path.join(NE_DIR, stem + ".zip")
        os.makedirs(os.path.dirname(target), exist_ok=True)
        os.makedirs(NE_DIR, exist_ok=True)
        print("下载 %s" % url)
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(os.path.join(NE_DIR, DIRS[key]))
        os.remove(zip_path)


def load_layer(key):
    stem = STEMS[key]
    base = os.path.join(NE_DIR, DIRS[key], stem)
    return read_shp(base + ".shp"), read_dbf(base + ".dbf")


def build_land():
    shapes, _ = load_layer("land")
    features = []
    for _stype, rings in shapes:
        for ring in rings:
            if not points_in_bbox(ring, LAND_BBOX):
                continue
            clipped = clip_ring(ring, LAND_BBOX)
            if len(clipped) < 4:
                continue
            simplified = dp_simplify(clipped, 0.02)
            if len(simplified) < 4:
                continue
            coordinates = round_coords(simplified, 3)
            if coordinates[0] != coordinates[-1]:
                coordinates.append(coordinates[0])
            features.append(
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "Polygon", "coordinates": [coordinates]},
                }
            )
    return {"type": "FeatureCollection", "features": features}


def build_lakes():
    shapes, rows = load_layer("lakes")
    features = []
    for (stype, rings), row in zip(shapes, rows):
        if stype != 5 or not rings:
            continue
        if not points_in_bbox(rings[0], WATER_BBOX):
            continue
        for ring in rings:
            clipped = clip_ring(ring, WATER_BBOX)
            if len(clipped) < 4:
                continue
            simplified = dp_simplify(clipped, 0.01)
            if len(simplified) < 4:
                continue
            coordinates = round_coords(simplified, 3)
            if coordinates[0] != coordinates[-1]:
                coordinates.append(coordinates[0])
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "name": row.get("name_zh") or row.get("name") or "",
                        "rank": row.get("scalerank") or 10,
                    },
                    "geometry": {"type": "Polygon", "coordinates": [coordinates]},
                }
            )
    return {"type": "FeatureCollection", "features": features}


def build_rivers():
    shapes, rows = load_layer("rivers")
    features = []
    for (stype, rings), row in zip(shapes, rows):
        if stype != 3 or not rings:
            continue
        rank = row.get("scalerank")
        if rank is None or rank > 8:
            continue
        for line in rings:
            if not points_in_bbox(line, WATER_BBOX):
                continue
            for segment in clip_line(line, WATER_BBOX):
                simplified = dp_simplify(segment, 0.01)
                if len(simplified) < 2:
                    continue
                features.append(
                    {
                        "type": "Feature",
                        "properties": {
                            "name": row.get("name_zh") or row.get("name") or "",
                            "rank": rank,
                        },
                        "geometry": {"type": "LineString", "coordinates": round_coords(simplified, 3)},
                    }
                )
    return {"type": "FeatureCollection", "features": features}


def build_cities():
    shapes, rows = load_layer("places")
    features = []
    for (stype, rings), row in zip(shapes, rows):
        if stype != 1 or not rings:
            continue
        lon, lat = rings[0][0]
        if not (CITY_BBOX[0] <= lon <= CITY_BBOX[2] and CITY_BBOX[1] <= lat <= CITY_BBOX[3]):
            continue
        pop = row.get("POP_MAX") or 0
        capital = row.get("ADM0CAP") or 0
        # 只保留地级市量级以上的点，避免把底图塞满
        if pop < 200000 and not capital:
            continue
        name = row.get("NAME_ZH") or row.get("NAME") or ""
        if not name:
            continue
        # 台湾岛标注按国内制图惯例显示为省级名称「台湾」（置于岛中心），
        # 不以「台北」市名充当该岛注记；岛上其余城市点标记 taiwan=1，
        # 由前端单独图层控制（低层级只显示省名，放大后才出现城市名）。
        if name == "台北":
            name = "台湾"
            en_name = "Taiwan"
            lon, lat = 121.0, 23.7
            on_taiwan = 0
        else:
            en_name = row.get("NAME") or ""
            on_taiwan = int(119.5 <= lon <= 122.5 and 21.5 <= lat <= 25.6)
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "name": name,
                    "en": en_name,
                    "pop": int(pop),
                    "capital": int(capital),
                    "taiwan": on_taiwan,
                },
                "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            }
        )
    features.sort(key=lambda f: -f["properties"]["pop"])
    return {"type": "FeatureCollection", "features": features}


def write(name, payload):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    size = os.path.getsize(path) / 1024.0
    print("  %-16s %5d 要素  %7.1f KB" % (name, len(payload["features"]), size))


def main():
    ensure_data(download="--download" in sys.argv)
    print("生成中国区底图（Natural Earth，公有领域）：")
    write("land.geojson", build_land())
    write("lakes.geojson", build_lakes())
    write("rivers.geojson", build_rivers())
    write("cities.geojson", build_cities())
    print("完成 → frontend/public/data/basemap/")


if __name__ == "__main__":
    main()
