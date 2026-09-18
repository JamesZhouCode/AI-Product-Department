#!/usr/bin/env node
// 一次性研究脚本：研判 new-industry-listed-pending.json 中含「股份」但未匹配 A 股的企业。
// 拉取三个市场的公开名单并做分层名称匹配，输出 docs/pending-listed-judgment.json。
// 数据源（结果落盘，运行时不得调用）：
//   - 新三板+北交所列表：东方财富 push2delay clist fs=m:0+t:81（代码+简称）
//   - 港股列表：新浪财经 Market_Center.getHKStockData（中文简称）
//   - A 股：复用 docs/a-share-list.json（新浪，5554 只，含北交所）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pending = readJson(path.join(root, 'docs', 'new-industry-listed-pending.json'));
const aShare = readJson(path.join(root, 'docs', 'a-share-list.json')).stocks;

async function fetchJson(url, referer, retries = 6) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      if (attempt === retries) throw new Error(`${err.message} ${url.slice(0, 80)}`);
      const wait = attempt * 5000;
      console.error(`  重试 ${attempt}/${retries - 1}，等待 ${wait}ms：${err.message}`);
      await sleep(wait);
    }
  }
  throw new Error('unreachable');
}

// ---------- 新三板 + 北交所（代码+简称） ----------
async function fetchNeeq() {
  const pageSize = 100;
  const rows = [];
  let total = Infinity;
  for (let page = 1; page <= 200 && rows.length < total; page += 1) {
    const data = await fetchJson(
      `https://push2delay.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f12&fs=m:0+t:81&fields=f12,f14`,
      'https://quote.eastmoney.com/',
    );
    const payload = data?.data;
    if (!payload) break;
    total = payload.total ?? 0;
    for (const item of payload.diff ?? []) {
      rows.push({ code: item.f12, short: item.f14, full: '', listingDate: '' });
    }
    if (!payload.diff || payload.diff.length < pageSize) break;
    await sleep(500);
  }
  return rows;
}

// ---------- 港股 ----------
async function fetchHongKong() {
  const pageSize = 60; // 新浪单页上限 60
  const rows = [];
  for (let page = 1; page <= 120; page += 1) {
    const data = await fetchJson(
      `http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHKStockData?page=${page}&num=${pageSize}&sort=symbol&asc=1&node=qbgg_hk`,
    );
    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data.map((r) => ({ code: r.symbol, short: r.name ?? '', engname: r.engname ?? '' })));
    if (data.length < pageSize) break;
    await sleep(200);
  }
  return rows;
}

// ---------- 名称归一化 ----------
const SUFFIXES = /(股份有限公司|有限责任|有限公司|股份公司|集团公司|控股集团|科技集团|集团|公司)/g;
const normalize = (s) =>
  String(s ?? '')
    .replace(/[（(][^（()）]*[)）]/g, '')
    .replace(/[（）()\s·.。、“”‘’\-—_]/g, '')
    .replace(SUFFIXES, '')
    .toLowerCase();

// ---------- 分层匹配 ----------
function buildIndex(list, keyFields) {
  // keyFields: { normKey: 'short'|'full' }
  const byNorm = new Map();
  for (const item of list) {
    for (const field of ['full', 'short']) {
      if (!keyFields.includes(field) || !item[field]) continue;
      const k = normalize(item[field]);
      if (k.length < 2) continue;
      if (!byNorm.has(k)) byNorm.set(k, []);
      byNorm.get(k).push(item);
    }
  }
  return byNorm;
}

// 通用词黑名单：归一化后等于这些词的股票简称（如 A 股「机器人」300024）
// 在模糊匹配（前缀/包含）中直接跳过，否则会吞掉所有含该词的企业。
const GENERIC_NORMS = new Set([
  '机器人', '人工智能', '智能', '科技', '信息', '数据', '生物', '医药', '医疗', '软件',
  '数字', '电气', '电子', '通信', '网络', '系统', '装备', '制造', '自动化', '控股',
  '集团', '国际', '新能源', '新材料', '环保', '云计算', '大数据', '能源科技', '联网科技',
  '纵横科技', '中大科技', '精密科技', '平方科技', '金融', '证券', '银行', '传媒', '文化',
]);

function findCandidates(byNorm, name, { prefix = false, containment = false }) {
  const n = normalize(name);
  if (!n) return [];
  const hits = new Map();
  const add = (item) => {
    if (!hits.has(item.code)) hits.set(item.code, item);
  };
  for (const [k, items] of byNorm) {
    if (k === n) {
      items.forEach(add);
    } else if (GENERIC_NORMS.has(k)) {
      continue; // 通用简称不做模糊匹配
    } else if (prefix && k.length >= 3 && (n.startsWith(k) || k.startsWith(n))) {
      items.forEach(add);
    } else if (containment && k.length >= 3 && (n.includes(k) || k.includes(n))) {
      items.forEach(add);
    }
  }
  return [...hits.values()];
}

async function main() {
  console.log(`待研判企业：${pending.length} 家`);
  fs.mkdirSync(path.join(root, 'docs', 'market-lists'), { recursive: true });
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const loadCached = (file) => {
    const p = path.join(root, 'docs', 'market-lists', file);
    if (!fs.existsSync(p)) return null;
    const cached = JSON.parse(fs.readFileSync(p, 'utf8'));
    return cached.fetchedAt === fetchedAt && Array.isArray(cached.stocks) ? cached.stocks : null;
  };
  const neeq = loadCached('neeq-list.json') ?? (await fetchNeeq());
  console.log(`新三板名单：${neeq.length} 家`);
  const hk = loadCached('hk-list.json') ?? (await fetchHongKong());
  console.log(`港股名单：${hk.length} 家`);

  fs.writeFileSync(
    path.join(root, 'docs', 'market-lists', 'neeq-list.json'),
    JSON.stringify({ source: '东方财富 push2delay clist fs=m:0+t:81 新三板+北交所(一次性研究)', fetchedAt, count: neeq.length, stocks: neeq }, null, 1),
  );
  fs.writeFileSync(
    path.join(root, 'docs', 'market-lists', 'hk-list.json'),
    JSON.stringify({ source: '新浪财经港股列表(一次性研究)', fetchedAt, count: hk.length, stocks: hk }, null, 1),
  );

  const aList = aShare.map((s) => ({ code: s.code, short: s.name, full: '', market: 'A股' }));
  const neeqList = neeq.map((s) => ({ ...s, market: '新三板' }));
  const hkList = hk.map((s) => ({ ...s, market: '港股' }));

  const idxA = buildIndex(aList, ['short']);
  const idxNeeqShort = buildIndex(neeqList, ['short']);
  const idxHk = buildIndex(hkList, ['short']);

  const results = [];
  for (const p of pending) {
    const out = { industry: p.industry, name: p.name, conclusion: '未上市', evidence: [] };

    // A 股：全名归一 + 前缀（简称是全名前缀）
    let cands = findCandidates(idxA, p.name, { prefix: true });
    // A 股：包含（简称是全名子串，如 精达股份 ⊂ 铜陵精达特种电磁线）
    if (cands.length === 0) cands = findCandidates(idxA, p.name, { containment: true });
    if (cands.length === 1) {
      const c = cands[0];
      out.conclusion = 'A股';
      out.evidence.push({ market: 'A股', code: c.code, short: c.short, level: 'norm' });
    } else if (cands.length > 1) {
      out.conclusion = '待人工复核';
      out.evidence.push({ market: 'A股', level: 'ambiguous', candidates: cands.map((c) => `${c.short}(${c.code})`) });
    }

    // 新三板/北交所：简称归一/前缀/包含（弱证据，一律标记复核；92 开头为北交所）
    cands = findCandidates(idxNeeqShort, p.name, { prefix: true, containment: true });
    if (cands.length === 1) {
      const c = cands[0];
      const market = c.code.startsWith('92') ? '北交所' : '新三板';
      out.conclusion = '待人工复核';
      out.evidence.push({ market, code: c.code, short: c.short, level: 'shortname-fuzzy' });
    } else if (cands.length > 1) {
      out.conclusion = '待人工复核';
      out.evidence.push({ market: '新三板', level: 'ambiguous-shortname', candidates: cands.slice(0, 5).map((c) => `${c.short}(${c.code})`) });
    }

    // 港股：简称归一/前缀/包含（弱证据，一律标记复核）
    cands = findCandidates(idxHk, p.name, { prefix: true, containment: true });
    if (cands.length === 1) {
      const c = cands[0];
      out.conclusion = '待人工复核';
      out.evidence.push({ market: '港股', code: c.code, short: c.short, level: 'shortname-fuzzy' });
    } else if (cands.length > 1) {
      out.conclusion = '待人工复核';
      out.evidence.push({ market: '港股', level: 'ambiguous-shortname', candidates: cands.slice(0, 5).map((c) => `${c.short}(${c.code})`) });
    }

    results.push(out);
  }

  const summary = {};
  for (const r of results) summary[r.conclusion] = (summary[r.conclusion] ?? 0) + 1;
  console.log('分类统计:', summary);

  fs.writeFileSync(
    path.join(root, 'docs', 'pending-listed-judgment.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        pendingCount: pending.length,
        sources: {
          aShare: 'docs/a-share-list.json (新浪财经, 5554 只, 含北交所)',
          neeq: `东方财富 push2delay clist fs=m:0+t:81 (新三板+北交所 ${neeq.length} 只, 简称)`,
          hongKong: `新浪财经 getHKStockData node=qbgg_hk (${hk.length} 只)`,
        },
        summary,
        results,
      },
      null,
      1,
    ),
  );
  console.log('已输出 docs/pending-listed-judgment.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
