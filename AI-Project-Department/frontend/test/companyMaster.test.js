import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CHAIN_PALETTE, chainGroupFor } from '../src/chainPalette.js';

const data = JSON.parse(
  fs.readFileSync(new URL('../public/data/companies.json', import.meta.url), 'utf8'),
);
const crosswalk = JSON.parse(
  fs.readFileSync(new URL('../docs/key-company-crosswalk.json', import.meta.url), 'utf8'),
);
const audit = JSON.parse(
  fs.readFileSync(new URL('../docs/company-master-audit.json', import.meta.url), 'utf8'),
);
const mappingAudit = JSON.parse(
  fs.readFileSync(new URL('../docs/industry-mapping-audit.json', import.meta.url), 'utf8'),
);
const listedEvidence = JSON.parse(
  fs.readFileSync(new URL('../docs/listed-company-evidence.json', import.meta.url), 'utf8'),
);

test('company master keeps the full workbook coverage and exposes the listed scope', () => {
  assert.equal(data.counts.sourceRows, 4477);
  assert.equal(data.counts.totalCompanies, data.companies.length);
  assert.equal(data.counts.totalCompanies, 4477);
  assert.deepEqual([...new Set(data.companies.map((company) => company.companyType))].sort(), [
    'key',
    'ordinary',
  ]);
  assert.ok(data.companies.every((company) => !('role' in company)));
  assert.equal(data.companies.filter((company) => company.companyType === 'ordinary').length, 4357);
  assert.equal(data.companies.filter((company) => company.companyType === 'key').length, 120);
  assert.equal(data.counts.listed, 230);
  assert.equal(data.counts.relationCount, 332);
  assert.equal(data.counts.relationSupplementCount, 96);
  assert.ok(data.companies.every((company) => company.research?.fieldStatus));
  assert.ok(data.companies.every((company) => company.bank?.sourceBatch !== 'mock'));
  assert.ok(data.companies.every((company) => company.tagStatus === '已生成'));
  const secondaryChainTags = new Set(
    CHAIN_PALETTE.flatMap((group) => [group.label, group.legendLabel, ...group.aliases]),
  );
  const removedSystemTags = new Set([...secondaryChainTags, '重点企业', '普通企业']);
  assert.ok(
    data.companies.every((company) => company.tags.every((tag) => !removedSystemTags.has(tag))),
  );
  assert.equal(data.companies.filter((company) => company.tags.includes('上市企业')).length, 230);
  assert.equal(listedEvidence.records.length, 136);
  assert.equal(data.companies.filter((company) => company.listedEvidence).length, 136);
  assert.ok(
    data.companies
      .filter((company) => company.listedEvidence)
      .every((company) => company.tags.includes('上市企业')),
  );
  const otherSourceRows = data.companies.filter((company) => company.rawIndustry === '其他');
  assert.equal(otherSourceRows.length, 229);
  assert.ok(otherSourceRows.every((company) => company.chain === '集成电路配套'));
  assert.ok(otherSourceRows.every((company) => chainGroupFor(company.chain) === 'supporting'));
  assert.ok(otherSourceRows.every((company) => company.secondaryCode === '6'));
  assert.ok(
    otherSourceRows.every(
      (company) => !company.tertiaryCode || /^6\.\d$/.test(company.tertiaryCode),
    ),
  );
  assert.ok(
    data.companies.every(
      (company) => !company.tertiaryCode || /^\d+\.\d$/.test(company.tertiaryCode),
    ),
  );
  assert.ok(
    data.companies
      .filter((company) => company.companyType === 'key')
      .every((company) => company.secondaryCode && company.tertiaryCode),
  );
});

test('legacy research crosswalk separates mapped profiles from source-not-found profiles', () => {
  assert.equal(crosswalk.profileCount, 130);
  assert.equal(crosswalk.records.length, 130);
  assert.equal(crosswalk.sourceNotFoundCount, 8);
  assert.equal(
    crosswalk.records.filter((record) => record.status === 'source-not-found').length,
    8,
  );
  const companyIds = new Set(data.companies.map((company) => company.id));
  assert.ok(
    crosswalk.records
      .filter((record) => record.status === 'matched')
      .every((record) => record.targetId && companyIds.has(record.targetId)),
  );
  assert.ok(
    data.companies
      .filter((company) => company.companyType === 'key')
      .every((company) => company.location && company.address),
  );
});

test('runtime relations only connect listed entities', () => {
  const byName = new Map(data.companies.map((company) => [company.name, company]));
  assert.ok(
    data.relations.every(
      (relation) =>
        byName.get(relation.from)?.tags.includes('上市企业') &&
        byName.get(relation.to)?.tags.includes('上市企业'),
    ),
  );
});

test('company master audit proves source coverage and runtime invariants', () => {
  assert.equal(audit.source.rowCount, 4477);
  assert.equal(audit.runtime.rowCount, 4477);
  assert.equal(audit.runtime.listedCount, 230);
  assert.equal(audit.runtime.relationCount, 332);
  assert.equal(audit.runtime.relationSupplementCount, 96);
  assert.equal(
    audit.runtime.pendingLocation,
    data.companies.filter((company) => !company.location).length,
  );
  assert.equal(
    audit.runtime.mappedLocation + audit.runtime.pendingLocation,
    audit.runtime.rowCount,
  );
  assert.equal(
    audit.runtime.verifiedLocation + audit.runtime.candidateLocation,
    audit.runtime.mappedLocation,
  );
  assert.equal(audit.runtime.regionReferenceLocation, 44);
  assert.equal(data.counts.regionReferenceLocation, 44);
  assert.equal(audit.researchCoverage.coordinateResearchRegionReferenceCompanies, 44);
  assert.equal(audit.keyCompanyCrosswalk.sourceProfiles, 130);
  assert.equal(audit.keyCompanyCrosswalk.uniqueTargetRows, 120);
  assert.deepEqual(audit.listedCoverage, {
    sourceRecords: 136,
    matchedRuntimeRows: 136,
    taggedRuntimeRows: 136,
    missingRuntimeNames: [],
    untrackedRuntimeNames: [],
  });
  assert.equal(audit.relationCoverage.totalRelations, 332);
  assert.equal(audit.relationCoverage.supplementSource, '历史企业画像（一级上下游）');
  assert.equal(audit.relationCoverage.supplementRelations, 96);
  assert.equal(audit.relationCoverage.supplementSourceProfiles, 52);
  assert.equal(audit.relationCoverage.supplementTargetCompanies, 6);
  assert.deepEqual(
    [...audit.relationCoverage.supplementTargetNames].sort(),
    [
      '华勤技术股份有限公司',
      '宁波康强电子股份有限公司',
      '深南电路股份有限公司',
      '上海龙旗科技股份有限公司',
      '深圳市兴森快捷电路科技股份有限公司',
      '苏州珂玛材料科技股份有限公司',
    ].sort(),
  );
  assert.deepEqual(audit.relationCoverage.missingProvenance, []);
  assert.deepEqual(audit.invariants, {
    sourceRowsMatchRuntime: true,
    onlyOrdinaryAndKeyTypes: true,
    noLegacyRoleFields: true,
    relationsOnlyListed: true,
    relationIdsUnique: true,
    relationSupplementRowsHaveProvenance: true,
    relationSupplementTargetsListed: true,
    runtimeCountMatchesSource: true,
    keyCountMatchesCrosswalkTargets: true,
    ordinaryPlusKeyMatchesRuntime: true,
    taxonomyHasSixSecondaryChains: true,
    taxonomyHasNineteenTertiaryChains: true,
    runtimeSecondaryCodesInTaxonomy: true,
    runtimeTertiaryCodesInTaxonomy: true,
    noDeepTertiaryCodes: true,
    mappingRecordsMatchRuntime: true,
    listedEvidenceRecordsUnique: true,
    listedEvidenceCodesUnique: true,
    listedEvidenceRecordsMapToRuntime: true,
    listedEvidenceRowsTagged: true,
    listedEvidenceCoverageMatchesSource: true,
  });
  assert.equal(audit.researchCoverage.fieldStatus.otherBank['pending-verification'], 4477);
  assert.equal(mappingAudit.scope.companyCount, 4477);
  assert.equal(mappingAudit.scope.listedCompanyCount, 230);
  assert.equal(mappingAudit.reviewQueue.filter((record) => record.companyType === 'key').length, 0);
  assert.equal(mappingAudit.summary.status.manual, 13);
  assert.deepEqual(
    data.companies
      .filter(
        (company) =>
          company.tags.includes('上市企业') && company.classificationStatus === 'pending',
      )
      .map((company) => company.name),
    [],
  );
  assert.deepEqual(
    Object.fromEntries(
      ['company-2390', 'company-3252', 'company-3253'].map((id) => {
        const company = data.companies.find((item) => item.id === id);
        return [id, [company?.secondaryCode, company?.tertiaryCode, company?.classificationStatus]];
      }),
    ),
    {
      'company-2390': ['2', '2.3', 'manual'],
      'company-3252': ['1', '1.1', 'manual'],
      'company-3253': ['1', '1.1', 'manual'],
    },
  );
});
