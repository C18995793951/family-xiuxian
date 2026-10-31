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
  // 苦修：以闭关为主，能突破就突破；无门无派时先去拜入宗门；缺什么（练炁术、冲关外药、开府真法）
  // 先找本门库藏，道功不够就做差事、领符诏，再不行去墟市买或托人代寻；伤了就养
  diligent(FX, s, rng) {
    const A = FX.Game.actions(s);
    const ov = FX.Game.view.overview(s);
    const me = ov.me, CF = FX.CONFIG;
    const find = (f) => A.find((a) => a.ok && f(a));
    const here = ov.place.id;
    const goTo = (pid) => { const r = FX.World.route(s, here, pid); return r && r.path.length > 1 ? find((a) => a.type === 'travel' && a.to === r.path[1]) : null; };
    if (me.health.state === 'heavy') return find((a) => a.type === 'use' && a.item === 'heal') || find((a) => a.type === 'rest');
    const house = FX.Game.view.house(s);
    // 无门无派：去能收自己的宗门求入
    if (!house.member && !me.factionId && me.realm.major >= 1) {
      const tgt = house.sects.find((x) => x.join && !x.join.closed && (x.can === true || /^要回到/.test(x.can)));
      if (tgt) { const j = find((a) => a.type === 'join' && a.fid === tgt.f.id); if (j) return j; const t = goTo(tgt.f.seatId); if (t) return t; }
    }
    // 长老房白给的功法先领了；上交妖物内丹、道书抄本
    const free = find((a) => a.type === 'sect_learn' && !a.cost);
    if (free) return free;
    const sub = find((a) => a.type === 'submit');
    if (sub) return sub;
    // 有更好的练炁术就研习（练炁前期才换）
    const curTier = ov.lianqi ? ov.lianqi.tier : 0;
    const learn = find((a) => a.type === 'learn' && CF.techniques[a.tech].tier > curTier && (!me.techniqueId || (me.realm.major === 2 && me.realm.stage <= 3)));
    if (learn) return learn;
    // 天下大事：玄真派弟子回山门应道脉校考；筑基以后、无伤，地渊开了就去外围采药
    const jk = A.find((a) => a.type === 'jiaokao');
    if (jk && jk.ok) return jk;
    if (jk && /^要回到/.test(jk.reason)) { const t = goTo(house.faction.seatId); if (t) return t; }
    const dyCfg = CF.saga.diyuan;
    const dyOpen = FX.Saga.openYear(s, 'diyuan') !== null && s.saga.diyuan.done !== s.saga.diyuan.open.from;
    if (dyOpen && me.realm.major >= 3 && me.health.state === 'healthy') {
      const dy = find((a) => a.type === 'diyuan');
      if (dy) return dy;
      const pit = Object.values(s.places).find((x) => x.name === dyCfg.place);
      const r = pit && FX.World.route(s, here, pit.id);
      if (r && r.days <= 60) { const t = goTo(pit.id); if (t) return t; }
    }
    const bt = ov.breakthrough;
    const br = find((a) => a.type === 'breakthrough');
    // 等大造元珠最多等八年，再等不到就硬冲
    if (br && (bt.kind !== 'zhuji' || ov.inv.zhuji > 0 || me.fullDays >= 8 * CF.daysPerYear || ov.age > ov.lifespan - 25)) return br;
    if (ov.pillUntil === null && me.realm.major >= 2) { const q = find((a) => a.type === 'use' && a.item === 'qiju'); if (q) return q; }
    const mk = s.markets[here];
    if (!house.member) for (const k of CF.loot) if (ov.inv[k] > 0 && mk) return { type: 'sell', item: k, qty: ov.inv[k] };
    // 眼下缺的东西（已托人代寻的不算缺）
    const coming = (k) => s.player.orders.filter((o) => o.item === k).length;
    const want = [];
    if (me.realm.major === 1 && !ov.lianqi) want.push((x) => x.startsWith('tech:') && CF.techniques[x.slice(5)].kind === 'lianqi');
    if (bt && bt.kind === 'zhuji' && !(ov.inv.zhuji > 0)) want.push((x) => x === 'zhuji');
    const need = FX.CU.minorNeed(me);
    if (need && (ov.inv[need.item] || 0) + coming(need.item) < need.qty) want.push((x) => x === need.item);
    if (bt && bt.kind === 'zifu' && !FX.CU.bestKaifu(s)) want.push((x) => x.startsWith('tech:') && CF.techniques[x.slice(5)].kind === 'kaifu' && !coming(x));
    if (bt && bt.kind === 'jindan' && !(ov.inv.ningdan > 0) && !coming('ningdan')) want.push((x) => x === 'ningdan');
    const wanted = (x) => want.some((f) => f(x));
    if (want.length) {
      // 本门库藏有就用道功换；道功不够就挣，不在山门就回去
      const red = A.find((a) => (a.type === 'redeem' && wanted(a.item)) || (a.type === 'sect_learn' && wanted('tech:' + a.tech)));
      if (red && red.ok) return red;
      if (red && /不够/.test(red.reason)) {
        if (!house.atSeat) { const t = goTo(house.faction.seatId); if (t) return t; }
        const m = find((a) => a.type === 'mission');
        if (m && rng() < 0.5) return m;
        const w = find((a) => a.type === 'work');
        if (w) return w;
      }
      if (red && /^要回到/.test(red.reason)) { const t = goTo(house.faction.seatId); if (t) return t; }
      const slot = mk && mk.stock.find((x) => wanted(x.item) && x.qty > 0);
      if (slot && ov.stone >= slot.price) return { type: 'buy', item: slot.item, qty: 1 };
      const ord = find((a) => a.type === 'order' && wanted(a.item));
      if (ord) return ord;
      // 去最近的、今年货架上有、买得起的地方（测试用的机器人直接看货架，玩家得靠传闻）
      const markets = Object.values(s.places).filter((p) => p.id !== here && s.markets[p.id] && s.markets[p.id].stock.some((x) => wanted(x.item) && x.qty > 0 && x.price <= ov.stone));
      const best = markets.map((p) => FX.World.route(s, here, p.id)).filter(Boolean).sort((a, b) => a.days - b.days)[0];
      if (best) return find((a) => a.type === 'travel' && a.to === best.path[1]);
      const w = find((a) => a.type === 'work');
      if (w && rng() < 0.6) return w;
    }
    const qslot = mk && mk.stock.find((x) => x.item === 'qiju' && x.qty > 0);
    if (me.realm.major >= 2 && qslot && ov.stone >= qslot.price + 150 && !(ov.inv.qiju > 0) && !want.length) return { type: 'buy', item: 'qiju', qty: 1 };
    // 换到自己修得最快、又还算安全的地方（练炁以上才看灵机与属相）
    if (me.realm.major >= 2 && !want.length) {
      const rateAt = (p) => { const lim = CF.cultivation.outsiderQi[p.type]; const qi = lim !== undefined && p.factionId && p.factionId !== me.factionId ? Math.min(p.qi, lim) : p.qi; const f = FX.CU.attrFit(s, me, p); return CF.cultivation.qiMult[qi] * (f ? f.value : 1); };
      const cur = rateAt(ov.place);
      const goal = Object.values(s.places).filter((p) => p.danger <= 1 && rateAt(p) > cur * 1.15).map((p) => ({ p, r: FX.World.route(s, here, p.id) })).filter((x) => x.r).sort((a, b) => rateAt(b.p) - rateAt(a.p) || a.r.days - b.r.days)[0];
      if (goal) { const t = find((a) => a.type === 'travel' && a.to === goal.r.path[1]); if (t) return t; }
      // 钱多了就在此开洞府（灵机更足、少受打扰）
      const df = find((a) => a.type === 'dongfu');
      if (df && ov.place.danger <= 1 && ov.stone > df.cost * 2) return df;
      // 钱多时以符钱修行
      const coin = find((a) => a.type === 'cultivate' && a.coin && a.days === 360);
      if (coin && ov.stone > coin.cost * 3 && CF.cultivation.qiMult[CF.cultivation.coin.qi] > cur) return coin;
    }
    if (rng() < 0.15) return find((a) => a.type === 'explore') || find((a) => a.type === 'cultivate' && !a.coin && a.days === 360);
    if (rng() < 0.1) return find((a) => a.type === 'work') || find((a) => a.type === 'cultivate' && !a.coin && a.days === 360);
    return find((a) => a.type === 'cultivate' && !a.coin && a.days === 360);
  },
  // 游侠：四处走、四处游历，修炼只占一部分
  wanderer(FX, s, rng) {
    const A = FX.Game.actions(s).filter((a) => a.ok);
    const ov = FX.Game.view.overview(s);
    if (ov.me.health.state !== 'healthy') return A.find((a) => a.type === 'use' && a.item === 'heal') || A.find((a) => a.type === 'rest');
    const br = A.find((a) => a.type === 'breakthrough');
    if (br && (ov.breakthrough.kind !== 'zhuji' || ov.inv.zhuji > 0)) return br;
    // 碰上了就去：地渊、撷芳宴
    const big = A.find((a) => a.type === 'diyuan' || a.type === 'xiefang');
    if (big) return big;
    const lr = A.find((a) => a.type === 'learn' && !ov.me.techniqueId);
    if (lr) return lr;
    const r = rng();
    if (r < 0.35) return A.find((a) => a.type === 'explore' && a.days === 30);
    if (r < 0.55) { const t = A.filter((a) => a.type === 'travel'); return t[Math.floor(rng() * t.length)]; }
    if (r < 0.65) { const b = A.filter((a) => a.type === 'befriend' || a.type === 'consult'); if (b.length) return b[Math.floor(rng() * b.length)]; }
    for (const k of FX.CONFIG.loot) if (ov.inv[k] > 0 && s.markets[ov.place.id]) return { type: 'sell', item: k, qty: ov.inv[k] };
    if (ov.me.realm.major === 1 && !ov.lianqi && s.markets[ov.place.id]) { const t = s.markets[ov.place.id].stock.find((x) => x.item.startsWith('tech:') && x.qty > 0 && x.price <= ov.stone && FX.CONFIG.techniques[x.item.slice(5)].kind === 'lianqi'); if (t) return { type: 'buy', item: t.item, qty: 1 }; }
    return A.find((a) => a.type === 'cultivate' && !a.coin && a.days === 180);
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
