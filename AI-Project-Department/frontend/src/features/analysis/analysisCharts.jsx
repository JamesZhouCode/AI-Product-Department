// 「分析」页手绘 SVG 图表：市场规模趋势、需求结构、产能与供需、集中度演变、区域分布。
// 与授信模块一致，不引入图表库，保持轻量依赖与统一视觉。

const AXIS = '#c9d6e1';
const GRID = '#e8eef4';
const BLUE = '#1769e0';
const BLUE_SOFT = '#cfe1fb';
const TEAL = '#0b9b90';
const ORANGE = '#ed861d';
const PURPLE = '#775bd6';
const GREEN = '#168d69';
const RED = '#c23b37';

const fmt = (value, digits = 0) =>
  Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });

// 市场规模趋势：历史 + 预测柱状，历史年份标注同比增速。
export function MarketTrendChart({ market }) {
  const points = [
    ...market.years.map((year, index) => ({
      year,
      value: market.china[index],
      growth: market.chinaGrowth[index],
      forecast: false,
    })),
    ...market.forecastYears.map((year, index) => ({
      year,
      value: market.forecast[index],
      growth: null,
      forecast: true,
    })),
  ];
  const width = 660;
  const height = 230;
  const padding = { left: 52, right: 18, top: 26, bottom: 30 };
  const max = Math.max(...points.map((item) => item.value)) * 1.12;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const step = innerW / points.length;
  const barW = Math.min(36, step * 0.56);
  const yOf = (value) => padding.top + innerH * (1 - value / max);

  return (
    <svg
      className="ana-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="市场规模趋势"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <g key={ratio}>
          <line
            x1={padding.left}
            y1={yOf(max * ratio)}
            x2={width - padding.right}
            y2={yOf(max * ratio)}
            stroke={GRID}
          />
          <text
            className="ana-axis-text"
            x={padding.left - 8}
            y={yOf(max * ratio) + 3}
            textAnchor="end"
          >
            {fmt(max * ratio)}
          </text>
        </g>
      ))}
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke={AXIS}
      />
      {points.map((item, index) => {
        const x = padding.left + step * index + step / 2;
        const y = yOf(item.value);
        const isForecast = item.forecast;
        return (
          <g key={item.year}>
            <rect
              x={x - barW / 2}
              y={y}
              width={barW}
              height={Math.max(height - padding.bottom - y, 1)}
              rx="3"
              fill={isForecast ? BLUE_SOFT : BLUE}
              stroke={isForecast ? BLUE : 'none'}
              strokeDasharray={isForecast ? '3 2' : undefined}
            />
            <text className="ana-bar-value" x={x} y={y - 6} textAnchor="middle">
              {fmt(item.value)}
            </text>
            {item.growth != null && (
              <text className="ana-bar-growth" x={x} y={y + 14} textAnchor="middle">
                +{item.growth}%
              </text>
            )}
            <text
              className="ana-axis-text"
              x={x}
              y={height - padding.bottom + 16}
              textAnchor="middle"
            >
              {item.year}
              {isForecast ? 'E' : ''}
            </text>
          </g>
        );
      })}
      <text className="ana-axis-text" x={padding.left} y={14}>
        单位：{market.unit}（虚线柱为预测值）
      </text>
    </svg>
  );
}

// 需求结构：横向堆叠条 + 图例。
export function DemandMixChart({ mix }) {
  const colors = [BLUE, TEAL, ORANGE, PURPLE, GREEN, RED];
  const total = mix.reduce((sum, item) => sum + item.share, 0) || 1;
  let cursor = 0;
  const segments = mix.map((item, index) => {
    const width = (item.share / total) * 100;
    const segment = { ...item, width, offset: cursor, color: colors[index % colors.length] };
    cursor += width;
    return segment;
  });
  return (
    <div className="ana-mix">
      <svg
        className="ana-mix-bar"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        role="img"
        aria-label="需求结构"
      >
        {segments.map((segment) => (
          <rect
            key={segment.label}
            x={segment.offset}
            y="0"
            width={Math.max(segment.width - 0.2, 0.3)}
            height="10"
            fill={segment.color}
          />
        ))}
      </svg>
      <div className="ana-mix-legend">
        {segments.map((segment) => (
          <span key={segment.label} className="ana-mix-item">
            <i style={{ background: segment.color }} />
            {segment.label}
            <b>{segment.share}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// 产能与供需：名义 / 有效 / 实际产量 / 需求量对比 + 利用率、在建与规划。
export function CapacityBalanceChart({ capacity }) {
  const bars = [
    { label: '名义产能', value: capacity.nominal, color: BLUE_SOFT, stroke: BLUE },
    { label: '有效产能', value: capacity.effective, color: '#dcecfd', stroke: BLUE },
    { label: '实际产量', value: capacity.output, color: '#d7f0ec', stroke: TEAL },
    { label: '需求量', value: capacity.demand, color: '#fbe9d6', stroke: ORANGE },
  ];
  const width = 660;
  const height = 216;
  const padding = { left: 54, right: 18, top: 28, bottom: 34 };
  const max = Math.max(...bars.map((item) => item.value), capacity.planned || 0) * 1.15;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const step = innerW / bars.length;
  const barW = Math.min(58, step * 0.5);
  const yOf = (value) => padding.top + innerH * (1 - value / max);
  return (
    <svg
      className="ana-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="产能与供需"
    >
      {[0, 0.5, 1].map((ratio) => (
        <g key={ratio}>
          <line
            x1={padding.left}
            y1={yOf(max * ratio)}
            x2={width - padding.right}
            y2={yOf(max * ratio)}
            stroke={GRID}
          />
          <text
            className="ana-axis-text"
            x={padding.left - 8}
            y={yOf(max * ratio) + 3}
            textAnchor="end"
          >
            {fmt(max * ratio)}
          </text>
        </g>
      ))}
      {bars.map((bar, index) => {
        const x = padding.left + step * index + step / 2;
        const y = yOf(bar.value);
        return (
          <g key={bar.label}>
            <rect
              x={x - barW / 2}
              y={y}
              width={barW}
              height={Math.max(height - padding.bottom - y, 1)}
              rx="4"
              fill={bar.color}
              stroke={bar.stroke}
            />
            <text className="ana-bar-value" x={x} y={y - 7} textAnchor="middle">
              {fmt(bar.value)}
            </text>
            <text
              className="ana-axis-text"
              x={x}
              y={height - padding.bottom + 16}
              textAnchor="middle"
            >
              {bar.label}
            </text>
          </g>
        );
      })}
      <text className="ana-axis-text" x={padding.left} y={15}>
        单位：{capacity.unit} · 产能利用率 {capacity.utilization}%
      </text>
      <g>
        <rect
          x={width - padding.right - 208}
          y={padding.top - 2}
          width={208}
          height={20}
          rx="4"
          fill="#f6f8fb"
          stroke={AXIS}
        />
        <text className="ana-axis-text" x={width - padding.right - 198} y={padding.top + 12}>
          在建 {fmt(capacity.underConstruction)} · 规划 {fmt(capacity.planned)} · 退出{' '}
          {fmt(capacity.retired)}
        </text>
      </g>
    </svg>
  );
}

// 产能利用率与需求量：双折线趋势。
export function CapacityTrendChart({ capacity }) {
  const width = 320;
  const height = 150;
  const padding = { left: 34, right: 12, top: 20, bottom: 22 };
  const util = capacity.utilizationSeries;
  const demand = capacity.demandSeries;
  const maxDemand = Math.max(...demand) * 1.1;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xOf = (index) => padding.left + (index / (capacity.years.length - 1)) * innerW;
  const yDemand = (value) => padding.top + innerH * (1 - value / maxDemand);
  const yUtil = (value) => padding.top + innerH * (1 - value / 100);
  const line = (values, mapper) =>
    values.map((value, index) => `${xOf(index)},${mapper(value)}`).join(' ');
  return (
    <svg
      className="ana-chart small"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="产能利用率与需求趋势"
    >
      {[0, 0.5, 1].map((ratio) => (
        <line
          key={ratio}
          x1={padding.left}
          y1={padding.top + innerH * ratio}
          x2={width - padding.right}
          y2={padding.top + innerH * ratio}
          stroke={GRID}
        />
      ))}
      <polyline className="ana-line" points={line(demand, yDemand)} stroke={ORANGE} fill="none" />
      {demand.map((value, index) => (
        <circle
          key={`d-${value}-${index}`}
          cx={xOf(index)}
          cy={yDemand(value)}
          r="2.4"
          fill={ORANGE}
        />
      ))}
      <polyline className="ana-line" points={line(util, yUtil)} stroke={TEAL} fill="none" />
      {util.map((value, index) => (
        <circle key={`u-${value}-${index}`} cx={xOf(index)} cy={yUtil(value)} r="2.4" fill={TEAL} />
      ))}
      {capacity.years.map((year, index) => (
        <text
          key={year}
          className="ana-axis-text"
          x={xOf(index)}
          y={height - 8}
          textAnchor="middle"
        >
          {year}
        </text>
      ))}
      <text className="ana-legend-text" x={padding.left} y={12}>
        <tspan fill={TEAL}>■ 产能利用率(%)</tspan>
        <tspan fill={ORANGE} dx="10">
          ■ 需求量({capacity.unit})
        </tspan>
      </text>
    </svg>
  );
}

// 集中度演变：CR5 逐年柱状 + CR3/CR5/CR10 标签。
export function ConcentrationChart({ companies }) {
  const width = 320;
  const height = 150;
  const padding = { left: 34, right: 12, top: 22, bottom: 22 };
  const series = companies.cr5Series;
  const max = Math.max(...series, companies.cr10) * 1.15;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const step = innerW / series.length;
  const barW = Math.min(30, step * 0.5);
  const yOf = (value) => padding.top + innerH * (1 - value / max);
  return (
    <svg
      className="ana-chart small"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="集中度演变"
    >
      {[0, 0.5, 1].map((ratio) => (
        <line
          key={ratio}
          x1={padding.left}
          y1={padding.top + innerH * ratio}
          x2={width - padding.right}
          y2={padding.top + innerH * ratio}
          stroke={GRID}
        />
      ))}
      {series.map((value, index) => {
        const x = padding.left + step * index + step / 2;
        const y = yOf(value);
        return (
          <g key={companies.crYears[index]}>
            <rect
              x={x - barW / 2}
              y={y}
              width={barW}
              height={Math.max(height - padding.bottom - y, 1)}
              rx="3"
              fill={PURPLE}
              opacity={index === series.length - 1 ? 1 : 0.62}
            />
            <text className="ana-bar-value tiny" x={x} y={y - 5} textAnchor="middle">
              {value}%
            </text>
            <text className="ana-axis-text" x={x} y={height - 8} textAnchor="middle">
              {companies.crYears[index]}
            </text>
          </g>
        );
      })}
      <text className="ana-axis-text" x={padding.left} y={13}>
        CR3 {companies.cr3}% · CR5 {companies.cr5}% · CR10 {companies.cr10}%
      </text>
    </svg>
  );
}

// 区域产业规模：省份条形（企业数与产值双指标）。
export function RegionBarChart({ regions, unit }) {
  const items = regions.regions.slice(0, 8);
  if (!items.length) return null;
  const maxCompanies = Math.max(...items.map((item) => item.companies));
  const maxOutput = Math.max(...items.map((item) => item.output));
  const width = 660;
  const rowH = 26;
  const height = items.length * rowH + 26;
  return (
    <svg
      className="ana-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="区域产业规模"
    >
      <text className="ana-axis-text" x={0} y={12}>
        条形长度＝企业数（入库上市口径） · 数值＝产业规模（亿元，演示数据） · 单位产能：{unit}
      </text>
      {items.map((item, index) => {
        const y = 24 + index * rowH;
        const barW = (item.companies / maxCompanies) * (width - 250);
        const outputRatio = item.output / (maxOutput || 1);
        return (
          <g key={item.province}>
            <text className="ana-region-name" x={0} y={y + 13}>
              {item.province}
            </text>
            <rect x={96} y={y + 3} width={width - 250} height={13} rx="3" fill="#f1f5f9" />
            <rect x={96} y={y + 3} width={barW} height={13} rx="3" fill={BLUE} opacity="0.85" />
            <text className="ana-region-meta" x={width - 148} y={y + 14}>
              {item.companies} 家 · {fmt(item.output)} 亿元
            </text>
            <rect
              x={width - 60}
              y={y + 3}
              width={Math.max(outputRatio * 52, 3)}
              height={13}
              rx="3"
              fill={TEAL}
              opacity="0.7"
            />
            <text className="ana-region-meta" x={width - 4} y={y + 14} textAnchor="end">
              集聚度 {item.concentration}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// 景气度分项：横条。
export function ProsperityBreakdown({ items }) {
  const labels = {
    demandGrowth: '需求增长',
    supplyDemand: '供需关系',
    priceTrend: '价格趋势',
    profitability: '盈利水平',
    technology: '技术景气',
    policy: '政策支持',
    competition: '竞争格局',
  };
  const max = 100;
  return (
    <div className="ana-prosperity">
      {items.map((item) => (
        <div key={item.key} className="ana-prosperity-row">
          <span className="ana-prosperity-label">{labels[item.key] || item.key}</span>
          <span className="ana-prosperity-track">
            <span
              className="ana-prosperity-fill"
              style={{
                width: `${(item.score / max) * 100}%`,
                background: item.score >= 70 ? GREEN : item.score >= 50 ? ORANGE : RED,
              }}
            />
          </span>
          <span className="ana-prosperity-value">{item.score}</span>
          <span className="ana-prosperity-weight">{Math.round(item.weight * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

// 星级展示（景气度 / 授信友好度共用）。
export function StarRating({ score, stars, text }) {
  return (
    <span className="ana-stars" aria-label={`${score} 分`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <i key={index} className={index <= stars ? 'on' : ''}>
          ★
        </i>
      ))}
      <b>{text}</b>
      <em>{score} / 100</em>
    </span>
  );
}

// 全国区域地图：省级色块，颜色深浅代表产业规模，点击省份联动右侧明细。
// 边界要素与「地图」模块同源（含台湾省、香港特别行政区、澳门特别行政区与南海诸岛）。
const MAP_NO_DATA = '#edf1f5';
const MAP_FILL = ['#cfe1fb', '#7aaef3', '#1769e0'];
const MAP_STROKE = '#ffffff';
const MAP_LAND_STROKE = '#b9c8d6';

export function RegionMapChart({ regions, shapes, unit, activeProvince, onSelect }) {
  if (!shapes?.shapes?.length) return null;
  const byName = new Map(regions.regions.map((item) => [item.province, item]));
  const maxOutput = Math.max(...regions.regions.map((item) => item.output), 1);
  const fillOf = (item) => {
    if (!item) return MAP_NO_DATA;
    const ratio = item.output / maxOutput;
    if (ratio >= 0.66) return MAP_FILL[2];
    if (ratio >= 0.33) return MAP_FILL[1];
    return MAP_FILL[0];
  };

  return (
    <div className="ana-map-wrap">
      <svg
        className="ana-chart ana-map"
        viewBox={`0 0 ${shapes.width} ${shapes.height}`}
        role="img"
        aria-label="全国区域分布地图，颜色深浅代表产业规模"
      >
        {shapes.shapes.map((shape) => {
          if (shape.isSouthSea) {
            // 南海诸岛及九段线：仅作领土要素描边显示，不参与统计着色。
            return (
              <path
                key={shape.code}
                className="ana-map-southsea"
                d={shape.path}
                fill="none"
                stroke={MAP_LAND_STROKE}
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
              >
                <title>南海诸岛</title>
              </path>
            );
          }
          const item = byName.get(shape.label);
          const isActive = Boolean(item) && item.province === activeProvince;
          return (
            <path
              key={shape.code || shape.label}
              className={`ana-map-region ${item ? 'has-data' : ''} ${isActive ? 'is-active' : ''}`}
              d={shape.path}
              fill={fillOf(item)}
              stroke={isActive ? BLUE : MAP_STROKE}
              strokeWidth={isActive ? 1.6 : 0.6}
              vectorEffect="non-scaling-stroke"
              role={item ? 'button' : undefined}
              tabIndex={item ? 0 : undefined}
              aria-label={
                item
                  ? `${item.province}：企业 ${item.companies} 家，产业规模 ${fmt(item.output)} 亿元`
                  : shape.label
              }
              onClick={() => item && onSelect?.(item.province)}
              onKeyDown={(event) => {
                if (item && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onSelect?.(item.province);
                }
              }}
            >
              <title>
                {item
                  ? `${item.province}\n企业 ${item.companies} 家 · 产业规模 ${fmt(item.output)} 亿元\n产能 ${fmt(item.capacity)} ${unit || ''}`
                  : `${shape.label}（该环节暂无入库企业）`}
              </title>
            </path>
          );
        })}
      </svg>
      <div className="ana-map-legend">
        <span>产业规模（亿元，演示数据）</span>
        <i style={{ background: MAP_NO_DATA }} />
        <span>无入库企业</span>
        {MAP_FILL.map((color, index) => (
          <span key={color} className="ana-map-legend-step">
            <i style={{ background: color }} />
            {index === 0 ? '低' : index === 1 ? '中' : '高'}
          </span>
        ))}
      </div>
      <p className="ana-figure-caption">
        点击地图省份或下方表格行，查看该地区的企业数量、产能、产业规模、重点企业、产业集群与区域风险。
      </p>
    </div>
  );
}
