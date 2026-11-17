import './AppHeader.css';
import { publicPath } from '../../shared/publicPaths';
import { isListedCompany } from '../map/mapTags';
import IndustrySwitcher from './IndustrySwitcher';
import { WorkspaceGroupNav, WorkspaceSubTabs } from './WorkspaceTabs';

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
  ecoCount = 0,
}) {
  // 顶部展示源表行数（未去重口径）；去重主体数放悬浮说明
  const totalCompanies =
    data.counts.sourceRows || data.counts.totalCompanies || data.companies.length || 0;
  const dedupeNote =
    data.counts.sourceRows &&
    data.counts.totalCompanies &&
    data.counts.sourceRows !== data.counts.totalCompanies
      ? `源表 ${data.counts.sourceRows} 行；按统一社会信用代码去重后 ${data.counts.totalCompanies} 个主体`
      : '';
  const listedCompanies = data.companies.filter(isListedCompany).length;

  return (
    <>
      <header className="topbar">
        <div className="brand-area">
          <div className="brand-block">
            <div className="brand-mark" aria-label="产业驱动链" role="img">
              <img src={brandLogo} alt="" />
            </div>
            <div className="brand-copy">
              <div className="brand-title">产业驱动链</div>
              <div className="brand-subtitle">当前链样本</div>
            </div>
          </div>
          <div className="dataset-summary" aria-label="数据摘要">
            <span title={dedupeNote || undefined}>
              <b>{totalCompanies}</b> 家企业
            </span>
            <span>
              <b>{listedCompanies}</b> 家上市企业
            </span>
            <span>
              <b>{data.counts.relationCount || 0}</b> 条链内企业关系
            </span>
          </div>
        </div>
        <WorkspaceGroupNav activeTab={activeTab} onChange={onTabChange} ecoCount={ecoCount} />
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
      {/* 二级页签单独一栏：紧跟顶栏下方，只显示当前一级分组下的页签 */}
      <WorkspaceSubTabs activeTab={activeTab} onChange={onTabChange} />
    </>
  );
}
