import { INDUSTRY_PALETTE } from '../../chainPalette.js';

export const EMPTY_DATA = {
  counts: {
    listed: 0,
    ordinary: 0,
    key: 0,
    keyProfiles: 0,
    keyTargetRows: 0,
    excludedKeyProfiles: 0,
    unresolvedKeyProfiles: 0,
    totalCompanies: 0,
    relationCount: 0,
    mapped: 0,
    verifiedLocation: 0,
    candidateLocation: 0,
    regionReferenceLocation: 0,
    pendingLocation: 0,
    missingAddress: 0,
  },
  companies: [],
  relations: [],
};

const DATA_FILE_BY_INDUSTRY = {
  'integrated-circuit': 'companies.json',
  power: 'industries/companies-power.json',
  storage: 'industries/companies-storage.json',
  biomed: 'industries/companies-biomed.json',
  ai: 'industries/companies-ai.json',
};

// 目录服务不可用时仍保留各条链的正确映射，避免把其他产业链误显示成集成电路。
// 一级链的 id、名称和 code 以 chainPalette 为运行时显示契约，这里只补数据文件位置。
export const BUILT_IN_INDUSTRY_CATALOG = INDUSTRY_PALETTE.map((industry) => ({
  id: industry.id,
  code: industry.code,
  label: industry.label,
  file: DATA_FILE_BY_INDUSTRY[industry.id],
  status: 'ready',
}));

function isCatalogEntry(value) {
  return Boolean(value?.id && value?.label && value?.file);
}

export function parseIndustryCatalog(payload) {
  const industries = Array.isArray(payload?.industries)
    ? payload.industries.filter(isCatalogEntry)
    : [];
  if (!industries.length) throw new Error('产业链目录为空或格式不完整');
  return { ...payload, industries };
}

export function parseIndustryData(payload) {
  if (!payload || !Array.isArray(payload.companies) || !Array.isArray(payload.relations))
    throw new Error('产业链数据分片格式不完整');
  return payload;
}

export function industryEntryFor(catalog, activeIndustry) {
  return (
    catalog?.industries?.find(
      (entry) => entry.label === activeIndustry || entry.id === activeIndustry,
    ) || null
  );
}
