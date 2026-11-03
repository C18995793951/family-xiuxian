#!/usr/bin/env node
// 导演模式测试：主角全程自己过。假 DeepSeek，不联网。
// 覆盖：五种本心各过一生无异常、做法各有偏重；AI 的打算与眼前的事都过同一套校验，不合规的一律回落本地；
//       「要紧时」只在要紧处问 AI、「不用」一次不问、超时回落；暂停即停；同种子同本心一生逐位相同；存读档接着导演。
// 用法：node test/director-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');

const FX = loadCore();
require(path.join(__dirname, '..', 'src', 'ui', 'ai.js'));
require(path.join(__dirname, '..', 'src', 'ui', 'director.js'));
const AI = FX.AI, Game = FX.Game, P = FX.P, Dir = FX.Dir, D = FX.Director;

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

/* ---------- 假 DeepSeek：REPLY 是函数（拿到请求体，回字符串或对象）---------- */
let REPLY = () => '';
const log = [];
function setup(mode, extra) {
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  log.length = 0;
  AI.env = {
    fetch: (url, init) => {
      const body = JSON.parse(init.body);
      log.push(body);
      if (mode === 'never') return new Promise(() => {});
      const r = REPLY(body);
      const content = typeof r === 'string' ? r : '```json\n' + JSON.stringify(r) + '\n```';
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 300 } }) });
    },
    storage, now: () => 1767225600000,
  };
  storage.setItem('family-xiuxian:ai', JSON.stringify(Object.assign({}, AI.defaults, { enabled: true, dailyLimit: 5000, narrate: false, hooks: false }, extra || {})));
  AI.setKey('sk-TEST-director');
  AI.failed.clear(); AI.pending.clear();
}
const userOf = (body) => body.messages[body.messages.length - 1].content;
const isEventReq = (body) => /你怎么办/.test(userOf(body));
const actsOf = (body) => { const m = /此刻能做（编号：说明）：\n([\s\S]*?)(\n[^a\n][^\n]*：|\n\n|$)/.exec(userOf(body)); return m ? m[1].split('\n') : []; };
const eventIds = (body) => { const t = userOf(body); const m = /可选（id｜做法｜代价｜风险｜成算）：\n([\s\S]*?)\n(本心|按常理|\n)/.exec(t.slice(t.indexOf('可选（id'))); return (m ? m[1] : '').split('\n').map((l) => l.split('｜')[0]).filter(Boolean); };

function live(seed, origin, persona, years) {
  const s = Game.newGame({ origin, seed });
  Dir.setPersona(s, persona);
  const y0 = s.year;
  let steps = 0;
  while (!s.ended && s.year - y0 < years && steps < 8000) { const r = Dir.stepLocal(s); steps++; if (r.ok === false && !r.partial && !/路上|出了|先决断/.test(r.error || '')) throw new Error(persona + ' 第 ' + steps + ' 步：' + r.error); }
  FX.Sim.check(s);
  return { s, steps };
}
const count = (s, re) => (s.aiLog || []).filter((r) => r.kind === 'dir' && re.test(r.label)).length;

(async () => {
  await check('D1', '五种本心各过 300 年（或到寿尽）：无异常、状态自检通过、每局都记下心声；做法各有偏重', () => {
    const out = {};
    const t0 = Date.now();
    let steps = 0;
    for (const per of Dir.ORDER) {
      const o = { explore: 0, travel: 0, meddle: 0, social: 0, notes: 0, realm: '' };
      for (const origin of ['sect', 'loose']) {
        const r = live('dir-' + per + '-' + origin, origin, per, 300);
        steps += r.steps;
        o.explore += count(r.s, /游历/);
        o.travel += count(r.s, /^前往/);
        o.meddle += count(r.s, /^去相助|^给.*送药|^打听.*底细|^去看看/);
        o.social += count(r.s, /^拜访|请教$/);
        o.notes += (r.s.aiLog || []).filter((x) => x.kind === 'dir').length;
        o.realm += (o.realm ? '/' : '') + P.realmName(P.player(r.s));
        assert(Dir.timeline(r.s, 40).some((x) => x.kind === 'dir'), per + ' 时间线上没有心声');
      }
      assert(o.notes > 20, per + ' 心声太少：' + o.notes);
      out[per] = o;
    }
    assert(out.youli.explore + out.youli.travel > out.qiudao.explore + out.qiudao.travel, '游历四方没比一心求道多出门');
    assert(out.xiayi.meddle > out.qiudao.meddle, '古道热肠插手传闻没比一心求道多');
    assert(out.xiayi.meddle >= 4, '古道热肠两局只插手了 ' + out.xiayi.meddle + ' 回');
    const ms = (Date.now() - t0) / steps;
    return Dir.ORDER.map((k) => Dir.PERSONAS[k].name + ' 出门 ' + (out[k].explore + out[k].travel) + '、插手 ' + out[k].meddle + '、结交 ' + out[k].social + '（' + out[k].realm + '）').join('；') + '；每步平均 ' + ms.toFixed(1) + ' 毫秒';
  });

  await check('D2', 'AI 的打算走自由输入同一套校验：合规的照做，编号不存在、编名字、做不到、乱回的全被拒', () => {
    const s = Game.newGame({ origin: 'sect', seed: 'dir-parse' });
    const job = Dir.job(s);
    assert(/本心：/.test(job.messages[1].content) && /按常理的下一步/.test(job.messages[1].content), '打包里缺本心或按常理的下一步');
    const good = Dir.parse(s, job, JSON.stringify({ think: '我且闭关，静待时机。', steps: [{ act: 'a1' }] }));
    assert(good.ok && good.choice.plan.steps.length === 1 && good.choice.why, '合规的打算没过：' + JSON.stringify(good));
    const bad = [
      { steps: [{ act: 'a99' }] },
      { think: '我去找', steps: [{ deed: '相助', npc: '不存在的人' }] },
      { cannot: '做不到' },
      'not json at all',
      { steps: [] },
      { rumor: 'r9' },
    ];
    let rej = 0;
    for (const b of bad) { const r = Dir.parse(s, job, typeof b === 'string' ? b : JSON.stringify(b)); if (!r.ok) rej++; else { const x = Dir.exec(JSON.parse(JSON.stringify(s)), r.choice); if (!x.ok) rej++; } }
    assert(rej === bad.length, '只拒了 ' + rej + '/' + bad.length);
    // 心声里编数字、编名字：心声丢掉，打算照样可用
    const fake = Dir.parse(s, job, JSON.stringify({ think: '我已有九千年修为，玉皇大帝也不放在眼里', steps: [{ act: 'a1' }] }));
    assert(fake.ok && !fake.choice.why, '编出来的心声没被丢掉');
    // 眼前的事：只认给出的 id
    let ev = null;
    for (let i = 0; i < 400 && !ev; i++) { const r = Dir.stepLocal(s); if (s.pending.length) ev = s; if (s.ended) break; void r; }
    assert(ev, '400 步里没遇到要拿主意的事');
    const ej = Dir.eventJob(s);
    const ok = Dir.parseEvent(s, ej, JSON.stringify({ id: ej.options[0].id, think: '我稳妥些。' }));
    const no = Dir.parseEvent(s, ej, JSON.stringify({ id: 'kill_all' }));
    assert(ok.ok && !no.ok, '事件选项校验不对');
    const r = Dir.choose(s, ok.choice);
    assert(r.ok && !s.pending.some((x) => x.id === ej.options.id), '照 AI 的主意决断失败：' + r.error);
    return '6 种不合规全拒；心声编造被丢；事件只认给出的选项';
  });

  await check('D3', '插手传闻：AI 挑了传闻就照插手入口去做；本地古道热肠也会去', () => {
    // 找一局有可插手传闻的时刻
    const s = Game.newGame({ origin: 'sect', seed: 'dir-rumor' });
    Dir.setPersona(s, 'qiudao');
    let rs = [];
    for (let i = 0; i < 600 && !rs.length && !s.ended; i++) { Dir.stepLocal(s); if (!s.pending.length) rs = Dir.rumors(s, 3); }
    assert(rs.length, '600 步里没有可插手的传闻');
    const job = Dir.job(s);
    assert(job.rumors.length && /近来的传闻/.test(job.messages[1].content), '打包里没有传闻');
    const pick = Dir.parse(s, job, JSON.stringify({ think: '我去看看。', rumor: 'r1', how: job.rumors[0].plans[0].say }));
    assert(pick.ok && pick.choice.plan && pick.choice.seen.includes(job.rumors[0].hid), '挑传闻没过：' + JSON.stringify(pick));
    const before = P.player(s).locationId;
    const r = Dir.exec(s, pick.choice);
    assert(r.ok || r.partial, '插手没做成：' + r.error);
    assert(!Dir.rumors(s, 3).some((x) => x.hid === job.rumors[0].hid), '插手过的传闻还在待办里');
    return '「' + pick.choice.plan.say + '」' + (P.player(s).locationId !== before ? '（赶了路）' : '');
  });

  await check('D4', '节奏：「要紧时」只在要紧处问 AI，「不用」一次不问，超时回落本地；暂停即停', async () => {
    const steps = async (s, n) => { for (let i = 0; i < n && !s.ended; i++) await D.step(s); };
    // 每步都回一个合规打算：照“按常理”的编号
    REPLY = (body) => {
      if (isEventReq(body)) return { id: eventIds(body)[0] || 'safe', think: '我稳妥些。' };
      const m = /按常理的下一步：a(\d+)/.exec(userOf(body));
      return { think: '我照常行事。', steps: [{ act: 'a' + (m ? m[1] : '1') }] };
    };
    setup('ok');
    const s = Game.newGame({ origin: 'loose', seed: 'dir-pace' });
    D.reset(); D.s = s; D.running = true; D.setMode('key');
    await steps(s, 120);
    const keyCalls = log.length;
    const aiNotes = (s.aiLog || []).filter((r) => r.kind === 'dir' && r.via === 'ai').length;
    assert(keyCalls > 3 && keyCalls < 120, '「要紧时」问了 ' + keyCalls + ' 回（120 步）');
    assert(aiNotes > 0, 'AI 的主意没记下心声');
    D.setMode('off'); log.length = 0;
    await steps(s, 60);
    assert(log.length === 0, '「不用」还问了 ' + log.length + ' 回');
    // 超时：AI 不回话，这一步照本心走
    setup('never', { timeoutMs: 3000 });
    D.setMode('every');
    const t0 = Date.now(), y0 = s.t;
    await D.step(s);
    assert(s.t > y0 || s.pending.length || s.ended, '超时后没走这一步');
    assert(Date.now() - t0 < 5000, '超时等太久');
    // 暂停：循环立刻停，不再走
    setup('ok');
    D.setMode('off'); D.setSpeed('fast');
    D.start(s);
    await new Promise((r) => setTimeout(r, 700));
    D.stop('已暂停');
    const t1 = s.t;
    await new Promise((r) => setTimeout(r, 600));
    assert(s.t === t1, '暂停后还在走');
    assert(t1 > y0, '开始以后一步没走');
    D.reset();
    return '「要紧时」120 步问了 ' + keyCalls + ' 回；「不用」0 回；超时 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒内回落';
  });

  await check('D5', '同种子同本心，本地导演的一生逐位相同；存档读档后接着导演', () => {
    const a = live('dir-same', 'mortal', 'youli', 120).s;
    const b = live('dir-same', 'mortal', 'youli', 120).s;
    assert(Game.save.ruleHash(a) === Game.save.ruleHash(b), '同种子同本心结果不同');
    const r = Game.save.deserialize(Game.save.serialize(a, 1));
    assert(r.ok, '读档失败：' + r.error);
    assert(r.state.director && r.state.director.persona === 'youli', '本心没跟着存档');
    for (let i = 0; i < 50 && !r.state.ended; i++) Dir.stepLocal(r.state);
    FX.Sim.check(r.state);
    return '种子 dir-same，' + P.realmName(P.player(a)) + '，读档后又走 50 步';
  });

  await check('D6', '试玩后的修正：不往荒原那头够不着的地方找灵机（家族子弟不再困在凡人国）；游历到新地方先住下不立刻折返；静养挑够长的日子；差事可一口气做半年；高境界 NPC 少横死、原著人物不横死；结丹缺灵机四级时有“下一步”、苦修会去开洞府', () => {
    // 1) 找灵机只看走得通的路：家族子弟一生里待在灵机 0 级之地的年份很少
    let zeroYears = 0, years = 0, pingpong = 0, travels = 0, restSteps = 0, restMonths = 0;
    for (const per of ['jingying', 'qiudao', 'youli']) for (let i = 0; i < 2; i++) {
      const s = Game.newGame({ origin: 'clan', seed: 'd6-' + per + '-' + i });
      Dir.setPersona(s, per);
      const y0 = s.year; let ly = s.year, steps = 0;
      const hops = [];
      while (!s.ended && s.year - y0 < 200 && steps < 8000) {
        steps++;
        const p = P.player(s), from = p.locationId, t0 = s.t;
        const r = Dir.stepLocal(s);
        if (P.player(s).locationId !== from && !s.pending.length) { hops.push({ from, to: P.player(s).locationId, t: s.t }); travels++; }
        if (s.year !== ly) { ly = s.year; years++; if (s.places[P.player(s).locationId].qi === 0 && P.player(s).realm.major >= 3) zeroYears++; }
        void r; void t0;
      }
      for (let k = 2; k < hops.length; k++) if (hops[k].to === hops[k - 2].to && hops[k - 1].to === hops[k - 2].from && hops[k].t - hops[k - 1].t <= 20 && hops[k - 1].t - hops[k - 2].t <= 20) pingpong++;
      for (const e of s.history) if (e.type === 'rest' && e.pov) { restSteps++; restMonths += 1; }
    }
    assert(zeroYears / Math.max(1, years) < 0.1, '筑基以后还常在灵机 0 级的凡人国修炼：' + zeroYears + '/' + years + ' 年');
    assert(pingpong <= travels * 0.05, '刚到就折返的来回跑太多：' + pingpong + '/' + travels);
    // 2) 静养挑够长的日子
    const s = Game.newGame({ origin: 'loose', seed: 'd6-rest' });
    const p = P.player(s); p.health = { state: 'heavy', days: 300 }; s.player.inv.heal = 0;
    const ra = Dir.restFor(s);
    assert(ra && ra.days >= 150, '重伤 300 天只静养 ' + (ra && ra.days) + ' 天');
    // 3) 半年差事：一次结六个月的工钱，只记一条纪事
    const w = Game.newGame({ origin: 'mortal', seed: 'd6-work' });
    const half = Game.actions(w).find((a) => a.type === 'work' && a.days >= 180 && a.ok);
    assert(half, '凡人国没有做半年的营生');
    const st0 = w.player.stone, h0 = w.history.length, t0 = w.t;
    const r = Game.act(w, half);
    assert(r.ok, '做半年失败：' + r.error);
    assert(w.t - t0 >= 150 || w.pending.length, '半年差事没过半年：' + (w.t - t0) + ' 天');
    assert(w.player.stone > st0, '半年差事没挣到钱');
    assert(w.history.slice(h0).filter((e) => e.type === 'work').length === 1, '半年差事记了不止一条');
    // 4) NPC 横死：元神以后打了一成不到的折，原著人物不横死
    const cf = FX.CONFIG.life;
    assert(cf.npcAccidentRealm[7] <= 0.1 && cf.npcAccidentRealm[2] === 1, '横死折扣不对');
    const g = Game.newGame({ origin: 'sect', seed: 'd6-canon' });
    const canon = Object.values(g.people).filter((q) => q.notable && P.alive(q)).map((q) => q.id);
    for (let y = 0; y < 150; y++) FX.Sim.yearly(g);
    const dead = canon.filter((id) => !P.alive(g.people[id]) && /遇险/.test(g.people[id].deathCause || ''));
    assert(!dead.length, '原著人物外出遇险身亡：' + dead.map((id) => g.people[id].name).join('、'));
    // 5) 结丹要灵机四级：山门只有三级时，“下一步”给出去处或开洞府，苦修照着走，不再干等
    const j = Game.newGame({ origin: 'sect', seed: 'd6-jindan' });
    const jp = P.player(j), seat = j.places[jp.locationId];
    seat.qi = 3; jp.realm = { major: 5, stage: 3 }; jp.progress = P.need(jp); j.player.stone = 20000; j.player.inv.ningdan = 1; jp.lifespanMax = 100000;
    const gq = FX.Guide.next(j);
    assert(gq && gq.need.qi === 4 && gq.ways.length, '结丹缺灵机时没有“下一步”：' + JSON.stringify(gq && gq.need));
    let reached = false;
    for (let k = 0; k < 40 && !reached; k++) { if (j.pending.length) { Dir.stepLocal(j); continue; } if (FX.CU.qiFor(j, jp) >= 4) reached = true; else Game.act(j, Dir.diligent(j, Dir.mkRng('j' + k))); }
    assert(reached, '苦修没去找灵机四级之地：还在' + j.places[jp.locationId].name);
    return `结丹缺灵机时“下一步”：${gq.best.text}；家族子弟筑基后待在灵机 0 级之地 ${zeroYears}/${years} 年；折返 ${pingpong}/${travels} 次；重伤 300 天静养 ${ra.days} 天；半年差事得符钱 ${w.player.stone - st0}；原著人物 ${canon.length} 位，150 年里无人横死`;
  });

  const summary = { when: new Date().toISOString(), passed: results.filter((r) => r.ok).length, total: results.length, results };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'director-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n导演模式测试：${summary.passed}/${summary.total} 通过`);
  process.exit(summary.passed === summary.total ? 0 : 1);
})();
