"""链知智答后端单测：临时库 + 工具层 + 回答编排。运行：python -m unittest discover agent/tests"""

from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import tools  # noqa: E402
import answer as answer_engine  # noqa: E402


class ToolsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "test.db"
        conn = sqlite3.connect(self.db)
        conn.executescript(
            (HERE.parent / "sql" / "schema.sqlite.sql").read_text(encoding="utf-8")
        )
        conn.execute(
            "insert into industry(code, label, imported_at, company_count, counts_json) values (?,?,?,?,?)",
            (
                "ES",
                "储能产业",
                "2026-10-21T00:00:00+00:00",
                2,
                json.dumps({"headTiers": {"龙头": 1, "骨干": 1, "长尾": 0}}),
            ),
        )
        conn.execute(
            """insert into company(company_key, credit_code, key_status, name, norm_name,
                industry_code, chain, sector, is_listed, province, city, products, updated_at)
               values ('91350000MA000000XX', '91350000MA000000XX', 'verified', '测试储能股份有限公司',
                '测试储能股份有限公司', 'ES', '电池与核心部件', '储能电池本体', 1, '福建省', '宁德市',
                '储能电芯', '2026-10-21T00:00:00+00:00')"""
        )
        conn.execute(
            """insert into company(company_key, key_status, name, norm_name, industry_code,
                chain, sector, is_listed, updated_at)
               values ('pending:ES:abc', 'pending_credit_code', '测试材料有限公司', '测试材料有限公司',
                'ES', '资源与材料', '矿产资源与化工原料', 0, '2026-10-21T00:00:00+00:00')"""
        )
        conn.execute(
            "insert into company_alias values ('91350000MA000000XX', '测试储能', 'source-alias')"
        )
        conn.execute(
            "insert into company_chain_tag values ('91350000MA000000XX','ES','电池与核心部件','储能电池本体',1,0.9,NULL,'source-shard','2026-10-21T00:00:00+00:00')"
        )
        conn.execute(
            "insert into company_chain_tag values ('pending:ES:abc','ES','资源与材料','矿产资源与化工原料',1,0.9,NULL,'source-shard','2026-10-21T00:00:00+00:00')"
        )
        conn.execute(
            """insert into relation(industry_code, from_key, to_key, from_name, to_name, rel_type, source_note)
               values ('ES','91350000MA000000XX','pending:ES:abc','测试储能','测试材料','供应','前五大客户')"""
        )
        conn.commit()
        conn.close()
        patcher = mock.patch.object(tools, "DB_FILE", self.db)
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_chain_stats(self):
        result = tools.chain_stats("ES")
        facts = result["facts"][0]
        self.assertEqual(facts["total"], 2)
        self.assertEqual(facts["listed"], 1)
        self.assertEqual(facts["relations"], 1)
        self.assertEqual(facts["tiers"]["龙头"], 1)
        self.assertEqual(facts["creditCodePending"], 1)

    def test_company_lookup_by_alias(self):
        result = tools.company_lookup("ES", "测试储能")
        self.assertEqual(len(result["facts"]), 1)
        self.assertEqual(result["facts"][0]["chain"], "电池与核心部件")

    def test_company_in_question(self):
        result = tools.company_in_question("ES", "测试储能属于哪个环节？")
        self.assertEqual(len(result["facts"]), 1)

    def test_distribution_split_by_listed(self):
        full = tools.distribution("ES")
        listed = tools.distribution("ES", listed_only=True)
        self.assertEqual({item["name"]: item["count"] for item in full}["电池与核心部件"], 1)
        self.assertEqual({item["name"]: item["count"] for item in listed}["电池与核心部件"], 1)
        self.assertEqual(
            {item["name"]: item["count"] for item in listed}.get("资源与材料"), None
        )

    def test_graph_neighbors(self):
        result = tools.graph_neighbors("91350000MA000000XX")
        self.assertEqual(result["facts"][0]["type"], "供应")
        self.assertEqual(result["facts"][0]["counterparty"], "测试材料有限公司")


class AnswerTest(unittest.TestCase):
    def setUp(self) -> None:
        import tempfile

        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "test.db"
        conn = sqlite3.connect(self.db)
        conn.executescript(
            (HERE.parent / "sql" / "schema.sqlite.sql").read_text(encoding="utf-8")
        )
        conn.execute(
            "insert into industry(code, label, imported_at, company_count, counts_json) values (?,?,?,?,?)",
            ("ES", "储能产业", "2026-10-21T00:00:00+00:00", 1, json.dumps({"headTiers": {"龙头": 1, "骨干": 0, "长尾": 0}})),
        )
        conn.execute(
            """insert into company(company_key, credit_code, key_status, name, norm_name,
                industry_code, chain, sector, is_listed, province, city, products, updated_at)
               values ('91350000MA000000XX', '91350000MA000000XX', 'verified', '测试储能股份有限公司',
                '测试储能股份有限公司', 'ES', '电池与核心部件', '储能电池本体', 1, '福建省', '宁德市',
                '储能电芯', '2026-10-21T00:00:00+00:00')"""
        )
        conn.execute(
            "insert into company_chain_tag values ('91350000MA000000XX','ES','电池与核心部件','储能电池本体',1,0.9,NULL,'source-shard','2026-10-21T00:00:00+00:00')"
        )
        conn.commit()
        conn.close()
        tools.DB_FILE = self.db

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_stats_answer_numbers_from_tools(self):
        result = answer_engine.answer("这条链有多少家企业？", "ES")
        self.assertTrue(any("1 家企业" in bullet for bullet in result["bullets"]))
        self.assertIn("数据窗口", result["note"])

    def test_company_answer(self):
        result = answer_engine.answer("测试储能属于哪个环节？", "ES")
        self.assertEqual(result["route"], "企业定位")
        self.assertTrue(any("电池与核心部件" in bullet for bullet in result["bullets"]))

    def test_tier_answer(self):
        result = answer_engine.answer("头部、腰部、尾部怎么分？", "ES")
        self.assertIn("龙头", result["answer"] + "".join(result["bullets"]))
        self.assertTrue(any("硬门槛" in bullet for bullet in result["bullets"]))

    def test_knowledge_answer_is_labeled(self):
        result = answer_engine.answer("什么是供应链金融？", "ES")
        self.assertIn("链外常识", result["route"])
        self.assertTrue(any(citation["kind"] == "knowledge" for citation in result["citations"]))

    def test_unknown_question_refuses(self):
        result = answer_engine.answer("明天天气怎么样？", "ES")
        self.assertIn("没有把握", result["answer"])


if __name__ == "__main__":
    unittest.main()
