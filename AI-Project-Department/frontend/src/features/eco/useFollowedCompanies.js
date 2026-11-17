// 企业关注能力：图谱与授信的公司信息卡共用同一份关注状态，
// 关注过的企业进入「生态经营」版面，供客户经理开展营销。
//
// 实现要点：
//   1. localStorage 持久化（键 eco-followed-companies-v1），刷新与跨页签不丢失；
//   2. 企业身份优先用 id，缺失时退回 normalizedName / name（两家数据源字段一致）；
//   3. 纯函数（followKeyFor / followSnapshotFor / dedupeFollowed）单独导出，可被单测直接锁定。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalize } from '../../shared/text.js';
import { visitPriorityFor } from '../company/visitPriority.js';

export const FOLLOWED_STORAGE_KEY = 'eco-followed-companies-v1';
// 关注是客户经理手工维护的名单，给一个宽松上限防止本地存储被撑爆。
export const FOLLOWED_MAX_ITEMS = 200;

// 企业身份键：优先 id，其次归一化名称（两家页面数据源字段一致，可互通）。
// 名称兜底必须归一化，同一企业不同写法（全半角括号、空格）才能收敛到同一键。
export function followKeyFor(entity) {
  if (!entity) return '';
  if (typeof entity === 'string') return normalize(entity) || entity.trim();
  if (entity.id) return String(entity.id).trim();
  const name = String(entity.normalizedName || entity.name || '').trim();
  return normalize(name) || name;
}

// 关注快照：只存营销要用到的字段，不整包拷贝企业数据。
export function followSnapshotFor(entity, followedAt = new Date().toISOString()) {
  if (!entity || typeof entity !== 'object') return null;
  const key = followKeyFor(entity);
  if (!key) return null;
  const tags = Array.isArray(entity.tags) ? entity.tags : [];
  // 拜访优先级快照：关注时按当时的画像算一次（复用企业档案的 visitPriority 规则），
  // 供「生态经营」版面排序与营销建议使用。
  const priority = visitPriorityFor(entity);
  return {
    id: entity.id || '',
    key,
    name: entity.name || '',
    chain: entity.chain || '',
    sector: entity.sector || '',
    primaryIndustry: entity.primaryIndustry || '',
    listed: tags.includes('上市企业') || Boolean(entity.listed),
    tags,
    visit: { total: priority.total, label: priority.level.label, tone: priority.level.tone },
    followedAt,
  };
}

// 去重并裁掉非法项；新的关注排前面（按关注时间倒序的语义由排序保证）。
export function dedupeFollowed(items, maxItems = FOLLOWED_MAX_ITEMS) {
  const seen = new Set();
  const out = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || !item.key || !item.name) return;
    if (seen.has(item.key)) return;
    seen.add(item.key);
    out.push(item);
  });
  return out.slice(0, maxItems);
}

function readStorage() {
  try {
    const raw = window.localStorage.getItem(FOLLOWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return dedupeFollowed(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function writeStorage(items) {
  try {
    window.localStorage.setItem(FOLLOWED_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // 本地存储不可用（隐私模式等）时静默降级为会话内状态。
  }
}

export function useFollowedCompanies() {
  const [items, setItems] = useState(readStorage);

  useEffect(() => {
    writeStorage(items);
  }, [items]);

  const keys = useMemo(() => new Set(items.map((item) => item.key)), [items]);

  const has = useCallback(
    (target) => {
      const key = followKeyFor(target);
      return Boolean(key) && keys.has(key);
    },
    [keys],
  );

  const follow = useCallback((entity) => {
    const snapshot = followSnapshotFor(entity);
    if (!snapshot) return;
    setItems((prev) =>
      dedupeFollowed([snapshot, ...prev.filter((item) => item.key !== snapshot.key)]),
    );
  }, []);

  const unfollow = useCallback((target) => {
    const key = followKeyFor(target);
    if (!key) return;
    setItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const toggle = useCallback(
    (entity) => {
      if (has(entity)) unfollow(entity);
      else follow(entity);
    },
    [follow, has, unfollow],
  );

  return { items, count: items.length, keys, has, follow, unfollow, toggle };
}

export default useFollowedCompanies;
