import CompanyDetailRail from '../company/CompanyDetailRail';
import MapFilterRail from './MapFilterRail';
import MapStage from './MapStage';
import './MapWorkspace.css';

export default function MapWorkspace({
  active,
  dataError,
  dataWarning,
  detailPanelProps,
  filterRailProps,
  loading,
  mapStageProps,
}) {
  const selectedEntity = detailPanelProps.entity;

  return (
    <>
      <main className={`workspace ${active ? '' : 'page-hidden'}`}>
        <MapFilterRail {...filterRailProps} />
        <MapStage {...mapStageProps} dataError={dataError} dataWarning={dataWarning} />
        {selectedEntity && (
          <CompanyDetailRail
            entity={selectedEntity}
            detailProps={detailPanelProps}
            loading={loading}
            onClearSelection={detailPanelProps.onClearSelection}
            className="right-rail"
          />
        )}
      </main>
    </>
  );
}
