const pw = await import('file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');
const chromium = pw.chromium || pw.default?.chromum || pw.default?.chromium;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (['error'].includes(m.type())) console.log('[console.error]', m.text().slice(0, 500)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 600), '\n ', (e.stack||'').split('\n').slice(1,5).join('\n')));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.locator('select').first().selectOption({ label: '算力产业' });
await page.waitForTimeout(2000);
for (const name of ['流程','图谱','分析','授信']) {
  try {
    await page.locator(`.subbar-tabs button:has-text("${name}")`).first().click({ timeout: 8000 });
  } catch (e) {
    console.log(`!! 点击 ${name} 失败：`, e.message.split('\n')[0]);
    break;
  }
  await page.waitForTimeout(1800);
  const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').slice(0, 260));
  console.log(`--- ${name} ---`);
  console.log(txt);
}
await page.screenshot({ path: 'debug-credit.png' });
await browser.close();
