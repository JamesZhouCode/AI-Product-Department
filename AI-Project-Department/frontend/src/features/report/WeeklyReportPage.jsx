import { useEffect, useMemo, useState } from 'react';
import { chainLabelFor, industryGroupFor } from '../../chainPalette';
import { buildIndustrySnapshot, getWeekRange, shorten } from '../insights/industryModel';
import { analyzeCompanyRecent } from './companyRecent';
import {
  CATEGORY_META,
  SENTIMENT_META,
  buildSentimentDigest,
  companyAliases,
} from './sentimentModel';
import { buildStorageWeeklyModel, describeCompany } from './storageWeeklyModel';
import './report.css';

// 周报走「链驱动」分支的行业：储能产业（7 个一级环节）、算力产业（4 个一级环节）
// 与集成电路（7 个一级环节，来自 ic-chain.json）。
const CHAIN_URL_BY_INDUSTRY = {
  集成电路: 'data/industries/ic-chain.json',
  储能产业: 'data/industries/storage-chain.json',
  算力产业: 'data/industries/compute-chain.json',
};
// 舆情与企业近况快照目前只有储能版；算力产业无对应抓取源，按「暂无舆情库」如实标注。
const STORAGE_SENTIMENT_URL = 'data/industries/storage-weekly-sentiment.json';
const STORAGE_COMPANY_DIGEST_URL = 'data/industries/storage-company-digest.json';

function chainUrlFor(industry) {
  return CHAIN_URL_BY_INDUSTRY[industry] || CHAIN_URL_BY_INDUSTRY['储能产业'];
}

// 链数据体积较大（1.7—3MB），按会话常驻缓存，来回切换 tab 不重复请求。
const chainCache = new Map();
let storageSentimentCache = null;
let storageCompanyDigestCache = null;

function useChainData(industry, enabled) {
  const url = chainUrlFor(industry);
  const [chain, setChain] = useState(chainCache.get(url) || null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    const cached = chainCache.get(url);
    if (cached) {
      setChain(cached);
      return undefined;
    }
    let cancelled = false;
    setChain(null);
    setError('');
    fetch(new URL(url, document.baseURI).href)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        chainCache.set(url, payload);
        setChain(payload);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message || '数据加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, url]);

  return { chain, error };
}

/**
 * 舆情快照（由 scripts/prepare-storage-sentiment.mjs 抓取生成）。
 * 抓取失败或文件缺失时静默回落，不影响产业链正文；因此不向外抛错误态。
 */
function useStorageSentimentData(enabled) {
  const [payload, setPayload] = useState(storageSentimentCache);

  useEffect(() => {
    if (!enabled) return undefined;
    if (storageSentimentCache) {
      setPayload(storageSentimentCache);
      return undefined;
    }
    let cancelled = false;
    fetch(new URL(STORAGE_SENTIMENT_URL, document.baseURI).href)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        storageSentimentCache = data;
        setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return payload;
}

/**
 * 企业近况快照（由 scripts/prepare-company-digest.mjs 抓取生成）。
 * 与舆情快照一样属于「有则更好」的数据：缺失时「重点关注企业」仍可用，
 * 只是每家企业显示「暂无」近况。
 */
function useStorageCompanyDigest(enabled) {
  const [payload, setPayload] = useState(storageCompanyDigestCache);

  useEffect(() => {
    if (!enabled) return undefined;
    if (storageCompanyDigestCache) {
      setPayload(storageCompanyDigestCache);
      return undefined;
    }
    let cancelled = false;
    fetch(new URL(STORAGE_COMPANY_DIGEST_URL, document.baseURI).href)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        storageCompanyDigestCache = data;
        setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return payload;
}

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

/* ---------------- 通用版式（非储能行业回落分支） ---------------- */

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

function GenericReport({ model, weekRange }) {
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

  // 链路交叉提示按本产业链自己的环节名生成，避免写死其他行业的环节（如集成电路的「封测」）。
  const crossChainHint = model.stages.length
    ? `从跨链路连接处寻找${model.stages
        .slice(0, 4)
        .map((stage) => stage.label)
        .join('、')}之间的协同机会。`
    : '从跨链路连接处寻找上下游环节之间的协同机会。';

  return (
    <>
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
              <small>{crossChainHint}</small>
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
    </>
  );
}

/* ---------------- 通用小组件 ---------------- */

/** 展开 / 收起按钮：仅在「展示条数 < 总条数」时出现。 */
function MoreButton({ total, shown, expanded, onToggle, label = '' }) {
  if (total <= shown) return null;
  return (
    <button type="button" className="more-btn" onClick={onToggle} aria-expanded={expanded}>
      {expanded ? '收起' : `展开全部 ${total} 条`}
      {label ? <em>{label}</em> : null}
      <i aria-hidden="true">{expanded ? '▲' : '▼'}</i>
    </button>
  );
}

/* ---------------- 本周研判：行业舆情研判报告 ---------------- */

const SENTIMENT_BY_KEY = new Map(SENTIMENT_META.map((item) => [item.key, item]));
const CATEGORY_BY_KEY = new Map(CATEGORY_META.map((item) => [item.key, item]));

function sentimentOf(key) {
  return SENTIMENT_BY_KEY.get(key) || SENTIMENT_BY_KEY.get('neutral');
}

function shortDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[2])}月${Number(match[3])}日` : '本期';
}

/** 情绪概览：指数 + 正/中/负堆叠条。 */
function SentimentGauge({ sentiment }) {
  const total = Math.max(1, sentiment.total);
  return (
    <div className="sentiment-gauge">
      <div className="sentiment-gauge-head">
        <div>
          <span className="sentiment-gauge-label">行业情绪指数</span>
          <b className="sentiment-gauge-value">{sentiment.index}</b>
          <em>/ 100</em>
        </div>
        <span
          className={`sentiment-mood tone-${sentiment.index >= 62 ? 'pos' : sentiment.index >= 46 ? 'mid' : 'neg'}`}
        >
          {sentiment.mood}
        </span>
      </div>
      <div
        className="sentiment-track"
        role="img"
        aria-label={`正面 ${sentiment.positive} 条、中性 ${sentiment.neutral} 条、负面 ${sentiment.negative} 条，共 ${sentiment.total} 条`}
      >
        {SENTIMENT_META.map((meta) =>
          sentiment[meta.key] ? (
            <span
              key={meta.key}
              className={`sentiment-seg seg-${meta.tone}`}
              style={{ width: `${(sentiment[meta.key] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="sentiment-legend">
        {SENTIMENT_META.map((meta) => (
          <span key={meta.key}>
            <i style={{ background: meta.color }} />
            {meta.label}
            <b>{sentiment[meta.key]}</b>
            <em>{Math.round((sentiment[meta.key] / total) * 100)}%</em>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 单条舆情。标题可直接跳转原文，便于核实。 */
function NewsRow({ item, withSummary = false }) {
  const meta = sentimentOf(item.sentiment);
  const category = CATEGORY_BY_KEY.get(item.category);
  return (
    <article className={`news-row tone-${meta.tone}`}>
      <i className="news-dot" style={{ background: meta.color }} title={meta.label} />
      <div className="news-body">
        <a className="news-title" href={item.url} target="_blank" rel="noreferrer">
          {item.title}
        </a>
        {withSummary && item.summary ? <p className="news-summary">{item.summary}</p> : null}
        <div className="news-meta">
          <span className={`news-tag tag-${category?.tone || 'gray'}`}>
            {category?.label || '行业动态'}
          </span>
          <span>{item.source}</span>
          <span>{shortDate(item.publishedAt)}</span>
          {item.channel ? <span>{item.channel}</span> : null}
          <span className={`news-sentiment tone-${meta.tone}`}>{meta.label}</span>
        </div>
      </div>
    </article>
  );
}

/** 主题热度：按分类条目数排列，条宽表达占比。 */
function ThemeBars({ categories, total }) {
  const max = Math.max(1, ...categories.map((row) => row.count));
  return (
    <div className="theme-list">
      {categories.map((row) => (
        <div className="theme-row" key={row.key} title={row.hint}>
          <span className={`theme-name tag-${row.tone}`}>{row.label}</span>
          <span className="theme-bar" aria-label={`${row.label} ${row.count} 条，占 ${row.share}%`}>
            <i
              className={`bar-${row.tone}`}
              style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }}
            />
          </span>
          <b>{row.count}</b>
          <em>{Math.round((row.count / Math.max(1, total)) * 100)}%</em>
        </div>
      ))}
    </div>
  );
}

/** 舆情涉及的链上上市企业：直接给出梯位与环节，便于转成拜访线索。 */
function CompanyChips({ companies }) {
  if (!companies.length) {
    return <p className="report-empty-inline">本期舆情未命中链上上市企业简称。</p>;
  }
  return (
    <div className="company-chips">
      {companies.map((company) => (
        <span className="company-chip" key={company.name} title={company.level1}>
          <b>{company.name}</b>
          {company.tierLabel ? (
            <em className={`tier-chip tier-${company.tier}`}>{company.tierLabel}</em>
          ) : null}
          <i>{company.count}</i>
        </span>
      ))}
    </div>
  );
}

/** 主题分栏：默认展示前 visible 条，多于展示条数时给出「展开全部」按钮。 */
function CategoryColumn({ title, hint, items, tone, total, visible = 4, withSummary = false }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, visible);
  return (
    <div className={`news-col col-${tone}`}>
      <span className="signal-block-label">
        {title}（{total} 条）
      </span>
      <small className="news-col-hint">{hint}</small>
      <div className="news-list">
        {items.length ? (
          shown.map((item) => <NewsRow item={item} key={item.id} withSummary={withSummary} />)
        ) : (
          <span className="report-empty-inline">本期该主题暂无有效条目。</span>
        )}
      </div>
      <MoreButton
        total={items.length}
        shown={visible}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
    </div>
  );
}

/** 技术与产品信号分栏（技术路线突破 / 新产品发布 / 产品价格与成本）。 */
function SignalColumn({ column, visible = 4 }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? column.items : column.items.slice(0, visible);
  return (
    <div className={`signal-col sig-${column.key}`}>
      <div className="signal-col-head">
        <i style={{ background: column.accent }} />
        <span>{column.label}</span>
        <b>{column.count}</b>
      </div>
      <small className="news-col-hint">{column.hint}</small>
      <div className="news-list">
        {column.items.length ? (
          shown.map((item) => <NewsRow item={item} key={item.id} />)
        ) : (
          <span className="report-empty-inline">本期该信号暂无有效条目。</span>
        )}
      </div>
      <MoreButton
        total={column.items.length}
        shown={visible}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
    </div>
  );
}

/**
 * 模块 01：本周研判（行业舆情研判报告）。
 * 有舆情快照时以舆情为主线、链上结构为印证；没有快照时回落到纯链上研判。
 */
function WeeklyReadout({ model, sentiment, industry = '储能产业' }) {
  const { readout } = model;
  const industryShort = String(industry).replace(/产业$/, '');

  if (!sentiment || !sentiment.meta.itemCount) {
    return (
      <article className="report-panel report-brief">
        <SectionHeading
          eyebrow="01 / WEEKLY READOUT"
          title="本周研判"
          chip={`${industryShort}链数据摘要`}
          tone="green"
        />
        <div className="report-brief-lead">
          <span>一句话判断</span>
          <h2>{readout.headline}</h2>
          <p>{readout.lead}</p>
        </div>
        <div className="report-insight-list">
          {readout.insights.map((item) => (
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
        <p className="report-panel-note">
          舆情快照未就绪（可执行 <code>pnpm prepare:sentiment</code>{' '}
          抓取），当前仅展示链上结构研判。
        </p>
      </article>
    );
  }

  const {
    meta,
    sentiment: mood,
    categories,
    companies,
    newsSummary,
    top,
    policy,
    price,
    bidding,
    overseas,
    risk,
    riskNote,
  } = sentiment;
  const countOf = (key) => categories.find((row) => row.key === key)?.count ?? 0;

  return (
    <article className="report-panel report-brief report-readout">
      <SectionHeading
        eyebrow="01 / WEEKLY READOUT"
        title="本周研判"
        chip={`行业舆情 · ${meta.itemCount} 条 · ${meta.windowLabel}`}
        tone="green"
      />

      <div className="report-brief-lead">
        <span>本周总结 · 情绪判断</span>
        <h2>{sentiment.headline}</h2>
        <p>{sentiment.lead}</p>
      </div>

      {newsSummary ? (
        <div className="brief-digest">
          <div className="brief-digest-head">
            <span className="signal-block-label">抓取内容总结</span>
            <small>{newsSummary.count} 条主线 · 标题可跳原文</small>
          </div>
          <p className="brief-digest-overview">{newsSummary.overview}</p>
          {newsSummary.points.length ? (
            <ul className="brief-digest-list">
              {newsSummary.points.map((point) => (
                <li className={`brief-digest-item tone-${point.tone}`} key={point.key}>
                  <b className="brief-digest-tag" title={point.phrase}>
                    {point.label}
                  </b>
                  <span className="brief-digest-count">{point.count} 条</span>
                  <div className="brief-digest-body">
                    {point.lead ? (
                      <a
                        className="brief-digest-lead"
                        href={point.lead.url}
                        target="_blank"
                        rel="noreferrer"
                        title={point.lead.title}
                      >
                        {point.lead.title}
                      </a>
                    ) : null}
                    {point.more.length ? (
                      <small className="brief-digest-more">
                        {point.more.map((item, index) => (
                          <span key={item.id}>
                            {index > 0 ? <em>·</em> : null}
                            <a href={item.url} target="_blank" rel="noreferrer" title={item.title}>
                              {item.title}
                            </a>
                          </span>
                        ))}
                      </small>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="readout-grid">
        <div className="readout-left">
          <SentimentGauge sentiment={mood} />
          <div className="signal-block">
            <span className="signal-block-label">
              主题分布（{categories.length} 类 · 舆情共 {meta.itemCount} 条）
            </span>
            <ThemeBars categories={categories} total={meta.itemCount} />
          </div>
          <div className="signal-block">
            <span className="signal-block-label">舆情涉及的链上上市企业</span>
            <CompanyChips companies={companies} />
          </div>
        </div>

        <div className="readout-right">
          <span className="signal-block-label">重点舆情（标题可跳原文）</span>
          <div className="news-list">
            {top.map((item) => (
              <NewsRow item={item} key={item.id} withSummary />
            ))}
          </div>
        </div>
      </div>

      <div className="readout-split">
        <CategoryColumn
          title="政策与机制要点"
          hint="规划、电价机制、并网规则、标准监管"
          items={policy}
          total={countOf('policy')}
          tone="blue"
        />
        <CategoryColumn
          title="价格与招投标"
          hint="系统/EPC 单价、集采与框架采购"
          items={[...price, ...bidding]}
          total={countOf('price') + countOf('bidding')}
          tone="orange"
        />
        <CategoryColumn
          title="出海与海外订单"
          hint="出口、海外长协、海外建厂与贸易壁垒"
          items={overseas}
          total={countOf('overseas')}
          tone="purple"
        />
      </div>

      <div className="readout-risk">
        <span className="signal-block-label">风险提示</span>
        <p className="readout-risk-note">{riskNote}</p>
        <div className="news-list">
          {risk.map((item) => (
            <NewsRow item={item} key={item.id} />
          ))}
        </div>
      </div>

      <footer className="readout-source">
        <span>
          数据来源：{meta.sources.map((source) => `${source.name} ${source.count} 条`).join('、')}
          （共 {meta.sources.length} 家 · 抓取于{' '}
          {meta.generatedAt ? meta.generatedAt.slice(0, 10) : '本期'}）
        </span>
        <span>
          规则化分类与情绪判定，仅作行业舆情方向参考，不构成投资或授信建议；原文链接可点击核对。
        </span>
      </footer>
    </article>
  );
}

/* ---------------- 模块 02：技术与产品信号（资讯快照） ---------------- */

function TechSignalPanel({ sentiment, industry = '储能产业' }) {
  const signals = sentiment?.signals || [];
  const total = signals.reduce((sum, column) => sum + column.count, 0);

  return (
    <article className="report-panel report-signal-panel">
      <SectionHeading
        eyebrow="02 / SIGNAL DESK"
        title="技术与产品信号"
        chip={total ? `资讯快照 · ${total} 条信号` : '资讯快照'}
        tone="purple"
      />
      <p className="panel-intro">
        从本期抓取的{String(industry).replace(/产业$/, '')}
        公开资讯里，按技术路线突破、新产品发布、产品价格与成本三类信号提炼，
        标题可直接跳转原文核对；当前行业暂无舆情抓取源时，本节按链上信号呈现。
      </p>
      {total ? (
        <div className="signal-columns">
          {signals.map((column) => (
            <SignalColumn column={column} key={column.key} />
          ))}
        </div>
      ) : (
        <div className="report-empty">
          {String(industry).replace(/产业$/, '')}
          暂无舆情资讯快照，技术信号一节暂无内容（储能版可执行 <code>
            pnpm prepare:sentiment
          </code>{' '}
          抓取；算力产业的抓取源待接入）。
        </div>
      )}
    </article>
  );
}

/* ---------------- 模块 03：重点关注企业 ---------------- */

const FOCUS_STORAGE_KEY = 'report.storage.focusCompanies';

const ANALYSIS_MODE = {
  snapshot: '企业近况快照',
  local: '本期舆情快照',
  none: '暂无',
};

function readFocusNames() {
  try {
    const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((name) => typeof name === 'string' && name);
  } catch {
    return null;
  }
}

function FocusCompanyCard({ company, recent, analysis, onAnalyze, onRemove }) {
  const state = analysis || { status: 'idle' };
  return (
    <article className="watch-card">
      <header className="watch-head">
        <div>
          <b>{company.name}</b>
          {company.tierLabel ? (
            <span className={`tier-chip tier-${company.tier}`}>{company.tierLabel}</span>
          ) : null}
          <em className="watch-code">
            {company.board}
            {company.code ? ` ${company.code}` : ''}
          </em>
        </div>
        <button
          type="button"
          className="watch-remove"
          onClick={onRemove}
          title="移除关注"
          aria-label={`移除 ${company.name}`}
        >
          ×
        </button>
      </header>
      <small className="watch-path">
        {company.level1}
        {company.level2 ? ` · ${company.level2}` : ''}
      </small>
      <div className="watch-recent">
        <span className="watch-recent-label">最近情况</span>
        <p>{recent || '暂无'}</p>
      </div>
      <div className="watch-actions">
        <span className="watch-meta">
          {typeof company.region === 'string' ? company.region : regionLabelFor(company)} · 关系{' '}
          {company.relationCount}
        </span>
        <button
          type="button"
          className="watch-analyze"
          onClick={onAnalyze}
          disabled={state.status === 'loading'}
        >
          {state.status === 'loading' ? '分析中…' : '近况分析'}
        </button>
      </div>
      {state.status === 'done' ? (
        <div className={`watch-analysis mode-${state.mode}`}>
          <div className="watch-analysis-head">
            <span className="watch-mode">{ANALYSIS_MODE[state.mode] || '近况'}</span>
            <em>{state.note}</em>
          </div>
          <p className="watch-analysis-summary">{state.summary || '暂无'}</p>
          {state.items?.length ? (
            <div className="news-list">
              {state.items.slice(0, 4).map((item) => (
                <NewsRow item={item} key={item.id} />
              ))}
            </div>
          ) : (
            <span className="report-empty-inline">暂无相关近况条目。</span>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** 添加关注企业：输入简称即时筛选链上企业清单。 */
function CompanyPicker({ options, exclude, onAdd }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return [];
    return options.filter((name) => name.includes(keyword) && !exclude.has(name)).slice(0, 8);
  }, [query, options, exclude]);

  const commit = (name) => {
    if (!name) return;
    onAdd(name);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="company-picker">
      <input
        type="search"
        value={query}
        placeholder="添加关注企业（输入简称，如：宁德时代）"
        aria-label="添加关注企业"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(matches[0]);
        }}
      />
      {open && query.trim() ? (
        <div className="company-picker-list">
          {matches.length ? (
            matches.map((name) => (
              <button
                type="button"
                key={name}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(name);
                }}
              >
                {name}
              </button>
            ))
          ) : (
            <span>没有匹配的链上企业</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FocusCompaniesPanel({ chainCompanies, digest, corpusItems, fallbackNames }) {
  const companyByName = useMemo(
    () => new Map((chainCompanies || []).map((company) => [company.name, company])),
    [chainCompanies],
  );
  const allNames = useMemo(
    () =>
      (chainCompanies || [])
        .map((company) => company.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [chainCompanies],
  );

  // 默认关注名单优先取「有近况快照」的企业；没有近况快照时回落到链上观察名单。
  const defaults = useMemo(() => {
    const rows = digest?.companies ? Object.values(digest.companies) : [];
    if (rows.length) {
      return rows
        .sort(
          (a, b) =>
            String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) ||
            (b.count || 0) - (a.count || 0),
        )
        .slice(0, 6)
        .map((row) => row.name);
    }
    return fallbackNames || [];
  }, [digest, fallbackNames]);

  const [stored, setStored] = useState(() => readFocusNames());
  const [analysis, setAnalysis] = useState({});
  const names = stored ?? defaults;

  useEffect(() => {
    if (!stored) return;
    try {
      window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // 隐私模式下 localStorage 不可写：仅本次会话生效，不影响展示。
    }
  }, [stored]);

  const recentByName = useMemo(() => {
    const map = new Map();
    Object.values(digest?.companies || {}).forEach((row) =>
      map.set(row.name, row.summary || '暂无'),
    );
    return map;
  }, [digest]);

  const cards = useMemo(
    () =>
      names
        .map((name) => companyByName.get(name) || describeCompany({ name }))
        .filter((company) => company.name),
    [names, companyByName],
  );

  const addCompany = (name) =>
    setStored((previous) => {
      const base = previous ?? defaults;
      return base.includes(name) ? base : [...base, name];
    });

  const removeCompany = (name) =>
    setStored((previous) => (previous ?? defaults).filter((item) => item !== name));

  const analyze = async (name) => {
    if (analysis[name]?.status === 'loading') return;
    setAnalysis((previous) => ({ ...previous, [name]: { status: 'loading' } }));
    let result;
    try {
      result = await analyzeCompanyRecent(name, {
        aliases: companyAliases(companyByName.get(name) || { name }),
        digest,
        corpus: corpusItems,
      });
    } catch (error) {
      result = { mode: 'none', items: [], summary: '暂无', note: error.message || '分析失败' };
    }
    setAnalysis((previous) => ({ ...previous, [name]: { status: 'done', ...result } }));
  };

  return (
    <article className="report-panel report-watch-panel">
      <SectionHeading
        eyebrow="03 / KEY COMPANIES"
        title="重点关注企业"
        chip={`${cards.length} 家 · 可添加`}
        tone="warm"
      />
      <div className="watch-toolbar">
        <p className="panel-intro">
          默认给出近期有公开资讯的企业；每家企业附「最近情况」摘要，点击「近况分析」可查看快照中的最新动态。
        </p>
        <CompanyPicker options={allNames} exclude={new Set(names)} onAdd={addCompany} />
      </div>
      <div className="watch-grid">
        {cards.length ? (
          cards.map((company) => (
            <FocusCompanyCard
              company={company}
              recent={recentByName.get(company.name)}
              analysis={analysis[company.name]}
              onAnalyze={() => analyze(company.name)}
              onRemove={() => removeCompany(company.name)}
              key={company.name}
            />
          ))
        ) : (
          <div className="report-empty">尚未添加关注企业，可在上方输入企业简称添加。</div>
        )}
      </div>
    </article>
  );
}

function StorageReport({ model, sentiment, digest, chainCompanies, corpusItems }) {
  const { masthead, watch, footer } = model;
  const industryShort = String(masthead.industry || '储能产业').replace(/产业$/, '');

  return (
    <>
      <section className="report-masthead">
        <div className="report-masthead-main">
          <div className="report-kicker">
            本周产业链周报<span>{industryShort}链口径</span>
          </div>
          <div className="report-title-row">
            <div>
              <h1>{masthead.industry}</h1>
              <p>{masthead.subtitle}</p>
            </div>
          </div>
          <div className="report-stat-strip">
            {masthead.stats.map((stat) => (
              <div className="report-stat" key={stat.key}>
                <span>{stat.label}</span>
                <b>
                  {stat.value}
                  <em>{stat.unit}</em>
                </b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="report-band">
        <WeeklyReadout model={model} sentiment={sentiment} industry={masthead.industry} />
      </section>

      <section className="report-band">
        <TechSignalPanel sentiment={sentiment} industry={masthead.industry} />
      </section>

      <section className="report-band">
        <FocusCompaniesPanel
          chainCompanies={chainCompanies}
          digest={digest}
          corpusItems={corpusItems}
          fallbackNames={(watch || []).map((company) => company.name)}
        />
      </section>

      <footer className="report-footer">
        <span>{footer.scope}</span>
        <span>{footer.note}</span>
      </footer>
    </>
  );
}

/* ---------------- 页面 ---------------- */

export default function WeeklyReportPage({ data, selectedIndustry = '集成电路' }) {
  // 走链驱动分支的行业：储能产业与算力产业（其余行业仍走通用的行业快照分支）。
  const isChainReport = Boolean(CHAIN_URL_BY_INDUSTRY[selectedIndustry]);
  const isStorage = industryGroupFor(selectedIndustry) === 'storage';
  const model = useMemo(
    () => buildIndustrySnapshot(data, selectedIndustry),
    [data, selectedIndustry],
  );
  const weekRange = useMemo(() => getWeekRange(), []);
  const { chain: storageChain, error: storageError } = useChainData(
    selectedIndustry,
    isChainReport,
  );
  // 舆情与企业近况只有储能抓取源；算力产业如实标注「暂无舆情库」，不套用储能舆情。
  const storageSentiment = useStorageSentimentData(isStorage);
  const storageCompanyDigest = useStorageCompanyDigest(isStorage);
  const storageModel = useMemo(
    () =>
      isChainReport ? buildStorageWeeklyModel(storageChain, weekRange, selectedIndustry) : null,
    [isChainReport, storageChain, weekRange, selectedIndustry],
  );
  // 舆情条目里的企业识别依赖链上企业清单，因此等链数据到位后再聚合研判。
  const sentimentDigest = useMemo(
    () =>
      isStorage && storageSentiment
        ? buildSentimentDigest(storageSentiment, { companies: storageChain?.companies || [] })
        : null,
    [isStorage, storageSentiment, storageChain],
  );

  if (isChainReport && !storageModel) {
    return (
      <main className="insight-page report-page">
        <section className="report-masthead">
          <div className="report-masthead-main">
            <div className="report-kicker">
              本周产业链周报<span>{selectedIndustry}链口径</span>
            </div>
            <div className="report-title-row">
              <div>
                <h1>{model.label}</h1>
                <p>
                  {weekRange} <b>·</b> 正在加载{selectedIndustry}入链数据
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="report-panel">
          <div className="report-empty">
            {storageError
              ? `${selectedIndustry}数据加载失败：${storageError}`
              : `正在加载${selectedIndustry}入链数据…`}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="insight-page report-page">
      {storageModel ? (
        <StorageReport
          model={storageModel}
          sentiment={sentimentDigest}
          digest={storageCompanyDigest}
          chainCompanies={storageChain?.companies || []}
          corpusItems={storageSentiment?.items || []}
        />
      ) : (
        <GenericReport model={model} weekRange={weekRange} />
      )}
    </main>
  );
}
