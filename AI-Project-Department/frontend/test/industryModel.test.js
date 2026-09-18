import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAIN_COLOR_POOL, CHAIN_PALETTE, chainPaletteFor } from '../src/chainPalette.js';
import {
  buildIndustryAtlasModel,
  buildIndustrySnapshot,
  getWeekRange,
  shorten,
} from '../src/features/insights/industryModel.js';

function listedCompany(overrides = {}) {
  return {
    industry: '集成电路',
    companyType: 'key',
    tags: ['上市企业'],
    name: '未命名企业',
    chain: '集成电路设计',
    sector: '工具软件',
    coreTechnology: '',
    products: '',
    procurement: '',
    location: null,
    mapDisplay: true,
    locationStatus: '待研究',
    evidence: [],
    ...overrides,
  };
}

const integratedCircuitData = {
  companies: [
    listedCompany({
      name: 'Alpha设计',
      sector: '工具软件',
      coreTechnology: 'EDA、芯片架构',
      products: 'SoC',
      location: { lng: 121.4, lat: 31.2 },
      locationStatus: '已复核',
      evidence: ['annual-report'],
    }),
    listedCompany({
      name: 'Beta芯片',
      sector: '数字电路芯片',
      coreTechnology: 'AI芯片',
      products: '高性能计算芯片',
      location: { lng: 121.5, lat: 31.3 },
      locationStatus: 'verified',
      evidence: ['website'],
    }),
    listedCompany({
      name: 'Gamma材料',
      chain: '集成电路材料',
      sector: '制造材料',
      coreTechnology: '硅片工艺',
      products: '半导体硅片',
    }),
    listedCompany({ name: 'Future汽车', industry: '新能源汽车', chain: '其它' }),
    {
      ...listedCompany({ name: '关联供应商', chain: '集成电路材料', tags: [] }),
      companyType: 'ordinary',
    },
  ],
  relations: [
    { id: 'r1', from: 'Alpha设计', to: 'Beta芯片', relationType: '供应' },
    { id: 'r2', from: 'Beta芯片', to: 'Gamma材料', relationType: '经销' },
    { id: 'r3', from: 'Alpha设计', to: 'Gamma材料', relationType: '股权' },
    { id: 'r4', from: '关联供应商', to: 'Alpha设计', relationType: '供应' },
  ],
};

test('shorten handles empty values and preserves the ellipsis boundary', () => {
  assert.equal(shorten('', 8), '待补充');
  assert.equal(shorten('abcdef', 5), 'abcd…');
  assert.equal(shorten('abc', 5), 'abc');
});

test('getWeekRange returns the Monday-to-Sunday range for a midweek date', () => {
  assert.equal(getWeekRange(new Date(2026, 7, 19, 12)), '2026.08.17 — 2026.08.23');
  assert.equal(getWeekRange(new Date(2026, 7, 23, 12)), '2026.08.17 — 2026.08.23');
});

test('integrated-circuit secondary chains keep the approved display order', () => {
  assert.deepEqual(
    CHAIN_PALETTE.filter((group) => group.id !== 'pending').map((group) => group.id),
    ['materials', 'equipment', 'design', 'manufacturing', 'packaging', 'supporting'],
  );
  assert.deepEqual(
    CHAIN_PALETTE.filter((group) => group.id !== 'pending').map((group) => group.atlas.code),
    ['01', '02', '03', '04', '05', '06'],
  );
});

test('independent industry palettes draw distinct colors from the signal pool', () => {
  for (const industry of ['电力装备（含储能）', '生物医药', '人工智能']) {
    const colors = chainPaletteFor(industry)
      .filter((group) => group.id !== 'pending')
      .map((group) => group.color);
    assert.ok(colors.every((color) => CHAIN_COLOR_POOL.includes(color)));
    assert.equal(new Set(colors).size, colors.length);
  }
});

test('buildIndustrySnapshot scopes companies, relations and metrics by industry', () => {
  const full = buildIndustrySnapshot(integratedCircuitData, '集成电路');
  assert.equal(full.companies.length, 3);
  assert.equal(full.relations.length, 3);
  assert.equal(full.industryRelations.length, 3);
  assert.deepEqual(full.counts, { 供应: 1, 经销: 1, 股权: 1 });
  assert.equal(full.mappedCount, 2);
  assert.equal(full.verified, 2);
  assert.equal(full.scopeLabel, '集成电路 / 全链条');
  assert.ok(full.technologies.some((token) => token.label === 'EDA' && token.count === 1));
});

test('buildIndustrySnapshot exposes secondary-chain rollups for the full industry', () => {
  const snapshot = buildIndustrySnapshot(integratedCircuitData);
  const design = snapshot.secondaryStats.find((group) => group.id === 'design');
  const materials = snapshot.secondaryStats.find((group) => group.id === 'materials');

  assert.deepEqual(
    { count: design.count, mapped: design.mapped, relationCount: design.relationCount },
    { count: 2, mapped: 2, relationCount: 3 },
  );
  assert.deepEqual(
    { count: materials.count, mapped: materials.mapped, relationCount: materials.relationCount },
    { count: 1, mapped: 0, relationCount: 2 },
  );
});

test('buildIndustrySnapshot uses the selected industry palette', () => {
  const powerData = {
    companies: [
      listedCompany({
        name: '电力场景企业',
        industry: '电力装备（含储能）',
        primaryIndustry: '电力装备（含储能）',
        chain: '用电领域',
        secondaryIndustry: '用电领域',
        sector: '数据中心',
      }),
      listedCompany({
        name: '储能系统企业',
        industry: '电力装备（含储能）',
        primaryIndustry: '电力装备（含储能）',
        chain: '储能领域',
        secondaryIndustry: '储能领域',
        sector: '储能系统（待细分）',
      }),
    ],
    relations: [],
  };
  const snapshot = buildIndustrySnapshot(powerData, '电力装备（含储能）');

  assert.deepEqual(
    snapshot.secondaryStats.filter((group) => group.count > 0).map((group) => group.label),
    ['用电领域', '储能领域'],
  );
  assert.deepEqual(
    snapshot.stages.map((stage) => stage.label),
    ['用电领域', '储能领域'],
  );
  assert.match(snapshot.story.headline, /电力装备/);
});

test('industry atlas keeps multi-classification companies in every matching chain', () => {
  const biomedData = {
    companies: [
      listedCompany({
        name: '多环节医药企业',
        industry: '生物医药',
        primaryIndustry: '生物医药',
        chain: '创新药',
        secondaryIndustry: '创新药',
        sector: '',
        classifications: [
          { chain: '创新药', sector: '' },
          { chain: 'CXO', sector: '' },
        ],
      }),
    ],
    relations: [],
  };
  const model = buildIndustryAtlasModel(biomedData, '生物医药');

  assert.equal(model.companies.length, 1);
  assert.equal(model.secondary.find((group) => group.id === 'biomed-innovative').count, 1);
  assert.equal(model.secondary.find((group) => group.id === 'biomed-cxo').count, 1);
  assert.equal(model.secondary.flatMap((group) => group.companies).length, 2);
});

test('buildIndustryAtlasModel creates tertiary nodes and cross-chain relation counts', () => {
  const model = buildIndustryAtlasModel(integratedCircuitData, '集成电路');
  const design = model.secondary.find((group) => group.id === 'design');
  const materials = model.secondary.find((group) => group.id === 'materials');

  assert.equal(model.companies.length, 3);
  assert.equal(model.tertiary.length, 3);
  assert.equal(design.count, 2);
  assert.equal(design.tertiary.length, 2);
  assert.equal(design.label, '集成电路设计');
  assert.equal(design.color, CHAIN_PALETTE.find((group) => group.id === 'design').color);
  assert.equal(materials.count, 1);
  assert.equal(materials.tertiary[0].label, '制造材料');
  assert.equal(model.secondaryRelations.length, 1);
  assert.deepEqual(model.secondaryRelations[0], {
    groups: ['design', 'materials'],
    count: 2,
  });
});

test('buildIndustryAtlasModel falls back to explicit secondary fields for future industries', () => {
  const futureData = {
    companies: [
      listedCompany({
        name: '未来电池',
        industry: '新能源汽车',
        secondaryIndustry: '电池材料',
        sector: '正极材料',
      }),
      listedCompany({
        name: '未来电驱',
        industry: '新能源汽车',
        secondaryIndustry: '电驱系统',
        sector: '电机控制',
      }),
    ],
    relations: [{ id: 'future-r1', from: '未来电池', to: '未来电驱', relationType: '供应' }],
  };
  const model = buildIndustryAtlasModel(futureData, '新能源汽车');

  assert.equal(model.label, '新能源汽车');
  assert.equal(model.secondary.length, 2);
  assert.ok(model.secondary.some((group) => group.label === '电池材料'));
  assert.ok(model.secondary.some((group) => group.label === '电驱系统'));
  assert.deepEqual(model.secondaryRelations, [
    { groups: ['secondary-电池材料', 'secondary-电驱系统'], count: 1 },
  ]);
});

test('industry models tolerate an empty runtime payload', () => {
  const snapshot = buildIndustrySnapshot({}, '集成电路');
  const atlas = buildIndustryAtlasModel({}, '集成电路');

  assert.equal(snapshot.companies.length, 0);
  assert.equal(snapshot.relations.length, 0);
  assert.equal(atlas.companies.length, 0);
  assert.equal(atlas.secondary.length, 0);
  assert.equal(atlas.tertiary.length, 0);
});
