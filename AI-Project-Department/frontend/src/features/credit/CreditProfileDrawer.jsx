import { useEffect, useMemo, useState } from 'react';
import { DIMENSION_META, WARNING_LEVELS } from './creditConfig';
import { buildCompanyChainView, formatYuan, formatWan } from './creditEngine';
import { CREDIT_RADAR_SIZE, CreditRadarChart, CreditTrendChart } from './creditCharts';
import SourceBadge, { SourcePopover } from './SourceBadge';
import { SOURCE_META } from './creditSources';

const TABS = [
  ['overview', '企业概况'],
  ['operation', '经营能力'],
  ['financial', '财务偿债'],
  ['chain', '产业链关系'],
  ['technology', '技术与产品'],
  ['capital', '资本与集群'],
  ['risk', '风险与授信建议'],
];

// 雷达图八维标签 → 溯源口径：维度分数由该维度的输入指标计算得出。
const DIM_SOURCE_KEY = {
  chain: 'aiScore',
  cluster: 'aiCluster',
  technology: 'aiTechnology',
  operation: 'aiOperation',
  financial: 'aiFinancial',
  trade: 'aiTrade',
  capital: 'aiCapital',
  governance: 'aiGovernance',
};

// 缺失数据一律显示「—」，不得用 0 冒充（与引擎「缺失不默认 0」口径一致）。
const percent = (value, digits = 1) =>
  Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—';
const ratio = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
const DIM_SHORT = DIMENSION_META.reduce((acc, item) => {
  acc[item.key] = item.short;
  return acc;
}, {});

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

function DimensionItems({ dim }) {
  if (!dim) return null;
  return (
    <ul className="credit-item-list">
      {Object.values(dim.items).map((row) => (
        <li key={row.key}>
          <span className="credit-item-name">{row.name}</span>
          <span className="credit-item-score">
            {row.score}
            <em>/{row.max}</em>
          </span>
          <span className="credit-item-note">
            {row.value} · {row.note}
          </span>
        </li>
      ))}
      {dim.excluded.map((name) => (
        <li key={name} className="excluded">
          <span className="credit-item-name">{name}</span>
          <span className="credit-item-score">不适用</span>
          <span className="credit-item-note">该类型企业无需提供此指标，已从分值中剔除</span>
        </li>
      ))}
      {dim.missing.map((name) => (
        <li key={name} className="missing">
          <span className="credit-item-name">{name}</span>
          <span className="credit-item-score">待补充</span>
          <span className="credit-item-note">数据缺失，已从分母剔除并计入完整度，未按 0 计分</span>
        </li>
      ))}
    </ul>
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
  follow,
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
            <div className="credit-drawer-actions">
              {/* 关注入口：状态由 useFollowedCompanies 统一管理，与图谱公司卡 / 生态经营版面互通。 */}
              {follow && (
                <button
                  type="button"
                  className={`credit-follow-button ${follow.followed ? 'is-followed' : ''}`}
                  aria-pressed={Boolean(follow.followed)}
                  title={
                    follow.followed
                      ? '取消关注（生态经营版面同步移除）'
                      : '关注该企业，纳入生态经营营销名单'
                  }
                  onClick={follow.onToggle}
                >
                  {follow.followed ? '★ 已关注' : '☆ 关注'}
                </button>
              )}
              <button
                type="button"
                className="credit-drawer-close"
                onClick={onClose}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
          </div>
          {evaluation ? (
            <div className="credit-drawer-summary">
              <div className="credit-score-block">
                <div className="credit-score-number">{evaluation.total}</div>
                <div className="credit-score-caption">
                  综合评分 / 100（参考）
                  <SourceBadge sourceKey="aiScore" />
                </div>
                <div className="credit-score-tier" style={{ color: warningMeta?.color }}>
                  {evaluation.tierLabel}
                </div>
                <div className="credit-score-grade">
                  {evaluation.gradeLabel}
                  {evaluation.veto ? ' · 红线否决' : ''}
                </div>
                <div className="credit-score-grade">
                  {evaluation.groupLabel} · {evaluation.stageLabel}
                </div>
              </div>
              <div className="credit-radar-wrap">
                <CreditRadarChart
                  dimensions={evaluation.dimensions}
                  onDimensionSelect={(key, x, y) =>
                    setDimSource((prev) => (prev?.key === key ? null : { key, x, y }))
                  }
                />
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
                        left: `${(dimSource.x / CREDIT_RADAR_SIZE.width) * 100}%`,
                        top: `${(dimSource.y / CREDIT_RADAR_SIZE.height) * 100}%`,
                        transform:
                          dimSource.x > CREDIT_RADAR_SIZE.width / 2
                            ? 'translate(calc(-100% - 10px), -50%)'
                            : 'translate(10px, -50%)',
                      }}
                    >
                      <SourcePopover meta={SOURCE_META[DIM_SOURCE_KEY[dimSource.key]]} />
                    </span>
                  </>
                )}
              </div>
              <p className="credit-radar-hint">八维评分 · 点击维度标签可查看评分溯源</p>
              <div className="credit-limit-block">
                <div className="credit-limit-value">
                  {formatYuan(evaluation.creditLimit.amount)}
                </div>
                <div className="credit-limit-caption">
                  参考授信额度（非审批结论）
                  <SourceBadge sourceKey="aiScore" />
                </div>
                <div className={`credit-warning-badge level-${evaluation.warningLevel}`}>
                  {evaluation.warningLabel}
                </div>
              </div>

              <div className="credit-dual-eval">
                <div className="credit-eval-card value">
                  <span className="credit-eval-label">
                    经营价值评价
                    <SourceBadge sourceKey="aiScore" />
                  </span>
                  <b className="credit-eval-score">{evaluation.value.score}</b>
                  <span className={`credit-eval-tag lv-${evaluation.valueLevel.key}`}>
                    {evaluation.valueLevel.label}
                  </span>
                  <p>{evaluation.valueLevel.note}</p>
                </div>
                <div className="credit-eval-card credit">
                  <span className="credit-eval-label">
                    信用与融资适配
                    <SourceBadge sourceKey="aiScore" />
                  </span>
                  <b className="credit-eval-score">{evaluation.credit.score}</b>
                  <span className={`credit-eval-tag lv-${evaluation.creditLevel.key}`}>
                    {evaluation.creditLevel.label}
                  </span>
                  <p>{evaluation.creditLevel.note}</p>
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
                  <div className="credit-identify-block">
                    <h4>类型与阶段识别（第三层动态配置）</h4>
                    <KvGrid
                      items={[
                        ['评价类型', evaluation.groupLabel, 'aiScore'],
                        [
                          '辅助类型',
                          evaluation.secondaryGroup
                            ? `${evaluation.secondaryGroup} 类（仅用于避免重复计分）`
                            : '无',
                        ],
                        [
                          '发展阶段',
                          `${evaluation.stageLabel} — ${evaluation.stageNote}`,
                          'aiScore',
                        ],
                        [
                          '数据完整度',
                          `${Math.round(evaluation.coverage * 100)}%${
                            evaluation.missing.length
                              ? `（缺失 ${evaluation.missing.length} 项，未按 0 计分）`
                              : ''
                          }`,
                          'aiScore',
                        ],
                        [
                          '权重模板',
                          Object.entries(evaluation.weightTemplate)
                            .map(([key, value]) => `${DIM_SHORT[key] || key} ${value}`)
                            .join(' · '),
                          'aiScore',
                        ],
                      ]}
                    />
                    <p className="muted">{evaluation.groupReason}</p>
                    {evaluation.excluded.length > 0 && (
                      <p className="muted">
                        非适用指标（不参与评分、不计入总分）：
                        {evaluation.excluded.join('；')}
                      </p>
                    )}
                    {evaluation.missing.length > 0 && (
                      <p className="muted">
                        待补充指标（已从分母中显式剔除并计入完整度，未按 0 处理）：
                        {evaluation.missing.slice(0, 8).join('；')}
                        {evaluation.missing.length > 8 ? ` 等 ${evaluation.missing.length} 项` : ''}
                      </p>
                    )}
                  </div>
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
                    value={`${ratio(evaluation.ratios.currentRatio)} / ${ratio(evaluation.ratios.quickRatio)}`}
                    hint="短期流动性"
                    level={ratioLevelFor(
                      Number.isFinite(evaluation.ratios.currentRatio) &&
                        Number.isFinite(evaluation.ratios.quickRatio)
                        ? Math.min(evaluation.ratios.currentRatio, evaluation.ratios.quickRatio)
                        : NaN,
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

              {activeTab === 'capital' && (
                <section className="credit-capital-view">
                  <div className="credit-zone">
                    <h4>
                      投融资经历与资本验证
                      <SourceBadge sourceKey="aiCapital" />
                    </h4>
                    <KvGrid
                      items={[
                        [
                          '已完成融资',
                          metrics.capital
                            ? metrics.capital.rounds > 0
                              ? `${metrics.capital.rounds} 轮`
                              : metrics.capital.intentOnly
                                ? '仅有融资意向'
                                : '无外部股权融资'
                            : '待补充',
                          'aiCapital',
                        ],
                        ['投资方类型', metrics.capital?.investorTier || '待补充', 'aiCapital'],
                        [
                          '投资方',
                          metrics.capital?.investors?.length
                            ? metrics.capital.investors.join('、')
                            : '待补充',
                          'aiCapital',
                        ],
                        ['到账证据', metrics.capital?.evidence || '待补充', 'aiCapital'],
                        ['阶段匹配度', metrics.capital?.stageMatch || '待补充', 'aiCapital'],
                        ['融资后表现', metrics.capital?.postPerformance || '待补充', 'aiCapital'],
                        [
                          '结构风险',
                          metrics.capital
                            ? `${Math.round((metrics.capital.structureRisk ?? 0) * 100)}%`
                            : '待补充',
                          'aiCapital',
                        ],
                        [
                          '维度得分',
                          `${evaluation.dimensions.capital.score} / ${evaluation.dimensions.capital.max}`,
                          'aiScore',
                        ],
                      ]}
                    />
                    <p className="muted">
                      {metrics.capital?.structureNote || '缺少融资结构信息，需补充后复核。'}
                    </p>
                    <p className="muted">
                      口径提示：须区分股权投资、战略投资、银行贷款、融资租赁、保理、政府补助与融资意向；不得将投资方知名度直接等同于企业信用质量；无外部股权融资不自动扣满该维度。
                    </p>
                    <DimensionItems dim={evaluation.dimensions.capital} />
                  </div>

                  <div className="credit-zone">
                    <h4>
                      产业集群与区域生态
                      <SourceBadge sourceKey="aiCluster" />
                    </h4>
                    <KvGrid
                      items={[
                        ['所属集群', metrics.cluster?.name || '待补充', 'aiCluster'],
                        [
                          '集群成熟度',
                          metrics.cluster ? `${metrics.cluster.maturity} / 5` : '待补充',
                          'aiCluster',
                        ],
                        [
                          '注册地是否在集群',
                          metrics.cluster ? (metrics.cluster.inCluster ? '是' : '否') : '待补充',
                          'aiCluster',
                        ],
                        [
                          '实际生产/运营是否在集群',
                          metrics.cluster
                            ? metrics.cluster.productionInCluster
                              ? '是'
                              : '否'
                            : '待补充',
                          'aiCluster',
                        ],
                        [
                          '集群内真实业务往来',
                          metrics.cluster
                            ? metrics.cluster.realBusinessLinks
                              ? '已核实存在'
                              : '未核实'
                            : '待补充',
                          'aiCluster',
                        ],
                        ['集群内地位', metrics.cluster?.positionLabel || '待补充', 'aiCluster'],
                        [
                          '同质化/核心企业依赖',
                          metrics.cluster
                            ? `${Math.round(metrics.cluster.homogeneityRisk * 100)}%（风险传导：${metrics.cluster.contagionRisk}）`
                            : '待补充',
                          'aiCluster',
                        ],
                        [
                          '维度得分',
                          `${evaluation.dimensions.cluster.score} / ${evaluation.dimensions.cluster.max}`,
                          'aiScore',
                        ],
                      ]}
                    />
                    <p className="muted">
                      {metrics.cluster?.dependencyNote ||
                        '缺少集群归属与实际业务关联证明，请补充园区入驻、生产场地与供应/客户合同。'}
                    </p>
                    <p className="muted">
                      口径提示：「注册在集群」「实际生产运营在集群」「与集群内企业存在真实业务关系」「在集群中具备关键地位」四种情形评分不可相同。
                    </p>
                    <DimensionItems dim={evaluation.dimensions.cluster} />
                  </div>
                </section>
              )}

              {activeTab === 'risk' && (
                <section className="credit-risk-panel">
                  <div className="credit-tag-block">
                    <h4>双评价结论（互相独立，不得替代）</h4>
                    <div className="credit-eval-detail">
                      {[
                        ['value', evaluation.value, evaluation.valueLevel, '经营价值评价'],
                        ['credit', evaluation.credit, evaluation.creditLevel, '信用与融资适配'],
                      ].map(([kind, board, level, title]) => (
                        <div key={kind} className={`credit-eval-col ${kind}`}>
                          <span className="credit-eval-title">
                            {title} · {board.score} 分（{level.label}）
                          </span>
                          <ul>
                            {board.parts.map((part) => (
                              <li key={part.key}>
                                <span>{part.name}</span>
                                <em>权重 {Math.round(part.weight * 100)}%</em>
                                <b>
                                  {part.score == null ? '待补充' : `${part.score} / ${part.max}`}
                                </b>
                              </li>
                            ))}
                          </ul>
                          <p className="muted">{level.note}</p>
                        </div>
                      ))}
                    </div>
                    {evaluation.credit.guardrails?.length > 0 && (
                      <p className="credit-guardrail">
                        规则护栏：{evaluation.credit.guardrails.join('；')}
                      </p>
                    )}
                    <p className="muted">
                      数据完整度 {Math.round(evaluation.coverage * 100)}
                      %；经营价值评价回答「是否值得优先关注」，信用与融资适配回答「当前风险与资料缺口」，二者不得互相替代。
                    </p>
                  </div>

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
                      <h4>触发的红线与预警信号</h4>
                      <ul className="credit-redline-list">
                        {evaluation.redlines.map((line) => (
                          <li key={`${line.class}-${line.key}`}>
                            <b className={`credit-redline-class class-${line.class}`}>
                              {line.class}类
                            </b>
                            {line.classLabel} · {line.label}
                            <span className={`credit-review-chip ${line.status}`}>
                              {line.statusLabel}
                            </span>
                            {line.evidence && (
                              <span className="credit-redline-evidence">依据：{line.evidence}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {evaluation.veto && (
                        <p className="credit-veto-note">
                          一票否决：{evaluation.vetoNote}，按制度限制准入（已核实重大红线）。
                        </p>
                      )}
                      {evaluation.pendingRedlines.length > 0 && (
                        <p className="muted">
                          待核实信号 {evaluation.pendingRedlines.length}{' '}
                          项：须完成主体匹配与时点核实后方可定性，
                          未核实前不得作为否决依据，当前仅作降级处理。
                        </p>
                      )}
                    </div>
                  )}

                  <div className="credit-tag-block">
                    <h4>待补充资料与核实事项</h4>
                    <ul className="credit-action-list docs">
                      {evaluation.actions.docs.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                      {!evaluation.actions.docs.length && <li>当前无额外补充事项。</li>}
                    </ul>
                    <h4 className="credit-tag-sub">需升级审查的风险事项</h4>
                    <ul className="credit-action-list escalations">
                      {evaluation.actions.escalations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                      {!evaluation.actions.escalations.length && <li>暂无需升级审查事项。</li>}
                    </ul>
                  </div>

                  <div className="credit-tag-block">
                    <h4>授信建议（分层与额度均为参考值）</h4>
                    <KvGrid
                      items={[
                        ['参考分层', evaluation.tierLabel, 'aiScore'],
                        ['参考评级', evaluation.gradeLabel, 'aiScore'],
                        ['参考策略', evaluation.strategy.tierStrategy, 'aiScore'],
                        ['参考额度', formatYuan(evaluation.creditLimit.amount), 'aiScore'],
                        [
                          '经营价值',
                          `${evaluation.value.score} · ${evaluation.valueLevel.label}`,
                          'aiScore',
                        ],
                        [
                          '信用适配',
                          `${evaluation.credit.score} · ${evaluation.creditLevel.label}`,
                          'aiScore',
                        ],
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
                      <span>参考额度测算</span>
                      <code>
                        基础额度 {formatWan(evaluation.creditLimit.base)} × 信用{' '}
                        {evaluation.creditLimit.coefs.credit} × 行业{' '}
                        {evaluation.creditLimit.coefs.industry} × 现金流{' '}
                        {evaluation.creditLimit.coefs.cashflow} × 增信{' '}
                        {evaluation.creditLimit.coefs.enhance} × 集中度{' '}
                        {evaluation.creditLimit.coefs.concentration}
                      </code>
                    </div>
                    <p className="muted">{evaluation.referenceNote}</p>
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
