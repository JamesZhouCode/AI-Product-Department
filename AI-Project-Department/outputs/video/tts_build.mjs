// 逐镜旁白：Microsoft Edge 神经语音（edge-tts）→ 整镜合成 → 逐镜 WAV + 时长清单。
//
// 男声：zh-CN-YunjianNeural（云健，沉稳浑厚，纪录片 / 宣传片旁白调性）。
// 换音色直接改环境变量：TTS_VOICE=zh-CN-YunyangNeural（新闻播音）/ zh-CN-YunxiNeural（年轻）/ TTS_RATE=-4%
//
// 两个坑：
// 1) edge-tts 走 speech.platform.bing.com，需要可达的网络出口：
//    直连被墙时走本机代理（Clash 默认混合端口 7897），可用 TTS_PROXY 环境变量覆盖，传 "direct" 则强制直连；
// 2) 该端点会间歇性拒连（连续请求更明显），所以做成**断点续做**：
//    成功的镜记录在 .tts-state.json，失败的本轮跳过，重跑只补缺口。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { SHOTS } from './script.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHUNKS_DIR = join(HERE, 'chunks');
const AUDIO_DIR = join(HERE, 'audio');
const STATE_FILE = join(HERE, '.tts-state.json');
const FFMPEG =
  'C:/Users/周展鹏/.workbuddy/binaries/python/envs/default/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
const PYTHON = 'C:/Users/周展鹏/.workbuddy/binaries/python/envs/default/Scripts/python.exe';

// 男声：zh-CN-YunyangNeural（云扬，新闻播音腔：吐字最清楚、语流平稳，最接近真人解说）。
// 换音色直接改环境变量：TTS_VOICE=zh-CN-YunjianNeural（纪录片旁白）/ zh-CN-YunxiNeural（年轻自然）/ TTS_RATE=-2%
const VOICE = process.env.TTS_VOICE || 'zh-CN-YunyangNeural';
// 自然度调参：语速 -2%（接近常速），不做音高偏移（偏移过深会失真、吐字发糊）。
const RATE = process.env.TTS_RATE || '-2%';
const PITCH = process.env.TTS_PITCH || '+0Hz';

mkdirSync(CHUNKS_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });

const cleanEnv = { ...process.env };
const TTS_PROXY = process.env.TTS_PROXY || 'http://127.0.0.1:7897';
if (TTS_PROXY === 'direct') {
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'http_proxy',
    'https_proxy',
    'ALL_PROXY',
    'all_proxy',
  ]) {
    delete cleanEnv[key];
  }
} else {
  cleanEnv.HTTP_PROXY = TTS_PROXY;
  cleanEnv.HTTPS_PROXY = TTS_PROXY;
  cleanEnv.http_proxy = TTS_PROXY;
  cleanEnv.https_proxy = TTS_PROXY;
}

const sleep = (sec) => spawnSync(PYTHON, ['-c', `import time; time.sleep(${sec})`], { env: cleanEnv });

// 状态文件与音色参数绑定：换音色 / 换语速即视为全部失效，重新合成。
let state = { voice: VOICE, rate: RATE, pitch: PITCH, done: {} };
if (existsSync(STATE_FILE)) {
  try {
    const prev = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    if (prev.voice === VOICE && prev.rate === RATE && prev.pitch === PITCH) state = prev;
  } catch {
    /* 状态损坏则重来 */
  }
}
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

// 配音文本：优先用 ttsText（同音字替换等发音纠正），字幕仍取 narration。
const speechTextOf = (shot) => shot.ttsText || shot.narration;
const hashText = (text) => createHash('md5').update(text, 'utf8').digest('hex');

// 整镜一次合成：文本走 UTF-8 文件，避免 Windows 命令行中文编码问题。
// 走 tts_run.py 驱动：proxy 必须作为参数显式传入（aiohttp 对 websocket 连接不读代理环境变量）。
function synthesize(text, id, attempt = 1) {
  const txt = join(CHUNKS_DIR, `${id}.txt`);
  const mp3 = join(CHUNKS_DIR, `${id}.mp3`);
  writeFileSync(txt, text, 'utf8');
  const result = spawnSync(
    PYTHON,
    [
      join(HERE, 'tts_run.py'),
      txt,
      VOICE,
      mp3,
      RATE,
      PITCH,
      TTS_PROXY,
    ],
    { env: cleanEnv, encoding: 'utf8', timeout: 120000 },
  );
  if (result.status === 0 && existsSync(mp3) && statSync(mp3).size > 2000) return mp3;
  if (attempt >= 3) throw new Error(`edge-tts failed (${id}) after ${attempt} tries: ${String(result.stderr || '').slice(-200)}`);
  console.log(`  retry ${id} #${attempt} (wait ${attempt * 6}s)`);
  sleep(attempt * 6);
  return synthesize(text, id, attempt + 1);
}

const ffprobeDuration = (wav) => {
  const { stderr } = spawnSync(FFMPEG, ['-hide_banner', '-i', wav, '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const match = String(stderr).match(/time=(\d+):(\d+):([\d.]+)/);
  if (!match) throw new Error(`no duration for ${wav}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
};

const head = join(AUDIO_DIR, 'sil.wav');
execFileSync(FFMPEG, [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'anullsrc=r=44100:cl=stereo',
  '-t',
  '0.2',
  head,
]);

const durations = {};
const failed = [];

for (const shot of SHOTS) {
  const mp3 = join(CHUNKS_DIR, `${shot.id}.mp3`);
  const text = speechTextOf(shot);
  const textHash = hashText(text);
  // 缓存判定：状态里记录的文本哈希一致，或历史遗留的 chunk 文本与当前一致（旧状态迁移），
  // 且 mp3 实际存在 —— 否则视为文本已变更，强制重新合成。
  const legacyTxt = join(CHUNKS_DIR, `${shot.id}.txt`);
  const legacyMatch =
    state.done[shot.id] === true &&
    existsSync(legacyTxt) &&
    readFileSync(legacyTxt, 'utf8') === text;
  if (legacyMatch && !state.hashes) state.hashes = {};
  if (legacyMatch) state.hashes[shot.id] = textHash;
  const cached =
    existsSync(mp3) && statSync(mp3).size > 2000 && state.hashes?.[shot.id] === textHash;

  if (!cached) {
    try {
      synthesize(text, shot.id);
      if (!state.hashes) state.hashes = {};
      state.hashes[shot.id] = textHash;
      state.done[shot.id] = true;
      saveState();
      sleep(3); // 请求之间留间隔，降低被端点拒连的概率
    } catch (error) {
      console.log(`  MISS ${shot.id}: ${error.message}`);
      failed.push(shot.id);
      continue;
    }
  }

  const body = join(AUDIO_DIR, `${shot.id}-body.wav`);
  execFileSync(FFMPEG, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    mp3,
    '-ar',
    '44100',
    '-ac',
    '2',
    body,
  ]);

  const listFile = join(AUDIO_DIR, `${shot.id}.txt`);
  writeFileSync(
    listFile,
    [head, body].map((file) => `file '${file.replace(/\\/g, '/')}'`).join('\n'),
    'utf8',
  );
  const wavOut = join(AUDIO_DIR, `${shot.id}.wav`);
  execFileSync(FFMPEG, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c',
    'copy',
    wavOut,
  ]);

  durations[shot.id] = Number(ffprobeDuration(wavOut).toFixed(3));
  console.log(`audio ${shot.id}: ${durations[shot.id]}s (${shot.narration.length} 字)`);
}

if (failed.length) {
  console.log(`voice=${VOICE} 未完成 ${failed.length} 镜：${failed.join(', ')}`);
  console.log('直接重跑本脚本即可只补缺口（已完成的镜会跳过）。');
  process.exit(2);
}

writeFileSync(join(AUDIO_DIR, 'durations.json'), JSON.stringify(durations, null, 2), 'utf8');
const total = Object.values(durations).reduce((a, b) => a + b, 0);
console.log(`voice=${VOICE} rate=${RATE} pitch=${PITCH}`);
console.log(`total narration: ${total.toFixed(1)}s`);
