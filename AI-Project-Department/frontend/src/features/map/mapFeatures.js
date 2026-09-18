import { chainGroupFor } from '../../chainPalette';
import { BANK_RELATION_LABELS } from '../company/bankRelations';
import { normalize } from '../../shared/text';
import { isListedCompany } from './mapTags';

export const pointKey = (point) =>
  point ? `${Number(point.lng).toFixed(6)},${Number(point.lat).toFixed(6)}` : '';

function mapLabelFor(name) {
  return String(name || '')
    .replaceAll('（', '(')
    .replaceAll('）', ')');
}

export function companyToFeature(company, point = company.location, bankRelation = 'none') {
  if (!point) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(point.lng), Number(point.lat)] },
    properties: {
      id: company.id,
      name: company.name,
      // Keep the source name intact for selection and detail panels. MapLibre's
      // line breaking renders full-width parentheses inconsistently in labels,
      // so the map gets a display-only ASCII-punctuation variant.
      mapLabel: mapLabelFor(company.name),
      listed: isListedCompany(company),
      chain: company.chain,
      // 二级链 id 只在本一级链内唯一，必须带上一級链才能取到正确配色。
      chainGroup: chainGroupFor(company.chain, company.primaryIndustry),
      sector: company.sector,
      locationStatus: company.locationStatus || '已复核',
      bankRelation,
      bankRelationLabel: BANK_RELATION_LABELS[bankRelation] || BANK_RELATION_LABELS.none,
      selected: false,
    },
  };
}

export function relationFeature(from, to, relation) {
  if (!from?.location || !to?.location) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [from.location.lng, from.location.lat],
        [to.location.lng, to.location.lat],
      ],
    },
    properties: {
      id: relation.id,
      from: relation.from,
      to: relation.to,
      relationType: relation.relationType,
      depth: relation.depth,
      source: relation.source || '来源待补',
    },
  };
}

export function relationPeer(relation, entityName) {
  return normalize(relation.from) === normalize(entityName) ? relation.to : relation.from;
}

export function relationDirection(relation) {
  if (relation.relationType === '供应')
    return { from: relation.to, to: relation.from, label: '供应商 → 企业' };
  if (relation.relationType === '经销')
    return { from: relation.from, to: relation.to, label: '企业 → 经销商' };
  if (relation.relationType === '股权')
    return { from: relation.to, to: relation.from, label: '股东/投资方 → 企业' };
  return { from: relation.from, to: relation.to, label: '关系方向' };
}
