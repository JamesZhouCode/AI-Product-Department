// 算力链企业关系入链回归：股权 / 同一集团 / 客户供应商。
// 重点不是「有数据」，而是每条边都能落到统一社会信用代码主键、都有可追溯依据、
// 且方向语义正确（供应 = from 是卖方，股权 = from 是股东）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const chain = readJson('public/data/industries/compute-chain.json');
const shard = readJson('public/data/industries/companies-compute.json');
const detail = readJson('public/data/industries/compute-relations.json');

const companiesByName = new Map(shard.companies.map((item) => [item.name, item]));
const relations = chain.relations;

test('关系两端都落在算力链 1,764 家主体内，不引入链外节点', () => {
  assert.ok(relations.length > 2000, `关系条目偏少：${relations.length}`);
  const missing = relations.filter(
    (item) => !companiesByName.has(item.from) || !companiesByName.has(item.to),
  );
  assert.deepEqual(missing.slice(0, 5).map((item) => `${item.from}->${item.to}`), []);
  assert.equal(missing.length, 0);
});

test('关系类型限于四类，且每类都有可追溯依据', () => {
  const allowed = new Set(['供应', '股权', '同一集团', '同一实控人']);
  const unknown = relations.filter((item) => !allowed.has(item.relationType));
  assert.deepEqual(unknown.slice(0, 5).map((item) => item.relationType), []);

  const noBasis = relations.filter((item) => !item.basis || item.basis.length < 6);
  assert.equal(noBasis.length, 0, '每条关系都必须带证据描述（basis）');

  const noSource = relations.filter((item) => !item.sourceTable);
  assert.equal(noSource.length, 0, '每条关系都必须标明来源表');
});

test('关系主键统一为统一社会信用代码（缺码者为 pending 桶）', () => {
  const bad = relations.filter((item) => {
    for (const key of [item.fromKey, item.toKey]) {
      if (!key) return true;
      const ok = /^[0-9A-Z]{18}$/.test(key) || key.startsWith('pending:CP:');
      if (!ok) return true;
    }
    return false;
  });
  assert.deepEqual(bad.slice(0, 5).map((item) => `${item.fromKey}->${item.toKey}`), []);
  assert.equal(bad.length, 0);
});

test('供应关系的方向语义：from 是卖方、to 是买方', () => {
  const supply = relations.filter((item) => item.relationType === '供应');
  assert.ok(supply.length > 2000);
  const customerSide = supply.filter((item) => item.tradeSide === 'customer');
  const supplierSide = supply.filter((item) => item.tradeSide === 'supplier');
  assert.ok(customerSide.length > 1000, '客户侧（企业是卖方）应占多数');
  assert.ok(supplierSide.length > 800, '供应商侧（企业是买方）也应有数据');
  for (const item of supply.slice(0, 200)) {
    assert.ok(item.from !== item.to, '不应出现自环');
    assert.ok(['customer', 'supplier'].includes(item.tradeSide));
  }
});

test('股权关系从股东指向被投资企业，且不出现自环', () => {
  const equity = relations.filter((item) => item.relationType === '股权');
  assert.ok(equity.length >= 20, `股权关系偏少：${equity.length}`);
  for (const item of equity) {
    assert.ok(item.fromKey !== item.toKey, `${item.from} 不应投给自己`);
    assert.ok(item.sharePct === undefined || typeof item.sharePct === 'number');
  }
});

test('集团归集关系按实控人成组，同一对企业只保留一条', () => {
  const group = relations.filter((item) => item.relationType === '同一集团');
  assert.ok(group.length > 0);
  const seen = new Set();
  for (const item of group) {
    const pair = [item.fromKey, item.toKey].sort().join('|');
    assert.ok(!seen.has(pair), `集团关系重复：${item.from} / ${item.to}`);
    seen.add(pair);
    assert.ok((item.basis || '').length > 8, '集团关系需写明归集依据');
  }
});

test('关系以全称记录，可直接与主体名称对齐（详情页分组依赖）', () => {
  const sample = relations[0];
  assert.equal(typeof sample.from, 'string');
  assert.equal(typeof sample.to, 'string');
  assert.ok(companiesByName.has(sample.from));
  assert.ok(companiesByName.has(sample.to));
});

test('企业分片携带实控人 / 股东 / 集中度字段，且股东不超过 10 位', () => {
  const withController = shard.companies.filter((item) => item.controller);
  assert.ok(withController.length > 250, `有实控人的主体偏少：${withController.length}`);

  const withHolders = shard.companies.filter((item) => item.shareholders?.length);
  assert.ok(withHolders.length > 300, `有股东明细的主体偏少：${withHolders.length}`);
  for (const company of withHolders.slice(0, 50)) {
    assert.ok(company.shareholders.length <= 10);
    for (const holder of company.shareholders) {
      assert.ok(holder.name, '股东必须有名称');
      assert.ok(holder.pct === null || typeof holder.pct === 'number');
    }
  }

  const withCr = shard.companies.filter((item) => item.customerCr5 !== undefined);
  assert.ok(withCr.length > 250, '客户集中度覆盖应覆盖已取数主体');
});

test('关系明细分片按信用代码索引，链外客户供应商有截断与总量', () => {
  assert.equal(detail.industryCode, 'CP');
  const keys = Object.keys(detail.byCompany);
  assert.equal(keys.length, shard.companies.length, '每家主体都应有一条明细记录');

  const withTrade = Object.values(detail.byCompany).filter(
    (item) => item.customers?.length || item.suppliers?.length,
  );
  assert.ok(withTrade.length >= 280, `有交易明细的主体偏少：${withTrade.length}`);

  for (const item of withTrade.slice(0, 30)) {
    assert.ok(item.customerTotal >= item.customers.length, '客户总量不应小于已列条数');
    assert.ok(item.supplierTotal >= item.suppliers.length, '供应商总量不应小于已列条数');
    for (const row of [...item.customers, ...item.suppliers]) {
      assert.ok(row.name, '交易对手必须有名称');
      assert.ok(row.amount === null || typeof row.amount === 'number');
    }
  }
});

test('链视图统计与关系明细一致，不再宣称「无关系数据」', () => {
  assert.equal(chain.stats.relations, relations.length);
  assert.equal(chain.stats.relationsInChain, relations.length);
  assert.ok(chain.stats.relationTypes['供应'] > 0);
  assert.ok(chain.stats.relationCompanies > 500);
  assert.equal(shard.counts.relationCount, relations.length);
});
