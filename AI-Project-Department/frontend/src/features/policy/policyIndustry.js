// 政策行业识别：按标题与正文中的行业关键词，给一份政策打上行业标签。
//
// 纯函数、无副作用：同输入必得同输出；命中即取证，返回原样命中的词，便于业务复核。
//
// 行业参照系（27 个）：
//   · 储能——本页的重点行业，词表覆盖最全，作为「储能行业·有效期内政策」视图的筛选口径；
//   · 科技金融十大赛道（10）——生物医药、高端装备制造、新能源、电子信息、新材料、
//     集成电路、航空航天（含低空经济）、新能源汽车、人工智能、海洋经济；
//   · 工信部新一轮十大行业稳增长工作方案（10）——钢铁、有色、石化、化工、建材、
//     机械、汽车、电力装备、轻工业、电子信息制造业；
//   · 六大未来产业（6）——量子科技、生物制造、氢能和核聚变能、脑机接口、具身智能、
//     第六代移动通信。
//   后 26 个行业用于「全行业政策地位对比」视图：与储能比较政策数量与支持强度，
//   看储能行业当前的政策地位。人工修正优先于自动识别（override 由调用方传入）。
//   注意：一份政策可能同时命中多个行业（如储能政策同时提到新能源），这是行业交叉的
//   真实反映，对比口径按「命中即计入」处理；关键词避免裸泛词（如「汽车」「化工」），
//   防止无关政策被误命中。

export const INDUSTRY_LEXICON = [
  {
    key: 'storage',
    label: '储能',
    group: 'storage',
    keywords: [
      '新型储能',
      '电化学储能',
      '储能电站',
      '独立储能',
      '共享储能',
      '工商业储能',
      '用户侧储能',
      '电网侧储能',
      '电源侧储能',
      '长时储能',
      '储能系统',
      '储能电池',
      '储能装备',
      '储能产业',
      '储能项目',
      '储能设施',
      '抽水蓄能',
      '压缩空气储能',
      '飞轮储能',
      '液流电池',
      '全钒液流',
      '钠离子电池',
      '钠电',
      '锂离子电池',
      '磷酸铁锂',
      '储能变流器',
      '储能温控',
      '储能消防',
      '氢储能',
      '储热',
      '储氢',
    ],
  },

  /* ---------------- 科技金融十大赛道（10） ---------------- */
  {
    key: 'biomed',
    label: '生物医药',
    group: 'tech',
    keywords: ['生物医药', '创新药', '医疗器械', '医药产业', '疫苗'],
  },
  {
    key: 'equipment',
    label: '高端装备制造',
    group: 'tech',
    keywords: ['高端装备', '重大技术装备', '工业母机', '数控机床', '智能制造装备'],
  },
  {
    key: 'newenergy',
    label: '新能源',
    group: 'tech',
    // 覆盖光伏、风电等新能源发电形态（十大赛道口径下不单列光伏 / 风电）。
    keywords: ['新能源', '光伏', '风电', '太阳能', '生物质能'],
  },
  {
    key: 'electronics',
    label: '电子信息',
    group: 'tech',
    keywords: ['电子信息'],
  },
  {
    key: 'materials',
    label: '新材料',
    group: 'tech',
    keywords: ['新材料', '先进材料', '高性能材料', '复合材料'],
  },
  {
    key: 'ic',
    label: '集成电路',
    group: 'tech',
    keywords: ['集成电路', '芯片', '半导体', '晶圆', '封测', '先进制程'],
  },
  {
    key: 'aerospace',
    label: '航空航天（含低空经济）',
    group: 'tech',
    keywords: ['航空航天', '商业航天', '低空经济', '通用航空', '卫星', '大飞机'],
  },
  {
    key: 'nev',
    label: '新能源汽车',
    group: 'tech',
    keywords: ['新能源汽车', '智能网联汽车', '电动汽车', '动力电池', '充换电'],
  },
  {
    key: 'ai',
    label: '人工智能',
    group: 'tech',
    keywords: ['人工智能', '大模型', '机器学习', '智能体', '生成式人工智能'],
  },
  {
    key: 'ocean',
    label: '海洋经济',
    group: 'tech',
    keywords: ['海洋经济', '海洋产业', '深海科技', '海洋牧场', '海工装备'],
  },

  /* ---------------- 工信部十大稳增长行业（10） ---------------- */
  {
    key: 'steel',
    label: '钢铁',
    group: 'steady',
    keywords: ['钢铁', '粗钢', '炼钢', '炼铁'],
  },
  {
    key: 'nonferrous',
    label: '有色',
    group: 'steady',
    keywords: ['有色金属', '稀土', '电解铝', '氧化铝'],
  },
  {
    key: 'petrochem',
    label: '石化',
    group: 'steady',
    keywords: ['石化', '石油化工', '炼油', '乙烯'],
  },
  {
    key: 'chemical',
    label: '化工',
    group: 'steady',
    // 不用裸词「化工」：避免与「石油化工」「煤化工」混叠误命中。
    keywords: ['化工行业', '化工产业', '精细化工', '化学工业', '化学原料', '氟化工'],
  },
  {
    key: 'building',
    label: '建材',
    group: 'steady',
    keywords: ['建材', '水泥', '平板玻璃', '绿色建材', '石膏'],
  },
  {
    key: 'machinery',
    label: '机械',
    group: 'steady',
    // 不用裸词「机械」：避免「机械设备」「机械」等泛指误命中。
    keywords: ['机械行业', '机械产业', '工程机械', '农业机械', '仪器仪表'],
  },
  {
    key: 'auto',
    label: '汽车',
    group: 'steady',
    // 不用裸词「汽车」：避免「新能源汽车」政策被泛化命中（新能源车另设赛道）。
    keywords: ['汽车行业', '汽车产业', '汽车消费', '燃油汽车', '汽车以旧换新', '整车'],
  },
  {
    key: 'powerEquipment',
    label: '电力装备',
    group: 'steady',
    keywords: ['电力装备', '输变电', '发电设备', '风电装备', '光伏设备', '锂电设备'],
  },
  {
    key: 'light',
    label: '轻工业',
    group: 'steady',
    keywords: ['轻工业', '消费品工业', '家电', '食品', '造纸', '皮革'],
  },
  {
    key: 'electronicsMfg',
    label: '电子信息制造业',
    group: 'steady',
    keywords: ['电子信息制造业', '电子制造业', '消费电子', '电子元器件'],
  },

  /* ---------------- 六大未来产业（6） ---------------- */
  {
    key: 'quantum',
    label: '量子科技',
    group: 'future',
    keywords: ['量子科技', '量子计算', '量子通信', '量子测量'],
  },
  {
    key: 'bioMfg',
    label: '生物制造',
    group: 'future',
    keywords: ['生物制造', '合成生物', '生物基材料'],
  },
  {
    key: 'fusion',
    label: '氢能和核聚变能',
    group: 'future',
    // 「氢储能」「储氢」不含连续子串「氢能」，不会被储能政策误命中。
    keywords: ['氢能', '绿氢', '制氢', '加氢站', '燃料电池', '电解槽', '核聚变', '聚变能'],
  },
  {
    key: 'bmi',
    label: '脑机接口',
    group: 'future',
    keywords: ['脑机接口'],
  },
  {
    key: 'embodied',
    label: '具身智能',
    group: 'future',
    keywords: ['具身智能', '人形机器人', '智能机器人', '机器人产业'],
  },
  {
    key: 'sixg',
    label: '第六代移动通信',
    group: 'future',
    keywords: ['第六代移动通信', '6g'],
  },
];

export const INDUSTRY_MAP = Object.fromEntries(INDUSTRY_LEXICON.map((item) => [item.key, item]));

// 行业分组：用于「全行业政策地位对比」的三组参照系（储能单独成组，不在此列）。
export const INDUSTRY_GROUPS = [
  { key: 'tech', label: '科技金融十大赛道', count: 10 },
  { key: 'steady', label: '十大行业稳增长', count: 10 },
  { key: 'future', label: '六大未来产业', count: 6 },
];

export const INDUSTRY_GROUP_MAP = Object.fromEntries(
  INDUSTRY_GROUPS.map((item) => [item.key, item]),
);

export const INDUSTRY_OPTIONS = INDUSTRY_LEXICON.map((item) => ({
  value: item.key,
  label: item.label,
  group: item.group,
}));

export const OTHER_INDUSTRY = { key: 'other', value: 'other', label: '其他行业' };
export const ALL_INDUSTRY = { key: 'all', value: 'all', label: '全部行业' };

// 人工修正下拉：按行业体系分组展示（optgroup），最后附「其他行业」。
export const INDUSTRY_SELECT_GROUPS = [
  { key: 'storage', label: '重点行业（本页视角）', options: [INDUSTRY_MAP.storage] },
  {
    key: 'tech',
    label: '科技金融十大赛道',
    options: INDUSTRY_OPTIONS.filter((item) => item.group === 'tech'),
  },
  {
    key: 'steady',
    label: '工信部十大稳增长行业',
    options: INDUSTRY_OPTIONS.filter((item) => item.group === 'steady'),
  },
  {
    key: 'future',
    label: '六大未来产业',
    options: INDUSTRY_OPTIONS.filter((item) => item.group === 'future'),
  },
  { key: 'other', label: '', options: [OTHER_INDUSTRY] },
];

export const INDUSTRY_SELECT_OPTIONS = [...INDUSTRY_OPTIONS, OTHER_INDUSTRY];

const normalize = (value) => String(value || '').toLowerCase();

/**
 * 识别一份政策命中的行业。
 * @returns {{key:string,label:string,group:string,hits:string[],count:number}[]} 按命中词数降序；无命中返回 []
 */
export function detectIndustries(policy) {
  const surface = normalize(
    `${policy?.title || ''}\n${policy?.issuer || ''}\n${policy?.text || ''}`,
  );
  if (!surface.trim()) return [];

  return INDUSTRY_LEXICON.map((industry) => {
    const hits = industry.keywords.filter((word) => surface.includes(normalize(word)));
    return {
      key: industry.key,
      label: industry.label,
      group: industry.group,
      hits,
      count: hits.length,
    };
  })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * 取政策的行业标签：人工修正优先；未修正时用自动识别结果，识别不到归「其他行业」。
 */
export function resolveIndustries(policy, overrideKey = '') {
  if (overrideKey) {
    const preset = INDUSTRY_MAP[overrideKey] || (overrideKey === 'other' ? OTHER_INDUSTRY : null);
    if (preset) {
      return [
        {
          key: preset.key,
          label: preset.label,
          group: preset.group || '',
          hits: [],
          count: 0,
          manual: true,
        },
      ];
    }
  }
  const detected = detectIndustries(policy);
  if (detected.length) return detected;
  return [{ ...OTHER_INDUSTRY, group: '', hits: [], count: 0, manual: false, fallback: true }];
}

export function isStoragePolicy(policy, overrideKey = '') {
  return resolveIndustries(policy, overrideKey).some((item) => item.key === 'storage');
}

/* ---------------- 算力产业：本页的第二个「重点行业」视角 ---------------- */

// 说明：算力不在 27 个参照行业的框架内（那套框架是科技金融十大赛道 + 工信部十大 +
// 六大未来产业），因此不为它新增第 28 个参照行业，而是单列一份「算力关键词」，
// 用于「算力行业 · 有效期内政策」视图的筛选口径，以及全行业对比里的单列一行。
// 关键词同样避免裸泛词：「数据中心」单用会误命中传统 IDC 与政务云政策，故
// 与「智能」「智算」「算力」组合出现或使用完整术语时才计入。
export const COMPUTE_KEYWORDS = [
  '算力',
  '智能算力',
  '智算',
  '智算中心',
  '算力中心',
  '算力网络',
  '算力基础设施',
  '一体化算力网',
  '东数西算',
  '国家枢纽节点',
  '数据中心集群',
  '超算中心',
  '人工智能计算中心',
  '训练集群',
  '推理算力',
  'AI 服务器',
  'AI服务器',
  '加速卡',
  'GPU',
  '液冷',
  '光模块',
  '算力券',
];

// 「重点行业」视角：储能产业与算力产业各一套口径。
export const POLICY_FOCUS = {
  storage: {
    key: 'storage',
    label: '储能',
    industryLabel: '储能产业',
    lexicons: ['storage'],
  },
  compute: {
    key: 'compute',
    label: '算力',
    industryLabel: '算力产业',
    lexicons: [],
  },
};

export const POLICY_INDUSTRIES = Object.values(POLICY_FOCUS).map((item) => item.industryLabel);

export function policyFocusFor(selectedIndustry = '') {
  return selectedIndustry === '算力产业' ? POLICY_FOCUS.compute : POLICY_FOCUS.storage;
}

const COMPUTE_PATTERN = new RegExp(
  COMPUTE_KEYWORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

/** 一份政策是否命中算力口径：关键词命中即计入，命中词原样返回便于复核。 */
export function computeHits(policy) {
  const text = `${policy?.title || ''}\n${policy?.content || policy?.summary || ''}`;
  const hits = COMPUTE_KEYWORDS.filter((word) => text.includes(word));
  if (!hits.length && COMPUTE_PATTERN.test(text)) return [COMPUTE_PATTERN.exec(text)[0]];
  return hits;
}

export function isComputePolicy(policy) {
  return computeHits(policy).length > 0;
}
