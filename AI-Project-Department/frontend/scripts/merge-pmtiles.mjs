import fs from 'node:fs';
import path from 'node:path';
import { FileSource, PMTiles } from 'pmtiles';
import { Compression, S2PMTilesWriter, TileType, zxyToTileID } from 's2-pmtiles';
import { FileWriter } from 's2-pmtiles/file';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const inputs = String(args.inputs || '').split(',').filter(Boolean).map((file) => path.resolve(file));
const output = path.resolve(args.output || 'public/map/merged.pmtiles');
const bbox = String(args.bbox || '120.82,30.63,122.15,31.90').split(',').map(Number);
const minZoom = Number(args.minzoom ?? 0);
const maxZoom = Number(args.maxzoom ?? 15);
const concurrency = Math.max(1, Number(args.concurrency || 32));
if (!inputs.length) throw new Error('Pass --inputs=file1.pmtiles,file2.pmtiles');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lonToX = (lon, zoom) => { const n = 2 ** zoom; return clamp(Math.floor(((lon + 180) / 360) * n), 0, n - 1); };
const latToY = (lat, zoom) => { const n = 2 ** zoom; const radians = clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180; return clamp(Math.floor(((1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2) * n), 0, n - 1); };
const tileCoordinates = (zoom) => {
  const [west, south, east, north] = bbox;
  const minX = lonToX(Math.min(west, east), zoom); const maxX = lonToX(Math.max(west, east), zoom);
  const minY = latToY(Math.max(south, north), zoom); const maxY = latToY(Math.min(south, north), zoom);
  const tiles = [];
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) tiles.push([zoom, x, y]);
  return tiles.sort((a, b) => zxyToTileID(...a) - zxyToTileID(...b));
};
async function mapConcurrent(items, worker, limit) {
  const result = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await worker(items[index]); }
  }));
  return result;
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

const archives = inputs.map((file) => {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const bytes = fs.readFileSync(file);
  return new PMTiles(new FileSource(new File([bytes], path.basename(file))));
});
const metadata = await archives[0].getMetadata();
if (fs.existsSync(output)) fs.rmSync(output);
fs.mkdirSync(path.dirname(output), { recursive: true });
const writer = new S2PMTilesWriter(new FileWriter(output), TileType.Pbf, Compression.Gzip);
let attempted = 0; let written = 0;
for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
  const tiles = tileCoordinates(zoom);
  for (let offset = 0; offset < tiles.length; offset += concurrency * 4) {
    const batch = tiles.slice(offset, offset + concurrency * 4);
    const results = await mapConcurrent(batch, async ([z, x, y]) => {
      for (const archive of archives) {
        const tile = await archive.getZxy(z, x, y);
        if (tile?.data?.byteLength) return { z, x, y, data: new Uint8Array(tile.data) };
      }
      return null;
    }, concurrency);
    for (const result of results) {
      attempted += 1;
      if (result) { await writer.writeTileXYZ(result.z, result.x, result.y, result.data); written += 1; }
    }
    if (attempted % 500 < batch.length || offset + batch.length === tiles.length) console.log(`progress ${attempted}/${tiles.length} at z${zoom} · ${written} written`);
  }
}
await writer.commit({ ...metadata, name: `${metadata.name || 'Protomaps Basemap'} · Shanghai offline extract`, description: `${metadata.description || 'Basemap'}; merged offline Shanghai detail archive.` });
patchBounds(output, bbox);
console.log(JSON.stringify({ output, bytes: fs.statSync(output).size, attempted, written }, null, 2));
