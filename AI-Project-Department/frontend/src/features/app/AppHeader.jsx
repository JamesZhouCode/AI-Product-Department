import './AppHeader.css';
import { publicPath } from '../../shared/publicPaths';
import { isListedCompany } from '../map/mapTags';
import IndustrySwitcher from './IndustrySwitcher';
import WorkspaceTabs from './WorkspaceTabs';

const brandLogo = publicPath('assets/brand-logo.png');

export default function AppHeader({
  activeTab,
  activeIndustry,
  data,
  industryOptions,
  isNationalScope,
  isShanghaiScope,
  onIndustryChange,
  onFocusChina,
  onFocusShanghai,
  onTabChange,
}) {
  const totalCompanies = data.counts.totalCompanies || data.companies.length || 0;
  const listedCompanies = data.companies.filter(isListedCompany).length;

  return (
    <header className="topbar">
      <div className="brand-area">
        <div className="brand-block">
          <div className="brand-mark" aria-label="地图产业链图谱" role="img">
            <img src={brandLogo} alt="" />
          </div>
          <div className="brand-copy">
            <div className="brand-title">地图产业链图谱</div>
            <div className="brand-subtitle">当前链样本</div>
          </div>
        </div>
        <div className="dataset-summary" aria-label="数据摘要">
          <span>
            <b>{totalCompanies}</b> 家企业
          </span>
          <span>
            <b>{listedCompanies}</b> 家上市企业
          </span>
          <span>
            <b>{data.counts.relationCount || 0}</b> 条上市企业关系
          </span>
        </div>
      </div>
      <WorkspaceTabs activeTab={activeTab} onChange={onTabChange} />
      <div className="top-actions">
        <IndustrySwitcher
          value={activeIndustry}
          options={industryOptions}
          onChange={onIndustryChange}
        />
        <button
          className={isNationalScope ? 'primary-button' : 'ghost-button'}
          aria-pressed={isNationalScope}
          onClick={onFocusChina}
        >
          全国
        </button>
        <button
          className={isShanghaiScope ? 'primary-button' : 'ghost-button'}
          aria-pressed={isShanghaiScope}
          onClick={onFocusShanghai}
        >
          上海
        </button>
      </div>
    </header>
  );
}
