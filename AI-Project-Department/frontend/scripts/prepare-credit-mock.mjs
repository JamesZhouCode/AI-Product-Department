// 生成产业链智能授信演示数据（储能产业 / 算力产业）。
//
// 企业名单与链路归属取自 public/data/industries/companies-{storage|compute}.json。
// 财务 / 经营 / 技术 / 治理 / 风险事件等授信指标均为确定性模拟数据：
// 同一 id 每次生成结果一致，便于页面回归与演示。
//
// 用法：
//   pnpm prepare:credit                 # 储能产业（默认）
//   node scripts/prepare-credit-mock.mjs --industry compute
// 输出：
//   public/data/credit/storage-credit-mock.json
//   public/data/credit/compute-credit-mock.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEGMENT_BY_CHAIN,
  SECTOR_TYPE,
  TYPE_PROFILE,
  deriveStage,
} from '../src/features/credit/creditConfig.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const industryArg = args.includes('--industry') ? args[args.indexOf('--industry') + 1] : 'storage';

// 产业集群 / 投资方 / 技术路线均为演示口径，按行业切换；评分引擎与阈值完全复用。
const INDUSTRY_CONFIG = {
  storage: {
    key: 'storage',
    label: '储能产业',
    sourceFile: 'companies-storage.json',
    outputFile: 'storage-credit-mock.json',
    typeLabelFromSector: false,
    sourceNote:
      '企业名单与链路归属来自《全量客户清单.xlsx》入链结果（companies-storage.json，237 家上市企业 + 1740 家非上市企业）。财务、经营、产业集群、投融资经历与授信评分相关指标均为演示用模拟数据（确定性生成，可按企业 id 复现）。',
    clusters: {
      江苏省: { name: '常州（溧阳）储能产业集群', maturity: 5 },
      广东省: { name: '深圳储能产业集群', maturity: 5 },
      福建省: { name: '宁德锂电新能源产业集群', maturity: 5 },
      四川省: { name: '宜宾动力电池产业集群', maturity: 4 },
      安徽省: { name: '合肥新能源与储能产业集群', maturity: 4 },
      山东省: { name: '枣庄锂电产业集群', maturity: 4 },
      湖北省: { name: '荆门动力储能电池产业集群', maturity: 4 },
      浙江省: { name: '湖州（长兴）储能产业集群', maturity: 4 },
      江西省: { name: '宜春锂电产业集群', maturity: 4 },
      湖南省: { name: '长沙（宁乡）储能材料产业集群', maturity: 3 },
      河南省: { name: '新乡电池产业集群', maturity: 3 },
      上海市: { name: '上海临港储能产业集群', maturity: 4 },
      北京市: { name: '北京未来科学城能源产业集群', maturity: 4 },
      重庆市: { name: '重庆两江新区储能产业集群', maturity: 3 },
      天津市: { name: '天津滨海新能源产业集群', maturity: 3 },
      陕西省: { name: '西安新能源产业集群', maturity: 3 },
      河北省: { name: '保定新能源产业集群', maturity: 3 },
      云南省: { name: '云南锂资源与材料集群', maturity: 3 },
      青海省: { name: '青海锂资源与材料集群', maturity: 3 },
      内蒙古自治区: { name: '内蒙古风光储一体化集群', maturity: 3 },
      新疆维吾尔自治区: { name: '新疆新能源与储能集群', maturity: 3 },
    },
    investors: {
      知名机构: ['红杉中国', '高瓴创投', 'IDG 资本', '中金资本', '国投创合'],
      产业资本: ['宁德时代', '比亚迪', '国家电投', '南方电网资本', '三峡资本', '中广核资本'],
      一般机构: ['地方产业引导基金', '城投产业基金', '民营创投机构'],
    },
    techRoutes: [
      '锂离子 / 磷酸铁锂',
      '钠离子电池',
      '液流电池（全钒）',
      '压缩空气储能',
      '构网型储能技术',
      '智能组串式',
      '高压级联方案',
    ],
    clusterFallback: (province) => `${province}新能源与储能产业集群`,
  },
  compute: {
    key: 'compute',
    label: '算力产业',
    sourceFile: 'companies-compute.json',
    outputFile: 'compute-credit-mock.json',
    typeLabelFromSector: true,
    sourceNote:
      '企业名单与环节归属来自《算力产业链企业清单》合并版 v4.1（companies-compute.json，在链企业 3,475 家：452 家上市 + 3,023 家非上市）。财务、经营、产业集群、投融资经历与授信评分相关指标均为演示用模拟数据（确定性生成，可按企业 id 复现）。',
    clusters: {
      北京市: { name: '北京海淀人工智能与算力产业集群', maturity: 5 },
      上海市: { name: '上海临港算力产业集群', maturity: 5 },
      广东省: { name: '粤港澳大湾区算力产业集群', maturity: 5 },
      江苏省: { name: '长三角（苏州/无锡）算力产业集群', maturity: 4 },
      浙江省: { name: '杭州云计算与算力产业集群', maturity: 4 },
      四川省: { name: '成渝（成都）算力产业集群', maturity: 4 },
      贵州省: { name: '贵安算力枢纽集群', maturity: 5 },
      内蒙古自治区: { name: '和林格尔算力枢纽集群', maturity: 5 },
      宁夏回族自治区: { name: '中卫算力枢纽集群', maturity: 4 },
      甘肃省: { name: '庆阳算力枢纽集群', maturity: 3 },
      河北省: { name: '张家口（怀来）算力集群', maturity: 4 },
      湖北省: { name: '武汉光谷算力产业集群', maturity: 4 },
      安徽省: { name: '合肥算力产业集群', maturity: 4 },
      福建省: { name: '厦门/福州算力产业集群', maturity: 3 },
      山东省: { name: '济南/青岛算力产业集群', maturity: 4 },
      陕西省: { name: '西安算力产业集群', maturity: 3 },
      湖南省: { name: '长沙算力产业集群', maturity: 3 },
      河南省: { name: '郑州算力产业集群', maturity: 3 },
      天津市: { name: '天津滨海算力产业集群', maturity: 3 },
      重庆市: { name: '重庆两江算力产业集群', maturity: 3 },
      辽宁省: { name: '沈阳算力产业集群', maturity: 2 },
      黑龙江省: { name: '哈尔滨算力产业集群', maturity: 2 },
      吉林省: { name: '长春算力产业集群', maturity: 2 },
      山西省: { name: '大同算力产业集群', maturity: 3 },
      云南省: { name: '昆明算力产业集群', maturity: 2 },
      新疆维吾尔自治区: { name: '新疆算力产业集群', maturity: 2 },
      江西省: { name: '南昌算力产业集群', maturity: 2 },
      广西壮族自治区: { name: '南宁算力产业集群', maturity: 2 },
      海南省: { name: '海南自贸港数据产业集群', maturity: 3 },
    },
    investors: {
      知名机构: ['深创投', '中金资本', '红杉中国', '高瓴创投', '国投创新'],
      产业资本: ['华为哈勃', '阿里云', '腾讯投资', '字节跳动', '中国移动资本', '中国电信投资'],
      一般机构: ['地方产业引导基金', '城投产业基金', '民营创投机构'],
    },
    techRoutes: [
      'GPU 通用架构',
      'ASIC 专用加速',
      'NPU 神经网络处理器',
      'Chiplet 芯粒集成',
      '硅光 / CPO',
      '冷板式液冷',
      '浸没式液冷',
      'RDMA 无损网络',
      '存算一体',
    ],
    clusterFallback: (province) => `${province}算力产业集群`,
  },
  ic: {
    key: 'ic',
    label: '集成电路',
    // 集成电路的入链数据是 agent/build_ic_chain.py 生成的 ic-chain.json（含 listStatus / tierLabel）。
    sourceFile: 'ic-chain.json',
    outputFile: 'ic-credit-mock.json',
    typeLabelFromSector: true,
    sourceNote:
      '企业名单与环节归属来自《集成电路企业清单-按环节.xlsx》建链结果（ic-chain.json，4,477 家在链企业：230 家上市 + 4,247 家非上市，7 个一级环节 / 18 个二级环节）。财务、经营、产业集群、投融资经历与授信评分相关指标均为演示用模拟数据（确定性生成，可按企业 id 复现）。',
    clusters: {
      上海市: { name: '上海张江/临港集成电路产业集群', maturity: 5 },
      江苏省: { name: '无锡/南京集成电路产业集群', maturity: 5 },
      广东省: { name: '珠三角集成电路设计与封测产业集群', maturity: 4 },
      北京市: { name: '北京集成电路设计产业集群', maturity: 4 },
      浙江省: { name: '杭州/宁波集成电路产业集群', maturity: 4 },
      湖北省: { name: '武汉光谷集成电路产业集群', maturity: 4 },
      安徽省: { name: '合肥集成电路产业集群', maturity: 4 },
      四川省: { name: '成都集成电路产业集群', maturity: 4 },
      陕西省: { name: '西安集成电路产业集群', maturity: 4 },
      福建省: { name: '厦门集成电路产业集群', maturity: 3 },
      山东省: { name: '济南集成电路产业集群', maturity: 3 },
      天津市: { name: '天津集成电路产业集群', maturity: 3 },
      重庆市: { name: '重庆集成电路产业集群', maturity: 3 },
      湖南省: { name: '长沙集成电路产业集群', maturity: 3 },
      辽宁省: { name: '大连集成电路产业集群', maturity: 3 },
      河北省: { name: '河北集成电路配套产业集群', maturity: 2 },
      河南省: { name: '河南集成电路配套产业集群', maturity: 2 },
      江西省: { name: '江西集成电路配套产业集群', maturity: 2 },
      青海省: { name: '青海集成电路配套产业集群', maturity: 1 },
      黑龙江省: { name: '黑龙江集成电路配套产业集群', maturity: 1 },
      广西壮族自治区: { name: '广西集成电路配套产业集群', maturity: 2 },
      中国香港特别行政区: { name: '香港集成电路设计产业集群', maturity: 3 },
    },
    investors: {
      知名机构: ['国家集成电路产业投资基金', '深创投', '中芯聚源', '华登国际', '中金资本'],
      产业资本: ['华为哈勃', '中芯国际产业基金', '小米产投', '紫光展锐生态基金', '韦尔股份投资'],
      一般机构: ['地方产业引导基金', '城投产业基金', '民营创投机构'],
    },
    techRoutes: [
      '先进制程逻辑工艺',
      '成熟制程特色工艺',
      '存储器（DRAM/NAND）',
      '第三代半导体（SiC/GaN）',
      'Chiplet 芯粒集成',
      '先进封装（2.5D/3D）',
      'EDA 与 IP 复用',
      '化合物半导体材料',
      '大硅片国产化',
    ],
    clusterFallback: (province) => `${province}集成电路产业集群`,
  },
};

const CONFIG = INDUSTRY_CONFIG[industryArg] || INDUSTRY_CONFIG.storage;
const sourcePath = path.join(rootDir, 'public', 'data', 'industries', CONFIG.sourceFile);
const outputDir = path.join(rootDir, 'public', 'data', 'credit');
const outputPath = path.join(outputDir, CONFIG.outputFile);

const SALT = `credit-mock-v2-${CONFIG.key}`;
const CLUSTER_BY_PROVINCE = CONFIG.clusters;
const INVESTOR_POOL = CONFIG.investors;
const TECH_ROUTES = CONFIG.techRoutes;

function hashSeed(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
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

const lerp = (min, max, t) => min + (max - min) * t;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pick = (rnd, items) => items[Math.floor(rnd() * items.length) % items.length];

// 区间内对数均匀取值，适配营收这类跨数量级的量。
const logUniform = (rnd, min, max) => Math.exp(lerp(Math.log(min), Math.log(max), rnd()));

const REVENUE_BASE = {
  listed: { 龙头: [2e9, 8e10], 骨干: [5e8, 1e10], 长尾: [1.5e8, 3e9] },
  nonListed: [3e7, 1.5e9],
};

function revenueBaseFor(company, rnd) {
  const listed = company.tags?.includes('上市企业');
  if (!listed) return logUniform(rnd, REVENUE_BASE.nonListed[0], REVENUE_BASE.nonListed[1]);
  const tier = company.research?.additionalFields?.headTier || company.tierLabel || '长尾';
  const range = REVENUE_BASE.listed[tier] || REVENUE_BASE.listed.长尾;
  return logUniform(rnd, range[0], range[1]);
}

function generateMetrics(company, rnd) {
  const sector = company.tertiarySector || company.sector || '';
  const typeKey = SECTOR_TYPE[sector] || 'service';
  const profile = TYPE_PROFILE[typeKey];
  const listed = company.tags?.includes('上市企业');
  const headTier = company.research?.additionalFields?.headTier || company.tierLabel || null;

  let q = rnd(); // 综合质量因子：驱动毛利、现金流质量、杠杆的整体水平。
  // 拉伸为双极分布，避免客户全部集中在中间层级。
  q = clamp(0.5 + (q - 0.5) * 1.9, 0, 1);
  let revenueNow = revenueBaseFor(company, rnd);
  // 约 10% 非上市企业构造「研发早期 / 样机中试」形态（对应 V2.0 的 C 类科技创新型企业）。
  const earlyStage = !listed && rnd() < 0.1;
  if (earlyStage) revenueNow = logUniform(rnd, 2.5e6, 2.6e7);
  const growth = profile.growth;
  const g0 = lerp(growth[0], growth[1], rnd());
  const g1 = lerp(growth[0], growth[1], rnd());
  const revenuePrev = revenueNow / (1 + g0);
  const revenuePrev2 = revenuePrev / (1 + g1);

  const excellent = q >= 0.8; // 头部优质客户：撑起「少而精」的第一层。
  const distressed = q <= 0.2; // 困难客户：集中于第三层的真实组合形态。
  const marginBoost = excellent ? 1.25 : distressed ? 0.3 : 1;

  const grossMargin = clamp(
    lerp(profile.margin[0], profile.margin[1], 0.25 + 0.75 * q) *
      (excellent ? 1.12 : distressed ? 0.78 : 1),
    0.02,
    0.68,
  );
  let netMargin = grossMargin * lerp(0.12, 0.58, rnd()) * lerp(0.6, 1.25, q) * marginBoost;
  if (rnd() < 0.07 && !excellent && !distressed) netMargin = -lerp(0.01, 0.06, rnd()); // 少数企业亏损。
  netMargin = clamp(netMargin, -0.12, 0.5);

  const netProfit = revenueNow * netMargin;
  // 约 10% 的企业构造「利润增长但经营现金流承压」的典型风险形态。
  const cashflowTrap = !excellent && rnd() < 0.1 && g0 > 0.05;
  const baseOcfQuality = lerp(-0.5, 1.6, q * 0.7 + rnd() * 0.3);
  const ocfQuality = cashflowTrap
    ? lerp(-1.4, -0.2, rnd())
    : excellent
      ? Math.max(baseOcfQuality, 1.0)
      : distressed
        ? Math.min(baseOcfQuality, -0.2)
        : baseOcfQuality;
  const ocfNow = clamp(
    netProfit * ocfQuality + revenueNow * lerp(0.0, 0.05, rnd()),
    -revenueNow * 0.2,
    revenueNow * 0.35,
  );
  const ocfPrev = ocfNow * lerp(0.7, 1.5, rnd());
  const ocfPrev2 = ocfPrev * lerp(0.7, 1.5, rnd());

  const assetHeavy = lerp(profile.assetHeavy[0], profile.assetHeavy[1], rnd());
  const totalAssets = revenueNow * assetHeavy;
  const debtBase =
    profile.model === 'operator'
      ? [0.5, 0.8]
      : profile.model === 'service'
        ? [0.2, 0.55]
        : [0.28, 0.72];
  const debtRatio = clamp(
    lerp(debtBase[0], debtBase[1], rnd()) * (excellent ? 0.85 : distressed ? 1.2 : 1),
    0.12,
    0.88,
  );
  const totalLiabilities = totalAssets * debtRatio;
  const interestBearingDebt = totalLiabilities * lerp(0.25, 0.72, rnd());
  const interestExpense = interestBearingDebt * lerp(0.03, 0.05, rnd());
  const ebitda = netProfit + interestExpense + revenueNow * lerp(0.02, 0.09, rnd());
  const cash = revenueNow * lerp(0.03, 0.28, rnd());
  const stDebt = interestBearingDebt * lerp(0.2, 0.8, rnd());

  const arNow = revenueNow * lerp(profile.arRatio[0], profile.arRatio[1], rnd());
  const arGrowth = lerp(-0.05, 0.65, rnd());
  const arPrev = arNow / (1 + arGrowth);
  const arPrev2 = arPrev / (1 + lerp(-0.05, 0.6, rnd()));
  const invNow = revenueNow * lerp(profile.invRatio[0], profile.invRatio[1], rnd());
  const invGrowth = lerp(-0.05, 0.55, rnd());
  const invPrev = invNow / (1 + invGrowth);

  const currentRatio = lerp(0.75, 2.6, rnd());
  const quickRatio = Math.max(0.35, currentRatio - lerp(0.15, 0.7, rnd()));
  const capacityUtilization = clamp(
    lerp(profile.utilRange[0], profile.utilRange[1], rnd()) * (distressed ? 0.65 : 1),
    0.15,
    excellent ? 0.98 : 0.95,
  );
  const orderMultiple = profile.model === 'project' ? [0.5, 2.2] : [0.15, 1.2];
  const orders =
    revenueNow *
    (excellent ? lerp(1.05, 2.2, rnd()) : lerp(orderMultiple[0], orderMultiple[1], rnd()));
  const concentrationBase = profile.model === 'project' ? [0.15, 0.75] : [0.08, 0.6];
  const customerConcentration = clamp(
    lerp(concentrationBase[0], concentrationBase[1], rnd()) * (excellent ? 0.6 : 1) +
      (distressed ? 0.22 : 0),
    0.05,
    0.9,
  );
  const customerQualityBase =
    profile.model === 'operator' || typeKey === 'chainLeader' ? [0.5, 1] : [0.15, 0.95];
  const topCustomerQuality = clamp(
    lerp(customerQualityBase[0], customerQualityBase[1], rnd()) *
      (excellent ? 1.1 : distressed ? 0.6 : 1),
    0.05,
    1,
  );
  const guarantees = rnd() < 0.25 ? totalAssets * lerp(0.01, 0.18, rnd()) : 0;
  const employees = Math.round(revenueNow / lerp(6e5, 2.5e6, rnd()));
  const foundedYear = 1993 + Math.floor(rnd() * 30);
  const registeredCapital = logUniform(rnd, 1e6, 5e9);

  const techBase = {
    device: 4,
    cell: 4,
    pcs: 4,
    bms: 4,
    ems: 3,
    testing: 4,
    operator: 3,
    service: 2,
    materials: 3,
  };
  const base5 = techBase[typeKey] ?? 3;
  const near = (value) => clamp(Math.round(value + lerp(-0.8, 0.8, rnd())), 1, 5);
  const tech = {
    maturity: excellent ? 5 : near(base5 + (q > 0.6 ? 1 : 0)),
    barrier: excellent ? 5 : near(base5 - 1 + (headTier === '龙头' ? 1 : 0)),
    reliability: excellent ? 5 : near(base5),
    certifications: excellent ? 6 + Math.floor(rnd() * 18) : Math.floor(logUniform(rnd, 1, 30)),
    techIterRisk: excellent ? '低' : pick(rnd, ['低', '低', '中', '中', '高']),
    rdRatio: excellent
      ? lerp(0.08, 0.14, rnd())
      : lerp(
          profile.model === 'operator' ? 0.004 : 0.02,
          profile.model === 'operator' ? 0.02 : 0.12,
          rnd(),
        ),
    patents: Math.floor(logUniform(rnd, 2, 600)),
    techRoute: pick(rnd, TECH_ROUTES),
  };

  const scale5 = () => clamp(1 + Math.floor(rnd() * 5), 1, 5);
  const trade = excellent
    ? {
        supplierStability: 4 + Math.round(rnd()),
        downstreamQuality: 5,
        arAuthenticity: 4 + Math.round(rnd()),
        orderAuthenticity: 4 + Math.round(rnd()),
        chainDependence: 3 + Math.round(rnd()),
      }
    : {
        supplierStability: scale5(),
        downstreamQuality: clamp(Math.round(1 + topCustomerQuality * 4), 1, 5),
        arAuthenticity: rnd() < 0.12 ? scale5() : 4,
        orderAuthenticity: rnd() < 0.1 ? scale5() : 4,
        chainDependence: scale5(),
      };

  const litigationCount = rnd() < 0.62 ? 0 : Math.floor(rnd() * 3);
  const governance = {
    controllerStability: rnd() < 0.85 ? 4 + Math.round(rnd()) : scale5(),
    creditRecord: rnd() < 0.88 ? 4 + Math.round(rnd()) : scale5(),
    litigationCount,
    majorLitigation: rnd() < 0.03,
    externalGuarantee: guarantees > 0,
    relatedTxRisk: rnd() < 0.85 ? 1 + Math.floor(rnd() * 2) : scale5(),
  };

  // 产业集群与区域生态（V2.0 新增维度）：区分注册地、实际生产运营地与真实业务关联。
  const provinceKey = company.region?.province || '未知';
  const clusterInfo = CLUSTER_BY_PROVINCE[provinceKey] || {
    name: `${provinceKey === '未知' ? '未识别区域' : CONFIG.clusterFallback(provinceKey)}`,
    maturity: 2,
  };
  const inCluster = rnd() < 0.78;
  const productionInCluster = inCluster && rnd() < 0.62;
  const realBusinessLinks = productionInCluster ? rnd() < 0.6 : inCluster && rnd() < 0.22;
  const keyPositionBase = headTier === '龙头' ? 0.85 : headTier === '骨干' ? 0.65 : 0.4;
  const keyPosition = clamp(keyPositionBase + lerp(-0.15, 0.15, rnd()), 0.1, 1);
  const homogeneityRisk = clamp(
    (inCluster ? 0.4 : 0.2) + (distressed ? 0.2 : 0) + lerp(-0.15, 0.35, rnd()),
    0.05,
    0.9,
  );
  const cluster = {
    name: clusterInfo.name,
    province: provinceKey,
    city: company.region?.city || '',
    inCluster,
    productionInCluster,
    realBusinessLinks,
    maturity: clamp(clusterInfo.maturity + (excellent ? 1 : distressed ? -1 : 0), 1, 5),
    keyPosition: Number(keyPosition.toFixed(2)),
    positionLabel:
      headTier === '龙头'
        ? '集群核心企业'
        : productionInCluster
          ? realBusinessLinks
            ? '集群内关键供应商/配套'
            : '集群内生产企业'
          : inCluster
            ? '仅园区注册企业'
            : '集群外企业',
    facilities: clamp(Math.round(lerp(2, 5, rnd())), 1, 5),
    policySupport: clamp(Math.round(lerp(2, 5, rnd())), 1, 5),
    homogeneityRisk: Number(homogeneityRisk.toFixed(2)),
    contagionRisk:
      homogeneityRisk > 0.72 && headTier !== '龙头' ? '高' : homogeneityRisk > 0.6 ? '中' : '低',
    dependencyNote:
      homogeneityRisk > 0.72
        ? '集群内同质化产能集中，对核心链主订单依赖较高'
        : '集群内分工相对分散，风险传导有限',
  };

  // 投融资经历与资本验证（V2.0 新增维度）：融资轮次、投资方类型、到账证据、投后表现与结构风险。
  const rounds = listed
    ? 2 + Math.floor(rnd() * 3)
    : earlyStage
      ? rnd() < 0.55
        ? 1
        : 0
      : Math.floor(rnd() * 3);
  const intentOnly = rounds === 0 && rnd() < 0.18;
  const investorTier =
    rounds === 0
      ? null
      : excellent || headTier === '龙头'
        ? pick(rnd, ['产业资本', '产业资本', '知名机构'])
        : pick(rnd, ['一般机构', '产业资本', '一般机构', '知名机构']);
  const evidence = listed
    ? '公告/验资'
    : rounds > 0
      ? pick(rnd, ['工商变更', '工商变更', '企业自述'])
      : '未披露';
  const stageMatch =
    rounds === 0 ? null : rnd() < 0.62 ? '匹配' : rnd() < 0.7 ? '略滞后' : '不匹配';
  const postPerformance = rounds === 0 ? null : pick(rnd, ['改善', '持平', '持平', '恶化']);
  const structureRisk = clamp(lerp(0.05, 0.75, rnd()) * (distressed ? 1.25 : 1), 0.02, 0.95);
  const capital = {
    rounds,
    intentOnly,
    investorTier: investorTier || '—',
    investors: investorTier
      ? Array.from(
          new Set([pick(rnd, INVESTOR_POOL[investorTier]), pick(rnd, INVESTOR_POOL[investorTier])]),
        )
      : [],
    evidence,
    stageMatch: stageMatch || '—',
    postPerformance: postPerformance || '—',
    structureRisk: Number(structureRisk.toFixed(2)),
    structureNote:
      structureRisk > 0.6
        ? '存在回购/对赌条款或明股实债特征，需核查资金属性与期限匹配'
        : '融资条款常规，未见明显结构风险',
  };

  // 红线 / 风险事件（稀疏触发，个别事件由财务形态直接推导）。
  const ocfDebtRatio = interestBearingDebt > 0 ? ocfNow / interestBearingDebt : 0;
  const events = {
    majorDefault: false,
    majorDishonesty: rnd() < 0.008,
    fraudRisk: rnd() < 0.004,
    fundOccupation: rnd() < 0.006,
    severeViolation: rnd() < 0.005,
    // 待核实信号：尚未完成主体匹配与时点核实，按规则不得直接自动否决。
    majorDefaultPending: rnd() < 0.006,
    majorDishonestyPending: rnd() < 0.01,
    fundOccupationPending: rnd() < 0.008,
    ocfPersistentDeterioration: ocfNow < 0 && ocfPrev < 0,
    borrowToRepay: rnd() < 0.03,
    debtMaturityMismatch: stDebt / Math.max(interestBearingDebt, 1) > 0.72 && rnd() < 0.5,
    arAbnormalGrowth: arGrowth > 0.45 && arNow / Math.max(revenueNow, 1) > 0.35,
    inventoryAbnormal: invGrowth > 0.4 && invNow / Math.max(revenueNow, 1) > 0.25,
    shortDebtPressure: stDebt / Math.max(cash + Math.max(ocfNow, 0), 1) > 2.2,
    capacityLow: capacityUtilization < 0.45,
    coreCustomerLoss: rnd() < 0.02,
    productReplaced: tech.techIterRisk === '高' && rnd() < 0.2,
    orderCancel: rnd() < 0.02,
    safetyIncident: rnd() < 0.008,
  };
  if (profile.model === 'operator' || profile.model === 'project' || profile.model === 'cni') {
    events.projectNotGridConnected = rnd() < 0.02;
    events.projectRevenueUnclear = rnd() < 0.03;
    events.insuranceMissing = rnd() < 0.04;
  }

  const operatorExtra =
    profile.model === 'operator'
      ? {
          projectIrr: lerp(0.035, 0.115, rnd()),
          dscr: lerp(0.85, 1.7, rnd()),
          pricePolicyRisk: pick(rnd, ['低', '中', '中', '高']),
          batteryDecayRate: lerp(0.018, 0.045, rnd()),
        }
      : null;
  const cniExtra =
    profile.model === 'cni'
      ? {
          paybackYears: lerp(4, 9.5, rnd()),
          peakValleySpread: lerp(0.45, 1.2, rnd()),
          ownerCreditRisk: pick(rnd, ['低', '中', '高']),
        }
      : null;
  // 企业发展阶段（第三层）：结合收入、交付、上市与运营记录判定，不得仅看成立年限或融资轮次。
  const stage = earlyStage
    ? revenueNow < 1.2e7
      ? 'early_rnd'
      : 'pilot'
    : deriveStage({
        revenue: revenueNow,
        listed,
        metrics: { operatorExtra, cniExtra, orders, capacityUtilization },
      });

  return {
    stage,
    cluster,
    capital,
    quality: Number(q.toFixed(3)),
    revenue: Math.round(revenueNow),
    revenueSeries: [Math.round(revenuePrev2), Math.round(revenuePrev), Math.round(revenueNow)],
    revenueGrowth: Number(g0.toFixed(4)),
    grossMargin: Number(grossMargin.toFixed(4)),
    netMargin: Number(netMargin.toFixed(4)),
    netProfit: Math.round(netProfit),
    netProfitSeries: [
      Math.round(revenuePrev2 * netMargin * lerp(0.8, 1.2, rnd())),
      Math.round(revenuePrev * netMargin * lerp(0.9, 1.15, rnd())),
      Math.round(netProfit),
    ],
    ebitda: Math.round(ebitda),
    interestExpense: Math.round(interestExpense),
    operatingCashFlow: Math.round(ocfNow),
    ocfSeries: [Math.round(ocfPrev2), Math.round(ocfPrev), Math.round(ocfNow)],
    cashflowTrap,
    totalAssets: Math.round(totalAssets),
    totalLiabilities: Math.round(totalLiabilities),
    debtRatio: Number(debtRatio.toFixed(4)),
    interestBearingDebt: Math.round(interestBearingDebt),
    shortTermDebt: Math.round(stDebt),
    cash: Math.round(cash),
    currentRatio: Number(currentRatio.toFixed(2)),
    quickRatio: Number(quickRatio.toFixed(2)),
    accountsReceivable: Math.round(arNow),
    arSeries: [Math.round(arPrev2), Math.round(arPrev), Math.round(arNow)],
    arGrowth: Number(arGrowth.toFixed(4)),
    inventory: Math.round(invNow),
    inventorySeries: [
      Math.round(invPrev * lerp(0.8, 1.2, rnd())),
      Math.round(invPrev),
      Math.round(invNow),
    ],
    inventoryGrowth: Number(invGrowth.toFixed(4)),
    guarantees: Math.round(guarantees),
    capacityUtilization: Number(capacityUtilization.toFixed(3)),
    orders: Math.round(orders),
    customerConcentration: Number(customerConcentration.toFixed(3)),
    topCustomerQuality: Number(topCustomerQuality.toFixed(2)),
    employees,
    foundedYear,
    registeredCapital: Math.round(registeredCapital),
    tech,
    trade,
    governance,
    events,
    operatorExtra,
    cniExtra,
    keyCustomers: [],
  };
}

function main() {
  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const companies = [];
  const idByName = new Map();

  for (const company of raw.companies) {
    idByName.set(company.name, company.id);
  }

  // 演示「高分 + 重大违约 → 一票否决」场景：选一家龙头上市企业。
  let vetoDemoName = null;
  const vetoCandidate = raw.companies.find(
    (item) =>
      (item.tags?.includes('上市企业') ||
        item.companyType === 'listed' ||
        item.listStatus === '上市') &&
      (item.research?.additionalFields?.headTier || item.tierLabel) === '龙头',
  );
  if (vetoCandidate) vetoDemoName = vetoCandidate.name;

  let evaluatedCount = 0;
  for (const company of raw.companies) {
    const sector = company.tertiarySector || company.sector || '';
    const typeKey = SECTOR_TYPE[sector] || 'service';
    const profile = TYPE_PROFILE[typeKey];
    // 集成电路链（ic-chain.json）用 listStatus 标记上市口径，其他分片用 companyType / tags。
    const listed =
      company.tags?.includes('上市企业') ||
      company.companyType === 'listed' ||
      company.listStatus === '上市';
    // 算力分片没有 research.additionalFields，这里回落到分片自身字段。
    const additional = company.research?.additionalFields || {
      stockShort: company.stockName || '',
      stockCode: company.stockCode || '',
      headTier: company.tierLabel || '',
      storageGrade: company.grade || '',
    };
    const rnd = mulberry32(hashSeed(`${SALT}:${company.id}`));
    const evaluated = Boolean(sector) && (listed || rnd() < 0.55);

    const record = {
      id: company.id,
      name: company.name,
      stockShort: additional.stockShort || '',
      stockCode: additional.stockCode || '',
      chain: company.chain || '待研判',
      sector,
      segment: SEGMENT_BY_CHAIN[company.chain] || '中游',
      type: typeKey,
      typeLabel: CONFIG.typeLabelFromSector ? sector || profile.label : profile.label,
      model: profile.model,
      industry: CONFIG.label,
      region: {
        province: company.region?.province || '未知',
        city: company.region?.city || '',
      },
      listed,
      grade: company.grade || '',
      storageGrade: additional.storageGrade || company.grade || '',
      headTier: additional.headTier || '',
      products: company.products || '',
      evaluated,
    };

    if (evaluated) {
      record.metrics = generateMetrics(company, rnd);
      if (company.name === vetoDemoName) {
        record.metrics.events.majorDefault = true;
        record.metrics.quality = 0.92;
      }
      evaluatedCount += 1;
    }
    companies.push(record);
  }

  const relations = [];
  for (const relation of raw.relations || []) {
    const fromId = idByName.get(relation.from);
    const toId = idByName.get(relation.to);
    if (!fromId || !toId) continue;
    relations.push({
      id: relation.id,
      fromId,
      toId,
      fromName: relation.from,
      toName: relation.to,
      relationType: relation.relationType || '供应',
      basis: relation.basis || '',
    });
  }

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    schemaVersion: 2,
    industry: CONFIG.key,
    industryLabel: CONFIG.label,
    sourceNote: CONFIG.sourceNote,
    evaluatedCount,
    totalCompanies: companies.length,
    companies,
    relations,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 1)}\n`, 'utf8');
  const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(
    `credit mock ready: ${companies.length} companies (${evaluatedCount} evaluated, ${relations.length} relations) -> ${path.relative(rootDir, outputPath)} (${sizeMb} MB)`,
  );
}

main();
