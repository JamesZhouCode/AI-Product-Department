// 「产业驱动链」宣传片 · 第二轮版式：以系统 demo 实拍为主，不再使用 PPT 卡片版式。
// 每镜 = 一张系统实拍截图（铺满 1920×1080）+ 轻量叠加（章节胶囊 / STEP 角标 /
// 切换器高亮框 / 效率对比浮层）+ 底部字幕条。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS } from './script.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'slides');
const SHOTS_DIR = '../shots2'; // 4K 实拍（3840×2160），特写放大依然清晰；slides 在子目录故用 ../
mkdirSync(OUT, { recursive: true });

// 每镜的画面配置：底图 + 可选叠加
const LAYOUT = {
  '01-title': { img: '储能产业-地图.png', chip: '产业驱动链 · 系统实拍' },
  '02-ic': { img: '集成电路-图谱.png', chip: '三条赛道', hlSwitcher: true, note: '顶栏一键切换产业链' },
  '03-storage': { img: '储能产业-图谱.png', chip: '三条赛道', hlSwitcher: true, note: '切到储能产业' },
  '04-compute': { img: '算力产业-图谱.png', chip: '三条赛道', hlSwitcher: true, note: '切到算力产业' },
  '05-manual': { img: '储能产业-流程.png', chip: '效率对比', overlay: 'manual' },
  '06-auto': { img: '储能产业-图谱.png', chip: '效率对比', overlay: 'auto' },
  '07-step1': { img: '储能产业-流程.png', chip: '建链六步 · 以储能为例', step: 'STEP 1 · 拆解环节骨架' },
  '08-step2': {
    img: '储能产业-流程.png',
    chip: '建链六步 · 以储能为例',
    step: 'STEP 2 · 多来源采集',
    pip: { img: '../assets/pip-step2.png', width: 1210, bottom: 118 }, // 画中画：思维导图「企业获取渠道（四类）」
  },
  '09-step3': {
    img: '储能产业-图谱.png',
    chip: '建链六步 · 以储能为例',
    step: 'STEP 3 · 企业去重与主体对齐',
    zoom: { k: 2.1, ox: 0.5, oy: 0.42 }, // 聚焦图谱中部的企业清单行
  },
  '10-step4': { img: '储能产业-图谱.png', chip: '建链六步 · 以储能为例', step: 'STEP 4 · 环节归属' },
  '11-step5': {
    img: '储能产业-流程-头部打标.png',
    chip: '建链六步 · 以储能为例',
    step: 'STEP 5 · 头部腰部尾部分层',
    pip: { img: '../assets/pip-step5.png', width: 1150, bottom: 104 }, // 画中画：思维导图「头/腰/尾判断」
  },
  '12-step6': { img: '储能产业-地图.png', chip: '建链六步 · 以储能为例', step: 'STEP 6 · 成图落图' },
  '13-hard1': { img: '算力产业-流程.png', chip: '技术落地的困难点', step: '难点一 · 非标数据与主体对齐' },
  '14-hard2': { img: '算力产业-图谱.png', chip: '技术落地的困难点', step: '难点二 · 数据稀缺与关系缺失' },
  '14-hard3': { img: '储能产业-分析.png', chip: '技术落地的困难点', step: '难点三 · 数据更新周期不一致' },
  '15-end': { img: '储能产业-地图.png', chip: '产业驱动链 · 数字底图' },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// zoom：把原图中 (ox, oy)（相对位置）聚焦到画面中心，放大 k 倍。
function imgStyle(zoom) {
  if (!zoom) return '';
  const { k, ox, oy } = zoom;
  const left = (0.5 - ox * k) * 100;
  const top = (0.5 - oy * k) * 100;
  return `position:absolute;width:${k * 100}%;height:auto;left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;`;
}

function buildSlide(shot) {
  const cfg = LAYOUT[shot.id];
  if (!cfg) throw new Error(`no layout for ${shot.id}`);
  const img = `${SHOTS_DIR}/${cfg.img}`;

  const stepChip = cfg.step ? `<div class="stepchip">${esc(cfg.step)}</div>` : '';
  const subnote = cfg.subnote
    ? `<div class="subnote">※ ${esc(cfg.subnote)}</div>`
    : '';
  const pip = cfg.pip
    ? `<div class="pip" style="width:${cfg.pip.width}px;bottom:${cfg.pip.bottom}px;"><img src="${SHOTS_DIR}/${cfg.pip.img}"></div>`
    : '';
  const switcherHl = cfg.hlSwitcher
    ? `
    <div class="hl-box"></div>
    <div class="hl-note">▾ ${esc(cfg.note)}</div>`
    : '';
  const overlay = cfg.overlay
    ? cfg.overlay === 'manual'
      ? `
    <div class="ovl">
      <div class="ovl-tag" style="background:#8a2f1d;">人工研究</div>
      <div class="ovl-big">3–5 人 × 6–8 周</div>
      <div class="ovl-sub">只覆盖头部腰部 · 尾部靠检索运气 · 口径因人而异</div>
    </div>`
      : `
    <div class="ovl">
      <div class="ovl-tag" style="background:#0b6e8a;">智能建链</div>
      <div class="ovl-big">1–2 人 × 1–2 周</div>
      <div class="ovl-sub">头 63 · 腰 113 · 尾 61（上市企业）· 1,977 家 100% 环节归属<br>随智能体成熟，周期还会进一步压缩</div>
    </div>`
    : '';

  const imgTag = `<img src="${img}" style="${cfg.zoom ? imgStyle(cfg.zoom) : ''}">`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; }
  body { position: relative; font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; background: #0d1b28; }
  .shot { position: absolute; inset: 0; }
  .shot img { width: 100%; height: 100%; object-fit: cover; }

  .chip {
    position: absolute; top: 74px; left: 28px;
    background: rgba(13, 43, 69, 0.92); color: #fff;
    font-size: 21px; font-weight: 600; letter-spacing: 2px;
    padding: 9px 22px; border-radius: 999px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
  }
  .stepchip {
    position: absolute; top: 136px; left: 28px;
    background: rgba(11, 110, 138, 0.94); color: #fff;
    font-size: 26px; font-weight: 700; letter-spacing: 1px;
    padding: 10px 24px; border-radius: 10px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
  }
  .subnote {
    position: absolute; top: 196px; left: 28px;
    background: rgba(255, 207, 63, 0.95); color: #4a3200;
    font-size: 21px; font-weight: 600;
    padding: 7px 18px; border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  }

  /* 画中画：思维导图小卡 */
  .pip {
    position: absolute; left: 50%; transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.96);
    border: 2px solid rgba(13, 43, 69, 0.25);
    border-radius: 16px; padding: 10px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.35);
  }
  .pip img { width: 100%; height: auto; display: block; border-radius: 10px; }

  /* 顶栏产业切换器高亮 */
  .hl-box {
    position: absolute; left: 85.6%; top: 0.9%; width: 13.2%; height: 5.4%;
    border: 3px solid #ffcf3f; border-radius: 10px;
    box-shadow: 0 0 0 4px rgba(255, 207, 63, 0.28), 0 2px 16px rgba(0,0,0,0.35);
    background: rgba(255, 207, 63, 0.10);
  }
  .hl-note {
    position: absolute; left: 85.6%; top: 7.4%;
    background: #ffcf3f; color: #12324f;
    font-size: 20px; font-weight: 700; padding: 6px 16px; border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  }

  /* 效率对比浮层 */
  .ovl {
    position: absolute; top: 150px; left: 60px; width: 620px;
    background: rgba(10, 30, 48, 0.90);
    border-radius: 18px; padding: 34px 38px 30px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.45);
  }
  .ovl-tag {
    display: inline-block; color: #fff; font-size: 22px; font-weight: 700;
    padding: 6px 18px; border-radius: 999px; letter-spacing: 3px;
  }
  .ovl-big { color: #fff; font-size: 58px; font-weight: 900; margin-top: 18px; letter-spacing: 1px; }
  .ovl-sub { color: #c8d8e4; font-size: 23px; margin-top: 14px; line-height: 1.55; }

  .caption {
    position: absolute; bottom: 34px; left: 50%; transform: translateX(-50%);
    max-width: 82%;
    background: rgba(13, 43, 69, 0.92); color: #fff;
    font-size: 30px; font-weight: 600; letter-spacing: 1px;
    padding: 16px 44px; border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="shot">${imgTag}</div>
  <div class="chip">${esc(cfg.chip)}</div>
  ${stepChip}
  ${subnote}
  ${pip}
  ${switcherHl}
  ${overlay}
  <div class="caption">${esc(shot.caption)}</div>
</body>
</html>`;
}

for (const shot of SHOTS) {
  writeFileSync(join(OUT, `${shot.id}.html`), buildSlide(shot), 'utf8');
  console.log('slide', shot.id);
}
console.log(`done: ${SHOTS.length} slides -> ${OUT}`);
