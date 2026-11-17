# 内网 Linux 一键部署指南

整套系统打成**一个离线压缩包**，内网服务器上解压后跑一条命令即完成安装。全程不需要外网、不需要装 Node、不需要 nginx，唯一依赖是系统自带的 **Python 3.7+**（麒麟 V10、Debian 11、RHEL 9 等自带版本即可；推荐 3.9+，CentOS 7 自带的 3.6 不支持需先装 python3）。

> **与 CPU 架构无关**：包内全是 Python 源码、SQLite 数据、浏览器端静态资源，没有任何编译产物或 C 扩展，x86_64 与 arm64（鲲鹏 / 飞腾 / 麒麟 ARM 版）用同一个包。这一点与 Docker 镜像不同——镜像内嵌 Python 解释器，必须按架构分别构建。

## 架构一览

```
┌─────────────────── 一台内网 Linux 服务器 ───────────────────┐
│                                                            │
│  python3 agent/service.py        （唯一进程，systemd 托管）  │
│  ├─ :8080/            → 前端页面（dist 静态托管，含 gzip）   │
│  ├─ :8080/data/basemap/*.geojson → 离线底图（Natural Earth） │
│  ├─ :8080/api/*       → 链知智答 / 认证 / 业务接口           │
│  └─ agent/data/*.db   → SQLite（软链到 /var/lib 数据目录）   │
│                                                            │
│  运行用户 chain（系统账号，无登录 shell）                    │
└────────────────────────────────────────────────────────────┘
        用户浏览器访问 http://<服务器IP>:8080/
```

零第三方 Python 依赖（纯标准库），零外网请求（运行时只访问本机）。

## 第一步：构建离线包（联网机器，跑一次）

在开发机（当前这台 Windows 也行，或任意有 Node 20+/pnpm 的机器）执行：

```bash
cd D:\ai_project\AI-Project-Department\AI-Project-Department
bash deploy/build-package.sh
```

产出 `release/chain-assistant-<版本>-<时间戳>.tar.gz`（约 1.2G 原始数据压缩后 500~700M）和 `.sha256` 校验文件。包内结构：

```
app/agent/      后端代码 + 知识库
app/dist/       前端页面 + 数据 + 地图 + 字体
app/seed/       初始业务库 chain.db
install.sh      安装脚本
uninstall.sh    卸载脚本
VERSION         版本信息
```

> 注意：本版本不带登录，也没有账号库；打开页面即进入主应用。

## 第二步：上传并安装（内网服务器）

```bash
scp release/chain-assistant-*.tar.gz user@内网服务器:/tmp/
ssh user@内网服务器
tar -xzf /tmp/chain-assistant-*.tar.gz -C /tmp/chain-pkg   # 解压到临时目录
cd /tmp/chain-pkg
sudo bash install.sh                    # 默认端口 8080
```

可选参数：

| 参数 | 说明 | 默认 |
|---|---|---|
| `--port 8080` | 监听端口 | 8080 |
| `--prefix /opt/chain-assistant` | 程序目录 | /opt/chain-assistant |
| `--data-dir /var/lib/chain-assistant` | 数据目录（数据库所在） | /var/lib/chain-assistant |
| `--user chain` | 运行账号（自动创建系统账号） | chain |
| `--firewall` | 自动放行端口（firewalld/ufw） | 不动防火墙 |
| `--no-systemd` | 不注册服务，只铺文件并生成 `run.sh` | 注册 systemd |

> Python 版本说明：代码兼容下限为 **3.7**（类型注解均走 `from __future__ import annotations` 惰性求值，运行时无 3.8+ 专属 API；全部文件已通过 3.7 语法档校验）。日常在 3.13 上回归测试，3.7/3.8 属静态审计结论。

安装脚本做了这些事：环境检查（root、Python 3.7+、磁盘空间）→ 创建服务账号 → 铺文件（旧版本自动备份为 `app.prev`）→ 初始化数据目录（**升级时不会覆盖已有数据库**）→ 写 `/etc/chain-assistant.env` → 注册并启动 systemd 服务 → 健康检查 → 打印访问地址。

安装成功后会看到：

```
✔ 安装完成，服务已启动
  访问地址：http://192.168.x.x:8080/
```

用浏览器打开即可，无需登录。

## 日常运维

```bash
systemctl status chain-assistant        # 状态
journalctl -u chain-assistant -f        # 实时日志
systemctl restart chain-assistant       # 重启
vim /etc/chain-assistant.env            # 改端口等配置，改完 restart
```

**升级**：新版本打包后上传，重新执行 `sudo bash install.sh` 即可，代码全量替换、数据目录原样保留（旧代码备份在 `/opt/chain-assistant/app.prev`，确认新版本正常后可删，能省 1.2G）。

**备份**：数据都在一个目录，拷走即可

```bash
cp -a /var/lib/chain-assistant /backup/$(date +%F)/
```

**卸载**：`sudo bash uninstall.sh`（程序目录删除、数据保留）；加 `--purge` 连数据一起删。

## 无 systemd 的老机器

`sudo bash install.sh --no-systemd` 只铺文件，之后手动启动：

```bash
nohup /opt/chain-assistant/run.sh >> /var/log/chain-assistant.log 2>&1 &
```

## 方式二：Docker 镜像部署

有容器平台的内网可用 Docker 方式，升级/回滚就是换镜像，数据放卷里不丢。

**构建机**（需 Docker + 能拉取 `python:3.12-slim` 基础镜像；拉不到 Docker Hub 时用 `BASE_IMAGE` 指向国内镜像源）：

```bash
# ① x86_64（amd64）服务器
bash deploy/docker/build-image.sh

# ② arm64 信创服务器（鲲鹏 / 飞腾 / 麒麟 on ARM）：交叉构建
PLATFORM=linux/arm64 \
BASE_IMAGE=docker.m.daocloud.io/library/python:3.12-slim \
bash deploy/docker/build-image.sh

# → release/chain-assistant-image-<版本>-<架构>-<时间戳>.tar.gz
```

跨架构构建靠 QEMU 模拟（Docker Desktop 自带，Linux 构建机装 `qemu-user-static` + `binfmt`），只有 `useradd`/`chmod` 几个 RUN 步骤走模拟，实测 4~6 分钟。脚本在导出前会读镜像 config 校验 `architecture`，架构不对直接中止，不会把 amd64 包发到 arm64 机器上。

**内网服务器**：

```bash
uname -m                                    # aarch64 → 用 arm64 包；x86_64 → 用 amd64 包
docker load -i chain-assistant-image-0.1.0-arm64-20261113-1640.tar.gz
docker run -d --name chain-assistant \
  -p 8080:8080 \
  -v chain-data:/data \
  --restart unless-stopped \
  chain-assistant:0.1.0
# 或导入镜像后用 docker compose up -d（compose 文件在 deploy/docker/）
```

要点：

- 镜像内置健康检查（`/api/health`），以非 root 账号运行；数据卷 `/data` 首次启动自动放入初始业务库，**升级换镜像不覆盖数据**
- 备份：`docker run --rm -v <卷名>:/data -v $PWD:/backup alpine tar czf /backup/chain-data.tgz -C /data .`
- **架构必须与内网主机一致**：amd64 包在 arm64 上 `docker run` 会直接报 `exec format error: python`；反之亦然
- 老 docker（<20.10）不认 `.tar.gz`，先 `gunzip` 再 `docker load -i`；更老的版本用 `gunzip -c xxx.tar.gz | docker load`
- 若内网机器不方便用容器：方式一（systemd 包）**与 CPU 架构无关**——包里是纯 Python 源码 + 数据 + 静态页面，无任何编译产物，arm64 上同样一条命令装完
- 两种方式的业务行为完全一致（同一份代码与数据），按内网约束任选

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 服务起不来，日志报 `UnicodeEncodeError` | 不会出现——install.sh 已在环境里固定 `LANG=C.UTF-8` 和 `PYTHONIOENCODING=utf-8`。若手工裸跑遇到，先 `export LANG=C.UTF-8` |
| 启动报 `数据库不存在` | 数据目录软链断了：检查 `ls -l /opt/chain-assistant/app/agent/data`，重新执行 install.sh 即可修复 |
| 日志报 `can't start new thread`、页面无响应 | 宿主机线程/进程数上限过低（信创服务器常见 512）。服务已内置并发上限（`AGENT_MAX_THREADS`，默认 64）：容器启动时加 `--pids-limit=-1 --ulimit nofile=65535:65535`，必要时调低 `-e AGENT_MAX_THREADS=32` |
| 地图底图缺失 | 确认浏览器直接访问 `http://<ip>:8080/data/basemap/land.geojson` 能返回 200；底图为本地 GeoJSON（Natural Earth 公有领域），无在线瓦片依赖 |
| 打不开页面 | 服务器防火墙：`sudo bash install.sh --firewall` 或手动放行端口；SELinux 强制模式下可 `setenforce 0` 验证是否为它所阻 |
| `docker run` 报 `exec format error` | 镜像架构与主机不符：`uname -m` 看主机，aarch64 必须用 `-arm64-` 包，x86_64 用 `-amd64-` 包 |
| 想换到 80/443 端口 | `--port 80` 重装即可（服务本身仍以低权限账号运行，无需担心） |
| 多人访问性能 | Python 线程池可支撑百人级内部并发；若上到几百人，在前面加一层 nginx 托管 `dist` 静态文件、`/api` 反代到 8787，后端命令不变 |

## 安全清单（上线前过一遍）

- [ ] 数据目录权限已是最小化（0750，仅 chain 账号可写）
- [ ] 服务只监听内网网卡：`AGENT_HOST` 保持 `0.0.0.0` 时确保服务器在内网，勿暴露公网
- [ ] 定期备份 `/var/lib/chain-assistant`
