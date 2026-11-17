import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateCompany } from '../src/features/credit/creditEngine.js';
import {
  CONCLUSIONS,
  PROJECT_TYPE_LIST,
  buildProjectOverview,
  buildProjectPool,
} from '../src/features/credit/projectCreditEngine.js';
import {
  NEGATIVE_ITEMS,
  NEGATIVE_LEVELS,
  NEGATIVE_SECTIONS,
  negativeSummary,
  scanNegativeHits,
} from '../src/features/credit/negativeList.js';

// 构造最简企业指标：只保留评分引擎与项目测算实际读取的字段。
function metricsFor(index) {
  return {
    quality: 0.5 + (index % 5) * 0.1,
    revenue: 5e8 + index * 3e8,
    revenueGrowth: 0.1,
    grossMargin: 0.25,
    netMargin: 0.12,
    netProfit: 6e7 + index * 1e7,
    ebitda: 1.2e8,
    interestExpense: 1e7,
    operatingCashFlow: index % 3 === 0 ? -2e7 : 8e7,
    cashflowTrap: false,
    totalAssets: 3e9,
    totalLiabilities: 1.5e9,
    debtRatio: index % 4 === 0 ? 0.82 : 0.5,
    interestBearingDebt: 6e8,
    shortTermDebt: 2e8,
    cash: 3e8,
    currentRatio: 1.5,
    quickRatio: 1.1,
    accountsReceivable: 2e8,
    arGrowth: 0.1,
    inventory: 1.5e8,
    inventoryGrowth: 0.1,
    guarantees: index % 6 === 0 ? 2e8 : 0,
    capacityUtilization: 0.8,
    orders: 6e8,
    customerConcentration: index % 5 === 0 ? 0.6 : 0.25,
    topCustomerQuality: 0.7,
    employees: 500,
    foundedYear: 2012,
    registeredCapital: 3e8,
    capital: {
      rounds: 1,
      intentOnly: false,
      investorTier: '产业资本',
      investors: ['某产业基金'],
      evidence: '工商变更',
      stageMatch: '匹配',
      postPerformance: '持平',
      structureRisk: 0.2,
      structureNote: '',
    },
    cluster: {
      name: '算力集群',
      inCluster: true,
      productionInCluster: true,
      realBusinessLinks: true,
      maturity: 4,
      keyPosition: 0.6,
      positionLabel: '集群内企业',
      facilities: 3,
      policySupport: 4,
      homogeneityRisk: 0.3,
      contagionRisk: '低',
      dependencyNote: '',
    },
    tech: {
      maturity: 4,
      barrier: 3,
      reliability: 4,
      certifications: 8,
      techIterRisk: '中',
      rdRatio: 0.06,
      patents: 30,
      techRoute: 'GPU 通用架构',
    },
    trade: {
      supplierStability: 4,
      downstreamQuality: 4,
      arAuthenticity: 4,
      orderAuthenticity: 4,
      chainDependence: 3,
    },
    governance: {
      controllerStability: 5,
      creditRecord: 4,
      litigationCount: 0,
      majorLitigation: false,
      externalGuarantee: false,
      relatedTxRisk: 1,
    },
    events: {},
    operatorExtra: null,
    cniExtra: null,
    keyCustomers: [],
  };
}

const REGIONS = ['北京市', '广东省', '贵州省', '江苏省', '内蒙古自治区', '上海市'];

// 每个环节造 40 家企业，确保项目池能取满各类型的样本数（同环节的两种项目类型也需要各自候选）。
const SECTORS = Array.from(new Set(PROJECT_TYPE_LIST.flatMap((type) => type.sectors)));

function buildEntries() {
  const entries = [];
  let index = 0;
  for (const sector of SECTORS) {
    for (let i = 0; i < 40; i += 1) {
      const company = {
        id: `cp-test-${index}`,
        name: `测试${sector}股份有限公司${index}`,
        stockShort: `测试${index}`,
        chain: '算力基础设施',
        sector,
        segment: '中游',
        type: 'device',
        typeLabel: sector,
        model: 'manufacturer',
        region: { province: REGIONS[index % REGIONS.length], city: '' },
        listed: i === 0,
        headTier: i === 0 ? '龙头' : '骨干',
        evaluated: true,
        metrics: metricsFor(index),
      };
      entries.push({ company, evaluation: evaluateCompany(company) });
      index += 1;
    }
  }
  return entries;
}

const entries = buildEntries();
const projects = buildProjectPool(entries);

test('项目池：覆盖全部项目类型、同输入同输出、id 唯一', () => {
  const expected = PROJECT_TYPE_LIST.reduce((sum, type) => sum + type.count, 0);
  assert.equal(projects.length, expected);
  const types = new Set(projects.map((project) => project.type));
  assert.equal(types.size, PROJECT_TYPE_LIST.length);
  assert.equal(new Set(projects.map((project) => project.id)).size, projects.length);
  const again = buildProjectPool(entries);
  assert.deepEqual(
    again.map((project) => [project.id, project.total, project.dscr, project.conclusion]),
    projects.map((project) => [project.id, project.total, project.dscr, project.conclusion]),
  );
});

test('项目测算：投资、资本金、授信与建议额度自洽', () => {
  for (const project of projects) {
    assert.ok(project.investment > 0, project.name);
    assert.ok(project.loan > 0 && project.loan < project.investment);
    assert.equal(project.capitalAmount, Math.round(project.investment * project.capitalRatio));
    assert.ok(project.capitalRatio >= 0.18 && project.capitalRatio <= 0.46);
    assert.ok(project.suggested <= project.loan);
    assert.ok(project.total >= 0 && project.total <= 100);
    assert.ok(Object.keys(CONCLUSIONS).includes(project.conclusion));
    assert.ok(project.dscr > 0 && project.irr > 0);
    assert.ok(Array.isArray(project.flags));
  }
});

test('项目结论：与负面清单 C4–C7 口径一致', () => {
  for (const project of projects) {
    const complianceAllDone = ['filing', 'energy', 'land', 'efficiency'].every(
      (key) => project.compliance[key].status === 'done',
    );
    if (project.conclusion === 'support') {
      assert.ok(project.total >= 78);
      assert.ok(project.dscr >= 1.3);
      assert.ok(project.capitalRatio >= 0.25);
      assert.ok(complianceAllDone, `${project.name} 存在合规缺口却判定可支持`);
    }
    if (project.conclusion === 'deny') {
      assert.ok(
        project.compliance.filing.status === 'missing' ||
          project.compliance.land.status === 'missing',
      );
      assert.equal(project.suggested, 0);
    }
  }
});

test('项目概览：分档、类型与区域统计可对账', () => {
  const overview = buildProjectOverview(projects);
  assert.equal(overview.total, projects.length);
  assert.equal(
    Object.values(overview.conclusionCounts).reduce((sum, count) => sum + count, 0),
    projects.length,
  );
  assert.equal(
    overview.typeStats.reduce((sum, type) => sum + type.count, 0),
    projects.length,
  );
  assert.equal(
    overview.typeStats.reduce((sum, type) => sum + type.investment, 0),
    overview.investment,
  );
  assert.equal(
    overview.regions.reduce((sum, region) => sum + region.count, 0),
    projects.length,
  );
  assert.equal(
    overview.dscrDist.reduce((sum, bucket) => sum + bucket.count, 0),
    projects.length,
  );
  assert.ok(overview.avgDscr > 0 && overview.avgScore > 0);
});

test('负面清单：条目编号唯一、分类与等级合法、人工核查项不产生命中', () => {
  assert.equal(new Set(NEGATIVE_ITEMS.map((item) => item.code)).size, NEGATIVE_ITEMS.length);
  const sectionKeys = new Set(NEGATIVE_SECTIONS.map((section) => section.key));
  const levelKeys = new Set(Object.keys(NEGATIVE_LEVELS));
  for (const item of NEGATIVE_ITEMS) {
    assert.ok(sectionKeys.has(item.section), item.code);
    assert.ok(levelKeys.has(item.level), item.code);
    assert.ok(['company', 'project'].includes(item.scope), item.code);
    assert.ok(item.rule && item.action && item.basis && item.source, item.code);
    if (item.auto) assert.equal(typeof item.hit, 'function', item.code);
    else assert.equal(item.hit, undefined, item.code);
  }
});

test('负面清单扫描：命中数与汇总口径一致', () => {
  const scan = scanNegativeHits(entries, projects);
  assert.equal(scan.items.length, NEGATIVE_ITEMS.length);
  assert.equal(
    scan.totalHits,
    scan.items.reduce((sum, item) => sum + item.hitCount, 0),
  );
  for (const item of scan.items) {
    if (!item.auto) assert.equal(item.hitCount, 0, item.code);
    assert.equal(item.hitCount, item.hits.length);
  }
  assert.ok(scan.companyHitCount <= entries.length);
  assert.ok(scan.projectHitCount <= projects.length);
  assert.equal(scan.denyHitCompanies <= scan.companyHitCount, true);

  const summary = negativeSummary(scan.items);
  assert.equal(
    summary.counts.deny + summary.counts.strict + summary.counts.watch,
    NEGATIVE_ITEMS.length,
  );
  assert.equal(summary.autoCount + summary.manualCount, NEGATIVE_ITEMS.length);
});
