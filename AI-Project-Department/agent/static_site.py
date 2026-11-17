"""静态前端托管（把 dist 目录挂到与 API 同一个端口，供内网单进程部署）。

设计要点：
- 支持 Range 请求：地图底图是 PMTiles 单文件，maplibre 必须靠 206 分片读取；
- 文本资源按需 gzip，并在内存里缓存压缩结果（体积上限可配），避免每次重压；
- 目录穿越防护、ETag / 304、长缓存（Vite 带 hash 的 assets）；
- 无扩展名的路径回落到 index.html，避免刷新页面 404。

只依赖标准库，与后端其余部分一致。
"""

from __future__ import annotations

import gzip
import io
import mimetypes
from pathlib import Path
from urllib.parse import unquote

# 标准库 mimetypes 覆盖不到的少量类型
EXTRA_TYPES = {
    ".pmtiles": "application/vnd.pmtiles",
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".avif": "image/avif",
}

# 值得压缩的文本类型（字体/图片/瓦片本身已压缩，跳过）
COMPRESSIBLE = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".map", ".webmanifest"}

GZIP_MIN_BYTES = 1024
GZIP_CACHE_MAX_ENTRIES = 24
CHUNK = 256 * 1024


def _parse_range(header: str, size: int) -> tuple[int, int] | str | None:
    """解析 Range 头。返回 (start, end)、'invalid' 或 None（无法识别则按整文件返回）。"""
    value = header.strip()
    if not value.lower().startswith("bytes="):
        return None
    spec = value[6:].split(",", 1)[0].strip()
    if "-" not in spec:
        return None
    start_text, _, end_text = spec.partition("-")
    try:
        if start_text:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
        else:  # 后缀区间：bytes=-N 表示最后 N 字节
            if not end_text:
                return "invalid"
            length = int(end_text)
            if length <= 0:
                return "invalid"
            start, end = max(size - length, 0), size - 1
    except ValueError:
        return "invalid"
    if start < 0 or start >= size or end < start:
        return "invalid"
    return start, min(end, size - 1)


class StaticSite:
    """把某个目录当作站点根目录对外提供。"""

    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self._gzip_cache: dict[tuple[str, int, int], bytes] = {}
        self._gzip_bytes = 0

    @property
    def available(self) -> bool:
        return (self.root / "index.html").is_file()

    # ---------- 路径与类型 ----------

    def _resolve(self, url_path: str) -> Path | None:
        # 先解码（字体等资源路径带空格：Noto%20Sans%20Regular），再统一分隔符
        raw = unquote(url_path.split("?", 1)[0].split("#", 1)[0]).replace("\\", "/")
        if "\x00" in raw:
            return None
        if not raw.startswith("/"):
            return None
        parts = [part for part in raw.split("/") if part not in ("", ".")]
        if any(part == ".." for part in parts):
            return None
        target = self.root.joinpath(*parts) if parts else self.root
        try:
            target = target.resolve()
        except OSError:
            return None
        if target != self.root and self.root not in target.parents:
            return None
        return target

    @staticmethod
    def _mime(path: Path) -> str:
        suffix = path.suffix.lower()
        if suffix in EXTRA_TYPES:
            return EXTRA_TYPES[suffix]
        guessed, _ = mimetypes.guess_type(path.name)
        return guessed or "application/octet-stream"

    @staticmethod
    def _cache_control(url_path: str) -> str:
        if "/assets/" in url_path:
            return "public, max-age=31536000, immutable"
        if url_path.endswith(".html") or url_path.endswith("/"):
            return "no-cache"
        return "public, max-age=3600"

    # ---------- gzip 缓存 ----------

    def _gzip_payload(self, path: Path, mtime: int, size: int) -> bytes:
        key = (str(path), mtime, size)
        cached = self._gzip_cache.get(key)
        if cached is not None:
            return cached
        raw = path.read_bytes()
        # GzipFile 写法兼容到 Python 3.7（gzip.compress 的 mtime 参数 3.8 才有）
        buffer = io.BytesIO()
        with gzip.GzipFile(fileobj=buffer, mode="wb", compresslevel=6, mtime=0) as gz:
            gz.write(raw)
        packed = buffer.getvalue()
        if len(packed) >= size:  # 压不动就别压
            return raw
        while len(self._gzip_cache) >= GZIP_CACHE_MAX_ENTRIES:
            oldest = next(iter(self._gzip_cache))
            self._gzip_bytes -= len(self._gzip_cache.pop(oldest))
        self._gzip_cache[key] = packed
        self._gzip_bytes += len(packed)
        return packed

    # ---------- 主入口 ----------

    def serve(self, handler, url_path: str) -> bool:
        """处理一个 GET/HEAD 请求。返回 True 表示已响应。"""
        target = self._resolve(url_path)
        if target is None:
            return False

        if target.is_dir():
            index = target / "index.html"
            if not index.is_file():
                return False
            target = index
            url_path = url_path.rstrip("/") + "/index.html"

        if not target.is_file():
            # 无扩展名的路径交给前端（当前没有路由，回落到首页即可）
            if Path(url_path).suffix:
                return False
            fallback = self.root / "index.html"
            if not fallback.is_file():
                return False
            target = fallback
            url_path = "/index.html"

        stat = target.stat()
        size = stat.st_size
        mtime = int(stat.st_mtime)
        etag = f'"{mtime}-{size}"'
        mime = self._mime(target)
        head_only = handler.command == "HEAD"

        if handler.headers.get("If-None-Match") == etag:
            handler.send_response(304)
            handler.send_header("ETag", etag)
            handler.send_header("Content-Length", "0")
            handler.end_headers()
            return True

        wants_gzip = "gzip" in (handler.headers.get("Accept-Encoding") or "").lower()
        gzip_ok = (
            wants_gzip
            and target.suffix.lower() in COMPRESSIBLE
            and size >= GZIP_MIN_BYTES
            and not handler.headers.get("Range")
        )

        body: bytes | None = None
        status = 200
        extra: dict[str, str] = {}

        range_header = handler.headers.get("Range")
        if range_header and size > 0:
            parsed = _parse_range(range_header, size)
            if parsed == "invalid":
                handler.send_response(416)
                handler.send_header("Content-Range", f"bytes */{size}")
                handler.send_header("Content-Length", "0")
                handler.end_headers()
                return True
            if isinstance(parsed, tuple):
                start, end = parsed
                with open(target, "rb") as fh:
                    fh.seek(start)
                    body = fh.read(end - start + 1)
                status = 206
                extra["Content-Range"] = f"bytes {start}-{end}/{size}"

        if body is None and gzip_ok:
            body = self._gzip_payload(target, mtime, size)
            if len(body) < size:
                extra["Content-Encoding"] = "gzip"

        handler.send_response(status)
        handler.send_header("Content-Type", mime)
        handler.send_header("ETag", etag)
        handler.send_header("Cache-Control", self._cache_control(url_path))
        handler.send_header("Accept-Ranges", "bytes")
        handler.send_header("Last-Modified", handler.date_time_string(mtime))
        for key, value in extra.items():
            handler.send_header(key, value)
        handler.send_header(
            "Content-Length", str(len(body) if body is not None else size)
        )
        handler.end_headers()

        if head_only:
            return True
        if body is not None:
            handler.wfile.write(body)
            return True

        # 大文件（地图瓦片包）分块写出，避免一次性读进内存
        with open(target, "rb") as fh:
            remaining = size
            while remaining > 0:
                chunk = fh.read(min(CHUNK, remaining))
                if not chunk:
                    break
                handler.wfile.write(chunk)
                remaining -= len(chunk)
        return True
