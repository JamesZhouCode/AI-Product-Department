import { chromium } from '/Users/naylen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173';
const consoleErrors = [];
const externalRequests = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('request', (request) => {
  if (
    /^https?:/.test(request.url()) &&
    !request.url().startsWith(baseUrl) &&
    !request.url().startsWith('http://localhost:5173')
  )
    externalRequests.push(request.url());
});
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const mapDebug = await page.evaluate(() => ({
  map: Boolean(window.__icMap),
  loaded: window.__icMap?.loaded(),
  sources: Object.keys(window.__icMap?.getStyle()?.sources || {}),
  layers: window.__icMap
    ?.getStyle()
    ?.layers?.map((layer) => layer.id)
    .slice(-8),
  canvas: [window.__icMap?.getCanvas()?.width, window.__icMap?.getCanvas()?.height],
  features: window.__icMap?.queryRenderedFeatures()?.length,
  rects: Object.fromEntries(
    ['.workspace', '.map-stage', '.map-canvas', '#root'].map((selector) => [
      selector,
      (() => {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        return r && [r.x, r.y, r.width, r.height];
      })(),
    ]),
  ),
  mapCanvasStyle: (() => {
    const el = document.querySelector('.map-canvas');
    const s = el && getComputedStyle(el);
    return (
      s && {
        position: s.position,
        top: s.top,
        bottom: s.bottom,
        height: s.height,
        display: s.display,
      }
    );
  })(),
}));

const industrySmokeCases = [
  { label: '集成电路', total: 4477, listed: 230, relations: 332 },
  { label: '电力装备（含储能）', total: 115, listed: 40, relations: 8 },
  { label: '生物医药', total: 95, listed: 55, relations: 11 },
  { label: '人工智能', total: 6571, listed: 367, relations: 16 },
];
const industryMatrix = [];
const industryPicker = page.locator('.industry-switcher select');
for (const expected of industrySmokeCases) {
  await industryPicker.selectOption({ label: expected.label });
  await page.waitForFunction(
    ({ total, listed, relations }) => {
      const summary =
        document.querySelector('.dataset-summary')?.innerText.replace(/\s/g, '') || '';
      return (
        summary.includes(`${total}家企业`) &&
        summary.includes(`${listed}家上市企业`) &&
        summary.includes(`${relations}条上市企业关系`)
      );
    },
    expected,
    { timeout: 5000 },
  );
  await page.waitForFunction(() => window.__icMap?.loaded(), { timeout: 5000 });
  industryMatrix.push(
    await page.evaluate(
      (label) => ({
        label,
        selected: document.querySelector('.industry-switcher select')?.value === label,
        mapLoaded: Boolean(window.__icMap?.loaded()),
        legend: Array.from(document.querySelectorAll('.map-legend .legend-row-colors > span')).map(
          (element) => element.textContent?.trim(),
        ),
      }),
      expected.label,
    ),
  );
}
await industryPicker.selectOption({ label: '集成电路' });
await page.waitForFunction(
  () =>
    document.querySelector('.dataset-summary')?.innerText.replace(/\s/g, '').includes('4477家企业'),
  { timeout: 5000 },
);
if (industryMatrix.some(({ selected, mapLoaded }) => !selected || !mapLoaded)) {
  throw new Error(`产业链切换冒烟失败：${JSON.stringify(industryMatrix)}`);
}
await page.screenshot({ path: '/tmp/ic-map-demo.png', fullPage: true });
const mapLegendText = await page.locator('.map-legend').innerText();
const mapLegendHasLocationStatus = /精准点位|候选点位|区域参考|待精确校验|待核点/.test(
  mapLegendText,
);
const mapLegendRowCount = await page.locator('.map-legend .legend-row').count();
const mapChainLegendLabels = await page
  .locator('.map-legend .legend-row-colors > span')
  .allTextContents();
const bankLegendHidden =
  (await page
    .locator(
      '.map-legend .legend-contact-key, .map-legend .legend-bank-key, .map-legend .legend-credit-key',
    )
    .count()) === 0;
const title = await page.locator('.brand-title').innerText();
const datasetSummary = await page.locator('.dataset-summary').innerText();
const offlineStatusRemoved = (await page.locator('.offline-pill').count()) === 0;
const leftHeadingHidden = (await page.locator('.rail-heading').count()) === 0;
const researchStatusHidden = (await page.locator('.summary-status').count()) === 0;
const scopeLabels = await page.locator('.segmented button').allTextContents();
const mappedScopeCountVisible = scopeLabels.some((label) => /^全部企业（\d+）$/.test(label));
const listedScopeCountVisible = scopeLabels.some((label) => /^上市企业（\d+）$/.test(label));
const listedCompanyDataCount = await page.evaluate(async () => {
  const response = await fetch(new URL('data/companies.json', window.location.href));
  const payload = await response.json();
  return payload.companies.filter((company) => company.tags?.includes('上市企业')).length;
});
const listedScopeCount = Number(scopeLabels[0].match(/（(\d+)）/)?.[1] || 0);
const listedScopeCountMatchesData = listedScopeCount === listedCompanyDataCount;
const scopeButtons = page.locator('.segmented button');
await scopeButtons.first().click();
await page.waitForTimeout(250);
const listedScopeActive = await scopeButtons
  .first()
  .evaluate((element) => element.classList.contains('active'));
const listedScopeSourceAudit = await page.evaluate(() => {
  const features = window.__icMap?.querySourceFeatures('companies') || [];
  const pointFeatures = features.filter(
    (feature) => feature.properties?.id && !feature.properties?.cluster,
  );
  return {
    pointCount: pointFeatures.length,
    allVisiblePointsListed: pointFeatures.every((feature) => feature.properties?.listed === true),
  };
});
await scopeButtons.nth(1).click();
await page.waitForTimeout(150);
const initialDetailEmpty =
  (await page.locator('.right-rail').count()) === 0 &&
  (await page.locator('.empty-detail').count()) === 0;
const initialVisitPriorityCardHidden = (await page.locator('.visit-priority-card').count()) === 0;
const filterSelects = page.locator('.filter-field select');
const filterSelectCount = await filterSelects.count();
const filterFieldLabels = await page.locator('.filter-field > span').allTextContents();
const industryFilterLabels = await page.locator('.industry-switcher option').allTextContents();
const hasIntegratedCircuitIndustry = industryFilterLabels.includes('集成电路');
const industrySwitcherCount = await page.locator('.industry-switcher').count();
const singleIndustrySwitcher = industrySwitcherCount === 1;
const noLocalIndustryFilter = !filterFieldLabels.some((label) => label === '产业链');
const noSecondaryChainFilter = !filterFieldLabels.some((label) => label.includes('二级'));
const regionSelectCount = filterFieldLabels.filter((label) =>
  ['省', '市', '区'].includes(label),
).length;
const provinceSelect = page.locator('select[aria-label="省"]');
const citySelect = page.locator('select[aria-label="市"]');
const districtSelect = page.locator('select[aria-label="区"]');
const cityInitiallyDisabled = await citySelect.isDisabled();
const districtInitiallyDisabled = await districtSelect.isDisabled();
const ordinaryProvinceValue = await provinceSelect.locator('option').evaluateAll((options) => {
  const directMunicipalities = new Set(['北京市', '上海市', '天津市', '重庆市']);
  return (
    options.find((option) => option.value && !directMunicipalities.has(option.value))?.value || ''
  );
});
let ordinaryProvinceCityEnabled = false;
let ordinaryProvinceDistrictDisabled = false;
let ordinaryCityDistrictEnabled = false;
const mapTagLabels = await page.locator('.map-tag-pill').allTextContents();
const mapTagCount = mapTagLabels.length;
const mapTagAvailableCount = await page.locator('.map-tag-pill.available').count();
const mapTagReservedCount = await page.locator('.map-tag-pill.reserved').count();
const mapTagHasIndustryLeader = mapTagLabels.includes('行业领袖');
const mapTagHasRevenueTop100 = mapTagLabels.includes('营收百强');
const mapTagHasManufacturingTop100 = mapTagLabels.includes('制造业百强');
const mapTagHasRemovedListedEnterprise = !mapTagLabels.includes('上市企业');
const mapTagHasSingleChampion = mapTagLabels.includes('单项冠军');
const mapTagHasUnicorn = mapTagLabels.includes('独角兽');
const mapTagHasImportExportTop500 = mapTagLabels.includes('进出口500强');
const mapTagHasCreditPlanning = mapTagLabels.includes('信贷规划');
const mapTagHasGazelle = mapTagLabels.includes('瞪羚');
const mapTagHasTechnologyCompany = mapTagLabels.includes('科技型');
const mapTagHasRemovedUnsupportedLabels = !mapTagLabels.some((label) =>
  ['未开客户号', '未开户', '重点项目', '产业园/商圈'].some((item) => label.includes(item)),
);
const mapTagNoneActive = (await page.locator('.map-tag-pill.active').count()) === 0;
await page.locator('.map-tag-pill.available', { hasText: '行业领袖' }).click();
await page.waitForTimeout(100);
const mapTagIndustryLeaderActive = await page
  .locator('.map-tag-pill.available', { hasText: '行业领袖' })
  .evaluate((element) => element.classList.contains('active'));
await page.locator('.map-tag-pill.available', { hasText: '营收百强' }).click();
await page.waitForTimeout(100);
const mapTagMultiSelectCount = await page.locator('.map-tag-pill.active').count();
const mapTagMultiSelectWorks = mapTagMultiSelectCount === 2;
await page.locator('.map-tag-pill.available', { hasText: '营收百强' }).click();
await page.locator('.map-tag-pill.available', { hasText: '行业领袖' }).click();
await page.waitForTimeout(100);
const mapTagNoneRestored = (await page.locator('.map-tag-pill.active').count()) === 0;
if (ordinaryProvinceValue) {
  await provinceSelect.selectOption({ value: ordinaryProvinceValue });
  await page.waitForTimeout(50);
  ordinaryProvinceCityEnabled = !(await citySelect.isDisabled());
  ordinaryProvinceDistrictDisabled = await districtSelect.isDisabled();
  const ordinaryCityValue = await citySelect
    .locator('option')
    .evaluateAll((options) => options.find((option) => option.value)?.value || '');
  if (ordinaryCityValue) {
    await citySelect.selectOption({ value: ordinaryCityValue });
    await page.waitForTimeout(50);
    ordinaryCityDistrictEnabled = !(await districtSelect.isDisabled());
  }
}
await page.locator('.top-actions button', { hasText: '全国' }).click();
await page.waitForTimeout(80);
await page.locator('.top-actions button', { hasText: '上海' }).click();
await page.waitForTimeout(80);
const topShanghaiSynced =
  (await provinceSelect.inputValue()) === '上海市' &&
  ((await citySelect.count()) === 0 || (await citySelect.inputValue()) === '上海市');
if (await provinceSelect.locator('option', { hasText: '上海市' }).count()) {
  await provinceSelect.selectOption({ label: '上海市' });
  await page.waitForTimeout(50);
}
if (
  (await citySelect.count()) &&
  (await citySelect.locator('option', { hasText: '上海市' }).count())
) {
  await citySelect.selectOption({ label: '上海市' });
  await page.waitForTimeout(50);
}
const districtOptionCount = await districtSelect.locator('option').count();
const districtEnabled = !(await districtSelect.isDisabled());
const hasPudongOption =
  (await districtSelect.locator('option', { hasText: '浦东新区' }).count()) > 0;
const hasAdvancedToggle = await page.locator('.advanced-toggle').count();
const globalLocationReviewCardHidden = (await page.locator('.pending-review-card').count()) === 0;
const globalLocationReviewPanelHidden = (await page.locator('.pending-panel').count()) === 0;
const globalLocationReviewRowsHidden = (await page.locator('.pending-row').count()) === 0;
const visitPriorityCleared = (await page.locator('.visit-priority-card').count()) === 0;
await provinceSelect.selectOption({ label: '上海市' });
await page.waitForTimeout(30);
if ((await citySelect.count()) && !(await citySelect.isDisabled())) {
  await citySelect.selectOption({ label: '上海市' });
  await page.waitForTimeout(50);
}
await page.locator('.top-actions button', { hasText: '上海' }).click();
await page.waitForTimeout(120);
await page.locator('input[placeholder="搜索企业、环节、技术"]').fill('中芯国际');
await page.waitForTimeout(150);
const filtered = await page.locator('input[placeholder="搜索企业、环节、技术"]').inputValue();
await page.locator('.primary-button').click();
await page.waitForTimeout(250);
await page.evaluate(() => window.__icMap?.easeTo({ zoom: 11, duration: 0 }));
await page.waitForTimeout(350);
await page.waitForFunction(
  () =>
    (window.__icMap?.querySourceFeatures('companies') || []).some((feature) =>
      String(feature.properties?.name || '').includes('中芯国际'),
    ),
  { timeout: 5000 },
);
const targetCoordinates = await page.evaluate(() => {
  const feature = (window.__icMap?.querySourceFeatures('companies') || []).find((item) =>
    String(item.properties?.name || '').includes('中芯国际'),
  );
  return feature?.geometry?.coordinates || null;
});
if (targetCoordinates) {
  await page.evaluate((coordinates) => {
    window.__icMap?.easeTo({ center: coordinates, zoom: 11, duration: 0 });
  }, targetCoordinates);
}
await page.waitForTimeout(350);
await page.waitForFunction(
  () =>
    (window.__icMap?.queryRenderedFeatures({ layers: ['company-points'] }) || []).some((feature) =>
      String(feature.properties?.name || '').includes('中芯国际'),
    ),
  { timeout: 5000 },
);
const focusedZoom = await page.evaluate(() => Number(window.__icMap?.getZoom()?.toFixed(1)));
const selectedPoint = await page.evaluate(() => {
  const map = window.__icMap;
  const feature = map
    ?.queryRenderedFeatures({ layers: ['company-points'] })
    .find((item) => String(item.properties?.name || '').includes('中芯国际'));
  if (!feature) return null;
  const point = map.project(feature.geometry.coordinates);
  const rect = document.querySelector('.map-canvas')?.getBoundingClientRect();
  return rect ? { x: rect.x + point.x, y: rect.y + point.y } : null;
});
if (selectedPoint) {
  await page.mouse.click(selectedPoint.x, selectedPoint.y);
  await page.waitForTimeout(200);
}
const relationNames = await page.locator('.relation-row b').allTextContents();
const relationHasOutsideRegion = relationNames.some((name) =>
  ['南大光电', '北方华创'].includes(name),
);
const relationSummaryRemoved = (await page.locator('.relation-summary').count()) === 0;
const relationHelpRemoved = (await page.locator('.relation-help').count()) === 0;
const visitPriorityCardVisible = (await page.locator('.visit-priority-card').count()) === 1;
const visitPriorityScore = await page.locator('.visit-priority-score-value').innerText();
const visitPriorityFactors = await page.locator('.visit-priority-factors').innerText();
const visitPriorityHasImportance = visitPriorityFactors.includes('企业重要度');
const visitPriorityHasOtherBank = visitPriorityFactors.includes('他行存量客户');
const visitPriorityHasNoDistance = !visitPriorityFactors.includes('距离');
const visitPriorityOtherBankPending = visitPriorityFactors.includes('待核实');
const visitPriorityMeterValue = await page
  .locator('.visit-priority-meter')
  .getAttribute('aria-valuenow');
const selectedVerifiedLocationNoteHidden =
  (await page.locator('.detail-location-note').count()) === 0;
const mapSelectionBadgeRemoved = (await page.locator('.map-selection-badge').count()) === 0;
const companyDetailLiveDotRemoved = (await page.locator('.right-rail .live-dot').count()) === 0;
const bankRelationControlVisible = (await page.locator('.bank-relation-select').count()) === 1;
await page.evaluate(() => window.__icMap?.easeTo({ zoom: 11, duration: 0 }));
await page.waitForTimeout(350);
await page.locator('.bank-relation-select').selectOption('contacted');
await page.waitForTimeout(600);
const bankContactedLabel = await page.locator('.bank-relation-select option:checked').innerText();
const bankContactedMapState = await page.evaluate(() => {
  const map = window.__icMap;
  const point = map
    ?.queryRenderedFeatures({ layers: ['company-points'] })
    .find((item) => String(item.properties?.name || '').includes('中芯国际'));
  const check = map
    ?.queryRenderedFeatures({ layers: ['contacted-company-check'] })
    .find((item) => String(item.properties?.name || '').includes('中芯国际'));
  return {
    circleVisible: Boolean(point),
    checkVisible: Boolean(check),
    checkIconRegistered: Boolean(map?.hasImage('contacted-check')),
  };
});
const marketingText = '冒烟验证：已完成首次沟通，下一步安排技术交流。';
await page.locator('.marketing-log-input').fill(marketingText);
await page.locator('.marketing-log-actions button').click();
await page.waitForTimeout(120);
const marketingRecordSaved =
  (await page.locator('.marketing-log-item p', { hasText: marketingText }).count()) === 1;
await page.locator('.bank-relation-select').selectOption('customer');
await page.waitForTimeout(600);
const bankCustomerMapState = await page.evaluate(() => {
  const map = window.__icMap;
  const point = map
    ?.queryRenderedFeatures({ layers: ['company-points'] })
    .find((item) => String(item.properties?.name || '').includes('中芯国际'));
  const symbol = map
    ?.queryRenderedFeatures({ layers: ['bank-company-symbol'] })
    .find((item) => String(item.properties?.name || '').includes('中芯国际'));
  return {
    circleVisible: Boolean(point),
    bankSymbolVisible: Boolean(symbol),
    bankIconRegistered: Boolean(map?.hasImage('bank-badge')),
  };
});
const bankMarkerVariants = await page.evaluate(() => {
  const map = window.__icMap;
  return {
    contactedIconRegistered: Boolean(map?.hasImage('contacted-check')),
    customerIconRegistered: Boolean(map?.hasImage('bank-badge')),
    hasContactedCheckLayer: Boolean(map?.getLayer('contacted-company-check')),
    contactedCheckColorIsWhite:
      map?.getPaintProperty('contacted-company-check', 'icon-color') === '#ffffff',
  };
});
await page.locator('.bank-relation-select').selectOption('credit');
await page.waitForTimeout(600);
const bankCreditMapState = await page.evaluate(() => {
  const map = window.__icMap;
  const symbol = map
    ?.queryRenderedFeatures({ layers: ['bank-company-symbol'] })
    .find((item) => String(item.properties?.name || '').includes('中芯国际'));
  const badge = map
    ?.queryRenderedFeatures({ layers: ['bank-credit-badge'] })
    .find((item) => String(item.properties?.name || '').includes('中芯国际'));
  return {
    bankSymbolVisible: Boolean(symbol),
    creditBadgeVisible: Boolean(badge),
    creditIconRegistered: Boolean(map?.hasImage('credit-shield')),
  };
});
await page.locator('.bank-relation-select').selectOption('none');
await page.waitForTimeout(80);
await page.locator('.bank-relation-select').selectOption('contacted');
await page.waitForTimeout(120);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.locator('input[placeholder="搜索企业、环节、技术"]').fill('中芯国际');
await page.waitForTimeout(150);
const persistedCoordinates = await page.evaluate(() => {
  const feature = (window.__icMap?.querySourceFeatures('companies') || []).find((item) =>
    String(item.properties?.name || '').includes('中芯国际'),
  );
  return feature?.geometry?.coordinates || null;
});
if (persistedCoordinates) {
  await page.evaluate((coordinates) => {
    window.__icMap?.easeTo({ center: coordinates, zoom: 11, duration: 0 });
  }, persistedCoordinates);
  await page.waitForTimeout(350);
}
const persistedPoint = await page.evaluate(() => {
  const map = window.__icMap;
  const feature = map
    ?.queryRenderedFeatures({ layers: ['company-points'] })
    .find((item) => String(item.properties?.name || '').includes('中芯国际'));
  if (!feature) return null;
  const point = map.project(feature.geometry.coordinates);
  const rect = document.querySelector('.map-canvas')?.getBoundingClientRect();
  return rect ? { x: rect.x + point.x, y: rect.y + point.y } : null;
});
if (persistedPoint) {
  await page.mouse.click(persistedPoint.x, persistedPoint.y);
  await page.waitForTimeout(180);
}
const bankRelationPersisted =
  (await page.locator('.bank-relation-select').inputValue()) === 'contacted';
const marketingRecordPersisted =
  (await page.locator('.marketing-log-item p', { hasText: marketingText }).count()) === 1;
await page.locator('input[placeholder="搜索企业、环节、技术"]').fill('澜起科技');
await page.waitForTimeout(150);
const taggedCompanyCoordinates = await page.evaluate(() => {
  const feature = (window.__icMap?.querySourceFeatures('companies') || []).find((item) =>
    String(item.properties?.name || '').includes('澜起科技'),
  );
  return feature?.geometry?.coordinates || null;
});
if (taggedCompanyCoordinates) {
  await page.evaluate((coordinates) => {
    window.__icMap?.easeTo({ center: coordinates, zoom: 11, duration: 0 });
  }, taggedCompanyCoordinates);
  await page.waitForTimeout(350);
}
const taggedCompanyPoint = await page.evaluate(() => {
  const map = window.__icMap;
  const feature = map
    ?.queryRenderedFeatures({ layers: ['company-points'] })
    .find((item) => String(item.properties?.name || '').includes('澜起科技'));
  if (!feature) return null;
  const point = map.project(feature.geometry.coordinates);
  const rect = document.querySelector('.map-canvas')?.getBoundingClientRect();
  return rect ? { x: rect.x + point.x, y: rect.y + point.y } : null;
});
if (taggedCompanyPoint) {
  await page.mouse.click(taggedCompanyPoint.x, taggedCompanyPoint.y);
  await page.waitForTimeout(180);
}
const tagEditButtonVisible = (await page.locator('.tag-edit-button').count()) === 1;
await page.locator('.tag-edit-button').click();
const tagEditorVisible = (await page.locator('.tag-editor').count()) === 1;
const tagEditorOptionCount = await page.locator('.tag-editor-option').count();
await page.locator('.tag-editor-option', { hasText: '行业领袖' }).click();
await page.locator('.tag-editor-save').click();
await page.waitForTimeout(120);
const tagEditedLabelVisible = (await page.locator('.tag-row').innerText()).includes('行业领袖');
await page.locator('.tag-edit-button').click();
await page.locator('.tag-editor-option', { hasText: '行业领袖' }).click();
if ((await page.locator('.tag-editor-option.selected').count()) === 0) {
  const fallbackTag = await page.locator('.tag-editor-option').evaluateAll((elements) => {
    const candidate = elements.find(
      (element) =>
        element.textContent?.trim() !== '行业领袖' &&
        element.textContent?.trim() !== '上市企业' &&
        element.getAttribute('aria-pressed') !== 'true',
    );
    return candidate?.textContent?.trim() || '';
  });
  if (fallbackTag) {
    await page.locator('.tag-editor-option', { hasText: fallbackTag }).click();
  }
}
await page.locator('.tag-editor-save').click();
await page.waitForTimeout(120);
const tagEditedLabelRemoved = !(await page.locator('.tag-row').innerText()).includes('行业领袖');
await page.locator('.bank-relation-select').selectOption('none');
await page.waitForTimeout(80);
await page.locator('.top-actions button', { hasText: '全国' }).click();
await page.waitForTimeout(80);
const topChinaSynced =
  (await provinceSelect.inputValue()) === '' &&
  ((await citySelect.count()) === 0 || (await citySelect.inputValue()) === '') &&
  (await districtSelect.inputValue()) === '';
await page.locator('.tab-button', { hasText: '图谱' }).click();
await page.waitForTimeout(100);
const fishboneTabActive =
  (await page.locator('.tab-button[aria-selected="true"]', { hasText: '图谱' }).count()) === 1;
const fishboneVisible = (await page.locator('.ic-atlas-page').count()) === 1;
const fishboneSecondaryCardCount = await page.locator('.ic-atlas-stage-card').count();
const fishboneSecondaryLabels = await page.locator('.ic-atlas-stage-card h3').allTextContents();
const fishboneTertiaryNodeCount = await page.locator('.ic-atlas-node').count();
const fishboneResearchCount = await page.locator('.ic-atlas-toolbar-summary b').first().innerText();
const fishboneLocalIndustryPickerRemoved =
  (await page.locator('.ic-atlas-industry-picker').count()) === 0;
const fishboneGlobalIndustryValue = await industryPicker.inputValue();
const fishboneGlobalIndustryLabel = await page.locator('.industry-switcher > span').innerText();
const fishboneGlobalIndustryIsGeneric = fishboneGlobalIndustryLabel === '当前产业链';
const fishboneHasIntegratedCircuitTitle = (
  await page.locator('.ic-atlas-title-lockup').innerText()
).includes('集成电路');
const fishboneHasIndustryMapTitle = (
  await page.locator('.ic-atlas-title-lockup').innerText()
).includes('产业链图谱');
const fishboneRelationAttributeCount = await page.locator('.ic-atlas-node-count em').count();
const fishboneHasRedundantGuideRail =
  (await page.locator('.ic-atlas-sidebar, .ic-atlas-scope-line, .ic-atlas-spine-row').count()) ===
  0;
await page.locator('.ic-atlas-node').first().click();
await page.waitForTimeout(80);
const fishboneDrawerVisible = (await page.locator('.ic-atlas-drawer').count()) === 1;
const fishboneDrawerCompanyCount = await page.locator('.ic-atlas-company-row').count();
await page.locator('.ic-atlas-drawer-top button').click();
await page.waitForTimeout(50);
const fishboneToggleVisible = (await page.locator('.ic-atlas-toggle').count()) === 1;
const fishboneExpandedByDefault = await page
  .locator('.ic-atlas-toggle')
  .evaluate((element) => element.classList.contains('active'));
const fishboneCompanyTagCount = await page.locator('.ic-atlas-company-chip').count();
await page.locator('.ic-atlas-company-chip').first().click();
await page.waitForTimeout(50);
const fishboneCompanyDetailVisible =
  (await page
    .locator('.ic-atlas-company-detail-rail .company-detail-rail-scroll .detail-content')
    .count()) === 1;
const fishboneCompanyDetailHasPriority =
  (await page
    .locator('.ic-atlas-company-detail-rail .company-detail-rail-scroll .visit-priority-card')
    .count()) === 1;
const fishboneCompanyDetailHasRelations =
  (await page
    .locator('.ic-atlas-company-detail-rail .company-detail-rail-scroll .relation-list')
    .count()) === 1;
const fishboneCompanyDetailHeader = await page
  .locator('.ic-atlas-company-detail-rail .detail-header .eyebrow')
  .innerText();
const fishboneCompanyDetailClearLabel = await page
  .locator('.ic-atlas-company-detail-rail .close-detail')
  .innerText();
const fishboneDrawerFitsGraphShell = await page
  .locator('.ic-atlas-company-detail-rail')
  .evaluate((drawer) => {
    const shell = drawer.closest('.ic-atlas-graph-shell');
    if (!shell) return false;
    const drawerRect = drawer.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return (
      drawerRect.top >= shellRect.top &&
      drawerRect.right <= shellRect.right &&
      drawerRect.bottom <= shellRect.bottom
    );
  });
await page.locator('.ic-atlas-company-detail-rail .close-detail').click();
await page.locator('.ic-atlas-toggle').click();
await page.waitForTimeout(50);
const fishboneCompanyTagCountCollapsed = await page.locator('.ic-atlas-company-chip').count();
await page.locator('.ic-atlas-toggle').click();
await page.waitForTimeout(50);
const mapRelationToggleHidden = (await page.locator('.filter-inline-actions').count()) === 0;
await page.locator('.ic-atlas-node').first().click();
await page.locator('.ic-atlas-company-chip').first().click();
await page.keyboard.press('Escape');
await page.waitForTimeout(50);
const fishboneCompanyDetailClosedByEscape =
  (await page.locator('.ic-atlas-company-detail-rail').count()) === 0;
await page.screenshot({ path: '/tmp/ic-fishbone.png', fullPage: true });
await page.locator('.tab-button', { hasText: '周报' }).click();
await page.waitForTimeout(100);
const reportTabActive =
  (await page.locator('.tab-button[aria-selected="true"]', { hasText: '周报' }).count()) === 1;
const reportVisible = (await page.locator('.report-page').count()) === 1;
const reportLocalIndustryPickerRemoved =
  (await page.locator('.report-page .analysis-chain-picker').count()) === 0;
const reportGlobalIndustryPickerOptions = await industryPicker.locator('option').allTextContents();
await industryPicker.selectOption({ label: '集成电路' });
await page.waitForTimeout(50);
const reportIndustrySynced =
  (await industryPicker.inputValue()) === '集成电路' &&
  (await page.locator('.report-title-row h1').innerText()).includes('集成电路');
const reportHasReadoutSection =
  (await page.locator('.report-brief h2', { hasText: '本周研判' }).count()) === 1;
const reportHasCompanySection =
  (await page.locator('.report-focus h2', { hasText: '上市企业观察' }).count()) === 1;
const reportSecondaryLabels = await page.locator('.chain-scan-name b').allTextContents();
await page.screenshot({ path: '/tmp/ic-report.png', fullPage: true });
await page.locator('.tab-button', { hasText: '地图' }).click();
await page.waitForTimeout(100);
const mapTabActive =
  (await page.locator('.tab-button[aria-selected="true"]', { hasText: '地图' }).count()) === 1;
const mapVisibleAfterTabSwitch = await page.locator('.map-stage').isVisible();
const mapExpandButtonVisible = (await page.locator('.map-expand-button').count()) === 1;
await page.locator('.map-expand-button').click();
await page.waitForTimeout(120);
const mapFullscreenActive = (await page.locator('.app-shell.map-fullscreen').count()) === 1;
const mapFullscreenLeftRailVisible = await page.locator('.left-rail').isVisible();
const mapFullscreenRightRailVisible =
  (await page.locator('.right-rail').count()) === 1 &&
  (await page.locator('.right-rail').isVisible());
const mapFullscreenRect = await page.locator('.map-stage').evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)];
});
await page.locator('.map-expand-button').click();
await page.waitForTimeout(120);
const mapFullscreenExited = (await page.locator('.app-shell.map-fullscreen').count()) === 0;
console.log(
  JSON.stringify(
    {
      initialVisitPriorityCardHidden,
      visitPriorityCardVisible,
      visitPriorityScore,
      visitPriorityHasImportance,
      visitPriorityHasOtherBank,
      visitPriorityHasNoDistance,
      visitPriorityOtherBankPending,
      visitPriorityMeterValue,
      visitPriorityCleared,
      selectedVerifiedLocationNoteHidden,
      mapExpandButtonVisible,
      mapFullscreenActive,
      mapFullscreenLeftRailVisible,
      mapFullscreenRightRailVisible,
      mapFullscreenRect,
      mapFullscreenExited,
      mapTagMultiSelectCount,
      mapTagMultiSelectWorks,
      mapSelectionBadgeRemoved,
      companyDetailLiveDotRemoved,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      title,
      datasetSummary,
      offlineStatusRemoved,
      filtered,
      focusedZoom,
      initialDetailEmpty,
      filterSelectCount,
      filterFieldLabels,
      industryFilterLabels,
      hasIntegratedCircuitIndustry,
      industrySwitcherCount,
      singleIndustrySwitcher,
      noLocalIndustryFilter,
      noSecondaryChainFilter,
      regionSelectCount,
      mapTagCount,
      mapTagLabels,
      mapTagAvailableCount,
      mapTagReservedCount,
      mapTagHasIndustryLeader,
      mapTagHasRevenueTop100,
      mapTagHasManufacturingTop100,
      mapTagHasRemovedListedEnterprise,
      mapTagHasSingleChampion,
      mapTagHasUnicorn,
      mapTagHasImportExportTop500,
      mapTagHasCreditPlanning,
      mapTagHasGazelle,
      mapTagHasTechnologyCompany,
      mapTagHasRemovedUnsupportedLabels,
      mapTagNoneActive,
      mapTagIndustryLeaderActive,
      mapTagNoneRestored,
      districtOptionCount,
      districtEnabled,
      cityInitiallyDisabled,
      districtInitiallyDisabled,
      ordinaryProvinceCityEnabled,
      ordinaryProvinceDistrictDisabled,
      ordinaryCityDistrictEnabled,
      hasPudongOption,
      hasAdvancedToggle,
      topShanghaiSynced,
      topChinaSynced,
      mapLegendRowCount,
      mapChainLegendLabels,
      mapLegendHasLocationStatus,
      bankLegendHidden,
      leftHeadingHidden,
      researchStatusHidden,
      scopeLabels,
      mappedScopeCountVisible,
      listedScopeCountVisible,
      listedCompanyDataCount,
      listedScopeCount,
      listedScopeCountMatchesData,
      listedScopeActive,
      listedScopeSourceAudit,
      industryMatrix,
      globalLocationReviewCardHidden,
      globalLocationReviewPanelHidden,
      globalLocationReviewRowsHidden,
      selectedPoint,
      relationCountInShanghai: relationNames.length,
      relationHasOutsideRegion,
      relationSummaryRemoved,
      relationHelpRemoved,
      bankRelationControlVisible,
      bankContactedLabel,
      marketingRecordSaved,
      bankRelationPersisted,
      marketingRecordPersisted,
      tagEditButtonVisible,
      tagEditorVisible,
      tagEditorOptionCount,
      tagEditedLabelVisible,
      tagEditedLabelRemoved,
      bankMarkerVariants,
      bankContactedMapState,
      bankCustomerMapState,
      bankCreditMapState,
      fishboneTabActive,
      fishboneVisible,
      fishboneSecondaryCardCount,
      fishboneSecondaryLabels,
      fishboneTertiaryNodeCount,
      fishboneResearchCount,
      fishboneLocalIndustryPickerRemoved,
      fishboneGlobalIndustryValue,
      fishboneGlobalIndustryLabel,
      fishboneGlobalIndustryIsGeneric,
      fishboneRelationAttributeCount,
      fishboneHasRedundantGuideRail,
      fishboneDrawerVisible,
      fishboneDrawerCompanyCount,
      fishboneToggleVisible,
      fishboneExpandedByDefault,
      fishboneCompanyTagCount,
      fishboneCompanyTagCountCollapsed,
      fishboneCompanyDetailVisible,
      fishboneCompanyDetailHasPriority,
      fishboneCompanyDetailHasRelations,
      fishboneCompanyDetailHeader,
      fishboneCompanyDetailClearLabel,
      fishboneDrawerFitsGraphShell,
      fishboneCompanyDetailClosedByEscape,
      fishboneHasIntegratedCircuitTitle,
      fishboneHasIndustryMapTitle,
      reportTabActive,
      reportVisible,
      reportLocalIndustryPickerRemoved,
      reportGlobalIndustryPickerOptions,
      reportIndustrySynced,
      reportHasReadoutSection,
      reportHasCompanySection,
      reportSecondaryLabels,
      mapTabActive,
      mapVisibleAfterTabSwitch,
      mapRelationToggleHidden,
      mapDebug,
      consoleErrors,
      externalRequests,
    },
    null,
    2,
  ),
);
await browser.close();
