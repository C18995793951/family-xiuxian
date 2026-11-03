#!/usr/bin/env node
// 构建：把 src/ 下的样式、核心与界面脚本内联成单个 dist/family-xiuxian.html
'use strict';
const fs = require('fs');
const path = require('path');
const { FILES } = require('./test/load-core');
const src = (p) => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const UI_FILES = ['storage', 'pwa', 'ai', 'director', 'app'];
const core = FILES.map((f) => `/* ---------- core/${f}.js ---------- */\n` + src('core/' + f + '.js')).join('\n');
const ui = UI_FILES.map((f) => `/* ---------- ui/${f}.js ---------- */\n` + src('ui/' + f + '.js')).join('\n');
const guard = (s) => s.replace(/<\/script/gi, '<\\/script');
const html = src('index.html')
  .replace('/*@@CSS@@*/', () => src('ui/style.css'))
  .replace('/*@@CORE@@*/', () => guard(core))
  .replace('/*@@UI@@*/', () => guard(ui));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const out = path.join(__dirname, 'dist', 'family-xiuxian.html');
fs.writeFileSync(out, html.replace('<!--@@WEBHEAD@@-->\n', ''));
console.log('已生成 ' + out + '（' + (html.length / 1024).toFixed(1) + ' KB）');

// 手机网页版：同一个页面加上 manifest 和离线缓存，放在 docs/ 下，由 GitHub Pages 发布
// （Settings → Pages → Deploy from a branch → /docs）。图标由 tools/make-icons.js 生成后提交。
const WEB = path.join(__dirname, 'docs');
const webHtml = html.replace('<!--@@WEBHEAD@@-->', [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
].join('\n'));
const hash = require('crypto').createHash('sha256').update(webHtml).update(src('web/manifest.webmanifest')).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(WEB, 'index.html'), webHtml);
fs.writeFileSync(path.join(WEB, 'manifest.webmanifest'), src('web/manifest.webmanifest'));
fs.writeFileSync(path.join(WEB, 'sw.js'), src('web/sw.js').replace('@@HASH@@', hash));
fs.writeFileSync(path.join(WEB, '.nojekyll'), '');
console.log('已生成手机网页版 ' + path.join(WEB, 'index.html') + '（缓存版本 ' + hash + '）');
