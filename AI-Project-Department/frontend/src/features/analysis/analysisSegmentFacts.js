// 产业链「分析」模块 · 二级环节知识库汇总入口。
// 储能三册 + 算力三册合并后对外提供唯一读取口径，页面与数据生成脚本都从这里取。
import { SEGMENT_FACTS_A } from './analysisSegmentFactsA.js';
import { SEGMENT_FACTS_B } from './analysisSegmentFactsB.js';
import { SEGMENT_FACTS_C } from './analysisSegmentFactsC.js';
import { COMPUTE_FACTS_A } from './analysisSegmentFactsComputeA.js';
import { COMPUTE_FACTS_B } from './analysisSegmentFactsComputeB.js';
import { COMPUTE_FACTS_C } from './analysisSegmentFactsComputeC.js';

// 环节归属调整后的知识库键映射：清单重判把「电源与供配电」归到设备与网络、
// 「运营商算力网络」归到服务与运营，需求侧独立成组，机房建设改为清单原名的全称。
// 知识库正文不动，只在汇总时换键，避免同一段结论维护两份。
const SEGMENT_KEY_ALIASES = {
  '算力芯片与核心器件|电源与供配电': '算力设备与网络|电源与供配电',
  '算力基础设施|机房建设与集成': '算力基础设施|机房建设与系统集成',
  '算力基础设施|运营商算力网络': '算力服务与运营|运营商算力网络',
  '算力服务与运营|算力需求方': '算力需求方|算力需求方/应用',
};

const MERGED_FACTS = {
  ...SEGMENT_FACTS_A,
  ...SEGMENT_FACTS_B,
  ...SEGMENT_FACTS_C,
  ...COMPUTE_FACTS_A,
  ...COMPUTE_FACTS_B,
  ...COMPUTE_FACTS_C,
};

export const SEGMENT_FACTS = Object.fromEntries(
  Object.entries(MERGED_FACTS).map(([key, fact]) => [SEGMENT_KEY_ALIASES[key] || key, fact]),
);

export const SEGMENT_FACT_KEYS = Object.keys(SEGMENT_FACTS);

// 行业景气度评分权重（提示词第 17 章）。
export const PROSPERITY_WEIGHTS = {
  demandGrowth: 0.2,
  supplyDemand: 0.2,
  priceTrend: 0.15,
  profitability: 0.15,
  technology: 0.1,
  policy: 0.1,
  competition: 0.1,
};

// 授信友好度评分因子（提示词第 18 章）。
export const CREDIT_FRIENDLY_FACTORS = [
  '现金流稳定性',
  '行业周期',
  '资产可抵押性',
  '订单稳定性',
  '企业集中度',
  '项目收益稳定性',
  '政策确定性',
];

// 授信切入点全量清单（提示词第 15 章），章节组件按需取用。
export const CREDIT_ENTRY_POINT_LIBRARY = [
  '流动资金贷款',
  '供应链金融',
  '应收账款融资',
  '仓单质押',
  '项目融资',
  '并购贷款',
  '绿色金融',
  '设备融资',
];

// 客户策略四层（提示词第 15 章）。
export const CUSTOMER_TIERS = ['战略核心客户', '重点支持客户', '条件支持客户', '严格准入客户'];

// 行业景气度 / 授信友好度 → 星级描述。
export function starLevelFromScore(score) {
  if (score >= 85) return { stars: 5, label: 'very-strong', text: '强' };
  if (score >= 75) return { stars: 4, label: 'strong', text: '偏强' };
  if (score >= 60) return { stars: 3, label: 'normal', text: '中性' };
  if (score >= 45) return { stars: 2, label: 'weak', text: '偏弱' };
  return { stars: 1, label: 'very-weak', text: '弱' };
}

export function creditFriendlyFromScore(score) {
  if (score >= 85) return { stars: 5, text: '高' };
  if (score >= 75) return { stars: 4, text: '较高' };
  if (score >= 60) return { stars: 3, text: '中等' };
  if (score >= 45) return { stars: 2, text: '偏低' };
  return { stars: 1, text: '低' };
}

export function factFor(level1, level2) {
  return SEGMENT_FACTS[`${level1}|${level2}`] || null;
}
