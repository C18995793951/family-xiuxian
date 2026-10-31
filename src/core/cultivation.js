/* ============================================================
 * cultivation —— 修炼速度、境界晋升与突破（主角与 NPC 共用一套公式）
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;

  const CU = {};

  CU.techFit = (s, p) => {
    const t = P().techOf(s, p);
    if (!t.elements.length) return 1;
    if (p.root.type === 'mutant') return C().fitMin + 0.1; // 变异灵根需特定功法
    const overlap = p.root.elements.filter((e) => t.elements.includes(e)).length / t.elements.length;
    return Math.round((C().fitMin + (C().fitMax - C().fitMin) * overlap) * 100) / 100;
  };

  CU.techCapped = (s, p) => {
    const t = P().techOf(s, p);
    return !!t.capMajor && (p.realm.major > t.capMajor || (p.realm.major === t.capMajor && p.realm.stage >= t.capStage)) && P().isFull(p);
  };

  // 修炼速度构成（每年，可追溯）。opts.pill：是否在聚气丹药效内
  CU.breakdown = (s, p, opts) => {
    const cf = C(), cc = cf.cultivation;
    const F = [];
    if (!P().hasRoot(p) || p.realm.major === 0) return { total: 0, factors: [{ label: '无灵根或未入道', value: 0 }] };
    F.push({ label: '境界基础值', value: cf.realms.baseGain[p.realm.major] });
    F.push({ label: '灵根（' + cf.roots.names[p.root.type] + '）', value: cf.roots.speed[p.root.type] });
    F.push({ label: '资质 ' + p.aptitude, value: Math.round((cc.aptBase + (p.aptitude / 100) * cc.aptRange) * 100) / 100 });
    const t = P().techOf(s, p);
    F.push({ label: '功法 ' + t.name + '（适配 ' + CU.techFit(s, p) + '）', value: Math.round(t.mult * CU.techFit(s, p) * 100) / 100 });
    const place = s.places[p.locationId];
    const qi = CU.qiFor(s, p);
    F.push({ label: '灵气 ' + qi + ' 级' + (place ? '（' + place.name + (qi < place.qi ? '，外人只能在山门外修炼' : '') + '）' : ''), value: cc.qiMult[qi] });
    if (opts && opts.pill) F.push({ label: '聚气丹', value: 1 + cc.qijuBonus });
    if (P().isOld(s, p)) F.push({ label: '年老', value: cc.oldAgeCoef });
    if (p.health.state === 'light' || p.health.state === 'heavy') F.push({ label: p.health.state === 'heavy' ? '重伤' : '轻伤', value: cc.injury[p.health.state] });
    if (CU.techCapped(s, p)) F.push({ label: '功法残缺，已到尽头', value: 0 });
    let total = 1;
    for (const f of F) total *= f.value;
    return { total: Math.round(total * 100) / 100, factors: F };
  };

  // 此人在所在地能借到的灵气（宗门、家族驻地只对自己人开放）
  CU.qiFor = (s, p) => {
    const place = s.places[p.locationId];
    if (!place) return 1;
    const lim = C().cultivation.outsiderQi[place.type];
    if (lim !== undefined && place.factionId && p.factionId !== place.factionId) return Math.min(place.qi, lim);
    return place.qi;
  };

  CU.updateLifespan = (s, p) => { p.lifespanMax = P().lifespanMaxFor(p.realm.major, p.realm.stage); };

  // 炼气一至八层修满自动晋升；返回晋升的层数
  CU.autoAdvance = (s, p) => {
    let n = 0;
    while (p.realm.major === 1 && p.realm.stage < 9 && p.progress >= P().need(p) && n < 10) {
      p.progress -= P().need(p);
      p.realm.stage++;
      n++;
      if (P().isPlayer(s, p)) H().add(s, { type: 'realm', tags: ['修炼'], actors: [p.id], key: 'realm_up', params: { name: p.name, realm: P().realmName(p) }, severity: 2, pov: true });
    }
    const rk = P().realmRank(p);
    if (rk > p.peakRank) p.peakRank = rk;
    return n;
  };

  // 加修为（已到瓶颈时封顶，等待突破）；返回实际增加的修为
  CU.addProgress = (s, p, amount) => {
    if (p.realm.major === 0 || amount <= 0) return 0;
    const before = p.progress + CU.levelBase(p);
    p.progress += amount;
    if (p.realm.major > 1 || p.realm.stage === 9) p.progress = Math.min(p.progress, P().need(p));
    CU.autoAdvance(s, p);
    if (p.realm.major > 1 || p.realm.stage === 9) p.progress = Math.min(p.progress, P().need(p));
    return Math.max(0, p.progress + CU.levelBase(p) - before);
  };
  // 本大境界内已累计的修为（用来算跨层增长）
  CU.levelBase = (p) => {
    if (p.realm.major !== 1) return 0;
    let b = 0;
    for (let i = 0; i < p.realm.stage - 1; i++) b += C().realms.need[1][i];
    return b;
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

  const inv = (s, p) => (P().isPlayer(s, p) ? s.player.inv : {});

  CU.canAttempt = (s, p) => {
    if (!P().alive(p) || p.realm.major === 0) return { ok: false, reason: '尚未入道' };
    const k = CU.gateKind(p);
    if (!k) return { ok: false, reason: p.realm.major === 3 && p.realm.stage === 3 ? '已到本版境界上限' : '炼气前八层修满自动晋升' };
    if (!P().isFull(p)) return { ok: false, reason: '修为未圆满（' + Math.floor(p.progress) + '/' + P().need(p) + '）' };
    if (s.t < p.restUntil) return { ok: false, reason: '上次失败后需休养，至 ' + FX.T.fmt(p.restUntil) };
    if (p.health.state === 'heavy') return { ok: false, reason: '重伤未愈' };
    const t = P().techOf(s, p);
    if (k === 'jindan') {
      if (t.capMajor === 2) return { ok: false, reason: t.name + '残缺，无法冲击金丹' };
      if (CU.qiFor(s, p) < C().breakthrough.jindan.minQi) return { ok: false, reason: '需在灵气 ' + C().breakthrough.jindan.minQi + ' 级以上之地结丹' };
      if (P().isPlayer(s, p) && !(inv(s, p).ningdan > 0)) return { ok: false, reason: '缺少凝丹灵物' };
    }
    return { ok: true, kind: k };
  };

  // 成功率与每一项修正（决定前必须列出）。opts.pill：NPC 是否有筑基丹
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
    const hasPill = P().isPlayer(s, p) ? inv(s, p).zhuji > 0 : !!(opts && opts.pill);
    if (k === 'zhuji') {
      if (hasPill) parts.push({ label: '服用筑基丹', value: B.zhuji.pill });
      else parts.push({ label: '无筑基丹', value: -B.zhuji.noPillPenalty });
    }
    if (k === 'jindan') parts.push({ label: '凝丹灵物', value: B.jindan.pill });
    const qi = CU.qiFor(s, p);
    if (qi >= B.qiBonusMin) parts.push({ label: '灵气 ' + qi + ' 级之地', value: B.qiBonus });
    const accYears = Math.floor(p.fullDays / C().daysPerYear);
    if (accYears > 0) parts.push({ label: '圆满后积累 ' + accYears + ' 年', value: Math.min(B.accumMax, accYears * B.accumPerYear) });
    if (p.failCount > 0) parts.push({ label: '此前失败 ' + p.failCount + ' 次', value: -p.failCount * B.failPenalty });
    if (p.traits.includes('孤傲')) parts.push({ label: '孤傲', value: C().traits.proudBreak });
    if (p.root.mutant === '冰') parts.push({ label: '冰灵根', value: C().roots.mutantIceBreak });
    if (p.health.state === 'light') parts.push({ label: '轻伤', value: -5 });
    let total = parts.reduce((a, x) => a + x.value, 0);
    const max = k === 'minor' ? B.max : B.majorMax;
    total = U.clamp(total, B.min, max);
    const death = k === 'minor' ? 0 : B[k].deathChance;
    return { kind: k, target: CU.targetName(p), chance: Math.round(total), parts, max, death: Math.round(death * 1000) / 10, usesPill: k === 'zhuji' && hasPill, days: cfg.days };
  };

  CU.attempt = (s, p, opts) => {
    const can = CU.canAttempt(s, p);
    if (!can.ok) return { ok: false, error: can.reason };
    const ch = CU.chance(s, p, opts);
    const B = C().breakthrough;
    const target = ch.target;
    const r = s.rng;
    const isPlayer = P().isPlayer(s, p);
    if (isPlayer && ch.usesPill) s.player.inv.zhuji--;
    if (isPlayer && ch.kind === 'jindan') s.player.inv.ningdan--;
    const success = R.next(r) * 100 < ch.chance;
    const res = { ok: true, success, chance: ch.chance, target, kind: ch.kind };
    const causes = (opts && opts.causeIds) || [];
    const fac = P().factionName(s, p);
    const known = isPlayer || P().relValue(s, p.id, s.player.id) !== 0;
    if (success) {
      p.progress = 0;
      if (ch.kind === 'zhuji') p.realm = { major: 2, stage: 1 };
      else if (ch.kind === 'jindan') p.realm = { major: 3, stage: 1 };
      else p.realm = { major: p.realm.major, stage: p.realm.stage + 1 };
      p.fullDays = 0;
      p.failCount = 0;
      CU.updateLifespan(s, p);
      if (P().realmRank(p) > p.peakRank) p.peakRank = P().realmRank(p);
      if (isPlayer) {
        res.hid = H().add(s, {
          type: 'breakthrough', tags: ['突破', '成功'], actors: [p.id], key: 'break_ok', pov: true,
          params: { name: p.name, target, chance: ch.chance, life: P().lifespanTotal(p), ok: true },
          severity: ch.kind === 'minor' ? 3 : 5, causeIds: causes,
        });
        H().markFirst(s, 'break_' + ch.kind, res.hid);
      } else if (ch.kind !== 'minor') {
        res.hid = H().add(s, {
          type: 'npc_break', tags: ['突破'], actors: [p.id], factions: p.factionId ? [p.factionId] : [], key: 'npc_break', pov: known,
          params: { name: p.name, faction: fac, target, ok: true }, severity: ch.kind === 'jindan' ? 4 : 2, causeIds: causes,
        });
      }
    } else {
      p.failCount++;
      p.restUntil = s.t + B.restYears * C().daysPerYear;
      p.fullDays = 0;
      let loss;
      if (ch.kind === 'minor') {
        p.progress = Math.floor(p.progress * (1 - B.minor.failLoss));
        loss = '修为受损一成';
      } else {
        const cfg = B[ch.kind];
        const frac = R.range(r, cfg.failLossMin, cfg.failLossMax);
        p.progress = Math.floor(p.progress * (1 - frac));
        P().injure(s, p, 'heavy');
        loss = '修为跌落 ' + Math.round(frac * 100) + '%，身受重伤';
      }
      if (isPlayer) {
        res.hid = H().add(s, {
          type: 'breakthrough', tags: ['突破', '失败'], actors: [p.id], key: 'break_fail', pov: true,
          params: { name: p.name, target, chance: ch.chance, loss, ok: false }, severity: ch.kind === 'minor' ? 2 : 4, causeIds: causes,
        });
      }
      if (ch.kind !== 'minor' && R.chance(r, ch.death / 100)) {
        P().kill(s, p, '冲击' + target + '失败', res.hid ? [res.hid] : [], { key: 'break' });
        res.died = true;
      }
    }
    return res;
  };

  /* ---------- NPC 一年的修炼（世界模拟）---------- */
  CU.npcYear = (s, p) => {
    if (!P().alive(p) || p.realm.major === 0) return;
    const cc = C().cultivation;
    const dil = R.range(s.rng, cc.npcDiligence[0], cc.npcDiligence[1]);
    const rate = CU.breakdown(s, p).total;
    if (P().isFull(p)) { p.fullDays += C().daysPerYear; } else CU.addProgress(s, p, rate * dil);
    if (P().isFull(p) && CU.gateKind(p) && CU.canAttempt(s, p).ok && R.chance(s.rng, C().breakthrough.npcTryChance)) {
      const fac = p.factionId && s.factions[p.factionId];
      const pillP = C().breakthrough.npcPill[fac ? fac.type : 'none'];
      CU.attempt(s, p, { pill: R.chance(s.rng, pillP) });
    }
  };

  FX.CU = CU;
})(typeof globalThis !== 'undefined' ? globalThis : this);
