// 「AI 深度分析」的产出：按 7 个维度对当前二级环节给出结论性洞察。
//
// 与「刷新分析」的分工：
//   - 刷新分析：重新载入数据层（入库清单 + 演示口径），刷新全部数值与图表，不生成文字结论；
//   - AI 深度分析：在最新数据上跑 7 步分析链路，产出下面的结论性洞察，并写入导出报告。
//
// 当前为 Mock 实现：结论由报告的结构化数据确定性推导（同一环节同一输入必得同一结论），
// 接入真实 AI 后，只需把 buildAiInsights 换成模型调用，返回值结构保持不变即可。

export const AI_INSIGHT_STEPS = [
  { id: 'market', label: '行业规模', sourceKey: 'aiMarket' },
  { id: 'region', label: '区域分布', sourceKey: 'aiRegion' },
  { id: 'capacity', label: '产能供需', sourceKey: 'aiCapacity' },
  { id: 'company', label: '企业格局', sourceKey: 'aiConcentration' },
  { id: 'technology', label: '技术路线', sourceKey: 'aiTechnology' },
  { id: 'trend', label: '产业趋势', sourceKey: 'aiJudgement' },
  { id: 'credit', label: '授信风险', sourceKey: 'aiCredit' },
];

const num = (value) => Number(value ?? 0);
const fmt = (value, digits = 0) =>
  num(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });

// 去掉模型补的说明后缀，只保留路线名本身（如「磷酸铁锂大容量电芯（314Ah+）（市占率 68%）」）。
const plainRoute = (text) => String(text || '—').replace(/（(市占率|成长性)[^）]*）/g, '');

// 趋势类型英文 key → 中文标签（用于指标区展示）。
const TREND_KIND_LABEL = {
  demand: '需求',
  supply: '供给',
  concentration: '格局',
  technology: '技术',
  profit: '盈利',
  policy: '政策',
  overseas: '海外',
};

function marketInsight(segment) {
  const { market } = segment;
  const topDriver = market.drivers?.[0] || '';
  const topDemand = market.demandMix?.[0];
  const tone =
    market.cagr >= 20 ? '处于高速扩张期' : market.cagr >= 10 ? '处于稳步成长期' : '增速已趋缓';
  return {
    headline: `${fmt(market.chinaLatest, 1)} 亿元，2026—2030 年 CAGR ${market.cagr}%`,
    text:
      `2025 年中国市场规模约 ${fmt(market.chinaLatest, 1)} 亿元，同比增长 ${market.growth}%，${tone}（行业阶段：${market.stage}）。` +
      (topDemand
        ? `需求结构上，${topDemand.label}占比约 ${topDemand.share}%，是当期最主要的去向。`
        : '') +
      (topDriver
        ? `需求扩张的核心驱动是「${topDriver}」，未来五年 CAGR 预计 ${market.cagr}%。`
        : '') +
      '规模类数据为模型推算，实际口径受统计范围（是否含出口、是否含税）影响，授信测算前应确认口径一致。',
    metrics: [
      { label: '2025 规模', value: `${fmt(market.chinaLatest, 1)} 亿元` },
      { label: '2026E 规模', value: `${fmt(market.forecast?.[0] ?? 0, 1)} 亿元` },
      { label: 'CAGR', value: `${market.cagr}%` },
      { label: '行业阶段', value: market.stage },
    ],
  };
}

function regionInsight(segment) {
  const { regions } = segment;
  const top = regions.regions?.[0];
  const excluded = regions.excluded || 0;
  return {
    headline: `前 ${regions.regions?.length || 0} 个地区集中了 ${regions.topShare}% 的入库企业`,
    text:
      `本环节入库上市企业 ${fmt(regions.total)} 家，均可归属到具体属地。` +
      `排名首位的${top ? `「${top.province}」拥有 ${top.companies} 家企业（占比 ${top.share}%）` : '地区暂无企业'}，` +
      `前 ${regions.regions?.length || 0} 个地区合计占比 ${regions.topShare}%，产业呈明显集聚特征。` +
      '集聚区配套更完善、物流与人才成本更低，但也意味着区域集中度风险：单一省份的环保限产、能耗指标或电价调整会同时冲击多数授信客户。' +
      (excluded ? `另有 ${excluded} 家企业注册地在境外，未计入区域分布。` : '') +
      '区域产值为模型按企业数与产能分摊推算，如需准确数据应以地方统计口径为准。',
    metrics: [
      { label: '入库上市企业', value: `${fmt(regions.total)} 家` },
      { label: '上榜地区', value: `${fmt(regions.regions?.length || 0)} 个` },
      { label: '前 N 地区占比', value: `${regions.topShare}%` },
      { label: '首位地区', value: top ? top.province : '—' },
    ],
  };
}

function capacityInsight(segment) {
  const { capacity } = segment;
  const gapText = capacity.gap >= 0 ? '供不应求' : '供大于求';
  return {
    headline: `利用率 ${capacity.utilization}%，供需状态「${capacity.balance}」`,
    text:
      `名义产能 ${fmt(capacity.nominal)} ${capacity.unit}，有效产能 ${fmt(capacity.effective)} ${capacity.unit}，` +
      `实际产量 ${fmt(capacity.output)} ${capacity.unit}，产能利用率 ${capacity.utilization}%；` +
      `当期需求 ${fmt(capacity.demand)} ${capacity.unit}，供需缺口 ${capacity.gap >= 0 ? '+' : ''}${fmt(capacity.gap)} ${capacity.unit}（${gapText}）。` +
      `在建 ${fmt(capacity.underConstruction)} ${capacity.unit}、规划 ${fmt(capacity.planned)} ${capacity.unit} 尚待释放，` +
      `未来产能落地节奏是价格与毛利的主要变量（产能风险等级：${capacity.riskLevel}）。` +
      `判断：${capacity.outlook}`,
    metrics: [
      { label: '名义产能', value: `${fmt(capacity.nominal)} ${capacity.unit}` },
      { label: '产能利用率', value: `${capacity.utilization}%` },
      { label: '供需缺口', value: `${capacity.gap >= 0 ? '+' : ''}${fmt(capacity.gap)}` },
      {
        label: '在建 + 规划',
        value: `${fmt(capacity.underConstruction)} + ${fmt(capacity.planned)}`,
      },
      { label: '当期需求', value: `${fmt(capacity.demand)} ${capacity.unit}` },
    ],
  };
}

function companyInsight(segment) {
  const { companies } = segment;
  const leaders = (companies.list || [])
    .slice(0, 3)
    .map((row) => `${row.short}（${row.headTier || row.grade}）`);
  return {
    headline: `CR3 ${companies.cr3}% / CR5 ${companies.cr5}% / CR10 ${companies.cr10}%，判断为「${companies.verdict}」`,
    text:
      `本环节纳入分析的上市企业 ${fmt(companies.count)} 家，其中龙头标记 ${fmt(companies.leaderCount)} 家、` +
      `核心主业企业 ${fmt(companies.coreMainCount)} 家。集中度 CR3 ${companies.cr3}%、CR5 ${companies.cr5}%、CR10 ${companies.cr10}%，` +
      `判断为「${companies.verdict}」，${companies.verdictNote}` +
      (leaders.length ? `头部企业依次为 ${leaders.join('、')}，是名单制授信的首选对象。` : '') +
      '企业名单与分层来自入库清单，市场份额为模型推算，用于排序参考而非精确份额。',
    metrics: [
      { label: '上市企业', value: `${fmt(companies.count)} 家` },
      { label: '龙头标记', value: `${fmt(companies.leaderCount)} 家` },
      { label: 'CR3', value: `${companies.cr3}%` },
      { label: 'CR10', value: `${companies.cr10}%` },
    ],
  };
}

function technologyInsight(segment) {
  const { technology } = segment;
  const mainstream = plainRoute(technology.mainstream);
  const fastest = plainRoute(technology.fastestGrowing);
  const riskiest = plainRoute(technology.highestRisk);
  const risky = (technology.routes || [])
    .filter((route) => route.risk === '高')
    .map((route) => route.route);
  return {
    headline: `主流路线「${mainstream}」，替代风险最高「${riskiest}」`,
    text:
      `当前主流技术路线为「${mainstream}」，市占率最高；成长最快的是「${fastest}」；` +
      `替代风险最高的路线为「${riskiest}」。` +
      (risky.length
        ? `需重点跟踪 ${risky.join('、')} 的份额变化，其对应产线存在贬值与订单转移风险。`
        : '') +
      '对授信而言，技术路线的风险不来自「研发投入高低」，而来自「路线选择是否正确」：' +
      '产线专用性强、技术切换快的环节，贷款期限应与该路线的生命周期匹配，并以客户验证进度作为放款前提。',
    metrics: [
      { label: '主流路线', value: mainstream },
      { label: '成长最快', value: fastest },
      { label: '替代风险最高', value: riskiest },
    ],
  };
}

function trendInsight(segment) {
  const list = (segment.trends || []).slice(0, 3);
  return {
    headline: `${(segment.trends || []).length} 条产业趋势，${list[0] ? `首条为「${list[0].title}」` : '待补充'}`,
    text:
      (list.length
        ? list
            .map(
              (trend, index) =>
                `${index + 1}. ${trend.title}（时间窗口：${trend.window}）——${trend.judgement}受益方：${trend.beneficiary}；承压方：${trend.pressured}。`,
            )
            .join('')
        : '当期未识别出显著的产业趋势。') +
      '趋势判断的作用是把「当期财务表现」放到「未来 3—5 年产业位置」里看：' +
      '受益方所在的环节可适度拉长期限，承压方则应缩短期限并提高增信要求。',
    metrics: list.map((trend) => ({
      label: TREND_KIND_LABEL[trend.kind] || '趋势',
      value: trend.window,
    })),
  };
}

function creditInsight(segment) {
  const { credit } = segment;
  const risks = (credit.coreRisks || []).slice(0, 3);
  return {
    headline: `行业授信评级「${credit.rating}」，景气度 ${segment.scores.industryScore}/100、授信友好度 ${segment.scores.creditFriendlyScore}/100`,
    text:
      `综合需求增速、供需状态、集中度、现金流特征与政策确定性，本环节行业授信评级为「${credit.rating}」。` +
      `${credit.ratingNote || ''}` +
      `主要风险点：${risks.map((risk) => risk.label || risk).join('、') || '见重点风险清单'}。` +
      `还款来源：${credit.firstRepayment || '以经营现金流为第一还款来源'}；` +
      `重点关注${credit.focus || '现金流与存货'}（${credit.cashNote || '现金流特征见授信章节'}）。` +
      `额度退出与重检：${(credit.exit || '产能利用率与账龄触发重检').replace(/^触发条件：/, '')}`,
    metrics: [
      { label: '行业评级', value: credit.rating },
      { label: '景气度', value: `${segment.scores.industryScore}/100` },
      { label: '授信友好度', value: `${segment.scores.creditFriendlyScore}/100` },
      { label: '资金用途', value: (credit.entries || [])[0]?.product || '—' },
    ],
  };
}

const BUILDERS = {
  market: marketInsight,
  region: regionInsight,
  capacity: capacityInsight,
  company: companyInsight,
  technology: technologyInsight,
  trend: trendInsight,
  credit: creditInsight,
};

// 返回 7 个维度（AI_INSIGHT_STEPS 顺序）的洞察对象数组。
export function buildAiInsights(segment) {
  if (!segment) return [];
  return AI_INSIGHT_STEPS.map((step) => {
    const built = BUILDERS[step.id](segment);
    return {
      id: step.id,
      label: step.label,
      sourceKey: step.sourceKey,
      headline: built.headline,
      text: built.text,
      metrics: built.metrics,
    };
  });
}
