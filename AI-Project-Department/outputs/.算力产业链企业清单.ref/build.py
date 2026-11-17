# -*- coding: utf-8 -*-
"""生成《算力产业链企业清单》工作簿。"""

try:
    import openpyxl
except ImportError:
    import subprocess, sys

    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "openpyxl>=3.1.0"])
    import openpyxl

import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT_XLSX = "D:/ai_project/AI-Project-Department/AI-Project-Department/outputs/算力产业链企业清单.xlsx"
TITLE = "算力产业链企业清单"
ASHARE = "D:/ai_project/AI-Project-Department/AI-Project-Department/frontend/docs/a-share-list.json"
AI_JSON = "D:/ai_project/AI-Project-Department/AI-Project-Department/frontend/public/data/industries/companies-ai.json"


def xl_color(css_hex):
    value = css_hex.removeprefix("#").upper()
    if len(value) != 6:
        raise ValueError(f"Expected #RRGGBB, got: {css_hex}")
    return "FF" + value


XL_PRIMARY = xl_color("#4472C4")
XL_PRIMARY_DARK = xl_color("#2F5597")
XL_LIGHT = xl_color("#D9E2F3")
XL_SOFT = xl_color("#F4F7FC")
XL_BORDER = xl_color("#BFBFBF")
XL_GREY = xl_color("#595959")

thin_side = Side(style="thin", color=XL_BORDER)
BORDER = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

FONT_BASE = Font(name="微软雅黑", size=10, color=xl_color("#1A1A1A"))
FONT_HEAD = Font(name="微软雅黑", size=10, bold=True, color=xl_color("#FFFFFF"))
FONT_TITLE = Font(name="微软雅黑", size=15, bold=True, color=xl_color("#FFFFFF"))
FONT_SUB = Font(name="微软雅黑", size=9, color=XL_GREY)
FONT_BOLD = Font(name="微软雅黑", size=10, bold=True, color=xl_color("#1A1A1A"))

FILL_HEAD = PatternFill("solid", fgColor=XL_PRIMARY)
FILL_TITLE = PatternFill("solid", fgColor=XL_PRIMARY_DARK)
FILL_SOFT = PatternFill("solid", fgColor=XL_SOFT)
FILL_LIGHT = PatternFill("solid", fgColor=XL_LIGHT)

ALIGN_C = Alignment(horizontal="center", vertical="center")
ALIGN_L = Alignment(horizontal="left", vertical="center")
ALIGN_WRAP = Alignment(horizontal="left", vertical="center", wrap_text=True)

# ---------------------------------------------------------------- 环节定义
# (环节, 板块, 环节定位)
SEGMENTS = [
    ("AI 芯片（GPU/NPU/DCU）", "上游 · 算力芯片与核心元器件", "算力性能天花板，国产替代主战场"),
    ("存储与内存接口", "上游 · 算力芯片与核心元器件", "破解“内存墙”，HBM / DDR5 关键配套"),
    ("先进封装与测试", "上游 · 算力芯片与核心元器件", "高算力芯片的封装瓶颈环节"),
    ("PCB 与覆铜板", "上游 · 算力芯片与核心元器件", "高速信号承载，AI 服务器主板刚需"),
    ("光芯片与光器件", "上游 · 算力芯片与核心元器件", "光模块上游，CPO 关键器件"),
    ("电源与供配电", "上游 · 算力芯片与核心元器件", "高功率机柜的供电保障"),
    ("AI 服务器整机", "中游 · 算力设备与网络", "芯片到可用算力的集成环节"),
    ("交换机与网络设备", "中游 · 算力设备与网络", "集群组网枢纽，万卡互联瓶颈"),
    ("光模块与 CPO", "中游 · 算力设备与网络", "集群高速互联，带宽升级主线"),
    ("高速连接与铜缆", "中游 · 算力设备与网络", "机柜内短距高速互联"),
    ("液冷温控", "中游 · 算力设备与网络", "高密度机柜散热，PUE 约束关键"),
    ("光纤光缆", "中游 · 算力设备与网络", "数据中心间长距连接"),
    ("IDC / 智算中心", "下游 · 算力运营与服务", "机房、电力、机柜等重资产资源"),
    ("算力租赁", "下游 · 算力运营与服务", "算力变现，重资产运营模式"),
    ("云计算与算力调度", "下游 · 算力运营与服务", "算力弹性供给与统一调度"),
    ("运营商算力网络", "下游 · 算力运营与服务", "全国算力底座与跨域调度"),
]

# (环节, 企业简称, 一句话定位)
COMPANIES = [
    ("AI 芯片（GPU/NPU/DCU）", "海光信息", "国产 x86 CPU + DCU 双线布局，国产智算中心主力芯片"),
    ("AI 芯片（GPU/NPU/DCU）", "寒武纪", "云端 AI 芯片（思元系列），训练 / 推理一体"),
    ("AI 芯片（GPU/NPU/DCU）", "景嘉微", "国产 GPU，图形显控起家并向通用计算延伸"),
    ("AI 芯片（GPU/NPU/DCU）", "龙芯中科", "自主 LoongArch 指令集 CPU"),
    ("AI 芯片（GPU/NPU/DCU）", "摩尔线程", "全功能 GPU（图形 + 计算），2026 年科创板上市"),
    ("AI 芯片（GPU/NPU/DCU）", "沐曦股份", "高性能通用 GPU（曦云 / 曦思系列）"),
    ("AI 芯片（GPU/NPU/DCU）", "中国长城", "飞腾 CPU 生态整机与信创算力底座"),
    ("存储与内存接口", "澜起科技", "内存接口芯片（DDR5 RCD / MRCD）全球龙头，布局 CXL"),
    ("存储与内存接口", "江波龙", "企业级 SSD 与存储模组"),
    ("存储与内存接口", "佰维存储", "嵌入式 / 工规存储，拓展企业级 SSD"),
    ("存储与内存接口", "兆易创新", "NOR Flash、DRAM、MCU"),
    ("存储与内存接口", "君正股份", "车规与 AIoT 处理器、存储芯片"),
    ("存储与内存接口", "东芯股份", "中小容量 NOR / NAND / DRAM"),
    ("存储与内存接口", "普冉股份", "NOR Flash、EEPROM"),
    ("存储与内存接口", "香农芯创", "存储分销 + 企业级 SSD"),
    ("先进封装与测试", "长电科技", "封测龙头，2.5D / 3D 先进封装"),
    ("先进封装与测试", "通富微电", "AMD 主要封测伙伴，CPU / GPU 封装"),
    ("先进封装与测试", "华天科技", "封测三强，TSV / FC 封装"),
    ("先进封装与测试", "太极实业", "旗下海太半导体承接 DRAM 封测（HBM 相关）"),
    ("PCB 与覆铜板", "沪电股份", "高速高频 PCB，AI 服务器 / 交换机主板"),
    ("PCB 与覆铜板", "胜宏科技", "高阶 HDI 与高多层板，AI 加速卡"),
    ("PCB 与覆铜板", "深南电路", "高多层 PCB + 封装基板"),
    ("PCB 与覆铜板", "生益科技", "高频高速覆铜板"),
    ("PCB 与覆铜板", "东山精密", "PCB 与精密结构件"),
    ("PCB 与覆铜板", "景旺电子", "多层板、HDI"),
    ("PCB 与覆铜板", "兴森科技", "PCB 样板 + IC 载板"),
    ("光芯片与光器件", "源杰科技", "高速激光器芯片（DFB / EML）"),
    ("光芯片与光器件", "天孚通信", "光器件 / 光引擎，CPO 核心配套"),
    ("光芯片与光器件", "仕佳光子", "PLC 分路器、光芯片"),
    ("光芯片与光器件", "光库科技", "薄膜铌酸锂调制器"),
    ("光芯片与光器件", "光迅科技", "光芯片—器件—模块垂直一体化（国资）"),
    ("光芯片与光器件", "华工科技", "光模块 + 激光装备"),
    ("电源与供配电", "中恒电气", "数据中心高压直流 / 巴拿马电源"),
    ("电源与供配电", "欧陆通", "服务器电源"),
    ("电源与供配电", "动力源", "通信与数据中心电源"),
    ("电源与供配电", "科士达", "UPS + 数据中心电源"),
    ("电源与供配电", "麦格米特", "电源模块、液冷配套电源"),
    ("电源与供配电", "科华数据", "UPS 龙头，兼营 IDC"),
    ("AI 服务器整机", "浪潮信息", "国内 AI 服务器市占第一，液冷整机"),
    ("AI 服务器整机", "工业富联", "全球 AI 服务器代工龙头"),
    ("AI 服务器整机", "中科曙光", "超算 / 智算整机与液冷，海光生态"),
    ("AI 服务器整机", "紫光股份", "旗下新华三，服务器 + 交换机"),
    ("AI 服务器整机", "拓维信息", "昇腾 / 鲲鹏整机（兆瀚），政务智算"),
    ("AI 服务器整机", "神州数码", "昇腾服务器 + IT 分销"),
    ("AI 服务器整机", "高新发展", "旗下华鲲振宇，昇腾整机"),
    ("交换机与网络设备", "锐捷网络", "数据中心交换机，800G 智算组网"),
    ("交换机与网络设备", "星网锐捷", "锐捷网络母公司，企业级网络设备"),
    ("交换机与网络设备", "中兴通讯", "交换机 / 路由器 + 服务器，运营商算力网络"),
    ("交换机与网络设备", "盛科通信", "以太网交换芯片"),
    ("光模块与 CPO", "中际旭创", "全球 800G / 1.6T 光模块龙头"),
    ("光模块与 CPO", "新易盛", "高速光模块，海外云厂商主力供应商"),
    ("光模块与 CPO", "剑桥科技", "光模块 + 家庭网关"),
    ("高速连接与铜缆", "立讯精密", "高速铜缆 / 连接器，AI 服务器互联"),
    ("高速连接与铜缆", "中航光电", "高速连接器"),
    ("高速连接与铜缆", "兆龙互连", "高速数据线缆"),
    ("高速连接与铜缆", "华丰科技", "高速背板连接器"),
    ("高速连接与铜缆", "电连技术", "射频与高速连接器"),
    ("高速连接与铜缆", "瑞可达", "连接器（通信 / 新能源）"),
    ("高速连接与铜缆", "铜冠铜箔", "高频高速铜箔（PCB 上游）"),
    ("液冷温控", "英维克", "液冷温控龙头，端到端散热方案"),
    ("液冷温控", "申菱环境", "数据中心专用空调与液冷"),
    ("液冷温控", "高澜股份", "液冷板、CDU"),
    ("液冷温控", "同飞股份", "工业温控与液冷"),
    ("液冷温控", "佳力图", "机房精密空调"),
    ("液冷温控", "曙光数创", "浸没相变液冷（中科曙光系，北交所）"),
    ("液冷温控", "飞荣达", "导热材料与散热模组"),
    ("液冷温控", "中石科技", "导热界面材料"),
    ("液冷温控", "思泉新材", "导热材料、石墨膜"),
    ("光纤光缆", "长飞光纤", "光纤预制棒—光纤—光缆全链条"),
    ("光纤光缆", "亨通光电", "光纤光缆 + 海缆"),
    ("光纤光缆", "中天科技", "光纤光缆 + 海缆"),
    ("IDC / 智算中心", "润泽科技", "东数西算核心 AIDC，高功率液冷机柜"),
    ("IDC / 智算中心", "宝信软件", "华东 IDC 龙头（宝武系）"),
    ("IDC / 智算中心", "光环新网", "京沪 IDC，AWS 中国运营方"),
    ("IDC / 智算中心", "数据港", "批发型 IDC，阿里核心供应商"),
    ("IDC / 智算中心", "奥飞数据", "华南 IDC + 算力服务"),
    ("IDC / 智算中心", "协创数据", "IDC 与算力服务"),
    ("IDC / 智算中心", "云赛智联", "上海国资云与数据中心"),
    ("IDC / 智算中心", "深桑达A", "中国电子系，数字基础设施"),
    ("IDC / 智算中心", "铜牛信息", "北京国资 IDC"),
    ("算力租赁", "中贝通信", "多地万卡级昇腾 / 海光算力集群"),
    ("算力租赁", "鸿博股份", "旗下英博数科，英伟达算力租赁"),
    ("算力租赁", "利通电子", "算力租赁 + 精密结构件"),
    ("算力租赁", "恒润股份", "算力租赁（规划推进中）"),
    ("算力租赁", "弘信电子", "昇腾算力 + FPC"),
    ("算力租赁", "润建股份", "通信运维 + 算力运营"),
    ("云计算与算力调度", "优刻得", "中立公有云"),
    ("云计算与算力调度", "青云科技", "混合云与 AI 算力"),
    ("云计算与算力调度", "首都在线", "云服务 + 算力"),
    ("云计算与算力调度", "并行科技", "超算 / 智算算力服务（北交所）"),
    ("云计算与算力调度", "恒为科技", "算力可视化与调度"),
    ("云计算与算力调度", "思特奇", "算力调度平台（运营商侧）"),
    ("云计算与算力调度", "网宿科技", "CDN + 边缘算力"),
    ("运营商算力网络", "中国移动", "算力网络底座，智算中心"),
    ("运营商算力网络", "中国电信", "天翼云 + 智算"),
    ("运营商算力网络", "中国联通", "联通云 + 智算"),
]

# 第二轮补充（按招投标公示 / 上市公司公告 / 主营构成三条路径检索所得）
SUPPLEMENT = [
    ("AI 芯片（GPU/NPU/DCU）", "复旦微电", "FPGA 与安全芯片，可编程算力加速"),
    ("AI 芯片（GPU/NPU/DCU）", "安路科技", "国产 FPGA 纯标的，边缘与加速卡"),
    ("存储与内存接口", "德明利", "存储主控与模组"),
    ("存储与内存接口", "同有科技", "企业级存储系统"),
    ("先进封装与测试", "甬矽电子", "中高端封测，SiP / FC"),
    ("PCB 与覆铜板", "崇达技术", "中大批量 PCB，通信与服务器"),
    ("PCB 与覆铜板", "奥士康", "高多层 PCB，服务器与交换机"),
    ("PCB 与覆铜板", "广合科技", "服务器 PCB 专业厂"),
    ("PCB 与覆铜板", "华正新材", "高频高速覆铜板"),
    ("PCB 与覆铜板", "南亚新材", "高速覆铜板"),
    ("PCB 与覆铜板", "金安国纪", "覆铜板与半固化片"),
    ("光芯片与光器件", "长光华芯", "半导体激光芯片"),
    ("光芯片与光器件", "太辰光", "MPO / 光纤连接器件，数据中心高密度布线"),
    ("光芯片与光器件", "腾景科技", "精密光学元件，光模块上游"),
    ("电源与供配电", "英杰电气", "工业与数据中心电源"),
    ("AI 服务器整机", "烽火通信", "旗下长江计算，昇腾超节点整机（移动集采第二）"),
    ("AI 服务器整机", "软通动力", "旗下软通计算机，昇腾整机（移动集采入围）"),
    ("AI 服务器整机", "同方股份", "服务器与信创整机"),
    ("AI 服务器整机", "智微智能", "服务器 / 边缘算力硬件 ODM"),
    ("交换机与网络设备", "菲菱科思", "交换机 ODM，配套新华三等"),
    ("光模块与 CPO", "长芯博创", "光模块与光器件（原博创科技）"),
    ("光模块与 CPO", "联特科技", "高速光模块，海外数通客户"),
    ("光模块与 CPO", "德科立", "光收发模块与光放大器"),
    ("高速连接与铜缆", "意华股份", "通信连接器与高速铜缆组件"),
    ("高速连接与铜缆", "鼎通科技", "通信与高速背板连接器"),
    ("液冷温控", "格力电器", "机房空调与冷板式液冷（联通集采份额第一）"),
    ("液冷温控", "川润股份", "液冷管路与温控设备"),
    ("液冷温控", "银轮股份", "热管理模块，切入液冷"),
    ("光纤光缆", "永鼎股份", "光纤光缆与光模块"),
    ("IDC / 智算中心", "城地香江", "IDC 建设与运营"),
    ("IDC / 智算中心", "南兴股份", "旗下唯一网络，IDC 与云服务"),
    ("IDC / 智算中心", "陕建股份", "智算中心 EPC 总包（11.56 亿云境项目）"),
    ("算力租赁", "汇纳科技", "算力租赁与智算服务"),
]
SUPPLEMENT_NAMES = {c[1] for c in SUPPLEMENT}

SEG_INFO = {s[0]: (s[1], s[2]) for s in SEGMENTS}
SEG_ORDER = [s[0] for s in SEGMENTS]


# ---------------------------------------------------------------- 代码核对
def load_codes():
    stocks = json.load(open(ASHARE, encoding="utf-8"))["stocks"]
    table = {}
    for s in stocks:
        name = s["name"].replace("Ａ", "A").replace(" ", "")
        table[name] = (s["symbol"], s["code"])
    return table


def exchange_of(symbol):
    if symbol.startswith("sh"):
        return "上交所"
    if symbol.startswith("sz"):
        return "深交所"
    return "北交所"


codes = load_codes()
rows = []
for seg in SEG_ORDER:
    for s_seg, name, note in COMPANIES + SUPPLEMENT:
        if s_seg != seg:
            continue
        hit = codes.get(name)
        if not hit:
            raise RuntimeError(f"未在 A 股清单中找到：{name}")
        symbol, code = hit
        rows.append((seg, name, code, exchange_of(symbol), note, "是" if name in SUPPLEMENT_NAMES else ""))

# ---------------------------------------------------------------- 工作簿
wb = Workbook()
ws1 = wb.active
ws1.title = "环节总览"
ws2 = wb.create_sheet("企业清单")
ws3 = wb.create_sheet("行内算力客户库")
ws4 = wb.create_sheet("口径说明")

# ============================ Sheet1 环节总览
ws1.merge_cells("A1:H1")
ws1["A1"] = "算力产业链企业清单 · 环节总览"
ws1["A1"].font = FONT_TITLE
ws1["A1"].fill = FILL_TITLE
ws1["A1"].alignment = ALIGN_C
ws1.row_dimensions[1].height = 30

ws1.merge_cells("A2:H2")
ws1["A2"] = "口径：A 股（含北交所）代表性上市公司，按「上游芯片与元器件 — 中游设备与网络 — 下游算力运营」三段、16 个环节梳理；代码以 2026-09-03 A 股全量清单核对"
ws1["A2"].font = FONT_SUB
ws1["A2"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
ws1.row_dimensions[2].height = 20

HEAD1 = ["序号", "板块", "环节", "企业数", "沪市", "深市", "北交所", "环节定位"]
for i, h in enumerate(HEAD1, start=1):
    c = ws1.cell(row=3, column=i, value=h)
    c.font = FONT_HEAD
    c.fill = FILL_HEAD
    c.alignment = ALIGN_C
    c.border = BORDER
ws1.row_dimensions[3].height = 24

FIRST = 4
for i, seg in enumerate(SEG_ORDER):
    r = FIRST + i
    board, pos = SEG_INFO[seg]
    ws1.cell(row=r, column=1, value=i + 1)
    ws1.cell(row=r, column=2, value=board)
    ws1.cell(row=r, column=3, value=seg)
    ws1.cell(row=r, column=4, value=f"=COUNTIF(企业清单!$C:$C,$C{r})")
    ws1.cell(row=r, column=5, value=f'=COUNTIFS(企业清单!$C:$C,$C{r},企业清单!$F:$F,"上交所")')
    ws1.cell(row=r, column=6, value=f'=COUNTIFS(企业清单!$C:$C,$C{r},企业清单!$F:$F,"深交所")')
    ws1.cell(row=r, column=7, value=f'=COUNTIFS(企业清单!$C:$C,$C{r},企业清单!$F:$F,"北交所")')
    ws1.cell(row=r, column=8, value=pos)
    for col in range(1, 9):
        c = ws1.cell(row=r, column=col)
        c.font = FONT_BASE
        c.border = BORDER
        c.alignment = ALIGN_C if col <= 7 else ALIGN_WRAP
        if i % 2 == 1:
            c.fill = FILL_SOFT
    ws1.row_dimensions[r].height = 22

LAST = FIRST + len(SEG_ORDER) - 1
TOTAL = LAST + 1
ws1.cell(row=TOTAL, column=1, value="").fill = FILL_LIGHT
ws1.cell(row=TOTAL, column=2, value="")
ws1.cell(row=TOTAL, column=3, value="合计")
ws1.cell(row=TOTAL, column=4, value=f"=SUM(D{FIRST}:D{LAST})")
ws1.cell(row=TOTAL, column=5, value=f"=SUM(E{FIRST}:E{LAST})")
ws1.cell(row=TOTAL, column=6, value=f"=SUM(F{FIRST}:F{LAST})")
ws1.cell(row=TOTAL, column=7, value=f"=SUM(G{FIRST}:G{LAST})")
ws1.cell(row=TOTAL, column=8, value="")
for col in range(1, 9):
    c = ws1.cell(row=TOTAL, column=col)
    c.font = FONT_BOLD
    c.fill = FILL_LIGHT
    c.border = Border(left=thin_side, right=thin_side, top=Side(style="medium", color=XL_PRIMARY), bottom=thin_side)
    c.alignment = ALIGN_C if col <= 7 else ALIGN_L
ws1.row_dimensions[TOTAL].height = 24

for col, w in zip("ABCDEFGH", [6, 26, 24, 9, 8, 8, 9, 34]):
    ws1.column_dimensions[col].width = w
ws1.freeze_panes = "A4"

# ============================ Sheet2 企业清单
HEAD2 = ["序号", "板块", "环节", "企业简称", "股票代码", "交易所", "一句话定位", "本轮补充"]
for i, h in enumerate(HEAD2, start=1):
    c = ws2.cell(row=1, column=i, value=h)
    c.font = FONT_HEAD
    c.fill = FILL_HEAD
    c.alignment = ALIGN_C
    c.border = BORDER
ws2.row_dimensions[1].height = 24

for idx, (seg, name, code, exch, note, added) in enumerate(rows, start=1):
    r = idx + 1
    board = SEG_INFO[seg][0]
    ws2.cell(row=r, column=1, value=idx)
    ws2.cell(row=r, column=2, value=board)
    ws2.cell(row=r, column=3, value=seg)
    ws2.cell(row=r, column=4, value=name)
    cc = ws2.cell(row=r, column=5, value=code)
    cc.number_format = "@"
    ws2.cell(row=r, column=6, value=exch)
    ws2.cell(row=r, column=7, value=note)
    ws2.cell(row=r, column=8, value=added)
    for col in range(1, 9):
        c = ws2.cell(row=r, column=col)
        c.font = FONT_BASE
        c.border = BORDER
        c.alignment = ALIGN_C if col in (1, 5, 6, 8) else (ALIGN_WRAP if col == 7 else ALIGN_L)
        if idx % 2 == 0:
            c.fill = FILL_SOFT
    if added:
        ws2.cell(row=r, column=8).font = FONT_BOLD
    ws2.row_dimensions[r].height = 22

N2 = len(rows) + 1
for col, w in zip("ABCDEFGH", [6, 26, 24, 14, 11, 9, 48, 10]):
    ws2.column_dimensions[col].width = w
ws2.freeze_panes = "A2"
ws2.auto_filter.ref = f"A1:H{N2}"

# ============================ Sheet3 行内算力客户库
ai = json.load(open(AI_JSON, encoding="utf-8"))
clients = [c for c in ai["companies"] if c.get("secondaryIndustry") == "AI 算力基础设施"]

HEAD3 = ["序号", "企业全称", "细分环节", "是否上市", "省份", "城市"]
for i, h in enumerate(HEAD3, start=1):
    c = ws3.cell(row=1, column=i, value=h)
    c.font = FONT_HEAD
    c.fill = FILL_HEAD
    c.alignment = ALIGN_C
    c.border = BORDER
ws3.row_dimensions[1].height = 24

for idx, comp in enumerate(clients, start=1):
    r = idx + 1
    region = comp.get("region") or {}
    listed = "是" if "上市企业" in (comp.get("tags") or []) else "否"
    ws3.cell(row=r, column=1, value=idx)
    ws3.cell(row=r, column=2, value=comp.get("name", ""))
    ws3.cell(row=r, column=3, value=comp.get("sector") or comp.get("tertiarySector") or "")
    ws3.cell(row=r, column=4, value=listed)
    ws3.cell(row=r, column=5, value=region.get("province", ""))
    ws3.cell(row=r, column=6, value=region.get("city", ""))
    for col in range(1, 7):
        c = ws3.cell(row=r, column=col)
        c.font = FONT_BASE
        c.border = BORDER
        c.alignment = ALIGN_C if col in (1, 4) else (ALIGN_L if col == 2 else ALIGN_WRAP)
        if idx % 2 == 0:
            c.fill = FILL_SOFT

N3 = len(clients) + 1
for col, w in zip("ABCDEF", [6, 46, 18, 9, 12, 14]):
    ws3.column_dimensions[col].width = w
ws3.freeze_panes = "A2"
ws3.auto_filter.ref = f"A1:F{N3}"

# ============================ Sheet4 集采与供应链依据
ws_ev = wb.create_sheet("集采与供应链依据")
EVIDENCE = [
    (
        "中国移动",
        "2026—2027 年人工智能超节点设备集中采购（6,208 张 AI 加速卡 / 776 套，合计约 20.6 亿元）",
        "2026-04",
        "河南昆仑 27.78%、武汉长江计算 22.22%、四川华鲲振宇 19.44%、宝德计算机 16.67%、浙江华启智慧 13.89%",
        "烽火通信（长江计算）、高新发展（华鲲振宇）",
        "AI 服务器整机",
        "三大运营商首次集团级 AI 超节点集采，五家全部为昇腾 CANN 生态，说明国产芯片路线在运营商侧已成主流供给",
    ),
    (
        "中国移动",
        "人工智能通用计算设备（推理型）集采约 7,058 台、超 50 亿元，另补充采购 441 台",
        "2025—2026",
        "类 CUDA 标包：中兴通讯、新华三、浪潮；CANN 标包：河南昆仑、华鲲振宇、长江计算、宝德、软通计算机、华启智慧",
        "中兴通讯、紫光股份（新华三）、浪潮信息、烽火通信、高新发展、软通动力",
        "AI 服务器整机",
        "两类生态分标包竞争，传统服务器厂与昇腾整机厂均需覆盖；软通动力由此进入清单",
    ),
    (
        "中国联通",
        "2026 年机房空调集中采购（超 2 亿元）",
        "2026",
        "格力（份额第一）",
        "格力电器",
        "液冷温控",
        "家电系厂商以价格与渠道优势切入数据中心温控，是温控环节新增竞争者，值得单独建客户关系",
    ),
    (
        "南方电网电算科技（广东）",
        "数据中心冷板式液冷系统设备制造（公开谈判）",
        "2026-07",
        "广州酷领科技（未上市）",
        "—",
        "液冷温控",
        "电网系自建智算中心已进入设备采购期；中标方为中小厂商，属“未上市但已在链上”的典型客户",
    ),
    (
        "浪潮集团（宁夏项目）",
        "液冷二次侧不锈钢预制化管道 + 冷板式 CDU 设备采购",
        "2026-02",
        "北京奕信通科技（未上市）",
        "—",
        "液冷温控",
        "液冷配套（管路、CDU）存在大量非上市供应商，授信尽调与获客需下沉到这一层",
    ),
    (
        "陕建股份（上市公司公告）",
        "云境智算中心项目（EPC），甘肃白银景泰",
        "2026-07",
        "陕西建工第十六建设有限公司，中标 11.56 亿元",
        "陕建股份",
        "IDC / 智算中心",
        "智算中心建设需求外溢到建筑工程类企业，EPC 总包是新的授信切入点",
    ),
    (
        "中国移动",
        "400G OTN 设备集中采购（2,264 个端口，省域新建）",
        "2026-10",
        "光传输设备商（多厂商份额制）",
        "中兴通讯、烽火通信",
        "光纤光缆",
        "省域 400G 扩容是算力网络配套，拉动光传输设备与光纤光缆需求",
    ),
]

ws_ev.merge_cells("A1:H1")
ws_ev["A1"] = "集采中标与供应链依据（公开可查）"
ws_ev["A1"].font = FONT_TITLE
ws_ev["A1"].fill = FILL_TITLE
ws_ev["A1"].alignment = ALIGN_C
ws_ev.row_dimensions[1].height = 30

ws_ev.merge_cells("A2:H2")
ws_ev["A2"] = "来源：运营商采购与招标网、南方电网供应链平台、阳光采购服务平台的中标（成交）候选人公示，以及上市公司中标公告；用于验证环节归属、识别未上市但已在链上的供应商"
ws_ev["A2"].font = FONT_SUB
ws_ev["A2"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
ws_ev.row_dimensions[2].height = 20

HEAD_EV = ["序号", "采购方 / 公告主体", "项目或公告", "时间", "中标 / 入围主体（份额）", "对应上市主体", "所属环节", "对清单的意义"]
for i, h in enumerate(HEAD_EV, start=1):
    c = ws_ev.cell(row=3, column=i, value=h)
    c.font = FONT_HEAD
    c.fill = FILL_HEAD
    c.alignment = ALIGN_C
    c.border = BORDER
ws_ev.row_dimensions[3].height = 24

for i, ev in enumerate(EVIDENCE):
    r = 4 + i
    ws_ev.cell(row=r, column=1, value=i + 1)
    for j, v in enumerate(ev, start=2):
        ws_ev.cell(row=r, column=j, value=v)
    for col in range(1, 9):
        c = ws_ev.cell(row=r, column=col)
        c.font = FONT_BASE
        c.border = BORDER
        c.alignment = ALIGN_C if col in (1, 4) else ALIGN_WRAP
        if i % 2 == 1:
            c.fill = FILL_SOFT
    ws_ev.row_dimensions[r].height = 64

for col, w in zip("ABCDEFGH", [6, 20, 42, 12, 46, 26, 16, 44]):
    ws_ev.column_dimensions[col].width = w
ws_ev.freeze_panes = "A4"

# ============================ Sheet5 口径说明
ws4.merge_cells("A1:B1")
ws4["A1"] = "口径与数据说明"
ws4["A1"].font = FONT_TITLE
ws4["A1"].fill = FILL_TITLE
ws4["A1"].alignment = ALIGN_C
ws4.row_dimensions[1].height = 30

NOTES = [
    (
        "环节划分口径",
        "按算力产业链三段划分：上游为算力芯片与核心元器件（6 个环节），中游为算力设备与网络（6 个环节），下游为算力运营与服务（4 个环节），共 16 个环节。划分依据为算力从“芯片—整机—组网—机房—算力服务”的交付链条，而非申万行业分类。",
    ),
    (
        "检索路径（总纲领）",
        "本轮按五条路径交叉检索：① 招投标平台——运营商采购与招标网、南方电网供应链平台、阳光采购服务平台，以“AI 服务器 / 超节点 / 冷板式液冷 / CDU / 智算中心 EPC”为词检索中标公示；② 上市公司公告——重大项目中标公告与年报业务构成；③ 工商关键词 + 行业分类——经营范围含“光模块 / 服务器 / 数据中心 / 液冷 / 覆铜板”，行业落在 C39 计算机通信电子、C38 电气机械；④ 供应链披露——由集采中标名录反查上市主体与子公司关系；⑤ 行业协会与第三方榜单——光模块、通信设备行业榜单用于交叉验证。",
    ),
    (
        "本轮检索结果",
        f"新增 {len(SUPPLEMENT)} 家，清单由 96 家扩至 {len(rows)} 家（企业清单“本轮补充”列标注为“是”）。其中由招投标 / 公告直接确认的有 5 家：烽火通信（长江计算）、高新发展（华鲲振宇）、软通动力（软通计算机）、格力电器、陕建股份；其余按主营构成与行业榜单补充。",
    ),
    (
        "招投标路径的独有发现",
        "仅靠上市公司筛选会漏掉一批已在实际供货的主体：河南昆仑、宝德计算机、浙江华启智慧、广州酷领科技、北京奕信通科技均为未上市企业，但在运营商超节点集采、冷板式液冷采购中已中标。这类主体是授信与获客的增量空间，建议单列跟踪。",
    ),
    (
        "未纳入的重要主体",
        "华为（昇腾 / 鲲鹏）、英伟达、AMD、英特尔为海外或非 A 股上市；壁仞科技、燧原科技、天数智芯、超聚变、索尔思光电等尚未上市或不在 A 股。这些主体在国内算力供给中权重很高，做行业判断时不应因清单未列而忽略。",
    ),
    (
        "代码与名称核对",
        "股票代码、交易所均由本地 A 股全量清单（2026-09-03 快照，5,554 只）逐条比对生成，非人工录入；企业简称已按该清单校正（如“北京君正”现名“君正股份”、“博创科技”现名“长芯博创”）。若后续发生更名或转板，以交易所公告为准。",
    ),
    (
        "定位说明的性质",
        "“一句话定位”为业务速览，用于快速判断企业在链条中的位置，不构成对其市占率、技术水平的量化评价，也不构成投资建议；涉及份额、排名类表述需以最新年报或第三方数据复核。集采份额为公示口径，项目执行中可能调整。",
    ),
    (
        "行内算力客户库口径",
        f"「行内算力客户库」页签取自项目 AI 产业链数据中“AI 算力基础设施”二级分类，共 {len(clients)} 家（AI 算力硬件 484 / AI 算力服务 324 / AIDC 投资运营 88），为企业客户全称，含未上市与中小客户，与本表 {len(rows)} 家上市公司清单口径不同，两者未做一一对应。",
    ),
    (
        "使用建议",
        "① 看行业结构用「环节总览」；② 做客户营销与授信准入用「企业清单」按环节筛选，并优先看“本轮补充=是”；③ 验证某家企业是否真的在链上、量级多大，用「集采与供应链依据」查公示；④ 找行内存量客户与产业链的对应关系，用「行内算力客户库」交叉比对。",
    ),
]
for i, (k, v) in enumerate(NOTES, start=3):
    a = ws4.cell(row=i, column=1, value=k)
    b = ws4.cell(row=i, column=2, value=v)
    a.font = FONT_BOLD
    a.fill = FILL_LIGHT
    a.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    a.border = BORDER
    b.font = FONT_BASE
    b.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    b.border = BORDER
    lines = max(1, -(-len(v) // 44))
    ws4.row_dimensions[i].height = max(34, lines * 16 + 10)

ws4.column_dimensions["A"].width = 22
ws4.column_dimensions["B"].width = 96
ws4.freeze_panes = "A3"

# 页签顺序：总览 → 清单 → 集采依据 → 行内客户库 → 口径说明
wb.move_sheet(ws_ev, offset=-2)

wb.properties.title = TITLE
wb.save(OUT_XLSX)
print(f"saved: {OUT_XLSX}")
print(f"segments={len(SEG_ORDER)} companies={len(rows)} clients={len(clients)}")
