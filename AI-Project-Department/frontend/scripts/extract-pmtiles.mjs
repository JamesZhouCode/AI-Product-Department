import fs from 'node:fs';
import path from 'node:path';
import { PMTiles } from 'pmtiles';
import { Compression, S2PMTilesWriter, TileType, zxyToTileID } from 's2-pmtiles';
import { FileWriter } from 's2-pmtiles/file';

const DEFAULT_SOURCE = `https://build.protomaps.com/${process.env.PROTOMAPS_BUILD_DATE || '20260816'}.pmtiles`;
const DEFAULT_CONCURRENCY = Number(process.env.PMTILES_CONCURRENCY || 8);

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));

const sourceUrl = args.source || DEFAULT_SOURCE;
const output = path.resolve(args.output || 'public/map/extracted.pmtiles');
const bbox = String(args.bbox || '73,18,135,54').split(',').map(Number);
const minZoom = Number(args.minzoom ?? 0);
const maxZoom = Number(args.maxzoom ?? 10);
const concurrency = Math.max(1, Number(args.concurrency || DEFAULT_CONCURRENCY));
const batchSize = concurrency * 4;

if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) throw new Error(`Invalid --bbox: ${bbox.join(',')}`);
if (minZoom < 0 || maxZoom < minZoom || maxZoom > 15) throw new Error('Zoom range must be 0 <= minzoom <= maxzoom <= 15.');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lonToX = (lon, zoom) => {
  const n = 2 ** zoom;
  return clamp(Math.floor(((lon + 180) / 360) * n), 0, n - 1);
};
const latToY = (lat, zoom) => {
  const n = 2 ** zoom;
  const radians = (clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180;
  return clamp(Math.floor(((1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2) * n), 0, n - 1);
};

function tileCoordinates(zoom) {
  const [west, south, east, north] = bbox;
  const minX = lonToX(Math.min(west, east), zoom);
  const maxX = lonToX(Math.max(west, east), zoom);
  const minY = latToY(Math.max(south, north), zoom);
  const maxY = latToY(Math.min(south, north), zoom);
  const result = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) result.push([zoom, x, y]);
  }
  return result.sort((a, b) => zxyToTileID(...a) - zxyToTileID(...b));
}

async function mapConcurrent(items, worker, limit) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function getTileWithRetry(archive, z, x, y) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await archive.getZxy(z, x, y);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

function patchBounds(file, [west, south, east, north]) {
  const fd = fs.openSync(file, 'r+');
  const header = Buffer.alloc(25);
  header.writeInt32LE(Math.round(west * 1e7), 0);
  header.writeInt32LE(Math.round(south * 1e7), 4);
  header.writeInt32LE(Math.round(east * 1e7), 8);
  header.writeInt32LE(Math.round(north * 1e7), 12);
  header.writeUInt8(Math.min(maxZoom, 15), 16);
  header.writeInt32LE(Math.round(((west + east) / 2) * 1e7), 17);
  header.writeInt32LE(Math.round(((south + north) / 2) * 1e7), 21);
  fs.writeSync(fd, header, 0, header.length, 102);
  fs.closeSync(fd);
}

if (fs.existsSync(output)) fs.rmSync(output);
fs.mkdirSync(path.dirname(output), { recursive: true });

console.log(JSON.stringify({ source: sourceUrl, output, bbox, minZoom, maxZoom, concurrency }, null, 2));
const archive = new PMTiles(sourceUrl);
const sourceHeader = await archive.getHeader();
const sourceMetadata = await archive.getMetadata();
if (sourceHeader.tileType !== 1) throw new Error(`Expected vector tiles (MVT), got tileType=${sourceHeader.tileType}`);

const writer = new S2PMTilesWriter(new FileWriter(output), TileType.Pbf, Compression.Gzip);
let attempted = 0;
let written = 0;
let failed = 0;
const startedAt = Date.now();

for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
  const tiles = tileCoordinates(zoom);
  console.log(`z${zoom}: ${tiles.length.toLocaleString()} candidate tiles`);
  for (let offset = 0; offset < tiles.length; offset += batchSize) {
    const batch = tiles.slice(offset, offset + batchSize);
    const results = await mapConcurrent(batch, async ([z, x, y]) => {
      try {
        const response = await getTileWithRetry(archive, z, x, y);
        return { z, x, y, data: response ? new Uint8Array(response.data) : null };
      } catch (error) {
        failed += 1;
        console.warn(`tile ${z}/${x}/${y} failed: ${error.message}`);
        return { z, x, y, data: null };
      }
    }, concurrency);
    for (const result of results) {
      attempted += 1;
      if (result.data?.byteLength) {
        await writer.writeTileXYZ(result.z, result.x, result.y, result.data);
        written += 1;
      }
    }
    if (attempted % 500 < batch.length || offset + batch.length === tiles.length) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`progress ${attempted.toLocaleString()} attempted · ${written.toLocaleString()} written · ${failed} failed · ${elapsed}s`);
    }
  }
}

await writer.commit({
  ...sourceMetadata,
  name: `${sourceMetadata.name || 'Protomaps Basemap'} · extracted ${bbox.join(',')}`,
  description: `${sourceMetadata.description || 'Basemap'}; extracted for offline IC industry map demo.`,
});
patchBounds(output, bbox);

const stat = fs.statSync(output);
console.log(JSON.stringify({ output, bytes: stat.size, attempted, written, failed, elapsedSeconds: (Date.now() - startedAt) / 1000 }, null, 2));
