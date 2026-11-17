// 生成画中画（思维导图对应分支 → assets/*.png）：
//   pip-step2.png  ← 分支 5「企业获取渠道（四类）」（STEP 2 用）
//   pip-step5.png  ← 分支 7「头部/腰部/尾部判断」（STEP 5 用）
// 内容取自 G:/对公经营智能化项目/储能产业链企业识别与分层管理系统_思维导图.md。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'assets');
mkdirSync(OUT_DIR, { recursive: true });

const BRANCHES = [
  {
    color: '#0b6e8a',
    name: '① 行业权威名单',
    tag: '优先级最高',
    items: ['CNESA 储能企业名单', '中国电池工业协会', '化学与物理电源行业协会', '工信部锂电规范名单', '上市公司储能业务名单'],
  },
  {
    color: '#b06a1e',
    name: '② 项目反推企业',
    tag: '招标 → 中标 → 入库',
    items: ['储能项目 · 招标公告', '中标企业 · 设备供应商', 'EPC / 系统集成 / 电池', '配件辅材 / 消防温控'],
  },
  {
    color: '#7a3fa0',
    name: '③ 资本市场反推',
    tag: '公告 · 招股书',
    items: ['A 股公告 / IPO 招股书 / 定增', '储能系统 · PCS · BMS · EMS', '结构件 / 胶粘 / 绝缘 / 导热'],
  },
  {
    color: '#2e7d32',
    name: '④ 工商关键词搜索',
    tag: '名称 · 经营范围',
    items: ['储能 / 电池 / 新能源 / 电化学', '集装箱 / 预制舱 / 结构件', '连接器 / 线束 / 铜排'],
  },
];

const branchHtml = BRANCHES.map(
  (b) => `
    <div class="branch">
      <div class="bnode" style="background:${b.color};">
        <div class="bname">${b.name}</div>
        <div class="btag">${b.tag}</div>
      </div>
      <div class="items">
        ${b.items.map((it) => `<div class="item">${it}</div>`).join('')}
      </div>
    </div>`
).join('');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1180px; height: 430px;
    font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
    background: #f6f9fc;
    display: flex; flex-direction: column;
  }
  .head {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 22px 10px;
  }
  .head .title { font-size: 22px; font-weight: 800; color: #12324f; }
  .head .src {
    font-size: 15px; color: #5b7288; background: #e3edf5;
    padding: 3px 12px; border-radius: 999px;
  }
  .body { flex: 1; display: flex; align-items: center; padding: 0 22px 16px; gap: 0; }
  .root {
    width: 118px; align-self: center;
    background: #123a5c; color: #fff; border-radius: 14px;
    text-align: center; padding: 20px 10px;
    font-size: 20px; font-weight: 800; line-height: 1.5;
    box-shadow: 0 4px 14px rgba(18,58,92,0.35);
  }
  .wire { width: 34px; align-self: center; height: 3px; background: #b9cbda; }
  .branches { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  .branch { display: flex; align-items: center; gap: 12px; }
  .bnode {
    width: 208px; color: #fff; border-radius: 10px; padding: 9px 14px;
    box-shadow: 0 3px 10px rgba(0,0,0,0.18);
  }
  .bname { font-size: 18px; font-weight: 700; }
  .btag { font-size: 13px; opacity: 0.85; margin-top: 2px; }
  .items { display: flex; flex-wrap: wrap; gap: 6px; }
  .item {
    font-size: 14.5px; color: #2c4a63; background: #fff;
    border: 1px solid #c7d6e2; border-radius: 999px;
    padding: 4px 12px; white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="head">
    <div class="title">企业获取渠道（四类）</div>
    <div class="src">方法导图 · 分支 5</div>
  </div>
  <div class="body">
    <div class="root">多来源<br>采集</div>
    <div class="wire"></div>
    <div class="branches">${branchHtml}</div>
  </div>
</body>
</html>`;

const htmlPath = join(OUT_DIR, 'pip-step2.html');
writeFileSync(htmlPath, html, 'utf8');

// ---------- 卡片二：STEP 5 头/腰/尾分层判断（分支 7） ----------
const TIERS = [
  {
    color: '#0b6e8a',
    name: '头部企业',
    rule: '满足任意一条即可',
    items: ['行业排名靠前', '上市公司', '龙头企业', '国家级名单企业', '年收入规模较大', '大量项目案例'],
  },
  {
    color: '#b06a1e',
    name: '腰部企业',
    rule: '综合判断',
    items: ['有稳定业务', '有一定市场份额', '区域知名企业', '有项目经验'],
  },
  {
    color: '#2e7d32',
    name: '尾部企业',
    rule: '兜底归类',
    items: ['小规模企业', '初创企业', '业务不明确', '仅具备相关经营范围'],
  },
];

const tierHtml = TIERS.map(
  (t) => `
      <div class="tier">
        <div class="tnode" style="background:${t.color};">
          <div class="tname">${t.name}</div>
          <div class="trule">${t.rule}</div>
        </div>
        <div class="titems">
          ${t.items.map((it) => `<div class="titem">${it}</div>`).join('')}
        </div>
      </div>`
).join('');

const html5 = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1180px; height: 386px;
    font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
    background: #f6f9fc;
    display: flex; flex-direction: column;
  }
  .head { display: flex; align-items: center; gap: 12px; padding: 14px 22px 8px; }
  .head .title { font-size: 22px; font-weight: 800; color: #12324f; }
  .head .src {
    font-size: 15px; color: #5b7288; background: #e3edf5;
    padding: 3px 12px; border-radius: 999px;
  }
  .body { flex: 1; display: flex; gap: 16px; padding: 4px 22px 12px; }
  .tier { flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .tnode {
    color: #fff; border-radius: 10px; padding: 10px 16px;
    text-align: center; box-shadow: 0 3px 10px rgba(0,0,0,0.18);
  }
  .tname { font-size: 20px; font-weight: 800; }
  .trule { font-size: 13.5px; opacity: 0.85; margin-top: 2px; }
  .titems { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; align-content: flex-start; }
  .titem {
    font-size: 15px; color: #2c4a63; background: #fff;
    border: 1px solid #c7d6e2; border-radius: 999px;
    padding: 5px 14px; white-space: nowrap;
  }
  .foot {
    margin: 0 22px 12px; padding: 8px 16px;
    background: #fff7dd; border: 1px solid #ecd9a0; border-radius: 10px;
    font-size: 15.5px; color: #6b5312;
  }
  .foot b { color: #4a3200; }
</style>
</head>
<body>
  <div class="head">
    <div class="title">头部 / 腰部 / 尾部 · 分层判断逻辑</div>
    <div class="src">方法导图 · 分支 7</div>
  </div>
  <div class="body">${tierHtml}</div>
  <div class="foot"><b>原则：</b>不做复杂评分，用简单规则 + 硬门槛兜底（避免大而不强误判）· 当前先覆盖储能行业上市企业（237 家）</div>
</body>
</html>`;

const html5Path = join(OUT_DIR, 'pip-step5.html');
writeFileSync(html5Path, html5, 'utf8');

const pw = await import(
  'file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
);
const chromium = pw.chromium || pw.default?.chromium;
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
for (const [name, w, h] of [
  ['pip-step2', 1180, 430],
  ['pip-step5', 1180, 386],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(`file:///${join(OUT_DIR, `${name}.html`).replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  await page.close();
  console.log('pip ->', join(OUT_DIR, `${name}.png`));
}
await browser.close();
