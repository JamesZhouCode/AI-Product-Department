// 储能周报模型单测：
// 1) 派生统计口径正确（上市企业 / 环节 / 关系 / 客户池 / 梯队 / 板块 / 申万）；
// 2) 去重口径正确（企业可跨环节，companyCount 不能直接相加）；
// 3) 观察名单排序、词频清洗、三条拓客线索的数值可追溯；
// 4) 文案不出现其他行业的专属环节词（防止再次串味），且不含 undefined / NaN；
// 5) 结果可复现；源码层面确认储能数据只在储能分支加载。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  TIER_META,
  boardDistribution,
  buildStorageWeeklyModel,
  childNodeDistribution,
  customerPoolBreakdown,
  headGapNodes,
  pickFocusCompanies,
  productTokenFrequency,
  regionDistribution,
  relationCountByLevel,
  swSectorDistribution,
  tierTotals,
  uniqueCompanyCount,
} from '../src/features/report/storageWeeklyModel.js';
import { industryGroupFor } from '../src/chainPalette.js';

const chain = JSON.parse(
  readFileSync(new URL('../public/data/industries/storage-chain.json', import.meta.url), 'utf8'),
);
const model = buildStorageWeeklyModel(chain, '2026.10.12 — 2026.10.18');
const WEEK = '2026.10.12 — 2026.10.18';

// 与 storageWeeklyModel 的 isListedRow 同口径：companyType 优先，旧数据按股票代码。
function statsListed(companies) {
  return companies.filter((c) =>
    c.companyType ? c.companyType === 'listed' : Boolean(c.code || c.stockCode),
  ).length;
}

// 递归收集模型里的全部文案，用于「无 undefined / NaN / 串味」检查。
function collectStrings(value, bucket = []) {
  if (typeof value === 'string') bucket.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, bucket));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, bucket));
  }
  return bucket;
}

test('储能行业走专属分支，其他行业不走', () => {
  assert.equal(industryGroupFor('储能产业'), 'storage');
  assert.notEqual(industryGroupFor('集成电路'), 'storage');
});

test('模型对缺失或空数据返回 null，不抛异常', () => {
  assert.equal(buildStorageWeeklyModel(null), null);
  assert.equal(buildStorageWeeklyModel(undefined), null);
  assert.equal(buildStorageWeeklyModel({}), null);
  assert.equal(buildStorageWeeklyModel({ companies: [], levels: [] }), null);
  assert.equal(buildStorageWeeklyModel({ companies: chain.companies, levels: [] }), null);
});

test('顶部统计与链数据口径一致', () => {
  const stats = Object.fromEntries(model.masthead.stats.map((row) => [row.key, row.value]));
  // 全量入链后 companies 含非上市主体，上市口径按 companyType（旧数据按股票代码）判定
  const listedRows = chain.companies.filter((c) =>
    c.companyType ? c.companyType === 'listed' : Boolean(c.code || c.stockCode),
  );
  assert.equal(stats.listed, listedRows.length);
  assert.ok(stats.listed < chain.companies.length, '全量口径下上市数应小于在链总数');
  assert.equal(stats.level2, chain.stats.level2);
  assert.equal(stats.relations, chain.relations.length);
  // 非上市口径：在链非上市主体直接相减（不再回落客户池 other）。
  assert.equal(stats.pool, chain.companies.length - listedRows.length);
  assert.equal(stats.external, chain.stats.externalMentions);
  assert.ok(model.masthead.subtitle.includes(WEEK), '标题行必须带上周区间');
});

test('环节扫描覆盖全部一级环节，按企业数降序，且行内字段自洽', () => {
  const rows = model.scan.rows;
  assert.equal(rows.length, chain.levels.length);
  rows.forEach((row, index) => {
    assert.ok(row.label, '环节名不能为空');
    assert.ok(row.color, `${row.label} 缺少配色`);
    if (index > 0) {
      assert.ok(rows[index - 1].companyCount >= row.companyCount, '必须按企业数降序');
    }
    const tiers = row.leader + row.core + row.tail;
    assert.ok(
      row.companyRowCount >= row.companyCount,
      `${row.label} 环节归属行数(${row.companyRowCount}) 不应小于去重企业数(${row.companyCount})`,
    );
    assert.ok(
      tiers <= row.companyRowCount,
      `${row.label} 梯队三段之和(${tiers}) 不应超过环节归属行数(${row.companyRowCount})`,
    );
    assert.ok(tiers > 0, `${row.label} 应至少有一级梯队企业`);
    // 堆叠条按梯队合计归一（条长恒满），因此梯队合计必须可作分母。
    assert.ok(Number.isFinite(tiers) && tiers > 0, `${row.label} 梯队合计必须为正数`);
    assert.ok(row.relationCount >= 0 && row.relationCount <= chain.relations.length);
    assert.ok(row.childCount >= 1, `${row.label} 应至少含 1 个二级环节`);
  });
  const level2Sum = rows.reduce((sum, row) => sum + row.childCount, 0);
  assert.equal(level2Sum, chain.stats.level2, '各环节二级环节数之和应等于二级环节总数');
  const rowSum = rows.reduce((sum, row) => sum + row.companyRowCount, 0);
  assert.equal(rowSum, chain.stats.rows, '各环节归属行数之和应等于链数据的归属行总数');
});

test('关系统计按名称匹配，中游去重口径与产业链地图一致', () => {
  const counts = relationCountByLevel(chain.levels, chain.companies, chain.relations);
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  assert.ok(total >= chain.relations.length, '一条关系可能同时归属两端环节，故不小于关系总数');

  const midLabels = chain.levels
    .filter((level) => level.position === '中游')
    .map((level) => level.label);
  // 全量入链后 levels.companyCount 按主归属（level1[0]）统计，周报引用同一口径，
  // 避免与产业链地图 / 宏观页的「中游 976 家」打架。
  const naive = chain.levels
    .filter((level) => midLabels.includes(level.label))
    .reduce((sum, level) => sum + level.companyCount, 0);
  const unique = uniqueCompanyCount(chain.companies, midLabels);
  assert.equal(unique, naive, '去重口径应与产业链地图的主归属统计一致');
  assert.ok(model.readout.headline.includes(String(unique)), '研判结论应引用去重口径');
});

test('梯队汇总与环节梯队排序', () => {
  const tiers = tierTotals(chain.companies);
  assert.equal(tiers.leader + tiers.core + tiers.tail, chain.companies.length);
  assert.equal(tiers.leader, chain.stats.leader);
  assert.equal(tiers.core, chain.stats.core);
  assert.equal(tiers.tail, chain.stats.tail);

  const leaderText = model.readout.insights[1].title;
  assert.ok(leaderText.includes(`${tiers.leader} 家龙头`), '梯队洞察应写明龙头家数');
});

test('二级环节分布为 24 个且按企业数降序', () => {
  const nodes = childNodeDistribution(chain.levels);
  assert.equal(nodes.length, chain.stats.level2);
  nodes.forEach((node, index) => {
    assert.ok(node.level1, '二级环节必须带一级环节归属');
    if (index > 0) assert.ok(nodes[index - 1].count >= node.count);
  });
  assert.equal(model.signals.childNodes.length, 8, '信号面板只展示前 8 个二级环节');
  assert.equal(model.signals.childNodeTotal, chain.stats.level2);
});

test('板块与申万行业分布是上市企业口径', () => {
  const listedRows = chain.companies.filter((c) =>
    c.companyType ? c.companyType === 'listed' : Boolean(c.code || c.stockCode),
  );
  const boards = boardDistribution(listedRows);
  const boardSum = boards.reduce((sum, row) => sum + row.count, 0);
  assert.equal(boardSum, listedRows.filter((c) => c.board).length, '板块分布只统计有板块的行');
  assert.equal(boardSum, listedRows.length, '上市企业应都有板块归属');

  const sw = swSectorDistribution(listedRows);
  const swSum = sw.reduce((sum, row) => sum + row.count, 0);
  assert.ok(swSum > 0 && swSum <= listedRows.length, '申万行业覆盖部分上市企业（披露口径）');
  assert.equal(model.signals.swSectors.length, 6, '申万行业只展示前 6');
});

test('属地分布与地区前五', () => {
  const regions = regionDistribution(chain.companies, 5);
  assert.equal(regions.length, 5);
  assert.ok(
    regions.every((row) => /(省|市|自治区)$/.test(row.label)),
    `属地应是省级行政区：${regions.map((row) => row.label).join('、')}`,
  );
  assert.deepEqual(model.scan.regionTop, regions);
});

test('观察名单按画像完整度优先，字段完整', () => {
  const list = pickFocusCompanies(chain.companies, 5);
  assert.equal(list.length, 5);
  list.forEach((item, index) => {
    assert.ok(item.name && item.tierLabel && item.level1 && item.region);
    assert.notEqual(item.highlight, '待补充', `${item.name} 的产品 / 证据不应为空`);
    if (index > 0) {
      assert.ok(list[index - 1].completeness >= item.completeness, '按画像完整度降序');
    }
  });
  assert.equal(model.watch.length, 5);
  assert.equal(list[0].completeness, 4, '第一名画像完整度应为 4/4');
});

test('产品词频已清洗停用词并降序', () => {
  const tokens = productTokenFrequency(chain.companies, 10);
  const labels = tokens.map((token) => token.label);
  assert.ok(!labels.includes('业务'), '通用词「业务」应被过滤');
  assert.ok(!labels.includes('储能'), '通用词「储能」应被过滤');
  tokens.forEach((token, index) => {
    assert.ok(token.label.length >= 2);
    if (index > 0) assert.ok(tokens[index - 1].count >= token.count);
  });
  assert.deepEqual(model.signals.productTokens, tokens);
});

test('三条拓客线索的数值可追溯到链数据', () => {
  const moves = model.moves;
  assert.equal(moves.length, 3);

  const gaps = headGapNodes(chain);
  assert.equal(gaps.length, chain.warnings.nodesWithoutHeads.length);
  assert.ok(
    gaps.every((gap) => gap.level1 && gap.level2),
    '缺口节点应拆出一二级环节',
  );
  assert.ok(moves[0].title.includes(String(gaps.length)));

  const pool = customerPoolBreakdown(chain.customerStats);
  assert.ok(pool.verified > 0 && pool.pending > 0, '客户池应给出核验 / 缺码构成明细');
  assert.ok(
    moves[1].title.includes(String(chain.companies.length - statsListed(chain.companies))),
    '线索 2 应引用在链非上市主体数',
  );
  assert.ok(moves[1].note.includes('上市'), '说明里应交代上市口径另计');

  assert.ok(moves[2].title.includes(String(chain.stats.externalMentions)));
  assert.ok(moves[2].note.includes(String(chain.stats.externalDownstream)));
  assert.ok(moves[2].note.includes(String(chain.stats.externalUpstream)));
  // 同一家链外主体可能既当客户又当供应商（双角色点名），角色合计可大于去重总数。
  assert.ok(
    chain.stats.externalUpstream + chain.stats.externalDownstream >=
      chain.stats.externalMentions,
    '链外主体角色合计不应小于去重总数',
  );
  assert.ok(chain.stats.externalMentions > 0);
});

test('梯队元数据与数据分层一致', () => {
  assert.deepEqual(
    TIER_META.map((tier) => tier.key),
    ['leader', 'core', 'tail'],
  );
  const tierKeys = new Set(chain.companies.map((company) => company.tier));
  tierKeys.forEach((key) => {
    assert.ok(
      TIER_META.some((tier) => tier.key === key),
      `数据里的分层 ${key} 未在 TIER_META 中定义`,
    );
  });
});

test('全部文案不含 undefined / NaN，也不串入其他行业的专属环节词', () => {
  const strings = collectStrings(model);
  assert.ok(strings.length > 30, '模型应产出足量文案');
  const forbidden = ['undefined', 'NaN', 'Infinity', '[object'];
  strings.forEach((text) => {
    forbidden.forEach((token) => {
      assert.ok(!text.includes(token), `文案含非法值 ${token}：${text}`);
    });
  });
  // 「封测 / 晶圆 / CXO」是集成电路与生物医药的专属环节词，只检查模型**生成**的叙述文案。
  // watch 高亮与产品词频来自企业原始 products 字段——储能链上企业自身可能有
  // 晶圆级封装业务（如 SIP 先进封装），属于真实数据，不算串味。
  const crossIndustry = ['封测', '晶圆', 'CXO'];
  const generated = collectStrings({
    masthead: model.masthead,
    readout: model.readout,
    moves: model.moves,
    footer: model.footer,
    scanNotes: model.scan.rows.map((row) => row.note),
    scanRegion: model.scan.regionTop,
  });
  generated.forEach((text) => {
    crossIndustry.forEach((token) => {
      assert.ok(!text.includes(token), `文案串入其他行业词 ${token}：${text}`);
    });
  });
});

test('同输入同输出，结果可复现', () => {
  const again = buildStorageWeeklyModel(chain, WEEK);
  assert.deepEqual(again, model);
});

test('源码：链数据只在链驱动分支加载（储能 / 算力各一份），且通用分支不再写死集成电路文案', () => {
  const page = readFileSync(
    new URL('../src/features/report/WeeklyReportPage.jsx', import.meta.url),
    'utf8',
  );
  assert.ok(page.includes("industryGroupFor(selectedIndustry) === 'storage'"));
  assert.ok(page.includes('storage-chain.json'));
  assert.ok(page.includes('crossChainHint'), '通用分支应使用按行业生成的链路交叉提示');
  assert.ok(
    !page.includes('材料、装备、设计、制造、封测与配套'),
    '通用分支的链路交叉提示曾写死集成电路环节名，必须改为按行业环节动态生成',
  );

  // 链数据体积较大，必须是模块级缓存 + 仅在链驱动分支请求。
  assert.ok(page.includes('chainCache = new Map()'), '链数据应有模块级缓存');
  assert.ok(page.includes('isChainReport'), '页面应显式区分链驱动分支');
  assert.ok(page.includes('compute-chain.json'), '算力产业应读取自己的链数据');
});
