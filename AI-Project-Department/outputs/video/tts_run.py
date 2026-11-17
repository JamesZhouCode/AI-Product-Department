# edge-tts 驱动：显式传 proxy 参数（aiohttp 的 trust_env 对 websocket 连接不生效，环境变量方式会连不上）。
# 用法: python tts_run.py <text_file> <voice> <out_mp3> <rate> <pitch> <proxy|direct>
import asyncio
import sys

import edge_tts


def main():
    text_file, voice, out_mp3, rate, pitch, proxy = sys.argv[1:7]
    with open(text_file, encoding="utf-8") as f:
        text = f.read()

    async def run():
        communicate = edge_tts.Communicate(
            text,
            voice,
            rate=rate,
            pitch=pitch,
            proxy=None if proxy == "direct" else proxy,
        )
        await communicate.save(out_mp3)

    asyncio.run(run())


if __name__ == "__main__":
    main()
