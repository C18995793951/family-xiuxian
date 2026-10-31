/* ============================================================
 * intent —— 自由输入：把玩家的一句话落到规则认得的行动上
 * 一句话 → 至多三步。每步是下面四种之一：
 *   act  此刻清单里的某项行动（按编号，只在原地有效）
 *   go   赶到某地（按最短路一段段走）
 *   do   常见行动按名字指（拜访、请教、游历、营生、静养、修炼、冲关、研习、服用、买、卖），到了地方再对清单
 *   deed 七个通用动作（deeds.js）
 * AI 只出提案（JSON），这里逐项校验；没有 AI、超时、提案不合格时按关键词匹配给几个候选。
 * 预览在状态副本上走一遍（只挪位置，不掷骰），写出每步的耗时、花费、成功率；玩家确认后 exec 才真正结算。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const P = () => FX.P;
  const H = () => FX.H;
  const W = () => FX.World;
  const T = () => FX.T;
  const Act = () => FX.Act;
  const Deed = () => FX.Deed;
  const Prop = () => FX.Prop;

  const Intent = {};
  const me = (s) => P().player(s);
  Intent.MAX_STEPS = 3;

  /* ---------- 词表 ---------- */
  const DO = { 拜访: 'befriend', 请教: 'consult', 游历: 'explore', 营生: 'work', 静养: 'rest', 修炼: 'cultivate', 冲关: 'breakthrough', 研习: 'learn', 服用: 'use', 买: 'buy', 卖: 'sell' };
  const DEED = { 交谈: 'talk', 打听: 'inquire', 交易: 'trade', 相助: 'help', 相争: 'fight', 潜行: 'sneak', 立约: 'pact' };
  const AIM = { 叙话: 'chat', 打听消息: 'ask', 赔礼: 'apologize', 卖: 'sell', 借: 'borrow' };
  const TOPIC = { 东西: 'item', 人: 'person', 地方: 'place', 卡关: 'way', 传闻: 'rumor' };
  const MODE = { 切磋: 'spar', 抢夺: 'rob', 赴约: 'duel' };
  const KIND = { 结拜: 'sworn', 约战: 'duel' };
  Intent.words = { DO, DEED, AIM, TOPIC, MODE, KIND };

  const STEP = {
    act: { type: 'text', maxLen: 6, digits: true },
    go: { type: 'place' },
    do: { type: 'enum', values: Object.keys(DO) },
    deed: { type: 'enum', values: Object.keys(DEED) },
    npc: { type: 'anyPerson' },
    item: { type: 'text', maxLen: 30 },
    gift: { type: 'text', maxLen: 30 },
    place: { type: 'place' },
    aim: { type: 'enum', values: Object.keys(AIM) },
    topic: { type: 'enum', values: Object.keys(TOPIC) },
    mode: { type: 'enum', values: Object.keys(MODE) },
    kind: { type: 'enum', values: Object.keys(KIND) },
  };
  Intent.SPEC = {
    say: { type: 'text', maxLen: 120, digits: true },
    ask: { type: 'text', maxLen: 120, digits: true },
    cannot: { type: 'text', maxLen: 120, digits: true },
    steps: { type: 'list', max: Intent.MAX_STEPS, of: { type: 'object', fields: STEP } },
  };

  // 物品名或功法名 → 行囊/坊市里用的 key（功法是 tech:xxx）
  const itemKey = (v) => {
    if (typeof v !== 'string') return null;
    const n = v.replace(/^《|》$/g, '').trim();
    const its = C().items, ts = C().techniques;
    if (its[n]) return n;
    const i = Object.keys(its).find((k) => its[k].name === n);
    if (i) return i;
    const t = ts[n] ? n : Object.keys(ts).find((k) => ts[k].name === n);
    return t ? 'tech:' + t : null;
  };

  /* ---------- 给 AI 看的事实 ---------- */
  // 返回 { text, acts }：acts[i] 是编号 a(i+1) 对应的行动
  Intent.facts = (s) => {
    const p = me(s), pl = s.places[p.locationId], cf = C();
    const L = [];
    const inv = Object.keys(s.player.inv).filter((k) => s.player.inv[k] > 0).map((k) => W().itemName(k) + '×' + s.player.inv[k]);
    L.push('主角：' + p.name + '，' + P().realmName(p) + '，' + P().factionName(s, p) + '，' + (p.health.state === 'healthy' ? '无伤' : p.health.state === 'heavy' ? '重伤' : '轻伤') + '，符钱 ' + s.player.stone + (p.factionId ? '，' + cf.house.meritName + ' ' + s.player.merit : '') + '。');
    L.push('行囊：' + (inv.length ? inv.join('、') : '空') + (s.player.manuals.length ? '；功法：' + s.player.manuals.map((t) => '《' + cf.techniques[t].name + '》').join('') : ''));
    L.push('所在：' + pl.name + '（' + cf.world.placeTypes[pl.type].name + '）' + (W().hasMarket(s, pl.id) ? '，有坊市' : ''));
    L.push('相邻：' + pl.links.map((l) => s.places[l.to].name + '（' + l.days + ' 天）').join('、'));
    const here = P().at(s, pl.id).filter((q) => q.id !== p.id).slice(0, 12);
    if (here.length) L.push('在场的人：' + here.map((q) => q.name + '（' + P().realmName(q) + '，' + P().factionName(s, q) + '，交情 ' + P().relValue(s, p.id, q.id) + '）').join('、'));
    const known = P().relationsOf(s, p.id).map((r) => s.people[r.a === p.id ? r.b : r.a]).filter((q) => q && P().alive(q) && q.locationId !== pl.id)
      .sort((a, b) => Math.abs(P().relValue(s, p.id, b.id)) - Math.abs(P().relValue(s, p.id, a.id))).slice(0, 8);
    if (known.length) L.push('相识的人：' + known.map((q) => q.name + '（' + P().realmName(q) + '，在' + s.places[q.locationId].name + '，交情 ' + P().relValue(s, p.id, q.id) + '）').join('、'));
    const due = (s.player.pacts || []).filter((x) => !x.done && s.people[x.npc]).map((x) => '与' + s.people[x.npc].name + (x.due <= s.t ? '的约战已到期' : '约战，期在 ' + T().fmt(x.due)));
    if (due.length) L.push('约定：' + due.join('、'));
    const g = FX.Guide && FX.Guide.next(s);
    if (g) L.push('卡关：' + g.need.label);
    const acts = Act().list(s).filter((a) => a.ok && !(a.type === 'cultivate' && (a.coin || (!a.until && a.days < 360)))).slice(0, 40);
    L.push('此刻能做（编号：说明）：\n' + acts.map((a, i) => 'a' + (i + 1) + '：' + a.label).join('\n'));
    const recent = s.history.filter((e) => e.pov).slice(-5).map((e) => T().fmt(e.t) + '：' + H().text(e));
    if (recent.length) L.push('最近：\n' + recent.join('\n'));
    return { text: L.join('\n'), acts };
  };

  const SYSTEM = [
    '你是修仙游戏的意图解析器。玩家用一句话说想做什么，你把它拆成至多三步游戏规则认得的行动，只输出一个 JSON 对象，不要别的文字。',
    '格式：{"say":"你想……（一句复述）","steps":[步骤…]}；拿不准玩家想做什么时改回 {"ask":"一句追问"}；规则里做不到时回 {"cannot":"一句原因"}。',
    '每个步骤是下面之一（字段值一律用文字，不要写数字）：',
    '1. {"act":"a3"}：此刻清单里的编号，只能放在第一步或赶路之前。',
    '2. {"go":"地名"}：赶到某地。',
    '3. {"do":"拜访|请教|游历|营生|静养|修炼|冲关|研习|服用|买|卖", "npc":"人名", "item":"物品或功法名"}：到了地方再做的常见行动；拜访、请教要 npc，研习、服用、买、卖要 item。',
    '4. {"deed":"交谈|打听|交易|相助|相争|潜行|立约", ...}：七个通用动作。',
    '   交谈：npc，aim 取 叙话|打听消息|赔礼，可加 gift（送的物品，须在行囊里），打听消息时可加 topic。',
    '   打听：在所在地向众人打听，topic 取 东西|人|地方|卡关|传闻，配 item / npc / place。',
    '   交易：npc，aim 取 卖（配 item，把行囊里的东西让给对方换符钱）|借（向对方借符钱）。',
    '   相助：npc，替对方出力（护法、寻药等）。相争：npc，mode 取 切磋|抢夺|赴约。潜行：npc，暗中跟踪、偷听。立约：npc，kind 取 结拜|约战。',
    '交谈、交易、相助、相争、潜行、立约的对象必须和主角在同一地；不在就先用 go 赶过去。',
    '只能用事实里出现的人名、地名、物品名、功法名。成败、得失、数字都由规则算，你不要写。',
    '游戏没有的做法（凭空得到宝物、直接突破境界、杀死某人、加寿元、学会没有的功法、让别人送你东西）一律回 cannot。',
    'say 用第二人称“你想……”，不超过四十字，不要写数字。',
  ].join('\n');

  Intent.job = (s, text) => {
    const f = Intent.facts(s);
    return {
      kind: 'intent', facts: f.text, acts: f.acts, input: String(text || '').slice(0, 200), maxTokens: 500,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: '事实：\n' + f.text + '\n\n玩家说：' + String(text || '').slice(0, 200) }],
    };
  };

  /* ---------- 校验：AI 的 JSON → 规范的步骤 ---------- */
  // 规范步骤：{ k:'act', a } | { k:'go', to } | { k:'do', type, npc, item } | { k:'deed', a }
  const normStep = (s, st, i, acts, moved) => {
    const keys = ['act', 'go', 'do', 'deed'].filter((k) => st[k] !== undefined);
    if (keys.length !== 1) return { error: '第 ' + (i + 1) + ' 步要且只能有 act/go/do/deed 之一' };
    const k = keys[0];
    if (k === 'act') {
      if (moved) return { error: '编号只在原地有效，赶路以后要用 do 或 deed' };
      const m = /^a?(\d{1,2})$/.exec(String(st.act).trim());
      const a = m && acts[Number(m[1]) - 1];
      if (!a) return { error: '没有编号 ' + st.act };
      const pick = { type: a.type };
      for (const x of ['days', 'to', 'npc', 'item', 'tech', 'fid', 'gid', 'n', 'path', 'zf', 'hall', 'coin', 'until']) if (a[x] !== undefined) pick[x] = a[x];
      return { step: { k: 'act', a: pick } };
    }
    if (k === 'go') return { step: { k: 'go', to: st.go } };
    const item = st.item !== undefined ? itemKey(st.item) : null;
    if (st.item !== undefined && !item) return { error: '没有这样东西：' + st.item };
    const gift = st.gift !== undefined ? itemKey(st.gift) : null;
    if (st.gift !== undefined && (!gift || gift.startsWith('tech:'))) return { error: '送不了：' + st.gift };
    if (k === 'do') {
      const type = DO[st.do];
      if ((type === 'befriend' || type === 'consult') && !st.npc) return { error: st.do + '要说明对谁' };
      if (['learn', 'use', 'buy', 'sell'].includes(type) && !item) return { error: st.do + '要说明哪样东西' };
      return { step: { k: 'do', type, npc: st.npc, item } };
    }
    const a = { type: 'deed', verb: DEED[st.deed] };
    if (st.npc) a.npc = st.npc;
    if (item) a.item = item.startsWith('tech:') ? null : item;
    if (item && item.startsWith('tech:')) return { error: '功法不能拿来交易' };
    if (gift) a.gift = gift;
    if (st.place) a.place = st.place;
    if (st.aim) a.aim = AIM[st.aim];
    if (st.topic) a.topic = TOPIC[st.topic];
    if (st.mode) a.mode = MODE[st.mode];
    if (st.kind) a.kind = KIND[st.kind];
    // 打听东西/人/地方时，对象顺手补上话题
    if (a.verb === 'inquire' && !a.topic) a.topic = a.item ? 'item' : a.npc ? 'person' : a.place ? 'place' : 'rumor';
    return { step: { k: 'deed', a } };
  };

  // 返回 { ok, say, steps } | { ok, ask } | { ok, cannot } | { ok:false, why }
  Intent.parse = (s, job, raw) => {
    const j = Prop().parseJSON(raw);
    if (!j.ok) return { ok: false, why: j.error };
    const r = Prop().checkSpec(s, Intent.SPEC, j.value);
    if (!r.ok) return { ok: false, why: r.errors.slice(0, 3).join('；') };
    const v = r.value;
    // 复述、追问、原因也是给玩家看的文字：不准编数字和名字
    const facts = job.facts + '\n' + job.input;
    for (const f of ['say', 'ask', 'cannot']) if (v[f]) { const why = Prop().checkText(s, v[f], facts, { maxLen: 120 }); if (why) { if (f === 'say') delete v.say; else return { ok: false, why: f + '：' + why }; } }
    if (v.ask) return { ok: true, ask: v.ask };
    if (v.cannot) return { ok: true, cannot: v.cannot };
    if (!v.steps || !v.steps.length) return { ok: false, why: '没有步骤' };
    const steps = [];
    let moved = false;
    for (let i = 0; i < v.steps.length; i++) {
      const n = normStep(s, v.steps[i], i, job.acts, moved);
      if (n.error) return { ok: false, why: n.error };
      if (n.step.k === 'go' || (n.step.k === 'act' && n.step.a.type === 'travel')) moved = true;
      steps.push(n.step);
    }
    return { ok: true, say: v.say || null, steps };
  };

  /* ---------- 落到具体行动（在给定状态上；只读）---------- */
  // 返回 { ok, reason, label, days, cost, chance, risk, gain, run }，run 是交给 Act.run 的东西（go 例外）
  Intent.resolve = (s, st) => {
    const p = me(s);
    const no = (label, why) => ({ ok: false, reason: why, label });
    if (st.k === 'go') {
      const to = s.places[st.to];
      if (!to) return no('赶路', '没有这个地方');
      if (to.id === p.locationId) return { ok: true, label: '已在' + to.name, days: 0, go: true, skip: true };
      const r = W().route(s, p.locationId, to.id, p);
      if (!r) return no('前往' + to.name, W().route(s, p.locationId, to.id) ? C().world.outer.gate.why : '走不通');
      return { ok: true, label: '赶路到' + to.name + '（' + r.days + ' 天' + (r.path.length > 2 ? '，' + (r.path.length - 1) + ' 段' : '') + '）', days: r.days, go: true, risk: '路上可能遇事，遇事就停下' };
    }
    if (st.k === 'deed') {
      const c = Deed().check(s, st.a);
      return Object.assign({}, c, { run: st.a, label: c.label || Deed().VERBS[st.a.verb].name });
    }
    const L = Act().list(s);
    let a = null;
    if (st.k === 'act') a = Act().find(s, st.a);
    else {
      const t = st.type;
      if (t === 'buy' || t === 'sell') {
        const name = W().itemName(st.item);
        if (t === 'sell') {
          const m = Act().marketOf(s);
          if (!m) return no('卖' + name, '此地没有坊市');
          if (!((s.player.inv[st.item] || 0) > 0)) return no('卖' + name, '行囊里没有' + name);
          return { ok: true, label: '在坊市卖掉' + name + ' 一份', days: 0, run: { type: 'sell', item: st.item, qty: 1 } };
        }
        const m = Act().marketOf(s);
        const slot = m && m.stock.find((x) => x.item === st.item && x.qty > 0);
        if (!m) return no('买' + name, '此地没有坊市');
        if (!slot) return no('买' + name, s.places[p.locationId].name + '的货架上没有' + name);
        if (s.player.stone < slot.price) return no('买' + name, '符钱不够（要 ' + slot.price + '，你有 ' + s.player.stone + '）');
        return { ok: true, label: '买' + name + ' 一份', days: 0, cost: slot.price, run: { type: 'buy', item: st.item, qty: 1 } };
      }
      const of = L.filter((x) => x.type === t);
      if (t === 'befriend' || t === 'consult') {
        const q = s.people[st.npc];
        a = of.find((x) => x.npc === st.npc);
        if (!a) return no((t === 'consult' ? '请教' : '拜访') + (q ? q.name : ''), !q || !P().alive(q) ? '这人已不在人世' : q.locationId !== p.locationId ? q.name + '不在这里，在' + s.places[q.locationId].name : t === 'consult' ? Act().canConsult(s, q) === true ? '对方修为不比你高' : Act().canConsult(s, q) : '见不着');
      } else if (t === 'learn') a = of.find((x) => 'tech:' + x.tech === st.item) || null;
      else if (t === 'use') a = of.find((x) => x.item === st.item) || null;
      else if (t === 'cultivate') a = of.find((x) => x.until) || of.find((x) => !x.coin && x.days === 360) || of.find((x) => !x.coin);
      else if (t === 'explore' || t === 'rest') a = of.slice().sort((x, y) => x.days - y.days)[0];
      else if (t === 'breakthrough') a = of.find((x) => !x.path) || of[0];
      else a = of[0];
      if (!a) {
        const what = { learn: '研习', use: '服用', cultivate: '修炼', explore: '游历', rest: '静养', breakthrough: '冲关', work: '营生' }[t] || t;
        return no(what, t === 'work' ? '这里没有营生可做' : t === 'rest' ? '没有受伤' : t === 'breakthrough' ? '眼下没有关可冲' : t === 'learn' || t === 'use' ? '手里没有这样东西，或眼下用不了' : '此刻不能这样做');
      }
    }
    if (!a) return no('行动', '此刻不能这样做');
    const ch = /（(\d+)%）/.exec(a.label);
    let chance = ch ? Number(ch[1]) : null;
    if (a.type === 'consult') { const rel = P().relValue(s, p.id, a.npc); chance = Math.round(Math.max(40, Math.min(90, 40 + rel / 1.5))); }
    const run = {};
    for (const x of ['type', 'days', 'to', 'npc', 'item', 'tech', 'fid', 'gid', 'n', 'path', 'zf', 'hall', 'coin', 'until']) if (a[x] !== undefined) run[x] = a[x];
    return { ok: a.ok, reason: a.reason, label: a.label, days: a.days || 0, cost: a.cost || 0, chance, run, warn: a.warn || '' };
  };

  /* ---------- 预览：在副本上一步步对 ---------- */
  Intent.preview = (s, steps) => {
    const v = JSON.parse(JSON.stringify(s));
    const out = [];
    let days = 0, cost = 0, ok = true;
    for (const st of steps) {
      const r = Intent.resolve(v, st);
      out.push(r);
      if (!r.ok) { ok = false; break; }
      days += r.days || 0; cost += r.cost || 0;
      // 只挪位置，不掷骰、不结算
      if (r.go) me(v).locationId = st.to;
      else if (r.run && r.run.type === 'travel') me(v).locationId = r.run.to;
    }
    return { ok, rows: out, days, cost };
  };

  /* ---------- 执行 ---------- */
  // 一路赶到某地：按最短路一段段走，出事、走不通就停
  Intent.travel = (s, to) => {
    let legs = 0;
    while (legs < 40) {
      const p = me(s);
      if (p.locationId === to) return { ok: true, legs };
      const r = W().route(s, p.locationId, to, p);
      if (!r || r.path.length < 2) return { ok: false, legs, why: '走不通' };
      const a = Act().list(s).find((x) => x.type === 'travel' && x.to === r.path[1]);
      if (!a || !a.ok) return { ok: false, legs, why: a ? a.reason : '此刻走不了' };
      const res = Act().run(s, a);
      if (!res.ok) return { ok: false, legs, why: res.error };
      legs++;
      if (s.pending.length || s.ended || res.interrupted) return { ok: me(s).locationId === to && !s.pending.length, legs, why: s.pending.length ? '路上出了事' : res.text || '路上出了变故', stop: true };
    }
    return { ok: false, legs, why: '路太远' };
  };

  // 逐步执行；返回 { done, texts, stopped }
  Intent.exec = (s, plan) => {
    const texts = [];
    let done = 0, stopped = '';
    Prop().record(s, 'intent', 'i:' + s.t + ':' + FX.U.hash(JSON.stringify(plan.steps) + (plan.input || '')), { input: plan.input || '', say: plan.say || '', steps: plan.steps, via: plan.via || 'match' });
    for (const st of plan.steps) {
      if (s.ended || s.pending.length) { stopped = s.ended ? '这一生已经结束' : '眼前有事要先决断'; break; }
      const r = Intent.resolve(s, st);
      if (!r.ok) { stopped = r.label + '：' + r.reason; break; }
      if (r.skip) { done++; continue; }
      if (r.go) {
        const t = Intent.travel(s, st.to);
        if (t.legs) texts.push('赶路 ' + t.legs + ' 段' + (t.ok ? '，到了' + s.places[st.to].name : ''));
        if (!t.ok || t.stop) { stopped = t.why; if (t.ok) done++; break; }
        done++;
        continue;
      }
      const res = Act().run(s, r.run);
      if (!res.ok) { stopped = res.error; break; }
      done++;
      if (res.text) texts.push(res.text);
      if (res.interrupted) { stopped = '中途出了变故'; break; }
    }
    if (!stopped && done < plan.steps.length) stopped = '没走完';
    return { done, total: plan.steps.length, texts, stopped };
  };

  /* ---------- 没有 AI：按关键词匹配 ---------- */
  const has = (t, re) => re.test(t);
  // 句子里提到的专名，长名先比
  const mentions = (s, t) => {
    const p = me(s);
    const ppl = Object.values(s.people).filter((q) => q.id !== p.id && q.name && q.name.length >= 2 && t.includes(q.name))
      .sort((a, b) => (P().alive(b) - P().alive(a)) || (b.locationId === p.locationId) - (a.locationId === p.locationId) || Math.abs(P().relValue(s, p.id, b.id)) - Math.abs(P().relValue(s, p.id, a.id)));
    const places = Object.values(s.places).filter((x) => x.name && t.includes(x.name)).sort((a, b) => b.name.length - a.name.length);
    const items = [];
    for (const k of Object.keys(C().items)) { const n = C().items[k].name; if (n && n.length >= 2 && t.includes(n)) items.push(k); }
    for (const k of Object.keys(C().techniques)) { const n = C().techniques[k].name; if (n && n.length >= 2 && t.includes(n)) items.push('tech:' + k); }
    return { q: ppl[0] || null, place: places[0] || null, item: items.sort((a, b) => W().itemName(b).length - W().itemName(a).length)[0] || null };
  };
  Intent.match = (s, text) => {
    const t = String(text || '');
    const p = me(s);
    const m = mentions(s, t);
    const q = m.q && P().alive(m.q) ? m.q : null;
    const cands = [];
    const add = (say, steps) => cands.push({ say, steps, via: 'match', input: t });
    const toQ = (steps) => (q && q.locationId !== p.locationId ? [{ k: 'go', to: q.locationId }].concat(steps) : steps);
    const dd = (a) => ({ k: 'deed', a: Object.assign({ type: 'deed' }, a) });
    const it = m.item && !m.item.startsWith('tech:') ? m.item : null;
    if (q) {
      const nm = q.name;
      if (has(t, /切磋|比试|较量/)) add('与' + nm + '切磋', toQ([dd({ verb: 'fight', npc: q.id, mode: 'spar' })]));
      if (has(t, /抢|劫|夺/)) add('抢夺' + nm, toQ([dd({ verb: 'fight', npc: q.id, mode: 'rob' })]));
      if (has(t, /赴约|约战之期/)) add('赴约与' + nm + '斗法', toQ([dd({ verb: 'fight', npc: q.id, mode: 'duel' })]));
      if (has(t, /跟踪|跟着|尾随|偷听|潜入|盯着|摸清/)) add('暗中跟着' + nm, toQ([dd({ verb: 'sneak', npc: q.id })]));
      if (has(t, /结拜|结义|兄弟|姊妹|姐妹/)) add('与' + nm + '结拜', toQ([dd({ verb: 'pact', npc: q.id, kind: 'sworn' })]));
      if (has(t, /约战|再战|年后/)) add('与' + nm + '约战', toQ([dd({ verb: 'pact', npc: q.id, kind: 'duel' })]));
      if (has(t, /借/)) add('向' + nm + '借符钱', toQ([dd({ verb: 'trade', npc: q.id, aim: 'borrow' })]));
      if (has(t, /卖|换钱|出手/) && it) add('把' + W().itemName(it) + '让给' + nm, toQ([dd({ verb: 'trade', npc: q.id, aim: 'sell', item: it })]));
      if (has(t, /帮|助|护法|出力|寻药/)) add('替' + nm + '出力', toQ([dd({ verb: 'help', npc: q.id })]));
      if (has(t, /赔礼|道歉|赔罪|和解/)) add('向' + nm + '赔礼', toQ([dd(Object.assign({ verb: 'talk', npc: q.id, aim: 'apologize' }, it ? { gift: it } : {}))]));
      if (has(t, /请教|指点|讨教/)) add('向' + nm + '请教', toQ([{ k: 'do', type: 'consult', npc: q.id }]));
      if (has(t, /打听|问|消息|下落/)) add('向' + nm + '打听', toQ([dd(Object.assign({ verb: 'talk', npc: q.id, aim: 'ask' }, m.item && it ? { topic: 'item', item: it } : { topic: has(t, /卡|缺|下一步/) ? 'way' : 'rumor' }))]));
      if (has(t, /送|赠|礼/) && it) add('把' + W().itemName(it) + '送给' + nm, toQ([dd({ verb: 'talk', npc: q.id, aim: 'chat', gift: it })]));
      if (!cands.length) {
        add('拜访' + nm, toQ([{ k: 'do', type: 'befriend', npc: q.id }]));
        add('与' + nm + '叙话', toQ([dd({ verb: 'talk', npc: q.id, aim: 'chat' })]));
      }
      if (q.locationId !== p.locationId) add('先赶到' + s.places[q.locationId].name + '找' + nm, [{ k: 'go', to: q.locationId }]);
    } else if (m.q) add('打听' + m.q.name + '的下落', [dd({ verb: 'inquire', topic: 'person', npc: m.q.id })]);
    if (m.item) {
      const nm = W().itemName(m.item);
      if (has(t, /买|购|入手/)) add('买' + nm, [{ k: 'do', type: 'buy', item: m.item }]);
      if (has(t, /卖/) && !q) add('卖掉' + nm, [{ k: 'do', type: 'sell', item: m.item }]);
      if (has(t, /服|吃|用/)) add('服用' + nm, [{ k: 'do', type: 'use', item: m.item }]);
      if (has(t, /研习|修习|学|参悟/) && m.item.startsWith('tech:')) add('研习' + nm, [{ k: 'do', type: 'learn', item: m.item }]);
      if (it) add('打听' + nm + '哪里有', (m.place && m.place.id !== p.locationId ? [{ k: 'go', to: m.place.id }] : []).concat([dd({ verb: 'inquire', topic: 'item', item: it })]));
    }
    if (m.place && m.place.id !== p.locationId) {
      const tail = has(t, /游历|历练|逛/) ? [{ k: 'do', type: 'explore' }] : has(t, /打工|营生|差事|挣/) ? [{ k: 'do', type: 'work' }] : has(t, /闭关|修炼/) ? [{ k: 'do', type: 'cultivate' }] : [];
      add('前往' + m.place.name, [{ k: 'go', to: m.place.id }].concat(tail));
      if (has(t, /打听|情形|怎样|如何/)) add('打听' + m.place.name + '的情形', [dd({ verb: 'inquire', topic: 'place', place: m.place.id })]);
    }
    if (has(t, /冲关|突破|筑基|紫府|金丹|元神/)) add('冲关', [{ k: 'do', type: 'breakthrough' }]);
    if (has(t, /闭关|修炼|打坐|吐纳/)) add('闭关修炼', [{ k: 'do', type: 'cultivate' }]);
    if (has(t, /游历|历练|逛逛|转转|走走/)) add('在此地游历', [{ k: 'do', type: 'explore' }]);
    if (has(t, /打工|营生|差事|挣钱|赚钱|干活/)) add('做营生挣符钱', [{ k: 'do', type: 'work' }]);
    if (has(t, /养伤|静养|疗伤/)) add('静养', [{ k: 'do', type: 'rest' }]);
    if (has(t, /卡|缺|下一步|怎么办|去哪/)) add('打听眼下卡关的来路', [dd({ verb: 'inquire', topic: 'way' })]);
    if (has(t, /打听|传闻|消息|新鲜事/) && !q && !m.item) add('在此地打听近来的传闻', [dd({ verb: 'inquire', topic: 'rumor' })]);
    // 去重，先放走得通的
    const seen = new Set();
    const out = [];
    for (const c of cands) {
      const k = JSON.stringify(c.steps);
      if (seen.has(k)) continue;
      seen.add(k);
      c.check = Intent.preview(s, c.steps);
      out.push(c);
    }
    out.sort((a, b) => b.check.ok - a.check.ok);
    return out.slice(0, 3);
  };

  FX.Intent = Intent;
})(typeof globalThis !== 'undefined' ? globalThis : this);
