// 储能产业链「分析」模块 · 报告生成模型。
// 设计原则：
// 1) 纯 ESM、无浏览器 / Node 专属 API，可被生成脚本（scripts/prepare-analysis-mock.mjs）、
//    前端页面与单测共用同一份逻辑；
// 2) 企业口径以产业链源数据（storage-chain.json）为权威：二级环节归属、上市标记、
//    属地、主营产品、真实分层（龙头 / 核心主业）全部取自入链表，不另行编造；
//    storage-credit-mock.json 只用于「授信评价得分」与企业画像跳转的关联；
// 3) 推算口径确定：市场规模、产能、集中度、企业份额等演示数据由「知识库参数 + 种子随机」
//    推算，同一输入必然得到同一输出，便于校验与回归；
// 4) 数值之间必须自洽：规模序列与增速一致、产量与利用率一致、CR3 < CR5 < CR10 单调。
import { evaluateCompany } from '../credit/creditEngine.js';
import {
  PROSPERITY_WEIGHTS,
  SEGMENT_FACTS,
  creditFriendlyFromScore,
  starLevelFromScore,
} from './analysisSegmentFacts.js';

export const ANALYSIS_SCHEMA_VERSION = 2;
export const ANALYSIS_INDUSTRY = '储能产业';
export const MOCK_NOTE =
  '企业数量、上市家数、地区分布、主营产品与企业名单来自入链表 / 客户清单入库结果；行业规模、产能、集中度、企业份额等为演示数据，接入行情与行业协会数据库后可直接替换。';

const HISTORY_YEARS = [2022, 2023, 2024, 2025];
const FORECAST_YEARS = [2026, 2027, 2028, 2029, 2030];
const CURRENT_YEAR = 2025;

// ---------------------------------------------------------------- 基础工具

function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32：确定性伪随机，保证同一环节每次生成结果一致。
function createRandom(seedText) {
  let state = hashSeed(seedText);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function level2ModelType(level1) {
  // 算力产业：芯片/设备/基础设施/服务四段的现金流形态差异明显，单独建模。
  if (level1 === '算力芯片与核心器件') return 'computeDevice';
  if (level1 === '算力设备与网络') return 'computeManufacture';
  if (level1 === '算力基础设施') return 'computeEngineering';
  if (level1 === '算力服务与运营') return 'computeOperation';
  if (level1 === '资源与材料') return 'material';
  if (level1 === '核心电子器件' || level1 === '核心装备' || level1 === '检测认证与标准') {
    return 'device';
  }
  if (level1 === '电池与核心部件') return 'manufacture';
  if (level1 === '系统集成与工程建设') return 'engineering';
  return 'operation';
}

const MODEL_TYPE_LABEL = {
  computeDevice: '芯片器件型',
  computeManufacture: '设备制造型',
  computeEngineering: '基础设施工程型',
  computeOperation: '算力运营服务型',
  material: '材料制造型',
  device: '器件装备型',
  manufacture: '规模制造型',
  engineering: '工程与集成型',
  operation: '运营与应用型',
};

// 按环节类型给出不同的经营与授信特征描述，避免所有环节共用一套话术。
const MODEL_TYPE_TRAITS = {
  computeDevice: {
    advantage: '架构迭代能力与生态适配记录',
    pressure: '流片成本高企、推理卡价格年降与客户验证周期长',
    creditFocus: '研发资本化比例、量产良率、大客户集中度与存货跌价',
    cashNote: '流片与备货前置、收入确认滞后，经营现金流波动大于利润',
  },
  computeManufacture: {
    advantage: '规模交付能力与头部客户认证',
    pressure: '上游芯片与存储涨价、下游集采压价的双向挤压',
    creditFocus: '存货周转、订单覆盖率、应收账期与客户集中度',
    cashNote: '备货与账期占用大，营收增长越快营运资金缺口越明显',
  },
  computeEngineering: {
    advantage: '核心区位资源与长期租约',
    pressure: '上架率不足、电价与能耗政策变化、资本开支超支',
    creditFocus: '上架率、DSCR、债务期限匹配与在建工程转固',
    cashNote: '前期投入大、回收周期长，现金流高度依赖租约落地',
  },
  computeOperation: {
    advantage: '客户资源与异构算力调度能力',
    pressure: '算力价格下行、利用率不足与设备技术迭代',
    creditFocus: '利用率、设备残值、客户真实性与预收款挪用',
    cashNote: '预收与账期并存，收入确认与回款节奏需穿透核查',
  },
  material: {
    advantage: '资源自给率与一体化成本优势',
    pressure: '加工费与价格波动直接冲击毛利',
    creditFocus: '存货跌价、套期保值覆盖率与资源端资本开支节奏',
    cashNote: '价格波动传导快，存货与应收账款对现金流影响显著',
  },
  device: {
    advantage: '客户验证记录与研发迭代能力',
    pressure: '客户年降与老产品降价压力持续',
    creditFocus: '客户验证进度、产线专用性与存货跌价',
    cashNote: '账期较长且验收节点集中，收入确认与回款存在时滞',
  },
  manufacture: {
    advantage: '规模效应与产线利用率',
    pressure: '价格战与产能利用率不足的双重挤压',
    creditFocus: '产能利用率、存货周转与单一客户集中度',
    cashNote: '重资产特征明显，折旧与资本开支对现金流占用大',
  },
  engineering: {
    advantage: '项目交付经验与融资能力',
    pressure: '垫资比例上升与工程款结算周期拉长',
    creditFocus: '垫资比例、应收账款账龄与业主信用',
    cashNote: '现金流呈"先出后进"，回款节奏决定流动性安全',
  },
  operation: {
    advantage: '项目资源与运行数据积累',
    pressure: '收益机制变化带来的 IRR 波动',
    creditFocus: 'DSCR 覆盖倍数、调用小时数与收益机制文件',
    cashNote: '运营期现金流相对平稳，但前期投入回收周期长',
  },
};

const RISK_LEVEL_SCORE = { 低: 0.9, 较低: 0.82, 中等: 0.62, 中等偏高: 0.45, 较高: 0.35, 高: 0.22 };

// 阶段关键词 → 景气度修正，避免为 24 个环节单独维护一张表。
function stageScore(stage) {
  const text = stage || '';
  let score = 0.62;
  for (const [keyword, delta] of [
    ['高增长', 0.16],
    ['红利', 0.14],
    ['放量', 0.12],
    ['加速', 0.1],
    ['成型', 0.08],
    ['修复', 0.08],
    ['提升', 0.06],
    ['规范', 0.04],
    ['平衡', 0.02],
    ['调整', -0.04],
    ['整合', -0.05],
    ['压力', -0.1],
    ['承压', -0.12],
    ['出清', -0.12],
    ['过剩', -0.16],
    ['淘汰', -0.16],
    ['验证', -0.08],
    ['孵化', -0.06],
  ]) {
    if (text.includes(keyword)) score += delta;
  }
  return clamp(score, 0.25, 0.95);
}

// ---------------------------------------------------------------- 企业口径

const GRADE_RANK = { 核心主业: 3, 相关重要: 2, 边缘观察: 1 };
const TIER_RANK = { leader: 3, core: 2, tail: 1 };

// 与授信模块按「证券代码 → 公司全称 → 简称」三级关联，用于取授信评价得分与画像跳转。
export function buildCreditLookup(creditCompanies) {
  const byCode = new Map();
  const byFullName = new Map();
  const byName = new Map();
  for (const company of creditCompanies) {
    if (company.stockCode) byCode.set(String(company.stockCode).trim(), company);
    byFullName.set(company.name, company);
    const short = company.stockShort || company.name.replace(/(股份有限公司|有限公司|集团)$/, '');
    if (!byName.has(short)) byName.set(short, company);
  }
  return { byCode, byFullName, byName };
}

export function matchCreditCompany(chainCompany, lookup) {
  if (!lookup) return null;
  return (
    (chainCompany.code && lookup.byCode.get(String(chainCompany.code).trim())) ||
    (chainCompany.fullName && lookup.byFullName.get(chainCompany.fullName)) ||
    lookup.byName.get(chainCompany.name) ||
    null
  );
}

function provinceOf(company) {
  return company.territory?.province || company.region?.province || '未标注地区';
}

// 主要企业排序：客户清单真实分层优先（核心主业 > 相关重要，龙头 > 核心），
// 同层级再按产业链关系数（真实数据，反映链上地位）与授信评价得分排序。
// 仅按产业链分层排序（不接授信得分），用于区域明细里的重点企业名单。
function chainRank(companies) {
  return [...companies].sort((a, b) => {
    const gradeDiff = (GRADE_RANK[b.grade] || 0) - (GRADE_RANK[a.grade] || 0);
    if (gradeDiff !== 0) return gradeDiff;
    const tierDiff = (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0);
    if (tierDiff !== 0) return tierDiff;
    return (b.relationCount || 0) - (a.relationCount || 0);
  });
}

function rankCompanies(companies, lookup) {
  return [...companies].sort((a, b) => {
    const gradeDiff = (GRADE_RANK[b.grade] || 0) - (GRADE_RANK[a.grade] || 0);
    if (gradeDiff !== 0) return gradeDiff;
    const tierDiff = (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0);
    if (tierDiff !== 0) return tierDiff;
    const relationDiff = (b.relationCount || 0) - (a.relationCount || 0);
    if (relationDiff !== 0) return relationDiff;
    const creditA = matchCreditCompany(a, lookup);
    const creditB = matchCreditCompany(b, lookup);
    const scoreA = creditA?.evaluated ? evaluateCompany(creditA).total : -1;
    const scoreB = creditB?.evaluated ? evaluateCompany(creditB).total : -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
}

// 省级行政区名称判定：源数据中含「境外注册(开曼)」等非行政区注册地，
// 这些企业无法落到区域地图上，单独统计并在区域说明中提示，不进入区域榜单。
const PROVINCE_NAME_PATTERN = /(省|市|自治区|特别行政区)$/;

function isProvinceLevel(name) {
  return PROVINCE_NAME_PATTERN.test(name || '');
}

function provinceStats(companies) {
  const bucket = new Map();
  let excluded = 0;
  let total = 0;
  for (const company of companies) {
    const province = provinceOf(company);
    if (!isProvinceLevel(province)) {
      excluded += 1;
      continue;
    }
    total += 1;
    bucket.set(province, (bucket.get(province) || 0) + 1);
  }
  const denominator = total || 1;
  const list = [...bucket.entries()]
    .map(([province, count]) => ({
      province,
      companies: count,
      share: round((count / denominator) * 100, 1),
    }))
    .sort((a, b) => b.companies - a.companies || a.province.localeCompare(b.province, 'zh'));
  return { list, total, excluded };
}

// ---------------------------------------------------------------- 报告各章节

function buildMarket(fact, random) {
  const { china, global: globalSize, growth, cagr, stage, stageNote } = fact.market;
  const growthSeries = [];
  let growthCursor = growth;
  for (let index = HISTORY_YEARS.length - 1; index >= 0; index -= 1) {
    growthSeries[index] = round(growthCursor, 1);
    if (index > 0) growthCursor = round(growth - (random() * 2.4 + 0.6), 1);
  }
  const chinaSeries = new Array(HISTORY_YEARS.length);
  chinaSeries[HISTORY_YEARS.length - 1] = china;
  for (let index = HISTORY_YEARS.length - 2; index >= 0; index -= 1) {
    // 保留 1 位小数：小体量环节按整数取整会放大反推误差，导致序列与增速不一致。
    chinaSeries[index] = round(chinaSeries[index + 1] / (1 + growthSeries[index + 1] / 100), 1);
  }
  const forecast = [];
  for (let index = 0; index < FORECAST_YEARS.length; index += 1) {
    forecast.push(round(china * (1 + cagr / 100) ** (index + 1), 1));
  }
  const globalSeries = chinaSeries.map((value, index) =>
    round(value * (globalSize / china) * (1 + (index % 2 === 0 ? 0.01 : -0.01))),
  );
  return {
    years: HISTORY_YEARS,
    china: chinaSeries,
    chinaLatest: china,
    global: globalSeries,
    chinaGrowth: growthSeries,
    forecastYears: FORECAST_YEARS,
    forecast,
    cagr,
    growth,
    stage,
    stageNote,
    demandMix: fact.market.demandMix.map(([label, share]) => ({ label, share })),
    drivers: [...fact.market.drivers],
    unit: '亿元',
    globalUnit: '亿元',
    tam: {
      tam: globalSize,
      sam: china,
      note: `全球口径 ${globalSize} 亿元，中国口径 ${china} 亿元；SAM 取中国大陆可服务市场，不含海外本地化生产部分。`,
    },
  };
}

function buildCapacity(fact, random, market) {
  const { unit, nominal, utilization, underConstruction, planned, retired, demandRatio } =
    fact.capacity;
  const effective = round(nominal * (0.93 + random() * 0.04));
  const output = round((nominal * utilization) / 100);
  const demand = round(nominal * demandRatio);
  const gap = round(demand - output);
  const years = [2023, 2024, 2025, 2026, 2027];
  const currentIndex = years.indexOf(CURRENT_YEAR);
  // 以参考年（2025）为锚点：历史年份反推，预测年份按在建与规划产能释放推算。
  const nominalSeries = years.map((_, index) => {
    if (index === currentIndex) return nominal;
    if (index < currentIndex) return round(nominal / 1.1 ** (currentIndex - index));
    return round(nominal * (1 + 0.06 + (index - currentIndex) * 0.01));
  });
  const utilizationSeries = years.map((_, index) => {
    if (index === currentIndex) return utilization;
    if (index < currentIndex) {
      return round(clamp(utilization + (currentIndex - index) * (1.5 + random() * 2), 30, 96), 1);
    }
    return round(clamp(utilization - (index - currentIndex) * (2 + random() * 3), 30, 95), 1);
  });
  const demandSeries = years.map((_, index) => {
    if (index === currentIndex) return demand;
    if (index < currentIndex) return round(demand / 1.13 ** (currentIndex - index));
    return round(demand * 1.12 ** (index - currentIndex));
  });
  return {
    unit,
    nominal,
    effective,
    output,
    demand,
    utilization,
    underConstruction,
    planned,
    retired,
    newAdded: round(nominal * 0.12),
    gap,
    balance: fact.capacity.verdict,
    riskLevel: fact.capacity.riskLevel,
    outlook: fact.capacity.outlook,
    years,
    nominalSeries,
    utilizationSeries,
    demandSeries,
    judgement: [
      { label: '产能风险', value: fact.capacity.riskLevel },
      { label: '供需状态', value: fact.capacity.verdict },
      { label: '未来判断', value: fact.capacity.outlook },
    ],
    marketLink: `按当期规模 ${market.chinaLatest} 亿元与名义产能 ${nominal}${unit} 折算，单位产能对应市场规模约 ${round(
      (market.chinaLatest * 10000) / Math.max(nominal, 1),
      1,
    )} 万元。`,
  };
}

function buildRegions(fact, listedCompanies, random, capacity) {
  const isCompute = String(
    fact.level1 || Object.keys(SEGMENT_FACTS).find((key) => SEGMENT_FACTS[key] === fact) || '',
  ).startsWith('算力');
  const { list: provinceList, excluded } = provinceStats(listedCompanies);
  const totalCompanies = provinceList.reduce((sum, item) => sum + item.companies, 0) || 1;
  // 该省重点企业：按产业链分层（核心主业 → 龙头 → 关系数）取前 5 家，
  // 独立于「主要企业榜」的全国前 12 家，避免非头部省份明细为空。
  const keyCompaniesOf = (province) =>
    chainRank(listedCompanies.filter((company) => provinceOf(company) === province))
      .slice(0, 5)
      .map((company) => ({
        name: company.name,
        grade: company.grade || '—',
        tierLabel: company.tierLabel || '—',
      }));
  const regions = provinceList.slice(0, 8).map((item, index) => {
    const cluster = fact.clusters.find((entry) => entry.province === item.province);
    const weight = item.companies * (1 + (index === 0 ? 0.12 : 0) + random() * 0.06);
    const capacityShare = clamp(weight / totalCompanies, 0.02, 0.6);
    return {
      province: item.province,
      companies: item.companies,
      share: item.share,
      capacity: round(capacity.nominal * capacityShare),
      output: round(capacity.nominal * capacityShare * (capacity.utilization / 100)),
      capacityUnit: capacity.unit,
      clusters: cluster
        ? [cluster.park]
        : [`${item.province}${isCompute ? '算力' : '储能'}产业集聚区`],
      keyCompanies: keyCompaniesOf(item.province),
      policy: isCompute
        ? `${item.province}已将算力基础设施纳入省级重点方向，围绕用地、用能指标与算力补贴给予配套支持。`
        : `${item.province}已将新型储能列入省级重点产业方向，围绕用地、并网与容量补偿给予配套支持。`,
      completeness:
        item.companies >= 20
          ? '高'
          : item.companies >= 10
            ? '中高'
            : item.companies >= 4
              ? '中'
              : '偏低',
      risk:
        item.companies >= 20
          ? '集群内同质化竞争明显，需关注中小企业的价格战与账期传导'
          : item.companies >= 8
            ? '产业链配套基本齐全，主要风险在配套环节的产能利用率'
            : '产业规模偏小，配套不完整，项目落地依赖外部供应',
      concentration:
        index === 0 ? '高' : item.companies >= 12 ? '中高' : item.companies >= 5 ? '中' : '低',
    };
  });
  const topShare = round(
    regions.reduce((sum, item) => sum + item.share, 0),
    1,
  );
  return {
    total: listedCompanies.length,
    totalDomestic: totalCompanies,
    excluded,
    regions,
    topShare,
    topProvinces: regions.slice(0, 3).map((item) => item.province),
    clusters: fact.clusters.map((entry) => entry.park),
    note: `入库上市企业 ${listedCompanies.length} 家分布于 ${provinceList.length} 个省级地区，前 ${regions.length} 个地区集中了 ${topShare}%，产业集聚特征明显。${
      excluded ? `另有 ${excluded} 家企业注册地在境外，未计入区域分布。` : ''
    }`,
  };
}

function buildCompanySection(fact, listedCompanies, market, capacity, lookup, level1) {
  const ranked = rankCompanies(listedCompanies, lookup).slice(0, 12);
  // 行业集中度以 CR3 为锚，其余名次按同一条幂律曲线折算：
  // 尾部份额按「CR10 不超过 92%」反算缩放系数，保证 CR3 < CR5 < CR10 单调且不越界。
  const cr3 = round(fact.concentration * 100, 1);
  const weightAt = (index) => 1 / (index + 1) ** 0.92;
  const top3Weight = weightAt(0) + weightAt(1) + weightAt(2);
  let tailWeight = 0;
  for (let index = 3; index <= 9; index += 1) tailWeight += weightAt(index) / top3Weight;
  const tailScale = Math.min(0.6, Math.max(0.08, (92 - cr3) / (cr3 * tailWeight)));
  const shareAt = (index) => (cr3 * weightAt(index) * (index < 3 ? 1 : tailScale)) / top3Weight;
  const rows = ranked.map((company, index) => {
    const share = round(shareAt(index), 1);
    const creditCompany = matchCreditCompany(company, lookup);
    return {
      id: creditCompany?.id || null,
      name: company.fullName || company.name,
      short: company.name,
      province: provinceOf(company),
      city: company.territory?.city || '',
      // 兼容两套企业档案：储能事实册用 code，算力事实册直接带链数据全量行（stockCode / companyType）。
      listed: Boolean(company.code || company.stockCode || company.companyType === 'listed'),
      product: company.products || '—',
      grade: company.grade || '—',
      headTier: company.tierLabel || '—',
      capacity: round((capacity.nominal * share) / 100),
      capacityUnit: capacity.unit,
      revenue: round((market.chinaLatest * share) / 100),
      revenueUnit: '亿元',
      share,
      score: creditCompany?.evaluated ? evaluateCompany(creditCompany).total : null,
      verdict: index === 0 ? '龙头' : index <= 2 ? '重点' : index <= 7 ? '成长' : '跟随',
    };
  });
  const sumShares = (count) => {
    let total = 0;
    for (let index = 0; index < count; index += 1) total += shareAt(index);
    return round(total, 1);
  };
  const cr5 = sumShares(5);
  const cr10 = sumShares(10);
  const years = [2022, 2023, 2024, 2025, 2026];
  const cr5Series = years.map((_, index) => round(cr5 * (0.86 + index * 0.035), 1));
  const trendSlope = round(cr5Series[cr5Series.length - 1] - cr5Series[0], 1);
  return {
    count: listedCompanies.length,
    listed: listedCompanies.filter(
      (company) => company.code || company.stockCode || company.companyType === 'listed',
    ).length,
    leaderCount: listedCompanies.filter((company) => company.tier === 'leader').length,
    coreCount: listedCompanies.filter((company) => company.tier === 'core').length,
    coreMainCount: listedCompanies.filter((company) => company.grade === '核心主业').length,
    // 重点企业 = 龙头层级或核心主业（去重计数，避免同时满足两个条件被重复统计）。
    keyCount: listedCompanies.filter(
      (company) => company.tier === 'leader' || company.grade === '核心主业',
    ).length,
    cr3,
    cr5,
    cr10,
    crYears: years,
    cr5Series,
    verdict:
      trendSlope >= 6
        ? '龙头集中度提升'
        : trendSlope >= 2
          ? '集中度缓慢提升'
          : trendSlope >= -2
            ? '行业格局相对分散'
            : '尾部出清、集中度回落',
    verdictNote:
      trendSlope >= 2
        ? `CR5 由 ${cr5Series[0]}% 升至 ${cr5Series[cr5Series.length - 1]}%，头部企业凭借${MODEL_TYPE_TRAITS[level2ModelType(level1)].advantage}持续扩大份额。`
        : '行业尚未形成稳定格局，竞争者众多，价格竞争仍是主要竞争手段。',
    list: rows,
    regionTop: provinceStats(listedCompanies).list.slice(0, 5),
    boardMix: [
      { label: '上交所', count: listedCompanies.filter((c) => c.board === '上交所').length },
      { label: '深交所', count: listedCompanies.filter((c) => c.board === '深交所').length },
      { label: '北交所', count: listedCompanies.filter((c) => c.board === '北交所').length },
      {
        label: '其他 / 境外',
        count: listedCompanies.filter((c) => !['上交所', '深交所', '北交所'].includes(c.board))
          .length,
      },
    ].filter((item) => item.count > 0),
  };
}

function buildTechnology(fact) {
  const byShare = [...fact.tech].sort((a, b) => b.share - a.share);
  const fastest = [...fact.tech]
    .filter((route) => route.growth === '高')
    .sort((a, b) => a.share - b.share)[0];
  return {
    routes: fact.tech.map((route) => ({ ...route })),
    mainstream: byShare[0]?.route || '—',
    fastestGrowing: fastest
      ? `${fastest.route}（市占率 ${fastest.share}%，成长性最高）`
      : byShare[0]?.route || '—',
    highestRisk: [...fact.tech].find((route) => route.risk === '高')?.route || '暂无高替代风险路线',
    note: '技术替代风险不与企业研发投入高低直接挂钩：研发投入高但路线选择错误的企业，其技术风险反而更高，授信应以「路线市占率变化 + 客户验证记录」为准。',
  };
}

function buildHighlights(fact, context) {
  const traits = MODEL_TYPE_TRAITS[level2ModelType(context.level1)];
  return fact.highlights.map((item) => ({
    title: item.title,
    phenomenon: item.phenomenon,
    reason: item.reason,
    industry: item.industry,
    company: `企业层面：${traits.advantage}在此过程中价值放大，拥有该能力的企业份额与议价能力同步提升；反之，${traits.pressure}的企业将首先承压。`,
    credit: `授信层面：${traits.creditFocus}是判断该变化能否转化为还款能力的关键，需在授信条件中设置对应的监控指标。`,
    chain: `${context.level1} → ${context.level2}`,
  }));
}

function buildTrends(fact, context) {
  const traits = MODEL_TYPE_TRAITS[level2ModelType(context.level1)];
  const templates = {
    demand:
      '需求端确定性较好，可对产能匹配度高、在手订单充足的企业适度延长授信期限；但须同步盯住产能利用率与库存水位，避免"以销定产"变成"以产定贷"。',
    supply:
      '供给过剩期内应严格控制产能扩张类授信，优先支持技改、降本与环保类项目；对在建项目要评估投产时点与届时价格水平，防止"投产即亏损"。',
    concentration:
      '采取名单制管理：额度向头部集中，对中尾部企业限额使用、逐笔审批，并提高增信要求。',
    technology:
      '技术路线切换期要关注产线专用性与贬值速度，避免为单一旧技术路线提供长期限贷款；对新路线投入应以客户验证进度作为放款前提。',
    profit:
      '盈利波动加大，授信条件应与现金流指标挂钩，设置毛利率、产能利用率、存货周转等触发条款，触发即重检。',
    policy:
      '政策敏感度高，授信期限宜与政策周期匹配，避免跨政策周期的大额长期敞口；同时跟踪补偿标准与市场规则的调整幅度。',
    overseas:
      '海外业务需配套信用证、出口信用保险与汇率对冲，控制国别与履约敞口，并按项目逐笔核算真实回款。',
  };
  return fact.trends.map((trend) => ({
    ...trend,
    credit: `授信含义：${templates[trend.kind] || templates.profit}`,
    factors: `${context.level2}当前规模增速 ${context.market.growth}%、产能利用率 ${context.capacity.utilization}%、CR3 ${context.companies.cr3}%，${traits.cashNote}。`,
  }));
}

function buildCredit(fact, context) {
  const traits = MODEL_TYPE_TRAITS[level2ModelType(context.level1)];
  return {
    rating: fact.credit.rating,
    ratingNote: `结论依据：需求增速 ${context.market.cagr}%（CAGR）、产能利用率 ${context.capacity.utilization}%、供需状态「${context.capacity.balance}」、CR3 ${context.companies.cr3}%，结合 ${MODEL_TYPE_LABEL[level2ModelType(context.level1)]} 的现金流特征给出。`,
    entries: fact.credit.entries,
    strategy: fact.credit.strategy,
    firstRepayment: fact.credit.firstRepayment,
    coreRisks: fact.credit.coreRisks,
    conditions: fact.credit.conditions,
    focus: traits.creditFocus,
    cashNote: traits.cashNote,
    exit: '触发条件：产能利用率连续两季低于 50%、应收账款账龄超过 1 年占比高于 30%、重大安全或环保事故、核心客户流失，任一触发即启动额度重检。',
  };
}

function buildScores(fact, context) {
  const utilization = context.capacity.utilization / 100;
  const riskScore = RISK_LEVEL_SCORE[fact.capacity.riskLevel] ?? 0.55;
  const prosperity = {
    demandGrowth: clamp(fact.market.cagr / 30, 0.3, 1),
    supplyDemand: clamp(utilization * 0.85 + (riskScore - 0.5) * 0.3, 0.2, 1),
    priceTrend: stageScore(fact.market.stage),
    profitability: clamp(riskScore * 0.7 + stageScore(fact.market.stage) * 0.3, 0.2, 1),
    technology: clamp(stageScore(fact.market.stage) * 0.8 + 0.15, 0.25, 1),
    policy: clamp(
      0.72 +
        (fact.market.stage.includes('红利') ? 0.15 : 0) +
        (fact.market.stage.includes('规范') ? 0.08 : 0),
      0.4,
      1,
    ),
    competition: clamp(0.45 + fact.concentration * 0.8, 0.3, 1),
  };
  const industryScore = Math.round(
    Object.entries(normalizedWeights(prosperity)).reduce(
      (sum, [key, weight]) => sum + prosperity[key] * weight,
      0,
    ) * 100,
  );
  const type = level2ModelType(context.level1);
  const typeFactor = {
    material: 0.62,
    device: 0.66,
    manufacture: 0.68,
    engineering: 0.5,
    operation: 0.72,
  }[type];
  const friendlyFactors = {
    cashflow: typeFactor + (fact.capacity.riskLevel === '低' ? 0.14 : 0),
    cycle: clamp(1 - Math.abs(fact.market.growth - fact.market.cagr) / 40, 0.4, 1),
    collateral: clamp(typeFactor + 0.1, 0.4, 1),
    order: clamp(utilization * 0.9 + 0.08, 0.3, 1),
    concentration: clamp(fact.concentration + 0.25, 0.4, 1),
    projectReturn: type === 'operation' ? 0.72 : type === 'engineering' ? 0.45 : 0.6,
    policy: clamp(0.7 + (fact.market.stage.includes('红利') ? 0.14 : 0), 0.4, 1),
  };
  const creditFriendlyScore = Math.round(
    (Object.values(friendlyFactors).reduce((sum, value) => sum + value, 0) /
      Object.keys(friendlyFactors).length) *
      100,
  );
  return {
    industryScore,
    creditFriendlyScore,
    prosperity: Object.entries(prosperity).map(([key, value]) => ({
      key,
      score: Math.round(value * 100),
      weight: PROSPERITY_WEIGHTS[key],
    })),
    industryStage: fact.market.stage,
    stageNote: fact.market.stageNote,
    prosperityMeta: starLevelFromScore(industryScore),
    friendlyMeta: creditFriendlyFromScore(creditFriendlyScore),
  };
}

// 权重表兜底：知识库权重键缺失时按指标数量均分，保证评分不出现 NaN。
function normalizedWeights(prosperity) {
  const keys = Object.keys(prosperity);
  const total = keys.reduce((sum, key) => sum + (PROSPERITY_WEIGHTS[key] || 0), 0);
  if (total <= 0) {
    return Object.fromEntries(keys.map((key) => [key, 1 / keys.length]));
  }
  return Object.fromEntries(keys.map((key) => [key, (PROSPERITY_WEIGHTS[key] || 0) / total]));
}

function buildConclusions(context) {
  const { fact, market, capacity, companies, regions, scores, level2 } = context;
  const topDemand = [...market.demandMix].sort((a, b) => b.share - a.share)[0];
  return [
    {
      index: '01',
      title: '行业规模',
      text: `${level2}中国市场规模 ${market.chinaLatest} 亿元，同比 +${market.growth}%，2026—2030 年 CAGR 约 ${market.cagr}%；需求主要来自${topDemand.label}（占比 ${topDemand.share}%）。`,
    },
    {
      index: '02',
      title: '供需',
      text: `名义产能 ${capacity.nominal}${capacity.unit}，产能利用率 ${capacity.utilization}%，供需判断为「${capacity.balance}」；${capacity.outlook}`,
    },
    {
      index: '03',
      title: '区域',
      text: `上市企业集中在${regions.topProvinces.join('、')}，前 ${regions.regions.length} 个地区合计占 ${regions.topShare}%，主要集聚区包括${regions.clusters.slice(0, 3).join('、')}。`,
    },
    {
      index: '04',
      title: '技术',
      text: `主流路线为${context.technology.mainstream}，成长最快的是${context.technology.fastestGrowing}；需重点跟踪的替代风险路线为${context.technology.highestRisk}。`,
    },
    {
      index: '05',
      title: '竞争',
      text: `入库上市企业 ${companies.count} 家，CR3 ${companies.cr3}%、CR5 ${companies.cr5}%、CR10 ${companies.cr10}%，判断为「${companies.verdict}」。`,
    },
    {
      index: '06',
      title: '授信',
      text: `行业授信评级「${fact.credit.rating}」，建议采取「${fact.credit.strategy[0].tier}优先、${fact.credit.strategy[3].tier}控制」的名单制策略，核心风控指标为${fact.credit.coreRisks.slice(0, 4).join('、')}；行业景气度 ${scores.industryScore}/100、授信友好度 ${scores.creditFriendlyScore}/100。`,
    },
  ];
}

// ---------------------------------------------------------------- 入口

export function buildSegmentReport({
  level1,
  level2,
  level1Meta,
  childMeta,
  listedCompanies,
  creditPool,
  lookup,
}) {
  const key = `${level1}|${level2}`;
  const fact = SEGMENT_FACTS[key];
  if (!fact) throw new Error(`缺少二级环节知识库：${key}`);
  const random = createRandom(key);
  const market = buildMarket(fact, random);
  const capacity = buildCapacity(fact, random, market);
  const regions = buildRegions(fact, listedCompanies, random, capacity);
  const companySection = buildCompanySection(
    fact,
    listedCompanies,
    market,
    capacity,
    lookup,
    level1,
  );
  const nonListedPool = (creditPool || []).filter(
    (company) => !company.listed && !listedCompanies.some((item) => item.fullName === company.name),
  ).length;
  const context = { level1, level2, fact, market, capacity, regions, companies: companySection };
  const technology = buildTechnology(fact);
  const scores = buildScores(fact, context);
  const fullContext = { ...context, technology, scores };
  return {
    key,
    level1,
    level2,
    // 显示名：单独构建时等于二级环节名，整表构建时若重名会补一级环节前缀（见 buildAnalysisDataset）。
    level2Display: level2,
    level1Code: level1Meta?.code || '',
    level1Note: level1Meta?.note || '',
    level2Code: childMeta?.code2 || '',
    level2Note: childMeta?.note || '',
    position: level1Meta?.position || '',
    reportYear: 2026,
    referenceYear: CURRENT_YEAR,
    updatedAt: '2026-10-07',
    isMock: true,
    mockNote: MOCK_NOTE,
    modelType: level2ModelType(level1),
    modelTypeLabel: MODEL_TYPE_LABEL[level2ModelType(level1)],
    oneLiner: fact.oneLiner,
    overview: {
      marketSize: market.chinaLatest,
      marketSizeUnit: market.unit,
      growthRate: market.growth,
      cagr: market.cagr,
      companyCount: listedCompanies.length + nonListedPool,
      listedCount: companySection.listed,
      keyCompanyCount: companySection.keyCount,
      capacity: capacity.nominal,
      capacityUnit: capacity.unit,
      capacityUtilization: capacity.utilization,
      industryScore: scores.industryScore,
      creditFriendlyScore: scores.creditFriendlyScore,
      industryStage: scores.industryStage,
      rating: fact.credit.rating,
      cr3: companySection.cr3,
    },
    market,
    regions,
    capacity,
    highlights: buildHighlights(fact, fullContext),
    technology,
    companies: companySection,
    trends: buildTrends(fact, fullContext),
    riskTags: fact.risks,
    credit: buildCredit(fact, fullContext),
    scores,
    conclusions: buildConclusions(fullContext),
  };
}

// 一级环节上市企业数（去重后计数）。
function listedCompaniesOfLevel(chainCompanies, levelLabel) {
  return new Set(
    chainCompanies
      .filter((company) => (company.level1 || []).includes(levelLabel))
      .map((company) => company.fullName || company.name),
  ).size;
}

// 由产业链源数据 + 客户清单入库数据生成整条产业链的分析数据集（储能 / 算力共用）。
export function buildAnalysisDataset({ chain, credit, generatedAt }) {
  if (!chain?.levels?.length) throw new Error('产业链数据缺失：chain.levels 为空');
  const creditCompanies = credit?.companies || [];
  const chainCompanies = chain.companies || [];
  const lookup = buildCreditLookup(creditCompanies);
  const index = [];
  const segments = [];
  for (const level of chain.levels) {
    const children = [];
    for (const child of level.children || []) {
      // 二级归属以产业链源数据为准（一家企业可同时归属多个二级环节）。
      const listedCompanies = chainCompanies.filter(
        (company) =>
          (company.level1 || []).includes(level.label) &&
          (company.level2 || []).includes(child.label),
      );
      const creditPool = creditCompanies.filter(
        (company) => company.chain === level.label && company.sector === child.label,
      );
      const report = buildSegmentReport({
        level1: level.label,
        level2: child.label,
        level1Meta: level,
        childMeta: child,
        listedCompanies,
        creditPool,
        lookup,
      });
      segments.push(report);
      children.push({
        key: report.key,
        code: child.code2 || '',
        label: child.label,
        note: child.note || '',
        order: child.order,
        companyCount: report.overview.companyCount,
        listedCount: report.overview.listedCount,
        industryScore: report.overview.industryScore,
        creditFriendlyScore: report.overview.creditFriendlyScore,
        rating: report.overview.rating,
      });
    }
    index.push({
      code: level.code,
      label: level.label,
      position: level.position,
      note: level.note || '',
      // 一级环节企业数以入链表口径为准（一家企业可归属多个二级环节，不做求和避免重复计算）。
      companyCount: level.companyCount ?? listedCompaniesOfLevel(chainCompanies, level.label),
      children,
    });
  }
  // 二级环节名在全局可能重复（如「检测认证与标准」同时归属两个一级环节），
  // 这些环节的报告标题与导出文件名补上一级环节前缀，避免出现两份同名报告。
  const level2NameCount = new Map();
  for (const segment of segments) {
    level2NameCount.set(segment.level2, (level2NameCount.get(segment.level2) || 0) + 1);
  }
  const displayByKey = new Map();
  for (const segment of segments) {
    const display =
      (level2NameCount.get(segment.level2) || 0) > 1
        ? `${segment.level1} · ${segment.level2}`
        : segment.level2;
    segment.level2Display = display;
    displayByKey.set(segment.key, display);
  }
  for (const level of index) {
    for (const child of level.children) {
      child.displayLabel = displayByKey.get(child.key) || child.label;
    }
  }
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    generatedAt: generatedAt || '2026-10-07',
    industry: chain.industry || ANALYSIS_INDUSTRY,
    reportYear: 2026,
    referenceYear: CURRENT_YEAR,
    isMock: true,
    mockNote: MOCK_NOTE,
    sourceNote:
      '产业链环节、上市企业与属地口径来自《上市企业入链表》《客户清单》入库结果，行业规模与产能等为演示数据。',
    level1Count: index.length,
    level2Count: segments.length,
    index,
    segments,
  };
}

// 报告 key → 环节索引，供页面 O(1) 取用。
export function indexSegments(dataset) {
  const byKey = new Map();
  for (const segment of dataset.segments) byKey.set(segment.key, segment);
  return byKey;
}
