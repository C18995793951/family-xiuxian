/* ============================================================
 * ai —— 大模型润色（表现层，ui 一侧）
 * 规则算结果，大模型只写文字：
 *  - 只读游戏状态，从不写回；结果只存在本页内存里，不进存档、不影响哈希。
 *  - 未开启、无 key、无网络、失败或超时，一律静默回落到模板文字；推进从不等待它。
 *  - key 只存在浏览器 localStorage，只发往玩家配置的接口地址，不进存档、不打日志。
 * 这个文件不访问 DOM，可在 Node 中注入 fetch / storage 做测试。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});

  const LS_CFG = 'family-xiuxian:ai';
  const LS_KEY = 'family-xiuxian:ai-key';

  const AI = {
    defaults: {
      enabled: false,
      // 与 project-companion（AI 朋友）实测可用的配置一致：deepseek-flash、官方 chat/completions、关闭思考
      model: 'deepseek-flash',
      endpoint: 'https://api.deepseek.com/chat/completions',
      timeoutMs: 30000,
      dailyLimit: 100, // 本机每天最多调用次数，防止误刷
    },
    models: ['deepseek-flash', 'deepseek-chat', 'deepseek-reasoner'],
    // 可注入：测试时替换为假实现
    env: {
      fetch: typeof G.fetch === 'function' ? (...a) => G.fetch(...a) : null,
      storage: (() => { try { return G.localStorage || null; } catch (e) { return null; } })(),
      now: () => Date.now(),
    },
    cache: new Map(), // key -> { text, at }
    pending: new Map(), // key -> Promise
    failed: new Map(), // key -> reason（失败后不自动重试，避免反复计费）
    status: null, // 最近一次调用：{ at, kind, ok, reason }
    onUpdate: null,
    calls: 0,
  };

  /* ---------- 配置与 key ---------- */
  const store = () => AI.env.storage;
  AI.config = () => {
    let c = {};
    try { c = JSON.parse((store() && store().getItem(LS_CFG)) || '{}') || {}; } catch (e) { c = {}; }
    return Object.assign({}, AI.defaults, c);
  };
  AI.saveConfig = (patch) => {
    const c = Object.assign(AI.config(), patch || {});
    const clean = { enabled: !!c.enabled, model: String(c.model || AI.defaults.model).trim().slice(0, 64), endpoint: String(c.endpoint || AI.defaults.endpoint).trim().slice(0, 300), timeoutMs: Number(c.timeoutMs) || AI.defaults.timeoutMs, dailyLimit: Math.max(1, Math.floor(Number(c.dailyLimit) || AI.defaults.dailyLimit)) };
    try { store() && store().setItem(LS_CFG, JSON.stringify(clean)); } catch (e) { /* 存不了就只在本页生效 */ }
    return clean;
  };
  AI.hasKey = () => { try { return !!(store() && store().getItem(LS_KEY)); } catch (e) { return false; } };
  AI.setKey = (k) => {
    k = String(k || '').trim();
    try { if (!store()) return false; if (k) store().setItem(LS_KEY, k); else store().removeItem(LS_KEY); return true; } catch (e) { return false; }
  };
  const getKey = () => { try { return (store() && store().getItem(LS_KEY)) || ''; } catch (e) { return ''; } };

  AI.validEndpoint = (u) => /^https:\/\/[^\s/]+\/\S*$/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S*$/.test(u);

  // 能否调用；不能时给出回落原因
  AI.ready = () => {
    const c = AI.config();
    if (!c.enabled) return { ok: false, reason: '未开启 AI 功能' };
    if (!AI.hasKey()) return { ok: false, reason: '未填写 key' };
    if (!AI.env.fetch) return { ok: false, reason: '环境不支持网络请求' };
    if (!AI.validEndpoint(c.endpoint)) return { ok: false, reason: '接口地址无效（需 https）' };
    if (AI.usedToday() >= c.dailyLimit) return { ok: false, reason: '今日调用已达上限 ' + c.dailyLimit + ' 次' };
    return { ok: true };
  };

  /* ---------- 每日用量（只记次数，存本机）---------- */
  const LS_USE = 'family-xiuxian:ai-usage';
  const today = () => new Date(AI.env.now()).toISOString().slice(0, 10);
  AI.usedToday = () => { try { const u = JSON.parse((store() && store().getItem(LS_USE)) || '{}'); return u.day === today() ? u.n || 0 : 0; } catch (e) { return 0; } };
  const countUse = () => { try { store() && store().setItem(LS_USE, JSON.stringify({ day: today(), n: AI.usedToday() + 1 })); } catch (e) { /* 忽略 */ } };

  const setStatus = (kind, ok, reason) => {
    AI.status = { at: AI.env.now(), kind, ok, reason: reason || '' };
  };
  const KIND_NAME = { turn: '回合纪事润色', event: '事件文本变体', history: '家史润色', advice: '军师建议', test: '测试连接', agent: 'AI 家主决策' };
  AI.statusText = () => {
    const st = AI.status;
    if (!st) return '尚未调用';
    return `${KIND_NAME[st.kind] || st.kind}：${st.ok ? '成功' : '已回落模板（' + st.reason + '）'}`;
  };

  /* ---------- 底层调用 ---------- */
  // 只返回 { ok, text } 或 { ok:false, reason }；从不抛错，从不把 key 写进 reason
  AI.call = async (kind, messages, maxTokens, extra) => {
    const r = AI.ready();
    if (!r.ok) { setStatus(kind, false, r.reason); return { ok: false, reason: r.reason }; }
    const c = AI.config();
    AI.calls++;
    countUse();
    let timer = null;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    try {
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => { if (ctrl) ctrl.abort(); rej(new Error('timeout')); }, c.timeoutMs); });
      const req = AI.env.fetch(c.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getKey() },
        body: JSON.stringify(Object.assign({ model: c.model, messages, temperature: 0.7, max_tokens: maxTokens || 600, stream: false }, /reasoner/.test(c.model) ? {} : { thinking: { type: 'disabled' } }, extra || {})),
        signal: ctrl ? ctrl.signal : undefined,
      });
      const res = await Promise.race([req, timeout]);
      if (!res || !res.ok) {
        const HINT = { 400: '请求格式有误（400，检查模型名）', 401: 'key 不对或已删除（401）', 402: '账户余额不足（402）', 422: '参数有误（422，检查模型名）', 429: '请求太快被限流（429）', 500: 'DeepSeek 服务器出错（500）', 503: 'DeepSeek 服务器繁忙（503）' };
        const reason = res ? HINT[res.status] || 'HTTP ' + res.status : '无响应';
        setStatus(kind, false, reason);
        return { ok: false, reason };
      }
      const j = await Promise.race([res.json(), timeout]);
      const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!text || typeof text !== 'string') { setStatus(kind, false, '返回内容为空'); return { ok: false, reason: '返回内容为空' }; }
      setStatus(kind, true);
      return { ok: true, text: text.trim() };
    } catch (e) {
      const reason = e && (e.name === 'AbortError' || e.message === 'timeout') ? '超时（' + Math.ceil(c.timeoutMs / 1000) + ' 秒）' : '网络错误';
      setStatus(kind, false, reason);
      return { ok: false, reason };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  /* ---------- 防编造：输出校验 ---------- */
  const digits = (t) => (String(t).match(/\d+/g) || []);
  AI.knownNames = (s) => Object.values(s.people).map((p) => p.name).filter((n) => n && n.length >= 2);
  // 输出中的数字必须都出现在事实里；不得出现事实之外的本族人名
  AI.validate = (text, factsText, s, opts) => {
    opts = opts || {};
    const t = String(text || '').trim();
    if (!t) return '空文本';
    if (t.length > (opts.maxLen || 2000)) return '过长';
    const allowed = new Set(digits(factsText).concat(opts.allowNums || []));
    const bad = digits(t).filter((d) => !allowed.has(d) && !allowed.has(String(Number(d))));
    if (bad.length) return '出现事实外的数字：' + bad.slice(0, 3).join('、');
    if (s) {
      const outside = AI.knownNames(s).filter((n) => t.includes(n) && !factsText.includes(n));
      if (outside.length) return '出现事实外的人物：' + outside.slice(0, 3).join('、');
    }
    for (const n of opts.mustNames || []) if (!t.includes(n)) return '漏掉了人物 ' + n;
    return null;
  };
  // 去掉模型常见的 Markdown 痕迹
  const tidy = (t) => String(t).replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/^\s*[-*]\s+/gm, '· ').trim();

  const RULES = [
    '你只能使用用户给出的事实写作。',
    '严禁新增任何人物、事件、地名、法宝、功法、数字；严禁改变任何结果、因果与先后。',
    '年份与数字一律照抄阿拉伯数字，不要改写成汉字数字，不要估算。',
    '可以省略次要条目，可以调整语序、补充不含新信息的修饰。',
    '只输出正文纯文本，不要标题、不要 Markdown、不要解释你在做什么。',
  ].join('\n');

  /* ---------- 请求编排：异步、去重、缓存 ---------- */
  function request(key, kind, build) {
    if (AI.cache.has(key) || AI.pending.has(key)) return AI.pending.get(key) || Promise.resolve(AI.cache.get(key));
    const r = AI.ready();
    if (!r.ok) { setStatus(kind, false, r.reason); return Promise.resolve(null); }
    const job = build();
    if (!job) return Promise.resolve(null);
    const p = AI.call(kind, job.messages, job.maxTokens).then((res) => {
      AI.pending.delete(key);
      if (!res.ok) { AI.failed.set(key, res.reason); notify(); return null; }
      const text = tidy(res.text);
      const why = AI.validate(text, job.facts, job.state, job.check);
      if (why) { AI.failed.set(key, '校验未通过：' + why); setStatus(kind, false, '校验未通过：' + why); notify(); return null; }
      const v = { text, at: AI.env.now() };
      AI.cache.set(key, v);
      AI.failed.delete(key);
      notify();
      return v;
    });
    AI.pending.set(key, p);
    notify();
    return p;
  }
  function notify() { if (typeof AI.onUpdate === 'function') { try { AI.onUpdate(); } catch (e) { /* 界面刷新失败不影响游戏 */ } } }
  AI.get = (key) => (AI.cache.get(key) || {}).text || null;
  AI.isPending = (key) => AI.pending.has(key);
  AI.failure = (key) => AI.failed.get(key) || null;

  /* ---------- 事实摘要（只读状态）---------- */
  const H = () => FX.H;
  AI.turnFacts = (s, turn) => {
    const es = s.history.filter((e) => e.turn === turn && e.severity >= 2);
    const lines = es.map((e) => `第 ${e.year} 年：${H().text(e)}`);
    return lines.join('\n');
  };
  AI.turnKey = (s, turn) => `turn:${s.seed}:${turn}:${FX.U.hash(AI.turnFacts(s, turn))}`;
  AI.polishTurn = (s, turn) => {
    const facts = AI.turnFacts(s, turn);
    return request(AI.turnKey(s, turn), 'turn', () => {
      if (!facts) return null;
      const head = s.people[s.family.headId];
      return {
        facts, state: s, maxTokens: 700, check: { maxLen: 900 },
        messages: [
          { role: 'system', content: '你是修仙家族编年史的执笔人，文风古雅简练，近似史书纪事。\n' + RULES },
          { role: 'user', content: `${s.family.surname}氏家族，第 ${turn} 回合的纪事。${head ? '时任家主' + head.name + '。' : ''}请把下列事实写成 120 到 300 字的一段编年叙述：\n${facts}` },
        ],
      };
    });
  };

  AI.historyFacts = (s) => {
    const h = H().familyHistory(s);
    return h.chapters.map((c) => `【${c.title}】\n` + (c.nodes.length ? c.nodes.map((n) => `第 ${n.year} 年：${n.text}`).join('\n') : '（无记载）')).join('\n');
  };
  AI.historyKey = (s) => `history:${s.seed}:${FX.U.hash(AI.historyFacts(s))}`;
  AI.polishHistory = (s) => {
    const facts = AI.historyFacts(s);
    return request(AI.historyKey(s), 'history', () => ({
      facts, state: s, maxTokens: 1800, check: { maxLen: 3000 },
      messages: [
        { role: 'system', content: '你是修仙家族的史官，为家族撰写家史，文风近似古代史书列传。\n' + RULES + '\n按给出的章节顺序写，每章用【章名】开头另起一段；某章无记载就写“无记载”。' },
        { role: 'user', content: `请依据以下事实撰写《${s.family.surname}氏家史》，全文 400 到 1200 字：\n${facts}` },
      ],
    }));
  };

  AI.eventKey = (s, inst) => `event:${s.seed}:${inst.id}`;
  AI.polishEvent = (s, inst) => {
    const v = FX.Ev.view(s, inst);
    const names = v.people.map((id) => s.people[id] && s.people[id].name).filter(Boolean);
    return request(AI.eventKey(s, inst), 'event', () => ({
      facts: v.text, state: s, maxTokens: 300, check: { maxLen: Math.max(120, v.text.length * 2), mustNames: names },
      messages: [
        { role: 'system', content: '你为修仙家族游戏改写事件描述，让同一事件每次读来不同。\n' + RULES + '\n保留原文中的每个人名与数字，长度与原文相近，不要替玩家做选择，不要提及选项。' },
        { role: 'user', content: `事件「${v.name}」原文：${v.text}\n请换一种说法重写。` },
      ],
    }));
  };

  AI.adviceFacts = (s) => {
    const G2 = FX.Game, P = FX.P;
    const ov = G2.view.overview(s);
    const L = [];
    L.push(`第 ${ov.year} 年（第 ${ov.turn} 回合），${ov.surname}氏，出身${ov.origin}，族人 ${ov.population} 口（本家血脉 ${ov.natives}）。`);
    if (ov.ancestor) L.push(`老祖${ov.ancestor.name}，${ov.ancestor.realm}，剩余寿元 ${ov.ancestor.left} 年；可顶上的后继：${ov.successors.map((x) => x.name + '（' + x.realm + '）').join('、') || '无'}。`);
    if (ov.head) L.push(`家主${ov.head.name}，${ov.head.realm}，${ov.head.age} 岁，威望 ${ov.head.prestige}；嫡系支持度 ${Math.round(ov.branches.main.support)}，旁支支持度 ${Math.round(ov.branches.side.support)}；继承人${ov.heir ? ov.heir.name : '未指定'}。`);
    const r = ov.resources;
    L.push(`资源：灵石 ${Math.round(r.stone)}（每年净 ${Math.round(ov.forecast.netStone)}），灵谷 ${Math.round(r.grain)}（每年净 ${Math.round(ov.forecast.netGrain)}），灵药 ${Math.round(r.herb)}，聚气丹 ${r.qiju}，筑基丹 ${r.zhuji}。${ov.deficit ? '处于入不敷出状态。' : ''}`);
    const B = FX.CONFIG.buildings;
    L.push('建筑：' + Object.keys(B).map((k) => B[k].name + ' ' + (s.family.buildings[k] || 0) + ' 级').join('，') + '。');
    const rules = s.family.rules, R2 = FX.CONFIG.rules;
    L.push(`家规：${R2.succession[rules.succession].name}、${R2.allocation[rules.allocation].name}、${R2.foreign[rules.foreign].name}。锋芒 ${Math.round(ov.edge)}，护族战力 ${Math.round(ov.defense.total)}。`);
    const gates = P.living(s).map((p) => ({ p, b: G2.breakthroughPreview(s, p.id) })).filter((x) => x.b && x.b.kind && x.b.can.ok).slice(0, 4);
    if (gates.length) L.push('可冲关者：' + gates.map((x) => `${x.p.name}冲击${x.b.target}成功率 ${x.b.chance}%`).join('，') + '。');
    const near = P.living(s).filter((p) => p.realm.major === 1 && p.realm.stage >= 8).map((p) => p.name + P.realmName(p));
    if (near.length) L.push('接近筑基：' + near.slice(0, 5).join('、') + '。');
    if (s.pending.length) L.push('待决事件：' + s.pending.map((i) => FX.Ev.def(i.defId).name).join('、') + '。');
    if (ov.attention) L.push(`有 ${ov.attention} 人差事待安排。`);
    if (ov.requests) L.push(`有 ${ov.requests} 条族人请求未处理。`);
    return L.join('\n');
  };
  AI.adviceKey = (s) => `advice:${s.seed}:${FX.U.hash(AI.adviceFacts(s))}`;
  AI.advise = (s) => {
    const facts = AI.adviceFacts(s);
    return request(AI.adviceKey(s), 'advice', () => ({
      facts, state: s, maxTokens: 700, check: { maxLen: 1200, allowNums: ['1', '2', '3', '4', '5'] },
      messages: [
        { role: 'system', content: '你是修仙家族的军师，向家主进言。\n' + RULES + '\n给出 3 到 5 条具体可执行的建议，每条一行，以“· ”开头，说明理由；只能依据给出的数据，不要承诺任何结果的成败。' },
        { role: 'user', content: `家族现状：\n${facts}\n请进言。` },
      ],
    }));
  };

  AI.testConnection = async () => {
    const r = await AI.call('test', [{ role: 'user', content: '请只回复：通' }], 5);
    notify();
    return r;
  };

  FX.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
