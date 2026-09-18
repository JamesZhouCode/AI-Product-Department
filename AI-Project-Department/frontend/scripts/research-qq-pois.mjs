import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// One-time, read-only enrichment through the public Tencent Map web search
// page. The generated JSON is consumed by prepare-company-master; the running demo
// remains fully offline and never calls this endpoint.

const root = process.cwd();
const inputPath = path.join(root, 'public', 'data', 'companies.json');
const outputPath = path.join(root, 'docs', 'tencent-poi-research.json');
const port = Number(process.env.QQ_RESEARCH_PORT || 9666);
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const batchLimit = Number(process.env.QQ_RESEARCH_LIMIT || 0);
const delayMs = Number(process.env.QQ_RESEARCH_DELAY_MS || 900);
const timeoutMs = Number(process.env.QQ_RESEARCH_TIMEOUT_MS || 15000);
const userDataDir = `/tmp/ic-industry-map-qq-${process.pid}`;

const normalize = (value) => String(value || '')
  .replace(/[（）()\s·.。、“”‘’'"，,；;：:、_\-]/g, '')
  .replace(/^>/, '')
  .toLowerCase();
const cleanName = (value) => String(value || '').replace(/^\s*[>→-]\s*/, '').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const cityCodes = {
  北京市: '110000', 天津市: '120000', 上海市: '310000', 重庆市: '500000',
  石家庄市: '130100', 唐山市: '130200', 邯郸市: '130400', 太原市: '140100',
  沈阳市: '210100', 大连市: '210200', 长春市: '220100', 哈尔滨市: '230100',
  南京市: '320100', 无锡市: '320200', 徐州市: '320300', 常州市: '320400',
  苏州市: '320500', 南通市: '320600', 扬州市: '321000', 镇江市: '321100',
  泰州市: '321200', 杭州市: '330100', 宁波市: '330200', 温州市: '330300',
  嘉兴市: '330400', 绍兴市: '330600', 金华市: '330700', 合肥市: '340100',
  福州市: '350100', 厦门市: '350200', 南昌市: '360100', 济南市: '370100',
  青岛市: '370200', 烟台市: '370600', 郑州市: '410100', 武汉市: '420100',
  襄阳市: '420600', 长沙市: '430100', 株洲市: '430200', 广州市: '440100',
  韶关市: '440200', 深圳市: '440300', 佛山市: '440600', 东莞市: '441900',
  成都市: '510100', 昆明市: '530100', 西安市: '610100', 天水市: '620500',
  兰州市: '620100', 香港: '810000', 澳门: '820000',
};

const cityToProvince = {
  北京市: '北京市', 天津市: '天津市', 上海市: '上海市', 重庆市: '重庆市',
  石家庄市: '河北省', 唐山市: '河北省', 邯郸市: '河北省', 太原市: '山西省',
  沈阳市: '辽宁省', 大连市: '辽宁省', 长春市: '吉林省', 哈尔滨市: '黑龙江省',
  南京市: '江苏省', 无锡市: '江苏省', 徐州市: '江苏省', 常州市: '江苏省',
  苏州市: '江苏省', 南通市: '江苏省', 扬州市: '江苏省', 镇江市: '江苏省',
  泰州市: '江苏省', 杭州市: '浙江省', 宁波市: '浙江省', 温州市: '浙江省',
  嘉兴市: '浙江省', 绍兴市: '浙江省', 金华市: '浙江省', 合肥市: '安徽省',
  福州市: '福建省', 厦门市: '福建省', 南昌市: '江西省', 济南市: '山东省',
  青岛市: '山东省', 烟台市: '山东省', 郑州市: '河南省', 武汉市: '湖北省',
  襄阳市: '湖北省', 长沙市: '湖南省', 株洲市: '湖南省', 广州市: '广东省',
  韶关市: '广东省', 深圳市: '广东省', 佛山市: '广东省', 东莞市: '广东省',
  成都市: '四川省', 昆明市: '云南省', 西安市: '陕西省', 天水市: '甘肃省',
  兰州市: '甘肃省', 香港: '香港特别行政区', 澳门: '澳门特别行政区',
};

const outOfChina = (lng, lat) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
const transformLat = (x, y) => {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  ret += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  ret += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return ret;
};
const transformLng = (x, y) => {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  ret += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  ret += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return ret;
};
const gcj02ToWgs84 = (lng, lat) => {
  if (outOfChina(lng, lat)) return [lng, lat];
  const a = 6378245;
  const ee = 0.00669342162296594323;
  const dLat = transformLat(lng - 105, lat - 35);
  const dLng = transformLng(lng - 105, lat - 35);
  const radLat = lat / 180 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLatDeg = dLat * 180 / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  const dLngDeg = dLng * 180 / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return [Number((lng * 2 - (lng + dLngDeg)).toFixed(7)), Number((lat * 2 - (lat + dLatDeg)).toFixed(7))];
};

const parseJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
};

const startChrome = async () => {
  const child = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-background-networking',
    '--disable-features=Translate,OptimizationHints', '--lang=zh-CN', '--window-size=1280,900',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'ignore' });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await fetchJson(`http://127.0.0.1:${port}/json/version`); return child; } catch { await sleep(250); }
  }
  child.kill('SIGTERM');
  throw new Error(`Chrome remote debugging did not start on ${port}`);
};

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.open = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || 'CDP error'));
        else resolve(message.result);
      }
      if (message.method) {
        for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
      }
    };
  }

  async send(method, params = {}) {
    await this.open;
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
    return () => this.listeners.get(method)?.delete(listener);
  }

  close() { try { this.ws.close(); } catch {} }
}

const createPage = async () => {
  const tabs = await fetchJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const cdp = new CdpClient(tabs.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: 'https://map.qq.com/' });
  await sleep(7000);
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const result = await cdp.send('Runtime.evaluate', { expression: 'Boolean(window.AppCore && document.querySelector("#PoiForm"))', returnByValue: true });
      if (result.result?.value) return cdp;
    } catch {}
    await sleep(500);
  }
  throw new Error('Tencent Map page did not initialize');
};

const setCityAndSubmit = async (cdp, city, query) => cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const current = AppCore.get('city') || {};
    const code = ${JSON.stringify(cityCodes[city] || city || '0')};
    const name = ${JSON.stringify(city || '全国')};
    AppCore.set('city', { ...current, acode: code, cname: name, ctype: 1, level: 11 });
    const input = document.querySelector('#PoiSearch');
    const form = document.querySelector('#PoiForm');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`,
  returnByValue: true,
});

const queryPage = async (cdp, query, city) => {
  let requestId = null;
  let resolveBody;
  let rejectBody;
  const bodyPromise = new Promise((resolve, reject) => { resolveBody = resolve; rejectBody = reject; });
  const onResponse = (params) => {
    const url = params.response?.url || '';
    let decodedUrl = url;
    try { decodedUrl = decodeURIComponent(url); } catch {}
    decodedUrl = decodedUrl.replace(/\+/g, ' ');
    if (decodedUrl.includes('mmapgwpc.map.qq.com/mapsearch?qt=poi')
      && decodedUrl.includes(`wd=${query}`)
      && String(params.response?.status) === '200') requestId = params.requestId;
  };
  const onFinished = async (params) => {
    if (!requestId || params.requestId !== requestId) return;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await sleep(140 + attempt * 180);
        const body = await cdp.send('Network.getResponseBody', { requestId });
        resolveBody(parseJson(body.body, { detail: { pois: [] }, info: {} }));
        return;
      } catch (error) {
        if (attempt === 3) rejectBody(error);
      }
    }
  };
  const removeResponse = cdp.on('Network.responseReceived', onResponse);
  const removeFinished = cdp.on('Network.loadingFinished', onFinished);
  try {
    await setCityAndSubmit(cdp, city, query);
    const result = await Promise.race([
      bodyPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('poi-timeout')), timeoutMs)),
    ]);
    return result?.detail?.pois || [];
  } finally {
    removeResponse();
    removeFinished();
  }
};

const cityFromAddress = (address) => {
  const text = String(address || '');
  return Object.keys(cityCodes).find((city) => text.includes(city) || text.includes(city.replace(/市$/, ''))) || '';
};
const relationCityHints = (entity, relations, companyByName) => {
  const hints = [];
  for (const relation of relations) {
    const peer = normalize(relation.from) === normalize(entity.name) ? relation.to : relation.from;
    const peerEntity = companyByName.get(normalize(peer));
    if (peerEntity?.region?.city) hints.push(peerEntity.region.city);
    else {
      const peerCity = cityFromAddress(peerEntity?.address);
      if (peerCity) hints.push(peerCity);
    }
  }
  if (entity.region?.city) hints.unshift(entity.region.city);
  const ownCity = cityFromAddress(entity.address);
  if (ownCity) hints.unshift(ownCity);
  return unique(hints).slice(0, 3);
};

const isNoise = (candidate) => /公交|地铁|火车站|机场|学校|医院|公园|商场|酒店|小区|社区|村委|道路|路口|桥|隧道|收费站|服务区|停车场|门$|出入口|花园$/.test(`${candidate.name || ''}${candidate.addr || ''}`);
const isCompanyPoi = (candidate) => {
  if (isNoise(candidate)) return false;
  const classes = String(candidate.classes || candidate.classname || '');
  const name = String(candidate.name || '');
  return /公司企业|公司|集团|股份|科技|电子|半导体|芯片|研究院|研究所|材料|设备|化学|气体|微电子|电路|存储|制造/.test(`${classes}${name}`);
};
const candidateScore = (candidate, queryName, cityHint = '') => {
  const wanted = normalize(queryName);
  const name = normalize(candidate.name);
  if (!wanted || !name) return -Infinity;
  let score = 0;
  if (name === wanted) score += 120;
  else if (name.startsWith(wanted)) score += 105;
  else if (name.includes(wanted)) score += 86;
  else if (wanted.includes(name)) score += 52;
  else return -Infinity;
  if (/公司企业|公司|集团|股份|科技|电子|半导体|芯片|研究院|研究所|材料|设备|化学|气体|微电子|电路|存储|制造/.test(String(candidate.classes || candidate.classname || ''))) score += 34;
  if (cityHint && String(candidate.POI_PATH?.[0]?.cname || '').includes(cityHint)) score += 18;
  if (/门$|园区|大厦|广场/.test(String(candidate.name || ''))) score -= 24;
  return score;
};

const inferRegion = (candidate, fallback = {}) => {
  const pathItems = Array.isArray(candidate.POI_PATH) ? candidate.POI_PATH : [];
  const district = pathItems.find((item) => Number(item.ctype) === 3)?.cname || fallback.district || '';
  const city = pathItems.find((item) => Number(item.ctype) === 2)?.cname
    || pathItems.find((item) => Number(item.ctype) === 1)?.cname || fallback.city || '';
  return {
    province: cityToProvince[city] || fallback.province || '',
    city,
    district,
    street: fallback.street || '',
  };
};

const buildRecord = (entity, candidate, query, cityHint) => {
  const lng = Number(candidate.pointx);
  const lat = Number(candidate.pointy);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const [wgsLng, wgsLat] = gcj02ToWgs84(lng, lat);
  const city = String(candidate.POI_PATH?.find((item) => Number(item.ctype) <= 2)?.cname || cityHint || entity.region?.city || '').trim();
  const address = [city, String(candidate.addr || '').trim()].filter(Boolean).join('');
  return {
    name: entity.name,
    query,
    address,
    addressType: '企业兴趣点（腾讯地图公开 POI）',
    region: inferRegion(candidate, entity.region),
    location: {
      lng: wgsLng,
      lat: wgsLat,
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      precision: '兴趣点',
      score: 0.9,
      query,
      sourceCoordinateSystem: 'GCJ-02',
      tencentPoiId: candidate.uid || '',
    },
    locationStatus: '已复核',
    locationSource: '腾讯地图公开企业 POI；研究阶段 GCJ-02 转 WGS84',
    sourceUrl: ['https://map.qq.com/'],
    sourcePublishedAt: '',
    verifiedAt: new Date().toISOString().slice(0, 10),
    confidence: 0.9,
    candidate: {
      name: candidate.name || '',
      address: candidate.addr || '',
      classes: candidate.classes || candidate.classname || '',
      uid: candidate.uid || '',
      longitude: lng,
      latitude: lat,
    },
  };
};

const existing = fs.existsSync(outputPath) ? parseJson(fs.readFileSync(outputPath, 'utf8'), { records: [] }) : { records: [] };
const existingByName = new Map((existing.records || []).map((record) => [normalize(record.name), record]));
const data = parseJson(fs.readFileSync(inputPath, 'utf8'), { companies: [], relations: [] });
const allCompanies = data.companies || [];
const companyByName = new Map(allCompanies.map((entity) => [normalize(entity.name), entity]));
const pending = allCompanies.filter((entity) => entity.mapDisplay !== false && !entity.location);
const relationsByName = new Map();
for (const relation of data.relations || []) {
  for (const name of [relation.from, relation.to]) {
    const key = normalize(name);
    if (!relationsByName.has(key)) relationsByName.set(key, []);
    relationsByName.get(key).push(relation);
  }
}

const chrome = await startChrome();
const cdp = await createPage();
let completed = 0;
let accepted = 0;
try {
  for (const entity of pending.slice(0, batchLimit || pending.length)) {
    const key = normalize(entity.name);
    if (existingByName.has(key) && existingByName.get(key)?.location) continue;
    const cityHints = relationCityHints(entity, relationsByName.get(key) || [], companyByName);
    // Keep the batch bounded: the first hint is the entity's own city when
    // available; the unqualified retry catches enterprises whose POI is filed
    // under a neighboring district or a national result set.
    const queries = unique([
      cityHints[0] ? `${cleanName(entity.name)} ${cityHints[0]}` : '',
      cleanName(entity.name),
    ]).filter((query) => query.length >= 2);
    let best = null;
    let bestScore = -Infinity;
    let lastQuery = '';
    for (const query of queries) {
      lastQuery = query;
      try {
        const poiList = await queryPage(cdp, query, cityHints[0] || '');
        const candidates = poiList.filter(isCompanyPoi)
          .map((candidate) => ({ candidate, score: candidateScore(candidate, cleanName(entity.name), cityHints[0] || '') }))
          .filter((item) => Number.isFinite(item.score));
        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0] && candidates[0].score > bestScore) { best = candidates[0].candidate; bestScore = candidates[0].score; }
        if (bestScore >= 145) break;
      } catch (error) {
        console.warn(`${entity.name}: ${query} -> ${error.message || error}`);
      }
      await sleep(delayMs);
    }
    const record = best && bestScore >= 100 ? buildRecord(entity, best, lastQuery, cityHints[0] || '') : null;
    if (record) {
      existingByName.set(key, record);
      accepted += 1;
      console.log(`[${completed + 1}/${pending.length}] ${entity.name}: ${record.address} -> ${record.location.lng},${record.location.lat}`);
    } else {
      existingByName.set(key, {
        name: entity.name,
        query: lastQuery,
        location: null,
        locationStatus: '待复核',
        locationSource: '腾讯地图网页企业 POI 批量检索未找到可确认的企业兴趣点',
        sourceUrl: ['https://map.qq.com/'],
        verifiedAt: new Date().toISOString().slice(0, 10),
        confidence: 0,
      });
      console.log(`[${completed + 1}/${pending.length}] ${entity.name}: no precise enterprise POI`);
    }
    completed += 1;
    if (completed % 10 === 0) {
      fs.writeFileSync(outputPath, JSON.stringify({ version: new Date().toISOString(), coordinateSystem: 'WGS84/CGCS2000-compatible', source: '腾讯地图公开企业 POI 一次性检索（GCJ-02 转 WGS84）', records: Array.from(existingByName.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) }, null, 2));
    }
    await sleep(delayMs);
  }
} finally {
  fs.writeFileSync(outputPath, JSON.stringify({ version: new Date().toISOString(), coordinateSystem: 'WGS84/CGCS2000-compatible', source: '腾讯地图公开企业 POI 一次性检索（GCJ-02 转 WGS84）', records: Array.from(existingByName.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) }, null, 2));
  cdp.close();
  chrome.kill('SIGTERM');
}

console.log(JSON.stringify({ pending: pending.length, completed, accepted, outputPath }, null, 2));
