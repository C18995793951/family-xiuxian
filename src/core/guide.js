/* ============================================================
 * guide —— 卡关时的“下一步”
 * 冲关缺练炁术、关隘外药、开府真法时，照眼下的世界状态算出几条能走的路，按大约要花的日子排好：
 * 手里有的直接研习、长老房请授或拿道功换、此地货架买、去常备此物的地方买、托人代寻、拜入宗门；
 * 钱或道功不够的，算出还差多少、在哪做什么营生、大约几个月。
 * 只读不改：给界面写“下一步”、给测试按提示自动走。每条路都落到一个规则允许的行动、一次买卖或一段赶路上。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const P = () => FX.P;
  const W = () => FX.World;
  const S = () => FX.Sect;

  const Guide = {};
  const me = (s) => P().player(s);
  const M = 30; // 一个月
  const techKeys = (kind) => Object.keys(C().techniques).filter((t) => C().techniques[t].kind === kind).map((t) => 'tech:' + t);
  const nameOf = (key) => (key.startsWith('tech:') ? '《' + C().techniques[key.slice(5)].name + '》' : C().items[key].name);
  const priceOf = (key) => (key.startsWith('tech:') ? C().techniques[key.slice(5)].price : C().items[key].price);

  // 冲关卡着的、必需的东西（可选的不算）。凡人还没悟胎息时，先把“胎息以后要一门练炁术”算进来，好早做准备
  Guide.needs = (s) => {
    const p = me(s), out = [];
    if (p.realm.major === 0) out.push({ label: '悟得胎息后要一门练炁术', keys: techKeys('lianqi'), tech: 'lianqi', soon: true });
    for (const r of FX.CU.requirements(s, p)) {
      if (r.ok || r.optional) continue;
      if (r.lianqi) out.push({ label: r.label, keys: techKeys('lianqi'), tech: 'lianqi' });
      else if (r.kaifu) out.push({ label: r.label, keys: techKeys('kaifu'), tech: 'kaifu' });
      else if (r.item && C().items[r.item]) {
        const need = FX.CU.minorNeed(p);
        const qty = need && need.item === r.item ? need.qty - (s.player.inv[r.item] || 0) : 1;
        out.push({ label: r.label, keys: [r.item], qty: Math.max(1, qty) });
      }
    }
    return out;
  };

  // 眼下能做的营生：此地能做就在此地做；本门弟子回山门领差事；不然去最近的集市、墟市帮工
  Guide.earn = (s, L, route) => {
    const p = me(s), here = s.places[p.locationId], f = S().mine(s);
    const pay = (type) => FX.Act.workPay(s, type);
    const w = L.find((a) => a.type === 'work' && a.ok);
    if (w) return { name: pay(here.type).name, stone: pay(here.type).stone, merit: pay(here.type).merit, days: 0, step: { act: w } };
    if (f && !S().atSeat(s, f)) { const r = route(f.seatId), j = pay(s.places[f.seatId].type); if (r && j) return { name: '回' + s.places[f.seatId].name + j.name, stone: j.stone, merit: j.merit, days: r.days, step: { goto: f.seatId } }; }
    let best = null;
    for (const id in s.places) {
      const j = pay(s.places[id].type);
      if (!j || j.memberOnly) continue;
      const r = route(id);
      if (r && (!best || r.days < best.days)) best = { name: '去' + s.places[id].name + j.name, stone: j.stone, merit: 0, days: r.days, step: { goto: id } };
    }
    return best;
  };

  // 卖这样东西的货架：此地和去过的地方看今年的货；没去过的，只算常备此物的地方（墟市常备什么，人人知道）
  const marketsWith = (s, key) => {
    const p = me(s), out = [];
    for (const id in s.places) {
      if (!W().hasMarket(s, id)) continue;
      const def = C().market[s.places[id].type];
      const staple = !!def && def.staples.some((x) => x.item === key && x.qty[0] > 0);
      const m = s.markets[id], x = m && m.stock.find((y) => y.item === key && y.qty > 0);
      if (x && (id === p.locationId || s.player.visited.includes(id))) out.push({ id, price: x.price, sure: staple, buyable: id === p.locationId });
      else if (staple && id !== p.locationId) out.push({ id, price: priceOf(key), sure: true, buyable: false });
    }
    return out;
  };

  // 一样需要的东西有哪些路可走，按大约要花的日子排好
  Guide.ways = (s, need) => {
    const p = me(s), L = FX.Act.list(s), here = p.locationId, stone = s.player.stone, merit = s.player.merit;
    const memo = {}, route = (id) => (id in memo ? memo[id] : (memo[id] = W().route(s, here, id, p)));
    const earn = Guide.earn(s, L, route);
    const f = S().mine(s), MN = C().house.meritName;
    const ways = [];
    const add = (w) => { if (w && isFinite(w.days)) ways.push(w); };
    // 符钱不够：先挣钱（钱够了再看下一步）
    const short = (price, text, days) => {
      const gap = price - stone;
      if (!earn || !earn.stone) return null;
      const months = Math.ceil(gap / earn.stone);
      return { days: days + earn.days + months * M, gap, text: text + '；你有 ' + stone + ' 符钱，还差 ' + gap + '：' + earn.name + '，每月约 ' + earn.stone + '，约 ' + months + ' 个月', step: earn.step, earn: true };
    };
    const meritWay = (a, name) => {
      const seat = f && s.places[f.seatId];
      const away = f && a.reason === S().awayReason(s, f);
      const d = away ? (route(f.seatId) || { days: Infinity }).days : 0;
      const cost = a.cost || 0;
      const label = cost ? seat.name + '长老房以 ' + cost + ' ' + MN + '换' + name : seat.name + '长老房可请授' + name + '，不收' + MN;
      if (a.ok) return add({ days: 0, text: label, step: { act: a } });
      if (!away && !/不够/.test(a.reason || '')) return; // 境界未到之类，走不通
      if (merit >= cost) return add({ days: d, text: '回山门：' + label, step: { goto: f.seatId } });
      // 道功不够：符钱够就捐输补上，不然领差事攒
      const gap = cost - merit;
      const dn = L.find((x) => x.type === 'donate');
      if (dn && (dn.ok || dn.reason === S().awayReason(s, f))) {
        const n = Math.ceil(gap / dn.gain);
        if (n * dn.cost <= stone) add({ days: d, text: label + '；' + MN + '还差 ' + gap + '，捐 ' + n * dn.cost + ' 符钱补足', step: dn.ok ? { act: dn, qty: n } : { goto: f.seatId } });
      }
      const per = S().taskMerit(p);
      if (per > 0) {
        const months = Math.ceil(gap / per);
        const w = L.find((x) => x.type === 'work' && x.ok);
        add({ days: d + months * M, gap, text: label + '；你有 ' + merit + ' ' + MN + '，还差 ' + gap + '：' + ((C().actions.work[seat.type] || {}).name || '领差事') + '每月记 ' + per + '，约 ' + months + ' 个月', step: w ? { act: w } : { goto: f.seatId }, earn: true });
      }
    };
    for (const key of need.keys) {
      const tech = key.startsWith('tech:') ? key.slice(5) : null;
      const name = nameOf(key);
      if (tech) {
        const lr = L.find((a) => a.type === 'learn' && a.tech === tech && a.ok);
        if (lr) add({ days: lr.days || M, text: '研习手里的' + name, step: { act: lr } });
        if (s.player.manuals.includes(tech)) continue;
      }
      const sa = tech ? L.find((a) => a.type === 'sect_learn' && a.tech === tech && !a.zf) : L.find((a) => a.type === 'redeem' && a.item === key);
      if (sa) meritWay(sa, name);
      for (const m of marketsWith(s, key)) {
        const r = m.buyable ? { days: 0 } : route(m.id);
        if (!r) continue;
        const where = s.places[m.id].name;
        const text = m.buyable ? '此地货架有' + name + '，' + m.price + ' 符钱' : where + (m.sure ? '常备' : '今年有') + name + '，约 ' + m.price + ' 符钱，路上 ' + r.days + ' 天';
        if (stone >= m.price) add({ days: r.days, text, step: m.buyable ? { buy: key } : { goto: m.id } });
        else add(short(m.price, text, r.days));
      }
      const coming = s.player.orders.find((o) => o.item === key);
      if (coming) { add({ days: Math.max(0, coming.due - s.t), text: '托人代寻的' + name + '约 ' + FX.T.fmt(coming.due) + ' 送到，先修炼等着', step: null, wait: true }); continue; }
      const od = !tech && L.find((a) => a.type === 'order' && a.item === key);
      const ob = od && FX.Act.orderable(s).find((x) => x.item === key);
      if (od && ob) {
        const text = '在' + s.places[here].name + '托人代寻' + name + '，' + od.cost + ' 符钱，约 ' + FX.T.dur(ob.days) + '后一定送到';
        if (od.ok) add({ days: ob.days, text, step: { act: od } });
        else if (stone < od.cost) add(short(od.cost, text, ob.days));
      }
    }
    // 练炁术、开府真法：拜入宗门，长老房白给
    if (need.tech && !p.factionId) {
      for (const g of Object.values(s.factions)) {
        if (g.type !== 'sect' || !S().def(g).join) continue;
        const e = S().library(g).find((x) => need.keys.includes('tech:' + x.tech) && !x.merit && (x.minMajor || 0) <= Math.max(p.realm.major, 1));
        if (!e) continue;
        const can = S().canJoin(s, g), j = S().def(g).join;
        const away = can === S().awayReason(s, g);
        if (can !== true && !away && !/今年已求过/.test(can) && !(need.soon && p.realm.major < j.minMajor && j.minMajor <= 1)) continue;
        const r = route(g.seatId);
        if (!r) continue;
        const ch = S().joinChance(s, g).chance;
        const text = '求入' + g.name + '（' + s.places[g.seatId].name + (r.days ? '，路上 ' + r.days + ' 天' : '') + '，成功率 ' + ch + '%，不成明年再求，每回 +10%' + (p.realm.major < j.minMajor ? '，' + C().realms.names[j.minMajor] + '以后才收' : '') + '），长老房白给《' + C().techniques[e.tech].name + '》，另有俸禄' + (j.maxAge ? '；年过 ' + j.maxAge + ' 不收' : '');
        const act = can === true && L.find((a) => a.type === 'join' && a.fid === g.id);
        const wait = can !== true && !away; // 今年求过了，或境界还没到：先修炼
        add({ days: r.days + Math.round((100 / Math.max(5, ch) - 1) * 360), text: text + (wait && r.days === 0 && /今年已求过/.test(can) ? '。今年求过了，明年再来' : ''), step: act ? { act } : wait && r.days === 0 ? null : { goto: g.seatId }, join: true, wait: !act && wait && r.days === 0 });
      }
    }
    ways.sort((a, b) => a.days - b.days || (a.earn ? 1 : 0) - (b.earn ? 1 : 0));
    return ways;
  };

  // 眼下最要紧的一件：第一样缺的东西、和它的几条路
  Guide.next = (s) => {
    const need = Guide.needs(s)[0];
    if (!need) return null;
    const ways = Guide.ways(s, need);
    return { need, ways, best: ways[0] || null };
  };

  FX.Guide = Guide;
})(typeof globalThis !== 'undefined' ? globalThis : this);
