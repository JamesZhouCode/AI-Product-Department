// 合成：每镜 = 版式 PNG（缓慢推近 + 淡入淡出）+ 旁白 WAV → 逐镜 MP4 → 拼接成片。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { SHOTS } from './script.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = join(HERE, 'frames');
const AUDIO_DIR = join(HERE, 'audio');
const CLIPS_DIR = join(HERE, 'clips');
mkdirSync(CLIPS_DIR, { recursive: true });

const FFMPEG =
  'C:/Users/周展鹏/.workbuddy/binaries/python/envs/default/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
const FPS = 25;
const TAIL = 0.8; // 每镜旁白后的停留时间（秒）

const durations = JSON.parse(readFileSync(join(AUDIO_DIR, 'durations.json'), 'utf8'));

function wavDuration(wav) {
  const { stderr } = spawnSync(FFMPEG, ['-hide_banner', '-i', wav, '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const match = String(stderr).match(/time=(\d+):(\d+):([\d.]+)/);
  if (!match) throw new Error(`no duration: ${wav}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const clips = [];
for (const shot of SHOTS) {
  const png = join(FRAMES_DIR, `${shot.id}.png`);
  const wav = join(AUDIO_DIR, `${shot.id}.wav`);
  const clip = join(CLIPS_DIR, `${shot.id}.mp4`);
  const narration = wavDuration(wav);
  const total = narration + TAIL;
  const frames = Math.round(total * FPS);
  const fadeOut = Math.max(0, total - 0.4);
  execFileSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    // -loop 1：单张 PNG 循环读入展成 N 帧（此前由 zoompan 负责，静止画面后必须显式加）。
    '-loop', '1', '-framerate', String(FPS), '-i', png,
    '-i', wav,
    '-filter_complex',
    [
      // 静止画面 + 淡入淡出：不做任何推近/平移，保证画面绝对稳定不抖动。
      `[0:v]scale=1920:1080,fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOut.toFixed(2)}:d=0.4,format=yuv420p[v]`,
      '[1:a]aresample=44100,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
    ].join(';'),
    '-map', '[v]', '-map', '[a]',
    '-t', total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
    clip,
  ]);
  clips.push(clip);
  console.log(`clip ${shot.id}: ${total.toFixed(2)}s`);
}

const listFile = join(CLIPS_DIR, 'list.txt');
writeFileSync(
  listFile,
  clips.map((clip) => `file '${clip.replace(/\\/g, '/')}'`).join('\n'),
  'utf8',
);
const finalPath = join(HERE, '产业驱动链介绍.mp4');
// 静态画面下 -c copy 拼接会让时间戳错乱（成片只剩每镜 1 帧），必须重编码拼接。
execFileSync(FFMPEG, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'concat', '-safe', '0', '-i', listFile,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-r', String(FPS), '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
  '-movflags', '+faststart', finalPath,
]);
const totalSec = SHOTS.reduce((sum, shot) => sum + durations[shot.id] + TAIL, 0);
console.log(`final: ${finalPath} (~${(totalSec / 60).toFixed(1)} min)`);
