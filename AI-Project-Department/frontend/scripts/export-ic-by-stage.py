# -*- coding: utf-8 -*-
"""把集成电路产业链企业按环节导出为多 sheet 的 Excel 清单。

数据源：frontend/public/data/companies.json（集成电路 4477 家）
输出：outputs/集成电路企业清单-按环节.xlsx
用法：python frontend/scripts/export-ic-by-stage.py
"""
import json
import os
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "frontend", "public", "data", "companies.json")
OUT_DIR = os.path.join(ROOT, "outputs")
OUT = os.path.join(OUT_DIR, "集成电路企业清单-按环节.xlsx")

# 环节顺序：按产业链上下游排（设计 → 材料 → 装备 → 制造 → 封测 → 配套 → 待研判）
STAGES = [
    ("集成电路设计", "1 设计"),
    ("集成电路材料", "2 材料"),
    ("基础电路装备", "3 装备"),
    ("集成电路制造", "4 制造"),
    ("集成电路封测", "5 封测"),
    ("集成电路配套", "6 配套"),
    ("待研判", "7 待研判"),
]

HEADERS = ["序号", "企业名称", "细分领域", "企业属性", "上市情况", "省份", "城市", "区县", "注册/办公地址"]

THIN = Side(style="thin", color="D8DEE9")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
HEAD_FILL = PatternFill("solid", fgColor="1F4E79")
HEAD_FONT = Font(name="微软雅黑", size=10, bold=True, color="FFFFFF")
BODY_FONT = Font(name="微软雅黑", size=10)
MUTED_FONT = Font(name="微软雅黑", size=9, color="7A8699")
ZEBRA = PatternFill("solid", fgColor="F4F7FB")
KEY_FONT = Font(name="微软雅黑", size=10, bold=True, color="B42318")


def load_companies():
    with open(SRC, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("companies", data if isinstance(data, list) else [])


def is_listed(company):
    return "上市企业" in (company.get("tags") or [])


def region_of(company):
    region = company.get("region") or {}
    return (
        (region.get("province") or "").replace("省", "").replace("市", "") or "—",
        (region.get("city") or "").replace("市", "") or "—",
        region.get("district") or "—",
    )


def sort_key(company, sector_rank):
    # 重点 → 上市 → 细分领域（按企业数从多到少）→ 名称
    return (
        0 if company.get("companyType") == "key" else 1,
        0 if is_listed(company) else 1,
        sector_rank.get(company.get("sector") or "未标注", 999),
        company.get("name") or "",
    )


def style_sheet(ws, rows_count, title, subtitle):
    widths = [6, 42, 22, 10, 10, 10, 12, 14, 46]
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(HEADERS))
    cell = ws.cell(row=1, column=1, value=title)
    cell.font = Font(name="微软雅黑", size=14, bold=True, color="1F3864")
    cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 26

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(HEADERS))
    cell = ws.cell(row=2, column=1, value=subtitle)
    cell.font = MUTED_FONT
    cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[2].height = 18

    header_row = 3
    for col, name in enumerate(HEADERS, start=1):
        cell = ws.cell(row=header_row, column=col, value=name)
        cell.font = HEAD_FONT
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER
    ws.row_dimensions[header_row].height = 24

    for i in range(rows_count):
        row_idx = header_row + 1 + i
        for col in range(1, len(HEADERS) + 1):
            cell = ws.cell(row=row_idx, column=col)
            cell.font = BODY_FONT
            cell.border = BORDER
            cell.alignment = Alignment(
                horizontal="left" if col in (2, 3, 9) else "center",
                vertical="center",
                wrap_text=(col == 9),
            )
            if i % 2 == 1:
                cell.fill = ZEBRA

    ws.freeze_panes = ws.cell(row=header_row + 1, column=3)
    ws.auto_filter.ref = f"A{header_row}:{get_column_letter(len(HEADERS))}{header_row + rows_count}"
    ws.sheet_view.showGridLines = False


def build():
    companies = load_companies()
    os.makedirs(OUT_DIR, exist_ok=True)

    wb = Workbook()
    summary = wb.active
    summary.title = "0 总览"

    by_stage = {}
    for chain, _ in STAGES:
        by_stage[chain] = []
    for company in companies:
        chain = company.get("chain") or "待研判"
        by_stage.setdefault(chain, []).append(company)
    for chain in by_stage:
        sector_count = {}
        for company in by_stage[chain]:
            sector = company.get("sector") or "未标注"
            sector_count[sector] = sector_count.get(sector, 0) + 1
        sector_rank = {s: i for i, (s, _) in enumerate(sorted(sector_count.items(), key=lambda kv: -kv[1]))}
        by_stage[chain].sort(key=lambda c: sort_key(c, sector_rank))

    # ---------- 总览 ----------
    total = len(companies)
    summary.sheet_view.showGridLines = False
    summary.merge_cells("A1:G1")
    title = summary["A1"]
    title.value = "集成电路产业链企业清单（按环节）"
    title.font = Font(name="微软雅黑", size=18, bold=True, color="1F3864")
    title.alignment = Alignment(vertical="center")
    summary.row_dimensions[1].height = 34

    summary.merge_cells("A2:G2")
    sub = summary["A2"]
    sub.value = (
        f"数据源：frontend/public/data/companies.json（共 {total:,} 家） · 导出日期：{date.today().isoformat()} · "
        "每个环节单独一页，页内按「重点企业 → 上市企业 → 细分领域」排序"
    )
    sub.font = MUTED_FONT
    summary.row_dimensions[2].height = 20

    head = ["环节", "企业数", "占比", "上市企业", "重点企业", "细分领域", "细分领域分布"]
    for col, name in enumerate(head, start=1):
        cell = summary.cell(row=4, column=col, value=name)
        cell.font = HEAD_FONT
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER
    summary.row_dimensions[4].height = 24

    for i, (chain, sheet_name) in enumerate(STAGES):
        rows = by_stage.get(chain, [])
        listed = sum(1 for c in rows if is_listed(c))
        key = sum(1 for c in rows if c.get("companyType") == "key")
        sectors = {}
        for c in rows:
            sectors[c.get("sector") or "未标注"] = sectors.get(c.get("sector") or "未标注", 0) + 1
        sector_txt = " / ".join(f"{s} {n}" for s, n in sorted(sectors.items(), key=lambda kv: -kv[1]))
        values = [
            chain,
            len(rows),
            f"{len(rows) / total * 100:.1f}%",
            listed,
            key,
            len(sectors),
            sector_txt,
        ]
        row_idx = 5 + i
        for col, value in enumerate(values, start=1):
            cell = summary.cell(row=row_idx, column=col, value=value)
            cell.font = BODY_FONT
            cell.border = BORDER
            cell.alignment = Alignment(
                horizontal="left" if col in (1, 7) else "center", vertical="center", wrap_text=(col == 7)
            )
            if i % 2 == 1:
                cell.fill = ZEBRA
        summary.row_dimensions[row_idx].height = 22

    total_row = 5 + len(STAGES)
    totals = [
        "合计",
        total,
        "100.0%",
        sum(1 for c in companies if is_listed(c)),
        sum(1 for c in companies if c.get("companyType") == "key"),
        len({c.get("sector") for c in companies if c.get("sector")}),
        "",
    ]
    for col, value in enumerate(totals, start=1):
        cell = summary.cell(row=total_row, column=col, value=value)
        cell.font = Font(name="微软雅黑", size=10, bold=True, color="1F3864")
        cell.fill = PatternFill("solid", fgColor="DCE6F2")
        cell.border = BORDER
        cell.alignment = Alignment(horizontal="left" if col == 1 else "center", vertical="center")
    summary.row_dimensions[total_row].height = 24

    note_row = total_row + 2
    summary.merge_cells(start_row=note_row, start_column=1, end_row=note_row, end_column=7)
    note = summary.cell(row=note_row, column=1)
    note.value = (
        "口径说明：① 环节取企业主表的 chain 字段（对应原始行业分类：设计 / 材料 / 装备 / 制造 / 封测 / 其他配套）；"
        "② 细分领域取 sector 字段，设计环节按数字 / 模拟 / 数模混合 / 工具软件划分，装备环节分前道与后道；"
        "③ 「重点企业」为原表标记的重点客户（companyType=key）；「上市情况」按源表「上市企业」标签统计（共 230 家），"
        "源表标签存在遗漏（如龙芯中科、中芯国际等上市主体未打标），仅作参考，正式对外请以上市公司名录核对；"
        "④ 4357 家仅有名称与分类，主营产品/核心技术字段仅重点企业完成调研，故清单不单列产品列。"
    )
    note.font = MUTED_FONT
    note.alignment = Alignment(wrap_text=True, vertical="top")
    summary.row_dimensions[note_row].height = 58

    for col, width in enumerate([22, 10, 10, 10, 10, 10, 74], start=1):
        summary.column_dimensions[get_column_letter(col)].width = width

    # ---------- 分环节明细 ----------
    for chain, sheet_name in STAGES:
        rows = by_stage.get(chain, [])
        ws = wb.create_sheet(sheet_name)
        listed = sum(1 for c in rows if is_listed(c))
        key = sum(1 for c in rows if c.get("companyType") == "key")
        sectors = {}
        for c in rows:
            sector = c.get("sector") or "未标注"
            sectors[sector] = sectors.get(sector, 0) + 1
        sector_txt = " / ".join(f"{s} {n}" for s, n in sorted(sectors.items(), key=lambda kv: -kv[1]))
        style_sheet(
            ws,
            len(rows),
            f"{chain} · 企业清单（{len(rows):,} 家）",
            f"上市 {listed} 家 · 重点企业 {key} 家 · 细分领域：{sector_txt or '—'}",
        )

        for i, c in enumerate(rows, start=1):
            province, city, district = region_of(c)
            values = [
                i,
                c.get("name") or "",
                c.get("sector") or "未标注",
                "重点" if c.get("companyType") == "key" else "一般",
                "上市" if is_listed(c) else "非上市",
                province,
                city,
                district,
                c.get("address") or "—",
            ]
            row_idx = 4 + i - 1
            for col, value in enumerate(values, start=1):
                cell = ws.cell(row=row_idx, column=col, value=value)
                if col == 4 and c.get("companyType") == "key":
                    cell.font = KEY_FONT
            ws.row_dimensions[row_idx].height = 20


    wb.save(OUT)
    print("saved:", OUT)
    print("total:", total)
    for chain, _ in STAGES:
        print(f"  {chain}: {len(by_stage.get(chain, []))}")


if __name__ == "__main__":
    build()
