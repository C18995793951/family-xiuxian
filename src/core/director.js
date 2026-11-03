/* ============================================================
 * director —— 导演模式：主角全程由 AI（或本地策略）自己过这一生，玩家只看
 * 主角的每一步都落到规则认得的行动上，规则照常校验、掷骰、结算：
 *  - 本地策略（没有 AI 时、AI 没接上时）：按「本心」（性格与志向）在苦修之外游历、结交、插手传闻、赴约；
 *  - AI：拿到和自由输入一样的事实，加上本心、志向、近来传闻、按常理的下一步，以主角本人的口吻
 *    出一份至多三步的打算（和自由输入同一种格式、同一套校验），或者挑一桩传闻去插手、给眼前的事拿主意；
 *  - 心声（一句第一人称的念头）过文字校验后记进 aiLog，只用于显示，不算进规则状态。
 * 这个文件不访问网络，也不访问 DOM；网络与节奏在 ui/director.js。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const P = () => FX.P;
  const H = () => FX.H;
  const T = () => FX.T;
  const W = () => FX.World;
  const Act = () => FX.Act;
  const Intent = () => FX.Intent;
  const Prop = () => FX.Prop;

  const Dir = {};
  const me = (s) => P().player(s);

  /* ---------- 本心：几种活法 ----------
   * explore/roam/social/work/meddle：不在冲关、不缺东西时，每步做这件事的几率；bold：遇事敢不敢拼；danger：肯去多险的地方 */
  Dir.PERSONAS = {
    qiudao: { name: '一心求道', desc: '闭关苦修为主，少管闲事，缺什么就去找来路', explore: 0.04, roam: 0.02, social: 0.04, work: 0.02, meddle: 0.08, bold: 0, danger: 1 },
    youli: { name: '游历四方', desc: '修炼之余四处走、四处看，结交各色人物', explore: 0.2, roam: 0.14, social: 0.1, work: 0.02, meddle: 0.25, bold: 1, danger: 2 },
    xiayi: { name: '古道热肠', desc: '见不得旁人受难，传闻里的事常去插手', explore: 0.08, roam: 0.05, social: 0.12, work: 0.03, meddle: 0.6, bold: 1, danger: 2 },
    jingying: { name: '精打细算', desc: '先攒家底再求进境，多做营生，少冒险', explore: 0.04, roam: 0.02, social: 0.08, work: 0.2, meddle: 0.1, bold: -1, danger: 1 },
    haosheng: { name: '好勇斗狠', desc: '遇事敢拼，爱去险地游历，有约必赴', explore: 0.16, roam: 0.06, social: 0.04, work: 0.02, meddle: 0.3, bold: 2, danger: 3 },
  };
  Dir.ORDER = ['qiudao', 'youli', 'xiayi', 'jingying', 'haosheng'];
  // 没选过时按性格定
  Dir.defaultPersona = (p) => {
    const t = p.traits || [];
    if (t.includes('仁慈') || t.includes('正直')) return 'xiayi';
    if (t.includes('野心勃勃')) return 'haosheng';
    if (t.includes('贪婪')) return 'jingying';
    if (t.includes('谨慎') || t.includes('孤傲')) return 'qiudao';
    return 'youli';
  };

  // 导演自己的小账（不改任何规则数值）：本心、志向原话、看过的传闻、上回问 AI 的时刻
  Dir.state = (s) => {
    if (!s.director) s.director = { persona: Dir.defaultPersona(me(s)), aim: '', seen: [], lastAsk: -1e9, lastPlace: me(s).locationId, n: 0 };
    return s.director;
  };
  Dir.setPersona = (s, k) => { if (!Dir.PERSONAS[k]) return { ok: false, error: '没有这种活法' }; Dir.state(s).persona = k; return { ok: true }; };
  Dir.setAim = (s, text) => { Dir.state(s).aim = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60); return { ok: true }; };
  const persona = (s) => Dir.PERSONAS[Dir.state(s).persona] || Dir.PERSONAS.qiudao;

  // 小型确定性随机数：只管导演自己的取舍，不碰游戏的 rng（同种子同一生）
  const mkRng = (seed) => {
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
  };
  Dir.mkRng = mkRng;
  const rngAt = (s) => mkRng('dir:' + s.seed + ':' + s.t + ':' + s.player.stats.actions + ':' + Dir.state(s).n);

  /* ---------- 苦修（与测试里的苦修策略同一套）---------- */
  // 以闭关为主，能突破就突破；无门无派时先去拜入宗门；缺什么先找本门库藏，道功不够就做差事，再不行去墟市买或托人代寻；伤了就养
  Dir.diligent = (s, rng) => {
    const Gm = FX.Game;
    const A = Gm.actions(s);
    const ov = Gm.view.overview(s);
    const me = ov.me, CF = C();
    const find = (f) => A.find((a) => a.ok && f(a));
    const here = ov.place.id;
    // 找路只走得通的路（南域与中域之间的荒原，金丹以前过不去）
    const who = FX.P.player(s);
    const goTo = (pid) => { const r = W().route(s, here, pid, who); return r && r.path.length > 1 ? find((a) => a.type === 'travel' && a.to === r.path[1]) : null; };
    if (me.health.state === 'heavy') return find((a) => a.type === 'use' && a.item === 'heal') || Dir.restFor(s, A);
    const house = Gm.view.house(s);
    if (!house.member && !me.factionId && me.realm.major >= 1) {
      const tgt = house.sects.find((x) => x.join && !x.join.closed && (x.can === true || /^要回到/.test(x.can)));
      if (tgt) { const j = find((a) => a.type === 'join' && a.fid === tgt.f.id); if (j) return j; const t = goTo(tgt.f.seatId); if (t) return t; }
    }
    const free = find((a) => a.type === 'sect_learn' && !a.cost);
    if (free) return free;
    const sub = find((a) => a.type === 'submit');
    if (sub) return sub;
    const curTier = ov.lianqi ? ov.lianqi.tier : 0;
    const learn = find((a) => a.type === 'learn' && CF.techniques[a.tech].tier > curTier && (!me.techniqueId || (me.realm.major === 2 && me.realm.stage <= 3)));
    if (learn) return learn;
    const jk = A.find((a) => a.type === 'jiaokao');
    if (jk && jk.ok) return jk;
    if (jk && /^要回到/.test(jk.reason)) { const t = goTo(house.faction.seatId); if (t) return t; }
    const dyCfg = CF.saga.diyuan;
    const dyOpen = FX.Saga.openYear(s, 'diyuan') !== null && s.saga.diyuan.done !== s.saga.diyuan.open.from;
    if (dyOpen && me.realm.major >= 3 && me.health.state === 'healthy') {
      const dy = find((a) => a.type === 'diyuan');
      if (dy) return dy;
      const pit = Object.values(s.places).find((x) => x.name === dyCfg.place);
      const r = pit && W().route(s, here, pit.id, who);
      if (r && r.days <= 60) { const t = goTo(pit.id); if (t) return t; }
    }
    const bt = ov.breakthrough;
    const br = find((a) => a.type === 'breakthrough');
    if (br && (bt.kind !== 'zhuji' || ov.inv.zhuji > 0 || me.fullDays >= 8 * CF.daysPerYear || ov.age > ov.lifespan - 25)) return br;
    // 冲关要灵机够高之地（结丹四级、元神六级）：修满了就去能用的地方，或到野外开洞府聚灵；太凶险的地方不去
    const qn = P().isFull(who) && FX.Guide.needs(s).find((n) => n.qi);
    if (qn) {
      for (const w of FX.Guide.ways(s, qn)) {
        if ((w.danger || 0) > 2 || !w.step) continue;
        if (w.step.act) { const a = find((x) => x.type === w.step.act.type && x.days === w.step.act.days && (x.item || '') === (w.step.act.item || '')); if (a) return a; }
        if (w.step.goto) { const t = goTo(w.step.goto); if (t) return t; }
      }
    }
    if (ov.pillUntil === null && me.realm.major >= 2) { const q = find((a) => a.type === 'use' && a.item === 'qiju'); if (q) return q; }
    const mk = s.markets[here];
    if (!house.member) for (const k of CF.loot) if (ov.inv[k] > 0 && mk) return { type: 'sell', item: k, qty: ov.inv[k] };
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
      const red = A.find((a) => (a.type === 'redeem' && wanted(a.item)) || (a.type === 'sect_learn' && wanted('tech:' + a.tech)));
      if (red && red.ok) return red;
      if (red && /不够/.test(red.reason)) {
        if (!house.atSeat) { const t = goTo(house.faction.seatId); if (t) return t; }
        // 符钱宽裕就捐输补足道功，免得一个月一个月地领差事
        const gap = Math.max(0, (red.cost || 0) - s.player.merit);
        const dn = find((a) => a.type === 'donate');
        if (dn && gap > 0) { const n = Math.ceil(gap / dn.gain); if (n * dn.cost <= ov.stone - 50) return Object.assign({}, dn, { qty: n }); }
        const m = find((a) => a.type === 'mission');
        if (m && rng() < 0.5) return m;
        const per = Math.max(1, FX.Sect.taskMerit(who));
        const w = (gap / per >= 6 && find((a) => a.type === 'work' && a.days >= 180)) || find((a) => a.type === 'work');
        if (w) return w;
      }
      if (red && /^要回到/.test(red.reason)) { const t = goTo(house.faction.seatId); if (t) return t; }
      const slot = mk && mk.stock.find((x) => wanted(x.item) && x.qty > 0);
      if (slot && ov.stone >= slot.price) return { type: 'buy', item: slot.item, qty: 1 };
      const ord = find((a) => a.type === 'order' && wanted(a.item));
      if (ord) return ord;
      const markets = Object.values(s.places).filter((p) => p.id !== here && s.markets[p.id] && s.markets[p.id].stock.some((x) => wanted(x.item) && x.qty > 0 && x.price <= ov.stone));
      const best = markets.map((p) => W().route(s, here, p.id, who)).filter(Boolean).sort((a, b) => a.days - b.days)[0];
      if (best) return find((a) => a.type === 'travel' && a.to === best.path[1]);
      // 钱差得多就一口气做半年
      const price = Math.min(...Object.keys(CF.items).filter(wanted).map((k) => CF.items[k].price).concat(Object.keys(CF.techniques).filter((k) => wanted('tech:' + k)).map((k) => CF.techniques[k].price)));
      const pay = FX.Act.workPay(s, ov.place.type);
      const w = (pay && isFinite(price) && (price - ov.stone) / Math.max(1, pay.stone) >= 6 && find((a) => a.type === 'work' && a.days >= 180)) || find((a) => a.type === 'work');
      if (w && rng() < 0.6) return w;
    }
    const qslot = mk && mk.stock.find((x) => x.item === 'qiju' && x.qty > 0);
    if (me.realm.major >= 2 && qslot && ov.stone >= qslot.price + 150 && !(ov.inv.qiju > 0) && !want.length) return { type: 'buy', item: 'qiju', qty: 1 };
    if (me.realm.major >= 2 && !want.length) {
      const rateAt = (p) => { const lim = CF.cultivation.outsiderQi[p.type]; const qi = lim !== undefined && p.factionId && p.factionId !== me.factionId ? Math.min(p.qi, lim) : p.qi; const f = FX.CU.attrFit(s, me, p); return CF.cultivation.qiMult[qi] * (f ? f.value : 1); };
      const cur = rateAt(ov.place);
      const goal = Object.values(s.places).filter((p) => p.danger <= 1 && rateAt(p) > cur * 1.15).map((p) => ({ p, r: W().route(s, here, p.id, who) })).filter((x) => x.r).sort((a, b) => rateAt(b.p) - rateAt(a.p) || a.r.days - b.r.days)[0];
      if (goal) { const t = find((a) => a.type === 'travel' && a.to === goal.r.path[1]); if (t) return t; }
      const df = find((a) => a.type === 'dongfu');
      if (df && ov.place.danger <= 1 && ov.stone > df.cost * 2) return df;
      const coin = find((a) => a.type === 'cultivate' && a.coin && a.days === 360);
      if (coin && ov.stone > coin.cost * 3 && CF.cultivation.qiMult[CF.cultivation.coin.qi] > cur) return coin;
    }
    if (rng() < 0.15) return find((a) => a.type === 'explore') || find((a) => a.type === 'cultivate' && !a.coin && a.days === 360);
    if (rng() < 0.1) return find((a) => a.type === 'work') || find((a) => a.type === 'cultivate' && !a.coin && a.days === 360);
    return find((a) => a.type === 'cultivate' && !a.coin && a.days === 360);
  };

  // 静养：挑一段大约养得好伤的日子（静养时伤好得快一倍），不一个月一个月地养
  Dir.restFor = (s, A) => {
    const left = me(s).health.days;
    const rs = (A || Act().list(s)).filter((a) => a.ok && a.type === 'rest').sort((a, b) => a.days - b.days);
    return rs.find((a) => a.days * 2 >= left) || rs[rs.length - 1] || null;
  };

  /* ---------- 传闻：近来能插手、还没理会过的 ---------- */
  Dir.rumors = (s, n) => {
    const d = Dir.state(s), seen = new Set(d.seen), p = me(s);
    const since = s.t - 2 * C().daysPerYear;
    const out = [];
    for (let i = s.history.length - 1; i >= 0 && out.length < (n || 4); i--) {
      const e = s.history[i];
      if (e.t < since) break;
      if (e.pov || !e.params || !e.params.ix || seen.has(e.id)) continue;
      const plans = FX.Npc.interventions(s, e);
      if (plans.length) out.push({ hid: e.id, text: H().text(e), plans, close: (e.actors || []).some((id) => id !== p.id && Math.abs(P().relValue(s, p.id, id)) >= 20) });
    }
    return out;
  };
  const markSeen = (s, ids) => { const d = Dir.state(s); for (const id of ids) if (!d.seen.includes(id)) d.seen.push(id); if (d.seen.length > 60) d.seen.splice(0, d.seen.length - 60); };

  /* ---------- 本地策略：返回 { act } 或 { plan }，附 why（心声）和 seen（看过的传闻）---------- */
  Dir.local = (s) => {
    const per = persona(s), rng = rngAt(s), p = me(s), cf = C();
    const A = Act().list(s);
    const find = (f) => A.find((a) => a.ok && f(a));
    let skipped = [];
    const out = (o, why, seen) => Object.assign(o, { why, seen: (seen || []).concat(skipped), via: 'local' });
    // 到期的约战：照约去
    const pact = (s.player.pacts || []).find((x) => x.kind === 'duel' && !x.done && x.due <= s.t && s.people[x.npc] && P().alive(s.people[x.npc]));
    if (pact && p.health.state === 'healthy' && per.bold >= 0) {
      const q = s.people[pact.npc];
      const steps = (q.locationId !== p.locationId ? [{ k: 'go', to: q.locationId }] : []).concat([{ k: 'deed', a: { type: 'deed', verb: 'fight', mode: 'duel', npc: q.id } }]);
      if (Intent().preview(s, steps).ok) return out({ plan: { say: '赴' + q.name + '的约战', steps, via: 'director' } }, '与' + q.name + '有约在先，该去了结。');
    }
    const ov = FX.Game.view.overview(s);
    const atGate = ov.full && ov.breakthrough && ov.breakthrough.can && ov.breakthrough.can.ok;
    const hurt = p.health.state !== 'healthy';
    // 传闻：按本心决定插不插手（看过的就不再想）
    const rs = hurt || atGate ? [] : Dir.rumors(s, 2);
    if (rs.length) {
      const r = rs[0];
      if (rng() < per.meddle) {
        const order = per.meddle >= 0.5 ? ['相助', '送药', '看看', '打听'] : ['看看', '打听', '相助', '送药'];
        const rank = (pl) => { const i = order.findIndex((w) => pl.say.includes(w)); return i < 0 ? 9 : i; };
        const pl = r.plans.slice().sort((a, b) => rank(a) - rank(b))[0];
        const pv = Intent().preview(s, pl.steps);
        if (pv.ok && pv.days <= 90 * (1 + per.danger)) return out({ plan: Object.assign({}, pl, { via: 'director' }) }, '听说了这件事，' + (per.meddle >= 0.5 ? '不能坐视不管。' : '去看看也好。'), rs.map((x) => x.hid));
      }
      // 不插手也记下，免得每步都想一遍
      skipped = rs.map((x) => x.hid);
    }
    // 本心里的闲笔：不在关口、没伤、不缺急用的东西时
    const g = FX.Guide && FX.Guide.next(s);
    const stuck = g && g.need && !g.need.soon;
    if (!hurt && !atGate && !stuck) {
      const r = rng();
      let acc = per.explore;
      if (r < acc) {
        const ex = find((a) => a.type === 'explore' && a.days === 30) || find((a) => a.type === 'explore');
        if (ex && s.places[p.locationId].danger <= per.danger + 1) return out({ act: ex }, '在此地走走看看，或有所得。');
      }
      // 出门走走：在一地住满一年才想走；到了新地方先住一阵、四处看看，不急着回去
      const d = Dir.state(s);
      if (r < (acc += per.roam) && (!d.roam || s.t - d.roam.t >= cf.daysPerYear)) {
        const ts = A.filter((a) => a.ok && a.type === 'travel' && s.places[a.to].danger <= per.danger && a.to !== (d.roam && d.roam.from));
        if (ts.length) { const t = ts[Math.floor(rng() * ts.length)]; d.roam = { from: p.locationId, to: t.to, t: s.t }; return out({ act: t }, '在' + s.places[p.locationId].name + '住久了，想去' + s.places[t.to].name + '看看。'); }
      }
      if (r < (acc += per.social)) {
        const cs = A.filter((a) => a.ok && (a.type === 'befriend' || a.type === 'consult'));
        if (cs.length) { const c = cs[Math.floor(rng() * cs.length)]; const q = s.people[c.npc]; return out({ act: c }, c.type === 'consult' ? q.name + '修为在我之上，正好请教。' : '与' + q.name + '同在一地，该去走动走动。'); }
      }
      if (r < (acc += per.work)) {
        const w = find((a) => a.type === 'work');
        if (w) return out({ act: w }, '手头不宽裕，先挣些符钱。');
      }
    }
    let a = Dir.diligent(s, rng) || find((x) => x.type === 'cultivate' && !x.coin && x.days === 360) || Dir.restFor(s, A) || find((x) => x.type === 'cultivate');
    if (!a) return null;
    // 刚游历到新地方（三个月内）又要赶回去：不缺急用的东西就先在此地看看、住下修炼
    const rm = Dir.state(s).roam;
    if (a.type === 'travel' && rm && rm.to === p.locationId && s.t - rm.t < 120 && !stuck && !hurt) {
      const stay = (rng() < 0.5 && find((x) => x.type === 'explore' && x.days === 30)) || find((x) => x.type === 'cultivate' && !x.coin && x.days === 90) || find((x) => x.type === 'cultivate' && !x.coin);
      if (stay) return out({ act: stay }, stay.type === 'explore' ? '初到' + s.places[p.locationId].name + '，先四处看看。' : '在' + s.places[p.locationId].name + '住些日子，就地修炼。');
    }
    return out({ act: a }, whyOf(s, a));
  };
  // 苦修路上的心声（模板；只在换了做法时才记）
  const whyOf = (s, a) => {
    const n = (id) => (s.people[id] ? s.people[id].name : '');
    switch (a.type) {
      case 'breakthrough': return '修为已到关口，成败在此一举。';
      case 'cultivate': return a.coin ? '符钱尚足，以符钱修行快些。' : '闭关修炼，不问外事。';
      case 'rest': case 'use': return a.item && a.item !== 'heal' ? '' : '伤还没好，先养伤。';
      case 'travel': return ''; // 纪事里已写了去哪，不再重复一句
      case 'join': return '无门无派难有出路，去求入山门。';
      case 'learn': case 'sect_learn': return '换一门更好的功法。';
      case 'redeem': case 'order': case 'buy': return a.item === 'qiju' ? '中孚丹快用完了，补上几颗。' : '冲关缺的东西，得先备齐。';
      case 'mission': case 'work': return '道功、符钱不够，先去挣。';
      case 'explore': return '出去走走，或有机缘。';
      case 'befriend': return '去拜访' + n(a.npc) + '。';
      case 'diyuan': return '地渊开了，去碰碰运气。';
      case 'submit': case 'donate': return '把用不上的折成道功，好换冲关要用的东西。';
      default: return ''; // 纪事里已写了做了什么，不再照抄一遍
    }
  };

  /* ---------- 眼前的事：本地按本心拿主意 ---------- */
  Dir.eventLocal = (s) => {
    const v = FX.Game.pendingEvents(s)[0];
    if (!v) return null;
    const per = persona(s);
    const opts = v.options.filter((o) => o.available);
    if (!opts.length) return null;
    const ch = (o) => (o.chance && typeof o.chance.chance === 'number' ? o.chance.chance : null);
    const line = { 2: 40, 1: 55, 0: 65, '-1': 75 }[per.bold];
    const brave = opts.filter((o) => ['fight', 'deep'].includes(o.id) && (ch(o) === null ? per.bold >= 2 : ch(o) >= line)).sort((a, b) => (ch(b) || 0) - (ch(a) || 0))[0];
    if (brave) return { id: brave.id, label: brave.label, why: ch(brave) !== null ? '胜算不小，拼一拼。' : '富贵险中求。', via: 'local' };
    const safe = opts.find((o) => ['safe', 'pay', 'flee'].includes(o.id)) || opts.filter((o) => !o.irreversible)[0] || opts[0];
    const risky = opts.some((o) => ['fight', 'deep'].includes(o.id));
    return { id: safe.id, label: safe.label, why: !risky ? '' : per.bold >= 1 ? '这回不值得拼命。' : '稳妥为上。', via: 'local' };
  };

  /* ---------- 什么时候值得问 AI（「要紧时」模式）---------- */
  Dir.moment = (s, everyYears) => {
    const d = Dir.state(s), p = me(s);
    if (s.pending.length) return '眼前有事';
    const ov = FX.Game.view.overview(s);
    if (ov.full && ov.breakthrough && ov.breakthrough.can && ov.breakthrough.can.ok) return '到了关口';
    if (p.health.state === 'heavy') return '受了重伤';
    if (d.lastPlace !== p.locationId) return '到了新地方';
    // 传闻常有，只有牵涉到相熟的人（交情或仇怨够深）、且隔了两年以上才算要紧
    if (s.t - d.lastAsk >= 2 * C().daysPerYear && Dir.rumors(s, 3).some((r) => r.close)) return '听到熟人的事';
    if ((s.player.pacts || []).some((x) => !x.done && x.due <= s.t)) return '约期到了';
    if (s.t - d.lastAsk >= (everyYears || 8) * C().daysPerYear) return '隔了些年';
    return '';
  };

  // 问过 AI 了（不管成没成）：记下时刻和所在，免得接着每步都问
  Dir.asked = (s) => { const d = Dir.state(s); d.lastAsk = s.t; d.lastPlace = me(s).locationId; };

  /* ---------- 给 AI 的打包 ---------- */
  const SYSTEM_HEAD = [
    '你就是这位修士本人，正在过自己的一生。玩家只在旁观，由你按自己的性格、本心和志向决定接下来做什么。只输出一个 JSON 对象，不要别的文字。',
  ];
  const lifeLine = (s) => {
    const p = me(s), d = Dir.state(s), per = persona(s);
    return '本心：' + per.name + '（' + per.desc + '）' + (d.aim ? '；志向：' + d.aim : '') + '。性格：' + ((p.traits || []).join('、') || '平常') + '。年 ' + P().age(s, p) + '，余寿约 ' + Math.floor(P().lifespanLeft(s, p)) + ' 年。';
  };
  const suggestText = (s, sug, acts) => {
    if (!sug) return '';
    if (sug.plan) return '按常理的下一步：' + sug.plan.say + '。';
    const i = acts.findIndex((a) => a.type === sug.act.type && ['days', 'to', 'npc', 'item', 'tech', 'fid', 'gid', 'n', 'path', 'zf', 'hall', 'coin', 'until'].every((k) => a[k] === sug.act[k]));
    return '按常理的下一步：' + (i >= 0 ? 'a' + (i + 1) + '（' + acts[i].label + '）' : sug.act.label || sug.act.type) + '。';
  };
  Dir.job = (s) => {
    const f = Intent().facts(s);
    const rs = Dir.rumors(s, 3);
    const sug = Dir.local(s);
    const rText = rs.length ? '近来的传闻（可插手）：\n' + rs.map((r, i) => 'r' + (i + 1) + '：' + r.text + '（做法：' + r.plans.map((pl) => pl.say).join(' / ') + '）').join('\n') : '';
    const system = SYSTEM_HEAD.concat([
      '格式：{"think":"一句心声","steps":[步骤…]}；想插手某桩传闻时回 {"think":"一句心声","rumor":"r1","how":"做法原文"}。',
      'think 是你此刻心里的一句话，第一人称“我”，不超过四十字，不写数字，只用事实里出现的名字。',
    ], Intent().STEP_RULES, [
      '寿元有限：闭关修炼是正道，但不必一辈子只闭关；修为圆满就去冲关，卡关缺东西就去找来路；重伤先养伤。',
      '按本心行事：好管闲事的常插手传闻，爱游历的常出门，求道的少管闲事。拿不定主意就照“按常理的下一步”。',
    ]).join('\n');
    const facts = f.text + '\n' + lifeLine(s) + (rText ? '\n' + rText : '');
    return {
      kind: 'director', facts, acts: f.acts, rumors: rs, suggest: sug, input: '', maxTokens: 500,
      messages: [{ role: 'system', content: system }, { role: 'user', content: '事实：\n' + facts + '\n' + suggestText(s, sug, f.acts) + '\n\n你接下来做什么？' }],
    };
  };
  const cleanThink = (s, t, facts) => {
    if (typeof t !== 'string') return '';
    const x = Prop().tidy(t).replace(/\s+/g, '').slice(0, 60);
    return x && !Prop().checkText(s, x, facts, { maxLen: 60 }) ? x : '';
  };
  // 返回 { ok, choice } | { ok:false, why }；choice 和 Dir.local 的形状一样
  Dir.parse = (s, job, raw) => {
    const j = Prop().parseJSON(raw);
    if (!j.ok) return { ok: false, why: j.error };
    const v = j.value || {};
    const why = cleanThink(s, v.think, job.facts);
    if (v.rumor !== undefined) {
      const m = /^r?(\d)$/.exec(String(v.rumor).trim());
      const r = m && job.rumors[Number(m[1]) - 1];
      if (!r) return { ok: false, why: '没有传闻 ' + v.rumor };
      const how = String(v.how || '');
      const pl = r.plans.find((x) => how && (x.say === how || how.includes(x.say) || x.say.includes(how))) || r.plans[0];
      return { ok: true, choice: { plan: Object.assign({}, pl, { via: 'director' }), why, seen: [r.hid], via: 'ai' } };
    }
    const rest = {};
    for (const k of ['steps', 'ask', 'cannot']) if (v[k] !== undefined) rest[k] = v[k];
    if (rest.ask || rest.cannot) return { ok: false, why: '没拿定主意' };
    const r = Intent().parse(s, job, JSON.stringify(rest));
    if (!r.ok) return { ok: false, why: r.why };
    if (!r.steps) return { ok: false, why: '没有步骤' };
    const say = why || (r.say || '');
    return { ok: true, choice: { plan: { say, steps: r.steps, via: 'director' }, why, seen: job.rumors.map((x) => x.hid), via: 'ai' } };
  };

  Dir.eventJob = (s) => {
    const v = FX.Game.pendingEvents(s)[0];
    if (!v) return null;
    const av = v.options.filter((o) => o.available);
    const f = Intent().facts(s);
    const evText = '眼前的事「' + v.name + '」：' + v.text + (v.causes.length ? '\n起因：' + v.causes.join('；') : '') + '\n可选（id｜做法｜代价｜风险｜成算）：\n' +
      av.map((o) => [o.id, o.label, o.cost, o.risk, o.chance && typeof o.chance.chance === 'number' ? o.chance.chance + '%' : '—'].join('｜')).join('\n');
    const facts = f.text + '\n' + lifeLine(s) + '\n' + evText;
    const sug = Dir.eventLocal(s);
    return {
      kind: 'director_event', facts, options: av, suggest: sug, maxTokens: 200,
      messages: [
        { role: 'system', content: SYSTEM_HEAD.concat(['格式：{"id":"选项 id","think":"一句心声"}。think 第一人称“我”，不超过四十字，不写数字，只用事实里出现的名字。', '成败由规则掷骰，你只管拿主意；按本心和性格，惜命还是拼一把都可以。']).join('\n') },
        { role: 'user', content: '事实：\n' + facts + (sug ? '\n按常理：选 ' + sug.id + '。' : '') + '\n\n你怎么办？' },
      ],
    };
  };
  Dir.parseEvent = (s, job, raw) => {
    const j = Prop().parseJSON(raw);
    if (!j.ok) return { ok: false, why: j.error };
    const v = j.value || {};
    const o = job.options.find((x) => x.id === String(v.id || '').trim());
    if (!o) return { ok: false, why: '没有选项「' + v.id + '」' };
    return { ok: true, choice: { id: o.id, label: o.label, why: cleanThink(s, v.think, job.facts), via: 'ai' } };
  };

  /* ---------- 执行一步 ----------
   * choice 来自 Dir.local / Dir.parse；返回 { ok, label, text, error }
   * 心声记进 aiLog（kind 'dir'）：{ out: 心声, label: 做了什么, via: ai|local, hid: 当时的纪事位置 } */
  Dir.note = (s, label, why, via, force) => {
    const d = Dir.state(s);
    d.n++;
    const last = Prop().latest(s, 'dir');
    if (!force && via === 'local' && last && last.via === 'local' && last.label === label) return false; // 照旧闭关就不重复记
    Prop().record(s, 'dir', 'd:' + s.t + ':' + d.n, why || '', { label, via, hid: 'h' + s.nextHistId });
    return true;
  };
  Dir.exec = (s, choice) => {
    const d = Dir.state(s);
    if (!choice) return { ok: false, error: '没有可做的事' };
    markSeen(s, choice.seen || []);
    let r, label;
    if (choice.plan) {
      label = choice.plan.say || '依计行事';
      Dir.note(s, label, choice.why, choice.via, true);
      const x = FX.Game.intent.exec(s, choice.plan);
      r = { ok: x.done > 0 || s.pending.length > 0 || !!s.ended, text: x.texts.join('；'), error: x.stopped, partial: x.stopped };
    } else {
      const a = choice.act;
      label = a.label || (a.type === 'buy' ? '买' + W().itemName(a.item) : a.type === 'sell' ? '卖' + W().itemName(a.item) : a.type);
      Dir.note(s, label, choice.why, choice.via, a.type === 'breakthrough');
      r = FX.Game.act(s, a);
    }
    return Object.assign({ label }, r);
  };
  Dir.choose = (s, choice) => {
    const v = FX.Game.pendingEvents(s)[0];
    if (!v || !choice) return { ok: false, error: '眼前没有事' };
    Dir.note(s, v.name + '：' + choice.label, choice.why, choice.via, true);
    return FX.Game.choose(s, v.id, choice.id);
  };
  // 不问 AI，按本地策略走一步（事件或行动）；测试与“不用 AI”时用
  Dir.stepLocal = (s) => {
    if (s.ended) return { ok: false, error: '这一生已经结束' };
    if (s.pending.length) return Dir.choose(s, Dir.eventLocal(s));
    const c = Dir.local(s);
    const r = Dir.exec(s, c);
    // 走不通（例如货架刚卖空）就闭关一年，免得原地打转
    if (!r.ok) { const a = Act().list(s).find((x) => x.ok && x.type === 'cultivate' && !x.coin && x.days === 360) || Act().list(s).find((x) => x.ok && (x.type === 'rest' || x.type === 'cultivate')); if (a) return Object.assign({ fallback: true }, FX.Game.act(s, a)); }
    return r;
  };

  // 导演页的时间线：亲历的事、要紧的传闻、心声，按时间排（新的在前）
  // 心声记着当时的纪事位置 hid，排在那以后的第一条纪事前面
  const hnum = (id) => Number(String(id).slice(1)) || 0;
  Dir.timeline = (s, n) => {
    const notes = (s.aiLog || []).filter((r) => r.kind === 'dir').sort((a, b) => hnum(a.hid) - hnum(b.hid));
    const hs = s.history.filter((e) => e.pov || e.severity >= 3).slice(-(n || 80));
    const first = hs.length ? hnum(hs[0].id) : Infinity;
    const out = [];
    let i = 0;
    while (i < notes.length && hnum(notes[i].hid) < first) i++;
    const dn = (r) => ({ kind: 'dir', t: r.t, label: r.label, text: r.out, via: r.via });
    // 按“一个念头 + 它引出的事”分组：新的组在前，组里念头在前、事情新的在前，读起来先知道为什么、再看结果
    const groups = [{ head: null, items: [] }];
    for (const e of hs) {
      while (i < notes.length && hnum(notes[i].hid) <= hnum(e.id)) groups.push({ head: dn(notes[i++]), items: [] });
      groups[groups.length - 1].items.push({ kind: 'h', t: e.t, id: e.id, pov: e.pov, text: H().text(e), sev: e.severity });
    }
    while (i < notes.length) groups.push({ head: dn(notes[i++]), items: [] });
    for (const g of groups.reverse()) { if (g.head) out.push(g.head); out.push(...g.items.reverse()); }
    return out;
  };

  FX.Dir = Dir;
})(typeof globalThis !== 'undefined' ? globalThis : this);
