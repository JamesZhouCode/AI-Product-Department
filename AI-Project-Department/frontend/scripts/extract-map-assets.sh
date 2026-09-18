#!/usr/bin/env bash
set -euo pipefail

# 构建机联网执行一次即可。运行时地图只读取 public/map 下的本地文件。
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"
# Protomaps 只保留最近几天的构建，固定日期约一周即失效。
# 若下载 404，请到 https://build.protomaps.com/ 取一个可用日期后覆盖：
#   PROTOMAPS_BUILD_DATE=YYYYMMDD ./scripts/extract-map-assets.sh
BUILD_DATE="${PROTOMAPS_BUILD_DATE:-20260910}"
SOURCE="https://build.protomaps.com/${BUILD_DATE}.pmtiles"

# 切到项目根目录并使用相对路径：Windows Git Bash 下 pwd 会返回 /c/... 形式，
# 直接把该绝对路径交给 node 会被解析成 C:\c\... 而找不到模块。
cd "$ROOT_DIR"

mkdir -p public/map

if command -v "$PMTILES_BIN" >/dev/null 2>&1 || [ -x "$PMTILES_BIN" ]; then
  echo "Extracting nationwide overview (z0-z10) with pmtiles CLI..."
  "$PMTILES_BIN" extract "$SOURCE" public/map/china-overview.pmtiles \
    --bbox=73,18,135,54 --maxzoom=10 --download-threads=4

  echo "Extracting Shanghai detail (z9-z15; overview archive covers z0-z10)..."
  "$PMTILES_BIN" extract "$SOURCE" public/map/shanghai-detail.pmtiles \
    --bbox=120.82,30.63,122.15,31.90 --minzoom=9 --maxzoom=15 --download-threads=4
else
  echo "pmtiles CLI not found; using the bundled Node PMTiles extractor."
  node scripts/extract-pmtiles.mjs --source="$SOURCE" \
    --output=public/map/china-overview.pmtiles --bbox=73,18,135,54 --minzoom=0 --maxzoom=10
  LOW="public/map/.shanghai-detail-low.pmtiles"
  HIGH="public/map/.shanghai-detail-high.pmtiles"
  node scripts/extract-pmtiles.mjs --source="$SOURCE" \
    --output="$LOW" --bbox=120.82,30.63,122.15,31.90 --minzoom=9 --maxzoom=14
  node scripts/extract-pmtiles.mjs --source="$SOURCE" \
    --output="$HIGH" --bbox=120.82,30.63,122.15,31.90 --minzoom=15 --maxzoom=15
  node scripts/merge-pmtiles.mjs --inputs="$LOW,$HIGH" \
    --output=public/map/shanghai-detail.pmtiles --bbox=120.82,30.63,122.15,31.90 --minzoom=9 --maxzoom=15
fi

if command -v "$PMTILES_BIN" >/dev/null 2>&1 || [ -x "$PMTILES_BIN" ]; then
  echo "Done. Verify archives with: $PMTILES_BIN verify public/map/*.pmtiles"
else
  echo "Done. Verify PMTiles magic with: head -c 2 public/map/*.pmtiles"
fi

node scripts/verify-map-assets.mjs
