// 「政策分析」页改为集合解读后的测试：行业识别、有效期判定、集合聚合与页面接线。
//
// 覆盖的原则同样是「口径可回溯」：行业标签来自关键词命中、有效期只认正文显式写法、
// 集合结论可从逐条明细逐项加总核对。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SAMPLE_POLICIES } from '../src/features/policy/policyData.js';
import {
  INDUSTRY_LEXICON,
  detectIndustries,
  isStoragePolicy,
  resolveIndustries,
} from '../src/features/policy/policyIndustry.js';
import {
  EXPIRING_WINDOW_DAYS,
  isWithinValidity,
  parseCount,
  resolveValidity,
  todayIso,
} from '../src/features/policy/policyValidity.js';
import {
  POLICY_SCOPES,
  digestPolicies,
  selectPolicies,
} from '../src/features/policy/policyDigest.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(here, '..', 'src');
const read = (relative) => readFileSync(path.join(srcRoot, relative), 'utf8');

const NOW = new Date('2026-10-15T00:00:00');
const storagePolicy = (text, title = '储能政策') => ({ id: title, title, text });
const atDays = (days) => {
  const date = new Date(Date.UTC(2026, 9, 15));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- 行业识别

test('行业词表结构完整：27 个行业（储能 + 10 + 10 + 6）、key 唯一、标签非空', () => {
  const keys = INDUSTRY_LEXICON.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length, '行业 key 重复');
  assert.ok(keys.includes('storage'), '必须包含储能行业');
  // 储能 + 科技金融十大赛道 + 工信部十大稳增长行业 + 六大未来产业 = 27。
  assert.equal(INDUSTRY_LEXICON.length, 27, '行业参照系应为 27 个');
  const byGroup = (group) => INDUSTRY_LEXICON.filter((item) => item.group === group);
  assert.equal(byGroup('storage').length, 1, '储能应单独成组');
  assert.equal(byGroup('tech').length, 10, '科技金融十大赛道应为 10 个');
  assert.equal(byGroup('steady').length, 10, '工信部十大稳增长行业应为 10 个');
  assert.equal(byGroup('future').length, 6, '六大未来产业应为 6 个');
  INDUSTRY_LEXICON.forEach((item) => {
    assert.ok(item.label && item.keywords.length >= 1, `${item.key} 的标签或关键词缺失`);
    item.keywords.forEach((word) =>
      assert.ok(word && word.length >= 2, `${item.key} 存在过短关键词`),
    );
  });
});

test('储能政策命中储能行业，且回显命中的原文词', () => {
  const policy = storagePolicy(
    '支持新型储能与电化学储能发展，推动独立储能电站、共享储能参与电力市场。',
  );
  const industries = detectIndustries(policy);
  const storage = industries.find((item) => item.key === 'storage');
  assert.ok(storage, '储能政策未命中储能行业');
  assert.ok(storage.hits.includes('新型储能'), '未回显命中词「新型储能」');
  assert.ok(storage.count === storage.hits.length, '命中词数与 hits 长度不一致');
});

test('非储能政策不会被误判为储能', () => {
  const pv = detectIndustries(
    storagePolicy('推动光伏组件与分布式光伏发展，扩大硅片产能。', '光伏规划'),
  );
  assert.ok(!pv.some((item) => item.key === 'storage'), '光伏政策被误判为储能');
  // 十大赛道口径下不单列光伏，归入「新能源」赛道。
  assert.deepEqual(
    pv.map((item) => item.key),
    ['newenergy'],
    '光伏政策未归入新能源赛道',
  );
});

test('人工修正优先于自动识别，识别不到时归「其他行业」', () => {
  const policy = storagePolicy('本文件未提及任何具体产业。', '通用文件');
  const auto = resolveIndustries(policy);
  assert.equal(auto[0].key, 'other', '无命中时未归入其他行业');
  assert.ok(auto[0].fallback, '未标记为兜底结果');

  const manual = resolveIndustries(policy, 'storage');
  assert.equal(manual[0].key, 'storage', '人工修正未生效');
  assert.ok(manual[0].manual, '人工结果未标记 manual');
  assert.ok(isStoragePolicy(policy, 'storage'), '人工修正后储能判定未生效');
});

// ---------------------------------------------------------------- 有效期

test('中文数量词可解析为数字', () => {
  // 入参是正则捕获到的数量词部分（不含「年」），与 resolveValidity 的调用方式一致。
  assert.equal(parseCount('5'), 5);
  assert.equal(parseCount('三'), 3);
  assert.equal(parseCount('两'), 2);
  assert.equal(parseCount('十'), 10);
  assert.equal(parseCount('二十'), 20);
  assert.equal(parseCount('十五'), 15);
  assert.equal(parseCount('很长'), null);
});

test('正文写明「有效期至」时按其判定状态', () => {
  const expired = resolveValidity(
    storagePolicy('本办法自 2022 年 1 月 1 日起施行，有效期至 2023 年 12 月 31 日。'),
    { now: NOW },
  );
  assert.equal(expired.status, 'expired');
  assert.equal(expired.expiresOn, '2023-12-31');

  const active = resolveValidity(
    storagePolicy('本通知有效期至 2028 年 6 月 30 日，支持储能电站建设。'),
    { now: NOW },
  );
  assert.equal(active.status, 'active');
  assert.equal(active.expiresOn, '2028-06-30');
  assert.equal(active.source, 'text');
});

test('只写到年份时按当年最后一天保守处理', () => {
  const validity = resolveValidity(storagePolicy('本方案有效期至 2027 年，支持新型储能。'), {
    now: NOW,
  });
  assert.equal(validity.expiresOn, '2027-12-31');
  assert.equal(validity.status, 'active');
});

test('「自 X 起施行，有效期 N 年」按施行日加年限计算', () => {
  const validity = resolveValidity(
    storagePolicy('本措施自 2025 年 3 月 1 日起施行，有效期 5 年。'),
    { now: NOW },
  );
  // 2025-03-01 起 5 个完整年度，到期日为 2030-02-28。
  assert.equal(validity.expiresOn, '2030-02-28');
  assert.equal(validity.status, 'active');
  assert.ok(validity.basis.includes('有效期 5 年'), '依据未回显有效期年限');
});

test('距失效日不足 90 天标记为即将到期', () => {
  const validity = resolveValidity(
    storagePolicy(`本通知有效期至 ${atDays(EXPIRING_WINDOW_DAYS - 10)}。`),
    { now: NOW },
  );
  assert.equal(validity.status, 'expiring');
  assert.ok(validity.daysLeft <= EXPIRING_WINDOW_DAYS && validity.daysLeft >= 0);
});

test('长期有效与未标注有效期都不算过期', () => {
  const permanent = resolveValidity(storagePolicy('本规划长期有效，支持储能产业发展。'), {
    now: NOW,
  });
  assert.equal(permanent.status, 'permanent');
  assert.ok(isWithinValidity(permanent), '长期有效被排除');

  const unknown = resolveValidity(storagePolicy('推动新型储能规模化发展，到 2030 年装机翻番。'), {
    now: NOW,
  });
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.expiresOn, '');
  assert.ok(isWithinValidity(unknown), '未标注有效期被当成过期');
  // 目标年份只作参考，不能当失效日。
  assert.deepEqual(unknown.years, [2030]);
});

test('人工修正有效期优先于正文识别', () => {
  const policy = storagePolicy('本办法有效期至 2020 年 12 月 31 日。');
  const forced = resolveValidity(policy, { now: NOW, override: 'permanent' });
  assert.equal(forced.status, 'permanent');
  assert.ok(forced.manual, '人工修正未标记 manual');
  assert.equal(forced.overrideValue, 'permanent');

  const dated = resolveValidity(policy, { now: NOW, override: '2031-01-31' });
  assert.equal(dated.status, 'active');
  assert.equal(dated.expiresOn, '2031-01-31');
});

test('有效期判定基准可注入，同输入结果可复现', () => {
  const policy = storagePolicy('本通知有效期至 2027 年 1 月 1 日。');
  const early = resolveValidity(policy, { now: new Date('2026-01-01T00:00:00') });
  const late = resolveValidity(policy, { now: new Date('2027-06-01T00:00:00') });
  assert.equal(early.status, 'active');
  assert.equal(late.status, 'expired');
  assert.equal(todayIso(NOW), '2026-10-15');
  assert.deepEqual(
    resolveValidity(policy, { now: NOW }),
    resolveValidity(policy, { now: NOW }),
    '同输入结果不一致',
  );
});

// ---------------------------------------------------------------- 集合筛选与聚合

const EXTRA = [
  {
    id: 'x-expired',
    title: '已过期储能补贴办法',
    text: '支持新型储能。有效期至 2023 年 12 月 31 日。',
  },
  {
    id: 'x-term',
    title: '限期储能支持措施',
    text: '本措施自 2025 年 3 月 1 日起施行，有效期 5 年。推动电化学储能。',
  },
  { id: 'x-pv', title: '光伏发展规划', text: '推动光伏组件与分布式光伏发展。本规划长期有效。' },
];
const LIBRARY = [...SAMPLE_POLICIES, ...EXTRA];

test('储能视图只纳入「储能 + 未过期」的政策，并说明排除项', () => {
  const { rows, excluded } = selectPolicies(LIBRARY, 'storage', { now: NOW });
  assert.ok(rows.length > 0, '储能视图为空');
  rows.forEach((row) => {
    assert.ok(row.isStorage, `${row.title} 混入非储能政策`);
    assert.ok(isWithinValidity(row.validity), `${row.title} 混入已过期政策`);
  });
  assert.equal(excluded.expired, 1, '已过期政策未被排除');
  assert.equal(excluded.otherIndustry, 1, '非储能政策未被排除');
});

test('全部行业视图纳入全部政策，不做行业与有效期过滤', () => {
  const { rows, excluded } = selectPolicies(LIBRARY, 'all', { now: NOW });
  assert.equal(rows.length, LIBRARY.length);
  assert.deepEqual(excluded, { expired: 0, otherIndustry: 0 });
});

test('两个视图的库内条数可同时得到，且储能视图不多于全部视图', () => {
  const digest = digestPolicies(LIBRARY, { scope: 'storage', now: NOW });
  assert.equal(digest.scopeCounts.all, LIBRARY.length, '全部视图条数不等于库内条数');
  assert.ok(digest.scopeCounts.storage <= digest.scopeCounts.all, '储能视图条数超过全部视图');
  assert.equal(digest.matchedCount, digest.scopeCounts.storage, '当前视图条数与读数不一致');
});

test('级别分布、有效期分布与逐条明细可逐项加总核对', () => {
  const digest = digestPolicies(LIBRARY, { scope: 'all', now: NOW });
  const levelSum = digest.levelMix.reduce((total, item) => total + item.count, 0);
  assert.equal(levelSum, digest.matchedCount, '级别分布合计与纳入条数不一致');
  const validitySum = digest.validityMix.reduce((total, item) => total + item.count, 0);
  assert.equal(validitySum, digest.matchedCount, '有效期分布合计与纳入条数不一致');
  const chainSum = digest.chainMix.reduce((total, item) => total + item.count, 0);
  assert.ok(chainSum > 0, '产业链覆盖统计为空');
  digest.chainMix.forEach((item) => {
    assert.ok(item.count <= digest.matchedCount, `${item.label} 覆盖条数超出纳入条数`);
    assert.ok(item.ratio >= 0 && item.ratio <= 100, `${item.label} 占比越界`);
  });
});

test('评分统计与逐条明细一致，明细按评分降序', () => {
  const digest = digestPolicies(LIBRARY, { scope: 'all', now: NOW });
  const totals = digest.rows.map((row) => row.score.total);
  assert.equal(digest.score.max, Math.max(...totals));
  assert.equal(digest.score.min, Math.min(...totals));
  const avg = Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10;
  assert.equal(digest.score.avg, avg);
  assert.deepEqual(
    totals,
    [...totals].sort((a, b) => b - a),
    '明细未按评分降序',
  );
});

test('每条明细都带行业、有效期与关键结论摘要', () => {
  const digest = digestPolicies(LIBRARY, { scope: 'all', now: NOW });
  digest.rows.forEach((row) => {
    assert.ok(row.industries.length >= 1, `${row.title} 缺少行业标签`);
    assert.ok(row.validity.status, `${row.title} 缺少有效期状态`);
    assert.ok(row.headline.length >= 3, `${row.title} 关键结论过少`);
    assert.ok(row.result.score.total > 0, `${row.title} 缺少评分`);
  });
});

test('即将到期清单只列未来一年内有明确失效日的政策', () => {
  const digest = digestPolicies(LIBRARY, { scope: 'all', now: NOW });
  digest.upcoming.forEach((row) => {
    assert.ok(row.validity.expiresOn, '到期清单出现无失效日的政策');
    assert.ok(row.validity.daysLeft >= 0 && row.validity.daysLeft <= 365, '到期清单出现超期条目');
  });
  assert.ok(
    digest.upcoming.every(
      (row, index) =>
        index === 0 || row.validity.daysLeft >= digest.upcoming[index - 1].validity.daysLeft,
    ),
    '到期清单未按剩余天数升序',
  );
});

test('空政策库不报错，读数回落为零', () => {
  POLICY_SCOPES.forEach((scope) => {
    const digest = digestPolicies([], { scope: scope.key, now: NOW });
    assert.equal(digest.matchedCount, 0);
    assert.equal(digest.score.avg, 0);
    assert.equal(digest.rows.length, 0);
    assert.ok(digest.scopeMeta.emptyHint, `${scope.key} 缺少空态文案`);
  });
});

test('集合解读纯函数：同输入同输出', () => {
  const first = digestPolicies(LIBRARY, { scope: 'storage', now: NOW });
  const second = digestPolicies(LIBRARY, { scope: 'storage', now: NOW });
  assert.deepEqual(first, second, '同输入得到不同结论');
});

// ---------------------------------------------------------------- 页面接线

test('页面接入两个解读范围，并把集合结论交给画布渲染', () => {
  const page = read('features/policy/PolicyPage.jsx');
  assert.ok(page.includes('digestPolicies'), '页面未调用集合解读引擎');
  assert.ok(page.includes('policyScopesFor'), '页面未使用解读范围定义');
  assert.ok(page.includes('usePolicyLibrary'), '页面未接入政策库');
  assert.ok(page.includes('PolicyDigestCanvas'), '页面未挂载集合解读画布');
  assert.ok(!page.includes('interpretPolicy('), '页面仍按单条政策解读');
  const digest = read('features/policy/policyDigest.js');
  assert.ok(digest.includes("key: 'storage'"), '引擎缺少储能视图');
  assert.ok(digest.includes("key: 'all'"), '引擎缺少全部行业视图');
});

test('政策清单提供行业与有效期的人工修正入口', () => {
  const canvas = read('features/policy/PolicyDigestCanvas.jsx');
  assert.ok(canvas.includes('industryOverride'), '缺少行业修正字段');
  assert.ok(canvas.includes('validityOverride'), '缺少有效期修正字段');
  assert.ok(canvas.includes('EXPIRY_MODES'), '缺少有效期修正选项');
  assert.ok(canvas.includes('onCorrect'), '缺少修正回调');
  assert.ok(canvas.includes('识别依据'), '未回显识别依据');

  const hook = read('features/policy/usePolicyLibrary.js');
  assert.ok(hook.includes('updateItem'), '政策库未提供修正能力');
  assert.ok(hook.includes('industryOverride'), '政策库未保存行业修正');
  assert.ok(hook.includes('validityOverride'), '政策库未保存有效期修正');
});

test('两个解读范围的文案各自说明筛选口径', () => {
  const scopes = POLICY_SCOPES.map((item) => item.key);
  assert.deepEqual(scopes, ['storage', 'all'], '解读范围顺序被改动');
  const storage = POLICY_SCOPES[0];
  assert.ok(storage.label.includes('储能'), '储能视图标题未点明储能');
  assert.ok(storage.label.includes('有效期'), '储能视图标题未点明有效期');
  assert.ok(storage.desc.includes('过期'), '储能视图未说明过期政策如何处理');
  const all = POLICY_SCOPES[1];
  assert.ok(all.label.includes('全行业'), '第二个视图未点明全行业');
  assert.ok(all.label.includes('对比'), '第二个视图未点明行业对比');
  assert.ok(all.desc.includes('26'), '全行业视图未说明 26 个参照行业');
});

test('工具栏写明有效期判定基准，避免结论随时间漂移', () => {
  const page = read('features/policy/PolicyPage.jsx');
  assert.ok(page.includes('todayIso(now)'), '未展示有效期判定基准');
  assert.ok(page.includes('useMemo(() => new Date()'), '判定基准未在进入页面时固定');
  const validity = read('features/policy/policyValidity.js');
  assert.ok(validity.includes('EXPIRING_WINDOW_DAYS'), '缺少即将到期窗口常量');
});

// ---------------------------------------------------------------- 总体判断与行业地位对比

test('储能视图产出对储能行业的总体政策判断', () => {
  const digest = digestPolicies(LIBRARY, { scope: 'storage', now: NOW });
  const { overall } = digest;
  assert.ok(overall, '缺少总体政策判断');
  assert.ok(overall.headline && overall.headline.length > 0, '总体判断缺少结论句');
  assert.ok(overall.stance && overall.stance.label && overall.stance.tone, '总体判断缺少基调');
  const m = overall.metrics;
  assert.equal(m.count, digest.matchedCount, '总体判断的有效政策数应等于储能视图纳入数');
  ['avg', 'nationalRatio', 'supportRatio', 'expiringSoon'].forEach((key) =>
    assert.ok(typeof m[key] === 'number', `总体判断缺少读数 ${key}`),
  );
  assert.ok(overall.points.length >= 3, '总体判断的要点过少');
  // 切换视图不改变总体判断（它固定取「储能 + 有效期内」口径）。
  const other = digestPolicies(LIBRARY, { scope: 'all', now: NOW });
  assert.deepEqual(other.overall, overall, '切换视图后总体判断被改动');
});

test('全行业视图产出储能与 26 个参照行业的政策地位对比', () => {
  const digest = digestPolicies(LIBRARY, { scope: 'all', now: NOW });
  const { compare } = digest;
  assert.equal(compare.totalIndustries, 27, '参照系应为储能 + 26 个行业');
  assert.equal(compare.industries.length, 27, '对比明细应覆盖 27 个行业');
  assert.equal(compare.sorted[0].rank, 1, '排名未从 1 开始');
  assert.ok(compare.storage.rank >= 1 && compare.storage.rank <= 27, '储能排名越界');
  assert.ok(compare.storage.count >= 1, '储能应有政策命中');
  assert.ok(compare.conclusion.includes('储能'), '对比结论未点明储能');
  // 三组参照系：科技金融十大赛道 10 / 工信部十大稳增长 10 / 六大未来产业 6。
  assert.deepEqual(
    compare.groups.map((group) => group.total),
    [10, 10, 6],
    '参照系分组应为 10 + 10 + 6',
  );
  assert.ok(compare.covered >= 2, '库内命中行业过少，无法比较');
});

test('画布按视图切换首个模块：储能视图总体判断 / 全行业视图行业对比', () => {
  const canvas = read('features/policy/PolicyDigestCanvas.jsx');
  assert.ok(canvas.includes('modulesFor'), '画布未按视图取模块导航');
  assert.ok(canvas.includes('id="overall"'), '缺少总体判断模块');
  assert.ok(canvas.includes('id="compare"'), '缺少行业对比模块');
  assert.ok(canvas.includes('行业总体政策判断'), '缺少总体判断标题');
  assert.ok(canvas.includes('digest.focus.label'), '总体判断标题未按当前行业动态生成');
  assert.ok(canvas.includes('政策地位对比'), '缺少行业对比标题');
});

test('政策库前置为独立条目，导入收纳进「＋ 添加政策」按钮', () => {
  const page = read('features/policy/PolicyPage.jsx');
  assert.ok(page.includes('policy-libbar'), '缺少政策库条目');
  assert.ok(page.includes('添加政策'), '缺少「添加政策」按钮');
  assert.ok(page.includes('policy-libbar-add'), '缺少添加政策弹层');
  // 政策库必须排在解读范围切换之前（前置）。
  assert.ok(
    page.indexOf('LibraryBar') < page.indexOf('policy-scopes'),
    '政策库未排在解读范围切换之前',
  );
});
