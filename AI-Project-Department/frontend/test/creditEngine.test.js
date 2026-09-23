import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCreditOverview,
  evaluateCompany,
  formatYuan,
} from '../src/features/credit/creditEngine.js';

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

test('六维评分各自不超过维度上限，总分不超过 100', () => {
  const evaluation = evaluateCompany(baseCompany());
  assert.ok(evaluation);
  assert.equal(evaluation.dimensions.chain.max, 20);
  assert.equal(evaluation.dimensions.operation.max, 25);
  assert.equal(evaluation.dimensions.financial.max, 25);
  assert.equal(evaluation.dimensions.technology.max, 15);
  assert.equal(evaluation.dimensions.trade.max, 10);
  assert.equal(evaluation.dimensions.governance.max, 5);
  for (const dim of Object.values(evaluation.dimensions)) {
    assert.ok(dim.score >= 0 && dim.score <= dim.max, `${dim.score} within ${dim.max}`);
  }
  assert.ok(evaluation.total > 0 && evaluation.total <= 100);
});

test('高质量企业得分 90+ 且无红线时进入 S 级 / 第一层', () => {
  const evaluation = evaluateCompany(baseCompany());
  assert.ok(evaluation.total >= 90, `total=${evaluation.total}`);
  assert.equal(evaluation.grade, 'S');
  assert.equal(evaluation.tier, 1);
  assert.equal(evaluation.veto, false);
});

test('重大违约触发一票否决：高分也不允许进入第一层（规则4）', () => {
  const company = baseCompany({
    metrics: baseMetrics({ events: { majorDefault: true } }),
  });
  const evaluation = evaluateCompany(company);
  assert.ok(evaluation.total >= 80, `score should stay high, got ${evaluation.total}`);
  assert.equal(evaluation.veto, true);
  assert.equal(evaluation.tier, 3);
  assert.equal(evaluation.grade, 'C');
  assert.ok(evaluation.redlines.some((line) => line.class === 'A'));
});

test('B 类偿债红线限制进入第一层（规则：评分不是唯一依据）', () => {
  const company = baseCompany({
    metrics: baseMetrics({ events: { ocfPersistentDeterioration: true } }),
  });
  const evaluation = evaluateCompany(company);
  assert.ok(evaluation.tier >= 2, `tier=${evaluation.tier}`);
  assert.ok(evaluation.redlines.some((line) => line.class === 'B'));
});

test('高应收账款与 B 类红线口径一致：高分企业不得获得 S 级 / 第一层', () => {
  // 增速 0.5 > 0.4 且应收/营收 0.4 > 0.3 → 命中「大额应收账款异常增长」红线。
  const growthCase = baseCompany({
    metrics: baseMetrics({
      arGrowth: 0.5,
      accountsReceivable: 2.4e9,
      arSeries: [1.07e9, 1.6e9, 2.4e9],
    }),
  });
  const growthEval = evaluateCompany(growthCase);
  assert.ok(growthEval.redlines.some((line) => line.key === 'arAbnormalGrowth'));
  assert.ok(growthEval.riskTags.some((tag) => tag.key === 'highAr' && tag.level === 'risk'));
  assert.notEqual(growthEval.grade, 'S');
  assert.ok(growthEval.tier >= 2, `tier=${growthEval.tier}`);

  // 仅大额（应收/营收 0.52 > 0.45）但增速平缓 → 同样红线。
  const sizeCase = baseCompany({
    metrics: baseMetrics({ arGrowth: 0.05, accountsReceivable: 3.1e9 }),
  });
  const sizeEval = evaluateCompany(sizeCase);
  assert.ok(sizeEval.redlines.some((line) => line.key === 'arAbnormalGrowth'));
  assert.notEqual(sizeEval.grade, 'S');
});

test('利润增长但经营现金流恶化 → 自动生成风险标签（规则3）', () => {
  const company = baseCompany({
    metrics: baseMetrics({
      cashflowTrap: true,
      revenueGrowth: 0.3,
      operatingCashFlow: -5e7,
      ocfSeries: [1e7, -2e7, -5e7],
    }),
  });
  const evaluation = evaluateCompany(company);
  assert.ok(evaluation.riskTags.some((tag) => tag.key === 'cashflowTrap'));
  assert.ok(evaluation.riskTags.some((tag) => tag.label === '利润增长但现金流承压'));
});

test('经营现金流权重高于净利润（规则2）：现金流恶化比利润薄扣分更多', () => {
  const goodCashflow = evaluateCompany(baseCompany());
  const weakCashflow = evaluateCompany(
    baseCompany({ metrics: baseMetrics({ operatingCashFlow: -1e8, ocfSeries: [0, -5e7, -1e8] }) }),
  );
  const thinProfit = evaluateCompany(
    baseCompany({
      metrics: baseMetrics({
        netMargin: 0.011,
        netProfit: 2.2e7,
        netProfitSeries: [2e7, 2.1e7, 2.2e7],
      }),
    }),
  );
  const cashflowDrop =
    goodCashflow.dimensions.operation.score - weakCashflow.dimensions.operation.score;
  const profitDrop =
    goodCashflow.dimensions.operation.score - thinProfit.dimensions.operation.score;
  assert.ok(
    cashflowDrop > profitDrop,
    `cashflow drop ${cashflowDrop} should exceed profit drop ${profitDrop}`,
  );
});

test('建议授信额度不随评分线性换算（规则5）', () => {
  const strong = evaluateCompany(baseCompany());
  const weaker = evaluateCompany(
    baseCompany({
      metrics: baseMetrics({
        revenue: 1e9,
        netMargin: 0.05,
        netProfit: 5e7,
        operatingCashFlow: 4e7,
      }),
    }),
  );
  assert.ok(strong.creditLimit.amount > 0);
  assert.ok(weaker.creditLimit.amount > 0);
  const scoreRatio = strong.total / weaker.total;
  const limitRatio = strong.creditLimit.amount / weaker.creditLimit.amount;
  assert.ok(
    Math.abs(limitRatio - scoreRatio) > 0.05,
    `limit ratio ${limitRatio} vs score ratio ${scoreRatio}`,
  );
});

test('额度由基础额度乘多系数构成，且受营收与资产上限约束', () => {
  const evaluation = evaluateCompany(baseCompany());
  const coefs = evaluation.creditLimit.coefs;
  for (const key of ['credit', 'industry', 'cashflow', 'enhance', 'concentration']) {
    assert.ok(Number.isFinite(coefs[key]) && coefs[key] > 0, `coef ${key}`);
  }
  const metrics = baseMetrics();
  assert.ok(evaluation.creditLimit.amount <= metrics.revenue * 0.6 + 1);
});

test('经营现金流恶化的企业现金流系数被下调', () => {
  const strong = evaluateCompany(baseCompany());
  const weak = evaluateCompany(baseCompany({ metrics: baseMetrics({ operatingCashFlow: -1e8 }) }));
  assert.ok(weak.creditLimit.coefs.cashflow < strong.creditLimit.coefs.cashflow);
});

test('运营商企业携带项目指标并可能触发项目红线（规则8）', () => {
  const company = baseCompany({
    type: 'operator',
    typeLabel: '独立储能运营商',
    model: 'operator',
    metrics: baseMetrics({
      operatorExtra: {
        projectIrr: 0.05,
        dscr: 0.88,
        pricePolicyRisk: '高',
        batteryDecayRate: 0.03,
      },
      events: { projectCashflowFail: true },
    }),
  });
  const evaluation = evaluateCompany(company);
  assert.ok(evaluation.redlines.some((line) => line.class === 'D'));
  assert.ok(
    evaluation.strategy.focusRisks.some((risk) => risk.includes('IRR') || risk.includes('DSCR')),
  );
});

test('未评价企业不参与评价', () => {
  assert.equal(evaluateCompany(baseCompany({ evaluated: false, metrics: undefined })), null);
});

test('总览聚合：层级计数、评分分布、风险标签与额度合计一致', () => {
  const companies = [
    baseCompany({ id: 'a' }),
    baseCompany({ id: 'b', metrics: baseMetrics({ events: { majorDefault: true } }) }),
    baseCompany({ id: 'c', metrics: baseMetrics({ cashflowTrap: true, operatingCashFlow: -1e8 }) }),
    baseCompany({ id: 'd', evaluated: false, metrics: undefined }),
  ];
  const entries = companies.map((company) => ({ company, evaluation: evaluateCompany(company) }));
  const overview = buildCreditOverview(entries);
  assert.equal(overview.totalCompanies, 4);
  assert.equal(overview.evaluatedCount, 3);
  assert.equal(overview.pendingCount, 1);
  const tierSum = overview.tierCounts[1] + overview.tierCounts[2] + overview.tierCounts[3];
  assert.equal(tierSum, 3);
  const distSum = overview.scoreDist.reduce((sum, bucket) => sum + bucket.count, 0);
  assert.equal(distSum, 3);
  assert.equal(overview.vetoCount, 1);
  assert.ok(overview.totalLimit > 0);
  assert.ok(overview.riskTags.length > 0);
});

test('formatYuan 输出亿元 / 万元层级', () => {
  assert.equal(formatYuan(1.28e9), '12.8亿元');
  assert.equal(formatYuan(5e7), '5000万元');
  assert.equal(formatYuan(0), '—');
});
