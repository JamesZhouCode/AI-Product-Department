// 从本地 PMTiles 底图批量抽取中国境内地名点，生成「地名 → 坐标」词表。
// 用途：给没有门牌级经纬度的客户提供一个**区域参考**落点（省级/地级市级），
// 来源是本地 OSM/Protomaps 底图数据，全部离线、不编造。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { PMTiles } from 'pmtiles';

const FILE = process.argv[2] || './public/map/china-overview.pmtiles';
const OUT = process.argv[3] || './docs/place-gazetteer.json';
const MIN_Z = Number(process.argv[4] || 5);
const MAX_Z = Number(process.argv[5] || 10);
// 只保留「城市级及以上」的地名：市、市辖区、片区、州、国家。
// 底图到 z10 时村里/乡镇级地名占 94%（19.4 万条里的 18.3 万条），全收进来会让
// 词表涨到 24MB，而客户的属地粒度最多到区县，那些细碎地名用不上。
// 关键收益：市辖区（南山区、福田区、番禺区…）在底图里是 z10 的 `city`，
// 只抽到 z8 会完全漏掉，导致这些企业只能退回市级中心点。
const KEEP_KINDS = new Set([
  'city',
  'suburb',
  'borough',
  'quarter',
  'neighbourhood',
  'municipality',
  'state',
  'country',
]);
// 中国范围（含港澳台），略放宽
const BBOX = [72, 17, 136, 55];
const EXTENT = 4096;

// ---- 中国境内过滤 ----
// 抽取 bbox（72–136E, 17–55N）覆盖了蒙古、朝鲜半岛、日本等邻国。只按 bbox 过滤会把
// 境外的**同名**地名一起收进词表，解析时就会把中国企业落到国外 —— 实际发生过：
// 韩国京畿道「广州市」(127.26, 37.43, rank 20) 在按名字去重时击败了中国的广州市，
// 导致 60 家广州企业被放到朝鲜半岛。这里用省界 GeoJSON 做一次真实的空间过滤。
const BOUNDARY_FILE = new URL('../public/data/china-provinces.geojson', import.meta.url);
const provinceFeatures = JSON.parse(fs.readFileSync(BOUNDARY_FILE, 'utf8')).features.filter(
  (f) => f.geometry,
);

function ringContains(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonContains(rings, lng, lat) {
  // GeoJSON 多边形：[外环, ...内环(洞)]
  if (!ringContains(rings[0], lng, lat)) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (ringContains(rings[i], lng, lat)) return false;
  }
  return true;
}

function inChina(lng, lat) {
  for (const feature of provinceFeatures) {
    const { type, coordinates } = feature.geometry;
    if (type === 'Polygon' && polygonContains(coordinates, lng, lat)) return true;
    if (type === 'MultiPolygon' && coordinates.some((p) => polygonContains(p, lng, lat))) {
      return true;
    }
  }
  return false;
}

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  let p = pos;
  while (p < buf.length) {
    const b = buf[p];
    p += 1;
    result += (b & 0x7f) * 2 ** shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [result, p];
}

function readFields(buf) {
  const out = [];
  let p = 0;
  while (p < buf.length) {
    let key;
    [key, p] = readVarint(buf, p);
    const field = key >> 3;
    const wire = key & 7;
    if (wire === 0) {
      let v;
      [v, p] = readVarint(buf, p);
      out.push({ field, wire, value: v });
    } else if (wire === 2) {
      let len;
      [len, p] = readVarint(buf, p);
      out.push({ field, wire, value: buf.subarray(p, p + len) });
      p += len;
    } else if (wire === 5) {
      out.push({ field, wire, value: 0 });
      p += 4;
    } else if (wire === 1) {
      out.push({ field, wire, value: 0 });
      p += 8;
    } else {
      throw new Error(`unsupported wire ${wire}`);
    }
  }
  return out;
}

function readVarints(buf) {
  const out = [];
  let p = 0;
  while (p < buf.length) {
    let v;
    [v, p] = readVarint(buf, p);
    out.push(v);
  }
  return out;
}

function decodeValue(v) {
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
  for (const x of readFields(v)) {
    if (x.field === 1) return new TextDecoder().decode(x.value);
    if (x.field === 2) return dv.getFloat32(0, true);
    if (x.field === 3) return dv.getFloat64(0, true);
    if (x.field >= 4 && x.field <= 6) return Number(x.value);
    if (x.field === 7) return Boolean(x.value);
  }
  return null;
}

function decodeTile(buf) {
  const layers = [];
  for (const f of readFields(buf)) {
    if (f.field !== 3 || f.wire !== 2) continue;
    let name = '';
    const keys = [];
    const values = [];
    const rawFeatures = [];
    for (const x of readFields(f.value)) {
      if (x.field === 1) name = new TextDecoder().decode(x.value);
      else if (x.field === 2 && x.wire === 2) {
        const feat = {};
        for (const y of readFields(x.value)) {
          if (y.field === 2 && y.wire === 2) feat.tags = y.value;
          else if (y.field === 3) feat.type = Number(y.value);
          else if (y.field === 4 && y.wire === 2) feat.geometry = y.value;
        }
        rawFeatures.push(feat);
      } else if (x.field === 3 && x.wire === 2) keys.push(new TextDecoder().decode(x.value));
      else if (x.field === 4 && x.wire === 2) values.push(decodeValue(x.value));
    }
    layers.push({ name, keys, values, features: rawFeatures });
  }
  return layers;
}

function decodePoint(buf) {
  const ints = readVarints(buf);
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < ints.length) {
    const cmd = ints[i];
    i += 1;
    const id = cmd & 7;
    const count = cmd >> 3;
    if (id === 1) {
      x += (ints[i] >> 1) ^ -(ints[i] & 1);
      y += (ints[i + 1] >> 1) ^ -(ints[i + 1] & 1);
      return [x, y];
    }
    if (id === 2) {
      i += 2 * count;
    } else if (id !== 7) {
      return null;
    }
  }
  return null;
}

class NodeFileSource {
  constructor(filePath) {
    this.key = filePath;
  }
  getKey() {
    return this.key;
  }
  async getBytes(offset, length) {
    const fh = await fsp.open(this.key, 'r');
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      const out = buf.subarray(0, bytesRead);
      return { data: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) };
    } finally {
      await fh.close();
    }
  }
}

const lngLatToTile = (lng, lat, z) => {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return [
    Math.floor(((lng + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  ];
};

const tileXToLng = (x, tx, z) => ((tx + x / EXTENT) / 2 ** z) * 360 - 180;
const tileYToLat = (y, ty, z) => {
  const n = Math.PI - (2 * Math.PI * (ty + y / EXTENT)) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

const pm = new PMTiles(new NodeFileSource(FILE));
const header = await pm.getHeader();
console.log(`归档 zoom ${header.minZoom}-${header.maxZoom}`);

const gazetteer = new Map(); // 中文名 -> [候选点, ...]（同名必须全留，见下方说明）
const candidateKeys = new Set();
let tiles = 0;
let missing = 0;

for (let z = MIN_Z; z <= MAX_Z; z += 1) {
  const [x0, y1] = lngLatToTile(BBOX[0], BBOX[1], z);
  const [x1, y0] = lngLatToTile(BBOX[2], BBOX[3], z);
  for (let tx = x0; tx <= x1; tx += 1) {
    for (let ty = y0; ty <= y1; ty += 1) {
      let tile;
      try {
        tile = await pm.getZxy(z, tx, ty);
      } catch {
        continue;
      }
      if (!tile) {
        missing += 1;
        continue;
      }
      tiles += 1;
      let layers;
      try {
        layers = decodeTile(new Uint8Array(tile.data));
      } catch {
        continue;
      }
      const places = layers.find((l) => l.name === 'places');
      if (!places) continue;
      for (const feat of places.features) {
        if (!feat.geometry || feat.type !== 1) continue; // 只要点
        const pt = decodePoint(feat.geometry);
        if (!pt) continue;
        const flat = feat.tags ? readVarints(feat.tags) : [];
        const props = {};
        for (let i = 0; i + 1 < flat.length; i += 2) {
          props[places.keys[flat[i]]] = places.values[flat[i + 1]];
        }
        const zh = props['name:zh-Hans'] || props['name:zh'] || props['name:zh-Hant'] || props.name;
        if (!zh || typeof zh !== 'string') continue;
        const lng = tileXToLng(pt[0], tx, z);
        const lat = tileYToLat(pt[1], ty, z);
        if (lng < BBOX[0] || lng > BBOX[2] || lat < BBOX[1] || lat > BBOX[3]) continue;
        const rec = {
          name: zh,
          lng: Number(lng.toFixed(5)),
          lat: Number(lat.toFixed(5)),
          kind: props.kind || '',
          kindDetail: props.kind_detail || '',
          rank: props.population_rank ?? null,
          capital: props.capital ?? null,
          zoom: z,
        };
        // 同名地名必须**全部保留**：既有跨省重名（「朝阳区」「和平区」「铁西区」），
        // 也有跨国重名（韩国京畿道「广州市」 vs 中国广东省广州市）。原先只留 rank
        // 最小的一条，而 rank 是各国混在一起比较的，韩国的「广州市」(20) 就这样
        // 顶掉了中国的广州市，把 60 家广州企业送上了朝鲜半岛。
        const key = `${zh}|${rec.lng}|${rec.lat}`;
        if (!candidateKeys.has(key)) {
          candidateKeys.add(key);
          if (!gazetteer.has(zh)) gazetteer.set(zh, []);
          gazetteer.get(zh).push(rec);
        }
      }
    }
  }
  console.log(`  z${z} 完成，累计瓦片 ${tiles}，地名 ${gazetteer.size}（候选点 ${candidateKeys.size}）`);
}

// 境内过滤 + 层级过滤 + 展平。境外同名点会把企业带到国外，必须先剔除。
const allCandidates = [...gazetteer.values()].flat();
const inChinaPoints = allCandidates.filter((r) => inChina(r.lng, r.lat));
const records = inChinaPoints
  .filter((r) => KEEP_KINDS.has(r.kindDetail))
  .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name));
const droppedForeign = allCandidates.length - inChinaPoints.length;
const droppedKind = inChinaPoints.length - records.length;
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: `本地 PMTiles 底图（${FILE}）places 图层`,
  coordinateSystem: 'WGS84（OSM/Protomaps 底图原始坐标，未做 GCJ-02 偏移）',
  note: '地名点用于「区域参考」落点：客户只有注册地址、没有门牌级经纬度时，按属地取该地地名点近似，非企业精确位置。已用省界 GeoJSON 过滤，只保留中国境内点；同名地名保留全部候选，供解析时按省份消歧；只保留城市级及以上地名（city/quarter/state 等）。',
  zooms: [MIN_Z, MAX_Z],
  tilesRead: tiles,
  tilesMissing: missing,
  count: records.length,
  names: gazetteer.size,
  droppedForeign,
  droppedKind,
  records,
};
fs.mkdirSync(OUT.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log(
  `\n✓ ${OUT} —— ${records.length} 个地名点 / ${gazetteer.size} 个不同名字` +
    `（丢弃境外点 ${droppedForeign}、非城市级地名 ${droppedKind}；` +
    `读了 ${tiles} 个瓦片，缺 ${missing}）`,
);
