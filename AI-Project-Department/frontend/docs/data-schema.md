# 数据结构约定

## Entity

每个企业实体包含：

- `id`：内部稳定 ID；
- `name` / `normalizedName`：展示名与去重键；
- `creditCode` / `aliases` / `dedupe`：统一社会信用代码、企业别名和去重证据；同一企业的历史名称/品牌名通过 `dedupe.canonicalName` 和 `mapDisplay=false` 折叠为一个主点位；
- `companyType`：`ordinary` 或 `key`，仅保留旧研究档案与主表匹配的历史溯源字段，不作为当前产品范围；
- `isKey`：与历史研究档案匹配结果同步的便捷布尔字段，不作为当前产品范围；
- `chain` / `sector`：当前官方二级产业链和三级产业链名称；本项目当前采用 `docs/industry-taxonomy.json` 中的 6 个二级、19 个 `x.y` 三级目录，`待研判` 表示证据不足；
- `secondaryCode` / `tertiaryCode`：对应官方目录编码；不写入 `x.y.z` 及以下目录；
- `legacyChain` / `legacySector`：旧版分类留痕，仅作为映射审计证据，不作为前端展示口径；
- `classificationStatus` / `classificationMethod` / `classificationConfidence` / `classificationEvidence`：映射状态、方法、置信度和证据；`manual`、`evidence-mapped`、`fallback`、`pending` 分别表示人工覆盖、企业字段证据、源表兜底和待研判；
- `tags`：企业可同时拥有多个来源标签；`上市企业` 是当前产品的统一范围标签，地图筛选、顶部统计、图谱、周报和关系展示均以此标签为准。二级产业链由独立产业链字段和筛选器负责，也不混入标签；地图顶部标签支持 AND 交集筛选，详情中可通过本地编辑器维护标签；没有证据的深圳分行荣誉标签不自动补写；
- `listedEvidence`：上市企业的证券代码、交易所、证券简称、官方来源和核验日期；全称精确匹配的全量补充记录来自 `docs/listed-company-evidence.json`，不在运行时访问外部接口；
- `address` / `region`：省、市、区、街道；
- `location`：`{ lng, lat, coordinateSystem, precision, score, query }`；研究阶段以 WGS84/CGCS2000-compatible 固化，运行时不请求地理编码服务；地图允许把低精度候选写入 `location` 以便全量展示，但必须通过 `locationStatus` 区分 `已复核`、`候选` 和 `区域参考`，后两者不计入精准点位统计；`query` 记录一次性解析所用地址或企业 POI 查询词，便于复核。公开来源明确给出的 GCJ-02 坐标必须在研究阶段转换后再入库，不能与 WGS84 混用；
- `locationStatus` / `locationSource`：定位状态、来源和复核信息；
- `coreTechnology` / `procurement` / `products`：企业画像；
- `suppliers` / `distributors`：一、二级上下游列表；
- `bank`：`isOurCustomer`、`isCreditCustomer`、`otherBankCustomer`、`sourceBatch`；没有内部数据时使用 `null` 和 `not-researched`，不把“未标记”当成“否”;
- `evidence` / `research`：来源、研究状态、可信度和复核时间；`research.fieldStatus` 对地址、坐标、区域、分类、技术、产品、标签、重要度和他行存量客户分别记录 `source-*`、`research-*`、`pending-verification` 或 `not-found-public-evidence`，未知字段不填造值。

`docs/company-master-audit.json` 是每次 `pnpm prepare:data` 生成的覆盖审计：它同时对照源 Excel 行数、运行时主表行序、历史研究档案 crosswalk、上市企业证据记录、上市企业关系范围、一次性坐标研究命中率和旧模型隔离不变量。审计中的待核数量是当前数据边界，不代表把未知企业当成已确认事实。

`docs/industry-mapping-audit.json` 保存每家企业的二级/三级映射、证据、状态和复核队列；人工确认后只应在 `docs/industry-mapping-overrides.json` 增加稳定 ID 或企业名称覆盖，再重新运行 `pnpm prepare:data`。

地图 POI 研究数据保存在 `docs/360-poi-research.json`，由 `pnpm research:360` 一次性生成后合并到 `public/data/companies.json`；深圳分行参考资料的精确名称/地址匹配结果保存在 `docs/reference-location-research.json`；高德官方 Web Service 批量研究结果保存在 `docs/amap-geocode-research.json`，分别由 `pnpm research:reference` 和配置前端目录 `.amap-key`（或临时设置 `AMAP_WEB_KEY`）后的 `pnpm research:amap-geocode` 生成；无企业门址但可识别城市/区域的全量覆盖点保存在 `docs/region-location-research.json`，由 `pnpm research:regions` 一次性生成。`.amap-key` 已加入仓库根目录 `.gitignore`，只存在于本机，不进入提交。前端运行时不调用地图或地理编码接口。地址只能匹配到建筑/门址、而不能确认企业名称的记录会以较低 `score` 和 `locationStatus: "候选"` 进入地图；只有城市或区域级别依据的记录使用 `regionLocation` 和 `locationStatus: "区域参考"`，两者都不冒充企业名称精确 POI。

`counts.sourceRows` 保留新 Excel 的 4,477 行规模，`counts.totalCompanies` 是运行时主表规模，`counts.listed` 是当前上市企业范围数，`counts.relationCount` 是两端均为上市企业的关系数，`counts.relationSupplementCount` 是从历史企业画像一级上下游字段补充的关系数；`counts.keyProfiles`、`counts.key`、`counts.keyTargetRows`、`counts.excludedKeyProfiles` 和 `counts.unresolvedKeyProfiles` 只用于历史研究档案匹配审计，不参与产品筛选。

`docs/listed-company-evidence.json` 是一次性固化的交易所公司全称匹配快照，当前覆盖上交所和深交所；北交所、港股以及名称变更、母子公司关系需要另行建立实体 crosswalk。

## Relation

```json
{
  "from": "华大九天",
  "to": "浪潮信息",
  "relationType": "供应",
  "depth": 1,
  "source": "行业公开信息"
}
```

`relationType` 当前支持 `供应`、`经销`、`股权`，后续可以扩展合作、投资、竞争等关系。

运行时关系只保留 `from` 和 `to` 两端都带有 `上市企业` 标签的记录；历史研究关系原始文件仍作为溯源输入保存。由历史企业画像一级上下游字段补充的关系还会记录 `sourceFromProfile`、`sourceRelationField`、`sourceRelationLevel`、`sourceRelationName`、`sourceRecord`、`sourceEvidence` 和 `sourceReviewedAt`，便于逐条复核；当前只转换 `level1`，不把二级上下游或行业推测直接作为正式关系。

## 坐标验收

精准落图统计只计算 `locationStatus` 为 `已复核` 或 `verified` 的实体；地图覆盖统计可以包含 `locationStatus: "候选"` 和 `"区域参考"`，但界面必须通过图例和详情提示区分。候选/区域参考坐标来源仍需记录地址、来源、坐标系、精度和复核状态；交互演示点位单独使用 `demoOnly: true`。
