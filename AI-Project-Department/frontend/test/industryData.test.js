import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILT_IN_INDUSTRY_CATALOG,
  industryEntryFor,
  parseIndustryCatalog,
  parseIndustryData,
} from '../src/features/app/industryData.js';

test('industry catalog keeps every independent runtime shard addressable', () => {
  const ids = BUILT_IN_INDUSTRY_CATALOG.map((entry) => entry.id);
  const files = BUILT_IN_INDUSTRY_CATALOG.map((entry) => entry.file);

  assert.deepEqual(ids, ['integrated-circuit', 'power', 'storage', 'biomed', 'ai']);
  assert.equal(new Set(files).size, files.length);
  assert.equal(industryEntryFor({ industries: BUILT_IN_INDUSTRY_CATALOG }, '人工智能').id, 'ai');
  assert.equal(
    industryEntryFor({ industries: BUILT_IN_INDUSTRY_CATALOG }, 'power').file,
    'industries/companies-power.json',
  );
  assert.equal(
    industryEntryFor({ industries: BUILT_IN_INDUSTRY_CATALOG }, '储能产业').file,
    'industries/companies-storage.json',
  );
});

test('invalid catalog and data payloads fail explicitly', () => {
  assert.throws(() => parseIndustryCatalog({ industries: [] }), /目录为空/);
  assert.throws(() => parseIndustryCatalog({ industries: [{ id: 'ai' }] }), /目录为空/);
  assert.throws(() => parseIndustryData({ companies: [] }), /数据分片格式不完整/);
  assert.deepEqual(parseIndustryData({ companies: [], relations: [] }), {
    companies: [],
    relations: [],
  });
});
