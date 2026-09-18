import { useCallback, useState } from 'react';
import { useMapController } from './useMapController';
import { useMapFeatureData } from './useMapFeatureData';
import { useMapSelectionData } from './useMapSelectionData';
import { useSelectionGuards, useWorkspaceSelection } from './useWorkspaceSelection';
import { useWorkspaceCompanyActions } from './useWorkspaceCompanyActions';
import { useWorkspaceFilters } from './useWorkspaceFilters';
import { useWorkspaceFullscreen } from './useWorkspaceFullscreen';

export function useMapWorkspace({
  activeTab,
  activeIndustry,
  bankRelationOverrides,
  data,
  marketingRecords,
  onIndustryChange,
  setBankRelationOverrides,
  setMarketingRecords,
  shanghaiDistricts,
  updateCompanyTags,
}) {
  const [importNotice, setImportNotice] = useState('');
  const selection = useWorkspaceSelection();
  const clearSelection = selection.clearSelection;
  const fullscreen = useWorkspaceFullscreen(clearSelection);
  const filters = useWorkspaceFilters({
    activeIndustry,
    data,
    onClearSelection: clearSelection,
    shanghaiDistricts,
  });
  const setRegion = filters.setRegion;
  const resetChainFilters = filters.resetChainFilters;
  const selectionData = useMapSelectionData({
    data,
    industry: activeIndustry,
    mode: filters.filters.mode,
    regionCompanyNames: filters.regionCompanyNames,
    regionFilterActive: filters.regionFilterActive,
    selectedName: selection.selectedName,
  });
  const featureData = useMapFeatureData({
    bankRelationOverrides,
    relatedCompanies: selectionData.relatedCompanies,
    selectedEntity: selectionData.selectedEntity,
    selectedName: selection.selectedName,
    visibleCompanies: filters.visibleCompanies,
  });

  useSelectionGuards({
    activeRelation: selection.activeRelation,
    clearSelection: selection.clearSelection,
    regionCompanyNames: filters.regionCompanyNames,
    regionFilterActive: filters.regionFilterActive,
    relationsForSelected: selectionData.relationsForSelected,
    selectedName: selection.selectedName,
    setActiveRelation: selection.setActiveRelation,
  });

  const mapController = useMapController({
    activeTab,
    isMapFullscreen: fullscreen.isMapFullscreen,
    districtName: filters.filters.district,
    shanghaiDistricts,
    data,
    visibleFeatures: featureData.visibleFeatures,
    overlapFeatures: featureData.overlapFeatures,
    relationsForSelected: selectionData.relationsForSelected,
    setSelectedName: selection.setSelectedName,
    setActiveRelation: selection.setActiveRelation,
    setActiveOverlap: selection.setActiveOverlap,
  });

  const companyActions = useWorkspaceCompanyActions({
    bankRelationOverrides,
    clearSelection: selection.clearSelection,
    data,
    filters: filters.filters,
    mapRef: mapController.mapRef,
    mappedNames: selectionData.mappedNames,
    marketingRecords,
    setActiveOverlap: selection.setActiveOverlap,
    setActiveRelation: selection.setActiveRelation,
    setBankRelationOverrides,
    setMarketingRecords,
    setImportNotice,
    setSelectedName: selection.setSelectedName,
    updateCompanyTags,
  });

  const focusShanghai = useCallback(() => {
    setRegion({ province: '上海市', city: '上海市', district: '' });
    mapController.mapRef.current?.fitBounds(
      [
        [120.82, 30.63],
        [122.15, 31.9],
      ],
      { padding: 64, duration: 700 },
    );
  }, [mapController.mapRef, setRegion]);

  const focusChina = useCallback(() => {
    setRegion({ province: '', city: '', district: '' });
    mapController.mapRef.current?.fitBounds(
      [
        [73, 18],
        [135, 54],
      ],
      { padding: 56, duration: 700 },
    );
  }, [mapController.mapRef, setRegion]);

  const changeIndustry = useCallback(
    (industry) => {
      onIndustryChange?.(industry);
      clearSelection();
      resetChainFilters();
    },
    [clearSelection, onIndustryChange, resetChainFilters],
  );

  return {
    companyDetailPropsFor: companyActions.companyDetailPropsFor,
    changeIndustry,
    filters: filters.filters,
    headerProps: {
      isNationalScope: filters.isNationalScope,
      isShanghaiScope: filters.isShanghaiScope,
      onFocusChina: focusChina,
      onFocusShanghai: focusShanghai,
    },
    importNotice,
    isMapFullscreen: fullscreen.isMapFullscreen,
    mapWorkspaceProps: {
      detailPanelProps: {
        ...companyActions.companyDetailPropsFor(
          selectionData.selectedEntity,
          selectionData.relationsForSelected,
        ),
      },
      filterRailProps: {
        data,
        filters: filters.filters,
        onSearchChange: filters.onSearchChange,
        activeFilterCount: filters.activeFilterCount,
        onClearFilters: filters.clearFilters,
        onModeChange: filters.onModeChange,
        provinceOptions: filters.provinceOptions,
        cityOptions: filters.cityOptions,
        districtOptions: filters.districtOptions,
        isDirectMunicipality: filters.isDirectMunicipality,
        onProvinceChange: filters.onProvinceChange,
        onCityChange: filters.onCityChange,
        onDistrictChange: filters.onDistrictChange,
        onFocusDistrict: mapController.focusDistrict,
        onBankImport: companyActions.handleBankImport,
      },
      mapStageProps: {
        mapContainerRef: mapController.mapContainerRef,
        activeIndustry,
        activeTag: filters.filters.tag,
        onTagChange: filters.onTagChange,
        isMapFullscreen: fullscreen.isMapFullscreen,
        onToggleFullscreen: fullscreen.toggleFullscreen,
        selectedEntity: selectionData.selectedEntity,
        activeRelation: selection.activeRelation,
        onSelectRelation: companyActions.selectRelation,
        onClearRelation: () => selection.setActiveRelation(null),
        activeOverlap: selection.activeOverlap,
        onSelectOverlapCompany: companyActions.selectRelation,
        onClearOverlap: () => selection.setActiveOverlap(null),
        visibleFeatures: featureData.visibleFeatures,
        hasBasemap: mapController.hasBasemap,
      },
    },
  };
}
