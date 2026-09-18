# 仓库指南

## 项目结构

- `frontend/`：完整、可独立运行的 Vite/React 前端项目。
  - `frontend/src/`：React 页面、MapLibre 地图逻辑、兜底几何、产业链配色、数据模型和 UI 样式；`frontend/src/App.jsx` 负责页面组合，具体工作台状态由 `features/app/` 和 `features/map/` 下的 hooks 维护。
  - `frontend/src/features/app/`：产业链目录解析、应用级数据加载和持久化编辑状态。
  - `frontend/src/features/map/`：地图工作台编排、筛选、选中、企业操作、全屏、地图图层契约和地图渲染。
  - `frontend/public/data/`：运行时读取的企业、关系和行政区划生成数据；`industries/` 保存三条新增产业链的独立数据分片。
  - `frontend/public/map/`、`frontend/public/assets/`：可选的离线 PMTiles、字体和精灵图资源。
  - `frontend/scripts/`：数据准备、一次性地址研究、地图资源提取/校验和浏览器冒烟检查脚本。
  - `frontend/docs/`：调研结果、导入模板、数据审计和数据结构说明。
  - `frontend/test/`：Node 测试和产业链领域模型测试。
- `可参考内容/`：本地源 Excel 和参考资料，不属于前端运行时，也不纳入 Git。
- `backend/`：未来新增的 Spring Boot 后端，与 `frontend/` 保持同级。
- 根目录只保留仓库级指南、说明和 `.gitignore`；前端依赖、配置和工具均位于 `frontend/`。

## 构建、测试与本地开发

所有前端命令必须在 `frontend/` 目录运行：

```bash
cd frontend
pnpm install
pnpm dev
```

访问 `http://127.0.0.1:5173/`。提交前运行 `pnpm check`，它会依次执行格式检查、ESLint、Node 测试和生产构建。启动本地开发服务后运行 `pnpm smoke`（等价于 `node scripts/smoke.mjs`）执行 1440×900 Playwright 冒烟测试；如果服务不在 5173 端口，设置 `SMOKE_BASE_URL=http://127.0.0.1:<端口> pnpm smoke`。冒烟测试检查四条产业链切换、地图加载、筛选、区域联动、关系范围、银行标记、控制台错误和外部请求。修改源 Excel 后运行对应的数据准备脚本；修改 PMTiles 后运行 `pnpm verify:map`。

如果未来新增 Spring Boot 后端，后端命令、Maven Wrapper 和 Java 测试在 `backend/` 内运行，不与前端的 pnpm 依赖混用。

## 编码风格与命名

使用两个空格缩进、分号和单引号，React 组件保持小而清晰。重复计算使用 `useMemo`，企业查找使用稳定的标准化名称或 ID。组件使用 `PascalCase`，函数和状态使用 `camelCase`，CSS 类名和 MapLibre 图层 ID 使用 kebab-case。产业链颜色与别名统一维护在 `frontend/src/chainPalette.js`；地图图层和数据源 ID 统一维护在 `frontend/src/features/map/mapLayers.js`。`useMapWorkspace` 只负责组合工作台能力，新增筛选、选中或企业操作逻辑应放入对应的独立 hook，避免地图、图谱和周报重复维护同一套状态规则。

前端运行时不得调用地理编码服务、外部地图接口或其他外部数据接口；地图、字体、精灵图和企业数据都必须从 `frontend/public/` 的本地资源读取。一次性研究脚本可以联网，但结果必须落盘到 `frontend/docs/`，并在数据记录中保留地址、来源、精度、坐标系和复核状态。

## 数据边界

- 地图展示当前选中产业链分片的全量企业；集成电路主表当前为 4,477 家。上市企业筛选、产业链图谱和周报统一使用 `tags` 中的 `上市企业` 口径。
- 四条产业链是独立样本集，由 `frontend/public/data/industries/index.json` 和各自数据分片登记；不得把其他产业链的企业、标签、三级分类或关系混入当前链路。
- `ordinary`/`key` 与 `isKey` 仅作为历史研究档案匹配的溯源字段，不要把它们混入当前企业范围筛选；企业标签与二级产业链同样是独立字段。
- 运行时关系只连接两端均为上市企业的实体，企业名称、详情字段和标签编辑入口应尽量与地图详情保持一致；旧研究关系可作为历史输入保留。
- 产业链目录不可用时只能回退到完整的四条内置目录；单个数据分片缺失或格式错误应显示可见错误，不得静默显示集成电路或空数据。
- 缺失精确门址的企业仍可使用候选或区域参考位置进入地图；不应用城市中心点冒充精准点位。定位状态和来源提示放在企业详情或审计数据中，不在全局图例中制造额外噪音。

## 测试规范

仓库没有独立的浏览器单元测试，`frontend/test/` 中的 Node 测试和 `frontend/scripts/smoke.mjs` 是必跑检查。修改 UI 行为时保留现有断言，并为新增筛选器、地图图层、数据状态或目录路径补充针对性断言。测试结果应无控制台错误、无外部请求。

## 提交与 Pull Request

遵循现有 Conventional Commit 风格，例如 `feat: 简化产业链地图界面`、`fix: ...`、`chore: ...`。每个提交保持单一目的；涉及数据、目录结构或视觉行为时，在提交说明中写明影响。PR 应包含变更摘要、验证命令及结果、涉及的数据/资源和视觉变更前后截图；大型 PMTiles 或调研文件需单独说明。

## 离线数据与配置

禁止提交凭据和 API Key。高德一次性研究使用 `frontend/.amap-key`，该文件由根目录 `.gitignore` 忽略；也可以临时设置 `AMAP_WEB_KEY`，不要把 key 写入代码、`frontend/public/` 或文档。

修改生成数据时，使用 `frontend/public/data/` 作为运行时数据目录；源 Excel 和参考文件使用根目录 `可参考内容/`；不要重新创建根目录 `public/`、`src/`、`scripts/`、`docs/` 或 `test/`。新增坐标时记录地址、来源、精度、坐标系和复核状态；不得用城市中心点冒充企业精准位置。
