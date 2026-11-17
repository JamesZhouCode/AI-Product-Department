#!/usr/bin/env node
// 把某条行业链的数据分片裁剪为「只在链企业」口径。
//
// 背景：算力分片曾把 870 家「未入链」的长尾客户也装进 companies，
// 导致顶栏「当前链样本」显示 1460 家，与 compute-chain.json 的 590 家在链企业不一致。
// 业务口径调整后，前端只看在链企业：分片 = 链内企业（上市 + 重点非上市），
// 客户池仍保留在 chain.otherCustomers 中作为数据归档，不再进入地图 / 图谱 / 授信。
//
// 用法：
//   node scripts/scope-chain-shard.mjs --industry compute
//   node scripts/scope-chain-shard.mjs --industry compute --dry-run
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const industryArg = args.includes('--industry') ? args[args.indexOf('--industry') + 1] : 'compute';
const dryRun = args.includes('--dry-run');

const CONFIG = {
  compute: {
    chainFile: 'compute-chain.json',
    shardFile: 'companies-compute.json',
    label: '算力产业',
  },
};

const config = CONFIG[industryArg];
if (!config) {
  console.error(`未知行业：${industryArg}（可选：${Object.keys(CONFIG).join(' / ')}）`);
  process.exit(1);
}

const chainPath = path.join(rootDir, 'public', 'data', 'industries', config.chainFile);
const shardPath = path.join(rootDir, 'public', 'data', 'industries', config.shardFile);

const chain = JSON.parse(readFileSync(chainPath, 'utf8'));
const shard = JSON.parse(readFileSync(shardPath, 'utf8'));

const chainIds = new Set(chain.companies.map((company) => company.id));
const before = shard.companies.length;
const kept = shard.companies.filter((company) => chainIds.has(company.id));

if (kept.length !== chainIds.size) {
  const keptIds = new Set(kept.map((company) => company.id));
  const missing = [...chainIds].filter((id) => !keptIds.has(id));
  console.error(`分片缺少 ${missing.length} 家在链企业（示例：${missing.slice(0, 5).join(', ')}）`);
  process.exit(1);
}

const names = new Set(kept.flatMap((company) => [company.name, ...(company.aliases || [])]));
const relations = (shard.relations || []).filter(
  (relation) => names.has(relation.from) && names.has(relation.to),
);

const countBy = (rows, pick) => {
  const result = {};
  for (const row of rows) {
    const key = pick(row);
    if (!key) continue;
    result[key] = (result[key] || 0) + 1;
  }
  return result;
};

const listed = kept.filter((company) => company.companyType === 'listed').length;
const locationStatus = (company) => String(company.locationStatus || '待补');
const counts = {
  totalCompanies: kept.length,
  listed,
  ordinary: kept.length - listed,
  nonListed: kept.length - listed,
  neeqListed: kept.filter((company) => company.companyType === 'neeq').length,
  key: kept.filter((company) => company.isKey).length,
  relationCount: relations.length,
  mapped: kept.filter((company) => company.chain).length,
  verifiedLocation: kept.filter(
    (company) => company.location && !/参考|候选/.test(locationStatus(company)),
  ).length,
  candidateLocation: kept.filter((company) => locationStatus(company).startsWith('候选')).length,
  regionReferenceLocation: kept.filter((company) => /参考/.test(locationStatus(company))).length,
  pendingLocation: kept.filter((company) => !company.location).length,
  missingAddress: kept.filter((company) => !company.address).length,
  classification: {
    secondary: countBy(kept, (company) => company.secondaryIndustry),
    tertiary: countBy(kept, (company) => company.sector),
  },
  headTiers: {
    龙头: kept.filter((company) => company.tierLabel === '龙头').length,
    骨干: kept.filter((company) => company.tierLabel === '骨干').length,
    长尾: kept.filter((company) => company.tierLabel === '长尾').length,
  },
  relationTypes: countBy(relations, (relation) => relation.relationType),
};

const next = {
  ...shard,
  generatedAt: new Date().toISOString().slice(0, 10),
  scope: 'in-chain',
  scopeNote: `仅包含 ${config.label}在链企业（上市 + 重点非上市）；未入链的客户池保留在 ${config.chainFile} 的 otherCustomers 中，不进入地图 / 图谱 / 授信。`,
  counts,
  companies: kept,
  relations,
};

if (dryRun) {
  console.log(
    `[dry-run] ${config.label}：${before} → ${kept.length} 家（在链），关系 ${relations.length} 条`,
  );
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
}

writeFileSync(shardPath, `${JSON.stringify(next)}\n`, 'utf8');
console.log(
  `${config.label}：分片 ${before} → ${kept.length} 家（上市 ${listed} / 非上市 ${kept.length - listed}），关系 ${relations.length} 条；已写入 ${path.relative(rootDir, shardPath)}`,
);
