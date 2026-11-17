// 生成算力产业链数据底座：compute-chain.json + companies-compute.json
//
// 输入：
//   - outputs/.算力清单合并.ref/final.json（614 家合并去重后的企业主体，含 19 环节归属）
//   - public/data/industries/companies-ai.json（AI 算力基础设施 896 家，含属地）
//   - 本地企业库（集成电路 / 储能 / 人工智能 / 电力装备 / 生物医药）用于补属地
//   - docs/listed-location-candidates.json（上市公司年报办公地址）
//
// 口径：
//   - 4 个一级环节 / 19 个二级环节；「待核实」不入链，进入 warnings
//   - 上市企业与重点非上市企业进 companies（图谱口径），其余进 otherCustomers（客户池口径）
//   - 属地只做"有据可依"的补充：本地库命中 → 城市级；仅省级 → 区域参考；无依据 → pending
//   - 不生成供应链关系（无公开披露依据），relations 为空并如实标注

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '../../frontend'); // frontend
const publicDir = path.join(rootDir, 'public');
const outDir = path.join(publicDir, 'data', 'industries');
const outputPrefix = 'compute';

const FINAL = path.resolve(
  'D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/.算力清单合并.ref/final.json',
);

const INDUSTRY = '算力产业';
const INDUSTRY_CODE = 'CP';

// 一级环节 → 二级环节（顺序即展示顺序）
const CHAIN = [
  {
    code: '01',
    label: '算力芯片与核心器件',
    position: '上游',
    note: 'AI 芯片 · 存储 · 封测 · PCB · 光芯片 · 供配电',
    children: [
      { code: 'C1', label: 'AI芯片与加速卡', note: 'GPU / NPU / DCU / DPU / ASIC' },
      { code: 'C2', label: '存储与内存接口', note: 'DRAM · 企业级 SSD · 存储主控' },
      { code: 'C3', label: '先进封装与测试', note: '先进封装 · 晶圆测试 · 成品测试' },
      { code: 'C4', label: 'PCB与覆铜板', note: '高多层板 · HDI · 高速覆铜板' },
      { code: 'C5', label: '光芯片与光器件', note: '激光器 · 探测器 · 光引擎' },
      { code: 'C6', label: '电源与供配电', note: 'UPS · 柴发 · PDU · 电源模块' },
    ],
  },
  {
    code: '02',
    label: '算力设备与网络',
    position: '中游',
    note: '整机 · 液冷 · 交换 · 光模块 · 连接 · 光纤',
    children: [
      { code: 'E1', label: 'AI服务器整机', note: '训练/推理服务器 · 超节点 · ODM' },
      { code: 'E2', label: '液冷温控', note: '冷板 · CDU · 浸没 · 机房空调' },
      { code: 'E3', label: '交换机与网络设备', note: '数据中心交换机 · 路由 · 网络 OS' },
      { code: 'E4', label: '光模块与CPO', note: '400G/800G/1.6T · 硅光 · CPO' },
      { code: 'E5', label: '高速连接与铜缆', note: '高速连接器 · 背板 · DAC/AEC' },
      { code: 'E6', label: '光纤光缆', note: '光纤预制棒 · 光缆 · 跳线' },
    ],
  },
  {
    code: '03',
    label: '算力基础设施',
    position: '下游',
    note: 'IDC · 智算中心 · 机房建设 · 运营商网络',
    children: [
      { code: 'I1', label: 'IDC与智算中心', note: '第三方 IDC · 智算中心 · AIDC' },
      { code: 'I2', label: '机房建设与集成', note: 'EPC · 机柜 · 机电总包 · 设计院' },
      { code: 'I3', label: '运营商算力网络', note: '移动 / 电信 / 联通算力网络' },
    ],
  },
  {
    code: '04',
    label: '算力服务与运营',
    position: '下游',
    note: '算力租赁 · 云调度 · 运维 · 需求方',
    children: [
      { code: 'S1', label: '算力租赁与运营', note: '算力租赁 · 智算运营 · 资源转售' },
      { code: 'S2', label: '云计算与算力调度', note: '公有云 · 私有云 · 调度平台 · 云原生' },
      { code: 'S3', label: '数据中心运维', note: '运维服务 · 监控 · 能效管理' },
      { code: 'S4', label: '算力需求方', note: '大模型 · 行业用户 · 科研机构' },
    ],
  },
];

const CHAIN_BY_SEG = new Map();
for (const chain of CHAIN) {
  for (const child of chain.children) CHAIN_BY_SEG.set(child.label, { chain, child });
}

// 省会 / 直辖市参考坐标（区域参考点，不代表企业精确位置）
const PROVINCE_CENTER = {
  北京市: [116.4074, 39.9042],
  天津市: [117.2008, 39.0842],
  上海市: [121.4737, 31.2304],
  重庆市: [106.5516, 29.563],
  河北省: [114.5149, 38.0428],
  山西省: [112.5489, 37.8706],
  内蒙古自治区: [111.7499, 40.8424],
  辽宁省: [123.4315, 41.8057],
  吉林省: [125.3235, 43.8171],
  黑龙江省: [126.5349, 45.8038],
  江苏省: [118.7969, 32.0603],
  浙江省: [120.1551, 30.2741],
  安徽省: [117.2272, 31.8206],
  福建省: [119.2965, 26.0745],
  江西省: [115.8582, 28.6829],
  山东省: [117.1205, 36.651],
  河南省: [113.6254, 34.7466],
  湖北省: [114.3054, 30.5931],
  湖南省: [112.9388, 28.2282],
  广东省: [113.2644, 23.1291],
  广西壮族自治区: [108.3665, 22.817],
  海南省: [110.1983, 20.044],
  四川省: [104.0665, 30.5723],
  贵州省: [106.6302, 26.6477],
  云南省: [102.8329, 24.8801],
  西藏自治区: [91.1409, 29.6456],
  陕西省: [108.9398, 34.3416],
  甘肃省: [103.8343, 36.0611],
  青海省: [101.7782, 36.6171],
  宁夏回族自治区: [106.2309, 38.4872],
  新疆维吾尔自治区: [87.6168, 43.8256],
  中国香港: [114.1694, 22.3193],
  中国台湾: [121.5654, 25.033],
};

const norm = (value) =>
  String(value || '')
    .replace(/有限责任公司|股份有限公司|有限公司|集团|控股|公司/g, '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/\s/g, '')
    .trim();

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const round = (value, digits = 2) => Number(value.toFixed(digits));

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

// ---------- 1. 读入企业主体 ----------
const final = readJson(FINAL);
const ai = readJson(path.join(publicDir, 'data/industries/companies-ai.json'));
const aiCompute = ai.companies.filter((c) => c.secondaryIndustry === 'AI 算力基础设施');

// 本地企业库属地索引（城市级）
const localDb = [];
for (const relative of [
  'data/companies.json',
  'data/industries/companies-storage.json',
  'data/industries/companies-ai.json',
  'data/industries/companies-power.json',
  'data/industries/companies-biomed.json',
]) {
  const file = path.join(publicDir, relative);
  if (!fs.existsSync(file)) continue;
  for (const company of readJson(file).companies || []) {
    if (!company?.name) continue;
    const key = norm(company.name);
    if (key.length >= 3) localDb.push({ key, company });
  }
}

// 上市公司公告办公地址（优先于企业库里的注册地）
const addressCandidates = new Map();
for (const row of readJson(path.join(rootDir, 'docs/listed-location-candidates.json')).candidates || []) {
  const address = row?.extracted?.address;
  if (!address) continue;
  addressCandidates.set(norm(row.stockName || row.name), address);
}

function provinceFromAddress(address) {
  if (!address) return '';
  const direct = Object.keys(PROVINCE_CENTER).find((province) => address.includes(province.slice(0, 2)));
  if (direct) return direct;
  const aliases = {
    北京: '北京市', 上海: '上海市', 天津: '天津市', 重庆: '重庆市',
    河北: '河北省', 山西: '山西省', 内蒙古: '内蒙古自治区', 辽宁: '辽宁省',
    吉林: '吉林省', 黑龙江: '黑龙江省', 江苏: '江苏省', 浙江: '浙江省',
    安徽: '安徽省', 福建: '福建省', 江西: '江西省', 山东: '山东省',
    河南: '河南省', 湖北: '湖北省', 湖南: '湖南省', 广东: '广东省',
    广西: '广西壮族自治区', 海南: '海南省', 四川: '四川省', 贵州: '贵州省',
    云南: '云南省', 西藏: '西藏自治区', 陕西: '陕西省', 甘肃: '甘肃省',
    青海: '青海省', 宁夏: '宁夏回族自治区', 新疆: '新疆维吾尔自治区',
    香港: '中国香港', 台湾: '中国台湾',
  };
  for (const [alias, province] of Object.entries(aliases)) {
    if (address.startsWith(alias)) return province;
  }
  return '';
}

function cityFromAddress(address, province) {
  if (!address || !province) return '';
  const rest = address.slice(province.slice(0, 2).length);
  const match = rest.match(/^([^省市区县]{2,8}市)/);
  return match ? match[1] : '';
}

// 上市公司注册地（省级，模型知识库整理，标注为候选地点）
const listedProvince = readJson(path.join(here, 'listed-province.json')).rows || {};

function lookupLocation(entity) {
  const candidates = [entity.key, ...(entity.names || [])].map(norm).filter((k) => k.length >= 3);
  // 1) 上市公司公告办公地址
  for (const key of candidates) {
    const address = addressCandidates.get(key);
    if (address) {
      const province = provinceFromAddress(address);
      if (province) {
        return {
          province,
          city: cityFromAddress(address, province),
          district: '',
          street: '',
          address,
          addressSource: '上市公司年报办公地址',
          regionStatus: '已核实',
          source: 'listed-location-candidates',
        };
      }
    }
  }
  // 2) 本地企业库（名称包含匹配）
  const hit = localDb.find((row) =>
    candidates.some((key) => row.key === key || row.key.includes(key) || key.includes(row.key)),
  );
  if (hit?.company?.region?.province) {
    const region = hit.company.region;
    return {
      province: region.province,
      city: region.city || '',
      district: region.district || '',
      street: region.street || '',
      address: hit.company.address || '',
      addressSource: hit.company.addressSource || '本地企业库',
      regionStatus: region.city ? '已核实' : '区域参考',
      location: hit.company.location || null,
      locationStatus: hit.company.locationStatus || '',
      source: 'local-company-db',
    };
  }
  // 3) AI 算力企业池（城市级）
  const poolKey = norm(entity.key);
  const pool = aiCompute.find((c) => norm(c.name) === poolKey || norm(c.name).includes(poolKey));
  if (pool?.region?.province) {
    return {
      province: pool.region.province,
      city: pool.region.city || '',
      district: pool.region.district || '',
      street: pool.region.street || '',
      address: pool.address || '',
      addressSource: 'AI 算力企业库',
      regionStatus: '区域参考',
      location: null,
      locationStatus: '',
      source: 'ai-compute-pool',
    };
  }
  // 4) 上市公司注册地（省级候选，待复核）
  for (const name of [entity.key, ...(entity.names || [])]) {
    const province = listedProvince[String(name).trim()];
    if (province && PROVINCE_CENTER[province]) {
      return {
        province,
        city: '',
        district: '',
        street: '',
        address: '',
        addressSource: '公开注册地（省级）',
        regionStatus: '候选地点',
        location: null,
        locationStatus: '',
        source: 'listed-province-knowledge',
      };
    }
  }
  return null;
}

// ---------- 2. 组装主体 ----------
const mainEntities = [];
const pendingEntities = [];

for (const entity of final.main) {
  if (entity.seg === '待核实') {
    pendingEntities.push(entity);
    continue;
  }
  const mapped = CHAIN_BY_SEG.get(entity.seg);
  if (!mapped) {
    pendingEntities.push(entity);
    continue;
  }
  mainEntities.push({ ...entity, chain: mapped.chain, child: mapped.child });
}

// 环节内排序：市值优先，其次上市，其次是否原清单
const mcapOf = (entity) => (Number.isFinite(entity.mcap) ? entity.mcap : 0);
const rankOf = (entity) => (entity.type === '上市公司' ? 1 : 0);

const bySegment = new Map();
for (const entity of mainEntities) {
  const list = bySegment.get(entity.seg) || [];
  list.push(entity);
  bySegment.set(entity.seg, list);
}
const tierByName = new Map();
for (const list of bySegment.values()) {
  const sorted = [...list].sort((a, b) => mcapOf(b) - mcapOf(a) || rankOf(b) - rankOf(a));
  const ranked = sorted.filter((item) => item.type === '上市公司');
  const leaderCount = Math.max(1, Math.min(3, Math.round(ranked.length * 0.25)));
  ranked.forEach((item, index) => {
    tierByName.set(item.key, index < leaderCount ? 'leader' : index < leaderCount * 3 ? 'core' : 'tail');
  });
  for (const item of list) {
    if (!tierByName.has(item.key)) tierByName.set(item.key, item.srcs?.includes('原清单') ? 'core' : 'tail');
  }
}

const usedIds = new Set();
function makeId(prefix, seed) {
  let id = `${prefix}-${String(seed).padStart(4, '0')}`;
  let suffix = 1;
  while (usedIds.has(id)) {
    id = `${prefix}-${String(seed).padStart(4, '0')}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

const companies = [];
const otherCustomers = [];

let seq = 0;
for (const entity of mainEntities) {
  seq += 1;
  const fullName =
    (entity.names || []).find((name) => /(有限公司|股份有限公司|集团)/.test(name)) || entity.key;
  const location = lookupLocation(entity);
  const tier = tierByName.get(entity.key) || 'tail';
  const listed = entity.type === '上市公司';
  const grade = listed
    ? tier === 'lead' || tier === 'leader'
      ? '核心主业'
      : '相关重要'
    : entity.srcs?.includes('原清单')
      ? '核心主业'
      : '相关重要';
  const center = location?.province ? PROVINCE_CENTER[location.province] : null;
  const point = location?.location?.lng
    ? location.location
    : center
      ? {
          lng: center[0],
          lat: center[1],
          coordinateSystem: 'WGS84',
          precision: location.regionStatus === '已核实' && location.city ? '城市参考' : '区域参考',
        }
      : null;
  companies.push({
    id: makeId('cp', seq),
    name: fullName,
    normalizedName: norm(fullName),
    aliases: [...new Set([entity.key, ...(entity.names || [])].filter(Boolean))],
    companyType: listed ? 'listed' : 'ordinary',
    isKey: tier === 'leader',
    primaryIndustry: INDUSTRY,
    industryCode: INDUSTRY_CODE,
    rawIndustry: entity.seg,
    sourceFlag: 'Y',
    chain: entity.chain.label,
    level1: [entity.chain.label],
    level2: [entity.child.label],
    secondaryIndustry: entity.chain.label,
    secondaryCode: entity.chain.code,
    sector: entity.child.label,
    tertiarySector: entity.child.label,
    tertiaryCode: entity.child.code,
    classifications: [
      {
        chain: entity.chain.label,
        sector: entity.child.label,
        code: entity.child.code,
        confidence: 0.9,
        source: '算力产业链企业清单',
      },
    ],
    secondaryCodes: [entity.chain.code],
    classificationStatus: 'mapped',
    classificationMethod: entity.how === '人工核定' ? '清单人工核定' : '清单规则推断',
    classificationConfidence: entity.how === '人工核定' ? 0.92 : 0.72,
    classificationEvidence: `算力产业链企业清单（614 家合并版）· ${entity.how || '人工核定'}`,
    address: location?.address || '',
    addressSource: location?.addressSource || '',
    addressType: location?.address ? '办公/注册地址' : '',
    region: {
      province: location?.province || '',
      city: location?.city || '',
      district: location?.district || '',
      street: location?.street || '',
    },
    regionStatus: location?.regionStatus || '待补',
    location: point,
    locationStatus: point ? point.precision : '待补',
    locationSource: point
      ? location?.province
        ? `区域参考点（${location.province}${location.city || ''}）`
        : ''
      : '',
    locationEvidence: point ? '按省级行政区中心点定位，不代表企业精确位置' : '',
    coreTechnology: entity.note || '',
    coreTechnologySource: '企业清单「一句话定位」',
    procurement: '',
    products: entity.note || '',
    productsSource: '企业清单「一句话定位」',
    suppliers: [],
    distributors: [],
    equityRaw: '',
    controller: '',
    beneficiary: '',
    evidence: `入链依据：${(entity.srcs || []).join(' / ')}`,
    tags: listed ? ['上市企业'] : [],
    tagStatus: listed ? '已标记' : '',
    tagSource: listed ? '本地 A 股清单比对' : '',
    bank: '',
    research: '',
    profileId: '',
    stockCode: entity.code || '',
    stockName: entity.key,
    board: entity.exch || '',
    grade,
    fillMark: entity.how === '人工核定' ? '保留' : '补入',
    tier,
    tierLabel: tier === 'leader' ? '龙头' : tier === 'core' ? '骨干' : '长尾',
    relationCount: 0,
    // 客户池补充维度
    creditCode: '',
    mainBusiness: entity.note || '',
    otherSource: (entity.srcs || []).join('+'),
  });
}

// 非上市长尾客户池：614 中未入主清单的 + AI 算力企业池中未匹配的
const mainNames = new Set(companies.flatMap((c) => [norm(c.name), ...c.aliases.map(norm)]));
let customerSeq = 0;
for (const entity of [...final.main, ...final.weak]) {
  if (entity.seg !== '待核实' && CHAIN_BY_SEG.has(entity.seg)) continue; // 已在主清单
  const key = norm(entity.key);
  if (mainNames.has(key)) continue;
  customerSeq += 1;
  otherCustomers.push({
    name: entity.key,
    creditCode: '',
    codes: [],
    nodeDetail: entity.seg || '待核实',
    primaryCode: '',
    address: '',
    mainBusiness: entity.note || '',
    source: (entity.srcs || []).join('+') || '算力概念弱相关',
    verifyStatus: '未入链',
    province: '',
    city: '',
    district: '—',
    location: null,
    locationStatus: '待补',
    locationPrecision: '',
    locationSource: '',
    note: '仅出现在概念/弱相关名单，未纳入环节',
  });
}

let poolSeq = 0;
for (const entity of aiCompute) {
  const key = norm(entity.name);
  if (mainNames.has(key)) continue;
  if (otherCustomers.some((row) => norm(row.name) === key)) continue;
  poolSeq += 1;
  const segLabel =
    entity.tertiarySector === 'AI算力服务'
      ? '云计算与算力调度'
      : entity.tertiarySector === 'AIDC投资运营'
        ? 'IDC与智算中心'
        : 'AI服务器整机';
  const chain = CHAIN_BY_SEG.get(segLabel);
  otherCustomers.push({
    name: entity.name,
    creditCode: '',
    codes: chain ? [chain.child.code] : [],
    nodeDetail: chain ? `${chain.child.code} ${chain.child.label}` : 'AI算力硬件',
    primaryCode: chain ? chain.child.code : '',
    address: entity.address || '',
    mainBusiness: entity.products || '',
    source: 'AI 算力企业库',
    verifyStatus: '环节参考',
    province: entity.region?.province || '',
    city: entity.region?.city || '',
    district: entity.region?.district || '—',
    location:
      entity.region?.province && PROVINCE_CENTER[entity.region.province]
        ? {
            lng: PROVINCE_CENTER[entity.region.province][0],
            lat: PROVINCE_CENTER[entity.region.province][1],
            coordinateSystem: 'WGS84',
            precision: '区域参考',
          }
        : null,
    locationStatus: '区域参考',
    locationPrecision: entity.region?.city ? '城市参考' : '区域参考',
    locationSource: `区域参考点（${entity.region?.province || ''}${entity.region?.city || ''}）`,
    note: `按 AI 算力基础设施三级分类「${entity.tertiarySector || ''}」映射`,
  });
}

console.log(`主清单 ${companies.length} 家；客户池 ${otherCustomers.length} 家；未入链 ${pendingEntities.length} 家`);

// ---------- 3. 统计 ----------
const countBy = (list, key) => {
  const map = new Map();
  for (const item of list) map.set(key(item), (map.get(key(item)) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

const listedCount = companies.filter((c) => c.companyType === 'listed').length;
const tierCount = {
  leader: companies.filter((c) => c.tier === 'leader').length,
  core: companies.filter((c) => c.tier === 'core').length,
  tail: companies.filter((c) => c.tier === 'tail').length,
};

const levels = CHAIN.map((chain, chainIndex) => {
  const children = chain.children.map((child, childIndex) => {
    const rows = companies.filter((c) => c.tertiarySector === child.label);
    const childListed = rows.filter((c) => c.companyType === 'listed');
    // 与储能链同构：companies 为该环节企业全量行；heads 为「细分环节」名单
    // （算力链无外部披露的细分名单，按链内龙头 + 骨干生成，如实反映入链口径）。
    const headMembers = rows
      .filter((c) => c.tier === 'leader' || c.tier === 'core')
      .map((c) => ({ name: c.name, tier: c.tier, tierLabel: c.tierLabel }));
    return {
      order: childIndex + 1,
      nodeKey: `${chain.code}-${chain.label}-${child.label}`,
      code2: child.code,
      label: child.label,
      note: child.note,
      companyCount: rows.length,
      listedCount: childListed.length,
      companies: rows,
      heads: [
        {
          segment: child.label,
          declaredTotal: rows.length,
          declaredHead: headMembers.length,
          leaderCount: rows.filter((c) => c.tier === 'leader').length,
          coreCount: rows.filter((c) => c.tier === 'core').length,
          members: headMembers,
        },
      ],
      grades: countBy(rows, (c) => c.grade).map(([grade, count]) => ({ grade, count })),
      leaderCount: rows.filter((c) => c.tier === 'leader').length,
      coreCount: rows.filter((c) => c.tier === 'core').length,
      tailCount: rows.filter((c) => c.tier === 'tail').length,
      otherCount: otherCustomers.filter((c) => (c.codes || []).includes(child.code)).length,
      others: otherCustomers
        .filter((c) => (c.codes || []).includes(child.code))
        .slice(0, 12)
        .map((c) => ({
          name: c.name,
          creditCode: c.creditCode,
          primaryCode: c.primaryCode,
          codes: c.codes,
          province: c.province,
          city: c.city,
          district: c.district,
          source: c.source,
          verifyStatus: c.verifyStatus,
          locationStatus: c.locationStatus,
        })),
    };
  });
  const rows = companies.filter((c) => c.chain === chain.label);
  return {
    code: chain.code,
    label: chain.label,
    position: chain.position,
    note: chain.note,
    order: chainIndex + 1,
    childCount: children.length,
    companyCount: rows.length,
    companyRowCount: rows.length,
    leaderCount: rows.filter((c) => c.tier === 'leader').length,
    coreCount: rows.filter((c) => c.tier === 'core').length,
    tailCount: rows.filter((c) => c.tier === 'tail').length,
    children,
  };
});

const positions = ['上游', '中游', '下游'].map((position) => {
  const chains = levels.filter((level) => level.position === position);
  return {
    id: position,
    label: position,
    note:
      position === '上游'
        ? '芯片 · 存储 · 封测 · PCB · 光芯片 · 供配电'
        : position === '中游'
          ? '整机 · 液冷 · 交换 · 光模块 · 连接 · 光纤'
          : 'IDC · 机房 · 运营商 · 算力服务与运营',
    level1Count: chains.length,
    level2Count: chains.reduce((sum, level) => sum + level.childCount, 0),
    companyCount: chains.reduce((sum, level) => sum + level.companyCount, 0),
    span: {
      start: chains.length ? chains[0].order : 0,
      end: chains.length ? chains[chains.length - 1].order : 0,
    },
  };
});

const boards = countBy(
  companies.filter((c) => c.board),
  (c) => c.board,
);
const provinces = countBy(
  companies.filter((c) => c.region.province),
  (c) => c.region.province,
);
const cities = countBy(
  companies.filter((c) => c.region.city),
  (c) => c.region.city,
);
const placed = companies.filter((c) => c.location);
const pendingLocation = companies.filter((c) => !c.location);

const stats = {
  level1: CHAIN.length,
  level2: CHAIN.reduce((sum, chain) => sum + chain.children.length, 0),
  rows: companies.length,
  companies: companies.length,
  listed: listedCount,
  nonListed: companies.length - listedCount,
  leader: tierCount.leader,
  core: tierCount.core,
  tail: tierCount.tail,
  coreMain: companies.filter((c) => c.grade === '核心主业').length,
  coreGrade: companies.filter((c) => c.grade === '相关重要').length,
  important: companies.filter((c) => c.grade !== '边缘观察').length,
  edge: companies.filter((c) => c.grade === '边缘观察').length,
  relations: 0,
  relationSupply: 0,
  relationEquity: 0,
  relationCompanies: 0,
  externalMentions: 0,
  externalUpstream: 0,
  externalDownstream: 0,
  otherCustomers: otherCustomers.length,
  placed: placed.length,
  pendingLocation: pendingLocation.length,
};

const payload = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString().slice(0, 10),
  industry: INDUSTRY,
  industryCode: INDUSTRY_CODE,
  source:
    '《算力产业链企业清单》合并版（614 家企业主体，含 19 个环节归属）+ 项目「人工智能」产业链 AI 算力基础设施 896 家企业 + 本地企业库属地比对',
  stats,
  positions,
  levels,
  companies,
  relations: [],
  externalMentions: [],
  externalVerified: [],
  otherCustomers,
  customerStats: {
    listed: listedCount,
    other: otherCustomers.length,
    total: companies.length + otherCustomers.length,
    otherListed: 0,
    otherRealLocation: otherCustomers.filter((c) => c.location && c.locationPrecision === '城市参考').length,
    otherRegionReference: otherCustomers.filter((c) => c.location).length,
    otherUnplaced: otherCustomers.filter((c) => !c.location).length,
    otherBySource: countBy(otherCustomers, (c) => c.source).map(([k, v]) => ({ k, v })),
    otherByVerify: countBy(otherCustomers, (c) => c.verifyStatus).map(([k, v]) => ({ k, v })),
    officialCodeMismatch: [],
  },
  otherNote:
    '客户池为非上市及长尾主体：来自原清单未入主清单部分、东财概念弱相关标的，以及项目「人工智能」产业链中「AI 算力基础设施」二级分类企业。环节归属按三级分类映射，仅供获客参考，不构成已核实的供应链关系。',
  territory: {
    total: companies.length,
    provinces: provinces.length,
    cities: cities.length,
    withDistrict: companies.filter((c) => c.region.district && c.region.district !== '—').length,
    withStreet: companies.filter((c) => c.region.street).length,
    withPark: 0,
    offshore: companies.filter((c) => /香港|台湾|境外/.test(c.region.province)).length,
    topProvinces: provinces.slice(0, 12).map(([k, v]) => ({ k, v })),
    topCities: cities.slice(0, 12).map(([k, v]) => ({ k, v })),
    offshoreList: companies
      .filter((c) => /香港|台湾|境外/.test(c.region.province))
      .map((c) => ({ name: c.stockName, province: c.region.province, note: '境外注册，境内有运营主体' })),
  },
  customerTerritory: {
    listed: listedCount,
    other: otherCustomers.length,
    total: companies.length + otherCustomers.length,
    provinces: new Set([
      ...companies.map((c) => c.region.province).filter(Boolean),
      ...otherCustomers.map((c) => c.province).filter(Boolean),
    ]).size,
    cities: new Set([
      ...companies.map((c) => c.region.city).filter(Boolean),
      ...otherCustomers.map((c) => c.city).filter(Boolean),
    ]).size,
    topProvinces: provinces.slice(0, 14).map(([k, v]) => ({ k, listed: v, other: 0 })),
    topCities: cities.slice(0, 14).map(([k, v]) => ({ k, listed: v, other: 0 })),
  },
  territoryNote:
    '属地来源：上市公司年报办公地址 / 本地企业库 / AI 算力企业库。无城市级依据的主体按省级中心点作「区域参考」标注，未取得任何依据的主体标为「待补」，不作推测。',
  externalNote: '本期未接入算力供应链关系披露，relations 为空；关系穿透待补充年报前五大客户/供应商数据后启用。',
  steps: [
    {
      id: 'nodes',
      index: 1,
      title: '形成环节骨架',
      note: '先定一级、二级环节，把链的骨架搭起来',
      detail:
        '按算力从「芯片—整机—组网—机房—算力服务」的交付链条，确定 4 个一级环节、19 个二级环节；口径参考工信部算力基础设施政策、ODCC 数据中心角色分类与行业研报。',
      status: 'ready',
      stats: { level1: CHAIN.length, level2: stats.level2 },
    },
    {
      id: 'companies',
      index: 2,
      title: '企业入链',
      note: '把企业按主营归入唯一主环节',
      detail: `以 614 家合并清单的环节归属为主干，逐家核对主营后入链：上市企业 ${listedCount} 家、重点非上市企业 ${companies.length - listedCount} 家；另有 ${otherCustomers.length} 家长尾主体进入客户池。`,
      status: 'ready',
      stats: { companies: companies.length, listed: listedCount },
    },
    {
      id: 'tier',
      index: 3,
      title: '分层与画像',
      note: '按环节内规模与上市属性分层，补齐属地与产品',
      detail: `每个二级环节按市值与上市属性排出龙头/骨干/长尾：龙头 ${tierCount.leader} 家、骨干 ${tierCount.core} 家、长尾 ${tierCount.tail} 家。属地优先取年报办公地址，其次企业库，无法核实的不作推测。`,
      status: 'ready',
      stats: { leader: tierCount.leader, core: tierCount.core, tail: tierCount.tail },
    },
    {
      id: 'relations',
      index: 4,
      title: '关系与图谱',
      note: '供应/股权关系穿透，形成可查询的图谱',
      detail:
        '本期未取得算力产业链公开的供应关系披露，relations 暂为空，图谱按「环节—企业」结构展示；后续接入年报前五大客户/供应商后即可启用关系穿透。',
      status: 'partial',
      stats: { relations: 0 },
    },
  ],
  distributions: {
    grades: countBy(companies, (c) => c.grade).map(([k, v]) => ({ k, v })),
    fillMarks: countBy(companies, (c) => c.fillMark).map(([k, v]) => ({ k, v })),
    boards: boards.map(([k, v]) => ({ k, v })),
    swSectors: countBy(
      companies.filter((c) => c.tertiarySector),
      (c) => c.tertiarySector,
    )
      .slice(0, 12)
      .map(([k, v]) => ({ k, v })),
  },
  warnings: {
    emptyNodes: [],
    nodesWithoutHeads: levels
      .flatMap((level) => level.children.filter((child) => child.leaderCount === 0))
      .map((child) => `${child.nodeKey}`),
    unmatchedCompanyRows: [],
    headNamesNotInCompanyTable: [],
    headAliasApplied: [],
    tierConflicts: [],
    relationAliasApplied: [],
    companiesWithoutRelationProfile: companies.map((c) => c.stockName).slice(0, 0),
    relationRowsNotInCompanyTable: [],
    territoryMissing: pendingLocation.map((c) => c.stockName),
    territoryRowsNotInCompanyTable: [],
    officialNodeCodeMismatch: [],
    otherCustomersWithoutNode: otherCustomers.filter((c) => !c.nodes?.length && !c.codes?.length).map((c) => c.name),
    otherCustomersUnplaced: otherCustomers.filter((c) => !c.location).map((c) => c.name),
    unclassified: pendingEntities.map((entity) => ({ name: entity.key, seg: entity.seg, note: entity.note })),
  },
};

// ---------- 4. 写文件 ----------
fs.mkdirSync(outDir, { recursive: true });
const chainFile = path.join(outDir, `${outputPrefix}-chain.json`);
fs.writeFileSync(chainFile, `${JSON.stringify(payload, null, 0)}\n`, 'utf8');

const shard = {
  generatedAt: payload.generatedAt,
  schemaVersion: 2,
  industry: INDUSTRY,
  industryCode: INDUSTRY_CODE,
  counts: {
    totalCompanies: companies.length + otherCustomers.length,
    mapped: companies.length,
    verifiedLocation: companies.filter((c) => c.regionStatus === '已核实').length,
    candidateLocation: companies.filter((c) => c.regionStatus === '区域参考').length,
    regionReferenceLocation: otherCustomers.filter((c) => c.location).length,
    pendingLocation: companies.filter((c) => !c.location).length,
    missingAddress: companies.filter((c) => !c.address).length,
    listed: listedCount,
    nonListed: companies.length - listedCount,
    neeqListed: 0,
    relationCount: 0,
    classification: {
      secondary: Object.fromEntries(levels.map((level) => [level.label, level.companyCount])),
      tertiary: Object.fromEntries(
        levels.flatMap((level) => level.children.map((child) => [child.label, child.companyCount])),
      ),
    },
    headTiers: { 龙头: tierCount.leader, 骨干: tierCount.core, 长尾: tierCount.tail },
    relationTypes: {},
  },
  companies: [
    ...companies,
    ...otherCustomers.map((customer, index) => ({
      id: `cp-other-${String(index + 1).padStart(4, '0')}`,
      name: customer.name,
      normalizedName: norm(customer.name),
      aliases: [],
      companyType: 'ordinary',
      isKey: false,
      primaryIndustry: INDUSTRY,
      industryCode: INDUSTRY_CODE,
      rawIndustry: customer.nodeDetail,
      sourceFlag: 'N',
      chain: customer.primaryCode
        ? CHAIN.find((chain) => chain.children.some((child) => child.code === customer.primaryCode))?.label || ''
        : '',
      level1: customer.primaryCode
        ? [
            CHAIN.find((chain) => chain.children.some((child) => child.code === customer.primaryCode))
              ?.label || '',
          ].filter(Boolean)
        : [],
      level2: customer.primaryCode
        ? [
            CHAIN.flatMap((chain) => chain.children).find((child) => child.code === customer.primaryCode)
              ?.label || '',
          ].filter(Boolean)
        : [],
      secondaryIndustry: customer.primaryCode
        ? CHAIN.find((chain) => chain.children.some((child) => child.code === customer.primaryCode))?.label || ''
        : '',
      secondaryCode: '',
      sector: customer.nodeDetail,
      tertiarySector: customer.primaryCode
        ? CHAIN_BY_SEG.get(
            CHAIN.flatMap((chain) => chain.children).find((child) => child.code === customer.primaryCode)?.label ||
              '',
          )?.child.label || ''
        : '',
      tertiaryCode: customer.primaryCode,
      classifications: customer.primaryCode
        ? [
            {
              chain: CHAIN.find((chain) => chain.children.some((child) => child.code === customer.primaryCode))
                ?.label,
              sector: customer.nodeDetail,
              code: customer.primaryCode,
              confidence: 0.5,
              source: '环节参考映射',
            },
          ]
        : [],
      secondaryCodes: [],
      classificationStatus: customer.primaryCode ? 'candidate' : 'pending',
      classificationMethod: '池内映射',
      classificationConfidence: 0.5,
      classificationEvidence: customer.note || '',
      address: customer.address,
      addressSource: '',
      addressType: '',
      region: {
        province: customer.province,
        city: customer.city,
        district: customer.district,
        street: '',
      },
      regionStatus: customer.location ? '区域参考' : '待补',
      location: customer.location,
      locationStatus: customer.locationStatus,
      locationSource: customer.locationSource,
      locationEvidence: '',
      coreTechnology: customer.mainBusiness,
      coreTechnologySource: '',
      procurement: '',
      products: customer.mainBusiness,
      productsSource: '',
      suppliers: [],
      distributors: [],
      equityRaw: '',
      controller: '',
      beneficiary: '',
      evidence: customer.note || '',
      tags: [],
      tagStatus: '',
      tagSource: '',
      bank: '',
      research: '',
      profileId: '',
      stockCode: '',
      stockName: customer.name,
      board: '',
      grade: '边缘观察',
      fillMark: '观察池',
      tier: 'tail',
      tierLabel: '长尾',
      relationCount: 0,
      creditCode: '',
      mainBusiness: customer.mainBusiness,
      otherSource: customer.source,
    })),
  ],
  relations: [],
};

const shardFile = path.join(outDir, `companies-${outputPrefix}.json`);
fs.writeFileSync(shardFile, `${JSON.stringify(shard, null, 0)}\n`, 'utf8');

console.log(
  `已生成：${path.basename(chainFile)}（${(fs.statSync(chainFile).size / 1024 / 1024).toFixed(2)} MB）` +
    ` / ${path.basename(shardFile)}（${(fs.statSync(shardFile).size / 1024 / 1024).toFixed(2)} MB）`,
);
console.log(`属地：已核实 ${shard.counts.verifiedLocation} · 区域参考 ${shard.counts.candidateLocation} · 待补 ${shard.counts.pendingLocation}`);
console.log('一级环节：', levels.map((level) => `${level.label}(${level.companyCount})`).join(' / '));
