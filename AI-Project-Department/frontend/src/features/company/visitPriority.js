const VISIT_IMPORTANCE_RULES = [
  { tag: '龙头企业', label: '行业领袖', score: 100 },
  { tag: '上市企业', label: '上市企业', score: 85 },
  { tag: '专精特新（待核）', label: '专精特新（待核）', score: 60 },
];

const VISIT_PRIORITY_WEIGHTS = { importance: 0.65, otherBank: 0.35 };

function booleanSignal(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['是', '有', '已是', '已标记', 'true', 'yes', '1', 'y'].includes(normalized)) return true;
  if (['否', '无', '未有', '未标记', 'false', 'no', '0', 'n'].includes(normalized)) return false;
  return null;
}

function visitImportanceFor(entity) {
  const explicitScore = Number(entity?.importanceScore ?? entity?.importance?.score);
  if (Number.isFinite(explicitScore) && explicitScore > 0)
    return { score: Math.min(100, Math.round(explicitScore)), label: '已配置重要度' };
  const matchedRules = VISIT_IMPORTANCE_RULES.filter((rule) => entity?.tags?.includes(rule.tag));
  if (matchedRules.length) {
    const strongest = matchedRules.reduce(
      (best, rule) => (rule.score > best.score ? rule : best),
      matchedRules[0],
    );
    const bonus = Math.min(10, Math.max(0, matchedRules.length - 1) * 5);
    return {
      score: Math.min(100, strongest.score + bonus),
      label: matchedRules.map((rule) => rule.label).join(' · '),
    };
  }
  return { score: 30, label: '非上市企业（待核）', status: 'pending' };
}

function otherBankSignalFor(entity) {
  const bank = entity?.bank || {};
  const value =
    bank.otherBankCustomer ??
    bank.isOtherBankCustomer ??
    bank.otherBankExistingCustomer ??
    entity?.otherBankCustomer ??
    entity?.otherBankExistingCustomer ??
    entity?.otherBank?.isCustomer;
  const signal = booleanSignal(value);
  if (signal === true) return { score: 80, label: '已标记 · 有金融需求', status: 'yes' };
  if (signal === false) return { score: 45, label: '暂未标记 · 可拓展', status: 'no' };
  return { score: 50, label: '待核实 · 暂按中性', status: 'unknown' };
}

export function visitPriorityFor(entity) {
  const importance = visitImportanceFor(entity);
  const otherBank = otherBankSignalFor(entity);
  const total = Math.round(
    importance.score * VISIT_PRIORITY_WEIGHTS.importance +
      otherBank.score * VISIT_PRIORITY_WEIGHTS.otherBank,
  );
  const level =
    total >= 80
      ? { label: '优先拜访', tone: 'high' }
      : total >= 60
        ? { label: '重点关注', tone: 'medium' }
        : total >= 40
          ? { label: '常规跟进', tone: 'normal' }
          : { label: '待补数据', tone: 'pending' };
  return { total, level, importance, otherBank };
}
