// 「政策分析」页的数据来源标注组件。
//
// 复用「授信」模块的溯源浮层（SourceBadge）交互，元数据换成政策模块自己的
// policySources.js：蓝色系「真实口径」（政策原文、产业链地图、区域基础、政策库），
// 橙色系「解读口径」（研判框架、评分模型、集群模型、引擎结论）。
import SourceBadge from '../credit/SourceBadge';
import {
  POLICY_FIELD_SOURCES,
  POLICY_SOURCE_META,
  POLICY_SOURCE_SUMMARY,
  policySourceRowNote,
} from './policySources';

export default function PolicySourceBadge({ sourceKey }) {
  const meta = POLICY_SOURCE_META[sourceKey];
  if (!meta) return null;
  return <SourceBadge sourceMeta={meta} />;
}

// 「数据来源说明」弹窗：字段级来源对照 + 更新与复核 + 使用边界。
export function PolicySourceModal({ onClose }) {
  return (
    <div className="policy-modal-mask" role="presentation" onClick={onClose}>
      <div
        className="policy-modal policy-source-modal"
        role="dialog"
        aria-modal="true"
        aria-label="数据来源说明"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="policy-modal-head">
          <h3>数据来源说明</h3>
          <button type="button" className="policy-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="policy-modal-body">
          <p className="policy-source-summary">{POLICY_SOURCE_SUMMARY}</p>

          <h4>一、字段级来源对照</h4>
          <div className="policy-source-table-wrap">
            <table className="policy-source-table">
              <thead>
                <tr>
                  <th>判断 / 字段</th>
                  <th>来源标注</th>
                  <th>口径说明</th>
                </tr>
              </thead>
              <tbody>
                {POLICY_FIELD_SOURCES.map((group) => (
                  <PolicySourceRows key={group.group} group={group} />
                ))}
              </tbody>
            </table>
          </div>

          <h4>二、更新与复核</h4>
          <ul className="policy-source-steps">
            <li>
              <b>政策入库</b>：新政策在原平台发布后导入本页，政策库保存在浏览器本地，刷新不丢失。
            </li>
            <li>
              <b>产业数据</b>
              ：产业链环节口径随「流程」页产业链地图同步更新；区域产业基础按季度核对。
            </li>
            <li>
              <b>结论复核</b>
              ：引擎抽取的级别、强度、环节与方向需由业务人员对照原文复核，尤其是「未识别」项。
            </li>
            <li>
              <b>策略衔接</b>：S / A 级政策建议纳入季度授信策略复盘，B / C 级纳入政策库归档跟踪。
            </li>
          </ul>

          <p className="policy-source-note">
            本页为政策文本的结构化解读辅助工具，用于提高政策研读效率与一致性，不替代合规审查与正式授信审批；
            政策适用性、效力范围与执行口径请以发布机关正式文件及行内制度为准。
          </p>
        </div>
      </div>
    </div>
  );
}

function PolicySourceRows({ group }) {
  return (
    <>
      <tr className="policy-source-group-row">
        <td colSpan={3}>
          <b>{group.group}</b>
        </td>
      </tr>
      {group.items.map((item) => {
        const meta = POLICY_SOURCE_META[item.source];
        if (!meta) return null;
        return (
          <tr key={item.field}>
            <td className="policy-cell-text">{item.field}</td>
            <td>
              <span className={`policy-source-kind kind-${meta.kind}`}>{meta.badge}</span>
            </td>
            <td className="policy-cell-text">{policySourceRowNote(meta)}</td>
          </tr>
        );
      })}
    </>
  );
}
