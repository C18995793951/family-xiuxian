/* ============================================================
 * family —— 家主、太上长老、继承、分支支持度、家规、锋芒、自主行为、请求
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;

  const F = {};

  /* ---------- 家规生效（过渡期）---------- */
  F.ruleBlend = (s, cat, fn) => {
    const cur = s.family.rules[cat];
    const t = s.family.rulesChangedTurn[cat];
    const prev = s.family.rulesPrev[cat];
    if (t === null || t === undefined || !prev) return fn(cur);
    if (s.turn === t) return fn(prev);
    if (s.turn === t + 1) return 0.5 * fn(prev) + 0.5 * fn(cur);
    return fn(cur);
  };
  F.effectiveRule = (s, cat) => {
    const t = s.family.rulesChangedTurn[cat];
    if (t !== null && t !== undefined && s.turn === t && s.family.rulesPrev[cat]) return s.family.rulesPrev[cat];
    return s.family.rules[cat];
  };
  F.prestigeMult = (s) => F.ruleBlend(s, 'foreign', (r) => C().rules.foreign[r].prestige);

  F.addHeadPrestige = (s, d) => {
    s.family.headAuthority.prestige = U.clamp(s.family.headAuthority.prestige + d, 0, 100);
  };
  F.addSupport = (s, b, d) => {
    s.family.branches[b].support = U.clamp(s.family.branches[b].support + d, 0, 100);
  };

  F.milestone = (s, key, text, hid) => {
    if (s.family.milestones.some((m) => m.key === key)) return;
    s.family.milestones.push({ key, text, year: s.year, hid });
    H().add(s, { type: 'milestone', tags: ['里程碑'], key: 'milestone', params: { what: text }, severity: 4, causeIds: [hid] });
  };

  /* ---------- 战力 ---------- */
  F.strongest = (s) => {
    let best = null, bp = -1;
    for (const p of P().living(s)) {
      const v = P().power(s, p);
      if (v > bp || (v === bp && best && p.id < best.id)) { bp = v; best = p; }
    }
    return best && bp > 0 ? best : null;
  };
  // 护族战力 = 最高战力者 + 驻守在家者
  F.defensePower = (s) => {
    const top = F.strongest(s);
    let v = top ? P().power(s, top) : 0;
    const parts = top ? [{ label: top.name + '（最高战力）', value: U.round1(v) }] : [];
    for (const p of P().living(s)) {
      if (top && p.id === top.id) continue;
      if (p.duty.type === 'guard') { const pw = P().power(s, p); v += pw; parts.push({ label: p.name + '（驻守）', value: U.round1(pw) }); }
    }
    return { total: U.round1(v), parts };
  };
  F.successorCultivators = (s) => {
    const top = F.strongest(s);
    return P().living(s).filter((p) => (!top || p.id !== top.id) && (p.realm.major >= 2 || (p.realm.major === 1 && p.realm.stage >= 7))).sort((a, b) => P().realmRank(b) - P().realmRank(a) || b.progress - a.progress);
  };

  F.updateElder = (s) => {
    const top = F.strongest(s);
    const old = s.family.elderIds[0] || null;
    const nid = top ? top.id : null;
    if (nid !== old) {
      s.family.elderIds = nid ? [nid] : [];
      if (nid && old) H().add(s, { type: 'elder', tags: ['继承'], actors: [nid], key: 'elder_change', params: { name: top.name, power: U.round1(P().power(s, top)) }, severity: 2 });
    }
  };

  /* ---------- 锋芒 ---------- */
  F.edgeTarget = (s) => {
    const ec = C().edge;
    const dp = F.defensePower(s).total;
    const powerTerm = Math.min(ec.powerMax, (dp / ec.neighborPower) * 40);
    let lv = 0;
    for (const k in s.family.buildings) lv += s.family.buildings[k] || 0;
    const ind = Math.min(ec.industryMax, lv);
    const pol = F.ruleBlend(s, 'foreign', (r) => C().rules.foreign[r].edge);
    const res = s.family.edgeResidue;
    const total = U.clamp(powerTerm + ind + pol + res, 0, 100);
    return { total: U.round1(total), parts: [{ label: '战力项', value: U.round1(powerTerm) }, { label: '产业项（建筑总等级）', value: ind }, { label: '对外政策', value: pol }, { label: '近期事件残留', value: U.round1(res) }] };
  };
  F.edgeYearly = (s) => {
    const t = F.edgeTarget(s).total;
    const step = C().edge.maxStep;
    s.family.edge = U.round1(U.clamp(s.family.edge + U.clamp(t - s.family.edge, -step, step), 0, 100));
  };

  /* ---------- 继承 ---------- */
  F.candidates = (s) => P().living(s).filter((p) => P().isAdult(s, p) && P().isNative(p) && !p.flags.includes('逐出'));

  F.succScore = (s, p, prevId, ruleOverride) => {
    let rule = ruleOverride || F.effectiveRule(s, 'succession');
    const age = P().age(s, p);
    const ability = P().realmRank(p) * 4 + p.aptitude * 0.3 + p.prestige * 0.4 + (age >= 25 && age <= 80 ? 10 : 0) - (P().isOld(s, p) ? 10 : 0);
    const blood = prevId ? P().kinship(s, prevId, p.id) * 30 : 0;
    const parts = [{ label: '能力（修为/资质/威望/年龄）', value: U.round1(ability) }];
    let score;
    if (rule === 'elders') {
      const seniors = P().living(s).filter((q) => q.id !== p.id && P().age(s, q) >= 50 && P().isNative(q));
      if (seniors.length < 2) rule = 'primogeniture';
      else {
        const elder = s.family.elderIds[0];
        let votes = 0;
        if (elder && elder !== p.id) votes += 20 * P().kinship(s, elder, p.id) + 5;
        for (const q of seniors.sort((a, b) => b.prestige - a.prestige).slice(0, 3)) {
          const rel = P().relationBetween(s, q.id, p.id);
          votes += 5 + (rel ? rel.strength / 10 : 0) + (q.branch === p.branch ? 3 : 0);
        }
        parts.push({ label: '长老推举', value: U.round1(votes) });
        score = ability + blood * 0.5 + votes;
      }
    }
    if (rule === 'primogeniture') {
      parts.push({ label: '血缘亲近', value: U.round1(blood * 1.5) });
      score = (ability + blood * 1.5) * (p.branch === 'main' ? 1 + C().rules.succession.primogeniture.mainBonus : 1);
      if (p.branch === 'main') parts.push({ label: '嫡系 +40%', value: '×1.4' });
    } else if (rule === 'merit') {
      score = ability;
    }
    return { score: U.round1(score), parts, rule };
  };

  F.rankCandidates = (s, prevId) => F.candidates(s).map((p) => ({ p, ...F.succScore(s, p, prevId) })).sort((a, b) => b.score - a.score || (a.p.id < b.p.id ? -1 : 1));

  F.acceptance = (s, heirId, prevId) => {
    const ranked = F.rankCandidates(s, prevId);
    const heir = ranked.find((x) => x.p.id === heirId);
    if (!heir || !ranked.length) return { value: 0, level: 'low' };
    const match = (heir.score / Math.max(1, ranked[0].score)) * 100;
    const own = s.family.branches[heir.p.branch].support;
    const other = s.family.branches[heir.p.branch === 'main' ? 'side' : 'main'].support;
    const v = Math.round(0.5 * match + 0.3 * own + 0.2 * other);
    const L = C().leadership;
    return { value: v, level: v >= L.accHigh ? 'high' : v >= L.accMid ? 'mid' : 'low', match: Math.round(match), rival: ranked[0].p.id !== heirId ? ranked[0].p.id : ranked[1] ? ranked[1].p.id : null };
  };

  F.newHeadPrestige = (s, p) => {
    const L = C().leadership;
    return U.clamp(L.newHeadPrestige + L.headRealmBonus[p.realm.major] + Math.round((p.prestige - 30) / 3), 5, 90);
  };

  F.installHead = (s, p, how, causeIds, accLevel) => {
    const prev = s.family.headId;
    s.family.headId = p.id;
    s.family.heirId = s.family.heirId === p.id ? null : s.family.heirId;
    let pres = F.newHeadPrestige(s, p);
    if (accLevel === 'mid') pres -= 10;
    if (accLevel === 'low') pres -= 20;
    s.family.headAuthority.prestige = U.clamp(pres, 5, 100);
    s.family.headSince = s.year;
    s.family.headList.push({ id: p.id, from: s.year });
    const hid = H().add(s, { type: 'succession', tags: ['继承', '家主'], actors: [p.id].concat(prev ? [prev] : []), key: 'head_change', params: { name: p.name, how, prestige: s.family.headAuthority.prestige }, severity: 4, causeIds });
    return hid;
  };

  F.succeed = (s, causeIds, reason) => {
    const prevId = s.family.headId;
    const ranked = F.rankCandidates(s, prevId);
    if (!ranked.length) {
      // 无合格候选人：辈分最高者暂代
      const any = P().living(s).sort((a, b) => a.birthYear - b.birthYear || (a.id < b.id ? -1 : 1))[0];
      if (!any) { s.family.headId = null; return null; }
      s.family.headId = any.id;
      s.family.headAuthority.prestige = C().leadership.interimPrestige;
      s.family.headSince = s.year;
      s.family.headList.push({ id: any.id, from: s.year, interim: true });
      const hid = H().add(s, { type: 'succession', tags: ['继承', '危机'], actors: [any.id], key: 'head_interim', params: { name: any.name }, severity: 4, causeIds });
      FX.Ev.spawn(s, 'S02', { person: any.id }, [hid]);
      return hid;
    }
    let heir = s.family.heirId && s.people[s.family.heirId];
    let how;
    if (heir && P().alive(heir) && ranked.some((x) => x.p.id === heir.id)) how = '奉前任指定';
    else { heir = ranked[0].p; how = '按家规（' + C().rules.succession[ranked[0].rule].name + '）推定'; }
    const acc = F.acceptance(s, heir.id, prevId);
    const hid = F.installHead(s, heir, how + '，族人接受度' + { high: '高', mid: '中', low: '低' }[acc.level], causeIds, acc.level);
    if (acc.level === 'mid') { F.addSupport(s, heir.branch === 'main' ? 'side' : 'main', -8); }
    if (acc.level === 'low') {
      F.addSupport(s, 'main', -10); F.addSupport(s, 'side', -10);
      if (acc.rival) FX.Ev.spawn(s, 'S01', { person: heir.id, rival: acc.rival }, [hid]);
    }
    s.family.heirId = null;
    return hid;
  };

  F.onDeath = (s, p, hid) => {
    if (s.family.heirId === p.id) s.family.heirId = null;
    const wasElder = s.family.elderIds.includes(p.id);
    if (s.family.headId === p.id) F.succeed(s, [hid], 'death');
    if (wasElder) {
      F.updateElder(s);
      // 老祖寿元链终点：没有筑基后继
      if (p.realm.major >= 1 && !P().living(s).some((q) => q.realm.major >= 2)) {
        s.family.wolvesUntil = s.turn + 4;
        s.family.edgeResidue += 10;
        if (P().natives(s).length) FX.Ev.spawn(s, 'C06X', { person: s.family.headId, dead: p.id }, [hid]);
      }
    }
  };

  // 家主失去统治能力（重伤超过一个回合）由 simulation 检查

  F.designateHeir = (s, id) => {
    const p = s.people[id];
    if (!p || !F.candidates(s).includes(p)) return { ok: false, error: '此人不具备继承资格（需成年、在世、本族血脉）' };
    if (p.id === s.family.headId) return { ok: false, error: '已是家主' };
    s.family.heirId = id;
    const acc = F.acceptance(s, id, s.family.headId);
    const hid = H().add(s, { type: 'heir', tags: ['继承'], actors: [id], key: 'event', params: { title: '指定继承人', choice: '家主立' + p.name + '为继承人', result: '族人接受度 ' + acc.value + '（' + { high: '高', mid: '中', low: '低' }[acc.level] + '）' }, severity: 2 });
    return { ok: true, acceptance: acc, hid };
  };

  F.abdicate = (s) => {
    const heirId = s.family.heirId;
    if (!heirId) return { ok: false, error: '需先指定继任家主' };
    const acc = F.acceptance(s, heirId, s.family.headId);
    if (acc.value < C().leadership.abdicateMinAcceptance) return { ok: false, error: '继任者接受度不足（' + acc.value + '），族人不服' };
    const old = s.people[s.family.headId];
    const heir = s.people[heirId];
    const hid = H().add(s, { type: 'succession', tags: ['继承', '退位'], actors: [old.id, heir.id], key: 'abdicate', params: { old: old.name, name: heir.name }, severity: 4 });
    F.installHead(s, heir, '前任退位禅让', [hid], acc.level);
    old.flags.push('退位');
    return { ok: true, hid };
  };

  /* ---------- 阻力判定 ---------- */
  F.resistChance = (s, branch) => {
    const pres = s.family.headAuthority.prestige;
    const sup = branch ? s.family.branches[branch].support : (s.family.branches.main.support + s.family.branches.side.support) / 2;
    return U.clamp(C().leadership.resistBase + (pres - 50) / 100 + (sup - 50) / 200, 0.1, 0.95);
  };
  F.resist = (s, branch) => {
    const c = F.resistChance(s, branch);
    return { passed: R.chance(s.rng, c), chance: Math.round(c * 100) };
  };

  /* ---------- 家规修改 ---------- */
  F.ruleAdverse = (s, cat, to) => {
    if (cat === 'succession') return to === 'primogeniture' ? 'side' : to === 'merit' ? 'main' : null;
    if (cat === 'allocation') {
      if (to !== 'concentrate') return null;
      const focusBranches = s.family.focusIds.map((id) => s.people[id] && s.people[id].branch);
      return focusBranches.includes('side') ? 'main' : 'side';
    }
    return null;
  };
  F.ruleCooldownLeft = (s, cat) => {
    const t = s.family.rulesChangedTurn[cat];
    if (t === null || t === undefined) return 0;
    return Math.max(0, t + C().rules.cooldownTurns - s.turn);
  };
  F.changeRule = (s, cat, to) => {
    const cf = C().rules;
    if (!cf[cat] || !cf[cat][to]) return { ok: false, error: '无此家规' };
    if (s.family.rules[cat] === to) return { ok: false, error: '已是现行家规' };
    const cd = F.ruleCooldownLeft(s, cat);
    if (cd > 0) return { ok: false, error: '冷却中，还需 ' + cd + ' 个回合' };
    const from = s.family.rules[cat];
    const adverse = F.ruleAdverse(s, cat, to);
    const rs = F.resist(s, adverse);
    F.addHeadPrestige(s, -cf.changePrestige);
    let note = '阻力判定（' + rs.chance + '%）' + (rs.passed ? '通过' : '未通过，执行打折');
    if (adverse) {
      const d = R.int(s.rng, cf.changeSupportMin, cf.changeSupportMax) + (rs.passed ? 0 : 5);
      F.addSupport(s, adverse, -d);
      note += '，' + (adverse === 'main' ? '嫡系' : '旁支') + '支持度 -' + d;
    }
    if (!rs.passed) F.addHeadPrestige(s, -4);
    s.family.rulesPrev[cat] = from;
    s.family.rules[cat] = to;
    s.family.rulesChangedTurn[cat] = s.turn;
    const catName = { succession: '继承制度', allocation: '资源分配', foreign: '对外政策' }[cat];
    const head = s.people[s.family.headId];
    const hid = H().add(s, { type: 'rule', tags: ['家规'], actors: head ? [head.id] : [], key: 'rule_change', params: { head: head ? head.name : '', cat: catName, to: cf[cat][to].name, from: cf[cat][from].name, resist: note }, severity: 3 });
    if (cat === 'allocation' && to !== 'concentrate') s.family.focusIds = [];
    return { ok: true, hid, note };
  };

  F.setFocus = (s, ids) => {
    ids = Array.from(new Set(ids)).filter((id) => s.people[id] && P().alive(s.people[id]) && P().hasRoot(s.people[id]));
    if (ids.length > C().rules.maxFocus) return { ok: false, error: '重点培养对象最多 ' + C().rules.maxFocus + ' 位' };
    s.family.focusIds = ids;
    return { ok: true };
  };

  /* ---------- 年度：威望、支持度、忠诚漂移 ---------- */
  F.loyaltyBaseline = (s, p) => {
    let b = 60 + 2 * (s.family.buildings.ancestral || 0);
    if (p.traits.includes('孝顺')) b += C().traits.filialLoyalty;
    b += (s.family.headAuthority.prestige - 50) / 5;
    b += (s.family.branches[p.branch].support - 50) / 5;
    const alloc = F.effectiveRule(s, 'allocation');
    if (alloc === 'concentrate' && P().hasRoot(p) && !s.family.focusIds.includes(p.id) && s.family.focusIds.length) b += C().rules.allocation.concentrate.otherLoyalty * 5;
    if (p.traits.includes('野心勃勃') && s.family.headId !== p.id) b -= 5;
    if (s.family.deficit) b -= 5;
    for (const r of P().relationsOf(s, p.id)) if (r.type === 'feud') b -= 3;
    return U.clamp(b, 5, 100);
  };
  F.supportTarget = (s, br) => {
    const cf = C();
    let t = cf.leadership.supportBase;
    t += F.ruleBlend(s, 'succession', (r) => (br === 'main' ? cf.rules.succession[r].mainTarget : cf.rules.succession[r].sideTarget));
    t += F.ruleBlend(s, 'allocation', (r) => {
      if (r === 'balanced') return cf.rules.allocation.balanced.supportBonus;
      if (r === 'concentrate') return !s.family.focusIds.length ? 0 : s.family.focusIds.some((id) => s.people[id] && s.people[id].branch === br) ? 3 : -5;
      return 0;
    });
    const head = s.people[s.family.headId];
    if (head) t += head.branch === br ? 5 : -3;
    t += (s.family.headAuthority.prestige - 50) / 5;
    return U.clamp(t, 0, 100);
  };
  F.yearly = (s) => {
    const L = C().leadership;
    const head = s.people[s.family.headId];
    if (head) {
      const target = 45 + L.headRealmBonus[head.realm.major] + (head.traits.includes('仁慈') ? 5 : 0);
      const cur = s.family.headAuthority.prestige;
      if (cur < target) F.addHeadPrestige(s, L.prestigeDrift);
      else if (cur > target + 15) F.addHeadPrestige(s, -L.prestigeDrift);
    }
    for (const br of ['main', 'side']) {
      const t = F.supportTarget(s, br);
      const cur = s.family.branches[br].support;
      F.addSupport(s, br, U.clamp(t - cur, -L.supportDrift, L.supportDrift));
    }
    for (const p of P().living(s)) {
      const b = F.loyaltyBaseline(s, p);
      const d = C().autonomy.loyaltyDrift;
      p.loyalty = Math.round(U.clamp(p.loyalty + U.clamp(b - p.loyalty, -d, d), 0, 100));
      if (s.family.headId === p.id) p.prestige = U.clamp(p.prestige + 0.5, 0, 100);
      if (p.traits.includes('仁慈')) p.prestige = U.clamp(p.prestige + 0.3, 0, 100);
    }
    F.edgeYearly(s);
    s.family.prestige = U.clamp(s.family.prestige + 1 * F.prestigeMult(s), 0, C().familyPrestige.max);
  };

  /* ---------- 自主行为 ---------- */
  const DUTY_N = (d) => (d ? C().duties[d].name : '无差事');
  F.autonomy = (s) => {
    const A = C().autonomy, r = s.rng;
    const adults = P().adults(s).filter((p) => p.health.state !== 'heavy');
    const cap = Math.max(A.capMin, Math.floor(adults.length * A.capFrac));
    let n = 0;
    for (const p of R.shuffle(r, adults)) {
      if (n >= cap) break;
      let ch = A.baseChance;
      if (p.traits.includes('野心勃勃')) ch *= 1.5;
      if (p.traits.includes('贪婪')) ch *= 1.3;
      if (p.traits.includes('谨慎')) ch *= 0.8;
      if (!R.chance(r, ch)) continue;
      const greedy = p.traits.includes('贪婪'), amb = p.traits.includes('野心勃勃'), proud = p.traits.includes('孤傲');
      const acts = [
        { k: 'wealth', w: 1 + (greedy ? C().traits.greedyWeight : 0) },
        { k: 'befriend', w: 1.2 + (p.traits.includes('仁慈') ? 0.8 : 0) - (proud ? 0.8 : 0) },
        { k: 'quarrel', w: 0.5 + (proud ? 1 : 0) + (amb ? 0.7 : 0) + (greedy ? 0.5 : 0) },
        { k: 'request', w: 0.8 * (amb ? C().traits.ambitiousWeight : 1) + (p.loyalty < 40 ? 0.5 : 0) },
      ];
      const act = R.weighted(r, acts, (x) => x.w).k;
      const others = adults.filter((q) => q.id !== p.id);
      let done = false;
      if (act === 'wealth') {
        const g = R.int(r, 5, 15) * (greedy ? 2 : 1);
        p.wealth += g;
        let why = greedy ? '性情贪婪' : '经营私产';
        if (greedy && ['field', 'alchemy', 'shop', 'industry'].includes(p.duty.type) && s.family.resources.stone >= g) {
          s.family.resources.stone -= g;
          if (!p.flags.includes('私吞')) p.flags.push('私吞');
          why = '借' + DUTY_N(p.duty.type) + '之便，私取公中灵石 ' + g;
        }
        H().add(s, { type: 'autonomy', tags: ['自主'], actors: [p.id], key: 'autonomy', params: { name: p.name, act: '积攒私财 ' + g, why }, severity: 1 });
        done = true;
      } else if (act === 'befriend' && others.length) {
        const same = others.filter((q) => q.duty.type === p.duty.type);
        const q = same.length ? R.pick(r, same) : R.pick(r, others);
        P().adjustRelation(s, p.id, q.id, R.int(r, 15, 25), same.includes(q) ? '同差事' : '投缘');
        H().add(s, { type: 'autonomy', tags: ['自主', '关系'], actors: [p.id, q.id], key: 'autonomy', params: { name: p.name, act: '与' + q.name + '交好', why: same.includes(q) ? '同任' + DUTY_N(p.duty.type) : '性情投合' }, severity: 1 });
        done = true;
      } else if (act === 'quarrel' && others.length) {
        const same = others.filter((q) => q.duty.type === p.duty.type || q.branch !== p.branch);
        const q = same.length ? R.pick(r, same) : R.pick(r, others);
        const tag = q.branch !== p.branch ? '分支之争' : '争资源';
        const rel = P().adjustRelation(s, p.id, q.id, -R.int(r, 20, 35), tag);
        p.loyalty = U.clamp(p.loyalty - 2, 0, 100); q.loyalty = U.clamp(q.loyalty - 2, 0, 100);
        const hid = H().add(s, { type: 'autonomy', tags: ['自主', '冲突'], actors: [p.id, q.id], key: 'autonomy', params: { name: p.name, act: '与' + q.name + '起争执', why: proud ? '性情孤傲' : tag }, severity: rel && rel.type === 'feud' ? 2 : 1 });
        if (rel && rel.type === 'feud' && !rel.hid) rel.hid = hid;
        done = true;
      } else if (act === 'request') {
        const kinds = [
          { k: 'stone', w: greedy ? 2 : 1 },
          { k: 'pill', w: P().hasRoot(p) && p.realm.major > 0 ? 1.5 : 0 },
          { k: 'seclusion', w: P().hasRoot(p) && p.realm.major > 0 && p.duty.type !== 'seclusion' ? (proud ? 2 : 1) : 0 },
          { k: 'travel', w: P().hasRoot(p) && p.realm.major > 0 && p.duty.type !== 'travel' && !p.traits.includes('谨慎') ? 0.8 : 0 },
        ];
        const k = R.weighted(r, kinds, (x) => x.w);
        if (k && !s.family.requests.some((q) => q.personId === p.id)) {
          const amount = k.k === 'stone' ? R.int(r, 3, 8) * 10 : 1;
          const why = amb ? '心怀大志，欲有所为' : greedy ? '想多分些好处' : p.loyalty < 40 ? '对家中安排不满' : '自觉修行需要';
          const what = { stone: '拨给灵石 ' + amount, pill: '赐聚气丹 1 颗', seclusion: '改为闭关修炼', travel: '外出历练' }[k.k];
          const hid = H().add(s, { type: 'request', tags: ['自主', '请求'], actors: [p.id], key: 'request', params: { name: p.name, what, why }, severity: 1 });
          s.family.requests.push({ id: 'q' + s.nextId++, personId: p.id, kind: k.k, amount, what, why, turn: s.turn, hid });
          done = true;
        }
      }
      if (done) n++;
    }
  };

  F.requestCost = (s, q) => {
    if (q.kind === 'stone') return '灵石 -' + q.amount;
    if (q.kind === 'pill') return '聚气丹 -1';
    if (q.kind === 'seclusion') return '此人改为闭关，原差事空出';
    if (q.kind === 'travel') return '此人改为历练（有受伤风险）';
    return '';
  };
  F.answerRequest = (s, qid, accept) => {
    const q = s.family.requests.find((x) => x.id === qid);
    if (!q) return { ok: false, error: '请求已失效' };
    const p = s.people[q.personId];
    s.family.requests = s.family.requests.filter((x) => x !== q);
    if (!p || !P().alive(p)) return { ok: false, error: '请求人已不在族中' };
    if (accept) {
      if (q.kind === 'stone') { if (s.family.resources.stone < q.amount) return { ok: false, error: '灵石不足' }; s.family.resources.stone -= q.amount; p.wealth += q.amount; }
      if (q.kind === 'pill') { if (s.family.resources.qiju < 1) return { ok: false, error: '聚气丹不足' }; s.family.resources.qiju--; p.progress += C().realms.baseGain[Math.max(1, p.realm.major)] * 0.5; FX.CU.autoAdvance(s, p); }
      if (q.kind === 'seclusion' || q.kind === 'travel') FX.Sim.setDutyRaw(s, p, q.kind, null, '应其请求');
      p.loyalty = U.clamp(p.loyalty + 8, 0, 100);
    } else {
      p.loyalty = U.clamp(p.loyalty - (p.traits.includes('野心勃勃') ? 10 : 6), 0, 100);
    }
    const hid = H().add(s, { type: 'request', tags: ['请求'], actors: [p.id], key: 'request_done', params: { verdict: accept ? '准了' : '驳回了', name: p.name, what: q.what }, severity: 1, causeIds: [q.hid] });
    return { ok: true, hid };
  };

  /* ---------- 回合末：长期不满与出走 ---------- */
  F.turnEnd = (s) => {
    const A = C().autonomy;
    // 请求过期
    for (const q of s.family.requests.slice()) if (s.turn - q.turn >= A.requestExpireTurns) F.answerRequest(s, q.id, false);
    const cands = [];
    for (const p of P().adults(s)) {
      if (p.loyalty < A.leaveLoyalty) p.lowLoyaltyTurns++; else p.lowLoyaltyTurns = 0;
      if (p.id === s.family.headId) continue;
      if (p.lowLoyaltyTurns >= A.leaveTurns) {
        const causes = [];
        if (p.ambition >= 50) causes.push('野心 ' + p.ambition);
        const feud = P().relationsOf(s, p.id).find((r) => r.type === 'feud');
        if (feud) causes.push('与' + P().name(s, feud.a === p.id ? feud.b : feud.a) + '结怨');
        if (s.family.branches[p.branch].support < C().leadership.lowSupport) causes.push((p.branch === 'main' ? '嫡系' : '旁支') + '支持度低于 ' + C().leadership.lowSupport);
        if (s.family.deficit) causes.push('家族入不敷出');
        if (causes.length) cands.push({ p, causes });
      }
    }
    for (const br of ['main', 'side']) {
      const b = s.family.branches[br];
      if (b.support < C().leadership.lowSupport) b.lowTurns = (b.lowTurns || 0) + 1; else b.lowTurns = 0;
    }
    cands.sort((a, b) => a.p.loyalty - b.p.loyalty);
    for (const c of cands.slice(0, A.leaveMaxPerTurn)) {
      const why = '连续 ' + c.p.lowLoyaltyTurns + ' 个回合忠诚低于 ' + A.leaveLoyalty + '，' + c.causes.slice(0, 3).join('，');
      P().leave(s, c.p, '心灰意冷出走（' + why + '）', [], 'leave');
      if (c.p.branch === 'side') F.addSupport(s, 'side', -5);
    }
    s.family.edgeResidue = U.round1(s.family.edgeResidue * (1 - C().edge.residueDecay));
  };

  FX.Family = F;
})(typeof globalThis !== 'undefined' ? globalThis : this);
