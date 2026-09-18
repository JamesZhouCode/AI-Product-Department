import fs from 'node:fs';
import path from 'node:path';

// One-time research through the official AMap Web Service API. The browser
// never calls this script; its output is committed as offline evidence and
// consumed by prepare-company-master.

const root = process.cwd();
const inputPath = path.join(root, 'public', 'data', 'companies.json');
const outputPath = path.join(root, 'docs', 'amap-geocode-research.json');
const localKeyPath = path.join(root, '.amap-key');
const readLocalKey = () => {
  if (!fs.existsSync(localKeyPath)) return '';
  const [firstLine = ''] = fs.readFileSync(localKeyPath, 'utf8').trim().split(/\r?\n/);
  return firstLine.trim();
};
const apiKey = process.env.AMAP_WEB_KEY || process.env.AMAP_KEY || readLocalKey();
const batchLimit = Number(process.env.AMAP_GEOCODE_LIMIT || 0);
const delayMs = Number(process.env.AMAP_GEOCODE_DELAY_MS || 400);
const retryNull = process.env.AMAP_GEOCODE_RETRY_NULL !== '0';
const enablePoiFallback = process.env.AMAP_GEOCODE_POI === '1';
const onlyUnresolved = process.env.AMAP_GEOCODE_ONLY_UNRESOLVED === '1';
const onlyAddressed = process.env.AMAP_GEOCODE_ONLY_ADDRESSED === '1';
const onlyNames = new Set(
  String(process.env.AMAP_GEOCODE_NAMES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’'"，,；;：:、_\-]/g, '')
    .toLowerCase();
const cleanName = (value) =>
  String(value || '')
    .replace(/^\s*[>→-]+\s*/, '')
    .trim();
const unique = (values) => Array.from(new Set(values.filter(Boolean)));
const addressQueriesFor = (address) => {
  const value = String(address || '').trim();
  if (!value) return [];
  return unique([
    value,
    value
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    value.split(/[；;]/)[0].trim(),
    value.split(/[、，,；;]/)[0].trim(),
  ]);
};

const outOfChina = (lng, lat) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;

const transformLat = (x, y) => {
  let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  result += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * (2 / 3);
  result += (20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * (2 / 3);
  result += (160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * (2 / 3);
  return result;
};

const transformLng = (x, y) => {
  let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  result += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * (2 / 3);
  result += (20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * (2 / 3);
  result += (150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x * Math.PI) / 30)) * (2 / 3);
  return result;
};

const gcj02ToWgs84 = (lng, lat) => {
  if (outOfChina(lng, lat)) return [lng, lat];
  const semiMajorAxis = 6378245;
  const eccentricity = 0.00669342162296594323;
  const radLat = (lat / 180) * Math.PI;
  const dLat = transformLat(lng - 105, lat - 35);
  const dLng = transformLng(lng - 105, lat - 35);
  let magic = Math.sin(radLat);
  magic = 1 - eccentricity * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLatDegrees =
    (dLat * 180) / (((semiMajorAxis * (1 - eccentricity)) / (magic * sqrtMagic)) * Math.PI);
  const dLngDegrees = (dLng * 180) / (semiMajorAxis / sqrtMagic) / Math.cos(radLat) / Math.PI;
  return [
    Number((lng * 2 - (lng + dLngDegrees)).toFixed(7)),
    Number((lat * 2 - (lat + dLatDegrees)).toFixed(7)),
  ];
};

const addressTokens = (value) =>
  unique(
    String(value || '')
      .match(/[\u4e00-\u9fff]{2,}|[A-Za-z0-9]+/g)
      ?.map(normalize)
      .filter((token) => token.length >= 2) || [],
  );

const addressOverlap = (left, right) => {
  const wanted = addressTokens(left);
  const actual = normalize(right);
  return wanted.filter((token) => actual.includes(token)).length;
};

const cityHint = (company) => company.region?.city || '';

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { 'User-Agent': 'ic-industry-map-research/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
};

const requestGeocode = async (address, city) => {
  const params = new URLSearchParams({ key: apiKey, address, output: 'JSON' });
  if (city) params.set('city', city);
  const payload = await fetchJson(`https://restapi.amap.com/v3/geocode/geo?${params}`);
  if (String(payload.status) !== '1') throw new Error(payload.info || 'amap-geocode-failed');
  return payload.geocodes?.[0] || null;
};

const requestPoi = async (name, city) => {
  const params = new URLSearchParams({
    key: apiKey,
    keywords: name,
    city: city || '',
    citylimit: city ? 'true' : 'false',
    offset: '20',
    page: '1',
    extensions: 'all',
    output: 'JSON',
  });
  const payload = await fetchJson(`https://restapi.amap.com/v3/place/text?${params}`);
  if (String(payload.status) !== '1') throw new Error(payload.info || 'amap-poi-failed');
  return payload.pois || [];
};

const parseLocation = (value) => {
  const [lng, lat] = String(value || '')
    .split(',')
    .map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
};

const preciseLevels = new Set(['兴趣点', '门牌号', '门址', '单元号', '楼层', '房间']);

const buildGeocodeRecord = (company, geocode) => {
  const sourceLocation = parseLocation(geocode?.location);
  if (!sourceLocation) return null;
  const level = String(geocode.level || '').trim();
  const city = cityHint(company);
  const formattedAddress = String(geocode.formatted_address || '').trim();
  const cityMatches = !city || formattedAddress.includes(city.replace(/市$/, ''));
  const overlap = addressOverlap(company.address, formattedAddress);
  const isPrecise = preciseLevels.has(level) && cityMatches && (overlap >= 2 || level === '兴趣点');
  const [lng, lat] = gcj02ToWgs84(sourceLocation.lng, sourceLocation.lat);
  const confidence = isPrecise ? (level === '兴趣点' ? 0.86 : 0.92) : 0;
  return {
    address: formattedAddress || company.address,
    addressType: `企业地址（高德地理编码：${level || '未知级别'}）`,
    region: {
      province: geocode.province || company.region?.province || '',
      city: geocode.city || company.region?.city || '',
      district: geocode.district || company.region?.district || '',
      street: geocode.township || company.region?.street || '',
    },
    location: isPrecise
      ? {
          lng,
          lat,
          coordinateSystem: 'WGS84/CGCS2000-compatible',
          precision: level === '兴趣点' ? '兴趣点' : '门址',
          score: confidence,
          query: company.address,
          sourceCoordinateSystem: 'GCJ-02',
        }
      : null,
    candidateLocation: {
      lng,
      lat,
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      precision: `候选：${level || '未知级别'}`,
      score: Math.min(0.7, overlap / 10),
      query: company.address,
      sourceCoordinateSystem: 'GCJ-02',
    },
    matchLevel: level,
    formattedAddress,
    overlap,
    locationStatus: isPrecise ? '已复核' : '待复核',
    locationSource: isPrecise
      ? '高德 Web 服务地理编码；研究阶段 GCJ-02 转 WGS84'
      : '高德 Web 服务地理编码仅得到非精准级别候选，等待复核',
    sourceUrl: ['https://restapi.amap.com/v3/geocode/geo'],
    confidence,
    candidate: {
      location: geocode.location || '',
      level,
      adcode: geocode.adcode || '',
      province: geocode.province || '',
      city: geocode.city || '',
      district: geocode.district || '',
      township: geocode.township || '',
      formattedAddress,
    },
  };
};

const buildPoiRecord = (company, pois) => {
  const wanted = normalize(cleanName(company.name));
  const city = cityHint(company);
  const candidates = pois
    .map((poi) => {
      const name = normalize(poi.name);
      const sourceLocation = parseLocation(poi.location);
      if (!name || !sourceLocation) return null;
      let score = 0;
      if (name === wanted) score += 120;
      else if (name.includes(wanted) || wanted.includes(name)) score += 80;
      else return null;
      if (city && String(poi.cityname || poi.adname || '').includes(city.replace(/市$/, '')))
        score += 20;
      score += Math.min(addressOverlap(company.address, poi.address), 5) * 5;
      if (/公司|集团|股份|科技|电子|半导体|芯片|材料|设备|研究院|制造/.test(poi.name)) score += 15;
      return { poi, sourceLocation, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best || best.score < 135) return null;
  const [lng, lat] = gcj02ToWgs84(best.sourceLocation.lng, best.sourceLocation.lat);
  return {
    address: best.poi.address || company.address,
    addressType: '企业兴趣点（高德 POI 搜索）',
    region: company.region,
    location: {
      lng,
      lat,
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      precision: '兴趣点',
      score: Math.min(0.9, best.score / 150),
      query: company.name,
      sourceCoordinateSystem: 'GCJ-02',
    },
    matchLevel: 'POI企业名称精确匹配',
    formattedAddress: best.poi.address || '',
    overlap: addressOverlap(company.address, best.poi.address),
    locationStatus: '已复核',
    locationSource: '高德 Web 服务企业 POI 搜索；研究阶段 GCJ-02 转 WGS84',
    sourceUrl: ['https://restapi.amap.com/v3/place/text'],
    confidence: Math.min(0.9, best.score / 150),
    candidate: {
      name: best.poi.name || '',
      address: best.poi.address || '',
      type: best.poi.type || '',
      typecode: best.poi.typecode || '',
      location: best.poi.location || '',
      id: best.poi.id || '',
      score: best.score,
    },
  };
};

if (!apiKey) {
  throw new Error(
    `Missing AMap Web Service key. Put it in ${localKeyPath} or set AMAP_WEB_KEY locally; do not commit it.`,
  );
}
if (!fs.existsSync(inputPath)) throw new Error(`Missing company master: ${inputPath}`);

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const existing = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : { records: [] };
const recordsByName = new Map(
  (existing.records || []).map((record) => [normalize(record.name), record]),
);
const pending = (data.companies || []).filter((company) => {
  const existingRecord = recordsByName.get(normalize(company.name));
  return (
    company.mapDisplay !== false &&
    !company.location &&
    (!onlyAddressed || Boolean(company.address)) &&
    (!onlyNames.size || onlyNames.has(cleanName(company.name))) &&
    (!onlyUnresolved || (!existingRecord?.location && !existingRecord?.candidateLocation)) &&
    (!recordsByName.has(normalize(company.name)) || retryNull)
  );
});
const work = pending.slice(0, batchLimit || pending.length);
let completed = 0;
let accepted = 0;
let candidates = 0;

const writeOutput = () => {
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        version: new Date().toISOString(),
        coordinateSystem: 'WGS84/CGCS2000-compatible',
        source: '高德 Web 服务地理编码/企业 POI 一次性研究（研究阶段 GCJ-02 转 WGS84）',
        records: Array.from(recordsByName.values()).sort((left, right) =>
          left.name.localeCompare(right.name, 'zh-CN'),
        ),
      },
      null,
      2,
    ),
  );
};

for (const company of work) {
  const key = normalize(company.name);
  const queries = [];
  addressQueriesFor(company.address).forEach((value) => queries.push({ type: 'address', value }));
  let record = null;
  try {
    for (const query of queries) {
      try {
        const geocode = await requestGeocode(query.value, cityHint(company));
        if (!geocode) continue;
        const nextRecord = buildGeocodeRecord(company, geocode);
        if (!record || nextRecord?.location) record = nextRecord;
        if (record?.location) break;
      } catch (error) {
        console.warn(`${company.name}: ${query.value} -> ${error.message || error}`);
      }
    }
    if ((!record?.location || !company.address) && enablePoiFallback) {
      const pois = await requestPoi(cleanName(company.name), cityHint(company));
      const poiRecord = buildPoiRecord(company, pois);
      if (poiRecord) record = poiRecord;
    }
  } catch (error) {
    console.warn(`${company.name}: ${error.message || error}`);
  }

  if (record) {
    recordsByName.set(key, {
      name: company.name,
      query: company.address || company.name,
      ...record,
      verifiedAt: new Date().toISOString().slice(0, 10),
    });
    if (record.location) accepted += 1;
    else candidates += 1;
  } else {
    recordsByName.set(key, {
      name: company.name,
      query: company.address || company.name,
      location: null,
      locationStatus: '待复核',
      locationSource: '高德官方接口未返回达到验收条件的结果',
      sourceUrl: ['https://restapi.amap.com/v3/geocode/geo'],
      verifiedAt: new Date().toISOString().slice(0, 10),
      confidence: 0,
    });
  }
  completed += 1;
  if (completed % 25 === 0) writeOutput();
  await sleep(delayMs);
}

writeOutput();
console.log(
  JSON.stringify({ pending: pending.length, completed, accepted, candidates, outputPath }, null, 2),
);
