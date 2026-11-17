#!/usr/bin/env bash
# 生成全国 OSM 街道级底图 frontend/public/map/osm-china.pmtiles
#
# 依赖：JDK 21+、curl、unzip、约 25GB 空闲磁盘（临时文件 + 产物）。
# 全程联网（仅构建机需要；运行期零外网请求）。
#
# 用法：
#   bash tools/build_osm_basemap.sh              # 完整流程
#   SKIP_DOWNLOAD=1 bash tools/build_osm_basemap.sh   # 已有 data/sources 时只切片
#
# 数据来源与许可：
#   - 中国 OSM 数据  china-latest.osm.pbf   © OpenStreetMap contributors, ODbL 1.0
#     镜像：download.openstreetmap.fr（Geofabrik 原始站国内不可达时用）
#   - 水系面  water-polygons-split-3857.zip  osmdata.openstreetmap.de, ODbL/ODbL 衍生
#   - 湖泊中心线 lake_centerline.shp.zip     github.com/acalcutt/osm-lakelines, ODbL
#   - Natural Earth 矢量库（公有领域，仅作低层级底衬，不输出其国界）
#   - 切片工具 Planetiler（Apache-2.0），OpenMapTiles schema（BSD-3）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/tools/basemap-build"
SRC="$WORK/data/sources"
OUT="$ROOT/frontend/public/map/osm-china.pmtiles"
PBF_URL="https://download.openstreetmap.fr/extracts/asia/china-latest.osm.pbf"
PBF_SIZE=1783708677 # 若镜像更新需同步调整；不一致时脚本按实际 HEAD 值重取

log() { printf '\033[36m[basemap]\033[0m %s\n' "$*"; }

mkdir -p "$WORK" "$SRC" "$(dirname "$OUT")"
cd "$WORK"

# ---------- 1. 工具 ----------
if [[ ! -f planetiler.jar ]]; then
  log "下载 planetiler.jar（GitHub 镜像）"
  curl -L --max-time 600 -o planetiler.jar \
    "https://ghfast.top/https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar"
fi
java -version 2>&1 | head -1

# ---------- 2. 数据 ----------
if [[ "${SKIP_DOWNLOAD:-0}" != "1" ]]; then
  if [[ ! -f china-latest.osm.pbf ]] || [[ "$(stat -c %s china-latest.osm.pbf)" != "$PBF_SIZE" ]]; then
    log "分段下载中国 OSM 数据（单连接仅 20KB/s，必须多线程）"
    bash "$WORK/fetch_parts.sh" "$PBF_URL" "$PBF_SIZE" 16 china-latest.osm.pbf
  fi

  # 辅助数据：Planetiler 若发现缺文件会自动下载，但 osmdata/naciscdn 单连接极慢，
  # 这里预先用多线程/镜像下好，让切片阶段完全离线。
  [[ -f "$SRC/water-polygons-split-3857.zip" ]] || {
    log "分段下载水系面（933MB）"
    bash "$WORK/fetch_parts.sh" \
      "https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip" \
      933170352 24 "$SRC/water-polygons-split-3857.zip"
  }
  [[ -f "$SRC/lake_centerline.shp.zip" ]] || {
    log "下载湖泊中心线（81MB）"
    curl -L -o "$SRC/lake_centerline.shp.zip" \
      "https://ghfast.top/https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip"
  }
  [[ -f "$SRC/natural_earth_vector.sqlite.zip" ]] || {
    log "下载 Natural Earth 矢量库（434MB，HuggingFace 镜像）"
    curl -L -o "$SRC/natural_earth_vector.sqlite.zip" \
      "https://hf-mirror.com/datasets/DataDock/naturalearthdata/resolve/main/5.1.2/natural_earth_vector.sqlite.zip"
  }
fi

# ---------- 3. 切片 ----------
log "Planetiler 切片（z0-z14，8 核约 1-2 小时）"
rm -f china-osm.pmtiles
java -Xmx10g -jar planetiler.jar \
  --osm-path=china-latest.osm.pbf \
  --output=china-osm.pmtiles \
  --maxzoom=14 \
  --force \
  --storage=mmap \
  --tmpdir=tmp

# ---------- 4. 安装到前端 ----------
cp china-osm.pmtiles "$OUT"
log "完成：$OUT（$(du -h "$OUT" | cut -f1)）"
