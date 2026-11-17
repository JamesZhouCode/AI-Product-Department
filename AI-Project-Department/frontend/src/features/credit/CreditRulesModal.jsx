import { useEffect } from 'react';
import {
  COMPANY_GROUPS,
  CREDIT_COMPOSITION,
  CREDIT_LEVELS,
  DIMENSION_META,
  DIMENSION_WEIGHTS,
  REDLINE_DEFS,
  STAGES,
  SUB_INDICATORS,
  VALUE_COMPOSITION,
  VALUE_LEVELS,
  WARNING_LEVELS,
} from './creditConfig';

// 一级维度配色（与雷达图一致，便于对照阅读）。
const DIM_TONE = {
  chain: '#1769e0',
  cluster: '#0b9b90',
  technology: '#ed861d',
  operation: '#168d69',
  financial: '#775bd6',
  trade: '#2f7fd0',
  capital: '#c2575b',
  governance: '#c23b37',
};

const LAYERS = [
  {
    key: 'L1',
    title: '第一层　通用企业评价底座',
    items: [
      '企业基本情况与治理结构',
      '经营质量与商业化能力',
      '财务与偿债能力',
      '交易真实性与客户质量',
      '信用记录与合规情况',
      '投融资经历',
      '数据质量与证据可信度',
    ],
  },
  {
    key: 'L2',
    title: '第二层　行业专属评价',
    items: [],
  },
  {
    key: 'L3',
    title: '第三层　企业类型与发展阶段动态配置',
    items: [
      '先识别企业主营业务类型与发展阶段，再自动加载适用权重、指标与阈值',
      '不得让同一套财务阈值、技术指标与评分档位机械适用于所有企业',
      '企业跨类型时允许「主类型 + 辅助类型」配置，避免重复计分',
      '不同细分企业不应被要求提供全部相同指标，未适用指标显式剔除并记录',
    ],
  },
];

// 第二层按行业替换：储能看电池与项目，算力看芯片架构、能效与上架率。
const L2_ITEMS = {
  储能产业: [
    '技术路线、成熟度与产业化可行性',
    '产品安全性与可靠性',
    '循环寿命、效率与衰减等技术表现',
    '认证、测试与实际运行验证',
    '产能利用率与产品成本竞争力',
    '储能项目运行、收益机制与电力市场适配',
    '并网、调度、交付与运维能力',
    '储能项目全生命周期责任',
    '产业集群、区域生态与上下游协同',
    '技术路线变化、产能过剩、价格竞争与客户集中风险',
  ],
  算力产业: [
    '技术路线、算力架构与产业化可行性（GPU / ASIC / NPU / Chiplet）',
    '产品稳定性与可靠性（MTBF、故障率、批次一致性）',
    '能效、算力密度与散热表现（PUE、单柜功率、单位算力成本）',
    '生态兼容性与规模部署验证（CUDA / CANN / ROCm 适配、集采中标记录）',
    '产能、交付能力与成本竞争力（先进封装、供应链保障）',
    '智算中心上架率、电价与运营收益（IDC / 算力租赁）',
    '交付、运维与 SLA 能力（集群可用率、故障响应）',
    '设备全生命周期与供应链责任',
    '产业集群、区域生态与上下游协同',
    '技术路线变化、产能过剩、价格竞争与客户集中风险',
  ],
};

const DICT_FIELDS = [
  '指标名称',
  '指标编号',
  '所属一级维度',
  '适用企业类型',
  '指标定义',
  '业务意义',
  '指标满分',
  '计算公式或判断逻辑',
  '各评分档位及具体含义',
  '本次实际得分',
  '本次得分对应档位',
  '实际数据与计算过程',
  '加分依据',
  '扣分依据',
  '数据来源',
  '数据时间',
  '证据可信度',
  '缺失或冲突信息',
  '风险提示',
  '客户经理后续行动建议',
];

const MATURITY_BANDS = [
  ['100%', '核心技术已完成充分验证，关键性能有可靠测试证据，并已形成稳定商业化应用'],
  ['75%', '核心技术已完成样机或中试验证，有客户测试或示范应用证据，规模化商业化仍需进一步验证'],
  ['50%', '已有明确技术方案和初步验证结果，但关键性能、成本或可靠性仍存在较大不确定性'],
  ['25%', '主要依赖研发设想或初步实验，关键性能和产业化路径缺乏充分证据'],
  [
    '0',
    '有可靠证据表明关键技术目标无法实现、技术路线存在重大不可行性，或关键技术声明被证实存在重大问题',
  ],
];

const BUSINESS_REVIEW = [
  '融资用途与还款来源是否匹配',
  '融资期限与项目/资产回收周期是否匹配',
  '交易背景与合同真实性是否可核验',
  '担保或其他风险缓释条件是否落实',
  '尚需补充的资料（清单化、可追踪）',
  '应升级审查的风险事项（红线复核、结构风险、集中度）',
];

export default function CreditRulesModal({ open, onClose, industryLabel = '储能产业' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const layers = LAYERS.map((layer) =>
    layer.key === 'L2'
      ? {
          ...layer,
          title: `第二层\u3000${industryLabel}专属评价`,
          items: L2_ITEMS[industryLabel] || L2_ITEMS['储能产业'],
        }
      : layer,
  );

  return (
    <div className="credit-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="credit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI评分规则说明"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="credit-modal-head">
          <div>
            <h2>AI 评分规则说明</h2>
            <p className="muted">
              {industryLabel}企业 AI 评价模型 V2.0 · 三层评价架构 · 八维 100 分 ·
              经营价值与信用风险双评价
            </p>
          </div>
          <button type="button" className="credit-modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="credit-modal-body">
          <section className="credit-rule-block">
            <h3>一、三层评价架构</h3>
            <div className="credit-rule-layers">
              {layers.map((layer) => (
                <div key={layer.key} className="credit-rule-layer">
                  <b>{layer.title}</b>
                  <ul>
                    {layer.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="muted">
              校验要求：每类企业的权重之和必须严格等于 100
              分；每个一级维度下二级指标满分之和必须等于对应权重；
              权重存储在可配置规则中并支持调整；不适用指标必须有明确处理机制，不得静默删除后导致分数虚高；
              企业发展阶段可影响指标解释与适用阈值，但不能修改信用风险红线。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>二、五类企业 × 八个一级维度权重（首版规则配置）</h3>
            <table className="credit-rule-table credit-rule-weight-table">
              <thead>
                <tr>
                  <th>一级维度</th>
                  {COMPANY_GROUPS.map((group) => (
                    <th key={group.key} className="num">
                      {group.label.replace(/^([A-E])类 · /, '$1·')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIMENSION_META.map((dim) => (
                  <tr key={dim.key}>
                    <th>
                      <i className="credit-rule-dot" style={{ background: DIM_TONE[dim.key] }} />
                      {dim.name}
                    </th>
                    {COMPANY_GROUPS.map((group) => (
                      <td key={group.key} className="num">
                        {DIMENSION_WEIGHTS[group.key][dim.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="total">
                  <th>合计</th>
                  {COMPANY_GROUPS.map((group) => (
                    <td key={group.key} className="num">
                      100
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <div className="credit-rule-groups">
              {COMPANY_GROUPS.map((group) => (
                <div key={group.key} className="credit-rule-group">
                  <b>{group.label}</b>
                  <p>{group.focus}</p>
                </div>
              ))}
            </div>
            <p className="muted">
              权重仅为首版规则配置，必须支持调整，并通过历史样本与业务专家评审校准。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>三、二级指标与评分字典</h3>
            <div className="credit-rule-dims">
              {DIMENSION_META.map((dim) => (
                <div key={dim.key} className="credit-rule-dim">
                  <div className="credit-rule-dim-head">
                    <i style={{ background: DIM_TONE[dim.key] }} />
                    <b>{dim.name}</b>
                    <span className="credit-rule-dim-max">
                      权重 {DIMENSION_WEIGHTS.A[dim.key]}—{DIMENSION_WEIGHTS.C[dim.key]} 分
                    </span>
                  </div>
                  <ul>
                    {(SUB_INDICATORS[dim.key] || []).map((row) => (
                      <li key={row.key}>
                        <span title={row.def}>{row.name}</span>
                        <em>{Math.round(row.ratio * 100)}%</em>
                      </li>
                    ))}
                  </ul>
                  <p className="muted">百分比为该指标占所属一级维度的比重</p>
                </div>
              ))}
            </div>
            <p className="muted">
              每个二级指标都必须具备以下 20
              项元数据，点击评分即可查看档位含义、实际数据、计算过程、加分扣分原因与证据来源：
              {DICT_FIELDS.join('、')}。
            </p>
            <p className="muted">
              数值指标必须明确阈值与边界条件；定性指标必须定义可验证的判断条件；缺乏经行业验证的
              {industryLabel}阈值时， 一律标注「首版暂定规则」，不宣称已存在行业标准。
            </p>
            <div className="credit-rule-bands">
              <b>档位定义示例：技术成熟度</b>
              <ul>
                {MATURITY_BANDS.map(([score, desc]) => (
                  <li key={score}>
                    <em>{score}</em>
                    <span>{desc}</span>
                  </li>
                ))}
              </ul>
              <p className="muted">
                档位仅为示例，实际系统需按技术路线、应用场景与证据质量进一步定义。企业处于早期阶段时技术成熟度可以较高，
                但经营质量、现金流与偿债风险必须单独呈现。
              </p>
            </div>
          </section>

          <section className="credit-rule-block">
            <h3>四、企业发展阶段识别</h3>
            <div className="credit-rule-stages">
              {STAGES.map((stage) => (
                <div key={stage.key} className="credit-rule-stage">
                  <b>{stage.label}</b>
                  <span>{stage.note}</span>
                </div>
              ))}
            </div>
            <p className="muted">
              发展阶段不能仅依据成立年限或融资轮次确定，应结合技术验证、产品交付、收入、订单与运营记录综合判定。
              阶段识别用于选择合适的指标解释与阈值；研发早期与样机中试阶段的企业按科技创新型（C
              类）权重评价，
              原行业类型作为辅助类型仅用于避免重复计分，不得用于自动豁免重大信用风险。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>五、双结果输出：经营价值评价 + 信用与融资适配评价</h3>
            <p className="muted">
              系统不得只输出一个综合总分。下列两个结果必须独立展示，经营价值评分不得直接解释为授信通过概率。
            </p>
            <div className="credit-rule-dual">
              <div className="credit-rule-dual-col">
                <b>经营价值评价</b>
                <p className="muted">回答企业是否值得银行优先关注、建立联系、寻找合作机会</p>
                <ul>
                  {VALUE_COMPOSITION.map((part) => (
                    <li key={part.key}>
                      <span>{DIMENSION_META.find((dim) => dim.key === part.key)?.name}</span>
                      <em>{Math.round(part.weight * 100)}%</em>
                    </li>
                  ))}
                </ul>
                <ul className="credit-rule-levels">
                  {VALUE_LEVELS.map((level) => (
                    <li key={level.key}>
                      <b>{level.label}</b>（≥{level.min} 分）{level.note}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="credit-rule-dual-col">
                <b>信用与融资适配评价</b>
                <p className="muted">
                  回答当前存在哪些风险、哪些资料需要补充、哪些业务需要进一步审查
                </p>
                <ul>
                  {CREDIT_COMPOSITION.map((part) => (
                    <li key={part.key}>
                      <span>{DIMENSION_META.find((dim) => dim.key === part.key)?.name}</span>
                      <em>{Math.round(part.weight * 100)}%</em>
                    </li>
                  ))}
                </ul>
                <ul className="credit-rule-levels">
                  {CREDIT_LEVELS.map((level) => (
                    <li key={level.key}>
                      <b>{level.label}</b>（≥{level.min} 分）{level.note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="credit-rule-bands credit-rule-review">
              <b>具体融资业务审查提示</b>
              <ol className="credit-rule-review-list">
                {BUSINESS_REVIEW.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              <p className="muted">
                规则护栏：研发/中试阶段企业当前经营现金流为负时，信用适配评分按规则设上限；
                财务数据不完整时结论以补充资料后复评结果为准。技术潜力高不等于偿债能力强，
                不得因技术优秀自动提高信用安全评价。
              </p>
            </div>
          </section>

          <section className="credit-rule-block">
            <h3>六、风险红线与预警（评分降级仅限已核实的重大红线）</h3>
            <p className="muted">
              {
                '红线与预警必须记录事实、来源、时间、主体匹配与复核状态；未经核实的风险信号标记「待核实」，不直接作为评分降级依据，仅触发补充核实要求。'
              }
            </p>
            <div className="credit-rule-redlines">
              {Object.entries(REDLINE_DEFS).map(([cls, def]) => (
                <div key={cls} className="credit-rule-redline">
                  <b>
                    {cls} 类 · {def.label}
                    {cls === 'A' ? '（经核实后评分降级）' : '（按严重程度降级）'}
                  </b>
                  <ul>
                    {Object.values(def.items).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="credit-rule-block">
            <h3>七、预警等级与数据质量</h3>
            <div className="credit-rule-warnings">
              {Object.entries(WARNING_LEVELS)
                .filter(([key]) => key !== 'normal')
                .map(([key, meta]) => (
                  <span key={key} className={`credit-rule-warning level-${key}`}>
                    {meta.label}
                  </span>
                ))}
              <span className="credit-rule-warning level-normal">
                {WARNING_LEVELS.normal.label}
              </span>
            </div>
            <p className="muted">
              还款能力、现金流、杠杆、应收与存货、诉讼、核心客户与订单、项目收益等变化将自动触发对应等级预警。
            </p>
            <p className="muted">
              数据质量：缺失指标不得默认等于
              0，也不得在没有说明的情况下重新分配权重。系统对每个企业输出数据完整度、
              待补充指标清单与非适用指标清单；完整度不足时结论标注为待补充复评。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>八、版本管理与历史校准</h3>
            <p className="muted">
              当前版本为 <b>V2.0 试运行版</b>（八维、五类企业差异化权重、A/B
              两类红线、双评价输出）。
              历史校验至少覆盖：不同企业类型的评分差异、不同发展阶段的评分合理性、新旧模型评分对比、
              投融资经历与产业集群指标的增量价值、各维度与历史风险表现的关系、评分一致性与缺失率、
              错误高分与错误低分及边界案例分析。
            </p>
            <p className="muted">
              历史样本不足时应明确标注规则为试运行版本，不得宣称已验证授信通过率预测能力；
              规则调整须留存版本号与人工调整记录。
            </p>
          </section>

          <p className="credit-rule-disclaimer">
            AI
            辅助分析结果，不替代银行正式授信审批；经营价值评价与参考分层、参考额度均不构成授信结论。
          </p>
        </div>
      </div>
    </div>
  );
}
