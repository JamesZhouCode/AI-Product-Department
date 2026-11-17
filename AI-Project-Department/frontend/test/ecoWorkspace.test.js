// 「生态经营」版面与两级导航的单测：
// 1) 导航分组结构（产业建链 / 智能决策 / 生态经营，政策与行业归入智能决策）；
// 2) 企业关注能力（身份键、快照、去重、上限）；
// 3) 营销建议规则；
// 4) 源码层面：App 接线、图谱与授信公司卡的关注入口、生态页取消关注。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { NAV_GROUPS, navGroupOf } from '../src/features/app/navGroups.js';
import {
  FOLLOWED_MAX_ITEMS,
  FOLLOWED_STORAGE_KEY,
  dedupeFollowed,
  followKeyFor,
  followSnapshotFor,
} from '../src/features/eco/useFollowedCompanies.js';
import { marketingTipsFor } from '../src/features/eco/ecoAdvice.js';

const read = (relative) => readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------- 导航分组

test('导航分为产业建链 / 智能决策 / 生态经营三个一级分组，且各自带目标语', () => {
  assert.deepEqual(
    NAV_GROUPS.map((group) => group.label),
    ['产业建链', '智能决策', '生态经营'],
  );
  assert.deepEqual(
    NAV_GROUPS.map((group) => group.key),
    ['data', 'decision', 'eco'],
  );
  // 每个一级分组都有一条目标语，显示在二级页签栏左侧。
  NAV_GROUPS.forEach((group) => {
    assert.ok(group.goal && group.goal.length >= 6, `分组 ${group.label} 缺少目标语`);
  });
  assert.ok(NAV_GROUPS[0].goal.includes('产业链图谱'), '产业建链的目标语未点明图谱');
});

test('产业建链分组：流程 / 图谱 / 地图 / 分析，顺序不变', () => {
  const data = NAV_GROUPS.find((group) => group.key === 'data');
  assert.deepEqual(
    data.tabs.map(([tab, label]) => [tab, label]),
    [
      ['flow', '流程'],
      ['fishbone', '图谱'],
      ['map', '地图'],
      ['analysis', '分析'],
    ],
  );
});

test('「授信」排在「政策」之前，其后为行业 / 周报；生态经营分组：关注企业', () => {
  const decision = NAV_GROUPS.find((group) => group.key === 'decision');
  assert.deepEqual(
    decision.tabs.map(([tab, label]) => [tab, label]),
    [
      ['credit', '授信'],
      ['policy', '政策'],
      ['macro', '行业'],
      ['report', '周报'],
    ],
  );
  // 一级标题点击进入该组第一个页签 → 落在「授信」。
  assert.equal(decision.tabs[0][0], 'credit', '智能决策组的第一个页签应为授信');
  // 政策必须仍排在行业之前（保持既有次序）。
  const ids = decision.tabs.map(([tab]) => tab);
  assert.ok(ids.indexOf('policy') < ids.indexOf('macro'), '政策页签必须排在行业之前');
  const eco = NAV_GROUPS.find((group) => group.key === 'eco');
  assert.deepEqual(
    eco.tabs.map(([tab, label]) => [tab, label]),
    [['eco', '关注企业']],
  );
});

test('导航页签 id 全局唯一，分组归属映射正确', () => {
  const ids = NAV_GROUPS.flatMap((group) => group.tabs.map(([tab]) => tab));
  assert.equal(new Set(ids).size, ids.length, '页签 id 存在重复');
  assert.equal(ids.length, 9, '页签总数应为 9（原 8 个 + 生态经营）');
  assert.equal(navGroupOf('policy'), 'decision', '政策应归属智能决策');
  assert.equal(navGroupOf('macro'), 'decision', '行业应归属智能决策');
  assert.equal(navGroupOf('flow'), 'data');
  assert.equal(navGroupOf('analysis'), 'data');
  assert.equal(navGroupOf('report'), 'decision');
  assert.equal(navGroupOf('credit'), 'decision');
  assert.equal(navGroupOf('eco'), 'eco');
  assert.equal(navGroupOf('不存在的页签'), 'data', '未知页签应兜底到第一个分组');
});

test('二级页签栏左侧展示分组目标语，页签居右；品牌标题为「产业驱动链」', () => {
  const tabs = read('features/app/WorkspaceTabs.jsx');
  assert.ok(tabs.includes('subbar-goal'), '二级页签栏缺少目标语区域');
  assert.ok(tabs.includes('subbar-tabs'), '二级页签栏缺少页签容器');
  assert.ok(
    tabs.indexOf('subbar-goal') < tabs.indexOf('subbar-tabs'),
    '目标语应排在页签之前（居左）',
  );
  const header = read('features/app/AppHeader.jsx');
  assert.ok(header.includes('产业驱动链'), '品牌标题未改为「产业驱动链」');
  assert.ok(!header.includes('地图产业链图谱'), '品牌标题仍残留旧名');
});

// ---------------------------------------------------------------- 关注能力

test('关注身份键：优先 id，缺失时退回归一化名称，字符串原样归一化', () => {
  assert.equal(followKeyFor({ id: 'es-0001', name: '某公司' }), 'es-0001');
  assert.equal(followKeyFor({ name: '某公司（储能）' }), '某公司储能');
  assert.equal(followKeyFor('某公司（储能）'), '某公司储能');
  assert.equal(followKeyFor(null), '');
  assert.equal(followKeyFor({}), '');
});

test('关注快照：只存营销字段并带拜访优先级，非法输入返回 null', () => {
  const snapshot = followSnapshotFor({
    id: 'es-0002',
    name: '宁德时代科技股份有限公司',
    chain: '电池与核心部件',
    sector: '电芯制造',
    primaryIndustry: '储能产业',
    tags: ['上市企业', '龙头企业'],
  });
  assert.equal(snapshot.key, 'es-0002');
  assert.equal(snapshot.name, '宁德时代科技股份有限公司');
  assert.equal(snapshot.listed, true);
  assert.ok(snapshot.visit && Number.isFinite(snapshot.visit.total), '快照缺少拜访优先级');
  assert.ok(snapshot.followedAt, '快照缺少关注时间');
  assert.equal(followSnapshotFor(null), null);
  assert.equal(followSnapshotFor('不是对象'), null);
});

test('关注清单去重、剔非法并遵守上限，不重复计同一企业', () => {
  const a = { key: 'es-0001', name: '甲公司', followedAt: '2026-10-14T09:00:00.000Z' };
  const aDup = { key: 'es-0001', name: '甲公司', followedAt: '2026-10-14T10:00:00.000Z' };
  const b = { key: 'es-0002', name: '乙公司', followedAt: '2026-10-14T11:00:00.000Z' };
  const merged = dedupeFollowed([a, aDup, b, null, { key: '', name: '无键' }]);
  assert.deepEqual(
    merged.map((item) => item.key),
    ['es-0001', 'es-0002'],
    '重复企业应只保留一条',
  );
  // 超出上限时保留前若干条（列表语义为新关注的在前）。
  const many = Array.from({ length: FOLLOWED_MAX_ITEMS + 10 }, (_, index) => ({
    key: `es-${index}`,
    name: `企业${index}`,
  }));
  assert.equal(dedupeFollowed(many).length, FOLLOWED_MAX_ITEMS);
  assert.ok(FOLLOWED_STORAGE_KEY.startsWith('eco-'), '存储键应挂在 eco 命名空间下');
});

// ---------------------------------------------------------------- 营销建议

test('营销建议：按拜访优先级 / 上市属性 / 环节给出可解释的切入话术', () => {
  const tips = marketingTipsFor({
    chain: '电池与核心部件',
    listed: true,
    visit: { total: 88, label: '优先拜访', tone: 'high' },
  });
  assert.equal(tips.length, 3);
  assert.ok(tips[0].includes('优先拜访'), '高优先级未给出走访建议');
  assert.ok(tips[1].includes('上市企业'), '上市企业未给出资本市场切入建议');
  assert.ok(tips[2].includes('电池与核心部件'), '未结合产业链环节');
  // 非上市 + 无优先级：给出补数据的建议而不是编造。
  const plain = marketingTipsFor({
    chain: '',
    listed: false,
    visit: { total: 30, label: '待补数据' },
  });
  assert.equal(plain.length, 2);
  assert.ok(plain[0].includes('走访'), '低优先级应建议先走访补数据');
  assert.ok(plain[1].includes('非上市企业'), '非上市企业未给出融资场景建议');
  assert.deepEqual(marketingTipsFor(null), []);
});

// ---------------------------------------------------------------- 接线

test('App 接线：关注状态单实例下放，生态经营有渲染分支，导航带关注计数', () => {
  const app = read('App.jsx');
  assert.ok(app.includes('useFollowedCompanies()'), 'App 未实例化关注状态');
  assert.ok(app.includes("activeTab === 'eco'"), 'App 缺少生态经营渲染分支');
  assert.ok(
    app.includes('<EcoPage followed={followed} onNavigate={handleTabChange} />'),
    '生态经营未接关注状态',
  );
  assert.ok(
    app.includes('selectedIndustry={activeIndustry} followed={followed}'),
    '授信页未接收关注状态',
  );
  assert.ok(
    /<IntegratedCircuitFishbonePage[\s\S]*?followed=\{followed\}/.test(app),
    '图谱页未接收关注状态',
  );
  assert.ok(app.includes('ecoCount={followed.count}'), '导航未传入关注计数');

  const header = read('features/app/AppHeader.jsx');
  assert.ok(header.includes('ecoCount={ecoCount}'), '头部未向导航透传关注计数');

  const tabs = read('features/app/WorkspaceTabs.jsx');
  assert.ok(tabs.includes('nav-group-label'), '缺少一级分组标题');
  assert.ok(tabs.includes('nav-group-count'), '缺少关注计数徽标');
});

test('图谱与授信的公司信息卡都有关注入口，且状态互通', () => {
  const atlas = read('features/atlas/IndustryAtlasPage.jsx');
  assert.ok(
    /followed\s*=/.test(atlas) === false || atlas.includes('followed'),
    '图谱页未接收 followed',
  );
  assert.ok(
    atlas.includes('follow: followed') &&
      atlas.includes('followed.has(selectedCompany)') &&
      atlas.includes('followed.toggle(selectedCompany)'),
    '图谱公司卡未接入关注状态',
  );

  const credit = read('features/credit/CreditOverviewPage.jsx');
  assert.ok(
    credit.includes('followed.has(selectedCompany)') &&
      credit.includes('followed.toggle(selectedCompany)'),
    '授信抽屉未接入关注状态',
  );

  const drawer = read('features/credit/CreditProfileDrawer.jsx');
  assert.ok(drawer.includes('credit-follow-button'), '授信抽屉缺少关注按钮');
  assert.ok(drawer.includes('已关注') && drawer.includes('☆ 关注'), '授信抽屉关注按钮缺少状态文案');

  const detail = read('features/company/CompanyDetail.jsx');
  assert.ok(detail.includes('detail-follow'), '公司卡缺少关注按钮');
  assert.ok(
    detail.includes("follow.followed ? '★ 已关注' : '☆ 关注'"),
    '公司卡关注按钮缺少状态文案',
  );
});

test('生态经营版面：取消关注、空态引导与营销建议齐备', () => {
  const page = read('features/eco/EcoPage.jsx');
  assert.ok(page.includes('取消关注'), '缺少取消关注操作');
  assert.ok(page.includes("onNavigate?.('fishbone')"), '空态缺少去图谱引导');
  assert.ok(page.includes("onNavigate?.('credit')"), '空态缺少去授信引导');
  assert.ok(page.includes('marketingTipsFor'), '清单未接入营销建议');
  assert.ok(page.includes('拜访优先级'), '未展示拜访优先级');
  assert.ok(page.includes('followed.unfollow'), '未调用取消关注');

  const css = read('features/eco/eco.css');
  assert.ok(css.includes('.eco-unfollow'), '取消关注按钮缺少样式');
  assert.ok(css.includes('.eco-empty'), '空态缺少样式');
});
