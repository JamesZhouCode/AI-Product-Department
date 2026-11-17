import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SEGMENT_FACTS, SEGMENT_FACT_KEYS } from '../src/features/analysis/analysisSegmentFacts.js';
import {
  ANALYSIS_SCHEMA_VERSION,
  buildAnalysisDataset,
} from '../src/features/analysis/analysisModel.js';

const chain = JSON.parse(
  readFileSync(new URL('../public/data/industries/storage-chain.json', import.meta.url), 'utf8'),
);
const credit = JSON.parse(
  readFileSync(new URL('../public/data/credit/storage-credit-mock.json', import.meta.url), 'utf8'),
);
const dataset = buildAnalysisDataset({ chain, credit, generatedAt: '2026-10-07' });
const segmentByKey = new Map(dataset.segments.map((segment) => [segment.key, segment]));

test('知识库覆盖储能产业链的全部 7 个一级环节与 24 个二级环节', () => {
  const chainKeys = chain.levels.flatMap((level) =>
    (level.children || []).map((child) => `${level.label}|${child.label}`),
  );
  assert.equal(chainKeys.length, 24);
  for (const key of chainKeys) assert.ok(SEGMENT_FACTS[key], `缺少知识库条目：${key}`);
  // 知识库为多行业共用：储能 24 条 + 算力 19 条（算力口径的覆盖情况见 computeIndustry 测试），
  // 另有 2 条新口径环节别名键（能量管理系统 EMS / 储能变流器 PCS）。
  assert.equal(SEGMENT_FACT_KEYS.length, 45);
});

test('分析数据集完整覆盖 7 × 8 报告维度，且每个二级环节都有完整报告', () => {
  assert.equal(dataset.schemaVersion, ANALYSIS_SCHEMA_VERSION);
  assert.equal(dataset.level1Count, 7);
  assert.equal(dataset.level2Count, 24);
  assert.equal(dataset.isMock, true);
  assert.match(dataset.mockNote, /演示数据/);
  for (const segment of dataset.segments) {
    assert.ok(segment.oneLiner.length > 20, `${segment.key} 缺少一句话结论`);
    assert.equal(segment.conclusions.length, 6, `${segment.key} 核心结论应为 6 条`);
    assert.ok(segment.highlights.length >= 3, `${segment.key} 发展亮点应不少于 3 条`);
    assert.equal(segment.trends.length, 5, `${segment.key} 趋势应为 5 条`);
    assert.ok(segment.riskTags.length >= 4, `${segment.key} 风险标签应不少于 4 条`);
    assert.ok(segment.regions.regions.length > 0, `${segment.key} 缺少区域数据`);
    assert.ok(segment.companies.list.length > 0, `${segment.key} 缺少主要企业`);
    for (const trend of segment.trends) {
      for (const field of [
        'judgement',
        'factors',
        'window',
        'beneficiary',
        'pressured',
        'credit',
      ]) {
        assert.ok(trend[field], `${segment.key} 趋势「${trend.title}」缺少 ${field}`);
      }
    }
    for (const highlight of segment.highlights) {
      for (const field of ['phenomenon', 'reason', 'industry', 'company', 'credit']) {
        assert.ok(highlight[field], `${segment.key} 亮点「${highlight.title}」缺少 ${field}`);
      }
    }
  }
});

test('市场规模序列与增速自洽，预测按 CAGR 递推', () => {
  for (const segment of dataset.segments) {
    const { years, china: series, chinaGrowth, forecast, forecastYears, cagr } = segment.market;
    assert.equal(years.length, series.length);
    assert.equal(years.length, chinaGrowth.length);
    for (let index = 1; index < series.length; index += 1) {
      const growth = series[index] / series[index - 1] - 1;
      assert.ok(
        Math.abs(growth * 100 - chinaGrowth[index]) < 0.6,
        `${segment.key} ${years[index]} 年规模与增速不一致`,
      );
    }
    assert.equal(series[series.length - 1], segment.market.chinaLatest);
    for (let index = 0; index < forecast.length; index += 1) {
      const expected = series[series.length - 1] * (1 + cagr / 100) ** (index + 1);
      assert.ok(
        Math.abs(forecast[index] - expected) / expected < 0.02,
        `${segment.key} 预测规模未按 CAGR 递推`,
      );
      assert.ok(forecastYears[index] > years[years.length - 1]);
    }
  }
});

test('产能、产量与供需判断口径一致', () => {
  for (const segment of dataset.segments) {
    const { nominal, utilization, output, demand, gap, effective } = segment.capacity;
    assert.equal(output, Math.round((nominal * utilization) / 100));
    assert.equal(gap, demand - output);
    assert.ok(effective <= nominal, `${segment.key} 有效产能不应大于名义产能`);
    assert.equal(segment.capacity.years.length, segment.capacity.utilizationSeries.length);
    assert.equal(segment.capacity.years.length, segment.capacity.nominalSeries.length);
    const currentIndex = segment.capacity.years.indexOf(segment.referenceYear);
    assert.equal(segment.capacity.nominalSeries[currentIndex], nominal);
    assert.equal(segment.capacity.utilizationSeries[currentIndex], utilization);
    if (segment.capacity.balance.includes('过剩')) {
      assert.ok(gap < 0, `${segment.key} 判断为产能过剩时供需缺口应为负`);
    }
  }
});

test('集中度口径单调：CR3 < CR5 < CR10 且不超过 100%', () => {
  for (const segment of dataset.segments) {
    const { cr3, cr5, cr10, cr5Series, list, crYears } = segment.companies;
    assert.ok(cr3 < cr5, `${segment.key} CR3 应小于 CR5`);
    assert.ok(cr5 < cr10, `${segment.key} CR5 应小于 CR10`);
    assert.ok(cr10 <= 100, `${segment.key} CR10 不应超过 100%`);
    assert.equal(crYears.length, cr5Series.length);
    for (let index = 1; index < cr5Series.length; index += 1) {
      assert.ok(cr5Series[index] > cr5Series[index - 1], `${segment.key} CR5 序列应递增`);
    }
    for (const row of list) {
      assert.ok(row.share > 0 && row.share < 100);
      assert.ok(row.revenue > 0 && row.capacity > 0);
    }
  }
});

test('企业口径来自入链表：名单均在源数据内，且分层排序优先核心主业与龙头', () => {
  const chainNames = new Set(chain.companies.map((company) => company.fullName || company.name));
  const gradeRank = { 核心主业: 3, 相关重要: 2, 边缘观察: 1 };
  const tierRank = { leader: 3, core: 2, tail: 1 };
  const chainByName = new Map(
    chain.companies.map((company) => [company.fullName || company.name, company]),
  );
  for (const segment of dataset.segments) {
    assert.ok(segment.companies.count > 0, `${segment.key} 应至少归属 1 家上市企业`);
    for (const row of segment.companies.list) {
      assert.ok(chainNames.has(row.name), `${segment.key} 企业 ${row.name} 不在入链表中`);
      const source = chainByName.get(row.name);
      assert.ok(
        (source.level1 || []).includes(segment.level1) &&
          (source.level2 || []).includes(segment.level2),
        `${segment.key} 企业 ${row.name} 的环节归属与源数据不一致`,
      );
    }
    if (segment.companies.list.length >= 2) {
      const first = chainByName.get(segment.companies.list[0].name);
      const second = chainByName.get(segment.companies.list[1].name);
      // 与模型的字典序排序同构：grade → tier → relationCount 逐级比较，
      // 不能加权求和（否则「核心龙头关系少」会被「相关档关系多」反超）。
      const key = (company) => [
        gradeRank[company.grade] || 0,
        tierRank[company.tier] || 0,
        company.relationCount || 0,
      ];
      const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      assert.ok(
        compare(key(first), key(second)) >= 0,
        `${segment.key} 主要企业排序未按客户清单分层优先`,
      );
    }
  }
});

test('授信章节落到业务策略：评级、切入点、四层客户策略、还款来源与退出条件齐备', () => {
  const ratings = new Set(['积极支持', '审慎支持', '谨慎支持', '严格准入']);
  for (const segment of dataset.segments) {
    const { credit: creditSection } = segment;
    assert.ok(ratings.has(creditSection.rating), `${segment.key} 授信评级不在约定集合内`);
    assert.ok(creditSection.entries.length >= 3, `${segment.key} 授信切入点过少`);
    assert.equal(creditSection.strategy.length, 4, `${segment.key} 客户策略应为四层`);
    assert.deepEqual(
      creditSection.strategy.map((item) => item.tier),
      ['战略核心客户', '重点支持客户', '条件支持客户', '严格准入客户'],
      `${segment.key} 客户分层顺序异常`,
    );
    assert.ok(creditSection.firstRepayment.includes('第一还款来源'));
    assert.ok(creditSection.coreRisks.length >= 4);
    assert.ok(creditSection.conditions.length >= 3);
  }
});

test('生成结果确定：同一输入两次构建完全一致', () => {
  const again = buildAnalysisDataset({ chain, credit, generatedAt: '2026-10-07' });
  assert.equal(JSON.stringify(again), JSON.stringify(dataset));
});

test('索引与环节切换：一级环节只挂载属于自己的二级环节', () => {
  assert.equal(dataset.index.length, 7);
  for (const level of dataset.index) {
    assert.ok(level.children.length >= 1, `${level.label} 应至少有一个二级环节`);
    for (const child of level.children) {
      assert.ok(child.key.startsWith(`${level.label}|`), `${child.key} 归属错误`);
      const segment = segmentByKey.get(child.key);
      assert.equal(segment.level1, level.label);
      assert.equal(segment.level2, child.label);
      assert.equal(segment.position, level.position);
      assert.ok(child.listedCount > 0);
      assert.ok(child.industryScore > 0 && child.creditFriendlyScore > 0);
    }
  }
});

test('报告标题全局唯一：重名二级环节自动补一级环节前缀', () => {
  const titles = new Set();
  let duplicated = 0;
  for (const segment of dataset.segments) {
    const title = segment.level2Display || segment.level2;
    assert.ok(!titles.has(title), `报告标题重复：${title}`);
    titles.add(title);
    if (title !== segment.level2) {
      duplicated += 1;
      assert.equal(title, `${segment.level1} · ${segment.level2}`);
    }
  }
  assert.equal(titles.size, 24);
  // 储能产业链中「检测认证与标准」同时归属两个一级环节，应被加前缀区分。
  assert.equal(duplicated, 2);
  for (const level of dataset.index) {
    for (const child of level.children) {
      assert.equal(child.displayLabel, segmentByKey.get(child.key).level2Display);
    }
  }
});

test('切片数据文件与模型输出一致（pnpm prepare:analysis 已同步）', () => {
  const file = JSON.parse(
    readFileSync(
      new URL('../public/data/analysis/storage-analysis-mock.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(file.schemaVersion, ANALYSIS_SCHEMA_VERSION);
  assert.equal(file.level2Count, 24);
  assert.deepEqual(
    file.segments.map((segment) => segment.key),
    dataset.segments.map((segment) => segment.key),
  );
  const fileByKey = new Map(file.segments.map((segment) => [segment.key, segment]));
  for (const segment of dataset.segments) {
    const stored = fileByKey.get(segment.key);
    assert.equal(stored.overview.marketSize, segment.overview.marketSize);
    assert.equal(stored.companies.cr3, segment.companies.cr3);
    assert.equal(stored.scores.industryScore, segment.scores.industryScore);
    assert.deepEqual(
      stored.companies.list.map((row) => row.short),
      segment.companies.list.map((row) => row.short),
    );
  }
});
