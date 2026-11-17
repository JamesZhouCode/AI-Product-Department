// 算力产业 · 授信负面清单
//
// 三层口径：
//   deny   禁入（一票否决）：不得新增授信，存量压退；
//   strict 从严（特别审批）：须补充增信、提高资本金或压降额度后方可报批；
//   watch  关注（限额/前置条件）：可准入但须设定限额、期限或前置条件。
//
// 每条规则标注 scope（企业/项目）与 auto（是否可由系统按字段自动扫描）。
// auto=false 的条目依赖外部名单、许可证与现场核查，页面仅提示人工核查，不计入命中。

import { REDLINE_DEFS } from './creditConfig.js';

export const NEGATIVE_LEVELS = {
  deny: { key: 'deny', label: '禁入', fullLabel: '禁入（一票否决）', color: '#8b2f2f', rank: 3 },
  strict: {
    key: 'strict',
    label: '从严',
    fullLabel: '从严（特别审批）',
    color: '#c23b37',
    rank: 2,
  },
  watch: { key: 'watch', label: '关注', fullLabel: '关注（限额/前置）', color: '#d9a514', rank: 1 },
};

export const NEGATIVE_SECTIONS = [
  {
    key: 'A',
    label: '主体资格',
    desc: '看主体是否存在硬性瑕疵：失信、违约、造假、空壳与主体存续状态。',
  },
  {
    key: 'B',
    label: '业务合规',
    desc: '看算力业务本身是否合法：电信许可、数据出境、出口管制、贸易背景真实性。',
  },
  {
    key: 'C',
    label: '项目要素',
    desc: '看项目是否具备开工与投放条件：备案、能耗、用地、能效、资本金与现金流。',
  },
  {
    key: 'D',
    label: '财务与偿债',
    desc: '看偿债能力与财务质量：杠杆、期限错配、应收存货、担保与现金流。',
  },
  {
    key: 'E',
    label: '经营与产业链',
    desc: '看经营可持续性：客户集中、产能利用、技术替代、集群同质化。',
  },
  {
    key: 'F',
    label: '区域与政策',
    desc: '看项目落位是否符合算力布局与能耗政策：枢纽节点、限电区域、区域供需。',
  },
];

const hasRedline = (evaluation, key) =>
  Boolean(evaluation?.redlines?.some((line) => line.key === key && line.status === 'verified'));

const hasPending = (evaluation, key) =>
  Boolean(evaluation?.redlines?.some((line) => line.key === key && line.status === 'pending'));

const M = (company) => company?.metrics || {};

export const NEGATIVE_ITEMS = [
  // ------------------------------ A 主体资格 ------------------------------
  {
    code: 'A1',
    section: 'A',
    name: '失信被执行人 / 恶意逃废债',
    level: 'deny',
    scope: 'company',
    auto: true,
    rule: '经核实存在生效判决未履行、被列为失信被执行人或恶意逃废债记录',
    action: '禁入；存量授信压退，纳入集团客户名单管控',
    basis: '《征信业管理条例》、银行授信管理办法「限制准入」条款',
    source: '征信报告 / 执行信息公开网 / 内部黑名单',
    hit: (company, evaluation) => hasRedline(evaluation, 'majorDishonesty'),
    pending: (company, evaluation) => hasPending(evaluation, 'majorDishonesty'),
  },
  {
    code: 'A2',
    section: 'A',
    name: '核心银行债务实质性违约',
    level: 'deny',
    scope: 'company',
    auto: true,
    rule: '近 24 个月发生本金或利息逾期 90 天以上、债务重组或展期降息',
    action: '禁入；已授信客户启动压退与风险处置流程',
    basis: '银行授信管理办法、不良资产处置制度',
    source: '征信报告 / 债权银行反馈 / 内部信贷台账',
    hit: (company, evaluation) => hasRedline(evaluation, 'majorDefault'),
    pending: (company, evaluation) => hasPending(evaluation, 'majorDefault'),
  },
  {
    code: 'A3',
    section: 'A',
    name: '重大财务造假或骗贷风险',
    level: 'deny',
    scope: 'company',
    auto: true,
    rule: '审计意见非标且涉收入虚增、资金流水与报表严重不符、已被监管立案',
    action: '禁入；同步排查关联企业授信',
    basis: '《会计法》《商业银行授信工作尽职指引》',
    source: '审计报告 / 监管处罚 / 司法文书',
    hit: (company, evaluation) => hasRedline(evaluation, 'fraudRisk'),
    pending: (company, evaluation) => hasPending(evaluation, 'fraudRisk'),
  },
  {
    code: 'A4',
    section: 'A',
    name: '重大关联方资金占用',
    level: 'deny',
    scope: 'company',
    auto: true,
    rule: '控股股东或关联方非经营性占用资金占净资产 10% 以上且未清理',
    action: '禁入；已授信客户追加担保并限期整改',
    basis: '《上市公司监管指引》、银行关联交易管理要求',
    source: '年报附注 / 资金流水核查',
    hit: (company, evaluation) => hasRedline(evaluation, 'fundOccupation'),
    pending: (company, evaluation) => hasPending(evaluation, 'fundOccupation'),
  },
  {
    code: 'A5',
    section: 'A',
    name: '严重违法违规（安全、环保、税务）',
    level: 'deny',
    scope: 'company',
    auto: true,
    rule: '近 36 个月受到责令停产、吊销许可证或重大税务处罚',
    action: '禁入；整改验收并观察 12 个月后方可重新评估',
    basis: '《安全生产法》《环境保护法》《税收征管法》',
    source: '行政处罚公示 / 信用中国',
    hit: (company, evaluation) => hasRedline(evaluation, 'severeViolation'),
    pending: (company, evaluation) => hasPending(evaluation, 'severeViolation'),
  },
  {
    code: 'A6',
    section: 'A',
    name: '空壳或无实质经营',
    level: 'deny',
    scope: 'company',
    auto: false,
    rule: '同址聚集注册、无社保缴纳、未实缴资本、无办公与生产场地、无真实业务流水',
    action: '禁入；如为集团项目公司，须穿透至实际经营主体',
    basis: '银行账户与主体真实性核查要求',
    source: '工商信息 / 社保 / 现场走访 / 水电与物流凭证',
  },
  {
    code: 'A7',
    section: 'A',
    name: '主体存续状态异常',
    level: 'deny',
    scope: 'company',
    auto: false,
    rule: '吊销、注销、清算、歇业，或被列入经营异常名录且未移出',
    action: '禁入；项目公司须更换承贷主体',
    basis: '《公司法》、工商登记管理要求',
    source: '国家企业信用信息公示系统',
  },
  {
    code: 'A8',
    section: 'A',
    name: '其他制度性限制准入事项',
    level: 'deny',
    scope: 'company',
    auto: false,
    rule: '监管窗口指导、行业限额、集团客户统一授信管控等限制准入情形',
    action: '按制度执行，必要时上会审议',
    basis: '监管文件与银行内部制度',
    source: '合规与风险管理部门',
  },

  // ------------------------------ B 业务合规 ------------------------------
  {
    code: 'B1',
    section: 'B',
    name: '虚拟货币「挖矿」及为其提供场地、电力或算力',
    level: 'deny',
    scope: 'company',
    auto: false,
    rule: '存在虚拟货币挖矿业务，或为挖矿提供机房、电力、矿机托管与算力转售',
    action: '禁入；已授信客户立即压退并报告合规部门',
    basis: '《关于整治虚拟货币「挖矿」活动的通知》（发改运行〔2021〕1283 号）',
    source: '合同与租约抽查 / 用电负荷特征 / 举报与舆情',
  },
  {
    code: 'B2',
    section: 'B',
    name: '无电信业务经营许可从事经营性算力服务',
    level: 'deny',
    scope: 'company',
    auto: false,
    rule: '对外提供 IDC、ISP、CDN、云服务等经营性服务但未取得相应许可证',
    action: '禁入；待取得许可并完成业务整改后重新评估',
    basis: '《电信条例》《电信业务经营许可管理办法》',
    source: '工信部许可查询 / 合同与发票品目',
  },
  {
    code: 'B3',
    section: 'B',
    name: '数据出境未通过安全评估 / 涉密数据违规',
    level: 'deny',
    scope: 'company',
    auto: false,
    rule: '承载重要数据或个人信息出境未完成安全评估、未签订标准合同或违规向境外提供',
    action: '禁入；涉及国家秘密的移交合规与安全部门',
    basis: '《数据安全法》《个人信息保护法》《数据出境安全评估办法》',
    source: '数据合规备案 / 客户行业属性 / 现场核查',
  },
  {
    code: 'B4',
    section: 'B',
    name: '列入出口管制实体清单或受限最终用户',
    level: 'deny',
    scope: 'company',
    auto: false,
    rule: '被列入实体清单、未经核实清单，或交易对手为受限最终用户',
    action: '禁入；供应链依赖度高的存量客户设置压退计划',
    basis: '《出口管制法》与相关国家出口管制规则',
    source: '管制清单比对 / 采购与销售合同',
  },
  {
    code: 'B5',
    section: 'B',
    name: '贸易背景存疑：融资性贸易、走单空转',
    level: 'deny',
    scope: 'company',
    auto: true,
    rule: '芯片/服务器贸易无物流、无终端用户、上下游关联，应收与订单真实性评分偏低',
    action: '禁入；已授信客户停止新增贸易融资并要求补充物流与终端凭证',
    basis: '《关于规范发展供应链金融 支持供应链产业链稳定循环和优化升级的意见》',
    source: '合同、发票、物流单、报关单四流比对',
    hit: (company) => {
      const trade = M(company).trade || {};
      return (trade.arAuthenticity ?? 5) <= 2 || (trade.orderAuthenticity ?? 5) <= 2;
    },
    note: (company) => {
      const trade = M(company).trade || {};
      return `应收真实性 ${trade.arAuthenticity ?? '—'}/5，订单真实性 ${trade.orderAuthenticity ?? '—'}/5`;
    },
  },
  {
    code: 'B6',
    section: 'B',
    name: '虚构算力租约 / 关联方互租虚增收入',
    level: 'deny',
    scope: 'company',
    auto: false,
    rule: '租约对手方为关联方、租金明显偏离区域均价、同一机柜反复转租',
    action: '禁入；已授信客户按实质重于形式原则重算现金流',
    basis: '实质重于形式原则与收入确认准则',
    source: '租约台账 / 关联方清单 / 区域租金比价',
  },

  // ------------------------------ C 项目要素 ------------------------------
  {
    code: 'C1',
    section: 'C',
    name: '项目未备案 / 未核准',
    level: 'deny',
    scope: 'project',
    auto: true,
    rule: '未取得投资项目备案或核准文件，或建设内容与备案规模不符',
    action: '不得准入；待补齐备案后重新测算',
    basis: '《企业投资项目核准和备案管理条例》',
    source: '全国投资项目在线审批监管平台',
    hit: (project) => project.compliance.filing.status === 'missing',
  },
  {
    code: 'C2',
    section: 'C',
    name: '无能耗指标或「双控」未落实',
    level: 'deny',
    scope: 'project',
    auto: true,
    rule: '未取得节能审查意见、无新增用能指标，或绿电消纳协议未落实',
    action: '不得准入；已批项目暂停投放',
    basis: '《固定资产投资项目节能审查办法》、能耗双控向碳排放双控转型要求',
    source: '节能审查意见 / 能耗指标文件 / 绿电交易合同',
    hit: (project) => project.compliance.energy.status === 'missing',
  },
  {
    code: 'C3',
    section: 'C',
    name: '用地 / 机房权属不清、消防未验收',
    level: 'deny',
    scope: 'project',
    auto: true,
    rule: '土地或机房无合法权属、租赁期限短于授信期限、消防未验收',
    action: '不得准入；抵押物不适格，须追加其他担保',
    basis: '《民法典》担保制度、消防验收规定',
    source: '不动产权证 / 租赁合同 / 消防验收意见',
    hit: (project) => project.compliance.land.status === 'missing',
  },
  {
    code: 'C4',
    section: 'C',
    name: 'PUE 未达准入标准',
    level: 'strict',
    scope: 'project',
    auto: true,
    rule: '新建大型数据中心 PUE 高于 1.25（枢纽节点）或 1.35（其他区域）',
    action: '从严：须列明液冷改造计划并预留改造资本金',
    basis: '《关于严格能效约束推动重点领域节能降碳的若干意见》与地方数据中心能效要求',
    source: '能效测评报告 / 设计文件',
    hit: (project) => Boolean(project.pue) && project.pue > 1.35,
    note: (project) => (project.pue ? `PUE ${project.pue}` : '非数据中心类项目'),
  },
  {
    code: 'C5',
    section: 'C',
    name: '资本金比例低于 20%',
    level: 'strict',
    scope: 'project',
    auto: true,
    rule: '项目资本金占总投资比例低于 20%，或资本金到位进度落后于建设进度',
    action: '从严：提高资本金至 25% 以上或追加股东借款',
    basis: '《国务院关于调整和完善固定资产投资项目资本金制度的通知》',
    source: '验资报告 / 资本金到位凭证',
    hit: (project) => project.capitalRatio < 0.2,
    note: (project) => `资本金 ${(project.capitalRatio * 100).toFixed(0)}%`,
  },
  {
    code: 'C6',
    section: 'C',
    name: '测算 DSCR 低于 1.10',
    level: 'strict',
    scope: 'project',
    auto: true,
    rule: '按审慎假设测算的贷款存续期 DSCR 低于 1.10，或现金流覆盖不足',
    action: '从严：延长贷款期限、压降额度或引入差额补足',
    basis: '项目融资现金流覆盖要求',
    source: '可研现金流测算 / 租约台账',
    hit: (project) => project.dscr < 1.1,
    note: (project) => `DSCR ${project.dscr}`,
  },
  {
    code: 'C7',
    section: 'C',
    name: '长协客户锁定率低于 30%',
    level: 'strict',
    scope: 'project',
    auto: true,
    rule: '稳定期收入中已签约长协客户占比低于 30%，收入可验证性不足',
    action: '从严：要求补充意向协议或按未锁定比例压降额度',
    basis: '项目融资收入验证要求',
    source: '租约与框架协议 / 客户尽调',
    hit: (project) => project.anchoredRate < 0.3,
    note: (project) => `锁定率 ${(project.anchoredRate * 100).toFixed(0)}%`,
  },
  {
    code: 'C8',
    section: 'C',
    name: '稳定期上架率低于 55%',
    level: 'watch',
    scope: 'project',
    auto: true,
    rule: '测算稳定期上架率低于 55%，或爬坡期超过 24 个月',
    action: '关注：设置提款前提与上架率挂钩的分期提款条件',
    basis: 'IDC 项目运营假设审慎性要求',
    source: '运营测算 / 区域同类比价',
    hit: (project) => Boolean(project.itLoadMW) && project.utilization < 0.55,
    note: (project) => `上架率 ${(project.utilization * 100).toFixed(0)}%`,
  },
  {
    code: 'C9',
    section: 'C',
    name: '建设期资金缺口未落实 / 超概算',
    level: 'strict',
    scope: 'project',
    auto: false,
    rule: '除贷款与资本金外仍有缺口，或已发生超概算且无补充来源',
    action: '从严：缺口落实前不得开工放款',
    basis: '项目融资封闭管理要求',
    source: '资金平衡表 / 工程结算',
  },

  // ------------------------------ D 财务与偿债 ------------------------------
  {
    code: 'D1',
    section: 'D',
    name: '高杠杆且经营现金流为负',
    level: 'strict',
    scope: 'company',
    auto: true,
    rule: '资产负债率高于 80% 且最近一期经营活动现金流净额为负',
    action: '从严：仅可办理低风险业务，新增授信须追加增信',
    basis: '银行客户信用评级与限额管理要求',
    source: '财务报表 / 审计报告',
    hit: (company) => {
      const m = M(company);
      return (m.debtRatio ?? 0) > 0.8 && (m.operatingCashFlow ?? 0) < 0;
    },
    note: (company) => {
      const m = M(company);
      return `资产负债率 ${((m.debtRatio ?? 0) * 100).toFixed(1)}%，经营现金流 ${
        (m.operatingCashFlow ?? 0) < 0 ? '为负' : '为正'
      }`;
    },
  },
  {
    code: 'D2',
    section: 'D',
    name: '债务期限错配 / 短债长投',
    level: 'strict',
    scope: 'company',
    auto: true,
    rule: '短期债务占有息负债 70% 以上，且用于长期资产投入',
    action: '从严：置换为中长期资金，压降短期敞口',
    basis: '流动性风险管理要求',
    source: '债务台账 / 募集说明书',
    hit: (company, evaluation) => hasRedline(evaluation, 'debtMaturityMismatch'),
  },
  {
    code: 'D3',
    section: 'D',
    name: '依赖借新还旧',
    level: 'strict',
    scope: 'company',
    auto: true,
    rule: '近 12 个月到期债务中超半数依赖新增融资偿还',
    action: '从严：纳入重点监测，限制新增敞口',
    basis: '客户风险分类与预警管理',
    source: '信贷台账 / 资金流水',
    hit: (company, evaluation) => hasRedline(evaluation, 'borrowToRepay'),
  },
  {
    code: 'D4',
    section: 'D',
    name: '应收账款异常增长',
    level: 'strict',
    scope: 'company',
    auto: true,
    rule: '应收账款增速超过 40% 且占营业收入 30% 以上，或账龄结构显著恶化',
    action: '从严：核查回款与对手方，必要时压降额度',
    basis: '财务报表分析要求',
    source: '财务报表附注 / 回款凭证',
    hit: (company, evaluation) => hasRedline(evaluation, 'arAbnormalGrowth'),
  },
  {
    code: 'D5',
    section: 'D',
    name: '存货异常积压',
    level: 'strict',
    scope: 'company',
    auto: true,
    rule: '存货增速超过 40% 且占营业收入 25% 以上，或芯片/服务器跌价准备计提不足',
    action: '从严：核查存货真实性与跌价风险',
    basis: '财务报表分析要求',
    source: '存货明细 / 库龄表',
    hit: (company, evaluation) => hasRedline(evaluation, 'inventoryAbnormal'),
  },
  {
    code: 'D6',
    section: 'D',
    name: '对外担保超净资产 10%',
    level: 'strict',
    scope: 'company',
    auto: true,
    rule: '对外担保余额占净资产 10% 以上，或存在对失信主体的担保',
    action: '从严：按担保敞口扣减授信额度',
    basis: '或有负债管理要求',
    source: '担保台账 / 公告',
    hit: (company) => {
      const m = M(company);
      const assets = m.totalAssets || 0;
      return assets > 0 && (m.guarantees || 0) / assets > 0.1;
    },
    note: (company) => {
      const m = M(company);
      const assets = m.totalAssets || 1;
      return `担保/总资产 ${(((m.guarantees || 0) / assets) * 100).toFixed(1)}%`;
    },
  },
  {
    code: 'D7',
    section: 'D',
    name: '经营现金流持续为负',
    level: 'strict',
    scope: 'company',
    auto: true,
    rule: '连续两期经营活动现金流净额为负，且无明确转正路径',
    action: '从严：仅可办理与真实交易匹配的短期业务',
    basis: '偿债能力评价要求',
    source: '近三年现金流量表',
    hit: (company, evaluation) => hasRedline(evaluation, 'ocfPersistentDeterioration'),
  },
  {
    code: 'D8',
    section: 'D',
    name: '短期债务压力过高',
    level: 'strict',
    scope: 'company',
    auto: true,
    rule: '短期债务超过货币资金与年经营现金流之和的 2 倍',
    action: '从严：设置分期还款与现金流监控',
    basis: '流动性风险管理要求',
    source: '财务报表 / 债务台账',
    hit: (company, evaluation) => hasRedline(evaluation, 'shortDebtPressure'),
  },

  // ------------------------------ E 经营与产业链 ------------------------------
  {
    code: 'E1',
    section: 'E',
    name: '单一客户集中度高于 45%',
    level: 'watch',
    scope: 'company',
    auto: true,
    rule: '前五大客户或单一客户收入占比超过 45%，且对手方信用不明',
    action: '关注：设置限额，跟踪大客户订单与回款',
    basis: '客户集中度风险评价',
    source: '销售明细 / 客户尽调',
    hit: (company) => (M(company).customerConcentration ?? 0) > 0.45,
    note: (company) => `集中度 ${((M(company).customerConcentration ?? 0) * 100).toFixed(0)}%`,
  },
  {
    code: 'E2',
    section: 'E',
    name: '产能/机柜利用率持续过低',
    level: 'watch',
    scope: 'company',
    auto: true,
    rule: '产能利用率或机柜上架率低于 45%，连续两个季度无改善',
    action: '关注：暂缓扩产类项目授信',
    basis: '经营效率评价',
    source: '生产报表 / 上架率台账',
    hit: (company, evaluation) => hasRedline(evaluation, 'capacityLow'),
  },
  {
    code: 'E3',
    section: 'E',
    name: '核心客户流失 / 大量订单取消',
    level: 'watch',
    scope: 'company',
    auto: true,
    rule: '近 12 个月丢失核心客户，或取消订单金额占在手订单 20% 以上',
    action: '关注：重估收入预测与额度',
    basis: '经营持续性评价',
    source: '订单台账 / 客户访谈',
    hit: (company, evaluation) =>
      hasRedline(evaluation, 'coreCustomerLoss') || hasRedline(evaluation, 'orderCancel'),
  },
  {
    code: 'E4',
    section: 'E',
    name: '技术路线替代风险高',
    level: 'watch',
    scope: 'company',
    auto: true,
    rule: '主营技术路线处于被替代区间（如通用 GPU 对专用 ASIC、风冷对液冷）',
    action: '关注：缩短授信期限，避免长期限设备贷款',
    basis: '技术风险评价',
    source: '产品结构 / 专利与研发投入',
    hit: (company, evaluation) =>
      hasRedline(evaluation, 'productReplaced') || M(company).tech?.techIterRisk === '高',
  },
  {
    code: 'E5',
    section: 'E',
    name: '集群同质化与风险传导',
    level: 'watch',
    scope: 'company',
    auto: true,
    rule: '所在集群同质化程度高、对单一链主依赖强，存在风险传染',
    action: '关注：按集群统一限额，避免集中投放',
    basis: '集群风险管理要求',
    source: '集群调研 / 供应链关系',
    hit: (company) => M(company).cluster?.contagionRisk === '高',
  },
  {
    code: 'E6',
    section: 'E',
    name: '早期阶段且现金流为负',
    level: 'watch',
    scope: 'company',
    auto: true,
    rule: '处于研发/中试阶段，经营现金流为负且无稳定订单',
    action: '关注：仅可介入股东背景强的企业，配合投贷联动',
    basis: '科创企业授信管理要求',
    source: '研发进度 / 融资记录',
    hit: (company, evaluation) =>
      evaluation?.stage === 'early_rnd' || evaluation?.stage === 'pilot',
  },

  // ------------------------------ F 区域与政策 ------------------------------
  {
    code: 'F1',
    section: 'F',
    name: '非枢纽节点新建大型数据中心',
    level: 'strict',
    scope: 'project',
    auto: true,
    rule: '在非国家枢纽节点区域新建 5MW 以上大型数据中心，且未纳入省级布局规划',
    action: '从严：须提供省级布局规划依据，否则不予支持',
    basis: '《关于深入实施「东数西算」工程 加快构建全国一体化算力网的实施意见》',
    source: '省级算力布局规划 / 项目备案文件',
    hit: (project) =>
      Boolean(project.itLoadMW) &&
      project.itLoadMW >= 5 &&
      project.regionTier !== '枢纽节点' &&
      project.regionTier !== '需求中心',
    note: (project) =>
      project.itLoadMW ? `${project.regionTier} · ${project.itLoadMW}MW` : '非数据中心类项目',
  },
  {
    code: 'F2',
    section: 'F',
    name: '限电或能耗双控预警区域新增高耗能项目',
    level: 'strict',
    scope: 'project',
    auto: false,
    rule: '项目所在省区处于能耗双控红色预警或有序用电范围，新增负荷未获电网接入确认',
    action: '从严：取得电网接入与用能承诺后再议',
    basis: '能耗双控与电力供需形势要求',
    source: '省级能耗预警 / 电网接入意见',
  },
  {
    code: 'F3',
    section: 'F',
    name: '区域供给过剩仍新增供给',
    level: 'watch',
    scope: 'project',
    auto: true,
    rule: '枢纽节点区域上架率低于 60%，新增机柜缺乏差异化客户',
    action: '关注：要求先锁定客户再分期建设',
    basis: '算力供需监测与投放节奏管理',
    source: '区域上架率监测 / 客户意向协议',
    hit: (project) =>
      Boolean(project.itLoadMW) && project.regionTier === '枢纽节点' && project.utilization < 0.6,
  },
];

// 依据红线定义补齐「人工核查类」条目的说明来源，便于页面统一展示。
export const NEGATIVE_REDLINE_BASIS = REDLINE_DEFS;

export function negativeSummary(items) {
  const counts = { deny: 0, strict: 0, watch: 0 };
  let autoCount = 0;
  for (const item of items) {
    counts[item.level] += 1;
    if (item.auto) autoCount += 1;
  }
  return { counts, autoCount, manualCount: items.length - autoCount };
}

// 扫描命中：企业口径按企业评价与指标，项目口径按项目要素测算。
export function scanNegativeHits(entries, projects) {
  const enriched = NEGATIVE_ITEMS.map((item) => {
    const hits = [];
    if (item.auto && item.hit) {
      if (item.scope === 'company') {
        for (const entry of entries) {
          if (!entry.evaluation) continue;
          if (item.hit(entry.company, entry.evaluation, entry)) {
            hits.push({
              kind: 'company',
              id: entry.company.id,
              name: entry.company.name,
              meta: entry.company.sector || entry.company.chain || '—',
              province: entry.company.region?.province || '未知',
              warningLevel: entry.evaluation.warningLevel,
              pending: item.pending
                ? Boolean(item.pending(entry.company, entry.evaluation))
                : false,
              detail: item.note ? item.note(entry.company, entry.evaluation) : '',
            });
          }
        }
      } else if (item.scope === 'project') {
        for (const project of projects) {
          if (item.hit(project)) {
            hits.push({
              kind: 'project',
              id: project.id,
              name: project.name,
              meta: `${project.typeShort} · ${project.ownerShort}`,
              province: project.province,
              warningLevel: project.subjectWarning,
              pending: false,
              detail: item.note ? item.note(project) : '',
            });
          }
        }
      }
    }
    return { ...item, hits, hitCount: hits.length };
  });

  const companyHits = new Set();
  const projectHits = new Set();
  for (const item of enriched) {
    for (const hit of item.hits) {
      if (hit.kind === 'company') companyHits.add(hit.id);
      else projectHits.add(hit.id);
    }
  }

  return {
    items: enriched,
    companyHitCount: companyHits.size,
    projectHitCount: projectHits.size,
    totalHits: enriched.reduce((sum, item) => sum + item.hitCount, 0),
    denyHitCompanies: new Set(
      enriched
        .filter((item) => item.level === 'deny')
        .flatMap((item) => item.hits.filter((hit) => hit.kind === 'company').map((hit) => hit.id)),
    ).size,
  };
}
