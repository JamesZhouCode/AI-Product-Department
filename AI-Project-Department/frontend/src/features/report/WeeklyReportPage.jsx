import { useMemo } from 'react';
import { chainLabelFor } from '../../chainPalette';
import { buildIndustrySnapshot, getWeekRange, shorten } from '../insights/industryModel';
import './report.css';

function SectionHeading({ eyebrow, title, chip, tone = '' }) {
  return (
    <div className="report-section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {chip && <span className={`section-chip ${tone}`}>{chip}</span>}
    </div>
  );
}

function regionLabelFor(company) {
  return [company.region?.province, company.region?.city].filter(Boolean).join(' · ') || '区域待补';
}

function FocusCompany({ company, index }) {
  const signal =
    company.coreTechnology || company.products || company.procurement || '核心信息待补充';
  return (
    <article className="focus-card">
      <span className="focus-rank">{String(index + 1).padStart(2, '0')}</span>
      <div className="focus-body">
        <div className="focus-title">
          <b>{company.name}</b>
          <span>上市企业</span>
        </div>
        <small>
          {chainLabelFor(company.chain, company.primaryIndustry)} ·{' '}
          {company.sector || '细分环节待补齐'} · {regionLabelFor(company)}
        </small>
        <p>{shorten(signal, 54)}</p>
      </div>
      <span className="focus-arrow" aria-hidden="true">
        ↗
      </span>
    </article>
  );
}

function ChainScanRow({ stat, maxCount }) {
  return (
    <div className="chain-scan-row">
      <div className="chain-scan-name">
        <i style={{ '--chain-color': stat.color }} />
        <div>
          <b>{stat.label}</b>
          <small>{stat.topSector}</small>
        </div>
      </div>
      <div className="chain-scan-meter" aria-label={`${stat.label} ${stat.count} 家上市企业`}>
        <span
          style={{
            '--chain-color': stat.color,
            width: `${Math.max(8, (stat.count / maxCount) * 100)}%`,
          }}
        />
      </div>
      <strong>{stat.count}</strong>
      <span className="chain-scan-unit">家</span>
      <span className="chain-scan-relations">{stat.relationCount} 关系</span>
    </div>
  );
}

function SignalPill({ token, accent }) {
  return (
    <span className="report-signal-pill" style={{ '--signal-accent': accent }}>
      {token.label}
      <b>{token.count}</b>
    </span>
  );
}

export default function WeeklyReportPage({ data, selectedIndustry = '集成电路' }) {
  const model = useMemo(
    () => buildIndustrySnapshot(data, selectedIndustry),
    [data, selectedIndustry],
  );
  const weekRange = useMemo(() => getWeekRange(), []);
  const story = model.story;
  const chainStats = model.secondaryStats.filter((stat) => stat.count > 0);
  const linkedChainCount = chainStats.filter((stat) => stat.relationCount > 0).length;
  const maxChainCount = Math.max(1, ...chainStats.map((stat) => stat.count));
  const focusCompanies = model.topCompanies.slice(0, 4);
  const signalTokens = model.technologies.slice(0, 8);
  const topPeers = model.peers.slice(0, 3);
  const topChain = chainStats[0];
  const topSector = model.sectors[0];
  const topTechnology = model.technologies[0];
  const profileGapCount = model.companies.filter(
    (company) => !company.coreTechnology || !company.products,
  ).length;
  const relationBreakdown = ['供应', '经销', '股权']
    .map((type) => `${type} ${model.counts[type] || 0}`)
    .join(' · ');

  const insights = [
    {
      label: '网络结构',
      title: topPeers.length
        ? `关系连接集中在 ${topPeers[0].label} 等节点`
        : '上市企业关系网络仍待补齐',
      body: `${model.companies.length} 家上市企业形成 ${model.relations.length} 条企业内关系，${relationBreakdown}。`,
      metric: `${model.relations.length} 条关系`,
      tone: 'blue',
    },
    {
      label: '链路焦点',
      title: topChain ? `${topChain.label}是当前最密集的观察入口` : '二级链路待形成观察入口',
      body: topChain
        ? `覆盖 ${topChain.count} 家上市企业，主要落在“${topChain.topSector}”；可优先结合企业关系和区域分布继续下钻。`
        : '当前产业链暂无可用的二级链路统计。',
      metric: topChain ? `${topChain.count} 家上市企业` : '待补',
      tone: 'orange',
    },
    {
      label: '技术信号',
      title: topTechnology ? `“${topTechnology.label}”是高频字段信号` : '技术与产品字段待补充',
      body: topSector
        ? `高频技术/产品词与“${topSector.label}”共同构成当前企业画像入口，适合用于客户沟通前的快速预判。`
        : '从企业技术、产品和采购品字段中继续提取可行动信号。',
      metric: topTechnology ? `${topTechnology.count} 家提及` : '待补',
      tone: 'teal',
    },
  ];

  return (
    <main className="insight-page report-page">
      <section className="report-masthead">
        <div className="report-masthead-main">
          <div className="report-kicker">本周产业链周报</div>
          <div className="report-title-row">
            <div>
              <h1>{model.label}</h1>
              <p>
                {weekRange} <b>·</b> 从企业关系、链路结构和技术字段中提取本周观察重点
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="report-grid report-grid-main">
        <article className="report-panel report-brief">
          <SectionHeading eyebrow="01 / WEEKLY READOUT" title="本周研判" chip="数据摘要" />
          <div className="report-brief-lead">
            <span>一句话判断</span>
            <h2>{story.headline}</h2>
            <p>
              当前页面以上市企业、企业关系和画像字段为依据，帮助客户经理快速找到链路入口、关系节点和下一步补充方向。
            </p>
          </div>
          <div className="report-insight-list">
            {insights.map((item) => (
              <article className={`report-insight-row ${item.tone}`} key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
                <strong>{item.metric}</strong>
              </article>
            ))}
          </div>
        </article>

        <aside className="report-panel report-focus">
          <SectionHeading
            eyebrow="02 / COMPANY WATCH"
            title="上市企业观察"
            chip="优先关注"
            tone="warm"
          />
          <p className="panel-intro">
            按研究字段完整度排序，先看清楚企业做什么，再结合地图位置和上下游关系安排走访。
          </p>
          <div className="focus-list">
            {focusCompanies.length ? (
              focusCompanies.map((company, index) => (
                <FocusCompany company={company} index={index} key={company.id} />
              ))
            ) : (
              <div className="report-empty">当前产业链暂无可展示企业。</div>
            )}
          </div>
        </aside>
      </section>

      <section className="report-grid report-grid-secondary">
        <article className="report-panel report-chain-panel">
          <SectionHeading
            eyebrow="03 / CHAIN SCAN"
            title="二级链路扫描"
            chip="企业分布"
            tone="green"
          />
          <p className="panel-intro">看企业集中在哪些二级链路，以及这些链路当前承载了多少关系。</p>
          <div className="chain-scan-list">
            {chainStats.map((stat) => (
              <ChainScanRow key={stat.id} stat={stat} maxCount={maxChainCount} />
            ))}
          </div>
        </article>

        <article className="report-panel report-signal-panel">
          <SectionHeading
            eyebrow="04 / SIGNAL DESK"
            title="技术与产品信号"
            chip="字段热词"
            tone="purple"
          />
          <div className="signal-block">
            <span className="signal-block-label">高频技术 / 产品词</span>
            <div className="report-signal-cloud">
              {(signalTokens.length ? signalTokens : [{ label: '待补技术字段', count: 0 }]).map(
                (token, index) => (
                  <SignalPill key={`${token.label}-${index}`} token={token} accent={story.accent} />
                ),
              )}
            </div>
          </div>
          <div className="signal-block signal-block-lower">
            <span className="signal-block-label">高频细分环节</span>
            <div className="sector-chip-list">
              {(model.sectors.length
                ? model.sectors.slice(0, 5)
                : [{ label: '细分环节待补齐', count: 0 }]
              ).map((sector) => (
                <span key={sector.label}>
                  {sector.label}
                  <b>{sector.count}</b>
                </span>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="report-panel report-action-panel">
        <SectionHeading eyebrow="05 / NEXT MOVES" title="链上可以挖掘的信息" chip="下一步线索" />
        <div className="report-action-grid">
          <article className="report-action-card">
            <span>01</span>
            <div>
              <b>关系节点</b>
              <strong>
                {topPeers.length
                  ? topPeers.map((peer) => `${peer.label}（${peer.count}）`).join(' · ')
                  : '关系待补齐'}
              </strong>
              <small>优先查看高频企业与供应、经销关系，寻找可转化的上下游名单。</small>
            </div>
          </article>
          <article className="report-action-card">
            <span>02</span>
            <div>
              <b>链路交叉</b>
              <strong>
                {linkedChainCount
                  ? `${linkedChainCount} 条二级链路已出现关系连接`
                  : '二级链路连接待补齐'}
              </strong>
              <small>从跨链路连接处寻找材料、装备、设计、制造、封测与配套之间的协同机会。</small>
            </div>
          </article>
          <article className="report-action-card">
            <span>03</span>
            <div>
              <b>画像补全</b>
              <strong>{profileGapCount} 家上市企业的技术或产品字段仍有缺口</strong>
              <small>进入企业详情补充关键字段，下一版周报即可形成更稳定的客户判断。</small>
            </div>
          </article>
        </div>
      </section>

      <footer className="report-footer">
        <span>周报口径：上市企业、企业关系与画像字段的本地数据研判。</span>
        <span>实时新闻源接入位已预留 · 当前版本不请求外部资讯服务</span>
      </footer>
    </main>
  );
}
