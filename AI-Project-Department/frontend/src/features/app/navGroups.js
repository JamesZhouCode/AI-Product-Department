// 顶部导航的两级分组数据（纯数据，可被单测直接 import）。
// 各页签的页面与功能保持不变；「宏观」更名为「行业」（tab id 仍为 macro）。
// 「政策」「行业」归入「智能决策」组；「授信」排在「政策」之前。
// goal：每个一级分组的目标语，显示在二级页签栏左侧。
export const NAV_GROUPS = [
  {
    key: 'data',
    label: '产业建链',
    goal: '分析产业框架，生成产业链图谱',
    tabs: [
      ['flow', '流程'],
      ['fishbone', '图谱'],
      ['map', '地图'],
      ['analysis', '分析'],
    ],
  },
  {
    key: 'decision',
    label: '智能决策',
    goal: '解读政策与行业动向，支撑授信决策',
    tabs: [
      ['credit', '授信'],
      ['policy', '政策'],
      ['macro', '行业'],
      ['report', '周报'],
    ],
  },
  {
    key: 'eco',
    label: '生态经营',
    goal: '沉淀关注企业，经营客户生态',
    // 功能尚在开发中：顶栏一级页签置灰、不可点击（页面本体保留，便于联调）。
    disabled: true,
    disabledTip: '功能开发中，敬请期待',
    tabs: [['eco', '关注企业']],
  },
];

export function navGroupOf(tab) {
  const group = NAV_GROUPS.find((item) => item.tabs.some(([id]) => id === tab));
  return group ? group.key : NAV_GROUPS[0].key;
}
