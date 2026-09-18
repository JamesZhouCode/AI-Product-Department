import { useEffect, useState } from 'react';
import { MAP_TAG_DEFINITIONS, stripSystemTags, tagValueFor } from '../map/mapTags';

function uniqueTags(tags) {
  return stripSystemTags(tags).filter(Boolean);
}

export default function CompanyTagEditor({ tags, onSave, onCancel }) {
  const [draftTags, setDraftTags] = useState(() => uniqueTags(tags));

  useEffect(() => {
    setDraftTags(uniqueTags(tags));
  }, [tags]);

  const toggleTag = (definition) => {
    const value = tagValueFor(definition);
    setDraftTags((current) =>
      current.includes(value) ? current.filter((tag) => tag !== value) : [...current, value],
    );
  };

  return (
    <div className="tag-editor" role="group" aria-label="编辑企业标签">
      <div className="tag-editor-head">
        <span>企业标签</span>
        <small>{draftTags.length ? '可多选' : '至少保留一个'}</small>
      </div>
      <div className="tag-editor-options">
        {MAP_TAG_DEFINITIONS.map((definition) => {
          const value = tagValueFor(definition);
          const selected = draftTags.includes(value);
          return (
            <button
              type="button"
              key={definition.id}
              className={`tag-editor-option ${selected ? 'selected' : ''}`}
              aria-pressed={selected}
              onClick={() => toggleTag(definition)}
            >
              {definition.label}
            </button>
          );
        })}
      </div>
      <div className="tag-editor-actions">
        <button type="button" className="tag-editor-cancel" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="tag-editor-save"
          disabled={!draftTags.length}
          onClick={() => onSave?.(draftTags)}
        >
          保存标签
        </button>
      </div>
    </div>
  );
}
