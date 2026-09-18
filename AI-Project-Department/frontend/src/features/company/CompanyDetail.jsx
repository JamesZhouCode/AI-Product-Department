import { useEffect, useState } from 'react';
import { chainColorFor, chainLabelFor } from '../../chainPalette';
import { relationDirection, relationPeer } from '../map/mapFeatures';
import { isListedCompany, tagLabelFor } from '../map/mapTags';
import { BANK_RELATION_OPTIONS } from './bankRelations';
import CompanyTagEditor from './CompanyTagEditor';
import { visitPriorityFor } from './visitPriority';
import { formatMarketingTime, normalize } from '../../shared/text';
import './CompanyDetail.css';

function EmptyDetail({ total }) {
  return (
    <div className="empty-detail">
      <div className="empty-orbit">◎</div>
      <h3>未选择企业</h3>
      <p>点击地图点位或企业关系，查看企业详情与上下游。</p>
      <div className="detail-hint">
        <span>{total}</span> 家企业已进入图谱数据层
      </div>
    </div>
  );
}

function MarketingLogPanel({ entity, records = [], onAdd, onDelete }) {
  const [draft, setDraft] = useState('');

  useEffect(() => setDraft(''), [entity?.name]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || !entity?.name) return;
    onAdd?.(entity.name, value);
    setDraft('');
  };

  return (
    <section className="marketing-log detail-section">
      <div className="section-title">
        <span>营销记录</span>
        <em>{records.length} 条 · 自动保存</em>
      </div>
      <form className="marketing-log-form" onSubmit={handleSubmit}>
        <textarea
          className="marketing-log-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="记录本次营销进展、沟通内容或下一步动作"
          aria-label="输入营销记录"
        />
        <div className="marketing-log-actions">
          <small>仅保存在当前浏览器</small>
          <button type="submit" disabled={!draft.trim()}>
            保存记录
          </button>
        </div>
      </form>
      {records.length ? (
        <div className="marketing-log-list">
          {records.map((record) => (
            <article className="marketing-log-item" key={record.id}>
              <div className="marketing-log-item-head">
                <time dateTime={record.createdAt}>{formatMarketingTime(record.createdAt)}</time>
                <button
                  type="button"
                  aria-label={`删除 ${formatMarketingTime(record.createdAt)} 的营销记录`}
                  onClick={() => onDelete?.(entity.name, record.id)}
                >
                  删除
                </button>
              </div>
              <p>{record.text}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="marketing-log-empty">还没有营销记录，保存后会在这里持续保留。</p>
      )}
    </section>
  );
}

function VisitPriorityCard({ entity }) {
  const priority = visitPriorityFor(entity);
  return (
    <section
      className={`visit-priority-card priority-${priority.level.tone}`}
      aria-label="企业拜访优先级"
    >
      <div className="visit-priority-head">
        <div className="visit-priority-heading">
          <span className="eyebrow">VISIT PRIORITY</span>
          <strong>企业拜访优先级</strong>
        </div>
        <div className="visit-priority-score">
          <b className="visit-priority-score-value">{priority.total}</b>
          <span>/ 100</span>
        </div>
      </div>
      <div
        className="visit-priority-meter"
        role="meter"
        aria-label="拜访优先级评分"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={priority.total}
      >
        <span style={{ width: `${priority.total}%` }} />
      </div>
      <div className="visit-priority-summary">
        <b>{priority.level.label}</b>
        <span>评分雏形 · 不含距离</span>
      </div>
      <div className="visit-priority-factors">
        <div>
          <span>企业重要度</span>
          <strong>{priority.importance.score}</strong>
          <small>{priority.importance.label}</small>
        </div>
        <div>
          <span>他行存量客户</span>
          <strong>{priority.otherBank.score}</strong>
          <small>{priority.otherBank.label}</small>
        </div>
      </div>
      <p className="visit-priority-note">重要度 65% · 他行存量 35%</p>
    </section>
  );
}

export default function CompanyDetail({
  entity,
  relationList,
  mappedNames,
  bankRelation,
  marketingRecords,
  onBankRelationChange,
  onAddMarketingRecord,
  onDeleteMarketingRecord,
  onSelectRelation,
  onTagsChange,
  total,
}) {
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  useEffect(() => setTagEditorOpen(false), [entity?.name]);
  if (!entity) return <EmptyDetail total={total} />;
  const locationVerified =
    entity.locationStatus === '已复核' || entity.locationStatus === 'verified';
  const regionalReference = entity.locationStatus === '区域参考';
  const entityTags = Array.isArray(entity.tags) ? entity.tags : [];
  const relationGroups = Array.from(
    relationList
      .reduce((groups, relation) => {
        const peer = relationPeer(relation, entity.name);
        const key = normalize(peer);
        if (!groups.has(key)) groups.set(key, { peer, relations: [] });
        groups.get(key).relations.push(relation);
        return groups;
      }, new Map())
      .values(),
  );
  return (
    <div className="detail-content">
      <div className="detail-kicker">
        企业档案 · {isListedCompany(entity) ? '上市企业' : '非上市企业'}
      </div>
      <h2>{entity.name}</h2>
      <div
        className="detail-sector"
        style={{
          '--chain-color': chainColorFor(entity.chain, entity.primaryIndustry),
        }}
      >
        <span className="detail-sector-chain">
          {chainLabelFor(entity.chain, entity.primaryIndustry)}
        </span>
        <span className="detail-sector-divider">/</span>
        <span className="detail-sector-sector" data-empty={entity.sector ? 'false' : 'true'}>
          {entity.sector || '细分环节待补齐'}
        </span>
      </div>
      <div className="tag-editor-shell">
        <div className="tag-row">
          {entityTags.length ? (
            entityTags.map((tag) => (
              <span className="tag" key={tag}>
                {tagLabelFor(tag)}
              </span>
            ))
          ) : (
            <span className="tag empty">暂无标签</span>
          )}
          <button
            type="button"
            className="tag-edit-button"
            aria-expanded={tagEditorOpen}
            onClick={() => setTagEditorOpen((open) => !open)}
          >
            {tagEditorOpen ? '收起' : '编辑标签'}
          </button>
        </div>
        {tagEditorOpen && (
          <CompanyTagEditor
            tags={entityTags}
            onSave={(nextTags) => {
              onTagsChange?.(entity.id, nextTags);
              setTagEditorOpen(false);
            }}
            onCancel={() => setTagEditorOpen(false)}
          />
        )}
      </div>
      <VisitPriorityCard entity={entity} />
      {!locationVerified && (
        <div
          className="detail-location-note"
          title={entity.locationSource || '位置来源待补充'}
          aria-label="企业位置提示"
        >
          位置：
          {!entity.location
            ? '暂无坐标'
            : regionalReference
              ? '区域参考'
              : entity.locationStatus === '候选'
                ? '候选点位'
                : '待复核'}
        </div>
      )}
      <div className="kv-grid">
        <div>
          <span>地址</span>
          <b>{entity.address || '待补充'}</b>
        </div>
        <div>
          <span>行政区划</span>
          <b>
            {[
              entity.region?.province,
              entity.region?.city,
              entity.region?.district,
              entity.region?.street,
            ]
              .filter(Boolean)
              .join(' · ') || '待补充'}
          </b>
        </div>
        <div>
          <span>核心技术</span>
          <b>{entity.coreTechnology || '待补充'}</b>
        </div>
        <div>
          <span>主要采购品</span>
          <b>{entity.procurement || '待补充'}</b>
        </div>
        <div>
          <span>主要产品</span>
          <b>{entity.products || '待补充'}</b>
        </div>
        <div className="bank-relation-field">
          <span>我行关系</span>
          <select
            className="bank-relation-select"
            value={bankRelation}
            onChange={(event) => onBankRelationChange?.(event.target.value)}
            aria-label="选择我行关系"
          >
            {BANK_RELATION_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <MarketingLogPanel
        entity={entity}
        records={marketingRecords}
        onAdd={onAddMarketingRecord}
        onDelete={onDeleteMarketingRecord}
      />
      <div className="detail-section">
        <div className="section-title">
          <span>链上关系</span>
          <em>
            {relationGroups.length} 家 · {relationList.length} 条关系
          </em>
        </div>
        {relationGroups.length ? (
          <div className="relation-list">
            {relationGroups.map((group) => {
              const types = Array.from(
                new Set(group.relations.map((relation) => relation.relationType)),
              );
              const depths = Array.from(
                new Set(group.relations.map((relation) => relation.depth)),
              ).sort((a, b) => a - b);
              const directionText = group.relations
                .map((relation) => {
                  const direction = relationDirection(relation);
                  return `${direction.label}：${direction.from} → ${direction.to}`;
                })
                .join('；');
              const sourceText = Array.from(
                new Set(group.relations.map((relation) => relation.source || '来源待补')),
              ).join('、');
              const mapStatus = mappedNames.has(normalize(group.peer)) ? '地图已定位' : '位置待补';
              return (
                <button
                  className="relation-row"
                  key={normalize(group.peer)}
                  onClick={() => onSelectRelation(group.peer)}
                  title={`${directionText} · ${sourceText}`}
                  aria-label={`${types.join('、')} ${group.peer} 第 ${depths.join('/')} 层`}
                >
                  <span className="relation-kinds">
                    {types.map((type) => (
                      <i className={`relation-kind ${type}`} key={type}>
                        {type}
                      </i>
                    ))}
                  </span>
                  <span className="relation-body">
                    <b>{group.peer}</b>
                    <small>
                      {types.join(' / ')} · {group.relations.length} 条关系 · 第 {depths.join('/')}{' '}
                      层 · {mapStatus} · {sourceText}
                    </small>
                  </span>
                  <span className="arrow">↗</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="muted">暂无链上关系</div>
        )}
      </div>
      <div className="detail-section">
        <div className="section-title">
          <span>数据证据</span>
          <em>{entity.evidence?.length || 0} 项</em>
        </div>
        <div className="evidence-list">
          {(entity.evidence || []).slice(0, 5).map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
          {!entity.evidence?.length && <span className="muted">待补来源</span>}
        </div>
      </div>
    </div>
  );
}
