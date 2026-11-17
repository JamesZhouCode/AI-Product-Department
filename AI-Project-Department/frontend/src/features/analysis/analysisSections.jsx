// 「分析」页 8 个报告章节 + 概览 + 核心结论。
// 每章对应提示词中的统一分析模板：规模 → 区域 → 产能 → 亮点 → 技术 → 企业 → 趋势 → 授信。
import { useState } from 'react';
import {
  CapacityBalanceChart,
  CapacityTrendChart,
  ConcentrationChart,
  DemandMixChart,
  MarketTrendChart,
  ProsperityBreakdown,
  RegionBarChart,
  RegionMapChart,
  StarRating,
} from './analysisCharts';
import { useProvinceShapes } from './useProvinceShapes';
import AnalysisSourceBadge from './AnalysisSourceBadge';

const fmt = (value, digits = 0) =>
  Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: digits });

function Kpi({ label, value, sub, tone, source }) {
  return (
    <div className={`ana-kpi ${tone ? `tone-${tone}` : ''}`}>
      <span className="ana-kpi-label">
        {label}
        {source && <AnalysisSourceBadge sourceKey={source} />}
      </span>
      <b className="ana-kpi-value">{value}</b>
      {sub && <span className="ana-kpi-sub">{sub}</span>}
    </div>
  );
}

function SectionHead({ index, title, question, extra, source }) {
  return (
    <div className="ana-section-head">
      <div>
        <span className="ana-section-index">{index}</span>
        <h3>{title}</h3>
        {source && <AnalysisSourceBadge sourceKey={source} />}
        {question && <p className="ana-section-question">{question}</p>}
      </div>
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------- 概览

export function OverviewPanel({ segment, onOpenRules }) {
  const { overview, scores } = segment;
  return (
    <section className="ana-panel ana-overview-box" id="ana-overview">
      <div className="ana-overview-main">
        <div className="ana-overview-title">
          <h2>细分环节概览</h2>
          <span className="ana-demo-tag">演示数据</span>
        </div>
        <div className="ana-kpis">
          <Kpi
            label="行业规模"
            value={`${fmt(overview.marketSize)} ${overview.marketSizeUnit}`}
            sub={`2025 年 · 同比 +${overview.growthRate}%`}
            source="aiMarket"
          />
          <Kpi
            label="相关企业"
            value={fmt(overview.companyCount)}
            sub="含非上市全口径"
            source="catalog"
          />
          <Kpi
            label="上市企业"
            value={fmt(overview.listedCount)}
            sub="入链表口径"
            source="catalog"
          />
          <Kpi
            label="重点企业"
            value={fmt(overview.keyCompanyCount)}
            sub="龙头 / 核心主业"
            source="catalog"
          />
          <Kpi
            label="名义产能"
            value={`${fmt(overview.capacity)}`}
            sub={overview.capacityUnit}
            source="aiCapacity"
          />
          <Kpi
            label="产能利用率"
            value={`${overview.capacityUtilization}%`}
            sub="2025 年"
            source="aiCapacity"
          />
          <Kpi
            label="2026E 增速"
            value={`${overview.growthRate}%`}
            sub={`CAGR ${overview.cagr}%`}
            tone="blue"
            source="aiMarket"
          />
          <Kpi
            label="行业阶段"
            value={overview.industryStage}
            sub={`授信评级：${overview.rating}`}
            source="aiMarket"
          />
        </div>
        <div className="ana-one-liner">
          <span className="ana-one-liner-tag">一句话结论</span>
          <p>{segment.oneLiner}</p>
          <AnalysisSourceBadge sourceKey="aiJudgement" />
        </div>
      </div>
      <div className="ana-overview-side">
        <div className="ana-score-card">
          <span className="ana-score-label">
            行业景气度
            <AnalysisSourceBadge sourceKey="aiScore" />
            {onOpenRules && (
              <button type="button" className="ana-link-button" onClick={onOpenRules}>
                ⓘ 评分口径
              </button>
            )}
          </span>
          <StarRating {...scores.prosperityMeta} score={scores.industryScore} />
          <ProsperityBreakdown items={scores.prosperity} />
        </div>
        <div className="ana-score-card">
          <span className="ana-score-label">
            授信友好度
            <AnalysisSourceBadge sourceKey="aiScore" />
          </span>
          <StarRating {...scores.friendlyMeta} score={scores.creditFriendlyScore} />
          <p className="ana-score-note">
            综合现金流稳定性、行业周期、资产可抵押性、订单稳定性、企业集中度、项目收益稳定性与政策确定性七项因子。
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 01 行业规模

export function MarketSection({ segment }) {
  const { market } = segment;
  return (
    <section className="ana-section" id="ana-sec-market">
      <SectionHead
        index="01"
        title="行业规模与需求测算"
        question="这个细分行业到底有多大？需求来自哪里？"
        source="aiMarket"
      />
      <div className="ana-kpis compact">
        <Kpi
          label="2025 中国规模"
          value={`${fmt(market.chinaLatest)} 亿元`}
          sub={`同比 +${market.growth}%`}
          source="aiMarket"
        />
        <Kpi
          label="2026E 规模"
          value={`${fmt(market.forecast[0])} 亿元`}
          tone="blue"
          source="aiMarket"
        />
        <Kpi label="2026—2030 CAGR" value={`${market.cagr}%`} tone="blue" source="aiMarket" />
        <Kpi
          label="全球规模"
          value={`${fmt(market.tam.tam)} 亿元`}
          sub="演示口径"
          source="aiMarket"
        />
        <Kpi label="行业阶段" value={market.stage} sub={market.stageNote} source="aiMarket" />
      </div>
      <div className="ana-figure">
        <MarketTrendChart market={market} />
        <p className="ana-figure-caption">
          历年规模与预测规模（演示数据）：{market.years[0]}—{market.years[market.years.length - 1]}{' '}
          年 规模由当期值按各年增速反推，预测年份按 CAGR {market.cagr}% 递推，口径前后一致。
        </p>
      </div>
      <div className="ana-two-col">
        <div className="ana-figure">
          <h4>
            需求结构
            <AnalysisSourceBadge sourceKey="aiMarket" />
          </h4>
          <DemandMixChart mix={market.demandMix} />
        </div>
        <div className="ana-figure">
          <h4>
            需求驱动因素
            <AnalysisSourceBadge sourceKey="aiJudgement" />
          </h4>
          <ol className="ana-driver-list">
            {market.drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ol>
          <p className="ana-figure-caption">{market.tam.note}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 02 区域产业规模

export function RegionalSection({ segment }) {
  const { regions } = segment;
  const [activeProvince, setActiveProvince] = useState(regions.regions[0]?.province || '');
  const active =
    regions.regions.find((item) => item.province === activeProvince) || regions.regions[0];
  const geo = useProvinceShapes();
  return (
    <section className="ana-section" id="ana-sec-region">
      <SectionHead
        index="02"
        title="区域产业规模"
        question="这个细分行业主要集中在哪里？"
        source="aiRegion"
      />
      <div className="ana-figure">
        {geo.status === 'ready' && (
          <RegionMapChart
            regions={regions}
            shapes={geo.shapes}
            unit={active?.capacityUnit || ''}
            activeProvince={active?.province}
            onSelect={setActiveProvince}
          />
        )}
        {geo.status === 'loading' && <p className="ana-empty-hint">区域地图加载中…</p>}
        {geo.status === 'error' && (
          <p className="ana-empty-hint">区域地图数据加载失败，可通过下方排名表查看区域分布。</p>
        )}
      </div>
      <div className="ana-region-layout">
        <div className="ana-table-wrap">
          <table className="ana-table">
            <thead>
              <tr>
                <th className="num">排名</th>
                <th>地区</th>
                <th className="num">
                  企业数
                  <AnalysisSourceBadge sourceKey="catalog" />
                </th>
                <th className="num">
                  产能
                  <AnalysisSourceBadge sourceKey="aiRegion" />
                </th>
                <th className="num">
                  产业规模
                  <AnalysisSourceBadge sourceKey="aiRegion" />
                </th>
                <th>
                  集聚度
                  <AnalysisSourceBadge sourceKey="aiRegion" />
                </th>
                <th>
                  产业链完整度
                  <AnalysisSourceBadge sourceKey="aiRegion" />
                </th>
              </tr>
            </thead>
            <tbody>
              {regions.regions.map((item, index) => (
                <tr
                  key={item.province}
                  className={item.province === active?.province ? 'active' : ''}
                  onClick={() => setActiveProvince(item.province)}
                >
                  <td className="num">{index + 1}</td>
                  <td>
                    <b>{item.province}</b>
                  </td>
                  <td className="num">{item.companies}</td>
                  <td className="num">
                    {fmt(item.capacity)} {item.capacityUnit}
                  </td>
                  <td className="num">{fmt(item.output)} 亿元</td>
                  <td>{item.concentration}</td>
                  <td>{item.completeness}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ana-figure-caption">点击任意地区查看该地区明细。{regions.note}</p>
        </div>
        {active && (
          <div className="ana-region-detail">
            <h4>{active.province} · 区域明细</h4>
            <dl className="ana-kv-list">
              <div>
                <dt>
                  企业数量
                  <AnalysisSourceBadge sourceKey="catalog" />
                </dt>
                <dd>
                  {active.companies} 家（占比 {active.share}%）
                </dd>
              </div>
              <div>
                <dt>
                  产能 / 产量
                  <AnalysisSourceBadge sourceKey="aiRegion" />
                </dt>
                <dd>
                  {fmt(active.capacity)} / {fmt(active.output)} {active.capacityUnit}
                </dd>
              </div>
              <div>
                <dt>
                  产业规模
                  <AnalysisSourceBadge sourceKey="aiRegion" />
                </dt>
                <dd>{fmt(active.output)} 亿元</dd>
              </div>
              <div>
                <dt>
                  重点企业
                  <AnalysisSourceBadge sourceKey="catalog" />
                </dt>
                <dd>
                  {active.keyCompanies?.length
                    ? active.keyCompanies
                        .map((row) => `${row.name}（${row.tierLabel} · ${row.grade}）`)
                        .join('、')
                    : '该地区暂无入库上市企业'}
                </dd>
              </div>
              <div>
                <dt>
                  产业集群
                  <AnalysisSourceBadge sourceKey="aiRegion" />
                </dt>
                <dd>{active.clusters.join('、')}</dd>
              </div>
              <div>
                <dt>
                  区域政策
                  <AnalysisSourceBadge sourceKey="aiJudgement" />
                </dt>
                <dd>{active.policy}</dd>
              </div>
              <div>
                <dt>
                  区域风险
                  <AnalysisSourceBadge sourceKey="aiJudgement" />
                </dt>
                <dd className="ana-risk-text">{active.risk}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
      <div className="ana-figure">
        <h4>
          企业数与产业规模分布对比
          <AnalysisSourceBadge sourceKey="aiRegion" />
        </h4>
        <RegionBarChart regions={regions} unit={active?.capacityUnit || ''} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 03 产能与供需

export function CapacitySection({ segment }) {
  const { capacity } = segment;
  return (
    <section className="ana-section" id="ana-sec-capacity">
      <SectionHead
        index="03"
        title="产能与供需情况"
        question="产能是否过剩？未来产能如何释放？"
        source="aiCapacity"
      />
      <div className="ana-kpis compact">
        <Kpi
          label="名义产能"
          value={fmt(capacity.nominal)}
          sub={capacity.unit}
          source="aiCapacity"
        />
        <Kpi
          label="有效产能"
          value={fmt(capacity.effective)}
          sub={capacity.unit}
          source="aiCapacity"
        />
        <Kpi
          label="实际产量"
          value={fmt(capacity.output)}
          sub={`利用率 ${capacity.utilization}%`}
          source="aiCapacity"
        />
        <Kpi label="需求量" value={fmt(capacity.demand)} sub={capacity.unit} source="aiCapacity" />
        <Kpi
          label="供需缺口"
          value={`${capacity.gap >= 0 ? '+' : ''}${fmt(capacity.gap)}`}
          sub={capacity.gap >= 0 ? '供不应求' : '供大于求'}
          tone={capacity.gap >= 0 ? 'green' : 'red'}
          source="aiCapacity"
        />
        <Kpi
          label="在建 + 规划"
          value={`${fmt(capacity.underConstruction)} + ${fmt(capacity.planned)}`}
          sub={capacity.unit}
          source="aiCapacity"
        />
      </div>
      <div className="ana-figure">
        <h4>
          名义 / 有效 / 实际 / 需求产能对比
          <AnalysisSourceBadge sourceKey="aiCapacity" />
        </h4>
        <CapacityBalanceChart capacity={capacity} />
      </div>
      <div className="ana-two-col">
        <div className="ana-figure">
          <h4>
            产能利用率与需求趋势
            <AnalysisSourceBadge sourceKey="aiCapacity" />
          </h4>
          <CapacityTrendChart capacity={capacity} />
        </div>
        <div className="ana-judgement">
          <span className="ana-judgement-title">
            综合判断
            <AnalysisSourceBadge sourceKey="aiCapacity" />
          </span>
          {capacity.judgement.map((item) => (
            <div key={item.label} className="ana-judgement-row">
              <span>{item.label}</span>
              <b>{item.value}</b>
            </div>
          ))}
          <p className="ana-figure-caption">{capacity.marketLink}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 04 发展亮点

export function HighlightsSection({ segment }) {
  const steps = [
    ['现象', 'phenomenon'],
    ['原因', 'reason'],
    ['产业影响', 'industry'],
    ['企业影响', 'company'],
    ['银行授信影响', 'credit'],
  ];
  return (
    <section className="ana-section" id="ana-sec-highlight">
      <SectionHead
        index="04"
        title="产业发展亮点"
        question="行业正在发生什么结构性变化？"
        source="aiJudgement"
      />
      <div className="ana-highlight-grid">
        {segment.highlights.map((item, index) => (
          <article key={item.title} className="ana-highlight-card">
            <h4>
              <span>亮点{['一', '二', '三', '四', '五'][index] || index + 1}</span>
              {item.title}
            </h4>
            <div className="ana-highlight-chain">
              {steps.map(([label, key]) => (
                <div key={key} className="ana-highlight-step">
                  <span className="ana-highlight-step-label">{label}</span>
                  <p>{item[key]}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 05 技术发展特征

export function TechnologySection({ segment }) {
  const { technology } = segment;
  return (
    <section className="ana-section" id="ana-sec-technology">
      <SectionHead
        index="05"
        title="技术发展特征"
        question="技术路线怎么变化？替代风险在哪里？"
        source="aiTechnology"
      />
      <div className="ana-table-wrap">
        <table className="ana-table">
          <thead>
            <tr>
              <th>技术路线</th>
              <th>成熟度</th>
              <th>成本</th>
              <th className="num">
                市占率
                <AnalysisSourceBadge sourceKey="aiTechnology" />
              </th>
              <th>增长潜力</th>
              <th>
                替代风险
                <AnalysisSourceBadge sourceKey="aiTechnology" />
              </th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {technology.routes.map((route) => (
              <tr key={route.route}>
                <td>
                  <b>{route.route}</b>
                </td>
                <td>{route.maturity}</td>
                <td>{route.cost}</td>
                <td className="num">{route.share}%</td>
                <td>{route.growth}</td>
                <td>
                  <span
                    className={`ana-tag risk-${route.risk === '高' ? 'high' : route.risk === '中高' ? 'mid' : 'low'}`}
                  >
                    {route.risk}
                  </span>
                </td>
                <td className="ana-cell-text">{route.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ana-kpis compact">
        <Kpi label="主流路线" value={technology.mainstream} source="aiTechnology" />
        <Kpi label="成长最快" value={technology.fastestGrowing} tone="blue" source="aiTechnology" />
        <Kpi label="替代风险路线" value={technology.highestRisk} tone="red" source="aiTechnology" />
      </div>
      <p className="ana-note">{technology.note}</p>
    </section>
  );
}

// ---------------------------------------------------------------- 06 主要企业

export function CompanySection({ segment, onOpenCompany }) {
  const { companies } = segment;
  return (
    <section className="ana-section" id="ana-sec-company">
      <SectionHead
        index="06"
        title="主要企业概况"
        question="龙头企业是谁？集中度如何？"
        source="catalog"
        extra={<span className="ana-section-extra">点击企业行可跳转至该企业的授信画像</span>}
      />
      <div className="ana-two-col">
        <div className="ana-figure">
          <h4>
            集中度演变
            <AnalysisSourceBadge sourceKey="aiConcentration" />
          </h4>
          <ConcentrationChart companies={companies} />
          <p className="ana-figure-caption">
            当前 CR3 {companies.cr3}% / CR5 {companies.cr5}% / CR10 {companies.cr10}%，判断为「
            {companies.verdict}」。
            {companies.verdictNote}
          </p>
        </div>
        <div className="ana-kpis compact">
          <Kpi label="上市企业" value={fmt(companies.count)} sub="入链表口径" source="catalog" />
          <Kpi
            label="龙头层级"
            value={fmt(companies.leaderCount)}
            sub="头部企业标记"
            source="catalog"
          />
          <Kpi
            label="核心主业"
            value={fmt(companies.coreMainCount)}
            sub="主营聚焦该环节"
            source="catalog"
          />
          <Kpi label="CR3" value={`${companies.cr3}%`} tone="blue" source="aiConcentration" />
          <Kpi
            label="CR5 / CR10"
            value={`${companies.cr5}% / ${companies.cr10}%`}
            tone="blue"
            source="aiConcentration"
          />
          <Kpi
            label="板块分布"
            value={
              companies.boardMix.map((item) => `${item.label}${item.count}`).join(' · ') || '—'
            }
            source="catalog"
          />
        </div>
      </div>
      <div className="ana-table-wrap">
        <table className="ana-table ana-company-table">
          <thead>
            <tr>
              <th>
                企业
                <AnalysisSourceBadge sourceKey="catalog" />
              </th>
              <th>地区</th>
              <th>上市</th>
              <th>
                主营
                <AnalysisSourceBadge sourceKey="catalog" />
              </th>
              <th className="num">
                产能
                <AnalysisSourceBadge sourceKey="aiConcentration" />
              </th>
              <th className="num">
                营收
                <AnalysisSourceBadge sourceKey="aiConcentration" />
              </th>
              <th className="num">
                市占率
                <AnalysisSourceBadge sourceKey="aiConcentration" />
              </th>
              <th className="num">
                授信评分
                <AnalysisSourceBadge sourceKey="creditScore" />
              </th>
              <th>综合评价</th>
            </tr>
          </thead>
          <tbody>
            {companies.list.map((row) => (
              <tr
                key={row.name}
                className={row.id ? 'clickable' : ''}
                onClick={() => row.id && onOpenCompany?.(row.id)}
              >
                <td>
                  <b>{row.short}</b>
                  <span className="ana-cell-sub">{row.headTier}</span>
                </td>
                <td>{row.province}</td>
                <td>{row.listed ? '是' : '—'}</td>
                <td className="ana-cell-text">{row.product}</td>
                <td className="num">
                  {fmt(row.capacity)} {row.capacityUnit}
                </td>
                <td className="num">{fmt(row.revenue)} 亿元</td>
                <td className="num">{row.share}%</td>
                <td className="num">
                  {row.score != null ? row.score : <span className="ana-cell-sub">待评价</span>}
                </td>
                <td>
                  <span className={`ana-tag grade-${row.verdict}`}>{row.verdict}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ana-figure-caption">
          企业名单与分层来自客户清单入库结果；产能、营收、市占率为演示数据（按集中度模型推算）。
          授信评分取自「授信」tab 的同一套六维评价引擎，未纳入评价范围的企业显示为待评价。
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 07 发展趋势

export function TrendSection({ segment }) {
  return (
    <section className="ana-section" id="ana-sec-trend">
      <SectionHead
        index="07"
        title="产业发展趋势"
        question="未来 3—5 年怎么发展？谁受益、谁承压？"
        source="aiJudgement"
      />
      <div className="ana-trend-list">
        {segment.trends.map((trend, index) => (
          <article key={trend.title} className="ana-trend-card">
            <h4>
              <span className="ana-trend-index">{String(index + 1).padStart(2, '0')}</span>
              {trend.title}
            </h4>
            <p className="ana-trend-judgement">{trend.judgement}</p>
            <dl className="ana-trend-meta">
              <div>
                <dt>影响因素</dt>
                <dd>{trend.factors}</dd>
              </div>
              <div>
                <dt>时间窗口</dt>
                <dd>{trend.window}</dd>
              </div>
              <div>
                <dt>受益环节</dt>
                <dd className="ana-positive">{trend.beneficiary}</dd>
              </div>
              <div>
                <dt>承压环节</dt>
                <dd className="ana-negative">{trend.pressured}</dd>
              </div>
            </dl>
            <p className="ana-trend-credit">{trend.credit}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 08 银行授信视角

export function CreditSection({ segment }) {
  const { credit, riskTags, overview } = segment;
  return (
    <section className="ana-section" id="ana-sec-credit">
      <SectionHead
        index="08"
        title="银行授信视角"
        question="这个细分行业是否值得银行授信？"
        source="aiCredit"
      />
      <div className="ana-credit-hero">
        <div>
          <span className="ana-credit-label">
            行业授信评级
            <AnalysisSourceBadge sourceKey="aiCredit" />
          </span>
          <b className="ana-credit-rating">{credit.rating}</b>
        </div>
        <p>{credit.ratingNote}</p>
      </div>
      <div className="ana-two-col">
        <div className="ana-figure">
          <h4>
            授信切入点
            <AnalysisSourceBadge sourceKey="aiCredit" />
          </h4>
          <div className="ana-chip-list">
            {credit.entries.map((item) => (
              <span key={item.product} className="ana-chip">
                <b>{item.product}</b>
                <em>{item.note}</em>
              </span>
            ))}
          </div>
        </div>
        <div className="ana-figure">
          <h4>
            重点风险
            <AnalysisSourceBadge sourceKey="aiCredit" />
          </h4>
          <div className="ana-chip-list risk">
            {riskTags.map((tag) => (
              <span
                key={tag.label}
                className={`ana-tag risk-${tag.level === '预警' ? 'high' : 'mid'}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
          <h4>核心风控指标</h4>
          <ol className="ana-driver-list">
            {credit.coreRisks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </div>
      <div className="ana-figure">
        <h4>
          客户策略（名单制）
          <AnalysisSourceBadge sourceKey="aiCredit" />
        </h4>
        <table className="ana-table">
          <thead>
            <tr>
              <th>客户分层</th>
              <th>授信策略</th>
            </tr>
          </thead>
          <tbody>
            {credit.strategy.map((item) => (
              <tr key={item.tier}>
                <td>
                  <b>{item.tier}</b>
                </td>
                <td className="ana-cell-text">{item.policy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ana-credit-foot">
        <div>
          <span>第一还款来源</span>
          <p>{credit.firstRepayment}</p>
        </div>
        <div>
          <span>授信条件与管理要求</span>
          <ul>
            {credit.conditions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>退出与重检触发</span>
          <p>{credit.exit}</p>
        </div>
        <div>
          <span>结论</span>
          <p>
            行业规模 {fmt(overview.marketSize)} 亿元、产能利用率 {overview.capacityUtilization}%、
            景气度 {overview.industryScore}/100，建议「{credit.strategy[0].tier}优先、
            {credit.strategy[3].tier}控制」。
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 核心结论

export function ConclusionSection({ segment }) {
  return (
    <section className="ana-section ana-conclusion" id="ana-sec-conclusion">
      <SectionHead
        index="09"
        title="核心结论"
        question="一页看懂该环节的投资与授信要点"
        source="aiJudgement"
      />
      <div className="ana-conclusion-grid">
        {segment.conclusions.map((item) => (
          <div key={item.index} className="ana-conclusion-card">
            <span className="ana-conclusion-index">{item.index}</span>
            <h4>{item.title}</h4>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
      <p className="ana-note">
        {segment.mockNote}
        各个字段的具体来源见页面右上角「数据来源说明」：企业档案类为入库真实口径，行业规模、产能、集中度与评分类为
        AI 估算， 并已逐项列明替换为准确数据所需对接的数据源。本报告为 AI
        辅助分析结果，不替代银行正式授信审批；引用前请核对最新公开数据。
      </p>
    </section>
  );
}
