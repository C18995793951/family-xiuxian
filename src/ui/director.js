/* ============================================================
 * director（界面一侧）—— 导演模式的节奏：开始、暂停、接管、调速，问不问 AI
 * 决策与校验都在核心 FX.Dir；这里只管什么时候走下一步、要不要等 AI。
 *  - 每一步都通过公开接口执行，规则照常结算；AI 没开、没接上、回来的东西不合规，就按本地策略走这一步；
 *  - AI 频率：「要紧时」只在关口、遇事、听到传闻、到了新地方、隔了些年时问；「每一步」步步都问；「不用」全走本地；
 *  - 连着出岔子（行动走不通）就自己停下，等玩家接管。
 * 这个文件不碰 DOM，可在 Node 里注入 FX.AI.env 做测试。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});

  const LS = 'family-xiuxian:director';
  const Director = {
    running: false,
    busy: false,
    s: null,
    speed: 'mid',
    aiMode: 'key', // key 要紧时 / every 每一步 / off 不用
    everyYears: 8,
    status: '',
    lastAI: '', // 最近一次 AI 的结果（给界面看）
    fails: 0,
    onStep: null, // 走完一步通知界面
    onStop: null,
    timer: null,
    env: { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t), now: () => Date.now() },
  };
  // 每步之间停多久（毫秒）；极速时一口气走若干步再刷新
  Director.SPEEDS = { slow: { name: '慢', ms: 2600 }, mid: { name: '中', ms: 1000 }, fast: { name: '快', ms: 250 }, max: { name: '极速', ms: 0 } };
  Director.MODES = { key: '要紧时问', every: '每步都问', off: '不用 AI' };

  try {
    const c = JSON.parse((G.localStorage && G.localStorage.getItem(LS)) || '{}') || {};
    if (Director.SPEEDS[c.speed]) Director.speed = c.speed;
    if (Director.MODES[c.aiMode]) Director.aiMode = c.aiMode;
  } catch (e) { /* 忽略 */ }
  const remember = () => { try { G.localStorage && G.localStorage.setItem(LS, JSON.stringify({ speed: Director.speed, aiMode: Director.aiMode })); } catch (e) { /* 忽略 */ } };
  Director.setSpeed = (k) => { if (Director.SPEEDS[k]) { Director.speed = k; remember(); } };
  Director.setMode = (k) => { if (Director.MODES[k]) { Director.aiMode = k; remember(); } };

  const aiReady = () => !!(FX.AI && FX.AI.config().enabled && FX.AI.ready().ok);
  Director.aiState = () => {
    if (Director.aiMode === 'off') return '不用 AI，按本心走本地策略';
    if (!FX.AI) return '没有 AI 模块，按本地策略';
    const r = FX.AI.config().enabled ? FX.AI.ready() : { ok: false, reason: '没有开启 AI' };
    return r.ok ? 'AI 已接上（' + { key: '只在关口、遇事、熟人有事、到新地方时问它', every: '每一步都问它' }[Director.aiMode] + '）' : 'AI 没接上（' + r.reason + '），按本地策略';
  };

  const notify = () => { if (typeof Director.onStep === 'function') { try { Director.onStep(); } catch (e) { /* 界面刷新失败不影响导演 */ } } };

  // 问一次 AI：返回 choice 或 null（并记下原因）
  async function askAI(s, isEvent) {
    const job = isEvent ? FX.Dir.eventJob(s) : FX.Dir.job(s);
    if (!job) return null;
    const res = await FX.AI.call('director', job.messages, job.maxTokens, Math.min(15000, FX.AI.config().timeoutMs));
    if (!res.ok) { Director.lastAI = 'AI 没接上（' + res.reason + '），这一步按本心走'; return null; }
    if (Director.s !== s) return null;
    const v = isEvent ? FX.Dir.parseEvent(s, job, res.text) : FX.Dir.parse(s, job, res.text);
    if (!v.ok) { Director.lastAI = 'AI 的打算不合规（' + v.why + '），这一步按本心走'; if (FX.AI.rejects) { FX.AI.rejects.unshift({ at: Date.now(), kind: 'director', why: v.why, text: String(res.text).slice(0, 400) }); FX.AI.rejects.length = Math.min(FX.AI.rejects.length, 20); } return null; }
    Director.lastAI = 'AI 拿了主意';
    return v.choice;
  }

  // 走一步（事件或行动）；返回结果
  Director.step = async (s) => {
    if (s.ended) return { ok: false, error: '这一生已经结束' };
    const isEvent = s.pending.length > 0;
    const D = FX.Dir;
    let choice = null;
    const why = Director.aiMode === 'every' ? '每一步' : Director.aiMode === 'key' ? D.moment(s, Director.everyYears) : '';
    if (why && aiReady()) {
      if (!isEvent) D.asked(s);
      Director.status = (isEvent ? '眼前有事，' : why + '，') + '思量中…';
      notify();
      choice = await askAI(s, isEvent);
      if (Director.s !== s) return { ok: false, error: '换了一局' };
      // 等 AI 的工夫里玩家可能接管了：那就不做了
      if (!Director.running && !Director.single) return { ok: false, error: '已暂停' };
    }
    Director.status = '';
    if (isEvent) return D.choose(s, choice || D.eventLocal(s));
    if (!choice) return D.stepLocal(s);
    const r = D.exec(s, choice);
    if (!r.ok) return D.stepLocal(s); // AI 的打算第一步就走不通：照本心走
    return r;
  };

  function loop() {
    Director.timer = null;
    const s = Director.s;
    if (!Director.running || !s) return;
    if (s.ended) { Director.stop('这一生已经结束'); return; }
    if (Director.busy) return;
    Director.busy = true;
    const sp = Director.SPEEDS[Director.speed];
    const t0 = Director.env.now();
    (async () => {
      let n = 0;
      // 极速：一口气走到 150 毫秒或要问 AI 为止
      do {
        let r;
        try { r = await Director.step(s); } catch (e) { r = { ok: false, error: '出错了：' + (e && e.message) }; }
        n++;
        if (r && r.ok === false && !/已暂停|换了一局/.test(r.error || '')) Director.fails++; else Director.fails = 0;
        if (Director.fails >= 6) { Director.stop('连着几步走不通（' + (r && r.error) + '），先停下，你来接管'); break; }
        if (sp.ms > 0 || !Director.running || s.ended) break;
        if (Director.aiMode !== 'off' && aiReady() && (Director.aiMode === 'every' || FX.Dir.moment(s, Director.everyYears))) break;
      } while (Director.env.now() - t0 < 150 && n < 40);
      Director.busy = false;
      notify();
      if (s.ended) { Director.stop('这一生已经结束'); return; }
      if (Director.running) Director.timer = Director.env.setTimeout(loop, sp.ms || 16);
    })();
  }

  Director.start = (s) => {
    if (!s || s.ended) return false;
    FX.Dir.state(s);
    Director.s = s;
    Director.running = true;
    Director.fails = 0;
    Director.status = '';
    if (!Director.busy && !Director.timer) loop();
    notify();
    return true;
  };
  Director.stop = (why) => {
    Director.running = false;
    if (Director.timer) { Director.env.clearTimeout(Director.timer); Director.timer = null; }
    Director.status = why || '';
    if (typeof Director.onStop === 'function') { try { Director.onStop(why); } catch (e) { /* 忽略 */ } }
    notify();
  };
  // 只走一步（暂停时手动推一下）
  Director.once = async (s) => {
    if (Director.busy || !s || s.ended) return null;
    Director.s = s;
    Director.busy = true; Director.single = true;
    let r;
    try { r = await Director.step(s); } finally { Director.busy = false; Director.single = false; }
    notify();
    return r;
  };
  // 换局、读档时：停下，丢掉旧局
  Director.reset = () => { Director.stop(''); Director.s = null; Director.lastAI = ''; };

  FX.Director = Director;
})(typeof globalThis !== 'undefined' ? globalThis : this);
