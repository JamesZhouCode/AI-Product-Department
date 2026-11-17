import { NAV_GROUPS, navGroupOf } from './navGroups';
import './WorkspaceTabs.css';

/**
 * 顶栏一级分组：只放「数据分析 / 智能决策 / 生态经营」三个一级标题。
 * 点击一级标题进入该组第一个页签（二级标题默认显示第一个）。
 * disabled 分组（如开发中的功能）置灰展示、不可点击、不参与激活高亮。
 */
export function WorkspaceGroupNav({ activeTab, onChange, ecoCount = 0 }) {
  const activeGroup = navGroupOf(activeTab);

  return (
    <nav className="tabbar" aria-label="产业链工作台分组" role="tablist">
      {NAV_GROUPS.map((group, groupIndex) => {
        const isDisabled = Boolean(group.disabled);
        const isActive = !isDisabled && activeGroup === group.key;

        return (
          <div className={`nav-group ${isActive ? 'is-active' : ''}`} key={group.key}>
            {groupIndex > 0 && <span className="nav-group-divider" aria-hidden="true" />}
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isDisabled || undefined}
              disabled={isDisabled || undefined}
              className={`nav-group-label ${isDisabled ? 'is-disabled' : ''}`}
              title={isDisabled ? `${group.label}（${group.disabledTip || '开发中'}）` : `进入「${group.label}」`}
              onClick={isDisabled ? undefined : () => onChange(group.tabs[0][0])}
            >
              {group.label}
              {isDisabled ? (
                <span className="nav-group-coming">{group.disabledTip || '开发中'}</span>
              ) : (
                group.key === 'eco' &&
                ecoCount > 0 && (
                  <span className="nav-group-count">{ecoCount > 99 ? '99+' : ecoCount}</span>
                )
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * 顶栏下方的二级页签栏：目标语居左、页签居右，整条与下方内容区合成一体。
 */
export function WorkspaceSubTabs({ activeTab, onChange }) {
  const activeGroup = navGroupOf(activeTab);
  const currentGroup = NAV_GROUPS.find((group) => group.key === activeGroup) || NAV_GROUPS[0];

  return (
    <nav className="subbar" aria-label={`${currentGroup.label}功能页签`}>
      <div className="subbar-inner">
        <p className="subbar-goal">
          <b>{currentGroup.label}</b>
          {currentGroup.goal}
        </p>
        <div className="subbar-tabs">
          {currentGroup.tabs.map(([tab, label]) => (
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
        </div>
      </div>
    </nav>
  );
}
