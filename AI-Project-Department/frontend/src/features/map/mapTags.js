import { CHAIN_PALETTES } from '../../chainPalette.js';

export const LISTED_COMPANY_TAG = '上市企业';

const REFERENCE_TAG_DEFINITIONS = [
  { id: 'listed-company', label: LISTED_COMPANY_TAG, sourceTags: [LISTED_COMPANY_TAG] },
  // 新三板挂牌企业：独立于「上市企业」（A股/港股）口径，仅作筛选与展示。
  { id: 'neeq-listed', label: '新三板', sourceTags: ['新三板'] },
  { id: 'industry-leader', label: '行业领袖', sourceTags: ['龙头企业'] },
  { id: 'revenue-top-100', label: '营收百强', sourceTags: ['营收百强'] },
  { id: 'manufacturing-top-100', label: '制造业百强', sourceTags: ['制造业百强'] },
  {
    id: 'single-champion',
    label: '单项冠军',
    sourceTags: ['国家级制造业单项冠军', '单项冠军'],
  },
  { id: 'unicorn', label: '独角兽', sourceTags: ['独角兽'] },
  {
    id: 'import-export-top-500',
    label: '进出口500强',
    sourceTags: ['进出口五百强', '进出口500强'],
  },
  {
    id: 'credit-planning',
    label: '信贷规划',
    sourceTags: ['信贷规划-七大产业客群', '信贷规划'],
  },
  { id: 'gazelle', label: '瞪羚', sourceTags: ['瞪羚企业', '瞪羚'] },
  { id: 'technology-company', label: '科技型', sourceTags: ['科技型企业', '科技型'] },
];

export const MAP_TAG_DEFINITIONS = REFERENCE_TAG_DEFINITIONS;
export const MAP_TAG_STRIP_DEFINITIONS = MAP_TAG_DEFINITIONS.filter(
  (definition) => definition.id !== 'listed-company',
);

const SECONDARY_CHAIN_TAGS = new Set(
  Object.values(CHAIN_PALETTES).flatMap((palette) =>
    palette.flatMap((group) => [group.label, group.legendLabel, ...group.aliases]),
  ),
);
const REMOVED_SYSTEM_TAGS = new Set([...SECONDARY_CHAIN_TAGS, '重点企业', '普通企业']);

export const MAP_TAG_BY_ID = new Map(MAP_TAG_DEFINITIONS.map((tag) => [tag.id, tag]));

export function tagValueFor(definition) {
  return definition?.sourceTags?.[0] || definition?.label || '';
}

export function stripSystemTags(tags) {
  return Array.from(
    new Set((Array.isArray(tags) ? tags : []).filter((tag) => !REMOVED_SYSTEM_TAGS.has(tag))),
  );
}

export function isListedCompany(company) {
  return company?.tags?.includes(LISTED_COMPANY_TAG) || false;
}

export function tagLabelFor(value) {
  const definition = MAP_TAG_DEFINITIONS.find(
    (tag) => tag.label === value || tag.sourceTags?.includes(value),
  );
  return definition?.label || value;
}

export function mapTagMatches(company, tagIds) {
  const selectedTags = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : [];
  if (!selectedTags.length) return true;
  return selectedTags.every((tagId) => {
    const definition = MAP_TAG_BY_ID.get(tagId);
    if (!definition) return false;
    if ((definition.sourceTags || []).some((tag) => company.tags?.includes(tag))) return true;
    if (definition.matcher) return definition.matcher(company);
    return company.tags?.includes(definition.label);
  });
}
