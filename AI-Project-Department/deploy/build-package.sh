#!/usr/bin/env bash
# 打包脚本：在联网的构建机上跑一次，产出可离线部署到内网 Linux 的 tar.gz。
#
# 用法：
#   bash deploy/build-package.sh              # 安装依赖 + 构建 + 打包
#   SKIP_BUILD=1 bash deploy/build-package.sh # 复用已有 dist，只重新打包
#   OUT_DIR=/data/release bash deploy/build-package.sh
#
# 产物：release/chain-assistant-<版本>-<时间戳>.tar.gz（含 sha256）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$ROOT/frontend"
AGENT="$ROOT/agent"
OUT_DIR="${OUT_DIR:-$ROOT/release}"

log() { printf '\033[36m[package]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[package]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 1. 构建前端 ----------
DIST="${DIST:-$FRONTEND/dist-release}"
if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  log "跳过构建，复用现有前端产物"
else
  command -v pnpm >/dev/null 2>&1 || die "缺少 pnpm（构建机需要 Node 20+ 与 pnpm）"
  log "安装前端依赖"
  (cd "$FRONTEND" && pnpm install --frozen-lockfile)
  log "构建前端（public 里的地图/数据会一起拷进产物，体积约 1.1G，需要几分钟）"
  # 输出到独立目录 dist-release：全新目录无需清空旧文件，任何环境都能跑
  (cd "$FRONTEND" && pnpm exec vite build --outDir dist-release)
fi

[[ -f "$DIST/index.html" ]] || die "未找到 $DIST/index.html，构建失败"
[[ -f "$AGENT/data/chain.db" ]] || die "未找到 agent/data/chain.db，业务库缺失"

VERSION="$(sed -nE 's/^ *"version": *"([^"]+)".*/\1/p' "$FRONTEND/package.json" | head -1)"
VERSION="${TAG:-${VERSION:-0.1.0}}"
STAMP="$(date +%Y%m%d-%H%M)"
NAME="chain-assistant-${VERSION}-${STAMP}"

# ---------- 2. 组装目录 ----------
STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

log "组装发布目录"
mkdir -p "$STAGE/app/agent" "$STAGE/app/seed"

# 前端产物（含 public 下的数据、地图、字体）
cp -R "$DIST" "$STAGE/app/dist"

# 后端代码：只带运行时文件，不带 __pycache__ / 本地数据
for file in "$AGENT"/*.py; do
  cp "$file" "$STAGE/app/agent/"
done
rm -rf "$STAGE/app/agent/__pycache__"
cp -R "$AGENT/knowledge" "$STAGE/app/agent/knowledge"
cp "$AGENT/README.md" "$STAGE/app/agent/README.md" 2>/dev/null || true

# 初始业务库（首次安装时复制到数据目录；升级不会覆盖）
cp "$AGENT/data/chain.db" "$STAGE/app/seed/chain.db"

# 部署脚本与说明
cp "$ROOT/deploy/install.sh" "$ROOT/deploy/uninstall.sh" "$ROOT/deploy/README.md" "$STAGE/"
chmod +x "$STAGE/install.sh" "$STAGE/uninstall.sh"
printf 'version=%s\nbuilt_at=%s\n' "$VERSION" "$(date -Iseconds)" > "$STAGE/VERSION"

# ---------- 3. 打 tar.gz ----------
mkdir -p "$OUT_DIR"
ARCHIVE="$OUT_DIR/$NAME.tar.gz"
log "压缩（约 1.2G 原始数据，视磁盘速度需数分钟）"
if command -v pigz >/dev/null 2>&1; then
  tar -C "$STAGE" -cf - . | pigz -6 -p "$(nproc 2>/dev/null || echo 4)" > "$ARCHIVE"
else
  tar -C "$STAGE" -czf "$ARCHIVE" .
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && shasum -a 256 "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
fi

SIZE="$(du -h "$ARCHIVE" | awk '{print $1}')"
log "完成：$ARCHIVE（$SIZE）"
[[ -f "$ARCHIVE.sha256" ]] && log "校验：$ARCHIVE.sha256"
log "内网部署：scp 上传后执行  tar -xzf $NAME.tar.gz && sudo bash install.sh"
