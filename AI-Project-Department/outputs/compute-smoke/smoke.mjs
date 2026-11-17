// 算力产业切换的浏览器冒烟：切到「算力产业」后逐个页签检查是否渲染了算力内容。
// 只做观测与截图，不改代码；控制台报错会一并收集。
import { mkdirSync } from 'node:fs';

const pw = await import(
  'file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;

const BASE = 'http://127.0.0.1:5173/';
const OUT = 'D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/compute-smoke';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`PAGEERROR ${err.message}`));

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

async function tab(name) {
  // 先切一级分组（二级页签只显示当前分组的页签），再点二级页签。
  await page.locator(`.tabbar .nav-group-label:has-text("${GROUP_OF[name]}")`).first().click();
  await page.waitForTimeout(400);
  await page.locator(`.subbar-tabs button:has-text("${name}")`).first().click();
  await page.waitForTimeout(1800);
}

async function report(label) {
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200));
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
  return text;
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 切换到算力产业
const switcher = page.locator('select').first();
const options = await switcher.locator('option').allTextContents();
console.log('产业链选项：', options.join(' | '));
await switcher.selectOption({ label: '算力产业' });
await page.waitForTimeout(2500);

const results = {};
results.map = await report('01-map');
await tab('流程');
results.flow = await report('02-flow');
await tab('图谱');
results.fishbone = await report('03-fishbone');
await tab('分析');
results.analysis = await report('04-analysis');
await tab('授信');
results.credit = await report('05-credit');
await tab('政策');
results.policy = await report('06-policy');
await tab('行业');
results.macro = await report('07-macro');
await tab('周报');
results.report = await report('08-report');
await tab('关注企业');
results.eco = await report('09-eco');

for (const [key, text] of Object.entries(results)) {
  const hasStorageOnly = /本页仅面向储能|请通过右上角产业链切换至储能|储能产业链与当前链不匹配/.test(text);
  console.log(`\n===== ${key} =====`);
  console.log(text.slice(0, 420));
  if (hasStorageOnly) console.log('!! 仍出现「仅面向储能」类提示');
}

console.log('\n控制台错误数：', errors.length);
errors.slice(0, 12).forEach((item) => console.log(' -', item));

await browser.close();
