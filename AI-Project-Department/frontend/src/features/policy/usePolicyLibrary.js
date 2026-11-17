// 「政策分析」页的政策库：导入、切换、删除与本地持久化。
//
// 存储：浏览器 localStorage（policy-library-v1），不上传服务器、不跨设备同步。
// 首次访问会预置四份「示例政策」（国家 / 省 / 地市 / 园区四级），保证页面开箱可用；
// 示例按行业成套（储能 / 算力），切换一级链时只替换示例，用户导入的政策保持不变；
// 清空政策库后不会再次自动预置，避免把示例数据当成用户的真实政策。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { samplePoliciesFor } from './policyData';
import { extractPdfText, isPdfFile } from './policyPdf';

const STORAGE_KEY = 'policy-library-v1';
const MAX_ITEMS = 24;
const MAX_CHARS = 60000;
const NOTICE_TTL = 4200;

let seed = 0;
function createId() {
  seed += 1;
  return `p${Date.now().toString(36)}${seed.toString(36)}`;
}

export function makePolicyItem(input) {
  const text = String(input?.text || '').slice(0, MAX_CHARS);
  return {
    id: input?.id && !String(input.id).startsWith('sample-') ? input.id : createId(),
    title: String(input?.title || '').trim() || '未命名政策',
    issuer: String(input?.issuer || '').trim(),
    sourceName: String(input?.sourceName || '手动录入').trim(),
    level: String(input?.level || '').trim(),
    isSample: Boolean(input?.isSample),
    // 示例政策的所属行业（storage / compute），用于切换一级链时成套替换示例。
    sampleIndustry: String(input?.sampleIndustry || ''),
    addedAt: input?.addedAt || new Date().toISOString(),
    // PDF 导入的抽取质量信息（页数/汉字数），仅用于导入提示，不参与解读。
    pdfMeta: input?.pdfMeta || null,
    // 人工修正项：行业标签与有效期（自动识别之外的覆盖值），空串表示按自动识别。
    industryOverride: String(input?.industryOverride || ''),
    validityOverride: String(input?.validityOverride || ''),
    text,
  };
}

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed.items.filter((item) => item && item.text);
  } catch {
    return null;
  }
}

function writeStorage(items) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items }));
    return true;
  } catch {
    return false;
  }
}

const fingerprint = (item) => `${item.title}::${String(item.text).length}`;

function seedItems(industry = 'storage') {
  return samplePoliciesFor(industry).map((sample) =>
    makePolicyItem({ ...sample, isSample: true, sampleIndustry: industry }),
  );
}

const SAMPLE_INDUSTRY_FALLBACK = 'storage';
const sampleIndustryOf = (item) => item?.sampleIndustry || SAMPLE_INDUSTRY_FALLBACK;

// 读取本地文件：PDF 走文本层抽取，其余按纯文本读取；
// 抽出首个一级标题作为政策标题，文件名作为兜底。
export async function readPolicyFile(file) {
  const name = file?.name || '';
  if (isPdfFile(file)) return readPolicyPdfFile(file);

  const raw = await file.text();
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error(`${name || '文件'} 内容为空`);
  const heading = (text.match(/^[ \t]*#[ \t]+(.+)$/m) || [])[1];
  const title = (heading || name.replace(/\.[^.]+$/, '')).trim() || '未命名政策';
  const truncated = text.length > MAX_CHARS;
  return makePolicyItem({
    title,
    text: truncated ? text.slice(0, MAX_CHARS) : text,
    sourceName: name || '本地文件',
  });
}

// PDF：抽出的正文没有 Markdown 结构，标题优先取 PDF 元数据，其次取正文首行。
export async function readPolicyPdfFile(file) {
  const name = file?.name || 'PDF 文件';
  const { text, pageCount, truncated, cjkChars, title } = await extractPdfText(file);
  const overLimit = text.length > MAX_CHARS;
  return makePolicyItem({
    title,
    text: overLimit ? text.slice(0, MAX_CHARS) : text,
    sourceName: `${name}（PDF · ${pageCount} 页${truncated ? ' · 仅取前若干页' : ''}）`,
    // 供导入提示回显抽取质量，不入库展示。
    pdfMeta: { pageCount, cjkChars, truncated, overLimit },
  });
}

export function usePolicyLibrary(sampleIndustry = 'storage') {
  const [items, setItems] = useState(() => readStorage() || seedItems(sampleIndustry));
  const [activeId, setActiveId] = useState('');
  const [notice, setNotice] = useState('');

  // 首次挂载落盘一次：让预置的示例政策刷新后仍在。
  useEffect(() => {
    writeStorage(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换行业时，若政策库里只有另一行业的示例政策，则整库换成当前行业的示例；
  // 一旦用户导入过真实政策（isSample 为 false），这里不再介入，避免动到用户数据。
  useEffect(() => {
    if (!items.length) return;
    if (!items.every((item) => item.isSample)) return;
    if (items.some((item) => sampleIndustryOf(item) === sampleIndustry)) return;
    const next = seedItems(sampleIndustry);
    setItems(next);
    writeStorage(next);
  }, [items, sampleIndustry]);

  // 提示文案自动消失，避免长期占位。
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), NOTICE_TTL);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!items.length) {
      if (activeId) setActiveId('');
      return;
    }
    if (!items.some((item) => item.id === activeId)) setActiveId(items[0].id);
  }, [items, activeId]);

  const commit = useCallback((next, message) => {
    setItems(next);
    const ok = writeStorage(next);
    if (!ok) {
      setNotice('政策库写入本地存储失败（可能已超出容量），本次改动仅在当前会话可见。');
      return;
    }
    setNotice(message);
  }, []);

  const addItems = useCallback(
    (incoming) => {
      const list = (Array.isArray(incoming) ? incoming : [incoming]).filter(
        (item) => item && String(item.text || '').trim(),
      );
      if (!list.length) {
        setNotice('没有可导入的内容：文件为空或格式不受支持。');
        return [];
      }
      const normalized = list.map((item) => makePolicyItem(item));
      const seen = new Set(items.map(fingerprint));
      const fresh = [];
      normalized.forEach((item) => {
        const key = fingerprint(item);
        if (seen.has(key)) return;
        seen.add(key);
        fresh.push(item);
      });
      const skipped = normalized.length - fresh.length;
      const next = [...fresh, ...items].slice(0, MAX_ITEMS);
      if (!fresh.length) {
        setNotice('所导入内容与政策库中已有政策重复，未重复入库。');
        return [];
      }
      const dropped = fresh.length + items.length - next.length;
      const parts = [`已导入 ${fresh.length} 份政策`];
      if (skipped) parts.push(`跳过 ${skipped} 份重复内容`);
      if (dropped > 0) parts.push(`政策库上限 ${MAX_ITEMS} 份，较早的 ${dropped} 份已移出`);
      commit(next, `${parts.join('，')}。`);
      setActiveId(fresh[0].id);
      return fresh;
    },
    [items, commit],
  );

  const removeItem = useCallback(
    (id) => {
      const target = items.find((item) => item.id === id);
      const next = items.filter((item) => item.id !== id);
      commit(next, target ? `已移除《${target.title}》。` : '已从政策库移除该政策。');
    },
    [items, commit],
  );

  // 人工修正：行业标签与有效期由自动识别给出，识别不准时允许在这里改。
  const updateItem = useCallback(
    (id, patch, message = '已更新政策信息。') => {
      if (!items.some((item) => item.id === id)) return;
      const next = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
      commit(next, message);
    },
    [items, commit],
  );

  const clearAll = useCallback(() => {
    commit([], '政策库已清空。可拖入政策文件，或点击「载入示例政策」。');
  }, [commit]);

  const loadSamples = useCallback(() => {
    addItems(
      samplePoliciesFor(sampleIndustry).map((sample) => ({
        ...sample,
        isSample: true,
        sampleIndustry,
      })),
    );
  }, [addItems, sampleIndustry]);

  const active = useMemo(
    () => items.find((item) => item.id === activeId) || items[0] || null,
    [items, activeId],
  );

  return {
    items,
    active,
    activeId: active?.id || '',
    notice,
    setNotice,
    select: setActiveId,
    addItems,
    updateItem,
    removeItem,
    clearAll,
    loadSamples,
  };
}
