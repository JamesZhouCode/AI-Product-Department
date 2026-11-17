// 分析模块的数据来源标注组件。
//
// 复用「授信」模块的溯源浮层（SourceBadge）交互，元数据换成分析模块自己的
// analysisSources.js：绿色系「清单数据」= 入库真实口径，橙色系「AI估算 / AI计算」
// = AI 推算的演示数据，浮层内同时给出替换为准确数据所需对接的数据源。
import SourceBadge from '../credit/SourceBadge';
import {
  ANALYSIS_FIELD_SOURCES,
  ANALYSIS_SOURCE_META,
  ANALYSIS_SOURCE_SUMMARY,
  sourceRowNote,
} from './analysisSources';

export default function AnalysisSourceBadge({ sourceKey }) {
  const meta = ANALYSIS_SOURCE_META[sourceKey];
  if (!meta) return null;
  return <SourceBadge sourceMeta={meta} />;
}

// 「数据来源说明」弹窗：字段级来源对照 + AI 估算项需对接的数据源清单。
export function AnalysisSourceModal({ onClose }) {
  const aiSources = Object.entries(ANALYSIS_SOURCE_META).filter(([, meta]) => meta.kind === 'ai');
  return (
    <div className="ana-modal-mask" role="presentation" onClick={onClose}>
      <div
        className="ana-modal ana-source-modal"
        role="dialog"
        aria-modal="true"
        aria-label="数据来源说明"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ana-modal-head">
          <h3>数据来源说明</h3>
          <button type="button" className="ana-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="ana-modal-body">
          <p className="ana-source-summary">{ANALYSIS_SOURCE_SUMMARY}</p>

          <h4>一、字段级来源对照</h4>
          <div className="ana-source-table-wrap">
            <table className="ana-table">
              <thead>
                <tr>
                  <th>数据字段</th>
                  <th>来源标注</th>
                  <th>来源说明</th>
                </tr>
              </thead>
              <tbody>
                {ANALYSIS_FIELD_SOURCES.map((group) => (
                  <FragmentRows key={group.group} group={group} />
                ))}
              </tbody>
            </table>
          </div>

          <h4>二、AI 估算项：如需准确数据，可对接以下数据源</h4>
          <div className="ana-source-db-grid">
            {aiSources.map(([key, meta]) => (
              <article key={key} className="ana-source-db-card">
                <h5>
                  {meta.scope}
                  <span className={`ana-source-kind kind-${meta.kind}`}>{meta.badge}</span>
                </h5>
                <p>{meta.detail}</p>
                <ul>
                  {meta.databases.map((db) => (
                    <li key={db}>{db}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <p className="ana-note">
            上述外部数据接入后，本页所有 AI 估算指标可按同一套模型自动复算，无需改动页面结构； AI
            生成的亮点、趋势与授信建议仍建议由业务人员复核后使用。
          </p>
        </div>
      </div>
    </div>
  );
}

function FragmentRows({ group }) {
  return (
    <>
      <tr className="ana-source-group-row">
        <td colSpan={3}>
          <b>{group.group}</b>
        </td>
      </tr>
      {group.items.map((item) => {
        const meta = ANALYSIS_SOURCE_META[item.source];
        return (
          <tr key={item.field}>
            <td className="ana-cell-text">{item.field}</td>
            <td>
              <span className={`ana-source-kind kind-${meta.kind}`}>{meta.badge}</span>
            </td>
            <td className="ana-cell-text">{sourceRowNote(meta)}</td>
          </tr>
        );
      })}
    </>
  );
}
