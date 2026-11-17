"""问答编排：意图路由 → 调工具取数 → 模板生成回答。

原则：回答里的每个数字都来自 tools 的查询结果，由确定性模板组装，不接入大模型。
"""

from __future__ import annotations

import re
import time

import tools

STATS_STRONG = ["多少家", "几家", "总数", "规模", "上市", "占比", "分布", "覆盖", "家数"]
TIER_WORDS = ["头部", "腰部", "尾部", "分层", "打标", "龙头", "骨干", "长尾"]
METHOD_WORDS = [
    "怎么建",
    "如何建",
    "建链",
    "六步",
    "方法论",
    "流程",
    "采集",
    "去重",
    "归属",
    "骨架",
    "步骤",
    "怎么来",
]
KNOWLEDGE_WORDS = [
    "是什么",
    "什么是",
    "介绍",
    "概念",
    "为什么",
    "区别",
    "趋势",
    "政策",
    "模式",
    "收益",
    "原理",
    "怎么理解",
    "背景",
]
FILLER_WORDS = [
    "请问",
    "帮我",
    "查一下",
    "查查",
    "看一下",
    "介绍一下",
    "属于",
    "哪个",
    "哪些",
    "什么",
    "怎么",
    "如何",
    "是否",
    "这家",
    "公司",
    "企业",
    "环节",
    "产业链",
    "产业",
    "在",
    "的",
    "吗",
    "呢",
    "呀",
    "有",
    "是",
    "和",
    "与",
    "及",
]
GENERIC_ENTITIES = {
    "储能",
    "算力",
    "集成电路",
    "生物医药",
    "人工智能",
    "电力装备",
    "新能源",
    "电池",
    "芯片",
    "产业链",
    "企业",
}


def industry_label(code: str) -> str:
    conn = tools.connect()
    row = conn.execute("select label from industry where code = ?", (code,)).fetchone()
    conn.close()
    return row["label"] if row else code


def _window(code: str) -> str:
    conn = tools.connect()
    row = conn.execute(
        "select imported_at, company_count from industry where code = ?", (code,)
    ).fetchone()
    conn.close()
    if not row:
        return ""
    return f"{row['imported_at'][:10]} · {row['company_count']:,} 家入库"


def _pct(part: int, total: int) -> str:
    if not total:
        return "0%"
    value = part / total * 100
    return f"{value:.1f}%" if value < 10 else f"{value:.0f}%"


def _strip_md(text: str) -> str:
    lines = []
    for line in (text or "").splitlines():
        stripped = re.sub(r"^[#>\-\*\s]+", "", line).replace("**", "").strip()
        if stripped:
            lines.append(stripped)
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def _clip(text: str, size: int = 110) -> str:
    text = _strip_md(text)
    return text if len(text) <= size else text[: size - 1] + "…"


def _tier_line(tiers: dict) -> str | None:
    head = tiers.get("龙头") or tiers.get("头部")
    waist = tiers.get("骨干") or tiers.get("腰部")
    tail = tiers.get("长尾") or tiers.get("尾部")
    if head is None and waist is None and tail is None:
        return None
    total = sum(value or 0 for value in (head, waist, tail))
    return (
        f"分层打标：头部（龙头）{tools.fmt(head or 0)} 家、"
        f"腰部（骨干）{tools.fmt(waist or 0)} 家、尾部（长尾）{tools.fmt(tail or 0)} 家，"
        f"合计 {tools.fmt(total)} 家"
    )


def _stats_block(code: str, result: dict | None = None) -> dict:
    result = result or tools.chain_stats(code)
    facts = (result.get("facts") or [{}])[0]
    label = facts.get("industry") or industry_label(code)
    total = facts.get("total") or 0
    listed = facts.get("listed") or 0
    full = tools.distribution(code)
    listed_dist = tools.distribution(code, listed_only=True)

    bullets = [
        f"共入库 {tools.fmt(total)} 家企业，其中上市企业 {tools.fmt(listed)} 家（占 {_pct(listed, total)}）。"
    ]
    if full:
        bullets.append(
            "全量按主环节："
            + "、".join(f"{item['name']} {tools.fmt(item['count'])}" for item in full)
            + "。"
        )
    if listed_dist:
        bullets.append(
            f"上市企业 {tools.fmt(listed)} 家的环节分布："
            + "、".join(f"{item['name']} {tools.fmt(item['count'])}" for item in listed_dist)
            + "。"
        )
    tier = _tier_line(facts.get("tiers") or {})
    if tier:
        bullets.append(tier + "（分层目前只覆盖上市企业）。")
    bullets.append(f"链上已梳理上市企业关系 {tools.fmt(facts.get('relations') or 0)} 条。")

    return {
        "lead": f"「{label}」当前数据口径如下：",
        "bullets": bullets,
        "citations": result.get("citations", []),
        "facts": facts,
    }


def _tier_block(code: str, result: dict | None = None) -> dict:
    result = result or tools.chain_stats(code)
    facts = (result.get("facts") or [{}])[0]
    tiers = facts.get("tiers") or {}
    line = _tier_line(tiers)
    if not line:
        return {
            "lead": f"「{industry_label(code)}」还没有产出头/腰/尾分层数据。",
            "bullets": ["分层需要行业排名、上市公司名单与规模数据，当前先完成环节归属与关系梳理。"],
            "citations": [],
            "facts": [],
        }
    return {
        "lead": f"「{facts.get('industry') or industry_label(code)}」的分层口径：",
        "bullets": [
            line + "。",
            "判定规则：头部满足任意一条——行业排名靠前、上市公司、龙头企业、国家级名单企业、收入规模较大、有大量项目案例；腰部看稳定业务与区域知名度；尾部兜底给小规模、初创或仅具备相关经营范围的企业。",
            "同时设了硬门槛，避免「大而不强」被误判进头部。",
            f"当前已完成的是 {tools.fmt(facts.get('listed') or 0)} 家上市企业的打标，非上市企业随数据接入补齐。",
        ],
        "citations": [{"kind": "data", "id": f"industry:{code}", "label": "分层结果"}],
        "facts": tiers,
    }


def _company_block(code: str, hits: dict) -> dict:
    items = hits.get("facts") or []
    bullets = []
    for item in items[:2]:
        head = f"「{item['name']}」属于「{item.get('chain') or '—'}」"
        if item.get("sector"):
            head += f" / {item['sector']}"
        listed_text = "上市企业"
        if item.get("listed") and item.get("stockCode"):
            listed_text += f"（{item['stockCode']}）"
        head += "。" + (listed_text if item.get("listed") else "非上市企业")
        bullets.append(head + "。")
        if item.get("region"):
            bullets.append(f"所在地：{item['region']}。")
        if item.get("products"):
            bullets.append(f"主营产品：{_clip(item['products'], 80)}。")
        if item.get("keyStatus") == "pending_credit_code":
            bullets.append("主键状态：尚未登记统一社会信用代码，当前用待补标识占位。")
        neighbors = tools.graph_neighbors(item["key"], limit=5).get("facts") or []
        if neighbors:
            sample = "、".join(
                f"{'→' if n['direction'] == 'out' else '←'}{n['counterparty']}（{n['type']}）"
                for n in neighbors[:4]
            )
            bullets.append(f"链上关系：{sample}。")
    return {
        "lead": f"在「{industry_label(code)}」链里查到 {len(items)} 家匹配企业：",
        "bullets": bullets,
        "citations": hits.get("citations", []),
        "facts": items,
    }


METHOD_STEPS = [
    "① 拆解环节骨架：按上中下游切一级环节，再细化二级环节，口径对齐权威研报与协会名单。",
    "② 四类渠道采集：权威名单优先，再用招标公告反推、资本市场披露反推、工商关键词补齐长尾。",
    "③ 去重与主体对齐：以统一社会信用代码唯一登记，别名、简称、曾用名归并到同一主体。",
    "④ 环节归属：按主营业务进入唯一主环节，跨环节经营的企业保留多标签。",
    "⑤ 头腰尾打标：简单规则加硬门槛，避免复杂评分与「大而不强」误判。",
    "⑥ 形成图谱：环节、分层、供应与股权关系一屏可查，并落到地理版图上逐级下钻。",
]


def _method_block(code: str, question: str) -> dict:
    hits = tools.search_docs(question, code=code, limit=3)
    docs = hits.get("facts") or []
    citations = [
        {"kind": "doc", "id": c["id"], "label": c["label"]}
        for c in hits.get("citations", [])
        if any(step_key in c["label"] for step_key in ("逻辑", "获取", "归类", "判断", "骨架"))
    ][:2]
    return {
        "lead": "平台建链用的是六步法，储能链就是这么跑出来的：",
        "bullets": METHOD_STEPS,
        "citations": citations or hits.get("citations", [])[:1],
        "facts": docs,
    }


def _knowledge_block(question: str) -> dict:
    hits = tools.knowledge_lookup(question, limit=2)
    facts = hits.get("facts") or []
    bullets = [f"{item['title']}：{item['text']}" for item in facts]
    return {
        "lead": "补充一段链外常识：",
        "bullets": bullets,
        "citations": hits.get("citations", []),
        "facts": facts,
    }


def _entity_of(question: str) -> str:
    cleaned = question
    for word in sorted(FILLER_WORDS + TIER_WORDS + STATS_STRONG, key=len, reverse=True):
        cleaned = cleaned.replace(word, "")
    cleaned = re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", cleaned)
    return cleaned


def _lookup_company(code: str, question: str) -> dict:
    hits = tools.company_in_question(code, question)
    if hits.get("facts"):
        return hits
    entity = _entity_of(question)
    if 3 <= len(entity) <= 20 and entity not in GENERIC_ENTITIES:
        return tools.company_lookup(code, entity, limit=2)
    return hits


def answer(question: str, code: str = "ES") -> dict:
    started = time.time()
    text = (question or "").strip()
    if not text:
        return {
            "answer": "您可以问我链上有多少企业、某个环节有哪些公司，或者某个企业属于哪个环节。",
            "bullets": [],
            "note": "",
            "citations": [],
            "route": "空问题",
            "latencyMs": 0,
        }

    has = lambda words: any(word in text for word in words)  # noqa: E731
    company_hits = _lookup_company(code, text)
    wants_tier = has(TIER_WORDS)
    wants_stats = has(STATS_STRONG)
    wants_method = has(METHOD_WORDS)
    wants_knowledge = has(KNOWLEDGE_WORDS)

    blocks: list[dict] = []
    routes: list[str] = []
    stats = tools.chain_stats(code)

    if company_hits.get("facts"):
        blocks.append(_company_block(code, company_hits))
        routes.append("企业定位")
    if wants_tier:
        blocks.append(_tier_block(code, stats))
        routes.append("分层口径")
    if wants_stats:
        blocks.append(_stats_block(code, stats))
        routes.append("链内数据")
    if wants_method:
        methods = _method_block(code, text)
        if methods["facts"]:
            blocks.append(methods)
            routes.append("方法论文档")
    if wants_knowledge:
        knowledge = _knowledge_block(text)
        if knowledge["facts"]:
            blocks.append(knowledge)
            routes.append("链外常识")
    if not blocks:
        if re.search(
            r"产业|链|环节|企业|公司|行业|上市|储能|算力|集成电路|芯片|电池|人工智能|生物医药|电力装备",
            text,
        ):
            blocks.append(_stats_block(code, stats))
            routes.append("链内数据")
        else:
            return {
                "answer": (
                    f"这个问题我暂时没有把握。我能回答「{industry_label(code)}」链内的规模与结构、"
                    "环节分布、企业归属与关系，也能补充一些公开的行业常识。"
                ),
                "bullets": [
                    "可以换个问法，例如「哪个环节企业最多」「某家企业在哪个环节」。",
                    "涉及未入库企业或最新财报，建议以原始来源为准。",
                ],
                "note": "",
                "citations": [],
                "route": "未命中",
                "latencyMs": int((time.time() - started) * 1000),
            }

    window = _window(code)
    citations: list[dict] = []
    for block in blocks:
        for citation in block["citations"]:
            if citation not in citations:
                citations.append(citation)

    bullets: list[str] = []
    for block in blocks:
        bullets.extend(block["bullets"])

    answer_text = blocks[0]["lead"]

    notes = [f"数据窗口：{window}。"]
    if any(citation["kind"] == "knowledge" for citation in citations):
        notes.append("标注「链外常识」的内容不属于链内数据，仅供参考。")
    facts = (stats.get("facts") or [{}])[0]
    pending = facts.get("creditCodePending") or 0
    if pending:
        notes.append(
            f"主键口径：{tools.fmt(pending)} 家企业尚无统一社会信用代码，已用待补标识占位，导入真码后可原地升级。"
        )

    return {
        "answer": answer_text,
        "bullets": bullets,
        "note": " ".join(notes),
        "citations": citations,
        "route": " + ".join(dict.fromkeys(routes)),
        "latencyMs": int((time.time() - started) * 1000),
    }
