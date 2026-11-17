# -*- coding: utf-8 -*-
"""build: 生成「算力产业链企业清单（合并版）」"""
import json
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

BASE = "D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/.算力清单合并.ref/"
SRC_WB = "G:/对公经营智能化项目/算力/算力产业链企业清单.xlsx"
OUT = "D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/算力产业链企业清单.xlsx"

d = json.load(open(BASE + "final.json", encoding="utf-8"))
main, weak, none, records = d["main"], d["weak"], d["none"], d["records"]

SEG_ORDER = [
    "AI芯片与加速卡", "存储与内存接口", "先进封装与测试", "PCB与覆铜板",
    "光芯片与光器件", "电源与供配电",
    "AI服务器整机", "交换机与网络设备", "光模块与CPO", "高速连接与铜缆",
    "液冷温控", "光纤光缆", "机房建设与集成",
    "IDC与智算中心", "算力租赁与运营", "云计算与算力调度", "运营商算力网络",
    "数据中心运维", "算力需求方", "待核实",
]
BLOCK_OF = {}
for s in SEG_ORDER[:6]:
    BLOCK_OF[s] = "上游 · 核心器件"
for s in SEG_ORDER[6:13]:
    BLOCK_OF[s] = "中游 · 设备与网络"
for s in SEG_ORDER[13:19]:
    BLOCK_OF[s] = "下游 · 算力运营与服务"
BLOCK_OF["待核实"] = "待核实"

# ---------------- 样式 ----------------
NAVY = "1F3864"
FONT_T = Font(name="微软雅黑", size=16, bold=True, color=NAVY)
FONT_SUB = Font(name="微软雅黑", size=9, color="595959")
FONT_HEAD = Font(name="微软雅黑", size=10, bold=True, color="FFFFFF")
FONT_BASE = Font(name="微软雅黑", size=10, color="262626")
FONT_BOLD = Font(name="微软雅黑", size=10, bold=True, color="262626")
FILL_HEAD = PatternFill("solid", fgColor=NAVY)
FILL_SOFT = PatternFill("solid", fgColor="F2F5FA")
FILL_BLOCK = PatternFill("solid", fgColor="D9E2F3")
FILL_TOTAL = PatternFill("solid", fgColor="E7E6E6")
THIN = Side(style="thin", color="D0D7E5")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
AL = Alignment(horizontal="left", vertical="center")
AC = Alignment(horizontal="center", vertical="center")
AW = Alignment(horizontal="left", vertical="center", wrap_text=True)

wb = openpyxl.Workbook()

# ============================ Sheet1 环节总览 ============================
ws = wb.active
ws.title = "环节总览"
ws.sheet_view.showGridLines = False

n_seg_filled = len([s for s in SEG_ORDER if s != "待核实"])
ws.merge_cells("A1:I1")
ws["A1"] = "算力产业链企业总表 · 环节分布"
ws["A1"].font = FONT_T
ws.row_dimensions[1].height = 30

ws.merge_cells("A2:I2")
ws["A2"] = ("合并 6 份名单（原清单 129 家 · 算力产业发展方阵 209 · ODCC 数据中心名录 158 · "
            "中国智能计算产业联盟 71 · 东财算力概念 248 · 信息源地图增量 83），"
            f"去重后 {len(main)} 家企业主体，按 19 个环节归集；东财概念中 100 只弱相关/存疑标的单列，未计入本表")
ws["A2"].font = FONT_SUB
ws["A2"].alignment = AW
ws.row_dimensions[2].height = 30

HEAD1 = ["板块", "序号", "环节", "企业数", "上市公司", "非上市企业", "外资企业", "集团/分支", "规则推断归类", "代表企业"]
for i, h in enumerate(HEAD1, start=1):
    c = ws.cell(row=3, column=i, value=h)
    c.font = FONT_HEAD
    c.fill = FILL_HEAD
    c.alignment = AC if i != 10 else AL
    c.border = BORDER
ws.row_dimensions[3].height = 26

REP = {
    "AI芯片与加速卡": "海光信息、寒武纪、沐曦股份",
    "存储与内存接口": "澜起科技、江波龙、兆易创新",
    "先进封装与测试": "长电科技、通富微电、华天科技",
    "PCB与覆铜板": "沪电股份、胜宏科技、深南电路",
    "光芯片与光器件": "天孚通信、源杰科技、光迅科技",
    "电源与供配电": "中恒电气、科士达、科华数据",
    "AI服务器整机": "浪潮信息、工业富联、中科曙光",
    "交换机与网络设备": "紫光股份、锐捷网络、中兴通讯",
    "光模块与CPO": "中际旭创、新易盛、天孚通信",
    "高速连接与铜缆": "立讯精密、中航光电、华丰科技",
    "液冷温控": "英维克、申菱环境、曙光数创",
    "光纤光缆": "长飞光纤、亨通光电、烽火通信",
    "机房建设与集成": "中电科普天科技、同方、捷通智慧",
    "IDC与智算中心": "润泽科技、宝信软件、数据港",
    "算力租赁与运营": "中贝通信、鸿博股份、并行科技",
    "云计算与算力调度": "优刻得、青云科技、金山云",
    "运营商算力网络": "中国移动、中国电信、中国联通",
    "数据中心运维": "真视通、亚康股份、银信科技",
    "算力需求方": "国家电网、华大基因、商汤科技",
    "待核实": "环节待人工确认",
}

N = len(main) + 1
r = 4
blocks = []
for blk in ["上游 · 核心器件", "中游 · 设备与网络", "下游 · 算力运营与服务", "待核实"]:
    segs = [s for s in SEG_ORDER if BLOCK_OF[s] == blk and any(e["seg"] == s for e in main)]
    if not segs:
        continue
    start = r
    for i, seg in enumerate(segs, start=1):
        ws.cell(row=r, column=1, value=blk)
        ws.cell(row=r, column=2, value=i)
        ws.cell(row=r, column=3, value=seg)
        ws.cell(row=r, column=4, value=f"=COUNTIFS(企业清单!$C$2:$C${N},$C{r})")
        ws.cell(row=r, column=5, value=f'=COUNTIFS(企业清单!$C$2:$C${N},$C{r},企业清单!$H$2:$H${N},"上市公司")')
        ws.cell(row=r, column=6, value=f'=COUNTIFS(企业清单!$C$2:$C${N},$C{r},企业清单!$H$2:$H${N},"非上市企业")')
        ws.cell(row=r, column=7, value=f'=COUNTIFS(企业清单!$C$2:$C${N},$C{r},企业清单!$H$2:$H${N},"外资企业")')
        ws.cell(row=r, column=8, value=f'=COUNTIFS(企业清单!$C$2:$C${N},$C{r},企业清单!$H$2:$H${N},"集团/分支机构")')
        ws.cell(row=r, column=9, value=f'=COUNTIFS(企业清单!$C$2:$C${N},$C{r},企业清单!$J$2:$J${N},"规则推断")')
        ws.cell(row=r, column=10, value=REP.get(seg, ""))
        for col in range(1, 11):
            c = ws.cell(row=r, column=col)
            c.font = FONT_BASE
            c.border = BORDER
            c.alignment = AC if col in (2, 4, 5, 6, 7, 8, 9) else AL
            if seg == "待核实":
                c.fill = FILL_SOFT
        ws.row_dimensions[r].height = 22
        r += 1
    ws.merge_cells(start_row=start, start_column=1, end_row=r - 1, end_column=1)
    ws.cell(row=start, column=1).alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.cell(row=start, column=1).font = FONT_BOLD
    for rr in range(start, r):
        ws.cell(row=rr, column=1).fill = FILL_BLOCK
    blocks.append((blk, r - start))

# 合计
ws.cell(row=r, column=1, value="合计")
ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
ws.cell(row=r, column=1).alignment = AC
ws.cell(row=r, column=1).font = FONT_BOLD
for col, letter in [(4, "D"), (5, "E"), (6, "F"), (7, "G"), (8, "H"), (9, "I")]:
    ws.cell(row=r, column=col, value=f"=SUM({letter}4:{letter}{r-1})")
    ws.cell(row=r, column=col).font = FONT_BOLD
    ws.cell(row=r, column=col).alignment = AC
ws.cell(row=r, column=10, value="—")
for col in range(1, 11):
    c = ws.cell(row=r, column=col)
    c.fill = FILL_TOTAL
    c.border = BORDER
ws.row_dimensions[r].height = 24

for col, w in zip("ABCDEFGHIJ", [20, 6, 20, 9, 10, 11, 10, 10, 12, 40]):
    ws.column_dimensions[col].width = w
ws.freeze_panes = "A4"

# ============================ Sheet2 企业清单 ============================
ws2 = wb.create_sheet("企业清单")
ws2.sheet_view.showGridLines = False
HEAD2 = ["序号", "板块", "环节", "企业简称", "主体全称", "股票代码", "交易所",
         "主体类型", "来源名单", "归类依据", "名录身份", "备注 / 业务定位"]
for i, h in enumerate(HEAD2, start=1):
    c = ws2.cell(row=1, column=i, value=h)
    c.font = FONT_HEAD
    c.fill = FILL_HEAD
    c.alignment = AC
    c.border = BORDER
ws2.row_dimensions[1].height = 26


def short_of(e):
    for nm in e["names"]:
        if len(nm) <= 12 and "有限公司" not in nm and "股份" not in nm:
            return nm
    return e["key"]


def full_of(e):
    cands = [n for n in e["names"] if "有限" in n or "股份" in n]
    return max(cands, key=len) if cands else e["key"]


def exch_of(code, cur):
    if cur and any(x in str(cur) for x in ("沪", "深", "北", "科创", "创业")):
        m = {"沪主板": "上交所主板", "深主板": "深交所主板"}
        return m.get(str(cur), str(cur))
    if not code:
        return "—"
    if code.startswith("688"):
        return "上交所科创板"
    if code.startswith("6"):
        return "上交所主板"
    if code.startswith("3"):
        return "深交所创业板"
    if code.startswith(("0",)):
        return "深交所主板"
    if code.startswith(("8", "4", "9")):
        return "北交所"
    return "—"


SRC_LABEL = {"原清单": "原清单", "信息源地图": "信息源地图", "ODCC": "ODCC 名录",
             "智能计算联盟": "智能计算联盟", "算力方阵": "算力方阵", "东财算力概念": "东财算力概念"}

for idx, e in enumerate(main, start=1):
    rr = idx + 1
    note = (e.get("note") or "").replace("\n", " ")
    if e["how"] == "规则推断":
        note = (note + " ｜") if note else ""
        note += "环节按东财行业归类，建议抽核"
    if e["how"] == "待核实":
        note = (note + " ｜") if note else ""
        note += "环节待人工确认"
    if e["type"] == "上市公司" and not e["code"]:
        note += " ｜本地A股清单未匹配到代码（疑更名/退市），代码待核"
    ws2.cell(row=rr, column=1, value=idx)
    ws2.cell(row=rr, column=2, value=e["block"])
    ws2.cell(row=rr, column=3, value=e["seg"])
    ws2.cell(row=rr, column=4, value=short_of(e))
    ws2.cell(row=rr, column=5, value=full_of(e))
    cc = ws2.cell(row=rr, column=6, value=e["code"] or "")
    cc.number_format = "@"
    ws2.cell(row=rr, column=7, value=exch_of(e["code"], e.get("exch")))
    ws2.cell(row=rr, column=8, value=e["type"])
    ws2.cell(row=rr, column=9, value="；".join(SRC_LABEL.get(s, s) for s in e["srcs"]))
    ws2.cell(row=rr, column=10, value=e["how"])
    ws2.cell(row=rr, column=11, value="；".join(e["ident"])[:120])
    ws2.cell(row=rr, column=12, value=note[:150])
    for col in range(1, 13):
        c = ws2.cell(row=rr, column=col)
        c.font = FONT_BASE
        c.border = BORDER
        c.alignment = AC if col in (1, 6, 7, 8, 10) else (AW if col in (5, 11, 12) else AL)
        if idx % 2 == 0:
            c.fill = FILL_SOFT
    ws2.row_dimensions[rr].height = 30

for col, w in zip("ABCDEFGHIJKL", [6, 20, 18, 18, 34, 9, 13, 11, 22, 10, 30, 40]):
    ws2.column_dimensions[col].width = w
ws2.freeze_panes = "E2"
ws2.auto_filter.ref = f"A1:L{len(main)+1}"

# ============================ Sheet3 名单来源明细 ============================
ws3 = wb.create_sheet("名单来源明细")
ws3.sheet_view.showGridLines = False
ws3.merge_cells("A1:G1")
ws3["A1"] = f"名单来源明细 · {len(records)} 条原始记录逐条留痕（可追溯每条记录的归并去向）"
ws3["A1"].font = FONT_T
ws3.row_dimensions[1].height = 30
HEAD3 = ["来源名单", "原始名称", "类别 / 角色", "会员或级别", "归并到主体", "是否入主清单", "说明"]
for i, h in enumerate(HEAD3, start=1):
    c = ws3.cell(row=2, column=i, value=h)
    c.font = FONT_HEAD
    c.fill = FILL_HEAD
    c.alignment = AC
    c.border = BORDER
ws3.row_dimensions[2].height = 24

ent_index = {e["key"]: e for e in main}
weak_index = {e["key"]: e for e in weak}
none_index = {e["key"]: e for e in none}
rr = 3
for rec in records:
    k = rec["key"]
    if k in ent_index:
        flag = "是"
        tip = ""
    elif k in weak_index:
        flag = "否 · 弱相关"
        tip = "东财概念标注为弱相关/存疑，单列于「算力概念弱相关」页签"
    elif k in none_index:
        flag = "否 · 非企业"
        tip = "高校/医院/事业单位，列于本页留痕"
    else:
        flag = "否"
        tip = ""
    ws3.cell(row=rr, column=1, value=rec["src"])
    ws3.cell(row=rr, column=2, value=rec["name"])
    ws3.cell(row=rr, column=3, value=rec.get("cat") or "")
    mem = rec.get("member")
    ws3.cell(row=rr, column=4, value=("成员单位" if mem == "是" else "非成员") if mem else "")
    ws3.cell(row=rr, column=5, value=k)
    ws3.cell(row=rr, column=6, value=flag)
    ws3.cell(row=rr, column=7, value=tip)
    for col in range(1, 8):
        c = ws3.cell(row=rr, column=col)
        c.font = FONT_BASE
        c.border = BORDER
        c.alignment = AC if col in (4, 6) else AL
        if rr % 2 == 0:
            c.fill = FILL_SOFT
    ws3.row_dimensions[rr].height = 20
    rr += 1
for col, w in zip("ABCDEFG", [15, 40, 24, 12, 34, 12, 40]):
    ws3.column_dimensions[col].width = w
ws3.freeze_panes = "A3"
ws3.auto_filter.ref = f"A2:G{rr-1}"

# ============================ Sheet4 算力概念弱相关 ============================
ws4 = wb.create_sheet("算力概念弱相关")
ws4.sheet_view.showGridLines = False
ws4.merge_cells("A1:F1")
ws4["A1"] = "东方财富「算力概念」中弱相关 / 存疑标的（100 只）· 未计入主清单"
ws4["A1"].font = FONT_T
ws4.row_dimensions[1].height = 30
ws4.merge_cells("A2:F2")
ws4["A2"] = "口径：东财概念板块人工维护、成分口径宽，含大量边缘或蹭概念标的；下列标的未出现在任何产业名录中，且东财自身标注为「弱相关/存疑」，故不纳入产业链归类，仅备查"
ws4["A2"].font = FONT_SUB
ws4["A2"].alignment = AW
ws4.row_dimensions[2].height = 28
HEAD4 = ["序号", "股票代码", "证券简称", "上市板", "东财行业", "总市值（亿元）"]
for i, h in enumerate(HEAD4, start=1):
    c = ws4.cell(row=3, column=i, value=h)
    c.font = FONT_HEAD
    c.fill = FILL_HEAD
    c.alignment = AC
    c.border = BORDER
weak_sorted = sorted(weak, key=lambda e: -(e.get("mcap") or 0))
for idx, e in enumerate(weak_sorted, start=1):
    rr = idx + 3
    ws4.cell(row=rr, column=1, value=idx)
    c = ws4.cell(row=rr, column=2, value=e["code"] or "")
    c.number_format = "@"
    ws4.cell(row=rr, column=3, value=e["key"])
    ws4.cell(row=rr, column=4, value=e.get("exch") or "")
    ws4.cell(row=rr, column=5, value=e.get("emind") or "")
    mc = ws4.cell(row=rr, column=6, value=round(e["mcap"], 1) if e.get("mcap") else None)
    mc.number_format = "#,##0.0"
    for col in range(1, 7):
        c = ws4.cell(row=rr, column=col)
        c.font = FONT_BASE
        c.border = BORDER
        c.alignment = AC
        if idx % 2 == 0:
            c.fill = FILL_SOFT
    ws4.row_dimensions[rr].height = 20
for col, w in zip("ABCDEF", [6, 11, 16, 12, 16, 14]):
    ws4.column_dimensions[col].width = w
ws4.freeze_panes = "A4"
ws4.auto_filter.ref = f"A3:F{len(weak)+3}"

# ============================ Sheet5/6 从原工作簿继承 ============================
src = openpyxl.load_workbook(SRC_WB, data_only=True)
for name, newname in [("集采与供应链依据", "集采与供应链依据"), ("行内算力客户库", "行内算力客户库")]:
    if name not in src.sheetnames:
        continue
    s = src[name]
    t = wb.create_sheet(newname)
    t.sheet_view.showGridLines = False
    for row in s.iter_rows():
        for cell in row:
            if cell.value is None:
                continue
            nc = t.cell(row=cell.row, column=cell.column, value=cell.value)
            nc.font = FONT_HEAD if cell.row <= 2 else FONT_BASE
            nc.alignment = AW
            nc.border = BORDER
            if cell.row <= 2:
                nc.fill = FILL_HEAD
    for col in range(1, s.max_column + 1):
        letter = get_column_letter(col)
        w = s.column_dimensions[letter].width if letter in s.column_dimensions else 16
        t.column_dimensions[letter].width = w or 16
    t.freeze_panes = "A3"
    t.auto_filter.ref = f"A2:{get_column_letter(s.max_column)}{s.max_row}"

# ============================ Sheet7 口径说明 ============================
ws7 = wb.create_sheet("口径说明")
ws7.sheet_view.showGridLines = False
ws7.merge_cells("A1:B1")
ws7["A1"] = "口径说明"
ws7["A1"].font = FONT_T
ws7.row_dimensions[1].height = 32

NOTES = [
    ("本表做了什么",
     f"把 6 份名单合并为一张主体表：原「算力产业链企业清单」129 家 + 算力产业发展方阵 209 家 + "
     f"ODCC 数据中心企业名录 158 家 + 中国智能计算产业联盟 71 条 + 东财算力概念 248 只 + "
     f"信息源地图增量 83 家，合计 901 条原始记录，按企业主体去重后得到 {len(main)} 家，"
     f"另 100 只弱相关概念股、20 家非企业主体单独留痕。"),
    ("去重规则",
     "先做名称归一（去括号注释、去「有限公司／股份有限公司／集团」等后缀、全角字母转半角），"
     "再按「工商全称—简称—品牌名」别名表归并（如 北京中科寒武纪＝寒武纪、曙光信息产业＝中科曙光、"
     "阿里云＝阿里云计算、华为信息技术＝华为技术）。所有归并关系可在「名单来源明细」页签逐条核对；"
     "确认仍为重名不同主体者（如中国移动与中国移动国际、软通动力与软通智慧）未做合并。"),
    ("环节体系",
     "按「芯片与核心器件 → 设备与网络 → 算力运营与服务」三段划分 19 个环节，"
     "较原表的 16 个环节新增「机房建设与集成」「数据中心运维」「算力需求方」三类，"
     "以容纳 ODCC 名录中的设计院、建设单位、运维商与数据中心用户。"),
    ("归类依据三档",
     "① 人工核定：来源名单自带环节、或按主营业务逐家判定；② 规则推断：按东财行业分类映射（如半导体→AI芯片、"
     "IT服务→云计算与算力调度），建议对这部分抽核；③ 待核实：企业名与业务无法判断，预留 24 个位置待补。"
     "「企业清单」第 10 列标明每家的归类依据。"),
    ("主体类型",
     "上市公司（有 A 股代码，含北交所）；非上市企业（含地方国资平台、未上市整机与芯片厂商）；"
     "外资企业（ODCC 名录中的海外与台资厂商，共 37 家）；集团/分支机构（三大运营商及其省分公司）。"),
    ("哪些没有进主清单",
     "① 东财算力概念中「弱相关/存疑」且不在任何产业名录中的 100 只（含中药、教育、林业等蹭概念标的），"
     "单列「算力概念弱相关」页签；② 高校、医院、实验室、学会等 20 家非企业主体，"
     "在「名单来源明细」留痕但不计入企业数。"),
    ("代码与名称核对",
     "股票代码全部按本地 A 股全量清单（2026-09-03 快照，5,554 只）逐条比对生成，非人工录入；"
     "简称按该清单校正（如 北京君正→君正股份、博创科技→长芯博创）。本地清单未匹配到的主体保留空白并标注，"
     "不做猜测。"),
    ("名录身份的含义",
     "「名录身份」列出该主体在各名单中的角色：ODCC 的 13 类企业分类及是否成员单位、"
     "中国智能计算产业联盟的副理事长/理事/成员级别、算力产业发展方阵成员单位、信息源地图的取证来源。"
     "会员身份只证明其在圈内，不等于有供货或采购关系，需叠加中标记录与年报客户披露使用。"),
    ("数据时效",
     "东财概念行情与市值为 2026-10-20 盘中快照；A 股代码清单为 2026-09-03 快照；"
     "ODCC 名录更新日期见原始表（部分条目为 2018—2021 年录入，主体可能已更名或注销）；"
     "协会与联盟名单以最近一届公开报道为准。使用前建议对重点客户做一次工商核验。"),
    ("使用建议",
     "① 看行业结构用「环节总览」；② 找具体客户用「企业清单」按环节/类型/来源筛选；"
     "③ 核查某家企业的名单来源用「名单来源明细」；④ 找行内存量客户用「行内算力客户库」交叉比对；"
     "⑤ 引用外部数据时的取证依据见「集采与供应链依据」。"),
    ("非原报告内容声明",
     "「备注 / 业务定位」列为业务速览，用于快速判断企业在链条中的位置，不构成对其市占率、技术水平的量化评价，"
     "也不构成投资建议；涉及份额、排名类表述需以最新年报或第三方数据复核。"),
]
r = 2
for k, v in NOTES:
    a = ws7.cell(row=r, column=1, value=k)
    a.font = FONT_BOLD
    a.fill = FILL_BLOCK
    a.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    a.border = BORDER
    b = ws7.cell(row=r, column=2, value=v)
    b.font = FONT_BASE
    b.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    b.border = BORDER
    ws7.row_dimensions[r].height = 72
    r += 1
ws7.column_dimensions["A"].width = 22
ws7.column_dimensions["B"].width = 110
ws7.freeze_panes = "A2"

wb.properties.title = "算力产业链企业清单（合并版）"
wb.properties.creator = "WorkBuddy"
wb.save(OUT)
print("saved", OUT)
print("sheets", wb.sheetnames)
print("main", len(main), "weak", len(weak), "none", len(none), "records", len(records))
