/* ============================================================
 * agent —— AI 家主托管（ui 一侧）
 * 大模型替玩家做家主的决定，但只能从规则当下允许的操作里挑：
 *  - 每个决定都通过 FX.Game 公开接口执行，结果由规则结算；
 *  - 选了列表外的操作一律跳过；模型失败、超时或回复看不懂时，托管暂停，局面不动；
 *  - 每一步的理由用 Game.note 记进纪事；ops 记下操作序列，同种子按序重放结果逐位相同。
 * 这个文件不访问 DOM，可在 Node 中注入 FX.AI.env 做测试。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});

  const Agent = {
    running: false,
    stopRequested: false,
    log: [], // { year, turn, text, ok }（界面显示用，不进存档）
    ops: [], // 操作序列，供重放校验
    status: '',
    onStep: null,
    maxActions: 6,
  };
  const Gm = () => FX.Game;
  const CF = () => FX.CONFIG;
  const say = (s, text, ok) => {
    Agent.log.push({ year: s.year, turn: s.turn, text, ok: ok !== false });
    if (Agent.log.length > 200) Agent.log.shift();
  };
  const step = () => { if (typeof Agent.onStep === 'function') { try { Agent.onStep(); } catch (e) { /* 界面刷新失败不影响托管 */ } } };

  /* ---------- 当下可选的操作（全部来自规则校验）---------- */
  Agent.menu = (s) => {
    const G2 = Gm(), P = FX.P, C = CF(), res = s.family.resources;
    const m = [];
    const add = (id, label, run) => m.push({ id, label, run });
    const att = FX.Sim.needsAttention(s).length;
    if (att) add('duty:attention', `按系统建议安排 ${att} 名待安排族人的差事`, () => G2.applySuggestions(s, false));
    add('duty:all', '全族按系统建议重新安排差事（会撤换现任差事）', () => G2.applySuggestions(s, true));
    for (const k of Object.keys(C.buildings)) {
      const c = FX.Econ.canUpgrade(s, k);
      if (c.ok) add('build:' + k, `升级${C.buildings[k].name}到 ${(s.family.buildings[k] || 0) + 1} 级（花灵石 ${c.cost.stone}${c.cost.ore ? '、矿材 ' + c.cost.ore : ''}）：${C.buildings[k].desc || ''}`, () => G2.upgrade(s, k));
    }
    const keepGrain = Math.ceil(FX.Econ.consumption(s).grain * 3 + 20);
    if (res.grain > keepGrain + 5) { const q = Math.floor(res.grain - keepGrain); add('sell:grain', `卖出灵谷 ${q}（保留三年口粮 ${keepGrain}），约得灵石 ${Math.round(q * FX.Econ.sellPrice(s, 'grain'))}`, () => G2.sell(s, 'grain', q)); }
    for (const k of ['ore', 'herb']) if (res[k] > 25) { const q = Math.floor(res[k] - 20); add('sell:' + k, `卖出${C.items[k]} ${q}，约得灵石 ${Math.round(q * FX.Econ.sellPrice(s, k))}`, () => G2.sell(s, k, q)); }
    for (const o of s.market.offers) {
      if (!o.qty || res.stone < o.price) continue;
      const q = o.item === 'qiju' ? Math.min(o.qty, 3, Math.floor(res.stone / o.price)) : 1;
      add('buy:' + o.item, `坊市买入${C.items[o.item] || o.item}×${q}（花灵石 ${Math.round(o.price * q)}）`, () => G2.buy(s, o.item, q));
    }
    for (const p of P.living(s)) {
      const b = G2.breakthroughPreview(s, p.id);
      if (!b || !b.kind || !b.can || !b.can.ok) continue;
      add('break:' + p.id, `让${p.name}（${P.realmName(p)}，余寿 ${P.lifespanLeft(s, p)} 年）冲击${b.target}：成功率 ${b.chance}%${b.kind !== 'minor' ? `，失败身死概率 ${b.death}%` : ''}${b.kind === 'zhuji' && res.zhuji ? '，耗筑基丹 1 颗' : ''}`, () => G2.attemptBreakthrough(s, p.id));
    }
    for (const q of s.family.requests) {
      const who = P.name(s, q.personId);
      add(`req:${q.id}:1`, `准许${who}的请求：${q.what}（代价：${FX.Family.requestCost(s, q)}）`, () => G2.answerRequest(s, q.id, true));
      add(`req:${q.id}:0`, `驳回${who}的请求：${q.what}`, () => G2.answerRequest(s, q.id, false));
    }
    const cands = FX.Family.rankCandidates(s, s.family.headId).filter((x) => x.p.id !== s.family.headId && x.p.id !== s.family.heirId).slice(0, 3);
    for (const x of cands) {
      const a = FX.Family.acceptance(s, x.p.id, s.family.headId);
      add('heir:' + x.p.id, `立${x.p.name}（${P.realmName(x.p)}，${P.age(s, x.p)} 岁）为继承人，全族接受度 ${a.value}${s.family.heirId ? '（替换现继承人' + P.name(s, s.family.heirId) + '）' : ''}`, () => G2.designateHeir(s, x.p.id));
    }
    if (s.family.heirId && s.family.headId) add('abdicate', `家主${P.name(s, s.family.headId)}退位，由继承人${P.name(s, s.family.heirId)}接任`, () => G2.abdicate(s));
    for (const cat of ['succession', 'allocation', 'foreign']) {
      if (FX.Family.ruleCooldownLeft(s, cat)) continue;
      for (const o of Object.keys(C.rules[cat])) {
        if (o === s.family.rules[cat]) continue;
        const pass = Math.round(FX.Family.resistChance(s, FX.Family.ruleAdverse(s, cat, o)) * 100);
        add(`rule:${cat}:${o}`, `把家规改为「${C.rules[cat][o].name}」：${C.rules[cat][o].desc}（家主威望 -8，阻力判定通过率约 ${pass}%）`, () => G2.changeRule(s, cat, o));
      }
    }
    if (s.family.buildings.field > (s.family.settings.herbPlots || 0)) add('herb:+1', `多划 1 块灵田种灵药（现 ${s.family.settings.herbPlots || 0} 块，少产灵谷）`, () => G2.setSetting(s, 'herbPlots', (s.family.settings.herbPlots || 0) + 1));
    if (s.family.settings.herbPlots > 0) add('herb:-1', '少种 1 块灵药，改回灵谷', () => G2.setSetting(s, 'herbPlots', s.family.settings.herbPlots - 1));
    if (res.yanshou > 0) for (const p of P.living(s)) if (p.yanshouTaken < 3 && P.lifespanLeft(s, p) < 20 && p.realm.major >= 1) add('yanshou:' + p.id, `给${p.name}（${P.realmName(p)}，余寿 ${P.lifespanLeft(s, p)} 年）服延寿丹`, () => G2.useYanshou(s, p.id));
    return m;
  };

  /* ---------- 解析模型回复 ---------- */
  Agent.parse = (text) => {
    const t = String(text || '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
  };
  const ROLE = [
    '你是一个修仙家族的家主，替玩家经营家族。目标依次是：家族长久延续、不断出筑基与金丹修士、不陷入入不敷出、族人人心稳定。',
    '你只能从给出的可选操作里挑，用它们的 id；结果由游戏规则结算，你无法改变成败。',
    '只依据给出的数据判断，不要假设没给出的信息。回复必须是 json。',
  ].join('\n');

  async function ask(messages, maxTokens) {
    const r = await FX.AI.call('agent', messages, maxTokens, { response_format: { type: 'json_object' } });
    if (!r.ok) return { ok: false, reason: r.reason };
    const j = Agent.parse(r.text);
    if (!j) return { ok: false, reason: '回复不是可读的 json' };
    return { ok: true, j };
  }

  // 回合开始：一次调用排出本回合的若干操作
  Agent.planTurn = async (s) => {
    const menu = Agent.menu(s);
    const facts = FX.AI.adviceFacts(s);
    const r = await ask([
      { role: 'system', content: ROLE + `\n回复格式：{"actions":[{"id":"可选操作的 id","why":"一句理由"}],"summary":"本回合方针，一句话"}。最多 ${Agent.maxActions} 个操作，按执行顺序排列；什么都不做就给空数组。` },
      { role: 'user', content: `家族现状：\n${facts}\n\n可选操作（id｜说明）：\n${menu.map((x) => x.id + '｜' + x.label).join('\n')}\n\n请安排第 ${s.turn} 回合（第 ${s.year} 年起五年）。` },
    ], 900);
    if (!r.ok) return r;
    const acts = Array.isArray(r.j.actions) ? r.j.actions.slice(0, Agent.maxActions) : [];
    if (r.j.summary) { Gm().note(s, '本回合方针：' + String(r.j.summary).slice(0, 120)); Agent.ops.push(['note']); say(s, '方针：' + String(r.j.summary).slice(0, 120)); }
    let done = 0;
    for (const a of acts) {
      const id = String((a && a.id) || '');
      const why = String((a && a.why) || '').slice(0, 100);
      const item = Agent.menu(s).find((x) => x.id === id); // 每步重新校验：前一步可能花掉了灵石
      if (!item) { say(s, `跳过「${id}」：此刻不在可选列表里`, false); continue; }
      const res = item.run();
      Agent.ops.push(['act', id]);
      if (res && res.ok === false) { say(s, `${item.label}：未成（${res.error}）`, false); continue; }
      done++;
      const extra = id.startsWith('break:') && res ? (res.success ? '，破关成功' : '，破关失败' + (res.died ? '，身死道消' : '')) : '';
      Gm().note(s, `${item.label.split('：')[0]}${extra}。理由：${why || '未说明'}`);
      Agent.ops.push(['note']);
      say(s, `${item.label.split('：')[0]}${extra}${why ? ' —— ' + why : ''}`);
      step();
    }
    return { ok: true, done };
  };

  // 待决事件：一次调用选一个选项
  Agent.decideEvent = async (s) => {
    const inst = s.pending[0];
    const v = FX.Ev.view(s, inst);
    const av = v.options.filter((o) => o.available);
    if (!av.length) return { ok: false, reason: '事件没有可选项' };
    const r = await ask([
      { role: 'system', content: ROLE + '\n回复格式：{"id":"选项 id","why":"一句理由"}。' },
      { role: 'user', content: `家族现状：\n${FX.AI.adviceFacts(s)}\n\n待决事件「${v.name}」：${v.text}${v.causes.length ? '\n起因：' + v.causes.join('；') : ''}\n可选项（id｜内容｜成本｜风险｜可能结果）：\n${av.map((o) => [o.id, o.label, o.cost, o.risk, o.outcome || '—'].join('｜')).join('\n')}\n请决断。` },
    ], 400);
    if (!r.ok) return r;
    const o = av.find((x) => x.id === String(r.j.id || ''));
    if (!o) return { ok: false, reason: `选了不存在的选项「${r.j.id}」` };
    const res = Gm().resolveEvent(s, inst.id, o.id);
    Agent.ops.push(['event', inst.id, o.id]);
    if (!res.ok) return { ok: false, reason: res.error };
    const why = String(r.j.why || '').slice(0, 100);
    Gm().note(s, `${v.name}：选「${o.label}」。理由：${why || '未说明'}`);
    Agent.ops.push(['note']);
    say(s, `${v.name}：选「${o.label}」${why ? ' —— ' + why : ''}。${res.result || ''}`);
    step();
    return { ok: true };
  };

  /* ---------- 托管主循环 ---------- */
  // hooks.afterTurn(s)：每个回合结束时调用（界面用来存档、润色）
  Agent.run = async (s, turns, hooks) => {
    hooks = hooks || {};
    if (Agent.running) return { ok: false, reason: '托管已在进行' };
    const rd = FX.AI.ready();
    if (!rd.ok) { Agent.status = '无法托管：' + rd.reason; step(); return { ok: false, reason: rd.reason }; }
    Agent.running = true; Agent.stopRequested = false;
    let finished = 0, planned = -1, reason = '';
    const pause = (why) => { reason = why; say(s, '托管暂停：' + why, false); };
    try {
      while (finished < turns && !s.ended) {
        if (Agent.stopRequested) { pause('你叫停了托管'); break; }
        Agent.status = `托管中：第 ${s.turn} 回合（${finished}/${turns}）`; step();
        if (s.pending.length) {
          const r = await Agent.decideEvent(s);
          if (!r.ok) { pause('事件「' + FX.Ev.def(s.pending[0].defId).name + '」未能决断（' + r.reason + '），请你来处理'); break; }
          continue;
        }
        if (s.phase !== 'advancing' && planned !== s.turn) {
          planned = s.turn;
          const r = await Agent.planTurn(s);
          if (!r.ok) { pause('第 ' + s.turn + ' 回合安排失败（' + r.reason + '），局面未动'); break; }
          if (Agent.stopRequested) continue;
        }
        const t0 = s.turn;
        const r = Gm().advance(s);
        Agent.ops.push(['advance']);
        if (!r.ok) { pause('推进失败：' + r.error); break; }
        if (s.turn !== t0 || s.ended) { finished++; if (hooks.afterTurn) hooks.afterTurn(s); }
        step();
      }
    } finally {
      Agent.running = false;
      Agent.status = reason ? '已暂停：' + reason : s.ended ? '本局已结束' : `托管完成 ${finished} 回合`;
      step();
    }
    return { ok: !reason, finished, reason };
  };
  Agent.stop = () => { Agent.stopRequested = true; };

  // 按 ops 重放（测试用）：同种子同操作序列应得到同一状态
  Agent.replay = (s, ops, notes) => {
    let ni = 0;
    for (const op of ops) {
      if (op[0] === 'act') { const it = Agent.menu(s).find((x) => x.id === op[1]); if (it) it.run(); }
      else if (op[0] === 'event') Gm().resolveEvent(s, op[1], op[2]);
      else if (op[0] === 'advance') Gm().advance(s);
      else if (op[0] === 'note') Gm().note(s, notes[ni++]);
    }
    return s;
  };

  FX.Agent = Agent;
})(typeof globalThis !== 'undefined' ? globalThis : this);
