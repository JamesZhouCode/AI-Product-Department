import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const files = ['power', 'storage', 'biomed', 'ai'].map((key) =>
  path.join(root, 'public', 'data', 'industries', `companies-${key}.json`),
);
const expectedIndustryByKey = {
  power: '电力装备（含储能）',
  storage: '储能产业',
  biomed: '生物医药',
  ai: '人工智能',
};

function readPayload(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('new industry shards keep relation counts and listed主体 unique', () => {
  for (const file of files) {
    const payload = readPayload(file);
    const key = path.basename(file).replace(/^companies-|\.json$/g, '');
    const listed = payload.companies.filter((company) => company.tags?.includes('上市企业'));
    const namesByStockCode = new Map();

    assert.ok(payload.companies.length > 0, `${path.basename(file)} 为空`);
    assert.ok(
      payload.companies.every((company) => company.primaryIndustry === expectedIndustryByKey[key]),
      `${path.basename(file)} 混入其他一级产业链`,
    );
    assert.ok(
      payload.companies.every(
        (company) => Array.isArray(company.classifications) && company.classifications.length,
      ),
      `${path.basename(file)} 缺少分类记录`,
    );
    assert.equal(payload.counts.totalCompanies, payload.companies.length);
    assert.equal(payload.counts.listed, listed.length);

    for (const company of listed) {
      const stockCode = company.research?.additionalFields?.stockCode;
      assert.ok(stockCode, `${path.basename(file)} 上市企业缺少股票代码：${company.name}`);
      if (!namesByStockCode.has(stockCode)) namesByStockCode.set(stockCode, company.name);
      assert.equal(
        namesByStockCode.get(stockCode),
        company.name,
        `${path.basename(file)} 股票代码 ${stockCode} 对应多个上市主体`,
      );
    }

    assert.equal(payload.counts.relationCount, payload.relations.length, path.basename(file));
    const listedNames = new Set(listed.map((company) => company.name));
    for (const relation of payload.relations) {
      assert.ok(
        listedNames.has(relation.from),
        `${path.basename(file)} 关系起点未标记上市：${relation.from}`,
      );
      assert.ok(
        listedNames.has(relation.to),
        `${path.basename(file)} 关系终点未标记上市：${relation.to}`,
      );
    }
  }
});
