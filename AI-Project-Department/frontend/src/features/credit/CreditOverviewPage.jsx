import { useMemo, useState } from 'react';
import { chainPaletteFor } from '../../chainPalette';
import { WARNING_LEVELS } from './creditConfig';
import { formatWan } from './creditEngine';
import CreditProfileDrawer from './CreditProfileDrawer';
import CreditRulesModal from './CreditRulesModal';
import { useCreditData } from './useCreditData';
import './credit.css';

const CREDIT_INDUSTRY = '储能产业';

const DEFAULT_FILTERS = {
  chain: 'all',
  sector: 'all',
  region: 'all',
  listed: 'all',
  tier: 'all',
  grade: 'all',
  scoreRange: 'all',
  riskTag: 'all',
  warningLevel: 'all',
  query: '',
};

const SCORE_RANGES = [
  { key: 'all', label: '全部', test: () => true },
  { key: '90+', label: '90+', min: 90, max: 101 },
  { key: '80', label: '80-89', min: 80, max: 90 },
  { key: '70', label: '70-79', min: 70, max: 80 },
  { key: '60', label: '60-69', min: 60, max: 70 },
  { key: 'lt60', label: '<60', min: 0, max: 60 },
];

const SORT_FIELDS = [
  { key: 'total', label: '综合评分' },
  { key: 'revenue', label: '营收' },
  { key: 'netProfit', label: '净利润' },
  { key: 'operatingCashFlow', label: '经营现金流' },
  { key: 'debtRatio', label: '资产负债率' },
  { key: 'interestBearingDebt', label: '有息负债' },
  { key: 'accountsReceivable', label: '应收账款' },
  { key: 'inventory', label: '存货' },
  { key: 'limit', label: '建议额度' },
  { key: 'warning', label: '风险等级' },
];

const WARNING_RANK = { red: 5, orange: 4, yellow: 3, blue: 2, normal: 1 };
const PAGE_SIZE_OPTIONS = [20, 50, 100];

function metricOf(company, key) {
  return company.metrics?.[key] ?? (key === 'debtRatio' ? Infinity : -Infinity);
}

export default function CreditOverviewPage({ selectedIndustry }) {
  const { status, data, error } = useCreditData();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ key: 'total', dir: 'desc' });
  const [selectedId, setSelectedId] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [page, setPage] = useState(1);

  const chainOrder = useMemo(
    () => chainPaletteFor(CREDIT_INDUSTRY).map((group) => group.label),
    [],
  );

  const sectorOptions = useMemo(() => {
    if (!data) return [];
    const sectors = new Set();
    for (const entry of data.entries) {
      if (filters.chain !== 'all' && entry.company.chain !== filters.chain) continue;
      if (entry.company.sector) sectors.add(entry.company.sector);
    }
    return Array.from(sectors);
  }, [data, filters.chain]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const range = SCORE_RANGES.find((item) => item.key === filters.scoreRange) || SCORE_RANGES[0];
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
      if (filters.scoreRange !== 'all') {
        if (!evaluation || evaluation.total < range.min || evaluation.total >= range.max)
          return false;
      }
      if (
        filters.riskTag !== 'all' &&
        !evaluation?.riskTags.some((tag) => tag.key === filters.riskTag && tag.level !== 'positive')
      ) {
        return false;
      }
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
  const selectedCompany = data?.companiesById.get(selectedId) || null;

  if (selectedIndustry !== CREDIT_INDUSTRY) {
    return (
      <main className="credit-page">
        <div className="credit-empty-state">
          <h2>储能产业链智能授信</h2>
          <p>
            授信评价模块当前面向「储能产业」建设，请通过右上角产业链切换至储能产业后查看客户分层与授信分析。
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
              '请检查 public/data/credit/storage-credit-mock.json 是否存在，可运行 pnpm prepare:credit 重新生成。'}
          </p>
        </div>
      </main>
    );
  }

  const { overview } = data;

  return (
    <main className="credit-page">
      <section className="credit-panel-box">
        <div className="credit-hero">
          <div>
            <h2>储能产业客户授信分析</h2>
            <p className="muted">
              产业链地图 → 企业画像 → 六维评价 → 客户分层 → 授信策略 → 动态预警 · 数据生成于{' '}
              {data.generatedAt}
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
            sub={`均分 ${overview.avgScore}`}
          />
          <KpiCard label="第一层" value={overview.tierCounts[1]} sub="重点支持类" tone="green" />
          <KpiCard label="第二层" value={overview.tierCounts[2]} sub="条件支持类" tone="orange" />
          <KpiCard label="第三层" value={overview.tierCounts[3]} sub="严格准入类" tone="red" />
          <KpiCard
            label="待评价"
            value={overview.pendingCount.toLocaleString()}
            sub="待接入财务数据"
          />
          <KpiCard
            label="风险预警企业"
            value={(overview.warningCounts.orange + overview.warningCounts.red).toLocaleString()}
            sub={`其中高风险 ${overview.warningCounts.red}`}
            tone="red"
          />
          <KpiCard
            label="建议授信总额"
            value={`约 ${formatWan(overview.totalLimit)}`}
            sub="一票否决企业已降级"
            tone="blue"
          />
        </div>

        <div className="credit-panels">
          <div className="credit-col">
            <section className="credit-section">
              <h3>产业链 × 授信层级矩阵</h3>
              <p className="muted">点击格子筛选该环节对应层级的企业</p>
              <table className="credit-matrix">
                <thead>
                  <tr>
                    <th>产业链环节</th>
                    <th className="num">第一层</th>
                    <th className="num">第二层</th>
                    <th className="num">第三层</th>
                    <th className="num">合计</th>
                    <th className="num">建议授信</th>
                  </tr>
                </thead>
                <tbody>
                  {chainOrder.map((chain) => {
                    const bucket = overview.chains.find((item) => item.chain === chain);
                    if (!bucket) return null;
                    return (
                      <tr key={chain}>
                        <th>{chain}</th>
                        {[1, 2, 3].map((tier) => (
                          <td key={tier} className="num">
                            <button
                              type="button"
                              className="credit-matrix-cell"
                              onClick={() => patchFilter({ chain, tier: String(tier) })}
                            >
                              {bucket.tiers[tier]}
                            </button>
                          </td>
                        ))}
                        <td className="num strong">{bucket.total}</td>
                        <td className="num">{formatWan(bucket.limit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="credit-section credit-section-stack">
              <h3>风险标签分析</h3>
              <p className="muted">统计 ⚠ 类标签，点击反向筛选企业</p>
              <div className="credit-bars">
                {overview.riskTags.slice(0, 10).map((tag) => (
                  <button
                    key={tag.key}
                    type="button"
                    className={`credit-bar-row ${filters.riskTag === tag.key ? 'active' : ''}`}
                    onClick={() =>
                      patchFilter({ riskTag: filters.riskTag === tag.key ? 'all' : tag.key })
                    }
                  >
                    <span className="credit-bar-label wide">{tag.label}</span>
                    <span className="credit-bar-track">
                      <span
                        className="credit-bar-fill risk"
                        style={{ width: `${(tag.count / overview.riskTags[0].count) * 100}%` }}
                      />
                    </span>
                    <span className="credit-bar-value">{tag.count}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="credit-col">
            <section className="credit-section">
              <h3>客户评分分布</h3>
              <p className="muted">点击区间筛选企业</p>
              <div className="credit-bars">
                {overview.scoreDist.map((bucket) => (
                  <button
                    key={bucket.key}
                    type="button"
                    className={`credit-bar-row ${filters.scoreRange === bucket.key ? 'active' : ''}`}
                    onClick={() =>
                      patchFilter({
                        scoreRange: filters.scoreRange === bucket.key ? 'all' : bucket.key,
                      })
                    }
                  >
                    <span className="credit-bar-label">{bucket.label}</span>
                    <span className="credit-bar-track">
                      <span
                        className="credit-bar-fill"
                        style={{
                          width: `${(bucket.count / Math.max(overview.evaluatedCount, 1)) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="credit-bar-value">{bucket.count}</span>
                  </button>
                ))}
              </div>
              <h3 className="credit-panel-sub">预警等级分布</h3>
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
              <h3 className="credit-panel-sub">地区分布 Top 8</h3>
              <div className="credit-region-list">
                {overview.regions.slice(0, 8).map((region) => (
                  <button
                    key={region.province}
                    type="button"
                    className={`credit-bar-row ${filters.region === region.province ? 'active' : ''}`}
                    onClick={() =>
                      patchFilter({
                        region: filters.region === region.province ? 'all' : region.province,
                      })
                    }
                  >
                    <span className="credit-bar-label">{region.province}</span>
                    <span className="credit-bar-track">
                      <span
                        className="credit-bar-fill region"
                        style={{ width: `${(region.count / overview.regions[0].count) * 100}%` }}
                      />
                    </span>
                    <span className="credit-bar-value">{region.count}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
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
                <th className="num">评分</th>
                <th>层级</th>
                <th>评级</th>
                <th>预警</th>
                <th>主要风险标签</th>
                <th className="num">建议额度</th>
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
                  <td>{evaluation ? evaluation.grade : '—'}</td>
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

      <CreditRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

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
      />
    </main>
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
