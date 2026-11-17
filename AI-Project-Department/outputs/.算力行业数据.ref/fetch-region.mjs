import fs from 'node:fs';

const base = 'https://push2.eastmoney.com/api/qt/clist/get';
const fsParam = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048';
const all = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageUrl = (pn) =>
  `${base}?pn=${pn}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(fsParam)}&fields=f12,f14,f100,f102`;

async function getPage(pn) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(pageUrl(pn), { headers: { Referer: 'https://quote.eastmoney.com/' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json())?.data?.diff || [];
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(300 * attempt);
    }
  }
  return [];
}

for (let pn = 1; pn <= 62; pn += 1) {
  const diff = await getPage(pn);
  for (const row of diff) all.set(row.f12, { code: row.f12, name: row.f14, industry: row.f100, province: row.f102 });
  if (pn % 10 === 0) process.stdout.write(`pages ${pn}, rows ${all.size}\n`);
  await sleep(60);
}
fs.writeFileSync('ashare-region.json', JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), total: all.size, rows: [...all.values()] }, null, 0));
console.log('saved', all.size);
