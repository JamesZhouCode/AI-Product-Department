import { layers, namedFlavor } from '@protomaps/basemaps';
import { fallbackShapes, fallbackStreetGrid } from './mapShapes';
import { ALL_CHAIN_COLOR_STOPS } from './chainPalette';
import { publicUrl } from './shared/publicPaths';
import { MAP_LAYER_IDS, MAP_SOURCE_IDS } from './features/map/mapLayers';

const MAP_WATER_COLOR = '#74d4dd';
const OVERVIEW_SOURCE_MAX_ZOOM = import.meta.env.VITE_DEMO === 'true' ? 9 : 10;

const chainColorExpression = ['match', ['get', 'chainGroup'], ...ALL_CHAIN_COLOR_STOPS, '#647f96'];
const circleCompanyFilter = [
  'all',
  ['!', ['has', 'point_count']],
  ['!', ['get', 'overlapMember']],
  ['any', ['==', ['get', 'bankRelation'], 'none'], ['==', ['get', 'bankRelation'], 'contacted']],
];
const bankCompanyFilter = [
  'all',
  ['!', ['has', 'point_count']],
  ['!', ['get', 'overlapMember']],
  ['any', ['==', ['get', 'bankRelation'], 'customer'], ['==', ['get', 'bankRelation'], 'credit']],
];
const contactedCompanyFilter = [
  'all',
  ['!', ['has', 'point_count']],
  ['!', ['get', 'overlapMember']],
  ['==', ['get', 'bankRelation'], 'contacted'],
];
const creditCompanyFilter = [
  'all',
  ['!', ['has', 'point_count']],
  ['!', ['get', 'overlapMember']],
  ['==', ['get', 'bankRelation'], 'credit'],
];

const normalizeBasemapFonts = (value) => {
  if (value === 'Noto Sans Devanagari Regular v1') return 'Noto Sans Regular';
  if (Array.isArray(value)) return value.map(normalizeBasemapFonts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, normalizeBasemapFonts(childValue)]),
    );
  }
  return value;
};

const cloneLayers = (sourceId, prefix, minzoom, maxzoom) =>
  layers(sourceId, namedFlavor('light'), { lang: 'zh' }).map((layer) => ({
    ...layer,
    // The offline bundle ships the Noto Sans subsets only. Normalize both
    // direct layout fonts and formatted-text font expressions from Protomaps.
    ...(layer.layout ? { layout: normalizeBasemapFonts(layer.layout) } : {}),
    id: `${prefix}-${layer.id}`,
    ...(layer.type === 'background'
      ? { paint: { ...layer.paint, 'background-color': MAP_WATER_COLOR } }
      : {}),
    ...(minzoom === undefined ? {} : { minzoom: Math.max(layer.minzoom || 0, minzoom) }),
    ...(maxzoom === undefined ? {} : { maxzoom: Math.min(layer.maxzoom ?? 24, maxzoom) }),
  }));

export function buildMapStyle(hasBasemap) {
  const publicRoot = publicUrl('');
  const base = {
    version: 8,
    glyphs: `${publicRoot}assets/fonts/{fontstack}/{range}.pbf`,
    ...(hasBasemap ? { sprite: `${publicRoot}assets/sprites/v4/light` } : {}),
    sources: {
      [MAP_SOURCE_IDS.fallback]: { type: 'geojson', data: fallbackShapes },
      [MAP_SOURCE_IDS.streetGrid]: { type: 'geojson', data: fallbackStreetGrid },
      [MAP_SOURCE_IDS.chinaBoundaries]: {
        type: 'geojson',
        data: `${publicRoot}data/china-provinces.geojson`,
      },
      [MAP_SOURCE_IDS.shanghaiDistricts]: {
        type: 'geojson',
        data: `${publicRoot}data/shanghai-districts.geojson`,
      },
      // Keep overview clusters only below the street-detail threshold. At z10+
      // every mapped company feature is rendered individually.
      [MAP_SOURCE_IDS.companies]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 9,
        clusterRadius: 42,
      },
      [MAP_SOURCE_IDS.companyOverlaps]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      },
      [MAP_SOURCE_IDS.relations]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      },
    },
    layers: [
      {
        id: MAP_LAYER_IDS.background,
        type: 'background',
        paint: { 'background-color': MAP_WATER_COLOR },
      },
      {
        id: MAP_LAYER_IDS.chinaProvinceFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.chinaBoundaries,
        paint: { 'fill-color': '#f4f7f3', 'fill-opacity': hasBasemap ? 0 : 0.96 },
      },
      {
        id: MAP_LAYER_IDS.chinaProvinceLine,
        type: 'line',
        source: MAP_SOURCE_IDS.chinaBoundaries,
        paint: {
          'line-color': '#8fb4c8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 7, 1, 11, 1.5],
          'line-opacity': hasBasemap ? 0 : 0.78,
        },
      },
      {
        id: MAP_LAYER_IDS.shanghaiDistrictFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.shanghaiDistricts,
        minzoom: 7,
        filter: ['==', ['get', 'name'], '__none__'],
        paint: { 'fill-color': '#1769e0', 'fill-opacity': 0.09 },
      },
      {
        id: MAP_LAYER_IDS.shanghaiDistrictLine,
        type: 'line',
        source: MAP_SOURCE_IDS.shanghaiDistricts,
        minzoom: 7,
        paint: {
          'line-color': '#3589d8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.75, 13, 1.7],
          'line-opacity': 0.6,
        },
      },
      {
        id: MAP_LAYER_IDS.fallbackChina,
        type: 'fill',
        source: MAP_SOURCE_IDS.fallback,
        filter: ['==', ['get', 'kind'], 'china'],
        paint: { 'fill-color': '#f4f7f3', 'fill-opacity': hasBasemap ? 0 : 0.96 },
      },
      {
        id: MAP_LAYER_IDS.fallbackChinaLine,
        type: 'line',
        source: MAP_SOURCE_IDS.fallback,
        filter: ['==', ['get', 'kind'], 'china'],
        paint: {
          'line-color': '#8fb4c8',
          'line-width': 1.15,
          'line-opacity': hasBasemap ? 0 : 0.78,
        },
      },
      {
        id: MAP_LAYER_IDS.fallbackShanghai,
        type: 'fill',
        source: MAP_SOURCE_IDS.fallback,
        filter: ['==', ['get', 'kind'], 'shanghai'],
        paint: { 'fill-color': '#dfefff', 'fill-opacity': hasBasemap ? 0 : 0.92 },
      },
      {
        id: MAP_LAYER_IDS.fallbackShanghaiLine,
        type: 'line',
        source: MAP_SOURCE_IDS.fallback,
        filter: ['==', ['get', 'kind'], 'shanghai'],
        paint: {
          'line-color': '#1769e0',
          'line-width': 2,
          'line-opacity': hasBasemap ? 0 : 0.76,
        },
      },
      {
        id: MAP_LAYER_IDS.fallbackStreetGrid,
        type: 'line',
        source: MAP_SOURCE_IDS.streetGrid,
        minzoom: 5,
        paint: {
          'line-color': '#9cb6c6',
          'line-width': 0.75,
          'line-opacity': hasBasemap ? 0 : 0.32,
        },
      },
      {
        id: MAP_LAYER_IDS.relationLines,
        type: 'line',
        source: MAP_SOURCE_IDS.relations,
        paint: {
          'line-color': [
            'match',
            ['get', 'relationType'],
            '供应',
            '#1769e0',
            '经销',
            '#ed861d',
            '股权',
            '#9651c7',
            '#71869a',
          ],
          'line-width': 2.1,
          'line-opacity': 0.86,
          'line-dasharray': [1.5, 1.5],
        },
      },
      {
        id: MAP_LAYER_IDS.companyClusters,
        type: 'circle',
        source: MAP_SOURCE_IDS.companies,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#e4f5f4',
          'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 80, 23, 250, 28],
          'circle-opacity': 0.94,
          'circle-stroke-color': '#0b918e',
          'circle-stroke-width': 1.8,
        },
      },
      {
        id: MAP_LAYER_IDS.companyClusterCount,
        type: 'symbol',
        source: MAP_SOURCE_IDS.companies,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 10,
          'text-font': ['Noto Sans Medium'],
        },
        paint: { 'text-color': '#075c5b', 'text-halo-color': '#ffffff', 'text-halo-width': 0.8 },
      },
      {
        id: MAP_LAYER_IDS.companyHalo,
        type: 'circle',
        source: MAP_SOURCE_IDS.companies,
        filter: circleCompanyFilter,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 18, 8],
          'circle-color': [
            'case',
            ['boolean', ['get', 'selected'], false],
            chainColorExpression,
            '#0c9b91',
          ],
          'circle-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.16, 0.12],
          'circle-stroke-width': 0,
        },
      },
      {
        id: MAP_LAYER_IDS.companySelectedRing,
        type: 'circle',
        source: MAP_SOURCE_IDS.companies,
        filter: ['all', ...circleCompanyFilter.slice(1), ['==', ['get', 'selected'], true]],
        paint: {
          'circle-radius': 13,
          'circle-color': 'rgba(255,255,255,0)',
          'circle-stroke-color': chainColorExpression,
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.9,
        },
      },
      {
        id: MAP_LAYER_IDS.companyPoints,
        type: 'circle',
        source: MAP_SOURCE_IDS.companies,
        filter: circleCompanyFilter,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 7, 5],
          'circle-color': chainColorExpression,
          'circle-opacity': 1,
          'circle-stroke-color': [
            'case',
            ['boolean', ['get', 'selected'], false],
            chainColorExpression,
            '#ffffff',
          ],
          'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 2.5, 1.8],
        },
      },
      {
        id: MAP_LAYER_IDS.contactedCompanyCheck,
        type: 'symbol',
        source: MAP_SOURCE_IDS.companies,
        minzoom: 5,
        filter: contactedCompanyFilter,
        layout: {
          'icon-image': 'contacted-check',
          'icon-size': ['case', ['boolean', ['get', 'selected'], false], 0.9, 0.78],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['case', ['boolean', ['get', 'selected'], false], 3, 2],
        },
        paint: { 'icon-color': '#ffffff', 'icon-opacity': 1 },
      },
      {
        id: MAP_LAYER_IDS.bankCompanySymbol,
        type: 'symbol',
        source: MAP_SOURCE_IDS.companies,
        minzoom: 5,
        filter: bankCompanyFilter,
        layout: {
          'icon-image': 'bank-badge',
          'icon-size': ['case', ['boolean', ['get', 'selected'], false], 0.98, 0.78],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['case', ['boolean', ['get', 'selected'], false], 2, 1],
        },
        paint: {
          'icon-color': chainColorExpression,
          'icon-halo-color': [
            'case',
            ['boolean', ['get', 'selected'], false],
            chainColorExpression,
            '#ffffff',
          ],
          'icon-halo-width': ['case', ['boolean', ['get', 'selected'], false], 1.4, 1],
          'icon-halo-blur': 0.1,
          'icon-opacity': 1,
        },
      },
      {
        id: MAP_LAYER_IDS.bankCreditBadge,
        type: 'symbol',
        source: MAP_SOURCE_IDS.companies,
        minzoom: 5,
        filter: creditCompanyFilter,
        layout: {
          'icon-image': 'credit-shield',
          'icon-size': ['case', ['boolean', ['get', 'selected'], false], 0.96, 0.82],
          'icon-offset': [8, -8],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': '#d39b2b',
          'icon-halo-color': '#ffffff',
          'icon-halo-width': 1.15,
          'icon-halo-blur': 0.1,
          'icon-opacity': 0.98,
        },
      },
      {
        id: MAP_LAYER_IDS.companyLabel,
        type: 'symbol',
        source: MAP_SOURCE_IDS.companies,
        minzoom: 5,
        filter: ['all', ['!', ['has', 'point_count']], ['!', ['get', 'overlapMember']]],
        layout: {
          'text-field': ['get', 'mapLabel'],
          'text-size': 11,
          'text-font': ['Noto Sans Medium'],
          'text-offset': [0, 1.15],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#21394f',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.7,
          'text-halo-blur': 0.25,
        },
      },
      {
        id: MAP_LAYER_IDS.companyOverlapHalo,
        type: 'circle',
        source: MAP_SOURCE_IDS.companyOverlaps,
        // 必须与 companyClusters 的 clusterMaxZoom(9) 衔接：z>9 聚合已失效，
        // 而 companyPoints 等图层用 ['!', ['get','overlapMember']] 排除了同坐标企业，
        // 此处若设 14，z10–13 就没有任何图层渲染这些点（整段空白带）。
        // 取 9（而非 10）是为了不留 z9.01–9.99 的缝隙：clusterMaxZoom 是浮点比较，
        // z=9 恰好也在其中，仅在该点会与聚合圈短暂共存，可忽略。
        minzoom: 9,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 20, 16],
          'circle-color': '#ef9026',
          'circle-opacity': 0.16,
          'circle-stroke-width': 0,
        },
      },
      {
        id: MAP_LAYER_IDS.companyOverlaps,
        type: 'circle',
        source: MAP_SOURCE_IDS.companyOverlaps,
        minzoom: 9,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 11, 9],
          'circle-color': '#f5a038',
          'circle-opacity': 0.98,
          'circle-stroke-color': [
            'case',
            ['boolean', ['get', 'selected'], false],
            '#b8650f',
            '#ffffff',
          ],
          'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 2.4, 1.8],
        },
      },
      {
        id: MAP_LAYER_IDS.companyOverlapCount,
        type: 'symbol',
        source: MAP_SOURCE_IDS.companyOverlaps,
        minzoom: 9,
        layout: {
          'text-field': ['get', 'count'],
          'text-size': 10,
          'text-font': ['Noto Sans Medium'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#5b340a', 'text-halo-color': '#fff4df', 'text-halo-width': 0.4 },
      },
    ],
  };

  if (!hasBasemap) return base;

  // Keep the nationwide and Shanghai archives as separate sources so
  // MapLibre can overzoom each archive using its own native zoom range.
  base.sources[MAP_SOURCE_IDS.baseOverview] = {
    type: 'vector',
    url: 'icpmtiles:///map/china-overview',
    minzoom: 0,
    maxzoom: OVERVIEW_SOURCE_MAX_ZOOM,
    attribution: '© Protomaps © OpenStreetMap contributors',
  };
  base.sources[MAP_SOURCE_IDS.baseDetail] = {
    type: 'vector',
    url: 'icpmtiles:///map/shanghai-detail',
    // The offline detail archive includes a small z9-z10 Shanghai context
    // extract so the map stays legible before street-level tiles take over.
    minzoom: 9,
    maxzoom: 15,
    attribution: '© Protomaps © OpenStreetMap contributors',
  };
  const detailLayers = cloneLayers(MAP_SOURCE_IDS.baseDetail, 'basemap-detail').filter(
    (layer) => layer.type !== 'background',
  );
  base.layers.splice(
    1,
    0,
    ...cloneLayers(MAP_SOURCE_IDS.baseOverview, 'basemap-overview'),
    ...detailLayers,
  );
  return base;
}
