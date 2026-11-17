// 关系入链后的页面自检：流程第 4 步关系图 + 企业详情的关系明细面板。
import { mkdirSync } from 'node:fs';

const pw = await import(
  'file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;
const BASE = 'http://127.0.0.1:5178/';
const OUT = 'D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/video/shots-relations';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
});

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(1500);

// 切到算力产业
await page.locator('select').first().selectOption({ label: '算力产业' });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${OUT}/00-flow.png` });

// 第 4 步：链内关系
const stepButtons = page.locator('.flow-step-button');
console.log('step buttons:', await stepButtons.count());
if ((await stepButtons.count()) >= 4) {
  await stepButtons.nth(3).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/01-step4-relations.png` });
}

// 顶栏关系计数
const summary = await page.locator('.dataset-summary').innerText().catch(() => '');
console.log('HEADER:', summary.replace(/\n/g, ' | '));

// 打开一家有完整数据的企业：走流程页第 2 步的企业 chip
const chip = page
  .locator('button, .chip, [class*=chip]')
  .filter({ hasText: '中科寒武纪' })
  .first();
if (await chip.count()) {
  await chip.click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/02-detail-top.png` });
  const panel = page.locator('.equity-section, .trade-section').first();
  if (await panel.count()) {
    await panel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/03-detail-relations.png` });
    console.log('PANEL TEXT:', (await panel.innerText()).slice(0, 600).replace(/\n/g, ' | '));
  } else {
    console.log('未找到股权/交易面板');
  }
} else {
  console.log('未找到寒武纪 chip');
}

console.log('ERRORS:', errors.length);
errors.slice(0, 6).forEach((e) => console.log('  -', e));
await browser.close();
