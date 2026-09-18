import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { CHAIN_PALETTE } from '../src/chainPalette.js';
import { createIndustryMapper, mappingSummary } from './industry-mapping.mjs';

const root = process.cwd();
const inputPath = process.env.MASTER_SOURCE_PATH
  ? path.resolve(root, process.env.MASTER_SOURCE_PATH)
  : path.join(root, '..', '可参考内容', 'con_info1.xlsx');
const keyCompanyResearchPath = path.join(root, 'docs', 'key-company-research.json');
const enrichmentPath = path.join(root, 'docs', 'key-company-enrichment.json');
const listedCandidatesPath = path.join(root, 'docs', 'listed-location-candidates.json');
const listedEvidencePath = path.join(root, 'docs', 'listed-company-evidence.json');
const outputPath = path.join(root, 'public', 'data', 'companies.json');
const crosswalkPath = path.join(root, 'docs', 'key-company-crosswalk.json');
const taxonomyPath = path.join(root, 'docs', 'industry-taxonomy.json');
const mappingOverridesPath = path.join(root, 'docs', 'industry-mapping-overrides.json');
const mappingAuditPath = path.join(root, 'docs', 'industry-mapping-audit.json');
const locationResearchPaths = [
  path.join(root, 'docs', 'coordinate-research.json'),
  path.join(root, 'docs', 'manual-location-research.json'),
  path.join(root, 'docs', 'researched-locations.json'),
  path.join(root, 'docs', 'reference-location-research.json'),
  path.join(root, 'docs', '360-poi-research.json'),
  path.join(root, 'docs', 'tencent-poi-research.json'),
  path.join(root, 'docs', 'amap-geocode-research.json'),
  path.join(root, 'docs', 'amap-poi-research.json'),
  path.join(root, 'docs', 'region-location-research.json'),
];

const normalize = (value) =>
  String(value || '')
    .replace(/^\s*[>→-]+\s*/, '')
    .replace(/[（）()\s·.。、“”‘’'"，,；;：:、_\-]/g, '')
    .toLowerCase();

const cleanAddress = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const regionValue = (value) => {
  if (Array.isArray(value))
    return value.map((item) => String(item || '').trim()).find(Boolean) || '';
  return String(value || '').trim();
};

const normalizeRegion = (region = {}) => ({
  province: regionValue(region.province),
  city: regionValue(region.city),
  district: regionValue(region.district),
  street: regionValue(region.street),
});

const legalSuffixPattern = /(股份有限公司|有限责任公司|有限公司|集团公司|控股公司|集团|股份|公司)$/;

const SECONDARY_CHAIN_TAGS = new Set(
  CHAIN_PALETTE.flatMap((group) => [group.label, group.legendLabel, ...group.aliases]),
);
const LISTED_COMPANY_TAG = '上市企业';
const RELATION_SUPPLEMENT_SOURCE = '历史企业画像（一级上下游）';
const REMOVED_SYSTEM_TAGS = new Set([...SECONDARY_CHAIN_TAGS, '重点企业', '普通企业']);
const isListedCompany = (company) => company?.tags?.includes(LISTED_COMPANY_TAG) || false;

const cityToProvince = {
  北京市: '北京市',
  天津市: '天津市',
  上海市: '上海市',
  重庆市: '重庆市',
  石家庄市: '河北省',
  唐山市: '河北省',
  邯郸市: '河北省',
  保定市: '河北省',
  太原市: '山西省',
  呼和浩特市: '内蒙古自治区',
  沈阳市: '辽宁省',
  大连市: '辽宁省',
  长春市: '吉林省',
  哈尔滨市: '黑龙江省',
  南京市: '江苏省',
  无锡市: '江苏省',
  徐州市: '江苏省',
  常州市: '江苏省',
  苏州市: '江苏省',
  南通市: '江苏省',
  扬州市: '江苏省',
  镇江市: '江苏省',
  泰州市: '江苏省',
  杭州市: '浙江省',
  宁波市: '浙江省',
  温州市: '浙江省',
  嘉兴市: '浙江省',
  湖州市: '浙江省',
  绍兴市: '浙江省',
  金华市: '浙江省',
  衢州市: '浙江省',
  台州市: '浙江省',
  合肥市: '安徽省',
  芜湖市: '安徽省',
  蚌埠市: '安徽省',
  淮南市: '安徽省',
  马鞍山市: '安徽省',
  福州市: '福建省',
  厦门市: '福建省',
  泉州市: '福建省',
  南昌市: '江西省',
  济南市: '山东省',
  青岛市: '山东省',
  烟台市: '山东省',
  郑州市: '河南省',
  武汉市: '湖北省',
  黄冈市: '湖北省',
  襄阳市: '湖北省',
  长沙市: '湖南省',
  株洲市: '湖南省',
  南宁市: '广西壮族自治区',
  广州市: '广东省',
  韶关市: '广东省',
  深圳市: '广东省',
  佛山市: '广东省',
  东莞市: '广东省',
  珠海市: '广东省',
  惠州市: '广东省',
  中山市: '广东省',
  江门市: '广东省',
  梅州市: '广东省',
  清远市: '广东省',
  汕头市: '广东省',
  潮州市: '广东省',
  河源市: '广东省',
  汕尾市: '广东省',
  肇庆市: '广东省',
  开平市: '广东省',
  鹤山市: '广东省',
  连州市: '广东省',
  成都市: '四川省',
  眉山市: '四川省',
  遂宁市: '四川省',
  绵阳市: '四川省',
  德阳市: '四川省',
  南充市: '四川省',
  宜宾市: '四川省',
  江油市: '四川省',
  乐山市: '四川省',
  射洪市: '四川省',
  什邡市: '四川省',
  雅安市: '四川省',
  内江市: '四川省',
  攀枝花市: '四川省',
  崇州市: '四川省',
  泸州市: '四川省',
  自贡市: '四川省',
  绵竹市: '四川省',
  昆明市: '云南省',
  西安市: '陕西省',
  天水市: '甘肃省',
  兰州市: '甘肃省',
  海东市: '青海省',
  鄂尔多斯市: '内蒙古自治区',
  乌兰察布市: '内蒙古自治区',
  廊坊市: '河北省',
  遵化市: '河北省',
  三河市: '河北省',
  黄骅市: '河北省',
  锦州市: '辽宁省',
  营口市: '辽宁省',
  葫芦岛市: '辽宁省',
  抚顺市: '辽宁省',
  朝阳市: '辽宁省',
  江阴市: '江苏省',
  昆山市: '江苏省',
  宜兴市: '江苏省',
  海门市: '江苏省',
  常熟市: '江苏省',
  张家港市: '江苏省',
  启东市: '江苏省',
  如皋市: '江苏省',
  靖江市: '江苏省',
  新沂市: '江苏省',
  邳州市: '江苏省',
  泰兴市: '江苏省',
  连云港市: '江苏省',
  淮安市: '江苏省',
  宿迁市: '江苏省',
  句容市: '江苏省',
  东台市: '江苏省',
  海安市: '江苏省',
  高邮市: '江苏省',
  太仓市: '江苏省',
  溧阳市: '江苏省',
  盐城市: '江苏省',
  丽水市: '浙江省',
  余姚市: '浙江省',
  义乌市: '浙江省',
  舟山市: '浙江省',
  诸暨市: '浙江省',
  池州市: '安徽省',
  铜陵市: '安徽省',
  滁州市: '安徽省',
  宣城市: '安徽省',
  阜阳市: '安徽省',
  六安市: '安徽省',
  黄山市: '安徽省',
  广德市: '安徽省',
  宁国市: '安徽省',
  晋江市: '福建省',
  龙岩市: '福建省',
  莆田市: '福建省',
  漳州市: '福建省',
  吉安市: '江西省',
  淄博市: '山东省',
  德州市: '山东省',
  济宁市: '山东省',
  东营市: '山东省',
  潍坊市: '山东省',
  菏泽市: '山东省',
  泰安市: '山东省',
  曲阜市: '山东省',
  临沂市: '山东省',
  荣成市: '山东省',
  滕州市: '山东省',
  威海市: '山东省',
  枣庄市: '山东省',
  安丘市: '山东省',
  滨州市: '山东省',
  龙口市: '山东省',
  肥城市: '山东省',
  禹城市: '山东省',
  黄石市: '湖北省',
  孝感市: '湖北省',
  鄂州市: '湖北省',
  荆州市: '湖北省',
  荆门市: '湖北省',
  潜江市: '湖北省',
  随州市: '湖北省',
  恩施市: '湖北省',
  仙桃市: '湖北省',
  宜昌市: '湖北省',
  赤壁市: '湖北省',
  汉川市: '湖北省',
  大冶市: '湖北省',
  宜都市: '湖北省',
  监利市: '湖北省',
  天门市: '湖北省',
  当阳市: '湖北省',
  老河口市: '湖北省',
  香港: '香港特别行政区',
  澳门: '澳门特别行政区',
};

const cityNames = Object.keys(cityToProvince).sort((a, b) => b.length - a.length);

const sourceChainMap = {
  设计: {
    chain: '芯片设计与EDA',
    status: 'mapped',
    defaultSector: 'AI及高性能计算芯片',
    sectors: [
      'EDA/IP服务',
      'AI及高性能计算芯片',
      '存储芯片设计',
      '射频及MCU芯片设计',
      '功率器件设计',
      'SoC及多媒体芯片设计',
      '模拟及电源管理芯片',
      '图像传感器及显示驱动芯片',
    ],
  },
  材料: {
    chain: '半导体材料',
    status: 'mapped',
    defaultSector: '化合物半导体',
    sectors: ['化合物半导体', '半导体硅片', '光刻胶及配套材料', '电子特气', '溅射靶材'],
  },
  装备: {
    chain: '半导体设备',
    status: 'mapped',
    defaultSector: '清洗量检测及CMP设备',
    sectors: ['清洗量检测及CMP设备', '刻蚀设备', '薄膜沉积设备', '光刻设备'],
  },
  制造: {
    chain: '晶圆制造',
    status: 'mapped',
    defaultSector: '晶圆代工',
    sectors: ['晶圆代工'],
  },
  封测: {
    chain: '封装测试',
    status: 'mapped',
    defaultSector: '封装测试',
    sectors: ['封装测试'],
  },
  其他: {
    chain: '电子制造',
    status: 'mapped',
    defaultSector: 'PCB及电子制造',
    sectors: ['PCB及电子制造'],
  },
  '': {
    chain: '待分类',
    status: 'missing-source-classification',
    defaultSector: '细分环节待补齐',
    sectors: [],
  },
};

const legacySectorChainMap = [
  {
    chain: '芯片设计与EDA',
    sectors: [
      'EDA/IP服务',
      'AI及高性能计算芯片',
      '存储芯片设计',
      '射频及MCU芯片设计',
      '功率器件设计',
      'SoC及多媒体芯片设计',
      '模拟及电源管理芯片',
      '图像传感器及显示驱动芯片',
    ],
  },
  {
    chain: '半导体材料',
    sectors: ['化合物半导体', '半导体硅片', '光刻胶及配套材料', '电子特气', '溅射靶材'],
  },
  { chain: '半导体设备', sectors: ['清洗量检测及CMP设备', '刻蚀设备', '薄膜沉积设备', '光刻设备'] },
  { chain: '晶圆制造', sectors: ['晶圆代工'] },
  { chain: '封装测试', sectors: ['封装测试'] },
  { chain: '电子制造', sectors: ['PCB及电子制造'] },
];

const chainInfoForSector = (sector) =>
  legacySectorChainMap.find((entry) => entry.sectors.includes(sector)) || {
    chain: '待分类',
    sectors: [],
  };

const sectorForRow = (chainInfo, rawChain, profileSector) => {
  if (profileSector && chainInfo.sectors.includes(profileSector)) return profileSector;
  if (profileSector && !rawChain) return profileSector;
  return chainInfo.defaultSector || profileSector || '细分环节待补齐';
};

// These are common short names used by the legacy 130-company research set.
// They are only matching hints; the generated crosswalk records the selected
// candidate and the evidence used so ambiguous matches can be reviewed.
const legacyNameAliases = {
  沪硅产业: '硅产业',
  中船特气: '派瑞特种气体',
  欧莱新材: '欧莱新材料',
  西安奕材: '奕斯伟材料',
  华为海思: '海思',
  '上海微电子(SMEE)': '上海微电子装备',
  深科技: '长城开发',
  晶瑞电材: '晶瑞',
  安集科技: '安集',
  盛美上海: '盛美',
  至纯科技: '至纯',
  韦尔股份: '韦尔',
  安路科技: '安路',
  国科微: '国科',
  源杰科技: '源杰',
  晶方科技: '晶方',
  扬杰科技: '扬杰',
  时代电气: '时代电气',
  长光辰芯: '长光辰芯',
  嘉立创: '立创',
  辰瑞光学: '辰瑞',
  强脑科技: '强脑',
  宏光半导体: '宏光',
  云英谷: '云英谷',
};

// Explicit matches are used only where the current workbook contains a
// legal-name variant or a clearly identifiable subsidiary. The crosswalk
// keeps the method and candidate list so these decisions remain reviewable.
const legacyTargetOverrides = {
  豪威集团: { targetName: '豪威集成电路（集团）股份有限公司' },
  华天科技: { targetName: '华天科技（昆山）电子有限公司', method: 'group-subsidiary' },
  华润微: { targetName: '华润微电子有限公司' },
  长电科技: { targetName: '江苏长电科技股份有限公司' },
  紫光国微: { targetName: '紫光国芯微电子股份有限公司', allowSharedTarget: true },
  欧莱新材: { targetName: '广东欧莱高新材料股份有限公司' },
  伏达半导体: { targetName: '伏达半导体（合肥）股份有限公司' },
  海光信息: { targetName: '海光信息技术股份有限公司' },
  华虹半导体: { targetName: '华虹半导体（无锡）有限公司' },
  江丰电子: { targetName: '宁波江丰电子材料股份有限公司' },
  金海通: { targetName: '天津金海通半导体设备股份有限公司' },
  精测电子: { targetName: '武汉精测电子集团股份有限公司' },
  时代电气: { targetName: '株洲中车时代半导体有限公司' },
  // The workbook contains the Shanghai operating company at the same
  // address; the parent name “韦尔股份” itself is not present in the rows.
  韦尔股份: { targetName: '豪威科技（上海）有限公司', method: 'name-address-subsidiary' },
  紫光国芯: { targetName: '紫光国芯微电子股份有限公司' },
  // Historical research contains two names for the same legal entity.
  武汉新芯: { targetName: '武汉新芯集成电路股份有限公司', allowSharedTarget: true },
  新芯集成: { targetName: '武汉新芯集成电路股份有限公司', allowSharedTarget: true },
};

// These names are present in the legacy research set, but the new workbook
// contains no safe legal-name or subsidiary match. Keep their public research
// in the audit files, but do not append a map-only row or assign a merely
// similar company such as “国科天骥” or “深圳市振华微电子”。
const legacyProfileOnlyNames = new Set([
  '辰瑞光学',
  '宏光半导体',
  '嘉立创',
  '强脑科技',
  '源杰科技',
  '长光辰芯',
  '国科微',
  '华微电子',
]);

const compactName = (value) =>
  legalSuffixPattern.exec(normalize(value))
    ? normalize(value).replace(legalSuffixPattern, '')
    : normalize(value);

const cityForAddress = (address) => {
  const text = String(address || '');
  const fullMatches = cityNames.filter((city) => city.endsWith('市') && text.includes(city));
  if (fullMatches.length) {
    return fullMatches.sort((left, right) => {
      const leftIndex = text.lastIndexOf(left);
      const rightIndex = text.lastIndexOf(right);
      return rightIndex - leftIndex || right.length - left.length;
    })[0];
  }
  return (
    cityNames
      .filter((city) => {
        const token = city.replace(/市$/, '');
        const index = text.lastIndexOf(token);
        if (index < 0) return false;
        const following = text.slice(index + token.length);
        return !/^(路|街|道|号|弄|巷|桥|隧道|地铁|公交)/.test(following);
      })
      .sort((left, right) => {
        const leftIndex = text.lastIndexOf(left.replace(/市$/, ''));
        const rightIndex = text.lastIndexOf(right.replace(/市$/, ''));
        return rightIndex - leftIndex || right.length - left.length;
      })[0] || ''
  );
};

const regionForAddress = (address) => {
  const text = cleanAddress(address);
  const city = cityForAddress(text);
  const province = cityToProvince[city] || '';
  const cityToken = city && text.includes(city) ? city : city.replace(/市$/, '');
  const cityIndex = cityToken ? text.lastIndexOf(cityToken) : -1;
  const afterCity = cityIndex >= 0 ? text.slice(cityIndex + cityToken.length) : text;
  const district =
    afterCity.match(/([\u4e00-\u9fa5]{2,8}(?:新区|区|县))/)?.[1]?.replace(/^试验区$/, '') || '';
  const street = afterCity.match(/([\u4e00-\u9fa5]{2,16}(?:路|街|道|镇|乡))/)?.[1] || '';
  return { province, city, district, street };
};

const addressTokens = (address) => {
  const text = normalize(address);
  return [
    ...(text.match(/[\u4e00-\u9fa5]{2,}(?:路|街|道|号|弄|巷|园|大厦|中心)/g) || []),
    ...(text.match(/\d+[a-z]?/gi) || []),
  ].filter((token) => token.length >= 2);
};

const addressSimilarity = (left, right) => {
  const leftTokens = new Set(addressTokens(left));
  const rightTokens = addressTokens(right);
  if (!leftTokens.size || !rightTokens.length) return 0;
  return rightTokens.filter((token) => leftTokens.has(token)).length / rightTokens.length;
};

const matchScore = (profile, row) => {
  const profileName = normalize(profile.name);
  const aliasName = normalize(legacyNameAliases[profile.name] || profile.name);
  const targetName = normalize(row.name);
  const profileCore = compactName(aliasName);
  const targetCore = compactName(targetName);
  if (!profileCore || !targetCore) return -Infinity;
  const contained = profileCore.includes(targetCore) || targetCore.includes(profileCore);
  if (!contained) return -Infinity;
  let score = Math.min(profileCore.length, targetCore.length) * 12;
  if (profileName === targetName) score += 1000;
  if (targetCore === profileCore) score += 320;
  if (targetCore.startsWith(profileCore) || profileCore.startsWith(targetCore)) score += 90;
  const profileCity = cityForAddress(profile.address);
  const targetCity = cityForAddress(row.address);
  if (profileCity && profileCity === targetCity) score += 130;
  else if (profileCity && targetCity) score -= 45;
  score += Math.round(addressSimilarity(profile.address, row.address) * 160);
  return score;
};

const chooseCrosswalk = (profiles, rows) => {
  const candidates = profiles.map((profile) => ({
    profile,
    override: legacyTargetOverrides[profile.name] || null,
    candidates: rows
      .map((row, rowIndex) => ({ row, rowIndex, score: matchScore(profile, row) }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name, 'zh-CN')),
  }));
  const assignments = new Map();
  const usedRows = new Set();
  const rowByName = new Map(rows.map((row, rowIndex) => [normalize(row.name), { row, rowIndex }]));
  const assign = (entry, selected, status, method) => {
    const shared = Boolean(entry.override?.allowSharedTarget);
    if (selected && !shared) usedRows.add(selected.rowIndex);
    const supplemented = legacyProfileOnlyNames.has(entry.profile.name);
    const enrichment = enrichmentsByProfileName.get(entry.profile.name);
    const targetId = selected ? `company-${String(selected.rowIndex + 1).padStart(4, '0')}` : '';
    assignments.set(entry.profile.id, {
      profileId: entry.profile.id,
      profileName: entry.profile.name,
      targetId,
      targetName: selected?.row.name || '',
      targetAddress: selected?.row.address || enrichment?.address || entry.profile.address || '',
      confidence: selected ? Math.min(0.99, Math.max(0.35, selected.score / 520)) : 0,
      status: supplemented ? 'source-not-found' : status,
      method: supplemented
        ? 'not-in-master-workbook'
        : method ||
          (selected
            ? legacyNameAliases[entry.profile.name]
              ? 'alias-name-city-address'
              : 'name-city-address'
            : 'unmatched'),
      candidates: entry.candidates.slice(0, 5).map((candidate) => ({
        id: `company-${String(candidate.rowIndex + 1).padStart(4, '0')}`,
        name: candidate.row.name,
        address: candidate.row.address,
        score: candidate.score,
      })),
    });
  };

  // Reserve explicit matches first so a generic short-name match cannot take
  // a row that has a stronger address or legal-name explanation.
  for (const entry of candidates) {
    if (legacyProfileOnlyNames.has(entry.profile.name)) {
      assign(entry, null, 'supplemented', 'legacy-profile-supplemented');
      continue;
    }
    const override = entry.override;
    if (!override?.targetName) continue;
    const target = rowByName.get(normalize(override.targetName));
    if (!target) {
      assign(entry, null, 'source-not-found', override.method || 'explicit-target-missing');
      continue;
    }
    const calculated = entry.candidates.find((candidate) => candidate.rowIndex === target.rowIndex);
    const selected = {
      row: target.row,
      rowIndex: target.rowIndex,
      score: calculated?.score ?? 240,
    };
    assign(entry, selected, 'matched', override.method || 'explicit-name-address');
  }

  for (const entry of [...candidates]
    .filter((candidate) => !assignments.has(candidate.profile.id))
    .sort(
      (a, b) => (a.candidates[0]?.score || -Infinity) - (b.candidates[0]?.score || -Infinity),
    )) {
    const available = entry.candidates.filter((candidate) => !usedRows.has(candidate.rowIndex));
    const selected = available[0] || entry.candidates[0];
    if (!selected) {
      assign(entry, null, 'source-not-found');
      continue;
    }
    assign(entry, selected, selected.score >= 110 ? 'matched' : 'needs-review');
  }
  return assignments;
};

const mergeProfile = (base, profile) => {
  if (!profile) return base;
  const profileHasMockTags = profile.tagStatus === 'demo-mock';
  const profileBank = profile.bank || {};
  const profileHasMockBank = profileBank.sourceBatch === 'mock';
  const safeTags = Array.from(
    new Set([...(profileHasMockTags ? [] : profile.tags || []), ...(profile.publicTags || [])]),
  );
  const safeBank = {
    isOurCustomer: profileHasMockBank ? null : (profileBank.isOurCustomer ?? null),
    isCreditCustomer: profileHasMockBank ? null : (profileBank.isCreditCustomer ?? null),
    otherBankCustomer: profileHasMockBank ? null : (profileBank.otherBankCustomer ?? null),
    sourceBatch: profileHasMockBank
      ? 'not-researched'
      : profileBank.sourceBatch || 'not-researched',
  };
  return {
    ...base,
    aliases: Array.from(
      new Set([...(base.aliases || []), profile.name, ...(profile.aliases || [])]),
    ),
    address: base.address || profile.address || '',
    addressSource: base.address
      ? base.addressSource
      : profile.address
        ? 'legacy-public-research'
        : base.addressSource,
    region: base.address ? base.region : profile.region,
    location: profile.location || base.location,
    locationStatus: profile.location ? '已复核' : base.locationStatus,
    locationSource: profile.locationSource || base.locationSource,
    locationEvidence: profile.locationEvidence || base.locationEvidence,
    coreTechnology: profile.coreTechnology || base.coreTechnology || '',
    coreTechnologySource: profile.coreTechnology
      ? 'legacy-public-research'
      : base.coreTechnologySource,
    procurement: profile.procurement || base.procurement || '',
    products: profile.products || base.products || '',
    productsSource: profile.products ? 'legacy-public-research' : base.productsSource,
    suppliers: profile.suppliers || base.suppliers || { level1: [], level2: [] },
    distributors: profile.distributors || base.distributors || { level1: [], level2: [] },
    equityRaw: profile.equityRaw || base.equityRaw || '',
    controller: profile.controller || base.controller || '',
    beneficiary: profile.beneficiary || base.beneficiary || '',
    evidence: Array.from(
      new Set([
        ...(base.evidence || []),
        ...(profile.evidence || []),
        ...(profile.publicTagEvidence || []),
      ]),
    ),
    tags: Array.from(new Set([...(base.tags || []), ...safeTags])),
    tagStatus: profile.publicTags?.length
      ? '已核验'
      : profileHasMockTags
        ? '待核验'
        : profile.tagStatus || base.tagStatus || '待核验',
    tagSource: profile.publicTags?.length
      ? 'cninfo-annual-report'
      : safeTags.length
        ? 'legacy-public-research'
        : base.tagSource,
    bank: safeBank,
    research: {
      ...(profile.research || {}),
      status: '历史研究档案',
      source: 'legacy-130-research',
    },
    profileId: profile.id,
    profileIds: Array.from(new Set([...(base.profileIds || []), profile.id])),
    profileNames: Array.from(new Set([...(base.profileNames || []), profile.name])),
  };
};

const locationResearchRecords = locationResearchPaths.flatMap((filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return (payload.records || []).map((record) => ({
    ...record,
    __sourceFile: path.basename(filePath),
  }));
});
const locationResearchByName = new Map();
for (const record of locationResearchRecords) {
  const key = normalize(record.name);
  if (!key) continue;
  const records = locationResearchByName.get(key) || [];
  records.push(record);
  locationResearchByName.set(key, records);
}

const mergeLocationResearch = (company) => {
  const names = [company.name, ...(company.profileNames || []), ...(company.aliases || [])];
  const records = names.flatMap((name) => locationResearchByName.get(normalize(name)) || []);
  if (!records.length) return company;
  const withLocation = records.find((record) => record.location);
  const withCandidateLocation = records.find((record) => record.candidateLocation);
  const withRegionLocation = records.find((record) => record.regionLocation);
  const withAddress = records.find((record) => record.address);
  const sourceUrls = Array.from(new Set(records.flatMap((record) => record.sourceUrl || [])));
  const selectedLocation =
    withLocation?.location ||
    company.location ||
    withCandidateLocation?.candidateLocation ||
    withRegionLocation?.regionLocation;
  const selectedLocationStatus = withLocation?.location
    ? withLocation.locationStatus || '已复核'
    : company.location
      ? company.locationStatus
      : withCandidateLocation?.candidateLocation
        ? '候选'
        : withRegionLocation?.regionLocation
          ? '区域参考'
          : company.locationStatus;
  const selectedLocationSource =
    withLocation?.locationSource ||
    company.locationSource ||
    withCandidateLocation?.locationSource ||
    withRegionLocation?.locationSource;
  return {
    ...company,
    address: company.address || withAddress?.address || withRegionLocation?.address || '',
    addressSource: company.address
      ? company.addressSource
      : withAddress?.address
        ? 'public-location-research'
        : company.addressSource,
    region:
      withRegionLocation?.region?.city || withRegionLocation?.region?.province
        ? withRegionLocation.region
        : company.region?.city || company.region?.province
          ? company.region
          : withAddress?.region || withLocation?.region || company.region,
    location: selectedLocation,
    locationStatus: selectedLocationStatus || withAddress?.locationStatus,
    locationSource: selectedLocationSource || withAddress?.locationSource,
    locationEvidence: Array.from(new Set([...(company.locationEvidence || []), ...sourceUrls])),
    addressType: withAddress?.addressType || company.addressType || '',
    research: {
      ...company.research,
      confidence:
        withLocation?.confidence ??
        (company.location ? company.research?.confidence : undefined) ??
        withCandidateLocation?.candidateLocation?.score ??
        withRegionLocation?.confidence ??
        withAddress?.confidence ??
        company.research?.confidence,
      lastReviewedAt:
        withLocation?.verifiedAt ||
        withRegionLocation?.verifiedAt ||
        withAddress?.verifiedAt ||
        company.research?.lastReviewedAt,
      addressType: withAddress?.addressType || company.research?.addressType || '',
    },
  };
};

const researchFieldStatusFor = (company) => {
  const hasOtherBankEvidence =
    company.bank?.otherBankCustomer === true || company.bank?.otherBankCustomer === false;
  return {
    address: company.address
      ? company.addressSource || 'source-workbook'
      : 'not-found-public-evidence',
    location: company.location
      ? ['已复核', 'verified'].includes(company.locationStatus)
        ? 'research-verified'
        : 'research-candidate-location'
      : company.address
        ? 'research-no-precise-result'
        : 'not-found-public-evidence',
    region:
      company.region?.province && company.region?.city
        ? 'derived-from-address'
        : 'pending-verification',
    classification:
      company.classificationStatus === 'manual'
        ? 'manual-verified'
        : company.classificationStatus === 'evidence-mapped'
          ? 'evidence-mapped'
          : company.classificationStatus === 'fallback'
            ? 'source-chain-fallback'
            : 'pending-verification',
    coreTechnology: company.coreTechnology
      ? company.coreTechnologySource || 'legacy-public-research'
      : 'pending-verification',
    products: company.products
      ? company.productsSource || 'legacy-public-research'
      : 'pending-verification',
    tags: company.tags?.length
      ? company.tagStatus === '待核验'
        ? 'pending-verification'
        : company.tagSource || 'legacy-public-research'
      : 'pending-verification',
    importance: isListedCompany(company) ? 'scope-derived' : 'pending-verification',
    otherBank: hasOtherBankEvidence ? 'internal-research' : 'pending-verification',
  };
};

const withDerivedTags = (company) => {
  const tags = new Set((company.tags || []).filter((tag) => !REMOVED_SYSTEM_TAGS.has(tag)));
  if (company.coreTechnology) tags.add('科技型企业');
  return {
    ...company,
    tags: Array.from(tags),
    tagStatus: '已生成',
    tagSource:
      company.tagSource && company.tagSource !== 'not-researched'
        ? company.tagSource
        : 'source-derived',
  };
};

const finalizeCompany = (company) => {
  const region = normalizeRegion(company.region);
  const normalizedCompany = { ...company, region };
  return {
    ...normalizedCompany,
    regionStatus:
      company.locationStatus === '区域参考'
        ? '区域参考'
        : region.province && region.city
          ? '已从地址解析'
          : '待核验',
    research: {
      ...(company.research || {}),
      fieldStatus: researchFieldStatusFor(normalizedCompany),
    },
  };
};

if (!fs.existsSync(inputPath)) throw new Error(`Missing source workbook: ${inputPath}`);
if (!fs.existsSync(keyCompanyResearchPath))
  throw new Error(`Missing key company research: ${keyCompanyResearchPath}`);
if (!fs.existsSync(taxonomyPath)) throw new Error(`Missing industry taxonomy: ${taxonomyPath}`);

const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
const mappingOverrides = fs.existsSync(mappingOverridesPath)
  ? JSON.parse(fs.readFileSync(mappingOverridesPath, 'utf8'))
  : { records: [] };
const mapCompanyIndustry = createIndustryMapper({ taxonomy, overrides: mappingOverrides });

const workbook = XLSX.readFile(inputPath, { cellDates: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((row, index) => ({
  rowNumber: index + 2,
  name: String(row['客户名称'] || '').trim(),
  rawChain: String(row['产业链环节'] || '').trim(),
  sourceFlag: String(row['Y/N'] || '').trim(),
  address: cleanAddress(row['注册地址']),
}));
if (rows.some((row) => !row.name))
  throw new Error('Source workbook contains a blank customer name');

const keyCompanyResearch = JSON.parse(fs.readFileSync(keyCompanyResearchPath, 'utf8'));
const enrichmentData = fs.existsSync(enrichmentPath)
  ? JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'))
  : { records: [] };
const listedCandidatesData = fs.existsSync(listedCandidatesPath)
  ? JSON.parse(fs.readFileSync(listedCandidatesPath, 'utf8'))
  : { candidates: [] };
const listedEvidenceData = fs.existsSync(listedEvidencePath)
  ? JSON.parse(fs.readFileSync(listedEvidencePath, 'utf8'))
  : { records: [] };
const enrichmentsByProfileName = new Map(
  (enrichmentData.records || []).map((record) => [normalize(record.profileName), record]),
);
const listedByProfileName = new Map(
  (listedCandidatesData.candidates || []).map((record) => [normalize(record.name), record]),
);
const listedByCompanyName = new Map(
  (listedEvidenceData.records || []).map((record) => [normalize(record.name), record]),
);
const profiles = (keyCompanyResearch.profiles || []).map((profile, index) => {
  const enrichment = enrichmentsByProfileName.get(normalize(profile.name));
  const listedRecord = listedByProfileName.get(normalize(profile.name));
  const publicTags = listedRecord?.code && listedRecord?.reportUrl ? ['上市企业'] : [];
  const normalizedProfile = {
    ...profile,
    id: `key-${String(index + 1).padStart(3, '0')}`,
    legacyProfileId: profile.id,
    publicTags,
    publicTagEvidence: publicTags.length
      ? [`${listedRecord.reportTitle || '年度报告'} · ${listedRecord.reportUrl}`]
      : [],
  };
  if (!enrichment) return normalizedProfile;
  return {
    ...normalizedProfile,
    aliases: Array.from(
      new Set([...(profile.aliases || []), enrichment.officialName].filter(Boolean)),
    ),
    officialName: enrichment.officialName || profile.officialName || '',
    locationEvidence: Array.from(
      new Set([...(profile.locationEvidence || []), ...(enrichment.locationEvidence || [])]),
    ),
    researchNote: enrichment.researchNote || profile.researchNote || '',
  };
});
const crosswalk = chooseCrosswalk(profiles, rows);
const profilesByTargetId = new Map();
for (const profile of profiles) {
  const match = crosswalk.get(profile.id);
  if (!match?.targetId) continue;
  const existing = profilesByTargetId.get(match.targetId) || [];
  existing.push(profile);
  profilesByTargetId.set(match.targetId, existing);
}

const withListedCompanyEvidence = (company) => {
  const record = listedByCompanyName.get(normalize(company.name));
  if (!record) return company;
  const evidence = `${record.source} · ${record.stockName}（${record.code}） · ${record.sourceUrl}`;
  return {
    ...company,
    tags: Array.from(new Set([...(company.tags || []), LISTED_COMPANY_TAG])),
    tagStatus: '已核验',
    tagSource: 'official-exchange-company-list',
    evidence: Array.from(new Set([...(company.evidence || []), evidence])),
    listedEvidence: {
      exchange: record.exchange,
      code: record.code,
      stockName: record.stockName,
      source: record.source,
      sourceUrl: record.sourceUrl,
      matchMethod: record.matchMethod,
      verifiedAt: record.verifiedAt,
    },
  };
};

const companies = rows.map((row, index) => {
  const id = `company-${String(index + 1).padStart(4, '0')}`;
  const chainInfo = sourceChainMap[row.rawChain] || sourceChainMap[''];
  const matchedProfiles = profilesByTargetId.get(id) || [];
  const profile = matchedProfiles[0];
  const base = {
    id,
    name: row.name,
    normalizedName: normalize(row.name),
    aliases: [],
    companyType: profile ? 'key' : 'ordinary',
    isKey: Boolean(profile),
    primaryIndustry: '集成电路',
    rawIndustry: row.rawChain,
    sourceFlag: row.sourceFlag,
    // Preserve the former mapping as source evidence. The official taxonomy
    // is applied after key-company profiles are merged, so technical/product
    // evidence can correct a source-row category when the two conflict.
    legacyChain: chainInfo.chain,
    legacySector: sectorForRow(chainInfo, row.rawChain, profile?.sector),
    legacySectorSource: profile?.sector
      ? 'legacy-key-profile'
      : row.rawChain
        ? 'source-chain-default'
        : 'missing-source',
    chain: chainInfo.chain,
    secondaryIndustry: chainInfo.chain,
    classificationStatus: chainInfo.status,
    sector: sectorForRow(chainInfo, row.rawChain, profile?.sector),
    sourceCoverage: 'new-workbook',
    address: row.address,
    addressSource: row.address ? 'source-workbook' : 'not-found-public-evidence',
    region: regionForAddress(row.address),
    regionStatus: row.address ? '待解析' : '待核验',
    location: null,
    locationStatus: row.address ? '待研究' : '地址待补',
    locationSource: '',
    locationEvidence: [],
    coreTechnology: '',
    coreTechnologySource: 'not-researched',
    procurement: '',
    products: '',
    productsSource: 'not-researched',
    suppliers: { level1: [], level2: [] },
    distributors: { level1: [], level2: [] },
    equityRaw: '',
    controller: '',
    beneficiary: '',
    evidence: [],
    tags: [],
    tagStatus: '待核验',
    tagSource: 'not-researched',
    bank: {
      isOurCustomer: null,
      isCreditCustomer: null,
      otherBankCustomer: null,
      sourceBatch: 'not-researched',
    },
    research: {
      status: profile ? '历史研究档案' : '标准企业档案',
      source: profile ? 'legacy-130-research' : 'new-coverage-workbook',
    },
    profileId: '',
  };
  const withProfiles = matchedProfiles.reduce(
    (company, matchedProfile) => mergeProfile(company, matchedProfile),
    base,
  );
  const mappedIndustry = mapCompanyIndustry(withProfiles);
  const researchedCompany = mergeLocationResearch({ ...withProfiles, ...mappedIndustry });
  return finalizeCompany(withDerivedTags(withListedCompanyEvidence(researchedCompany)));
});

const companyByLegacyName = new Map(profiles.map((profile) => [normalize(profile.name), profile]));
const targetIdForLegacyName = new Map(
  profiles
    .map((profile) => [normalize(profile.name), crosswalk.get(profile.id)?.targetId || ''])
    .filter(([, targetId]) => targetId),
);
const relationNameMatches = new Map();
for (const company of companies.filter(isListedCompany)) {
  const names = [
    company.name,
    company.normalizedName,
    ...(company.aliases || []),
    ...(company.profileNames || []),
    company.listedEvidence?.stockName,
  ];
  for (const name of names) {
    const key = normalize(name);
    if (!key) continue;
    const ids = relationNameMatches.get(key) || new Set();
    ids.add(company.id);
    relationNameMatches.set(key, ids);
  }
}
const companyByRelationName = new Map(
  Array.from(relationNameMatches.entries())
    .filter(([, ids]) => ids.size === 1)
    .map(([key, ids]) => [key, companies.find((company) => company.id === ids.values().next().value)]),
);
const profileRelationReferences = profiles.flatMap((profile) =>
  [
    { field: 'suppliers', relationType: '供应' },
    { field: 'distributors', relationType: '经销' },
  ].flatMap(({ field, relationType }) =>
    (profile[field]?.level1 || []).map((targetName) => ({
      from: profile.name,
      to: targetName,
      relationType,
      depth: 1,
      supplemented: true,
      source: RELATION_SUPPLEMENT_SOURCE,
      sourceFromProfile: profile.name,
      sourceRelationField: field,
      sourceRelationLevel: 'level1',
      sourceRelationName: targetName,
      sourceRecord: `key-company-research.json → profiles[${profile.name}].${field}.level1`,
      sourceEvidence: profile.evidence || [],
      sourceReviewedAt: profile.research?.lastReviewedAt || '',
    })),
  ),
);
const relationKeys = new Set();
const relations = [];
let relationSupplementCount = 0;
for (const relation of [...(keyCompanyResearch.relations || []), ...profileRelationReferences]) {
  const fromProfile = companyByLegacyName.get(normalize(relation.from));
  const toProfile = companyByLegacyName.get(normalize(relation.to));
  const fromId = fromProfile
    ? targetIdForLegacyName.get(normalize(fromProfile.name))
    : companyByRelationName.get(normalize(relation.from))?.id;
  const toId = toProfile
    ? targetIdForLegacyName.get(normalize(toProfile.name))
    : companyByRelationName.get(normalize(relation.to))?.id;
  if (!fromId || !toId || fromId === toId) continue;
  const key = `${fromId}|${toId}|${relation.relationType}|${relation.depth || 1}`;
  if (relationKeys.has(key)) continue;
  relationKeys.add(key);
  const from = companies.find((company) => company.id === fromId);
  const to = companies.find((company) => company.id === toId);
  if (!from || !to) continue;
  if (!isListedCompany(from) || !isListedCompany(to)) continue;
  relations.push({
    id: `relation-${String(relations.length + 1).padStart(4, '0')}`,
    from: from.name,
    to: to.name,
    relationType: relation.relationType,
    depth: relation.depth || 1,
    source: relation.source || '上市企业关系研究数据',
    ...(relation.sourceFromProfile || fromProfile?.name
      ? { sourceFromProfile: relation.sourceFromProfile || fromProfile.name }
      : {}),
    ...(relation.sourceToProfile || toProfile?.name
      ? { sourceToProfile: relation.sourceToProfile || toProfile.name }
      : {}),
    ...(relation.supplemented
      ? {
          sourceRelationField: relation.sourceRelationField,
          sourceRelationLevel: relation.sourceRelationLevel,
          sourceRelationName: relation.sourceRelationName,
          sourceRecord: relation.sourceRecord,
          sourceEvidence: Array.from(new Set(relation.sourceEvidence || [])),
          sourceReviewedAt: relation.sourceReviewedAt,
        }
      : {}),
  });
  if (relation.supplemented) relationSupplementCount += 1;
}

const counts = {
  listed: companies.filter(isListedCompany).length,
  ordinary: companies.filter((company) => company.companyType === 'ordinary').length,
  key: companies.filter((company) => company.companyType === 'key').length,
  totalCompanies: companies.length,
  mapped: companies.filter((company) => company.location).length,
  verifiedLocation: companies.filter(
    (company) => company.location && ['已复核', 'verified'].includes(company.locationStatus),
  ).length,
  candidateLocation: companies.filter(
    (company) => company.location && !['已复核', 'verified'].includes(company.locationStatus),
  ).length,
  regionReferenceLocation: companies.filter((company) => company.locationStatus === '区域参考')
    .length,
  pendingLocation: companies.filter((company) => !company.location).length,
  missingAddress: companies.filter((company) => !company.address).length,
  keyProfiles: profiles.length,
  keyTargetRows: companies.filter((company) => company.companyType === 'key').length,
  keySourceRows: companies.filter(
    (company) => company.companyType === 'key' && company.sourceCoverage === 'new-workbook',
  ).length,
  excludedKeyProfiles: Array.from(crosswalk.values()).filter(
    (record) => record.status === 'source-not-found',
  ).length,
  unresolvedKeyProfiles: Array.from(crosswalk.values()).filter((record) => !record.targetId).length,
  relationCount: relations.length,
  relationSupplementCount,
  sourceRows: rows.length,
  sourceFlagY: rows.filter((row) => row.sourceFlag.toUpperCase() === 'Y').length,
  sourceFlagN: rows.filter((row) => row.sourceFlag.toUpperCase() === 'N').length,
  classification: mappingSummary(companies),
};

const industryMappingAudit = {
  generatedAt: new Date().toISOString(),
  taxonomy: taxonomy.source,
  classifierVersion: 'industry-taxonomy-2026-08-v2',
  scope: {
    companyCount: companies.length,
    listedCompanyCount: companies.filter(isListedCompany).length,
    legacyProfileCompanyCount: companies.filter((company) => company.companyType === 'key').length,
    ordinaryCompanyCount: companies.filter((company) => company.companyType === 'ordinary').length,
  },
  summary: mappingSummary(companies),
  reviewQueue: companies
    .filter(
      (company) =>
        company.classificationStatus === 'pending' ||
        (company.companyType === 'key' && company.classificationStatus === 'fallback'),
    )
    .map((company) => ({
      id: company.id,
      name: company.name,
      companyType: company.companyType,
      rawIndustry: company.rawIndustry,
      legacyChain: company.legacyChain,
      legacySector: company.legacySector,
      secondaryCode: company.secondaryCode,
      tertiaryCode: company.tertiaryCode,
      status: company.classificationStatus,
      confidence: company.classificationConfidence,
      method: company.classificationMethod,
      evidence: company.classificationEvidence,
    })),
  records: companies.map((company) => ({
    id: company.id,
    name: company.name,
    companyType: company.companyType,
    rawIndustry: company.rawIndustry,
    legacyChain: company.legacyChain,
    legacySector: company.legacySector,
    secondaryCode: company.secondaryCode,
    secondaryLabel: company.secondaryIndustry,
    tertiaryCode: company.tertiaryCode,
    tertiaryLabel: company.sector,
    status: company.classificationStatus,
    confidence: company.classificationConfidence,
    method: company.classificationMethod,
    evidence: company.classificationEvidence,
  })),
};

fs.writeFileSync(
  crosswalkPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: '旧 130 家重点企业调研数据 + con_info1.xlsx',
      profileCount: profiles.length,
      matchedCount: Array.from(crosswalk.values()).filter((record) => record.status === 'matched')
        .length,
      sourceNotFoundCount: Array.from(crosswalk.values()).filter(
        (record) => record.status === 'source-not-found',
      ).length,
      needsReviewCount: Array.from(crosswalk.values()).filter(
        (record) => record.status !== 'matched',
      ).length,
      records: Array.from(crosswalk.values()).sort((a, b) =>
        a.profileName.localeCompare(b.profileName, 'zh-CN'),
      ),
    },
    null,
    2,
  ),
);
fs.writeFileSync(mappingAuditPath, JSON.stringify(industryMappingAudit, null, 2));
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      schemaVersion: 3,
      counts,
      companies,
      relations,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      counts,
      crosswalk: {
        matched: Array.from(crosswalk.values()).filter((record) => record.status === 'matched')
          .length,
        sourceNotFound: Array.from(crosswalk.values()).filter(
          (record) => record.status === 'source-not-found',
        ).length,
        needsReview: Array.from(crosswalk.values()).filter((record) => record.status !== 'matched')
          .length,
      },
      outputPath,
      crosswalkPath,
      mappingAuditPath,
    },
    null,
    2,
  ),
);
