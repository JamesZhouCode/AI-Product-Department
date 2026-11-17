import { useCallback, useEffect, useState } from 'react';
import { publicPath } from '../../shared/publicPaths';

// 《中国新型储能行业研究报告——商业银行授信视角》的结构化全文：
// 由 PDF 按版式解析（篇 → 章 → 节 → 小节 → 段落 / 表格 / 图表 / 注释），
// 存放于 public/data/analysis/storage-report.json，页面与导出报告共用同一份数据。
const DATA_FILE = 'data/analysis/storage-report.json';

let cache = null;
let pending = null;

function loadReportData(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (!pending || force) {
    const url = force ? `${publicPath(DATA_FILE)}?t=${Date.now()}` : publicPath(DATA_FILE);
    pending = fetch(url, force ? { cache: 'no-store' } : undefined)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((raw) => {
        cache = raw;
        return cache;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

// enabled = false 时跳过拉取（算力产业暂无 PDF 结构化研报），
// 状态直接置为 ready 且 report 为 null，由页面按行业决定是否走结构化研报视图。
export function useReportData(enabled = true) {
  const [state, setState] = useState(() =>
    !enabled
      ? { status: 'ready', report: null, error: null }
      : cache
        ? { status: 'ready', report: cache, error: null }
        : { status: 'loading', report: null, error: null },
  );

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'ready', report: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setState((prev) =>
      prev.status === 'ready' && prev.report
        ? prev
        : { status: 'loading', report: null, error: null },
    );
    loadReportData()
      .then((report) => {
        if (!cancelled) setState({ status: 'ready', report, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', report: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const reload = useCallback(async () => {
    const report = await loadReportData(true);
    setState({ status: 'ready', report, error: null });
    return report;
  }, []);

  return { ...state, reload };
}
