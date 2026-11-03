/* ============================================================
 * hooks —— 事件从世界状态里长出来
 * 每月末由规则扫一遍世界：交情、仇怨、宗门、市面、地方、大事余波、主角本身，列出“有故事的地方”（钩子），
 * 按频率预算抽，多数月份抽不到；同一种事五年内至多两回。
 * 抽到的钩子先排进队里，不打断闭关；下一次行动结束时才找上门（中间留出时间让 AI 在后台写提案）。
 * 每个钩子自带模板事件，AI 的提案（标题、文字、选项）校验不过就用模板。
 * 事件一律是“数据事件”：选项 = 一种检定 + 一组后果 + 程度；检定和后果只能从白名单里挑，
 * 成功率由现有公式算，数值按境界从后果表里取，AI 写的数字一概不用。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;
  const W = () => FX.World;
  const T = () => FX.T;
  const Cb = () => FX.Combat;

  const Hook = {};
  const me = (s) => P().player(s);
  const st = (s) => (s.player.hooks = s.player.hooks || { queue: [], log: [] });
  const favors = (s) => (s.player.favors = s.player.favors || []);

  /* ---------- 规则常数 ---------- */
  const K = (Hook.K = {
    perYear: 0.18, // 宅家的散修一年约这么多件
    friendBonus: 0.08, // 每多一个知交多一点
    memberMult: 1.25, // 宗门中人事多一点
    awayMult: 1.4, // 不在自己洞府、山门（在外奔走）事多一点
    cooldownYears: 5, cooldownMax: 2,
    queueMax: 4,
    friendMin: 10, foeMax: -30,
  });
  const SIZE = { small: 0.5, mid: 1, big: 2 };
  const SIZES = ['small', 'mid', 'big'];
  // 检定白名单：成功率都由现有公式算
  Hook.CHECKS = { fight: '斗法', flee: '逃遁', talk: '交涉', notice: '察觉', lore: '学识', pay: '出钱', time: '花时日', none: '无须检定' };
  // 后果白名单
  Hook.EFFECTS = {
    'coin+': '得符钱', 'coin-': '失符钱', 'item+': '得物', 'item-': '失物', 'merit+': '得道功', 'progress+': '小幅修为',
    hurt: '受伤', 'rel+': '交情升', 'rel-': '交情降', feud: '结仇', favor_owed: '对方欠你人情', favor_owe: '你欠对方人情', repay: '还了人情', collect: '对方还了人情', intel: '一条消息', followup: '一件后续事',
  };
  const coinAmt = (p, size) => Math.round(10 * Math.pow(1 + p.realm.major, 2) * SIZE[size]);
  const relAmt = (size) => ({ small: 5, mid: 10, big: 20 }[size]);
  const progAmt = (p, size) => Math.round(Math.min(P().need(p), 2000) * { small: 0.02, mid: 0.04, big: 0.08 }[size] * 10) / 10;
  const meritAmt = (p, size) => Math.round(FX.Sect.taskMerit(p) * { small: 1, mid: 2, big: 4 }[size]);
  const daysOf = (size) => ({ small: 10, mid: 30, big: 90 }[size]);
  // 没有具名对手时（押货遇的劫道者、成群的妖物），按境界给的战力
  const foePower = (s, b) => (b.foe ? P().power(s, s.people[b.foe]) : b._power || P().power(s, me(s)));

  /* ---------- 钩子：从世界状态里找 ---------- */
  const cdOk = (s, kind) => st(s).log.filter((x) => x.kind === kind && s.t - x.t < K.cooldownYears * C().daysPerYear).length < K.cooldownMax;
  const rel = (s, q) => P().relValue(s, me(s).id, q.id);
  const others = (s) => P().relationsOf(s, me(s).id).map((r) => s.people[r.a === me(s).id ? r.b : r.a]).filter((q) => q && P().alive(q) && q.id !== me(s).id);
  const sortId = (a, b) => (a.id < b.id ? -1 : 1);
  Hook.scan = (s) => {
    const p = me(s), place = s.places[p.locationId], out = [];
    const add = (kind, w, ctx) => { if (cdOk(s, kind)) out.push({ kind, w, ctx }); };
    const friends = others(s).filter((q) => rel(s, q) >= K.friendMin).sort(sortId);
    const foes = others(s).filter((q) => rel(s, q) <= K.foeMax).sort(sortId);
    // 交情
    const hurtF = friends.filter((q) => q.health.state !== 'healthy');
    if (hurtF.length) add('friend_hurt', 3, { npc: hurtF[0].id });
    if (friends.length) add('friend_visit', 2, { npc: friends[R.int(s.rng, 0, friends.length - 1)].id });
    // 仇怨
    if (foes.length) {
      const f = foes[R.int(s.rng, 0, foes.length - 1)];
      add(f.health.state !== 'healthy' ? 'foe_hurt' : 'foe_probe', 2, { npc: f.id });
    }
    // 宗门
    const fm = FX.Sect.mine(s);
    if (fm) {
      add('sect_task', 2, {});
      const peers = P().living(s).filter((q) => q.id !== p.id && q.factionId === fm.id && Math.abs(P().realmRank(q) - P().realmRank(p)) <= 3).sort(sortId);
      if (peers.length) add('sect_rival', 2, { npc: peers[R.int(s.rng, 0, peers.length - 1)].id });
    }
    // 市面：手里的稀罕货有人求购
    const rare = Object.keys(s.player.inv).filter((k) => s.player.inv[k] > 0 && C().items[k] && C().items[k].price >= 30 && !['heal'].includes(k)).sort();
    if (rare.length) add('market_buyer', 2, { item: rare[R.int(s.rng, 0, rare.length - 1)] });
    // 主角本身：卡关缺的东西、伤、欠的人情
    const need = FX.Guide && FX.Guide.needs(s).find((n) => n.keys.length && C().items[n.keys[0]]);
    if (need) add('self_need', 2, { item: need.keys[0] });
    if (p.health.state !== 'healthy') add('self_hurt', 2, {});
    // 名声：同境界的人慕名来讨教
    if (p.realm.major >= 1) {
      const peers = P().living(s).filter((q) => q.id !== p.id && q.realm.major === p.realm.major && q.locationId !== p.locationId && W().route(s, q.locationId, p.locationId)).sort(sortId);
      if (peers.length) add('self_challenge', 1.2, { npc: peers[R.int(s.rng, 0, peers.length - 1)].id });
    }
    const owe = favors(s).find((f) => f.kind === 'owe' && P().alive(s.people[f.npc]));
    if (owe) add('self_debt', 3, { npc: owe.npc });
    // 人情回流：欠你人情的人登门回礼（先欠的先来）；送的多半是你卡关缺的东西
    const owed = FX.Favor.owed(s)[0];
    if (owed) { const gift = FX.Favor.giftFor(s); add('favor_return', 3 + Math.min(3, FX.Favor.owed(s).length * 0.5), Object.assign({ npc: owed.npc }, gift ? { item: gift } : {})); }
    // 地方：同住一处的人、山里的妖物
    const nb = P().at(s, place.id).filter((q) => q.id !== p.id && Math.abs(rel(s, q)) < K.friendMin).sort(sortId);
    if (nb.length) add('place_neighbor', 1.2, { npc: nb[R.int(s.rng, 0, nb.length - 1)].id });
    // 路过的人：邻近地方的修士途经此地
    const by = place.links.map((l) => l.to).flatMap((id) => P().at(s, id)).filter((q) => q.id !== p.id && Math.abs(rel(s, q)) < K.friendMin).sort(sortId);
    if (by.length) add('place_visitor', 1.5, { npc: by[R.int(s.rng, 0, by.length - 1)].id });
    // 货郎：常用的丹药上门兜售
    const ware = ['qiju', 'heal', 'herb'].filter((k) => C().items[k]);
    if (ware.length) add('market_peddler', 1.2, { item: ware[R.int(s.rng, 0, ware.length - 1)] });
    if (place.danger >= 1) add('place_beasts', 1.5, {});
    // 大事余波：三年内开过的天下大事
    const saga = s.history.slice(-400).reverse().find((e) => /^saga_open_/.test(e.key) && s.t - e.t <= 3 * C().daysPerYear);
    if (saga && nb.length) add('saga_after', 2, { npc: nb[R.int(s.rng, 0, nb.length - 1)].id, what: saga.params.what });
    return out;
  };

  // 月末：按预算抽一个钩子排进队里（不打断闭关）
  Hook.rate = (s) => {
    const p = me(s);
    const friends = others(s).filter((q) => rel(s, q) >= K.friendMin).length;
    const fm = FX.Sect.mine(s);
    const home = (fm && p.locationId === fm.seatId) || s.player.dongfu === p.locationId || s.player.dongtian === p.locationId;
    // 不在自己的山门、洞府（在外奔走、寄居他处）事多一点；凡人、散修住的地方就算家
    const roaming = (fm || s.player.dongfu) && !home;
    return K.perYear * (1 + K.friendBonus * Math.min(5, friends)) * (fm ? K.memberMult : 1) * (roaming ? K.awayMult : 1);
  };
  Hook.monthly = (s) => {
    const p = me(s);
    if (!P().alive(p) || s.ended) return;
    const q = st(s).queue;
    if (q.length >= K.queueMax) return;
    if (!R.chance(s.rng, Hook.rate(s) / C().monthsPerYear)) return;
    const c = Hook.scan(s);
    if (!c.length) return;
    const h = R.weighted(s.rng, c, (x) => x.w);
    q.push(Object.assign({ id: 'k' + s.nextId++, kind: h.kind, t: s.t, ripe: false }, h.ctx));
    st(s).log.push({ kind: h.kind, t: s.t });
    if (st(s).log.length > 60) st(s).log.splice(0, st(s).log.length - 60);
  };

  // 送一件已经排过一回的钩子上门；没有就什么也不做
  Hook.deliver = (s) => {
    const q = st(s).queue;
    while (!s.pending.length && !s.ended) {
      const i = q.findIndex((x) => x.ripe && x.t <= s.t);
      if (i < 0) return;
      const h = q.splice(i, 1)[0];
      const ai = FX.Prop && FX.Prop.get(s, 'k:' + h.id);
      const prop = Hook.build(s, h, ai && ai.out);
      if (prop) FX.Ev.spawn(s, 'HOOK', prop.bound, []);
    }
  };
  // 行动结束：上一回排进来的钩子找上门（这一回新排的，等下一回，好让 AI 在后台写）
  Hook.flush = (s) => {
    const q = st(s).queue;
    Hook.deliver(s);
    for (const x of q) x.ripe = true;
    // 排了太久、当事人已不在的钩子丢掉
    st(s).queue = q.filter((x) => s.t - x.t < 10 * C().daysPerYear && (!x.npc || P().alive(s.people[x.npc])));
  };

  /* ---------- 模板：每种钩子一个 ---------- */
  // 选项：{ label, check, size, win:[effects], lose:[effects] }
  const opt = (label, check, size, win, lose) => ({ label, check, size, win: win || [], lose: lose || [] });
  const TPL = {
    friend_hurt: (s, b, n) => ({ title: '故人负伤', text: `${n.npc}受了伤，托人捎信来，想向你求一颗${n.item}。`, item: 'heal', max: 'mid',
      options: [opt('送药过去', 'none', 'mid', ['item-', 'rel+', 'favor_owed']), opt('亲去探望，替他护法几日', 'time', 'small', ['rel+']), opt('回信婉拒', 'none', 'small', ['rel-'])] }),
    friend_visit: (s, b, n) => ({ title: '故人相邀', text: `${n.npc}路过${n.place}，邀你同去附近山里采药。`, item: 'herb', max: 'small',
      options: [opt('同去', 'notice', 'small', ['item+', 'rel+'], ['hurt']), opt('留他叙旧', 'none', 'small', ['rel+']), opt('推说闭关', 'none', 'small', [])] }),
    foe_probe: (s, b, n) => ({ title: '仇家打探', text: `有人在${n.place}一带打探你的行踪，看来路是${n.npc}的人。`, max: 'mid',
      options: [opt('设法反探', 'notice', 'small', ['intel'], ['rel-']), opt('当面挑明，看能否化解', 'talk', 'mid', ['rel+'], ['feud']), opt('避一避风头', 'time', 'small', [])] }),
    foe_hurt: (s, b, n) => ({ title: '仇家负伤', text: `听说${n.npc}身上带伤，有人劝你趁机了结旧怨。`, max: 'mid', weaken: true,
      options: [opt('前去寻他', 'fight', 'mid', ['coin+', 'rel-'], ['hurt', 'feud']), opt('遣人送药示好', 'talk', 'mid', ['rel+'], []), opt('罢了', 'none', 'small', [])] }),
    sect_task: (s, b, n) => ({ title: '押送差事', text: `宗门长老差你押送一批货去${n.dest}，路上未必太平。`, max: 'mid', power: 0.9,
      options: [opt('应下差事', 'fight', 'mid', ['merit+', 'coin+'], ['hurt']), opt('推辞', 'none', 'small', [])] }),
    sect_rival: (s, b, n) => ({ title: '同门相争', text: `同门${n.npc}与你争一桩差事，话里带着火气。`, max: 'small',
      options: [opt('相让', 'none', 'small', ['rel+']), opt('比试一场定输赢', 'fight', 'small', ['merit+'], ['rel-']), opt('找长老评理', 'lore', 'small', ['merit+'], ['rel-']), opt('不理会', 'none', 'small', [])] }),
    market_buyer: (s, b, n) => ({ title: '有人求购', text: `有人听说你手里有${n.item}，托人来问肯不肯出手。`, item: b._item, max: 'mid', sell: true,
      options: [opt('卖给他', 'none', 'mid', ['item-', 'coin+']), opt('讨个高价', 'talk', 'mid', ['item-', 'coin+'], []), opt('不卖', 'none', 'small', [])] }),
    place_visitor: (s, b, n) => ({ title: '路人借宿', text: `${n.npc}途经${n.place}，天色已晚，想在你这里借宿一宿。`, max: 'small',
      options: [opt('留他住下，攀谈一番', 'talk', 'small', ['rel+', 'intel'], []), opt('指条路让他走', 'none', 'small', []), opt('闭门不见', 'none', 'small', ['rel-'])] }),
    market_peddler: (s, b, n) => ({ title: '货郎上门', text: `一个货郎挑着担子到了${n.place}，担子里有${n.item}。`, item: b._item, max: 'small', buy: true,
      options: [opt('买一份', 'pay', 'small', ['item+']), opt('看看就算', 'none', 'small', [])] }),
    self_challenge: (s, b, n) => ({ title: '慕名讨教', text: `${n.npc}听说你在${n.place}修行，专程来讨教几招。`, max: 'small',
      options: [opt('应下，点到为止', 'fight', 'small', ['rel+', 'progress+'], ['hurt', 'rel+']), opt('以茶代酒，论道一番', 'lore', 'small', ['rel+', 'progress+'], []), opt('婉拒', 'none', 'small', [])] }),
    self_need: (s, b, n) => ({ title: '游商上门', text: `一个游商听说你缺${n.item}，上门兜售。`, item: b._item, max: 'mid', buy: true,
      options: [opt('照价买下', 'pay', 'mid', ['item+']), opt('不要', 'none', 'small', [])] }),
    self_hurt: (s, b, n) => ({ title: '游方郎中', text: `一个游方郎中路过${n.place}，看出你身上有伤。`, item: 'heal', max: 'small', buy: true,
      options: [opt('买一颗' + C().items.heal.name, 'pay', 'small', ['item+']), opt('不必', 'none', 'small', [])] }),
    self_debt: (s, b, n) => ({ title: '来讨人情', text: `${n.npc}来了，说起你欠他的那个人情，想请你替他护法一阵。`, max: 'mid',
      options: [opt('去护法', 'time', 'mid', ['repay', 'rel+']), opt('拿符钱抵', 'pay', 'mid', ['repay']), opt('推脱', 'none', 'small', ['repay', 'rel-', 'rel-'])] }),
    place_neighbor: (s, b, n) => ({ title: '邻人相求', text: `同在${n.place}落脚的${n.npc}想借你的静室闭关些时日。`, max: 'mid',
      options: [opt('借给他', 'none', 'mid', ['rel+', 'favor_owed']), opt('收些租钱', 'talk', 'small', ['coin+'], ['rel-']), opt('不借', 'none', 'small', ['rel-'])] }),
    place_beasts: (s, b, n) => ({ title: '妖物成群', text: `${n.place}一带近来妖物成群，常有人受伤。`, item: 'beastHide', max: 'mid', power: 1.1,
      options: [opt('出手清剿', 'fight', 'mid', ['item+', 'merit+'], ['hurt']), opt('闭门不出', 'none', 'small', [])] }),
    saga_after: (s, b, n) => ({ title: '大事余波', text: `「${b._what}」之后，${n.npc}带着伤找上门来，求你收留几日。`, item: 'heal', max: 'mid',
      options: [opt('收留他', 'time', 'small', ['rel+', 'favor_owed']), opt('赠他一颗' + C().items.heal.name, 'none', 'mid', ['item-', 'rel+']), opt('拒之门外', 'none', 'small', ['rel-'])] }),
    favor_return: (s, b, n) => ({ title: '故人还情', text: b._item ? `${n.npc}登门来了，说当年欠你的那份人情一直记着。听说你正缺${n.item}，特地寻了一份带来。` : `${n.npc}登门来了，说当年欠你的那份人情一直记着，带了些符钱来，权当谢礼。`, item: b._item || undefined, max: 'big',
      options: [opt('收下', 'none', 'big', [b._item ? 'item+' : 'coin+', 'collect', 'rel+']), opt('人情不必还，留下喝茶论道', 'none', 'mid', ['collect', 'rel+', 'progress+']), opt('请他留着，日后再说', 'none', 'small', [])] }),
    follow: (s, b, n) => ({ title: '旧事后续', text: `${n.npc}又来了，还记着上回「${b._ref}」的事。`, max: 'small',
      options: [opt('叙叙旧', 'none', 'small', ['rel+']), opt('托他打听些消息', 'talk', 'small', ['intel'], []), opt('不见', 'none', 'small', ['rel-'])] }),
  };
  Hook.TPL = TPL;
  Hook.KINDS = Object.keys(TPL);
  Hook.FAMILY = { friend_hurt: '交情', friend_visit: '交情', foe_probe: '仇怨', foe_hurt: '仇怨', sect_task: '宗门', sect_rival: '宗门', market_buyer: '市面', self_need: '主角', self_hurt: '主角', self_challenge: '主角', self_debt: '主角', place_neighbor: '地方', place_beasts: '地方', place_visitor: '地方', market_peddler: '市面', saga_after: '大事余波', follow: '后续', favor_return: '交情' };

  // 钩子 → 事件绑定（含模板或 AI 提案）。当事人已不在、条件已变（比如伤好了）就返回 null
  Hook.build = (s, h, ai) => {
    const p = me(s), place = s.places[p.locationId];
    if (h.npc && !P().alive(s.people[h.npc])) return null;
    const b = { place: place.id, _kind: h.kind, _hid: h.id };
    if (h.npc) b.npc = h.npc;
    if (h.item) b._item = h.item;
    if (h.what) b._what = h.what;
    if (h.ref) b._ref = h.ref;
    if (h.kind === 'sect_task') { const l = place.links[R.int(s.rng, 0, place.links.length - 1)]; b._dest = l ? l.to : place.id; }
    const n = Hook.names(s, b);
    const t = TPL[h.kind](s, b, n);
    if (t.item) b._item = t.item;
    if (t.power) b._power = Math.round(P().power(s, p) * t.power * R.range(s.rng, 0.8, 1.2) * 10) / 10;
    if (t.weaken) b._weak = 0.6;
    if (t.sell) b._coin = Math.round(C().items[b._item].price * 1.3);
    if (t.buy) b._cost = Math.round(C().items[b._item].price * 1.2);
    b._max = t.max;
    b._p = { title: t.title, text: t.text, options: t.options, via: 'tpl' };
    if (ai && Hook.okProposal(s, b, ai)) b._p = Object.assign({}, ai, { via: 'ai' });
    return { bound: b };
  };
  Hook.names = (s, b) => ({
    npc: b.npc && s.people[b.npc] ? s.people[b.npc].name : '',
    place: s.places[b.place].name,
    item: b._item ? W().itemName(b._item) : '',
    dest: b._dest ? s.places[b._dest].name : '',
  });

  /* ---------- 检定与后果（规则） ---------- */
  Hook.chance = (s, b, o) => {
    const p = me(s), q = b.npc ? s.people[b.npc] : null;
    switch (o.check) {
      case 'fight': { const pw = (q && o.check === 'fight' && !b._power ? P().power(s, q) * (b._weak || 1) : foePower(s, b)); return Cb().fightChance(s, p, pw).chance; }
      case 'flee': return Cb().fleeChance(s, p, foePower(s, b)).chance;
      case 'talk': return Math.round(U.clamp(45 + (q ? P().relValue(s, p.id, q.id) / 2 - Math.min(25, Math.max(0, P().realmRank(q) - P().realmRank(p)) * 2) : 0), 10, 90));
      case 'notice': return Math.round(U.clamp(30 + p.aptitude / 2, 10, 90));
      case 'lore': return Math.round(U.clamp(30 + p.realm.major * 8, 10, 90));
      default: return 100;
    }
  };
  const costOf = (s, b, o) => (o.check === 'pay' ? (b._cost || coinAmt(me(s), o.size)) : 0);
  // 一条后果的具体数值（按境界取）与说明
  const effText = (s, b, e, size) => {
    const p = me(s), n = Hook.names(s, b);
    switch (e) {
      case 'coin+': return '符钱 +' + (b._coin || coinAmt(p, size));
      case 'coin-': return '符钱 −' + coinAmt(p, size);
      case 'item+': return '得' + n.item;
      case 'item-': return '失' + n.item;
      case 'merit+': return FX.Sect.mine(s) ? C().house.meritName + ' +' + meritAmt(p, size) : '';
      case 'progress+': return '修为 +' + progAmt(p, size);
      case 'hurt': return size === 'big' ? '重伤' : '轻伤';
      case 'rel+': return n.npc ? '与' + n.npc + '交情 +' + relAmt(size) : '';
      case 'rel-': return n.npc ? '与' + n.npc + '交情 −' + relAmt(size) : '';
      case 'feud': return n.npc ? '与' + n.npc + '结仇' : '';
      case 'favor_owed': return n.npc ? n.npc + '欠你一个人情' : '';
      case 'favor_owe': return n.npc ? '欠' + n.npc + '一个人情' : '';
      case 'repay': return '还了人情';
      case 'collect': return n.npc ? n.npc + '的人情就算还了' : '';
      case 'intel': return '得一条消息';
      case 'followup': return '日后还有下文';
      default: return '';
    }
  };
  const describe = (s, b, list, size) => list.map((e) => effText(s, b, e, size)).filter(Boolean).join('，');
  const avail = (s, b, o) => {
    const all = o.win.concat(o.lose);
    if (all.includes('item-') && !((s.player.inv[b._item] || 0) > 0)) return '行囊里没有' + Hook.names(s, b).item;
    if (o.check === 'pay' && s.player.stone < costOf(s, b, o)) return '符钱不够（要 ' + costOf(s, b, o) + '）';
    if ((o.check === 'fight' || all.includes('hurt')) && me(s).health.state === 'heavy') return '重伤在身';
    return true;
  };
  const applyEff = (s, b, e, size, ctx) => {
    const p = me(s), q = b.npc ? s.people[b.npc] : null;
    switch (e) {
      case 'coin+': s.player.stone += b._coin || coinAmt(p, size); break;
      case 'coin-': s.player.stone -= Math.min(s.player.stone, coinAmt(p, size)); break;
      case 'item+': s.player.inv[b._item] = (s.player.inv[b._item] || 0) + 1; break;
      case 'item-': if (s.player.inv[b._item] > 0) s.player.inv[b._item]--; break;
      case 'merit+': if (FX.Sect.mine(s)) s.player.merit += meritAmt(p, size); break;
      case 'progress+': FX.CU.addProgress(s, p, progAmt(p, size)); break;
      case 'hurt': P().injure(s, p, size === 'big' ? 'heavy' : 'light'); break;
      case 'rel+': if (q) P().adjustRelation(s, p.id, q.id, relAmt(size), '往来'); break;
      case 'rel-': if (q) P().adjustRelation(s, p.id, q.id, -relAmt(size), '往来'); break;
      case 'feud': if (q) P().adjustRelation(s, p.id, q.id, -40, '结怨'); break;
      case 'favor_owed': if (q) favors(s).push({ npc: q.id, kind: 'owed', t: s.t }); break;
      case 'favor_owe': if (q) favors(s).push({ npc: q.id, kind: 'owe', t: s.t }); break;
      case 'repay': { const f = q && favors(s).find((x) => x.npc === q.id && x.kind === 'owe'); if (f) favors(s).splice(favors(s).indexOf(f), 1); break; }
      case 'collect': if (q) FX.Favor.collect(s, q.id); break;
      case 'intel': ctx.intel = FX.Deed.intel(s, FX.Guide && FX.Guide.next(s) ? 'way' : 'rumor', {}); break;
      case 'followup': if (q) st(s).queue.push({ id: 'k' + s.nextId++, kind: 'follow', npc: q.id, ref: b._p.title, t: s.t + R.int(s.rng, 1, 3) * C().daysPerYear, ripe: false }); break;
    }
  };

  // 给 events.js 用的选项视图与结算
  Hook.options = (s, b) => b._p.options.map((o, i) => {
    const ch = Hook.chance(s, b, o);
    const cost = costOf(s, b, o);
    return {
      id: 'o' + i, label: o.label,
      chance: o.check === 'none' || o.check === 'pay' || o.check === 'time' ? undefined : (s2, b2) => ({ chance: Hook.chance(s2, b2, o), parts: [{ label: Hook.CHECKS[o.check] + '（按' + { fight: '双方战力', flee: '遁行与战力对比', talk: '交情与境界差', notice: '资质', lore: '境界' }[o.check] + '）', value: Hook.chance(s2, b2, o) + '%' }] }),
      cost: () => (cost ? '符钱 −' + cost : o.check === 'time' ? T().dur(daysOf(o.size)) : '无'),
      risk: () => (o.check === 'none' || o.check === 'pay' || o.check === 'time' ? (describe(s, b, o.lose, o.size) || '无') : Hook.CHECKS[o.check] + ' ' + ch + '%' + (o.lose.length ? '；不成则' + describe(s, b, o.lose, o.size) : '')),
      outcome: () => describe(s, b, o.win, o.size) || '什么也不会发生',
      avail: (s2, b2) => avail(s2, b2, o),
      apply(s2, b2, ctx) {
        const c = Hook.chance(s2, b2, o);
        if (cost) s2.player.stone -= cost;
        const win = c >= 100 || R.next(s2.rng) * 100 < c;
        const list = win ? o.win : o.lose;
        for (const e of list) applyEff(s2, b2, e, o.size, ctx);
        if (o.check === 'fight') { s2.player.stats.fights++; if (win) s2.player.stats.wins++; }
        const d = describe(s2, b2, list, o.size);
        const head = o.check === 'none' || o.check === 'pay' || o.check === 'time' ? '' : (win ? '成了' : '没成') + '（' + c + '%）';
        const txt = [head, d, ctx.intel].filter(Boolean).join('，');
        return { text: txt || '事情就这样过去了', gain: win && o.win.some((e) => /\+$|owed|intel/.test(e)), days: o.check === 'time' ? daysOf(o.size) : 0 };
      },
    };
  });

  /* ---------- AI 提案：格式与校验 ---------- */
  Hook.SPEC = {
    title: { type: 'text', maxLen: 12, required: true },
    text: { type: 'text', maxLen: 160, required: true, digits: true },
    options: { type: 'list', max: 4, of: { type: 'object', fields: {
      label: { type: 'text', maxLen: 16 }, check: { type: 'enum', values: Object.keys(Hook.CHECKS) }, size: { type: 'enum', values: SIZES },
      win: { type: 'list', max: 3, of: { type: 'enum', values: Object.keys(Hook.EFFECTS) } }, lose: { type: 'list', max: 3, of: { type: 'enum', values: Object.keys(Hook.EFFECTS) } },
    } } },
  };
  // 这个钩子允许用的后果：模板里出现过的，加上交情升降、消息与后续
  const allowed = (b) => new Set(TPL[b._kind] ? [].concat(...b._p.options.map((o) => o.win.concat(o.lose)), ['rel+', 'rel-', 'intel', 'followup']) : []);
  // 校验 AI 的提案；合格返回 null，不合格返回原因
  Hook.checkProposal = (s, b, v, facts) => {
    const r = FX.Prop.checkSpec(s, Hook.SPEC, v);
    if (!r.ok) return r.errors.slice(0, 2).join('；');
    const x = r.value;
    if (!x.options || x.options.length < 2) return '选项要两到四个';
    const ok = allowed(b), maxI = SIZES.indexOf(b._max || 'mid');
    for (const o of x.options) {
      if (!o.label || !o.check || !o.size) return '选项缺字段';
      if (SIZES.indexOf(o.size) > maxI) return '程度超过这个钩子的上限';
      o.win = o.win || []; o.lose = o.lose || [];
      for (const e of o.win.concat(o.lose)) if (!ok.has(e)) return '用了这个钩子不许的后果：' + e;
      if (o.lose.some((e) => /\+$|owed|intel/.test(e))) return '失败不能有收获';
      if (o.check === 'none' && o.lose.length) return '无须检定的选项不该有失败后果';
    }
    // 守“不保证幸运”：总得有一个什么也不得的选项（推辞、不理）
    if (!x.options.some((o) => !o.win.some((e) => /\+$|owed|intel/.test(e)))) return '缺一个无得的选项';
    const why = FX.Prop.checkText(s, x.title + '\n' + x.text + '\n' + x.options.map((o) => o.label).join('\n'), facts, { maxLen: 400, mustNames: b.npc ? [s.people[b.npc].name] : [] });
    if (why) return why;
    return null;
  };
  Hook.okProposal = (s, b, v) => {
    const f = Hook.facts(s, b);
    return !Hook.checkProposal(s, b, JSON.parse(JSON.stringify(v)), f);
  };
  Hook.facts = (s, b) => {
    const p = me(s), n = Hook.names(s, b), q = b.npc ? s.people[b.npc] : null;
    const L = ['主角' + p.name + '，' + P().realmName(p) + '，' + P().factionName(s, p) + '，在' + n.place + '。'];
    if (q) L.push('当事人' + q.name + '，' + P().realmName(q) + '，' + P().factionName(s, q) + '，与主角交情 ' + P().relValue(s, p.id, q.id) + (q.health.state !== 'healthy' ? '，带伤' : '') + '。');
    if (n.item) L.push('牵涉的东西：' + n.item + '。');
    if (n.dest) L.push('去处：' + n.dest + '。');
    if (b._what) L.push('天下大事：' + b._what + '。');
    L.push('钩子：' + Hook.FAMILY[b._kind] + '·' + b._p.title + '。模板开场：' + b._p.text);
    return L.join('\n');
  };
  // 给 AI 的请求：钩子排进队时就发，到它找上门时用
  Hook.job = (s, h) => {
    const pr = Hook.build(s, Object.assign({}, h), null);
    if (!pr) return null;
    const b = pr.bound, facts = Hook.facts(s, b);
    const recent = s.history.filter((e) => e.type === 'event' && e.pov).slice(-10).map((e) => e.params.title).filter(Boolean);
    const allow = [...allowed(b)].map((e) => e + '（' + Hook.EFFECTS[e] + '）').join('、');
    return {
      kind: 'hook', key: 'k:' + h.id, facts, maxTokens: 600, bound: b,
      messages: [
        { role: 'system', content: '你为修仙游戏写一件找上门来的小事，只输出一个 JSON 对象。世界取自《仙业》东弥州。\n格式：{"title":"四到八字","text":"开场，六十到一百二十字，第二人称称主角为你","options":[{"label":"选项，十字内","check":"检定","size":"程度","win":["成了的后果"],"lose":["不成的后果"]}]}\n'
          + '检定只能是：' + Object.entries(Hook.CHECKS).map(([k, v]) => k + '（' + v + '）').join('、') + '。程度只能是 small、mid' + (b._max === 'big' ? '、big' : '') + (b._max === 'small' ? '（这件事只许 small）' : '') + '。\n'
          + '后果只能是：' + allow + '。数值由规则算，你不要写任何数字。\n二到四个选项，至少一个选项什么也得不到（推辞、不理）；无须检定（none）的选项不写 lose。\n只能用事实里的人名、地名、物名，必须提到当事人；不要引用原著原文。' },
        { role: 'user', content: '事实：\n' + facts + (recent.length ? '\n最近经历过的事（不要重复）：' + recent.join('、') : '') },
      ],
    };
  };
  Hook.accept = (s, job, raw) => {
    const j = FX.Prop.parseJSON(raw);
    if (!j.ok) return { ok: false, why: j.error };
    const why = Hook.checkProposal(s, job.bound, j.value, job.facts);
    if (why) return { ok: false, why };
    const v = FX.Prop.checkSpec(s, Hook.SPEC, j.value).value;
    for (const o of v.options) { o.win = o.win || []; o.lose = o.lose || []; }
    FX.Prop.record(s, 'hook', job.key, v, {});
    return { ok: true, text: v.title };
  };
  Hook.pendingJobs = (s) => st(s).queue.filter((h) => !FX.Prop.get(s, 'k:' + h.id)).map((h) => Hook.job(s, h)).filter(Boolean);

  /* ---------- 事件定义 ---------- */
  FX.EVENTS.HOOK = {
    name: (s, b) => b._p.title, category: '世事', severity: 2, hook: true,
    text: (s, b) => b._p.text,
    options: (s, b) => Hook.options(s, b),
  };

  FX.Hook = Hook;
})(typeof globalThis !== 'undefined' ? globalThis : this);
