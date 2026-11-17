// PDF 政策文件的文本抽取。
//
// 为什么要单独一个模块：pdfjs-dist 只能走浏览器运行时（worker 由 Vite 以资源形式提供），
// 所以这里把它放进 **动态 import**，避免 `node --test` 去解析 Vite 专有的 `?url` 说明符。
// 与之配套，文本拼装、清洗、类型判定都做成不依赖 pdfjs 的纯函数，便于单测覆盖。
//
// 抽取原则：只取文本层，不渲染、不执行脚本；抽不到文字时如实报错（扫描件不做 OCR），
// 交由用户改用「粘贴文本」通道，而不是编造内容。

export const PDF_LIMITS = {
  // 超过这个长度就不再继续取页，避免超大文件把浏览器拖死。
  maxPages: 120,
  // 单页字符数超过此值视为异常（可能把图表坐标也当成文字），做提示。
  warnCharsPerPage: 12000,
};

const PDF_EXT = /\.pdf$/i;

export function isPdfFile(file) {
  const name = String(file?.name || '');
  const type = String(file?.type || '');
  if (PDF_EXT.test(name)) return true;
  return type === 'application/pdf' || type === 'application/x-pdf';
}

// 去掉页码、页眉横线这类排版噪声：正文里出现「第 3 页 / 共 12 页」「- 3 -」的概率极低。
const PAGE_NOISE = [
  /^[-—–\s]*\d{1,4}[-—–\s]*$/,
  /^第\s*\d{1,4}\s*页(\s*[/／|]\s*(共\s*)?\d{1,4}\s*页)?$/,
  /^[-—–]{3,}$/,
  /^\d{1,4}\s*[/／]\s*\d{1,4}$/,
];

export function isPageNoise(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  return PAGE_NOISE.some((pattern) => pattern.test(text));
}

// 把 pdf.js 一页的 textContent.items 拼成按行组织的文本。
// 优先用 hasEOL；没有时用 transform 的 y 坐标变化判断换行（y 相同视为同一行）。
export function assemblePageItems(items) {
  const lines = [];
  let line = '';
  let lastY = null;

  const flush = () => {
    const text = line.replace(/[ \t]+$/g, '');
    if (text.trim()) lines.push(text.trim());
    line = '';
  };

  (Array.isArray(items) ? items : []).forEach((item) => {
    const str = typeof item?.str === 'string' ? item.str : '';
    if (!str) {
      if (item?.hasEOL) flush();
      return;
    }
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    if (lastY !== null && typeof y === 'number' && Math.abs(y - lastY) > 2) flush();
    // 中英混排：两侧都是拉丁字母/数字时补一个空格，避免「storagepolicy」这种粘连。
    if (line && /[A-Za-z0-9]$/.test(line) && /^[A-Za-z0-9]/.test(str)) line += ' ';
    line += str;
    if (item.hasEOL) flush();
    if (typeof y === 'number') lastY = y;
  });
  flush();

  return lines;
}

// 句子结束标点：以这些字符结尾的行是真换行，不能与下一行拼回去。
const SENTENCE_END = /[。！？；：，、）」》”…—\-—]$/;
// 结构行起点：章节标题、编号条目都自成一行，不能被上一行吞掉。
const STRUCTURE_START =
  /^(?:[（(]?[一二三四五六七八九十]+[、．.）)]|第[一二三四五六七八九十百零]+[条章节款项]|[0-9]+[、．.)]|[（(][0-9一二三四五六七八九十]+[）)]|附[件表录注]?)/;
// 发文字号 / 成文日期这类版头行，既不能被上一行吞并，也不吞并下一行。
const HEADER_LINE = /〔\d{4}〕|^[\u4e00-\u9fa5]{2,10}〔|^\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/;

// 正文行宽的七五百分位：PDF 是两端对齐的，被折行的行长度会贴近行宽，
// 而标题、版头、短行明显偏短。用它判断「这行是折行、该与下一行拼回」。
function typicalLineWidth(lines) {
  const widths = lines
    .map((line) => line.length)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (!widths.length) return 0;
  return widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.75))];
}

// 把 PDF 折行拼回完整句子。
// 不合并的四种情况：上一行以标点收尾 / 上一行是版头 / 下一行是结构行 / 上一行明显短于行宽。
export function mergeWrappedLines(lines) {
  const list = (Array.isArray(lines) ? lines : []).map((line) => String(line || '').trim());
  const width = typicalLineWidth(list);
  // 阈值取行宽的六成：标题、版头这类短行不会被误并。
  const shortLimit = width * 0.6;
  const out = [];

  list.forEach((line) => {
    if (!line) {
      out.push('');
      return;
    }
    const prev = out.length ? out[out.length - 1] : '';
    const canMerge =
      prev &&
      prev !== '' &&
      !SENTENCE_END.test(prev) &&
      !HEADER_LINE.test(prev) &&
      !STRUCTURE_START.test(line) &&
      !HEADER_LINE.test(line) &&
      prev.length >= shortLimit;
    if (canMerge) {
      // 中文直接拼接；两侧都是拉丁字母/数字时补空格，避免「storagepolicy」粘连。
      const joiner = /[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(line) ? ' ' : '';
      out[out.length - 1] = `${prev}${joiner}${line}`;
      return;
    }
    out.push(line);
  });

  return out;
}

// 跨页合并 + 折行拼回 + 去噪 + 压掉多余空行。纯函数，便于单测。
export function joinPdfPages(pageLineGroups) {
  const groups = Array.isArray(pageLineGroups) ? pageLineGroups : [];
  const out = [];
  groups.forEach((lines, index) => {
    // 页码、页眉横线在拼行之前先剔除，否则会挡住折行合并。
    const kept = (Array.isArray(lines) ? lines : [])
      .map((line) => String(line || '').trim())
      .filter((line) => line && !isPageNoise(line));
    if (!kept.length) return;
    if (index > 0 && out.length) out.push('');
    out.push(...mergeWrappedLines(kept));
  });

  const text = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return text;
}

export function countCjk(text) {
  const matched = String(text || '').match(/[\u4e00-\u9fa5]/g);
  return matched ? matched.length : 0;
}

// PDF 元数据标题常见噪声：浏览器打印会写 about:blank，Office 会写「Microsoft Word - x.docx」。
const BAD_META_TITLE = /^(about:|untitled|document\d*|无标题|新建|microsoft\s+word)/i;

// 公文标题通常就在正文首行，比元数据可靠，所以优先取首行。
export function inferPdfTitle({ infoTitle, text, fileName }) {
  const firstLine = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length >= 8 &&
        line.length <= 120 &&
        !isPageNoise(line) &&
        // 标题不以句读收尾，也不会是发文字号/日期
        !/[。；，、：]$/.test(line) &&
        !HEADER_LINE.test(line),
    );
  if (firstLine) return firstLine;

  const meta = String(infoTitle || '').trim();
  if (
    meta.length >= 4 &&
    meta.length <= 120 &&
    !BAD_META_TITLE.test(meta) &&
    !/\.(docx?|pdf)$/i.test(meta)
  ) {
    return meta;
  }
  return String(fileName || '').replace(/\.[^.]+$/, '') || '未命名政策';
}

let pdfjsPromise = null;

// 只在真正解析 PDF 时才加载 pdfjs 与 worker。
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [lib, worker] = await Promise.all([
        import('pdfjs-dist/build/pdf.mjs'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })().catch((error) => {
      pdfjsPromise = null;
      throw error;
    });
  }
  return pdfjsPromise;
}

export function describePdfError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  if (name === 'PasswordException' || /password/i.test(message)) {
    return '该 PDF 已加密，需先解除密码保护后再导入';
  }
  if (name === 'InvalidPDFException') return '不是有效的 PDF 文件，或文件已损坏';
  if (name === 'MissingPDFException') return 'PDF 内容读取失败，文件可能被截断';
  return message || 'PDF 解析失败';
}

// 主入口：抽取 PDF 文本。返回 { text, pageCount, title, cjkChars, truncated }。
export async function extractPdfText(file) {
  const name = file?.name || 'PDF 文件';
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error(`${name} 读取失败`);
  }
  if (!buffer || !buffer.byteLength) throw new Error(`${name} 内容为空`);

  const pdfjs = await loadPdfjs();
  // 注意：pdf.js v6 里 destroy() 挂在 loading task 上，PDFDocumentProxy 只有 cleanup()。
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // 只需要文本层：不加载字体、不执行脚本，省内存也避免字体相关告警。
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    throw new Error(`${name}：${describePdfError(error)}`, { cause: error });
  }

  const total = doc.numPages || 0;
  const limit = Math.min(total, PDF_LIMITS.maxPages);
  const pageGroups = [];
  let infoTitle = '';
  try {
    const meta = await doc.getMetadata().catch(() => null);
    if (meta?.info?.Title) infoTitle = String(meta.info.Title);
    for (let index = 1; index <= limit; index += 1) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      pageGroups.push(assemblePageItems(content.items));
      page.cleanup();
    }
  } finally {
    // 及时释放 worker 侧资源，避免连续导入多份 PDF 时内存堆积。
    await doc.cleanup().catch(() => {});
    await task.destroy().catch(() => {});
  }

  const text = joinPdfPages(pageGroups);
  const cjkChars = countCjk(text);

  // 扫描件 / 纯图片 PDF 没有文本层：如实报错，不做 OCR，也不编造内容。
  if (text.length < 40 || cjkChars < 10) {
    throw new Error(
      `${name}：未检测到可用文本层（共 ${total} 页，仅取到 ${text.length} 个字符），` +
        '可能是扫描件或图片版 PDF，请改用「粘贴文本」录入文字版内容',
    );
  }

  return {
    text,
    pageCount: total,
    truncated: total > limit,
    cjkChars,
    title: inferPdfTitle({ infoTitle, text, fileName: name }),
  };
}
