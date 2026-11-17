// 政策有效期识别：判断一份政策「是否还在有效期内」。
//
// 判定顺序（全部为纯函数，可注入 now 以保证可复现）：
//   1. 人工修正（override）优先；
//   2. 正文显式写法：「有效期至 20XX 年 X 月 X 日」；
//   3. 正文显式年限：「自 2025 年 3 月 1 日起施行，有效期 5 年」→ 施行日 + 年限；
//   4. 「本方案有效期 3 年」（无施行日时用正文最早年份推算）；
//   5. 长期有效类表述 → 长期有效；
//   6. 都没识别到 → 未标注有效期（不排除，交由人工确认）。
//
// 设计取舍：只认「显式有效期」，不用目标年份倒推——政策正文里的 2030 年往往是
// 发展目标而非失效时间，据此排除会把有效政策误判为过期。

export const VALIDITY_STATUS = {
  active: { key: 'active', label: '生效中', tone: 'up' },
  expiring: { key: 'expiring', label: '即将到期', tone: 'watch' },
  expired: { key: 'expired', label: '已过期', tone: 'down' },
  permanent: { key: 'permanent', label: '长期有效', tone: 'up' },
  unknown: { key: 'unknown', label: '未标注有效期', tone: '' },
};

// 距失效日不足该天数时，提示「即将到期」。
export const EXPIRING_WINDOW_DAYS = 90;

const CN_DIGITS = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

const pad = (value) => String(value).padStart(2, '0');

/** 把「5」「三年」「二十」等写法统一成阿拉伯数字；无法解析返回 null。 */
export function parseCount(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  if (text === '十') return 10;
  if (/^十[一二三四五六七八九]$/.test(text)) return 10 + CN_DIGITS[text[1]];
  if (/^[一二三四五六七八九]十$/.test(text)) return CN_DIGITS[text[0]] * 10;
  if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(text)) {
    return CN_DIGITS[text[0]] * 10 + CN_DIGITS[text[2]];
  }
  return CN_DIGITS[text] ?? null;
}

/** 拼 ISO 日期；缺月按 12 月、缺日按当月最后一天保守处理（「有效期至 2027 年」→ 2027-12-31）。 */
function toIso(year, month, day) {
  const y = Number(year);
  if (!y) return '';
  const m = Number(month) || 12;
  // Date.UTC(y, m, 0) 取的是「第 m 月的第 0 天」，即第 m 月最后一天。
  const d = Number(day) || new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 有效期至 2027 年 12 月 31 日 / 有效期截止到 2027-12-31
const EXPIRY_DATE_RE =
  /有效期(?:限)?[^\n。；]{0,8}?(?:至|到|截止(?:至|到)?)\s*(20\d{2})\s*(?:年|[.\-/])\s*(\d{1,2})?\s*(?:月|[.\-/])?\s*(\d{1,2})?/;
// 自 2025 年 3 月 1 日起施行，有效期 5 年
const EXPIRY_TERM_RE =
  /(?:自\s*)?(20\d{2})\s*年\s*(\d{1,2})?\s*月?\s*(\d{1,2})?\s*日?\s*(?:起)?\s*(?:施行|实施|执行|生效|发布|印发)[^\n。；]{0,24}?有效期(?:为|是)?\s*([一二三四五六七八九十两\d]{1,3})\s*年/;
// 本方案有效期 3 年（未写施行日）
const EXPIRY_SELF_RE = /有效期(?:为|是)?\s*([一二三四五六七八九十两\d]{1,3})\s*年(?!度)/;
const LONG_TERM_RE =
  /长期有效|不设(?:有效)?期|无(?:固定)?有效期|有效期届满后自动延续|有效期至(?:另行|另行通知|另行规定|废止|修订)/;
const ISSUED_RE =
  /(20\d{2})\s*年\s*(\d{1,2})?\s*月?\s*(\d{1,2})?\s*日?\s*(?:起)?\s*(?:施行|实施|执行|生效|发布|印发)/;
const YEAR_RE = /20\d{2}/g;

export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const daysBetween = (from, to) => {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
};

/** 「有效期 N 年」按 N 个完整年度计算：2025-03-01 + 5 年 − 1 天 = 2030-02-28。 */
function expireFromTerm(startIso, years) {
  const [y, m, d] = startIso.split('-').map(Number);
  const end = new Date(Date.UTC(y + years, m - 1, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
}

function issuedFrom(text) {
  const issued = text.match(ISSUED_RE);
  if (issued) return toIso(issued[1], issued[2], issued[3]);
  const years = text.match(YEAR_RE);
  if (!years?.length) return '';
  return toIso(years.map(Number).sort((a, b) => a - b)[0], 1, 1);
}

function statusOf(expiresOn, today) {
  if (!expiresOn) return 'unknown';
  const diff = daysBetween(today, expiresOn);
  if (diff < 0) return 'expired';
  if (diff <= EXPIRING_WINDOW_DAYS) return 'expiring';
  return 'active';
}

function finalize({ status, expiresOn, basis, source, issuedOn, years, today, overrideValue }) {
  const meta = VALIDITY_STATUS[status] || VALIDITY_STATUS.unknown;
  return {
    status: meta.key,
    statusLabel: meta.label,
    tone: meta.tone,
    expiresOn: expiresOn || '',
    issuedOn: issuedOn || '',
    // 人工修正的原始值：'' 表示按自动识别，'permanent' 或 'YYYY-MM-DD' 表示人工指定。
    overrideValue: overrideValue || '',
    basis,
    source,
    years: years || [],
    daysLeft: expiresOn ? daysBetween(today, expiresOn) : null,
    manual: source === 'override',
  };
}

/**
 * 识别政策的有效期。
 * @param {object} policy 政策对象（title / issuer / text）
 * @param {object} options { now?: Date, override?: string }
 *   override 为空表示未修正；'permanent' 表示人工标记长期有效；'YYYY-MM-DD' 表示人工指定失效日。
 */
export function resolveValidity(policy, { now = new Date(), override = '' } = {}) {
  const today = todayIso(now);
  const text = String(policy?.text || '');
  const base = { issuedOn: '', today, overrideValue: override };

  if (override === 'permanent') {
    return finalize({
      ...base,
      status: 'permanent',
      expiresOn: '',
      basis: '人工标记为长期有效',
      source: 'override',
    });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return finalize({
      ...base,
      status: statusOf(override, today),
      expiresOn: override,
      basis: `人工指定有效期至 ${override}`,
      source: 'override',
    });
  }

  const expiryDate = text.match(EXPIRY_DATE_RE);
  if (expiryDate) {
    const iso = toIso(expiryDate[1], expiryDate[2], expiryDate[3]);
    return finalize({
      ...base,
      status: statusOf(iso, today),
      expiresOn: iso,
      basis: `正文写明有效期至 ${iso}`,
      source: 'text',
      issuedOn: issuedFrom(text),
    });
  }

  const term = text.match(EXPIRY_TERM_RE);
  if (term) {
    const years = parseCount(term[4]);
    if (years) {
      const start = toIso(term[1], term[2], term[3]);
      const endIso = expireFromTerm(start, years);
      return finalize({
        ...base,
        status: statusOf(endIso, today),
        expiresOn: endIso,
        basis: `正文写明自 ${start} 起施行、有效期 ${years} 年`,
        source: 'text',
        issuedOn: start,
      });
    }
  }

  const selfTerm = text.match(EXPIRY_SELF_RE);
  if (selfTerm) {
    const years = parseCount(selfTerm[1]);
    const issued = issuedFrom(text);
    if (years && issued) {
      const endIso = expireFromTerm(issued, years);
      return finalize({
        ...base,
        status: statusOf(endIso, today),
        expiresOn: endIso,
        basis: `正文写明有效期 ${years} 年，按发布日期 ${issued} 推算`,
        source: 'text',
        issuedOn: issued,
      });
    }
  }

  if (LONG_TERM_RE.test(text)) {
    return finalize({
      ...base,
      status: 'permanent',
      expiresOn: '',
      basis: '正文写明长期有效或不设有效期',
      source: 'text',
      issuedOn: issuedFrom(text),
    });
  }

  return finalize({
    ...base,
    status: 'unknown',
    expiresOn: '',
    basis: '正文未写明有效期',
    source: 'none',
    issuedOn: issuedFrom(text),
    years: Array.from(new Set(text.match(YEAR_RE) || []))
      .map(Number)
      .sort((a, b) => a - b),
  });
}

/** 「仍在有效期内」的判定：已过期排除；生效中 / 即将到期 / 长期有效 / 未标注均保留。 */
export function isWithinValidity(validity) {
  return validity?.status !== 'expired';
}

export const VALIDITY_SELECT_OPTIONS = [
  { value: '', label: '自动识别' },
  { value: 'permanent', label: '长期有效' },
];
