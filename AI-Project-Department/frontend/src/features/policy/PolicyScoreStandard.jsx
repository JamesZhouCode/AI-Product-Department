// 「打分标准」弹窗：把政策影响评分的打分口径公开给用户查看。
//
// 说明：评分模型的档位分值与引擎算法共用 policyData 中的同一组常量
// （SCORE_FORMULAS / POLICY_LEVELS / GOAL_STRENGTHS / POLICY_BASE_YEAR），
// 所以这里展示的标准就是引擎实际执行的标准，不存在「两套口径」。
import { POLICY_BASE_YEAR, POLICY_SCORE_MODEL, SCORE_FORMULAS, TONE_CLASS } from './policyData';
import PolicySourceBadge from './PolicySourceBadge';

export function PolicyScoreStandardModal({ result, onClose }) {
  const current = new Map((result?.score.dimensions || []).map((dim) => [dim.key, dim]));

  return (
    <div className="policy-modal-mask" role="presentation" onClick={onClose}>
      <div
        className="policy-modal policy-standard-modal"
        role="dialog"
        aria-modal="true"
        aria-label="政策影响评分 · 打分标准"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="policy-modal-head">
          <h3>政策影响评分 · 打分标准</h3>
          <button type="button" className="policy-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="policy-modal-body">
          {result && (
            <p className="policy-standard-current">
              当前政策：<b>{result.title}</b>
              <span className="policy-standard-total">总分 {result.score.total} / 100</span>
              <span className={`policy-chip ${TONE_CLASS[result.score.grade.tone] ?? ''}`}>
                {result.score.grade.label}
              </span>
            </p>
          )}

          <p className="policy-source-summary">{POLICY_SCORE_MODEL.note}</p>
          <p className="policy-standard-totalnote">{POLICY_SCORE_MODEL.totalNote}</p>

          <h4>一、八个维度的打分标准</h4>
          <div className="policy-source-table-wrap">
            <table className="policy-source-table policy-standard-table">
              <thead>
                <tr>
                  <th>维度 / 怎么算</th>
                  <th>分值档位与计分项</th>
                  <th>本政策得分</th>
                </tr>
              </thead>
              <tbody>
                {POLICY_SCORE_MODEL.dimensions.map((dim) => {
                  const hit = current.get(dim.key);
                  return (
                    <tr key={dim.key}>
                      <td className="policy-cell-text">
                        <b className="policy-standard-dim">{dim.label}</b>
                        <em className="policy-standard-weight">
                          权重 {dim.weight} · 满分 {dim.weight}
                        </em>
                        <p className="policy-standard-formula">{dim.standard}</p>
                      </td>
                      <td>
                        <ul className="policy-standard-bands">
                          {dim.bands.map((band, bandIndex) => (
                            <li key={`${dim.key}-${bandIndex}`}>
                              <span>{band.cond}</span>
                              <b>{band.score}</b>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="policy-cell-text">
                        {hit ? (
                          <>
                            <b className="policy-standard-hit">{hit.score}</b>
                            <em className="policy-standard-weighted">加权 {hit.weighted}</em>
                            <p className="policy-standard-evidence">{hit.evidence}</p>
                          </>
                        ) : (
                          <span className="policy-standard-none">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h4>二、总分与等级评定</h4>
          <div className="policy-source-table-wrap">
            <table className="policy-source-table policy-standard-table">
              <thead>
                <tr>
                  <th>总分区间</th>
                  <th>等级</th>
                  <th>对应动作</th>
                </tr>
              </thead>
              <tbody>
                {POLICY_SCORE_MODEL.grades.map((grade, index) => (
                  <tr key={grade.label}>
                    <td className="policy-cell-text">
                      <b className="policy-standard-hit">
                        {index === 0
                          ? `≥ ${grade.min}`
                          : `${grade.min} – ${POLICY_SCORE_MODEL.grades[index - 1].min - 1}`}
                      </b>
                      <em className="policy-standard-weighted">分</em>
                    </td>
                    <td>
                      <span className={`policy-chip ${TONE_CLASS[grade.tone] ?? ''}`}>
                        {grade.label}
                      </span>
                    </td>
                    <td className="policy-cell-text">{grade.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="policy-source-steps">
            <li>
              <b>总分怎么来</b>：八个维度各按上表打出 0–100
              的子分，再乘各自权重后相加，四舍五入取整。
            </li>
            <li>
              <b>S 级封顶</b>：S 级（85 分及以上）仅授予国家级重大方向性政策；省级及以下即使算到 85
              分，最高也只评为 A 级。
            </li>
            <li>
              <b>年限基准</b>：持续时间维度按目标年份距今（基准 {POLICY_BASE_YEAR} 年）取档；
              明确写执行跨度 ≥ {SCORE_FORMULAS.duration.spanBonusMin} 年的再加{' '}
              {SCORE_FORMULAS.duration.spanBonus} 分。
            </li>
          </ul>

          <p className="policy-source-note">
            打分标准由本页规则引擎按原文命中执行（关键词词典 +
            上表档位），权重与档位取自行内政策分析框架，
            可由业务部门按授信政策重新校准；打分结果用于提高政策研读的一致性，不替代正式授信审批。
            <PolicySourceBadge sourceKey="scoreModel" />
            <PolicySourceBadge sourceKey="engine" />
          </p>
        </div>
      </div>
    </div>
  );
}
