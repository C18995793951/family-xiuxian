/* ============================================================
 * encounters（config 区块）—— 斗法检定与需要玩家决断的遭遇
 * 成败一律由这里的规则掷骰决定；文字只描述规则算出的结果。
 * 阶段 3 起，这些模板只在没有 AI 时兜底。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;

  /* ---------- 斗法与逃遁 ---------- */
  const Combat = {};
  Object.defineProperty(Combat, 'beastNames', { get: () => C().encounter.beastNames });

  Combat.fightChance = (s, p, foePower) => {
    const E = C().encounter;
    const my = P().powerBreakdown(s, p);
    const raw = (my.total / (my.total + foePower)) * 100;
    const chance = Math.round(U.clamp(raw, E.winChanceMin, E.winChanceMax));
    const parts = my.factors.map((f) => ({ label: f.label, value: '×' + f.value })).concat([{ label: '我方战力', value: my.total }, { label: '对方战力', value: Math.round(foePower * 10) / 10 }]);
    return { chance, parts, my: my.total };
  };

  Combat.fleeChance = (s, p, foePower) => {
    const E = C().encounter;
    const parts = [{ label: '基础', value: E.fleeBase }, { label: '资质 ' + p.aptitude, value: U.round1((p.aptitude - 50) * E.fleePerApt) }];
    const my = P().power(s, p);
    const ratio = foePower / Math.max(0.1, my);
    if (ratio > 1) parts.push({ label: '对方强出 ' + U.round1(ratio) + ' 倍', value: -Math.round(Math.min(30, (ratio - 1) * 10)) });
    else parts.push({ label: '对方不如你', value: Math.round(Math.min(20, (1 / ratio - 1) * 10)) });
    if (p.traits.includes('谨慎')) parts.push({ label: '谨慎', value: C().traits.cautiousFlee });
    if (p.health.state !== 'healthy') parts.push({ label: '带伤', value: p.health.state === 'heavy' ? -25 : -10 });
    const chance = Math.round(U.clamp(parts.reduce((a, x) => a + x.value, 0), 5, 95));
    return { chance, parts };
  };

  // 落败受伤；对手远强于自己且伤重时可能身死。返回描述与是否身死
  Combat.hurt = (s, p, foePower, foeName, causeIds) => {
    const E = C().encounter;
    const heavy = R.chance(s.rng, E.lossHeavyShare);
    const my = P().power(s, p); // 强弱按交手时算，不按受伤之后算
    P().injure(s, p, heavy ? 'heavy' : 'light');
    if (heavy && foePower >= 2 * my && R.chance(s.rng, E.deathWhenOutmatched)) {
      P().kill(s, p, '败于' + foeName + '之手', causeIds, { key: 'fight' });
      return { text: '伤重不治', died: true };
    }
    return { text: heavy ? '身受重伤' : '受了轻伤', died: false };
  };

  const pl = (s) => P().player(s);
  const inv = (s) => s.player.inv;
  const giveItem = (s, key, n) => { inv(s)[key] = (inv(s)[key] || 0) + n; };
  const lootBeast = (s, danger) => {
    const hide = R.int(s.rng, 1, 2 + Math.floor(danger / 2));
    giveItem(s, 'beastHide', hide);
    const parts = [C().items.beastHide.name + '×' + hide];
    if (R.chance(s.rng, 0.35 + danger * 0.1)) { const c = 1 + (danger >= 4 && R.chance(s.rng, 0.3) ? 1 : 0); giveItem(s, 'beastCore', c); parts.push(C().items.beastCore.name + '×' + c); }
    return parts.join('、');
  };
  const fightOpt = (foe) => ({
    id: 'fight', label: '迎战',
    chance: (s, b) => Combat.fightChance(s, pl(s), foe(s, b).power),
    cost: () => '无',
    risk: (s, b) => { const ch = Combat.fightChance(s, pl(s), foe(s, b).power); return `胜率 ${ch.chance}%；落败会受伤（${Math.round(C().encounter.lossHeavyShare * 100)}% 为重伤）${foe(s, b).power >= 2 * ch.my ? '，对方远强于你，重伤时可能身死' : ''}`; },
    outcome: (s, b) => foe(s, b).winText,
    apply(s, b, ctx) {
      const f = foe(s, b);
      const ch = Combat.fightChance(s, pl(s), f.power);
      const st = s.player.stats;
      st.fights++;
      if (R.next(s.rng) * 100 < ch.chance) {
        st.wins++;
        const loot = f.onWin(s, b, ctx);
        H().add(s, { type: 'fight', tags: ['斗法', '胜'], actors: [s.player.id].concat(b.foe ? [b.foe] : []), places: [b.place], key: 'fight_win', pov: true, params: { name: pl(s).name, foe: f.name, chance: ch.chance, loot }, severity: 2, causeIds: [ctx.hid] });
        return { text: `胜（${ch.chance}%），${loot}`, gain: true };
      }
      const h = Combat.hurt(s, pl(s), f.power, f.name, [ctx.hid]);
      if (b.foe && f.onLose) f.onLose(s, b, ctx);
      if (!h.died) H().add(s, { type: 'fight', tags: ['斗法', '败'], actors: [s.player.id].concat(b.foe ? [b.foe] : []), places: [b.place], key: 'fight_lose', pov: true, params: { name: pl(s).name, foe: f.name, chance: ch.chance, hurt: h.text }, severity: 3, causeIds: [ctx.hid] });
      return { text: `败（${ch.chance}%），${h.text}` };
    },
  });
  const fleeOpt = (foe) => ({
    id: 'flee', label: '逃走',
    chance: (s, b) => Combat.fleeChance(s, pl(s), foe(s, b).power),
    cost: () => '无',
    risk: (s, b) => `成功率 ${Combat.fleeChance(s, pl(s), foe(s, b).power).chance}%；失败会受伤`,
    outcome: () => '全身而退，但一无所得',
    apply(s, b, ctx) {
      const f = foe(s, b);
      const ch = Combat.fleeChance(s, pl(s), f.power);
      if (R.next(s.rng) * 100 < ch.chance) {
        H().add(s, { type: 'fight', tags: ['逃遁'], actors: [s.player.id], places: [b.place], key: 'flee_ok', pov: true, params: { name: pl(s).name, foe: f.name, chance: ch.chance }, severity: 1, causeIds: [ctx.hid] });
        return { text: `脱身（${ch.chance}%）` };
      }
      const h = Combat.hurt(s, pl(s), f.power * 0.7, f.name, [ctx.hid]);
      if (!h.died) H().add(s, { type: 'fight', tags: ['逃遁', '败'], actors: [s.player.id], places: [b.place], key: 'flee_fail', pov: true, params: { name: pl(s).name, foe: f.name, chance: ch.chance, hurt: h.text }, severity: 3, causeIds: [ctx.hid] });
      return { text: `没逃掉（${ch.chance}%），${h.text}` };
    },
  });

  // _merit：奉事房符诏要除的妖物，打赢了记道功、领赏钱
  const beastFoe = (s, b) => ({
    name: b._beast, power: b._power, winText: b._merit ? `斗杀妖物，符诏办成：记${C().house.meritName} ${b._merit}、赏符钱 ${b._stone}，另得妖物材料` : '斗杀妖物，可得妖物材料',
    onWin(s2, b2) {
      const loot = lootBeast(s2, b2._danger);
      if (!b2._merit) return loot;
      s2.player.merit += b2._merit;
      s2.player.stone += b2._stone;
      return `符诏办成，记${C().house.meritName} ${b2._merit}、赏符钱 ${b2._stone}，${loot}`;
    },
  });
  const npcFoe = (s, b) => {
    const p = s.people[b.foe];
    return {
      name: p.name, power: P().power(s, p), winText: '击退对方，缴获其随身符钱；从此结仇',
      onWin(s2, b2) {
        const got = R.int(s2.rng, 5, 15) * Math.max(1, P().realmRank(p));
        s2.player.stone += got;
        P().injure(s2, p, 'light');
        P().adjustRelation(s2, s2.player.id, p.id, -60, '交手');
        return `缴获符钱 ${got}，与${p.name}结仇`;
      },
      onLose(s2) { const lost = Math.floor(s2.player.stone * R.range(s2.rng, 0.3, 0.6)); s2.player.stone -= lost; P().adjustRelation(s2, s2.player.id, p.id, -30, '交手'); },
    };
  };

  const EV = {};

  EV.BEAST = {
    name: '遭遇妖物', category: '遭遇', severity: 2,
    text: (s, b, n) => `${n.place}，${b._why || '一头'}${b._beast}拦在前方（战力约 ${b._power}）。你如今${P().realmName(pl(s))}，战力 ${P().power(s, pl(s))}。`,
    options: [fightOpt(beastFoe), fleeOpt(beastFoe)],
  };

  EV.ROBBER = {
    name: '拦路劫修', category: '遭遇', severity: 3,
    text: (s, b, n) => { const p = s.people[b.foe]; return `${n.place}，${n.foe}（${P().realmName(p)}，${P().factionName(s, p)}，战力 ${P().power(s, p)}）拦住去路，要你留下买路符钱。你身上有符钱 ${s.player.stone}，战力 ${P().power(s, pl(s))}。`; },
    options: [
      fightOpt(npcFoe),
      {
        id: 'pay', label: '破财消灾',
        cost: (s) => `符钱 −${Math.ceil(s.player.stone * 0.4)}`, risk: () => '无', outcome: () => '对方拿钱走人',
        apply(s, b) { const lost = Math.ceil(s.player.stone * 0.4); s.player.stone -= lost; return { text: `交出符钱 ${lost}` }; },
      },
      fleeOpt(npcFoe),
    ],
  };

  EV.RUIN = {
    name: '前人遗府', category: '机缘', severity: 3,
    text: (s, b, n) => `${n.place}的山壁后露出一道残破禁制，像是哪位前人坐化之地。南域常有传言，说早年有散修真人在此地埋下过道藏，留给后来人。外围已能看到些散落的灵物，深处禁制未散，不知还剩多少威力。`,
    options: [
      {
        id: 'safe', label: '只取外围',
        cost: () => '无', risk: () => '无', outcome: () => '稳妥得一点符钱与灵草',
        apply(s) { const st = R.int(s.rng, 15, 40); s.player.stone += st; giveItem(s, 'herb', 2); return { text: `得符钱 ${st}、灵草×2`, gain: true }; },
      },
      {
        id: 'deep', label: '破禁深入',
        cost: () => '十天', risk: () => '约四成会触发残余禁制而受伤，且深处可能早已空无一物',
        outcome: () => '若有所得，可能是丹药、符钱、符器，甚至一卷练炁术',
        // 结算后由 api 再推进 10 天
        apply(s, b, ctx) {
          if (R.chance(s.rng, 0.4)) { const h = Combat.hurt(s, pl(s), P().power(s, pl(s)) * 1.2, '洞府禁制', [ctx.hid]); return { text: '触动禁制，' + h.text, days: 10 }; }
          const roll = R.next(s.rng);
          if (roll < 0.35) return { text: '深处早被人搬空，只剩几只空玉瓶', days: 10 };
          if (roll < 0.65) { const q = R.int(s.rng, 2, 4); giveItem(s, 'qiju', q); return { text: `寻得${C().items.qiju.name}×${q}`, gain: true, days: 10 }; }
          if (roll < 0.82) { const st = R.int(s.rng, 80, 200); s.player.stone += st; return { text: `寻得符钱 ${st}`, gain: true, days: 10 }; }
          if (roll < 0.9) { giveItem(s, 'fuqi1', 1); return { text: `寻得一件${C().items.fuqi1.name}`, gain: true, days: 10 }; }
          const t = R.weighted(s.rng, ['guiyuan', 'chiyang', 'xuanshui', 'handou', 'kaifu_low'], (k) => ({ guiyuan: 3, chiyang: 3, xuanshui: 3, handou: 1, kaifu_low: 1 }[k]));
          if (!s.player.manuals.includes(t)) s.player.manuals.push(t);
          return { text: `寻得${FX.World.itemName('tech:' + t)}的玉简`, gain: true, days: 10 };
        },
      },
      { id: 'leave', label: '不去招惹', cost: () => '无', risk: () => '无', outcome: () => '什么也不会发生', apply() { return { text: '转身离开' }; } },
    ],
  };

  FX.EVENTS = EV;
  FX.Combat = Combat;
})(typeof globalThis !== 'undefined' ? globalThis : this);
