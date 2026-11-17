// 算力产业 · 项目授信评价引擎
//
// 项目池由「在链企业 + 环节」确定性地推演：同一企业、同一项目类型的输入恒定，
// 输出恒定，便于页面回归与演示。项目名称、投资额、DSCR 等为推演样本，
// 用于验证「合规要素 → 需求消纳 → 财务偿债 → 技术建设 → 主体增信」的评价流程，
// 不作为真实项目信息；实际评审须以立项、备案、可研与租约等材料替换。

import { formatWan } from './creditEngine.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

function hashSeed(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 项目类型：按环节确定可承做的项目形态、投资强度与现金流特征
// ---------------------------------------------------------------------------

export const PROJECT_TYPES = {
  idc_build: {
    key: 'idc_build',
    label: '智算中心新建',
    short: '智算中心',
    sectors: ['IDC与智算中心'],
    count: 22,
    capex: [8e8, 6e9],
    revenuePerCapex: 0.27,
    ebitdaMargin: 0.55,
    tenor: [8, 12],
    buildMonths: [12, 24],
    hasPue: true,
    color: '#1769e0',
    cashflowNote: '上架率 × 单 kW 租金，受电价与区域供需影响',
  },
  idc_expand: {
    key: 'idc_expand',
    label: '存量机房改扩建（液冷/高密）',
    short: '改扩建',
    sectors: ['IDC与智算中心'],
    count: 10,
    capex: [2e8, 1.2e9],
    revenuePerCapex: 0.31,
    ebitdaMargin: 0.52,
    tenor: [6, 10],
    buildMonths: [6, 12],
    hasPue: true,
    color: '#4a86e8',
    cashflowNote: '存量客户续约 + 高密机柜溢价，改造期不停服',
  },
  gpu_lease: {
    key: 'gpu_lease',
    label: '算力设备购置与租赁',
    short: '算力租赁',
    sectors: ['算力租赁与运营'],
    count: 26,
    capex: [3e8, 3e9],
    revenuePerCapex: 0.56,
    ebitdaMargin: 0.4,
    tenor: [3, 6],
    buildMonths: [3, 9],
    hasPue: true,
    color: '#0f9d8f',
    cashflowNote: '租金现金流依赖租约锁定率与 GPU 残值，折旧压力大',
  },
  server_line: {
    key: 'server_line',
    label: 'AI 服务器/网络设备产能建设',
    short: '服务器产线',
    sectors: ['AI服务器整机', '交换机与网络设备'],
    count: 14,
    capex: [2e8, 2e9],
    revenuePerCapex: 0.95,
    ebitdaMargin: 0.18,
    tenor: [5, 8],
    buildMonths: [10, 20],
    hasPue: false,
    color: '#7a5af8',
    cashflowNote: '订单覆盖倍数与交付节奏决定达产现金流',
  },
  chip_line: {
    key: 'chip_line',
    label: '先进封装/测试产线',
    short: '封装产线',
    sectors: ['先进封装与测试'],
    count: 10,
    capex: [5e8, 5e9],
    revenuePerCapex: 0.66,
    ebitdaMargin: 0.28,
    tenor: [7, 10],
    buildMonths: [18, 30],
    hasPue: false,
    color: '#b4552d',
    cashflowNote: '设备到位与良率爬坡是关键，达产周期长',
  },
  network_line: {
    key: 'network_line',
    label: '光模块/光纤产能与网络建设',
    short: '网络建设',
    sectors: ['光模块与CPO', '光纤光缆'],
    count: 10,
    capex: [1.5e8, 1.2e9],
    revenuePerCapex: 0.92,
    ebitdaMargin: 0.22,
    tenor: [5, 8],
    buildMonths: [8, 18],
    hasPue: false,
    color: '#c08a00',
    cashflowNote: '海外客户占比高，汇率与出口管制影响收入',
  },
  cooling_line: {
    key: 'cooling_line',
    label: '液冷/供配电配套产线',
    short: '配套产线',
    sectors: ['液冷温控', '电源与供配电'],
    count: 8,
    capex: [8e7, 6e8],
    revenuePerCapex: 1.02,
    ebitdaMargin: 0.2,
    tenor: [4, 7],
    buildMonths: [8, 16],
    hasPue: false,
    color: '#2f7fd0',
    cashflowNote: '配套订单随智算中心开工节奏波动',
  },
  dc_build: {
    key: 'dc_build',
    label: '机房建设与机电总包',
    short: '机电总包',
    sectors: ['机房建设与系统集成'],
    count: 8,
    capex: [5e7, 8e8],
    revenuePerCapex: 1.25,
    ebitdaMargin: 0.09,
    tenor: [3, 5],
    buildMonths: [6, 18],
    hasPue: false,
    color: '#8a6d3b',
    cashflowNote: '垫资施工 + 按节点回款，应收账款质量决定偿债',
  },
  platform: {
    key: 'platform',
    label: '算力调度平台与软件',
    short: '调度平台',
    sectors: ['云计算与算力调度', '运营商算力网络'],
    count: 12,
    capex: [5e7, 5e8],
    revenuePerCapex: 0.85,
    ebitdaMargin: 0.32,
    tenor: [3, 5],
    buildMonths: [6, 12],
    hasPue: false,
    color: '#168d69',
    cashflowNote: '轻资产，收入依赖平台接入规模与调度分成',
  },
};

export const PROJECT_TYPE_LIST = Object.values(PROJECT_TYPES);

// 区域要素：需求强度（租金与上架）、能耗指标松紧、电价水平、是否枢纽节点。
const REGION_PROFILE = {
  北京市: { demand: 5, energy: 2, price: 2, hub: true, tier: '需求中心' },
  上海市: { demand: 5, energy: 2, price: 2, hub: true, tier: '需求中心' },
  广东省: { demand: 5, energy: 2, price: 3, hub: true, tier: '需求中心' },
  江苏省: { demand: 5, energy: 3, price: 3, tier: '需求中心' },
  浙江省: { demand: 5, energy: 3, price: 3, tier: '需求中心' },
  河北省: { demand: 3, energy: 4, price: 4, hub: true, tier: '枢纽节点' },
  内蒙古自治区: { demand: 2, energy: 5, price: 5, hub: true, tier: '枢纽节点' },
  宁夏回族自治区: { demand: 2, energy: 5, price: 5, hub: true, tier: '枢纽节点' },
  甘肃省: { demand: 2, energy: 5, price: 5, hub: true, tier: '枢纽节点' },
  贵州省: { demand: 2, energy: 5, price: 5, hub: true, tier: '枢纽节点' },
  四川省: { demand: 4, energy: 4, price: 4, hub: true, tier: '枢纽节点' },
  重庆市: { demand: 4, energy: 4, price: 4, hub: true, tier: '枢纽节点' },
  山西省: { demand: 2, energy: 4, price: 4, tier: '区域中心' },
  湖北省: { demand: 4, energy: 3, price: 3, tier: '区域中心' },
  湖南省: { demand: 3, energy: 3, price: 3, tier: '区域中心' },
  安徽省: { demand: 3, energy: 3, price: 3, tier: '区域中心' },
  山东省: { demand: 4, energy: 3, price: 3, tier: '区域中心' },
  福建省: { demand: 3, energy: 3, price: 3, tier: '区域中心' },
  河南省: { demand: 3, energy: 3, price: 3, tier: '区域中心' },
  陕西省: { demand: 3, energy: 3, price: 3, tier: '区域中心' },
  天津市: { demand: 3, energy: 2, price: 3, tier: '区域中心' },
  辽宁省: { demand: 2, energy: 3, price: 3, tier: '区域中心' },
  江西省: { demand: 2, energy: 3, price: 3, tier: '区域中心' },
  广西壮族自治区: { demand: 2, energy: 3, price: 3, tier: '区域中心' },
  云南省: { demand: 2, energy: 3, price: 4, tier: '区域中心' },
  吉林省: { demand: 2, energy: 3, price: 3, tier: '区域中心' },
  黑龙江省: { demand: 2, energy: 3, price: 3, tier: '区域中心' },
  新疆维吾尔自治区: { demand: 2, energy: 4, price: 5, tier: '枢纽节点' },
  海南省: { demand: 2, energy: 2, price: 3, tier: '区域中心' },
  西藏自治区: { demand: 1, energy: 3, price: 4, tier: '区域中心' },
  青海省: { demand: 1, energy: 5, price: 5, tier: '枢纽节点' },
};

const DEFAULT_REGION = { demand: 2, energy: 2, price: 2, hub: false, tier: '未识别' };

function regionOf(province) {
  return REGION_PROFILE[province] || DEFAULT_REGION;
}

const PROVINCE_SHORT = {
  北京市: '北京',
  上海市: '上海',
  天津市: '天津',
  重庆市: '重庆',
  内蒙古自治区: '内蒙',
  宁夏回族自治区: '宁夏',
  广西壮族自治区: '广西',
  新疆维吾尔自治区: '新疆',
  西藏自治区: '西藏',
  香港特别行政区: '香港',
};

function provinceShort(province) {
  if (!province || province === '未知') return '区域待核';
  return PROVINCE_SHORT[province] || province.replace(/(省|市|自治区)$/, '');
}

const COMPANY_SUFFIX =
  /(股份有限公司|有限责任公司|有限公司|集团有限公司|集团|控股|科技|技术|信息|网络|电子|实业|发展|投资|（中国）|\(中国\))/g;

function ownerShort(name) {
  const cleaned = String(name || '')
    .replace(/^[\u4e00-\u9fa5]{2,8}(省|市|自治区)?/, (match) => match)
    .replace(COMPANY_SUFFIX, '')
    .replace(/[（）()·\s]/g, '');
  const base = cleaned || String(name || '').slice(0, 6);
  return base.length > 8 ? base.slice(0, 8) : base;
}

// ---------------------------------------------------------------------------
// 评分卡：合规要素 30 / 需求消纳 25 / 财务偿债 25 / 技术建设 10 / 主体增信 10
// ---------------------------------------------------------------------------

export const PROJECT_SCORECARD = [
  {
    key: 'compliance',
    label: '合规与要素落实',
    max: 30,
    items: ['项目备案/核准', '能耗与绿电指标', '用地/机房权属与消防', '能效（PUE）或环保验收'],
  },
  {
    key: 'demand',
    label: '需求与消纳',
    max: 25,
    items: ['长协客户锁定率', '稳定期上架率', '区域供需与电价'],
  },
  {
    key: 'finance',
    label: '财务与偿债',
    max: 25,
    items: ['测算 DSCR', '资本金比例', '项目 IRR', '建设期利息与超支'],
  },
  {
    key: 'tech',
    label: '技术与建设',
    max: 10,
    items: ['技术路线成熟度', '总包与交付能力', '设备供应与交期'],
  },
  {
    key: 'subject',
    label: '主体与增信',
    max: 10,
    items: ['主体评价与层级', '增信与担保', '集团支持与运营经验'],
  },
];

export const CONCLUSIONS = {
  support: { key: 'support', label: '可支持', color: '#168d69', tone: 'green' },
  prudent: { key: 'prudent', label: '审慎支持', color: '#ed861d', tone: 'orange' },
  strict: { key: 'strict', label: '从严控制', color: '#c23b37', tone: 'red' },
  deny: { key: 'deny', label: '不予准入', color: '#8b2f2f', tone: 'red' },
};

const STATUS = {
  done: { label: '已落实', score: 1 },
  pending: { label: '待补件', score: 0.55 },
  missing: { label: '缺失', score: 0 },
};

function complianceItem(rnd, { doneRate, missRate, doneNote, pendingNote, missingNote }) {
  const roll = rnd();
  if (roll < missRate) return { status: 'missing', label: STATUS.missing.label, note: missingNote };
  if (roll < missRate + (1 - doneRate - missRate)) {
    return { status: 'pending', label: STATUS.pending.label, note: pendingNote };
  }
  return { status: 'done', label: STATUS.done.label, note: doneNote };
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function scoreDscr(dscr) {
  if (dscr >= 1.5) return 12;
  if (dscr >= 1.4) return 11.4;
  if (dscr >= 1.3) return 10.2;
  if (dscr >= 1.2) return 8.4;
  if (dscr >= 1.1) return 6.3;
  if (dscr >= 1.0) return 3.6;
  if (dscr >= 0.9) return 1.5;
  return 0;
}

function scoreCapital(ratio) {
  if (ratio >= 0.4) return 6;
  if (ratio >= 0.35) return 5.5;
  if (ratio >= 0.3) return 4.8;
  if (ratio >= 0.25) return 4;
  if (ratio >= 0.2) return 2.4;
  return 0.8;
}

function buildProject(entry, type, rnd) {
  const { company, evaluation } = entry;
  const metrics = company.metrics;
  const province = company.region?.province || '未知';
  const region = regionOf(province);

  // 投资规模随主体体量伸缩，避免小市值公司出现百亿项目。
  const revenue = Math.max(metrics.revenue || 0, 1e7);
  const sizeFactor = clamp(0.55 + Math.log10(revenue / 1e7) * 0.18, 0.5, 1.25);
  const investment =
    Math.round(((type.capex[0] + (type.capex[1] - type.capex[0]) * rnd()) * sizeFactor) / 1e6) *
    1e6;

  const capitalRatio = round2(clamp(0.18 + rnd() * 0.28, 0.18, 0.46));
  const loan = Math.round(investment * (1 - capitalRatio) * 0.85);
  const tenor = Math.round(type.tenor[0] + (type.tenor[1] - type.tenor[0]) * rnd());
  const buildMonths = Math.round(
    type.buildMonths[0] + (type.buildMonths[1] - type.buildMonths[0]) * rnd(),
  );

  const itLoadMW = type.hasPue
    ? round1(clamp((investment / 1e8) * (type.key === 'gpu_lease' ? 0.9 : 0.55), 2, 120))
    : null;
  const pue = type.hasPue ? round2(1.1 + rnd() * 0.28) : null;

  const anchoredRate = round2(
    clamp(0.12 + rnd() * 0.78 + (evaluation.total - 60) * 0.004, 0.05, 0.95),
  );
  const utilization = round2(clamp(0.38 + rnd() * 0.5 + (region.demand - 2) * 0.03, 0.25, 0.95));
  const rampMonths = Math.round(
    (type.hasPue ? 6 : 3) + rnd() * (type.hasPue ? 18 : 12) + buildMonths * 0.3,
  );

  // 达产年 EBITDA：投资 × 收入强度 × EBITDA 率 × 消纳折扣 × 爬坡折扣
  const demandFactor = clamp(0.42 + anchoredRate * 0.36 + utilization * 0.24, 0.4, 1.15);
  const rampFactor = clamp(1 - (rampMonths - 6) * 0.006, 0.85, 1);
  const stabilizedRevenue = investment * type.revenuePerCapex * demandFactor * rampFactor;
  const ebitda = stabilizedRevenue * type.ebitdaMargin * (0.92 + rnd() * 0.16);
  const rate = 0.035;
  const annuity = rate / (1 - Math.pow(1 + rate, -tenor));
  const debtService = loan * annuity;
  const dscr = round2(clamp(ebitda / Math.max(debtService, 1), 0.55, 2.2));
  const irr = round2(
    clamp(0.045 + (dscr - 1) * 0.075 + (capitalRatio - 0.3) * 0.12 + rnd() * 0.02, 0.01, 0.2),
  );

  const filing = complianceItem(rnd, {
    doneRate: 0.9,
    missRate: 0.04,
    doneNote: '备案/核准文号已在项目库匹配',
    pendingNote: '备案变更待补，需核实建设内容与规模',
    missingNote: '未取得备案/核准，不得开工与投放',
  });
  const energy = complianceItem(rnd, {
    doneRate: region.energy >= 4 ? 0.88 : 0.62,
    missRate: 0.05,
    doneNote: region.energy >= 4 ? '能耗指标与绿电交易已落实' : '能耗指标已取得，绿电比例待补充',
    pendingNote: '能耗指标或绿电消纳协议待补',
    missingNote: '无能耗指标，存在限电与整改风险',
  });
  const land = complianceItem(rnd, {
    doneRate: type.hasPue ? 0.82 : 0.88,
    missRate: 0.04,
    doneNote: '土地/机房产权与消防验收资料齐全',
    pendingNote: '产权或消防验收资料待补',
    missingNote: '用地/机房权属不清，抵押与处置受限',
  });
  const efficiency = type.hasPue
    ? pue <= 1.25
      ? { status: 'done', label: '已达标', note: `PUE ${pue}，优于枢纽节点 1.25 要求` }
      : pue <= 1.35
        ? { status: 'pending', label: '待改造', note: `PUE ${pue}，需列明改造计划` }
        : { status: 'missing', label: '未达标', note: `PUE ${pue}，高于 1.35 准入线` }
    : complianceItem(rnd, {
        doneRate: 0.9,
        missRate: 0.03,
        doneNote: '环评与排污许可已验收',
        pendingNote: '环评验收待补',
        missingNote: '环评未验收，产线不得投产',
      });

  const complianceScore =
    filingScore(filing) + energyScore(energy) + landScore(land) + efficiencyScore(efficiency, type);
  const demandScore = anchoredRate * 10 + utilization * 8 + clamp(2.2 + region.demand * 0.95, 0, 7);
  const financeScore =
    scoreDscr(dscr) + scoreCapital(capitalRatio) + clamp(irr * 30, 0, 4) + (rnd() < 0.75 ? 3 : 1.6);
  const techScore =
    clamp((metrics.tech?.maturity ?? 3) * 0.8, 0, 4) +
    clamp((evaluation.total / 100) * 3.2, 0, 3) +
    clamp(1 + (metrics.trade?.supplierStability ?? 3) * 0.45, 0, 3);
  const subjectScore =
    clamp((evaluation.total / 100) * 5.2, 0, 5.2) +
    clamp((metrics.guarantees > 0 ? 2.4 : 3) * (company.listed ? 1 : 0.85), 0, 3) +
    clamp(company.headTier === '龙头' ? 2 : company.headTier === '骨干' ? 1.4 : 0.9, 0, 2);

  const dims = {
    compliance: { score: complianceScore, max: 30 },
    demand: { score: demandScore, max: 25 },
    finance: { score: financeScore, max: 25 },
    tech: { score: techScore, max: 10 },
    subject: { score: subjectScore, max: 10 },
  };
  const total = Math.round(
    dims.compliance.score +
      dims.demand.score +
      dims.finance.score +
      dims.tech.score +
      dims.subject.score,
  );

  const flags = [];
  if (filing.status === 'missing') flags.push('未备案/核准');
  if (energy.status !== 'done')
    flags.push(energy.status === 'missing' ? '无能耗指标' : '能耗指标待补');
  if (land.status !== 'done') flags.push(land.status === 'missing' ? '权属不清' : '产权资料待补');
  if (type.hasPue && pue > 1.35) flags.push(`PUE ${pue} 超标`);
  if (dscr < 1.1) flags.push(`DSCR ${dscr} 低于 1.1`);
  if (capitalRatio < 0.25) flags.push(`资本金 ${(capitalRatio * 100).toFixed(0)}% 偏低`);
  if (anchoredRate < 0.3) flags.push('长协锁定率不足 30%');
  if (utilization < 0.55) flags.push('上架率爬坡偏慢');
  if (evaluation.warningLevel === 'red' || evaluation.warningLevel === 'orange')
    flags.push('主体预警等级偏高');
  if (type.key === 'gpu_lease') flags.push('GPU 残值与技术迭代风险');

  const allComplianceDone = [filing, energy, land, efficiency].every(
    (item) => item.status === 'done',
  );
  let conclusionKey = 'strict';
  if (filing.status === 'missing' || land.status === 'missing') conclusionKey = 'deny';
  else if (total >= 78 && dscr >= 1.3 && capitalRatio >= 0.25 && allComplianceDone)
    conclusionKey = 'support';
  else if (total >= 62 && dscr >= 1.12) conclusionKey = 'prudent';

  // 与负面清单 C4–C7 对齐：命中从严类条目者不得给出「可支持/审慎支持」结论。
  const strictTriggers = [];
  if (pue && pue > 1.35) strictTriggers.push('PUE 超 1.35');
  if (capitalRatio < 0.2) strictTriggers.push('资本金低于 20%');
  if (dscr < 1.1) strictTriggers.push('DSCR 低于 1.10');
  if (anchoredRate < 0.3) strictTriggers.push('长协锁定率低于 30%');
  if (strictTriggers.length && conclusionKey !== 'deny') conclusionKey = 'strict';

  const suggested =
    conclusionKey === 'deny'
      ? 0
      : Math.floor(
          (loan *
            clamp(dscr / 1.35, 0.45, 1) *
            (conclusionKey === 'support' ? 1 : conclusionKey === 'prudent' ? 0.72 : 0.35)) /
            1e5,
        ) * 1e5;

  const year = 2026 + (rnd() < 0.5 ? 0 : 1);
  const phase = rnd() < 0.62 ? '一期' : '二期';
  const shortProvince = province === '未知' ? '' : provinceShort(province);
  const ownerBase = ownerShort(company.name);
  // 业主简称若已含省域前缀（如「上海宝信软件」），项目名不再重复地名。
  const nameOwner =
    shortProvince && ownerBase.startsWith(shortProvince) && ownerBase.length > shortProvince.length
      ? ownerBase.slice(shortProvince.length)
      : ownerBase;

  return {
    id: `prj-${company.id}-${type.key}`,
    name: `${shortProvince}${type.short}${phase}·${nameOwner}`,
    ownerId: company.id,
    owner: company.name,
    ownerShort: company.stockShort || ownerShort(company.name),
    ownerTier: company.headTier || '—',
    listed: company.listed,
    chain: company.chain,
    sector: company.sector,
    type: type.key,
    typeLabel: type.label,
    typeShort: type.short,
    color: type.color,
    cashflowNote: type.cashflowNote,
    province,
    regionTier: region.tier,
    regionNote: `${region.tier} · 需求 ${region.demand}/5 · 能耗松紧 ${region.energy}/5 · 电价 ${region.price}/5`,
    year,
    phase,
    investment,
    capitalRatio,
    capitalAmount: Math.round(investment * capitalRatio),
    loan,
    suggested,
    tenor,
    buildMonths,
    itLoadMW,
    pue,
    anchoredRate,
    utilization,
    rampMonths,
    stabilizedRevenue: Math.round(stabilizedRevenue),
    ebitda: Math.round(ebitda),
    dscr,
    irr,
    compliance: { filing, energy, land, efficiency },
    dimensions: dims,
    total,
    conclusion: conclusionKey,
    conclusionLabel: CONCLUSIONS[conclusionKey].label,
    flags,
    subjectScore: evaluation.total,
    subjectWarning: evaluation.warningLevel,
  };
}

function filingScore(item) {
  return item.status === 'done' ? 8 : item.status === 'pending' ? 4.4 : 0;
}
function energyScore(item) {
  return item.status === 'done' ? 8 : item.status === 'pending' ? 4.4 : 0;
}
function landScore(item) {
  return item.status === 'done' ? 7 : item.status === 'pending' ? 3.8 : 0;
}
function efficiencyScore(item, type) {
  if (type.hasPue) {
    return item.status === 'done' ? 7 : item.status === 'pending' ? 4.5 : 0;
  }
  return item.status === 'done' ? 7 : item.status === 'pending' ? 3.8 : 0;
}

// ---------------------------------------------------------------------------
// 项目池构建
// ---------------------------------------------------------------------------

export function buildProjectPool(entries) {
  const evaluated = entries.filter((entry) => entry.evaluation);
  const taken = new Set();
  const projects = [];

  for (const type of PROJECT_TYPE_LIST) {
    const candidates = evaluated
      .filter((entry) => type.sectors.includes(entry.company.sector))
      .filter((entry) => !taken.has(entry.company.id))
      .sort((a, b) => {
        const scoreA = a.evaluation.total * 0.65 + (a.company.metrics?.quality ?? 0) * 35;
        const scoreB = b.evaluation.total * 0.65 + (b.company.metrics?.quality ?? 0) * 35;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return String(a.company.id).localeCompare(String(b.company.id));
      })
      .slice(0, type.count);

    for (const entry of candidates) {
      taken.add(entry.company.id);
      const rnd = mulberry32(hashSeed(`project-v1:${entry.company.id}:${type.key}`));
      projects.push(buildProject(entry, type, rnd));
    }
  }

  return projects.sort((a, b) => b.investment - a.investment);
}

export function buildProjectOverview(projects) {
  const conclusionCounts = { support: 0, prudent: 0, strict: 0, deny: 0 };
  const types = new Map();
  const regions = new Map();
  const gaps = { filing: 0, energy: 0, land: 0, efficiency: 0 };
  const dscrDist = [
    { key: 'ge1.4', label: '≥1.40', min: 1.4, count: 0 },
    { key: '1.3', label: '1.30–1.40', min: 1.3, count: 0 },
    { key: '1.2', label: '1.20–1.30', min: 1.2, count: 0 },
    { key: '1.1', label: '1.10–1.20', min: 1.1, count: 0 },
    { key: 'lt1.1', label: '<1.10', min: 0, count: 0 },
  ];
  let investment = 0;
  let loan = 0;
  let suggested = 0;
  let dscrSum = 0;
  let scoreSum = 0;

  for (const project of projects) {
    conclusionCounts[project.conclusion] += 1;
    investment += project.investment;
    loan += project.loan;
    suggested += project.suggested;
    dscrSum += project.dscr;
    scoreSum += project.total;
    for (const key of ['filing', 'energy', 'land', 'efficiency']) {
      if (project.compliance[key].status !== 'done') gaps[key] += 1;
    }

    if (!types.has(project.type)) {
      types.set(project.type, {
        key: project.type,
        label: project.typeLabel,
        color: project.color,
        count: 0,
        investment: 0,
        loan: 0,
        scoreSum: 0,
      });
    }
    const typeBucket = types.get(project.type);
    typeBucket.count += 1;
    typeBucket.investment += project.investment;
    typeBucket.loan += project.loan;
    typeBucket.scoreSum += project.total;

    if (!regions.has(project.province)) {
      regions.set(project.province, { province: project.province, count: 0, loan: 0 });
    }
    const regionBucket = regions.get(project.province);
    regionBucket.count += 1;
    regionBucket.loan += project.loan;

    const bucket = dscrDist.find((item) => project.dscr >= item.min);
    if (bucket) bucket.count += 1;
  }

  const typeStats = Array.from(types.values())
    .map((item) => ({
      ...item,
      avgScore: item.count ? Math.round(item.scoreSum / item.count) : 0,
    }))
    .sort((a, b) => b.investment - a.investment);

  return {
    total: projects.length,
    investment,
    loan,
    suggested,
    avgDscr: projects.length ? round2(dscrSum / projects.length) : 0,
    avgScore: projects.length ? Math.round(scoreSum / projects.length) : 0,
    avgCapitalRatio: projects.length
      ? round1((projects.reduce((sum, item) => sum + item.capitalRatio, 0) / projects.length) * 100)
      : 0,
    conclusionCounts,
    typeStats,
    gaps,
    gapTotal: gaps.filing + gaps.energy + gaps.land + gaps.efficiency,
    regions: Array.from(regions.values()).sort((a, b) => b.investment - a.investment),
    dscrDist,
  };
}

export function projectAmount(value) {
  return formatWan(value);
}

export function projectScoreLabel(score) {
  if (score >= 80) return '优质';
  if (score >= 70) return '良好';
  if (score >= 60) return '一般';
  return '偏弱';
}

export { clamp01 };
