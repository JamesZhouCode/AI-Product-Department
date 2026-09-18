import { useMemo } from 'react';
import { industryForCompany, industryGroupFor } from '../../chainPalette';
import { normalize } from '../../shared/text';
import { isListedCompany } from './mapTags';

export function useMapSelectionData({
  data,
  industry,
  mode,
  regionCompanyNames,
  regionFilterActive,
  selectedName,
}) {
  const selectedEntity = useMemo(() => {
    if (!selectedName) return null;
    const entity =
      data.companies.find((company) => normalize(company.name) === normalize(selectedName)) || null;
    if (!entity) return null;
    const matchesIndustry =
      !industry || industryGroupFor(industryForCompany(entity)) === industryGroupFor(industry);
    const matchesMode = mode !== 'listed' || isListedCompany(entity);
    return matchesIndustry &&
      matchesMode &&
      (!regionFilterActive || regionCompanyNames.has(normalize(entity.name)))
      ? entity
      : null;
  }, [data.companies, industry, mode, regionCompanyNames, regionFilterActive, selectedName]);
  const relationsByEntity = useMemo(() => {
    const index = new Map();
    for (const relation of data.relations) {
      for (const name of [relation.from, relation.to]) {
        const key = normalize(name);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(relation);
      }
    }
    return index;
  }, [data.relations]);
  const companyByName = useMemo(
    () => new Map(data.companies.map((company) => [normalize(company.name), company])),
    [data.companies],
  );
  const relationsForSelected = useMemo(() => {
    if (!selectedEntity) return [];
    let relations = relationsByEntity.get(normalize(selectedEntity.name)) || [];
    if (mode === 'listed') {
      relations = relations.filter(
        (relation) =>
          isListedCompany(companyByName.get(normalize(relation.from))) &&
          isListedCompany(companyByName.get(normalize(relation.to))),
      );
    }
    if (!regionFilterActive) return relations;
    return relations.filter(
      (relation) =>
        regionCompanyNames.has(normalize(relation.from)) &&
        regionCompanyNames.has(normalize(relation.to)),
    );
  }, [
    companyByName,
    mode,
    regionCompanyNames,
    regionFilterActive,
    relationsByEntity,
    selectedEntity,
  ]);
  const mappedNames = useMemo(
    () =>
      new Set(
        data.companies
          .filter((company) => company.location && company.mapDisplay !== false)
          .map((company) => normalize(company.name)),
      ),
    [data.companies],
  );
  const relatedCompanies = useMemo(() => {
    if (!selectedEntity) return [];
    const names = new Set(relationsForSelected.flatMap((relation) => [relation.from, relation.to]));
    names.delete(normalize(selectedEntity.name));
    return Array.from(names)
      .map((name) => companyByName.get(normalize(name)))
      .filter((company) => company && (mode !== 'listed' || isListedCompany(company)));
  }, [companyByName, mode, relationsForSelected, selectedEntity]);

  return { mappedNames, relatedCompanies, relationsForSelected, selectedEntity };
}
