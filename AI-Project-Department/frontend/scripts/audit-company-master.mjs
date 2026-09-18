import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const root = process.cwd();
const repositoryRoot = path.resolve(root, '..');
const inputPath = process.env.MASTER_SOURCE_PATH
  ? path.resolve(root, process.env.MASTER_SOURCE_PATH)
  : path.join(repositoryRoot, '可参考内容', 'con_info1.xlsx');
const dataPath = path.join(root, 'public', 'data', 'companies.json');
const listedEvidencePath = path.join(root, 'docs', 'listed-company-evidence.json');
const crosswalkPath = path.join(root, 'docs', 'key-company-crosswalk.json');
const taxonomyPath = path.join(root, 'docs', 'industry-taxonomy.json');
const mappingAuditPath = path.join(root, 'docs', 'industry-mapping-audit.json');
const RELATION_SUPPLEMENT_SOURCE = '历史企业画像（一级上下游）';
const locationResearchPaths = [
  'coordinate-research.json',
  'manual-location-research.json',
  'researched-locations.json',
  'reference-location-research.json',
  '360-poi-research.json',
  'tencent-poi-research.json',
  'amap-geocode-research.json',
  'amap-poi-research.json',
  'region-location-research.json',
].map((fileName) => path.join(root, 'docs', fileName));
const outputPath = path.join(root, 'docs', 'company-master-audit.json');

const normalize = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’'"，,；;：:、_\-]/g, '')
    .toLowerCase();

const countBy = (values) =>
  values.reduce((result, value) => {
    const key = value || '(blank)';
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

if (!fs.existsSync(inputPath)) throw new Error(`Missing source workbook: ${inputPath}`);
if (!fs.existsSync(dataPath)) throw new Error(`Missing generated master: ${dataPath}`);
if (!fs.existsSync(crosswalkPath)) throw new Error(`Missing crosswalk: ${crosswalkPath}`);
if (!fs.existsSync(taxonomyPath)) throw new Error(`Missing industry taxonomy: ${taxonomyPath}`);
if (!fs.existsSync(mappingAuditPath))
  throw new Error(`Missing industry mapping audit: ${mappingAuditPath}`);

const workbook = XLSX.readFile(inputPath, { cellDates: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const sourceRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((row) => ({
  name: String(row['客户名称'] || '').trim(),
  rawIndustry: String(row['产业链环节'] || '').trim(),
  sourceFlag: String(row['Y/N'] || '').trim(),
}));
const data = readJson(dataPath);
const crosswalk = readJson(crosswalkPath);
const taxonomy = readJson(taxonomyPath);
const mappingAudit = readJson(mappingAuditPath);
const listedEvidenceData = fs.existsSync(listedEvidencePath)
  ? readJson(listedEvidencePath)
  : { records: [] };
const locationResearchRecords = locationResearchPaths.flatMap((filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const payload = readJson(filePath);
  return (payload.records || []).map((record) => ({
    ...record,
    __sourceFile: path.basename(filePath),
  }));
});
const companies = data.companies || [];
const isListedCompany = (company) => company?.tags?.includes('上市企业') || false;
const sourceNames = sourceRows.map((row) => row.name);
const runtimeNames = companies.map((company) => company.name);
const runtimeNameSet = new Set(runtimeNames.map(normalize));
const listedEvidenceRecords = listedEvidenceData.records || [];
const listedEvidenceNames = new Set(listedEvidenceRecords.map((record) => normalize(record.name)));
const listedEvidenceCodes = new Set(listedEvidenceRecords.map((record) => record.code));
const listedEvidenceRows = companies.filter((company) => company.listedEvidence);
const listedEvidenceRuntimeNames = new Set(
  listedEvidenceRows.map((company) => normalize(company.name)),
);
const fieldNames = [
  'address',
  'location',
  'region',
  'classification',
  'coreTechnology',
  'products',
  'tags',
  'importance',
  'otherBank',
];
const fieldStatus = Object.fromEntries(
  fieldNames.map((field) => [
    field,
    countBy(companies.map((company) => company.research?.fieldStatus?.[field])),
  ]),
);
const locationRows = companies.filter((company) => company.location);
const verifiedLocationRows = locationRows.filter((company) =>
  ['已复核', 'verified'].includes(company.locationStatus),
);
const candidateLocationRows = locationRows.filter(
  (company) => !['已复核', 'verified'].includes(company.locationStatus),
);
const pendingLocationRows = companies.filter((company) => !company.location);
const regionRows = companies.filter((company) => company.region?.province && company.region?.city);
const keyRows = companies.filter((company) => company.companyType === 'key');
const listedRows = companies.filter(isListedCompany);
const ordinaryRows = companies.filter((company) => company.companyType === 'ordinary');
const relationByName = new Map(companies.map((company) => [company.name, company]));
const relationRows = data.relations || [];
const relationSupplementRows = relationRows.filter(
  (relation) => relation.source === RELATION_SUPPLEMENT_SOURCE,
);
const relationSupplementSourceProfiles = new Set(
  relationSupplementRows.map((relation) => relation.sourceFromProfile).filter(Boolean),
);
const relationSupplementTargetNames = new Set(
  relationSupplementRows.map((relation) => relation.to).filter(Boolean),
);
const relationIds = new Set(relationRows.map((relation) => relation.id));
const sourceRowsMatchRuntime =
  sourceRows.length === companies.length &&
  sourceNames.every((name, index) => name === runtimeNames[index]);
const relationsOnlyListed = (data.relations || []).every((relation) => {
  return (
    isListedCompany(relationByName.get(relation.from)) &&
    isListedCompany(relationByName.get(relation.to))
  );
});
const noLegacyRoleFields = companies.every(
  (company) => !Object.prototype.hasOwnProperty.call(company, 'role'),
);
const researchRecordsForSource = locationResearchRecords.filter((record) =>
  runtimeNameSet.has(normalize(record.name)),
);
const researchAcceptedNames = new Set(
  researchRecordsForSource
    .filter((record) => record.location)
    .map((record) => normalize(record.name)),
);
const researchCandidateNames = new Set(
  researchRecordsForSource
    .filter((record) => record.candidateLocation)
    .map((record) => normalize(record.name)),
);
const researchRegionNames = new Set(
  researchRecordsForSource
    .filter((record) => record.regionLocation)
    .map((record) => normalize(record.name)),
);
const researchAttemptedNames = new Set(
  researchRecordsForSource.map((record) => normalize(record.name)),
);
const researchCoveredNames = new Set([
  ...researchAcceptedNames,
  ...researchCandidateNames,
  ...researchRegionNames,
]);
const researchUnresolvedNames = new Set(
  Array.from(researchAttemptedNames).filter((name) => !researchCoveredNames.has(name)),
);
const unresolvedProfiles = (crosswalk.records || [])
  .filter((record) => !record.targetId)
  .map((record) => record.profileName);
const keyTargetIds = new Set(
  (crosswalk.records || []).filter((record) => record.targetId).map((record) => record.targetId),
);
const taxonomySecondaryCodes = new Set((taxonomy.secondary || []).map((entry) => entry.code));
const taxonomyTertiaryCodes = new Set((taxonomy.tertiary || []).map((entry) => entry.code));
const runtimeSecondaryCodes = new Set(
  companies.map((company) => company.secondaryCode).filter(Boolean),
);
const runtimeTertiaryCodes = new Set(
  companies.map((company) => company.tertiaryCode).filter(Boolean),
);
const noDeepTertiaryCodes = Array.from(runtimeTertiaryCodes).every((code) =>
  /^\d+\.\d+$/.test(code),
);
const mappingRecordsMatchRuntime =
  mappingAudit.records?.length === companies.length &&
  mappingAudit.scope?.companyCount === companies.length;

const audit = {
  generatedAt: new Date().toISOString(),
  source: {
    file: path.relative(repositoryRoot, inputPath),
    rowCount: sourceRows.length,
    sourceFlag: countBy(sourceRows.map((row) => row.sourceFlag)),
    rawIndustry: countBy(sourceRows.map((row) => row.rawIndustry)),
  },
  runtime: {
    rowCount: companies.length,
    listedCount: listedRows.length,
    companyType: countBy(companies.map((company) => company.companyType)),
    secondaryIndustry: countBy(companies.map((company) => company.secondaryIndustry)),
    secondaryCode: countBy(companies.map((company) => company.secondaryCode)),
    tertiaryCode: countBy(companies.map((company) => company.tertiaryCode)),
    classificationStatus: countBy(companies.map((company) => company.classificationStatus)),
    mappedLocation: locationRows.length,
    verifiedLocation: verifiedLocationRows.length,
    candidateLocation: candidateLocationRows.length,
    regionReferenceLocation: companies.filter((company) => company.locationStatus === '区域参考')
      .length,
    pendingLocation: pendingLocationRows.length,
    missingAddress: companies.filter((company) => !company.address).length,
    regionComplete: regionRows.length,
    regionPending: companies.length - regionRows.length,
    relationCount: relationRows.length,
    relationSupplementCount: relationSupplementRows.length,
  },
  researchCoverage: {
    coordinateResearchRecords: researchRecordsForSource.length,
    coordinateResearchAttemptedCompanies: researchAttemptedNames.size,
    coordinateResearchAcceptedCompanies: researchAcceptedNames.size,
    coordinateResearchCandidateCompanies: researchCandidateNames.size,
    coordinateResearchRegionReferenceCompanies: researchRegionNames.size,
    coordinateResearchUnresolvedCompanies: Math.max(
      0,
      researchAttemptedNames.size - researchAcceptedNames.size - researchCandidateNames.size,
    ),
    fieldStatus,
  },
  keyCompanyCrosswalk: {
    sourceProfiles: crosswalk.profileCount,
    matchedProfiles: crosswalk.matchedCount,
    uniqueTargetRows: keyTargetIds.size,
    sourceNotFoundProfiles: crosswalk.sourceNotFoundCount,
    needsReviewProfiles: crosswalk.needsReviewCount,
    sourceNotFoundNames: unresolvedProfiles,
  },
  listedCoverage: {
    sourceRecords: listedEvidenceRecords.length,
    matchedRuntimeRows: listedEvidenceRows.length,
    taggedRuntimeRows: listedEvidenceRows.filter(isListedCompany).length,
    missingRuntimeNames: listedEvidenceRecords
      .filter((record) => !runtimeNameSet.has(normalize(record.name)))
      .map((record) => record.name),
    untrackedRuntimeNames: listedEvidenceRows
      .filter((company) => !listedEvidenceNames.has(normalize(company.name)))
      .map((company) => company.name),
  },
  relationCoverage: {
    totalRelations: relationRows.length,
    supplementSource: RELATION_SUPPLEMENT_SOURCE,
    supplementRelations: relationSupplementRows.length,
    supplementSourceProfiles: relationSupplementSourceProfiles.size,
    supplementTargetCompanies: relationSupplementTargetNames.size,
    supplementTargetNames: Array.from(relationSupplementTargetNames).sort((a, b) =>
      a.localeCompare(b, 'zh-CN'),
    ),
    missingProvenance: relationSupplementRows
      .filter(
        (relation) =>
          !relation.sourceFromProfile ||
          !relation.sourceRelationField ||
          relation.sourceRelationLevel !== 'level1' ||
          !relation.sourceRelationName ||
          !relation.sourceRecord ||
          !relation.sourceReviewedAt,
      )
      .map((relation) => relation.id),
  },
  invariants: {
    sourceRowsMatchRuntime: sourceRowsMatchRuntime,
    onlyOrdinaryAndKeyTypes: new Set(companies.map((company) => company.companyType)).size === 2,
    noLegacyRoleFields,
    relationsOnlyListed,
    relationIdsUnique: relationIds.size === relationRows.length,
    relationSupplementRowsHaveProvenance: relationSupplementRows.every(
      (relation) =>
        relation.sourceFromProfile &&
        relation.sourceRelationField &&
        relation.sourceRelationLevel === 'level1' &&
        relation.sourceRelationName &&
        relation.sourceRecord &&
        relation.sourceReviewedAt,
    ),
    relationSupplementTargetsListed: relationSupplementRows.every((relation) =>
      isListedCompany(relationByName.get(relation.to)),
    ),
    runtimeCountMatchesSource: companies.length === sourceRows.length,
    keyCountMatchesCrosswalkTargets: keyRows.length === keyTargetIds.size,
    ordinaryPlusKeyMatchesRuntime: ordinaryRows.length + keyRows.length === companies.length,
    taxonomyHasSixSecondaryChains: taxonomy.secondary?.length === 6,
    taxonomyHasNineteenTertiaryChains: taxonomy.tertiary?.length === 19,
    runtimeSecondaryCodesInTaxonomy: Array.from(runtimeSecondaryCodes).every((code) =>
      taxonomySecondaryCodes.has(code),
    ),
    runtimeTertiaryCodesInTaxonomy: Array.from(runtimeTertiaryCodes).every((code) =>
      taxonomyTertiaryCodes.has(code),
    ),
    noDeepTertiaryCodes,
    mappingRecordsMatchRuntime,
    listedEvidenceRecordsUnique: listedEvidenceNames.size === listedEvidenceRecords.length,
    listedEvidenceCodesUnique: listedEvidenceCodes.size === listedEvidenceRecords.length,
    listedEvidenceRecordsMapToRuntime: listedEvidenceRecords.every((record) =>
      runtimeNameSet.has(normalize(record.name)),
    ),
    listedEvidenceRowsTagged: listedEvidenceRows.every(isListedCompany),
    listedEvidenceCoverageMatchesSource:
      listedEvidenceRuntimeNames.size === listedEvidenceRecords.length,
  },
};

const failedChecks = Object.entries(audit.invariants)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
if (failedChecks.length) throw new Error(`Company master audit failed: ${failedChecks.join(', ')}`);

fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ outputPath, audit }, null, 2));
