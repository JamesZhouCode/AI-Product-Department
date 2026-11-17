import { useEffect } from 'react';
import { CONCLUSIONS, PROJECT_SCORECARD } from './projectCreditEngine';

// 维度配色与项目页的评分条保持一致，便于对照阅读。
const DIM_TONE = {
  compliance: '#1769e0',
  demand: '#0b9b90',
  finance: '#775bd6',
  tech: '#ed861d',
  subject: '#168d69',
};

// 各维度的计分口径（与 projectCreditEngine 中的打分函数一一对应）。
const DIM_RULES = {
  compliance: [
    ['项目备案/核准', '已落实 8 · 待补件 4.4 · 缺失 0'],
    ['能耗与绿电指标', '已落实 8 · 待补件 4.4 · 缺失 0'],
    ['用地/机房权属与消防', '已落实 7 · 待补件 3.8 · 缺失 0'],
    ['能效 PUE 或环保验收', '达标 7 · 待改造 4.5 · 未达标 0'],
  ],
  demand: [
    ['长协客户锁定率', '锁定率 × 10（0–10）'],
    ['稳定期上架率', '上架率 × 8（0–8）'],
    ['区域供需与电价', '区域需求分档 0–7'],
  ],
  finance: [
    ['测算 DSCR', '档位计分 0–12'],
    ['资本金比例', '档位计分 0.8–6'],
    ['项目 IRR', 'IRR × 30，上限 4'],
    ['建设期利息与超支', '预留充足 3 · 偏紧 1.6'],
  ],
  tech: [
    ['技术路线成熟度', '成熟度 0–5 折算 0–4'],
    ['主体技术评价', '主体综合分折算 0–3'],
    ['设备供应与交期', '供应链稳定性折算 0–3'],
  ],
  subject: [
    ['主体评价与层级', '主体综合分折算 0–5.2'],
    ['增信与担保', '基准 2.4–3.0 · 上市 ×1.0 / 非上市 ×0.85，上限 3'],
    ['集团支持与运营经验', '龙头 2 · 骨干 1.4 · 其他 0.9'],
  ],
};

const DSCR_BANDS = [
  ['DSCR ≥ 1.50', '12.0', '现金流覆盖充裕，可支撑较长期限'],
  ['1.40 ≤ DSCR < 1.50', '11.4', '覆盖良好'],
  ['1.30 ≤ DSCR < 1.40', '10.2', '达到「可支持」准入线'],
  ['1.20 ≤ DSCR < 1.30', '8.4', '覆盖尚可，需压降额度或延长期限'],
  ['1.10 ≤ DSCR < 1.20', '6.3', '接近预警线，须补充增信'],
  ['1.00 ≤ DSCR < 1.10', '3.6', '触发 C6 从严条款'],
  ['0.90 ≤ DSCR < 1.00', '1.5', '现金流覆盖不足'],
  ['DSCR < 0.90', '0', '不具备偿债能力'],
];

const CAPITAL_BANDS = [
  ['资本金 ≥ 40%', '6.0', '杠杆保守'],
  ['35% ≤ 资本金 < 40%', '5.5', '—'],
  ['30% ≤ 资本金 < 35%', '4.8', '—'],
  ['25% ≤ 资本金 < 30%', '4.0', '达到「可支持」准入线'],
  ['20% ≤ 资本金 < 25%', '2.4', '不得进入「可支持」结论'],
  ['资本金 < 20%', '0.8', '触发 C5 从严条款'],
];

const CONCLUSION_TREE = [
  {
    key: 'deny',
    when: '备案/核准缺失，或用地、机房权属与消防缺失',
    extra: '任一缺失即直接不予准入，不进入打分排序',
  },
  {
    key: 'support',
    when: '综合分 ≥ 78 且 DSCR ≥ 1.30 且 资本金 ≥ 25% 且 四项合规要素全部「已落实」',
    extra: '四项条件同时满足才可给出',
  },
  { key: 'prudent', when: '综合分 ≥ 62 且 DSCR ≥ 1.12', extra: '按缺口压降额度或补充增信' },
  { key: 'strict', when: '不满足以上任一档条件', extra: '仅可在落实前置条件后复评' },
];

const DOWNGRADE_RULES = [
  'PUE 高于 1.35（C4）：不满足新建大型数据中心准入能效',
  '资本金比例低于 20%（C5）',
  '测算 DSCR 低于 1.10（C6）',
  '长协客户锁定率低于 30%（C7）',
];

const NEGATIVE_LINK = [
  ['C1', '项目未备案 / 未核准', '禁入', '结论直接置为不予准入'],
  ['C2', '无能耗指标或「双控」未落实', '禁入', '能耗要素计 0，且不得投放'],
  ['C3', '用地 / 机房权属不清、消防未验收', '禁入', '结论直接置为不予准入'],
  ['C4', 'PUE 未达准入标准（>1.35）', '从严', '最高只能给「从严控制」'],
  ['C5', '资本金比例低于 20%', '从严', '最高只能给「从严控制」'],
  ['C6', '测算 DSCR 低于 1.10', '从严', '最高只能给「从严控制」'],
  ['C7', '长协客户锁定率低于 30%', '从严', '最高只能给「从严控制」'],
  ['C8', '稳定期上架率低于 55%', '关注', '计入需求维度扣分与风险标签'],
];

export default function ProjectRulesModal({ open, onClose, industryLabel = '算力产业' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const totalMax = PROJECT_SCORECARD.reduce((sum, dim) => sum + dim.max, 0);

  return (
    <div className="credit-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="credit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="项目AI评分规则说明"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="credit-modal-head">
          <div>
            <h2>AI 评分规则说明（项目）</h2>
            <p className="muted">
              {industryLabel}项目 AI 评价模型 V1.0 · 五维 {totalMax} 分 · 合规一票否决 + 分档结论 +
              建议额度测算
            </p>
          </div>
          <button type="button" className="credit-modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="credit-modal-body">
          <section className="credit-rule-block">
            <h3>一、评价对象与样本口径</h3>
            <p className="muted">
              项目池由在链主体派生：先按项目形态归类（智算中心新建、存量机房改扩建、算力设备购置与租赁、
              AI 服务器/网络设备产线、先进封装与测试产线、光模块与光纤产能、液冷与供配电配套产线、
              算力调度平台与软件、机房建设与机电总包），再从对应环节企业中按「主体综合分 65% +
              数据质量 35%」排序确定性抽取，共 120
              个样本；同一主体只承接一个样本项目，避免重复计量。
            </p>
            <p className="muted">
              项目名称、投资额、资本金比例、租约锁定率、上架率与 DSCR
              均按主体体量与区域参数（需求、能耗、电价）推演，使用固定随机种子、同输入同输出；
              仅用于验证评价流程，不作为真实项目信息。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>二、五维评分卡（合计 {totalMax} 分）</h3>
            <div className="credit-rule-dims">
              {PROJECT_SCORECARD.map((dim) => (
                <div key={dim.key} className="credit-rule-dim">
                  <div className="credit-rule-dim-head">
                    <i style={{ background: DIM_TONE[dim.key] }} />
                    <b>{dim.label}</b>
                    <span className="credit-rule-dim-max">满分 {dim.max}</span>
                  </div>
                  <ul>
                    {(DIM_RULES[dim.key] || []).map(([name, rule]) => (
                      <li key={name}>
                        <span>{name}</span>
                        <em>{rule}</em>
                      </li>
                    ))}
                  </ul>
                  <p className="muted">考察子项：{dim.items.join('、')}</p>
                </div>
              ))}
            </div>
            <p className="muted">
              合规维度采用「已落实 = 满分、待补件 = 满分的 55%–65%、缺失 =
              0」的三档口径；需求、财务、技术、主体四个维度按实测值线性或档位折算，
              每个子项得分上限不得超过其所属维度满分。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>三、财务维度档位表</h3>
            <div className="credit-rule-dual">
              <div className="credit-rule-dual-col">
                <b>测算 DSCR（满分 12）</b>
                <table className="credit-rule-table credit-rule-weight-table">
                  <thead>
                    <tr>
                      <th>区间</th>
                      <th className="num">得分</th>
                      <th>含义</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DSCR_BANDS.map(([range, score, note]) => (
                      <tr key={range}>
                        <td>{range}</td>
                        <td className="num">{score}</td>
                        <td className="muted">{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="credit-rule-dual-col">
                <b>资本金比例（满分 6）</b>
                <table className="credit-rule-table credit-rule-weight-table">
                  <thead>
                    <tr>
                      <th>区间</th>
                      <th className="num">得分</th>
                      <th>含义</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAPITAL_BANDS.map(([range, score, note]) => (
                      <tr key={range}>
                        <td>{range}</td>
                        <td className="num">{score}</td>
                        <td className="muted">{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="muted">
              DSCR 按「达产年 EBITDA ÷ 贷款年还本付息额」测算，利率取
              3.5%、期限取项目类型的常见区间； 资本金比例低于 25% 时不再满足「可支持」条件，低于 20%
              直接触发从严条款。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>四、分档结论判定顺序</h3>
            <table className="credit-rule-table">
              <thead>
                <tr>
                  <th>结论</th>
                  <th>判定条件</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {CONCLUSION_TREE.map((row) => {
                  const meta = CONCLUSIONS[row.key];
                  return (
                    <tr key={row.key}>
                      <td>
                        <span className="credit-conclusion-chip" style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                      </td>
                      <td>{row.when}</td>
                      <td className="muted">{row.extra}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted">
              判定自上而下执行，命中即停：先看合规一票否决，再看「可支持」，再看「审慎支持」，
              其余归入「从严控制」。综合分为五维加总后取整。
            </p>
            <div className="credit-rule-bands credit-rule-review">
              <b>一票下调条款（命中任一，最高只能给「从严控制」）</b>
              <ol className="credit-rule-review-list">
                {DOWNGRADE_RULES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          </section>

          <section className="credit-rule-block">
            <h3>五、建议授信额度测算</h3>
            <p className="credit-rule-formula">
              申请授信 = 总投资 ×（1 − 资本金比例）× 85%
              <br />
              建议额度 = 申请授信 × DSCR 系数 × 结论系数
              <br />
              DSCR 系数 = min(max(DSCR ÷ 1.35, 0.45), 1.00)；结论系数 = 可支持 1.00 / 审慎支持 0.72
              / 从严控制 0.35 / 不予准入 0
            </p>
            <p className="muted">
              结果向下取整到 10 万元，且不超过申请授信额度；不予准入的项目建议额度直接为 0。 85%
              的折算系数用于覆盖建设期利息、备付金与放款节奏差异，属于首版口径，可按产品制度调整。
            </p>
          </section>

          <section className="credit-rule-block">
            <h3>六、与负面清单的联动护栏</h3>
            <p className="muted">
              项目结论不得与负面清单（C 类项目要素）冲突：命中禁入类条目的项目不进入评分排序，
              命中从严类条目的项目不得给出「可支持」「审慎支持」结论。
            </p>
            <table className="credit-rule-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>条目</th>
                  <th>口径</th>
                  <th>对结论的影响</th>
                </tr>
              </thead>
              <tbody>
                {NEGATIVE_LINK.map(([code, name, level, effect]) => (
                  <tr key={code}>
                    <td className="muted">{code}</td>
                    <td>{name}</td>
                    <td>{level}</td>
                    <td className="muted">{effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="credit-rule-block">
            <h3>七、数据质量与复核要求</h3>
            <p className="muted">
              合规四项要素须以备案文号、节能审查意见、不动产权证/租赁合同、消防验收与 PUE
              实测报告为准；缺失要素不得默认视为满足，也不得静默剔除以抬高得分。
              项目数据不完整时，结论标注为「待补件复评」，不进入可支持档。
            </p>
            <p className="muted">
              风险标签（未备案、能耗指标待补、权属不清、PUE 超标、DSCR 低于 1.1、资本金偏低、
              长协锁定率不足、上架率爬坡偏慢、主体预警偏高、GPU 残值风险）只做提示，
              不单独改变结论；结论只由合规否决、综合分与三条财务/需求阈值共同决定。
            </p>
          </section>

          <p className="credit-rule-disclaimer">
            AI 辅助分析结果，不替代银行正式授信审批；项目结论与建议额度均不构成授信承诺。
          </p>
        </div>
      </div>
    </div>
  );
}
