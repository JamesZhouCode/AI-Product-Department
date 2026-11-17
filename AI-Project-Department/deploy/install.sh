#!/usr/bin/env bash
# 一键安装：把离线包部署成本机 systemd 服务（页面 + API 同端口，无需 nginx / Node）。
#
# 用法：
#   sudo bash install.sh                       # 默认 8080 端口
#   sudo bash install.sh --port 80             # 换端口（80 需 root，服务本身以低权限用户运行）
#   sudo bash install.sh --data-dir /data/chain --firewall
#   sudo bash install.sh --no-systemd          # 不注册服务，只铺文件并生成 run.sh
#
# 重复执行即"升级"：代码与前端整体替换，数据目录保持不动。
set -euo pipefail

PREFIX="/opt/chain-assistant"
DATA_DIR="/var/lib/chain-assistant"
SERVICE_NAME="chain-assistant"
SERVICE_USER="chain"
PORT="8080"
BIND="0.0.0.0"
NO_SYSTEMD=0
OPEN_FIREWALL=0

PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

c_ok() { printf '\033[32m%s\033[0m\n' "$*"; }
c_info() { printf '\033[36m[安装]\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m[注意]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[失败]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --prefix) PREFIX="${2:-}"; shift 2 ;;
    --data-dir) DATA_DIR="${2:-}"; shift 2 ;;
    --user) SERVICE_USER="${2:-}"; shift 2 ;;
    --bind) BIND="${2:-}"; shift 2 ;;
    --no-systemd) NO_SYSTEMD=1; shift ;;
    --firewall) OPEN_FIREWALL=1; shift ;;
    -h|--help) usage ;;
    *) die "未知参数：$1（--help 查看用法）" ;;
  esac
done

[[ "$PORT" =~ ^[0-9]+$ ]] || die "端口必须是数字：$PORT"

# ---------- 0. 环境检查 ----------
[[ "$(id -u)" -eq 0 ]] || die "请用 root 运行：sudo bash install.sh"
[[ -f "$PKG/app/dist/index.html" ]] || die "安装包不完整：缺少 app/dist/index.html"
[[ -f "$PKG/app/agent/service.py" ]] || die "安装包不完整：缺少 app/agent/service.py"
[[ -f "$PKG/app/seed/chain.db" ]] || die "安装包不完整：缺少 app/seed/chain.db"

PY_BIN="$(command -v python3 || command -v python || true)"
[[ -n "$PY_BIN" ]] || die "未找到 python3。内网机器请先安装 python3（3.9 及以上，最小安装即可）"
# 兼容下限 3.7（静态审计 + 语法校验：注解走 __future__，无 3.8+ 运行时 API）；推荐 3.9+
"$PY_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 7) else 1)' \
  || die "Python 版本过低（$("$PY_BIN" -V 2>&1)），需要 3.7 及以上（CentOS 7 自带的 3.6 不支持，请先装 python3）"
if [[ "$("$PY_BIN" -c 'import sys; print(1 if sys.version_info >= (3, 9) else 0)')" != "1" ]]; then
  c_warn "当前为 $("$PY_BIN" -V 2>&1)：可运行，但建议 3.9 及以上以获得更好的性能与安全修复"
fi

if [[ "$NO_SYSTEMD" -eq 0 ]]; then
  command -v systemctl >/dev/null 2>&1 || die "未检测到 systemd；如确实没有，请加 --no-systemd 自行托管进程"
fi

AVAIL_KB="$(df -Pk "$(dirname "$PREFIX")" | awk 'NR==2 {print $4}')"
NEED_KB=$(( $(du -sk "$PKG/app" | awk '{print $1}') + 204800 ))
[[ "$AVAIL_KB" -gt "$NEED_KB" ]] || c_warn "磁盘剩余 $((AVAIL_KB/1024))MB，建议至少 $((NEED_KB/1024))MB"

# ---------- 1. 服务账号 ----------
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  NOLOGIN="$(command -v nologin || echo /sbin/nologin)"
  useradd --system --home-dir "$DATA_DIR" --shell "$NOLOGIN" "$SERVICE_USER" 2>/dev/null \
    || useradd -r -d "$DATA_DIR" -s "$NOLOGIN" "$SERVICE_USER"
  c_info "已创建服务账号：$SERVICE_USER"
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"

# ---------- 2. 数据目录（首次安装才放初始库） ----------
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$DATA_DIR"
if [[ ! -f "$DATA_DIR/chain.db" ]]; then
  c_info "写入初始业务库（$(du -h "$PKG/app/seed/chain.db" | awk '{print $1}')）"
  install -m 0640 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$PKG/app/seed/chain.db" "$DATA_DIR/chain.db"
else
  c_info "沿用已有业务库：$DATA_DIR/chain.db"
fi

# ---------- 3. 铺文件（先铺到 app.new，再原子替换） ----------
if [[ "$NO_SYSTEMD" -eq 0 ]] && systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  c_info "停止运行中的服务"
  systemctl stop "$SERVICE_NAME"
fi

install -d -m 0755 "$PREFIX"
rm -rf "$PREFIX/app.prev"
if [[ -d "$PREFIX/app" ]]; then
  mv "$PREFIX/app" "$PREFIX/app.prev"
  c_info "旧版本已保留在 $PREFIX/app.prev（确认无误后可删）"
fi
install -d -m 0755 "$PREFIX/app"
cp -R "$PKG/app/agent" "$PREFIX/app/agent"
cp -R "$PKG/app/dist" "$PREFIX/app/dist"
cp "$PKG/VERSION" "$PREFIX/VERSION" 2>/dev/null || true

# 数据目录软链：后端按 agent/data/*.db 取库，实际落在 /var/lib 下
rm -rf "$PREFIX/app/agent/data"
ln -sfn "$DATA_DIR" "$PREFIX/app/agent/data"
chmod -R a+rX "$PREFIX/app/agent" "$PREFIX/app/dist"
c_info "代码与前端已安装到 $PREFIX/app"

# ---------- 4. 环境变量 ----------
ENV_FILE="/etc/${SERVICE_NAME}.env"
cat > "$ENV_FILE" <<EOF
# 由 install.sh 生成，修改后需 systemctl restart ${SERVICE_NAME}
AGENT_HOST=${BIND}
AGENT_PORT=${PORT}
WEB_ROOT=${PREFIX}/app/dist
PYTHONUNBUFFERED=1
PYTHONIOENCODING=utf-8
LANG=C.UTF-8
EOF
chmod 0640 "$ENV_FILE"
chown "root:$SERVICE_GROUP" "$ENV_FILE"

# ---------- 5. systemd ----------
if [[ "$NO_SYSTEMD" -eq 0 ]]; then
  UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
  cat > "$UNIT" <<EOF
[Unit]
Description=Chain Assistant (产业链智能分析与授信)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${PREFIX}/app/agent
EnvironmentFile=${ENV_FILE}
ExecStart=${PY_BIN} ${PREFIX}/app/agent/service.py
Restart=always
RestartSec=3
TimeoutStopSec=15
KillSignal=SIGINT
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  systemctl restart "$SERVICE_NAME"
else
  cat > "$PREFIX/run.sh" <<EOF
#!/usr/bin/env bash
set -a; . ${ENV_FILE}; set +a
exec ${PY_BIN} ${PREFIX}/app/agent/service.py
EOF
  chmod 0755 "$PREFIX/run.sh"
fi

# ---------- 6. 健康检查 ----------
c_info "等待服务就绪…"
HEALTH="fail"
for _ in $(seq 1 20); do
  HEALTH="$("$PY_BIN" - "$PORT" <<'PY' 2>/dev/null || echo fail
import json, sys, urllib.request
try:
    with urllib.request.urlopen(f"http://127.0.0.1:{sys.argv[1]}/api/health", timeout=3) as r:
        print("ok" if json.load(r).get("ok") else "bad")
except Exception:
    print("fail")
PY
)"
  [[ "$HEALTH" == "ok" ]] && break
  sleep 1
done

# ---------- 7. 防火墙（可选） ----------
if [[ "$OPEN_FIREWALL" -eq 1 ]]; then
  if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null && firewall-cmd --reload >/dev/null
    c_info "firewalld 已放行 ${PORT}/tcp"
  elif command -v ufw >/dev/null 2>&1; then
    ufw allow "${PORT}/tcp" >/dev/null && c_info "ufw 已放行 ${PORT}/tcp"
  else
    c_warn "未识别到 firewalld/ufw，请手动放行 ${PORT}/tcp"
  fi
fi

# ---------- 8. 结果 ----------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "$IP" ]] || IP="<服务器IP>"
echo
if [[ "$HEALTH" == "ok" ]]; then
  c_ok "✔ 安装完成，服务已启动"
else
  c_warn "服务未在 20 秒内就绪，请查看日志：journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
fi
echo "  访问地址：http://${IP}:${PORT}/"
echo "  安装目录：${PREFIX}/app"
echo "  数据目录：${DATA_DIR}（chain.db 业务库）"
echo "  配置文件：${ENV_FILE}"
echo
if [[ "$NO_SYSTEMD" -eq 0 ]]; then
  echo "  常用命令："
  echo "    systemctl status ${SERVICE_NAME}"
  echo "    systemctl restart ${SERVICE_NAME}"
  echo "    journalctl -u ${SERVICE_NAME} -f"
else
  echo "  手动启动：${PREFIX}/run.sh &"
fi
echo "  升级：解包新版本后重新执行 sudo bash install.sh（数据不丢）"
echo "  卸载：sudo bash uninstall.sh（加 --purge 连数据一起删）"
