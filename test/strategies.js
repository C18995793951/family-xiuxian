// 预设策略：只通过 FX.Game 公开接口操作，用于长时间模拟、平衡报告和原则检验。
'use strict';

const pickEvent = (FX, s, style) => {
  const v = FX.Game.pendingEvents(s)[0];
  const opts = v.options.filter((o) => o.available);
  let o;
  if (style === 'bold') o = opts.find((x) => x.id === 'deep' || x.id === 'fight') || opts[0];
  else {
    const fight = opts.find((x) => x.id === 'fight');
    if (fight && fight.chance && fight.chance.chance >= 60) o = fight;
    else o = opts.find((x) => x.id === 'safe' || x.id === 'pay' || x.id === 'flee') || opts[0];
  }
  return FX.Game.choose(s, v.id, o.id);
};

// 返回下一步行动
const STRATEGIES = {
  // 苦修：以闭关为主，能突破就突破，攒钱买筑基丹，伤了就养
  diligent(FX, s, rng) {
    const A = FX.Game.actions(s);
    const ov = FX.Game.view.overview(s);
    const find = (f) => A.find((a) => a.ok && f(a));
    if (ov.me.health.state === 'heavy') return find((a) => a.type === 'use' && a.item === 'heal') || find((a) => a.type === 'rest');
    const br = find((a) => a.type === 'breakthrough');
    if (br && (ov.breakthrough.kind !== 'zhuji' || ov.inv.zhuji > 0 || ov.age > ov.lifespan - 25)) return br;
    if (ov.pillUntil === null) { const q = find((a) => a.type === 'use' && a.item === 'qiju'); if (q) return q; }
    const mk = s.markets[ov.place.id];
    const qslot = mk && mk.stock.find((x) => x.item === 'qiju' && x.qty > 0);
    if (qslot && ov.stone >= qslot.price + 150 && !(ov.inv.qiju > 0) && !(ov.breakthrough && ov.breakthrough.kind === 'zhuji')) return { type: 'buy', item: 'qiju', qty: 1 };
    // 卖掉杂物
    for (const k of ['herb', 'beastHide', 'beastCore', 'rareHerb']) if (ov.inv[k] > 0 && mk) return { type: 'sell', item: k, qty: ov.inv[k] };
    // 修为圆满且缺筑基丹：去有坊市的地方买，或者打工攒钱
    // 换到自己能借到灵气最足、又还算安全的地方修炼
    const here0 = ov.place.id;
    const qiHere = FX.CU.qiFor(s, ov.me);
    const spots = Object.values(s.places).filter((p) => p.danger <= 1 && p.qi > qiHere && (!p.factionId || p.factionId === ov.me.factionId || !['sect', 'clan'].includes(p.type)));
    const goal = spots.map((p) => ({ p, r: FX.World.route(s, here0, p.id) })).filter((x) => x.r).sort((a, b) => b.p.qi - a.p.qi || a.r.days - b.r.days)[0];
    if (goal && !(ov.breakthrough && ov.breakthrough.kind === 'zhuji' && !(ov.inv.zhuji > 0))) { const t = find((a) => a.type === 'travel' && a.to === goal.r.path[1]); if (t) return t; }
    if (ov.breakthrough && ov.breakthrough.kind === 'zhuji' && !(ov.inv.zhuji > 0)) {
      const m = s.markets[ov.place.id];
      const slot = m && m.stock.find((x) => x.item === 'zhuji' && x.qty > 0);
      if (slot && ov.stone >= slot.price) return { type: 'buy', item: 'zhuji', qty: 1 };
      const w = find((a) => a.type === 'work');
      if (w && ov.stone < 450) return w;
      // 去最近的、今年货架上有筑基丹的坊市（测试用的机器人直接看货架，玩家得靠传闻）
      const here = ov.place.id;
      const markets = Object.values(s.places).filter((p) => p.id !== here && s.markets[p.id] && s.markets[p.id].stock.some((x) => x.item === 'zhuji' && x.qty > 0 && x.price <= ov.stone));
      const best = markets.map((p) => FX.World.route(s, here, p.id)).filter(Boolean).sort((a, b) => a.days - b.days)[0];
      if (best) return find((a) => a.type === 'travel' && a.to === best.path[1]);
      return find((a) => a.type === 'cultivate' && a.days === 90);
    }
    if (rng() < 0.15) return find((a) => a.type === 'explore') || find((a) => a.type === 'cultivate' && a.days === 360);
    if (rng() < 0.1) return find((a) => a.type === 'work') || find((a) => a.type === 'cultivate' && a.days === 360);
    return find((a) => a.type === 'cultivate' && a.days === 360);
  },
  // 游侠：四处走、四处游历，修炼只占一部分
  wanderer(FX, s, rng) {
    const A = FX.Game.actions(s).filter((a) => a.ok);
    const ov = FX.Game.view.overview(s);
    if (ov.me.health.state !== 'healthy') return A.find((a) => a.type === 'use' && a.item === 'heal') || A.find((a) => a.type === 'rest');
    const br = A.find((a) => a.type === 'breakthrough');
    if (br && (ov.breakthrough.kind !== 'zhuji' || ov.inv.zhuji > 0)) return br;
    const r = rng();
    if (r < 0.35) return A.find((a) => a.type === 'explore' && a.days === 30);
    if (r < 0.55) { const t = A.filter((a) => a.type === 'travel'); return t[Math.floor(rng() * t.length)]; }
    if (r < 0.65) { const b = A.filter((a) => a.type === 'befriend' || a.type === 'consult'); if (b.length) return b[Math.floor(rng() * b.length)]; }
    for (const k of ['herb', 'beastHide', 'beastCore', 'rareHerb']) if (ov.inv[k] > 0 && s.markets[ov.place.id]) return { type: 'sell', item: k, qty: ov.inv[k] };
    return A.find((a) => a.type === 'cultivate' && a.days === 180);
  },
  // 随机：在合法行动里均匀乱选（找崩溃用）
  random(FX, s, rng) {
    const A = FX.Game.actions(s).filter((a) => a.ok && a.type !== 'cultivate' || (a.type === 'cultivate' && a.days <= 360));
    return A[Math.floor(rng() * A.length)];
  },
};

// 小型确定性随机数（策略自己的选择，不动游戏 rng）
function mkRng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
}

// 跑一局，直到主角身死或到达 years 年；onStep 每步后回调
function runGame(FX, o) {
  const s = FX.Game.newGame({ origin: o.origin, seed: o.seed });
  const rng = mkRng('strat-' + o.seed);
  const start = s.year;
  const strat = STRATEGIES[o.strategy];
  let steps = 0;
  while (!s.ended && s.year - start < (o.years || 300) && steps < 20000) {
    steps++;
    if (s.pending.length) { const r = pickEvent(FX, s, o.strategy === 'wanderer' ? 'bold' : 'safe'); if (!r.ok) throw new Error('决断失败：' + r.error); }
    else {
      const a = strat(FX, s, rng) || FX.Game.actions(s).find((x) => x.ok && x.type === 'cultivate');
      const r = FX.Game.act(s, a);
      if (!r.ok && !['buy', 'sell'].includes(a.type)) throw new Error('行动失败：' + JSON.stringify(a) + ' ' + r.error);
    }
    if (o.onStep) o.onStep(s);
  }
  return s;
}

module.exports = { STRATEGIES, runGame, mkRng };
