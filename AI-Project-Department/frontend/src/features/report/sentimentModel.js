// 储能行业舆情模型（纯函数，可被 node --test 直接 import）。
//
// 职责：把「从公开资讯源抓到的原始条目」规范化、过滤、分类、情绪打分、环节打标，
// 并聚合成「本周研判」模块所需的研判数据（情绪分布 / 主题热度 / 重点舆情 /
// 政策要点 / 价格观察 / 出海动态 / 风险提示 / 涉及链上企业）。
//
// 同一份文件同时被抓取脚本（scripts/prepare-storage-sentiment.mjs）与页面消费，
// 保证「入库口径」与「展示口径」完全一致；纯函数、无副作用、不联网。

import { chainPaletteFor } from '../../chainPalette.js';

// ---------------------------------------------------------------- 分类体系

/**
 * 舆情一级分类。tone 与 report.css 的要点色系对应。
 * 同一条资讯可能命中多个分类的词典，取命中权重最高者为主分类。
 */
export const CATEGORY_META = [
  { key: 'safety', label: '安全风险', tone: 'red', hint: '事故、起火、污染、整改、处罚' },
  { key: 'policy', label: '政策机制', tone: 'blue', hint: '规划、电价机制、并网规则、标准监管' },
  { key: 'capital', label: '资本运作', tone: 'orange', hint: '融资、并购、合资、扩产投资' },
  { key: 'bidding', label: '招投标', tone: 'teal', hint: '招标、中标、集采、框架采购' },
  { key: 'price', label: '价格成本', tone: 'orange', hint: '系统/EPC 单价、原材料价格、成本' },
  {
    key: 'overseas',
    label: '出海海外',
    tone: 'purple',
    hint: '出口、海外订单、海外建厂、贸易壁垒',
  },
  { key: 'tech', label: '技术产品', tone: 'blue', hint: '电芯容量、技术路线、新品与量产' },
  { key: 'capacity', label: '产能项目', tone: 'green', hint: '开工、并网、投运、基地与产线' },
  { key: 'company', label: '企业动态', tone: 'gray', hint: '企业层面经营与合作动态' },
];

export const CATEGORY_KEYS = CATEGORY_META.map((item) => item.key);

const CATEGORY_OF = new Map(CATEGORY_META.map((item) => [item.key, item]));

export function categoryMeta(key) {
  return CATEGORY_OF.get(key) || CATEGORY_OF.get('company');
}

// 词典权重：数值越大越能代表该分类，用于多分类命中时择优。
const CATEGORY_LEXICON = {
  safety: [
    ['起火', 3],
    ['火灾', 3],
    ['爆炸', 3],
    ['事故', 2],
    ['热失控', 3],
    ['污染', 3],
    ['泄漏', 2],
    ['召回', 3],
    ['伤亡', 3],
    ['停运', 2],
    ['停产', 2],
    ['违规', 2],
    ['处罚', 2],
    ['约谈', 2],
    ['隐患', 2],
    ['风险预警', 2],
    ['强制停', 3],
    ['阴燃', 3],
    ['受限', 1],
    ['延期', 2],
    ['纠纷', 2],
    ['诉讼', 2],
    ['储能安全', 3],
    ['安全标准', 3],
    ['质量监督', 2],
    ['事故隐患', 3],
    ['安全', 1],
  ],
  policy: [
    ['容量电价', 4],
    ['十五五', 3],
    ['政策', 3],
    ['规划', 3],
    ['征求意见', 3],
    ['印发', 2],
    ['机制电价', 3],
    // 「并网」单用多指项目动作（成功并网），政策语境通常伴随「规则 / 主体 / 管理」，
    // 因此这里只给 1 分，避免把项目并网新闻抢成政策类。
    ['并网', 1],
    ['实施细则', 3],
    ['细则', 2],
    ['管理办法', 2],
    ['标准体系', 3],
    ['国家标准', 3],
    ['出台', 2],
    ['通知', 2],
    ['补贴', 2],
    ['清单', 2],
    ['监管', 2],
    ['质监', 2],
    ['考核', 2],
    ['发改委', 3],
    ['能源局', 3],
    ['工信部', 3],
    ['备案', 1],
    ['自主定价', 2],
    ['现货市场', 2],
    ['辅助服务', 2],
    ['市场化', 2],
  ],
  capital: [
    ['融资', 3],
    ['募资', 3],
    ['IPO', 3],
    ['上市', 2],
    ['并购', 3],
    ['收购', 3],
    ['重组', 2],
    ['定增', 3],
    ['投资协议', 3],
    ['合资', 3],
    ['战略投资', 3],
    ['估值', 3],
    ['退市', 3],
    ['股东', 2],
    ['股权', 2],
    ['拟投资', 3],
    ['总投资', 2],
    ['增资', 3],
    ['亿元', 1],
    ['银行贷款', 2],
    ['产业基金', 2],
  ],
  bidding: [
    ['招标', 3],
    ['中标', 3],
    ['集采', 3],
    ['候选人', 3],
    ['公示', 2],
    ['框架采购', 3],
    ['开标', 3],
    ['标段', 2],
    ['采购项目', 2],
    ['总承包', 2],
    ['投标', 3],
    ['流标', 2],
  ],
  price: [
    ['元/wh', 4],
    ['元/千瓦', 3],
    ['价格走势', 4],
    ['均价', 3],
    ['报价', 3],
    ['单价', 3],
    ['碳酸锂', 3],
    ['成本', 2],
    ['限价', 3],
    ['降价', 2],
    ['涨价', 2],
    ['价差', 2],
    ['价格', 2],
    ['消费税', 2],
  ],
  overseas: [
    ['出海', 4],
    ['出口', 3],
    ['海外', 3],
    ['欧洲', 2],
    ['东南亚', 2],
    ['中东', 2],
    ['澳洲', 2],
    ['美洲', 2],
    ['非洲', 2],
    ['德国', 2],
    ['波兰', 2],
    ['西班牙', 2],
    ['摩洛哥', 2],
    ['美国', 2],
    ['关税', 3],
    ['贸易壁垒', 3],
    ['feoc', 3],
    ['ul 9540', 3],
    ['全球', 2],
    ['国际', 2],
    ['长协', 3],
    ['供货框架', 3],
    ['海外订单', 4],
  ],
  tech: [
    ['587ah', 3],
    ['588ah', 3],
    ['314ah', 2],
    ['电芯', 2],
    ['固态', 3],
    ['半固态', 3],
    ['钠离子', 3],
    ['钠电', 3],
    ['液流', 3],
    ['全钒', 3],
    ['压缩空气', 3],
    ['飞轮', 3],
    ['超级电容', 3],
    ['长时储能', 3],
    ['构网型', 3],
    ['循环寿命', 3],
    ['能量密度', 3],
    ['技术路线', 2],
    ['研发', 2],
    ['中试', 2],
    ['专利', 2],
    ['量产', 2],
    ['下线', 2],
    ['新产品', 2],
    ['pcs', 2],
    ['变流器', 2],
    ['bms', 2],
    ['ems', 2],
  ],
  capacity: [
    ['扩产', 3],
    ['投产', 3],
    ['开工', 3],
    ['并网', 2],
    ['建成', 2],
    ['并网发电', 3],
    ['投运', 3],
    ['产线', 3],
    ['基地', 2],
    ['产能', 3],
    ['电站', 2],
    ['gwh', 2],
    ['mwh', 2],
    ['竣工', 2],
    ['验收', 2],
    ['启动', 1],
  ],
  company: [
    ['合作', 1],
    ['签约', 1],
    ['业绩', 1],
    ['订单', 1],
    ['增长', 1],
  ],
};

// ---------------------------------------------------------------- 情绪词典

const POSITIVE_LEXICON = [
  ['投产', 1],
  ['并网', 1],
  ['投运', 1],
  ['中标', 1],
  ['签约', 1],
  ['落地', 1],
  ['达成', 1],
  ['突破', 1],
  ['增长', 1],
  ['扩产', 1],
  ['融资', 1],
  ['获批', 1],
  ['首发', 1],
  ['量产', 1],
  ['创新高', 2],
  ['合作', 1],
  ['入选', 1],
  ['领先', 1],
  ['建成', 1],
  ['完成', 1],
  ['成功', 1],
  ['竣工', 1],
  ['验收', 1],
  ['大单', 2],
  ['订单', 1],
  ['获', 0.5],
  ['开工', 0.5],
  ['提速', 1],
  ['加速', 0.5],
  ['利好', 2],
  ['下降成本', 2],
  ['度电成本', 0.5],
];

const NEGATIVE_LEXICON = [
  ['起火', 2],
  ['火灾', 2],
  ['爆炸', 2],
  ['事故', 2],
  ['热失控', 2],
  ['污染', 2],
  ['泄漏', 2],
  ['召回', 2],
  ['伤亡', 3],
  ['停运', 2],
  ['停产', 2],
  ['违规', 1],
  ['处罚', 1],
  ['约谈', 1],
  ['隐患', 1],
  ['亏损', 2],
  ['下滑', 2],
  ['延期', 1],
  ['终止', 2],
  ['取消', 1],
  ['退市', 2],
  ['内卷', 2],
  ['价格战', 2],
  ['过剩', 2],
  ['暴跌', 3],
  ['风险', 1],
  ['壁垒', 1],
  ['关税', 1],
  ['限制', 1],
  ['失败', 2],
  ['诉讼', 2],
  ['纠纷', 1],
  ['质疑', 1],
  ['警告', 2],
  ['紧急', 1],
  ['争议', 1],
  ['监管风暴', 2],
  ['强监管', 1],
  ['不达标', 2],
  ['不合格', 2],
];

// 配色沿用本项目既有语义（绿=正面/通过，红=风险/预警），与授信模块保持一致。
export const SENTIMENT_META = [
  { key: 'positive', label: '正面', tone: 'pos', color: '#1f8a5f' },
  { key: 'neutral', label: '中性', tone: 'mid', color: '#8a99a8' },
  { key: 'negative', label: '负面', tone: 'neg', color: '#c0392b' },
];

const SENTIMENT_OF = new Map(SENTIMENT_META.map((item) => [item.key, item]));

export function sentimentMeta(key) {
  return SENTIMENT_OF.get(key) || SENTIMENT_OF.get('neutral');
}

// ---------------------------------------------------------------- 环节词典

const SEGMENT_KEYWORDS = {
  资源与材料: [
    '碳酸锂',
    '锂矿',
    '锂盐',
    '正极',
    '负极',
    '隔膜',
    '电解液',
    '磷酸铁锂',
    '钒',
    '材料',
    '矿',
  ],
  核心电子器件: ['igbt', '芯片', '半导体', '功率器件', '传感器', 'pcb', '元器件'],
  核心装备: ['装备', '变流器', 'pcs', '压缩机', '透平', '温控', '消防', '集装箱', '产线', '整机'],
  检测认证与标准: [
    '检测',
    '认证',
    '标准',
    'ul',
    'gb ',
    'nfpa',
    'iso',
    '测试',
    '质量监督',
    '验收',
    '质监',
  ],
  电池与核心部件: ['电芯', '电池', 'ah', 'pack', '模组', '循环寿命', '热失控', 'bms', '电堆'],
  系统集成与工程建设: ['集成', 'epc', '总承包', '施工', '升压站', '工程', '集采', '招标', '中标'],
  应用与运营: [
    '运营',
    '调度',
    '现货',
    '辅助服务',
    '容量电价',
    '收益',
    '工商储',
    '户储',
    '电网侧',
    '电源侧',
    '共享储能',
    '调频',
    '虚拟电厂',
    '峰谷',
  ],
};

/** 储能链 7 个一级环节标签（去掉「待研判」占位）。 */
export const STORAGE_SEGMENTS = chainPaletteFor('储能产业')
  .filter((group) => group.id !== 'pending')
  .map((group) => group.label);

// ---------------------------------------------------------------- 相关性词典

// 命中任一关键词才认为与储能行业相关；用于剔除列表页里的导航与跨行业噪声。
const RELEVANCE_TOKENS = [
  '储能',
  '储电',
  '电池',
  '电芯',
  '锂',
  '钠',
  '液流',
  '钒',
  '压缩空气',
  '飞轮',
  '超级电容',
  'pcs',
  '变流',
  'bess',
  '并网',
  '调频',
  '容量电价',
  'epc',
  '集采',
  '长时',
  '构网',
  '光储',
  '工商业储',
  '户储',
  '源网荷储',
  '独立储能',
  '共享储能',
  '充放电',
];

// 明显与本行业无关的黑名单词（避免「储能」二字误伤到其它行业的新闻）。
const IRRELEVANT_TOKENS = [
  '人事任免',
  '招聘',
  '讲座',
  '培训通知',
  '指数快报',
  '星座',
  '体育',
  '彩票',
];

const normalizeText = (value) => String(value ?? '').trim();

const lower = (value) => normalizeText(value).toLowerCase();

/** 统计词典在文本中的累计权重。 */
function weigh(text, lexicon) {
  let total = 0;
  const hits = [];
  lexicon.forEach(([word, weight]) => {
    if (text.includes(word)) {
      total += weight;
      hits.push(word);
    }
  });
  return { total, hits };
}

/** 在单段文本上按词典权重择优，权重相同按 CATEGORY_META 顺序（越靠前越具体）。 */
function bestCategoryFor(text) {
  const source = lower(text);
  let best = { key: 'company', weight: 0, hits: [] };
  if (!source) return { ...best, label: categoryMeta(best.key).label };
  CATEGORY_META.forEach((meta) => {
    const { total, hits } = weigh(source, CATEGORY_LEXICON[meta.key] || []);
    if (total > best.weight) best = { key: meta.key, weight: total, hits };
  });
  return { ...best, label: categoryMeta(best.key).label };
}

/**
 * 舆情分类。
 * 标题是编辑视角的定性，优先按标题判；标题没有可识别词时（多为「XX 简报」这类短标题）
 * 才回落到摘要。混在一起打分会让摘要里的次要信息盖过标题主题——
 * 实测：「储能安全：从建议性到刚性红线」会因为摘要提到海外 UL 标准被误判为「出海海外」。
 */
export function classifyCategory(text, secondaryText = '') {
  const primary = bestCategoryFor(text);
  if (primary.weight > 0) return primary;
  return bestCategoryFor(secondaryText);
}

/**
 * 情绪打分：正面词权重减负面词权重。
 * score > 0 偏正面、score < 0 偏负面、等于 0 中性（规则法，粗粒度，仅做方向提示）。
 */
export function scoreSentiment(text) {
  const source = lower(text);
  const positive = weigh(source, POSITIVE_LEXICON);
  const negative = weigh(source, NEGATIVE_LEXICON);
  const score = positive.total - negative.total;
  const key = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  return {
    key,
    label: sentimentMeta(key).label,
    score: Math.round(score * 10) / 10,
    positive: positive.hits,
    negative: negative.hits,
  };
}

/** 环节打标：一条资讯可同时落在多个一级环节，最多返回 3 个。 */
export function tagSegments(text) {
  const source = lower(text);
  const hit = STORAGE_SEGMENTS.filter((label) =>
    (SEGMENT_KEYWORDS[label] || []).some((word) => source.includes(word)),
  );
  return hit.slice(0, 3);
}

// ---------------------------------------------------------------- 技术 / 产品信号

/**
 * 「技术与产品信号」三类信号来源。
 * 与 CATEGORY_META 正交：分类回答「这条资讯在讲什么」，信号回答「这条资讯对技术与产品意味着什么」，
 * 因此同一条资讯既是「政策机制」也可以同时是「产品价格与成本信号」。
 */
export const SIGNAL_META = [
  {
    key: 'route',
    label: '技术路线突破信号',
    short: '技术路线',
    tone: 'blue',
    accent: '#1769e0',
    hint: '材料体系、技术路线、关键指标与研发/中试突破',
  },
  {
    key: 'launch',
    label: '新产品发布信号',
    short: '新产品',
    tone: 'teal',
    accent: '#159f76',
    hint: '新品发布、量产下线、首发交付与产线投产',
  },
  {
    key: 'cost',
    label: '产品价格与成本信号',
    short: '价格成本',
    tone: 'orange',
    accent: '#e68024',
    hint: '系统 / EPC 单价、原材料价格与降本路径',
  },
];

export const SIGNAL_KEYS = SIGNAL_META.map((item) => item.key);

const SIGNAL_OF = new Map(SIGNAL_META.map((item) => [item.key, item]));

export function signalMeta(key) {
  return SIGNAL_OF.get(key) || SIGNAL_OF.get('route');
}

const SIGNAL_LEXICON = {
  route: [
    ['技术路线', 3],
    ['材料体系', 3],
    ['固态电池', 3],
    ['半固态', 3],
    ['钠离子', 3],
    ['钠电', 3],
    ['液流', 3],
    ['全钒', 3],
    ['压缩空气', 3],
    ['飞轮', 3],
    ['超级电容', 3],
    ['长时储能', 3],
    ['构网型', 3],
    ['循环寿命', 3],
    ['能量密度', 3],
    ['587ah', 3],
    ['588ah', 3],
    ['625ah', 3],
    ['大容量电芯', 3],
    ['中试', 2],
    ['专利', 2],
    ['研发', 2],
    ['突破', 2],
    ['实验室', 2],
    ['热管理', 2],
    ['技术', 1],
    ['电芯', 2],
    ['电堆', 2],
    ['pcs', 2],
    ['变流器', 2],
    ['bms', 2],
    ['ems', 2],
    ['氢储能', 2],
  ],
  launch: [
    ['新产品', 3],
    ['新品', 3],
    ['发布', 3],
    ['首发', 3],
    ['下线', 3],
    ['量产', 3],
    ['首台', 3],
    ['首套', 3],
    ['面世', 3],
    ['推出', 3],
    ['上市', 2],
    ['交付', 2],
    ['出货', 2],
    ['投产', 2],
    ['产线', 2],
    ['亮相', 2],
    ['样机', 2],
    ['系列', 1],
    ['订单', 1],
  ],
  cost: [
    ['元/wh', 4],
    ['元/千瓦', 3],
    ['epc 均价', 4],
    ['招标价', 3],
    ['中标价', 3],
    ['价格走势', 3],
    ['度电成本', 3],
    ['价格战', 3],
    ['降本', 3],
    ['降价', 3],
    ['限价', 3],
    ['单价', 3],
    ['均价', 3],
    ['报价', 3],
    ['成本', 3],
    ['碳酸锂', 3],
    ['锂价', 3],
    ['价格', 3],
    ['涨价', 2],
    ['原材料', 2],
    ['毛利', 2],
    ['利润率', 2],
    ['投资成本', 2],
  ],
};

/**
 * 技术 / 产品信号打标：一条资讯可同时命中多类信号，按命中权重降序全部返回。
 * 用「标题 + 摘要」判定（信号是内容层面的属性，摘要能提高召回）。
 */
export function classifySignals(text) {
  const source = lower(text);
  if (!source) return [];
  return SIGNAL_META.map((meta) => ({
    key: meta.key,
    weight: weigh(source, SIGNAL_LEXICON[meta.key] || []).total,
  }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.weight - a.weight || SIGNAL_KEYS.indexOf(a.key) - SIGNAL_KEYS.indexOf(b.key))
    .map((row) => row.key);
}

/** 主题关键词：抓取标题里有信息量的技术/市场名词，用于「主题热度」。 */
const THEME_LEXICON = [
  '容量电价',
  '十五五',
  '现货市场',
  '辅助服务',
  '并网',
  '调频',
  '独立储能',
  '共享储能',
  '工商业储能',
  '长时储能',
  '构网型',
  '钠离子电池',
  '钠电',
  '液流电池',
  '全钒液流',
  '压缩空气',
  '飞轮',
  '超级电容',
  '半固态',
  '固态电池',
  '587ah',
  '大容量电芯',
  '循环寿命',
  '碳酸锂',
  '系统均价',
  'EPC',
  '集采',
  '出海',
  '海外订单',
  '关税',
  '贸易壁垒',
  'UL 9540A',
  '储能安全',
  '热失控',
  'PCS',
  '虚拟电厂',
  '源网荷储',
  '绿电直连',
  '数据中心',
];

export function extractKeywords(text) {
  const source = lower(text);
  return THEME_LEXICON.filter((word) => source.includes(lower(word)));
}

/** 是否与储能行业相关。 */
export function isRelevant(text) {
  const source = lower(text);
  if (IRRELEVANT_TOKENS.some((word) => source.includes(word))) return false;
  return RELEVANCE_TOKENS.some((word) => source.includes(word));
}

// ---------------------------------------------------------------- 条目规范化

/** 稳定短哈希：用于给条目生成不依赖顺序的 id。 */
export function hashId(text) {
  let hash = 2166136261;
  const source = normalizeText(text);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** 标题归一化，用于去重比对：去掉空白、标点与全半角差异。 */
export function titleKey(title) {
  return lower(title)
    .replace(/[\s\u3000]+/g, '')
    .replace(/[|｜·、,，。.！!？?：:；;“”"'（）()【】—…-]/g, '');
}

function clampText(value, max) {
  const text = normalizeText(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * 链上企业简称里与通用词同形的名字：在新闻标题里出现多半是普通名词而非指代该企业，
 * 命中会造成「舆情涉及企业」虚高，故直接排除。
 */
const GENERIC_COMPANY_NAMES = new Set(['太阳能', '动力源', '中国铁塔', '节能风电']);

/**
 * 匹配标题中出现的链上上市企业（企业简称）。
 * 仅用长度 ≥ 3 的简称，避免两字通用词造成误命中。
 */
export function matchCompanies(text, companies, limit = 6) {
  const source = normalizeText(text);
  if (!source) return [];
  const hits = [];
  (companies || []).forEach((company) => {
    // 全称入链后（如「宁德时代新能源科技股份有限公司」），新闻标题多用简称，
    // 因此按「全称 + 简称别名」逐一匹配，命中最长的一个别名即算该企业被提及。
    const aliases = [...companyAliases(company)].sort((a, b) => b.length - a.length);
    const matched = aliases.find((alias) => source.includes(alias));
    if (!matched) return;
    hits.push({
      name: matched,
      code: company.code || '',
      tier: company.tier || '',
      tierLabel: company.tierLabel || '未分层',
      level1: (company.level1 || []).join(' · '),
    });
  });
  return hits.slice(0, limit);
}

/**
 * 规范化单条原始资讯。
 * @param {object} raw {title, url, source, sourceId, channel, publishedAt, summary}
 * @param {object} options {companies}
 */
export function normalizeItem(raw, options = {}) {
  const title = clampText(raw?.title, 120);
  if (!title) return null;
  const summary = clampText(raw?.summary, 160);
  // 分类、环节与主题词可以用「标题 + 摘要」提高召回；但情绪只判标题——
  // 摘要里常有「已通过热失控/针刺测试」「解除整改」这类反转语境的表述，
  // 混进来会把正面条目误判为负面（实测：「587Ah 量产下线」被摘要里的热失控测试词拖成负面）。
  const haystack = `${title} ${summary}`;
  const category = classifyCategory(title, summary);
  const sentiment = scoreSentiment(title);
  const segments = tagSegments(haystack);
  const keywords = extractKeywords(haystack);
  const signals = classifySignals(haystack);
  const companies = matchCompanies(title, options.companies || []);
  const publishedAt = normalizeDate(raw?.publishedAt);

  return {
    id: `${raw?.sourceId || 'src'}-${hashId(titleKey(title))}`,
    title,
    summary,
    url: normalizeText(raw?.url),
    source: normalizeText(raw?.source) || '公开资讯',
    sourceId: normalizeText(raw?.sourceId) || 'public',
    channel: normalizeText(raw?.channel),
    publishedAt,
    category: category.key,
    categoryLabel: category.label,
    categoryWeight: category.weight,
    sentiment: sentiment.key,
    sentimentLabel: sentiment.label,
    sentimentScore: sentiment.score,
    segments,
    keywords,
    signals,
    companies: companies.map((company) => company.name),
    companyHits: companies,
    impact: computeImpact({
      category: category.key,
      sentiment: sentiment.key,
      title,
      keywords,
      companies,
    }),
  };
}

/** 把各种日期写法归一为 YYYY-MM-DD；解析不了返回空串。 */
export function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return '';
  const match = text.match(/(20\d{2})\D{0,2}(\d{1,2})\D{0,2}(\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function computeImpact({ category, sentiment, title, keywords, companies }) {
  let score = 1;
  if (['policy', 'price', 'bidding', 'safety', 'overseas'].includes(category)) score += 1;
  if (companies.length) score += 1;
  if (keywords.length >= 2) score += 1;
  if (sentiment === 'negative') score += 1;
  if (/首个|首条|首次|全球|最大|纪录|GW级|GWh/i.test(title)) score += 1;
  return Math.min(4, score);
}

/** 去重：标题归一化后相同即视为重复，保留信息更全（摘要/日期/影响更高）的一条。 */
export function dedupeItems(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (!item) return;
    const key = titleKey(item.title);
    if (!key) return;
    const current = map.get(key);
    if (!current) {
      map.set(key, item);
      return;
    }
    // 同一事件被多源报道时，保留信息更完整的一条：影响力更高 → 有发布日期 → 有摘要。
    const better =
      (item.impact || 0) > (current.impact || 0) ||
      (!!item.publishedAt && !current.publishedAt) ||
      (!!item.summary && !current.summary);
    if (better) map.set(key, item);
  });
  return Array.from(map.values());
}

const dayValue = (item) => (item.publishedAt ? Date.parse(`${item.publishedAt}T00:00:00`) : 0);

function byImpactThenDate(a, b) {
  return (
    (b.impact || 0) - (a.impact || 0) ||
    dayValue(b) - dayValue(a) ||
    String(a.title).localeCompare(String(b.title), 'zh-CN')
  );
}

// ---------------------------------------------------------------- 聚合研判

function tally(items, pick) {
  const counts = new Map();
  items.forEach((item) => {
    const values = pick(item);
    (Array.isArray(values) ? values : [values]).forEach((value) => {
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });
  return counts;
}

function rank(counts, limit) {
  const rows = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
  return Number.isFinite(limit) ? rows.slice(0, limit) : rows;
}

/** 情绪指数：正面记 100、中性记 50、负面记 0，加权平均后取整。 */
export function sentimentIndex(counts) {
  const total = counts.positive + counts.neutral + counts.negative;
  if (!total) return 50;
  return Math.round(((counts.positive * 100 + counts.neutral * 50) / total) * 10) / 10;
}

function moodLabel(index) {
  if (index >= 62) return '情绪偏暖';
  if (index >= 46) return '情绪中性';
  return '情绪偏冷';
}

function windowLabelOf(items) {
  const days = items
    .map((item) => item.publishedAt)
    .filter(Boolean)
    .sort();
  if (!days.length) return '本期';
  const from = days[0];
  const to = days[days.length - 1];
  return from === to ? from : `${from} 至 ${to}`;
}

function buildHeadline({ total, index, categories, companies, topSegment }) {
  const mood = moodLabel(index);
  const top = categories
    .slice(0, 2)
    .map((row) => `「${row.label}」${row.count} 条`)
    .join('、');
  const companyLine = companies.length
    ? `舆情共提及 ${companies.length} 家链上企业，${companies[0].name}出现最多（${companies[0].count} 次）`
    : '舆情未形成明显的链上企业集中度';
  const segmentLine = topSegment ? `，环节上以「${topSegment.label}」为焦点` : '';
  return `${mood}｜本期 ${total} 条有效舆情中${top}最为密集${segmentLine}；${companyLine}。`;
}

function buildLead({ total, sourceRows, windowLabel, counts, index }) {
  const sourceText = sourceRows.map((row) => `${row.name} ${row.count} 条`).join('、');
  return `本期研判基于 ${sourceRows.length} 家公开资讯源在 ${windowLabel} 窗口内采集的 ${total} 条有效舆情（已剔除重复条目与行业无关内容）：${sourceText}。其中正面 ${counts.positive} 条、中性 ${counts.neutral} 条、负面 ${counts.negative} 条，情绪指数 ${index}（0—100，高于 50 表示偏正面）。`;
}

function buildRiskNote(riskItems) {
  if (!riskItems.length) return '本期未监测到负面舆情，仍需持续跟踪安全与并网合规类信息。';
  const top = riskItems
    .slice(0, 2)
    .map((item) => `「${clampText(item.title, 24)}」`)
    .join('、');
  return `负面舆情 ${riskItems.length} 条，集中在${top}等，建议在走访与审批环节抬头关注。`;
}

/**
 * 各类资讯在「抓取内容总结」里的叙述用词，用于把分类名还原成一句人话。
 */
const CATEGORY_PHRASE = {
  safety: '安全监管与事故风险',
  policy: '政策与机制',
  capital: '资本运作',
  bidding: '招投标与项目采购',
  price: '价格与成本',
  overseas: '出海与海外订单',
  tech: '技术与产品迭代',
  capacity: '产能与项目建设',
  company: '企业动态',
};

/**
 * 会议 / 展会 / 直播这类推广稿回答不了「这条主线本周发生了什么」，
 * 选代表性报道时统一后置（只影响排序，不做过滤，避免误杀真政策标题）。
 */
const PROMO_TITLE_PATTERN = /大会|展览会|展会|论坛|峰会|沙龙|直播|报名|邀请函|招商|赞助|冠名/;

function promoRank(item) {
  return PROMO_TITLE_PATTERN.test(String(item?.title || '')) ? 1 : 0;
}

/**
 * 「本周总结」的第二段：对**抓取到的网上新闻**做实质归纳。
 *
 * 与 headline 分工不同——headline 回答「本周行业情绪如何」，
 * 这里回答「这周行业到底发生了什么」：先给一段叙述性总述，
 * 再按主线拆成要点，每条主线带代表性报道（标题 + 原文链接，可点击）。
 *
 * 返回 { count, overview, points }；无数据时给兜底文案而不是空串。
 */
export function buildNewsSummary({
  items = [],
  categories = [],
  total = 0,
  windowLabel = '',
  sourceRows = [],
  signals = [],
  companies = [],
} = {}) {
  if (!total) {
    return {
      count: 0,
      overview: '本期未抓取到有效行业资讯，建议稍后重试或检查资讯源连通性。',
      points: [],
    };
  }

  // 只把有分量的主线列为要点（默认 ≥2 条），最多 5 条，避免退化成逐条罗列；
  // 抓取量本身很少时（窗口初开的窄样本）放宽到 ≥1 条，否则要点会整段空掉。
  let lines = categories.filter((row) => row.count >= 2);
  if (!lines.length) lines = categories.filter((row) => row.count >= 1);
  lines = lines.slice(0, 5);
  const points = lines.map((row) => {
    const reps = items
      .filter((item) => item.category === row.key)
      .sort((a, b) => promoRank(a) - promoRank(b) || byImpactThenDate(a, b))
      .slice(0, 3);
    return {
      key: row.key,
      label: row.label,
      tone: row.tone,
      count: row.count,
      phrase: CATEGORY_PHRASE[row.key] || '相关',
      lead: reps[0]
        ? {
            id: reps[0].id,
            title: reps[0].title,
            url: reps[0].url,
            source: reps[0].source,
            publishedAt: reps[0].publishedAt,
          }
        : null,
      more: reps.slice(1).map((item) => ({
        id: item.id,
        title: clampText(item.title, 30),
        url: item.url,
      })),
    };
  });

  const sentences = [];
  const main = lines
    .slice(0, 3)
    .map((row) => `「${row.label}」`)
    .join('、');
  const metaText = [windowLabel, sourceRows.length ? `${sourceRows.length} 家来源` : '']
    .filter(Boolean)
    .join(' · ');
  sentences.push(
    `本期抓取的 ${total} 条公开资讯${metaText ? `（${metaText}）` : ''}主要围绕${main || '行业常规动态'}展开。`,
  );

  if (points[0]?.lead) {
    const second = points[1]?.lead;
    sentences.push(
      `其中「${points[0].label}」${points[0].count} 条最为密集，代表报道为《${clampText(points[0].lead.title, 32)}》${
        second ? `；「${points[1].label}」以《${clampText(second.title, 28)}》为代表` : ''
      }。`,
    );
  } else if (lines[0]) {
    sentences.push(`其中「${lines[0].label}」类信息最多（${lines[0].count} 条）。`);
  }

  const signalText = signals
    .filter((row) => row.count > 0)
    .map((row) => `${row.short} ${row.count} 条`);
  if (signalText.length) {
    sentences.push(`技术侧线索上，${signalText.join('、')}。`);
  }

  if (companies.length) {
    sentences.push(
      `内容共提及 ${companies.length} 家链上上市企业，${companies[0].name}出现最多（${companies[0].count} 次）。`,
    );
  } else {
    sentences.push('内容未形成明显的链上上市企业集中度。');
  }

  return { count: points.length, overview: sentences.join(''), points };
}

/**
 * 企业匹配别名：简称 + 工商全称。
 * 新闻与公告里经常用全称（「惠州亿纬锂能股份有限公司」），只用简称会漏掉这类条目。
 */
export function companyAliases(company) {
  const values = new Set();
  const name = normalizeText(company?.name);
  if (name) values.add(name);
  const fullName = normalizeText(company?.fullName);
  if (fullName) {
    values.add(fullName);
    const stripped = fullName.replace(/(集团)?(股份)?有限公司$/, '');
    if (stripped && stripped !== fullName) values.add(stripped);
  }
  // 全称入链后，简称/曾用名只存在于主数据的 aliases 字段里，必须一并纳入。
  (Array.isArray(company?.aliases) ? company.aliases : []).forEach((alias) => {
    const text = normalizeText(alias);
    if (text) values.add(text);
  });
  return Array.from(values).filter(
    (value) => value.length >= 3 && !GENERIC_COMPANY_NAMES.has(value),
  );
}

function aliasesOf(name, aliases) {
  const list = Array.isArray(aliases) && aliases.length ? aliases : [name];
  return list
    .map(normalizeText)
    .filter((value) => value.length >= 3 && !GENERIC_COMPANY_NAMES.has(value));
}

/**
 * 判断一条资讯是否提及指定企业。
 * 标题与摘要都参与匹配：近况检索看的是「这家企业最近被报道了什么」，
 * 摘要里出现企业名往往就是这家企业的动态来源。
 */
function itemMentionsCompany(item, aliases) {
  if (!aliases.length) return false;
  const haystack = `${normalizeText(item?.title)} ${normalizeText(item?.summary)}`;
  return aliases.some((alias) => haystack.includes(alias));
}

/** 企业近况条目：把提及该企业的资讯按 影响力 → 日期 排序，取前 limit 条。 */
export function buildCompanyRecent(name, items, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 5;
  const aliases = aliasesOf(name, options.aliases);
  return (items || [])
    .filter((item) => item && item.title && itemMentionsCompany(item, aliases))
    .sort(byImpactThenDate)
    .slice(0, limit);
}

const shortMonthDay = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[2])}月${Number(match[3])}日` : '';
};

/**
 * 企业「最近情况」一句话总结。无有效条目时返回「暂无」——
 * 页面据此直接展示占位，不再另写分支文案。
 */
export function summarizeCompanyRecent(name, rows) {
  if (!rows || !rows.length) return '暂无';
  const counts = { positive: 0, neutral: 0, negative: 0 };
  rows.forEach((item) => {
    if (counts[item.sentiment] != null) counts[item.sentiment] += 1;
  });
  const index = sentimentIndex(counts);
  const cats = rank(
    tally(rows, (item) => item.category),
    2,
  )
    .map((row) => `「${categoryMeta(row.label).label}」`)
    .join('、');
  const latest = [...rows].sort(
    (a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || 0,
  )[0];
  const latestText = latest
    ? `最新一条为「${clampText(latest.title, 30)}」${shortMonthDay(latest.publishedAt) ? `（${shortMonthDay(latest.publishedAt)}）` : ''}。`
    : '';
  return `${name}近况：近期检索到 ${rows.length} 条相关资讯，集中在${cats || '行业综合'}，${moodLabel(index)}。${latestText}`;
}

/**
 * 批量生成企业近况索引：{ [企业名]: {name, count, updatedAt, items, summary} }。
 * 用于「重点关注企业」模块的默认近况展示与「近况分析」按钮的本地回落数据。
 */
export function buildCompanyDigest(names, itemsByCompany, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 5;
  const digest = {};
  (names || []).forEach((name) => {
    const rows = (itemsByCompany?.[name] || []).slice(0, limit);
    if (!rows.length) return;
    const updatedAt = rows
      .map((item) => item.publishedAt)
      .filter(Boolean)
      .sort()
      .pop();
    digest[name] = {
      name,
      count: rows.length,
      updatedAt: updatedAt || '',
      summary: summarizeCompanyRecent(name, rows),
      items: rows,
    };
  });
  return digest;
}

/**
 * 聚合研判结果。
 * @param {object} payload {items, sources, generatedAt}
 * @param {object} options {companies, topLimit}
 */
export function buildSentimentDigest(payload, options = {}) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const items = rawItems.filter((item) => item && item.title);
  const companies = options.companies || [];
  const topLimit = options.topLimit ?? 6;
  // 条目里的企业名可能是命中别名（简称），因此同时用全称与别名建索引，
  // 保证 tier/tierLabel 等画像字段能回查到链上主体。
  const companyByKey = new Map();
  companies.forEach((company) => {
    if (!company) return;
    const keys = new Set([normalizeText(company.name), ...companyAliases(company)]);
    keys.forEach((key) => {
      if (key && !companyByKey.has(key)) companyByKey.set(key, company);
    });
  });

  const counts = { positive: 0, neutral: 0, negative: 0 };
  items.forEach((item) => {
    if (counts[item.sentiment] != null) counts[item.sentiment] += 1;
  });
  const index = sentimentIndex(counts);

  const categories = rank(
    tally(items, (item) => item.category),
    Infinity,
  )
    .map((row) => {
      const meta = categoryMeta(row.label);
      return {
        key: row.label,
        label: meta.label,
        tone: meta.tone,
        hint: meta.hint,
        count: row.count,
        share: items.length ? Math.round((row.count / items.length) * 100) : 0,
      };
    })
    .sort(
      (a, b) => b.count - a.count || CATEGORY_KEYS.indexOf(a.key) - CATEGORY_KEYS.indexOf(b.key),
    );

  const themes = rank(
    tally(items, (item) => item.keywords),
    12,
  );

  const companyRows = rank(
    tally(items, (item) => item.companies),
    8,
  ).map((row) => {
    const hit = companyByKey.get(row.label);
    return {
      name: row.label,
      count: row.count,
      code: hit?.code || '',
      tier: hit?.tier || '',
      tierLabel: hit?.tierLabel || '',
      level1: (hit?.level1 || []).join(' · '),
    };
  });

  const segmentRows = rank(
    tally(items, (item) => item.segments),
    7,
  );

  const top = [...items].sort(byImpactThenDate).slice(0, topLimit);
  // 三栏聚焦与信号栏返回**全量**条目，由页面控制默认展示条数与「展开全部」按钮，
  // 避免在模型层就把数据截断后无法再展开。
  const pick = (key, limit = Infinity) =>
    [...items]
      .filter((item) => item.category === key)
      .sort(byImpactThenDate)
      .slice(0, limit);
  const policy = pick('policy');
  const price = pick('price');
  const bidding = pick('bidding');
  const overseas = pick('overseas');
  const riskItems = [...items]
    .filter((item) => item.sentiment === 'negative' || item.category === 'safety')
    .sort(byImpactThenDate)
    .slice(0, 4);

  const signals = SIGNAL_META.map((meta) => {
    const rows = [...items]
      .filter((item) => (item.signals || []).includes(meta.key))
      .sort(byImpactThenDate);
    return { ...meta, count: rows.length, items: rows };
  });

  const sourceRows = (payload?.sources || [])
    .map((source) => ({
      ...source,
      count: items.filter((item) => item.sourceId === source.id).length,
    }))
    .filter((source) => source.count > 0)
    .sort((a, b) => b.count - a.count);

  const windowLabel = windowLabelOf(items);
  const newsSummary = buildNewsSummary({
    items,
    categories,
    total: items.length,
    windowLabel,
    sourceRows,
    signals,
    companies: companyRows,
  });

  return {
    meta: {
      generatedAt: normalizeText(payload?.generatedAt),
      windowLabel,
      itemCount: items.length,
      rawCount: Number(payload?.rawCount ?? rawItems.length),
      deduped: Math.max(0, Number(payload?.rawCount ?? rawItems.length) - items.length),
      sources: sourceRows,
      sourceCount: sourceRows.length,
      note: normalizeText(payload?.note),
    },
    sentiment: { ...counts, total: items.length, index, mood: moodLabel(index) },
    categories,
    themes,
    segments: segmentRows,
    companies: companyRows,
    signals,
    top,
    policy,
    price,
    bidding,
    overseas,
    risk: riskItems,
    headline: buildHeadline({
      total: items.length,
      index,
      categories,
      companies: companyRows,
      topSegment: segmentRows[0] || null,
    }),
    newsSummary,
    contentSummary: newsSummary.overview,
    lead: buildLead({ total: items.length, sourceRows, windowLabel, counts, index }),
    riskNote: buildRiskNote(riskItems),
  };
}
