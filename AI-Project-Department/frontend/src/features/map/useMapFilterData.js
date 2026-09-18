import { useMemo } from 'react';
import { industryForCompany, industryGroupFor } from '../../chainPalette';
import { demoPoints } from '../../demoPoints';
import { normalize } from '../../shared/text';
import { isListedCompany, mapTagMatches } from './mapTags';

const CITY_PROVINCE = {
  北京: '北京市',
  上海: '上海市',
  苏州: '江苏省',
  宁波: '浙江省',
  天津: '天津市',
  合肥: '安徽省',
  江阴: '江苏省',
  南通: '江苏省',
  天水: '甘肃省',
  厦门: '福建省',
  武汉: '湖北省',
  深圳: '广东省',
  广州: '广东省',
  西安: '陕西省',
};

export const DIRECT_MUNICIPALITIES = new Set(['北京市', '上海市', '天津市', '重庆市']);
const CITY_PROVINCE_ENTRIES = Object.entries(CITY_PROVINCE).flatMap(([city, province]) => [
  [city, province],
  [`${city}市`, province],
]);
const CITY_PROVINCE_MAP = new Map(CITY_PROVINCE_ENTRIES);
const NON_ADMINISTRATIVE_DISTRICT_PATTERN =
  /工业区|开发区|产业园|工业园|科技园|科技城|经济技术开发区|高新技术产业开发区|化学工业区|保税区|功能区/;

function administrativeDistrictFor(value, province, shanghaiDistrictNames) {
  if (!value) return '';
  if (province === '上海市') {
    const names = Array.from(shanghaiDistrictNames).sort((a, b) => b.length - a.length);
    const directMatch = names.find((name) => value === name || value.includes(name));
    if (directMatch) return directMatch;
    return names.find((name) => value.includes(name.replace(/区$/, ''))) || '';
  }
  if (NON_ADMINISTRATIVE_DISTRICT_PATTERN.test(value)) {
    const prefix = value.slice(0, value.search(NON_ADMINISTRATIVE_DISTRICT_PATTERN));
    return prefix.match(/([\u4e00-\u9fa5]+(?:区|县|旗))$/)?.[1] || '';
  }
  return /(?:区|县|旗)$/.test(value) ? value : '';
}

function sortRegionOptions(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function canonicalCityFor(value, province = '') {
  const city = String(value || '').trim();
  if (!city) return '';
  if (DIRECT_MUNICIPALITIES.has(province)) return province;
  if (CITY_PROVINCE_MAP.has(city)) return city.endsWith('市') ? city : `${city}市`;
  return city;
}

function regionFromText(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = Object.keys(CITY_PROVINCE)
    .sort((a, b) => b.length - a.length)
    .find(
      (city) =>
        text.startsWith(city) ||
        text.includes(`（${city}）`) ||
        text.includes(`(${city})`) ||
        text.includes(`${city}市`),
    );
  if (!match) return null;
  const province = CITY_PROVINCE[match];
  return { province, city: canonicalCityFor(match, province) };
}

function regionForCompany(company, demo, shanghaiDistrictNames) {
  const fromName = regionFromText(company.name);
  const fromAddress = regionFromText(company.address);
  const explicit = company.region || {};
  const city = canonicalCityFor(
    explicit.city || fromName?.city || fromAddress?.city || demo?.city,
    explicit.province || fromName?.province || fromAddress?.province || demo?.province,
  );
  const province =
    explicit.province ||
    fromName?.province ||
    fromAddress?.province ||
    demo?.province ||
    CITY_PROVINCE_MAP.get(city) ||
    '';
  const district =
    explicit.district || fromName?.district || fromAddress?.district || demo?.district || '';
  return {
    name: normalize(company.name),
    province,
    city,
    district: administrativeDistrictFor(district, province, shanghaiDistrictNames),
  };
}

function districtMatches(district, filter) {
  if (!filter) return true;
  return (
    district === filter ||
    (filter.endsWith('区') &&
      district &&
      (district.startsWith(filter) || filter.startsWith(district)))
  );
}

function regionMatches(region, filters, cityFilter) {
  if (filters.province) {
    const matchesProvince = region.province === filters.province;
    const matchesMunicipalityCity =
      DIRECT_MUNICIPALITIES.has(filters.province) && region.city === filters.province;
    if (!matchesProvince && !matchesMunicipalityCity) return false;
  }
  if (cityFilter && region.city !== cityFilter) return false;
  return districtMatches(region.district, filters.district);
}

export function useMapFilterData({ activeIndustry, data, filters, shanghaiDistricts }) {
  const demoByName = useMemo(
    () => new Map(demoPoints.map((point) => [normalize(point.name), point])),
    [],
  );
  const shanghaiDistrictNames = useMemo(
    () => new Set(shanghaiDistricts.map((feature) => feature.properties?.name).filter(Boolean)),
    [shanghaiDistricts],
  );
  const regionRecords = useMemo(
    () =>
      data.companies.map((company) =>
        regionForCompany(
          company,
          demoByName.get(company.normalizedName || normalize(company.name)),
          shanghaiDistrictNames,
        ),
      ),
    [data.companies, demoByName, shanghaiDistrictNames],
  );
  const provinceOptions = useMemo(() => {
    const values = regionRecords.map((region) => region.province);
    // 直辖市（如「上海市」）即便 region.province 没填也要在省下拉里出现，
    // 否则点「上海」按钮后下拉显示空白、且无法手动改选。
    values.push(...DIRECT_MUNICIPALITIES);
    return sortRegionOptions(values);
  }, [regionRecords]);
  const cityOptions = useMemo(
    () =>
      sortRegionOptions(
        regionRecords
          .filter((region) => filters.province && region.province === filters.province)
          .map((region) => region.city),
      ),
    [regionRecords, filters.province],
  );
  const districtOptions = useMemo(() => {
    if (!filters.province) return [];
    const isDirectMunicipality = DIRECT_MUNICIPALITIES.has(filters.province);
    if (!isDirectMunicipality && !filters.city) return [];
    const values = regionRecords
      .filter(
        (region) =>
          region.province === filters.province &&
          (isDirectMunicipality || region.city === filters.city),
      )
      .map((region) => region.district);
    if (filters.province === '上海市') values.push(...shanghaiDistrictNames);
    return sortRegionOptions(values);
  }, [regionRecords, filters.province, filters.city, shanghaiDistrictNames]);
  const regionFilterActive = Boolean(filters.province || filters.city || filters.district);
  const isShanghaiScope =
    filters.province === '上海市' ||
    filters.city === '上海市' ||
    Boolean(
      filters.district &&
      shanghaiDistricts.some((feature) => feature.properties?.name === filters.district),
    );
  const cityFilter = DIRECT_MUNICIPALITIES.has(filters.province) ? '' : filters.city;
  const regionByName = useMemo(
    () => new Map(regionRecords.map((region) => [region.name, region])),
    [regionRecords],
  );
  const regionCompanyNames = useMemo(
    () =>
      new Set(
        regionRecords
          .filter((region) => regionMatches(region, filters, cityFilter))
          .map((region) => region.name),
      ),
    [regionRecords, filters, cityFilter],
  );
  const visibleCompanies = useMemo(() => {
    const query = normalize(filters.search);
    return data.companies.filter((company) => {
      if (filters.mode === 'listed' && !isListedCompany(company)) return false;
      if (
        activeIndustry &&
        industryGroupFor(industryForCompany(company)) !== industryGroupFor(activeIndustry)
      )
        return false;
      if (filters.tag.length && !mapTagMatches(company, filters.tag)) return false;
      const region = regionByName.get(normalize(company.name));
      if (!region || !regionMatches(region, filters, cityFilter)) return false;
      if (
        query &&
        ![company.name, company.sector, company.chain, company.coreTechnology].some((value) =>
          normalize(value).includes(query),
        )
      )
        return false;
      return true;
    });
  }, [activeIndustry, data.companies, filters, cityFilter, regionByName]);

  const isDirectMunicipality = DIRECT_MUNICIPALITIES.has(filters.province);

  return {
    cityOptions,
    districtOptions,
    isDirectMunicipality,
    isNationalScope: !regionFilterActive,
    isShanghaiScope,
    provinceOptions,
    regionCompanyNames,
    regionFilterActive,
    visibleCompanies,
  };
}
