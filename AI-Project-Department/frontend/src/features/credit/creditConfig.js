// 储能产业链智能授信系统 · 共享配置。
// 该模块同时被数据准备脚本（scripts/prepare-credit-mock.mjs）与前端评价引擎引用，
// 必须保持纯 ESM、无浏览器 / Node 专属 API。
// 评价模型与业务规则来源：《储能产业链智能授信系统 AI 开发提示词》。

// ============================================================================
// 储能行业企业 AI 评价模型 V2.0（三层评价架构）
//   第一层 通用企业评价底座：基本情况与治理、经营质量、财务偿债、交易真实性、
//          信用记录、投融资经历、数据质量与证据可信度；
//   第二层 储能行业专属评价：技术路线与成熟度、安全可靠性、循环寿命与效率、
//          认证测试与运行验证、产能利用率与成本、项目运行与收益机制、
//          并网调度交付运维、全生命周期责任、集群与上下游协同、行业性风险；
//   第三层 企业类型 + 发展阶段动态配置：先识别主营业务类型与发展阶段，
//          再自动加载适用的权重模板、指标与阈值（不得一套阈值机械套用所有企业）。
// 下列权重为「首版规则配置」，须支持调整，并经历史样本与业务专家评审校准。
// ============================================================================

// 八个一级维度（总分 100）。
export const DIMENSION_META = [
  { key: 'chain', name: '产业链地位与市场需求', short: '产业链地位' },
  { key: 'cluster', name: '产业集群与区域生态', short: '产业集群' },
  { key: 'technology', name: '技术与产品竞争力', short: '技术竞争力' },
  { key: 'operation', name: '经营质量与商业化能力', short: '经营质量' },
  { key: 'financial', name: '财务与偿债能力', short: '财务偿债' },
  { key: 'trade', name: '产业链交易与客户质量', short: '交易与客户' },
  { key: 'capital', name: '投融资经历与资本验证', short: '资本验证' },
  { key: 'governance', name: '公司治理与信用记录', short: '治理信用' },
];

export const DIMENSION_KEYS = DIMENSION_META.map((item) => item.key);

// 五类企业：先按主营业务归入 A/B/D/E，处于早期阶段的企业按第三层规则以 C 类为主类型。
export const COMPANY_GROUPS = [
  {
    key: 'A',
    label: 'A类 · 核心器件与材料制造',
    short: '器件与材料',
    focus:
      '电池技术路线与产品性能、循环寿命与效率衰减、产品安全质量、产能利用率与制造成本、客户认证与批量交付、原材料价格与供应链、订单应收存货、资本开支与产能过剩风险',
    types: ['cell', 'pack', 'materials', 'recycling', 'equipment', 'thermal'],
  },
  {
    key: 'B',
    label: 'B类 · 核心设备与系统',
    short: '核心设备',
    focus:
      '功率变换与控制算法、产品兼容性与可靠性、并网适配与测试认证、系统协同能力、核心客户验证与批量交付、售后与产品责任、技术迭代替代风险、研发转化能力',
    types: ['pcs', 'bms', 'ems', 'device', 'testing'],
  },
  {
    key: 'C',
    label: 'C类 · 科技创新型',
    short: '科技创新',
    focus:
      '核心技术壁垒、技术成熟度与验证结果、知识产权可持续性、产业化可行性、中试样机与客户验证进展、商业化能力、研发团队稳定性、研发资金来源、现金消耗与可支撑时间、外部融资与里程碑完成度',
    types: [],
  },
  {
    key: 'D',
    label: 'D类 · 系统集成与工程建设',
    short: '集成与EPC',
    focus:
      '系统集成与设备选型能力、系统效率与安全设计、工程交付与履约、项目毛利与成本控制、订单真实性与客户付款能力、应收与合同资产质量、质保运维与赔偿责任、项目周期与营运资金、核心供应商与客户集中度',
    types: ['integrator', 'epc', 'chainLeader'],
  },
  {
    key: 'E',
    label: 'E类 · 项目投资与运营服务',
    short: '投资与运营',
    focus:
      '备案建设并网与运营状态、所在地电力市场规则、收益来源明确性与稳定性、实际调用与等效利用小时、容量电价/辅助服务/电能量收入构成、结算与回款、投资成本与建设进度、设备衰减与运维更换、项目现金流与债务期限、股东资金安排、敏感性分析',
    types: ['operator', 'cni', 'service'],
  },
];

export const GROUP_BY_TYPE = COMPANY_GROUPS.reduce((acc, group) => {
  for (const type of group.types) acc[type] = group.key;
  return acc;
}, {});

export const GROUP_META = COMPANY_GROUPS.reduce((acc, group) => {
  acc[group.key] = group;
  return acc;
}, {});

// 八个一级维度 × 五类企业权重（每类合计严格等于 100）。
export const DIMENSION_WEIGHTS = {
  A: {
    chain: 10,
    cluster: 8,
    technology: 15,
    operation: 12,
    financial: 20,
    trade: 12,
    capital: 5,
    governance: 18,
  },
  B: {
    chain: 10,
    cluster: 8,
    technology: 20,
    operation: 12,
    financial: 18,
    trade: 12,
    capital: 5,
    governance: 15,
  },
  C: {
    chain: 8,
    cluster: 6,
    technology: 25,
    operation: 10,
    financial: 10,
    trade: 10,
    capital: 12,
    governance: 19,
  },
  D: {
    chain: 8,
    cluster: 8,
    technology: 10,
    operation: 12,
    financial: 20,
    trade: 15,
    capital: 5,
    governance: 22,
  },
  E: {
    chain: 8,
    cluster: 8,
    technology: 8,
    operation: 10,
    financial: 25,
    trade: 10,
    capital: 8,
    governance: 23,
  },
};

// 二级指标：ratio 为该指标占所属一级维度的比例（每个维度合计 1）。
// 维度内子项满分为「该维度权重 × ratio」，因此同一套指标可适配五类企业的不同权重。
export const SUB_INDICATORS = {
  chain: [
    {
      key: 'importance',
      name: '产业链环节重要性',
      ratio: 0.25,
      def: '企业在储能产业链中所处环节的关键程度与不可替代性',
    },
    {
      key: 'demand',
      name: '细分市场需求稳定性',
      ratio: 0.2,
      def: '所属细分市场的需求确定性与波动特征',
    },
    {
      key: 'competition',
      name: '细分市场竞争格局',
      ratio: 0.15,
      def: '竞争强度、价格战程度与格局稳定性',
    },
    {
      key: 'stickiness',
      name: '客户黏性与替代难度',
      ratio: 0.15,
      def: '客户切换成本、验证周期与替代难度',
    },
    {
      key: 'barrier',
      name: '关键产品或服务重要性',
      ratio: 0.15,
      def: '产品/服务对下游系统的关键性',
    },
    {
      key: 'policy',
      name: '政策与市场规则影响',
      ratio: 0.1,
      def: '政策、电力市场与技术路线变化对业务的影响（含正向支持力度）',
    },
  ],
  cluster: [
    {
      key: 'clusterMaturity',
      name: '产业集群成熟度与竞争力',
      ratio: 0.2,
      def: '所在集群的完整度、规模与全国竞争力',
    },
    {
      key: 'actualLinkage',
      name: '企业与集群的实际关联深度',
      ratio: 0.2,
      def: '区分「注册地在集群」与「实际生产/运营在集群」',
    },
    {
      key: 'upstreamDownstream',
      name: '上下游协同与真实交易关系',
      ratio: 0.15,
      def: '与集群内企业是否存在可验证的真实业务往来',
    },
    {
      key: 'keyPosition',
      name: '集群内关键地位',
      ratio: 0.15,
      def: '是否具备关键供应、技术或客户地位（非仅园区注册）',
    },
    {
      key: 'facilities',
      name: '园区与配套条件',
      ratio: 0.1,
      def: '园区、物流、人才、检测认证等配套完善度',
    },
    {
      key: 'regionalPolicy',
      name: '区域政策与能源条件',
      ratio: 0.1,
      def: '地方政策稳定性、基础设施与能源要素条件',
    },
    {
      key: 'homogeneityRisk',
      name: '集群风险传导与同质化',
      ratio: 0.1,
      def: '单一核心企业依赖、产能同质化与共同风险（得分越高风险越低）',
    },
  ],
  technology: [
    {
      key: 'maturity',
      name: '技术成熟度与验证结果',
      ratio: 0.2,
      def: '核心技术是否完成验证并有可靠测试证据',
    },
    {
      key: 'barrier',
      name: '核心技术壁垒',
      ratio: 0.2,
      def: '专利、工艺 know-how、算法与工程化门槛',
    },
    {
      key: 'certification',
      name: '认证与测试验证',
      ratio: 0.1333,
      def: 'CQC/UL/IEC/并网检测等认证与第三方测试结果',
    },
    {
      key: 'reliability',
      name: '产品安全性与可靠性',
      ratio: 0.1333,
      def: '安全设计、故障率与实际运行表现',
    },
    {
      key: 'iterationRisk',
      name: '技术迭代与替代风险',
      ratio: 0.2,
      def: '路线更替、产品代际落后与被替代风险（得分越高风险越低）',
    },
    {
      key: 'research',
      name: '研发能力与成果转化',
      ratio: 0.1334,
      def: '研发投入能否转化为收入与利润（不以投入比例单一判定）',
    },
  ],
  operation: [
    { key: 'revenueScale', name: '收入规模与稳定性', ratio: 0.12, def: '营业收入规模与近年稳定性' },
    {
      key: 'profitability',
      name: '盈利质量',
      ratio: 0.16,
      def: '毛利率与净利率水平及其质量（含补助依赖度）',
    },
    {
      key: 'cashflow',
      name: '经营现金流',
      ratio: 0.2,
      def: '经营现金流水平与利润的匹配度（权重高于净利润，识别利润增长但现金流承压）',
    },
    { key: 'customerQuality', name: '客户质量', ratio: 0.16, def: '下游客户的信用与付款能力' },
    {
      key: 'concentration',
      name: '客户集中度',
      ratio: 0.12,
      def: 'Top1/前五大客户占比（得分越高集中度越低）',
    },
    { key: 'orders', name: '在手订单与合同', ratio: 0.12, def: '订单/合同覆盖倍数与真实性' },
    {
      key: 'utilization',
      name: '产能利用率或运营效率',
      ratio: 0.12,
      def: '制造企业看产能利用率，项目运营企业看可用率与等效利用小时完成率',
    },
  ],
  financial: [
    { key: 'debtRatio', name: '资产负债率', ratio: 0.12, def: '总负债 / 总资产' },
    { key: 'interestDebtRatio', name: '有息负债率', ratio: 0.12, def: '有息负债 / 总负债' },
    {
      key: 'interestCoverage',
      name: 'EBITDA 利息保障倍数',
      ratio: 0.12,
      def: 'EBITDA / 利息支出；研发早期企业无稳定 EBITDA 时按现金余额与消耗速度补充分析',
    },
    {
      key: 'ocfDebtCoverage',
      name: '经营现金流 / 有息负债',
      ratio: 0.16,
      def: '现金流对有息负债的覆盖能力',
    },
    { key: 'liquidity', name: '流动比率与速动比率', ratio: 0.08, def: '短期流动性' },
    { key: 'arQuality', name: '应收账款质量', ratio: 0.12, def: '应收/营收比例、账龄与回款质量' },
    { key: 'inventoryQuality', name: '存货质量', ratio: 0.12, def: '存货/营收比例与跌价风险' },
    {
      key: 'shortDebtPressure',
      name: '短期债务压力',
      ratio: 0.08,
      def: '短期有息负债 /（货币资金 + 经营现金流）',
    },
    {
      key: 'guarantees',
      name: '对外担保与或有负债',
      ratio: 0.08,
      def: '对外担保/总资产及或有负债',
    },
  ],
  trade: [
    {
      key: 'supplierStability',
      name: '上游供应商稳定性',
      ratio: 0.2,
      def: '关键原材料/器件供应保障与议价能力',
    },
    {
      key: 'downstreamQuality',
      name: '下游客户质量',
      ratio: 0.3,
      def: '电网体系、央国企能源集团等高信用客户占比',
    },
    {
      key: 'arAuthenticity',
      name: '应收账款真实性',
      ratio: 0.2,
      def: '应收可核验程度（票据、确权、发票与流水交叉验证）',
    },
    { key: 'orderAuthenticity', name: '订单真实性', ratio: 0.2, def: '订单可核验程度与履约进展' },
    {
      key: 'chainDependence',
      name: '产业链依赖程度',
      ratio: 0.1,
      def: '对单一链条/单一链主的依赖（得分越高依赖越低）',
    },
  ],
  capital: [
    {
      key: 'equityCompleted',
      name: '已完成股权或战略融资',
      ratio: 0.2,
      def: '是否完成股权/战略投资（无外部股权融资不自动扣满该维度）',
    },
    {
      key: 'investorQuality',
      name: '投资方类型与尽调可信度',
      ratio: 0.15,
      def: '投资方是否经过专业尽调（不得将知名度直接等同于信用质量）',
    },
    {
      key: 'fundEvidence',
      name: '融资完成与到账证据',
      ratio: 0.15,
      def: '工商变更、公告、验资等可核验证据（区分股权、战投、贷款、租赁、保理、补助与融资意向）',
    },
    {
      key: 'stageMatch',
      name: '融资阶段与发展阶段匹配度',
      ratio: 0.15,
      def: '融资轮次与企业实际发展阶段是否匹配',
    },
    {
      key: 'postFinancingPerf',
      name: '融资后经营表现',
      ratio: 0.15,
      def: '融资后收入、订单、里程碑与现金流改善情况',
    },
    {
      key: 'structureRisk',
      name: '融资结构与潜在风险',
      ratio: 0.2,
      def: '对赌、回购、明股实债、期限错配等结构风险（得分越高风险越低）',
    },
  ],
  governance: [
    {
      key: 'controller',
      name: '股权与实际控制人稳定性',
      ratio: 0.2,
      def: '实控人变更、股权质押与稳定性',
    },
    {
      key: 'creditRecord',
      name: '历史信用与债务履约',
      ratio: 0.2,
      def: '征信记录、银行合作历史与债务履约情况',
    },
    {
      key: 'litigation',
      name: '重大诉讼、执行与处罚',
      ratio: 0.2,
      def: '经主体匹配与时点核实的诉讼、执行与处罚记录',
    },
    {
      key: 'externalGuarantee',
      name: '对外担保与关联方资金占用',
      ratio: 0.2,
      def: '对外担保规模与关联方资金占用情况',
    },
    {
      key: 'relatedTransaction',
      name: '合规经营与信息透明度',
      ratio: 0.2,
      def: '关联交易规范性、信息披露与合规经营',
    },
  ],
};

// 指标适用性：不同细分企业不应被要求提供全部相同指标；未适用指标从分值中显式剔除并记录。
export const ITEM_APPLICABILITY = {
  'operation.orders': ['A', 'B', 'D'],
  'operation.utilization': ['A', 'B', 'D', 'E'],
  'financial.inventoryQuality': ['A', 'B', 'D'],
  'trade.supplierStability': ['A', 'B', 'D', 'E'],
};

export const isItemApplicable = (dimKey, itemKey, groupKey) => {
  const scope = ITEM_APPLICABILITY[`${dimKey}.${itemKey}`];
  if (!scope) return true;
  return scope.includes(groupKey);
};

// 企业发展阶段（至少识别六档）。仅用于选择指标解释与阈值，不得据以豁免重大信用风险。
export const STAGES = [
  { key: 'early_rnd', label: '研发早期', note: '以研发投入为主，无样机或仅有实验室结果' },
  { key: 'pilot', label: '样机或中试阶段', note: '已有样机/中试线，关键性能处于验证中' },
  { key: 'demonstration', label: '示范应用阶段', note: '已有示范项目或客户测试，尚未批量交付' },
  { key: 'early_commercial', label: '初步商业化阶段', note: '已形成收入与少量批量交付，规模尚小' },
  { key: 'scale', label: '规模化经营阶段', note: '收入与交付规模稳定，进入规模经营' },
  { key: 'mature', label: '成熟运营阶段', note: '经营与现金流稳定，进入成熟期' },
];

export const STAGE_META = STAGES.reduce((acc, stage) => {
  acc[stage.key] = stage;
  return acc;
}, {});

// 发展阶段判定：不得仅依据成立年限或融资轮次，应结合收入、交付、上市与运营记录。
export function deriveStage({ revenue = 0, listed = false, metrics = {} } = {}) {
  const r = Number(revenue) || 0;
  const hasProjects = Boolean(metrics.operatorExtra || metrics.cniExtra);
  const delivered = (metrics.orders || 0) > 0 && (metrics.capacityUtilization ?? 0) > 0;
  if (!listed && r < 2e7 && !delivered && !hasProjects) return r < 5e6 ? 'early_rnd' : 'pilot';
  if (!listed && r < 1.2e8) return delivered || hasProjects ? 'demonstration' : 'pilot';
  if (r < 6e8) return 'early_commercial';
  if (r < 5e9 || !listed) return 'scale';
  return 'mature';
}

// 早期阶段（研发早期 / 样机中试，及收入很小的示范应用）企业以 C 类为主类型评价。
export const EARLY_STAGE_GROUP = ['early_rnd', 'pilot'];

// 经营价值评价与信用（融资适配）评价的维度构成，二者必须独立输出。
export const VALUE_COMPOSITION = [
  { key: 'chain', weight: 0.2 },
  { key: 'cluster', weight: 0.12 },
  { key: 'technology', weight: 0.28 },
  { key: 'operation', weight: 0.25 },
  { key: 'capital', weight: 0.15 },
];

export const CREDIT_COMPOSITION = [
  { key: 'financial', weight: 0.5 },
  { key: 'trade', weight: 0.2 },
  { key: 'governance', weight: 0.3 },
];

// 经营价值优先级：回答企业是否值得银行优先关注与建立联系。
export const VALUE_LEVELS = [
  {
    min: 80,
    key: 'A',
    label: '优先关注',
    note: '建议纳入重点经营对象，主动建立联系并寻找合作机会',
  },
  { min: 65, key: 'B', label: '持续跟踪', note: '保持跟踪，结合订单与产能变化择机推进' },
  { min: 50, key: 'C', label: '观察培育', note: '以观察为主，先补齐资料与验证关键信息' },
  { min: 0, key: 'D', label: '暂缓接触', note: '暂不投入经营资源，待经营或技术出现实质改善' },
];

// 信用与融资适配结论：回答当前存在哪些风险、需补充哪些资料、哪些业务需进一步审查。
export const CREDIT_LEVELS = [
  {
    min: 80,
    key: 'pass',
    label: '可准入',
    note: '常规业务可推进，仍需按单项业务落实还款来源与担保条件',
  },
  { min: 65, key: 'limit', label: '需增信/限额', note: '建议限额内使用并落实增信措施' },
  { min: 50, key: 'review', label: '逐笔审查', note: '逐笔审核资金用途与还款来源，控制新增敞口' },
  { min: 0, key: 'hold', label: '暂缓授信', note: '暂缓新增，存量到期逐步压降并加强贷后' },
];

// 评分 → 内部评级 → 客户层级（提示词第十一、二章）。
export const GRADE_RULES = [
  { min: 90, grade: 'S', gradeLabel: 'S级 · 战略核心客户', tier: 1 },
  { min: 80, grade: 'A', gradeLabel: 'A级 · 重点支持客户', tier: 1 },
  { min: 70, grade: 'B', gradeLabel: 'B级 · 条件支持客户', tier: 2 },
  { min: 60, grade: 'C+', gradeLabel: 'C+级 · 边界客户', tier: 2 },
  { min: 0, grade: 'C', gradeLabel: 'C级 · 审慎客户', tier: 3 },
];

export const TIER_META = {
  1: {
    label: '第一层',
    name: '重点支持类',
    tags: ['重点支持', '高信用质量', '产业链核心', '现金流稳定', '可提供综合授信'],
    color: '#168d69',
    strategy: '综合授信',
  },
  2: {
    label: '第二层',
    name: '条件支持类',
    tags: ['条件支持', '限额授信', '加强贷后', '需要增信', '关注现金流'],
    color: '#ed861d',
    strategy: '限额授信 + 条件管理',
  },
  3: {
    label: '第三层',
    name: '严格准入类',
    tags: ['严格准入', '逐笔审核', '控制新增', '强化增信', '重点关注'],
    color: '#c23b37',
    strategy: '逐笔报审 + 强化增信',
  },
};

// 节点（三级环节）→ 企业类型。来源：全量客户清单.xlsx · 节点关系表。
// 末尾 19 项为算力产业环节，类型复用同一套企业画像（芯片/器件→device、制造辅材→materials、
// 整机与网络设备→equipment、温控→thermal、IDC 与运营→operator、工程→epc、云与运维→service）。
export const SECTOR_TYPE = {
  矿产资源与化工原料: 'materials',
  电池主材与辅材: 'materials',
  回收与循环利用: 'recycling',
  关键电力电子与器件: 'device',
  智能制造装备: 'equipment',
  '物理/长时储能装备': 'equipment',
  氢储能装备: 'equipment',
  检测认证与标准: 'testing',
  储能电池本体: 'cell',
  电池PACK与模组: 'pack',
  电池管理系统BMS: 'bms',
  '能量管理系统 EMS': 'ems',
  能量管理系统: 'ems',
  '储能变流器 PCS': 'pcs',
  储能变流器: 'pcs',
  热管理与安全防护: 'thermal',
  储能系统集成: 'integrator',
  EPC与建安: 'epc',
  '集采链主/生态主导型': 'chainLeader',
  第三方系统集成商: 'integrator',
  电源侧应用: 'operator',
  电网侧应用: 'operator',
  用户侧应用: 'cni',
  新场景与跨业态: 'service',
  运营服务与电力市场: 'service',
  // ---- 算力产业（4 个一级环节 / 19 个二级环节）----
  AI芯片与加速卡: 'device',
  存储与内存接口: 'device',
  先进封装与测试: 'device',
  光芯片与光器件: 'device',
  PCB与覆铜板: 'materials',
  电源与供配电: 'materials',
  AI服务器整机: 'equipment',
  液冷温控: 'thermal',
  交换机与网络设备: 'equipment',
  光模块与CPO: 'device',
  高速连接与铜缆: 'materials',
  光纤光缆: 'materials',
  IDC与智算中心: 'operator',
  机房建设与集成: 'epc',
  机房建设与系统集成: 'epc',
  运营商算力网络: 'operator',
  算力租赁与运营: 'service',
  云计算与算力调度: 'service',
  数据中心运维: 'service',
  算力需求方: 'service',
  '算力需求方/应用': 'service',
  // ---- 集成电路（7 个一级环节 / 18 个二级环节）----
  // 设计四类 + 分立器件走器件画像；材料 / PCB 走上游材料；前道后道设备与零部件走核心装备；
  // 晶圆制造走重资产制造画像（电芯企业 = 重资产制造商）；封测走专业测试 / 封装画像。
  数字电路芯片: 'device',
  模拟电路芯片: 'device',
  数模混合电路芯片: 'device',
  工具软件: 'device',
  '分立器件（OSD）': 'device',
  制造材料: 'materials',
  封装材料: 'materials',
  '印制电路板（PCB）': 'materials',
  '前道设备（晶圆制造）': 'equipment',
  '后道设备（封装测试）': 'equipment',
  零部件: 'equipment',
  逻辑芯片制造: 'cell',
  其他特色工艺芯片制造: 'cell',
  存储器芯片制造: 'cell',
  专业测试: 'testing',
  第四代系统级封装与先导技术封装: 'pack',
  第三代阵面阵列式封装: 'pack',
  待研判: 'service',
};

export const SEGMENT_BY_CHAIN = {
  资源与材料: '上游',
  核心电子器件: '上游',
  核心装备: '上游',
  检测认证与标准: '上游',
  电池与核心部件: '中游',
  系统集成与工程建设: '中游',
  应用与运营: '下游',
  算力芯片与核心器件: '上游',
  算力设备与网络: '中游',
  算力基础设施: '下游',
  算力服务与运营: '下游',
  算力需求方: '下游',
  // ---- 集成电路：上游（材料 / 装备）· 中游（设计 / 制造 / 封测）· 下游（配套 / 待研判）----
  集成电路材料: '上游',
  基础电路装备: '上游',
  集成电路设计: '中游',
  集成电路制造: '中游',
  集成电路封测: '中游',
  集成电路配套: '下游',
  待研判: '下游',
};

// 企业类型画像：评分基准 + 模拟数据取值区间（金额单位：元）。
// model 决定评价模型分支：manufacturer 制造 / project 项目型 / operator 独立储能 / cni 工商业储能 / service 服务。
export const TYPE_PROFILE = {
  materials: {
    label: '上游材料',
    model: 'manufacturer',
    importance: 4,
    demand: 4,
    competition: 2,
    policy: 4,
    margin: [0.1, 0.32],
    arRatio: [0.12, 0.32],
    invRatio: [0.12, 0.3],
    assetHeavy: [0.8, 1.8],
    utilRange: [0.5, 0.92],
    growth: [-0.2, 0.4],
    baseMultiple: [0.22, 0.35],
    industryCoef: 0.85,
  },
  recycling: {
    label: '回收与循环利用',
    model: 'manufacturer',
    importance: 3,
    demand: 4,
    competition: 2,
    policy: 5,
    margin: [0.08, 0.26],
    arRatio: [0.1, 0.28],
    invRatio: [0.1, 0.26],
    assetHeavy: [0.7, 1.6],
    utilRange: [0.45, 0.9],
    growth: [-0.1, 0.45],
    baseMultiple: [0.2, 0.32],
    industryCoef: 0.9,
  },
  device: {
    label: '核心器件',
    model: 'manufacturer',
    importance: 5,
    demand: 4,
    competition: 3,
    policy: 3,
    margin: [0.18, 0.45],
    arRatio: [0.12, 0.3],
    invRatio: [0.08, 0.22],
    assetHeavy: [0.6, 1.4],
    utilRange: [0.55, 0.95],
    growth: [-0.1, 0.4],
    baseMultiple: [0.25, 0.4],
    industryCoef: 0.95,
  },
  equipment: {
    label: '核心装备',
    model: 'manufacturer',
    importance: 4,
    demand: 4,
    competition: 3,
    policy: 4,
    margin: [0.15, 0.4],
    arRatio: [0.2, 0.45],
    invRatio: [0.12, 0.3],
    assetHeavy: [0.6, 1.5],
    utilRange: [0.5, 0.92],
    growth: [-0.12, 0.45],
    baseMultiple: [0.22, 0.36],
    industryCoef: 0.9,
  },
  testing: {
    label: '检测认证',
    model: 'service',
    importance: 3,
    demand: 5,
    competition: 4,
    policy: 4,
    margin: [0.28, 0.58],
    arRatio: [0.15, 0.35],
    invRatio: [0.02, 0.08],
    assetHeavy: [0.5, 1.1],
    utilRange: [0.6, 0.95],
    growth: [0.0, 0.35],
    baseMultiple: [0.25, 0.4],
    industryCoef: 1.0,
  },
  cell: {
    label: '电芯企业',
    model: 'manufacturer',
    importance: 5,
    demand: 4,
    competition: 1,
    policy: 4,
    margin: [0.07, 0.24],
    arRatio: [0.15, 0.38],
    invRatio: [0.15, 0.36],
    assetHeavy: [1.0, 2.0],
    utilRange: [0.35, 0.95],
    growth: [-0.25, 0.5],
    baseMultiple: [0.28, 0.45],
    industryCoef: 0.8,
  },
  pack: {
    label: 'PACK 与模组',
    model: 'manufacturer',
    importance: 4,
    demand: 4,
    competition: 2,
    policy: 4,
    margin: [0.08, 0.22],
    arRatio: [0.18, 0.4],
    invRatio: [0.14, 0.32],
    assetHeavy: [0.7, 1.5],
    utilRange: [0.4, 0.92],
    growth: [-0.2, 0.45],
    baseMultiple: [0.24, 0.38],
    industryCoef: 0.85,
  },
  bms: {
    label: 'BMS',
    model: 'manufacturer',
    importance: 4,
    demand: 4,
    competition: 3,
    policy: 4,
    margin: [0.18, 0.42],
    arRatio: [0.15, 0.35],
    invRatio: [0.08, 0.2],
    assetHeavy: [0.5, 1.2],
    utilRange: [0.5, 0.95],
    growth: [-0.1, 0.45],
    baseMultiple: [0.24, 0.38],
    industryCoef: 0.9,
  },
  ems: {
    label: 'EMS',
    model: 'manufacturer',
    importance: 4,
    demand: 4,
    competition: 3,
    policy: 4,
    margin: [0.2, 0.45],
    arRatio: [0.15, 0.35],
    invRatio: [0.05, 0.16],
    assetHeavy: [0.5, 1.1],
    utilRange: [0.55, 0.95],
    growth: [-0.05, 0.45],
    baseMultiple: [0.24, 0.38],
    industryCoef: 0.9,
  },
  pcs: {
    label: 'PCS',
    model: 'manufacturer',
    importance: 5,
    demand: 4,
    competition: 2,
    policy: 4,
    margin: [0.16, 0.4],
    arRatio: [0.15, 0.36],
    invRatio: [0.1, 0.24],
    assetHeavy: [0.6, 1.4],
    utilRange: [0.45, 0.95],
    growth: [-0.12, 0.5],
    baseMultiple: [0.26, 0.42],
    industryCoef: 0.9,
  },
  thermal: {
    label: '热管理与安全',
    model: 'manufacturer',
    importance: 3,
    demand: 4,
    competition: 3,
    policy: 3,
    margin: [0.15, 0.38],
    arRatio: [0.15, 0.36],
    invRatio: [0.08, 0.22],
    assetHeavy: [0.5, 1.2],
    utilRange: [0.5, 0.95],
    growth: [-0.08, 0.45],
    baseMultiple: [0.22, 0.36],
    industryCoef: 0.9,
  },
  integrator: {
    label: '系统集成',
    model: 'project',
    importance: 4,
    demand: 5,
    competition: 2,
    policy: 4,
    margin: [0.06, 0.18],
    arRatio: [0.25, 0.55],
    invRatio: [0.05, 0.18],
    assetHeavy: [0.5, 1.3],
    utilRange: [0.55, 0.95],
    growth: [-0.15, 0.5],
    baseMultiple: [0.14, 0.24],
    industryCoef: 0.85,
  },
  epc: {
    label: 'EPC 与建安',
    model: 'project',
    importance: 3,
    demand: 5,
    competition: 2,
    policy: 4,
    margin: [0.05, 0.15],
    arRatio: [0.3, 0.6],
    invRatio: [0.04, 0.14],
    assetHeavy: [0.4, 1.1],
    utilRange: [0.55, 0.95],
    growth: [-0.18, 0.5],
    baseMultiple: [0.12, 0.22],
    industryCoef: 0.8,
  },
  chainLeader: {
    label: '集采链主',
    model: 'project',
    importance: 5,
    demand: 5,
    competition: 3,
    policy: 4,
    margin: [0.06, 0.18],
    arRatio: [0.2, 0.45],
    invRatio: [0.05, 0.16],
    assetHeavy: [0.6, 1.5],
    utilRange: [0.55, 0.95],
    growth: [-0.1, 0.5],
    baseMultiple: [0.2, 0.32],
    industryCoef: 0.95,
  },
  operator: {
    label: '独立储能运营商',
    model: 'operator',
    importance: 4,
    demand: 4,
    competition: 3,
    policy: 5,
    margin: [0.25, 0.55],
    arRatio: [0.1, 0.3],
    invRatio: [0.01, 0.05],
    assetHeavy: [2.2, 4.5],
    utilRange: [0.4, 0.85],
    growth: [-0.1, 0.4],
    baseMultiple: [0.4, 0.65],
    industryCoef: 0.85,
  },
  cni: {
    label: '工商业储能',
    model: 'cni',
    importance: 3,
    demand: 4,
    competition: 2,
    policy: 4,
    margin: [0.12, 0.32],
    arRatio: [0.12, 0.32],
    invRatio: [0.05, 0.15],
    assetHeavy: [1.2, 2.6],
    utilRange: [0.35, 0.85],
    growth: [-0.1, 0.5],
    baseMultiple: [0.25, 0.4],
    industryCoef: 0.85,
  },
  service: {
    label: '运营与跨界服务',
    model: 'service',
    importance: 3,
    demand: 3,
    competition: 2,
    policy: 3,
    margin: [0.18, 0.45],
    arRatio: [0.15, 0.4],
    invRatio: [0.02, 0.08],
    assetHeavy: [0.4, 1.0],
    utilRange: [0.55, 0.95],
    growth: [-0.15, 0.45],
    baseMultiple: [0.2, 0.32],
    industryCoef: 0.9,
  },
};

// 授信策略矩阵（提示词第二十二章）：按企业类型推荐产品与关注风险。
export const STRATEGY_BY_TYPE = {
  cell: {
    products: ['流动资金贷款', '供应链金融', '设备融资', '应收账款融资'],
    risks: ['原材料价格波动', '产能扩张过快', '应收账款增长', '库存积压'],
  },
  pack: {
    products: ['流动资金贷款', '供应链金融', '应收账款融资'],
    risks: ['原材料价格波动', '客户集中', '应收账款增长'],
  },
  bms: {
    products: ['流动资金贷款', '供应链金融', '订单融资'],
    risks: ['技术迭代', '客户集中', '应收账款增长'],
  },
  ems: {
    products: ['流动资金贷款', '订单融资', '知识产权质押'],
    risks: ['技术迭代', '订单可持续性'],
  },
  pcs: {
    products: ['流动资金贷款', '供应链金融', '设备融资', '订单融资'],
    risks: ['价格竞争', '技术迭代', '原材料价格波动'],
  },
  thermal: {
    products: ['流动资金贷款', '供应链金融'],
    risks: ['客户集中', '价格竞争'],
  },
  materials: {
    products: ['流动资金贷款', '供应链金融', '设备融资'],
    risks: ['大宗商品价格波动', '产能过剩', '库存跌价'],
  },
  recycling: {
    products: ['流动资金贷款', '供应链金融', '绿色信贷'],
    risks: ['金属价格波动', '渠道稳定性', '环保合规'],
  },
  device: {
    products: ['流动资金贷款', '供应链金融', '知识产权质押'],
    risks: ['技术迭代', '国产替代节奏', '客户验证周期'],
  },
  equipment: {
    products: ['流动资金贷款', '订单融资', '设备融资', '保函'],
    risks: ['订单波动', '交付验收周期', '应收账款增长'],
  },
  testing: {
    products: ['流动资金贷款', '设备融资'],
    risks: ['资质依赖', '人才流失'],
  },
  integrator: {
    products: ['项目融资', '订单融资', '应收账款融资', '流动资金贷款'],
    risks: ['EPC 垫资', '项目回款周期', '毛利率下行', '项目执行风险'],
  },
  epc: {
    products: ['项目融资', '订单融资', '应收账款融资', '保函'],
    risks: ['EPC 垫资', '项目回款', '毛利率下行', '分包管理'],
  },
  chainLeader: {
    products: ['综合授信', '供应链金融', '项目融资'],
    risks: ['生态依赖', '集采账期', '产业链传导风险'],
  },
  operator: {
    products: ['项目融资', '中长期贷款', '资产融资'],
    risks: ['项目 IRR 不达预期', 'DSCR 覆盖不足', '电价与辅助服务政策', '电池衰减', '安全运营风险'],
  },
  cni: {
    products: ['项目融资', '设备融资', '租赁', '综合授信'],
    risks: ['用电负荷波动', '峰谷价差收窄', '项目回收期拉长', '业主信用', '电池衰减'],
  },
  service: {
    products: ['流动资金贷款', '订单融资'],
    risks: ['商业模式验证', '客户集中', '回款周期'],
  },
};

// 按客户层级给出的授信条件（提示词 Tab6 示例 + 分层标签）。
export const STRATEGY_BY_TIER = {
  1: {
    conditions: [
      '经营现金流保持稳定',
      '资产负债率控制在合理区间',
      '单一客户集中度持续监控',
      '重大安全事故需及时报告',
      '重大资本开支提前报备',
    ],
  },
  2: {
    conditions: [
      '核定限额内滚动使用，超限额逐笔审批',
      '经营现金流按季监控，恶化即触发重检',
      '应收账款账龄与 top1 客户回款双监控',
      '需提供应收账款质押或股东担保等增信',
      '在手订单与产能利用率半年一评',
    ],
  },
  3: {
    conditions: [
      '控制新增，存量到期逐步压降',
      '逐笔审核资金用途与还款来源',
      '需落实抵押物或强增信措施',
      '触发风险红线即启动预警处置',
      '纳入重点贷后检查名单',
    ],
  },
};

// 风险红线（V2.0）：A 类重大红线可一票否决（须经核实），B 类风险预警按严重程度降级。
// 每条命中都必须记录事实、来源、时间、主体匹配与复核状态；未经核实的信号标记「待核实」，
// 不得直接自动否决，仅触发降级与补充核实要求。
export const REDLINE_DEFS = {
  A: {
    label: '重大红线',
    items: {
      majorDefault: '核心银行债务实质性违约',
      majorDishonesty: '重大失信 / 恶意逃废债',
      fraudRisk: '重大财务造假或骗贷风险',
      fundOccupation: '重大关联方资金占用',
      severeViolation: '严重违法违规（安全、环保、税务等重大处罚）',
      bankRestricted: '银行制度规定的其他限制准入事项',
    },
  },
  B: {
    label: '风险预警',
    items: {
      ocfPersistentDeterioration: '经营现金流持续恶化',
      debtMaturityMismatch: '债务期限错配 / 短债长期化',
      borrowToRepay: '大量依赖借新还旧',
      arAbnormalGrowth: '大额应收账款异常增长',
      inventoryAbnormal: '存货异常积压',
      shortDebtPressure: '短期债务压力过高',
      capacityLow: '产能利用率持续过低',
      coreCustomerLoss: '核心客户流失',
      productReplaced: '核心产品被替代',
      orderCancel: '大量订单取消',
      safetyIncident: '重大安全事故',
      projectNotGridConnected: '项目无法并网',
      projectRevenueUnclear: '项目收益机制不明确',
      projectRevenueBelowExpectation: '项目收益显著低于预期',
      insuranceMissing: '保险 / 质保缺失',
      clusterContagion: '产业集群风险传导',
      postFinancingDeterioration: '融资后经营恶化',
    },
  },
};

// 待核实标记约定：events[`${key}Pending`] === true 表示该信号尚未完成主体匹配与时点核实。
export const PENDING_SUFFIX = 'Pending';

export const REDLINE_SOURCE_NOTE = {
  basis: '财报与审计报告 / 银行征信与内部授信记录',
  timing: '以最近一期经审计报告或最近 12 个月记录为核实时点',
  subject: '须完成企业主体匹配（同一集团、同名企业需人工复核）',
  review: '待核实信号不得直接否决，须由客户经理与风险经理复核后方可定性',
};

// 预警等级。
export const WARNING_LEVELS = {
  normal: { label: '正常', color: '#168d69' },
  blue: { label: '关注', color: '#2f7fd0' },
  yellow: { label: '预警', color: '#d9a514' },
  orange: { label: '较高风险', color: '#ed861d' },
  red: { label: '高风险', color: '#c23b37' },
};
