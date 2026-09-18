import fs from 'node:fs';
import path from 'node:path';
import { FileSource, PMTiles } from 'pmtiles';
import { Compression, S2PMTilesWriter, TileType, zxyToTileID } from 's2-pmtiles';
import { FileWriter } from 's2-pmtiles/file';

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const [key, ...rest] = item.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }),
);

const input = path.resolve(args.input || 'public/map/china-overview.pmtiles');
const output = path.resolve(args.output || 'public/map/china-overview-subset.pmtiles');
const bbox = String(args.bbox || '73,18,135,54')
  .split(',')
  .map(Number);
const minZoom = Number(args.minzoom ?? 0);
const maxZoom = Number(args.maxzoom ?? 8);
const concurrency = Math.max(1, Number(args.concurrency || 32));

if (input === output) throw new Error('Input and output must be different files.');
if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
  throw new Error(`Invalid --bbox: ${bbox.join(',')}`);
}
if (minZoom < 0 || maxZoom < minZoom || maxZoom > 26) {
  throw new Error('Zoom range must be 0 <= minzoom <= maxzoom <= 26.');
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lonToX = (lon, zoom) => {
  const n = 2 ** zoom;
  return clamp(Math.floor(((lon + 180) / 360) * n), 0, n - 1);
};
const latToY = (lat, zoom) => {
  const n = 2 ** zoom;
  const radians = (clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180;
  return clamp(
    Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * n),
    0,
    n - 1,
  );
};
const tileCoordinates = (zoom) => {
  const [west, south, east, north] = bbox;
  const minX = lonToX(Math.min(west, east), zoom);
  const maxX = lonToX(Math.max(west, east), zoom);
  const minY = latToY(Math.max(south, north), zoom);
  const maxY = latToY(Math.min(south, north), zoom);
  const tiles = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) tiles.push([zoom, x, y]);
  }
  return tiles.sort((a, b) => zxyToTileID(...a) - zxyToTileID(...b));
};

async function mapConcurrent(items, worker, limit) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

function patchBounds(file) {
  const [west, south, east, north] = bbox;
  const fd = fs.openSync(file, 'r+');
  const header = Buffer.alloc(25);
  header.writeInt32LE(Math.round(west * 1e7), 0);
  header.writeInt32LE(Math.round(south * 1e7), 4);
  header.writeInt32LE(Math.round(east * 1e7), 8);
  header.writeInt32LE(Math.round(north * 1e7), 12);
  header.writeUInt8(maxZoom, 16);
  header.writeInt32LE(Math.round(((west + east) / 2) * 1e7), 17);
  header.writeInt32LE(Math.round(((south + north) / 2) * 1e7), 21);
  fs.writeSync(fd, header, 0, header.length, 102);
  fs.closeSync(fd);
}

if (!fs.existsSync(input)) throw new Error(`Missing input archive: ${input}`);
fs.rmSync(output, { force: true });
fs.mkdirSync(path.dirname(output), { recursive: true });

const bytes = fs.readFileSync(input);
const archive = new PMTiles(new FileSource(new File([bytes], path.basename(input))));
const sourceHeader = await archive.getHeader();
const sourceMetadata = await archive.getMetadata();
if (sourceHeader.tileType !== TileType.Pbf) {
  throw new Error(`Expected vector tiles (MVT), got tileType=${sourceHeader.tileType}`);
}

console.log(JSON.stringify({ input, output, bbox, minZoom, maxZoom, concurrency }, null, 2));
const writer = new S2PMTilesWriter(new FileWriter(output), TileType.Pbf, Compression.Gzip);
let attempted = 0;
let written = 0;

for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
  const tiles = tileCoordinates(zoom);
  const results = await mapConcurrent(
    tiles,
    async ([z, x, y]) => ({ z, x, y, tile: await archive.getZxy(z, x, y) }),
    concurrency,
  );
  for (const { z, x, y, tile } of results) {
    attempted += 1;
    if (tile?.data?.byteLength) {
      await writer.writeTileXYZ(z, x, y, new Uint8Array(tile.data));
      written += 1;
    }
  }
  console.log(
    `z${zoom}: ${tiles.length.toLocaleString()} requested · ${written.toLocaleString()} written`,
  );
}

await writer.commit({
  ...sourceMetadata,
  name: `${sourceMetadata.name || 'Protomaps Basemap'} · lightweight overview`,
  description: `${sourceMetadata.description || 'Basemap'}; reduced to z${minZoom}-z${maxZoom} for the offline demo.`,
});
patchBounds(output);

console.log(
  JSON.stringify(
    { output, bytes: fs.statSync(output).size, attempted, written, minZoom, maxZoom },
    null,
    2,
  ),
);
