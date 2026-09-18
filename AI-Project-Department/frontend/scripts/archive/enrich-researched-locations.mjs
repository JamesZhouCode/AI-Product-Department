import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const candidatePath = path.join(root, 'docs', 'listed-location-candidates.json');
const manualPath = path.join(root, 'docs', 'manual-location-research.json');
const coordinateResearchPath = path.join(root, 'docs', 'coordinate-research.json');
const outputPath = path.join(root, 'docs', 'researched-locations.json');
const verificationDate = '2026-08-17';
const tdtKey = process.env.TDT_KEY;

if (!tdtKey) {
  console.error('TDT_KEY is required for the one-time coordinate enrichment. It is not stored in the project.');
  process.exit(1);
}

const normalize = (value) => String(value || '').replace(/[（）()\s·.。、“”‘’]/g, '').toLowerCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// These are report-layout corrections, not guessed locations. They retain the
// complete address shown elsewhere in the same official annual report.
const addressOverrides = {
  概伦电子: '上海市浦东新区申江路5709号',
  沪硅产业: '上海市浦东新区临港新片区云水路1000号',
  江丰电子: '浙江省余姚市名邦科技工业园区安山路198号',
  博通集成: '上海市浦东新区张东路1387号41幢',
  芯源微: '辽宁省沈阳市浑南区飞云路16号',
  电科芯片: '重庆市沙坪坝区西永大道36号附2号',
  普冉股份: '上海市浦东新区申江路5005弄1号',
  北京君正: '北京市海淀区西北旺东路10号院东区14号楼',
  江波龙: '深圳市前海深港合作区南山街道听海大道5059号鸿荣源前海金融中心二期B座2001、2201、2301',
  中芯国际: '中国上海市浦东新区张江路18号',
  赛微电子: '北京市北京经济技术开发区科创八街21号院1号楼',
  华润微: '江苏省无锡市梁溪路14号',
};

const cityHints = [
  ['上海市', '上海市'], ['北京市', '北京市'], ['天津市', '天津市'], ['重庆市', '重庆市'],
  ['深圳市', '深圳市'], ['广州市', '广州市'], ['佛山市', '佛山市'], ['东莞市', '东莞市'],
  ['厦门市', '厦门市'], ['福州市', '福州市'], ['泉州市', '泉州市'], ['漳州市', '漳州市'],
  ['杭州市', '杭州市'], ['宁波市', '宁波市'], ['绍兴市', '绍兴市'], ['嘉兴市', '嘉兴市'],
  ['湖州市', '湖州市'], ['温州市', '温州市'], ['无锡市', '无锡市'], ['苏州市', '苏州市'],
  ['常州市', '常州市'], ['南通市', '南通市'], ['扬州市', '扬州市'], ['南京市', '南京市'],
  ['合肥市', '合肥市'], ['芜湖市', '芜湖市'], ['武汉市', '武汉市'], ['襄阳市', '襄阳市'],
  ['长沙市', '长沙市'], ['株洲市', '株洲市'], ['南昌市', '南昌市'], ['济南市', '济南市'],
  ['青岛市', '青岛市'], ['烟台市', '烟台市'], ['西安市', '西安市'], ['成都市', '成都市'],
  ['沈阳市', '沈阳市'], ['大连市', '大连市'], ['长春市', '长春市'], ['吉林市', '吉林市'],
  ['石家庄市', '石家庄市'], ['唐山市', '唐山市'], ['邯郸市', '邯郸市'], ['郑州市', '郑州市'],
  ['太原市', '太原市'], ['昆明市', '昆明市'], ['韶关市', '韶关市'], ['宜兴市', '宜兴市'],
  ['余姚市', '余姚市'], ['江阴市', '江阴市'], ['天水市', '天水市'], ['沣西新城', '西安市'],
  ['杭州经济技术开发区', '杭州市'], ['苏州工业园区', '苏州市'],
];
const provinceHints = [
  ['上海市', '上海市'], ['北京市', '北京市'], ['天津市', '天津市'], ['重庆市', '重庆市'],
  ['广东省', '广东省'], ['浙江省', '浙江省'], ['江苏省', '江苏省'], ['福建省', '福建省'],
  ['山东省', '山东省'], ['河北省', '河北省'], ['河南省', '河南省'], ['湖北省', '湖北省'],
  ['湖南省', '湖南省'], ['安徽省', '安徽省'], ['江西省', '江西省'], ['四川省', '四川省'],
  ['陕西省', '陕西省'], ['辽宁省', '辽宁省'], ['吉林省', '吉林省'], ['黑龙江省', '黑龙江省'],
  ['山西省', '山西省'], ['云南省', '云南省'], ['甘肃省', '甘肃省'], ['内蒙古', '内蒙古自治区'],
];

const inferRegion = (address) => {
  const text = String(address || '');
  const city = cityHints.find(([hint]) => text.includes(hint))?.[1]
    || ({ 上海: '上海市', 北京: '北京市', 天津: '天津市', 重庆: '重庆市' }[text.match(/[（(](上海|北京|天津|重庆)[）)]/)?.[1]] || '');
  const province = provinceHints.find(([hint]) => text.includes(hint))?.[1]
    || ({ 上海市: '上海市', 北京市: '北京市', 天津市: '天津市', 重庆市: '重庆市', 深圳市: '广东省',
      广州市: '广东省', 佛山市: '广东省', 东莞市: '广东省', 杭州市: '浙江省', 宁波市: '浙江省',
      嘉兴市: '浙江省', 绍兴市: '浙江省', 无锡市: '江苏省', 苏州市: '江苏省', 常州市: '江苏省',
      南通市: '江苏省', 扬州市: '江苏省', 南京市: '江苏省', 合肥市: '安徽省', 武汉市: '湖北省',
      长沙市: '湖南省', 株洲市: '湖南省', 济南市: '山东省', 西安市: '陕西省', 沈阳市: '辽宁省',
      长春市: '吉林省', 吉林市: '吉林省', 唐山市: '河北省', 邯郸市: '河北省', 郑州市: '河南省',
      太原市: '山西省', 昆明市: '云南省', 韶关市: '广东省', 宜兴市: '江苏省', 余姚市: '浙江省',
      江阴市: '江苏省', 天水市: '甘肃省', 厦门市: '福建省', 福州市: '福建省', 漳州市: '福建省',
      泉州市: '福建省', 成都市: '四川省' }[city] || '');
  const districtNames = [
    '浦东新区', '徐汇区', '杨浦区', '静安区', '长宁区', '闵行区', '青浦区', '宝山区', '松江区',
    '黄浦区', '虹口区', '普陀区', '嘉定区', '奉贤区', '崇明区', '海淀区', '朝阳区', '西城区',
    '东城区', '丰台区', '大兴区', '南山区', '福田区', '宝安区', '龙华区', '龙岗区', '同安区',
    '西青区', '津南区', '滨湖区', '新吴区', '梁溪区', '吴中区', '相城区', '新北区', '滨江区',
    '余杭区', '西湖区', '南湖区', '越城区', '经济技术开发区', '高新区', '经开区', '开发区',
    '工业园区', '综合保税区', '沣西新城', '武江区', '禅城区', '南海区', '沙坪坝区', '秦州区',
    '槐荫区', '邗江区', '石峰区', '襄城区', '玉田县', '浑南区',
  ];
  const district = districtNames.find((item) => text.includes(item)) || '';
  const streetMatches = [...text.matchAll(/([\u4e00-\u9fa5]{2,12}(?:街道|镇|乡))/g)].map((match) => match[1]);
  const street = streetMatches.at(-1)?.replace(/^.*(?:区|县)/, '') || '';
  return { province, city, district, street };
};

const parseTdt = (text) => {
  const match = String(text).match(/var\s+tdt_loadResult\s*=\s*(\{.*\})\s*;?\s*$/s);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
};

const geocode = async (address) => {
  const target = `https://api.tianditu.gov.cn/geocoder?ds=${encodeURIComponent(JSON.stringify({ keyWord: address }))}&type=geocode&tk=${tdtKey}`;
  const url = `https://api.tianditu.gov.cn/apiserver/ajaxproxy?proxyReqUrl=${encodeURIComponent(target)}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://qvdv.com/' } });
      if (!response.ok) throw new Error(`TianDiTu ${response.status}`);
      return parseTdt(await response.text());
    } catch (error) {
      lastError = error;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
};

const addressVariants = (address) => {
  const variants = [address];
  const simplified = address
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(?:[0-9０-９]+(?:层|楼|室|幢|栋|号楼|号院))/g, '')
    .replace(/、[^号]{0,12}(?:幢|栋|室).*$/, '')
    .replace(/（实际楼层[^）]*）/g, '');
  if (simplified && simplified !== address) variants.push(simplified);
  return Array.from(new Set(variants));
};

const manualQueryOverrides = {
  傅里叶半导体: '上海市浦东新区云鹃路88弄11号港城广场',
  超硅: '上海市松江区石湖荡镇上海超硅半导体有限公司',
};

const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : { records: [] };
const byName = new Map((existing.records || []).map((record) => [normalize(record.name), record]));
const candidates = JSON.parse(fs.readFileSync(candidatePath, 'utf8')).candidates || [];
const manualRecords = fs.existsSync(manualPath)
  ? (JSON.parse(fs.readFileSync(manualPath, 'utf8')).records || [])
  : [];
const coordinateRecords = fs.existsSync(coordinateResearchPath)
  ? (JSON.parse(fs.readFileSync(coordinateResearchPath, 'utf8')).records || [])
  : [];
let enriched = 0;

// Earlier exploratory runs could retain a road or district centroid. Keep the
// researched address for auditability, but remove that coordinate from the
// formal map dataset until a door/POI result is available.
for (const record of byName.values()) {
  if (record.location && !/门址|兴趣点/.test(record.location.precision || '')) {
    record.location = null;
    record.locationStatus = '待复核';
    record.locationSource = `${record.locationSource || '公开来源'}；原坐标精度不足，待门址/兴趣点复核`;
  }
}

for (const candidate of candidates) {
  const extracted = candidate.extracted?.address;
  const address = addressOverrides[candidate.name] || extracted;
  if (!address || candidate.error || candidate.status) continue;
  const old = byName.get(normalize(candidate.name));
  if (old?.location && old.locationStatus === '已复核' && !addressOverrides[candidate.name]) continue;
  let result = null;
  let matchedQuery = address;
  for (const variant of addressVariants(address)) {
    const candidateResult = await geocode(variant);
    const candidateLocation = candidateResult?.location;
    if (!candidateLocation || candidateResult.status !== '0') continue;
    if (!result || Number(candidateLocation.score) > Number(result.location?.score || 0)) {
      result = candidateResult;
      matchedQuery = variant;
    }
    if (Number(candidateLocation.score) >= 75 && /门址|兴趣点/.test(candidateLocation.level || '')) break;
  }
  const loc = result?.location;
  // A road/district centroid is not accepted as a precise enterprise point.
  // Keep the source address in the audit file, but only write a map point when
  // TianDiTu returns a door/POI result with a usable confidence score.
  if (!loc || result.status !== '0' || Number(loc.score) < 60 || !/门址|兴趣点/.test(loc.level || '')) {
    console.warn(`${candidate.name}: coordinate rejected (${result?.msg || 'no result'})`);
    const pending = {
      ...(old || {}),
      name: candidate.name,
      address,
      addressType: '总部/办公地址（年报）',
      region: inferRegion(address),
      location: null,
      locationStatus: '待复核',
      locationSource: `巨潮资讯${candidate.reportTitle?.includes('2025') ? '2025' : '2024'}年年度报告地址；坐标精度不足，待门址/兴趣点复核`,
      sourceUrl: Array.from(new Set([...(old?.sourceUrl || []), ...(candidate.reportUrl ? [candidate.reportUrl] : [])])),
      sourcePublishedAt: candidate.announcementTime || old?.sourcePublishedAt || '',
    };
    byName.set(normalize(candidate.name), pending);
    continue;
  }
  const reportYear = candidate.reportTitle?.includes('2025') ? '2025' : '2024';
  const sourceUrl = candidate.reportUrl ? [candidate.reportUrl] : [];
  const record = {
    ...(old || {}),
    name: candidate.name,
    address,
    addressType: '总部/办公地址（年报）',
    region: inferRegion(address),
    location: {
      lng: Number(loc.lon),
      lat: Number(loc.lat),
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      precision: loc.level || '门址',
      score: Number(loc.score),
      query: matchedQuery,
    },
    locationStatus: '已复核',
    locationSource: `巨潮资讯${reportYear}年年度报告；天地图一次性地址解析`,
    sourceUrl: Array.from(new Set([...(old?.sourceUrl || []), ...sourceUrl])),
    sourcePublishedAt: candidate.announcementTime || old?.sourcePublishedAt || '',
    verifiedAt: verificationDate,
    confidence: Math.max(Number(old?.confidence || 0), Number(loc.score) >= 90 ? 0.97 : 0.92),
  };
  byName.set(normalize(candidate.name), record);
  enriched += 1;
  console.log(`${candidate.name}: ${address} -> ${loc.lon},${loc.lat} (${loc.score})`);
  await sleep(120);
}

// Public-source research for unlisted companies. These records deliberately
// keep the source address and source URL separate from the one-time geocoder
// result, so a later analyst can re-check the evidence without any runtime
// network dependency.
for (const manual of manualRecords) {
  if (!manual.name || !manual.address) continue;
  const old = byName.get(normalize(manual.name));
  if (old?.location && old.locationStatus === '已复核' && !manualQueryOverrides[manual.name]) continue;
  let result = null;
  const queryAddress = manualQueryOverrides[manual.name] || manual.address;
  let matchedQuery = queryAddress;
  for (const variant of addressVariants(queryAddress)) {
    const candidateResult = await geocode(variant);
    const candidateLocation = candidateResult?.location;
    if (!candidateLocation || candidateResult.status !== '0') continue;
    if (!result || Number(candidateLocation.score) > Number(result.location?.score || 0)) {
      result = candidateResult;
      matchedQuery = variant;
    }
    if (Number(candidateLocation.score) >= 75 && /门址|兴趣点/.test(candidateLocation.level || '')) break;
  }
  const loc = result?.location;
  if (!loc || result.status !== '0' || Number(loc.score) < 60 || !/门址|兴趣点/.test(loc.level || '')) {
    console.warn(`${manual.name}: coordinate rejected (${result?.msg || 'no result'})`);
    const pending = {
      ...(old || {}),
      name: manual.name,
      address: manual.address,
      addressType: manual.addressType || '总部/主要经营地址（公开来源）',
      region: inferRegion(manual.address),
      location: null,
      locationStatus: '待复核',
      locationSource: '企业官方网站/公开公告地址；坐标精度不足，待门址/兴趣点复核',
      sourceUrl: Array.from(new Set([...(old?.sourceUrl || []), ...(manual.sourceUrl || [])])),
      sourcePublishedAt: manual.sourcePublishedAt || old?.sourcePublishedAt || '',
      confidence: old?.confidence ?? manual.confidence ?? 0,
    };
    byName.set(normalize(manual.name), pending);
    continue;
  }
  const sourceConfidence = Number(manual.confidence || 0.9);
  const geocodeConfidence = Number(loc.score) >= 90 ? 0.97 : 0.92;
  const record = {
    ...(old || {}),
    name: manual.name,
    address: manual.address,
    addressType: manual.addressType || '总部/主要经营地址（公开来源）',
    region: inferRegion(manual.address),
    location: {
      lng: Number(loc.lon),
      lat: Number(loc.lat),
      coordinateSystem: 'WGS84/CGCS2000-compatible',
      precision: loc.level || '门址',
      score: Number(loc.score),
      query: matchedQuery,
    },
    locationStatus: '已复核',
    locationSource: '企业官方网站/公开公告；天地图一次性地址解析',
    sourceUrl: Array.from(new Set([...(old?.sourceUrl || []), ...(manual.sourceUrl || [])])),
    sourcePublishedAt: manual.sourcePublishedAt || old?.sourcePublishedAt || '',
    verifiedAt: verificationDate,
    confidence: Math.max(Number(old?.confidence || 0), Math.min(sourceConfidence, geocodeConfidence)),
  };
  byName.set(normalize(manual.name), record);
  enriched += 1;
  console.log(`${manual.name}: ${manual.address} -> ${loc.lon},${loc.lat} (${loc.score})`);
  await sleep(120);
}

// A small, explicitly reviewed fallback list covers company POIs for which
// the official address is valid but TianDiTu cannot resolve the long address
// string. The city-qualified company-name query must return a high-confidence
// interest point; otherwise the entity remains pending rather than receiving
// a city centroid.
const poiFallbacks = [
  ['华大九天', '北京市华大九天'],
  ['南大光电', '苏州市南大光电'],
  ['雅克科技', '宜兴市雅克科技'],
  ['瑞芯微', '福州市瑞芯微'],
  ['汇顶科技', '深圳市汇顶科技'],
  ['纳芯微', '苏州市纳芯微'],
  ['长江存储', '武汉市长江存储'],
  ['集创北方', '北京市集创北方'],
  ['中微半导', '深圳市中微半导'],
];
for (const [name, query] of poiFallbacks) {
  const old = byName.get(normalize(name));
  if (!old?.address || old.location) continue;
  const result = await geocode(query);
  const loc = result?.location;
  if (!loc || result.status !== '0' || Number(loc.score) < 90 || loc.level !== '兴趣点') {
    console.warn(`${name}: company POI fallback rejected (${result?.msg || 'no result'})`);
    continue;
  }
  old.location = {
    lng: Number(loc.lon),
    lat: Number(loc.lat),
    coordinateSystem: 'WGS84/CGCS2000-compatible',
    precision: '兴趣点',
    score: Number(loc.score),
    query,
  };
  old.locationStatus = '已复核';
  old.locationSource = `${old.locationSource || '公开来源'}；天地图企业名称兴趣点匹配（一次性研究）`;
  old.verifiedAt = verificationDate;
  old.confidence = Math.max(Number(old.confidence || 0), 0.94);
  enriched += 1;
  console.log(`${name}: company POI ${query} -> ${loc.lon},${loc.lat} (${loc.score})`);
  await sleep(120);
}

// Explicit public coordinates are applied after geocoder results so that a
// source document/POI with a known point always wins over a road centroid.
// This is a one-time research input; the browser only consumes the generated
// JSON and never calls the source map provider.
for (const coordinate of coordinateRecords) {
  if (!coordinate.name || !coordinate.location) continue;
  const old = byName.get(normalize(coordinate.name));
  if (!old) continue;
  const hadPrecisePoint = Boolean(old.location && /门址|兴趣点/.test(old.location.precision || ''));
  old.address = coordinate.address || old.address || '';
  old.addressType = coordinate.addressType || old.addressType || '总部/主要生产地址';
  old.location = { ...coordinate.location };
  old.locationStatus = coordinate.locationStatus || '已复核';
  const priorAddressSource = old.locationSource
    ?.replace(/；坐标精度不足，待门址\/兴趣点复核/g, '')
    ?.replace(/；原坐标精度不足，待门址\/兴趣点复核/g, '')
    ?.trim();
  old.locationSource = `${coordinate.locationSource || '公开来源明确坐标'}${priorAddressSource ? `；地址来源：${priorAddressSource}` : ''}`;
  old.sourceUrl = Array.from(new Set([...(old.sourceUrl || []), ...(coordinate.sourceUrl || [])]));
  old.sourcePublishedAt = coordinate.sourcePublishedAt || old.sourcePublishedAt || '';
  old.verifiedAt = coordinate.verifiedAt || verificationDate;
  old.confidence = Math.max(Number(old.confidence || 0), Number(coordinate.confidence || 0));
  if (!hadPrecisePoint) enriched += 1;
  console.log(`${coordinate.name}: explicit public coordinate -> ${coordinate.location.lng},${coordinate.location.lat}`);
}

// Two source-table names refer to the Shanghai Hua Hong operating company;
// preserve separate labels but use the same official operating address.
const huaHong = byName.get(normalize('华虹公司'));
if (huaHong && !byName.has(normalize('华虹半导体'))) {
  byName.set(normalize('华虹半导体'), { ...huaHong, name: '华虹半导体' });
}

for (const record of byName.values()) {
  if (!record.address) continue;
  const inferred = inferRegion(record.address);
  record.region = {
    province: inferred.province || record.region?.province || '',
    city: inferred.city || record.region?.city || '',
    district: inferred.district || record.region?.district || '',
    street: inferred.street || record.region?.street || '',
  };
}

const records = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
fs.writeFileSync(outputPath, JSON.stringify({
  version: verificationDate,
  coordinateSystem: 'WGS84/CGCS2000-compatible',
  coordinateNote: '坐标由一次性离线研究固化：以天地图地址解析为主，并纳入有公开来源明确给出坐标的企业 POI/项目坐标；GCJ-02 已在研究阶段转换为 WGS84。运行时不请求地理编码服务。',
  records,
}, null, 2));
console.log(JSON.stringify({ enriched, records: records.length, outputPath }, null, 2));
