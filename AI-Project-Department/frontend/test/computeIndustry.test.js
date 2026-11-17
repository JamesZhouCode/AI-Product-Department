// 算力产业接入的回归测试：链数据 / 授信 / 分析 / 行业（宏观）/ 政策 / 周报 六个环节
// 都必须真正切到算力口径，而不是只把行业名换掉。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { INDUSTRY_OPTIONS, chainPaletteFor, industryGroupFor } from '../src/chainPalette.js';
import { BUILT_IN_INDUSTRY_CATALOG } from '../src/features/app/industryData.js';
import { SEGMENT_FACTS } from '../src/features/analysis/analysisSegmentFacts.js';
import { SECTOR_TYPE, SEGMENT_BY_CHAIN } from '../src/features/credit/creditConfig.js';
import { buildCreditOverview, evaluateCompany } from '../src/features/credit/creditEngine.js';
import { buildIndustryAtlasModel } from '../src/features/insights/industryModel.js';
import {
  MACRO_INDUSTRIES,
  macroDataFor,
  macroSourcesFor,
} from '../src/features/macro/macroDataFor.js';
import { digestPolicies, policyScopesFor } from '../src/features/policy/policyDigest.js';
import { samplePoliciesFor } from '../src/features/policy/policyData.js';
import { policyFocusFor, isComputePolicy } from '../src/features/policy/policyIndustry.js';
import { buildStorageWeeklyModel } from '../src/features/report/storageWeeklyModel.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const readText = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const chain = readJson('public/data/industries/compute-chain.json');
const shard = readJson('public/data/industries/companies-compute.json');
const credit = readJson('public/data/credit/compute-credit-mock.json');
const analysis = readJson('public/data/analysis/compute-analysis-mock.json');

// ---------------------------------------------------------------- 产业链数据

test('算力链已注册为独立一级链，可被顶部切换器选中', () => {
  assert.ok(INDUSTRY_OPTIONS.includes('算力产业'), '顶部产业链选项缺少算力产业');
  assert.equal(industryGroupFor('算力产业'), 'compute');
  const catalog = BUILT_IN_INDUSTRY_CATALOG.find((entry) => entry.id === 'compute');
  assert.ok(catalog, '行业目录缺少 compute 分片');
  assert.equal(catalog.file, 'industries/companies-compute.json');
});

test('算力链为 5 个一级环节 / 18 个二级环节，供给侧与知识库一一对应', () => {
  assert.equal(chain.industry, '算力产业');
  assert.equal(chain.levels.length, 5);
  const children = chain.levels.flatMap((level) =>
    (level.children || []).map((child) => ({
      key: `${level.label}|${child.label}`,
      position: level.position,
    })),
  );
  assert.equal(children.length, 18);
  // 需求侧（算力需求方）是终端用户，不进分析与授信知识库，其余 17 个环节必须一一对应。
  const supplySide = children.filter((item) => item.position !== '需求侧');
  assert.equal(supplySide.length, 17);
  for (const { key } of supplySide) {
    assert.ok(SEGMENT_FACTS[key], `算力环节缺少分析知识库：${key}`);
    assert.ok(SEGMENT_TYPE[key], `算力环节缺少授信类型映射：${key}`);
  }
});

// 三级环节 → 授信企业类型（与 creditConfig.SECTOR_TYPE 同源，覆盖 19 个二级环节）。
const SEGMENT_TYPE = Object.fromEntries(
  Object.keys(SEGMENT_FACTS)
    .filter((key) => key.startsWith('算力'))
    .map((key) => [key, SECTOR_TYPE[key.split('|')[1]]]),
);

test('算力链统计与调色板一致：3475 家入链、5 个一级环节各有一组配色', () => {
  assert.equal(chain.stats.level1, 5);
  assert.equal(chain.stats.level2, 18);
  assert.equal(chain.companies.length, 3475);
  assert.equal(chain.stats.otherCustomers, 1021);
  assert.ok(chain.relations.length > 0, '股权 / 客户供应商关系应已入链');

  const palette = chainPaletteFor('算力产业');
  const groups = palette.filter((group) =>
    chain.levels.some((level) => level.label === group.label),
  );
  assert.equal(groups.length, 5, '调色板的一级环节应与链数据一致');
  const sectors = palette.flatMap((group) => group.atlas?.sectors || []).filter(Boolean);
  for (const level of chain.levels) {
    for (const child of level.children || []) {
      assert.ok(sectors.includes(child.label), `调色板缺少二级环节配色：${child.label}`);
    }
  }
});

test('企业分片只保留在链企业：3475 家 = 452 上市 + 3023 非上市，不含未入链客户池', () => {
  assert.equal(shard.industry, '算力产业');
  assert.equal(shard.scope, 'in-chain', '分片应标注为「只在链企业」口径');
  const shardIds = new Set(shard.companies.map((item) => item.id));
  const chainIds = new Set(chain.companies.map((item) => item.id));
  assert.equal(shard.companies.length, chain.companies.length, '分片应恰好等于在链企业数');
  assert.equal(shard.companies.length, 3475);
  assert.deepEqual(
    [...shardIds].filter((id) => !chainIds.has(id)),
    [],
    '分片不应包含未入链企业',
  );
  const missing = chain.companies.filter((item) => !shardIds.has(item.id));
  assert.deepEqual(missing.map((item) => item.name).slice(0, 5), [], '分片遗漏在链企业');
  const listed = shard.companies.filter((item) => item.companyType === 'listed').length;
  assert.equal(listed, chain.stats.listed);
  assert.equal(shard.counts.totalCompanies, 3475, '顶栏「当前链样本」应显示在链企业数');
  assert.equal(shard.counts.nonListed, 3023);
  // 客户池仍保留在链文件里作为归档，只是不再进入地图 / 图谱 / 授信。
  assert.equal(chain.otherCustomers.length, 1021);
});

test('统一社会信用代码是唯一主键：同码不重复、缺码不伪造', () => {
  const codes = shard.companies
    .map((item) => item.creditCode)
    .filter((code) => code && code.length === 18);
  assert.equal(new Set(codes).size, codes.length, '统一社会信用代码出现重复，主键失效');
  assert.equal(codes.length, 2822, '合规信用代码应为 2822 个');

  const pending = shard.companies.filter((item) => item.keyStatus === 'pending_credit_code');
  assert.equal(pending.length, 653, '缺码主体应进待补桶');
  for (const item of pending) {
    assert.equal(item.creditCode, '', '缺码主体不得伪造信用代码');
    assert.ok(item.keyValue.startsWith('pending:CP:'), '待补主键应带 pending 前缀');
  }
  for (const item of shard.companies.filter((row) => row.keyStatus === 'verified')) {
    assert.equal(item.keyValue, item.creditCode, 'verified 主体的主键应等于信用代码');
    assert.equal(item.id, `cp-${item.creditCode}`, '展示 id 应直接由信用代码派生');
  }
});

test('图谱页三级环节覆盖链内全部 18 个环节，需求侧单列成组', () => {
  const model = buildIndustryAtlasModel(shard, '算力产业');
  assert.equal(model.secondary.length, 5, '图谱二级链路应与 5 个一级环节一致');
  assert.equal(model.tertiary.length, 18, '图谱三级环节数应与链数据的 18 个二级环节一致');
  assert.equal(model.companies.length, chain.stats.listed, '图谱只承载上市样本');
  assert.ok(
    model.tertiary.every((node) => node.count > 0 || node.listedPending),
    '数量为 0 且非待补的环节会让清单环节在图上消失',
  );

  const demand = model.tertiary.find((node) => node.label === '算力需求方/应用');
  assert.ok(demand, '需求侧应作为独立三级环节出现');
  assert.equal(demand.secondaryLabel, '算力需求方');
});

// ---------------------------------------------------------------- 授信

test('授信数据切到算力口径：企业数与已评价数来自算力链', () => {
  assert.equal(credit.industry, 'compute');
  assert.equal(credit.industryLabel, '算力产业');
  assert.equal(credit.companies.length, 3475, '授信只评价在链企业');
  assert.ok(credit.evaluatedCount > 0);
  assert.ok(credit.evaluatedCount < credit.companies.length, '应保留部分未评价企业');
  const hookSource = readText('src/features/credit/useCreditData.js');
  assert.ok(
    hookSource.includes("算力产业: 'data/credit/compute-credit-mock.json'"),
    '授信数据钩子未接入算力文件',
  );
});

test('算力企业可被授信引擎评分，且同一企业结果可复现', () => {
  const scored = [];
  for (const company of credit.companies) {
    const evaluation = evaluateCompany(company);
    if (evaluation) scored.push({ company, evaluation });
    if (scored.length >= 20) break;
  }
  assert.ok(scored.length >= 20, '算力授信可评价样本不足');
  for (const { company, evaluation } of scored) {
    const again = evaluateCompany(company);
    assert.equal(evaluation.total, again.total, `${company.name} 评分不可复现`);
    assert.ok(evaluation.total >= 0 && evaluation.total <= 100);
  }
  const overview = buildCreditOverview(scored);
  assert.equal(overview.totalCompanies, scored.length);
  assert.equal(overview.evaluatedCount, scored.length);
  assert.ok(overview.avgScore > 0 && overview.avgScore <= 100);
});

test('算力五个一级环节都有上中下游归属，避免授信分档落空', () => {
  for (const level of chain.levels) {
    assert.ok(SEGMENT_BY_CHAIN[level.label], `缺少一级环节归属：${level.label}`);
  }
});

// ---------------------------------------------------------------- 分析

test('分析数据切到算力口径：4 个一级环节 / 19 个二级环节', () => {
  assert.equal(analysis.industry, '算力产业');
  assert.equal(analysis.index.length, 4);
  assert.equal(analysis.segments.length, 19);
  for (const segment of analysis.segments) {
    assert.ok(segment.oneLiner.length > 10, `${segment.key} 缺少一句话结论`);
    assert.equal(segment.conclusions.length, 6, `${segment.key} 核心结论应为 6 条`);
    assert.ok(segment.market, `${segment.key} 缺少市场规模`);
    assert.ok(segment.capacity, `${segment.key} 缺少产能数据`);
    assert.ok(segment.credit?.rating, `${segment.key} 缺少授信评级`);
  }
  const hookSource = readText('src/features/analysis/useAnalysisData.js');
  assert.ok(
    hookSource.includes("算力产业: 'data/analysis/compute-analysis-mock.json'"),
    '分析数据钩子未接入算力文件',
  );
  const pageSource = readText('src/features/analysis/AnalysisPage.jsx');
  assert.ok(
    pageSource.includes("const ANALYSIS_INDUSTRIES = ['储能产业', '算力产业']"),
    '分析页行业白名单未包含算力产业',
  );
});

// ---------------------------------------------------------------- 行业（宏观）

test('行业页按产业链切换数据集，算力口径的契约与储能完全一致', () => {
  assert.deepEqual(MACRO_INDUSTRIES, ['储能产业', '算力产业']);
  const storage = macroDataFor('储能产业');
  const compute = macroDataFor('算力产业');
  assert.equal(compute.MACRO_META.industry, '算力产业');
  assert.equal(compute.MACRO_KPIS.length, 6);
  assert.equal(compute.MACRO_META.modules.length, 10);
  assert.equal(compute.MACRO_GROUPS.length, 6);
  assert.equal(
    compute.MACRO_GROUPS.reduce((sum, group) => sum + group.items.length, 0),
    24,
    '数据底座应保持六类 24 项指标',
  );
  // 两套数据集的导出名必须一致，否则页面切换会缺字段。
  const missing = Object.keys(storage).filter((key) => !(key in compute));
  assert.deepEqual(missing, [], `算力数据集缺少导出：${missing.join('、')}`);
});

test('行业页环节样本按算力链实时取数（5 个一级环节全部命中）', () => {
  const compute = macroDataFor('算力产业');
  const positions = compute.buildChainPositions(chain.levels);
  const rows = positions.flatMap((position) => position.levels);
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.equal(row.live, true, `${row.label} 未取到链数据`);
    assert.ok(row.sample.companies > 0, `${row.label} 缺少企业样本`);
  }
});

test('行业页来源说明按产业链切换，不串用储能来源', () => {
  const storageSources = macroSourcesFor('储能产业');
  const computeSources = macroSourcesFor('算力产业');
  assert.notEqual(storageSources, computeSources);
  assert.ok(computeSources.MACRO_SOURCE_META.miitPlan, '算力来源缺少工信部口径');
  assert.ok(computeSources.MACRO_SOURCE_META.ndrcHub, '算力来源缺少东数西算口径');
  assert.ok(computeSources.MACRO_SOURCE_SUMMARY.includes('算力产业'), '来源说明未以算力为主体');
  // 储能的公开口径（CNESA / GGII）不得出现在算力的来源表里。
  assert.equal(computeSources.MACRO_SOURCE_META.cnesaStat, undefined);
  assert.equal(computeSources.MACRO_SOURCE_META.ggiiStat, undefined);
  for (const row of computeSources.MACRO_FIELD_SOURCES) {
    for (const item of row.items) {
      assert.ok(
        computeSources.MACRO_SOURCE_META[item.source],
        `字段来源引用了不存在的 key：${item.source}`,
      );
    }
  }
});

// ---------------------------------------------------------------- 政策

test('政策页切到算力视角：解读范围与结论文案都按算力生成', () => {
  assert.equal(policyFocusFor('算力产业').key, 'compute');
  assert.equal(policyFocusFor('储能产业').key, 'storage');

  const scopes = policyScopesFor(policyFocusFor('算力产业'));
  assert.equal(scopes.length, 2);
  assert.ok(scopes[0].label.includes('算力'));
  assert.ok(!scopes[0].label.includes('储能'));
  assert.ok(scopes[0].desc.includes('算力'));

  const digest = digestPolicies([], { scope: 'storage', focus: policyFocusFor('算力产业') });
  assert.equal(digest.focus.key, 'compute');
  assert.ok(digest.overall.headline.includes('算力'));
  assert.ok(digest.scopeMeta.label.includes('算力'));
  assert.equal(digest.compare.focusInLexicon, false, '算力不在 27 个参照行业内，应单列');
});

test('算力政策关键词可识别智算/算力类文件，且不误伤纯储能文件', () => {
  assert.ok(
    isComputePolicy({
      title: '关于加快智能算力基础设施建设的实施意见',
      content: '到 2027 年建成若干智算中心，PUE 低于 1.25。',
    }),
  );
  assert.ok(
    isComputePolicy({
      title: '国家枢纽节点算力调度平台上线',
      content: '接入东数西算八大枢纽。',
    }),
  );
  assert.ok(
    !isComputePolicy({
      title: '关于推动新型储能高质量发展的指导意见',
      content: '加快电化学储能电站建设，完善容量电价机制。',
    }),
  );
});

// ---------------------------------------------------------------- 周报

test('周报走链驱动分支：算力链生成算力口径的周报模型', () => {
  const model = buildStorageWeeklyModel(chain, '2026.10.12 — 2026.10.18', '算力产业');
  assert.ok(model, '算力周报模型不应为空');
  assert.equal(model.masthead.industry, '算力产业');
  assert.ok(model.masthead.subtitle.includes('5 大一级环节'));
  assert.equal(model.accent, '#a1381f', '算力周报应使用算力主色');
  const stats = Object.fromEntries(model.masthead.stats.map((row) => [row.key, row.value]));
  assert.equal(stats.listed, chain.stats.listed);
  assert.equal(stats.level2, 18);
  // 周报只讲在链企业：非上市口径应为链内 3023 家，而不是链外的 1021 家客户池。
  assert.equal(stats.pool, 3023);
  const poolStat = model.masthead.stats.find((row) => row.key === 'pool');
  assert.equal(poolStat.label, '非上市在链');
  assert.ok(model.readout.headline.startsWith('算力链'));
  assert.ok(!model.footer.scope.includes('储能'));
});

test('算力示例政策成套提供，覆盖国家 / 省 / 地市 / 园区四级并能被算力口径识别', () => {
  const samples = samplePoliciesFor('compute');
  assert.equal(samples.length, 4);
  assert.deepEqual(
    samples.map((sample) => sample.level),
    ['national', 'provincial', 'municipal', 'park'],
  );
  for (const sample of samples) {
    assert.ok(isComputePolicy(sample), `${sample.title} 未被算力关键词口径识别`);
    assert.ok(sample.text.includes('算力') || sample.text.includes('智算'), '示例正文缺少算力表述');
  }
  assert.equal(samplePoliciesFor('storage').length, 4, '储能示例政策不应被覆盖');
  const hook = readText('src/features/policy/usePolicyLibrary.js');
  assert.ok(hook.includes('samplePoliciesFor'), '政策库未按行业取示例');
});

test('页面源码：分析 / 行业 / 政策 / 周报都已按产业链切换数据源', () => {
  const analysisPage = readText('src/features/analysis/AnalysisPage.jsx');
  assert.ok(analysisPage.includes('useAnalysisData(industry)'));
  assert.ok(analysisPage.includes('STRUCTURED_REPORT_INDUSTRIES'), '分析页应区分有无结构化研报');

  const macroPage = readText('src/features/macro/MacroPage.jsx');
  assert.ok(macroPage.includes('macroDataFor(selectedIndustry)'));
  assert.ok(macroPage.includes('MacroSourceContext.Provider'), '行业页应注入对应行业的来源元数据');

  const policyPage = readText('src/features/policy/PolicyPage.jsx');
  assert.ok(policyPage.includes('policyFocusFor(selectedIndustry)'));

  const weeklyPage = readText('src/features/report/WeeklyReportPage.jsx');
  assert.ok(weeklyPage.includes('compute-chain.json'));
  assert.ok(weeklyPage.includes('isChainReport'));
});
