/* ============================================================
 * history —— 结构化历史记录、回合纪事、生平
 * 只写真实发生过的事：所有文本都由记录里的参数拼装。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const U = FX.U;

  // 摘要模板（config 区块）：同一键可有多个变体，按记录 id 轮换，不消耗随机数
  const T = (FX.CONFIG.text = {
    found: ['{surname}氏开族，始祖{name}以{realm}之身立宗祠，族人{count}口。'],
    birth: ['{parents}得{sex}，取名{name}。', '{name}降生，父母为{parents}。'],
    adult: ['{name}年满十六，可担差事。'],
    rootTest: ['{name}六岁测灵根，为{root}。', '{name}测出{root}，资质{apt}。'],
    marriage: ['{a}与{b}（{from}）结为夫妇。', '{a}与来自{from}的{b}成婚。'],
    marry_out: ['{name}外嫁{to}，从此离族。'],
    death_generic: ['{name}卒，年{age}，{realm}，死因：{cause}。', '{name}于{age}岁辞世（{realm}），{cause}。'],
    death_lifespan: ['{name}寿元耗尽，坐化于{age}岁，终究止步{realm}。', '{name}大限已至，{age}岁坐化，修为{realm}。', '{name}在{age}岁寿尽而终，{realm}。'],
    death_break: ['{name}{cause}，身死道消，年{age}。', '{name}闭关冲关不成，{cause}，年仅{age}。'],
    death_travel: ['{name}外出历练遇险，殒命他乡，年{age}。'],
    leave: ['{name}离开家族：{cause}。'],
    realm_up: ['{name}修为精进，晋入{realm}。'],
    break_ok: ['{name}冲击{target}成功（成功率 {chance}%），寿元上限增至 {life}。', '{name}以 {chance}% 之机破关，成就{target}。'],
    break_fail: ['{name}冲击{target}失败（成功率 {chance}%），{loss}。'],
    duty_change: ['{name}差事由{from}改为{to}。'],
    build: ['{bname}升至 {level} 级，耗灵石 {cost}。'],
    head_change: ['{name}继任家主（{how}），威望 {prestige}。', '家主之位传于{name}（{how}），起始威望 {prestige}。'],
    head_interim: ['族中无合格继承人，{name}以辈分暂代家主。'],
    elder_change: ['{name}成为太上长老，护族战力 {power}。'],
    abdicate: ['{old}退位为太上长老，{name}接任家主。'],
    rule_change: ['家主{head}改{cat}为「{to}」（原为「{from}」），{resist}。'],
    event: ['{title}：{choice}。{result}'],
    travel_injury: ['{name}历练受{level}。'],
    travel_fortune: ['{name}历练得遇机缘，带回{reward}。'],
    deficit: ['家族入不敷出，灵石告罄，缺口 {gap}。'],
    famine: ['灵谷不足，缺口 {gap}，族人挨饿。'],
    autonomy: ['{name}{act}（{why}）。'],
    request: ['{name}请求{what}（{why}）。'],
    request_done: ['家主{verdict}{name}的请求：{what}。'],
    market_buy: ['于坊市购入{item}×{qty}，花费灵石 {cost}。'],
    alchemy: ['{name}开炉 {n} 次，成丹{item} {made} 颗。'],
    milestone: ['里程碑：{what}。'],
    ending: ['家族结局：{what}。'],
  });

  const H = {};

  H.add = (s, e) => {
    const id = 'h' + s.nextHistId++;
    const entry = {
      id,
      year: s.year,
      turn: s.turn,
      type: e.type,
      tags: e.tags || [],
      actors: e.actors || [],
      factions: e.factions || [],
      key: e.key,
      params: e.params || {},
      severity: e.severity || 1,
      causeIds: (e.causeIds || []).filter(Boolean),
      effects: e.effects || {},
      firstOf: null,
      record: null,
    };
    s.history.push(entry);
    return id;
  };

  H.get = (s, id) => {
    // 历史是按 id 递增追加的，二分查找
    const n = parseInt(String(id).slice(1), 10);
    let lo = 0, hi = s.history.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const m = parseInt(s.history[mid].id.slice(1), 10);
      if (m === n) return s.history[mid];
      if (m < n) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  };

  H.text = (entry) => {
    const vs = T[entry.key] || ['{key}'];
    const n = parseInt(entry.id.slice(1), 10) || 0;
    const tpl = vs[n % vs.length];
    return U.fill(tpl, Object.assign({ key: entry.key }, entry.params));
  };

  // “第一次”标记
  H.markFirst = (s, key, hid) => {
    if (!hid) return false;
    if (s.records.firsts[key]) return false;
    s.records.firsts[key] = hid;
    const e = H.get(s, hid);
    if (e) { e.firstOf = key; e.severity = Math.max(e.severity, 3); }
    return true;
  };
  // “最高 / 最惨”纪录
  H.markRecord = (s, key, value, hid, higherIsMore) => {
    const cur = s.records.peaks[key];
    if (!cur || (higherIsMore !== false ? value > cur.value : value < cur.value)) {
      s.records.peaks[key] = { value, hid, year: s.year };
      const e = hid && H.get(s, hid);
      if (e) e.record = key;
      return true;
    }
    return false;
  };

  H.turnEntries = (s, turn, minSev) => s.history.filter((e) => e.turn === turn && e.severity >= (minSev || 1));

  // 回合纪事：节选重要度 ≥ 2 的条目
  H.chronicle = (s, turn) => {
    const es = H.turnEntries(s, turn, 2);
    return es.map((e) => ({ id: e.id, year: e.year, type: e.type, severity: e.severity, text: H.text(e), causes: e.causeIds }));
  };

  // 前因链（最多向上追 depth 层）
  H.causeChain = (s, id, depth) => {
    const out = [];
    let layer = [id];
    const seen = new Set([id]);
    for (let d = 0; d < (depth || 3); d++) {
      const next = [];
      for (const x of layer) {
        const e = H.get(s, x);
        if (!e) continue;
        for (const c of e.causeIds) if (!seen.has(c)) { seen.add(c); next.push(c); const ce = H.get(s, c); if (ce) out.push(ce); }
      }
      layer = next;
    }
    return out;
  };
  H.consequences = (s, id) => s.history.filter((e) => e.causeIds.includes(id));

  /* ---------- 生平摘要 ---------- */
  const LIFE = {
    open: [
      '{name}，{sex}，生于第 {by} 年，{origin}。',
      '{name}（第 {by} 年生），{origin}。',
      '{origin}的{name}，第 {by} 年出生。',
    ],
    cult: [
      '一生修至{realm}{brk}。',
      '最高修为{realm}{brk}。',
      '修行所至，止于{realm}{brk}。',
    ],
    work: [
      '累计家族贡献 {contrib}，{duties}。',
      '为家族效力，贡献 {contrib}，{duties}。',
      '{duties}，积下贡献 {contrib}。',
    ],
    rel: [
      '{spouse}{kids}{friends}',
    ],
    end: [
      '第 {dy} 年{cause}，享年 {age}。',
      '卒于第 {dy} 年，年 {age}，{cause}。',
      '第 {dy} 年辞世（{cause}），寿 {age}。',
    ],
  };
  const TONE = {
    孝顺: '孝悌传家，族人称道。', 仁慈: '待人宽厚，身后多有追念。', 贪婪: '为人好利，私囊颇丰。',
    正直: '持身端正，不阿上意。', 孤傲: '性情孤高，少与人群。', 谨慎: '行事谨慎，少有闪失。', 野心勃勃: '素怀大志，常思进取。',
  };

  H.lifeSummary = (s, p) => {
    const P = FX.P;
    const k = parseInt(p.id.slice(1), 10) || 0;
    const pick = (arr, off) => arr[(k + (off || 0)) % arr.length];
    const brks = s.history.filter((e) => e.type === 'breakthrough' && e.actors[0] === p.id && e.params.ok).map((e) => `第 ${e.year} 年成${e.params.target}`);
    const kids = p.childIds.length;
    const spouse = p.spouseId || p.formerSpouseIds.length ? '配偶' + [p.spouseId].concat(p.formerSpouseIds).filter(Boolean).map((id) => P.name(s, id)).join('、') + '；' : '未曾婚配；';
    const rels = (p.lastRelations || P.relationsOf(s, p.id).map((r) => ({ other: r.a === p.id ? r.b : r.a, type: r.type, strength: r.strength })));
    const friends = rels.filter((r) => r.type === 'close' && r.strength >= 40).map((r) => P.name(s, r.other));
    const foes = rels.filter((r) => r.type === 'feud').map((r) => P.name(s, r.other));
    const dutyCount = {};
    for (const e of s.history) if (e.type === 'duty' && e.actors[0] === p.id) dutyCount[e.params.to] = (dutyCount[e.params.to] || 0) + 1;
    const mainDuty = Object.keys(dutyCount).sort((a, b) => dutyCount[b] - dutyCount[a])[0];
    const parts = [];
    parts.push(U.fill(pick(LIFE.open), { name: p.name, sex: p.sex === 'M' ? '男' : '女', by: p.birthYear, origin: p.origin === 'native' ? (p.branch === 'main' ? '嫡系子弟' : '旁支子弟') : '嫁入/入赘本族' }));
    parts.push(U.fill(pick(LIFE.cult, 1), { realm: P.realmName(p), brk: brks.length ? '，' + brks.join('，') : '' }));
    parts.push(U.fill(pick(LIFE.work, 2), { contrib: Math.round(p.contribution), duties: mainDuty ? '多任' + mainDuty : '未担差事' }));
    parts.push(spouse + (kids ? `育有子女 ${kids} 人；` : '无子嗣；') + (friends.length ? `挚友${friends.join('、')}；` : '') + (foes.length ? `与${foes.join('、')}有隙。` : ''));
    const tone = p.traits.map((t) => TONE[t]).filter(Boolean)[0];
    if (tone) parts.push(tone);
    if (p.status === 'dead') parts.push(U.fill(pick(LIFE.end, 1), { dy: p.deathYear, age: p.deathYear - p.birthYear, cause: p.deathCause }));
    else if (p.status === 'left') parts.push(`第 ${p.leftYear} 年离族：${p.leftCause}。`);
    return parts.join('');
  };

  /* ---------- 家史（简版）：按“第一次、最高、最惨”与重要度选取节点 ----------
   * 只读状态，不写入任何东西。每个节点都带来源记录 id，可追溯。
   * 完整的节点选取规则与雷同度检查属于阶段 4。 */
  H.familyHistory = (s) => {
    const P = FX.P;
    const node = (e) => ({ hid: e.id, year: e.year, text: H.text(e) });
    const byType = (types, minSev) => s.history.filter((e) => types.includes(e.type) && e.severity >= (minSev || 1));
    const firsts = s.records.firsts;
    const firstNode = (k) => (firsts[k] ? H.get(s, firsts[k]) : null);
    const ch = [];
    const found = s.history.find((e) => e.type === 'found');
    ch.push({ title: '开山始祖', nodes: found ? [node(found)] : [] });
    ch.push({ title: '历任家主', nodes: byType(['succession'], 3).map(node).slice(0, 12) });
    const brk = byType(['breakthrough'], 4).filter((e) => e.params.ok);
    const fz = firstNode('firstBreakFail');
    ch.push({ title: '重大突破', nodes: brk.slice(0, 10).map(node).concat(fz ? [node(fz)] : []).sort((a, b) => a.year - b.year) });
    const rise = byType(['milestone', 'resource'], 3).slice(0, 8).map(node);
    const pk = s.records.peaks;
    const extra = [];
    if (pk.population) extra.push({ hid: null, year: pk.population.year, text: `人口峰值 ${pk.population.value} 口（第 ${pk.population.year} 年）` });
    if (pk.stone) extra.push({ hid: null, year: pk.stone.year, text: `灵石库存峰值 ${Math.round(pk.stone.value)}（第 ${pk.stone.year} 年）` });
    ch.push({ title: '家族兴衰', nodes: rise.concat(extra).sort((a, b) => a.year - b.year) });
    ch.push({ title: '重要战争', nodes: byType(['crisis'], 3).map(node) });
    const mar = byType(['marriage'], 2).filter((e) => e.firstOf || (e.params.from && e.params.from !== '外姓' && e.params.from !== '族内'));
    ch.push({ title: '婚姻联盟', nodes: mar.slice(0, 8).map(node) });
    const strife = s.history.filter((e) => e.type === 'leave' && /出走|逐出|放逐|私奔/.test(e.params.cause || '') || (e.type === 'event' && ['S01', 'E06', 'E10B'].includes(e.params.defId)));
    ch.push({ title: '重大内斗', nodes: strife.slice(0, 8).map(node) });
    const end = s.ended ? H.get(s, s.ended.hid) : null;
    const head = s.people[s.family.headId];
    ch.push({ title: '家族结局', nodes: end ? [node(end)] : [{ hid: null, year: s.year, text: `至第 ${s.year} 年，族人 ${P.living(s).length} 口，家主${head ? head.name : '空缺'}，家史仍在续写` }] });
    return { title: s.family.surname + '氏家史', chapters: ch };
  };

  FX.H = H;
})(typeof globalThis !== 'undefined' ? globalThis : this);
