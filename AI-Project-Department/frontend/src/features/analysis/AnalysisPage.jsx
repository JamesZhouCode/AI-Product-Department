import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CreditProfileDrawer from '../credit/CreditProfileDrawer';
import { useCreditData } from '../credit/useCreditData';
import {
  CompanySection,
  CapacitySection,
  ConclusionSection,
  CreditSection,
  HighlightsSection,
  MarketSection,
  OverviewPanel,
  RegionalSection,
  TechnologySection,
  TrendSection,
} from './analysisSections';
import {
  buildReportMarkdown,
  buildStructuredReportMarkdown,
  downloadMarkdown,
} from './analysisExport';
import { AI_INSIGHT_STEPS, buildAiInsights } from './analysisInsights';
import { analysisDataFileFor, useAnalysisData } from './useAnalysisData';
import { useReportData } from './useReportData';
import { partByKey, reportStats } from './reportModel';
import ReportReader from './ReportReader';
import AnalysisSourceBadge, { AnalysisSourceModal } from './AnalysisSourceBadge';
import '../credit/credit.css';
import './analysis.css';

const DEFAULT_INDUSTRY = '储能产业';
// 已完成「分析」页建设的行业。储能产业有 PDF 结构化研报（第一篇 / 第二篇），
// 算力产业目前只有数据驱动的环节深度分析，视图入口按行业裁剪。
const ANALYSIS_INDUSTRIES = ['储能产业', '算力产业'];
const STRUCTURED_REPORT_INDUSTRIES = ['储能产业'];

// 报告视图：与原报告「第一篇 整体分析 / 第二篇 细分领域分析」对应，
// 第三个视图是数据驱动的环节深度分析（本次会话新增的交互版，不与原报告结构冲突）。
const REPORT_VIEWS = [
  {
    key: 'part1',
    eyebrow: 'PART 1',
    label: '整体分析',
    hint: '摘要 + 行业综述 / 产业链 / 企业画像 / 存量授信 / 服务策略 / 核心成果 / 结论',
  },
  {
    key: 'part2',
    eyebrow: 'PART 2',
    label: '细分领域分析',
    hint: '上游专题（矿产资源与电池原材料）+ 中游（储能电池本体）深度分析',
  },
  {
    key: 'segment',
    eyebrow: 'DATA',
    label: '环节深度分析',
    hint: '按一级 / 二级环节查看数据驱动的 8 节分析报告，可跑 AI 深度分析',
  },
];

// 报告目录：与 8 个章节 + 核心结论一一对应，滚动时自动高亮。
const TOC = [
  { id: 'ana-sec-market', index: '01', label: '行业规模' },
  { id: 'ana-sec-region', index: '02', label: '区域产业规模' },
  { id: 'ana-sec-capacity', index: '03', label: '产能与供需' },
  { id: 'ana-sec-highlight', index: '04', label: '产业发展亮点' },
  { id: 'ana-sec-technology', index: '05', label: '技术发展特征' },
  { id: 'ana-sec-company', index: '06', label: '主要企业概况' },
  { id: 'ana-sec-trend', index: '07', label: '产业发展趋势' },
  { id: 'ana-sec-credit', index: '08', label: '银行授信视角' },
  { id: 'ana-sec-conclusion', index: '09', label: '核心结论' },
];

// AI 深度分析的分析链路（提示词第 21 章）。步骤标签与洞察维度共用一份定义，
// 避免「进度条上写了 7 项、产出却对不上」的漂移。
const AI_STEPS = AI_INSIGHT_STEPS.map((step) => step.label);

export default function AnalysisPage({ selectedIndustry, focusLevel1, focusLevel2, onViewAtlas }) {
  const industry = selectedIndustry || DEFAULT_INDUSTRY;
  // 只有储能产业有 PDF 结构化研报；算力产业直接进「环节深度分析」。
  const hasStructuredReport = STRUCTURED_REPORT_INDUSTRIES.includes(industry);
  const {
    status: dataStatus,
    data: rawData,
    error: dataError,
    refresh,
    refreshing,
  } = useAnalysisData(industry);
  // 切换产业链时，上一个行业的模型还会在 state 里停留一帧；用模型自带的 industry
  // 兜底过滤，避免把储能的一级/二级环节渲染到算力页面上。
  const data = rawData && rawData.industry === industry ? rawData : null;
  const status = rawData && !data ? 'loading' : dataStatus;
  const error = dataError;
  const {
    status: reportStatus,
    report,
    error: reportError,
    reload: reloadReport,
  } = useReportData(hasStructuredReport);
  const credit = useCreditData(industry);
  // 报告视图：part1 / part2 读结构化研报，segment 为数据驱动的环节分析。
  const [view, setView] = useState(hasStructuredReport ? 'part1' : 'segment');
  const [level1Label, setLevel1Label] = useState('');
  const [level2Label, setLevel2Label] = useState('');
  const [activeSection, setActiveSection] = useState(TOC[0].id);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [notice, setNotice] = useState('');
  // AI 深度分析的产出，按「一级环节|二级环节」缓存，切回来不必重跑。
  const [aiResults, setAiResults] = useState({});
  // 轻量操作（刷新数据 / 导出）的提示条，与 AI 链路进度面板分开展示。
  const [flash, setFlash] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');
  const scrollRef = useRef(null);
  const timersRef = useRef([]);

  const level1List = useMemo(() => data?.index || [], [data]);
  // 视图入口按行业裁剪：算力产业暂无结构化研报，只保留「环节深度分析」。
  const reportViews = useMemo(
    () =>
      hasStructuredReport ? REPORT_VIEWS : REPORT_VIEWS.filter((item) => item.key === 'segment'),
    [hasStructuredReport],
  );
  const activeLevel1 = useMemo(
    () => level1List.find((item) => item.label === level1Label) || level1List[0] || null,
    [level1List, level1Label],
  );
  const activeSegment = useMemo(() => {
    if (!data || !activeLevel1) return null;
    const label = (activeLevel1.children || []).some((child) => child.label === level2Label)
      ? level2Label
      : activeLevel1.children?.[0]?.label;
    return label ? data.byKey.get(`${activeLevel1.label}|${label}`) : null;
  }, [data, activeLevel1, level2Label]);

  // AI 深度分析的产出（按环节缓存）。未运行过 AI 分析时为 null。
  const aiInsight = activeSegment ? aiResults[activeSegment.key] || null : null;
  // 目录项：AI 结论章节只在跑过 AI 分析后出现，位置在概览之后、8 章之前。
  const toc = useMemo(
    () =>
      aiInsight
        ? [{ id: 'ana-sec-ai-insight', index: 'AI', label: 'AI 深度分析结论' }, ...TOC]
        : TOC,
    [aiInsight],
  );

  // 首次载入或从图谱跳转时定位环节。
  useEffect(() => {
    if (!data) return;
    if (focusLevel1 && level1List.some((item) => item.label === focusLevel1)) {
      setLevel1Label(focusLevel1);
      if (focusLevel2) setLevel2Label(focusLevel2);
      else setLevel2Label('');
      return;
    }
    setLevel1Label((prev) =>
      prev && level1List.some((item) => item.label === prev) ? prev : level1List[0]?.label || '',
    );
  }, [data, focusLevel1, focusLevel2, level1List]);

  // 切换一级环节后自动选中第一个二级环节（提示词第 4 章）。
  useEffect(() => {
    if (!activeLevel1) return;
    setLevel2Label((prev) =>
      (activeLevel1.children || []).some((child) => child.label === prev)
        ? prev
        : activeLevel1.children?.[0]?.label || '',
    );
  }, [activeLevel1]);

  // 自动清除定时器，避免切换环节时 AI 进度残留。
  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // 切换产业链时整体复位：视图、环节选择、AI 产出与提示条都只属于上一个行业。
  useEffect(() => {
    clearTimers();
    setView(hasStructuredReport ? 'part1' : 'segment');
    setLevel1Label('');
    setLevel2Label('');
    setSelectedCompanyId(null);
    setAiResults({});
    setAiRunning(false);
    setAiProgress(0);
    setNotice('');
    setFlash('');
    setRefreshedAt('');
    setActiveSection(TOC[0].id);
  }, [industry, hasStructuredReport, clearTimers]);

  // 「AI 深度分析」：跑 7 步链路，并在结束时按当前环节生成结论性洞察（AI 产出）。
  const runAiAnalysis = useCallback(() => {
    if (!activeSegment) return;
    clearTimers();
    const segmentKey = activeSegment.key;
    setAiRunning(true);
    setAiProgress(0);
    setNotice('');
    setFlash('');
    AI_STEPS.forEach((_, index) => {
      timersRef.current.push(
        setTimeout(
          () => {
            setAiProgress(index + 1);
            if (index === AI_STEPS.length - 1) {
              const at = new Date().toLocaleTimeString('zh-CN', { hour12: false });
              setAiRunning(false);
              setAiResults((prev) => ({
                ...prev,
                [segmentKey]: { items: buildAiInsights(activeSegment), at },
              }));
              setNotice(
                `AI 深度分析完成（${at}）：已在当前数据上生成 ${AI_INSIGHT_STEPS.length} 项结论洞察，并写入导出报告。`,
              );
            }
          },
          260 * (index + 1),
        ),
      );
    });
  }, [activeSegment, clearTimers]);

  // 「刷新分析」：只重新载入数据层（入库清单 + 演示口径），不调 AI、不产出文字结论。
  const handleRefresh = useCallback(async () => {
    clearTimers();
    setAiRunning(false);
    setAiProgress(0);
    setNotice('');
    setFlash('');
    try {
      await refresh();
      const at = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      setRefreshedAt(at);
      setFlash(
        `数据已刷新（${at}）：已重新载入入库清单与演示口径，8 章正文、图表与企业名单同步更新。`,
      );
    } catch (refreshError) {
      setFlash(
        `刷新失败：${refreshError.message}。可运行 pnpm prepare:analysis 重新生成演示数据。`,
      );
    }
  }, [clearTimers, refresh]);

  // 正文滚动时目录自动高亮。
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !activeSegment || view !== 'segment') return undefined;
    const onScroll = () => {
      const top = container.getBoundingClientRect().top + 96;
      let current = toc[0].id;
      for (const item of toc) {
        const element = document.getElementById(item.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= top) current = item.id;
      }
      setActiveSection(current);
    };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [activeSegment, toc, view]);

  const scrollToSection = (id) => {
    const container = scrollRef.current;
    const element = document.getElementById(id);
    if (!container || !element) return;
    const offset =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    container.scrollTo({ top: Math.max(offset - 12, 0), behavior: 'smooth' });
    setActiveSection(id);
  };

  // 导出报告：
  //  · 储能产业 —— 结构与原报告完全一致（封面信息 → 目录 → 第一篇 → 第二篇 → 附表）；
  //  · 算力产业 —— 暂无 PDF 研报，导出当前环节的数据驱动 8 章分析（与页面正文同源）。
  // 跑过「AI 深度分析」时，本次会话的结论作为附录追加，并明确标注非原报告内容。
  const handleExport = () => {
    const insight = activeSegment ? aiResults[activeSegment.key] || null : null;
    if (!hasStructuredReport) {
      if (!activeSegment) {
        setFlash('环节分析数据仍在载入，请稍后重试。');
        return;
      }
      downloadMarkdown(
        `${industry}-${activeSegment.level2Display || activeSegment.level2}-行业分析-${activeSegment.updatedAt || ''}.md`,
        buildReportMarkdown(activeSegment, {
          industry,
          insights: insight?.items || null,
          insightsAt: insight?.at || '',
        }),
      );
      setFlash(
        `报告已导出为 Markdown：${industry} · ${activeSegment.level1} / ${activeSegment.level2Display || activeSegment.level2} ` +
          `的 8 章分析（规模 / 区域 / 产能 / 亮点 / 技术 / 企业 / 趋势 / 授信）` +
          (insight ? `，并附本次 AI 深度分析结论（生成于 ${insight.at}）。` : '。'),
      );
      return;
    }
    if (!report) {
      setFlash('报告结构数据仍在载入，请稍后重试。');
      return;
    }
    const title = report.meta?.title || '中国新型储能行业研究报告';
    const subtitle = (report.meta?.subtitle || '').replace(/^—+/, '');
    downloadMarkdown(
      `${title}-${subtitle}-${report.meta?.date || ''}.md`,
      buildStructuredReportMarkdown(report, {
        insights: insight?.items || null,
        insightsAt: insight?.at || '',
        segment: activeSegment,
      }),
    );
    setFlash(
      insight
        ? `报告已导出为 Markdown：结构与原报告一致（第一篇 + 第二篇 + 附表），并附本次 AI 深度分析结论（生成于 ${insight.at}）。`
        : '报告已导出为 Markdown：结构与原报告一致——封面信息、目录、第一篇（摘要 + 一~七章 + 附录 + 附表1/2）、第二篇（上游专题 + 中游深度分析 + 附表3）。',
    );
  };

  const handleLevel1Change = (label) => {
    setLevel1Label(label);
    setLevel2Label('');
    setSelectedCompanyId(null);
    clearTimers();
    setAiProgress(0);
    setNotice('');
    setFlash('');
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (selectedIndustry && !ANALYSIS_INDUSTRIES.includes(selectedIndustry)) {
    return (
      <main className="ana-page">
        <div className="ana-empty-state">
          <h2>产业链行业分析</h2>
          <p>
            本页当前已完成{ANALYSIS_INDUSTRIES.join('、')}
            的环节深度分析建设，请通过右上角产业链切换后查看。
          </p>
        </div>
      </main>
    );
  }
  const isSegmentView = view === 'segment';
  if (isSegmentView && status === 'loading') {
    return (
      <main className="ana-page">
        <div className="ana-empty-state">行业分析数据加载中…</div>
      </main>
    );
  }
  if (!isSegmentView && reportStatus === 'loading') {
    return (
      <main className="ana-page">
        <div className="ana-empty-state">行业研究报告载入中…</div>
      </main>
    );
  }
  if (!isSegmentView && reportStatus === 'error') {
    return (
      <main className="ana-page">
        <div className="ana-empty-state error">
          <h2>行业研究报告载入失败</h2>
          <p>
            {reportError?.message ||
              '请检查 public/data/analysis/storage-report.json 是否存在（由原报告 PDF 解析生成）。'}
          </p>
        </div>
      </main>
    );
  }
  if (isSegmentView && status === 'error') {
    return (
      <main className="ana-page">
        <div className="ana-empty-state error">
          <h2>行业分析数据加载失败</h2>
          <p>
            {error?.message ||
              `请检查 public/${analysisDataFileFor(industry)} 是否存在，可运行 pnpm prepare:analysis 重新生成。`}
          </p>
        </div>
      </main>
    );
  }
  if (isSegmentView && !activeSegment) {
    return (
      <main className="ana-page">
        <div className="ana-empty-state">该环节暂无分析报告，请切换其他二级环节。</div>
      </main>
    );
  }

  const activePart = view === 'part1' ? partByKey(report, 'part1') : partByKey(report, 'part2');
  const stats = report ? reportStats(report) : null;
  const switchView = (key) => {
    setView(key);
    setFlash('');
    setNotice('');
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };

  // 同样按行业过滤授信模型，避免切换瞬间拿到上一个行业的企业档案。
  const creditModel =
    credit.status === 'ready' && credit.data?.raw?.industryLabel === industry ? credit.data : null;
  const selectedCompany = selectedCompanyId
    ? creditModel?.companiesById.get(selectedCompanyId) || null
    : null;
  const selectedEvaluation = selectedCompany
    ? creditModel?.entries.find((entry) => entry.company.id === selectedCompany.id)?.evaluation ||
      null
    : null;

  // 页头：储能产业沿用原研报标题；算力产业暂无 PDF 研报，标题由行业名 + 环节组合而成。
  const pageTitle = hasStructuredReport
    ? report?.meta?.title || '中国新型储能行业研究报告'
    : `${industry}环节分析报告`;
  const pageSubtitle = hasStructuredReport
    ? (report?.meta?.subtitle || '商业银行授信视角').replace(/^—+/, '')
    : '商业银行授信视角';
  const pageEyebrow = `${hasStructuredReport ? 'STORAGE' : 'COMPUTE'} INDUSTRY REPORT / 行业分析`;
  const reportLine = isSegmentView
    ? `《${pageTitle}》· 环节深度分析：${activeSegment.level1} / ${activeSegment.level2Display || activeSegment.level2}`
    : `《${activePart?.no || '第一篇'} ${activePart?.name || '整体分析'}》` +
      (stats ? ` · 全文 ${stats.chapters} 章 / ${stats.tables} 表 / ${stats.figures} 图` : '');

  return (
    <main className="ana-page">
      <header className="ana-panel ana-top">
        <div className="ana-top-row">
          <div className="ana-title-lockup">
            <span className="eyebrow">{pageEyebrow}</span>
            <h1>
              {pageTitle} <i>·</i> {pageSubtitle}
            </h1>
            <p className="ana-report-title">{reportLine}</p>
          </div>
          <div className="ana-actions">
            {isSegmentView && (
              <button
                type="button"
                className="ghost-button"
                onClick={handleRefresh}
                disabled={refreshing || aiRunning}
                title="重新载入入库清单与演示口径，刷新全部数值与图表；不调用 AI，不生成文字结论"
              >
                {refreshing ? '刷新中…' : '刷新分析'}
              </button>
            )}
            {isSegmentView && (
              <button
                type="button"
                className="ana-primary-button"
                onClick={runAiAnalysis}
                disabled={aiRunning || refreshing}
                title={`在最新数据上运行 ${AI_INSIGHT_STEPS.length} 步 AI 分析链路，生成结论性洞察并写入导出报告`}
              >
                {aiRunning ? '深度分析中…' : `✦ AI 深度分析${aiInsight ? '（已完成）' : ''}`}
              </button>
            )}
            <button
              type="button"
              className="ana-primary-button"
              onClick={handleExport}
              title={
                hasStructuredReport
                  ? '导出与原报告结构一致的 Markdown：封面信息、目录、第一篇（整体分析）、第二篇（细分领域分析）、附表'
                  : `导出当前环节的 8 章分析 Markdown：${industry}的规模 / 区域 / 产能 / 亮点 / 技术 / 企业 / 趋势 / 授信`
              }
            >
              导出报告
            </button>
            {hasStructuredReport && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => reloadReport()}
                title="重新载入报告结构数据（第一篇 / 第二篇全文）"
              >
                重载报告
              </button>
            )}
            {isSegmentView && (
              <button type="button" className="ghost-button" onClick={() => setRulesOpen(true)}>
                ⓘ 评分口径
              </button>
            )}
            <button type="button" className="ghost-button" onClick={() => setSourceOpen(true)}>
              ⓘ 数据来源
            </button>
          </div>
        </div>

        <nav className="ana-view-switch" aria-label="报告结构">
          {reportViews.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`ana-view-card ${view === item.key ? 'active' : ''}`}
              aria-selected={view === item.key}
              onClick={() => switchView(item.key)}
            >
              <span>{item.eyebrow}</span>
              <b>{item.label}</b>
              <em>{item.hint}</em>
            </button>
          ))}
        </nav>

        {isSegmentView && (
          <>
            <div className="ana-selector-row">
              <span className="ana-selector-label">一级环节</span>
              <div className="ana-chip-group">
                {level1List.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`ana-chip-button ${item.label === activeLevel1?.label ? 'active' : ''}`}
                    onClick={() => handleLevel1Change(item.label)}
                  >
                    {item.label}
                    <em>{item.companyCount}</em>
                  </button>
                ))}
              </div>
            </div>
            <div className="ana-selector-row">
              <span className="ana-selector-label">二级环节</span>
              <div className="ana-chip-group">
                {(activeLevel1?.children || []).map((child) => (
                  <button
                    key={child.key}
                    type="button"
                    className={`ana-chip-button ${child.label === activeSegment.level2 ? 'active' : ''}`}
                    onClick={() => {
                      setLevel2Label(child.label);
                      setSelectedCompanyId(null);
                      scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
                    }}
                  >
                    {child.label}
                    <em>{child.listedCount}</em>
                  </button>
                ))}
              </div>
              {onViewAtlas && (
                <button
                  type="button"
                  className="ana-link-button"
                  onClick={() => onViewAtlas(activeSegment.level1, activeSegment.level2)}
                >
                  ↗ 查看产业链图谱
                </button>
              )}
            </div>
            <div className="ana-meta-row">
              <span>
                报告周期：<b>{activeSegment.reportYear} 年</b>
              </span>
              <span>
                数据基准年：<b>{activeSegment.referenceYear}</b>
              </span>
              <span>
                更新时间：<b>{activeSegment.updatedAt}</b>
                {refreshedAt && <i className="ana-meta-hint">（本次会话刷新于 {refreshedAt}）</i>}
              </span>
              <span>
                数据状态：
                <b className="ana-demo-text">演示数据</b>
                <i className="ana-meta-hint">（企业档案为入库口径，规模与产能为 AI 估算）</i>
              </span>
              <span>
                研究口径：<b>商业银行授信视角</b>
              </span>
              <span>
                模型：<b>{activeSegment.modelTypeLabel}</b>
              </span>
            </div>
          </>
        )}
        {flash && (
          <p className={`ana-flash ${flash.startsWith('刷新失败') ? 'error' : ''}`}>{flash}</p>
        )}
        {isSegmentView && (aiRunning || notice) && (
          <div className="ana-ai-panel">
            <div className="ana-ai-head">
              <b>
                {aiRunning
                  ? `正在分析：${activeSegment.level2Display || activeSegment.level2}`
                  : '分析完成'}
              </b>
              {!aiRunning && notice && <span className="ana-ai-notice">{notice}</span>}
            </div>
            <div className="ana-ai-steps">
              {AI_STEPS.map((step, index) => (
                <span
                  key={step}
                  className={`ana-ai-step ${index < aiProgress ? 'done' : index === aiProgress ? 'running' : ''}`}
                >
                  {index < aiProgress ? '✓' : index === aiProgress ? '◍' : '○'} {step}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="ana-scroll" ref={scrollRef}>
        {!isSegmentView && activePart && <ReportReader part={activePart} scrollRef={scrollRef} />}

        {isSegmentView && (
          <>
            <OverviewPanel segment={activeSegment} onOpenRules={() => setRulesOpen(true)} />

            {aiInsight && (
              <section className="ana-section ana-ai-insight" id="ana-sec-ai-insight">
                <div className="ana-ai-insight-head">
                  <div>
                    <span className="ana-section-index">AI</span>
                    <h3>AI 深度分析结论</h3>
                    <p className="ana-section-question">
                      由「AI 深度分析」在当期数据上生成，共 {aiInsight.items.length} 项； 未运行过
                      AI 分析时本区块不显示，导出报告也不含该章节。
                    </p>
                  </div>
                  <span className="ana-ai-insight-meta">
                    {aiInsight.at} 生成
                    <AnalysisSourceBadge sourceKey="aiJudgement" />
                  </span>
                </div>
                <div className="ana-ai-insight-grid">
                  {aiInsight.items.map((item) => (
                    <article key={item.id} className="ana-ai-insight-card">
                      <h4>
                        <span className="ana-ai-step-no">{item.label}</span>
                        {item.headline}
                        <AnalysisSourceBadge sourceKey={item.sourceKey} />
                      </h4>
                      <p>{item.text}</p>
                      <dl className="ana-ai-insight-metrics">
                        {item.metrics.map((metric) => (
                          <div key={metric.label}>
                            <dt>{metric.label}</dt>
                            <dd>{metric.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
                <p className="ana-note">
                  上述结论由模型基于当期演示数据生成，接入真实 AI 与外部数据源后结论会自动更新，
                  但仍建议由业务人员复核后再用于授信决策。
                </p>
              </section>
            )}

            <div className="ana-report-layout">
              <nav className="ana-toc" aria-label="报告目录">
                <span className="ana-toc-title">报告目录</span>
                {toc.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ana-toc-item ${activeSection === item.id ? 'active' : ''}`}
                    onClick={() => scrollToSection(item.id)}
                  >
                    <span>{item.index}</span>
                    {item.label}
                  </button>
                ))}
                <span className="ana-toc-note">
                  企业档案类数据来自入库清单（真实口径），规模、产能、集中度与评分类为 AI
                  估算（演示数据）， 接入行业协会、上市公司公告与第三方数据终端后可直接替换。
                </span>
              </nav>

              <div className="ana-report-body">
                <MarketSection segment={activeSegment} />
                <RegionalSection segment={activeSegment} />
                <CapacitySection segment={activeSegment} />
                <HighlightsSection segment={activeSegment} />
                <TechnologySection segment={activeSegment} />
                <CompanySection segment={activeSegment} onOpenCompany={setSelectedCompanyId} />
                <TrendSection segment={activeSegment} />
                <CreditSection segment={activeSegment} />
                <ConclusionSection segment={activeSegment} />
              </div>
            </div>
          </>
        )}
      </div>

      {rulesOpen && (
        <AnalysisRulesModal segment={activeSegment} onClose={() => setRulesOpen(false)} />
      )}

      {sourceOpen && <AnalysisSourceModal onClose={() => setSourceOpen(false)} />}

      <CreditProfileDrawer
        company={selectedCompany}
        evaluation={selectedEvaluation}
        companiesById={creditModel?.companiesById || new Map()}
        relations={creditModel?.relations || []}
        onClose={() => setSelectedCompanyId(null)}
        onSelectCompany={setSelectedCompanyId}
      />
    </main>
  );
}

// 评分口径说明：行业景气度（提示词第 17 章）与授信友好度（第 18 章）。
const SCORE_LABELS = {
  demandGrowth: '需求增长',
  supplyDemand: '供需关系',
  priceTrend: '价格趋势',
  profitability: '盈利水平',
  technology: '技术景气',
  policy: '政策支持',
  competition: '竞争格局',
};

function AnalysisRulesModal({ segment, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="ana-modal-mask" role="presentation" onClick={onClose}>
      <div
        className="ana-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI 评分口径说明"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ana-modal-head">
          <h3>AI 评分口径说明</h3>
          <button type="button" className="ana-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="ana-modal-body">
          <h4>一、行业景气度（0—100）</h4>
          <p>
            由需求增长、供需关系、价格趋势、盈利水平、技术景气、政策支持、竞争格局七项加权得出；
            当前「{segment.level2}」得分为 {segment.scores.industryScore} 分。
          </p>
          <table className="ana-table">
            <thead>
              <tr>
                <th>指标</th>
                <th className="num">权重</th>
                <th className="num">得分</th>
              </tr>
            </thead>
            <tbody>
              {segment.scores.prosperity.map((item) => (
                <tr key={item.key}>
                  <td>{SCORE_LABELS[item.key] || item.key}</td>
                  <td className="num">{Math.round(item.weight * 100)}%</td>
                  <td className="num">{item.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>二、授信友好度（0—100）</h4>
          <p>
            综合现金流稳定性、行业周期、资产可抵押性、订单稳定性、企业集中度、项目收益稳定性与政策确定性七项因子，
            当前得分为 {segment.scores.creditFriendlyScore} 分。
          </p>
          <h4>三、数据口径</h4>
          <p>{segment.mockNote}</p>
          <p>
            本页每个指标的来源均已在对应位置标注：带「清单数据」的来自《上市企业入链表》《全量客户清单》入库结果，
            带「AI估算」「AI计算」的为 AI 推算的演示数据。点击页面右上角「ⓘ
            数据来源」可查看字段级来源对照， 以及每项 AI 估算数据替换为准确数据所需对接的数据源。
          </p>
          <h4>四、行业授信评级</h4>
          <p>{segment.credit.ratingNote}</p>
          <p className="ana-note">
            本评分由 AI 基于演示数据计算，仅用于授信研究与客户分层参考，不替代银行正式授信审批。
          </p>
        </div>
      </div>
    </div>
  );
}
