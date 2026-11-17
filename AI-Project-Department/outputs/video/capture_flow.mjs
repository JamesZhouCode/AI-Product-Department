// 补拍：流程页「STEP 03 头部企业打标」状态（储能产业）。
import { mkdirSync } from 'node:fs';

const pw = await import(
  'file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;

const BASE = 'http://127.0.0.1:5173/';
const OUT = 'D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/video/shots2';
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

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.locator('select').first().selectOption({ label: '储能产业' });
await page.waitForTimeout(2500);

await page.locator('.tabbar .nav-group-label:has-text("产业建链")').first().click();
await page.waitForTimeout(300);
await page.locator('.subbar-tabs button:has-text("流程")').first().click();
await page.waitForTimeout(2500);

// 建链四步：0 骨架 / 1 上市入链 / 2 头部打标 / 3 关系
const buttons = page.locator('.flow-step-button');
console.log('step buttons:', await buttons.count());
await buttons.nth(2).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/储能产业-流程-头部打标.png` });

await browser.close();
console.log('done');
