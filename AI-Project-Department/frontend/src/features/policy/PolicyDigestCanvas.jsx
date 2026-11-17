// 集合解读画布：把「一批政策」的解读结论画出来。
//
// 两个视图（储能行业·有效期内政策 / 全行业政策地位对比）共用这一个画布，
// 首个模块按视图区分：储能视图是「总体判断」，对比视图是「行业对比」；
// 其后八个公共模块：政策清单 → 来源与空间 → 政策目标 → 产业链影响
//   → 区域影响 → 企业影响 → 时间周期 → 银行业务。
// 与单条解读的区别：所有读数都是「集合口径」——分布、覆盖、占比，而不是一条政策的结论。
// 每条政策的行业标签与有效期可在此人工修正（自动识别可能不准）。
import { useState } from 'react';
import { modulesFor, TONE_CLASS } from './policyData';
import { INDUSTRY_SELECT_GROUPS } from './policyIndustry';
import PolicyRegionMap from './PolicyRegionMap';
import PolicySourceBadge from './PolicySourceBadge';

const EXPIRY_MODES = [
  { value: '', label: '自动识别' },
  { value: 'permanent', label: '长期有效' },
  { value: 'date', label: '指定失效日' },
];

const expiryModeOf = (value) => {
  if (!value) return '';
  return value === 'permanent' ? 'permanent' : 'date';
};

/* ---------------- 通用小部件 ---------------- */

function ModuleShell({ id, no, title, subtitle, source, aside, children }) {
  return (
    <section className="policy-module" id={`policy-${id}`}>
      <header className="policy-module-head">
        <span className="policy-module-no">{no}</span>
        <div className="policy-module-title">
          <h3>
            {title}
            {source && <PolicySourceBadge sourceKey={source} />}
          </h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {aside}
      </header>
      <div className="policy-module-body">{children}</div>
    </section>
  );
}

function MixBar({ label, count, ratio = 0, tone = '', note = '' }) {
  return (
    <li className={`policy-mix-item ${tone ? (TONE_CLASS[tone] ?? '') : ''}`}>
      <span className="policy-mix-label">{label}</span>
      <span className="policy-mix-track">
        <i style={{ width: `${Math.max(ratio, count ? 3 : 0)}%` }} />
      </span>
      <b>{count}</b>
      <em>{ratio}%</em>
      {note && <span className="policy-mix-note">{note}</span>}
    </li>
  );
}

function ValidityChip({ validity }) {
  const tone = validity.tone ? TONE_CLASS[validity.tone] : '';
  return (
    <span
      className={`policy-chip ${tone}`}
      title={`${validity.basis}${validity.manual ? '（人工修正）' : ''}`}
    >
      {validity.statusLabel}
      {validity.expiresOn ? ` · ${validity.expiresOn}` : ''}
    </span>
  );
}

/* ---------------- 00·总体政策判断（储能视图） ---------------- */

function OverallModule({ digest, no }) {
  const { overall } = digest;
  const m = overall.metrics;
  const tone = TONE_CLASS[overall.stance.tone] ?? '';

  return (
    <ModuleShell
      id="overall"
      no={no}
      title={`${digest.focus.label}行业总体政策判断`}
      subtitle={`对「${digest.focus.label}且在有效期内」这批政策的整体结论：支持基调、政策空间、到期风险与首要抓手，口径全部来自下方各模块明细`}
      source="engine"
      aside={<span className={`policy-chip ${tone}`}>{overall.stance.label}</span>}
    >
      <div className={`policy-overall ${tone ? `is-${tone.replace('is-', '')}` : ''}`}>
        <p className="policy-overall-headline">{overall.headline}</p>
        <ul className="policy-overall-metrics">
          <li>
            <b>{m.count}</b>
            <span>有效政策</span>
          </li>
          <li>
            <b>{m.avg}</b>
            <span>平均支持强度</span>
          </li>
          <li>
            <b>
              {m.nationalRatio}
              <em>%</em>
            </b>
            <span>国家级占比（{m.national} 份）</span>
          </li>
          <li>
            <b>
              {m.supportRatio}
              <em>%</em>
            </b>
            <span>支持基调占比（{m.support} 份）</span>
          </li>
          <li>
            <b>{m.expiringSoon}</b>
            <span>90 天内到期</span>
          </li>
        </ul>
        {overall.points.length > 0 && (
          <ul className="policy-overall-points">
            {overall.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
      </div>
    </ModuleShell>
  );
}

/* ---------------- 00·行业政策地位对比（全行业视图） ---------------- */

function CompareModule({ digest, no }) {
  const { compare } = digest;
  const max = Math.max(...compare.sorted.map((item) => item.count), 1);

  return (
    <ModuleShell
      id="compare"
      no={no}
      title={`${digest.focus.label} vs ${
        compare.focusInLexicon ? '26 个重点行业' : `${compare.totalIndustries} 个行业参照系`
      } · 政策地位对比`}
      subtitle={`以科技金融十大赛道、工信部十大稳增长行业、六大未来产业为参照系，与${digest.focus.label}比较政策数量与支持强度 · 库内命中 ${compare.covered}/${compare.totalIndustries} 个参照行业`}
      source="framework"
    >
      <p className="policy-compare-conclusion">{compare.conclusion}</p>

      <ul className="policy-overall-metrics policy-compare-ranks">
        <li>
          <b>
            {compare.storage.rank}
            <em>
              /{compare.focusInLexicon ? compare.totalIndustries : compare.totalIndustries + 1}
            </em>
          </b>
          <span>{digest.focus.label}政策数量排名</span>
        </li>
        <li>
          <b>{compare.storage.count}</b>
          <span>{digest.focus.label}政策条数</span>
        </li>
        <li>
          <b>{compare.storage.avgScore}</b>
          <span>{digest.focus.label}平均支持强度</span>
        </li>
        <li>
          <b>{compare.allAvg}</b>
          <span>全库平均支持强度</span>
        </li>
        <li>
          <b>{compare.covered}</b>
          <span>有政策命中的行业</span>
        </li>
      </ul>

      <ul className="policy-compare-list">
        {compare.sorted.map((item) => (
          <li
            key={item.key}
            className={
              compare.focusInLexicon && item.key === 'storage'
                ? 'is-storage'
                : item.count
                  ? 'is-hit'
                  : ''
            }
            title={item.titles.length ? `涉及政策：${item.titles.join('；')}` : '库内暂无命中政策'}
          >
            <b className="policy-compare-rank">{item.rank}</b>
            <span className="policy-compare-label">
              {item.label}
              {item.group && item.group !== 'storage' && (
                <em>
                  {item.group === 'tech' ? '赛道' : item.group === 'steady' ? '稳增长' : '未来'}
                </em>
              )}
            </span>
            <span className="policy-mix-track">
              <i style={{ width: `${Math.max((item.count / max) * 100, item.count ? 4 : 0)}%` }} />
            </span>
            <b>{item.count}</b>
            <em>{item.count ? `${item.avgScore} 分` : '—'}</em>
          </li>
        ))}
      </ul>

      <div className="policy-compare-groups">
        {compare.groups.map((group) => (
          <div key={group.key} className="policy-compare-group">
            <h4>
              {group.label}
              <span>
                {group.hitCount}/{group.total} 个行业有政策 · 共 {group.policyCount} 份
              </span>
            </h4>
            <ul>
              {group.members.map((member) => (
                <li key={member.key} className={member.count ? 'is-hit' : ''}>
                  <span>{member.label}</span>
                  <b>{member.count || '·'}</b>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="policy-compare-note">
        口径说明：一份政策命中多个行业时按「命中即计入」分别计入（行业交叉的真实反映），
        因此各行业政策数之和可能大于库内条数；排名用于相对地位比较。行业标签识别不准时，
        可在「政策清单」模块中人工修正，修正后本对比即时更新。
      </p>
    </ModuleShell>
  );
}

/* ---------------- 政策清单 ---------------- */

function PolicyListModule({ digest, onCorrect, onRemove, no }) {
  const [openId, setOpenId] = useState('');
  const { rows } = digest;

  return (
    <ModuleShell
      id="list"
      no={no}
      title="政策清单与筛选口径"
      subtitle={`本视图纳入 ${digest.matchedCount} 份政策（政策库共 ${digest.libraryCount} 份）· 行业与有效期可人工修正`}
      source="engine"
    >
      {!rows.length ? (
        <p className="policy-digest-empty">{digest.scopeMeta.emptyHint}</p>
      ) : (
        <>
          {(digest.excluded.expired > 0 || digest.excluded.otherIndustry > 0) && (
            <p className="policy-digest-excluded">
              已排除
              {digest.excluded.expired > 0 && (
                <>
                  <b>{digest.excluded.expired}</b> 份已过期政策
                </>
              )}
              {digest.excluded.expired > 0 && digest.excluded.otherIndustry > 0 && '、'}
              {digest.excluded.otherIndustry > 0 && (
                <>
                  <b>{digest.excluded.otherIndustry}</b> 份非{digest.focus.label}行业政策
                </>
              )}
              。如需纳入，可在下方切换到「全部行业政策」，或修正该政策的行业 / 有效期。
            </p>
          )}

          <ul className="policy-digest-list">
            {rows.map((row, index) => {
              const industry = row.industries[0];
              const open = openId === row.id;
              return (
                <li key={row.id} className="policy-digest-item">
                  <div className="policy-digest-item-head">
                    <span className="policy-digest-order">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="policy-digest-title">
                      <b>{row.title}</b>
                      <span>
                        {row.sourceName || '手动录入'}
                        {row.isSample ? ' · 示例' : ''}
                      </span>
                    </div>
                    <span className="policy-chip">{row.level.label}</span>
                    <ValidityChip validity={row.validity} />
                    <span className={`policy-chip ${TONE_CLASS[row.score.grade.tone] ?? ''}`}>
                      {row.score.grade.label}
                    </span>
                    <b className="policy-digest-score">{row.score.total}</b>
                    <button
                      type="button"
                      className="policy-link-button"
                      onClick={() => setOpenId(open ? '' : row.id)}
                    >
                      {open ? '收起' : '修正'}
                    </button>
                    <button
                      type="button"
                      className="policy-digest-remove"
                      aria-label={`移除 ${row.title}`}
                      title="从政策库移除"
                      onClick={() => onRemove(row.id)}
                    >
                      ×
                    </button>
                  </div>

                  <div className="policy-digest-item-body">
                    {row.industries.map((item) => (
                      <span
                        key={item.key}
                        className={`policy-tag ${digest.compare.focusInLexicon && item.key === 'storage' ? 'is-storage' : ''}`}
                        title={item.hits?.length ? `命中：${item.hits.slice(0, 6).join('、')}` : ''}
                      >
                        {item.label}
                        {item.manual ? '（人工）' : ''}
                      </span>
                    ))}
                    <ul className="policy-digest-headline">
                      {row.headline.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  </div>

                  {open && (
                    <div className="policy-digest-fix">
                      <label>
                        <span>行业标签</span>
                        <select
                          value={industry.manual ? industry.key : ''}
                          onChange={(event) =>
                            onCorrect(
                              row.id,
                              { industryOverride: event.target.value },
                              '已修正行业标签。',
                            )
                          }
                        >
                          <option value="">自动识别</option>
                          {INDUSTRY_SELECT_GROUPS.map((group) =>
                            group.label ? (
                              <optgroup key={group.key} label={group.label}>
                                {group.options.map((option) => (
                                  <option
                                    key={option.value ?? option.key}
                                    value={option.value ?? option.key}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </optgroup>
                            ) : (
                              group.options.map((option) => (
                                <option
                                  key={option.value ?? option.key}
                                  value={option.value ?? option.key}
                                >
                                  {option.label}
                                </option>
                              ))
                            ),
                          )}
                        </select>
                      </label>
                      <label>
                        <span>有效期</span>
                        <select
                          value={expiryModeOf(
                            row.validity.manual ? row.validity.overrideValue : '',
                          )}
                          onChange={(event) => {
                            const mode = event.target.value;
                            const next =
                              mode === 'date' ? row.validity.expiresOn || '2030-12-31' : mode;
                            onCorrect(row.id, { validityOverride: next }, '已修正有效期。');
                          }}
                        >
                          {EXPIRY_MODES.map((mode) => (
                            <option key={mode.value} value={mode.value}>
                              {mode.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {expiryModeOf(row.validity.overrideValue) === 'date' && (
                        <label>
                          <span>失效日</span>
                          <input
                            type="date"
                            value={row.validity.overrideValue || ''}
                            onChange={(event) =>
                              onCorrect(
                                row.id,
                                { validityOverride: event.target.value },
                                '已修正失败日。',
                              )
                            }
                          />
                        </label>
                      )}
                      <span className="policy-digest-basis">
                        识别依据：{row.validity.basis}
                        {row.validity.issuedOn ? ` · 发布 ${row.validity.issuedOn}` : ''}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ModuleShell>
  );
}

/* ---------------- 画布 ---------------- */

export default function PolicyDigestCanvas({
  digest,
  activeModule,
  onJump,
  activeRegion,
  onPickRegion,
  onCorrect,
  onRemove,
  onOpenStandard,
  onNavigate,
}) {
  const top = digest.rows[0] || null;
  const goCredit = typeof onNavigate === 'function' ? () => onNavigate('credit') : null;
  // 模块导航按视图区分：储能视图以「总体判断」开头，对比视图以「行业对比」开头。
  const modules = modulesFor(digest.scope);
  const noOf = (id) => modules.find((module) => module.id === id)?.no || '';

  return (
    <section className="policy-canvas" aria-label={`${digest.scopeMeta.label}解读`}>
      <header className="policy-canvas-head">
        <div className="policy-canvas-headline">
          <div className="policy-canvas-title">
            <span className="policy-canvas-eyebrow">{digest.scopeMeta.eyebrow}</span>
            <h2>{digest.scopeMeta.label}</h2>
            <p>{digest.scopeMeta.desc}</p>
          </div>
          <div className="policy-canvas-metrics">
            <div>
              <b>{digest.matchedCount}</b>
              <span>纳入政策</span>
              <em>库内 {digest.libraryCount} 份</em>
            </div>
            <button
              type="button"
              className="policy-metric is-action"
              onClick={onOpenStandard}
              aria-label="查看政策影响评分的打分标准"
              title="查看打分标准：八个维度的档位分值与等级评定规则"
            >
              <b>{digest.score.avg}</b>
              <span>平均影响评分</span>
              <em>查看打分标准</em>
            </button>
            <div>
              <b>{top ? top.score.total : '—'}</b>
              <span>最高评分政策</span>
              <em>{top ? top.score.grade.label : '暂无'}</em>
            </div>
            <div>
              <b>{digest.coverage.inForce}</b>
              <span>仍在有效期内</span>
              <em>
                {digest.coverage.expiringSoon
                  ? `${digest.coverage.expiringSoon} 份即将到期`
                  : '无临近到期'}
              </em>
            </div>
            <div>
              <b>
                {digest.coverage.regions}
                <em>省</em>
              </b>
              <span>覆盖区域</span>
              <em>{digest.coverage.industries} 个行业</em>
            </div>
          </div>
        </div>
        <nav className="policy-modnav" aria-label="模块导航">
          {modules.map((module) => (
            <button
              key={module.id}
              type="button"
              className={`policy-modnav-item ${activeModule === module.id ? 'is-active' : ''}`}
              onClick={() => onJump(module.id)}
            >
              <b>{module.no}</b>
              {module.nav}
            </button>
          ))}
        </nav>
      </header>

      <div className="policy-canvas-body">
        {digest.scope === 'all' ? (
          <CompareModule digest={digest} no={noOf('compare')} />
        ) : (
          <OverallModule digest={digest} no={noOf('overall')} />
        )}

        <PolicyListModule
          digest={digest}
          onCorrect={onCorrect}
          onRemove={onRemove}
          no={noOf('list')}
        />

        {/* 02 来源与空间范围：集合的级别构成 */}
        <ModuleShell
          id="space"
          no={noOf('space')}
          title="政策来源与空间范围"
          subtitle={`覆盖 ${digest.coverage.issuers} 个发布主体 · ${levelSummary(digest)}`}
          source="framework"
        >
          <ul className="policy-mix">
            {digest.levelMix.map((item) => (
              <MixBar
                key={item.key}
                label={`${item.label}（${item.range}）`}
                count={item.count}
                ratio={item.ratio}
                tone={item.count ? 'up' : 'watch'}
              />
            ))}
          </ul>
          <ul className="policy-digest-issuers">
            {digest.rows.map((row) => (
              <li key={row.id}>
                <b>{row.level.issuer || '未识别发布主体'}</b>
                <span>{row.title}</span>
                {row.level.uncertain && <em>级别待确认</em>}
              </li>
            ))}
          </ul>
        </ModuleShell>

        {/* 03 政策目标：集合的目标强度与目标类型分布 */}
        <ModuleShell
          id="goal"
          no={noOf('goal')}
          title="政策目标分布"
          subtitle="按集合统计目标强度与目标类型的条数分布，看这批政策整体「压得多重」"
          source="engine"
        >
          <div className="policy-digest-split">
            <div>
              <h4>目标强度分布</h4>
              <ul className="policy-mix">
                {digest.goalMix.strength.map((item) => (
                  <MixBar
                    key={item.label}
                    label={item.label}
                    count={item.count}
                    ratio={
                      digest.matchedCount ? Math.round((item.count / digest.matchedCount) * 100) : 0
                    }
                    tone={item.tone}
                  />
                ))}
              </ul>
            </div>
            <div>
              <h4>目标类型分布</h4>
              <ul className="policy-mix">
                {digest.goalMix.types.length ? (
                  digest.goalMix.types.map((item) => (
                    <MixBar
                      key={item.key}
                      label={item.label}
                      count={item.count}
                      ratio={
                        digest.matchedCount
                          ? Math.round((item.count / digest.matchedCount) * 100)
                          : 0
                      }
                      tone="up"
                    />
                  ))
                ) : (
                  <li className="policy-mix-empty">未识别到可归类的目标类型</li>
                )}
              </ul>
            </div>
          </div>
        </ModuleShell>

        {/* 04 产业链影响：环节被多少条政策覆盖 */}
        <ModuleShell
          id="chain"
          no={noOf('chain')}
          title="产业链环节覆盖"
          subtitle={`集合共覆盖 ${digest.coverage.chains}/7 个一级环节 · 数字为命中该环节的政策条数`}
          source="engine"
        >
          <ul className="policy-mix">
            {digest.chainMix.map((item) => (
              <MixBar
                key={item.key}
                label={`${item.position} · ${item.label}`}
                count={item.count}
                ratio={item.ratio}
                tone={item.count ? 'up' : 'watch'}
              />
            ))}
          </ul>
        </ModuleShell>

        {/* 05 区域影响 */}
        <ModuleShell
          id="region"
          no={noOf('region')}
          title="区域影响分布"
          subtitle={`集合覆盖 ${digest.coverage.regions} 个省级区域 · 带动强度 = 本地产业基础 × 政策覆盖比例`}
          source="engine"
        >
          <div className="policy-digest-mapwrap">
            <div className="policy-digest-map">
              <PolicyRegionMap
                region={digest.regionMap}
                activeName={activeRegion}
                onPick={onPickRegion}
              />
            </div>
            <ul className="policy-digest-bands">
              {digest.regionMap.bands.map((band) => (
                <li key={band.label}>
                  <i style={{ background: band.fill }} />
                  {band.label}
                  <em>≥ {band.min}</em>
                </li>
              ))}
            </ul>
          </div>
          <ol className="policy-digest-regions">
            {digest.regionMix.map((item) => (
              <li
                key={item.name}
                className={item.name === activeRegion ? 'is-active' : ''}
                onClick={() => onPickRegion?.(item.name)}
              >
                <b>{item.full}</b>
                <span>{item.count} 份政策</span>
                <em>{item.maturity ?? '—'} 分成熟度</em>
                <p>{item.direction || '暂未收录该区域的产业方向'}</p>
              </li>
            ))}
            {!digest.regionMix.length && (
              <li className="is-empty">本视图的这批政策未识别到具体覆盖省份。</li>
            )}
          </ol>
        </ModuleShell>

        {/* 06 企业影响 */}
        <ModuleShell
          id="company"
          no={noOf('company')}
          title="受影响企业分布"
          subtitle="按产业链环节归并的企业类型，数字为命中该类企业的政策条数"
          source="engine"
        >
          <ul className="policy-mix">
            {digest.companyMix.map((item) => (
              <MixBar
                key={item.key}
                label={item.label}
                count={item.count}
                ratio={item.ratio}
                tone={item.count ? 'up' : 'watch'}
              />
            ))}
          </ul>
        </ModuleShell>

        {/* 07 时间周期 */}
        <ModuleShell
          id="timeline"
          no={noOf('timeline')}
          title="有效期与时间节奏"
          subtitle="先看这批政策还有多久有效，再看它们把影响放在多长的时间窗口里"
          source="engine"
        >
          <div className="policy-digest-split">
            <div>
              <h4>有效期状态</h4>
              <ul className="policy-mix">
                {digest.validityMix
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <MixBar
                      key={item.key}
                      label={item.label}
                      count={item.count}
                      ratio={
                        digest.matchedCount
                          ? Math.round((item.count / digest.matchedCount) * 100)
                          : 0
                      }
                      tone={item.tone}
                    />
                  ))}
              </ul>
            </div>
            <div>
              <h4>影响时间窗口</h4>
              <ul className="policy-mix">
                {digest.horizonMix.map((item) => (
                  <MixBar
                    key={item.key}
                    label={`${item.label}（${item.window}）`}
                    count={item.count}
                    ratio={
                      digest.matchedCount ? Math.round((item.count / digest.matchedCount) * 100) : 0
                    }
                    tone="watch"
                  />
                ))}
              </ul>
            </div>
          </div>
          {digest.upcoming.length > 0 && (
            <div className="policy-digest-upcoming">
              <h4>未来一年内到期的政策</h4>
              <ul>
                {digest.upcoming.map((row) => (
                  <li key={row.id}>
                    <b>{row.validity.expiresOn}</b>
                    <span>剩余 {Math.max(0, row.validity.daysLeft)} 天</span>
                    {row.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ModuleShell>

        {/* 08 银行业务 */}
        <ModuleShell
          id="banking"
          no={noOf('banking')}
          title="可对接的银行业务"
          subtitle={`集合共命中 ${digest.coverage.banking} 类可对接产品 · 数字为命中该产品的政策条数`}
          source="engine"
          aside={
            goCredit ? (
              <button type="button" className="policy-link-button" onClick={goCredit}>
                去授信页 →
              </button>
            ) : null
          }
        >
          <ul className="policy-mix">
            {digest.bankingMix.map((item) => (
              <MixBar
                key={item.key}
                label={item.label}
                count={item.count}
                ratio={item.ratio}
                tone={item.count ? 'up' : 'watch'}
              />
            ))}
          </ul>
          <ul className="policy-digest-products">
            {digest.bankingMix
              .filter((item) => item.count > 0)
              .map((item) => (
                <li key={item.key}>
                  <b>{item.label}</b>
                  <span>{item.scene}</span>
                  <em>{item.audience}</em>
                </li>
              ))}
          </ul>
        </ModuleShell>
      </div>
    </section>
  );
}

// 副标题里的一句话级别构成，如「国家级 1 · 省级 1 · 地市级 5」。
function levelSummary(digest) {
  return digest.levelMix
    .filter((item) => item.count > 0)
    .map((item) => `${item.label} ${item.count}`)
    .join(' · ');
}
