import './SideRail.css';

/**
 * 平台级左侧导航：只在「全景链图」与「链知智答」两个工作台之间切换。
 * 全景链图 = 现有全部功能（产业建链 / 智能决策 / 生态经营）。
 */
const ITEMS = [
  {
    key: 'atlas',
    label: '全景链图',
    hint: '产业链全景图谱与工作台',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4.4 6.2 8v8l5.8 3.6L17.8 16V8L12 4.4Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="4.4" r="2" fill="currentColor" />
        <circle cx="6.2" cy="8" r="1.8" fill="currentColor" />
        <circle cx="17.8" cy="8" r="1.8" fill="currentColor" />
        <circle cx="6.2" cy="16" r="1.8" fill="currentColor" />
        <circle cx="17.8" cy="16" r="1.8" fill="currentColor" />
        <circle cx="12" cy="19.6" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'assistant',
    label: '链知智答',
    hint: '功能开发中，敬请期待',
    disabled: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4.6 5.6h14.8v9.2H10l-3.9 3.4v-3.4H4.6V5.6Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="10.2" r="1.1" fill="currentColor" />
        <circle cx="12.2" cy="10.2" r="1.1" fill="currentColor" />
        <circle cx="15.4" cy="10.2" r="1.1" fill="currentColor" />
      </svg>
    ),
  },
];

export default function SideRail({ value = 'atlas', onChange }) {
  return (
    <aside className="side-rail" aria-label="平台导航">
      <nav className="rail-items" role="tablist" aria-orientation="vertical">
        {ITEMS.map((item) => {
          const active = value === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-disabled={item.disabled || undefined}
              className={`rail-item ${active ? 'is-active' : ''} ${item.disabled ? 'is-disabled' : ''}`}
              title={item.hint}
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) onChange?.(item.key);
              }}
            >
              <span className="rail-icon">{item.icon}</span>
              <span className="rail-label">{item.label}</span>
              {item.key === 'assistant' && <span className="rail-tag">{item.disabled ? '开发中' : 'AI'}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
