// 界面冒烟测试：用 Playwright 打开单文件，开局、推进 100 年、处理事件、存读档，检查控制台错误与手机宽度横向滚动。
// 用法：node test/ui-smoke.js [截图输出目录]
'use strict';
const path = require('path');
const { chromium } = require('playwright');
// 处理掉所有弹窗（事件按第一个可选项）
async function drain(page) {
  for (let i = 0; i < 30 && (await page.$('.modal')); i++) {
    const b = (await page.$('.modal [data-act="confirmYes"]')) || (await page.$('.modal [data-act="choose"]:not([disabled])')) || (await page.$('.modal [data-act="close"]'));
    if (b) await b.click(); else break;
  }
}
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'out');
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  // 无 key 时不得有任何网络请求（只允许 file:// 与 data:）
  const net = [];
  ctx.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) net.push(r.url()); });
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
  await drain(page);
  const offlineRequests = net.length;
  // AI 润色：拦截 DeepSeek 接口（不发真实请求），回声返回一行事实
  const KEY = 'sk-SMOKE-0123456789abcdefSECRET';
  const sent = [];
  await ctx.route('https://api.deepseek.com/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData());
    sent.push({ auth: req.headers().authorization, body: req.postData() });
    const user = body.messages[body.messages.length - 1].content;
    const content = /原文：/.test(user) ? user.split('原文：')[1].split('\n')[0] : user.split('\n').slice(1).filter((x) => x && !x.startsWith('【')).slice(0, 2).join('\n') || '通';
    await route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify({ choices: [{ message: { content } }] }) });
  });
  await page.click('nav.side [data-act="page"][data-p="rules"]');
  await page.check('#in-aion');
  await page.fill('#in-aikey', KEY);
  await page.click('[data-act="aiKey"]');
  const keyEcho = await page.$eval('#in-aikey', (e) => e.value);
  await page.click('[data-act="aiTest"]');
  await page.waitForFunction(() => /测试连接：成功/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => errors.push('AI 测试连接未成功'));
  await page.click('nav.side [data-act="page"][data-p="hall"]');
  for (let i = 0; i < 20 && !(await page.$('.modal .ai-tag')); i++) {
    if (await page.$('[data-act="confirmYes"]')) { await page.click('[data-act="confirmYes"]'); continue; }
    const c = await page.$('.modal [data-act="choose"]:not([disabled])');
    if (c) { await c.click(); continue; }
    if (await page.$('.modal')) { await page.waitForTimeout(300); if (await page.$('.modal .ai-tag')) break; await page.click('.modal [data-act="close"]'); continue; }
    if (await page.evaluate(() => !!FX.UI.s.ended)) break;
    await page.click('[data-act="advance"]');
    await page.waitForTimeout(300);
  }
  const aiShown = !!(await page.$('.modal .ai-tag'));
  if (aiShown) {
    await page.screenshot({ path: path.join(out, 'ai-report.png') });
    await page.click('.modal [data-act="aiRaw"]');
    if (!(await page.$('.modal .log'))) errors.push('看原文 未切回模板');
  } else errors.push('回合摘要未出现 AI 润色');
  await drain(page);
  const hAi0 = await page.evaluate(() => FX.Game.save.hash(FX.UI.s));
  await page.click('nav.side [data-act="page"][data-p="hall"]');
  await page.click('[data-act="aiPolish"][data-kind="advice"]');
  await page.waitForFunction(() => /AI 建议/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => errors.push('军师建议未出现'));
  await page.click('nav.side [data-act="page"][data-p="chron"]');
  await page.click('main [data-act="history"]');
  await page.click('.modal [data-act="aiPolish"][data-kind="history"]');
  await page.waitForSelector('.modal .ai-tag', { timeout: 5000 }).catch(() => errors.push('家史润色未出现'));
  await page.screenshot({ path: path.join(out, 'ai-history.png') });
  await drain(page);
  // 润色只改显示：军师与家史两次调用前后状态哈希一致（逐年对照见 test/ai-tests.js A5）
  const hAi1 = await page.evaluate(() => FX.Game.save.hash(FX.UI.s));
  const exported = await page.evaluate(() => FX.Game.save.serialize(FX.UI.s, Date.now()));
  const aiCheck = { aiShown, requests: sent.length, keyEcho: keyEcho === '', keyOnlyInHeader: sent.every((x) => x.auth === 'Bearer ' + KEY && !x.body.includes(KEY)), keyNotInSave: !exported.includes(KEY), hashStable: hAi1 === hAi0 };
  if (!aiCheck.keyEcho || !aiCheck.keyOnlyInHeader || !aiCheck.keyNotInSave || !aiCheck.hashStable || !sent.length) errors.push('AI 检查失败：' + JSON.stringify(aiCheck));
  // 关掉 AI，后续不再发请求
  await drain(page);
  await page.click('nav.side [data-act="page"][data-p="rules"]');
  await page.uncheck('#in-aion');
  const sentBefore = sent.length;
  await page.click('nav.side [data-act="page"][data-p="hall"]');
  if (await page.$('[data-act="advance"]:not([disabled])')) { await page.click('[data-act="advance"]'); await page.waitForTimeout(500); }
  if (sent.length !== sentBefore) errors.push('关闭 AI 后仍发请求');
  await page.evaluate(() => { localStorage.removeItem('family-xiuxian:ai'); localStorage.removeItem('family-xiuxian:ai-key'); });
  // 手机宽度
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 400, height: 860 });
  m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await m.goto('file://' + path.join(__dirname, '..', 'dist', 'family-xiuxian.html'));
  await m.waitForSelector('[data-act="continue"]:not([disabled])');
  await m.click('[data-act="continue"]');
  await m.waitForFunction(() => FX.UI.s);
  await drain(m);
  const overflow = {};
  for (const p of ['hall', 'roster', 'cult', 'econ', 'chron']) {
    await m.click(`nav.bottom [data-act="page"][data-p="${p}"]`);
    overflow[p] = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await m.screenshot({ path: path.join(out, 'mobile-' + p + '.png'), fullPage: false });
  }
  await browser.close();
  console.log(JSON.stringify({ year, events, reloadSame: h1 === h2, importSame: h2 === h3, offlineRequests, ai: aiCheck, overflow, errors }, null, 1));
  process.exit(errors.length || offlineRequests || h1 !== h2 || h2 !== h3 || Object.values(overflow).some((x) => x > 0) ? 1 : 0);
})();
