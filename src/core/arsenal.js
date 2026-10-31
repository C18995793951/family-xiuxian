/* ============================================================
 * arsenal —— 法器与道术、神通
 * 照《仙业》：
 *  · 祭器法首重炼形，其次禁制。炼形一次、十道禁制是下品符器，再炼形一次又能打入十道，以此类推；
 *    上品符器之上是法器（生出真识，有器灵），再往上是道器。粗胚的材质决定能炼形几次。
 *  · 正统仙道里道术分下、中、上三乘，道术之上才是神通；金丹真人的法力才撑得起神通。
 *    道术要参习，分入门、小成、中成、大成。
 * 主角和 NPC 用同一套算法：p.gear 是随身法器，p.arts 是各门道术已参习的天数。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;
  const Sim = () => FX.Sim;
  const T = () => FX.T;
  const W = () => FX.World;

  const Ars = {};
  const GC = () => C().gear;
  const AC = () => C().arts;
  const TQ = (k) => C().techniques[k];
  const me = (s) => P().player(s);
  const SLOTS = ['atk', 'def', 'dun'];

  /* ---------- 法器 ---------- */
  Ars.gradeName = (g) => GC().gradeNames[g.grade];
  const lingOf = (g) => (g.ling === undefined ? 100 : g.ling);
  const lingF = (g) => (g.grade >= 4 ? 0.3 + (0.7 * lingOf(g)) / 100 : 1);
  // 按禁制多少在本品与上一品之间折算
  const interp = (tbl, g) => {
    const lo = tbl[g.grade - 1], hi = tbl[g.grade];
    return lo + (hi - lo) * U.clamp((g.jin - 10 * (g.grade - 1)) / 10, 0, 1);
  };
  // key：atk/def 是倍数，defHurt/dunFlee/dunTravel 是加成
  Ars.gearVal = (g, key) => {
    const v = interp(GC()[key], g);
    return key === 'atk' || key === 'def' ? 1 + (v - 1) * lingF(g) : v * lingF(g);
  };
  const slotKey = { atk: 'atk', def: 'def', dun: 'dunFlee' };
  // 持有人境界不够时，法器、道器只发挥得出几成（金丹才使得顺法器，纯阳以上才掌控得了道器）
  Ars.useF = (p, g) => (g.grade >= 7 ? (p.realm.major >= 9 ? 1 : GC().underUse) : g.grade >= 4 ? (p.realm.major >= 6 ? 1 : GC().underUse) : 1);
  Ars.gearValFor = (p, g, key) => { const v = Ars.gearVal(g, key), f = Ars.useF(p, g); return key === 'atk' || key === 'def' ? 1 + (v - 1) * f : v * f; };
  Ars.best = (p, slot) => {
    let best = null, bv = -1;
    for (const g of p.gear || []) if (g.slot === slot) { const v = Ars.gearValFor(p, g, slotKey[slot]); if (v > bv) { bv = v; best = g; } }
    return best;
  };
  Ars.title = (g) => g.name + '（' + Ars.gradeName(g) + ' · ' + g.jin + ' 道禁制' + (g.grade >= 4 && lingOf(g) < 100 ? ' · 器灵炼化 ' + Math.floor(lingOf(g)) + '%' : '') + '）';
  Ars.value = (g) => Math.round(interp(GC().value, g));
  Ars.make = (s, spec) => {
    s.player.gearSeq = (s.player.gearSeq || 0) + 1;
    return { id: 'g' + s.player.gearSeq, name: spec.name, slot: spec.slot, grade: spec.grade, jin: spec.jin, cap: spec.cap || spec.grade, ling: spec.ling === undefined ? 100 : spec.ling };
  };

  /* ---------- 道术、神通 ---------- */
  Ars.isArt = (k) => !!TQ(k) && TQ(k).kind === 'shu';
  // 进境：-1 没有玉简；0 未入门；1 入门 … 4 大成
  Ars.level = (p, k) => {
    const xp = (p.arts || {})[k];
    if (xp === undefined) return 0;
    const th = AC().xp[TQ(k).rank];
    let lv = 0;
    while (lv < 4 && xp >= th[lv]) lv++;
    return lv;
  };
  Ars.levelName = (lv) => AC().levelNames[lv];
  // 一门道术在某一项上的效果（神通要金丹法力才使得出）
  Ars.artVal = (p, k, key) => {
    const t = TQ(k), lv = Ars.level(p, k);
    if (!lv || p.realm.major < t.minMajor) return 0;
    if (t.rank >= 4 && p.realm.major < 6) return 0;
    return AC()[key][t.rank] * AC().levelFrac[lv];
  };
  const ARTKEY = { atk: 'atk', def: 'def', defHurt: 'def', dunFlee: 'dun', dunTravel: 'dun' };
  Ars.bestArt = (p, key) => {
    let best = null, bv = 0;
    for (const k in p.arts || {}) {
      if (!Ars.isArt(k) || !TQ(k).type.includes(ARTKEY[key])) continue;
      const v = Ars.artVal(p, k, key);
      if (v > bv) { bv = v; best = k; }
    }
    return best ? { k: best, v: bv } : null;
  };
  Ars.artLabel = (p, k) => C().shuRankNames[TQ(k).rank] + '《' + TQ(k).name + '》' + Ars.levelName(Ars.level(p, k));

  /* ---------- 汇总到斗法、逃遁、赶路、修炼 ---------- */
  Ars.powerFactors = (s, p) => {
    const F = [];
    for (const slot of ['atk', 'def']) {
      const g = Ars.best(p, slot);
      if (g) { const v = Ars.gearValFor(p, g, slot); if (v > 1) F.push({ label: GC().slotNames[slot] + ' ' + Ars.title(g) + (Ars.useF(p, g) < 1 ? '（境界不够，驱策吃力）' : ''), value: U.round1(v * 100) / 100 }); }
      const a = Ars.bestArt(p, slot);
      if (a) F.push({ label: Ars.artLabel(p, a.k), value: U.round1((1 + a.v) * 100) / 100 });
    }
    return F;
  };
  const both = (a, b) => 1 - (1 - a) * (1 - b);
  // 落败时重伤、身死的机会减去几成
  Ars.hurtCut = (s, p) => {
    const g = Ars.best(p, 'def'), a = Ars.bestArt(p, 'defHurt');
    return Math.min(0.85, both(g ? Ars.gearValFor(p, g, 'defHurt') : 0, a ? a.v : 0));
  };
  Ars.fleeParts = (s, p) => {
    const parts = [];
    const g = Ars.best(p, 'dun'), a = Ars.bestArt(p, 'dunFlee');
    if (g) parts.push({ label: g.name, value: Math.round(Ars.gearValFor(p, g, 'dunFlee')) });
    if (a) parts.push({ label: '《' + TQ(a.k).name + '》', value: Math.round(a.v) });
    return parts;
  };
  Ars.travelCut = (s, p) => {
    const g = Ars.best(p, 'dun'), a = Ars.bestArt(p, 'dunTravel');
    return Math.min(0.7, both(g ? Ars.gearValFor(p, g, 'dunTravel') : 0, a ? a.v : 0));
  };
  Ars.travelDays = (s, p, days) => Math.max(1, Math.round(days * (1 - Ars.travelCut(s, p))));
  // 辅助修行的道术：修炼速度倍数
  Ars.cultFactor = (s, p) => {
    let best = null;
    for (const k in p.arts || {}) {
      const t = TQ(k);
      if (!t || !t.xiu || !t.xiu.cult || !t.xiu.cult.majors.includes(p.realm.major)) continue;
      const lv = Ars.level(p, k);
      const v = 1 + t.xiu.cult.mult * AC().levelFrac[lv];
      if (lv && (!best || v > best.value)) best = { label: '《' + t.name + '》' + Ars.levelName(lv), value: U.round1(v * 100) / 100 };
    }
    return best;
  };
  // 辅助修行的道术：冲某一关的成功率加成
  Ars.breakPart = (s, p, kind) => {
    let best = null;
    for (const k in p.arts || {}) {
      const t = TQ(k);
      if (!t || !t.xiu || !t.xiu.brk || !t.xiu.brk[kind]) continue;
      const lv = Ars.level(p, k);
      const v = Math.round(t.xiu.brk[kind] * AC().levelFrac[lv]);
      if (v > 0 && (!best || v > best.value)) best = { label: '《' + t.name + '》' + Ars.levelName(lv), value: v };
    }
    return best;
  };

  /* ---------- 收拾行囊：符器、法器到手就收进法器一栏；合卷的神通接上原来的进境 ---------- */
  Ars.sync = (s) => {
    const p = me(s);
    if (!p) return;
    p.gear = p.gear || [];
    p.arts = p.arts || {};
    const inv = s.player.inv;
    for (const k of Object.keys(inv)) {
      const it = C().items[k];
      if (!it || !it.gear || !(inv[k] > 0)) continue;
      for (let i = 0; i < inv[k]; i++) p.gear.push(Ars.make(s, it.gear));
      delete inv[k];
    }
    for (const k of s.player.manuals) {
      const t = TQ(k);
      if (!t || t.kind !== 'shu' || !t.merge || p.arts[k] !== undefined || p.arts[t.merge] === undefined) continue;
      const lv = Ars.level(p, t.merge);
      p.arts[k] = lv > 0 ? AC().xp[t.rank][lv - 1] : 0;
    }
  };

  /* ---------- 行动清单 ---------- */
  const majorName = (m) => C().realms.names[m];
  Ars.list = (s, add) => {
    const p = me(s), cf = C(), inv = s.player.inv;
    p.gear = p.gear || [];
    p.arts = p.arts || {};
    // 参习道术、神通
    for (const k of s.player.manuals) {
      const t = TQ(k);
      if (!t || t.kind !== 'shu') continue;
      const lv = Ars.level(p, k);
      if (lv >= 4) continue;
      const started = p.arts[k] !== undefined;
      const why = p.realm.major < t.minMajor ? '要到' + majorName(t.minMajor) + '才练得动'
        : t.need && !started && !(inv[t.need] > 0) ? '入门要一块' + cf.items[t.need].name + '作引子'
        : t.needQi && !started && p.techniqueId !== t.needQi ? '要以' + cf.techniques[t.needQi].qi + '为根基才修得成'
        : p.health.state === 'heavy' ? '重伤未愈' : '';
      for (const d of AC().practiceDays) add({ type: 'practice', tech: k, days: d, label: '参习《' + t.name + '》' + T().dur(d), group: '道术', ok: !why, reason: why });
    }
    // 法器：祭炼禁制、炼形、炼化器灵、熔宝材重铸、卖掉
    const G = GC();
    const market = W().hasMarket(s, p.locationId);
    for (const g of p.gear) {
      const room = 10 * g.grade - g.jin;
      if (room > 0) {
        for (const n of [1, 5, 10, room].filter((x, i, arr) => x <= room && arr.indexOf(x) === i)) {
          const cost = Math.round(n * G.jinCost[g.grade] * Ars.costMult(s)), days = n * G.jinDays[g.grade];
          const why = p.realm.major < G.minMajor[g.grade] ? '要到' + majorName(G.minMajor[g.grade]) + '才祭炼得动' + G.gradeNames[g.grade] : s.player.stone < cost ? '符钱不够（需 ' + cost + '）' : '';
          add({ type: 'jilian', gid: g.id, n, days, cost, label: '给' + g.name + '祭炼 ' + n + ' 道禁制（' + cost + ' 符钱，' + T().dur(days) + '）', group: '法器', ok: !why, reason: why });
        }
      } else if (g.grade < G.maxGrade) {
        const ng = g.grade + 1, cost = Math.round(G.lianCost[ng] * Ars.costMult(s));
        const why = g.grade >= g.cap ? '粗胚材质到头了，要熔进宝材重铸' : p.realm.major < G.minMajor[ng] ? '要到' + majorName(G.minMajor[ng]) + '才炼形得了' + G.gradeNames[ng] : s.player.stone < cost ? '符钱不够（需 ' + cost + '）' : '';
        add({ type: 'lianxing', gid: g.id, days: G.lianDays[ng], cost, label: '把' + g.name + '炼形为' + G.gradeNames[ng] + '（' + cost + ' 符钱，' + T().dur(G.lianDays[ng]) + '）', group: '法器', ok: !why, reason: why });
      }
      if (g.grade >= 4 && lingOf(g) < 100) {
        for (const d of [90, 360]) add({ type: 'lianhua', gid: g.id, days: d, label: '炼化' + g.name + '的器灵 ' + T().dur(d), group: '法器', ok: p.realm.major >= 3, reason: p.realm.major >= 3 ? '' : '筑基以后才炼化得动法器' });
      }
      for (const mat in G.matCap) {
        if (!(inv[mat] > 0)) continue;
        const top = mat === 'lingtian' ? G.maxGrade : G.capMax;
        if (g.cap >= top) continue;
        add({ type: 'chongzhu', gid: g.id, item: mat, days: 30, label: '把' + cf.items[mat].name + '熔进' + g.name + '重铸（材质上限到' + G.gradeNames[Math.min(top, mat === 'lingtian' ? top : g.cap + G.matCap[mat])] + '）', group: '法器' });
      }
      if (market) add({ type: 'sell_gear', gid: g.id, days: 0, gain: Math.round(Ars.value(g) * G.sellRatio), label: '卖掉' + g.name + '（' + Math.round(Ars.value(g) * G.sellRatio) + ' 符钱）', group: '法器' });
    }
  };

  /* ---------- 结算 ---------- */
  const DO = {};
  const gearOf = (s, id) => (me(s).gear || []).find((g) => g.id === id);

  // 参习：资质高的快；境界高出这门道术一档，参习也快些
  Ars.practiceRate = (p, k, s) => {
    const t = TQ(k);
    const lu = s ? FX.Sect.perkOf(s, p, 'daolu') : 0; // 道录殿收藏典籍，参习快些
    return (0.6 + p.aptitude / 100) * (1 + 0.25 * Math.max(0, p.realm.major - AC().rankBase[t.rank])) * (lu ? 1.2 + 0.1 * lu : 1);
  };
  // 灵宝殿专擅打造法宝：祭炼、炼形少花符钱
  Ars.costMult = (s) => { const k = FX.Sect.perkOf(s, me(s), 'lingbao'); return k ? 0.8 - 0.1 * k : 1; };
  DO.practice = (s, a) => {
    const p = me(s), t = TQ(a.tech);
    if (t.need && p.arts[a.tech] === undefined) { s.player.inv[t.need]--; p.arts[a.tech] = 0; }
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    const before = Ars.level(p, a.tech);
    p.arts[a.tech] = (p.arts[a.tech] || 0) + r.used * Ars.practiceRate(p, a.tech, s);
    const after = Ars.level(p, a.tech);
    const up = after > before;
    const state = up ? '修至' + Ars.levelName(after) : after >= 4 ? '已到大成' : '离' + Ars.levelName(after + 1) + '还差些火候';
    H().add(s, { type: 'learn', tags: ['道术'], actors: [p.id], key: up ? 'art_up' : 'practice', pov: true, severity: up ? 2 : 1, params: { name: p.name, tech: t.name, dur: T().dur(r.used), state, rank: C().shuRankNames[t.rank] } });
    return { text: '参习《' + t.name + '》' + T().dur(r.used) + '，' + state, interrupted: r.interrupted };
  };

  DO.jilian = (s, a) => {
    const p = me(s), g = gearOf(s, a.gid), G = GC();
    s.player.stone -= a.cost;
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    const done = Math.min(a.n, Math.floor(r.used / G.jinDays[g.grade] + 1e-9));
    if (done < a.n) s.player.stone += Math.round((a.n - done) * (a.cost / a.n)); // 没祭完的退回
    g.jin += done;
    H().add(s, { type: 'item', tags: ['法器'], actors: [p.id], key: 'jilian', pov: true, severity: 1, params: { name: p.name, gear: g.name, n: done, title: Ars.title(g) } });
    return { text: '给' + g.name + '打入 ' + done + ' 道禁制，如今是' + Ars.title(g), interrupted: r.interrupted };
  };

  DO.lianxing = (s, a) => {
    const p = me(s), g = gearOf(s, a.gid);
    s.player.stone -= a.cost;
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    if (r.used < a.days) { s.player.stone += a.cost; return { text: '炼形到一半出了变故，只得停手（符钱没耗掉）', interrupted: true }; }
    g.grade++;
    let extra = '';
    // 以本命精血和法力祭成法器，器灵初生就认你为主
    if (g.grade === 4) { g.ling = 100; extra = '，器中孕出真识，生了器灵'; }
    H().add(s, { type: 'item', tags: ['法器'], actors: [p.id], key: 'lianxing', pov: true, severity: g.grade >= 4 ? 4 : 2, params: { name: p.name, gear: g.name, grade: Ars.gradeName(g), extra } });
    return { text: g.name + '炼形为' + Ars.gradeName(g) + extra + '，可以接着打入禁制' };
  };

  DO.lianhua = (s, a) => {
    const p = me(s), g = gearOf(s, a.gid), G = GC();
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    const speed = p.realm.major >= 6 ? 1 + 0.5 * (p.realm.major - 6) : 0.25;
    g.ling = Math.min(100, lingOf(g) + (r.used / G.lingDays[g.grade]) * 100 * speed);
    const done = g.ling >= 100;
    H().add(s, { type: 'item', tags: ['法器'], actors: [p.id], key: done ? 'lianhua_done' : 'lianhua', pov: true, severity: done ? 3 : 1, params: { name: p.name, gear: g.name, ling: Math.floor(g.ling) } });
    return { text: done ? g.name + '的器灵认你为主了' : '炼化' + g.name + '的器灵，到了 ' + Math.floor(g.ling) + '%', interrupted: r.interrupted };
  };

  DO.chongzhu = (s, a) => {
    const p = me(s), g = gearOf(s, a.gid), G = GC();
    s.player.inv[a.item]--;
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    g.cap = a.item === 'lingtian' ? G.maxGrade : Math.min(G.capMax, g.cap + G.matCap[a.item]);
    H().add(s, { type: 'item', tags: ['法器'], actors: [p.id], key: 'chongzhu', pov: true, severity: 2, params: { name: p.name, gear: g.name, item: C().items[a.item].name, cap: G.gradeNames[g.cap] } });
    return { text: '熔进' + C().items[a.item].name + '，' + g.name + '的材质够炼形到' + G.gradeNames[g.cap] + '了', interrupted: r.interrupted };
  };

  DO.sell_gear = (s, a) => {
    const p = me(s), g = gearOf(s, a.gid);
    p.gear = p.gear.filter((x) => x.id !== g.id);
    s.player.stone += a.gain;
    H().add(s, { type: 'trade', tags: ['坊市'], actors: [p.id], places: [p.locationId], key: 'sell_gear', pov: true, severity: 1, params: { name: p.name, gear: Ars.title(g), gain: a.gain } });
    return { text: '卖掉' + g.name + '，得符钱 ' + a.gain };
  };
  Ars.DO = DO;

  /* ---------- 斗法缴获：打退的人身上最好的一件法器 ---------- */
  Ars.loot = (s, foe) => {
    const p = me(s);
    if (!foe.gear || !foe.gear.length || !R.chance(s.rng, GC().lootChance)) return null;
    const g = foe.gear.slice().sort((x, y) => Ars.value(y) - Ars.value(x))[0];
    foe.gear = foe.gear.filter((x) => x !== g);
    const mine = Ars.make(s, g);
    if (mine.grade >= 4) mine.ling = 0; // 器灵不认新主，要慢慢炼化
    p.gear.push(mine);
    return Ars.title(mine);
  };

  /* ---------- NPC 的随身法器与道术：按境界、出身配齐，境界升了就补上 ---------- */
  // 每个大境界：各类法器 [有的机会, 最低品, 最高品]
  const NPC_GEAR = {
    2: { atk: [0.5, 1, 1] },
    3: { atk: [0.8, 1, 2], def: [0.4, 1, 1] },
    4: { atk: [0.9, 2, 2], def: [0.6, 1, 2], dun: [0.3, 1, 2] },
    5: { atk: [1, 2, 3], def: [0.8, 2, 2], dun: [0.6, 2, 2] },
    6: { atk: [1, 3, 3], def: [0.9, 2, 3], dun: [0.8, 2, 3] },
    7: { atk: [1, 4, 5], def: [1, 3, 4], dun: [1, 3, 4] },
    8: { atk: [1, 5, 6], def: [1, 4, 5], dun: [1, 4, 5] },
    9: { atk: [1, 5, 6], def: [1, 5, 6], dun: [1, 5, 6] },
    10: { atk: [1, 6, 7], def: [1, 6, 7], dun: [1, 6, 7] },
    11: { atk: [1, 7, 7], def: [1, 7, 7], dun: [1, 7, 7] },
  };
  // 每个大境界：[有道术的机会, 寻常道术最高 rank, 大派门人最高 rank, 进境下限, 进境上限]
  const NPC_ART = { 1: [0.3, 1, 1, 1, 2], 2: [0.6, 1, 2, 1, 3], 3: [0.7, 2, 2, 1, 3], 4: [0.8, 2, 3, 1, 3], 5: [0.9, 3, 3, 1, 4], 6: [1, 3, 4, 2, 4], 7: [1, 3, 5, 2, 4], 8: [1, 3, 5, 3, 4], 9: [1, 3, 5, 3, 4], 10: [1, 3, 5, 4, 4], 11: [1, 3, 5, 4, 4] };
  const libArts = (f) => {
    const d = f && f.key && C().factionDefs.find((x) => x.key === f.key);
    return d && d.library ? d.library.map((e) => e.tech).filter(Ars.isArt) : [];
  };
  const sectOnly = () => {
    const set = {};
    for (const d of C().factionDefs) if (d.tier >= 3 && d.library) for (const e of d.library) if (Ars.isArt(e.tech)) set[e.tech] = 1;
    return set;
  };
  Ars.npcKit = (s, p) => {
    const r = s.rng, m = p.realm.major;
    p.gear = p.gear || [];
    p.arts = p.arts || {};
    const f = p.factionId ? s.factions[p.factionId] : null;
    const big = !!(f && f.tier >= 3);
    const gt = NPC_GEAR[m];
    if (gt) for (const slot of SLOTS) {
      const row = gt[slot];
      if (!row || !R.chance(r, row[0])) continue;
      let grade = R.int(r, row[1], row[2]);
      if (big && (m === 5 || m === 6) && slot === 'atk' && R.chance(r, 0.5)) grade++;
      const cur = Ars.best(p, slot);
      if (cur && cur.grade >= grade) continue;
      p.gear = p.gear.filter((g) => g.slot !== slot);
      p.gear.push({ id: 'n' + slot, name: R.pick(r, GC().names[slot]), slot, grade, jin: 10 * (grade - 1) + R.int(r, 3, 10), cap: grade, ling: 100 });
    }
    const at = NPC_ART[m];
    if (!at || !R.chance(r, at[0])) return;
    const only = sectOnly(), lib = libArts(f);
    const top = big ? at[2] : at[1];
    const pool = Object.keys(C().techniques).filter((k) => {
      const t = TQ(k);
      if (t.kind !== 'shu' || t.minMajor > m || t.merge || t.need || (t.needQi && p.techniqueId !== t.needQi)) return false;
      if (only[k]) return big && lib.includes(k) && t.rank <= top;
      return t.rank <= Math.min(top, 3);
    });
    if (!pool.length) return;
    const bestRank = Math.max.apply(null, pool.map((k) => TQ(k).rank));
    const pickFrom = (list) => (list.length ? R.pick(r, list) : null);
    // 一门攻伐的（尽量取最高一乘），一半的人另有一门护身或遁法
    const atk = pickFrom(pool.filter((k) => TQ(k).type.includes('atk') && TQ(k).rank >= bestRank - 1));
    const other = R.chance(r, 0.5) ? pickFrom(pool.filter((k) => !TQ(k).type.includes('atk') && !TQ(k).type.includes('xiu'))) : null;
    for (const k of [atk, other]) {
      if (!k || p.arts[k] !== undefined) continue;
      const lv = R.int(r, at[3], at[4]);
      p.arts[k] = AC().xp[TQ(k).rank][lv - 1];
    }
  };

  FX.Ars = Ars;
})(typeof globalThis !== 'undefined' ? globalThis : this);
