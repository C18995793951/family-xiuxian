// 界面冒烟测试：用 Playwright 打开单文件，开局、过几十年、处理遭遇、翻遍各页、存读档，
// 检查控制台错误、网络请求与手机宽度横向滚动。用法：node test/ui-smoke.js [截图输出目录]
'use strict';
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const out = process.argv[2] || path.join(__dirname, 'out');
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const net = [];
  ctx.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) net.push(r.url()); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'family-xiuxian.html'));
  await page.screenshot({ path: path.join(out, 'start.png'), fullPage: true });
  await page.click('[data-act="pickOrigin"][data-k="clan"]');
  await page.fill('#in-surname', '沈');
  await page.fill('#in-given', '青');
  await page.fill('#in-seed', 'ui-smoke');
  await page.click('[data-act="newGame"]');
  const name = await page.evaluate(() => FX.P.player(FX.UI.s).name);
  if (name !== '沈青') throw new Error('自定姓名未生效：' + name);
  await page.screenshot({ path: path.join(out, 'now.png'), fullPage: true });

  // 依次点按钮过日子：先往外走，再游历、修炼，遇事就选第一个可选项
  let events = 0, steps = 0;
  const startYear = await page.evaluate(() => FX.UI.s.year);
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(() => ({ y: FX.UI.s.year, ended: !!FX.UI.s.ended }));
    if (st.ended || st.y - startYear >= 40) break;
    const choose = await page.$('.modal [data-act="choose"]:not([disabled])');
    if (choose) { if (events === 0) await page.screenshot({ path: path.join(out, 'event.png') }); events++; await choose.click(); continue; }
    const close = await page.$('.modal [data-act="close"]');
    if (close) { await close.click(); continue; }
    if (await page.$('.modal')) { await page.click('.modal-bg', { position: { x: 5, y: 5 } }); continue; }
    steps++;
    const pick = await page.evaluate((k) => {
      const A = FX.Game.actions(FX.UI.s);
      const want = k % 6 === 0 ? 'travel' : k % 3 === 0 ? 'explore' : 'cultivate';
      const i = A.findIndex((a) => a.ok && a.type === want && (want !== 'cultivate' || a.days === 360));
      return i;
    }, i);
    const btn = pick >= 0 ? await page.$(`main [data-act="do"][data-i="${pick}"]`) : null;
    if (btn) await btn.click(); else await page.click('main [data-act="do"]:not([disabled])');
  }
  const year = await page.evaluate(() => FX.UI.s.year);

  for (const p of ['map', 'people', 'bag', 'chron', 'sys', 'now']) {
    await page.click(`nav.side [data-act="page"][data-p="${p}"]`);
    await page.screenshot({ path: path.join(out, 'page-' + p + '.png'), fullPage: true });
  }
  // 地图点地点
  await page.click('nav.side [data-act="page"][data-p="map"]');
  await page.click('svg.map .node:not(.here)');
  await page.screenshot({ path: path.join(out, 'place.png') });
  await page.keyboard.press('Escape');
  // 人物卡
  await page.click('nav.side [data-act="page"][data-p="people"]');
  const pbtn = await page.$('main [data-act="person"]');
  if (pbtn) { await pbtn.click(); await page.screenshot({ path: path.join(out, 'person.png') }); await page.keyboard.press('Escape'); }

  // 刷新后状态不丢
  const h1 = await page.evaluate(() => FX.Game.save.hash(FX.UI.s));
  await page.waitForTimeout(600);
  await page.reload();
  await page.click('[data-act="continue"]');
  await page.waitForFunction(() => FX.UI.s);
  const h2 = await page.evaluate(() => FX.Game.save.hash(FX.UI.s));
  if (h1 !== h2) throw new Error('刷新后状态不一致');

  // 手机宽度：无横向滚动
  const m = await browser.newContext({ viewport: { width: 375, height: 780 } });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await mp.goto('file://' + path.join(__dirname, '..', 'dist', 'family-xiuxian.html'));
  await mp.click('[data-act="newGame"]');
  const overflow = [];
  for (const p of ['now', 'map', 'people', 'bag', 'chron', 'sys']) {
    await mp.click(`nav.bottom [data-act="page"][data-p="${p}"]`);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (w > 376) overflow.push(p + ':' + w);
    if (p === 'now') await mp.screenshot({ path: path.join(out, 'mobile-now.png'), fullPage: true });
  }
  await browser.close();
  const report = { years: year - startYear, steps, events, errors, net, overflow };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || net.length || overflow.length) process.exit(1);
  console.log('✓ 界面冒烟测试通过：' + (year - startYear) + ' 年、' + steps + ' 次行动、' + events + ' 件遭遇，无报错、无网络请求、手机宽度无横向滚动，刷新后状态一致');
})().catch((e) => { console.error(e); process.exit(1); });
