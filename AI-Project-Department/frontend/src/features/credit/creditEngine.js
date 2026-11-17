// 储能产业链智能授信评价引擎 V2.0（纯函数，无副作用）。
// 输入：prepare-credit-mock 产出的企业记录（未来可无缝替换为真实指标 API）。
// 输出：八维评分 / 数据完整度 / 经营价值评价 / 信用与融资适配评价 /
//      A 类重大红线与 B 类风险预警（含复核状态）/ 阶段识别 / 参考分层与参考额度 / 授信策略。
// 业务规则：《储能行业企业 AI 评价模型 V2.0 开发与优化提示词》。
//
// 三条硬性口径：
//   1) 缺失指标不得默认等于 0，也不得静默重分配权重 —— 一律显式剔除并输出数据完整度；
//   2) 经营价值评价与信用（融资适配）评价必须独立输出，不得互相替代；
//   3) 未经核实的红线信号标记「待核实」，不得直接自动否决，仅触发降级与补充核实。

import {
  CREDIT_COMPOSITION,
  CREDIT_LEVELS,
  DIMENSION_KEYS,
  DIMENSION_META,
  DIMENSION_WEIGHTS,
  EARLY_STAGE_GROUP,
  GRADE_RULES,
  GROUP_BY_TYPE,
  GROUP_META,
  PENDING_SUFFIX,
  REDLINE_DEFS,
  REDLINE_SOURCE_NOTE,
  STAGE_META,
  STRATEGY_BY_TIER,
  STRATEGY_BY_TYPE,
  SUB_INDICATORS,
  TIER_META,
  TYPE_PROFILE,
  VALUE_COMPOSITION,
  VALUE_LEVELS,
  WARNING_LEVELS,
  deriveStage,
  isItemApplicable,
} from './creditConfig.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

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

export const DIMENSION_LABELS = DIMENSION_META.reduce((acc, item) => {
  acc[item.key] = item.name;
  return acc;
}, {});

// 分段阈值 → 达成率（0—1）。
const band = (value, bands) => {
  for (const [limit, attain] of bands) {
    if (value >= limit) return attain;
  }
  return bands[bands.length - 1][1];
};

// ---------------------------------------------------------------------------
// 第三层：企业类型 + 发展阶段动态配置
// ---------------------------------------------------------------------------

export function resolveTypeGroup(company, metrics, stageKey) {
  const sectorGroup = GROUP_BY_TYPE[company.type] || 'E';
  const isEarly =
    EARLY_STAGE_GROUP.includes(stageKey) ||
    (stageKey === 'demonstration' && (metrics?.revenue || 0) < 2e8);
  const stageLabel = STAGE_META[stageKey]?.label || stageKey;
  if (isEarly && sectorGroup !== 'C') {
    return {
      groupKey: 'C',
      secondaryGroup: sectorGroup,
      reason: `发展阶段为「${stageLabel}」，按第三层规则以 C 类（科技创新型）权重为主类型，辅助类型为 ${sectorGroup} 类（${GROUP_META[sectorGroup]?.short || ''}），避免重复计分`,
    };
  }
  return {
    groupKey: sectorGroup,
    secondaryGroup: null,
    reason: `主营业务归属 ${GROUP_META[sectorGroup]?.label || sectorGroup}；发展阶段「${stageLabel}」仅影响指标解释与适用阈值，不豁免重大信用风险`,
  };
}

export function resolveStage(company, metrics) {
  if (metrics?.stage && STAGE_META[metrics.stage]) return metrics.stage;
  return deriveStage({
    revenue: metrics?.revenue || 0,
    listed: Boolean(company.listed),
    metrics: metrics || {},
  });
}

// ---------------------------------------------------------------------------
// 一级维度评分：各子项先算达成率（0—1），再按「维度权重 × 子项占比」折算得分
// ---------------------------------------------------------------------------

function item(attain, value, note) {
  return attain == null
    ? { attain: null, value, note }
    : { attain: clamp(attain, 0, 1), value, note };
}

function scoreChain(company, metrics) {
  const profile = TYPE_PROFILE[company.type] || TYPE_PROFILE.service;
  const tech = metrics.tech || {};
  const headTier = company.headTier;
  const importance = clamp(
    (profile.importance || 3) + (headTier === '龙头' ? 1 : headTier === '骨干' ? 0.5 : 0),
    1,
    5,
  );
  return {
    importance: item(
      importance / 5,
      `${importance.toFixed(1)} / 5`,
      `环节重要性自评 ${importance.toFixed(1)}（含头部地位加成）`,
    ),
    demand: item(
      (profile.demand || 3) / 5,
      `${(profile.demand || 3).toFixed(1)} / 5`,
      '细分市场需求稳定性',
    ),
    competition: item(
      (profile.competition || 3) / 5,
      `${(profile.competition || 3).toFixed(1)} / 5`,
      '格局越稳、价格战越弱得分越高',
    ),
    stickiness: item(
      clamp(metrics.topCustomerQuality ?? 0.4, 0, 1),
      `${Math.round(clamp(metrics.topCustomerQuality ?? 0.4, 0, 1) * 100)}%`,
      '以核心客户质量与验证周期代理客户黏性',
    ),
    barrier: item(
      (tech.barrier || 3) / 5,
      `${tech.barrier || 3} / 5`,
      '产品/服务对下游系统的关键性',
    ),
    policy: item(
      (profile.policy || 3) / 5,
      `${(profile.policy || 3).toFixed(1)} / 5`,
      '政策与电力市场规则影响（含支持力度）',
    ),
  };
}

function scoreCluster(company, metrics) {
  const cluster = metrics.cluster;
  if (!cluster) {
    return {
      clusterMaturity: item(null, '待补充', '尚未取得集群归属数据'),
      actualLinkage: item(null, '待补充', '无法区分注册地在集群与实际生产运营在集群'),
      upstreamDownstream: item(null, '待补充', '缺少集群内真实业务往来证明'),
      keyPosition: item(null, '待补充', '缺少集群内地位佐证'),
      facilities: item(null, '待补充', '缺少园区配套信息'),
      regionalPolicy: item(null, '待补充', '缺少区域政策与能源条件信息'),
      homogeneityRisk: item(null, '待补充', '缺少集群风险传导评估'),
    };
  }
  const linkage = cluster.productionInCluster ? 1 : cluster.inCluster ? 0.4 : 0.15;
  return {
    clusterMaturity: item(
      (cluster.maturity || 3) / 5,
      `${cluster.maturity || 3} / 5`,
      `${cluster.name} 成熟度`,
    ),
    actualLinkage: item(
      linkage,
      cluster.productionInCluster
        ? '生产/运营在集群'
        : cluster.inCluster
          ? '仅注册在集群'
          : '不在集群范围',
      '区分「注册地」与「实际生产运营地」，二者评分不可相同',
    ),
    upstreamDownstream: item(
      cluster.realBusinessLinks ? 1 : 0.35,
      cluster.realBusinessLinks ? '存在可验证业务往来' : '未验证真实业务往来',
      '与集群内企业的真实交易关系',
    ),
    keyPosition: item(
      cluster.keyPosition ?? 0.5,
      percentText(cluster.keyPosition),
      cluster.positionLabel || '集群内地位',
    ),
    facilities: item(
      (cluster.facilities || 3) / 5,
      `${cluster.facilities || 3} / 5`,
      '园区、物流、人才与检测认证配套',
    ),
    regionalPolicy: item(
      (cluster.policySupport || 3) / 5,
      `${cluster.policySupport || 3} / 5`,
      '区域政策、基础设施与能源条件',
    ),
    homogeneityRisk: item(
      1 - (cluster.homogeneityRisk ?? 0.3),
      `${Math.round((1 - (cluster.homogeneityRisk ?? 0.3)) * 100)}%`,
      cluster.dependencyNote || '单一核心企业依赖与同质化风险（越高越安全）',
    ),
  };
}

function scoreTechnology(company, metrics) {
  const tech = metrics.tech || {};
  const certifications = tech.certifications ?? 0;
  const rdRatio = tech.rdRatio ?? 0.02;
  return {
    maturity: item(
      (tech.maturity ?? 3) / 5,
      `${tech.maturity ?? 3} / 5`,
      `技术路线：${tech.techRoute || '未披露'}`,
    ),
    barrier: item(
      (tech.barrier ?? 3) / 5,
      `${tech.barrier ?? 3} / 5`,
      `核心专利 ${tech.patents ?? 0} 项`,
    ),
    certification: item(
      band(certifications, [
        [6, 1],
        [3, 0.7],
        [1, 0.4],
        [0, 0.1],
      ]),
      `${certifications} 项`,
      'CQC/UL/IEC/并网检测等认证与第三方测试',
    ),
    reliability: item(
      (tech.reliability ?? 3) / 5,
      `${tech.reliability ?? 3} / 5`,
      '产品安全性与实际运行可靠性',
    ),
    iterationRisk: item(
      tech.techIterRisk === '低' ? 1 : tech.techIterRisk === '中' ? 0.6 : 0.2,
      tech.techIterRisk || '—',
      '技术迭代与替代风险（得分越高风险越低）',
    ),
    research: item(
      band(rdRatio, [
        [0.08, 1],
        [0.05, 0.8],
        [0.03, 0.6],
        [0.015, 0.4],
        [0, 0.2],
      ]),
      percentText(rdRatio),
      '研发投入转化为收入与利润的能力',
    ),
  };
}

function scoreOperation(company, metrics) {
  const revenue = Math.max(metrics.revenue || 0, 1);
  const ocfMargin = (metrics.operatingCashFlow || 0) / revenue;
  const orderRatio = (metrics.orders || 0) / revenue;
  const concentration = metrics.customerConcentration ?? 0.5;
  const utilization = metrics.capacityUtilization ?? 0.6;
  const netMargin = metrics.netMargin ?? 0;
  const revenueScale = band(revenue, [
    [5e9, 1],
    [1e9, 0.8],
    [3e8, 0.6],
    [1e8, 0.4],
    [3e7, 0.23],
    [0, 0.1],
  ]);
  const profitability = band(netMargin, [
    [0.15, 1],
    [0.08, 0.8],
    [0.04, 0.6],
    [0.01, 0.4],
    [-0.02, 0.2],
    [-1, 0.05],
  ]);
  let cashflow = band(ocfMargin, [
    [0.12, 1],
    [0.07, 0.8],
    [0.03, 0.6],
    [0, 0.4],
    [-0.05, 0.2],
    [-1, 0],
  ]);
  let cashflowNote = '经营现金流 / 营业收入';
  if (metrics.cashflowTrap) {
    cashflow = Math.min(cashflow, 0.3);
    cashflowNote = '利润增长但经营现金流承压，已按风险形态下调';
  }
  const customerQuality = band(metrics.topCustomerQuality ?? 0, [
    [0.8, 1],
    [0.6, 0.75],
    [0.4, 0.5],
    [0.2, 0.25],
    [0, 0.13],
  ]);
  const concentrationScore = band(-concentration, [
    [-0.25, 1],
    [-0.4, 0.73],
    [-0.55, 0.4],
    [-1, 0.13],
  ]);
  const orders = band(orderRatio, [
    [1, 1],
    [0.6, 0.8],
    [0.3, 0.53],
    [0, 0.27],
  ]);
  const utilizationScore = band(utilization, [
    [0.85, 1],
    [0.7, 0.8],
    [0.55, 0.53],
    [0.4, 0.27],
    [0, 0.07],
  ]);
  return {
    revenueScale: item(revenueScale, formatYuan(revenue), '营业收入规模与近年稳定性'),
    profitability: item(
      profitability,
      percentText(netMargin),
      `毛利率 ${percentText(metrics.grossMargin)}`,
    ),
    cashflow: item(cashflow, percentText(ocfMargin), cashflowNote),
    customerQuality: item(
      customerQuality,
      percentText(metrics.topCustomerQuality),
      '下游客户信用与付款能力',
    ),
    concentration: item(
      concentrationScore,
      percentText(concentration, 0),
      'Top1 客户占比（越低越安全）',
    ),
    orders: item(orders, `${orderRatio.toFixed(2)} 倍营收`, '在手订单 / 合同覆盖倍数'),
    utilization: item(
      utilizationScore,
      percentText(utilization, 0),
      '制造企业看产能利用率；项目运营企业看可用率与等效利用小时',
    ),
  };
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

  // 缺失判定：只有原始数据存在时才给出得分，禁止用兜底默认值静默计分。
  // 缺失项由 buildDimension 从分母中显式剔除，并计入数据完整度。
  const has = (key) => metrics[key] != null;
  const okDebtRatio = has('debtRatio') || has('totalLiabilities');
  const okInterestDebt = has('interestBearingDebt') || has('totalLiabilities');
  const okInterestCoverage = Number.isFinite(metrics.ebitda) && metrics.interestExpense > 0;
  const okOcfCoverage = has('interestBearingDebt') && has('operatingCashFlow');
  const okLiquidity = has('currentRatio') || has('quickRatio');
  const okAr = has('accountsReceivable');
  const okInventory = has('inventory');
  const okShortDebt = has('shortTermDebt') && (has('cash') || has('operatingCashFlow'));
  const okGuarantee = has('guarantees');

  // ratios 用于列表展示与风险标签推导：缺失一律给 null，不得用兜底值冒充。
  const ratios = {
    debtRatio: okDebtRatio ? debtRatio : null,
    interestDebtRatio: okInterestDebt ? interestDebtRatio : null,
    interestCoverage: okInterestCoverage ? interestCoverage : null,
    ocfDebtCoverage: okOcfCoverage ? ocfDebtCoverage : null,
    currentRatio: okLiquidity ? currentRatio : null,
    quickRatio: okLiquidity ? quickRatio : null,
    arRatio: okAr ? arRatio : null,
    invRatio: okInventory ? invRatio : null,
    shortDebtCoverage: okShortDebt ? shortDebtCoverage : null,
    guaranteeRatio: okGuarantee ? guaranteeRatio : null,
  };

  const missing = (note) => item(null, '待补充', note);
  const items = {
    debtRatio: okDebtRatio
      ? item(
          band(-debtRatio, [
            [-0.4, 1],
            [-0.55, 0.8],
            [-0.65, 0.53],
            [-0.75, 0.27],
            [-1, 0.07],
          ]),
          percentText(debtRatio),
          '总负债 / 总资产',
        )
      : missing('缺少资产负债率或总负债数据'),
    interestDebtRatio: okInterestDebt
      ? item(
          band(-interestDebtRatio, [
            [-0.35, 1],
            [-0.5, 0.73],
            [-0.65, 0.4],
            [-1, 0.13],
          ]),
          percentText(interestDebtRatio),
          '有息负债 / 总负债',
        )
      : missing('缺少有息负债或总负债数据'),
    interestCoverage: okInterestCoverage
      ? item(
          band(interestCoverage, [
            [8, 1],
            [5, 0.8],
            [3, 0.53],
            [1.5, 0.27],
            [-1e9, 0.07],
          ]),
          `${interestCoverage.toFixed(2)} 倍`,
          'EBITDA / 利息支出',
        )
      : missing('缺少可用的 EBITDA 或利息支出数据'),
    ocfDebtCoverage: okOcfCoverage
      ? item(
          band(ocfDebtCoverage, [
            [0.3, 1],
            [0.15, 0.8],
            [0.05, 0.5],
            [0, 0.25],
            [-1e9, 0.05],
          ]),
          percentText(ocfDebtCoverage),
          '经营现金流 / 有息负债',
        )
      : missing('缺少经营现金流或有息负债数据'),
    liquidity: okLiquidity
      ? item(
          currentRatio >= 1.8 && quickRatio >= 1
            ? 1
            : currentRatio >= 1.2 && quickRatio >= 0.8
              ? 0.7
              : currentRatio >= 1
                ? 0.4
                : 0.1,
          `${currentRatio.toFixed(2)} / ${quickRatio.toFixed(2)}`,
          '流动比率 / 速动比率',
        )
      : missing('缺少流动比率与速动比率数据'),
    arQuality: okAr
      ? item(
          band(-arRatio, [
            [-0.2, 1],
            [-0.35, 0.73],
            [-0.5, 0.4],
            [-1, 0.13],
          ]),
          percentText(arRatio),
          '应收 / 营收',
        )
      : missing('缺少应收账款数据'),
    inventoryQuality: okInventory
      ? item(
          band(-invRatio, [
            [-0.1, 1],
            [-0.2, 0.73],
            [-0.32, 0.4],
            [-1, 0.13],
          ]),
          percentText(invRatio),
          '存货 / 营收',
        )
      : missing('缺少存货数据'),
    shortDebtPressure: okShortDebt
      ? item(
          band(-shortDebtCoverage, [
            [-0.8, 1],
            [-1.5, 0.7],
            [-2.5, 0.35],
            [-1e9, 0.1],
          ]),
          `${shortDebtCoverage.toFixed(2)} 倍`,
          '短期有息负债 /（货币资金 + 经营现金流）',
        )
      : missing('缺少短期有息负债或货币资金数据'),
    guarantees: okGuarantee
      ? item(
          band(-guaranteeRatio, [
            [0, 1],
            [-0.05, 0.7],
            [-0.12, 0.3],
            [-1, 0.1],
          ]),
          percentText(guaranteeRatio),
          '对外担保 / 总资产',
        )
      : missing('缺少对外担保数据'),
  };
  return { items, ratios };
}

function scoreTrade(company, metrics) {
  const trade = metrics.trade || {};
  return {
    supplierStability: item(
      (trade.supplierStability ?? 3) / 5,
      `${trade.supplierStability ?? 3} / 5`,
      '关键原材料/器件供应保障',
    ),
    downstreamQuality: item(
      (trade.downstreamQuality ?? 3) / 5,
      `${trade.downstreamQuality ?? 3} / 5`,
      '电网体系、央国企能源集团等高信用客户占比',
    ),
    arAuthenticity: item(
      (trade.arAuthenticity ?? 4) / 5,
      `${trade.arAuthenticity ?? 4} / 5`,
      '票据、确权、发票与流水交叉验证',
    ),
    orderAuthenticity: item(
      (trade.orderAuthenticity ?? 4) / 5,
      `${trade.orderAuthenticity ?? 4} / 5`,
      '订单可核验程度与履约进展',
    ),
    chainDependence: item(
      (trade.chainDependence ?? 3) / 5,
      `${trade.chainDependence ?? 3} / 5`,
      '对单一链条/链主依赖（低者得分高）',
    ),
  };
}

function scoreCapital(company, metrics) {
  const capital = metrics.capital;
  if (!capital) {
    return {
      equityCompleted: item(null, '待补充', '尚未取得股权融资记录'),
      investorQuality: item(null, '待补充', '缺少投资方信息'),
      fundEvidence: item(null, '待补充', '缺少到账证据'),
      stageMatch: item(null, '待补充', '无法判断融资阶段与阶段匹配度'),
      postFinancingPerf: item(null, '待补充', '缺少融资后经营数据'),
      structureRisk: item(null, '待补充', '缺少融资结构信息'),
    };
  }
  const rounds = capital.rounds ?? 0;
  const equityCompleted =
    rounds >= 3 ? 1 : rounds === 2 ? 0.85 : rounds === 1 ? 0.65 : capital.intentOnly ? 0.25 : 0.1;
  const investorQuality =
    capital.investorTier === '知名机构'
      ? 1
      : capital.investorTier === '产业资本'
        ? 0.9
        : capital.investorTier === '一般机构'
          ? 0.6
          : 0;
  const fundEvidence =
    capital.evidence === '公告/验资'
      ? 1
      : capital.evidence === '工商变更'
        ? 0.8
        : capital.evidence === '企业自述'
          ? 0.35
          : 0.15;
  const stageMatch =
    capital.stageMatch === '匹配'
      ? 1
      : capital.stageMatch === '略滞后'
        ? 0.6
        : capital.stageMatch === '不匹配'
          ? 0.25
          : 0.5;
  const postFinancingPerf =
    capital.postPerformance === '改善'
      ? 1
      : capital.postPerformance === '持平'
        ? 0.7
        : capital.postPerformance === '恶化'
          ? 0.15
          : 0.5;
  return {
    equityCompleted: item(
      equityCompleted,
      rounds ? `已完成 ${rounds} 轮` : capital.intentOnly ? '仅有融资意向' : '无外部股权融资',
      '未融资不自动扣满该维度，但需说明资金来源',
    ),
    investorQuality: item(
      investorQuality,
      capital.investorTier || '—',
      capital.investors?.length
        ? `投资方：${capital.investors.join('、')}`
        : '按投资方类型与尽调可信度评分',
    ),
    fundEvidence: item(fundEvidence, capital.evidence || '—', '工商变更、公告、验资等可核验证据'),
    stageMatch: item(stageMatch, capital.stageMatch || '—', '融资轮次与企业发展阶段匹配度'),
    postFinancingPerf: item(
      postFinancingPerf,
      capital.postPerformance || '—',
      '融资后收入、订单与现金流变化',
    ),
    structureRisk: item(
      1 - (capital.structureRisk ?? 0.3),
      `${Math.round((1 - (capital.structureRisk ?? 0.3)) * 100)}%`,
      capital.structureNote || '对赌、回购、明股实债、期限错配等结构风险（越高越安全）',
    ),
  };
}

function scoreGovernance(company, metrics) {
  const governance = metrics.governance || {};
  const litigationCount = governance.litigationCount ?? 0;
  const guaranteeRatio =
    metrics.totalAssets > 0 ? (metrics.guarantees || 0) / metrics.totalAssets : 0;
  return {
    controller: item(
      (governance.controllerStability ?? 4) / 5,
      `${governance.controllerStability ?? 4} / 5`,
      '实控人与股权稳定性',
    ),
    creditRecord: item(
      (governance.creditRecord ?? 4) / 5,
      `${governance.creditRecord ?? 4} / 5`,
      '征信与银行合作记录',
    ),
    litigation: item(
      governance.majorLitigation
        ? 0
        : litigationCount === 0
          ? 1
          : litigationCount === 1
            ? 0.6
            : 0.3,
      governance.majorLitigation ? '重大诉讼' : `${litigationCount} 起`,
      '经主体匹配与时点核实',
    ),
    externalGuarantee: item(
      !governance.externalGuarantee ? 1 : guaranteeRatio <= 0.05 ? 0.6 : 0.2,
      governance.externalGuarantee ? `担保/资产 ${percentText(guaranteeRatio)}` : '无对外担保',
      '对外担保与关联方资金占用',
    ),
    relatedTransaction: item(
      (governance.relatedTxRisk ?? 2) <= 2 ? 1 : governance.relatedTxRisk === 3 ? 0.6 : 0.2,
      `风险等级 ${governance.relatedTxRisk ?? 2} / 5`,
      '关联交易规范性、信息披露与合规经营',
    ),
  };
}

function percentText(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

const SCORERS = {
  chain: scoreChain,
  cluster: scoreCluster,
  technology: scoreTechnology,
  operation: scoreOperation,
  financial: scoreFinancial,
  trade: scoreTrade,
  capital: scoreCapital,
  governance: scoreGovernance,
};

function buildDimension(dimKey, rawItems, dimMax, groupKey) {
  const defs = SUB_INDICATORS[dimKey] || [];
  const items = {};
  const excluded = [];
  const missing = [];
  let availMax = 0;
  let earned = 0;
  for (const def of defs) {
    const raw = rawItems?.[def.key];
    if (!isItemApplicable(dimKey, def.key, groupKey)) {
      excluded.push(def.name);
      continue;
    }
    if (!raw || raw.attain == null) {
      missing.push(def.name);
      continue;
    }
    const subMax = dimMax * def.ratio;
    availMax += subMax;
    earned += subMax * raw.attain;
    items[def.key] = {
      key: def.key,
      name: def.name,
      def: def.def,
      ratio: def.ratio,
      score: round1(subMax * raw.attain),
      max: round1(subMax),
      attain: round2(raw.attain),
      value: raw.value,
      note: raw.note,
    };
  }
  const coverage = dimMax > 0 ? availMax / dimMax : 0;
  return {
    key: dimKey,
    name: DIMENSION_LABELS[dimKey],
    score: availMax > 0 ? round1((earned / availMax) * dimMax) : 0,
    max: dimMax,
    items,
    excluded,
    missing,
    coverage: round2(coverage),
    scored: availMax > 0,
  };
}

// ---------------------------------------------------------------------------
// 红线（A 类重大红线 / B 类风险预警）+ 复核状态
// ---------------------------------------------------------------------------

function pushLine(lines, seen, cls, key, extra = {}) {
  if (seen.has(key)) return;
  const label = REDLINE_DEFS[cls]?.items?.[key] || key;
  const pending = Boolean(extra.pending);
  lines.push({
    class: cls,
    classLabel: REDLINE_DEFS[cls]?.label || cls,
    key,
    label,
    status: pending ? 'pending' : 'verified',
    statusLabel: pending ? '待核实' : '已核实',
    ...REDLINE_SOURCE_NOTE,
    evidence: extra.evidence || '',
  });
  seen.add(key);
}

function collectRedlines(metrics, groupKey) {
  const events = metrics.events || {};
  const lines = [];
  const seen = new Set();
  for (const [cls, def] of Object.entries(REDLINE_DEFS)) {
    for (const key of Object.keys(def.items)) {
      if (key === 'capacityLow' && groupKey === 'E') continue; // 项目运营企业无产能口径
      const pending = Boolean(events[`${key}${PENDING_SUFFIX}`]);
      if (events[key])
        pushLine(lines, seen, cls, key, { pending, evidence: '企业风险事件台账 / 财报与公告' });
      else if (pending)
        pushLine(lines, seen, cls, key, {
          pending: true,
          evidence: '舆情或内部提示，尚未完成主体匹配与时点核实',
        });
    }
  }
  // 指标推导项：与风险标签同一口径，避免「打了标签却不降级」。
  const arRatio = (metrics.accountsReceivable || 0) / Math.max(metrics.revenue || 1, 1);
  if (((metrics.arGrowth ?? 0) > 0.4 && arRatio > 0.3) || arRatio > 0.45) {
    pushLine(lines, seen, 'B', 'arAbnormalGrowth', {
      evidence: `应收/营收 ${percentText(arRatio)}，增速 ${percentText(metrics.arGrowth)}`,
    });
  }
  if (
    (metrics.inventoryGrowth ?? 0) > 0.4 &&
    (metrics.inventory || 0) / Math.max(metrics.revenue || 1, 1) > 0.25
  ) {
    pushLine(lines, seen, 'B', 'inventoryAbnormal', { evidence: '存货增速与占比同时异常' });
  }
  if (groupKey !== 'E' && (metrics.capacityUtilization ?? 1) < 0.45) {
    pushLine(lines, seen, 'B', 'capacityLow', {
      evidence: `产能利用率 ${percentText(metrics.capacityUtilization)}`,
    });
  }
  const operator = metrics.operatorExtra;
  if (operator) {
    if ((operator.dscr ?? 2) < 1.05 || (operator.projectIrr ?? 1) < 0.04) {
      pushLine(lines, seen, 'B', 'projectRevenueBelowExpectation', {
        evidence: `DSCR ${operator.dscr?.toFixed(2)}，项目 IRR ${percentText(operator.projectIrr)}`,
      });
    }
  }
  if (metrics.cluster?.contagionRisk === '高') {
    pushLine(lines, seen, 'B', 'clusterContagion', {
      evidence: metrics.cluster.dependencyNote || '集群内单一核心企业依赖度高',
    });
  }
  if (metrics.capital?.postPerformance === '恶化') {
    pushLine(lines, seen, 'B', 'postFinancingDeterioration', {
      evidence: '融资后收入或现金流出现恶化',
    });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 风险标签 / 预警等级
// ---------------------------------------------------------------------------

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
  if (metrics.cluster?.keyPosition != null && metrics.cluster.keyPosition >= 0.7)
    push('positive', 'clusterKey', '集群内关键地位');
  if (
    metrics.capital &&
    (metrics.capital.rounds ?? 0) > 0 &&
    metrics.capital.evidence === '公告/验资'
  )
    push('positive', 'capitalVerified', '资本验证充分');

  if (metrics.cashflowTrap) push('risk', 'cashflowTrap', '利润增长但现金流承压');
  if ((metrics.customerConcentration ?? 0) > 0.45)
    push('warn', 'customerConcentration', '客户集中度偏高');
  if (((metrics.arGrowth ?? 0) > 0.4 && ratios.arRatio > 0.3) || ratios.arRatio > 0.45)
    push('risk', 'highAr', '高应收账款');
  if ((metrics.inventoryGrowth ?? 0) > 0.35 && ratios.invRatio > 0.22)
    push('warn', 'highInventory', '存货积压');
  if (ratios.shortDebtCoverage > 1.8) push('risk', 'shortDebt', '短债压力高');
  if ((metrics.debtRatio ?? 0) > 0.7) push('warn', 'highLeverage', '高杠杆');
  if ((metrics.capacityUtilization ?? 1) < 0.5) push('warn', 'lowUtilization', '产能利用率低');
  if (metrics.tech?.techIterRisk === '高') push('warn', 'techIteration', '技术迭代风险');
  if (ratios.guaranteeRatio > 0.1) push('warn', 'guarantee', '对外担保风险');
  if (metrics.cluster?.homogeneityRisk != null && metrics.cluster.homogeneityRisk > 0.6)
    push('warn', 'clusterDependency', '集群同质化/核心企业依赖');
  if (metrics.cluster && !metrics.cluster.productionInCluster)
    push('warn', 'clusterRegistrationOnly', '仅注册在集群');
  if (metrics.capital?.stageMatch === '不匹配')
    push('warn', 'capitalStageMismatch', '融资与阶段不匹配');
  if (metrics.capital?.postPerformance === '恶化') push('risk', 'postFinancing', '融资后经营恶化');
  if (metrics.capital?.structureRisk != null && metrics.capital.structureRisk > 0.6)
    push('risk', 'capitalStructure', '融资结构风险');
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
  const aVerified = redlines.filter(
    (line) => line.class === 'A' && line.status === 'verified',
  ).length;
  const aPending = redlines.filter(
    (line) => line.class === 'A' && line.status === 'pending',
  ).length;
  const bCount = redlines.filter((line) => line.class === 'B').length;
  if (aVerified > 0 || riskCount >= 2) return 'red';
  if (aPending > 0 || riskCount >= 1 || bCount >= 2 || total < 55) return 'orange';
  if (bCount >= 1 || warnCount >= 2) return 'yellow';
  if (warnCount >= 1 || total < 70) return 'blue';
  return 'normal';
}

// ---------------------------------------------------------------------------
// 参考额度（保留原非线性测算，仅作参考，不作为授信结论）
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 双评价：经营价值 + 信用与融资适配
// ---------------------------------------------------------------------------

function compose(dimensions, composition) {
  let earned = 0;
  let avail = 0;
  const parts = [];
  for (const { key, weight } of composition) {
    const dim = dimensions[key];
    const usable = dim && dim.scored && dim.coverage > 0;
    if (usable) {
      earned += weight * (dim.score / dim.max);
      avail += weight;
    }
    parts.push({
      key,
      name: DIMENSION_LABELS[key],
      weight,
      score: usable ? dim.score : null,
      max: usable ? dim.max : null,
      coverage: usable ? dim.coverage : 0,
    });
  }
  return {
    score: avail > 0 ? Math.round((earned / avail) * 100) : 0,
    coverage: round2(avail),
    parts,
  };
}

function buildActions({
  metrics,
  stageKey,
  dimensions,
  missingTotal,
  redlines,
  coverage,
  value,
  credit,
}) {
  const docs = [];
  if (missingTotal.length) {
    docs.push(
      `补充缺失指标数据：${missingTotal.slice(0, 6).join('、')}${missingTotal.length > 6 ? ` 等 ${missingTotal.length} 项` : ''}（当前未参与评分，未按 0 处理）`,
    );
  }
  if (dimensions.cluster?.coverage === 0)
    docs.push('补充产业集群归属证明：园区入驻/生产场地与实际业务往来（区分注册地与生产运营地）');
  if (dimensions.capital?.coverage === 0)
    docs.push('补充投融资经历材料：投资方、工商变更/公告、到账凭证与投后经营变化');
  if (metrics.capital && (metrics.capital.rounds ?? 0) === 0 && !metrics.capital.intentOnly)
    docs.push('说明无外部股权融资情况下的资金来源与后续资金安排');
  if (STAGE_META[stageKey] && EARLY_STAGE_GROUP.includes(stageKey))
    docs.push('补充现金消耗速度与剩余资金可支撑月数、下一轮融资进展与里程碑计划');
  if (coverage < 0.7)
    docs.push(`当前数据完整度 ${Math.round(coverage * 100)}%，建议补齐主要维度后复评`);

  const escalations = [];
  const pendingA = redlines.filter((line) => line.class === 'A' && line.status === 'pending');
  if (pendingA.length)
    escalations.push(
      `待核实重大红线信号（${pendingA.map((line) => line.label).join('、')}），须完成主体匹配与时点核实后定性，未核实前不得作为否决依据`,
    );
  const verifiedA = redlines.filter((line) => line.class === 'A' && line.status === 'verified');
  if (verifiedA.length)
    escalations.push(
      `已核实重大红线（${verifiedA.map((line) => line.label).join('、')}），按制度限制准入并升级审查`,
    );
  const bCount = redlines.filter((line) => line.class === 'B').length;
  if (bCount >= 2) escalations.push('多项风险预警叠加，建议升级审查并核查资金用途与还款来源');
  if (dimensions.financial?.coverage < 0.7)
    escalations.push('财务维度数据不完整，涉及具体融资业务时须逐笔核实还款来源');
  if (value.score >= 65 && credit.score < 65)
    escalations.push('经营价值较高但信用适配偏弱：可优先建立联系，不得以经营价值结论替代授信审查');
  if (metrics.cluster?.contagionRisk === '高')
    escalations.push('集群风险传导需评估：核查核心企业依赖与区域同质化对订单与回款的影响');

  return { docs, escalations };
}

// 评价结果按企业对象缓存（WeakMap）：分析模块会在排序比较器中反复调用本函数，
// 缓存后同一企业对象只计算一次；企业数据为只读 mock，不涉及失效问题。
const evaluationCache = new WeakMap();

export function evaluateCompany(company) {
  if (!company) return null;
  if (evaluationCache.has(company)) return evaluationCache.get(company);
  const result = computeEvaluation(company);
  evaluationCache.set(company, result);
  return result;
}

function computeEvaluation(company) {
  const metrics = company.metrics;
  if (!metrics) return null;

  const stageKey = resolveStage(company, metrics);
  const { groupKey, secondaryGroup, reason } = resolveTypeGroup(company, metrics, stageKey);
  const weights = DIMENSION_WEIGHTS[groupKey] || DIMENSION_WEIGHTS.E;

  const dimensions = {};
  const missingTotal = [];
  const excludedTotal = [];
  for (const dimKey of DIMENSION_KEYS) {
    const raw = SCORERS[dimKey] ? SCORERS[dimKey](company, metrics) : null;
    const items = raw && raw.items ? raw.items : raw;
    const dim = buildDimension(dimKey, items, weights[dimKey] || 0, groupKey);
    dimensions[dimKey] = dim;
    for (const name of dim.missing) missingTotal.push(`${dim.name} · ${name}`);
    for (const name of dim.excluded) excludedTotal.push(`${dim.name} · ${name}`);
  }

  let earnedAll = 0;
  let availAll = 0;
  for (const dimKey of DIMENSION_KEYS) {
    const dim = dimensions[dimKey];
    if (!dim.scored) continue;
    const availMax = dim.max * dim.coverage;
    earnedAll += (dim.score / (dim.max || 1)) * availMax;
    availAll += availMax;
  }
  const total = availAll > 0 ? Math.round((earnedAll / availAll) * 100) : 0;
  const coverage = availAll > 0 ? round2(availAll / 100) : 0;

  const ratios = scoreFinancial(company, metrics).ratios;
  const ocfMargin = (metrics.operatingCashFlow || 0) / Math.max(metrics.revenue || 1, 1);
  const redlines = collectRedlines(metrics, groupKey);

  const initial = gradeForScore(total);
  let grade = initial.grade;
  let tier = initial.tier;
  let veto = false;
  let vetoNote = '';
  const verifiedA = redlines.filter((line) => line.class === 'A' && line.status === 'verified');
  const pendingA = redlines.filter((line) => line.class === 'A' && line.status === 'pending');
  const bCount = redlines.filter((line) => line.class === 'B').length;

  if (verifiedA.length) {
    veto = true;
    vetoNote = verifiedA.map((line) => line.label).join('、');
    tier = 3;
    grade = 'C';
  } else {
    if (bCount >= 2) tier = 3;
    else if (bCount >= 1) tier = Math.max(tier, 2);
    if (pendingA.length) tier = Math.max(tier, 2); // 待核实信号先降级，不直接否决
    if (total < 60) tier = 3;
    if (tier === 3) grade = downgradeGrade(initial.grade, 0);
    else if (tier === 2) grade = downgradeGrade(initial.grade, 2);
  }

  const gradeMeta = GRADE_RULES.find((rule) => rule.grade === grade) || gradeForScore(total);
  const tierMeta = TIER_META[tier];
  const riskTags = buildRiskTags(company, metrics, ratios, ocfMargin);
  const warningLevel = warningLevelFor(riskTags, redlines, total);
  const creditLimit = buildCreditLimit(company, metrics, grade, ratios);
  const strategyType = STRATEGY_BY_TYPE[company.type] || STRATEGY_BY_TYPE.service;

  const value = compose(dimensions, VALUE_COMPOSITION);
  const credit = compose(dimensions, CREDIT_COMPOSITION);
  // 显式护栏：早期阶段企业现金消耗为负时，信用适配评分设上限。
  // 技术潜力高不等于偿债能力强，不得因技术优秀自动抬高信用安全评价。
  credit.guardrails = [];
  credit.rawScore = credit.score;
  if (
    EARLY_STAGE_GROUP.includes(stageKey) &&
    (metrics.operatingCashFlow ?? 0) <= 0 &&
    credit.score > 55
  ) {
    credit.score = 55;
    credit.guardrails.push(
      '研发/中试阶段企业当前经营现金流为负，信用适配评分按规则上限 55 分（对应逐笔审查），技术价值单列于经营价值评价',
    );
  }
  if (dimensions.financial?.coverage < 0.7) {
    credit.guardrails.push('财务维度数据完整度不足 70%，信用适配结论以补充资料后复评结果为准');
  }
  const valueLevel =
    VALUE_LEVELS.find((level) => value.score >= level.min) || VALUE_LEVELS[VALUE_LEVELS.length - 1];
  const creditLevel =
    CREDIT_LEVELS.find((level) => credit.score >= level.min) ||
    CREDIT_LEVELS[CREDIT_LEVELS.length - 1];
  const { docs, escalations } = buildActions({
    metrics,
    stageKey,
    dimensions,
    missingTotal,
    redlines,
    coverage,
    value,
    credit,
  });
  for (const note of credit.guardrails || []) escalations.unshift(note);
  const pendingRedlines = redlines.filter((line) => line.status === 'pending');

  return {
    companyId: company.id,
    // 企业类型与阶段识别（第三层）
    group: groupKey,
    groupLabel: GROUP_META[groupKey]?.label || groupKey,
    groupShort: GROUP_META[groupKey]?.short || '',
    groupReason: reason,
    secondaryGroup,
    stage: stageKey,
    stageLabel: STAGE_META[stageKey]?.label || stageKey,
    stageNote: STAGE_META[stageKey]?.note || '',
    // 八维评分
    dimensions,
    dimensionMeta: DIMENSION_META,
    weightTemplate: weights,
    total,
    coverage,
    missing: missingTotal,
    excluded: excludedTotal,
    // 双评价（互相独立）
    value,
    valueLevel,
    credit,
    creditLevel,
    actions: { docs, escalations },
    // 参考分层与参考额度（不作为授信结论）
    grade,
    gradeLabel: gradeMeta.gradeLabel,
    tier,
    tierLabel: `${tierMeta.label} · ${tierMeta.name}`,
    veto,
    vetoNote,
    referenceNote: '分层与建议额度为参考值，不构成授信审批结论；授信须按单项业务另行审查。',
    redlines,
    pendingRedlines,
    riskTags,
    warningLevel,
    warningLabel: WARNING_LEVELS[warningLevel].label,
    creditLimit,
    ratios,
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
  const valueCounts = { A: 0, B: 0, C: 0, D: 0 };
  const creditCounts = { pass: 0, limit: 0, review: 0, hold: 0 };
  const groupCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const stageCounts = {};
  const chains = new Map();
  const scoreDist = [
    { key: '90-100', label: '90-100分', min: 90, max: 101, count: 0 },
    { key: '80-89', label: '80-89分', min: 80, max: 90, count: 0 },
    { key: '70-79', label: '70-79分', min: 70, max: 80, count: 0 },
    { key: '60-69', label: '60-69分', min: 60, max: 70, count: 0 },
    { key: '0-59', label: '60分以下', min: 0, max: 60, count: 0 },
  ];
  const valueDist = [
    { key: 'A', label: '优先关注', min: 80, max: 101, count: 0 },
    { key: 'B', label: '持续跟踪', min: 65, max: 80, count: 0 },
    { key: 'C', label: '观察培育', min: 50, max: 65, count: 0 },
    { key: 'D', label: '暂缓接触', min: 0, max: 50, count: 0 },
  ];
  const creditDist = [
    { key: 'pass', label: '可准入', min: 80, max: 101, count: 0 },
    { key: 'limit', label: '需增信/限额', min: 65, max: 80, count: 0 },
    { key: 'review', label: '逐笔审查', min: 50, max: 65, count: 0 },
    { key: 'hold', label: '暂缓授信', min: 0, max: 50, count: 0 },
  ];
  const riskTagMap = new Map();
  const warningCounts = { normal: 0, blue: 0, yellow: 0, orange: 0, red: 0 };
  const regionMap = new Map();
  let totalLimit = 0;
  let scoreSum = 0;
  let valueSum = 0;
  let creditSum = 0;
  let vetoCount = 0;
  let pendingRedlineCount = 0;
  let lowCoverageCount = 0;

  for (const { company, evaluation } of evaluated) {
    tierCounts[evaluation.tier] += 1;
    gradeCounts[evaluation.grade] += 1;
    valueCounts[evaluation.valueLevel.key] += 1;
    creditCounts[evaluation.creditLevel.key] += 1;
    groupCounts[evaluation.group] = (groupCounts[evaluation.group] || 0) + 1;
    stageCounts[evaluation.stage] = (stageCounts[evaluation.stage] || 0) + 1;
    scoreSum += evaluation.total;
    valueSum += evaluation.value.score;
    creditSum += evaluation.credit.score;
    totalLimit += evaluation.creditLimit.amount;
    if (evaluation.veto) vetoCount += 1;
    if (evaluation.pendingRedlines.length) pendingRedlineCount += 1;
    if (evaluation.coverage < 0.7) lowCoverageCount += 1;
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
    const valueBucket = valueDist.find(
      (item) => evaluation.value.score >= item.min && evaluation.value.score < item.max,
    );
    if (valueBucket) valueBucket.count += 1;
    const creditBucket = creditDist.find(
      (item) => evaluation.credit.score >= item.min && evaluation.credit.score < item.max,
    );
    if (creditBucket) creditBucket.count += 1;

    for (const tag of evaluation.riskTags) {
      if (tag.level === 'positive') continue;
      if (!riskTagMap.has(tag.key))
        riskTagMap.set(tag.key, { key: tag.key, label: tag.label, count: 0 });
      riskTagMap.get(tag.key).count += 1;
    }

    const province = company.region?.province || '未知';
    regionMap.set(province, (regionMap.get(province) || 0) + 1);
  }

  const n = evaluated.length || 1;
  return {
    totalCompanies: entries.length,
    evaluatedCount: evaluated.length,
    pendingCount: entries.length - evaluated.length,
    tierCounts,
    gradeCounts,
    valueCounts,
    creditCounts,
    groupCounts,
    stageCounts,
    vetoCount,
    pendingRedlineCount,
    lowCoverageCount,
    avgScore: evaluated.length ? Math.round(scoreSum / n) : 0,
    avgValue: evaluated.length ? Math.round(valueSum / n) : 0,
    avgCredit: evaluated.length ? Math.round(creditSum / n) : 0,
    totalLimit,
    warningCounts,
    chains: Array.from(chains.values()),
    scoreDist,
    valueDist,
    creditDist,
    riskTags: Array.from(riskTagMap.values()).sort((a, b) => b.count - a.count),
    regions: Array.from(regionMap.entries())
      .map(([province, count]) => ({ province, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// 企业授信画像 · 上下游链视图。
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

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

function gradeForScore(total) {
  return GRADE_RULES.find((rule) => total >= rule.min) || GRADE_RULES[GRADE_RULES.length - 1];
}

const GRADE_RANK = { S: 4, A: 3, B: 2, 'C+': 1, C: 0 };

function downgradeGrade(grade, targetRank) {
  const order = ['C', 'C+', 'B', 'A', 'S'];
  return order[Math.min(targetRank, GRADE_RANK[grade] ?? 0)] || 'C';
}
