const normalize = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’'"，,；;：:、_\-]/g, '')
    .toLowerCase();

const sourceSecondaryByRawIndustry = {
  材料: '1',
  装备: '2',
  设计: '3',
  制造: '4',
  封测: '5',
  其他: '6',
};

const defaultTertiaryBySecondary = {
  1: '1.1',
  2: '2.1',
  3: '3.2',
  4: '4.1',
  5: '5.1',
  6: '6.1',
};

const legacySectorTertiaryHints = {
  'EDA/IP服务': '3.1',
  AI及高性能计算芯片: '3.2',
  存储芯片设计: '3.2',
  射频及MCU芯片设计: '3.2',
  功率器件设计: '3.3',
  SoC及多媒体芯片设计: '3.2',
  模拟及电源管理芯片: '3.3',
  图像传感器及显示驱动芯片: '3.4',
  晶圆代工: '4.1',
  封装测试: '5.1',
  PCB及电子制造: '6.1',
  化合物半导体: '1.1',
  半导体硅片: '1.1',
  光刻胶及配套材料: '1.1',
  电子特气: '1.1',
  溅射靶材: '1.1',
  清洗量检测及CMP设备: '2.1',
  刻蚀设备: '2.1',
  薄膜沉积设备: '2.1',
  光刻设备: '2.1',
};

// 每条规则只识别企业自身的技术和产品。采购品大多是上游投入，不能拿来
// 反推企业所属链路，否则会把采购 EDA 的芯片设计企业错误归到工具软件。
const tertiaryRules = [
  {
    code: '5.1',
    terms: ['封装测试服务', '封测服务', '封装测试', '专业测试', '晶圆测试', '成品测试', '测试服务'],
  },
  { code: '5.2', terms: ['直插', '插件封装', 'dip封装'] },
  {
    code: '5.3',
    terms: ['表面贴装', 'qfn', 'qfp', 'dfn', 'sop封装', 'smt封装'],
  },
  { code: '5.4', terms: ['fcbga', 'bga封装', '倒装芯片', 'flipchip', 'fc封装'] },
  {
    code: '5.5',
    terms: [
      '系统级封装',
      'sip封装',
      'tsv',
      'chiplet',
      'wlp',
      'wlcsp',
      'bumping',
      '凸块',
      '3d封装',
      '2.5d',
    ],
  },
  {
    code: '2.1',
    terms: [
      '光刻',
      '刻蚀',
      '薄膜沉积',
      'pecvd',
      'sacvd',
      'hdpcvd',
      'ald设备',
      'pvd',
      '清洗设备',
      'cmp装备',
      'cmp设备',
      '涂胶显影',
      '离子注入',
      '量检测设备',
      '量测设备',
      '去胶设备',
      '热处理设备',
      '炉管设备',
      '电镀设备',
    ],
  },
  {
    code: '2.2',
    terms: [
      '后道设备',
      '封装设备',
      '测试设备',
      '测试机',
      '分选机',
      '探针台',
      '划切设备',
      '减薄设备',
      '键合设备',
    ],
  },
  {
    code: '2.3',
    terms: [
      '零部件',
      '静电卡盘',
      '机械手',
      '真空泵',
      '射频电源',
      '精密运动系统',
      '工件台',
      '石英部件',
      '陶瓷部件',
      '半导体阀门',
    ],
  },
  { code: '3.1', terms: ['eda', 'ip授权', 'ip核', '工具软件', '设计软件', 'eda软件'] },
  {
    code: '3.2',
    terms: [
      '数字电路芯片',
      'cpu',
      'gpu',
      'npu',
      'xpu',
      'fpga',
      'soc',
      'mcu',
      'asic',
      '基带芯片',
      'ai芯片',
      '计算芯片',
      '处理器',
      '安全芯片',
      '智能卡芯片',
      '存储芯片',
      'norflash',
      'nandflash',
      'eeprom',
    ],
  },
  {
    code: '3.3',
    terms: [
      '模拟芯片',
      '电源管理',
      '驱动芯片',
      '信号链',
      '射频',
      'rf',
      '功率放大器',
      '功率器件',
      '隔离芯片',
      '电机控制',
      '线性稳压器',
      'dc-dc',
      'ac-dc',
    ],
  },
  {
    code: '3.4',
    terms: [
      '图像传感器',
      'cmos图像',
      '显示驱动',
      '触控芯片',
      'tddi',
      'isp技术',
      '图像处理',
      '传感器芯片',
    ],
  },
  { code: '4.1', terms: ['晶圆代工', '晶圆制造', '晶圆厂', '集成电路制造', 'finfet量产'] },
  {
    code: '4.2',
    terms: [
      'dram制造',
      'dram存储芯片',
      'nand制造',
      '存储器制造',
      '3dnand',
      '3dnand闪存',
      '长江存储',
    ],
  },
  {
    code: '4.3',
    terms: [
      '特色工艺',
      'bcd工艺',
      '功率idm',
      'igbt晶圆',
      'igbt芯片',
      'igbt模块',
      'sic芯片',
      'sic模块',
      'mems代工',
      '化合物半导体',
    ],
  },
  { code: '6.1', terms: ['印制电路板', 'pcb', '线路板', '电路板', 'fpc'] },
  { code: '6.2', terms: ['分立器件', '二极管', '三极管', '光通信', '光电器件', 'led芯片'] },
  {
    code: '1.1',
    terms: [
      '硅片',
      '外延片',
      '光刻胶',
      '电子特气',
      '靶材',
      '湿电子化学品',
      '碳化硅衬底',
      '氮化镓',
      '半导体材料',
      '前驱体',
    ],
  },
  {
    code: '1.2',
    terms: ['封装材料', '封装基板', '引线框架', '键合线', '塑封料', '芯片粘结', '焊线'],
  },
];

function candidateFor(candidates, code) {
  const candidate = candidates.get(code) || {
    code,
    score: 0,
    explicitScore: 0,
    profileScore: 0,
    evidence: [],
  };
  candidates.set(code, candidate);
  return candidate;
}

function addCandidate(candidates, code, score, source, terms, explicit = false) {
  const candidate = candidateFor(candidates, code);
  candidate.score += score;
  if (explicit) candidate.explicitScore += score;
  if (source === 'legacy-profile') candidate.profileScore += score;
  if (terms.length) candidate.evidence.push({ source, terms });
}

function sortedCandidates(candidates) {
  return Array.from(candidates.values()).sort(
    (left, right) =>
      right.score - left.score ||
      right.explicitScore - left.explicitScore ||
      left.code.localeCompare(right.code),
  );
}

function labelsFor(taxonomy) {
  const secondaryByCode = new Map(taxonomy.secondary.map((entry) => [entry.code, entry]));
  const tertiaryByCode = new Map(taxonomy.tertiary.map((entry) => [entry.code, entry]));
  return { secondaryByCode, tertiaryByCode };
}

function validateTaxonomy(taxonomy) {
  const secondaryCodes = new Set((taxonomy.secondary || []).map((entry) => entry.code));
  const tertiary = taxonomy.tertiary || [];
  if (secondaryCodes.size !== 6 || tertiary.length !== 19) {
    throw new Error('Industry taxonomy must contain 6 secondary and 19 tertiary entries');
  }
  tertiary.forEach((entry) => {
    if (!/^\d+\.\d+$/.test(entry.code) || !secondaryCodes.has(entry.secondaryCode)) {
      throw new Error(`Invalid tertiary taxonomy entry: ${entry.code || entry.label}`);
    }
  });
}

function overrideIndex(overrides, secondaryByCode, tertiaryByCode) {
  const byId = new Map();
  const byName = new Map();
  (overrides.records || []).forEach((record) => {
    const secondary = secondaryByCode.get(String(record.secondaryCode || ''));
    const tertiary = tertiaryByCode.get(String(record.tertiaryCode || ''));
    if (!secondary || !tertiary || tertiary.secondaryCode !== secondary.code) {
      throw new Error(`Invalid industry mapping override for ${record.companyId || record.name}`);
    }
    if (record.companyId) byId.set(record.companyId, record);
    if (record.name) byName.set(normalize(record.name), record);
  });
  return { byId, byName };
}

function buildEvidenceCandidates(company) {
  const candidates = new Map();
  const fields = [
    ['name', company.name, 2],
    ['coreTechnology', company.coreTechnology, 8],
    ['products', company.products, 6],
  ];
  tertiaryRules.forEach((rule) => {
    fields.forEach(([source, value, score]) => {
      const text = normalize(value);
      if (!text) return;
      const terms = rule.terms.filter((term) => text.includes(normalize(term)));
      if (terms.length) addCandidate(candidates, rule.code, score, source, terms, true);
    });
  });
  const legacyHint =
    company.legacySectorSource === 'legacy-key-profile'
      ? legacySectorTertiaryHints[company.legacySector]
      : '';
  if (legacyHint) addCandidate(candidates, legacyHint, 4, 'legacy-profile', [company.legacySector]);
  return candidates;
}

function explicitSecondaryOverride(company, ranked, tertiaryByCode) {
  const text = normalize(`${company.name} ${company.coreTechnology} ${company.products}`);
  const sourceSecondaryCode = sourceSecondaryByRawIndustry[company.rawIndustry] || '';
  const rules = [
    {
      from: '3',
      to: '4',
      terms: ['晶圆代工', '晶圆制造', '晶圆厂', '集成电路制造'],
      unless: ['eda', '工具软件', '设计软件'],
    },
    { from: '4', to: '5', terms: ['封装测试', '封测服务', '封装测试服务'] },
    { from: '4', to: '3', terms: ['fabless模式'] },
    { from: '4', to: '6', terms: ['分立器件', '二极管', '三极管', '整流桥', '防护器件'] },
  ];
  const matched = rules.find(
    (rule) =>
      rule.from === sourceSecondaryCode &&
      rule.terms.some((term) => text.includes(normalize(term))) &&
      !(rule.unless || []).some((term) => text.includes(normalize(term))),
  );
  if (!matched) return null;
  return (
    ranked.find((candidate) => tertiaryByCode.get(candidate.code)?.secondaryCode === matched.to) ||
    null
  );
}

function baseResult({
  company,
  secondaryCode,
  tertiaryCode,
  status,
  method,
  confidence,
  evidence,
  secondaryByCode,
  tertiaryByCode,
}) {
  const secondary = secondaryByCode.get(secondaryCode);
  const tertiary = tertiaryByCode.get(tertiaryCode);
  const pending = !secondary;
  const labels = {
    secondary: secondary?.label || '待研判',
    tertiary: tertiary?.label || '待研判',
  };
  return {
    chain: labels.secondary,
    secondaryIndustry: labels.secondary,
    secondaryCode: secondary?.code || '',
    sector: labels.tertiary,
    tertiarySector: labels.tertiary,
    tertiaryCode: tertiary?.code || '',
    classificationStatus: status,
    classificationMethod: method,
    classificationConfidence: confidence,
    classificationEvidence: evidence,
    classification: {
      version: 'industry-taxonomy-2026-08-v2',
      rawIndustry: company.rawIndustry || '',
      legacyChain: company.legacyChain || '',
      legacySector: company.legacySector || '',
      secondaryCode: secondary?.code || '',
      secondaryLabel: labels.secondary,
      tertiaryCode: tertiary?.code || '',
      tertiaryLabel: labels.tertiary,
      status: pending ? 'pending' : status,
      method,
      confidence,
      evidence,
    },
  };
}

export function createIndustryMapper({ taxonomy, overrides = { records: [] } }) {
  validateTaxonomy(taxonomy);
  const { secondaryByCode, tertiaryByCode } = labelsFor(taxonomy);
  const overridesByKey = overrideIndex(overrides, secondaryByCode, tertiaryByCode);

  return function mapCompanyIndustry(company) {
    const manualOverride =
      overridesByKey.byId.get(company.id) || overridesByKey.byName.get(normalize(company.name));
    if (manualOverride) {
      return baseResult({
        company,
        secondaryCode: String(manualOverride.secondaryCode),
        tertiaryCode: String(manualOverride.tertiaryCode),
        status: 'manual',
        method: 'manual-override',
        confidence: 1,
        evidence: [
          {
            source: 'manual-override',
            terms: [manualOverride.note || '人工复核映射'],
          },
        ],
        secondaryByCode,
        tertiaryByCode,
      });
    }

    const sourceSecondaryCode = sourceSecondaryByRawIndustry[company.rawIndustry] || '';
    const candidates = buildEvidenceCandidates(company);
    const ranked = sortedCandidates(candidates);
    const strongest = ranked[0];
    const strongestTertiary = strongest ? tertiaryByCode.get(strongest.code) : null;
    const crossSecondaryCandidate = explicitSecondaryOverride(company, ranked, tertiaryByCode);
    const secondaryCode =
      crossSecondaryCandidate?.code &&
      tertiaryByCode.get(crossSecondaryCandidate.code)?.secondaryCode
        ? tertiaryByCode.get(crossSecondaryCandidate.code).secondaryCode
        : sourceSecondaryCode || strongestTertiary?.secondaryCode || '';
    const selectedCandidate = ranked.find(
      (candidate) => tertiaryByCode.get(candidate.code)?.secondaryCode === secondaryCode,
    );
    const candidateSupportsSelection =
      selectedCandidate &&
      (selectedCandidate.explicitScore >= 2 || selectedCandidate.profileScore >= 4);
    const tertiaryCode = candidateSupportsSelection
      ? selectedCandidate.code
      : defaultTertiaryBySecondary[secondaryCode] || '';
    const evidence = selectedCandidate?.evidence || [];

    if (!secondaryCode) {
      return baseResult({
        company,
        secondaryCode: '',
        tertiaryCode: '',
        status: 'pending',
        method: 'insufficient-evidence',
        confidence: 0,
        evidence: [
          { source: 'source-workbook', terms: ['产业链环节为空，未找到可判定技术或产品'] },
        ],
        secondaryByCode,
        tertiaryByCode,
      });
    }

    if (candidateSupportsSelection) {
      const method = selectedCandidate.explicitScore
        ? 'technology-product-evidence'
        : 'legacy-profile-evidence';
      const confidence = selectedCandidate.explicitScore
        ? Math.min(0.96, 0.68 + selectedCandidate.explicitScore / 50)
        : 0.72;
      return baseResult({
        company,
        secondaryCode,
        tertiaryCode,
        status: 'evidence-mapped',
        method,
        confidence,
        evidence,
        secondaryByCode,
        tertiaryByCode,
      });
    }

    const sourceEvidence = [
      { source: 'source-workbook', terms: [`产业链环节：${company.rawIndustry}`] },
    ];
    if (!tertiaryCode) {
      return baseResult({
        company,
        secondaryCode,
        tertiaryCode: '',
        status: 'fallback',
        method: 'source-chain-secondary-only',
        confidence: 0.38,
        evidence: sourceEvidence,
        secondaryByCode,
        tertiaryByCode,
      });
    }
    return baseResult({
      company,
      secondaryCode,
      tertiaryCode,
      status: 'fallback',
      method: 'source-chain-default-tertiary',
      confidence: 0.45,
      evidence: sourceEvidence,
      secondaryByCode,
      tertiaryByCode,
    });
  };
}

export function mappingSummary(companies) {
  const countBy = (values) =>
    values.reduce((result, value) => {
      const key = value || '待研判';
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
  return {
    secondary: countBy(companies.map((company) => company.secondaryCode)),
    tertiary: countBy(companies.map((company) => company.tertiaryCode)),
    status: countBy(companies.map((company) => company.classificationStatus)),
  };
}
