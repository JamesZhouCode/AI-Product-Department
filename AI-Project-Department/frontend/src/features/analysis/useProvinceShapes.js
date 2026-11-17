import { useEffect, useState } from 'react';
import { publicPath } from '../../shared/publicPaths';

// 全国省级边界（含台湾省、香港特别行政区、澳门特别行政区与南海诸岛要素），
// 与「地图」模块共用同一份离线数据，不请求任何第三方地图服务。
// 首次加载后按经纬度投影为 SVG path 并缓存，切换环节时不重复计算。
const VIEW_WIDTH = 1000;
const PADDING = 8;
// 以中纬度做经度压缩，避免等距圆柱投影下横向明显拉伸。
const LAT_REF = 35;
const LON_SCALE = Math.cos((LAT_REF * Math.PI) / 180);
// 数据中 adcode 为 100000_JD 的要素即南海诸岛及九段线，无 name，单独标注。
const SOUTH_SEA_CODE = '100000_JD';
const SOUTH_SEA_LABEL = '南海诸岛';

let shapesCache = null;
let pending = null;

function project(lon, lat) {
  return [lon * LON_SCALE, -lat];
}

// points 为已投影并换算到 viewBox 的坐标点数组。
function ringToPath(points, round) {
  let path = '';
  for (let index = 0; index < points.length; index += 1) {
    const [x, y] = points[index];
    path += `${index === 0 ? 'M' : 'L'}${round(x)},${round(y)}`;
  }
  return `${path}Z`;
}

function buildShapes(geojson) {
  const features = geojson.features || [];
  // 先求投影后的整体包围盒，再等比缩放到目标宽度。
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const projected = features.map((feature) => {
    const polygons =
      feature.geometry?.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry?.coordinates || [];
    const rings = [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        const points = ring.map(([lon, lat]) => {
          const [x, y] = project(lon, lat);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          return [x, y];
        });
        rings.push(points);
      }
    }
    return { feature, rings };
  });

  const scale = (VIEW_WIDTH - PADDING * 2) / (maxX - minX || 1);
  const height = Math.round((maxY - minY) * scale + PADDING * 2);
  const round = (value) => Math.round(value * 10) / 10;
  const toView = ([x, y]) => [
    round((x - minX) * scale + PADDING),
    round((y - minY) * scale + PADDING),
  ];

  const shapes = projected.map(({ feature, rings }) => {
    const props = feature.properties || {};
    const isSouthSea = props.adcode === SOUTH_SEA_CODE || !props.name;
    const path = rings
      .map((ring) =>
        ringToPath(
          ring.map((point) => toView(point)),
          round,
        ),
      )
      .join('');
    return {
      code: props.adcode,
      name: props.name || SOUTH_SEA_LABEL,
      label: isSouthSea ? SOUTH_SEA_LABEL : props.name,
      isSouthSea,
      // 南海诸岛仅作领土要素描边显示，不参与统计着色。
      center: props.center || props.centroid || null,
      path,
    };
  });

  return { width: VIEW_WIDTH, height, shapes };
}

export function loadProvinceShapes() {
  if (shapesCache) return Promise.resolve(shapesCache);
  if (!pending) {
    pending = fetch(publicPath('data/china-provinces.geojson'))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(buildShapes)
      .then((shapes) => {
        shapesCache = shapes;
        return shapes;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

export function useProvinceShapes() {
  const [state, setState] = useState(() =>
    shapesCache
      ? { status: 'ready', shapes: shapesCache, error: null }
      : { status: 'loading', shapes: null, error: null },
  );

  useEffect(() => {
    let cancelled = false;
    // 始终订阅同一个 Promise：即便在 StrictMode 二次挂载时数据已就绪，
    // 也能拿到结果并更新状态，避免初始 loading 状态被永久保留。
    loadProvinceShapes()
      .then((shapes) => {
        if (!cancelled) setState({ status: 'ready', shapes, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', shapes: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
