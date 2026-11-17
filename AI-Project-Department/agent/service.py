"""链知智答后端（单机演示，标准库实现，零依赖）。

启动：
    python agent/service.py            # 默认 127.0.0.1:8787

前端开发服务器通过 vite proxy 把 /api 转发到这里；服务不可用时前端自动回退本地规则引擎。
"""

from __future__ import annotations

import json
import os
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import answer as answer_engine
import static_site
import tools

PORT = int(os.getenv("AGENT_PORT", "8787"))
HOST = os.getenv("AGENT_HOST", "127.0.0.1")
# 并发处理线程上限：内网信创服务器的线程/进程上限往往很小（512 甚至更低），
# 无上限建线程会把整站拖死，这里默认 64 个处理线程 + 快速失败。
MAX_WORKERS = int(os.getenv("AGENT_MAX_THREADS", "64"))
DB_FILE = tools.DB_FILE

# 内网单进程部署：把前端 dist 挂到同一端口。不设置则只提供 API（开发时走 vite）。
WEB_ROOT = os.getenv("WEB_ROOT", "").strip()
SITE = static_site.StaticSite(Path(WEB_ROOT)) if WEB_ROOT else None

ALLOWED_ORIGINS = {
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
}


def industries() -> list[dict]:
    conn = tools.connect()
    rows = conn.execute(
        "select code, label, company_count, counts_json, imported_at from industry order by code"
    ).fetchall()
    conn.close()
    return [
        {
            "code": row["code"],
            "label": row["label"],
            "companyCount": row["company_count"],
            "importedAt": row["imported_at"],
        }
        for row in rows
    ]


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    """有并发上限的多线程 HTTP 服务。

    标准库 ThreadingHTTPServer 为每个连接新建线程且不设上限。HTTP/1.1 长连接下
    线程会被客户端长期占用，在内网信创服务器（线程/进程上限常为 512 或更低）上
    很容易触到上限，抛 `RuntimeError: can't start new thread`——现象是端口可连、
    页面却一直无响应。这里用信号量限制并发处理线程，满了立刻回 503，
    保证服务整体可用而不是被拖死。
    """

    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128

    def __init__(self, *args, max_workers: int = MAX_WORKERS, **kwargs):
        super().__init__(*args, **kwargs)
        self._slots = threading.BoundedSemaphore(max(4, max_workers))
        self.max_workers = max(4, max_workers)

    def process_request(self, request, client_address):  # noqa: D102
        if not self._slots.acquire(blocking=False):
            try:
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\n"
                    b"Content-Length: 0\r\nConnection: close\r\n\r\n"
                )
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except RuntimeError:
            # 系统层面已无法再建线程：释放配额并断开，避免 sv 抛栈刷屏
            self._slots.release()
            self.shutdown_request(request)

    def process_request_thread(self, request, client_address):  # noqa: D102
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "ChainAgent/0.1"
    # HTTP/1.1 长连接：前端一次加载会发几十个静态资源请求，避免每次重建连接。
    # 但长连接会让线程被客户端长期占用，所以必须有空闲超时把线程回收。
    protocol_version = "HTTP/1.1"
    timeout = 30  # 秒；socket 空闲 30s 后断开，释放线程

    def log_message(self, fmt: str, *args):  # noqa: N802
        print(f"[agent] {self.address_string()} {fmt % args}")

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, payload: dict | list, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _file(self, body: bytes, content_type: str, filename: str) -> None:
        """二进制下载（Excel 导出）：带 RFC 5987 中文/ASCII 双写文件名。"""
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header(
            "Content-Disposition", f"attachment; filename=\"{filename}\"; filename*=UTF-8''{filename}"
        )
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        industry = (query.get("industry") or ["ES"])[0]

        try:
            if parsed.path == "/api/health":
                self._json(
                    {
                        "ok": True,
                        "database": str(DB_FILE),
                        "industries": industries(),
                    }
                )
                return
            if parsed.path == "/api/chain/stats":
                self._json(tools.chain_stats(industry))
                return
            if parsed.path == "/api/companies":
                keyword = (query.get("q") or [""])[0]
                if not keyword:
                    self._json({"facts": [], "citations": []})
                    return
                self._json(tools.company_lookup(industry, keyword))
                return
            if parsed.path == "/api/doc/search":
                keyword = (query.get("q") or [""])[0]
                self._json(tools.search_docs(keyword, code=industry))
                return
            if SITE is not None and not parsed.path.startswith("/api/"):
                if SITE.serve(self, parsed.path):
                    return
            self._json({"error": "not found"}, status=404)
        except (BrokenPipeError, ConnectionResetError):
            # 浏览器提前断开（切换页面/拖动地图）属正常现象，不当作错误
            return
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            self._json({"error": "internal error"}, status=500)

    def do_HEAD(self) -> None:  # noqa: N802
        if SITE is not None and not urlparse(self.path).path.startswith("/api/"):
            try:
                if SITE.serve(self, urlparse(self.path).path):
                    return
            except (BrokenPipeError, ConnectionResetError):
                return
        self.send_response(405)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/api/assistant/chat":
            self._json({"error": "not found"}, status=404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            question = (payload.get("question") or "").strip()
            industry = (payload.get("industry") or "ES").strip()
            if not question:
                self._json({"error": "question is required"}, status=400)
                return
            self._json(answer_engine.answer(question, industry))
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            self._json({"error": "internal error"}, status=500)



def main() -> None:
    if not DB_FILE.exists():
        raise SystemExit(f"数据库不存在：{DB_FILE}\n先运行：python agent/ingest.py")
    server = BoundedThreadingHTTPServer((HOST, PORT), Handler)
    print(f"链知智答后端已启动：http://{HOST}:{PORT}（并发处理线程上限 {server.max_workers}）")
    print(f"数据库：{DB_FILE}")
    print("回答生成：确定性模板（未接入大模型）")
    if SITE is not None:
        if SITE.available:
            print(f"静态前端：{SITE.root}（同端口托管）")
        else:
            print(f"[警告] WEB_ROOT={SITE.root} 下没有 index.html，页面将无法打开")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
