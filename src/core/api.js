/* ============================================================
 * api —— 界面与测试脚本共用的公开函数。界面只通过这里操作核心。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const P = FX.P;

  const guardArrange = (s) => {
    if (s.ended) return '本局已结束';
    if (s.phase !== 'arrange') return '推进中途有待决断的事件，请先处理';
    return null;
  };
  const wrap = (fn) => (s, ...args) => {
    const g = guardArrange(s);
    if (g) return { ok: false, error: g };
    return fn(s, ...args);
  };

  const Game = {
    newGame: (opts) => FX.Sim.newGame(opts || {}),
    advance: (s) => FX.Sim.advance(s),
    // 中断后继续完成本回合剩余年份
    resume: (s) => FX.Sim.advance(s),
    resolveEvent: (s, instId, optId) => {
      const r = FX.Ev.resolve(s, instId, optId);
      if (r.ok) FX.Sim.checkEnd(s);
      return r;
    },
    pendingEvents: (s) => s.pending.map((i) => FX.Ev.view(s, i)),

    setDuty: wrap(FX.Sim.setDuty),
    batchSetDuty: wrap(FX.Sim.batchSetDuty),
    confirmDuty: wrap(FX.Sim.confirmDuty),
    applySuggestions: wrap((s, all) => FX.Sim.suggestAll(s, all)),
    breakthroughPreview: (s, id) => {
      const p = s.people[id];
      if (!p) return null;
      const can = FX.CU.canAttempt(s, p);
      return Object.assign({ can }, FX.CU.chance(s, p) || {});
    },
    attemptBreakthrough: wrap((s, id) => FX.CU.attempt(s, s.people[id])),
    upgrade: wrap(FX.Econ.upgrade),
    buy: wrap(FX.Econ.buy),
    sell: wrap(FX.Econ.sell),
    setSetting: wrap((s, key, val) => {
      if (!(key in s.family.settings)) return { ok: false, error: '无此设置' };
      if (key === 'herbPlots') val = Math.max(0, Math.min(s.family.buildings.field || 0, Math.floor(val)));
      s.family.settings[key] = val;
      return { ok: true };
    }),
    designateHeir: wrap(FX.Family.designateHeir),
    abdicate: wrap(FX.Family.abdicate),
    changeRule: wrap(FX.Family.changeRule),
    setFocus: wrap(FX.Family.setFocus),
    answerRequest: wrap(FX.Family.answerRequest),
    useYanshou: wrap((s, id) => ({ ok: true, text: FX.Sim.takeYanshou(s, s.people[id]) })),
    seal: (s) => FX.Sim.seal(s),

    /* ---------- 视图数据（只读）---------- */
    view: {
      overview(s) {
        const top = FX.Family.strongest(s);
        const head = s.people[s.family.headId];
        return {
          year: s.year, turn: s.turn, yearInTurn: s.yearInTurn, phase: s.phase,
          surname: s.family.surname, origin: FX.CONFIG.origins[s.family.origin].name,
          ancestor: top ? { id: top.id, name: top.name, realm: P.realmName(top), left: P.lifespanLeft(s, top), power: Math.round(P.power(s, top) * 10) / 10 } : null,
          successors: FX.Family.successorCultivators(s).slice(0, 3).map((p) => ({ id: p.id, name: p.name, realm: P.realmName(p), left: P.lifespanLeft(s, p) })),
          head: head ? { id: head.id, name: head.name, realm: P.realmName(head), age: P.age(s, head), prestige: Math.round(s.family.headAuthority.prestige) } : null,
          heir: s.family.heirId ? { id: s.family.heirId, name: P.name(s, s.family.heirId) } : null,
          branches: s.family.branches,
          resources: s.family.resources,
          edge: s.family.edge,
          edgeTarget: FX.Family.edgeTarget(s),
          defense: FX.Family.defensePower(s),
          population: P.living(s).length,
          natives: P.natives(s).length,
          prestige: Math.round(s.family.prestige),
          deficit: s.family.deficit,
          attention: FX.Sim.needsAttention(s).length,
          requests: s.family.requests.length,
          pending: s.pending.length,
          forecast: FX.Econ.forecast(s),
          ended: s.ended,
        };
      },
      person(s, id) {
        const p = s.people[id];
        if (!p) return null;
        return {
          p,
          age: P.age(s, p),
          realm: P.realmName(p),
          need: P.need(p),
          left: P.lifespanLeft(s, p),
          status: FX.Sim.dutyStatus(s, p),
          power: Math.round(P.power(s, p) * 10) / 10,
          speed: FX.CU.breakdown(s, p),
          relations: P.relationsOf(s, p.id).map((r) => ({ other: r.a === p.id ? r.b : r.a, name: P.name(s, r.a === p.id ? r.b : r.a), type: r.type, strength: r.strength, tags: r.tags })),
          life: FX.H.lifeSummary(s, p),
          loyaltyBase: Math.round(FX.Family.loyaltyBaseline(s, p)),
          history: s.history.filter((e) => e.actors.includes(p.id)).slice(-30).map((e) => ({ id: e.id, year: e.year, text: FX.H.text(e) })),
        };
      },
      chronicle: (s, turn) => FX.H.chronicle(s, turn),
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
