# 产业链智能体 · P0 单机演示

数据底座 + 链知智答后端。零第三方依赖（Python 标准库 + SQLite），不需要 Docker。
生产目标库（PostgreSQL + pgvector）见 `sql/schema.pg.sql`，字段与 SQLite 版一一对应。

## 一次跑通

```bash
# 1. 导入前端现有分片（13,825 家企业 + 关系 + 方法规程文档）
python agent/ingest.py

# 2. 启动问答后端（默认 127.0.0.1:8787）
python agent/service.py

# 3. 前端 pnpm dev 后打开「链知智答」，右上角显示「数据服务已连接」
```

后端单测：

```bash
python -m unittest discover -s agent/tests -t agent
```

## 运行

```bash
python agent/service.py        # 默认 127.0.0.1:8787
```

环境变量：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `AGENT_PORT` | 监听端口 | 8787 |
| `AGENT_HOST` | 监听地址 | 127.0.0.1 |
| `WEB_ROOT` | 设为前端 `dist-release` 目录后，同端口托管页面与静态资源（内网单进程部署用），支持 Range/gzip/缓存 | 不设置（仅 API） |

内网一键部署（离线包 + install.sh）见仓库 `deploy/README.md`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 库状态、产业清单 |
| GET | `/api/chain/stats?industry=ES` | 链统计（工具层原样返回） |
| GET | `/api/companies?industry=ES&q=宁德` | 企业检索 |
| GET | `/api/doc/search?industry=ES&q=建链` | 方法规程文档检索 |
| POST | `/api/assistant/chat` | `{question, industry}` → 回答 + 引用 + 口径说明 |

回答由确定性模板生成（所有数字来自 SQL 工具），不接入任何大模型或外部服务。

## 主键口径（重要）

当前源分片里 **0 家企业带统一社会信用代码**，因此全部落在 `pending_credit_code` 桶，
主键为 `pending:<行业码>:<规范化名称哈希>`。拿到真码后准备 CSV（列：`industry_code,name,credit_code`），执行：

```bash
python agent/ingest.py --apply-credit-codes agent/data/credit-codes.csv
```

主键原地升级为信用代码，别名、环节标签、关系一并迁移；绝不伪造代码。
`chain_stats` 的回答会持续提示待补数量，作为数据质量看板的一部分。

## 快照导出（库 → 前端契约）

```bash
python agent/export_snapshot.py --industry ES
```

从库导出与 `frontend/public/data` 完全同构的 JSON，并逐家逐条与源分片 diff，
当前全部一致（P0 验收点）。后续数据进入数据库后，前端仍只读分片，无需任何改动。

## 目录

```
agent/
├── ingest.py            # 分片导入（幂等全量重建）+ 信用代码升级
├── service.py           # 问答后端（标准库 HTTP，零依赖）
├── tools.py             # 数据工具层：统计/企业/关系/文档/常识
├── answer.py            # 意图路由与回答编排（确定性模板）
├── export_snapshot.py   # 库 → 前端契约导出 + diff 校验
├── knowledge/cards.json # 链外常识卡（标注来源，与链内数据区分）
├── sql/                 # SQLite（演示）与 PostgreSQL（生产）两套建表
└── data/                # chain.db、导入报告、导出快照（不入 Git）
```

## 算力链全量入链（统一社会信用代码为主键）

```bash
python agent/ingest_compute.py            # 只读解析 + 出报告（不动任何文件）
python agent/ingest_compute.py --apply    # 写库 + 重建 companies-compute.json（自动备份）
python agent/rebuild_compute_chain.py --apply   # 重算 compute-chain.json 的统计骨架
cd frontend && node scripts/prepare-credit-mock.mjs --industry compute   # 同步授信数据
```

源：`G:/对公经营智能化项目/算力/算力产业链企业清单-全量整合版.xlsx`「1-全量总表」。
关键口径：

- **唯一主键 = 统一社会信用代码**（`company_key` / `creditCode` / `id=cp-<代码>`），
  覆盖 1650/1764（93.5%）；缺码 114 家进 `pending:CP:<名称哈希>` 待补桶，绝不伪造。
- 3 条清单录入的校验位错误（联通数科 / 腾讯云 / 中国移动）按 GB 32100 修正末位，
  原值保留在 `creditFixedFrom`；「腾讯云计算(北京)」同名两码未自动合并，待人工判定。
- 上一版算力链（590 家）的地址 / 坐标 / 主营 / 画像按名称+证券代码迁移（439 家命中），
  快照固化在 `agent/data/legacy-compute-v2.json`，保证重复执行幂等。
- 清单外 151 家（旧链独有）转入 `compute-chain.json` 的 `otherCustomers` 客户池，不从系统消失。
- 链结构从 4 个一级环节 / 19 个二级环节变为 **5 / 18**（新增「算力需求方」需求侧组，
  「电源与供配电」归入设备与网络、「运营商算力网络」归入服务与运营）。
- 分层以清单原判为准（66/191/401），上一版画像只对未评级主体兜底并标注 `tierSource`。

## 目录

```
agent/
├── ingest.py                  # 储能等分片导入（幂等全量重建）+ 信用代码升级
├── ingest_compute.py          # 算力清单（Excel）→ 单机库 + 前端分片（信用代码主键）
├── rebuild_compute_chain.py   # compute-chain.json 统计骨架重算 + 清单外主体入客户池
├── build_ic_chain.py          # 集成电路清单（Excel）→ ic-chain.json 建链数据（7 环节 / 4,477 家）
├── service.py                 # 问答后端（标准库 HTTP，零依赖）
├── tools.py                   # 数据工具层：统计/企业/关系/文档/常识
├── answer.py                  # 意图路由与回答编排（确定性模板）
├── export_snapshot.py         # 库 → 前端契约导出 + diff 校验
├── knowledge/cards.json       # 链外常识卡（标注来源，与链内数据区分）
├── sql/                       # SQLite（演示）与 PostgreSQL（生产）两套建表
└── data/                      # chain.db、导入报告、导出快照（不入 Git）
```

## 算力链企业关系入链（股权 / 关联方 / 客户 / 供应商）

```bash
python agent/ingest_relations.py           # 只读解析 + 出报告
python agent/ingest_relations.py --apply   # 写库 + 更新三个分片（先备份）
```

源：`算力产业链-股权穿透与关联方-初版.xlsx`（实控人 / 十大股东 / 关联方候选 / 集中度 /
非上市穿透）与 `算力产业链-客户供应商关系-企百科.xlsx`（客户 52,543 行 / 供应商 18,404 行）。

关键口径：

- **映射**：源表没有信用代码列，按「证券代码（6 位）→ 企业全称/别名」两级映射到
  `company_key`，交易类关系 96% 走证券代码精确命中；匹配不上的对端不猜、不入边。
- **链内边（2,214 条，两端都在 1,764 家在链主体内）**写进 `compute-chain.json` 的
  `relations`：供应 2,137（客户/供应商交易，方向统一为「卖方 → 买方」）、股权 26、
  同一集团 48（按实控人两两归集）、同一实控人 3；同一对企业的多笔交易合并为一条
  （金额求和、占比取最大、日期取最近）。
- **链外明细（45,789 个交易对手）**进 `compute-relations.json`（按信用代码索引，
  详情页按需加载），每家主体保留客户/供应商各金额前 30 家，附 CR5 集中度。
- **企业字段增强**：实控人 / 实控人类型与持股 / 控制层级 / 第一大股东 / CR10 /
  前十大股东（≤10 位）/ 客户供应商 CR5 与关联方交易占比，写入
  `companies-compute.json`（覆盖 292 家上市主体的实控人、313 家的股东明细）。
- 数据缺口如实留白：1,412 家清单内主体在穿透表中无实控人数据（非上市，东财 F10
  覆盖不到），「关键人偏好」维度暂未采集，页面上按缺失展示。

执行顺序：`ingest_compute.py --apply` → `rebuild_compute_chain.py --apply` →
`ingest_relations.py --apply` → `frontend: node scripts/prepare-credit-mock.mjs --industry compute`。

## 集成电路建链（按环节清单，2026-11-13 新增）

```bash
python agent/build_ic_chain.py             # 只解析 + 出报告（不动任何文件）
python agent/build_ic_chain.py --apply     # 写 frontend/public/data/industries/ic-chain.json（先备份）
cd frontend && node scripts/prepare-credit-mock.mjs --industry ic   # 生成授信演示数据
```

源：`G:/对公经营智能化项目/集成电路/集成电路企业清单-按环节.xlsx`
（「0 总览」+ 设计 / 材料 / 装备 / 制造 / 封测 / 配套 / 待研判 7 张环节分表，
4,477 行明细，名称与 public/data/companies.json 1:1 对齐）。

口径：环节体系取自源表分表（7 个一级环节 / 18 个二级环节 =「细分领域」列）；
分档不做评分——「重点企业」记龙头、「非重点 + 上市」记骨干、其余记长尾，
grade 四档由这两列交叉映射（规则见 ic-chain.json 的 steps[2].rule.limitations）；
关系边沿用 companies.json 已收录的公开供销 / 经销关系（332 条）。

## 储能链全量入链（2,495 户清单，信用代码主键）

```bash
python agent/ingest_storage.py             # 只读解析 + 出报告
python agent/ingest_storage.py --apply     # 写库 + 重建前端分片（先备份）
python agent/rebuild_storage_chain.py --apply      # 链骨架重算 + 旧链富画像迁移
python agent/ingest_storage_relations.py --apply   # 关系入链（链内边 + 明细分片）
node agent/update_storage_territory.mjs            # 属地/客户池统计补丁（须在关系入链后跑）
```

源：`储能产业链-2495户企业全量数据.xlsx`（01_全量企业主表，34 列）、
`储能产业链-客户供应商关系-2026-10-21.xlsx`、`储能产业链-企业关系图谱-2026-10-21.xlsx`。

关键口径：

- **唯一主键 = 统一社会信用代码**：合规码 1,953 家进 `company_key`，缺码 504 家进
  `pending:ES:<名称哈希>`，绝不伪造代码；同码多行合并（37 组），同名不同码保留并标记。
- **同股票代码兜底合并**：上市主体工商更名前后两行会同时出现（如中创新航 3931.HK），
  恰好一行有合规码时缺码行并回有码行（缺码名进 aliases）；双方都有码则不自动合并、
  记入报告待人工判定。
- **跨链共享主体**：44 家储能∩算力重叠主体在 company 表全局唯一（industry_code 只记
  首次入链），跨链归属以 `company_chain_tag` 为准；查询层（tools.py）用 tag 存在性谓词。
- **关系边**：链内边 2,966 条（供应 2,905 / 股权 61 / 同一实控人等）进
  `storage-chain.json` 的 `relations`，方向统一为「供方 → 需方」，无向边按端点对去重；
  链外对手 65,095 个进 `storage-relations.json`（每家客户/供应商各金额前 30 条）。
- **富画像迁移**：旧 237 家上市样本的 profile / territory / 证据字段按名称+证券代码
  迁到新主体（rebuild 步骤完成，并同步写回分片，防止关系入链时被冲掉）。
- 执行顺序（顺序不可换，rebuild 会先清空 relations）：`ingest_storage.py --apply` →
  `rebuild_storage_chain.py --apply` → `ingest_storage_relations.py --apply` →
  `node agent/update_storage_territory.mjs` →
  `frontend: node scripts/prepare-credit-mock.mjs --industry storage &&
  node scripts/prepare-analysis-mock.mjs --industry storage`。

## 内网部署要点（无登录）

服务不带账号体系：打开页面即进入主应用，所有接口无需令牌。这在内网单点部署下省掉了账号分发与审批流程，
因此**不要**把服务直接暴露到不可信网络。

1. **前端**：`pnpm build` 产出静态 `dist/`，可交给 nginx / IIS 发布；演示环境直接 `pnpm dev` 也可，
   但不要用开发服务器承载正式用户。
2. **后端**：`set AGENT_HOST=0.0.0.0` 后运行 `python agent/service.py`，内网用户可访问；
   服务为 ThreadingHTTPServer + SQLite（WAL 模式、5s busy_timeout），只读查询为主，千人级并发没问题。
   若之后要加高频写入场景，建议换 PostgreSQL 或加一层反向代理 + 多进程。
3. **同端口托管**：设置 `WEB_ROOT=frontend/dist` 后，页面与 API 由同一个端口提供，无需再装 nginx。
