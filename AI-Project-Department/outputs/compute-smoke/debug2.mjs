const pw = await import('file:///C:/Users/%E5%91%A8%E5%B1%95%E9%B9%8F/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');
const chromium = pw.chromium || pw.default?.chromium;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 700)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 400)); });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.locator('select').first().selectOption({ label: '算力产业' });
await page.waitForTimeout(2000);
await page.locator(`.subbar-tabs button:has-text("分析")`).first().click({ timeout: 8000 });
for (const wait of [1500, 4000, 6000]) {
  await page.waitForTimeout(wait);
  const info = await page.evaluate(() => ({
    subbar: Boolean(document.querySelector('.subbar-tabs')),
    buttons: [...document.querySelectorAll('.subbar-tabs button')].map((b) => b.textContent.trim()).join(','),
    bodyLen: document.body.innerText.length,
  }));
  console.log(wait, JSON.stringify(info));
}
await browser.close();
