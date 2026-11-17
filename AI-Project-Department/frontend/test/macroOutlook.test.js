// 「宏观」页（储能产业宏观研判中枢）的数据与接入单测：
// 1) 九大模块 + 数据底座的结构完整（编号连续、每个判断都有三段式依据）；
// 2) 产业链环节与产业链地图真实数据同源（含快照回落）；
// 3) 景气度 / 风险评分的分项与总分自洽；
// 4) 全部来源标注可解析，官方口径必须写明发布主体与可对接数据源；
// 5) 源码层面：页签顺序、App 渲染分支与跨模块联动跳转。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ASSISTANT,
  BANKING_OPPS,
  BANKING_VERDICT,
  CHAIN_OUTLOOK_NOTE,
  CHAIN_POSITIONS,
  CHAIN_SAMPLE_SNAPSHOT,
  CHAIN_VERDICT,
  COMPETITION,
  DEMAND_MODEL,
  LIFECYCLE,
  MACRO_DISCIPLINES,
  MACRO_GROUPS,
  MACRO_KPIS,
  MACRO_META,
  MACRO_VERDICT,
  POLICY_TARGETS,
  RISK_RADAR,
  SECTOR_VERDICT,
  TECH_ROUTES,
  TECH_VERDICT,
  UTILIZATION_TREND,
  buildChainPositions,
} from '../src/features/macro/macroData.js';
import {
  MACRO_FIELD_SOURCES,
  MACRO_SOURCE_META,
  MACRO_SOURCE_SUMMARY,
} from '../src/features/macro/macroSources.js';

const read = (relative) => readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8');
const readData = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

// 产业链地图的真实数据（宏观页的环节样本与它同源）。
const CHAIN_DATA = JSON.parse(readData('public/data/industries/storage-chain.json'));

const assertBasis = (basis, label) => {
  assert.ok(basis, `${label} 缺少判断依据`);
  ['data', 'logic', 'impact'].forEach((key) => {
    assert.ok(basis[key] && basis[key].length >= 20, `${label} 的 basis.${key} 缺失或过短`);
  });
};

test('模块导航含九大研判模块 + 数据底座，编号连续', () => {
  const { modules } = MACRO_META;
  assert.equal(modules.length, 10);
  modules.slice(0, 9).forEach((module, index) => {
    assert.equal(module.no, String(index + 1).padStart(2, '0'), `第 ${index + 1} 个模块编号不连续`);
    assert.ok(module.id && module.nav, `模块 ${module.no} 缺 id / nav`);
  });
  assert.equal(modules[9].id, 'appendix');
  assert.equal(modules[9].no, '附');
  const ids = modules.map((module) => module.id);
  assert.equal(new Set(ids).size, ids.length, '模块 id 存在重复');
});

test('01 行业总体判断：景气度总分等于分项均值，机会与风险齐备', () => {
  assert.equal(SECTOR_VERDICT.subScores.length, 6);
  SECTOR_VERDICT.subScores.forEach((item) => {
    assert.ok(item.label && item.score > 0 && item.score <= 100, `${item.key} 评分非法`);
    assert.ok(['up', 'watch', 'down'].includes(item.tone), `${item.key} 缺 tone`);
  });
  const average = Math.round(
    SECTOR_VERDICT.subScores.reduce((sum, item) => sum + item.score, 0) /
      SECTOR_VERDICT.subScores.length,
  );
  assert.equal(SECTOR_VERDICT.score, average, '景气度总分应与六个分项的均值一致');
  assert.ok(SECTOR_VERDICT.grade && SECTOR_VERDICT.stage, '缺少景气等级或发展阶段');
  assert.equal(SECTOR_VERDICT.opportunities.length, 3);
  assert.equal(SECTOR_VERDICT.risks.length, 3);
  [...SECTOR_VERDICT.opportunities, ...SECTOR_VERDICT.risks].forEach((item) => {
    assert.ok(item.title && item.text && item.source, `机会 / 风险项不完整：${item.title}`);
  });
  assertBasis(SECTOR_VERDICT.basis, '01 总体判断');
});

test('02 行业生命周期：四阶段进程与四项成熟度齐备', () => {
  assert.equal(LIFECYCLE.stages.length, 4);
  assert.ok(LIFECYCLE.currentIndex >= 0 && LIFECYCLE.currentIndex < LIFECYCLE.stages.length);
  assert.ok(LIFECYCLE.current.includes(LIFECYCLE.stages[LIFECYCLE.currentIndex]));
  assert.equal(LIFECYCLE.metrics.length, 4);
  LIFECYCLE.metrics.forEach((metric) => {
    assert.ok(metric.label && metric.text, `${metric.key} 缺文案`);
    assert.ok(metric.score > 0 && metric.score <= 100, `${metric.key} 评分越界`);
    assert.ok(MACRO_SOURCE_META[metric.source], `${metric.key} 引用了未知来源`);
  });
  assertBasis(LIFECYCLE.basis, '02 生命周期');
});

test('03 市场需求趋势：公式四因子、四类场景与测算结果自洽', () => {
  const formulaKeys = ['新能源新增装机', '配储比例', '储能时长', '电网调节需求系数'];
  formulaKeys.forEach((key) => {
    assert.ok(DEMAND_MODEL.formula.includes(key), `需求公式缺少因子：${key}`);
  });
  assert.equal(DEMAND_MODEL.factors.length, 4);
  DEMAND_MODEL.factors.forEach((factor) => {
    assert.ok(formulaKeys.includes(factor.label), `因子名与公式不一致：${factor.label}`);
    assert.ok(factor.value && factor.text, `${factor.label} 缺取值或说明`);
    assert.ok(['up', 'watch', 'down'].includes(factor.dir), `${factor.label} 缺方向`);
  });
  assert.equal(DEMAND_MODEL.scenarios.length, 4);
  DEMAND_MODEL.scenarios.forEach((scenario) => {
    assert.ok(scenario.score > 0 && scenario.score <= 100, `${scenario.key} 场景评分越界`);
    assert.ok(scenario.status && scenario.text, `${scenario.key} 缺状态或说明`);
  });
  assert.ok(DEMAND_MODEL.result.value && DEMAND_MODEL.result.label);
  assert.match(DEMAND_MODEL.result.note, /测算/, '需求测算结果必须标明是测算口径');
  assertBasis(DEMAND_MODEL.basis, '03 需求趋势');
});

test('04 产业链景气：一级环节与产业链地图完全对齐，样本同源', () => {
  const live = new Map(CHAIN_DATA.levels.map((level) => [level.label, level]));
  assert.equal(CHAIN_DATA.levels.length, 7);
  assert.equal(
    CHAIN_DATA.levels.reduce((sum, level) => sum + (level.childCount || 0), 0),
    24,
    '产业链地图的二级环节数应为 24',
  );

  // 上 / 中 / 下游分组与产业链地图的 positions 一致。
  assert.deepEqual(
    CHAIN_POSITIONS.map((position) => position.label),
    CHAIN_DATA.positions.map((position) => position.label),
  );

  const positions = buildChainPositions(CHAIN_DATA.levels);
  assert.equal(positions.flatMap((position) => position.levels).length, 7);
  positions.forEach((position) => {
    position.levels.forEach((level) => {
      assert.ok(live.has(level.label), `环节「${level.label}」在产业链地图中不存在`);
      assert.ok(MACRO_SOURCE_META[level.source], `环节「${level.label}」来源无效`);
      assert.ok(level.status && level.opportunity && level.risk, `环节「${level.label}」缺字段`);
      assert.ok(level.score > 0 && level.score <= 100, `环节「${level.label}」评分越界`);
      assert.equal(level.live, true, '读到产业链地图时环节应标记为实时');
      assert.equal(level.sample.companies, live.get(level.label).companyCount);
      assert.equal(level.sample.leaders, live.get(level.label).leaderCount);
      assert.equal(level.sample.children, live.get(level.label).childCount);
    });
  });

  // 中游两个环节的样本规模（判断依据里的数字来源）。
  const mid = positions.find((position) => position.key === 'mid');
  assert.equal(
    mid.levels.reduce((sum, level) => sum + level.sample.companies, 0),
    976,
    '中游企业数应为 976',
  );
  assert.equal(
    mid.levels.reduce((sum, level) => sum + level.sample.leaders, 0),
    29,
    '中游龙头数应为 29',
  );

  assertBasis(CHAIN_VERDICT.basis, '04 产业链景气');
  assert.ok(CHAIN_OUTLOOK_NOTE.includes('研判口径'));
});

test('04 产业链景气：产业链地图取数失败时回落到构建期快照，且快照与地图一致', () => {
  assert.equal(Object.keys(CHAIN_SAMPLE_SNAPSHOT).length, 7);
  const snapshot = buildChainPositions(null);
  snapshot.forEach((position) => {
    position.levels.forEach((level) => {
      assert.equal(level.live, false, '回落时不应标记为实时');
      assert.ok(level.sample, `环节「${level.label}」快照缺失`);
      const live = CHAIN_DATA.levels.find((item) => item.label === level.label);
      assert.equal(
        level.sample.companies,
        live.companyCount,
        `快照与产业链地图不一致：${level.label}`,
      );
      assert.equal(level.sample.leaders, live.leaderCount, `快照龙头数不一致：${level.label}`);
      assert.equal(level.sample.children, live.childCount, `快照二级环节数不一致：${level.label}`);
    });
  });
});

test('05 技术路线：五条路线字段完整且成熟度落在 0–100', () => {
  assert.equal(TECH_ROUTES.length, 5);
  const names = TECH_ROUTES.map((route) => route.name);
  ['磷酸铁锂', '钠离子电池', '液流电池', '压缩空气储能', '氢储能'].forEach((name) => {
    assert.ok(names.includes(name), `缺少技术路线：${name}`);
  });
  TECH_ROUTES.forEach((route) => {
    assert.ok(route.stage && route.share, `${route.name} 缺商业化阶段或份额口径`);
    assert.ok(route.maturity > 0 && route.maturity <= 100, `${route.name} 成熟度越界`);
    assert.ok(route.advantage && route.risk && route.outlook, `${route.name} 三段结论不完整`);
    assert.ok(MACRO_SOURCE_META[route.source], `${route.name} 来源无效`);
  });
  // 成熟度排序要符合产业事实：锂电最高、氢储能最低。
  const maturityOf = (name) => TECH_ROUTES.find((route) => route.name === name).maturity;
  assert.equal(Math.max(...TECH_ROUTES.map((route) => route.maturity)), maturityOf('磷酸铁锂'));
  assert.equal(Math.min(...TECH_ROUTES.map((route) => route.maturity)), maturityOf('氢储能'));
  assertBasis(TECH_VERDICT.basis, '05 技术路线');
});

test('06 竞争格局：五类动作与三个梯队齐备', () => {
  assert.equal(COMPETITION.moves.length, 5);
  COMPETITION.moves.forEach((move) => {
    assert.ok(move.label && move.items.length >= 2, `${move.key} 条目不足`);
    assert.ok(MACRO_SOURCE_META[move.source], `${move.key} 来源无效`);
  });
  assert.equal(COMPETITION.tiers.length, 3);
  COMPETITION.tiers.forEach((tier) => {
    assert.ok(tier.criteria && tier.members && tier.evidence && tier.hint, `${tier.key} 字段缺失`);
  });
  assertBasis(COMPETITION.basis, '06 竞争格局');
});

test('07 风险预警：六维风险评分齐备', () => {
  assert.equal(RISK_RADAR.dims.length, 6);
  const keys = RISK_RADAR.dims.map((dim) => dim.key);
  assert.deepEqual(keys, ['capacity', 'tech', 'operation', 'revenue', 'policy', 'overseas']);
  RISK_RADAR.dims.forEach((dim) => {
    assert.ok(dim.label && dim.level && dim.text && dim.watch, `${dim.key} 字段缺失`);
    assert.ok(dim.score > 0 && dim.score <= 100, `${dim.key} 风险值越界`);
    assert.ok(MACRO_SOURCE_META[dim.source], `${dim.key} 来源无效`);
  });
  assertBasis(RISK_RADAR.basis, '07 风险预警');
});

test('08 银行业务机会：四类客群各配两项产品，联动目标页签合法', () => {
  assert.equal(BANKING_OPPS.length, 4);
  const allowedTabs = ['map', 'flow', 'fishbone', 'report', 'credit', 'analysis', 'macro'];
  BANKING_OPPS.forEach((opp) => {
    assert.ok(opp.label && opp.basisText && opp.action, `${opp.key} 字段缺失`);
    assert.equal(opp.products.length, 2, `${opp.key} 应配两项产品`);
    assert.ok(allowedTabs.includes(opp.link.tab), `${opp.key} 联动页签非法：${opp.link.tab}`);
    assert.ok(opp.link.label, `${opp.key} 缺联动按钮文案`);
  });
  assertBasis(BANKING_VERDICT.basis, '08 银行业务机会');
});

test('09 AI 行业分析助手：七类抓取源、九节周报与更新节奏齐备', () => {
  assert.equal(ASSISTANT.sources.length, 7);
  ASSISTANT.sources.forEach((item) => {
    assert.ok(item.label && item.text && item.cadence, `${item.key} 抓取源字段缺失`);
  });
  const expectedSections = [
    '行业一句话判断',
    '景气度评分与分项变化',
    '政策变化',
    '需求变化',
    '产业链变化',
    '技术趋势',
    '企业变化',
    '风险提示',
    '银行业务建议',
  ];
  assert.deepEqual(ASSISTANT.report.sections, expectedSections);
  assert.equal(ASSISTANT.cadence.length, 4);
  assert.ok(
    ASSISTANT.cadence.some((item) => item.label === '结论复核'),
    '缺少结论复核要求',
  );
  assertBasis(ASSISTANT.basis, '09 AI 助手');
});

test('附 数据底座：六类 24 项指标、两张趋势图与三条读法纪律', () => {
  assert.equal(MACRO_GROUPS.length, 6);
  const colors = new Set();
  MACRO_GROUPS.forEach((group, index) => {
    assert.equal(group.no, String(index + 1).padStart(2, '0'), `第 ${index + 1} 组编号应连续`);
    assert.ok(group.title && group.summary, `${group.key} 缺标题或摘要`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(group.color), `${group.key} 取色格式非法`);
    assert.ok(!colors.has(group.color), `${group.key} 取色与其他组重复`);
    colors.add(group.color);
    assert.equal(group.items.length, 4, `${group.key} 应有 4 项指标`);
    group.items.forEach((item) => {
      assert.ok(item.name && item.reading && item.hint, `${group.key} 存在空字段：${item.name}`);
    });
  });

  for (const chart of [UTILIZATION_TREND, POLICY_TARGETS]) {
    assert.ok(chart.title && chart.note);
    const kinds = new Set(chart.bars.map((bar) => bar.kind));
    assert.equal(kinds.size, chart.legend.length, `${chart.title} 图例与柱型数量不一致`);
    chart.bars.forEach((bar) => {
      assert.ok(bar.value > 0, `${chart.title} 存在非正数柱值：${bar.label}`);
      assert.ok(kinds.has(bar.kind));
    });
  }
  // 半年度口径（26H1）不能与年度口径混为一谈：确保两类柱型同时存在。
  assert.deepEqual(
    new Set(UTILIZATION_TREND.bars.map((bar) => bar.kind)),
    new Set(['year', 'half']),
  );
  assert.deepEqual(
    new Set(POLICY_TARGETS.bars.map((bar) => bar.kind)),
    new Set(['actual', 'target']),
  );

  assert.equal(MACRO_KPIS.length, 6);
  MACRO_KPIS.forEach((kpi) => assert.ok(kpi.key && kpi.value && kpi.label));
  assert.ok(MACRO_VERDICT.headline.length >= 10);
  assert.ok(MACRO_VERDICT.summary.length >= 30);
  assert.equal(MACRO_VERDICT.tags.length, 4);
  MACRO_VERDICT.tags.forEach((tag) => assert.ok(tag.key && tag.label && tag.text && tag.tone));
  assert.equal(MACRO_DISCIPLINES.length, 3);
  MACRO_DISCIPLINES.forEach((item) => {
    assert.ok(item.key && item.title && item.text.length >= 20, `${item.key} 文案过短`);
  });
});

// ---------------------------------------------------------------- 数据来源支撑

const allSourceKeys = () => [
  ...MACRO_KPIS.map((kpi) => kpi.source),
  ...SECTOR_VERDICT.subScores.map(() => SECTOR_VERDICT.source),
  ...SECTOR_VERDICT.opportunities.map((item) => item.source),
  ...SECTOR_VERDICT.risks.map((item) => item.source),
  SECTOR_VERDICT.source,
  LIFECYCLE.source,
  ...LIFECYCLE.metrics.map((item) => item.source),
  DEMAND_MODEL.source,
  DEMAND_MODEL.result.source,
  ...DEMAND_MODEL.factors.map((item) => item.source),
  ...DEMAND_MODEL.scenarios.map((item) => item.source),
  CHAIN_VERDICT.source,
  ...CHAIN_POSITIONS.flatMap((position) => position.levels.map((level) => level.source)),
  TECH_VERDICT.source,
  ...TECH_ROUTES.map((route) => route.source),
  COMPETITION.source,
  ...COMPETITION.moves.map((item) => item.source),
  ...COMPETITION.tiers.map((item) => item.source),
  RISK_RADAR.source,
  ...RISK_RADAR.dims.map((item) => item.source),
  BANKING_VERDICT.source,
  ...BANKING_OPPS.map((item) => item.source),
  ASSISTANT.source,
  ...MACRO_GROUPS.flatMap((group) => [group.source, ...group.items.map((item) => item.source)]),
  MACRO_VERDICT.source,
  UTILIZATION_TREND.source,
  POLICY_TARGETS.source,
  ...MACRO_DISCIPLINES.map((item) => item.source),
];

test('每条读数与判断都带来源标注，且来源可解析', () => {
  const keys = allSourceKeys();
  keys.forEach((key) => {
    assert.ok(key, '存在未标注来源的数据项');
    assert.ok(MACRO_SOURCE_META[key], `引用了未定义的来源：${key}`);
  });
  // 官方口径（data）与研判口径（ai）都要出现，避免整页只标一类。
  const kinds = new Set(keys.map((key) => MACRO_SOURCE_META[key].kind));
  assert.deepEqual(kinds, new Set(['data', 'ai']));
});

test('来源元数据字段完整：官方口径必须给出可对接的数据源清单', () => {
  Object.entries(MACRO_SOURCE_META).forEach(([key, meta]) => {
    assert.ok(['data', 'ai'].includes(meta.kind), `${key} 的 kind 非法`);
    assert.ok(meta.scope && meta.badge && meta.title, `${key} 缺 scope / badge / title`);
    assert.ok(meta.detail.length >= 30, `${key} 的 detail 过短`);
    if (meta.kind === 'data') {
      assert.ok(meta.databases.length > 0, `${key} 为官方口径，必须列出数据源清单`);
      assert.ok(/发布|统计|文件|报告|披露|公告|口径/.test(meta.detail), `${key} 未写明发布主体`);
    }
    assert.ok(Array.isArray(meta.databases));
  });
  // 行内数据与助手口径必须存在，对应「与产业链地图联动」「自动更新」两条验收标准。
  ['chainMap', 'assistantEngine', 'demandModel'].forEach((key) => {
    assert.ok(MACRO_SOURCE_META[key], `缺少来源定义：${key}`);
  });
});

test('字段级对照表覆盖九大模块与数据底座，且引用的来源均有效', () => {
  const groups = MACRO_FIELD_SOURCES.map((group) => group.group);
  MACRO_META.modules.forEach((module) => {
    const matched = groups.some((group) => group.startsWith(module.no));
    assert.ok(matched, `字段级对照表缺少模块分组：${module.no} ${module.nav}`);
  });
  const fields = MACRO_FIELD_SOURCES.flatMap((group) => group.items);
  fields.forEach((item) => {
    assert.ok(item.field, '存在空字段名');
    assert.ok(MACRO_SOURCE_META[item.source], `${item.field} 引用了未知来源：${item.source}`);
  });
  assert.ok(fields.length >= 45, `字段级对照条目过少：${fields.length}`);
  assert.ok(MACRO_SOURCE_SUMMARY.length >= 60, '来源总说明过短');
  // 弹窗不可出现与本页无关的旧口径（白色家电等）残留。
  assert.ok(!MACRO_SOURCE_SUMMARY.includes('白色家电'));
});

test('页面把来源徽章渲染到读数与结论上，并提供数据来源说明入口', () => {
  const page = read('features/macro/MacroPage.jsx');
  assert.ok(page.includes('<MacroSourceBadge'), '页面未使用来源徽章');
  assert.ok(page.includes('MacroSourceModal'), '页面缺少数据来源说明弹窗');
  assert.ok(page.includes('数据来源说明'), '工具栏缺少数据来源说明入口');
  // 关键承载判断的位置都要带上徽章。
  [
    'kpi.source',
    'SECTOR_VERDICT.source',
    'MACRO_VERDICT.source',
    'group.source',
    'item.source',
    'level.source',
    'route.source',
    'dim.source',
    'opp.source',
    'move.source',
    'tier.source',
    'metric.source',
    'factor.source',
    'scenario.source',
  ].forEach((token) => assert.ok(page.includes(token), `插桩缺失：${token}`));
  const modal = read('features/macro/MacroSourceBadge.jsx');
  assert.ok(modal.includes('macro-source-table'), '弹窗缺少字段级对照表');
});

test('页面实现九大模块、判断三段式、模块导航与跨模块联动', () => {
  const page = read('features/macro/MacroPage.jsx');
  MACRO_META.modules.forEach((module) => {
    assert.ok(page.includes(`id="${module.id}"`), `页面缺少模块：${module.id}`);
  });
  assert.ok(page.includes('<BasisStrip'), '页面未渲染判断依据三段式');
  assert.ok(page.includes('数据依据') && page.includes('判断逻辑') && page.includes('影响分析'));
  assert.ok(page.includes('macro-modnav'), '缺少模块导航');
  assert.ok(page.includes('onNavigate'), '页面未接入跨模块联动跳转');
  // 九大模块的看板标题必须逐字出现。
  [
    '行业总体判断',
    '行业生命周期判断',
    '市场需求趋势分析',
    '产业链景气分析',
    '技术路线判断',
    '竞争格局变化',
    '行业风险预警',
    '银行业务机会分析',
    'AI 行业分析助手',
  ].forEach((title) => assert.ok(page.includes(title), `缺少模块标题：${title}`));
});

test('「行业」（原宏观）归入「智能决策」分组并紧随「政策」之后，App 有渲染分支并透传联动回调', () => {
  const nav = read('features/app/navGroups.js');
  assert.ok(nav.includes("['macro', '行业']"), '缺少行业页签（宏观已更名为行业，tab id 不变）');
  // 行业与政策同属「智能决策」组，且紧随政策之后。
  const decisionBlock = nav.slice(
    nav.indexOf("label: '智能决策'"),
    nav.indexOf("label: '生态经营'"),
  );
  assert.ok(decisionBlock.includes("['macro', '行业']"), '行业页签未归入智能决策分组');
  assert.ok(
    nav.indexOf("['policy', '政策']") < nav.indexOf("['macro', '行业']"),
    '行业页签必须紧随政策之后',
  );
  assert.ok(
    nav.indexOf("['macro', '行业']") < nav.indexOf("['report', '周报']"),
    '行业页签应排在周报之前',
  );
  const app = read('App.jsx');
  assert.ok(app.includes("activeTab === 'macro'"), 'App 缺少宏观页渲染分支');
  assert.ok(app.includes("import MacroPage from './features/macro/MacroPage'"));
  assert.ok(
    app.includes('<MacroPage selectedIndustry={activeIndustry} onNavigate={handleTabChange} />'),
  );
});

test('产业链环节样本取自产业链地图数据文件，失败时回落到快照', () => {
  const hook = read('features/macro/useChainSamples.js');
  assert.ok(hook.includes('data/industries/storage-chain.json'), '未读取产业链地图数据');
  assert.ok(hook.includes('buildChainPositions'), '未复用环境节合并逻辑');
  assert.ok(hook.includes("'live'") && hook.includes("'snapshot'"), '缺少实时 / 快照两种状态');
  const page = read('features/macro/MacroPage.jsx');
  assert.ok(page.includes('useChainSamples'), '页面未使用环节样本取数');
  assert.ok(page.includes('CHAIN_STATUS_TEXT'), '页面未如实标注样本来源状态');
});
