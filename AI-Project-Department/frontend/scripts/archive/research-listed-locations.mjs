import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import XLSX from 'xlsx';

const root = process.cwd();
const input = path.join(root, '..', '可参考内容', '集成电路企业完整调研表_含细分行业.xlsx');
const outputPath = path.join(root, 'docs', 'listed-location-candidates.json');
const tempDir = '/tmp/ic-industry-map-reports';
fs.mkdirSync(tempDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => String(value || '').replace(/[（）()\s·.。、“”‘’]/g, '').toLowerCase();
const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IC-industry-map-research/1.0)',
      Referer: 'https://www.cninfo.com.cn/',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${url}`);
  return response.json();
};

const aliasMap = {
  韦尔股份: '豪威集团',
  北京君正: '君正股份',
  华虹公司: '华虹宏力',
  华虹半导体: '华虹宏力',
  闻泰科技: '*ST闻泰',
  紫光国芯: '紫光国微',
};

const rows = XLSX.utils.sheet_to_json(
  XLSX.readFile(input).Sheets[XLSX.readFile(input).SheetNames[0]],
  { defval: '' },
);
const keyCompanyNames = rows.map((row) => String(row['企业'] || '').trim()).filter(Boolean);
const stocks = (await fetchJson('https://www.cninfo.com.cn/new/data/szse_stock.json')).stockList || [];
const byName = new Map(stocks.map((stock) => [stock.zwjc, stock]));
const candidates = [];

const getStock = (name) => byName.get(name) || byName.get(aliasMap[name]);
const getQueryMeta = (code) => {
  if (String(code).startsWith('6')) return { column: 'sse', plate: 'sh' };
  if (String(code).startsWith('0') || String(code).startsWith('3')) return { column: 'szse', plate: 'sz' };
  return { column: 'bj', plate: 'bj' };
};

const reportLines = (text) => text.replace(/\r/g, '').split('\n');
const labels = [
  ['公司办公地址', 40],
  ['办公地址', 30],
  ['联系地址', 20],
  ['公司注册地址', 12],
  ['注册地址', 10],
  ['公司住所', 8],
];
const stopWords = /(邮政编码|公司网址|电子信箱|电话|传真|法定代表人|公司中文|外文名称|注册地址的历史|姓名|办公地址的邮政|联系人|证券事务|董事会秘书)/;

const cleanAddress = (value) => String(value || '')
  .replace(/[\u0000-\u001f]/g, ' ')
  .replace(/\s+/g, '')
  .replace(/[：:]+/g, '')
  .replace(/^地址一/, '')
  .replace(/地址二.*$/, '')
  .replace(/[。；;]+$/g, '')
  .trim();

const dedupeRepeatedAddress = (value) => {
  const text = cleanAddress(value);
  if (text.length % 2 === 0 && text.slice(0, text.length / 2) === text.slice(text.length / 2)) {
    return text.slice(0, text.length / 2);
  }
  return text;
};

const extractAddress = (text) => {
  const lines = reportLines(text);
  const hits = [];
  for (let index = 0; index < Math.min(lines.length, 1400); index += 1) {
    const line = lines[index];
    if (stopWords.test(line)) continue;
    for (const [label, weight] of labels) {
      const position = line.indexOf(label);
      if (position < 0) continue;
      let value = line.slice(position + label.length);
      const parts = [value];
      // Annual reports often place the address on the line immediately before
      // the label (the label is rendered in a separate table column).
      if (cleanAddress(value).length < 10) {
        for (let offset = 1; offset <= 2; offset += 1) {
          const previous = lines[index - offset] || '';
          if (!previous.trim() || labels.some(([other]) => previous.includes(other)) || stopWords.test(previous)) break;
          parts.unshift(previous);
        }
      }
      for (let offset = 1; offset <= 3; offset += 1) {
        const next = lines[index + offset] || '';
        if (!next.trim() || stopWords.test(next)) break;
        if (labels.some(([other]) => next.includes(other))) break;
        parts.push(next);
      }
      const address = dedupeRepeatedAddress(parts.join(' '));
      if (!address || address.length < 6) continue;
      if (/^(的历史变更情况|的邮政编码|邮政编码|的历史)/.test(address)) continue;
      hits.push({ label, weight, address, line: index + 1 });
    }
  }
  hits.sort((a, b) => b.weight - a.weight || a.line - b.line);
  return hits[0] || null;
};

const reportFor = async (stock) => {
  const meta = getQueryMeta(stock.code);
  const query = new URLSearchParams({
    stock: `${stock.code},${stock.orgId}`,
    tabName: 'fulltext',
    pageSize: '30',
    pageNum: '1',
    column: meta.column,
    category: 'category_ndbg_szsh;',
    plate: meta.plate,
    seDate: '2025-01-01~2025-12-31',
    searchkey: '',
    secid: '',
    sortName: '',
    sortType: '',
    isHLtitle: 'true',
  });
  const findReports = async (seDate) => fetchJson('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ ...Object.fromEntries(query.entries()), seDate }),
  });
  let result = await findReports('2025-01-01~2025-12-31');
  let reports = (result.announcements || [])
    .filter((item) => item.adjunctType === 'PDF' && /年度报告$/.test(item.announcementTitle || ''))
    .sort((a, b) => Number(b.announcementTime || 0) - Number(a.announcementTime || 0));
  if (!reports.length) {
    result = await findReports('2026-01-01~2026-08-17');
    reports = (result.announcements || [])
      .filter((item) => item.adjunctType === 'PDF' && /年度报告$/.test(item.announcementTitle || ''))
      .sort((a, b) => Number(b.announcementTime || 0) - Number(a.announcementTime || 0));
  }
  if (!reports.length) return { error: 'annual-report-not-found' };
  const report = reports[0];
  const pdfPath = path.join(tempDir, `${stock.code}-${report.announcementId}.pdf`);
  const textPath = `${pdfPath}.txt`;
  if (!fs.existsSync(pdfPath)) {
    const response = await fetch(`https://static.cninfo.com.cn/${report.adjunctUrl}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`PDF ${response.status} ${stock.zwjc}`);
    fs.writeFileSync(pdfPath, Buffer.from(await response.arrayBuffer()));
  }
  if (!fs.existsSync(textPath)) {
    const resultText = spawnSync('/opt/homebrew/bin/pdftotext', ['-layout', pdfPath, textPath], { encoding: 'utf8' });
    if (resultText.status !== 0) throw new Error(`pdftotext failed for ${stock.zwjc}: ${resultText.stderr}`);
  }
  const text = fs.readFileSync(textPath, 'utf8');
  return {
    reportTitle: report.announcementTitle,
    reportUrl: `https://static.cninfo.com.cn/${report.adjunctUrl}`,
    announcementTime: new Date(Number(report.announcementTime || 0)).toISOString().slice(0, 10),
    extracted: extractAddress(text),
  };
};

for (const [index, name] of keyCompanyNames.entries()) {
  const stock = getStock(name);
  if (!stock) {
    candidates.push({ name, status: 'not-listed-in-cninfo', source: 'CNINFO stock list' });
    continue;
  }
  try {
    const report = await reportFor(stock);
    candidates.push({
      name,
      stockName: stock.zwjc,
      code: stock.code,
      orgId: stock.orgId,
      alias: aliasMap[name] || '',
      ...report,
    });
    console.log(`[${index + 1}/${keyCompanyNames.length}] ${name}: ${report.extracted?.address || report.error || 'no-address'}`);
  } catch (error) {
    candidates.push({ name, stockName: stock.zwjc, code: stock.code, orgId: stock.orgId, error: String(error.message || error) });
    console.error(`[${index + 1}/${keyCompanyNames.length}] ${name}: ${error.message || error}`);
  }
  await sleep(180);
}

fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: 'CNINFO 2024 annual reports', candidates }, null, 2));
console.log(`Wrote ${candidates.length} candidates to ${outputPath}`);
