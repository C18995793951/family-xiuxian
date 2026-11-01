/* ============================================================
 * deeds —— 七个通用动作：交谈、打听、交易、相助、相争、潜行、立约
 * 自由输入里规则认得的“现有行动”之外，只多这七样。AI 只挑动作和对象，成功率、时日、得失全由这里的规则算：
 *  · 对象必须在场、在世；送出去的东西必须在行囊里；
 *  · 得到的消息由规则从世界状态里挑（市价、某人在哪、卡关的来路），不编；
 *  · 不改境界、寿元、生死，不发功法；相争落败只受伤，不致死。
 * Deed.check 只读（预览卡用），Deed.run 执行（由 Act.run 转进来）。
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
  const Sim = () => FX.Sim;
  const Cb = () => FX.Combat;

  const Deed = {};
  const me = (s) => P().player(s);
  const here = (s) => s.places[me(s).locationId];
  const town = (pl) => ['town', 'city', 'sect', 'clan'].includes(pl.type);

  Deed.VERBS = {
    talk: { name: '交谈', aims: { chat: '叙话', ask: '打听消息', apologize: '赔礼' } },
    inquire: { name: '打听', topics: { item: '某样东西哪里有', person: '某人下落', place: '某地情形', way: '眼下卡关的来路', rumor: '近来的传闻' } },
    trade: { name: '交易', aims: { sell: '把东西让给对方换符钱', borrow: '向对方借符钱' } },
    help: { name: '相助', aims: {} },
    fight: { name: '相争', modes: { spar: '切磋', rob: '抢夺', duel: '赴约斗法' } },
    sneak: { name: '潜行', aims: {} },
    pact: { name: '立约', kinds: { sworn: '结为兄弟/姊妹', duel: '约十年后再战' } },
  };
  // 规则常数（只在这里，AI 碰不到）
  const K = {
    talkDays: 7, inquireDays: { town: 5, wild: 12 }, tradeDays: 3, helpDays: 30, fightDays: 1, sneakDays: 10, pactDays: 3,
    swornMin: 60, duelYears: 10, favorBonus: 15,
  };
  Deed.K = K;
  const favors = (s) => (s.player.favors = s.player.favors || []);
  const pacts = (s) => (s.player.pacts = s.player.pacts || []);
  const owedBy = (s, npc) => favors(s).find((f) => f.npc === npc && f.kind === 'owed');
  const rankGap = (p, q) => P().realmRank(q) - P().realmRank(p);
  // 礼物的分量：同样的东西，境界越高看得越轻
  const giftWeight = (p, item) => { const it = C().items[item]; return it ? Math.min(25, Math.round(it.price / (5 * Math.pow(1 + p.realm.major, 2)))) : 0; };
  // 对方手头宽裕程度：借钱、抢夺能得多少
  const purse = (q) => 20 * Math.pow(1 + q.realm.major, 2);
  Deed.duePact = (s, npc) => pacts(s).find((x) => x.npc === npc && x.kind === 'duel' && !x.done && x.due <= s.t);

  /* ---------- 消息：只从世界状态里挑 ---------- */
  Deed.intel = (s, topic, a) => {
    const p = me(s);
    if (topic === 'item' && a.item) {
      const name = W().itemName(a.item);
      const shops = [];
      for (const id in s.markets) for (const x of s.markets[id].stock) if (x.item === a.item && x.qty > 0) shops.push({ id, price: x.price });
      shops.sort((x, y) => (W().route(s, p.locationId, x.id, p) || { days: 1e9 }).days - (W().route(s, p.locationId, y.id, p) || { days: 1e9 }).days);
      const parts = shops.slice(0, 2).map((x) => s.places[x.id].name + '的货架上有，要价 ' + x.price + ' 符钱');
      if (FX.Guide) {
        const ways = FX.Guide.ways(s, { label: name, keys: [a.item], qty: 1 }).filter((w) => !w.earn);
        for (const w of ways.slice(0, 2)) if (!parts.some((t) => w.text.includes(t))) parts.push(w.text);
      }
      return parts.length ? name + '：' + parts.join('；') + '。' : '一时没人知道哪里有' + name + '。';
    }
    if (topic === 'person' && a.npc) {
      const q = s.people[a.npc];
      if (!q) return '没人听说过这个人。';
      if (!P().alive(q)) return q.name + '已经不在人世了。';
      return P().factionName(s, q) + '的' + q.name + '，' + P().realmName(q) + '，眼下在' + s.places[q.locationId].name + (q.health.state !== 'healthy' ? '，听说带着伤' : '') + '。';
    }
    if (topic === 'place' && a.place) {
      const pl = s.places[a.place];
      const QI = ['稀薄', '稀薄', '平平', '尚可', '浓郁', '极浓', '如灵窟', '如洞天'];
      const r = W().route(s, p.locationId, pl.id, p);
      return pl.name + '灵机' + QI[pl.qi] + '，灵气属「' + pl.attr + '」，' + (pl.danger >= 3 ? '凶险得很' : pl.danger >= 1 ? '偶有妖物出没' : '还算太平') + (r ? '，从这里过去约 ' + r.days + ' 天' : '，眼下你过不去') + '。';
    }
    if (topic === 'way') {
      const g = FX.Guide && FX.Guide.next(s);
      return g && g.best ? g.need.label + '：' + g.best.text + '。' : '眼下没有卡着你的东西，照常修炼就是。';
    }
    return FX.Act.rumor(s);
  };
  // 潜行跟着某人能看出的东西：他的底细与恩怨
  const tailIntel = (s, q) => {
    const rel = P().relationsOf(s, q.id).filter((r) => Math.abs(r.strength) >= 30).sort((x, y) => Math.abs(y.strength) - Math.abs(x.strength)).slice(0, 3);
    const who = rel.map((r) => { const o = s.people[r.a === q.id ? r.b : r.a]; return o ? (r.strength > 0 ? '与' + o.name + '交好' : '与' + o.name + '有仇') : ''; }).filter(Boolean);
    return q.name + '是' + P().realmName(q) + (q.health.state !== 'healthy' ? '，身上有伤' : '') + (who.length ? '，' + who.join('，') : '，没看出和谁特别亲近或结怨') + '。';
  };

  /* ---------- 校验与预览（只读）---------- */
  // 返回 { ok, reason, label, days, cost, chance, risk, gain }
  Deed.check = (s, a) => {
    const v = a && Deed.VERBS[a.verb];
    if (!v) return { ok: false, reason: '没有这种做法' };
    if (s.ended) return { ok: false, reason: '这一生已经结束' };
    const p = me(s), pl = here(s);
    const q = a.npc ? s.people[a.npc] : null;
    const needHere = ['talk', 'trade', 'help', 'fight', 'sneak', 'pact'].includes(a.verb);
    const out = { ok: true, reason: '', verb: a.verb, label: '', days: 0, cost: 0, chance: null, risk: '', gain: '' };
    const no = (why) => Object.assign(out, { ok: false, reason: why });
    if (needHere) {
      if (!q || q.id === p.id) return no('要指明对谁做');
      out.label = v.name + '·' + q.name;
      if (!P().alive(q)) return no(q.name + '已经不在人世');
      if (q.locationId !== p.locationId) return no(q.name + '不在' + pl.name + '，在' + s.places[q.locationId].name);
    }
    const rel = q ? P().relValue(s, p.id, q.id) : 0;
    const fav = q && owedBy(s, q.id) ? K.favorBonus : 0;
    if (a.gift !== undefined && a.gift !== null) {
      if (!C().items[a.gift]) return no('送不了这个');
      if (!(s.player.inv[a.gift] > 0)) return no('行囊里没有' + W().itemName(a.gift));
    }
    const gift = a.gift ? giftWeight(p, a.gift) : 0;
    const giftTxt = a.gift ? '，送出' + W().itemName(a.gift) + ' 一份' : '';
    switch (a.verb) {
      case 'talk': {
        const aim = v.aims[a.aim] ? a.aim : 'chat';
        out.label = (aim === 'apologize' ? '向' + q.name + '赔礼' : aim === 'ask' ? '向' + q.name + '打听' + (a.topic ? Deed.VERBS.inquire.topics[a.topic] || '' : '消息') : '与' + q.name + '叙话') + giftTxt;
        if (aim === 'apologize' && rel >= 0) return no('你和' + q.name + '没有过节，不必赔礼');
        out.days = K.talkDays;
        out.chance = Math.round(U.clamp(45 + rel / 2 + gift + fav - Math.min(25, Math.max(0, rankGap(p, q)) * 2), 10, 90));
        out.gain = aim === 'ask' ? '成了得一条消息，交情略升' : aim === 'apologize' ? '成了化解几分仇怨' : '成了交情上升';
        out.risk = '不成交情不变或略降' + (a.gift ? '；礼物送出去就收不回' : '');
        break;
      }
      case 'inquire': {
        const topic = v.topics[a.topic] ? a.topic : 'rumor';
        if (topic === 'item' && !a.item) return no('要说明打听什么东西');
        if (topic === 'person' && !a.npc) return no('要说明打听谁');
        if (topic === 'place' && !a.place) return no('要说明打听哪里');
        const t = town(pl);
        out.label = '在' + pl.name + '打听' + (topic === 'item' ? W().itemName(a.item) + '哪里有' : topic === 'person' ? (q ? q.name : '某人') + '的下落' : topic === 'place' ? s.places[a.place].name + '的情形' : v.topics[topic]);
        out.days = t ? K.inquireDays.town : K.inquireDays.wild;
        const crowd = P().at(s, pl.id).length - 1;
        out.chance = Math.round(U.clamp((t ? ({ city: 85, town: 75, sect: 70, clan: 65 }[pl.type] || 70) : 25 + crowd * 10), 10, 90));
        out.gain = '成了得到世上真有的消息';
        out.risk = t ? '不成就白费几天' : '荒僻地方人少，多半问不出什么';
        break;
      }
      case 'trade': {
        const aim = v.aims[a.aim] ? a.aim : a.item ? 'sell' : 'borrow';
        out.days = K.tradeDays;
        if (aim === 'sell') {
          const it = a.item;
          if (!it || !C().items[it]) return no('要说明拿什么换');
          if (!(s.player.inv[it] > 0)) return no('行囊里没有' + W().itemName(it));
          const price = Math.max(1, Math.round(C().items[it].price * U.clamp(0.6 + rel / 200, 0.5, 0.9)));
          out.label = '把' + W().itemName(it) + '让给' + q.name + '，换 ' + price + ' 符钱';
          out.chance = Math.round(U.clamp(50 + rel / 2 + fav, 20, 90));
          out.gain = '成了得 ' + price + ' 符钱';
          out.risk = '对方不要就作罢';
          out.price = price; out.item = it;
        } else {
          const amt = Math.round(purse(q) * 0.5);
          out.label = '向' + q.name + '借 ' + amt + ' 符钱';
          out.chance = Math.round(U.clamp(rel - 20 + fav, 5, 80));
          out.gain = '成了得 ' + amt + ' 符钱，欠下一个人情';
          out.risk = '交情不深多半借不到';
          out.amount = amt;
        }
        out.aim = aim;
        break;
      }
      case 'help': {
        out.label = '替' + q.name + '出力（护法、寻药之类）';
        out.days = K.helpDays;
        out.chance = Cb().fightChance(s, p, P().power(s, q) * 0.6).chance;
        const same = p.factionId && p.factionId === q.factionId && FX.Sect.mine(s);
        out.gain = '成了交情上升，对方欠你一个人情' + (same ? '，记' + C().house.meritName + ' ' + FX.Sect.taskMerit(p) : '');
        out.risk = '不成白费一月，约三成受轻伤';
        break;
      }
      case 'fight': {
        const mode = v.modes[a.mode] ? a.mode : 'spar';
        const pw = P().power(s, q);
        out.label = (mode === 'rob' ? '抢夺' : mode === 'duel' ? '赴约与' : '与') + q.name + (mode === 'rob' ? '' : mode === 'duel' ? '斗法' : '切磋');
        if (mode === 'spar' && rel < -20) return no(q.name + '和你有仇，不肯切磋');
        if (mode === 'duel' && !Deed.duePact(s, q.id)) return no('和' + q.name + '没有到期的约战');
        out.days = K.fightDays;
        out.chance = Cb().fightChance(s, p, pw).chance;
        out.mode = mode;
        if (mode === 'rob') {
          const same = p.factionId && p.factionId === q.factionId;
          out.gain = '胜了夺得约 ' + Math.round(purse(q) * 0.5) + '–' + Math.round(purse(q) * 1.5) + ' 符钱';
          out.risk = '无论胜负都与' + q.name + '结仇；败了受伤（' + Math.round(C().encounter.lossHeavyShare * 100) + '% 为重伤）' + (same ? '；同门相残要按门规罚' + C().house.meritName : '');
        } else {
          out.gain = mode === 'duel' ? '胜负都了结这桩约，胜了交情、名声都好看' : '胜负都略增交情';
          out.risk = '输的一方约两成受轻伤';
        }
        break;
      }
      case 'sneak': {
        out.label = '暗中跟着' + q.name + '，摸清对方底细';
        out.days = K.sneakDays;
        out.chance = Cb().fleeChance(s, p, P().power(s, q)).chance;
        out.gain = '成了看出他的境况和恩怨';
        out.risk = '被发现就结仇，对方可能动手';
        break;
      }
      case 'pact': {
        const kind = v.kinds[a.kind] ? a.kind : 'sworn';
        out.kind = kind;
        out.days = K.pactDays;
        if (kind === 'sworn') {
          out.label = '与' + q.name + '结拜';
          if ((P().relationBetween(s, p.id, q.id) || { tags: [] }).tags.includes('结拜')) return no('你们已经结拜过了');
          if (rel < K.swornMin) return no('交情不够（需 ' + K.swornMin + '，现在 ' + rel + '）');
          out.chance = Math.round(U.clamp(rel - 20 + fav, 10, 90));
          out.gain = '成了交情大增，记作结拜';
          out.risk = '不成交情略降';
        } else {
          out.label = '与' + q.name + '约 ' + K.duelYears + ' 年后再战';
          if (pacts(s).some((x) => x.npc === q.id && x.kind === 'duel' && !x.done)) return no('你们已有约战');
          out.chance = Math.round(U.clamp(60 - Math.abs(rankGap(p, q)) * 5, 10, 90));
          out.gain = '成了记下约期，到期可赴约斗法';
          out.risk = '对方不应就作罢';
        }
        break;
      }
      default: return no('没有这种做法');
    }
    if (a.gift && !['talk'].includes(a.verb)) return no('只有交谈时能送礼');
    return out;
  };

  /* ---------- 执行 ---------- */
  const say = (s, key, params, actors, severity) => H().add(s, { type: 'deed', tags: ['人物'], actors, places: [me(s).locationId], key, pov: true, severity: severity || 1, params: Object.assign({ name: me(s).name }, params) });
  const rel = (s, q, d, tag) => { if (d) P().adjustRelation(s, me(s).id, q.id, d, tag); };
  const useFavor = (s, q) => { const f = owedBy(s, q.id); if (f) favors(s).splice(favors(s).indexOf(f), 1); };

  Deed.run = (s, a) => {
    const c = Deed.check(s, a);
    if (!c.ok) return { ok: false, error: c.reason };
    const p = me(s), q = a.npc ? s.people[a.npc] : null;
    s.player.stats.actions++;
    if (a.gift) s.player.inv[a.gift]--;
    const r = Sim().passDays(s, c.days, 'other');
    if (!P().alive(p)) return { ok: true, text: '' };
    if (r && r.interrupted) return { ok: true, text: '还没办成就出了事', interrupted: true };
    if (q && (!P().alive(q) || q.locationId !== p.locationId)) { FX.Act.seek(s, false); return { ok: true, text: '没见着' + q.name }; }
    const win = R.chance(s.rng, (c.chance === null ? 100 : c.chance) / 100);
    FX.Act.seek(s, win);
    let text = '';
    switch (a.verb) {
      case 'talk': {
        const g = a.gift ? Math.ceil(giftWeight(p, a.gift) / 2) : 0;
        const giftTxt = a.gift ? '，送上' + W().itemName(a.gift) : '';
        if (!win) { rel(s, q, a.gift ? g : -1, '交谈'); say(s, 'deed_talk_fail', { other: q.name, gift: giftTxt }, [p.id, q.id]); text = q.name + '没怎么搭理你'; break; }
        if (owedBy(s, q.id)) useFavor(s, q);
        if (a.aim === 'apologize') { const d = Math.min(-P().relValue(s, p.id, q.id) + 5, R.int(s.rng, 8, 18) + g); rel(s, q, d, '赔礼'); say(s, 'deed_apologize', { other: q.name, gift: giftTxt, delta: '+' + d }, [p.id, q.id], 2); text = q.name + '接了你的赔礼（关系 +' + d + '）'; break; }
        if (a.aim === 'ask') {
          const info = Deed.intel(s, a.topic || 'rumor', a);
          rel(s, q, 1 + g, '交谈');
          say(s, 'deed_ask', { other: q.name, gift: giftTxt, info }, [p.id, q.id], 2);
          text = q.name + '说：' + info;
          break;
        }
        const d = R.int(s.rng, 3, 8) + g;
        rel(s, q, d, '叙话');
        say(s, 'deed_chat', { other: q.name, gift: giftTxt, delta: '+' + d }, [p.id, q.id]);
        text = '与' + q.name + '谈得投机（关系 +' + d + '）';
        break;
      }
      case 'inquire': {
        if (!win) { say(s, 'deed_inquire_fail', { place: here(s).name }, [p.id]); text = '没问出什么'; break; }
        const info = Deed.intel(s, a.topic || 'rumor', a);
        say(s, 'deed_inquire', { place: here(s).name, info }, [p.id], 2);
        text = '打听到：' + info;
        break;
      }
      case 'trade': {
        if (!win) { say(s, 'deed_trade_fail', { other: q.name }, [p.id, q.id]); text = q.name + '没答应'; break; }
        if (owedBy(s, q.id)) useFavor(s, q);
        if (c.aim === 'sell') {
          s.player.inv[c.item]--;
          s.player.stone += c.price;
          rel(s, q, 1, '交易');
          say(s, 'deed_sell', { other: q.name, item: W().itemName(c.item), stone: c.price }, [p.id, q.id]);
          text = '把' + W().itemName(c.item) + '让给' + q.name + '，得 ' + c.price + ' 符钱';
        } else {
          s.player.stone += c.amount;
          favors(s).push({ npc: q.id, kind: 'owe', t: s.t });
          say(s, 'deed_borrow', { other: q.name, stone: c.amount }, [p.id, q.id], 2);
          text = '向' + q.name + '借得 ' + c.amount + ' 符钱，欠下一个人情';
        }
        break;
      }
      case 'help': {
        if (!win) {
          rel(s, q, 1, '相助');
          const hurt = R.chance(s.rng, 0.3);
          if (hurt) P().injure(s, p, 'light');
          say(s, 'deed_help_fail', { other: q.name, hurt: hurt ? '，自己还受了轻伤' : '' }, [p.id, q.id]);
          text = '没帮上' + q.name + (hurt ? '，受了轻伤' : '');
          break;
        }
        const d = R.int(s.rng, 5, 12);
        rel(s, q, d, '相助');
        // 欠着对方的人情，这回算还上；不然对方欠你一个
        const mine = favors(s).find((f) => f.npc === q.id && f.kind === 'owe');
        if (mine) favors(s).splice(favors(s).indexOf(mine), 1); else favors(s).push({ npc: q.id, kind: 'owed', t: s.t });
        const same = p.factionId && p.factionId === q.factionId && FX.Sect.mine(s);
        const merit = same ? FX.Sect.taskMerit(p) : 0;
        s.player.merit += merit;
        say(s, 'deed_help', { other: q.name, delta: '+' + d, merit: merit ? '，记' + C().house.meritName + ' ' + merit : '', favor: mine ? '，算是还了人情' : '，对方记下这份人情' }, [p.id, q.id], 2);
        text = '帮成了' + q.name + '（关系 +' + d + '）' + (merit ? '，' + C().house.meritName + ' +' + merit : '');
        break;
      }
      case 'fight': {
        s.player.stats.fights++;
        if (win) s.player.stats.wins++;
        const mode = c.mode;
        const loser = win ? q : p;
        if (mode === 'rob') {
          rel(s, q, -40, '抢夺');
          if (win) {
            const got = Math.round(purse(q) * R.range(s.rng, 0.5, 1.5));
            s.player.stone += got;
            const same = p.factionId && p.factionId === q.factionId && FX.Sect.mine(s);
            const fine = same ? Math.min(s.player.merit, FX.Sect.taskMerit(p) * 3) : 0;
            s.player.merit -= fine;
            say(s, 'deed_rob_win', { other: q.name, stone: got, fine: fine ? '。同门相残，罚' + C().house.meritName + ' ' + fine : '' }, [p.id, q.id], 3);
            text = '胜了，夺得 ' + got + ' 符钱，与' + q.name + '结仇' + (fine ? '，门规罚' + C().house.meritName + ' ' + fine : '');
          } else {
            const heavy = R.chance(s.rng, C().encounter.lossHeavyShare);
            P().injure(s, p, heavy ? 'heavy' : 'light');
            say(s, 'deed_rob_lose', { other: q.name, hurt: heavy ? '重伤' : '轻伤' }, [p.id, q.id], 3);
            text = '败了，受了' + (heavy ? '重伤' : '轻伤') + '，与' + q.name + '结仇';
          }
          break;
        }
        if (R.chance(s.rng, 0.2)) P().injure(s, loser, 'light');
        if (mode === 'duel') { const pk = Deed.duePact(s, q.id); pk.done = true; rel(s, q, win ? 5 : 3, '赴约'); }
        else rel(s, q, 2, '切磋');
        say(s, mode === 'duel' ? 'deed_duel' : 'deed_spar', { other: q.name, who: win ? p.name : q.name }, [p.id, q.id], 2);
        text = (mode === 'duel' ? '赴约斗法，' : '切磋，') + (win ? '你胜了半招' : q.name + '胜了半招');
        break;
      }
      case 'sneak': {
        if (win) {
          const info = tailIntel(s, q);
          say(s, 'deed_sneak', { other: q.name, info }, [p.id, q.id], 2);
          text = '看出来了：' + info;
          break;
        }
        rel(s, q, -15, '被跟踪');
        // 被发现：对方未必动手；动手就按斗法掷
        let hurt = '';
        if (R.chance(s.rng, 0.5)) {
          const ok = R.chance(s.rng, Cb().fightChance(s, p, P().power(s, q)).chance / 100);
          if (!ok) { P().injure(s, p, 'light'); hurt = '，动起手来你吃了亏，受了轻伤'; } else hurt = '，动起手来你脱了身';
        }
        say(s, 'deed_sneak_fail', { other: q.name, hurt }, [p.id, q.id], 2);
        text = '被' + q.name + '发现了' + hurt;
        break;
      }
      case 'pact': {
        if (!win) { rel(s, q, -2, '立约'); say(s, 'deed_pact_fail', { other: q.name }, [p.id, q.id]); text = q.name + '没有答应'; break; }
        if (c.kind === 'sworn') {
          rel(s, q, 10, '结拜');
          const r2 = P().relationBetween(s, p.id, q.id);
          if (r2 && !r2.tags.includes('结拜')) r2.tags.push('结拜');
          say(s, 'deed_sworn', { other: q.name }, [p.id, q.id], 3);
          text = '与' + q.name + '结拜';
        } else {
          const due = s.t + K.duelYears * C().daysPerYear;
          pacts(s).push({ npc: q.id, kind: 'duel', t: s.t, due });
          say(s, 'deed_duel_pact', { other: q.name, when: T().fmt(due) }, [p.id, q.id], 2);
          text = '与' + q.name + '约定 ' + T().fmt(due) + ' 再战';
        }
        break;
      }
    }
    return { ok: true, text, success: win };
  };

  // 纪事模板
  Object.assign(C().text, {
    deed_talk_fail: ['{name}找{other}说话{gift}，{other}没怎么搭理。'],
    deed_chat: ['{name}与{other}叙话{gift}，谈得投机，关系 {delta}。'],
    deed_ask: ['{name}向{other}打听{gift}。{other}说：{info}'],
    deed_apologize: ['{name}向{other}赔礼{gift}，{other}接了，关系 {delta}。'],
    deed_inquire: ['{name}在{place}四处打听，得知：{info}'],
    deed_inquire_fail: ['{name}在{place}四处打听，没问出什么。'],
    deed_trade_fail: ['{name}想与{other}做笔交易，{other}没答应。'],
    deed_sell: ['{name}把{item}让给{other}，得符钱 {stone}。'],
    deed_borrow: ['{name}向{other}借得符钱 {stone}，欠下一个人情。'],
    deed_help: ['{name}替{other}出力，事情办成了，关系 {delta}{merit}{favor}。'],
    deed_help_fail: ['{name}替{other}出力，没能帮上{hurt}。'],
    deed_rob_win: ['{name}出手抢夺{other}，得手，夺得符钱 {stone}，从此结仇{fine}。'],
    deed_rob_lose: ['{name}出手抢夺{other}，反被打得{hurt}，从此结仇。'],
    deed_spar: ['{name}与{other}切磋，{who}胜了半招。'],
    deed_duel: ['{name}赴约与{other}斗法，{who}胜了，了结旧约。'],
    deed_sneak: ['{name}暗中跟着{other}多日，看出：{info}'],
    deed_sneak_fail: ['{name}暗中跟着{other}，被发现了{hurt}。'],
    deed_pact_fail: ['{name}想与{other}立约，{other}没有答应。'],
    deed_sworn: ['{name}与{other}结拜。'],
    deed_duel_pact: ['{name}与{other}约定 {when} 再战。'],
  });

  FX.Deed = Deed;
})(typeof globalThis !== 'undefined' ? globalThis : this);
