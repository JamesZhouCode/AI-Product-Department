// 授信页手绘 SVG 图表：六维雷达图、三年趋势图、二维气泡矩阵。
// 不引入图表库，保持与现有工程一致的轻量依赖。

import SourceBadge from './SourceBadge';
import { DIMENSION_META } from './creditConfig';

// 八维雷达图（V2.0：八维评价模型）。画布比雷达本体更宽，给两侧维度标签留出空间。
const RADAR_DIMS = DIMENSION_META.map((item) => ({ key: item.key, label: item.short }));

// 画布尺寸同时被抽屉用于定位「维度溯源」浮层坐标，故与组件同文件导出。
// eslint-disable-next-line react-refresh/only-export-components
export const CREDIT_RADAR_SIZE = { width: 440, height: 372 };

export function CreditRadarChart({ dimensions, onDimensionSelect }) {
  const { width, height } = CREDIT_RADAR_SIZE;
  const cx = width / 2;
  const cy = 172;
  const radius = 104;
  const angleFor = (index) => (Math.PI * 2 * index) / RADAR_DIMS.length - Math.PI / 2;
  const pointFor = (index, ratio) => {
    const angle = angleFor(index);
    return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio];
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const polygonPoints = RADAR_DIMS.map((dim, index) => {
    const ratio = clamp01((dimensions?.[dim.key]?.score || 0) / (dimensions?.[dim.key]?.max || 1));
    return pointFor(index, ratio).join(',');
  }).join(' ');

  return (
    <svg
      className="credit-radar"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="八维评分雷达图"
    >
      {rings.map((ring) => (
        <polygon
          key={ring}
          className="credit-radar-ring"
          points={RADAR_DIMS.map((_, index) => pointFor(index, ring).join(' ')).join(' ')}
        />
      ))}
      {RADAR_DIMS.map((dim, index) => {
        const [x, y] = pointFor(index, 1);
        return <line key={dim.key} className="credit-radar-axis" x1={cx} y1={cy} x2={x} y2={y} />;
      })}
      <polygon className="credit-radar-area" points={polygonPoints} />
      {RADAR_DIMS.map((dim, index) => {
        const ratio = clamp01(
          (dimensions?.[dim.key]?.score || 0) / (dimensions?.[dim.key]?.max || 1),
        );
        const [x, y] = pointFor(index, ratio);
        return <circle key={`${dim.key}-dot`} className="credit-radar-dot" cx={x} cy={y} r="3" />;
      })}
      {RADAR_DIMS.map((dim, index) => {
        const [x, y] = pointFor(index, 1.22);
        const value = dimensions?.[dim.key];
        const text = `${dim.label} ${Math.round(value?.score || 0)}/${value?.max || 0}`;
        const anchor = Math.abs(x - cx) < 14 ? 'middle' : x > cx ? 'start' : 'end';
        return (
          <text
            key={`${dim.key}-label`}
            className={`credit-radar-label ${onDimensionSelect ? 'clickable' : ''}`}
            x={x}
            y={y + 3}
            textAnchor={anchor}
            onClick={onDimensionSelect ? () => onDimensionSelect(dim.key, x, y) : undefined}
          >
            {text}
          </text>
        );
      })}
    </svg>
  );
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function CreditTrendChart({ series, formatter, label, tone = 'blue', sourceKey }) {
  const width = 250;
  const height = 88;
  const padding = { left: 8, right: 8, top: 12, bottom: 18 };
  const values = (series || []).map((value) => Number(value) || 0);
  if (!values.length) return null;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x =
      padding.left +
      (index / Math.max(values.length - 1, 1)) * (width - padding.left - padding.right);
    const y = padding.top + (1 - (value - min) / span) * (height - padding.top - padding.bottom);
    return [x, y];
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`;
  const years = ['T-2', 'T-1', 'T'];

  return (
    <div className="credit-trend">
      <div className="credit-trend-head">
        <span className="credit-trend-label">
          {label}
          {sourceKey && <SourceBadge sourceKey={sourceKey} />}
        </span>
        <span className={`credit-trend-value tone-${tone}`}>
          {formatter ? formatter(values[values.length - 1]) : values[values.length - 1]}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}三年趋势`}>
        <polygon className={`credit-trend-area tone-${tone}`} points={area} />
        <polyline className={`credit-trend-line tone-${tone}`} points={line} />
        {points.map(([x, y], index) => (
          <g key={`${x}-${y}`}>
            <circle className={`credit-trend-dot tone-${tone}`} cx={x} cy={y} r="3" />
            <text className="credit-trend-year" x={x} y={height - 5} textAnchor="middle">
              {years[index] || ''}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// 二维矩阵：横轴产业链价值，纵轴信用质量；气泡大小=营收规模，颜色=授信层级。
export function CreditBubbleMatrix({ points, onSelect }) {
  const width = 460;
  const height = 330;
  const padding = { left: 46, right: 16, top: 16, bottom: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const px = (x) => padding.left + clamp01(x) * innerW;
  const py = (y) => padding.top + (1 - clamp01(y)) * innerH;

  return (
    <svg
      className="credit-bubble"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="产业链价值 × 信用质量矩阵"
    >
      <rect
        className="credit-bubble-quadrant focus"
        x={padding.left + innerW / 2}
        y={padding.top}
        width={innerW / 2}
        height={innerH / 2}
      />
      <text
        className="credit-bubble-zone"
        x={padding.left + innerW * 0.75}
        y={padding.top + 16}
        textAnchor="middle"
      >
        重点支持区
      </text>
      <text
        className="credit-bubble-zone"
        x={padding.left + innerW * 0.25}
        y={padding.top + 16}
        textAnchor="middle"
      >
        条件支持区
      </text>
      <text
        className="credit-bubble-zone"
        x={padding.left + innerW * 0.25}
        y={padding.top + innerH - 8}
        textAnchor="middle"
      >
        严格审核区
      </text>
      <text
        className="credit-bubble-zone"
        x={padding.left + innerW * 0.75}
        y={padding.top + innerH - 8}
        textAnchor="middle"
      >
        观察培育区
      </text>
      <line
        className="credit-bubble-axis"
        x1={padding.left}
        y1={padding.top + innerH / 2}
        x2={width - padding.right}
        y2={padding.top + innerH / 2}
      />
      <line
        className="credit-bubble-axis"
        x1={padding.left + innerW / 2}
        y1={padding.top}
        x2={padding.left + innerW / 2}
        y2={padding.top + innerH}
      />
      <text className="credit-bubble-axis-label" x={width / 2} y={height - 8} textAnchor="middle">
        产业链价值 →
      </text>
      <text
        className="credit-bubble-axis-label"
        x={12}
        y={padding.top + innerH / 2}
        textAnchor="middle"
        transform={`rotate(-90 12 ${padding.top + innerH / 2})`}
      >
        信用质量 →
      </text>
      {(points || []).map((point) => (
        <circle
          key={point.id}
          className={`credit-bubble-dot tier-${point.tier}`}
          cx={px(point.x)}
          cy={py(point.y)}
          r={point.radius}
          onClick={() => onSelect?.(point.id)}
        >
          <title>{`${point.name} · 评分 ${point.total} · ${point.tierLabel}`}</title>
        </circle>
      ))}
    </svg>
  );
}
