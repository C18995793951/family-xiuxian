#!/usr/bin/env node
// 生成手机网页版的图标（docs/icons/*.png）。只在改图标时手动跑一回：node tools/make-icons.js
// 需要 Playwright 和一款中文字体；生成的 PNG 再压成 128 色调色板（PIL quantize）后提交，平时构建不依赖它。
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'docs', 'icons');
// full：满铺方块（给 iOS 和 maskable，系统自己切圆角）；tile：留透明圆角（给桌面与普通图标）
const SPECS = [
  { file: 'icon-192.png', size: 192, mode: 'tile' },
  { file: 'icon-512.png', size: 512, mode: 'tile' },
  { file: 'icon-maskable-512.png', size: 512, mode: 'full' },
  { file: 'apple-touch-icon.png', size: 180, mode: 'full' },
];

function draw(size, mode) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const S = size / 512;
  const r = mode === 'tile' ? 96 * S : 0;
  g.beginPath();
  g.moveTo(r, 0); g.arcTo(size, 0, size, size, r); g.arcTo(size, size, 0, size, r); g.arcTo(0, size, 0, 0, r); g.arcTo(0, 0, size, 0, r);
  g.closePath();
  const bg = g.createRadialGradient(size / 2, size * 0.44, 0, size / 2, size / 2, size * 0.75);
  bg.addColorStop(0, '#3a2a17'); bg.addColorStop(0.55, '#211a14'); bg.addColorStop(1, '#120e0b');
  g.fillStyle = bg; g.fill();
  g.save(); g.clip();
  // 金丹光晕
  const glow = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.36);
  glow.addColorStop(0, 'rgba(240,190,96,.30)'); glow.addColorStop(1, 'rgba(240,190,96,0)');
  g.fillStyle = glow; g.fillRect(0, 0, size, size);
  // 两道圆环（maskable 的安全区是中间 80%，环放在 64% 以内）
  g.strokeStyle = 'rgba(224,169,79,.85)'; g.lineWidth = 6 * S;
  g.beginPath(); g.arc(size / 2, size / 2, 158 * S, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(224,169,79,.35)'; g.lineWidth = 2.5 * S;
  g.beginPath(); g.arc(size / 2, size / 2, 176 * S, 0, Math.PI * 2); g.stroke();
  // 字
  g.fillStyle = '#f0c46a';
  g.font = `bold ${200 * S}px "WenQuanYi Zen Hei", "Noto Sans SC", "PingFang SC", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 12 * S; g.shadowOffsetY = 4 * S;
  g.fillText('仙', size / 2, size / 2 + 8 * S);
  g.restore();
  return c.toDataURL('image/png');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.setContent('<html><body></body></html>');
  for (const sp of SPECS) {
    const url = await pg.evaluate(`(${draw})(${sp.size}, ${JSON.stringify(sp.mode)})`);
    fs.writeFileSync(path.join(OUT, sp.file), Buffer.from(url.split(',')[1], 'base64'));
    console.log('已生成 docs/icons/' + sp.file);
  }
  await b.close();
})();
