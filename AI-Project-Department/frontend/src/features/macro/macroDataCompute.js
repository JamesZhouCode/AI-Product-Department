// 「行业」页数据：算力产业宏观研判（静态研判口径，随公开数据定期更新）。
//
// 与 macroData.js（储能产业）保持完全相同的导出契约，页面按当前产业链选择数据集：
//   macroDataFor('储能产业') → macroData.js
//   macroDataFor('算力产业') → 本文件
//
// 模块定义与储能版一致：01 总体判断 → 02 生命周期 → 03 需求趋势 → 04 产业链景气
//   → 05 技术路线 → 06 竞争格局 → 07 风险预警 → 08 银行业务机会 → 09 AI 助手 → 附 数据底座。
//
// 每项判断仍带三类信息：source（macroSourcesCompute.js 的来源元数据）、
// basis（数据依据 / 判断逻辑 / 影响分析）、以及可复核的读数。
// 约定：算力产业缺少统一官方月度统计，凡规模、份额、价格读数一律按区间给出并标注
// 「测算口径」，不冒充统计发布值；由本页推导的结论一律指向 ai 类来源。

export const MACRO_META = {
  industry: '算力产业',
  eyebrow: 'COMPUTE MACRO HUB · 2026H2',
  asOf: '2026-06',
  modules: [
    { id: 'overview', no: '01', nav: '总体判断' },
    { id: 'lifecycle', no: '02', nav: '生命周期' },
    { id: 'demand', no: '03', nav: '需求趋势' },
    { id: 'chain', no: '04', nav: '产业链景气' },
    { id: 'tech', no: '05', nav: '技术路线' },
    { id: 'competition', no: '06', nav: '竞争格局' },
    { id: 'risk', no: '07', nav: '风险预警' },
    { id: 'banking', no: '08', nav: '银行机会' },
    { id: 'assistant', no: '09', nav: 'AI 助手' },
    { id: 'appendix', no: '附', nav: '数据底座' },
  ],
};

// 画布头部的关键读数条（对齐 flow-canvas-metrics 的 b + span 结构）。
export const MACRO_KPIS = [
  { key: 'scale', value: '300 EFLOPS', label: '2025 年算力规模目标', source: 'miitPlan' },
  { key: 'smart', value: '35%', label: '智能算力占比目标', source: 'miitPlan' },
  { key: 'hub', value: '8 枢纽 · 10 集群', label: '全国一体化算力网布局', source: 'ndrcHub' },
  { key: 'pue', value: '≤1.25', label: '枢纽节点新建数据中心 PUE', source: 'miitPlan' },
  { key: 'storage', value: '1800EB', label: '2025 年存储总量目标', source: 'miitPlan' },
  { key: 'rent', value: '高位回落', label: '智算租赁价格 · 供给释放后溢价收窄', source: 'idcStat' },
];

// ---------------------------------------------------------------- 01 行业总体判断

export const SECTOR_VERDICT = {
  score: 74,
  grade: '景气偏强',
  stage: '规模建设期 → 运营分化期',
  headline: '算力从「建多少」转向「用多少」，分水岭是上架率与单位算力成本',
  summary:
    '政策端给出了明确的天花板读数：2025 年算力规模 300 EFLOPS、智能算力占比 35%、枢纽节点新建数据中心 PUE 低于 1.25。' +
    '供给侧在两年高强度建设后开始出现结构性分化——枢纽节点集群的上架率与调度利用率明显好于地方自建项目，' +
    '算力租赁价格从紧缺期的高位回落。真正的行业性质变化来自需求结构：推理侧调用量接棒训练侧成为增量主体，' +
    '这意味着客户从「一次性买集群」变成「按月买算力」，授信逻辑必须从设备抵押转向现金流与上架率。',
  subScores: [
    { key: 'demand', label: '需求景气', score: 86, tone: 'up' },
    { key: 'supply', label: '供给格局', score: 66, tone: 'watch' },
    { key: 'price', label: '价格成本', score: 62, tone: 'watch' },
    { key: 'policy', label: '政策机制', score: 90, tone: 'up' },
    { key: 'tech', label: '技术安全', score: 70, tone: 'watch' },
    { key: 'global', label: '全球分工', score: 58, tone: 'watch' },
  ],
  opportunities: [
    {
      title: '推理需求接棒',
      text: '大模型从训练走向规模化推理，调用量按日频增长，带来持续、可计量的算力消耗，是算力租赁与云服务收入的基本盘。',
      source: 'judgement',
    },
    {
      title: '国产算力闭环初成',
      text: '国产加速卡 + 国产交换 + 国产光模块 + 国产框架的组合已在政务、运营商与部分行业客户形成可交付方案，替代路径从「能用」走向「好用」。',
      source: 'techRoadmap',
    },
    {
      title: '能效改造成为刚性支出',
      text: '枢纽节点 PUE 低于 1.25 的要求，把液冷、余热回收与供配电改造从「可选项」变成「准入门槛」，是设备端确定性最高的增量。',
      source: 'miitPlan',
    },
  ],
  risks: [
    {
      title: '供给结构性过剩',
      text: '地方智算中心集中上量，但本地需求不足、缺乏调度渠道，出现「建好但上不满」的情况，上架率分化是当前最真实的风险读数。',
      source: 'idcStat',
    },
    {
      title: '供应链单点约束',
      text: '先进制程产能、HBM 供给与光芯片良率是三条硬约束，任一环节收紧都会直接压低整机出货与项目交付节奏。',
      source: 'techRoadmap',
    },
    {
      title: '租赁价格下行压缩回报',
      text: '供给释放叠加客户议价能力提升，算力租赁单价从高位回落，前期按高价测算的项目回收期被拉长。',
      source: 'marketRule',
    },
  ],
  basis: {
    data: '政策目标：2025 年算力规模 300 EFLOPS、智能算力占比 35%、枢纽节点新建数据中心 PUE ≤1.25（工信部等六部门行动计划）；区域布局：8 枢纽 10 集群；市场侧：智算中心上架率与租赁价格分化（第三方统计区间）。',
    logic:
      '需求侧看推理调用量与行业渗透，供给侧看上架率与在建规模，价格侧看租赁单价与单位算力成本；三者同向改善才判定景气上行，单看开工与投资额会误判。',
    impact:
      '授信策略从「看项目立项」转向「看上架率与租约质量」：有长约、有调度渠道的智算资产可做项目融资，纯地方自建、无租约锁定的项目应压降敞口。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 02 行业生命周期判断

export const LIFECYCLE = {
  stages: ['创新者', '早期采用者', '主流市场', '成熟市场'],
  currentIndex: 2,
  current: '主流市场（早期）',
  note: '采用技术采用生命周期模型：通用算力已进入成熟市场，智能算力仍处主流市场早期——技术在快速迭代，但需求与商业模式已跨过验证期。',
  metrics: [
    {
      key: 'tech',
      label: '技术成熟度',
      score: 72,
      tone: 'watch',
      text: '加速卡、800G 光模块、冷板液冷已规模化交付；1.6T 光模块、CPO 与浸没式液冷仍在放量前期，架构迭代周期约 1—1.5 年。',
      source: 'techRoadmap',
    },
    {
      key: 'model',
      label: '商业模式成熟度',
      score: 64,
      tone: 'watch',
      text: '算力租赁、算力券、云按量计费三种模式并行；租赁合同以 1—3 年为主，收益可测算但仍受价格下行扰动。',
      source: 'marketRule',
    },
    {
      key: 'penetration',
      label: '市场渗透情况',
      score: 68,
      tone: 'up',
      text: '智能算力占比向 35% 的政策目标靠拢；互联网与运营商先行，政务、金融、制造开始批量采购。',
      source: 'caictStat',
    },
    {
      key: 'policyDep',
      label: '政策依赖度',
      score: 72,
      tone: 'watch',
      text: '枢纽节点布局、算力券与能耗指标对项目经济性影响显著；相比储能，算力更依赖地方补贴与电价，市场化定价尚未完全成型。',
      source: 'miitPlan',
    },
  ],
  basis: {
    data: '技术侧：加速卡与光模块代际迭代明确，液冷成为枢纽节点准入条件；商业侧：租赁与云计费并行、算力券普遍；渗透侧：智能算力占比向 35% 目标靠拢。',
    logic:
      '以「技术是否可标准化交付、收益是否可测算、需求是否由真实业务驱动」三条同时成立为进入主流市场的判据。',
    impact:
      '可按主流市场早期口径做组合授信：设备端看订单与产能，资产端看上架率与租约，服务端看客户留存与毛利。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 03 市场需求趋势分析

export const DEMAND_MODEL = {
  formula:
    '智能算力需求 = 训练侧算力 + 推理侧算力（训练 = 任务量 × 单任务算力；推理 = 日均调用量 × 单次算力 × 峰值系数）',
  method:
    'Bottom-up 自下而上：先按大模型训练任务量估算训练侧，再按日均 Token 调用量与单次算力消耗估算推理侧，最后与智算中心上架规模、运营商集采量交叉验证。',
  factors: [
    {
      key: 'train',
      label: '训练侧任务量',
      value: '增速放缓',
      dir: 'watch',
      text: '基础大模型预训练向头部集中，训练集群需求从「多家共建」转为「少数超大集群」，单项目规模变大、项目数变少。',
      source: 'demandModel',
    },
    {
      key: 'infer',
      label: '推理调用量',
      value: '↑↑',
      dir: 'up',
      text: '应用侧接入大模型后调用量按日频增长，推理对时延与并发敏感，推动边缘与区域节点算力需求。',
      source: 'demandModel',
    },
    {
      key: 'efficiency',
      label: '单卡有效算力',
      value: '↑',
      dir: 'up',
      text: '加速卡代际提升 + 集群网络优化，同等业务量所需卡数下降，是需求测算里最容易被高估的变量。',
      source: 'techRoadmap',
    },
    {
      key: 'power',
      label: '电力与机架约束',
      value: '刚性',
      dir: 'watch',
      text: '单机柜功率从 8—12kW 抬升到 30—60kW，供电与制冷能力成为项目落地的硬约束，能评与能耗指标决定实际上限。',
      source: 'miitPlan',
    },
  ],
  result: {
    value: '450–600 EFLOPS',
    label: '2026 年国内智能算力需求测算',
    note: '本页 bottom-up 测算口径，按智能算力口径折算，与 2025 年 300 EFLOPS 总算力、35% 智能算力占比的政策目标衔接；口径为示意，落具体项目需按客户业务量重算。',
    source: 'demandModel',
  },
  basis: {
    data: '政策目标：2025 年算力规模 300 EFLOPS、智能算力占比 35%；需求侧：推理调用量增长、训练任务向头部集中；约束侧：单机柜功率抬升与能耗指标。',
    logic:
      '先按训练任务量估训练侧，再按调用量估推理侧，用智算中心上架规模与运营商集采量做双向校验，最后按单卡有效算力折减。',
    impact:
      '需求结构决定客户结构：推理侧客户更分散、单笔金额更小但持续性强，适合标准化产品；训练侧客户集中、单笔大，需要项目制授信。',
  },
  scenarios: [
    {
      key: 'training',
      label: '训练集群',
      score: 76,
      tone: 'up',
      status: '项目变少、单体变大',
      text: '万卡级集群成为头部标配，对网络、液冷与供配电的配套要求同步抬升，单项目投资规模上台阶。',
      source: 'idcStat',
    },
    {
      key: 'inference',
      label: '推理服务',
      score: 88,
      tone: 'up',
      status: '本阶段景气最高的场景',
      text: '应用接入带来持续调用，算力消耗可按 token 计量，收入可预测性优于训练集群。',
      source: 'demandModel',
    },
    {
      key: 'local',
      label: '地方智算中心',
      score: 52,
      tone: 'watch',
      status: '建设快、上架慢',
      text: '地方项目集中上量，但本地需求不足、缺少调度渠道，上架率与租赁价格双低，是全链风险最集中的一环。',
      source: 'marketRule',
    },
    {
      key: 'private',
      label: '行业私有化算力',
      score: 70,
      tone: 'up',
      status: '合规驱动、单价高',
      text: '金融、政务、医疗因数据合规要求倾向私有化部署，单卡产出高但交付与运维成本也高。',
      source: 'judgement',
    },
  ],
  source: 'demandModel',
};

// ---------------------------------------------------------------- 04 产业链景气分析

// 一级环节名严格沿用产业链地图（compute-chain.json）的 levels[].label，
// 保证行业页与产业链地图两侧口径一致、可互相跳转核对。
export const CHAIN_POSITIONS = [
  {
    key: 'up',
    label: '上游',
    note: '芯片 · 器件 · 材料 · 封装',
    tone: 'up',
    levels: [
      {
        label: '算力芯片与核心器件',
        score: 82,
        tone: 'up',
        status: '需求确定、供给受制于先进制程与 HBM',
        opportunity:
          '国产加速卡在政务与运营商场景放量，配套的存储接口、先进封装、PCB 与光芯片同步受益',
        risk: '先进制程产能与 HBM 供给是硬约束，单点卡住即影响整机交付节奏',
        source: 'techRoadmap',
      },
    ],
  },
  {
    key: 'mid',
    label: '中游',
    note: '整机 · 网络 · 光互联 · 温控',
    tone: 'up',
    levels: [
      {
        label: '算力设备与网络',
        score: 86,
        tone: 'up',
        status: '订单能见度最高，800G 与液冷进入放量期',
        opportunity:
          'AI 服务器整机、800G/1.6T 光模块、交换机与冷板液冷同步受益，交付节奏跟随芯片供给',
        risk: '整机毛利被芯片成本挤压，集成商垫资重、账期长，现金流压力大于利润压力',
        source: 'idcStat',
      },
    ],
  },
  {
    key: 'down',
    label: '下游',
    note: '智算中心 · 算力服务 · 运营',
    tone: 'watch',
    levels: [
      {
        label: '算力基础设施',
        score: 68,
        tone: 'watch',
        status: '建设强度高，上架率分化明显',
        opportunity: '枢纽节点集群与运营商智算中心具备调度与客户资源，机架与供电资源本身成为稀缺品',
        risk: '地方自建项目缺租约、缺调度，上架率低导致折旧与电费双重压力',
        source: 'marketRule',
      },
      {
        label: '算力服务与运营',
        score: 72,
        tone: 'up',
        status: '收入可计量，价格高位回落',
        opportunity: '推理调用带来持续现金流，算力调度与运维服务形成客户黏性',
        risk: '租赁单价下行，前期按高价测算的项目回收期被拉长',
        source: 'idcStat',
      },
    ],
  },
  {
    key: 'demand',
    label: '需求侧',
    note: '终端用户 · 行业应用',
    tone: 'watch',
    levels: [
      {
        label: '算力需求方',
        score: 74,
        tone: 'watch',
        status: '付费能力与持续性决定整条链的需求真实性',
        opportunity: '大模型训练与推理、行业智能化改造带来长周期算力采购，头部客户签约周期长、黏性高',
        risk: '需求侧预算集中在少数头部客户，价格敏感度高，中小客户付费持续性待验证',
        source: 'marketRule',
      },
    ],
  },
];

// 环节样本规模的构建期快照（与 compute-chain.json 2026-10 口径一致）。
// 运行时优先读取产业链地图的真实数据，失败时回落到此快照，并如实标注。
export const CHAIN_SAMPLE_SNAPSHOT = {
  算力芯片与核心器件: { companies: 1148, leaders: 20, core: 176, tail: 69, children: 5 },
  算力设备与网络: { companies: 872, leaders: 30, core: 232, tail: 167, children: 7 },
  算力基础设施: { companies: 508, leaders: 8, core: 123, tail: 68, children: 2 },
  算力服务与运营: { companies: 815, leaders: 18, core: 134, tail: 116, children: 3 },
  算力需求方: { companies: 132, leaders: 0, core: 9, tail: 4, children: 1 },
};

// 把产业链地图的 levels 合并进环境节研判行。纯函数，便于单测直接校验。
export function buildChainPositions(levels) {
  const live = new Map(
    (Array.isArray(levels) ? levels : [])
      .filter((level) => level?.label)
      .map((level) => [level.label, level]),
  );
  return CHAIN_POSITIONS.map((position) => ({
    ...position,
    levels: position.levels.map((item) => {
      const match = live.get(item.label);
      const sample = match
        ? {
            companies: match.companyCount ?? 0,
            leaders: match.leaderCount ?? 0,
            core: match.coreCount ?? 0,
            tail: match.tailCount ?? 0,
            children: match.childCount ?? (match.children || []).length,
          }
        : CHAIN_SAMPLE_SNAPSHOT[item.label] || null;
      return { ...item, sample, live: Boolean(match) };
    }),
  }));
}

export const CHAIN_OUTLOOK_NOTE =
  '环节景气度为研判口径（橙色标注），环节样本规模取自产业链地图的实时数据；两者分列，避免把样本结构当成景气结论。算力产业链只统计在链企业：3475 家（452 上市 + 3023 非上市），样本结构与景气判断不可混用。';

// 产业链景气总判断。
export const CHAIN_VERDICT = {
  headline: '中游设备与网络是订单能见度最高的一环，上游受供给约束、下游看上架率',
  text: '中游 AI 服务器、交换机与光模块直接承接智算中心建设订单，交付节奏跟随芯片供给，是当前景气度最高的位置；上游芯片与核心器件需求确定但受先进制程、HBM 与光芯片良率约束，属「有单交不出」；下游分化最大——有调度渠道与长约的枢纽节点资产运行良好，地方自建项目上架率不足，是全链风险最集中处。',
  basis: {
    data: '产业链地图在链 3475 家企业、5 个一级环节 / 18 个二级环节：上游 1148 家（龙头 20）、中游 872 家（龙头 30）、基础设施 508 家（龙头 8）、服务与运营 815 家（龙头 18）、需求侧 132 家。',
    logic:
      '景气度按「需求确定性 + 供给约束强度 + 价格趋势 + 上架兑现度」四要素相对打分，并与链内企业与龙头分布交叉验证。',
    impact:
      '授信资源应向上游有产能、中游有订单的企业集中；下游只做有长约与调度渠道的资产，地方自建项目从严。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 05 技术路线判断

export const TECH_ROUTES = [
  {
    key: 'gpgpu',
    name: '通用 GPU（GPGPU）',
    maturity: 88,
    stage: '规模化商用',
    tone: 'up',
    share: '训练侧主流',
    advantage: '生态与工具链最成熟，框架、算子与开发者社区完备，是训练集群的默认选择。',
    risk: '单卡成本与功耗高，供应受先进制程与封装产能约束，交付周期不可控。',
    outlook: '短期仍是训练侧基本盘；随推理占比上升，其在推理场景的份额会被专用芯片分流。',
    source: 'techRoadmap',
  },
  {
    key: 'asic',
    name: 'ASIC / NPU 专用加速',
    maturity: 72,
    stage: '规模放量',
    tone: 'up',
    share: '云厂商自研占比抬升',
    advantage: '针对特定算子优化，单位算力成本与能效优于通用方案，适合大规模推理与自有业务。',
    risk: '通用性弱、生态迁移成本高，模型结构变化可能导致前期投入贬值。',
    outlook: '推理侧最主要的替代路线，跟踪指标是「自研芯片占云厂商新增算力的比例」。',
    source: 'techRoadmap',
  },
  {
    key: 'optical',
    name: '高速光互联（800G / 1.6T / CPO）',
    maturity: 66,
    stage: '放量前期',
    tone: 'up',
    share: '800G 已成主流、1.6T 起量',
    advantage: '集群规模越大，网络对整体算力有效性的影响越大；光模块速率升级直接决定集群效率。',
    risk: '光芯片与 DSP 供给紧张，CPO 路线对可维护性提出新要求，标准尚未统一。',
    outlook: '与集群规模同向增长，是算力链中确定性最高、也最容易被海外供应节奏影响的环节。',
    source: 'techRoadmap',
  },
  {
    key: 'liquid',
    name: '液冷（冷板 / 浸没）',
    maturity: 74,
    stage: '规模化应用',
    tone: 'up',
    share: '枢纽节点新建项目为主',
    advantage: '单机柜功率抬升后风冷失效，液冷是满足 PUE ≤1.25 的主要技术路径，且可回收余热。',
    risk: '改造成本高、运维体系不成熟，浸没式还面临介质成本与兼容性问题。',
    outlook: '由「可选」变「准入」，是能效政策下最确定的增量，跟踪指标是液冷在新建机架中的渗透率。',
    source: 'miitPlan',
  },
  {
    key: 'beyond',
    name: '存算一体 / 光子计算',
    maturity: 30,
    stage: '早期验证',
    tone: 'down',
    share: '在链企业以初创为主',
    advantage: '有望绕开存储墙与功耗瓶颈，在特定推理场景具备数量级能效潜力。',
    risk: '工艺与生态均未成熟，短期不具备规模化交付能力，商业化路径不确定。',
    outlook: '属远期期权，授信上适合以科技金融小额试点跟踪，不宜按产能逻辑投放。',
    source: 'techRoadmap',
  },
];

export const TECH_VERDICT = {
  headline: '训练看通用 GPU，推理看专用加速，网络与液冷是全链最确定的两端',
  text: '通用 GPU 仍是训练侧基本盘，但推理占比上升正在把增量让给 ASIC/NPU；与芯片路线的不确定相比，光互联速率升级与液冷渗透是两条方向明确、可跟踪的确定性主线——它们由集群规模与能效政策驱动，不依赖某一家芯片厂商的成败。',
  basis: {
    data: '通用 GPU 为训练侧主流；专用加速在云厂商自研中占比抬升；800G 光模块已主流、1.6T 起量；液冷为枢纽节点新建项目满足 PUE ≤1.25 的主要路径。',
    logic:
      '以「是否有规模化交付案例 + 单位算力成本是否进入经济性阈值」双条件判定路线成熟度，单看参数不作依据。',
    impact:
      '技术路线直接决定设备抵押物残值：通用 GPU 残值相对可估，专用加速与早期路线贬值更快，抵押率与期限需按路线成熟度分档。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 06 竞争格局变化

export const COMPETITION = {
  moves: [
    {
      key: 'leader',
      label: '龙头企业动作',
      items: [
        '运营商以集采方式锁定 AI 服务器与智算中心建设份额，成为最大单一买方，议价能力持续增强。',
        '互联网与云厂商推进自研加速卡，把新增算力的相当比例转向自有芯片，压缩通用 GPU 的增量空间。',
        '头部整机与光模块厂商从「卖产品」转向「产品 + 交付 + 运维」捆绑，交付能力成为中标关键。',
      ],
      source: 'idcStat',
    },
    {
      key: 'capacity',
      label: '新增产能',
      items: [
        '整机与光模块扩产相对理性，产能瓶颈主要在芯片端而非组装端。',
        '智算中心建设从「抢指标」转向「抢客户」，同一区域内多个项目争抢有限租户。',
      ],
      source: 'biddingStat',
    },
    {
      key: 'overseas',
      label: '全球分工',
      items: [
        '先进制程、HBM 与高端光芯片仍集中在少数海外供应商，国产替代在中低端先行。',
        '国产算力方案在「一带一路」与部分新兴市场以整体交付方式输出，配套标准与生态同步出海。',
      ],
      source: 'techRoadmap',
    },
    {
      key: 'product',
      label: '新产品发布',
      items: [
        '加速卡从单卡性能竞争转向「卡 + 互联 + 集群」整体方案竞争，超节点成为新形态。',
        '800G 光模块批量交付、1.6T 进入样品与首批交付，CPO 在头部交换机方案中试点。',
        '冷板液冷成为新建智算中心标配，浸没式在超高功率密度场景试点。',
      ],
      source: 'techRoadmap',
    },
    {
      key: 'alliance',
      label: '战略合作',
      items: [
        '芯片厂商与整机、云厂商组建软硬协同联盟，围绕框架适配与算子库做联合优化。',
        '地方国资平台与运营商、算力服务商合作成立运营主体，把「建设」和「招商」捆绑。',
      ],
      source: 'ndrcHub',
    },
  ],
  tiers: [
    {
      key: 't1',
      label: '第一梯队',
      tone: 'up',
      criteria: '技术 + 产能 + 客户三重优势',
      members: '头部加速卡设计企业、光模块龙头、AI 服务器头部整机厂、运营商智算运营主体',
      evidence: '在链 4 个一级环节共 46 个龙头席位，集中在芯片、光模块与整机；订单能见度最长。',
      hint: '具备议价权与交付确定性，是授信的核心客户群，可给综合授信与较长期限。',
      source: 'chainMap',
    },
    {
      key: 't2',
      label: '第二梯队',
      tone: 'watch',
      criteria: '细分环节优势',
      members: '液冷温控、PCB 与覆铜板、电源与供配电、高速连接、IDC 与机房集成',
      evidence: '受益于确定性的量增，但议价能力弱于头部，毛利随客户结构波动。',
      hint: '按细分壁垒与客户集中度定条件，重点看单一大客户占比与账期。',
      source: 'judgement',
    },
    {
      key: 't3',
      label: '第三梯队',
      tone: 'down',
      criteria: '同质化竞争、上架率不足',
      members: '无调度渠道的地方智算中心、纯转售型算力服务商、无核心客户的中小集成商',
      evidence: '上架率与租赁价格双低，收入不足以覆盖折旧与电费，是全链出清压力最大的位置。',
      hint: '敞口需压降；确需支持的按项目制、短期限、强担保办理。',
      source: 'marketRule',
    },
  ],
  basis: {
    data: '在链 590 家企业中龙头 46 家、骨干 92 家、长尾 452 家，长尾占比 76.6%；运营商与互联网厂商为主要买方；国产替代集中在中低端器件与配套环节。',
    logic: '用集中度与龙头分布判断格局是否固化，用上架率与租赁价格判断尾部是否在出清。',
    impact:
      '客户分层直接映射授信分层：一梯队给综合授信，二梯队按细分壁垒与客户结构定条件，三梯队只做短周期、强担保业务。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 07 行业风险预警

export const RISK_RADAR = {
  dims: [
    {
      key: 'capacity',
      label: '供给过剩风险',
      score: 78,
      level: '高',
      tone: 'down',
      text: '地方智算中心集中上量，本地需求与调度渠道不足，出现「建好上不满」，同区域项目互相压价。',
      watch: '上架率、在建机架规模、同区域竞品项目数、租赁价格',
      source: 'marketRule',
    },
    {
      key: 'supplychain',
      label: '供应链风险',
      score: 80,
      level: '高',
      tone: 'down',
      text: '先进制程产能、HBM 供给、光芯片良率三条硬约束，任一收紧即压低整机出货与项目交付。',
      watch: '加速卡交期、HBM 代际切换、光芯片自给率',
      source: 'techRoadmap',
    },
    {
      key: 'tech',
      label: '技术路线风险',
      score: 62,
      level: '中高',
      tone: 'watch',
      text: '架构迭代周期约 1—1.5 年，专用加速与早期路线可能使专用产线与设备快速贬值。',
      watch: '通用 GPU 与专用加速的份额变化、机架功率密度、互联标准进展',
      source: 'techRoadmap',
    },
    {
      key: 'revenue',
      label: '项目收益风险',
      score: 70,
      level: '中高',
      tone: 'watch',
      text: '租赁单价下行、算力券退坡，前期按高价测算的项目回收期被拉长，现金流覆盖不足。',
      watch: '租赁单价、租约期限与客户结构、算力券兑付比例、电价',
      source: 'marketRule',
    },
    {
      key: 'policy',
      label: '政策与能耗风险',
      score: 52,
      level: '中',
      tone: 'watch',
      text: 'PUE 与能耗指标趋严，未达标项目面临整改或限产；地方补贴政策存在周期性调整。',
      watch: 'PUE 实测值、能耗指标获取情况、地方算力券政策延续性',
      source: 'miitPlan',
    },
    {
      key: 'demand',
      label: '需求兑现风险',
      score: 58,
      level: '中',
      tone: 'watch',
      text: '推理需求增长确定，但训练侧项目向头部集中，中小客户预算收缩可能导致局部需求落空。',
      watch: '推理调用量增速、行业客户预算、智算中心实际出租率',
      source: 'demandModel',
    },
  ],
  basis: {
    data: '上架率与租赁价格分化（第三方统计区间）；供应链三条硬约束（先进制程、HBM、光芯片）；PUE ≤1.25 的准入要求；训练侧项目向头部集中。',
    logic: '六维风险等权打分（0–100，越高越需关注），单项 ≥65 视为需在授信条件中显性设限。',
    impact:
      '供给过剩、供应链、项目收益三项需重点设限：对相应客户缩短期限、提高保证金或增加上架率与租约监控条款。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 08 银行业务机会分析

export const BANKING_OPPS = [
  {
    key: 'device',
    label: '芯片与器件制造',
    tone: 'up',
    products: ['供应链金融', '项目贷款', '科技金融'],
    basisText:
      '需求确定但供给受制于先进制程与封装产能，扩产与备货占用大量资金；客户集中于少数头部，账期与订单可核验。',
    action: '以头部客户订单与应付账款为纽带做供应链金融，扩产按设备交付节点分期投放。',
    link: { tab: 'credit', label: '查看授信评价' },
    source: 'techRoadmap',
  },
  {
    key: 'equipment',
    label: '设备与系统集成',
    tone: 'up',
    products: ['订单融资', '保函', '流动资金贷款'],
    basisText:
      'AI 服务器、交换机、光模块订单能见度最高，但垫资重、账期长，运营商集采回款节奏决定现金流。',
    action: '按中标合同做订单融资与履约保函，同步监控应收账款周转与单一大客户占比。',
    link: { tab: 'flow', label: '查看产业链地图' },
    source: 'biddingStat',
  },
  {
    key: 'asset',
    label: '智算中心资产',
    tone: 'watch',
    products: ['项目融资', '绿色金融', '租赁'],
    basisText:
      '机架与供电资源具备稀缺性，但项目回报完全取决于上架率与租约质量，地方自建项目风险显著高于枢纽节点。',
    action: '只做有长约锁定、有调度渠道的项目；按「租约覆盖 + 上架爬坡」做现金流压力测试后核定。',
    link: { tab: 'credit', label: '查看授信评价' },
    source: 'marketRule',
  },
  {
    key: 'service',
    label: '算力服务与运营',
    tone: 'up',
    products: ['流动资金贷款', '结算与现金管理'],
    basisText:
      '推理调用带来持续、可计量的现金流，客户黏性来自调度与运维能力，轻资产但毛利受价格下行影响。',
    action: '以月度算力账单与客户留存为核心指标核定额度，优先支持有稳定行业客户的运营主体。',
    link: { tab: 'map', label: '查看企业分布' },
    source: 'idcStat',
  },
];

export const BANKING_VERDICT = {
  headline: '机会集中在「上游有产能 + 中游有订单」两端，下游只做有租约的资产',
  text: '算力链的现金流确定性向上游产能与中游订单集中；下游智算中心不是不能做，而是必须按「有没有长约、有没有调度渠道」逐个项目判断，不能按机架数量一刀切。',
  basis: {
    data: '在链 590 家企业中，上游与中游合计 293 家、龙头 31 家，是订单与产能最集中的位置；下游基础设施与服务合计 297 家，龙头仅 15 家。',
    logic: '按「现金流可测性 × 客户层级 × 抵质押可得性」三要素排序，优先投向现金流可建模的环节。',
    impact: '推动授信从被动受理转向主动经营：先定环节与客户层级，再倒推产品与额度。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 09 AI 行业分析助手

export const ASSISTANT = {
  sources: [
    {
      key: 'policy',
      label: '政策',
      text: '国家枢纽节点批复、算力基础设施行动计划、地方算力券细则',
      cadence: '实时',
    },
    { key: 'news', label: '新闻', text: '行业媒体与主流财经媒体的算力产业动态', cadence: '每日' },
    {
      key: 'bidding',
      label: '招标数据',
      text: '运营商与央企 AI 服务器、交换机、光模块集采与智算中心 EPC 中标',
      cadence: '每日',
    },
    {
      key: 'company',
      label: '企业动态',
      text: '上市公司公告、扩产、订单与自研芯片进展',
      cadence: '每日',
    },
    {
      key: 'tech',
      label: '技术突破',
      text: '加速卡、光模块速率、液冷与互联标准进展',
      cadence: '每周',
    },
    {
      key: 'price',
      label: '算力价格',
      text: '算力租赁单价、加速卡与光模块价格、电价',
      cadence: '每周',
    },
    {
      key: 'finance',
      label: '投融资事件',
      text: '一级市场融资、IPO 与算力资产并购',
      cadence: '每周',
    },
  ],
  report: {
    title: '《算力产业宏观研判周报》',
    sections: [
      '行业一句话判断',
      '景气度评分与分项变化',
      '政策与枢纽节点进展',
      '需求与上架率变化',
      '产业链变化',
      '技术路线进展',
      '企业变化',
      '风险提示',
      '银行业务建议',
    ],
    note: '周报由上述七类抓取源自动汇总生成初稿，结论与银行建议需业务人员复核；抓取窗口与去重规则见周报页说明。',
  },
  cadence: [
    {
      key: 'quarter',
      label: '季度',
      text: '工信部与信通院算力规模、智能算力占比发布 → 更新规模读数与占比结构。',
    },
    {
      key: 'month',
      label: '月度',
      text: '运营商集采与智算中心招投标统计 → 更新中标规模、单价与交付节奏。',
    },
    {
      key: 'year',
      label: '年度',
      text: '《中国算力发展指数白皮书》与国家枢纽节点建设进展 → 更新区域格局与技术路线。',
    },
    {
      key: 'review',
      label: '结论复核',
      text: '上游数据更新后，本页研判口径（橙色标注）需由业务人员复核，不做自动改写。',
    },
  ],
  basis: {
    data: '七类抓取源覆盖政策、新闻、招投标、企业动态、技术、算力价格与投融资；周报输出九节固定结构。',
    logic:
      '抓取内容先按主题分类，再按影响范围与影响力排序，最后合成为结论；结论必须可回溯到原始报道。',
    impact: '把行业跟踪从「人工找资料」变成「按周复核结论」，为授信决策提供稳定的外部信息供给。',
  },
  source: 'assistantEngine',
};

// ---------------------------------------------------------------- 附 数据底座

// 六类观测指标：长期跟踪口径，与流程 / 分析页的指标分类框架对齐。
export const MACRO_GROUPS = [
  {
    key: 'scale',
    no: '01',
    title: '规模与需求',
    summary: '总量受政策牵引，结构向智能算力迁移',
    color: '#1d62d8',
    source: 'caictStat',
    items: [
      {
        name: '在用算力规模',
        reading: '2025 目标 300 EFLOPS',
        hint: '工信部行动计划口径，按总规模计，含通用与智能算力',
        source: 'miitPlan',
      },
      {
        name: '智能算力占比',
        reading: '目标 35%',
        hint: '结构指标，比总量更能反映真实算力质量',
        source: 'miitPlan',
      },
      {
        name: '枢纽节点新增算力占比',
        reading: '2025 目标 60% 以上',
        hint: '衡量「东数西算」落地程度，看新增而非存量',
        source: 'ndrcHub',
      },
      {
        name: '智算中心上架率',
        reading: '枢纽高、地方低',
        hint: '本阶段判断真实需求的核心读数，比开工与投资额可靠',
        source: 'marketRule',
      },
    ],
  },
  {
    key: 'usage',
    no: '02',
    title: '调用与利用',
    summary: '算力有没有被用起来，看这三个读数',
    color: '#0e9274',
    source: 'marketRule',
    items: [
      {
        name: '机架上架率',
        reading: '分化明显',
        hint: '枢纽节点集群普遍高于地方自建项目，是风险分层的直接依据',
        source: 'marketRule',
      },
      {
        name: '卡时利用率',
        reading: '训练集群高于推理',
        hint: '训练集群排队期利用率高，推理侧看并发与峰谷差',
        source: 'idcStat',
      },
      {
        name: '算力调度接入量',
        reading: '一体化算力网推进',
        hint: '接入国家枢纽节点调度平台的算力，出租率与价格更稳定',
        source: 'ndrcHub',
      },
      {
        name: '推理调用量',
        reading: '日频增长',
        hint: '需求侧最领先的读数，直接对应算力消耗与收入',
        source: 'demandModel',
      },
    ],
  },
  {
    key: 'price',
    no: '03',
    title: '价格与成本',
    summary: '租赁单价与单位算力成本决定项目生死',
    color: '#b07a1e',
    source: 'idcStat',
    items: [
      {
        name: '算力租赁单价',
        reading: '高位回落',
        hint: '按卡型与合同期限差异大，本页只给方向与区间',
        source: 'idcStat',
      },
      {
        name: '加速卡采购价',
        reading: '受供给约束',
        hint: '先进制程与 HBM 供给决定价格弹性',
        source: 'techRoadmap',
      },
      {
        name: '光模块价格',
        reading: '速率升级带动单价上移',
        hint: '800G 起量、1.6T 溢价明显，看结构不看均价',
        source: 'techRoadmap',
      },
      {
        name: '电价与 PUE',
        reading: 'PUE ≤1.25 为准入线',
        hint: '电费占智算中心运营成本大头，PUE 直接决定毛利',
        source: 'miitPlan',
      },
    ],
  },
  {
    key: 'policy',
    no: '04',
    title: '政策与机制',
    summary: '枢纽布局与补贴决定项目能不能算得过账',
    color: '#6f5bd0',
    source: 'miitPlan',
    items: [
      {
        name: '枢纽节点与集群布局',
        reading: '8 枢纽 · 10 集群',
        hint: '项目落地必须先看是否在集群范围内',
        source: 'ndrcHub',
      },
      {
        name: '能效与能耗要求',
        reading: 'PUE ≤1.25',
        hint: '未达标项目面临整改或限产，是硬约束',
        source: 'miitPlan',
      },
      {
        name: '算力券与补贴',
        reading: '地方为主、周期调整',
        hint: '直接影响项目回报测算，需按年跟踪延续性',
        source: 'marketRule',
      },
      {
        name: '一体化算力网',
        reading: '跨区域调度推进',
        hint: '调度接入能力决定西部算力能否卖到东部',
        source: 'ndrcHub',
      },
    ],
  },
  {
    key: 'tech',
    no: '05',
    title: '技术与能效',
    summary: '路线切换与能效红线都从这里看',
    color: '#cf5b2e',
    source: 'techRoadmap',
    items: [
      {
        name: '加速卡架构占比',
        reading: '通用 GPU 为主、专用加速上行',
        hint: '训练与推理的结构差异是最关键的跟踪点',
        source: 'techRoadmap',
      },
      {
        name: '光模块速率结构',
        reading: '800G 主流、1.6T 起量',
        hint: '集群规模越大，网络对有效算力的影响越大',
        source: 'techRoadmap',
      },
      {
        name: '液冷渗透率',
        reading: '新建项目为主',
        hint: '单机柜功率抬升后，液冷由可选变准入',
        source: 'techRoadmap',
      },
      {
        name: '机架功率密度',
        reading: '30—60kW 成为常态',
        hint: '供电与制冷能力是项目落地的真实上限',
        source: 'miitPlan',
      },
    ],
  },
  {
    key: 'global',
    no: '06',
    title: '供应链与资本',
    summary: '外部约束与资金温度的先行读数',
    color: '#5f7b8c',
    source: 'investStat',
    items: [
      {
        name: '先进制程与 HBM 供给',
        reading: '硬约束',
        hint: '单点收紧即影响整机出货与项目交付',
        source: 'techRoadmap',
      },
      {
        name: '国产替代进度',
        reading: '中低端先行',
        hint: '看国产卡在新增算力中的占比，而非发布会数量',
        source: 'techRoadmap',
      },
      {
        name: '算力领域投资',
        reading: '强度高位',
        hint: '地方国资与运营商是主要出资方',
        source: 'investStat',
      },
      {
        name: '一二级融资温度',
        reading: '融资 / IPO / 并购',
        hint: '资本先行，用于验证景气预期',
        source: 'investStat',
      },
    ],
  },
];

// 上架率趋势（历史趋势比较）。
// 说明：算力产业无统一的官方上架率序列，以下为本页按公开项目披露与调研口径整理的
// 测算值，只看方向与分化，不作为统计发布值引用。
export const UTILIZATION_TREND = {
  title: '智算中心上架率：枢纽节点与地方项目的分化在扩大',
  source: 'judgement',
  unit: '%',
  note:
    '本页测算口径：2023—2025 为全国平均估算，26H1 拆为枢纽节点集群与地方自建项目两组。' +
    '分化说明「有没有客户与调度渠道」比「建得多不多」更决定资产质量。',
  legend: [
    { key: 'year', label: '全国平均（测算）' },
    { key: 'half', label: '26H1 分组（测算）' },
  ],
  bars: [
    { label: '2023', value: 58, kind: 'year' },
    { label: '2024', value: 62, kind: 'year' },
    { label: '2025', value: 65, kind: 'year' },
    { label: '26H1 枢纽', value: 72, kind: 'half' },
    { label: '26H1 地方', value: 48, kind: 'half' },
  ],
};

// 算力规模与政策目标（EFLOPS）。
export const POLICY_TARGETS = {
  title: '算力规模与政策目标（EFLOPS）',
  source: 'miitPlan',
  note:
    '2022—2024 为工信部公开披露的在用算力规模口径，2025 年 300 EFLOPS 为《算力基础设施高质量发展行动计划》目标，' +
    '其中智能算力占比目标 35%；口径为总规模，含通用与智能算力。',
  legend: [
    { key: 'actual', label: '已建成投运' },
    { key: 'target', label: '政策目标' },
  ],
  bars: [
    { label: '2022', value: 180, kind: 'actual' },
    { label: '2023', value: 230, kind: 'actual' },
    { label: '2024', value: 246, kind: 'actual' },
    { label: '2025 目标', value: 300, kind: 'target' },
  ],
};

// 读法纪律（把公开数据转成趋势方向的判读规则）。
export const MACRO_DISCIPLINES = [
  {
    key: 'structure',
    title: '看算力结构不看机架数量',
    text: '机架数与投资额是建设指标，智能算力占比与上架率才是使用指标；同样 1 万个机架，能不能租出去差别极大。',
    source: 'reading',
  },
  {
    key: 'utilization',
    title: '上架率领先租金',
    text: '上架率下行会先于租赁单价下跌出现：租户不足 → 降价抢客 → 单价与毛利同步下探，是项目风险最领先的读数。',
    source: 'reading',
  },
  {
    key: 'demand',
    title: '区分训练侧与推理侧',
    text: '训练侧项目少、单体大、周期性强；推理侧项目多、单体小、持续性好。两类客户的授信产品与期限结构必须分开设计。',
    source: 'reading',
  },
];

// 顶部一句话研判（供页面头部与测试复用）。
export const MACRO_VERDICT = {
  eyebrow: 'MACRO VERDICT · 2026H2',
  source: 'judgement',
  headline: SECTOR_VERDICT.headline,
  summary: SECTOR_VERDICT.summary,
  tags: [
    { key: 'scale', label: '规模', text: '2025 目标 300 EFLOPS、智算占比 35%', tone: 'up' },
    { key: 'usage', label: '利用', text: '上架率枢纽高、地方低，分化扩大', tone: 'watch' },
    { key: 'price', label: '价格', text: '租赁单价高位回落', tone: 'watch' },
    { key: 'risk', label: '风险', text: '供应链约束与供给过剩并存', tone: 'down' },
  ],
};
