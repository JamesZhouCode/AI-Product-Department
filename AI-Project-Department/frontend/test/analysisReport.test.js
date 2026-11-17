// 「分析」页研报结构化（第一篇 / 第二篇）与导出报告的单测。
// 数据来自《中国新型储能行业研究报告——商业银行授信视角》PDF 的版式解析结果：
// public/data/analysis/storage-report.json，页面阅读器与导出报告共用同一份结构。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildStructuredReportMarkdown } from '../src/features/analysis/analysisExport.js';
import { partByKey, reportStats, statsOf, tocOf } from '../src/features/analysis/reportModel.js';

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

const report = JSON.parse(read('public/data/analysis/storage-report.json'));

test('研报数据结构完整：封面元信息 + 两个篇 + 章节树', () => {
  assert.equal(report.meta.title, '中国新型储能行业研究报告');
  assert.ok((report.meta.subtitle || '').includes('商业银行授信视角'));
  assert.equal(report.meta.pages, 66, '应为原报告 66 页');
  assert.deepEqual(
    (report.parts || []).map((part) => part.key),
    ['part1', 'part2'],
    '应有第一篇 / 第二篇两个部分',
  );
  assert.equal(report.parts[0].name, '整体分析');
  assert.equal(report.parts[1].name, '细分领域分析');
  // 每章 / 每节都应有锚点 key，供目录与正文联动。
  for (const part of report.parts) {
    for (const chapter of part.chapters) {
      assert.ok(chapter.key && chapter.title, `章缺 key / title：${part.key}`);
      (chapter.sections || []).forEach((section) => {
        assert.ok(section.key, `${chapter.key} 的节缺 key`);
      });
    }
  }
});

test('第一篇结构与原报告目录一致：摘要 + 一~七章 + 附录 + 附表1/2', () => {
  const titles = report.parts[0].chapters.map((chapter) => chapter.title);
  assert.ok(titles[0] === '摘要', '第一篇第一章应为摘要');
  [
    '一、行业研究综述',
    '二、储能领域产业链分析',
    '三、企业画像分析',
    '四、存量授信业务分析（行内数据模板）',
    '五、金融服务策略',
    '六、报告核心成果：六张核心图表',
    '七、报告结论：银行关心的五个问题',
    '附录：数据说明与免责声明',
  ].forEach((title) => assert.ok(titles.includes(title), `第一篇缺少：${title}`));
  assert.ok(
    titles.some((title) => title.startsWith('附表1')),
    '第一篇缺少附表1（战略白名单）',
  );
  assert.ok(
    titles.some((title) => title.startsWith('附表2')),
    '第一篇缺少附表2（重点培育名单）',
  );
  // 摘要应包含四个核心判断（原报告正文）。
  const summary = report.parts[0].chapters[0];
  const summaryText = (summary.blocks || []).map((block) => block.text || '').join('\n');
  ['核心判断一', '核心判断二', '核心判断三', '核心判断四'].forEach((word) =>
    assert.ok(summaryText.includes(word), `摘要缺少 ${word}`),
  );
});

test('第二篇结构一致：上游专题 + 中游深度分析 + 附表3，各含 1.1~1.8 八节', () => {
  const chapters = report.parts[1].chapters;
  assert.ok(chapters.length >= 2, '第二篇至少含上游 / 中游两章');
  assert.ok(chapters[0].title.includes('上游专题'), '第二篇第一章应为上游专题');
  assert.ok(chapters[1].title.includes('中游'), '第二篇第二章应为中游');
  for (const chapter of chapters.slice(0, 2)) {
    const sections = chapter.sections.map((section) => section.title);
    assert.equal(sections.length, 8, `${chapter.title} 应为 1.1~1.8 八节`);
    assert.ok(sections[0].startsWith('1.1'), '节序应从 1.1 开始');
    assert.ok(sections[7].includes('银行授信视角'), '1.8 应为银行授信视角');
  }
  assert.ok(chapters[chapters.length - 1].title.startsWith('附表3'), '第二篇末尾应为附表3');
});

test('全文规模统计：44 表 21 图，附表名单齐全', () => {
  const stats = reportStats(report);
  assert.equal(stats.parts, 2);
  assert.equal(stats.tables, 44, `表格数应为 44，实际 ${stats.tables}`);
  assert.equal(stats.figures, 21, `图表数应为 21，实际 ${stats.figures}`);
  assert.ok(stats.chapters >= 14, '章节数不足');
  // 附表1 明细应有 59 户左右（59 行数据）。
  const part1 = partByKey(report, 'part1');
  const annex1 = part1.chapters.find((chapter) => chapter.title.startsWith('附表1'));
  const annex1Table = (annex1.blocks || []).find((block) => block.t === 'table' && block.rows);
  assert.ok(annex1Table, '附表1 缺少名单明细表');
  assert.ok(annex1Table.rows.length >= 55, '附表1 名单行数过少');
});

test('reportModel：目录、篇内统计与按 key 取篇', () => {
  const part1 = partByKey(report, 'part1');
  assert.equal(part1.key, 'part1');
  assert.equal(partByKey(report, '不存在'), report.parts[0], '未知 key 应兜底到第一篇');

  const toc = tocOf(part1);
  assert.ok(toc.length >= 30, '第一篇目录项过少');
  assert.ok(toc.some((item) => item.level === 1 && item.title === '摘要'));
  assert.ok(
    toc.some((item) => item.level === 3),
    '目录应包含小节层级',
  );

  const stats = statsOf(part1);
  assert.ok(stats.chapters >= 11 && stats.tables > 0 && stats.paragraphs > 0);
});

test('导出报告结构与原报告一致：封面 → 目录 → 第一篇 → 第二篇 → 附表', () => {
  const md = buildStructuredReportMarkdown(report);
  // 封面
  assert.ok(md.startsWith('# 中国新型储能行业研究报告'), '导出应以报告标题开头');
  assert.ok(md.includes('商业银行授信视角'), '缺少副标题');
  assert.ok(md.includes('原文来源'), '缺少原文来源标注');
  // 目录
  assert.ok(md.includes('## 目录'), '缺少目录');
  // 篇与章
  assert.ok(md.includes('# 第一篇 整体分析'), '缺少第一篇');
  assert.ok(md.includes('# 第二篇 细分领域分析'), '缺少第二篇');
  [
    '## 摘要',
    '## 一、行业研究综述',
    '## 二、储能领域产业链分析',
    '## 三、企业画像分析',
    '## 四、存量授信业务分析（行内数据模板）',
    '## 五、金融服务策略',
    '## 六、报告核心成果：六张核心图表',
    '## 七、报告结论：银行关心的五个问题',
    '## 附录：数据说明与免责声明',
    '## 附表1',
    '## 附表2',
    '## 附表3',
  ].forEach((heading) => assert.ok(md.includes(heading), `导出缺少标题：${heading}`));
  // 细分领域 1.1~1.8
  assert.ok(md.includes('### 1.1 行业规模与需求测算'), '缺少细分领域 1.1');
  assert.ok(md.includes('### 1.8 银行授信视角'), '缺少细分领域 1.8');
  // 表格渲染为 markdown 表，附表1 有名单行
  assert.ok(/\|[^|]+\|/.test(md), '导出中缺少表格');
  assert.ok(md.includes('许继电气'), '附表1 明细缺少名单');
  // 未跑 AI 分析时不应有附录二
  assert.ok(!md.includes('附录二'), '未运行 AI 分析时不应出现附录二');
});

test('导出报告可选携带 AI 深度分析结论，并明确标注非原报告内容', () => {
  const md = buildStructuredReportMarkdown(report, {
    insights: [
      {
        label: '01',
        headline: '测试洞察',
        text: '这是一条测试洞察。',
        metrics: [{ label: '规模', value: '100 亿元' }],
      },
    ],
    insightsAt: '12:00:00',
    segment: { level1: '资源与材料', level2Display: '矿产资源与化工原料' },
  });
  assert.ok(md.includes('## 附录二'), '缺少 AI 结论附录');
  assert.ok(md.includes('非原报告内容'), '附录二未标注非原报告内容');
  assert.ok(md.includes('测试洞察'), '缺少洞察标题');
  assert.ok(md.includes('12:00:00'), '缺少生成时间');
  // 附录二在文末，不打乱原报告结构。
  assert.ok(md.indexOf('## 附录二') > md.indexOf('## 附表3'), '附录二应位于原报告结构之后');
});

test('页面接线：三视图切换 + 报告阅读器 + 结构化导出', () => {
  const page = read('src/features/analysis/AnalysisPage.jsx');
  assert.ok(page.includes("import { useReportData } from './useReportData'"), '未接入研报数据');
  assert.ok(page.includes("import ReportReader from './ReportReader'"), '未接入报告阅读器');
  assert.ok(page.includes('REPORT_VIEWS'), '缺少视图定义');
  assert.ok(/onClick=\{handleRefresh\}/.test(page), '刷新分析未绑定 handleRefresh');
  assert.ok(/onClick=\{runAiAnalysis\}/.test(page), 'AI 深度分析未绑定 runAiAnalysis');
  assert.ok(page.includes('buildStructuredReportMarkdown'), '导出未使用结构化报告生成');
  assert.ok(page.includes('ana-view-card'), '缺少视图切换卡片');
  const reader = read('src/features/analysis/ReportReader.jsx');
  assert.ok(reader.includes('rp-table'), '阅读器缺少表格样式类');
  assert.ok(reader.includes('rp-toc'), '阅读器缺少目录样式类');
});
