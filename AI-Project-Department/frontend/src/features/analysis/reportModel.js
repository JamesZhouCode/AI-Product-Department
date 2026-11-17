// 报告结构工具：目录、统计与遍历。页面（报告阅读器）与导出报告共用，
// 避免「页面上有这一节、导出却少一节」的漂移。

/** 取一级环节之外的容器块（章 / 节 / 小节自身携带的内容块）。 */
export function holderBlocks(holder) {
  return Array.isArray(holder?.blocks) ? holder.blocks : [];
}

/** 展开一章下的全部内容容器：章本身 + 各节 + 各小节。 */
export function iterHolders(chapter) {
  const holders = [chapter];
  for (const section of chapter?.sections || []) {
    holders.push(section);
    for (const subsection of section.subsections || []) holders.push(subsection);
  }
  return holders;
}

/** 一篇报告的目录：章 → 节 → 小节，带层级与锚点 key。 */
export function tocOf(part) {
  const items = [];
  for (const chapter of part?.chapters || []) {
    items.push({ key: chapter.key, title: chapter.title, level: 1 });
    for (const section of chapter.sections || []) {
      items.push({ key: section.key, title: section.title, level: 2 });
      for (const subsection of section.subsections || []) {
        items.push({ key: subsection.key, title: subsection.title, level: 3 });
      }
    }
  }
  return items;
}

/** 一篇报告的规模统计（章 / 节 / 表 / 图 / 段落）。 */
export function statsOf(part) {
  const stats = { chapters: 0, sections: 0, tables: 0, figures: 0, paragraphs: 0 };
  for (const chapter of part?.chapters || []) {
    stats.chapters += 1;
    for (const holder of iterHolders(chapter)) {
      for (const block of holderBlocks(holder)) {
        if (block.t === 'table') stats.tables += 1;
        else if (block.t === 'figure') stats.figures += 1;
        else if (block.t === 'p') stats.paragraphs += 1;
      }
    }
    for (const section of chapter.sections || []) {
      stats.sections += 1;
      stats.sections += (section.subsections || []).length;
    }
  }
  return stats;
}

/** 整份报告（全部篇）的统计。 */
export function reportStats(report) {
  const total = { chapters: 0, sections: 0, tables: 0, figures: 0, paragraphs: 0, parts: 0 };
  for (const part of report?.parts || []) {
    total.parts += 1;
    const partStats = statsOf(part);
    for (const key of Object.keys(partStats)) total[key] += partStats[key];
  }
  return total;
}

/** 按篇 key 取篇（part1 / part2）。 */
export function partByKey(report, key) {
  return (report?.parts || []).find((part) => part.key === key) || report?.parts?.[0] || null;
}
