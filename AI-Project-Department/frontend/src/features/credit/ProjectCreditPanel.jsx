import { useMemo, useState } from 'react';
import { formatWan } from './creditEngine';
import ProjectRulesModal from './ProjectRulesModal';
import {
  CONCLUSIONS,
  PROJECT_SCORECARD,
  PROJECT_TYPE_LIST,
  buildProjectOverview,
  buildProjectPool,
  projectAmount,
} from './projectCreditEngine';

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const SORTS = [
  { key: 'investment', label: '总投资' },
  { key: 'loan', label: '申请授信' },
  { key: 'dscr', label: 'DSCR' },
  { key: 'total', label: '综合分' },
  { key: 'capitalRatio', label: '资本金比例' },
];

const DEFAULT_FILTERS = { type: 'all', region: 'all', conclusion: 'all', query: '' };

const CONCLUSION_ORDER = ['support', 'prudent', 'strict', 'deny'];

function conclusionChip(project) {
  const meta = CONCLUSIONS[project.conclusion];
  return (
    <span
      className="credit-conclusion-chip"
      style={{ color: meta.color, borderColor: meta.color }}
      title={project.conclusionLabel}
    >
      {meta.label}
    </span>
  );
}

export default function ProjectCreditPanel({ data, industryLabel }) {
  const projects = useMemo(() => buildProjectPool(data.entries), [data]);
  const overview = useMemo(() => buildProjectOverview(projects), [projects]);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ key: 'investment', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedId, setSelectedId] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = filters.query.trim();
    return projects.filter((project) => {
      if (filters.type !== 'all' && project.type !== filters.type) return false;
      if (filters.region !== 'all' && project.province !== filters.region) return false;
      if (filters.conclusion !== 'all' && project.conclusion !== filters.conclusion) return false;
      if (query && !project.name.includes(query) && !project.owner.includes(query)) return false;
      return true;
    });
  }, [projects, filters]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => (a[sort.key] - b[sort.key]) * dir);
  }, [filtered, sort]);

  const totalPageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const activePage = Math.min(page, totalPageCount);
  const pageRows = sorted.slice((activePage - 1) * pageSize, activePage * pageSize);
  const selected = projects.find((project) => project.id === selectedId) || null;

  const patchFilter = (patch) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };
  const toggleSort = (key) => {
    setPage(1);
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' },
    );
  };

  const regions = useMemo(
    () => Array.from(new Set(projects.map((project) => project.province))).sort(),
    [projects],
  );

  return (
    <>
      <section className="credit-panel-box">
        <div className="credit-hero">
          <div>
            <h2>{industryLabel}项目授信分析</h2>
            <p className="muted">
              项目池 → 合规要素 → 需求消纳 → 现金流与 DSCR → 技术与主体增信 → 分档结论与建议额度 ·
              样本生成于 {data.generatedAt}
            </p>
            <p className="muted">
              项目名称为按在链主体与区域参数推演的样本，投资额、DSCR、租约锁定率等为测算值，
              仅用于验证评价流程，不作为真实项目信息；实际评审须以备案、可研、租约与能耗指标替换。
            </p>
          </div>
          <button type="button" className="credit-rules-button" onClick={() => setRulesOpen(true)}>
            ⓘ AI评分规则说明
          </button>
        </div>

        <div className="credit-kpis">
          <KpiCard label="项目总数" value={overview.total} sub="在链主体可承做项目池" />
          <KpiCard
            label="项目总投资"
            value={projectAmount(overview.investment)}
            sub="样本测算口径"
          />
          <KpiCard label="申请授信" value={projectAmount(overview.loan)} sub="按资本金比例倒算" />
          <KpiCard
            label="建议授信额度"
            value={projectAmount(overview.suggested)}
            sub={`覆盖 ${overview.conclusionCounts.support} 个项目`}
            tone="blue"
          />
          <KpiCard
            label="可支持"
            value={overview.conclusionCounts.support}
            sub="要素齐备 · 分≥78 · DSCR≥1.3"
            tone="green"
          />
          <KpiCard
            label="审慎支持"
            value={overview.conclusionCounts.prudent}
            sub="附条件、压降额度"
            tone="orange"
          />
          <KpiCard
            label="从严 / 不予准入"
            value={overview.conclusionCounts.strict + overview.conclusionCounts.deny}
            sub={`不予准入 ${overview.conclusionCounts.deny} 个`}
            tone="red"
          />
          <KpiCard
            label="平均 DSCR"
            value={overview.avgDscr}
            sub={`平均资本金 ${overview.avgCapitalRatio}%`}
          />
        </div>

        <div className="credit-panels credit-project-panels">
          <section className="credit-section">
            <h3>项目类型结构</h3>
            <p className="muted">按总投资排序 · 柱长表示该类型投资占全部样本的比重</p>
            <div className="credit-type-bars">
              {overview.typeStats.map((type) => {
                const ratio = overview.investment
                  ? Math.max(3, Math.round((type.investment / overview.investment) * 100))
                  : 0;
                return (
                  <button
                    key={type.key}
                    type="button"
                    className={`credit-type-bar ${filters.type === type.key ? 'active' : ''}`}
                    onClick={() =>
                      patchFilter({ type: filters.type === type.key ? 'all' : type.key })
                    }
                  >
                    <span className="credit-type-name">{type.label}</span>
                    <span className="credit-type-track">
                      <i style={{ width: `${ratio}%`, background: type.color }} />
                    </span>
                    <span className="credit-type-meta">
                      {type.count} 个 · {formatWan(type.investment)} · 均分 {type.avgScore}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="credit-section">
            <h3>结论分布与合规缺口</h3>
            <p className="muted">
              结论由合规红线、综合分与 DSCR 三重条件判定；缺口为待补件与缺失合计
            </p>
            <div className="credit-warning-row">
              {CONCLUSION_ORDER.map((key) => {
                const meta = CONCLUSIONS[key];
                const active = filters.conclusion === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`credit-warning-chip ${active ? 'active' : ''}`}
                    style={{ borderColor: meta.color, color: meta.color }}
                    onClick={() => patchFilter({ conclusion: active ? 'all' : key })}
                  >
                    {meta.label} {overview.conclusionCounts[key]}
                  </button>
                );
              })}
            </div>
            <div className="credit-gap-grid">
              {[
                ['filing', '备案/核准'],
                ['energy', '能耗指标'],
                ['land', '用地/机房'],
                ['efficiency', '能效/环保'],
              ].map(([key, label]) => (
                <div key={key} className="credit-gap-cell">
                  <span>{label}缺口</span>
                  <b className={overview.gaps[key] > 0 ? 'has-gap' : ''}>{overview.gaps[key]}</b>
                  <em>个项目待补</em>
                </div>
              ))}
            </div>
            <div className="credit-scorecard-row">
              {PROJECT_SCORECARD.map((dim) => (
                <span key={dim.key} className="credit-scorecard-chip">
                  {dim.label} <b>{dim.max}</b>
                </span>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="credit-panel-box credit-table-panel">
        <div className="credit-table-head">
          <h3>项目清单</h3>
          <div className="credit-table-tools">
            <input
              type="search"
              placeholder="搜索项目 / 业主名称"
              value={filters.query}
              onChange={(event) => patchFilter({ query: event.target.value })}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              重置筛选
            </button>
          </div>
        </div>

        <div className="credit-filters">
          <select
            value={filters.type}
            onChange={(event) => patchFilter({ type: event.target.value })}
          >
            <option value="all">全部项目类型</option>
            {PROJECT_TYPE_LIST.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
          <select
            value={filters.region}
            onChange={(event) => patchFilter({ region: event.target.value })}
          >
            <option value="all">全部地区</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region === '未知' ? '区域待核' : region}
              </option>
            ))}
          </select>
          <select
            value={filters.conclusion}
            onChange={(event) => patchFilter({ conclusion: event.target.value })}
          >
            <option value="all">全部结论</option>
            {CONCLUSION_ORDER.map((key) => (
              <option key={key} value={key}>
                {CONCLUSIONS[key].label}
              </option>
            ))}
          </select>
        </div>

        <div className="credit-sort-row">
          <span className="muted">排序：</span>
          {SORTS.map((field) => (
            <button
              key={field.key}
              type="button"
              className={`credit-sort-chip ${sort.key === field.key ? 'active' : ''}`}
              onClick={() => toggleSort(field.key)}
            >
              {field.label}
              {sort.key === field.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </button>
          ))}
        </div>

        <div className="credit-table-wrap">
          <table className="credit-table">
            <thead>
              <tr>
                <th>项目名称</th>
                <th>业主</th>
                <th>项目类型</th>
                <th>地区</th>
                <th className="num">总投资</th>
                <th className="num">申请授信</th>
                <th className="num">资本金</th>
                <th className="num">DSCR</th>
                <th className="num">综合分</th>
                <th>结论</th>
                <th>主要风险</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((project) => (
                <tr key={project.id} onClick={() => setSelectedId(project.id)}>
                  <td className="credit-company-cell">
                    <b>{project.name}</b>
                    <span className="muted"> {project.year} 年</span>
                  </td>
                  <td>
                    {project.ownerShort}
                    {project.ownerTier !== '—' && (
                      <span className="muted"> {project.ownerTier}</span>
                    )}
                  </td>
                  <td>{project.typeShort}</td>
                  <td>{project.province === '未知' ? '待核' : project.province}</td>
                  <td className="num">{projectAmount(project.investment)}</td>
                  <td className="num">{projectAmount(project.loan)}</td>
                  <td className="num">{(project.capitalRatio * 100).toFixed(0)}%</td>
                  <td className="num">{project.dscr.toFixed(2)}</td>
                  <td className="num">{project.total}</td>
                  <td>{conclusionChip(project)}</td>
                  <td className="credit-risk-cell">
                    {project.flags.slice(0, 2).map((flag) => (
                      <span key={flag} className="credit-tag mini warn">
                        {flag}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="credit-pagination">
          <span className="muted">
            共 {filtered.length} 个项目 · 第 {activePage}/{totalPageCount} 页 ·
            点击任意行查看项目授信测算详情
          </span>
          <div className="credit-pagination-controls">
            <label>
              每页
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              个
            </label>
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

      {selected && <ProjectDetailModal project={selected} onClose={() => setSelectedId(null)} />}
      <ProjectRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        industryLabel={industryLabel}
      />
    </>
  );
}

function ProjectDetailModal({ project, onClose }) {
  const meta = CONCLUSIONS[project.conclusion];
  return (
    <div className="credit-modal-overlay" role="dialog" aria-modal="true">
      <div className="credit-modal">
        <div className="credit-modal-head">
          <div>
            <h2>{project.name}</h2>
            <p className="muted">
              {project.owner} · {project.typeLabel} · {project.province}（{project.regionNote}）
            </p>
          </div>
          <button type="button" className="credit-modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="credit-modal-body">
          <div className="credit-project-facts">
            {[
              ['项目总投资', projectAmount(project.investment)],
              [
                '资本金比例',
                `${(project.capitalRatio * 100).toFixed(0)}%（${formatWan(project.capitalAmount)}）`,
              ],
              ['申请授信', projectAmount(project.loan)],
              ['建议额度', projectAmount(project.suggested)],
              ['贷款期限', `${project.tenor} 年`],
              ['建设期', `${project.buildMonths} 个月`],
              ['IT 负载', project.itLoadMW ? `${project.itLoadMW} MW` : '—'],
              ['PUE', project.pue ?? '—'],
              ['达产年收入', projectAmount(project.stabilizedRevenue)],
              ['达产年 EBITDA', projectAmount(project.ebitda)],
              ['测算 DSCR', project.dscr.toFixed(2)],
              ['项目 IRR', `${(project.irr * 100).toFixed(1)}%`],
              ['客户锁定率', `${(project.anchoredRate * 100).toFixed(0)}%`],
              ['稳定期上架率', `${(project.utilization * 100).toFixed(0)}%`],
              ['爬坡期', `${project.rampMonths} 个月`],
              ['主体评分', `${project.subjectScore} 分`],
            ].map(([label, value]) => (
              <div key={label} className="credit-project-fact">
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          </div>

          <h3 className="credit-detail-title">五维评分（{project.total}/100）</h3>
          <div className="credit-dim-bars">
            {PROJECT_SCORECARD.map((dim) => {
              const value = project.dimensions[dim.key];
              const ratio = Math.round((value.score / value.max) * 100);
              return (
                <div key={dim.key} className="credit-dim-bar">
                  <span className="credit-dim-name">{dim.label}</span>
                  <span className="credit-dim-track">
                    <i
                      style={{
                        width: `${Math.max(2, ratio)}%`,
                        background: ratio >= 80 ? '#168d69' : ratio >= 60 ? '#ed861d' : '#c23b37',
                      }}
                    />
                  </span>
                  <b>
                    {value.score.toFixed(1)}/{value.max}
                  </b>
                </div>
              );
            })}
          </div>

          <h3 className="credit-detail-title">合规与要素校验</h3>
          <div className="credit-compliance-list">
            {[
              ['项目备案/核准', project.compliance.filing],
              ['能耗与绿电指标', project.compliance.energy],
              ['用地/机房权属与消防', project.compliance.land],
              [project.pue ? '能效 PUE' : '环保验收', project.compliance.efficiency],
            ].map(([label, item]) => (
              <div key={label} className={`credit-compliance-item status-${item.status}`}>
                <span className="credit-compliance-label">{label}</span>
                <span className="credit-compliance-status">{item.label}</span>
                <span className="credit-compliance-note">{item.note}</span>
              </div>
            ))}
          </div>

          <h3 className="credit-detail-title">结论与授信建议</h3>
          <p
            className={`credit-project-verdict tone-${meta.tone}`}
            style={{ borderColor: meta.color }}
          >
            <b style={{ color: meta.color }}>{meta.label}</b>
            {project.conclusion === 'support' &&
              '：要素与现金流均满足准入要求，可按建议额度分笔投放，提款与上架率、租约签署进度挂钩。'}
            {project.conclusion === 'prudent' &&
              '：主体与项目基本可行但存在短板，须压降额度、追加增信或延长贷款期限后报批。'}
            {project.conclusion === 'strict' &&
              '：合规要素、现金流覆盖或主体资质存在明显缺陷，原则上仅受理低风险业务并设置退出预案。'}
            {project.conclusion === 'deny' &&
              '：触发禁入类负面清单条目，不得准入；待整改并重新取得备案/权属文件后方可复评。'}
          </p>

          {project.flags.length > 0 && (
            <div className="credit-project-flags">
              {project.flags.map((flag) => (
                <span key={flag} className="credit-tag mini risk">
                  {flag}
                </span>
              ))}
            </div>
          )}

          <p className="credit-rule-disclaimer">
            项目现金流与额度为按行业参数与主体指标推演的测算值，不构成授信承诺；
            实际审批须以可研报告、租约、能耗指标与担保文件为准。
          </p>
        </div>
      </div>
    </div>
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
