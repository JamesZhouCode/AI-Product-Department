// 「分析」报告导出：生成 Markdown 全文（含报告信息、核心结论、8 章正文、风险
// 与「附录：数据来源说明」），由浏览器直接下载。结构预留给后端 PDF 渲染。
import {
  ANALYSIS_FIELD_SOURCES,
  ANALYSIS_SOURCE_META,
  ANALYSIS_SOURCE_SUMMARY,
  sourceRowNote,
} from './analysisSources.js';

const fmt = (value, digits = 0) =>
  Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: digits });

// 章节来源标注：带「清单数据」的为入库真实口径，其余为 AI 估算 / 生成。
const tagOf = (...keys) => {
  const badges = keys.map((key) => ANALYSIS_SOURCE_META[key]?.badge).filter(Boolean);
  return badges.length ? `【${[...new Set(badges)].join(' / ')}】` : '';
};

const cell = (row) => `| ${row.join(' | ')} |`;
const table = (header, rows) =>
  [cell(header), cell(header.map(() => '---')), ...rows.map(cell)].join('\n');

// Markdown 表格单元格里不能直接出现竖线与换行。
const escapeCell = (value) =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .trim();
const mdTable = (head, rows) =>
  [
    cell(['', ...head].slice(1)),
    cell(head.map(() => '---')),
    ...rows.map((row) => cell(row.map(escapeCell))),
  ].join('\n');

/* ============================================================================
 * 与原报告结构一致的完整报告导出
 * 结构来源：public/data/analysis/storage-report.json（由《中国新型储能行业研究报告
 * ——商业银行授信视角》PDF 按版式解析），因此导出结构与 PDF 逐节对应：
 *   封面信息 → 目录 → 第一篇 整体分析（摘要 / 一~七章 / 附录 / 附表1·2）
 *   → 第二篇 细分领域分析（上游专题 / 中游深度分析 / 附表3）
 * ==========================================================================*/

function blockToMarkdown(block, lines) {
  if (block.t === 'table') {
    lines.push(`**${block.title}**`);
    lines.push('');
    if (Array.isArray(block.head) && block.rows?.length) {
      lines.push(mdTable(block.head, block.rows));
    } else {
      lines.push('> 该表在原报告中为图形化排布，未能结构化解析，请以原文为准。');
    }
    if (block.note) {
      lines.push('');
      lines.push(`> ${block.note}`);
    }
    lines.push('');
    return;
  }
  if (block.t === 'figure') {
    lines.push(`**${block.title}**`);
    lines.push('');
    lines.push('> 原报告此处为图形化图表，数据口径见下方来源说明。');
    if (block.note) {
      lines.push('>');
      lines.push(`> ${block.note}`);
    }
    lines.push('');
    return;
  }
  if (block.t === 'note') {
    lines.push(`> ${block.text}`);
    lines.push('');
    return;
  }
  lines.push(block.text);
  lines.push('');
}

function holderToMarkdown(holder, lines) {
  for (const block of holder.blocks || []) blockToMarkdown(block, lines);
}

/** 目录：篇 → 章 → 节（与原报告目录同样的两级展开）。 */
function tocLines(report) {
  const lines = [];
  for (const part of report.parts || []) {
    lines.push(`- **${part.no} ${part.name}**`);
    for (const chapter of part.chapters || []) {
      lines.push(`  - ${chapter.title}`);
      for (const section of chapter.sections || []) {
        if (section.title) lines.push(`    - ${section.title}`);
      }
    }
  }
  return lines;
}

export function buildStructuredReportMarkdown(report, options = {}) {
  const { meta = {}, parts = [] } = report || {};
  const insights = Array.isArray(options.insights) ? options.insights : null;
  const lines = [];

  // ---------------------------------------------------------------- 封面
  lines.push(`# ${meta.title || '中国新型储能行业研究报告'}`);
  lines.push('');
  lines.push(`## ${meta.subtitle || '——商业银行授信视角'}`);
  lines.push('');
  lines.push(`> ${meta.org || '对公业务行业研究 · 内部研究资料'}`);
  lines.push(`> 报告期：${meta.date || ''}`);
  lines.push(`> 数据基准：${meta.dataBaseDate || ''}`);
  if (meta.sourcePdf) lines.push(`> 原文来源：${meta.sourcePdf}（共 ${meta.pages || '—'} 页）`);
  lines.push('');

  // ---------------------------------------------------------------- 目录
  lines.push('## 目录');
  lines.push('');
  lines.push(...tocLines(report));
  lines.push('');

  // ---------------------------------------------------------------- 正文
  for (const part of parts) {
    lines.push('---');
    lines.push('');
    lines.push(`# ${part.no} ${part.name}`);
    lines.push('');
    for (const chapter of part.chapters || []) {
      lines.push(`## ${chapter.title}`);
      lines.push('');
      holderToMarkdown(chapter, lines);
      for (const section of chapter.sections || []) {
        if (section.title) {
          lines.push(`### ${section.title}`);
          lines.push('');
        }
        holderToMarkdown(section, lines);
        for (const subsection of section.subsections || []) {
          lines.push(`#### ${subsection.title}`);
          lines.push('');
          holderToMarkdown(subsection, lines);
        }
      }
    }
  }

  // ------------------------------------------------- 附录二：本次会话的 AI 结论
  // 仅当跑过「AI 深度分析」时出现，且明确标注非原报告内容，避免与原文混淆。
  if (insights) {
    lines.push('---');
    lines.push('');
    lines.push('## 附录二　AI 深度分析结论（本系统生成，非原报告内容）');
    lines.push('');
    lines.push(
      `> 由「AI 深度分析」在 ${options.insightsAt || '本次会话'} 基于当期数据生成，共 ${insights.length} 项；` +
        `${options.segment ? `分析环节：${options.segment.level1} / ${options.segment.level2Display || options.segment.level2}。` : ''}` +
        '以下内容不属于原报告结构，供授信研究参考。',
    );
    lines.push('');
    for (const item of insights) {
      lines.push(`### ${item.label}：${item.headline}`);
      lines.push('');
      lines.push(item.text);
      lines.push('');
      if (item.metrics?.length) {
        lines.push(
          mdTable(
            ['指标', '取值'],
            item.metrics.map((m) => [m.label, m.value]),
          ),
        );
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

// options.insights / options.insightsAt 由「AI 深度分析」产出：
// 未运行过 AI 分析时不传，报告不含该章节（保证两个按钮的产出一眼可辨）。
export function buildReportMarkdown(segment, options = {}) {
  const { overview, market, regions, capacity, companies, technology, credit } = segment;
  const insights = Array.isArray(options.insights) ? options.insights : null;
  const lines = [];

  const industryLabel =
    options.industry ||
    (String(segment.level1 || '').startsWith('算力') ? '算力产业' : '储能产业链');
  lines.push(`# ${industryLabel}——${segment.level2Display || segment.level2}行业分析`);
  lines.push('');
  lines.push('## 报告信息');
  lines.push('');
  lines.push(
    table(
      ['项目', '内容'],
      [
        ['一级环节', segment.level1],
        ['二级环节', segment.level2],
        ['报告周期', `${segment.reportYear} 年`],
        ['数据基准年', String(segment.referenceYear)],
        ['更新时间', segment.updatedAt],
        ['数据状态', '演示数据（企业档案为入库口径，规模与产能为 AI 估算）'],
        ['研究口径', '商业银行授信视角'],
      ],
    ),
  );
  lines.push('');
  lines.push(`> **一句话结论**：${segment.oneLiner}`);
  lines.push('');
  lines.push(`> 数据说明：${segment.mockNote}`);

  lines.push('');
  lines.push(`## 核心结论 ${tagOf('aiJudgement')}`);
  lines.push('');
  for (const item of segment.conclusions) {
    lines.push(`${item.index} **${item.title}**：${item.text}`);
    lines.push('');
  }

  // 仅当用户点了「AI 深度分析」时才有这一章。
  if (insights) {
    lines.push(`## AI 深度分析结论 ${tagOf('aiJudgement')}`);
    lines.push('');
    lines.push(
      `> 由「AI 深度分析」在 ${options.insightsAt || '本次会话'} 基于当期数据生成，共 ${insights.length} 项。`,
    );
    lines.push('');
    for (const item of insights) {
      // 洞察维度的来源徽章由维度自身的 sourceKey 决定（与页面上的浮层同源）。
      const badge = ANALYSIS_SOURCE_META[item.sourceKey]?.badge;
      lines.push(`### ${item.label}：${item.headline} ${badge ? `【${badge}】` : ''}`);
      lines.push('');
      lines.push(item.text);
      lines.push('');
      if (item.metrics?.length) {
        lines.push(
          table(
            ['指标', '取值'],
            item.metrics.map((m) => [m.label, m.value]),
          ),
        );
        lines.push('');
      }
    }
  }

  lines.push(`## 01 行业规模与需求测算 ${tagOf('aiMarket')}`);
  lines.push('');
  lines.push(
    table(
      ['指标', '数值'],
      [
        [`${market.years[market.years.length - 1]} 年中国规模`, `${fmt(market.chinaLatest)} 亿元`],
        ['同比增速', `+${market.growth}%`],
        ['2026E 规模', `${fmt(market.forecast[0])} 亿元`],
        ['2026—2030 CAGR', `${market.cagr}%`],
        ['全球规模', `${fmt(market.tam.tam)} 亿元`],
        ['行业阶段', market.stage],
      ],
    ),
  );
  lines.push('');
  lines.push(
    `历年规模：${market.years.map((year, index) => `${year} 年 ${fmt(market.china[index])}`).join('、')}`,
  );
  lines.push('');
  lines.push(
    `预测规模：${market.forecastYears.map((year, index) => `${year}E ${fmt(market.forecast[index])}`).join('、')}`,
  );
  lines.push('');
  lines.push(
    `需求结构：${market.demandMix.map((item) => `${item.label} ${item.share}%`).join('、')}`,
  );
  lines.push('');
  lines.push('需求驱动因素：');
  for (const driver of market.drivers) lines.push(`- ${driver}`);

  lines.push('');
  lines.push(`## 02 区域产业规模 ${tagOf('catalog', 'aiRegion')}`);
  lines.push('');
  lines.push(
    table(
      ['排名', '地区', '企业数', '产能', '产业规模（亿元）', '集聚度', '产业链完整度'],
      regions.regions.map((item, index) => [
        index + 1,
        item.province,
        item.companies,
        `${fmt(item.capacity)} ${item.capacityUnit}`,
        fmt(item.output),
        item.concentration,
        item.completeness,
      ]),
    ),
  );
  lines.push('');
  lines.push(regions.note);
  lines.push('');
  lines.push('主要产业集群：');
  for (const item of regions.regions.slice(0, 5)) {
    lines.push(`- ${item.province}：${item.clusters.join('、')}；区域风险：${item.risk}`);
  }

  lines.push('');
  lines.push(`## 03 产能与供需情况 ${tagOf('aiCapacity')}`);
  lines.push('');
  lines.push(
    table(
      ['指标', '数值'],
      [
        ['名义产能', `${fmt(capacity.nominal)} ${capacity.unit}`],
        ['有效产能', `${fmt(capacity.effective)} ${capacity.unit}`],
        ['实际产量', `${fmt(capacity.output)} ${capacity.unit}`],
        ['产能利用率', `${capacity.utilization}%`],
        ['需求量', `${fmt(capacity.demand)} ${capacity.unit}`],
        ['供需缺口', `${capacity.gap >= 0 ? '+' : ''}${fmt(capacity.gap)} ${capacity.unit}`],
        ['在建产能', `${fmt(capacity.underConstruction)} ${capacity.unit}`],
        ['规划产能', `${fmt(capacity.planned)} ${capacity.unit}`],
        ['退出产能', `${fmt(capacity.retired)} ${capacity.unit}`],
      ],
    ),
  );
  lines.push('');
  for (const item of capacity.judgement) lines.push(`- **${item.label}**：${item.value}`);
  lines.push('');
  lines.push(capacity.marketLink);

  lines.push('');
  lines.push(`## 04 产业发展亮点 ${tagOf('aiJudgement')}`);
  lines.push('');
  segment.highlights.forEach((item, index) => {
    lines.push(`### 亮点${index + 1}：${item.title}`);
    lines.push('');
    lines.push(`- **现象**：${item.phenomenon}`);
    lines.push(`- **原因**：${item.reason}`);
    lines.push(`- **产业影响**：${item.industry}`);
    lines.push(`- **企业影响**：${item.company}`);
    lines.push(`- **银行授信影响**：${item.credit}`);
    lines.push('');
  });

  lines.push(`## 05 技术发展特征 ${tagOf('aiTechnology')}`);
  lines.push('');
  lines.push(
    table(
      ['技术路线', '成熟度', '成本', '市占率', '增长潜力', '替代风险'],
      technology.routes.map((route) => [
        route.route,
        route.maturity,
        route.cost,
        `${route.share}%`,
        route.growth,
        route.risk,
      ]),
    ),
  );
  lines.push('');
  lines.push(`- 主流路线：${technology.mainstream}`);
  lines.push(`- 成长最快：${technology.fastestGrowing}`);
  lines.push(`- 替代风险路线：${technology.highestRisk}`);
  lines.push('');
  lines.push(technology.note);

  lines.push('');
  lines.push(`## 06 主要企业概况 ${tagOf('catalog', 'aiConcentration', 'creditScore')}`);
  lines.push('');
  lines.push(
    `上市企业 ${companies.count} 家，龙头层级 ${companies.leaderCount} 家，核心主业 ${companies.coreMainCount} 家；` +
      `CR3 ${companies.cr3}%、CR5 ${companies.cr5}%、CR10 ${companies.cr10}%，判断为「${companies.verdict}」。`,
  );
  lines.push('');
  lines.push(
    table(
      ['企业', '地区', '上市', '主营', '产能', '营收（亿元）', '市占率', '授信评分', '综合评价'],
      companies.list.map((row) => [
        row.short,
        row.province,
        row.listed ? '是' : '—',
        row.product,
        `${fmt(row.capacity)} ${row.capacityUnit}`,
        fmt(row.revenue),
        `${row.share}%`,
        row.score != null ? row.score : '待评价',
        row.verdict,
      ]),
    ),
  );
  lines.push('');
  lines.push(
    `集中度演变（CR5）：${companies.crYears.map((year, index) => `${year} 年 ${companies.cr5Series[index]}%`).join('、')}`,
  );
  lines.push('');
  lines.push(companies.verdictNote);

  lines.push('');
  lines.push(`## 07 产业发展趋势 ${tagOf('aiJudgement')}`);
  lines.push('');
  segment.trends.forEach((trend, index) => {
    lines.push(`### 趋势${index + 1}：${trend.title}`);
    lines.push('');
    lines.push(`- **趋势判断**：${trend.judgement}`);
    lines.push(`- **影响因素**：${trend.factors}`);
    lines.push(`- **时间窗口**：${trend.window}`);
    lines.push(`- **受益环节**：${trend.beneficiary}`);
    lines.push(`- **承压环节**：${trend.pressured}`);
    lines.push(`- **银行授信含义**：${trend.credit}`);
    lines.push('');
  });

  lines.push(`## 08 银行授信视角 ${tagOf('aiCredit')}`);
  lines.push('');
  lines.push(`**行业授信评级：${credit.rating}**`);
  lines.push('');
  lines.push(credit.ratingNote);
  lines.push('');
  lines.push('### 授信切入点');
  lines.push('');
  for (const item of credit.entries) lines.push(`- **${item.product}**：${item.note}`);
  lines.push('');
  lines.push('### 客户策略');
  lines.push('');
  lines.push(
    table(
      ['客户分层', '授信策略'],
      credit.strategy.map((item) => [item.tier, item.policy]),
    ),
  );
  lines.push('');
  lines.push('### 重点风险');
  lines.push('');
  lines.push(
    `风险标签：${segment.riskTags.map((tag) => `${tag.label}（${tag.level}）`).join('、')}`,
  );
  lines.push('');
  lines.push(`核心风控指标：${credit.coreRisks.join('、')}`);
  lines.push('');
  lines.push(`第一还款来源：${credit.firstRepayment}`);
  lines.push('');
  lines.push('授信条件与管理要求：');
  for (const item of credit.conditions) lines.push(`- ${item}`);
  lines.push('');
  lines.push(credit.exit);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    `本报告为 AI 辅助分析结果，不替代银行正式授信审批；行业景气度 ${overview.industryScore}/100，授信友好度 ${overview.creditFriendlyScore}/100。`,
  );
  lines.push('');

  // -------------------------------------------------------------- 附录：数据来源
  lines.push('## 附录：数据来源说明');
  lines.push('');
  lines.push(ANALYSIS_SOURCE_SUMMARY);
  lines.push('');
  lines.push('### 字段级来源对照');
  lines.push('');
  const sourceRows = [];
  for (const group of ANALYSIS_FIELD_SOURCES) {
    sourceRows.push([`**${group.group}**`, '', '']);
    for (const item of group.items) {
      const meta = ANALYSIS_SOURCE_META[item.source];
      sourceRows.push([item.field, meta.badge, sourceRowNote(meta)]);
    }
  }
  lines.push(table(['数据字段', '来源标注', '来源说明'], sourceRows));
  lines.push('');
  lines.push('### AI 估算项：如需准确数据，可对接以下数据源');
  lines.push('');
  for (const meta of Object.values(ANALYSIS_SOURCE_META)) {
    if (meta.kind !== 'ai') continue;
    lines.push(`**${meta.scope}（${meta.badge}）**`);
    lines.push('');
    lines.push(meta.detail);
    lines.push('');
    for (const db of meta.databases) lines.push(`- ${db}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function downloadMarkdown(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
