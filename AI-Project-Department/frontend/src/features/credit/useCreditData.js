import { useEffect, useState } from 'react';
import { publicPath } from '../../shared/publicPaths';
import { buildCreditOverview, evaluateCompany } from './creditEngine';

// 授信演示数据（模块化 Mock，未来直接替换为真实指标 API 的同构返回即可）。
let cache = null;

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

export function useCreditData() {
  const [state, setState] = useState(() =>
    cache
      ? { status: 'ready', data: cache, error: null }
      : { status: 'loading', data: null, error: null },
  );

  useEffect(() => {
    if (cache) return undefined;
    let cancelled = false;
    fetch(publicPath('data/credit/storage-credit-mock.json'))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((raw) => {
        if (cancelled) return;
        cache = buildModel(raw);
        setState({ status: 'ready', data: cache, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
