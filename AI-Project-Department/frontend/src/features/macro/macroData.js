// 「宏观」页数据：储能产业宏观研判（静态研判口径，随公开数据定期更新）。
//
// 组织方式对齐《储能行业宏观研判智能看板》的模块定义：
//   01 行业总体判断 → 02 行业生命周期 → 03 市场需求趋势 → 04 产业链景气分析
//   → 05 技术路线判断 → 06 竞争格局变化 → 07 行业风险预警 → 08 银行业务机会
//   → 09 AI 行业分析助手 → 附 观测指标底座（历史趋势与长期指标）
//
// 每项判断都带三类信息，保证「判断可追溯」：
//   source → macroSources.js 的来源元数据，页面上可点击溯源；
//   basis  → { data, logic, impact } 三段式：数据依据 / 判断逻辑 / 影响分析。
// 约定：凡由本页推导的结论，source 一律指向 ai 类口径（研判 / 测算），不冒充公开数据。

export const MACRO_META = {
  industry: '储能产业',
  eyebrow: 'MACRO RESEARCH HUB · 2026H2',
  asOf: '2026-06',
  // 模块导航：id 同时作为锚点，供页内跳转使用。
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
  { key: 'installed', value: '168.3GW', label: '累计投运装机 · 同比 +59%', source: 'cnesaStat' },
  { key: 'standalone', value: '69.3%', label: '独立储能占新增装机', source: 'cnesaStat' },
  { key: 'hours', value: '1195h', label: '等效利用小时 · 2025 全年', source: 'neaReport' },
  { key: 'price', value: '599元/kWh', label: '2h 中标均价 · 同比 +8%', source: 'priceStat' },
  { key: 'overseas', value: '298GWh', label: '海外订单签约 · 同比 +83%', source: 'cnesaStat' },
  { key: 'target', value: '1.8亿kW', label: '2027 政策目标 · 专项方案', source: 'policyDoc' },
];

// ---------------------------------------------------------------- 01 行业总体判断

export const SECTOR_VERDICT = {
  score: 78,
  grade: '景气偏强',
  stage: '规模化建设期 → 市场化运营期',
  headline: '规模扩张进入换挡期，行业分水岭从「建得多」转向「用得好」',
  summary:
    '26H1 累计装机 168.3GW / 448.7GWh、同比 +59% / +71%，但新增功率与能量同比分别下降 18% / 16%——' +
    '增长并未失速，而是建设节奏回归常态。真正改变行业性质的是收益结构：独立储能占新增装机 69.3%，' +
    '容量电价 + 电能量 + 辅助服务三维收益正式成立，判断这个行业第一次可以「按资产算账」而不是「按装机讲故事」。',
  subScores: [
    { key: 'demand', label: '需求景气', score: 82, tone: 'up' },
    { key: 'supply', label: '供给格局', score: 68, tone: 'watch' },
    { key: 'price', label: '价格成本', score: 74, tone: 'up' },
    { key: 'policy', label: '政策机制', score: 88, tone: 'up' },
    { key: 'tech', label: '技术安全', score: 71, tone: 'watch' },
    { key: 'global', label: '海外资本', score: 85, tone: 'up' },
  ],
  opportunities: [
    {
      title: '独立储能资产化',
      text: '占新增装机 69.3%（同比 +13.9pct），容量电价提供保底现金流，是首个「可承贷、可算 IRR」的储能资产类型。',
      source: 'cnesaStat',
    },
    {
      title: '海外利润盘成型',
      text: '26H1 海外订单签约 298GWh（+83%），欧洲工商储预计 +70%；海外溢价是国内利润的主要来源。',
      source: 'cnesaStat',
    },
    {
      title: 'AIDC 配储新场景',
      text: '数据中心备电从「可选」变「刚需」，高倍率电芯与备电系统成为新的增量赛道。',
      source: 'ggiiStat',
    },
  ],
  risks: [
    {
      title: '结构性产能过剩',
      text: '头部电芯产能利用率 >90%，但尾部中小企业开工不足、订单向头部集中，二八分化仍在加剧。',
      source: 'ggiiStat',
    },
    {
      title: '国内工商储收益承压',
      text: '分时电价政策调整后国内工商储景气走弱，项目收益空间被压缩，成本难以下传。',
      source: 'ggiiStat',
    },
    {
      title: '海外风险集中暴露',
      text: '汇率波动、出口退税退坡、关税上调与合规壁垒抬升，叠加欧洲渠道库存堆积风险。',
      source: 'ggiiStat',
    },
  ],
  basis: {
    data: '26H1 累计装机 168.3GW / 448.7GWh（+59% / +71%）、新增 21.81GW / 58.60GWh（-18% / -16%）、独立储能占新增 69.3%（+13.9pct）、平均储能时长 2.69 小时。',
    logic:
      '需求侧看配额与消纳压力，供给侧看产能利用率与集中度，价格侧看中标均价与成本剪刀差；三者同向改善才判定为景气上行。',
    impact:
      '决定授信策略从「扩产即支持」转向「看订单质量与海外布局」；独立储能资产可作为项目融资的合格标的入场。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 02 行业生命周期判断

export const LIFECYCLE = {
  stages: ['创新者', '早期采用者', '主流市场', '成熟市场'],
  currentIndex: 2,
  current: '主流市场（早期）',
  note: '采用技术采用生命周期模型：已跨过「早期采用者」鸿沟，进入主流市场早期，尚未到成熟市场的价格与服务竞争阶段。',
  metrics: [
    {
      key: 'tech',
      label: '技术成熟度',
      score: 84,
      tone: 'up',
      text: '电芯循环寿命 >1.2 万次、300Ah 以上大电芯出货占比超 55%，已进入标准化量产；钠电等新路线仍在验证。',
      source: 'techStat',
    },
    {
      key: 'model',
      label: '商业模式成熟度',
      score: 66,
      tone: 'watch',
      text: '容量电价 + 电能量 + 辅助服务三维收益落地，但现货市场覆盖省份仍有限，收益结构省际差异大。',
      source: 'marketRule',
    },
    {
      key: 'penetration',
      label: '市场渗透情况',
      score: 58,
      tone: 'watch',
      text: '独立储能占新增装机 69.3%，从新能源配套角色转为电网公共调节资源；但用户侧渗透仍处早期。',
      source: 'cnesaStat',
    },
    {
      key: 'policyDep',
      label: '政策依赖度',
      score: 55,
      tone: 'watch',
      text: '强制配储退坡、容量电价与现货机制接续，行业对行政性补贴的依赖度下行，但仍未完全市场化。',
      source: 'policyDoc',
    },
  ],
  basis: {
    data: '技术侧循环寿命与电芯规格已标准化；商业侧独立储能占比 69.3%、容量电价机制 2026 年落地；渗透侧新增项目平均时长 2.69 小时。',
    logic:
      '以「技术是否标准化、收益是否可测算、需求是否由市场化机制驱动」三条同时成立为进入主流市场的判据。',
    impact:
      '适合从「试验性授信」转为「常态化组合授信」；但成熟度指标尚未满格，授信需对单项目收益结构逐笔核实。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 03 市场需求趋势分析

export const DEMAND_MODEL = {
  formula: '储能需求 = 新能源新增装机 × 配储比例 × 储能时长 × 电网调节需求系数',
  method:
    'Bottom-up 自下而上：先锁定新能源新增装机，再逐层乘算配储比例、时长与电网调节需求系数，最后与独立储能、用户侧、海外三条支线交叉验证。',
  factors: [
    {
      key: 'capacity',
      label: '新能源新增装机',
      value: '约 265GW',
      dir: 'up',
      text: '2026 年预计光伏新增 1.8 亿千瓦、风电新增 85GW，是需求测算的总量底盘。',
      source: 'demandModel',
    },
    {
      key: 'ratio',
      label: '配储比例',
      value: '15%–20%',
      dir: 'watch',
      text: '强制配储退坡后转为市场化配置，比例区间下移，配储承诺兑现度需按省核实。',
      source: 'demandModel',
    },
    {
      key: 'hours',
      label: '储能时长',
      value: '2.69h → 4h',
      dir: 'up',
      text: '新增项目平均时长 2.69 小时（同比 +2.3%），电网侧目标等效顶峰 4 小时，单位功率的容量需求上行。',
      source: 'cnesaStat',
    },
    {
      key: 'grid',
      label: '电网调节需求系数',
      value: '↑',
      dir: 'up',
      text: '新能源渗透率抬升 + 数据中心负荷增长，调峰调频与备电需求同步放大，系数上修。',
      source: 'cnesaStat',
    },
  ],
  result: {
    value: '110–130 GWh',
    label: '2026 年国内新增需求测算',
    note: '本页 bottom-up 测算口径，与 26H1 实际新增 58.60GWh 的节奏自洽；口径为示意，落具体项目需按省重算。',
    source: 'demandModel',
  },
  basis: {
    data: '光伏新增约 1.8 亿千瓦、风电新增约 85GW 的装机预测，配储比例 15%–20% 的政策区间，平均时长 2.69 小时，以及独立储能占新增 69.3% 的结构数据。',
    logic:
      '先按总量底盘乘配储比例与时长得到配储需求，再叠加独立储能与用户侧的机制驱动增量，最后与半年实际新增量对照校准。',
    impact:
      '需求中枢决定产能与授信节奏：若实际新增持续低于测算下限，说明配储承诺兑现不足，应同步下调扩产类授信。',
  },
  scenarios: [
    {
      key: 'newbuild',
      label: '新能源装机驱动',
      score: 72,
      tone: 'up',
      status: '总量最大，但增速换挡',
      text: '风光配储仍是需求基本盘；新增功率下降 18%，量增来自时长拉长而非功率扩张。',
      source: 'cnesaStat',
    },
    {
      key: 'standalone',
      label: '独立储能',
      score: 88,
      tone: 'up',
      status: '本阶段景气最高的场景',
      text: '占新增装机 69.3%，容量电价 + 现货套利 + 辅助服务三维收益成立，是唯一可独立核算的资产。',
      source: 'cnesaStat',
    },
    {
      key: 'ci',
      label: '工商业储能',
      score: 58,
      tone: 'watch',
      status: '国内走弱、海外对冲',
      text: '国内分时电价调整后景气走弱，回收期 3–5 年；增量主要来自欧洲（预计 +70%）等海外市场。',
      source: 'ggiiStat',
    },
    {
      key: 'overseas',
      label: '海外储能',
      score: 85,
      tone: 'up',
      status: '利润引擎，风险同步上升',
      text: '26H1 海外订单签约 298GWh（+83%），欧洲、中东、澳洲多点爆发；同时面临库存与合规风险。',
      source: 'cnesaStat',
    },
  ],
  source: 'demandModel',
};

// ---------------------------------------------------------------- 04 产业链景气分析

// 一级环节名严格沿用产业链地图（storage-chain.json）的 levels[].label，
// 保证宏观页与产业链地图两侧口径一致、可互相跳转核对。
export const CHAIN_POSITIONS = [
  {
    key: 'up',
    label: '上游',
    note: '资源 · 器件 · 装备 · 检测',
    tone: 'watch',
    levels: [
      {
        label: '资源与材料',
        score: 56,
        tone: 'watch',
        status: '资源价格高位、材料端承压',
        opportunity: '头部通过长协锁价与回收网络对冲成本波动',
        risk: '锂盐与铜等原料价格波动直接冲击毛利，尾部长协能力弱',
        source: 'ggiiStat',
      },
      {
        label: '核心电子器件',
        score: 74,
        tone: 'up',
        status: 'IGBT 等功率器件随 PCS 提价修复',
        opportunity: '构网型与大功率 PCS 放量带动器件需求升级',
        risk: 'AI 算力虹吸晶圆产能，交付周期与价格波动风险上行',
        source: 'ggiiStat',
      },
      {
        label: '核心装备',
        score: 68,
        tone: 'up',
        status: '锂电装备成熟、长时储能装备待放量',
        opportunity: '液流 / 压缩空气 / 氢储能装备进入示范与招标起步期',
        risk: '长时路线商业化节奏不确定，装备产能易闲置',
        source: 'techStat',
      },
      {
        label: '检测认证与标准',
        score: 62,
        tone: 'watch',
        status: '新版安全规范落地带动检测量',
        opportunity: '热失控预警等技术要求提高，检测与认证需求刚性增长',
        risk: '环节规模小、以资质壁垒为主，龙头缺失',
        source: 'techStat',
      },
    ],
  },
  {
    key: 'mid',
    label: '中游',
    note: '电池与核心部件 · 系统集成',
    tone: 'up',
    levels: [
      {
        label: '电池与核心部件',
        score: 86,
        tone: 'up',
        status: '产能利用率高位、订单排产至 2027',
        opportunity: '头部电芯产能利用率 >90%，大容量电芯出货占比超 55%，盈利修复通道打开',
        risk: '二线电芯与同质化 PCS 厂商客户流失，价格战风险仍存',
        source: 'ggiiStat',
      },
      {
        label: '系统集成与工程建设',
        score: 79,
        tone: 'up',
        status: '集中度提升、订单向链主集中',
        opportunity: '全球系统集成前十占 73% 份额，中国企业包揽前四席',
        risk: '集成商垫资与质保责任重，现金流压力大于毛利压力',
        source: 'ggiiStat',
      },
    ],
  },
  {
    key: 'down',
    label: '下游',
    note: '应用场景 · 运营服务',
    tone: 'up',
    levels: [
      {
        label: '应用与运营',
        score: 76,
        tone: 'up',
        status: '收益机制落地，运营能力分化',
        opportunity: '容量电价 + 现货套利 + 辅助服务三元收益，运营效率决定资产价值',
        risk: '容量电费按调度考核兑现，可用率不达标将直接扣减收入',
        source: 'marketRule',
      },
    ],
  },
];

// 环节样本规模的构建期快照（与 storage-chain.json 2026-10 全量口径一致：2,457 家在链）。
// 运行时优先读取产业链地图的真实数据，失败时回落到此快照，并如实标注。
export const CHAIN_SAMPLE_SNAPSHOT = {
  资源与材料: { companies: 555, leaders: 28, core: 107, tail: 420, children: 3 },
  核心电子器件: { companies: 182, leaders: 2, core: 9, tail: 171, children: 1 },
  核心装备: { companies: 462, leaders: 6, core: 62, tail: 394, children: 3 },
  检测认证与标准: { companies: 80, leaders: 0, core: 9, tail: 71, children: 1 },
  电池与核心部件: { companies: 757, leaders: 28, core: 192, tail: 537, children: 6 },
  系统集成与工程建设: { companies: 219, leaders: 1, core: 25, tail: 193, children: 4 },
  应用与运营: { companies: 202, leaders: 5, core: 60, tail: 137, children: 6 },
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
  '环节景气度为研判口径（橙色标注），环节样本规模取自产业链地图的实时数据；两者分列，避免把样本结构当成景气结论。';

// 产业链景气总判断。
export const CHAIN_VERDICT = {
  headline: '中游制造是本轮景气最确定的一环，上游材料与下游运营的分化在扩大',
  text: '中游电池与系统集成受益于产能利用率高位与订单集中，是当前景气度最高、也是盈利修复最明确的环节；上游资源与材料受价格与成本双向挤压，下游运营的收益完全取决于机制兑现与调度考核。',
  basis: {
    data: '产业链地图在链 2,457 家企业、7 个一级环节；中游两个环节覆盖 976 家企业、29 个龙头席位（同一企业可跨环节计入），是全链企业与龙头密度最高的位置。',
    logic:
      '景气度按「需求确定性 + 供给集中度 + 价格趋势 + 机制兑现度」四要素相对打分，并与链内企业与龙头分布交叉验证。',
    impact: '授信资源应向中游头部集中，对上游尾部与无海外布局的三线集成商收紧敞口。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 05 技术路线判断

export const TECH_ROUTES = [
  {
    key: 'lfp',
    name: '磷酸铁锂',
    maturity: 92,
    stage: '规模化量产',
    tone: 'up',
    share: '占比约 90%',
    advantage: '成本与安全性平衡最优，循环寿命超 1.2 万次，供应链国产化率接近 100%。',
    risk: '能量密度上限有限；产能过剩导致同质化竞争，价格弹性依赖原料成本。',
    outlook: '短期仍是绝对主流；随 300Ah 以上大电芯普及，单位成本继续下行，是授信的基本盘。',
    source: 'techStat',
  },
  {
    key: 'sodium',
    name: '钠离子电池',
    maturity: 42,
    stage: '商业化初期',
    tone: 'watch',
    share: '渗透率约 5%–8%',
    advantage: '低温性能与成本潜力突出，示范项目度电成本降至约 0.32 元/千瓦时（同比 -26%）。',
    risk: '产业链尚不完整、量产一致性待验证，定价随碳酸锂价格波动而失去优势。',
    outlook: '已在欧洲签署首个规模化出海订单（2027 年起交付），是低成本长时场景的期权型路线。',
    source: 'techStat',
  },
  {
    key: 'flow',
    name: '液流电池',
    maturity: 48,
    stage: '示范转商用',
    tone: 'watch',
    share: '4h 以上项目中标占比约 11%',
    advantage: '电解液可回收、本征安全，适合 4 小时以上长时储能，容量与功率解耦。',
    risk: '初始投资高、系统效率偏低，规模化取决于电解液租赁等商业模式创新。',
    outlook: '长时储能需求抬升的直接受益者，在 4h 以上招标中的份额是最关键的跟踪指标。',
    source: 'techStat',
  },
  {
    key: 'caes',
    name: '压缩空气储能',
    maturity: 38,
    stage: '示范验证',
    tone: 'watch',
    share: '项目数占比 <1%',
    advantage: '大容量、长寿命，不依赖稀缺锂资源，适合电网侧大规模长时调节。',
    risk: '受地质条件与选址约束强，单站投资大、建设周期长，可复制性待验证。',
    outlook: '与盐穴、废弃矿洞资源绑定，属区域型机会，短期难以形成标准化产品。',
    source: 'techStat',
  },
  {
    key: 'hydrogen',
    name: '氢储能',
    maturity: 25,
    stage: '示范前期',
    tone: 'down',
    share: '在链企业仅 2 家',
    advantage: '跨季节、跨区域储能潜力最大，与绿氢化工耦合可打开非电场景。',
    risk: '电—氢—电全链效率低，装备成本高，商业模式尚未闭环。',
    outlook: '当前属远期布局，授信上适合以科技金融小额度试点跟踪，不宜按产能逻辑投放。',
    source: 'techStat',
  },
];

export const TECH_VERDICT = {
  headline: '磷酸铁锂仍是基本盘，长时路线开始出现可跟踪的份额信号',
  text: '磷酸铁锂占据约九成份额，决定行业成本曲线；钠离子、液流、压缩空气三条路线已从实验室走进招标与订单，判断切换不看技术宣传，只看「4 小时以上项目中标份额」与「单位度电成本」两个读数。',
  basis: {
    data: '磷酸铁锂占比约 90%；钠电渗透率约 5%–8%、示范度电成本约 0.32 元/千瓦时；液流在 4h 以上项目中标占比约 11%；压缩空气与氢储能合计不足 1%。',
    logic:
      '以「份额是否连续两期抬升 + 度电成本是否进入经济性阈值」双条件判定路线切换，单期数据不作依据。',
    impact:
      '技术路线押注直接影响设备抵押物残值；对非锂电路线企业，抵押率与期限需按验证进度动态调整。',
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
        '宁德时代与欧洲能源基础设施企业签署 5GWh 钠电储能谅解备忘录，2027 年起交付；另签 3GWh 液冷长时供货协议。',
        '阳光电源储能成为第一大收入板块，26H1 营收 154.56 亿元，并在波兰建设欧洲首座生产基地。',
        '头部集成商加速从产品供应转向「产品 + 长期服务」绑定，质保与运维条款成为竞争要素。',
      ],
      source: 'ggiiStat',
    },
    {
      key: 'capacity',
      label: '新增产能',
      items: [
        '头部电芯企业产能利用率普遍维持在 90% 以上，部分战略框架协议已覆盖 2026—2027 年产能。',
        '产能扩张从「总量扩产」转向「结构性置换」：大容量电芯产线替换旧产能，尾部产线停摆。',
      ],
      source: 'ggiiStat',
    },
    {
      key: 'overseas',
      label: '海外布局',
      items: [
        '出海模式从产品出口升级为海外建厂 + 本地化服务 + 技术合作综合输出。',
        '欧洲为重点市场：26H1 中国企业在欧签约超 100GWh；中东、澳洲形成第二增长极。',
      ],
      source: 'cnesaStat',
    },
    {
      key: 'product',
      label: '新产品发布',
      items: [
        '300Ah 以上大容量电芯出货占比突破 55%，循环寿命超 1.2 万次成为标配。',
        '面向 AIDC 的高倍率电芯、备电系统与综合解决方案集中涌现。',
        '构网型 PCS、液冷温控与模块化设计成为差异化竞争点。',
      ],
      source: 'techStat',
    },
    {
      key: 'alliance',
      label: '战略合作',
      items: [
        '龙头与海外 IPP、本土集成商直接对接，跳过渠道环节切入大型电网侧场景。',
        '链主集采与生态主导型合作强化，订单资源向兼具技术与海外渠道的企业集中。',
      ],
      source: 'cnesaStat',
    },
  ],
  tiers: [
    {
      key: 't1',
      label: '第一梯队',
      tone: 'up',
      criteria: '技术 + 成本 + 客户优势',
      members: '全球电芯出货前五、系统集成前十中的中国企业',
      evidence: '电芯 CR5 近 59%、CR10 约 85%；全球系统集成前十占 73% 份额，中企包揽前四席。',
      hint: '具备议价权与盈利修复能力，是授信的核心客户群。',
      source: 'ggiiStat',
    },
    {
      key: 't2',
      label: '第二梯队',
      tone: 'watch',
      criteria: '细分领域优势',
      members: '构网型 PCS、液冷温控、长时储能、BMS/EMS、渠道型户储厂商',
      evidence: '在特定技术或区域渠道建立壁垒，跟随头部订单节奏放量。',
      hint: '按细分壁垒定授信条件，重点看单一客户的集中度风险。',
      source: 'ggiiStat',
    },
    {
      key: 't3',
      label: '第三梯队',
      tone: 'down',
      criteria: '价格竞争、淘汰风险',
      members: '无海外布局、产品同质化的中小集成商与二线电芯厂',
      evidence: '「以价换量」阶段终结，26Q2 PCS 均价环比回升 2%–3%，成本难以下传者毛利持续下探。',
      hint: '敞口需压降；抵押与担保条件按最保守口径设定。',
      source: 'ggiiStat',
    },
  ],
  basis: {
    data: '电芯产能利用率 >90%、CR5 近 59%；全球系统集成前十占 73%；26Q2 PCS 均价环比 +2%–3%、铜价同比 +35%。',
    logic: '用集中度（CR5/CR10）判断格局是否固化，用价格与成本剪刀差判断尾部是否在出清。',
    impact:
      '客户分层直接映射授信分层：一梯队可给综合授信，二梯队按细分壁垒定条件，三梯队只做短周期、强担保业务。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 07 行业风险预警

export const RISK_RADAR = {
  dims: [
    {
      key: 'capacity',
      label: '产能风险',
      score: 72,
      level: '中高',
      tone: 'watch',
      text: '总量过剩与结构性紧缺并存：头部满产、尾部停摆，产能置换期易出现重复投资。',
      watch: '头部产能利用率、在建产能投产节奏、二线开工率',
      source: 'ggiiStat',
    },
    {
      key: 'tech',
      label: '技术路线风险',
      score: 48,
      level: '中',
      tone: 'watch',
      text: '非锂电路线尚在验证期，路线切换可能使专用产线抵押物快速贬值。',
      watch: '各路线在 4h 以上项目的中标份额、度电成本',
      source: 'techStat',
    },
    {
      key: 'operation',
      label: '企业经营风险',
      score: 65,
      level: '中高',
      tone: 'watch',
      text: '成本转嫁能力分化，原材料高位运行下毛利修复不畅的企业现金流承压。',
      watch: '毛利率趋势、应收账款与存货周转、在手订单覆盖月数',
      source: 'ggiiStat',
    },
    {
      key: 'revenue',
      label: '项目收益风险',
      score: 58,
      level: '中',
      tone: 'watch',
      text: '国内工商储受分时电价调整影响收益走弱；容量电费按调度考核兑现，存在扣减风险。',
      watch: '容量电费足额兑现率、可用率与响应率、峰谷价差',
      source: 'marketRule',
    },
    {
      key: 'policy',
      label: '政策风险',
      score: 44,
      level: '中低',
      tone: 'up',
      text: '强制配储退坡、出口退税退坡带来短期扰动，但装机目标与容量电价机制方向明确。',
      watch: '各省配储与容量电价细则、出口退税与补贴调整',
      source: 'policyDoc',
    },
    {
      key: 'overseas',
      label: '海外风险',
      score: 70,
      level: '中高',
      tone: 'watch',
      text: '汇率波动、关税上调（北美进口模组关税上调至 14.5%）、合规壁垒与渠道库存堆积风险集中暴露。',
      watch: '海外订单签约与交付比、区域库存水平、关税与本地化政策',
      source: 'ggiiStat',
    },
  ],
  basis: {
    data: '产能利用率 >90% 与尾部开工不足并存；铜价同比 +35%；北美模组关税上调至 14.5%；26H1 海外订单签约 298GWh（+83%）。',
    logic: '六维风险等权打分（0–100，越高越需关注），单项 ≥65 视为需在授信条件中显性设限。',
    impact:
      '产能、经营、海外三项需重点设限：对相应客户缩短期限、提高保证金或增加订单与存货监控条款。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 08 银行业务机会分析

export const BANKING_OPPS = [
  {
    key: 'manufacture',
    label: '核心制造企业',
    tone: 'up',
    products: ['供应链金融', '流动资金贷款'],
    basisText:
      '头部电芯产能利用率 >90%、订单排产至 2027 年，扩产与备货占用大量营运资金；账期长、上下游集中。',
    action: '以链主为核心做应收账款与订单融资，围绕长协锁定上游采购资金。',
    link: { tab: 'credit', label: '查看授信评价' },
    source: 'ggiiStat',
  },
  {
    key: 'project',
    label: '项目运营企业',
    tone: 'up',
    products: ['项目融资', '绿色金融'],
    basisText: '独立储能占新增装机 69.3%，容量电价（165–330 元/千瓦·年）形成可测算的保底现金流。',
    action: '按「容量电费 + 辅助服务 + 现货套利」三档收入分别做现金流压力测试后核定项目贷。',
    link: { tab: 'credit', label: '查看授信评价' },
    source: 'marketRule',
  },
  {
    key: 'innovation',
    label: '技术创新企业',
    tone: 'watch',
    products: ['科技金融', '股债联动'],
    basisText: '钠离子、液流、压缩空气、氢储能处于示范验证期，轻资产、研发投入高、缺乏合格抵押物。',
    action: '以知识产权质押、认股权与投贷联动切入，额度小、期限短、按验证节点分期投放。',
    link: { tab: 'flow', label: '查看产业链地图' },
    source: 'techStat',
  },
  {
    key: 'cluster',
    label: '产业集群',
    tone: 'up',
    products: ['园区金融', '综合授信'],
    basisText: '西北风光储基地集中建设，长三角、珠三角形成制造与集成集群，链主集采带动上下游协同。',
    action: '按园区维度做整体授信，以链主应付账款为纽带批量获客，降低单户尽调成本。',
    link: { tab: 'map', label: '查看企业分布' },
    source: 'cnesaStat',
  },
];

export const BANKING_VERDICT = {
  headline: '机会集中在「制造头部 + 独立储能资产」两端，中间环节只做条件性支持',
  text: '产业链利润与订单正在向头部制造企业与可独立核算的储能资产集中；这两端是新增投放的主战场。上游材料、普通集成与尾部产能应以存量维护为主。',
  basis: {
    data: '中游两环节占链内龙头 55%；独立储能占新增装机 69.3%；海外订单 +83%。',
    logic: '按「现金流可测性 × 客户层级 × 抵质押可得性」三要素排序，优先投向现金流可建模的资产端。',
    impact: '推动授信从被动受理转向主动经营：先定产业赛道与客户层级，再倒推授信产品与额度。',
  },
  source: 'judgement',
};

// ---------------------------------------------------------------- 09 AI 行业分析助手

export const ASSISTANT = {
  sources: [
    {
      key: 'policy',
      label: '政策',
      text: '国家与省级政策文件、容量电价与现货市场细则',
      cadence: '实时',
    },
    { key: 'news', label: '新闻', text: '行业媒体与主流财经媒体的产业动态', cadence: '每日' },
    {
      key: 'bidding',
      label: '招标数据',
      text: '储能系统与 EPC 招投标中标信息、中标均价',
      cadence: '每日',
    },
    {
      key: 'company',
      label: '企业动态',
      text: '上市公司公告、海外订单与产能扩张信息',
      cadence: '每日',
    },
    { key: 'tech', label: '技术突破', text: '新路线验证、电芯规格与循环寿命进展', cadence: '每周' },
    {
      key: 'price',
      label: '产品价格',
      text: '电芯、PCS 与系统中标价及原材料价格',
      cadence: '每周',
    },
    { key: 'finance', label: '投融资事件', text: '一级市场融资、IPO 与产能并购', cadence: '每周' },
  ],
  report: {
    title: '《储能行业宏观研判周报》',
    sections: [
      '行业一句话判断',
      '景气度评分与分项变化',
      '政策变化',
      '需求变化',
      '产业链变化',
      '技术趋势',
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
      text: '能源局装机与利用情况发布会 → 更新装机、等效利用小时数、投资增速。',
    },
    {
      key: 'month',
      label: '月度',
      text: '招投标中标统计与现货市场运行月报 → 更新中标均价、峰谷价差。',
    },
    {
      key: 'year',
      label: '年度',
      text: '《中国新型储能发展报告》与政策文件 → 更新技术路线、时长与政策目标。',
    },
    {
      key: 'review',
      label: '结论复核',
      text: '上游数据更新后，本页研判口径（橙色标注）需由业务人员复核，不做自动改写。',
    },
  ],
  basis: {
    data: '七类抓取源覆盖政策、新闻、招标、企业动态、技术、价格与投融资；周报输出九节固定结构。',
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
    summary: '总量仍在扩张，增速已经换挡',
    color: '#1d62d8',
    source: 'cnesaStat',
    items: [
      {
        name: '累计投运装机',
        reading: '168.3GW / 448.7GWh',
        hint: '截至 2026-06，同比 +59% / +71%，规模稳居全球第一梯队',
        source: 'cnesaStat',
      },
      {
        name: '半年度新增装机',
        reading: '21.81GW / 58.60GWh',
        hint: '26H1 功率 -18%、能量 -16%，建设节奏回归常态',
        source: 'cnesaStat',
      },
      {
        name: '招标开标规模',
        reading: '领先装机 1–2 个季度',
        hint: '先行指标，看 3 个月移动平均定方向',
        source: 'priceStat',
      },
      {
        name: '独立储能占比',
        reading: '15.1GW / 占新增 69.3%',
        hint: '占比同比 +13.9pct，从新能源配套转为电网侧公共调节资源',
        source: 'cnesaStat',
      },
    ],
  },
  {
    key: 'usage',
    no: '02',
    title: '调用与利用',
    summary: '本阶段判断真实景气的核心指标',
    color: '#0e9274',
    source: 'gridStat',
    items: [
      {
        name: '等效利用小时数',
        reading: '2025 年 1195 h',
        hint: '2023→2025 = 611→911→1195，走向常态调用',
        source: 'gridStat',
      },
      {
        name: '可用率 / 响应率',
        reading: '容量电价兑现门槛',
        hint: '调度考核不达标将扣减容量电费',
        source: 'marketRule',
      },
      {
        name: '年度循环次数',
        reading: '识别「建而不用」',
        hint: '持续抬升 = 被当作系统资源调度',
        source: 'gridStat',
      },
      {
        name: '弃风弃光率',
        reading: '储能需求根源',
        hint: '消纳压力集中的西北华北是主要增量区',
        source: 'neaReport',
      },
    ],
  },
  {
    key: 'price',
    no: '03',
    title: '价格与成本',
    summary: '价格企稳是制造端景气回升信号',
    color: '#b07a1e',
    source: 'priceStat',
    items: [
      {
        name: '2h 系统中标均价',
        reading: '约 599 元/kWh（+8%）',
        hint: '止跌回升，从「卷价格」转向「卷价值」',
        source: 'priceStat',
      },
      {
        name: '4h 系统中标均价',
        reading: '约 541 元/kWh（+21%）',
        hint: '长时储能溢价扩大，结构升级',
        source: 'priceStat',
      },
      {
        name: 'PCS 均价与原料成本',
        reading: '26Q2 均价环比 +2%–3%',
        hint: '铜价同比 +35%，「以价换量」阶段宣告终结',
        source: 'ggiiStat',
      },
      {
        name: '价差与成本剪刀差',
        reading: '判断制造端毛利',
        hint: '价格企稳 + 成本高企，成本转嫁能力决定分化',
        source: 'priceStat',
      },
    ],
  },
  {
    key: 'policy',
    no: '04',
    title: '收益与机制',
    summary: '决定电站资产能否长期存活',
    color: '#6f5bd0',
    source: 'marketRule',
    items: [
      {
        name: '容量电价标准',
        reading: '165–330 元/kW·年',
        hint: '2026 年起电网侧独立储能纳入国家容量电价体系',
        source: 'marketRule',
      },
      {
        name: '三元收益结构',
        reading: '容量 + 电能量 + 辅助服务',
        hint: '保底 + 套利 + 服务，经营差距被放大',
        source: 'marketRule',
      },
      {
        name: '现货覆盖省份',
        reading: '观察市场化深度',
        hint: '覆盖越广、调用越市场化（南网先行）',
        source: 'marketRule',
      },
      {
        name: '政策目标节奏',
        reading: '2027 ≥1.8 亿 kW',
        hint: '2030 年 3 亿 kW，「十五五」年均复合增速预期 20.7%–25.5%',
        source: 'policyDoc',
      },
    ],
  },
  {
    key: 'tech',
    no: '05',
    title: '技术与安全',
    summary: '路线切换与安全红线都从这里看',
    color: '#cf5b2e',
    source: 'techStat',
    items: [
      {
        name: '技术路线占比',
        reading: '锂电约 90%、多线并举',
        hint: '钠电 5%–8%、液流在 4h 以上中标约 11% = 切换信号',
        source: 'techStat',
      },
      {
        name: '平均储能时长',
        reading: '约 2.69 h',
        hint: '电网侧独立储能目标等效顶峰 4 h',
        source: 'cnesaStat',
      },
      {
        name: '循环寿命与电芯规格',
        reading: '主流 >1.2 万次',
        hint: '300Ah 以上大电芯出货占比已超 55%',
        source: 'techStat',
      },
      {
        name: '安全事故与标准',
        reading: '安全规范 2026 版实施',
        hint: '热失控预警覆盖率要求提升，是运营端的红线风险源',
        source: 'techStat',
      },
    ],
  },
  {
    key: 'global',
    no: '06',
    title: '出口与资本',
    summary: '外部需求与资金温度的先行读数',
    color: '#5f7b8c',
    source: 'exportStat',
    items: [
      {
        name: '海外订单签约',
        reading: '26H1 达 298 GWh（+83%）',
        hint: '海外需求强弱的直接读数，欧洲占比最高',
        source: 'cnesaStat',
      },
      {
        name: '全球电芯出货与份额',
        reading: '26Q1 出货 205.5GWh（+98.7%）',
        hint: 'CR10 约 85%，头部集中度持续抬升',
        source: 'ggiiStat',
      },
      {
        name: '领域投资增速',
        reading: '26H1 同比 +74.3%',
        hint: '能源领域投资增长最快的方向之一',
        source: 'investStat',
      },
      {
        name: '一二级融资温度',
        reading: '融资额 / IPO / 指数',
        hint: '资本先行，用于验证景气预期',
        source: 'investStat',
      },
    ],
  },
];

// 等效利用小时数趋势（历史趋势比较）。
// 2023–2025 为全国年度口径；2026H1 为电网企业半年分区域口径，只看方向不比绝对值。
export const UTILIZATION_TREND = {
  title: '等效利用小时数：从「建而不用」到「常态调用」',
  source: 'gridStat',
  note:
    '2023–2025 为全国年度口径；2026H1 为半年分区域口径，只看方向、不比绝对值。' +
    '南网提升幅度更大，说明机制设计（市场化交易推进）对调用水平的影响比设备本身更直接。',
  legend: [
    { key: 'year', label: '全国年度' },
    { key: 'half', label: '26H1 分区域' },
  ],
  bars: [
    { label: '2023', value: 611, kind: 'year' },
    { label: '2024', value: 911, kind: 'year' },
    { label: '2025', value: 1195, kind: 'year' },
    { label: '26H1 国网', value: 573, kind: 'half' },
    { label: '26H1 南网', value: 626, kind: 'half' },
  ],
};

// 装机目标节奏。
export const POLICY_TARGETS = {
  title: '装机规模与政策目标（亿千瓦）',
  source: 'policyDoc',
  note:
    '「十四五」实现年均翻倍，「十五五」进入规模化到市场化阶段：2027 年 ≥1.8 亿 kW，' +
    '2030 年 3 亿 kW（其中电网侧独立储能 1.4 亿 kW、等效顶峰时长力争 4 小时），年均复合增速预期 20.7%–25.5%。',
  legend: [
    { key: 'actual', label: '已建成投运' },
    { key: 'target', label: '政策目标' },
  ],
  bars: [
    { label: '十四五初', value: 0.03, kind: 'actual' },
    { label: '2025 底', value: 1.36, kind: 'actual' },
    { label: '2026-06', value: 1.68, kind: 'actual' },
    { label: '2027 目标', value: 1.8, kind: 'target' },
    { label: '2030 目标', value: 3.0, kind: 'target' },
  ],
};

// 读法纪律（把公开数据转成趋势方向的判读规则）。
export const MACRO_DISCIPLINES = [
  {
    key: 'structure',
    title: '装机看结构不看总量',
    text: '新增功率下降 + 平均时长上升（2.69h → 目标 4h），是「从堆规模到重时长」的健康信号，不是需求转弱。',
    source: 'reading',
  },
  {
    key: 'efficiency',
    title: '效率领先收益',
    text: '等效利用小时 / 可用率 / 调度响应率的改善，先于容量电费足额兑现与电站收益改善出现，是运营端最领先的读数。',
    source: 'reading',
  },
  {
    key: 'revenue',
    title: '区分保底与弹性收益',
    text: '容量电价（165–330 元/kW·年）是保底，现货套利（峰谷价差约 0.55 元/kWh）弹性最大也最不稳；判断企业成色，先看收入靠哪条腿。',
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
    { key: 'scale', label: '规模', text: '累计 168.3GW，同比 +59%', tone: 'up' },
    { key: 'usage', label: '利用', text: '等效利用小时连续三年抬升', tone: 'up' },
    { key: 'price', label: '价格', text: '中标价止跌回升', tone: 'up' },
    { key: 'risk', label: '风险', text: '海外与产能风险集中暴露', tone: 'watch' },
  ],
};
