import fs from 'node:fs';
import { FileSource, PMTiles } from 'pmtiles';

const files = process.argv.slice(2).length ? process.argv.slice(2) : ['public/map/china-overview.pmtiles', 'public/map/shanghai-detail.pmtiles'];
const results = [];
for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 2).toString() !== 'PM') throw new Error(`${file} is not a PMTiles archive`);
  const archive = new PMTiles(new FileSource(new File([bytes], file)));
  const header = await archive.getHeader();
  const metadata = await archive.getMetadata();
  if (header.tileType !== 1) throw new Error(`${file} is not an MVT archive`);
  results.push({ file, bytes: bytes.length, minZoom: header.minZoom, maxZoom: header.maxZoom, tiles: header.numTileContents, layers: metadata.vector_layers?.length || 0 });
}
console.log(JSON.stringify(results, null, 2));
