#!/bin/sh
# 容器入口：数据卷为空时放入初始业务库，然后启动服务。
# 升级镜像不会覆盖卷里的 chain.db。
set -e

if [ ! -f /data/chain.db ]; then
    echo "[entrypoint] 数据卷为空，写入初始业务库 chain.db"
    cp /app/seed/chain.db /data/chain.db
fi

exec python /app/agent/service.py
