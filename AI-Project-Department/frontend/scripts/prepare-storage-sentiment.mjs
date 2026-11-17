#!/usr/bin/env node
// 储能行业舆情抓取与整理脚本。
//
// 从公开资讯源抓取储能行业新闻，做去重、行业相关性过滤、分类、情绪打分、环节打标，
// 输出 public/data/industries/storage-weekly-sentiment.json 供「周报 · 本周研判」模块消费。
//
// 用法：
//   pnpm prepare:sentiment                 # 抓取并覆盖输出
//   pnpm prepare:sentiment -- --limit=60   # 保留条目上限（默认 48）
//   pnpm prepare:sentiment -- --enrich=24  # 回访文章页补齐日期与摘要的条数（默认 20）
//   pnpm prepare:sentiment -- --no-supplement   # 不使用人工检索補充源
//   pnpm prepare:sentiment -- --dry        # 只打印不落盘
//
// 设计约定：
//   1. 规范化/分类/情绪/聚合口径全部来自 src/features/report/sentimentModel.js，
//      与页面展示共用同一份逻辑，避免「入库口径」与「展示口径」分裂。
//   2. 网络失败不产生半成品：抓到的有效条目少于阈值时直接放弃写盘并保留上一版。
//   3. 抓取到的原文链接会原样保留，页面可直接跳转核对。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSentimentDigest,
  dedupeItems,
  isRelevant,
  normalizeItem,
  normalizeDate,
} from '../src/features/report/sentimentModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'public/data/industries/storage-weekly-sentiment.json');
const CHAIN_FILE = path.join(ROOT, 'public/data/industries/storage-chain.json');
const SUPPLEMENT_FILE = path.join(ROOT, 'data-sources/storage-sentiment-supplement.json');

const MIN_VALID_ITEMS = 12;

const UA = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'accept-language': 'zh-CN,zh;q=0.9',
};

/** 资讯源清单。order 越小越先被采用（同一事件多源报道时保留靠前来源的条目）。 */
const SOURCES = [
  {
    id: 'escn',
    name: '中国储能网',
    url: 'https://www.escn.com.cn/',
    channel: '综合',
    kind: 'escn-home',
    order: 1,
    collect: 26,
  },
  {
    id: 'inen',
    name: '国际储能网',
    url: 'https://chuneng.in-en.com/news/',
    channel: '资讯',
    kind: 'inen-list',
    order: 2,
    collect: 26,
  },
  {
    id: 'inen',
    name: '国际储能网',
    url: 'https://chuneng.in-en.com/policy/',
    channel: '政策',
    kind: 'inen-list',
    order: 2,
    collect: 18,
  },
  {
    id: 'inen',
    name: '国际储能网',
    url: 'https://chuneng.in-en.com/xiangmu/',
    channel: '项目',
    kind: 'inen-list',
    order: 3,
    collect: 18,
  },
  {
    id: 'inen',
    name: '国际储能网',
    url: 'https://chuneng.in-en.com/data/',
    channel: '数据',
    kind: 'inen-list',
    order: 4,
    collect: 14,
  },
  {
    id: 'inen',
    name: '国际储能网',
    url: 'https://chuneng.in-en.com/cjdr/',
    channel: '财经',
    kind: 'inen-list',
    order: 5,
    collect: 14,
  },
];

// ------------------------------------------------------------------ 工具

const log = (...args) => console.log('[sentiment]', ...args);

function parseArgs(argv) {
  const args = { limit: 48, enrich: 20, days: 21, supplement: true, dry: false };
  argv.forEach((item) => {
    if (item === '--dry') args.dry = true;
    else if (item === '--no-supplement') args.supplement = false;
    else if (item.startsWith('--limit=')) args.limit = Number(item.slice(8)) || args.limit;
    else if (item.startsWith('--enrich=')) args.enrich = Number(item.slice(9)) || args.enrich;
    else if (item.startsWith('--days=')) args.days = Number(item.slice(7)) || args.days;
  });
  return args;
}

/** 舆情窗口下界：只保留 `days` 天内发布的条目；无日期的条目视为「本期」保留。 */
function recencyCutoff(days) {
  const date = new Date(Date.now() - days * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

async function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchText(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: UA });
    if (!response.ok) return { ok: false, status: response.status, text: '' };
    return { ok: true, status: response.status, text: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeEntities(String(value ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function absoluteUrl(href, base) {
  const value = decodeEntities(href).trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  try {
    return new URL(value, base).href;
  } catch {
    return '';
  }
}

const LIST_DATE_RE = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/g;

function findDateNear(text, start, end) {
  const slice = text.slice(Math.max(0, start), Math.max(0, end));
  const match = [...slice.matchAll(LIST_DATE_RE)].pop();
  return match ? normalizeDate(match[0]) : '';
}

// ------------------------------------------------------------------ 各源解析

/** 中国储能网首页：正文列表里的 /news/show-*.html 锚文本即标题。 */
function parseEscnHome(html, source) {
  const rows = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']*\/news\/show-\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const url = absoluteUrl(match[1], source.url);
    const title = stripTags(match[2]);
    if (!url || title.length < 8 || seen.has(url)) continue;
    seen.add(url);
    rows.push({ title, url, publishedAt: '' });
    if (rows.length >= source.collect) break;
  }
  return rows;
}

/** 国际储能网频道页：锚文本标题 + 邻近日期。 */
function parseInenList(html, source) {
  const rows = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']*chunengy-\d+\.shtml)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const url = absoluteUrl(match[1], source.url);
    const title = stripTags(match[2]);
    if (!url || title.length < 8 || seen.has(url)) continue;
    seen.add(url);
    const end = match.index + match[0].length;
    const publishedAt =
      findDateNear(html, end, end + 600) || findDateNear(html, match.index - 400, match.index);
    rows.push({ title, url, publishedAt });
    if (rows.length >= source.collect) break;
  }
  return rows;
}

// 文章页 meta 摘要：去掉把标题重复一遍的前缀与来源后缀。
function parseArticleSummary(html, title) {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  ];
  let text = '';
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      text = stripTags(match[1]);
      break;
    }
  }
  if (!text) return '';
  // 摘要常把标题原样重复一遍，去掉这段前缀后再用。
  const head = stripTags(title).slice(0, 12);
  if (head && text.slice(0, head.length) === head) {
    const cut = text.slice(head.length).search(/[，,。：:；;\s]/);
    if (cut >= 0 && cut < 70) text = text.slice(head.length + cut + 1);
  }
  text = text.replace(/[，,、]\s*(国际储能网|中国储能网|储能网|北极星储能网|搜狐网|新浪财经)$/g, '');
  return text.replace(/\.{3}$|…+$/, '…').trim();
}

/**
 * 文章页发布日期。按可靠度依次尝试：
 *   ① 「发布时间：/日期：」等显式标签（两站都有）
 *   ② 标题 `<h1 id="title">` 之后 400 字内的日期（in-en 把日期放在标题下方）
 *   ③ 页面开头的第一个日期（兜底；限制在前 15000 字，避免抓到正文引用或相关阅读里的旧日期）
 */
function parseArticleDate(html, fallback) {
  const labelled = html.match(
    /(?:发布时间|发布日期|发布时间|日期|时间)\s*[：:]\s*[^\d]{0,12}(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/,
  );
  if (labelled) return normalizeDate(labelled[0]);

  const nearTitle = html.match(/id=["']title["'][\s\S]{0,400}?(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (nearTitle) return normalizeDate(nearTitle[0]);

  const loose = html.slice(0, 15000).match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (loose) return normalizeDate(loose[0]);

  return fallback || '';
}

async function enrichItem(item) {
  const { ok, text } = await fetchText(item.url, 9000);
  if (!ok || !text) return item;
  return {
    ...item,
    publishedAt: parseArticleDate(text, item.publishedAt),
    summary: parseArticleSummary(text, item.title),
  };
}

/** 有限并发执行，避免对同一站点打太多并发连接。 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

// ------------------------------------------------------------------ 主流程

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chain = await readJson(CHAIN_FILE);
  const companies = chain?.companies || [];
  log(`链上企业 ${companies.length} 家，用作舆情涉及的客户识别`);

  // 1) 逐源抓列表
  const collected = [];
  for (const source of SOURCES) {
    const { ok, status, text, error } = await fetchText(source.url);
    if (!ok) {
      log(`× ${source.name}·${source.channel} 抓取失败（${error || `HTTP ${status}`}）`);
      continue;
    }
    const rows =
      source.kind === 'escn-home' ? parseEscnHome(text, source) : parseInenList(text, source);
    log(`√ ${source.name}·${source.channel} 解析 ${rows.length} 条`);
    rows.forEach((row) => {
      collected.push({
        ...row,
        sourceId: source.id,
        source: source.name,
        channel: source.channel,
        order: source.order,
      });
    });
  }

  // 2) 人工检索补充源（可选）：包含分类覆盖度更好的政策/价格/出海条目，保底不空。
  const supplement = args.supplement ? await readJson(SUPPLEMENT_FILE) : null;
  if (supplement?.items?.length) {
    supplement.items.forEach((item) => {
      collected.push({
        ...item,
        sourceId: 'supplement',
        source: item.source || '行业检索',
        channel: item.channel || '检索',
        order: 9,
      });
    });
    log(`√ 检索补充分源 ${supplement.items.length} 条（${supplement.note || '人工整理'}）`);
  }

  // 3) 规范化 + 相关性过滤 + 去重
  const normalized = [];
  let filtered = 0;
  collected.forEach((raw) => {
    if (!isRelevant(`${raw.title} ${raw.summary || ''}`)) {
      filtered += 1;
      return;
    }
    const item = normalizeItem(raw, { companies });
    if (!item) return;
    normalized.push({ ...item, order: raw.order ?? 9 });
  });
  const unique = dedupeItems(normalized).sort(
    (a, b) => b.impact - a.impact || a.order - b.order,
  );
  const cutoff = recencyCutoff(args.days);
  const fresh = unique.filter((item) => !item.publishedAt || item.publishedAt >= cutoff);
  const stale = unique.length - fresh.length;
  log(
    `规范化 ${normalized.length} 条，剔除无关 ${filtered} 条，去重后 ${unique.length} 条，` +
      `早于 ${cutoff} 的 ${stale} 条已排除，保留 ${fresh.length} 条候选`,
  );

  const selected = fresh.slice(0, args.limit);

  // 4) 对重点条目回访文章页，补齐发布日期与摘要（优先补齐缺日期的条目）
  const enrichTargets = [...selected]
    .sort((a, b) => (a.publishedAt ? 1 : 0) - (b.publishedAt ? 1 : 0) || b.impact - a.impact)
    .slice(0, args.enrich);
  log(`回访 ${enrichTargets.length} 篇文章页补齐日期与摘要…`);
  const enriched = await mapLimit(enrichTargets, 5, enrichItem);
  const byUrl = new Map(enriched.map((item) => [item.url, item]));
  const finalItems = selected
    .map((item) => {
      const hit = byUrl.get(item.url);
      if (!hit) return item;
      // 摘要会参与分类与情绪判定，因此补到摘要后重新计算一次
      return { ...normalizeItem(hit, { companies }), order: item.order };
    })
    // 补齐日期后可能暴露出条目其实已过期，故再过滤一次时效，避免窗口被旧闻拉宽。
    .filter((item) => !item.publishedAt || item.publishedAt >= cutoff)
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || b.impact - a.impact);

  if (finalItems.length < MIN_VALID_ITEMS) {
    log(
      `有效条目仅 ${finalItems.length} 条（低于阈值 ${MIN_VALID_ITEMS}），为避免写入半成品已放弃本次更新。`,
    );
    if (existsSync(OUT_FILE)) log('已保留上一版 storage-weekly-sentiment.json。');
    process.exitCode = 1;
    return;
  }

  const sourceMeta = Array.from(
    new Map(SOURCES.map((source) => [source.id, { id: source.id, name: source.name, url: source.url }]))
      .values(),
  );
  if (args.supplement && supplement?.items?.length) {
    sourceMeta.push({
      id: 'supplement',
      name: supplement.name || '行业检索',
      url: supplement.url || '',
      note: supplement.note || '人工检索整理，附原文链接',
    });
  }

  const payload = {
    schemaVersion: 1,
    industry: '储能产业',
    generatedAt: new Date().toISOString(),
    note: '公开资讯源抓取 + 规则化分类/情绪判定结果，仅作行业舆情方向参考，不构成投资或授信建议。',
    rawCount: collected.length,
    sources: sourceMeta,
    items: finalItems.map(({ order, ...item }) => item),
  };

  const digest = buildSentimentDigest(payload, { companies, topLimit: 6 });
  log('—— 研判预览 ——');
  log(digest.headline);
  log(digest.lead);
  log(
    '主题：',
    digest.categories.map((row) => `${row.label} ${row.count}`).join(' · '),
  );
  log(
    '涉及链上企业：',
    digest.companies.map((row) => `${row.name}(${row.count})`).join(' · ') || '无',
  );
  log('窗口：', digest.meta.windowLabel, '| 条目：', digest.meta.itemCount);
  const dated = finalItems.filter((item) => item.publishedAt).length;
  const withSummary = finalItems.filter((item) => item.summary).length;
  log(`完整度：带发布日期 ${dated}/${finalItems.length}，带摘要 ${withSummary}/${finalItems.length}`);

  if (args.dry) {
    log('--dry 模式，未写盘。');
    return;
  }
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 1)}\n`, 'utf8');
  log(`已写入 ${path.relative(ROOT, OUT_FILE)}（${finalItems.length} 条）`);
}

main().catch((error) => {
  console.error('[sentiment] 失败：', error);
  process.exitCode = 1;
});
