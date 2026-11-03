/* ============================================================
 * favor —— 人情回流（0.11）
 * 以前替人出力、收留、送药，对方“记下这份人情”，可人情从来不回来。现在会回来，三条路：
 *  · 遇险求援：遭遇妖物、劫修时，赶得来的故人（欠你人情、离此地二十天路程内、没带重伤）可以传讯请来，
 *    援手的战力八成算进来；不论胜败，这份人情就算还了；
 *  · 冲关护法：冲大关（筑基以上）时，欠你人情、修为不比你低太多的人来护法，把握 +8%，成败都算还了；
 *  · 登门回礼：见 hooks.js 的 favor_return，多半送来你眼下卡关缺的东西，送不起就折成符钱。
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

  const Favor = {};
  const list = (s) => (s.player.favors = s.player.favors || []);
  const me = (s) => P().player(s);
  // 欠你人情、还在世的人（先欠的先还）
  Favor.owed = (s) => list(s).filter((f) => f.kind === 'owed' && P().alive(s.people[f.npc])).sort((a, b) => a.t - b.t);
  Favor.remove = (s, f) => { const L = list(s), i = L.indexOf(f); if (i >= 0) L.splice(i, 1); };
  Favor.collect = (s, npc) => { const f = list(s).find((x) => x.kind === 'owed' && x.npc === npc); if (f) Favor.remove(s, f); return !!f; };

  /* ---------- 冲关护法 ---------- */
  Favor.guardianFor = (s, p) => {
    if (!P().isPlayer(s, p)) return null;
    const k = FX.CU.gateKind(p);
    if (!k || k === 'minor' || k === 'taixi') return null;
    const mine = P().realmRank(p);
    const f = Favor.owed(s).filter((x) => { const q = s.people[x.npc]; return q.health.state !== 'heavy' && P().realmRank(q) >= mine - C().favor.guardRankGap; })
      .sort((a, b) => P().realmRank(s.people[b.npc]) - P().realmRank(s.people[a.npc]) || a.t - b.t)[0];
    return f ? { fav: f, npc: f.npc, name: s.people[f.npc].name } : null;
  };
  Favor.guardian = (s) => Favor.guardianFor(s, me(s));
  Favor.useGuardian = (s, g, ok) => {
    Favor.remove(s, g.fav);
    const q = s.people[g.npc];
    if (!q) return;
    P().adjustRelation(s, me(s).id, q.id, 5, '护法');
    H().add(s, { type: 'social', tags: ['人物', '人情'], actors: [me(s).id, q.id], key: 'favor_guard', pov: true, severity: 3, params: { name: me(s).name, other: q.name, how: ok ? '关成之后，两人相视一笑' : '关虽没过，这份情你记下了' } });
  };

  /* ---------- 遇险求援 ---------- */
  Favor.aidFor = (s, placeId) => {
    const p = me(s);
    let best = null;
    for (const f of Favor.owed(s)) {
      const q = s.people[f.npc];
      if (q.health.state === 'heavy') continue;
      const r = q.locationId === placeId ? { days: 0 } : W().route(s, q.locationId, placeId, q);
      if (!r || r.days > C().favor.aidDays) continue;
      const pw = P().power(s, q) * C().favor.aidMult;
      if (!best || pw > best.power) best = { fav: f, npc: q.id, name: q.name, power: Math.round(pw * 10) / 10, days: r.days };
    }
    return best && best.power > 0 && p ? best : null;
  };
  const aidChance = (s, foePower, ally) => {
    const E = C().encounter, my = P().power(s, me(s));
    return Math.round(U.clamp(((my + ally) / (my + ally + foePower)) * 100, E.winChanceMin, E.winChanceMax));
  };
  // 遭遇事件里的“传讯求援”选项；foe(s, b) 与 encounters.js 的 beastFoe / npcFoe 一样
  Favor.aidOpt = (foe) => ({
    id: 'aid', label: '传讯求援',
    chance: (s, b) => { const a = Favor.aidFor(s, b.place); const f = foe(s, b); return { chance: a ? aidChance(s, f.power, a.power) : 0, parts: a ? [{ label: '我方战力', value: P().power(s, me(s)) }, { label: a.name + '援手（八成战力）', value: a.power }, { label: '对方战力', value: Math.round(f.power * 10) / 10 }] : [] }; },
    cost: (s, b) => { const a = Favor.aidFor(s, b.place); return a ? '用掉' + a.name + '欠你的人情' : '无'; },
    risk: (s, b) => { const a = Favor.aidFor(s, b.place); return a ? `${a.name}赶来（${a.days ? a.days + ' 天路程，先周旋着' : '就在附近'}），合力胜率 ${aidChance(s, foe(s, b).power, a.power)}%；败了也有人护着，伤得轻些` : '没人赶得来'; },
    outcome: (s, b) => foe(s, b).winText,
    avail: (s, b) => (Favor.aidFor(s, b.place) ? true : '附近没有欠你人情、赶得来的人'),
    apply(s, b, ctx) {
      const a = Favor.aidFor(s, b.place);
      const f = foe(s, b);
      const ch = aidChance(s, f.power, a.power);
      Favor.remove(s, a.fav);
      const q = s.people[a.npc];
      P().adjustRelation(s, me(s).id, q.id, 6, '援手');
      const st = s.player.stats;
      st.fights++;
      if (R.next(s.rng) * 100 < ch) {
        st.wins++;
        const loot = f.onWin(s, b, ctx);
        H().add(s, { type: 'fight', tags: ['斗法', '胜', '人情'], actors: [me(s).id, q.id].concat(b.foe ? [b.foe] : []), places: [b.place], key: 'favor_aid_win', pov: true, params: { name: me(s).name, other: q.name, foe: f.name, chance: ch, loot }, severity: 3, causeIds: [ctx.hid] });
        return { text: `${q.name}赶来援手，合力得胜（${ch}%），${loot}；这份人情算还了`, gain: true };
      }
      // 败了有人护着：按对方一半的战力算伤
      const h = FX.Combat.hurt(s, me(s), f.power * 0.5, f.name, [ctx.hid]);
      if (b.foe && f.onLose) f.onLose(s, b, ctx);
      if (!h.died) H().add(s, { type: 'fight', tags: ['斗法', '败', '人情'], actors: [me(s).id, q.id], places: [b.place], key: 'favor_aid_lose', pov: true, params: { name: me(s).name, other: q.name, foe: f.name, chance: ch, hurt: h.text }, severity: 3, causeIds: [ctx.hid] });
      return { text: `${q.name}赶来援手，仍没敌过（${ch}%），${h.text}` };
    },
  });

  /* ---------- 登门回礼：挑一样礼 ---------- */
  // 你卡关缺的东西（送得起的话），不然折成符钱
  Favor.giftFor = (s) => {
    const p = me(s);
    const cap = C().favor.giftCap * Math.pow(1 + p.realm.major, 2);
    const needs = FX.Guide ? FX.Guide.needs(s) : [];
    for (const n of needs) for (const k of n.keys || []) if (C().items[k] && C().items[k].price <= cap) return k;
    // 冲关可用、还没有的外药（大造元珠这类不是必需、但添把握的）
    for (const r of FX.CU.requirements(s, p)) if (!r.ok && r.item && C().items[r.item] && C().items[r.item].price <= cap) return r.item;
    return null;
  };

  FX.Favor = Favor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
