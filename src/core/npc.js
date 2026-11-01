/* ============================================================
 * npc —— 人物有自己的命运
 * 主角圈子里的人（有交情或仇怨的、同住一处的、本门长辈）每人有一个志向：
 *   求突破、寻仇、养伤、为宗门奔走、护持同门、游历、隐修。
 * 每年按志向做一件规则事：去坊市求外药再冲关、找仇人斗法、回城养伤、替同门护法、在外结识或结怨……
 * 人物之间的斗法和主角用同一套公式（Combat.fightChance）。人物之间的恩、仇、师徒、同门记在关系表里。
 * 他们的事按远近和关系写成传闻（见闻页），能插手的带入口：去相助、去探望、去打听。不插手，事情照规则自己了结。
 * 只细算圈子里的人（至多 20 个），其余人物照旧粗算，保证过一年仍是瞬间。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const P = () => FX.P;
  const H = () => FX.H;
  const W = () => FX.World;
  const CU = () => FX.CU;
  const Cb = () => FX.Combat;

  const Npc = {};
  const me = (s) => P().player(s);
  const K = (Npc.K = { circleMax: 20, circleRel: 10, hereMax: 6, aimYears: [8, 15], feud: -40, cap: 11, social: 0.22,
    act: { heal: 0.8, revenge: 0.7, break: 0.8, rise: 0.25, protect: 0.35, roam: 0.55, seclude: 0.2 } });
  Npc.AIMS = { break: '求突破', revenge: '寻仇', heal: '养伤', rise: '为宗门奔走', protect: '护持同门', roam: '游历', seclude: '隐修' };

  /* ---------- 圈子 ---------- */
  Npc.circle = (s) => {
    const p = me(s);
    const out = new Map();
    const add = (q, w) => { if (q && q.id !== p.id && P().alive(q) && !out.has(q.id)) out.set(q.id, w); };
    for (const r of P().relationsOf(s, p.id)) if (Math.abs(r.strength) >= K.circleRel) add(s.people[r.a === p.id ? r.b : r.a], 100 + Math.abs(r.strength));
    const f = p.factionId && s.factions[p.factionId];
    if (f) P().living(s).filter((q) => q.factionId === f.id && (q.role === 'elder' || q.role === 'leader')).slice(0, 4).forEach((q) => add(q, 60));
    P().at(s, p.locationId).sort((a, b) => P().realmRank(b) - P().realmRank(a) || (a.id < b.id ? -1 : 1)).slice(0, K.hereMax).forEach((q) => add(q, 40));
    return [...out.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, K.circleMax).map(([id]) => s.people[id]);
  };

  /* ---------- 人物之间的关系（不挤掉和主角的关系）---------- */
  const relNpc = (s, a, b, d, tag) => {
    if (a.id === b.id) return;
    if (!P().relationBetween(s, a.id, b.id) && (P().relationsOf(s, a.id).length >= K.cap || P().relationsOf(s, b.id).length >= K.cap)) return;
    P().adjustRelation(s, a.id, b.id, d, tag);
  };
  const foesOf = (s, q) => P().relationsOf(s, q.id).filter((r) => r.strength <= K.feud).map((r) => s.people[r.a === q.id ? r.b : r.a]).filter((x) => x && P().alive(x) && x.id !== me(s).id);

  /* ---------- 志向 ---------- */
  Npc.pickAim = (s, q) => {
    const f = q.factionId && s.factions[q.factionId];
    const foes = foesOf(s, q);
    let kind;
    if (q.health.state !== 'healthy') kind = 'heal';
    else if (foes.length && !q.traits.includes('仁慈') && R.chance(s.rng, 0.6)) kind = 'revenge';
    else if (P().isFull(q) && CU().gateKind(q)) kind = 'break';
    else if (f && q.traits.includes('野心勃勃')) kind = 'rise';
    else if (f && (q.role === 'elder' || q.role === 'leader')) kind = 'protect';
    else if (!f) kind = R.chance(s.rng, 0.6) ? 'roam' : 'seclude';
    else kind = R.weighted(s.rng, ['seclude', 'protect', 'rise', 'roam'], (k) => ({ seclude: 3, protect: 2, rise: 1, roam: 2 }[k]));
    q.aim = { kind, since: s.year, until: s.year + R.int(s.rng, K.aimYears[0], K.aimYears[1]) };
    if (kind === 'revenge') q.aim.foe = foes[0].id;
    return q.aim;
  };
  Npc.aimText = (s, q) => {
    const a = q.aim;
    if (!a) return '';
    const foe = a.foe && s.people[a.foe];
    return {
      break: '想着冲破眼前的关隘，四处寻冲关要用的东西',
      revenge: '要找' + (foe ? foe.name : '仇人') + '算账',
      heal: '先把伤养好',
      rise: '想在' + P().factionName(s, q) + '里出人头地',
      protect: '守着' + P().factionName(s, q) + '，照看门下弟子',
      roam: '四处游历，见识天下',
      seclude: '闭门隐修，不问外事',
    }[a.kind];
  };

  /* ---------- 记一件人物自己的事（传闻）---------- */
  // ix：能插手的入口 [{ k:'help'|'visit'|'gift'|'ask', npc }]
  const tell = (s, q, key, params, others, ix) => {
    H().add(s, { type: 'npc', tags: ['人物事', '传闻'], actors: [q.id].concat(others || []), places: [q.locationId], key, pov: false, severity: 2,
      params: Object.assign({ who: q.name, place: s.places[q.locationId].name }, params, ix && ix.length ? { ix } : {}) });
  };
  const goTo = (s, q, placeId) => {
    if (!placeId || placeId === q.locationId) return true;
    const r = W().route(s, q.locationId, placeId, q);
    if (!r) return false;
    q.locationId = placeId;
    return true;
  };
  const markets = (s) => Object.keys(s.markets).filter((id) => W().hasMarket(s, id)).sort();
  const nearest = (s, q, ids) => ids.map((id) => ({ id, r: W().route(s, q.locationId, id, q) })).filter((x) => x.r).sort((a, b) => a.r.days - b.r.days || (a.id < b.id ? -1 : 1))[0];

  // 人物之间斗法：和主角同一套公式；输家受伤，伤重又远不如对方时可能身死
  Npc.duelChance = (s, a, b) => Cb().fightChance(s, a, P().power(s, b)).chance;
  Npc.duel = (s, a, b) => {
    const ch = Npc.duelChance(s, a, b);
    const aWins = R.next(s.rng) * 100 < ch;
    const w = aWins ? a : b, l = aWins ? b : a;
    const heavy = R.chance(s.rng, C().encounter.lossHeavyShare);
    const outmatched = P().power(s, w) >= 2 * P().power(s, l);
    P().injure(s, l, heavy ? 'heavy' : 'light');
    let died = false;
    if (heavy && outmatched && R.chance(s.rng, C().encounter.deathWhenOutmatched)) { P().kill(s, l, '败于' + w.name + '之手', [], {}); died = true; }
    return { w, l, ch, heavy, died };
  };

  /* ---------- 每年一件 ---------- */
  Npc.step = (s, q) => {
    const a = q.aim;
    const f = q.factionId && s.factions[q.factionId];
    switch (a.kind) {
      case 'heal': {
        if (q.health.state === 'healthy') { tell(s, q, 'npc_healed', {}, [], [{ k: 'visit', npc: q.id }]); a.done = true; return; }
        const town = f ? f.seatId : (nearest(s, q, Object.values(s.places).filter((x) => ['town', 'city'].includes(x.type)).map((x) => x.id)) || {}).id;
        goTo(s, q, town);
        P().heal(q, 120);
        tell(s, q, 'npc_heal', {}, [], [{ k: 'gift', npc: q.id }]);
        return;
      }
      case 'revenge': {
        const foe = s.people[a.foe];
        if (!foe || !P().alive(foe)) { a.done = true; return; }
        a.tries = (a.tries || 0) + 1;
        if (!goTo(s, q, foe.locationId)) { a.done = true; return; }
        const d = Npc.duel(s, q, foe);
        relNpc(s, q, foe, -15, '斗法');
        tell(s, q, d.died ? 'npc_duel_kill' : 'npc_duel', { foe: foe.name, win: d.w.name, lose: d.l.name, hurt: d.heavy ? '重伤' : '轻伤' }, [foe.id], d.died ? [{ k: 'ask', npc: d.w.id }] : [{ k: 'help', npc: d.l.id }, { k: 'visit', npc: d.w.id }]);
        if (d.died || a.tries >= 3) a.done = true;
        return;
      }
      case 'break': {
        if (!(P().isFull(q) && CU().gateKind(q))) { if (R.chance(s.rng, 0.3)) { a.done = true; } return; }
        if (!a.sought) {
          const m = nearest(s, q, markets(s));
          if (m) goTo(s, q, m.id);
          a.sought = true;
          tell(s, q, 'npc_seek', {}, [], [{ k: 'help', npc: q.id }]);
          return;
        }
        const got = R.chance(s.rng, 0.5 + (a.helped ? 0.3 : 0));
        const was = P().realmName(q), major = q.realm.major;
        const opts = { pill: got, items: got, kaifu: got, kaifuGrade: got ? 2 : 1 };
        if (!CU().canAttempt(s, q, opts).ok) { tell(s, q, 'npc_seek_fail', {}, [], [{ k: 'help', npc: q.id }]); a.sought = false; return; }
        CU().attempt(s, q, opts);
        if (!P().alive(q)) { tell(s, q, 'npc_break_die', { was }, [], []); return; }
        const ok = q.realm.major > major || P().realmName(q) !== was;
        if (ok && q.realm.major > major) FX.Ars.npcKit(s, q);
        tell(s, q, ok ? 'npc_break_ok' : 'npc_break_fail', { was, now: P().realmName(q), got: got ? '求得了外药' : '没求到外药，硬冲' }, [], [{ k: 'visit', npc: q.id }]);
        a.done = true;
        return;
      }
      case 'rise': {
        if (!f) { a.done = true; return; }
        const head = f.leaderId && s.people[f.leaderId];
        const ok = R.chance(s.rng, 0.5);
        if (head && P().alive(head)) relNpc(s, q, head, ok ? 6 : -3, '差事');
        CU().addProgress(s, q, ok ? Math.min(P().need(q), 2000) * 0.03 : 0);
        tell(s, q, ok ? 'npc_rise' : 'npc_rise_fail', { fac: f.name }, head ? [head.id] : [], [{ k: 'help', npc: q.id }]);
        return;
      }
      case 'protect': {
        if (!f) { a.done = true; return; }
        const hurt = P().living(s).filter((x) => x.factionId === f.id && x.id !== q.id && x.health.state !== 'healthy').sort((x, y) => (x.id < y.id ? -1 : 1))[0];
        if (hurt) {
          P().heal(hurt, 180);
          relNpc(s, q, hurt, 8, '护法');
          if (P().realmRank(q) - P().realmRank(hurt) >= 6 && !(P().relationBetween(s, q.id, hurt.id) || { tags: [] }).tags.includes('师徒') && R.chance(s.rng, 0.3)) { relNpc(s, q, hurt, 10, '师徒'); tell(s, q, 'npc_disciple', { other: hurt.name }, [hurt.id], [{ k: 'visit', npc: q.id }]); return; }
          tell(s, q, 'npc_protect', { other: hurt.name }, [hurt.id], [{ k: 'help', npc: q.id }]);
          return;
        }
        if (q.locationId !== f.seatId) { goTo(s, q, f.seatId); tell(s, q, 'npc_guard', { fac: f.name }, [], [{ k: 'visit', npc: q.id }]); }
        return;
      }
      case 'roam': {
        const here = s.places[q.locationId];
        const to = R.pick(s.rng, here.links.filter((l) => W().linkOpen(q, l)));
        if (to) q.locationId = to.to;
        const meet = P().at(s, q.locationId).filter((x) => x.id !== q.id && x.id !== me(s).id).sort((x, y) => (x.id < y.id ? -1 : 1));
        const o = meet.length ? meet[R.int(s.rng, 0, meet.length - 1)] : null;
        const roll = R.next(s.rng);
        if (o && roll < 0.35) { relNpc(s, q, o, R.int(s.rng, 10, 25), '同游'); tell(s, q, 'npc_meet', { other: o.name }, [o.id], [{ k: 'visit', npc: q.id }]); return; }
        if (o && roll < 0.5) {
          relNpc(s, q, o, -R.int(s.rng, 30, 55), '冲突');
          tell(s, q, 'npc_clash', { other: o.name }, [o.id], [{ k: 'ask', npc: o.id }, { k: 'visit', npc: q.id }]);
          return;
        }
        if (roll < 0.75) { const st = R.int(s.rng, 0, 1); tell(s, q, st ? 'npc_roam_gain' : 'npc_roam', {}, [], st ? [{ k: 'visit', npc: q.id }] : []); if (st) CU().addProgress(s, q, Math.min(P().need(q), 2000) * 0.03); }
        return;
      }
      case 'seclude': {
        CU().addProgress(s, q, CU().breakdown(s, q).total * 0.3);
        if (R.chance(s.rng, 0.3)) tell(s, q, 'npc_seclude', {}, [], []);
        return;
      }
    }
  };

  Npc.yearly = (s) => {
    const p = me(s);
    if (!P().alive(p)) return;
    const cir = Npc.circle(s).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const q of cir) {
      if (!P().alive(q)) continue;
      if (!q.aim || q.aim.done || s.year >= q.aim.until || (q.aim.kind !== 'heal' && q.health.state === 'heavy')) Npc.pickAim(s, q);
      if (R.chance(s.rng, K.act[q.aim.kind] || 0.4)) Npc.step(s, q);
      if (P().alive(q) && q.aim.kind !== 'roam' && R.chance(s.rng, K.social)) Npc.social(s, q);
    }
  };

  // 和身边的人来往：一见如故、切磋、起冲突（冲突结下的仇，日后可能变成寻仇的志向）
  Npc.social = (s, q) => {
    const meet = P().at(s, q.locationId).filter((x) => x.id !== q.id && x.id !== me(s).id).sort((x, y) => (x.id < y.id ? -1 : 1));
    if (!meet.length) return;
    const o = meet[R.int(s.rng, 0, meet.length - 1)];
    const r = P().relValue(s, q.id, o.id);
    const roll = R.next(s.rng);
    const same = q.factionId && q.factionId === o.factionId;
    if (roll < 0.4) { relNpc(s, q, o, R.int(s.rng, 8, 20), same ? '同门' : '相交'); tell(s, q, same ? 'npc_bond' : 'npc_know', { other: o.name }, [o.id], [{ k: 'visit', npc: q.id }]); return; }
    if (roll < 0.7 && r > -20 && q.health.state === 'healthy' && o.health.state === 'healthy') {
      const ch = Npc.duelChance(s, q, o);
      const win = R.next(s.rng) * 100 < ch;
      relNpc(s, q, o, 3, '切磋');
      if (R.chance(s.rng, 0.2)) P().injure(s, win ? o : q, 'light');
      tell(s, q, 'npc_spar', { other: o.name, win: win ? q.name : o.name }, [o.id], [{ k: 'visit', npc: q.id }]);
      return;
    }
    if (q.traits.includes('仁慈') && o.traits.includes('仁慈')) return;
    relNpc(s, q, o, -R.int(s.rng, 25, 50), '冲突');
    tell(s, q, 'npc_clash', { other: o.name }, [o.id], [{ k: 'ask', npc: o.id }, { k: 'visit', npc: q.id }]);
  };

  /* ---------- 插手的入口 → 自由输入的计划 ---------- */
  Npc.interventions = (s, e) => {
    const out = [];
    for (const x of (e.params && e.params.ix) || []) {
      const q = s.people[x.npc];
      if (!q || !P().alive(q)) continue;
      const go = q.locationId !== me(s).locationId ? [{ k: 'go', to: q.locationId }] : [];
      const dd = (a) => ({ k: 'deed', a: Object.assign({ type: 'deed', npc: q.id }, a) });
      const heal = 'heal';
      const plan = x.k === 'help' ? { say: '去相助' + q.name, steps: go.concat([dd({ verb: 'help' })]) }
        : x.k === 'gift' ? { say: '给' + q.name + '送药', steps: go.concat([dd({ verb: 'talk', aim: 'chat', gift: heal })]) }
        : x.k === 'ask' ? { say: '打听' + q.name + '的底细', steps: [dd({ verb: 'inquire', topic: 'person' })] }
        : { say: '去看看' + q.name, steps: go.concat([dd({ verb: 'talk', aim: 'chat' })]) };
      out.push(Object.assign(plan, { via: 'rumor', input: H().text(e) }));
    }
    return out;
  };

  // 某人自己的事（不含和主角直接相关的）
  Npc.story = (s, id, n) => s.history.filter((e) => e.type === 'npc' && e.actors.includes(id)).slice(-(n || 8));

  /* ---------- 文本 ---------- */
  Object.assign(C().text, {
    npc_heal: ['{who}带伤回到{place}养伤。'],
    npc_healed: ['{who}伤势已愈，又在{place}露面了。'],
    npc_duel: ['{who}寻到{foe}，两人在{place}斗了一场，{win}胜了，{lose}受了{hurt}。'],
    npc_duel_kill: ['{who}寻到{foe}，两人在{place}斗法，{lose}落败身死。'],
    npc_seek: ['{who}修为已到关口，去{place}寻冲关要用的外药。'],
    npc_seek_fail: ['{who}在{place}没寻到冲关的东西，只好再等。'],
    npc_break_ok: ['{who}{got}，闭关冲关，从{was}进了{now}。'],
    npc_break_fail: ['{who}{got}，闭关冲关失败，仍是{now}。'],
    npc_break_die: ['{who}冲关时出了岔子，身死道消。'],
    npc_rise: ['{who}替{fac}办成了一桩差事，在门中渐有声望。'],
    npc_rise_fail: ['{who}在{fac}里办砸了一桩差事，挨了训斥。'],
    npc_protect: ['{who}替受伤的同门{other}护法疗伤。'],
    npc_disciple: ['{who}替{other}护法疗伤，见其可造，收为弟子。'],
    npc_guard: ['{who}回到{fac}山门坐镇。'],
    npc_meet: ['{who}游历到{place}，与{other}一见如故。'],
    npc_clash: ['{who}游历到{place}，与{other}起了冲突，结下梁子。'],
    npc_roam: ['{who}游历到{place}，一路无事。'],
    npc_roam_gain: ['{who}游历到{place}，颇有所得。'],
    npc_seclude: ['{who}在{place}闭门隐修，久不见人。'],
    npc_know: ['{who}在{place}结识了{other}，两人颇为投缘。'],
    npc_bond: ['{who}与同门{other}在{place}相处日久，渐成知交。'],
    npc_spar: ['{who}与{other}在{place}切磋，{win}胜了半招。'],
  });

  FX.Npc = Npc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
