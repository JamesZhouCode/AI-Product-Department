"""把储能行业口径判断的补充内容写进 XMind（content.json）。

用法：python agent/xmind_scope_port.py [--apply]
默认只打印将要发生的改动；--apply 才写回（写回前自动备份）。

可重复执行：已存在的条目按标题前缀判定，不重复插入。
"""
from __future__ import annotations

import json
import shutil
import sys
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

XMIND = Path("G:/对公经营智能化项目/储能产业链/储能产业链企业识别与分层管理系统.xmind")


def T(title: str, children: list | None = None) -> dict:
    node = {"id": str(uuid.uuid4()), "title": title, "titleUnedited": False}
    if children:
        node["children"] = {"attached": children}
    return node


def kids(topic: dict) -> list:
    return (topic.get("children") or {}).get("attached") or []


def set_kids(topic: dict, children: list) -> None:
    if children:
        topic["children"] = {"attached": children}
    elif "children" in topic:
        del topic["children"]


def find(root: dict, prefix: str) -> dict | None:
    if str(root.get("title", "")).startswith(prefix):
        return root
    for child in kids(root):
        hit = find(child, prefix)
        if hit:
            return hit
    return None


def by_prefix(topic: dict, prefix: str) -> dict | None:
    for child in kids(topic):
        if str(child.get("title", "")).startswith(prefix):
            return child
    return None


def ensure_child(parent: dict, prefix: str, node: dict) -> bool:
    """按前缀去重插入，返回是否新增。"""
    if by_prefix(parent, prefix):
        return False
    set_kids(parent, kids(parent) + [node])
    return True


# --------------------------------------------------------------- 4.4 更新
B4_ITEM = "行内授信准入认定：授信申报 / 年审材料中已按储能行业准入，且能对应到具体产品、项目或客户（细则见下方 B4 采信细则）"
C4_ITEM = "仅有「行业分类 = 储能」的标签、无产品 / 项目表述的授信名单（属打标，不属认定）"
CONFLICT_NEW = "冲突优先级：公告 > 年报 > 官网 > 媒体 > 数据库标签 > 行内授信（授信与外部证据冲突时以外部可核证据为准）"

B4_RULES = [
    ("认定口径：三条同时满足才算认定",
     [
         T("① 授信主体（统一社会信用代码）在行内行业分类中归属储能"),
         T("② 授信报告 / 申报书 / 年审材料写明具体储能产品、项目或客户"),
         T("③ 授信在有效期内（近 12 个月年审通过、非冻结 / 退出户）"),
     ]),
    ("只满足 ① 的是「行业打标」→ 记 C 级，只能支撑 `related_potential`", None),
    ("主体级要求：认定必须落在该主体本身；集团客户名单、母公司行业分类不自动覆盖子公司（子公司须自身有授信认定或外部证据）", None),
    ("环节映射：认定时必须落到 1 个一级环节 + 1 个二级环节，否则只能进 `related_potential`（映射不上说明业务描述不足）", None),
    ("权重上限：B4 单条可支撑 `related_active`，但不单独支撑 `core`，也不与另一条 B 组成「2B 判 core」；判 core 仍需 1 条 A", None),
    ("抽样校验：整批采信前抽 10% 用官网 / 中标 / 年报核验，主体级实做率 ≥ 70% 整批放行；50%–70% 逐户核；< 50% 退回 C 级并重做行业分类", None),
    ("留痕字段：证据表 `source = internal_credit`，附认定日期、授信报告编号、认定环节、对应产品或项目名称、认定人，便于回溯与审计", None),
    ("实测校准（2026-10-22）：723 家授信客户中「不在 core / 已参与」的 434 家抽 8 家上网核，7 家拿到主体级证据（6 家达 A 级），仅 1 家（中钠储能技术）证据落在关联实体、主体待核 —— 缺口主要是取证缺口，不是业务否定", None),
]


def patch_b4(branch: dict) -> list[str]:
    log: list[str] = []
    sec = by_prefix(branch, "4.4")
    if not sec:
        raise SystemExit("找不到 4.4 证据分级")
    b_level = by_prefix(sec, "B 级")
    c_level = by_prefix(sec, "C 级")
    rules = by_prefix(sec, "采信规则")

    if b_level and ensure_child(b_level, "行内授信准入认定", T(B4_ITEM)):
        log.append("4.4 B 级：新增「行内授信准入认定」")
    if c_level and ensure_child(c_level, "仅有「行业分类 = 储能」", T(C4_ITEM)):
        log.append("4.4 C 级：新增「仅行业打标不算认定」")

    if rules:
        for child in kids(rules):
            if str(child.get("title", "")).startswith("冲突优先级") and child["title"] != CONFLICT_NEW:
                child["title"] = CONFLICT_NEW
                log.append("4.4 采信规则：冲突优先级补「外部可核证据 > 行内授信」")
                break

    detail = T("B4「行内授信准入认定」采信细则（2026-10-22 新增）",
               [T(title, children) for title, children in B4_RULES])
    if ensure_child(sec, "B4「行内授信准入认定」采信细则", detail):
        log.append("4.4：新增 B4 采信细则 8 条")
    return log


# --------------------------------------------------------------- 4.7 更新
SEAT_NEW = "龙头席位只从 `core` 中产生（清单 71 个龙头席位，按主体去重入库后 70 个）"
RANK_NEW = "`related_potential`、`pending_verify` 不参与任何排名"


def patch_47(branch: dict) -> list[str]:
    log: list[str] = []
    sec = by_prefix(branch, "4.7")
    if not sec:
        return log
    cross = by_prefix(sec, "交叉规则")
    if not cross:
        return log
    for child in kids(cross):
        title = str(child.get("title", ""))
        if title.startswith("头部只从") or title.startswith("龙头席位只从"):
            if title != SEAT_NEW:
                child["title"] = SEAT_NEW
                log.append("4.7：龙头席位口径 71 → 70（按主体去重）")
        elif title.startswith("`pending_verify` 不参与") or title.startswith("`related_potential`"):
            if title != RANK_NEW:
                child["title"] = RANK_NEW
                log.append("4.7：不参与排名补 `related_potential`")
    return log


# --------------------------------------------------------------- 4.12–4.17
def new_sections() -> list[dict]:
    s12 = T("4.12 现有清单能答到哪一步（字段 → 四问）", [
        T("一句话结论：问 2（环节）100% 可答，问 4（占比）只能答 9.5%，问 3（实做）清单里没有对应字段"),
        T("问 1 产品 → `主营/技术定位` + `主营摘要/主要储能产品`", [
            T("覆盖 1,364 / 2,495（54.7%）；新增 518 户全部缺失"),
            T("用法：有产品描述才可能满足 core 的「A 产品对口」；缺产品最多判 `pending_verify`"),
        ]),
        T("问 2 环节 → `一级环节` + `二级环节编码` + `环节判定依据` + `判定置信度`", [
            T("覆盖 100%，是全表最完整的一维，也是唯一能直接映射 7 / 24 环节的字段"),
            T("质量四档", [
                T("原清单 1,977：CNESA / CIAPS 名录 + 行业核对"),
                T("新增高置信 182：名称含明确业态词或已核工商 / 官网"),
                T("新增中置信 287：附件环节 + 名称语义"),
                T("新增低置信 49：名称无业态语义"),
            ]),
        ]),
        T("问 3 实做 → 清单没有客户 / 项目 / 中标 / 供货字段，只能用三类替代证据", [
            T("客户供应商关系表：906 户有链内供需对手（A 级；关系条数与对手须写进 `evidence_items`）"),
            T("名录节点（原清单 1,977）：名录本身为 B 级"),
            T("专家口径龙头 / 骨干（71 + 476）：B 级，只证明环节地位，不证明储能占比"),
        ]),
        T("问 4 占比 → `储能相关度(归一)` 仅 237 户（9.5%）：核心 125 / 相关 91 / 观察 21", [
            T("全表唯一直接回答「储能占其自身业务多大比重」的字段，只覆盖 237 户重点客户"),
        ]),
        T("三个易误用字段（必须写进口径）", [
            T("`证据强度`（强 362 / 中 188 / 弱 1,945）是行业地位的证据强度（上市 / IPO / 集团背景 / 资质），不是储能实做证据，不得当 A / B 采信"),
            T("`行业地位=长尾`（1,948）定义为「未获行业地位证据」，不是规模结论（见 8.3）"),
            T("`复核建议=需核实际主营与环节归属`（196 户）应与 `pending_verify` 对齐，不留在正常池"),
        ]),
    ])

    rules = [
        T("1. 无二级环节编码 → `pending_verify`（缺环节，问 2 未过）"),
        T("2. 相关度=核心 → `core_main`（有链内关系记 A，否则 B）"),
        T("3. 相关度=相关 → `core_related`"),
        T("4. 相关度=观察 → `related_active`"),
        T("5. 未评 + 有链内供需关系 → `related_active`（A 级；占比待补）"),
        T("6. 未评 + 行业龙头 / 骨干 → `related_active`（B 级；占比待补，龙头另标「席位待核」）"),
        T("7. 新增·低置信，或无产品且环节依据写「名称无业态词」→ `pending_verify`（缺产品 / 客户）"),
        T("8. 新增·中置信 → `pending_verify`（缺产品核实）"),
        T("9. 新增·高置信 → `related_potential`（缺订单 / 客户）"),
        T("10. 其余（原清单长尾 + 名录节点）→ `related_potential`（缺订单 / 客户）"),
        T("规则设计说明", [
            T("前 4 条用「相关度」直接定档；5–6 条用「关系 / 行业地位」兜底；7–10 条按「问 2 的置信度」分流"),
            T("未设「排除」：本批 2,495 户无一家满足 4.6 的排除条件（无壳、无注销、无纯土建），排除规则留给后续新增候选"),
            T("每条判定同时落 `scope_reason` 与 `gaps`（缺什么证据），可直接作为 4.8 字段初值"),
            T("结果是「暂定档」不是终审：core 需补 1 条 A 级证据条目、related 需补占比后才转正"),
        ]),
    ]
    s13 = T("4.13 逐户落标规则（按现有字段可执行，优先级从上到下）★", rules)

    s14 = T("4.14 首轮落标结果（2026-10-22，2,495 行 / 2,457 主体）", [
        T("五档总表（主体数 · 占比 · 证据等级构成）", [
            T("`core_main` 125 · 5.0%｜A 109 / B 16"),
            T("`core_related` 91 · 3.6%｜A 88 / B 3"),
            T("`related_active` 817 · 32.7%｜A 709 / B 108"),
            T("`related_potential` 1,213 · 48.6%｜B 1,100 / C 113"),
            T("`pending_verify` 249 · 10.0%｜C 130 / none 119"),
            T("核心合计 216 家（8.7%）；「可引用参与证据」1,033 家（41.4%），其中 A 906 / B 127"),
        ]),
        T("按来源看", [
            T("原清单 1,977：core 216 / `related_active` 661 / `related_potential` 1,100 / pending 0"),
            T("新增 518：`related_active` 156 / `related_potential` 113 / pending 249 / core 0（未做行业地位与相关度评定）"),
        ]),
        T("按环节（去重企业数 → 待核实占比）", [
            T("资源与材料 558 → 58（10.4%）"),
            T("核心电子器件 184 → 55（29.9%）★ 超阈值"),
            T("核心装备 538 → 17（3.2%）"),
            T("检测认证与标准 80 → 2（2.5%）"),
            T("电池与核心部件 1,025 → 35（3.4%）"),
            T("系统集成与工程建设 473 → 82（17.3%）★ 超阈值"),
            T("应用与运营 462 → 4（0.9%）"),
            T("★ 两处超 4.10 阈值（15%）：节点主要靠名称 / 附件推定，须先人工核经营范围再定档"),
            T("注：此处为按一级环节去重口径，与 03 表「按环节计」（同环节多二级会重复计）不同"),
        ]),
        T("三句结论", [
            T("可对外称「已参与储能」的是 1,033 家（41.4%），其中核心 216 家（8.7%）"),
            T("1,213 家只是「产品对口」，不能说已参与；其中 1,100 家仅有名录级证据"),
            T("249 家连产品都没核，集中在系统集成 82 + 核心电子器件 55"),
        ]),
        T("明细文件：`储能产业链-口径落标-2026-10-22.csv`（2,495 行，含 scope / evidence / reason / gaps，可用于抽查与回填）"),
        T("缺口分布（按 gaps 列计，一户可多项）：缺订单 / 客户 1,100｜缺占比与分部收入 694｜缺证据条目落库 216｜缺产品 249（其中 119 户产品、客户、项目全缺）"),
    ])

    s15 = T("4.15 与现有清单的四处冲突及处置", [
        T("冲突 1：龙头席位与 core 口径打架（11 家）", [
            T("现象：71 个席位里 11 家不在 core —— 云天化、兴发（相关度=观察）｜海辰储能、远景能源、远景动力、楚能新能源、融科储能、双登集团、索英电气、英博电气、青鸟消防（相关度=未评）"),
            T("原因：龙头 = 环节地位（专家口径），core = 储能占其收入比重，两个维度本就会错位"),
            T("处置（二选一，建议 a）", [
                T("a. 龙头席位改称「环节龙头（地位）」，与口径类型解耦，允许 `related_active` 保留席位并加角标"),
                T("b. 坚持 4.7 强约束，则这 11 家全部列 P0 补占比，补齐前暂不发布龙头榜单"),
            ]),
        ]),
        T("冲突 2：相关度只覆盖 9.5%，是最大堵点", [
            T("2,258 户答不了问 4，只能落在 potential / pending，导致「潜在供应」占近一半"),
            T("处置：先回填 906 户有链内关系主体的储能占比（可用供货金额结构 / 客户行业构成近似），再按环节抽样推进"),
        ]),
        T("冲突 3：`证据强度` 字段名有歧义", [
            T("强 362 / 中 188 是行业地位证据（上市、IPO、集团背景），与储能实做无关"),
            T("处置：字段改名 `行业地位证据强度`；口径文档 4.4 显式声明不得用作实做证据"),
        ]),
        T("冲突 4：新增 518 户「长尾」不是规模结论", [
            T("长尾 = 未获行业地位证据，其中确有龙头（4.9 已举例）"),
            T("处置：对外分层分「长尾（已核）/ 长尾（未核）」，或直接标「待分层」，不并入尾部"),
        ]),
    ])

    s16 = T("4.16 补证优先级与工作量", [
        T("P0｜216 家 core + 11 家冲突龙头（1–2 周）：全部 core 把 1 条 A / B 级证据原文落库（16 家 `core_main` 目前只有 B 级，须补 A）；11 家龙头补占比 → core 由暂定转终审"),
        T("P1｜817 家（按环节分批）：回填储能占比，顺序 电池 351 → 应用 183 → 资源 171 → 装备 169 → 集成 160 → 电子 54 → 检测 37"),
        T("P2｜249 家：补产品与客户，优先 系统集成 82 + 核心电子器件 55（这两处名称判定最不可靠）"),
        T("P3｜1,213 家 × 10% 抽样（121 家）：核订单 / 客户，校准「名录内=潜在」假设；若抽样实做率 > 30%，须回改 4.13 第 10 条"),
        T("批量路径：先用 B4（行内授信准入认定）覆盖授信材料齐备的主体（723 家授信客户中 362 家新增客户），再对无授信认定的走官网案例 / 中标抓取；每批按 4.4 抽 10% 校验通过后才批量升档"),
        T("每批补证后重跑落标规则，落 `scope_version`（v1 = 2026-10-22 首轮；v2 = 引入 B4 后的批次）"),
    ])

    s17 = T("4.17 对外表述模板（防口径被拉高）", [
        T("完整版：储能产业链在链 2,457 个主体（2,495 行）——核心企业 216 家（核心主业 125 / 核心业务之一 91）、关联·已参与 817 家、关联·潜在供应 1,213 家、待核实 249 家；另有 71 个环节龙头席位"),
        T("禁用说法", [
            T("「2,457 家储能企业」——把关联与待核实一并算作储能企业"),
            T("「龙头 71 家」——不注明是「环节地位」口径，易被理解为储能收入龙头"),
        ]),
        T("分层引用：「龙头 71 / 骨干 476 / 长尾 1,948（长尾 = 未获行业地位证据，非规模判定）」"),
    ])
    return [s12, s13, s14, s15, s16, s17]


# --------------------------------------------------------------- 4.18 上游边界
def upstream_section() -> dict:
    return T("4.18 上游边界界定（近三年实际产量口径）★", [
        T("4.18.1 一句话口径", [
            T("上游主体入不入链，只看「近三年该主体自身产出的储能必需物料是否达到实际生产规模」，不看名称、经营范围、储量宣传"),
            T("矿石类举例：不看他是不是「锂业 / 矿业」，看他 2023–2025 年实际采出并销售的锂精矿（折 LCE）有多少吨"),
            T("与 4.1 的关系：这是「先产品后名称」「先实做后潜力」在上游的落地 —— 上游的「实做」就是产量，不是客户 / 中标"),
            T("产量为零但有储量、有规划产能、有探矿权的，一律不算入链依据（见 4.18.8）"),
        ]),
        T("4.18.2 适用范围", [
            T("全额适用：01-1 矿产资源与化工原料（矿产品、锂盐等化工原料）"),
            T("部分适用：01-2 电池主材与辅材（用产能 / 产量 / 出货量）、01-3 回收与循环利用（用处理量 / 再生量）"),
            T("参考适用：02-1 器件（出货量）、03-1/2/3 装备（交付台套、MW/MWh）、04-1 检测（报告份数、CNAS 项目数）"),
            T("不适用：中下游 05–07（用客户 / 项目 / 中标口径，见 4.13）"),
        ]),
        T("4.18.3 判据主键：三年产量", [
            T("时间窗：2023、2024、2025 三个完整年度 + 2026H1 作趋势校验（H1 不与三年平均混算）"),
            T("计量：实物量优先；锂按 LCE 折算（6% 锂精矿约 8 吨折 1 吨 LCE，以企业年报披露口径为准，不跨口径硬换）"),
            T("权益口径：用权益产量（按持股比例）；参股不并表须单独标注，不得并入集团合并产量"),
            T("产出定义：实际采出 / 生产并实现销售或自用投料；试产、检修停产、代加工须单列，不得计入正常产量"),
            T("必填：品种、三年产量、设计产能、产能利用率、销量、权益比例、来源等级"),
        ]),
        T("4.18.4 判定路径（矿石公司六问，前一问不过不进下一问）★", [
            T("问 1 主体身份：是否采矿 / 选矿 / 冶炼主体（有采矿权证，或自有矿 + 选厂）？", [
                T("否 → 走 4.13 通用规则（贸易、设备、服务各归其位）"),
            ]),
            T("问 2 矿种是否在储能必需清单内？（锂 / 磷 / 钒 / 镍 / 钴 / 锰 / 石墨 / 萤石）", [
                T("不在 → 不入链：铁、铜、铝、锌、铅、钼、钨、稀土、钛、铬等通用或非储能专用金属矿"),
                T("其加工品（铜箔 / 铝箔 / 磷酸铁 / 稀土正极）另按 01-2 判，不能拿矿山主体算上游"),
            ]),
            T("问 3 近三年是否有实际产量（>0 且有销售或出库）？", [
                T("无 → 待核实（仅探矿权 / 建设期）或 不入链（连续停产 ≥2 年）"),
            ]),
            T("问 4 是否达到实质经营？（连续两年有产出 且 近三年年均产能利用率 ≥30%）", [
                T("否 → `related_potential`（有产出但不稳定）或 `pending_verify`"),
            ]),
            T("问 5 产出品种能否进入储能链条？（锂→正极→电芯；磷→磷酸铁；钒→钒电解液；石墨→负极；锰→锰酸锂 / LMFP；镍钴→三元）", [
                T("能 → 入链，按 4.18.5 分档"),
                T("只能进入非储能用途（磷矿以磷肥为主、锂盐以玻璃陶瓷为主）→ `related_active`，不得判 core"),
            ]),
            T("问 6 规模分档与席位 → 见 4.18.5、4.18.6"),
        ]),
        T("4.18.5 分矿种产量参照表（2024 年全国产量作分母）", [
            T("锂：碳酸锂 70.1 万吨 + 氢氧化锂 41.4 万吨 + 氯化锂 2.4 万吨（中国有色金属工业协会锂业分会）"),
            T("磷矿：11,352.79 万吨（国家统计局；设计产能 19,447 万吨 / 年、有效产能 11,916 万吨 / 年）"),
            T("钒、镍、钴、锰、石墨：按 USGS / 中国有色金属工业协会口径补录，同步落 `output_2024` 基数表"),
            T("分档（近三年年均产量 ÷ 全国同年产量）", [
                T("≥5% → 龙头席位候选"),
                T("1%–5% → 骨干"),
                T("0.1%–1% → 长尾"),
                T("<0.1% → 关联 / 待核实"),
            ]),
            T("绝对量下限（防小品种份额虚高）：锂盐 ≥0.5 万吨 LCE / 年；磷矿 ≥50 万吨 / 年；钒 ≥0.2 万吨 V2O5；石墨 ≥2 万吨；镍钴锰 ≥1 万吨金属量"),
            T("算例：年均 1.2 万吨 LCE ÷ 全国约 110 万吨 LCE ≈ 1.1% → 骨干；0.15 万吨 ≈ 0.14% → 长尾"),
        ]),
        T("4.18.6 产量 → 分层与席位", [
            T("龙头席位：份额 ≥5% 且 连续三年有产出 且 有自有矿（或矿化一体长协保障）"),
            T("骨干：份额 1%–5% 且 连续两年有产出"),
            T("长尾：份额 0.1%–1%（含无自有矿的代加工锂盐厂）"),
            T("关联：份额 <0.1%、仅试产、仅尾矿回收"),
            T("产量不达标者不得占龙头席位，即使清单「行业地位 = 龙头」（同 4.15 冲突 1 的处理逻辑）"),
            T("与 4.7 并行：上游的「实做」以产量计，core 仍需 4.2 的产品对口 + 产量证据双满足"),
        ]),
        T("4.18.7 证据来源与采信", [
            T("A 级", [
                T("年报「主要产品产量 / 销量」表、季度经营数据公告"),
                T("自然资源部储量核实备案、采矿权出让与许可公告"),
                T("国家统计局、地方工信厅 / 统计局产量统计"),
            ]),
            T("B 级", [
                T("行业协会统计：锂业分会、无机盐协会锂盐分会、磷复肥协会、钒钛协会"),
                T("SMM / 百川盈孚 / 钢联、券商深度报告的产量表"),
                T("公司官网投资者关系页、业绩说明会材料"),
            ]),
            T("C 级：新闻稿、调研纪要、招聘信息、展会资料"),
            T("行内交叉验证（只用于校验，不单独定档）", [
                T("用电量 / 变压器容量：按矿种单耗区间反推产量"),
                T("增值税发票品名与数量、产销存报表"),
                T("采矿权证载规模与实际开采量比对，可识别超采与欠采"),
                T("海关进出口：锂精矿进口量、锂盐出口量"),
                T("运输单据（铁路 / 港口发运量）、炸药与选矿药剂采购量"),
            ]),
            T("采信规则：1 条 A 或 2 条 B；内部数据与 A 级公开数据冲突时以公开为准"),
        ]),
        T("4.18.8 排除与降级（上游专用）", [
            T("只有探矿权 / 规划产能 / 储量宣传，无实际产量 → 不入链（在建项目可放 `pending_verify`）"),
            T("连续两年停产、破产重整、矿权被收回 → 出库并留变更记录"),
            T("纯贸易 / 代理（无自有矿、无加工产能）→ 标「渠道商」，不占上游席位"),
            T("通用金属矿（铁 / 铜 / 铝 / 锌 / 铅 / 钼 / 钨 / 稀土 / 钛 / 铬）→ 边界外，加工品另判 01-2"),
            T("尾矿 / 废料回收未达规模（<0.1 万吨 LCE）→ 关联"),
            T("用集团合并口径替代主体产量、参股不并表直接并入 → 虚增，须按权益产量重算"),
        ]),
        T("4.18.9 落库字段（`upstream_output`）", [
            T("`mineral_type` 品种；`output_unit` 单位（吨 / LCE / 万吨）"),
            T("`output_2023` / `output_2024` / `output_2025` / `output_2026h1`"),
            T("`capacity_design` 设计产能；`utilization` 产能利用率"),
            T("`equity_ratio` 权益比例；`output_equity` 权益产量；`sales_volume` 销量"),
            T("`output_source` 来源；`output_level` A / B / C"),
            T("`storage_use` 储能用途可及性（直接 / 间接 / 不可及）"),
            T("`scope_from_output` 产量推导结论；`output_reason` 一句话理由（必填）"),
        ]),
        T("4.18.10 现状问题：01-1 名单按产量口径的清理（2026-10-22）★", [
            T("01-1 现挂 75 家，按产量口径只有 31 家是真正的矿产 / 原料主体：A 矿产开采 25 + B 锂盐与化工原料加工 6"),
            T("其余 44 家错挂", [
                T("材料加工 14：正极（盟固利、巴莫、美特）、铜箔与铝箔（慧儒、海亮、清景、纳诺）、复合集流体（纳力、英联、金美）、镍带（东杨）、吸附剂（特丰）、萃取剂（赫普菲乐）、磷酸铁（龙佰）"),
                T("电池与装备 14：万向一二三、蜂巢能源、海四达、天能帅福得、电科电源、天弋、龙净储能电池、湖州永兴锂电池、大孚集成、中塑环保、华电科工、勘查院、智电芳华、华友能源"),
                T("边界外 11：中国铝业、铜陵有色、建龙钢铁、安宁铁钛、淮河能源、中石化南阳、统一石油化工、振华化学（铬盐）、中信金属（贸易）、金阳矿业（投资）、厦门钨业（钨主业，正极在子公司）"),
                T("待核实 5：华秦储能、泰同源、鼎隆化工、浙江安力、量道新能源"),
            ]),
            T("后果：01-1 的 75 家里只有 41% 能用产量判定，其余口径无处落地；前端环节计数（01-1 27 家 → 实际 75 家）也未与骨架对齐"),
            T("处置：按清理清单把 44 家移出后，01-1 保留 31 家；14 家材料类并入 01-2、14 家并入 05/03/06/04，同步改前端环节计数"),
            T("明细：`upstream-scope-cleanup.csv`（75 行，含分类、储能相关矿种、建议动作、行业地位、相关度）"),
        ]),
        T("4.18.11 示例（同一把尺子判四个主体）", [
            T("锂盐厂：年均 1.2 万吨 LCE、连续三年产出、有自有矿 → 份额约 1.1% → 骨干；若 0.15 万吨且纯代加工 → 长尾"),
            T("磷矿公司（云天化 / 兴发）：磷矿产量约占全国 12% / 4%（按产能口径估算，须以年报产量替换），但下游以磷肥为主 → 产量入链、储能流向占比小 → `related_active`，不判 core_main"),
            T("盐湖提锂（盐湖股份 / 藏格）：连续三年产出、产能利用率接近满产、成本低 → 龙头席位候选；伴生钾肥不单独计入储能产量"),
            T("反例：西藏珠峰（盐湖项目投产进度待核）→ 有资源无产量 → 待核实，不进龙头"),
        ]),
    ])


def patch_upstream(root: dict, branch: dict) -> list[str]:
    log: list[str] = []
    if not by_prefix(branch, "4.18 上游边界界定"):
        branch["children"]["attached"].append(upstream_section())
        log.append("分支 4 新增 4.18 上游边界界定（11 个子节）")

    # 4.11 校准补一条上游现状
    cal = by_prefix(branch, "4.11")
    if cal and not by_prefix(cal, "上游 01-1 现挂 75 家"):
        set_kids(cal, kids(cal) + [
            T("上游 01-1 现挂 75 家，按近三年产量口径仅 31 家为矿产 / 原料主体；清理与错挂分布见 4.18.10")
        ])
        log.append("4.11：补上游现状（75 → 31）")

    # 分支 3 的 01-1 节点加口径指引
    b3 = None
    for child in root["children"]["attached"]:
        if str(child.get("title", "")).startswith("3 "):
            b3 = child
            break
    if b3:
        l1 = by_prefix(b3, "3.A")
        node = by_prefix(l1, "01 资源与材料") if l1 else None
        target = by_prefix(node, "01-1") if node else None
        if target and not by_prefix(target, "边界判定：见 4.18"):
            set_kids(target, kids(target) + [
                T("边界判定：见 4.18 近三年实际产量口径；本节点现挂 75 家，仅 31 家为矿产 / 原料主体")
            ])
            log.append("分支 3 的 01-1 节点补「边界判定见 4.18」")
    return log


def main() -> None:
    apply = "--apply" in sys.argv
    if not XMIND.exists():
        raise SystemExit(f"文件不存在：{XMIND}")
    with zipfile.ZipFile(XMIND) as zf:
        entries = [(info, zf.read(info.filename)) for info in zf.infolist()]
    blobs = {info.filename: data for info, data in entries}
    sheets = json.loads(blobs["content.json"])
    root = sheets[0]["rootTopic"]

    branch = None
    for child in root["children"]["attached"]:
        if str(child.get("title", "")).startswith("4 "):
            branch = child
            break
    if not branch:
        raise SystemExit("找不到分支 4 储能行业口径判断")

    log = patch_b4(branch) + patch_47(branch) + patch_upstream(root, branch)

    existing = {str(c.get("title", ""))[:4] for c in kids(branch)}
    added = []
    for sec in new_sections():
        key = sec["title"][:4]
        if key in existing:
            continue
        branch["children"]["attached"].append(sec)
        added.append(sec["title"])
    if added:
        log.append("分支 4 新增小节：" + "、".join(a.split(" ")[0] for a in added))

    print("\n".join(log) if log else "无改动（已是最新）")
    if not apply:
        print("\n[dry-run] 加 --apply 写回")
        return

    backup = XMIND.with_name(
        f"{XMIND.stem}.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}{XMIND.suffix}"
    )
    shutil.copy2(XMIND, backup)
    blobs["content.json"] = json.dumps(sheets, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with zipfile.ZipFile(XMIND, "w", zipfile.ZIP_DEFLATED) as out:
        for info, _ in entries:
            out.writestr(info, blobs[info.filename])
    print(f"\n已写回 {XMIND}")
    print(f"备份：{backup}")


if __name__ == "__main__":
    main()
