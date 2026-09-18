import {
  CHAIN_PALETTES,
  chainGroupFor,
  chainPaletteFor,
  industryForCompany,
  industryGroupFor,
  industryLabelFor,
} from '../../chainPalette.js';
import { isListedCompany } from '../map/mapTags.js';

const INDUSTRY_STORIES = {
  'integrated-circuit': {
    accent: '#1769e0',
    headline: '从材料、装备、设计、制造到封测与配套，集成电路是一条多节点协同链。',
    events: [
      {
        label: '全链条',
        title: '产业链价值正在从单点企业转向协同网络',
        body: '把二级产业链、企业关系和区域分布放在同一张图里，可以更快识别材料、装备、设计、制造、封测与配套之间的协同机会。',
      },
      {
        label: '供给侧',
        title: '材料与设备是制造端的前置观察窗口',
        body: '上游企业的技术字段、采购品和供应关系，适合用来判断工艺导入、产能建设和客户验证的潜在线索。',
      },
      {
        label: '营销侧',
        title: '关系缺口可以直接转成下一步跟进清单',
        body: '优先补齐上市企业的画像、证据来源和上下游关系，能够让产业链图谱从展示工具变成可行动名单。',
      },
    ],
  },
  power: {
    accent: '#ba7517',
    headline: '从用电领域到储能系统，电力装备是一条连接基础设施与终端场景的协同链。',
    events: [
      {
        label: '全链条',
        title: '用电场景与储能能力共同决定链路机会',
        body: '将用电领域、储能领域、企业关系和区域分布放在一起，可以更快识别基础设施建设与终端需求之间的协同节点。',
      },
      {
        label: '供给侧',
        title: '电机、充电桩和算力场景是需求入口',
        body: '围绕具体用电场景观察设备、系统和服务能力，有助于判断客户建设、扩产和替换的潜在线索。',
      },
      {
        label: '营销侧',
        title: '储能系统的上下游关系仍需持续补齐',
        body: '优先核实上市企业的产品能力、项目落地和供应关系，能够把链路分布转成可行动的客户清单。',
      },
    ],
  },
  biomed: {
    accent: '#0f6e56',
    headline: '从创新药、生物制造、医疗器械到 CXO，生物医药是一条多路径并行的产业链。',
    events: [
      {
        label: '全链条',
        title: '研发、制造与临床应用共同构成观察主线',
        body: '把创新药、生物制造、医疗器械和 CXO 放在同一张图里，可以更清晰地观察研发服务、产品制造和应用场景的连接。',
      },
      {
        label: '供给侧',
        title: 'CXO 与生物制造是研发转化的重要支点',
        body: '结合企业环节、产品方向和上下游关系，可以辅助判断研发外包、产能建设和产品导入的机会。',
      },
      {
        label: '营销侧',
        title: '多环节企业需要按实际业务保留多重归属',
        body: '对同时覆盖多个研发或器械环节的企业，应保留多标签关系，避免单一分类掩盖真实业务联系。',
      },
    ],
  },
  ai: {
    accent: '#534ab7',
    headline: '从算力基础设施、技术与模型到应用终端，人工智能是一条分层演进的产业链。',
    events: [
      {
        label: '全链条',
        title: '基础设施、模型能力与应用场景正在形成闭环',
        body: '将算力基础设施、AI 技术与模型、应用终端和企业关系放在一起，可以快速识别产业链的关键节点。',
      },
      {
        label: '技术侧',
        title: '算力和模型是观察企业能力的两条主线',
        body: '结合细分领域与区域分布，可以辅助判断企业在基础设施、算法能力和应用落地中的位置。',
      },
      {
        label: '营销侧',
        title: '“通用技术”仍需要进一步拆分验证',
        body: '对源表中语义较宽的通用技术企业，建议结合主营业务和产品证据继续细分，避免过早作出业务判断。',
      },
    ],
  },
};

const normalize = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’]/g, '')
    .toLowerCase();

export function shorten(value, max = 18) {
  const text = String(value || '待补充');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function industryStoryFor(industry) {
  return (
    INDUSTRY_STORIES[industryGroupFor(industry)] || {
      accent: '#1769e0',
      headline: '当前产业链仍在持续整理，建议结合企业画像和关系证据进行研判。',
      events: [],
    }
  );
}

function secondaryFieldFor(company) {
  return company.secondaryIndustry || company.secondaryChain || company.chain || '待研判';
}

function classificationEntriesFor(company) {
  if (Array.isArray(company.classifications) && company.classifications.length) {
    return company.classifications
      .map((classification) => ({
        chain:
          classification.chain ||
          classification.secondaryIndustry ||
          classification.secondaryChain ||
          '',
        sector: classification.sector || classification.tertiarySector || '',
      }))
      .filter((classification) => classification.chain || classification.sector);
  }
  return [{ chain: secondaryFieldFor(company), sector: company.sector || '' }];
}

function secondaryDefinitionsFor(industry) {
  return chainPaletteFor(industry).map((group) => ({
    ...group,
    label: group.legendLabel || group.label,
    code: group.atlas?.code || '',
    axisLabel: group.atlas?.axisLabel || group.label,
    side: group.atlas?.side || 'top',
    note: group.atlas?.note || '二级产业链',
    sectors: group.atlas?.sectors || [],
  }));
}

function stagesFor(industry) {
  return secondaryDefinitionsFor(industry)
    .filter((group) => group.id !== 'pending')
    .map((group) => ({
      number: group.code,
      label: group.label,
      note: group.note,
    }));
}

function hasIndustryPalette(industryGroup) {
  return Object.prototype.hasOwnProperty.call(CHAIN_PALETTES, industryGroup);
}

function classificationEntriesForGroup(company, group, selectedIndustry, usePalette) {
  return classificationEntriesFor(company).filter((classification) => {
    if (usePalette) {
      return chainGroupFor(classification.chain, selectedIndustry) === group.id;
    }
    return (
      normalize(classification.chain) === normalize(group.matchLabel || group.label) ||
      normalize(classification.chain) === normalize(group.label)
    );
  });
}

function companyBelongsToGroup(company, group, selectedIndustry, usePalette) {
  return classificationEntriesForGroup(company, group, selectedIndustry, usePalette).length > 0;
}

function sectorValuesForGroup(company, group, selectedIndustry, usePalette) {
  return classificationEntriesForGroup(company, group, selectedIndustry, usePalette).map(
    (classification) => classification.sector || '细分环节待补齐',
  );
}

function companyTokens(company) {
  return [company.coreTechnology, company.products, company.procurement]
    .flatMap((value) => String(value || '').split(/[、，,；;/·]/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && !['待补充', '待研判', '行业公开信息'].includes(value));
}

export function getWeekRange(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay() || 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (value) =>
    `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, '0')}.${String(value.getDate()).padStart(2, '0')}`;
  return `${format(monday)} — ${format(sunday)}`;
}

export function buildIndustrySnapshot(data, selectedIndustry = '集成电路') {
  const industryGroup = industryGroupFor(selectedIndustry);
  const story = industryStoryFor(selectedIndustry);
  const allCompanies = (data.companies || []).filter(isListedCompany);
  const industryCompanies = allCompanies.filter(
    (company) => industryGroupFor(industryForCompany(company)) === industryGroup,
  );
  const scopeCompanies = industryCompanies;
  const industryNames = new Set(industryCompanies.map((company) => normalize(company.name)));
  const scopeNames = new Set(scopeCompanies.map((company) => normalize(company.name)));
  const relations = (data.relations || []).filter(
    (relation) =>
      scopeNames.has(normalize(relation.from)) && scopeNames.has(normalize(relation.to)),
  );
  const industryRelations = (data.relations || []).filter(
    (relation) =>
      industryNames.has(normalize(relation.from)) && industryNames.has(normalize(relation.to)),
  );
  const counts = relations.reduce(
    (result, relation) => ({
      ...result,
      [relation.relationType]: (result[relation.relationType] || 0) + 1,
    }),
    {},
  );
  const sectorCounts = new Map();
  scopeCompanies.forEach((company) => {
    new Set(
      classificationEntriesFor(company).map(
        (classification) => classification.sector || '细分环节待补齐',
      ),
    ).forEach((sector) => sectorCounts.set(sector, (sectorCounts.get(sector) || 0) + 1));
  });
  const sectors = Array.from(sectorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
  const tokenCounts = new Map();
  scopeCompanies
    .flatMap(companyTokens)
    .forEach((token) => tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1));
  const technologies = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
  const topCompanies = [...scopeCompanies].sort((a, b) => {
    return (
      (b.evidence?.length || 0) - (a.evidence?.length || 0) || a.name.localeCompare(b.name, 'zh-CN')
    );
  });
  const peerCounts = new Map();
  relations.forEach((relation) => {
    const peer = scopeNames.has(normalize(relation.from)) ? relation.to : relation.from;
    if (!peer) return;
    peerCounts.set(peer, (peerCounts.get(peer) || 0) + 1);
  });
  const peers = Array.from(peerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
  const usePalette = hasIndustryPalette(industryGroup);
  const secondaryDefinitions = usePalette
    ? secondaryDefinitionsFor(selectedIndustry)
    : buildFallbackSecondaryDefinitions(industryCompanies);
  const secondaryStats = secondaryDefinitions.map((group) => {
    const groupCompanies = industryCompanies.filter((company) =>
      companyBelongsToGroup(company, group, selectedIndustry, usePalette),
    );
    const groupNames = new Set(groupCompanies.map((company) => normalize(company.name)));
    const groupRelations = industryRelations.filter(
      (relation) =>
        groupNames.has(normalize(relation.from)) || groupNames.has(normalize(relation.to)),
    );
    const groupSectorCounts = new Map();
    groupCompanies.forEach((company) => {
      new Set(sectorValuesForGroup(company, group, selectedIndustry, usePalette)).forEach(
        (sector) => groupSectorCounts.set(sector, (groupSectorCounts.get(sector) || 0) + 1),
      );
    });
    const topSector =
      Array.from(groupSectorCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '环节待补齐';
    const mapped = groupCompanies.filter(
      (company) => company.location && company.mapDisplay !== false,
    ).length;
    return {
      ...group,
      label: group.legendLabel || group.label,
      count: groupCompanies.length,
      mapped,
      relationCount: groupRelations.length,
      topSector,
    };
  });
  const mappedCount = scopeCompanies.filter(
    (company) => company.location && company.mapDisplay !== false,
  ).length;
  const verified = scopeCompanies.filter((company) =>
    ['已复核', 'verified'].includes(company.locationStatus),
  ).length;

  return {
    companies: scopeCompanies,
    counts,
    groupId: industryGroup,
    industryCompanies,
    industryRelations,
    label: industryLabelFor(selectedIndustry),
    mappedCount,
    peers,
    relations,
    scopeLabel: `${industryLabelFor(selectedIndustry)} / 全链条`,
    secondaryStats,
    sectors,
    stages: usePalette ? stagesFor(selectedIndustry) : [],
    story,
    technologies,
    topCompanies,
    verified,
  };
}

function buildFallbackSecondaryDefinitions(companies) {
  const counts = new Map();
  companies.forEach((company) => {
    new Set(
      classificationEntriesFor(company).map((classification) => classification.chain),
    ).forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
  });
  const colors = ['#4b79aa', '#4d9b8d', '#6686b0', '#bd8968', '#687db0', '#7c8da0'];
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label], index) => ({
      id: `secondary-${normalize(label)}`,
      code: String(index + 1).padStart(2, '0'),
      label,
      axisLabel: shorten(label, 8),
      color: colors[index % colors.length],
      side: 'top',
      note: '二级产业链',
      sectors: [],
      matchLabel: label,
    }));
}

export function buildIndustryAtlasModel(data, selectedIndustry = '集成电路') {
  const industryGroup = industryGroupFor(selectedIndustry);
  const usePalette = hasIndustryPalette(industryGroup);
  const companies = (data.companies || []).filter(
    (company) =>
      isListedCompany(company) && industryGroupFor(industryForCompany(company)) === industryGroup,
  );
  const companyNames = new Set(companies.map((company) => normalize(company.name)));
  const relations = (data.relations || []).filter(
    (relation) =>
      companyNames.has(normalize(relation.from)) && companyNames.has(normalize(relation.to)),
  );
  const definitions = usePalette
    ? secondaryDefinitionsFor(selectedIndustry)
    : buildFallbackSecondaryDefinitions(companies);
  const secondary = definitions
    .map((group) => {
      const groupCompanies = companies.filter((company) =>
        companyBelongsToGroup(company, group, selectedIndustry, usePalette),
      );
      const groupNames = new Set(groupCompanies.map((company) => normalize(company.name)));
      const groupSectors = group.sectors.length
        ? group.sectors
        : Array.from(
            new Set(
              groupCompanies.flatMap((company) =>
                sectorValuesForGroup(company, group, selectedIndustry, usePalette),
              ),
            ),
          );
      const tertiary = groupSectors
        .map((sector, index) => {
          // 二级链缺三级环节时，sector 为空的企业回落到「细分环节待补齐」节点；
          // 此时需按「无 sector」匹配，否则这些企业会被 `=== sector` 过滤掉而消失。
          const sectorCompanies = groupCompanies.filter((company) =>
            sectorValuesForGroup(company, group, selectedIndustry, usePalette).some(
              (value) => value === sector,
            ),
          );
          const sectorNames = new Set(sectorCompanies.map((company) => normalize(company.name)));
          return {
            id: `${group.id}-${index}`,
            label: sector,
            color: group.color,
            secondaryId: group.id,
            secondaryLabel: group.label,
            companies: sectorCompanies,
            count: sectorCompanies.length,
            mappedCount: sectorCompanies.filter(
              (company) => company.location && company.mapDisplay !== false,
            ).length,
            relationCount: relations.filter(
              (relation) =>
                sectorNames.has(normalize(relation.from)) ||
                sectorNames.has(normalize(relation.to)),
            ).length,
          };
        })
        .filter((node) => node.count > 0);
      return {
        ...group,
        companies: groupCompanies,
        count: groupCompanies.length,
        mappedCount: groupCompanies.filter(
          (company) => company.location && company.mapDisplay !== false,
        ).length,
        relationCount: relations.filter(
          (relation) =>
            groupNames.has(normalize(relation.from)) || groupNames.has(normalize(relation.to)),
        ).length,
        tertiary,
      };
    })
    .filter((group) => group.count > 0);
  const companyGroupsByName = new Map();
  secondary.forEach((group) => {
    group.companies.forEach((company) => {
      const name = normalize(company.name);
      if (!companyGroupsByName.has(name)) companyGroupsByName.set(name, new Set());
      companyGroupsByName.get(name).add(group.id);
    });
  });
  const secondaryRelations = new Map();
  relations.forEach((relation) => {
    const fromGroups = companyGroupsByName.get(normalize(relation.from));
    const toGroups = companyGroupsByName.get(normalize(relation.to));
    if (!fromGroups || !toGroups) return;
    fromGroups.forEach((from) => {
      toGroups.forEach((to) => {
        if (from === to) return;
        const key = [from, to].sort().join('::');
        secondaryRelations.set(key, (secondaryRelations.get(key) || 0) + 1);
      });
    });
  });

  return {
    companies,
    label: industryLabelFor(selectedIndustry),
    relations,
    secondary,
    secondaryRelations: Array.from(secondaryRelations.entries()).map(([key, count]) => ({
      groups: key.split('::'),
      count,
    })),
    tertiary: secondary.flatMap((group) => group.tertiary),
  };
}
