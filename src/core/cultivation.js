/* ============================================================
 * cultivation —— 修炼速度、境界晋升与突破（主角与 NPC 共用一套公式）
 * 凡人悟胎息 → 胎息壮大、得练炁术后转入练炁 → 练炁九层 → 筑基 → 紫府 → 洞玄 → 金丹三重 → 元神 → 返虚
 * 每过一道大关定一回根底：道基、紫府异象、先天金汞、金丹品第、元神法相，前面的成色影响后面
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const H = () => FX.H;

  const CU = {};
  const inv = (s, p) => (P().isPlayer(s, p) ? s.player.inv : {});

  /* ---------- 采气属相 ---------- */
  // 此人在某地采气的合适程度（练炁、筑基看练炁术的属相；紫府以上不太挑；凡人、胎息不采外气）
  CU.attrFit = (s, p, place) => {
    const F = C().attrFit;
    const m = p.realm.major;
    if (m <= 1) return null;
    if (m >= 6) return { value: F.jindan, label: '金丹诸气浑成，不为采气所困', short: '诸气浑成' };
    if (m >= 4) return { value: F.zifu, label: '紫府纯化灵机，不拘属相', short: '不拘属相' };
    const t = P().lianqiOf(p);
    if (!t) return { value: 0, label: '没有练炁术，炼化不了灵气', short: '无练炁术' };
    const a = place ? place.attr : null;
    if (t.attrs.includes(a)) return { value: F.match, label: '此地灵气属「' + a + '」，与《' + t.name + '》相合', short: '「' + a + '」气相合' };
    if (t.opp.includes(a)) return { value: F.opp, label: '此地灵气属「' + a + '」，与《' + t.name + '》相冲', short: '「' + a + '」气相冲' };
    return { value: F.neutral, label: '此地灵气属「' + a + '」，与《' + t.name + '》不相合', short: '「' + a + '」气不相合' };
  };
  CU.techFit = (s, p) => { const f = CU.attrFit(s, p, s.places[p.locationId]); return f ? f.value : 1; };

  // 此人在所在地能借到的灵机（宗门、家族驻地只对自己人开放）
  CU.qiFor = (s, p) => {
    const place = s.places[p.locationId];
    if (!place) return 1;
    const lim = C().cultivation.outsiderQi[place.type];
    if (lim !== undefined && place.factionId && p.factionId !== place.factionId) return Math.min(place.qi, lim);
    if (P().isPlayer(s, p) && s.player.dongtian === place.id) return C().dongtian.qi;
    // 洞府聚灵：最多聚到五级；灵窟福地本身就是六级
    if (FX.Saga.isDongfu(s, p, place.id)) return Math.max(place.qi, Math.min(5, place.qi + C().dongfu.qiBonus));
    return place.qi;
  };

  // 先天金汞（洞玄三重）：按道基、紫府异象定，另有一点机缘（luck 0–1）。1 末 2 下 3 中 4 上
  CU.jinhongFor = (p, luck) => U.clamp(Math.floor(((p.daoji || 1) + (p.yixiang || 1)) / 2) + luck, 1, 4);
  // 金丹品第：成丹时按道基、紫府异象、先天金汞、资质定，另有一点机缘（luck 0–2）。一品最高
  CU.danPinFor = (p, luck) => U.clamp(14 - ((p.daoji || 1) + (p.yixiang || 1) + (p.jinhong || 1) + Math.floor(p.aptitude / 25) + luck), 1, 9);
  // 元神法相：按金丹品第定，另有一点机缘（luck 0–3）。1 下 2 中 3 上 4 至
  CU.xiangFor = (p, luck) => { const v = (10 - (p.danPin || 9)) + luck; return v >= 11 ? 4 : v >= 8 ? 3 : v >= 5 ? 2 : 1; };

  // 以符钱修行一年要花多少符钱（胎息以下炼不了外物，返回 null）
  CU.coinPerYear = (p) => C().cultivation.coin.perYear[p.realm.major] || null;

  // 修炼速度构成（每年，可追溯）。opts.pill：中孚丹药效内；opts.coin：以符钱修行
  CU.breakdown = (s, p, opts) => {
    const cf = C(), cc = cf.cultivation;
    const m = p.realm.major;
    const F = [];
    if (m === 0) F.push({ label: '静坐参悟胎息气感', value: cf.realms.baseGain[0] });
    else if (m === 1) F.push({ label: '壮大胎息（不假外求）', value: cf.realms.baseGain[1] });
    else F.push({ label: '境界基础值', value: cf.realms.baseGain[m] });
    F.push({ label: '资质 ' + p.aptitude, value: Math.round((cc.aptBase + (p.aptitude / 100) * cc.aptRange) * 100) / 100 });
    if (m >= 2) {
      const t = P().techOf(s, p);
      if (t.kind !== 'none') F.push({ label: '法门《' + t.name + '》', value: t.mult });
      const place = s.places[p.locationId];
      if (opts && opts.coin) {
        F.push({ label: '以符钱修行（符钱属「元」，人人可炼）', value: cf.attrFit.coin });
        F.push({ label: '符钱灵气', value: cc.qiMult[cc.coin.qi] });
      } else {
        const fit = CU.attrFit(s, p, place);
        F.push({ label: fit.label, value: fit.value });
        const qi = CU.qiFor(s, p);
        F.push({ label: '灵机 ' + qi + ' 级' + (place ? '（' + place.name + (qi < place.qi ? '，外人只能在山门外修炼' : '') + '）' : ''), value: cc.qiMult[qi] });
      }
      if (opts && opts.pill) F.push({ label: '中孚丹', value: 1 + cc.qijuBonus });
    }
    if (P().isOld(s, p)) F.push({ label: '年老', value: cc.oldAgeCoef });
    if (p.health.state === 'light' || p.health.state === 'heavy') F.push({ label: p.health.state === 'heavy' ? '重伤' : '轻伤', value: cc.injury[p.health.state] });
    let total = 1;
    for (const f of F) total *= f.value;
    return { total: Math.round(total * 100) / 100, factors: F };
  };

  CU.updateLifespan = (s, p) => { p.lifespanMax = P().lifespanMaxFor(p.realm.major, p.realm.stage); };

  // 修为封顶（到了要冲关、或缺练炁术的地方）
  CU.capped = (p) => {
    const m = p.realm.major;
    if (m === 1) return !P().lianqiOf(p);
    if (m === 2) return p.realm.stage === 9;
    return true;
  };

  // 自动晋升：胎息壮大到头且有练炁术 → 练炁一层；练炁一至八层修满 → 下一层。返回晋升的层数
  CU.autoAdvance = (s, p) => {
    let n = 0;
    const isPlayer = P().isPlayer(s, p);
    if (p.realm.major === 1 && P().lianqiOf(p) && p.progress >= P().need(p)) {
      p.progress -= P().need(p);
      p.realm = { major: 2, stage: 1 };
      CU.updateLifespan(s, p);
      n++;
      if (isPlayer) H().add(s, { type: 'realm', tags: ['修炼'], actors: [p.id], key: 'lianqi_start', params: { name: p.name, tech: P().lianqiOf(p).name }, severity: 3, pov: true });
    }
    while (p.realm.major === 2 && p.realm.stage < 9 && p.progress >= P().need(p) && n < 12) {
      p.progress -= P().need(p);
      p.realm.stage++;
      CU.updateLifespan(s, p);
      n++;
      if (isPlayer) H().add(s, { type: 'realm', tags: ['修炼'], actors: [p.id], key: 'realm_up', params: { name: p.name, realm: P().realmName(p) }, severity: 2, pov: true });
    }
    const rk = P().realmRank(p);
    if (rk > p.peakRank) p.peakRank = rk;
    return n;
  };

  // 从凡人起累计的修为（用来算跨层增长）
  CU.total = (p) => {
    const cf = C().realms;
    let b = 0;
    for (let m = 0; m < p.realm.major; m++) for (const x of cf.need[m]) b += x;
    for (let i = 0; i < p.realm.stage - 1; i++) b += cf.need[p.realm.major][i];
    return b + p.progress;
  };

  // 加修为（已到瓶颈时封顶，等待突破）；返回实际增加的修为
  CU.addProgress = (s, p, amount) => {
    if (amount <= 0) return 0;
    const before = CU.total(p);
    p.progress += amount;
    if (CU.capped(p)) p.progress = Math.min(p.progress, P().need(p));
    CU.autoAdvance(s, p);
    if (CU.capped(p)) p.progress = Math.min(p.progress, P().need(p));
    return Math.max(0, CU.total(p) - before);
  };

  /* ---------- 突破 ---------- */
  CU.gateKind = (p) => {
    const m = p.realm.major, st = p.realm.stage;
    if (m === 0) return 'taixi';
    if (m === 2 && st === 9) return 'zhuji';
    if (m >= 3 && m <= 6) return st < 3 ? 'minor' : ['zifu', 'dongxuan', 'jindan', 'yuanshen'][m - 3];
    if (m === 7) return 'fanxu';
    if (m === 8) return 'chunyang';
    if (m === 9) return st < 3 ? 'sanzai' : 'hedao';
    return null;
  };
  const NEXT = { taixi: { major: 1, stage: 1 }, zhuji: { major: 3, stage: 1 }, zifu: { major: 4, stage: 1 }, dongxuan: { major: 5, stage: 1 }, jindan: { major: 6, stage: 1 }, yuanshen: { major: 7, stage: 1 }, fanxu: { major: 8, stage: 1 }, chunyang: { major: 9, stage: 1 }, hedao: { major: 10, stage: 1 } };
  // 返虚以后每一关都要在自家洞天里冲
  const IN_DONGTIAN = ['fanxu', 'chunyang', 'sanzai', 'hedao'];
  // 此人眼下要渡的是哪一灾（纯阳：返虚冲纯阳是风灾，纯阳一重渡火灾，二重渡雷灾）
  CU.zaiName = (p) => { const k = CU.gateKind(p); return k === 'chunyang' ? C().breakthrough.sanzaiNames[0] : k === 'sanzai' ? C().breakthrough.sanzaiNames[p.realm.stage] : ''; };
  // 元神的「地」、返虚的洞天
  CU.diNote = '大派山门（八派六宗各占一座灵窟，门人才用得上），或在鹤鸣山、九危山这样的六级无主福地开辟洞府';
  CU.nextRealm = (p) => { const k = CU.gateKind(p); return k === 'minor' || k === 'sanzai' ? { major: p.realm.major, stage: p.realm.stage + 1 } : NEXT[k] || null; };
  CU.targetName = (p) => {
    const n = CU.nextRealm(p);
    if (!n) return '';
    const k = CU.gateKind(p);
    if (k === 'sanzai' || k === 'chunyang') return C().realms.names[n.major] + (k === 'sanzai' ? C().realms.stageNames[9][n.stage - 1] : '') + '（渡' + CU.zaiName(p) + '）';
    return k === 'minor' ? P().realmTitle({ realm: n }) : C().realms.names[n.major];
  };
  // 本重修到下一重需要的外药
  CU.minorNeed = (p) => (CU.gateKind(p) === 'minor' ? C().breakthrough.minorNeeds[p.realm.major + '.' + p.realm.stage] || null : null);

  // 主角手上最好的开府真法
  CU.bestKaifu = (s) => s.player.manuals.filter((t) => C().techniques[t].kind === 'kaifu').sort((a, b) => C().techniques[b].grade - C().techniques[a].grade)[0] || null;
  const pickKaifuByGrade = (g) => Object.keys(C().techniques).find((k) => C().techniques[k].kind === 'kaifu' && C().techniques[k].grade === g);

  CU.canAttempt = (s, p, opts) => {
    if (!P().alive(p)) return { ok: false, reason: '已故' };
    const k = CU.gateKind(p);
    const isPlayer = P().isPlayer(s, p);
    if (!k) {
      if (p.realm.major === 1) return { ok: false, reason: P().lianqiOf(p) ? '胎息壮大到头，便自然转入练炁' : '缺一门练炁术，胎息壮大到头也转不进练炁' };
      if (p.realm.major === 2) return { ok: false, reason: '练炁一至八层没有关隘，修满自动晋升' };
      return { ok: false, reason: '已到本版境界上限' };
    }
    if (!P().isFull(p)) return { ok: false, reason: (k === 'taixi' ? '气感尚浅' : '修为未圆满') + '（' + Math.floor(p.progress) + '/' + P().need(p) + '）' };
    if (s.t < p.restUntil) return { ok: false, reason: '上次失败后需休养，至 ' + FX.T.fmt(p.restUntil) };
    if (p.health.state === 'heavy') return { ok: false, reason: '重伤未愈' };
    const B = C().breakthrough;
    const need = CU.minorNeed(p);
    if (need && isPlayer && !(inv(s, p)[need.item] >= need.qty)) return { ok: false, reason: '缺' + C().items[need.item].name + (need.qty > 1 ? '（需 ' + need.qty + ' 份）' : '') + '：' + need.why };
    if (need && !isPlayer && !(opts && opts.items)) return { ok: false, reason: '缺外药' };
    if (k === 'zifu' && isPlayer && !CU.bestKaifu(s)) return { ok: false, reason: '缺一篇开府真法，开辟不了紫府' };
    if (k === 'zifu' && !isPlayer && !(opts && opts.kaifu)) return { ok: false, reason: '缺开府真法' };
    if (k === 'jindan') {
      if (CU.qiFor(s, p) < B.jindan.minQi) return { ok: false, reason: '需在灵机 ' + B.jindan.minQi + ' 级以上之地结丹' };
      if (isPlayer && !(inv(s, p).ningdan > 0)) return { ok: false, reason: '缺凝丹大药（' + C().items.ningdan.where + '）' };
      if (!isPlayer && !(opts && opts.items)) return { ok: false, reason: '缺凝丹大药' };
    }
    if (k === 'yuanshen' && CU.qiFor(s, p) < B.yuanshen.minQi) return { ok: false, reason: '成就元神要有一处「地」：在灵机六级、你用得上的灵窟福地里冲关（' + CU.diNote + '）' };
    if (IN_DONGTIAN.includes(k)) {
      if (!isPlayer) return { ok: false, reason: '没有洞天' };
      if (!s.player.dongtian) return { ok: false, reason: (k === 'fanxu' ? '返虚' : '渡劫') + '要先在东海开辟一座洞天' };
      if (p.locationId !== s.player.dongtian) return { ok: false, reason: '要回到自家洞天里' + (k === 'fanxu' ? '冲关' : '渡劫') };
    }
    return { ok: true, kind: k };
  };

  // 下一步的前置条件清单（界面逐条打勾）。没有关隘的地方也列出来，好让玩家知道缺什么
  CU.requirements = (s, p) => {
    const k = CU.gateKind(p);
    const B = C().breakthrough;
    const I = C().items;
    const has = (item, n) => P().isPlayer(s, p) && (s.player.inv[item] || 0) >= (n || 1);
    if (p.realm.major === 1) {
      const t = P().lianqiOf(p);
      return [
        { label: '胎息壮大到头', ok: P().isFull(p), note: Math.floor(p.progress) + ' / ' + P().need(p) },
        { label: '一门练炁术', ok: !!t, note: t ? '《' + t.name + '》' : '金谷墟市常备劣等练炁术，凡人国集市偶有；拜入玄真派可向长老房请授' },
      ];
    }
    if (!k) return [];
    const out = [{ label: k === 'taixi' ? '气感积累圆满' : '修为圆满', ok: P().isFull(p), note: Math.floor(p.progress) + ' / ' + P().need(p) }];
    if (k === 'taixi') {
      const near = p.nearDeathT !== null && s.t - p.nearDeathT <= B.taixi.lifeDeathYears * C().daysPerYear;
      out.push({ label: '近 ' + B.taixi.lifeDeathYears + ' 年在生死之间走过一遭（可选：+' + B.taixi.lifeDeath + '%）', ok: near, optional: true, note: '死生畏怖，神明自得；身受重伤后活下来的人更容易悟得胎息' });
    }
    if (k === 'zhuji') out.push({ label: I.zhuji.name + '（可选：+' + B.zhuji.pill + '%）', ok: has('zhuji'), optional: true, note: I.zhuji.where + '，约 ' + I.zhuji.price + ' 符钱' });
    const need = CU.minorNeed(p);
    if (need) out.push({ label: I[need.item].name + (need.qty > 1 ? ' ×' + need.qty : ''), ok: has(need.item, need.qty), note: need.why + '。' + I[need.item].where + '，约 ' + I[need.item].price + ' 符钱一份' });
    if (k === 'zifu') {
      const kf = P().isPlayer(s, p) ? CU.bestKaifu(s) : null;
      out.push({ label: '一篇开府真法', ok: !!kf, note: kf ? '《' + C().techniques[kf].name + '》' : '金谷墟市常备下乘开府真法；宗门弟子筑基后可向长老房请授；上乘的只在大派世族流转' });
    }
    if (k === 'jindan') {
      out.push({ label: '在灵机 ' + B.jindan.minQi + ' 级以上、你能用的地方', ok: CU.qiFor(s, p) >= B.jindan.minQi, note: '此处你能借到 ' + CU.qiFor(s, p) + ' 级' });
      out.push({ label: I.ningdan.name, ok: has('ningdan'), note: I.ningdan.where + '，约 ' + I.ningdan.price + ' 符钱' });
    }
    if (k === 'yuanshen') {
      out.push({ label: '一处「地」：灵机六级、你用得上的灵窟福地', ok: CU.qiFor(s, p) >= B.yuanshen.minQi, note: CU.diNote + '。此处你能借到 ' + CU.qiFor(s, p) + ' 级' });
      out.push({ label: I.dingshen.name + '（可选：+' + B.yuanshenPill + '%）', ok: has('dingshen'), optional: true, note: I.dingshen.where + '，约 ' + I.dingshen.price + ' 符钱' });
      if (has('xudu')) out.push({ label: I.xudu.name + '（可选：+' + B.xuduPill + '%）', ok: true, optional: true, note: '丹元大会魁首所得' });
    }
    if (IN_DONGTIAN.includes(k)) {
      const dt = P().isPlayer(s, p) && s.player.dongtian;
      out.push({ label: '一座自家洞天', ok: !!dt, note: dt ? '在' + s.places[dt].name : '元神真人可在东海开辟洞天，要 ' + C().dongtian.cost + ' 符钱、三年工夫' });
      out.push({ label: '人在自家洞天里' + (k === 'fanxu' ? '' : '（三灾临头，只有洞天护得住）'), ok: !!dt && p.locationId === dt });
      if ((k === 'chunyang' || k === 'sanzai') && has('xudu')) out.push({ label: I.xudu.name + '（可选：+' + B.xuduZai + '%）', ok: true, optional: true, note: '天运青睐，消弭些灾数' });
    }
    out.push({ label: '没有重伤', ok: p.health.state !== 'heavy' });
    if (p.restUntil > s.t) out.push({ label: '失败后休养期已过', ok: false, note: '至 ' + FX.T.fmt(p.restUntil) });
    return out;
  };

  // 成功率与每一项修正（决定前必须列出）。opts.pill：NPC 是否有大造元珠；opts.kaifuGrade：NPC 开府真法品第
  CU.chance = (s, p, opts) => {
    const B = C().breakthrough;
    const k = CU.gateKind(p);
    if (!k) return null;
    const isPlayer = P().isPlayer(s, p);
    const parts = [];
    const cfg = B[k];
    parts.push({ label: '基础成功率', value: cfg.base });
    parts.push({ label: '资质 ' + p.aptitude, value: U.round1((p.aptitude - 50) * (cfg.aptFactor || B.aptitudeFactor)) });
    if (k === 'taixi') {
      if (p.nearDeathT !== null && s.t - p.nearDeathT <= cfg.lifeDeathYears * C().daysPerYear) parts.push({ label: '借生死得胎息', value: cfg.lifeDeath });
    }
    let hasPill = false, kaifu = null;
    if (k === 'zhuji') {
      const t = P().lianqiOf(p);
      const tier = t ? t.tier : 1;
      parts.push({ label: '真炁' + C().tierNames[tier], value: (tier - 4) * 2 });
      hasPill = isPlayer ? inv(s, p).zhuji > 0 : !!(opts && opts.pill);
      if (hasPill) parts.push({ label: '服用' + C().items.zhuji.name, value: cfg.pill });
    }
    if (k === 'zifu' || k === 'dongxuan' || k === 'jindan') {
      if (p.daoji) parts.push({ label: C().daojiNames[p.daoji], value: B.daojiMod[p.daoji] });
    }
    if (k === 'zifu') {
      kaifu = isPlayer ? CU.bestKaifu(s) : pickKaifuByGrade((opts && opts.kaifuGrade) || 1);
      if (kaifu) parts.push({ label: '《' + C().techniques[kaifu].name + '》（' + C().gradeNames[C().techniques[kaifu].grade] + '）', value: B.yixiangMod[C().techniques[kaifu].grade] });
    }
    if ((k === 'dongxuan' || k === 'jindan') && p.yixiang) parts.push({ label: C().yixiangNames[p.yixiang], value: B.yixiangMod[p.yixiang] });
    if (k === 'jindan' && p.jinhong) parts.push({ label: P().jinhongName(p), value: C().realms.jinhongBreak[p.jinhong] });
    let hasShen = false, hasXudu = false;
    if (k === 'yuanshen') {
      if (p.danPin) parts.push({ label: P().danPinName(p), value: (5 - p.danPin) * C().realms.danPinBreak });
      hasShen = isPlayer && inv(s, p).dingshen > 0;
      if (hasShen) parts.push({ label: '点上' + C().items.dingshen.name, value: B.yuanshenPill });
      hasXudu = isPlayer && inv(s, p).xudu > 0;
      if (hasXudu) parts.push({ label: '服下' + C().items.xudu.name, value: B.xuduPill });
    }
    if (IN_DONGTIAN.includes(k) && p.xiang) parts.push({ label: P().xiangName(p), value: (p.xiang - 2) * C().realms.xiangBreak });
    if (k === 'fanxu' && p.flags.includes('yanxi')) parts.push({ label: '得颜熙真君指点', value: C().saga.yanxi.fanxu });
    if (k === 'chunyang' || k === 'sanzai') {
      hasXudu = isPlayer && inv(s, p).xudu > 0;
      if (hasXudu) parts.push({ label: '服下' + C().items.xudu.name + '（天运青睐）', value: B.xuduZai });
    }
    if (k !== 'taixi') {
      const qi = CU.qiFor(s, p);
      if (qi >= B.qiBonusMin) parts.push({ label: '灵机 ' + qi + ' 级之地', value: B.qiBonus });
    }
    const accYears = Math.floor(p.fullDays / C().daysPerYear);
    if (accYears > 0) parts.push({ label: '圆满后积累 ' + accYears + ' 年', value: Math.min(B.accumMax, accYears * B.accumPerYear) });
    if (p.failCount > 0 && cfg.failBonus) parts.push({ label: '此前参悟 ' + p.failCount + ' 次，渐有心得', value: Math.min(cfg.failBonusCap, p.failCount * cfg.failBonus) });
    else if (p.failCount > 0) parts.push({ label: '此前失败 ' + p.failCount + ' 次', value: -Math.min(cfg.failCap || Infinity, p.failCount * (cfg.failPenalty || B.failPenalty)) });
    if (p.traits.includes('孤傲')) parts.push({ label: '孤傲', value: C().traits.proudBreak });
    if (p.health.state === 'light') parts.push({ label: '轻伤', value: -5 });
    let total = parts.reduce((a, x) => a + x.value, 0);
    const max = k === 'minor' ? B.max : B.majorMax;
    total = U.clamp(total, B.min, max);
    const death = cfg.deathChance || 0;
    return { kind: k, target: CU.targetName(p), chance: Math.round(total), parts, max, death: Math.round(death * 1000) / 10, tianfa: !!cfg.tianfa, usesPill: hasPill, usesShen: hasShen, usesXudu: hasXudu, kaifu, days: cfg.days };
  };

  CU.attempt = (s, p, opts) => {
    const can = CU.canAttempt(s, p, opts);
    if (!can.ok) return { ok: false, error: can.reason };
    const ch = CU.chance(s, p, opts);
    const B = C().breakthrough;
    const target = ch.target;
    const r = s.rng;
    const isPlayer = P().isPlayer(s, p);
    const need = CU.minorNeed(p);
    if (isPlayer) {
      if (ch.usesPill) s.player.inv.zhuji--;
      if (need) s.player.inv[need.item] -= need.qty;
      if (ch.kind === 'jindan') s.player.inv.ningdan--;
      if (ch.usesShen) s.player.inv.dingshen--;
      if (ch.usesXudu) s.player.inv.xudu--;
    }
    const success = R.next(r) * 100 < ch.chance;
    const res = { ok: true, success, chance: ch.chance, target, kind: ch.kind };
    const causes = (opts && opts.causeIds) || [];
    const fac = P().factionName(s, p);
    const known = isPlayer || P().relValue(s, p.id, s.player.id) !== 0;
    if (success) {
      const next = CU.nextRealm(p);
      if (ch.kind === 'zhuji') { const t = P().lianqiOf(p); p.daoji = P().daojiOf(t ? t.tier : 1); }
      if (ch.kind === 'zifu') { p.kaifuId = ch.kaifu; p.yixiang = C().techniques[ch.kaifu].grade; }
      if (ch.kind === 'minor' && p.realm.major === 5 && p.realm.stage === 2) p.jinhong = CU.jinhongFor(p, R.int(r, 0, 1));
      if (ch.kind === 'jindan') p.danPin = CU.danPinFor(p, R.int(r, 0, 2));
      if (ch.kind === 'yuanshen') p.xiang = CU.xiangFor(p, R.int(r, 0, 3));
      p.progress = 0;
      p.realm = next;
      p.fullDays = 0;
      p.failCount = 0;
      CU.updateLifespan(s, p);
      if (P().realmRank(p) > p.peakRank) p.peakRank = P().realmRank(p);
      const extra = ch.kind === 'zhuji' ? '，筑下' + C().daojiNames[p.daoji] : ch.kind === 'zifu' ? '，开出' + C().yixiangNames[p.yixiang] : ch.kind === 'jindan' ? '，扛过了天罚，丹成' + P().danPinName(p) : ch.kind === 'yuanshen' ? '，扛过了天罚，凝出' + P().xiangName(p) : ch.kind === 'chunyang' ? '，渡过风灾，初成纯阳' : ch.kind === 'sanzai' ? '，渡过' + C().breakthrough.sanzaiNames[p.realm.stage - 1] : ch.kind === 'hedao' ? '，九难尽过，与道合真，成就道君，自此寿与天齐' : p.jinhong && p.realm.major === 5 && p.realm.stage === 3 ? '，凝成' + P().jinhongName(p) : ch.tianfa ? '，扛过了天罚' : '';
      if (isPlayer) {
        res.hid = H().add(s, {
          type: 'breakthrough', tags: ['突破', '成功'], actors: [p.id], key: ch.kind === 'taixi' ? 'taixi_ok' : 'break_ok', pov: true,
          params: { name: p.name, target: ch.kind === 'minor' ? target : P().realmTitle(p), chance: ch.chance, life: P().lifespanTotal(p), extra, ok: true },
          severity: ch.kind === 'minor' ? 3 : 5, causeIds: causes,
        });
        H().markFirst(s, 'break_' + ch.kind, res.hid);
      } else if (ch.kind !== 'minor') {
        res.hid = H().add(s, {
          type: 'npc_break', tags: ['突破'], actors: [p.id], factions: p.factionId ? [p.factionId] : [], key: 'npc_break', pov: known,
          params: { name: p.name, faction: fac, target, ok: true }, severity: p.realm.major >= 4 ? 4 : 2, causeIds: causes,
        });
      }
    } else {
      p.failCount++;
      const cfg = ch.kind === 'minor' ? B.minor : B[ch.kind];
      p.restUntil = s.t + (cfg.restYears || B.restYears) * C().daysPerYear;
      p.fullDays = 0;
      let loss;
      if (ch.kind === 'minor') {
        p.progress = Math.floor(p.progress * (1 - B.minor.failLoss));
        loss = '修为受损一成' + (need ? '，' + C().items[need.item].name + '也白白耗去' : '');
      } else if (cfg.mild) {
        const frac = R.range(r, cfg.failLossMin, cfg.failLossMax);
        p.progress = Math.floor(p.progress * (1 - frac));
        loss = '那一点气感又散了大半，只能从头再养';
      } else {
        const frac = R.range(r, cfg.failLossMin, cfg.failLossMax);
        p.progress = Math.floor(p.progress * (1 - frac));
        P().injure(s, p, 'heavy');
        loss = (ch.tianfa ? '被天罚所伤，' : '') + '修为跌落 ' + Math.round(frac * 100) + '%，身受重伤';
      }
      if (isPlayer) {
        res.hid = H().add(s, {
          type: 'breakthrough', tags: ['突破', '失败'], actors: [p.id], key: ch.kind === 'taixi' ? 'taixi_fail' : 'break_fail', pov: true,
          params: { name: p.name, target, chance: ch.chance, loss, ok: false }, severity: ch.kind === 'minor' || cfg.mild ? 2 : 4, causeIds: causes,
        });
      }
      if (ch.death && R.chance(r, ch.death / 100)) {
        P().kill(s, p, '冲击' + target + '失败' + (ch.tianfa ? '，殒于天罚' : ''), res.hid ? [res.hid] : [], { key: 'break' });
        res.died = true;
      }
    }
    return res;
  };

  /* ---------- NPC 一年的修炼（世界模拟）---------- */
  CU.npcYear = (s, p) => {
    if (!P().alive(p)) return;
    const cc = C().cultivation, B = C().breakthrough;
    const dil = R.range(s.rng, cc.npcDiligence[0], cc.npcDiligence[1]);
    const rate = CU.breakdown(s, p).total;
    if (P().isFull(p) && CU.gateKind(p)) p.fullDays += C().daysPerYear;
    else CU.addProgress(s, p, rate * dil);
    if (!P().isFull(p) || !CU.gateKind(p) || !R.chance(s.rng, B.npcTryChance)) return;
    const fac = p.factionId && s.factions[p.factionId];
    const pillP = B.npcPill[fac ? fac.type : 'none'];
    const opts = {
      pill: R.chance(s.rng, pillP),
      items: R.chance(s.rng, Math.min(1, pillP * 1.5)),
      kaifu: R.chance(s.rng, Math.min(1, pillP + 0.2)),
      kaifuGrade: R.weighted(s.rng, [1, 2, 3], (g) => B.npcKaifu[g]),
    };
    if (CU.canAttempt(s, p, opts).ok) CU.attempt(s, p, opts);
  };

  FX.CU = CU;
})(typeof globalThis !== 'undefined' ? globalThis : this);
