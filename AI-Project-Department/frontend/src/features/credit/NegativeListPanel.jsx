import { useMemo, useState } from 'react';
import { WARNING_LEVELS } from './creditConfig';
import { buildProjectPool } from './projectCreditEngine';
import {
  NEGATIVE_LEVELS,
  NEGATIVE_SECTIONS,
  negativeSummary,
  scanNegativeHits,
} from './negativeList';

const PAGE_SIZE = 20;
const LEVEL_ORDER = ['deny', 'strict', 'watch'];

export default function NegativeListPanel({ data, industryLabel }) {
  const projects = useMemo(() => buildProjectPool(data.entries), [data]);
  const scan = useMemo(() => scanNegativeHits(data.entries, projects), [data, projects]);
  const summary = useMemo(() => negativeSummary(scan.items), [scan.items]);

  const [section, setSection] = useState('all');
  const [level, setLevel] = useState('all');
  const [activeItem, setActiveItem] = useState(null);
  const [hitKind, setHitKind] = useState('all');
  const [page, setPage] = useState(1);

  const items = useMemo(
    () =>
      scan.items.filter((item) => {
        if (section !== 'all' && item.section !== section) return false;
        if (level !== 'all' && item.level !== level) return false;
        return true;
      }),
    [scan.items, section, level],
  );

  const hits = useMemo(() => {
    const list = [];
    for (const item of scan.items) {
      if (activeItem && item.code !== activeItem) continue;
      for (const hit of item.hits) {
        if (hitKind !== 'all' && hit.kind !== hitKind) continue;
        list.push({
          ...hit,
          itemCode: item.code,
          itemName: item.name,
          level: item.level,
          action: item.action,
        });
      }
    }
    return list;
  }, [scan.items, activeItem, hitKind]);

  const totalPageCount = Math.max(1, Math.ceil(hits.length / PAGE_SIZE));
  const activePage = Math.min(page, totalPageCount);
  const pageRows = hits.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const activeItemMeta = activeItem ? scan.items.find((item) => item.code === activeItem) : null;

  const patchSection = (key) => {
    setSection(key);
    setPage(1);
  };
  const patchLevel = (key) => {
    setLevel(key);
    setPage(1);
  };

  return (
    <>
      <section className="credit-panel-box">
        <div className="credit-hero">
          <div>
            <h2>{industryLabel}授信负面清单</h2>
            <p className="muted">
              六类 {scan.items.length} 条禁入与限制准入规则 · 逐条标注判定口径、处置方式与依据 ·
              扫面对象为在链企业 {data.entries.length.toLocaleString()} 家、样本项目{' '}
              {projects.length} 个
            </p>
            <p className="muted">
              禁入类为一票否决，命中即不得准入；从严类须特别审批并补充增信；关注类可准入但须设定限额与前置条件。
              待核实信号不得直接否决，须由客户经理与风险经理复核后定性。
            </p>
          </div>
        </div>

        <div className="credit-kpis is-7">
          <KpiCard
            label="清单条目"
            value={scan.items.length}
            sub={`自动扫描 ${summary.autoCount} 条`}
          />
          <KpiCard label="禁入类" value={summary.counts.deny} sub="一票否决" tone="red" />
          <KpiCard label="从严类" value={summary.counts.strict} sub="特别审批/增信" tone="orange" />
          <KpiCard label="关注类" value={summary.counts.watch} sub="限额/前置条件" />
          <KpiCard
            label="命中企业"
            value={scan.companyHitCount.toLocaleString()}
            sub={`占在链企业 ${((scan.companyHitCount / Math.max(data.entries.length, 1)) * 100).toFixed(1)}%`}
            tone="orange"
          />
          <KpiCard
            label="命中项目"
            value={scan.projectHitCount}
            sub={`样本项目 ${projects.length} 个`}
          />
          <KpiCard
            label="累计命中条次"
            value={scan.totalHits.toLocaleString()}
            sub="同一对象可命中多条"
            tone="blue"
          />
        </div>

        <div className="credit-panels">
          <section className="credit-section">
            <h3>清单分类</h3>
            <p className="muted">点击分类筛选条目；同一企业可能同时命中多类条目</p>
            <div className="credit-warning-row">
              <button
                type="button"
                className={`credit-warning-chip ${section === 'all' ? 'active' : ''}`}
                onClick={() => patchSection('all')}
              >
                全部 {scan.items.length}
              </button>
              {NEGATIVE_SECTIONS.map((group) => {
                const groupItems = scan.items.filter((item) => item.section === group.key);
                const active = section === group.key;
                return (
                  <button
                    key={group.key}
                    type="button"
                    className={`credit-warning-chip ${active ? 'active' : ''}`}
                    title={group.desc}
                    onClick={() => patchSection(active ? 'all' : group.key)}
                  >
                    {group.key} {group.label} {groupItems.length}
                  </button>
                );
              })}
            </div>
            <div className="credit-warning-row credit-level-row">
              <button
                type="button"
                className={`credit-warning-chip ${level === 'all' ? 'active' : ''}`}
                onClick={() => patchLevel('all')}
              >
                全部等级
              </button>
              {LEVEL_ORDER.map((key) => {
                const meta = NEGATIVE_LEVELS[key];
                const active = level === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`credit-warning-chip ${active ? 'active' : ''}`}
                    style={{ borderColor: meta.color, color: meta.color }}
                    onClick={() => patchLevel(active ? 'all' : key)}
                  >
                    {meta.label} {summary.counts[key]}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </section>

      <section className="credit-panel-box credit-table-panel">
        <div className="credit-table-head">
          <h3>清单条目（{items.length} 条）</h3>
          <span className="muted">点击条目可查看其命中的企业与项目</span>
        </div>
        <div className="credit-table-wrap credit-negative-wrap">
          <table className="credit-table credit-negative-table">
            <thead>
              <tr>
                <th className="col-code">编号</th>
                <th className="col-level">等级</th>
                <th className="col-name">条目</th>
                <th className="col-rule">判定口径</th>
                <th className="col-action">处置</th>
                <th className="col-source">依据 / 数据来源</th>
                <th className="num col-hit">命中</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const meta = NEGATIVE_LEVELS[item.level];
                return (
                  <tr
                    key={item.code}
                    className={activeItem === item.code ? 'is-active' : ''}
                    onClick={() => {
                      setActiveItem(activeItem === item.code ? null : item.code);
                      setPage(1);
                    }}
                  >
                    <td className="col-code">{item.code}</td>
                    <td className="col-level">
                      <span
                        className="credit-negative-level"
                        style={{ color: meta.color, borderColor: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="col-name">
                      <b>{item.name}</b>
                      <div className="credit-negative-tags">
                        <span className="credit-tag mini">
                          {item.scope === 'project' ? '项目口径' : '企业口径'}
                        </span>
                        {item.auto ? (
                          <span className="credit-tag mini positive">可自动扫描</span>
                        ) : (
                          <span className="credit-tag mini warn">人工核查</span>
                        )}
                      </div>
                    </td>
                    <td className="col-rule">{item.rule}</td>
                    <td className="col-action">{item.action}</td>
                    <td className="col-source">
                      <div>{item.basis}</div>
                      <div className="muted">来源：{item.source}</div>
                    </td>
                    <td className="num col-hit">
                      {item.auto ? (
                        <b className={item.hitCount > 0 ? 'has-hit' : ''}>{item.hitCount}</b>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="credit-panel-box credit-table-panel">
        <div className="credit-table-head">
          <h3>
            命中清单{activeItemMeta ? ` · ${activeItemMeta.code} ${activeItemMeta.name}` : ''}
          </h3>
          <div className="credit-table-tools">
            {activeItemMeta && (
              <button type="button" className="ghost-button" onClick={() => setActiveItem(null)}>
                查看全部命中
              </button>
            )}
            <select
              className="credit-hit-select"
              value={hitKind}
              onChange={(event) => {
                setHitKind(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">全部对象</option>
              <option value="company">仅企业</option>
              <option value="project">仅项目</option>
            </select>
          </div>
        </div>

        <div className="credit-table-wrap">
          <table className="credit-table">
            <thead>
              <tr>
                <th>对象</th>
                <th>口径</th>
                <th>命中条目</th>
                <th>等级</th>
                <th>地区</th>
                <th>当前预警</th>
                <th>建议处置</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((hit) => {
                const meta = NEGATIVE_LEVELS[hit.level];
                return (
                  <tr key={`${hit.kind}-${hit.id}-${hit.itemCode}`}>
                    <td className="credit-company-cell">
                      <b>{hit.name}</b>
                      {hit.detail && <span className="muted"> {hit.detail}</span>}
                    </td>
                    <td>{hit.kind === 'project' ? `项目 · ${hit.meta}` : `企业 · ${hit.meta}`}</td>
                    <td>
                      {hit.itemCode} {hit.itemName}
                    </td>
                    <td>
                      <span
                        className="credit-negative-level"
                        style={{ color: meta.color, borderColor: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td>{hit.province === '未知' ? '待核' : hit.province}</td>
                    <td>
                      <span
                        className={`credit-warning-badge level-${hit.warningLevel}`}
                        style={{ color: WARNING_LEVELS[hit.warningLevel]?.color }}
                      >
                        {WARNING_LEVELS[hit.warningLevel]?.label}
                      </span>
                      {hit.pending && <span className="credit-tag mini warn">待核实</span>}
                    </td>
                    <td className="credit-negative-action">{hit.action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="credit-pagination">
          <span className="muted">
            共 {hits.length.toLocaleString()} 条命中记录 · 第 {activePage}/{totalPageCount} 页
          </span>
          <div className="credit-pagination-controls">
            <button
              type="button"
              disabled={activePage <= 1}
              onClick={() => setPage(activePage - 1)}
            >
              上一页
            </button>
            <span className="credit-pagination-page">{activePage}</span>
            <button
              type="button"
              disabled={activePage >= totalPageCount}
              onClick={() => setPage(activePage + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function KpiCard({ label, value, sub, tone }) {
  return (
    <div className={`credit-kpi ${tone ? `tone-${tone}` : ''}`}>
      <span className="credit-kpi-label">{label}</span>
      <b className="credit-kpi-value">{value}</b>
      <span className="credit-kpi-sub">{sub}</span>
    </div>
  );
}
