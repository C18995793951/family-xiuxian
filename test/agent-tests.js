#!/usr/bin/env node
// AI 家主托管测试：注入假模型，不发真实网络请求。
// 覆盖：只执行可选列表里的操作、列表外的 id 被跳过、模型失败时暂停且局面不动、
// 关闭 AI 时零请求、托管记录可重放（同种子同操作序列哈希逐位相同）。
// 用法：node test/agent-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');
const FX = loadCore();
require(path.join(__dirname, '..', 'src', 'ui', 'ai.js'));
require(path.join(__dirname, '..', 'src', 'ui', 'agent.js'));
const AI = FX.AI, Agent = FX.Agent;
const hash = (s) => FX.Game.save.hash(s);

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
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

// 假模型：从菜单里按简单偏好挑 id；可插入一个不存在的 id
function brain(opts) {
  opts = opts || {};
  return (body) => {
    const u = body.messages[body.messages.length - 1].content;
    if (/待决事件/.test(u)) {
      const lines = u.split('可选项')[1].split('\n').slice(1).filter((x) => x.includes('｜'));
      return JSON.stringify({ id: lines[0].split('｜')[0], why: '先求稳' });
    }
    const ids = u.split('可选操作')[1].split('\n').slice(1).filter((x) => x.includes('｜')).map((x) => x.split('｜')[0]);
    const pick = [];
    const pref = ['duty:attention', 'sell:grain', 'build:field', 'build:mine', 'build:cave'];
    for (const p of pref) if (ids.includes(p)) pick.push({ id: p, why: '补产业' });
    const br = ids.find((x) => x.startsWith('break:'));
    if (br) pick.push({ id: br, why: '时机已到' });
    const heir = ids.find((x) => x.startsWith('heir:'));
    if (heir && opts.heir !== false) pick.push({ id: heir, why: '早定名分' });
    if (opts.bogus) pick.unshift({ id: 'build:天宫', why: '凭空' });
    return JSON.stringify({ actions: pick, summary: '稳产业、育人才' });
  };
}
function setup(mode) {
  const log = [];
  AI.env = {
    storage: memStorage(), now: () => 1767225600000,
    fetch: (url, init) => {
      const body = JSON.parse(init.body);
      log.push(body);
      if (mode === 'fail') return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
      if (mode === 'garbage') return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '家主，我觉得应该……' } }] }) });
      const content = (typeof mode === 'function' ? mode : brain())(body);
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
    },
  };
  AI.cache.clear(); AI.pending.clear(); AI.failed.clear();
  AI.saveConfig({ enabled: mode !== 'off', dailyLimit: 10000 });
  AI.setKey('sk-AGENT-TEST');
  Agent.log = []; Agent.ops = []; Agent.running = false;
  return log;
}

(async () => {
  let saved = null;
  await check('B1', '托管 10 回合：只执行规则允许的操作，理由记进纪事', async () => {
    const log = setup(brain({ bogus: true }));
    const s = FX.Game.newGame({ origin: 'market', seed: 'agent-1' });
    const r = await Agent.run(s, 10);
    assert(r.ok, '托管中断：' + r.reason);
    assert(r.finished === 10 || s.ended, '完成回合数 ' + r.finished);
    const acts = Agent.ops.filter((o) => o[0] === 'act').length;
    const evs = Agent.ops.filter((o) => o[0] === 'event').length;
    const notes = s.history.filter((e) => e.type === 'agent');
    assert(notes.length >= acts + evs, '理由没有全部记进纪事');
    assert(Agent.log.some((x) => /跳过「build:天宫」/.test(x.text)), '列表外操作未被跳过');
    assert(log.every((b) => b.response_format && b.response_format.type === 'json_object'), '未要求 json 回复');
    saved = { seed: 'agent-1', ops: Agent.ops.slice(), notes: notes.map((e) => e.params.text), hash: hash(s) };
    return `${r.finished} 回合，${log.length} 次调用，执行 ${acts} 个操作、决断 ${evs} 件事件，第 ${s.year} 年`;
  });

  await check('B2', '托管记录可重放（同种子同操作序列哈希相同）', async () => {
    const s = FX.Game.newGame({ origin: 'market', seed: saved.seed });
    Agent.replay(s, saved.ops, saved.notes);
    assert(hash(s) === saved.hash, `哈希不同：${hash(s)} / ${saved.hash}`);
    return '哈希 ' + saved.hash;
  });

  for (const [no, mode, name] of [['B3', 'fail', '模型报错（503）'], ['B4', 'garbage', '回复不是 json']]) {
    await check(no, name + '：托管暂停，局面不动', async () => {
      setup(mode);
      const s = FX.Game.newGame({ origin: 'market', seed: 'agent-' + mode });
      const h0 = hash(s);
      const r = await Agent.run(s, 3);
      assert(!r.ok && r.finished === 0, '没有暂停');
      assert(hash(s) === h0, '暂停前改动了局面');
      return r.reason;
    });
  }

  await check('B5', '关闭 AI 时拒绝托管、零请求', async () => {
    const log = setup('off');
    const s = FX.Game.newGame({ origin: 'market', seed: 'agent-off' });
    const h0 = hash(s);
    const r = await Agent.run(s, 3);
    assert(!r.ok && log.length === 0 && hash(s) === h0, '关闭时仍有动作');
    return r.reason;
  });

  await check('B6', '叫停后在当前步骤结束时停下', async () => {
    setup(brain());
    const s = FX.Game.newGame({ origin: 'market', seed: 'agent-stop' });
    let n = 0;
    Agent.onStep = () => { if (++n === 3) Agent.stop(); };
    const r = await Agent.run(s, 10);
    Agent.onStep = null;
    assert(!r.ok && r.finished < 10 && /叫停/.test(r.reason), '未能叫停：' + JSON.stringify(r));
    return `第 ${r.finished} 回合后停下`;
  });

  await check('B7', '菜单里的每个操作都能执行或给出可读原因', async () => {
    setup('off');
    let total = 0;
    for (const seed of ['m1', 'm2', 'm3']) {
      const s = FX.Game.newGame({ origin: 'hermit', seed });
      for (let t = 0; t < 8 && !s.ended; t++) {
        for (const it of Agent.menu(s)) {
          const c = FX.Game.save.deserialize(FX.Game.save.serialize(s, 0)).state;
          const item = Agent.menu(c).find((x) => x.id === it.id);
          assert(item, it.id + ' 复制后不在菜单');
          const r = item.run();
          assert(r && (r.ok !== false || r.error), it.id + ' 无结果');
          total++;
        }
        while (s.pending.length) { const v = FX.Game.pendingEvents(s)[0]; FX.Game.resolveEvent(s, v.id, (v.options.find((o) => o.available) || v.options[0]).id); }
        FX.Game.advance(s);
        while (s.pending.length) { const v = FX.Game.pendingEvents(s)[0]; FX.Game.resolveEvent(s, v.id, (v.options.find((o) => o.available) || v.options[0]).id); }
        if (s.phase === 'advancing') FX.Game.advance(s);
      }
    }
    return `试执行 ${total} 个菜单操作`;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nAI 家主 ${results.length - failed.length}/${results.length} 项通过`);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'agent-summary.json'), JSON.stringify({ results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
