// 「政策分析」页的政策区域影响地图。
//
// 边界要素与「地图」「分析」模块同源（public/data/china-provinces.geojson，
// 含台湾省、香港特别行政区、澳门特别行政区与南海诸岛要素），复用 analysis 的
// 投影 Hook，不请求任何第三方地图服务。
// 着色规则：颜色越深 = 政策对该区域的带动强度越高（全国性政策由本地产业基础决定）。
import { useMemo } from 'react';
import { useProvinceShapes } from '../analysis/useProvinceShapes';
import { shortRegionName } from './policyEngine';

const FALLBACK_FILL = '#eef3f7';
const LAND_STROKE = '#b9c8d6';
const ACTIVE_STROKE = '#0d4fa6';

export default function PolicyRegionMap({ region, activeName, onPick }) {
  const geo = useProvinceShapes();
  const byName = useMemo(
    () => new Map((region?.rows || []).map((row) => [row.name, row])),
    [region],
  );

  if (geo.status === 'error') {
    return (
      <div className="policy-map-fallback">
        离线边界数据读取失败，地图暂不可用；下方区域榜单中的结论不受影响。
      </div>
    );
  }
  if (geo.status !== 'ready' || !geo.shapes?.shapes?.length) {
    return <div className="policy-map-fallback">正在加载离线省级边界数据…</div>;
  }

  const { shapes, width, height } = geo.shapes;

  return (
    <svg
      className="policy-map-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="政策区域影响地图，颜色越深表示政策带动强度越高"
    >
      {shapes.map((shape) => {
        if (shape.isSouthSea) {
          // 南海诸岛及九段线：仅作领土要素描边显示，不参与统计着色。
          return (
            <path
              key={shape.code}
              className="policy-map-southsea"
              d={shape.path}
              fill="none"
              stroke={LAND_STROKE}
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
            >
              <title>南海诸岛（含九段线）</title>
            </path>
          );
        }
        const row = byName.get(shortRegionName(shape.label));
        const isActive = Boolean(row) && row.name === activeName;
        const fill = row ? row.band.fill : FALLBACK_FILL;
        const tooltip = row
          ? `${row.full}\n政策带动强度 ${row.value}\n集群成熟度 ${row.maturity}（${row.stars}★）\n政策存量 ${row.policyCount} 项\n重点方向：${row.direction}`
          : `${shape.label}（暂无产业基础数据）`;
        return (
          <path
            key={shape.code || shape.label}
            className={`policy-map-region ${row ? 'has-data' : ''} ${isActive ? 'is-active' : ''}`}
            d={shape.path}
            fill={fill}
            stroke={isActive ? ACTIVE_STROKE : '#ffffff'}
            strokeWidth={isActive ? 1.6 : 0.6}
            vectorEffect="non-scaling-stroke"
            role={row ? 'button' : undefined}
            tabIndex={row ? 0 : undefined}
            aria-label={
              row
                ? `${row.full}：政策带动强度 ${row.value}，集群成熟度 ${row.maturity}`
                : shape.label
            }
            onClick={() => row && onPick?.(row.name)}
            onKeyDown={(event) => {
              if (row && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onPick?.(row.name);
              }
            }}
          >
            <title>{tooltip}</title>
          </path>
        );
      })}
    </svg>
  );
}
