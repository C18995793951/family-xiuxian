#!/usr/bin/env node
// AI 底座测试：在 Node 里加载核心 + src/ui/ai.js，注入假 fetch / storage，不发任何真实网络请求。
// 覆盖：默认关闭零请求、没 key / 超限回落、失败与超时回落、编造被拒、提案规格校验、
//       记进存档读档不重调、AI 开不开规则状态一样、key 不外泄、请求格式。
// 用法：node test/ai-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');

const FX = loadCore();
require(path.join(__dirname, '..', 'src', 'ui', 'ai.js'));
const AI = FX.AI, Game = FX.Game, P = FX.P, Prop = FX.Prop;
const KEY = 'sk-TEST-0123456789abcdef-SECRET';

const results = [];
const assert = (c, m) => { if (!c) throw new Error(m); };
async function check(no, name, fn) {
  try {
    const detail = await fn();
    results.push({ no, name, ok: true, detail });
    console.log(`✓ ${no} ${name}${detail ? '：' + detail : ''}`);
  } catch (e) {
    results.push({ no, name, ok: false, detail: e.message });
    console.log(`✗ ${no} ${name}：${e.message}`);
    if (process.env.DEBUG) console.log(e.stack);
  }
}

/* ---------- 假环境 ---------- */
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), dump: () => [...m.entries()] };
}
// 回声模型：只从用户消息里抄事实，保证不编造
function echoReply(body) {
  const user = body.messages[body.messages.length - 1].content;
  if (/请只回复/.test(user)) return '通';
  if (/原文：/.test(user)) return user.split('原文：')[1].split('\n')[0];
  const lines = user.split('\n').slice(1).filter(Boolean);
  let out = '';
  for (const l of lines) { if ((out + l).length > 300) break; out += (out ? '\n' : '') + l; }
  return out || lines[0].slice(0, 0) || '无事。';
}
// mode：ok 回声；fab 前缀 = 在回声后面加一句编造；数字 = HTTP 状态；never 不回；reject 断网；empty 空
function mockFetch(mode, log, extra) {
  return (url, init) => {
    const body = JSON.parse(init.body);
    log.push({ url, init, body });
    if (mode === 'never') return new Promise(() => {});
    if (mode === 'reject') return Promise.reject(new TypeError('Failed to fetch'));
    if (typeof mode === 'number') return Promise.resolve({ ok: false, status: mode, json: async () => ({}) });
    let content = mode === 'empty' ? '' : echoReply(body);
    if (mode === 'fab') content += extra;
    if (mode === 'drop') content = '有人拦在路上。';
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 321 } }) });
  };
}
const LS_CFG = 'family-xiuxian:ai';
function setup({ enabled = true, key = KEY, mode = 'ok', extra = '', cfg = {} } = {}) {
  const log = [];
  const storage = memStorage();
  AI.env = { fetch: mockFetch(mode, log, extra), storage, now: () => 1767225600000 };
  AI.pending.clear(); AI.failed.clear(); AI.rejects.length = 0; AI.status = null;
  storage.setItem(LS_CFG, JSON.stringify(Object.assign({}, AI.defaults, { enabled }, cfg)));
  if (key) AI.setKey(key);
  return { log, storage };
}

/* ---------- 走一局：每步记下行动前的纪事位置 ---------- */
function step(s) {
  while (s.pending.length && !s.ended) { const v = Game.pendingEvents(s)[0]; Game.choose(s, v.id, (v.options.find((o) => o.id === 'flee' && o.available) || v.options.find((o) => o.available)).id); }
  if (s.ended) return null;
  const A = Game.actions(s);
  const mark = Game.ai.mark(s);
  const a = A.find((x) => x.type === 'breakthrough' && x.ok && !x.path) || A.find((x) => x.type === 'cultivate' && x.until && x.ok) || A.find((x) => x.type === 'cultivate' && x.days === 360 && !x.coin);
  Game.act(s, a);
  return mark;
}
// 走到有一批“要紧事”可写为止
function untilBatch(s) {
  for (let i = 0; i < 200; i++) { const m = step(s); if (m && Game.ai.job(s, 'narrate', m)) return m; }
  throw new Error('走了 200 步也没有可写的事');
}
const freshGame = (seed, origin) => Game.newGame({ origin: origin || 'loose', seed });

(async () => {
  await check('A1', '默认关闭：零请求，存档里没有 AI 记录', async () => {
    const { log, storage } = setup({ enabled: false });
    storage.removeItem(LS_CFG); // 真正的默认配置
    assert(AI.config().enabled === false, '默认应关闭');
    const s = freshGame('a1');
    for (let i = 0; i < 40 && !s.ended; i++) {
      const m = step(s);
      if (m) await AI.narrate(s, m);
      if (s.pending[0]) await AI.eventText(s, s.pending[0]);
    }
    await AI.life(s);
    assert(log.length === 0, '发出了 ' + log.length + ' 个请求');
    assert(s.aiLog.length === 0, 'aiLog 不该有东西');
    return '走了 40 步、各入口都调过，0 个请求';
  });

  await check('A2', '开了但没 key、超过当日上限、接口不是 https：都回落，零请求', async () => {
    const out = [];
    let { log } = setup({ key: '' });
    let s = freshGame('a2');
    let m = untilBatch(s);
    assert((await AI.narrate(s, m)) === null && log.length === 0, '没 key 时发了请求');
    assert(/key/.test(AI.status.reason), '回落原因应提到 key：' + AI.status.reason);
    out.push(AI.status.reason);
    ({ log } = setup({ cfg: { dailyLimit: 1 } }));
    AI.env.storage.setItem('family-xiuxian:ai-usage', JSON.stringify({ day: new Date(AI.env.now()).toISOString().slice(0, 10), n: 1 }));
    assert((await AI.narrate(s, m)) === null && log.length === 0, '超限时发了请求');
    out.push(AI.status.reason);
    ({ log } = setup({ cfg: { endpoint: 'http://example.com/v1/chat' } }));
    assert((await AI.narrate(s, m)) === null && log.length === 0, 'http 接口发了请求');
    out.push(AI.status.reason);
    return out.join('；');
  });

  await check('A3', '正常：叙述通过校验记进存档，读档后还在、不重新调用；规则状态不变', async () => {
    const { log } = setup();
    const s = freshGame('a3');
    const m = untilBatch(s);
    const before = Game.save.ruleHash(s);
    const text = await AI.narrate(s, m);
    assert(text, '没写成：' + (AI.status && AI.status.reason));
    assert(log.length === 1, '应只发 1 个请求，发了 ' + log.length);
    const rec = s.aiLog.find((r) => r.kind === 'narrate');
    assert(rec && rec.hid && rec.out === text, 'aiLog 里没有这段叙述');
    assert(Game.ai.narrations(s)[rec.hid] === text, '叙述没挂到纪事上');
    assert(Game.save.ruleHash(s) === before, '写叙述改动了规则状态');
    const r = Game.save.deserialize(Game.save.serialize(s, 1));
    assert(r.ok, '读档失败：' + r.error);
    AI.pending.clear(); AI.failed.clear();
    const again = await AI.narrate(r.state, m);
    assert(again === text && log.length === 1, '读档后又调用了');
    assert(AI.usedToday().n === 1 && AI.usedToday().tokens === 321, '用量没记对');
    return '1 次请求，读档后 0 次；“' + text.slice(0, 24) + '…”';
  });

  await check('A4', '编造的一律被拒：事实外的数字、汉字数量、人名、地名、物名、功法名', async () => {
    const s0 = freshGame('a4');
    const m0 = untilBatch(s0);
    const facts = Game.ai.job(s0, 'narrate', m0).facts;
    const stranger = Object.values(s0.people).find((p) => p.name.length >= 2 && !facts.includes(p.name)).name;
    const place = Object.values(s0.places).find((p) => !facts.includes(p.name)).name;
    const item = '大洞精玉', tech = '太上元神真解';
    const cases = [['数字', '他苦修了 99999 年。'], ['汉字数量', '此后苦修七十二年。'], ['人名', '途中遇见' + stranger + '。'], ['地名', '随后去了' + place + '。'], ['物名', '还得了一枚' + item + '。'], ['功法', '又悟得《' + tech + '》。']];
    const why = [];
    for (const [label, extra] of cases) {
      const s = JSON.parse(JSON.stringify(s0));
      const { log } = setup({ mode: 'fab', extra });
      const r = await AI.narrate(s, m0);
      assert(log.length === 1, label + '：没有发请求');
      assert(r === null, label + '：编造的叙述被收下了');
      assert(!s.aiLog.length, label + '：编造的叙述进了存档');
      assert(AI.rejects.length === 1 && /事实以外/.test(AI.rejects[0].why), label + '：没进被拒列表 ' + JSON.stringify(AI.rejects));
      assert(/校验没过/.test(AI.status.reason), label + '：状态没写校验没过');
      why.push(label + '→' + AI.rejects[0].why);
      // 同一段不自动重试
      await AI.narrate(s, m0);
      assert(log.length === 1, label + '：被拒后又重试了');
    }
    // 眼前的事：漏掉当事人也不收
    const s = freshGame('a4e');
    const robber = Object.values(s.people).find((p) => p.id !== s.player.id && P.alive(p));
    FX.Ev.spawn(s, 'ROBBER', { foe: robber.id, place: P.player(s).locationId }, []);
    if (!s.pending.length) throw new Error('造不出眼前的事');
    setup({ mode: 'drop' });
    const r = await AI.eventText(s, s.pending[0]);
    assert(r === null && /漏掉/.test(AI.rejects[0].why), '漏掉人名的改写被收下了：' + JSON.stringify(AI.rejects[0]));
    why.push('事件漏人→' + AI.rejects[0].why);
    return why.join('；');
  });

  await check('A5', '失败与超时：401/402/429/500、断网、空回复、超时都回落，不抛错，不重试', async () => {
    const out = [];
    for (const mode of [401, 402, 429, 500, 'reject', 'empty', 'never']) {
      const { log } = setup({ mode, cfg: { timeoutMs: 60 } });
      const s = freshGame('a5');
      const m = untilBatch(s);
      const r = await AI.narrate(s, m);
      assert(r === null, mode + '：应回落');
      assert(!s.aiLog.length, mode + '：失败的进了存档');
      assert(AI.failure('n:' + Game.ai.job(s, 'narrate', m).extra.hid), mode + '：没记下失败');
      await AI.narrate(s, m);
      assert(log.length === 1, mode + '：失败后又重试了');
      out.push(mode + ' ' + AI.status.reason);
    }
    return out.join('；');
  });

  await check('A6', '提案规格校验：名字换成 id；死人、没有的地方物品、多出字段、数字、超长、带数字的文字都拒', async () => {
    const s = freshGame('a6');
    const living = Object.values(s.people).filter((p) => P.alive(p) && p.id !== s.player.id);
    const dead = living[1];
    P.kill(s, dead, '测试', [], {});
    const nameUnique = living.find((p) => p !== dead && Object.values(s.people).filter((q) => q.name === p.name).length === 1);
    const pl = Object.values(s.places)[0];
    const SPEC = {
      verb: { type: 'enum', values: ['交谈', '打听', '交易'], required: true },
      target: { type: 'person' },
      place: { type: 'place' },
      item: { type: 'item' },
      say: { type: 'text', maxLen: 30 },
      steps: { type: 'list', max: 3, of: { type: 'object', fields: { verb: { type: 'enum', values: ['赶路', '拜访'], required: true }, to: { type: 'place' } } } },
    };
    const raw = '好的，下面是提案：\n```json\n' + JSON.stringify({ verb: '交谈', target: nameUnique.name, place: pl.name, item: '丹母砂', say: '请教修行', steps: [{ verb: '赶路', to: pl.id }] }) + '\n```\n以上。';
    const pj = Prop.parseJSON(raw);
    assert(pj.ok, 'JSON 取不出来：' + pj.error);
    const good = Prop.checkSpec(s, SPEC, pj.value);
    assert(good.ok, '合法提案被拒：' + (good.errors || []).join('；'));
    assert(good.value.target === nameUnique.id && good.value.place === pl.id && good.value.item === 'danmusha', '名字没换成 id：' + JSON.stringify(good.value));
    const bad = [
      [{ verb: '交谈', target: dead.id }, '在世'],
      [{ verb: '交谈', target: '查无此人' }, '找不到'],
      [{ verb: '交谈', place: '蓬莱仙岛' }, '没有这个地方'],
      [{ verb: '交易', item: '九转金丹' }, '没有这样东西'],
      [{ verb: '交谈', gain: '100 符钱' }, '多出字段'],
      [{ verb: '交谈', say: 300 }, '数字'],
      [{ verb: '交谈', say: '给我 500 符钱' }, '带了数字'],
      [{ verb: '交谈', say: '很长'.repeat(40) }, '过长'],
      [{ verb: '飞升' }, '只能是'],
      [{ target: nameUnique.id }, '缺少 verb'],
      [{ verb: '交谈', steps: [{ verb: '赶路' }, { verb: '赶路' }, { verb: '赶路' }, { verb: '赶路' }] }, '超过'],
      [{ verb: '交谈', steps: [{ verb: '赶路', to: '天外' }] }, '没有这个地方'],
    ];
    for (const [obj, want] of bad) {
      const r = Prop.checkSpec(s, SPEC, obj);
      assert(!r.ok && r.errors.join('；').includes(want), JSON.stringify(obj) + ' 应因“' + want + '”被拒，实际：' + (r.ok ? '通过' : r.errors.join('；')));
    }
    assert(!Prop.parseJSON('没有 JSON').ok && !Prop.parseJSON('{坏的}').ok && !Prop.parseJSON('[1,2]').ok, '坏 JSON 没被拒');
    return '1 份合法提案通过（名字换成 id），' + bad.length + ' 份不合格的全拒，坏 JSON 全拒';
  });

  await check('A7', 'AI 开不开，同种子同选择规则状态完全一样（叙述只是显示）', async () => {
    const run = async (on) => {
      setup({ enabled: on });
      const s = freshGame('a7', 'sect');
      let n = 0;
      for (let i = 0; i < 60 && !s.ended; i++) { const m = step(s); if (m && (await AI.narrate(s, m))) n++; }
      return { s, n };
    };
    const off = await run(false), on = await run(true);
    assert(on.n > 0, '开了 AI 却一段也没写');
    assert(Game.save.ruleHash(off.s) === Game.save.ruleHash(on.s), '开 AI 改变了规则状态');
    assert(Game.save.hash(off.s) !== Game.save.hash(on.s), '叙述没进存档');
    return '60 步，写了 ' + on.n + ' 段叙述，规则状态摘要一致';
  });

  await check('A8', 'key 不外泄：只在请求头里，不进请求体、存档、导出、状态、被拒列表', async () => {
    const { log, storage } = setup({ mode: 'fab', extra: '他苦修了 99999 年。' });
    const s = freshGame('a8');
    const m = untilBatch(s);
    await AI.narrate(s, m);
    setup({ mode: 401 });
    const m2 = untilBatch(s);
    await AI.narrate(s, m2);
    const { log: log3, storage: st3 } = setup();
    const m3 = untilBatch(s);
    await AI.narrate(s, m3);
    const req = log3[0] || log[0];
    assert(req.init.headers.Authorization === 'Bearer ' + KEY, '请求头里没有 key');
    assert(!req.init.body.includes(KEY), '请求体里有 key');
    const save = Game.save.serialize(s, 1);
    assert(!save.includes(KEY), '存档里有 key');
    assert(!JSON.stringify(AI.status).includes(KEY) && !JSON.stringify(AI.rejects).includes(KEY), '状态或被拒列表里有 key');
    for (const st of [storage, st3]) for (const [k, v] of st.dump()) if (k !== 'family-xiuxian:ai-key') assert(!v.includes(KEY), '本机存储 ' + k + ' 里有 key');
    return '检查了请求、存档、状态、被拒列表和本机存储';
  });

  await check('A9', '请求格式：默认 deepseek-flash、官方接口、关闭思考；reasoner 不带 thinking', async () => {
    const { log } = setup();
    const s = freshGame('a9');
    const m = untilBatch(s);
    await AI.narrate(s, m);
    const q = log[0];
    assert(q.url === 'https://api.deepseek.com/chat/completions', '接口地址不对：' + q.url);
    assert(q.body.model === 'deepseek-flash' && q.body.thinking && q.body.thinking.type === 'disabled', '默认模型或思考开关不对');
    assert(q.body.messages[0].role === 'system' && q.body.messages[1].role === 'user' && q.body.max_tokens > 0 && q.body.stream === false, '消息格式不对');
    const { log: l2 } = setup({ cfg: { model: 'deepseek-reasoner' } });
    const s2 = freshGame('a9b');
    await AI.narrate(s2, untilBatch(s2));
    assert(l2[0].body.model === 'deepseek-reasoner' && !('thinking' in l2[0].body), 'reasoner 不该带 thinking');
    const t = await (setup(), AI.testConnection());
    assert(t.ok && t.text === '通', '测试连接不通');
    return '模型、接口、消息格式、测试连接都对';
  });

  await check('A10', '小传与眼前的事：写成记进存档；记录有上限，存档不会越积越大', async () => {
    setup();
    const s = freshGame('a10');
    for (let i = 0; i < 30; i++) step(s);
    const life = await AI.life(s);
    assert(life && Game.ai.latest(s, 'life').out === life, '小传没写成：' + (AI.status && AI.status.reason));
    const robber = Object.values(s.people).find((p) => p.id !== s.player.id && P.alive(p));
    FX.Ev.spawn(s, 'ROBBER', { foe: robber.id, place: P.player(s).locationId }, []);
    const ev = await AI.eventText(s, s.pending[s.pending.length - 1]);
    assert(ev && ev.includes(robber.name), '事件改写没写成或漏了人名');
    for (let i = 0; i < 500; i++) Prop.record(s, 'narrate', 'n:h' + (100000 + i), '测试', { hid: 'h' + (100000 + i) });
    const n = s.aiLog.filter((r) => r.kind === 'narrate').length;
    assert(n === Prop.caps.narrate, '叙述记录没封顶：' + n);
    return '小传 ' + life.length + ' 字；叙述记录封顶 ' + n + ' 条';
  });

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} 项通过`);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'ai-summary.json'), JSON.stringify({ results }, null, 2));
  process.exit(ok === results.length ? 0 : 1);
})();
