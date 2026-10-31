/* ============================================================
 * sect —— 宗门与家族：拜入、长老房传功与库藏、功德房记道功、奉事房差事与符诏、年俸
 * 《仙业》里玄真派分五房：根本法门向长老房请授即可；道术、外药要靠给宗门立功，
 * 由功德房记下道功，再去长老房换取。家族照此办理，只是库藏薄些。
 * 行动一律经 Act.list 给出（这里的 Sect.list 由它调用），结算在 Act.DO 里。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;
  const T = () => FX.T;
  const Sim = () => FX.Sim;
  const Act = () => FX.Act;

  const Sect = {};
  const me = (s) => P().player(s);
  const HS = () => C().house;
  const M = () => C().house.meritName;

  /* ---------- 查询 ---------- */
  // 势力的设定：宗门查 factionDefs，家族用 factionTypes 里的通用设置
  Sect.def = (f) => (f.key && C().factionDefs.find((d) => d.key === f.key)) || C().factionTypes[f.type] || {};
  Sect.hasHouse = (f) => !!f && (f.type === 'sect' || f.type === 'clan');
  Sect.mine = (s) => { const p = me(s); const f = p.factionId ? s.factions[p.factionId] : null; return Sect.hasHouse(f) ? f : null; };
  Sect.library = (f) => Sect.def(f).library || [];
  Sect.store = (f) => HS().store.filter((x) => (f.type === 'clan' ? x.clan : !x.minTier || f.tier >= x.minTier));
  Sect.atSeat = (s, f) => me(s).locationId === f.seatId;
  Sect.awayReason = (s, f) => '要回到' + s.places[f.seatId].name + '才能办';
  Sect.taskMerit = (p) => HS().taskMerit[p.realm.major] || 0;
  Sect.missionMerit = (p) => Sect.taskMerit(p) * HS().mission.meritMult;
  // 献上道书抄本能记多少道功（本门已有的、献过的不算）
  Sect.manualMerit = (s, f, tech) => {
    if (Sect.library(f).some((e) => e.tech === tech) || s.player.submitted.includes(tech)) return 0;
    return Math.floor(C().techniques[tech].price / HS().manualRate);
  };

  // 每年的俸禄
  Sect.stipend = (s, f) => {
    const p = me(s);
    const st = HS().stipend[f.type];
    if (!st) return { stone: 0, qiju: 0 };
    const stone = Math.round((st.stone[p.realm.major] || 0) * (st.tierMult ? st.tierMult[f.tier] || 1 : 1));
    return { stone, qiju: p.realm.major >= 2 ? st.qiju || 0 : 0 };
  };
  Sect.payStipend = (s) => {
    const p = me(s), f = Sect.mine(s);
    if (!f || !P().alive(p)) return;
    const st = Sect.stipend(s, f);
    if (!st.stone && !st.qiju) return;
    s.player.stone += st.stone;
    if (st.qiju) s.player.inv.qiju = (s.player.inv.qiju || 0) + st.qiju;
    const what = ['符钱 ' + st.stone].concat(st.qiju ? [C().items.qiju.name + '×' + st.qiju] : []).join('、');
    H().add(s, { type: 'stipend', tags: ['俸禄'], actors: [p.id], factions: [f.id], key: 'stipend', pov: true, params: { faction: f.name, what }, severity: 1 });
  };

  /* ---------- 拜入 ---------- */
  Sect.joinChance = (s, f) => {
    const p = me(s), j = Sect.def(f).join || {};
    const parts = [{ label: '基础', value: j.base || 0 }, { label: '资质 ' + p.aptitude, value: U.round1((p.aptitude - 50) * 0.5) }];
    if (p.realm.major >= 2) parts.push({ label: P().realmName(p), value: Math.min(20, (P().realmRank(p) - 1) * 2) });
    const rel = f.leaderId ? P().relValue(s, p.id, f.leaderId) : 0;
    if (rel) parts.push({ label: '与掌门的交情', value: Math.round(U.clamp(rel / 5, -10, 10)) });
    // 一回不成就明年再来：每求过一回，诚意 +10
    const tried = s.player.joinTried[f.id];
    if (tried && tried.fails) parts.push({ label: '已求过 ' + tried.fails + ' 回，心诚', value: Math.min(30, tried.fails * 10) });
    return { chance: Math.round(U.clamp(parts.reduce((a, x) => a + x.value, 0), 5, 90)), parts };
  };
  // 能否求入此门；返回 true 或不能的原因
  Sect.canJoin = (s, f) => {
    const p = me(s), j = Sect.def(f).join;
    if (!j) return '不收外人';
    if (j.closed) return j.closed;
    if (p.factionId) return '你已是' + s.factions[p.factionId].name + '中人';
    if (p.realm.major < j.minMajor) return '至少要' + C().realms.names[j.minMajor] + '才收';
    if (j.maxAge && P().age(s, p) > j.maxAge) return '年过 ' + j.maxAge + '，不收了';
    if (s.player.joinTried[f.id] && s.player.joinTried[f.id].year === s.year) return '今年已求过一回，明年再来';
    if (!Sect.atSeat(s, f)) return Sect.awayReason(s, f);
    return true;
  };

  /* ---------- 行动清单（由 Act.list 调用）----------
   * group「宗门」：拜入、符诏，放在“此刻”页；group「库藏」：请授、兑换、上交，放在宗门页。
   * 库藏类不在山门时也列出来（不可做，并写明原因），好让玩家知道回山能办什么。 */
  Sect.list = (s, add) => {
    const p = me(s), cf = C(), place = s.places[p.locationId];
    const f = Sect.mine(s);
    if (!p.factionId && place.factionId) {
      const g = s.factions[place.factionId];
      if (g.type === 'sect' && Sect.def(g).join) {
        const can = Sect.canJoin(s, g);
        add({ type: 'join', fid: g.id, days: HS().joinDays, label: '求入' + g.name + '（' + Sect.joinChance(s, g).chance + '%）', group: '宗门', ok: can === true, reason: can === true ? '' : can });
      }
    }
    if (!f) return;
    const at = Sect.atSeat(s, f);
    const away = at ? '' : Sect.awayReason(s, f);
    // 符诏：除妖
    const mm = Sect.missionMerit(p);
    const hurt = p.health.state === 'heavy' ? '重伤未愈' : '';
    if (mm) add({ type: 'mission', days: HS().mission.days, label: (f.type === 'clan' ? '替家族除妖' : '领符诏除妖') + ' ' + T().dur(HS().mission.days) + '（胜了记 ' + mm + ' ' + M() + '）', group: '宗门', ok: at && !hurt, reason: away || hurt });
    // 长老房请授功法
    for (const e of Sect.library(f)) {
      if (s.player.manuals.includes(e.tech)) continue;
      const t = cf.techniques[e.tech], cost = e.merit || 0;
      const why = e.minMajor && p.realm.major < e.minMajor ? '要到' + cf.realms.names[e.minMajor] + '才传' : cost > s.player.merit ? M() + '不够（需 ' + cost + '）' : away;
      add({ type: 'sect_learn', tech: e.tech, days: HS().learnDays, cost, label: (cost ? '以 ' + cost + ' ' + M() + '换《' : '请授《') + t.name + '》', group: '库藏', ok: !why, reason: why });
    }
    // 库藏兑换
    for (const e of Sect.store(f)) {
      const why = e.minMajor && p.realm.major < e.minMajor ? '要到' + cf.realms.names[e.minMajor] + '才换给你' : e.merit > s.player.merit ? M() + '不够（需 ' + e.merit + '）' : away;
      add({ type: 'redeem', item: e.item, days: 0, cost: e.merit, label: '以 ' + e.merit + ' ' + M() + '换' + cf.items[e.item].name, group: '库藏', ok: !why, reason: why });
    }
    // 功德房：上交妖物内丹、外药，献上本门没有的道书抄本
    for (const k in HS().submit) if (s.player.inv[k] > 0) {
      const n = s.player.inv[k];
      add({ type: 'submit', item: k, days: 0, gain: n * HS().submit[k], label: '上交' + cf.items[k].name + '×' + n + '（记 ' + n * HS().submit[k] + ' ' + M() + '）', group: '库藏', ok: at, reason: away });
    }
    for (const t of s.player.manuals) {
      const g = Sect.manualMerit(s, f, t);
      if (g > 0) add({ type: 'submit', tech: t, days: 0, gain: g, label: '献上《' + cf.techniques[t].name + '》抄本（记 ' + g + ' ' + M() + '）', group: '库藏', ok: at, reason: away });
    }
  };

  /* ---------- 结算 ---------- */
  const DO = {};

  DO.join = (s, a) => {
    const p = me(s), f = s.factions[a.fid];
    const ch = Sect.joinChance(s, f);
    Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    if (s.pending.length) return { text: '还没见到人，先出了变故', interrupted: true };
    const ok = R.next(s.rng) * 100 < ch.chance;
    const tried = s.player.joinTried[f.id] || { year: 0, fails: 0 };
    s.player.joinTried[f.id] = { year: s.year, fails: tried.fails + (ok ? 0 : 1) };
    Act().seek(s, ok);
    if (!ok) {
      H().add(s, { type: 'join', tags: ['宗门'], actors: [p.id], factions: [f.id], places: [f.seatId], key: 'join_fail', pov: true, severity: 2, params: { name: p.name, faction: f.name, chance: ch.chance } });
      return { text: f.name + '没有收你（' + ch.chance + '%）' };
    }
    p.factionId = f.id;
    p.role = 'member';
    f.relToPlayer = Math.max(f.relToPlayer, 10);
    if (f.leaderId && P().alive(s.people[f.leaderId])) P().adjustRelation(s, p.id, f.leaderId, 8, '同门');
    const hid = H().add(s, { type: 'join', tags: ['宗门'], actors: [p.id], factions: [f.id], places: [f.seatId], key: 'join_ok', pov: true, severity: 3, params: { name: p.name, faction: f.name, chance: ch.chance } });
    H().markFirst(s, 'join', hid);
    return { text: '拜入' + f.name + '（' + ch.chance + '%）' };
  };

  DO.sect_learn = (s, a) => {
    const p = me(s), f = Sect.mine(s);
    Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    s.player.merit -= a.cost;
    if (!s.player.manuals.includes(a.tech)) s.player.manuals.push(a.tech);
    const t = C().techniques[a.tech];
    H().add(s, { type: 'learn', tags: ['功法', '宗门'], actors: [p.id], factions: [f.id], key: a.cost ? 'sect_learn_merit' : 'sect_learn', pov: true, severity: 2, params: { name: p.name, faction: f.name, tech: t.name, cost: a.cost, merit: M() } });
    const hint = t.kind === 'lianqi' && p.techniqueId !== a.tech ? '，可去行囊里研习' : '';
    return { text: '得了《' + t.name + '》' + hint };
  };

  DO.redeem = (s, a) => {
    const p = me(s), f = Sect.mine(s);
    s.player.merit -= a.cost;
    s.player.inv[a.item] = (s.player.inv[a.item] || 0) + 1;
    H().add(s, { type: 'redeem', tags: ['宗门'], actors: [p.id], factions: [f.id], key: 'redeem', pov: true, severity: 1, params: { name: p.name, faction: f.name, item: C().items[a.item].name, cost: a.cost, merit: M() } });
    return { text: '换得' + C().items[a.item].name };
  };

  DO.submit = (s, a) => {
    const p = me(s), f = Sect.mine(s);
    let what;
    if (a.tech) { s.player.submitted.push(a.tech); what = '《' + C().techniques[a.tech].name + '》抄本'; }
    else { what = C().items[a.item].name + '×' + s.player.inv[a.item]; s.player.inv[a.item] = 0; }
    s.player.merit += a.gain;
    H().add(s, { type: 'submit', tags: ['宗门'], actors: [p.id], factions: [f.id], key: 'submit', pov: true, severity: 1, params: { name: p.name, faction: f.name, what, gain: a.gain, merit: M() } });
    return { text: '记 ' + a.gain + ' ' + M() };
  };

  // 符诏：赶到附近的荒野除一头妖物。对手按你的战力定；打赢才记道功，逃了就算没办成
  DO.mission = (s, a) => {
    const p = me(s), f = Sect.mine(s), E = C().encounter, MS = HS().mission;
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    if (r.interrupted || s.pending.length) return { text: '还没动身就出了变故', interrupted: true };
    // 去离山门最近的几处荒野；筑基以后也会被派去险地
    const wild = (x) => x.type === 'wild' || (x.type === 'danger' && p.realm.major >= 3);
    const spots = Object.values(s.places).filter(wild).map((x) => ({ x, d: FX.World.route(s, f.seatId, x.id) })).filter((o) => o.d)
      .sort((a, b) => a.d.days - b.d.days || (a.x.id < b.x.id ? -1 : 1)).slice(0, 3);
    const spot = R.pick(s.rng, spots).x;
    const power = Math.round(P().power(s, p) * R.range(s.rng, MS.powerSwing[0], MS.powerSwing[1]) * 10) / 10;
    let d = 1;
    for (let i = 1; i < E.dangerPower.length; i++) if (Math.abs(E.dangerPower[i] - power) < Math.abs(E.dangerPower[d] - power)) d = i;
    const beast = R.pick(s.rng, FX.Combat.beastNames[d]);
    const why = f.type === 'clan' ? '族里托你除掉的那头' : '奉事房符诏上要除的那头';
    FX.Ev.spawn(s, 'BEAST', { place: spot.id, _beast: beast, _power: power, _danger: d, _why: why, _merit: Sect.missionMerit(p), _stone: R.int(s.rng, MS.stone[0], MS.stone[1]) }, []);
    return { text: '在' + spot.name + '找到了' + beast, interrupted: true };
  };

  Sect.DO = DO;
  FX.Sect = Sect;
})(typeof globalThis !== 'undefined' ? globalThis : this);
