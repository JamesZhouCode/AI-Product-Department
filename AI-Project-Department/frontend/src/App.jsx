import { useEffect, useState } from 'react';
import { INDUSTRY_OPTIONS } from './chainPalette';
import { IndustryFlowPage, IntegratedCircuitFishbonePage, WeeklyReportPage } from './insightPages';
import AnalysisPage from './features/analysis/AnalysisPage';
import MacroPage from './features/macro/MacroPage';
import PolicyPage from './features/policy/PolicyPage';
import CreditOverviewPage from './features/credit/CreditOverviewPage';
import AppHeader from './features/app/AppHeader';
import SideRail from './features/app/SideRail';
import { NAV_GROUPS } from './features/app/navGroups';
import ChainAssistantPage from './features/assistant/ChainAssistantPage';
import { useAppData } from './features/app/useAppData';
import MapWorkspace from './features/map/MapWorkspace';
import { useMapWorkspace } from './features/map/useMapWorkspace';
import EcoPage from './features/eco/EcoPage';
import useFollowedCompanies from './features/eco/useFollowedCompanies';
import './features/app/AppShell.css';

function App() {
  // 左侧导航：全景链图（现有全部功能）/ 链知智答（AI 问答）。
  const [workspace, setWorkspace] = useState('atlas');
  // 打开页面默认落在「产业建链 · 流程」（建链四步），与实际使用动线一致。
  const [activeTab, setActiveTab] = useState('flow');
  // 一级链提升到 App：数据分片加载与地图筛选共用同一个来源，避免双向同步。
  // 默认进入「储能产业」，与授信 tab 的完整数据口径对齐。
  const defaultIndustry = INDUSTRY_OPTIONS.includes('储能产业') ? '储能产业' : INDUSTRY_OPTIONS[0];
  const [activeIndustry, setActiveIndustry] = useState(defaultIndustry);
  // 图谱 → 分析 / 分析 → 图谱 的双向联动定位。
  const [analysisFocus, setAnalysisFocus] = useState({ level1: '', level2: '' });
  const [atlasFocusLevel2, setAtlasFocusLevel2] = useState('');
  // 企业关注名单：图谱卡 / 授信卡 / 生态经营版面共用同一份状态（App 级单实例）。
  const followed = useFollowedCompanies();
  const {
    bankRelationOverrides,
    data,
    dataError,
    dataWarning,
    industryOptions,
    loading,
    marketingRecords,
    setBankRelationOverrides,
    setMarketingRecords,
    shanghaiDistricts,
    updateCompanyTags,
  } = useAppData(activeIndustry);
  const mapWorkspace = useMapWorkspace({
    activeTab,
    activeIndustry,
    bankRelationOverrides,
    data,
    marketingRecords,
    onIndustryChange: setActiveIndustry,
    setBankRelationOverrides,
    setMarketingRecords,
    shanghaiDistricts,
    updateCompanyTags,
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const handleIndustryChange = (industry) => {
    mapWorkspace.changeIndustry(industry);
  };

  // 图谱 → 分析：带上一级 / 二级环节定位到对应行业分析报告。
  const openAnalysis = (level1, level2) => {
    setAnalysisFocus({ level1: level1 || '', level2: level2 || '' });
    setActiveTab('analysis');
  };

  // 分析 → 图谱：切到图谱并定位对应三级环节节点。
  const openAtlas = (level1, level2) => {
    setAtlasFocusLevel2(level2 || '');
    setActiveTab('fishbone');
  };

  const isAssistant = workspace === 'assistant';
  // 「生态经营」置灰开发中：拦截所有入口（含问答联动、页内跳转），
  // 避免用户绕过置灰页签进入未开放的版面。判断依据为 navGroups 里的 group.disabled。
  const isTabDisabled = (tab) => {
    const group = NAV_GROUPS.find((item) => item.tabs.some(([id]) => id === tab));
    return Boolean(group && group.disabled);
  };
  const handleTabChange = (tab) => {
    if (!isTabDisabled(tab)) setActiveTab(tab);
  };
  // 从问答里点「打开政策解读」这类动作：先回到全景链图，再定位到对应页签。
  const openFromAssistant = (tab) => {
    setWorkspace('atlas');
    if (tab) handleTabChange(tab);
  };

  return (
    <div className="app-frame">
      <SideRail value={workspace} onChange={setWorkspace} />
      <div
        className={`app-shell ${mapWorkspace.isMapFullscreen ? 'map-fullscreen' : ''} ${
          isAssistant ? 'is-assistant' : ''
        }`}
      >
        <span className="sr-only" role="status" aria-live="polite">
          {mapWorkspace.importNotice}
        </span>
        <AppHeader
          activeIndustry={activeIndustry}
          data={data}
          activeTab={activeTab}
          industryOptions={industryOptions}
          onIndustryChange={handleIndustryChange}
          onTabChange={handleTabChange}
          ecoCount={followed.count}
          {...mapWorkspace.headerProps}
        />
        <MapWorkspace
          active={!isAssistant && activeTab === 'map'}
          dataError={dataError}
          dataWarning={dataWarning}
          loading={loading}
          {...mapWorkspace.mapWorkspaceProps}
        />
        {isAssistant && (
          <ChainAssistantPage
            selectedIndustry={activeIndustry}
            data={data}
            onNavigate={openFromAssistant}
          />
        )}
        {!isAssistant && activeTab === 'policy' && (
          <PolicyPage selectedIndustry={activeIndustry} onNavigate={handleTabChange} />
        )}
        {!isAssistant && activeTab === 'macro' && (
          <MacroPage selectedIndustry={activeIndustry} onNavigate={handleTabChange} />
        )}
        {!isAssistant && activeTab === 'flow' && (
          <IndustryFlowPage
            selectedIndustry={activeIndustry}
            companyDetailPropsFor={mapWorkspace.companyDetailPropsFor}
          />
        )}
        {!isAssistant && activeTab === 'fishbone' && (
          <IntegratedCircuitFishbonePage
            data={data}
            selectedIndustry={activeIndustry}
            companyDetailPropsFor={mapWorkspace.companyDetailPropsFor}
            focusLevel2={atlasFocusLevel2}
            onViewAnalysis={openAnalysis}
            followed={followed}
          />
        )}
        {!isAssistant && activeTab === 'report' && (
          <WeeklyReportPage data={data} selectedIndustry={activeIndustry} />
        )}
        {!isAssistant && activeTab === 'credit' && (
          <CreditOverviewPage selectedIndustry={activeIndustry} followed={followed} />
        )}
        {!isAssistant && activeTab === 'eco' && (
          <EcoPage followed={followed} onNavigate={handleTabChange} />
        )}
        {!isAssistant && activeTab === 'analysis' && (
          <AnalysisPage
            selectedIndustry={activeIndustry}
            focusLevel1={analysisFocus.level1}
            focusLevel2={analysisFocus.level2}
            onViewAtlas={openAtlas}
          />
        )}
      </div>
    </div>
  );
}

export default App;
