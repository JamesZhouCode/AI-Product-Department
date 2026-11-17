#!/usr/bin/env bash
# 构建 Docker 镜像并导出为离线镜像包（内网 docker load 导入，全程不需内网拉镜像）。
#
# 用法：
#   bash deploy/docker/build-image.sh                        # 按构建机架构构建 + 导出
#   PLATFORM=linux/arm64 bash deploy/docker/build-image.sh   # 交叉构建 arm64（内网信创服务器）
#   PLATFORM=linux/amd64 bash deploy/docker/build-image.sh   # 显式指定 amd64
#   SKIP_BUILD=1 bash deploy/docker/build-image.sh           # 复用已有 dist-release
#   BASE_IMAGE=docker.m.daocloud.io/library/python:3.12-slim bash deploy/docker/build-image.sh
#                                                           # 拉不到 Docker Hub 时走镜像源
#
# 产物：release/chain-assistant-image-<版本>-<架构>-<时间戳>.tar.gz + sha256
#   内网：docker load -i 包名.tar.gz（较老 docker 不支持 gz 时先 gunzip）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND="$ROOT/frontend"
AGENT="$ROOT/agent"
OUT_DIR="${OUT_DIR:-$ROOT/release}"

log() { printf '\033[36m[docker]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[docker]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "本机未安装 docker CLI"
docker info >/dev/null 2>&1 || die "Docker 守护进程未运行（本机未装 Docker Desktop 时请在有 Docker 的构建机上执行）"

# ---------- 1. 目标架构 ----------
HOST_ARCH="$(docker version --format '{{.Server.Arch}}' 2>/dev/null || echo unknown)"
case "$HOST_ARCH" in
  amd64|x86_64) NATIVE_PLATFORM="linux/amd64" ;;
  arm64|aarch64) NATIVE_PLATFORM="linux/arm64" ;;
  *) NATIVE_PLATFORM="linux/$HOST_ARCH" ;;
esac
PLATFORM="${PLATFORM:-$NATIVE_PLATFORM}"
case "$PLATFORM" in
  *,*) die "离线包只能单架构导出；多架构请分两次构建（PLATFORM=linux/amd64 / linux/arm64）" ;;
esac
case "$PLATFORM" in
  linux/arm64|linux/aarch64) ARCH_TAG=arm64 ;;
  linux/amd64|linux/x86_64) ARCH_TAG=amd64 ;;
  *) ARCH_TAG="${PLATFORM#*/}" ;;
esac

BASE_IMAGE="${BASE_IMAGE:-python:3.12-slim}"
if [[ "$PLATFORM" != "$NATIVE_PLATFORM" ]]; then
  log "跨架构构建：$PLATFORM（构建机为 $NATIVE_PLATFORM，使用 QEMU 模拟，速度较慢）"
fi
docker buildx version >/dev/null 2>&1 && HAS_BUILDX=1 || HAS_BUILDX=0
[[ "$PLATFORM" == "$NATIVE_PLATFORM" || "$HAS_BUILDX" == "1" ]] \
  || die "跨架构构建需要 docker buildx（Docker 19.03+ / Docker Desktop 自带）"

# ---------- 2. 前端产物 ----------
DIST="${DIST:-$FRONTEND/dist-release}"
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  command -v pnpm >/dev/null 2>&1 || die "缺少 pnpm"
  log "构建前端"
  (cd "$FRONTEND" && pnpm install --frozen-lockfile && pnpm exec vite build --outDir dist-release)
fi
[[ -f "$DIST/index.html" ]] || die "未找到 $DIST/index.html"
[[ -f "$AGENT/data/chain.db" ]] || die "未找到 agent/data/chain.db"

VERSION="$(sed -nE 's/^ *"version": *"([^"]+)".*/\1/p' "$FRONTEND/package.json" | head -1)"
VERSION="${TAG:-${VERSION:-0.1.0}}"
STAMP="$(date +%Y%m%d-%H%M)"

# ---------- 3. 组装构建上下文（只放运行所需，避免把 2G 仓库塞进 context） ----------
STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$STAGE/app/agent" "$STAGE/app/seed"
cp -R "$DIST" "$STAGE/app/dist"
for file in "$AGENT"/*.py; do cp "$file" "$STAGE/app/agent/"; done
rm -rf "$STAGE/app/agent/__pycache__"
cp -R "$AGENT/knowledge" "$STAGE/app/agent/knowledge"
cp "$AGENT/data/chain.db" "$STAGE/app/seed/chain.db"
cp "$ROOT/deploy/docker/Dockerfile" "$ROOT/deploy/docker/docker-entrypoint.sh" "$STAGE/"
chmod +x "$STAGE/docker-entrypoint.sh"

# ---------- 4. 构建镜像 ----------
IMAGE="chain-assistant:${VERSION}"
mkdir -p "$OUT_DIR"
TAR="$OUT_DIR/.chain-assistant-${ARCH_TAG}.tar"
ARCHIVE="$OUT_DIR/chain-assistant-image-${VERSION}-${ARCH_TAG}-${STAMP}.tar.gz"

log "构建镜像 $IMAGE（$PLATFORM，基础镜像 $BASE_IMAGE，约 1.2G 上下文，需几分钟）"
if [[ "$HAS_BUILDX" == "1" ]]; then
  if [[ "$PLATFORM" == "$NATIVE_PLATFORM" ]]; then
    docker buildx build --platform "$PLATFORM" --provenance=false --sbom=false \
      --build-arg "BASE_IMAGE=$BASE_IMAGE" \
      -t "$IMAGE" -t "chain-assistant:latest" --load "$STAGE"
    docker save -o "$TAR" "$IMAGE"
  else
    # 跨架构不能 --load 本机守护进程，直接导出 docker 归档（等价于 docker save 的 tar）
    docker buildx build --platform "$PLATFORM" --provenance=false --sbom=false \
      --build-arg "BASE_IMAGE=$BASE_IMAGE" \
      -t "$IMAGE" -t "chain-assistant:latest" \
      --output "type=docker,dest=$TAR" "$STAGE"
  fi
else
  docker build --build-arg "BASE_IMAGE=$BASE_IMAGE" -t "$IMAGE" -t "chain-assistant:latest" "$STAGE"
  docker save -o "$TAR" "$IMAGE"
fi

# ---------- 5. 校验架构并导出离线包 ----------
CONFIG="$(tar -xOf "$TAR" manifest.json | sed -nE 's/.*"Config":"([^"]+)".*/\1/p' | head -1)"
IMG_ARCH="$(tar -xOf "$TAR" "$CONFIG" 2>/dev/null | grep -o '"architecture":"[^"]*"' | head -1 | cut -d'"' -f4)"
if [[ -n "$IMG_ARCH" && "$IMG_ARCH" != "$ARCH_TAG" ]]; then
  rm -f "$TAR"
  die "镜像架构 $IMG_ARCH 与目标 $ARCH_TAG 不一致，已中止"
fi
log "镜像架构校验：linux/${IMG_ARCH:-$ARCH_TAG}"

log "导出镜像包（gzip，约 500M~1G，需几分钟）"
gzip -c "$TAR" > "$ARCHIVE"
rm -f "$TAR"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256")
fi

SIZE="$(du -h "$ARCHIVE" | awk '{print $1}')"
log "完成：$ARCHIVE（$SIZE，linux/${ARCH_TAG}）"
log "内网导入：gunzip -c $(basename "$ARCHIVE") | docker load   # 或 docker load -i（docker 20.10+ 支持 gz）"
log "启动示例：docker run -d --name chain-assistant -p 8080:8080 -v chain-data:/data --restart unless-stopped $IMAGE"
log "（或用 compose：镜像包同目录放入 deploy/docker/docker-compose.yml）"
log "提示：镜像架构必须与内网主机一致（uname -m → aarch64 用 arm64 包，x86_64 用 amd64 包）"
