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
  // 收尾：眼前还有待决的事（找上门的事会在行动后到），先处理掉
  for (let k = 0; k < 10; k++) {
    const c = await page.$('.modal [data-act="choose"]:not([disabled])');
    if (c) { await c.click(); events++; continue; }
    const x = await page.$('.modal [data-act="close"]');
    if (x) { await x.click(); continue; }
    break;
  }
  const year = await page.evaluate(() => FX.UI.s.year);

  for (const p of ['map', 'shop', 'bag', 'chron', 'sys', 'now']) {
    await page.click(`nav.side [data-act="page"][data-p="${p}"]`);
    await page.screenshot({ path: path.join(out, 'page-' + p + '.png'), fullPage: true });
  }
  // 地图点地点
  await page.click('nav.side [data-act="page"][data-p="map"]');
  await page.click('svg.map .node:not(.here)');
  await page.screenshot({ path: path.join(out, 'place.png') });
  await page.keyboard.press('Escape');
  // 传闻里插手：出预览卡
  await page.click('nav.side [data-act="page"][data-p="chron"]');
  await page.click('[data-act="chronFilter"][data-k="rumor"]');
  const ra = await page.$('main [data-act="rumorAct"]');
  if (!ra) throw new Error('传闻里没有能插手的事');
  await ra.click();
  await page.waitForSelector('.modal .say-quote');
  await page.screenshot({ path: path.join(out, 'rumor-act.png') });
  await page.keyboard.press('Escape');
  // 人物卡
  await page.click('nav.side [data-act="page"][data-p="chron"]');
  await page.click('main [data-act="page"][data-p="people"]');
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
  for (const p of ['now', 'shop', 'map', 'bag', 'sect', 'chron', 'people', 'sagas', 'sys']) {
    await mp.click(['people', 'sagas'].includes(p) ? `main [data-act="page"][data-p="${p}"]` : `nav.bottom [data-act="page"][data-p="${p}"]`);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (w > 376) overflow.push(p + ':' + w);
    if (p === 'now') await mp.screenshot({ path: path.join(out, 'mobile-now.png'), fullPage: true });
  }
  // 自由输入（AI 没开）：说一句，出预览卡，照做
  await mp.click('nav.bottom [data-act="page"][data-p="now"]');
  const sayIntent = async (text, wantAI) => {
    await mp.fill('#say-in', text);
    await mp.press('#say-in', 'Enter');
    await mp.waitForSelector('.modal .intent-plan [data-act="intentGo"]', { timeout: 10000 });
    const txt = await mp.textContent('.modal');
    if (wantAI && !/AI 的理解/.test(txt)) throw new Error('预览卡里没有 AI 的理解：' + txt.slice(0, 120));
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (w > 376) overflow.push('intent:' + w);
    await mp.screenshot({ path: path.join(out, wantAI ? 'mobile-intent-ai.png' : 'mobile-intent.png') });
    const t0 = await mp.evaluate(() => FX.UI.s.t);
    await mp.click('.modal [data-act="intentGo"]');
    const t1 = await mp.evaluate(() => FX.UI.s.t);
    if (t1 <= t0) throw new Error('照做以后时间没走：' + text);
    while (await mp.$('.modal')) { const c = await mp.$('.modal [data-act="choose"]:not([disabled])'); if (c) await c.click(); else await mp.keyboard.press('Escape'); }
  };
  await sayIntent('在这里游历几天', false);
  // AI：手机宽度下开启、填 key、测试连接，过几步看纪事叙述和小传；DeepSeek 用假回声顶替，不发真实请求
  const KEY = 'sk-UI-SMOKE-0123456789-SECRET';
  const aiNet = [];
  await mp.route('https://api.deepseek.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    aiNet.push({ auth: route.request().headers().authorization, model: body.model });
    const user = (body.messages || []).slice(-1)[0].content || '';
    if (/意图解析器/.test(body.messages[0].content)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"say":"你想在此地游历","steps":[{"do":"游历"}]}' } }], usage: { total_tokens: 100 } }) });
      return;
    }
    let content = /请只回复/.test(user) ? '通' : /原文：/.test(user) ? user.split('原文：')[1].split('\n')[0] : '';
    if (!content) { for (const l of user.split('\n').slice(1).filter(Boolean)) { if ((content + l).length > 300) break; content += (content ? '\n' : '') + l; } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 100 } }) });
  });
  await mp.click('nav.bottom [data-act="page"][data-p="sys"]');
  if (!(await mp.$('.ai-form'))) throw new Error('设置页没有 AI 卡片');
  await mp.fill('#ai-key', KEY);
  await mp.click('[data-act="aiKey"]');
  await mp.click('[data-act="aiToggle"]');
  await mp.click('[data-act="aiTest"]');
  await mp.waitForFunction(() => FX.AI.status && FX.AI.status.kind === 'test');
  const aiStatus = await mp.evaluate(() => FX.AI.statusText());
  if (!/成功/.test(aiStatus)) throw new Error('测试连接没通：' + aiStatus);
  const wAi = await mp.evaluate(() => document.documentElement.scrollWidth);
  if (wAi > 376) overflow.push('sys+ai:' + wAi);
  await mp.screenshot({ path: path.join(out, 'mobile-ai.png'), fullPage: true });
  await mp.click('nav.bottom [data-act="page"][data-p="now"]');
  let notes = 0;
  for (let i = 0; i < 60 && !notes; i++) {
    const yes = await mp.$('.modal [data-act="confirmYes"]');
    if (yes) { await yes.click(); continue; }
    const choose = await mp.$('.modal [data-act="choose"]:not([disabled])');
    if (choose) { await mp.waitForTimeout(50); await choose.click(); continue; }
    if (await mp.$('.modal')) { await mp.keyboard.press('Escape'); continue; }
    const q = await mp.$('.qbar button.primary:not([disabled])');
    if (q) await q.click(); else await mp.click('main [data-act="do"]:not([disabled])');
    await mp.waitForTimeout(80);
    notes = (await mp.$$('main .ai-note')).length;
  }
  if (!notes) throw new Error('过了 60 步，此刻页没出现 AI 叙述');
  await mp.screenshot({ path: path.join(out, 'mobile-ai-now.png'), fullPage: true });
  await mp.click('nav.bottom [data-act="page"][data-p="sys"]');
  await mp.click('[data-act="life"]');
  await mp.click('.modal [data-act="aiLife"]');
  await mp.waitForSelector('.modal .ai-note');
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: path.join(out, 'mobile-ai-life.png') });
  await mp.keyboard.press('Escape');
  await mp.click('nav.bottom [data-act="page"][data-p="now"]');
  await sayIntent('四处走走看看', true);
  const leak = await mp.evaluate((k) => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) { const n = localStorage.key(i); if (n !== 'family-xiuxian:ai-key' && String(localStorage.getItem(n)).includes(k)) out.push(n); }
    if (FX.Game.save.serialize(FX.UI.s, 1).includes(k)) out.push('存档');
    return out;
  }, KEY);
  if (leak.length) throw new Error('key 出现在：' + leak.join('、'));
  if (aiNet.some((r) => r.auth !== 'Bearer ' + KEY)) throw new Error('请求头里的 key 不对');
  const aiLog = await mp.evaluate(() => FX.UI.s.aiLog.map((r) => r.kind));
  await browser.close();
  const report = { years: year - startYear, steps, events, errors, net, overflow, ai: { requests: aiNet.length, notes, aiLog: aiLog.length } };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || net.length || overflow.length) process.exit(1);
  console.log('✓ 界面冒烟测试通过：' + (year - startYear) + ' 年、' + steps + ' 次行动、' + events + ' 件遭遇，无报错、无网络请求、手机宽度无横向滚动，刷新后状态一致；开启 AI（假 DeepSeek）后测试连接通过、此刻页出现叙述、小传写成、自由输入（有无 AI）预览后照做，key 只在请求头里');
})().catch((e) => { console.error(e); process.exit(1); });
