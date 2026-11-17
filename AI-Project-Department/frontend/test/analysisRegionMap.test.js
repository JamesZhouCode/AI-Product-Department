import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildAnalysisDataset } from '../src/features/analysis/analysisModel.js';

const chain = JSON.parse(
  readFileSync(new URL('../public/data/industries/storage-chain.json', import.meta.url), 'utf8'),
);
const credit = JSON.parse(
  readFileSync(new URL('../public/data/credit/storage-credit-mock.json', import.meta.url), 'utf8'),
);
const geojson = JSON.parse(
  readFileSync(new URL('../public/data/china-provinces.geojson', import.meta.url), 'utf8'),
);
const dataset = buildAnalysisDataset({ chain, credit, generatedAt: '2026-10-07' });

const shapeNames = new Set(
  geojson.features.map((feature) => feature.properties?.name).filter(Boolean),
);

test('区域地图边界数据包含全部省级行政区与南海诸岛等领土要素', () => {
  for (const required of [
    '北京市',
    '内蒙古自治区',
    '广西壮族自治区',
    '西藏自治区',
    '宁夏回族自治区',
    '新疆维吾尔自治区',
    '台湾省',
    '香港特别行政区',
    '澳门特别行政区',
  ]) {
    assert.ok(shapeNames.has(required), `边界数据缺少 ${required}`);
  }
  // adcode 为 100000_JD 的要素即南海诸岛及九段线，无名称，需单独标注。
  const southSea = geojson.features.find((feature) => feature.properties?.adcode === '100000_JD');
  assert.ok(southSea, '边界数据缺少南海诸岛要素');
  assert.equal(southSea.geometry.type, 'MultiPolygon');
});

test('每个环节的区域榜单省份都能在地图边界数据中匹配到', () => {
  for (const segment of dataset.segments) {
    assert.ok(segment.regions.regions.length >= 1, `${segment.key} 区域榜单为空`);
    // 省级企业数 + 境外注册 = 环节企业总数，口径不含未分类企业。
    assert.equal(
      segment.regions.totalDomestic + segment.regions.excluded,
      segment.regions.total,
      `${segment.key} 区域企业口径不平`,
    );
    for (const region of segment.regions.regions) {
      assert.ok(
        shapeNames.has(region.province),
        `${segment.key} 的省份「${region.province}」在地图数据中不存在`,
      );
      assert.ok(region.share > 0);
    }
  }
});

test('区域明细包含重点企业名单与集群、政策、风险', () => {
  for (const segment of dataset.segments) {
    for (const region of segment.regions.regions) {
      assert.ok(region.keyCompanies.length > 0, `${segment.key} / ${region.province} 缺重点企业`);
      assert.ok(region.keyCompanies.length <= 5);
      for (const company of region.keyCompanies) {
        assert.ok(company.name);
        assert.ok(company.tierLabel && company.grade);
      }
      assert.ok(region.clusters.length > 0);
      assert.ok(region.policy.includes(region.province));
      assert.ok(region.risk.length > 0);
    }
  }
});
