/* ============================================================
 * characters —— 人物生成、属性、寿元与死亡、关系对
 * 主角与 NPC 是同一种人物，只是主角由玩家操控。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;

  const P = {};

  /* ---------- 基础查询 ---------- */
  P.age = (s, p) => s.year - p.birthYear;
  P.alive = (p) => !!p && p.status === 'alive';
  P.living = (s) => Object.values(s.people).filter(P.alive);
  P.at = (s, placeId) => P.living(s).filter((p) => p.locationId === placeId);
  P.name = (s, id) => (s.people[id] ? s.people[id].name : '（无名）');
  P.isPlayer = (s, p) => !!p && s.player && s.player.id === p.id;
  P.player = (s) => s.people[s.player.id];

  P.lifespanMaxFor = (major, stage) => {
    const arr = C().realms.lifespan[major];
    return arr[Math.min(arr.length - 1, Math.max(0, stage - 1))];
  };
  P.lifespanTotal = (p) => p.lifespanMax + (p.lifespanBonus || 0);
  P.lifespanLeft = (s, p) => P.lifespanTotal(p) - P.age(s, p);
  P.isOld = (s, p) => P.lifespanLeft(s, p) < P.lifespanTotal(p) * C().life.oldFrac;

  /* ---------- 境界 ---------- */
  P.realmName = (p) => {
    const cf = C().realms;
    return cf.names[p.realm.major] + cf.stageNames[p.realm.major][p.realm.stage - 1];
  };
  // 带小境界名号，如“筑基二重「大小如意」”；金丹以后另注金丹品第
  P.realmTitle = (p) => {
    const t = C().realms.stageTitles[p.realm.major];
    return P.realmName(p) + (t ? '「' + t[p.realm.stage - 1] + '」' : '') + (p.realm.major >= 6 && p.danPin ? '·' + P.danPinName(p) : '');
  };
  P.danPinName = (p) => (p.danPin ? C().realms.danPinNames[p.danPin] : '');
  // 名位：羽士、高功、链师、真人
  P.title = (p) => C().realms.titles[p.realm.major] || '';
  // 境界序号：凡人 0，胎息 1，练炁一至九层 2–10，筑基 11–13，紫府 14–16，洞玄 17–19，金丹 20
  const offsets = () => {
    const ms = C().realms.maxStage;
    const o = [];
    let acc = 0;
    for (let m = 0; m < C().realms.names.length; m++) { o.push(acc); acc += ms[m]; }
    return o;
  };
  P.realmRank = (p) => offsets()[p.realm.major] + p.realm.stage - 1;
  P.rankOf = (major, stage) => offsets()[major] + stage - 1;
  P.realmFromRank = (rank) => {
    const o = offsets(), ms = C().realms.maxStage;
    for (let m = o.length - 1; m >= 0; m--) if (rank >= o[m]) return { major: m, stage: Math.min(ms[m], rank - o[m] + 1) };
    return { major: 0, stage: 1 };
  };
  P.maxRank = () => P.rankOf(C().realms.names.length - 1, C().realms.maxStage[C().realms.names.length - 1]);
  P.need = (p) => C().realms.need[p.realm.major][p.realm.stage - 1];
  P.isFull = (p) => p.progress >= P.need(p);

  P.healthCoef = (p) => (p.health.state === 'heavy' ? 0.3 : p.health.state === 'light' ? 0.7 : 1);
  const NO_TECH = { kind: 'none', name: '（尚无练炁术）', tier: 0, grade: 0, attrs: [], opp: [], mult: 1, desc: '' };
  // 练炁术（练炁、筑基两境用它采气）
  P.lianqiOf = (p) => { const t = C().techniques[p.techniqueId]; return t && t.kind === 'lianqi' ? t : null; };
  // 金丹以后的道书：主角用行囊里最好的一部，NPC 看 daoId
  P.daoOf = (s, p) => {
    const T = C().techniques;
    if (P.isPlayer(s, p)) { const k = s.player.manuals.filter((x) => T[x] && T[x].kind === 'dao').sort((a, b) => T[b].grade - T[a].grade)[0]; return k ? T[k] : null; }
    return p.daoId && T[p.daoId] ? T[p.daoId] : null;
  };
  // 眼下用来修行的法门：紫府以上换成开府真法，金丹以后换成道书（没有道书就还用开府真法）
  P.techOf = (s, p) => {
    if (p.realm.major >= 6) {
      const d = P.daoOf(s, p), k = p.kaifuId ? C().techniques[p.kaifuId] : null;
      if (d && (!k || d.mult >= k.mult)) return d;
    }
    if (p.realm.major >= 4 && p.kaifuId && C().techniques[p.kaifuId]) return C().techniques[p.kaifuId];
    return P.lianqiOf(p) || NO_TECH;
  };
  P.daojiOf = (tier) => (tier >= C().daojiTiers[1] ? 3 : tier >= C().daojiTiers[0] ? 2 : 1);
  P.factionName = (s, p) => (p.factionId && s.factions[p.factionId] ? s.factions[p.factionId].name : '散修');

  // 斗法战力
  P.powerBreakdown = (s, p) => {
    const F = [];
    if (!P.alive(p)) return { total: 0, factors: [{ label: '已故', value: 0 }] };
    const cf = C().realms.power[p.realm.major];
    F.push({ label: '境界 ' + P.realmName(p), value: cf[Math.min(cf.length - 1, p.realm.stage - 1)] });
    F.push({ label: '资质 ' + p.aptitude, value: U.round1((0.85 + (p.aptitude / 100) * 0.3) * 100) / 100 });
    const t = P.techOf(s, p);
    if (t.kind !== 'none') F.push({ label: '法门 ' + t.name, value: t.mult });
    if (p.daoji) F.push({ label: C().daojiNames[p.daoji], value: C().breakthrough.daojiPower[p.daoji] });
    if (p.realm.major >= 6 && p.danPin) F.push({ label: P.danPinName(p), value: U.round1((1 + (5 - p.danPin) * C().realms.danPinPower) * 100) / 100 });
    if (P.isPlayer(s, p)) {
      const best = Object.keys(C().items).filter((k) => C().items[k].power && s.player.inv[k] > 0).sort((a, b) => C().items[b].power - C().items[a].power)[0];
      if (best) F.push({ label: C().items[best].name, value: C().items[best].power });
    }
    if (p.health.state !== 'healthy') F.push({ label: p.health.state === 'heavy' ? '重伤' : '轻伤', value: P.healthCoef(p) });
    let total = 1;
    for (const f of F) total *= f.value;
    return { total: Math.round(total * 10) / 10, factors: F };
  };
  P.power = (s, p) => P.powerBreakdown(s, p).total;

  /* ---------- 关系对（双向，强度 −100 到 100）---------- */
  P.relationsOf = (s, id) => s.relations.filter((r) => r.a === id || r.b === id);
  P.relationBetween = (s, a, b) => s.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  P.relValue = (s, a, b) => { const r = P.relationBetween(s, a, b); return r ? r.strength : 0; };
  P.adjustRelation = (s, a, b, delta, tag) => {
    if (a === b) return null;
    let r = P.relationBetween(s, a, b);
    if (!r) {
      const cap = C().relations.maxPerPerson;
      for (const id of [a, b]) {
        const mine = P.relationsOf(s, id);
        if (mine.length >= cap) {
          mine.sort((x, y) => Math.abs(x.strength) - Math.abs(y.strength));
          s.relations.splice(s.relations.indexOf(mine[0]), 1);
        }
      }
      r = { a, b, type: 'acquaint', strength: 0, tags: [], since: s.year };
      s.relations.push(r);
    }
    r.strength = U.clamp(r.strength + delta, -100, 100);
    if (tag && !r.tags.includes(tag)) r.tags.push(tag);
    const cf = C().relations;
    r.type = r.strength <= cf.feudThreshold ? 'feud' : r.strength >= cf.closeThreshold ? 'close' : 'acquaint';
    return r;
  };

  /* ---------- 生成 ---------- */
  P.genTraits = (r) => {
    const cf = C().traits;
    const n = R.chance(r, 0.5) ? 2 : 3;
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 50) {
      const t = R.pick(r, cf.list);
      if (out.includes(t)) continue;
      if (cf.exclusive.some((pair) => pair.includes(t) && pair.some((x) => x !== t && out.includes(x)))) continue;
      out.push(t);
    }
    return out;
  };

  P.genName = (s, sex, surname) => {
    const n = C().names;
    const pool = sex === 'M' ? n.male : n.female;
    const sn = surname || R.pick(s.rng, n.surnames);
    for (let i = 0; i < 30; i++) {
      const full = sn + R.pick(s.rng, pool) + (R.chance(s.rng, 0.6) ? R.pick(s.rng, pool) : '');
      if (!s.usedNames[full]) { s.usedNames[full] = 1; return full; }
    }
    const full = sn + R.pick(s.rng, pool) + R.pick(s.rng, pool) + R.pick(s.rng, pool);
    s.usedNames[full] = 1;
    return full;
  };

  P.create = (s, o) => {
    const r = s.rng;
    const id = 'p' + s.nextId++;
    const sex = o.sex || (R.chance(r, 0.5) ? 'M' : 'F');
    const realm = o.realm || { major: 2, stage: 1 };
    const A = C().aptitude;
    let name = o.name;
    if (name) s.usedNames[name] = 1; else name = P.genName(s, sex, o.surname);
    const p = {
      id,
      name,
      sex,
      birthYear: o.birthYear,
      deathYear: null,
      deathCause: null,
      aptitude: o.aptitude !== undefined ? o.aptitude : Math.round(U.clamp(R.normal(r, A.npcMean, A.sd), A.min, A.max)),
      realm,
      progress: o.progress || 0,
      lifespanMax: P.lifespanMaxFor(realm.major, realm.stage),
      lifespanBonus: 0,
      yanshouTaken: 0,
      traits: o.traits || P.genTraits(r),
      techniqueId: o.techniqueId || null, // 练炁术
      kaifuId: o.kaifuId || null,         // 开府真法（紫府以上）
      daoji: o.daoji || 0,                // 道基品第 1 下 2 中 3 上（筑基时定下）
      yixiang: o.yixiang || 0,            // 紫府异象品第（开府时定下）
      danPin: o.danPin || 0,              // 金丹品第 1–9，一品最高（结丹时定下）
      daoId: o.daoId || null,             // 金丹以后修的道书（NPC）
      nearDeathT: null,                   // 上一次在生死之间走过（重伤）的时刻
      locationId: o.locationId,
      factionId: o.factionId || null,
      role: o.role || 'member', // leader / elder / member / loose
      health: { state: 'healthy', days: 0 },
      status: 'alive',
      flags: [],
      fullDays: 0,
      failCount: 0,
      restUntil: 0,
      peakRank: 0,
      lastConsultYear: null,
    };
    p.peakRank = P.realmRank(p);
    s.people[id] = p;
    return p;
  };

  /* ---------- 伤势 ---------- */
  P.injure = (s, p, level) => {
    const L = C().life;
    if (level === 'heavy') p.nearDeathT = s.t;
    if (level === 'heavy' || p.health.state === 'heavy') p.health = { state: 'heavy', days: Math.max(p.health.state === 'heavy' ? p.health.days : 0, L.heavyInjuryDays) };
    else p.health = { state: 'light', days: Math.max(p.health.state === 'light' ? p.health.days : 0, L.lightInjuryDays) };
  };
  // 伤愈推进（天）；返回是否痊愈
  P.heal = (p, days) => {
    if (p.health.state === 'healthy') return false;
    p.health.days -= days;
    if (p.health.days > 0) return false;
    p.health = { state: 'healthy', days: 0 };
    return true;
  };

  /* ---------- 死亡 ---------- */
  P.kill = (s, p, cause, causeIds, opts) => {
    if (!P.alive(p)) return null;
    p.status = 'dead';
    p.deathYear = s.year;
    p.deathCause = cause;
    p.health = { state: 'dead', days: 0 };
    p.lastRelations = P.relationsOf(s, p.id).map((r) => ({ other: r.a === p.id ? r.b : r.a, type: r.type, strength: r.strength }));
    const isPlayer = P.isPlayer(s, p);
    // NPC 死后，只保留与主角之间的关系记录，其余清理以免越积越多
    s.relations = s.relations.filter((r) => !(r.a === p.id || r.b === p.id) || (s.player && (r.a === s.player.id || r.b === s.player.id)));
    const place = s.places[p.locationId];
    let hid;
    if (isPlayer) {
      hid = FX.H.add(s, {
        type: 'death', tags: ['死亡'], actors: [p.id], places: [p.locationId], key: 'death_' + ((opts && opts.key) || 'generic'), pov: true,
        params: { name: p.name, age: P.age(s, p), realm: P.realmName(p), cause, place: place ? place.name : '' }, severity: 5, causeIds,
      });
    } else {
      const known = P.relValue(s, p.id, s.player.id) !== 0 || (s.player && P.player(s).locationId === p.locationId);
      hid = FX.H.add(s, {
        type: 'npc_death', tags: ['死亡'], actors: [p.id], factions: p.factionId ? [p.factionId] : [], key: 'npc_death', pov: known,
        params: { name: p.name, faction: P.factionName(s, p), realm: P.realmName(p), cause, age: P.age(s, p) },
        severity: p.realm.major >= 3 || p.role === 'leader' ? 4 : 1, causeIds,
      });
    }
    p.deathHist = hid;
    return hid;
  };

  FX.P = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
