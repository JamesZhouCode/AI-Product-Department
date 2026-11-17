// 入链后页面自检：算力产业流程页 / 打标页 / 图谱页，顺带收集控制台报错。
import { mkdirSync } from 'node:fs';

const pw = await import(
  'file:///C:/Users/周展鹏/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;

const BASE = 'http://127.0.0.1:5177/';
const OUT = 'D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/video/shots-compute';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text().slice(0, 300)}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}\n${(error.stack || '').split('\n').slice(0, 6).join('\n')}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const select = page.locator('select').first();
await select.selectOption({ label: '算力产业' });
await page.waitForTimeout(7000);

const header = await page.locator('.app-shell, body').first().innerText();
console.log('页面前 400 字:', header.replace(/\s+/g, ' ').slice(0, 400));

await page.screenshot({ path: `${OUT}/01-flow-step1.png` });

const steps = page.locator('.flow-step-button');
const stepCount = await steps.count();
console.log('流程步骤数:', stepCount);
if (stepCount >= 3) {
  await steps.nth(2).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/02-step3-heads.png` });
}
if (stepCount >= 5) {
  await steps.nth(4).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/03-step5-tier.png` });
}

// 侧栏切到全景链图
const rail = page.locator('aside').first();
const railText = await rail.innerText().catch(() => '');
console.log('侧栏文本:', railText.replace(/\s+/g, ' ').slice(0, 120));
const atlasBtn = page.getByText('全景链图', { exact: false }).first();
if (await atlasBtn.count()) {
  await atlasBtn.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/04-atlas.png` });
}

console.log('错误数:', errors.length);
for (const item of errors.slice(0, 12)) console.log(' -', item);

await browser.close();
