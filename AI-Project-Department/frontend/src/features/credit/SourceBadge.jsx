import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SOURCE_META } from './creditSources';

// 溯源浮层内容：标题 + 说明 + 真实数据库清单。
export function SourcePopover({ meta }) {
  if (!meta) return null;
  return (
    <span className="source-pop">
      <b>{meta.title}</b>
      <p>{meta.detail}</p>
      {meta.databases.length > 0 && (
        <span className="source-pop-db">
          <i>如需真实数据，可对接：</i>
          <ul>
            {meta.databases.map((db) => (
              <li key={db}>{db}</li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}

const POP_WIDTH = 260;
const EDGE = 8;

// 依据徽章位置计算浮层的 fixed 坐标：水平方向与徽章左对齐并夹在视口内，
// 垂直方向优先放在徽章下方，放不下时翻转到上方。
function computeFixedPos(anchorRect, popHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchorRect.left;
  if (left + POP_WIDTH + EDGE > vw) left = vw - POP_WIDTH - EDGE;
  if (left < EDGE) left = EDGE;

  const belowTop = anchorRect.bottom + 8;
  let top;
  if (belowTop + popHeight + EDGE <= vh) {
    top = belowTop;
  } else {
    const aboveTop = anchorRect.top - 8 - popHeight;
    if (aboveTop >= EDGE) {
      top = aboveTop;
    } else {
      // 上下都放不下：夹在视口内尽量靠下
      top = Math.max(EDGE, Math.min(belowTop, vh - popHeight - EDGE));
    }
  }
  return { left, top };
}

// 数据溯源徽章：点击展示该评分 / 指标的数据来源；
// AI 估算类会标明「此结果由 AI 估算」并给出需对接的真实数据库清单。
// 浮层通过 Portal 挂到 body 并使用 fixed 定位，避免被抽屉 / 表格等
// overflow 容器裁剪。
export default function SourceBadge({ sourceKey, sourceMeta }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const meta = sourceMeta || SOURCE_META[sourceKey];

  // 打开时按徽章实际位置计算浮层坐标；挂载后再按浮层真实高度微调垂直位置。
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return undefined;
    const anchorRect = wrapRef.current.getBoundingClientRect();
    const popHeight = popRef.current ? popRef.current.offsetHeight : 180;
    setPos(computeFixedPos(anchorRect, popHeight));
  }, [open]);

  // 浮层内容渲染完成后再校正一次高度（首次渲染时高度未知）。
  useEffect(() => {
    if (!open || !pos || !popRef.current || !wrapRef.current) return undefined;
    const anchorRect = wrapRef.current.getBoundingClientRect();
    const next = computeFixedPos(anchorRect, popRef.current.offsetHeight);
    if (Math.abs(next.top - pos.top) > 1 || Math.abs(next.left - pos.left) > 1) {
      setPos(next);
    }
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (event) => {
      const inWrap = wrapRef.current && wrapRef.current.contains(event.target);
      const inPop = popRef.current && popRef.current.contains(event.target);
      if (!inWrap && !inPop) setOpen(false);
    };
    // 页面 / 抽屉滚动或窗口缩放时关闭浮层，避免浮层脱离徽章位置。
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  if (!meta) return null;
  const kindClass = meta.kind === 'data' ? 'kind-data' : 'kind-ai';

  return (
    <span className="source-badge-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`source-badge ${kindClass} ${open ? 'open' : ''}`}
        title="查看数据溯源"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        {meta.badge}
      </button>
      {open &&
        createPortal(
          <span
            ref={popRef}
            className="source-pop source-pop-fixed"
            style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
          >
            <b>{meta.title}</b>
            <p>{meta.detail}</p>
            {meta.databases.length > 0 && (
              <span className="source-pop-db">
                <i>如需真实数据，可对接：</i>
                <ul>
                  {meta.databases.map((db) => (
                    <li key={db}>{db}</li>
                  ))}
                </ul>
              </span>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}
