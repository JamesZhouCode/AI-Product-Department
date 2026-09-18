import { useEffect, useState } from 'react';
import { INDUSTRY_OPTIONS } from './chainPalette';
import { IndustryFlowPage, IntegratedCircuitFishbonePage, WeeklyReportPage } from './insightPages';
import AppHeader from './features/app/AppHeader';
import { useAppData } from './features/app/useAppData';
import MapWorkspace from './features/map/MapWorkspace';
import { useMapWorkspace } from './features/map/useMapWorkspace';
import './features/app/AppShell.css';

function App() {
  const [activeTab, setActiveTab] = useState('map');
  // 一级链提升到 App：数据分片加载与地图筛选共用同一个来源，避免双向同步。
  const [activeIndustry, setActiveIndustry] = useState(INDUSTRY_OPTIONS[0]);
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

  return (
    <div className={`app-shell ${mapWorkspace.isMapFullscreen ? 'map-fullscreen' : ''}`}>
      <span className="sr-only" role="status" aria-live="polite">
        {mapWorkspace.importNotice}
      </span>
      <AppHeader
        activeIndustry={activeIndustry}
        data={data}
        activeTab={activeTab}
        industryOptions={industryOptions}
        onIndustryChange={handleIndustryChange}
        onTabChange={setActiveTab}
        {...mapWorkspace.headerProps}
      />
      <MapWorkspace
        active={activeTab === 'map'}
        dataError={dataError}
        dataWarning={dataWarning}
        loading={loading}
        {...mapWorkspace.mapWorkspaceProps}
      />
      {activeTab === 'flow' && (
        <IndustryFlowPage
          selectedIndustry={activeIndustry}
          companyDetailPropsFor={mapWorkspace.companyDetailPropsFor}
        />
      )}
      {activeTab === 'fishbone' && (
        <IntegratedCircuitFishbonePage
          data={data}
          selectedIndustry={activeIndustry}
          companyDetailPropsFor={mapWorkspace.companyDetailPropsFor}
        />
      )}
      {activeTab === 'report' && <WeeklyReportPage data={data} selectedIndustry={activeIndustry} />}
    </div>
  );
}

export default App;
