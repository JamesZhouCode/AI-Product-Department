import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const assetRoot = path.join(root, 'public', 'assets');
const apiRoot = 'https://api.github.com/repos/protomaps/basemaps-assets/contents';
const fonts = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const concurrency = Math.max(1, Number(process.env.MAP_ASSET_CONCURRENCY || 8));

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'ic-industry-map-demo' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function download(url, destination) {
  try {
    const stat = await fs.stat(destination);
    if (stat.size > 0) return 'skipped';
  } catch {
    // File does not exist yet.
  }
  const response = await fetch(url, { headers: { 'User-Agent': 'ic-industry-map-demo' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return 'downloaded';
}

async function mapConcurrent(items, worker, limit) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

const tasks = [];
for (const font of fonts) {
  const items = await getJson(`${apiRoot}/fonts/${encodeURIComponent(font)}?ref=main`);
  for (const item of items.filter((entry) => entry.type === 'file' && entry.name.endsWith('.pbf'))) {
    tasks.push({ url: item.download_url, destination: path.join(assetRoot, 'fonts', font, item.name) });
  }
}
for (const name of ['light.json', 'light.png', 'light@2x.json', 'light@2x.png']) {
  tasks.push({
    url: `https://raw.githubusercontent.com/protomaps/basemaps-assets/main/sprites/v4/${encodeURIComponent(name)}`,
    destination: path.join(assetRoot, 'sprites', 'v4', name),
  });
}
tasks.push({
  url: 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/OFL.txt',
  destination: path.join(assetRoot, 'fonts', 'OFL.txt'),
});

console.log(`Preparing ${tasks.length} local font/sprite assets...`);
let completed = 0;
const failed = [];
await mapConcurrent(tasks, async (task) => {
  let attempts = 0;
  while (true) {
    try {
      const status = await download(task.url, task.destination);
      completed += 1;
      if (completed % 25 === 0 || completed === tasks.length) console.log(`${completed}/${tasks.length}`);
      if (status === 'skipped') return;
      return;
    } catch (error) {
      attempts += 1;
      if (attempts >= 5) {
        failed.push({ destination: task.destination, error: error.message });
        completed += 1;
        console.warn(`failed ${task.destination}: ${error.message}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, attempts * 1000 + Math.floor(Math.random() * 500)));
    }
  }
}, concurrency);
console.log(`Map assets ready under ${path.relative(root, assetRoot)}.`);
if (failed.length) {
  console.warn(`${failed.length} assets failed; rerun pnpm download:map-assets to retry missing files.`);
  process.exitCode = 1;
}
