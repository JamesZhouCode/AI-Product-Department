import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { buildMapStyle } from '../../mapStyle';
import { OFFLINE_BASEMAP_BOUNDS, registerMergedBasemapProtocol } from '../../mergedBasemapProtocol';
import { publicUrl } from '../../shared/publicPaths';
import { relationFeature } from './mapFeatures';
import { normalize } from '../../shared/text';
import {
  COMPANY_INTERACTIVE_MAP_LAYERS,
  CURSOR_MAP_LAYERS,
  INTERACTIVE_MAP_LAYERS,
  MAP_LAYER_IDS,
  MAP_SOURCE_IDS,
  OVERLAP_INTERACTIVE_MAP_LAYERS,
} from './mapLayers';

function markerImageData(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  if (kind === 'credit') {
    context.beginPath();
    context.moveTo(16, 2);
    context.lineTo(28, 7);
    context.lineTo(27, 16);
    context.bezierCurveTo(26, 22, 22, 27, 16, 30);
    context.bezierCurveTo(10, 27, 6, 22, 5, 16);
    context.lineTo(4, 7);
    context.closePath();
    context.fill();
    context.globalCompositeOperation = 'destination-out';
    context.fillRect(14.5, 9, 3, 12);
    context.fillRect(10.5, 13.5, 11, 3);
  } else if (kind === 'check') {
    context.strokeStyle = '#ffffff';
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(6, 16);
    context.lineTo(13, 23);
    context.lineTo(26, 9);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(16, 2);
    context.lineTo(29, 9);
    context.lineTo(26.5, 10);
    context.lineTo(26.5, 26);
    context.lineTo(29, 28);
    context.lineTo(3, 28);
    context.lineTo(5.5, 26);
    context.lineTo(5.5, 10);
    context.lineTo(3, 9);
    context.closePath();
    context.fill();
    context.fillRect(4, 10, 24, 3);
    [7, 12, 17, 22].forEach((x) => context.fillRect(x, 14, 3, 11));
    context.fillRect(3, 25, 26, 4);
  }
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function registerBankMarkerImages(map) {
  if (typeof document === 'undefined') return;
  [
    ['contacted-check', 'check'],
    ['bank-badge', 'bank'],
    ['credit-shield', 'credit'],
  ].forEach(([name, kind]) => {
    if (!map.hasImage(name))
      map.addImage(name, markerImageData(kind), { sdf: true, pixelRatio: 2 });
  });
}

class ZoomToolbarControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl map-zoom-toolbar';

    this._scale = document.createElement('span');
    this._scale.className = 'map-zoom-scale';
    this._scale.setAttribute('aria-label', '当前地图缩放级别');

    const createButton = (label, ariaLabel, onClick) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-zoom-button';
      button.textContent = label;
      button.setAttribute('aria-label', ariaLabel);
      button.title = ariaLabel;
      button.addEventListener('click', onClick);
      return button;
    };

    this._zoomInButton = createButton('+', '放大地图', () => map.zoomIn());
    this._zoomOutButton = createButton('−', '缩小地图', () => map.zoomOut());
    this._updateScale = () => {
      this._scale.textContent = `${map.getZoom().toFixed(1)}x`;
    };
    map.on('zoom', this._updateScale);
    this._updateScale();
    this._container.append(this._scale, this._zoomInButton, this._zoomOutButton);
    return this._container;
  }

  onRemove() {
    this._map?.off('zoom', this._updateScale);
    this._container?.remove();
    this._map = undefined;
  }
}

function updateBasemapViewport(map) {
  const camera = map.cameraForBounds(OFFLINE_BASEMAP_BOUNDS, {
    padding: 24,
    maxZoom: 18,
  });
  if (!camera?.center || !Number.isFinite(camera.zoom)) return;

  map.setMaxBounds(OFFLINE_BASEMAP_BOUNDS);
  map.setMinZoom(camera.zoom);
  if (map.getZoom() < camera.zoom) map.jumpTo(camera);
}

export function useMapController({
  activeTab,
  isMapFullscreen,
  districtName,
  shanghaiDistricts,
  data,
  visibleFeatures,
  overlapFeatures,
  relationsForSelected,
  setSelectedName,
  setActiveRelation,
  setActiveOverlap,
}) {
  const [hasBasemap, setHasBasemap] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);

  useEffect(() => {
    if (activeTab !== 'map' || !mapRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => mapRef.current?.resize());
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, isMapFullscreen, mapReady]);

  useEffect(() => {
    const isPmtilesArchive = async (url) => {
      try {
        const response = await fetch(url, { headers: { Range: 'bytes=0-7' } });
        if (!response.ok) return false;
        const bytes = new Uint8Array(await response.arrayBuffer());
        // PMTiles v3 archives (including the Node extractor output) are
        // identified by the two-byte `PM` magic; missing Vite SPA fallbacks
        // begin with `<!` and therefore do not pass this check.
        return new TextDecoder().decode(bytes.slice(0, 2)) === 'PM' && bytes[7] === 3;
      } catch {
        return false;
      }
    };
    Promise.all(
      [publicUrl('map/china-overview.pmtiles'), publicUrl('map/shanghai-detail.pmtiles')].map(
        isPmtilesArchive,
      ),
    ).then(([overview, detail]) => setHasBasemap(overview && detail));
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || hasBasemap === null || mapRef.current) return undefined;
    const basemapProtocol = hasBasemap ? registerMergedBasemapProtocol() : null;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle(hasBasemap),
      center: [104, 38.2],
      zoom: 3.1,
      minZoom: 3.1,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: false,
      cooperativeGestures: false,
    });
    map.addControl(new ZoomToolbarControl(), 'bottom-right');
    map.on('styleimagemissing', (event) => {
      if (['contacted-check', 'bank-badge', 'credit-shield'].includes(event.id))
        registerBankMarkerImages(map);
    });
    map.on('load', () => {
      registerBankMarkerImages(map);
      setMapReady(true);
    });
    map.on('click', (event) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: INTERACTIVE_MAP_LAYERS,
      });
      const overlapHit = hits.find((feature) =>
        OVERLAP_INTERACTIVE_MAP_LAYERS.includes(feature.layer?.id),
      );
      if (overlapHit?.properties?.names) {
        const names = String(overlapHit.properties.names).split('|').filter(Boolean);
        setActiveRelation(null);
        setActiveOverlap({
          count: Number(overlapHit.properties.count || names.length),
          names,
          coordinates: overlapHit.geometry.coordinates,
        });
        return;
      }
      const companyHit = hits.find((feature) =>
        COMPANY_INTERACTIVE_MAP_LAYERS.includes(feature.layer?.id),
      );
      if (companyHit?.properties?.name) {
        setActiveRelation(null);
        setActiveOverlap(null);
        setSelectedName(companyHit.properties.name);
        return;
      }
      const clusterHit = hits.find(
        (feature) => feature.layer?.id === MAP_LAYER_IDS.companyClusters,
      );
      if (clusterHit?.properties?.cluster_id !== undefined) {
        setActiveRelation(null);
        setActiveOverlap(null);
        const source = map.getSource(MAP_SOURCE_IDS.companies);
        source?.getClusterExpansionZoom(clusterHit.properties.cluster_id, (error, zoom) => {
          if (!error) map.easeTo({ center: clusterHit.geometry.coordinates, zoom });
        });
        return;
      }
      const relationHit = hits.find((feature) => feature.layer?.id === MAP_LAYER_IDS.relationLines);
      if (relationHit?.properties?.from && relationHit.properties.to) {
        setActiveOverlap(null);
        setActiveRelation({
          id: relationHit.properties.id,
          from: relationHit.properties.from,
          to: relationHit.properties.to,
          relationType: relationHit.properties.relationType,
          depth: Number(relationHit.properties.depth || 1),
          source: relationHit.properties.source || '来源待补',
        });
        return;
      }
      setActiveRelation(null);
      setActiveOverlap(null);
    });
    CURSOR_MAP_LAYERS.forEach(([layerId, cursor]) => {
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = cursor;
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    });
    mapRef.current = map;
    // Smoke tests use the debug handle; keep it out of production builds.
    if (import.meta.env.DEV) {
      window.__industryMap = map;
      window.__icMap = map;
    }
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      if (hasBasemap && map.loaded()) updateBasemapViewport(map);
    });
    resizeObserver.observe(mapContainerRef.current);
    setTimeout(() => {
      map.resize();
      if (hasBasemap && map.loaded()) updateBasemapViewport(map);
    }, 0);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      basemapProtocol?.unregister();
      mapRef.current = null;
      if (import.meta.env.DEV) {
        delete window.__industryMap;
        delete window.__icMap;
      }
    };
  }, [hasBasemap, setActiveOverlap, setActiveRelation, setSelectedName]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !hasBasemap) return;
    const frame = window.requestAnimationFrame(() => updateBasemapViewport(map));
    return () => window.cancelAnimationFrame(frame);
  }, [hasBasemap, isMapFullscreen, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(MAP_LAYER_IDS.shanghaiDistrictFill)) return;
    map.setFilter(
      MAP_LAYER_IDS.shanghaiDistrictFill,
      districtName ? ['==', ['get', 'name'], districtName] : ['==', ['get', 'name'], '__none__'],
    );
  }, [districtName, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const companySource = map.getSource(MAP_SOURCE_IDS.companies);
    if (companySource)
      companySource.setData({ type: 'FeatureCollection', features: visibleFeatures });
    const overlapSource = map.getSource(MAP_SOURCE_IDS.companyOverlaps);
    if (overlapSource)
      overlapSource.setData({ type: 'FeatureCollection', features: overlapFeatures });
    const locationByName = new Map(
      data.companies.map((company) => [normalize(company.name), company]),
    );
    const relationshipFeatures = relationsForSelected
      .map((relation) => {
        const from = locationByName.get(normalize(relation.from));
        const to = locationByName.get(normalize(relation.to));
        return relationFeature(from, to, relation);
      })
      .filter(Boolean);
    const relationSource = map.getSource(MAP_SOURCE_IDS.relations);
    if (relationSource)
      relationSource.setData({ type: 'FeatureCollection', features: relationshipFeatures });
  }, [data.companies, mapReady, overlapFeatures, relationsForSelected, visibleFeatures]);

  const focusDistrict = (name) => {
    const feature = shanghaiDistricts.find((item) => item.properties?.name === name);
    if (!feature || !mapRef.current) return;
    const coordinates = [];
    const collect = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number')
        coordinates.push(value);
      else value.forEach(collect);
    };
    collect(feature.geometry?.coordinates);
    if (!coordinates.length) return;
    const lngs = coordinates.map(([lng]) => lng);
    const lats = coordinates.map(([, lat]) => lat);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 100, duration: 650, maxZoom: 12.5 },
    );
  };

  return { hasBasemap, mapContainerRef, mapReady, mapRef, focusDistrict };
}
