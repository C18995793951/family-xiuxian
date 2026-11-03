/* ============================================================
 * history —— 时间换算、结构化历史记录、叙事流、生平
 * 只写真实发生过的事：所有文本都由记录里的参数拼装。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const U = FX.U;
  const C = () => FX.CONFIG;

  /* ---------- 时间：s.t 为绝对天数，一年 12 个月、每月 30 天 ---------- */
  const T = {
    year: (t) => Math.floor(t / C().daysPerYear),
    month: (t) => Math.floor((t % C().daysPerYear) / C().daysPerMonth) + 1,
    day: (t) => (t % C().daysPerMonth) + 1,
    fmt: (t) => `${T.year(t)} 年 ${T.month(t)} 月`,
    fmtFull: (t) => `${T.year(t)} 年 ${T.month(t)} 月 ${T.day(t)} 日`,
    dur(days) {
      const y = Math.floor(days / C().daysPerYear), rest = days % C().daysPerYear;
      const m = Math.floor(rest / C().daysPerMonth), d = rest % C().daysPerMonth;
      return [y ? y + ' 年' : '', m ? m + ' 个月' : '', d ? d + ' 天' : ''].filter(Boolean).join(' ') || '0 天';
    },
  };
  FX.T = T;

  // 文本模板（config 区块）：同一键可有多个变体，按记录 id 轮换，不消耗随机数
  const TX = (FX.CONFIG.text = {
    start: ['{name}，{origin}，{age} 岁，{realm}。这一年，{name}站在{place}，仙路从此开始。'],
    cultivate: ['{name}在{place}{verb} {dur}，{what} +{gain}{pills}。', '{name}于{place}{verb} {dur}，{what}增长 {gain}{pills}。'],
    cultivate_idle: ['{name}在{place}{verb} {dur}，{what}已到头，未见增长。'],
    cultivate_cut: ['{name}的{verb}在第 {done} 天被打断（原定 {dur}），{what} +{gain}{pills}。'],
    realm_up: ['{name}修为精进，晋入{realm}。'],
    lianqi_start: ['{name}胎息壮大到头，依《{tech}》采气炼炁，踏入练炁境界，从此可称羽士。'],
    taixi_ok: ['{name}静坐中忽有所感，证得胎息气感（成功率 {chance}%），从此脱离凡身，寿元上限增至 {life}。', '{name}悟得那一点先天真阳（成功率 {chance}%），成就胎息。'],
    taixi_fail: ['{name}参悟胎息未成（成功率 {chance}%），{loss}。'],
    break_ok: ['{name}冲击{target}成功（成功率 {chance}%）{extra}，寿元上限增至 {life}。', '{name}以 {chance}% 之机破关，成就{target}{extra}。'],
    break_fail: ['{name}冲击{target}失败（成功率 {chance}%），{loss}。'],
    travel: ['{name}自{from}赶到{to}，路上走了 {dur}。'],
    travel_cut: ['{name}自{from}前往{to}，行至{at}出了变故。'],
    explore_nothing: ['{name}在{place}游历 {dur}，一无所获。', '{name}在{place}转了 {dur}，没遇上什么事。', '{name}在{place}走了 {dur}，只看了些山水。'],
    explore_herb: ['{name}在{place}采得{loot}。'],
    yao_found: ['{name}在{place}寻药{dur}，采得凝丹外药「{yao}」{hurt}。', '{name}在{place}踏遍深处，寻得一份{yao}{hurt}。'],
    yao_none: ['{name}在{place}寻药{dur}，一无所获{hurt}。', '{name}在{place}找了{dur}外药，空手而回{hurt}。'],
    yanxi_cang: ['{name}在{place}破开前人遗府的残禁，深处竟是颜熙真人当年留在南域的一处天外道藏：一卷空空道人所传的《大无相常融真炁》修行法，一篇劫仙之祖为它创下的《散景敛形术》。'],
    hall_join: ['{name}{from}入玉宸{hall}任职，为{post}。{hall}{duty}；职权：{perk}。'],
    neiyao: ['{name}在洞玄三重温养日久，身内凝成内药「{yao}」：{desc}。十三味大药已得 {n} 味。'],
    explore_rumor: ['{name}在{place}听闻：{rumor}'],
    explore_trouble: ['{name}在{place}{what}，损失符钱 {loss}。'],
    explore_trouble_none: ['{name}在{place}{what}，好在身上没什么值钱东西。'],
    explore_fortune: ['{name}在{place}得了一桩机缘：{loot}。'],
    explore_fortune_downgraded: ['{name}在{place}寻到一处旧人洞府，只剩些残余：{loot}。'],
    meet: ['{name}在{place}结识了{other}（{realm}，{faction}）。'],
    meet_cold: ['{name}在{place}想结交{other}，对方并不搭理。'],
    befriend: ['{name}拜访{other}，相谈{how}，关系 {delta}。'],
    consult: ['{name}向{other}请教修行，修为 +{gain}。'],
    consult_refused: ['{name}想向{other}请教，被婉拒了。'],
    fight_win: ['{name}与{foe}斗法得胜（胜率 {chance}%），{loot}。'],
    fight_lose: ['{name}与{foe}斗法落败（胜率 {chance}%），{hurt}。'],
    flee_ok: ['{name}从{foe}手下脱身（成功率 {chance}%）。'],
    flee_fail: ['{name}没能从{foe}手下逃脱（成功率 {chance}%），{hurt}。'],
    avoid: ['{name}远远避开了{foe}，未起冲突。'],
    work: ['{name}在{place}做了 {dur}「{job}」，得符钱 {stone}{merit}。'],
    stipend: ['{faction}发放今年的俸禄：{what}。'],
    join_ok: ['{name}求入{faction}，得以拜入门下（{chance}%）。'],
    join_fail: ['{name}求入{faction}，没有被收下（{chance}%）。'],
    sect_learn: ['{name}向{faction}长老房请授了《{tech}》。'],
    sect_learn_merit: ['{name}以 {cost} {merit}向{faction}换得《{tech}》。'],
    redeem: ['{name}以 {cost} {merit}从{faction}库藏换得{item}。'],
    submit: ['{name}向{faction}上交{what}，记 {gain} {merit}。'],
    saga_notice: ['东弥州传开了风声：{year} 年将有「{what}」。{hint}。'],
    saga_open_tianmo: ['「{what}」起：{hint}。'],
    saga_open_danyuan: ['胥都天气运大势所趋，「{what}」开期已到：{hint}。'],
    danyuan_enter: ['{name}随{faction}的真传一道，赴胥都天的丹元大会。'],
    danyuan: ['{name}在丹元大会上{what}。'],
    saga_open_dabi: ['齐云山上云旗招展，「{what}」开场：{hint}。'],
    dabi_enter: ['{name}以{yuan}门人的身份登上齐云山，赴玉宸四院大比。'],
    dabi: ['{name}在玉宸四院大比上{what}。'],
    saga_open_liuhuo: ['鹤鸣山上空霞光大作，「{what}」：{hint}。'],
    yanxi: ['{name}到东海拜谒颜熙真君：{what}。'],
    dongtian: ['{name}花了 {cost} 符钱、三年工夫，在{place}开辟出一方洞天。'],
    transfer: ['{name}持道脉符书离了{from}，改投{faction}门下{note}。'],
    leave: ['{name}辞出{faction}，从此是散修。'],
    outer_first: ['{name}驾遁光越过万里荒原，第一次到了东弥州的{region}。'],
    saga_open_diyuan: ['「{what}」：地渊开了，玄真派奉事房发下地渊符诏，各路散修也往那里去。{hint}。'],
    saga_open_xiefang: ['「{what}」：花神府开宴，广招散修。{hint}。'],
    saga_open_jiaokao: ['「{what}」：玉宸派的巡照道人到了南域，查校各家道脉。{hint}。'],
    xiefang_enter: ['{name}交了 {fee} 符钱供奉，赴花神府撷芳宴。'],
    xiefang_win: ['{name}在撷芳宴上连胜三场，拜入{faction}门下。'],
    jiaokao: ['{name}应玉宸派道脉校考，{what}。'],
    dongfu: ['{name}花了 {cost} 符钱，在{place}{how}。'],
    post_up: ['{name}在{faction}升任{post}。'],
    post_leader: ['{name}成为{faction}的{post}。'],
    order: ['{name}在{place}付了 {cost} 符钱，托人代寻{item}，约 {dur}后送到。'],
    order_arrive: ['{place}托人代寻的{item}送到了{name}手上。'],
    rest: ['{name}在{place}静养 {dur}，{state}。'],
    buy: ['{name}在{place}买下{item}×{qty}，花去符钱 {cost}。'],
    sell: ['{name}在{place}卖出{item}×{qty}，得符钱 {gain}。'],
    use_item: ['{name}服下{item}，{effect}。'],
    practice: ['{name}参习{rank}《{tech}》{dur}，{state}。'],
    art_up: ['{name}参习{rank}《{tech}》{dur}，{state}。'],
    jilian: ['{name}给{gear}打入 {n} 道禁制，如今是{title}。'],
    lianxing: ['{name}把{gear}再炼形一次，成了{grade}{extra}。'],
    lianhua: ['{name}炼化{gear}的器灵，到了 {ling}%。'],
    lianhua_done: ['{name}把{gear}的器灵炼化到底，从此如臂使指。'],
    chongzhu: ['{name}把{item}熔进{gear}重铸，材质够炼形到{cap}了。'],
    sell_gear: ['{name}卖掉{gear}，得符钱 {gain}。'],
    learn: ['{name}改修《{tech}》{loss}。'],
    learn_first: ['{name}得了《{tech}》，往后便依此法采气炼炁。'],
    cultivate_coin: ['{name}在{place}以符钱修行 {dur}，耗去符钱 {cost}，{what} +{gain}{pills}。'],
    injury_heal: ['{name}伤势痊愈。'],
    heal_auto: ['{name}伤重，服下一颗{item}护住内腑。'],
    disturb: ['{name}闭关时，{what}。'],
    npc_break: ['传闻：{name}（{faction}）成就{target}。'],
    npc_death: ['传闻：{name}（{faction}，{realm}）{cause}，年 {age}。'],
    npc_join: ['{name}加入{faction}。'],
    death_generic: ['{name}卒，年 {age}，{realm}，死因：{cause}。'],
    death_lifespan: ['{name}寿元耗尽，坐化于 {age} 岁，终究止步{realm}。', '{name}大限已至，{age} 岁坐化，修为{realm}。'],
    death_break: ['{name}{cause}，身死道消，年 {age}。'],
    death_fight: ['{name}{cause}，殒命于{place}，年 {age}。'],
    death_injury: ['{name}重伤不治，年 {age}。'],
    ending: ['{name}的一生结束了：{what}。'],
    event: ['{title}：{choice}。{result}'],
  });

  const H = {};

  // pov：主角亲身经历或亲眼所见（进叙事流）；其余为世界记录，只在“传闻”里露出重要的
  H.add = (s, e) => {
    const id = 'h' + s.nextHistId++;
    const entry = {
      id,
      t: s.t,
      year: s.year,
      type: e.type,
      tags: e.tags || [],
      actors: e.actors || [],
      factions: e.factions || [],
      places: e.places || [],
      key: e.key,
      params: e.params || {},
      severity: e.severity || 1,
      pov: !!e.pov,
      causeIds: (e.causeIds || []).filter(Boolean),
      firstOf: null,
      record: null,
    };
    s.history.push(entry);
    return id;
  };

  H.get = (s, id) => {
    // 历史按 id 递增追加，二分查找
    const n = parseInt(String(id).slice(1), 10);
    let lo = 0, hi = s.history.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const m = parseInt(s.history[mid].id.slice(1), 10);
      if (m === n) return s.history[mid];
      if (m < n) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  };

  H.text = (entry) => {
    const vs = TX[entry.key] || ['{key}'];
    const n = parseInt(entry.id.slice(1), 10) || 0;
    const tpl = vs[n % vs.length];
    // 旧存档里的条目可能没有后来加的可选参数，按空串补上
    return U.fill(tpl, Object.assign({ key: entry.key, pills: '', merit: '', note: '' }, entry.params));
  };

  H.markFirst = (s, key, hid) => {
    if (!hid || s.records.firsts[key]) return false;
    s.records.firsts[key] = hid;
    const e = H.get(s, hid);
    if (e) { e.firstOf = key; e.severity = Math.max(e.severity, 3); }
    return true;
  };

  // 叙事流：主角经历 + 重要传闻（重要度 ≥ 4 的世界大事）
  H.feed = (s, limit) => {
    const out = [];
    for (let i = s.history.length - 1; i >= 0 && out.length < (limit || 60); i--) {
      const e = s.history[i];
      if (e.pov || e.severity >= 4) out.push({ id: e.id, t: e.t, pov: e.pov, severity: e.severity, type: e.type, text: H.text(e) });
    }
    return out;
  };

  // 前因链（最多向上追 depth 层）
  H.causeChain = (s, id, depth) => {
    const out = [];
    let layer = [id];
    const seen = new Set([id]);
    for (let d = 0; d < (depth || 3); d++) {
      const next = [];
      for (const x of layer) {
        const e = H.get(s, x);
        if (!e) continue;
        for (const c of e.causeIds) if (!seen.has(c)) { seen.add(c); next.push(c); const ce = H.get(s, c); if (ce) out.push(ce); }
      }
      layer = next;
    }
    return out;
  };
  H.consequences = (s, id) => s.history.filter((e) => e.causeIds.includes(id));

  /* ---------- 生平 ---------- */
  H.lifeSummary = (s, p) => {
    const P = FX.P;
    const pl = s.player && s.player.id === p.id ? s.player : null;
    const brks = s.history.filter((e) => e.type === 'breakthrough' && e.actors[0] === p.id && e.params.ok).map((e) => `${e.year} 年成${e.params.target}`);
    const fails = s.history.filter((e) => e.type === 'breakthrough' && e.actors[0] === p.id && !e.params.ok).length;
    const rels = P.relationsOf(s, p.id).map((r) => ({ other: r.a === p.id ? r.b : r.a, type: r.type, strength: r.strength }));
    const friends = rels.filter((r) => r.type === 'close' && r.strength >= C().relations.closeThreshold).map((r) => P.name(s, r.other));
    const foes = rels.filter((r) => r.type === 'feud').map((r) => P.name(s, r.other));
    const fac = p.factionId && s.factions[p.factionId] ? s.factions[p.factionId].name : '无门无派';
    const parts = [];
    parts.push(`${p.name}，${p.sex === 'M' ? '男' : '女'}，生于 ${p.birthYear} 年，${fac}。`);
    parts.push(`资质 ${p.aptitude}${p.daoji ? '，' + C().daojiNames[p.daoji] : ''}${p.yixiang ? '，' + C().yixiangNames[p.yixiang] : ''}。修至${P.realmName(p)}${brks.length ? '，' + brks.join('，') : ''}${fails ? `；冲关失败 ${fails} 次` : ''}。`);
    if (pl) {
      const st = pl.stats;
      parts.push(`一生修炼 ${T.dur(st.cultivateDays)}，游历 ${st.explores} 次（${st.exploreNothing} 次空手而归），斗法 ${st.fights} 场、胜 ${st.wins} 场，走过 ${pl.visited.length} 处地方。`);
    }
    if (friends.length) parts.push(`交好：${friends.join('、')}。`);
    if (foes.length) parts.push(`结怨：${foes.join('、')}。`);
    if (p.status === 'dead') parts.push(`${p.deathYear} 年${p.deathCause}，享年 ${p.deathYear - p.birthYear}。`);
    return parts.join('');
  };

  FX.H = H;
})(typeof globalThis !== 'undefined' ? globalThis : this);
