// 抓取「产业驱动链」实拍截图（第二轮：demo 为主）。
// - 三大产业 × 全部页签，1920×1080 视口 + deviceScaleFactor=2（4K 采样，特写放大不糊）；
// - 集成电路也走真实切换（顶栏 select），验证切换功能可用。
import { mkdirSync } from 'node:fs';

const pw = await import(
  'file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;

const BASE = 'http://127.0.0.1:5173/';
const OUT = 'D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/video/shots2';
mkdirSync(OUT, { recursive: true });

const GROUP_OF = {
  流程: '产业建链',
  图谱: '产业建链',
  地图: '产业建链',
  分析: '产业建链',
  授信: '智能决策',
  政策: '智能决策',
  行业: '智能决策',
  周报: '智能决策',
  关注企业: '生态经营',
};

const PLAN = [
  // 宣传片只用「产业建链」版面（智能决策 / 生态经营 尚在开发中，不上片）。
  { industry: '储能产业', tabs: ['流程', '图谱', '地图', '分析'] },
  { industry: '算力产业', tabs: ['流程', '图谱', '地图', '分析'] },
  { industry: '集成电路', tabs: ['流程', '图谱'] },
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

async function gotoTab(name) {
  await page.locator(`.tabbar .nav-group-label:has-text("${GROUP_OF[name]}")`).first().click();
  await page.waitForTimeout(300);
  await page.locator(`.subbar-tabs button:has-text("${name}")`).first().click();
  await page.waitForTimeout(3000);
}

for (const { industry, tabs } of PLAN) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.locator('select').first().selectOption({ label: industry });
  await page.waitForTimeout(3000);
  for (const tab of tabs) {
    await gotoTab(tab);
    const file = `${OUT}/${industry}-${tab}.png`;
    await page.screenshot({ path: file });
    console.log('saved', file);
  }
}

await browser.close();
console.log('done');
