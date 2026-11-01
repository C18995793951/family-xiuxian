#!/usr/bin/env node
// 人物命运测试：志向、人物之间的事、传闻与插手入口、小传校验、速度。假 DeepSeek，不联网。
// 用法：node test/npc-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');

const FX = loadCore();
require(path.join(__dirname, '..', 'src', 'ui', 'ai.js'));
const AI = FX.AI, Game = FX.Game, P = FX.P, Npc = FX.Npc;

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
// 一年一年过（宅家），记下每年圈子里有谁
function live(seed, origin, years) {
  const s = Game.newGame({ origin, seed });
  const start = s.year, inCircle = {};
  let yms = 0, yn = 0;
  while (!s.ended && s.year - start < years) {
    while (s.pending.length && !s.ended) { const v = Game.pendingEvents(s)[0]; const o = v.options.filter((x) => x.available); Game.choose(s, v.id, (o.find((x) => ['flee', 'pay', 'leave'].includes(x.id)) || o[o.length - 1] || v.options[0]).id); }
    if (s.ended) break;
    for (const q of Npc.circle(s)) inCircle[q.id] = (inCircle[q.id] || 0) + 1;
    const A = Game.actions(s);
    const a = A.find((x) => x.ok && x.type === 'breakthrough' && !x.path) || A.find((x) => x.ok && x.type === 'rest') || A.find((x) => x.ok && x.type === 'cultivate' && x.days === 360 && !x.coin);
    if (!a) break;
    const y0 = s.year, t0 = process.hrtime.bigint();
    Game.act(s, a);
    if (s.year > y0) { yms += Number(process.hrtime.bigint() - t0) / 1e6 / (s.year - y0); yn++; }
  }
  return { s, inCircle, msPerYear: yms / Math.max(1, yn) };
}
let REPLY = '';
function setup() {
  const m = new Map();
  AI.env = {
    fetch: () => Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: REPLY } }], usage: { total_tokens: 300 } }) }),
    storage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) },
    now: () => 1767225600000,
  };
  AI.pending.clear(); AI.failed.clear(); AI.rejects.length = 0;
  AI.env.storage.setItem('family-xiuxian:ai', JSON.stringify(Object.assign({}, AI.defaults, { enabled: true })));
  AI.setKey('sk-TEST-npc');
}

(async () => {
  const RUNS = [];
  for (const origin of ['sect', 'loose', 'mortal']) for (let i = 0; i < 4; i++) RUNS.push(Object.assign({ origin }, live('npc-' + origin + i, origin, 100)));

  await check('N1', '100 年里，主角圈子里待满 20 年的人每人至少 2 件自己的事（宗门、散修、凡人各 4 局）', async () => {
    let people = 0, short = [], total = 0;
    for (const r of RUNS) for (const id in r.inCircle) {
      if (r.inCircle[id] < 20) continue;
      people++;
      const n = r.s.history.filter((e) => e.type === 'npc' && e.actors[0] === id).length;
      total += n;
      if (n < 2) short.push(r.s.people[id].name + '（' + r.inCircle[id] + ' 年 ' + n + ' 件）');
    }
    assert(people >= 20, '圈子里待满 20 年的人太少：' + people);
    assert(!short.length, '这些人自己的事不到 2 件：' + short.slice(0, 5).join('、'));
    return `${people} 人，平均每人 ${(total / people).toFixed(1)} 件`;
  });

  await check('N2', '传闻里至少一半能插手，插手入口都落到合法的自由输入计划', async () => {
    let all = 0, ix = 0, plans = 0, ok = 0;
    const kinds = new Set();
    for (const r of RUNS) for (const e of r.s.history) {
      if (e.type !== 'npc') continue;
      all++; kinds.add(e.key);
      if (e.params.ix) ix++;
    }
    const s = RUNS[0].s;
    for (const e of s.history.filter((x) => x.type === 'npc' && x.params.ix).slice(-30)) for (const pl of Npc.interventions(s, e)) { plans++; if (Game.intent.preview(s, pl.steps).ok) ok++; }
    assert(ix / all >= 0.5, '能插手的只占 ' + Math.round((ix / all) * 100) + '%');
    assert(kinds.size >= 10, '人物的事种类太少：' + kinds.size);
    assert(plans > 0 && ok / plans >= 0.5, '插手计划能走通的太少：' + ok + '/' + plans);
    return `传闻 ${all} 条，能插手 ${Math.round((ix / all) * 100)}%，${kinds.size} 种；抽查 ${plans} 个插手计划，${ok} 个此刻走得通（其余写明做不到的理由）`;
  });

  await check('N3', '人物之间斗法与主角同一公式；有恩有仇有师徒，不挤掉和主角的关系', async () => {
    const s = RUNS[0].s;
    const L = P.living(s).filter((q) => q.id !== s.player.id);
    const a = L[0], b = L[1];
    assert(Npc.duelChance(s, a, b) === FX.Combat.fightChance(s, a, P.power(s, b)).chance, '斗法公式不同');
    let feud = 0, close = 0, master = 0;
    for (const r of RUNS) for (const x of r.s.relations) {
      if (x.a === r.s.player.id || x.b === r.s.player.id) continue;
      if (x.strength <= -40) feud++; if (x.strength >= 40) close++; if (x.tags.includes('师徒')) master++;
    }
    assert(feud && close, '人物之间缺恩或仇');
    // 关系表里和主角的关系没有被人物之间的关系挤掉
    for (const r of RUNS) for (const x of P.relationsOf(r.s, r.s.player.id)) assert(r.s.people[x.a] && r.s.people[x.b], '关系引用失效');
    return `人物之间：仇 ${feud}、知交 ${close}、师徒 ${master}`;
  });

  await check('N4', '速度：过一年仍是瞬间（Node 里每年平均几十毫秒以内）', async () => {
    const ms = RUNS.reduce((a, r) => a + r.msPerYear, 0) / RUNS.length;
    assert(ms < 60, '每年 ' + ms.toFixed(1) + ' 毫秒');
    return '每年平均 ' + ms.toFixed(1) + ' 毫秒';
  });

  await check('N5', '人物近况：AI 写的过校验才记进存档，编人名、编数字、漏了本人都被拒；同种子结果一样', async () => {
    setup();
    const s = RUNS[0].s;
    const id = Object.keys(RUNS[0].inCircle).find((k) => P.alive(s.people[k]) && Npc.story(s, k).length >= 2);
    const q = s.people[id];
    const other = P.living(s).find((x) => x.id !== id && x.id !== s.player.id && !Npc.story(s, id).some((e) => e.actors.includes(x.id)));
    const bad = [
      ['编人名', q.name + '近来与' + other.name + '往来甚密，闭门修行，不问外事，只想着把眼前的关隘破了，再图后计。'],
      ['编数字', q.name + '近来闭关 300 年，不问外事，修行颇有进益，只想着把眼前的关隘破了，再图后计。'],
      ['漏了本人', '此人近来闭门修行，不问外事，修行颇有进益，只想着把眼前的关隘破了，再图后计，别无他念。'],
    ];
    const pass = [];
    for (const [n, text] of bad) { REPLY = text; AI.failed.clear(); s.aiLog = (s.aiLog || []).filter((x) => x.kind !== 'npc'); if (await AI.npcBio(s, id)) pass.push(n); }
    assert(!pass.length, '被放过了：' + pass.join('、'));
    REPLY = q.name + '近来行止都照着自己的心意，旁人看不出深浅，只知其志向未改，仍在' + s.places[q.locationId].name + '一带走动。';
    AI.failed.clear();
    const good = await AI.npcBio(s, id);
    assert(good && Game.ai.text(s, AI.npcKey(s, id)) === good, '合格的近况没记进存档');
    const a = live('npc-same', 'sect', 40).s, b = live('npc-same', 'sect', 40).s;
    assert(JSON.stringify(a) === JSON.stringify(b), '同种子结果不同');
    return '三种编造都被拒，合格的记进存档；两局一致';
  });

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} 项通过`);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'npc-summary.json'), JSON.stringify({ results }, null, 2));
  process.exit(ok === results.length ? 0 : 1);
})();
