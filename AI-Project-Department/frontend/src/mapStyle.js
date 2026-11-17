import { ALL_CHAIN_COLOR_STOPS } from './chainPalette';
import { publicUrl } from './shared/publicPaths';
import { MAP_LAYER_IDS, MAP_SOURCE_IDS } from './features/map/mapLayers';

// 底图配色：海面蓝 → 邻国陆地浅灰绿 → 中国境内更亮，让业务点更突出。
const MAP_SEA_COLOR = '#d8ecf3';
const MAP_NEIGHBOR_LAND_COLOR = '#e6ece7';
const MAP_CHINA_LAND_COLOR = '#fbfdf9';
const MAP_LAKE_COLOR = '#a3d9e7';
const MAP_LAKE_LINE_COLOR = '#79c2d4';
const MAP_RIVER_COLOR = '#a9d6e5';
const MAP_PROVINCE_LINE_COLOR = '#8fb4c8';

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

// 城市注记按人口分三档，避免低层级堆满名字。
const cityLabelLayers = [
  {
    id: MAP_LAYER_IDS.cityLabelMajor,
    minzoom: 3,
    filter: ['all', ['>=', ['get', 'pop'], 3000000], ['!=', ['get', 'taiwan'], 1]],
    size: 12.5,
    color: '#3d566b',
  },
  {
    id: MAP_LAYER_IDS.cityLabelMedium,
    minzoom: 5,
    filter: ['all', ['>=', ['get', 'pop'], 800000], ['!=', ['get', 'taiwan'], 1]],
    size: 11,
    color: '#557086',
  },
  {
    id: MAP_LAYER_IDS.cityLabelMinor,
    minzoom: 7.2,
    filter: ['all', ['<', ['get', 'pop'], 800000], ['!=', ['get', 'taiwan'], 1]],
    size: 10,
    color: '#6b8398',
  },
  // 台湾岛城市点单独一档：低层级只显示省名「台湾」，放大后才出现城市名。
  {
    id: MAP_LAYER_IDS.cityLabelTaiwan,
    minzoom: 6.2,
    filter: ['==', ['get', 'taiwan'], 1],
    size: 11,
    color: '#557086',
  },
].map((entry) => ({
  id: entry.id,
  type: 'symbol',
  source: MAP_SOURCE_IDS.cities,
  minzoom: entry.minzoom,
  filter: entry.filter,
  layout: {
    'text-field': ['get', 'name'],
    'text-size': entry.size,
    'text-font': ['Noto Sans Regular'],
    'text-anchor': 'top',
    'text-offset': [0, 0.45],
    'text-allow-overlap': false,
    'symbol-sort-key': ['-', ['get', 'pop']],
  },
  paint: {
    'text-color': entry.color,
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.3,
    'text-halo-blur': 0.2,
  },
}));

export function buildMapStyle() {
  const publicRoot = publicUrl('');
  return {
    version: 8,
    glyphs: `${publicRoot}assets/fonts/{fontstack}/{range}.pbf`,
    sources: {
      // 底图三件套全部来自 Natural Earth（公有领域，免署名），由
      // tools/build_ne_basemap.py 裁剪生成，不含任何国界/省界数据。
      [MAP_SOURCE_IDS.land]: { type: 'geojson', data: `${publicRoot}data/basemap/land.geojson` },
      [MAP_SOURCE_IDS.lakes]: { type: 'geojson', data: `${publicRoot}data/basemap/lakes.geojson` },
      [MAP_SOURCE_IDS.rivers]: {
        type: 'geojson',
        data: `${publicRoot}data/basemap/rivers.geojson`,
      },
      [MAP_SOURCE_IDS.cities]: {
        type: 'geojson',
        data: `${publicRoot}data/basemap/cities.geojson`,
      },
      // OSM 全国街道级矢量底图（Planetiler 生成，OpenMapTiles schema）。
      // ODbL 许可：地图角落须显示 © OpenStreetMap contributors。
      // 有意不引入 OSM 的 boundary 与 place(city/state/country) 图层：
      // 境界用国内口径数据、城市标注沿用 cities.geojson（含台湾标注逻辑）。
      [MAP_SOURCE_IDS.osmBasemap]: {
        type: 'vector',
        url: `pmtiles://${publicRoot}map/osm-china.pmtiles`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
      // 国界与省界沿用国内口径数据（含台湾、港澳、南海诸岛）。
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
        paint: { 'background-color': MAP_SEA_COLOR },
      },
      {
        id: MAP_LAYER_IDS.landFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.land,
        paint: { 'fill-color': MAP_NEIGHBOR_LAND_COLOR, 'fill-opacity': 1 },
      },
      {
        id: MAP_LAYER_IDS.chinaProvinceFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.chinaBoundaries,
        paint: { 'fill-color': MAP_CHINA_LAND_COLOR, 'fill-opacity': 1 },
      },
      // OSM 绿地（林地/草地），给陆地加一点生态色。
      {
        id: MAP_LAYER_IDS.osmGreenFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'landcover',
        minzoom: 6,
        filter: ['any', ['==', ['get', 'class'], 'wood'], ['==', ['get', 'class'], 'grass']],
        paint: { 'fill-color': '#e7efdc', 'fill-opacity': 0.6 },
      },
      // OSM 水面（湖、库、宽河道），与 NE 湖泊同色系。
      {
        id: MAP_LAYER_IDS.osmWaterFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'water',
        minzoom: 4,
        filter: ['!=', ['get', 'class'], 'ocean'],
        paint: { 'fill-color': MAP_LAKE_COLOR, 'fill-opacity': 1 },
      },
      // OSM 河流水线（NE 河流覆盖低层级干流，此处补充支流细节）。
      {
        id: MAP_LAYER_IDS.osmWaterwayLine,
        type: 'line',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'waterway',
        minzoom: 6,
        paint: {
          'line-color': MAP_RIVER_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 10, 1.1, 14, 2.4],
        },
      },
      {
        id: MAP_LAYER_IDS.lakeFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.lakes,
        paint: { 'fill-color': MAP_LAKE_COLOR, 'fill-opacity': 1 },
      },
      {
        id: MAP_LAYER_IDS.lakeLine,
        type: 'line',
        source: MAP_SOURCE_IDS.lakes,
        paint: { 'line-color': MAP_LAKE_LINE_COLOR, 'line-width': 0.6 },
      },
      {
        id: MAP_LAYER_IDS.riverLine,
        type: 'line',
        source: MAP_SOURCE_IDS.rivers,
        paint: {
          'line-color': MAP_RIVER_COLOR,
          // 干流粗、支流细：scalerank 越小越主干。
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3,
            ['case', ['<=', ['get', 'rank'], 2], 1.1, 0.5],
            7,
            ['case', ['<=', ['get', 'rank'], 2], 2.4, 1.2],
          ],
        },
      },
      {
        id: MAP_LAYER_IDS.chinaProvinceLine,
        type: 'line',
        source: MAP_SOURCE_IDS.chinaBoundaries,
        paint: {
          'line-color': MAP_PROVINCE_LINE_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 7, 1, 11, 1.5],
          'line-opacity': 0.78,
        },
      },
      // ===== OSM 道路网：先画描边（casing）再画路面，形成常规路网观感 =====
      {
        id: MAP_LAYER_IDS.roadCasingMajor,
        type: 'line',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'transportation',
        minzoom: 5,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
        paint: {
          'line-color': '#c9a54f',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 8, 1.6, 12, 3.4, 15, 6],
        },
      },
      {
        id: MAP_LAYER_IDS.roadFillMajor,
        type: 'line',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'transportation',
        minzoom: 5,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
        paint: {
          'line-color': [
            'match',
            ['get', 'class'],
            'motorway',
            '#e2972f',
            'trunk',
            '#e8b45c',
            '#f3d992',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 1.1, 12, 2.4, 15, 4.6],
        },
      },
      {
        id: MAP_LAYER_IDS.roadCasingMinor,
        type: 'line',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'transportation',
        minzoom: 7.5,
        filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
        paint: {
          'line-color': '#c4bba7',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7.5, 0.5, 10, 1.1, 13, 2.6, 15, 4],
        },
      },
      {
        id: MAP_LAYER_IDS.roadFillMinor,
        type: 'line',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'transportation',
        minzoom: 7.5,
        filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
        paint: {
          'line-color': '#fdf3d0',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7.5, 0.35, 10, 0.8, 13, 2, 15, 3.2],
        },
      },
      // 支路/街巷：街道级细节的主体，z10.5 起逐步显现。
      {
        id: MAP_LAYER_IDS.roadFillService,
        type: 'line',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'transportation',
        minzoom: 10.5,
        filter: ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10.5, 0.35, 13, 1.2, 15, 2.2],
        },
      },
      // 建筑轮廓，z13 起显示街区肌理。
      {
        id: MAP_LAYER_IDS.buildingFill,
        type: 'fill',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': '#e7e2d8', 'fill-opacity': 0.9 },
      },
      // 主干道路名，沿路标注。
      {
        id: MAP_LAYER_IDS.roadNameLabel,
        type: 'symbol',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'transportation_name',
        minzoom: 12.5,
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name:latin']],
          'text-size': 9.5,
          'text-font': ['Noto Sans Regular'],
          'symbol-placement': 'line',
          'text-max-angle': 38,
        },
        paint: {
          'text-color': '#8a8374',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
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
      ...cityLabelLayers,
      // OSM 镇/村级小地名：市级以上由 cities.geojson 提供，此处只补基层地名。
      // 有意排除 city/town 以上的行政区划标注（country/state 隐藏，市名已覆盖）。
      {
        id: MAP_LAYER_IDS.osmTownLabel,
        type: 'symbol',
        source: MAP_SOURCE_IDS.osmBasemap,
        'source-layer': 'place',
        minzoom: 9.5,
        filter: [
          'match',
          ['get', 'class'],
          ['town', 'village', 'suburb', 'neighbourhood', 'quarter', 'hamlet'],
          true,
          false,
        ],
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name:latin']],
          'text-size': 9.5,
          'text-font': ['Noto Sans Regular'],
          'text-anchor': 'top',
          'text-offset': [0, 0.4],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#7d92a3',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
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
}
