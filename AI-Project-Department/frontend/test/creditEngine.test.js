import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCreditOverview,
  evaluateCompany,
  formatWan,
  formatYuan,
} from '../src/features/credit/creditEngine.js';
import {
  CREDIT_COMPOSITION,
  DIMENSION_KEYS,
  DIMENSION_WEIGHTS,
  VALUE_COMPOSITION,
} from '../src/features/credit/creditConfig.js';

function baseMetrics(overrides = {}) {
  return {
    quality: 0.8,
    revenue: 6e9,
    revenueSeries: [4.8e9, 5.4e9, 6e9],
    revenueGrowth: 0.11,
    grossMargin: 0.24,
    netMargin: 0.16,
    netProfit: 9.6e8,
    netProfitSeries: [7.5e8, 8.6e8, 9.6e8],
    ebitda: 1.6e9,
    interestExpense: 4.2e7,
    operatingCashFlow: 9e8,
    ocfSeries: [7.2e8, 8.1e8, 9e8],
    cashflowTrap: false,
    totalAssets: 9e9,
    totalLiabilities: 4.05e9,
    debtRatio: 0.45,
    interestBearingDebt: 1.4e9,
    shortTermDebt: 5e8,
    cash: 1.2e9,
    currentRatio: 1.8,
    quickRatio: 1.3,
    accountsReceivable: 9e8,
    arSeries: [7.2e8, 8.1e8, 9e8],
    arGrowth: 0.11,
    inventory: 6e8,
    inventorySeries: [5.2e8, 5.6e8, 6e8],
    inventoryGrowth: 0.07,
    guarantees: 0,
    capacityUtilization: 0.9,
    orders: 7e9,
    customerConcentration: 0.24,
    topCustomerQuality: 0.85,
    employees: 1200,
    foundedYear: 2005,
    registeredCapital: 8e8,
    capital: {
      rounds: 2,
      intentOnly: false,
      investorTier: '产业资本',
      investors: ['某储能产业基金'],
      evidence: '工商变更',
      stageMatch: '匹配',
      postPerformance: '改善',
      structureRisk: 0.15,
      structureNote: '无对赌与回购条款',
    },
    cluster: {
      name: '常州储能产业集群',
      inCluster: true,
      productionInCluster: true,
      realBusinessLinks: true,
      maturity: 4,
      keyPosition: 0.8,
      positionLabel: '集群内骨干企业',
      facilities: 4,
      policySupport: 4,
      homogeneityRisk: 0.2,
      contagionRisk: '低',
      dependencyNote: '配套完善，无单一核心企业依赖',
    },
    tech: {
      maturity: 4,
      barrier: 4,
      reliability: 4,
      certifications: 6,
      techIterRisk: '低',
      rdRatio: 0.05,
      patents: 120,
      techRoute: '锂离子 / 磷酸铁锂',
    },
    trade: {
      supplierStability: 4,
      downstreamQuality: 4,
      arAuthenticity: 4,
      orderAuthenticity: 4,
      chainDependence: 3,
    },
    governance: {
      controllerStability: 5,
      creditRecord: 4,
      litigationCount: 0,
      majorLitigation: false,
      externalGuarantee: false,
      relatedTxRisk: 1,
    },
    events: {},
    operatorExtra: null,
    cniExtra: null,
    keyCustomers: [],
    ...overrides,
  };
}

function baseCompany(overrides = {}) {
  return {
    id: 'es-test',
    name: '测试储能科技有限公司',
    stockShort: '测试储能',
    chain: '电池与核心部件',
    sector: '储能电池本体',
    segment: '中游',
    type: 'cell',
    typeLabel: '电芯企业',
    model: 'manufacturer',
    region: { province: '江苏省', city: '常州市' },
    listed: true,
    storageGrade: '核心主业',
    headTier: '龙头',
    products: '储能电芯',
    evaluated: true,
    metrics: baseMetrics(),
    ...overrides,
  };
}

const sumCounts = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);

// 按「缺失记 0 且占满分母」的旧口径复算总分，用于验证新口径没有把缺失项当 0。
function naiveTotal(evaluation) {
  const weights = evaluation.weightTemplate;
  const dims = evaluation.dimensions;
  const full = DIMENSION_KEYS.reduce((sum, key) => sum + weights[key], 0);
  const earned = DIMENSION_KEYS.reduce(
    (sum, key) => sum + weights[key] * (dims[key].score / dims[key].max),
    0,
  );
  return Math.round((earned / full) * 100);
}

// ---------------------------------------------------------------------------
// 规则配置层：三层架构的权重与指标占比必须自洽
// ---------------------------------------------------------------------------

test('五类企业权重各自合计 100 分，八个一级维度下二级指标占比各自合计 1', () => {
  for (const group of Object.keys(DIMENSION_WEIGHTS)) {
    const sum = DIMENSION_KEYS.reduce((total, key) => total + DIMENSION_WEIGHTS[group][key], 0);
    assert.equal(sum, 100, `${group} 类权重合计应为 100，实际 ${sum}`);
    for (const key of DIMENSION_KEYS) {
      assert.ok(DIMENSION_WEIGHTS[group][key] > 0, `${group}.${key} 权重应为正数`);
    }
  }
});

test('经营价值与信用适配的构成权重各自合计 1，且维度互不重叠', () => {
  const valueSum = VALUE_COMPOSITION.reduce((sum, part) => sum + part.weight, 0);
  const creditSum = CREDIT_COMPOSITION.reduce((sum, part) => sum + part.weight, 0);
  assert.equal(Math.round(valueSum * 100), 100);
  assert.equal(Math.round(creditSum * 100), 100);
  const valueKeys = VALUE_COMPOSITION.map((part) => part.key);
  const creditKeys = CREDIT_COMPOSITION.map((part) => part.key);
  assert.deepEqual(creditKeys, ['financial', 'trade', 'governance']);
  for (const key of creditKeys) {
    assert.ok(!valueKeys.includes(key), `${key} 不应同时进入两套评价，避免同一维度重复加总`);
  }
});

// ---------------------------------------------------------------------------
// 八维评分
// ---------------------------------------------------------------------------

test('八维评分各自不超过维度上限，总分不超过 100 且等于加权归一化结果', () => {
  const evaluation = evaluateCompany(baseCompany());
  assert.ok(evaluation);
  assert.equal(Object.keys(evaluation.dimensions).length, 8);
  assert.deepEqual(Object.keys(evaluation.dimensions), DIMENSION_KEYS);
  for (const dim of Object.values(evaluation.dimensions)) {
    assert.ok(
      dim.score >= 0 && dim.score <= dim.max,
      `${dim.key} ${dim.score} 应落在 [0, ${dim.max}]`,
    );
    assert.equal(dim.max, evaluation.weightTemplate[dim.key]);
  }
  assert.ok(evaluation.total > 0 && evaluation.total <= 100);
  assert.equal(evaluation.total, naiveTotal(evaluation));
});

test('高质量企业无红线时进入第一层', () => {
  const evaluation = evaluateCompany(baseCompany());
  assert.ok(evaluation.total >= 80, `total=${evaluation.total}`);
  assert.equal(evaluation.tier, 1);
  assert.equal(evaluation.veto, false);
  assert.ok(
    !['orange', 'red'].includes(evaluation.warningLevel),
    `无红线企业不应触发较高风险及以上预警，实际 ${evaluation.warningLevel}`,
  );
});

// ---------------------------------------------------------------------------
// 红线与预警：A 类需核实后一票否决，待核实信号不自动否决
// ---------------------------------------------------------------------------

test('A 类重大红线经核实后一票否决：高分企业也不得进入第一层', () => {
  const evaluation = evaluateCompany(
    baseCompany({ metrics: baseMetrics({ events: { majorDefault: true } }) }),
  );
  assert.ok(evaluation.total >= 80, `评分应保持高位，实际 ${evaluation.total}`);
  assert.equal(evaluation.veto, true);
  assert.equal(evaluation.tier, 3);
  assert.equal(evaluation.grade, 'C');
  const line = evaluation.redlines.find((item) => item.key === 'majorDefault');
  assert.ok(line, '应记录重大违约红线');
  assert.equal(line.class, 'A');
  assert.equal(line.status, 'verified');
  assert.equal(line.statusLabel, '已核实');
  assert.ok(line.evidence, '红线须带依据字段');
});

test('A 类待核实红线不得自动否决：仅降级并进入待核实清单', () => {
  const evaluation = evaluateCompany(
    baseCompany({ metrics: baseMetrics({ events: { majorDefaultPending: true } }) }),
  );
  assert.equal(evaluation.veto, false);
  assert.ok(evaluation.tier >= 2, `tier=${evaluation.tier}`);
  const line = evaluation.redlines.find((item) => item.key === 'majorDefault');
  assert.ok(line);
  assert.equal(line.status, 'pending');
  assert.equal(line.statusLabel, '待核实');
  assert.equal(evaluation.pendingRedlines.length, 1);
  assert.ok(
    evaluation.actions.escalations.some((item) => item.includes('核实') || item.includes('复核')),
    '待核实信号应进入升级审查清单',
  );
});

test('B 类风险预警限制进入第一层，但不在无 A 类红线时否决', () => {
  const evaluation = evaluateCompany(
    baseCompany({ metrics: baseMetrics({ events: { ocfPersistentDeterioration: true } }) }),
  );
  assert.equal(evaluation.veto, false);
  assert.ok(evaluation.tier >= 2, `tier=${evaluation.tier}`);
  assert.ok(evaluation.redlines.some((line) => line.class === 'B'));
});

test('发展阶段识别不豁免重大信用风险：研发早期企业命中 A 类红线同样否决', () => {
  const evaluation = evaluateCompany(
    baseCompany({
      metrics: baseMetrics({
        stage: 'early_rnd',
        revenue: 8e6,
        operatingCashFlow: -6e7,
        events: { majorDishonesty: true },
      }),
    }),
  );
  assert.equal(evaluation.stage, 'early_rnd');
  assert.equal(evaluation.group, 'C', '研发早期企业应按 C 类权重评价');
  assert.equal(evaluation.secondaryGroup, 'A', '原行业类型作为辅助类型保留');
  assert.equal(evaluation.veto, true);
  assert.equal(evaluation.tier, 3);
});

// ---------------------------------------------------------------------------
// 缺失指标与非适用指标
// ---------------------------------------------------------------------------

test('缺失指标不得默认 0：未评分维度从分母剔除、计入完整度并输出清单', () => {
  const complete = evaluateCompany(baseCompany());
  const evaluation = evaluateCompany(
    baseCompany({ metrics: baseMetrics({ capital: undefined, cluster: undefined }) }),
  );

  assert.equal(evaluation.dimensions.capital.scored, false);
  assert.equal(evaluation.dimensions.capital.coverage, 0);
  assert.equal(evaluation.dimensions.capital.missing.length, 6);
  assert.equal(evaluation.dimensions.cluster.scored, false);
  assert.equal(evaluation.coverage < complete.coverage, true);
  assert.equal(evaluation.missing.length, 13);

  const capitalMissing = evaluation.missing.filter((name) => name.startsWith('投融资经历'));
  assert.ok(capitalMissing.length === 6, '缺失清单须逐项列出指标名与所属维度');

  // 关键回归：若按「缺失＝0 分且仍占满分母」处理，总分会被拉到 79；新口径应从分母剔除。
  assert.ok(
    evaluation.total > naiveTotal(evaluation),
    `缺失不得按 0 计分，实际 ${evaluation.total} 应高于按 0 计分的 ${naiveTotal(evaluation)}`,
  );
});

test('非适用指标显式剔除：E 类不计在手订单，改动该指标不影响维度得分', () => {
  const operatorMetrics = (overrides = {}) =>
    baseMetrics({
      operatorExtra: { projectIrr: 0.09, dscr: 1.4, pricePolicyRisk: '低', batteryDecayRate: 0.02 },
      ...overrides,
    });
  const operator = (metrics) =>
    evaluateCompany(baseCompany({ type: 'operator', typeLabel: '独立储能运营商', metrics }));

  const withOrders = operator(operatorMetrics());
  const withoutOrders = operator(operatorMetrics({ orders: 0 }));

  assert.equal(withOrders.group, 'E');
  assert.deepEqual(withOrders.dimensions.operation.excluded, ['在手订单与合同']);
  assert.deepEqual(withOrders.dimensions.financial.excluded, ['存货质量']);
  assert.equal(withOrders.dimensions.operation.scored, true);
  assert.ok(withOrders.dimensions.operation.coverage < 1, '剔除后完整度应低于 100%');
  assert.ok(
    withOrders.excluded.some((name) => name.endsWith('在手订单与合同')),
    '剔除项须在总体清单中留痕，不得静默删除',
  );
  assert.equal(
    withOrders.dimensions.operation.score,
    withoutOrders.dimensions.operation.score,
    '不适用指标不得参与分母，因此改动它不应改变维度得分',
  );

  // 对照：A 类企业该指标适用，改动后得分必须变化。
  const aStrong = evaluateCompany(baseCompany());
  const aNoOrders = evaluateCompany(baseCompany({ metrics: baseMetrics({ orders: 0 }) }));
  assert.notEqual(
    aStrong.dimensions.operation.score,
    aNoOrders.dimensions.operation.score,
    'A 类企业在手订单适用，应有区分度',
  );
});

// ---------------------------------------------------------------------------
// 双结果输出与规则护栏
// ---------------------------------------------------------------------------

test('经营价值与信用适配独立输出，互不替代', () => {
  const evaluation = evaluateCompany(
    baseCompany({
      metrics: baseMetrics({
        debtRatio: 0.82,
        interestBearingDebt: 3.5e9,
        shortTermDebt: 2.5e9,
        cash: 1e7,
        currentRatio: 0.6,
        quickRatio: 0.4,
        operatingCashFlow: -4e8,
        ocfSeries: [2e8, -1e8, -4e8],
        ebitda: 2e8,
        interestExpense: 2.2e8,
        guarantees: 1e9,
        tech: {
          maturity: 5,
          barrier: 5,
          reliability: 5,
          certifications: 15,
          techIterRisk: '低',
          rdRatio: 0.12,
          patents: 300,
          techRoute: '钠离子',
        },
        capital: {
          rounds: 3,
          intentOnly: false,
          investorTier: '知名机构',
          investors: ['A 机构', 'B 产业资本'],
          evidence: '公告/验资',
          stageMatch: '匹配',
          postPerformance: '改善',
          structureRisk: 0.05,
          structureNote: '结构清晰',
        },
      }),
    }),
  );

  assert.deepEqual(
    evaluation.value.parts.map((part) => part.key),
    ['chain', 'cluster', 'technology', 'operation', 'capital'],
  );
  assert.deepEqual(
    evaluation.credit.parts.map((part) => part.key),
    ['financial', 'trade', 'governance'],
  );
  // 技术强、偿债弱：经营价值高，信用适配必须显著更低，不得互相拉平。
  assert.ok(
    evaluation.value.score > evaluation.credit.score,
    `value=${evaluation.value.score} 应高于 credit=${evaluation.credit.score}`,
  );
  assert.equal(evaluation.valueLevel.key, 'A');
  assert.ok(['review', 'hold'].includes(evaluation.creditLevel.key), evaluation.creditLevel.key);
  assert.ok(evaluation.credit.parts.every((part) => part.score != null));
});

test('研发/中试阶段现金流为负触发信用适配护栏，且不否定技术价值', () => {
  const guarded = evaluateCompany(
    baseCompany({
      metrics: baseMetrics({
        stage: 'early_rnd',
        operatingCashFlow: -8e7,
        ocfSeries: [1e7, -3e7, -8e7],
      }),
    }),
  );
  assert.ok(
    guarded.credit.rawScore > 55,
    `护栏触发前分数应高于 55，实际 ${guarded.credit.rawScore}`,
  );
  assert.equal(guarded.credit.score, 55);
  assert.equal(guarded.creditLevel.key, 'review');
  assert.equal(guarded.credit.guardrails.length, 1);
  assert.ok(
    guarded.actions.escalations.some((item) => item.includes('上限')),
    '护栏须进入升级审查清单',
  );
  assert.ok(guarded.value.score >= 80, '技术价值单独体现在经营价值评价中');

  // 现金流为正时护栏不得触发。
  const normal = evaluateCompany(baseCompany({ metrics: baseMetrics({ stage: 'early_rnd' }) }));
  assert.equal(normal.credit.score, normal.credit.rawScore);
  assert.equal(normal.credit.guardrails.length, 0);
});

test('财务维度完整度不足 70% 时补充复评提示，且缺失比率不冒充数值', () => {
  const evaluation = evaluateCompany(
    baseCompany({
      metrics: baseMetrics({
        totalAssets: undefined,
        totalLiabilities: undefined,
        debtRatio: undefined,
        interestBearingDebt: undefined,
        ebitda: undefined,
        interestExpense: undefined,
        inventory: undefined,
        guarantees: undefined,
      }),
    }),
  );
  assert.ok(
    evaluation.dimensions.financial.coverage < 0.7,
    `financial coverage=${evaluation.dimensions.financial.coverage}`,
  );
  assert.ok(
    evaluation.credit.guardrails.some((note) => note.includes('完整度不足')),
    '完整度不足须显式提示',
  );
  assert.equal(evaluation.ratios.debtRatio, null, '缺失的资产负债率应为 null 而非兜底值');
  assert.equal(evaluation.ratios.interestCoverage, null, '缺失的利息保障倍数应为 null');
  assert.equal(evaluation.ratios.invRatio, null, '缺失的存货占比应为 null');
  assert.ok(
    evaluation.dimensions.financial.missing.length >= 6,
    `财务维度缺失清单应逐项列出，实际 ${evaluation.dimensions.financial.missing.length} 项`,
  );
  // 缺失比率不得推导出风险标签（null 比较不会命中阈值）。
  assert.ok(!evaluation.riskTags.some((tag) => tag.key === 'shortDebt'));
});

// ---------------------------------------------------------------------------
// 参考额度、聚合与格式化
// ---------------------------------------------------------------------------

test('未评价企业不参与评价', () => {
  assert.equal(evaluateCompany(baseCompany({ evaluated: false, metrics: undefined })), null);
});

test('参考额度不随评分线性换算，且受营收规模约束', () => {
  const strong = evaluateCompany(baseCompany());
  const weaker = evaluateCompany(
    baseCompany({
      metrics: baseMetrics({
        revenue: 1e9,
        netMargin: 0.05,
        netProfit: 5e7,
        operatingCashFlow: 4e7,
        orders: 1.2e9,
      }),
    }),
  );
  assert.ok(strong.creditLimit.amount > 0);
  assert.ok(weaker.creditLimit.amount > 0);
  const scoreRatio = strong.total / weaker.total;
  const limitRatio = strong.creditLimit.amount / weaker.creditLimit.amount;
  assert.ok(
    Math.abs(limitRatio - scoreRatio) > 0.05,
    `额度比 ${limitRatio} 不应等于评分比 ${scoreRatio}`,
  );
  const coefs = strong.creditLimit.coefs;
  for (const key of ['credit', 'industry', 'cashflow', 'enhance', 'concentration']) {
    assert.ok(Number.isFinite(coefs[key]) && coefs[key] > 0, `系数 ${key} 应有效`);
  }
  assert.ok(strong.creditLimit.amount <= 6e9 * 0.6 + 1, '额度须受营收上限约束');
});

test('经营现金流恶化的企业现金流系数被下调', () => {
  const strong = evaluateCompany(baseCompany());
  const weak = evaluateCompany(
    baseCompany({ metrics: baseMetrics({ operatingCashFlow: -1e8, ocfSeries: [0, -5e7, -1e8] }) }),
  );
  assert.ok(weak.creditLimit.coefs.cashflow < strong.creditLimit.coefs.cashflow);
});

test('总览聚合：层级、双评价、类型组与阶段计数一致', () => {
  const companies = [
    baseCompany({ id: 'a' }),
    baseCompany({ id: 'b', metrics: baseMetrics({ events: { majorDefault: true } }) }),
    baseCompany({
      id: 'c',
      type: 'operator',
      typeLabel: '独立储能运营商',
      metrics: baseMetrics({
        operatingCashFlow: -1e8,
        ocfSeries: [0, -5e7, -1e8],
        operatorExtra: {
          projectIrr: 0.06,
          dscr: 1.05,
          pricePolicyRisk: '中',
          batteryDecayRate: 0.03,
        },
      }),
    }),
    baseCompany({ id: 'd', evaluated: false, metrics: undefined }),
  ];
  const entries = companies.map((company) => ({ company, evaluation: evaluateCompany(company) }));
  const overview = buildCreditOverview(entries);

  assert.equal(overview.totalCompanies, 4);
  assert.equal(overview.evaluatedCount, 3);
  assert.equal(overview.pendingCount, 1);
  assert.equal(overview.vetoCount, 1);

  const tierSum = overview.tierCounts[1] + overview.tierCounts[2] + overview.tierCounts[3];
  assert.equal(tierSum, 3);
  assert.equal(
    overview.scoreDist.reduce((sum, bucket) => sum + bucket.count, 0),
    3,
  );
  assert.equal(sumCounts(overview.valueCounts), 3, '经营价值分档计数应覆盖全部已评价企业');
  assert.equal(sumCounts(overview.creditCounts), 3, '信用适配分档计数应覆盖全部已评价企业');
  assert.equal(sumCounts(overview.groupCounts), 3, '五类企业计数应覆盖全部已评价企业');
  assert.equal(overview.groupCounts.E, 1, '运营商应归入 E 类');
  assert.equal(
    Object.values(overview.stageCounts).reduce((sum, count) => sum + count, 0),
    3,
  );
  assert.ok(overview.avgValue > 0 && overview.avgCredit > 0);
  assert.ok(overview.totalLimit > 0);
  assert.ok(overview.riskTags.length > 0);
});

test('formatYuan / formatWan 输出亿元与万元口径', () => {
  assert.equal(formatYuan(1.28e9), '12.8亿元');
  assert.equal(formatYuan(5e7), '5000万元');
  assert.equal(formatYuan(0), '—');
  assert.equal(formatWan(1.28e9), '12.8亿');
  assert.equal(formatWan(5e7), '5000万');
  assert.equal(formatWan(0), '—');
});
