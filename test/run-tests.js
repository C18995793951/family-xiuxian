#!/usr/bin/env node
// 自动化测试：在 Node 中无头运行模拟核心。
// 用法：node test/run-tests.js [--seeds N] [--years Y] [--quick]
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');
const { runGame, STRATEGIES, mkRng } = require('./strategies');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const QUICK = args.includes('--quick');
const SEEDS = arg('--seeds', QUICK ? 3 : 10);
const YEARS = arg('--years', 300);

const FX = loadCore();
const ORIGINS = Object.keys(FX.CONFIG.origins);
const STRATS = Object.keys(STRATEGIES);
const results = [];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
function check(no, name, fn) {
  if (ONLY && !ONLY.includes(no)) return;
  const t0 = Date.now();
  try {
    const detail = fn();
    results.push({ no, name, ok: true, detail, ms: Date.now() - t0 });
    console.log(`✓ ${no} ${name}${detail ? '：' + detail : ''}`);
  } catch (e) {
    results.push({ no, name, ok: false, detail: e.message, ms: Date.now() - t0 });
    console.log(`✗ ${no} ${name}：${e.message}`);
    if (process.env.DEBUG) console.log(e.stack);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// 0. 分层规则：核心不得访问 DOM、浏览器存储、网络、Math.random、Date.now
check('0', '核心纯净（无 DOM / 网络 / Math.random / Date.now）', () => {
  const bad = [];
  for (const f of loadCore.FILES) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', f + '.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const pat of ['Math.random', 'Date.now', 'new Date', 'window.', 'document.', 'localStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'WebSocket']) if (src.includes(pat)) bad.push(f + ':' + pat);
  }
  assert(!bad.length, bad.join(', '));
  return loadCore.FILES.length + ' 个核心文件';
});

// 1. 长时间模拟：每年结算后核心自检（S.check）；每一步后检查待决事件引用
const agg = { games: 0, years: 0, steps: 0, ms: 0, histMax: 0, deaths: {}, seek: 0, seekNoGain: 0, explores: 0, nothing: 0, fortunes: 0, maxRealm: {} };
check('1', `长时间模拟（${ORIGINS.length} 出身 × ${STRATS.length} 策略 × ${SEEDS} 种子，至多 ${YEARS} 年）`, () => {
  for (const origin of ORIGINS) for (const strategy of STRATS) for (let i = 0; i < SEEDS; i++) {
    const t0 = Date.now();
    const s = runGame(FX, {
      origin, strategy, seed: `t-${origin}-${strategy}-${i}`, years: YEARS,
      onStep(st) { agg.steps++; for (const e of st.pending) assert(FX.Ev.valid(st, e.bound), '待决事件引用失效'); },
    });
    agg.games++; agg.ms += Date.now() - t0;
    agg.years += s.year - FX.CONFIG.startYear;
    agg.histMax = Math.max(agg.histMax, s.history.length);
    const st = s.player.stats;
    agg.seek += st.seek; agg.seekNoGain += st.seekNoGain; agg.explores += st.explores; agg.nothing += st.exploreNothing; agg.fortunes += st.fortunes;
    const cause = s.ended ? s.ended.what.replace(/之手$/, '').replace(/^败于.*/, '斗法落败') : '仍在世';
    agg.deaths[cause] = (agg.deaths[cause] || 0) + 1;
    const rn = FX.P.realmName(FX.P.player(s)).replace(/[一二三四五六七八九]层|初期|中期|后期/, '');
    agg.maxRealm[rn] = (agg.maxRealm[rn] || 0) + 1;
    FX.Sim.check(s);
  }
  return `${agg.games} 局，共 ${agg.years} 年、${agg.steps} 步，无异常；结局：${Object.entries(agg.deaths).map(([k, v]) => k + ' ' + v).join('，')}；终境：${Object.entries(agg.maxRealm).map(([k, v]) => k + ' ' + v).join('，')}`;
});

check('2', '死者不行动、不被拜访', () => {
  const s = runGame(FX, { origin: 'loose', strategy: 'wanderer', seed: 'dead-check', years: 400 });
  assert(s.ended, '400 年后主角应已身故');
  assert(!FX.Game.act(s, { type: 'cultivate', days: 30 }).ok, '身故后仍能行动');
  assert(FX.Game.actions(s).length === 0, '身故后仍有行动清单');
  const s2 = runGame(FX, { origin: 'sect', strategy: 'diligent', seed: 'dead-check-2', years: 80 });
  let n = 0;
  if (!s2.ended && !s2.pending.length) for (const a of FX.Game.actions(s2)) if (a.npc) { n++; assert(FX.P.alive(s2.people[a.npc]), '可以拜访已故之人'); }
  for (const p of Object.values(s2.people)) if (p.status === 'dead') assert(p.deathYear !== null && p.deathYear >= p.birthYear, p.name + ' 卒年异常');
  return `身故后行动被拒；${n} 个可拜访对象全部在世`;
});

check('3', '时间线一致', () => {
  const s = FX.Game.newGame({ origin: 'clan', seed: 'time', surname: '沈', given: '青' });
  const p = FX.P.player(s);
  assert(p.name === '沈青', '自定姓名未生效：' + p.name);
  assert(FX.P.age(s, p) === FX.CONFIG.life.adultAge, '开局年龄不是 16');
  assert(s.places[p.locationId].surname === '沈', '小族出身的家族驻地没有用主角姓氏');
  const t0 = s.t;
  FX.Game.act(s, { type: 'cultivate', days: 360 });
  if (!s.pending.length) assert(s.t - t0 === 360 && s.year === FX.CONFIG.startYear + 1, '修炼一年后时间不对');
  for (const q of Object.values(s.people)) assert(s.year - q.birthYear >= 16, q.name + ' 不足 16 岁');
  return `${FX.T.fmtFull(t0)} → ${FX.T.fmtFull(s.t)}`;
});

// 逐步跑一局，可在第 k 步存档读档后继续（含“有待决事件”的中断态）
function runSteps(origin, strategy, seed, steps, reloadAt) {
  let s = FX.Game.newGame({ origin, seed });
  const rng = mkRng('strat-' + seed);
  let interrupted = false;
  for (let i = 0; i < steps && !s.ended; i++) {
    if (i === reloadAt) {
      if (s.pending.length) interrupted = true;
      const r = FX.Save.deserialize(FX.Save.serialize(s));
      assert(r.ok, '读档失败：' + r.error);
      s = r.state;
    }
    if (s.pending.length) { const v = FX.Game.pendingEvents(s)[0]; FX.Game.choose(s, v.id, v.options.find((o) => o.available).id); }
    else FX.Game.act(s, STRATEGIES[strategy](FX, s, rng) || { type: 'cultivate', days: 360 });
  }
  return { s, interrupted };
}
check('4', '存档一致（含有待决事件时存档）', () => {
  let cases = 0, interruptCases = 0;
  for (const origin of ORIGINS) for (const strategy of STRATS) for (let i = 0; i < Math.max(2, Math.floor(SEEDS / 2)); i++) {
    const seed = `save-${origin}-${strategy}-${i}`;
    const A = runSteps(origin, strategy, seed, 300, -1).s;
    const k = 20 + ((i * 53) % 200);
    const B = runSteps(origin, strategy, seed, 300, k);
    if (B.interrupted) interruptCases++;
    assert(FX.Save.hashState(A) === FX.Save.hashState(B.s), `${seed} 读档后哈希不同`);
    cases++;
  }
  // 专门构造一次“有待决事件”的存档
  const { s } = runSteps('loose', 'wanderer', 'pending-save', 400, -1);
  let tries = 0;
  const s2 = FX.Game.newGame({ origin: 'loose', seed: 'pending-save-2' });
  while (!s2.pending.length && !s2.ended && tries++ < 500) {
    const A = FX.Game.actions(s2);
    const wild = s2.places[FX.P.player(s2).locationId].danger > 0;
    FX.Game.act(s2, wild ? A.find((a) => a.type === 'explore' && a.days === 30) : A.find((a) => a.type === 'travel' && s2.places[a.to].danger > 0) || A.find((a) => a.type === 'travel'));
  }
  assert(s2.pending.length, '未能构造待决事件');
  const r = FX.Save.deserialize(FX.Save.serialize(s2));
  assert(r.ok && r.state.pending.length === s2.pending.length && FX.Save.hashState(r.state) === FX.Save.hashState(s2), '待决事件未完整保存');
  return `${cases} 组对照，其中 ${interruptCases} 组恰在待决事件时存档；另构造一次待决事件存档，完整还原（${s.history.length} 条记录的对照局）`;
});
check('4b', '存档校验能拒绝损坏文件与旧版家族存档', () => {
  const s = FX.Game.newGame({ origin: 'loose', seed: 'corrupt' });
  const t = FX.Save.serialize(s);
  const st0 = '"stone":' + FX.CONFIG.origins.loose.stone;
  assert(t.includes(st0), '找不到要篡改的字段');
  const bad1 = FX.Save.deserialize(t.replace(st0, '"stone":' + (FX.CONFIG.origins.loose.stone + 1)));
  assert(!bad1.ok && /校验和/.test(bad1.error), '篡改未被发现');
  assert(!FX.Save.deserialize('{"state":').ok, '坏 JSON 未被拒绝');
  const o = JSON.parse(t); o.schemaVersion = 99;
  assert(/版本/.test(FX.Save.deserialize(o).error), '新版本存档未被拒绝');
  const old = JSON.parse(t); old.schemaVersion = 1; delete old.checksum;
  assert(/旧版/.test(FX.Save.deserialize(old).error), '旧版家族存档没有给出明确提示');
  const v2 = JSON.parse(t); v2.schemaVersion = 2; delete v2.checksum;
  assert(/仙业/.test(FX.Save.deserialize(v2).error), '换世界之前的存档没有给出明确提示');
  return '校验和、JSON、版本、旧版家族存档、换世界前的存档五类错误均给出可读提示';
});

check('5', '可复现（同种子同策略两次运行哈希逐位相同）', () => {
  for (const origin of ORIGINS) for (const strategy of STRATS) {
    const a = runGame(FX, { origin, strategy, seed: 'repro', years: 200 });
    const b = runGame(FX, { origin, strategy, seed: 'repro', years: 200 });
    assert(FX.Save.hashState(a) === FX.Save.hashState(b), `${origin}/${strategy} 不可复现`);
  }
  const w1 = FX.Game.newGame({ origin: 'loose', seed: 'w' }), w2 = FX.Game.newGame({ origin: 'loose', seed: 'w2' });
  assert(JSON.stringify(Object.values(w1.places).map((p) => p.name)) !== JSON.stringify(Object.values(w2.places).map((p) => p.name)), '不同种子生成了同一个世界');
  return `${ORIGINS.length * STRATS.length} 组；不同种子世界不同`;
});

check('6', '无死局（任何时刻都有合法行动或可选项）', () => {
  let ev = 0, steps = 0;
  for (let i = 0; i < 30; i++) {
    const s = FX.Game.newGame({ origin: ORIGINS[i % 3], seed: 'nodead' + i });
    const rng = mkRng('nd' + i);
    let guard = 0;
    while (!s.ended && guard++ < 3000) {
      steps++;
      if (s.pending.length) {
        const e = FX.Game.pendingEvents(s)[0]; ev++;
        const av = e.options.filter((o) => o.available);
        assert(av.length, `事件 ${e.defId} 没有可选项`);
        assert(FX.Game.choose(s, e.id, av[Math.floor(rng() * av.length)].id).ok, '决断失败');
        continue;
      }
      const A = FX.Game.actions(s).filter((a) => a.ok);
      assert(A.length, '没有任何可行行动');
      const a = A[Math.floor(rng() * A.length)];
      const r = FX.Game.act(s, a);
      assert(r.ok, '清单内的行动执行失败：' + a.label + ' ' + r.error);
    }
    assert(s.ended || guard >= 3000, '异常退出');
  }
  return `30 局随机乱走 ${steps} 步，处理 ${ev} 件遭遇，每一步都有路可走`;
});

check('7', '清单外的行动一律拒绝', () => {
  const s = FX.Game.newGame({ origin: 'loose', seed: 'reject' });
  const me = FX.P.player(s);
  const far = Object.values(s.places).find((p) => p.id !== me.locationId && !s.places[me.locationId].links.some((l) => l.to === p.id));
  const stranger = FX.P.living(s).find((q) => q.locationId !== me.locationId);
  const bad = [
    { type: 'travel', to: far.id },
    { type: 'cultivate', days: 7 },
    { type: 'befriend', npc: stranger.id },
    { type: 'consult', npc: stranger.id },
    { type: 'fly' },
    { type: 'use', item: 'zhuji' },
  ];
  for (const a of bad) assert(!FX.Game.act(s, a).ok, '清单外行动被执行：' + JSON.stringify(a));
  const before = FX.Save.hashState(s);
  for (const a of bad) FX.Game.act(s, a);
  assert(FX.Save.hashState(s) === before, '被拒的行动改动了局面');
  return bad.length + ' 种非法行动全部被拒，局面不变';
});

check('8', '待决事件的当事人身故 → 事件取消并写明原因', () => {
  const s = FX.Game.newGame({ origin: 'loose', seed: 'ref' });
  const me = FX.P.player(s);
  const foe = FX.World.spawnNpc(s, { realm: { major: 1, stage: 3 }, locationId: me.locationId });
  FX.Ev.spawn(s, 'ROBBER', { place: me.locationId, foe: foe.id }, []);
  FX.P.kill(s, foe, '测试', [], {});
  FX.Ev.prune(s);
  assert(!s.pending.length, '死者仍被事件引用');
  const last = s.history[s.history.length - 1];
  assert(/已不在/.test(FX.H.text(last)), '未写明终止原因');
  return '写明“' + FX.H.text(last) + '”';
});

// 原则一：不强行制造奇遇
check('9', '原则一：多数时候什么都不发生，奇遇受冷却限制', () => {
  const nothingShare = agg.nothing / Math.max(1, agg.explores);
  assert(nothingShare >= 0.4, `游历“无所获”只占 ${(nothingShare * 100).toFixed(1)}%（应 ≥ 40%）`);
  const fortuneShare = agg.fortunes / Math.max(1, agg.explores);
  assert(fortuneShare <= 0.05, `奇遇占游历 ${(fortuneShare * 100).toFixed(1)}%（应 ≤ 5%）`);
  // 冷却：任意一局里相邻两次奇遇至少隔 5 年
  for (let i = 0; i < SEEDS; i++) {
    const ts = [];
    runGame(FX, { origin: 'loose', strategy: 'wanderer', seed: 'fortune-' + i, years: 200, onStep(s) { if (s.player.lastFortuneT > (ts[ts.length - 1] || -1e9)) ts.push(s.player.lastFortuneT); } });
    for (let k = 1; k < ts.length; k++) assert(ts[k] - ts[k - 1] >= FX.CONFIG.encounter.fortuneCooldownDays, '两次奇遇相隔不足五年');
  }
  // 在安全的地方专心修炼一年，绝大多数时候不会有事找上门
  let quiet = 0;
  for (let i = 0; i < 200; i++) {
    const s = FX.Game.newGame({ origin: 'sect', seed: 'quiet' + i });
    FX.Game.act(s, { type: 'cultivate', days: 360 });
    if (!s.pending.length) quiet++;
  }
  assert(quiet >= 190, `宗门里闭关一年被打扰 ${200 - quiet}/200 次`);
  return `游历 ${agg.explores} 次：无所获 ${(nothingShare * 100).toFixed(1)}%，奇遇 ${(fortuneShare * 100).toFixed(1)}%；宗门闭关一年 200 次中 ${quiet} 次无事`;
});

// 原则二：不保证幸运，有些努力没有回报
check('10', '原则二：求取类行动至少三成没有收获', () => {
  const share = agg.seekNoGain / Math.max(1, agg.seek);
  assert(share >= 0.3, `无收获占比 ${(share * 100).toFixed(1)}%`);
  for (const strategy of STRATS) {
    let a = 0, b = 0;
    for (let i = 0; i < SEEDS; i++) { const s = runGame(FX, { origin: ORIGINS[i % 3], strategy, seed: 'luck-' + strategy + i, years: YEARS }); a += s.player.stats.seek; b += s.player.stats.seekNoGain; }
    assert(b / Math.max(1, a) >= 0.3, `${strategy} 策略无收获占比 ${(b / a * 100).toFixed(1)}%`);
  }
  // 冲关失败确实会发生
  let fails = 0, tries = 0;
  for (let i = 0; i < 300; i++) {
    const s = FX.Game.newGame({ origin: 'loose', seed: 'brk' + i });
    const p = FX.P.player(s);
    p.realm = { major: 2, stage: 9 }; p.progress = FX.P.need(p);
    const r = FX.CU.attempt(s, p);
    tries++; if (!r.success) fails++;
  }
  assert(fails > 0 && fails < tries, '冲关结果没有随机性');
  return `全部求取 ${agg.seek} 次中 ${(share * 100).toFixed(1)}% 无收获；各策略均 ≥ 30%；不服大造元珠冲筑基 ${tries} 次失败 ${fails} 次`;
});

check('11', '性能（每模拟一年 < 20ms）', () => {
  const per = agg.ms / Math.max(1, agg.years);
  assert(per < 20, '平均每年 ' + per.toFixed(2) + 'ms');
  return `平均每年 ${per.toFixed(2)} ms（含策略），单局历史条目最多 ${agg.histMax}`;
});

check('12', '宗门渠道：拜入、请授、道功兑换、上交、符诏、俸禄、旧存档迁移', () => {
  const CF = FX.CONFIG;
  // 玄真派弟子：差事记道功，筑基后白领紫府篇，道功换丹母砂
  const s = FX.Game.newGame({ origin: 'sect', seed: 'house' });
  const p = FX.P.player(s);
  let r = FX.Game.act(s, { type: 'work', days: 30 });
  assert(r.ok && s.player.merit === CF.house.taskMerit[2], '差事没有记道功');
  p.realm = { major: 3, stage: 2 };
  const acts = FX.Game.actions(s);
  const kf = acts.find((a) => a.type === 'sect_learn' && a.tech === 'sanqi_kaifu');
  assert(kf && kf.ok && kf.cost === 0, '筑基弟子领不到紫府篇');
  assert(FX.Game.act(s, kf).ok && s.player.manuals.includes('sanqi_kaifu') && FX.CU.bestKaifu(s) === 'sanqi_kaifu', '请授后没有开府真法');
  s.player.merit = 100;
  r = FX.Game.act(s, { type: 'redeem', item: 'danmusha' });
  assert(r.ok && s.player.inv.danmusha === 1 && s.player.merit === 10, '道功换丹母砂失败');
  assert(!FX.Game.act(s, { type: 'redeem', item: 'yusui' }).ok, '筑基弟子不该换到玉髓');
  s.player.inv.beastCore = 2;
  r = FX.Game.act(s, { type: 'submit', item: 'beastCore' });
  assert(r.ok && s.player.inv.beastCore === 0 && s.player.merit === 10 + 2 * CF.house.submit.beastCore, '上交妖物内丹没有记道功');
  // 离开山门就办不了
  const away = s.places[p.locationId].links[0].to;
  p.locationId = away;
  const far = FX.Game.actions(s).find((a) => a.type === 'redeem' && a.item === 'qiju');
  assert(far && !far.ok && /要回到/.test(far.reason), '不在山门也能兑换');
  // 俸禄按境界发
  const st0 = s.player.stone;
  FX.Sect.payStipend(s);
  assert(s.player.stone - st0 === Math.round(CF.house.stipend.sect.stone[3] * CF.house.posts.stipendMult[1]), '俸禄没有按境界、职位发放');
  // 符诏：生成一件除妖事件，打赢记道功
  const s3 = FX.Game.newGame({ origin: 'sect', seed: 'mission' });
  r = FX.Game.act(s3, { type: 'mission', days: CF.house.mission.days });
  assert(r.ok && s3.pending.length && s3.pending[0].bound._merit > 0, '符诏没有生成除妖事件');
  // 散修拜入玄真派：只能在山门求，一年一回，屡求不成成功率上升
  let joined = 0, tries = 0, rise = true;
  for (let i = 0; i < 30; i++) {
    const s2 = FX.Game.newGame({ origin: 'loose', seed: 'join' + i });
    const me = FX.P.player(s2);
    const xz = Object.values(s2.factions).find((f) => f.key === 'xuanzhen');
    assert(!FX.Game.actions(s2).some((a) => a.type === 'join' && a.ok), '不在山门也能求入');
    me.locationId = xz.seatId;
    const c0 = FX.Sect.joinChance(s2, xz).chance;
    const j = FX.Game.actions(s2).find((a) => a.type === 'join');
    assert(j && j.ok, '在山门却不能求入');
    FX.Game.act(s2, j); tries++;
    if (me.factionId === xz.id) { joined++; const lr = FX.Game.actions(s2).find((a) => a.type === 'sect_learn' && a.tech === 'dingjin'); assert(lr && lr.ok, '拜入后领不到根本法门'); }
    else {
      assert(!FX.Game.actions(s2).some((a) => a.type === 'join' && a.ok), '同一年能求两回');
      if (FX.Sect.joinChance(s2, xz).chance <= c0 && c0 < 90) rise = false;
    }
  }
  assert(joined > 0 && joined < tries, '拜入没有成败之分');
  assert(rise, '求过一回后成功率没有上升');
  // v3 存档迁移到 v4
  const t = JSON.parse(FX.Save.serialize(FX.Game.newGame({ origin: 'clan', seed: 'mig' })));
  t.schemaVersion = 3; t.state.schemaVersion = 3;
  for (const k of ['merit', 'joinTried', 'submitted', 'orders']) delete t.state.player[k];
  delete t.checksum;
  const m = FX.Save.deserialize(t);
  assert(m.ok && m.state.player.merit === 0 && Array.isArray(m.state.player.orders), 'v3 存档迁移失败：' + m.error);
  return `差事、请授、兑换、上交、离山限制、俸禄、符诏均正常；散修求入玄真派 ${tries} 次成 ${joined} 次；v3 存档可迁移`;
});

check('13', '推进不只靠运气：每道关卡要的东西都有稳定来路', () => {
  const CF = FX.CONFIG, M = CF.market;
  const staple = (k) => M.town.staples.some((x) => x.item === k);
  const order = (k) => M.town.rare.some((x) => x.item === k);
  const store = (k, tier) => CF.house.store.some((x) => x.item === k && (!x.minTier || tier >= x.minTier));
  const needs = ['zhuji'].concat(Object.values(CF.breakthrough.minorNeeds).map((x) => x.item), ['ningdan']);
  const miss = [];
  for (const k of needs) {
    if (!staple(k) && !order(k)) miss.push(k + ' 墟市既不常备也不能代寻');
    if (k !== 'ningdan' && !store(k, 1)) miss.push(k + ' 小宗库藏没有');
    if (!store(k, 2)) miss.push(k + ' 二流宗门库藏没有');
  }
  if (!M.town.staples.some((x) => x.item.startsWith('tech:') && CF.techniques[x.item.slice(5)].kind === 'lianqi')) miss.push('墟市不常备练炁术');
  if (!M.town.staples.some((x) => x.item.startsWith('tech:') && CF.techniques[x.item.slice(5)].kind === 'kaifu')) miss.push('墟市不常备开府真法');
  for (const d of CF.factionDefs.filter((x) => x.type === 'sect' && !x.outer)) {
    if (!d.library.some((e) => !e.merit && CF.techniques[e.tech].kind === 'lianqi')) miss.push(d.name + ' 不白传练炁术');
    if (!d.library.some((e) => CF.techniques[e.tech].kind === 'kaifu')) miss.push(d.name + ' 不传开府真法');
  }
  // 八派六宗只收金丹，白传一部道书
  for (const d of CF.factionDefs.filter((x) => x.outer)) if (!d.library.some((e) => !e.merit && CF.techniques[e.tech].kind === 'dao')) miss.push(d.name + ' 不白传道书');
  // 元神要的「地」：大派山门之外，还有能开洞府的六级福地
  if (!CF.world.outer.places.some((x) => x.qi >= CF.breakthrough.yuanshen.minQi && (x.type === 'wild' || x.type === 'danger') && CF.dongfu.cost[x.qi])) miss.push('没有能开洞府的六级福地');
  if (!CF.market.mart.staples.some((x) => x.item === 'ningdan')) miss.push('中域坊市不常备凝丹大药');
  assert(!miss.length, miss.join('；'));
  // 实测：一年年过去，金谷墟市的常备货始终都在
  const s = FX.Game.newGame({ origin: 'loose', seed: 'stock' });
  const town = Object.values(s.places).find((x) => x.type === 'town');
  for (let y = 0; y < 30; y++) {
    FX.World.refreshMarket(s, town.id);
    for (const x of M.town.staples) assert(s.markets[town.id].stock.some((y2) => y2.item === x.item && y2.qty >= x.qty[0]), x.item + ' 某年断货');
  }
  // 代寻一定送到
  FX.P.player(s).locationId = town.id;
  s.player.stone = 20000;
  s.markets[town.id].stock = s.markets[town.id].stock.filter((x) => x.item !== 'ningdan');
  const o = FX.Game.actions(s).find((a) => a.type === 'order' && a.item === 'ningdan');
  assert(o && o.ok && FX.Game.act(s, o).ok, '托人代寻失败');
  FX.Sim.passDays(s, CF.market.order.slowDays.ningdan + 30, 'rest');
  assert(s.pending.length || s.player.inv.ningdan === 1, '代寻的凝丹大药没有送到');
  return `${needs.length} 种冲关外药、练炁术、开府真法都有稳定来路（墟市常备或代寻、宗门库藏）；墟市常备货 30 年不断；代寻按期送到`;
});

check('14', '后期：天下大事、校考、地渊、撷芳宴、洞府、推举、仇家、自动服丹、v4 存档迁移', () => {
  const CF = FX.CONFIG, SG = CF.saga;
  const choose = (s) => { const v = FX.Game.pendingEvents(s)[0]; return FX.Game.choose(s, v.id, v.options.find((o) => o.available).id); };
  const pass = (s, years) => { for (let y = 0; y < years && !s.ended; y++) { FX.Sim.passDays(s, CF.daysPerYear, 'rest'); while (s.pending.length && !s.ended) choose(s); } };
  // 1. 排期由种子定：同种子同日子；每次开启前三年先有风声
  const a = FX.Game.newGame({ origin: 'sect', seed: 'saga' }), b = FX.Game.newGame({ origin: 'sect', seed: 'saga' });
  assert(JSON.stringify(a.saga) === JSON.stringify(b.saga), '同种子大事日子不同');
  const s = FX.Game.newGame({ origin: 'loose', seed: 'saga-run' });
  FX.P.player(s).lifespanBonus = 400; // 只看排期，不让主角老死
  const p0 = FX.P.player(s); p0.realm = { major: 3, stage: 1 };
  pass(s, 120);
  const opens = s.history.filter((e) => /^saga_open_/.test(e.key));
  const notices = s.history.filter((e) => e.key === 'saga_notice');
  const T = (e) => Math.floor(e.t / CF.daysPerYear);
  const kinds = {};
  for (const e of opens) {
    const k = e.key.slice(10);
    kinds[k] = (kinds[k] || 0) + 1;
    const y = T(e);
    assert(notices.some((n) => n.params.what === SG[k].name && T(n) === y - SG.notice), SG[k].name + ' 在 ' + y + ' 年开启前三年没有风声');
  }
  assert(kinds.diyuan >= 5 && kinds.xiefang >= 3 && kinds.jiaokao >= 3, '120 年里大事太少：' + JSON.stringify(kinds));
  // 2. 道脉校考：评定是确定的；上考听讲涨修为、得下赐
  const j = FX.Game.newGame({ origin: 'sect', seed: 'jiaokao' });
  const jp = FX.P.player(j);
  jp.realm = { major: 3, stage: 1 }; jp.progress = 0;
  const g1 = FX.Saga.grade(j), g2 = FX.Saga.grade(j);
  assert(g1.g === g2.g, '校考评定不确定');
  j.saga.jiaokao.next = j.year; j.saga.jiaokao.open = { from: j.year, until: j.year };
  const ja = FX.Game.actions(j).find((x) => x.type === 'jiaokao');
  assert(ja && ja.ok, '校考之年在山门却应不了考');
  const m0 = j.player.merit, pr0 = jp.progress, man0 = j.player.manuals.length;
  assert(FX.Game.act(j, ja).ok, '应考失败');
  while (j.pending.length) choose(j);
  if (g1.g === 3) assert(jp.progress > pr0 && j.player.manuals.length > man0, '上考没有听讲、下赐');
  if (g1.g >= 2) assert(j.player.merit > m0, '中考以上没有记道功');
  assert(!FX.Game.actions(j).some((x) => x.type === 'jiaokao' && x.ok), '一回校考能应两次');
  // 3. 地渊：外围采药是稳的，一定有人面芝
  let herbs = 0, hurt = 0;
  for (let i = 0; i < 20; i++) {
    const d = FX.Game.newGame({ origin: 'sect', seed: 'dy' + i });
    const dp = FX.P.player(d); dp.realm = { major: 3, stage: 1 };
    const pit = Object.values(d.places).find((x) => x.name === SG.diyuan.place);
    dp.locationId = pit.id;
    d.saga.diyuan.open = { from: d.year, until: d.year };
    const da = FX.Game.actions(d).find((x) => x.type === 'diyuan');
    assert(da && da.ok, '地渊开启时进不去');
    FX.Game.act(d, da);
    if (!d.pending.length || d.pending[0].defId !== 'DIYUAN') continue; // 路上出了变故
    const h0 = d.player.inv.rareHerb || 0, mer0 = d.player.merit;
    const v = FX.Game.pendingEvents(d)[0];
    FX.Game.choose(d, v.id, 'outer');
    assert((d.player.inv.rareHerb || 0) - h0 >= SG.diyuan.outerHerb[0], '外围采药空手而回');
    assert(d.player.merit > mer0, '带地渊符诏却没记道功');
    herbs++; if (dp.health.state !== 'healthy') hurt++;
    assert(!FX.Game.actions(d).some((x) => x.type === 'diyuan' && x.ok), '一回地渊能进两次');
  }
  assert(herbs >= 15, '进地渊多半出了变故');
  // 4. 撷芳宴：散修连胜三场就拜入花神府；输一场就作罢
  let xfJoined = 0, xfTried = 0;
  for (let i = 0; i < 12; i++) {
    const x = FX.Game.newGame({ origin: 'loose', seed: 'xiefang' + i });
    const xp = FX.P.player(x);
    xp.realm = { major: 4, stage: 3 }; x.player.stone = 5000; x.player.inv.fuqi2 = 1;
    const hs = Object.values(x.factions).find((f) => f.key === 'huashen');
    xp.locationId = hs.seatId;
    x.saga.xiefang.open = { from: x.year, until: x.year };
    const xa = FX.Game.actions(x).find((y) => y.type === 'xiefang');
    assert(xa && xa.ok && xa.cost === FX.Saga.xiefangFee(xp), '撷芳宴赴不了');
    FX.Game.act(x, xa);
    let rounds = 0, won = 0;
    while (x.pending.length && !x.ended && rounds < 10) {
      const v = FX.Game.pendingEvents(x)[0];
      if (v.defId !== 'XIEFANG') { choose(x); continue; }
      rounds++;
      const res = FX.Game.choose(x, v.id, 'fight');
      if (/胜了|连胜/.test(res.result || '')) won++;
    }
    if (rounds) xfTried++;
    assert((xp.factionId === hs.id) === (won === SG.xiefang.rounds), '撷芳宴胜 ' + won + ' 场，拜入与否不对');
    if (xp.factionId === hs.id) xfJoined++;
    assert(!FX.Game.actions(x).some((y) => y.type === 'xiefang' && y.ok), '一回撷芳宴能赴两次');
  }
  assert(xfJoined >= 1, '撷芳宴十二回没一回连胜');
  // 5. 洞府：灵机 +1，打扰少
  const d = FX.Game.newGame({ origin: 'loose', seed: 'dongfu' });
  const dp = FX.P.player(d);
  dp.realm = { major: 3, stage: 1 }; d.player.stone = 50000;
  const spot = Object.values(d.places).find((y) => (y.type === 'wild' || y.type === 'danger') && y.qi >= CF.dongfu.minQi && y.qi < 5 && !y.factionId);
  assert(spot, '地图上没有能开洞府的地方');
  dp.locationId = spot.id;
  const qi0 = FX.CU.qiFor(d, dp);
  const da2 = FX.Game.actions(d).find((y) => y.type === 'dongfu');
  assert(da2 && da2.ok && FX.Game.act(d, da2).ok && d.player.dongfu === spot.id, '开不了洞府');
  assert(FX.CU.qiFor(d, dp) === qi0 + CF.dongfu.qiBonus, '洞府里灵机没有提升');
  // 6. 推举：紫府弟子远超掌门，门中推举接任
  const k = FX.Game.newGame({ origin: 'sect', seed: 'tuiju' });
  const kp = FX.P.player(k), kf = k.factions[kp.factionId], lead = k.people[kf.leaderId];
  lead.realm = { major: 3, stage: 1 }; kp.realm = { major: 4, stage: 3 };
  FX.Sect.tuijuYear(k);
  assert(k.player.post === 2, '紫府弟子没有升长老');
  assert(k.pending.length && k.pending[0].defId === 'TUIJU', '修为远超掌门却没人推举');
  FX.Game.choose(k, FX.Game.pendingEvents(k)[0].id, 'accept');
  FX.Sect.tuijuYear(k);
  assert(kf.leaderId === kp.id && k.player.post === 3 && FX.Sect.stipend(k, kf).stone > 0, '接任掌门失败');
  // 7. 仇家：结了仇的劫修日后找上门
  const r = FX.Game.newGame({ origin: 'loose', seed: 'revenge' });
  const rp = FX.P.player(r);
  rp.realm = { major: 3, stage: 1 };
  const foe = FX.World.spawnNpc(r, { realm: { major: 3, stage: 1 }, locationId: Object.values(r.places)[0].id, kind: 'loose' });
  FX.P.adjustRelation(r, rp.id, foe.id, CF.relations.feudThreshold - 10, '交手');
  let came = 0;
  for (let i = 0; i < 200 && !came; i++) { FX.Saga.revengeYear(r); if (r.pending.length) { came = i + 1; } }
  assert(came && r.pending[0].defId === 'REVENGE', '两百年仇家都没来');
  // 8. 自动服丹：开着就一颗接一颗，关了就不服
  const q = FX.Game.newGame({ origin: 'sect', seed: 'pill' });
  const qp = FX.P.player(q); qp.realm = { major: 2, stage: 3 }; q.player.inv.qiju = 10;
  const rr = FX.Sim.passDays(q, 360, 'cultivate');
  assert(rr.pills >= 3 && q.player.inv.qiju <= 10 - rr.pills + CF.house.stipend.sect.qiju, '闭关一年没有自动续服：' + rr.pills);
  assert(FX.Game.setOption(q, 'autoPill', false).ok && !FX.Game.setOption(q, 'stone', 1).ok, '选项白名单不对');
  const n0 = q.player.inv.qiju;
  FX.Sim.passDays(q, 360, 'cultivate');
  assert(q.player.inv.qiju >= n0, '关了自动服丹还在服');
  // 9. v4 存档迁移到 v5
  const t4 = JSON.parse(FX.Save.serialize(FX.Game.newGame({ origin: 'sect', seed: 'mig5' })));
  t4.schemaVersion = 4; t4.state.schemaVersion = 4;
  for (const kk of ['autoPill', 'dongfu', 'post', 'tuijuDeclined']) delete t4.state.player[kk];
  delete t4.state.saga; delete t4.checksum;
  const m = FX.Save.deserialize(t4);
  assert(m.ok && m.state.saga && m.state.saga.diyuan.next > m.state.year && m.state.player.autoPill === true, 'v4 存档迁移失败：' + m.error);
  return `120 年里地渊 ${kinds.diyuan} 回、撷芳宴 ${kinds.xiefang} 回、校考 ${kinds.jiaokao} 回，每回都提前 ${SG.notice} 年有风声；校考评${g1.name}；地渊外围 ${herbs} 回都有收获（${hurt} 回受轻伤）；撷芳宴 ${xfTried} 回里 ${xfJoined} 回连胜拜入花神府；洞府、推举、仇家、自动服丹、v4 迁移均正常`;
});

check('15', '金丹以后：东弥州腹地、三家大派、道脉改投、金丹品第、元神之地、洞天、天魔潮、v5 存档迁移', () => {
  const CF = FX.CONFIG, B = CF.breakthrough;
  const choose = (s) => { const v = FX.Game.pendingEvents(s)[0]; return FX.Game.choose(s, v.id, v.options.find((o) => o.available).id); };
  // 1. 新开局就有东弥州腹地：地点、关口、三家大派与门人
  const s = FX.Game.newGame({ origin: 'sect', seed: 'outer' });
  const outer = Object.values(s.places).filter((x) => x.outer);
  assert(outer.length === CF.world.outer.places.length, '腹地地点数不对');
  const big = Object.values(s.factions).filter((f) => f.tier === 3);
  assert(big.length === 3 && big.every((f) => s.people[f.leaderId] && s.people[f.leaderId].realm.major === 7), '三家大派或元神掌门缺了');
  assert(big.every((f) => FX.P.living(s).filter((q) => q.factionId === f.id && q.realm.major === 6).length >= 2), '大派里金丹长老太少');
  const gate = Object.values(s.places).find((x) => x.links.some((l) => l.minMajor));
  const gl = gate.links.find((l) => l.minMajor);
  const p = FX.P.player(s);
  p.locationId = gate.id;
  let tr = FX.Game.actions(s).find((a) => a.type === 'travel' && a.to === gl.to);
  assert(tr && !tr.ok, '练炁弟子也能越过万里荒原');
  // 2. 结丹：定下金丹品第，品第进斗法
  p.realm = { major: 5, stage: 3 }; p.progress = FX.P.need(p); p.daoji = 2; p.yixiang = 2;
  s.player.inv.ningdan = 3;
  const xz = s.factions[p.factionId];
  p.locationId = xz.seatId;
  let got = false;
  for (let i = 0; i < 30 && !got; i++) {
    p.restUntil = 0; p.health = { state: 'healthy', days: 0 }; p.progress = FX.P.need(p); s.player.inv.ningdan = 3;
    const r = FX.CU.attempt(s, p, {});
    if (r.success) got = true;
    if (!FX.P.alive(p)) { p.status = 'alive'; p.deathYear = null; s.ended = null; }
  }
  assert(got && p.realm.major === 6 && p.danPin >= 1 && p.danPin <= 9, '结丹后没有金丹品第');
  assert(FX.P.powerBreakdown(s, p).factors.some((f) => /金丹/.test(f.label)), '金丹品第没进斗法');
  // 3. 金丹能越过荒原；第一次进中域记一笔
  p.locationId = gate.id;
  tr = FX.Game.actions(s).find((a) => a.type === 'travel' && a.to === gl.to);
  assert(tr && tr.ok, '金丹真人也过不去荒原');
  // 4. 玄真派金丹凭道脉符书改投玉宸派：不看运气，道功照记；掌门之位交出去
  const yc = big.find((f) => f.key === 'yuchen');
  xz.leaderId = p.id;
  s.player.merit = 500;
  p.locationId = yc.seatId;
  const tf = FX.Game.actions(s).find((a) => a.type === 'transfer');
  assert(tf && tf.ok, '玄真派金丹在玉宸派山门改投不了');
  FX.Game.act(s, tf);
  while (s.pending.length) choose(s);
  assert(p.factionId === yc.id && s.player.merit === 500, '改投后不在玉宸派或道功没了');
  assert(xz.leaderId && xz.leaderId !== p.id, '改投后玄真派掌门之位没交出去');
  // 5. 元神要「地」：玉宸派山门是灵窟，门人在此用得上六级灵机；金丹三重圆满就能冲
  p.realm = { major: 6, stage: 3 }; p.progress = FX.P.need(p); p.restUntil = 0; p.health = { state: 'healthy', days: 0 };
  assert(FX.CU.qiFor(s, p) === 6 && FX.CU.canAttempt(s, p).ok, '玉宸派门人在山门冲不了元神');
  const pit = Object.values(s.places).find((x) => x.name === '地渊');
  p.locationId = pit.id;
  assert(!FX.CU.canAttempt(s, p).ok, '在五级之地也能冲元神');
  // 散修的路：在六级福地开洞府
  const fudi = outer.find((x) => x.qi >= 6 && x.type === 'wild');
  p.locationId = fudi.id; s.player.stone = 500000;
  const df = FX.Game.actions(s).find((a) => a.type === 'dongfu');
  assert(df && df.ok && df.cost === CF.dongfu.cost[6], '六级福地开不了洞府');
  FX.Game.act(s, df);
  while (s.pending.length) choose(s);
  assert(FX.CU.qiFor(s, p) === 6 && FX.CU.canAttempt(s, p).ok, '福地洞府里冲不了元神');
  // 6. 元神在东海开洞天，在洞天里冲返虚
  p.realm = { major: 7, stage: CF.realms.maxStage[7] }; p.progress = FX.P.need(p);
  assert(!FX.CU.canAttempt(s, p).ok, '没有洞天也能冲返虚');
  const sea = outer.find((x) => x.type === 'sea');
  p.locationId = sea.id; s.player.stone = 500000;
  const dt = FX.Game.actions(s).find((a) => a.type === 'dongtian');
  assert(dt && dt.ok, '东海开不了洞天');
  FX.Game.act(s, dt);
  while (s.pending.length) choose(s);
  p.locationId = sea.id; p.health = { state: 'healthy', days: 0 }; p.restUntil = 0; p.progress = FX.P.need(p);
  assert(s.player.dongtian === sea.id && FX.CU.qiFor(s, p) === CF.dongtian.qi && FX.CU.canAttempt(s, p).ok, '有了洞天也冲不了返虚');
  // 7. 天魔潮：紫府以上应敕令镇守，守在阵中一定有符钱
  const m = FX.Game.newGame({ origin: 'sect', seed: 'tianmo' });
  const mp = FX.P.player(m);
  mp.realm = { major: 4, stage: 1 };
  mp.locationId = Object.values(m.places).find((x) => x.name === '地渊').id;
  m.saga.tianmo.open = { from: m.year, until: m.year + 1 };
  const ta = FX.Game.actions(m).find((a) => a.type === 'tianmo');
  assert(ta && ta.ok, '天魔潮时去不了地渊镇守');
  FX.Game.act(m, ta);
  let guarded = false;
  while (m.pending.length && !m.ended) { const v = FX.Game.pendingEvents(m)[0]; if (v.defId === 'TIANMO') { const st0 = m.player.stone; FX.Game.choose(m, v.id, 'guard'); guarded = m.player.stone > st0; } else choose(m); }
  assert(guarded || m.ended, '守在阵中没有符钱');
  // 8. v5 存档迁移：补出腹地与大派，已结丹的人补定品第
  const g5 = FX.Game.newGame({ origin: 'sect', seed: 'mig6' });
  const t5 = JSON.parse(FX.Save.serialize(g5));
  const st = t5.state;
  const outerIds = new Set(Object.values(st.places).filter((x) => x.outer).map((x) => x.id));
  const bigIds = new Set(Object.values(st.factions).filter((f) => f.tier === 3).map((f) => f.id));
  for (const id of outerIds) delete st.places[id];
  for (const pl of Object.values(st.places)) { delete pl.region; pl.links = pl.links.filter((l) => !outerIds.has(l.to)); }
  for (const id of bigIds) delete st.factions[id];
  for (const id of Object.keys(st.people)) if (bigIds.has(st.people[id].factionId) || outerIds.has(st.people[id].locationId)) delete st.people[id];
  st.relations = st.relations.filter((r) => st.people[r.a] && st.people[r.b]);
  for (const id of Object.keys(st.markets)) if (outerIds.has(id)) delete st.markets[id];
  for (const q of Object.values(st.people)) { delete q.danPin; delete q.daoId; }
  const me5 = st.people[st.player.id]; me5.realm = { major: 6, stage: 1 }; me5.progress = 0;
  delete st.player.dongtian; delete st.saga.tianmo;
  st.schemaVersion = 5; t5.schemaVersion = 5; delete t5.checksum;
  const mg = FX.Save.deserialize(t5);
  assert(mg.ok, 'v5 存档迁移失败：' + mg.error);
  const ms = mg.state;
  assert(Object.values(ms.places).filter((x) => x.outer).length === CF.world.outer.places.length && Object.values(ms.factions).filter((f) => f.tier === 3).length === 3, '迁移后没有腹地与大派');
  assert(ms.people[ms.player.id].danPin >= 1 && ms.saga.tianmo && ms.saga.tianmo.next > ms.year && ms.player.dongtian === null, '迁移后金丹品第、天魔潮或洞天字段缺了');
  // 迁移后照常推进十年
  for (let y = 0; y < 10 && !ms.ended; y++) { FX.Sim.passDays(ms, CF.daysPerYear, 'rest'); while (ms.pending.length && !ms.ended) choose(ms); }
  return `腹地 ${outer.length} 处、大派 3 家（元神掌门）；关口要金丹；结丹定为${FX.P.danPinName(p) || '某品'}；道脉改投、元神之地（大派灵窟、福地洞府）、东海洞天、天魔潮、v5 迁移均正常`;
});

check('16', '按原著：东弥州方位、原著人物、金丹三重、先天金汞、元神法相、正阳丹砂、捐输、劫修分寸、丹元大会、流火宏化洞天、颜熙真君、纯阳三灾与合道、v6 存档迁移', () => {
  const CF = FX.CONFIG;
  const choose = (s) => { const v = FX.Game.pendingEvents(s)[0]; return FX.Game.choose(s, v.id, v.options.find((o) => o.available).id); };
  const heal = (p) => { p.restUntil = 0; p.health = { state: 'healthy', days: 0 }; if (!FX.P.alive(p)) { p.status = 'alive'; p.deathYear = null; p.deathCause = null; } };
  const s = FX.Game.newGame({ origin: 'sect', seed: 'yuanzhu' });
  const p = FX.P.player(s);
  const byName = (n) => Object.values(s.places).find((x) => x.name === n);
  const fac = (k) => Object.values(s.factions).find((f) => f.key === k);
  // 1. 方位照原著：玉宸派在东域宵明大泽，赤明派在北域鹿台山，怙照宗在西域
  assert(s.places[fac('yuchen').seatId].name === '宵明大泽' && byName('宵明大泽').region === '东域', '玉宸派不在东域宵明大泽');
  assert(s.places[fac('chiming').seatId].name === '鹿台山' && byName('鹿台山').region === '北域', '赤明派不在北域鹿台山');
  assert(s.places[fac('huzhao').seatId].region === '西域' && byName('鹤鸣山').region === '北域', '怙照宗或鹤鸣山方位不对');
  p.realm = { major: 6, stage: 1 };
  const gate = Object.values(s.places).find((x) => x.region === '南域' && x.links.some((l) => l.minMajor));
  for (const pl of Object.values(s.places).filter((x) => x.outer)) assert(FX.World.route(s, gate.id, pl.id, p), '金丹到不了' + pl.name);
  // 2. 原著人物：怀悟洞主掌金谷墟市（洞玄三重），苗南老祖掌苗南峰（筑基三重），君尧在玉宸派（元神），颜熙在东海（返虚）
  const nb = (k) => Object.values(s.people).find((q) => q.notable === k);
  assert(nb('huaiwu') && fac('jingu').leaderId === nb('huaiwu').id && nb('huaiwu').realm.major === 5 && nb('huaiwu').realm.stage === 3, '怀悟洞主不对');
  assert(nb('miaonan') && fac('miaonan').leaderId === nb('miaonan').id && nb('miaonan').realm.major === 3, '苗南老祖不对');
  assert(nb('junyao') && nb('junyao').factionId === fac('yuchen').id && nb('junyao').realm.major === 7 && nb('junyao').xiang === 4, '君尧不对');
  assert(nb('yanxi') && s.places[nb('yanxi').locationId].key === 'donghai' && nb('yanxi').realm.major === 8 && nb('yanxi').bio, '颜熙不对');
  // 3. 洞玄二重冲三重定下先天金汞
  p.realm = { major: 5, stage: 2 }; p.daoji = 2; p.yixiang = 3; p.jinhong = 0;
  for (let i = 0; i < 40 && p.realm.stage === 2; i++) { heal(p); p.progress = FX.P.need(p); FX.CU.attempt(s, p, {}); }
  assert(p.realm.stage === 3 && p.jinhong >= 1 && FX.P.jinhongName(p), '洞玄三重没定先天金汞');
  // 4. 金丹三重：身根成象、渐法九还、神中有形；正阳丹砂推丹力
  p.realm = { major: 6, stage: 1 }; p.progress = 0; p.danPin = 5;
  s.player.inv.zhengyang = 2;
  const use = FX.Game.actions(s).find((a) => a.type === 'use' && a.item === 'zhengyang');
  assert(use && use.ok, '金丹服不了正阳丹砂');
  FX.Game.act(s, use);
  assert(p.progress === CF.zhengyangGain, '正阳丹砂没推丹力');
  for (let i = 0; i < 80 && p.realm.major === 6 && p.realm.stage < 3; i++) { heal(p); p.progress = FX.P.need(p); FX.CU.attempt(s, p, {}); }
  assert(p.realm.stage === 3 && /神中有形/.test(FX.P.realmTitle(p)) && FX.CU.gateKind(p) === 'yuanshen', '金丹三重不对：' + FX.P.realmTitle(p));
  // 5. 元神定法相
  p.locationId = fac('yuchen').seatId; p.factionId = fac('yuchen').id;
  for (let i = 0; i < 60 && p.realm.major === 6; i++) { heal(p); p.progress = FX.P.need(p); FX.CU.attempt(s, p, {}); }
  assert(p.realm.major === 7 && p.xiang >= 1 && /法相/.test(FX.P.realmTitle(p)), '元神没定法相');
  const use2 = FX.Game.actions(s).find((a) => a.type === 'use' && a.item === 'zhengyang');
  assert(use2 && !use2.ok, '元神也能服正阳丹砂');
  // 6. 捐输：八派六宗门人拿符钱折道功
  heal(p); s.player.stone = 300000; s.player.merit = 0;
  const dn = FX.Game.actions(s).find((a) => a.type === 'donate');
  assert(dn && dn.ok, '大派门人捐输不了');
  FX.Game.act(s, Object.assign({}, dn, { qty: 10 }));
  assert(s.player.merit === CF.house.donate.merit * 10 && s.player.stone === 300000 - CF.house.donate.stone * 10, '捐输折算不对');
  // 7. 劫修的分寸：元神回到南域，没人敢来劫；寻仇的人打输了就死
  const south = Object.values(s.places).find((x) => x.region === '南域' && x.type === 'wild');
  let robbed = 0;
  for (let i = 0; i < 30; i++) if (FX.Act.pickRobber(s, south)) robbed++;
  assert(robbed === 0, '有劫修敢劫元神真人：' + robbed);
  // 8. 丹元大会：金丹门人在山门由本门遣送；打满四场夺魁得胥都大丹
  const d = FX.Game.newGame({ origin: 'sect', seed: 'danyuan' });
  const dp = FX.P.player(d);
  const dyc = Object.values(d.factions).find((f) => f.key === 'yuchen');
  dp.realm = { major: 6, stage: 2 }; dp.factionId = dyc.id; dp.locationId = dyc.seatId; dp.aptitude = 95; dp.daoji = 3; dp.danPin = 1;
  d.player.inv.fuqi3 = 1; d.player.manuals.push('dao_high');
  d.saga.danyuan.open = { from: d.year, until: d.year };
  const da = FX.Game.actions(d).find((a) => a.type === 'danyuan');
  assert(da && da.ok, '金丹门人去不了丹元大会');
  FX.Game.act(d, da);
  let rounds = 0;
  while (d.pending.length && !d.ended) { const v = FX.Game.pendingEvents(d)[0]; if (v.defId === 'DANYUAN') { rounds++; dp.health = { state: 'healthy', days: 0 }; } FX.Game.choose(d, v.id, v.defId === 'DANYUAN' ? 'fight' : v.options.find((o) => o.available).id); }
  assert(rounds >= 1 && d.history.some((e) => e.key === 'danyuan'), '丹元大会没排名次');
  // 9. 流火宏化洞天：玉宸门人到鹤鸣山入内；外层稳得修为与符钱
  heal(p); p.locationId = byName('鹤鸣山').id;
  s.saga.liuhuo.open = { from: s.year, until: s.year };
  const lh = FX.Game.actions(s).find((a) => a.type === 'liuhuo');
  assert(lh && lh.ok, '玉宸门人进不了流火宏化洞天');
  p.progress = 0; const st0 = s.player.stone;
  FX.Game.act(s, lh);
  let outerOk = false;
  while (s.pending.length && !s.ended) { const v = FX.Game.pendingEvents(s)[0]; if (v.defId === 'LIUHUO') { FX.Game.choose(s, v.id, 'outer'); outerOk = p.progress > 0 && s.player.stone > st0; } else choose(s); }
  assert(outerOk, '流火宏化洞天外层没有收获');
  // 10. 颜熙真君在东海，元神可去拜谒
  heal(p); p.locationId = nb('yanxi').locationId;
  const yx = FX.Game.actions(s).find((a) => a.type === 'yanxi');
  assert(yx && yx.ok, '元神在东海见不到拜谒颜熙真君的选项');
  // 11. 返虚以后：在自家洞天里渡风、火、雷三灾，再九难合道成道君
  s.player.stone = 500000; s.player.inv.dongtianji = 1;
  const dt = FX.Game.actions(s).find((a) => a.type === 'dongtian');
  assert(dt && dt.ok && dt.cost === CF.dongtian.cost / 2, '洞天残基没省符钱');
  FX.Game.act(s, dt);
  while (s.pending.length && !s.ended) choose(s);
  heal(p); p.locationId = s.player.dongtian;
  // 元神十二重障关破尽（障关的事见第 18 项），从元神功满往上冲
  p.realm = { major: 7, stage: CF.realms.maxStage[7] };
  const path = [];
  for (let i = 0; i < 400 && p.realm.major < 10; i++) {
    heal(p); p.locationId = s.player.dongtian; p.progress = FX.P.need(p);
    const k = FX.CU.gateKind(p);
    const r = FX.CU.attempt(s, p, {});
    assert(r.ok, '冲关被拒：' + k + ' ' + r.error);
    if (r.success) path.push(k);
  }
  const want = ['fanxu'].concat(Array(12).fill('mizhang'), ['chunyang', 'sanzai', 'sanzai', 'hedao']).join(',');
  assert(p.realm.major === 10 && FX.P.title(p) === '道君' && path.join(',') === want, '没能一路走到合道：' + path.join(','));
  assert(FX.P.lifespanTotal(p) >= 100000, '道君寿元不对');
  p.locationId = south.id;
  const away = Object.values(s.places).find((x) => x.id !== s.player.dongtian);
  // 12. v6 存档迁移：腹地换成原著方位，原著人物入世，金丹修为摊到三重
  const g6 = FX.Game.newGame({ origin: 'sect', seed: 'mig7' });
  const t6 = JSON.parse(FX.Save.serialize(g6));
  const st = t6.state;
  const old = { zhongyu: ['中域坊市', '中域'], yuchen: ['玉宸派', '中域'], chiming: ['赤明派', '东域'], huzhao: ['怙照宗', '北域'], jiuwei: ['九危山', '西域'], fudi: ['东域福地', '东域'], donghai: ['东海', '东海'] };
  for (const pl of Object.values(st.places)) if (pl.outer) { if (old[pl.key]) { pl.name = old[pl.key][0]; pl.region = old[pl.key][1]; delete pl.key; delete pl.blurb; } }
  for (const id of Object.keys(st.people)) if (st.people[id].notable) delete st.people[id];
  st.relations = st.relations.filter((r) => st.people[r.a] && st.people[r.b]);
  for (const q of Object.values(st.people)) { delete q.jinhong; delete q.xiang; delete q.notable; delete q.bio; }
  const jd = Object.values(st.people).find((q) => q.realm.major === 6 && q.id !== st.player.id);
  jd.realm = { major: 6, stage: 1 }; jd.progress = 25000;
  delete st.saga.danyuan; delete st.saga.liuhuo;
  st.schemaVersion = 6; t6.schemaVersion = 6; delete t6.checksum;
  const mg = FX.Save.deserialize(t6);
  assert(mg.ok, 'v6 存档迁移失败：' + mg.error);
  const ms = mg.state;
  assert(Object.values(ms.places).some((x) => x.name === '宵明大泽' && x.region === '东域') && !Object.values(ms.places).some((x) => x.name === '东域福地'), '迁移后方位没换');
  assert(['huaiwu', 'miaonan', 'junyao', 'yanxi'].every((k) => Object.values(ms.people).some((q) => q.notable === k)), '迁移后原著人物没入世');
  const jd2 = ms.people[jd.id];
  assert(jd2.realm.stage === 2 && jd2.jinhong >= 1, '迁移后金丹修为没摊到三重：' + JSON.stringify(jd2.realm));
  assert(ms.saga.danyuan && ms.saga.liuhuo, '迁移后丹元大会、流火宏化洞天没排期');
  for (let y = 0; y < 10 && !ms.ended; y++) { FX.Sim.passDays(ms, CF.daysPerYear, 'rest'); while (ms.pending.length && !ms.ended) choose(ms); }
  return `宵明大泽（东域）、鹿台山（北域）、怙照宗（西域）、鹤鸣山均照原著；怀悟洞主、苗南老祖、君尧、颜熙入世；先天金汞、金丹三重、元神法相、正阳丹砂、捐输、劫修分寸、丹元大会（打了 ${rounds} 场）、流火宏化洞天、拜谒颜熙均正常；返虚十二迷障→纯阳三灾→合道一路走通；v6 迁移正常`;
});

check('17', '法器与道术、神通：炼形与禁制、器灵炼化、宝材重铸、道术参习进境、神通门槛、遁法赶路、NPC 随身法器、缴获、v7 存档迁移', () => {
  const CF = FX.CONFIG, A = FX.Ars;
  const heal = (p) => { p.restUntil = 0; p.health = { state: 'healthy', days: 0 }; };
  const choose = (s) => { const v = FX.Game.pendingEvents(s)[0]; return FX.Game.choose(s, v.id, v.options.find((o) => o.available).id); };
  const settle = (s) => { while (s.pending.length && !s.ended) choose(s); heal(FX.P.player(s)); };
  const act = (s, a) => { settle(s); const r = FX.Game.act(s, a); assert(r.ok, '行动被拒：' + JSON.stringify(a) + ' ' + r.error); settle(s); return r; };
  const find = (s, pred) => { settle(s); return FX.Game.actions(s).find(pred); };
  // 长时间的行动可能被路遇打断：处置完再接着做，直到条件满足
  const until = (s, pred, done, msg) => { for (let i = 0; i < 8 && !done(); i++) { const a = find(s, pred); assert(a && a.ok, msg + '：' + (a ? a.reason : '没有这项行动')); act(s, a); } assert(done(), msg); };
  // 1. 每门道术、每件法器都有稳定来路：下乘、中乘道术坊市常备，上乘以上在宗门长老房；法器在坊市常备或库藏
  const staples = new Set(); for (const k in CF.market) if (CF.market[k].staples) for (const x of CF.market[k].staples) staples.add(x.item);
  const libs = new Set(); for (const d of CF.factionDefs.concat(Object.values(CF.factionTypes))) for (const e of d.library || []) libs.add(e.tech);
  const store = new Set(CF.house.store.map((e) => e.item));
  const arts = Object.keys(CF.techniques).filter((k) => CF.techniques[k].kind === 'shu');
  for (const k of arts) assert(staples.has('tech:' + k) || libs.has(k), '道术没有稳定来路：' + CF.techniques[k].name);
  for (const k of Object.keys(CF.items).filter((x) => CF.items[x].gear)) assert(staples.has(k) || store.has(k), '法器没有稳定来路：' + CF.items[k].name);
  for (const k of ['miluo', 'ganyin', 'lingtian']) assert(staples.has(k) || store.has(k), '宝材没有稳定来路：' + k);

  // 2. 符器到手收进法器一栏；炼形、祭炼、宝材重铸，一路祭成法器
  const s = FX.Game.newGame({ origin: 'sect', seed: 'fabao' });
  const p = FX.P.player(s);
  s.player.inv.fuqi1 = 1; s.player.stone = 3000000;
  act(s, find(s, (a) => a.type === 'cultivate' && a.days === 30));
  assert(!s.player.inv.fuqi1 && p.gear.length === 1 && p.gear[0].grade === 1 && p.gear[0].jin === 10, '符器没收进法器一栏');
  const g = p.gear[0];
  const pow0 = FX.P.powerBreakdown(s, p).factors.find((f) => /飞剑/.test(f.label));
  assert(pow0 && pow0.value === 1.25, '下品飞剑战力倍数不对');
  const lx = () => find(s, (a) => a.type === 'lianxing' && a.gid === g.id);
  assert(!lx().ok && /筑基/.test(lx().reason), '练炁也能炼形中品');
  p.realm = { major: 3, stage: 1 }; heal(p);
  until(s, (a) => a.type === 'lianxing' && a.gid === g.id, () => g.grade === 2, '炼形为中品不对');
  until(s, (a) => a.type === 'jilian' && a.gid === g.id && a.n === 10 * g.grade - g.jin, () => g.jin === 20, '祭炼禁制不对');
  p.realm = { major: 4, stage: 1 }; heal(p);
  assert(!lx().ok && /材质/.test(lx().reason), '材质到头还能炼形');
  s.player.inv.miluo = 1; act(s, find(s, (a) => a.type === 'chongzhu' && a.gid === g.id && a.item === 'miluo'));
  assert(g.cap === 3 && !s.player.inv.miluo, '熔弥罗铁没抬高材质');
  until(s, (a) => a.type === 'lianxing' && a.gid === g.id, () => g.grade === 3, '没炼形为上品');
  until(s, (a) => a.type === 'jilian' && a.gid === g.id && a.n === 10 * g.grade - g.jin, () => g.jin === 30, '没祭成上品符器');
  s.player.inv.miluo = 1; act(s, find(s, (a) => a.type === 'chongzhu' && a.gid === g.id));
  assert(!lx().ok && /金丹/.test(lx().reason), '紫府也能祭成法器');
  p.realm = { major: 6, stage: 1 }; heal(p);
  until(s, (a) => a.type === 'lianxing' && a.gid === g.id, () => g.grade === 4, '金丹以本命精血没祭成法器');
  assert(g.ling === 100, '自家祭成的法器器灵不认主');
  const atk4 = A.gearVal(g, 'atk');
  // 3. 外来法器器灵不认主，要炼化
  s.player.inv.yujing = 1; act(s, find(s, (a) => a.type === 'cultivate' && a.days === 30));
  const yj = p.gear.find((x) => x.name === '玉景飞宫');
  assert(yj && yj.grade === 4 && yj.ling === 10, '玉景飞宫没到手');
  const fl0 = A.gearVal(yj, 'dunFlee');
  act(s, find(s, (a) => a.type === 'lianhua' && a.gid === yj.id && a.days === 360));
  assert(yj.ling > 10 && A.gearVal(yj, 'dunFlee') > fl0, '炼化器灵没长进');
  // 4. 遁行法器让赶路省时日、逃遁更容易
  const s2 = FX.Game.newGame({ origin: 'loose', seed: 'dun' });
  const p2 = FX.P.player(s2);
  const tr = (st) => FX.Game.actions(st).filter((a) => a.type === 'travel').reduce((x, a) => x + a.days, 0);
  const d0 = tr(s2), f0 = FX.Combat.fleeChance(s2, p2, 100).chance;
  p2.gear.push(A.make(s2, CF.items.suo3.gear));
  assert(tr(s2) < d0 && FX.Combat.fleeChance(s2, p2, 100).chance > f0, '飞梭没省赶路时日或没加逃遁');
  // 金丹以下驱策法器费力不讨好，纯阳以下掌控不了道器
  const fq = A.make(s2, { name: '飞剑', slot: 'atk', grade: 4, jin: 40, cap: 4 }), dq = A.make(s2, { name: '飞剑', slot: 'atk', grade: 7, jin: 70, cap: 7 });
  assert(A.useF(p2, fq) < 1 && A.useF(Object.assign({}, p2, { realm: { major: 6, stage: 1 } }), fq) === 1 && A.useF(Object.assign({}, p2, { realm: { major: 8, stage: 1 } }), dq) < 1, '境界不够也使得顺法器、道器');
  // 5. 护身：落败时重伤少些
  p2.gear.push(A.make(s2, CF.items.fayi3.gear));
  assert(A.hurtCut(s2, p2) > 0.2, '法衣没减伤');
  // 6. 道术参习：入门 → 小成 → 大成，进境越高威能越大
  s2.player.manuals.push('gengjin');
  const pa = () => find(s2, (a) => a.type === 'practice' && a.tech === 'gengjin' && a.days === 90);
  const powA = FX.P.power(s2, p2);
  act(s2, pa()); heal(p2);
  const lv1 = A.level(p2, 'gengjin');
  assert(lv1 >= 1 && FX.P.power(s2, p2) > powA, '参习下乘道术没长进');
  for (let i = 0; i < 6 && A.level(p2, 'gengjin') < 4; i++) { heal(p2); const a = pa(); if (a && a.ok) act(s2, a); }
  assert(A.level(p2, 'gengjin') > lv1, '参习不见进境');
  // 7. 上乘道术要引子；辅修道术加修炼、冲关
  s2.player.manuals.push('jiguang'); p2.realm = { major: 2, stage: 1 };
  const jg = find(s2, (a) => a.type === 'practice' && a.tech === 'jiguang');
  assert(jg && !jg.ok && /干银星矿/.test(jg.reason), '极光大遁不要引子');
  p2.arts.sishan = CF.arts.xp[3][3];
  p2.realm = { major: 3, stage: 3 }; p2.progress = FX.P.need(p2);
  const ch = FX.CU.chance(s2, p2);
  assert(ch.parts.some((x) => /四山斗决/.test(x.label) && x.value === 12), '四山斗决没加冲紫府的把握');
  // 8. 神通要金丹法力：洞玄使不出；大派神通看金丹品第、要先修上卷
  p2.arts.beidou = CF.arts.xp[4][3]; p2.realm = { major: 5, stage: 1 };
  assert(A.artVal(p2, 'beidou', 'atk') === 0, '洞玄也使得出神通');
  p2.realm = { major: 6, stage: 1 };
  assert(A.artVal(p2, 'beidou', 'atk') > 0.8, '金丹使不出神通');
  const s3 = FX.Game.newGame({ origin: 'sect', seed: 'yuchen-lib' });
  const p3 = FX.P.player(s3);
  const yc = Object.values(s3.factions).find((f) => f.key === 'yuchen');
  p3.realm = { major: 6, stage: 1 }; p3.danPin = 6; p3.daoji = 3; p3.factionId = yc.id; p3.locationId = yc.seatId; s3.player.merit = 100000;
  const lib = (k) => find(s3, (a) => a.type === 'sect_learn' && a.tech === k);
  assert(lib('beidou') && !lib('beidou').ok && /品/.test(lib('beidou').reason), '六品金丹也能换北斗罡雷');
  p3.danPin = 3;
  assert(lib('zqsl') && !lib('zqsl').ok && /上卷/.test(lib('zqsl').reason), '没修上卷也能换紫清神雷');
  act(s3, lib('zqsl_up'));
  p3.arts.zqsl_up = CF.arts.xp[3][2]; // 上卷修到中成
  act(s3, lib('zqsl'));
  assert(A.level(p3, 'zqsl') === 3 && A.artVal(p3, 'zqsl', 'atk') > A.artVal(p3, 'zqsl_up', 'atk'), '紫清神雷两卷合一没接上上卷的进境');
  assert(lib('taiyi') && !lib('taiyi').ok, '金丹也能换太乙神雷');
  // 9. NPC 也有随身法器、道术；原著人物照原著
  const nb = (k) => Object.values(s3.people).find((q) => q.notable === k);
  assert(nb('junyao').gear.some((x) => x.name === '元都斩魔剑' && x.grade === 6) && A.level(nb('junyao'), 'zqsl') === 4, '君尧没有元都斩魔剑、紫清神雷');
  assert(nb('miaonan').gear.some((x) => x.name === '五方升阳旗' && x.grade === 5), '苗南老祖没有五方升阳旗');
  const jd = FX.P.living(s3).filter((q) => q.realm.major === 6 && q.id !== p3.id);
  assert(jd.length && jd.filter((q) => (A.best(q, 'atk') || {}).grade >= 3).length / jd.length >= 0.6, '金丹 NPC 多半没有上品符器以上的法器');
  // 10. 打退劫修，有机会夺下其法器（外来法器器灵不认主）
  const robber = FX.World.spawnNpc(s3, { realm: { major: 6, stage: 1 }, locationId: p3.locationId });
  robber.gear = [{ id: 'n0', name: '飞剑', slot: 'atk', grade: 4, jin: 35, cap: 4, ling: 100 }];
  const keep = CF.gear.lootChance; CF.gear.lootChance = 1;
  const got = A.loot(s3, robber); CF.gear.lootChance = keep;
  const lg = p3.gear[p3.gear.length - 1];
  assert(got && !robber.gear.length && lg.grade === 4 && lg.ling === 0, '没夺下劫修的法器');
  // 11. v7 存档迁移：旧符器收进法器一栏，NPC 配上法器、道术
  const g7 = FX.Game.newGame({ origin: 'sect', seed: 'mig8' });
  const t7 = JSON.parse(FX.Save.serialize(g7));
  for (const q of Object.values(t7.state.people)) { delete q.gear; delete q.arts; }
  delete t7.state.player.gearSeq;
  t7.state.player.inv.fuqi3 = 1;
  t7.state.schemaVersion = 7; t7.schemaVersion = 7; delete t7.checksum;
  const mg = FX.Save.deserialize(t7);
  assert(mg.ok, 'v7 存档迁移失败：' + mg.error);
  const ms = mg.state, mp = FX.P.player(ms);
  assert(mp.gear.length === 1 && mp.gear[0].grade === 3 && !ms.player.inv.fuqi3, '迁移后旧符器没收进法器一栏');
  assert(Object.values(ms.people).find((q) => q.notable === 'junyao').gear.some((x) => x.name === '元都斩魔剑'), '迁移后君尧没有元都斩魔剑');
  assert(FX.P.living(ms).filter((q) => q.realm.major >= 4).every((q) => Array.isArray(q.gear) && q.arts), '迁移后 NPC 没配法器、道术');
  for (let y = 0; y < 5 && !ms.ended; y++) FX.Sim.passDays(ms, CF.daysPerYear, 'rest');
  return `${arts.length} 门道术神通、${Object.keys(CF.items).filter((x) => CF.items[x].gear).length} 种符器法器都有稳定来路；飞剑从下品符器一路炼形、祭炼、熔弥罗铁重铸到下品法器（战力 ×${Math.round(atk4 * 100) / 100}）；玉景飞宫炼化器灵；飞梭省赶路、法衣减伤；庚金剑气术参习到${A.levelName(A.level(p2, 'gengjin'))}；极光大遁要引子；四山斗决助冲紫府；神通要金丹、看品第、两卷合一；君尧、苗南老祖的法器照原著；夺下劫修法器；v7 迁移正常`;
});

check('18', '按全本细分后期：元神十二重障关、大洞精玉、返虚三途（十二迷障、九等轮转、玄中三限）与失道之祸、天谷、合道九难与大冶、v8 存档迁移', () => {
  const CF = FX.CONFIG, B = CF.breakthrough, CU = FX.CU, P = FX.P;
  const choose = (s) => { const v = FX.Game.pendingEvents(s)[0]; return FX.Game.choose(s, v.id, v.options.find((o) => o.available).id); };
  const heal = (p) => { p.restUntil = 0; p.health = { state: 'healthy', days: 0 }; };
  const s = FX.Game.newGame({ origin: 'sect', seed: 'quanben' });
  const p = P.player(s);
  const fac = (k) => Object.values(s.factions).find((f) => f.key === k);
  const yc = fac('yuchen');
  p.factionId = yc.id; p.locationId = yc.seatId; p.aptitude = 80; p.daoji = 3; p.yixiang = 3; p.jinhong = 3; p.danPin = 3; p.xiang = 3;
  // 1. 成就元神：近九成九只破开第一重障关，天骄能连破两重
  p.realm = { major: 6, stage: 3 }; p.progress = P.need(p); heal(p);
  const keep2 = B.twoGates; B.twoGates = { 1: 1, 2: 1, 3: 1, 4: 1 };
  for (let i = 0; i < 50 && p.realm.major === 6; i++) { heal(p); p.progress = P.need(p); CU.attempt(s, p); }
  B.twoGates = keep2;
  assert(p.realm.major === 7 && p.realm.stage === 2, '成就元神时没能连破两重障关：' + JSON.stringify(p.realm));
  // 2. 元神障关：只看感悟，没破开也无祸患；越往后越难；每破一重法力、命寿都涨
  p.realm = { major: 7, stage: 1 }; p.progress = P.need(p); heal(p);
  const c1 = CU.chance(s, p), life1 = P.lifespanTotal(p), pow1 = P.power(s, p);
  assert(c1.kind === 'zhangguan' && c1.death === 0 && /第二重障关/.test(c1.target), '元神一重的关不是障关或有身死之险：' + c1.kind + ' ' + c1.death + ' ' + c1.target);
  let fails = 0, hurt = 0;
  for (let i = 0; i < 400 && p.realm.major === 7 && p.realm.stage < 12; i++) {
    heal(p); p.progress = P.need(p);
    const r = CU.attempt(s, p);
    assert(r.ok && !r.died, '障关冲关出错或死了');
    if (!r.success) { fails++; if (p.health.state !== 'healthy') hurt++; assert(p.progress >= P.need(p) * 0.79, '障关失败丢的感悟太多'); }
  }
  assert(p.realm.stage === 12 && P.realmTitle(p).includes('元神功满') && CU.gateKind(p) === 'fanxu', '元神十二重障关没破尽：' + P.realmTitle(p));
  assert(hurt === 0, '障关失败受了伤');
  p.realm = { major: 7, stage: 11 };
  const c11 = CU.chance(s, p).parts[0].value;
  p.realm = { major: 7, stage: 12 };
  assert(c11 < c1.parts[0].value && P.lifespanTotal(p) > life1 && P.power(s, p) > pow1, '后面的障关没更难或命寿、法力没涨');
  // 3. 大洞精玉：玉宸库藏可换，元神服下修为 +本重所需三成
  const rd = FX.Game.actions(s).find((a) => a.type === 'redeem' && a.item === 'dadong');
  assert(rd, '八派六宗库藏里没有大洞精玉');
  p.realm = { major: 7, stage: 3 }; p.progress = 0; s.player.inv.dadong = 1;
  const use = FX.Game.actions(s).find((a) => a.type === 'use' && a.item === 'dadong');
  assert(use && use.ok, '元神服不了大洞精玉');
  FX.Game.act(s, use);
  assert(Math.abs(p.progress - Math.round(P.need(p) * CF.dadongFrac)) <= 1 && !s.player.inv.dadong, '大洞精玉药力不对：' + p.progress);
  // 4. 返虚关隘：三条道途；玄中三限要经义和上等以上法相
  s.player.stone = 500000; p.realm = { major: 7, stage: 12 };
  const sea = Object.values(s.places).find((x) => x.type === 'sea');
  p.locationId = sea.id;
  const dt = FX.Game.actions(s).find((a) => a.type === 'dongtian');
  FX.Game.act(s, dt);
  while (s.pending.length && !s.ended) choose(s);
  heal(p); p.locationId = s.player.dongtian; p.progress = P.need(p);
  const paths = () => FX.Game.actions(s).filter((a) => a.type === 'breakthrough');
  assert(paths().map((a) => a.path).join(',') === 'shier,jiudeng,sanxian', '冲返虚时没有三条道途可选');
  assert(!paths().find((a) => a.path === 'sanxian').ok, '没有经义也能选玄中三限');
  assert(CF.house.store.some((x) => x.item === 'xuanzhong'), '玄中三限经义没有来路');
  s.player.inv.xuanzhong = 1;
  assert(paths().find((a) => a.path === 'sanxian').ok, '有经义、上等法相却选不了玄中三限');
  // 九等轮转：九关，修为折七成五；没有劫关的几段修满自然接续
  const snap = JSON.stringify(s);
  const climb = (key) => {
    const g = JSON.parse(snap), q = P.player(g);
    let gates = 0, deaths = 0;
    const log = [];
    for (let i = 0; i < 600 && q.realm.major < 9; i++) {
      heal(q); if (!P.alive(q)) { q.status = 'alive'; deaths++; }
      q.locationId = g.player.dongtian;
      const k = CU.gateKind(q);
      if (!k) { CU.addProgress(g, q, P.need(q) - q.progress); continue; }
      q.progress = P.need(q);
      const r = CU.attempt(g, q, { path: key });
      assert(r.ok, '返虚冲关被拒：' + k + ' ' + r.error);
      if (r.success && k === 'mizhang') gates++;
      if (r.died) deaths++;
      log.push(k + q.realm.stage + (r.success ? '+' : '-') + (r.died ? 'D' : '') + (q.fanxuPath || ''));
    }
    return { g, q, gates, deaths, log: log.join(' ') };
  };
  const J = climb('jiudeng');
  assert(J.q.realm.major === 9 && J.q.fanxuPath === 'jiudeng' && J.gates === 9, '九等轮转不是九关：' + J.gates);
  const T = climb('sanxian');
  assert(T.q.realm.major === 9 && T.gates === 3 && P.title(T.q) === '御极子', '玄中三限不是三关或没称御极子：' + T.gates + ' ' + P.title(T.q));
  const S = climb('shier');
  assert(S.gates === 12, '十二迷障不是十二关：' + S.gates + ' ' + S.log);
  // 道途越险越省时日；纯阳三灾劫力削减
  const totalNeed = (key) => CF.realms.need[8].reduce((a, n) => a + Math.round(n * CF.realms.fanxuPaths[key].need), 0);
  assert(totalNeed('sanxian') < totalNeed('jiudeng') && totalNeed('jiudeng') < totalNeed('shier'), '道途关数少的没省时日');
  const zc = (Q) => { Q.q.realm = { major: 9, stage: 1 }; Q.q.progress = P.need(Q.q); return CU.chance(Q.g, Q.q); };
  const zS = zc(S), zJ = zc(J), zT = zc(T);
  assert(zJ.chance > zS.chance && zT.chance > zJ.chance && zT.death < zS.death, '九等轮转、玄中三限没削减纯阳劫力');
  // 5. 失道之祸：没有灵脉护身破不了障；关数越少一关越凶；天谷大减其祸
  const g2 = JSON.parse(snap), q2 = P.player(g2);
  q2.realm = { major: 8, stage: 1 }; q2.fanxuPath = 'shier'; q2.progress = P.need(q2); heal(q2);
  q2.locationId = Object.values(g2.places).find((x) => x.qi <= 3).id;
  assert(!CU.canAttempt(g2, q2).ok, '在三级之地也能破返虚迷障');
  q2.locationId = g2.player.dongtian;
  const dS = CU.chance(g2, q2).death;
  q2.fanxuPath = 'sanxian'; q2.realm.stage = 4; q2.progress = P.need(q2);
  const dT = CU.chance(g2, q2).death;
  assert(dT > dS * 2, '玄中三限每一关不比十二迷障凶');
  q2.fanxuPath = 'shier'; q2.realm.stage = 1; q2.progress = P.need(q2);
  q2.locationId = g2.factions[q2.factionId].seatId;
  const lingku = CU.chance(g2, q2);
  assert(CU.canAttempt(g2, q2).ok && lingku.death > dS, '玉宸门人在灵窟里破不了障，或灵窟不比洞天险');
  g2.player.inv.tiangu = 1;
  const tg = CU.chance(g2, q2);
  assert(tg.usesTiangu && tg.death < dS && tg.chance > lingku.chance, '天谷没护住法躯');
  for (let i = 0; i < 50 && g2.player.inv.tiangu; i++) { heal(q2); q2.progress = P.need(q2); CU.attempt(g2, q2); }
  assert(!g2.player.inv.tiangu, '在天谷破障没用掉天谷符诏');
  // 失败：走火入魔，修为丧失过半，重伤
  let mf = null;
  for (let i = 0; i < 200 && !mf; i++) {
    const g3 = JSON.parse(snap), q3 = P.player(g3);
    q3.realm = { major: 8, stage: 4 }; q3.fanxuPath = 'sanxian'; q3.progress = P.need(q3); heal(q3); q3.locationId = g3.player.dongtian;
    for (let j = 0; j <= i; j++) FX.RNG.next(g3.rng); // 每回换一个骰点
    const r = CU.attempt(g3, q3);
    if (!r.success) mf = { r, q3, need: P.need(q3) };
  }
  assert(mf && mf.q3.progress <= mf.need * 0.5 && (mf.r.died || mf.q3.health.state === 'heavy'), '破障失败没有走火入魔');
  // 6. 合道九难：道君再过九难，仙业自显，成大冶仙人
  const g4 = JSON.parse(snap), q4 = P.player(g4);
  q4.realm = { major: 10, stage: 1 }; CU.updateLifespan(g4, q4);
  assert(CU.gateKind(q4) === 'jiunan' && P.lifespanTotal(q4) < 1000000, '合道没有九难，或道君已寿与天齐');
  let nan = 0;
  for (let i = 0; i < 500 && q4.realm.major === 10; i++) {
    heal(q4); if (!P.alive(q4)) q4.status = 'alive';
    q4.locationId = g4.player.dongtian; q4.progress = P.need(q4);
    const r = CU.attempt(g4, q4);
    assert(r.ok, '九难冲关被拒：' + r.error);
    if (r.success) nan++;
  }
  assert(q4.realm.major === 11 && nan === 9 && P.title(q4) === '仙人' && P.lifespanTotal(q4) >= 1e8, '九难之后没成大冶仙人：' + nan + ' ' + P.realmTitle(q4));
  assert(!CU.gateKind(q4) && !CU.canAttempt(g4, q4).ok && FX.Game.actions(g4).length > 0, '大冶之后还有关，或没了行动');
  for (let y = 0; y < 3 && !g4.ended; y++) { FX.Sim.passDays(g4, CF.daysPerYear, 'rest'); while (g4.pending.length && !g4.ended) choose(g4); }
  // 7. v8 存档迁移：元神、返虚按比例摊进新小境界，原著人物摆回位置
  const g8 = FX.Game.newGame({ origin: 'sect', seed: 'mig9' });
  const t8 = JSON.parse(FX.Save.serialize(g8));
  const st = t8.state, sp = st.people[st.player.id];
  sp.realm = { major: 7, stage: 1 }; sp.progress = 100000; sp.peakRank = 23;
  const yx = Object.values(st.people).find((q) => q.notable === 'yanxi');
  yx.realm = { major: 8, stage: 1 }; yx.progress = 0;
  const jy = Object.values(st.people).find((q) => q.notable === 'junyao');
  jy.realm = { major: 7, stage: 1 }; jy.progress = 0;
  const fx = Object.values(st.people).find((q) => q.id !== sp.id && !q.notable && q.realm.major < 7);
  fx.realm = { major: 8, stage: 1 }; fx.progress = 200000;
  st.schemaVersion = 8; t8.schemaVersion = 8; delete t8.checksum;
  const mg = FX.Save.deserialize(t8);
  assert(mg.ok, 'v8 存档迁移失败：' + mg.error);
  const ms = mg.state, mp = ms.people[sp.id];
  assert(mp.realm.major === 7 && mp.realm.stage >= 9 && mp.realm.stage <= 11 && mp.progress <= P.need(mp), '迁移后元神修为没摊进障关：' + JSON.stringify(mp.realm));
  assert(mp.peakRank === P.realmRank(mp) && mp.lifespanMax > 3000, '迁移后最高境界、寿元没换算');
  assert(ms.people[yx.id].realm.stage === 10 && ms.people[jy.id].realm.stage === 7, '迁移后颜熙、君尧没摆回位置');
  const mfx = ms.people[fx.id];
  assert(mfx.realm.major === 8 && mfx.realm.stage >= 5 && mfx.fanxuPath === 'shier', '迁移后返虚修为没摊进迷障：' + JSON.stringify(mfx.realm));
  for (let y = 0; y < 5 && !ms.ended; y++) FX.Sim.passDays(ms, CF.daysPerYear, 'rest');
  return `成就元神可连破两重；障关 ${fails} 回没破开都无祸患；大洞精玉推修为三成；返虚三途：十二迷障 ${S.gates} 关、九等轮转 ${J.gates} 关、玄中三限 ${T.gates} 关（称御极子），纯阳风灾成功率 ${zS.chance}/${zJ.chance}/${zT.chance}%；无灵脉破不了障，天谷护身；九难过尽成大冶仙人；v8 迁移正常`;
});

check('19', '金丹十三味大药：外出寻药、代寻与库藏、内药温养凝成、湛然虚精炁要修法、十三味定品第上限、结丹耗外药、v9 存档迁移', () => {
  const CF = FX.CONFIG, CU = FX.CU, P = FX.P, Y = FX.Yao, D = CF.dayao;
  const choose = (s) => { const v = FX.Game.pendingEvents(s)[0]; return FX.Game.choose(s, v.id, v.options.find((o) => o.available).id); };
  const s = FX.Game.newGame({ origin: 'loose', seed: 'dayao' });
  const p = P.player(s);
  p.realm = { major: 5, stage: 3 }; p.progress = 0; p.aptitude = 70; p.daoji = 3; p.yixiang = 3; p.jinhong = 4;
  p.lifespanMax = 5000;
  // 1. 外出寻药：荒山、险地都能寻，有空手而回的时候
  const wild = Object.values(s.places).find((x) => x.type === 'wild' && !x.outer);
  p.locationId = wild.id;
  let found = 0, tries = 0;
  for (let i = 0; i < 40 && !s.ended; i++) {
    p.health = { state: 'healthy', days: 0 };
    const a = FX.Game.actions(s).find((x) => x.type === 'xunyao');
    assert(a && a.ok, '洞玄在荒山不能寻药');
    const tot = () => D.wai.reduce((n, k) => n + (s.player.inv[k] || 0), 0);
    const before = tot();
    FX.Game.act(s, a); tries++;
    while (s.pending.length && !s.ended) choose(s);
    if (tot() > before) found++;
  }
  assert(found > 0 && found < tries, '寻药不是有得有失：' + found + '/' + tries);
  assert(D.wai.every((k) => D.where.wild.includes(k) || D.where.danger.includes(k) || D.where.sea.includes(k)), '有外药哪儿都寻不到');
  // 2. 稳定来路：金谷墟市可托人代寻，二流以上宗门库藏可换
  const town = Object.values(s.places).find((x) => x.type === 'town');
  p.locationId = town.id;
  const orderable = FX.Act.orderable(s).map((o) => o.item);
  const inStock = (k) => s.markets[town.id] && s.markets[town.id].stock.some((x) => x.item === k && x.qty > 0);
  assert(D.wai.every((k) => orderable.includes(k) || inStock(k)), '金谷墟市托不到外药');
  assert(D.wai.concat(['zhanranfa']).every((k) => CF.house.store.some((x) => x.item === k && x.minTier === 2)), '二流以上宗门库藏换不到外药或湛然虚精炁修法');
  assert(CF.saga.jiaokao.upperGift[5] === 'zhanranfa', '校考上考不传湛然虚精炁修法');
  // 3. 内药：在洞玄三重温养，年数到了自然凝成；湛然虚精炁要先得修法
  const g = FX.Game.newGame({ origin: 'loose', seed: 'neiyao' });
  const q = P.player(g);
  q.realm = { major: 5, stage: 3 }; q.progress = 0; q.aptitude = 60; q.lifespanMax = 5000; q.flags.push('wujing');
  q.locationId = Object.values(g.places).find((x) => x.type === 'city').id;
  FX.Sim.passDays(g, CF.daysPerMonth, 'rest');
  assert((q.neiyao || []).includes('wugong'), '用过先天五行之精，五宫雷没自显');
  for (let y = 0; y < 16 && !g.ended; y++) { q.health = { state: 'healthy', days: 0 }; FX.Sim.passDays(g, CF.daysPerYear, 'rest'); while (g.pending.length && !g.ended) choose(g); }
  assert(['sanqi', 'yuding', 'shengren', 'zhengnian', 'shenfu'].every((k) => q.neiyao.includes(k)) && !q.neiyao.includes('zhanran'), '温养十六年内药没凝齐六味，或没修法也凝出了湛然虚精炁：' + q.neiyao.join(','));
  g.player.inv.zhanranfa = 1;
  for (let y = 0; y < 7 && !g.ended; y++) { q.health = { state: 'healthy', days: 0 }; FX.Sim.passDays(g, CF.daysPerYear, 'rest'); while (g.pending.length && !g.ended) choose(g); }
  assert(q.neiyao.includes('zhanran') && g.player.inv.zhanranfa === 1, '得了修法也凝不出湛然虚精炁，或修法被耗掉');
  assert(g.history.some((e) => e.key === 'neiyao'), '凝成内药没写进纪事');
  // 4. 品第：十三味不齐丹成不了上三品
  const top = { daoji: 3, yixiang: 3, jinhong: 4, aptitude: 100 };
  assert(CU.danPinFor(top, 2, 12) >= D.capWithout && CU.danPinFor(top, 2, 13) === 1, '十三味定品第上限不对');
  assert(CU.danPinFor(top, 0, 9) < CU.danPinFor(top, 0, 0) || CU.danPinFor(top, 0, 0) === D.capWithout, '大药多的品第没更好');
  // 5. 结丹：十三味齐了丹成上三品；外药耗掉、内药在身
  q.realm = { major: 5, stage: 3 }; q.progress = P.need(q); q.daoji = 3; q.yixiang = 3; q.jinhong = 4; q.aptitude = 90;
  for (const k of D.wai) g.player.inv[k] = 1;
  assert(Y.count(g, q) === 13, '十三味没算齐：' + Y.count(g, q));
  g.player.inv.ningdan = 5;
  q.locationId = Object.values(g.places).find((x) => !x.outer && x.qi >= CF.breakthrough.jindan.minQi && CU.qiFor(g, Object.assign({}, q, { locationId: x.id })) >= CF.breakthrough.jindan.minQi).id;
  const ch = CU.chance(g, q);
  assert(ch.parts.some((x) => /十三味大药/.test(x.label) && x.value > 0), '冲金丹没算上大药');
  const rq = CU.requirements(g, q).find((x) => /十三味/.test(x.label));
  assert(rq && rq.ok, '结丹清单里没有十三味大药');
  for (let i = 0; i < 30 && q.realm.major === 5 && !g.ended; i++) {
    q.restUntil = 0; q.health = { state: 'healthy', days: 0 }; q.progress = P.need(q);
    if (!g.player.inv.ningdan) g.player.inv.ningdan = 1;
    const r = CU.attempt(g, q);
    assert(r.ok, '结丹被拒：' + r.error);
    assert(Y.waiHave(g).length === 0, '结丹没耗掉外药');
    if (!r.success && !r.died) for (const k of D.wai) g.player.inv[k] = 1;
    if (r.died) { q.status = 'alive'; for (const k of D.wai) g.player.inv[k] = 1; }
  }
  assert(q.realm.major === 6 && q.danPin <= 3 && q.neiyao.length === 7, '十三味齐全没丹成上三品：' + q.danPin);
  // 6. v9 存档迁移：主角补内药记录、五宫雷标记
  const g9 = FX.Game.newGame({ origin: 'sect', seed: 'mig10' });
  const t9 = JSON.parse(FX.Save.serialize(g9));
  const sp = t9.state.people[t9.state.player.id];
  sp.realm = { major: 5, stage: 3 }; sp.fullDays = 1800; delete sp.neiyao; delete sp.dxDays; sp.flags = sp.flags.filter((x) => x !== 'wujing');
  t9.state.schemaVersion = 9; t9.schemaVersion = 9; delete t9.checksum;
  const mg = FX.Save.deserialize(t9);
  assert(mg.ok, 'v9 存档迁移失败：' + mg.error);
  const mp = P.player(mg.state);
  assert(Array.isArray(mp.neiyao) && mp.dxDays === 1800 && mp.flags.includes('wujing'), '迁移后内药记录没补上');
  FX.Sim.passDays(mg.state, CF.daysPerMonth, 'rest');
  assert(mp.neiyao.includes('wugong') && mp.neiyao.includes('sanqi'), '迁移后温养的日子没算上');
  return `荒山寻药 ${tries} 回得 ${found} 回；外药都能代寻、库藏换；温养十六年凝成六味内药，得修法后凝出湛然虚精炁；不齐十三味至多四品，齐了丹成${P.danPinName(q)}；结丹耗外药留内药；v9 迁移正常`;
});

check('20', '玉宸九殿四院：四院大比（十大弟子、魁首得道录殿符诏）、二十五正法（玄中经箓）、九殿职名、v10 存档迁移', () => {
  const CF = FX.CONFIG, P = FX.P;
  const s = FX.Game.newGame({ origin: 'sect', seed: 'dabi' });
  const p = P.player(s);
  const yc = Object.values(s.factions).find((f) => f.key === 'yuchen');
  p.factionId = yc.id; p.locationId = yc.seatId; p.realm = { major: 6, stage: 2 }; p.danPin = 2; p.daoji = 3; p.aptitude = 95;
  p.birthYear = s.year - 400; p.lifespanMax = 1500;
  s.player.inv.fuqi3 = 1; s.player.manuals.push('dao_high'); FX.Ars.sync(s);
  // 1. 排期、提示：玉宸年轻金丹门人才沾边
  assert(s.saga.dabi && FX.Saga.relevant(s, 'dabi'), '四院大比没排期或与玉宸金丹无关');
  assert(FX.Sect.postName(s, yc, p) === '白商院弟子', '玉宸金丹门人不在下院：' + FX.Sect.postName(s, yc, p));
  // 2. 赴会连斗，按胜场定十大弟子、魁首；打不过就认输
  const keep = CF.saga.dabi.foeBase; CF.saga.dabi.foeBase = 1; // 让对手弱些（斗法胜算至多九成五，不中就下回再来）
  let rounds = 0, tries = 0;
  for (; tries < 20 && !s.player.inv.dulu && !s.ended; tries++) {
    s.saga.dabi.open = { from: s.year, until: s.year }; s.saga.dabi.done = null;
    p.health = { state: 'healthy', days: 0 };
    const a = FX.Game.actions(s).find((x) => x.type === 'dabi');
    assert(a && a.ok, '玉宸金丹门人在宵明大泽去不了四院大比：' + (a && a.reason));
    FX.Game.act(s, a);
    rounds = 0;
    while (s.pending.length && !s.ended) { const v = FX.Game.pendingEvents(s)[0]; if (v.defId === 'DABI') { rounds++; p.health = { state: 'healthy', days: 0 }; } FX.Game.choose(s, v.id, v.defId === 'DABI' ? 'fight' : v.options.find((o) => o.available).id); }
  }
  CF.saga.dabi.foeBase = keep;
  assert(rounds === CF.saga.dabi.rounds && s.player.inv.dulu === 1 && p.flags.includes('shida'), '五场全胜没得道录殿符诏或没入十大弟子：' + rounds);
  assert(FX.Sect.postName(s, yc, p) === '上宗真传', '十大弟子没成上宗真传');
  assert(!FX.Game.actions(s).find((x) => x.type === 'dabi' && x.ok), '同一回大比能去两次');
  // 3. 道录殿符诏：从二十五正法里任取一门，不论道功、法相
  s.player.merit = 0;
  const zf = FX.Game.actions(s).filter((x) => x.type === 'sect_learn' && x.zf);
  assert(zf.length >= 4 && zf.every((x) => x.ok) && zf.some((x) => x.tech === 'xuanzhongjing'), '凭符诏取不了二十五正法');
  FX.Game.act(s, zf.find((x) => x.tech === 'xuanzhongjing'));
  assert(s.player.manuals.includes('xuanzhongjing') && !s.player.inv.dulu && P.daoOf(s, p).name === CF.techniques.xuanzhongjing.name, '取了玄中经箓没修上，或符诏没收回');
  assert(!FX.Game.actions(s).some((x) => x.type === 'sect_learn' && x.zf), '符诏收回了还能取正法');
  // 不靠大比也有来路：上宗弟子攒够道功可换
  assert(CF.factionDefs.find((d) => d.key === 'yuchen').library.filter((e) => e.zf).every((e) => e.merit > 0), '二十五正法没有道功来路');
  // 4. 九殿：元神以后入殿任长老（上等法相进周行殿）
  p.realm = { major: 7, stage: 1 }; p.xiang = 3;
  assert(FX.Sect.postName(s, yc, p) === '周行殿长老', '上等法相的元神不在周行殿：' + FX.Sect.postName(s, yc, p));
  p.xiang = 2; p.danPin = 5;
  assert(/殿长老$/.test(FX.Sect.postName(s, yc, p)), '元神没入九殿');
  // 5. 年岁太大的不收
  const g = FX.Game.newGame({ origin: 'sect', seed: 'dabi2' });
  const q = P.player(g);
  const gyc = Object.values(g.factions).find((f) => f.key === 'yuchen');
  q.factionId = gyc.id; q.locationId = gyc.seatId; q.realm = { major: 6, stage: 1 }; q.birthYear = g.year - 900; q.lifespanMax = 1500;
  g.saga.dabi.open = { from: g.year, until: g.year };
  const ga = FX.Game.actions(g).find((x) => x.type === 'dabi');
  assert(ga && !ga.ok && /年岁/.test(ga.reason), '九百岁的金丹也能赴四院大比');
  // 6. v10 存档迁移：补上大比排期
  const t10 = JSON.parse(FX.Save.serialize(FX.Game.newGame({ origin: 'sect', seed: 'mig11' })));
  delete t10.state.saga.dabi;
  t10.state.schemaVersion = 10; t10.schemaVersion = 10; delete t10.checksum;
  const mg = FX.Save.deserialize(t10);
  assert(mg.ok && mg.state.saga.dabi && mg.state.saga.dabi.next > mg.state.year, 'v10 迁移没补上大比排期');
  return `五场连胜夺魁、入十大弟子成上宗真传；凭道录殿符诏取了《${CF.techniques.xuanzhongjing.name}》；元神入周行殿任长老；九百岁的不收；v10 迁移正常`;
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'test-summary.json'), JSON.stringify({ seeds: SEEDS, years: YEARS, results }, null, 2));
process.exit(failed.length ? 1 : 0);
