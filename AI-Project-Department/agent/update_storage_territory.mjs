// 储能链属地/客户池统计补丁：每次 rebuild + 关系入链之后运行，按当前 companies
// 重算 storage-chain.json 的 territory（上市口径）/ customerTerritory / customerStats 与相关文案。
import fs from 'node:fs';

const p = 'frontend/public/data/industries/storage-chain.json';
const chain = JSON.parse(fs.readFileSync(p, 'utf8'));
const companies = chain.companies;

const listed = companies.filter((c) => c.companyType === 'listed');
const others = companies.filter((c) => c.companyType !== 'listed');

const provOf = (c) => c.region?.province || '';
const cityOf = (c) => c.region?.city || '';

function agg(items) {
  const provinces = new Map();
  const cities = new Map();
  let withDistrict = 0;
  let offshore = [];
  for (const c of items) {
    const prov = provOf(c);
    const city = cityOf(c);
    if (!prov || prov === '—' || /香港|开曼|境外/.test(prov)) {
      offshore.push(c.name);
      continue;
    }
    provinces.set(prov, (provinces.get(prov) || 0) + 1);
    if (city && city !== '—') cities.set(city, (cities.get(city) || 0) + 1);
    if (c.region?.district && c.region.district !== '—') withDistrict += 1;
  }
  const sortTop = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }));
  return {
    provinces,
    cities,
    withDistrict,
    offshore,
    topProvinces: sortTop(provinces, 15),
    topCities: sortTop(cities, 15),
  };
}

const t = agg(listed);
chain.territory = {
  total: listed.length,
  provinces: t.provinces.size,
  cities: t.cities.size,
  withDistrict: t.withDistrict,
  withStreet: 0,
  withPark: 0,
  offshore: t.offshore.length,
  topProvinces: t.topProvinces,
  topCities: t.topCities,
  offshoreList: t.offshore.slice(0, 10).map((name) => ({ name })),
};

const all = agg(companies);
const allProv = new Map();
const allCity = new Map();
for (const c of companies) {
  const prov = provOf(c);
  const city = cityOf(c);
  if (!prov || prov === '—' || /香港|开曼|境外/.test(prov)) continue;
  const isListed = c.companyType === 'listed';
  const pv = allProv.get(prov) || { k: prov, listed: 0, other: 0 };
  if (isListed) pv.listed += 1; else pv.other += 1;
  allProv.set(prov, pv);
  if (city && city !== '—') {
    const cv = allCity.get(city) || { k: city, listed: 0, other: 0 };
    if (isListed) cv.listed += 1; else cv.other += 1;
    allCity.set(city, cv);
  }
}
chain.customerTerritory = {
  listed: listed.length,
  other: others.length,
  total: companies.length,
  provinces: allProv.size,
  cities: allCity.size,
  topProvinces: [...allProv.values()].sort((a, b) => b.listed + b.other - (a.listed + a.other)).slice(0, 15),
  topCities: [...allCity.values()].sort((a, b) => b.listed + b.other - (a.listed + a.other)).slice(0, 15),
};

const bySource = new Map();
const byKey = new Map();
for (const c of others) {
  const src = (c.companySource || '').includes('补充') ? '补充客户清单（新增）' : '1,977 户原清单';
  bySource.set(src, (bySource.get(src) || 0) + 1);
  const key = c.keyStatus === 'verified' ? '已核验信用代码' : '缺码（名称占位）';
  byKey.set(key, (byKey.get(key) || 0) + 1);
}
const realLoc = others.filter((c) => c.location?.lng).length;
const regionRef = others.filter((c) => c.locationStatus === '区域参考').length;
chain.customerStats = {
  listed: listed.length,
  other: others.length,
  total: companies.length,
  otherRealLocation: realLoc,
  otherRegionReference: regionRef,
  otherUnplaced: others.length - realLoc - regionRef,
  otherBySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v })),
  otherByKeyStatus: [...byKey.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v })),
  officialCodeMismatch: [],
};

chain.territoryNote =
  '属地以主表「属地(省/市/区县)」为准（来源：工商注册地址与年报办公地址）。区县为空的多为「园区 / 开发区 / 道路」型注册地，非解析失败；港交所离岸注册主体单列，不入国内分布。';
chain.otherNote =
  '非上市主体与上市企业同套 24 个二级环节编码入链（合计 ' +
  companies.length.toLocaleString() +
  ' 家）。图谱/周报的企业明细以上市企业（' +
  listed.length +
  ' 家）为主，非上市主体在「全部企业」范围与地图上出现；统一社会信用代码为唯一主键，缺码主体按名称哈希占位。';
chain.externalNote =
  '关系边只画两端都在链内主体之内的情况；被链内企业点名但不在当前在链主体之列的交易对手单列为链外关键配套（' +
  (chain.stats.externalMentions || 0).toLocaleString() +
  ' 个），在企业详情页按需展示，不进入链上关系图。';

fs.writeFileSync(p, JSON.stringify(chain));
console.log('territory:', chain.territory.total, 'provinces', chain.territory.provinces);
console.log('customerTerritory:', chain.customerTerritory.total);
console.log('customerStats:', JSON.stringify(chain.customerStats.otherBySource), JSON.stringify(chain.customerStats.otherByKeyStatus));
