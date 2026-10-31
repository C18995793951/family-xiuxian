// 宅家流亲历事件统计：给测试和调参用。homeLife(FX, seed, origin, years) → { n, kinds, robRev }
'use strict';
const { mkRng } = require('./strategies');
function homeLife(FX, seed, origin, years) {
  const s = FX.Game.newGame({ origin, seed });
  const rng = mkRng('home-' + seed);
  const start = s.year;
  let guard = 0;
  while (!s.ended && s.year - start < years && guard++ < 5000) {
    if (s.pending.length) {
      const v = FX.Game.pendingEvents(s)[0];
      const av = v.options.filter((o) => o.available);
      // 遭遇（劫修、妖物）求稳；找上门的世事随手挑一个能选的
      const o = (v.defId === 'HOOK' ? av[Math.floor(rng() * av.length)] : av.find((x) => ['pay', 'flee', 'safe', 'leave'].includes(x.id))) || av[av.length - 1] || v.options[0];
      FX.Game.choose(s, v.id, o.id);
      continue;
    }
    const A = FX.Game.actions(s);
    const a = A.find((x) => x.ok && x.type === 'breakthrough' && !x.path) || A.find((x) => x.ok && x.type === 'rest')
      || A.find((x) => x.ok && x.type === 'cultivate' && x.until) || A.find((x) => x.ok && x.type === 'cultivate' && x.days === 360 && !x.coin);
    if (!a) break;
    FX.Game.act(s, a);
  }
  const evs = s.history.filter((e) => e.type === 'event' && e.pov && e.params && e.params.defId);
  const kinds = {};
  for (const e of evs) { const k = e.params.kind || e.params.defId; kinds[k] = (kinds[k] || 0) + 1; }
  const robRev = (kinds.ROBBER || 0) + (kinds.REVENGE || 0);
  return { n: evs.length, kinds, robRev, years: s.year - start, s };
}
module.exports = { homeLife };
