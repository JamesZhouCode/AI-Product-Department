// 「行业」页的数据来源标注组件。
//
// 复用「授信」模块的溯源浮层（SourceBadge）交互，元数据按当前产业链从
// macroSourceContext 取：储能产业 → macroSources.js，算力产业 → macroSourcesCompute.js。
// 蓝色系「官方 / 行业统计」= 真实公开披露口径，橙色系「研判 / 读法」= 本页推导的判断口径。
import SourceBadge from '../credit/SourceBadge';
import { useMacroSources } from './macroSourceContext';

export default function MacroSourceBadge({ sourceKey }) {
  const { MACRO_SOURCE_META } = useMacroSources();
  const meta = MACRO_SOURCE_META[sourceKey];
  if (!meta) return null;
  return <SourceBadge sourceMeta={meta} />;
}

// 「数据来源说明」弹窗：字段级来源对照 + 研判口径说明 + 更新节奏。
// cadence 由当前行业数据集（ASSISTANT.cadence）传入，避免把更新节奏写死在组件里。
export function MacroSourceModal({ onClose, industryLabel = '储能产业', cadence = [] }) {
  const { MACRO_FIELD_SOURCES, MACRO_SOURCE_SUMMARY, MACRO_SOURCE_META, macroSourceRowNote } =
    useMacroSources();

  return (
    <div className="macro-modal-mask" role="presentation" onClick={onClose}>
      <div
        className="macro-modal macro-source-modal"
        role="dialog"
        aria-modal="true"
        aria-label="数据来源说明"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="macro-modal-head">
          <h3>数据来源说明</h3>
          <button type="button" className="macro-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="macro-modal-body">
          <p className="macro-source-summary">{MACRO_SOURCE_SUMMARY}</p>

          <h4>一、字段级来源对照</h4>
          <div className="macro-source-table-wrap">
            <table className="macro-source-table">
              <thead>
                <tr>
                  <th>判断 / 指标</th>
                  <th>来源标注</th>
                  <th>发布主体与出处</th>
                </tr>
              </thead>
              <tbody>
                {MACRO_FIELD_SOURCES.map((group) => (
                  <MacroSourceRows
                    key={group.group}
                    group={group}
                    meta={MACRO_SOURCE_META}
                    rowNote={macroSourceRowNote}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <h4>二、更新与复核</h4>
          <ul className="macro-source-steps">
            {cadence.map((item) => (
              <li key={item.key}>
                <b>{item.label}</b>：{item.text}
              </li>
            ))}
            <li>
              <b>行内同步</b>：产业链环节样本随产业链地图更新；授信评价分层随「授信」页模型更新。
            </li>
            <li>
              <b>结论复核</b>
              ：上游数据更新后，本页研判口径（橙色标注）需由业务人员复核，不做自动改写；完整更新节奏见第
              09 模块。
            </li>
          </ul>

          <p className="macro-source-note">
            本页为{industryLabel}
            的宏观趋势判断口径，用于趋势方向的判读，不替代银行正式授信审批与投资决策；
            具体项目与企业判断请以尽调材料与行内制度为准。
          </p>
        </div>
      </div>
    </div>
  );
}

function MacroSourceRows({ group, meta, rowNote }) {
  return (
    <>
      <tr className="macro-source-group-row">
        <td colSpan={3}>
          <b>{group.group}</b>
        </td>
      </tr>
      {group.items.map((item) => {
        const row = meta[item.source];
        return (
          <tr key={item.field}>
            <td className="macro-cell-text">{item.field}</td>
            <td>
              <span className={`macro-source-kind kind-${row.kind}`}>{row.badge}</span>
            </td>
            <td className="macro-cell-text">{rowNote(row)}</td>
          </tr>
        );
      })}
    </>
  );
}
