// 链知智答：基于当前产业链数据 + 平台方法论回答问题的轻量问答引擎。
// 纯函数，无副作用，便于单测；上下文来自 useAppData 的 data（counts / companies）。
//
// 返回结构：{ text, bullets?: string[], note?: string, action?: { label, tab } }
// - action 用于把问题引导到平台内已有页面（政策 / 授信 / 周报 / 图谱等）。

const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');

const pct = (part, total) => {
  if (!total) return '0%';
  const ratio = (Number(part || 0) / Number(total)) * 100;
  return `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}%`;
};

const isListed = (company) =>
  (company?.tags || []).includes('上市企业') || company?.companyType === 'listed';

export const SUGGESTIONS = [
  '这条链现在有多少家企业？',
  '头部、腰部、尾部是怎么分的？',
  '哪个环节企业最多？',
  '储能产业链是怎么一步步建起来的？',
];

const METHOD_STEPS = [
  '① 拆解环节骨架：按上中下游切一级环节，再细化二级环节，口径对齐研报与协会名单。',
  '② 多来源采集：权威名单优先，再用招投标、资本市场披露、工商关键词四类渠道补齐。',
  '③ 去重与主体对齐：以统一社会信用代码唯一登记，别名、简称、曾用名归并到同一主体。',
  '④ 环节归属：按主营业务进入唯一主环节，跨环节企业保留多标签。',
  '⑤ 头腰尾打标：用简单规则加硬门槛分层，不做复杂评分。',
  '⑥ 形成图谱：环节、分层、供应与股权关系一屏可查，并落到地理版图上逐级下钻。',
];

function findCompany(question, companies) {
  const list = companies || [];
  const direct = list.find((company) => company.name && question.includes(company.name));
  if (direct) return direct;

  const byAlias = list.filter((company) =>
    (company.aliases || []).some((alias) => alias && alias.length >= 3 && question.includes(alias)),
  );
  if (byAlias.length === 1) return byAlias[0];

  const trimmed = question
    .replace(/[？?。！!，,、；;：:\s]/g, '')
    .replace(
      /(请问|帮我|帮忙|查一下|查查|看一下|介绍|这家|这个|公司|企业|是|在|哪|哪个|什么|属于|的)/g,
      '',
    );
  if (trimmed.length >= 4) {
    const fuzzy = list.filter((company) => company.name.includes(trimmed));
    if (fuzzy.length === 1) return fuzzy[0];
  }
  return null;
}

function companyAnswer(company, industry) {
  const region = company.region || {};
  const place = [region.province, region.city, region.district].filter(Boolean).join(' · ');
  const bullets = [
    `环节归属：${company.chain || '—'}${company.sector ? ` / ${company.sector}` : ''}`,
    `企业属性：${isListed(company) ? '上市企业' : '非上市企业'}`,
  ];
  if (place) bullets.push(`所在地：${place}`);
  if (company.products) bullets.push(`主营产品：${company.products}`);

  return {
    text: `${company.name} 在当前「${industry}」链中的位置如下：`,
    bullets,
    note: '企业画像来自入库档案，产品与财务口径建议再核对原始披露。',
    action: { label: '在图谱中查看该环节', tab: 'fishbone' },
  };
}

function tierAnswer(counts) {
  const tiers = counts?.headTiers || {};
  const total = (tiers['龙头'] || 0) + (tiers['骨干'] || 0) + (tiers['长尾'] || 0);
  return {
    text: `当前分层打标结果：头部（龙头）${fmt(tiers['龙头'])} 家、腰部（骨干）${fmt(
      tiers['骨干'],
    )} 家、尾部（长尾）${fmt(tiers['长尾'])} 家，合计 ${fmt(total)} 家。`,
    bullets: [
      '头部：满足任意一条即可——行业排名靠前、上市公司、龙头企业、国家级名单企业、收入规模较大、有大量项目案例。',
      '腰部：有稳定业务、有一定市场份额、区域知名企业、有项目经验。',
      '尾部：小规模、初创、业务不明确，或仅具备相关经营范围。',
      '另外设了硬门槛，避免「大而不强」被误判进头部。',
    ],
    note: `口径说明：分层目前先覆盖上市企业（${fmt(total)} 家），非上市企业会随数据接入逐步补齐；环节归属则是全量企业已完成。`,
  };
}

function chainDistributionAnswer(counts, industry) {
  const distribution = counts?.classification?.secondary || {};
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const total = counts?.totalCompanies || 0;
  const level1Count = entries.length;
  return {
    text: `「${industry}」当前按 ${level1Count} 个一级环节组织，企业分布如下：`,
    bullets: entries.map(([name, value]) => `${name}：${fmt(value)} 家（占 ${pct(value, total)}）`),
    note: `企业总数 ${fmt(total)} 家，环节归属按主营业务唯一主环节统计，跨环节企业不重复计数。`,
    action: { label: '打开产业链图谱', tab: 'fishbone' },
  };
}

function sizeAnswer(counts, industry) {
  const total = counts?.totalCompanies || 0;
  const listed = counts?.listed || 0;
  return {
    text: `当前「${industry}」链共入库 ${fmt(total)} 家企业，其中上市企业 ${fmt(
      listed,
    )} 家（占 ${pct(listed, total)}），非上市 ${fmt(counts?.nonListed || total - listed)} 家。`,
    bullets: [
      `一级环节 ${Object.keys(counts?.classification?.secondary || {}).length} 个，二级环节 24 个（储能口径）。`,
      `链上已梳理链内企业关系 ${fmt(counts?.relationCount || 0)} 条（含非上市主体之间的交易与股权关系）。`,
      '企业以统一社会信用代码唯一登记，名单之外的重复主体已做归并。',
    ],
    note: '数字会随数据更新变化，页面右上角数据摘要与这里保持同一口径。',
    action: { label: '查看环节骨架', tab: 'flow' },
  };
}

function relationAnswer(counts) {
  const types = counts?.relationTypes || {};
  const entries = Object.entries(types).filter(([, value]) => Number(value) > 0);
  return {
    text: `链上目前梳理 ${fmt(counts?.relationCount || 0)} 条链内企业关系，按类型拆分：`,
    bullets: entries.map(([name, value]) => `${name}关系：${fmt(value)} 条`),
    note: '关系来自公开披露（公告、招股书、招投标）与股权穿透，未披露的环节如实留白，不做推断补全。',
    action: { label: '在地图中查看关系', tab: 'map' },
  };
}

function methodAnswer(industry) {
  return {
    text: `「${industry}」链是按六步法建起来的：`,
    bullets: METHOD_STEPS,
    note: '同一套方法论换到算力这类新兴产业也适用，差异主要在数据源与环节命名。',
    action: { label: '打开建链流程', tab: 'flow' },
  };
}

function navigateAnswer(tab, text, note, label) {
  return { text, bullets: [], note, action: { label, tab } };
}

/**
 * @param {string} question 用户问题
 * @param {{ industry: string, counts: object, companies: object[] }} context
 */
export function answerQuestion(question, context = {}) {
  const q = String(question || '').trim();
  const industry = context.industry || '当前产业';
  const counts = context.counts || {};
  const companies = context.companies || [];

  if (!q) {
    return { text: '您可以问我这条链的企业规模、环节分布、分层口径，或者某个企业的归属。' };
  }

  const has = (...words) => words.some((word) => q.includes(word));

  // 1) 指名企业
  const company = findCompany(q, companies);
  if (company) return companyAnswer(company, industry);

  // 2) 分层口径
  if (has('头部', '腰部', '尾部', '分层', '打标', '龙头', '骨干', '长尾', '层级')) {
    return tierAnswer(counts);
  }

  // 3) 建链方法
  if (has('怎么建', '如何建', '建链', '六步', '方法论', '流程', '怎么来', '步骤', '骨架')) {
    return methodAnswer(industry);
  }

  // 4) 环节分布
  if (has('环节', '分布', '结构', '上游', '中游', '下游', '哪一环', '哪个环节')) {
    return chainDistributionAnswer(counts, industry);
  }

  // 5) 关系 / 供应链
  if (has('关系', '供应', '股权', '供应商', '客户', '上下游企业')) {
    return relationAnswer(counts);
  }

  // 6) 上市
  if (has('上市', '股票', 'IPO', '新三板')) {
    const listed = counts?.listed || 0;
    const total = counts?.totalCompanies || 0;
    return {
      text: `当前「${industry}」链有 ${fmt(listed)} 家上市企业，占全部 ${fmt(total)} 家的 ${pct(
        listed,
        total,
      )}。`,
      bullets: [
        '上市企业是关系披露最完整的一层，供应链与股权关系优先从这里梳理。',
        '非上市企业信息相对稀缺，属地和主营需要跨多个来源反复核实。',
      ],
      note: '上市标记与股票代码来自公开披露，未上市不等于规模小，需结合分层标签一起看。',
      action: { label: '打开授信视图', tab: 'credit' },
    };
  }

  // 7) 数量 / 规模
  if (has('多少家', '几家', '总数', '规模', '多少企业', '家数', '覆盖')) {
    return sizeAnswer(counts, industry);
  }

  // 8) 平台其他模块
  if (has('政策', '补贴', '文件', '规划')) {
    return navigateAnswer(
      'policy',
      `政策解读会按「${industry}」集合展示国家、省、地市、园区四级政策，并给出对企业的影响判断。`,
      '政策库支持导入本地文件，示例政策仅用于演示口径。',
      '打开政策解读',
    );
  }
  if (has('授信', '评分', '额度', '风险')) {
    return navigateAnswer(
      'credit',
      '授信视图把评分直接长在链上：企业总数、已评价数量、综合均分随链数据自动更新。',
      '评分规则可按行业调整，贷后监测与链上舆情联动。',
      '打开授信视图',
    );
  }
  if (has('周报', '报告', '月度', '周度')) {
    return navigateAnswer(
      'report',
      '产业链周报每周自动成稿：链结构变化、头部动向、拓客线索一页讲清。',
      '周报口径与图谱、授信共用同一份数据，不单独维护。',
      '打开产业链周报',
    );
  }
  if (has('地图', '区域', '省份', '分布在哪', '地理')) {
    return navigateAnswer(
      'map',
      `「${industry}」企业已落到地理版图，可按省、市、区逐级下钻查看产业集聚。`,
      '坐标精度为区域参考级，用于分布判断，不用于精确选址。',
      '打开产业地图',
    );
  }

  // 9) 兜底
  return {
    text: `这个问题我暂时没有把握。我目前主要基于「${industry}」链内数据回答：企业规模与结构、环节分布、头部/腰部/尾部口径、链上关系、建链方法论，以及政策、授信、周报等场景入口。`,
    bullets: [
      '换个问法，比如「哪个环节企业最多」「头部企业有多少家」。',
      '或者直接说企业全名，我帮您定位它属于哪个环节。',
    ],
    note: '涉及未入库企业或最新财报，建议以原始来源为准。',
  };
}
