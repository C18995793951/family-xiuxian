#!/usr/bin/env node
// 自动化测试：在 Node 中无头运行模拟核心（第 22 章）。
// 用法：node test/run-tests.js [--seeds N] [--years Y] [--quick]
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');
const { runGame, STRATEGIES } = require('./strategies');

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

// 0. 分层规则：核心不得访问 DOM、浏览器存储、Math.random、Date.now
check('0', '核心纯净（无 DOM / Math.random / Date.now）', () => {
  const bad = [];
  for (const f of loadCore.FILES) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', f + '.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const pat of ['Math.random', 'Date.now', 'new Date', 'window.', 'document.', 'localStorage', 'indexedDB']) if (src.includes(pat)) bad.push(f + ':' + pat);
  }
  assert(!bad.length, bad.join(', '));
  return loadCore.FILES.length + ' 个核心文件';
});

// 1 / 2 / 3 / 4 / 7 / 8：长时间模拟。每年结算后核心自带断言（死者不工作、亲缘与时间线、资源范围）。
let longStats = { games: 0, years: 0, ended: 0, turns: 0, ms: 0, histMax: 0 };
check('1', `长时间模拟 ${YEARS} 年（${ORIGINS.length} 出身 × ${STRATS.length} 策略 × ${SEEDS} 种子）`, () => {
  for (const origin of ORIGINS) for (const strategy of STRATS) for (let i = 0; i < SEEDS; i++) {
    const t0 = Date.now();
    let turns = 0;
    const s = runGame(FX, {
      origin, strategy, seed: `t-${origin}-${strategy}-${i}`, years: YEARS,
      onYear(st) {
        if (st.yearInTurn === 0) turns++;
        // 8. 事件引用有效：待决事件中引用的人物都在世
        for (const e of st.pending) assert(FX.Ev.valid(st, e.bound), `待决事件 ${e.defId} 引用失效`);
      },
    });
    longStats.games++; longStats.years += s.year - 1; longStats.turns += turns; longStats.ms += Date.now() - t0;
    if (s.ended) longStats.ended++;
    longStats.histMax = Math.max(longStats.histMax, s.history.length);
  }
  return `${longStats.games} 局，共 ${longStats.years} 年，${longStats.ended} 局以结局收场，无异常、无死局`;
});
check('2', '死者不工作（每年断言）', () => {
  const s = runGame(FX, { origin: 'market', strategy: 'reasonable', seed: 'dead-check', years: 150 });
  for (const p of Object.values(s.people)) if (p.status !== 'alive') assert(!p.duty.type, p.name + ' 已故/离族仍有差事');
  return '150 年内每次年度结算后均通过 S.check';
});
check('3', '亲缘与时间线', () => {
  let n = 0;
  for (const origin of ORIGINS) {
    const s = runGame(FX, { origin, strategy: 'reasonable', seed: 'kin-' + origin, years: 300 });
    for (const p of Object.values(s.people)) {
      for (const pid of [p.fatherId, p.motherId]) if (pid) { const par = s.people[pid]; assert(p.birthYear - par.birthYear >= 16, '父母年龄差不足'); n++; }
      if (p.motherId) { const m = s.people[p.motherId]; assert(m.deathYear === null || m.deathYear >= p.birthYear, '母亲死后出生'); }
      if (p.deathYear !== null) assert(p.deathYear >= p.birthYear, '死亡早于出生');
      if (p.spouseId && p.status === 'alive' && s.people[p.spouseId].status === 'alive') assert(s.people[p.spouseId].spouseId === p.id, '配偶不互指');
    }
  }
  return `检查 ${n} 条亲子关系`;
});
check('4', '资源不溢出、仓储腐败生效', () => {
  const s = FX.Game.newGame({ origin: 'market', seed: 'rot' });
  s.family.resources.grain = 5000;
  const before = s.family.resources.grain;
  FX.Game.advance(s);
  while (s.pending.length) { const e = FX.Game.pendingEvents(s)[0]; FX.Game.resolveEvent(s, e.id, e.options.find((o) => o.available).id); FX.Game.advance(s); }
  assert(s.family.resources.grain < before * 0.7, '灵谷超仓未腐败');
  for (const k in s.family.resources) assert(Number.isFinite(s.family.resources[k]) && s.family.resources[k] >= 0, k + ' 非法');
  return `灵谷 ${before} → ${Math.round(s.family.resources.grain)}（上限 ${FX.Econ.grainCap(s)}）`;
});

// 5. 存档一致：随机时点（含事件中断时）存档读档，继续 N 年后哈希与不中断相同
check('5', '存档一致（含事件中断时存档）', () => {
  let cases = 0, interruptCases = 0;
  for (const origin of ORIGINS) for (let i = 0; i < Math.max(2, SEEDS); i++) {
    const seed = `save-${origin}-${i}`;
    const stopYear = 20 + ((i * 37) % 60);
    const A = runGame(FX, { origin, strategy: 'reasonable', seed, years: 120 });
    // B：跑到 stopYear 附近，若遇中断就在中断态存档
    const s = FX.Game.newGame({ origin, seed });
    const strat = STRATEGIES.reasonable;
    let reloaded = false;
    let guard = 0;
    while (!s.ended && s.year - 1 < 120 && guard++ < 1000) {
      if (!reloaded && s.year >= stopYear) {
        const text = FX.Save.serialize(s);
        const r = FX.Save.deserialize(text);
        assert(r.ok, '读档失败：' + r.error);
        if (s.pending.length) interruptCases++;
        Object.keys(s).forEach((k) => delete s[k]);
        Object.assign(s, r.state);
        reloaded = true;
      }
      strat(FX, s);
      if (s.ended) break;
      FX.Game.advance(s);
    }
    assert(FX.Save.hashState(A) === FX.Save.hashState(s), `${seed} 读档后哈希不同`);
    cases++;
  }
  // 专门构造一次“中断态”存档
  const s = FX.Game.newGame({ origin: 'hermit', seed: 'interrupt' });
  let tries = 0;
  while (!s.pending.length && tries++ < 200) { STRATEGIES.reasonable(FX, s); if (!s.pending.length) FX.Game.advance(s); }
  assert(s.pending.length, '未能构造中断');
  const mid = s.phase;
  const r = FX.Save.deserialize(FX.Save.serialize(s));
  assert(r.ok && r.state.pending.length === s.pending.length && r.state.yearInTurn === s.yearInTurn && r.state.phase === mid, '中断态未完整保存');
  return `${cases} 组对照，其中 ${interruptCases} 组恰在中断态；中断态字段（年份进度、待决事件）完整`;
});
check('5b', '存档校验能拒绝损坏文件', () => {
  const s = FX.Game.newGame({ origin: 'market', seed: 'corrupt' });
  const t = FX.Save.serialize(s);
  const bad1 = FX.Save.deserialize(t.replace('"stone":600', '"stone":601'));
  assert(!bad1.ok && /校验和/.test(bad1.error), '篡改未被发现');
  const bad2 = FX.Save.deserialize('{"state":');
  assert(!bad2.ok, '坏 JSON 未被拒绝');
  const o = JSON.parse(t); o.schemaVersion = 99;
  const bad3 = FX.Save.deserialize(o);
  assert(!bad3.ok && /版本/.test(bad3.error), '新版本存档未被拒绝');
  return '校验和、JSON、版本三类错误均给出可读提示';
});
check('6', '可复现（同种子同策略两次运行哈希逐位相同）', () => {
  for (const origin of ORIGINS) for (const strategy of STRATS) {
    const a = runGame(FX, { origin, strategy, seed: 'repro', years: 200 });
    const b = runGame(FX, { origin, strategy, seed: 'repro', years: 200 });
    assert(FX.Save.hashState(a) === FX.Save.hashState(b), `${origin}/${strategy} 不可复现`);
  }
  return `${ORIGINS.length * STRATS.length} 组`;
});
check('7', '无死局（任何时刻都有合法操作）', () => {
  let ev = 0;
  for (let i = 0; i < 30; i++) {
    const s = FX.Game.newGame({ origin: ORIGINS[i % 3], seed: 'nodead' + i });
    let guard = 0;
    while (!s.ended && s.year < 200 && guard++ < 400) {
      for (const e of FX.Game.pendingEvents(s)) { if (s.ended) break; ev++; assert(e.options.some((o) => o.available), `事件 ${e.defId} 没有可选项`); FX.Game.resolveEvent(s, e.id, e.options.find((o) => o.available).id); }
      if (s.ended) break;
      const r = FX.Game.advance(s);
      assert(r.ok || s.pending.length, '推进失败：' + r.error);
    }
    assert(guard < 400, '推进卡住');
  }
  return `30 局 × 200 年，处理 ${ev} 件事件，每件都有可选项`;
});
check('8', '事件引用有效（延迟到期重新校验）', () => {
  const s = FX.Game.newGame({ origin: 'market', seed: 'ref' });
  const victim = FX.P.adults(s).find((p) => p.id !== s.family.headId);
  FX.Ev.schedule(s, 'E10B', 0, { person: victim.id }, []);
  FX.P.kill(s, victim, '测试', [], {});
  FX.Ev.processQueue(s);
  assert(!s.pending.some((e) => e.defId === 'E10B'), '死者仍被事件引用');
  const last = s.history[s.history.length - 1];
  assert(/已不在族中/.test(FX.H.text(last)), '未写明终止原因');
  return '到期时引用对象已故 → 取消并写明“' + FX.H.text(last) + '”';
});
check('12', '性能（单回合结算 < 200ms）', () => {
  const per = longStats.ms / Math.max(1, longStats.turns);
  assert(per < 200, '平均每回合 ' + per.toFixed(1) + 'ms');
  return `平均每回合 ${per.toFixed(2)} ms（含策略），单局历史条目最多 ${longStats.histMax}`;
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'test-summary.json'), JSON.stringify({ seeds: SEEDS, years: YEARS, results }, null, 2));
process.exit(failed.length ? 1 : 0);
