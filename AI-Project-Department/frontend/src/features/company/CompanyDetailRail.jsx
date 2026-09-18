import CompanyDetail from './CompanyDetail';
import './CompanyDetailRail.css';

export default function CompanyDetailRail({
  entity,
  detailProps = {},
  loading = false,
  onClearSelection,
  className = '',
}) {
  if (!entity) return null;

  const railClassName = ['company-detail-rail', className].filter(Boolean).join(' ');

  return (
    <aside
      className={railClassName}
      role="dialog"
      aria-modal="false"
      aria-label={`${entity.name}详情`}
    >
      <div className="detail-header">
        <span className="eyebrow">ENTITY / 企业</span>
        <button
          type="button"
          className="close-detail"
          aria-label="清除企业选择"
          title="清除企业选择"
          onClick={onClearSelection}
        >
          清除
        </button>
      </div>
      {loading ? (
        <div className="loading-state">正在加载调研数据…</div>
      ) : (
        <div className="company-detail-rail-scroll">
          <CompanyDetail {...detailProps} entity={entity} />
        </div>
      )}
    </aside>
  );
}
