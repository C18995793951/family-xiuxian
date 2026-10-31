/* ============================================================
 * sim —— 开局、时间推进（按天，跨月/跨年结算世界）、NPC 逐年模拟、结局、自检
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;
  const W = () => FX.World;
  const CU = () => FX.CU;

  const S = {};

  S.syncYear = (s) => { s.year = FX.T.year(s.t); };

  /* ---------- 开局 ---------- */
  S.newGame = (opts) => {
    const cf = C();
    opts = opts || {};
    const origin = cf.origins[opts.origin] ? opts.origin : 'loose';
    const O = cf.origins[origin];
    const seed = String(opts.seed !== undefined && opts.seed !== '' ? opts.seed : 'fx-seed');
    const s = {
      schemaVersion: cf.schemaVersion,
      gameVersion: cf.gameVersion,
      seed,
      origin,
      rng: R.seedState(seed),
      t: cf.startYear * cf.daysPerYear,
      year: cf.startYear,
      nextId: 1,
      nextHistId: 1,
      places: {},
      factions: {},
      people: {},
      relations: [],
      markets: {},
      pending: [],
      eventQueue: [],
      history: [],
      records: { firsts: {} },
      usedNames: {},
      player: null,
      aiLog: [], // 阶段 3：AI 提案原文与验证结果，读档重放时用记录而不重新调用
      ended: null,
    };
    const r = s.rng;
    const surname = (opts.surname || '').trim().slice(0, 2) || R.pick(r, origin === 'clan' ? cf.names.clanSurnames : cf.names.surnames);
    W().genPlaces(s, { clanSurname: origin === 'clan' ? surname : null });
    W().genFactions(s);
    W().genPeople(s);
    W().genOuter(s);
    W().genNotables(s);
    FX.Saga.init(s);

    // 主角
    let place, faction = null;
    const places = Object.values(s.places);
    if (O.faction) {
      faction = Object.values(s.factions).find((f) => (O.factionKey ? f.key === O.factionKey : f.type === O.faction) && (O.faction !== 'clan' || s.places[f.seatId].surname === surname));
      place = s.places[faction.seatId];
    } else place = places.find((p) => p.name === O.placeName) || R.pick(r, places.filter((p) => p.type === O.place));
    const sex = opts.sex === 'F' || opts.sex === 'M' ? opts.sex : R.chance(r, 0.5) ? 'M' : 'F';
    const given = (opts.given || '').trim().slice(0, 3);
    const p = P().create(s, {
      name: given ? surname + given : null, surname, sex, birthYear: s.year - cf.life.adultAge,
      realm: Object.assign({}, O.realm), aptitude: Math.round(U.clamp(R.normal(r, cf.aptitude.playerMean, cf.aptitude.sd), 10, cf.aptitude.max)),
      techniqueId: O.technique, locationId: place.id, factionId: faction ? faction.id : null, role: faction ? 'member' : 'loose',
    });
    s.player = {
      id: p.id,
      stone: O.stone,
      inv: Object.assign({}, O.inv),
      manuals: O.technique ? [O.technique] : [],
      qijuUntil: 0,
      visited: [place.id],
      lastFortuneT: -1e9,
      merit: 0,        // 道功：本门本族功德房记下的功劳
      joinTried: {},   // 各宗门今年是否已求过
      submitted: [],   // 献过抄本的功法
      orders: [],      // 托墟市代寻、尚未送到的货
      autoPill: true,  // 修炼时自动续服中孚丹
      dongfu: null,    // 洞府所在地点
      dongtian: null,  // 洞天所在地点（元神以后）
      post: 0,         // 已告知过的门中职位
      tuijuDeclined: null,
      stats: { cultivateDays: 0, explores: 0, exploreNothing: 0, fights: 0, wins: 0, seek: 0, seekNoGain: 0, fortunes: 0, actions: 0 },
    };
    if (faction) {
      faction.relToPlayer = 20;
      if (faction.leaderId) P().adjustRelation(s, p.id, faction.leaderId, 10, faction.type === 'clan' ? '族人' : '同门');
      if (faction.type === 'sect') {
        // 同门里先认得一两个人
        const mates = P().living(s).filter((q) => q.factionId === faction.id && q.id !== faction.leaderId && q.id !== p.id).slice(0, 2);
        for (const q of mates) P().adjustRelation(s, p.id, q.id, 8, '同门');
      }
    }
    for (const pl of places) if (W().hasMarket(s, pl.id)) W().refreshMarket(s, pl.id);
    H().add(s, {
      type: 'start', tags: ['开局'], actors: [p.id], places: [place.id], key: 'start', pov: true, severity: 3,
      params: { name: p.name, origin: O.name + (faction ? '（' + faction.name + '）' : ''), age: cf.life.adultAge, realm: P().realmName(p), place: place.name },
    });
    S.check(s);
    return s;
  };

  /* ---------- 时间推进 ----------
   * mode：cultivate 修炼（积修为、闭关可被打扰）/ rest 静养（伤愈加倍）/ travel / other
   * 逐段推进到月末，跨月结算主角，跨年结算整个世界。返回实际用掉的天数与修为增长。 */
  S.passDays = (s, days, mode, opts) => {
    opts = opts || {};
    const p = P().player(s);
    const cf = C();
    let left = Math.max(0, Math.floor(days));
    let used = 0, gained = 0, interrupted = false, pills = 0, saga = null;
    while (left > 0 && P().alive(p) && !s.pending.length && !s.ended) {
      const toMonthEnd = cf.daysPerMonth - (s.t % cf.daysPerMonth);
      const step = Math.min(left, toMonthEnd);
      // 主角在这段时间里的变化
      const healMult = mode === 'rest' ? cf.life.restHealMult : 1;
      if (P().heal(p, step * healMult)) H().add(s, { type: 'health', tags: ['伤愈'], actors: [p.id], key: 'injury_heal', pov: true, params: { name: p.name }, severity: 1 });
      if (mode === 'cultivate') {
        // 药力过了就自动续服一颗中孚丹（行囊里可以关掉）
        // 修为已经圆满、再修也不涨的时候不吃
        if (s.player.autoPill !== false && p.realm.major >= 2 && s.player.qijuUntil <= s.t && (s.player.inv.qiju || 0) > 0 && !(P().isFull(p) && CU().capped(p))) {
          s.player.inv.qiju--;
          s.player.qijuUntil = s.t + cf.cultivation.qijuDays;
          pills++;
        }
        const rate = CU().breakdown(s, p, { pill: s.player.qijuUntil > s.t, coin: !!opts.coin }).total;
        if (P().isFull(p) && CU().capped(p)) p.fullDays += step;
        else gained += CU().addProgress(s, p, (rate * step) / cf.daysPerYear);
        s.player.stats.cultivateDays += step;
      }
      s.t += step; used += step; left -= step;
      S.syncYear(s);
      if (s.t % cf.daysPerMonth === 0) {
        if (S.monthly(s, mode, opts)) interrupted = true;
        // 闭关中起了和你沾边的天下大事：出关去看看，免得一闭关就错过
        if (s.t % cf.daysPerYear === 0) { const w = S.yearly(s); if (w && mode === 'cultivate' && opts.interruptible && left > 0) { interrupted = true; saga = w; } }
      }
      if (interrupted) break;
      // 闭关到圆满：修满了就出关，不白耗寿元
      if (opts.untilFull && mode === 'cultivate' && P().isFull(p) && CU().capped(p)) break;
    }
    S.checkEnd(s);
    return { used, gained: Math.round(gained * 10) / 10, interrupted: interrupted || (used < days && !!s.pending.length), pills, saga };
  };

  // 月末：主角的重伤风险、闭关被打扰。返回是否打断当前行动
  S.monthly = (s, mode, opts) => {
    const p = P().player(s);
    const cf = C();
    // 洞玄三重温养，凝丹内药渐次凝成
    FX.Yao.grow(s, cf.daysPerMonth);
    if (p.health.state === 'heavy') {
      // 重伤时行囊里有小白阳丹就自动服一颗（跟随“自动续服”开关）
      if (s.player.autoPill !== false && (s.player.inv.heal || 0) > 0) {
        s.player.inv.heal--;
        P().heal(p, cf.life.healPillDays);
        H().add(s, { type: 'health', tags: ['服药'], actors: [p.id], key: 'heal_auto', pov: true, params: { name: p.name, item: cf.items.heal.name }, severity: 1 });
      }
      // 自家洞天自成天地、洞府有阵法温养，伤势不容易恶化
      const here = s.places[p.locationId];
      const safe = s.player.dongtian === p.locationId ? cf.life.heavyDongtianMult : FX.Saga.isDongfu(s, p, here.id) ? cf.life.heavyDongfuMult : 1;
      if (p.health.state === 'heavy' && R.chance(s.rng, cf.life.heavyInjuryDeathYear * safe / cf.monthsPerYear)) {
        P().kill(s, p, '重伤不治', [], { key: 'injury' });
        return true;
      }
    }
    FX.Act.deliverOrders(s);
    FX.Ev.processQueue(s);
    if (s.pending.length) return true;
    if (mode === 'cultivate' && opts.interruptible) {
      const place = s.places[p.locationId];
      // 自家洞府有禁制护着；自家洞天自成天地，外人进不来
      const df = s.player.dongtian === place.id ? 0 : FX.Saga.isDongfu(s, p, place.id) ? cf.dongfu.disturbMult : 1;
      if (R.chance(s.rng, cf.actions.seclusionDisturb * (place.danger + 0.5) * df)) {
        if (FX.Act.disturb(s, place)) return true;
      }
    }
    return false;
  };

  // 年末：世界结算
  S.yearly = (s) => {
    const cf = C();
    const pl = P().player(s);
    // 主角：寿元、俸禄
    if (P().alive(pl) && P().lifespanLeft(s, pl) <= 0) P().kill(s, pl, '寿元耗尽', [], { key: 'lifespan' });
    FX.Sect.payStipend(s);
    const woke = FX.Saga.yearly(s);
    // NPC：寿元、意外、伤愈、修炼、走动（按 id 顺序，保证可复现）
    const npcs = P().living(s).filter((p) => p.id !== pl.id).sort((a, b) => (Number(a.id.slice(1)) - Number(b.id.slice(1))));
    for (const p of npcs) {
      if (P().lifespanLeft(s, p) <= 0) { P().kill(s, p, '寿元耗尽，坐化', [], {}); continue; }
      const place = s.places[p.locationId];
      if (R.chance(s.rng, cf.life.npcAccident * (1 + place.danger * 0.5))) { P().kill(s, p, '外出遇险身亡', [], {}); continue; }
      P().heal(p, cf.daysPerYear);
      CU().npcYear(s, p);
      if (!p.factionId && P().alive(p) && R.chance(s.rng, cf.world.looseMoveChance)) {
        const to = R.pick(s.rng, place.links);
        if (to && W().linkOpen(p, to)) p.locationId = to.to;
      }
    }
    for (const id in s.markets) W().refreshMarket(s, id);
    W().replenish(s);
    FX.Ev.prune(s);
    S.check(s);
    return woke;
  };

  /* ---------- 结局 ---------- */
  S.checkEnd = (s) => {
    if (s.ended) return true;
    const p = P().player(s);
    if (P().alive(p)) return false;
    s.pending = [];
    const hid = H().add(s, { type: 'ending', tags: ['结局'], actors: [p.id], key: 'ending', pov: true, params: { name: p.name, what: `${p.deathCause}，享年 ${p.deathYear - p.birthYear}，终于${P().realmName(p)}` }, severity: 5, causeIds: p.deathHist ? [p.deathHist] : [] });
    s.ended = { type: 'death', t: s.t, hid, what: p.deathCause };
    return true;
  };

  S.rating = (s) => {
    const p = P().player(s);
    const RT = C().rating;
    const parts = [
      { label: '最高境界', value: p.peakRank * RT.perRank },
      { label: '道基与紫府', value: (p.daoji === 3 ? 2 : 0) + (p.yixiang === 3 ? 3 : p.yixiang === 2 ? 1 : 0) },
      { label: '足迹（' + s.player.visited.length + ' 处）', value: Math.min(RT.extraMax, Math.floor(s.player.visited.length / 2)) },
      { label: '斗法胜场', value: Math.min(RT.extraMax, Math.floor(s.player.stats.wins / 3)) },
      { label: '知交', value: Math.min(RT.extraMax, P().relationsOf(s, p.id).filter((r) => r.type === 'close').length * 2) },
    ];
    const total = Math.min(100, parts.reduce((a, x) => a + x.value, 0));
    const g = C().rating.grades.find((x) => total >= x[0]);
    return { total, grade: g[1], title: g[2], parts };
  };

  /* ---------- 自检（每年与读档时运行；失败即抛错）---------- */
  S.check = (s) => {
    const fail = (m) => { throw new Error(m); };
    if (!s.player || !s.people[s.player.id]) fail('主角不存在');
    if (s.year !== FX.T.year(s.t)) fail('年份与天数不一致');
    for (const p of Object.values(s.people)) {
      if (!s.places[p.locationId]) fail(p.name + ' 所在地点不存在');
      if (p.factionId && !s.factions[p.factionId]) fail(p.name + ' 所属势力不存在');
      if (p.progress < 0 || !isFinite(p.progress)) fail(p.name + ' 修为异常');
      if (p.status === 'dead' && p.deathYear === null) fail(p.name + ' 已故却无卒年');
    }
    for (const r of s.relations) if (!s.people[r.a] || !s.people[r.b]) fail('关系引用了不存在的人物');
    for (const f of Object.values(s.factions)) if (!s.places[f.seatId]) fail(f.name + ' 驻地不存在');
    for (const pl of Object.values(s.places)) for (const l of pl.links) if (!s.places[l.to]) fail(pl.name + ' 的道路通向不存在的地点');
    if (!(s.player.stone >= 0) || !Number.isInteger(s.player.stone)) fail('符钱数量异常：' + s.player.stone);
    if (!(s.player.merit >= 0) || !Number.isInteger(s.player.merit)) fail('道功数量异常：' + s.player.merit);
    for (const k in s.player.inv) if (!(s.player.inv[k] >= 0) || !Number.isInteger(s.player.inv[k])) fail('物品数量异常：' + k);
    for (const e of s.pending) if (!FX.Ev.valid(s, e.bound)) fail('待决事件引用失效');
    return true;
  };

  FX.Sim = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
