// 预设策略脚本：代替玩家决策，供自动模拟与平衡报告使用。
// 策略自带独立的随机数（与游戏状态分离），因此同种子同策略逐位可复现。
'use strict';

const PREF = {
  E01: ['nurture', 'normal'], E03: ['quiet', 'let'], E04: ['buy', 'joint', 'pass'], E06: ['fine', 'demote'],
  E06A: ['purge', 'cover'], E07: ['loan', 'cut', 'sell'], E07D: ['pay', 'delay', 'default'], E22: ['save', 'lose'],
  E10: ['half', 'grant', 'deny'], E10B: ['soothe', 'watch', 'exile'], E12: ['ok', 'no'], E13: ['mid', 'reject', 'obey'],
  E15: ['allow', 'forbid'], E29: ['report', 'take', 'drive'], E29B: ['resolve'], E24: ['break', 'yanshou', 'heir'],
  C06X: ['sect', 'tribute', 'hold'], E26: ['yes', 'no'], S01: ['soothe', 'press', 'yield'], S02: ['council', 'lin'], R01: ['take', 'no'],
};

function makeRng(seed) {
  let a = 0x9e3779b9 ^ seed.length;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 2654435761);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveAll(FX, s, chooser) {
  let guard = 0;
  while (s.pending.length && guard++ < 20) {
    const e = FX.Game.pendingEvents(s)[0];
    const opt = chooser(e);
    const r = FX.Game.resolveEvent(s, e.id, opt);
    if (!r.ok) {
      const any = e.options.find((o) => o.available);
      FX.Game.resolveEvent(s, e.id, any ? any.id : e.options[0].id);
    }
  }
}

// 合理策略：按偏好处理事件，补产业缺口，攒筑基丹，择机突破
function reasonable(FX, s, opt) {
  opt = opt || {};
  const G = FX.Game, P = FX.P;
  resolveAll(FX, s, (e) => {
    const pref = PREF[e.defId] || [];
    for (const id of pref) { const o = e.options.find((x) => x.id === id && x.available); if (o) return o.id; }
    return (e.options.find((o) => o.available) || e.options[0]).id;
  });
  if (s.phase !== 'arrange' || s.ended) return;
  const res = s.family.resources;
  const f0 = FX.Econ.forecast(s);
  G.applySuggestions(s, s.turn % 4 === 1 || f0.netStone < 0);
  // 卖掉多余库存换灵石
  const keepGrain = FX.Econ.consumption(s).grain * 3 + 20;
  if (res.grain > keepGrain) G.sell(s, 'grain', Math.floor(res.grain - keepGrain));
  if (res.ore > 20) G.sell(s, 'ore', Math.floor(res.ore - 20));
  if (!(s.family.buildings.alchemy > 0) && res.herb > 10) G.sell(s, 'herb', Math.floor(res.herb - 10));
  // 产业：先保口粮，再保灵石，再修炼环境
  for (let i = 0; i < 4; i++) {
    const f = FX.Econ.forecast(s);
    const reserve = Math.min(opt.reserve || 120, f.netStone < 0 ? 40 : 120);
    const cand = [];
    if (f.netGrain < 2) cand.push('field');
    if (f.netStone < 15) cand.push(opt.commerce ? 'shop' : (s.family.buildings.mine || 0) <= (s.family.buildings.shop || 0) ? 'mine' : 'shop');
    if ((s.family.buildings.cave || 0) < (opt.elite ? 4 : 3)) cand.push('cave');
    if ((s.family.buildings.alchemy || 0) < 1 && P.living(s).length > 10) cand.push('alchemy');
    if ((s.family.buildings.ancestral || 0) < 3) cand.push('ancestral');
    let built = false;
    for (const k of cand) {
      const c = FX.Econ.canUpgrade(s, k);
      if (c.ok && res.stone - c.cost.stone >= reserve) { G.upgrade(s, k); built = true; break; }
    }
    if (!built) break;
  }
  const fg = FX.Econ.forecast(s);
  if ((s.family.buildings.alchemy || 0) > 0 && s.family.buildings.field >= 2 && s.family.settings.herbPlots < 1 && fg.netGrain > 15) G.setSetting(s, 'herbPlots', 1);
  else if (s.family.settings.herbPlots > 0 && fg.netGrain < 0) G.setSetting(s, 'herbPlots', 0);
  // 坊市：为接近筑基者备丹
  const near = P.living(s).filter((p) => p.realm.major === 1 && p.realm.stage === 9);
  if (near.length && res.zhuji < 1) {
    for (const item of ['zhuji', 'recipeZhuji']) {
      const o = s.market.offers.find((x) => x.item === item && x.qty > 0);
      if (o && res.stone >= o.price + 60) { G.buy(s, item, 1); break; }
    }
  }
  if (res.stone > 600) { const o = s.market.offers.find((x) => x.item === 'qiju'); if (o && o.qty) G.buy(s, 'qiju', Math.min(o.qty, 3)); }
  // 突破
  for (const p of P.living(s)) {
    const b = G.breakthroughPreview(s, p.id);
    if (!b || !b.can || !b.can.ok) continue;
    const left = P.lifespanLeft(s, p);
    const thr = b.kind === 'minor' ? 0 : left < 10 ? 10 : left < 25 ? 40 : 55;
    if (b.chance >= thr) G.attemptBreakthrough(s, p.id);
  }
  // 继承人
  if (!s.family.heirId) {
    const top = FX.Family.rankCandidates(s, s.family.headId).find((x) => x.p.id !== s.family.headId);
    if (top) G.designateHeir(s, top.p.id);
  }
  // 精英流：集中培养资质最高的两人
  if (opt.elite && s.family.rules.allocation === 'concentrate') {
    const best = P.living(s).filter((p) => P.hasRoot(p)).sort((a, b) => b.aptitude - a.aptitude).slice(0, 2).map((p) => p.id);
    G.setFocus(s, best);
  }
}

// 随机乱操作：随机选项、随机差事、随机建造、随机突破
function random(FX, s, rnd) {
  const G = FX.Game, P = FX.P;
  resolveAll(FX, s, (e) => { const av = e.options.filter((o) => o.available); return (av.length ? av[Math.floor(rnd() * av.length)] : e.options[0]).id; });
  if (s.phase !== 'arrange' || s.ended) return;
  const duties = Object.keys(FX.CONFIG.duties);
  for (const p of P.adults(s)) if (p.attention || !p.duty.type || rnd() < 0.15) { const d = duties[Math.floor(rnd() * duties.length)]; if (G.setDuty(s, p.id, d).ok === false) G.applySuggestions(s); }
  if (rnd() < 0.5) { const ks = Object.keys(FX.CONFIG.buildings); G.upgrade(s, ks[Math.floor(rnd() * ks.length)]); }
  for (const p of P.living(s)) { const b = G.breakthroughPreview(s, p.id); if (b && b.can && b.can.ok && rnd() < 0.5) G.attemptBreakthrough(s, p.id); }
}

const STRATEGIES = {
  reasonable: (FX, s) => reasonable(FX, s),
  commerce: (FX, s) => reasonable(FX, s, { commerce: true, reserve: 200 }),
  elite: (FX, s) => reasonable(FX, s, { elite: true }),
  random: null,
};

// 跑一局：返回状态与逐年指标
function runGame(FX, { origin, seed, strategy, years, onYear }) {
  const s = FX.Game.newGame({ origin, seed });
  const rnd = makeRng(seed + '/' + strategy);
  const stratFn = strategy === 'random' ? (F, st) => random(F, st, rnd) : STRATEGIES[strategy];
  let guard = 0;
  while (!s.ended && s.year - FX.CONFIG.startYear < years) {
    if (guard++ > years * 4 + 50) throw new Error('无法推进（疑似死局）');
    stratFn(FX, s);
    if (s.ended) break;
    const r = FX.Game.advance(s);
    if (!r.ok && !s.pending.length) throw new Error('推进失败：' + r.error);
    if (onYear) onYear(s);
  }
  return s;
}

module.exports = { STRATEGIES, runGame, makeRng, reasonable, random, resolveAll };
