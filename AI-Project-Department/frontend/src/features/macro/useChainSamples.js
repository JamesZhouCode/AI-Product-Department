// 「行业」页的产业链环节样本取数。
//
// 与「流程」页读同一份数据，保证行业页的环节景气分析与产业链地图口径一致、可互相核对：
//   储能产业 → data/industries/storage-chain.json
//   算力产业 → data/industries/compute-chain.json
// 取数结果带 status，页面据此如实标注样本来源：
//   live     → 已读到产业链地图实时数据；
//   snapshot → 读取失败，回落构建期快照（与产业链地图同口径）；
//   loading  → 尚未返回，先按快照渲染，避免布局跳动。
import { useCallback, useEffect, useState } from 'react';
import { buildChainPositions as buildStoragePositions } from './macroData';
import { buildChainPositions as buildComputePositions } from './macroDataCompute';

const CHAIN_FILE_BY_INDUSTRY = {
  储能产业: 'data/industries/storage-chain.json',
  算力产业: 'data/industries/compute-chain.json',
};

function chainFileFor(industry) {
  return CHAIN_FILE_BY_INDUSTRY[industry] || CHAIN_FILE_BY_INDUSTRY['储能产业'];
}

function builderFor(industry) {
  return industry === '算力产业' ? buildComputePositions : buildStoragePositions;
}

export function useChainSamples(industry = '储能产业') {
  const file = chainFileFor(industry);
  const buildPositions = builderFor(industry);
  const [status, setStatus] = useState('loading');
  const [levels, setLevels] = useState(null);

  const retry = useCallback(() => setStatus('loading'), []);

  useEffect(() => {
    setStatus('loading');
    setLevels(null);
  }, [file]);

  useEffect(() => {
    if (status !== 'loading') return undefined;
    let cancelled = false;
    const controller = new AbortController();
    fetch(new URL(file, document.baseURI).href, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const list = Array.isArray(payload?.levels) ? payload.levels : [];
        setLevels(list.length ? list : null);
        setStatus(list.length ? 'live' : 'snapshot');
      })
      .catch((error) => {
        if (cancelled || error.name === 'AbortError') return;
        setLevels(null);
        setStatus('snapshot');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status, file]);

  return {
    status,
    positions: buildPositions(levels),
    retry,
  };
}
