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
    if (t.any) return { value: F.match, label: '《' + t.name + '》千般变化、万种属相，此地「' + a + '」气也采得', short: '「' + a + '」气相合' };
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
    // 十方殿分得宵明大泽的一座灵岛
    if (place.key === 'yuchen' && FX.Sect.perkOf(s, p, 'shifang')) return Math.min(C().dongtian.qi, place.qi + 1);
    // 洞府聚灵：最多聚到五级；灵窟福地本身就是六级
    if (FX.Saga.isDongfu(s, p, place.id)) return Math.max(place.qi, Math.min(5, place.qi + C().dongfu.qiBonus));
    return place.qi;
  };

  // 先天金汞（洞玄三重）：按道基、紫府异象定，另有一点机缘（luck 0–1）。1 末 2 下 3 中 4 上
  CU.jinhongFor = (p, luck) => U.clamp(Math.floor(((p.daoji || 1) + (p.yixiang || 1)) / 2) + luck, 1, 4);
  // 金丹品第：成丹时按道基、紫府异象、先天金汞、资质定，另有一点机缘（luck 0–2）。一品最高
  // 十三味大药（n 味）：采得越多品第越高，不齐十三味丹成不了上三品
  CU.danPinFor = (p, luck, n) => U.clamp(14 - ((p.daoji || 1) + (p.yixiang || 1) + (p.jinhong || 1) + Math.floor(p.aptitude / 25) + luck + FX.Yao.pinBonus(n || 0)), FX.Yao.pinCap(n || 0), 9);
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
      const aux = FX.Ars.cultFactor(s, p);
      if (aux) F.push(aux);
      const dz = FX.Sect.perkOf(s, p, 'dazhi'); // 大知殿：不理俗务，专心清修
      if (dz) F.push({ label: '大知殿清修', value: 1 + 0.1 * dz });
    }
    if (P().isOld(s, p)) F.push({ label: '年老', value: cc.oldAgeCoef });
    if (!(opts && opts.healthy) && (p.health.state === 'light' || p.health.state === 'heavy')) F.push({ label: p.health.state === 'heavy' ? '重伤' : '轻伤', value: cc.injury[p.health.state] });
    let total = 1;
    for (const f of F) total *= f.value;
    return { total: Math.round(total * 100) / 100, factors: F };
  };

  CU.updateLifespan = (s, p) => { p.lifespanMax = P().lifespanMaxFor(p.realm.major, p.realm.stage); };

  // 返虚这一段修满时有没有一关（按所选道途；第十三段修满是纯阳三灾的风灾）
  CU.isFanxuGate = (p) => p.realm.major === 8 && (p.realm.stage >= C().realms.maxStage[8] || P().fanxuPath(p).gates.includes(p.realm.stage));
  // 修为封顶（到了要冲关、或缺练炁术的地方）
  CU.capped = (p) => {
    const m = p.realm.major;
    if (m === 1) return !P().lianqiOf(p);
    if (m === 2) return p.realm.stage === 9;
    if (m === 8) return CU.isFanxuGate(p);
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
    // 返虚：九等轮转、玄中三限两途，没有劫关的那几段修满便自然接续
    while (p.realm.major === 8 && !CU.isFanxuGate(p) && p.progress >= P().need(p) && n < 20) {
      p.progress -= P().need(p);
      p.realm.stage++;
      CU.updateLifespan(s, p);
      n++;
    }
    const rk = P().realmRank(p);
    if (rk > p.peakRank) p.peakRank = rk;
    return n;
  };

  // 从凡人起累计的修为（用来算跨层增长）
  CU.total = (p) => {
    const cf = C().realms;
    let b = 0;
    for (let m = 0; m < p.realm.major; m++) for (let st = 1; st <= cf.maxStage[m]; st++) b += P().needAt(p, m, st);
    for (let st = 1; st < p.realm.stage; st++) b += P().needAt(p, p.realm.major, st);
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
    const ms = C().realms.maxStage;
    if (m === 7) return st < ms[7] ? 'zhangguan' : 'fanxu';
    if (m === 8) return st >= ms[8] ? 'chunyang' : CU.isFanxuGate(p) ? 'mizhang' : null;
    if (m === 9) return st < 3 ? 'sanzai' : 'hedao';
    if (m === 10) return 'jiunan';
    return null;
  };
  const NEXT = { taixi: { major: 1, stage: 1 }, zhuji: { major: 3, stage: 1 }, zifu: { major: 4, stage: 1 }, dongxuan: { major: 5, stage: 1 }, jindan: { major: 6, stage: 1 }, yuanshen: { major: 7, stage: 1 }, fanxu: { major: 8, stage: 1 }, chunyang: { major: 9, stage: 1 }, hedao: { major: 10, stage: 1 } };
  // 返虚、渡劫、合道九难都要在自家洞天里；返虚破障另有灵脉的讲究（见 mizhangSite）
  const IN_DONGTIAN = ['fanxu', 'chunyang', 'sanzai', 'hedao', 'jiunan'];
  // 冲关的说法
  const VERB = { taixi: '参悟', zhangguan: '坐关破', mizhang: '破', jiunan: '渡' };
  // 返虚道途：冲返虚时要选的那一条（NPC 一律走十二迷障）
  CU.pathOk = (s, p, key) => {
    const fp = C().realms.fanxuPaths[key];
    if (!fp) return { ok: false, reason: '没有这条道途' };
    if (!P().isPlayer(s, p)) return { ok: key === 'shier', reason: key === 'shier' ? '' : '没有门路' };
    if (fp.needItem && !(s.player.inv[fp.needItem] > 0)) return { ok: false, reason: '没有吃透' + C().items[fp.needItem].name + '（' + C().items[fp.needItem].where + '）' };
    if (fp.minXiang && (p.xiang || 0) < fp.minXiang) return { ok: false, reason: '感悟不足：要' + C().realms.xiangNames[fp.minXiang] + '以上才敢试天考' };
    return { ok: true, reason: '' };
  };
  // 返虚破障的灵脉：在自家洞天、或用得上的灵窟里；玉宸门人凭天谷符诏可进宵明大泽的天谷
  CU.mizhangSite = (s, p) => {
    const B = C().breakthrough.mizhang;
    if (!P().isPlayer(s, p)) return { ok: true, mult: 1, chance: 0, label: '' };
    const place = s.places[p.locationId];
    const qi = CU.qiFor(s, p);
    if (place && place.key === 'yuchen' && qi >= B.minQi && s.player.inv.tiangu > 0) return { ok: true, tiangu: true, mult: B.tiangu.death, chance: B.tiangu.chance, label: '宵明大泽天谷（先天奇府、太乙含真）' };
    if (qi < B.minQi) return { ok: false, qi, mult: 1, chance: 0, label: '' };
    const home = s.player.dongtian === p.locationId;
    return { ok: true, mult: B.deathByQi[Math.min(7, qi)] || 1, chance: 0, label: home ? '自家洞天' : '灵机 ' + qi + ' 级的灵窟' };
  };
  // 此人眼下要渡的是哪一灾（纯阳：返虚冲纯阳是风灾，纯阳一重渡火灾，二重渡雷灾）
  CU.zaiName = (p) => { const k = CU.gateKind(p); return k === 'chunyang' ? C().breakthrough.sanzaiNames[0] : k === 'sanzai' ? C().breakthrough.sanzaiNames[p.realm.stage] : ''; };
  // 元神的「地」、返虚的洞天
  CU.diNote = '大派山门（八派六宗各占一座灵窟，门人才用得上），或在鹤鸣山、九危山这样的六级无主福地开辟洞府';
  CU.nextRealm = (p) => {
    const k = CU.gateKind(p);
    if (k === 'minor' || k === 'sanzai' || k === 'zhangguan' || k === 'mizhang') return { major: p.realm.major, stage: p.realm.stage + 1 };
    if (k === 'jiunan') return p.realm.stage < C().realms.maxStage[10] ? { major: 10, stage: p.realm.stage + 1 } : { major: 11, stage: 1 };
    // 给一份拷贝：境界对象之后会被原地改（小境界 +1），不能和常量表共用
    return NEXT[k] ? Object.assign({}, NEXT[k]) : null;
  };
  CU.targetName = (p, path) => {
    const n = CU.nextRealm(p);
    if (!n) return '';
    const k = CU.gateKind(p);
    if (k === 'sanzai' || k === 'chunyang') return C().realms.names[n.major] + (k === 'sanzai' ? C().realms.stageNames[9][n.stage - 1] : '') + '（渡' + CU.zaiName(p) + '）';
    if (k === 'zhangguan') return '元神第' + P().cn(n.stage) + '重障关';
    if (k === 'mizhang') { const fp = P().fanxuPath(p), i = P().fanxuPassed(p) + 1; return '返虚第' + P().cn(i) + (fp.unit === '障' ? '重迷障' : fp.unit === '等' ? '等轮转' : '限天考'); }
    if (k === 'jiunan') return '合道第' + P().cn(p.realm.stage) + '难';
    if (k === 'fanxu') return '返虚' + (path ? '（' + C().realms.fanxuPaths[path].name + '）' : '');
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
      if (p.realm.major === 8) return { ok: false, reason: P().fanxuPath(p).name + '这一段没有劫关，修满自然接续' };
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
    if (k === 'fanxu') {
      const po = CU.pathOk(s, p, (opts && opts.path) || 'shier');
      if (!po.ok) return { ok: false, reason: po.reason };
    }
    if (k === 'mizhang' && !CU.mizhangSite(s, p).ok) return { ok: false, reason: '破障要以灵脉护住法躯：回自家洞天，或到你用得上的灵窟里（灵机 ' + B.mizhang.minQi + ' 级以上）' };
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
    if (k === 'zhuji') out.push({ label: I.zhuji.name + '（可选：+' + B.zhuji.pill + '%）', item: 'zhuji', ok: has('zhuji'), optional: true, note: I.zhuji.where + '，约 ' + I.zhuji.price + ' 符钱' });
    const need = CU.minorNeed(p);
    if (need) out.push({ label: I[need.item].name + (need.qty > 1 ? ' ×' + need.qty : ''), item: need.item, ok: has(need.item, need.qty), note: need.why + '。' + I[need.item].where + '，约 ' + I[need.item].price + ' 符钱一份' });
    if (k === 'zifu') {
      const kf = P().isPlayer(s, p) ? CU.bestKaifu(s) : null;
      out.push({ label: '一篇开府真法', kaifu: true, ok: !!kf, note: kf ? '《' + C().techniques[kf].name + '》' : '金谷墟市常备下乘开府真法；宗门弟子筑基后可向长老房请授；上乘的只在大派世族流转' });
    }
    if (k === 'jindan') {
      out.push({ label: '在灵机 ' + B.jindan.minQi + ' 级以上、你能用的地方', ok: CU.qiFor(s, p) >= B.jindan.minQi, note: '此处你能借到 ' + CU.qiFor(s, p) + ' 级' });
      out.push({ label: I.ningdan.name, item: 'ningdan', ok: has('ningdan'), note: I.ningdan.where + '，约 ' + I.ningdan.price + ' 符钱' });
      if (P().isPlayer(s, p)) out.push(FX.Yao.requirement(s, p));
    }
    if (k === 'yuanshen') {
      out.push({ label: '一处「地」：灵机六级、你用得上的灵窟福地', ok: CU.qiFor(s, p) >= B.yuanshen.minQi, note: CU.diNote + '。此处你能借到 ' + CU.qiFor(s, p) + ' 级' });
      out.push({ label: I.dingshen.name + '（可选：+' + B.yuanshenPill + '%）', item: 'dingshen', ok: has('dingshen'), optional: true, note: I.dingshen.where + '，约 ' + I.dingshen.price + ' 符钱' });
      if (has('xudu')) out.push({ label: I.xudu.name + '（可选：+' + B.xuduPill + '%）', ok: true, optional: true, note: '丹元大会魁首所得' });
    }
    if (k === 'zhangguan' && P().isPlayer(s, p)) out.push({ label: I.dadong.name + '（可选：服下助长感悟）', item: 'dadong', ok: has('dadong'), optional: true, note: '元神第一外药，修为 +本重所需的三成。' + I.dadong.where });
    // 返虚三途在界面上单列（见 app.js 的 fanxuPaths），这里只提玄中三限的门槛
    if (k === 'fanxu' && P().isPlayer(s, p)) { const po = CU.pathOk(s, p, 'sanxian'); out.push({ label: '可选「玄中三限」：' + I.xuanzhong.name + '，' + C().realms.xiangNames[C().realms.fanxuPaths.sanxian.minXiang] + '以上', item: (s.player.inv.xuanzhong || 0) > 0 ? null : 'xuanzhong', ok: po.ok, optional: true, note: po.ok ? '' : po.reason }); }
    if (k === 'mizhang') {
      const site = CU.mizhangSite(s, p);
      out.push({ label: '以灵脉护住法躯：自家洞天，或用得上的灵窟', ok: site.ok, note: site.ok ? site.label + (site.tiangu ? '，失道之祸大减' : '') : '此处你能借到 ' + CU.qiFor(s, p) + ' 级灵机' });
      if (P().isPlayer(s, p) && p.factionId && s.factions[p.factionId] && s.factions[p.factionId].key === 'yuchen') out.push({ label: I.tiangu.name + '（可选：在宵明大泽破障）', item: 'tiangu', ok: has('tiangu'), optional: true, note: I.tiangu.desc });
    }
    if (IN_DONGTIAN.includes(k)) {
      const dt = P().isPlayer(s, p) && s.player.dongtian;
      out.push({ label: '一座自家洞天', ok: !!dt, note: dt ? '在' + s.places[dt].name : '元神真人可在东海开辟洞天，要 ' + C().dongtian.cost + ' 符钱、三年工夫' });
      out.push({ label: '人在自家洞天里' + (k === 'fanxu' ? '' : '（三灾临头，只有洞天护得住）'), ok: !!dt && p.locationId === dt });
      if ((k === 'chunyang' || k === 'sanzai') && has('xudu')) out.push({ label: I.xudu.name + '（可选：+' + B.xuduZai + '%）', ok: true, optional: true, note: '天运青睐，消弭些灾数' });
    }
    out.push({ label: '没有重伤', ok: p.health.state !== 'heavy' });
    if (p.restUntil > s.t) out.push({ label: '上回冲关失败，还在休养', ok: false, note: '到 ' + FX.T.fmt(p.restUntil) + ' 才能再冲' });
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
    const path = k === 'fanxu' ? (opts && opts.path) || 'shier' : null;
    const fp = P().fanxuPath(p);
    const site = k === 'mizhang' ? CU.mizhangSite(s, p) : null;
    if (k === 'zhangguan' || k === 'jiunan') parts.push({ label: '基础成功率（第' + P().cn(k === 'zhangguan' ? p.realm.stage + 1 : p.realm.stage) + (k === 'zhangguan' ? '重' : '难') + '）', value: cfg.base - cfg.perStage * (p.realm.stage - 1) });
    else if (k === 'mizhang') parts.push({ label: '基础成功率（' + fp.name + '）', value: fp.base });
    else parts.push({ label: '基础成功率', value: cfg.base });
    parts.push({ label: '资质 ' + p.aptitude, value: U.round1((p.aptitude - 50) * (cfg.aptFactor || B.aptitudeFactor)) });
    if (k === 'taixi') {
      if (p.nearDeathT !== null && s.t - p.nearDeathT <= cfg.lifeDeathYears * C().daysPerYear) parts.push({ label: '借生死得胎息', value: cfg.lifeDeath });
    }
    let hasPill = false, kaifu = null;
    if (k === 'zhuji') {
      const t = P().lianqiOf(p);
      const q = t || { tier: 1, pin: 0 };
      parts.push({ label: '真炁' + P().qiGrade(q), value: Math.round((P().qiRank(q) - 14) / 2) });
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
    if (k === 'jindan' && isPlayer) { const yp = FX.Yao.breakPart(s, p); if (yp) parts.push(yp); }
    let hasShen = false, hasXudu = false;
    if (k === 'yuanshen') {
      if (p.danPin) parts.push({ label: P().danPinName(p), value: (5 - p.danPin) * C().realms.danPinBreak });
      hasShen = isPlayer && inv(s, p).dingshen > 0;
      if (hasShen) parts.push({ label: '点上' + C().items.dingshen.name, value: B.yuanshenPill });
      hasXudu = isPlayer && inv(s, p).xudu > 0;
      if (hasXudu) parts.push({ label: '服下' + C().items.xudu.name, value: B.xuduPill });
    }
    if ((IN_DONGTIAN.includes(k) || k === 'zhangguan' || k === 'mizhang') && p.xiang) parts.push({ label: P().xiangName(p), value: (p.xiang - 2) * C().realms.xiangBreak });
    if (site && site.chance) parts.push({ label: site.label, value: site.chance });
    if (k === 'fanxu' && p.flags.includes('yanxi')) parts.push({ label: '得颜熙真君指点', value: C().saga.yanxi.fanxu });
    if (k === 'chunyang' || k === 'sanzai') {
      hasXudu = isPlayer && inv(s, p).xudu > 0;
      if (hasXudu) parts.push({ label: '服下' + C().items.xudu.name + '（天运青睐）', value: B.xuduZai });
      if (fp.zai) parts.push({ label: '以' + fp.name + '证就返虚，劫力削减、天运垂青', value: fp.zai });
    }
    if (k !== 'taixi') {
      const qi = CU.qiFor(s, p);
      if (qi >= B.qiBonusMin) parts.push({ label: '灵机 ' + qi + ' 级之地', value: B.qiBonus });
    }
    const accYears = Math.floor(p.fullDays / C().daysPerYear);
    if (accYears > 0) parts.push({ label: '圆满后积累 ' + accYears + ' 年', value: Math.min(B.accumMax, accYears * B.accumPerYear) });
    if (p.failCount > 0 && cfg.failBonus) parts.push({ label: '此前参悟 ' + p.failCount + ' 次，渐有心得', value: Math.min(cfg.failBonusCap, p.failCount * cfg.failBonus) });
    else if (p.failCount > 0) parts.push({ label: '此前失败 ' + p.failCount + ' 次', value: -Math.min(cfg.failCap || Infinity, p.failCount * (cfg.failPenalty || B.failPenalty)) });
    const aux = FX.Ars.breakPart(s, p, k);
    if (aux) parts.push(aux);
    if (p.traits.includes('孤傲')) parts.push({ label: '孤傲', value: C().traits.proudBreak });
    if (p.health.state === 'light') parts.push({ label: '轻伤', value: -5 });
    let total = parts.reduce((a, x) => a + x.value, 0);
    const max = k === 'minor' ? B.max : B.majorMax;
    total = U.clamp(total, B.min, max);
    let death = cfg.deathChance || 0;
    if (site) death = fp.death * site.mult;
    if ((k === 'chunyang' || k === 'sanzai') && p.realm.major >= 8) death *= fp.zaiDeath;
    return { kind: k, target: CU.targetName(p, opts && opts.path), verb: VERB[k] || '冲击', path, chance: Math.round(total), parts, max, death: Math.round(death * 1000) / 10, tianfa: !!cfg.tianfa, usesPill: hasPill, usesShen: hasShen, usesXudu: hasXudu, usesTiangu: !!(site && site.tiangu), kaifu, days: cfg.days };
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
    // 结丹时采得几味大药（主角按实有，外药随后耗掉；NPC 按出身掷）
    const dayaoN = ch.kind === 'jindan' ? (isPlayer ? FX.Yao.count(s, p) : FX.Yao.npcCount(r, p.factionId ? s.factions[p.factionId] : null)) : 0;
    if (isPlayer) {
      if (ch.usesPill) s.player.inv.zhuji--;
      if (need) s.player.inv[need.item] -= need.qty;
      if (ch.kind === 'jindan') { s.player.inv.ningdan--; FX.Yao.consume(s); }
      if (ch.usesShen) s.player.inv.dingshen--;
      if (ch.usesXudu) s.player.inv.xudu--;
      if (ch.usesTiangu) s.player.inv.tiangu--;
    }
    const success = R.next(r) * 100 < ch.chance;
    const res = { ok: true, success, chance: ch.chance, target, kind: ch.kind, verb: ch.verb };
    const causes = (opts && opts.causeIds) || [];
    const fac = P().factionName(s, p);
    const known = isPlayer || P().relValue(s, p.id, s.player.id) !== 0;
    if (success) {
      const next = CU.nextRealm(p);
      if (ch.kind === 'zhuji') { const t = P().lianqiOf(p); p.daoji = P().daojiOf(t ? t.tier : 1); }
      if (ch.kind === 'zifu') { p.kaifuId = ch.kaifu; p.yixiang = C().techniques[ch.kaifu].grade; }
      if (ch.kind === 'minor' && p.realm.major === 5 && p.realm.stage === 2) p.jinhong = CU.jinhongFor(p, R.int(r, 0, 1));
      // 摄取五精时用了先天五行之精：日后凝丹，五宫雷自显
      if (ch.kind === 'minor' && p.realm.major === 5 && p.realm.stage === 1 && need && need.item === 'wujing' && !p.flags.includes('wujing')) p.flags.push('wujing');
      if (ch.kind === 'jindan') p.danPin = CU.danPinFor(p, R.int(r, 0, 2), dayaoN);
      if (ch.kind === 'yuanshen') p.xiang = CU.xiangFor(p, R.int(r, 0, 3));
      if (ch.kind === 'fanxu') p.fanxuPath = ch.path || 'shier';
      // 小境界里的关：圆满多出来的那点修为接着用（元神障关、返虚破障、合道九难）
      const carry = ch.kind === 'zhangguan' || ch.kind === 'mizhang' || ch.kind === 'jiunan' ? Math.max(0, p.progress - P().need(p)) : 0;
      p.progress = carry;
      p.realm = next;
      p.fullDays = 0;
      p.failCount = 0;
      // 成就元神时破开第一重障关、显化法相；极少数天骄感悟已足，能接连破开两道
      const two = ch.kind === 'yuanshen' && R.chance(r, B.twoGates[p.xiang] || 0);
      if (two) p.realm.stage = 2;
      CU.updateLifespan(s, p);
      if (p.realm.major === 8) CU.autoAdvance(s, p);
      if (P().realmRank(p) > p.peakRank) p.peakRank = P().realmRank(p);
      const extra = ch.kind === 'zhangguan' ? '，感悟已足，法力自然而动，粉碎了这一重障关；法力浑厚了一层，命寿也拔高一筹' + (p.realm.stage === C().realms.maxStage[7] ? '。十二重障关破尽，元神功满' : p.realm.stage === 6 ? '。元神之功已成其半' : '')
        : ch.kind === 'fanxu' ? '，窥破返虚之谜，自判道途「' + P().fanxuPath(p).name + '」'
        : ch.kind === 'mizhang' ? '，扛过了' + (ch.usesTiangu ? '（天谷护住法躯）' : '') + '心魔外魔，' + (p.realm.stage >= C().realms.maxStage[8] ? P().fanxuPath(p).name + '尽数过了，见得本来面目' + (p.fanxuPath === 'sanxian' ? '，从此是一尊御极子' : '') : '道行又进一步')
        : ch.kind === 'jiunan' ? (p.realm.major === 11 ? '，九难尽过，道与身合，功成飞仙，仙业自显，自此寿与天齐' : '，又过一难，道与身合更深一层')
        : ch.kind === 'yuanshen' && two ? '，扛过了天罚，凝出' + P().xiangName(p) + '，又借着感悟接连破开第二重障关'
        : ch.kind === 'zhuji' ? '，筑下' + C().daojiNames[p.daoji] : ch.kind === 'zifu' ? '，开出' + C().yixiangNames[p.yixiang] : ch.kind === 'jindan' ? '，扛过了天罚，丹成' + P().danPinName(p) : ch.kind === 'yuanshen' ? '，扛过了天罚，凝出' + P().xiangName(p) : ch.kind === 'chunyang' ? '，渡过风灾，初成纯阳' : ch.kind === 'sanzai' ? '，渡过' + C().breakthrough.sanzaiNames[p.realm.stage - 1] : ch.kind === 'hedao' ? '，三灾渡尽，与道合真，成就道君；前头还有合道九难' : p.jinhong && p.realm.major === 5 && p.realm.stage === 3 ? '，凝成' + P().jinhongName(p) : ch.tianfa ? '，扛过了天罚' : '';
      if (isPlayer) {
        res.hid = H().add(s, {
          type: 'breakthrough', tags: ['突破', '成功'], actors: [p.id], key: ch.kind === 'taixi' ? 'taixi_ok' : 'break_ok', pov: true,
          params: { name: p.name, target: ch.kind === 'minor' ? target : P().realmTitle(p), chance: ch.chance, life: P().lifespanTotal(p), extra, ok: true },
          severity: ch.kind === 'minor' ? 3 : ch.kind === 'zhangguan' || ch.kind === 'mizhang' ? 4 : 5, causeIds: causes,
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
        loss = ch.kind === 'zhangguan' ? '感悟还欠一丝火候，这一回坐关没能破开障关，白耗了些感悟（修为 -' + Math.round(frac * 100) + '%），并无祸患' : '那一点气感又散了大半，只能从头再养';
      } else if (ch.kind === 'mizhang') {
        const frac = R.range(r, cfg.failLossMin, cfg.failLossMax);
        p.progress = Math.floor(p.progress * (1 - frac));
        P().injure(s, p, 'heavy');
        loss = '为心魔外魔所趁，走火入魔：修为丧失 ' + Math.round(frac * 100) + '%，神智混沌，身受重伤';
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
        P().kill(s, p, ch.kind === 'mizhang' ? '破' + target + '时元灵迷失，沦为守尸之鬼（失道之祸）' : '冲击' + target + '失败' + (ch.tianfa ? '，殒于天罚' : ''), res.hid ? [res.hid] : [], { key: 'break' });
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
    const was = p.realm.major;
    if (CU.canAttempt(s, p, opts).ok) CU.attempt(s, p, opts);
    // 境界上去了，随身的法器、道术也跟着换一换
    if (P().alive(p) && p.realm.major > was) FX.Ars.npcKit(s, p);
  };

  FX.CU = CU;
})(typeof globalThis !== 'undefined' ? globalThis : this);
