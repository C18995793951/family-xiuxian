#!/usr/bin/env node
// 构建：把 src/ 下的样式、核心与界面脚本内联成单个 dist/family-xiuxian.html
'use strict';
const fs = require('fs');
const path = require('path');
const { FILES } = require('./test/load-core');
const src = (p) => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const UI_FILES = ['storage', 'ai', 'app'];
const core = FILES.map((f) => `/* ---------- core/${f}.js ---------- */\n` + src('core/' + f + '.js')).join('\n');
const ui = UI_FILES.map((f) => `/* ---------- ui/${f}.js ---------- */\n` + src('ui/' + f + '.js')).join('\n');
const guard = (s) => s.replace(/<\/script/gi, '<\\/script');
const html = src('index.html')
  .replace('/*@@CSS@@*/', () => src('ui/style.css'))
  .replace('/*@@CORE@@*/', () => guard(core))
  .replace('/*@@UI@@*/', () => guard(ui));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const out = path.join(__dirname, 'dist', 'family-xiuxian.html');
fs.writeFileSync(out, html);
console.log('已生成 ' + out + '（' + (html.length / 1024).toFixed(1) + ' KB）');
