import fs from 'node:fs';
import path from 'node:path';

// 一次性兜底：产业链调研分片（储能/算力/医药）里大量企业没有 location，
// 地图上完全没有点位，搜索/筛选看起来"不生效"。
// 本脚本用阿里 DataV GeoAtlas 的省/市中心点做城市级兜底落点：
//   - 优先用 region.city 的市级中心，城市缺失或为「—」时退回省级中心；
//   - 同城企业按企业名 hash 做小幅确定性抖动，避免全部叠在同一点；
//   - locationStatus 标「区域参考」，precision 标「城市级（区域质心）」，
//     与真实门牌级落点区分，后续拿到高德 key 可用 research-amap-geocode 精化。
// 已有 location 的企业一律不动。运行前自动写 .bak-citycentroid 备份。

const root = process.cwd(); // frontend/
const shardFiles = [
  'public/data/industries/companies-storage.json',
  'public/data/industries/companies-compute.json',
  'public/data/industries/companies-biomed.json',
];

const DIRECT_MUNICIPALITIES = new Set(['北京市', '上海市', '天津市', '重庆市']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function buildCenterTable() {
  const country = await fetchJson('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json');
  const centers = new Map(); // key: 名称（带市/不带市都存）
  const put = (name, center) => {
    if (!name || !center) return;
    centers.set(name, center);
    if (name.endsWith('市')) centers.set(name.slice(0, -1), center);
    else centers.set(`${name}市`, center);
  };
  const provinces = country.features.filter(
    (f) => f.properties?.name && f.properties?.center && f.properties?.adcode,
  );
  for (const prov of provinces) {
    put(prov.properties.name, prov.properties.center);
  }
  // 直辖市的 city 记为「上海市」这类省级名，直接用省中心，无需拉市级
  const municipalityCodes = new Set(['110000', '120000', '310000', '500000']);
  for (const prov of provinces) {
    const { adcode, name } = prov.properties;
    if (municipalityCodes.has(String(adcode))) continue;
    await sleep(120);
    let cityGeo;
    try {
      cityGeo = await fetchJson(`https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`);
    } catch (error) {
      console.warn(`skip ${name}: ${error.message}`);
      continue;
    }
    for (const city of cityGeo.features) {
      put(city.properties?.name, city.properties?.center);
    }
    console.log(`loaded ${name}: ${cityGeo.features.length} cities`);
  }
  return centers;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function jitter(center, name) {
  const h = hashCode(String(name || ''));
  const dLng = ((h % 1000) / 1000 - 0.5) * 0.24; // 约 ±13km
  const dLat = (((h >> 10) % 1000) / 1000 - 0.5) * 0.24;
  return [Number((center[0] + dLng).toFixed(6)), Number((center[1] + dLat).toFixed(6))];
}

function patchShard(file, centers, stats) {
  const abs = path.join(root, file);
  const shard = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!fs.existsSync(`${abs}.bak-citycentroid`)) {
    fs.writeFileSync(`${abs}.bak-citycentroid`, fs.readFileSync(abs));
  }
  // 名称/地址地名匹配表：长名优先，避免「南京」命中「南京xx」之外的误配
  const placeNames = Array.from(centers.keys()).sort((a, b) => b.length - a.length);
  const regionFromText = (value) => {
    const text = String(value || '');
    if (!text) return null;
    const hit = placeNames.find(
      (name) =>
        text.includes(name) ||
        text.includes(name.replace(/省|市|自治区|特别行政区$/g, '')),
    );
    return hit ? centers.get(hit) : null;
  };
  let added = 0;
  let skipped = 0;
  for (const company of shard.companies) {
    if (company.location && company.location.lng != null && company.location.lat != null) {
      skipped += 1;
      continue; // 已有真实落点，不动
    }
    const region = company.region || {};
    let center = null;
    let level = '';
    const city = String(region.city || '').trim();
    const province = String(region.province || '').trim();
    if (city && city !== '—' && centers.has(city)) {
      center = centers.get(city);
      level = '城市';
    } else if (province && province !== '—' && centers.has(province)) {
      center = centers.get(province);
      level = '省级';
    } else {
      // 兜底第二遍：从企业名 / 地址里抠地名（如「晶晨半导体(上海)」→上海）
      center = regionFromText(company.name) || regionFromText(company.address);
      level = '名称推断';
    }
    if (!center) {
      stats.noRegion.push(`${company.name}(${province}/${city})`);
      continue;
    }
    const [lng, lat] = jitter(center, company.name);
    company.location = {
      lng,
      lat,
      coordinateSystem: 'GCJ-02',
      precision: `城市级（区域质心·${level}）`,
      source: 'city-centroid-fallback',
    };
    company.locationStatus = '区域参考';
    if (!company.locationSource) company.locationSource = '城市质心兜底（DataV GeoAtlas）';
    added += 1;
  }
  // 重算 location 相关 counts
  const c = shard.counts;
  if (c) {
    const statuses = shard.companies.reduce((m, x) => {
      m[x.locationStatus || '待补'] = (m[x.locationStatus || '待补'] || 0) + 1;
      return m;
    }, {});
    c.verifiedLocation = statuses['已核实'] || 0;
    c.candidateLocation = statuses['候选'] || 0;
    c.regionReferenceLocation = statuses['区域参考'] || 0;
    c.pendingLocation = statuses['待补'] || 0;
  }
  fs.writeFileSync(abs, JSON.stringify(shard, null, 1), 'utf8');
  console.log(
    `${path.basename(file)}: total ${shard.companies.length}, existing ${skipped}, added ${added}, noRegion ${stats.noRegion.length ? stats.noRegion.length : 0}`,
  );
  return { added, skipped };
}

const centers = await buildCenterTable();
console.log('center table size:', centers.size);
const stats = { noRegion: [] };
for (const file of shardFiles) {
  patchShard(file, centers, stats);
}
if (stats.noRegion.length) {
  console.log('no-region samples:', stats.noRegion.slice(0, 10).join(' | '));
}
console.log('done');
