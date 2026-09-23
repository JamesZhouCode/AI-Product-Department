import { useEffect, useMemo, useState } from 'react';
import { WARNING_LEVELS } from './creditConfig';
import { buildCompanyChainView, formatYuan, formatWan } from './creditEngine';
import { CreditRadarChart, CreditTrendChart } from './creditCharts';
import SourceBadge, { SourcePopover } from './SourceBadge';
import { SOURCE_META } from './creditSources';

const TABS = [
  ['overview', '企业概况'],
  ['operation', '经营能力'],
  ['financial', '财务偿债'],
  ['chain', '产业链关系'],
  ['technology', '技术与产品'],
  ['risk', '风险与授信建议'],
];

// 雷达图六维标签 → 溯源口径：维度分数由该维度的输入指标计算得出。
const DIM_SOURCE_KEY = {
  chain: 'aiScore',
  operation: 'aiOperation',
  financial: 'aiFinancial',
  technology: 'aiTechnology',
  trade: 'aiTrade',
  governance: 'aiGovernance',
};

const percent = (value, digits = 1) => `${((value ?? 0) * 100).toFixed(digits)}%`;
const ratio = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—');

function KvGrid({ items }) {
  return (
    <dl className="credit-kv-grid">
      {items.map((item) => {
        const [label, value, sourceKey] = item;
        return (
          <div key={label} className="credit-kv">
            <dt>{label}</dt>
            <dd className="credit-kv-dd">
              <span>{value ?? '—'}</span>
              {sourceKey && <SourceBadge sourceKey={sourceKey} />}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function StatusChip({ level }) {
  const meta = { normal: ['正常', 'ok'], watch: ['关注', 'warn'], risk: ['风险', 'risk'] }[
    level
  ] || ['—', ''];
  return <span className={`credit-status-chip ${meta[1]}`}>{meta[0]}</span>;
}

function FinancialRow({ label, value, hint, level, sourceKey }) {
  return (
    <div className="credit-fin-row">
      <div className="credit-fin-main">
        <span className="credit-fin-label">
          {label}
          {sourceKey && <SourceBadge sourceKey={sourceKey} />}
        </span>
        <span className="credit-fin-hint">{hint}</span>
      </div>
      <div className="credit-fin-side">
        <span className="credit-fin-value">{value}</span>
        <StatusChip level={level} />
      </div>
    </div>
  );
}

export default function CreditProfileDrawer({
  company,
  evaluation,
  companiesById,
  relations,
  onClose,
  onSelectCompany,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [dimSource, setDimSource] = useState(null);

  useEffect(() => {
    setActiveTab('overview');
    setDimSource(null);
  }, [company?.id]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const chainView = useMemo(
    () =>
      company
        ? buildCompanyChainView(company, companiesById, relations)
        : { upstream: [], downstream: [] },
    [company, companiesById, relations],
  );

  if (!company) return null;
  const metrics = company.metrics;
  const warningMeta = evaluation ? WARNING_LEVELS[evaluation.warningLevel] : null;

  return (
    <div className="credit-drawer-overlay" onClick={onClose}>
      <aside
        className="credit-drawer"
        role="dialog"
        aria-label={`${company.name} 授信画像`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="credit-drawer-head">
          <div className="credit-drawer-title">
            <div>
              <h3>{company.name}</h3>
              <div className="credit-drawer-sub">
                <span className="credit-chip chain">{company.chain}</span>
                <span className="credit-chip">{company.sector || '待研判'}</span>
                <span className="credit-chip">{company.typeLabel}</span>
                <span className={`credit-chip ${company.listed ? 'listed' : ''}`}>
                  {company.listed ? '上市企业' : '非上市企业'}
                </span>
                <span className="credit-chip">
                  {company.region?.province || '未知'}
                  {company.region?.city && company.region.city !== company.region?.province
                    ? ` · ${company.region.city}`
                    : ''}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="credit-drawer-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          {evaluation ? (
            <div className="credit-drawer-summary">
              <div className="credit-score-block">
                <div className="credit-score-number">{evaluation.total}</div>
                <div className="credit-score-caption">
                  综合评分 / 100
                  <SourceBadge sourceKey="aiScore" />
                </div>
                <div className="credit-score-tier" style={{ color: warningMeta?.color }}>
                  {evaluation.tierLabel}
                </div>
                <div className="credit-score-grade">
                  {evaluation.gradeLabel}
                  {evaluation.veto ? ' · 红线否决' : ''}
                </div>
              </div>
              <div className="credit-radar-wrap">
                <CreditRadarChart
                  dimensions={evaluation.dimensions}
                  onDimensionSelect={(key, x, y) =>
                    setDimSource((prev) => (prev?.key === key ? null : { key, x, y }))
                  }
                />
                <p className="credit-radar-hint">点击维度标签可查看评分溯源</p>
                {dimSource && (
                  <>
                    <span
                      className="credit-pop-backdrop"
                      onClick={() => setDimSource(null)}
                      aria-hidden
                    />
                    <span
                      className="credit-radar-pop"
                      style={{
                        left: `${(dimSource.x / 400) * 100}%`,
                        top: `${(dimSource.y / 316) * 100}%`,
                        transform:
                          dimSource.x > 200
                            ? 'translate(calc(-100% - 10px), -50%)'
                            : 'translate(10px, -50%)',
                      }}
                    >
                      <SourcePopover meta={SOURCE_META[DIM_SOURCE_KEY[dimSource.key]]} />
                    </span>
                  </>
                )}
              </div>
              <div className="credit-limit-block">
                <div className="credit-limit-value">
                  {formatYuan(evaluation.creditLimit.amount)}
                </div>
                <div className="credit-limit-caption">
                  建议授信额度
                  <SourceBadge sourceKey="aiScore" />
                </div>
                <div className={`credit-warning-badge level-${evaluation.warningLevel}`}>
                  {evaluation.warningLabel}
                </div>
              </div>
            </div>
          ) : (
            <div className="credit-drawer-pending">
              <strong>待评价</strong>
              <span>该企业尚未纳入授信评价范围，接入财务与经营数据后将自动完成评价。</span>
            </div>
          )}
        </header>

        {evaluation && metrics && (
          <>
            <nav className="credit-drawer-tabs" role="tablist">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === key}
                  className={activeTab === key ? 'active' : ''}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="credit-drawer-body">
              {activeTab === 'overview' && (
                <section>
                  <KvGrid
                    items={[
                      ['企业名称', company.name, 'catalog'],
                      ['注册资本', formatYuan(metrics.registeredCapital), 'aiBaseInfo'],
                      ['成立时间', `${metrics.foundedYear || '—'} 年`, 'aiBaseInfo'],
                      [
                        '所属地区',
                        `${company.region?.province || '—'}${company.region?.city ? ` / ${company.region.city}` : ''}`,
                        'catalog',
                      ],
                      [
                        '上市状态',
                        company.listed
                          ? `${company.stockShort || '上市'}${company.stockCode ? ` (${company.stockCode})` : ''}`
                          : '非上市',
                        'catalog',
                      ],
                      [
                        '员工规模',
                        `${metrics.employees?.toLocaleString?.() ?? '—'} 人`,
                        'aiBaseInfo',
                      ],
                      ['营业收入', formatYuan(metrics.revenue), 'aiFinancial'],
                      ['净利润', formatYuan(metrics.netProfit), 'aiFinancial'],
                      ['总资产', formatYuan(metrics.totalAssets), 'aiFinancial'],
                      ['有息负债', formatYuan(metrics.interestBearingDebt), 'aiFinancial'],
                      ['主营产品', company.products || '—', 'catalog'],
                      [
                        '产业链位置',
                        `${company.segment} · ${company.chain} · ${company.sector}`,
                        'catalog',
                      ],
                    ]}
                  />
                </section>
              )}

              {activeTab === 'operation' && (
                <section className="credit-trend-grid">
                  <CreditTrendChart
                    label="营业收入"
                    series={metrics.revenueSeries}
                    formatter={formatYuan}
                    sourceKey="aiFinancial"
                  />
                  <CreditTrendChart
                    label="净利润"
                    series={metrics.netProfitSeries}
                    formatter={formatYuan}
                    tone="green"
                    sourceKey="aiFinancial"
                  />
                  <CreditTrendChart
                    label="经营现金流"
                    series={metrics.ocfSeries}
                    formatter={formatYuan}
                    tone={metrics.cashflowTrap ? 'red' : 'blue'}
                    sourceKey="aiFinancial"
                  />
                  <CreditTrendChart
                    label="应收账款"
                    series={metrics.arSeries}
                    formatter={formatYuan}
                    tone="orange"
                    sourceKey="aiFinancial"
                  />
                  <KvGrid
                    items={[
                      ['营收增速（T-1→T）', percent(metrics.revenueGrowth), 'aiFinancial'],
                      ['毛利率', percent(metrics.grossMargin), 'aiFinancial'],
                      ['净利率', percent(metrics.netMargin), 'aiFinancial'],
                      ['EBITDA', formatYuan(metrics.ebitda), 'aiFinancial'],
                      ['产能利用率', percent(metrics.capacityUtilization, 0), 'aiOperation'],
                      ['在手订单', formatYuan(metrics.orders), 'aiOperation'],
                      [
                        '客户集中度（Top1）',
                        percent(metrics.customerConcentration, 0),
                        'aiOperation',
                      ],
                      ['存货', formatYuan(metrics.inventory), 'aiFinancial'],
                    ]}
                  />
                </section>
              )}

              {activeTab === 'financial' && (
                <section className="credit-fin-list">
                  <FinancialRow
                    label="资产负债率"
                    value={percent(evaluation.ratios.debtRatio)}
                    hint="总负债 / 总资产"
                    level={ratioLevelFor(evaluation.ratios.debtRatio, 0.65, 0.75)}
                    sourceKey="aiFinancial"
                  />
                  <FinancialRow
                    label="有息负债占比"
                    value={percent(evaluation.ratios.interestDebtRatio)}
                    hint="有息负债 / 总负债"
                    level={ratioLevelFor(evaluation.ratios.interestDebtRatio, 0.5, 0.65)}
                    sourceKey="aiFinancial"
                  />
                  <FinancialRow
                    label="EBITDA / 利息支出"
                    value={`${ratio(evaluation.ratios.interestCoverage)} 倍`}
                    hint="利息保障倍数"
                    level={ratioLevelFor(evaluation.ratios.interestCoverage, 3, 1.5, true)}
                    sourceKey="aiFinancial"
                  />
                  <FinancialRow
                    label="经营现金流 / 有息负债"
                    value={percent(evaluation.ratios.ocfDebtCoverage)}
                    hint="现金流债务覆盖"
                    level={ratioLevelFor(evaluation.ratios.ocfDebtCoverage, 0.15, 0.05, true)}
                    sourceKey="aiFinancial"
                  />
                  <FinancialRow
                    label="流动比率 / 速动比率"
                    value={`${ratio(metrics.currentRatio)} / ${ratio(metrics.quickRatio)}`}
                    hint="短期流动性"
                    level={ratioLevelFor(
                      Math.min(metrics.currentRatio ?? 0, metrics.quickRatio ?? 0),
                      1,
                      0.6,
                      true,
                    )}
                    sourceKey="aiFinancial"
                  />
                  <FinancialRow
                    label="应收账款 / 营收"
                    value={percent(evaluation.ratios.arRatio)}
                    hint={`应收账款 ${formatYuan(metrics.accountsReceivable)}`}
                    level={ratioLevelFor(evaluation.ratios.arRatio, 0.35, 0.5)}
                    sourceKey="aiFinancial"
                  />
                  <FinancialRow
                    label="存货 / 营收"
                    value={percent(evaluation.ratios.invRatio)}
                    hint={`存货 ${formatYuan(metrics.inventory)}`}
                    level={ratioLevelFor(evaluation.ratios.invRatio, 0.2, 0.32)}
                    sourceKey="aiFinancial"
                  />
                  <FinancialRow
                    label="短债压力"
                    value={`${ratio(evaluation.ratios.shortDebtCoverage)} 倍`}
                    hint="短期有息负债 / (货币资金 + 经营现金流)"
                    level={ratioLevelFor(evaluation.ratios.shortDebtCoverage, 1.5, 2.5)}
                    sourceKey="aiFinancial"
                  />
                  <FinancialRow
                    label="对外担保 / 总资产"
                    value={percent(evaluation.ratios.guaranteeRatio)}
                    hint={`对外担保 ${formatYuan(metrics.guarantees)}`}
                    level={ratioLevelFor(evaluation.ratios.guaranteeRatio, 0.05, 0.12)}
                    sourceKey="aiFinancial"
                  />
                </section>
              )}

              {activeTab === 'chain' && (
                <section className="credit-chain-view">
                  <div className="credit-chain-column">
                    <h4>上游供应商</h4>
                    {chainView.upstream.length ? (
                      chainView.upstream.map((item) => (
                        <ChainCompanyButton key={item.id} item={item} onSelect={onSelectCompany} />
                      ))
                    ) : (
                      <p className="credit-empty-hint">暂无已入库的上游关系</p>
                    )}
                  </div>
                  <div className="credit-chain-self">
                    <span className="credit-chain-self-name">
                      {company.stockShort || company.name}
                    </span>
                    <span className="credit-chain-self-meta">
                      {company.typeLabel} · {company.segment}
                    </span>
                  </div>
                  <div className="credit-chain-column">
                    <h4>下游客户</h4>
                    {chainView.downstream.length ? (
                      chainView.downstream.map((item) => (
                        <ChainCompanyButton key={item.id} item={item} onSelect={onSelectCompany} />
                      ))
                    ) : (
                      <p className="credit-empty-hint">暂无已入库的下游关系</p>
                    )}
                  </div>
                  <p className="muted">
                    <SourceBadge sourceKey="catalogRelation" />
                    关系数据来自上市企业关系档案（前五大客户 /
                    供应商），点击企业名称可跳转至对应授信画像。
                  </p>
                </section>
              )}

              {activeTab === 'technology' && (
                <section>
                  <KvGrid
                    items={[
                      ['技术路线', metrics.tech?.techRoute || '—', 'aiTechnology'],
                      ['技术成熟度', `${metrics.tech?.maturity ?? '—'} / 5`, 'aiTechnology'],
                      ['技术壁垒', `${metrics.tech?.barrier ?? '—'} / 5`, 'aiTechnology'],
                      ['产品可靠性', `${metrics.tech?.reliability ?? '—'} / 5`, 'aiTechnology'],
                      ['产品认证', `${metrics.tech?.certifications ?? 0} 项`, 'aiTechnology'],
                      ['技术替代风险', metrics.tech?.techIterRisk || '—', 'aiTechnology'],
                      ['研发投入占比', percent(metrics.tech?.rdRatio), 'aiTechnology'],
                      ['核心专利', `${metrics.tech?.patents ?? 0} 项`, 'aiTechnology'],
                      ['主营产品', company.products || '—', 'catalog'],
                    ]}
                  />
                  <p className="muted">
                    技术授信评价 = 技术成熟度 + 商业化程度 + 技术壁垒 −
                    技术替代风险；不以研发投入高低单一判定技术风险。
                  </p>
                </section>
              )}

              {activeTab === 'risk' && (
                <section className="credit-risk-panel">
                  <div className="credit-tag-block">
                    <h4>风险标签</h4>
                    <div className="credit-tag-list">
                      {evaluation.riskTags
                        .filter((tag) => tag.level === 'positive')
                        .map((tag) => (
                          <span key={tag.key} className="credit-tag positive">
                            ✓ {tag.label}
                          </span>
                        ))}
                      {evaluation.riskTags
                        .filter((tag) => tag.level !== 'positive')
                        .map((tag) => (
                          <span key={tag.key} className={`credit-tag ${tag.level}`}>
                            ⚠ {tag.label}
                          </span>
                        ))}
                      {!evaluation.riskTags.some((tag) => tag.level !== 'positive') && (
                        <span className="credit-tag positive">✓ 暂无显著风险标签</span>
                      )}
                    </div>
                  </div>

                  {evaluation.redlines.length > 0 && (
                    <div className="credit-tag-block">
                      <h4>触发红线</h4>
                      <ul className="credit-redline-list">
                        {evaluation.redlines.map((line) => (
                          <li key={`${line.class}-${line.key}`}>
                            <b className={`credit-redline-class class-${line.class}`}>
                              {line.class}类
                            </b>
                            {line.classLabel} · {line.label}
                          </li>
                        ))}
                      </ul>
                      {evaluation.veto && (
                        <p className="credit-veto-note">
                          一票否决：{evaluation.vetoNote}，限制进入第一层。
                        </p>
                      )}
                    </div>
                  )}

                  <div className="credit-tag-block">
                    <h4>授信建议</h4>
                    <KvGrid
                      items={[
                        ['客户层级', evaluation.tierLabel, 'aiScore'],
                        ['内部评级', evaluation.gradeLabel, 'aiScore'],
                        ['建议策略', evaluation.strategy.tierStrategy, 'aiScore'],
                        ['建议额度', formatYuan(evaluation.creditLimit.amount), 'aiScore'],
                      ]}
                    />
                    <div className="credit-product-list">
                      {evaluation.strategy.products.map((product) => (
                        <span key={product} className="credit-chip product">
                          {product}
                        </span>
                      ))}
                    </div>
                    <ol className="credit-condition-list">
                      {evaluation.strategy.conditions.map((condition) => (
                        <li key={condition}>{condition}</li>
                      ))}
                    </ol>
                    <div className="credit-limit-formula">
                      <span>额度测算</span>
                      <code>
                        基础额度 {formatWan(evaluation.creditLimit.base)} × 信用{' '}
                        {evaluation.creditLimit.coefs.credit} × 行业{' '}
                        {evaluation.creditLimit.coefs.industry} × 现金流{' '}
                        {evaluation.creditLimit.coefs.cashflow} × 增信{' '}
                        {evaluation.creditLimit.coefs.enhance} × 集中度{' '}
                        {evaluation.creditLimit.coefs.concentration}
                      </code>
                    </div>
                    <p className="muted">重点关注：{evaluation.strategy.focusRisks.join('；')}</p>
                  </div>
                </section>
              )}
            </div>
            <footer className="credit-drawer-footer">
              AI 辅助分析结果，不替代银行正式授信审批。
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function ratioLevelFor(value, watch, risk, higherBetter = false) {
  if (!Number.isFinite(value)) return 'watch';
  if (higherBetter) {
    if (value <= risk) return 'risk';
    if (value <= watch) return 'watch';
    return 'normal';
  }
  if (value >= risk) return 'risk';
  if (value >= watch) return 'watch';
  return 'normal';
}

function ChainCompanyButton({ item, onSelect }) {
  const target = item.counterparty;
  return (
    <button
      type="button"
      className="credit-chain-company"
      onClick={() => onSelect?.(item.counterpartyId)}
    >
      <span className="credit-chain-company-name">{item.counterpartyName}</span>
      <span
        className={`credit-relation-kind ${item.relationType === '股权' ? 'equity' : 'supply'}`}
      >
        {item.relationType}
      </span>
      {target?.evaluation && (
        <span className="credit-chain-company-score">{target.evaluation.total}分</span>
      )}
    </button>
  );
}
