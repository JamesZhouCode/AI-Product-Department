// 「宏观」页：储能产业宏观研判中枢。
//
// 模块结构对齐《储能行业宏观研判智能看板》：
//   工具栏 → 画布（关键读数 + 模块导航）→ 01 总体判断 / 02 生命周期 / 03 需求趋势 /
//   04 产业链景气 / 05 技术路线 / 06 竞争格局 / 07 风险预警 / 08 银行机会 / 09 AI 助手
//   → 附 数据底座（六类观测指标 + 历史趋势 + 读法纪律）。
//
// 与「流程」页同一套设计语言（浅灰底、白卡片细边、蓝色强调、DIN 数字），
// 滚动发生在画布内部。每个判断都给出「数据依据 / 判断逻辑 / 影响分析」并带来源徽章。
import { useCallback, useEffect, useRef, useState } from 'react';
import './macro.css';
import { MACRO_INDUSTRIES, macroDataFor, macroSourcesFor } from './macroDataFor';
import MacroSourceContext from './macroSourceContext';
import { useChainSamples } from './useChainSamples';
import MacroSourceBadge, { MacroSourceModal } from './MacroSourceBadge';

const TONE_CLASS = { up: 'is-up', watch: 'is-watch', down: 'is-down' };
const DIR_GLYPH = { up: '↑', watch: '↔', down: '↓' };

const CHAIN_STATUS_TEXT = {
  live: '环节样本为产业链地图实时数据',
  snapshot: '产业链地图未取到，环节样本回落构建期快照',
  loading: '正在读取产业链地图的环节样本',
};

/* ---------------- 通用小部件 ---------------- */

// 景气 / 风险评分条：数字 + 进度条，颜色按 tone。
function ScoreBar({ score, tone = 'up', compact = false }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <span className={`macro-score ${compact ? 'is-compact' : ''} ${TONE_CLASS[tone] ?? ''}`}>
      <i className="macro-score-track">
        <i className="macro-score-fill" style={{ width: `${value}%` }} />
      </i>
      <b>{value}</b>
    </span>
  );
}

// 景气度评分环。
function Donut({ score, grade }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(100, Number(score) || 0)) / 100;
  return (
    <div className="macro-donut">
      <svg viewBox="0 0 100 100" role="img" aria-label={`行业景气度评分 ${score} 分`}>
        <circle className="macro-donut-track" cx="50" cy="50" r={radius} />
        <circle
          className="macro-donut-value"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={`${circumference * ratio} ${circumference}`}
        />
      </svg>
      <div className="macro-donut-text">
        <b>{score}</b>
        <span>/100</span>
        <em>{grade}</em>
      </div>
    </div>
  );
}

// 判断依据三段式：数据依据 / 判断逻辑 / 影响分析。
function BasisStrip({ basis }) {
  if (!basis) return null;
  return (
    <ul className="macro-basis">
      {[
        ['数据依据', basis.data],
        ['判断逻辑', basis.logic],
        ['影响分析', basis.impact],
      ].map(([label, text]) => (
        <li key={label}>
          <b>{label}</b>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

// 模块外壳：统一编号、标题、副标题、来源标注与右上角摘要。
function ModuleShell({ id, no, title, subtitle, source, aside, children }) {
  return (
    <section className="macro-module" id={`macro-${id}`}>
      <header className="macro-module-head">
        <span className="macro-module-no">{no}</span>
        <div className="macro-module-title">
          <h3>
            {title}
            {source && <MacroSourceBadge sourceKey={source} />}
          </h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {aside}
      </header>
      <div className="macro-module-body">{children}</div>
    </section>
  );
}

function VerdictLine({ headline, text, source }) {
  return (
    <div className="macro-callout">
      <h4>
        {headline}
        <MacroSourceBadge sourceKey={source} />
      </h4>
      <p>{text}</p>
    </div>
  );
}

function BarChart({ bars, valueOf, valueText, colorOf }) {
  const width = 320;
  const height = 150;
  const baseline = 116;
  const chartTop = 20;
  const maxValue = Math.max(...bars.map(valueOf));
  const slot = width / bars.length;
  const barWidth = 30;
  return (
    <svg
      className="macro-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={bars.map((bar) => `${bar.label} ${valueText(bar)}`).join('，')}
    >
      <line x1="4" x2={width - 4} y1={baseline} y2={baseline} stroke="#d9e4eb" strokeWidth="1" />
      {bars.map((bar, index) => {
        const value = valueOf(bar);
        const barHeight = Math.max(2, ((baseline - chartTop) * value) / maxValue);
        const x = slot * index + (slot - barWidth) / 2;
        const y = baseline - barHeight;
        const color = colorOf(bar.kind);
        return (
          <g key={bar.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="3"
              fill={color.fill}
              stroke={color.stroke}
              strokeWidth="1"
              strokeDasharray={color.dashed ? '3 2' : undefined}
            />
            <text className="macro-chart-value" x={x + barWidth / 2} y={y - 5} textAnchor="middle">
              {valueText(bar)}
            </text>
            <text
              className="macro-chart-label"
              x={x + barWidth / 2}
              y={baseline + 14}
              textAnchor="middle"
            >
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ChartLegend({ legend, colorOf }) {
  return (
    <div className="macro-chart-legend">
      {legend.map((item) => (
        <span key={item.key}>
          <i
            style={{ background: colorOf(item.key).fill, borderColor: colorOf(item.key).stroke }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({ data, valueOf, valueText, colorOf }) {
  return (
    <article className="macro-chart-card">
      <header>
        <h3>
          {data.title}
          <MacroSourceBadge sourceKey={data.source} />
        </h3>
        <ChartLegend legend={data.legend} colorOf={colorOf} />
      </header>
      <BarChart bars={data.bars} valueOf={valueOf} valueText={valueText} colorOf={colorOf} />
      <p>{data.note}</p>
    </article>
  );
}

const HOURS_COLOR = {
  year: { fill: '#ddebfa', stroke: '#1d62d8' },
  half: { fill: '#dcf2ec', stroke: '#0e9274' },
};

const TARGET_COLOR = {
  actual: { fill: '#ddebfa', stroke: '#1d62d8' },
  target: { fill: '#ffffff', stroke: '#7fa4e0', dashed: true },
};

// 六维风险雷达（风险值 0–100，越大越需关注）。
function RiskRadar({ dims }) {
  const width = 400;
  const height = 300;
  const cx = 200;
  const cy = 148;
  const radius = 94;
  const angleFor = (index) => (Math.PI * 2 * index) / dims.length - Math.PI / 2;
  const pointFor = (index, ratio) => [
    cx + Math.cos(angleFor(index)) * radius * ratio,
    cy + Math.sin(angleFor(index)) * radius * ratio,
  ];
  const ratioOf = (dim) => Math.max(0.06, Math.min(1, (Number(dim.score) || 0) / 100));
  return (
    <svg
      className="macro-radar"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={dims.map((dim) => `${dim.label} ${dim.score}`).join('，')}
    >
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          className="macro-radar-ring"
          points={dims.map((_, index) => pointFor(index, ring).join(' ')).join(' ')}
        />
      ))}
      {dims.map((dim, index) => {
        const [x, y] = pointFor(index, 1);
        return <line key={dim.key} className="macro-radar-axis" x1={cx} y1={cy} x2={x} y2={y} />;
      })}
      <polygon
        className="macro-radar-area"
        points={dims.map((dim, index) => pointFor(index, ratioOf(dim)).join(',')).join(' ')}
      />
      {dims.map((dim, index) => {
        const [x, y] = pointFor(index, ratioOf(dim));
        return <circle key={`${dim.key}-dot`} className="macro-radar-dot" cx={x} cy={y} r="3" />;
      })}
      {dims.map((dim, index) => {
        const [x, y] = pointFor(index, 1.26);
        const anchor = Math.abs(x - cx) < 12 ? 'middle' : x > cx ? 'start' : 'end';
        return (
          <text
            key={`${dim.key}-label`}
            className="macro-radar-label"
            x={x}
            y={y + 3}
            textAnchor={anchor}
          >
            {`${dim.label} ${dim.score}`}
          </text>
        );
      })}
    </svg>
  );
}

/* ---------------- 页面 ---------------- */

export default function MacroPage({ selectedIndustry = '', onNavigate }) {
  // 按当前一级链取数据集：储能产业 / 算力产业各一套，导出契约完全一致。
  const {
    ASSISTANT,
    BANKING_OPPS,
    BANKING_VERDICT,
    CHAIN_OUTLOOK_NOTE,
    CHAIN_VERDICT,
    COMPETITION,
    DEMAND_MODEL,
    LIFECYCLE,
    MACRO_DISCIPLINES,
    MACRO_GROUPS,
    MACRO_KPIS,
    MACRO_META,
    MACRO_VERDICT,
    POLICY_TARGETS,
    RISK_RADAR,
    SECTOR_VERDICT,
    TECH_ROUTES,
    TECH_VERDICT,
    UTILIZATION_TREND,
  } = macroDataFor(selectedIndustry);
  const sources = macroSourcesFor(selectedIndustry);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [activeModule, setActiveModule] = useState(MACRO_META.modules[0].id);
  const bodyRef = useRef(null);
  const chain = useChainSamples(selectedIndustry);
  // 不是这两条链时如实提示，不冒充已建设行业。
  const industryMismatch = selectedIndustry && !MACRO_INDUSTRIES.includes(selectedIndustry);

  const jumpTo = useCallback((id) => {
    const body = bodyRef.current;
    const node = body?.querySelector(`#macro-${id}`);
    if (!body || !node) return;
    const offset = node.getBoundingClientRect().top - body.getBoundingClientRect().top;
    body.scrollTo({ top: body.scrollTop + offset - 8, behavior: 'smooth' });
    setActiveModule(id);
  }, []);

  // 滚动时的模块高亮：取最后一个已越过画布顶部的模块。
  const handleScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const line = body.getBoundingClientRect().top + 16;
    let current = MACRO_META.modules[0].id;
    MACRO_META.modules.forEach((module) => {
      const node = body.querySelector(`#macro-${module.id}`);
      if (node && node.getBoundingClientRect().top <= line) current = module.id;
    });
    setActiveModule((prev) => (prev === current ? prev : current));
  }, [MACRO_META]);

  // 切换产业链时回到首个模块。
  useEffect(() => {
    setActiveModule(MACRO_META.modules[0].id);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [MACRO_META]);

  const goToTab = (tab) => {
    if (typeof onNavigate === 'function') onNavigate(tab);
  };

  return (
    <MacroSourceContext.Provider value={sources}>
      <main className="macro-page">
        <header className="macro-toolbar">
          <div className="macro-title-lockup">
            <span>宏观研判中枢</span>
            <strong>{MACRO_META.industry} · 宏观研判</strong>
          </div>
          <div className="macro-toolbar-summary">
            <b>9</b> 大研判模块 <i>·</i> <b>6</b> 类观测维度 <i>·</i> <b>24</b> 项长期指标 <i>·</i>{' '}
            <b>{MACRO_META.asOf}</b> 数据截至
          </div>
          <button
            type="button"
            className="macro-source-button"
            onClick={() => setSourceModalOpen(true)}
          >
            数据来源说明
          </button>
        </header>

        {industryMismatch && (
          <p className="macro-industry-notice">
            本页目前已完成<b>{MACRO_INDUSTRIES.join('、')}</b>
            的宏观研判建设；顶部当前一级链为「{selectedIndustry}
            」，暂按储能产业口径展示，图谱 / 地图 / 周报页签会跟随该选择切换。
          </p>
        )}

        <section className="macro-canvas" aria-label={`${MACRO_META.industry}宏观研判中枢`}>
          <header className="macro-canvas-head">
            <div className="macro-canvas-headline">
              <div>
                <span className="macro-canvas-eyebrow">{MACRO_META.eyebrow}</span>
                <h2>{MACRO_META.industry}宏观研判中枢</h2>
              </div>
              <div className="macro-canvas-metrics">
                {MACRO_KPIS.map((kpi) => (
                  <div key={kpi.key}>
                    <b>{kpi.value}</b>
                    <span>
                      {kpi.label}
                      <MacroSourceBadge sourceKey={kpi.source} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <nav className="macro-modnav" aria-label="模块导航">
              {MACRO_META.modules.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  className={`macro-modnav-item ${activeModule === module.id ? 'is-active' : ''}`}
                  onClick={() => jumpTo(module.id)}
                >
                  <b>{module.no}</b>
                  {module.nav}
                </button>
              ))}
            </nav>
          </header>

          <div className="macro-canvas-body" ref={bodyRef} onScroll={handleScroll}>
            {/* 01 行业总体判断 */}
            <ModuleShell
              id="overview"
              no="01"
              title="行业总体判断"
              subtitle={`当前发展阶段：${SECTOR_VERDICT.stage}`}
              source={SECTOR_VERDICT.source}
              aside={
                <span className="macro-module-aside">
                  行业景气度 <b>{SECTOR_VERDICT.score}</b>/100
                </span>
              }
            >
              <div className="macro-verdict">
                <div className="macro-verdict-main">
                  <h3>
                    {MACRO_VERDICT.headline}
                    <MacroSourceBadge sourceKey={MACRO_VERDICT.source} />
                  </h3>
                  <p>{MACRO_VERDICT.summary}</p>
                </div>
                <div className="macro-verdict-tags">
                  {MACRO_VERDICT.tags.map((tag) => (
                    <span
                      className={`macro-verdict-tag ${TONE_CLASS[tag.tone] ?? ''}`}
                      key={tag.key}
                    >
                      <b>{tag.label}</b>
                      {tag.text}
                    </span>
                  ))}
                </div>
              </div>

              <div className="macro-overview">
                <div className="macro-overview-score">
                  <Donut score={SECTOR_VERDICT.score} grade={SECTOR_VERDICT.grade} />
                  <ul className="macro-subscores">
                    {SECTOR_VERDICT.subScores.map((item) => (
                      <li key={item.key}>
                        <span>{item.label}</span>
                        <ScoreBar score={item.score} tone={item.tone} compact />
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="macro-opp-risk">
                  <article className="macro-opp">
                    <h4>主要机会</h4>
                    <ul>
                      {SECTOR_VERDICT.opportunities.map((item) => (
                        <li key={item.title}>
                          <b>{item.title}</b>
                          <p>
                            {item.text}
                            <MacroSourceBadge sourceKey={item.source} />
                          </p>
                        </li>
                      ))}
                    </ul>
                  </article>
                  <article className="macro-risk-inline">
                    <h4>主要风险</h4>
                    <ul>
                      {SECTOR_VERDICT.risks.map((item) => (
                        <li key={item.title}>
                          <b>{item.title}</b>
                          <p>
                            {item.text}
                            <MacroSourceBadge sourceKey={item.source} />
                          </p>
                        </li>
                      ))}
                    </ul>
                  </article>
                </div>
              </div>

              <BasisStrip basis={SECTOR_VERDICT.basis} />
            </ModuleShell>

            {/* 02 行业生命周期判断 */}
            <ModuleShell
              id="lifecycle"
              no="02"
              title="行业生命周期判断"
              subtitle="创新者 → 早期采用者 → 主流市场 → 成熟市场（技术采用生命周期模型）"
              source={LIFECYCLE.source}
              aside={<span className="macro-module-aside">当前阶段 {LIFECYCLE.current}</span>}
            >
              <ol className="macro-stage-track">
                {LIFECYCLE.stages.map((stage, index) => (
                  <li
                    key={stage}
                    className={
                      index === LIFECYCLE.currentIndex
                        ? 'is-current'
                        : index < LIFECYCLE.currentIndex
                          ? 'is-done'
                          : 'is-todo'
                    }
                  >
                    <b>{stage}</b>
                    <span>
                      {index === LIFECYCLE.currentIndex
                        ? '当前阶段'
                        : index < 2
                          ? '已跨过'
                          : '待进入'}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="macro-lifecycle-metrics">
                {LIFECYCLE.metrics.map((metric) => (
                  <article key={metric.key}>
                    <header>
                      <b>{metric.label}</b>
                      <ScoreBar score={metric.score} tone={metric.tone} compact />
                    </header>
                    <p>
                      {metric.text}
                      <MacroSourceBadge sourceKey={metric.source} />
                    </p>
                  </article>
                ))}
              </div>

              <BasisStrip basis={LIFECYCLE.basis} />
            </ModuleShell>

            {/* 03 市场需求趋势分析 */}
            <ModuleShell
              id="demand"
              no="03"
              title="市场需求趋势分析"
              subtitle="Bottom-up 自下而上测算，再按四类场景交叉验证"
              source={DEMAND_MODEL.source}
              aside={
                <span className="macro-module-aside">需求中枢 {DEMAND_MODEL.result.value}</span>
              }
            >
              <div className="macro-formula">
                <code>{DEMAND_MODEL.formula}</code>
                <p>{DEMAND_MODEL.method}</p>
              </div>

              <div className="macro-factors">
                {DEMAND_MODEL.factors.map((factor) => (
                  <article key={factor.key}>
                    <header>
                      <span>{factor.label}</span>
                      <em className={`macro-dir ${TONE_CLASS[factor.dir] ?? ''}`}>
                        {DIR_GLYPH[factor.dir] ?? '↔'}
                      </em>
                    </header>
                    <b>{factor.value}</b>
                    <p>
                      {factor.text}
                      <MacroSourceBadge sourceKey={factor.source} />
                    </p>
                  </article>
                ))}
              </div>

              <div className="macro-demand-result">
                <b>{DEMAND_MODEL.result.value}</b>
                <span>{DEMAND_MODEL.result.label}</span>
                <p>
                  {DEMAND_MODEL.result.note}
                  <MacroSourceBadge sourceKey={DEMAND_MODEL.result.source} />
                </p>
              </div>

              <div className="macro-scenarios">
                {DEMAND_MODEL.scenarios.map((scenario) => (
                  <article key={scenario.key}>
                    <header>
                      <b>{scenario.label}</b>
                      <ScoreBar score={scenario.score} tone={scenario.tone} compact />
                    </header>
                    <span className={`macro-scenario-status ${TONE_CLASS[scenario.tone] ?? ''}`}>
                      {scenario.status}
                    </span>
                    <p>
                      {scenario.text}
                      <MacroSourceBadge sourceKey={scenario.source} />
                    </p>
                  </article>
                ))}
              </div>

              <BasisStrip basis={DEMAND_MODEL.basis} />
            </ModuleShell>

            {/* 04 产业链景气分析 */}
            <ModuleShell
              id="chain"
              no="04"
              title="产业链景气分析"
              subtitle="按产业链地图的环节口径逐段打分，样本规模与地图同源"
              source={CHAIN_VERDICT.source}
              aside={
                <button type="button" className="macro-link-button" onClick={() => goToTab('flow')}>
                  在产业链地图查看
                </button>
              }
            >
              <VerdictLine
                headline={CHAIN_VERDICT.headline}
                text={CHAIN_VERDICT.text}
                source={CHAIN_VERDICT.source}
              />

              <div className="macro-chain-positions">
                {chain.positions.map((position) => (
                  <section className="macro-chain-col" key={position.key}>
                    <header className={`macro-chain-col-head ${TONE_CLASS[position.tone] ?? ''}`}>
                      <b>{position.label}</b>
                      <span>{position.note}</span>
                    </header>
                    {position.levels.map((level) => (
                      <article className="macro-chain-level" key={level.label}>
                        <div className="macro-chain-level-head">
                          <b>{level.label}</b>
                          <ScoreBar score={level.score} tone={level.tone} compact />
                        </div>
                        {level.sample && (
                          <div className="macro-chain-sample">
                            <span>
                              在链 <b>{level.sample.companies}</b> 家
                            </span>
                            <span>
                              龙头 <b>{level.sample.leaders}</b>
                            </span>
                            <span>
                              二级环节 <b>{level.sample.children}</b>
                            </span>
                            <MacroSourceBadge sourceKey="chainMap" />
                          </div>
                        )}
                        <p className="macro-chain-status">{level.status}</p>
                        <ul className="macro-chain-io">
                          <li>
                            <b>机会</b>
                            {level.opportunity}
                          </li>
                          <li>
                            <b>风险</b>
                            {level.risk}
                          </li>
                        </ul>
                        <MacroSourceBadge sourceKey={level.source} />
                      </article>
                    ))}
                  </section>
                ))}
              </div>

              <p className="macro-console-note">
                {CHAIN_OUTLOOK_NOTE}
                <em className={`macro-chain-status-tag is-${chain.status}`}>
                  {CHAIN_STATUS_TEXT[chain.status]}
                </em>
              </p>

              <BasisStrip basis={CHAIN_VERDICT.basis} />
            </ModuleShell>

            {/* 05 技术路线判断 */}
            <ModuleShell
              id="tech"
              no="05"
              title="技术路线判断"
              subtitle="五条路线的成熟度、商业化阶段与切换信号"
              source={TECH_VERDICT.source}
            >
              <VerdictLine
                headline={TECH_VERDICT.headline}
                text={TECH_VERDICT.text}
                source={TECH_VERDICT.source}
              />
              <div className="macro-routes">
                {TECH_ROUTES.map((route) => (
                  <article className="macro-route" key={route.key}>
                    <header>
                      <b>{route.name}</b>
                      <span className={`macro-route-stage ${TONE_CLASS[route.tone] ?? ''}`}>
                        {route.stage}
                      </span>
                    </header>
                    <div className="macro-route-meter">
                      <span>成熟度</span>
                      <ScoreBar score={route.maturity} tone={route.tone} compact />
                    </div>
                    <p className="macro-route-share">{route.share}</p>
                    <dl className="macro-route-fields">
                      <div>
                        <dt>技术优势</dt>
                        <dd>{route.advantage}</dd>
                      </div>
                      <div>
                        <dt>技术风险</dt>
                        <dd>{route.risk}</dd>
                      </div>
                      <div>
                        <dt>未来判断</dt>
                        <dd>{route.outlook}</dd>
                      </div>
                    </dl>
                    <MacroSourceBadge sourceKey={route.source} />
                  </article>
                ))}
              </div>
              <BasisStrip basis={TECH_VERDICT.basis} />
            </ModuleShell>

            {/* 06 竞争格局变化 */}
            <ModuleShell
              id="competition"
              no="06"
              title="竞争格局变化"
              subtitle="龙头动作 · 新增产能 · 海外布局 · 新产品 · 战略合作，与三梯队分层"
              source={COMPETITION.source}
              aside={
                <button
                  type="button"
                  className="macro-link-button"
                  onClick={() => goToTab('credit')}
                >
                  在授信评价中查看分层
                </button>
              }
            >
              <div className="macro-moves">
                {COMPETITION.moves.map((move) => (
                  <article key={move.key}>
                    <h4>
                      {move.label}
                      <MacroSourceBadge sourceKey={move.source} />
                    </h4>
                    <ul>
                      {move.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              <div className="macro-tiers">
                {COMPETITION.tiers.map((tier) => (
                  <article className={`macro-tier ${TONE_CLASS[tier.tone] ?? ''}`} key={tier.key}>
                    <header>
                      <b>{tier.label}</b>
                      <span>{tier.criteria}</span>
                    </header>
                    <p className="macro-tier-members">{tier.members}</p>
                    <p className="macro-tier-evidence">
                      {tier.evidence}
                      <MacroSourceBadge sourceKey={tier.source} />
                    </p>
                    <p className="macro-tier-hint">{tier.hint}</p>
                  </article>
                ))}
              </div>

              <BasisStrip basis={COMPETITION.basis} />
            </ModuleShell>

            {/* 07 行业风险预警 */}
            <ModuleShell
              id="risk"
              no="07"
              title="行业风险预警"
              subtitle="六维风险雷达，风险值越高越需在授信条件中显性设限"
              source={RISK_RADAR.source}
            >
              <div className="macro-risk-layout">
                <div className="macro-risk-radar">
                  <RiskRadar dims={RISK_RADAR.dims} />
                </div>
                <ul className="macro-risk-list">
                  {RISK_RADAR.dims.map((dim) => (
                    <li key={dim.key}>
                      <div className="macro-risk-head">
                        <b>{dim.label}</b>
                        <span className={`macro-risk-level ${TONE_CLASS[dim.tone] ?? ''}`}>
                          {dim.level} · {dim.score}
                        </span>
                      </div>
                      <p>
                        {dim.text}
                        <MacroSourceBadge sourceKey={dim.source} />
                      </p>
                      <small>监测点：{dim.watch}</small>
                    </li>
                  ))}
                </ul>
              </div>
              <BasisStrip basis={RISK_RADAR.basis} />
            </ModuleShell>

            {/* 08 银行业务机会分析 */}
            <ModuleShell
              id="banking"
              no="08"
              title="银行业务机会分析"
              subtitle="按客群类型匹配授信产品，并给出产业经营建议"
              source={BANKING_VERDICT.source}
            >
              <VerdictLine
                headline={BANKING_VERDICT.headline}
                text={BANKING_VERDICT.text}
                source={BANKING_VERDICT.source}
              />
              <div className="macro-opps">
                {BANKING_OPPS.map((opp) => (
                  <article className={`macro-opp-card ${TONE_CLASS[opp.tone] ?? ''}`} key={opp.key}>
                    <header>
                      <b>{opp.label}</b>
                      <MacroSourceBadge sourceKey={opp.source} />
                    </header>
                    <div className="macro-opp-products">
                      {opp.products.map((product) => (
                        <span key={product}>{product}</span>
                      ))}
                    </div>
                    <p className="macro-opp-basis">{opp.basisText}</p>
                    <p className="macro-opp-action">
                      <b>建议动作</b>
                      {opp.action}
                    </p>
                    <button
                      type="button"
                      className="macro-link-button"
                      onClick={() => goToTab(opp.link.tab)}
                    >
                      {opp.link.label}
                    </button>
                  </article>
                ))}
              </div>
              <BasisStrip basis={BANKING_VERDICT.basis} />
            </ModuleShell>

            {/* 09 AI 行业分析助手 */}
            <ModuleShell
              id="assistant"
              no="09"
              title="AI 行业分析助手"
              subtitle="自动抓取七类公开信息，产出《储能行业宏观研判周报》"
              source={ASSISTANT.source}
              aside={
                <button
                  type="button"
                  className="macro-link-button"
                  onClick={() => goToTab('report')}
                >
                  前往周报
                </button>
              }
            >
              <div className="macro-assistant">
                <section className="macro-crawl">
                  <h4>
                    自动抓取源
                    <MacroSourceBadge sourceKey={ASSISTANT.source} />
                  </h4>
                  <ul>
                    {ASSISTANT.sources.map((item) => (
                      <li key={item.key}>
                        <b>{item.label}</b>
                        <span>{item.text}</span>
                        <em>{item.cadence}</em>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="macro-report">
                  <h4>{ASSISTANT.report.title}</h4>
                  <ol>
                    {ASSISTANT.report.sections.map((section) => (
                      <li key={section}>{section}</li>
                    ))}
                  </ol>
                  <p>{ASSISTANT.report.note}</p>
                </section>

                <section className="macro-cadence">
                  <h4>数据更新节奏</h4>
                  <ul>
                    {ASSISTANT.cadence.map((item) => (
                      <li key={item.key}>
                        <b>{item.label}</b>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <BasisStrip basis={ASSISTANT.basis} />
            </ModuleShell>

            {/* 附 数据底座 */}
            <ModuleShell
              id="appendix"
              no="附"
              title="数据底座：观测指标与历史趋势"
              subtitle="六类 24 项长期观测指标，是上面所有判断的原始依据"
              source={MACRO_VERDICT.source}
            >
              <div className="macro-grid">
                {MACRO_GROUPS.map((group) => (
                  <article
                    className="macro-card"
                    key={group.key}
                    style={{ '--macro-accent': group.color }}
                  >
                    <header className="macro-card-head">
                      <span className="macro-card-no">{group.no}</span>
                      <div className="macro-card-title">
                        <small>
                          {group.summary}
                          <MacroSourceBadge sourceKey={group.source} />
                        </small>
                        <h3>{group.title}</h3>
                      </div>
                      <span className="macro-card-count">
                        <b>{group.items.length}</b>
                        <span>项指标</span>
                      </span>
                    </header>
                    <ul className="macro-item-list">
                      {group.items.map((item) => (
                        <li key={item.name}>
                          <div className="macro-item-row">
                            <b>{item.name}</b>
                            <span>{item.reading}</span>
                          </div>
                          <div className="macro-item-foot">
                            <small>{item.hint}</small>
                            <MacroSourceBadge sourceKey={item.source} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              <div className="macro-duo">
                <ChartCard
                  data={UTILIZATION_TREND}
                  valueOf={(bar) => bar.value}
                  valueText={(bar) => `${bar.value}${UTILIZATION_TREND.unit || 'h'}`}
                  colorOf={(kind) => HOURS_COLOR[kind] ?? HOURS_COLOR.year}
                />
                <ChartCard
                  data={POLICY_TARGETS}
                  valueOf={(bar) => bar.value}
                  valueText={(bar) => `${bar.value}`}
                  colorOf={(kind) => TARGET_COLOR[kind] ?? TARGET_COLOR.actual}
                />
              </div>

              <div className="macro-disciplines">
                <span className="macro-legend-title">读法纪律</span>
                {MACRO_DISCIPLINES.map((item) => (
                  <article key={item.key}>
                    <h4>
                      {item.title}
                      <MacroSourceBadge sourceKey={item.source} />
                    </h4>
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </ModuleShell>
          </div>
        </section>

        {sourceModalOpen && (
          <MacroSourceModal
            onClose={() => setSourceModalOpen(false)}
            industryLabel={MACRO_META.industry}
            cadence={ASSISTANT.cadence}
          />
        )}
      </main>
    </MacroSourceContext.Provider>
  );
}
