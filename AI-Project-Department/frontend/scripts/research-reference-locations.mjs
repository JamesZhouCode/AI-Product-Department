import fs from 'node:fs';
import path from 'node:path';

// One-time import from the Shenzhen branch reference page. The reference page
// embeds GCJ-02-like coordinates without declaring a coordinate system. We
// only accept rows whose normalized company name and registered address both
// match the current master table, then convert the coordinates before they
// enter the offline dataset.

const root = process.cwd();
const inputPath = path.join(root, 'public', 'data', 'companies.json');
const referencePath = path.join(root, '..', '可参考内容', 'AI营销地图-交行深圳分行', 'index.html');
const outputPath = path.join(root, 'docs', 'reference-location-research.json');

const normalize = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’'"，,；;：:、_\-]/g, '')
    .toLowerCase();

const cleanAddress = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const parseEmbeddedObject = (html, marker) => {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Reference marker not found: ${marker}`);
  let index = markerIndex + marker.length;
  while (/\s/.test(html[index] || '')) index += 1;
  if (html[index] !== '{') throw new Error('Reference payload is not an object');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(markerIndex + marker.length, index + 1));
    }
  }
  throw new Error('Reference payload is incomplete');
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

if (!fs.existsSync(inputPath)) throw new Error(`Missing company master: ${inputPath}`);
if (!fs.existsSync(referencePath)) throw new Error(`Missing reference page: ${referencePath}`);

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const reference = parseEmbeddedObject(fs.readFileSync(referencePath, 'utf8'), 'const en=');
const companies = data.companies || [];
const referenceRows = reference.enterprises || [];
const referenceByName = new Map(referenceRows.map((row) => [normalize(row.name), row]));
const records = [];
const skipped = {
  alreadyLocated: 0,
  nameNotFound: 0,
  addressMismatch: 0,
  invalidCoordinate: 0,
};

for (const company of companies) {
  if (company.location) {
    skipped.alreadyLocated += 1;
    continue;
  }
  const referenceRow = referenceByName.get(normalize(company.name));
  if (!referenceRow) {
    skipped.nameNotFound += 1;
    continue;
  }
  if (cleanAddress(company.address) !== cleanAddress(referenceRow.address)) {
    skipped.addressMismatch += 1;
    continue;
  }
  const sourceLng = Number(referenceRow.lng);
  const sourceLat = Number(referenceRow.lat);
  if (!(sourceLng > 70 && sourceLng < 140 && sourceLat > 0 && sourceLat < 60)) {
    skipped.invalidCoordinate += 1;
    continue;
  }
  const [lng, lat] = gcj02ToWgs84(sourceLng, sourceLat);
  records.push({
    name: company.name,
    query: company.address,
    address: company.address,
    addressType: '注册地址（深圳分行参考资料精确匹配）',
    region: company.region,
    location: {
      lng,
      lat,
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      precision: '兴趣点',
      score: 0.88,
      query: company.address,
      sourceCoordinateSystem: 'GCJ-02（参考资料坐标系推定）',
    },
    locationStatus: '已复核',
    locationSource:
      '交行深圳分行参考资料企业坐标；企业名称与注册地址均精确匹配；研究阶段按 GCJ-02 转 WGS84',
    sourceUrl: ['可参考内容/AI营销地图-交行深圳分行/index.html'],
    sourcePublishedAt: '',
    verifiedAt: new Date().toISOString().slice(0, 10),
    confidence: 0.88,
    candidate: {
      name: referenceRow.name,
      address: referenceRow.address,
      creditCode: referenceRow.credit_code || '',
      longitude: sourceLng,
      latitude: sourceLat,
      coordinateSystem: 'GCJ-02（参考资料坐标系推定）',
    },
    match: {
      name: 'exact-normalized',
      address: 'exact-normalized',
    },
  });
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      version: new Date().toISOString(),
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      source: '交行深圳分行参考资料；名称与注册地址精确匹配；参考坐标按 GCJ-02 推定并转换',
      referenceFile: path.relative(root, referencePath),
      referenceRows: referenceRows.length,
      records,
      skipped,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    { outputPath, referenceRows: referenceRows.length, records: records.length, skipped },
    null,
    2,
  ),
);
