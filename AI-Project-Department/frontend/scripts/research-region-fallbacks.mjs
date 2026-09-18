import fs from 'node:fs';
import path from 'node:path';

// One-time research for companies that still have no enterprise-level point.
// The output is intentionally a separate regionLocation field: it is used to
// put every company on the map, but it must never be presented as a precise
// enterprise address.

const root = process.cwd();
const inputPath = path.join(root, 'public', 'data', 'companies.json');
const outputPath = path.join(root, 'docs', 'region-location-research.json');
const localKeyPath = path.join(root, '.amap-key');
const apiKey =
  process.env.AMAP_WEB_KEY ||
  process.env.AMAP_KEY ||
  (fs.existsSync(localKeyPath)
    ? fs.readFileSync(localKeyPath, 'utf8').trim().split(/\r?\n/)[0].trim()
    : '');
const delayMs = Number(process.env.REGION_RESEARCH_DELAY_MS || 350);

const sourceUrls = {
  spreadtrum: 'https://www.sec.gov/Archives/edgar/data/1287950/000119312510113017/dex81.htm',
  omnivision: 'https://opengovsg.com/corporate/201207875E',
  galaxycore: 'https://en.gcoreinc.com/about/contact',
  s2cJapan: 'https://jp.s2cinc.com/jp/info-pr-291',
  s2cKorea: 'https://craft.co/s2c/locations',
  newVision:
    'https://static.sse.com.cn/stock/disclosure/announcement/c/202211/001257_20221115_ZLR6.pdf',
  goodix: 'https://www.goodix.com/en/about_goodix/contact_us',
  silan: 'https://silan.com.cn/',
  huaxun: 'https://www.samcien.com/aboutus/',
  ninestar: 'https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=10868612',
  hongjun: 'https://m.zhipin.com/companys/8dcb8ff1e4253c5e03B629S_GVo~.html',
  ferrosemi: 'https://m.pedaily.cn/vc/company/710314.html',
  guangxing: 'https://career.hebut.edu.cn/company/index/id/7284.html',
};

const manualHints = {
  'SPREADTRUM HONG KONG LIMITED': {
    query: '香港九龙长沙湾道833号长沙湾广场2座8楼810A',
    region: { province: '中国香港', city: '香港', district: '九龙' },
    sourceUrl: [sourceUrls.spreadtrum],
  },
  'OMNIVISION TECHNOLOGIES SINGAPORE PTE.LTD.': {
    query: '1 Venture Avenue #04-02 Perennial Business City Singapore 608521',
    region: { province: '新加坡', city: '新加坡' },
    sourceUrl: [sourceUrls.omnivision],
    fallbackLocation: { lng: 103.8198, lat: 1.3521 },
  },
  'GALAXYCORE INC.': {
    query: '上海市浦东新区盛夏路560号2幢',
    region: { province: '上海市', city: '上海市', district: '浦东新区' },
    sourceUrl: [sourceUrls.galaxycore],
  },
  'S2C KOREA': {
    query: '韩国首尔江南区彦州路118号',
    region: { province: '韩国', city: '首尔' },
    sourceUrl: [sourceUrls.s2cKorea],
    preferFallbackLocation: true,
    fallbackLocation: { lng: 126.978, lat: 37.5665 },
  },
  'S2C JAPAN CO LTD': {
    query: '日本神奈川县横滨市港北区新横滨3-8-8',
    region: { province: '日本', city: '横滨市', district: '港北区' },
    sourceUrl: [sourceUrls.s2cJapan],
    fallbackLocation: { lng: 139.638, lat: 35.4437 },
  },
  'NEW VISION MICROELECTRONICS （HK） LIMITED': {
    query: '中国香港金钟道89号力宝中心2座4楼417室',
    region: { province: '中国香港', city: '香港', district: '金钟' },
    sourceUrl: [sourceUrls.newVision],
  },
  'GOODIX TECHNOLOGY （HK） COMPANY LIMITED': {
    query: '中国香港湾仔皇后大道东183号合和中心48楼4801室',
    region: { province: '中国香港', city: '香港', district: '湾仔' },
    sourceUrl: [sourceUrls.goodix],
  },
  'SILAN ELECTRONICS, LTD': {
    query: '杭州市',
    region: { province: '浙江省', city: '杭州市' },
    sourceUrl: [sourceUrls.silan],
  },
  浙江化讯半导体材料有限公司: {
    query: '浙江省嘉兴市嘉善县惠民街道陆家浜支路8号',
    region: { province: '浙江省', city: '嘉兴市', district: '嘉善县' },
    sourceUrl: [sourceUrls.huaxun],
  },
  纳思达股份有限公司: {
    query: '珠海市香洲区珠海大道3883号',
    region: { province: '广东省', city: '珠海市', district: '香洲区' },
    sourceUrl: [sourceUrls.ninestar],
  },
  广东鸿钧微电子科技有限公司: {
    query: '广州市南沙区翠瑜街7号',
    region: { province: '广东省', city: '广州市', district: '南沙区' },
    sourceUrl: [sourceUrls.hongjun],
  },
  '晶铁半导体技术（广东）有限公司': {
    query: '广州市黄埔区香雪八路98号',
    region: { province: '广东省', city: '广州市', district: '黄埔区' },
    sourceUrl: [sourceUrls.ferrosemi],
  },
  河北光兴半导体技术有限公司: {
    query: '石家庄市裕华区珠江大道369号',
    region: { province: '河北省', city: '石家庄市', district: '裕华区' },
    sourceUrl: [sourceUrls.guangxing],
  },
  湖北江城实验室: {
    query: '武汉市光谷一路227号',
    region: { province: '湖北省', city: '武汉市', district: '江夏区' },
    sourceUrl: ['https://restapi.amap.com/v3/place/text'],
  },
};

const cityTokens = [
  '北京',
  '上海',
  '天津',
  '重庆',
  '杭州',
  '衢州',
  '南京',
  '深圳',
  '武汉',
  '南通',
  '苏州',
  '无锡',
  '宁波',
  '广州',
  '烟台',
  '成都',
  '石家庄',
  '珠海',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parseLocation = (value) => {
  const [lng, lat] = String(value || '')
    .split(',')
    .map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
};

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
  const outOfChina = lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  if (outOfChina) return [lng, lat];
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

const fetchJson = async (url, headers = {}) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
};

const requestAmap = async (query) => {
  if (!apiKey) return null;
  const params = new URLSearchParams({ key: apiKey, address: query, output: 'JSON' });
  const payload = await fetchJson(`https://restapi.amap.com/v3/geocode/geo?${params}`);
  if (String(payload.status) !== '1') return null;
  const result = payload.geocodes?.[0];
  const sourceLocation = parseLocation(result?.location);
  if (!sourceLocation) return null;
  const [lng, lat] = gcj02ToWgs84(sourceLocation.lng, sourceLocation.lat);
  return {
    location: {
      lng,
      lat,
      sourceCoordinateSystem: 'GCJ-02',
      coordinateSystem: 'WGS84/CGCS2000-compatible',
    },
    region: {
      province: result.province || '',
      city: result.city || '',
      district: result.district || '',
      street: result.township || '',
    },
    address: result.formatted_address || query,
    sourceUrl: ['https://restapi.amap.com/v3/geocode/geo'],
  };
};

const requestNominatim = async (query) => {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' });
  const results = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, {
    'User-Agent': 'ic-industry-map-research/1.0 (offline data preparation)',
  });
  const result = results?.[0];
  if (!result) return null;
  const lng = Number(result.lon);
  const lat = Number(result.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return {
    location: { lng, lat, sourceCoordinateSystem: 'WGS84', coordinateSystem: 'WGS84' },
    address: result.display_name || query,
    sourceUrl: ['https://nominatim.openstreetmap.org/search'],
  };
};

const regionHintFor = (company) => {
  const manual = manualHints[company.name];
  if (manual) return manual;
  const name = company.name || '';
  const parenthesized = name.match(/[（(]([^）)]{2,8})[）)]/);
  const parentheticalCity = parenthesized?.[1]?.replace(/(省|市|区|县)$/, '');
  const city = parentheticalCity || cityTokens.find((token) => name.includes(token));
  if (city) {
    const normalizedCity = city.endsWith('市') ? city : `${city}市`;
    return { query: normalizedCity, region: { city: normalizedCity }, sourceUrl: [] };
  }
  return null;
};

if (!fs.existsSync(inputPath)) throw new Error(`Missing company master: ${inputPath}`);
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const pending = (data.companies || []).filter(
  (company) => !company.location || company.locationStatus === '区域参考',
);
const records = [];
let accepted = 0;
let unresolved = 0;

for (const company of pending) {
  const hint = regionHintFor(company);
  if (!hint) {
    unresolved += 1;
    records.push({
      name: company.name,
      query: company.address || company.name,
      regionLocation: null,
      locationStatus: '待复核',
      locationSource: '缺少可识别的地址或城市区域，暂不放置区域参考点',
      sourceUrl: [],
      confidence: 0,
      verifiedAt: new Date().toISOString().slice(0, 10),
    });
    continue;
  }

  let result = null;
  if (!hint.preferFallbackLocation) {
    try {
      result = await requestAmap(hint.query);
    } catch (error) {
      console.warn(`${company.name}: AMap region query failed: ${error.message || error}`);
    }
    if (!result) {
      try {
        result = await requestNominatim(hint.query);
      } catch (error) {
        console.warn(`${company.name}: Nominatim region query failed: ${error.message || error}`);
      }
    }
  }
  if (!result && hint.fallbackLocation) {
    result = {
      location: {
        ...hint.fallbackLocation,
        sourceCoordinateSystem: 'WGS84',
        coordinateSystem: 'WGS84',
      },
      address: hint.query,
      sourceUrl: [],
    };
  }

  const region = {
    province: hint.region?.province || result?.region?.province || '',
    city: hint.region?.city || result?.region?.city || '',
    district: hint.region?.district || result?.region?.district || '',
    street: hint.region?.street || result?.region?.street || '',
  };
  const publicAddress =
    company.address || (manualHints[company.name] && hint.query !== '杭州市' ? hint.query : '');
  if (!result?.location) {
    unresolved += 1;
    records.push({
      name: company.name,
      query: hint.query,
      address: publicAddress,
      region,
      regionLocation: null,
      locationStatus: '待复核',
      locationSource: '区域查询未返回可用坐标，暂不放置区域参考点',
      sourceUrl: hint.sourceUrl || [],
      confidence: 0,
      verifiedAt: new Date().toISOString().slice(0, 10),
    });
  } else {
    accepted += 1;
    records.push({
      name: company.name,
      query: hint.query,
      address: publicAddress,
      addressType: '区域参考地址（非企业门址）',
      region,
      regionLocation: {
        ...result.location,
        precision: '区域参考',
        score: 0.35,
        query: hint.query,
      },
      locationStatus: '区域参考',
      locationSource:
        '公开企业区域信息 + 高德/开放地图区域地理编码；仅用于全量地图展示，不代表企业门址',
      sourceUrl: Array.from(new Set([...(hint.sourceUrl || []), ...(result.sourceUrl || [])])),
      confidence: 0.35,
      verifiedAt: new Date().toISOString().slice(0, 10),
    });
  }
  await sleep(delayMs);
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      version: new Date().toISOString(),
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      source: '一次性区域参考点研究；区域参考点不计入精准企业点位',
      records: records.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ pending: pending.length, accepted, unresolved, outputPath }, null, 2));
