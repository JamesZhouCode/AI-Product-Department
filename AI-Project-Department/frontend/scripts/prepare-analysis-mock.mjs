// 产业链「分析」模块 · 演示数据生成脚本（储能 / 算力共用）。
// 输入：public/data/industries/{storage|compute}-chain.json（产业链环节与企业口径）
//       public/data/credit/{storage|compute}-credit-mock.json（企业名单 / 地区 / 上市标记）
// 输出：public/data/analysis/{storage|compute}-analysis-mock.json（每个二级环节 × 8 章完整报告）
// 用法：
//   pnpm prepare:analysis                              # 储能产业（默认）
//   node scripts/prepare-analysis-mock.mjs --industry compute
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAnalysisDataset } from '../src/features/analysis/analysisModel.js';

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, '..');
const publicDir = resolve(frontendRoot, 'public');

const args = process.argv.slice(2);
const industry = args.includes('--industry') ? args[args.indexOf('--industry') + 1] : 'storage';
const KEY = industry === 'compute' ? 'compute' : 'storage';
const outFile = resolve(publicDir, `data/analysis/${KEY}-analysis-mock.json`);

async function readJson(relativePath) {
  const text = await readFile(resolve(publicDir, relativePath), 'utf8');
  return JSON.parse(text);
}

async function main() {
  const [chain, credit] = await Promise.all([
    readJson(`data/industries/${KEY}-chain.json`),
    readJson(`data/credit/${KEY}-credit-mock.json`),
  ]);

  const dataset = buildAnalysisDataset({
    chain,
    credit,
    generatedAt: new Date().toISOString().slice(0, 10),
  });

  const totalCompanies = dataset.segments.reduce(
    (sum, segment) => sum + segment.companies.count,
    0,
  );
  // 环节数量以链数据为准，避免把行业口径写死在脚本里。
  if (dataset.level1Count !== chain.levels.length) {
    throw new Error(
      `一级环节数量异常：链数据 ${chain.levels.length}，报告数据集 ${dataset.level1Count}`,
    );
  }
  const expectedLevel2 = chain.levels.reduce((sum, level) => sum + (level.children || []).length, 0);
  if (dataset.level2Count !== expectedLevel2) {
    throw new Error(`二级环节数量异常：期望 ${expectedLevel2}，实际 ${dataset.level2Count}`);
  }
  for (const segment of dataset.segments) {
    if (!segment.oneLiner || !segment.market || !segment.credit || segment.conclusions.length !== 6) {
      throw new Error(`环节报告结构不完整：${segment.key}`);
    }
    if (!(segment.companies.cr3 < segment.companies.cr5 && segment.companies.cr5 < segment.companies.cr10)) {
      throw new Error(`集中度口径异常（需 CR3 < CR5 < CR10）：${segment.key}`);
    }
    if (segment.companies.count === 0) {
      throw new Error(`二级环节无上市企业归属：${segment.key}`);
    }
  }
  // 一家上市企业可归属多个二级环节，这里校验并集覆盖入链表的全部企业。
  const covered = new Set(
    dataset.segments.flatMap((segment) => segment.companies.list.map((row) => row.name)),
  );
  const listedUniverse = new Set(chain.companies.map((company) => company.fullName || company.name));
  const uncovered = [...listedUniverse].filter((name) => !covered.has(name)).length;
  if (uncovered > 0) {
    process.stdout.write(
      `提示：${uncovered} 家上市企业未进入任一环节的主要企业榜（榜单每环节仅取前 12 家，属正常截断）。\n`,
    );
  }

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(dataset)}\n`, 'utf8');

  const sizeMb = (JSON.stringify(dataset).length / 1024 / 1024).toFixed(2);
  process.stdout.write(
    `分析演示数据已生成：${dataset.industry} · ${dataset.level1Count} 个一级环节 / ${dataset.level2Count} 个二级环节 / ` +
      `${totalCompanies} 家上市企业归属记录 → ${outFile}（约 ${sizeMb} MB）\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`生成失败：${error.message}\n`);
  process.exitCode = 1;
});
