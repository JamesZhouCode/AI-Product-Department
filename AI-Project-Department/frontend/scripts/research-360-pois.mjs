import fs from 'node:fs';
import path from 'node:path';

// One-time, read-only enrichment through the public 360 Map POI suggestion
// endpoint. The generated JSON is committed as local research data; the
// running demo remains completely offline and never calls this endpoint.

const root = process.cwd();
const inputPath = path.join(root, 'public', 'data', 'companies.json');
const outputPath = path.join(root, 'docs', '360-poi-research.json');
const batchLimit = Number(process.env.MAP360_RESEARCH_LIMIT || 0);
const delayMs = Number(process.env.MAP360_RESEARCH_DELAY_MS || 180);
const timeoutMs = Number(process.env.MAP360_RESEARCH_TIMEOUT_MS || 12000);
const maxQueries = Number(process.env.MAP360_RESEARCH_MAX_QUERIES || 5);
const concurrency = Math.max(1, Number(process.env.MAP360_RESEARCH_CONCURRENCY || 1));
const retryNull = process.env.MAP360_RESEARCH_RETRY_NULL === '1';
const onlyAddressed = process.env.MAP360_RESEARCH_ONLY_ADDRESSED === '1';
const onlyNames = new Set(String(process.env.MAP360_RESEARCH_NAMES || '').split(',').map((value) => value.trim()).filter(Boolean));

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

const normalize = (value) => String(value || '')
  .replace(/^\s*[>→-]\s*/, '')
  .replace(/[（）()\s·.。、“”‘’'"，,；;：:、_\-]/g, '')
  .toLowerCase();
const cleanName = (value) => String(value || '').replace(/^\s*[>→-]\s*/, '').trim();
const unique = (values) => Array.from(new Set(values.filter(Boolean)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
};

const cityFromText = (value) => {
  const text = String(value || '');
  return Object.keys(cityCodes)
    .sort((a, b) => b.length - a.length)
    .find((city) => text.includes(city) || text.includes(city.replace(/市$/, ''))) || '';
};

const cityQueryName = (city) => String(city || '').replace(/市$/, '');
const simplifyAddress = (address) => {
  const value = String(address || '').trim();
  if (!value) return '';
  const city = cityFromText(value);
  const cityIndex = city ? value.indexOf(city.replace(/市$/, '')) : -1;
  const scoped = cityIndex >= 0 ? value.slice(cityIndex) : value;
  return scoped.replace(/(\d+弄|\d+号).*/, '$1');
};

const brandNames = new Set([
  '苹果', '三星', '三星电子', '华为', '华为技术有限公司', '英特尔', '英特尔有限公司',
  '英伟达', 'AMD', 'ARM', 'OPPO', 'vivo', '联想', '小米', '腾讯', '阿里云', '腾讯云',
  '国家电网', '南方电网', '比亚迪', 'SK海力士', '美光科技', '金士顿', 'Synopsys', 'Cadence',
]);

const shortSearchNames = (entityName) => {
  const value = cleanName(entityName);
  const withoutParenthetical = value.replace(/[（(].*?[）)]/g, '').trim();
  const withoutLegalSuffix = withoutParenthetical
    .replace(/(有限责任公司|股份有限公司|有限公司|集团公司|集团|控股公司|控股|公司)$/g, '')
    .trim();
  const beforeDash = withoutLegalSuffix.split(/[-—]/)[0].trim();
  return unique([withoutLegalSuffix, beforeDash])
    .filter((name) => normalize(name).length >= 3)
    .filter((name) => !/^(有限|责任|股份|控股|投资|管理|信息|科技|电子|公司|集团)$/.test(name));
};

const query360 = async (keyword, city = '') => {
  const code = cityCodes[city] || '0';
  const params = new URLSearchParams({
    d: 'pc',
    brand_cpc: 'on',
    keyword: keyword.trim(),
    city: code,
    cityid: code,
    sid: '1014',
    cityname: cityQueryName(city),
  });
  const url = `https://restapi.map.360.cn/newapi?${params.toString()}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = await fetchJson(url);
      if (payload?.status && payload.status !== 'E0') throw new Error(`360 status ${payload.status}`);
      return { url, list: Array.isArray(payload?.list) ? payload.list : [] };
    } catch (error) {
      lastError = error;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError || new Error('360 request failed');
};

const noisePattern = /产业园|科技园|园区|写字楼|大厦|广场|商场|酒店|公寓|小区|社区|村委|道路|路口|桥|隧道|收费站|服务区|停车场|出入口|地铁|公交|火车站|机场|学校|医院|公园|门$|售楼处|展厅|体验店|专卖店|服务中心|旗舰店|营业厅|卫生所|办事处|服务基地/;
const typeNoisePattern = /产业园|工业园|园区|写字楼|商场|酒店|公寓|小区|社区|道路|桥|隧道|停车场|地铁|公交|火车站|机场|学校|医院|公园/;
const addressPoiNoisePattern = /ATM|银行|餐馆|咖啡|便利店|商铺|超市|零售|药店|加油站|美食|生活服务|美容|培训|酒店|公寓|商场|购物|停车场|地铁|公交|医院|学校|公园/;
// These are the legacy records that were identified during the first
// enrichment pass as definite false positives (a restaurant, clothing
// company, unrelated tenant, or a different subsidiary).  Existing records
// are otherwise preserved: a short company name or a group/department POI
// can still be a valid representation of the enterprise.
const knownBad360Names = new Set([
  '江波龙', '龙迅股份', '沐曦股份', '盛美上海', '中船特气', '扬杰科技', '长光辰芯',
  '时代电气', '至纯科技',
]);
const companyPattern = /公司企业|公司|集团|股份|科技|电子|半导体|芯片|研究院|研究所|材料|设备|化学|气体|微电子|电路|存储|制造|投资|基金|银行|证券|工业/;

const geoPrefixes = [
  '北京市', '天津市', '上海市', '重庆市', '石家庄市', '唐山市', '邯郸市', '太原市',
  '沈阳市', '大连市', '长春市', '哈尔滨市', '南京市', '无锡市', '徐州市', '常州市',
  '苏州市', '南通市', '扬州市', '镇江市', '杭州市', '宁波市', '温州市', '嘉兴市',
  '绍兴市', '金华市', '合肥市', '福州市', '厦门市', '南昌市', '济南市', '青岛市',
  '烟台市', '郑州市', '武汉市', '长沙市', '株洲市', '广州市', '韶关市', '深圳市',
  '佛山市', '东莞市', '成都市', '昆明市', '西安市', '天水市', '兰州市',
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东',
  '四川', '云南', '陕西', '甘肃', '香港', '澳门',
].map((value) => normalize(value)).sort((a, b) => b.length - a.length);
const companyCore = (value) => {
  let core = normalize(cleanName(value))
    .replace(/(有限责任公司|股份有限公司|有限公司|集团公司|控股公司|集团|控股)$/g, '');
  const prefix = geoPrefixes.find((item) => core.startsWith(item) && core.length > item.length + 2);
  return prefix ? core.slice(prefix.length) : core;
};

const isCompanyPoi = (candidate) => {
  const name = String(candidate?.name || '');
  const type = String(candidate?.type_name || '');
  // Roads and industrial-park wording may legitimately occur in a company
  // address. Apply the noise filter to the POI title/category only.
  if (!name || noisePattern.test(`${name}${type}`) || typeNoisePattern.test(type)) return false;
  return type === '公司企业' || companyPattern.test(`${type}${name}`);
};

// An official company address may resolve to a building/door-number POI
// rather than a POI named after the company. Keep those candidates for the
// address-only fallback, but reject roads, stations, parks and other broad
// landmarks that would create a misleading point.
const isAddressPoi = (candidate) => {
  const name = String(candidate?.name || '');
  const type = String(candidate?.type_name || '');
  const address = String(candidate?.address || '');
  if (!name && !address) return false;
  if (addressPoiNoisePattern.test(`${name}${type}`) || /交通地名|道路|路口|桥|隧道|地铁|公交|火车站|机场|公园|学校|医院|社区|小区|商场|酒店|停车场|出入口/.test(`${name}${type}`)) return false;
  // A building/door POI should carry a number or a recognizable building
  // marker. This excludes a city/park/industrial-area centroid.
  return /\d/.test(`${name}${address}`) && /(号|栋|楼|座|室|层|院|大厦|中心|园|厂房|路|街|道)/.test(`${name}${address}`);
};

const addressSimilarity = (a, b) => {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.8;
  // Administrative prefixes vary between a registered address and a map POI.
  // Compare road/number/building tokens instead of the whole Chinese string.
  const routeTokens = Array.from(right.matchAll(/[\u4e00-\u9fff]{2,}(?:路|街|道|号|弄|巷|园|大厦|中心)/g), (match) => match[0].slice(-4));
  const tokens = [
    ...routeTokens,
    ...(right.match(/\d+[a-z]?\s*(?:号|弄|室|栋|层|楼)?/gi) || []),
    ...(right.match(/[a-z]{2,}\d*/gi) || []),
  ];
  if (!tokens.length) return 0;
  const distinct = Array.from(new Set(tokens.map((token) => token.toLowerCase())));
  return distinct.filter((token) => left.includes(token)).length / distinct.length;
};

const candidateScore = (candidate, entity, cityHint = '', addressQuery = false, matchName = entity.name, addressOnly = false) => {
  const wanted = normalize(cleanName(matchName));
  const name = normalize(candidate.name);
  if (!wanted || !name) return -Infinity;
  if (wanted.length < 3 && name !== wanted && !addressOnly) return -Infinity;
  if (addressOnly) {
    const candidateType = String(candidate?.type_name || '');
    const nameMatches = name === wanted || name.includes(wanted) || wanted.includes(name);
    const isCompany = candidateType === '公司企业' || companyPattern.test(`${candidateType}${candidate.name || ''}`);
    const isBuilding = /(号|栋|楼|座|室|层|院|大厦|中心|园|厂房|路|街|道)/.test(String(candidate.name || ''));
    // A same-address tenant is not evidence that the requested company is
    // located there. Address-only matching may use the requested company POI
    // or the building/door POI, but not an unrelated tenant.
    if ((isCompany && !nameMatches) || (!isCompany && !isBuilding)) return -Infinity;
  }
  let score = -Infinity;
  if (name === wanted) score = 170;
  else if (name.startsWith(wanted)) score = 145;
  else if (name.includes(wanted)) score = 132;
  else if (wanted.length >= 4 && wanted.includes(name)) score = 90;
  else {
    // For a company address query, require at least a meaningful name token;
    // otherwise a nearby office/park POI could be mistaken for the enterprise.
    const wantedTokens = cleanName(matchName).match(/[\u4e00-\u9fff]{2,}|[a-z0-9]{3,}/gi) || [];
    const overlap = wantedTokens.filter((token) => String(candidate.name || '').toLowerCase().includes(token.toLowerCase()));
    const addressScore = addressSimilarity(candidate.address, entity.address);
    if (addressOnly && addressScore >= 0.55) score = 82 + Math.round(addressScore * 30);
    else {
      if (!addressQuery || overlap.length === 0) return -Infinity;
      score = 65 + Math.min(30, overlap.length * 10);
    }
  }
  const candidateCity = cityFromText(`${candidate.district || ''}${candidate.address || ''}`);
  // A city-scoped search can still return a similarly named POI elsewhere in
  // the country. Do not plot that candidate over the enterprise's known city.
  if (cityHint && candidateCity && candidateCity !== cityHint) return -Infinity;
  // When a verified address is available, a same-city company with a
  // conflicting street/address is not an acceptable replacement. Prefer the
  // address-only building POI or a company POI at the same address.
  if (entity.address && !addressOnly && addressSimilarity(candidate.address, entity.address) < 0.3) return -Infinity;
  if (candidate.type_name === '公司企业') score += 34;
  else if (companyPattern.test(String(candidate.type_name || ''))) score += 14;
  if (cityHint && candidateCity === cityHint) score += 18;
  if (entity.address) score += Math.round(addressSimilarity(candidate.address, entity.address) * 28);
  if (/门店|体验店|专卖店|服务中心/.test(String(candidate.name || ''))) score -= 22;
  const wantedCore = companyCore(matchName);
  const candidateCore = companyCore(candidate.name);
  if (!addressOnly && wantedCore && candidateCore && !candidateCore.startsWith(wantedCore)) return -Infinity;
  if (wantedCore && candidateCore === wantedCore) score += 42;
  else if (wantedCore && candidateCore.startsWith(wantedCore)) score += 15;
  else if (wantedCore && wantedCore.length >= 4 && candidateCore.includes(wantedCore)) score += 6;
  // A shortened query must not attach a same-keyword company with an
  // unrelated prefix (for example “今桐(上海)创业投资…” for “上海创业投资”).
  return score;
};

const inferRegion = (candidate, fallback = {}) => {
  const text = `${candidate?.district || ''}${candidate?.address || ''}`;
  const city = cityFromText(text) || fallback.city || '';
  let district = fallback.district || '';
  if (candidate?.district) {
    district = String(candidate.district)
      .replace(city, '')
      .replace(/^[省市区县]+/, '')
      .trim() || district;
  }
  return {
    province: cityToProvince[city] || fallback.province || '',
    city,
    district,
    street: fallback.street || '',
  };
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

const buildRecord = (entity, candidate, query, cityHint, sourceUrl, addressOnly = false) => {
  const lng = Number(candidate.x);
  const lat = Number(candidate.y);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng === 0 || lat === 0) return null;
  const [wgsLng, wgsLat] = gcj02ToWgs84(lng, lat);
  return {
    name: entity.name,
    query,
    address: String(candidate.address || '').trim(),
    addressType: addressOnly ? '企业登记地址门址（360地图地址 POI）' : '企业兴趣点（360地图公开 POI）',
    region: inferRegion(candidate, entity.region),
    location: {
      lng: wgsLng,
      lat: wgsLat,
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      precision: addressOnly ? '门址/地址 POI' : '兴趣点',
      score: addressOnly ? 0.78 : 0.9,
      query,
      sourceCoordinateSystem: 'GCJ-02',
      map360PoiId: candidate.pguid || '',
    },
    locationStatus: '已复核',
    locationSource: addressOnly
      ? '360地图公开地址 POI 与企业登记地址匹配；研究阶段 GCJ-02 转 WGS84'
      : '360地图公开企业 POI；研究阶段 GCJ-02 转 WGS84',
    sourceUrl: ['https://map.360.cn/', sourceUrl].filter(Boolean),
    sourcePublishedAt: '',
    verifiedAt: new Date().toISOString().slice(0, 10),
    confidence: addressOnly ? 0.78 : 0.9,
    candidate: {
      name: candidate.name || '',
      address: candidate.address || '',
      district: candidate.district || '',
      typeName: candidate.type_name || '',
      mainCategory: candidate.main_cat_new || '',
      pguid: candidate.pguid || '',
      longitude: lng,
      latitude: lat,
      adcode: candidate.adcode || '',
    },
  };
};

const writeOutput = (records) => {
  fs.writeFileSync(outputPath, JSON.stringify({
    version: new Date().toISOString(),
    coordinateSystem: 'WGS84/CGCS2000-compatible',
    source: '360地图公开企业 POI 一次性检索（GCJ-02 转 WGS84）',
    records: Array.from(records.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN')),
  }, null, 2));
};

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : { records: [] };
const records = new Map((existing.records || []).map((record) => [normalize(record.name), record]));
const allCompanies = data.companies || [];
const companyByName = new Map(allCompanies.map((entity) => [normalize(entity.name), entity]));
// Relation-only enterprises often have no address in the workbook. Use the
// city of a known enterprise that consumes/sells to them as a bounded search
// hint; this is especially useful for suppliers and distributors, while
// equity-only funds/people remain intentionally unresolved.
const relationCityHints = new Map();
for (const relation of data.relations || []) {
  if (!['供应', '经销'].includes(relation.relationType)) continue;
  const source = companyByName.get(normalize(relation.from));
  const city = source?.region?.city || cityFromText(source?.address || '');
  if (!city) continue;
  const key = normalize(relation.to);
  const counts = relationCityHints.get(key) || new Map();
  counts.set(city, (counts.get(city) || 0) + 1);
  relationCityHints.set(key, counts);
}
// Remove only the explicitly reviewed false positives and clearly noisy POI
// categories. Name/address discrepancies are handled when a new candidate is
// scored; they must not invalidate an existing, manually reviewed record.
for (const [key, record] of records.entries()) {
  const candidateName = record?.candidate?.name || '';
  const candidateType = record?.candidate?.typeName || '';
  if (record?.location && (
    knownBad360Names.has(cleanName(record.name))
    || noisePattern.test(candidateType)
    || typeNoisePattern.test(candidateType)
    || addressPoiNoisePattern.test(candidateType)
  )) records.delete(key);
}
const cache = new Map();
const pending = allCompanies.filter((entity) => {
  if (onlyAddressed && !entity.address) return false;
  if (onlyNames.size && !onlyNames.has(cleanName(entity.name))) return false;
  if (entity.mapDisplay === false) return false;
  const research = records.get(normalize(entity.name));
  // Seed rows often already carry a useful street address even when the
  // company-name search has no POI. Re-run those rows with an address-only
  // query; leave unresolved relation-only funds/people cached as pending.
  if (research && !research.location && !retryNull && !entity.address) return false;
  return !entity.location || (String(entity.locationSource || '').includes('360地图') && !research?.location);
});
let completed = 0;
let accepted = 0;
let skipped = 0;

const work = pending.slice(0, batchLimit || pending.length);
let nextIndex = 0;
const processEntity = async (entity) => {
  const key = normalize(entity.name);
  if (records.get(key)?.location) { skipped += 1; return; }
  const clean = cleanName(entity.name);
  // Do not repeatedly query a name whose legacy result was explicitly
  // reviewed as a false positive. If a stronger coordinate/manual research
  // record exists, prepare-company-master will still use that source.
  if (knownBad360Names.has(clean)) {
    records.set(key, {
      name: entity.name,
      query: '',
      location: null,
      locationStatus: '待复核',
      locationSource: '360地图历史候选已判定为非目标企业 POI，等待更强地址/坐标来源',
      sourceUrl: ['https://map.360.cn/'],
      verifiedAt: new Date().toISOString().slice(0, 10),
      confidence: 0,
    });
    completed += 1;
    return;
  }
  // A standalone person or a parsing artefact is not an enterprise POI. Keep
  // it in the graph, but do not manufacture a map point for it.
  if (clean.length < 2 || /^(信息未公开|INC\.?|N\/A|无)$/.test(clean) || !entity.address && /^[\u4e00-\u9fff]{2,4}$/.test(clean) && !brandNames.has(clean) && !/[公司集团股份科技电子半导体研究院研究所投资基金银行证券工业]/.test(clean)) {
    records.set(key, { name: entity.name, query: '', location: null, locationStatus: '待复核', locationSource: '实体不是可确认的企业 POI（保留在关系图谱，暂不落图）', sourceUrl: ['https://map.360.cn/'], verifiedAt: new Date().toISOString().slice(0, 10), confidence: 0 });
    completed += 1;
    return;
  }
  const entityCityHint = entity.region?.city || cityFromText(entity.address) || '';
  const relationCities = Array.from(relationCityHints.get(key)?.entries() || [])
    .sort((a, b) => b[1] - a[1])
    .map(([city]) => city);
  const cityHints = unique([entityCityHint, ...relationCities]).slice(0, 3);
  const cityHint = cityHints[0] || '';
  const shortNames = shortSearchNames(clean);
  const querySpecs = [
    ...cityHints.map((city) => ({ query: `${clean} ${cityQueryName(city)}`, city, matchName: clean })),
    { query: clean, city: '', matchName: clean },
    { query: shortNames[0] ? `${shortNames[0]}${cityHint ? ` ${cityQueryName(cityHint)}` : ''}` : '', city: cityHint, matchName: shortNames[0] || clean },
    // Address strings often contain administrative prefixes that the map
    // service fails to match inside a city-scoped search; search this query
    // nationally and keep the known-city guard in candidateScore.
    { query: entity.address, city: '', matchName: clean, addressOnly: true },
    { query: simplifyAddress(entity.address), city: '', matchName: clean, addressOnly: true },
  ].filter((item) => item.query).slice(0, maxQueries);
  const queries = querySpecs.map((item) => item.query);
  let best = null;
  let bestScore = -Infinity;
  let bestQuery = '';
  let bestUrl = '';
  for (let qi = 0; qi < queries.length; qi += 1) {
    const querySpec = querySpecs[qi];
    const query = querySpec.query;
    // The unqualified retry deliberately searches nationally.  This catches
    // enterprises whose registered city and map POI city differ, while the
    // city filter above prevents a cross-city false positive from being used.
    const queryCity = querySpec.city;
    const cacheKey = `${query}|${queryCity}`;
    let result = cache.get(cacheKey);
    try {
      if (!result) {
        result = await query360(query, queryCity);
        cache.set(cacheKey, result);
      }
      const candidates = result.list
        .filter(querySpec.addressOnly ? isAddressPoi : isCompanyPoi)
        .map((candidate) => ({ candidate, score: candidateScore(candidate, entity, querySpec.city || entityCityHint, /\s/.test(query) && query.includes(entity.address || '\u0000'), querySpec.matchName, querySpec.addressOnly) }))
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => b.score - a.score);
      if (process.env.MAP360_RESEARCH_DEBUG === '1' && onlyNames.has(cleanName(entity.name))) {
        console.log(`[debug] ${entity.name} query=${query} addressOnly=${Boolean(querySpec.addressOnly)} raw=${result.list.length} rawItems=${result.list.slice(0, 5).map((item) => `${item.name}|${item.address}|${item.type_name}`).join(' || ')} candidates=${candidates.slice(0, 5).map((item) => `${item.candidate.name}|${item.candidate.address}|${item.candidate.type_name}|${item.score}`).join(' || ')}`);
      }
      if (candidates[0] && candidates[0].score > bestScore) {
        best = candidates[0].candidate;
        bestScore = candidates[0].score;
        bestQuery = query;
        bestUrl = result.url;
      }
      if (bestScore >= 175) break;
    } catch (error) {
      console.warn(`${entity.name}: ${query} -> ${error.message || error}`);
    }
    await sleep(delayMs);
  }
  const bestSpec = querySpecs.find((item) => item.query === bestQuery);
  const minimumScore = bestSpec?.addressOnly ? 100 : 118;
  const record = best && bestScore >= minimumScore ? buildRecord(entity, best, bestQuery, bestSpec?.city || entityCityHint, bestUrl, Boolean(bestSpec?.addressOnly)) : null;
  if (record) {
    records.set(key, record);
    accepted += 1;
    console.log(`[${completed + 1}/${pending.length}] ${entity.name}: ${record.address} -> ${record.location.lng},${record.location.lat}`);
  } else {
    records.set(key, {
      name: entity.name,
      query: bestQuery || queries[0] || '',
      location: null,
      locationStatus: '待复核',
      locationSource: '360地图公开企业 POI 批量检索未找到可确认的企业兴趣点',
      sourceUrl: ['https://map.360.cn/'],
      verifiedAt: new Date().toISOString().slice(0, 10),
      confidence: 0,
    });
    console.log(`[${completed + 1}/${pending.length}] ${entity.name}: no precise enterprise POI`);
  }
  completed += 1;
  if (completed % 10 === 0) writeOutput(records);
  await sleep(delayMs);
};

const worker = async () => {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= work.length) return;
    await processEntity(work[index]);
  }
};

await Promise.all(Array.from({ length: concurrency }, () => worker()));

writeOutput(records);
console.log(JSON.stringify({ pending: pending.length, completed, accepted, skipped, records: records.size, outputPath }, null, 2));
