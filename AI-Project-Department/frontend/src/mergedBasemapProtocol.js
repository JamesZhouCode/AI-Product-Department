import { PMTiles } from 'pmtiles';
import maplibregl from 'maplibre-gl';
import { publicUrl } from './shared/publicPaths';

const PROTOCOL = 'icpmtiles';
const ARCHIVE_ROOT = publicUrl('map');
const OVERVIEW_URL = `${ARCHIVE_ROOT}/china-overview.pmtiles`;
const SHANGHAI_URL = `${ARCHIVE_ROOT}/shanghai-detail.pmtiles`;
const OVERVIEW_SOURCE_URL = `${PROTOCOL}:///map/china-overview`;
const DETAIL_SOURCE_URL = `${PROTOCOL}:///map/shanghai-detail`;
export const OFFLINE_BASEMAP_BOUNDS = [
  [73, 18],
  [135, 54],
];

const toTileResult = (tile) =>
  tile
    ? {
        data: new Uint8Array(tile.data),
        cacheControl: tile.cacheControl,
        expires: tile.expires,
      }
    : null;

const getTileSafely = (archive, z, x, y, signal) =>
  archive.getZxy(z, x, y, signal).catch((error) => {
    // MapLibre cancels stale range requests whenever the viewport changes.
    // Browsers surface that cancellation as "Failed to fetch", which should
    // resolve to an empty tile instead of producing a visible map error.
    if (signal.aborted || error?.name === 'AbortError' || error?.message === 'Failed to fetch')
      return null;
    throw error;
  });

/**
 * Register both offline PMTiles archives with the same protocol.
 *
 * They intentionally remain separate MapLibre sources: the nationwide source
 * can overzoom its own last tile, while the Shanghai source can use its native
 * street-level zoom range and bounds without the two archives being treated as
 * one oversized tile pyramid.
 */
export function registerMergedBasemapProtocol() {
  const overview = new PMTiles(OVERVIEW_URL);
  const detail = new PMTiles(SHANGHAI_URL);
  const metadataPromise = Promise.all([
    Promise.all([overview.getHeader(), overview.getMetadata().catch(() => ({}))]),
    Promise.all([detail.getHeader(), detail.getMetadata().catch(() => ({}))]),
  ]);

  const load = async (params, abortController) => {
    abortController.signal.throwIfAborted();

    const [[overviewHeader, overviewMetadata], [detailHeader, detailMetadata]] =
      await metadataPromise;
    abortController.signal.throwIfAborted();

    const isDetailUrl = params.url.includes('shanghai-detail');
    const source = isDetailUrl
      ? {
          archive: detail,
          header: detailHeader,
          metadata: detailMetadata,
          sourceUrl: DETAIL_SOURCE_URL,
        }
      : {
          archive: overview,
          header: overviewHeader,
          metadata: overviewMetadata,
          sourceUrl: OVERVIEW_SOURCE_URL,
        };

    if (params.type === 'json') {
      return {
        data: {
          tilejson: '3.0.0',
          scheme: 'xyz',
          ...source.metadata,
          tiles: [`${source.sourceUrl}/{z}/{x}/{y}`],
          minzoom: source.header.minZoom,
          maxzoom: source.header.maxZoom,
          bounds: [
            source.header.minLon,
            source.header.minLat,
            source.header.maxLon,
            source.header.maxLat,
          ],
          center: [source.header.centerLon, source.header.centerLat, source.header.centerZoom],
          attribution: source.metadata.attribution || '© Protomaps © OpenStreetMap contributors',
        },
      };
    }

    const match = params.url.match(
      /\/map\/(china-overview|shanghai-detail)\/(\d+)\/(\d+)\/(\d+)(?:\?.*)?$/,
    );
    if (!match) throw new Error(`Invalid ${PROTOCOL} protocol URL`);
    const z = Number(match[2]);
    const x = Number(match[3]);
    const y = Number(match[4]);
    const tile = await getTileSafely(source.archive, z, x, y, abortController.signal);
    if (tile) return toTileResult(tile);

    if (source.header.tileType === 1 || source.header.tileType === 6)
      return { data: new Uint8Array() };
    return { data: null };
  };

  maplibregl.addProtocol(PROTOCOL, load);
  return {
    sourceUrls: {
      overview: OVERVIEW_SOURCE_URL,
      detail: DETAIL_SOURCE_URL,
    },
    unregister: () => maplibregl.removeProtocol(PROTOCOL),
  };
}
