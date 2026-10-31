/* ============================================================
 * ai —— 接 DeepSeek（界面一侧，只管网络）
 * AI 只出提案、只写文字；校验、记录在核心的 propose.js，规则从不等它：
 *  - 默认关闭。未开启、没填 key、断网、超时、超过当日上限、回来的东西不合格，一律回落模板文字。
 *  - key 只存在本机浏览器的 localStorage，只随请求发往设置里的接口地址；不进存档、不进导出、不进日志。
 *  - 通过校验的文字由核心记进存档（s.aiLog），读档后直接显示，不重新调用；失败不自动重试，免得重复扣费。
 * 这个文件不碰 DOM，可在 Node 里注入 fetch / storage 做测试。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});

  const LS_CFG = 'family-xiuxian:ai';
  const LS_KEY = 'family-xiuxian:ai-key';
  const LS_USE = 'family-xiuxian:ai-usage';

  const AI = {
    defaults: {
      enabled: false,
      // 沿用家族版和“AI 朋友”实测可用的配置：deepseek-flash、官方 chat/completions、关闭思考
      model: 'deepseek-flash',
      endpoint: 'https://api.deepseek.com/chat/completions',
      timeoutMs: 20000,
      dailyLimit: 200, // 本机每天最多调用次数，防止误刷
      narrate: true, // 行动后写一段叙述
      eventText: true, // 眼前的事换个说法
      hooks: true, // 找上门的事由 AI 写提案（标题、开场、选项）
    },
    models: ['deepseek-flash', 'deepseek-chat', 'deepseek-reasoner'],
    // 可注入：测试时替换为假实现
    env: {
      fetch: typeof G.fetch === 'function' ? (...a) => G.fetch(...a) : null,
      storage: (() => { try { return G.localStorage || null; } catch (e) { return null; } })(),
      now: () => Date.now(),
    },
    pending: new Map(), // key -> Promise
    failed: new Map(), // key -> 原因（本页内不再自动重试）
    rejects: [], // 最近被拒的回复，设置页可看（只在本页内存里）
    status: null, // 最近一次调用：{ at, kind, ok, reason }
    onUpdate: null, // 有结果回来时通知界面
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
    const clean = {
      enabled: !!c.enabled,
      model: String(c.model || AI.defaults.model).trim().slice(0, 64),
      endpoint: String(c.endpoint || AI.defaults.endpoint).trim().slice(0, 300),
      timeoutMs: Math.max(3000, Math.min(120000, Number(c.timeoutMs) || AI.defaults.timeoutMs)),
      dailyLimit: Math.max(1, Math.min(5000, Math.floor(Number(c.dailyLimit) || AI.defaults.dailyLimit))),
      narrate: c.narrate !== false,
      eventText: c.eventText !== false,
      hooks: c.hooks !== false,
    };
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
    if (!c.enabled) return { ok: false, reason: '没有开启 AI' };
    if (!AI.hasKey()) return { ok: false, reason: '没有填 key' };
    if (!AI.env.fetch) return { ok: false, reason: '这个浏览器发不了网络请求' };
    if (!AI.validEndpoint(c.endpoint)) return { ok: false, reason: '接口地址无效（要 https）' };
    if (AI.usedToday().n >= c.dailyLimit) return { ok: false, reason: '今天的调用已到上限 ' + c.dailyLimit + ' 次' };
    return { ok: true };
  };
  AI.on = (what) => { const c = AI.config(); return c.enabled && c[what] !== false; };

  /* ---------- 每日用量（只记次数和 token，存本机）---------- */
  const today = () => new Date(AI.env.now()).toISOString().slice(0, 10);
  AI.usedToday = () => {
    try { const u = JSON.parse((store() && store().getItem(LS_USE)) || '{}'); return u.day === today() ? { n: u.n || 0, tokens: u.tokens || 0 } : { n: 0, tokens: 0 }; } catch (e) { return { n: 0, tokens: 0 }; }
  };
  const countUse = (tokens) => {
    const u = AI.usedToday();
    try { store() && store().setItem(LS_USE, JSON.stringify({ day: today(), n: u.n + (tokens === undefined ? 1 : 0), tokens: u.tokens + (tokens || 0) })); } catch (e) { /* 忽略 */ }
  };

  const setStatus = (kind, ok, reason) => { AI.status = { at: AI.env.now(), kind, ok, reason: reason || '' }; };
  const KIND_NAME = { narrate: '纪事叙述', event: '事件改写', life: '小传', test: '测试连接', intent: '理解自由输入', hook: '找上门的事' };
  AI.statusText = () => {
    const st = AI.status;
    if (!st) return '还没调用过';
    return (KIND_NAME[st.kind] || st.kind) + '：' + (st.ok ? '成功' : '用了模板（' + st.reason + '）');
  };

  /* ---------- 底层调用 ---------- */
  // 只返回 { ok, text } 或 { ok:false, reason }；从不抛错，从不把 key 写进 reason
  AI.call = async (kind, messages, maxTokens, timeoutMs) => {
    const r = AI.ready();
    if (!r.ok) { setStatus(kind, false, r.reason); return { ok: false, reason: r.reason }; }
    const c = AI.config();
    AI.calls++;
    countUse();
    let timer = null;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    try {
      const ms = timeoutMs || c.timeoutMs;
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => { if (ctrl) ctrl.abort(); rej(new Error('timeout')); }, ms); });
      const req = AI.env.fetch(c.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getKey() },
        body: JSON.stringify(Object.assign({ model: c.model, messages, temperature: 0.7, max_tokens: maxTokens || 600, stream: false }, /reasoner/.test(c.model) ? {} : { thinking: { type: 'disabled' } })),
        signal: ctrl ? ctrl.signal : undefined,
      });
      const res = await Promise.race([req, timeout]);
      if (!res || !res.ok) {
        const HINT = { 400: '请求格式有误（400，检查模型名）', 401: 'key 不对或已删除（401）', 402: '账户余额不足（402）', 422: '参数有误（422，检查模型名）', 429: '请求太快被限流（429）', 500: 'DeepSeek 服务器出错（500）', 503: 'DeepSeek 服务器繁忙（503）' };
        const reason = res ? HINT[res.status] || 'HTTP ' + res.status : '没有回应';
        setStatus(kind, false, reason);
        return { ok: false, reason };
      }
      const j = await Promise.race([res.json(), timeout]);
      const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (j && j.usage && j.usage.total_tokens) countUse(Number(j.usage.total_tokens) || 0);
      if (!text || typeof text !== 'string') { setStatus(kind, false, '回来的内容是空的'); return { ok: false, reason: '回来的内容是空的' }; }
      setStatus(kind, true);
      return { ok: true, text: text.trim() };
    } catch (e) {
      const reason = e && (e.name === 'AbortError' || e.message === 'timeout') ? '超时（' + Math.ceil((timeoutMs || c.timeoutMs) / 1000) + ' 秒）' : '网络错误';
      setStatus(kind, false, reason);
      return { ok: false, reason };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  /* ---------- 请求编排：异步、去重；结果交核心校验并记进存档 ---------- */
  // 通知界面放到下一轮：请求常在渲染当中发起，不能在渲染里再套一次渲染；连着几次只通知一回
  let notifying = false;
  function notify() {
    if (typeof AI.onUpdate !== 'function' || notifying) return;
    notifying = true;
    setTimeout(() => { notifying = false; try { AI.onUpdate(); } catch (e) { /* 界面刷新失败不影响游戏 */ } }, 0);
  }
  const reject = (kind, why, text) => {
    AI.rejects.unshift({ at: AI.env.now(), kind, why, text: String(text || '').slice(0, 400) });
    AI.rejects.length = Math.min(AI.rejects.length, 20);
  };
  // job 由核心打包（Game.ai.job）：key、事实、提示词、校验要求
  function request(s, job) {
    if (!job) return Promise.resolve(null);
    const have = FX.Game.ai.text(s, job.key);
    if (have) return Promise.resolve(have);
    if (AI.pending.has(job.key)) return AI.pending.get(job.key);
    if (AI.failed.has(job.key)) return Promise.resolve(null);
    const r = AI.ready();
    if (!r.ok) { setStatus(job.kind, false, r.reason); return Promise.resolve(null); }
    const p = AI.call(job.kind, job.messages, job.maxTokens).then((res) => {
      AI.pending.delete(job.key);
      if (!res.ok) { AI.failed.set(job.key, res.reason); notify(); return null; }
      const a = FX.Game.ai.accept(s, job, res.text);
      if (!a.ok) {
        AI.failed.set(job.key, '校验没过：' + a.why);
        setStatus(job.kind, false, '校验没过：' + a.why);
        reject(job.kind, a.why, a.text);
        notify();
        return null;
      }
      notify();
      return a.text;
    });
    AI.pending.set(job.key, p);
    notify();
    return p;
  }
  AI.isPending = (key) => AI.pending.has(key);
  AI.failure = (key) => AI.failed.get(key) || null;

  /* ---------- 入口 ---------- */
  // 一次行动以后：把这次亲历的要紧事写成一段叙述（mark 是行动前的纪事位置）
  AI.narrate = (s, mark) => (AI.on('narrate') ? request(s, FX.Game.ai.job(s, 'narrate', mark)) : Promise.resolve(null));
  // 眼前的事：换个说法
  AI.eventText = (s, inst) => (AI.on('eventText') ? request(s, FX.Game.ai.job(s, 'event', inst)) : Promise.resolve(null));
  AI.eventKey = (inst) => 'e:' + inst.id;
  // 生平：写一篇小传（玩家点了才写）
  AI.life = (s) => (AI.config().enabled ? request(s, FX.Game.ai.job(s, 'life')) : Promise.resolve(null));
  AI.lifeKey = (s) => { const j = FX.Game.ai.job(s, 'life'); return j ? j.key : null; };

  // 自由输入：理解玩家的一句话。玩家在等，至多等 8 秒；不行就交给关键词匹配
  // 返回 { ok:true, plan } | { ok:true, ask } | { ok:true, cannot } | { ok:false, reason }
  AI.intentTimeoutMs = 8000;
  AI.intent = async (s, text) => {
    const r = AI.ready();
    if (!r.ok) return { ok: false, reason: r.reason };
    const job = FX.Game.intent.job(s, text);
    const res = await AI.call('intent', job.messages, job.maxTokens, Math.min(AI.intentTimeoutMs, AI.config().timeoutMs));
    if (!res.ok) { notify(); return { ok: false, reason: res.reason }; }
    const v = FX.Game.intent.parse(s, job, res.text);
    if (!v.ok) { setStatus('intent', false, '校验没过：' + v.why); reject('intent', v.why, res.text); notify(); return { ok: false, reason: 'AI 的理解不合规（' + v.why + '）' }; }
    notify();
    if (v.ask) return { ok: true, ask: v.ask };
    if (v.cannot) return { ok: true, cannot: v.cannot };
    return { ok: true, plan: { say: v.say, steps: v.steps, via: 'ai', input: job.input } };
  };

  // 世事：排进队里的钩子，在后台请 AI 写提案；到它找上门时没写好就用模板（不等）
  AI.hookPrefetch = (s) => {
    if (!AI.on('hooks') || !AI.ready().ok || !FX.Hook) return [];
    const out = [];
    for (const job of FX.Hook.pendingJobs(s)) {
      if (AI.pending.has(job.key) || AI.failed.has(job.key)) continue;
      const p = AI.call('hook', job.messages, job.maxTokens).then((res) => {
        AI.pending.delete(job.key);
        if (!res.ok) { AI.failed.set(job.key, res.reason); notify(); return null; }
        const a = FX.Hook.accept(s, job, res.text);
        if (!a.ok) { AI.failed.set(job.key, '校验没过：' + a.why); setStatus('hook', false, '校验没过：' + a.why); reject('hook', a.why, res.text); notify(); return null; }
        notify();
        return a.text;
      });
      AI.pending.set(job.key, p);
      out.push(p);
    }
    return out;
  };

  AI.testConnection = async () => {
    return AI.call('test', [{ role: 'user', content: '请只回复：通' }], 5);
  };

  FX.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
