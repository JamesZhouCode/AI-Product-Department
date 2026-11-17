#!/usr/bin/env bash
# 卸载：停止服务并移除程序文件。数据目录默认保留（加 --purge 一并删除）。
set -euo pipefail

SERVICE_NAME="chain-assistant"
PREFIX="/opt/chain-assistant"
DATA_DIR="/var/lib/chain-assistant"
PURGE=0

c_info() { printf '\033[36m[卸载]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[卸载]\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge) PURGE=1; shift ;;
    --prefix) PREFIX="${2:-}"; shift 2 ;;
    --data-dir) DATA_DIR="${2:-}"; shift 2 ;;
    *) die "未知参数：$1" ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] || die "请用 root 运行"

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  c_info "服务已停止并移除"
fi

rm -f "/etc/${SERVICE_NAME}.env"
rm -rf "$PREFIX"
c_info "程序目录已删除：$PREFIX"

if [[ "$PURGE" -eq 1 ]]; then
  rm -rf "$DATA_DIR"
  c_info "数据目录已删除：$DATA_DIR"
else
  c_info "数据目录已保留：$DATA_DIR（chain.db）"
  c_info "如需彻底删除：sudo bash uninstall.sh --purge"
fi

id -u chain >/dev/null 2>&1 && userdel chain 2>/dev/null || true
c_info "完成"
