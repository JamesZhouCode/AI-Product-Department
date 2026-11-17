// 「政策分析」页（导入政策文件 → 七步框架解读）的数据、引擎与接入单测：
// 1) 四级政策空间识别与示例政策一致；
// 2) 八维评分模型权重守恒、分档单调、总分与分项自洽；
// 3) 产业链七环节与产业链地图同源，命中方向来自词典；
// 4) 区域产业基础、产业集群评价模型与地图数据可对齐；
// 5) 时间周期、银行业务与影响路径齐备；
// 6) 来源标注全部可解析，官方口径必须写明出处；
// 7) 源码层面：页签顺序、App 渲染分支、导入能力与地图复用。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CLUSTER_MODEL,
  COMPANY_GROUPS,
  GOAL_STRENGTHS,
  POLICY_BASE_YEAR,
  POLICY_LEVELS,
  POLICY_LEVEL_MAP,
  POLICY_META,
  POLICY_SCORE_MODEL,
  REGION_BASE,
  REGION_MAP_BANDS,
  REGION_MAP_EMPTY_FILL,
  SAMPLE_POLICIES,
  SCORE_FORMULAS,
  modulesFor,
} from '../src/features/policy/policyData.js';
import {
  clusterMaturity,
  clusterStars,
  interpretPolicy,
  normalizePolicyText,
  scoreGrade,
  shortRegionName,
} from '../src/features/policy/policyEngine.js';
import {
  countCjk,
  inferPdfTitle,
  isPageNoise,
  isPdfFile,
  joinPdfPages,
  mergeWrappedLines,
} from '../src/features/policy/policyPdf.js';
import {
  POLICY_FIELD_SOURCES,
  POLICY_SOURCE_META,
  POLICY_SOURCE_SUMMARY,
} from '../src/features/policy/policySources.js';

const read = (relative) => readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8');
const readData = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

// 产业链地图的真实数据（政策解读的环节口径与它同源）。
const CHAIN_DATA = JSON.parse(readData('public/data/industries/storage-chain.json'));
// 政策区域影响地图所用的离线省级边界（含台湾省、港澳与南海诸岛要素）。
const PROVINCE_GEO = JSON.parse(readData('public/data/china-provinces.geojson'));

const RESULTS = SAMPLE_POLICIES.map((sample) => ({ sample, result: interpretPolicy(sample) }));

// ---------------------------------------------------------------- 模块与框架

test('模块导航含政策清单与七步框架，两个视图各带一个开头模块且编号连续', () => {
  const { modules } = POLICY_META;
  assert.equal(modules.length, 8, '公共模块应为「政策清单 + 七步框架」= 8 个');
  modules.forEach((module) => {
    assert.ok(module.id && module.nav, `模块 ${module.id} 缺 id / nav`);
  });
  assert.deepEqual(
    modules.map((module) => module.id),
    ['list', 'space', 'goal', 'chain', 'region', 'company', 'timeline', 'banking'],
    '公共模块顺序被改动',
  );
  // 编号由 modulesFor 按视图拼接后重排：储能视图以「总体判断」开头，对比视图以「行业对比」开头。
  const storage = modulesFor('storage');
  const all = modulesFor('all');
  assert.deepEqual(
    [storage[0].id, all[0].id],
    ['overall', 'compare'],
    '两个视图的首个模块应为「总体判断」与「行业对比」',
  );
  assert.equal(storage.length, 9, '储能视图应为「总体判断 + 8 个公共模块」= 9 个');
  assert.equal(all.length, 9, '全行业视图应为「行业对比 + 8 个公共模块」= 9 个');
  [storage, all].forEach((list) => {
    list.forEach((module, index) => {
      assert.equal(module.no, String(index + 1).padStart(2, '0'), '模块编号不连续');
    });
  });
  // 「附 政策影响评分模型」附录已移除，不能残留编号或 id。
  const ids = storage.map((module) => module.id);
  assert.equal(new Set(ids).size, ids.length, '模块 id 存在重复');
  assert.ok(!ids.includes('score'), '模块清单仍含评分模型附录');
  assert.ok(POLICY_META.industry && POLICY_META.asOf);
});

// ---------------------------------------------------------------- 01 政策空间

test('四级政策空间定义完整，权威性与覆盖范围随层级递减', () => {
  assert.equal(POLICY_LEVELS.length, 4);
  assert.deepEqual(
    POLICY_LEVELS.map((level) => level.key),
    ['national', 'provincial', 'municipal', 'park'],
  );
  POLICY_LEVELS.forEach((level) => {
    assert.ok(
      level.label && level.range && level.desc && level.focus && level.banking,
      `${level.key} 字段缺失`,
    );
    assert.ok(level.authority > 0 && level.authority <= 100, `${level.key} 权威性越界`);
    assert.ok(level.scope > 0 && level.scope <= 100, `${level.key} 覆盖范围越界`);
  });
  const authorities = POLICY_LEVELS.map((level) => level.authority);
  assert.deepEqual(
    authorities,
    [...authorities].sort((a, b) => b - a),
    '权威性应随层级递减',
  );
});

test('四份示例政策覆盖国家 / 省 / 地市 / 园区四级，且级别识别与标注一致', () => {
  assert.equal(SAMPLE_POLICIES.length, 4);
  assert.deepEqual(
    SAMPLE_POLICIES.map((sample) => sample.level),
    ['national', 'provincial', 'municipal', 'park'],
  );
  RESULTS.forEach(({ sample, result }) => {
    assert.equal(
      result.level.key,
      sample.level,
      `《${sample.title}》识别级别为 ${result.level.label}，与标注不符`,
    );
    assert.equal(result.level.uncertain, false, `《${sample.title}》级别不应标记为待确认`);
    assert.ok(result.level.issuerIdentified, `《${sample.title}》应识别到发布主体`);
    assert.ok(result.evidence.level.length > 0, `《${sample.title}》缺级别取证`);
  });
  // 园区级政策应识别到园区管理机构作为发布主体。
  const park = RESULTS.find(({ sample }) => sample.level === 'park').result;
  assert.match(park.level.issuer, /管理委员会|管委会/, '园区级政策的发布主体应为园区管理机构');
});

test('区域名称归一到产业基础数据的键', () => {
  assert.equal(shortRegionName('江苏省'), '江苏');
  assert.equal(shortRegionName('北京市'), '北京');
  assert.equal(shortRegionName('内蒙古自治区'), '内蒙古');
  assert.equal(shortRegionName('广西壮族自治区'), '广西');
  assert.equal(shortRegionName('新疆维吾尔自治区'), '新疆');
  assert.equal(shortRegionName('宁夏回族自治区'), '宁夏');
  assert.equal(shortRegionName('香港特别行政区'), '香港');
  assert.equal(shortRegionName(''), '');
  // 边界数据里的全部省份要素都必须能归一到键（台湾 / 港澳无产业数据但不得报错）。
  PROVINCE_GEO.features
    .filter((feature) => feature.properties?.name)
    .forEach((feature) => {
      assert.ok(shortRegionName(feature.properties.name), `${feature.properties.name} 归一为空`);
    });
});

// ---------------------------------------------------------------- 02 政策目标

test('政策目标强度分级齐备，且识别到的强度来自原文命中', () => {
  RESULTS.forEach(({ sample, result }) => {
    assert.ok(result.goal.strength.label, `《${sample.title}》缺目标强度`);
    assert.ok(result.goal.strength.score > 0 && result.goal.strength.score <= 100, '强度子分越界');
    if (result.goal.strength.key !== 'silent') {
      assert.ok(result.goal.strength.hits.length > 0, `《${sample.title}》强度结论缺原文取证`);
      assert.ok(result.evidence.goal.length > 0);
    }
  });
  // 国家级示范方案含明确支持与约束性表述，应落在「明确支持」及以上。
  const national = RESULTS[0].result;
  assert.ok(
    ['mandatory', 'supported'].includes(national.goal.strength.key),
    '国家级方案的强度不应低于明确支持',
  );
  assert.ok(national.goal.quantitative.length > 0, '国家级方案应能抽出量化目标');
  assert.ok(
    national.goal.quantitative.some((item) => item.includes('1.8')),
    '应抽出 2027 年 1.8 亿千瓦的量化目标',
  );
});

// ---------------------------------------------------------------- 03 产业链影响

test('产业链七环节与产业链地图完全对齐', () => {
  assert.equal(CHAIN_DATA.levels.length, 7);
  const liveLabels = CHAIN_DATA.levels.map((level) => level.label);
  const national = RESULTS[0].result;
  assert.equal(national.chain.levels.length, 7);
  assert.deepEqual(
    national.chain.levels.map((level) => level.label),
    liveLabels,
  );
  assert.deepEqual(
    national.chain.positions.map((position) => position.position),
    CHAIN_DATA.positions.map((position) => position.label),
  );
  // 每个环节都被归属到唯一的上 / 中 / 下游分组。
  const grouped = national.chain.positions.flatMap((position) =>
    position.levels.map((level) => level.key),
  );
  assert.equal(new Set(grouped).size, 7);
});

test('环节命中强度与影响方向自洽，未命中环节不编造结论', () => {
  RESULTS.forEach(({ sample, result }) => {
    assert.ok(result.chain.hitCount >= 1, `《${sample.title}》应至少命中一个环节`);
    result.chain.levels.forEach((level) => {
      if (level.hit) {
        assert.ok(level.hits.length > 0, `${level.label} 标记命中但没有取证词`);
        assert.ok(level.intensity > 0 && level.intensity <= 100, `${level.label} 强度越界`);
        assert.ok(level.direction, `${level.label} 命中后必须给出影响方向`);
        assert.ok(
          ['demand', 'competition', 'model', 'cost'].includes(level.direction.key),
          `${level.label} 影响方向非法`,
        );
      } else {
        assert.equal(level.intensity, 0, `${level.label} 未命中但强度非零`);
        assert.equal(level.direction, null, `${level.label} 未命中不应有影响方向`);
      }
    });
    // 命中词必须真实出现在原文里。
    result.chain.hitLevels.forEach((level) => {
      level.hits.forEach((hit) => {
        assert.ok(
          result.text.toLowerCase().includes(String(hit).toLowerCase()),
          `${level.label} 的取证词「${hit}」不在原文中`,
        );
      });
    });
  });
  // 全篇主导方向应取命中数最多的方向之一。
  const demandLed = RESULTS[0].result;
  assert.ok(demandLed.chain.globalDirection, '应给出全篇主导影响方向');
  assert.ok(demandLed.chain.globalCounts[demandLed.chain.globalDirection.key] > 0);
});

// ---------------------------------------------------------------- 04 区域影响

test('区域产业集群评价模型权重守恒，成熟度与星级单调对应', () => {
  const total = CLUSTER_MODEL.dimensions.reduce((sum, dim) => sum + dim.weight, 0);
  assert.equal(total, 100, '集群评价模型权重应合计 100');
  assert.equal(CLUSTER_MODEL.dimensions.length, 6);
  assert.equal(
    clusterMaturity({
      companies: 100,
      leaders: 100,
      chain: 100,
      output: 100,
      tech: 100,
      policy: 100,
    }),
    100,
  );
  assert.equal(clusterMaturity({}), 0);
  assert.equal(clusterStars(100), 5);
  assert.equal(clusterStars(0), 0);
  assert.equal(clusterStars(92), 4.5);
  // 星级必须随成熟度单调不减。
  const maturities = [0, 12, 25, 38, 50, 63, 76, 88, 100];
  const stars = maturities.map(clusterStars);
  assert.deepEqual(
    stars,
    [...stars].sort((a, b) => a - b),
    '星级应随成熟度单调不减',
  );
});

test('各省级区域数据字段完整，分维打分落在 0–100', () => {
  const names = Object.keys(REGION_BASE);
  assert.ok(names.length >= 12, `区域样本过少：${names.length}`);
  assert.ok(names.includes('江苏') && names.includes('广东') && names.includes('内蒙古'));
  Object.entries(REGION_BASE).forEach(([name, base]) => {
    assert.ok(base.full && base.direction && base.note, `${name} 缺基本信息`);
    assert.ok(base.policyCount > 0, `${name} 缺政策存量`);
    assert.ok(base.advantages.length >= 2, `${name} 产业优势不足`);
    assert.ok(base.leaders.length >= 2, `${name} 重点企业不足`);
    assert.ok(base.clusters.length >= 1, `${name} 缺典型集群`);
    CLUSTER_MODEL.dimensions.forEach((dim) => {
      const score = base.dims[dim.key];
      assert.ok(score >= 0 && score <= 100, `${name} 的 ${dim.label} 越界：${score}`);
    });
  });
});

test('地图配色分档连续覆盖 0–100，且示例政策的区域结论自洽', () => {
  const bands = REGION_MAP_BANDS.map((band) => band.min);
  assert.deepEqual(
    bands,
    [...bands].sort((a, b) => b - a),
    '分档应按阈值降序',
  );
  assert.equal(bands.at(-1), 0, '分档必须覆盖到 0');
  REGION_MAP_BANDS.forEach((band) => assert.match(band.fill, /^#[0-9a-f]{6}$/i));
  assert.match(REGION_MAP_EMPTY_FILL, /^#[0-9a-f]{6}$/i);

  RESULTS.forEach(({ sample, result }) => {
    assert.equal(result.region.rows.length, Object.keys(REGION_BASE).length);
    result.region.rows.forEach((row) => {
      assert.ok(row.value >= 0 && row.value <= 100, `${row.name} 带动强度越界`);
      assert.ok(row.band && row.value >= row.band.min, `${row.name} 未落到分档`);
      assert.equal(row.maturity, clusterMaturity(REGION_BASE[row.name].dims));
      assert.equal(row.stars, clusterStars(row.maturity));
    });
    // 全国性政策应覆盖全部区域，区域政策只直接覆盖命中省份。
    if (sample.level === 'national') {
      assert.equal(
        result.region.matched.length,
        result.region.rows.length,
        '全国性政策应覆盖全部区域',
      );
    } else {
      assert.ok(result.region.matched.length < result.region.rows.length);
    }
  });
  // 江苏省级政策的主要关联区域必须是江苏。
  const provincial = RESULTS.find(({ sample }) => sample.level === 'provincial').result;
  assert.equal(provincial.region.primary.name, '江苏');
  assert.deepEqual(
    provincial.region.matched.map((row) => row.name),
    ['江苏'],
  );
  // 地市级政策（盐城）应归到江苏。
  const municipal = RESULTS.find(({ sample }) => sample.level === 'municipal').result;
  assert.equal(municipal.region.primary.name, '江苏', '盐城应归入江苏省');
  assert.equal(municipal.region.clusterRows.length, 6, '应给出集群评价模型的六个维度');
});

// ---------------------------------------------------------------- 05 企业影响

test('企业客群与产业链环节一一对应，命中客群才输出', () => {
  COMPANY_GROUPS.forEach((group) => {
    assert.ok(group.label && group.basis && group.direction, `${group.key} 字段缺失`);
    assert.ok(group.levels.length >= 1, `${group.key} 未关联环节`);
    assert.equal(group.products.length, 2, `${group.key} 应配两项产品`);
    group.levels.forEach((key) => {
      assert.ok(
        ['material', 'device', 'equipment', 'testing', 'cell', 'integration', 'operation'].includes(
          key,
        ),
        `${group.key} 引用了未知环节：${key}`,
      );
    });
  });
  RESULTS.forEach(({ sample, result }) => {
    assert.ok(result.company.groups.length >= 1, `《${sample.title}》未匹配到客群`);
    result.company.groups.forEach((group) => {
      assert.ok(group.matchedLevels.length >= 1, `${group.label} 缺关联环节`);
      assert.ok(
        group.matchedLevels.every((label) =>
          result.chain.levels.some((level) => level.label === label),
        ),
      );
    });
  });
});

// ---------------------------------------------------------------- 06 时间周期

test('时间周期：年份解析、跨度与三阶段划分正确', () => {
  const national = RESULTS[0].result;
  assert.deepEqual(national.timeline.years, [2025, 2027, 2030]);
  assert.equal(national.timeline.targetYear, 2030);
  assert.equal(national.timeline.span, 5);
  assert.equal(national.timeline.horizon, 'long');
  assert.equal(national.timeline.phases.length, 3);
  assert.equal(
    national.timeline.phases.filter((phase) => phase.active).length,
    1,
    '只能有一个阶段处于当前',
  );
  assert.equal(
    national.timeline.phases.find((phase) => phase.active).key,
    'long',
    '2030 目标应落在长期阶段',
  );

  // 无年份文本应按短期处理且不报错。
  const noYear = interpretPolicy({ title: '无年份', text: '鼓励园区内企业开展储能业务。' });
  assert.deepEqual(noYear.timeline.years, []);
  assert.equal(noYear.timeline.targetYear, null);
  assert.equal(noYear.timeline.span, null);
  assert.equal(noYear.timeline.horizon, 'short');
  assert.ok(noYear.timeline.durationScore > 0);
});

// ---------------------------------------------------------------- 07 银行业务

test('银行业务：产品命中即取证，影响路径固定五步', () => {
  RESULTS.forEach(({ sample, result }) => {
    assert.ok(result.banking.products.length >= 1, `《${sample.title}》未匹配到金融产品`);
    result.banking.products.forEach((product) => {
      assert.ok(product.label && product.scene && product.audience, `${product.key} 字段缺失`);
      assert.equal(product.products.length, 2, `${product.key} 应配两项产品`);
      assert.ok(product.hits.length > 0, `${product.key} 命中但无取证`);
      product.hits.forEach((hit) => {
        assert.ok(
          result.text.toLowerCase().includes(String(hit).toLowerCase()),
          `取证词「${hit}」不在原文中`,
        );
      });
    });
    assert.equal(result.banking.path.length, 5);
    assert.deepEqual(
      result.banking.path.map((step) => step.key),
      ['policy', 'action', 'chain', 'company', 'bank'],
    );
    result.banking.path.forEach((step) => assert.ok(step.label && step.text));
    // 路径最后一步必须落到银行可开展的产品上。
    assert.ok(result.banking.path.at(-1).text.length > 0);
  });
  // 园区级政策应命中园区金融或融资租赁这类载体型产品。
  const park = RESULTS.find(({ sample }) => sample.level === 'park').result;
  assert.ok(park.banking.products.some((product) => ['park', 'lease'].includes(product.key)));
});

// ---------------------------------------------------------------- 附 评分模型

test('评分模型：八维权重合计 100，分档单调且覆盖 0 分', () => {
  const { dimensions, grades } = POLICY_SCORE_MODEL;
  assert.equal(dimensions.length, 8);
  assert.equal(
    dimensions.reduce((sum, dim) => sum + dim.weight, 0),
    100,
    '八维权重应合计 100',
  );
  // 权重最高的必须是产业链影响深度。
  const top = [...dimensions].sort((a, b) => b.weight - a.weight)[0];
  assert.equal(top.key, 'chain');
  assert.equal(top.weight, 20);
  dimensions.forEach((dim) => assert.ok(dim.label && dim.hint, `${dim.key} 缺说明`));

  const mins = grades.map((grade) => grade.min);
  assert.deepEqual(
    mins,
    [...mins].sort((a, b) => b - a),
    '分档阈值应降序',
  );
  assert.equal(mins.at(-1), 0, '分档必须覆盖到 0 分');
  grades.forEach((grade) => assert.ok(grade.label && grade.text && grade.tone));
  assert.equal(scoreGrade(100).min, grades[0].min);
  assert.equal(scoreGrade(0).label, grades.at(-1).label);
});

test('总分等于八维加权汇总，分维子分与等级自洽', () => {
  RESULTS.forEach(({ sample, result }) => {
    const { total, dimensions, grade } = result.score;
    assert.equal(dimensions.length, 8);
    dimensions.forEach((dim) => {
      assert.ok(dim.score >= 0 && dim.score <= 100, `${dim.key} 子分越界`);
      assert.equal(
        dim.weighted,
        Math.round((dim.score * dim.weight) / 100),
        `${dim.key} 加权分不符`,
      );
      assert.ok(dim.evidence, `${dim.key} 缺打分依据`);
    });
    const raw = dimensions.reduce((sum, dim) => sum + (dim.score * dim.weight) / 100, 0);
    assert.equal(
      total,
      Math.min(100, Math.max(0, Math.round(raw))),
      `${sample.title} 总分与分项不自洽`,
    );
    assert.ok(grade.min <= total, `${sample.title} 等级分档与总分不符`);
    assert.ok(
      grade.label.startsWith('S') ||
        grade.label.startsWith('A') ||
        grade.label.startsWith('B') ||
        grade.label.startsWith('C'),
    );
  });
  // 级别越高（其他条件相同时）权威性子分越高：园区级应低于国家级。
  const national = RESULTS[0].result.score.dimensions.find((dim) => dim.key === 'authority').score;
  const park = RESULTS[3].result.score.dimensions.find((dim) => dim.key === 'authority').score;
  assert.ok(national > park, '国家级政策的权威性子分应高于园区级');
  // 总分排序应与政策层级一致：国家级 > 省级 > 园区级。
  const totals = RESULTS.map(({ result }) => result.score.total);
  assert.ok(totals[0] > totals[3], '国家级政策总分应高于园区级');
  assert.ok(totals[0] >= totals[1], '国家级政策总分不应低于省级');
});

test('S 级保留给国家级政策：省级及以下最高评定为 A 级', () => {
  RESULTS.forEach(({ sample, result }) => {
    if (sample.level === 'national') {
      assert.equal(result.score.gradeNote, '', '国家级政策不应触发等级封顶说明');
    } else {
      assert.ok(!result.score.grade.label.startsWith('S'), `《${sample.title}》不应评为 S 级`);
      if (result.score.total >= POLICY_SCORE_MODEL.grades[0].min) {
        assert.ok(result.score.gradeNote, '被封顶的政策应给出说明');
      }
    }
  });
});

// ---------------------------------------------------------------- 边界与健壮性

test('空文本与乱码文本不抛错，未识别项如实标注', () => {
  const empty = interpretPolicy({ title: '', text: '' });
  assert.equal(empty.title, '未命名政策');
  assert.equal(empty.wordCount, 0);
  assert.equal(empty.chain.hitCount, 0);
  assert.equal(empty.chain.chainScore, 0);
  assert.equal(empty.region.matched.length, 0);
  assert.equal(empty.region.primary, null);
  assert.equal(empty.region.fallbackTop.length, 5, '未识别区域时应给出参考区域');
  assert.equal(empty.company.groups.length, 0);
  assert.equal(empty.banking.products.length, 0);
  assert.ok(empty.score.total >= 0 && empty.score.total <= 100);
  assert.ok(empty.level.uncertain, '无发布主体信息时应标记级别待确认');
  assert.equal(empty.level.issuerIdentified, false);

  const noise = interpretPolicy({
    title: '无关文本',
    text: '今天天气不错，适合出门散步。'.repeat(3),
  });
  assert.equal(noise.chain.hitCount, 0);
  assert.ok(noise.timeline.years.length === 0);
  assert.ok(noise.banking.products.length === 0);
});

test('文本归一化统一换行与空白，重复解读结果稳定', () => {
  assert.equal(normalizePolicyText('a\r\n\r\n  b\t\tc  '), 'a\nb c');
  const first = interpretPolicy(SAMPLE_POLICIES[0]);
  const second = interpretPolicy(SAMPLE_POLICIES[0]);
  assert.deepEqual(second.score, first.score);
  assert.deepEqual(
    second.chain.hitLevels.map((level) => level.key),
    first.chain.hitLevels.map((level) => level.key),
  );
});

// ---------------------------------------------------------------- 打分标准（用户可查看）

const clampScore = (value) => Math.min(100, Math.max(0, Math.round(value)));

// 按「打分标准」的档位与公式重算某一维子分：标准若与引擎走样，这里就对不上。
function recomputeDimension(key, result) {
  const { level, goal, chain, region, company, timeline, banking } = result;
  switch (key) {
    case 'authority':
      return POLICY_LEVEL_MAP[level.key].authority;
    case 'scope':
      return POLICY_LEVEL_MAP[level.key].scope;
    case 'intensity':
      return clampScore(
        goal.strength.score +
          Math.min(
            SCORE_FORMULAS.intensity.quantumCap,
            goal.quantitative.length * SCORE_FORMULAS.intensity.quantumStep,
          ),
      );
    case 'chain':
      return clampScore(
        Math.round((chain.hitCount / 7) * SCORE_FORMULAS.chain.levelRatioMax) +
          Math.min(SCORE_FORMULAS.chain.hitCap, chain.totalHits * SCORE_FORMULAS.chain.perHit),
      );
    case 'region':
      return region.matched.length
        ? Math.round(
            region.matched.reduce((sum, row) => sum + row.maturity, 0) / region.matched.length,
          )
        : SCORE_FORMULAS.region.fallback;
    case 'company':
      return clampScore(
        SCORE_FORMULAS.company.base +
          company.groups.length * SCORE_FORMULAS.company.perGroup +
          (clampScore(goal.intensityScore) - SCORE_FORMULAS.company.strengthRef) *
            SCORE_FORMULAS.company.strengthSlope,
      );
    case 'duration': {
      const rule = SCORE_FORMULAS.duration;
      const { targetYear, span } = timeline;
      let value = rule.unknownYear;
      if (targetYear !== null) {
        const horizonYears = targetYear - POLICY_BASE_YEAR;
        value = rule.byHorizon.find((band) => horizonYears >= band.min).score;
        if (span !== null && span >= rule.spanBonusMin) {
          value = Math.min(100, value + rule.spanBonus);
        }
      } else if (span !== null) {
        value = rule.noYearBySpan.find((band) => span >= band.min).score;
      }
      if (targetYear !== null && targetYear >= rule.longTermYear) {
        value = Math.max(value, rule.longTermMin);
      }
      return value;
    }
    case 'banking':
      return clampScore(
        banking.products.length
          ? SCORE_FORMULAS.banking.base +
              banking.products.length * SCORE_FORMULAS.banking.perProduct
          : SCORE_FORMULAS.banking.none,
      );
    default:
      return null;
  }
}

test('打分标准：八个维度都给出「怎么算」与「分值档位」，且权重合计 100', () => {
  const { dimensions } = POLICY_SCORE_MODEL;
  assert.equal(dimensions.length, 8);
  assert.equal(
    dimensions.reduce((sum, dim) => sum + dim.weight, 0),
    100,
    '八维权重应合计 100',
  );
  dimensions.forEach((dim) => {
    assert.ok(['band', 'score'].includes(dim.mode), `${dim.key} 的 mode 非法`);
    assert.ok(dim.standard && dim.standard.length >= 12, `${dim.key} 缺少「怎么算」的说明`);
    assert.ok(Array.isArray(dim.bands) && dim.bands.length >= 2, `${dim.key} 缺少档位明细`);
    // 档位条件必须唯一，否则前端渲染会出现重复 key。
    const conds = dim.bands.map((band) => band.cond);
    assert.equal(
      new Set(conds).size,
      conds.length,
      `${dim.key} 存在重复的档位条件：${conds.join(' / ')}`,
    );
    dim.bands.forEach((band) => {
      assert.ok(band.cond, `${dim.key} 存在无条件的档位`);
      assert.ok(
        (typeof band.score === 'number' && band.score >= 0) ||
          (typeof band.score === 'string' && band.score.length > 0),
        `${dim.key} 的档位「${band.cond}」缺少分值`,
      );
    });
  });
  assert.ok(POLICY_SCORE_MODEL.totalNote.includes('权重'), '缺少总分换算口径');
  assert.ok(POLICY_SCORE_MODEL.totalNote.includes('S'), '缺少 S 级封顶口径');
});

test('打分标准：公示的档位与级别、强度、年限等数据源同源', () => {
  const dim = (key) => POLICY_SCORE_MODEL.dimensions.find((item) => item.key === key);
  // 权威性 / 空间覆盖范围直接取自四级政策空间定义。
  assert.deepEqual(
    dim('authority').bands.map((band) => band.score),
    POLICY_LEVELS.map((level) => level.authority),
    '权威性档位与 POLICY_LEVELS 不一致',
  );
  assert.deepEqual(
    dim('scope').bands.map((band) => band.score),
    POLICY_LEVELS.map((level) => level.scope),
    '空间覆盖档位与 POLICY_LEVELS 不一致',
  );
  // 目标强度基准分与 GOAL_STRENGTHS 同源，并含「未识别」档。
  const intensityScores = dim('intensity').bands.map((band) => band.score);
  GOAL_STRENGTHS.forEach((strength) =>
    assert.ok(intensityScores.includes(strength.score), `目标强度档位缺少 ${strength.label}`),
  );
  assert.ok(intensityScores.includes(48), '目标强度档位缺少「未识别」档');
  // 持续时间档位覆盖年限档与跨度加分档。
  const durationScores = dim('duration').bands.map((band) => band.score);
  SCORE_FORMULAS.duration.byHorizon.forEach((band) =>
    assert.ok(durationScores.includes(band.score), `持续时间档位缺少 ${band.score} 分档`),
  );
  SCORE_FORMULAS.duration.noYearBySpan.forEach((band) =>
    assert.ok(durationScores.includes(band.score), `持续时间档位缺少无年份 ${band.score} 分档`),
  );
  assert.ok(
    durationScores.includes(`+${SCORE_FORMULAS.duration.spanBonus}`),
    '持续时间档位缺少跨度加分项',
  );
  // 计分式维度的关键数字必须出现在「怎么算」的文案里，否则用户看到的公式是错的。
  const withNumbers = (key, numbers) => {
    const text = dim(key).standard;
    numbers.forEach((value) =>
      assert.ok(text.includes(String(value)), `${key} 的公式未写明数字 ${value}`),
    );
  };
  withNumbers('chain', [SCORE_FORMULAS.chain.levelRatioMax, SCORE_FORMULAS.chain.perHit]);
  withNumbers('region', [SCORE_FORMULAS.region.fallback]);
  withNumbers('company', [
    SCORE_FORMULAS.company.base,
    SCORE_FORMULAS.company.perGroup,
    SCORE_FORMULAS.company.strengthRef,
  ]);
  withNumbers('banking', [SCORE_FORMULAS.banking.base, SCORE_FORMULAS.banking.perProduct]);
  withNumbers('intensity', [
    SCORE_FORMULAS.intensity.quantumStep,
    SCORE_FORMULAS.intensity.quantumCap,
  ]);
  // 基准年共用：标准文案里的年限基准与引擎一致。
  assert.ok(
    dim('duration').standard.includes(String(POLICY_BASE_YEAR)),
    '持续时间标准未写明基准年',
  );
});

test('打分标准：按标准重算的分维子分与引擎结果逐项一致', () => {
  RESULTS.forEach(({ sample, result }) => {
    result.score.dimensions.forEach((dim) => {
      const expected = recomputeDimension(dim.key, result);
      assert.equal(
        dim.score,
        expected,
        `${sample.title} 的「${dim.label}」：引擎 ${dim.score} 分，按公示标准应为 ${expected} 分`,
      );
    });
  });
  // 计分式维度的子分必须能由档位说明解释：给出基准分与加分项的组合。
  const chainDim = POLICY_SCORE_MODEL.dimensions.find((item) => item.key === 'chain');
  assert.ok(
    chainDim.bands.some((band) => band.score === SCORE_FORMULAS.chain.perHit),
    '产业链维度缺少加分明细',
  );
});

test('打分标准：页面提供查看入口与弹窗，且来源说明覆盖打分标准', () => {
  const canvas = read('features/policy/PolicyDigestCanvas.jsx');
  const page = read('features/policy/PolicyPage.jsx');
  assert.ok(canvas.includes('查看打分标准'), '入口未给出可点击提示文案');
  assert.ok(page.includes('PolicyScoreStandardModal'), '页面未挂载打分标准弹窗');
  assert.ok(page.includes('setScoreStandardOpen(true)'), '页面缺少打开打分标准的入口');
  assert.ok(page.includes('scoreStandardOpen'), '缺少打分标准弹窗状态');

  const modal = read('features/policy/PolicyScoreStandard.jsx');
  assert.ok(modal.includes('POLICY_SCORE_MODEL.dimensions.map'), '弹窗未逐维展示标准');
  assert.ok(modal.includes('dim.standard'), '弹窗未展示「怎么算」');
  assert.ok(modal.includes('dim.bands'), '弹窗未展示档位分值');
  assert.ok(modal.includes('POLICY_SCORE_MODEL.grades.map'), '弹窗未展示等级评定');
  assert.ok(modal.includes('weighted'), '弹窗未展示本政策加权分');
  // 打分标准必须标注来源：模型口径 + 引擎解读口径。
  assert.ok(modal.includes('sourceKey="scoreModel"'), '弹窗缺少评分模型来源标注');
  assert.ok(modal.includes('sourceKey="engine"'), '弹窗缺少引擎来源标注');
  assert.ok(modal.includes('不替代'), '弹窗缺少使用边界说明');

  const fields = POLICY_FIELD_SOURCES.flatMap((group) => group.items);
  assert.ok(
    fields.some((item) => item.field.includes('打分标准')),
    '来源对照表未覆盖打分标准',
  );
});

// ---------------------------------------------------------------- 数据来源

const allSourceKeys = () => [
  ...POLICY_FIELD_SOURCES.flatMap((group) => group.items.map((item) => item.source)),
  'policyOriginal',
  'libraryLocal',
  'regionBase',
  'chainMap',
  'framework',
  'scoreModel',
  'clusterModel',
  'engine',
];

test('来源元数据字段完整，真实口径必须写明出处', () => {
  Object.entries(POLICY_SOURCE_META).forEach(([key, meta]) => {
    assert.ok(['data', 'ai'].includes(meta.kind), `${key} 的 kind 非法`);
    assert.ok(meta.scope && meta.badge && meta.title, `${key} 缺 scope / badge / title`);
    assert.ok(meta.detail.length >= 30, `${key} 的 detail 过短`);
    if (meta.kind === 'data') {
      assert.ok(meta.databases.length > 0, `${key} 为真实口径，必须列出数据源清单`);
    }
    assert.ok(Array.isArray(meta.databases));
  });
  const kinds = new Set(Object.values(POLICY_SOURCE_META).map((meta) => meta.kind));
  assert.deepEqual(kinds, new Set(['data', 'ai']), '真实口径与解读口径都应出现');
});

test('字段级对照表覆盖两个视图的关键模块，且引用的来源均可解析', () => {
  const groups = POLICY_FIELD_SOURCES.map((group) => group.group);
  // 两个视图各自的开头模块 + 八个公共模块 + 画布顶部读数，都必须有来源说明分组。
  [
    '储能视图 · 总体政策判断',
    '全行业视图 · 政策地位对比',
    '政策清单与筛选口径',
    '政策来源与空间范围',
    '政策目标分布',
    '产业链影响',
    '区域影响',
    '企业影响',
    '时间周期',
    '银行业务',
    '画布顶部关键读数',
  ].forEach((name) => assert.ok(groups.includes(name), `字段级对照表缺少分组：${name}`));
  const fields = POLICY_FIELD_SOURCES.flatMap((group) => group.items);
  fields.forEach((item) => {
    assert.ok(item.field, '存在空字段名');
    assert.ok(POLICY_SOURCE_META[item.source], `${item.field} 引用了未知来源：${item.source}`);
  });
  assert.ok(fields.length >= 20, `字段级对照条目过少：${fields.length}`);
  assert.ok(POLICY_SOURCE_SUMMARY.length >= 80, '来源总说明过短');
  allSourceKeys().forEach((key) =>
    assert.ok(POLICY_SOURCE_META[key], `引用了未定义的来源：${key}`),
  );
});

// ---------------------------------------------------------------- 页面与接入

test('「政策」页签属于「智能决策」分组且排在「行业」（原宏观）之前', () => {
  const nav = read('features/app/navGroups.js');
  assert.ok(nav.includes("['policy', '政策']"), '缺少政策页签');
  assert.ok(
    nav.indexOf("['policy', '政策']") < nav.indexOf("['macro', '行业']"),
    '政策页签必须排在行业之前',
  );
  assert.ok(nav.includes("label: '智能决策'"), '缺少智能决策一级分组');
  // 政策与行业都归在智能决策组内：两者都必须出现在该组的 tabs 段里。
  const decisionBlock = nav.slice(
    nav.indexOf("label: '智能决策'"),
    nav.indexOf("label: '生态经营'"),
  );
  assert.ok(decisionBlock.includes("['policy', '政策']"), '智能决策组缺少政策页签');
  assert.ok(decisionBlock.includes("['macro', '行业']"), '智能决策组缺少行业页签');
  const app = read('App.jsx');
  assert.ok(app.includes("activeTab === 'policy'"), 'App 缺少政策页渲染分支');
  assert.ok(app.includes("import PolicyPage from './features/policy/PolicyPage'"));
  assert.ok(
    app.includes('<PolicyPage selectedIndustry={activeIndustry} onNavigate={handleTabChange} />'),
  );
});

test('页面渲染集合解读画布，并提供来源说明与跨模块联动', () => {
  const page = read('features/policy/PolicyPage.jsx');
  const canvas = read('features/policy/PolicyDigestCanvas.jsx');
  POLICY_META.modules.forEach((module) => {
    assert.ok(canvas.includes(`id="${module.id}"`), `画布缺少模块：${module.id}`);
  });
  assert.ok(!canvas.includes('id="score"'), '画布仍渲染已移除的评分模型附录');
  assert.ok(!page.includes('政策影响评分模型'), '页面仍含已移除的附录标题');
  assert.ok(page.includes('数据来源说明'), '工具栏缺少数据来源说明入口');
  assert.ok(page.includes('PolicySourceModal'), '页面缺少来源说明弹窗');
  assert.ok(canvas.includes('policy-modnav'), '缺少模块导航');
  assert.ok(page.includes('onNavigate'), '页面未接入跨模块联动跳转');
  assert.ok(canvas.includes("onNavigate('credit')"), '画布缺少去授信页的联动跳转');
  assert.ok(canvas.includes('PolicyRegionMap'), '画布未渲染区域影响地图');
  // 解读范围切换：两个视图由 policyScopesFor 按当前产业链生成，页面必须渲染切换器。
  assert.ok(page.includes('policyScopesFor'), '页面未读取解读范围定义');
  assert.ok(page.includes('policy-scopes'), '页面缺少解读范围切换器');
  // 集合口径的八个模块标题必须逐字出现。
  [
    '政策清单与筛选口径',
    '政策来源与空间范围',
    '政策目标分布',
    '产业链环节覆盖',
    '区域影响分布',
    '受影响企业分布',
    '有效期与时间节奏',
    '可对接的银行业务',
  ].forEach((title) => assert.ok(canvas.includes(title), `缺少模块标题：${title}`));
  const modal = read('features/policy/PolicySourceBadge.jsx');
  assert.ok(modal.includes('policy-source-table'), '弹窗缺少字段级对照表');
});

test('集合画布顶部为集合读数，且不再有单条政策的评分附录', () => {
  const canvas = read('features/policy/PolicyDigestCanvas.jsx');
  // 环形总分图与八维明细属于已移除的附录，不应残留。
  assert.ok(!canvas.includes('policy-donut'), '残留环形评分图');
  assert.ok(!canvas.includes('policy-score-dims'), '残留八维评分明细');
  assert.ok(!canvas.includes('policy-score-layout'), '残留评分附录布局');
  // 顶部读数改为集合口径。
  ['纳入政策', '平均影响评分', '最高评分政策', '仍在有效期内', '覆盖区域'].forEach((text) =>
    assert.ok(canvas.includes(text), `集合读数缺少：${text}`),
  );
  // 样式表同步清理，避免死规则。
  const css = read('features/policy/policy.css');
  ['policy-donut', 'policy-score-layout', 'policy-score-dims', 'policy-score-method'].forEach(
    (cls) => assert.ok(!css.includes(`.${cls}`), `样式表残留死规则：${cls}`),
  );
  // 评分横条仍被其他模块使用，必须保留。
  assert.ok(css.includes('.policy-score {'), '评分横条样式被误删');
  // 来源说明中的附录分组改为顶部读数分组，并覆盖新的 01 政策清单。
  const groups = POLICY_FIELD_SOURCES.map((group) => group.group);
  assert.ok(!groups.some((group) => group.startsWith('附')), '来源对照表仍留着附录分组');
  assert.ok(groups.includes('画布顶部关键读数'), '来源对照表缺少顶部读数分组');
  assert.ok(groups.includes('政策清单与筛选口径'), '来源对照表缺少政策清单分组');
  assert.ok(groups.includes('储能视图 · 总体政策判断'), '来源对照表缺少总体判断分组');
  assert.ok(groups.includes('全行业视图 · 政策地位对比'), '来源对照表缺少行业对比分组');
});

test('导入能力齐备：文件读取、粘贴录入与本地政策库', () => {
  const hook = read('features/policy/usePolicyLibrary.js');
  assert.ok(hook.includes('policy-library-v1'), '未声明本地存储键');
  assert.ok(hook.includes('localStorage'), '未使用本地存储持久化');
  assert.ok(hook.includes('readPolicyFile'), '未实现文件读取');
  assert.ok(hook.includes('file.text()'), '未读取文件文本');
  assert.ok(hook.includes('samplePoliciesFor'), '未支持按行业载入示例政策');
  const policyData = read('features/policy/policyData.js');
  assert.ok(policyData.includes('SAMPLE_POLICIES_COMPUTE'), '未提供算力产业的示例政策');
  assert.ok(hook.includes('MAX_ITEMS') && hook.includes('MAX_CHARS'), '缺少容量上限保护');

  const page = read('features/policy/PolicyPage.jsx');
  assert.ok(page.includes('readPolicyFile'), '页面未接入文件读取');
  assert.ok(page.includes('onDrop'), '拖拽区未处理 drop');
  assert.ok(page.includes('type="file"'), '缺少文件选择控件');
  assert.ok(page.includes('multiple'), '未支持多文件导入');
  assert.ok(page.includes('粘贴'), '未提供粘贴文本入口');
  assert.ok(page.includes('示例政策'), '未提供示例政策入口');
  assert.ok(page.includes('library.loadSamples'), '示例政策入口未接到政策库');
  assert.ok(page.includes('清空') && page.includes('clearAll'), '未提供清空政策库入口');
  // 政策库前置：导入能力收纳进「＋ 添加政策」小按钮的弹层，不再常驻大面板。
  assert.ok(page.includes('policy-libbar'), '政策库未前置为独立条目');
});

test('政策区域影响地图复用离线省份边界数据，不请求第三方地图服务', () => {
  const map = read('features/policy/PolicyRegionMap.jsx');
  assert.ok(map.includes('useProvinceShapes'), '未复用投影 Hook');
  assert.ok(map.includes('isSouthSea'), '未单独处理南海诸岛要素');
  assert.ok(map.includes('南海诸岛'), '缺少南海诸岛标注');
  assert.ok(map.includes('shortRegionName'), '未做省份名归一');
  assert.ok(!/https?:\/\//.test(map), '地图不得请求第三方地图服务');
  // 边界数据必须包含台湾省、港澳与南海诸岛要素。
  const names = PROVINCE_GEO.features.map((feature) => feature.properties?.name);
  ['台湾省', '香港特别行政区', '澳门特别行政区'].forEach((name) => {
    assert.ok(names.includes(name), `边界数据缺少 ${name}`);
  });
  const southSea = PROVINCE_GEO.features.find(
    (feature) => feature.properties?.adcode === '100000_JD',
  );
  assert.ok(southSea, '边界数据缺少南海诸岛及九段线要素');
});

// ---------------------------------------------------------------- PDF 导入

test('PDF：折行合并只拼回段落内断行，标题行与版头行保持独立', () => {
  const merged = mergeWrappedLines([
    '江苏省关于促进新型储能产业高质量发展的实施意见',
    '苏政办发〔2026〕18 号 江苏省人民政府办公厅 2026 年 3 月 12 日',
    '为深入贯彻落实国家关于加快新型储能发展的决策部署，推动我省新型储能产业高质',
    '量发展，结合江苏实际，制定本实施意见。',
    '一、总体要求',
    '坚持市场主导、政府引导，加快构建新型电力系统。到 2030 年，全省新型储能装机',
    '规模达到 1500 万千瓦，其中独立储能装机规模达到 600 万千瓦。',
  ]);
  // 返回的是「一行一段」的数组，所以用 some(includes) 做子串判断。
  const hasLine = (needle) => merged.some((line) => line.includes(needle));
  // 段落内被 PDF 折断的句子必须拼回，否则关键词会被切碎（如「高质/量发展」）。
  assert.ok(hasLine('推动我省新型储能产业高质量发展，结合江苏实际'), '段落内断行未拼回');
  assert.ok(hasLine('全省新型储能装机规模达到 1500 万千瓦'), '数字与量词被拆断');
  // 「一、总体要求」是章节标题，不能被上一段吞掉。
  assert.ok(merged.includes('一、总体要求'), '章节标题被误并入上一段');
  // 版头（发文字号 + 机关 + 日期）不能被标题行吞掉，也不能被拆开。
  assert.ok(hasLine('苏政办发〔2026〕18 号'), '版头行被误并入标题');
  assert.equal(
    merged.filter((line) => line.includes('苏政办发')).length,
    1,
    '版头行被重复或错误合并',
  );
  // 标题行不能与下面的版头拼在一起。
  assert.equal(merged[0], '江苏省关于促进新型储能产业高质量发展的实施意见', '标题行被并入版头');
  // 以句号收尾的行是真换行：下一行不会被并进来。
  const paragraphs = mergeWrappedLines([
    '坚持市场主导、政府引导，加快构建新型电力系统。到 2030 年，全省新型储能装机规模达到 1500 万千瓦。',
    '推动储能项目建设与电网规划衔接，支持在盐城、南通等地布局一批储能电站示范项目。',
  ]);
  assert.equal(paragraphs.length, 2, '以句号收尾的行被错误地与下一行合并');
  assert.ok(paragraphs[1].startsWith('推动储能项目建设'), '第二段起始被吞并');
});

test('PDF：页码与页眉横线作为排版噪声被剔除', () => {
  ['3', '3 / 12', '第 3 页', '第 3 页 / 共 12 页', '- 3 -', '——3——', '----------'].forEach(
    (noise) => {
      assert.ok(isPageNoise(noise), `页码噪声未识别：${noise}`);
    },
  );
  ['苏政办发〔2026〕18 号', '一、总体要求', '2026 年 3 月 12 日'].forEach((line) => {
    assert.ok(!isPageNoise(line), `正文行被误判为噪声：${line}`);
  });
  const text = joinPdfPages([
    ['正文第一行', '3 / 12', '第 2 页'],
    ['正文第二行', '7'],
  ]);
  assert.ok(!/\d\s*\/\s*\d/.test(text), '页码未被剔除');
  assert.ok(text.includes('正文第一行') && text.includes('正文第二行'), '正文被误删');
});

test('PDF：标题优先取正文首行，忽略 about:blank 这类元数据噪声', () => {
  const text = '江苏省关于促进新型储能产业高质量发展的实施意见\n苏政办发〔2026〕18 号\n正文';
  // 浏览器打印生成的 PDF，元数据标题就是 about:blank，不能采信。
  assert.equal(
    inferPdfTitle({ infoTitle: 'about:blank', text, fileName: 'a.pdf' }),
    '江苏省关于促进新型储能产业高质量发展的实施意见',
  );
  assert.equal(
    inferPdfTitle({ infoTitle: 'Microsoft Word - 未命名.docx', text, fileName: 'a.pdf' }),
    '江苏省关于促进新型储能产业高质量发展的实施意见',
  );
  // 正文首行是发文字号时应跳过，退到元数据或文件名。
  assert.equal(
    inferPdfTitle({
      infoTitle: '',
      text: '苏政办发〔2026〕18 号\n正文内容',
      fileName: '储能政策.pdf',
    }),
    '储能政策',
  );
});

test('PDF：文件类型判定与汉字计数', () => {
  assert.ok(isPdfFile({ name: '政策.pdf', type: '' }), '按扩展名未识别 PDF');
  assert.ok(isPdfFile({ name: 'scan', type: 'application/pdf' }), '按 MIME 未识别 PDF');
  assert.ok(!isPdfFile({ name: '政策.md', type: 'text/markdown' }), 'md 被误判为 PDF');
  assert.ok(!isPdfFile({ name: '政策.pdf.txt', type: 'text/plain' }), 'txt 被误判为 PDF');
  assert.ok(!isPdfFile(null), '空输入应返回 false');
  assert.equal(countCjk('储能 storage 123'), 2);
  assert.equal(countCjk(''), 0);
});

test('PDF：抽取入口把 pdfjs 放在动态 import 里，避免单测被 Vite 专有说明符拖挂', () => {
  const pdf = read('features/policy/policyPdf.js');
  assert.ok(pdf.includes('pdfjs-dist/build/pdf.mjs'), '未接入 pdf.js 主包');
  assert.ok(pdf.includes('pdf.worker.min.mjs?url'), '未通过 ?url 引入 worker');
  assert.ok(
    /await import\(|import\('pdfjs-dist/.test(pdf) && !/^import .*pdfjs-dist/m.test(pdf),
    'pdfjs 必须在动态 import 中加载，静态 import 会让 node --test 解析 ?url 失败',
  );
  // v6 里 destroy() 在 loading task 上，PDFDocumentProxy 只有 cleanup()。
  assert.ok(pdf.includes('task.destroy()'), '未销毁 loading task');
  assert.ok(pdf.includes('doc.cleanup()'), '未释放文档资源');
  assert.ok(!/doc\.destroy\(/.test(pdf), 'PDFDocumentProxy 在 v6 已无 destroy()');
  // 扫描件不做 OCR，必须如实报错而不是编造内容。
  assert.ok(pdf.includes('未检测到可用文本层'), '缺少扫描件提示');
  assert.ok(pdf.includes('粘贴文本'), '扫描件应引导到粘贴文本通道');
});

test('PDF：导入白名单与加载态已接入页面', () => {
  const page = read('features/policy/PolicyPage.jsx');
  assert.ok(page.includes('.pdf'), 'accept 白名单缺少 .pdf');
  assert.ok(page.includes('application/pdf'), 'accept 白名单缺少 PDF MIME');
  assert.ok(page.includes('isPdfFile'), '未按类型分流 PDF');
  assert.ok(page.includes('正在解析'), 'PDF 解析缺少加载态提示');
  assert.ok(page.includes('扫描件'), '未提示扫描件不支持');

  const hook = read('features/policy/usePolicyLibrary.js');
  assert.ok(hook.includes('readPolicyPdfFile'), '政策库未接入 PDF 读取');
  assert.ok(hook.includes('extractPdfText'), '未调用 PDF 文本抽取');
});

// ---------------------------------------------------------------- 发布主体误判防护

test('国家级发布主体：省级机构「省发展改革委」不得被判成国家级', () => {
  const sample = SAMPLE_POLICIES.find((policy) => policy.level === 'provincial');
  const text = `${sample.text}\n加强组织领导，省发展改革委、省工业和信息化厅按职责分工推进。`;
  const result = interpretPolicy({ ...sample, text });
  assert.equal(result.level.key, 'provincial', '「省发展改革委」把省级文件顶成了国家级');
  assert.ok(!result.level.issuer.includes('国家'), '发布主体被误认成国家部委');
});

test('国家级发布主体：「国家标准与行业标准」不得被判成国家标准委', () => {
  const sample = SAMPLE_POLICIES.find((policy) => policy.level === 'provincial');
  const text = `${sample.text}\n推动储能产品检测、认证能力提升，参与制定国家标准与行业标准。`;
  const result = interpretPolicy({ ...sample, text });
  assert.equal(result.level.key, 'provincial', '「国家标准」把省级文件顶成了国家级');
});

test('国家级发布主体：省级文件引用《国务院…》与「贯彻落实国务院」仍判省级', () => {
  const sample = SAMPLE_POLICIES.find((policy) => policy.level === 'provincial');
  ['《国务院关于加快新型储能发展的指导意见》', '贯彻落实国务院决策部署'].forEach((citation) => {
    const result = interpretPolicy({
      ...sample,
      title: '江苏省储能实施意见',
      text: `${citation}${sample.text}`,
    });
    assert.equal(result.level.key, 'provincial', `引用语「${citation}」把省级文件顶成了国家级`);
  });
});

test('国家级发布主体：真正的国家级文件仍判国家级（防过度过滤）', () => {
  const sample = SAMPLE_POLICIES.find((policy) => policy.level === 'national');
  assert.equal(interpretPolicy(sample).level.key, 'national', '国家级示例政策级别识别回归');
  // 国家级文件里出现「根据国务院部署」不能被当引用剥掉。
  const withLead = interpretPolicy({
    ...sample,
    text: `根据国务院部署，${sample.text}`,
  });
  assert.equal(withLead.level.key, 'national', '国家级文件的「根据国务院」被误剥');
});

test('国家级发布主体：省级文件不再被错评为 S 级', () => {
  const sample = SAMPLE_POLICIES.find((policy) => policy.level === 'provincial');
  const result = interpretPolicy({
    ...sample,
    title: '江苏省储能实施意见',
    text: `${sample.text}\n省发展改革委、省工业和信息化厅、省能源局按职责分工推进。参与制定国家标准。`,
  });
  assert.equal(result.level.key, 'provincial');
  assert.notEqual(result.score.grade.label.charAt(0), 'S', '省级文件不得评到 S 级');
});

// ---------------------------------------------------------------- 布局与滚动

test('滚动：整页纵向滚动且滚动条常显可拖动，画布不再内嵌滚动', () => {
  const css = read('features/policy/policy.css');
  const pageBlock = css.slice(css.indexOf('.policy-page {'), css.indexOf('.policy-page > *'));
  assert.ok(/overflow-y:\s*auto/.test(pageBlock), '整页未开启纵向滚动');
  assert.ok(/overflow-x:\s*hidden/.test(pageBlock), '整页缺少横向裁切');
  assert.ok(/scrollbar-gutter:\s*stable/.test(pageBlock), '未为滚动条预留占位，会出现横向跳动');
  // 滚动条必须显式加宽并给 thumb 上色，否则细到看不见、也拖不动。
  assert.ok(/\.policy-page::-webkit-scrollbar\s*\{[^}]*width:\s*12px/.test(css), '滚动条未加宽');
  assert.ok(/\.policy-page::-webkit-scrollbar-thumb/.test(css), '缺少滚动条滑块样式');
  assert.ok(/min-height:\s*48px/.test(css), '滚动条滑块未设最小高度，内容长时不好拖');
  // Firefox 兜底：声明 scrollbar-width 会让 Chromium 忽略伪元素样式，必须隔离。
  assert.ok(/@supports not selector\(::-webkit-scrollbar\)/.test(css), '缺少 Firefox 滚动条兜底');
  // 画布不能再自己滚（否则短窗口下被压扁成一条缝），高度由内容决定。
  const canvasBlock = css.slice(
    css.indexOf('.policy-canvas {'),
    css.indexOf('.policy-canvas-head {'),
  );
  assert.ok(/flex:\s*0 0 auto/.test(canvasBlock), '画布仍参与 flex 收缩，会被压扁');
  assert.ok(/min-height:\s*520px/.test(canvasBlock), '画布缺少最小高度兜底');
  assert.ok(/overflow:\s*visible/.test(canvasBlock), '画布仍裁剪内容，吸顶头部会失效');
  const bodyBlock = css.slice(
    css.indexOf('.policy-canvas-body {'),
    css.indexOf('.policy-canvas-body > *'),
  );
  assert.ok(/overflow:\s*visible/.test(bodyBlock), '画布正文仍是滚动容器，会出现双层滚动条');
  // 吸顶：滚动到后面模块时关键读数与模块导航仍在。
  const headBlock = css.slice(
    css.indexOf('.policy-canvas-head {'),
    css.indexOf('.policy-canvas-headline'),
  );
  assert.ok(/position:\s*sticky/.test(headBlock), '画布头部未吸顶');
  assert.ok(/top:\s*0/.test(headBlock), '吸顶未定位到顶部');
});

test('滚动：定位与高亮挂在整页滚动容器上，且扣除吸顶头部高度', () => {
  const page = read('features/policy/PolicyPage.jsx');
  assert.ok(
    /<main className="policy-page" ref=\{pageRef\} onScroll=\{handleScroll\}/.test(page),
    '滚动容器未落在整页',
  );
  assert.ok(!page.includes('ref={bodyRef}'), '画布正文仍挂着滚动 ref');
  assert.ok(page.includes('stickyGuard'), '定位未扣除吸顶头部占用的高度');
  assert.ok(page.includes('paddingTop'), '吸顶守卫未计入整页上内边距（实测吸顶位置等于它）');
  assert.ok(
    /page\.scrollTo\(\{\s*top:\s*page\.scrollTop \+ offset - stickyGuard\(\) - 10/.test(page),
    '模块跳转未扣除吸顶高度，目标模块会被遮住',
  );
  // 高亮基准线用吸顶头部的实际下沿，吸顶与否都成立。
  assert.ok(/head\.getBoundingClientRect\(\)\.bottom/.test(page), '模块高亮未以吸顶头部下沿为基准');
  // 滚到底时末尾模块（07 银行业务）顶边到不了基准线，必须兜底高亮最后一个模块。
  assert.ok(
    /page\.scrollHeight - page\.clientHeight - page\.scrollTop <= 4/.test(page),
    '缺少滚动到底的末尾模块高亮兜底',
  );
  assert.ok(page.includes('modules.at(-1).id'), '兜底未指向当前视图的最后一个模块');
  // 换政策时回到顶部。
  assert.ok(/pageRef\.current\?\.scrollTo\(\{ top: 0 \}\)/.test(page), '切换政策未回到顶部');
});

test('滚动：页面上侧不留 padding，否则内容会从吸顶标题上方露出一条缝', () => {
  const css = read('features/policy/policy.css');
  // 吸顶头部（top:0）实际吸附在整页上内边距的下沿：页面若留 16px 顶部 padding，
  // 滚动时模块正文就会从标题上方这 16px 透明缝里露出来。
  const pageBlock = css.slice(css.indexOf('.policy-page {'), css.indexOf('.policy-page > *'));
  assert.ok(/padding:\s*0\s/.test(pageBlock), '整页 padding-top 不为 0，标题上方会露出内容');
  // 顶部留白必须由工具栏自带（随内容滚走）。
  const toolbarBlock = css.slice(
    css.indexOf('.policy-toolbar {'),
    css.indexOf('.policy-title-lockup'),
  );
  assert.ok(/padding:\s*16px/.test(toolbarBlock), '工具栏未接管顶部留白');
  // 760px 断点同理。
  const narrow = css.slice(css.indexOf('@media (max-width: 760px)'));
  const narrowPage = narrow.slice(
    narrow.indexOf('.policy-page {'),
    narrow.indexOf('.policy-canvas-body {'),
  );
  assert.ok(/padding:\s*0\s/.test(narrowPage), '窄屏断点整页 padding-top 不为 0');
});
