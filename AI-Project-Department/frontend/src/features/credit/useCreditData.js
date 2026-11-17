import { useEffect, useState } from 'react';
import { publicPath } from '../../shared/publicPaths';
import { buildCreditOverview, evaluateCompany } from './creditEngine';

// 授信演示数据（模块化 Mock，未来直接替换为真实指标 API 的同构返回即可）。
// 按一级链分文件，缓存也按文件分桶，切换行业时复用已加载结果。
const FILE_BY_INDUSTRY = {
  集成电路: 'data/credit/ic-credit-mock.json',
  储能产业: 'data/credit/storage-credit-mock.json',
  算力产业: 'data/credit/compute-credit-mock.json',
};
const DEFAULT_INDUSTRY = '储能产业';
const cache = new Map();

function buildModel(raw) {
  const companiesById = new Map(raw.companies.map((company) => [company.id, company]));
  const entries = raw.companies.map((company) => ({
    company,
    evaluation: evaluateCompany(company),
  }));
  return {
    raw,
    companiesById,
    entries,
    relations: raw.relations || [],
    overview: buildCreditOverview(entries),
    generatedAt: raw.generatedAt,
    sourceNote: raw.sourceNote,
  };
}

export function creditDataFileFor(industry) {
  return FILE_BY_INDUSTRY[industry] || FILE_BY_INDUSTRY[DEFAULT_INDUSTRY];
}

export function useCreditData(industry = DEFAULT_INDUSTRY) {
  const file = creditDataFileFor(industry);
  const [state, setState] = useState(() =>
    cache.has(file)
      ? { status: 'ready', data: cache.get(file), error: null }
      : { status: 'loading', data: null, error: null },
  );

  useEffect(() => {
    if (cache.has(file)) {
      setState({ status: 'ready', data: cache.get(file), error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });
    fetch(publicPath(file))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((raw) => {
        if (cancelled) return;
        const model = buildModel(raw);
        cache.set(file, model);
        setState({ status: 'ready', data: model, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  return state;
}
