// 一级产业链与二级产业链分开维护。新数据优先使用显式的 industry / primaryIndustry
// 字段；历史集成电路主表没有该字段时，按现有项目范围回落到“集成电路”。
// 四条产业链都按当前链路顺序从高对比度色池取色，避免独立样本集内出现相近的浅色。
export const INDUSTRY_PALETTE = [
  {
    id: 'integrated-circuit',
    label: '集成电路',
    code: 'IC',
    aliases: ['集成电路', '集成电路产业链', '集成电路（一级）'],
    color: '#1769e0',
  },
  {
    id: 'power',
    label: '电力装备（含储能）',
    code: 'PE',
    aliases: ['电力装备（含储能）', '电力装备', '电力装备含储能'],
    color: '#ba7517',
  },
  {
    id: 'storage',
    label: '储能产业',
    code: 'ES',
    aliases: ['储能产业', '储能产业链', '储能'],
    color: '#0b6e8a',
  },
  {
    id: 'biomed',
    label: '生物医药',
    code: 'BM',
    aliases: ['生物医药', '生物医药产业链'],
    color: '#0f6e56',
  },
  {
    id: 'ai',
    label: '人工智能',
    code: 'AI',
    aliases: ['人工智能', '人工智能产业链'],
    color: '#534ab7',
  },
];

export const INDUSTRY_OPTIONS = INDUSTRY_PALETTE.map((industry) => industry.label);

export const CHAIN_COLOR_POOL = [
  '#0b63ce',
  '#007c72',
  '#c46a00',
  '#c23b37',
  '#6840c6',
  '#0b6e8a',
  '#5a6b7b',
];

const withChainColors = (groups) =>
  groups.map((group, index) => ({
    ...group,
    color: CHAIN_COLOR_POOL[index % CHAIN_COLOR_POOL.length],
  }));

// 二级产业链按一级链分组维护。CHAIN_PALETTE 保留为集成电路的默认调色板，
// 现有调用点无需改动；切换一级链时用 chainPaletteFor(industry) 取对应调色板。
// The six secondary chains and their tertiary chains are the display contract
// shared by the map, atlas and weekly report. Legacy labels stay as aliases
// during the data transition, but no longer appear as primary UI labels.
const IC_CHAIN_PALETTE = withChainColors([
  {
    id: 'materials',
    label: '集成电路材料',
    legendLabel: '集成电路材料',
    aliases: ['集成电路材料', '半导体材料', '材料'],
    atlas: {
      code: '01',
      side: 'top',
      note: '制造材料 · 封装材料',
      sectors: ['制造材料', '封装材料'],
    },
  },
  {
    id: 'equipment',
    label: '基础电路装备',
    legendLabel: '基础电路装备',
    aliases: ['基础电路装备', '半导体设备', '装备'],
    atlas: {
      code: '02',
      side: 'top',
      note: '前道 · 后道 · 零部件',
      sectors: ['前道设备（晶圆制造）', '后道设备（封装测试）', '零部件'],
    },
  },
  {
    id: 'design',
    label: '集成电路设计',
    legendLabel: '集成电路设计',
    aliases: ['集成电路设计', '芯片设计', '芯片设计与EDA', '芯片设计 / EDA', '设计'],
    atlas: {
      code: '03',
      side: 'top',
      note: '工具 · 数字 · 模拟',
      sectors: ['工具软件', '数字电路芯片', '模拟电路芯片', '数模混合电路芯片'],
    },
  },
  {
    id: 'manufacturing',
    label: '集成电路制造',
    legendLabel: '集成电路制造',
    aliases: ['集成电路制造', '晶圆制造', '制造'],
    atlas: {
      code: '04',
      side: 'bottom',
      note: '逻辑 · 存储 · 特色工艺',
      sectors: ['逻辑芯片制造', '存储器芯片制造', '其他特色工艺芯片制造'],
    },
  },
  {
    id: 'packaging',
    label: '集成电路封测',
    legendLabel: '集成电路封测',
    aliases: ['集成电路封测', '封装测试', '封测'],
    atlas: {
      code: '05',
      side: 'bottom',
      note: '测试 · 直插 · 先进封装',
      sectors: [
        '专业测试',
        '第一代直插式封装',
        '第二代表面贴装式封装',
        '第三代阵面阵列式封装',
        '第四代系统级封装与先导技术封装',
      ],
    },
  },
  {
    id: 'supporting',
    label: '集成电路配套',
    legendLabel: '集成电路配套',
    aliases: ['集成电路配套', '电子制造', 'PCB及电子制造', '其他配套'],
    atlas: {
      code: '06',
      side: 'bottom',
      note: '印制电路板 · 分立器件',
      sectors: ['印制电路板（PCB）', '分立器件（OSD）'],
    },
  },
]);

// 每条一级链各自持有一个「待研判」兜底分组，避免跨链共用同一个对象引用。
const pendingGroup = () => ({
  id: 'pending',
  label: '待研判',
  legendLabel: '待研判',
  color: '#8a99a8',
  aliases: ['待研判', '待分类', '其它', '待研判 / 其它'],
  atlas: { code: '—', side: 'bottom', note: '证据不足', sectors: [] },
});

// 电力装备（含储能）：源表行业分类拆分出的两条二级链。
const POWER_CHAIN_PALETTE = withChainColors([
  {
    id: 'power-use',
    label: '用电领域',
    legendLabel: '用电领域',
    aliases: ['用电领域'],
    atlas: {
      code: '01',
      side: 'top',
      note: '数据中心 · 充电桩 · 电机',
      sectors: ['数据中心', '充电桩', '电机'],
    },
  },
  {
    id: 'power-storage',
    label: '储能领域',
    legendLabel: '储能领域',
    aliases: ['储能领域'],
    atlas: {
      code: '02',
      side: 'bottom',
      note: '储能系统',
      sectors: ['储能系统（待细分）'],
    },
  },
]);

// 储能产业：7 个一级环节各成一条二级链，其下 24 个二级环节作为三级环节。
// 来源：储能产业链一二级节点框架（环节与上市企业入链v2.xlsx · Sheet1）。
// 顺序与上游附件一致：上游 → 中游 → 下游，共 7 列并排（与流程页同构）。
const STORAGE_CHAIN_PALETTE = withChainColors([
  {
    id: 'storage-materials',
    label: '资源与材料',
    legendLabel: '资源与材料',
    aliases: ['资源与材料'],
    atlas: {
      code: '01',
      side: 'top',
      note: '上游 · 矿产 · 主材辅材 · 回收',
      sectors: ['矿产资源与化工原料', '电池主材与辅材', '回收与循环利用'],
    },
  },
  {
    id: 'storage-electronics',
    label: '核心电子器件',
    legendLabel: '核心电子器件',
    aliases: ['核心电子器件'],
    atlas: {
      code: '02',
      side: 'top',
      note: '上游 · 电力电子与功率器件',
      sectors: ['关键电力电子与器件'],
    },
  },
  {
    id: 'storage-equipment',
    label: '核心装备',
    legendLabel: '核心装备',
    aliases: ['核心装备'],
    atlas: {
      code: '03',
      side: 'top',
      note: '上游 · 智造装备 · 长时储能 · 氢储',
      sectors: ['智能制造装备', '物理/长时储能装备', '氢储能装备'],
    },
  },
  {
    id: 'storage-testing',
    label: '检测认证与标准',
    legendLabel: '检测认证与标准',
    aliases: ['检测认证与标准'],
    atlas: {
      code: '04',
      side: 'top',
      note: '上游 · 并网检测 · 标准认证',
      sectors: ['检测认证与标准'],
    },
  },
  {
    id: 'storage-cell',
    label: '电池与核心部件',
    legendLabel: '电池与核心部件',
    aliases: ['电池与核心部件'],
    atlas: {
      code: '05',
      side: 'bottom',
      note: '中游 · 电芯 · PACK · BMS · EMS · PCS · 热管理',
      sectors: [
        '储能电池本体',
        '电池PACK与模组',
        '电池管理系统BMS',
        '能量管理系统 EMS',
        '储能变流器 PCS',
        '热管理与安全防护',
      ],
    },
  },
  {
    id: 'storage-integration',
    label: '系统集成与工程建设',
    legendLabel: '系统集成与工程建设',
    aliases: ['系统集成与工程建设'],
    atlas: {
      code: '06',
      side: 'bottom',
      note: '中游 · 集成 · EPC · 链主 · 三方集成',
      sectors: ['储能系统集成', 'EPC与建安', '集采链主/生态主导型', '第三方系统集成商'],
    },
  },
  {
    id: 'storage-application',
    label: '应用与运营',
    legendLabel: '应用与运营',
    aliases: ['应用与运营'],
    atlas: {
      code: '07',
      side: 'bottom',
      note: '下游 · 电源/电网/用户侧 · 运营服务',
      sectors: [
        '电源侧应用',
        '电网侧应用',
        '用户侧应用',
        '新场景与跨业态',
        '运营服务与电力市场',
        '检测认证与标准',
      ],
    },
  },
]);

// 生物医药：创新药 / 生物制造 / 医疗器械 / CXO。
const BIOMED_CHAIN_PALETTE = withChainColors([
  {
    id: 'biomed-innovative',
    label: '创新药',
    legendLabel: '创新药',
    aliases: ['创新药'],
    atlas: { code: '01', side: 'top', note: '创新药', sectors: [] },
  },
  {
    id: 'biomed-manufacturing',
    label: '生物制造',
    legendLabel: '生物制造',
    aliases: ['生物制造'],
    atlas: { code: '02', side: 'top', note: '生物制造', sectors: [] },
  },
  {
    id: 'biomed-device',
    label: '医疗器械',
    legendLabel: '医疗器械',
    aliases: ['医疗器械', '医疗器械(微创介入)', '医疗器械(高端影像)', '医疗器械(脑机接口)'],
    atlas: {
      code: '03',
      side: 'bottom',
      note: '微创介入 · 高端影像 · 脑机接口',
      sectors: ['微创介入', '高端影像', '脑机接口'],
    },
  },
  {
    id: 'biomed-cxo',
    label: 'CXO',
    legendLabel: 'CXO',
    aliases: ['CXO'],
    atlas: { code: '04', side: 'bottom', note: '医药外包服务', sectors: [] },
  },
]);

// 人工智能：按基础层→技术层→应用层归组，源表 11 个细分领域全部保留为三级。
const AI_CHAIN_PALETTE = withChainColors([
  {
    id: 'ai-infra',
    label: 'AI 算力基础设施',
    legendLabel: 'AI 算力基础设施',
    aliases: ['AI 算力基础设施', 'AI算力硬件', 'AI算力服务', 'AIDC投资运营'],
    atlas: {
      code: '01',
      side: 'top',
      note: '算力硬件 · 算力服务 · AIDC',
      sectors: ['AI算力硬件', 'AI算力服务', 'AIDC投资运营'],
    },
  },
  {
    id: 'ai-model',
    label: 'AI 技术与模型',
    legendLabel: 'AI 技术与模型',
    aliases: ['AI 技术与模型', '大模型', '基础算法', '通用技术'],
    atlas: {
      code: '02',
      side: 'top',
      note: '大模型 · 基础算法 · 通用技术',
      sectors: ['大模型', '基础算法', '通用技术'],
    },
  },
  {
    id: 'ai-application',
    label: 'AI 应用与终端',
    legendLabel: 'AI 应用与终端',
    aliases: [
      'AI 应用与终端',
      'AIGC与垂直应用模型',
      '具身智能',
      '智能制造',
      '智能驾驶',
      '智能终端',
    ],
    atlas: {
      code: '03',
      side: 'bottom',
      note: 'AIGC · 具身 · 智造 · 驾驶 · 终端',
      sectors: ['AIGC与垂直应用模型', '具身智能', '智能制造', '智能驾驶', '智能终端'],
    },
  },
]);

export const CHAIN_PALETTES = {
  'integrated-circuit': [...IC_CHAIN_PALETTE, pendingGroup()],
  power: [...POWER_CHAIN_PALETTE, pendingGroup()],
  storage: [...STORAGE_CHAIN_PALETTE, pendingGroup()],
  biomed: [...BIOMED_CHAIN_PALETTE, pendingGroup()],
  ai: [...AI_CHAIN_PALETTE, pendingGroup()],
};

// 向后兼容：默认集成电路调色板，既有调用点继续工作。
export const CHAIN_PALETTE = CHAIN_PALETTES['integrated-circuit'];

// 地图样式一次性包含所有一级链的配色，切换一级链时只换数据源、不重建样式。
// 各一级链的二级链 id 互不冲突（仅共用同一个「待研判」兜底 id），合并后不会串色。
export const ALL_CHAIN_COLOR_STOPS = Array.from(
  new Map(
    Object.values(CHAIN_PALETTES)
      .flat()
      .map((group) => [group.id, group.color]),
  ),
).flat();

const INDUSTRY_ALIAS_MAP = new Map(
  INDUSTRY_PALETTE.flatMap((industry) => industry.aliases.map((alias) => [alias, industry.id])),
);

const compactKey = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’]/g, '')
    .toLowerCase();

export function industryGroupFor(industry) {
  const key = compactKey(industry);
  return INDUSTRY_ALIAS_MAP.get(key) || key || INDUSTRY_PALETTE[0].id;
}

export function industryForCompany(company) {
  return (
    company?.industry ||
    company?.primaryIndustry ||
    company?.industryLevel1 ||
    INDUSTRY_PALETTE[0].label
  );
}

export function industryLabelFor(industry) {
  const group = INDUSTRY_PALETTE.find((item) => item.id === industryGroupFor(industry));
  return group?.label || String(industry || INDUSTRY_PALETTE[0].label);
}

export function chainPaletteFor(industry) {
  return CHAIN_PALETTES[industryGroupFor(industry)] || CHAIN_PALETTE;
}

// 按一级链缓存别名与分组映射，避免每次渲染重建 Map。
const aliasCache = new Map();
const groupCache = new Map();

const aliasMapFor = (industry) => {
  const id = industryGroupFor(industry);
  if (!aliasCache.has(id)) {
    aliasCache.set(
      id,
      new Map(
        chainPaletteFor(industry).flatMap((group) =>
          group.aliases.map((alias) => [alias, group.id]),
        ),
      ),
    );
  }
  return aliasCache.get(id);
};

const groupMapFor = (industry) => {
  const id = industryGroupFor(industry);
  if (!groupCache.has(id)) {
    groupCache.set(id, new Map(chainPaletteFor(industry).map((group) => [group.id, group])));
  }
  return groupCache.get(id);
};

// 以下三个函数都接受可选的一级链参数。不传时回落集成电路，
// 保持既有调用点行为不变；传入后按该一级链的调色板解析。
export function chainGroupFor(chain, industry) {
  return aliasMapFor(industry).get(String(chain || '').trim()) || 'pending';
}

export function chainLabelFor(chain, industry) {
  const group = groupMapFor(industry).get(chainGroupFor(chain, industry));
  return group?.legendLabel || group?.label || String(chain || '待研判');
}

export function chainColorFor(chain, industry) {
  const group = groupMapFor(industry).get(chainGroupFor(chain, industry));
  return group?.color || '#8a99a8';
}
