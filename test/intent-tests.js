#!/usr/bin/env node
// 自由输入测试：假 DeepSeek 按句子回事先写好的 JSON，不发真实网络请求。
// 覆盖：30 句测试句都落到合法行动或给出做不到的理由；不合规的提案全被拒；
//       通用动作不能凭空得物、改境界、加寿元、发功法、杀人；没有 AI 时关键词匹配；超时回落；同种子同计划结果一样。
// 用法：node test/intent-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');

const FX = loadCore();
require(path.join(__dirname, '..', 'src', 'ui', 'ai.js'));
const AI = FX.AI, Game = FX.Game, P = FX.P, I = FX.Intent;
const KEY = 'sk-TEST-intent-SECRET';

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

/* ---------- 假 DeepSeek：回 REPLY（字符串或对象）---------- */
let REPLY = '';
const log = [];
function setup(mode) {
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  AI.env = {
    fetch: (url, init) => {
      log.push(JSON.parse(init.body));
      if (mode === 'never') return new Promise(() => {});
      if (mode === 'reject') return Promise.reject(new TypeError('Failed to fetch'));
      const content = typeof REPLY === 'string' ? REPLY : '```json\n' + JSON.stringify(REPLY) + '\n```';
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 500 } }) });
    },
    storage, now: () => 1767225600000,
  };
  storage.setItem('family-xiuxian:ai', JSON.stringify(Object.assign({}, AI.defaults, { enabled: true })));
  AI.setKey(KEY);
}
const clone = (s) => JSON.parse(JSON.stringify(s));
const snap = (s) => { const p = P.player(s); return { rank: P.realmRank(p), bonus: p.lifespanBonus, manuals: s.player.manuals.slice(), inv: Object.assign({}, s.player.inv), alive: new Set(P.living(s).map((q) => q.id)) }; };

(async () => {
  // 一局宗门弟子开局：山门里人多、有坊市
  const s0 = Game.newGame({ origin: 'sect', seed: 'intent-1' });
  const me = P.player(s0);
  const here = s0.places[me.locationId];
  const ppl = P.at(s0, here.id).filter((q) => q.id !== me.id);
  const [q1, q2, q3] = ppl;
  const far = P.living(s0).find((q) => q.id !== me.id && q.locationId !== here.id && FX.World.route(s0, here.id, q.locationId, me));
  const farPlace = s0.places[far.locationId];
  const nb = s0.places[here.links[0].to];
  const invItem = Object.keys(s0.player.inv).find((k) => s0.player.inv[k] > 0);
  const N = (k) => FX.CONFIG.items[k].name;
  const shopItem = (s0.markets[here.id] ? s0.markets[here.id].stock.find((x) => x.qty > 0 && !x.item.startsWith('tech:')) : null);
  const anyItem = Object.keys(FX.CONFIG.items).find((k) => k === 'danmu') || Object.keys(FX.CONFIG.items)[0];

  // 30 句：玩家的话 + 假 AI 的回答
  const SENT = [
    ['闭关修炼到圆满', { say: '你想闭关到圆满', steps: [{ do: '修炼' }] }],
    ['在山里转转', { say: '你想在此地游历', steps: [{ do: '游历' }] }],
    ['去领个差事挣点钱', { say: '你想做营生', steps: [{ do: '营生' }] }],
    ['拜访' + q1.name, { say: '你想拜访' + q1.name, steps: [{ do: '拜访', npc: q1.name }] }],
    ['向' + q1.name + '请教修行', { say: '你想向' + q1.name + '请教', steps: [{ do: '请教', npc: q1.name }] }],
    ['和' + q2.name + '聊聊', { say: '你想与' + q2.name + '叙话', steps: [{ deed: '交谈', npc: q2.name, aim: '叙话' }] }],
    ['问问' + q2.name + '最近有什么消息', { steps: [{ deed: '交谈', npc: q2.name, aim: '打听消息', topic: '传闻' }] }],
    ['把' + N(invItem) + '送给' + q3.name, { say: '你想把礼物送给' + q3.name, steps: [{ deed: '交谈', npc: q3.name, aim: '叙话', gift: N(invItem) }] }],
    ['在山门打听' + N(anyItem) + '哪里有', { steps: [{ deed: '打听', topic: '东西', item: N(anyItem) }] }],
    ['打听一下' + far.name + '在哪', { steps: [{ deed: '打听', topic: '人', npc: far.name }] }],
    ['打听' + nb.name + '那边怎么样', { steps: [{ deed: '打听', topic: '地方', place: nb.name }] }],
    ['我卡关了下一步怎么办', { steps: [{ deed: '打听', topic: '卡关' }] }],
    ['听听最近有什么传闻', { steps: [{ deed: '打听', topic: '传闻' }] }],
    ['把' + N(invItem) + '卖给' + q1.name, { steps: [{ deed: '交易', npc: q1.name, aim: '卖', item: N(invItem) }] }],
    ['找' + q2.name + '借点钱', { steps: [{ deed: '交易', npc: q2.name, aim: '借' }] }],
    ['帮' + q1.name + '护法', { steps: [{ deed: '相助', npc: q1.name }] }],
    ['和' + q3.name + '切磋一下', { steps: [{ deed: '相争', npc: q3.name, mode: '切磋' }] }],
    ['抢' + q3.name + '的钱', { steps: [{ deed: '相争', npc: q3.name, mode: '抢夺' }] }],
    ['偷偷跟着' + q2.name, { steps: [{ deed: '潜行', npc: q2.name }] }],
    ['和' + q1.name + '结拜', { steps: [{ deed: '立约', npc: q1.name, kind: '结拜' }] }],
    ['和' + q2.name + '约十年后再战', { steps: [{ deed: '立约', npc: q2.name, kind: '约战' }] }],
    ['去' + nb.name, { say: '你想前往' + nb.name, steps: [{ go: nb.name }] }],
    ['去' + farPlace.name + '找' + far.name + '切磋', { steps: [{ go: farPlace.name }, { deed: '相争', npc: far.name, mode: '切磋' }] }],
    ['去' + farPlace.name + '拜访' + far.name + '再请教', { steps: [{ go: farPlace.name }, { do: '拜访', npc: far.name }, { do: '请教', npc: far.name }] }],
    ['去' + nb.name + '游历一个月', { steps: [{ go: nb.name }, { do: '游历' }] }],
    shopItem ? ['买一份' + N(shopItem.item), { steps: [{ do: '买', item: N(shopItem.item) }] }] : ['看看货架', { ask: '你想买什么？' }],
    ['选第一个', { steps: [{ act: 'a1' }] }],
    ['直接让我突破到金丹', { cannot: '境界只能靠冲关' }],
    ['杀了' + q1.name, { cannot: '游戏里没有直接杀人的做法' }],
    ['随便干点什么', { ask: '你想修炼、出门，还是找人？' }],
  ];

  await check('I1', '30 句测试句（配假 AI 回复）都落到合法行动，或给出做不到的理由', async () => {
    setup('ok');
    assert(SENT.length === 30, '测试句应有 30 句');
    let ok = 0, cannot = 0, ask = 0, blocked = 0, ran = 0;
    const bad = [];
    for (const [text, reply] of SENT) {
      REPLY = reply;
      const s = clone(s0);
      const r = await AI.intent(s, text);
      if (!r.ok) { bad.push(text + '：' + r.reason); continue; }
      if (r.ask) { ask++; continue; }
      if (r.cannot) { cannot++; continue; }
      const c = Game.intent.preview(s, r.plan.steps);
      if (!c.ok) {
        const row = c.rows[c.rows.length - 1];
        if (!row.reason) bad.push(text + '：做不到却没写理由');
        blocked++;
        continue;
      }
      ok++;
      const e = Game.intent.exec(s, r.plan);
      assert(e.done >= 1 || e.stopped, text + '：执行没有结果');
      ran++;
    }
    assert(!bad.length, bad.slice(0, 3).join('；'));
    return `能做 ${ok} 句（都执行过）、做不到并写明理由 ${blocked} 句、AI 回“做不到” ${cannot} 句、追问 ${ask} 句`;
  });

  await check('I2', '不合规的提案全被拒：编人、编物、带数字、多字段、越权、编号乱用、超三步、复述编数字', async () => {
    setup('ok');
    const BAD = [
      ['乱码', 'asdf不是json'],
      ['编人', { steps: [{ deed: '交谈', npc: '张三丰' }] }],
      ['编物', { steps: [{ deed: '打听', topic: '东西', item: '九转金丹' }] }],
      ['编地', { steps: [{ go: '蓬莱仙岛' }] }],
      ['带数字', { steps: [{ deed: '交易', npc: q1.name, aim: '借', amount: 10000 }] }],
      ['数字字段', { steps: [{ do: '买', item: N(anyItem), qty: 99 }] }],
      ['改境界', { steps: [{ do: '修炼' }], realm: '金丹' }],
      ['送功法', { steps: [{ deed: '交易', npc: q1.name, aim: '卖', item: '《' + FX.CONFIG.techniques[s0.player.manuals[0]].name + '》' }] }],
      ['未知动作', { steps: [{ deed: '杀死', npc: q1.name }] }],
      ['未知 do', { steps: [{ do: '成仙' }] }],
      ['编号越界', { steps: [{ act: 'a999' }] }],
      ['赶路后用编号', { steps: [{ go: nb.name }, { act: 'a1' }] }],
      ['一步两样', { steps: [{ go: nb.name, do: '游历' }] }],
      ['超过三步', { steps: [{ do: '修炼' }, { do: '修炼' }, { do: '修炼' }, { do: '修炼' }] }],
      ['复述编数字', { say: '你想闭关修炼 3000 年', steps: [{ do: '修炼' }] }],
      ['原因编名字', { cannot: far.name + '不许你这样做' }],
    ];
    const pass = [];
    for (const [name, reply] of BAD) {
      REPLY = reply;
      const s = clone(s0);
      const r = await AI.intent(s, '测试');
      // 复述里编的数字：复述被丢掉，步骤本身合规可以留下
      if (name === '复述编数字') { assert(r.ok && r.plan && !r.plan.say, '编了数字的复述应被丢掉'); continue; }
      if (r.ok) pass.push(name);
    }
    assert(!pass.length, '这些被放过了：' + pass.join('、'));
    assert(AI.rejects.length >= BAD.length - 2, '被拒的回复应记进调试列表');
    return BAD.length + ' 种全被拒（编了数字的复述只丢复述），调试列表记 ' + AI.rejects.length + ' 条';
  });

  await check('I3', '通用动作不能凭空得物、改境界、加寿元、发功法、杀人（7 种动作各跑 60 次）', async () => {
    const VERBS = [
      { verb: 'talk', aim: 'chat' }, { verb: 'talk', aim: 'ask', topic: 'way' }, { verb: 'inquire', topic: 'rumor' }, { verb: 'trade', aim: 'borrow' },
      { verb: 'help' }, { verb: 'fight', mode: 'spar' }, { verb: 'fight', mode: 'rob' }, { verb: 'sneak' }, { verb: 'pact', kind: 'duel' },
    ];
    let runs = 0, wins = 0;
    for (const v of VERBS) for (let k = 0; k < 60; k++) {
      const s = Game.newGame({ origin: 'sect', seed: 'deed-' + v.verb + '-' + k });
      const p = P.player(s);
      const q = P.at(s, p.locationId).find((x) => x.id !== p.id);
      const a = Object.assign({ type: 'deed', npc: q.id }, v);
      const b = snap(s);
      const r = Game.act(s, a);
      if (!r.ok) continue;
      runs++;
      if (r.success) wins++;
      const after = snap(s);
      assert(after.rank === b.rank, v.verb + ' 改了境界');
      assert(after.bonus === b.bonus, v.verb + ' 加了寿元');
      assert(JSON.stringify(after.manuals) === JSON.stringify(b.manuals), v.verb + ' 发了功法');
      for (const key in after.inv) assert((after.inv[key] || 0) <= (b.inv[key] || 0), v.verb + ' 凭空得了' + key);
      assert(P.alive(s.people[q.id]), v.verb + ' 让对方死了');
      assert(P.alive(P.player(s)), v.verb + ' 让主角死了');
    }
    assert(runs > 400, '能跑的次数太少：' + runs);
    assert(wins < runs, '不该次次都成');
    return `跑了 ${runs} 次，成了 ${wins} 次；没有一次得物、改境界、加寿元、发功法或死人`;
  });

  await check('I4', '没有 AI 时按关键词匹配：30 句里大多数给出能做的候选', async () => {
    let hit = 0, any = 0;
    const miss = [];
    for (const [text] of SENT) {
      const c = Game.intent.match(clone(s0), text);
      if (c.length) any++;
      if (c.some((x) => x.check.ok)) hit++; else miss.push(text);
    }
    assert(hit >= 24, '能做的候选只有 ' + hit + ' 句；没对上：' + miss.slice(0, 6).join(' / '));
    return `${hit}/30 句有能做的候选，${any}/30 句有候选；没对上：${miss.join(' / ') || '无'}`;
  });

  await check('I5', '断网、超时：很快回落，不抛错；没开 AI 时零请求', async () => {
    setup('reject');
    let r = await AI.intent(clone(s0), '闭关');
    assert(!r.ok && /网络/.test(r.reason), '断网应回落：' + JSON.stringify(r));
    setup('never');
    AI.intentTimeoutMs = 50;
    const t0 = Date.now();
    r = await AI.intent(clone(s0), '闭关');
    AI.intentTimeoutMs = 8000;
    assert(!r.ok && /超时/.test(r.reason) && Date.now() - t0 < 2000, '超时应回落');
    setup('ok');
    AI.saveConfig({ enabled: false });
    const n = log.length;
    r = await AI.intent(clone(s0), '闭关');
    assert(!r.ok && log.length === n, '没开 AI 不该发请求');
    return '断网、超时都回落；关着时 0 个请求';
  });

  await check('I6', '同种子、同计划结果一样；计划记进存档；提示词里有合法行动、没有 key', async () => {
    setup('ok');
    REPLY = SENT[22][1];
    const a = clone(s0), b = clone(s0);
    const ra = await AI.intent(a, SENT[22][0]);
    const rb = await AI.intent(b, SENT[22][0]);
    Game.intent.exec(a, ra.plan); Game.intent.exec(b, rb.plan);
    assert(JSON.stringify(a) === JSON.stringify(b), '同种子同计划结果不同');
    const rec = Game.ai.latest(a, 'intent');
    assert(rec && rec.out.steps.length === 2 && rec.out.via === 'ai', '计划没记进存档');
    const body = JSON.stringify(log[log.length - 1]);
    assert(!body.includes(KEY), '提示词里有 key');
    assert(/此刻能做/.test(body) && body.includes('a1'), '提示词里没有合法行动清单');
    return '两份结果一致；计划记进 aiLog；提示词约 ' + body.length + ' 字';
  });

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} 项通过`);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'intent-summary.json'), JSON.stringify({ results }, null, 2));
  process.exit(ok === results.length ? 0 : 1);
})();
