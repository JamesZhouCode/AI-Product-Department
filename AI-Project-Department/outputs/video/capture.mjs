// 抓取「产业驱动链」各页面的实拍截图，用于宣传片画面素材。
import { mkdirSync } from 'node:fs';

const pw = await import(
  'file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;

const BASE = 'http://127.0.0.1:5173/';
const OUT = 'D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/video/shots';
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
};

const PLAN = [
  { industry: '储能产业', tabs: ['流程', '图谱', '地图', '分析', '授信', '政策', '行业', '周报'] },
  { industry: '算力产业', tabs: ['流程', '图谱'] },
  { industry: '集成电路', tabs: ['图谱'] },
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

async function gotoTab(name) {
  await page.locator(`.tabbar .nav-group-label:has-text("${GROUP_OF[name]}")`).first().click();
  await page.waitForTimeout(300);
  await page.locator(`.subbar-tabs button:has-text("${name}")`).first().click();
  await page.waitForTimeout(2500);
}

for (const { industry, tabs } of PLAN) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (industry !== '集成电路') {
    await page.locator('select').first().selectOption({ label: industry });
    await page.waitForTimeout(2500);
  }
  for (const tab of tabs) {
    await gotoTab(tab);
    const file = `${OUT}/${industry}-${tab}.png`;
    await page.screenshot({ path: file });
    console.log('saved', file);
  }
}

await browser.close();
console.log('done');
