// 「政策分析」页解读引擎：把一份政策文本按《储能行业政策分析》的框架读成结构化结论。
//
// 设计原则（与「宏观」页一致：判断必须可回溯）：
//   1. 纯函数、无副作用、无网络：同样的文本永远得到同样的结论，便于单测锁定；
//   2. 只做「命中即取证」：每个结论都带回命中词，页面上原样展示，便于业务人员复核；
//   3. 不确定就说不确定：识别不到发布主体、目标强度或影响方向时，如实标注而不猜。
//
// 输出结构：
//   { level, issuer, spaceRange, wordCount, paragraphs,
//     score, goal, chain, region, company, timeline, banking, evidence }
import {
  BANKING_LEXICON,
  CHAIN_LEVELS,
  CITY_PROVINCE,
  CLUSTER_MODEL,
  COMPANY_GROUPS,
  GOAL_STRENGTHS,
  GOAL_TYPES,
  IMPACT_DIRECTIONS,
  ISSUER_LEXICON,
  PARK_KEYWORDS,
  POLICY_BASE_YEAR,
  POLICY_LEVEL_MAP,
  POLICY_SCORE_MODEL,
  PROVINCES,
  REGION_BASE,
  REGION_MAP_BANDS,
  REGION_MAP_EMPTY_FILL,
  SCORE_FORMULAS,
  TIMELINE_PHASES,
} from './policyData.js';

// 评分基准年与各项计分常量统一取自 policyData：页面上公示的「打分标准」与引擎算法同源，
// 不会出现「说明改了、算法没改」的口径漂移。
const CURRENT_YEAR = POLICY_BASE_YEAR;
const DIRECTION_PRIORITY = ['demand', 'model', 'competition', 'cost'];
const CHAIN_LEVEL_LABEL = Object.fromEntries(CHAIN_LEVELS.map((level) => [level.key, level.label]));
const REGION_ID_SUFFIX = /(省|市|特别行政区|自治区)$/;
const REGION_ID_ETHNIC = /(壮族|回族|维吾尔)$/;

// 「江苏省」→「江苏」，「广西壮族自治区」→「广西」，与区域产业基础数据的键对齐；
// 供政策区域影响地图把离线边界要素的名字映射到产业基础数据。
export function shortRegionName(name) {
  return String(name || '')
    .replace(REGION_ID_SUFFIX, '')
    .replace(REGION_ID_ETHNIC, '');
}

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const hitOf = (lower, keywords) =>
  keywords.filter((keyword) => lower.includes(String(keyword).toLowerCase()));
const sum = (list) => list.reduce((total, value) => total + value, 0);

export function normalizePolicyText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ---------------------------------------------------------------- 01 政策来源与空间范围

const PROVINCE_ORG_PATTERN =
  /(?:省|自治区)[^。；\n]{0,10}(?:人民政府|政府办公厅|发展和改革委员会|发展改革委|发改委|能源局|工业和信息化|财政厅|人民政府办公厅)/;
const CITY_ORG_PATTERN =
  /市[^。；\n]{0,10}(?:人民政府|政府办公厅|发展和改革委员会|发展改革委|发改委|能源局|工业和信息化局|经信局|管委会)/;

// 从正文里把发布主体原样抠出来（省 / 市 / 园区三种机构写法）。
// 注意机关名前允许 0 个字：「广东省人民政府办公厅」里省名与机关名是紧挨着的。
const PROVINCE_ORG_CAPTURE =
  /([\u4e00-\u9fa5]{2,4}(?:省|自治区))([\u4e00-\u9fa5]{0,10}?(?:人民政府办公厅|人民政府|发展和改革委员会|发展改革委|发改委|能源局|工业和信息化厅|工业和信息化局|财政厅|经信厅|经信局))/;
const CITY_ORG_CAPTURE =
  /([\u4e00-\u9fa5]{2,4}市)([\u4e00-\u9fa5]{0,10}?(?:人民政府办公厅|人民政府|发展和改革委员会|发展改革委|发改委|能源局|工业和信息化局|经信局))/;
const PARK_ORG_CAPTURE =
  /([\u4e00-\u9fa5]{2,20}?(?:园区|开发区|高新区|新区))([\u4e00-\u9fa5]{0,8}?(?:管理委员会|管委会))/;

const ORG_CAPTURE_BY_LEVEL = {
  provincial: PROVINCE_ORG_CAPTURE,
  municipal: CITY_ORG_CAPTURE,
  park: PARK_ORG_CAPTURE,
};

function extractIssuer(text, levelKey) {
  const pattern = ORG_CAPTURE_BY_LEVEL[levelKey];
  if (pattern) {
    const match = text.match(pattern);
    if (match) return `${match[1]}${match[2]}`;
  }
  for (const fallback of [PROVINCE_ORG_CAPTURE, CITY_ORG_CAPTURE, PARK_ORG_CAPTURE]) {
    const match = text.match(fallback);
    if (match) return `${match[1]}${match[2]}`;
  }
  return '';
}

// ---------- 国家级发布主体的误判防护 ----------
//
// 两类典型误判（真实省级公文里几乎必然出现）：
//   1) 词典里的裸词「发展改革委」「市场监督管理总局」，在省级文件里写成「省发展改革委」；
//   2) 省级文件开头的引用语，如「为贯彻落实《国务院关于…的通知》」「根据国家发展改革委部署」。
// 两者都会把一份省级政策判成国家级，进而把评分错推到 S 级，所以这里做两道防护：
//   先剥掉引用块/引用语境，再对裸词检查左侧是否带「省/市/区/县/州/盟」层级限定字。
// 注意：引用剥除只在正文出现省级表述时启用，避免国家级文件里「根据国务院部署」被误剥。

const LEVEL_QUALIFIERS = '省市区县州盟';
const BARE_NATIONAL_KEYWORDS = new Set(['发展改革委', '市场监督管理总局']);

const CITATION_PATTERN =
  /《[^》]{0,80}》|(?:贯彻落实|贯彻|落实|按照|根据|依据|遵照|遵循|响应|对接)[^，。；、\n]{0,10}?(?:国务院|国家发展改革委|国家发改委|国家能源局|工业和信息化部|工信部|财政部|科技部|住房和城乡建设部|生态环境部|市场监督管理总局|中国人民银行)/g;

// 裸词匹配：要求命中位置左侧不是层级限定字，否则视为省级机构（如「省发展改革委」）。
function hasBareNationalWord(text, needle) {
  let from = 0;
  for (;;) {
    const index = text.indexOf(needle, from);
    if (index < 0) return false;
    const prev = index > 0 ? text[index - 1] : '';
    if (!LEVEL_QUALIFIERS.includes(prev)) return true;
    from = index + 1;
  }
}

function nationalIssuerHit(text, keywords) {
  const haystack = text.toLowerCase();
  return keywords.some((keyword) => {
    const needle = keyword.toLowerCase();
    if (!haystack.includes(needle)) return false;
    if (!BARE_NATIONAL_KEYWORDS.has(keyword)) return true;
    return hasBareNationalWord(haystack, needle);
  });
}

export function detectLevel(text, lower, options = {}) {
  const provinceHits = PROVINCES.filter((name) => lower.includes(name.toLowerCase()));
  const cityHits = Object.keys(CITY_PROVINCE).filter((name) => lower.includes(name.toLowerCase()));
  const explicitProvince = /省级|全省|省域/.test(text);
  // 只有正文确实落在省级/地市语境里，才把引用语剥掉——否则国家级文件的发布主体会被剥没。
  const issuerText =
    provinceHits.length || cityHits.length || explicitProvince
      ? text.replace(CITATION_PATTERN, '')
      : text;

  const issuerHits = ISSUER_LEXICON.filter((item) =>
    item.level === 'national'
      ? nationalIssuerHit(issuerText, item.keywords)
      : hitOf(lower, item.keywords).length > 0,
  );
  const evidence = issuerHits.map((item) => `命中发布主体：${item.issuer}`);

  const nationalHit = issuerHits.some((item) => item.level === 'national');
  const parkIssuerHit = issuerHits.some((item) => item.level === 'park');
  const parkTermHit = hitOf(lower, PARK_KEYWORDS);
  const explicitCity = /地市级|市级|全市/.test(text);
  const explicitNational = /国家级|国家层面|全国范围/.test(text);

  let key;
  let uncertain = false;

  if (nationalHit || explicitNational) {
    key = 'national';
    if (explicitNational) evidence.push('命中「国家级 / 全国」表述');
  } else if (provinceHits.length && (PROVINCE_ORG_PATTERN.test(text) || explicitProvince)) {
    key = 'provincial';
    evidence.push(`命中省级区域：${provinceHits.join('、')}`);
  } else if (cityHits.length && (CITY_ORG_PATTERN.test(text) || explicitCity)) {
    key = 'municipal';
    evidence.push(`命中地市：${cityHits.join('、')}`);
  } else if (parkIssuerHit) {
    key = 'park';
    evidence.push('命中园区管理机构');
  } else if (provinceHits.length) {
    key = 'provincial';
    evidence.push(`命中省级区域：${provinceHits.join('、')}`);
  } else if (cityHits.length) {
    key = 'municipal';
    evidence.push(`命中地市：${cityHits.join('、')}`);
  } else if (explicitProvince) {
    key = 'provincial';
    evidence.push('命中「省级 / 全省」表述');
  } else if (explicitCity) {
    key = 'municipal';
    evidence.push('命中「市级 / 全市」表述');
  } else if (parkTermHit.length) {
    key = 'park';
    evidence.push(`命中园区 / 载体表述：${parkTermHit.slice(0, 3).join('、')}`);
  } else {
    key = 'municipal';
    uncertain = true;
    evidence.push('未识别到明确的发布主体层级，按地市级保守口径处理');
  }

  const meta = POLICY_LEVEL_MAP[key];
  const declared = normalizePolicyText(options.declaredIssuer);
  const captured = extractIssuer(text, key);
  const fromLexicon = issuerHits.map((item) => item.issuer).join('、');
  // 国家级以词典命中的部委为准（避免正文顺带提到的省级机构抢占）；
  // 其余层级优先用正文里抠出的具体机构名（如「江苏省人民政府办公厅」）。
  const issuer =
    key === 'national' ? fromLexicon || captured || declared : captured || fromLexicon || declared;

  return {
    key,
    label: meta.label,
    range: meta.range,
    authority: meta.authority,
    scope: meta.scope,
    desc: meta.desc,
    focus: meta.focus,
    banking: meta.banking,
    issuer: issuer || '未在文本中识别到明确发布主体',
    issuerIdentified: Boolean(issuer),
    uncertain,
    evidence,
  };
}

export function detectRegions(lower) {
  const provinces = PROVINCES.filter((name) => lower.includes(name.toLowerCase()));
  const cities = Object.keys(CITY_PROVINCE).filter((name) => lower.includes(name.toLowerCase()));
  const fromCities = cities.map((city) => CITY_PROVINCE[city]);
  const all = Array.from(new Set([...provinces, ...fromCities]));
  return { provinces: all, cities };
}

// ---------------------------------------------------------------- 02 政策目标判断

const ACTION_WORDS = [
  '达到',
  '以上',
  '不低于',
  '超过',
  '目标',
  '力争',
  '实现',
  '建成',
  '控制在',
  '提升至',
  '不少于',
];
const UNIT_PATTERN =
  /([0-9]+(?:\.[0-9]+)?)\s*(亿千瓦|万千瓦|兆瓦|千瓦|吉瓦|gw|gwh|mwh|千瓦时|元\/千瓦|亿元|亿美元|%|％|万辆|万吨|个)/i;

export function detectGoals(text, lower) {
  const strengthCandidates = GOAL_STRENGTHS.map((item) => ({
    ...item,
    hits: hitOf(lower, item.keywords),
  }));
  const mandatory = strengthCandidates.find((item) => item.key === 'mandatory');
  const supported = strengthCandidates.find((item) => item.key === 'supported');
  const guided = strengthCandidates.find((item) => item.key === 'guided');

  let strength;
  if (
    mandatory.hits.length >= 3 ||
    (mandatory.hits.length >= 2 && mandatory.hits.length >= supported.hits.length)
  ) {
    strength = mandatory;
  } else if (supported.hits.length >= 1) {
    strength = supported;
  } else if (guided.hits.length >= 1) {
    strength = guided;
  } else {
    strength = {
      key: 'silent',
      label: '未识别到明确强度',
      score: 48,
      tone: 'watch',
      text: '文本中未出现明确的目标强度表述，建议核对原文的正式表述后再判断落地力度。',
      keywords: [],
      hits: [],
    };
  }

  const sentences = text
    .split(/[。；;!?\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const quantitative = sentences
    .filter(
      (sentence) =>
        UNIT_PATTERN.test(sentence) && ACTION_WORDS.some((word) => sentence.includes(word)),
    )
    .map((sentence) => sentence.replace(/^[一二三四五六七八九十]+[、.]\s*/, '').trim())
    .slice(0, 6);

  const types = GOAL_TYPES.map((item) => ({ ...item, hits: hitOf(lower, item.keywords) })).filter(
    (item) => item.hits.length > 0,
  );

  const intensityScore = clamp(
    strength.score +
      Math.min(
        SCORE_FORMULAS.intensity.quantumCap,
        quantitative.length * SCORE_FORMULAS.intensity.quantumStep,
      ),
  );

  return {
    strength,
    quantitative,
    types,
    intensityScore,
    evidence: [
      strength.hits.length ? `命中强度词：${strength.hits.slice(0, 6).join('、')}` : '未命中强度词',
      quantitative.length ? `识别到 ${quantitative.length} 条量化目标` : '未识别到量化目标',
    ],
  };
}

// ---------------------------------------------------------------- 03 产业链影响分析

// 在命中位置前后取窗口，统计该环节附近出现的影响方向词，避免用全篇方向硬套单个环节。
function directionWindow(lower, terms, windowSize = 70) {
  const counts = {};
  terms.forEach((term) => {
    const needle = String(term).toLowerCase();
    let index = lower.indexOf(needle);
    while (index !== -1) {
      const start = Math.max(0, index - windowSize);
      const end = Math.min(lower.length, index + needle.length + windowSize);
      const slice = lower.slice(start, end);
      Object.values(IMPACT_DIRECTIONS).forEach((direction) => {
        direction.keywords.forEach((keyword) => {
          if (slice.includes(String(keyword).toLowerCase())) {
            counts[direction.key] = (counts[direction.key] || 0) + 1;
          }
        });
      });
      index = lower.indexOf(needle, index + needle.length);
    }
  });
  return counts;
}

function dominantDirection(counts) {
  let best = null;
  DIRECTION_PRIORITY.forEach((key) => {
    const value = counts[key] || 0;
    if (value > 0 && (!best || value > best.value)) best = { key, value };
  });
  return best ? IMPACT_DIRECTIONS[best.key] : null;
}

export function analyzeChain(lower) {
  const globalCounts = {};
  Object.values(IMPACT_DIRECTIONS).forEach((direction) => {
    const hits = hitOf(lower, direction.keywords);
    if (hits.length) globalCounts[direction.key] = hits.length;
  });
  const globalDirection = dominantDirection(globalCounts);

  const levels = CHAIN_LEVELS.map((level) => {
    const hits = hitOf(lower, level.keywords);
    const counts = hits.length ? directionWindow(lower, hits) : {};
    const direction = dominantDirection(counts);
    const intensity = hits.length ? clamp(34 + hits.length * 16) : 0;
    return {
      key: level.key,
      label: level.label,
      position: level.position,
      tone: level.tone,
      hits,
      intensity,
      hit: hits.length > 0,
      direction: direction || (hits.length ? globalDirection : null),
      directionInferred: !direction && hits.length > 0,
    };
  });

  const hitLevels = levels.filter((level) => level.hit);
  const totalHits = sum(levels.map((level) => level.hits.length));
  const positions = ['上游', '中游', '下游'].map((position) => ({
    position,
    levels: levels.filter((level) => level.position === position),
  }));
  const chainScore = clamp(
    Math.round((hitLevels.length / CHAIN_LEVELS.length) * SCORE_FORMULAS.chain.levelRatioMax) +
      Math.min(SCORE_FORMULAS.chain.hitCap, totalHits * SCORE_FORMULAS.chain.perHit),
  );

  return {
    levels,
    positions,
    hitLevels,
    hitCount: hitLevels.length,
    totalHits,
    chainScore,
    globalCounts,
    globalDirection,
    evidence: hitLevels.length
      ? hitLevels.map((level) => `${level.label}：命中 ${level.hits.slice(0, 5).join('、')}`)
      : ['未命中产业链环节关键词，建议核对文本是否属于储能产业政策'],
  };
}

// ---------------------------------------------------------------- 04 区域产业影响分析

export function clusterMaturity(dims) {
  const total = sum(CLUSTER_MODEL.dimensions.map((dim) => dim.weight));
  const weighted = sum(
    CLUSTER_MODEL.dimensions.map((dim) => (Number(dims?.[dim.key]) || 0) * dim.weight),
  );
  return Math.round(weighted / total);
}

export function clusterStars(maturity) {
  return Math.max(0, Math.min(5, Math.round((Number(maturity) || 0) / 10) / 2));
}

export function analyzeRegion(regions, level, strengthScore) {
  const strengthFactor = 0.6 + 0.4 * (clamp(strengthScore) / 100);
  const isNational = level.key === 'national';
  const matchedNames = regions.provinces;
  const rows = Object.entries(REGION_BASE).map(([name, base]) => {
    const direct = isNational || matchedNames.includes(name);
    const maturity = clusterMaturity(base.dims);
    const matchFactor = direct ? 1 : isNational ? 0.75 : 0.42;
    const value = clamp(Math.round(maturity * matchFactor * strengthFactor));
    return {
      name,
      full: base.full,
      policyCount: base.policyCount,
      direction: base.direction,
      advantages: base.advantages,
      leaders: base.leaders,
      clusters: base.clusters,
      note: base.note,
      dims: base.dims,
      maturity,
      stars: clusterStars(maturity),
      direct,
      value,
      band: REGION_MAP_BANDS.find((band) => value >= band.min) || REGION_MAP_BANDS.at(-1),
      matchText: direct
        ? isNational
          ? '全国性政策：受益强度由本地产业基础决定'
          : '政策直接覆盖本区域'
        : '政策未直接覆盖，按辐射带动估算',
    };
  });

  const matched = rows.filter((row) => row.direct).sort((a, b) => b.maturity - a.maturity);
  const fallbackTop = [...rows].sort((a, b) => b.maturity - a.maturity).slice(0, 5);
  const matchScore = matched.length
    ? Math.round(sum(matched.map((row) => row.maturity)) / matched.length)
    : SCORE_FORMULAS.region.fallback;
  const primary = matched[0] || null;

  const clusterRows = primary
    ? CLUSTER_MODEL.dimensions.map((dim) => ({
        ...dim,
        score: Number(primary.dims[dim.key]) || 0,
      }))
    : [];

  return {
    rows,
    matched,
    primary,
    fallbackTop,
    clusterRows,
    matchScore,
    isNational,
    cities: regions.cities,
    bands: REGION_MAP_BANDS,
    emptyFill: REGION_MAP_EMPTY_FILL,
    evidence: matched.length
      ? matched
          .slice(0, 4)
          .map((row) => `${row.full}：集群成熟度 ${row.maturity} / 政策存量 ${row.policyCount} 项`)
      : ['未识别到政策覆盖的具体省份，区域影响按全国口径估算'],
  };
}

// ---------------------------------------------------------------- 05 企业影响分析

export function analyzeCompany(chain, strengthScore) {
  const hitKeys = new Set(chain.hitLevels.map((level) => level.key));
  const groups = COMPANY_GROUPS.filter((group) => group.levels.some((key) => hitKeys.has(key))).map(
    (group) => ({
      ...group,
      matchedLevels: group.levels
        .filter((key) => hitKeys.has(key))
        .map((key) => CHAIN_LEVEL_LABEL[key]),
    }),
  );
  const companyScore = clamp(
    Math.round(
      SCORE_FORMULAS.company.base +
        groups.length * SCORE_FORMULAS.company.perGroup +
        (clamp(strengthScore) - SCORE_FORMULAS.company.strengthRef) *
          SCORE_FORMULAS.company.strengthSlope,
    ),
  );
  return {
    groups,
    companyScore,
    evidence: groups.length
      ? groups.map(
          (group) => `${group.label}（${group.direction}）：关联${group.matchedLevels.join('、')}`,
        )
      : ['未匹配到受影响客群，请确认政策文本是否涉及储能产业'],
  };
}

// ---------------------------------------------------------------- 06 时间周期分析

export function analyzeTimeline(text) {
  const years = Array.from(new Set((text.match(/20\d{2}/g) || []).map(Number))).sort(
    (a, b) => a - b,
  );
  const minYear = years.length ? years[0] : null;
  const targetYear = years.length ? years[years.length - 1] : null;
  const span = minYear !== null && targetYear !== null ? targetYear - minYear : null;
  const horizonYears = targetYear !== null ? targetYear - CURRENT_YEAR : span || 0;

  let horizon = 'short';
  if (horizonYears >= 4) horizon = 'long';
  else if (horizonYears >= 2) horizon = 'medium';

  const durationRule = SCORE_FORMULAS.duration;
  let durationScore = durationRule.unknownYear;
  if (targetYear !== null) {
    durationScore =
      durationRule.byHorizon.find((band) => horizonYears >= band.min)?.score ??
      durationRule.byHorizon.at(-1).score;
    // 明确写了起止跨度的政策，执行周期更确定。
    if (span !== null && span >= durationRule.spanBonusMin) {
      durationScore = Math.min(100, durationScore + durationRule.spanBonus);
    }
  } else if (span !== null) {
    durationScore =
      durationRule.noYearBySpan.find((band) => span >= band.min)?.score ??
      durationRule.noYearBySpan.at(-1).score;
  }
  if (targetYear !== null && targetYear >= durationRule.longTermYear) {
    durationScore = Math.max(durationScore, durationRule.longTermMin);
  }

  const phases = TIMELINE_PHASES.map((phase) => ({
    ...phase,
    active:
      phase.key === (horizon === 'short' ? 'immediate' : horizon === 'medium' ? 'mid' : 'long'),
  }));

  return {
    years,
    minYear,
    targetYear,
    span,
    horizon,
    horizonYears,
    horizonLabel: TIMELINE_PHASES.find(
      (phase) =>
        phase.key === (horizon === 'short' ? 'immediate' : horizon === 'medium' ? 'mid' : 'long'),
    ).label,
    durationScore,
    phases,
    evidence: [
      targetYear !== null ? `识别到目标年份：${years.join('、')}` : '未识别到目标年份',
      span !== null ? `时间跨度约 ${span} 年` : '时间跨度未明确',
    ],
  };
}

// ---------------------------------------------------------------- 07 银行业务影响分析

export function analyzeBanking(lower, chain, level) {
  const products = BANKING_LEXICON.map((item) => ({
    ...item,
    hits: hitOf(lower, item.keywords),
  })).filter((item) => item.hits.length > 0);
  const bankingScore = clamp(
    products.length
      ? Math.round(
          SCORE_FORMULAS.banking.base + products.length * SCORE_FORMULAS.banking.perProduct,
        )
      : SCORE_FORMULAS.banking.none,
  );
  const topLevel = [...chain.hitLevels].sort((a, b) => b.intensity - a.intensity)[0] || null;
  const region = level.key === 'national' ? '全国' : '本区域';
  const productLabels = products.length
    ? products
        .slice(0, 3)
        .map((item) => item.label)
        .join(' + ')
    : '项目融资 + 供应链金融';

  const path = [
    {
      key: 'policy',
      label: `${level.label}政策`,
      text: level.issuerIdentified
        ? `发布主体：${level.issuer}`
        : '发布主体待核实，按政策级别口径处理',
    },
    {
      key: 'action',
      label: '传导动作',
      text: `推动${region}储能项目建设与产业集群落地`,
    },
    {
      key: 'chain',
      label: '环节变化',
      text: topLevel
        ? `${topLevel.direction ? topLevel.direction.label + '：' : ''}${topLevel.label}受政策直接影响最直接`
        : '暂未识别到受影响的产业链环节',
    },
    {
      key: 'company',
      label: '企业影响',
      text: topLevel ? `抬升${topLevel.label}相关企业的订单与产能利用率` : '企业影响待补充原文信息',
    },
    {
      key: 'bank',
      label: '银行可开展',
      text: productLabels,
    },
  ];

  return {
    products,
    bankingScore,
    path,
    evidence: products.length
      ? products.map((item) => `${item.label}：命中 ${item.hits.slice(0, 4).join('、')}`)
      : ['未命中金融产品场景词，已按通用产品建议兜底'],
  };
}

// ---------------------------------------------------------------- 评分模型

export function scoreGrade(total) {
  return (
    POLICY_SCORE_MODEL.grades.find((grade) => total >= grade.min) ||
    POLICY_SCORE_MODEL.grades.at(-1)
  );
}

export function scorePolicy({ level, goal, chain, region, company, timeline, banking }) {
  const byKey = {
    authority: {
      score: level.authority,
      evidence: `发布层级：${level.label}（影响范围：${level.range}）`,
    },
    scope: { score: level.scope, evidence: `空间覆盖：${level.range}` },
    intensity: { score: goal.intensityScore, evidence: `目标强度：${goal.strength.label}` },
    chain: {
      score: chain.chainScore,
      evidence: `命中 ${chain.hitCount}/7 个一级环节，共 ${chain.totalHits} 处关键词`,
    },
    region: {
      score: region.matchScore,
      evidence: region.primary
        ? `首要关联区域：${region.primary.full}（集群成熟度 ${region.primary.maturity}）`
        : '区域信息不足，按中位口径处理',
    },
    company: {
      score: company.companyScore,
      evidence: `匹配到 ${company.groups.length} 类受影响客群`,
    },
    duration: {
      score: timeline.durationScore,
      evidence: timeline.targetYear
        ? `目标年份 ${timeline.targetYear}，跨度约 ${timeline.span ?? 0} 年`
        : '未识别目标年份',
    },
    banking: {
      score: banking.bankingScore,
      evidence: `匹配到 ${banking.products.length} 类可落地金融产品`,
    },
  };

  const dimensions = POLICY_SCORE_MODEL.dimensions.map((dim) => {
    const detail = byKey[dim.key] || { score: 0, evidence: '' };
    const score = clamp(Math.round(detail.score));
    return {
      ...dim,
      score,
      evidence: detail.evidence,
      weighted: Math.round((score * dim.weight) / 100),
    };
  });

  const total = clamp(Math.round(sum(dimensions.map((dim) => (dim.score * dim.weight) / 100))));

  // S 级（战略级）保留给国家级重大方向性政策：省级及以下即使总分够高，最高也只定 A 级。
  let grade = scoreGrade(total);
  let gradeNote = '';
  if (level.key !== 'national' && grade === POLICY_SCORE_MODEL.grades[0]) {
    grade = POLICY_SCORE_MODEL.grades[1];
    gradeNote = '省级及以下政策最高评定为 A 级，S 级保留给国家级重大方向性政策。';
  }

  return {
    total,
    grade,
    gradeNote,
    dimensions,
    method: POLICY_SCORE_MODEL.note,
  };
}

// ---------------------------------------------------------------- 主入口

export function interpretPolicy(policy) {
  const text = normalizePolicyText(policy?.text);
  const lower = text.toLowerCase();
  const title = normalizePolicyText(policy?.title) || '未命名政策';
  // 标题常承载发布主体与区域信息，级别 / 区域识别把标题并入检索面。
  const surface = `${title}\n${text}`;
  const surfaceLower = surface.toLowerCase();

  const level = detectLevel(surface, surfaceLower, { declaredIssuer: policy?.issuer });
  const regions = detectRegions(surfaceLower);
  const goal = detectGoals(text, lower);
  const chain = analyzeChain(lower);
  const region = analyzeRegion(regions, level, goal.intensityScore);
  const company = analyzeCompany(chain, goal.intensityScore);
  const timeline = analyzeTimeline(text);
  const banking = analyzeBanking(lower, chain, level);
  const score = scorePolicy({ level, goal, chain, region, company, timeline, banking });

  const matchedTerms = Array.from(
    new Set([
      ...goal.strength.hits,
      ...chain.levels.flatMap((item) => item.hits),
      ...banking.products.flatMap((item) => item.hits),
    ]),
  ).slice(0, 48);

  return {
    id: policy?.id || '',
    title,
    sourceName: policy?.sourceName || '',
    declaredLevel: policy?.level || '',
    text,
    level,
    regions,
    goal,
    chain,
    region,
    company,
    timeline,
    banking,
    score,
    wordCount: text.replace(/\s/g, '').length,
    paragraphs: text.split(/\n+/).filter((line) => line.trim()).length,
    evidence: {
      matchedTerms,
      level: level.evidence,
      goal: goal.evidence,
      chain: chain.evidence,
      region: region.evidence,
      company: company.evidence,
      timeline: timeline.evidence,
      banking: banking.evidence,
    },
  };
}
