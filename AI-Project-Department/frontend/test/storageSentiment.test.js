// 储能行业舆情模型与抓取产物单测：
// 1) 分类 / 情绪 / 环节打标 / 相关性过滤的规则判定正确；
// 2) 去重保留信息更完整的一条；企业匹配不会因通用词误命中；
// 3) 聚合研判（情绪分布、主题排序、窗口、文案）无 undefined / NaN；
// 4) 抓取产物文件结构合法、来源与原文链接齐备、覆盖率达标；
// 5) 空输入健壮；源码层面确认页面会消费该产物并保留链上回落。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CATEGORY_META,
  SENTIMENT_META,
  SIGNAL_META,
  buildCompanyDigest,
  buildCompanyRecent,
  buildSentimentDigest,
  classifyCategory,
  classifySignals,
  companyAliases,
  dedupeItems,
  extractKeywords,
  isRelevant,
  matchCompanies,
  normalizeItem,
  scoreSentiment,
  sentimentIndex,
  summarizeCompanyRecent,
  tagSegments,
  titleKey,
} from '../src/features/report/sentimentModel.js';

const chain = JSON.parse(
  readFileSync(new URL('../public/data/industries/storage-chain.json', import.meta.url), 'utf8'),
);
const SENTIMENT_PATH = new URL(
  '../public/data/industries/storage-weekly-sentiment.json',
  import.meta.url,
);
const COMPANY_DIGEST_PATH = new URL(
  '../public/data/industries/storage-company-digest.json',
  import.meta.url,
);
const pageSource = readFileSync(
  new URL('../src/features/report/WeeklyReportPage.jsx', import.meta.url),
  'utf8',
);
const scriptSource = readFileSync(
  new URL('../scripts/prepare-storage-sentiment.mjs', import.meta.url),
  'utf8',
);

const categoryKeys = new Set(CATEGORY_META.map((item) => item.key));
const sentimentKeys = new Set(SENTIMENT_META.map((item) => item.key));

function collectStrings(value, bucket = []) {
  if (typeof value === 'string') bucket.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, bucket));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, bucket));
  }
  return bucket;
}

/* ---------------- 规则判定 ---------------- */

test('分类词典能把政策、招投标、价格、安全、出海、技术区分开', () => {
  const cases = [
    ['安徽省发改委印发电网侧独立新型储能容量电价有关事项的通知', 'policy'],
    ['山西 400MW/800MWh 储能项目 EPC 总承包中标候选人公示', 'bidding'],
    ['价格走势：2h 储能系统均价 0.5721 元/Wh，4h EPC 均价 0.9927 元/Wh', 'price'],
    ['投运不到一年，储能 PCS 起火！供应商为 GE', 'safety'],
    ['宁德时代再获 3GWh 欧洲钠电储能订单，全年出海订单攀升', 'overseas'],
    ['鹏辉能源风鹏电芯 587Ah 正式量产下线', 'tech'],
    [
      '国轩高科联合大众汽车拟签署投资协议，共建海外锂电池与正极材料产能，总投资约 245 亿元',
      'capital',
    ],
  ];
  cases.forEach(([title, expected]) => {
    assert.equal(classifyCategory(title).key, expected, `${title} 应归入 ${expected}`);
  });
  assert.ok(categoryKeys.has(classifyCategory('随便一句没有关键词的话').key));
});

test('分类按命中权重择优，而不是命中优先级的死板顺序', () => {
  // 同时命中「招中标」与多个价格词时，应判为价格而不是招投标。
  const pricey =
    '价格走势：储能系统均价 0.629 元/Wh；2h EPC 均价 0.9349 元/Wh，本周 55GWh 储能招中标项目';
  assert.equal(classifyCategory(pricey).key, 'price');
  // 只是顺带提到报价的招投标公告，仍应判为招投标。
  const bid = '今日招中标动态：山西阳泉 400MW/800MWh 独立储能 EPC 候选人公示，报价低至 0.903 元/Wh';
  assert.equal(classifyCategory(bid).key, 'bidding');
});

test('情绪打分区分正面、负面与中性', () => {
  assert.equal(scoreSentiment('鹏辉能源风鹏电芯 587Ah 正式量产下线').key, 'positive');
  assert.equal(scoreSentiment('又一储能场站起火，起火点阴燃 4 小时，已强制停运').key, 'negative');
  assert.equal(scoreSentiment('一文读懂四种储能的核心区别').key, 'neutral');
  assert.ok(sentimentKeys.has(scoreSentiment('').key));
});

test('情绪指数按正面 100、中性 50、负面 0 加权', () => {
  assert.equal(sentimentIndex({ positive: 2, neutral: 0, negative: 0 }), 100);
  assert.equal(sentimentIndex({ positive: 0, neutral: 3, negative: 0 }), 50);
  assert.equal(sentimentIndex({ positive: 0, neutral: 0, negative: 4 }), 0);
  assert.equal(sentimentIndex({ positive: 1, neutral: 1, negative: 0 }), 75);
  assert.equal(sentimentIndex({ positive: 0, neutral: 0, negative: 0 }), 50);
});

test('环节打标落在储能链的一级环节上，且不超过 3 个', () => {
  const segments = tagSegments('全钒液流电池储能系统设备采购，配套 220kV 升压站与并网工程');
  assert.ok(segments.length > 0 && segments.length <= 3);
  assert.ok(segments.includes('电池与核心部件'), `应识别出电芯环节：${segments.join(' / ')}`);
});

test('相关性过滤剔除无关条目、保留储能条目', () => {
  assert.equal(isRelevant('今日招中标动态：储能 EPC 候选人公示'), true);
  assert.equal(isRelevant('本周碳酸锂价格走势与电芯成本'), true);
  assert.equal(isRelevant('某公司发布人事任免公告，招聘储能销售'), false);
  assert.equal(isRelevant('世界杯决赛前瞻'), false);
});

test('主题关键词从标题里抓到可统计的名词', () => {
  const keywords = extractKeywords('容量电价机制落地，独立储能进入现货市场，构网型需求提升');
  assert.ok(keywords.includes('容量电价'));
  assert.ok(keywords.includes('现货市场'));
  assert.ok(keywords.includes('构网型'));
  assert.deepEqual(extractKeywords('一句没有主题词的话'), []);
});

test('情绪只判标题：摘要里的反转语境不会把正面条目拖成负面', () => {
  const item = normalizeItem({
    title: '鹏辉能源风鹏电芯 587Ah 正式量产下线',
    summary:
      '电芯已通过针刺、热失控、过充等多项严苛安全测试，并获得 UN38.3 认证，25℃ 常温能效超 95%。',
    sourceId: 'inen',
  });
  assert.equal(item.sentiment, 'positive', '摘要中的「热失控」是测试项，不应把条目判为负面');
  assert.equal(item.category, 'tech', '分类仍可用摘要提高召回');
});

/* ---------------- 企业匹配与去重 ---------------- */

test('企业匹配只用长度≥3 的简称，并排除与通用词同形的名字', () => {
  const hits = matchCompanies('宁德时代再获 3GWh 欧洲大单，阳光电源同步扩产', chain.companies);
  const names = hits.map((item) => item.name);
  assert.ok(names.includes('宁德时代'));
  assert.ok(names.includes('阳光电源'));
  // 「太阳能」是链上企业简称，但在新闻标题里多为普通名词，必须排除。
  assert.equal(names.includes('太阳能'), false);
  assert.deepEqual(matchCompanies('', chain.companies), []);
});

test('去重按归一化标题合并，并保留信息更完整的一条', () => {
  const plain = normalizeItem({
    title: '鹏辉能源 587Ah 电芯量产下线',
    url: 'https://a/1',
    sourceId: 's',
  });
  const rich = normalizeItem({
    title: '鹏辉能源 587Ah 电芯量产下线！',
    url: 'https://b/2',
    sourceId: 's',
    publishedAt: '2026-10-10',
    summary: '鹏辉能源在衢州零碳工厂举行量产下线仪式，标志其储能大电芯进入大批量交付阶段。',
  });
  const merged = dedupeItems([plain, rich]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].url, 'https://b/2');
  assert.ok(titleKey(plain.title) === titleKey(rich.title));
});

test('规范化产出的 id 稳定且字段齐备', () => {
  const item = normalizeItem(
    { title: '独立储能首次参与华东省间互济交易', url: 'https://a/x', sourceId: 'escn' },
    { companies: chain.companies },
  );
  const again = normalizeItem(
    { title: '独立储能首次参与华东省间互济交易', url: 'https://a/y', sourceId: 'escn' },
    { companies: chain.companies },
  );
  assert.equal(item.id, again.id, '同一标题应得到同一个 id');
  assert.ok(item.categoryLabel && item.sentimentLabel);
  assert.ok(Array.isArray(item.segments) && Array.isArray(item.keywords));
  assert.equal(normalizeItem({ title: '   ' }), null);
});

/* ---------------- 聚合研判 ---------------- */

test('聚合研判的分档计数、排序与文案自洽', () => {
  const items = [
    normalizeItem({
      title: '储能容量电价细则印发，独立储能收益机制成型',
      sourceId: 'a',
      publishedAt: '2026-10-08',
    }),
    normalizeItem({ title: '某储能电站起火被强制停运', sourceId: 'a', publishedAt: '2026-10-09' }),
    normalizeItem({
      title: '储能系统均价 0.629 元/Wh 再创新低',
      sourceId: 'b',
      publishedAt: '2026-10-10',
    }),
  ];
  const digest = buildSentimentDigest(
    {
      items,
      sources: [
        { id: 'a', name: '甲源' },
        { id: 'b', name: '乙源' },
      ],
      generatedAt: '2026-10-12T00:00:00Z',
      rawCount: 5,
    },
    { companies: [], topLimit: 2 },
  );
  assert.equal(digest.meta.itemCount, 3);
  assert.equal(digest.meta.rawCount, 5);
  assert.equal(digest.meta.deduped, 2);
  assert.equal(digest.sentiment.total, 3);
  assert.equal(digest.sentiment.positive + digest.sentiment.neutral + digest.sentiment.negative, 3);
  assert.equal(
    digest.categories.reduce((sum, row) => sum + row.count, 0),
    3,
    '分类计数应覆盖全部条目',
  );
  assert.ok(digest.categories.length >= 2);
  assert.equal(digest.meta.windowLabel, '2026-10-08 至 2026-10-10');
  assert.equal(digest.top.length, 2);
  assert.ok(
    digest.meta.sources.every((source) => source.count > 0),
    '零条目的来源不应出现在来源表',
  );
  assert.equal(digest.risk.length >= 1, true, '负面条目应进入风险提示');

  const strings = collectStrings(digest);
  strings.forEach((text) => {
    assert.ok(!/undefined|NaN|Infinity|\[object/.test(text), `文案出现异常值：${text}`);
  });
});

test('舆情为空时聚合结果仍可用（不抛错、有合理默认）', () => {
  const digest = buildSentimentDigest(null);
  assert.equal(digest.meta.itemCount, 0);
  assert.equal(digest.sentiment.index, 50);
  assert.equal(digest.top.length, 0);
  assert.ok(digest.headline.length > 0);
  assert.ok(digest.riskNote.length > 0);
});

/* ---------------- 抓取产物 ---------------- */

test('舆情快照文件结构合法、来源与原文链接齐备', () => {
  assert.equal(existsSync(SENTIMENT_PATH), true, '应先执行 pnpm prepare:sentiment 生成舆情快照');
  const payload = JSON.parse(readFileSync(SENTIMENT_PATH, 'utf8'));
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.industry, '储能产业');
  assert.ok(payload.generatedAt && !Number.isNaN(Date.parse(payload.generatedAt)));
  assert.ok(Array.isArray(payload.sources) && payload.sources.length >= 2);
  assert.ok(payload.items.length >= 12, `有效条目应达到阈值，实际 ${payload.items.length} 条`);

  const ids = new Set();
  payload.items.forEach((item) => {
    assert.ok(item.title && item.title.length >= 8, `标题过短：${item.title}`);
    assert.ok(/^https?:\/\//.test(item.url), `原文链接必须是绝对地址：${item.title}`);
    assert.ok(item.source && item.sourceId, `缺来源：${item.title}`);
    assert.ok(categoryKeys.has(item.category), `未知分类 ${item.category}`);
    assert.ok(sentimentKeys.has(item.sentiment), `未知情绪 ${item.sentiment}`);
    assert.ok(item.impact >= 1 && item.impact <= 4);
    assert.ok(!ids.has(item.id), `条目 id 重复：${item.id}`);
    ids.add(item.id);
  });

  const dated = payload.items.filter((item) => item.publishedAt).length;
  const summarized = payload.items.filter((item) => item.summary).length;
  assert.ok(
    dated / payload.items.length >= 0.6,
    `带发布日期的条目占比偏低：${dated}/${payload.items.length}`,
  );
  assert.ok(
    summarized / payload.items.length >= 0.3,
    `带摘要的条目占比偏低：${summarized}/${payload.items.length}`,
  );
});

test('快照的发布窗口收敛在本期，且分类覆盖多个维度', () => {
  const payload = JSON.parse(readFileSync(SENTIMENT_PATH, 'utf8'));
  const digest = buildSentimentDigest(payload, { companies: chain.companies });
  assert.ok(digest.meta.windowLabel.includes('至'), `窗口应跨多日：${digest.meta.windowLabel}`);
  const [from, to] = digest.meta.windowLabel.split(' 至 ');
  const spanDays = (Date.parse(to) - Date.parse(from)) / 86400000;
  assert.ok(spanDays <= 60, `窗口过宽（${spanDays} 天），时效过滤可能失效`);
  assert.ok(digest.categories.length >= 4, `分类覆盖不足：${digest.categories.length}`);
  assert.ok(digest.policy.length >= 1, '应有政策类条目');
  assert.ok(digest.top.length >= 4);
  // 涉及企业必须都能在链上找到（全称入链后，标题命中与快照都常用简称，需覆盖别名）
  const chainNames = new Set(
    chain.companies.flatMap((company) => [company.name, ...(company.aliases || [])]),
  );
  digest.companies.forEach((company) => {
    assert.ok(chainNames.has(company.name), `${company.name} 不在链上企业清单里`);
    assert.ok(company.count >= 1);
  });
});

/* ---------------- 源码约束 ---------------- */

test('页面消费舆情快照，并保留没有快照时的链上回落', () => {
  assert.ok(pageSource.includes('storage-weekly-sentiment.json'), '页面必须加载舆情快照文件');
  assert.ok(pageSource.includes('buildSentimentDigest'), '页面必须用共享模型聚合，避免口径分裂');
  assert.ok(
    pageSource.includes('舆情快照未就绪'),
    '缺失快照时必须回落为链上研判并给出提示，而不是空白',
  );
  assert.ok(
    pageSource.includes('target="_blank"') && pageSource.includes('rel="noreferrer"'),
    '舆情标题应可跳转原文核对',
  );
});

test('抓取脚本与页面共用同一份口径，并且不写入半成品', () => {
  assert.ok(
    scriptSource.includes("from '../src/features/report/sentimentModel.js'"),
    '脚本必须复用 sentimentModel 的规范化与聚合逻辑',
  );
  assert.ok(scriptSource.includes('MIN_VALID_ITEMS'), '抓取失败时应放弃写盘并保留上一版');
  assert.ok(scriptSource.includes('recencyCutoff'), '脚本应做时效过滤，避免旧闻拉宽研判窗口');
});

/* ---------------- 技术与产品信号 ---------------- */

test('三类技术/产品信号能把技术路线、新品发布与价格成本区分开', () => {
  const keys = new Set(SIGNAL_META.map((item) => item.key));
  assert.deepEqual([...keys], ['route', 'launch', 'cost']);

  assert.ok(classifySignals('全钒液流电池循环寿命突破 20000 次').includes('route'));
  assert.ok(classifySignals('阳光电源发布 PowerTitan 3.0 新品，首台样机下线').includes('launch'));
  assert.ok(classifySignals('储能系统均价 0.629 元/Wh，碳酸锂成本继续下探').includes('cost'));
  assert.deepEqual(classifySignals('一句没有信号词的话'), []);
  classifySignals('储能系统均价 0.629 元/Wh').forEach((key) => {
    assert.ok(keys.has(key), `未知信号分类：${key}`);
  });
});

test('规范化条目带信号标签，聚合结果按三类信号分栏返回', () => {
  const items = [
    normalizeItem({ title: '鹏辉能源风鹏电芯 587Ah 正式量产下线', sourceId: 'a' }),
    normalizeItem({ title: '储能系统均价 0.629 元/Wh 再创新低', sourceId: 'b' }),
  ];
  assert.ok(items[0].signals.length >= 1, '条目应带信号标签');
  const digest = buildSentimentDigest({ items, sources: [], rawCount: 2 });
  assert.equal(digest.signals.length, 3, '三类信号应齐全');
  digest.signals.forEach((column) => {
    assert.ok(SIGNAL_META.some((meta) => meta.key === column.key));
    assert.equal(column.count, column.items.length, '信号条数应与条目数一致');
    assert.ok(column.accent && column.hint);
  });
});

/* ---------------- 本周总结 ---------------- */

test('本周总结在情绪判断之外补充抓取内容归纳', () => {
  const items = [
    normalizeItem({
      title: '安徽省发改委关于独立储能容量电价的通知',
      url: 'https://example.com/a',
      sourceId: 'a',
    }),
    normalizeItem({
      title: '某储能电站起火被强制停运',
      url: 'https://example.com/b',
      sourceId: 'a',
    }),
    normalizeItem({
      title: '储能系统均价 0.629 元/Wh 再创新低',
      url: 'https://example.com/c',
      sourceId: 'b',
    }),
  ];
  const digest = buildSentimentDigest({
    items,
    sources: [
      { id: 'a', name: '甲源' },
      { id: 'b', name: '乙源' },
    ],
    rawCount: 3,
  });
  assert.ok(digest.headline.includes('情绪'), 'headline 仍是行业情绪判断');
  assert.ok(digest.lead.includes('情绪指数'), 'lead 仍是情绪口径说明');
  assert.equal(digest.contentSummary, digest.newsSummary.overview, 'contentSummary 保留为总述文案');

  // 抓取内容总结：一段叙述性总述
  const { overview, points } = digest.newsSummary;
  assert.ok(overview.length > 40, '应给出抓取内容总述');
  assert.ok(overview.includes('公开资讯'), '总述应说明抓取口径');
  assert.ok(overview.includes('政策机制'), '总述应点名最密集的主线');
  assert.ok(!/undefined|NaN/.test(overview), '总述不应出现 undefined / NaN');

  // 分主线要点：带条数、代表报道与原文链接
  assert.ok(points.length > 0, '应给出分主线要点');
  points.forEach((point) => {
    assert.ok(point.label && point.count > 0, `要点需带主线名与条数：${JSON.stringify(point)}`);
    assert.ok(point.lead && point.lead.title, '要点应给出代表性报道');
    assert.ok(/^https?:\/\//.test(point.lead.url), '代表报道必须可跳原文');
    assert.ok(!/undefined|NaN/.test(point.lead.title));
  });

  // 空输入兜底，不能是空串
  const empty = buildSentimentDigest(null);
  assert.ok(empty.contentSummary.length > 0, '空输入也要有兜底文案');
  assert.ok(empty.newsSummary.points.length === 0, '无数据时不应编造要点');
});

test('内容总结跳过推广稿选代表性报道', () => {
  const items = [
    normalizeItem({ title: '中国国际储能大会暨展览会隆重开幕，火热报名中', sourceId: 'a' }),
    normalizeItem({ title: '国家能源局公开征求意见：新型储能纳入并网主体', sourceId: 'a' }),
  ];
  const digest = buildSentimentDigest({ items, sources: [{ id: 'a', name: '甲源' }], rawCount: 2 });
  const policy = digest.newsSummary.points.find((point) => point.key === 'policy');
  assert.ok(policy, '应产出政策机制要点');
  assert.ok(
    policy.lead.title.includes('国家能源局'),
    `代表报道应避开会展推广稿，实际取到「${policy.lead.title}」`,
  );
});

test('三栏聚焦返回全量条目，供页面自行控制展示条数', () => {
  const items = Array.from({ length: 7 }, (_, index) =>
    normalizeItem({
      title: `政策速递：储能容量电价实施细则第 ${index + 1} 批印发`,
      sourceId: 'a',
    }),
  );
  const digest = buildSentimentDigest({ items, sources: [], rawCount: 7 });
  assert.ok(digest.policy.length > 4, `政策栏应返回全量条目，实际 ${digest.policy.length}`);
  assert.equal(digest.policy.length, 7);
});

/* ---------------- 企业近况 ---------------- */

test('企业近况按别名匹配，并给出「暂无」兜底', () => {
  // 全称入链后「宁德时代」是简称，须按名称或别名定位链上主体
  const company = chain.companies.find(
    (item) => item.name === '宁德时代' || (item.aliases || []).includes('宁德时代'),
  );
  const aliases = companyAliases(company);
  assert.ok(aliases.includes('宁德时代'));
  assert.ok(aliases.length >= 1);

  const items = [
    normalizeItem({ title: '宁德时代再获 3GWh 欧洲储能订单', sourceId: 'a' }),
    normalizeItem({ title: '惠州亿纬锂能股份有限公司发布储能新品', sourceId: 'b' }),
    normalizeItem({ title: '某地储能电站投运', sourceId: 'c' }),
  ];
  const rows = buildCompanyRecent('宁德时代', items, { aliases });
  assert.equal(rows.length, 1);
  assert.ok(summarizeCompanyRecent('宁德时代', rows).includes('宁德时代近况'));
  assert.equal(summarizeCompanyRecent('宁德时代', []), '暂无');

  const digest = buildCompanyDigest(['宁德时代', '不存在的企业'], { 宁德时代: rows });
  assert.equal(digest['不存在的企业'], undefined);
  assert.equal(digest['宁德时代'].count, 1);
  assert.ok(digest['宁德时代'].summary.includes('宁德时代'));
});

test('企业近况快照结构合法，且企业名都能在链上找到', () => {
  assert.equal(
    existsSync(COMPANY_DIGEST_PATH),
    true,
    '应先执行 pnpm prepare:company 生成企业近况快照',
  );
  const payload = JSON.parse(readFileSync(COMPANY_DIGEST_PATH, 'utf8'));
  assert.equal(payload.schemaVersion, 1);
  assert.ok(payload.generatedAt && !Number.isNaN(Date.parse(payload.generatedAt)));
  assert.ok(payload.count >= 8, `有效企业数偏低：${payload.count}`);
  assert.equal(Object.keys(payload.companies).length, payload.count);

  const chainNames = new Set(
    chain.companies.flatMap((company) => [company.name, ...(company.aliases || [])]),
  );
  Object.values(payload.companies).forEach((row) => {
    assert.ok(chainNames.has(row.name), `${row.name} 不在链上企业清单里`);
    assert.ok(row.items.length >= 1 && row.items.length <= 5);
    assert.ok(row.summary && row.summary !== '暂无', `${row.name} 应给出近况总结`);
    row.items.forEach((item) => {
      assert.ok(
        item.title && /^https?:\/\//.test(item.url),
        `原文链接必须为绝对地址：${item.title}`,
      );
    });
  });
});

/* ---------------- 页面结构约束 ---------------- */

test('本周研判改名为本周总结，重点舆情不再标注排序口径', () => {
  assert.ok(pageSource.includes('本周总结'), '「一句话研判」应改名为「本周总结」');
  assert.ok(!pageSource.includes('一句话研判'), '不应再残留旧文案');
  // 本周总结 = 情绪判断 + 抓取内容总结两段，后者渲染 newsSummary 的总述与主线要点。
  assert.ok(pageSource.includes('情绪判断'), '本周总结应显式标注情绪判断');
  assert.ok(pageSource.includes('抓取内容总结'), '本周总结应含抓取内容总结小节');
  assert.ok(pageSource.includes('newsSummary'), '抓取内容总结应消费 newsSummary');
  assert.ok(pageSource.includes('newsSummary.overview'), '应渲染抓取内容总述');
  assert.ok(pageSource.includes('newsSummary.points'), '应渲染分主线要点');
  assert.ok(pageSource.includes('brief-digest-lead'), '要点应给出可跳原文的代表报道');
  assert.ok(!pageSource.includes('按影响力排序'), '重点舆情标题应去掉「按影响力排序」');
});

/** 统计子串出现次数：通用兼容分支（非储能行业）仍保留原版式，因此按出现次数断言。 */
function countOf(source, text) {
  return source.split(text).length - 1;
}

test('已下线的三个链上模块不再出现在储能周报里', () => {
  // 「链上可以挖掘的信息」只在通用兼容分支里保留一次；储能分支已下线。
  assert.equal(countOf(pageSource, '链上可以挖掘的信息'), 1);
  assert.equal(countOf(pageSource, '一级环节与梯队扫描'), 0);
  assert.equal(countOf(pageSource, '链上印证'), 0);
});

test('三栏聚焦与信号栏都提供展开按钮', () => {
  assert.ok(pageSource.includes('MoreButton'), '应提供统一的展开/收起按钮');
  assert.ok(/展开全部/.test(pageSource), '展开按钮文案应说明可展开全部条目');
});

test('重点关注企业模块：改名、置末、近况总结与添加关注企业', () => {
  assert.ok(countOf(pageSource, '重点关注企业') >= 1, '应改名为「重点关注企业」');
  // 「上市企业观察」只允许残留在通用兼容分支里。
  assert.equal(countOf(pageSource, '上市企业观察'), 1, '储能分支不应再使用旧模块名');
  assert.ok(!pageSource.includes('画像完整度优先'), '应去掉「画像完整度优先」字样');
  assert.ok(pageSource.includes('添加关注企业'), '应提供「添加关注企业」入口');
  assert.ok(pageSource.includes('近况分析'), '应提供「近况分析」按钮');
  assert.ok(pageSource.includes('暂无'), '没有近况时应显示「暂无」');
  // 「重点关注企业」要在「技术与产品信号」之后渲染（模块移到最后）。
  const signalIndex = pageSource.indexOf('02 / SIGNAL DESK');
  const watchIndex = pageSource.indexOf('03 / KEY COMPANIES');
  assert.ok(signalIndex > 0 && watchIndex > signalIndex, '重点关注企业应排在技术与产品信号之后');
});

test('近况分析仅使用本地快照与舆情库，不做运行时联网', () => {
  const clientSource = readFileSync(
    new URL('../src/features/report/companyRecent.js', import.meta.url),
    'utf8',
  );
  assert.ok(clientSource.includes('analyzeCompanyRecent'), '应导出近况分析入口');
  assert.ok(clientSource.includes("mode: 'snapshot'"), '应优先使用构建期快照');
  assert.ok(clientSource.includes("mode: 'none'"), '都取不到时应返回「暂无」');
  assert.ok(
    !clientSource.includes('http://') && !clientSource.includes('https://'),
    '近况分析不应包含任何外部 URL',
  );
  assert.ok(!clientSource.includes('VITE_NEWS'), '不应保留联网代理/检索配置');
});

test('企业近况抓取脚本复用共享模型，并保留原文链接', () => {
  const companyScript = readFileSync(
    new URL('../scripts/prepare-company-digest.mjs', import.meta.url),
    'utf8',
  );
  assert.ok(
    companyScript.includes("from '../src/features/report/sentimentModel.js'"),
    '企业近况脚本必须复用 sentimentModel',
  );
  assert.ok(companyScript.includes('MIN_VALID_COMPANIES'), '抓取失败时应放弃写盘');
  assert.ok(companyScript.includes('companyAliases'), '匹配应覆盖简称与全称');
});
