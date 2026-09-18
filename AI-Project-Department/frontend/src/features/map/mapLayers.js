export const MAP_SOURCE_IDS = Object.freeze({
  fallback: 'fallback',
  streetGrid: 'streetGrid',
  chinaBoundaries: 'chinaBoundaries',
  shanghaiDistricts: 'shanghaiDistricts',
  companies: 'companies',
  companyOverlaps: 'companyOverlaps',
  relations: 'relations',
  baseOverview: 'baseOverview',
  baseDetail: 'baseDetail',
});

export const MAP_LAYER_IDS = Object.freeze({
  background: 'background',
  chinaProvinceFill: 'china-province-fill',
  chinaProvinceLine: 'china-province-line',
  shanghaiDistrictFill: 'shanghai-district-fill',
  shanghaiDistrictLine: 'shanghai-district-line',
  fallbackChina: 'fallback-china',
  fallbackChinaLine: 'fallback-china-line',
  fallbackShanghai: 'fallback-shanghai',
  fallbackShanghaiLine: 'fallback-shanghai-line',
  fallbackStreetGrid: 'fallback-street-grid',
  relationLines: 'relation-lines',
  companyClusters: 'company-clusters',
  companyClusterCount: 'company-cluster-count',
  companyHalo: 'company-halo',
  companySelectedRing: 'company-selected-ring',
  companyPoints: 'company-points',
  contactedCompanyCheck: 'contacted-company-check',
  bankCompanySymbol: 'bank-company-symbol',
  bankCreditBadge: 'bank-credit-badge',
  companyLabel: 'company-label',
  companyOverlapHalo: 'company-overlap-halo',
  companyOverlaps: 'company-overlaps',
  companyOverlapCount: 'company-overlap-count',
});

export const INTERACTIVE_MAP_LAYERS = Object.freeze([
  MAP_LAYER_IDS.contactedCompanyCheck,
  MAP_LAYER_IDS.companyPoints,
  MAP_LAYER_IDS.bankCompanySymbol,
  MAP_LAYER_IDS.bankCreditBadge,
  MAP_LAYER_IDS.companyLabel,
  MAP_LAYER_IDS.companyHalo,
  MAP_LAYER_IDS.companyClusters,
  MAP_LAYER_IDS.companyOverlaps,
  MAP_LAYER_IDS.companyOverlapCount,
  MAP_LAYER_IDS.relationLines,
]);

export const COMPANY_INTERACTIVE_MAP_LAYERS = Object.freeze([
  MAP_LAYER_IDS.contactedCompanyCheck,
  MAP_LAYER_IDS.companyPoints,
  MAP_LAYER_IDS.bankCompanySymbol,
  MAP_LAYER_IDS.bankCreditBadge,
  MAP_LAYER_IDS.companyLabel,
  MAP_LAYER_IDS.companyHalo,
]);

export const OVERLAP_INTERACTIVE_MAP_LAYERS = Object.freeze([
  MAP_LAYER_IDS.companyOverlaps,
  MAP_LAYER_IDS.companyOverlapCount,
]);

export const CURSOR_MAP_LAYERS = Object.freeze([
  [MAP_LAYER_IDS.companyPoints, 'pointer'],
  [MAP_LAYER_IDS.contactedCompanyCheck, 'pointer'],
  [MAP_LAYER_IDS.bankCompanySymbol, 'pointer'],
  [MAP_LAYER_IDS.bankCreditBadge, 'pointer'],
  [MAP_LAYER_IDS.companyLabel, 'pointer'],
  [MAP_LAYER_IDS.relationLines, 'help'],
  [MAP_LAYER_IDS.companyOverlaps, 'pointer'],
  [MAP_LAYER_IDS.companyOverlapCount, 'pointer'],
  [MAP_LAYER_IDS.companyClusters, 'zoom-in'],
]);
