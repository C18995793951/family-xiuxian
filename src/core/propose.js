/* ============================================================
 * propose —— AI 提案：记录、校验、事实摘要与提示词
 * AI 只出提案，规则裁决。这一层不碰网络：调用在 ui/ai.js，回来的东西交给这里校验，通过的记进存档。
 *  · 记录：s.aiLog 存通过校验的文字与提案，读档不重新调用。叙述文字只用于显示，不进任何规则。
 *  · 文字校验：不准出现事实以外的数字、人名、地名、势力、物品、功法；不准漏掉该提的人。
 *  · 提案校验：按规格逐项查——人要在世、地点物品功法要真有、不准带规格外的字段，也不准带数字
 *    （数字只认规则算的）。不合格就整条丢掉，调用方回落模板。
 *  · 事实摘要与提示词只读状态。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const P = () => FX.P;
  const H = () => FX.H;
  const T = () => FX.T;

  const Prop = {};

  /* ---------- 记录：s.aiLog ---------- */
  // 每类只留最近若干条，免得存档越积越大；同一个 key 只留最新一条
  Prop.caps = { narrate: 200, event: 60, life: 3, intent: 50, hook: 30, npc: 40 };
  Prop.record = (s, kind, key, out, extra) => {
    const L = (s.aiLog = s.aiLog || []).filter((r) => r.key !== key);
    L.push(Object.assign({ kind, key, t: s.t, out }, extra || {}));
    const cap = Prop.caps[kind] || 300;
    const mine = L.filter((r) => r.kind === kind);
    const drop = new Set(mine.slice(0, Math.max(0, mine.length - cap)));
    s.aiLog = L.filter((r) => !drop.has(r));
    return true;
  };
  Prop.get = (s, key) => { const L = s.aiLog || []; for (let i = L.length - 1; i >= 0; i--) if (L[i].key === key) return L[i]; return null; };
  Prop.text = (s, key) => { const r = Prop.get(s, key); return r && typeof r.out === 'string' ? r.out : null; };
  Prop.latest = (s, kind) => { const L = s.aiLog || []; for (let i = L.length - 1; i >= 0; i--) if (L[i].kind === kind) return L[i]; return null; };
  // 叙述挂在一批纪事的最后一条上：纪事 id → 那段叙述
  Prop.narrations = (s) => { const m = {}; for (const r of s.aiLog || []) if (r.kind === 'narrate' && r.hid) m[r.hid] = r.out; return m; };

  /* ---------- 文字校验 ---------- */
  const NUM = /\d+(?:\.\d+)?/g;
  // 汉字数字带单位的说法（“七年”“三颗”“筑基三重”），事实里没有原样出现就算编造；单个“一”“两”“半”不算
  const CNUM = /[零〇一二两三四五六七八九十百千万]+(?:年|载|个月|月|天|日|岁|颗|枚|株|份|件|次|回|场|重|层|成|味|符钱|道功)/g;
  const VAGUE = /^[一两半]+[^零〇一二两三四五六七八九十百千万]/;
  const GENERIC = new Set(['灵草']); // 物品名里的寻常字眼，单独出现不算编造
  // 世界里所有专名：人、地、势力、物品、功法
  Prop.names = (s) => {
    const out = [];
    for (const p of Object.values(s.people)) if (p.name && p.name.length >= 2) out.push(p.name);
    for (const pl of Object.values(s.places)) if (pl.name && pl.name.length >= 2) out.push(pl.name);
    for (const f of Object.values(s.factions)) if (f.name && f.name.length >= 2) out.push(f.name);
    for (const it of Object.values(C().items)) if (it.name && it.name.length >= 2 && !GENERIC.has(it.name)) out.push(it.name);
    for (const t of Object.values(C().techniques)) if (t.name && t.name.length >= 2) out.push(t.name);
    return [...new Set(out)];
  };
  // 去掉模型常见的 Markdown 痕迹和包在外面的引号
  Prop.tidy = (t) => String(t || '').replace(/^```[a-z]*\s*|\s*```$/g, '').replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/^\s*[-*]\s+/gm, '· ').replace(/^[“"「]([\s\S]*)[”"」]$/, '$1').trim();
  // 不合格返回原因，合格返回 null
  Prop.checkText = (s, text, facts, opts) => {
    opts = opts || {};
    const t = String(text || '').trim();
    if (!t) return '空文本';
    if (t.length > (opts.maxLen || 2000)) return '过长（' + t.length + ' 字）';
    if (opts.minLen && t.length < opts.minLen) return '过短';
    const fx = String(facts || '');
    const allowed = new Set((fx.match(NUM) || []).concat(opts.allowNums || []).map((d) => String(Number(d))));
    const badNum = (t.match(NUM) || []).filter((d) => !allowed.has(String(Number(d))));
    if (badNum.length) return '出现事实以外的数字：' + badNum.slice(0, 3).join('、');
    const badCn = (t.match(CNUM) || []).filter((w) => !VAGUE.test(w) && !fx.includes(w));
    if (badCn.length) return '出现事实以外的数量：' + badCn.slice(0, 3).join('、');
    if (s) {
      // 长名字先比，免得“玉宸派”里的“玉宸”之类被重复算
      const names = Prop.names(s).sort((a, b) => b.length - a.length);
      let rest = t;
      const outside = [];
      for (const n of names) {
        if (!rest.includes(n)) continue;
        if (!fx.includes(n)) outside.push(n);
        rest = rest.split(n).join('□');
      }
      if (outside.length) return '出现事实以外的名字：' + outside.slice(0, 3).join('、');
    }
    for (const n of opts.mustNames || []) if (!t.includes(n)) return '漏掉了 ' + n;
    return null;
  };

  /* ---------- 提案校验：JSON ---------- */
  // 从模型回复里取出 JSON 对象（容忍 ```json 围栏和前后的闲话）
  Prop.parseJSON = (text) => {
    const raw = String(text || '').replace(/```(?:json)?/gi, '');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return { ok: false, error: '回复里没有 JSON 对象' };
    try {
      const v = JSON.parse(raw.slice(a, b + 1));
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'JSON 不是对象' };
      return { ok: true, value: v };
    } catch (e) { return { ok: false, error: 'JSON 解析失败' }; }
  };
  // 按名字或 id 找人：id 优先；名字要在世的人里唯一
  const findPerson = (s, v, alive) => {
    if (typeof v !== 'string') return null;
    let p = s.people[v];
    if (!p) { const hit = Object.values(s.people).filter((q) => q.name === v && (!alive || P().alive(q))); p = hit.length === 1 ? hit[0] : null; }
    return p && (!alive || P().alive(p)) ? p : null;
  };
  const findIn = (map, v) => (typeof v !== 'string' ? null : map[v] ? v : Object.keys(map).find((k) => map[k].name === v || '《' + map[k].name + '》' === v) || null);
  // 规格：{ 字段: { type, required, values, maxLen, of, fields, max } }
  //   type：person（在世的人）| anyPerson | place | item | tech | faction | enum | text | bool | list | object
  // 合格时返回把名字换成 id 的副本；数字一律不收
  Prop.checkSpec = (s, spec, obj, path) => {
    path = path || '';
    const errors = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: [(path || '提案') + ' 不是对象'] };
    const out = {};
    for (const k of Object.keys(obj)) if (!spec[k]) errors.push('多出字段 ' + path + k);
    for (const k of Object.keys(spec)) {
      const f = spec[k], v = obj[k], at = path + k;
      if (v === undefined || v === null || v === '') { if (f.required) errors.push('缺少 ' + at); continue; }
      const r = Prop.checkField(s, f, v, at);
      if (r.error) errors.push(r.error); else out[k] = r.value;
    }
    return errors.length ? { ok: false, errors } : { ok: true, value: out };
  };
  Prop.checkField = (s, f, v, at) => {
    if (typeof v === 'number') return { error: at + ' 是数字（数字只认规则算的）' };
    switch (f.type) {
      case 'person': case 'anyPerson': { const p = findPerson(s, v, f.type === 'person'); return p ? { value: p.id } : { error: at + ' 找不到' + (f.type === 'person' ? '在世的' : '') + '这个人：' + v }; }
      case 'place': { const id = findIn(s.places, v); return id ? { value: id } : { error: at + ' 没有这个地方：' + v }; }
      case 'faction': { const id = findIn(s.factions, v); return id ? { value: id } : { error: at + ' 没有这个势力：' + v }; }
      case 'item': { const id = findIn(C().items, v); return id ? { value: id } : { error: at + ' 没有这样东西：' + v }; }
      case 'tech': { const id = findIn(C().techniques, v); return id ? { value: id } : { error: at + ' 没有这门功法：' + v }; }
      case 'enum': return f.values.includes(v) ? { value: v } : { error: at + ' 只能是 ' + f.values.join('/') + '，不是 ' + v };
      case 'bool': return typeof v === 'boolean' ? { value: v } : { error: at + ' 要是 true/false' };
      case 'text': {
        if (typeof v !== 'string') return { error: at + ' 要是文字' };
        if (v.length > (f.maxLen || 200)) return { error: at + ' 过长' };
        if (/\d/.test(v) && !f.digits) return { error: at + ' 里带了数字' };
        return { value: v.trim() };
      }
      case 'list': {
        if (!Array.isArray(v)) return { error: at + ' 要是列表' };
        if (v.length > (f.max || 5)) return { error: at + ' 超过 ' + (f.max || 5) + ' 项' };
        const out = [];
        for (let i = 0; i < v.length; i++) {
          const r = f.of.type === 'object' ? Prop.checkSpec(s, f.of.fields, v[i], at + '[' + i + '].') : Prop.checkField(s, f.of, v[i], at + '[' + i + ']');
          if (r.errors) return { error: r.errors.join('；') };
          if (r.error) return { error: r.error };
          out.push(r.value);
        }
        return { value: out };
      }
      case 'object': { const r = Prop.checkSpec(s, f.fields, v, at + '.'); return r.ok ? { value: r.value } : { error: r.errors.join('；') }; }
      default: return { error: at + ' 规格未知' };
    }
  };

  /* ---------- 事实摘要（只读）---------- */
  const hnum = (id) => parseInt(String(id).slice(1), 10) || 0;
  const me = (s) => P().player(s);
  const line = (e) => T().fmt(e.t) + '：' + H().text(e);
  // 一次行动带出来的亲历纪事（从 fromHid 起）；没有要紧的事就不写
  Prop.actBatch = (s, fromHid) => {
    const from = hnum(fromHid);
    const es = [];
    for (let i = s.history.length - 1; i >= 0; i--) { const e = s.history[i]; if (hnum(e.id) < from) break; if (e.pov) es.unshift(e); }
    if (!es.some((e) => e.severity >= 2)) return null;
    // 太长时留下要紧的几条和最后一条
    const keep = es.length > 12 ? es.filter((e, i) => e.severity >= 2 || i === es.length - 1).slice(-12) : es;
    return { hid: es[es.length - 1].id, from: es[0].id, facts: keep.map(line).join('\n') };
  };
  Prop.eventFacts = (s, inst) => {
    const v = FX.Ev.view(s, inst);
    const names = v.people.map((id) => s.people[id] && s.people[id].name).filter(Boolean);
    return { name: v.name, text: v.text, names, facts: v.name + '：' + v.text };
  };
  // 某个人物的履历：境界、志向、他自己的事
  Prop.npcFacts = (s, id) => {
    const q = s.people[id];
    const lines = FX.Npc.story(s, id, 12).map(line);
    return q.name + '，' + P().realmName(q) + '，' + P().factionName(s, q) + '，在' + s.places[q.locationId].name + '。眼下的志向：' + (FX.Npc.aimText(s, q) || '无') + '。\n' + lines.join('\n');
  };
  Prop.lifeFacts = (s) => {
    const p = me(s);
    const big = s.history.filter((e) => e.pov && (e.severity >= 3 || e.firstOf || e.type === 'breakthrough')).slice(-40).map(line);
    return H().lifeSummary(s, p) + '\n' + big.join('\n');
  };

  /* ---------- 提示词 ---------- */
  const WORLD = '世界取自《仙业》的东弥州：境界从胎息、练炁、筑基、紫府、洞玄、金丹一路到元神、返虚、纯阳、合道，钱叫符钱。';
  const RULES = [
    '你只能使用用户给出的事实写作。',
    '严禁新增任何人物、地名、宗门、法宝、丹药、功法、数字，严禁改变任何结果、因果与先后。',
    '数字一律照抄事实里的阿拉伯数字，不要改写成汉字数字，不要估算；事实里没有的时长、数量一概不写。',
    '可以省略次要条目，可以调整语序、补充不含新信息的修饰。',
    '只输出正文纯文本，不要标题、不要 Markdown、不要解释你在做什么。',
  ].join('\n');
  Prop.prompts = {
    narrate: (s, b) => ({
      maxTokens: 400, check: { maxLen: 320 },
      messages: [
        { role: 'system', content: '你是一位修士的随身记事人，文风古雅简练，近似笔记小说。' + WORLD + '\n' + RULES },
        { role: 'user', content: `请把下列亲历的事写成 60 到 160 字的一段叙述，用第三人称：\n${b.facts}` },
      ],
    }),
    event: (s, f) => ({
      maxTokens: 300, check: { maxLen: Math.max(120, f.text.length * 2), mustNames: f.names },
      messages: [
        { role: 'system', content: '你为修仙游戏改写眼前事件的描述，让同一类事每回读来不同。' + WORLD + '\n' + RULES + '\n保留原文中的每个人名、地名与数字，长度与原文相近，不要替玩家做选择，不要提及选项。' },
        { role: 'user', content: `事件「${f.name}」原文：${f.text}\n请换一种说法重写。` },
      ],
    }),
    npc: (s, facts, name) => ({
      maxTokens: 500, check: { maxLen: 400, minLen: 40, mustNames: [name] },
      messages: [
        { role: 'system', content: '你为修仙游戏里的一位人物写近况与打算，文风近似笔记小说。' + WORLD + '\n' + RULES },
        { role: 'user', content: `请依据以下事实，写一段 80 到 200 字的${name}近况，末尾用一句话写他眼下的打算（只能照志向写）：\n${facts}` },
      ],
    }),
    life: (s, facts) => ({
      maxTokens: 1400, check: { maxLen: 1600, minLen: 80 },
      messages: [
        { role: 'system', content: '你为一位修士撰写小传，文风近似古代史书列传。' + WORLD + '\n' + RULES },
        { role: 'user', content: `请依据以下事实为${me(s).name}写一篇 300 到 800 字的小传：\n${facts}` },
      ],
    }),
  };

  // 一次“写什么”的完整打包：key、事实、提示词。没有可写的返回 null
  Prop.job = (s, kind, arg) => {
    if (kind === 'narrate') {
      const b = Prop.actBatch(s, arg);
      if (!b) return null;
      b.facts = '主角' + me(s).name + '，' + P().realmName(me(s)) + '。\n' + b.facts;
      return Object.assign({ kind, key: 'n:' + b.hid, facts: b.facts, extra: { hid: b.hid, from: b.from } }, Prop.prompts.narrate(s, b));
    }
    if (kind === 'event') {
      const f = Prop.eventFacts(s, arg);
      return Object.assign({ kind, key: 'e:' + arg.id, facts: f.facts, extra: { inst: arg.id } }, Prop.prompts.event(s, f));
    }
    if (kind === 'npc') {
      const q = s.people[arg];
      if (!q) return null;
      const st = FX.Npc.story(s, arg, 1);
      const facts = Prop.npcFacts(s, arg);
      return Object.assign({ kind, key: 'b:' + arg + ':' + (st.length ? st[0].id : 'h0') + ':' + (q.aim ? q.aim.since : 0), facts, extra: { npc: arg } }, Prop.prompts.npc(s, facts, q.name));
    }
    if (kind === 'life') {
      const facts = Prop.lifeFacts(s);
      const last = s.history.length ? s.history[s.history.length - 1].id : 'h0';
      return Object.assign({ kind, key: 'l:' + last, facts, extra: { year: s.year } }, Prop.prompts.life(s, facts));
    }
    return null;
  };

  // 模型回来的文字：整理、校验，合格就记进存档。返回 { ok, text } 或 { ok:false, why }
  Prop.accept = (s, job, raw) => {
    const text = Prop.tidy(raw);
    const why = Prop.checkText(s, text, job.facts, job.check);
    if (why) return { ok: false, why, text };
    Prop.record(s, job.kind, job.key, text, job.extra);
    return { ok: true, text };
  };

  FX.Prop = Prop;
})(typeof globalThis !== 'undefined' ? globalThis : this);
