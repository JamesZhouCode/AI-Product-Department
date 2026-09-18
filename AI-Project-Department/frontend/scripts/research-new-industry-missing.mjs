#!/usr/bin/env node
// 一次性：补齐三条新链缺地址/待编码企业的坐标。
// 两条路径：
//   1. 上市公司：用 docs/new-industry-listed-addresses.json 手工核对的注册/办公地址直接地理编码；
//   2. 非上市企业：放宽企业名（去法人后缀）后按企业 POI 关键字反查，有区域提示的用区域缩小范围。
// 结果合并回 docs/new-industry-geocode-research.json（覆盖原「待补地址/待编码」记录）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const industryDir = path.join(root, 'public', 'data', 'industries');
const listedAddrPath = path.join(root, 'docs', 'new-industry-listed-addresses.json');
const outputPath = path.join(root, 'docs', 'new-industry-geocode-research.json');
const localKeyPath = path.join(root, '.amap-key');

const readLocalKey = () => {
  if (!fs.existsSync(localKeyPath)) return '';
  const [firstLine = ''] = fs.readFileSync(localKeyPath, 'utf8').trim().split(/\r?\n/);
  return firstLine.trim();
};
const apiKey = process.env.AMAP_WEB_KEY || process.env.AMAP_KEY || readLocalKey();
if (!apiKey) {
  console.error('缺少高德 Web 服务 key：请配置 .amap-key 或设置 AMAP_WEB_KEY');
  process.exit(1);
}

const delayMs = Number(process.env.AMAP_DELAY_MS || 260);
const saveEvery = Number(process.env.AMAP_SAVE_EVERY || 25);
const onlyIndustry = process.env.AMAP_INDUSTRY || '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeName = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’\-—_]/g, '')
    .toLowerCase();

const outOfChina = (lng, lat) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
const transformLat = (x, y) => {
  let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  result += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  result += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  result += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return result;
};
const transformLng = (x, y) => {
  let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  result += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  result += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  result += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return result;
};
const gcj02ToWgs84 = (lng, lat) => {
  if (outOfChina(lng, lat)) return [lng, lat];
  const a = 6378245;
  const ee = 0.00669342162296594323;
  const dLat = transformLat(lng - 105, lat - 35);
  const dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLatDeg = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  const dLngDeg = (dLng * 180) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [Number((lng * 2 - (lng + dLngDeg)).toFixed(7)), Number((lat * 2 - (lat + dLatDeg)).toFixed(7))];
};
const parseLocation = (value) => {
  const [lng, lat] = String(value || '').split(',');
  const parsedLng = Number(lng);
  const parsedLat = Number(lat);
  if (!Number.isFinite(parsedLng) || !Number.isFinite(parsedLat)) return null;
  return gcj02ToWgs84(parsedLng, parsedLat);
};

const LEVEL_TO_STATUS = {
  门牌号: '候选', 门址: '候选', 单元号: '候选', 兴趣点: '候选', 道路: '候选', 乡镇: '候选',
  村庄: '区域参考', 区县: '区域参考', 城市: '区域参考', 省: '区域参考',
};
const statusForLevel = (level) => LEVEL_TO_STATUS[level] || '区域参考';

const requestJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const geocode = async (address, city = '') => {
  const params = new URLSearchParams({ address, key: apiKey, output: 'JSON' });
  if (city) params.set('city', city);
  const data = await requestJson(`https://restapi.amap.com/v3/geocode/geo?${params}`);
  if (data.status !== '1' || !data.geocodes?.length) return null;
  const [first] = data.geocodes;
  const parsed = parseLocation(first.location);
  if (!parsed) return null;
  return {
    lng: parsed[0], lat: parsed[1],
    precision: first.level || '未标注',
    status: statusForLevel(first.level),
    matchedAddress: first.formatted_address || address,
    province: first.province || '', city: first.city || '', district: first.district || '',
    method: 'geocode', query: address,
  };
};

const searchPoi = async (keyword, city = '') => {
  const params = new URLSearchParams({
    keywords: keyword, key: apiKey, offset: '5', output: 'JSON',
  });
  if (city) params.set('city', city);
  const data = await requestJson(`https://restapi.amap.com/v3/place/text?${params}`);
  if (data.status !== '1' || !data.pois?.length) return null;
  const wanted = normalizeName(keyword);
  const scored = data.pois
    .map((poi) => {
      const name = normalizeName(poi.name);
      let score = 0;
      if (name === wanted) score = 100;
      else if (name.startsWith(wanted)) score = 84;
      else if (name.includes(wanted)) score = 66;
      else if (wanted.includes(name) && name.length >= 4) score = 44;
      else return null;
      if (/^(17|06)/.test(String(poi.typecode || ''))) score += 12;
      if (/公交站|地铁站|停车场|收费站/.test(String(poi.name || ''))) score -= 40;
      return { poi, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 44) return null;
  const parsed = parseLocation(best.poi.location);
  if (!parsed) return null;
  return {
    lng: parsed[0], lat: parsed[1],
    precision: '兴趣点', status: '候选',
    address: [best.poi.cityname, best.poi.adname, best.poi.address].filter(Boolean).join(''),
    matchedAddress: best.poi.name || keyword,
    province: best.poi.pname || '', city: best.poi.cityname || '', district: best.poi.adname || '',
    method: 'poi-search', query: keyword, poiId: best.poi.id || '', confidence: best.score,
  };
};

// 去法人后缀，放宽企业名反查命中率（只用于 POI 搜索，不影响落库地址）。
const STRIP_SUFFIX = /(股份|集团|科技|技术|控股|发展|责任|合伙|有限|无限|公司|中心|研究院|实验室|厂|店|社|部)$/;
const coreName = (name) => {
  let core = String(name || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(股份有限公司|有限责任公司|集团有限公司|有限公司|股份公司|公司)/g, '')
    .trim();
  // 逐字裁剪过短或仍带后缀的情况
  while (core.length > 4 && STRIP_SUFFIX.test(core)) core = core.replace(STRIP_SUFFIX, '');
  return core.length >= 2 ? core : String(name || '');
};

const addressVariants = (address) => {
  const value = String(address || '').trim();
  if (!value) return [];
  return Array.from(
    new Set(
      [value, value.replace(/[（(][^）)]*[）)]/g, '').trim(), value.split(/[；;]/)[0].trim()]
        .filter((item) => item.length >= 6),
    ),
  );
};

const listedAddr = fs.existsSync(listedAddrPath)
  ? JSON.parse(fs.readFileSync(listedAddrPath, 'utf8'))
  : {};
const existing = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : { records: {} };
const records = existing.records || {};

const files = fs
  .readdirSync(industryDir)
  .filter((file) => file.startsWith('companies-') && file.endsWith('.json'))
  .filter((file) => !onlyIndustry || file.includes(onlyIndustry));

const targets = [];
for (const file of files) {
  const payload = JSON.parse(fs.readFileSync(path.join(industryDir, file), 'utf8'));
  for (const company of payload.companies || []) {
    // 只处理当前尚未落图的企业。
    const geo = records[normalizeName(company.name)];
    const hasLocation = geo?.lng != null && geo?.lat != null;
    if (hasLocation) continue;
    targets.push({ company, key: normalizeName(company.name) });
  }
}

console.log(`待研究企业 ${targets.length} 家（其中上市可地理编码 ${targets.filter((t) => listedAddr[t.company.name]).length} 家）`);

let done = 0;
let resolved = 0;

const save = () => {
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        coordinateSystem: 'WGS84/CGCS2000-compatible',
        source: '高德 Web 服务一次性研究：有地址走地理编码，无地址走企业 POI 关键字搜索（GCJ-02 转 WGS84）',
        note: '精度取自高德 level 字段；区县及以下只作区域参考，不用城市中心点冒充企业精准位置',
        records,
      },
      null,
      2,
    )}\n`,
  );
};

for (const { company, key } of targets) {
  const cityHint = company.region?.city || '';
  const listedAddress = listedAddr[company.name];
  let result = null;
  try {
    if (listedAddress) {
      // 上市公司地址为人工核对的权威地址，不带区域 city 提示（源表区域可能与实际注册地不一致，反而限制命中）。
      for (const variant of addressVariants(listedAddress)) {
        result = await geocode(variant, '');
        if (result && result.status === '候选') break;
        await sleep(delayMs);
      }
    }
    if (!result && company.address && normalizeName(company.address).length >= 6) {
      for (const variant of addressVariants(company.address)) {
        result = await geocode(variant, cityHint);
        if (result && result.status === '候选') break;
        await sleep(delayMs);
      }
    }
    if (!result || result.status !== '候选') {
      // 先全名反查，再放宽到核心名反查；保留上一轮 geocode 的区域参考兜底，避免被覆盖丢失。
      result = (await searchPoi(company.name, cityHint)) || result;
      if (!result || result.status !== '候选') {
        const core = coreName(company.name);
        if (core !== company.name) {
          await sleep(delayMs);
          result = (await searchPoi(core, cityHint)) || result;
        }
      }
    }
  } catch (error) {
    console.warn(`${company.name}: ${error.message || error}`);
  }

  if (result?.lng != null) {
    records[key] = {
      name: company.name,
      address: listedAddress || result.address || company.address || '',
      matchedAddress: result.matchedAddress || '',
      lng: result.lng,
      lat: result.lat,
      precision: result.precision,
      status: result.status,
      method: result.method,
      query: result.query,
      province: result.province || '',
      city: result.city || '',
      district: result.district || '',
      source: result.method === 'geocode'
        ? '高德 Web 服务地理编码'
        : '高德 Web 服务企业 POI 关键字搜索',
      evidence: result.method === 'geocode'
        ? ['https://restapi.amap.com/v3/geocode/geo']
        : ['https://restapi.amap.com/v3/place/text'],
      researchedAt: new Date().toISOString().slice(0, 10),
    };
    resolved += 1;
  } else if (!records[key]) {
    records[key] = {
      name: company.name,
      address: listedAddress || company.address || '',
      lng: null, lat: null,
      precision: '未获取',
      status: listedAddress || company.address ? '待复核' : '待补地址',
      method: 'none',
      source: '高德 Web 服务未返回可用结果',
      evidence: [],
      researchedAt: new Date().toISOString().slice(0, 10),
    };
  }

  done += 1;
  if (done % saveEvery === 0) {
    save();
    console.log(`进度 ${done}/${targets.length} · 成功 ${resolved}`);
  }
  await sleep(delayMs);
}

save();
console.log(`完成：${done} 家处理，新增坐标 ${resolved} 家`);
