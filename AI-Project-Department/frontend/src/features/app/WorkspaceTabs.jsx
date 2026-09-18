import './WorkspaceTabs.css';

const WORKSPACE_TABS = [
  ['flow', '流程'],
  ['fishbone', '图谱'],
  ['map', '地图'],
  ['report', '周报'],
];

export default function WorkspaceTabs({ activeTab, onChange }) {
  return (
    <nav className="tabbar" aria-label="产业链工作台页签" role="tablist">
      {WORKSPACE_TABS.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={`tab-button ${activeTab === tab ? 'active' : ''}`}
          onClick={() => onChange(tab)}
        >
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
