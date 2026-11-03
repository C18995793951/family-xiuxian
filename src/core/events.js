/* ============================================================
 * events —— 待决事件：绑定、选项视图、结算、延迟后续、引用校验
 * 事件定义（数据）在 encounters.js。阶段 3 起 AI 生成的事件提案
 * 经规则验证后也走这里结算。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;

  const Ev = {};
  Ev.def = (id) => FX.EVENTS[id];
  // 数据事件（钩子长出来的事）的标题、选项随实例而定
  Ev.title = (s, inst) => { const d = Ev.def(inst.defId); return d ? (typeof d.name === 'function' ? d.name(s, inst.bound) : d.name) : inst.defId; };
  Ev.opts = (s, inst) => { const d = Ev.def(inst.defId); return typeof d.options === 'function' ? d.options(s, inst.bound) : d.options; };
  const isPid = (v) => typeof v === 'string' && /^p\d+$/.test(v);

  // 绑定对象有效性：人物需在世，势力与地点需存在
  Ev.valid = (s, b) => {
    for (const k in b) {
      const v = b[k];
      if (k.startsWith('_')) continue;
      if (k === 'faction') { if (!s.factions[v]) return false; continue; }
      if (k === 'place') { if (!s.places[v]) return false; continue; }
      if (isPid(v) && !P().alive(s.people[v])) return false;
    }
    return true;
  };

  Ev.names = (s, b) => {
    const n = {};
    for (const k in b) {
      const v = b[k];
      if (isPid(v)) n[k] = s.people[v] ? s.people[v].name : '（已不在）';
      else if (k === 'faction' && s.factions[v]) n[k] = s.factions[v].name;
      else if (k === 'place' && s.places[v]) n[k] = s.places[v].name;
      else n[k] = v;
    }
    return n;
  };

  Ev.spawn = (s, defId, bound, causeIds) => {
    if (!Ev.def(defId) || !Ev.valid(s, bound || {})) return null;
    const inst = { id: 'e' + s.nextId++, defId, bound: bound || {}, t: s.t, causeIds: (causeIds || []).filter(Boolean) };
    s.pending.push(inst);
    return inst;
  };

  Ev.schedule = (s, defId, afterDays, bound, causeIds, chance) => {
    const q = { id: 'd' + s.nextId++, defId, bound: bound || {}, fireT: s.t + afterDays, chance: chance === undefined ? 1 : chance, causeIds: (causeIds || []).filter(Boolean) };
    s.eventQueue.push(q);
    return q;
  };

  // 到期的后续：引用失效就写明原因后取消
  Ev.processQueue = (s) => {
    const due = s.eventQueue.filter((q) => q.fireT <= s.t);
    if (!due.length) return;
    s.eventQueue = s.eventQueue.filter((q) => q.fireT > s.t);
    for (const q of due) {
      const def = Ev.def(q.defId);
      if (!def) continue;
      if (!Ev.valid(s, q.bound)) continue;
      if (def.cond && !def.cond(s, q.bound)) continue;
      if (!R.chance(s.rng, q.chance)) continue;
      if (def.auto) {
        const txt = def.auto(s, q.bound, q.causeIds);
        if (txt) H().add(s, { type: 'event', tags: ['事件'], actors: Object.values(q.bound).filter(isPid), key: 'event', params: { title: def.name, choice: '后续', result: txt }, severity: def.severity || 3, pov: true, causeIds: q.causeIds });
      } else Ev.spawn(s, q.defId, q.bound, q.causeIds);
    }
  };

  // 待决事件引用失效（例如对手先一步死了）：取消并写明原因
  Ev.prune = (s) => {
    for (const inst of s.pending.slice()) {
      if (Ev.valid(s, inst.bound)) continue;
      s.pending = s.pending.filter((x) => x !== inst);
      const def = Ev.def(inst.defId);
      H().add(s, { type: 'event', tags: ['事件', '终止'], key: 'event', params: { title: def ? Ev.title(s, inst) : inst.defId, choice: '未及处置', result: '当事人已不在，事情自行了结' }, severity: 1, pov: true, causeIds: inst.causeIds });
    }
  };

  Ev.view = (s, inst) => {
    const def = Ev.def(inst.defId);
    const n = Ev.names(s, inst.bound);
    return {
      id: inst.id,
      defId: inst.defId,
      name: Ev.title(s, inst),
      category: def.category,
      text: typeof def.text === 'function' ? def.text(s, inst.bound, n) : U.fill(def.text, n),
      people: Object.entries(inst.bound).filter(([k, v]) => !k.startsWith('_') && isPid(v)).map(([, v]) => v),
      causes: inst.causeIds.map((c) => H().get(s, c)).filter(Boolean).map((e) => H().text(e)),
      options: Ev.opts(s, inst).map((o) => {
        const av = o.avail ? o.avail(s, inst.bound) : true;
        return {
          id: o.id, label: o.label,
          cost: o.cost ? o.cost(s, inst.bound, n) : '无',
          risk: o.risk ? o.risk(s, inst.bound, n) : '无明显风险',
          outcome: o.outcome ? o.outcome(s, inst.bound, n) : '',
          chance: o.chance ? o.chance(s, inst.bound) : null,
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
    const opt = Ev.opts(s, inst).find((o) => o.id === optId);
    if (!opt) return { ok: false, error: '无此选项' };
    if (!Ev.valid(s, inst.bound)) { Ev.prune(s); return { ok: true, result: '当事人已不在，事件取消' }; }
    const av = opt.avail ? opt.avail(s, inst.bound) : true;
    if (av !== true) return { ok: false, error: av };
    s.pending = s.pending.filter((x) => x !== inst);
    // 先写决策记录，让后果可以引用它作为前因
    const hid = H().add(s, {
      type: 'event', tags: ['事件', def.category], actors: Object.entries(inst.bound).filter(([k, v]) => !k.startsWith('_') && isPid(v)).map(([, v]) => v),
      places: inst.bound.place ? [inst.bound.place] : [], key: 'event', params: { title: Ev.title(s, inst), choice: opt.label, result: '' },
      severity: def.severity || 2, pov: true, causeIds: inst.causeIds,
    });
    const out = opt.apply(s, inst.bound, { hid, names: Ev.names(s, inst.bound), inst }) || {};
    // 经了一件事，心境就开阔一分；动过手的更多
    if (FX.Xin && s.player && P().alive(P().player(s))) FX.Xin.add(s, FX.CONFIG.xin.event + (def.category === '遭遇' ? FX.CONFIG.xin.fight : 0));
    const result = typeof out === 'string' ? out : out.text || '';
    const e = H().get(s, hid);
    e.params.result = result;
    // 斗法、逃遁另有一条写得更细的纪事（以这条为前因），这条决断记录就不再进纪事，免得一件事说两遍
    for (let i = s.history.length - 1; i >= 0 && s.history[i] !== e; i--) {
      const x = s.history[i];
      if (x.pov && x.type === 'fight' && x.causeIds.includes(hid)) { e.pov = false; e.severity = 1; break; }
    }
    e.params.defId = inst.defId;
    if (inst.bound._kind) e.params.kind = inst.bound._kind;
    return { ok: true, result, hid, gain: !!out.gain, days: out.days || 0 };
  };

  FX.Ev = Ev;
})(typeof globalThis !== 'undefined' ? globalThis : this);
