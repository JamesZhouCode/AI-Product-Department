// 用 Playwright 把每镜 HTML 截成 1920×1080 PNG。
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SLIDES_DIR = join(HERE, 'slides');
const FRAMES_DIR = join(HERE, 'frames');
mkdirSync(FRAMES_DIR, { recursive: true });

const pw = await import(
  'file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;

const files = readdirSync(SLIDES_DIR)
  .filter((name) => name.endsWith('.html'))
  .sort();

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

for (const name of files) {
  await page.goto(`file:///${SLIDES_DIR.replace(/\\/g, '/')}/${name}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  const out = join(FRAMES_DIR, `${name.replace('.html', '')}.png`);
  await page.screenshot({ path: out });
  console.log('frame:', out);
}

await browser.close();
console.log('done');
