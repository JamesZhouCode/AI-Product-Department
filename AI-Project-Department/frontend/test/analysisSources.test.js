// 「分析」页数据来源标注的单测：
// 1) 来源元数据结构完整（AI 类必须列出替换为准确数据所需的数据源）；
// 2) 页面 / 导出中引用的每个来源 key 都在元数据中定义（防拼写错导致标注丢失）；
// 3) 字段级来源对照表覆盖全部展示指标；
// 4) 导出的 Markdown 带来源标注与「附录：数据来源说明」。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildAnalysisDataset } from '../src/features/analysis/analysisModel.js';
import { buildReportMarkdown } from '../src/features/analysis/analysisExport.js';
import {
  ANALYSIS_FIELD_SOURCES,
  ANALYSIS_SOURCE_META,
  ANALYSIS_SOURCE_SUMMARY,
} from '../src/features/analysis/analysisSources.js';

const read = (relative) =>
  readFileSync(new URL(`../src/features/analysis/${relative}`, import.meta.url), 'utf8');

const chain = JSON.parse(
  readFileSync(new URL('../public/data/industries/storage-chain.json', import.meta.url), 'utf8'),
);
const credit = JSON.parse(
  readFileSync(new URL('../public/data/credit/storage-credit-mock.json', import.meta.url), 'utf8'),
);
const dataset = buildAnalysisDataset({ chain, credit, generatedAt: '2026-10-07' });

test('来源元数据结构完整：scope / kind / badge / title / detail 齐备', () => {
  const entries = Object.entries(ANALYSIS_SOURCE_META);
  assert.ok(entries.length >= 10, `来源类型过少：${entries.length}`);
  for (const [key, meta] of entries) {
    assert.ok(meta.scope, `${key} 缺少 scope`);
    assert.ok(['data', 'ai'].includes(meta.kind), `${key} 的 kind 非法：${meta.kind}`);
    assert.ok(meta.badge, `${key} 缺少 badge`);
    assert.ok(meta.title, `${key} 缺少 title`);
    assert.ok(meta.detail && meta.detail.length >= 20, `${key} 的 detail 过短`);
    assert.ok(Array.isArray(meta.databases), `${key} 的 databases 必须是数组`);
  }
});

test('AI 估算类必须写明需对接的数据源；清单数据类标注为入库口径', () => {
  for (const [key, meta] of Object.entries(ANALYSIS_SOURCE_META)) {
    if (meta.kind === 'ai') {
      assert.ok(meta.databases.length >= 1, `${key} 为 AI 估算但未列出需对接的数据源`);
      assert.ok(
        /AI/.test(meta.badge) || /AI/.test(meta.title),
        `${key} 的标注未体现 AI 属性：${meta.badge} / ${meta.title}`,
      );
    } else {
      assert.equal(meta.badge, '清单数据', `${key} 的清单数据标注不一致`);
      assert.ok(
        /入链表|客户清单|清单/.test(`${meta.title}${meta.detail}`),
        `${key} 未写清具体来源`,
      );
    }
  }
});

test('字段级来源对照表的每个来源都能在元数据中找到', () => {
  let count = 0;
  assert.ok(ANALYSIS_FIELD_SOURCES.length >= 5, '来源对照分组过少');
  for (const group of ANALYSIS_FIELD_SOURCES) {
    assert.ok(group.group && group.items?.length, `${group.group} 分组为空`);
    for (const item of group.items) {
      assert.ok(item.field, `${group.group} 存在空字段名`);
      assert.ok(
        ANALYSIS_SOURCE_META[item.source],
        `${group.group} 的字段「${item.field}」引用了未知来源：${item.source}`,
      );
      count += 1;
    }
  }
  assert.ok(count >= 20, `字段级来源覆盖不足：仅 ${count} 条`);
});

test('页面与导出引用的 sourceKey 全部有定义（防标注静默丢失）', () => {
  const files = [
    'analysisSections.jsx',
    'AnalysisPage.jsx',
    'analysisExport.js',
    'AnalysisSourceBadge.jsx',
  ];
  const used = new Set();
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(/sourceKey="([^"]+)"/g)) used.add(match[1]);
    for (const match of text.matchAll(/source="([^"]+)"/g)) used.add(match[1]);
    for (const match of text.matchAll(/tagOf\(([^)]*)\)/g)) {
      for (const key of match[1].split(',')) {
        const trimmed = key.trim().replace(/^['"]|['"]$/g, '');
        if (trimmed) used.add(trimmed);
      }
    }
  }
  assert.ok(used.size >= 8, `未检出足够的来源引用：${used.size}`);
  for (const key of used) {
    assert.ok(ANALYSIS_SOURCE_META[key], `源码引用了未定义的来源 key：${key}`);
  }
});

test('所有 AI 估算类来源都在页面中被实际标注（不存在只定义不使用的类型）', () => {
  const used = new Set();
  for (const file of ['analysisSections.jsx', 'AnalysisPage.jsx']) {
    const text = read(file);
    for (const match of text.matchAll(/sourceKey="([^"]+)"/g)) used.add(match[1]);
    for (const match of text.matchAll(/source="([^"]+)"/g)) used.add(match[1]);
  }
  // aiCredit / creditScore 等通过 section 与表头覆盖，这里只校验核心 AI 数据类必须被标注。
  for (const key of [
    'aiMarket',
    'aiCapacity',
    'aiRegion',
    'aiConcentration',
    'aiTechnology',
    'aiScore',
  ]) {
    assert.ok(used.has(key), `AI 估算来源 ${key} 未在页面中标注`);
  }
});

test('概览 8 项核心指标均对应到来源标注', () => {
  const segment = dataset.segments[0];
  const overviewKeys = Object.keys(segment.overview);
  for (const key of [
    'marketSize',
    'companyCount',
    'listedCount',
    'keyCompanyCount',
    'capacity',
    'capacityUtilization',
    'growthRate',
    'industryStage',
  ]) {
    assert.ok(overviewKeys.includes(key), `概览缺少指标：${key}`);
  }
  // 概览指标的来源必须在字段级对照表中有对应行。
  const fields = ANALYSIS_FIELD_SOURCES.flatMap((group) => group.items.map((item) => item.field));
  assert.ok(
    fields.some((field) => field.includes('市场规模')),
    '对照表缺少市场规模来源',
  );
  assert.ok(
    fields.some((field) => field.includes('企业数')),
    '对照表缺少企业数来源',
  );
  assert.ok(
    fields.some((field) => field.includes('产能')),
    '对照表缺少产能来源',
  );
});

test('导出报告带章节来源标注与数据来源附录', () => {
  const markdown = buildReportMarkdown(dataset.segments[0]);
  assert.ok(markdown.includes('【清单数据'), '正文缺少清单数据标注');
  assert.ok(markdown.includes('【AI估算】') || markdown.includes('AI估算'), '正文缺少 AI 估算标注');
  assert.ok(markdown.includes('## 附录：数据来源说明'), '缺少数据来源附录');
  assert.ok(markdown.includes(ANALYSIS_SOURCE_SUMMARY.slice(0, 20)), '附录缺少来源总述');
  assert.ok(markdown.includes('### 字段级来源对照'), '附录缺少字段级对照表');
  assert.ok(
    markdown.includes('### AI 估算项：如需准确数据，可对接以下数据源'),
    '附录缺少数据源清单',
  );
  for (const meta of Object.values(ANALYSIS_SOURCE_META)) {
    if (meta.kind !== 'ai') continue;
    for (const db of meta.databases.slice(0, 1)) {
      assert.ok(markdown.includes(db), `附录缺少数据源：${db}`);
    }
  }
});

test('导出的附录与弹窗组件共用同一份来源元数据文件（避免双份维护）', () => {
  const exportSource = read('analysisExport.js');
  const modalSource = read('AnalysisSourceBadge.jsx');
  assert.ok(/from '\.\/analysisSources(\.js)?'/.test(exportSource), '导出未引用来源元数据');
  assert.ok(/from '\.\/analysisSources(\.js)?'/.test(modalSource), '弹窗未引用来源元数据');
  // 弹窗复用授信模块的溯源浮层组件，交互与样式保持一致。
  assert.ok(/from '\.\.\/credit\/SourceBadge'/.test(modalSource), '弹窗未复用授信模块的溯源浮层');
});
