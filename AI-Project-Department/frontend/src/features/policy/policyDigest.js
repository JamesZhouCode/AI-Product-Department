// 集合解读引擎：把「一批政策」聚合成一份可读的解读结论。
//
// 与 policyEngine 的分工：policyEngine 负责单条政策的七步解读（纯函数、同输入同输出）；
// 本模块在其之上做两件事：
//   1. 给每条政策补上行业标签（policyIndustry）与有效期（policyValidity）；
//   2. 按视图筛选后用同样的口径聚合出集合级结论（级别分布、行业分布、环节覆盖、
//      有效期分布、评分统计、逐条明细……）。
//
// 所有函数均为纯函数：不读写 storage、不触碰 DOM，now 由调用方注入以便复现。
import { clusterMaturity, clusterStars, interpretPolicy, shortRegionName } from './policyEngine.js';
import {
  INDUSTRY_GROUPS,
  INDUSTRY_LEXICON,
  POLICY_FOCUS,
  computeHits,
  resolveIndustries,
} from './policyIndustry.js';
import { isWithinValidity, resolveValidity } from './policyValidity.js';
import {
  BANKING_LEXICON,
  CHAIN_LEVELS,
  COMPANY_GROUPS,
  GOAL_STRENGTHS,
  POLICY_LEVELS,
  POLICY_LEVEL_MAP,
  REGION_BASE,
  REGION_MAP_BANDS,
  REGION_MAP_EMPTY_FILL,
  TIMELINE_PHASES,
} from './policyData.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

// 两个解读视图：重点行业有效期内政策 / 全行业政策地位对比。
// 视角随顶部一级链切换：储能产业 → 「储能行业」，算力产业 → 「算力行业」。
// scope 的 key 保持 'storage'（历史口径，指「重点行业视图」），行业差异由 focus 决定。
export function policyScopesFor(focus = POLICY_FOCUS.storage) {
  const { label, industryLabel } = focus;
  return [
    {
      key: 'storage',
      label: `${label}行业 · 有效期内政策`,
      short: `${label}有效政策`,
      eyebrow: `${focus.key.toUpperCase()} · IN FORCE`,
      desc: `只看${label}行业、且仍在有效期内的政策：已过期的自动排除，未标注有效期的保留并单独标注，可人工修正。本视图顶部给出对${label}行业的总体政策判断。`,
      emptyHint: `当前政策库里还没有「${label}行业且在有效期内」的政策。可导入${industryLabel}相关政策文件，或到「全行业政策地位对比」视图查看已入库政策。`,
    },
    {
      key: 'all',
      label: '全行业政策地位对比',
      short: '全行业对比',
      eyebrow: `${label.toUpperCase()} VS 26 INDUSTRIES`,
      desc: `以 26 个重点行业（科技金融十大赛道、工信部十大稳增长行业、六大未来产业）为参照系，与${label}行业比较政策数量与支持强度，看${label}当前的政策地位。`,
      emptyHint: `政策库为空。导入政策后，本视图会把${label}与 26 个重点行业的政策数量、支持强度放在一起对比，回答「${label}行业当前的政策地位如何」。`,
    },
  ];
}

export const POLICY_SCOPES = policyScopesFor(POLICY_FOCUS.storage);

export function scopeMapFor(focus = POLICY_FOCUS.storage) {
  return Object.fromEntries(policyScopesFor(focus).map((item) => [item.key, item]));
}

export const SCOPE_MAP = scopeMapFor(POLICY_FOCUS.storage);

// 引擎把时间视野归为 short / medium / long，模块按落地期 / 推进期 / 长周期展示。
const HORIZON_PHASE = { short: 'immediate', medium: 'mid', long: 'long' };

const ratio = (value, total) => (total ? Math.round((value / total) * 100) : 0);

/** 对单条政策做一次完整分析：七步解读 + 行业标签 + 有效期。 */
export function analyzePolicy(policy, { now = new Date(), focus = POLICY_FOCUS.storage } = {}) {
  const result = interpretPolicy(policy);
  const industries = resolveIndustries(policy, policy?.industryOverride);
  const validity = resolveValidity(policy, {
    now,
    override: policy?.validityOverride || '',
  });
  const storageHit = industries.some((item) => item.key === 'storage');
  // isFocus 是「当前视角是否命中」的唯一判据：储能看行业标签，算力看关键词。
  const isFocus =
    focus.key === 'compute'
      ? computeHits(policy).length > 0 || industries.some((item) => item.key === 'compute')
      : storageHit;
  const topBanking = result.banking.products.slice(0, 2).map((item) => item.label);
  const provinces = result.regions.provinces.map((name) => shortRegionName(name));

  return {
    id: policy?.id || result.id || result.title,
    title: result.title,
    sourceName: policy?.sourceName || '',
    isSample: Boolean(policy?.isSample),
    result,
    industries,
    validity,
    isStorage: storageHit,
    isFocus,
    level: {
      key: result.level.key,
      label: result.level.label,
      range: result.level.range,
      issuer: result.level.issuer,
      uncertain: Boolean(result.level.uncertain),
    },
    score: { total: result.score.total, grade: result.score.grade },
    goalStrength: result.goal.strength,
    chainHitCount: result.chain.hitCount,
    provinces,
    topBanking,
    headline: [
      `目标强度「${result.goal.strength.label}」`,
      `命中产业链 ${result.chain.hitCount}/7 个环节`,
      provinces.length ? `涉及 ${provinces.slice(0, 3).join('、')}` : '未识别到具体区域',
      topBanking.length ? `可对接 ${topBanking.join('、')}` : '银行产品待补充',
    ],
  };
}

/**
 * 按视图筛选政策。
 * @returns {{ rows: object[], excluded: { expired: number, otherIndustry: number } }}
 */
export function selectPolicies(policies = [], scope = 'all', { now = new Date(), focus } = {}) {
  return filterRows(
    policies.map((policy) => analyzePolicy(policy, { now, focus })),
    scope,
  );
}

// 内部筛选：入参是已完成分析的明细，避免同一次解读里重复跑引擎。
function filterRows(analyzed, scope) {
  if (scope !== 'storage') return { rows: analyzed, excluded: { expired: 0, otherIndustry: 0 } };

  const rows = [];
  let expired = 0;
  let otherIndustry = 0;
  analyzed.forEach((row) => {
    if (!row.isFocus) {
      otherIndustry += 1;
      return;
    }
    if (!isWithinValidity(row.validity)) {
      expired += 1;
      return;
    }
    rows.push(row);
  });
  return { rows, excluded: { expired, otherIndustry } };
}

function levelMix(rows) {
  return POLICY_LEVELS.map((level) => {
    const count = rows.filter((row) => row.level.key === level.key).length;
    return {
      key: level.key,
      label: level.label,
      range: level.range,
      count,
      ratio: ratio(count, rows.length),
    };
  });
}

function industryMix(rows) {
  const map = new Map();
  rows.forEach((row) => {
    row.industries.forEach((industry) => {
      const item = map.get(industry.key) || {
        key: industry.key,
        label: industry.label,
        count: 0,
        storageCount: 0,
      };
      item.count += 1;
      if (industry.key === 'storage') item.storageCount += 1;
      map.set(industry.key, item);
    });
  });
  return [...map.values()]
    .map((item) => ({ ...item, ratio: ratio(item.count, rows.length) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function chainMix(rows) {
  return CHAIN_LEVELS.map((level) => {
    const count = rows.filter((row) =>
      row.result.chain.levels.some((item) => item.key === level.key && item.hit),
    ).length;
    return {
      key: level.key,
      label: level.label,
      position: level.position,
      count,
      ratio: ratio(count, rows.length),
    };
  });
}

function regionMix(rows) {
  const map = new Map();
  rows.forEach((row) => {
    row.provinces.forEach((name) => {
      map.set(name, (map.get(name) || 0) + 1);
    });
  });
  return [...map.entries()]
    .map(([name, count]) => {
      const base = REGION_BASE[name];
      const maturity = base?.dims ? clusterMaturity(base.dims) : null;
      return {
        name,
        full: base?.full || name,
        count,
        ratio: ratio(count, rows.length),
        maturity,
        direction: base?.direction || '',
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

/**
 * 地图着色行：带动强度 = 本地产业基础 × 政策覆盖比例。
 * 全国性政策对其余省份也有辐射，按覆盖比例折算，避免出现「国家级政策没带动任何省」。
 */
function regionMapRows(rows, mix) {
  const nationalCount = rows.filter((row) => row.level.key === 'national').length;
  const denominator = rows.length || 1;
  return mix
    .filter((item) => REGION_BASE[item.name])
    .map((item) => {
      const base = REGION_BASE[item.name];
      const hitRatio = clamp((item.count + nationalCount) / denominator, 0, 1);
      const value = clamp(Math.round(item.maturity * (0.55 + 0.45 * hitRatio)));
      return {
        name: item.name,
        full: base.full,
        policyCount: base.policyCount,
        direction: base.direction,
        advantages: base.advantages,
        leaders: base.leaders,
        clusters: base.clusters,
        note: base.note,
        dims: base.dims,
        maturity: item.maturity,
        stars: clusterStars(item.maturity),
        paidCount: item.count,
        nationalCount,
        direct: item.count > 0,
        value,
        band: REGION_MAP_BANDS.find((band) => value >= band.min) || REGION_MAP_BANDS.at(-1),
      };
    })
    .sort((a, b) => b.value - a.value);
}

function companyMix(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    row.result.company.groups.forEach((group) => {
      counts.set(group.key, (counts.get(group.key) || 0) + 1);
    });
  });
  return COMPANY_GROUPS.map((group) => {
    const count = counts.get(group.key) || 0;
    return {
      key: group.key,
      label: group.label,
      levels: group.levels || [],
      count,
      ratio: ratio(count, rows.length),
    };
  }).sort((a, b) => b.count - a.count);
}

function goalMix(rows) {
  const order = [...GOAL_STRENGTHS.map((item) => item.label), '未识别到明确强度'];
  const strengthMap = new Map();
  const typeMap = new Map();
  rows.forEach((row) => {
    const label = row.goalStrength.label;
    const item = strengthMap.get(label) || { label, tone: row.goalStrength.tone, count: 0 };
    item.count += 1;
    strengthMap.set(label, item);
    row.result.goal.types
      .filter((type) => type.hit)
      .forEach((type) => {
        const entry = typeMap.get(type.key) || { key: type.key, label: type.label, count: 0 };
        entry.count += 1;
        typeMap.set(type.key, entry);
      });
  });
  return {
    strength: [...strengthMap.values()].sort(
      (a, b) => order.indexOf(a.label) - order.indexOf(b.label),
    ),
    types: [...typeMap.values()].sort((a, b) => b.count - a.count),
  };
}

function bankingMix(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    row.result.banking.products.forEach((product) => {
      counts.set(product.key, (counts.get(product.key) || 0) + 1);
    });
  });
  return BANKING_LEXICON.map((item) => {
    const count = counts.get(item.key) || 0;
    return {
      key: item.key,
      label: item.label,
      scene: item.scene,
      audience: item.audience,
      count,
      ratio: ratio(count, rows.length),
    };
  }).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function validityMix(rows) {
  const order = ['active', 'expiring', 'permanent', 'unknown', 'expired'];
  const labels = {
    active: { label: '生效中', tone: 'up' },
    expiring: { label: '即将到期', tone: 'watch' },
    permanent: { label: '长期有效', tone: 'up' },
    unknown: { label: '未标注有效期', tone: '' },
    expired: { label: '已过期', tone: 'down' },
  };
  return order.map((key) => ({
    key,
    label: labels[key].label,
    tone: labels[key].tone,
    count: rows.filter((row) => row.validity.status === key).length,
  }));
}

function gradeMix(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const { label, tone } = row.score.grade;
    const item = map.get(label) || { label, tone, count: 0 };
    item.count += 1;
    map.set(label, item);
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ---------------- 重点行业总体政策判断 ---------------- */

// 总体判断的四个档位：按「平均支持强度 × 支持基调占比」定档。
const OVERALL_STANCES = {
  strong: { key: 'strong', label: '政策强支持期', tone: 'up' },
  steady: { key: 'steady', label: '稳健支持期', tone: 'up' },
  neutral: { key: 'neutral', label: '中性观察期', tone: 'watch' },
  cooling: { key: 'cooling', label: '支持趋缓期', tone: 'down' },
};

/**
 * 对重点行业这批「有效政策」给出总体政策判断。
 * 口径全部可从明细逐项核对：数量、平均分、国家级占比、支持基调占比、到期风险。
 * @param {object[]} rows 重点行业且在有效期内的明细行
 * @param {{expired:number,otherIndustry:number}} excluded 重点行业视图的排除统计
 * @param {object} focus 当前视角（储能 / 算力），决定文案中的行业名
 */
function overallVerdict(
  rows,
  excluded = { expired: 0, otherIndustry: 0 },
  focus = POLICY_FOCUS.storage,
) {
  const focusLabel = focus.label;
  const count = rows.length;
  const totals = rows.map((row) => row.score.total);
  const avg = count ? Math.round((totals.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0;
  const national = rows.filter((row) => row.level.key === 'national').length;
  const nationalRatio = ratio(national, count);
  const support = rows.filter(
    (row) => row.goalStrength.key === 'mandatory' || row.goalStrength.key === 'supported',
  ).length;
  const supportRatio = ratio(support, count);
  const guided = rows.filter((row) => row.goalStrength.key === 'guided').length;
  const expiringSoon = rows.filter((row) => row.validity.status === 'expiring').length;
  const top = count
    ? rows.reduce((best, row) => (row.score.total > best.score.total ? row : best), rows[0])
    : null;

  let stance;
  if (!count) stance = { key: 'nodata', label: '暂无有效政策', tone: 'watch' };
  else if (avg >= 72 && supportRatio >= 60) stance = OVERALL_STANCES.strong;
  else if (avg >= 60) stance = OVERALL_STANCES.steady;
  else if (avg >= 48) stance = OVERALL_STANCES.neutral;
  else stance = OVERALL_STANCES.cooling;

  const headline = !count
    ? `政策库中暂无「${focusLabel}且在有效期内」的政策，导入后这里会给出${focusLabel}行业的总体政策判断。`
    : `${focusLabel}行业当前处于${stance.label}：${count} 份有效政策、平均支持强度 ${avg} 分，其中明确支持与强制约束类合计 ${support} 份（${supportRatio}%），国家级政策 ${national} 份（${nationalRatio}%）。`;

  const points = [];
  if (count) {
    points.push(
      `政策基数：纳入 ${count} 份「${focusLabel}且在有效期内」的政策` +
        (excluded.otherIndustry || excluded.expired
          ? `；另有 ${excluded.otherIndustry} 份非${focusLabel}、${excluded.expired} 份已过期政策未计入`
          : '；库内暂无被排除的政策'),
    );
    points.push(
      nationalRatio >= 40
        ? `政策空间：国家级 ${national} 份（${nationalRatio}%），方向性政策主导，行业大方向确定性强`
        : `政策空间：国家级 ${national} 份（${nationalRatio}%），以地方配套为主，国家层面方向性政策仍待补充`,
    );
    points.push(
      support >= guided
        ? `政策基调：明确支持 / 强制约束合计 ${support} 份，超过鼓励引导类（${guided} 份），整体以「激励落地」为主`
        : `政策基调：鼓励引导类 ${guided} 份居多，明确支持 / 强制约束合计 ${support} 份，整体以「引导探索」为主，落地节奏待观察`,
    );
    points.push(
      expiringSoon
        ? `到期风险：${expiringSoon} 份政策将在 90 天内到期，需提前关注接续政策与申报窗口`
        : '到期风险：未来 90 天内无政策集中到期，政策环境保持稳定',
    );
    if (top) {
      points.push(
        `首要抓手：当前影响最大的政策是《${top.title}》（${top.score.total} 分 · ${top.score.grade.label}）`,
      );
    }
  }

  return {
    stance,
    headline,
    points,
    metrics: {
      count,
      avg,
      national,
      nationalRatio,
      support,
      supportRatio,
      guided,
      expiringSoon,
      topTitle: top?.title || '',
      topScore: top?.score.total || 0,
      topGrade: top?.score.grade.label || '',
    },
  };
}

/* ---------------- 重点行业 vs 26 行业的政策地位对比 ---------------- */

/**
 * 把全库政策按 27 个行业（储能 + 26 参照行业）归集，比较政策数量与支持强度。
 * 算力产业不在 27 个参照行业内：按关键词口径单列一行，与 26 个参照行业同口径比较。
 * 口径：一份政策命中多个行业时按「命中即计入」分别计入（行业交叉的真实反映），
 * 因此各行业政策数之和可能大于库内条数；排名用于相对地位，不要求加总相等。
 * @param {object[]} allRows 全库的分析明细行
 * @param {object} focus 当前视角（储能 / 算力）
 */
function compareIndustries(allRows, focus = POLICY_FOCUS.storage) {
  const focusLabel = focus.label;
  const metricOf = (hits) => {
    const totals = hits.map((row) => row.score.total);
    return {
      count: hits.length,
      avgScore: totals.length
        ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10
        : 0,
      national: hits.filter((row) => row.level.key === 'national').length,
      inForce: hits.filter((row) => isWithinValidity(row.validity)).length,
      titles: hits.map((row) => row.title),
    };
  };

  const industries = INDUSTRY_LEXICON.map((industry) => {
    const hits = allRows.filter((row) => row.industries.some((item) => item.key === industry.key));
    return { key: industry.key, label: industry.label, group: industry.group, ...metricOf(hits) };
  });

  // 当前视角如果不在 27 个参照行业内（算力），单列一行参与排名。
  const inLexicon = industries.some((item) => item.key === focus.key);
  const focusHits = allRows.filter((row) => row.isFocus);
  const focusRow =
    industries.find((item) => item.key === focus.key) || {
      key: focus.key,
      label: focusLabel,
      group: 'focus',
      ...metricOf(focusHits),
    } ||
    null;

  // 数量排名：条数降序，同条数比平均分，再同则按 key 稳定排序。
  const ranked = inLexicon ? industries : [...industries, focusRow];
  const sorted = [...ranked].sort(
    (a, b) => b.count - a.count || b.avgScore - a.avgScore || a.key.localeCompare(b.key),
  );
  sorted.forEach((item, index) => {
    item.rank = index + 1;
  });

  const focusStat = inLexicon ? industries.find((item) => item.key === focus.key) : focusRow;
  const covered = industries.filter((item) => item.count > 0).length;
  const allAvg = allRows.length
    ? Math.round((allRows.reduce((sum, row) => sum + row.score.total, 0) / allRows.length) * 10) /
      10
    : 0;
  const totalIndustries = INDUSTRY_LEXICON.length;
  const rankScope = inLexicon ? totalIndustries : totalIndustries + 1;

  let conclusion;
  if (!allRows.length) {
    conclusion = `政策库为空。导入政策后，本视图会把${focusLabel}与 ${totalIndustries - 1} 个重点行业（十大赛道 + 稳增长 + 未来产业）的政策数量与支持强度放在一起，回答「${focusLabel}当前的政策地位如何」。`;
  } else if (covered <= 1) {
    conclusion = `当前政策库命中 ${covered} 个行业，暂无跨行业样本。建议导入其他行业（如钢铁、化工、人工智能等）的政策文件，即可得到${focusLabel}的政策地位对比。`;
  } else {
    const half = Math.ceil(rankScope / 2);
    const qualifier =
      focusStat.rank === 1
        ? `${focusLabel}是当前政策库中政策最密集的行业，政策地位领先。`
        : focusStat.rank <= 3
          ? `${focusLabel}的政策密集度居前列，政策地位相对突出。`
          : focusStat.rank <= half
            ? `${focusLabel}的政策密集度处于中游水平。`
            : `${focusLabel}的政策密集度靠后，可结合授信策略关注政策接续与加码机会。`;
    conclusion = `${focusLabel}行业以 ${focusStat.count} 份政策在 ${rankScope} 个行业中数量排名第 ${focusStat.rank}；平均支持强度 ${focusStat.avgScore} 分，${focusStat.avgScore >= allAvg ? '高于' : '低于'}全库平均水平（${allAvg} 分）。${qualifier}`;
  }

  const groups = INDUSTRY_GROUPS.map((group) => {
    const members = industries.filter((item) => item.group === group.key);
    return {
      key: group.key,
      label: group.label,
      total: members.length,
      hitCount: members.filter((item) => item.count > 0).length,
      policyCount: members.reduce((sum, item) => sum + item.count, 0),
      members: [...members].sort(
        (a, b) => b.count - a.count || b.avgScore - a.avgScore || a.rank - b.rank,
      ),
    };
  });

  return {
    industries,
    sorted,
    // 兼容既有字段名：storage 指「当前视角行业」的对比行。
    storage: focusStat,
    focusStat,
    focusInLexicon: inLexicon,
    covered,
    totalIndustries,
    allAvg,
    conclusion,
    groups,
  };
}

/**
 * 生成一个视图的完整集合解读。
 * 返回中额外带两组跨视图结论（不随 scope 变化，页面按需取用）：
 *   overall — 重点行业总体政策判断（基于重点行业 + 有效期内政策）；
 *   compare — 重点行业与 26 个参照行业的政策地位对比（基于全库政策）。
 * @param {object[]} policies 政策库全部政策
 * @param {object} options { scope, now, focus }
 */
export function digestPolicies(
  policies = [],
  { scope = 'all', now = new Date(), focus = POLICY_FOCUS.storage } = {},
) {
  const all = policies.map((policy) => analyzePolicy(policy, { now, focus }));
  const { rows, excluded } = filterRows(all, scope);
  const totals = rows.map((row) => row.score.total);
  const regions = regionMix(rows);
  // 两个范围各自的纳入条数：切换按钮上要显示，避免只算当前范围时另一侧是空的。
  const storageFiltered = filterRows(all, 'storage');
  const scopeCounts = {
    storage: storageFiltered.rows.length,
    all: all.length,
  };
  // 总体判断始终以「重点行业 + 有效期内」口径计算，切换视图不会改变其内容。
  const overall = overallVerdict(storageFiltered.rows, storageFiltered.excluded, focus);
  // 行业地位对比始终基于全库政策。
  const compare = compareIndustries(all, focus);

  return {
    scope,
    scopeMeta: scopeMapFor(focus)[scope] || scopeMapFor(focus).all,
    focus,
    libraryCount: all.length,
    matchedCount: rows.length,
    scopeCounts,
    excluded,
    overall,
    compare,
    // 关键读数
    coverage: {
      regions: new Set(rows.flatMap((row) => row.provinces)).size,
      industries: new Set(rows.flatMap((row) => row.industries.map((i) => i.key))).size,
      chains: new Set(
        rows.flatMap((row) =>
          row.result.chain.levels.filter((level) => level.hit).map((level) => level.key),
        ),
      ).size,
      banking: new Set(
        rows.flatMap((row) => row.result.banking.products.map((product) => product.key)),
      ).size,
      issuers: new Set(rows.map((row) => row.level.issuer).filter(Boolean)).size,
      inForce: rows.filter((row) => isWithinValidity(row.validity)).length,
      expiringSoon: rows.filter((row) => row.validity.status === 'expiring').length,
    },
    score: {
      avg: totals.length
        ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10
        : 0,
      max: totals.length ? Math.max(...totals) : 0,
      min: totals.length ? Math.min(...totals) : 0,
      gradeMix: gradeMix(rows),
    },
    levelMix: levelMix(rows),
    industryMix: industryMix(rows),
    chainMix: chainMix(rows),
    regionMix: regions,
    regionMap: {
      rows: regionMapRows(rows, regions),
      bands: REGION_MAP_BANDS,
      emptyFill: REGION_MAP_EMPTY_FILL,
    },
    goalMix: goalMix(rows),
    companyMix: companyMix(rows),
    horizonMix: TIMELINE_PHASES.map((phase) => ({
      key: phase.key,
      label: phase.label,
      window: phase.window,
      count: rows.filter((row) => HORIZON_PHASE[row.result.timeline.horizon] === phase.key).length,
    })),
    bankingMix: bankingMix(rows),
    validityMix: validityMix(rows),
    // 逐条明细：影响评分高的排前面，同分时把更近期失效的排前面。
    rows: [...rows].sort(
      (a, b) =>
        b.score.total - a.score.total ||
        (a.validity.daysLeft ?? Number.MAX_SAFE_INTEGER) -
          (b.validity.daysLeft ?? Number.MAX_SAFE_INTEGER),
    ),
    // 未来一年内有明确失效日的政策：用于提醒「哪些政策要到期了」。
    upcoming: rows
      .filter(
        (row) =>
          row.validity.expiresOn && row.validity.daysLeft >= 0 && row.validity.daysLeft <= 365,
      )
      .sort((a, b) => a.validity.daysLeft - b.validity.daysLeft)
      .slice(0, 5),
    policyLevels: POLICY_LEVELS,
    policyLevelMap: POLICY_LEVEL_MAP,
  };
}
