// 预设策略：只通过 FX.Game 公开接口操作，用于长时间模拟、平衡报告和原则检验。
'use strict';

const pickEvent = (FX, s, style) => {
  const v = FX.Game.pendingEvents(s)[0];
  const opts = v.options.filter((o) => o.available);
  let o;
  if (style === 'bold') o = opts.find((x) => x.id === 'deep' || x.id === 'fight') || opts[0];
  else {
    const fight = opts.find((x) => x.id === 'fight');
    const aid = opts.find((x) => x.id === 'aid');
    if (aid && aid.chance && aid.chance.chance >= 55 && !(fight && fight.chance && fight.chance.chance >= 60)) return FX.Game.choose(s, v.id, aid.id);
    if (fight && fight.chance && fight.chance.chance >= 60) o = fight;
    else o = opts.find((x) => x.id === 'safe' || x.id === 'pay' || x.id === 'flee') || opts[0];
  }
  return FX.Game.choose(s, v.id, o.id);
};

// 返回下一步行动
const STRATEGIES = {
  // 苦修：以闭关为主，能突破就突破；无门无派时先去拜入宗门；缺什么（练炁术、冲关外药、开府真法）
  // 先找本门库藏，道功不够就做差事、领符诏，再不行去墟市买或托人代寻；伤了就养
  // （和导演模式的本地策略共用一套，见 src/core/director.js 的 Dir.diligent）
  diligent: (FX, s, rng) => FX.Dir.diligent(s, rng),
  // 死关：和苦修一样备齐冲关的东西，但从不为心境出门，能闭关就闭关（0.11 以前的“最优解”）
  recluse: (FX, s, rng) => FX.Dir.diligent(s, rng, { xinLow: -1, gateXin: -1, recluse: true }),
  // 游侠：修炼照样修，但心境不满八成就出去游历，常换地方走走
  wanderer(FX, s, rng) {
    const A = FX.Game.actions(s).filter((a) => a.ok);
    const me = FX.P.player(s);
    if (me.health.state === 'healthy' && !s.pending.length && rng() < 0.1) {
      const t = A.filter((a) => a.type === 'travel' && s.places[a.to].danger <= 2);
      if (t.length) return t[Math.floor(rng() * t.length)];
    }
    return FX.Dir.diligent(s, rng, { xinLow: 80, gateXin: 85 });
  },
  // 随机：在合法行动里均匀乱选（找崩溃用）
  random(FX, s, rng) {
    const A = FX.Game.actions(s).filter((a) => a.ok && (a.type !== 'cultivate' || a.days <= 360));
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
