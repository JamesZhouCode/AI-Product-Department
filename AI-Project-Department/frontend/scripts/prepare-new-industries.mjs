#!/usr/bin/env node
// 把 2026-09 新增的三条一级产业链（电力装备含储能、生物医药、人工智能）从源 Excel
// 转换为运行时分片数据。与集成电路的 prepare-company-master.mjs 分开维护，避免
// 污染既有主表管线：集成电路仍输出 public/data/companies.json，新链输出
// public/data/industries/companies-<code>.json，并由 index.json 统一登记。
//
// 坐标来源分两步：
//   1. docs/new-industry-address-research.json  一次性联网地址研究（电力/生物医药源表无地址）
//   2. docs/new-industry-geocode-research.json  一次性地理编码结果
// 两个文件缺失时脚本照常运行，企业以「待补坐标」状态进入名录，不落图。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.resolve(root, '..', '可参考内容', 'con_info5');
const taxonomyPath = path.join(root, 'docs', 'new-industry-taxonomy.json');
const addressResearchPath = path.join(root, 'docs', 'new-industry-address-research.json');
const geocodeResearchPath = path.join(root, 'docs', 'new-industry-geocode-research.json');
const listedCompaniesPath = path.join(root, 'docs', 'new-industry-listed-companies.json');
const listedEntityOverridesPath = path.join(root, 'docs', 'new-industry-listed-entity-overrides.json');
const relationsPath = path.join(root, 'docs', 'new-industry-relations.json');
const outputDir = path.join(root, 'public', 'data', 'industries');

const readJson = (filePath) =>
  fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;

const taxonomy = readJson(taxonomyPath);
if (!taxonomy) {
  console.error(`缺少分类体系文件：${taxonomyPath}`);
  process.exit(1);
}
const addressResearch = readJson(addressResearchPath)?.records || {};
const geocodeResearch = readJson(geocodeResearchPath)?.records || {};
const listedCompanies = readJson(listedCompaniesPath) || {};
const listedEntityOverrides = readJson(listedEntityOverridesPath) || {};
const relationResearch = readJson(relationsPath)?.relations || [];

// 归一化企业名，用于研究成果回连。与 shared/text.js 的 normalize 保持同一口径。
const normalizeName = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’\-—_]/g, '')
    .toLowerCase();

const clean = (value) => String(value ?? '').trim();

// 兼容全角「（）」与半角「()」，电力装备用全角、生物医药用半角。
const SPLIT_PATTERN = /^(.+?)[（(](.+?)[)）]$/;

function buildChainIndex(industryKey) {
  const config = taxonomy.industries[industryKey];
  const bySecondaryLabel = new Map();
  const bySourceLabel = new Map();
  const byTertiaryLabel = new Map();
  for (const item of config.secondary) {
    bySecondaryLabel.set(item.label, item);
    for (const alias of item.sourceLabels || []) bySourceLabel.set(alias, item);
  }
  for (const item of config.tertiary || []) {
    byTertiaryLabel.set(item.label, item);
  }
  return { config, bySecondaryLabel, bySourceLabel, byTertiaryLabel };
}

// 把源表的单一分类串解析为 { chain, sector }。
// 电力装备：「电力装备-用电领域（数据中心）」；生物医药：「医疗器械(微创介入)」。
function classifyPower(index, rawValue) {
  const raw = clean(rawValue);
  const withoutIndustry = raw.includes('-') ? raw.slice(raw.indexOf('-') + 1) : raw;
  const matched = withoutIndustry.match(SPLIT_PATTERN);
  if (matched) {
    const secondary = index.bySecondaryLabel.get(clean(matched[1]));
    const tertiary = index.byTertiaryLabel.get(clean(matched[2]));
    if (secondary) {
      return {
        chain: secondary.label,
        secondaryCode: secondary.code,
        sector: tertiary?.label || '',
        tertiaryCode: tertiary?.code || '',
        status: tertiary ? 'mapped' : 'pending-tertiary',
      };
    }
  }
  const secondary = index.bySecondaryLabel.get(withoutIndustry);
  if (secondary) {
    return {
      chain: secondary.label,
      secondaryCode: secondary.code,
      sector: '',
      tertiaryCode: '',
      status: 'pending-tertiary',
    };
  }
  return null;
}

function classifyBiomed(index, rawValue) {
  const raw = clean(rawValue);
  const matched = raw.match(SPLIT_PATTERN);
  const secondaryLabel = clean(matched ? matched[1] : raw);
  const tertiaryLabel = clean(matched ? matched[2] : '');
  const secondary = index.bySecondaryLabel.get(secondaryLabel);
  if (!secondary) return null;
  const tertiary = tertiaryLabel ? index.byTertiaryLabel.get(tertiaryLabel) : null;
  return {
    chain: secondary.label,
    secondaryCode: secondary.code,
    sector: tertiary?.label || '',
    tertiaryCode: tertiary?.code || '',
    status: tertiary ? 'mapped' : 'pending-tertiary',
  };
}

// 人工智能源表只有细分领域（即三级），需要反查所属二级链。
function classifyAi(index, rawValue) {
  const raw = clean(rawValue);
  const tertiary = index.byTertiaryLabel.get(raw);
  if (!tertiary) return null;
  const secondary = index.config.secondary.find((item) => item.code === tertiary.secondaryCode);
  return {
    chain: secondary.label,
    secondaryCode: secondary.code,
    sector: tertiary.label,
    tertiaryCode: tertiary.code,
    status: 'mapped',
  };
}

function resolveLocation(name, address) {
  const key = normalizeName(name);
  const geo = geocodeResearch[key];
  if (geo?.lng != null && geo?.lat != null) {
    return {
      address: address || geo.matchedAddress || '',
      location: {
        lng: geo.lng,
        lat: geo.lat,
        coordinateSystem: 'WGS84/CGCS2000-compatible',
        precision: geo.precision || '未标注',
      },
      locationStatus: geo.status || '候选',
      locationSource: geo.source || '一次性地理编码研究',
      locationEvidence: geo.evidence || [],
      mapped: true,
    };
  }
  return {
    address,
    location: null,
    locationStatus: address ? '待编码' : '待补地址',
    locationSource: address
      ? '源表提供地址，尚未执行地理编码'
      : '源表未提供地址，待一次性联网研究',
    locationEvidence: [],
    mapped: false,
  };
}

function makeCompany({ index, industryLabel, code, id, name, classifications, address, region }) {
  const primary = classifications[0];
  const key = normalizeName(name);
  // 上市口径（AGENTS.md）：A股/港股 → 「上市企业」；新三板挂牌 → 独立「新三板」标签，不进上市口径。
  const candidateListedInfo = listedCompanies[key];
  const entityOverride = candidateListedInfo?.stockCode
    ? listedEntityOverrides[String(candidateListedInfo.stockCode)]
    : null;
  const isCanonicalEntity =
    candidateListedInfo &&
    (!entityOverride || normalizeName(name) === normalizeName(entityOverride.canonicalName));
  const listedInfo = isCanonicalEntity ? candidateListedInfo : null;
  const listedMarket = listedInfo?.market || 'A股';
  const isExchangeListed = listedInfo && (listedMarket === 'A股' || listedMarket === '港股');
  const companyTags = listedInfo
    ? isExchangeListed
      ? ['上市企业']
      : ['新三板']
    : [];
  const researchedAddress = addressResearch[key]?.address || '';
  const finalAddress = address || researchedAddress;
  const geo = resolveLocation(name, finalAddress);
  return {
    id: `${code.toLowerCase()}-${String(id).padStart(4, '0')}`,
    name,
    normalizedName: normalizeName(name),
    aliases: [],
    companyType: 'ordinary',
    isKey: false,
    primaryIndustry: industryLabel,
    industryCode: code,
    rawIndustry: primary.chain,
    sourceFlag: 'Y',
    chain: primary.chain,
    secondaryIndustry: primary.chain,
    secondaryCode: primary.secondaryCode,
    sector: primary.sector,
    tertiarySector: primary.sector,
    tertiaryCode: primary.tertiaryCode,
    // 支持一企多环节（生物医药存在 5 家双标签企业）。
    classifications,
    secondaryCodes: classifications.map((item) => item.secondaryCode),
    classificationStatus: primary.status,
    classificationMethod: 'source-explicit',
    classificationConfidence: primary.status === 'mapped' ? 0.95 : 0.6,
    classificationEvidence: [
      { source: 'source-workbook', terms: [`产业链环节：${primary.chain}`] },
    ],
    address: geo.address,
    addressSource: address ? 'source-workbook' : researchedAddress ? 'address-research' : 'missing',
    addressType: '',
    region: region || { province: '', city: '', district: '', street: '' },
    regionStatus: region ? '源表提供市/区县' : '待解析',
    location: geo.location,
    locationStatus: geo.locationStatus,
    locationSource: geo.locationSource,
    locationEvidence: geo.locationEvidence,
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
    tags: companyTags,
    tagStatus: '已生成',
    tagSource: listedInfo
      ? isExchangeListed
        ? 'listed-market-match'
        : 'neeq-listed-match'
      : 'source-derived',
    bank: {
      isOurCustomer: null,
      isCreditCustomer: null,
      otherBankCustomer: null,
      sourceBatch: 'not-researched',
    },
    research: {
      status: listedInfo
        ? isExchangeListed
          ? '新链基础档案+上市公司'
          : '新链基础档案+新三板挂牌'
        : '新链基础档案',
      source: 'con_info5-workbook',
      confidence: listedInfo ? 0.9 : 0.3,
      lastReviewedAt: taxonomy.generatedAt,
      additionalFields: listedInfo
        ? {
            stockCode: listedInfo.stockCode,
            stockSymbol: listedInfo.stockSymbol,
            stockShort: listedInfo.stockShort,
            market: listedMarket,
          }
        : {},
    },
    profileId: '',
  };
}

function summarize(companies) {
  const counts = {
    totalCompanies: companies.length,
    mapped: 0,
    verifiedLocation: 0,
    candidateLocation: 0,
    pendingLocation: 0,
    missingAddress: 0,
    listed: 0,
    neeqListed: 0,
    relationCount: 0,
  };
  const secondary = {};
  // 一家企业在一个二级链下只计一次（乐普医疗同属两个医疗器械三级环节），
  // 但跨二级链的多标签企业会在各链分别计入，因此分布之和可能大于唯一企业数。
  const counted = new Set();
  for (const company of companies) {
    if (company.location) counts.mapped += 1;
    if (company.locationStatus === '已复核') counts.verifiedLocation += 1;
    if (company.locationStatus === '候选') counts.candidateLocation += 1;
    if (company.locationStatus === '待编码' || company.locationStatus === '待补地址') {
      counts.pendingLocation += 1;
    }
    if (!company.address) counts.missingAddress += 1;
    if (company.tags?.includes('上市企业')) counts.listed += 1;
    if (company.tags?.includes('新三板')) counts.neeqListed += 1;
    for (const item of company.classifications) {
      const dedupeKey = `${company.id}::${item.chain}`;
      if (counted.has(dedupeKey)) continue;
      counted.add(dedupeKey);
      secondary[item.chain] = (secondary[item.chain] || 0) + 1;
    }
  }
  return { ...counts, classification: { secondary } };
}

function assertUniqueListedEntities(companies, file) {
  const byCode = new Map();
  companies
    .filter((company) => company.tags?.includes('上市企业'))
    .forEach((company) => {
      const code = company.research?.additionalFields?.stockCode;
      if (!code) return;
      if (!byCode.has(code)) byCode.set(code, company.name);
      else if (byCode.get(code) !== company.name) {
        throw new Error(
          `${file} 股票代码 ${code} 对应多个上市主体：${byCode.get(code)} / ${company.name}`,
        );
      }
    });
}

function readSheetRows(fileName, sheetName) {
  const filePath = path.join(sourceDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`缺少源文件：${filePath}`);
    process.exit(1);
  }
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

// 表头可能含换行符与枚举说明（人工智能的「细分领域」列），统一清洗后按前缀匹配。
function findColumnIndex(header, keywords) {
  return header.findIndex((cell) => {
    const label = clean(cell).replace(/\s+/g, '');
    return keywords.some((keyword) => label.startsWith(keyword));
  });
}

function buildPower() {
  const industryLabel = '电力装备（含储能）';
  const index = buildChainIndex(industryLabel);
  const rows = readSheetRows('电力装备（含储能）.xlsx', '模板');
  const header = rows[0];
  const categoryIndex = findColumnIndex(header, ['行业分类']);
  const nameIndex = findColumnIndex(header, ['客户名称']);
  const companies = [];
  const unresolved = [];
  let id = 0;
  for (const row of rows.slice(1)) {
    const name = clean(row[nameIndex]);
    if (!name) continue;
    const classification = classifyPower(index, row[categoryIndex]);
    if (!classification) {
      unresolved.push({ name, raw: clean(row[categoryIndex]) });
      continue;
    }
    id += 1;
    companies.push(
      makeCompany({
        index,
        industryLabel,
        code: index.config.code,
        id,
        name,
        classifications: [classification],
        address: '',
        region: null,
      }),
    );
  }
  return { companies, unresolved, index };
}

function buildBiomed() {
  const industryLabel = '生物医药';
  const index = buildChainIndex(industryLabel);
  const rows = readSheetRows('生物医药20260814.xlsx', '模板');
  const header = rows[0];
  const nameIndex = findColumnIndex(header, ['客户名称']);
  const fieldIndex = findColumnIndex(header, ['特色字段1']);
  // 一家企业可能占多行（多标签），先按名称聚合再输出。
  const grouped = new Map();
  const unresolved = [];
  for (const row of rows.slice(1)) {
    const name = clean(row[nameIndex]);
    if (!name) continue;
    const classification = classifyBiomed(index, row[fieldIndex]);
    if (!classification) {
      unresolved.push({ name, raw: clean(row[fieldIndex]) });
      continue;
    }
    const key = normalizeName(name);
    if (!grouped.has(key)) grouped.set(key, { name, classifications: [] });
    // 去重键必须包含二级链：创新药与 CXO 都没有三级环节，只按 tertiaryCode 去重会互相覆盖。
    const entry = grouped.get(key);
    const dedupeKey = `${classification.secondaryCode}::${classification.tertiaryCode}`;
    const exists = entry.classifications.some(
      (item) => `${item.secondaryCode}::${item.tertiaryCode}` === dedupeKey,
    );
    if (!exists) entry.classifications.push(classification);
  }
  const companies = [];
  let id = 0;
  for (const entry of grouped.values()) {
    id += 1;
    companies.push(
      makeCompany({
        index,
        industryLabel,
        code: index.config.code,
        id,
        name: entry.name,
        classifications: entry.classifications,
        address: '',
        region: null,
      }),
    );
  }
  return { companies, unresolved, index };
}

function buildAi() {
  const industryLabel = '人工智能';
  const index = buildChainIndex(industryLabel);
  const rows = readSheetRows('人工智能20260624.xlsx', '风险部、审批部建议删除客户后去重');
  const header = rows[0];
  const nameIndex = findColumnIndex(header, ['客户名称']);
  const dropIndex = findColumnIndex(header, ['是否建议删除']);
  const fieldIndex = findColumnIndex(header, ['细分领域']);
  const officeIndex = findColumnIndex(header, ['办公地址']);
  const cityIndex = findColumnIndex(header, ['所属市']);
  const districtIndex = findColumnIndex(header, ['所属区县', '所属区/县']);
  const companies = [];
  const unresolved = [];
  let id = 0;
  let dropped = 0;
  for (const row of rows.slice(1)) {
    const name = clean(row[nameIndex]);
    if (!name) continue;
    // 风险部/审批部建议删除的 86 条不进入运行时。
    if (dropIndex >= 0 && clean(row[dropIndex]) === '是') {
      dropped += 1;
      continue;
    }
    const classification = classifyAi(index, row[fieldIndex]);
    if (!classification) {
      unresolved.push({ name, raw: clean(row[fieldIndex]) });
      continue;
    }
    id += 1;
    const city = cityIndex >= 0 ? clean(row[cityIndex]) : '';
    const district = districtIndex >= 0 ? clean(row[districtIndex]) : '';
    companies.push(
      makeCompany({
        index,
        industryLabel,
        code: index.config.code,
        id,
        name,
        classifications: [classification],
        address: officeIndex >= 0 ? clean(row[officeIndex]) : '',
        region: { province: '', city, district, street: '' },
      }),
    );
  }
  return { companies, unresolved, index, dropped };
}

const results = [
  { key: 'power', file: 'companies-power.json', ...buildPower() },
  { key: 'biomed', file: 'companies-biomed.json', ...buildBiomed() },
  { key: 'ai', file: 'companies-ai.json', ...buildAi() },
];

fs.mkdirSync(outputDir, { recursive: true });

const indexPayload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  schemaVersion: 2,
  note: '按一级产业链分片的企业数据目录。集成电路沿用 public/data/companies.json，其余三条链为 2026-09 新增。',
  industries: [
    {
      id: 'integrated-circuit',
      code: 'IC',
      label: '集成电路',
      file: 'companies.json',
      source: '可参考内容/con_info1.xlsx',
      status: 'ready',
    },
  ],
};

const reports = [];
for (const result of results) {
  const counts = summarize(result.companies);
  // 图谱关系：只保留本行业分片，且两端均为该行业上市企业的关系。
  const industryRelations = relationResearch
    .filter((relation) => relation.industry === result.key)
    .map(({ id, from, to, relationType, depth, source, sourceFromProfile, sourceToProfile }) => ({
      id,
      from,
      to,
      relationType,
      depth,
      source,
      sourceFromProfile,
      sourceToProfile,
    }));
  counts.relationCount = industryRelations.length;
  assertUniqueListedEntities(result.companies, result.file);
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    schemaVersion: 2,
    industry: result.companies[0]?.primaryIndustry || '',
    industryCode: result.index.config.code,
    counts,
    companies: result.companies,
    relations: industryRelations,
  };
  fs.writeFileSync(path.join(outputDir, result.file), `${JSON.stringify(payload)}\n`);
  indexPayload.industries.push({
    id: result.key,
    code: result.index.config.code,
    label: result.companies[0]?.primaryIndustry || '',
    file: `industries/${result.file}`,
    source: result.index.config.source,
    status: counts.mapped > 0 ? 'ready' : 'pending-geocode',
  });
  reports.push({
    label: payload.industry,
    file: result.file,
    counts,
    unresolved: result.unresolved.length,
    dropped: result.dropped || 0,
  });
}

fs.writeFileSync(
  path.join(root, 'public', 'data', 'industries', 'index.json'),
  `${JSON.stringify(indexPayload, null, 2)}\n`,
);

for (const report of reports) {
  console.log(`\n${report.label} → ${report.file}`);
  console.log(`  企业 ${report.counts.totalCompanies} 家 · 已落图 ${report.counts.mapped} · 上市公司 ${report.counts.listed} · 新三板挂牌 ${report.counts.neeqListed}`);
  console.log(
    `  待编码 ${report.counts.pendingLocation} · 缺地址 ${report.counts.missingAddress} · 剔除 ${report.dropped}`,
  );
  console.log(`  二级链分布 ${JSON.stringify(report.counts.classification.secondary)}`);
  if (report.unresolved) console.log(`  未匹配分类 ${report.unresolved} 条`);
}
console.log('\n分片目录已生成：public/data/industries/index.json');
