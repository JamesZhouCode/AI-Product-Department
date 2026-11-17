# 把《中国新型储能行业研究报告——商业银行授信视角》按版式解析为结构化 JSON。
# 版式规律（实测）：章 15.0pt / 节 12.5pt / 小节 11.0pt / 正文 10.5pt /
# 表图题 10.0pt / 表格单元格 8.8pt / 注释 8.5pt / 页眉 y≈25.4 / 页码 y≈803.5
import json
import re
import pymupdf

PDF = r"G:\对公经营智能化项目\行业研究报告_整体分析与细分领域分析.pdf"
OUT = r"C:\Users\周展鹏\WorkBuddy\2026-09-21-09-10-11\storage-report.json"

doc = pymupdf.open(PDF)

IS_TABLE_CAP = re.compile(r"^(表|附表)\s*\d+[-–]\d+\s|^附表\s*\d+\s")
IS_FIG_CAP = re.compile(r"^图\s*\d+[-–]\d+\s")
IS_NOTE = re.compile(r"^(资料来源|数据来源|注[:：])")
# 段落首行缩进（实测：正文首行 x≈83.7，续行 x≈62.7）
INDENT_X = 74.0
WIDE = set("（）〔〕【】，。；：、—…·％／")


def is_wide(ch):
    return "\u2e80" <= ch <= "\u9fff" or ch in WIDE


def smart_join(a, b):
    """PDF 折行拼接：中文与数字相邻不补空格（中文排版惯例），英文单词断行才补。"""
    if not a:
        return b
    if not b:
        return a
    tail, head = a[-1], b[0]
    if is_wide(tail) and is_wide(head):
        return a + b
    if tail.isdigit() and is_wide(head):
        return a + b
    if is_wide(tail) and head.isdigit():
        return a + b
    if tail in ".%+-—/" and head.isdigit():
        return a + b
    if tail.isdigit() and (head.isdigit() or head in ".—-/"):
        return a + b
    return f"{a} {b}"


def page_lines(page):
    """按 y 排序的文本行：(y, x0, size, text)，剔除页眉与页码。"""
    out = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            text = "".join(span["text"] for span in line["spans"])
            if not text.strip():
                continue
            y = round(line["bbox"][1], 1)
            x0 = round(line["bbox"][0], 1)
            size = round(line["spans"][0]["size"], 1)
            text = text.strip()
            if y < 45 and "中国新型储能行业研究报告" in text:
                continue
            if y > 795 and re.fullmatch(r"\d+", text):
                continue
            out.append((y, x0, size, text))
    out.sort()
    return out


def cluster(values, tol):
    cols = []
    for value in sorted(values):
        for col in cols:
            if abs(col - value) <= tol:
                break
        else:
            cols.append(value)
    return cols


def assign_columns(xs, cols):
    index = 0
    best = None
    for i, col in enumerate(cols):
        dist = abs(col - xs)
        if best is None or dist < best:
            best = dist
            index = i
    return index


def page_separators(page):
    """表格行分隔线：横贯表宽的细横线（矢量描边），y 升序去重。"""
    ys = []
    for drawing in page.get_drawings():
        rect = drawing.get("rect")
        if rect is None or rect.height > 1.5 or (rect.x1 - rect.x0) < 200:
            continue
        if drawing.get("type", "").startswith("s"):
            ys.append(round(rect.y0, 1))
    ys.sort()
    deduped = []
    for y in ys:
        if not deduped or y - deduped[-1] > 2:
            deduped.append(y)
    return deduped


def build_grid(cell_lines, sep_ys=None):
    """cell_lines: [(y, x0, text)] → 二维网格。
    优先用表格行分隔线精确分行；分隔线缺失或只分出 1 行时，按相邻行链式聚行（阈值 10）。"""
    rows = None
    if sep_ys:
        import bisect

        bands = {}
        for y, x0, text in cell_lines:
            bands.setdefault(bisect.bisect_right(sep_ys, y), []).append((y, x0, text))
        if len(bands) >= 2:
            rows = [bands[key] for key in sorted(bands)]
    if rows is None:
        rows = []
        for y, x0, text in cell_lines:
            if rows and abs(y - rows[-1][-1][0]) <= 10:
                rows[-1].append((y, x0, text))
            else:
                rows.append([(y, x0, text)])
    cols = cluster([x for row in rows for _, x, _ in row], 14)
    width = len(cols)
    grid = []
    for row in rows:
        line = [""] * width
        for _, x, text in row:
            i = assign_columns(x, cols)
            line[i] = smart_join(line[i], text) if line[i] else text
        grid.append(line)
    grid = [row for row in grid if any(cell.strip() for cell in row)]
    if len(grid) <= 1:
        return None
    keep = [i for i in range(width) if any(row[i].strip() for row in grid)]
    grid = [[row[i] for i in keep] for row in grid]
    return {"head": grid[0], "rows": grid[1:]}


def extract_blocks():
    blocks = []
    for pno in range(3, doc.page_count):  # 跳过封面与目录（第 1—3 页）
        page = doc[pno]
        lines = page_lines(page)
        seps = page_separators(page)
        i = 0
        # 跨页表格续排：上一块是表格、本页开头紧跟同列数的 8.8pt 行 → 并入该表。
        # 表题在上一页页尾、表体在下一页的场景：目标表还没有表头，则用续排首行充当表头。
        if blocks and blocks[-1]["t"] == "table" and lines and lines[0][0] < 120:
            target = blocks[-1]
            j = 0
            frag = []
            while (
                j < len(lines)
                and lines[j][2] <= 9.4
                and not IS_NOTE.match(lines[j][3])
                and not IS_TABLE_CAP.match(lines[j][3])
                and not IS_FIG_CAP.match(lines[j][3])
            ):
                frag.append((lines[j][0], lines[j][1], lines[j][3]))
                j += 1
            if frag:
                grid = build_grid(frag, seps)
                fits = grid and (
                    target.get("head") is None
                    or len(grid["head"]) == len(target["head"])
                )
                if fits:
                    if target.get("head") is None:
                        # 续排首行即表头：允许边缘空列，但至少 2 列且仅允许 1 列为空
                        head = grid["head"]
                        non_empty = sum(1 for cell in head if cell.strip())
                        if non_empty >= 2 and non_empty >= len(head) - 1:
                            target["head"] = head
                            target["rows"] = [row for row in grid["rows"] if row != head]
                            target.pop("text", None)
                            i = j
                    else:
                        for row in [grid["head"]] + grid["rows"]:
                            if row != target["head"]:  # 续页可能重复表头
                                target["rows"].append(row)
                        i = j
        while i < len(lines):
            y, x0, size, text = lines[i]
            if IS_TABLE_CAP.match(text) and size <= 10.4:
                j = i + 1
                cells = []
                while j < len(lines) and lines[j][2] <= 9.4 and not IS_NOTE.match(lines[j][3]):
                    cells.append((lines[j][0], lines[j][1], lines[j][3]))
                    j += 1
                note = lines[j][3] if j < len(lines) and IS_NOTE.match(lines[j][3]) else ""
                if note:
                    j += 1
                entry = {"t": "table", "title": text, "note": note}
                grid = build_grid(cells, seps) if cells else None
                if grid:
                    entry["head"] = grid["head"]
                    entry["rows"] = grid["rows"]
                else:
                    entry["text"] = text
                blocks.append(entry)
                i = j
                continue
            if IS_FIG_CAP.match(text) and size <= 10.4:
                note = lines[i + 1][3] if i + 1 < len(lines) and IS_NOTE.match(lines[i + 1][3]) else ""
                if note:
                    i += 1
                blocks.append({"t": "figure", "title": text, "note": note})
                i += 1
                continue
            if IS_NOTE.match(text):
                blocks.append({"t": "note", "text": text})
                i += 1
                continue
            if size >= 14.4:
                blocks.append({"t": "h1", "text": text})
            elif size >= 12.2:
                blocks.append({"t": "h2", "text": text})
            elif size >= 10.9:
                blocks.append({"t": "h3", "text": text})
            else:
                # 正文段落：首行有缩进则为新段，其余为 PDF 折行 → 并入上一段（注释同理）
                last = blocks[-1] if blocks else None
                if x0 >= INDENT_X or last is None or last["t"] not in ("p", "note"):
                    blocks.append({"t": "p", "text": text})
                else:
                    last["text"] = smart_join(last["text"], text)
            i += 1
    return blocks


PART_RE = re.compile(r"^第[一二]篇")
CHAP_RE = re.compile(r"^[一二三四五六七八九十]+、")
APPENDIX_RE = re.compile(r"^(附录|附表)")
SUB_RE = re.compile(r"^\d+\.\d+\.\d+")
SEC_RE = re.compile(r"^\d+\.\d+[　\s]")


def level_of(text, size):
    """按编号模式优先、字号兜底判定层级：part / chapter / section / subsection / p。"""
    if PART_RE.match(text):
        return "part"
    if APPENDIX_RE.match(text) or CHAP_RE.match(text):
        return "chapter"
    if SUB_RE.match(text):
        return "subsection"
    if SEC_RE.match(text):
        return "section"
    if size >= 14.4:
        return "chapter"
    if size >= 12.2:
        return "section"
    if size >= 10.9:
        return "subsection"
    return "p"


def build_tree(blocks):
    """把线性块流组织成 篇 → 章 → 节 → 小节 → 内容块。"""
    report = {"meta": {}, "parts": []}
    part = None
    chapter = None
    section = None
    subsection = None
    for block in blocks:
        kind = block["t"]
        text = block.get("text", "")
        if kind in ("h1", "h2", "h3"):
            level = level_of(text, {"h1": 15.0, "h2": 12.5, "h3": 11.0}[kind])
            if level == "part":
                part = {"title": text, "chapters": []}
                report["parts"].append(part)
                chapter = section = subsection = None
                continue
            if part is None:
                part = {"title": "第一篇  整体分析", "chapters": []}
                report["parts"].append(part)
            if level == "chapter":
                target = {"title": text, "sections": [], "blocks": []}
                part["chapters"].append(target)
                chapter, section, subsection = target, None, None
                continue
            if chapter is None:
                continue
            if level == "section":
                target = {"title": text, "blocks": []}
                chapter["sections"].append(target)
                section, subsection = target, None
                continue
            if section is None:
                section = {"title": "", "blocks": []}
                chapter["sections"].append(section)
            target = {"title": text, "blocks": []}
            section.setdefault("subsections", []).append(target)
            subsection = target
            continue
        holder = subsection or section or chapter
        if holder is not None:
            holder.setdefault("blocks", []).append(block)
    return report


raw_blocks = extract_blocks()
report = build_tree(raw_blocks)

# 封面与报告元信息（PDF 第 1 页）
report["meta"] = {
    "title": "中国新型储能行业研究报告",
    "subtitle": "——商业银行授信视角",
    "org": "对公业务行业研究 · 内部研究资料",
    "date": "2026.09",
    "dataBaseDate": "2025年12月31日（装机、价格、竞争格局等核心数据），政策动态更新至2026年9月",
    "sourcePdf": "行业研究报告_整体分析与细分领域分析.pdf",
    "pages": doc.page_count,
}

# 稳定 id：part{n} / part{n}-c{i} / part{n}-c{i}-s{j} / part{n}-c{i}-s{j}-ss{k}
def slug(part_i, chap_i, sec_i=None, sub_i=None):
    key = f"part{part_i}-c{chap_i}"
    if sec_i is not None:
        key += f"-s{sec_i}"
    if sub_i is not None:
        key += f"-ss{sub_i}"
    return key


counts = {"chapters": 0, "sections": 0, "subsections": 0, "tables": 0, "figures": 0, "paragraphs": 0}
for part_i, part in enumerate(report["parts"], 1):
    part["key"] = f"part{part_i}"
    # 篇标题形如「第一篇  整体分析」
    parts = part["title"].split()
    part["no"] = parts[0]
    part["name"] = parts[-1]
    for chap_i, chapter in enumerate(part["chapters"], 1):
        chapter["key"] = slug(part_i, chap_i)
        counts["chapters"] += 1
        for sec_i, section in enumerate(chapter.get("sections", []), 1):
            section["key"] = slug(part_i, chap_i, sec_i)
            counts["sections"] += 1
            for sub_i, sub in enumerate(section.get("subsections", []), 1):
                sub["key"] = slug(part_i, chap_i, sec_i, sub_i)
                counts["subsections"] += 1
        for holder in [
            chapter,
            *chapter.get("sections", []),
            *[s for sec in chapter.get("sections", []) for s in sec.get("subsections", [])],
        ]:
            for block in holder.get("blocks", []):
                block["key"] = f"{holder['key']}-b{holder['blocks'].index(block) + 1}"
                if block["t"] == "table":
                    counts["tables"] += 1
                elif block["t"] == "figure":
                    counts["figures"] += 1
                elif block["t"] == "p":
                    counts["paragraphs"] += 1
report["counts"] = counts

json.dump(report, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("counts:", counts)

print("parts:", [p["title"] for p in report["parts"]])
for part in report["parts"]:
    print("=", part["title"], "chapters:", len(part["chapters"]))
    for chapter in part["chapters"]:
        n_blocks = len(chapter.get("blocks", []))
        print("  -", chapter["title"], f"(sections={len(chapter['sections'])}, blocks={n_blocks})")
        for section in chapter["sections"][:3]:
            subs = len(section.get("subsections", []))
            print("      ·", (section["title"] or "(无题)")[:40], f"subs={subs}")
