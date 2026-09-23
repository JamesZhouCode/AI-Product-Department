// 生成「储能产业链智能授信」演示数据。
//
// 企业名单与链路归属直接取自 public/data/industries/companies-storage.json
// （即《全量客户清单.xlsx》237 家上市客户 + 1740 家非上市客户的入链结果）。
// 财务 / 经营 / 技术 / 治理 / 风险事件等授信指标均为确定性模拟数据：
// 同一 id 每次生成结果一致，便于页面回归与演示。
//
// 用法：pnpm prepare:credit
// 输出：public/data/credit/storage-credit-mock.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEGMENT_BY_CHAIN,
  SECTOR_TYPE,
  TYPE_PROFILE,
} from '../src/features/credit/creditConfig.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'public', 'data', 'industries', 'companies-storage.json');
const outputDir = path.join(rootDir, 'public', 'data', 'credit');
const outputPath = path.join(outputDir, 'storage-credit-mock.json');

const SALT = 'credit-mock-v1';

function hashSeed(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (min, max, t) => min + (max - min) * t;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pick = (rnd, items) => items[Math.floor(rnd() * items.length) % items.length];

// 区间内对数均匀取值，适配营收这类跨数量级的量。
const logUniform = (rnd, min, max) => Math.exp(lerp(Math.log(min), Math.log(max), rnd()));

const REVENUE_BASE = {
  listed: { 龙头: [2e9, 8e10], 骨干: [5e8, 1e10], 长尾: [1.5e8, 3e9] },
  nonListed: [3e7, 1.5e9],
};

function revenueBaseFor(company, rnd) {
  const listed = company.tags?.includes('上市企业');
  if (!listed) return logUniform(rnd, REVENUE_BASE.nonListed[0], REVENUE_BASE.nonListed[1]);
  const tier = company.research?.additionalFields?.headTier || '长尾';
  const range = REVENUE_BASE.listed[tier] || REVENUE_BASE.listed.长尾;
  return logUniform(rnd, range[0], range[1]);
}

function generateMetrics(company, rnd) {
  const sector = company.tertiarySector || company.sector || '';
  const typeKey = SECTOR_TYPE[sector] || 'service';
  const profile = TYPE_PROFILE[typeKey];
  const listed = company.tags?.includes('上市企业');
  const headTier = company.research?.additionalFields?.headTier || null;

  let q = rnd(); // 综合质量因子：驱动毛利、现金流质量、杠杆的整体水平。
  // 拉伸为双极分布，避免客户全部集中在中间层级。
  q = clamp(0.5 + (q - 0.5) * 1.9, 0, 1);
  const revenueNow = revenueBaseFor(company, rnd);
  const growth = profile.growth;
  const g0 = lerp(growth[0], growth[1], rnd());
  const g1 = lerp(growth[0], growth[1], rnd());
  const revenuePrev = revenueNow / (1 + g0);
  const revenuePrev2 = revenuePrev / (1 + g1);

  const excellent = q >= 0.8; // 头部优质客户：撑起「少而精」的第一层。
  const distressed = q <= 0.2; // 困难客户：集中于第三层的真实组合形态。
  const marginBoost = excellent ? 1.25 : distressed ? 0.3 : 1;

  const grossMargin = clamp(lerp(profile.margin[0], profile.margin[1], 0.25 + 0.75 * q) * (excellent ? 1.12 : distressed ? 0.78 : 1), 0.02, 0.68);
  let netMargin = grossMargin * lerp(0.12, 0.58, rnd()) * lerp(0.6, 1.25, q) * marginBoost;
  if (rnd() < 0.07 && !excellent && !distressed) netMargin = -lerp(0.01, 0.06, rnd()); // 少数企业亏损。
  netMargin = clamp(netMargin, -0.12, 0.5);

  const netProfit = revenueNow * netMargin;
  // 约 10% 的企业构造「利润增长但经营现金流承压」的典型风险形态。
  const cashflowTrap = !excellent && rnd() < 0.1 && g0 > 0.05;
  const baseOcfQuality = lerp(-0.5, 1.6, q * 0.7 + rnd() * 0.3);
  const ocfQuality = cashflowTrap ? lerp(-1.4, -0.2, rnd()) : excellent ? Math.max(baseOcfQuality, 1.0) : distressed ? Math.min(baseOcfQuality, -0.2) : baseOcfQuality;
  const ocfNow = clamp(netProfit * ocfQuality + revenueNow * lerp(0.0, 0.05, rnd()), -revenueNow * 0.2, revenueNow * 0.35);
  const ocfPrev = ocfNow * lerp(0.7, 1.5, rnd());
  const ocfPrev2 = ocfPrev * lerp(0.7, 1.5, rnd());

  const assetHeavy = lerp(profile.assetHeavy[0], profile.assetHeavy[1], rnd());
  const totalAssets = revenueNow * assetHeavy;
  const debtBase = profile.model === 'operator' ? [0.5, 0.8] : profile.model === 'service' ? [0.2, 0.55] : [0.28, 0.72];
  const debtRatio = clamp(lerp(debtBase[0], debtBase[1], rnd()) * (excellent ? 0.85 : distressed ? 1.2 : 1), 0.12, 0.88);
  const totalLiabilities = totalAssets * debtRatio;
  const interestBearingDebt = totalLiabilities * lerp(0.25, 0.72, rnd());
  const interestExpense = interestBearingDebt * lerp(0.03, 0.05, rnd());
  const ebitda = netProfit + interestExpense + revenueNow * lerp(0.02, 0.09, rnd());
  const cash = revenueNow * lerp(0.03, 0.28, rnd());
  const stDebt = interestBearingDebt * lerp(0.2, 0.8, rnd());

  const arNow = revenueNow * lerp(profile.arRatio[0], profile.arRatio[1], rnd());
  const arGrowth = lerp(-0.05, 0.65, rnd());
  const arPrev = arNow / (1 + arGrowth);
  const arPrev2 = arPrev / (1 + lerp(-0.05, 0.6, rnd()));
  const invNow = revenueNow * lerp(profile.invRatio[0], profile.invRatio[1], rnd());
  const invGrowth = lerp(-0.05, 0.55, rnd());
  const invPrev = invNow / (1 + invGrowth);

  const currentRatio = lerp(0.75, 2.6, rnd());
  const quickRatio = Math.max(0.35, currentRatio - lerp(0.15, 0.7, rnd()));
  const capacityUtilization = clamp(
    lerp(profile.utilRange[0], profile.utilRange[1], rnd()) * (distressed ? 0.65 : 1),
    0.15,
    excellent ? 0.98 : 0.95,
  );
  const orderMultiple = profile.model === 'project' ? [0.5, 2.2] : [0.15, 1.2];
  const orders = revenueNow * (excellent ? lerp(1.05, 2.2, rnd()) : lerp(orderMultiple[0], orderMultiple[1], rnd()));
  const concentrationBase = profile.model === 'project' ? [0.15, 0.75] : [0.08, 0.6];
  const customerConcentration = clamp(
    lerp(concentrationBase[0], concentrationBase[1], rnd()) * (excellent ? 0.6 : 1) + (distressed ? 0.22 : 0),
    0.05,
    0.9,
  );
  const customerQualityBase = profile.model === 'operator' || typeKey === 'chainLeader' ? [0.5, 1] : [0.15, 0.95];
  const topCustomerQuality = clamp(
    lerp(customerQualityBase[0], customerQualityBase[1], rnd()) * (excellent ? 1.1 : distressed ? 0.6 : 1),
    0.05,
    1,
  );
  const guarantees = rnd() < 0.25 ? totalAssets * lerp(0.01, 0.18, rnd()) : 0;
  const employees = Math.round(revenueNow / lerp(6e5, 2.5e6, rnd()));
  const foundedYear = 1993 + Math.floor(rnd() * 30);
  const registeredCapital = logUniform(rnd, 1e6, 5e9);

  const techBase = { device: 4, cell: 4, pcs: 4, bms: 4, ems: 3, testing: 4, operator: 3, service: 2, materials: 3 };
  const base5 = techBase[typeKey] ?? 3;
  const near = (value) => clamp(Math.round(value + lerp(-0.8, 0.8, rnd())), 1, 5);
  const tech = {
    maturity: excellent ? 5 : near(base5 + (q > 0.6 ? 1 : 0)),
    barrier: excellent ? 5 : near(base5 - 1 + (headTier === '龙头' ? 1 : 0)),
    reliability: excellent ? 5 : near(base5),
    certifications: excellent ? 6 + Math.floor(rnd() * 18) : Math.floor(logUniform(rnd, 1, 30)),
    techIterRisk: excellent ? '低' : pick(rnd, ['低', '低', '中', '中', '高']),
    rdRatio: excellent
      ? lerp(0.08, 0.14, rnd())
      : lerp(profile.model === 'operator' ? 0.004 : 0.02, profile.model === 'operator' ? 0.02 : 0.12, rnd()),
    patents: Math.floor(logUniform(rnd, 2, 600)),
    techRoute: pick(rnd, [
      '锂离子 / 磷酸铁锂',
      '钠离子电池',
      '液流电池（全钒）',
      '压缩空气储能',
      '构网型储能技术',
      '智能组串式',
      '高压级联方案',
    ]),
  };

  const scale5 = () => clamp(1 + Math.floor(rnd() * 5), 1, 5);
  const trade = excellent
    ? {
        supplierStability: 4 + Math.round(rnd()),
        downstreamQuality: 5,
        arAuthenticity: 4 + Math.round(rnd()),
        orderAuthenticity: 4 + Math.round(rnd()),
        chainDependence: 3 + Math.round(rnd()),
      }
    : {
        supplierStability: scale5(),
        downstreamQuality: clamp(Math.round(1 + topCustomerQuality * 4), 1, 5),
        arAuthenticity: rnd() < 0.12 ? scale5() : 4,
        orderAuthenticity: rnd() < 0.1 ? scale5() : 4,
        chainDependence: scale5(),
      };

  const litigationCount = rnd() < 0.62 ? 0 : Math.floor(rnd() * 3);
  const governance = {
    controllerStability: rnd() < 0.85 ? 4 + Math.round(rnd()) : scale5(),
    creditRecord: rnd() < 0.88 ? 4 + Math.round(rnd()) : scale5(),
    litigationCount,
    majorLitigation: rnd() < 0.03,
    externalGuarantee: guarantees > 0,
    relatedTxRisk: rnd() < 0.85 ? 1 + Math.floor(rnd() * 2) : scale5(),
  };

  // 红线 / 风险事件（稀疏触发，个别事件由财务形态直接推导）。
  const ocfDebtRatio = interestBearingDebt > 0 ? ocfNow / interestBearingDebt : 0;
  const events = {
    majorDefault: false,
    majorDishonesty: rnd() < 0.008,
    fraudRisk: rnd() < 0.004,
    fundOccupation: rnd() < 0.006,
    ocfPersistentDeterioration: ocfNow < 0 && ocfPrev < 0,
    borrowToRepay: rnd() < 0.03,
    shortDebtLongTerm: stDebt / Math.max(interestBearingDebt, 1) > 0.72 && rnd() < 0.5,
    arAbnormalGrowth: arGrowth > 0.45 && arNow / Math.max(revenueNow, 1) > 0.35,
    inventoryAbnormal: invGrowth > 0.4 && invNow / Math.max(revenueNow, 1) > 0.25,
    shortDebtPressure: stDebt / Math.max(cash + Math.max(ocfNow, 0), 1) > 2.2,
    capacityLow: capacityUtilization < 0.45,
    coreCustomerLoss: rnd() < 0.02,
    productReplaced: tech.techIterRisk === '高' && rnd() < 0.2,
    orderCancel: rnd() < 0.02,
    safetyIncident: rnd() < 0.008,
  };
  if (profile.model === 'operator' || profile.model === 'project' || profile.model === 'cni') {
    events.projectNotGridConnected = rnd() < 0.02;
    events.revenueUnclear = rnd() < 0.03;
    events.insuranceMissing = rnd() < 0.04;
  }

  const operatorExtra =
    profile.model === 'operator'
      ? {
          projectIrr: lerp(0.035, 0.115, rnd()),
          dscr: lerp(0.85, 1.7, rnd()),
          pricePolicyRisk: pick(rnd, ['低', '中', '中', '高']),
          batteryDecayRate: lerp(0.018, 0.045, rnd()),
        }
      : null;
  const cniExtra =
    profile.model === 'cni'
      ? {
          paybackYears: lerp(4, 9.5, rnd()),
          peakValleySpread: lerp(0.45, 1.2, rnd()),
          ownerCreditRisk: pick(rnd, ['低', '中', '高']),
        }
      : null;
  if (operatorExtra && operatorExtra.dscr < 0.95) events.projectCashflowFail = true;

  return {
    quality: Number(q.toFixed(3)),
    revenue: Math.round(revenueNow),
    revenueSeries: [Math.round(revenuePrev2), Math.round(revenuePrev), Math.round(revenueNow)],
    revenueGrowth: Number(g0.toFixed(4)),
    grossMargin: Number(grossMargin.toFixed(4)),
    netMargin: Number(netMargin.toFixed(4)),
    netProfit: Math.round(netProfit),
    netProfitSeries: [
      Math.round(revenuePrev2 * netMargin * lerp(0.8, 1.2, rnd())),
      Math.round(revenuePrev * netMargin * lerp(0.9, 1.15, rnd())),
      Math.round(netProfit),
    ],
    ebitda: Math.round(ebitda),
    interestExpense: Math.round(interestExpense),
    operatingCashFlow: Math.round(ocfNow),
    ocfSeries: [Math.round(ocfPrev2), Math.round(ocfPrev), Math.round(ocfNow)],
    cashflowTrap,
    totalAssets: Math.round(totalAssets),
    totalLiabilities: Math.round(totalLiabilities),
    debtRatio: Number(debtRatio.toFixed(4)),
    interestBearingDebt: Math.round(interestBearingDebt),
    shortTermDebt: Math.round(stDebt),
    cash: Math.round(cash),
    currentRatio: Number(currentRatio.toFixed(2)),
    quickRatio: Number(quickRatio.toFixed(2)),
    accountsReceivable: Math.round(arNow),
    arSeries: [Math.round(arPrev2), Math.round(arPrev), Math.round(arNow)],
    arGrowth: Number(arGrowth.toFixed(4)),
    inventory: Math.round(invNow),
    inventorySeries: [Math.round(invPrev * lerp(0.8, 1.2, rnd())), Math.round(invPrev), Math.round(invNow)],
    inventoryGrowth: Number(invGrowth.toFixed(4)),
    guarantees: Math.round(guarantees),
    capacityUtilization: Number(capacityUtilization.toFixed(3)),
    orders: Math.round(orders),
    customerConcentration: Number(customerConcentration.toFixed(3)),
    topCustomerQuality: Number(topCustomerQuality.toFixed(2)),
    employees,
    foundedYear,
    registeredCapital: Math.round(registeredCapital),
    tech,
    trade,
    governance,
    events,
    operatorExtra,
    cniExtra,
    keyCustomers: [],
  };
}

function main() {
  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const companies = [];
  const idByName = new Map();

  for (const company of raw.companies) {
    idByName.set(company.name, company.id);
  }

  // 演示「高分 + 重大违约 → 一票否决」场景：选一家龙头电芯链上市企业。
  let vetoDemoName = null;
  const vetoCandidate = raw.companies.find(
    (item) =>
      item.tags?.includes('上市企业') &&
      item.research?.additionalFields?.headTier === '龙头' &&
      (item.chain === '电池与核心部件' || item.chain === '系统集成与工程建设'),
  );
  if (vetoCandidate) vetoDemoName = vetoCandidate.name;

  let evaluatedCount = 0;
  for (const company of raw.companies) {
    const sector = company.tertiarySector || company.sector || '';
    const typeKey = SECTOR_TYPE[sector] || 'service';
    const profile = TYPE_PROFILE[typeKey];
    const listed = company.tags?.includes('上市企业');
    const additional = company.research?.additionalFields || {};
    const rnd = mulberry32(hashSeed(`${SALT}:${company.id}`));
    const evaluated = listed || rnd() < 0.55;

    const record = {
      id: company.id,
      name: company.name,
      stockShort: additional.stockShort || '',
      stockCode: additional.stockCode || '',
      chain: company.chain || '待研判',
      sector,
      segment: SEGMENT_BY_CHAIN[company.chain] || '中游',
      type: typeKey,
      typeLabel: profile.label,
      model: profile.model,
      region: {
        province: company.region?.province || '未知',
        city: company.region?.city || '',
      },
      listed,
      storageGrade: additional.storageGrade || '',
      headTier: additional.headTier || '',
      products: company.products || '',
      evaluated,
    };

    if (evaluated) {
      record.metrics = generateMetrics(company, rnd);
      if (company.name === vetoDemoName) {
        record.metrics.events.majorDefault = true;
        record.metrics.quality = 0.92;
      }
      evaluatedCount += 1;
    }
    companies.push(record);
  }

  const relations = [];
  for (const relation of raw.relations || []) {
    const fromId = idByName.get(relation.from);
    const toId = idByName.get(relation.to);
    if (!fromId || !toId) continue;
    relations.push({
      id: relation.id,
      fromId,
      toId,
      fromName: relation.from,
      toName: relation.to,
      relationType: relation.relationType || '供应',
      basis: relation.basis || '',
    });
  }

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    schemaVersion: 1,
    industry: 'storage',
    industryLabel: '储能产业',
    sourceNote:
      '企业名单与链路归属来自《全量客户清单.xlsx》入链结果（companies-storage.json，237 家上市企业 + 1740 家非上市企业）。财务、授信评分相关指标均为演示用模拟数据。',
    evaluatedCount,
    totalCompanies: companies.length,
    companies,
    relations,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 1)}\n`, 'utf8');
  const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(
    `credit mock ready: ${companies.length} companies (${evaluatedCount} evaluated, ${relations.length} relations) -> ${path.relative(rootDir, outputPath)} (${sizeMb} MB)`,
  );
}

main();
