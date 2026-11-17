// 报告阅读器：把结构化研报（篇 → 章 → 节 → 小节 → 段落/表格/图表/注释）渲染成正文。
// 数据来自 public/data/analysis/storage-report.json（由 PDF 版式解析生成），
// 「分析」页与导出报告读的是同一份结构，因此页面上能看到什么，导出的就有什么。
import { useEffect, useState } from 'react';
import { holderBlocks, tocOf } from './reportModel';

/* ---------------- 内容块 ---------------- */

function TableBlock({ block }) {
  const hasGrid = Array.isArray(block.head) && block.rows?.length;
  return (
    <figure className="rp-table" id={block.key}>
      <figcaption>{block.title}</figcaption>
      {hasGrid ? (
        <div className="rp-table-scroll">
          <table>
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rp-table-plain">该表在原报告中为图形化排布，未能结构化解析，请以原文为准。</p>
      )}
      {block.note && <p className="rp-note">{block.note}</p>}
    </figure>
  );
}

function FigureBlock({ block }) {
  return (
    <figure className="rp-figure" id={block.key}>
      <div className="rp-figure-box">
        <span className="rp-figure-tag">图表</span>
        <p>{block.title.replace(/^图\s*\d+[-–]\d+\s*/, '')}</p>
        <em>原报告此处为图形化图表，数据口径见下方来源说明</em>
      </div>
      <figcaption>{block.title}</figcaption>
      {block.note && <p className="rp-note">{block.note}</p>}
    </figure>
  );
}

function Block({ block }) {
  if (block.t === 'table') return <TableBlock block={block} />;
  if (block.t === 'figure') return <FigureBlock block={block} />;
  if (block.t === 'note') return <p className="rp-note">{block.text}</p>;
  return <p className="rp-p">{block.text}</p>;
}

function Blocks({ holder }) {
  const blocks = holderBlocks(holder);
  if (!blocks.length) return null;
  return blocks.map((block) => <Block key={block.key} block={block} />);
}

/* ---------------- 结构 ---------------- */

function Chapter({ chapter }) {
  return (
    <section className="rp-chapter" id={chapter.key}>
      <h2 className="rp-chapter-title">{chapter.title}</h2>
      <Blocks holder={chapter} />
      {(chapter.sections || []).map((section) => (
        <section className="rp-section" key={section.key} id={section.key}>
          {section.title && <h3 className="rp-section-title">{section.title}</h3>}
          <Blocks holder={section} />
          {(section.subsections || []).map((subsection) => (
            <section className="rp-subsection" key={subsection.key} id={subsection.key}>
              <h4 className="rp-subsection-title">{subsection.title}</h4>
              <Blocks holder={subsection} />
            </section>
          ))}
        </section>
      ))}
    </section>
  );
}

export default function ReportReader({ part, scrollRef }) {
  const toc = tocOf(part);
  const [active, setActive] = useState(toc[0]?.key || '');

  // 正文滚动时目录自动高亮（与「分析」页其他章节导航同一套做法）。
  useEffect(() => {
    const container = scrollRef?.current;
    if (!container) return undefined;
    const onScroll = () => {
      const top = container.getBoundingClientRect().top + 96;
      let current = toc[0]?.key || '';
      for (const item of toc) {
        const element = document.getElementById(item.key);
        if (element && element.getBoundingClientRect().top <= top) current = item.key;
      }
      setActive(current);
    };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [scrollRef, toc]);

  const jump = (key) => {
    const container = scrollRef?.current;
    const element = document.getElementById(key);
    if (!container || !element) return;
    const offset =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    container.scrollTo({ top: Math.max(offset - 12, 0), behavior: 'smooth' });
    setActive(key);
  };

  return (
    <div className="rp-layout">
      <nav className="rp-toc" aria-label="报告目录">
        <span className="rp-toc-title">
          {part.no} · {part.name}
        </span>
        {toc.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`rp-toc-item level-${item.level} ${active === item.key ? 'active' : ''}`}
            onClick={() => jump(item.key)}
          >
            {item.title}
          </button>
        ))}
      </nav>
      <div className="rp-body">
        {(part.chapters || []).map((chapter) => (
          <Chapter key={chapter.key} chapter={chapter} />
        ))}
      </div>
    </div>
  );
}
