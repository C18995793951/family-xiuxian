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
function check(no, name, fn) {
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
  assert(s.player.stone - st0 === CF.house.stipend.sect.stone[3], '俸禄没有按境界发放');
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
  for (const d of CF.factionDefs.filter((x) => x.type === 'sect')) {
    if (!d.library.some((e) => !e.merit && CF.techniques[e.tech].kind === 'lianqi')) miss.push(d.name + ' 不白传练炁术');
    if (!d.library.some((e) => CF.techniques[e.tech].kind === 'kaifu')) miss.push(d.name + ' 不传开府真法');
  }
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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'test-summary.json'), JSON.stringify({ seeds: SEEDS, years: YEARS, results }, null, 2));
process.exit(failed.length ? 1 : 0);
