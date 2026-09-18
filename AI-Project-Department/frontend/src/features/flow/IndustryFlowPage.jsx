import { useEffect, useMemo, useState } from 'react';
import { CHAIN_COLOR_POOL } from '../../chainPalette';
import { normalize } from '../../shared/text';
import CompanyDetailRail from '../company/CompanyDetailRail';
import './flow.css';

// 「产业链流程」页：把一套业务方法论拆成可逐步查看的 4 步，
// 顶部一条步骤进度条控制下方画布的内容。
//
// 布局对齐「图谱」页：7 个一级环节等宽并排成一排（顺序取自附件 Sheet1），
// 每张卡片内部竖向列出该环节下的二级环节、头部标签与入链企业。
//
// 画布高度受限（flex:1 + min-height:0），滚动发生在画布内部，
// 纵横两个方向都可滚动，这样卡片再长也能滑动查看。
//
// step1 形成环节骨架 → step2 上市企业入链 → step3 头部企业打标 → step4 关键关系展示

const GRADE_META = {
  核心主业: { tone: 'core-main', short: '核心主业' },
  核心: { tone: 'core', short: '核心' },
  相关重要: { tone: 'important', short: '相关重要' },
  边缘观察: { tone: 'edge', short: '边缘观察' },
  关联: { tone: 'related', short: '关联' },
};

const TIER_META = {
  leader: { tone: 'leader', short: '龙头', order: 0 },
  core: { tone: 'core', short: '骨干', order: 1 },
  tail: { tone: 'tail', short: '长尾', order: 2 },
};

// 每个二级环节默认展示的企业数上限，避免卡片过长
const MAX_CHIPS = 12;

// step3 的档位筛选：带档位圆点与企业数
const TIER_FILTERS = [
  { key: 'all', label: '全部企业', tone: 'all', count: (c) => c.total },
  { key: 'head', label: '龙头 + 骨干', tone: 'head', count: (c) => c.leader + c.core },
  { key: 'leader', label: '仅龙头', tone: 'leader', count: (c) => c.leader },
];

function gradeMeta(grade) {
  return GRADE_META[grade] || { tone: 'other', short: grade || '未分档' };
}

function tierMeta(tier) {
  return TIER_META[tier] || TIER_META.tail;
}

function tierMatches(filter, tier) {
  if (filter === 'leader') return tier === 'leader';
  if (filter === 'head') return tier === 'leader' || tier === 'core';
  return true;
}

/* ---------------- 步骤进度条 ---------------- */

function StepBar({ steps, activeIndex, onSelect }) {
  return (
    <nav className="flow-steps" aria-label="流程步骤">
      {steps.map((step, index) => {
        const state =
          index === activeIndex ? 'is-active' : index < activeIndex ? 'is-done' : 'is-todo';
        return (
          <div className={`flow-step-slot ${state}`} key={step.id}>
            <button
              type="button"
              className="flow-step-button"
              aria-current={index === activeIndex ? 'step' : undefined}
              onClick={() => onSelect(index)}
            >
              <span className="flow-step-no">
                <i>{String(index + 1).padStart(2, '0')}</i>
                {step.status === 'pending' && <em>待补</em>}
              </span>
              <span className="flow-step-text">
                <b>{step.title}</b>
                <small>{step.note}</small>
              </span>
            </button>
            {index < steps.length - 1 && <span className="flow-step-link" aria-hidden="true" />}
          </div>
        );
      })}
    </nav>
  );
}

/* ---------------- 可点击的企业标签 ---------------- */

function CompanyChip({ name, tone, tier, title, entity, onOpen, score, gated = false }) {
  // tone 用于 step2 的「储能相关度」配色，tier 用于 step1/3/4 的「龙头/骨干/长尾」配色。
  // 两者 class 前缀不同（tone-* / tier-*），不要混用：tone-core 与 tier-core 含义不同。
  // gated = 被壁垒门槛降档（总分够龙头但壁垒分不足），单独加标记以便一眼看出。
  const className = [
    'flow-chip',
    tone ? `tone-${tone}` : '',
    tier ? `tier-${tier}` : '',
    gated ? 'is-moat-gated' : '',
    !tone && !tier ? 'is-plain' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const badge = score === undefined || score === null ? null : <em>{score.toFixed(0)}</em>;
  if (!entity) {
    // 企业表里查不到的对象（理论上不该出现）降级为纯文本，避免点了没反应
    return (
      <span className={className} title={title}>
        {name}
        {badge}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`${className} is-clickable`}
      title={title || `查看 ${name} 详情`}
      onClick={() => onOpen(entity)}
    >
      {name}
      {badge}
    </button>
  );
}

/* ---------------- 上/中/下游 位置带 ---------------- */

function PositionRow({ positions, columnCount }) {
  return (
    <div
      className="flow-position-row"
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
    >
      {positions.map((position) => (
        <div
          className={`flow-position-band is-${position.id}`}
          key={position.id}
          style={{ gridColumn: `span ${position.level1Count}` }}
        >
          <b>{position.label}</b>
          <small>
            {position.level1Count} 个一级环节 · {position.level2Count} 个二级环节 ·{' '}
            {position.companyCount} 家企业
          </small>
        </div>
      ))}
    </div>
  );
}

/* ---------------- 一级环节卡片 ---------------- */

function LevelCard({ level, color, children }) {
  return (
    <article className="flow-stage-card" style={{ '--stage-color': color }}>
      <header className="flow-stage-head">
        <span className="flow-stage-number">{level.code}</span>
        <div className="flow-stage-title">
          <small>
            {level.position} · {level.note}
          </small>
          <h3>{level.label}</h3>
        </div>
        <div className="flow-stage-total">
          <b>{level.companyCount}</b>
          <span>家</span>
        </div>
      </header>
      <div className="flow-stage-meta">
        <span>{level.childCount} 个二级环节</span>
        {level.companyRowCount > level.companyCount && (
          <span
            className="flow-stage-meta-hint"
            title={`同一家企业可归属多个二级环节，故各环节家数之和（${level.companyRowCount}）大于本环节去重企业数（${level.companyCount}）`}
          >
            {level.companyRowCount - level.companyCount} 家跨多环节
          </span>
        )}
      </div>
      {children}
    </article>
  );
}

function SkeletonCard({ level, color, expanded, onToggle, entityByName, onOpen }) {
  return (
    <LevelCard level={level} color={color}>
      <div className="flow-stage-node-list">
        {level.children.map((child) => (
          <div className="flow-stage-node-wrap" key={child.nodeKey}>
            <button
              type="button"
              className="flow-stage-node"
              aria-expanded={expanded === child.nodeKey}
              onClick={() => onToggle(child.nodeKey)}
            >
              <span className="flow-stage-node-label">{child.label}</span>
              <span className="flow-stage-node-count">
                <b>{child.companyCount}</b>
                <small>家</small>
              </span>
            </button>
            {expanded === child.nodeKey && child.companies.length > 0 && (
              <div className="flow-chip-list is-subtle">
                {child.companies.map((company) => (
                  <CompanyChip
                    key={`${child.nodeKey}-${company.name}`}
                    name={company.name}
                    title={`${company.name}（${company.code}）· 点击查看详情`}
                    entity={entityByName.get(normalize(company.name))}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </LevelCard>
  );
}

function CompaniesCard({ level, color, showCompanies, expanded, onToggle, entityByName, onOpen }) {
  return (
    <LevelCard level={level} color={color}>
      <div className="flow-stage-node-list">
        {level.children.map((child) => {
          const isOpen = expanded === child.nodeKey;
          const visible = isOpen ? child.companies : child.companies.slice(0, MAX_CHIPS);
          const hidden = child.companies.length - visible.length;
          return (
            <div className="flow-stage-block" key={child.nodeKey}>
              <button
                type="button"
                className="flow-stage-block-head"
                aria-expanded={isOpen}
                onClick={() => onToggle(child.nodeKey)}
              >
                <b>{child.label}</b>
                <span className="flow-stage-node-count">
                  <b>{child.companyCount}</b>
                  <small>家</small>
                </span>
              </button>
              {showCompanies && child.companies.length > 0 && (
                <div className="flow-chip-list">
                  {visible.map((company) => (
                    <CompanyChip
                      key={`${child.nodeKey}-${company.name}`}
                      name={company.name}
                      tone={gradeMeta(company.grade).tone}
                      title={`${company.name}（${company.code}）· ${gradeMeta(company.grade).short} · ${company.products} · 点击查看详情`}
                      entity={entityByName.get(normalize(company.name))}
                      onOpen={onOpen}
                    />
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      className="flow-chip is-more"
                      onClick={() => onToggle(child.nodeKey)}
                    >
                      +{hidden}
                    </button>
                  )}
                  {isOpen && child.companies.length > MAX_CHIPS && (
                    <button
                      type="button"
                      className="flow-chip is-more"
                      onClick={() => onToggle(child.nodeKey)}
                    >
                      收起
                    </button>
                  )}
                </div>
              )}
              {showCompanies && child.companies.length === 0 && (
                <p className="flow-stage-empty">暂无上市企业入库</p>
              )}
            </div>
          );
        })}
      </div>
    </LevelCard>
  );
}

// 单个维度行：名称 + 权重滑块 + 数值 + 删减按钮
function DimensionRow({ dim, value, onChange, onRemove, canRemove }) {
  return (
    <div className={`flow-dim is-${dim.kind}`}>
      <span className="flow-dim-name" title={dim.note || dim.label}>
        <i aria-hidden="true" />
        {dim.label}
      </span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={value}
        aria-label={`${dim.label}权重`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        className="flow-weight-number"
        type="number"
        min="0"
        max="100"
        value={value}
        aria-label={`${dim.label}权重数值`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <button
        type="button"
        className="flow-dim-action is-remove"
        title={canRemove ? `删减维度「${dim.label}」` : '至少保留一个维度'}
        aria-label={`删减维度 ${dim.label}`}
        disabled={!canRemove}
        onClick={onRemove}
      >
        −
      </button>
    </div>
  );
}

/* ---------------- 步骤三：评估配置（维度增删 + 权重 + 壁垒门槛） ---------------- */

function EvalConfig({
  rule,
  weights,
  enabled,
  thresholds,
  moatGate,
  onWeight,
  onThreshold,
  onMoatGate,
  onAddDimension,
  onRemoveDimension,
  onReset,
  isDefault,
  counts,
  moatStats,
}) {
  const dims = rule.dimensions || [];
  const groups = rule.dimensionGroups || [];
  const activeDims = dims.filter((dim) => enabled.includes(dim.key));
  const idleDims = dims.filter((dim) => !enabled.includes(dim.key));
  const weightSum = activeDims.reduce((sum, dim) => sum + (weights[dim.key] ?? dim.weight), 0);
  const zeroWeight = activeDims.filter((dim) => (weights[dim.key] ?? dim.weight) <= 0).length;
  // 删到只剩一个维度就没得比了，且会出现「单维度总分」这种失真结果
  const canRemove = activeDims.length > 1;

  return (
    <section className="flow-config" aria-label="评估配置">
      <header className="flow-config-head">
        <div className="flow-config-copy">
          <span className="flow-rel-eyebrow">评估配置</span>
          <p className="flow-config-note">
            维度可<b>新增 / 删减</b>
            ，权重与分档阈值均可调；改动后卡片标签上的得分与分档结果实时重算。
          </p>
          {rule.scoreSource?.simulated && (
            <p className="flow-config-sim">
              当前各维度分为<b>占位数据</b>（按上游已知档位反推，默认配置下与上游名单 100%
              一致）；接入真实评分表后替换数据即可，评估逻辑不变。
            </p>
          )}
        </div>
        <button type="button" className="flow-config-reset" disabled={isDefault} onClick={onReset}>
          恢复默认
        </button>
      </header>

      <div className="flow-config-grid">
        <div className="flow-config-col">
          <span className="flow-config-label">
            维度与权重
            <em className={weightSum === 100 ? 'is-ok' : ''}>
              合计 {weightSum}
              {weightSum === 100 ? '' : '（按合计归一计算）'}
            </em>
          </span>

          {groups.map((group) => {
            const groupDims = activeDims.filter((dim) => dim.kind === group.key);
            if (!groupDims.length) return null;
            return (
              <div className={`flow-dim-group is-${group.key}`} key={group.key}>
                <span className="flow-dim-group-head">
                  <b>{group.label}</b>
                  <small>{group.note}</small>
                </span>
                {groupDims.map((dim) => (
                  <DimensionRow
                    key={dim.key}
                    dim={dim}
                    value={weights[dim.key] ?? dim.weight}
                    canRemove={canRemove}
                    onChange={(value) => onWeight(dim.key, value)}
                    onRemove={() => onRemoveDimension(dim.key)}
                  />
                ))}
              </div>
            );
          })}

          <div className="flow-dim-add">
            <span className="flow-dim-add-label">
              新增维度
              <em>{idleDims.length ? `${idleDims.length} 个可选` : '维度池已全部启用'}</em>
            </span>
            <div className="flow-dim-add-list">
              {idleDims.map((dim) => (
                <button
                  type="button"
                  key={dim.key}
                  className={`flow-dim-action is-add is-${dim.kind}`}
                  title={`${dim.note || dim.label}（点击加入评估）`}
                  onClick={() => onAddDimension(dim.key)}
                >
                  <i aria-hidden="true">＋</i>
                  {dim.label}
                </button>
              ))}
            </div>
          </div>

          {zeroWeight > 0 && (
            <p className="flow-config-warn">
              有 {zeroWeight} 个已启用维度的权重为 0，暂不参与加权，不会影响结果。
            </p>
          )}
        </div>

        <div className="flow-config-col is-narrow">
          <span className="flow-config-label">
            分档阈值
            <em>按加权总分</em>
          </span>
          <label className="flow-threshold tone-leader">
            <span>龙头</span>
            <em>≥</em>
            <input
              type="number"
              min="0"
              max="100"
              value={thresholds.leader}
              onChange={(event) => onThreshold('leader', Number(event.target.value))}
            />
          </label>
          <label className="flow-threshold tone-core">
            <span>骨干</span>
            <em>≥</em>
            <input
              type="number"
              min="0"
              max="100"
              value={thresholds.core}
              onChange={(event) => onThreshold('core', Number(event.target.value))}
            />
          </label>
          <p className="flow-config-hint">低于骨干阈值即为长尾。</p>

          <span className="flow-config-label is-sub">
            壁垒门槛
            {moatStats.moatDims === 0 && <em className="is-off">未启用壁垒维度</em>}
          </span>
          <label className={`flow-moat-gate ${moatGate.enabled ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={moatGate.enabled}
              aria-label="启用壁垒分门槛"
              onChange={(event) => onMoatGate({ enabled: event.target.checked })}
            />
            <span>壁垒分需</span>
            <em>≥</em>
            <input
              type="number"
              min="0"
              max="100"
              value={moatGate.min}
              disabled={!moatGate.enabled}
              aria-label="壁垒分门槛值"
              onChange={(event) => onMoatGate({ min: Number(event.target.value) })}
            />
          </label>
          <p className="flow-config-hint">{rule.moatGate?.desc}</p>
        </div>

        <div className="flow-config-col is-narrow">
          <span className="flow-config-label">
            评估结果
            <em>{counts.total} 家</em>
          </span>
          <div className="flow-config-result">
            <span className="tone-leader">
              <i />
              龙头
              <b>{counts.leader}</b>
            </span>
            <span className="tone-core">
              <i />
              骨干
              <b>{counts.core}</b>
            </span>
            <span className="tone-tail">
              <i />
              长尾
              <b>{counts.tail}</b>
            </span>
          </div>
          <p className={`flow-config-diff ${counts.changed ? 'is-changed' : ''}`}>
            {counts.changed
              ? `与上游名单相比有 ${counts.changed} 家档位变化`
              : `与上游名单完全一致（${counts.total} 家）`}
          </p>
          {counts.moatDemoted > 0 && (
            <p className="flow-config-warn">
              其中 {counts.moatDemoted} 家总分达标但壁垒分不足，被壁垒门槛降档。
            </p>
          )}
          {counts.changedList.length > 0 && (
            <p className="flow-config-changed" title={counts.changedList.join('、')}>
              变化示例：{counts.changedList.slice(0, 5).join('、')}
              {counts.changedList.length > 5 ? ' …' : ''}
            </p>
          )}

          <span className="flow-config-label is-sub">
            壁垒分
            <em>{moatStats.moatDims ? `${moatStats.moatDims} 个壁垒维度` : '未配置'}</em>
          </span>
          <div className="flow-moat-stats">
            <span>
              龙头均分
              <b>{moatStats.leaderAvg === null ? '—' : moatStats.leaderAvg}</b>
            </span>
            <span>
              全体中位
              <b>{moatStats.median === null ? '—' : moatStats.median}</b>
            </span>
            <span>
              高壁垒
              <b>{moatStats.highCount}</b>
              <small>≥{moatGate.min}</small>
            </span>
          </div>
          <p className="flow-config-hint">
            壁垒分 = 当前启用的壁垒维度按权重加权。它解释「为什么是龙头」——
            <b>份额领先 + 壁垒可守</b>。
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 步骤三：头部企业打标 ---------------- */

function RulePanel({ rule }) {
  const dims = (rule.dimensions || []).filter((dim) => dim.enabled !== false);
  const groups = rule.dimensionGroups || [];
  const moatGate = rule.moatGate;
  return (
    <section className="flow-rule" aria-label="分档规则">
      <div className="flow-rule-main">
        <span className="flow-rule-eyebrow">综合得分 {rule.scoreTotal}</span>
        <div className="flow-rule-weights">
          {groups.map((group) => {
            const groupDims = dims.filter((dim) => dim.kind === group.key);
            if (!groupDims.length) return null;
            return (
              <div className={`flow-rule-group is-${group.key}`} key={group.key}>
                <span className="flow-rule-group-head">{group.label}</span>
                <div className="flow-rule-group-bars">
                  {groupDims.map((item) => (
                    <div
                      className={`flow-rule-weight is-${group.key}`}
                      key={item.key}
                      style={{ flexGrow: item.weight }}
                      title={item.note || item.label}
                    >
                      <b>{item.weight}</b>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flow-rule-tiers">
        {rule.tiers.map((tier) => (
          <div className={`flow-rule-tier tone-${tier.key}`} key={tier.key}>
            <b>{tier.label}</b>
            <span>{tier.max === null ? `≥${tier.min}` : `${tier.min}–${tier.max}`}</span>
          </div>
        ))}
      </div>
      <div className="flow-rule-gates">
        <span className="flow-rule-gates-title">硬门槛（须全部满足）</span>
        <ol>
          {rule.hardGates.map((gate) => (
            <li key={gate}>{gate}</li>
          ))}
        </ol>
      </div>
      <div className="flow-rule-foot">
        <span>
          <b>评价口径</b>
          {rule.basis}
        </span>
        <span>
          <b>覆盖对象</b>
          {rule.coverage}
        </span>
        <span>
          <b>数据来源</b>
          {rule.sources.join(' · ')}
        </span>
        <span>
          <b>局限</b>
          {rule.limitations}
        </span>
        {moatGate && (
          <span className={moatGate.enabled ? 'flow-rule-moat is-on' : 'flow-rule-moat'}>
            <b>壁垒门槛</b>
            {moatGate.enabled
              ? `启用 · 壁垒分低于 ${moatGate.min} 的企业不得评为龙头`
              : `未启用 · 可在上方「评估配置」中开启（壁垒分 ≥${moatGate.min} 才可评龙头）`}
          </span>
        )}
        <span className="flow-rule-version">
          规则版本 {rule.version} · 维度池 / 权重 / 阈值 / 壁垒门槛集中在数据文件的 headRule
          配置中，可直接调整
        </span>
      </div>
    </section>
  );
}

function HeadsCard({
  level,
  color,
  tierFilter,
  expanded,
  onToggle,
  entityByName,
  onOpen,
  evaluation,
}) {
  // 档位、总分与壁垒分都由当前配置实时算出（evaluation: name -> { score, moat, tier, gated }）
  const tierOf = (company) => evaluation.get(company.name)?.tier || company.tier;
  const scoreOf = (company) => evaluation.get(company.name)?.score;
  // 标签提示统一拼「档位 + 总分 + 壁垒分」，并标出被壁垒门槛降档的企业
  const chipTitle = (company, extra = '') => {
    const result = evaluation.get(company.name);
    const tier = tierOf(company);
    const parts = [`${company.name}`, tierMeta(tier).short];
    if (result?.score !== undefined) parts.push(`${result.score.toFixed(1)} 分`);
    if (result?.moat !== null && result?.moat !== undefined) {
      parts.push(`壁垒 ${result.moat.toFixed(0)}`);
      if (result.gated) parts.push('⚠ 壁垒分不足已由龙头降为骨干');
    }
    if (extra) parts.push(extra);
    parts.push('点击查看详情');
    return parts.join(' · ');
  };
  const gatedOf = (company) => evaluation.get(company.name)?.gated === true;

  return (
    <LevelCard level={level} color={color}>
      <div className="flow-stage-node-list">
        {level.children.map((child) => {
          const isOpen = expanded === child.nodeKey;
          const counts = { leader: 0, core: 0, tail: 0 };
          child.companies.forEach((company) => {
            counts[tierOf(company)] += 1;
          });
          const memberNames = new Set(
            child.heads.flatMap((head) => head.members.map((member) => member.name)),
          );
          // 本二级环节内、未被该环节「细分环节」名单覆盖的企业（多为长尾，也可能是别处的头部）
          const rest = child.companies.filter((company) => !memberNames.has(company.name));
          const restVisible = rest.filter((company) => tierMatches(tierFilter, tierOf(company)));
          return (
            <div className="flow-stage-block" key={child.nodeKey}>
              <div className="flow-head-node">
                <b>{child.label}</b>
                <span className="flow-head-counts">
                  <i className="tone-leader">龙 {counts.leader}</i>
                  <i className="tone-core">骨 {counts.core}</i>
                  <i className="tone-tail">尾 {counts.tail}</i>
                </span>
              </div>

              {child.heads.map((head) => {
                // 分组本身来自上游名单，但显示哪个档位由当前配置决定
                const members = head.members.filter((member) => {
                  const company = child.companies.find((c) => c.name === member.name);
                  return company && tierMatches(tierFilter, tierOf(company));
                });
                if (!members.length) return null;
                return (
                  <div className="flow-head-segment" key={`${child.nodeKey}-${head.segment}`}>
                    <span className="flow-head-segment-label">{head.segment}</span>
                    <div className="flow-chip-list is-tight">
                      {members.map((member) => {
                        const company = child.companies.find((c) => c.name === member.name);
                        const tier = tierOf(company);
                        const score = scoreOf(company);
                        return (
                          <CompanyChip
                            key={`${child.nodeKey}-${head.segment}-${member.name}`}
                            name={member.name}
                            tier={tierMeta(tier).tone}
                            score={score}
                            gated={gatedOf(company)}
                            title={chipTitle(company, `细分环节：${head.segment}`)}
                            entity={entityByName.get(normalize(member.name))}
                            onOpen={onOpen}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {restVisible.length > 0 && (
                <div className="flow-head-segment is-rest">
                  <button
                    type="button"
                    className="flow-head-segment-label is-action"
                    aria-expanded={isOpen}
                    onClick={() => onToggle(child.nodeKey)}
                  >
                    {child.heads.length ? '其余企业' : '本环节企业'} {restVisible.length}
                    {!isOpen && restVisible.length > MAX_CHIPS ? `（显示 ${MAX_CHIPS}）` : ''}
                  </button>
                  <div className="flow-chip-list is-tight">
                    {(isOpen ? restVisible : restVisible.slice(0, MAX_CHIPS)).map((company) => {
                      const tier = tierOf(company);
                      const score = scoreOf(company);
                      return (
                        <CompanyChip
                          key={`${child.nodeKey}-rest-${company.name}`}
                          name={company.name}
                          tier={tierMeta(tier).tone}
                          score={score}
                          gated={gatedOf(company)}
                          title={chipTitle(company)}
                          entity={entityByName.get(normalize(company.name))}
                          onOpen={onOpen}
                        />
                      );
                    })}
                    {!isOpen && restVisible.length > MAX_CHIPS && (
                      <button
                        type="button"
                        className="flow-chip is-more"
                        onClick={() => onToggle(child.nodeKey)}
                      >
                        +{restVisible.length - MAX_CHIPS}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {child.companyCount === 0 && <p className="flow-stage-empty">暂无上市企业入库</p>}
            </div>
          );
        })}
      </div>
    </LevelCard>
  );
}

/* ---------------- 步骤四：关键关系展示 ---------------- */

const COVERAGE_META = {
  equity: { tone: 'equity', label: '股权穿透' },
  key_persons: { tone: 'people', label: '关键人' },
  supply_chain: { tone: 'supply', label: '供销关系' },
  preferences: { tone: 'pref', label: '关键人偏好' },
};

function RelationsPanel({ step, hubs }) {
  const maxHub = hubs.length ? hubs[0].count : 1;
  return (
    <section className="flow-rel-panel" aria-label="关系档案覆盖与链内关系">
      <div className="flow-rel-block">
        <span className="flow-rel-eyebrow">链内关系识别结果</span>
        <div className="flow-rel-metrics">
          <div>
            <b>{step.stats.total}</b>
            <span>条关系</span>
          </div>
          <div>
            <b>{step.stats.supply}</b>
            <span>供销</span>
          </div>
          <div>
            <b>{step.stats.equity}</b>
            <span>股权</span>
          </div>
          <div>
            <b>{step.stats.companies}</b>
            <span>覆盖企业</span>
          </div>
        </div>
        <p className="flow-rel-hint">
          依据关系档案里「前五大客户 / 供应商」的具名披露与「股权穿透」，只保留两端都在本链 237
          家之内的关系。
        </p>
      </div>

      <div className="flow-rel-block">
        <span className="flow-rel-eyebrow">关系档案覆盖（{step.stats.profiles} / 237 家）</span>
        <div className="flow-rel-coverage">
          {step.coverage.map((item) => {
            const total = item.full + item.partial + item.missing || 1;
            const meta = COVERAGE_META[item.key] || { tone: 'other', label: item.key };
            return (
              <div className={`flow-rel-cov tone-${meta.tone}`} key={item.key}>
                <div className="flow-rel-cov-head">
                  <b>{meta.label}</b>
                  <small>
                    完整 {item.full} · 部分 {item.partial}
                    {item.missing ? ` · 缺失 ${item.missing}` : ''}
                  </small>
                </div>
                <span className="flow-rel-cov-bar">
                  <i
                    className="is-full"
                    style={{ width: `${Math.round((item.full / total) * 100)}%` }}
                  />
                  <i
                    className="is-partial"
                    style={{ width: `${Math.round((item.partial / total) * 100)}%` }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flow-rel-block">
        <span className="flow-rel-eyebrow">链内关系最集中的企业</span>
        <ul className="flow-rel-hubs">
          {hubs.slice(0, 6).map((hub, index) => (
            <li key={hub.name}>
              <span className="flow-rel-hub-rank">{index + 1}</span>
              <span className="flow-rel-hub-name">{hub.name}</span>
              <span className="flow-rel-hub-bar">
                <i style={{ width: `${Math.round((hub.count / maxHub) * 100)}%` }} />
              </span>
              <b>{hub.count}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- 属地取值：兼容两种数据形态 ----------------
   storage-chain.json 的 companies[] 带 `territory`；
   companies-storage.json 的分片企业带 `region` + research.additionalFields.territory*。
   详情栏/侧栏可能拿到任一种，这里统一成一个结构，避免某条路径显示"待补充"。 */
function territoryOf(company) {
  if (!company) return {};
  if (company.territory?.province) return company.territory;
  const extra = company.research?.additionalFields || {};
  return {
    province: company.region?.province || extra.territoryProvince || '',
    city: company.region?.city || extra.territoryCity || '',
    district: company.region?.district || extra.territoryDistrict || '',
    street: company.region?.street || extra.territoryStreet || '',
    park: extra.territoryPark || '',
    address: extra.territoryAddress || company.address || '',
    note: extra.territoryNote || '',
  };
}

/* ---------------- 步骤二：入链企业属地分布 ---------------- */

function TerritoryPanel({ territory, customerTerritory, customerStats, placement, note }) {
  if (!territory || !territory.topProvinces?.length) return null;
  const maxProvince = territory.topProvinces[0].v || 1;
  const maxCity = territory.topCities[0]?.v || 1;
  const districtMissing = territory.total - territory.withDistrict;
  // 全量客户视图（237 上市 + 1740 非上市）：条形按上市 / 非上市堆叠
  const all = customerTerritory;
  const maxAllProvince = all ? Math.max(...all.topProvinces.map((p) => p.listed + p.other), 1) : 1;
  const maxAllCity = all ? Math.max(...all.topCities.map((p) => p.listed + p.other), 1) : 1;

  const StackBars = ({ items, max }) => (
    <ul>
      {items.map((item) => (
        <li key={item.k}>
          <span className="flow-terr-name">{item.k}</span>
          <span className="flow-terr-bar">
            <i
              className="is-listed"
              style={{ width: `${Math.round((item.listed / max) * 100)}%` }}
            />
            <i className="is-other" style={{ width: `${Math.round((item.other / max) * 100)}%` }} />
          </span>
          <b>{item.listed + item.other}</b>
        </li>
      ))}
    </ul>
  );

  const PlainBars = ({ items, max }) => (
    <ul>
      {items.map((item) => (
        <li key={item.k}>
          <span className="flow-terr-name">{item.k}</span>
          <span className="flow-terr-bar">
            <i style={{ width: `${Math.round((item.v / max) * 100)}%` }} />
          </span>
          <b>{item.v}</b>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="flow-terr-panel" aria-label="全量客户属地分布">
      <header className="flow-terr-head">
        <div className="flow-terr-copy">
          <span className="flow-rel-eyebrow">全量客户属地分布</span>
          <p className="flow-terr-note">{note}</p>
        </div>
        <div className="flow-terr-metrics">
          <div>
            <b>{all ? all.total : territory.total}</b>
            <span>全量客户</span>
          </div>
          <div className="is-listed">
            <b>{all ? all.listed : territory.total}</b>
            <span>上市</span>
          </div>
          <div className="is-other">
            <b>{all ? all.other : 0}</b>
            <span>非上市</span>
          </div>
          <div>
            <b>{all ? all.provinces : territory.provinces}</b>
            <span>省级行政区</span>
          </div>
          <div>
            <b>{all ? all.cities : territory.cities}</b>
            <span>地级市</span>
          </div>
        </div>
      </header>

      <div className="flow-terr-grid">
        <div className="flow-terr-block">
          <span className="flow-terr-sub">
            省级分布
            <em>
              Top {all ? all.topProvinces.length : territory.topProvinces.length} / 共{' '}
              {all ? all.provinces : territory.provinces} 个
            </em>
          </span>
          {all ? (
            <StackBars items={all.topProvinces} max={maxAllProvince} />
          ) : (
            <PlainBars items={territory.topProvinces} max={maxProvince} />
          )}
        </div>

        <div className="flow-terr-block">
          <span className="flow-terr-sub">
            城市分布
            <em>
              Top {all ? all.topCities.length : territory.topCities.length} / 共{' '}
              {all ? all.cities : territory.cities} 个
            </em>
          </span>
          {all ? (
            <StackBars items={all.topCities} max={maxAllCity} />
          ) : (
            <PlainBars items={territory.topCities} max={maxCity} />
          )}
        </div>
      </div>

      <div className="flow-terr-legend">
        <span>
          <i className="is-listed" />
          上市 {all ? all.listed : territory.total}
        </span>
        <span>
          <i className="is-other" />
          非上市 {all ? all.other : 0}
        </span>
        {placement && (
          <span className="flow-terr-placement">
            地图落点：真实坐标 <b>{placement.real}</b> · 区域参考（按属地城市）{' '}
            <b>{placement.regionRef}</b> · 未落图 <b>{placement.unplaced}</b>
          </span>
        )}
      </div>

      <footer className="flow-terr-foot">
        <span>
          上市客户属地解析完整度：省 / 市{' '}
          <b>
            {territory.total}/{territory.total}
          </b>{' '}
          · 区县 <b>{territory.withDistrict}</b>
          {districtMissing
            ? `（${districtMissing} 家为园区 / 道路型注册地，源地址未载区县）`
            : ''}{' '}
          · 街道 <b>{territory.withStreet}</b> · 园区 <b>{territory.withPark}</b>
        </span>
        {customerStats?.otherBySource?.length > 0 && (
          <span>
            非上市客户来源：
            {customerStats.otherBySource.map((x) => `${x.k} ${x.v}`).join(' · ')}；核验状态：
            {customerStats.otherByVerify.map((x) => `${x.k} ${x.v}`).join(' · ')}
          </span>
        )}
        {territory.offshoreList?.length > 0 && (
          <span className="flow-terr-offshore">
            离岸注册 {territory.offshore} 家：
            {territory.offshoreList.map((item) => `${item.name}（${item.province}）`).join('、')}
            ，境内另有运营主体
          </span>
        )}
      </footer>
    </section>
  );
}

/* ---------------- 步骤四：链外关键配套（口径补充） ---------------- */

const EXTERNAL_PREVIEW = 10;

function ExternalPanel({ mentions, verified, note }) {
  const [expanded, setExpanded] = useState(false);
  if (!mentions.length && !verified.length) return null;

  // 按主导方向分组：主要出现在「供应商栏」的算上游配套，否则算下游客户
  const upstream = mentions.filter(
    (item) => item.asUpstream > 0 && item.asUpstream >= item.asDownstream,
  );
  const downstream = mentions.filter((item) => item.asDownstream > item.asUpstream);
  const rest = mentions.filter((item) => !upstream.includes(item) && !downstream.includes(item));
  const groups = [
    { key: 'upstream', label: '上游配套（被列为供应商）', items: upstream, tone: 'up' },
    { key: 'downstream', label: '下游客户（被列为客户）', items: downstream, tone: 'down' },
    { key: 'both', label: '双向出现', items: rest, tone: 'other' },
  ].filter((group) => group.items.length);
  const totalMentions = mentions.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="flow-ext-panel" aria-label="链外关键配套">
      <header className="flow-ext-head">
        <div className="flow-ext-copy">
          <span className="flow-rel-eyebrow">链外关键配套 · 237 之外</span>
          <p className="flow-ext-note">{note}</p>
        </div>
        <div className="flow-ext-metrics">
          <div>
            <b>{mentions.length}</b>
            <span>链外主体</span>
          </div>
          <div>
            <b>{upstream.length}</b>
            <span>偏上游</span>
          </div>
          <div>
            <b>{downstream.length}</b>
            <span>偏下游</span>
          </div>
          <div className="is-muted">
            <b>{totalMentions}</b>
            <span>被点名次数</span>
          </div>
        </div>
      </header>

      {verified.length > 0 && (
        <div className="flow-ext-verified">
          <span className="flow-ext-sub">
            人工核实补充
            <em>抽取门槛会漏掉只被点名一次的主体，以下为回源核实后的补录</em>
          </span>
          <ul>
            {verified.map((item) => (
              <li key={item.name}>
                <div className="flow-ext-verified-head">
                  <b>{item.name}</b>
                  <span className={`flow-ext-side tone-${item.side === '上游' ? 'up' : 'down'}`}>
                    {item.side}
                  </span>
                  <span className="flow-ext-seg">{item.segment}</span>
                  <span className="flow-ext-listed">{item.listed ? '已上市' : '非上市'}</span>
                </div>
                <p>{item.note}</p>
                <small>
                  依据：{item.evidence}
                  {item.source ? ` · 来源：${item.source}` : ''}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flow-ext-groups">
        {groups.map((group) => {
          const shown = expanded ? group.items : group.items.slice(0, EXTERNAL_PREVIEW);
          return (
            <div className={`flow-ext-group tone-${group.tone}`} key={group.key}>
              <span className="flow-ext-sub">
                {group.label}
                <em>{group.items.length} 个</em>
              </span>
              <ul>
                {shown.map((item) => (
                  <li
                    key={item.name}
                    title={item.mentionedBy
                      .map((m) => `${m.company}（${m.role}）：${m.context}`)
                      .join('\n')}
                  >
                    <b>{item.name}</b>
                    <span className="flow-ext-count">{item.count}</span>
                    <small>
                      ←{' '}
                      {item.mentionedBy
                        .slice(0, 4)
                        .map((m) => m.company)
                        .join('、')}
                      {item.mentionedBy.length > 4 ? ' 等' : ''}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <footer className="flow-ext-foot">
        <span>
          被点名 <b>≥2 次</b> 自动入库；单次点名的走人工核实。悬停任一条可看原文语境。
        </span>
        <button
          type="button"
          className="flow-ext-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起' : `展开全部 ${mentions.length} 个`}
        </button>
      </footer>
    </section>
  );
}

function RelationsCard({ level, color, relationsByCompany, expanded, onToggle, onOpen }) {
  return (
    <LevelCard level={level} color={color}>
      <div className="flow-stage-node-list">
        {level.children.map((child) => {
          const isOpen = expanded === child.nodeKey;
          // 有链内关系的企业优先，其次按档位（龙头在前）
          const sorted = [...child.companies].sort(
            (a, b) =>
              tierMeta(a.tier).order - tierMeta(b.tier).order ||
              (b.relationCount || 0) - (a.relationCount || 0) ||
              a.name.localeCompare(b.name, 'zh'),
          );
          const visible = isOpen ? sorted : sorted.slice(0, MAX_CHIPS);
          const hidden = sorted.length - visible.length;
          return (
            <div className="flow-stage-block" key={child.nodeKey}>
              <button
                type="button"
                className="flow-stage-block-head"
                aria-expanded={isOpen}
                onClick={() => onToggle(child.nodeKey)}
              >
                <b>{child.label}</b>
                <span className="flow-stage-node-count">
                  <b>{child.companyCount}</b>
                  <small>家</small>
                </span>
              </button>
              {child.companies.length > 0 && (
                <div className="flow-chip-list">
                  {visible.map((company) => {
                    const degree = company.relationCount || 0;
                    const entity = relationsByCompany.entity(company.name);
                    return (
                      <button
                        type="button"
                        className={`flow-chip rel-chip tier-${tierMeta(company.tier).tone} ${
                          degree ? 'has-rel' : ''
                        }`}
                        key={`${child.nodeKey}-${company.name}`}
                        disabled={!entity}
                        title={
                          degree
                            ? `${company.name} · ${company.tierLabel} · 链内 ${degree} 条关系 · 点击查看关系档案`
                            : `${company.name} · ${company.tierLabel} · 暂无链内关系`
                        }
                        onClick={() => entity && onOpen(entity)}
                      >
                        {company.name}
                        {degree > 0 && <em>{degree}</em>}
                      </button>
                    );
                  })}
                  {hidden > 0 && (
                    <button
                      type="button"
                      className="flow-chip is-more"
                      onClick={() => onToggle(child.nodeKey)}
                    >
                      +{hidden}
                    </button>
                  )}
                  {isOpen && sorted.length > MAX_CHIPS && (
                    <button
                      type="button"
                      className="flow-chip is-more"
                      onClick={() => onToggle(child.nodeKey)}
                    >
                      收起
                    </button>
                  )}
                </div>
              )}
              {child.companyCount === 0 && <p className="flow-stage-empty">暂无上市企业入库</p>}
            </div>
          );
        })}
      </div>
    </LevelCard>
  );
}

function RelField({ label, value }) {
  if (!value) return null;
  return (
    <div className="flow-rel-field">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

function RelationRail({ company, edges, onClose, onOpen }) {
  const profile = company.profile || {};
  const completeness = profile.completeness || {};
  const out = edges.filter((rel) => rel.sourceFromProfile === company.name);
  const incoming = edges.filter((rel) => rel.sourceToProfile === company.name);

  return (
    <aside className="flow-rel-rail" role="dialog" aria-label={`${company.name}关系档案`}>
      <div className="flow-rel-rail-top">
        <div>
          <span className="eyebrow">RELATION / 关系档案</span>
          <small>
            {profile.nature || '企业性质待补'}
            {profile.isStateOwned ? ' · 国资控股' : ''}
          </small>
        </div>
        <button type="button" className="close-detail" onClick={onClose}>
          关闭
        </button>
      </div>

      <div className="flow-rel-rail-heading">
        <h2>{company.fullName || company.name}</h2>
        <p>
          {company.code} · {company.board} · {profile.industry || '所属行业待补'}
        </p>
        {(() => {
          const territory = territoryOf(company);
          const parts = [
            territory.province,
            territory.city,
            territory.district,
            territory.park ? `园区：${territory.park}` : '',
          ].filter(Boolean);
          return (
            <p className="flow-rel-rail-territory">
              属地 {parts.length ? parts.join(' · ') : '待补充'}
              {territory.note ? `（${territory.note}）` : ''}
            </p>
          );
        })()}
      </div>

      <div className="flow-rel-rail-scroll">
        <section className="flow-rel-section">
          <h3>
            链内关系 <b>{edges.length}</b>
          </h3>
          {edges.length === 0 && <p className="flow-rel-empty">本链内暂无可识别的具名关系</p>}
          {out.length > 0 && (
            <div className="flow-rel-edge-group">
              <span className="flow-rel-edge-label">供往下游（{out.length}）</span>
              {out.map((rel) => (
                <button
                  type="button"
                  className="flow-rel-edge"
                  key={rel.id}
                  onClick={() => onOpen(rel.sourceToProfile)}
                  disabled={!onOpen}
                >
                  <em>→</em>
                  <span>{rel.sourceToProfile}</span>
                  <i>{rel.relationType}</i>
                </button>
              ))}
            </div>
          )}
          {incoming.length > 0 && (
            <div className="flow-rel-edge-group">
              <span className="flow-rel-edge-label">承接上游（{incoming.length}）</span>
              {incoming.map((rel) => (
                <button
                  type="button"
                  className="flow-rel-edge"
                  key={rel.id}
                  onClick={() => onOpen(rel.sourceFromProfile)}
                >
                  <em>←</em>
                  <span>{rel.sourceFromProfile}</span>
                  <i>{rel.relationType}</i>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flow-rel-section">
          <h3>
            股权穿透
            {completeness.equity && <small>{completeness.equity}</small>}
          </h3>
          <RelField label="实际控制人" value={profile.controller} />
          <RelField label="实控人性质" value={profile.controllerType} />
          <RelField label="控制路径" value={profile.controlPath} />
          <RelField label="第一大股东" value={profile.topShareholder} />
          <RelField label="前十大股东" value={profile.top10} />
        </section>

        <section className="flow-rel-section">
          <h3>
            关键人
            {completeness.keyPersons && <small>{completeness.keyPersons}</small>}
          </h3>
          <RelField label="董事长" value={profile.chairman} />
          <RelField label="法定代表人" value={profile.legalPerson} />
          <RelField label="总经理" value={profile.generalManager} />
          <RelField label="创始人背景" value={profile.founderBackground} />
          <RelField label="简介" value={profile.peopleNote} />
        </section>

        <section className="flow-rel-section">
          <h3>
            供销关系
            {completeness.supplyChain && <small>{completeness.supplyChain}</small>}
          </h3>
          <RelField
            label={`前五大客户${profile.supplyDisclosed ? `（披露：${profile.supplyDisclosed}）` : ''}`}
            value={profile.customers}
          />
          <RelField label="前五大供应商" value={profile.suppliers} />
          <RelField label="上下游配套" value={profile.chainNote} />
        </section>

        <section className="flow-rel-section">
          <h3>
            关键人偏好
            {completeness.preferences && <small>{completeness.preferences}</small>}
          </h3>
          <RelField label="战略关注方向" value={profile.prefStrategy} />
          <RelField label="公开活动" value={profile.prefEvents} />
          <RelField label="协会任职" value={profile.prefAssociations} />
          <RelField label="发言主题" value={profile.prefSpeeches} />
          <RelField label="备注" value={profile.prefNote} />
        </section>
      </div>
    </aside>
  );
}

/* ---------------- 页面 ---------------- */

export default function IndustryFlowPage({ selectedIndustry = '', companyDetailPropsFor }) {
  const [data, setData] = useState(null);
  const [shard, setShard] = useState(null);
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [expanded, setExpanded] = useState('');
  const [showCompanies, setShowCompanies] = useState(true);
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedRelation, setSelectedRelation] = useState(null);
  // step3 评估配置：null 表示跟随数据里的默认值（维度池 / 权重 / 阈值 / 壁垒门槛）
  const [weightOverride, setWeightOverride] = useState(null);
  const [thresholdOverride, setThresholdOverride] = useState(null);
  const [enabledOverride, setEnabledOverride] = useState(null);
  const [moatGateOverride, setMoatGateOverride] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const base = document.baseURI;
    Promise.all([
      fetch(new URL('data/industries/storage-chain.json', base).href).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }),
      // 企业分片用于点击标签后打开企业详情；缺失时不阻塞页面。
      fetch(new URL('data/industries/companies-storage.json', base).href)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ])
      .then(([chainPayload, shardPayload]) => {
        if (cancelled) return;
        setData(chainPayload);
        setShard(shardPayload);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message || '数据加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 企业简称 / 全称 -> 分片里的企业对象，供标签点击联动详情
  const entityByName = useMemo(() => {
    const map = new Map();
    (shard?.companies || []).forEach((company) => {
      map.set(normalize(company.name), company);
      const short = company.research?.additionalFields?.stockShort;
      if (short) map.set(normalize(short), company);
    });
    return map;
  }, [shard]);

  const toggleNode = (key) => setExpanded((current) => (current === key ? '' : key));
  const selectStep = (index) => {
    setActiveStep(index);
    setExpanded('');
    if (index === 1) setShowCompanies(true);
  };

  const steps = useMemo(() => data?.steps || [], [data]);
  const levels = useMemo(() => data?.levels || [], [data]);
  const colors = useMemo(
    () => levels.map((_, index) => CHAIN_COLOR_POOL[index % CHAIN_COLOR_POOL.length]),
    [levels],
  );

  // ---- step4：链内关系 ----
  const relations = useMemo(() => data?.relations || [], [data]);
  // 供标签与关系面板统一按简称取企业对象
  const relationLookup = useMemo(() => {
    const byShort = new Map();
    (data?.companies || []).forEach((c) => byShort.set(normalize(c.name), c));
    const entity = (short) => {
      const local = byShort.get(normalize(short));
      return local || entityByName.get(normalize(short)) || null;
    };
    return { byShort, entity };
  }, [data, entityByName]);

  const edgesByShort = useMemo(() => {
    const map = new Map();
    relations.forEach((rel) => {
      [rel.sourceFromProfile, rel.sourceToProfile].forEach((key) => {
        if (!key) return;
        map.set(key, (map.get(key) || 0) + 1);
      });
    });
    return map;
  }, [relations]);

  const hubs = useMemo(
    () =>
      [...edgesByShort.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    [edgesByShort],
  );

  const relationEdgesFor = (short) =>
    relations.filter((rel) => rel.sourceFromProfile === short || rel.sourceToProfile === short);

  // ---- step3：维度池（可增删）+ 权重 + 分档阈值 + 壁垒门槛，改动后实时重算 ----
  const headRule = useMemo(() => steps.find((s) => s.id === 'heads')?.rule || null, [steps]);
  const dimensions = useMemo(() => headRule?.dimensions || [], [headRule]);
  const dimensionKind = useMemo(
    () => Object.fromEntries(dimensions.map((dim) => [dim.key, dim.kind])),
    [dimensions],
  );
  const defaultWeights = useMemo(
    () => Object.fromEntries(dimensions.map((dim) => [dim.key, dim.weight])),
    [dimensions],
  );
  const defaultEnabled = useMemo(
    () => dimensions.filter((dim) => dim.enabled !== false).map((dim) => dim.key),
    [dimensions],
  );
  const defaultThresholds = useMemo(() => {
    const tiers = headRule?.tiers || [];
    return {
      leader: tiers.find((t) => t.key === 'leader')?.min ?? 80,
      core: tiers.find((t) => t.key === 'core')?.min ?? 60,
    };
  }, [headRule]);
  const defaultMoatGate = useMemo(
    () => ({
      enabled: headRule?.moatGate?.enabled ?? false,
      min: headRule?.moatGate?.min ?? 70,
    }),
    [headRule],
  );
  const weights = weightOverride || defaultWeights;
  const enabled = enabledOverride || defaultEnabled;
  const thresholds = thresholdOverride || defaultThresholds;
  const moatGate = moatGateOverride || defaultMoatGate;
  const isDefaultConfig =
    !weightOverride && !thresholdOverride && !enabledOverride && !moatGateOverride;

  // 逐企业加权总分 + 壁垒分 → 档位；按简称索引，供卡片与图例共用
  const evaluation = useMemo(() => {
    const map = new Map();
    const keys = enabled.filter((key) => (weights[key] || 0) > 0);
    const weightSum = keys.reduce((sum, key) => sum + weights[key], 0);
    const moatOn = keys.filter((key) => dimensionKind[key] === 'moat');
    const moatSum = moatOn.reduce((sum, key) => sum + weights[key], 0);
    levels.forEach((level) =>
      level.children.forEach((child) =>
        child.companies.forEach((company) => {
          if (map.has(company.name)) return;
          const detail = company.scoreDetail;
          if (!detail || !weightSum) {
            map.set(company.name, { score: undefined, moat: null, tier: company.tier });
            return;
          }
          const score =
            keys.reduce((sum, key) => sum + weights[key] * (detail[key] || 0), 0) / weightSum;
          const moat = moatSum
            ? moatOn.reduce((sum, key) => sum + weights[key] * (detail[key] || 0), 0) / moatSum
            : null;
          let tier =
            score >= thresholds.leader ? 'leader' : score >= thresholds.core ? 'core' : 'tail';
          // 壁垒门槛：总分够龙头但壁垒分不足 → 降为骨干（避免「大而不强」被评龙头）
          const gated =
            tier === 'leader' && moatGate.enabled && moat !== null && moat < moatGate.min;
          if (gated) tier = 'core';
          map.set(company.name, { score, moat, tier, gated });
        }),
      ),
    );
    return map;
  }, [levels, weights, enabled, thresholds, moatGate, dimensionKind]);

  const evalCounts = useMemo(() => {
    const counts = {
      leader: 0,
      core: 0,
      tail: 0,
      total: 0,
      changed: 0,
      moatDemoted: 0,
      changedList: [],
    };
    const seen = new Set();
    levels.forEach((level) =>
      level.children.forEach((child) =>
        child.companies.forEach((company) => {
          if (seen.has(company.name)) return;
          seen.add(company.name);
          const result = evaluation.get(company.name);
          const tier = result?.tier || company.tier;
          counts[tier] += 1;
          counts.total += 1;
          if (result?.gated) counts.moatDemoted += 1;
          if (tier !== company.tier) {
            counts.changed += 1;
            if (counts.changedList.length < 24) {
              counts.changedList.push(
                `${company.name}（${TIER_META[company.tier].short}→${TIER_META[tier].short}）`,
              );
            }
          }
        }),
      ),
    );
    return counts;
  }, [levels, evaluation]);

  // 壁垒分统计：已启用壁垒维度数、龙头均分、全体中位、高壁垒家数
  const moatStats = useMemo(() => {
    const activeMoat = enabled.filter(
      (key) => dimensionKind[key] === 'moat' && (weights[key] || 0) > 0,
    );
    const values = [];
    const leaders = [];
    const seen = new Set();
    levels.forEach((level) =>
      level.children.forEach((child) =>
        child.companies.forEach((company) => {
          if (seen.has(company.name)) return;
          seen.add(company.name);
          const result = evaluation.get(company.name);
          if (result?.moat === null || result?.moat === undefined) return;
          values.push(result.moat);
          if (result.tier === 'leader') leaders.push(result.moat);
        }),
      ),
    );
    const sorted = [...values].sort((a, b) => a - b);
    return {
      moatDims: activeMoat.length,
      leaderAvg:
        leaders.length > 0
          ? Math.round(leaders.reduce((sum, value) => sum + value, 0) / leaders.length)
          : null,
      median: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null,
      highCount: values.filter((value) => value >= moatGate.min).length,
    };
  }, [levels, evaluation, enabled, weights, dimensionKind, moatGate]);

  const resetConfig = () => {
    setWeightOverride(null);
    setThresholdOverride(null);
    setEnabledOverride(null);
    setMoatGateOverride(null);
  };
  // 注意：这几个 handler 一律用**函数式更新**。曾用 `{ ...weights }` 这种读闭包的写法，
  // 结果连续两次「新增维度」在同一 tick 内会互相覆盖（enabled / weights 拿到的都是旧值），
  // 前一次点击被静默丢弃。
  const setWeight = (key, value) => {
    const safe = Math.max(0, Math.min(100, value || 0));
    setWeightOverride((prev) => ({ ...(prev || defaultWeights), [key]: safe }));
  };
  const setThreshold = (key, value) => {
    const safe = Math.max(0, Math.min(100, value || 0));
    setThresholdOverride((prev) => ({ ...(prev || defaultThresholds), [key]: safe }));
  };
  const setMoatGate = (patch) =>
    setMoatGateOverride((prev) => ({ ...(prev || defaultMoatGate), ...patch }));
  // 新增维度：加入并给一个 10 分的起步权重（便于立刻看到效果），用户可再调
  const addDimension = (key) => {
    setEnabledOverride((prev) => {
      const list = prev || defaultEnabled;
      return list.includes(key) ? list : [...list, key];
    });
    setWeightOverride((prev) => {
      const next = prev || defaultWeights;
      return (next[key] || 0) > 0 ? next : { ...next, [key]: 10 };
    });
  };
  // 删减维度：至少保留一个，否则「加权总分」会退化成单维度分
  const removeDimension = (key) => {
    setEnabledOverride((prev) => {
      const list = prev || defaultEnabled;
      return list.length <= 1 ? list : list.filter((item) => item !== key);
    });
  };

  if (error) {
    return (
      <main className="flow-page">
        <div className="flow-error" role="alert">
          储能产业数据加载失败：{error}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flow-page">
        <div className="flow-loading" role="status">
          正在加载储能产业数据…
        </div>
      </main>
    );
  }

  const current = steps[activeStep];
  // 流程页演示的是储能产业的建链方法，与顶部选择器的其他一级链不一致时给出提示。
  const industryMismatch = selectedIndustry && selectedIndustry !== data.industry;

  return (
    <main className="flow-page">
      <header className="flow-toolbar">
        <div className="flow-title-lockup">
          <span>产业链流程</span>
          <strong>{data.industry} · 建链四步</strong>
        </div>
        <div className="flow-toolbar-summary">
          <b>{data.stats.level1}</b> 个一级环节 <i>·</i> <b>{data.stats.level2}</b> 个二级环节{' '}
          <i>·</i> <b>{data.stats.companies}</b> 家上市企业
        </div>
        {activeStep === 1 && (
          <button
            type="button"
            className={`flow-toggle ${showCompanies ? 'active' : ''}`}
            aria-pressed={showCompanies}
            onClick={() => setShowCompanies((visible) => !visible)}
          >
            {showCompanies ? '收起企业名称' : '展开企业名称'}
          </button>
        )}
        {activeStep === 2 && (
          <div className="flow-tier-switch" role="group" aria-label="按分档筛选企业">
            <span className="flow-tier-switch-title">按分档查看</span>
            {TIER_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter.key}
                className={`${tierFilter === filter.key ? 'active' : ''} tone-${filter.tone}`}
                aria-pressed={tierFilter === filter.key}
                onClick={() => {
                  setTierFilter(filter.key);
                  setExpanded('');
                }}
              >
                <i className="flow-tier-switch-dot" />
                <span>{filter.label}</span>
                <b>{filter.count(evalCounts)}</b>
              </button>
            ))}
          </div>
        )}
      </header>

      {industryMismatch && (
        <p className="flow-industry-notice">
          本页演示的是<b>{data.industry}</b>的建链方法，数据固定为储能产业；顶部当前一级链为「
          {selectedIndustry}」，图谱 / 地图 / 周报页签会跟随该选择切换。
        </p>
      )}

      <StepBar steps={steps} activeIndex={activeStep} onSelect={selectStep} />

      <section className="flow-canvas" aria-label={current.title}>
        <header className="flow-canvas-head">
          <div>
            <span className="flow-canvas-eyebrow">
              STEP {String(activeStep + 1).padStart(2, '0')} /{' '}
              {String(steps.length).padStart(2, '0')}
            </span>
            <h2>{current.title}</h2>
          </div>
          <div className="flow-canvas-metrics">
            {activeStep === 0 && (
              <>
                <div>
                  <b>{current.stats.level1}</b>
                  <span>一级环节</span>
                </div>
                <div>
                  <b>{current.stats.level2}</b>
                  <span>二级环节</span>
                </div>
              </>
            )}
            {activeStep === 1 && (
              <>
                <div>
                  <b>{current.stats.companies}</b>
                  <span>上市企业</span>
                </div>
                <div className="is-other">
                  <b>{current.stats.other ?? 0}</b>
                  <span>非上市客户</span>
                </div>
                <div>
                  <b>{current.stats.total ?? current.stats.companies}</b>
                  <span>全量客户</span>
                </div>
                <div>
                  <b>{current.stats.coreMain + current.stats.core}</b>
                  <span>核心档</span>
                </div>
                <div>
                  <b>{current.stats.important}</b>
                  <span>相关重要</span>
                </div>
              </>
            )}
            {activeStep === 2 && (
              <>
                <div>
                  <b>{evalCounts.leader}</b>
                  <span>龙头</span>
                </div>
                <div>
                  <b>{evalCounts.core}</b>
                  <span>骨干</span>
                </div>
                <div>
                  <b>{evalCounts.tail}</b>
                  <span>长尾</span>
                </div>
                {evalCounts.changed > 0 && (
                  <div className="is-delta">
                    <b>{evalCounts.changed}</b>
                    <span>档位变化</span>
                  </div>
                )}
              </>
            )}
            {activeStep === 3 && (
              <>
                <div>
                  <b>{current.stats.total}</b>
                  <span>条链内关系</span>
                </div>
                <div>
                  <b>{current.stats.companies}</b>
                  <span>覆盖企业</span>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="flow-canvas-body">
          {activeStep === 0 && <p className="flow-canvas-note">{current.detail}</p>}

          {activeStep === 1 && (
            <div className="flow-grade-legend">
              <span className="flow-legend-title">储能相关度</span>
              {data.distributions.grades.map((item) => (
                <span className={`flow-legend-item tone-${gradeMeta(item.k).tone}`} key={item.k}>
                  <i />
                  {gradeMeta(item.k).short}
                  <b>{item.v}</b>
                </span>
              ))}
            </div>
          )}

          {activeStep === 2 && (
            <>
              <RulePanel rule={current.rule} />
              <EvalConfig
                rule={current.rule}
                weights={weights}
                enabled={enabled}
                thresholds={thresholds}
                moatGate={moatGate}
                onWeight={setWeight}
                onThreshold={setThreshold}
                onMoatGate={setMoatGate}
                onAddDimension={addDimension}
                onRemoveDimension={removeDimension}
                onReset={resetConfig}
                isDefault={isDefaultConfig}
                counts={evalCounts}
                moatStats={moatStats}
              />
              <div className="flow-tier-legend">
                <span className="flow-legend-title">分档结果</span>
                <span className="flow-legend-item tier-leader">
                  <i />
                  龙头
                  <b>{evalCounts.leader}</b>
                </span>
                <span className="flow-legend-item tier-core">
                  <i />
                  骨干
                  <b>{evalCounts.core}</b>
                </span>
                <span className="flow-legend-item tier-tail">
                  <i />
                  长尾
                  <b>{evalCounts.tail}</b>
                </span>
                <span className="flow-tier-legend-note">
                  按当前配置逐一评档；标签上的数字是加权总分 · 点击标签可查看企业详情
                </span>
              </div>
            </>
          )}

          {activeStep === 1 && (
            <TerritoryPanel
              territory={data.territory}
              customerTerritory={data.customerTerritory}
              customerStats={data.customerStats}
              placement={{
                real: data.customerStats?.otherRealLocation ?? 0,
                regionRef: data.customerStats?.otherRegionReference ?? 0,
                unplaced: data.customerStats?.otherUnplaced ?? 0,
              }}
              note={data.territoryNote}
            />
          )}

          {activeStep === 3 && <RelationsPanel step={current} hubs={hubs} />}
          {activeStep === 3 && (
            <ExternalPanel
              mentions={data.externalMentions || []}
              verified={data.externalVerified || []}
              note={data.externalNote || ''}
            />
          )}

          {(activeStep === 0 || activeStep === 1 || activeStep === 2 || activeStep === 3) && (
            <div
              className="flow-stage-wrap"
              // 每列至少 180px；窄屏时由画布横向滚动，而不是把卡片压扁。
              style={{ minWidth: `${Math.max(1180, levels.length * 180)}px` }}
            >
              <PositionRow positions={data.positions} columnCount={levels.length} />
              <div
                className="flow-stage-row"
                style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}
              >
                {levels.map((level, index) =>
                  activeStep === 0 ? (
                    <SkeletonCard
                      key={level.code}
                      level={level}
                      color={colors[index]}
                      expanded={expanded}
                      onToggle={toggleNode}
                      entityByName={entityByName}
                      onOpen={setSelectedCompany}
                    />
                  ) : activeStep === 1 ? (
                    <CompaniesCard
                      key={level.code}
                      level={level}
                      color={colors[index]}
                      showCompanies={showCompanies}
                      expanded={expanded}
                      onToggle={toggleNode}
                      entityByName={entityByName}
                      onOpen={setSelectedCompany}
                    />
                  ) : activeStep === 2 ? (
                    <HeadsCard
                      key={level.code}
                      level={level}
                      color={colors[index]}
                      tierFilter={tierFilter}
                      expanded={expanded}
                      onToggle={toggleNode}
                      entityByName={entityByName}
                      onOpen={setSelectedCompany}
                      evaluation={evaluation}
                    />
                  ) : (
                    <RelationsCard
                      key={level.code}
                      level={level}
                      color={colors[index]}
                      relationsByCompany={relationLookup}
                      expanded={expanded}
                      onToggle={toggleNode}
                      onOpen={setSelectedRelation}
                    />
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        {selectedRelation && (
          <RelationRail
            company={selectedRelation}
            edges={relationEdgesFor(selectedRelation.name)}
            onClose={() => setSelectedRelation(null)}
            onOpen={(short) => {
              const next = relationLookup.entity(short);
              if (next) setSelectedRelation(next);
            }}
          />
        )}

        {selectedCompany && (
          <CompanyDetailRail
            entity={selectedCompany}
            detailProps={companyDetailPropsFor?.(selectedCompany, [])}
            onClearSelection={() => setSelectedCompany(null)}
            className="company-detail-rail--atlas"
          />
        )}
      </section>
    </main>
  );
}
