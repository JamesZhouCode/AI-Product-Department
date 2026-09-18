# 产业链图谱 AI 地图 Demo

这是一个以 `frontend/` 为独立前端项目的离线地图 Demo。前端使用 React、MapLibre GL 和 PMTiles。四条产业链是相互独立的样本集，页面只读取当前选中产业链的数据；地图展示当前链路的全部企业，上市企业筛选、产业链图谱、周报和企业关系统一以 `tags` 中的 `上市企业` 为口径。

当前生成数据摘要（重新生成数据后以页面显示为准）：

| 一级产业链 | 企业 | 上市企业 | 上市企业关系 |
| --- | ---: | ---: | ---: |
| 集成电路 | 4,477 | 230 | 332 |
| 电力装备（含储能） | 115 | 40 | 8 |
| 生物医药 | 95 | 55 | 11 |
| 人工智能 | 6,571 | 367 | 16 |

本项目按 GNU Affero General Public License v3.0（AGPL-3.0）发布，详见根目录 `LICENSE`。

## 项目结构

```text
frontend/
  package.json         # 前端依赖与命令
  pnpm-lock.yaml       # 前端依赖锁定
  vite.config.js       # Vite 配置
  src/                 # React 页面、地图逻辑、产业链模型和样式
    features/app/      # 应用壳层、全局产业链切换、目录和持久化编辑状态
    features/map/      # 地图工作台、筛选/选中/企业操作/全屏及图层契约
  public/              # 企业数据、行政区划、PMTiles、字体和精灵图
    data/industries/   # 电力装备、生物医药、人工智能的独立数据分片
  scripts/             # 数据准备、一次性研究、地图资源和冒烟检查
  docs/                # 调研证据、数据审计、导入模板和结构说明
  test/                # Node 测试和产业链模型测试

可参考内容/            # 本地源 Excel 和参考资料，不属于前端运行时
backend/               # 未来可新增的 Spring Boot 后端
AGENTS.md              # 仓库协作指南
README.md              # 项目说明
```

`frontend/` 内部是一个完整、可独立运行的前端项目。后续增加 Spring Boot 后端时，在根目录新增同级 `backend/`，两者互不混用依赖和源码。

## 实现总览

这是一个“同一份当前产业链数据，驱动三个观察页面”的前端应用：

```text
App.jsx
├── useAppData(activeIndustry)
│   ├── data/industries/index.json          产业链目录
│   ├── companies.json / industries/*.json 企业与关系分片
│   └── usePersistedCompanyEdits           本地标签、银行关系和营销记录
├── AppHeader                              品牌、数据摘要、范围和页签
├── MapWorkspace                           地图工作台
│   └── useMapWorkspace                    地图工作台能力编排
│       ├── useWorkspaceFilters            搜索、标签和区域筛选
│       ├── useWorkspaceSelection          企业、关系和重叠点选中状态
│       ├── useWorkspaceCompanyActions     企业详情、导入和编辑操作
│       ├── useWorkspaceFullscreen         全屏与 Escape 行为
│       ├── useMapFeatureData               可见企业转 GeoJSON Feature
│       ├── useMapSelectionData             选中企业及关系派生数据
│       └── useMapController                MapLibre 生命周期与交互
├── IndustryAtlasPage                      产业链图谱
└── WeeklyReportPage                       本周产业链周报
```

`activeIndustry` 和 `data` 在 `App.jsx` 提升管理，顶部唯一的 `IndustrySwitcher` 负责切换当前产业链，地图、图谱和周报共享同一个当前产业链分片；三个页面内部不再各自提供产业链下拉框，也不会各自读取或拼接企业数据。`useMapWorkspace` 只负责组合能力，具体状态和副作用放在对应 hook 中，便于后续交接和修改。

### 数据流

1. `useAppData` 请求 `frontend/public/data/industries/index.json`，根据当前一级产业链找到数据文件。
2. 对企业/关系分片做结构校验并缓存；目录不可用时使用完整的四条内置目录，单个分片加载失败则显示错误，不静默换成其他产业链。
3. 合并浏览器本地保存的企业标签、银行关系和营销记录，重新计算当前分片的上市企业数及上市企业关系数。
4. `useMapWorkspace` 根据筛选条件派生可见企业、关系、重叠点和详情数据。
5. 地图把派生数据转换为 GeoJSON；图谱和周报直接使用同一份 `data`，分别由 `features/insights/industryModel.js` 计算展示模型。

### 状态边界

- `App.jsx`：只保留当前页签、当前一级产业链和应用级数据源。
- `useWorkspaceFilters`：管理搜索、上市企业/标签筛选、省市区联动和清除筛选。
- `useWorkspaceSelection`：管理企业、关系、重叠点的选中状态；`useSelectionGuards` 负责筛选变化后的失效清理。
- `useWorkspaceCompanyActions`：管理企业详情打开、关系聚焦、银行数据导入、标签编辑和营销记录。
- `useWorkspaceFullscreen`：管理地图全屏；按 Escape 时先退出全屏，否则直接清除当前详情选择。
- `useMapController`：只负责 MapLibre 实例、离线底图、图层更新、点击命中和光标，不承载业务筛选规则。
- `usePersistedCompanyEdits`：使用版本化的通用本地存储键，并兼容旧版集成电路缓存；不要把浏览器本地编辑当成生成数据源。

### 视觉和地图契约

- 一级产业链、二级产业链和三级环节的显示名称、别名和颜色集中在 `frontend/src/chainPalette.js`。
- MapLibre source/layer ID 集中在 `frontend/src/features/map/mapLayers.js`；修改图层时同步检查 `mapStyle.js`、`useMapController.js` 和交互图层数组。
- `frontend/src/features/map/mapFeatures.js` 负责把企业和关系转换为地图 Feature；地图展示名称可以是显示格式，但选中和详情查找必须保留企业原始名称。
- 有 PMTiles 时使用本地真实底图；没有 PMTiles 时使用本地兜底几何，不向运行时增加外部地图请求。

## 交接时的常见修改入口

| 需求 | 首先查看 |
| --- | --- |
| 增加或替换一级产业链数据分片 | `frontend/public/data/industries/index.json`、`frontend/src/features/app/industryData.js`、对应数据准备脚本 |
| 修改全局产业链选择器 | `frontend/src/features/app/IndustrySwitcher.jsx`、`AppHeader.jsx`；页面只接收 `selectedIndustry` |
| 修改二级/三级名称、别名或颜色 | `frontend/src/chainPalette.js`；源数据映射另看 `frontend/docs/new-industry-taxonomy.json` 和 `frontend/scripts/prepare-new-industries.mjs` |
| 修改上市企业口径或关系范围 | `frontend/src/features/map/mapTags.js`、`frontend/src/features/app/useAppData.js`；不要使用 `ordinary`/`key`/`isKey` 代替 `tags` |
| 修改搜索、标签或区域筛选 | `frontend/src/features/map/useWorkspaceFilters.js`、`useMapFilterData.js` |
| 修改地图点、聚合点、关系线或点击行为 | `frontend/src/features/map/mapFeatures.js`、`mapLayers.js`、`useMapController.js` |
| 修改企业详情、画像或企业操作 | `frontend/src/features/company/`、`useWorkspaceCompanyActions.js` |
| 修改图谱或周报统计 | `frontend/src/features/insights/industryModel.js`、`features/atlas/`、`features/report/` |
| 修改离线底图或地图样式 | `frontend/src/mapStyle.js`、`frontend/src/mergedBasemapProtocol.js`、`frontend/public/map/` |

## 数据和功能边界

运行时只消费已经生成的本地静态数据，不在浏览器中调用地理编码、地图服务或其他外部接口。分类是“一级产业链 → 二级产业链 → 三级环节”的独立字段，企业可以有多个标签；前端不会根据企业名称临时猜测三级分类。

企业画像字段中的技术、产品、采购品、地址和定位状态可能存在缺口；缺失字段显示“待补充”，不会被前端伪造。关系字段只展示已经落盘的研究结果，未整理的关系不会由地图自动推断。`frontend/docs/` 中的研究文件是数据准备和审计依据，不是运行时接口。

内网迁移时应整体保留 `frontend/public/data/`；如果需要真实离线底图，还要保留 `frontend/public/map/`、`frontend/public/assets/`。源 Excel 位于不纳入 Git 的 `可参考内容/`，因此只运行 Demo 不需要源表，重新生成数据时才需要准备对应源文件。

## 本地运行

所有前端命令进入 `frontend/` 后执行：

```bash
cd frontend
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173/`。内网 Demo 直接使用仓库中已经生成的 `frontend/public/data/` 数据，不需要源 Excel；如果 5173 端口已被占用，Vite 会使用终端提示的下一个端口。没有地图资源时，页面会显示本地交互预览轮廓；将 PMTiles 和字体/图标资源放入 `frontend/public/map` 与 `frontend/public/assets` 后，页面会自动切换真实离线底图。

提交前运行：

```bash
cd frontend
pnpm check
pnpm dev                         # 保持开发服务运行，另开终端执行冒烟测试
pnpm smoke
# 开发服务使用其他端口时，例如 5174：
SMOKE_BASE_URL=http://127.0.0.1:5174 pnpm smoke
```

`pnpm check` 会执行格式检查、ESLint、Node 测试和生产构建；`pnpm smoke` 需要一个已经启动的本地开发服务，并会按顺序切换四条产业链，检查数据摘要、地图加载、筛选、区域联动、关系范围、银行标记、控制台错误和外部请求。

## 离线地图资源

资源目录约定（可执行 `pnpm download:map-assets` 一次性下载 Protomaps 字体与精灵图）：

```text
frontend/public/map/china-overview.pmtiles
frontend/public/map/shanghai-detail.pmtiles
frontend/public/assets/fonts/{fontstack}/{range}.pbf
frontend/public/assets/sprites/v4/light.json
frontend/public/assets/sprites/v4/light.png
```

资源下载/提取阶段可以联网；运行时只请求当前项目自身的静态资源。当前只保留浅色底图精灵图，不提供暗色模式。PMTiles 归档应使用具有离线/再分发许可的数据源，并保留 `© Protomaps © OpenStreetMap contributors` 标注。

如果构建机已经安装 `pmtiles` CLI，可执行：

```bash
cd frontend
PMTILES_BIN=/path/to/pmtiles ./scripts/extract-map-assets.sh
```

未安装 CLI 时脚本会自动使用仓库内的 Node 提取器。脚本默认使用固定日期的 Protomaps build，便于校验和复现。上海详情包从 z9 开始，全国概览包覆盖 z0-z10，避免重复存储低倍瓦片。

资源生成后可执行 `pnpm verify:map`，它会检查 PMTiles 魔数、MVT 类型、缩放范围、目录瓦片数和图层元数据。

完整提取会产生较大的本地文件，建议先用小范围验证：

```bash
cd frontend
node scripts/extract-pmtiles.mjs \
  --output=public/map/shanghai-smoke.pmtiles \
  --bbox=121.3,31.0,121.7,31.5 --minzoom=10 --maxzoom=11
```

## 数据处理

`pnpm prepare:data` 只负责集成电路主表：它会读取仓库根目录 `可参考内容/con_info1.xlsx`，生成 `frontend/public/data/companies.json`，并写出 `frontend/docs/company-master-audit.json`。这个命令只在源 Excel 更新后运行，普通启动不需要执行：

- 新表 4,477 行全部进入集成电路地图，运行时主表严格保持 4,477 个企业实体；
- `ordinary`、`key`、`isKey` 等字段仅作为历史研究档案匹配的溯源字段，不参与当前企业范围筛选；
- 当前企业范围由 `tags` 中的 `上市企业` 决定，产业链图谱、周报和运行时关系均使用这一口径；
- 供应、经销、股权关系只保留当前产业链分片中两端均为上市企业的关系；
- 企业标签独立于企业类型和二级产业链，支持多标签筛选与企业详情中的手工编辑；
- `Y/N` 作为来源字段保留，但不参与企业类型和业务逻辑；
- 地址、坐标、区域、分类、技术、产品、标签、重要度和他行存量客户均有独立研究状态；缺失精确门址的企业仍进入地图，详情页显示必要的定位状态和来源提示，不在全局图例中暴露数据处理细节。

电力装备（含储能）、生物医药和人工智能由独立脚本生成，不与集成电路主表混用：

```bash
cd frontend
pnpm prepare:new-industries
```

该命令读取 `可参考内容/con_info5/` 和 `frontend/docs/` 中对应的分类、上市企业、地址及关系研究结果，生成 `frontend/public/data/industries/companies-power.json`、`companies-biomed.json`、`companies-ai.json`，并由 `frontend/public/data/industries/index.json` 登记。四个分片各自维护企业、标签、三级分类和关系，不跨产业链拼接样本。

坐标研究脚本只在一次性准备阶段联网，结果写入 `frontend/docs/*-research.json` 等本地证据文件，再由准备脚本合并；前端运行时不请求地图或地理编码服务。历史重点企业补充与法人核验记录仍保留在 `frontend/docs/key-company-enrichment.json`、`frontend/docs/key-company-crosswalk.json` 中，但不再决定当前企业范围。

地址与坐标补齐可按 [frontend/docs/location-import-template.csv](frontend/docs/location-import-template.csv) 提供字段。源 Excel 位于本地 `可参考内容/con_info1.xlsx`，该目录按仓库规则不纳入 Git；运行时使用的 4,477 行生成数据和审计结果已单独保存，若在另一台机器重新生成数据，需要在 `frontend/` 中通过 `MASTER_SOURCE_PATH=../可参考内容/con_info1.xlsx` 指向同一份源表。

高德一次性研究所需的 key 放在 `frontend/.amap-key`，该文件由根目录 `.gitignore` 忽略，不会提交；也可以临时设置 `AMAP_WEB_KEY`。运行时不读取或请求高德接口。
