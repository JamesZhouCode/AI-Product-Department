import { useEffect } from 'react';

const DIMENSIONS = [
  {
    key: 'chain',
    name: '产业链价值',
    max: 20,
    tone: '#1769e0',
    sub: [
      ['产业链重要性', 5],
      ['市场需求稳定性', 4],
      ['竞争格局', 3],
      ['客户粘性', 3],
      ['技术/产品壁垒', 3],
      ['政策/绿色属性', 2],
    ],
    note: '电芯、PCS、BMS 等关键环节重要性较高；同质化、替代性强的环节较低。产业链位置不直接等于授信价值——核心企业现金流恶化仍会降级。',
  },
  {
    key: 'operation',
    name: '企业经营质量',
    max: 25,
    tone: '#0b9b90',
    sub: [
      ['营收规模', 3],
      ['盈利能力', 4],
      ['经营现金流', 5],
      ['客户质量', 4],
      ['客户集中度', 3],
      ['订单/合同', 3],
      ['产能利用率', 3],
    ],
    note: '经营现金流权重高于净利润。识别「收入增长→应收增长→存货增长→利润增长→现金流恶化」形态，自动生成「利润增长但现金流承压」标签。',
  },
  {
    key: 'financial',
    name: '财务偿债能力',
    max: 25,
    tone: '#775bd6',
    sub: [
      ['资产负债率', 3],
      ['有息负债率', 3],
      ['EBITDA 利息保障倍数', 3],
      ['经营现金流/有息负债', 4],
      ['流动/速动比率', 2],
      ['应收账款质量', 3],
      ['存货质量', 3],
      ['短期债务压力', 2],
      ['对外担保/或有负债', 2],
    ],
    note: '重点公式：OCF/有息负债、EBITDA/利息支出、短期有息负债/(货币资金+经营现金流)。',
  },
  {
    key: 'technology',
    name: '技术与产品竞争力',
    max: 15,
    tone: '#ed861d',
    sub: [
      ['技术成熟度', 3],
      ['技术壁垒', 3],
      ['产品认证', 2],
      ['产品可靠性', 2],
      ['技术迭代风险', 3],
      ['研发能力', 2],
    ],
    note: '技术授信评价 = 成熟度 + 商业化程度 + 壁垒 − 替代风险；不以研发投入高低简单判定技术风险。',
  },
  {
    key: 'trade',
    name: '产业链交易质量',
    max: 10,
    tone: '#168d69',
    sub: [
      ['上游供应商稳定性', 2],
      ['下游客户质量', 3],
      ['应收账款真实性', 2],
      ['订单真实性', 2],
      ['产业链依赖程度', 1],
    ],
    note: '重点判断「企业和谁做生意」：电网体系、央国企能源集团为高质量客户；小型贸易商、单一客户依赖、关联交易需关注。',
  },
  {
    key: 'governance',
    name: '公司治理与信用',
    max: 5,
    tone: '#c23b37',
    sub: [
      ['实控人/股东稳定性', 1],
      ['征信及银行合作记录', 1],
      ['涉诉/被执行情况', 1],
      ['对外担保', 1],
      ['关联交易/资金占用', 1],
    ],
    note: '分值虽仅 5 分，但具有风险否决权。',
  },
];

const RED_LINES = [
  {
    key: 'A',
    name: 'A类 · 信用红线',
    items: [
      '重大失信 / 恶意逃废债',
      '重大财务造假 / 骗贷风险',
      '核心银行债务实质性违约',
      '重大关联方资金占用 / 违法违规',
    ],
  },
  {
    key: 'B',
    name: 'B类 · 偿债红线',
    items: [
      '经营现金流持续恶化',
      '大量借新还旧 / 短债长期化',
      '大额应收账款异常增长',
      '存货异常积压 / 短债压力过高',
    ],
  },
  {
    key: 'C',
    name: 'C类 · 经营红线',
    items: ['产能利用率持续过低', '核心客户流失 / 产品被替代', '大量订单取消', '重大安全事故'],
  },
  {
    key: 'D',
    name: 'D类 · 项目红线',
    items: [
      '项目无法并网 / 收益机制不明确',
      '核心合同不真实',
      '项目现金流无法覆盖债务',
      '保险/质保缺失 / 重大安全隐患',
    ],
  },
];

const TIER_MAP = [
  ['90–100 分', 'S 级 · 战略核心客户', '第一层 · 重点支持'],
  ['80–89 分', 'A 级 · 重点支持客户', '第一层 · 重点支持'],
  ['70–79 分', 'B 级 · 条件支持客户', '第二层 · 条件支持'],
  ['60–69 分', 'B−/C+ 级', '第二层或第三层（结合红线与财务情况）'],
  ['0–59 分', 'C 级 · 审慎客户', '第三层 · 严格准入'],
];

export default function CreditRulesModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

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
            <p className="muted">储能产业链智能授信 · 六维 100 分评价模型与客户分层规则</p>
          </div>
          <button type="button" className="credit-modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="credit-modal-body">
          <section className="credit-rule-block">
            <h3>一、六维评价模型（总分 100 分）</h3>
            <div className="credit-rule-dims">
              {DIMENSIONS.map((dim) => (
                <div key={dim.key} className="credit-rule-dim">
                  <div className="credit-rule-dim-head">
                    <i style={{ background: dim.tone }} />
                    <b>{dim.name}</b>
                    <span className="credit-rule-dim-max">{dim.max} 分</span>
                  </div>
                  <ul>
                    {dim.sub.map(([name, score]) => (
                      <li key={name}>
                        <span>{name}</span>
                        <em>{score}</em>
                      </li>
                    ))}
                  </ul>
                  <p>{dim.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="credit-rule-block">
            <h3>二、风险红线 · 一票否决</h3>
            <p className="muted">
              评分不是唯一判断依据。触发任一红线的企业不允许仅凭高分进入第一层，将直接降级或限制准入。
            </p>
            <div className="credit-rule-redlines">
              {RED_LINES.map((line) => (
                <div key={line.key} className="credit-rule-redline">
                  <b>{line.name}</b>
                  <ul>
                    {line.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="credit-rule-block">
            <h3>三、评分 · 内部评级 · 客户分层映射</h3>
            <table className="credit-rule-table">
              <thead>
                <tr>
                  <th>综合评分</th>
                  <th>内部评级</th>
                  <th>对外分层</th>
                </tr>
              </thead>
              <tbody>
                {TIER_MAP.map(([range, grade, tier]) => (
                  <tr key={range}>
                    <td>{range}</td>
                    <td>{grade}</td>
                    <td>{tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="credit-rule-example muted">
              示例：92 分 + 无红线 → 第一层；88 分 + 重大债务违约 → 第三层/限制准入；63 分 + 高应收
              + 短债压力 → 第三层。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>四、建议授信额度（非线性换算）</h3>
            <div className="credit-rule-formula">
              建议额度 = 基础额度 × 信用系数 × 行业系数 × 现金流系数 × 增信系数 × 银行集中度调整系数
            </div>
            <p className="muted">
              额度不与评分线性挂钩（例如 90 分 ≠ 9000
              万）。制造企业与储能项目公司评价模型有区别：系统集成重点看项目现金流与应收账款；独立储能重点看
              DSCR、IRR、电价与容量机制；电芯/核心部件重点看产能利用率、客户质量、库存与应收账款。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>五、动态预警等级</h3>
            <div className="credit-rule-warnings">
              <span className="credit-rule-warning level-blue">蓝色 · 关注</span>
              <span className="credit-rule-warning level-yellow">黄色 · 预警</span>
              <span className="credit-rule-warning level-orange">橙色 · 较高风险</span>
              <span className="credit-rule-warning level-red">红色 · 高风险</span>
            </div>
            <p className="muted">
              营收连续下降、现金流恶化、杠杆快速上升、应收/存货异常增长、重大诉讼、核心客户流失、订单大幅下降等变化将自动触发对应等级预警。
            </p>
          </section>

          <p className="credit-rule-disclaimer">AI 辅助分析结果，不替代银行正式授信审批</p>
        </div>
      </div>
    </div>
  );
}
