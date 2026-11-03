// 手机网页版冒烟测试：在本机起一个静态服务器发布 docs/，用手机尺寸打开，
// 检查 manifest 与图标、离线缓存注册，开一局后断网刷新仍能读档接着玩。用法：node test/web-smoke.js [截图输出目录]
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'docs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };
const fail = (msg) => { console.error('✗ ' + msg); process.exit(1); };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/family-xiuxian/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/family-xiuxian/`;
  const shots = process.argv[2];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await pg.goto(base);
    await pg.waitForSelector('[data-act="newGame"]');
    // manifest 与图标
    const man = await pg.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); const r = await fetch(l.href); return r.ok ? r.json() : null; });
    if (!man || man.display !== 'standalone' || man.icons.length < 3) fail('manifest 读不到或不完整');
    for (const ic of man.icons) { const st = await pg.evaluate(async (u) => (await fetch(u)).status, new URL(ic.src, base).href); if (st !== 200) fail('图标缺失：' + ic.src); }
    // 离线缓存注册并接管
    const sw = await pg.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return !!reg.active; });
    if (!sw) fail('离线缓存没有注册上');
    await pg.reload(); await pg.waitForSelector('[data-act="newGame"]');
    if (!(await pg.evaluate(() => !!navigator.serviceWorker.controller))) fail('离线缓存没有接管页面');
    if (!(await pg.locator('text=装到手机主屏幕').count())) fail('开局页没有“装到主屏幕”的提示');
    if (shots) await pg.screenshot({ path: path.join(shots, 'web-start.png'), fullPage: true });
    // 开一局，走几步
    await pg.fill('#in-seed', 'web-smoke');
    await pg.click('[data-act="newGame"]');
    await pg.waitForSelector('nav.bottom');
    for (let i = 0; i < 3; i++) {
      const b = pg.locator('main button.primary:not([disabled])').first();
      if (await b.count()) await b.click();
      while (await pg.locator('.modal [data-act="choose"]:not([disabled])').count()) await pg.locator('.modal [data-act="choose"]:not([disabled])').first().click();
    }
    const year1 = await pg.evaluate(() => FX.UI.s.t);
    await pg.waitForTimeout(500);
    // 断网刷新：页面从缓存出来，自动存档还在
    await ctx.setOffline(true);
    await pg.reload(); await pg.waitForSelector('[data-act="continue"]:not([disabled])');
    await pg.click('[data-act="continue"]');
    await pg.waitForSelector('nav.bottom');
    const year2 = await pg.evaluate(() => FX.UI.s.t);
    if (year2 !== year1) fail(`断网刷新后进度不一致：${year1} → ${year2}`);
    await pg.locator('nav.bottom [data-act="page"][data-p="sys"]').click();
    if (!(await pg.locator('text=装到手机主屏幕').count())) fail('设置页没有“装到主屏幕”的提示');
    if (shots) await pg.screenshot({ path: path.join(shots, 'web-sys.png'), fullPage: true });
    const wide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) fail('手机宽度出现横向滚动');
    const real = errs.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e));
    if (real.length) fail('控制台报错：' + real.join(' | '));
    console.log('✓ 手机网页版冒烟测试通过：manifest 与 ' + man.icons.length + ' 个图标齐全，离线缓存接管，断网刷新后读档接着玩，无报错');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => fail(e.stack || String(e)));
