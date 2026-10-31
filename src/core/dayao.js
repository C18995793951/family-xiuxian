/* ============================================================
 * dayao —— 金丹十三味大药
 * 照《仙业》：凝金丹要采齐十三味大药，六门外药向身外天地求（云华龙膏、天游泥、明合砂、玄室水、
 * 七明九光芝、老仙须），七门内药向身内天地索（神符火、三奇焰、五宫雷、玉鼎风、圣人土、正念锋、湛然虚精炁）。
 * 十三味一个不缺才可能丹成上三品；大派都有让弟子外出寻药的规矩，采药途中打磨道心，好凝出内药。
 *  · 外药：在荒山、险地、海外“外出寻药”，金谷墟市可托人代寻，宗门库藏可用道功换。结丹时耗掉。
 *  · 内药：在洞玄三重温养，年数够了自然凝成（资质越好越快）；神符火要肉身血气（护身道术练到小成快一倍）；
 *    五宫雷在摄取五精时用了先天五行之精便自显；湛然虚精炁是不传之秘，要先得修法。内药在身，结丹不耗。
 * NPC 不细算，按出身掷一个“采得几味”。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const P = () => FX.P;
  const H = () => FX.H;
  const Sim = () => FX.Sim;
  const T = () => FX.T;

  const Yao = {};
  const DC = () => C().dayao;
  const me = (s) => P().player(s);

  /* ---------- 采得几味 ---------- */
  Yao.waiHave = (s) => DC().wai.filter((k) => (s.player.inv[k] || 0) > 0);
  Yao.neiHave = (p) => (p.neiyao || []).slice();
  Yao.count = (s, p) => {
    if (P().isPlayer(s, p)) return Yao.waiHave(s).length + Yao.neiHave(p).length;
    return p.dayaoN || 0;
  };
  // NPC 结丹时采得几味：大派弟子多半齐全，散修多半凑不齐
  Yao.npcCount = (r, f) => { const rg = DC().npc[f ? Math.min(3, f.tier || 1) : 0]; return R.int(r, rg[0], rg[1]); };
  // 品第：每采齐几味高一档；不齐十三味，丹成不了上三品
  Yao.pinBonus = (n) => { for (const [k, v] of DC().pinBonus) if (n >= k) return v; return 0; };
  Yao.pinCap = (n) => (n >= DC().total ? 1 : DC().capWithout);
  // 冲金丹成功率的修正
  Yao.breakPart = (s, p) => { const n = Yao.count(s, p); return n ? { label: '十三味大药采得 ' + n + ' 味', value: Math.round(n * DC().breakPer) } : null; };

  // 结丹前的一条清单
  Yao.requirement = (s, p) => {
    const I = C().items, N = DC().nei;
    const wh = Yao.waiHave(s), nh = Yao.neiHave(p);
    const wMiss = DC().wai.filter((k) => !wh.includes(k)).map((k) => I[k].name);
    const nMiss = Object.keys(N).filter((k) => !nh.includes(k)).map((k) => N[k].name);
    const n = wh.length + nh.length;
    const note = '外药 ' + wh.length + '/6' + (wMiss.length ? '（缺' + wMiss.join('、') + '：荒山、险地、海外寻药，金谷墟市可托人代寻，宗门库藏可换）' : '') +
      '；内药 ' + nh.length + '/7' + (nMiss.length ? '（缺' + nMiss.join('、') + '：洞玄三重温养自然凝成' + (nh.includes('zhanran') || (s.player.inv.zhanranfa || 0) > 0 ? '' : '，湛然虚精炁要先得修法') + '）' : '') +
      '。十三味不齐丹成不了上三品；外药结丹时耗掉';
    return { label: '金丹十三味大药（可选：采得 ' + n + ' 味）', ok: n >= DC().total, optional: true, note };
  };

  /* ---------- 内药：在洞玄三重温养，年数够了自然凝成 ---------- */
  Yao.neiYears = (s, p, k) => {
    const d = DC().nei[k];
    let y = d.years * (DC().aptYears[0] - p.aptitude / 100);
    // 神符火：肉身血气鼎沸才凝得出——身上有一门护身道术练到小成，快一倍
    if (d.fast === 'def') { const b = FX.Ars.bestArt(p, 'def'); if (b && FX.Ars.level(p, b.k) >= 2) y /= 2; }
    if (d.need === 'wujing' && p.flags.includes('wujing')) y = 0;
    return Math.max(0, Math.round(y * 10) / 10);
  };
  Yao.neiReady = (s, p, k) => { const d = DC().nei[k]; return !(d.need === 'zhanranfa' && !((s.player.inv.zhanranfa || 0) > 0)); };
  // 每月调用：洞玄三重的日子累计起来，到了就凝成
  Yao.grow = (s, days) => {
    const p = me(s);
    if (!P().alive(p) || p.realm.major !== 5 || p.realm.stage !== 3) return;
    p.neiyao = p.neiyao || [];
    p.dxDays = (p.dxDays || 0) + days;
    const N = DC().nei;
    for (const k of Object.keys(N)) {
      if (p.neiyao.includes(k) || !Yao.neiReady(s, p, k)) continue;
      // 湛然虚精炁从得了修法那天算起
      const from = N[k].need === 'zhanranfa' ? (p.zhanranFrom === undefined ? (p.zhanranFrom = p.dxDays) : p.zhanranFrom) : 0;
      if (p.dxDays - from >= Yao.neiYears(s, p, k) * C().daysPerYear) {
        p.neiyao.push(k);
        H().add(s, { type: 'realm', tags: ['修炼', '大药'], actors: [p.id], key: 'neiyao', pov: true, severity: 2, params: { name: p.name, yao: N[k].name, desc: N[k].desc, n: Yao.count(s, p) } });
      }
    }
  };

  /* ---------- 外出寻药 ---------- */
  Yao.list = (s, add) => {
    const p = me(s), place = s.places[p.locationId], D = DC();
    if (p.realm.major !== D.seekMajor || !D.where[place.type]) return;
    const why = p.health.state === 'heavy' ? '重伤未愈' : '';
    add({ type: 'xunyao', days: D.seekDays, label: '在' + place.name + '寻凝丹外药 ' + T().dur(D.seekDays), group: '外出', ok: !why, reason: why });
  };
  Yao.DO = {
    xunyao(s, a) {
      const p = me(s), place = s.places[p.locationId], D = DC(), I = C().items;
      const r = Sim().passDays(s, a.days, 'other');
      if (!P().alive(p)) return { text: '' };
      if (r.interrupted || s.pending.length) return { text: '寻药途中出了事', interrupted: true };
      s.player.stats.explores++;
      const pool = D.where[place.type];
      let hurt = false;
      if (D.hurt[place.type] && R.chance(s.rng, D.hurt[place.type])) { P().injure(s, p, 'light'); hurt = true; }
      if (!R.chance(s.rng, D.seekChance[place.type])) {
        FX.Act.seek(s, false); s.player.stats.exploreNothing++;
        H().add(s, { type: 'explore', tags: ['大药'], actors: [p.id], places: [place.id], key: 'yao_none', pov: true, severity: 1, params: { name: p.name, place: place.name, dur: T().dur(a.days), hurt: hurt ? '，还受了些轻伤' : '' } });
        return { text: '没寻到外药' + (hurt ? '，还受了轻伤' : '') };
      }
      // 先找手上还缺的
      const miss = pool.filter((k) => !((s.player.inv[k] || 0) > 0));
      const k = R.pick(s.rng, miss.length ? miss : pool);
      s.player.inv[k] = (s.player.inv[k] || 0) + 1;
      FX.Act.seek(s, true);
      H().add(s, { type: 'explore', tags: ['大药'], actors: [p.id], places: [place.id], key: 'yao_found', pov: true, severity: 2, params: { name: p.name, place: place.name, dur: T().dur(a.days), yao: I[k].name, hurt: hurt ? '，途中受了些轻伤' : '' } });
      return { text: '寻得' + I[k].name + (hurt ? '，受了轻伤' : '') };
    },
  };

  // 结丹时耗掉外药（不论成败）；内药在身不耗
  Yao.consume = (s) => { for (const k of Yao.waiHave(s)) s.player.inv[k]--; };

  FX.Yao = Yao;
})(typeof globalThis !== 'undefined' ? globalThis : this);
