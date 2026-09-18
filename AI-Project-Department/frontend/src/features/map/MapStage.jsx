import { chainPaletteFor } from '../../chainPalette';
import { relationDirection, relationPeer } from './mapFeatures';
import MapTagStrip from './MapTagStrip';
import './MapStage.css';

export default function MapStage({
  mapContainerRef,
  activeIndustry,
  activeTag,
  dataError,
  dataWarning,
  onTagChange,
  isMapFullscreen,
  onToggleFullscreen,
  selectedEntity,
  activeRelation,
  onSelectRelation,
  onClearRelation,
  activeOverlap,
  onSelectOverlapCompany,
  onClearOverlap,
  hasBasemap,
}) {
  const activeRelationDirection = activeRelation ? relationDirection(activeRelation) : null;
  const activeRelationPeer =
    activeRelation && selectedEntity ? relationPeer(activeRelation, selectedEntity.name) : '';
  // 图例跟随当前一级链，只展示这条链的二级链配色。
  const chainPalette = chainPaletteFor(activeIndustry);

  return (
    <section className={`map-stage ${selectedEntity ? 'has-selected-entity' : ''}`}>
      <div ref={mapContainerRef} className="map-canvas" />
      <MapTagStrip
        activeTag={activeTag}
        onChange={onTagChange}
        hasSelectedEntity={Boolean(selectedEntity)}
      />
      {dataWarning && (
        <div className="map-data-notice warning" role="status">
          {dataWarning}
        </div>
      )}
      {dataError && (
        <div className="map-data-notice error" role="alert">
          <b>数据加载失败</b>
          <span>{dataError}</span>
        </div>
      )}
      <div className="map-stage-actions">
        <button
          type="button"
          className="map-expand-button"
          aria-pressed={isMapFullscreen}
          aria-label={isMapFullscreen ? '退出铺满地图' : '铺满地图'}
          title={isMapFullscreen ? '退出铺满地图（Esc）' : '铺满地图'}
          onClick={onToggleFullscreen}
        >
          <span aria-hidden="true">⛶</span>
        </button>
      </div>
      {activeRelation && activeRelationDirection && (
        <div className="map-relation-callout" role="status">
          <div className={`relation-kind ${activeRelation.relationType}`}>
            {activeRelation.relationType}
          </div>
          <div className="relation-callout-body">
            <b>
              {activeRelationDirection.from} → {activeRelationDirection.to}
            </b>
            <small>
              {activeRelationDirection.label} · 第 {activeRelation.depth} 层 ·{' '}
              {activeRelation.source || '来源待补'}
            </small>
          </div>
          {activeRelationPeer && (
            <button
              className="relation-callout-action"
              onClick={() => onSelectRelation(activeRelationPeer)}
            >
              查看 {activeRelationPeer}
            </button>
          )}
          <button
            className="relation-callout-close"
            aria-label="关闭关系说明"
            onClick={onClearRelation}
          >
            ×
          </button>
        </div>
      )}
      {activeOverlap && (
        <div
          className="map-overlap-callout"
          role="dialog"
          aria-label={`同坐标 ${activeOverlap.count} 家企业`}
        >
          <div className="overlap-callout-head">
            <div>
              <b>同坐标企业 · {activeOverlap.count} 家</b>
              <small>
                这些企业当前落在同一个地图坐标，可能是共享同一主点位或数据源合并的同坐标记录；已核验的独立地址不会合并。
              </small>
            </div>
            <button
              className="relation-callout-close"
              aria-label="关闭同坐标企业列表"
              onClick={onClearOverlap}
            >
              ×
            </button>
          </div>
          <div className="overlap-company-list">
            {activeOverlap.names.map((name) => (
              <button key={name} onClick={() => onSelectOverlapCompany(name)}>
                {name}
                <span>查看企业</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="map-bottom-left">
        <div className="map-legend">
          <div className="legend-row legend-row-colors">
            {chainPalette.map((group) => (
              <span key={group.id}>
                <i className="legend-dot chain" style={{ '--legend-color': group.color }} />
                {group.legendLabel}
              </span>
            ))}
          </div>
          <div className="legend-row legend-row-relations">
            <span>
              <i className="legend-line supply" />
              供应：供应商 → 企业
            </span>
            <span>
              <i className="legend-line distribution" />
              经销：企业 → 经销商
            </span>
            <span>
              <i className="legend-line equity" />
              股权：股东 → 企业
            </span>
          </div>
        </div>
        <div className="attribution">
          © Protomaps © OpenStreetMap contributors · Demo 数据源：本地调研表
        </div>
      </div>
      {!hasBasemap && (
        <div className="asset-callout">
          <b>离线底图资源待放入</b>
          <span>当前显示本地交互预览轮廓；放入 PMTiles 后自动切换真实离线底图。</span>
        </div>
      )}
    </section>
  );
}
