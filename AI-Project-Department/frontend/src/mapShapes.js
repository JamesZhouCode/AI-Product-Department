// 底图资源尚未下载时的离线占位轮廓，仅用于保持交互布局可预览。
// 正式地图加载后，这些图层会被真实 PMTiles / 街道 GeoJSON 覆盖。
export const fallbackShapes = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'china' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [73.6, 39.8],
            [79.5, 42.8],
            [88.2, 49.2],
            [97.4, 49.0],
            [106.4, 53.5],
            [119.0, 53.0],
            [134.7, 48.2],
            [134.2, 42.0],
            [124.8, 39.2],
            [124.3, 35.2],
            [122.1, 29.6],
            [119.4, 24.0],
            [110.0, 20.0],
            [99.0, 21.2],
            [92.0, 27.0],
            [83.0, 28.0],
            [78.0, 32.0],
            [73.6, 39.8],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'shanghai' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [120.85, 30.67],
            [122.1, 30.67],
            [122.1, 31.88],
            [120.85, 31.88],
            [120.85, 30.67],
          ],
        ],
      },
    },
  ],
};

export const fallbackStreetGrid = {
  type: 'FeatureCollection',
  features: Array.from({ length: 6 }, (_, index) => ({
    type: 'Feature',
    properties: { name: `上海街道示意 ${index + 1}` },
    geometry: {
      type: 'LineString',
      coordinates: [
        [120.86 + index * 0.2, 30.7],
        [120.86 + index * 0.2, 31.84],
      ],
    },
  })),
};
