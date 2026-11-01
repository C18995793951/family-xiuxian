#!/usr/bin/env node
// 事件从世界状态长出来（钩子）测试。假 DeepSeek，不联网。
// 用法：node test/hook-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');
const { homeLife } = require('./hook-stats');

const FX = loadCore();
require(path.join(__dirname, '..', 'src', 'ui', 'ai.js'));
const AI = FX.AI, Game = FX.Game, P = FX.P, Hook = FX.Hook;

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
let REPLY = '';
function setup() {
  const m = new Map();
  AI.env = {
    fetch: () => Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: typeof REPLY === 'string' ? REPLY : JSON.stringify(REPLY) } }], usage: { total_tokens: 400 } }) }),
    storage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) },
    now: () => 1767225600000,
  };
  AI.pending.clear(); AI.failed.clear(); AI.rejects.length = 0;
  AI.env.storage.setItem('family-xiuxian:ai', JSON.stringify(Object.assign({}, AI.defaults, { enabled: true })));
  AI.setKey('sk-TEST-hooks');
}
// 造一个排好的钩子并送上门
const queue = (s, h) => { const q = (s.player.hooks = s.player.hooks || { queue: [], log: [] }).queue; const x = Object.assign({ id: 'k' + s.nextId++, t: s.t, ripe: true }, h); q.push(x); return x; };
const sectGame = (seed) => { const s = Game.newGame({ origin: 'sect', seed }); const p = P.player(s); const peer = P.at(s, p.locationId).find((q) => q.id !== p.id && q.factionId === p.factionId); return { s, p, peer }; };

(async () => {
  await check('K1', '宅家 100 年：亲历 15–25 件、平均至少 6 类、劫修寻仇不超过三成（散修、宗门弟子、凡人各 20 个种子，AI 关闭）', async () => {
    const rows = [];
    let N = 0, Y = 0, RR = 0, types = 0, games = 0;
    for (const origin of ['loose', 'sect', 'mortal']) {
      let n = 0, y = 0, rr = 0, ty = 0;
      for (let i = 0; i < 20; i++) {
        const r = homeLife(FX, 'k1-' + origin + '-' + i, origin, 100);
        n += r.n; y += r.years; rr += r.robRev; ty += Object.keys(r.kinds).length; games++;
      }
      const per = (n / y) * 100;
      rows.push(`${{ loose: '散修', sect: '宗门', mortal: '凡人' }[origin]} ${per.toFixed(1)} 件/百年、${(ty / 20).toFixed(1)} 类`);
      assert(per >= 13 && per <= 27, origin + ' 每百年 ' + per.toFixed(1) + ' 件，偏离太多');
      N += n; Y += y; RR += rr; types += ty;
    }
    const per = (N / Y) * 100;
    assert(per >= 15 && per <= 25, '每百年 ' + per.toFixed(1) + ' 件（应 15–25）');
    assert(types / games >= 6, '平均每局 ' + (types / games).toFixed(1) + ' 类（应 ≥ 6）');
    assert(RR / N <= 0.3, '劫修寻仇占 ' + Math.round((RR / N) * 100) + '%');
    return rows.join('；') + `；合计 ${per.toFixed(1)} 件/百年，劫修寻仇占 ${Math.round((RR / N) * 100)}%`;
  });

  await check('K2', '不强行制造奇遇、不保证幸运：多数月份无事，每件事都有无得的选项，结果约一半无得或有失', async () => {
    // 每种模板都至少有一个什么也不得的选项
    const { s, peer } = sectGame('k2');
    s.player.inv.heal = 3; s.player.inv.herb = 2;
    for (const kind of Hook.KINDS) {
      const b = Hook.build(s, { id: 'kx', kind, npc: peer.id, item: 'herb', what: '地渊开启', ref: '故人相邀' }).bound;
      assert(b._p.options.some((o) => !o.win.some((e) => /\+$|owed|intel/.test(e))), kind + ' 缺无得的选项');
    }
    let gain = 0, all = 0, months = 0, hooks = 0;
    for (let i = 0; i < 20; i++) {
      const r = homeLife(FX, 'k2-' + i, ['loose', 'sect', 'mortal'][i % 3], 100);
      months += r.years * 12;
      for (const e of r.s.history) if (e.type === 'event' && e.params && e.params.defId === 'HOOK') { hooks++; all++; if (/[+＋]|欠你|消息|得/.test(e.params.result) && !/没成/.test(e.params.result)) gain++; }
    }
    assert(hooks / months < 0.05, '有事的月份太多');
    assert(gain / all <= 0.7, '有得的结果占 ' + Math.round((gain / all) * 100) + '%');
    return `${months} 个月里 ${hooks} 件（${((hooks / months) * 100).toFixed(1)}% 的月份）；有得的结果占 ${Math.round((gain / all) * 100)}%`;
  });

  await check('K3', '钩子排进队不打断闭关，下一次行动后才找上门；当事人死了就作废', async () => {
    const { s, peer } = sectGame('k3');
    const h = queue(s, { kind: 'sect_rival', npc: peer.id, ripe: false });
    Game.act(s, { type: 'cultivate', days: 30 });
    assert(!s.pending.length, '刚排进队就找上门了');
    Game.act(s, { type: 'cultivate', days: 30 });
    assert(s.pending.length && s.pending[0].defId === 'HOOK', '下一次行动后没找上门');
    const v = Game.pendingEvents(s)[0];
    assert(v.name === '同门相争' && v.options.length === 4, '视图不对');
    const r = Game.choose(s, v.id, v.options[1].id);
    assert(r.ok, r.error);
    const { s: s2, peer: q2 } = sectGame('k3b');
    queue(s2, { kind: 'sect_rival', npc: q2.id });
    P.kill(s2, q2, '测试', [], {});
    Game.act(s2, { type: 'cultivate', days: 30 });
    assert(!s2.pending.length, '当事人死了还找上门');
    return '排队不打断；下一回送上门；死者的钩子作废；' + h.kind + ' 结算：' + r.result;
  });

  await check('K4', 'AI 提案：合格的被用上（读档不重调），不合格的全被拒', async () => {
    setup();
    const { s, peer } = sectGame('k4');
    const h = queue(s, { kind: 'sect_rival', npc: peer.id, ripe: false });
    const other = P.living(s).find((q) => q.id !== peer.id && q.id !== P.player(s).id && q.locationId !== P.player(s).locationId);
    const GOOD = { title: '争差之事', text: `同门${peer.name}要和你抢奉事房的一桩好差事，在门口拦着你理论。`, options: [
      { label: '让给他', check: 'none', size: 'small', win: ['rel+'] },
      { label: '比划两下', check: 'fight', size: 'small', win: ['merit+'], lose: ['rel-'] },
      { label: '不理他', check: 'none', size: 'small', win: [] }] };
    const BAD = [
      ['编人', Object.assign({}, GOOD, { text: other.name + '和' + peer.name + '一起拦住你。' })],
      ['带数字', Object.assign({}, GOOD, { text: peer.name + '要你交出 500 符钱。' })],
      ['不许的后果', Object.assign({}, GOOD, { options: [GOOD.options[0], { label: '抢', check: 'fight', size: 'small', win: ['item+'], lose: [] }, GOOD.options[2]] })],
      ['程度超限', Object.assign({}, GOOD, { options: [GOOD.options[0], Object.assign({}, GOOD.options[1], { size: 'big' }), GOOD.options[2]] })],
      ['检定不在白名单', Object.assign({}, GOOD, { options: [GOOD.options[0], Object.assign({}, GOOD.options[1], { check: 'magic' }), GOOD.options[2]] })],
      ['没有无得的选项', Object.assign({}, GOOD, { options: [GOOD.options[0], GOOD.options[1]] })],
      ['失败有收获', Object.assign({}, GOOD, { options: [GOOD.options[0], Object.assign({}, GOOD.options[1], { lose: ['merit+'] }), GOOD.options[2]] })],
      ['多字段', Object.assign({}, GOOD, { reward: '金丹' })],
      ['选项带数字', Object.assign({}, GOOD, { options: [GOOD.options[0], Object.assign({}, GOOD.options[1], { size: 3 }), GOOD.options[2]] })],
      ['漏了当事人', Object.assign({}, GOOD, { text: '有同门拦着你理论。' })],
      ['乱码', '不是 JSON'],
    ];
    const passed = [];
    for (const [name, v] of BAD) {
      REPLY = v;
      AI.failed.clear();
      const job = Hook.job(s, h);
      const a = Hook.accept(s, job, typeof v === 'string' ? v : JSON.stringify(v));
      if (a.ok) passed.push(name);
    }
    assert(!passed.length, '这些被放过了：' + passed.join('、'));
    REPLY = GOOD;
    await Promise.all(AI.hookPrefetch(s));
    assert(Game.ai.latest(s, 'hook'), '合格的提案没记进存档');
    const saved = Game.save.serialize(s);
    Game.act(s, { type: 'cultivate', days: 30 });
    Game.act(s, { type: 'cultivate', days: 30 });
    const v = Game.pendingEvents(s)[0];
    assert(v && v.name === '争差之事' && v.text.includes(peer.name), '找上门的不是 AI 写的那件');
    // 读档后不再调用，结果一样
    const n0 = AI.calls;
    const s2 = Game.save.deserialize(saved).state;
    Game.act(s2, { type: 'cultivate', days: 30 }); Game.act(s2, { type: 'cultivate', days: 30 });
    assert(AI.calls === n0 && Game.pendingEvents(s2)[0].name === '争差之事', '读档后重调了或结果不同');
    return BAD.length + ' 种不合格的全被拒；合格的提案找上门时用上了，读档不重调';
  });

  await check('K5', '同种子同选择结果一样；AI 关着时零请求', async () => {
    const a = homeLife(FX, 'k5', 'sect', 60).s, b = homeLife(FX, 'k5', 'sect', 60).s;
    assert(JSON.stringify(a) === JSON.stringify(b), '同种子结果不同');
    setup();
    AI.saveConfig({ enabled: false });
    const n = AI.calls;
    const s = homeLife(FX, 'k5b', 'sect', 30).s;
    assert(AI.hookPrefetch(s).length === 0 && AI.calls === n, '关着时发了请求');
    return '两局一致；关着时 0 个请求';
  });

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} 项通过`);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'hook-summary.json'), JSON.stringify({ results }, null, 2));
  process.exit(ok === results.length ? 0 : 1);
})();
