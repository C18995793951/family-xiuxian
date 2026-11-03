#!/usr/bin/env node
// 平衡报告：批量模拟主角的一生。用法：node test/balance.js [--seeds N]
'use strict';
const loadCore = require('./load-core');
const { runGame, STRATEGIES } = require('./strategies');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const SEEDS = arg('--seeds', 40);
const FX = loadCore();
const med = (a) => { if (!a.length) return '—'; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (x, n) => (n ? Math.round((x / n) * 100) + '%' : '—');
const rows = [];
for (const origin of Object.keys(FX.CONFIG.origins)) for (const strategy of Object.keys(STRATEGIES)) {
  const ages = [], zhujiAge = [];
  let zhuji = 0, taixi = 0, lianqi = 0, zifu = 0, dongxuan = 0, jindan = 0, sagas = 0, dongfu = 0, violent = 0, seek = 0, noGain = 0, explores = 0, nothing = 0;
  const grades = {};
  for (let i = 0; i < SEEDS; i++) {
    const s = runGame(FX, { origin, strategy, seed: `bal-${origin}-${strategy}-${i}`, years: 400 });
    const p = FX.P.player(s);
    ages.push(FX.P.age(s, p));
    const z = s.records.firsts.break_zhuji;
    if (z) { zhuji++; zhujiAge.push(FX.H.get(s, z).year - p.birthYear); }
    if (p.peakRank >= FX.P.rankOf(1, 1)) taixi++;
    if (p.peakRank >= FX.P.rankOf(2, 1)) lianqi++;
    if (p.peakRank >= FX.P.rankOf(4, 1)) zifu++;
    if (p.peakRank >= FX.P.rankOf(5, 1)) dongxuan++;
    if (p.peakRank >= FX.P.rankOf(6, 1)) jindan++;
    sagas += s.player.stats.sagas || 0;
    if (s.player.dongfu) dongfu++;
    if (s.ended && !/寿元/.test(s.ended.what)) violent++;
    const st = s.player.stats;
    seek += st.seek; noGain += st.seekNoGain; explores += st.explores; nothing += st.exploreNothing;
    const g = FX.Sim.rating(s).grade; grades[g] = (grades[g] || 0) + 1;
  }
  rows.push({
    出身: FX.CONFIG.origins[origin].name, 策略: strategy,
    寿命中位数: med(ages), 胎息: pct(taixi, SEEDS), 练炁: pct(lianqi, SEEDS), 筑基: pct(zhuji, SEEDS), 筑基年龄中位数: med(zhujiAge), 紫府: pct(zifu, SEEDS), 洞玄: pct(dongxuan, SEEDS), 金丹: pct(jindan, SEEDS), 赴大事: (sagas / SEEDS).toFixed(1), 洞府: pct(dongfu, SEEDS), 非寿终占比: pct(violent, SEEDS),
    求取无收获: pct(noGain, seek), 游历无所获: pct(nothing, explores), 评定分布: Object.keys(grades).sort().map((g) => g + grades[g]).join(' '),
  });
}
console.log(`平衡报告（每组 ${SEEDS} 个种子，主角从 16 岁到身故，至多 400 年）`);
console.table(rows);
console.log('原则检验：求取无收获应 ≥ 30%，游历无所获应 ≥ 40%。境界与寿命的目标值在阶段 5 校准。');
console.log('赴大事：平均每局赴地渊、撷芳宴、道脉校考的次数；洞府：死时开有洞府的局数占比。');
