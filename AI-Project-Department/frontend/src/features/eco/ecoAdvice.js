// 「生态经营」营销建议规则（纯函数，可被单测直接 import）。
// 只引用关注快照里已有的字段（visit / listed / chain），不引入臆测数据。

export function marketingTipsFor(item) {
  if (!item) return [];
  const tips = [];
  const level = item.visit?.label;
  if (level === '优先拜访' || level === '重点关注') {
    tips.push(`拜访优先级「${level}」，建议纳入近期走访计划并优先安排上门。`);
  } else {
    tips.push('画像数据有限，建议先实地走访补齐经营信息，再确定拜访节奏。');
  }
  if (item.listed) {
    tips.push('上市企业：可从信息披露与资本运作切入，关注定增、并购、发债与股票质押等业务场景。');
  } else {
    tips.push('非上市企业：重点营销项目融资与供应链金融，结合上下游订单核实真实经营。');
  }
  if (item.chain) {
    tips.push(
      `围绕「${item.chain}」环节：结合「行业」页景气结论与「政策」页最新政策，寻找该链口的增量机会。`,
    );
  }
  return tips;
}
