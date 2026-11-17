"""把前端静态分片导入单机演示库（SQLite）。

用法：
    python agent/ingest.py            # 全量重建（幂等）
    python agent/ingest.py --report   # 只打印上次导入报告

主键口径：
    有统一社会信用代码 → company_key = credit_code，key_status='verified'
    没有            → company_key = 'pending:<行业码>:<名称哈希>'，key_status='pending_credit_code'
    当前源分片全部没有信用代码，因此会全部落在 pending 桶里，报告会明确列出缺口，
    等拿到真码后跑 `python agent/ingest.py --apply-credit-codes agent/data/credit-codes.csv`
    原地升级主键（关联的别名、环节标签、关系一并迁移），绝不编造代码。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "frontend" / "public" / "data"
INDEX_FILE = DATA_DIR / "industries" / "index.json"
DB_FILE = Path(__file__).resolve().parent / "data" / "chain.db"
SCHEMA_FILE = Path(__file__).resolve().parent / "sql" / "schema.sqlite.sql"
REPORT_FILE = Path(__file__).resolve().parent / "data" / "ingest-report.json"
METHOD_DOC = Path("G:/对公经营智能化项目/储能产业链企业识别与分层管理系统_思维导图.md")

NOW = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")  # noqa: E731


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def norm_name(value: str) -> str:
    text = re.sub(r"\s+", "", value or "")
    return text.replace("（", "(").replace("）", ")")


def as_text(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return "、".join(str(item) for item in value if item)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def connect() -> sqlite3.Connection:
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    with SCHEMA_FILE.open(encoding="utf-8") as handle:
        conn.executescript(handle.read())
    return conn


def load_industries() -> list[dict]:
    with INDEX_FILE.open(encoding="utf-8") as handle:
        index = json.load(handle)
    return [item for item in index["industries"] if item.get("status") == "ready"]


def shard_path(item: dict) -> Path:
    return DATA_DIR / item["file"]


def is_listed(company: dict) -> bool:
    tags = company.get("tags") or []
    return "上市企业" in tags or company.get("companyType") == "listed"


def stock_code_of(company: dict) -> str | None:
    evidence = company.get("listedEvidence") or {}
    return evidence.get("stockCode") or company.get("stockCode")


def company_key_of(company: dict, industry_code: str) -> tuple[str, str, str | None]:
    credit = (company.get("creditCode") or company.get("credit_code") or "").strip()
    if re.fullmatch(r"[0-9A-Z]{18}", credit):
        return credit, "verified", credit
    base = norm_name(company.get("normalizedName") or company.get("name") or "")
    return f"pending:{industry_code}:{sha1(base)[:12]}", "pending_credit_code", None


def ingest_industry(conn: sqlite3.Connection, item: dict) -> dict:
    code = item["code"]
    path = shard_path(item)
    if not path.exists():
        return {"code": code, "skipped": f"missing {path}"}
    with path.open(encoding="utf-8") as handle:
        shard = json.load(handle)

    started = time.time()
    companies = shard.get("companies") or []
    relations = shard.get("relations") or []

    conn.execute("delete from relation where industry_code = ?", (code,))
    conn.execute("delete from company where industry_code = ?", (code,))
    conn.execute(
        "insert into industry(code, label, shard_file, imported_at, company_count, counts_json) values (?,?,?,?,0,?) "
        "on conflict(code) do update set label=excluded.label, shard_file=excluded.shard_file, "
        "imported_at=excluded.imported_at, counts_json=excluded.counts_json",
        (code, item.get("label") or code, item["file"], NOW(), json.dumps(shard.get("counts") or {}, ensure_ascii=False)),
    )

    name_to_key: dict[str, str] = {}
    seen_names: dict[str, int] = {}
    pending = 0
    listed = 0
    duplicates = 0

    for company in companies:
        raw_name = company.get("name") or company.get("normalizedName") or ""
        normalized = norm_name(raw_name)
        if not normalized:
            continue
        suffix = seen_names.get(normalized, 0)
        seen_names[normalized] = suffix + 1
        if suffix:
            duplicates += 1
            normalized = f"{normalized}~{suffix + 1}"

        credit = (company.get("creditCode") or company.get("credit_code") or "").strip()
        credit = credit if re.fullmatch(r"[0-9A-Z]{18}", credit) else None
        if credit:
            key, key_status = credit, "verified"
        else:
            key = f"pending:{code}:{sha1(normalized)[:12]}"
            key_status = "pending_credit_code"
            pending += 1
        if is_listed(company):
            listed += 1

        region = company.get("region") or {}
        location = company.get("location") or {}
        conn.execute(
            """insert into company(
                company_key, credit_code, key_status, name, norm_name, industry_code,
                chain, sector, tertiary_sector, company_type, is_listed, stock_code,
                province, city, district, address, lng, lat, geo_precision,
                products, core_technology, source_file, raw_json, updated_at
            ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                key,
                credit,
                key_status,
                raw_name,
                normalized,
                code,
                company.get("chain"),
                company.get("sector"),
                company.get("tertiarySector"),
                company.get("companyType"),
                1 if is_listed(company) else 0,
                stock_code_of(company),
                region.get("province"),
                region.get("city"),
                region.get("district"),
                company.get("address"),
                location.get("lng"),
                location.get("lat"),
                location.get("precision"),
                as_text(company.get("products")),
                as_text(company.get("coreTechnology")),
                item["file"],
                json.dumps(company, ensure_ascii=False),
                NOW(),
            ),
        )
        name_to_key.setdefault(normalized, key)

        for alias in company.get("aliases") or []:
            alias_text = str(alias).strip()
            if alias_text and norm_name(alias_text) != normalized:
                conn.execute(
                    "insert or ignore into company_alias(company_key, alias, alias_type) values (?,?,?)",
                    (key, alias_text, "source-alias"),
                )

        tag_rows = []
        primary_chain = company.get("chain") or company.get("secondaryIndustry")
        primary_sector = company.get("sector") or company.get("tertiarySector")
        if primary_chain:
            tag_rows.append((primary_chain, primary_sector or "", 1))
        for classification in company.get("classifications") or []:
            chain = classification.get("chain")
            sector = classification.get("sector") or ""
            if chain and (chain, sector) != (primary_chain, primary_sector or ""):
                tag_rows.append((chain, sector, 0))
        for level1, level2, is_primary in tag_rows:
            conn.execute(
                """insert or ignore into company_chain_tag(
                    company_key, industry_code, level1, level2, is_primary, confidence,
                    evidence_id, assigned_by, assigned_at
                ) values (?,?,?,?,?,?,?,?,?)""",
                (
                    key,
                    code,
                    level1,
                    level2,
                    is_primary,
                    company.get("classificationConfidence"),
                    None,
                    company.get("classificationMethod") or "source-shard",
                    NOW(),
                ),
            )

    linked = 0
    for relation in relations:
        from_name = relation.get("from") or relation.get("source") or ""
        to_name = relation.get("to") or relation.get("target") or ""
        from_key = name_to_key.get(norm_name(from_name))
        to_key = name_to_key.get(norm_name(to_name))
        if from_key and to_key:
            linked += 1
        note = relation.get("basis") or relation.get("source") or ""
        evidence_id = None
        if note:
            evidence_id = sha1(f"{code}|{from_name}|{to_name}|{note}")[:16]
            conn.execute(
                "insert or ignore into evidence(id, doc_id, locator, quote, source_url, fetched_at) values (?,?,?,?,?,?)",
                (evidence_id, None, relation.get("sourceFromProfile"), note, None, NOW()),
            )
        conn.execute(
            """insert into relation(
                industry_code, from_key, to_key, from_name, to_name, rel_type,
                confidence, evidence_id, source_note
            ) values (?,?,?,?,?,?,?,?,?)""",
            (
                code,
                from_key,
                to_key,
                from_name,
                to_name,
                relation.get("relationType") or "供应",
                relation.get("confidence"),
                evidence_id,
                relation.get("source"),
            ),
        )

    conn.execute("update industry set company_count = ? where code = ?", (len(companies), code))
    conn.commit()

    return {
        "code": code,
        "label": item.get("label"),
        "file": item["file"],
        "companies": len(companies),
        "listed": listed,
        "pendingKeys": pending,
        "duplicateNames": duplicates,
        "relations": len(relations),
        "relationsLinked": linked,
        "creditCodeCoverage": f"{(len(companies) - pending)}/{len(companies)}",
        "seconds": round(time.time() - started, 2),
    }


def ingest_method_doc(conn: sqlite3.Connection) -> dict | None:
    if not METHOD_DOC.exists():
        return {"skipped": f"未找到方法论文档：{METHOD_DOC}"}
    text = METHOD_DOC.read_text(encoding="utf-8")
    doc_id = "method-storage-mindmap"
    conn.execute("delete from doc_chunk where doc_id = ?", (doc_id,))
    conn.execute(
        """insert or replace into raw_document(id, source_id, url, http_status, content_hash,
               storage_key, fetched_at, parser, parse_status)
           values (?,?,?,?,?,?,?,?,?)""",
        (doc_id, "method-doc", str(METHOD_DOC), 200, sha1(text)[:16], str(METHOD_DOC), NOW(), "markdown", "ok"),
    )

    sections: list[tuple[str, list[str]]] = []
    current_title, buffer = "总览", []
    for line in text.splitlines():
        if line.startswith("## "):
            if buffer:
                sections.append((current_title, buffer))
            current_title, buffer = line[3:].strip(), []
        elif line.startswith("# "):
            continue
        else:
            buffer.append(line)
    if buffer:
        sections.append((current_title, buffer))

    count = 0
    for index, (title, lines) in enumerate(sections):
        content = "\n".join(lines).strip()
        if len(content) < 30:
            continue
        conn.execute(
            "insert into doc_chunk(doc_id, industry_code, chunk_no, title, content, meta) values (?,?,?,?,?,?)",
            (
                doc_id,
                "ES",
                index,
                title,
                content,
                json.dumps({"doc_type": "methodology", "source": METHOD_DOC.name}, ensure_ascii=False),
            ),
        )
        count += 1
    conn.commit()
    return {"docId": doc_id, "sections": count, "path": str(METHOD_DOC)}


def print_report(report: dict) -> None:
    print(f"数据库：{DB_FILE}")
    for row in report["industries"]:
        if "skipped" in row:
            print(f"  - {row['code']}: 跳过（{row['skipped']}）")
            continue
        print(
            f"  - {row['code']} {row['label']}: {row['companies']} 家 / 上市 {row['listed']} / "
            f"关系 {row['relationsLinked']}/{row['relations']} 已挂接 / 信用代码 {row['creditCodeCoverage']}"
        )
    print(f"合计：{report['totalCompanies']} 家企业，待补信用代码 {report['pendingKeys']} 家")
    if report.get("methodDoc"):
        print(f"方法论文档切片：{report['methodDoc'].get('sections', 0)} 段")


def rebuild() -> dict:
    conn = connect()
    industries = load_industries()
    rows = [ingest_industry(conn, item) for item in industries]
    method = ingest_method_doc(conn)
    total = conn.execute("select count(*) from company").fetchone()[0]
    pending = conn.execute(
        "select count(*) from company where key_status = 'pending_credit_code'"
    ).fetchone()[0]
    report = {
        "generatedAt": NOW(),
        "database": str(DB_FILE),
        "industries": rows,
        "totalCompanies": total,
        "pendingKeys": pending,
        "methodDoc": method,
    }
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    conn.close()
    return report


def apply_credit_codes(csv_path: Path) -> None:
    """用真码原地升级主键：company_key 从 pending 换成信用代码，关联数据一并迁移。"""
    conn = connect()
    applied = 0
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            code = (row.get("credit_code") or "").strip()
            industry = (row.get("industry_code") or "ES").strip()
            name = (row.get("name") or "").strip()
            if not code or not name:
                continue
            target = conn.execute(
                "select company_key from company where industry_code = ? and norm_name = ?",
                (industry, norm_name(name)),
            ).fetchone()
            if not target:
                continue
            old_key = target["company_key"]
            if old_key == code:
                continue
            conn.execute(
                "update company set company_key = ?, credit_code = ?, key_status = 'verified' where company_key = ?",
                (code, code, old_key),
            )
            for table in ("company_alias", "company_chain_tag"):
                conn.execute(f"update {table} set company_key = ? where company_key = ?", (code, old_key))
            conn.execute("update relation set from_key = ? where from_key = ?", (code, old_key))
            conn.execute("update relation set to_key = ? where to_key = ?", (code, old_key))
            applied += 1
    conn.commit()
    conn.close()
    print(f"已升级 {applied} 家企业主键为统一社会信用代码")


def main() -> None:
    parser = argparse.ArgumentParser(description="导入产业链分片到单机演示库")
    parser.add_argument("--report", action="store_true", help="只打印最近一次导入报告")
    parser.add_argument("--apply-credit-codes", type=Path, help="CSV：industry_code,name,credit_code")
    args = parser.parse_args()

    if args.report:
        if REPORT_FILE.exists():
            print_report(json.loads(REPORT_FILE.read_text(encoding="utf-8")))
        else:
            print("还没有导入报告，先运行 python agent/ingest.py")
        return

    if args.apply_credit_codes:
        apply_credit_codes(args.apply_credit_codes)
        return

    report = rebuild()
    print_report(report)


if __name__ == "__main__":
    main()
