"""问答可调用的数据工具：所有数字都从这里出，模型只负责组织语言。

每个函数返回 dict（含 facts 与 citations），answer.py 负责拼装成回答。
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

DB_FILE = Path(__file__).resolve().parent / "data" / "chain.db"
CARDS_FILE = Path(__file__).resolve().parent / "knowledge" / "cards.json"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def fmt(value) -> str:
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return str(value)


def industry_row(conn: sqlite3.Connection, code: str) -> sqlite3.Row | None:
    return conn.execute("select * from industry where code = ?", (code,)).fetchone()


def counts_of(conn: sqlite3.Connection, code: str) -> dict:
    row = industry_row(conn, code)
    if not row or not row["counts_json"]:
        return {}
    try:
        return json.loads(row["counts_json"])
    except json.JSONDecodeError:
        return {}


def chain_stats(code: str) -> dict:
    conn = connect()
    row = industry_row(conn, code)
    if not row:
        conn.close()
        return {"facts": [], "citations": [], "error": f"没有找到产业 {code}"}
    counts = counts_of(conn, code)
    # 主体可能同时属于多条链（如中兴通讯同在算力与储能链）：
    # company.industry_code 只记首次入链的产业，跨链归属一律以 company_chain_tag 为准。
    member = (
        "exists (select 1 from company_chain_tag t_ix "
        "where t_ix.company_key = c.company_key and t_ix.industry_code = :code)"
    )
    total = conn.execute(
        f"select count(*) from company c where {member}", {"code": code}
    ).fetchone()[0]
    listed = conn.execute(
        f"select count(*) from company c where {member} and c.is_listed = 1", {"code": code}
    ).fetchone()[0]
    relations = conn.execute(
        "select count(*) from relation where industry_code = ?", (code,)
    ).fetchone()[0]
    distribution = conn.execute(
        """select level1, count(distinct company_key) as n
           from company_chain_tag
           where industry_code = ? and is_primary = 1
           group by level1 order by n desc""",
        (code,),
    ).fetchall()
    conn.close()

    tiers = counts.get("headTiers") or {}
    facts = {
        "industry": row["label"],
        "total": total,
        "listed": listed,
        "relations": relations,
        "distribution": [{"name": item["level1"], "count": item["n"]} for item in distribution],
        "tiers": tiers,
        "creditCodePending": None,
    }
    conn = connect()
    facts["creditCodePending"] = conn.execute(
        f"select count(*) from company c where {member} and c.key_status = 'pending_credit_code'",
        {"code": code},
    ).fetchone()[0]
    conn.close()
    return {
        "facts": [facts],
        "citations": [{"kind": "data", "id": f"industry:{code}", "label": f"{row['label']}分片"}],
    }


def company_lookup(code: str, query: str, limit: int = 5) -> dict:
    conn = connect()
    text = query.strip()
    member = (
        "exists (select 1 from company_chain_tag t_ix "
        "where t_ix.company_key = c.company_key and t_ix.industry_code = :code)"
    )
    chain_in = (
        "(select t.level1 from company_chain_tag t where t.company_key = c.company_key "
        "and t.industry_code = :code and t.is_primary = 1 limit 1)"
    )
    sector_in = (
        "(select t.level2 from company_chain_tag t where t.company_key = c.company_key "
        "and t.industry_code = :code and t.is_primary = 1 limit 1)"
    )
    rows = conn.execute(
        f"""select c.*, {chain_in} as chain_in, {sector_in} as sector_in,
               (select group_concat(alias, '|') from company_alias a where a.company_key = c.company_key) as aliases
           from company c
           where {member}
             and (c.name = :text or c.name like :fuzzy or exists(
                   select 1 from company_alias a where a.company_key = c.company_key and a.alias like :fuzzy))
           order by case when c.name = :text then 0 else 1 end, length(c.name)
           limit :limit""",
        {"code": code, "text": text, "fuzzy": f"%{text}%", "limit": limit},
    ).fetchall()
    if not rows and len(text) >= 4:
        rows = conn.execute(
            f"""select c.*, {chain_in} as chain_in, {sector_in} as sector_in, null as aliases from company c
               where {member} and c.name like :fuzzy
               order by length(c.name) limit :limit""",
            {"code": code, "fuzzy": f"%{text}%", "limit": limit},
        ).fetchall()
    conn.close()
    if not rows:
        return {"facts": [], "citations": []}

    facts = []
    for row in rows:
        facts.append(
            {
                "name": row["name"],
                "key": row["company_key"],
                "keyStatus": row["key_status"],
                "chain": row["chain_in"] or row["chain"],
                "sector": row["sector_in"] or row["sector"],
                "listed": bool(row["is_listed"]),
                "stockCode": row["stock_code"],
                "region": " · ".join(
                    part for part in (row["province"], row["city"], row["district"]) if part
                ),
                "products": row["products"],
                "aliases": row["aliases"],
            }
        )
    citations = [
        {"kind": "company", "id": item["key"], "label": item["name"]} for item in facts
    ]
    return {"facts": facts, "citations": citations}


def list_companies(code: str, level1: str | None = None, limit: int = 10) -> dict:
    conn = connect()
    member = (
        "exists (select 1 from company_chain_tag t_ix "
        "where t_ix.company_key = c.company_key and t_ix.industry_code = :code)"
    )
    chain_in = (
        "(select t.level1 from company_chain_tag t where t.company_key = c.company_key "
        "and t.industry_code = :code and t.is_primary = 1 limit 1)"
    )
    sector_in = (
        "(select t.level2 from company_chain_tag t where t.company_key = c.company_key "
        "and t.industry_code = :code and t.is_primary = 1 limit 1)"
    )
    if level1:
        rows = conn.execute(
            f"""select c.name, {chain_in} as chain_in, {sector_in} as sector_in, c.is_listed from company c
               where {member}
                 and exists (select 1 from company_chain_tag t
                             where t.company_key = c.company_key and t.industry_code = :code
                               and t.level1 = :level1)
               order by c.is_listed desc, c.name limit :limit""",
            {"code": code, "level1": level1, "limit": limit},
        ).fetchall()
    else:
        rows = conn.execute(
            f"""select c.name, {chain_in} as chain_in, {sector_in} as sector_in, c.is_listed
                from company c where {member} order by c.is_listed desc, c.name limit :limit""",
            {"code": code, "limit": limit},
        ).fetchall()
    conn.close()
    facts = [
        {"name": row["name"], "chain": row["chain_in"], "sector": row["sector_in"], "listed": bool(row["is_listed"])}
        for row in rows
    ]
    citations = [{"kind": "data", "id": f"industry:{code}", "label": "企业名单"}]
    return {"facts": facts, "citations": citations}


def graph_neighbors(company_key: str, limit: int = 12) -> dict:
    conn = connect()
    rows = conn.execute(
        """select r.rel_type, r.from_name, r.to_name, r.from_key, r.to_key, r.source_note,
                  coalesce(f.name, r.from_name) as fname, coalesce(t.name, r.to_name) as tname
           from relation r
           left join company f on f.company_key = r.from_key
           left join company t on t.company_key = r.to_key
           where r.from_key = ? or r.to_key = ?
           limit ?""",
        (company_key, company_key, limit),
    ).fetchall()
    conn.close()
    facts = []
    for row in rows:
        outgoing = row["from_key"] == company_key
        facts.append(
            {
                "direction": "out" if outgoing else "in",
                "type": row["rel_type"],
                "counterparty": row["tname"] if outgoing else row["fname"],
                "note": row["source_note"],
            }
        )
    return {
        "facts": facts,
        "citations": [{"kind": "company", "id": company_key, "label": "关系档案"}],
    }


def _tokens(text: str) -> list[str]:
    cleaned = re.sub(r"[^\w\u4e00-\u9fff]+", " ", text)
    words = [w for w in cleaned.split() if w]
    tokens: list[str] = []
    for word in words:
        if re.search(r"[\u4e00-\u9fff]", word):
            if len(word) <= 4:
                tokens.append(word)
            for size in (2, 3, 4):
                for index in range(len(word) - size + 1):
                    tokens.append(word[index : index + size])
        elif len(word) >= 3:
            tokens.append(word.lower())
    return list(dict.fromkeys(tokens))


def search_docs(query: str, code: str | None = None, limit: int = 3) -> dict:
    conn = connect()
    rows = conn.execute(
        "select id, doc_id, chunk_no, title, content from doc_chunk where (? is null or industry_code = ? or industry_code is null)",
        (code, code),
    ).fetchall()
    conn.close()
    tokens = _tokens(query)
    scored = []
    for row in rows:
        content = row["content"] or ""
        score = 0
        for token in tokens:
            hits = content.count(token)
            if hits:
                score += hits * len(token)
        if row["title"]:
            for token in tokens:
                if token in row["title"]:
                    score += len(token) * 3
        if score:
            scored.append((score, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    facts = [
        {
            "title": row["title"],
            "docId": row["doc_id"],
            "chunkNo": row["chunk_no"],
            "excerpt": (row["content"] or "").strip()[:260],
        }
        for _, row in scored[:limit]
    ]
    citations = [
        {"kind": "doc", "id": f"{row['doc_id']}#{row['chunk_no']}", "label": f"方法论文档 · {row['title']}"}
        for _, row in scored[:limit]
    ]
    return {"facts": facts, "citations": citations}


def knowledge_lookup(query: str, limit: int = 2) -> dict:
    if not CARDS_FILE.exists():
        return {"facts": [], "citations": []}
    cards = json.loads(CARDS_FILE.read_text(encoding="utf-8"))
    scored = []
    for card in cards:
        score = 0
        for keyword in card.get("keywords", []):
            if keyword and keyword in query:
                score += len(keyword) * 2
        if card.get("title") and card["title"] in query:
            score += 10
        if score:
            scored.append((score, card))
    scored.sort(key=lambda item: item[0], reverse=True)
    if not scored:
        return {"facts": [], "citations": []}
    best = scored[0][0]
    scored = [item for item in scored if item[0] >= best * 0.6][:limit]
    facts = [
        {"title": card["title"], "text": card["text"], "source": card.get("source", "公开行业常识")}
        for _, card in scored
    ]
    citations = [
        {"kind": "knowledge", "id": card["id"], "label": card["title"]} for _, card in scored
    ]
    return {"facts": facts, "citations": citations}


def company_in_question(code: str, question: str, limit: int = 2) -> dict:
    """从自然语言问题里反查企业（企业名/别名出现在问句中）。"""
    member = (
        "exists (select 1 from company_chain_tag t_ix "
        "where t_ix.company_key = c.company_key and t_ix.industry_code = :code)"
    )
    conn = connect()
    rows = conn.execute(
        f"""select * from company c
           where {member} and length(c.name) >= 4 and :question like '%' || c.name || '%'
           order by length(c.name) desc limit :limit""",
        {"code": code, "question": question, "limit": limit},
    ).fetchall()
    if not rows:
        rows = conn.execute(
            f"""select c.* from company c
               join company_alias a on a.company_key = c.company_key
               where {member} and length(a.alias) >= 3 and :question like '%' || a.alias || '%'
               order by length(a.alias) desc limit :limit""",
            {"code": code, "question": question, "limit": limit},
        ).fetchall()
    conn.close()
    if not rows:
        return {"facts": [], "citations": []}
    facts = []
    for row in rows:
        facts.append(
            {
                "name": row["name"],
                "key": row["company_key"],
                "keyStatus": row["key_status"],
                "chain": row["chain"],
                "sector": row["sector"],
                "listed": bool(row["is_listed"]),
                "stockCode": row["stock_code"],
                "region": " · ".join(
                    part for part in (row["province"], row["city"], row["district"]) if part
                ),
                "products": row["products"],
            }
        )
    return {
        "facts": facts,
        "citations": [{"kind": "company", "id": f["key"], "label": f["name"]} for f in facts],
    }


def distribution(code: str, listed_only: bool = False) -> list[dict]:
    """按主环节统计企业数；listed_only=True 时只算上市企业。"""
    conn = connect()
    rows = conn.execute(
        """select t.level1 as name, count(distinct t.company_key) as n
           from company_chain_tag t
           join company c on c.company_key = t.company_key
           where t.industry_code = ? and t.is_primary = 1
             and (? = 0 or c.is_listed = 1)
           group by t.level1 order by n desc""",
        (code, 1 if listed_only else 0),
    ).fetchall()
    conn.close()
    return [{"name": row["name"], "count": row["n"]} for row in rows]
