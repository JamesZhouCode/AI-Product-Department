// 「政策分析」页数据：政策解读所需的词典、区域产业基础、评分模型与示例政策。
//
// 诉求与结构对齐《储能行业政策分析》的研判框架：
//   政策输入 → 01 政策来源与空间范围判断 → 02 政策目标判断 → 03 产业链影响分析
//   → 04 区域产业影响分析 → 05 企业影响分析 → 06 时间周期分析 → 07 银行业务影响分析
//   → 附 政策影响评分模型（八维加权 100 分）。
//
// 本文件为纯数据（不含 JSX），可被解读引擎与单测直接 import。
// 约定：词典只做「命中即取证」，命中词会原样回显在页面上，保证解读可回溯、可复核。

export const POLICY_META = {
  industry: '储能产业',
  eyebrow: 'POLICY INTELLIGENCE · 2026',
  asOf: '2026-10',
  // 公共模块（两个视图共用）：id 同时作为页内锚点，no 由 modulesFor 按视图重新编号。
  // 说明：本页为「集合解读」，储能视图另加「总体判断」、全行业对比视图另加「行业对比」
  // 作为首个模块，其余八个模块与单条解读时代的七步框架 + 清单一一对应，只是口径改为集合。
  modules: [
    { id: 'list', nav: '政策清单' },
    { id: 'space', nav: '来源与空间' },
    { id: 'goal', nav: '政策目标' },
    { id: 'chain', nav: '产业链影响' },
    { id: 'region', nav: '区域影响' },
    { id: 'company', nav: '企业影响' },
    { id: 'timeline', nav: '时间周期' },
    { id: 'banking', nav: '银行业务' },
  ],
};

/**
 * 按视图取模块导航：储能视图以「总体判断」开头，全行业对比视图以「行业对比」开头。
 * 编号（no）在拼接后统一重排，保证导航序号与模块外壳一致。
 */
export function modulesFor(scope = 'storage') {
  const lead =
    scope === 'all' ? { id: 'compare', nav: '行业对比' } : { id: 'overall', nav: '总体判断' };
  return [lead, ...POLICY_META.modules].map((module, index) => ({
    ...module,
    no: String(index + 1).padStart(2, '0'),
  }));
}

// ---------------------------------------------------------------- 政策空间范围（Where）

// 四级政策空间：级别同时决定「政策级别与权威性」维度的得分与影响范围标签。
export const POLICY_LEVELS = [
  {
    key: 'national',
    label: '国家级',
    range: '全国',
    authority: 100,
    scope: 100,
    desc: '国务院及国家部委发布，影响全国产业方向、商业模式与技术路线。',
    focus: '行业方向变化 · 产业链整体影响 · 行业授信策略',
    banking: '更多影响行业授信策略、客户准入标准与产业研究方向。',
  },
  {
    key: 'provincial',
    label: '省级',
    range: '区域',
    authority: 78,
    scope: 72,
    desc: '省级政府及部门发布，影响本省产业布局、项目安排与配套机制。',
    focus: '区域产业布局 · 省级项目指标 · 配套补贴与机制细则',
    banking: '直接影响当地客户开发、园区金融与产业链金融。',
  },
  {
    key: 'municipal',
    label: '地市级',
    range: '区域',
    authority: 58,
    scope: 60,
    desc: '地市政府及部门发布，影响本市产业集群、园区招商与项目落地。',
    focus: '产业集群形成 · 客户地图变化 · 厂房与设备投资',
    banking: '对银行最有价值：直接改变客户地图与园区获客路径。',
  },
  {
    key: 'park',
    label: '园区级',
    range: '局部产业集群',
    authority: 42,
    scope: 46,
    desc: '园区管委会或运营主体发布，影响入园企业的落地条件与成本结构。',
    focus: '入园条件 · 厂房与用地 · 设备投资补贴',
    banking: '适合按园区整体授信，以入园名单批量获客。',
  },
];

export const POLICY_LEVEL_MAP = Object.fromEntries(POLICY_LEVELS.map((item) => [item.key, item]));

// 发布主体词典：命中即判定级别，并回显「识别到的发布主体」。
export const ISSUER_LEXICON = [
  { level: 'national', issuer: '中共中央 / 国务院', keywords: ['中共中央', '国务院'] },
  {
    level: 'national',
    issuer: '国家发展改革委',
    keywords: ['国家发展改革委', '国家发改委', '发展改革委'],
  },
  { level: 'national', issuer: '国家能源局', keywords: ['国家能源局'] },
  { level: 'national', issuer: '工业和信息化部', keywords: ['工业和信息化部', '工信部'] },
  { level: 'national', issuer: '财政部', keywords: ['财政部'] },
  { level: 'national', issuer: '科技部', keywords: ['科技部'] },
  { level: 'national', issuer: '住房和城乡建设部', keywords: ['住房和城乡建设部', '住建部'] },
  { level: 'national', issuer: '生态环境部', keywords: ['生态环境部'] },
  {
    level: 'national',
    issuer: '国家市场监督管理总局 / 国家标准委',
    // 不放「国家标准」：正文里的「参与制定国家标准与行业标准」指标准本身，
    // 不是发布主体，会让省级文件被误判成国家级。
    keywords: ['市场监督管理总局', '标准化管理委员会'],
  },
  {
    level: 'national',
    issuer: '中国人民银行 / 国家金融监督管理总局',
    keywords: ['中国人民银行', '金融监督管理总局', '人民银行'],
  },
  { level: 'national', issuer: '电网企业', keywords: ['国家电网', '南方电网'] },
  {
    level: 'park',
    issuer: '园区管理机构',
    keywords: ['园区管委会', '管委会', '开发区管理', '高新区管理'],
  },
];

// 园区 / 载体关键词：出现即认为政策落到园区或载体层面。
export const PARK_KEYWORDS = [
  '园区',
  '产业园',
  '开发区',
  '高新区',
  '经济技术开发区',
  '示范基地',
  '产业基地',
  '集聚区',
];

// 省份名（用于识别政策空间范围）。自治区与直辖市均按标准全称或简称识别。
export const PROVINCES = [
  '北京',
  '天津',
  '河北',
  '山西',
  '内蒙古',
  '辽宁',
  '吉林',
  '黑龙江',
  '上海',
  '江苏',
  '浙江',
  '安徽',
  '福建',
  '江西',
  '山东',
  '河南',
  '湖北',
  '湖南',
  '广东',
  '广西',
  '海南',
  '重庆',
  '四川',
  '贵州',
  '云南',
  '西藏',
  '陕西',
  '甘肃',
  '青海',
  '宁夏',
  '新疆',
];

// 地市 → 省份（用于把地市级政策归到省级产业基础做交叉判断）。
export const CITY_PROVINCE = {
  盐城: '江苏',
  常州: '江苏',
  无锡: '江苏',
  苏州: '江苏',
  南京: '江苏',
  南通: '江苏',
  泰州: '江苏',
  宁波: '浙江',
  杭州: '浙江',
  湖州: '浙江',
  嘉兴: '浙江',
  温州: '浙江',
  绍兴: '浙江',
  深圳: '广东',
  广州: '广东',
  东莞: '广东',
  佛山: '广东',
  惠州: '广东',
  珠海: '广东',
  青岛: '山东',
  济南: '山东',
  烟台: '山东',
  枣庄: '山东',
  济宁: '山东',
  合肥: '安徽',
  芜湖: '安徽',
  滁州: '安徽',
  宁德: '福建',
  厦门: '福建',
  福州: '福建',
  长沙: '湖南',
  株洲: '湖南',
  武汉: '湖北',
  宜昌: '湖北',
  荆门: '湖北',
  宜春: '江西',
  新余: '江西',
  成都: '四川',
  宜宾: '四川',
  遂宁: '四川',
  鄂尔多斯: '内蒙古',
  包头: '内蒙古',
  乌兰察布: '内蒙古',
  乌鲁木齐: '新疆',
  昌吉: '新疆',
  兰州: '甘肃',
  张掖: '甘肃',
  西宁: '青海',
  银川: '宁夏',
  吴忠: '宁夏',
  张家口: '河北',
  承德: '河北',
  石家庄: '河北',
  保定: '河北',
  郑州: '河南',
  洛阳: '河南',
  新乡: '河南',
  焦作: '河南',
};

// ---------------------------------------------------------------- 政策目标强度

// 三档目标强度：按「约束性 → 支持性 → 引导性」判定，取文本中出现的最高档。
export const GOAL_STRENGTHS = [
  {
    key: 'mandatory',
    label: '强制约束',
    score: 100,
    tone: 'down',
    text: '含约束性表述，落地确定性最高，企业须限期达标，未达标面临考核或处罚。',
    keywords: [
      '必须',
      '应当',
      '严禁',
      '禁止',
      '不得',
      '强制',
      '限期',
      '考核',
      '约束性',
      '红线',
      '从严',
      '责令',
      '处罚',
    ],
  },
  {
    key: 'supported',
    label: '明确支持',
    score: 82,
    tone: 'up',
    text: '含明确支持性表述，通常配套补贴、指标或纳入范围，落地可见。',
    keywords: [
      '支持',
      '推动',
      '促进',
      '加快',
      '鼓励',
      '引导',
      '优先',
      '补贴',
      '奖励',
      '纳入',
      '落实',
      '推进',
      '给予',
      '保障',
    ],
  },
  {
    key: 'guided',
    label: '鼓励引导',
    score: 62,
    tone: 'watch',
    text: '以探索、试点、研究为主，方向明确但节奏与力度待观察。',
    keywords: ['探索', '试点', '示范', '研究', '鼓励探索', '宜', '试行', '开展试点'],
  },
];

// 目标类型：命中即归类，用于说明政策想解决的是哪个层面的问题。
export const GOAL_TYPES = [
  {
    key: 'scale',
    label: '产业规模目标',
    keywords: ['装机', '规模', '产能', '产值', '亿千瓦', '兆瓦', 'gwh', '万千瓦'],
  },
  {
    key: 'tech',
    label: '技术路线目标',
    keywords: [
      '技术路线',
      '技术攻关',
      '钠离子',
      '液流',
      '压缩空气',
      '氢储能',
      '固态电池',
      '循环寿命',
      '能量密度',
    ],
  },
  {
    key: 'model',
    label: '商业模式目标',
    keywords: ['商业模式', '容量电价', '现货', '辅助服务', '市场化', '共享储能', '租赁', '峰谷'],
  },
  {
    key: 'mechanism',
    label: '市场机制目标',
    keywords: ['市场机制', '交易机制', '价格机制', '结算', '并网', '调度', '准入'],
  },
  {
    key: 'safety',
    label: '安全标准目标',
    keywords: ['安全', '规范', '标准', '检测', '认证', '消防', '热失控', '强制性'],
  },
  {
    key: 'demand',
    label: '需求创造目标',
    keywords: ['配储', '配额', '消纳', '强制配置', '需求侧', '新能源配储'],
  },
];

// ---------------------------------------------------------------- 产业链影响

// 一级环节严格沿用产业链地图（storage-chain.json）的 levels[].label，
// 保证政策解读与产业链地图两侧口径一致、可互相跳转核对。
export const CHAIN_LEVELS = [
  {
    key: 'material',
    label: '资源与材料',
    position: '上游',
    tone: 'watch',
    keywords: [
      '锂',
      '碳酸锂',
      '正极',
      '负极',
      '隔膜',
      '电解液',
      '六氟磷酸锂',
      '铜箔',
      '铝箔',
      '结构件',
      '前驱体',
      '钒',
      '磷',
      '矿产',
      '材料',
      '回收',
      '再生',
    ],
  },
  {
    key: 'device',
    label: '核心电子器件',
    position: '上游',
    tone: 'watch',
    keywords: [
      'igbt',
      'sic',
      '碳化硅',
      '功率器件',
      '芯片',
      '传感器',
      '连接器',
      '继电器',
      '熔断器',
      '半导体',
      '电子器件',
    ],
  },
  {
    key: 'equipment',
    label: '核心装备',
    position: '上游',
    tone: 'watch',
    keywords: [
      '装备',
      '产线',
      '涂布',
      '卷绕',
      '叠片',
      '化成分容',
      '压缩机',
      '透平',
      '膨胀机',
      '电解槽',
      '换热器',
      '制造设备',
    ],
  },
  {
    key: 'testing',
    label: '检测认证与标准',
    position: '上游',
    tone: 'watch',
    keywords: [
      '检测',
      '认证',
      '标准',
      '规范',
      '检验',
      '试验',
      '计量',
      '并网检测',
      '强制性国家标准',
      '安全规范',
    ],
  },
  {
    key: 'cell',
    label: '电池与核心部件',
    position: '中游',
    tone: 'up',
    keywords: [
      '电芯',
      '电池',
      '电堆',
      'pcs',
      '变流器',
      '储能变流器',
      '温控',
      '液冷',
      '消防',
      'bms',
      'ems',
      '模组',
      '电池舱',
      'pack',
    ],
  },
  {
    key: 'integration',
    label: '系统集成与工程建设',
    position: '中游',
    tone: 'up',
    keywords: [
      '系统集成',
      '集成',
      'epc',
      '总承包',
      '工程施工',
      '整站',
      '预制舱',
      '电站建设',
      '安装调试',
      '工程建设',
      '施工单位',
    ],
  },
  {
    key: 'operation',
    label: '应用与运营',
    position: '下游',
    tone: 'up',
    keywords: [
      '运营',
      '电站',
      '独立储能',
      '共享储能',
      '工商业储能',
      '用户侧',
      '电源侧',
      '电网侧',
      '调峰',
      '调频',
      '辅助服务',
      '容量电价',
      '容量补偿',
      '现货',
      '虚拟电厂',
      '峰谷',
      '租赁',
      '聚合',
    ],
  },
];

// 影响方向：环节被命中后，依文本语境判定该环节受到的是哪一类影响。
export const IMPACT_DIRECTIONS = {
  demand: {
    key: 'demand',
    label: '需求提升',
    tone: 'up',
    text: '政策扩张建设规模或创造新需求，直接抬升该环节订单。',
    keywords: [
      '规模化',
      '装机目标',
      '新增装机',
      '扩大',
      '支持建设',
      '鼓励配置',
      '强制配储',
      '配额',
      '消纳',
      '需求',
      '建设规模',
      '推广应用',
      '示范应用',
      '建设一批',
      '规模化发展',
      '补贴',
      '补助',
      '奖励',
      '扶持',
      '优惠',
      '减免',
      '纳入范围',
    ],
  },
  competition: {
    key: 'competition',
    label: '竞争加剧',
    tone: 'watch',
    text: '政策提高门槛或规范秩序，加速尾部出清、格局集中。',
    keywords: [
      '准入',
      '规范',
      '门槛',
      '标准提高',
      '淘汰',
      '整合',
      '集中',
      '竞争',
      '同质化',
      '白名单',
      '目录',
      '质量',
      '产能',
    ],
  },
  model: {
    key: 'model',
    label: '商业模式改善',
    tone: 'up',
    text: '政策完善价格与收益机制，改善该环节的盈利与现金流可测性。',
    keywords: [
      '容量电价',
      '现货',
      '辅助服务',
      '市场化',
      '峰谷',
      '价格机制',
      '收益',
      '结算',
      '租赁',
      '共享储能',
      '独立储能',
      '虚拟电厂',
      '绿电交易',
      '峰谷价差',
      '容量补偿',
    ],
  },
  cost: {
    key: 'cost',
    label: '成本与合规压力',
    tone: 'down',
    text: '政策加严安全、环保或补贴退坡，短期抬升该环节合规成本。',
    keywords: [
      '补贴退坡',
      '退税',
      '成本',
      '考核',
      '罚款',
      '安全责任',
      '处罚',
      '限期',
      '整改',
      '回收',
      '环保',
      '能耗',
    ],
  },
};

// ---------------------------------------------------------------- 企业客群与银行产品

// 受影响客群：按命中的产业链环节映射，用于给出「谁受益、谁承压」。
export const COMPANY_GROUPS = [
  {
    key: 'cell',
    label: '电芯与材料制造企业',
    levels: ['cell', 'material'],
    tone: 'up',
    direction: '受益',
    products: ['供应链金融', '流动资金贷款'],
    basis: '需求扩张直接抬升订单与排产，扩产与备货占用营运资金，需要配套流动资金与上下游融资。',
  },
  {
    key: 'device',
    label: '器件与温控等部件企业',
    levels: ['device'],
    tone: 'up',
    direction: '受益',
    products: ['供应链金融', '票据贴现'],
    basis: '器件随 PCS 与电池舱放量增长，客户集中于头部集成商，账期长、需应收账款融资。',
  },
  {
    key: 'equipment',
    label: '装备与长时储能技术企业',
    levels: ['equipment'],
    tone: 'watch',
    direction: '跟踪',
    products: ['科技金融', '融资租赁'],
    basis: '长时技术与新装备处于验证与示范阶段，轻资产、缺合格抵押物，适合科技金融与设备租赁。',
  },
  {
    key: 'testing',
    label: '检测认证与安全服务机构',
    levels: ['testing'],
    tone: 'up',
    direction: '受益',
    products: ['流动资金贷款', '科技金融'],
    basis: '安全规范与并网标准趋严带动检测与认证需求刚性增长，属资质壁垒型客群。',
  },
  {
    key: 'integrator',
    label: '系统集成与 EPC 企业',
    levels: ['integration'],
    tone: 'watch',
    direction: '分化',
    products: ['供应链金融', '保函与履约担保'],
    basis: '订单向链主集中、集成商垫资与质保责任重，现金流压力大于毛利压力，需按订单质量分层。',
  },
  {
    key: 'operator',
    label: '储能电站投资运营企业',
    levels: ['operation'],
    tone: 'up',
    direction: '受益',
    products: ['项目融资', '绿色金融'],
    basis: '价格与容量机制完善后，电站收益可测算，是首个可按资产模型承贷的客群。',
  },
  {
    key: 'park',
    label: '园区平台公司与入园企业',
    levels: ['operation', 'integration'],
    tone: 'up',
    direction: '受益',
    products: ['园区综合授信', '厂房贷'],
    basis: '政策落到园区载体层面，带来厂房建设、设备投资与入园企业批量获客机会。',
  },
];

// 银行业务产品词典：命中场景即给出可落地的产品与依据。
export const BANKING_LEXICON = [
  {
    key: 'project',
    label: '项目融资',
    scene: '电站项目建设与容量补偿机制',
    products: ['项目贷款', '银团贷款'],
    audience: '储能电站投资与运营企业',
    keywords: [
      '独立储能电站',
      '项目建设',
      '电站建设',
      '装机',
      '并网',
      '容量电价',
      '容量补偿',
      '投产',
      '示范项目',
      '基础设施',
    ],
  },
  {
    key: 'supply',
    label: '供应链金融',
    scene: '产业链协同与本地配套',
    products: ['应收账款融资', '订单融资'],
    audience: '核心制造企业及其上下游',
    keywords: [
      '产业链',
      '配套',
      '集群',
      '链主',
      '采购',
      '供应',
      '上下游',
      '协同',
      '本地配套',
      '集采',
      '供应商',
    ],
  },
  {
    key: 'park',
    label: '园区金融',
    scene: '园区载体建设与企业落地',
    products: ['园区综合授信', '厂房贷'],
    audience: '园区平台公司与入园企业',
    keywords: [
      '园区',
      '产业园',
      '基地',
      '开发区',
      '高新区',
      '厂房',
      '用地',
      '落地',
      '招商引资',
      '企业落户',
      '入园',
    ],
  },
  {
    key: 'tech',
    label: '科技金融',
    scene: '技术攻关与示范验证',
    products: ['知识产权质押', '投贷联动'],
    audience: '技术路线创新企业',
    keywords: [
      '技术攻关',
      '研发',
      '创新',
      '首台套',
      '示范验证',
      '钠离子',
      '液流',
      '压缩空气',
      '氢储能',
      '专利',
      '中试',
      '科技',
    ],
  },
  {
    key: 'green',
    label: '绿色金融',
    scene: '绿色低碳项目投放',
    products: ['绿色信贷', '绿色债券'],
    audience: '新能源与节能项目业主',
    keywords: ['绿色', '低碳', '新能源', '碳达峰', '碳中和', '节能', '环保', '双碳'],
  },
  {
    key: 'working',
    label: '流动资金贷款',
    scene: '扩产与备货资金占用',
    products: ['流动资金贷款', '票据贴现'],
    audience: '制造企业',
    keywords: ['产能', '扩产', '订单', '排产', '备货', '流动资金', '原材料采购', '扩能'],
  },
  {
    key: 'guarantee',
    label: '保函与履约担保',
    scene: '工程履约与质保责任',
    products: ['履约保函', '质量保函'],
    audience: 'EPC 与系统集成企业',
    keywords: ['履约', '质保', '保证金', '投标', '担保', '工程承包'],
  },
  {
    key: 'cross',
    label: '跨境金融',
    scene: '出海与本地化生产',
    products: ['出口信贷', '跨境结算'],
    audience: '出海型制造与集成企业',
    keywords: [
      '出口',
      '海外',
      '出海',
      '境外',
      '国际化',
      '一带一路',
      '海外订单',
      '本地化生产',
      '对外投资',
    ],
  },
  {
    key: 'lease',
    label: '融资租赁',
    scene: '设备购置与固定资产投入',
    products: ['设备融资租赁', '售后回租'],
    audience: '设备密集型企业与电站业主',
    keywords: ['设备投资', '设备购置', '产线', '租赁', '固定资产', '技术改造'],
  },
];

// ---------------------------------------------------------------- 时间周期

export const TIMELINE_PHASES = [
  {
    key: 'immediate',
    label: '短期 · 落地期',
    window: '0–1 年',
    score: 70,
    tone: 'up',
    text: '政策发布后进入细则配套期：地方实施方案、申报窗口与首批项目开工是这段时间的主要观察点。',
  },
  {
    key: 'mid',
    label: '中期 · 放量期',
    window: '1–3 年',
    score: 88,
    tone: 'up',
    text: '目标考核推进，项目批量开工，设备需求集中释放，企业订单与产能利用率上行，是授信投放的主要窗口。',
  },
  {
    key: 'long',
    label: '长期 · 定型期',
    window: '3 年以上',
    score: 74,
    tone: 'watch',
    text: '目标达成与机制定型，行业进入稳态运行，竞争由价格转向服务与资产运营能力，关注存量资产质量。',
  },
];

// 评分基准年：时间周期维度按「目标年份距今」取档，页面上的打分标准与引擎共用该基准年。
export const POLICY_BASE_YEAR = 2026;

// 色调 → 类名映射（页面与弹窗共用，避免各写一份）。
export const TONE_CLASS = { up: 'is-up', watch: 'is-watch', down: 'is-down' };

// ---------------------------------------------------------------- 政策影响评分模型

// 打分的实现常量：引擎与页面「打分标准」弹窗共用同一组数字，
// 保证「页面上公示的标准」与「引擎实际算法」不会各写一份而走样。
export const SCORE_FORMULAS = {
  // 目标强度：先取基准分，再按量化目标条数加分。
  intensity: { quantumStep: 2, quantumCap: 6 },
  // 产业链影响深度：命中环节占比 × 70 + 关键词次数 × 2（封顶 30）。
  chain: { levelRatioMax: 70, perHit: 2, hitCap: 30 },
  // 区域产业匹配度：无直接覆盖区域时的中位口径。
  region: { fallback: 55 },
  // 企业影响程度：基准 38 + 客群类数 × 10 +（目标强度分 − 60）× 0.25。
  company: { base: 38, perGroup: 10, strengthRef: 60, strengthSlope: 0.25 },
  // 持续时间：按目标年份距今的年限取档，跨度过 3 年加分，2030 年及以后至少 92 分。
  duration: {
    unknownYear: 55,
    byHorizon: [
      { min: 5, score: 100 },
      { min: 3, score: 90 },
      { min: 2, score: 84 },
      { min: 1, score: 76 },
      { min: 0, score: 68 },
    ],
    spanBonus: 6,
    spanBonusMin: 3,
    noYearBySpan: [
      { min: 3, score: 78 },
      { min: 0, score: 66 },
    ],
    longTermYear: 2030,
    longTermMin: 92,
  },
  // 银行业务价值：命中产品时 38 + 产品类数 × 9，未命中给 40 分。
  banking: { base: 38, perProduct: 9, none: 40 },
};

// 目标强度基准分（与 GOAL_STRENGTHS 同源，含「未识别」档）。
const INTENSITY_BANDS = [
  ...GOAL_STRENGTHS.map((item) => ({
    cond: item.label,
    score: item.score,
  })),
  { cond: '未识别到明确强度', score: 48 },
];

export const POLICY_SCORE_MODEL = {
  name: '政策影响评分模型',
  note:
    '八个维度加权合计 100 分，权重最高的是「产业链影响深度」（20 分），因为政策对银行的价值最终体现在产业链环节的订单与现金流变化上；' +
    '其次为空间覆盖范围与目标强度（各 15 分）。每个维度先按 0–100 打分子分，再乘权重汇总。',
  // 打分标准：每个维度给出「怎么算」（standard）与「分值档位 / 计分项」（bands）。
  // mode: 'band'  → bands 是按条件直接取分的档位表；
  //       'score' → bands 是「基准分 + 加分项」的计分明细。
  dimensions: [
    {
      key: 'authority',
      label: '政策级别与权威性',
      weight: 10,
      hint: '发布主体层级：国家级 / 省级 / 地市级 / 园区级',
      mode: 'band',
      standard: '按引擎识别到的发布主体层级直接取分，层级越高分值越高。',
      bands: POLICY_LEVELS.map((level) => ({
        cond: `${level.label}（影响范围：${level.range}）`,
        score: level.authority,
      })),
    },
    {
      key: 'scope',
      label: '政策空间覆盖范围',
      weight: 15,
      hint: '全国 / 区域 / 局部产业集群',
      mode: 'band',
      standard: '按政策的空间覆盖范围取分：全国性政策满分，越局部分值越低。',
      bands: POLICY_LEVELS.map((level) => ({
        // 档位名必须唯一：省级与地市级的影响范围都是「区域」，直接用它做档位名会撞车。
        cond: `${level.label} · ${level.range}`,
        score: level.scope,
      })),
    },
    {
      key: 'intensity',
      label: '政策目标强度',
      weight: 15,
      hint: '强制约束 / 明确支持 / 鼓励引导，以及是否给出量化目标',
      mode: 'band',
      standard: `先按命中的强度词取基准分，再按量化目标条数加分：每条 +${SCORE_FORMULAS.intensity.quantumStep} 分，最多 +${SCORE_FORMULAS.intensity.quantumCap} 分，封顶 100。`,
      bands: INTENSITY_BANDS,
    },
    {
      key: 'chain',
      label: '产业链影响深度',
      weight: 20,
      hint: '命中环节数量与影响方向（需求 / 竞争 / 模式 / 成本）',
      mode: 'score',
      standard: `命中环节数 ÷ 7 × ${SCORE_FORMULAS.chain.levelRatioMax} + 命中关键词次数 × ${SCORE_FORMULAS.chain.perHit}（本项最多 +${SCORE_FORMULAS.chain.hitCap}），合计封顶 100。`,
      bands: [
        { cond: '每命中 1 个一级环节（共 7 个）', score: 10 },
        {
          cond: `每命中 1 处环节关键词（最多 +${SCORE_FORMULAS.chain.hitCap}）`,
          score: SCORE_FORMULAS.chain.perHit,
        },
      ],
    },
    {
      key: 'region',
      label: '区域产业匹配度',
      weight: 10,
      hint: '政策覆盖区域与当地产业基础的匹配程度',
      mode: 'score',
      standard: `政策直接覆盖的区域，取其「产业集群成熟度」（六维加权分）的平均值；政策未直接覆盖任何区域时，按 ${SCORE_FORMULAS.region.fallback} 分中位口径处理。`,
      bands: [
        { cond: '直接覆盖的区域：区域产业集群成熟度（多区域取平均）', score: '按成熟度取值' },
        { cond: '未直接覆盖任何区域', score: SCORE_FORMULAS.region.fallback },
      ],
    },
    {
      key: 'company',
      label: '企业影响程度',
      weight: 10,
      hint: '受影响客群范围与受益强度',
      mode: 'score',
      standard: `${SCORE_FORMULAS.company.base} + 受影响客群类数 × ${SCORE_FORMULAS.company.perGroup} +（目标强度分 − ${SCORE_FORMULAS.company.strengthRef}）× ${SCORE_FORMULAS.company.strengthSlope}，封顶 100。`,
      bands: [
        { cond: '基准分', score: SCORE_FORMULAS.company.base },
        { cond: '每匹配 1 类受影响客群', score: SCORE_FORMULAS.company.perGroup },
        {
          cond: `目标强度分每高出 ${SCORE_FORMULAS.company.strengthRef} 分 1 分的部分`,
          score: '+0.25 / 分',
        },
      ],
    },
    {
      key: 'duration',
      label: '持续时间',
      weight: 10,
      hint: '目标年限跨度与执行周期',
      mode: 'band',
      standard: `按目标年份距今（基准 ${POLICY_BASE_YEAR} 年）的年限取档；明确写了 3 年及以上执行跨度的再 +${SCORE_FORMULAS.duration.spanBonus} 分；目标年份在 ${SCORE_FORMULAS.duration.longTermYear} 年及以后的，分值不低于 ${SCORE_FORMULAS.duration.longTermMin}。`,
      bands: [
        ...SCORE_FORMULAS.duration.byHorizon.map((band) => ({
          cond: band.min === 0 ? '目标年份为当年' : `目标年份距今 ≥ ${band.min} 年`,
          score: band.score,
        })),
        {
          cond: `明确执行跨度 ≥ ${SCORE_FORMULAS.duration.spanBonusMin} 年`,
          score: `+${SCORE_FORMULAS.duration.spanBonus}`,
        },
        {
          cond: `未写目标年份，仅写执行跨度 ≥ ${SCORE_FORMULAS.duration.noYearBySpan[0].min} 年`,
          score: SCORE_FORMULAS.duration.noYearBySpan[0].score,
        },
        {
          cond: '未写目标年份，执行跨度不足 3 年',
          score: SCORE_FORMULAS.duration.noYearBySpan[1].score,
        },
        { cond: '未识别到目标年份与执行周期', score: SCORE_FORMULAS.duration.unknownYear },
      ],
    },
    {
      key: 'banking',
      label: '银行业务价值',
      weight: 10,
      hint: '可落地的金融产品与业务场景数量',
      mode: 'score',
      standard: `命中 1 类以上可落地金融产品时：${SCORE_FORMULAS.banking.base} + 产品类数 × ${SCORE_FORMULAS.banking.perProduct}；未命中任何产品场景词时给 ${SCORE_FORMULAS.banking.none} 分。封顶 100。`,
      bands: [
        { cond: '基准分', score: SCORE_FORMULAS.banking.base },
        { cond: '每命中 1 类可落地金融产品', score: SCORE_FORMULAS.banking.perProduct },
        { cond: '未命中任何金融产品场景词', score: SCORE_FORMULAS.banking.none },
      ],
    },
  ],
  // 总分与等级的换算：总分 = Σ(子分 × 权重 ÷ 100)，四舍五入后按以下阈值定级。
  totalNote:
    '总分 = Σ（维度子分 × 权重 ÷ 100），四舍五入取整后落入下列区间；S 级（85 分及以上）仅授予国家级重大方向性政策，省级及以下即使总分达到 85 分，最高也评定为 A 级。',
  grades: [
    {
      min: 85,
      label: 'S · 战略级政策',
      tone: 'up',
      text: '国家级重大方向性政策，可作为行业授信策略调整的直接依据，并同步更新客户准入标准与产业研究结论。',
    },
    {
      min: 72,
      label: 'A · 重要政策',
      tone: 'up',
      text: '对特定环节或区域形成明确增量，应配套专项营销与产品方案，纳入季度策略跟踪。',
    },
    {
      min: 58,
      label: 'B · 一般政策',
      tone: 'watch',
      text: '对局部场景或特定客群有影响，可作为客户经理走访与产品推介的切入点，按月跟踪。',
    },
    {
      min: 0,
      label: 'C · 跟踪类政策',
      tone: 'watch',
      text: '信号偏弱或覆盖面有限，纳入政策库归档跟踪，暂不调整授信策略。',
    },
  ],
};

// ---------------------------------------------------------------- 区域产业基础

// 区域产业集群评价模型的六个维度（权重取自《储能行业政策分析》）。
export const CLUSTER_MODEL = {
  name: '区域产业集群评价模型',
  dimensions: [
    { key: 'companies', label: '企业数量', weight: 20 },
    { key: 'leaders', label: '龙头企业数量', weight: 20 },
    { key: 'chain', label: '产业链完整度', weight: 20 },
    { key: 'output', label: '产值规模', weight: 15 },
    { key: 'tech', label: '技术创新能力', weight: 15 },
    { key: 'policy', label: '政策支持力度', weight: 10 },
  ],
};

// 各省级区域的储能产业基础（分维打分 0–100，用于计算集群成熟度与匹配度）。
export const REGION_BASE = {
  江苏: {
    full: '江苏省',
    policyCount: 42,
    direction: '独立储能 + 系统集成 + 长时储能装备',
    advantages: [
      '制造业基础雄厚，动力电池与储能电芯产能居全国前列',
      '工商业负荷密集，峰谷价差空间大',
      '沿海港口便于储能产品出口',
    ],
    leaders: ['宁德时代（溧阳基地）', '中创新航（常州）', '天合光能（常州）', '双登集团（泰州）'],
    clusters: ['盐城储能产业集群', '常州溧阳动力电池集群'],
    dims: { companies: 95, leaders: 92, chain: 90, output: 94, tech: 88, policy: 92 },
    note: '已形成「电芯—系统集成—设备制造」较为完整的链条，盐城、常州两地集群度最高。',
  },
  浙江: {
    full: '浙江省',
    policyCount: 35,
    direction: '工商业储能 + 数字能源 + 户储出口',
    advantages: [
      '民营制造业集中，工商业用户密度高',
      '分时电价与需求响应机制成熟',
      '数字能源与虚拟电厂场景领先',
    ],
    leaders: ['阳光电源（杭州研发）', '南都电源（杭州）', '瑞浦兰钧（温州）', '正泰新能源（温州）'],
    clusters: ['杭州数字能源集群', '湖州长兴电池产业集群'],
    dims: { companies: 86, leaders: 80, chain: 82, output: 84, tech: 88, policy: 90 },
    note: '工商储与虚拟电厂场景最成熟，峰谷价差与需求响应叠加后项目回收期较短。',
  },
  广东: {
    full: '广东省',
    policyCount: 38,
    direction: '工商业储能 + 户储出口 + 电网侧独立储能',
    advantages: [
      '电网负荷高、制造业集中',
      '珠三角电子与器件配套完整',
      '出口通道便利，海外认证经验成熟',
    ],
    leaders: ['比亚迪储能（深圳）', '华为数字能源（深圳）', '欣旺达（深圳）', '亿纬锂能（惠州）'],
    clusters: ['深圳储能产业集聚区', '惠州仲恺电子信息集群'],
    dims: { companies: 90, leaders: 94, chain: 86, output: 92, tech: 90, policy: 84 },
    note: '工商业储能与海外户储双轮驱动，器件与电池配套齐全，出口占比高。',
  },
  山东: {
    full: '山东省',
    policyCount: 33,
    direction: '共享储能 + 独立储能 + 风光配储',
    advantages: [
      '新能源装机规模大，消纳压力推动储能需求',
      '共享储能模式起步早、机制成熟',
      '化工与装备制造配套完整',
    ],
    leaders: ['山东电工电气', '特来电（青岛）', '中车四方所', '力神青岛基地'],
    clusters: ['枣庄锂电产业集群', '青岛储能装备集群'],
    dims: { companies: 78, leaders: 74, chain: 78, output: 82, tech: 76, policy: 88 },
    note: '共享储能模式全国起步最早，政策对独立储能容量补偿与调用有明确安排。',
  },
  安徽: {
    full: '安徽省',
    policyCount: 26,
    direction: '电池制造 + 材料配套 + 系统集成',
    advantages: [
      '合肥新能源产业链集聚效应强',
      '材料与结构件配套成本低',
      '土地与能源要素成本有优势',
    ],
    leaders: ['国轩高科（合肥）', '阳光电源（合肥基地）', '华霆动力（合肥）', '中鼎股份'],
    clusters: ['合肥新能源汽车与储能集群', '芜湖材料配套集群'],
    dims: { companies: 74, leaders: 76, chain: 74, output: 76, tech: 74, policy: 82 },
    note: '以合肥为核心，电池—材料—集成三环节配套度较高，成本竞争力突出。',
  },
  福建: {
    full: '福建省',
    policyCount: 21,
    direction: '电芯制造 + 户储出口 + 海上风电配储',
    advantages: ['宁德时代总部带动效应显著', '锂电产业链高度集聚', '港口与海外渠道便利'],
    leaders: ['宁德时代（宁德）', '星云股份（福州）', '科华数据（厦门）', '海辰储能（厦门）'],
    clusters: ['宁德锂电新能源集群', '厦门储能系统集成集群'],
    dims: { companies: 66, leaders: 92, chain: 72, output: 88, tech: 90, policy: 74 },
    note: '龙头企业带动极强，宁德一地贡献全省大部分产能与产值，产业链完整度仍在补齐。',
  },
  湖南: {
    full: '湖南省',
    policyCount: 18,
    direction: '材料配套 + 电池回收 + 储能装备',
    advantages: ['正极材料与循环回收产业基础好', '工程机械与装备制造能力强', '要素成本较低'],
    leaders: ['中伟股份（长沙）', '长远锂科（长沙）', '湖南裕能（湘潭）', '三一重能'],
    clusters: ['长株潭先进储能材料集群', '宁乡储能材料集群'],
    dims: { companies: 62, leaders: 64, chain: 68, output: 66, tech: 72, policy: 76 },
    note: '上游材料与回收环节优势突出，正极材料产量居全国前列。',
  },
  湖北: {
    full: '湖北省',
    policyCount: 17,
    direction: '电池制造 + 动力与储能协同 + 回收',
    advantages: ['中部交通枢纽，辐射半径大', '汽车工业与电池产业协同', '科研院所资源集中'],
    leaders: ['亿纬动力（荆门）', '中创新航（武汉）', '武汉力神', '格林美（武汉）'],
    clusters: ['武汉经开区新能源集群', '荆门动力储能电池集群'],
    dims: { companies: 60, leaders: 62, chain: 64, output: 68, tech: 70, policy: 74 },
    note: '荆门、武汉两地产能集中，循环回收与动力电池协同是特色。',
  },
  河南: {
    full: '河南省',
    policyCount: 15,
    direction: '材料配套 + 电池制造 + 用户侧储能',
    advantages: ['人口与用电基数大，用户侧空间广', '有色金属与化工材料配套齐全', '物流成本低'],
    leaders: ['多氟多（焦作）', '龙佰集团', '中航锂电（洛阳）', '濮阳惠成'],
    clusters: ['焦作锂电材料集群', '洛阳新能源电池集群'],
    dims: { companies: 54, leaders: 52, chain: 58, output: 58, tech: 58, policy: 70 },
    note: '电解液与材料环节有基础，用户侧储能随电价机制完善逐步起量。',
  },
  四川: {
    full: '四川省',
    policyCount: 19,
    direction: '锂资源 + 材料加工 + 电池制造',
    advantages: ['锂矿资源禀赋全国领先', '水电价格优势明显，制造成本低', '宜宾等地电池产能集聚'],
    leaders: ['天齐锂业（成都）', '宁德时代（宜宾基地）', '盛新锂能（成都）', '宜宾锂宝'],
    clusters: ['宜宾动力电池集群', '遂宁锂电材料集群'],
    dims: { companies: 64, leaders: 70, chain: 70, output: 74, tech: 66, policy: 74 },
    note: '资源端优势突出，水电成本低使制造成本具备竞争力。',
  },
  内蒙古: {
    full: '内蒙古自治区',
    policyCount: 24,
    direction: '风光配储 + 电网侧独立储能 + 大基地',
    advantages: [
      '风光资源与装机规模全国领先，消纳压力大',
      '沙戈荒大基地集中建设',
      '土地与接入条件好',
    ],
    leaders: ['远景科技（鄂尔多斯）', '国电投内蒙古公司', '蒙能集团', '中广核内蒙古'],
    clusters: ['鄂尔多斯零碳产业园', '乌兰察布储能配套集群'],
    dims: { companies: 52, leaders: 58, chain: 50, output: 70, tech: 62, policy: 88 },
    note: '政策驱动型市场，需求来自大基地配储与火电灵活性改造，本地制造环节较弱。',
  },
  新疆: {
    full: '新疆维吾尔自治区',
    policyCount: 22,
    direction: '大基地配储 + 电网侧独立储能',
    advantages: ['光伏与风电资源禀赋极佳', '大基地项目集中批复', '外送通道带动配套储能'],
    leaders: ['特变电工（昌吉）', '金风科技新疆基地', '中电建新疆', '华电新疆'],
    clusters: ['乌鲁木齐装备制造集群', '哈密新能源基地'],
    dims: { companies: 48, leaders: 56, chain: 46, output: 66, tech: 58, policy: 86 },
    note: '装备制造有特变电工等龙头，储能本地配套以工程与运营为主。',
  },
  甘肃: {
    full: '甘肃省',
    policyCount: 16,
    direction: '风光配储 + 独立储能 + 长时储能示范',
    advantages: ['风光资源集中，弃风弃光率偏高', '长时储能示范项目落地早', '通道外送带动调节需求'],
    leaders: ['金川集团', '甘肃电投', '中核汇能甘肃', '兰石重装'],
    clusters: ['酒泉新能源基地', '张掖储能示范集群'],
    dims: { companies: 42, leaders: 46, chain: 44, output: 56, tech: 62, policy: 80 },
    note: '消纳压力直接转化为储能需求，长时储能示范项目条件较好。',
  },
  青海: {
    full: '青海省',
    policyCount: 12,
    direction: '清洁能源配储 + 长时储能',
    advantages: ['清洁能源占比全国最高', '盐湖锂资源禀赋突出', '大型储能示范场景多'],
    leaders: ['盐湖股份（格尔木）', '黄河水电', '青海锂业', '国网青海'],
    clusters: ['海南州清洁能源基地', '格尔木盐湖锂产业集群'],
    dims: { companies: 38, leaders: 48, chain: 42, output: 52, tech: 66, policy: 78 },
    note: '资源型优势明显，盐湖提锂与清洁能源基地共同支撑储能场景。',
  },
  宁夏: {
    full: '宁夏回族自治区',
    policyCount: 14,
    direction: '风光配储 + 独立储能 + 数据中心配储',
    advantages: ['新能源装机占比高', '东数西算节点带来新增负荷', '储能示范政策明确'],
    leaders: ['宝丰能源', '国网宁夏', '宁夏电投', '中环股份宁夏'],
    clusters: ['宁东能源化工基地', '中卫数据中心配套储能'],
    dims: { companies: 40, leaders: 44, chain: 40, output: 54, tech: 58, policy: 82 },
    note: '数据中心负荷增长带来备电与调峰双重需求，是「储能 + 算力」新场景的试验地。',
  },
  河北: {
    full: '河北省',
    policyCount: 20,
    direction: '风光配储 + 独立储能 + 雄安绿色场景',
    advantages: [
      '张家口可再生能源示范区基础好',
      '钢铁与化工企业节能改造需求大',
      '靠近京津负荷中心',
    ],
    leaders: ['晶澳科技（邢台）', '英利能源（保定）', '长城汽车（保定）', '国网河北'],
    clusters: ['张家口可再生能源示范区', '保定新能源与储能集群'],
    dims: { companies: 56, leaders: 56, chain: 56, output: 62, tech: 62, policy: 78 },
    note: '示范区政策与工商业节能改造共同支撑需求，靠近负荷中心是优势。',
  },
  江西: {
    full: '江西省',
    policyCount: 15,
    direction: '锂云母材料 + 电池制造',
    advantages: ['宜春锂云母资源储量大', '材料加工环节集聚', '要素成本低'],
    leaders: ['赣锋锂业（新余）', '宁德时代（宜春基地）', '国轩高科（宜春）', '九岭锂业'],
    clusters: ['宜春锂电新能源集群', '新余锂电产业集群'],
    dims: { companies: 58, leaders: 60, chain: 62, output: 64, tech: 58, policy: 72 },
    note: '以锂云母提锂与材料加工为主，电池环节随龙头企业落地产能逐步补齐。',
  },
  上海: {
    full: '上海市',
    policyCount: 13,
    direction: '总部与金融 + 数字能源 + 研发',
    advantages: ['金融与总部资源集中', '数字能源与能源互联网研发能力强', '国际化程度高'],
    leaders: ['上海电气储能', '纬景储能（液流）', '特斯拉上海储能超级工厂', '国网上海'],
    clusters: ['临港新片区储能产业基地', '张江数字能源集群'],
    dims: { companies: 44, leaders: 58, chain: 46, output: 52, tech: 82, policy: 74 },
    note: '制造环节有限，但在技术研发、金融支持与国际化方面优势明显，是液流等新路线的重要落地地。',
  },
};

// 地图配色分档：政策密集 / 受益强度越高颜色越深。
export const REGION_MAP_BANDS = [
  { min: 85, fill: '#0d4fa6', label: '受政策带动最强' },
  { min: 70, fill: '#1d62d8', label: '带动较强' },
  { min: 55, fill: '#5b93e6', label: '带动中等' },
  { min: 40, fill: '#9dc0f2', label: '带动偏弱' },
  { min: 0, fill: '#d9e7fa', label: '带动有限' },
];

export const REGION_MAP_EMPTY_FILL = '#eef3f7';

// ---------------------------------------------------------------- 示例政策（演示用）

// 四份示例政策覆盖国家 / 省 / 地市 / 园区四个层级，用于演示解读能力；
// 关键数字与「宏观」页口径保持一致（2027 年 1.8 亿千瓦、2030 年 3 亿千瓦）。
// 标注：以下为按公开政策文风整理的**演示样例**，不作为真实政策原文引用。
export const SAMPLE_POLICIES = [
  {
    id: 'sample-national',
    title: '新型储能规模化建设专项行动方案（2025—2027 年）',
    issuer: '国家发展改革委、国家能源局',
    level: 'national',
    sourceName: '示例 · 国家级',
    text: `# 新型储能规模化建设专项行动方案（2025—2027 年）

为加快新型储能规模化发展，国家发展改革委、国家能源局联合印发本方案。

一、总体目标
到 2027 年，全国新型储能装机规模达到 1.8 亿千瓦以上，新型储能由商业化初期步入规模化发展阶段。到 2030 年，装机规模达到 3 亿千瓦以上。

二、推动多元技术路线
推动锂离子电池、钠离子电池、液流电池、压缩空气储能、氢储能等多元技术路线协调发展。支持长时储能技术攻关与首台套示范验证，鼓励 4 小时以上长时储能项目开展试点。

三、完善市场机制与商业模式
完善容量电价机制，推动电网侧独立储能、共享储能参与电力市场，支持独立储能电站通过现货市场、辅助服务市场获得收益。鼓励工商业储能、用户侧储能参与需求响应与虚拟电厂聚合。

四、强化产业链协同
支持电池、PCS、系统集成、温控消防等环节协同发展，加强产业链上下游配套。鼓励系统集成与工程建设企业提升整站交付能力。

五、加强安全与标准
严格执行电化学储能电站安全规范，强化热失控预警与消防要求，完善检测认证与并网检测体系，提高准入门槛。

六、加强金融支持
鼓励金融机构加大对新型储能项目的信贷支持，探索绿色金融、融资租赁、供应链金融等产品创新，支持符合条件的储能企业拓宽融资渠道。`,
  },
  {
    id: 'sample-province',
    title: '江苏省关于促进新型储能高质量发展的若干措施',
    issuer: '江苏省人民政府办公厅',
    level: 'provincial',
    sourceName: '示例 · 省级',
    text: `# 江苏省关于促进新型储能高质量发展的若干措施

为促进全省新型储能产业高质量发展，省政府办公厅印发本措施。

一、明确发展目标
到 2028 年，全省新型储能装机规模达到 1500 万千瓦以上，建成盐城、常州等一批储能产业集群。

二、支持独立储能电站建设
对符合条件的电网侧独立储能电站，按容量给予一次性补贴，并优先纳入省级电力市场交易。支持共享储能模式，鼓励新能源场站租赁独立储能容量。

三、推动产业集群发展
支持盐城、常州、泰州等地建设储能产业园，对入园的电芯、系统集成、装备制造企业给予厂房建设补贴与设备投资补助。对新落户的龙头企业给予用地保障。

四、强化技术创新
支持液流电池、钠离子电池等长时储能技术攻关与中试，对首台套装备给予奖励。

五、加强要素保障
鼓励金融机构对储能项目提供项目贷款，支持园区平台公司开展厂房建设，推动供应链金融与产业链协同。`,
  },
  {
    id: 'sample-city',
    title: '盐城市新能源产业园储能产业扶持办法',
    issuer: '盐城市人民政府',
    level: 'municipal',
    sourceName: '示例 · 地市级',
    text: `# 盐城市新能源产业园储能产业扶持办法

为打造长三角重要的储能产业基地，制定本办法。

一、适用范围
本办法适用于在本市新能源产业园内新落户或增资扩产的储能电芯、PCS、系统集成、温控消防及配套材料企业。

二、厂房与用地支持
对入园企业租赁标准厂房的，前三年租金给予减免；自建厂房的，按建筑面积给予补助。优先保障重大项目用地指标。

三、设备投资补助
对企业购置储能电池产线、化成设备等生产性设备的，按设备投资额的一定比例给予补助，单个项目最高不超过规定上限。

四、鼓励园区集群化
园区内已形成电芯制造、系统集成、设备制造产业链，鼓励链主企业带动本地配套，对新引进上下游配套企业的给予引荐奖励。

五、金融支持
鼓励银行机构对入园企业提供厂房贷、设备融资租赁与流动资金贷款，支持园区平台公司开展整体授信与批量获客。`,
  },
  {
    id: 'sample-park',
    title: '某高新技术产业开发区储能产业园管理办法',
    issuer: '某高新技术产业开发区管理委员会',
    level: 'park',
    sourceName: '示例 · 园区级',
    text: `# 某高新技术产业开发区储能产业园管理办法

第一章 总则
为规范储能产业园管理、促进产业集聚，制定本办法。本办法适用于园区内从事储能电池、储能变流器、系统集成及配套产业的企业。

第二章 入园条件
入园企业应当具备独立法人资格，主营业务属于储能产业链范围，并承诺在园区内实际生产经营。园区实行准入目录管理，限制低水平重复建设。

第三章 支持政策
园区对入园企业给予厂房租金优惠、设备购置补贴与人才安居支持。对开展技术攻关与中试的，给予研发费用后补助。

第四章 服务与配套
园区提供检测认证、并网检测、消防验收等一站式服务，推动园内企业开展供应链协同与本地配套。

第五章 金融对接
园区管理委员会定期组织银行机构与企业对接，支持园区整体授信、设备融资租赁与供应链金融落地。`,
  },
];

// ---------------------------------------------------------------- 算力产业示例政策（演示用）

// 与储能示例同构：国家 / 省 / 地市 / 园区四级，便于演示「算力行业 · 有效期内政策」的集合解读。
// 关键数字与「行业」页口径保持一致（2025 年 300 EFLOPS、智算占比 35%、8 枢纽 10 集群、PUE ≤ 1.25、1800EB）。
// 标注：以下为按公开政策文风整理的**演示样例**，不作为真实政策原文引用。
export const SAMPLE_POLICIES_COMPUTE = [
  {
    id: 'sample-compute-national',
    sampleIndustry: 'compute',
    title: '算力基础设施高质量发展行动计划（2025—2027 年）',
    issuer: '工业和信息化部等六部门',
    level: 'national',
    sourceName: '示例 · 国家级',
    text: `# 算力基础设施高质量发展行动计划（2025—2027 年）

为加快构建全国一体化算力网，工业和信息化部等部门联合印发本行动计划。

一、总体目标
到 2025 年，全国算力规模超过 300 EFLOPS，智能算力占比达到 35%，存储总量超过 1800EB。到 2027 年，算力基础设施实现规模化、绿色化、智能化发展，智能算力占比进一步提升。

二、优化算力布局
依托东数西算工程，加快 8 个国家算力枢纽节点、10 个国家数据中心集群建设，推动东部智能算力需求与西部清洁能源供给协同。推动算力资源跨区域调度，提升算力网络时延与可用性。

三、提升算力供给能力
支持 GPU、NPU、ASIC 等多元 AI 芯片与加速卡研发及产业化，推动 AI 服务器、高速交换机、800G 光模块、液冷温控等环节协同配套。鼓励先进封装、高带宽存储等关键器件攻关，提升产业链自主可控水平。

四、推动绿色低碳发展
国家枢纽节点新建数据中心电能利用效率（PUE）不得高于 1.25，鼓励采用液冷、余热回收、绿电直供等方案，推动老旧数据中心节能改造。

五、深化算力赋能应用
面向人工智能、工业、金融、医疗等重点行业，推动算力与行业模型、应用场景融合。培育算力租赁、云计算与算力调度等服务模式，降低中小企业用算成本。

六、强化安全保障
完善算力网络安全防护体系，加强数据中心运行监测与应急处置能力，推动算力服务等级与合规管理。`,
  },
  {
    id: 'sample-compute-province',
    sampleIndustry: 'compute',
    title: '江苏省关于加快智算中心建设的若干措施',
    issuer: '江苏省发展和改革委员会、江苏省工业和信息化厅',
    level: 'provincial',
    sourceName: '示例 · 省级',
    text: `# 江苏省关于加快智算中心建设的若干措施

为提升全省智能算力供给能力，支撑人工智能产业发展，制定本措施。

一、建设目标
到 2026 年，全省智能算力规模显著提升，建成一批面向人工智能训练的智算中心，形成算力供给、调度与运营协同的算力网络。

二、优化布局
支持南京、苏州、无锡等地依托现有数据中心集群布局智算中心，新建项目原则上应接入省级算力调度平台。严格新增项目能效门槛，新建大型数据中心 PUE 不高于 1.25。

三、支持多元芯片与液冷技术
鼓励智算中心采用国产 AI 芯片与加速卡，支持 AI 服务器整机、高速光模块、液冷温控等本地配套企业参与项目建设，推动产业链上下游协同。

四、发放算力券
省级安排专项资金发放算力券，对中小企业、高校院所使用智能算力开展模型训练与推理的，按实际支出给予补贴，降低用算成本。

五、强化金融支持
鼓励银行机构针对智算中心建设、设备采购与算力租赁业务开发中长期贷款、设备融资租赁与供应链金融产品，探索以算力服务合同、设备资产为增信的授信模式。`,
  },
  {
    id: 'sample-compute-city',
    sampleIndustry: 'compute',
    title: '深圳市打造人工智能算力高地行动计划',
    issuer: '深圳市人民政府',
    level: 'municipal',
    sourceName: '示例 · 地市级',
    text: `# 深圳市打造人工智能算力高地行动计划

为打造具有全球影响力的人工智能算力高地，制定本行动计划。

一、总体目标
到 2026 年，全市智能算力规模与利用率显著提升，建成一批高密度、低时延的智算中心，形成覆盖芯片、整机、网络、机房与算力服务的完整链条。

二、加快智算中心建设
支持企业建设面向大模型训练的智算中心，鼓励存量数据中心开展液冷改造与高密机柜升级。新建项目 PUE 应不高于 1.25，优先使用绿电。

三、强化产业链配套
支持 AI 芯片与加速卡、AI 服务器整机、交换机与光模块、液冷温控、高速连接等本地企业协同攻关，鼓励整机企业与芯片企业联合定义产品。

四、发放算力券与模型券
对本地企业使用智能算力开展模型训练、推理与行业应用落地的，给予算力券支持；对购买算力服务并形成实际业务收入的，给予配套奖励。

五、完善算力调度与运营
建设市级算力调度平台，推动异构算力统一纳管与按需分配，培育算力租赁、云计算与算力调度服务商。

六、加大金融支持
鼓励银行机构为智算中心、算力租赁企业提供项目贷款、融资租赁与知识产权质押融资，支持算力资产证券化探索。`,
  },
  {
    id: 'sample-compute-park',
    sampleIndustry: 'compute',
    title: '某高新技术产业开发区智算产业园算力券管理办法',
    issuer: '某高新技术产业开发区管理委员会',
    level: 'park',
    sourceName: '示例 · 园区级',
    text: `# 某高新技术产业开发区智算产业园算力券管理办法

第一章 总则
为促进智算产业集聚、降低园区企业用算成本，制定本办法。本办法适用于园区内从事智算中心建设运营、算力服务、AI 芯片与服务器配套的企业。

第二章 入园条件
入园企业应具备独立法人资格，主营业务属于算力产业链范围，包括 AI 芯片与加速卡、AI 服务器整机、交换机与光模块、液冷温控、IDC 与智算中心、算力租赁与运维等环节。园区实行准入目录管理，限制低水平重复建设。

第三章 算力券支持
园区设立算力券专项资金，对园区企业租用园区内智算中心算力开展模型训练与推理的，按合同金额给予补贴；对年度算力支出达到一定规模的企业，给予阶梯式奖励。

第四章 机房与能效管理
园区智算中心实行高密机柜与液冷优先配置，新建项目 PUE 不高于 1.25。园区统一监测机柜功率、制冷与用电数据，推动余热回收与绿电交易。

第五章 金融对接
园区管理委员会定期组织银行机构与算力企业对接，支持以算力服务合同、设备资产、算力券收益权等作为增信手段，开展整体授信、设备融资租赁与供应链金融。`,
  },
];

// 示例政策按行业分组：储能 / 算力各一套，切换一级链时示例数据跟随切换。
export const SAMPLE_POLICIES_BY_INDUSTRY = {
  storage: SAMPLE_POLICIES,
  compute: SAMPLE_POLICIES_COMPUTE,
};

export function samplePoliciesFor(industry) {
  return SAMPLE_POLICIES_BY_INDUSTRY[industry] || SAMPLE_POLICIES;
}
