/* ============================================================
 * simulation —— 开局、回合与年度结算、差事、婚育、健康、历练、自检、结局
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;
  const F = () => FX.Family;

  const S = {};

  /* ---------- 开局 ---------- */
  S.newGame = (opts) => {
    const cf = C();
    const origin = cf.origins[opts.origin] ? opts.origin : 'market';
    const O = cf.origins[origin];
    const seed = String(opts.seed !== undefined && opts.seed !== '' ? opts.seed : 'fx-seed');
    const s = {
      schemaVersion: cf.schemaVersion,
      gameVersion: cf.gameVersion,
      seed,
      rng: R.seedState(seed),
      year: cf.startYear,
      turn: 1,
      yearInTurn: 0,
      phase: 'arrange',
      nextId: 1,
      nextHistId: 1,
      family: {
        surname: '',
        origin,
        headId: null,
        heirId: null,
        headSince: cf.startYear,
        headList: [],
        elderIds: [],
        rules: Object.assign({}, O.rules),
        rulesPrev: { succession: null, allocation: null, foreign: null },
        rulesChangedTurn: { succession: null, allocation: null, foreign: null },
        resources: { stone: 0, grain: 0, herb: 0, ore: 0, rareHerb: 0, qiju: 0, heal: 0, zhuji: 0, ningdan: 0, yanshou: 0 },
        recipes: { zhuji: false },
        prestige: cf.familyPrestige.start,
        edge: O.edge,
        edgeResidue: 0,
        headAuthority: { prestige: cf.leadership.newHeadPrestige + 10 },
        branches: { main: { support: 60, grievance: 0, lowTurns: 0 }, side: { support: 55, grievance: 0, lowTurns: 0 } },
        buildings: { ancestral: 0, field: 0, mine: 0, shop: 0, cave: 0, alchemy: 0, library: 0, array: 0 },
        techniqueId: O.technique,
        lowMine: !!O.lowMine,
        focusIds: [],
        milestones: [],
        requests: [],
        debts: [],
        deficit: false,
        deficitYears: 0,
        deficitSince: null,
        famine: 0,
        austerityUntil: -1,
        wolvesUntil: -1,
        settings: { usePills: true, pillReserve: 0, autoMinor: true, herbPlots: 0, oreReserve: 10, craftZhuji: true, useHeal: true },
      },
      people: {},
      relations: [],
      factions: {},
      eventQueue: [],
      pending: [],
      history: [],
      records: { firsts: {}, peaks: {} },
      eventCooldowns: {},
      recentCategories: [],
      dryTurns: 0,
      market: { prices: Object.assign({}, cf.economy.prices), offers: [] },
      turnStart: null,
      lastReport: null,
      ended: null,
      settings: { fontScale: 1 },
    };
    const r = s.rng;
    s.family.surname = (opts.surname && String(opts.surname).trim().slice(0, 2)) || R.pick(r, cf.names.familySurnames);
    Object.assign(s.family.resources, O.resources);
    Object.assign(s.family.buildings, O.buildings);
    for (const k in cf.factions) {
      const f = cf.factions[k];
      s.factions[k] = {
        id: k, name: f.name, tier: f.tier,
        core: f.core.map((c) => ({ name: c.name, major: c.major, stage: c.stage, age: c.age })),
        stock: { stone: f.tier * 300 }, relToPlayer: O.rel[k], relToOthers: {}, goal: '（阶段 3 开放）', grudges: origin === 'fallen' && k === 'zhao' ? [{ year: 0, what: '旧仇' }] : [],
      };
    }
    // 老祖
    const y0 = cf.startYear;
    const elderRoot = R.chance(r, 0.5) ? { type: 'triple', elements: ['木', '水', '土'].slice(0, 3), mutant: null } : { type: 'dual', elements: [R.pick(r, ['金', '木', '水', '火', '土'])], mutant: null };
    if (elderRoot.type === 'dual') { const e2 = R.pick(r, cf.roots.elements.filter((e) => e !== elderRoot.elements[0])); elderRoot.elements.push(e2); }
    const elder = P().create(s, {
      sex: 'M', birthYear: y0 - cf.elderAge, branch: 'main', origin: 'native', generation: 0,
      root: elderRoot, aptitude: R.int(r, cf.elderAptitude[0], cf.elderAptitude[1]),
      realm: { major: 1, stage: O.elderStage }, artifact: O.elderArtifact || 1,
    });
    elder.progress = Math.floor(P().need(elder) * O.elderProgress);
    elder.loyalty = 90;
    elder.prestige = 60;
    elder.traits = elder.traits.filter((t) => t !== '贪婪').slice(0, 3);
    const spouse = P().create(s, {
      sex: 'F', birthYear: y0 - R.int(r, 44, 48), branch: 'main', origin: 'married_in',
      surname: R.pick(r, cf.names.surnames.slice(0, 120)),
      root: R.chance(r, 0.5) ? P().genRootRandom(r) : { type: 'none', elements: [], mutant: null },
    });
    if (P().hasRoot(spouse)) { spouse.realm = { major: 1, stage: R.int(r, 2, 4) }; FX.CU.updateLifespan(s, spouse); }
    P().marry(s, elder, spouse);
    const kids = [];
    const nA = O.family.adults, nY = O.family.youths;
    for (let i = 0; i < nA + nY; i++) {
      const adult = i < nA;
      const age = adult ? R.int(r, 17, 27 - i * 2 > 17 ? 27 - i * 2 : 18) : R.int(r, 6, 15);
      const k = S.bear(s, elder, spouse, { birthYear: y0 - age, sex: i === 0 ? 'M' : undefined, branch: i === 0 ? 'main' : 'side', quiet: true });
      kids.push(k);
      if (P().hasRoot(k)) {
        k.realm = { major: 1, stage: adult ? R.int(r, 2, 5) : age >= 10 ? 2 : 1 };
        k.progress = Math.floor(P().need(k) * R.next(r) * 0.8);
        FX.CU.updateLifespan(s, k);
      }
      k.flags.push('觉醒');
    }
    s.family.headId = elder.id;
    s.family.headList.push({ id: elder.id, from: y0 });
    s.family.headAuthority.prestige = 55;
    F().updateElder(s);
    const hid = H().add(s, { type: 'found', tags: ['开山'], actors: [elder.id], key: 'found', params: { surname: s.family.surname, name: elder.name, realm: P().realmName(elder), count: P().living(s).length }, severity: 5 });
    s.foundHist = hid;
    S.suggestAll(s, true);
    for (const p of P().living(s)) p.attention = null;
    S.recordPeaks(s);
    S.beginTurn(s);
    return s;
  };

  // 生育一个孩子（遗传公式见第 8 章）
  S.bear = (s, father, mother, o) => {
    o = o || {};
    const r = s.rng;
    const nativeParent = P().isNative(father) ? father : mother;
    const root = P().inheritRoot(r, father, mother);
    const k = P().create(s, {
      sex: o.sex || (R.chance(r, 0.5) ? 'M' : 'F'),
      birthYear: o.birthYear !== undefined ? o.birthYear : s.year,
      fatherId: father.id, motherId: mother.id,
      branch: o.branch || nativeParent.branch,
      origin: 'native',
      generation: (nativeParent.generation || 0) + 1,
      root,
      aptitude: P().inheritAptitude(r, father, mother),
    });
    father.childIds.push(k.id);
    mother.childIds.push(k.id);
    if (!o.quiet) {
      const hid = H().add(s, { type: 'birth', tags: ['出生'], actors: [k.id, father.id, mother.id], key: 'birth', params: { parents: father.name + '与' + mother.name, sex: k.sex === 'M' ? '子' : '女', name: k.name }, severity: 1 });
      k.birthHist = hid;
    }
    return k;
  };

  S.marryOutsider = (s, p, o, causeIds) => {
    const cf = C(), r = s.rng;
    o = o || {};
    const mortal = o.mortal || R.chance(r, cf.life.outsiderMortalChance);
    const age = U.clamp(P().age(s, p) + R.int(r, -5, 5), cf.life.marryMin, cf.life.marryMax);
    const sp = P().create(s, {
      sex: p.sex === 'M' ? 'F' : 'M', birthYear: s.year - age, branch: p.branch, origin: 'married_in', fromFaction: o.faction || null,
      surname: o.surname || R.pick(r, cf.names.surnames.slice(0, 160)),
      root: mortal ? { type: 'none', elements: [], mutant: null } : P().genRootRandom(r),
    });
    if (P().hasRoot(sp)) { sp.realm = { major: 1, stage: R.int(r, 1, 4) }; FX.CU.updateLifespan(s, sp); }
    sp.attention = '新入族';
    return { spouse: sp, hid: P().marry(s, p, sp, causeIds) };
  };

  S.createGuest = (s, name, stage) => {
    const r = s.rng;
    const g = P().create(s, { name, sex: 'M', birthYear: s.year - R.int(r, 30, 50), branch: 'side', origin: 'guest', root: P().genRootRandom(r), realm: { major: 1, stage } });
    if (!P().hasRoot(g)) g.root = { type: 'quad', elements: ['金', '木', '水', '火'], mutant: null };
    FX.CU.updateLifespan(s, g);
    g.loyalty = 45;
    g.attention = '新入族';
    return g;
  };

  S.addRelatives = (s, causeIds) => {
    const r = s.rng;
    const kidAge = R.int(r, 6, 12);
    const man = P().create(s, { sex: 'M', birthYear: s.year - kidAge - R.int(r, 20, 28), branch: 'side', origin: 'native', generation: 1 });
    const wife = P().create(s, { sex: 'F', birthYear: s.year - kidAge - R.int(r, 18, 24), branch: 'side', origin: 'married_in', surname: R.pick(r, C().names.surnames.slice(0, 120)) });
    for (const q of [man, wife]) if (P().hasRoot(q)) { q.realm = { major: 1, stage: R.int(r, 1, 3) }; FX.CU.updateLifespan(s, q); }
    P().marry(s, man, wife, causeIds);
    const kid = S.bear(s, man, wife, { birthYear: s.year - kidAge });
    // 补足孩子年龄带来的境界
    if (P().hasRoot(kid)) { kid.realm = { major: 1, stage: 1 }; FX.CU.updateLifespan(s, kid); kid.flags.push('觉醒'); }
    man.attention = wife.attention = '新入族';
    return [man.id, wife.id, kid.id];
  };

  S.takeYanshou = (s, p) => {
    if (s.family.resources.yanshou < 1) return '没有延寿丹';
    if (p.yanshouTaken >= 3) return p.name + '已服满 3 颗';
    s.family.resources.yanshou--;
    const y = C().yanshouYears[p.yanshouTaken];
    p.lifespanBonus += y;
    p.yanshouTaken++;
    p.lifespanLeft = P().lifespanLeft(s, p);
    return `${p.name}服下延寿丹，寿元 +${y}`;
  };

  /* ---------- 差事 ---------- */
  S.dutyStatus = (s, p) => {
    if (p.status === 'dead') return '已故';
    if (p.status === 'left') return '已离族';
    if (!P().isAdult(s, p)) return P().isChild(s, p) ? '幼年' : '少年';
    if (p.health.state === 'heavy') return '养伤';
    if (!p.duty.type) return '待安排';
    return C().duties[p.duty.type].name;
  };
  S.dutyAllowed = (s, p, type) => {
    const d = C().duties[type];
    if (!d) return '无此差事';
    if (d.locked) return '阶段 3 开放（未完成）';
    if (!P().alive(p)) return '此人已不在族中';
    if (!P().isAdult(s, p)) return '未成年';
    if (p.health.state === 'heavy') return '重伤养伤中';
    const canCult = P().hasRoot(p) && p.realm.major > 0;
    if (!d.mortalOk && !canCult) return '凡人不能担任此差事';
    if (type === 'alchemy' && !(s.family.buildings.alchemy > 0)) return '尚无炼丹房';
    if (type === 'shop' && !(s.family.buildings.shop > 0)) return '尚无商铺';
    if (type === 'field' && !(s.family.buildings.field > 0)) return '尚无灵田';
    return true;
  };
  S.setDutyRaw = (s, p, type, target, why) => {
    const from = p.duty.type;
    p.duty = { type, target: target || null };
    p.attention = null;
    if (from !== type) {
      p.dutySince = s.turn;
      if (type !== 'seclusion') p.seclusionTurns = 0;
      if (P().isAdult(s, p) && type) H().add(s, { type: 'duty', tags: ['差事'], actors: [p.id], key: 'duty_change', params: { name: p.name, from: from ? C().duties[from].name : '无', to: C().duties[type].name, why: why || '' }, severity: 1 });
    }
  };
  S.setDuty = (s, id, type) => {
    const p = s.people[id];
    if (!p) return { ok: false, error: '无此人' };
    const ok = S.dutyAllowed(s, p, type);
    if (ok !== true) return { ok: false, error: ok };
    S.setDutyRaw(s, p, type, null, '家主安排');
    let note = '';
    if (p.traits.includes('孤傲') && !['seclusion', 'travel'].includes(type)) { p.loyalty = U.clamp(p.loyalty - 3, 0, 100); note = p.name + '性情孤傲，不愿担此杂务（忠诚 -3）'; }
    return { ok: true, note };
  };
  S.confirmDuty = (s, id) => { const p = s.people[id]; if (p) p.attention = null; return { ok: true }; };

  S.suggestFor = (s, p, counts) => {
    const b = s.family.buildings;
    const canCult = P().hasRoot(p) && p.realm.major > 0;
    const c = counts;
    const slot = (d) => FX.Econ.slots(s, d);
    const open = ['field', 'shop', 'industry'].filter((d) => c[d] < slot(d)).sort((x, y) => c[x] / Math.max(1, slot(x)) - c[y] / Math.max(1, slot(y)));
    if (!canCult) return open[0] || (b.field > 0 ? 'field' : 'industry');
    if (b.alchemy > 0 && c.alchemy < 1 && (s.family.resources.herb >= 3 || s.family.settings.herbPlots > 0)) return 'alchemy';
    if (c.mentor < 1 && c.youths >= 2 && (P().isOld(s, p) || p.traits.includes('孝顺')) && !s.family.focusIds.includes(p.id)) return 'mentor';
    if (!s.family.focusIds.includes(p.id) && p.aptitude < 55 && open.length && !P().isFull(p)) return open[0];
    return 'seclusion';
  };
  S.dutyCounts = (s, exclude) => {
    const c = { field: 0, shop: 0, alchemy: 0, industry: 0, mentor: 0, guard: 0, seclusion: 0, travel: 0, mortals: 0, youths: 0 };
    for (const q of P().living(s)) {
      if (!P().isAdult(s, q)) { if (P().hasRoot(q) && P().age(s, q) >= 6) c.youths++; continue; }
      if (exclude && exclude.has(q.id)) continue;
      if (q.duty.type) c[q.duty.type] = (c[q.duty.type] || 0) + 1;
      if (!(P().hasRoot(q) && q.realm.major > 0)) c.mortals++;
    }
    return c;
  };
  S.needsAttention = (s) => P().adults(s).filter((p) => p.attention || (!p.duty.type && p.health.state !== 'heavy'));
  // 按建议安排：默认只处理需要处理的人；all=true 时全族重排
  S.suggestAll = (s, all) => {
    const targets = all ? P().adults(s) : S.needsAttention(s);
    const ex = new Set(targets.map((p) => p.id));
    const c = S.dutyCounts(s, ex);
    const order = targets.slice().sort((a, b) => (P().hasRoot(a) && a.realm.major > 0) - (P().hasRoot(b) && b.realm.major > 0) || a.aptitude - b.aptitude || (a.id < b.id ? -1 : 1));
    for (const p of order) {
      if (p.health.state === 'heavy') { p.attention = null; continue; }
      const t = S.suggestFor(s, p, c);
      if (S.dutyAllowed(s, p, t) === true) { S.setDutyRaw(s, p, t, null, '按建议安排'); c[t]++; }
    }
    return { ok: true, count: targets.length };
  };
  S.batchSetDuty = (s, ids, type) => {
    const out = { ok: true, done: 0, failed: [] };
    for (const id of ids) {
      const r = S.setDuty(s, id, type);
      if (r.ok) out.done++; else out.failed.push(P().name(s, id) + '：' + r.error);
    }
    return out;
  };

  /* ---------- 回合 ---------- */
  S.snapshot = (s) => ({
    year: s.year,
    resources: Object.assign({}, s.family.resources),
    population: P().living(s).length,
    natives: P().natives(s).length,
    histFrom: s.nextHistId,
    prestige: s.family.prestige,
  });

  S.beginTurn = (s) => {
    s.phase = 'arrange';
    s.turnStart = S.snapshot(s);
    FX.Econ.refreshMarket(s);
    FX.Ev.processQueue(s);
    FX.Ev.draw(s);
  };

  S.advance = (s) => {
    if (s.ended) return { ok: false, error: '本局已结束' };
    if (s.pending.length) return { ok: false, error: '还有待决断的事件' };
    s.phase = 'advancing';
    let guard = 0;
    while (s.yearInTurn < C().yearsPerTurn) {
      if (guard++ > 10) throw new Error('年度结算超出迭代上限');
      S.runYear(s);
      s.yearInTurn++;
      if (s.ended) return { ok: true, ended: true };
      if (s.pending.length) return { ok: true, interrupted: true, year: s.year };
    }
    S.endTurn(s);
    return { ok: true, report: s.lastReport };
  };

  S.endTurn = (s) => {
    F().turnEnd(s);
    for (const p of P().living(s)) if (p.duty.type === 'seclusion') p.seclusionTurns++;
    const st = s.turnStart || S.snapshot(s);
    const now = S.snapshot(s);
    const delta = {};
    for (const k in now.resources) delta[k] = U.round1(now.resources[k] - (st.resources[k] || 0));
    s.lastReport = {
      turn: s.turn,
      fromYear: st.year, toYear: s.year,
      delta, population: [st.population, now.population],
      prestige: [st.prestige, now.prestige],
      entries: s.history.filter((e) => e.turn === s.turn && e.severity >= 2).map((e) => e.id),
    };
    S.checkEnd(s);
    if (s.ended) return;
    s.turn++;
    s.yearInTurn = 0;
    S.beginTurn(s);
  };

  /* ---------- 年度结算（固定顺序，第 5 章）---------- */
  S.runYear = (s) => {
    const cf = C(), r = s.rng;
    // 1. 年龄 +1、寿元 -1
    s.year++;
    for (const p of P().living(s)) p.lifespanLeft = P().lifespanLeft(s, p);
    // 2. 死亡判定
    for (const p of P().living(s).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (!P().alive(p)) continue;
      const age = P().age(s, p);
      const left = p.lifespanLeft;
      if (left <= 0) { P().kill(s, p, '寿元耗尽', [], { key: 'lifespan' }); continue; }
      let pd;
      if (age <= cf.life.childAge) pd = cf.life.deathInfant;
      else pd = cf.life.deathAdult;
      const maxL = p.lifespanMax + p.lifespanBonus;
      if (left < maxL * cf.life.deathOldFrac) pd = cf.life.deathAdult + (1 - left / (maxL * cf.life.deathOldFrac)) * (cf.life.deathOldMax - cf.life.deathAdult);
      if (p.health.state === 'heavy') pd += cf.life.heavyInjuryDeath;
      const fam = s.family.famine || 0;
      if (fam > 0) pd += fam * (age <= cf.life.childAge || !P().hasRoot(p) || p.realm.major === 0 ? cf.life.famineDeathWeak : cf.life.famineDeath);
      if (R.chance(r, pd)) P().kill(s, p, fam > 0.2 ? '饥荒中饿病而死' : p.health.state === 'heavy' ? '伤重不治' : age <= cf.life.childAge ? '幼年夭折' : left < maxL * cf.life.deathOldFrac ? '年老病故' : '急病而亡', [], {});
    }
    if (S.checkEnd(s)) return;
    // 老祖寿元预警（C06）
    const top = F().strongest(s);
    if (top) {
      const left = P().lifespanLeft(s, top);
      for (const w of cf.leadership.ancestorWarnings) {
        const flag = 'warn' + w;
        if (left <= w && !top.flags.includes(flag)) {
          top.flags.push(flag);
          for (const w2 of cf.leadership.ancestorWarnings) if (w2 > w && !top.flags.includes('warn' + w2)) top.flags.push('warn' + w2);
          const hid = H().add(s, { type: 'event', tags: ['继承', '寿元'], actors: [top.id], key: 'event', params: { title: '老祖寿元预警', choice: '剩余 ' + left + ' 年', result: '' }, severity: 3 });
          FX.Ev.spawn(s, 'E24', { person: top.id }, [hid]);
          break;
        }
      }
    }
    // 3. 伤势恢复
    for (const p of P().living(s)) {
      if (p.health.state === 'healthy') continue;
      let step = 1;
      if (s.family.settings.useHeal && p.health.state === 'heavy' && s.family.resources.heal > 0) { s.family.resources.heal--; step = 2; }
      p.health.recoverYears -= step;
      if (p.health.recoverYears <= 0) {
        p.health = { state: 'healthy', recoverYears: 0 };
        if (P().isAdult(s, p)) p.attention = '康复';
      }
    }
    // 4. 产业收支
    if (s.family.austerityUntil >= s.turn) s.family.resources.stone += FX.Econ.consumption(s).stone * 0.3;
    FX.Econ.yearly(s);
    const yearlyNeed = FX.Econ.upkeep(s) + FX.Econ.consumption(s).stone;
    if (s.family.resources.stone < yearlyNeed * 2 && s.family.resources.stone < 400 && FX.Econ.forecast(s).netStone < 0 && (s.eventCooldowns.E07 || -1) <= s.turn && !s.pending.some((x) => x.defId === 'E07')) {
      FX.Ev.spawn(s, 'E07', {}, []);
    }
    // 5. 修炼与突破（只处理存活且有差事者）+ 历练
    FX.CU.yearly(s);
    S.travel(s);
    for (const p of P().living(s)) {
      const rk = P().realmRank(p);
      if (rk !== p.lastRank) { p.lastRank = rk; p.rankChangedTurn = s.turn; }
    }
    // 6. 人物自主行为
    F().autonomy(s);
    // 7. 婚嫁、生育与新生族人
    S.marriages(s);
    S.births(s);
    S.growUp(s);
    // 8. 外部势力演化（阶段 3）：核心修士增龄
    for (const k in s.factions) for (const c of s.factions[k].core) c.age++;
    // 9. 风险与危机（阶段 3 完整实现）
    // 家主、分支、忠诚、锋芒的年度漂移
    F().yearly(s);
    F().updateElder(s);
    if (!s.family.headId || !P().alive(s.people[s.family.headId])) F().succeed(s, [], 'vacant');
    S.recordPeaks(s);
    FX.Ev.prune(s);
    // 10. 状态自检断言
    S.check(s);
  };

  S.travel = (s) => {
    const T = C().travel, r = s.rng;
    for (const p of P().living(s).filter((q) => q.duty.type === 'travel' && P().isAdult(s, q))) {
      let risk = 1;
      if (p.traits.includes('谨慎')) risk *= T.cautiousFactor;
      if (p.root.mutant === '风') risk *= C().roots.mutantTravelRisk;
      const roll = R.next(r);
      if (roll < T.death * risk) { P().kill(s, p, '外出历练遇险身亡', [], { key: 'travel' }); continue; }
      if (roll < (T.death + T.injury) * risk && p.health.state === 'healthy') {
        const heavy = R.chance(r, T.heavyShare);
        p.health = { state: heavy ? 'heavy' : 'light', recoverYears: heavy ? C().life.heavyInjuryYears : C().life.lightInjuryYears };
        if (heavy) { p.duty = { type: null, target: null }; p.attention = '重伤'; }
        H().add(s, { type: 'injury', tags: ['历练', '受伤'], actors: [p.id], key: 'travel_injury', params: { name: p.name, level: heavy ? '重伤' : '轻伤' }, severity: heavy ? 2 : 1 });
        continue;
      }
      if (R.chance(r, T.fortune)) {
        const rw = R.weighted(r, T.rewards, (x) => x.w);
        const q = R.int(r, rw.min, rw.max);
        s.family.resources[rw.kind] += q;
        H().add(s, { type: 'fortune', tags: ['历练', '奇遇'], actors: [p.id], key: 'travel_fortune', params: { name: p.name, reward: C().items[rw.kind] + ' ' + q }, severity: rw.kind === 'rareHerb' ? 2 : 1 });
      }
    }
  };

  S.marriages = (s) => {
    const L = C().life, r = s.rng;
    const singles = P().living(s).filter((p) => P().isNative(p) && P().canMarry(s, p)).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const p of singles) {
      if (!P().canMarry(s, p)) continue;
      // 族内婚配（三代以内血亲不得婚配）
      if (R.chance(r, L.marryInternalChance)) {
        const mates = singles.filter((q) => q !== p && q.sex !== p.sex && P().canMarry(s, q) && !P().bloodWithin(s, p.id, q.id, L.generationsBan));
        if (mates.length) { P().marry(s, p, R.pick(r, mates)); continue; }
      }
      if (!R.chance(r, L.marryOutsiderChance)) continue;
      if (p.sex === 'F' && !R.chance(r, L.daughterUxorilocal)) {
        // 外嫁离族
        const to = R.pick(r, C().names.surnames.slice(0, 120)) + '家';
        const hid = H().add(s, { type: 'marriage', tags: ['婚嫁', '外嫁'], actors: [p.id], key: 'marry_out', params: { name: p.name, to }, severity: 2 });
        p.marriedOutTo = to;
        P().leave(s, p, '外嫁' + to, [hid], 'leave');
        continue;
      }
      S.marryOutsider(s, p, {}, []);
    }
  };

  S.births = (s) => {
    const L = C().life, r = s.rng;
    const mothers = P().living(s).filter((m) => m.sex === 'F' && m.spouseId && P().age(s, m) >= L.marryMin && P().age(s, m) <= L.fertileMaxMother).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const m of mothers) {
      const f = s.people[m.spouseId];
      if (!f || !P().alive(f)) continue;
      if (!P().isNative(m) && !P().isNative(f)) continue;
      const shared = m.childIds.filter((id) => f.childIds.includes(id)).length;
      if (shared >= L.maxChildren) continue;
      const mult = Math.min(L.birthRealmMult[m.realm.major], L.birthRealmMult[f.realm.major]);
      if (!R.chance(r, L.birthChance * mult * (1 - (s.family.famine || 0)))) continue;
      S.bear(s, f, m, {});
    }
  };

  S.growUp = (s) => {
    const L = C().life;
    for (const p of P().living(s)) {
      const age = P().age(s, p);
      if (age === L.rootTestAge && P().isNative(p)) {
        H().add(s, { type: 'rootTest', tags: ['灵根'], actors: [p.id], key: 'rootTest', params: { name: p.name, root: C().roots.names[p.root.type] + (p.root.mutant ? '（' + p.root.mutant + '）' : ''), apt: p.aptitude }, severity: ['single', 'mutant'].includes(p.root.type) ? 2 : 1 });
      }
      if (age === L.adultAge) {
        p.attention = '新成年';
        H().add(s, { type: 'adult', tags: ['成年'], actors: [p.id], key: 'adult', params: { name: p.name }, severity: 1 });
      }
    }
  };

  S.recordPeaks = (s) => {
    const n = P().living(s).length;
    const cur = s.records.peaks.population;
    if (!cur || n > cur.value) s.records.peaks.population = { value: n, year: s.year, hid: null };
    if (n > 30) F().milestone(s, 'pop30', '族人超过 30 口', null);
    let gen = 0;
    for (const p of P().natives(s)) gen = Math.max(gen, p.generation || 0);
    if (gen >= 4) F().milestone(s, 'gen5', '传承到第 5 代', null);
    if (gen >= 9) F().milestone(s, 'gen10', '传承到第 10 代', null);
  };

  /* ---------- 结局 ---------- */
  S.checkEnd = (s) => {
    if (s.ended) return true;
    if (P().natives(s).length === 0) {
      S.endGame(s, 'extinct', '家族断嗣');
      return true;
    }
    return false;
  };
  S.endGame = (s, type, what) => {
    const hid = H().add(s, { type: 'ending', tags: ['结局'], key: 'ending', params: { what }, severity: 5 });
    s.pending = [];
    s.ended = { type, what, year: s.year, hid, rating: S.rating(s, type) };
    s.phase = 'ended';
  };
  S.seal = (s) => {
    if (s.ended) return { ok: false, error: '本局已结束' };
    S.endGame(s, 'sealed', '家主封存族史');
    return { ok: true };
  };

  S.rating = (s, type) => {
    const rc = C().rating;
    const years = s.year - C().startYear;
    let best = 0, bestKey = null;
    for (const p of Object.values(s.people)) {
      if (p.origin === 'guest') continue;
      const rk = p.peakRank || P().realmRank(p);
      if (rk > best) best = rk;
    }
    if (best >= 1 && best <= 9) bestKey = '1';
    else if (best >= 10 && best <= 12) bestKey = '2-' + (best - 9);
    else if (best >= 13) bestKey = '3-' + (best - 12);
    let lv = 0;
    for (const k in s.family.buildings) lv += s.family.buildings[k] || 0;
    const parts = [
      { label: '传承年数', value: Math.min(rc.yearsMax, years / rc.yearsDiv) },
      { label: '最高修为', value: bestKey ? rc.realmScore[bestKey] : 0 },
      { label: '人口峰值', value: Math.min(rc.popMax, ((s.records.peaks.population || {}).value || 0) / rc.popDiv) },
      { label: '产业', value: Math.min(rc.buildMax, lv / rc.buildDiv) },
      { label: '声望', value: Math.min(rc.prestigeMax, s.family.prestige / rc.prestigeDiv) },
      { label: '历史成就', value: Math.min(rc.milestoneMax, s.family.milestones.length) },
    ];
    const total = Math.round(U.sum(parts, (x) => x.value) * 10) / 10;
    const g = rc.grades.find((x) => total >= x[0]);
    const why = type === 'extinct' ? '终因断嗣而衰' : type === 'sealed' ? '族史封存于第 ' + s.year + ' 年' : '';
    return { total, grade: g[1], title: g[2], why, parts: parts.map((x) => ({ label: x.label, value: Math.round(x.value * 10) / 10 })) };
  };

  /* ---------- 状态自检（第 4 章原则 14 / 第 22 章 2、3、4）---------- */
  S.check = (s) => {
    const errs = [];
    const caps = C().economy.caps;
    for (const k in s.family.resources) {
      const v = s.family.resources[k];
      if (!Number.isFinite(v) || v < 0 || v > (caps[k] || 1e9)) errs.push('资源越界 ' + k + '=' + v);
    }
    for (const p of Object.values(s.people)) {
      if (p.status !== 'alive' && p.duty.type) errs.push('非在世者仍有差事 ' + p.id);
      if (p.status === 'dead' && (p.deathYear === null || p.deathYear < p.birthYear)) errs.push('死亡年份异常 ' + p.id);
      if (p.birthYear > s.year) errs.push('出生年份在未来 ' + p.id);
      for (const pid of [p.fatherId, p.motherId]) {
        if (!pid) continue;
        const par = s.people[pid];
        if (!par) { errs.push('父母引用缺失 ' + p.id); continue; }
        if (p.birthYear - par.birthYear < C().life.adultAge) errs.push('子女与父母年龄差不足 ' + p.id);
        if (!par.childIds.includes(p.id)) errs.push('亲缘不对称 ' + p.id);
        if (par.status === 'dead' && par.deathYear < p.birthYear && pid === p.motherId) errs.push('母亲死后出生 ' + p.id);
      }
      if (p.status === 'alive' && p.spouseId) {
        const sp = s.people[p.spouseId];
        if (!sp || (sp.status === 'alive' && sp.spouseId !== p.id)) errs.push('配偶不互指 ' + p.id);
        if (sp && sp.status === 'alive' && P().isNative(p) && P().isNative(sp) && P().bloodWithin(s, p.id, sp.id, C().life.generationsBan)) errs.push('三代内血亲婚配 ' + p.id);
      }
      if (p.status === 'alive' && !Number.isFinite(p.progress)) errs.push('修为非数 ' + p.id);
    }
    for (const id of s.family.focusIds) if (!P().alive(s.people[id])) errs.push('重点培养对象不在世 ' + id);
    for (const r of s.relations) if (!P().alive(s.people[r.a]) || !P().alive(s.people[r.b])) errs.push('关系对引用失效');
    if (!s.ended && P().living(s).length && !P().alive(s.people[s.family.headId])) errs.push('家主不在世');
    for (const p of P().living(s)) if (p.duty.type === 'mentor' && p.duty.target && !P().alive(s.people[p.duty.target])) errs.push('导师对象失效 ' + p.id);
    if (errs.length) {
      const e = new Error('状态自检失败：' + errs.slice(0, 5).join('；'));
      e.errors = errs;
      throw e;
    }
    return true;
  };

  FX.Sim = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
