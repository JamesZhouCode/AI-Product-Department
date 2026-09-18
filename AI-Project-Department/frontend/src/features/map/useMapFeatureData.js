import { useMemo } from 'react';
import { normalize } from '../../shared/text';
import { bankRelationFor } from '../company/bankRelations';
import { companyToFeature, pointKey } from './mapFeatures';

export function useMapFeatureData({
  bankRelationOverrides,
  relatedCompanies,
  selectedEntity,
  selectedName,
  visibleCompanies,
}) {
  const mapCompanies = useMemo(() => {
    const deduped = new Map();
    for (const company of [
      ...visibleCompanies,
      ...(selectedEntity ? [selectedEntity, ...relatedCompanies] : []),
    ]) {
      deduped.set(normalize(company.name), company);
    }
    return Array.from(deduped.values());
  }, [relatedCompanies, selectedEntity, visibleCompanies]);
  const mapFeatureRecords = useMemo(
    () =>
      mapCompanies
        .filter((company) => company.mapDisplay !== false)
        .map((company) => {
          const point = company.location;
          const bankRelation = bankRelationFor(company, bankRelationOverrides);
          const feature = companyToFeature(company, point, bankRelation);
          return feature ? { company, feature, key: pointKey(point) } : null;
        })
        .filter(Boolean),
    [bankRelationOverrides, mapCompanies],
  );
  const overlapGroups = useMemo(() => {
    const groups = new Map();
    for (const record of mapFeatureRecords) {
      if (!record.key) continue;
      if (!groups.has(record.key)) groups.set(record.key, []);
      groups.get(record.key).push(record);
    }
    return Array.from(groups.entries())
      .filter(([, records]) => records.length > 1)
      .map(([key, records]) => ({ key, records }));
  }, [mapFeatureRecords]);
  const overlapFeatures = useMemo(
    () =>
      overlapGroups.map(({ key, records }) => {
        const first = records[0].feature;
        return {
          type: 'Feature',
          geometry: first.geometry,
          properties: {
            id: `overlap-${key}`,
            count: records.length,
            names: records.map(({ company }) => company.name).join('|'),
            selected: records.some(
              ({ company }) => normalize(company.name) === normalize(selectedName),
            ),
          },
        };
      }),
    [overlapGroups, selectedName],
  );
  const visibleFeatures = useMemo(() => {
    const overlapKeys = new Set(overlapGroups.map(({ key }) => key));
    return mapFeatureRecords.map(({ feature, key }) => ({
      ...feature,
      properties: {
        ...feature.properties,
        overlapMember: overlapKeys.has(key),
        overlapKey: overlapKeys.has(key) ? key : '',
        selected: normalize(feature.properties.name) === normalize(selectedName),
      },
    }));
  }, [mapFeatureRecords, overlapGroups, selectedName]);

  return { overlapFeatures, visibleFeatures };
}
