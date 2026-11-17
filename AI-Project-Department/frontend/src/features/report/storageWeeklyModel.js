// 储能产业链周报模型（纯函数，可被 node --test 直接 import，不依赖 React）。
//
// 数据源：public/data/industries/storage-chain.json —— 储能链真实入链数据：
//   2026-10 全量口径：7 个一级环节 / 24 个二级环节 / 2,457 家在链（376 家上市）/ 2,966 条企业关系 /
//   1740 家非上市客户池 / 94 家链外点名主体 / 梯队分布 / 上市板块与申万行业 / 结构缺口告警。
//
// 本模块只做派生统计与话术组装：不请求任何外部资讯服务，同输入同输出，可复现、可单测。
// 其他行业不经过本模块（见 WeeklyReportPage 的通用兼容分支）。

import { chainPaletteFor } from '../../chainPalette.js';

export const STORAGE_ACCENT = '#0b6e8a';

// 主色按产业链取：储能沿用原深青，算力用其调色板主色（砖红），避免两个行业视觉混淆。
const ACCENT_BY_INDUSTRY = {
  储能产业: STORAGE_ACCENT,
  算力产业: '#a1381f',
};

// 梯队口径（与 storage-chain.json 的 tier / tierLabel 对应）：龙头 → 骨干 → 长尾，由深到浅。
export const TIER_META = [
  { key: 'leader', label: '龙头', color: '#0b6e8a' },
  { key: 'core', label: '骨干', color: '#5aa9a0' },
  { key: 'tail', label: '长尾', color: '#cbd8e2' },
];

// 分词噪声：出现在「产品 / 证据」字段里但不构成技术或产品信号的通用词。
const TOKEN_STOPWORDS = new Set([
  '业务',
  '板块',
  '年报',
  '半年报',
  '公告',
  '摘要',
  '官网',
  '天眼查',
  '企查查',
  '项目',
  '领域',
  '产业',
  '服务',
  '相关',
  '其他',
  '行业',
  '公司',
  '有限公司',
  '股份',
  '以及',
  '主要',
  '包括',
  '储能',
  '电源',
]);

const TOKEN_SPLIT = /[、，,；;/·|＋+]/;

const normalizeText = (value) => String(value ?? '').trim();

export function shorten(value, max = 22) {
  const text = normalizeText(value) || '待补充';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sortEntries(counts, limit) {
  const entries = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN'),
  );
  const sliced = Number.isFinite(limit) ? entries.slice(0, limit) : entries;
  return sliced.map(([label, count]) => ({ label, count }));
}

function splitTokens(value) {
  return normalizeText(value)
    .split(TOKEN_SPLIT)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 12 && !TOKEN_STOPWORDS.has(token));
}

/** 技术 / 产品词频：只统计 products 字段，同一家企业内的重复词只计一次。 */
export function productTokenFrequency(companies, limit = Infinity) {
  const counts = new Map();
  (companies || []).forEach((company) => {
    new Set(splitTokens(company?.products)).forEach((token) =>
      counts.set(token, (counts.get(token) || 0) + 1),
    );
  });
  return sortEntries(counts, limit);
}

/** 梯队汇总：龙头 / 骨干 / 长尾。 */
export function tierTotals(companies) {
  const totals = { leader: 0, core: 0, tail: 0 };
  (companies || []).forEach((company) => {
    if (totals[company?.tier] != null) totals[company.tier] += 1;
  });
  return totals;
}

/** 上市板块分布。 */
export function boardDistribution(companies) {
  const counts = new Map();
  (companies || []).forEach((company) => {
    const board = normalizeText(company?.board);
    if (board) counts.set(board, (counts.get(board) || 0) + 1);
  });
  return sortEntries(counts);
}

/** 申万行业分布。 */
export function swSectorDistribution(companies, limit = Infinity) {
  const counts = new Map();
  (companies || []).forEach((company) => {
    const sector = normalizeText(company?.swSector);
    if (sector) counts.set(sector, (counts.get(sector) || 0) + 1);
  });
  return sortEntries(counts, limit);
}

/** 属地（省级）分布：全量入链后属地落在 region 字段，旧链数据回落 territory。 */
export function regionDistribution(companies, limit = Infinity) {
  const counts = new Map();
  (companies || []).forEach((company) => {
    const province =
      normalizeText(company?.region?.province) || normalizeText(company?.territory?.province);
    if (province && province !== '—') counts.set(province, (counts.get(province) || 0) + 1);
  });
  return sortEntries(counts, limit);
}

/**
 * 按一级环节统计关系数：一条关系只要有一端落在该环节即计入（同一环节只计一次）。
 * 注意 storage-chain.json 的关系两端用的是 fullName，企业清单里用 name，需按 fullName 建索引。
 */
export function relationCountByLevel(levels, companies, relations) {
  const byFullName = new Map();
  (companies || []).forEach((company) => {
    if (company?.fullName) byFullName.set(company.fullName, company);
    if (company?.name) byFullName.set(company.name, company);
  });
  const counts = new Map((levels || []).map((level) => [level.label, 0]));
  (relations || []).forEach((relation) => {
    const from = byFullName.get(relation?.from);
    const to = byFullName.get(relation?.to);
    const labels = new Set([...(from?.level1 || []), ...(to?.level1 || [])]);
    labels.forEach((label) => {
      if (counts.has(label)) counts.set(label, counts.get(label) + 1);
    });
  });
  return counts;
}

/**
 * 指定一级环节集合内的去重企业数。
 * 全量入链后企业可有多环节归属行（level1 数组），但产业链地图的 companyCount
 * 按主归属（level1[0]）统计，这里保持同一口径，避免周报与地图数字打架。
 */
export function uniqueCompanyCount(companies, levelLabels) {
  const target = new Set(levelLabels);
  return (companies || []).filter((company) => target.has((company?.level1 || [])[0])).length;
}

/** 二级环节（24 个）企业数分布。 */
export function childNodeDistribution(levels, limit = Infinity) {
  const rows = [];
  (levels || []).forEach((level) => {
    (level?.children || []).forEach((child) => {
      rows.push({
        label: child.label,
        count: child.companyCount || 0,
        level1: level.label,
        leaderCount: child.leaderCount || 0,
        note: child.note || '',
      });
    });
  });
  rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
  return Number.isFinite(limit) ? rows.slice(0, limit) : rows;
}

function completenessScore(company) {
  const values = Object.values(company?.profile?.completeness || {});
  return values.filter((value) => value === '完整').length;
}

/** 把存储里的企业记录整理成卡片/列表需要的展示结构（供周报任意位置复用）。 */
export function describeCompany(company) {
  return {
    id: company?.code || company?.name,
    name: company?.name || '',
    code: company?.code || '',
    board: company?.board || '',
    tier: company?.tier || '',
    tierLabel: company?.tierLabel || '未分层',
    level1: (company?.level1 || []).join(' · ') || '环节待补',
    level2: (company?.level2 || []).join(' · ') || '二级环节待补',
    region:
      [
        company?.region?.province || company?.territory?.province,
        company?.region?.city || company?.territory?.city,
      ]
        .map(normalizeText)
        .filter(Boolean)
        .join(' · ') || '属地待补',
    highlight: shorten(company?.products || company?.evidence, 46),
    relationCount: company?.relationCount || 0,
    completeness: completenessScore(company),
  };
}

/** 观察名单：画像完整度优先，其次关系数，最后按名称稳定排序。 */
export function pickFocusCompanies(companies, limit = 5) {
  return [...(companies || [])]
    .sort(
      (a, b) =>
        completenessScore(b) - completenessScore(a) ||
        (b?.relationCount || 0) - (a?.relationCount || 0) ||
        String(a?.name).localeCompare(String(b?.name), 'zh-CN'),
    )
    .slice(0, limit)
    .map(describeCompany);
}

/**
 * 非上市客户池的构成明细：全量入链后按 otherByKeyStatus 的信用代码核验状态取值，
 * 兼容旧口径 otherByVerify。
 */
export function customerPoolBreakdown(customerStats) {
  const rows = customerStats?.otherByKeyStatus || customerStats?.otherByVerify || [];
  const valueOf = (label) => rows.find((row) => row.k === label)?.v ?? 0;
  return {
    verified: valueOf('已核验信用代码') || valueOf('已入链'),
    pending: valueOf('缺码（名称占位）') || valueOf('已落入') + valueOf('已落入(修正)'),
  };
}

/** 二级环节缺口：warnings.nodesWithoutHeads 形如「核心装备 / 氢储能装备」。 */
export function headGapNodes(chain) {
  return (chain?.warnings?.nodesWithoutHeads || []).map((nodeKey) => {
    const [level1, level2] = String(nodeKey).split(' / ');
    return { key: nodeKey, level1: level1 || nodeKey, level2: level2 || '' };
  });
}

/**
 * 组装产业链周报模型（链驱动，储能 / 算力共用同一套推导口径）。
 * @param {object} chain storage-chain.json 或 compute-chain.json 的解析结果
 * @param {string} weekRange 周区间文案（由页面传入，便于测试固定）
 * @param {string} industry 产业链名（缺省取链数据自带的 industry）
 */
export function buildStorageWeeklyModel(chain, weekRange = '', industry = '') {
  const companies = Array.isArray(chain?.companies) ? chain.companies : [];
  const relations = Array.isArray(chain?.relations) ? chain.relations : [];
  const levels = Array.isArray(chain?.levels) ? chain.levels : [];
  if (!companies.length || !levels.length) return null;

  const industryLabel = chain?.industry || industry || '储能产业';
  const industryShort = industryLabel.replace(/产业$/, '');
  const accent = ACCENT_BY_INDUSTRY[industryLabel] || STORAGE_ACCENT;
  // 上市口径判定：集成电路链（ic-chain.json）带 listStatus（上市 / 非上市）；
  // 算力链的 companies 含非上市企业（3475 = 452 上市 + 3023 非上市），按 companyType 统计，
  // 上市公司子公司不计入上市家数（证券代码是母公司的）；
  // 储能链的 companies 没有 companyType 字段，用股票代码（code / stockCode）判定上市。
  // 注意储能 / 算力链也有 listStatus 字段，但取值是「in-list」（清单内标记），不是上市口径。
  const isListedRow = (item) => {
    if (item.listStatus === '上市' || item.listStatus === '非上市') {
      return item.listStatus === '上市';
    }
    if (item.companyType) return item.companyType === 'listed';
    return Boolean(item.code || item.stockCode);
  };
  const listedCount = companies.filter(isListedRow).length;
  const listedTotal = listedCount || companies.length;
  // 上市板块 / 申万行业是上市企业口径：全量入链后仅对上市行统计，
  // 非上市主体个别带出的板块字段（母公司板块）不参与分布。
  const listedRows = companies.filter(isListedRow);
  // 非上市口径：算力/储能链的 companies 都带非上市在链企业，直接相减；
  // 客户池（customerStats.other）仅存放清单外主体。
  const nonListedInChain = companies.length - listedCount;
  const palette = new Map(
    chainPaletteFor(industryLabel).map((group) => [group.label, group.color]),
  );
  const positions = Array.isArray(chain.positions) ? chain.positions : [];
  const positionOf = (id) => positions.find((item) => item.id === id) || null;
  const upstream = positionOf('上游');
  const midstream = positionOf('中游');
  const downstream = positionOf('下游');

  const level2Total = levels.reduce((sum, level) => sum + (level.childCount || 0), 0);
  const customerStats = chain.customerStats || {};
  const otherTotal = customerStats.other || (chain.otherCustomers || []).length;
  // 周报只讲在链企业：非上市在链主体直接相减（储能 2,081 家 / 算力 1,426 家）。
  const poolTotal = nonListedInChain || otherTotal;
  const poolLabel = nonListedInChain ? '非上市在链' : '非上市客户池';
  const externalTotal = chain.stats?.externalMentions || (chain.externalMentions || []).length;
  const relCounts = relationCountByLevel(levels, companies, relations);
  const tiers = tierTotals(companies);
  const regionTop = regionDistribution(companies, 5);
  const headGaps = headGapNodes(chain);

  // 中游两个环节（电池与核心部件 / 系统集成与工程建设）是链内密度最高的一段，
  // 但其 companyCount 相加会重复计入跨环节企业，所以统一用去重口径。
  const midLevels = levels.filter((level) => level.position === '中游').map((level) => level.label);
  const midUnique = midLevels.length
    ? uniqueCompanyCount(companies, midLevels)
    : midstream?.companyCount || 0;
  const midShare = companies.length ? Math.round((midUnique / companies.length) * 100) : 0;

  const densest = [...levels].sort((a, b) => (b.companyCount || 0) - (a.companyCount || 0));
  const leaderRank = [...levels].sort((a, b) => (b.leaderCount || 0) - (a.leaderCount || 0));
  const tailRank = [...levels].sort((a, b) => (b.tailCount || 0) - (a.tailCount || 0));
  const topSector = densest[0];

  const scanRows = densest.map((level) => ({
    id: level.code || level.label,
    code: level.code || '',
    label: level.label,
    position: level.position || '',
    note: level.note || '',
    color: palette.get(level.label) || STORAGE_ACCENT,
    childCount: level.childCount || 0,
    companyCount: level.companyCount || 0,
    // 同一企业可归属同一环节下的多个二级环节，所以环节内「归属行数」≥「去重企业数」。
    // 梯队堆叠条按归属行数归一（与 leader+core+tail 同口径），企业数按去重口径展示。
    companyRowCount: level.companyRowCount || level.companyCount || 0,
    leader: level.leaderCount || 0,
    core: level.coreCount || 0,
    tail: level.tailCount || 0,
    relationCount: relCounts.get(level.label) || 0,
    topChild:
      (level.children || [])
        .map((child) => ({ label: child.label, count: child.companyCount || 0 }))
        .sort((a, b) => b.count - a.count)[0] || null,
  }));

  const externalRank = [...(chain.externalMentions || [])].sort((a, b) => b.count - a.count);
  const pool = customerPoolBreakdown(customerStats);
  // 链外主体的上下游归属以 stats 为准：externalMentions 里同一条主体可能同时被两个角色点名，
  // 逐条累加会重复计数。
  const externalUpstream = chain.stats?.externalUpstream ?? 0;
  const externalDownstream = chain.stats?.externalDownstream ?? 0;

  const insights = [
    {
      label: '链结构',
      tone: 'blue',
      title: `上游 ${upstream?.companyCount ?? '—'} 家、中游 ${midstream?.companyCount ?? '—'} 家、下游 ${downstream?.companyCount ?? '—'} 家，中游密度最高`,
      body: (() => {
        const labelsOf = (position) =>
          levels.filter((level) => level.position === position).map((level) => level.label);
        const describe = (position) => {
          const labels = labelsOf(position);
          return labels.length ? `${labels.join('、')} ${labels.length} 条链` : '待补充';
        };
        return `上游覆盖${describe('上游')}；中游为${describe('中游')}；下游为${describe('下游')}。跨环节经营的企业会在多个环节重复出现，统计时按去重与按环节两种口径分别标注。`;
      })(),
      metric: `中游 ${midstream?.companyCount ?? '—'} 家`,
    },
    {
      label: '梯队结构',
      tone: 'orange',
      title: `${tiers.leader} 家龙头 + ${tiers.core} 家骨干 + ${tiers.tail} 家长尾构成链内梯队`,
      body: `龙头最集中在「${leaderRank[0]?.label || '—'}」（${leaderRank[0]?.leaderCount || 0} 家）与「${leaderRank[1]?.label || '—'}」（${leaderRank[1]?.leaderCount || 0} 家）；长尾企业主要落在「${tailRank[0]?.label || '—'}」（${tailRank[0]?.tailCount || 0} 家），适合作为观察与培育对象。`,
      metric: `龙头 ${tiers.leader} 家`,
    },
    {
      label: '覆盖缺口',
      tone: 'teal',
      title: headGaps.length
        ? `${headGaps.length} 个二级环节尚无龙头，链条存在结构性空档`
        : '各二级环节均已出现龙头，链条结构相对完整',
      body: headGaps.length
        ? `缺口环节为${headGaps
            .slice(0, 3)
            .map((gap) => `「${gap.level2}」`)
            .join(
              '、',
            )}等；这些环节目前以骨干与长尾企业为主，适合优先走访核实，并从中筛选可培育的核心客户。`
        : '后续可转向观察各环节内部竞争格局与份额变化。',
      metric: headGaps.length ? `${headGaps.length} 个环节` : '无缺口',
    },
  ];

  return {
    accent,
    weekRange,
    masthead: {
      industry: industryLabel,
      subtitle: `${weekRange ? `${weekRange} · ` : ''}${levels.length} 大一级环节 / ${level2Total} 个二级环节的链上观察`,
      stats: [
        { key: 'listed', label: '上市企业', value: listedTotal, unit: '家' },
        { key: 'level2', label: '二级环节', value: level2Total, unit: '个' },
        { key: 'relations', label: '企业关系', value: relations.length, unit: '条' },
        { key: 'pool', label: poolLabel, value: poolTotal, unit: '家' },
        { key: 'external', label: '链外点名主体', value: externalTotal, unit: '家' },
      ],
    },
    readout: {
      headline: `${industryShort}链 ${listedTotal} 家上市样本中，中游${
        midLevels.length > 2
          ? ` ${midLevels.length} 个环节`
          : midLevels.length > 1
            ? '两个环节'
            : '环节'
      }${midLevels.map((label) => `「${label}」`).join('、')}集中了 ${midUnique} 家企业（占 ${midShare}%），是本周最值得优先下钻的观察入口。`,
      lead: `本周报以${industryLabel}真实入链数据为准：${levels.length} 个一级环节、${level2Total} 个二级环节、${listedTotal} 家上市企业${
        nonListedInChain ? `、${nonListedInChain} 家非上市在链企业` : ''
      }、${relations.length} 条企业关系，另附 ${externalTotal} 家链外点名主体，用于快速定位链上入口、梯队位置与待补缺口。`,
      insights,
    },
    watch: pickFocusCompanies(companies, 5),
    scan: {
      rows: scanRows,
      maxCompanyCount: Math.max(1, ...scanRows.map((row) => row.companyCount)),
      level2Total,
      topSector,
      regionTop,
    },
    signals: {
      accent,
      productTokens: productTokenFrequency(companies, 10),
      childNodes: childNodeDistribution(levels, 8),
      childNodeTotal: level2Total,
      boards: boardDistribution(listedRows),
      swSectors: swSectorDistribution(listedRows, 6),
      regions: regionTop,
    },
    moves: [
      {
        index: '01',
        label: '待补龙头环节',
        title: headGaps.length ? `${headGaps.length} 个二级环节尚无龙头` : '各环节均已出现龙头',
        note: headGaps.length
          ? `${headGaps
              .slice(0, 4)
              .map((gap) => gap.level2)
              .join(
                '、',
              )}${headGaps.length > 4 ? ' 等' : ''}；以骨干与长尾企业为主，优先走访核实后可筛选出可培育客户。`
          : '可转向观察环节内部的份额与竞争格局变化。',
      },
      {
        index: '02',
        label: poolLabel,
        title: nonListedInChain
          ? `${poolTotal} 家在链非上市${industryShort}企业已纳入观察`
          : `${otherTotal} 家非上市${industryShort}企业待纳入观察`,
        note: nonListedInChain
          ? `均为已归入环节的非上市主体（上市 ${listedTotal} 家另计）；图谱只画上市样本，这批企业在「全部企业」范围、地图与授信评价中可直接查看。`
          : `清单来自 CNESA / CIAPS（已入链 ${pool.linked} 家、已落入 ${pool.located} 家）；图谱与周报统计只以上市样本为准，这批企业只在「全部企业」范围与地图上出现。`,
      },
      {
        index: '03',
        label: '链外点名主体',
        title: `${externalTotal} 家被链内企业点名但尚未入链`,
        note: `其中下游 ${externalDownstream} 家、上游 ${externalUpstream} 家；${
          externalRank.length
            ? `被点名最多的是${externalRank
                .slice(0, 2)
                .map((item) => `「${item.name}」（${item.count} 家提及）`)
                .join('、')}，`
            : ''
        }仅出现在「前五大客户 / 供应商」披露中，需核实后决定是否补入链条。`,
      },
    ],
    footer: {
      scope: `周报口径：行业舆情（公开资讯源抓取）+ ${industryLabel}入链数据（${levels.length} 个一级环节 / ${level2Total} 个二级环节 / ${listedTotal} 家上市企业）。`,
      note: '舆情由 scripts/prepare-storage-sentiment.mjs 抓取生成，可执行 pnpm prepare:sentiment 刷新 · 链上结构取本地入链数据',
    },
  };
}
