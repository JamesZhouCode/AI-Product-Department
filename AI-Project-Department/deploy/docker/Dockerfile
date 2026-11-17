# 链知智答一体镜像：页面 + API + 地图同端口（默认 8080），数据落在 /data 卷。
#
# 基础镜像默认 python:3.12-slim（构建机需能拉取；内网导入用 docker load，无需再拉）。
# 拉不到 Docker Hub 时，构建脚本会用 BASE_IMAGE 换成镜像源，例如：
#   BASE_IMAGE=docker.m.daocloud.io/library/python:3.12-slim
# 运行时零第三方依赖，纯标准库 + SQLite；镜像本身不区分业务架构，
# 但基础镜像的原生库区分架构，因此 arm64 需用 --platform linux/arm64 交叉构建。
ARG BASE_IMAGE=python:3.12-slim
FROM ${BASE_IMAGE}

LABEL org.opencontainers.image.title="chain-assistant" \
      org.opencontainers.image.description="产业链智能分析与授信（前端静态托管 + 问答后端一体）"

ENV AGENT_HOST=0.0.0.0 \
    AGENT_PORT=8080 \
    AGENT_MAX_THREADS=64 \
    WEB_ROOT=/app/dist \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    LANG=C.UTF-8

WORKDIR /app

# 低权限运行账号；/data 为数据卷挂载点
RUN useradd --system --uid 10001 --home /data --shell /usr/sbin/nologin chain \
    && mkdir -p /data /app/seed \
    && chown chain:chain /data

COPY app/agent/ /app/agent/
COPY app/dist/ /app/dist/
COPY app/seed/chain.db /app/seed/chain.db
COPY docker-entrypoint.sh /app/entrypoint.sh

# 后端按 agent/data/*.db 取库，软链到数据卷
RUN chmod 0755 /app/entrypoint.sh \
    && ln -s /data /app/agent/data \
    && chown -R chain:chain /app

USER chain
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os, json, urllib.request; port = os.environ.get('AGENT_PORT', '8080'); json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=4))"

ENTRYPOINT ["/app/entrypoint.sh"]
