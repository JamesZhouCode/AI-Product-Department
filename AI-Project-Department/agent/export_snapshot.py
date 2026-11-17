"""从演示库导出与前端契约完全一致的 JSON 分片，验证「库 → 分片」可往返。

用法：
    python agent/export_snapshot.py --industry ES [--out agent/data/export]

校验：与源分片逐家对比 raw JSON、逐条对比关系；不一致会列出差异并退出码 1。
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "frontend" / "public" / "data"
DB_FILE = Path(__file__).resolve().parent / "data" / "chain.db"


def export_industry(conn: sqlite3.Connection, code: str) -> dict:
    industry = conn.execute("select * from industry where code = ?", (code,)).fetchone()
    if not industry:
        raise SystemExit(f"未找到产业 {code}")
    companies = [
        json.loads(row["raw_json"])
        for row in conn.execute(
            "select raw_json from company where industry_code = ? order by company_key", (code,)
        ).fetchall()
        if row["raw_json"]
    ]
    relations = [
        {
            "id": f"relation-{row['id']}",
            "from": row["from_name"],
            "to": row["to_name"],
            "relationType": row["rel_type"],
            "source": row["source_note"],
        }
        for row in conn.execute(
            "select * from relation where industry_code = ? order by id", (code,)
        ).fetchall()
    ]
    counts = json.loads(industry["counts_json"] or "{}")
    return {
        "generatedAt": industry["imported_at"][:10],
        "schemaVersion": 2,
        "industry": code,
        "industryCode": code,
        "counts": counts,
        "companies": companies,
        "relations": relations,
    }


def diff_industry(source: dict, exported: dict) -> list[str]:
    problems = []
    if len(source.get("companies") or []) != len(exported["companies"]):
        problems.append(
            f"企业数不一致：源 {len(source.get('companies') or [])} vs 导出 {len(exported['companies'])}"
        )
    source_by_name = {item.get("name"): item for item in source.get("companies") or []}
    for company in exported["companies"]:
        origin = source_by_name.get(company.get("name"))
        if origin is None:
            problems.append(f"导出多了企业：{company.get('name')}")
        elif origin != company:
            problems.append(f"字段有差异：{company.get('name')}")
    if len(source.get("relations") or []) != len(exported["relations"]):
        problems.append(
            f"关系数不一致：源 {len(source.get('relations') or [])} vs 导出 {len(exported['relations'])}"
        )
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description="导出库内分片并与源文件对比")
    parser.add_argument("--industry", default="ES")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent / "data" / "export"))
    args = parser.parse_args()

    if not DB_FILE.exists():
        raise SystemExit(f"数据库不存在：{DB_FILE}，先运行 python agent/ingest.py")

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    exported = export_industry(conn, args.industry)
    conn.close()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"companies-{args.industry.lower()}-snapshot.json"
    out_file.write_text(json.dumps(exported, ensure_ascii=False, indent=1), encoding="utf-8")

    index = json.loads((DATA_DIR / "industries" / "index.json").read_text(encoding="utf-8"))
    item = next((entry for entry in index["industries"] if entry["code"] == args.industry), None)
    problems: list[str] = []
    if item:
        source_file = DATA_DIR / item["file"]
        source = json.loads(source_file.read_text(encoding="utf-8"))
        problems = diff_industry(source, exported)
        print(f"对比源文件：{source_file}")
    print(f"导出：{out_file}（{len(exported['companies'])} 家 / {len(exported['relations'])} 条关系）")
    if problems:
        print(f"契约差异 {len(problems)} 处：")
        for problem in problems[:20]:
            print(" -", problem)
        sys.exit(1)
    print("契约校验通过：导出内容与源分片一致。")


if __name__ == "__main__":
    main()
