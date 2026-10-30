/* ============================================================
 * events —— 事件抽取、绑定、决策、延迟队列与引用校验
 * 事件定义（数据）在 events-data.js
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;

  const Ev = {};
  Ev.defs = () => FX.EVENTS;
  Ev.def = (id) => FX.EVENTS[id];

  // 绑定对象有效性：人物需存活且在族内；势力需存在
  Ev.valid = (s, b) => {
    for (const k in b) {
      const v = b[k];
      if (typeof v !== 'string') continue;
      if (k === 'faction') { if (!s.factions[v]) return false; continue; }
      if (k === 'dead' || k.startsWith('_')) continue;
      if (/^p\d+$/.test(v) && !P().alive(s.people[v])) return false;
    }
    return true;
  };

  Ev.names = (s, b) => {
    const n = {};
    for (const k in b) {
      const v = b[k];
      if (typeof v === 'string' && /^p\d+$/.test(v)) n[k] = s.people[v] ? s.people[v].name : '（已不在）';
      else if (k === 'faction' && s.factions[v]) n[k] = s.factions[v].name;
      else n[k] = v;
    }
    return n;
  };

  Ev.spawn = (s, defId, bound, causeIds) => {
    const def = Ev.def(defId);
    if (!def) return null;
    if (!Ev.valid(s, bound)) return null;
    const inst = { id: 'e' + s.nextId++, defId, bound: bound || {}, turn: s.turn, year: s.year, causeIds: (causeIds || []).filter(Boolean), status: 'pending' };
    s.pending.push(inst);
    return inst;
  };

  Ev.schedule = (s, defId, afterTurns, bound, causeIds, chance) => {
    const q = { id: 'd' + s.nextId++, defId, bound: bound || {}, fireTurn: s.turn + afterTurns, chance: chance === undefined ? 1 : chance, causeIds: (causeIds || []).filter(Boolean), status: 'scheduled' };
    s.eventQueue.push(q);
    return q;
  };

  // 开年：处理到期的延迟效果与后续事件
  Ev.processQueue = (s) => {
    const due = s.eventQueue.filter((q) => q.status === 'scheduled' && q.fireTurn <= s.turn);
    for (const q of due) {
      const def = Ev.def(q.defId);
      q.status = 'done';
      if (!def) continue;
      let b = q.bound;
      if (!Ev.valid(s, b)) {
        const nb = def.rebind ? def.rebind(s, b) : null;
        if (nb && Ev.valid(s, nb)) b = nb;
        else {
          q.status = 'cancelled';
          const who = Object.values(b).filter((v) => typeof v === 'string' && /^p\d+$/.test(v) && !P().alive(s.people[v])).map((v) => P().name(s, v));
          H().add(s, { type: 'event', tags: ['事件', '终止'], actors: [], key: 'event', params: { title: def.name, choice: '后续终止', result: '因' + (who.join('、') || '当事人') + '已不在族中，此事不了了之' }, severity: 1, causeIds: q.causeIds });
          continue;
        }
      }
      if (def.cond && !def.cond(s, b)) { q.status = 'cancelled'; continue; }
      if (!R.chance(s.rng, q.chance)) continue;
      if (def.auto) {
        const txt = def.auto(s, b, q.causeIds);
        H().add(s, { type: 'event', tags: ['事件'].concat(def.tags || []), actors: Object.values(b).filter((v) => /^p\d+$/.test(v)), key: 'event', params: { title: def.name, choice: '后续', result: txt }, severity: def.severity || 3, causeIds: q.causeIds });
      } else Ev.spawn(s, q.defId, b, q.causeIds);
    }
    s.eventQueue = s.eventQueue.filter((q) => q.status === 'scheduled');
  };

  // 开年抽取 0 到 2 件重要事件
  Ev.draw = (s) => {
    const D = C().eventDraw, r = s.rng;
    const originMods = C().origins[s.family.origin].eventMods || {};
    const cands = [];
    for (const id of Object.keys(FX.EVENTS).sort()) {
      const def = FX.EVENTS[id];
      if (!def.draw) continue;
      if ((s.eventCooldowns[id] || -1) > s.turn) continue;
      if (s.pending.some((x) => x.defId === id)) continue;
      const b = def.bind(s);
      if (!b) continue;
      let w = def.weight * (def.wmod ? def.wmod(s, b) : 1) * (originMods[id] || 1);
      const recent = s.recentCategories.slice(-D.repeatCategoryHalve);
      if (recent.length === D.repeatCategoryHalve && recent.every((c) => c === def.category)) w *= 0.5;
      if (s.dryTurns >= D.dryTurns) w *= D.dryBoost;
      if (w > 0) cands.push({ id, b, w, def });
    }
    const out = [];
    const ch = [D.chanceFirst * (s.dryTurns >= D.dryTurns ? 1.3 : 1), D.chanceSecond];
    for (let i = 0; i < D.maxPerTurn; i++) {
      if (!cands.length || !R.chance(r, ch[i])) break;
      const pick = R.weighted(r, cands, (x) => x.w);
      if (!pick) break;
      cands.splice(cands.indexOf(pick), 1);
      const inst = Ev.spawn(s, pick.id, pick.b, pick.b._cause ? [pick.b._cause] : []);
      if (inst) { out.push(inst); s.recentCategories.push(pick.def.category); }
    }
    if (s.recentCategories.length > 6) s.recentCategories = s.recentCategories.slice(-6);
    s.dryTurns = out.length ? 0 : s.dryTurns + 1;
    return out;
  };

  // 待决事件引用失效时：按备用方案转交替代者，或取消并写明原因
  Ev.prune = (s) => {
    for (const inst of s.pending.slice()) {
      if (Ev.valid(s, inst.bound)) continue;
      const def = Ev.def(inst.defId);
      const nb = def && def.rebind ? def.rebind(s, inst.bound) : null;
      if (nb && Ev.valid(s, nb)) { inst.bound = nb; continue; }
      s.pending = s.pending.filter((x) => x !== inst);
      const who = Object.entries(inst.bound).filter(([k, v]) => k !== 'dead' && typeof v === 'string' && /^p\d+$/.test(v) && !P().alive(s.people[v])).map(([, v]) => P().name(s, v));
      H().add(s, { type: 'event', tags: ['事件', '终止'], key: 'event', params: { title: def ? def.name : inst.defId, choice: '未及处置', result: '因' + (who.join('、') || '当事人') + '已不在族中而终止' }, severity: 1, causeIds: inst.causeIds });
    }
  };

  Ev.view = (s, inst) => {
    const def = Ev.def(inst.defId);
    const n = Ev.names(s, inst.bound);
    return {
      id: inst.id,
      defId: inst.defId,
      name: def.name,
      category: def.category,
      chain: def.chain || null,
      text: typeof def.text === 'function' ? def.text(s, inst.bound, n) : U.fill(def.text, n),
      people: Object.entries(inst.bound).filter(([k, v]) => typeof v === 'string' && /^p\d+$/.test(v) && k !== 'dead').map(([, v]) => v),
      causes: inst.causeIds.map((c) => H().get(s, c)).filter(Boolean).map((e) => H().text(e)),
      options: def.options.map((o) => {
        const av = o.avail ? o.avail(s, inst.bound) : true;
        return {
          id: o.id, label: o.label,
          cost: o.cost ? o.cost(s, inst.bound, n) : '无',
          risk: o.risk ? o.risk(s, inst.bound, n) : '无明显风险',
          outcome: o.outcome ? o.outcome(s, inst.bound, n) : '',
          irreversible: !!o.irreversible,
          available: av === true, reason: av === true ? '' : av,
        };
      }),
    };
  };

  Ev.resolve = (s, instId, optId) => {
    const inst = s.pending.find((x) => x.id === instId);
    if (!inst) return { ok: false, error: '事件不存在或已处理' };
    const def = Ev.def(inst.defId);
    let opt = def.options.find((o) => o.id === optId);
    if (!opt) return { ok: false, error: '无此选项' };
    if (!Ev.valid(s, inst.bound)) {
      // 绑定的人在等待期间出事（例如同一年里死亡）：按备用方案取消
      s.pending = s.pending.filter((x) => x !== inst);
      H().add(s, { type: 'event', tags: ['事件', '终止'], key: 'event', params: { title: def.name, choice: '未及处置', result: '当事人已不在，事情自行了结' }, severity: 1, causeIds: inst.causeIds });
      return { ok: true, result: '当事人已不在，事件取消' };
    }
    const av = opt.avail ? opt.avail(s, inst.bound) : true;
    if (av !== true) return { ok: false, error: av };
    s.pending = s.pending.filter((x) => x !== inst);
    const n = Ev.names(s, inst.bound);
    // 先写决策记录，让后果可以引用它作为前因
    const hid = H().add(s, {
      type: 'event', tags: ['事件', def.category].concat(def.tags || []),
      actors: Object.entries(inst.bound).filter(([k, v]) => typeof v === 'string' && /^p\d+$/.test(v)).map(([, v]) => v),
      factions: inst.bound.faction ? [inst.bound.faction] : [],
      key: 'event', params: { title: def.name, choice: opt.label, result: '' },
      severity: def.severity || 3, causeIds: inst.causeIds,
    });
    const result = opt.apply(s, inst.bound, { hid, names: n, inst }) || '';
    const e = H().get(s, hid);
    e.params.result = result;
    e.params.defId = def.id;
    s.eventCooldowns[def.id] = s.turn + (def.cooldown || 2);
    FX.Econ.clampAll(s);
    return { ok: true, result, hid };
  };

  FX.Ev = Ev;
})(typeof globalThis !== 'undefined' ? globalThis : this);
