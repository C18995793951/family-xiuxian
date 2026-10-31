/* ============================================================
 * api —— 界面与测试脚本共用的公开函数。界面只通过这里操作核心。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const P = FX.P;
  const C = () => FX.CONFIG;

  const Game = {
    newGame: (opts) => FX.Sim.newGame(opts || {}),
    // 此刻规则允许的行动（界面按钮、测试策略、以后的 AI 意图解析都从这里挑）
    actions: (s) => FX.Act.list(s),
    act: (s, a) => FX.Act.run(s, a),
    buy: (s, item, qty) => FX.Act.run(s, { type: 'buy', item, qty }),
    sell: (s, item, qty) => FX.Act.run(s, { type: 'sell', item, qty }),
    pendingEvents: (s) => s.pending.map((i) => FX.Ev.view(s, i)),
    choose: (s, instId, optId) => {
      if (s.ended) return { ok: false, error: '这一生已经结束' };
      const r = FX.Ev.resolve(s, instId, optId);
      if (r.ok && r.days && FX.P.alive(FX.P.player(s))) FX.Sim.passDays(s, r.days, 'other');
      FX.Sim.checkEnd(s);
      return r;
    },

    /* ---------- 视图数据（只读）---------- */
    view: {
      overview(s) {
        const p = P.player(s);
        const place = s.places[p.locationId];
        const bt = FX.CU.gateKind(p) ? FX.CU.chance(s, p) : null;
        return {
          t: s.t, year: s.year, date: FX.T.fmt(s.t),
          me: p, age: P.age(s, p), realm: P.realmName(p), need: P.need(p), full: P.isFull(p),
          left: P.lifespanLeft(s, p), lifespan: P.lifespanTotal(p),
          speed: FX.CU.breakdown(s, p, { pill: s.player.qijuUntil > s.t }),
          power: P.powerBreakdown(s, p),
          tech: P.techOf(s, p), fit: FX.CU.techFit(s, p),
          faction: p.factionId ? s.factions[p.factionId] : null,
          place, stone: s.player.stone, inv: s.player.inv, manuals: s.player.manuals,
          pillUntil: s.player.qijuUntil > s.t ? s.player.qijuUntil : null,
          breakthrough: bt ? Object.assign({ can: FX.CU.canAttempt(s, p) }, bt) : null,
          pending: s.pending.length, ended: s.ended, stats: s.player.stats,
        };
      },
      place(s, id) {
        const pl = s.places[id];
        if (!pl) return null;
        const me = P.player(s);
        return {
          place: pl,
          typeName: C().world.placeTypes[pl.type].name,
          faction: pl.factionId ? s.factions[pl.factionId] : null,
          visited: s.player.visited.includes(id),
          here: me.locationId === id,
          route: FX.World.route(s, me.locationId, id),
          people: P.at(s, id).filter((q) => q.id !== me.id).map((q) => ({ id: q.id, name: q.name, realm: P.realmName(q), faction: P.factionName(s, q), rel: P.relValue(s, me.id, q.id) })),
          market: FX.World.hasMarket(s, id) ? s.markets[id] : null,
        };
      },
      person(s, id) {
        const p = s.people[id];
        if (!p) return null;
        const me = P.player(s);
        const isMe = p.id === me.id;
        return {
          p, isMe,
          age: P.age(s, p),
          realm: P.realmName(p),
          need: P.need(p),
          left: P.lifespanLeft(s, p),
          power: P.power(s, p),
          faction: P.factionName(s, p),
          place: s.places[p.locationId].name,
          rel: isMe ? null : P.relationBetween(s, me.id, p.id),
          relations: isMe ? P.relationsOf(s, p.id).map((r) => ({ other: r.a === p.id ? r.b : r.a, name: P.name(s, r.a === p.id ? r.b : r.a), type: r.type, strength: r.strength, tags: r.tags })) : [],
          life: FX.H.lifeSummary(s, p),
          history: s.history.filter((e) => e.actors.includes(p.id) && (e.pov || isMe)).slice(-30).map((e) => ({ id: e.id, t: e.t, text: FX.H.text(e) })),
        };
      },
      feed: (s, n) => FX.H.feed(s, n),
      rating: (s) => FX.Sim.rating(s),
      historyText: (e) => FX.H.text(e),
    },

    save: {
      serialize: (s, savedAt) => FX.Save.serialize(s, savedAt),
      deserialize: (t) => FX.Save.deserialize(t),
      hash: (s) => FX.Save.hashState(s),
    },
  };

  FX.Game = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
