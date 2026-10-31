/* ============================================================
 * saga —— 天下大事与后期玩法：地渊开启、花神府撷芳宴、玉宸派道脉校考、仇家寻仇、洞府
 * 大事的日期开局就由种子排好，提前几年放出风声（写进纪事），玩家可以预先准备。
 * 成败照旧由规则掷骰；但每件大事都给出稳妥的选项，运气只决定得多得少。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;
  const T = () => FX.T;
  const W = () => FX.World;
  const CU = () => FX.CU;
  const Sim = () => FX.Sim;
  const Sect = () => FX.Sect;
  const Cb = () => FX.Combat;

  const Saga = {};
  const SG = () => C().saga;
  const KINDS = ['diyuan', 'xiefang', 'jiaokao'];
  const me = (s) => P().player(s);
  const pl = (s) => P().player(s);
  const give = (s, k, n) => { s.player.inv[k] = (s.player.inv[k] || 0) + n; };
  const giveAny = (s, key) => {
    if (key.startsWith('tech:')) { const t = key.slice(5); if (!s.player.manuals.includes(t)) s.player.manuals.push(t); return W().itemName(key); }
    give(s, key, 1);
    return C().items[key].name;
  };
  const factionByKey = (s, key) => Object.values(s.factions).find((f) => f.key === key) || null;
  const placeByName = (s, name) => Object.values(s.places).find((x) => x.name === name) || null;

  /* ---------- 排期 ---------- */
  Saga.init = (s) => {
    s.saga = {};
    for (const k of KINDS) s.saga[k] = { next: s.year + R.int(s.rng, SG()[k].first[0], SG()[k].first[1]), open: null, done: null, count: 0 };
  };

  // 本次大事正在进行（返回开始的年份），否则 null
  Saga.openYear = (s, k) => (s.saga[k].open && s.year <= s.saga[k].open.until ? s.saga[k].open.from : null);

  Saga.yearly = (s) => {
    const n = SG().notice;
    for (const k of KINDS) {
      const st = s.saga[k], cfg = SG()[k];
      if (st.open && s.year > st.open.until) {
        if (k === 'diyuan') Saga.diyuanToll(s);
        st.open = null;
        st.next = s.year + R.int(s.rng, cfg.every[0], cfg.every[1]);
      }
      if (st.open) continue;
      if (s.year === st.next - n) H().add(s, { type: 'saga', tags: ['大事', '风声'], key: 'saga_notice', pov: true, severity: 3, params: { what: cfg.name, year: st.next, hint: Saga.hint(s, k) } });
      if (s.year >= st.next) {
        st.open = { from: s.year, until: s.year + cfg.years - 1 };
        st.count++;
        H().add(s, { type: 'saga', tags: ['大事'], key: 'saga_open_' + k, pov: true, severity: 4, params: { what: cfg.name, hint: Saga.hint(s, k) } });
      }
    }
    Saga.revengeYear(s);
    Sect().tuijuYear(s);
  };

  // 每件大事对玩家的提示：去哪、要什么条件
  Saga.hint = (s, k) => {
    const cfg = SG()[k];
    if (k === 'diyuan') { const pl2 = placeByName(s, cfg.place); return '到' + (pl2 ? pl2.name : cfg.place) + '去，练炁以上都能进'; }
    if (k === 'xiefang') { const f = factionByKey(s, cfg.faction); return '无门无派、练炁以上的散修可到' + (f ? s.places[f.seatId].name : '花神府') + '赴宴，要交供奉'; }
    const f = factionByKey(s, cfg.faction);
    return (f ? f.name : '玄真派') + '弟子回' + (f ? s.places[f.seatId].name : '山门') + '应考，按同辈排名评上、中、下考';
  };

  // 天下大事一览（界面用）：正在进行的、有了风声的；道脉校考三十年一回，人人知道日子
  Saga.view = (s) => KINDS.map((k) => {
    const st = s.saga[k], cfg = SG()[k];
    const open = Saga.openYear(s, k) !== null;
    const known = open || k === 'jiaokao' || st.next - s.year <= SG().notice;
    return { kind: k, name: cfg.name, open, known, year: open ? st.open.from : st.next, until: open ? st.open.until : null, done: open && st.done === st.open.from, hint: Saga.hint(s, k) };
  });

  /* ---------- 行动清单（由 Act.list 调用）---------- */
  Saga.list = (s, add) => {
    const p = me(s), place = s.places[p.locationId], cf = C();
    // 地渊
    const dy = SG().diyuan;
    if (Saga.openYear(s, 'diyuan') !== null && place.name === dy.place) {
      const done = s.saga.diyuan.done === s.saga.diyuan.open.from;
      const why = done ? '这回地渊开启已经进去过了' : p.realm.major < dy.minMajor ? '练炁以上才进得去' : p.health.state === 'heavy' ? '重伤未愈' : '';
      add({ type: 'diyuan', days: dy.days, label: '深入地渊 ' + T().dur(dy.days), group: '大事', ok: !why, reason: why });
    }
    // 撷芳宴
    const xf = SG().xiefang;
    const hs = factionByKey(s, xf.faction);
    if (hs && Saga.openYear(s, 'xiefang') !== null && place.id === hs.seatId && !p.factionId) {
      const fee = Saga.xiefangFee(p);
      const done = s.saga.xiefang.done === s.saga.xiefang.open.from;
      const why = done ? '这回撷芳宴你已经赴过了' : p.realm.major < xf.minMajor ? '练炁以上才收' : p.health.state !== 'healthy' ? '带伤赴宴是送死' : s.player.stone < fee ? '供奉不够（需 ' + fee + ' 符钱）' : '';
      add({ type: 'xiefang', days: xf.days, cost: fee, label: '赴撷芳宴（供奉 ' + fee + ' 符钱，连斗 ' + xf.rounds + ' 场）', group: '大事', ok: !why, reason: why });
    }
    // 道脉校考
    const jk = SG().jiaokao;
    const xz = factionByKey(s, jk.faction);
    if (xz && Saga.openYear(s, 'jiaokao') !== null && p.factionId === xz.id) {
      const done = s.saga.jiaokao.done === s.saga.jiaokao.open.from;
      const why = done ? '这回校考已经应过了' : place.id !== xz.seatId ? '要回到' + s.places[xz.seatId].name + '应考' : '';
      add({ type: 'jiaokao', days: jk.days, label: '应道脉校考（预计' + Saga.grade(s).name + '）', group: '大事', ok: !why, reason: why });
    }
    // 洞府
    const D = cf.dongfu;
    if ((place.type === 'wild' || place.type === 'danger') && place.qi >= D.minQi && s.player.dongfu !== place.id) {
      const cost = D.cost[place.qi];
      const why = p.realm.major < D.minMajor ? '筑基以后才开得了洞府' : s.player.stone < cost ? '符钱不够（需 ' + cost + '）' : '';
      add({ type: 'dongfu', days: 30, cost, label: (s.player.dongfu ? '把洞府迁到此地（' : '在此开辟洞府（') + cost + ' 符钱）', group: '修炼', ok: !why, reason: why });
    }
  };

  /* ---------- 地渊 ---------- */
  const DIYUAN_FOES = [['阴马', '行尸'], ['金纹豹妖', '恶嗔阴魔'], ['下位天魔', '朱厌大妖']];
  Saga.DO = {};
  Saga.DO.diyuan = (s, a) => {
    const p = me(s), dy = SG().diyuan;
    s.player.stats.sagas = (s.player.stats.sagas || 0) + 1;
    s.saga.diyuan.done = s.saga.diyuan.open.from; // 先记下：进去的这一趟可能跨年，地渊合上也算这回去过
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    if (r.interrupted || s.pending.length) return { text: '还没进去就出了变故', interrupted: true };
    const my = P().power(s, p);
    const pick = (i) => R.pick(s.rng, DIYUAN_FOES[i]);
    const xz = factionByKey(s, 'xuanzhen');
    const fuzhao = xz && p.factionId === xz.id ? Sect().taskMerit(p) : 0;
    FX.Ev.spawn(s, 'DIYUAN', {
      place: p.locationId, _fuzhao: fuzhao,
      _midBeast: pick(Math.min(2, Math.max(0, p.realm.major - 2))), _midPower: Math.round(my * R.range(s.rng, dy.midSwing[0], dy.midSwing[1]) * 10) / 10,
      _deepBeast: pick(Math.min(2, Math.max(0, p.realm.major - 1))), _deepPower: Math.round(my * R.range(s.rng, dy.deepSwing[0], dy.deepSwing[1]) * 10) / 10,
    }, []);
    return { text: '下到地渊里头', interrupted: true };
  };
  // 地渊合上时，进去的人里总有几个没出来
  Saga.diyuanToll = (s) => {
    const dy = SG().diyuan;
    const pool = P().living(s).filter((q) => !P().isPlayer(s, q) && q.realm.major >= 2 && q.realm.major <= 3).sort((a, b) => (a.id < b.id ? -1 : 1));
    const n = R.int(s.rng, dy.npcDeaths[0], dy.npcDeaths[1]);
    for (let i = 0; i < n && pool.length; i++) {
      const q = pool.splice(R.int(s.rng, 0, pool.length - 1), 1)[0];
      P().kill(s, q, '殒于地渊', [], {});
    }
  };
  // 越深所得越好；打赢就一定有，按境界给用得上的
  const deepGift = (p) => (p.realm.major >= 5 ? 'ningdan' : p.realm.major >= 4 ? 'yusui' : 'danmusha');
  const meritFor = (s, b, layer) => { const m = b._fuzhao * SG().diyuan.merit[layer]; if (m) s.player.merit += m; return m ? '，地渊符诏记' + C().house.meritName + ' ' + m : ''; };
  const layerFoe = (layer) => (s, b) => ({
    name: b[layer === 'deep' ? '_deepBeast' : '_midBeast'], power: b[layer === 'deep' ? '_deepPower' : '_midPower'],
    winText: layer === 'deep' ? '斩了它，取深处的大药' : '斩了它，取中层的五行之精',
    onWin(s2, b2) {
      const p = pl(s2);
      const got = [];
      if (layer === 'deep') { got.push(giveAny(s2, deepGift(p))); give(s2, 'wujing', 2); got.push(C().items.wujing.name + '×2'); }
      else { give(s2, 'wujing', 1); give(s2, 'rareHerb', 2); got.push(C().items.wujing.name, C().items.rareHerb.name + '×2'); }
      return '得' + got.join('、') + meritFor(s2, b2, layer);
    },
  });
  const layerOpt = (layer, label) => Object.assign({}, Cb().fightOpt(layerFoe(layer)), {
    id: layer, label,
    outcome: (s, b) => (layer === 'deep' ? '打赢可得' + C().items[deepGift(pl(s))].name + '与先天五行之精×2' : '打赢可得先天五行之精、人面芝×2') + (b._fuzhao ? '，并记道功' : ''),
  });

  /* ---------- 撷芳宴 ---------- */
  Saga.xiefangFee = (p) => SG().xiefang.fee.base + P().realmRank(p) * SG().xiefang.fee.perRank;
  Saga.DO.xiefang = (s, a) => {
    const p = me(s);
    s.player.stone -= a.cost;
    s.player.stats.sagas = (s.player.stats.sagas || 0) + 1;
    s.saga.xiefang.done = s.saga.xiefang.open.from;
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    if (s.pending.length) return { text: '开宴前出了变故，供奉没退', interrupted: true };
    H().add(s, { type: 'saga', tags: ['大事', '撷芳宴'], actors: [p.id], places: [p.locationId], key: 'xiefang_enter', pov: true, severity: 3, params: { name: p.name, fee: a.cost } });
    Saga.xiefangRound(s, 1);
    return { text: '撷芳宴开席', interrupted: true, used: r.used };
  };
  Saga.xiefangRound = (s, round) => {
    const p = me(s), xf = SG().xiefang;
    const rank = U.clamp(P().realmRank(p) + R.int(s.rng, xf.foeRank[0], xf.foeRank[1]), 2, P().maxRank());
    const foe = W().spawnNpc(s, { realm: P().realmFromRank(rank), locationId: p.locationId, kind: 'loose' });
    FX.Ev.spawn(s, 'XIEFANG', { place: p.locationId, foe: foe.id, _round: round }, []);
  };
  const xiefangFoe = (s, b) => {
    const q = s.people[b.foe];
    return {
      name: q.name, power: P().power(s, q), winText: b._round < SG().xiefang.rounds ? '胜了这场，进下一场' : '胜下最后一场，拜入花神府',
      onWin(s2, b2) {
        const xf = SG().xiefang;
        if (R.chance(s2.rng, xf.loserDies)) P().kill(s2, q, '殒于撷芳宴', [], {}); else P().injure(s2, q, 'heavy');
        if (b2._round < xf.rounds) { Saga.xiefangRound(s2, b2._round + 1); return '第 ' + b2._round + ' 场胜了，还有 ' + (xf.rounds - b2._round) + ' 场'; }
        const p = pl(s2), f = factionByKey(s2, xf.faction);
        p.factionId = f.id; p.role = 'member';
        f.relToPlayer = Math.max(f.relToPlayer, 10);
        const hid = H().add(s2, { type: 'join', tags: ['宗门', '撷芳宴'], actors: [p.id], factions: [f.id], key: 'xiefang_win', pov: true, severity: 4, params: { name: p.name, faction: f.name } });
        H().markFirst(s2, 'join', hid);
        return '连胜 ' + xf.rounds + ' 场，拜入' + f.name;
      },
      onLose() {},
    };
  };

  /* ---------- 道脉校考 ---------- */
  // 按同辈排名评定（确定的，不掷骰）：同辈里修为最高为上考，不低于中位为中考，否则下考
  Saga.grade = (s) => {
    const p = me(s), jk = SG().jiaokao;
    const age = P().age(s, p), my = P().realmRank(p);
    const peers = P().living(s).filter((q) => q.id !== p.id && q.factionId === p.factionId && Math.abs(P().age(s, q) - age) <= jk.peerAge).map((q) => P().realmRank(q)).sort((a, b) => a - b);
    let g;
    if (!peers.length) g = p.realm.major >= 3 ? 3 : 2;
    else if (my >= peers[peers.length - 1]) g = 3;
    else if (my >= peers[Math.floor(peers.length / 2)]) g = 2;
    else g = 1;
    return { g, name: ['', '下考', '中考', '上考'][g], peers: peers.length };
  };
  Saga.DO.jiaokao = (s, a) => {
    const p = me(s), jk = SG().jiaokao, f = s.factions[p.factionId];
    s.player.stats.sagas = (s.player.stats.sagas || 0) + 1;
    s.saga.jiaokao.done = s.saga.jiaokao.open.from;
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    if (r.interrupted || s.pending.length) return { text: '应考前出了变故', interrupted: true };
    const gr = Saga.grade(s);
    const tm = Sect().taskMerit(p);
    let what;
    if (gr.g === 3) {
      const gift = jk.upperGift[p.realm.major];
      const giftName = gift && !(gift.startsWith('tech:') && s.player.manuals.includes(gift.slice(5))) ? giveAny(s, gift) : null;
      s.player.merit += tm * jk.upperMerit;
      // 荐入玉宸派听讲三年
      Sim().passDays(s, jk.tingjiangDays, 'other');
      if (!P().alive(p)) return { text: '' };
      const gain = Math.round(CU().addProgress(s, p, Math.min(P().need(p), 20000) * jk.tingjiangGain) * 10) / 10;
      what = '评为上考，由派主举荐入玉宸派听讲三年，修为 +' + gain + (giftName ? '，得玉宸派下赐' + giftName : '') + '，记' + C().house.meritName + ' ' + tm * jk.upperMerit;
    } else if (gr.g === 2) {
      s.player.merit += tm * jk.midMerit;
      give(s, 'qiju', jk.midQiju);
      what = '评为中考，记' + C().house.meritName + ' ' + tm * jk.midMerit + '，得' + C().items.qiju.name + '×' + jk.midQiju;
    } else what = '评为下考，同辈里修为落在后头，什么也没得';
    H().add(s, { type: 'saga', tags: ['大事', '校考'], actors: [p.id], factions: [f.id], key: 'jiaokao', pov: true, severity: gr.g === 3 ? 4 : 2, params: { name: p.name, what } });
    return { text: what };
  };

  /* ---------- 仇家寻仇 ---------- */
  Saga.revengeYear = (s) => {
    const p = me(s), rv = SG().revenge;
    if (!P().alive(p) || s.pending.length) return;
    const f = Sect().mine(s);
    if (f && p.locationId === f.seatId) return; // 在山门里，仇家不敢来
    const foes = P().relationsOf(s, p.id).filter((r) => r.strength <= C().relations.feudThreshold && r.tags.includes('交手'))
      .map((r) => s.people[r.a === p.id ? r.b : r.a]).filter((q) => q && P().alive(q) && P().realmRank(q) >= P().realmRank(p) - rv.rankGap)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const q of foes) {
      if (!R.chance(s.rng, rv.chance)) continue;
      q.locationId = p.locationId;
      FX.Ev.spawn(s, 'REVENGE', { place: p.locationId, foe: q.id }, []);
      return;
    }
  };

  /* ---------- 洞府 ---------- */
  Saga.DO.dongfu = (s, a) => {
    const p = me(s), place = s.places[p.locationId];
    s.player.stone -= a.cost;
    const r = Sim().passDays(s, a.days, 'other');
    if (!P().alive(p)) return { text: '' };
    const moved = !!s.player.dongfu;
    s.player.dongfu = place.id;
    H().add(s, { type: 'dongfu', tags: ['洞府'], actors: [p.id], places: [place.id], key: 'dongfu', pov: true, severity: 3, params: { name: p.name, place: place.name, cost: a.cost, how: moved ? '迁了洞府' : '开辟洞府' } });
    return { text: '在' + place.name + (moved ? '迁了洞府' : '开辟了洞府'), interrupted: r.interrupted };
  };
  Saga.isDongfu = (s, p, placeId) => P().isPlayer(s, p) && s.player.dongfu === placeId;

  /* ---------- 事件定义 ---------- */
  const EV = FX.EVENTS;
  EV.DIYUAN = {
    name: '地渊', category: '大事', severity: 3,
    text: (s, b) => `地渊里阴气森森，外围长着些人面芝，往下走是${b._midBeast}出没的中层，再往深处有${b._deepBeast}盘踞，听说大药都在那里。你如今战力 ${P().power(s, pl(s))}。${b._fuzhao ? '你身上带着玄真派的地渊符诏，办成了记道功。' : ''}`,
    options: [
      {
        id: 'outer', label: '只在外围采药',
        cost: () => '无', risk: () => `约 ${Math.round(SG().diyuan.outerHurt * 100)}% 会被阴气所伤（轻伤）`,
        outcome: (s, b) => '稳得人面芝 ' + SG().diyuan.outerHerb.join('–') + ' 株' + (b._fuzhao ? '，并记道功' : ''),
        apply(s, b) {
          const dy = SG().diyuan;
          const q = R.int(s.rng, dy.outerHerb[0], dy.outerHerb[1]);
          give(s, 'rareHerb', q);
          let t = '采得' + C().items.rareHerb.name + '×' + q + meritFor(s, b, 'outer');
          if (R.chance(s.rng, dy.outerHurt)) { P().injure(s, pl(s), 'light'); t += '，被阴气侵体，受了轻伤'; }
          return { text: t, gain: true };
        },
      },
      layerOpt('middle', '往中层去'),
      layerOpt('deep', '闯深处'),
    ],
  };

  EV.XIEFANG = {
    name: '撷芳宴', category: '大事', severity: 3,
    text: (s, b, n) => { const q = s.people[b.foe]; return `撷芳宴第 ${b._round} 场（共 ${SG().xiefang.rounds} 场）。对手是散修${n.foe}（${P().realmName(q)}，战力 ${P().power(s, q)}）。你战力 ${P().power(s, pl(s))}。花神府的人在台上看着，只收最后站着的人。`; },
    options: [
      Object.assign({}, Cb().fightOpt(xiefangFoe), { label: '出手' }),
      { id: 'quit', label: '认输离场', cost: () => '供奉不退', risk: () => '无', outcome: () => '保住性命，这回撷芳宴就此作罢', apply() { return { text: '认输离场' }; } },
    ],
  };

  EV.REVENGE = {
    name: '仇家寻仇', category: '遭遇', severity: 3,
    text: (s, b, n) => { const q = s.people[b.foe]; return `${n.place}，当年被你打退的${n.foe}找上门来，如今已是${P().realmName(q)}（战力 ${P().power(s, q)}）。你战力 ${P().power(s, pl(s))}，身上有符钱 ${s.player.stone}。`; },
    options: [
      Cb().fightOpt(Cb().npcFoe),
      {
        id: 'pay', label: '赔礼了结旧怨',
        cost: (s) => `符钱 −${Math.ceil(s.player.stone * 0.3)}`, risk: () => '无', outcome: () => '对方收下赔礼，旧怨就此了结',
        apply(s, b) { const lost = Math.ceil(s.player.stone * 0.3); s.player.stone -= lost; const r = P().relationBetween(s, s.player.id, b.foe); if (r) P().adjustRelation(s, s.player.id, b.foe, -10 - r.strength, '和解'); return { text: `赔了符钱 ${lost}，旧怨了结` }; },
      },
      Cb().fleeOpt(Cb().npcFoe),
    ],
  };

  FX.Saga = Saga;
})(typeof globalThis !== 'undefined' ? globalThis : this);
