#!/usr/bin/env node
// 把 docs/pending-listed-overrides.json 的人工复核结论合并回
// docs/pending-listed-judgment.json：逐条覆盖 results[].conclusion/evidence，
// 重算 summary，并记录复核时间与依据。可重复执行（幂等）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const judgmentPath = path.join(root, 'docs', 'pending-listed-judgment.json');
const overridesPath = path.join(root, 'docs', 'pending-listed-overrides.json');

const judgment = JSON.parse(fs.readFileSync(judgmentPath, 'utf8'));
const overridesFile = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

const overrides = new Map();
for (const item of overridesFile.overrides) overrides.set(item.name, item);

let patched = 0;
let missing = 0;
for (const result of judgment.results) {
  const override = overrides.get(result.name);
  if (!override) continue;
  // 同名企业（不同行业分片中的重复条目）统一应用同一结论。
  result.conclusion = override.conclusion;
  result.evidence = override.evidence;
  result.reviewNote = override.reviewNote;
  result.reviewSource = 'pending-listed-overrides.json';
  patched += 1;
}
for (const name of overrides.keys()) {
  if (!judgment.results.some((result) => result.name === name)) {
    console.warn(`复核结论未找到对应企业：${name}`);
    missing += 1;
  }
}

const summary = {};
for (const result of judgment.results) {
  summary[result.conclusion] = (summary[result.conclusion] || 0) + 1;
}
judgment.summary = summary;
judgment.reviewedAt = overridesFile.generatedAt;
judgment.reviewSource =
  '人工复核（港股英文名/新三板注册地与公告/A股全名与注册地/公开工商信息），见 pending-listed-overrides.json';
judgment.reviewCoverage = {
  overrideCount: overridesFile.count,
  patchedResults: patched,
  unmatchedOverrides: missing,
};

fs.writeFileSync(judgmentPath, `${JSON.stringify(judgment, null, 2)}\n`);
console.log(`已合并人工复核结论：覆盖 ${patched} 条结果`);
console.log(`最终分类：${JSON.stringify(summary)}`);
console.log(`合计：${Object.values(summary).reduce((a, b) => a + b, 0)} / ${judgment.pendingCount}`);
if (missing > 0) process.exit(1);
