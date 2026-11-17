// 「AI 深度分析」与「刷新分析」两个按钮的产出的单测：
// 1) 洞察模块结构完整、文案无空值、结果可复现；
// 2) 洞察维度的来源 key 都在元数据中定义；
// 3) 导出报告在传入洞察时才有「AI 深度分析结论」章节（两个按钮的产出一眼可辨）；
// 4) 源码层面两个按钮绑定到不同处理函数（防止再次退化为同一个函数）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildAnalysisDataset } from '../src/features/analysis/analysisModel.js';
import { buildReportMarkdown } from '../src/features/analysis/analysisExport.js';
import { AI_INSIGHT_STEPS, buildAiInsights } from '../src/features/analysis/analysisInsights.js';
import { ANALYSIS_SOURCE_META } from '../src/features/analysis/analysisSources.js';

const read = (relative) =>
  readFileSync(new URL(`../src/features/analysis/${relative}`, import.meta.url), 'utf8');

const chain = JSON.parse(
  readFileSync(new URL('../public/data/industries/storage-chain.json', import.meta.url), 'utf8'),
);
const credit = JSON.parse(
  readFileSync(new URL('../public/data/credit/storage-credit-mock.json', import.meta.url), 'utf8'),
);
const dataset = buildAnalysisDataset({ chain, credit, generatedAt: '2026-10-07' });

test('洞察维度与链路步骤一一对应，且结构完整', () => {
  const segment = dataset.segments[0];
  const items = buildAiInsights(segment);
  assert.equal(items.length, AI_INSIGHT_STEPS.length);
  items.forEach((item, index) => {
    assert.equal(item.id, AI_INSIGHT_STEPS[index].id, '洞察顺序必须与链路步骤一致');
    assert.equal(item.label, AI_INSIGHT_STEPS[index].label);
    assert.ok(item.headline && item.headline.length >= 6, `${item.id} 的 headline 过短`);
    assert.ok(item.text && item.text.length >= 60, `${item.id} 的 text 过短`);
    assert.ok(Array.isArray(item.metrics) && item.metrics.length >= 3, `${item.id} 指标不足`);
  });
});

test('洞察维度的来源 key 都在来源元数据中定义', () => {
  for (const step of AI_INSIGHT_STEPS) {
    assert.ok(ANALYSIS_SOURCE_META[step.sourceKey], `${step.id} 引用了未知来源：${step.sourceKey}`);
  }
});

test('全部 24 个环节的洞察文案不含空值/未定义字段', () => {
  for (const segment of dataset.segments) {
    const items = buildAiInsights(segment);
    assert.equal(items.length, AI_INSIGHT_STEPS.length, `${segment.key} 洞察条目缺失`);
    for (const item of items) {
      const text = `${item.headline} ${item.text} ${item.metrics
        .map((metric) => `${metric.label}=${metric.value}`)
        .join(' ')}`;
      assert.ok(
        !/undefined|null|NaN|\[object/.test(text),
        `${segment.key}/${item.id} 存在空值：${text.slice(0, 120)}`,
      );
    }
  }
});

test('同一环节两次生成结果完全一致（可复现）', () => {
  const segment = dataset.segments[3];
  assert.deepEqual(buildAiInsights(segment), buildAiInsights(segment));
});

test('未运行 AI 分析时，导出报告不含「AI 深度分析结论」章节', () => {
  const markdown = buildReportMarkdown(dataset.segments[0]);
  assert.ok(!markdown.includes('## AI 深度分析结论'), '未运行 AI 却出现了 AI 结论章节');
});

test('运行 AI 分析后，导出报告新增「AI 深度分析结论」章节并含各维度结论', () => {
  const segment = dataset.segments[0];
  const items = buildAiInsights(segment);
  const markdown = buildReportMarkdown(segment, { insights: items, insightsAt: '13:45:00' });
  assert.ok(markdown.includes('## AI 深度分析结论'), '缺少 AI 结论章节');
  assert.ok(markdown.includes('13:45:00'), '缺少 AI 生成时间');
  for (const item of items) {
    assert.ok(markdown.includes(item.headline), `缺少维度结论：${item.label}`);
  }
});

test('「刷新分析」与「AI 深度分析」绑定到不同处理函数', () => {
  const source = read('AnalysisPage.jsx');
  assert.ok(/onClick=\{handleRefresh\}/.test(source), '刷新分析未绑定 handleRefresh');
  assert.ok(/onClick=\{runAiAnalysis\}/.test(source), 'AI 深度分析未绑定 runAiAnalysis');
  assert.ok(
    source.includes("import { AI_INSIGHT_STEPS, buildAiInsights } from './analysisInsights'"),
    '页面未引用洞察模块',
  );
});

test('「刷新分析」只重载数据层，不生成 AI 洞察', () => {
  const source = read('AnalysisPage.jsx');
  const start = source.indexOf('const handleRefresh = useCallback');
  assert.ok(start > -1, '未找到 handleRefresh');
  const end = source.indexOf('// 正文滚动时目录自动高亮');
  const body = source.slice(start, end);
  assert.ok(body.includes('await refresh()'), 'handleRefresh 未调用数据层 refresh');
  assert.ok(!body.includes('buildAiInsights'), 'handleRefresh 不应生成 AI 洞察');
  assert.ok(!body.includes('setAiResults'), 'handleRefresh 不应写入 AI 产出');
});

test('数据层 refresh 会绕过缓存重新拉取（cache-bust）', () => {
  const source = read('useAnalysisData.js');
  assert.ok(/export function useAnalysisData/.test(source), '未找到 useAnalysisData');
  assert.ok(source.includes('force = false'), '未找到强制刷新参数');
  assert.ok(source.includes("cache: 'no-store'"), '未设置 no-store，可能命中浏览器缓存');
  assert.ok(
    /return \{ \.\.\.state, refresh, refreshing \}/.test(source),
    '未导出 refresh/refreshing',
  );
});
