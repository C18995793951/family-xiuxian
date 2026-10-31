/* ============================================================
 * world —— 世界数据库的生成：地点、道路、势力、人物、坊市
 * 世界骨架只由种子决定（可复现）；以后 AI 只能在此基础上补写来历与秘密。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;

  const W = {};

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // 同一前缀尽量不重复（免得出现“松涛山”“松涛原”“松涛峰”三处）
  function uniqueName(s, r, parts, used) {
    for (let i = 0; i < 40; i++) {
      const a = R.pick(r, parts.a);
      const n = a + R.pick(r, parts.b);
      if (!used[n] && (!used['a:' + a] || i >= 30)) { used[n] = 1; used['a:' + a] = 1; return n; }
    }
    const n = R.pick(r, parts.a) + R.pick(r, parts.b) + (Object.keys(used).length + 1);
    used[n] = 1;
    return n;
  }

  /* ---------- 地点与道路 ---------- */
  W.genPlaces = (s, opts) => {
    const r = s.rng, cw = C().world;
    const used = {};
    const cells = {};
    const list = [];
    // 容氏、童家在前，其余随机；修道家族出身的主角，本族排第一
    const base = C().names.clanSurnames.filter((x) => x !== opts.clanSurname);
    const clanSurnames = base.slice(0, 2).concat(R.shuffle(r, base.slice(2)));
    if (opts.clanSurname) clanSurnames.unshift(opts.clanSurname);
    let clanIdx = 0;
    for (const type of Object.keys(cw.placeTypes)) {
      const def = cw.placeTypes[type];
      for (let i = 0; i < def.count; i++) {
        let x = 0, y = 0;
        for (let k = 0; k < 200; k++) {
          x = R.int(r, 0, cw.gridW - 1); y = R.int(r, 0, cw.gridH - 1);
          if (cells[x + ',' + y]) continue;
          if (k < 150 && list.some((q) => Math.abs(q.x - x) + Math.abs(q.y - y) < 2)) continue;
          break;
        }
        cells[x + ',' + y] = 1;
        let name;
        if (type === 'clan') { const sn = clanSurnames[clanIdx++ % clanSurnames.length]; name = sn + R.pick(r, C().names.place.clan.b); used[name] = 1; }
        else if (def.fixed && def.fixed[i]) { name = def.fixed[i]; used[name] = 1; }
        else if (type === 'sect') name = 'sect' + i; // 宗门山门在 genFactions 里按宗门命名
        else name = uniqueName(s, r, C().names.place[type], used);
        const id = 'l' + (list.length + 1);
        list.push({
          id, name, type, x, y,
          qi: R.int(r, def.qi[0], def.qi[1]),
          attr: R.pick(r, C().attrs), // 此地灵气的属相
          danger: R.int(r, def.danger[0], def.danger[1]),
          factionId: null,
          surname: type === 'clan' ? name.replace(new RegExp('(' + C().names.place.clan.b.join('|') + ')$'), '') : null,
          links: [],
        });
      }
    }
    // 最小连通树（Prim），再按比例补几条近路
    const inTree = new Set([list[0].id]);
    const link = (a, b) => {
      if (a.links.some((l) => l.to === b.id)) return;
      const days = Math.max(2, Math.round(dist(a, b) * cw.daysPerUnit));
      a.links.push({ to: b.id, days });
      b.links.push({ to: a.id, days });
    };
    while (inTree.size < list.length) {
      let best = null;
      for (const a of list) {
        if (!inTree.has(a.id)) continue;
        for (const b of list) {
          if (inTree.has(b.id)) continue;
          const d = dist(a, b);
          if (!best || d < best.d || (d === best.d && b.id < best.b.id)) best = { a, b, d };
        }
      }
      link(best.a, best.b);
      inTree.add(best.b.id);
    }
    for (const a of list) {
      if (!R.chance(r, cw.linkExtra)) continue;
      const near = list.filter((b) => b !== a && !a.links.some((l) => l.to === b.id)).sort((p, q) => dist(a, p) - dist(a, q) || (p.id < q.id ? -1 : 1))[0];
      if (near && dist(a, near) <= 4.5) link(a, near);
    }
    for (const p of list) { p.links.sort((a, b) => (a.to < b.to ? -1 : 1)); s.places[p.id] = p; }
  };

  /* ---------- 东弥州腹地 ----------
   * 南域以北的中域、西域、东域、北域与东海：地点、道路固定，三家八派六宗与门人在此生成。
   * 新开局与旧存档迁移都调用它；与南域只有一条路相连，金丹以后才走得通。 */
  // 东弥州腹地：按 config.world.outer 补齐地点（以 key 认人，旧存档按旧地名认），刷新方位，重连道路，补齐三家大派
  W.genOuter = (s) => {
    const O = C().world.outer;
    for (const pl of Object.values(s.places)) if (!pl.region) pl.region = '南域';
    const byKey = {};
    for (const pl of Object.values(s.places)) {
      if (!pl.outer) continue;
      if (!pl.key && O.oldNames[pl.name]) pl.key = O.oldNames[pl.name];
      if (pl.key) byKey[pl.key] = pl;
    }
    let n = Object.keys(s.places).length;
    for (const d of O.places) {
      let pl = byKey[d.key];
      if (!pl) {
        let id = 'l' + ++n;
        while (s.places[id]) id = 'l' + ++n;
        pl = { id, factionId: null, surname: null, links: [], outer: true };
        s.places[id] = pl;
        byKey[d.key] = pl;
      }
      Object.assign(pl, { key: d.key, name: d.name, type: d.type, x: d.x, y: d.y, qi: d.qi, attr: d.attr, danger: d.danger, region: d.region, blurb: d.blurb || '' });
    }
    // 重连腹地的道路：先拆掉所有通往腹地的旧路，再照配置连上
    const outerIds = new Set(Object.values(byKey).map((x) => x.id));
    for (const pl of Object.values(s.places)) pl.links = outerIds.has(pl.id) ? [] : pl.links.filter((l) => !outerIds.has(l.to));
    // 关口：南域最北边、离中域最近的一处凡人国、墟市或荒野
    const south = Object.values(s.places).filter((x) => x.region === '南域' && ['city', 'town', 'wild'].includes(x.type));
    const zy = byKey[O.links[0][1]];
    byKey.gate = south.sort((a, b) => a.y - b.y || Math.abs(a.x - zy.x) - Math.abs(b.x - zy.x) || (a.id < b.id ? -1 : 1))[0];
    const cw = C().world;
    for (const [ka, kb] of O.links) {
      const a = byKey[ka], b = byKey[kb];
      const gate = ka === 'gate';
      const days = gate ? O.gate.days : Math.max(4, Math.round(dist(a, b) * cw.daysPerUnit));
      const l1 = { to: b.id, days }, l2 = { to: a.id, days };
      if (gate) { l1.minMajor = l2.minMajor = O.gate.minMajor; }
      a.links.push(l1); b.links.push(l2);
      a.links.sort((x, y) => (x.to < y.to ? -1 : 1)); b.links.sort((x, y) => (x.to < y.to ? -1 : 1));
    }
    let fn = Object.keys(s.factions).length;
    for (const def of C().factionDefs.filter((d) => d.outer)) {
      const seat = byKey[def.key];
      let f = Object.values(s.factions).find((x) => x.key === def.key);
      if (!f) {
        let id = 'f' + ++fn;
        while (s.factions[id]) id = 'f' + ++fn;
        f = { id, key: def.key, name: def.name, type: def.type, tier: def.tier, tech: def.tech || null, blurb: '', seatId: seat.id, leaderId: null, relToPlayer: 0 };
        s.factions[id] = f;
        seat.factionId = f.id;
        W.genMembers(s, f);
      }
      f.blurb = def.blurb || '';
      seat.factionId = f.id;
    }
    for (const pl of Object.values(byKey)) if (pl.outer && W.hasMarket(s, pl.id) && !(s.markets && s.markets[pl.id] && s.markets[pl.id].stock && s.markets[pl.id].stock.length)) W.refreshMarket(s, pl.id);
  };

  /* ---------- 原著人物 ----------
   * 只放配角，不放陈珩这样的主角，免得压过玩家。他们和别的 NPC 一样修炼、老去、陨落。 */
  W.genNotables = (s) => {
    const placeOf = (d) => {
      if (d.placeKey) return Object.values(s.places).find((x) => x.key === d.placeKey) || null;
      if (d.placeName) return Object.values(s.places).find((x) => x.name === d.placeName) || null;
      return null;
    };
    for (const d of C().notables) {
      if (Object.values(s.people).some((q) => q.notable === d.key)) continue;
      const f = d.faction ? Object.values(s.factions).find((x) => x.key === d.faction) : null;
      if (d.faction && !f) continue;
      const place = placeOf(d) || (f ? s.places[f.seatId] : null);
      if (!place) continue;
      const q = W.spawnNpc(s, { realm: { major: d.realm[0], stage: d.realm[1] }, age: d.age, factionId: f ? f.id : null, locationId: place.id, role: d.role || (f ? 'member' : 'loose'), techniqueId: d.tech });
      q.name = d.name; q.sex = d.sex; q.notable = d.key; q.bio = d.bio;
      q.progress = 0;
      if (d.aptitude) q.aptitude = d.aptitude;
      for (const k of ['daoji', 'yixiang', 'jinhong', 'danPin', 'xiang']) if (d[k] !== undefined) q[k] = d[k];
      if (d.traits) q.traits = d.traits.slice();
      // 原著里写明的随身法器、道术
      if (d.gear) { q.gear = d.gear.map((g, i) => Object.assign({ id: 'n' + i, cap: g.grade, ling: 100 }, g)); }
      if (d.arts) { q.arts = {}; for (const k in d.arts) q.arts[k] = C().arts.xp[C().techniques[k].rank][d.arts[k] - 1]; }
      s.usedNames[d.name] = 1;
      if (d.role === 'leader' && f) {
        const old = s.people[f.leaderId];
        if (old && old.id !== q.id) old.role = 'elder';
        f.leaderId = q.id;
      }
    }
  };
  // 这条路此人走不走得通（南域通往中域的关口要金丹）
  W.linkOpen = (p, l) => !l.minMajor || p.realm.major >= l.minMajor;

  /* ---------- 势力 ---------- */
  W.genFactions = (s) => {
    const r = s.rng;
    const places = Object.values(s.places);
    let n = 1;
    const add = (def, type, name, seat) => {
      const f = { id: 'f' + n++, key: def.key || null, name, type, tier: def.tier || 1, tech: def.tech || null, blurb: def.blurb || '', seatId: seat.id, leaderId: null, relToPlayer: 0 };
      s.factions[f.id] = f;
      if (seat.type !== 'town' && seat.type !== 'city') seat.factionId = f.id;
      return f;
    };
    const sects = places.filter((x) => x.type === 'sect');
    let si = 0;
    for (const def of C().factionDefs) {
      if (def.outer) continue; // 八派六宗在东弥州腹地，由 genOuter 生成
      if (def.type === 'sect') {
        const seat = sects[si++];
        if (!seat) continue;
        seat.name = def.seat || def.name;
        if (def.tech) seat.attr = C().techniques[def.tech].attrs[0]; // 山门灵气合本门传承
        add(def, 'sect', def.name, seat);
      } else if (def.seat === 'town') {
        const seat = places.find((x) => x.type === 'town');
        const f = add(def, def.type, def.name, seat);
        seat.factionId = f.id; // 墟市由建墟市的人管着
      } else if (def.seat === 'hide') {
        const hide = places.filter((x) => (x.type === 'wild' && x.danger >= 2 && !C().world.placeTypes.wild.fixed.includes(x.name)) || (x.type === 'danger' && !C().world.placeTypes.danger.fixed.includes(x.name)));
        const seat = R.pick(r, hide);
        seat.name = def.name;
        add(def, def.type, def.name, seat);
      }
    }
    for (const p of places.filter((x) => x.type === 'clan')) add({ blurb: p.surname + '氏是南域一个小修道家族' }, 'clan', p.surname + '氏', p);
  };

  /* ---------- 人物 ---------- */
  // 按境界给出合理年龄（入道 16 岁起，修得越高越老，且不越过寿元）
  // 按境界给出合理年龄（十六岁起，修得越高越老，且不越过寿元）
  W.ageFor = (r, realm) => {
    const rank = P().rankOf(realm.major, realm.stage);
    const life = P().lifespanMaxFor(realm.major, realm.stage);
    let age = 16 + Math.round(rank * R.range(r, 2, 4.5)) + R.int(r, 0, 12);
    if (realm.major === 3) age = Math.max(age, R.int(r, 45, 130));
    if (realm.major === 4) age = Math.max(age, R.int(r, 90, 200));
    if (realm.major === 5) age = Math.max(age, R.int(r, 150, 320));
    if (realm.major === 6) age = Math.max(age, R.int(r, 300, 900));
    if (realm.major === 7) age = Math.max(age, R.int(r, 900, 2200));
    if (realm.major === 7) age = Math.max(age, 900 + realm.stage * R.int(r, 40, 110));
    if (realm.major === 8) age = Math.max(age, R.int(r, 2500, 5000));
    return Math.min(age, life - R.int(r, 3, 25));
  };
  const L = (st) => ({ major: 2, stage: st });
  const RM = (major, lo, hi) => (r) => ({ major, stage: R.int(r, lo, hi) });
  // 各类人物的境界分布：小宗掌门洞玄，二流宗门掌门金丹；南域穷土，筑基已算一方人物
  const ROLL = {
    sect1_leader: RM(5, 1, 2),
    sect1_elder: (r) => (R.chance(r, 0.4) ? RM(4, 1, 2)(r) : RM(3, 1, 3)(r)),
    sect1_member: (r) => (R.chance(r, 0.15) ? { major: 1, stage: 1 } : R.chance(r, 0.06) ? { major: 3, stage: 1 } : L(R.int(r, 1, 9))),
    sect2_leader: RM(6, 1, 2),
    sect2_elder: (r) => (R.chance(r, 0.4) ? RM(5, 1, 2)(r) : RM(4, 1, 3)(r)),
    sect2_member: (r) => (R.chance(r, 0.12) ? RM(3, 1, 2)(r) : L(R.int(r, 2, 9))),
    // 八派六宗：掌门元神（多已破了好几重障关），长老金丹，门人多是筑基、紫府
    sect3_leader: RM(7, 4, 10),
    sect3_elder: (r) => (R.chance(r, 0.6) ? RM(6, 1, 3)(r) : RM(5, 2, 3)(r)),
    sect3_member: (r) => (R.chance(r, 0.1) ? RM(6, 1, 2)(r) : R.chance(r, 0.3) ? RM(4, 1, 3)(r) : R.chance(r, 0.6) ? RM(3, 1, 3)(r) : L(R.int(r, 6, 9))),
    clan_leader: RM(3, 1, 2),
    clan_elder: (r) => (R.chance(r, 0.4) ? { major: 3, stage: 1 } : L(R.int(r, 8, 9))),
    clan_member: (r) => (R.chance(r, 0.2) ? { major: 1, stage: 1 } : L(R.int(r, 1, 7))),
    league_leader: RM(5, 1, 1),
    league_member: (r) => L(R.int(r, 3, 9)),
    evil_leader: RM(3, 2, 3),
    evil_member: (r) => L(R.int(r, 3, 9)),
    loose: (r) => (R.chance(r, 0.15) ? { major: 1, stage: 1 } : R.chance(r, 0.05) ? { major: 3, stage: 1 } : L(Math.min(9, 1 + Math.floor(Math.pow(R.next(r), 1.6) * 9)))),
  };
  W.rollRealm = (r, kind) => (ROLL[kind] || ROLL.loose)(r);

  // NPC 的练炁术：本门传承或散修常见货色
  W.npcTech = (r, f, role) => {
    if (f && f.tech && (f.type === 'sect' && (role !== 'member' || R.chance(r, 0.7)))) return f.tech;
    return R.weighted(r, ['linghe', 'guiyuan', 'chiyang', 'xuanshui', 'handou'], (k) => ({ linghe: 5, guiyuan: 4, chiyang: 2, xuanshui: 2, handou: 0.3 }[k]));
  };

  W.spawnNpc = (s, o) => {
    const r = s.rng;
    const realm = o.realm || W.rollRealm(r, o.kind || 'loose');
    const age = o.age !== undefined ? o.age : W.ageFor(r, realm);
    const f = o.factionId ? s.factions[o.factionId] : null;
    const tech = o.techniqueId || W.npcTech(r, f, o.role || 'member');
    const B = C().breakthrough;
    const kaifuGrade = realm.major >= 4 ? R.weighted(r, [1, 2, 3], (g) => B.npcKaifu[g] * (f && f.tier >= 2 ? [1, 0.6, 1.5, 3][g] * (f.tier >= 3 ? [1, 0.5, 1, 2][g] : 1) : 1)) : 0;
    const big = f && f.tier >= 3;
    const p = P().create(s, {
      surname: o.surname, realm, birthYear: s.year - age,
      progress: Math.floor(R.next(r) * Math.min(P().need({ realm }), 9999) * 0.8),
      techniqueId: tech,
      daoji: realm.major >= 3 ? P().daojiOf(C().techniques[tech].tier) : 0,
      kaifuId: kaifuGrade ? Object.keys(C().techniques).find((k) => C().techniques[k].kind === 'kaifu' && C().techniques[k].grade === kaifuGrade) : null,
      yixiang: kaifuGrade,
      daoId: realm.major >= 6 ? (big ? R.pick(r, ['dao_mid', 'dao_mid', 'dao_high']) : 'dao_low') : null,
      locationId: o.locationId, factionId: o.factionId || null, role: o.role || (o.factionId ? 'member' : 'loose'),
    });
    if (realm.major > 5 || (realm.major === 5 && realm.stage === 3)) p.jinhong = CU().jinhongFor(p, R.int(r, 0, 1));
    if (realm.major >= 6) p.danPin = CU().danPinFor(p, R.int(r, 0, 2), FX.Yao.npcCount(r, f));
    if (realm.major >= 7) p.xiang = CU().xiangFor(p, R.int(r, 0, 3));
    if (P().isFull(p) && !CU().gateKind(p)) CU().autoAdvance(s, p);
    FX.Ars.npcKit(s, p);
    return p;
  };
  const CU = () => FX.CU;

  W.genMembers = (s, f) => {
    const r = s.rng, cw = C().world;
    const seat = s.places[f.seatId];
    const [lo, hi] = cw.factionMembers[f.type];
    const n = R.int(r, lo, hi) + (f.tier >= 3 ? 6 : 0);
    const sn = f.type === 'clan' ? seat.surname : null;
    const prefix = f.type === 'sect' ? 'sect' + f.tier : f.type;
    for (let i = 0; i < n; i++) {
      const role = i === 0 ? 'leader' : (f.type === 'sect' && i <= (f.tier >= 3 ? 5 : 2)) || (f.type === 'clan' && i === 1) ? 'elder' : 'member';
      const p = W.spawnNpc(s, { kind: prefix + '_' + role, role, factionId: f.id, locationId: seat.id, surname: sn });
      if (role === 'leader') f.leaderId = p.id;
    }
  };

  W.genPeople = (s) => {
    const r = s.rng, cw = C().world;
    for (const f of Object.values(s.factions)) W.genMembers(s, f);
    const looseSpots = Object.values(s.places).filter((p) => p.type === 'town' || p.type === 'wild' || p.type === 'city');
    while (P().living(s).length < cw.npcCount) W.spawnNpc(s, { kind: 'loose', locationId: R.pick(r, looseSpots).id });
  };

  // 世界里的“下一代”：势力招新、散修补员，让世界长期不空
  W.replenish = (s) => {
    const r = s.rng, cw = C().world;
    for (const f of Object.values(s.factions)) {
      const members = P().living(s).filter((p) => p.factionId === f.id);
      const [lo] = cw.factionMembers[f.type];
      if (members.length < lo && R.chance(r, 0.7)) {
        const seat = s.places[f.seatId];
        W.spawnNpc(s, { realm: R.chance(r, 0.4) ? { major: 1, stage: 1 } : L(R.int(r, 1, 3)), age: R.int(r, 16, 22), factionId: f.id, locationId: seat.id, surname: f.type === 'clan' ? seat.surname : null });
      }
      // 掌门/家主身故：由在世最强者接任
      if (!P().alive(s.people[f.leaderId])) {
        const next = members.filter((p) => P().alive(p)).sort((a, b) => P().realmRank(b) - P().realmRank(a) || (a.id < b.id ? -1 : 1))[0];
        if (next) { f.leaderId = next.id; next.role = 'leader'; }
      }
    }
    const loose = P().living(s).filter((p) => !p.factionId && !P().isPlayer(s, p));
    const spots = Object.values(s.places).filter((p) => p.type === 'town' || p.type === 'wild' || p.type === 'city');
    for (let i = loose.length; i < cw.looseMin; i++) W.spawnNpc(s, { realm: R.chance(r, 0.3) ? { major: 1, stage: 1 } : L(R.int(r, 1, 4)), age: R.int(r, 16, 30), locationId: R.pick(r, spots).id });
  };

  /* ---------- 坊市 ---------- */
  W.refreshMarket = (s, placeId) => {
    const r = s.rng, M = C().market;
    const place = s.places[placeId];
    const priceOf = (key) => {
      const base = key.startsWith('tech:') ? C().techniques[key.slice(5)].price : C().items[key].price;
      return Math.max(1, Math.round(base * (1 + R.range(r, -M.priceSwing, M.priceSwing))));
    };
    const def = M[place.type] || { staples: [], rare: [], slots: 0 };
    const stock = def.staples.map((x) => ({ item: x.item, qty: R.int(r, x.qty[0], x.qty[1]), price: priceOf(x.item) }));
    const pool = def.rare.filter((x) => !stock.some((y) => y.item === x.item));
    for (let i = 0; i < def.slots; i++) {
      if (!R.chance(r, def.chance)) continue;
      const pick = R.weighted(r, pool, (x) => x.w);
      if (!pick) break;
      pool.splice(pool.indexOf(pick), 1);
      stock.push({ item: pick.item, qty: pick.qty ? R.int(r, pick.qty[0], pick.qty[1]) : 1, price: priceOf(pick.item) });
    }
    s.markets[placeId] = { year: s.year, stock };
  };
  W.hasMarket = (s, placeId) => !!C().world.placeTypes[s.places[placeId].type].market;

  W.itemName = (key) => {
    if (!key.startsWith('tech:')) return C().items[key] ? C().items[key].name : key;
    const t = C().techniques[key.slice(5)];
    return (t.kind === 'kaifu' ? '开府真法' : t.kind === 'dao' ? '道书' : t.kind === 'shu' ? C().shuRankNames[t.rank] : '练炁术') + '《' + t.name + '》';
  };
  W.sellPrice = (s, key) => Math.max(1, Math.floor(C().items[key].price * C().market.sellRatio));

  /* ---------- 道路 ---------- */
  // 最短路（按天数，Dijkstra）；返回经过的地点 id 列表（含起终点）与总天数
  W.route = (s, from, to, who) => {
    if (from === to) return { path: [from], days: 0 };
    const D = {}, prev = {}, done = new Set();
    for (const id in s.places) D[id] = Infinity;
    D[from] = 0;
    for (;;) {
      let u = null;
      for (const id in D) if (!done.has(id) && D[id] < Infinity && (u === null || D[id] < D[u] || (D[id] === D[u] && id < u))) u = id;
      if (u === null) break;
      if (u === to) break;
      done.add(u);
      for (const l of s.places[u].links) if ((!who || W.linkOpen(who, l)) && D[u] + l.days < D[l.to]) { D[l.to] = D[u] + l.days; prev[l.to] = u; }
    }
    if (D[to] === Infinity) return null;
    const path = [to];
    while (path[0] !== from) path.unshift(prev[path[0]]);
    return { path, days: D[to] };
  };

  FX.World = W;
})(typeof globalThis !== 'undefined' ? globalThis : this);
