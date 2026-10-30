/* ============================================================
 * cultivation —— 修炼速度、丹药分配、境界晋升与突破
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;

  const CU = {};

  CU.techFit = (s, p) => {
    const t = P().techOf(s, p);
    if (!t.elements.length) return 1;
    if (p.root.type === 'mutant') return C().fitMin + 0.1; // 变异灵根需特定功法
    const overlap = p.root.elements.filter((e) => t.elements.includes(e)).length / t.elements.length;
    return U.round1((C().fitMin + (C().fitMax - C().fitMin) * overlap) * 100) / 100;
  };

  CU.isCultivator = (s, p) => P().alive(p) && P().hasRoot(p) && P().isAdult(s, p) && p.realm.major > 0;

  // 修炼速度构成（可追溯，第 4 章原则 12）
  CU.breakdown = (s, p, opts) => {
    const cf = C(), cc = cf.cultivation;
    const F = [];
    if (!P().hasRoot(p) || p.realm.major === 0) return { total: 0, factors: [{ label: '无灵根或未入道', value: 0 }] };
    const base = cf.realms.baseGain[p.realm.major];
    F.push({ label: '境界基础值', value: base });
    F.push({ label: '灵根（' + cf.roots.names[p.root.type] + '）', value: cf.roots.speed[p.root.type] });
    F.push({ label: '资质 ' + p.aptitude, value: U.round1((cc.aptBase + (p.aptitude / 100) * cc.aptRange) * 100) / 100 });
    const t = P().techOf(s, p);
    F.push({ label: '功法 ' + t.name + '（适配 ' + CU.techFit(s, p) + '）', value: U.round1(t.mult * CU.techFit(s, p) * 100) / 100 });
    const cave = s.family.buildings.cave || 0;
    F.push({ label: '洞府灵脉 ' + cave + ' 级', value: 1 + cc.caveBonus[cave] * FX.Econ.deficitEff(s) });
    const pill = opts && opts.pill;
    if (pill) F.push({ label: '聚气丹', value: 1 + cc.qijuBonus });
    const dt = p.duty.type;
    const dc = dt === 'seclusion' ? cc.dutyCoef.seclusion : dt === 'travel' ? cc.dutyCoef.travel : cc.dutyCoef.other;
    F.push({ label: '差事（' + (dt ? cf.duties[dt].name : '无') + '）', value: dc });
    const alloc = FX.Family.ruleBlend(s, 'allocation', (r) => {
      const rr = cf.rules.allocation[r];
      if (r === 'concentrate') return s.family.focusIds.includes(p.id) ? rr.focusMult : rr.otherMult;
      return rr.otherMult;
    });
    if (alloc !== 1) F.push({ label: '家规（' + cf.rules.allocation[s.family.rules.allocation].name + '）', value: U.round1(alloc * 100) / 100 });
    if (P().isOld(s, p)) F.push({ label: '年老', value: cc.oldAgeCoef });
    if (p.health.state !== 'healthy') F.push({ label: p.health.state === 'heavy' ? '重伤' : '轻伤', value: p.health.state === 'heavy' ? 0.2 : 0.6 });
    if (CU.hasMentor(s, p)) F.push({ label: '长辈指点', value: 1 + cc.mentorBonus });
    if (t.capMajor && (p.realm.major > t.capMajor || (p.realm.major === t.capMajor && p.realm.stage >= t.capStage)) && P().isFull(p)) {
      F.push({ label: '功法残缺，已到尽头', value: 0 });
    }
    let total = 1;
    for (const f of F) total *= f.value;
    return { total: Math.round(total * 100) / 100, factors: F };
  };

  CU.hasMentor = (s, p) => P().living(s).some((m) => m.duty.type === 'mentor' && m.duty.target === p.id);

  // 导师名下的学生（自动分配：每位导师带不超过 3 名少年/新成年者）
  CU.assignMentees = (s) => {
    const mentors = P().living(s).filter((m) => m.duty.type === 'mentor');
    const taken = new Set();
    const youth = P().living(s).filter((q) => P().hasRoot(q) && P().age(s, q) >= C().life.rootTestAge && P().age(s, q) < 26).sort((a, b) => b.aptitude - a.aptitude);
    for (const m of mentors) {
      const list = [];
      for (const y of youth) {
        if (list.length >= C().cultivation.mentorMaxStudents) break;
        if (taken.has(y.id) || y.id === m.id) continue;
        taken.add(y.id); list.push(y.id);
      }
      m.duty.students = list;
    }
  };
  CU.mentored = (s, p) => P().living(s).some((m) => m.duty.type === 'mentor' && (m.duty.students || []).includes(p.id));

  // 少年启蒙：6 岁测灵根后、16 岁前自动修到炼气一层（启蒙）
  CU.youthTick = (s, p) => {
    if (!P().hasRoot(p)) return;
    const age = P().age(s, p);
    if (age < C().life.rootTestAge) return;
    if (p.realm.major === 0) {
      p.realm = { major: 1, stage: 1 };
      p.progress = 0;
      CU.updateLifespan(s, p);
      return;
    }
    if (age < C().life.adultAge && p.realm.major === 1 && p.realm.stage < 3) {
      let g = 3 * C().roots.speed[p.root.type] * (C().cultivation.aptBase + (p.aptitude / 100) * C().cultivation.aptRange);
      if (CU.mentored(s, p)) g *= 1 + C().cultivation.mentorBonus;
      p.progress += g;
      CU.autoAdvance(s, p);
    }
  };

  CU.updateLifespan = (s, p) => {
    p.lifespanMax = P().lifespanMaxFor(p.realm.major, p.realm.stage);
    p.lifespanLeft = P().lifespanLeft(s, p);
  };

  // 炼气一至八层自动晋升
  CU.autoAdvance = (s, p) => {
    let n = 0;
    while (p.realm.major === 1 && p.realm.stage < 9 && p.progress >= P().need(p) && n++ < 10) {
      p.progress -= P().need(p);
      p.realm.stage++;
      if (P().isAdult(s, p) && p.realm.stage >= 5) {
        FX.H.add(s, { type: 'realm', tags: ['修炼'], actors: [p.id], key: 'realm_up', params: { name: p.name, realm: P().realmName(p) }, severity: p.realm.stage >= 8 ? 2 : 1 });
      }
    }
    const rk = P().realmRank(p);
    if (rk > p.peakRank) p.peakRank = rk;
  };

  /* ---------- 年度修炼（只处理存活且有差事者）---------- */
  CU.yearly = (s) => {
    CU.assignMentees(s);
    const cultivators = P().living(s).filter((p) => CU.isCultivator(s, p) && p.duty.type);
    // 丹药分配
    const pillSet = new Set();
    if (s.family.settings.usePills) {
      let stock = Math.max(0, s.family.resources.qiju - s.family.settings.pillReserve);
      const order = CU.pillOrder(s, cultivators.filter((p) => p.duty.type === 'seclusion' || p.duty.type === 'travel'));
      for (const p of order) {
        if (stock <= 0) break;
        if (P().isFull(p)) continue;
        pillSet.add(p.id); stock--; s.family.resources.qiju--;
      }
    }
    for (const p of cultivators) {
      const b = CU.breakdown(s, p, { pill: pillSet.has(p.id) });
      if (P().isFull(p)) {
        if (p.duty.type === 'seclusion') p.fullYears = Math.min(p.fullYears + 1, 20);
        continue;
      }
      p.progress += b.total;
      if (p.realm.major > 1 || p.realm.stage === 9) p.progress = Math.min(p.progress, P().need(p));
      CU.autoAdvance(s, p);
      if (P().isFull(p) && p.duty.type === 'seclusion') p.fullYears = 0;
      // 小瓶颈按设置自动尝试
      if (P().isFull(p) && p.realm.major >= 2 && p.realm.stage < 3 && s.family.settings.autoMinor && s.year >= p.restUntilYear) {
        CU.attempt(s, p, { auto: true });
      }
    }
    // 少年
    for (const p of P().living(s)) if (!P().isAdult(s, p)) CU.youthTick(s, p);
  };

  CU.pillOrder = (s, list) => {
    const rule = s.family.rules.allocation;
    const L = list.slice();
    if (rule === 'concentrate') {
      L.sort((a, b) => (s.family.focusIds.includes(b.id) - s.family.focusIds.includes(a.id)) || (b.aptitude - a.aptitude) || (a.id < b.id ? -1 : 1));
    } else if (rule === 'contribution') {
      L.sort((a, b) => (b.contribution - a.contribution) || (a.id < b.id ? -1 : 1));
    } else {
      L.sort((a, b) => (a.id < b.id ? -1 : 1));
      const k = L.length ? s.year % L.length : 0;
      return L.slice(k).concat(L.slice(0, k));
    }
    return L;
  };

  /* ---------- 突破 ---------- */
  CU.gateKind = (p) => {
    if (p.realm.major === 1 && p.realm.stage === 9) return 'zhuji';
    if (p.realm.major === 2 && p.realm.stage < 3) return 'minor';
    if (p.realm.major === 2 && p.realm.stage === 3) return 'jindan';
    if (p.realm.major === 3 && p.realm.stage < 3) return 'minor';
    return null;
  };
  CU.targetName = (p) => {
    const k = CU.gateKind(p);
    if (k === 'zhuji') return '筑基';
    if (k === 'jindan') return '金丹';
    if (k === 'minor') return C().realms.names[p.realm.major] + C().realms.stageNames[p.realm.major][p.realm.stage];
    return '';
  };

  CU.guardianOf = (s, p) => P().living(s).find((q) => q.id !== p.id && q.realm.major >= 2 && q.duty.type !== 'travel' && q.health.state === 'healthy');

  CU.canAttempt = (s, p) => {
    if (!CU.isCultivator(s, p)) return { ok: false, reason: '不是成年修士' };
    const k = CU.gateKind(p);
    if (!k) return { ok: false, reason: p.realm.major === 3 && p.realm.stage === 3 ? '本版境界上限' : '炼气前八层修满自动晋升' };
    if (!P().isFull(p)) return { ok: false, reason: '修为未圆满（' + Math.floor(p.progress) + '/' + P().need(p) + '）' };
    if (s.year < p.restUntilYear) return { ok: false, reason: '上次失败后休养中，至第 ' + p.restUntilYear + ' 年' };
    if (p.health.state === 'heavy') return { ok: false, reason: '重伤未愈' };
    const t = P().techOf(s, p);
    if (k === 'jindan') {
      if (t.capMajor === 2) return { ok: false, reason: t.name + '残缺，无法冲击金丹（需补全残卷，阶段 4 开放）' };
      if ((s.family.buildings.cave || 0) < C().breakthrough.jindan.minCave) return { ok: false, reason: '洞府灵脉需不低于 3 级' };
      if (s.family.resources.ningdan < 1) return { ok: false, reason: '缺凝丹丹药/材料' };
    }
    return { ok: true, kind: k };
  };

  // 成功率与每一项修正（决定前必须列出）
  CU.chance = (s, p, opts) => {
    const B = C().breakthrough;
    const k = CU.gateKind(p);
    if (!k) return null;
    const parts = [];
    const cfg = k === 'minor' ? B.minor : B[k];
    parts.push({ label: '基础成功率', value: cfg.base });
    parts.push({ label: '资质 ' + p.aptitude, value: U.round1((p.aptitude - 50) * B.aptitudeFactor) });
    parts.push({ label: C().roots.names[p.root.type], value: C().roots.breakMod[p.root.type] });
    const fit = CU.techFit(s, p);
    parts.push({ label: '功法适配', value: U.round1(U.clamp(((fit - 1) / 0.25) * C().fitBreakMax, -C().fitBreakMax, C().fitBreakMax)) + (P().techOf(s, p).breakBonus || 0) });
    const usePill = !opts || opts.usePill !== false;
    if (k === 'zhuji') {
      if (s.family.resources.zhuji > 0 && usePill) parts.push({ label: '服用筑基丹', value: B.zhuji.pill });
      else parts.push({ label: '无筑基丹', value: -B.zhuji.noPillPenalty });
    }
    if (k === 'jindan' && s.family.resources.ningdan > 0) parts.push({ label: '凝丹丹药', value: B.jindan.pill });
    if ((s.family.buildings.cave || 0) >= B.caveBonusMinLevel) parts.push({ label: '洞府灵脉 ≥3 级', value: B.caveBonus });
    const g = CU.guardianOf(s, p);
    if (g) parts.push({ label: '护法：' + g.name, value: B.guardianBonus });
    if (p.fullYears > 0) parts.push({ label: '圆满后积累 ' + p.fullYears + ' 年', value: Math.min(B.accumMax, p.fullYears * B.accumPerYear) });
    if (p.failCount > 0) parts.push({ label: '此前失败 ' + p.failCount + ' 次', value: -p.failCount * B.failPenalty });
    if (p.traits.includes('孤傲')) parts.push({ label: '孤傲', value: C().traits.proudBreak });
    if (p.flags.includes('心魔')) parts.push({ label: '心魔', value: -10 });
    let total = parts.reduce((a, x) => a + x.value, 0);
    const max = k === 'minor' ? B.max : B.majorMax;
    total = U.clamp(total, B.min, max);
    const death = k === 'minor' ? 0 : B[k].deathChance * (g ? B.guardianDeathFactor : 1);
    return { kind: k, target: CU.targetName(p), chance: Math.round(total), parts, max, death: Math.round(death * 1000) / 10, guardian: g ? g.id : null };
  };

  CU.attempt = (s, p, opts) => {
    const can = CU.canAttempt(s, p);
    if (!can.ok) return { ok: false, error: can.reason };
    const ch = CU.chance(s, p, opts);
    const B = C().breakthrough;
    const target = ch.target;
    const r = s.rng;
    if (ch.kind === 'zhuji' && s.family.resources.zhuji > 0 && !(opts && opts.usePill === false)) s.family.resources.zhuji--;
    if (ch.kind === 'jindan') s.family.resources.ningdan--;
    const roll = R.next(r) * 100;
    const success = roll < ch.chance;
    const res = { ok: true, success, chance: ch.chance, target, kind: ch.kind };
    const causes = (opts && opts.causeIds) || [];
    if (success) {
      p.progress = 0;
      if (ch.kind === 'zhuji') p.realm = { major: 2, stage: 1 };
      else if (ch.kind === 'jindan') p.realm = { major: 3, stage: 1 };
      else p.realm = { major: p.realm.major, stage: p.realm.stage + 1 };
      p.fullYears = 0;
      p.failCount = 0;
      CU.updateLifespan(s, p);
      if (P().realmRank(p) > p.peakRank) p.peakRank = P().realmRank(p);
      const hid = FX.H.add(s, {
        type: 'breakthrough', tags: ['突破', '成功'], actors: [p.id], key: 'break_ok',
        params: { name: p.name, target, chance: ch.chance, life: p.lifespanMax, ok: true },
        severity: ch.kind === 'minor' ? 2 : ch.kind === 'zhuji' ? 4 : 5, causeIds: causes,
      });
      res.hid = hid;
      if (ch.kind === 'zhuji' && FX.H.markFirst(s, 'firstZhuji', hid)) FX.Family.milestone(s, 'firstZhuji', '首位筑基修士' + p.name, hid);
      if (ch.kind === 'jindan' && FX.H.markFirst(s, 'firstJindan', hid)) {
        FX.Family.milestone(s, 'firstJindan', '首位金丹修士' + p.name, hid);
        s.family.prestige = U.clamp(s.family.prestige + 200, 0, C().familyPrestige.max);
      }
      FX.H.markRecord(s, 'highestRealm', P().realmRank(p), hid);
      if (s.family.headId === p.id) FX.Family.addHeadPrestige(s, ch.kind === 'minor' ? 3 : 10);
      s.family.prestige = U.clamp(s.family.prestige + (ch.kind === 'minor' ? 10 : ch.kind === 'zhuji' ? 60 : 150) * FX.Family.prestigeMult(s), 0, C().familyPrestige.max);
    } else {
      p.failCount++;
      p.restUntilYear = s.year + B.restYears;
      p.fullYears = 0;
      let loss;
      if (ch.kind === 'minor') {
        p.progress = Math.floor(p.progress * (1 - B.minor.failLoss));
        loss = '修为受损一成';
      } else {
        const cfg = B[ch.kind];
        const frac = R.range(r, cfg.failLossMin, cfg.failLossMax);
        p.progress = Math.floor(p.progress * (1 - frac));
        p.health = { state: 'heavy', recoverYears: B.heavyInjuryYears };
        loss = '修为跌落 ' + Math.round(frac * 100) + '%，身受重伤';
      }
      const hid = FX.H.add(s, {
        type: 'breakthrough', tags: ['突破', '失败'], actors: [p.id], key: 'break_fail',
        params: { name: p.name, target, chance: ch.chance, loss, ok: false },
        severity: ch.kind === 'minor' ? 2 : 3, causeIds: causes,
      });
      res.hid = hid;
      FX.H.markFirst(s, 'firstBreakFail', hid);
      if (ch.kind !== 'minor' && R.chance(r, ch.death / 100)) {
        P().kill(s, p, '冲击' + target + '失败身死', [hid], { key: 'break' });
        res.died = true;
      }
    }
    return res;
  };

  FX.CU = CU;
})(typeof globalThis !== 'undefined' ? globalThis : this);
