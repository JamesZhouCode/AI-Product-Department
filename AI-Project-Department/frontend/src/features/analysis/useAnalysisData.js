import { useCallback, useEffect, useState } from 'react';
import { publicPath } from '../../shared/publicPaths';
import { indexSegments } from './analysisModel';

// 行业分析演示数据：每个二级环节 × 8 章报告，由 pnpm prepare:analysis 生成。
// 结构上等价于未来真实 API 的返回，替换数据源即可切换到真实数据。
const FILE_BY_INDUSTRY = {
  储能产业: 'data/analysis/storage-analysis-mock.json',
  算力产业: 'data/analysis/compute-analysis-mock.json',
};
const DEFAULT_INDUSTRY = '储能产业';

const caches = new Map();
const pendings = new Map();

function buildModel(raw) {
  const byKey = indexSegments(raw);
  return {
    raw,
    byKey,
    index: raw.index,
    generatedAt: raw.generatedAt,
    mockNote: raw.mockNote,
    segments: raw.segments,
    industry: raw.industry,
  };
}

export function analysisDataFileFor(industry) {
  return FILE_BY_INDUSTRY[industry] || FILE_BY_INDUSTRY[DEFAULT_INDUSTRY];
}

// force = true 时绕过缓存重新拉取（「刷新分析」按钮），并加时间戳避免浏览器命中 HTTP 缓存。
function loadAnalysisData(industry, force = false) {
  const file = analysisDataFileFor(industry);
  const cache = caches.get(file);
  if (cache && !force) return Promise.resolve(cache);
  if (!pendings.has(file) || force) {
    const url = force ? `${publicPath(file)}?t=${Date.now()}` : publicPath(file);
    const pending = fetch(url, force ? { cache: 'no-store' } : undefined)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((raw) => {
        const model = buildModel(raw);
        caches.set(file, model);
        return model;
      })
      .catch((error) => {
        pendings.delete(file);
        throw error;
      });
    pendings.set(file, pending);
  }
  return pendings.get(file);
}

export function useAnalysisData(industry = DEFAULT_INDUSTRY) {
  const file = analysisDataFileFor(industry);
  const cached = caches.get(file);
  const [state, setState] = useState(() =>
    cached
      ? { status: 'ready', data: cached, error: null }
      : { status: 'loading', data: null, error: null },
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hit = caches.get(file);
    if (hit) {
      setState({ status: 'ready', data: hit, error: null });
      return () => {
        cancelled = true;
      };
    }
    setState({ status: 'loading', data: null, error: null });
    // 始终订阅同一个 Promise：即便在 StrictMode 二次挂载时数据已就绪，
    // 也能拿到结果并更新状态，避免初始 loading 状态被永久保留。
    loadAnalysisData(industry)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [file, industry]);

  // 「刷新分析」：重新载入数据层并重建索引。失败时抛出，由调用方决定提示文案。
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await loadAnalysisData(industry, true);
      setState({ status: 'ready', data, error: null });
      return data;
    } finally {
      setRefreshing(false);
    }
  }, [industry]);

  return { ...state, refresh, refreshing };
}
