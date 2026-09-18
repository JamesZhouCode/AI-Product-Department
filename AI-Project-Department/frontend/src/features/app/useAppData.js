import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { publicPath } from '../../shared/publicPaths';
import { normalize } from '../../shared/text';
import { isListedCompany, stripSystemTags } from '../map/mapTags';
import {
  BUILT_IN_INDUSTRY_CATALOG,
  EMPTY_DATA,
  industryEntryFor,
  parseIndustryCatalog,
  parseIndustryData,
} from './industryData';
import { usePersistedCompanyEdits } from './usePersistedCompanyEdits';

export function useAppData(activeIndustry) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [catalogWarning, setCatalogWarning] = useState('');
  // 已加载过的一级链分片常驻内存，来回切换不重复发起请求。
  const industryCacheRef = useRef({});
  const [shanghaiDistricts, setShanghaiDistricts] = useState([]);
  const {
    bankRelationOverrides,
    companyTagOverrides,
    marketingRecords,
    setBankRelationOverrides,
    setCompanyTagOverrides,
    setMarketingRecords,
  } = usePersistedCompanyEdits();

  // 分片目录由 prepare-new-industries 生成，记录每条一级链的数据文件位置。
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(publicPath('data/industries/index.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setCatalog(parseIndustryCatalog(payload));
        setCatalogWarning('');
      })
      .catch((error) => {
        if (cancelled || error.name === 'AbortError') return;
        setCatalog(BUILT_IN_INDUSTRY_CATALOG);
        setCatalogWarning('产业链目录加载失败，已使用内置目录。');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const activeEntry = useMemo(() => {
    return industryEntryFor(catalog, activeIndustry);
  }, [catalog, activeIndustry]);
  const industryOptions = useMemo(
    () =>
      (catalog?.industries?.length ? catalog.industries : BUILT_IN_INDUSTRY_CATALOG).map(
        (entry) => entry.label,
      ),
    [catalog],
  );

  useEffect(() => {
    if (!catalog) return;
    if (!activeEntry) {
      setLoading(false);
      setDataError(`未找到“${activeIndustry}”的数据分片。`);
      return undefined;
    }
    if (industryCacheRef.current[activeEntry.id]) {
      setLoading(false);
      setDataError('');
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setDataError('');
    fetch(publicPath(`data/${activeEntry.file}`), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        industryCacheRef.current[activeEntry.id] = parseIndustryData(payload);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled || error.name === 'AbortError') return;
        setLoading(false);
        setDataError(`“${activeEntry.label}”数据加载失败：${error.message}`);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeEntry, activeIndustry, catalog]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(publicPath('data/shanghai-districts.geojson'), { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { features: [] }))
      .then((payload) => setShanghaiDistricts(payload.features || []))
      .catch((error) => {
        if (error.name !== 'AbortError') setShanghaiDistricts([]);
      });
    return () => controller.abort();
  }, []);

  const data = (activeEntry && industryCacheRef.current[activeEntry.id]) || EMPTY_DATA;

  const resolvedData = useMemo(() => {
    const companies = Object.keys(companyTagOverrides).length
      ? data.companies.map((company) => {
          if (!Object.prototype.hasOwnProperty.call(companyTagOverrides, company.id)) {
            return company;
          }
          const tags = stripSystemTags(companyTagOverrides[company.id]);
          return {
            ...company,
            tags,
            tagStatus: tags.length ? '已编辑' : '已生成',
            tagSource: '本地人工维护',
          };
        })
      : data.companies;
    const listedNames = new Set(
      companies.filter(isListedCompany).map((company) => normalize(company.name)),
    );
    const relations = (data.relations || []).filter(
      (relation) =>
        listedNames.has(normalize(relation.from)) && listedNames.has(normalize(relation.to)),
    );
    return {
      ...data,
      counts: {
        ...data.counts,
        listed: listedNames.size,
        relationCount: relations.length,
      },
      companies,
      relations,
    };
  }, [companyTagOverrides, data]);

  const updateCompanyTags = useCallback(
    (companyId, tags) => {
      if (!companyId) return;
      const nextTags = stripSystemTags(tags).filter(Boolean);
      if (!nextTags.length) return;
      setCompanyTagOverrides((current) => ({ ...current, [companyId]: nextTags }));
    },
    [setCompanyTagOverrides],
  );

  return {
    bankRelationOverrides,
    data: resolvedData,
    dataError,
    dataWarning: catalogWarning,
    industryOptions,
    loading,
    marketingRecords,
    setBankRelationOverrides,
    setMarketingRecords,
    shanghaiDistricts,
    updateCompanyTags,
  };
}
