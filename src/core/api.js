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
    // 玩家偏好（白名单内的开关，不影响规则校验）
    setOption: (s, key, val) => {
      const OPTS = { autoPill: 'bool' };
      if (!OPTS[key]) return { ok: false, error: '没有这个选项' };
      s.player[key] = !!val;
      return { ok: true };
    },
    pendingEvents: (s) => s.pending.map((i) => FX.Ev.view(s, i)),
    choose: (s, instId, optId) => {
      if (s.ended) return { ok: false, error: '这一生已经结束' };
      const r = FX.Ev.resolve(s, instId, optId);
      if (r.ok && r.days && FX.P.alive(FX.P.player(s))) FX.Sim.passDays(s, r.days, 'other');
      FX.Ars.sync(s);
      FX.Sim.checkEnd(s);
      // 排着的世事一件接一件找上门（只送已经排过一回的）
      if (r.ok) FX.Hook.deliver(s);
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
          me: p, age: P.age(s, p), realm: P.realmName(p), realmTitle: P.realmTitle(p), title: P.title(p), need: P.need(p), full: P.isFull(p),
          left: P.lifespanLeft(s, p), lifespan: P.lifespanTotal(p),
          speed: FX.CU.breakdown(s, p, { pill: s.player.qijuUntil > s.t }),
          power: P.powerBreakdown(s, p),
          tech: P.techOf(s, p), lianqi: P.lianqiOf(p), fit: FX.CU.attrFit(s, p, place),
          coinPerYear: FX.CU.coinPerYear(p),
          reqs: FX.CU.requirements(s, p),
          faction: p.factionId ? s.factions[p.factionId] : null,
          place, stone: s.player.stone, merit: s.player.merit, inv: s.player.inv, manuals: s.player.manuals,
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
          fit: FX.CU.attrFit(s, me, pl),
          faction: pl.factionId ? s.factions[pl.factionId] : null,
          visited: s.player.visited.includes(id),
          here: me.locationId === id,
          route: FX.World.route(s, me.locationId, id, me),
          // 走不通时说明原因（南域通往中域的关口要金丹）
          blocked: !FX.World.route(s, me.locationId, id, me) && FX.World.route(s, me.locationId, id) ? C().world.outer.gate.why : '',
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
          realmTitle: P.realmTitle(p),
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
      // 宗门页：本门本族的传功、库藏、俸禄；没有门派时列出各宗门的拜入条件
      house(s) {
        const p = P.player(s), Sect = FX.Sect, cf = C();
        const f = Sect.mine(s);
        if (f) {
          return {
            member: true, faction: f, seat: s.places[f.seatId], atSeat: Sect.atSeat(s, f), merit: s.player.merit,
            stipend: Sect.stipend(s, f), taskMerit: Sect.taskMerit(p), missionMerit: Sect.missionMerit(p),
            library: Sect.library(f).map((e) => ({ tech: e.tech, t: cf.techniques[e.tech], merit: e.merit || 0, zf: e.zf || '', minMajor: e.minMajor || 0, note: e.note || '', owned: s.player.manuals.includes(e.tech), using: p.techniqueId === e.tech || p.kaifuId === e.tech,
              req: [e.minPin ? cf.realms.danPinNames[e.minPin] + '以上' : '', e.minXiang ? cf.realms.xiangNames[e.minXiang] + '以上' : '', e.minDaoji ? cf.daojiNames[e.minDaoji] + '以上' : '', e.needTech ? '先修过《' + cf.techniques[e.needTech].name + '》' : ''].filter(Boolean).join('、') })),
            store: Sect.store(f).map((e) => ({ item: e.item, it: cf.items[e.item], merit: e.merit, minMajor: e.minMajor || 0, have: s.player.inv[e.item] || 0 })),
            submit: cf.house.submit,
            post: Sect.post(s, f, p), postName: Sect.postName(s, f, p),
            leader: f.leaderId && s.people[f.leaderId] ? s.people[f.leaderId] : null,
          };
        }
        return {
          member: false,
          other: p.factionId ? s.factions[p.factionId] : null,
          sects: Object.values(s.factions).filter((g) => g.type === 'sect').map((g) => {
            const can = Sect.canJoin(s, g);
            return { f: g, seat: s.places[g.seatId], join: Sect.def(g).join || null, can, chance: Sect.joinChance(s, g), route: FX.World.route(s, p.locationId, g.seatId) };
          }),
        };
      },
      // 天下大事：已有风声或正在进行的
      sagas: (s) => FX.Saga.view(s),
      feed: (s, n) => FX.H.feed(s, n),
      rating: (s) => FX.Sim.rating(s),
      historyText: (e) => FX.H.text(e),
    },

    save: {
      serialize: (s, savedAt) => FX.Save.serialize(s, savedAt),
      deserialize: (t) => FX.Save.deserialize(t),
      hash: (s) => FX.Save.hashState(s),
      // 不算 AI 记录的状态摘要：同种子同选择，开不开 AI 都该一样
      ruleHash: (s) => FX.Save.hashRules(s),
    },

    /* ---------- AI（只出提案，规则裁决；网络调用在 ui/ai.js）---------- */
    ai: {
      job: (s, kind, arg) => FX.Prop.job(s, kind, arg),
      accept: (s, job, raw) => FX.Prop.accept(s, job, raw),
      text: (s, key) => FX.Prop.text(s, key),
      latest: (s, kind) => FX.Prop.latest(s, kind),
      narrations: (s) => FX.Prop.narrations(s),
      mark: (s) => 'h' + s.nextHistId,
    },
    // 自由输入：AI 提案的打包与校验、没有 AI 时的关键词匹配、预览与执行（见 intent.js）
    intent: {
      job: (s, text) => FX.Intent.job(s, text),
      parse: (s, job, raw) => FX.Intent.parse(s, job, raw),
      match: (s, text) => FX.Intent.match(s, text),
      preview: (s, steps) => FX.Intent.preview(s, steps),
      exec: (s, plan) => { const r = FX.Intent.exec(s, plan); FX.Sim.checkEnd(s); return r; },
    },
  };

  FX.Game = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
