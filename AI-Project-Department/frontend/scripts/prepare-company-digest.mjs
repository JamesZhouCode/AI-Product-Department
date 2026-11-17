#!/usr/bin/env node
// 链上上市企业「近况」抓取脚本。
//
// 用途：为「周报 · 重点关注企业」模块生成每家企业的最近情况索引，支撑两处展示：
//   1) 企业卡片上的「最近情况」一句话总结（无则显示「暂无」）；
//   2) 卡片右侧「近况分析」按钮的本地回落数据（实时抓取不可用时使用）。
//
// 数据来源（两路并集）：
//   ① 行业资讯语料：把储能资讯站各频道页的条目抓下来，按企业简称匹配 —— 快、稳、无风控；
//   ② 公开检索：按「企业简称 + 储能」逐家检索，补充语料未覆盖的企业 —— 节流串行、可随时关掉。
//
// 用法：
//   pnpm prepare:company                   # 逐家检索前 80 家（按关系数降序）
//   pnpm prepare:company -- --limit=237    # 全部企业
//   pnpm prepare:company -- --no-search    # 只用语料匹配，不发检索请求
//   pnpm prepare:company -- --per=4        # 每家企业保留条数（默认 5）
//   pnpm prepare:company -- --dry          # 只打印摘要不落盘
//
// 设计约定：
//   1. 规范化 / 去重 / 近况总结口径全部来自 src/features/report/sentimentModel.js，与页面共用；
//   2. 有效企业数低于阈值时保留上一版，绝不写半成品；
//   3. 每条结果都保留原文链接，页面可直接跳转核对。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCompanyDigest,
  companyAliases,
  dedupeItems,
  isRelevant,
  normalizeDate,
  normalizeItem,
  sentimentIndex,
  summarizeCompanyRecent,
} from '../src/features/report/sentimentModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHAIN_FILE = path.join(ROOT, 'public/data/industries/storage-chain.json');
const SENTIMENT_FILE = path.join(ROOT, 'public/data/industries/storage-weekly-sentiment.json');
const OUT_FILE = path.join(ROOT, 'public/data/industries/storage-company-digest.json');

const MIN_VALID_COMPANIES = 8;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const log = (...args) => console.log('[company]', ...args);

/** 语料频道：储能 / 新能源资讯站各栏目页。linkRe 用于从列表页里提取文章链接。 */
const CORPUS_CHANNELS = [
  { name: '中国储能网', url: 'https://www.escn.com.cn/', linkRe: /\/news\/show-\d+\.html/ },
  { name: '国际储能网·资讯', url: 'https://chuneng.in-en.com/news/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '国际储能网·政策', url: 'https://chuneng.in-en.com/policy/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '国际储能网·项目', url: 'https://chuneng.in-en.com/xiangmu/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '国际储能网·数据', url: 'https://chuneng.in-en.com/data/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '国际储能网·财经', url: 'https://chuneng.in-en.com/cjdr/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '国际储能网·压缩空气', url: 'https://chuneng.in-en.com/caes/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '国际储能网·电化学', url: 'https://chuneng.in-en.com/ees/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '国际储能网·飞轮', url: 'https://chuneng.in-en.com/flyes/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '国际储能网·抽蓄', url: 'https://chuneng.in-en.com/csxn/', linkRe: /chunengy-\d+\.shtml/ },
  { name: '新能源网·资讯', url: 'https://newenergy.in-en.com/news/', linkRe: /newenergy-\d+\.shtml/ },
  { name: '新能源网·政策', url: 'https://newenergy.in-en.com/policy/', linkRe: /newenergy-\d+\.shtml/ },
];

/** 结果质量黑名单：企业名片页 / 词典页 / 论坛视频等，不是「近况」。 */
const HOST_BLOCKLIST = [
  'baike.baidu.com',
  'baidu.com',
  'zdic.net',
  'hanyuguoxue.com',
  'qcc.com',
  'aiqicha.baidu.com',
  'tianyancha.com',
  'bilibili.com',
  'douban.com',
  'zhihu.com',
  'hibor.com.cn',
  'doc88.com',
  'docin.com',
  'book118.com',
  'xiaohongshu.com',
  'jd.com',
  'tmall.com',
];

const TITLE_BLOCKLIST =
  /官网|百度百科|爱企查|企查查|天眼查|快懂百科|汉语|字典|笔顺|部首|拼音|招聘|行情中心|股票行情|公司简介|企业介绍|工商信息|基本信息/;

function parseArgs(argv) {
  const args = { limit: 80, per: 5, days: 60, dry: false, search: true, searchDelay: 1600 };
  argv.forEach((item) => {
    if (item === '--dry') args.dry = true;
    else if (item === '--no-search') args.search = false;
    else if (item.startsWith('--limit=')) args.limit = Number(item.slice(8)) || Infinity;
    else if (item.startsWith('--per=')) args.per = Number(item.slice(6)) || args.per;
    else if (item.startsWith('--days=')) args.days = Number(item.slice(7)) || args.days;
    else if (item.startsWith('--delay=')) args.searchDelay = Number(item.slice(8)) || args.searchDelay;
  });
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchText(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' },
    });
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

const stripTags = (value) =>
  decodeEntities(String(value ?? '').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

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

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '公开资讯';
  }
}

// ------------------------------------------------------------------ 语料抓取

/** 通用列表页解析：按频道给定的链接正则抓锚文本标题与邻近日期。 */
function parseList(html, source) {
  const rows = [];
  const seen = new Set();
  const re = new RegExp(
    `<a\\b[^>]*href=["']([^"']*${source.linkRe.source})["'][^>]*>([\\s\\S]*?)<\\/a>`,
    'gi',
  );
  let match;
  while ((match = re.exec(html))) {
    const url = absoluteUrl(match[1], source.url);
    const title = stripTags(match[2]);
    if (!url || title.length < 8 || seen.has(url)) continue;
    seen.add(url);
    const end = match.index + match[0].length;
    rows.push({
      title,
      url,
      publishedAt:
        findDateNear(html, end, end + 600) || findDateNear(html, match.index - 400, match.index),
    });
  }
  return rows;
}

async function crawlCorpus() {
  const rows = [];
  for (const channel of CORPUS_CHANNELS) {
    const { ok, status, text, error } = await fetchText(channel.url);
    if (!ok) {
      log(`× 语料 ${channel.name} 抓取失败（${error || `HTTP ${status}`}）`);
      continue;
    }
    const parsed = parseList(text, channel);
    parsed.forEach((row) =>
      rows.push({
        ...row,
        source: channel.name,
        sourceId: 'corpus',
        channel: channel.name,
      }),
    );
  }
  log(`√ 语料抓取 ${rows.length} 条（${CORPUS_CHANNELS.length} 个频道）`);
  return rows;
}

// ------------------------------------------------------------------ 检索

function parseBaiduResults(html) {
  const rows = [];
  String(html || '')
    .split(/<div class="result/)
    .slice(1)
    .forEach((block) => {
      const head = block.slice(0, 4000);
      const link = head.match(/<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!link) return;
      const mu = head.match(/mu="([^"]+)"/);
      const url = decodeEntities(mu ? mu[1] : link[1]);
      const title = stripTags(link[2]);
      if (!url || title.length < 6) return;
      const snippet = head.match(/<span class="content-right[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      rows.push({ title, url, snippet: snippet ? stripTags(snippet[1]) : '' });
    });
  return rows;
}

async function searchCompany(name) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(`${name} 储能`)}&rn=20`;
  const { ok, status, text, error } = await fetchText(url, 12000);
  if (!ok) return { ok: false, reason: error || `HTTP ${status}`, rows: [] };
  // 被风控时会返回一个极短的跳转/验证页，此时停止后续检索，避免无效请求。
  if (text.length < 20000) return { ok: false, reason: '检索被限流', rows: [] };
  return { ok: true, rows: parseBaiduResults(text) };
}

const DATE_IN_TEXT = /(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/;

function dateFromSnippet(snippet) {
  const text = String(snippet || '');
  const absolute = text.match(DATE_IN_TEXT);
  if (absolute) return normalizeDate(absolute[0]);
  const days = text.match(/(\d+)\s*天之前/);
  if (days) return dateOffset(Number(days[1]));
  if (/小时之前|分钟之前|刚刚|今天/.test(text)) return dateOffset(0);
  if (/昨天/.test(text)) return dateOffset(1);
  return '';
}

function dateFromUrl(url) {
  const value = String(url || '');
  const separated = value.match(/\/(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})[/_]/);
  if (separated) return normalizeDate(separated[0]);
  const compact = value.match(/\/(20\d{2})(\d{2})(\d{2})[/_]/);
  if (compact) return normalizeDate(compact[0]);
  return '';
}

function dateOffset(days) {
  const date = new Date(Date.now() - days * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ 主流程

function toItem(raw, aliases) {
  if (!raw?.title || !raw.url) return null;
  if (!aliases.some((alias) => raw.title.includes(alias))) return null;
  if (TITLE_BLOCKLIST.test(raw.title)) return null;
  if (HOST_BLOCKLIST.some((host) => hostOf(raw.url).endsWith(host))) return null;
  if (!isRelevant(`${raw.title} ${raw.snippet || ''}`)) return null;
  return normalizeItem(
    {
      title: raw.title,
      summary: raw.snippet || '',
      url: raw.url,
      source: raw.source || hostOf(raw.url),
      sourceId: raw.sourceId || 'web',
      channel: raw.channel || '检索',
      publishedAt: raw.publishedAt || dateFromSnippet(raw.snippet) || dateFromUrl(raw.url),
    },
    { companies: [] },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chain = await readJson(CHAIN_FILE);
  const companies = Array.isArray(chain?.companies) ? chain.companies : [];
  if (!companies.length) {
    log('未找到 storage-chain.json 的企业清单，终止。');
    process.exitCode = 1;
    return;
  }

  const sentiment = await readJson(SENTIMENT_FILE);
  const sentimentItems = Array.isArray(sentiment?.items) ? sentiment.items : [];

  // 1) 语料：频道页抓取 + 已抓舆情快照
  const corpusRows = await crawlCorpus();
  const corpusItems = [];
  corpusRows.forEach((raw) => {
    const item = toItem(raw, ['']); // 只做规范化，不做企业过滤（[''] 使别名判定恒真）
    if (item) corpusItems.push({ ...item, source: raw.source });
  });
  log(`语料规范化后 ${corpusItems.length} 条，并入舆情快照 ${sentimentItems.length} 条`);

  const allCorpus = dedupeItems([...corpusItems, ...sentimentItems]).filter(
    (item) => !item.publishedAt || item.publishedAt >= dateOffset(args.days),
  );
  log(`合并去重后语料池 ${allCorpus.length} 条（近 ${args.days} 天）`);

  // 2) 逐企业匹配语料
  const targets = [...companies].sort(
    (a, b) =>
      (b.relationCount || 0) - (a.relationCount || 0) ||
      String(a.name).localeCompare(String(b.name), 'zh-CN'),
  );
  const picked = Number.isFinite(args.limit) ? targets.slice(0, args.limit) : targets;

  const itemsByCompany = {};
  const aliasesByCompany = new Map();
  let corpusHits = 0;
  picked.forEach((company) => {
    const aliases = companyAliases(company);
    if (!aliases.length) return;
    aliasesByCompany.set(company.name, aliases);
    const rows = allCorpus.filter((item) =>
      aliases.some((alias) => `${item.title} ${item.summary || ''}`.includes(alias)),
    );
    if (rows.length) {
      itemsByCompany[company.name] = [...rows];
      corpusHits += 1;
    }
  });
  log(`语料命中 ${corpusHits} 家企业`);

  // 3) 检索补充：只对语料未命中的企业发起，串行 + 节流
  let searchOk = 0;
  let searchFail = 0;
  let blocked = false;
  if (args.search) {
    const pending = picked.filter((company) => !itemsByCompany[company.name]);
    log(`检索补充 ${pending.length} 家（节流 ${args.searchDelay}ms）…`);
    for (let index = 0; index < pending.length; index += 1) {
      if (blocked) break;
      const company = pending[index];
      const aliases = aliasesByCompany.get(company.name) || companyAliases(company);
      const result = await searchCompany(company.name);
      if (!result.ok) {
        searchFail += 1;
        if (searchFail <= 3) log(`× ${company.name} 检索失败（${result.reason}）`);
        if (result.reason === '检索被限流') {
          blocked = true;
          log('检索被限流，停止后续检索，已抓到的结果照常使用。');
        }
      } else {
        searchOk += 1;
        const rows = result.rows.map((raw) => toItem(raw, aliases)).filter(Boolean);
        if (rows.length) itemsByCompany[company.name] = rows;
      }
      if ((index + 1) % 20 === 0) {
        log(`…检索 ${index + 1}/${pending.length}，当前命中 ${Object.keys(itemsByCompany).length} 家`);
      }
      await sleep(args.searchDelay);
    }
    log(`检索完成：成功 ${searchOk} 家、失败 ${searchFail} 家`);
  }

  // 4) 截断 + 聚合
  const finalMap = {};
  Object.entries(itemsByCompany).forEach(([name, rows]) => {
    const merged = dedupeItems(rows)
      .sort(
        (a, b) =>
          (b.impact || 0) - (a.impact || 0) ||
          String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')),
      )
      .slice(0, args.per);
    if (merged.length) finalMap[name] = merged;
  });

  const names = Object.keys(finalMap);
  log(`最终命中 ${names.length} 家企业近况`);

  if (names.length < MIN_VALID_COMPANIES) {
    log(`有效企业仅 ${names.length} 家（低于阈值 ${MIN_VALID_COMPANIES}），为避免写入半成品已放弃本次更新。`);
    if (existsSync(OUT_FILE)) log('已保留上一版 storage-company-digest.json。');
    process.exitCode = 1;
    return;
  }

  const digest = buildCompanyDigest(names, finalMap, { limit: args.per });
  const payload = {
    schemaVersion: 1,
    industry: '储能产业',
    source: '储能资讯站语料 + 公开检索（构建期）',
    generatedAt: new Date().toISOString(),
    note: '企业近况由公开资讯整理，仅作走访前的快速背景参考，不构成投资或授信建议；每条均保留原文链接。',
    count: names.length,
    companies: digest,
  };

  log('—— 近况样例 ——');
  names.slice(0, 3).forEach((name) => {
    const row = digest[name];
    const counts = { positive: 0, neutral: 0, negative: 0 };
    row.items.forEach((item) => {
      if (counts[item.sentiment] != null) counts[item.sentiment] += 1;
    });
    log(`${name}｜${row.count} 条｜指数 ${sentimentIndex(counts)}｜${summarizeCompanyRecent(name, row.items)}`);
  });

  if (args.dry) {
    log('--dry 模式，未写盘。');
    return;
  }
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 1)}\n`, 'utf8');
  log(`已写入 ${path.relative(ROOT, OUT_FILE)}（${names.length} 家企业）`);
}

main().catch((error) => {
  console.error('[company] 失败：', error);
  process.exitCode = 1;
});
