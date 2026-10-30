// 界面冒烟测试：用 Playwright 打开单文件，开局、推进 100 年、处理事件、存读档，检查控制台错误与手机宽度横向滚动。
// 用法：node test/ui-smoke.js [截图输出目录]
'use strict';
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'out');
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'family-xiuxian.html'));
  await page.click('[data-act="pickOrigin"][data-k="hermit"]');
  await page.fill('#in-surname', '沈');
  await page.fill('#in-seed', 'ui-smoke');
  await page.click('[data-act="newGame"]');
  await page.screenshot({ path: path.join(out, 'hall.png'), fullPage: true });
  let events = 0;
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(() => ({ y: FX.UI.s.year, ended: !!FX.UI.s.ended, pending: FX.UI.s.pending.length }));
    if (st.ended || st.y > 101) break;
    if (await page.$('[data-act="confirmYes"]')) { await page.click('[data-act="confirmYes"]'); continue; }
    const choose = await page.$('.modal [data-act="choose"]:not([disabled])');
    if (choose) { if (events === 0) await page.screenshot({ path: path.join(out, 'event.png') }); events++; await choose.click(); continue; }
    if (await page.$('.modal [data-act="close"]')) { await page.click('.modal [data-act="close"]'); continue; }
    if (i % 5 === 0) { await page.click('[data-act="page"][data-p="cult"]'); const sg = await page.$('[data-act="suggest"][data-all="0"]:not([disabled])'); if (sg) await sg.click(); await page.click('[data-act="page"][data-p="hall"]'); }
    await page.click('[data-act="advance"]');
  }
  for (let i = 0; i < 20 && (await page.$('.modal')); i++) {
    const b = (await page.$('.modal [data-act="confirmYes"]')) || (await page.$('.modal [data-act="choose"]:not([disabled])')) || (await page.$('.modal [data-act="close"]'));
    if (b) await b.click();
  }
  const year = await page.evaluate(() => FX.UI.s.year);
  for (const p of ['roster', 'cult', 'econ', 'chron', 'tree', 'fac', 'rules', 'hall']) {
    await page.click(`nav.side [data-act="page"][data-p="${p}"]`);
    await page.screenshot({ path: path.join(out, 'page-' + p + '.png'), fullPage: true });
  }
  // 人物卡
  await page.click('[data-act="page"][data-p="roster"]');
  await page.click('main [data-act="person"]');
  await page.screenshot({ path: path.join(out, 'person.png') });
  await page.keyboard.press('Escape');
  // 刷新后状态不丢
  const h1 = await page.evaluate(() => FX.Game.save.hash(FX.UI.s));
  const j1 = await page.evaluate(() => JSON.stringify(FX.UI.s));
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('[data-act="continue"]:not([disabled])');
  await page.click('[data-act="continue"]');
  await page.waitForFunction(() => FX.UI.s);
  const h2 = await page.evaluate(() => FX.Game.save.hash(FX.UI.s));
  const j2 = await page.evaluate(() => JSON.stringify(FX.UI.s));
  if (j1 !== j2) { let i = 0; while (j1[i] === j2[i]) i++; console.log('DIFF', j1.slice(i - 200, i + 80), '\n|||\n', j2.slice(i - 200, i + 80)); }
  // 导出文本再导入
  await page.click('nav.side [data-act="page"][data-p="rules"]');
  await page.click('main [data-act="openSaves"]');
  await page.click('[data-act="exportText"]');
  await page.waitForSelector('.modal textarea[readonly]');
  const txt = await page.$eval('.modal textarea[readonly]', (e) => e.value);
  await page.fill('#in-text', txt);
  await page.evaluate(() => { FX.UI.s.__marker = 1; });
  await page.click('[data-act="importText"]');
  await page.waitForFunction(() => FX.UI.s && !FX.UI.s.__marker);
  const h3 = await page.evaluate(() => FX.Game.save.hash(FX.UI.s));
  // 手机宽度
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 400, height: 860 });
  m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await m.goto('file://' + path.join(__dirname, '..', 'dist', 'family-xiuxian.html'));
  await m.waitForSelector('[data-act="continue"]:not([disabled])');
  await m.click('[data-act="continue"]');
  await m.waitForFunction(() => FX.UI.s);
  for (let i = 0; i < 5 && (await m.$('.modal [data-act="close"]')); i++) await m.click('.modal [data-act="close"]');
  const overflow = {};
  for (const p of ['hall', 'roster', 'cult', 'econ', 'chron']) {
    await m.click(`nav.bottom [data-act="page"][data-p="${p}"]`);
    overflow[p] = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await m.screenshot({ path: path.join(out, 'mobile-' + p + '.png'), fullPage: false });
  }
  await browser.close();
  console.log(JSON.stringify({ year, events, reloadSame: h1 === h2, importSame: h2 === h3, overflow, errors }, null, 1));
  process.exit(errors.length || h1 !== h2 || h2 !== h3 || Object.values(overflow).some((x) => x > 0) ? 1 : 0);
})();
