// 储能产业链智能授信评价引擎（纯函数，无副作用）。
// 输入：prepare-credit-mock 产出的企业记录（未来可无缝替换为真实指标 API）。
// 输出：六维评分 / 风险红线 / 内部评级 / 客户分层 / 风险标签 / 建议授信额度 / 授信策略。
// 业务规则：《储能产业链智能授信系统 AI 开发提示词》第三十节规则 1-10。

import {
  GRADE_RULES,
  REDLINE_DEFS,
  STRATEGY_BY_TIER,
  STRATEGY_BY_TYPE,
  SUB_WEIGHTS,
  TIER_META,
  TYPE_PROFILE,
  WARNING_LEVELS,
} from './creditConfig.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(value * 10) / 10;

export const formatYuan = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}亿元`;
  if (value >= 1e4) return `${Math.round(value / 1e4)}万元`;
  return `${Math.round(value)}元`;
};

export const formatWan = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  return `${Math.round(value / 1e4)}万`;
};

function scoreChain(company, metrics) {
  const profile = TYPE_PROFILE[company.type] || TYPE_PROFILE.service;
  const tech = metrics.tech || {};
  const headTier = company.headTier;
  const importance = clamp(
    (profile.importance || 3) + (headTier === '龙头' ? 1 : headTier === '骨干' ? 0.5 : 0),
    1,
    5,
  );
  const items = {
    importance: (importance / 5) * SUB_WEIGHTS.chain.importance,
    demand: ((profile.demand || 3) / 5) * SUB_WEIGHTS.chain.demand,
    competition: ((profile.competition || 3) / 5) * SUB_WEIGHTS.chain.competition,
    stickiness:
      ((clamp(metrics.topCustomerQuality ?? 0.4, 0, 1) * 5) / 5) * SUB_WEIGHTS.chain.stickiness,
    barrier: ((tech.barrier || 3) / 5) * SUB_WEIGHTS.chain.barrier,
    policy: ((profile.policy || 3) / 5) * SUB_WEIGHTS.chain.policy,
  };
  const detail = {
    importance,
    demand: profile.demand || 3,
    competition: profile.competition || 3,
    stickiness: clamp(metrics.topCustomerQuality ?? 0.4, 0, 1) * 5,
    barrier: tech.barrier || 3,
    policy: profile.policy || 3,
  };
  const score = Object.values(items).reduce((sum, value) => sum + value, 0);
  return { score, items, detail };
}

function scoreOperation(company, metrics) {
  const revenue = Math.max(metrics.revenue || 0, 1);
  const ocfMargin = (metrics.operatingCashFlow || 0) / revenue;
  const orderRatio = (metrics.orders || 0) / revenue;
  const concentration = metrics.customerConcentration ?? 0.5;
  const utilization = metrics.capacityUtilization ?? 0.6;
  const revenueScale =
    revenue >= 5e9
      ? 3
      : revenue >= 1e9
        ? 2.4
        : revenue >= 3e8
          ? 1.8
          : revenue >= 1e8
            ? 1.2
            : revenue >= 3e7
              ? 0.7
              : 0.3;
  const netMargin = metrics.netMargin ?? 0;
  const profitability =
    netMargin > 0.15
      ? 4
      : netMargin > 0.08
        ? 3.2
        : netMargin > 0.04
          ? 2.4
          : netMargin > 0.01
            ? 1.6
            : netMargin > -0.02
              ? 0.8
              : 0.2;
  let cashflow =
    ocfMargin > 0.12
      ? 5
      : ocfMargin > 0.07
        ? 4
        : ocfMargin > 0.03
          ? 3
          : ocfMargin > 0
            ? 2
            : ocfMargin > -0.05
              ? 1
              : 0;
  if (metrics.cashflowTrap) cashflow = Math.min(cashflow, 1.5);
  const customerQuality =
    (metrics.topCustomerQuality ?? 0) >= 0.8
      ? 4
      : metrics.topCustomerQuality >= 0.6
        ? 3
        : metrics.topCustomerQuality >= 0.4
          ? 2
          : metrics.topCustomerQuality >= 0.2
            ? 1
            : 0.5;
  const concentrationScore =
    concentration <= 0.25 ? 3 : concentration <= 0.4 ? 2.2 : concentration <= 0.55 ? 1.2 : 0.4;
  const orders = orderRatio >= 1 ? 3 : orderRatio >= 0.6 ? 2.4 : orderRatio >= 0.3 ? 1.6 : 0.8;
  const utilizationScore =
    utilization >= 0.85
      ? 3
      : utilization >= 0.7
        ? 2.4
        : utilization >= 0.55
          ? 1.6
          : utilization >= 0.4
            ? 0.8
            : 0.2;
  const items = {
    revenueScale,
    profitability,
    cashflow,
    customerQuality,
    concentration: concentrationScore,
    orders,
    utilization: utilizationScore,
  };
  const score = Object.values(items).reduce((sum, value) => sum + value, 0);
  return { score, items };
}

function scoreFinancial(company, metrics) {
  const liabilities = Math.max(metrics.totalLiabilities || 1, 1);
  const revenue = Math.max(metrics.revenue || 1, 1);
  const assets = Math.max(metrics.totalAssets || 1, 1);
  const debtRatio = metrics.debtRatio ?? 0.6;
  const interestDebtRatio = (metrics.interestBearingDebt || 0) / liabilities;
  const interestCoverage =
    metrics.interestExpense > 0 ? (metrics.ebitda || 0) / metrics.interestExpense : 3;
  const ocfDebtCoverage =
    metrics.interestBearingDebt > 0
      ? (metrics.operatingCashFlow || 0) / metrics.interestBearingDebt
      : 0;
  const currentRatio = metrics.currentRatio ?? 1;
  const quickRatio = metrics.quickRatio ?? 0.7;
  const arRatio = (metrics.accountsReceivable || 0) / revenue;
  const invRatio = (metrics.inventory || 0) / revenue;
  const shortDebtCoverage =
    (metrics.shortTermDebt || 0) /
    Math.max((metrics.cash || 0) + Math.max(metrics.operatingCashFlow || 0, 0), 1);
  const guaranteeRatio = (metrics.guarantees || 0) / assets;
  const items = {
    debtRatio:
      debtRatio <= 0.4
        ? 3
        : debtRatio <= 0.55
          ? 2.4
          : debtRatio <= 0.65
            ? 1.6
            : debtRatio <= 0.75
              ? 0.8
              : 0.2,
    interestDebtRatio:
      interestDebtRatio <= 0.35
        ? 3
        : interestDebtRatio <= 0.5
          ? 2.2
          : interestDebtRatio <= 0.65
            ? 1.2
            : 0.4,
    interestCoverage:
      interestCoverage >= 8
        ? 3
        : interestCoverage >= 5
          ? 2.4
          : interestCoverage >= 3
            ? 1.6
            : interestCoverage >= 1.5
              ? 0.8
              : 0.2,
    ocfDebtCoverage:
      ocfDebtCoverage >= 0.3
        ? 4
        : ocfDebtCoverage >= 0.15
          ? 3.2
          : ocfDebtCoverage >= 0.05
            ? 2
            : ocfDebtCoverage >= 0
              ? 1
              : 0.2,
    liquidity:
      currentRatio >= 1.8 && quickRatio >= 1
        ? 2
        : currentRatio >= 1.2 && quickRatio >= 0.8
          ? 1.4
          : currentRatio >= 1
            ? 0.8
            : 0.2,
    arQuality: arRatio <= 0.2 ? 3 : arRatio <= 0.35 ? 2.2 : arRatio <= 0.5 ? 1.2 : 0.4,
    inventoryQuality: invRatio <= 0.1 ? 3 : invRatio <= 0.2 ? 2.2 : invRatio <= 0.32 ? 1.2 : 0.4,
    shortDebtPressure:
      shortDebtCoverage <= 0.8
        ? 2
        : shortDebtCoverage <= 1.5
          ? 1.4
          : shortDebtCoverage <= 2.5
            ? 0.7
            : 0.2,
    guarantees:
      guaranteeRatio <= 0 ? 2 : guaranteeRatio <= 0.05 ? 1.4 : guaranteeRatio <= 0.12 ? 0.6 : 0.2,
  };
  const score = Object.values(items).reduce((sum, value) => sum + value, 0);
  const ratios = {
    debtRatio,
    interestDebtRatio,
    interestCoverage,
    ocfDebtCoverage,
    currentRatio,
    quickRatio,
    arRatio,
    invRatio,
    shortDebtCoverage,
    guaranteeRatio,
  };
  return { score, items, ratios };
}

function scoreTechnology(company, metrics) {
  const tech = metrics.tech || {};
  const maturity = tech.maturity ?? 3;
  const barrier = tech.barrier ?? 3;
  const reliability = tech.reliability ?? 3;
  const certifications = tech.certifications ?? 0;
  const rdRatio = tech.rdRatio ?? 0.02;
  const items = {
    maturity: (maturity / 5) * SUB_WEIGHTS.technology.maturity,
    barrier: (barrier / 5) * SUB_WEIGHTS.technology.barrier,
    certification:
      certifications >= 6 ? 2 : certifications >= 3 ? 1.4 : certifications >= 1 ? 0.8 : 0.2,
    reliability: (reliability / 5) * SUB_WEIGHTS.technology.reliability,
    iterationRisk: tech.techIterRisk === '低' ? 3 : tech.techIterRisk === '中' ? 1.8 : 0.6,
    research:
      rdRatio >= 0.08
        ? 2
        : rdRatio >= 0.05
          ? 1.6
          : rdRatio >= 0.03
            ? 1.2
            : rdRatio >= 0.015
              ? 0.8
              : 0.4,
  };
  const score = Object.values(items).reduce((sum, value) => sum + value, 0);
  return { score, items };
}

function scoreTrade(company, metrics) {
  const trade = metrics.trade || {};
  const items = {
    supplierStability: ((trade.supplierStability ?? 3) / 5) * SUB_WEIGHTS.trade.supplierStability,
    downstreamQuality: ((trade.downstreamQuality ?? 3) / 5) * SUB_WEIGHTS.trade.downstreamQuality,
    arAuthenticity: ((trade.arAuthenticity ?? 4) / 5) * SUB_WEIGHTS.trade.arAuthenticity,
    orderAuthenticity: ((trade.orderAuthenticity ?? 4) / 5) * SUB_WEIGHTS.trade.orderAuthenticity,
    chainDependence: ((trade.chainDependence ?? 3) / 5) * SUB_WEIGHTS.trade.chainDependence,
  };
  const score = Object.values(items).reduce((sum, value) => sum + value, 0);
  return { score, items };
}

function scoreGovernance(company, metrics) {
  const governance = metrics.governance || {};
  const litigationCount = governance.litigationCount ?? 0;
  const guaranteeRatio =
    metrics.totalAssets > 0 ? (metrics.guarantees || 0) / metrics.totalAssets : 0;
  const items = {
    controller: ((governance.controllerStability ?? 4) / 5) * SUB_WEIGHTS.governance.controller,
    creditRecord: ((governance.creditRecord ?? 4) / 5) * SUB_WEIGHTS.governance.creditRecord,
    litigation: governance.majorLitigation
      ? 0
      : litigationCount === 0
        ? 1
        : litigationCount === 1
          ? 0.6
          : 0.3,
    externalGuarantee: !governance.externalGuarantee ? 1 : guaranteeRatio <= 0.05 ? 0.6 : 0.2,
    relatedTransaction:
      (governance.relatedTxRisk ?? 2) <= 2 ? 1 : governance.relatedTxRisk === 3 ? 0.6 : 0.2,
  };
  const score = Object.values(items).reduce((sum, value) => sum + value, 0);
  return { score, items };
}

function collectRedlines(metrics) {
  const events = metrics.events || {};
  const redlines = [];
  const seen = new Set();
  for (const [cls, def] of Object.entries(REDLINE_DEFS)) {
    for (const [key, label] of Object.entries(def.items)) {
      if (events[key]) {
        redlines.push({ class: cls, classLabel: def.label, key, label });
        seen.add(key);
      }
    }
  }
  // 指标推导：大额应收账款 / 应收异常增长视同 B 类红线，与「高应收账款」
  // 风险标签口径完全一致——只要打上该标签，就不允许凭高分进入第一层。
  const arRatio = (metrics.accountsReceivable || 0) / Math.max(metrics.revenue || 1, 1);
  const arAbnormal = ((metrics.arGrowth ?? 0) > 0.4 && arRatio > 0.3) || arRatio > 0.45;
  if (arAbnormal && !seen.has('arAbnormalGrowth')) {
    redlines.push({
      class: 'B',
      classLabel: REDLINE_DEFS.B.label,
      key: 'arAbnormalGrowth',
      label: REDLINE_DEFS.B.items.arAbnormalGrowth,
    });
  }
  return redlines;
}

function gradeForScore(total) {
  return GRADE_RULES.find((rule) => total >= rule.min) || GRADE_RULES[GRADE_RULES.length - 1];
}

const GRADE_RANK = { S: 4, A: 3, B: 2, 'C+': 1, C: 0 };

function downgradeGrade(grade, targetRank) {
  const order = ['C', 'C+', 'B', 'A', 'S'];
  return order[Math.min(targetRank, GRADE_RANK[grade] ?? 0)] || 'C';
}

function buildRiskTags(company, metrics, ratios, ocfMargin) {
  const tags = [];
  const push = (level, key, label) => tags.push({ level, key, label });

  if (company.headTier === '龙头' && (TYPE_PROFILE[company.type]?.importance ?? 0) >= 4)
    push('positive', 'chainCore', '产业链核心');
  if ((metrics.topCustomerQuality ?? 0) >= 0.75)
    push('positive', 'customerQuality', '客户质量较高');
  if (ratios.ocfDebtCoverage >= 0.3) push('positive', 'cashflowCover', '现金流覆盖充足');
  else if (ocfMargin > 0.05 && !metrics.cashflowTrap)
    push('positive', 'cashflowStable', '经营现金流稳定');
  if (metrics.cashflowTrap) push('risk', 'cashflowTrap', '利润增长但现金流承压');
  if ((metrics.customerConcentration ?? 0) > 0.45)
    push('warn', 'customerConcentration', '客户集中度偏高');
  // 口径与 B 类红线「大额应收账款异常增长」一致：命中即 risk 级（对应一票否决）。
  if (((metrics.arGrowth ?? 0) > 0.4 && ratios.arRatio > 0.3) || ratios.arRatio > 0.45)
    push('risk', 'highAr', '高应收账款');
  if ((metrics.inventoryGrowth ?? 0) > 0.35 && ratios.invRatio > 0.22)
    push('warn', 'highInventory', '存货积压');
  if (ratios.shortDebtCoverage > 1.8) push('risk', 'shortDebt', '短债压力高');
  if ((metrics.debtRatio ?? 0) > 0.7) push('warn', 'highLeverage', '高杠杆');
  if ((metrics.capacityUtilization ?? 1) < 0.5) push('warn', 'lowUtilization', '产能利用率低');
  if (metrics.tech?.techIterRisk === '高') push('warn', 'techIteration', '技术迭代风险');
  if (ratios.guaranteeRatio > 0.1) push('warn', 'guarantee', '对外担保风险');
  if (metrics.operatorExtra) {
    if ((metrics.operatorExtra.dscr ?? 2) < 1.05) push('risk', 'projectCashflow', '项目现金流风险');
    if (metrics.operatorExtra.pricePolicyRisk === '高') push('warn', 'pricePolicy', '电价政策风险');
  }
  if ((TYPE_PROFILE[company.type]?.competition ?? 3) <= 2) push('warn', 'priceWar', '行业价格竞争');
  if ((metrics.governance?.litigationCount ?? 0) >= 2 || metrics.governance?.majorLitigation)
    push('risk', 'litigation', '涉诉风险');
  return tags;
}

function warningLevelFor(tags, redlines, total) {
  const riskCount = tags.filter((tag) => tag.level === 'risk').length;
  const warnCount = tags.filter((tag) => tag.level === 'warn').length;
  const aCount = redlines.filter((line) => line.class === 'A').length;
  const bCount = redlines.filter((line) => line.class === 'B').length;
  if (aCount > 0 || riskCount >= 2) return 'red';
  if (riskCount >= 1 || bCount >= 2 || total < 55) return 'orange';
  if (bCount >= 1 || warnCount >= 2) return 'yellow';
  if (warnCount >= 1 || total < 70) return 'blue';
  return 'normal';
}

function buildCreditLimit(company, metrics, grade, ratios) {
  const profile = TYPE_PROFILE[company.type] || TYPE_PROFILE.service;
  const revenue = Math.max(metrics.revenue || 0, 1);
  const orderRatio = clamp((metrics.orders || 0) / revenue, 0.5, 1.4);
  const base = revenue * ((profile.baseMultiple[0] + profile.baseMultiple[1]) / 2) * orderRatio;
  const creditCoef = { S: 1.1, A: 1.0, B: 0.72, 'C+': 0.5, C: 0.3 }[grade] ?? 0.5;
  const industryCoef = profile.industryCoef ?? 0.9;
  const cashflowCoef =
    ratios.ocfDebtCoverage >= 0.3
      ? 1.05
      : ratios.ocfDebtCoverage >= 0.15
        ? 1.0
        : ratios.ocfDebtCoverage >= 0.05
          ? 0.85
          : ratios.ocfDebtCoverage >= 0
            ? 0.65
            : 0.45;
  let enhanceCoef = company.listed ? 1.05 : 1.0;
  if (ratios.guaranteeRatio > 0.1) enhanceCoef *= 0.92;
  if ((metrics.governance?.creditRecord ?? 4) <= 3) enhanceCoef *= 0.9;
  enhanceCoef = clamp(enhanceCoef, 0.8, 1.1);
  const concentrationCoef =
    (metrics.customerConcentration ?? 0.5) <= 0.3
      ? 1.0
      : (metrics.customerConcentration ?? 0.5) <= 0.5
        ? 0.92
        : 0.8;

  let amount = base * creditCoef * industryCoef * cashflowCoef * enhanceCoef * concentrationCoef;
  amount = Math.min(amount, revenue * 0.6, (metrics.totalAssets || 0) * 0.5);
  if (grade === 'C') amount = Math.min(amount, 5e7);
  if (amount >= 1e8) amount = Math.round(amount / 1e7) * 1e7;
  else amount = Math.round(amount / 1e6) * 1e6;
  return {
    amount: Math.max(amount, 0),
    base: Math.round(base),
    coefs: {
      credit: creditCoef,
      industry: industryCoef,
      cashflow: cashflowCoef,
      enhance: Number(enhanceCoef.toFixed(2)),
      concentration: concentrationCoef,
    },
  };
}

export function evaluateCompany(company) {
  const metrics = company.metrics;
  if (!metrics) return null;

  const chain = scoreChain(company, metrics);
  const operation = scoreOperation(company, metrics);
  const financial = scoreFinancial(company, metrics);
  const technology = scoreTechnology(company, metrics);
  const trade = scoreTrade(company, metrics);
  const governance = scoreGovernance(company, metrics);

  const revenue = Math.max(metrics.revenue || 1, 1);
  const ocfMargin = (metrics.operatingCashFlow || 0) / revenue;
  const dimensions = {
    chain: { score: round1(chain.score), max: 20, items: chain.items },
    operation: { score: round1(operation.score), max: 25, items: operation.items },
    financial: { score: round1(financial.score), max: 25, items: financial.items },
    technology: { score: round1(technology.score), max: 15, items: technology.items },
    trade: { score: round1(trade.score), max: 10, items: trade.items },
    governance: { score: round1(governance.score), max: 5, items: governance.items },
  };
  const total = Math.round(Object.values(dimensions).reduce((sum, dim) => sum + dim.score, 0));

  const redlines = collectRedlines(metrics);
  const initial = gradeForScore(total);
  let grade = initial.grade;
  let tier = initial.tier;
  let veto = false;
  let vetoNote = '';

  const aCount = redlines.filter((line) => line.class === 'A').length;
  const bCount = redlines.filter((line) => line.class === 'B').length;
  const cCount = redlines.filter((line) => line.class === 'C').length;
  const dCount = redlines.filter((line) => line.class === 'D').length;

  // 规则4：重大信用风险一票否决，任何高分不允许凭分数进入第一层。
  if (aCount > 0) {
    veto = true;
    vetoNote = redlines
      .filter((line) => line.class === 'A')
      .map((line) => line.label)
      .join('、');
    tier = 3;
    grade = 'C';
  } else {
    if (bCount >= 2 || cCount >= 2 || dCount >= 2) tier = 3;
    else if (bCount >= 1 || cCount >= 1 || dCount >= 1) tier = Math.max(tier, 2);
    if (total < 60) tier = 3;
    if (tier === 3) grade = downgradeGrade(initial.grade, 0);
    else if (tier === 2) grade = downgradeGrade(initial.grade, 2);
  }

  const gradeMeta = GRADE_RULES.find((rule) => rule.grade === grade) || gradeForScore(total);
  const tierMeta = TIER_META[tier];
  const riskTags = buildRiskTags(company, metrics, financial.ratios, ocfMargin);
  const warningLevel = warningLevelFor(riskTags, redlines, total);
  const creditLimit = buildCreditLimit(company, metrics, grade, financial.ratios);
  const strategyType = STRATEGY_BY_TYPE[company.type] || STRATEGY_BY_TYPE.service;

  return {
    companyId: company.id,
    dimensions,
    total,
    grade,
    gradeLabel: gradeMeta.gradeLabel,
    tier,
    tierLabel: `${tierMeta.label} · ${tierMeta.name}`,
    veto,
    vetoNote,
    redlines,
    riskTags,
    warningLevel,
    warningLabel: WARNING_LEVELS[warningLevel].label,
    creditLimit,
    ratios: financial.ratios,
    strategy: {
      typeStrategy: strategyType,
      tierStrategy: tierMeta.strategy,
      products: strategyType.products,
      focusRisks: strategyType.risks,
      conditions: STRATEGY_BY_TIER[tier].conditions,
    },
  };
}

export function buildCreditOverview(entries) {
  // entries: [{ company, evaluation }]
  const evaluated = entries.filter((entry) => entry.evaluation);
  const tierCounts = { 1: 0, 2: 0, 3: 0 };
  const gradeCounts = { S: 0, A: 0, B: 0, 'C+': 0, C: 0 };
  const chains = new Map();
  const scoreDist = [
    { key: '90-100', label: '90-100分', min: 90, max: 101, count: 0 },
    { key: '80-89', label: '80-89分', min: 80, max: 90, count: 0 },
    { key: '70-79', label: '70-79分', min: 70, max: 80, count: 0 },
    { key: '60-69', label: '60-69分', min: 60, max: 70, count: 0 },
    { key: '0-59', label: '60分以下', min: 0, max: 60, count: 0 },
  ];
  const riskTagMap = new Map();
  const warningCounts = { normal: 0, blue: 0, yellow: 0, orange: 0, red: 0 };
  const regionMap = new Map();
  let totalLimit = 0;
  let scoreSum = 0;
  let vetoCount = 0;

  for (const { company, evaluation } of evaluated) {
    tierCounts[evaluation.tier] += 1;
    gradeCounts[evaluation.grade] += 1;
    scoreSum += evaluation.total;
    totalLimit += evaluation.creditLimit.amount;
    if (evaluation.veto) vetoCount += 1;
    warningCounts[evaluation.warningLevel] += 1;

    const chainKey = company.chain || '待研判';
    if (!chains.has(chainKey)) {
      chains.set(chainKey, { chain: chainKey, tiers: { 1: 0, 2: 0, 3: 0 }, limit: 0, total: 0 });
    }
    const chainBucket = chains.get(chainKey);
    chainBucket.tiers[evaluation.tier] += 1;
    chainBucket.limit += evaluation.creditLimit.amount;
    chainBucket.total += 1;

    const bucket = scoreDist.find(
      (item) => evaluation.total >= item.min && evaluation.total < item.max,
    );
    if (bucket) bucket.count += 1;

    for (const tag of evaluation.riskTags) {
      if (tag.level === 'positive') continue;
      if (!riskTagMap.has(tag.key))
        riskTagMap.set(tag.key, { key: tag.key, label: tag.label, count: 0 });
      riskTagMap.get(tag.key).count += 1;
    }

    const province = company.region?.province || '未知';
    regionMap.set(province, (regionMap.get(province) || 0) + 1);
  }

  return {
    totalCompanies: entries.length,
    evaluatedCount: evaluated.length,
    pendingCount: entries.length - evaluated.length,
    tierCounts,
    gradeCounts,
    vetoCount,
    avgScore: evaluated.length ? Math.round(scoreSum / evaluated.length) : 0,
    totalLimit,
    warningCounts,
    chains: Array.from(chains.values()),
    scoreDist,
    riskTags: Array.from(riskTagMap.values()).sort((a, b) => b.count - a.count),
    regions: Array.from(regionMap.entries())
      .map(([province, count]) => ({ province, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// 企业授信画像 · Tab4 所需的上下游链视图。
export function buildCompanyChainView(company, companiesById, relations) {
  const upstream = [];
  const downstream = [];
  for (const relation of relations) {
    if (relation.fromId === company.id) {
      downstream.push({
        ...relation,
        direction: 'down',
        counterpartyId: relation.toId,
        counterpartyName: relation.toName,
      });
    } else if (relation.toId === company.id) {
      upstream.push({
        ...relation,
        direction: 'up',
        counterpartyId: relation.fromId,
        counterpartyName: relation.fromName,
      });
    }
  }
  const resolve = (item) => ({
    ...item,
    counterparty: companiesById.get(item.counterpartyId) || null,
  });
  return {
    upstream: upstream.map(resolve),
    downstream: downstream.map(resolve),
  };
}
