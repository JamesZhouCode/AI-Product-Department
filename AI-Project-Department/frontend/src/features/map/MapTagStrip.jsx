import { MAP_TAG_STRIP_DEFINITIONS } from './mapTags';
import './MapTagStrip.css';

export default function MapTagStrip({ activeTag = [], onChange, hasSelectedEntity = false }) {
  return (
    <div
      className={`map-tag-strip ${hasSelectedEntity ? 'has-selected-entity' : ''}`}
      role="toolbar"
      aria-label={
        activeTag.length
          ? `深圳分行企业标签序列，已选 ${activeTag.length} 项`
          : '深圳分行企业标签序列'
      }
    >
      {MAP_TAG_STRIP_DEFINITIONS.map((tag) => {
        const available = Boolean(tag.matcher || tag.sourceTags?.length);
        const active = activeTag.includes(tag.id);
        return (
          <button
            type="button"
            key={tag.id}
            className={`map-tag-pill ${active ? 'active' : ''} ${available ? 'available' : 'reserved'}`}
            aria-pressed={active}
            disabled={!available}
            title={available ? `按“${tag.label}”筛选` : '当前调研数据暂未提供此标签字段'}
            onClick={() => onChange(tag.id)}
          >
            <span>{tag.label}</span>
          </button>
        );
      })}
    </div>
  );
}
