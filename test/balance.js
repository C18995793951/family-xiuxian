#!/usr/bin/env node
// 平衡报告：批量模拟，输出第 18 章的各项指标。用法：node test/balance.js [--seeds N] [--years Y]
'use strict';
const loadCore = require('./load-core');
const { runGame, STRATEGIES } = require('./strategies');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const SEEDS = arg('--seeds', 40), YEARS = arg('--years', 300);
const FX = loadCore();
const med = (a) => { if (!a.length) return '—'; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (x, n) => (n ? Math.round((x / n) * 100) + '%' : '—');
const rows = [];
for (const origin of Object.keys(FX.CONFIG.origins)) for (const strategy of Object.keys(STRATEGIES)) {
  let alive100 = 0, alive300 = 0, jindan = 0, peakPop = [];
  const firstZ = [];
  const grades = {};
  for (let i = 0; i < SEEDS; i++) {
    let at100 = null;
    const s = runGame(FX, { origin, strategy, seed: `bal-${origin}-${strategy}-${i}`, years: YEARS, onYear(st) { if (at100 === null && st.year - 1 >= 100) at100 = !st.ended; } });
    if (at100 === null) at100 = !s.ended;
    if (at100) alive100++;
    if (!s.ended) alive300++;
    const z = s.records.firsts.firstZhuji; if (z) firstZ.push(FX.H.get(s, z).year);
    if (s.records.firsts.firstJindan) jindan++;
    peakPop.push((s.records.peaks.population || {}).value || 0);
    const g = FX.Sim.rating(s, s.ended && s.ended.type).grade; grades[g] = (grades[g] || 0) + 1;
  }
  rows.push({ 出身: FX.CONFIG.origins[origin].name, 策略: strategy, '100年存续': pct(alive100, SEEDS), [YEARS + '年存续']: pct(alive300, SEEDS), '首位筑基年份中位数': med(firstZ), '出筑基局占比': pct(firstZ.length, SEEDS), '出金丹局占比': pct(jindan, SEEDS), 人口峰值中位数: med(peakPop), 评级分布: Object.keys(grades).sort().map((g) => g + grades[g]).join(' ') });
}
console.log(`平衡报告（每组 ${SEEDS} 个种子，${YEARS} 年）`);
console.table(rows);
console.log('第 18 章目标：100 年存续 合理≥90%、随机 60–75%；300 年存续 合理 40–60%；首位筑基中位数第 40–80 年；300 年出金丹 15–30%。阶段 5 正式校准。');
