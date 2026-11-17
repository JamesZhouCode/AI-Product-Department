import { useMemo, useState } from 'react';
import { chainPaletteFor } from '../../chainPalette';
import { WARNING_LEVELS } from './creditConfig';
import { formatWan } from './creditEngine';
import CreditProfileDrawer from './CreditProfileDrawer';
import CreditRulesModal from './CreditRulesModal';
import NegativeListPanel from './NegativeListPanel';
import ProjectCreditPanel from './ProjectCreditPanel';
import { creditDataFileFor, useCreditData } from './useCreditData';
import './credit.css';

// 已建成独立授信数据的一级链。
const CREDIT_INDUSTRIES = ['集成电路', '储能产业', '算力产业'];
// 已建成「客户授信 / 项目授信 / 负面清单」三模块的产业链。
const DECISION_TAB_INDUSTRIES = ['算力产业'];

const DECISION_TABS = [
  { key: 'customer', label: '客户授信分析' },
  { key: 'project', label: '项目授信分析' },
  { key: 'negative', label: '负面清单' },
];

const DEFAULT_FILTERS = {
  chain: 'all',
  sector: 'all',
  region: 'all',
  listed: 'all',
  tier: 'all',
  grade: 'all',
  valueLevel: 'all',
  creditLevel: 'all',
  warningLevel: 'all',
  query: '',
};

const SORT_FIELDS = [
  { key: 'total', label: '综合评分' },
  { key: 'value', label: '经营价值' },
  { key: 'credit', label: '信用适配' },
  { key: 'revenue', label: '营收' },
  { key: 'netProfit', label: '净利润' },
  { key: 'operatingCashFlow', label: '经营现金流' },
  { key: 'debtRatio', label: '资产负债率' },
  { key: 'interestBearingDebt', label: '有息负债' },
  { key: 'accountsReceivable', label: '应收账款' },
  { key: 'inventory', label: '存货' },
  { key: 'limit', label: '参考额度' },
  { key: 'warning', label: '风险等级' },
];

const WARNING_RANK = { red: 5, orange: 4, yellow: 3, blue: 2, normal: 1 };
const PAGE_SIZE_OPTIONS = [20, 50, 100];

function metricOf(company, key) {
  return company.metrics?.[key] ?? (key === 'debtRatio' ? Infinity : -Infinity);
}

export default function CreditOverviewPage({ selectedIndustry, followed }) {
  const { status, data, error } = useCreditData(selectedIndustry);
  const [tab, setTab] = useState('customer');
  const hasDecisionTabs = DECISION_TAB_INDUSTRIES.includes(selectedIndustry);
  const activeTab = hasDecisionTabs ? tab : 'customer';
  const industryLabel = data?.raw?.industryLabel || selectedIndustry;

  if (!CREDIT_INDUSTRIES.includes(selectedIndustry)) {
    return (
      <main className="credit-page">
        <div className="credit-empty-state">
          <h2>产业链智能授信</h2>
          <p>
            授信评价模块当前已完成
            {CREDIT_INDUSTRIES.map((name) => `「${name}」`).join('')}
            建设，请通过右上角产业链切换至对应产业后查看客户分层与授信分析。
          </p>
        </div>
      </main>
    );
  }
  if (status === 'loading') {
    return (
      <main className="credit-page">
        <div className="credit-empty-state">授信评价数据加载中…</div>
      </main>
    );
  }
  if (status === 'error') {
    return (
      <main className="credit-page">
        <div className="credit-empty-state error">
          <h2>授信数据加载失败</h2>
          <p>
            {error?.message ||
              `请检查 public/${creditDataFileFor(selectedIndustry)} 是否存在，可运行 pnpm prepare:credit 重新生成。`}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={`credit-page ${hasDecisionTabs ? 'has-tabs' : ''}`}>
      {hasDecisionTabs && (
        <div className="credit-tabs" role="tablist" aria-label={`${industryLabel}授信决策`}>
          {DECISION_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={activeTab === item.key}
              className={`credit-tab ${activeTab === item.key ? 'is-active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
          <span className="credit-tabs-note muted">
            客户准入 · 项目准入 · 负面清单 —— 授信管理的三个前置关口
          </span>
        </div>
      )}

      {activeTab === 'customer' && (
        <CustomerCreditTab data={data} selectedIndustry={selectedIndustry} followed={followed} />
      )}
      {activeTab === 'project' && <ProjectCreditPanel data={data} industryLabel={industryLabel} />}
      {activeTab === 'negative' && <NegativeListPanel data={data} industryLabel={industryLabel} />}
    </main>
  );
}

function CustomerCreditTab({ data, selectedIndustry, followed }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ key: 'total', dir: 'desc' });
  const [selectedId, setSelectedId] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [page, setPage] = useState(1);

  const chainOrder = useMemo(
    () => chainPaletteFor(selectedIndustry).map((group) => group.label),
    [selectedIndustry],
  );

  const sectorOptions = useMemo(() => {
    const sectors = new Set();
    for (const entry of data.entries) {
      if (filters.chain !== 'all' && entry.company.chain !== filters.chain) continue;
      if (entry.company.sector) sectors.add(entry.company.sector);
    }
    return Array.from(sectors);
  }, [data, filters.chain]);

  const filtered = useMemo(() => {
    const query = filters.query.trim();
    return data.entries.filter(({ company, evaluation }) => {
      if (filters.chain !== 'all' && company.chain !== filters.chain) return false;
      if (filters.sector !== 'all' && company.sector !== filters.sector) return false;
      if (filters.region !== 'all' && (company.region?.province || '未知') !== filters.region)
        return false;
      if (filters.listed === 'listed' && !company.listed) return false;
      if (filters.listed === 'nonListed' && company.listed) return false;
      if (filters.tier !== 'all') {
        if (!evaluation || String(evaluation.tier) !== filters.tier) return false;
      }
      if (filters.grade !== 'all' && evaluation?.grade !== filters.grade) return false;
      if (filters.valueLevel !== 'all' && evaluation?.valueLevel.key !== filters.valueLevel)
        return false;
      if (filters.creditLevel !== 'all' && evaluation?.creditLevel.key !== filters.creditLevel)
        return false;
      if (filters.warningLevel !== 'all' && evaluation?.warningLevel !== filters.warningLevel)
        return false;
      if (query && !company.name.includes(query) && !(company.stockShort || '').includes(query))
        return false;
      return true;
    });
  }, [data, filters]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const valueFor = (entry) => {
      const { company, evaluation } = entry;
      switch (sort.key) {
        case 'total':
          return evaluation?.total ?? -1;
        case 'value':
          return evaluation?.value.score ?? -1;
        case 'credit':
          return evaluation?.credit.score ?? -1;
        case 'limit':
          return evaluation?.creditLimit.amount ?? -1;
        case 'warning':
          return WARNING_RANK[evaluation?.warningLevel] ?? 0;
        case 'revenue':
        case 'netProfit':
        case 'operatingCashFlow':
        case 'debtRatio':
        case 'interestBearingDebt':
        case 'accountsReceivable':
        case 'inventory':
          return company.metrics ? metricOf(company, sort.key) : -Infinity;
        default:
          return 0;
      }
    };
    return [...filtered].sort((a, b) => (valueFor(a) - valueFor(b)) * dir);
  }, [filtered, sort]);

  const totalPageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const activePage = Math.min(page, totalPageCount);
  const pageEntries = sorted.slice((activePage - 1) * pageSize, activePage * pageSize);

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
  const selectedCompany = data.companiesById.get(selectedId) || null;

  const { overview } = data;

  return (
    <>
      <section className="credit-panel-box">
        <div className="credit-hero">
          <div>
            <h2>{data.raw?.industryLabel || selectedIndustry}客户授信分析</h2>
            <p className="muted">
              产业链地图 → 企业画像 → 八维评价 → 经营价值 × 信用风险双评价 → 参考分层与预警 ·
              数据生成于 {data.generatedAt}
            </p>
            <p className="muted">
              客户分层、评级与额度为参考值，不构成授信审批结论；经营价值评价不得替代信用审查。
            </p>
          </div>
          <button type="button" className="credit-rules-button" onClick={() => setRulesOpen(true)}>
            ⓘ AI评分规则说明
          </button>
        </div>

        <div className="credit-kpis">
          <KpiCard
            label="企业总数"
            value={overview.totalCompanies.toLocaleString()}
            sub="客户清单入库口径"
          />
          <KpiCard
            label="已评价企业"
            value={overview.evaluatedCount.toLocaleString()}
            sub={`综合均分 ${overview.avgScore}`}
          />
          <KpiCard
            label="经营价值均分"
            value={overview.avgValue}
            sub={`优先关注 ${overview.valueCounts.A} 家`}
            tone="green"
          />
          <KpiCard
            label="信用适配均分"
            value={overview.avgCredit}
            sub={`可准入 ${overview.creditCounts.pass} 家`}
            tone="blue"
          />
          <KpiCard
            label="参考第一层"
            value={overview.tierCounts[1]}
            sub="重点支持类（参考）"
            tone="green"
          />
          <KpiCard
            label="参考第二层"
            value={overview.tierCounts[2]}
            sub="条件支持类（参考）"
            tone="orange"
          />
          <KpiCard
            label="参考第三层"
            value={overview.tierCounts[3]}
            sub="严格准入类（参考）"
            tone="red"
          />
          <KpiCard
            label="风险预警企业"
            value={(overview.warningCounts.orange + overview.warningCounts.red).toLocaleString()}
            sub={`高风险 ${overview.warningCounts.red} · 待核实红线 ${overview.pendingRedlineCount}`}
            tone="red"
          />
        </div>

        <div className="credit-panels">
          <section className="credit-section">
            <h3>预警等级分布</h3>
            <p className="muted">点击档位筛选企业 · 等级由红线项与扣分项聚合得出</p>
            <div className="credit-warning-row">
              {Object.entries(WARNING_LEVELS).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  className={`credit-warning-chip level-${key} ${filters.warningLevel === key ? 'active' : ''}`}
                  style={{ borderColor: meta.color, color: meta.color }}
                  onClick={() =>
                    patchFilter({ warningLevel: filters.warningLevel === key ? 'all' : key })
                  }
                >
                  {meta.label} {overview.warningCounts[key]}
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="credit-panel-box credit-table-panel">
        <div className="credit-table-head">
          <h3>客户清单</h3>
          <div className="credit-table-tools">
            <input
              type="search"
              placeholder="搜索企业名称 / 证券简称"
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
            value={filters.chain}
            onChange={(event) => patchFilter({ chain: event.target.value, sector: 'all' })}
          >
            <option value="all">全部产业链环节</option>
            {chainOrder.map((chain) => (
              <option key={chain} value={chain}>
                {chain}
              </option>
            ))}
          </select>
          <select
            value={filters.sector}
            onChange={(event) => patchFilter({ sector: event.target.value })}
          >
            <option value="all">全部三级环节</option>
            {sectorOptions.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
          <select
            value={filters.region}
            onChange={(event) => patchFilter({ region: event.target.value })}
          >
            <option value="all">全部地区</option>
            {overview.regions.map((region) => (
              <option key={region.province} value={region.province}>
                {region.province}
              </option>
            ))}
          </select>
          <select
            value={filters.listed}
            onChange={(event) => patchFilter({ listed: event.target.value })}
          >
            <option value="all">上市 + 非上市</option>
            <option value="listed">仅上市企业</option>
            <option value="nonListed">仅非上市企业</option>
          </select>
          <select
            value={filters.tier}
            onChange={(event) => patchFilter({ tier: event.target.value })}
          >
            <option value="all">全部层级</option>
            <option value="1">第一层 · 重点支持</option>
            <option value="2">第二层 · 条件支持</option>
            <option value="3">第三层 · 严格准入</option>
          </select>
          <select
            value={filters.grade}
            onChange={(event) => patchFilter({ grade: event.target.value })}
          >
            <option value="all">全部评级</option>
            {['S', 'A', 'B', 'C+', 'C'].map((grade) => (
              <option key={grade} value={grade}>
                {grade} 级
              </option>
            ))}
          </select>
          <select
            value={filters.valueLevel}
            onChange={(event) => patchFilter({ valueLevel: event.target.value })}
          >
            <option value="all">全部经营价值</option>
            {overview.valueDist.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {bucket.label}
              </option>
            ))}
          </select>
          <select
            value={filters.creditLevel}
            onChange={(event) => patchFilter({ creditLevel: event.target.value })}
          >
            <option value="all">全部信用适配</option>
            {overview.creditDist.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {bucket.label}
              </option>
            ))}
          </select>
        </div>
        <div className="credit-sort-row">
          <span className="muted">排序：</span>
          {SORT_FIELDS.map((field) => (
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
                <th>企业名称</th>
                <th>产业链环节</th>
                <th>地区</th>
                <th>上市</th>
                <th className="num">综合</th>
                <th>经营价值</th>
                <th>信用适配</th>
                <th>参考层级</th>
                <th>预警</th>
                <th>主要风险标签</th>
                <th className="num">参考额度</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map(({ company, evaluation }) => (
                <tr key={company.id} onClick={() => setSelectedId(company.id)}>
                  <td className="credit-company-cell">
                    <b>{company.name}</b>
                    {company.stockShort && <span className="muted"> {company.stockShort}</span>}
                  </td>
                  <td>{company.chain}</td>
                  <td>{company.region?.province || '—'}</td>
                  <td>{company.listed ? '上市' : '—'}</td>
                  <td className="num">{evaluation ? evaluation.total : '待评价'}</td>
                  <td>
                    {evaluation ? (
                      <span className={`credit-eval-chip lv-${evaluation.valueLevel.key}`}>
                        {evaluation.valueLevel.label} {evaluation.value.score}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {evaluation ? (
                      <span className={`credit-eval-chip lv-${evaluation.creditLevel.key}`}>
                        {evaluation.creditLevel.label} {evaluation.credit.score}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {evaluation ? (
                      <span
                        className="credit-tier-chip"
                        style={{ color: WARNING_LEVELS.none?.color }}
                      >
                        <i
                          className="tier-dot"
                          style={{
                            background: ['#168d69', '#ed861d', '#c23b37'][evaluation.tier - 1],
                          }}
                        />
                        {['第一层', '第二层', '第三层'][evaluation.tier - 1]}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {evaluation ? (
                      <span className={`credit-warning-badge level-${evaluation.warningLevel}`}>
                        {evaluation.warningLabel}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="credit-risk-cell">
                    {evaluation
                      ? evaluation.riskTags
                          .filter((tag) => tag.level !== 'positive')
                          .slice(0, 2)
                          .map((tag) => (
                            <span key={tag.key} className={`credit-tag mini ${tag.level}`}>
                              {tag.label}
                            </span>
                          ))
                      : '—'}
                  </td>
                  <td className="num">
                    {evaluation ? formatWan(evaluation.creditLimit.amount) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="credit-pagination">
          <span className="muted">
            共 {filtered.length.toLocaleString()} 家 · 第 {activePage}/{totalPageCount} 页 ·
            点击任意行查看企业授信画像
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
              家
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

      <CreditRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        industryLabel={data.raw?.industryLabel || selectedIndustry}
      />

      <CreditProfileDrawer
        company={selectedCompany}
        evaluation={
          selectedCompany
            ? data.entries.find((entry) => entry.company.id === selectedCompany.id)?.evaluation
            : null
        }
        companiesById={data.companiesById}
        relations={data.relations}
        onClose={() => setSelectedId(null)}
        onSelectCompany={setSelectedId}
        follow={
          followed
            ? {
                followed: followed.has(selectedCompany),
                onToggle: () => followed.toggle(selectedCompany),
              }
            : undefined
        }
      />
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
