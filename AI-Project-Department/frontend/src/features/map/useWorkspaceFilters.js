import { useCallback, useState } from 'react';
import { DIRECT_MUNICIPALITIES, useMapFilterData } from './useMapFilterData';

const INITIAL_FILTERS = {
  search: '',
  tag: [],
  province: '',
  city: '',
  district: '',
  mode: 'all',
};

export function useWorkspaceFilters({ activeIndustry, data, onClearSelection, shanghaiDistricts }) {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const filterData = useMapFilterData({ activeIndustry, data, filters, shanghaiDistricts });

  const onSearchChange = useCallback((search) => {
    setFilters((current) => ({ ...current, search }));
  }, []);
  const onTagChange = useCallback(
    (tag) => {
      setFilters((current) => ({
        ...current,
        tag: current.tag.includes(tag)
          ? current.tag.filter((item) => item !== tag)
          : [...current.tag, tag],
      }));
      onClearSelection();
    },
    [onClearSelection],
  );
  const onModeChange = useCallback(
    (mode) => {
      setFilters((current) => ({ ...current, mode }));
      onClearSelection();
    },
    [onClearSelection],
  );
  const onProvinceChange = useCallback((province) => {
    setFilters((current) => ({
      ...current,
      province,
      city: DIRECT_MUNICIPALITIES.has(province) ? province : '',
      district: '',
    }));
  }, []);
  const onCityChange = useCallback((city) => {
    setFilters((current) => ({ ...current, city, district: '' }));
  }, []);
  const onDistrictChange = useCallback((district) => {
    setFilters((current) => ({ ...current, district }));
  }, []);
  const setRegion = useCallback((region) => {
    setFilters((current) => ({ ...current, ...region }));
  }, []);
  const clearFilters = useCallback(() => {
    setFilters((current) => ({
      ...current,
      search: '',
      tag: [],
      province: '',
      city: '',
      district: '',
    }));
  }, []);
  const resetChainFilters = useCallback(() => {
    setFilters((current) => ({ ...current, search: '', tag: [] }));
  }, []);

  const activeFilterCount =
    [filters.search, filters.province, filters.city, filters.district].filter(Boolean).length +
    filters.tag.length;

  return {
    ...filterData,
    activeFilterCount,
    clearFilters,
    filters,
    onCityChange,
    onDistrictChange,
    onModeChange,
    onProvinceChange,
    onSearchChange,
    onTagChange,
    resetChainFilters,
    setRegion,
  };
}
