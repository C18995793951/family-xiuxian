/* ============================================================
 * actions —— 主角行动：每个行动消耗时间，结果由规则掷骰决定
 * Act.list 给出“此刻规则允许的行动清单”（界面、测试、以后的 AI 都从这里挑）；
 * Act.run 执行其中一项。
 * 两条原则落在这里：
 *  一、不强行制造奇遇：遭遇只在游历、赶路、闭关被打扰时才有机会出现，多数时候什么都不发生；
 *  二、不保证幸运：游历、突破、请教都可能一无所获，成败只看掷骰。
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
  const CU = () => FX.CU;
  const Sim = () => FX.Sim;
  const T = () => FX.T;

  const Act = {};
  Act.seek = (s, gain) => seek(s, gain);
  const me = (s) => P().player(s);
  const here = (s) => s.places[me(s).locationId];
  const giveItem = (s, key, n) => { s.player.inv[key] = (s.player.inv[key] || 0) + n; };
  const isTown = (place) => ['town', 'city', 'sect', 'clan'].includes(place.type);
  // “求取”类行动（游历、突破、结交、请教）是否有收获，用于检验原则二
  const seek = (s, gain) => { s.player.stats.seek++; if (!gain) s.player.stats.seekNoGain++; };

  /* ---------- 可选行动清单 ---------- */
  Act.list = (s) => {
    if (s.ended) return [];
    if (s.pending.length) return [];
    const p = me(s), place = here(s), cf = C();
    const out = [];
    const add = (o) => out.push(Object.assign({ ok: true, reason: '' }, o));
    // 修炼 / 闭关
    const verb = p.realm.major === 0 ? '静坐参悟 ' : p.realm.major === 1 ? '温养胎息 ' : null;
    for (const d of cf.actions.cultivateDays) add({ type: 'cultivate', days: d, label: (verb || (d >= 360 ? '闭关 ' : '修炼 ')) + T().dur(d), group: '修炼' });
    // 一口气修到圆满：按眼下的修炼速度估出要几个月（中途被打扰就停下）
    const left = P().need(p) - p.progress;
    if (left > 0 && isFinite(left)) {
      const pill = s.player.qijuUntil > s.t || (p.realm.major >= 2 && s.player.autoPill !== false && (s.player.inv.qiju || 0) > 0);
      const sp = CU().breakdown(s, p, { pill }).total;
      if (sp > 0) {
        const m = cf.daysPerMonth, cap = Math.max(m, Math.floor(P().lifespanLeft(s, p)) * cf.daysPerYear);
        const d = Math.max(m, Math.min(Math.ceil((left / sp) * cf.daysPerYear / m) * m, cf.actions.untilFullMax, cap));
        add({ type: 'cultivate', until: true, days: d, label: (verb ? verb.trim() : '闭关') + '到圆满（约 ' + T().dur(d) + '）', group: '修炼' });
      }
    }
    // 以符钱修行（练炁以上）
    const cpy = CU().coinPerYear(p);
    if (cpy) for (const d of cf.actions.coinDays) {
      const cost = Act.coinCost(p, d);
      add({ type: 'cultivate', coin: true, days: d, cost, label: '以符钱修行 ' + T().dur(d) + '（' + cost + ' 符钱）', group: '修炼', ok: s.player.stone >= cost, reason: s.player.stone >= cost ? '' : '符钱不够（需 ' + cost + '）' });
    }
    // 突破
    const gk = CU().gateKind(p);
    // 返虚关隘前自判道途：三条各是一个选择
    for (const path of gk === 'fanxu' ? cf.realms.fanxuPathOrder : [undefined]) {
      if (!gk) break;
      const can = CU().canAttempt(s, p, { path });
      const ch = CU().chance(s, p, { path });
      add({ type: 'breakthrough', path, days: ch.days, label: (ch.kind === 'taixi' ? '参悟胎息' : ch.verb + ch.target) + '（' + ch.chance + '%）', group: '修炼', ok: can.ok, reason: can.ok ? '' : can.reason });
    }
    // 服药、研习练炁术
    for (const k of cf.usable) if (s.player.inv[k] > 0) {
      const why = k === 'heal' && p.health.state === 'healthy' ? '没有受伤' : k === 'yanshou' && p.yanshouTaken >= cf.yanshouYears.length ? '再服已无效'
        : k === 'zhengyang' && p.realm.major !== 6 ? '只对金丹真人有用' : k === 'zhengyang' && P().isFull(p) ? '丹力已经圆满，先冲关' : k === 'xudu' && p.realm.major < 7 ? '留着冲元神时服（冲关时自动服下）' : k === 'xudu' && P().isFull(p) ? '修为已经圆满'
        : k === 'dadong' && p.realm.major !== 7 ? '是元神至药，只对元神真人有用' : k === 'dadong' && P().isFull(p) ? '感悟已足，先去破障关' : '';
      add({ type: 'use', item: k, days: 0, label: '服用' + cf.items[k].name, group: '物品', ok: !why, reason: why });
    }
    for (const t of s.player.manuals) {
      const tc = cf.techniques[t];
      if (tc.kind !== 'lianqi' || t === p.techniqueId) continue;
      const why = p.realm.major === 0 ? '尚未证得胎息' : p.realm.major >= 3 ? '道基已成，练炁术不能再换' : '';
      add({ type: 'learn', tech: t, days: 30, label: (p.techniqueId ? '改修《' : '研习《') + tc.name + '》', group: '修炼', ok: !why, reason: why });
    }
    // 游历
    for (const d of cf.actions.exploreDays) add({ type: 'explore', days: d, label: '在' + place.name + '游历 ' + T().dur(d), group: '外出' });
    // 赶路
    for (const l of place.links) {
      const open = W().linkOpen(p, l);
      const days = FX.Ars.travelDays(s, p, l.days);
      add({ type: 'travel', to: l.to, days, label: '前往' + s.places[l.to].name + '（' + days + ' 天）', group: '赶路', ok: open, reason: open ? '' : C().world.outer.gate.why });
    }
    // 差事
    const job = cf.actions.work[place.type];
    if (job) {
      const member = p.factionId && s.factions[p.factionId].seatId === place.id;
      add({ type: 'work', days: job.days, label: job.name + ' ' + T().dur(job.days), group: '营生', ok: !job.memberOnly || member, reason: job.memberOnly && !member ? '只有本门/本族中人可做' : '' });
    }
    // 托墟市代寻
    for (const o of Act.orderable(s)) add({ type: 'order', item: o.item, days: 0, cost: o.cost, label: '托人代寻' + W().itemName(o.item) + '（' + o.cost + ' 符钱，约 ' + T().dur(o.days) + '后送到）', group: '坊市', ok: s.player.stone >= o.cost, reason: s.player.stone >= o.cost ? '' : '符钱不够（需 ' + o.cost + '）' });
    // 宗门、家族：拜入、符诏、请授、兑换、上交（见 sect.js）
    FX.Sect.list(s, add);
    // 天下大事与洞府（见 saga.js）
    FX.Saga.list(s, add);
    // 道术参习、法器祭炼（见 arsenal.js）
    FX.Ars.list(s, add);
    FX.Yao.list(s, add);
    // 静养
    if (p.health.state !== 'healthy') for (const d of cf.actions.restDays) add({ type: 'rest', days: d, label: '静养 ' + T().dur(d), group: '修炼' });
    // 拜访在场的人
    for (const q of P().at(s, place.id)) {
      if (q.id === p.id) continue;
      add({ type: 'befriend', npc: q.id, days: cf.actions.befriendDays, label: '拜访' + q.name, group: '人物' });
      const cc = Act.canConsult(s, q);
      if (P().realmRank(q) > P().realmRank(p) && P().relValue(s, p.id, q.id) > 0) add({ type: 'consult', npc: q.id, days: cf.actions.consultDays, label: '向' + q.name + '请教', group: '人物', ok: cc === true, reason: cc === true ? '' : cc });
    }
    return out;
  };

  Act.canConsult = (s, q) => {
    const p = me(s);
    if (P().realmRank(q) <= P().realmRank(p)) return '对方修为不比你高';
    if (P().relValue(s, p.id, q.id) < C().relations.consultMin) return '交情不够（需 ' + C().relations.consultMin + '）';
    if (q.lastConsultYear === s.year) return '今年已请教过';
    return true;
  };

  // 校验一项行动是否在清单里（防止界面或 AI 传入清单外的东西）
  Act.find = (s, a) => Act.list(s).find((x) => x.type === a.type && !!x.coin === !!a.coin && ['days', 'to', 'npc', 'item', 'tech', 'fid', 'gid', 'n', 'path', 'zf'].every((k) => a[k] === undefined || x[k] === a[k]));
  Act.coinCost = (p, days) => Math.ceil((CU().coinPerYear(p) * days) / C().daysPerYear);

  Act.run = (s, a) => {
    if (s.ended) return { ok: false, error: '这一生已经结束' };
    if (s.pending.length) return { ok: false, error: '眼前还有事要先决断' };
    if (a && (a.type === 'buy' || a.type === 'sell')) { const r = Act[a.type](s, a.item, a.qty); FX.Ars.sync(s); return r; }
    const item = a && Act.find(s, a);
    if (!item) return { ok: false, error: '此刻不能这样做' };
    if (!item.ok) return { ok: false, error: item.reason };
    s.player.stats.actions++;
    // 兑换可以一次换多份
    const req = Object.assign({}, item);
    if (item.type === 'redeem' && a.qty > 1) {
      req.qty = Math.floor(a.qty);
      if (item.cost * req.qty > s.player.merit) return { ok: false, error: C().house.meritName + '不够（需 ' + item.cost * req.qty + '）' };
    }
    if (item.type === 'donate' && a.qty > 1) {
      req.qty = Math.floor(a.qty);
      if (item.cost * req.qty > s.player.stone) return { ok: false, error: '符钱不够（需 ' + item.cost * req.qty + '）' };
    }
    const r = (Act.DO[item.type] || FX.Sect.DO[item.type] || FX.Saga.DO[item.type] || FX.Ars.DO[item.type] || FX.Yao.DO[item.type])(s, req);
    FX.Ars.sync(s);
    Sim().checkEnd(s);
    return Object.assign({ ok: true }, r);
  };

  Act.DO = {};

  /* ---------- 修炼 ---------- */
  Act.DO.cultivate = (s, a) => {
    const p = me(s), place = here(s);
    if (a.coin) s.player.stone -= a.cost; // 符钱先炼进去，被打断也回不来
    const r = Sim().passDays(s, a.days, 'cultivate', { interruptible: a.days >= 90, coin: !!a.coin });
    if (!P().alive(p)) return { text: '' };
    const dur = T().dur(r.used);
    let key = a.coin ? 'cultivate_coin' : 'cultivate';
    if (r.interrupted) key = 'cultivate_cut';
    else if (r.gained <= 0) key = 'cultivate_idle';
    const what = ['气感', '胎息'][p.realm.major] || '修为';
    const verb = ['静坐', '温养胎息'][p.realm.major] || (a.days >= 360 ? '闭关' : '修炼');
    const pills = r.pills ? '，其间服下' + C().items.qiju.name + ' ' + r.pills + ' 颗' : '';
    H().add(s, { type: 'cultivate', tags: ['修炼'], actors: [p.id], places: [place.id], key, pov: true, severity: 1, params: { name: p.name, place: place.name, dur: T().dur(a.days), done: r.used, gain: r.gained, cost: a.cost || 0, what, verb, pills } });
    return { text: `${a.coin ? '以符钱修行' : verb} ${dur}，${what} +${r.gained}${pills}`, interrupted: r.interrupted };
  };

  Act.DO.breakthrough = (s, a) => {
    const p = me(s);
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p) || s.pending.length) return { text: '闭关冲关途中出了变故', interrupted: true };
    const res = CU().attempt(s, p, { path: a.path });
    if (!res.ok) return { text: res.error };
    seek(s, res.success);
    const v = res.verb || '冲击';
    return { text: res.success ? `${v}${res.target}成功` : `${v}${res.target}失败${res.died ? '，身死道消' : ''}`, success: res.success, used: r.used };
  };

  Act.DO.use = (s, a) => {
    const p = me(s), cf = C();
    s.player.inv[a.item]--;
    let effect;
    if (a.item === 'qiju') { s.player.qijuUntil = Math.max(s.player.qijuUntil, s.t) + cf.cultivation.qijuDays; effect = '此后修炼加快，药力持续到 ' + T().fmt(s.player.qijuUntil); }
    else if (a.item === 'heal') { const healed = P().heal(p, cf.life.healPillDays); effect = healed ? '伤势痊愈' : '伤势好转，还需 ' + T().dur(p.health.days); }
    else if (a.item === 'zhengyang' || a.item === 'xudu') { const g = CU().addProgress(s, p, a.item === 'xudu' ? cf.xuduGain : cf.zhengyangGain); effect = '丹力推升，修为 +' + Math.round(g); }
    else if (a.item === 'dadong') { const g = CU().addProgress(s, p, Math.round(P().need(p) * cf.dadongFrac)); effect = '感悟元神之妙，修为 +' + Math.round(g); }
    else { const y = cf.yanshouYears[p.yanshouTaken]; p.yanshouTaken++; p.lifespanBonus += y; effect = '寿元 +' + y + ' 年'; }
    H().add(s, { type: 'item', tags: ['物品'], actors: [p.id], key: 'use_item', pov: true, severity: 1, params: { name: p.name, item: cf.items[a.item].name, effect } });
    return { text: effect };
  };

  Act.DO.learn = (s, a) => {
    const p = me(s);
    Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    const first = !p.techniqueId;
    let loss = '';
    if (!first && p.realm.major === 2) {
      p.progress = Math.floor(p.progress * (1 - C().switchLoss));
      loss = '，真炁性质不同，修为折去 ' + Math.round(C().switchLoss * 100) + '%';
    }
    p.techniqueId = a.tech;
    H().add(s, { type: 'learn', tags: ['功法'], actors: [p.id], key: first ? 'learn_first' : 'learn', pov: true, severity: 2, params: { name: p.name, tech: C().techniques[a.tech].name, loss } });
    CU().autoAdvance(s, p);
    return { text: (first ? '研习《' : '改修《') + C().techniques[a.tech].name + '》' + loss };
  };

  Act.DO.rest = (s, a) => {
    const p = me(s), place = here(s);
    const r = Sim().passDays(s, a.days, 'rest');
    if (!P().alive(p)) return { text: '' };
    const state = p.health.state === 'healthy' ? '伤已养好' : '伤势未愈，还需 ' + T().dur(p.health.days);
    H().add(s, { type: 'rest', tags: ['静养'], actors: [p.id], places: [place.id], key: 'rest', pov: true, severity: 1, params: { name: p.name, place: place.name, dur: T().dur(r.used), state } });
    return { text: state };
  };

  /* ---------- 营生与买卖 ---------- */
  Act.DO.work = (s, a) => {
    const p = me(s), place = here(s);
    const job = C().actions.work[place.type];
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    if (r.interrupted) return { text: '差事没做完就出了事', interrupted: true };
    const stone = Math.round(R.int(s.rng, job.stone[0], job.stone[1]) * C().actions.workPayMult[p.realm.major]) + Math.round(P().realmRank(p) * job.perRank);
    s.player.stone += stone;
    // 本门、本族的差事另由功德房记道功
    const merit = job.merit ? FX.Sect.taskMerit(p) : 0;
    s.player.merit += merit;
    const mtxt = merit ? '，记' + C().house.meritName + ' ' + merit : '';
    H().add(s, { type: 'work', tags: ['营生'], actors: [p.id], places: [place.id], key: 'work', pov: true, severity: 1, params: { name: p.name, place: place.name, dur: T().dur(r.used), job: job.name, stone, merit: mtxt } });
    return { text: `得符钱 ${stone}${mtxt}` };
  };

  Act.marketOf = (s) => (W().hasMarket(s, here(s).id) ? s.markets[here(s).id] : null);

  // 可托墟市代寻的稀罕货（只在墟市办，价钱照原价加成，不随年景浮动）
  Act.orderable = (s) => {
    const O = C().market.order;
    const place = here(s);
    if (place.type !== O.placeType) return [];
    return C().market[place.type].rare.map((x) => {
      const base = x.item.startsWith('tech:') ? C().techniques[x.item.slice(5)].price : C().items[x.item].price;
      return { item: x.item, cost: Math.round(base * (1 + O.fee)), days: O.slowDays[x.item] || O.days };
    }).filter((o) => !(s.markets[place.id] && s.markets[place.id].stock.some((x) => x.item === o.item && x.qty > 0))
      && !(o.item.startsWith('tech:') && (s.player.manuals.includes(o.item.slice(5)) || s.player.orders.some((y) => y.item === o.item))));
  };

  Act.DO.order = (s, a) => {
    const p = me(s), o = Act.orderable(s).find((x) => x.item === a.item);
    s.player.stone -= a.cost;
    s.player.orders.push({ item: a.item, due: s.t + o.days, placeId: p.locationId });
    H().add(s, { type: 'trade', tags: ['坊市'], actors: [p.id], places: [p.locationId], key: 'order', pov: true, severity: 1, params: { name: p.name, place: here(s).name, item: W().itemName(a.item), cost: a.cost, dur: T().dur(o.days) } });
    return { text: '托人代寻' + W().itemName(a.item) + '，约 ' + T().dur(o.days) + '后送到' };
  };

  // 月末：到期的代寻货送到手上
  Act.deliverOrders = (s) => {
    const p = me(s);
    const due = s.player.orders.filter((o) => o.due <= s.t);
    if (!due.length || !P().alive(p)) return;
    s.player.orders = s.player.orders.filter((o) => o.due > s.t);
    for (const o of due) {
      if (o.item.startsWith('tech:')) { const t = o.item.slice(5); if (!s.player.manuals.includes(t)) s.player.manuals.push(t); }
      else giveItem(s, o.item, 1);
      H().add(s, { type: 'trade', tags: ['坊市'], actors: [p.id], key: 'order_arrive', pov: true, severity: 2, params: { name: p.name, place: s.places[o.placeId].name, item: W().itemName(o.item) } });
    }
  };

  Act.buy = (s, item, qty) => {
    const m = Act.marketOf(s);
    if (!m) return { ok: false, error: '此地没有坊市' };
    qty = Math.max(1, Math.floor(qty || 1));
    const slot = m.stock.find((x) => x.item === item);
    if (!slot || slot.qty < qty) return { ok: false, error: '货不够' };
    const cost = slot.price * qty;
    if (s.player.stone < cost) return { ok: false, error: '符钱不足（需 ' + cost + '）' };
    s.player.stone -= cost;
    slot.qty -= qty;
    if (item.startsWith('tech:')) { const t = item.slice(5); if (!s.player.manuals.includes(t)) s.player.manuals.push(t); }
    else giveItem(s, item, qty);
    const p = me(s);
    H().add(s, { type: 'trade', tags: ['坊市'], actors: [p.id], places: [here(s).id], key: 'buy', pov: true, severity: 1, params: { name: p.name, place: here(s).name, item: W().itemName(item), qty, cost } });
    return { ok: true, text: '买下' + W().itemName(item) + '×' + qty };
  };

  Act.sell = (s, item, qty) => {
    if (!Act.marketOf(s)) return { ok: false, error: '此地没有坊市' };
    if (!C().items[item]) return { ok: false, error: '无此物品' };
    qty = Math.max(1, Math.floor(qty || 1));
    if ((s.player.inv[item] || 0) < qty) return { ok: false, error: '数量不够' };
    const gain = W().sellPrice(s, item) * qty;
    s.player.inv[item] -= qty;
    s.player.stone += gain;
    const p = me(s);
    H().add(s, { type: 'trade', tags: ['坊市'], actors: [p.id], places: [here(s).id], key: 'sell', pov: true, severity: 1, params: { name: p.name, place: here(s).name, item: C().items[item].name, qty, gain } });
    return { ok: true, text: '卖得符钱 ' + gain };
  };

  /* ---------- 赶路（逐段走，每段按危险度可能出事）---------- */
  Act.DO.travel = (s, a) => {
    const p = me(s);
    const from = here(s);
    const to = s.places[a.to];
    const r = Sim().passDays(s, a.days, 'travel');
    if (!P().alive(p)) return { text: '' };
    if (r.interrupted) return { text: '路上出了事', interrupted: true };
    p.locationId = to.id;
    if (!s.player.visited.includes(to.id)) {
      // 第一次踏进东弥州腹地的某一域
      if (to.region && to.region !== '南域' && !s.player.visited.some((id) => s.places[id].region === to.region)) {
        H().add(s, { type: 'travel', tags: ['赶路', '大事'], actors: [p.id], places: [to.id], key: 'outer_first', pov: true, severity: 3, params: { name: p.name, region: to.region } });
      }
      s.player.visited.push(to.id);
    }
    const danger = Math.max(from.danger, to.danger);
    const hid = H().add(s, { type: 'travel', tags: ['赶路'], actors: [p.id], places: [from.id, to.id], key: 'travel', pov: true, severity: 1, params: { name: p.name, from: from.name, to: to.name, dur: T().dur(r.used) } });
    if (danger > 0 && R.chance(s.rng, Math.min(0.3, C().world.travelEncounterPerDanger * danger)) && Act.spawnDanger(s, to, '赶路途中，', [hid])) {
      return { text: '抵达' + to.name + '时遇上了麻烦', interrupted: true };
    }
    return { text: '抵达' + to.name };
  };

  /* ---------- 游历 ---------- */
  Act.encounterWeights = (s, place, days) => {
    const E = C().encounter;
    const w = {};
    if (isTown(place)) Object.assign(w, E.townWeights);
    else {
      Object.assign(w, E.weights);
      w.beast *= place.danger;
      w.trouble *= place.danger + 1;
      w.fortune *= place.qi / 3;
    }
    if (me(s).traits.includes('野心勃勃')) w.fortune *= 1.2;
    if (days >= 30) for (const k in w) if (k !== 'nothing') w[k] *= E.longFactor;
    return w;
  };

  Act.DO.explore = (s, a) => {
    const p = me(s), place = here(s), E = C().encounter;
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    if (r.interrupted) return { text: '游历途中出了事', interrupted: true };
    s.player.stats.explores++;
    const w = Act.encounterWeights(s, place, a.days);
    const keys = Object.keys(w).sort();
    let kind = R.weighted(s.rng, keys, (k) => w[k]) || 'nothing';
    // 劫修只挑看得上的人下手：此地没有敢劫你的人，这一回就什么也没遇上
    let robber = null;
    if (kind === 'trouble' && !isTown(place)) { robber = Act.pickRobber(s, place); if (!robber) kind = 'nothing'; }
    // 奇遇冷却：五年内只算一次，多出来的降为普通收获
    let downgraded = false;
    if (kind === 'fortune' && s.t - s.player.lastFortuneT < E.fortuneCooldownDays) downgraded = true;
    const base = { name: p.name, place: place.name, dur: T().dur(a.days) };
    const add = (key, params, sev, extra) => H().add(s, Object.assign({ type: 'explore', tags: ['游历', kind], actors: [p.id], places: [place.id], key, pov: true, severity: sev || 1, params: Object.assign({}, base, params) }, extra || {}));
    switch (kind) {
      case 'herb': {
        const q = R.int(s.rng, E.herbQty[0], E.herbQty[1]);
        giveItem(s, 'herb', q);
        let loot = C().items.herb.name + '×' + q;
        if (R.chance(s.rng, E.rareHerbChance)) { giveItem(s, 'rareHerb', 1); loot += '、' + C().items.rareHerb.name + '×1'; }
        add('explore_herb', { loot });
        seek(s, true);
        return { text: '采得' + loot };
      }
      case 'beast': {
        const d = Math.max(1, place.danger);
        const power = Math.round(E.dangerPower[d] * R.range(s.rng, E.beastSwing[0], E.beastSwing[1]) * 10) / 10;
        const beast = R.pick(s.rng, FX.Combat.beastNames[d]);
        FX.Ev.spawn(s, 'BEAST', { place: place.id, _beast: beast, _power: power, _danger: d }, []);
        seek(s, false); // 是否有收获取决于接下来的决断，这里按“游历本身无收获”记
        s.player.stats.exploreNothing++;
        return { text: '遇上了' + beast, interrupted: true };
      }
      case 'meet': {
        const others = P().at(s, place.id).filter((q) => q.id !== p.id && P().relValue(s, p.id, q.id) === 0);
        const q = others.length ? R.pick(s.rng, others) : W().spawnNpc(s, { kind: 'loose', locationId: place.id });
        const cold = q.traits.includes('孤傲') || (P().realmRank(q) - P().realmRank(p) >= 5 && R.chance(s.rng, 0.5));
        if (cold) { add('meet_cold', { other: q.name }, 1, { actors: [p.id, q.id] }); seek(s, false); s.player.stats.exploreNothing++; return { text: q.name + '不搭理你' }; }
        P().adjustRelation(s, p.id, q.id, R.int(s.rng, 5, 15), '相识');
        add('meet', { other: q.name, realm: P().realmName(q), faction: P().factionName(s, q) }, 2, { actors: [p.id, q.id] });
        seek(s, true);
        return { text: '结识了' + q.name };
      }
      case 'rumor': {
        add('explore_rumor', { rumor: Act.rumor(s) });
        seek(s, false);
        s.player.stats.exploreNothing++;
        return { text: '听到些消息' };
      }
      case 'trouble': {
        if (!isTown(place)) {
          const foe = robber;
          FX.Ev.spawn(s, 'ROBBER', { place: place.id, foe: foe.id }, []);
          seek(s, false);
          s.player.stats.exploreNothing++;
          return { text: foe.name + '拦住了你', interrupted: true };
        }
        const what = R.pick(s.rng, ['被人在人群里摸走了干坤袋', '买到一批掺了假的灵草', '被骗进赌局输了一把']);
        const loss = Math.floor(s.player.stone * R.range(s.rng, E.troubleStoneFrac[0], E.troubleStoneFrac[1]));
        s.player.stone -= loss;
        add(loss > 0 ? 'explore_trouble' : 'explore_trouble_none', { what, loss }, 2);
        seek(s, false);
        s.player.stats.exploreNothing++;
        return { text: what };
      }
      case 'fortune': {
        if (downgraded || isTown(place)) {
          const st = R.int(s.rng, 10, 30);
          s.player.stone += st;
          add('explore_fortune_downgraded', { loot: '符钱 ' + st });
          seek(s, true);
          return { text: '得符钱 ' + st };
        }
        s.player.lastFortuneT = s.t;
        s.player.stats.fortunes++;
        FX.Ev.spawn(s, 'RUIN', { place: place.id }, []);
        seek(s, true);
        return { text: '发现一处前人遗府', interrupted: true };
      }
      default:
        add('explore_nothing', {});
        seek(s, false);
        s.player.stats.exploreNothing++;
        return { text: '一无所获' };
    }
  };

  // 劫修：优先用附近的邪修或品行不端的散修，没有就生成一个
  // 劫修：只挑看得上的人下手（境界战力不到你六成的，不敢来劫）。找不到敢来的就返回 null
  const basePow = (realm) => { const t = C().realms.power[realm.major]; return t[Math.min(t.length - 1, realm.stage - 1)]; };
  Act.robberDares = (realm, p) => basePow(realm) >= C().encounter.robberDare * basePow(p.realm);
  Act.pickRobber = (s, place) => {
    const p = me(s);
    const evil = P().living(s).filter((q) => q.id !== p.id && q.factionId && s.factions[q.factionId].type === 'evil' && P().realmRank(q) <= P().realmRank(p) + 3 && Act.robberDares(q.realm, p));
    const nearby = evil.filter((q) => q.locationId === place.id || s.places[q.locationId].links.some((l) => l.to === place.id));
    if (nearby.length) { const q = R.pick(s.rng, nearby); q.locationId = place.id; return q; }
    // 南域的劫修最高不过筑基二重；东弥州腹地最高到元神（返虚以上的真君不屑拦路）
    const rank = U.clamp(P().realmRank(p) + R.int(s.rng, -2, 2), 1, place.outer ? P().rankOf(7, 1) : 12);
    const realm = P().realmFromRank(rank);
    if (!Act.robberDares(realm, p)) return null;
    return W().spawnNpc(s, { realm, locationId: place.id });
  };

  // 闭关被打扰：在野外多是妖物，在人多处多是劫修
  Act.disturb = (s, place) => {
    if (place.type === 'wild' || place.type === 'danger') {
      const d = Math.max(1, place.danger);
      const E = C().encounter;
      const power = Math.round(E.dangerPower[d] * R.range(s.rng, E.beastSwing[0], E.beastSwing[1]) * 10) / 10;
      FX.Ev.spawn(s, 'BEAST', { place: place.id, _beast: R.pick(s.rng, FX.Combat.beastNames[d]), _power: power, _danger: d, _why: '闭关时洞府外闯来一头' }, []);
      return true;
    }
    const foe = Act.pickRobber(s, place);
    if (foe) FX.Ev.spawn(s, 'ROBBER', { place: place.id, foe: foe.id }, []);
    return !!foe;
  };

  Act.spawnDanger = (s, place, why, causeIds) => {
    const E = C().encounter;
    if (R.chance(s.rng, 0.6)) {
      const d = Math.max(1, place.danger);
      const power = Math.round(E.dangerPower[d] * R.range(s.rng, E.beastSwing[0], E.beastSwing[1]) * 10) / 10;
      FX.Ev.spawn(s, 'BEAST', { place: place.id, _beast: R.pick(s.rng, FX.Combat.beastNames[d]), _power: power, _danger: d, _why: why + '一头' }, causeIds);
      return true;
    }
    const foe = Act.pickRobber(s, place);
    if (foe) FX.Ev.spawn(s, 'ROBBER', { place: place.id, foe: foe.id }, causeIds);
    return !!foe;
  };

  // 传闻：只讲世界里真实存在的事
  Act.rumor = (s) => {
    const r = s.rng;
    const kinds = ['place', 'market', 'strong'];
    const k = R.pick(r, kinds);
    if (k === 'place') {
      const unknown = Object.values(s.places).filter((x) => !s.player.visited.includes(x.id));
      const pl = unknown.length ? R.pick(r, unknown) : R.pick(r, Object.values(s.places));
      return `${pl.name}灵机${['稀薄', '稀薄', '平平', '尚可', '浓郁', '极浓', '如灵窟', '如洞天'][pl.qi]}，灵气属「${pl.attr}」，${pl.danger >= 3 ? '据说凶险得很' : pl.danger >= 1 ? '偶有妖物出没' : '还算太平'}。`;
    }
    if (k === 'market') {
      const rare = [];
      for (const id in s.markets) for (const x of s.markets[id].stock) if (!['qiju', 'heal'].includes(x.item) && x.qty > 0) rare.push({ id, x });
      if (rare.length) { const it = R.pick(r, rare); return `${s.places[it.id].name}的货架上有${W().itemName(it.x.item)}，要价 ${it.x.price} 符钱。`; }
    }
    const strong = P().living(s).filter((q) => q.realm.major >= 3).sort((a, b) => P().realmRank(b) - P().realmRank(a) || (a.id < b.id ? -1 : 1));
    if (!strong.length) return '近来没什么大事。';
    const q = R.pick(r, strong.slice(0, 8));
    return `${P().factionName(s, q)}的${q.name}乃是${P().realmName(q)}修士，常在${s.places[q.locationId].name}。`;
  };

  /* ---------- 人物 ---------- */
  Act.DO.befriend = (s, a) => {
    const p = me(s), q = s.people[a.npc];
    Sim().passDays(s, a.days, 'other');
    if (!P().alive(p) || !P().alive(q)) { seek(s, false); return { text: '没见着人' }; }
    let delta = R.int(s.rng, 1, 8);
    if (p.traits.includes('仁慈')) delta += 3;
    if (p.traits.includes('贪婪')) delta -= 2;
    if (q.traits.includes('孤傲')) delta -= 4;
    if (q.traits.includes('仁慈')) delta += 2;
    if (P().realmRank(q) - P().realmRank(p) >= 5 && R.chance(s.rng, 0.4)) delta = 0;
    if (q.factionId && s.factions[q.factionId].type === 'evil' && p.traits.includes('正直')) delta -= 5;
    const cur = P().relValue(s, p.id, q.id);
    if (cur < 0 && delta > 0) delta = Math.floor(delta / 2); // 有过节的人难哄
    delta = Math.max(-5, delta);
    if (delta !== 0 || cur !== 0) P().adjustRelation(s, p.id, q.id, delta, '拜访');
    const how = delta >= 8 ? '甚欢' : delta >= 4 ? '融洽' : delta > 0 ? '平平' : '冷淡';
    H().add(s, { type: 'social', tags: ['人物'], actors: [p.id, q.id], places: [p.locationId], key: 'befriend', pov: true, severity: 1, params: { name: p.name, other: q.name, how, delta: (delta > 0 ? '+' : '') + delta } });
    seek(s, delta > 0);
    return { text: `与${q.name}相谈${how}（关系 ${delta > 0 ? '+' : ''}${delta}）` };
  };

  Act.DO.consult = (s, a) => {
    const p = me(s), q = s.people[a.npc], cc = C().cultivation;
    Sim().passDays(s, a.days, 'other');
    if (!P().alive(p) || !P().alive(q)) { seek(s, false); return { text: '没见着人' }; }
    q.lastConsultYear = s.year;
    const rel = P().relValue(s, p.id, q.id);
    const accept = U.clamp(0.4 + rel / 150, 0.4, 0.9);
    if (!R.chance(s.rng, accept)) {
      H().add(s, { type: 'social', tags: ['人物'], actors: [p.id, q.id], key: 'consult_refused', pov: true, severity: 1, params: { name: p.name, other: q.name } });
      seek(s, false);
      return { text: q.name + '婉拒了' };
    }
    const amount = Math.round(Math.min(P().need(p), 2000) * R.range(s.rng, cc.consultFrac[0], cc.consultFrac[1]) * 10) / 10;
    const gain = Math.round(CU().addProgress(s, p, amount) * 10) / 10;
    P().adjustRelation(s, p.id, q.id, 2, '指点');
    H().add(s, { type: 'social', tags: ['人物', '修炼'], actors: [p.id, q.id], key: 'consult', pov: true, severity: 2, params: { name: p.name, other: q.name, gain } });
    seek(s, gain > 0);
    return { text: `得${q.name}指点，修为 +${gain}` };
  };

  FX.Act = Act;
})(typeof globalThis !== 'undefined' ? globalThis : this);
