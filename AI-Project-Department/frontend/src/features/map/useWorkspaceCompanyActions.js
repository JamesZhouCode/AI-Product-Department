import { useCallback } from 'react';
import { normalize } from '../../shared/text';
import { BANK_RELATION_LABELS, bankRelationFor } from '../company/bankRelations';
import { isListedCompany } from './mapTags';

export function useWorkspaceCompanyActions({
  bankRelationOverrides,
  clearSelection,
  data,
  filters,
  mapRef,
  mappedNames,
  marketingRecords,
  setActiveOverlap,
  setActiveRelation,
  setBankRelationOverrides,
  setMarketingRecords,
  setImportNotice,
  setSelectedName,
  updateCompanyTags,
}) {
  const focusEntity = useCallback(
    (entity) => {
      const point = entity?.location;
      if (!point || !mapRef.current) return;
      mapRef.current.easeTo({
        center: [Number(point.lng), Number(point.lat)],
        zoom: Math.max(8.5, mapRef.current.getZoom()),
        duration: 550,
      });
    },
    [mapRef],
  );

  const selectRelation = useCallback(
    (name) => {
      const entity = data.companies.find((company) => normalize(company.name) === normalize(name));
      if (!entity || (filters.mode === 'listed' && !isListedCompany(entity))) return;
      setActiveRelation(null);
      setActiveOverlap(null);
      setSelectedName(entity.name);
      focusEntity(entity);
    },
    [
      data.companies,
      filters.mode,
      focusEntity,
      setActiveOverlap,
      setActiveRelation,
      setSelectedName,
    ],
  );

  const updateBankRelation = useCallback(
    (name, relation) => {
      if (!name || !BANK_RELATION_LABELS[relation]) return;
      setBankRelationOverrides((current) => ({ ...current, [normalize(name)]: relation }));
    },
    [setBankRelationOverrides],
  );

  const addMarketingRecord = useCallback(
    (name, text) => {
      const value = text.trim();
      if (!name || !value) return;
      const key = normalize(name);
      const record = {
        id: `marketing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: value,
        createdAt: new Date().toISOString(),
      };
      setMarketingRecords((current) => ({
        ...current,
        [key]: [record, ...(Array.isArray(current[key]) ? current[key] : [])],
      }));
    },
    [setMarketingRecords],
  );

  const deleteMarketingRecord = useCallback(
    (name, id) => {
      if (!name || !id) return;
      const key = normalize(name);
      setMarketingRecords((current) => ({
        ...current,
        [key]: (Array.isArray(current[key]) ? current[key] : []).filter(
          (record) => record.id !== id,
        ),
      }));
    },
    [setMarketingRecords],
  );

  const handleBankImport = useCallback(
    async (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      try {
        const module = await import('xlsx');
        const XLSX = module.default || module;
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const keys = new Set(
          rows.map((row) => normalize(row['企业名称'] || row['企业'] || row['公司名称'])),
        );
        setImportNotice(
          `已读取 ${rows.length} 行银行数据，匹配键 ${keys.size} 个；Demo 暂仅预览，不覆盖原始调研表。`,
        );
      } catch (error) {
        setImportNotice(`导入失败：${error.message}`);
      } finally {
        input.value = '';
      }
    },
    [setImportNotice],
  );

  const companyDetailPropsFor = useCallback(
    (entity, relationList = []) => ({
      entity,
      relationList,
      mappedNames,
      bankRelation: entity ? bankRelationFor(entity, bankRelationOverrides) : 'none',
      marketingRecords: entity
        ? Array.isArray(marketingRecords[normalize(entity.name)])
          ? marketingRecords[normalize(entity.name)]
          : []
        : [],
      onBankRelationChange: (relation) => updateBankRelation(entity?.name, relation),
      onAddMarketingRecord: addMarketingRecord,
      onDeleteMarketingRecord: deleteMarketingRecord,
      onSelectRelation: selectRelation,
      onClearSelection: clearSelection,
      onTagsChange: updateCompanyTags,
      total: data.counts.totalCompanies || data.companies.length,
    }),
    [
      addMarketingRecord,
      bankRelationOverrides,
      clearSelection,
      data.companies.length,
      data.counts.totalCompanies,
      deleteMarketingRecord,
      mappedNames,
      marketingRecords,
      selectRelation,
      updateBankRelation,
      updateCompanyTags,
    ],
  );

  return {
    companyDetailPropsFor,
    focusEntity,
    handleBankImport,
    selectRelation,
  };
}
