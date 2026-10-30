#!/usr/bin/env node
// AI 润色层测试：在 Node 中加载核心 + src/ui/ai.js，注入假 fetch / storage，不发任何真实网络请求。
// 覆盖：开关关闭零请求、无 key 回落、调用失败/超时回落、防编造校验、润色不影响状态哈希、key 不外泄。
// 用法：node test/ai-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');
const { STRATEGIES } = require('./strategies');

const FX = loadCore();
require(path.join(__dirname, '..', 'src', 'ui', 'ai.js'));
const AI = FX.AI;
const KEY = 'sk-TEST-0123456789abcdef-SECRET';

const results = [];
const assert = (c, m) => { if (!c) throw new Error(m); };
async function check(no, name, fn) {
  try {
    const detail = await fn();
    results.push({ no, name, ok: true, detail });
    console.log(`✓ ${no} ${name}${detail ? '：' + detail : ''}`);
  } catch (e) {
    results.push({ no, name, ok: false, detail: e.message });
    console.log(`✗ ${no} ${name}：${e.message}`);
    if (process.env.DEBUG) console.log(e.stack);
  }
}

/* ---------- 假环境 ---------- */
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), dump: () => [...m.entries()] };
}
// 回声模型：从用户消息里抄一行事实，保证只用给定事实
function echoReply(body) {
  const user = body.messages[body.messages.length - 1].content;
  const lines = user.split('\n').slice(1).filter((x) => x && !x.startsWith('【'));
  if (/原文：/.test(user)) return user.split('原文：')[1].split('\n')[0];
  if (/请只回复/.test(user)) return '通';
  return lines.slice(0, 3).join('\n') || '无事。';
}
function mockFetch(mode, log) {
  return (url, init) => {
    const body = JSON.parse(init.body);
    log.push({ url, init, body });
    if (mode === 'never') return new Promise(() => {});
    if (mode === 'reject') return Promise.reject(new TypeError('Failed to fetch'));
    if (typeof mode === 'number') return Promise.resolve({ ok: false, status: mode, json: async () => ({}) });
    const content = mode === 'empty' ? '' : mode === 'fabricate' ? '第 99999 年，族中出了位绝世天骄，一日连破三境。' : echoReply(body);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
  };
}
function setup({ enabled = true, key = KEY, mode = 'ok', timeoutMs = 30000 } = {}) {
  const log = [];
  AI.env = { fetch: mockFetch(mode, log), storage: memStorage(), now: () => 1767225600000 };
  AI.cache.clear(); AI.pending.clear(); AI.failed.clear(); AI.status = null;
  AI.saveConfig({ enabled, timeoutMs });
  if (key) AI.setKey(key);
  return log;
}
const hash = (s) => FX.Game.save.hash(s);
// 推进到至少一个回合结束（中途事件按策略处置）
function finishTurn(s) {
  for (let i = 0; i < 20 && !s.lastReport; i++) { STRATEGIES.reasonable(FX, s); FX.Game.advance(s); }
  assert(s.lastReport, '推进不到回合末');
}

// 一局游戏里能调用的所有润色入口
async function callAll(s) {
  const out = [];
  if (s.lastReport) out.push(await AI.polishTurn(s, s.lastReport.turn));
  out.push(await AI.advise(s));
  if (s.pending[0]) out.push(await AI.polishEvent(s, s.pending[0]));
  out.push(await AI.polishHistory(s));
  return out;
}
// 按策略跑一局；withAI 时每回合都把所有润色入口调一遍，并断言调用前后哈希不变
async function play(seed, years, withAI) {
  const s = FX.Game.newGame({ origin: 'market', seed });
  let calls = 0;
  for (let guard = 0; !s.ended && s.year - FX.CONFIG.startYear < years && guard < years * 4 + 50; guard++) {
    if (withAI) {
      const h0 = hash(s);
      await callAll(s);
      calls++;
      assert(hash(s) === h0, `第 ${s.year} 年润色前后哈希不同`);
    }
    STRATEGIES.reasonable(FX, s);
    if (s.ended) break;
    FX.Game.advance(s);
  }
  return { s, calls };
}

(async () => {
  await check('A1', '开关关闭零请求', async () => {
    const log = setup({ enabled: false });
    const { calls } = await play('ai-off', 60, true);
    assert(log.length === 0, `发出了 ${log.length} 个请求`);
    assert(AI.calls === 0 || AI.cache.size === 0, '缓存了润色文本');
    assert(/未开启/.test(AI.statusText()), AI.statusText());
    return `${calls} 回合 × 4 个入口，fetch 0 次；状态“${AI.statusText()}”`;
  });

  await check('A2', '无 key 回落（零请求）', async () => {
    const log = setup({ key: '' });
    const { s } = await play('ai-nokey', 30, true);
    assert(log.length === 0, `发出了 ${log.length} 个请求`);
    assert(AI.get(AI.turnKey(s, s.lastReport.turn)) === null, '无 key 时出现了润色文本');
    assert(/未填写 key/.test(AI.statusText()), AI.statusText());
    return '状态“' + AI.statusText() + '”，界面显示模板原文';
  });

  await check('A3', '调用失败 / 超时回落（不抛错、不缓存）', async () => {
    const s = FX.Game.newGame({ origin: 'market', seed: 'ai-fail' });
    finishTurn(s);
    const seen = [];
    for (const mode of [500, 401, 402, 429, 'reject', 'empty', 'never']) {
      setup({ mode, timeoutMs: 60 });
      const h0 = hash(s);
      const t0 = Date.now();
      const v = await AI.advise(s);
      assert(v === null, mode + ' 未回落');
      assert(Date.now() - t0 < 2000, mode + ' 等待过久');
      assert(AI.cache.size === 0, mode + ' 缓存了失败结果');
      assert(AI.failure(AI.adviceKey(s)), mode + ' 未记录失败原因');
      assert(hash(s) === h0, mode + ' 改动了状态');
      seen.push(`${mode}→${AI.status.reason}`);
    }
    assert(/超时/.test(seen[seen.length - 1]), '超时未识别');
    return seen.join('；');
  });

  await check('A4', '防编造：事实外的数字 / 人物被拒，回落原文', async () => {
    const s = FX.Game.newGame({ origin: 'market', seed: 'ai-fab' });
    finishTurn(s);
    setup({ mode: 'fabricate' });
    const v = await AI.polishTurn(s, s.lastReport.turn);
    assert(v === null, '编造文本被采用');
    const why = AI.failure(AI.turnKey(s, s.lastReport.turn));
    assert(/校验未通过/.test(why), why);
    const facts = '第 3 年：甲某晋入练气二层。';
    const someone = AI.knownNames(s).find((n) => !facts.includes(n));
    assert(AI.validate(`第 3 年，${someone}亦有所成。`, facts, s), '事实外人名未拦截');
    assert(AI.validate('第 3 年，甲某晋入练气二层。', facts, s) === null, '合规文本被误拒');
    assert(AI.validate('甲某闭关。', '甲某、乙某闭关', s, { mustNames: ['乙某'] }), '漏人名未拦截');
    return why;
  });

  await check('A5', '润色不影响状态哈希（开与关同种子同决策）', async () => {
    setup({ enabled: false });
    const off = await play('ai-hash', 100, false);
    const log = setup({ mode: 'ok' });
    const on = await play('ai-hash', 100, true);
    assert(hash(off.s) === hash(on.s), `哈希不同：${hash(off.s)} / ${hash(on.s)}`);
    assert(log.length > 0, '开启时没有发出请求');
    assert(AI.cache.size > 0, '没有任何润色通过校验');
    const ser = FX.Game.save.serialize(on.s, 0);
    for (const [, v] of AI.cache) assert(!ser.includes(v.text) || v.text.length < 12, '润色文本进了存档');
    return `100 年，${on.calls} 回合各调 4 个入口，${log.length} 次请求，${AI.cache.size} 段润色通过校验；两局哈希 ${hash(on.s)}`;
  });

  await check('A6', 'key 不外泄（存档 / 导出 / 日志 / 请求体）', async () => {
    const printed = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    for (const k of Object.keys(orig)) console[k] = (...a) => printed.push(a.join(' '));
    let log, s;
    try {
      log = setup({ mode: 'ok' });
      ({ s } = await play('ai-key', 30, true));
      setup({ mode: 500 }); AI.setKey(KEY); await AI.advise(s);
    } finally { Object.assign(console, orig); }
    const save = FX.Game.save.serialize(s, 0);
    assert(!save.includes(KEY), 'key 出现在存档里');
    assert(!printed.join('\n').includes(KEY), 'key 出现在日志里');
    assert(!JSON.stringify(AI.status).includes(KEY), 'key 出现在状态里');
    for (const c of log) {
      assert(c.url === AI.defaults.endpoint, '请求发往了非配置地址：' + c.url);
      assert(c.init.headers.Authorization === 'Bearer ' + KEY, 'key 未只放在 Authorization 头');
      assert(!c.init.body.includes(KEY), 'key 出现在请求体里');
      assert(!c.init.body.includes('"people"') && c.init.body.length < 8000, '请求体疑似包含完整存档');
      assert(c.body.thinking && c.body.thinking.type === 'disabled', '未关闭思考模式');
    }
    // 仓库与 dist 里不得出现像真 key 的字符串
    const root = path.join(__dirname, '..');
    const files = ['dist/family-xiuxian.html'].concat(fs.readdirSync(path.join(root, 'src/ui')).map((f) => 'src/ui/' + f), fs.readdirSync(path.join(root, 'src/core')).map((f) => 'src/core/' + f));
    const leaks = files.filter((f) => fs.existsSync(path.join(root, f)) && /sk-[A-Za-z0-9]{20,}/.test(fs.readFileSync(path.join(root, f), 'utf8')));
    assert(!leaks.length, '疑似硬编码 key：' + leaks.join(','));
    return `${log.length} 个请求均只发往 ${AI.defaults.endpoint}，最大请求体 ${Math.max(...log.map((c) => c.init.body.length))} 字节`;
  });

  await check('A7', '每日调用上限', async () => {
    const log = setup({ mode: 'ok' });
    AI.saveConfig({ dailyLimit: 2 });
    const s = FX.Game.newGame({ origin: 'market', seed: 'ai-limit' });
    for (let i = 0; i < 4; i++) { FX.Game.advance(s); while (s.pending.length) STRATEGIES.reasonable(FX, s); await AI.advise(s); }
    assert(log.length === 2, `上限 2 次却发了 ${log.length} 次`);
    assert(/上限/.test(AI.ready().reason), AI.ready().reason);
    return AI.ready().reason;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nAI 层 ${results.length - failed.length}/${results.length} 项通过`);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'ai-summary.json'), JSON.stringify({ results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
