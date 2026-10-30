/* ============================================================
 * characters —— 族人生成、属性、寿元与死亡；relationships 基础（亲缘判定、关系对）
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
  P.alive = (p) => p && p.status === 'alive';
  P.isAdult = (s, p) => P.age(s, p) >= C().life.adultAge;
  P.isChild = (s, p) => P.age(s, p) <= C().life.childAge;
  P.hasRoot = (p) => p.root && p.root.type !== 'none';
  P.rootKnown = (s, p) => p.origin === 'married_in' || P.age(s, p) >= C().life.rootTestAge;
  P.isNative = (p) => p.origin === 'native';
  P.living = (s) => Object.values(s.people).filter(P.alive);
  P.members = (s) => P.living(s); // 在族内存活者（离族者 status=left）
  P.natives = (s) => P.living(s).filter(P.isNative);
  P.adults = (s) => P.living(s).filter((p) => P.isAdult(s, p));
  P.byId = (s, id) => (id ? s.people[id] : null);
  P.name = (s, id) => {
    const p = s.people[id];
    return p ? p.name : '（无名）';
  };

  P.lifespanMaxFor = (major, stage) => {
    const arr = C().realms.lifespan[major];
    return arr[Math.min(arr.length - 1, Math.max(0, stage - 1))];
  };
  P.lifespanLeft = (s, p) => p.lifespanMax + (p.lifespanBonus || 0) - P.age(s, p);
  P.isOld = (s, p) => P.lifespanLeft(s, p) < (p.lifespanMax + (p.lifespanBonus || 0)) * C().life.oldFrac;

  P.realmName = (p) => {
    const cf = C().realms;
    const m = p.realm.major;
    if (m === 0) return P.hasRoot(p) ? '未入道' : '凡人';
    return cf.names[m] + cf.stageNames[m][p.realm.stage - 1];
  };
  P.realmRank = (p) => (p.realm.major === 0 ? 0 : p.realm.major === 1 ? p.realm.stage : p.realm.major === 2 ? 9 + p.realm.stage : 12 + p.realm.stage);
  P.need = (p) => {
    const m = p.realm.major;
    if (m === 0) return Infinity;
    return C().realms.need[m][p.realm.stage - 1];
  };
  P.isFull = (p) => p.realm.major > 0 && p.progress >= P.need(p);

  P.healthCoef = (p) => (p.health.state === 'heavy' ? 0.3 : p.health.state === 'light' ? 0.7 : 1);
  P.techOf = (s, p) => C().techniques[p.techniqueId] || C().techniques.yellow_general;

  // 单个修士战力（第 14 章）
  P.power = (s, p) => {
    if (!P.alive(p) || !P.hasRoot(p) || p.realm.major === 0) return 0;
    const cf = C().realms.power[p.realm.major];
    const base = cf[Math.min(cf.length - 1, p.realm.stage - 1)];
    let v = base * (0.85 + (p.aptitude / 100) * 0.3) * P.techOf(s, p).mult * (p.artifact || 1) * P.healthCoef(p);
    if (p.root.mutant === '雷') v *= C().roots.mutantPower;
    return v;
  };

  /* ---------- 亲缘 ---------- */
  P.ancestors = (s, id, gens) => {
    const out = new Set();
    let layer = [id];
    for (let g = 0; g < gens; g++) {
      const next = [];
      for (const x of layer) {
        const p = s.people[x];
        if (!p) continue;
        for (const pid of [p.fatherId, p.motherId]) if (pid && !out.has(pid)) { out.add(pid); next.push(pid); }
      }
      layer = next;
    }
    return out;
  };
  // 三代以内血亲：共享 (gens-1) 代内的祖先，或一方是另一方的祖先
  P.bloodWithin = (s, a, b, gens) => {
    if (a === b) return true;
    const A = P.ancestors(s, a, gens - 1); A.add(a);
    const B = P.ancestors(s, b, gens - 1); B.add(b);
    for (const x of A) if (B.has(x)) return true;
    return false;
  };
  // 与某人的血缘亲近度（0 到 1）
  P.kinship = (s, a, b) => {
    if (a === b) return 1;
    const pa = s.people[a], pb = s.people[b];
    if (!pa || !pb) return 0;
    if (pa.childIds.includes(b) || pb.childIds.includes(a)) return 1;
    if (pa.spouseId === b) return 0.7;
    if (P.bloodWithin(s, a, b, 2)) return 0.6; // 兄弟姐妹、祖孙
    if (P.bloodWithin(s, a, b, 3)) return 0.35;
    return pa.origin === 'native' && pb.origin === 'native' ? 0.15 : 0;
  };

  /* ---------- 关系对（亲密 / 恩怨）---------- */
  P.relationsOf = (s, id) => s.relations.filter((r) => r.a === id || r.b === id);
  P.relationBetween = (s, a, b) => s.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  P.adjustRelation = (s, a, b, delta, tag) => {
    if (a === b) return null;
    let r = P.relationBetween(s, a, b);
    if (!r) {
      const cap = C().autonomy.maxRelations;
      for (const id of [a, b]) {
        const mine = P.relationsOf(s, id);
        if (mine.length >= cap) {
          // 挤掉最弱的一条
          mine.sort((x, y) => Math.abs(x.strength) - Math.abs(y.strength));
          s.relations.splice(s.relations.indexOf(mine[0]), 1);
        }
      }
      r = { a, b, type: 'close', strength: 0, tags: [], since: s.year };
      s.relations.push(r);
    }
    r.strength = U.clamp(r.strength + delta, -100, 100);
    if (tag && !r.tags.includes(tag)) r.tags.push(tag);
    r.type = r.strength <= C().autonomy.feudThreshold ? 'feud' : 'close';
    if (Math.abs(r.strength) < 5) s.relations.splice(s.relations.indexOf(r), 1);
    return r;
  };

  /* ---------- 生成 ---------- */
  function pickElements(r, n, prefer) {
    const all = C().roots.elements.slice();
    const out = [];
    const pool = (prefer || []).filter((e) => all.includes(e));
    while (out.length < n) {
      let e;
      if (pool.length && R.chance(r, 0.6)) e = pool.splice(Math.floor(R.next(r) * pool.length), 1)[0];
      else e = R.pick(r, all);
      if (!out.includes(e)) out.push(e);
    }
    return out;
  }

  P.genRootRandom = (r) => {
    const cf = C().roots;
    const type = R.weighted(r, cf.types, (t) => cf.weight[t]);
    if (type === 'mutant') return { type, elements: [], mutant: R.pick(r, cf.mutants) };
    return { type, elements: pickElements(r, cf.count[type]), mutant: null };
  };

  // 第 8 章血脉遗传公式
  P.rootWeights = (father, mother) => {
    const cf = C().roots;
    const sc = (p) => (p && p.root && p.root.type !== 'none' ? cf.score[p.root.type] : 1);
    const m = (sc(father) + sc(mother)) / 2;
    const w = {};
    let tot = 0;
    for (const t of cf.types) {
      if (t === 'mutant') continue;
      w[t] = cf.weight[t] * Math.max(cf.inheritMinFactor, 1 + cf.inheritK * (m - 3) * (cf.score[t] - 3));
      tot += w[t];
    }
    for (const t in w) w[t] /= tot;
    return { weights: w, m };
  };
  P.mortalChance = (father, mother) => {
    const cf = C().roots;
    const fr = father && P.hasRoot(father), mr = mother && P.hasRoot(mother);
    if (fr && mr) return cf.mortalBothRoot;
    if (fr || mr) return cf.mortalOneMortal;
    return cf.mortalBothMortal;
  };
  P.inheritRoot = (r, father, mother) => {
    const cf = C().roots;
    if (R.chance(r, P.mortalChance(father, mother))) return { type: 'none', elements: [], mutant: null };
    const anyMut = (father && father.root && father.root.mutant) || (mother && mother.root && mother.root.mutant);
    if (R.chance(r, anyMut ? cf.mutantParent : cf.mutantBase)) {
      const pm = anyMut && R.chance(r, 0.6) ? anyMut : R.pick(r, cf.mutants);
      return { type: 'mutant', elements: [], mutant: pm };
    }
    const { weights } = P.rootWeights(father, mother);
    const type = R.weighted(r, Object.keys(weights), (t) => weights[t]);
    const prefer = [].concat(father ? father.root.elements : [], mother ? mother.root.elements : []);
    return { type, elements: pickElements(r, cf.count[type], prefer), mutant: null };
  };
  P.inheritAptitude = (r, father, mother) => {
    const cf = C().roots;
    const avg = ((father ? father.aptitude : 50) + (mother ? mother.aptitude : 50)) / 2;
    return Math.round(U.clamp(0.5 * avg + 25 + R.normal(r, 0, cf.aptitudeSd), cf.aptitudeMin, cf.aptitudeMax));
  };

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

  P.genGivenName = (s, sex, generation, surname) => {
    const n = C().names;
    const pool = sex === 'M' ? n.male : n.female;
    const used = new Set(Object.values(s.people).map((p) => p.name));
    for (let i = 0; i < 30; i++) {
      let given;
      if (generation !== null && generation !== undefined && sex === 'M') given = n.generation[generation % n.generation.length] + R.pick(s.rng, pool);
      else given = R.pick(s.rng, pool) + (R.chance(s.rng, 0.6) ? R.pick(s.rng, pool) : '');
      const full = surname + given;
      if (!used.has(full)) return full;
    }
    return surname + R.pick(s.rng, pool) + R.pick(s.rng, pool) + R.pick(s.rng, pool);
  };

  P.create = (s, o) => {
    const r = s.rng;
    const id = 'p' + s.nextId++;
    const surname = o.surname || s.family.surname;
    const sex = o.sex || (R.chance(r, 0.5) ? 'M' : 'F');
    const root = o.root || P.genRootRandom(r);
    const realm = o.realm || { major: 0, stage: 0 };
    const p = {
      id,
      name: o.name || P.genGivenName(s, sex, o.generation, surname),
      sex,
      birthYear: o.birthYear,
      deathYear: null,
      deathCause: null,
      fatherId: o.fatherId || null,
      motherId: o.motherId || null,
      spouseId: null,
      formerSpouseIds: [],
      childIds: [],
      branch: o.branch || 'side',
      origin: o.origin || 'native',
      fromFaction: o.fromFaction || null,
      generation: o.generation || 0,
      root,
      aptitude: o.aptitude !== undefined ? o.aptitude : Math.round(U.clamp(R.normal(r, 45, 15), 5, 95)),
      realm,
      progress: o.progress || 0,
      lifespanMax: P.lifespanMaxFor(realm.major, realm.stage),
      lifespanBonus: 0,
      lifespanLeft: 0,
      yanshouTaken: 0,
      traits: o.traits || P.genTraits(r),
      loyalty: 0,
      ambition: R.int(r, 20, 80),
      prestige: Math.round(U.clamp(30 + R.range(r, -15, 15), 0, 100)),
      duty: { type: null, target: null },
      dutySince: s.turn,
      wealth: o.wealth || 0,
      contribution: 0,
      health: { state: 'healthy', recoverYears: 0 },
      techniqueId: o.techniqueId || s.family.techniqueId,
      artifact: o.artifact || 1,
      status: 'alive',
      flags: [],
      attention: null,
      fullYears: 0,
      failCount: 0,
      restUntilYear: 0,
      seclusionTurns: 0,
      lowLoyaltyTurns: 0,
      leftYear: null,
      leftCause: null,
      peakRank: 0,
    };
    p.loyalty = Math.round(U.clamp(60 + R.range(r, -15, 15) + (p.traits.includes('孝顺') ? C().traits.filialLoyalty : 0), 0, 100));
    p.lifespanLeft = P.lifespanLeft(s, p);
    p.peakRank = P.realmRank(p);
    s.people[id] = p;
    return p;
  };

  /* ---------- 婚姻与生育 ---------- */
  P.marry = (s, a, b, causeIds) => {
    a.spouseId = b.id;
    b.spouseId = a.id;
    const id = FX.H.add(s, {
      type: 'marriage', tags: ['婚嫁'], actors: [a.id, b.id], key: 'marriage',
      params: { a: a.name, b: b.name, from: b.origin === 'married_in' ? (b.fromFaction ? C().factions[b.fromFaction].name : '外姓') : '族内' },
      severity: 2, causeIds,
    });
    FX.H.markFirst(s, 'firstMarriage', id);
    return id;
  };

  P.canMarry = (s, p) => P.alive(p) && !p.spouseId && P.age(s, p) >= C().life.marryMin && P.age(s, p) <= C().life.marryMax;

  /* ---------- 死亡与离族 ---------- */
  P.kill = (s, p, cause, causeIds, opts) => {
    if (!P.alive(p)) return null;
    p.status = 'dead';
    p.deathYear = s.year;
    p.deathCause = cause;
    p.duty = { type: null, target: null };
    p.health = { state: 'dead', recoverYears: 0 };
    p.lifespanLeft = Math.max(0, P.lifespanLeft(s, p));
    s.family.focusIds = s.family.focusIds.filter((x) => x !== p.id);
    if (p.spouseId) {
      const sp = s.people[p.spouseId];
      if (sp && P.alive(sp)) {
        sp.formerSpouseIds.push(p.id);
        sp.spouseId = null;
        sp.loyalty = U.clamp(sp.loyalty - 3, 0, 100);
      }
    }
    // 亲人悲痛、关系对清理
    for (const r of P.relationsOf(s, p.id)) {
      const other = s.people[r.a === p.id ? r.b : r.a];
      if (other && P.alive(other) && r.type === 'close' && r.strength >= C().autonomy.closeThreshold) other.loyalty = U.clamp(other.loyalty - 2, 0, 100);
    }
    p.lastRelations = P.relationsOf(s, p.id).map((r) => ({ other: r.a === p.id ? r.b : r.a, type: r.type, strength: r.strength }));
    s.relations = s.relations.filter((r) => r.a !== p.id && r.b !== p.id);
    // 绑定此人的请求作废
    s.family.requests = s.family.requests.filter((q) => q.personId !== p.id);
    // 学生的导师失效
    for (const q of P.living(s)) if (q.duty.type === 'mentor' && q.duty.target === p.id) q.duty.target = null;
    const hid = FX.H.add(s, {
      type: 'death', tags: ['死亡'], actors: [p.id], key: 'death_' + (opts && opts.key ? opts.key : 'generic'),
      params: { name: p.name, age: s.year - p.birthYear, realm: P.realmName(p), cause },
      severity: P.realmRank(p) >= 10 || s.family.headId === p.id ? 4 : P.isAdult(s, p) ? 2 : 1, causeIds,
    });
    p.deathHist = hid;
    FX.Family.onDeath(s, p, hid);
    return hid;
  };

  P.leave = (s, p, cause, causeIds, key) => {
    if (!P.alive(p)) return null;
    p.status = 'left';
    p.leftYear = s.year;
    p.leftCause = cause;
    p.duty = { type: null, target: null };
    s.family.focusIds = s.family.focusIds.filter((x) => x !== p.id);
    s.family.requests = s.family.requests.filter((q) => q.personId !== p.id);
    s.relations = s.relations.filter((r) => r.a !== p.id && r.b !== p.id);
    for (const q of P.living(s)) if (q.duty.type === 'mentor' && q.duty.target === p.id) q.duty.target = null;
    const hid = FX.H.add(s, { type: 'leave', tags: ['离族'], actors: [p.id], key: key || 'leave', params: { name: p.name, cause }, severity: 3, causeIds });
    FX.Family.onDeath(s, p, hid);
    return hid;
  };

  FX.P = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
