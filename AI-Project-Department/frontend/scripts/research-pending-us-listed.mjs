#!/usr/bin/env node
// 一次性研究：拉取美股全量名单（NASDAQ/NYSE/AMEX），筛选中文名（中概/华人背景）股票，
// 对 pending-listed-judgment.json 中结论为「未上市」的企业做名称模糊匹配，输出候选清单。
// 结果落盘 docs/market-lists/us-list.json 与 docs/pending-us-candidates.json，运行时不联网。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marketListDir = path.join(root, 'docs', 'market-lists');
const judgmentPath = path.join(root, 'docs', 'pending-listed-judgment.json');
const candidatesPath = path.join(root, 'docs', 'pending-us-candidates.json');

const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, referer, retries = 6) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Referer: referer } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(attempt * 5000);
    }
  }
  return null;
}

// 东财 push2delay：m:105=NASDAQ, m:106=NYSE, m:107=AMEX（push2 会被 403）。
async function fetchUsList() {
  const all = [];
  const markets = [
    { code: '105', label: 'NASDAQ' },
    { code: '106', label: 'NYSE' },
    { code: '107', label: 'AMEX' },
  ];
  for (const market of markets) {
    let page = 1;
    for (;;) {
      const url =
        `https://push2delay.eastmoney.com/api/qt/clist/get?pn=${page}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f12` +
        `&fs=m:${market.code}&fields=f12,f14`;
      const payload = await fetchJson(url, 'https://quote.eastmoney.com/');
      const rows = payload?.data?.diff || [];
      if (!rows.length) break;
      for (const row of rows) {
        all.push({ code: String(row.f12), short: row.f14, exchange: market.label });
      }
      if (rows.length < 100) break;
      page += 1;
      await sleep(300);
    }
    console.log(`${market.label}: 累计 ${all.length}`);
  }
  return all;
}

// 归一化：去括号、去常见后缀、转小写。与 research-pending-listed-markets.mjs 保持同一口径。
function normalize(value) {
  return String(value || '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/(股份有限公司|有限责任公司|有限公司|控股集团|科技集团|集团)$/g, '')
    .toLowerCase();
}

// 泛化简称黑名单：避免「智能」「科技」等吞掉所有企业。
const GENERIC_NORMS = new Set([
  '机器人', '人工智能', '智能', '科技', '信息', '数据', '生物', '医药', '医疗', '软件', '数字',
  '电气', '电子', '通信', '网络', '系统', '装备', '制造', '自动化', '控股', '集团', '国际',
  '新能源', '新材料', '环保', '云计算', '大数据', '金融', '证券', '银行', '传媒', '文化',
]);

const hasCJK = (value) => /[\u4e00-\u9fff]/.test(String(value || ''));

async function main() {
  const listPath = path.join(marketListDir, 'us-list.json');
  let usList;
  if (fs.existsSync(listPath)) {
    const cached = JSON.parse(fs.readFileSync(listPath, 'utf8'));
    if (cached.fetchedAt === today) {
      usList = cached;
      console.log(`复用当日缓存：美股 ${cached.count} 只（中文名 ${cached.chineseCount} 只）`);
    }
  }
  if (!usList) {
    const stocks = await fetchUsList();
    const chinese = stocks.filter((item) => hasCJK(item.short));
    usList = {
      source: '东方财富 push2delay（NASDAQ/NYSE/AMEX，仅保留中文名股票）',
      fetchedAt: today,
      count: stocks.length,
      chineseCount: chinese.length,
      stocks: chinese,
    };
    fs.writeFileSync(listPath, `${JSON.stringify(usList, null, 2)}\n`);
    console.log(`美股共 ${stocks.length} 只，中文名 ${chinese.length} 只，已落盘`);
  }

  const byNorm = new Map();
  for (const item of usList.stocks) {
    const key = normalize(item.short);
    if (!key || GENERIC_NORMS.has(key)) continue;
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(item);
  }

  const judgment = JSON.parse(fs.readFileSync(judgmentPath, 'utf8'));
  const candidates = [];
  for (const result of judgment.results) {
    if (result.conclusion !== '未上市') continue;
    const key = normalize(result.name);
    const hits = [];
    if (key && byNorm.has(key)) {
      for (const item of byNorm.get(key)) {
        hits.push({ market: '美股', code: item.code, short: item.short, level: 'exact' });
      }
    }
    for (const [norm, items] of byNorm) {
      if (!norm || norm === key || norm.length < 3) continue;
      if (key.startsWith(norm) || norm.startsWith(key)) {
        for (const item of items) {
          hits.push({ market: '美股', code: item.code, short: item.short, level: 'prefix' });
        }
      } else if (norm.length >= 3 && (key.includes(norm) || norm.includes(key))) {
        for (const item of items) {
          hits.push({ market: '美股', code: item.code, short: item.short, level: 'containment' });
        }
      }
    }
    const seen = new Set();
    const unique = hits.filter((hit) => {
      const id = `${hit.code}:${hit.short}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (unique.length) {
      candidates.push({ industry: result.industry, name: result.name, evidence: unique });
    }
  }

  fs.writeFileSync(
    candidatesPath,
    `${JSON.stringify(
      { generatedAt: today, unlistedChecked: judgment.results.filter((r) => r.conclusion === '未上市').length, candidateCount: candidates.length, candidates },
      null,
      2,
    )}\n`,
  );
  console.log(`未上市 ${judgment.results.filter((r) => r.conclusion === '未上市').length} 条中，美股候选 ${candidates.length} 条`);
  for (const item of candidates) {
    console.log(`  ${item.name} [${item.industry}] => ${item.evidence.map((e) => `${e.short}(${e.code},${e.level})`).join(' | ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
