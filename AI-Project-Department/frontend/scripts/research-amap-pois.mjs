import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// One-time, read-only enrichment. The browser never calls this script and the
// generated JSON is committed as the offline source consumed by prepare-company-master.
// The AMap web search page is intentionally throttled and cached so this is a
// research batch, not a runtime scraper.

const root = process.cwd();
const inputPath = path.join(root, 'public', 'data', 'companies.json');
const outputPath = path.join(root, 'docs', 'amap-poi-research.json');
const port = Number(process.env.AMAP_RESEARCH_PORT || 9333);
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const batchLimit = Number(process.env.AMAP_RESEARCH_LIMIT || 0);
const delayMs = Number(process.env.AMAP_RESEARCH_DELAY_MS || 500);
const timeoutMs = Number(process.env.AMAP_RESEARCH_TIMEOUT_MS || 12000);
const userDataDir = `/tmp/ic-industry-map-amap-${process.pid}`;
const onlyNames = new Set(String(process.env.AMAP_RESEARCH_NAMES || '').split(',').map((value) => value.trim()).filter(Boolean));

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
  const mgLat = lat + dLatDeg;
  const mgLng = lng + dLngDeg;
  return [Number((lng * 2 - mgLng).toFixed(7)), Number((lat * 2 - mgLat).toFixed(7))];
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
  return cdp;
};

const isNoise = (candidate) => {
  const text = String(candidate.name || candidate.disp_name || candidate.address || '');
  return /公交|地铁|火车站|机场|学校|医院|公园|商场|酒店|小区|社区|村委|道路|路口|桥|隧道|收费站|服务区|停车场|门$|出入口|花园$/.test(text);
};

const isCompanyPoi = (candidate) => {
  const type = String(candidate.typecode || candidate.newtype || '');
  if (isNoise(candidate)) return false;
  return /^17\d/.test(type) || /公司|集团|股份|科技|电子|半导体|芯片|研究院|研究所|材料|设备|化学|气体|微电子|电路|存储|制造/.test(String(candidate.name || candidate.disp_name || ''));
};

const candidateScore = (candidate, queryName, cityHint = '') => {
  const wanted = normalize(queryName);
  const name = normalize(candidate.name || candidate.disp_name);
  if (!wanted || !name) return -Infinity;
  let score = 0;
  if (name === wanted) score += 120;
  else if (name.startsWith(wanted)) score += 100;
  else if (name.includes(wanted)) score += 82;
  else if (wanted.includes(name)) score += 52;
  else return -Infinity;
  if (/^17\d/.test(String(candidate.typecode || candidate.newtype || ''))) score += 34;
  if (cityHint && String(candidate.cityname || '').includes(cityHint)) score += 18;
  score += Math.min(Number(candidate.review_total || 0), 20) / 10;
  if (/门$|园区|大厦|广场/.test(String(candidate.name || ''))) score -= 24;
  return score;
};

const inferRegion = (candidate, fallback = {}) => {
  const city = String(candidate.cityname || fallback.city || '').trim();
  const address = String(candidate.address || '').trim();
  const district = String(candidate.adname || '').trim() || fallback.district || '';
  const street = [...address.matchAll(/([\u4e00-\u9fa5]{2,12}(?:街道|镇|乡))/g)].at(-1)?.[1] || fallback.street || '';
  return {
    province: cityToProvince[city] || fallback.province || '',
    city,
    district,
    street,
  };
};

const queryPage = async (cdp, query, cityCode) => {
  let responseRequestId = null;
  let responsePromiseResolve;
  let responsePromiseReject;
  const responsePromise = new Promise((resolve, reject) => { responsePromiseResolve = resolve; responsePromiseReject = reject; });
  const onResponse = (params) => {
    const url = params.response?.url || '';
    let decodedUrl = url;
    try { decodedUrl = decodeURIComponent(url); } catch {}
    decodedUrl = decodedUrl.replace(/\+/g, ' ');
    // A page can emit stale poiInfo requests while navigating between searches.
    // Keep only the response belonging to this query so a previous request
    // cannot resolve the current promise with an unrelated candidate list.
    if (decodedUrl.includes('/service/poiInfo')
      && decodedUrl.includes(`keywords=${query}`)
      && String(params.response?.status) === '200') responseRequestId = params.requestId;
  };
  const onFinished = async (params) => {
    if (!responseRequestId || params.requestId !== responseRequestId) return;
    // Chrome may announce loadingFinished before the body is available to
    // getResponseBody. Retry briefly instead of treating that normal race as a
    // failed search.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await sleep(180 + attempt * 220);
        const body = await cdp.send('Network.getResponseBody', { requestId: responseRequestId });
        responsePromiseResolve(parseJson(body.body, { data: {} }));
        return;
      } catch (error) {
        if (attempt === 3) responsePromiseReject(error);
      }
    }
  };
  const removeResponse = cdp.on('Network.responseReceived', onResponse);
  const removeFinished = cdp.on('Network.loadingFinished', onFinished);
  const target = `https://www.amap.com/search?query=${encodeURIComponent(query)}&city=${encodeURIComponent(cityCode || '全国')}`;
  try {
    await cdp.send('Page.navigate', { url: target });
    const result = await Promise.race([
      responsePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('poi-timeout')), timeoutMs)),
    ]);
    return result?.data?.poi_list || [];
  } finally {
    removeResponse();
    removeFinished();
  }
};

const relationCityHints = (entity, relations, companyByName) => {
  const hints = [];
  for (const relation of relations) {
    const peer = normalize(relation.from) === normalize(entity.name) ? relation.to : relation.from;
    const peerEntity = companyByName.get(normalize(peer));
    if (peerEntity?.region?.city) hints.push(peerEntity.region.city);
  }
  if (entity.region?.city) hints.unshift(entity.region.city);
  const address = String(entity.address || '');
  const addressCity = Object.keys(cityCodes).find((city) => address.includes(city));
  if (addressCity) hints.unshift(addressCity);
  return unique(hints).slice(0, 3);
};

const buildRecord = (entity, candidate, query, cityHint) => {
  const lng = Number(candidate.longitude ?? candidate.lng ?? candidate.x);
  const lat = Number(candidate.latitude ?? candidate.lat ?? candidate.y);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const [wgsLng, wgsLat] = gcj02ToWgs84(lng, lat);
  const city = String(candidate.cityname || cityHint || entity.region?.city || '').trim();
  const address = [city, String(candidate.address || '').trim()].filter(Boolean).join('');
  return {
    name: entity.name,
    query,
    address,
    addressType: '企业兴趣点（高德网页公开 POI）',
    region: inferRegion(candidate, entity.region),
    location: {
      lng: wgsLng,
      lat: wgsLat,
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      precision: '兴趣点',
      score: 0.9,
      query,
      sourceCoordinateSystem: 'GCJ-02',
      amapPoiId: candidate.id || '',
    },
    locationStatus: '已复核',
    locationSource: '高德地图公开企业 POI；研究阶段 GCJ-02 转 WGS84',
    sourceUrl: candidate.id ? [`https://ditu.amap.com/place/${candidate.id}`] : ['https://www.amap.com/'],
    sourcePublishedAt: '',
    verifiedAt: new Date().toISOString().slice(0, 10),
    confidence: 0.9,
    candidate: {
      name: candidate.name || candidate.disp_name || '',
      dispName: candidate.disp_name || '',
      address: candidate.address || '',
      cityname: candidate.cityname || '',
      typecode: candidate.typecode || candidate.newtype || '',
      id: candidate.id || '',
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
const pending = allCompanies.filter((entity) => entity.mapDisplay !== false && !entity.location && (!onlyNames.size || onlyNames.has(cleanName(entity.name))));
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
    const queries = unique([
      ...cityHints.map((city) => `${cleanName(entity.name)} ${city}`),
      // A large portion of the source list already has a registered address
      // but no coordinates. Searching that address lets AMap resolve the
      // enterprise POI even when the brand name is abbreviated.
      String(entity.address || '').trim(),
      cleanName(entity.name),
    ]).filter((query) => query.length >= 2);
    let best = null;
    let bestScore = -Infinity;
    let lastQuery = '';
    for (const query of queries) {
      lastQuery = query;
      try {
        const poiList = await queryPage(cdp, query, cityHints[0] ? cityCodes[cityHints[0]] || cityHints[0] : '全国');
        const candidates = poiList.filter(isCompanyPoi).map((candidate) => ({ candidate, score: candidateScore(candidate, cleanName(entity.name), cityHints[0] || '') })).filter((item) => Number.isFinite(item.score));
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
        locationSource: '高德网页企业 POI 批量检索未找到可确认的企业兴趣点',
        sourceUrl: ['https://www.amap.com/'],
        verifiedAt: new Date().toISOString().slice(0, 10),
        confidence: 0,
      });
      console.log(`[${completed + 1}/${pending.length}] ${entity.name}: no precise enterprise POI`);
    }
    completed += 1;
    if (completed % 10 === 0) {
      fs.writeFileSync(outputPath, JSON.stringify({ version: new Date().toISOString(), coordinateSystem: 'WGS84/CGCS2000-compatible', source: '高德地图公开企业 POI 一次性检索（GCJ-02 转 WGS84）', records: Array.from(existingByName.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) }, null, 2));
    }
    await sleep(delayMs);
  }
} finally {
  fs.writeFileSync(outputPath, JSON.stringify({ version: new Date().toISOString(), coordinateSystem: 'WGS84/CGCS2000-compatible', source: '高德地图公开企业 POI 一次性检索（GCJ-02 转 WGS84）', records: Array.from(existingByName.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) }, null, 2));
  cdp.close();
  chrome.kill('SIGTERM');
}

console.log(JSON.stringify({ pending: pending.length, completed, accepted, outputPath }, null, 2));
