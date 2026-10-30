/* ============================================================
 * events-data（config 区块）—— 事件定义
 * 每个事件：引用具体人物/势力，选项写明成本、风险、可能结果，后果落到数值。
 * draw: true 表示开年可被抽取；否则只能由其他事件、延迟队列或年度结算触发。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;
  const F = () => FX.Family;
  const Ev = () => FX.Ev;

  const res = (s) => s.family.resources;
  const pp = (s, id) => s.people[id];
  const loy = (p, d) => { p.loyalty = U.clamp(Math.round(p.loyalty + d), 0, 100); };
  const rel = (s, f, d) => { if (s.factions[f]) s.factions[f].relToPlayer = U.clamp(s.factions[f].relToPlayer + d, -100, 100); };
  const famPrestige = (s, d) => { s.family.prestige = U.clamp(s.family.prestige + d, 0, FX.CONFIG.familyPrestige.max); };
  const yearIncome = (s) => Math.max(30, FX.Econ.forecast(s).stone);
  const pickP = (s, list) => (list.length ? R.pick(s.rng, list.sort((a, b) => (a.id < b.id ? -1 : 1))) : null);
  const head = (s) => s.people[s.family.headId];
  const branchName = (b) => (b === 'main' ? '嫡系' : '旁支');

  const EV = {};

  /* ---------------- 修炼 ---------------- */
  EV.E01 = {
    name: '灵根觉醒', category: '修炼', chain: 'C07', weight: 6, cooldown: 1, draw: true, severity: 3,
    bind(s) {
      const kids = P().living(s).filter((p) => P().age(s, p) >= 6 && P().age(s, p) <= 10 && ['single', 'mutant'].includes(p.root.type) && !p.flags.includes('觉醒'));
      const k = pickP(s, kids);
      return k ? { person: k.id } : null;
    },
    text: (s, b, n) => {
      const p = pp(s, b.person);
      return `${n.person}年方 ${P().age(s, p)} 岁，测出${FX.CONFIG.roots.names[p.root.type]}${p.root.mutant ? '（' + p.root.mutant + '）' : ''}，资质 ${p.aptitude}。族中议论纷纷，如何安置这个孩子？`;
    },
    options: [
      {
        id: 'nurture', label: '重点培养', cost: () => '灵石 -60', risk: (s, b) => '另一分支觉得偏心，支持度 -3',
        outcome: () => '此子资质 +5；若家规为集中培养，列为重点对象', avail: (s) => (res(s).stone >= 60 ? true : '灵石不足'),
        apply(s, b) {
          const p = pp(s, b.person); p.flags.push('觉醒'); res(s).stone -= 60; p.aptitude = Math.min(98, p.aptitude + 5);
          F().addSupport(s, p.branch === 'main' ? 'side' : 'main', -3);
          if (s.family.rules.allocation === 'concentrate' && s.family.focusIds.length < 2) s.family.focusIds.push(p.id);
          return `${p.name}资质升至 ${p.aptitude}，${branchName(p.branch === 'main' ? 'side' : 'main')}略有微词`;
        },
      },
      { id: 'normal', label: '平常对待', cost: () => '无', risk: () => '无', outcome: () => '一切照旧', apply(s, b) { pp(s, b.person).flags.push('觉醒'); return '与族中其他孩子一视同仁'; } },
      {
        id: 'sect', label: '送入青玄宗', irreversible: true, cost: () => '此子离族修行', risk: () => '约 10 年后可能回归反哺，也可能就此脱离家族',
        outcome: () => '青玄宗关系 +12', avail: (s) => (s.factions.qingxuan.relToPlayer >= 0 ? true : '与青玄宗关系低于 0'),
        apply(s, b, ctx) {
          const p = pp(s, b.person); p.flags.push('觉醒', '宗门弟子'); rel(s, 'qingxuan', 12);
          P().leave(s, p, '被送入青玄宗修行', [ctx.hid], 'leave');
          Ev().schedule(s, 'E01R', 2, { _who: p.id }, [ctx.hid]);
          return `${p.name}拜入青玄宗，青玄宗关系 +12`;
        },
      },
    ],
  };
  EV.E01R = {
    name: '宗门弟子归省', category: '修炼', chain: 'C07', severity: 3,
    auto(s, b) {
      const p = pp(s, b._who);
      if (!p || p.status !== 'left') return '音讯已断';
      const roll = R.next(s.rng);
      if (roll < 0.45) {
        p.status = 'alive'; p.leftYear = null; p.leftCause = null; p.duty = { type: null, target: null }; p.attention = '宗门归来';
        p.realm = { major: 1, stage: Math.max(p.realm.stage, R.int(s.rng, 6, 9)) }; FX.CU.updateLifespan(s, p);
        res(s).qiju += 3; rel(s, 'qingxuan', 5);
        return `${p.name}学成归来，修为${P().realmName(p)}，带回聚气丹 3 颗`;
      }
      if (roll < 0.8) { res(s).stone += 120; rel(s, 'qingxuan', 5); return `${p.name}留在宗门，托人捎回灵石 120，以示不忘本`; }
      return `${p.name}已视宗门为家，从此与家族疏远`;
    },
  };

  EV.E03 = {
    name: '顿悟', category: '修炼', weight: 4, cooldown: 2, draw: true, severity: 2,
    bind(s) {
      const c = P().living(s).filter((p) => p.duty.type === 'seclusion' && p.aptitude >= 60 && !P().isFull(p) && p.progress >= P().need(p) * 0.6);
      const p = pickP(s, c);
      return p ? { person: p.id } : null;
    },
    text: '{person}闭关之中忽有所感，似要顿悟。此时若能清场护持，或可一日千里。',
    options: [
      {
        id: 'quiet', label: '清场护持', cost: () => '灵石 -40', risk: () => '无', outcome: () => '修为增加本层所需的 35%',
        avail: (s) => (res(s).stone >= 40 ? true : '灵石不足'),
        apply(s, b) { const p = pp(s, b.person); res(s).stone -= 40; const g = Math.round(P().need(p) * 0.35); p.progress += g; if (p.realm.major > 1 || p.realm.stage === 9) p.progress = Math.min(p.progress, P().need(p)); FX.CU.autoAdvance(s, p); return `${p.name}顿悟，修为 +${g}`; },
      },
      { id: 'let', label: '顺其自然', cost: () => '无', risk: () => '效果减半', outcome: () => '修为增加本层所需的 12%', apply(s, b) { const p = pp(s, b.person); const g = Math.round(P().need(p) * 0.12); p.progress += g; if (p.realm.major > 1 || p.realm.stage === 9) p.progress = Math.min(p.progress, P().need(p)); FX.CU.autoAdvance(s, p); return `${p.name}小有所得，修为 +${g}`; } },
    ],
  };

  EV.E04 = {
    name: '坊市拍卖筑基丹', category: '修炼', weight: 5, cooldown: 3, draw: true, severity: 3,
    bind(s) {
      if ((s.family.buildings.shop || 0) < 1) return null;
      const c = P().living(s).filter((p) => p.realm.major === 1 && p.realm.stage === 9 && p.progress >= P().need(p) * 0.6);
      const p = pickP(s, c);
      return p ? { person: p.id, faction: 'lin', _price: R.int(s.rng, 360, 460) } : null;
    },
    text: (s, b, n) => `坊市传出消息，将拍卖一枚筑基丹。族中${n.person}离筑基只差一步。估价约 ${b._price} 灵石，林家也在打听。`,
    options: [
      { id: 'buy', label: '重金购入', cost: (s, b) => '灵石 -' + b._price, risk: () => '无', outcome: () => '筑基丹 +1', avail: (s, b) => (res(s).stone >= b._price ? true : '灵石不足'), apply(s, b) { res(s).stone -= b._price; res(s).zhuji++; return `以 ${b._price} 灵石拍得筑基丹`; } },
      {
        id: 'joint', label: '联合林家购买', cost: (s, b) => '灵石 -' + Math.round(b._price * 0.55), risk: () => '约 40% 由林家先用，只换得人情',
        outcome: () => '成功则筑基丹 +1；否则林家关系 +8', avail: (s, b) => (s.factions.lin.relToPlayer < 0 ? '林家关系低于 0' : res(s).stone >= Math.round(b._price * 0.55) ? true : '灵石不足'),
        apply(s, b) { res(s).stone -= Math.round(b._price * 0.55); if (R.chance(s.rng, 0.6)) { res(s).zhuji++; rel(s, 'lin', 3); return '与林家合买，筑基丹归本族，林家关系 +3'; } rel(s, 'lin', 8); return '筑基丹归林家先用，林家承情，关系 +8'; },
      },
      { id: 'pass', label: '放弃', cost: () => '无', risk: () => '错过机会', outcome: () => '无', apply() { return '无力竞价，只得作罢'; } },
    ],
  };

  /* ---------------- 经济（C01 贪墨链）---------------- */
  EV.E06 = {
    name: '私售灵药', category: '经济', chain: 'C01', weight: 5, cooldown: 3, draw: true, severity: 3,
    bind(s) {
      const all = P().adults(s);
      const avg = U.sum(all, (p) => p.wealth) / Math.max(1, all.length);
      const c = all.filter((p) => p.traits.includes('贪婪') && ['field', 'alchemy'].includes(p.duty.type) && (p.wealth < avg / 2 || p.flags.includes('私吞')));
      const p = pickP(s, c);
      return p ? { person: p.id } : null;
    },
    text: (s, b, n) => `有人举报：负责${FX.CONFIG.duties[pp(s, b.person).duty.type].name}的${n.person}私下把灵药卖给外人，中饱私囊。`,
    options: [
      {
        id: 'pardon', label: '宽恕', cost: () => '家主威望 -2', risk: () => '2 个回合后若仍掌产业，约 60% 贪墨扩大，损失约年收入 30%', outcome: () => '此人忠诚 +5，正直者忠诚 -3',
        apply(s, b, ctx) { const p = pp(s, b.person); loy(p, 5); F().addHeadPrestige(s, -2); for (const q of P().living(s)) if (q.traits.includes('正直')) loy(q, -3); Ev().schedule(s, 'E06A', 2, { person: p.id }, [ctx.hid], 0.6); return `${p.name}感恩戴德，族中正直之人颇有微词`; },
      },
      {
        id: 'fine', label: '罚没财产', cost: () => '无', risk: (s, b) => '此人忠诚 -15，其亲近者与家主结怨', outcome: (s, b) => '追回灵石约 ' + Math.round(pp(s, b.person).wealth * 0.8) + '，家主威望 +3',
        apply(s, b) { const p = pp(s, b.person); const g = Math.round(p.wealth * 0.8); p.wealth -= g; res(s).stone += g; loy(p, -15); F().addHeadPrestige(s, 3); const h = head(s); for (const r of P().relationsOf(s, p.id)) if (r.type === 'close' && h) { const o = r.a === p.id ? r.b : r.a; if (o !== h.id) P().adjustRelation(s, o, h.id, -25, '处置不公'); } p.flags = p.flags.filter((f) => f !== '私吞'); return `追回灵石 ${g}，${p.name}怀恨在心`; },
      },
      {
        id: 'demote', label: '撤销职位', cost: () => '空出的差事需补位', risk: () => '此人忠诚 -8', outcome: () => '改派驻守或闭关',
        apply(s, b) { const p = pp(s, b.person); loy(p, -8); FX.Sim.setDutyRaw(s, p, P().hasRoot(p) && p.realm.major > 0 ? 'guard' : 'industry', null, '因私售灵药被撤职'); p.attention = '被撤职'; p.flags = p.flags.filter((f) => f !== '私吞'); return `${p.name}被撤去职位`; },
      },
      {
        id: 'expel', label: '逐出家族', irreversible: true, cost: () => '失去一名族人', risk: () => '其亲近者忠诚 -10；1 到 3 个回合内可能投靠外人、泄露族情（锋芒 +10）', outcome: () => '家主威望 +2',
        apply(s, b, ctx) { const p = pp(s, b.person); for (const r of P().relationsOf(s, p.id)) if (r.type === 'close') loy(pp(s, r.a === p.id ? r.b : r.a), -10); F().addHeadPrestige(s, 2); p.flags.push('逐出'); P().leave(s, p, '因私售灵药被逐出家族', [ctx.hid], 'leave'); Ev().schedule(s, 'E06B', R.int(s.rng, 1, 3), { _who: p.id }, [ctx.hid], 0.5); return `${p.name}被逐出家门`; },
      },
    ],
  };
  EV.E06A = {
    name: '贪墨扩大', category: '经济', chain: 'C01', severity: 3,
    cond: (s, b) => ['field', 'alchemy', 'shop', 'industry'].includes(pp(s, b.person).duty.type),
    text: (s, b, n) => `${n.person}故态复萌，账目亏空越来越大，查下去还牵出一名同伙。`,
    options: [
      { id: 'purge', label: '内部整肃', cost: (s) => '损失灵石 ' + Math.round(yearIncome(s) * 0.3), risk: () => '此人与同伙忠诚 -15', outcome: () => '家主威望 +4', apply(s, b) { const p = pp(s, b.person); res(s).stone -= Math.min(res(s).stone, Math.round(yearIncome(s) * 0.3)); loy(p, -15); const acc = pickP(s, P().adults(s).filter((q) => q.id !== p.id && q.traits.includes('贪婪'))); if (acc) loy(acc, -15); F().addHeadPrestige(s, 4); FX.Sim.setDutyRaw(s, p, 'guard', null, '贪墨被整肃'); return `${p.name}${acc ? '与同伙' + acc.name : ''}被整肃`; } },
      { id: 'cover', label: '大事化小', cost: (s) => '损失灵石 ' + Math.round(yearIncome(s) * 0.3), risk: () => '家主威望 -5，正直者忠诚 -5', outcome: () => '暂保和气', apply(s, b) { res(s).stone -= Math.min(res(s).stone, Math.round(yearIncome(s) * 0.3)); F().addHeadPrestige(s, -5); for (const q of P().living(s)) if (q.traits.includes('正直')) loy(q, -5); return '账目抹平，族中正直之人寒心'; } },
    ],
  };
  EV.E06B = {
    name: '泄露族情', category: '经济', chain: 'C01', severity: 3,
    auto(s, b) { s.family.edgeResidue += 10; rel(s, 'zhao', -5); const p = pp(s, b._who); return `${p ? p.name : '被逐者'}投靠赵家，把族中底细和盘托出，锋芒 +10，赵家关系 -5`; },
  };

  EV.E07 = {
    name: '资金断裂', category: '经济', chain: 'C13', weight: 0, cooldown: 2, severity: 3,
    text: (s) => `库中灵石只剩 ${Math.round(res(s).stone)}，不够两年维护（每年约 ${Math.round(FX.Econ.upkeep(s) + FX.Econ.consumption(s).stone)}）。再不想办法，建筑效率减半、族人离心。`,
    options: [
      { id: 'loan', label: '向林家借贷', cost: () => '2 个回合后须还 260 灵石', risk: () => '逾期则林家关系 -20', outcome: () => '灵石 +200', avail: (s) => (s.family.debts.length ? '旧债未清，林家不肯再借' : s.factions.lin.relToPlayer >= 0 ? true : '林家关系低于 0'), apply(s, b, ctx) { res(s).stone += 200; s.family.debts.push({ to: 'lin', amount: 260, dueTurn: s.turn + 2, hid: ctx.hid }); Ev().schedule(s, 'E07D', 2, { faction: 'lin' }, [ctx.hid]); return '林家借出 200 灵石'; } },
      {
        id: 'sell', label: '变卖产业', irreversible: true, cost: () => '最高等级的一座产业建筑降 1 级', risk: () => '产出下降', outcome: () => '换回约六成建造费',
        avail: (s) => (['mine', 'shop', 'field', 'cave', 'alchemy'].some((k) => (s.family.buildings[k] || 0) > 0) ? true : '没有可变卖的产业'),
        apply(s) { const ks = ['mine', 'shop', 'field', 'cave', 'alchemy'].filter((k) => (s.family.buildings[k] || 0) > 0).sort((a, b) => s.family.buildings[b] - s.family.buildings[a]); const k = ks[0]; const lv = s.family.buildings[k]; const g = Math.round(FX.Econ.upgradeCost(k, lv).stone * 0.6); s.family.buildings[k]--; res(s).stone += g; return `变卖${FX.CONFIG.buildings[k].name}一级，得灵石 ${g}`; },
      },
      { id: 'cut', label: '削减开支', cost: () => '全族忠诚 -5，两支支持度 -5', risk: () => '人心浮动', outcome: () => '本回合族人灵石消耗减三成', apply(s) { for (const p of P().living(s)) loy(p, -5); F().addSupport(s, 'main', -5); F().addSupport(s, 'side', -5); s.family.austerityUntil = s.turn + 1; return '族中上下节衣缩食'; } },
    ],
  };
  EV.E07D = {
    name: '林家催债', category: '经济', chain: 'C13', severity: 3,
    text: (s) => { const d = s.family.debts.find((x) => x.to === 'lin'); return `林家上门催还借款 ${d ? d.amount : 0} 灵石。`; },
    cond: (s) => s.family.debts.some((x) => x.to === 'lin'),
    options: [
      { id: 'pay', label: '如数归还', cost: (s) => '灵石 -' + (s.family.debts.find((x) => x.to === 'lin') || {}).amount, risk: () => '无', outcome: () => '林家关系 +5', avail: (s) => (res(s).stone >= (s.family.debts.find((x) => x.to === 'lin') || {}).amount ? true : '灵石不足'), apply(s) { const d = s.family.debts.find((x) => x.to === 'lin'); res(s).stone -= d.amount; s.family.debts = s.family.debts.filter((x) => x !== d); rel(s, 'lin', 5); return '债务还清'; } },
      { id: 'delay', label: '恳请宽限', cost: () => '林家关系 -20', risk: () => '利息加两成，1 个回合后再催；最多宽限两次', outcome: () => '暂缓', avail: (s) => ((s.family.debts.find((x) => x.to === 'lin') || {}).delays >= 2 ? '已宽限两次，林家不再通融' : true), apply(s, b, ctx) { const d = s.family.debts.find((x) => x.to === 'lin'); d.delays = (d.delays || 0) + 1; d.amount = Math.round(d.amount * 1.2); rel(s, 'lin', -20); Ev().schedule(s, 'E07D', 1, { faction: 'lin' }, [ctx.hid]); return `宽限一回合，欠款涨至 ${d.amount}`; } },
      { id: 'default', label: '赖账', irreversible: true, cost: () => '林家关系 -40，家族声望 -40', risk: () => '林家记仇', outcome: () => '债务作废', apply(s) { s.family.debts = s.family.debts.filter((x) => x.to !== 'lin'); rel(s, 'lin', -40); famPrestige(s, -40); s.factions.lin.grudges.push({ year: s.year, what: '赖账' }); return '与林家撕破脸'; } },
    ],
  };

  EV.E22 = {
    name: '灵田虫旱', category: '灾害', weight: 3, cooldown: 3, draw: true, severity: 2,
    bind(s) { if ((s.family.buildings.field || 0) < 1) return null; const p = pickP(s, FX.Econ.workers(s, 'field')); return { person: p ? p.id : s.family.headId }; },
    text: (s, b, n) => `灵田遭了虫害，又逢大旱。${n.person}来报，若不处置，今年收成要减半。`,
    options: [
      { id: 'save', label: '耗灵石救治', cost: (s) => '灵石 -' + 25 * s.family.buildings.field, risk: () => '无', outcome: () => '收成无损', avail: (s) => (res(s).stone >= 25 * s.family.buildings.field ? true : '灵石不足'), apply(s) { res(s).stone -= 25 * s.family.buildings.field; return '请来灵农除虫引水，保住收成'; } },
      { id: 'lose', label: '认了减产', cost: (s) => '灵谷 -' + Math.round(s.family.buildings.field * 12 * 2.5), risk: () => '存粮不足可能挨饿', outcome: () => '不花灵石', apply(s) { const g = Math.round(s.family.buildings.field * 12 * 2.5); res(s).grain = Math.max(0, res(s).grain - g); return `灵谷损失 ${g}`; } },
    ],
  };

  /* ---------------- 关系（C04 庶子不满链）---------------- */
  EV.E10 = {
    name: '旁支请求资源', category: '关系', chain: 'C04', weight: 5, cooldown: 2, draw: true, severity: 3,
    bind(s) {
      if (s.family.branches.side.support >= 50) return null;
      const p = pickP(s, P().adults(s).filter((q) => q.branch === 'side' && q.ambition >= 60 && P().isNative(q)));
      return p ? { person: p.id } : null;
    },
    text: (s, b, n) => `旁支的${n.person}（野心 ${pp(s, b.person).ambition}）带着几位族人来找家主：旁支支持度只有 ${Math.round(s.family.branches.side.support)}，丹药灵石却总轮不到旁支。`,
    options: [
      { id: 'grant', label: '满足', cost: () => '灵石 -80', risk: () => '嫡系可能觉得让步太多（支持度 -3）', outcome: () => '旁支支持度 +10，此人忠诚 +10', avail: (s) => (res(s).stone >= 80 ? true : '灵石不足'), apply(s, b) { res(s).stone -= 80; F().addSupport(s, 'side', 10); F().addSupport(s, 'main', -3); loy(pp(s, b.person), 10); return '拨出 80 灵石给旁支'; } },
      { id: 'half', label: '部分满足', cost: () => '灵石 -40', risk: () => '无', outcome: () => '旁支支持度 +4，此人忠诚 +3', avail: (s) => (res(s).stone >= 40 ? true : '灵石不足'), apply(s, b) { res(s).stone -= 40; F().addSupport(s, 'side', 4); loy(pp(s, b.person), 3); return '拨出 40 灵石'; } },
      { id: 'deny', label: '拒绝', cost: () => '无', risk: () => '旁支支持度 -8，此人忠诚 -10；约半数可能在 2 个回合内暗中结交外人', outcome: () => '保住资源', apply(s, b, ctx) { F().addSupport(s, 'side', -8); loy(pp(s, b.person), -10); Ev().schedule(s, 'E10B', 2, { person: b.person }, [ctx.hid], 0.5); return `${pp(s, b.person).name}悻悻而去`; } },
    ],
  };
  EV.E10B = {
    name: '庶子暗结外人', category: '关系', chain: 'C04', severity: 3,
    text: (s, b, n) => `有人看见${n.person}频频与赵家的人往来，似在谋划什么。`,
    options: [
      { id: 'soothe', label: '安抚', cost: () => '灵石 -60', risk: () => '无', outcome: () => '此人忠诚 +15，旁支支持度 +5', avail: (s) => (res(s).stone >= 60 ? true : '灵石不足'), apply(s, b) { res(s).stone -= 60; loy(pp(s, b.person), 15); F().addSupport(s, 'side', 5); return '许以好处，安抚归心'; } },
      { id: 'watch', label: '派人监视', cost: () => '家主威望 -3', risk: () => '约 40% 被察觉，忠诚 -10', outcome: () => '此人不敢妄动', apply(s, b) { F().addHeadPrestige(s, -3); const p = pp(s, b.person); if (R.chance(s.rng, 0.4)) { loy(p, -10); return `${p.name}察觉被监视，愈发不满`; } return `${p.name}收敛了许多`; } },
      { id: 'exile', label: '放逐', irreversible: true, cost: () => '失去一名族人', risk: () => '旁支支持度 -10', outcome: () => '断其后路', apply(s, b, ctx) { const p = pp(s, b.person); p.flags.push('逐出'); F().addSupport(s, 'side', -10); P().leave(s, p, '暗结外人，被放逐', [ctx.hid], 'leave'); return `${p.name}被放逐`; } },
    ],
  };

  EV.E12 = {
    name: '请求游历', category: '关系', weight: 3, cooldown: 2, draw: true, severity: 2,
    bind(s) {
      const c = P().adults(s).filter((p) => (p.traits.includes('孤傲') || p.traits.includes('野心勃勃')) && p.realm.major >= 1 && s.turn - (p.rankChangedTurn || 0) >= 2 && p.duty.type !== 'travel');
      const p = pickP(s, c);
      return p ? { person: p.id } : null;
    },
    text: (s, b, n) => `${n.person}修为停滞已久，请求外出游历，寻访机缘。`,
    options: [
      { id: 'ok', label: '批准', cost: () => '原差事空出', risk: () => '历练有受伤与死亡风险（每年约 8% / 1%）', outcome: () => '此人改为外出历练，忠诚 +8', apply(s, b) { const p = pp(s, b.person); FX.Sim.setDutyRaw(s, p, 'travel', null, '应其所请外出游历'); loy(p, 8); return `${p.name}收拾行装出门`; } },
      { id: 'no', label: '拒绝', cost: () => '无', risk: () => '此人忠诚 -8', outcome: () => '照旧', apply(s, b) { loy(pp(s, b.person), -8); return `${pp(s, b.person).name}闷闷不乐`; } },
    ],
  };

  EV.E13 = {
    name: '长辈干预分配', category: '关系', weight: 3, cooldown: 3, draw: true, severity: 2,
    bind(s) {
      const c = P().adults(s).filter((p) => P().age(s, p) >= 60 && p.id !== s.family.headId && P().isNative(p) && p.loyalty < 60 && p.childIds.some((id) => P().alive(pp(s, id))));
      const p = pickP(s, c);
      if (!p) return null;
      const kid = p.childIds.map((id) => pp(s, id)).filter((q) => P().alive(q) && P().hasRoot(q)).sort((a, b) => b.aptitude - a.aptitude)[0];
      return kid ? { person: p.id, kid: kid.id } : null;
    },
    text: (s, b, n) => `族中长辈${n.person}对丹药分配不满，要家主多照顾自己的孩子${n.kid}。`,
    options: [
      { id: 'obey', label: '听从', cost: () => '聚气丹 -2，家主威望 -4', risk: () => '他人觉得家主软弱', outcome: () => '长辈忠诚 +10，其子修为小涨', avail: (s) => (res(s).qiju >= 2 ? true : '聚气丹不足'), apply(s, b) { res(s).qiju -= 2; F().addHeadPrestige(s, -4); loy(pp(s, b.person), 10); const k = pp(s, b.kid); k.progress += 20; FX.CU.autoAdvance(s, k); return `两颗聚气丹给了${k.name}`; } },
      { id: 'reject', label: '驳回', cost: () => '无', risk: () => '长辈忠诚 -12', outcome: (s) => (s.family.headAuthority.prestige >= 50 ? '家主威望 +2' : '家主威望 -2（威望不足以服众）'), apply(s, b) { loy(pp(s, b.person), -12); F().addHeadPrestige(s, s.family.headAuthority.prestige >= 50 ? 2 : -2); return `${pp(s, b.person).name}拂袖而去`; } },
      { id: 'mid', label: '折中', cost: () => '灵石 -30', risk: () => '无', outcome: () => '长辈忠诚 +4', avail: (s) => (res(s).stone >= 30 ? true : '灵石不足'), apply(s, b) { res(s).stone -= 30; loy(pp(s, b.person), 4); return '以灵石补偿，各退一步'; } },
    ],
  };

  /* ---------------- 婚嫁 ---------------- */
  EV.E15 = {
    name: '族人自择婚配', category: '婚嫁', weight: 3, cooldown: 2, draw: true, severity: 2,
    bind(s) {
      const p = pickP(s, P().living(s).filter((q) => P().isNative(q) && P().canMarry(s, q) && P().age(s, q) <= 30));
      return p ? { person: p.id, _lover: FX.CONFIG.names.surnames[R.int(s.rng, 0, 60)] + '氏' } : null;
    },
    text: (s, b, n) => `${n.person}与山下一位${b._lover}凡人相恋，请求成婚。`,
    options: [
      { id: 'allow', label: '准许', cost: () => '无', risk: () => '凡人配偶不能修炼，子嗣有 25% 无灵根', outcome: () => '此人忠诚 +10，成婚', apply(s, b, ctx) { const p = pp(s, b.person); loy(p, 10); FX.Sim.marryOutsider(s, p, { mortal: true, surname: b._lover.slice(0, -1) }, [ctx.hid]); return `${p.name}成婚`; } },
      { id: 'forbid', label: '阻止', cost: () => '无', risk: () => '此人忠诚 -15；约 25% 私奔离族', outcome: () => '另觅良配', apply(s, b, ctx) { const p = pp(s, b.person); loy(p, -15); if (R.chance(s.rng, 0.25)) { P().leave(s, p, '婚事被阻，与人私奔', [ctx.hid], 'leave'); return `${p.name}与人私奔`; } return `${p.name}含泪从命`; } },
    ],
  };

  /* ---------------- 散修（C12）---------------- */
  EV.E29 = {
    name: '散修求庇护', category: '冲突', chain: 'C12', weight: 2, cooldown: 4, draw: true, severity: 3,
    bind(s) { return { _name: FX.CONFIG.names.surnames[R.int(s.rng, 0, 80)] + FX.CONFIG.names.male[R.int(s.rng, 0, 39)], _stage: R.int(s.rng, 4, 7) }; },
    text: (s, b) => `一名自称${b._name}的散修（炼气${FX.CONFIG.realms.stageNames[1][b._stage - 1]}）浑身是血地敲开族门，说被仇家追杀，求家族收留。`,
    options: [
      { id: 'take', label: '收留', cost: () => '每年多一份修士消耗', risk: () => '数年内约 35% 牵出魔道仇家', outcome: () => '若平安无事，此人可成为客卿', apply(s, b, ctx) { const g = FX.Sim.createGuest(s, b._name, b._stage); Ev().schedule(s, 'E29B', 2, { person: g.id }, [ctx.hid]); return `${g.name}暂居族中`; } },
      { id: 'drive', label: '驱逐', cost: () => '无', risk: () => '约 30% 日后报复', outcome: () => '免惹是非', apply(s, b, ctx) { Ev().schedule(s, 'E29C', 2, { _name: b._name }, [ctx.hid], 0.3); return `${b._name}含恨离去`; } },
      { id: 'report', label: '上报青玄宗', cost: () => '无', risk: () => '散修一脉结仇', outcome: () => '青玄宗关系 +8', apply(s) { rel(s, 'qingxuan', 8); s.family.edgeResidue += 3; return '青玄宗来人带走散修，关系 +8'; } },
    ],
  };
  EV.E29B = {
    name: '客卿去留', category: '冲突', chain: 'C12', severity: 3,
    rebind: () => null,
    text: (s, b, n) => `收留的${n.person}在族中住了数年。`,
    options: [
      { id: 'resolve', label: '看看结果', cost: () => '无', risk: () => '约 35% 魔道仇家寻上门', outcome: () => '否则此人感恩，成为客卿', apply(s, b) { const p = pp(s, b.person); if (R.chance(s.rng, 0.35)) { const loss = Math.round(res(s).stone * 0.15); res(s).stone -= loss; s.family.edgeResidue += 8; P().leave(s, p, '魔道仇家寻来，仓皇遁走', [], 'leave'); return `魔道修士寻仇而来，损失灵石 ${loss}，锋芒 +8，${p.name}遁走`; } p.flags.push('客卿'); loy(p, 15); return `${p.name}感念收留之恩，正式成为客卿`; } },
    ],
  };
  EV.E29C = {
    name: '散修报复', category: '冲突', chain: 'C12', severity: 3,
    auto(s, b) { const v = pickP(s, P().adults(s).filter((p) => p.health.state === 'healthy' && P().hasRoot(p))); if (!v) return '报复无果'; v.health = { state: 'light', recoverYears: 2 }; return `${b._name}在路上伏击了${v.name}，${v.name}受了轻伤`; },
  };

  /* ---------------- 继承 ---------------- */
  EV.E24 = {
    name: '老祖寿元预警', category: '继承', chain: 'C06', severity: 4,
    text: (s, b, n) => { const p = pp(s, b.person); return `${n.person}（${P().realmName(p)}）剩余寿元仅 ${P().lifespanLeft(s, p)} 年。族中可顶上的修士：${F().successorCultivators(s).slice(0, 3).map((q) => q.name + '（' + P().realmName(q) + '）').join('、') || '无'}。`; },
    options: [
      {
        id: 'break', label: '冲击更高境界', cost: (s, b) => { const c = FX.CU.canAttempt(s, pp(s, b.person)); return c.ok ? '立即尝试突破' : '改为闭关苦修，并赐聚气丹（若有）'; },
        risk: (s, b) => { const ch = FX.CU.canAttempt(s, pp(s, b.person)).ok && FX.CU.chance(s, pp(s, b.person)); return ch ? `成功率 ${ch.chance}%，身死概率 ${ch.death}%` : '修为未满无法立即突破'; },
        outcome: () => '成功则寿元大增',
        apply(s, b, ctx) { const p = pp(s, b.person); const c = FX.CU.canAttempt(s, p); if (c.ok) { const r = FX.CU.attempt(s, p, { causeIds: [ctx.hid] }); return r.success ? `${p.name}破关成功` : `${p.name}突破失败${r.died ? '，坐化' : ''}`; } FX.Sim.setDutyRaw(s, p, 'seclusion', null, '寿元将尽，闭关苦修'); return `${p.name}闭关苦修`; },
      },
      {
        id: 'yanshou', label: '寻延寿丹', cost: (s) => (res(s).yanshou > 0 ? '服用库存延寿丹 1 颗' : '灵石 -300，四处搜寻'), risk: (s) => (res(s).yanshou > 0 ? '无' : '约 35% 能寻到'), outcome: (s, b) => '寿元 +' + (FX.CONFIG.yanshouYears[pp(s, b.person).yanshouTaken] || 0),
        avail: (s, b) => (pp(s, b.person).yanshouTaken >= 3 ? '此人已服满 3 颗' : res(s).yanshou > 0 || res(s).stone >= 300 ? true : '灵石不足'),
        apply(s, b) { const p = pp(s, b.person); if (res(s).yanshou <= 0) { res(s).stone -= 300; if (!R.chance(s.rng, 0.35)) return '花了 300 灵石，一无所获'; res(s).yanshou++; } return FX.Sim.takeYanshou(s, p); },
      },
      {
        id: 'heir', label: '指定继任', cost: () => '无', risk: (s) => { const t = F().rankCandidates(s, s.family.headId)[0]; return t ? '立' + t.p.name + '，接受度 ' + F().acceptance(s, t.p.id, s.family.headId).value : '无合格人选'; }, outcome: () => '两支支持度 +5，传承有序',
        apply(s) { const t = F().rankCandidates(s, s.family.headId).find((x) => x.p.id !== s.family.headId); F().addSupport(s, 'main', 5); F().addSupport(s, 'side', 5); if (t) { s.family.heirId = t.p.id; return '立' + t.p.name + '为继承人'; } return '族中尚无合适人选'; },
      },
    ],
  };

  EV.C06X = {
    name: '群狼环伺', category: '继承', chain: 'C06', severity: 4,
    rebind: (s, b) => (s.family.headId ? Object.assign({}, b, { person: s.family.headId }) : null),
    text: (s, b, n) => `${n.dead}坐化，族中再无筑基修士。消息传开，周边势力虎视眈眈，赵家已派人来"问候"。`,
    options: [
      { id: 'tribute', label: '献上灵石求安', cost: (s) => '灵石 -' + Math.round(res(s).stone * 0.3), risk: () => '被视为示弱', outcome: () => '锋芒 -10，赵家关系 +10', apply(s) { res(s).stone -= Math.round(res(s).stone * 0.3); s.family.edgeResidue = Math.max(-10, s.family.edgeResidue - 10); rel(s, 'zhao', 10); return '破财消灾'; } },
      { id: 'hold', label: '闭门自守', cost: () => '家族声望 -50，全族忠诚 -5', risk: () => '约 30% 一处产业被夺（最高的产业建筑降 1 级）', outcome: () => '保住灵石', apply(s) { famPrestige(s, -50); for (const p of P().living(s)) loy(p, -5); if (R.chance(s.rng, 0.3)) { const ks = ['mine', 'shop', 'field'].filter((k) => (s.family.buildings[k] || 0) > 0); if (ks.length) { const k = ks.sort((a, b) => s.family.buildings[b] - s.family.buildings[a])[0]; s.family.buildings[k]--; return `赵家趁虚而入，夺去${FX.CONFIG.buildings[k].name}一级`; } } return '闭门不出，熬过风头'; } },
      { id: 'sect', label: '求青玄宗照拂', cost: () => '灵石 -100，青玄宗关系 -5（欠人情）', risk: () => '日后宗门征召更频繁', outcome: () => '锋芒 -15', avail: (s) => (s.factions.qingxuan.relToPlayer >= 0 && res(s).stone >= 100 ? true : '关系低于 0 或灵石不足'), apply(s) { res(s).stone -= 100; rel(s, 'qingxuan', -5); s.family.edgeResidue -= 15; s.family.owesSect = (s.family.owesSect || 0) + 1; return '青玄宗放出话来，此族由宗门照看'; } },
    ],
  };

  EV.E26 = {
    name: '老家主退位', category: '继承', weight: 3, cooldown: 3, draw: true, severity: 3,
    bind(s) {
      const h = head(s);
      if (!h || !(P().isOld(s, h) || P().age(s, h) >= 90)) return null;
      const t = F().rankCandidates(s, h.id).find((x) => x.p.id !== h.id && x.p.prestige >= 35);
      return t ? { person: h.id, heir: t.p.id } : null;
    },
    text: (s, b, n) => `家主${n.person}年事已高，族中有人提议由${n.heir}接任，${n.person}退为太上长老专心修行。`,
    options: [
      { id: 'yes', label: '同意', cost: () => '家主更替', risk: (s, b) => '接受度 ' + F().acceptance(s, b.heir, b.person).value, outcome: () => '老家主可专心闭关', apply(s, b) { s.family.heirId = b.heir; const r = F().abdicate(s); if (!r.ok) { F().addHeadPrestige(s, -3); return '退位未成：' + r.error; } FX.Sim.setDutyRaw(s, pp(s, b.person), 'seclusion', null, '退位闭关'); return `${pp(s, b.person).name}退位，${pp(s, b.heir).name}接任`; } },
      { id: 'no', label: '拒绝', cost: () => '家主威望 -5', risk: () => '提议者忠诚 -8', outcome: () => '维持现状', apply(s, b) { F().addHeadPrestige(s, -5); loy(pp(s, b.heir), -8); return '家主不肯退位'; } },
    ],
  };

  EV.S01 = {
    name: '继承争议', category: '继承', chain: 'C11', severity: 4,
    text: (s, b, n) => `${n.person}继位，族人接受度低。呼声颇高的${n.rival}（${branchName(pp(s, b.rival).branch)}）不服，正在串联族人。`,
    options: [
      { id: 'soothe', label: '安抚', cost: () => '灵石 -100，家主威望 -3', risk: () => '无', outcome: () => '落选者忠诚 +15', avail: (s) => (res(s).stone >= 100 ? true : '灵石不足'), apply(s, b) { res(s).stone -= 100; F().addHeadPrestige(s, -3); loy(pp(s, b.rival), 15); return `${pp(s, b.rival).name}暂时接受了结果`; } },
      { id: 'press', label: '压制', cost: () => '无', risk: (s, b) => `阻力判定通过率约 ${Math.round(F().resistChance(s, pp(s, b.rival).branch) * 100)}%；失败则此人出走，其分支支持度 -10`, outcome: () => '成功则家主威望 +5，此人忠诚 -20', apply(s, b, ctx) { const r = pp(s, b.rival); const rs = F().resist(s, r.branch); if (rs.passed) { F().addHeadPrestige(s, 5); loy(r, -20); return `压服了${r.name}`; } F().addSupport(s, r.branch, -10); P().leave(s, r, '争位失败，愤而出走', [ctx.hid], 'leave'); return `${r.name}愤而出走`; } },
      { id: 'yield', label: '让步', irreversible: true, cost: (s, b) => `改由${pp(s, b.rival).name}继位`, risk: () => '新家主威望偏低', outcome: () => '两支支持度 +5', apply(s, b, ctx) { const r = pp(s, b.rival); F().installHead(s, r, '争议后让位', [ctx.hid], 'mid'); F().addSupport(s, 'main', 5); F().addSupport(s, 'side', 5); return `${r.name}继任家主`; } },
    ],
  };

  EV.S02 = {
    name: '无主之危', category: '继承', severity: 4,
    text: (s, b, n) => `族中已无成年本家血脉可承家主之位，只能由${n.person}暂代。人心惶惶。`,
    options: [
      { id: 'council', label: '召集族老共议', cost: () => '无', risk: () => '无', outcome: () => '家主威望 +10，全族忠诚 +3', apply(s) { F().addHeadPrestige(s, 10); for (const p of P().living(s)) loy(p, 3); return '族人同意暂渡难关'; } },
      { id: 'lin', label: '求助林家', cost: () => '林家关系 -5', risk: () => '欠下人情', outcome: () => '灵石 +100', avail: (s) => (s.factions.lin.relToPlayer >= 0 ? true : '林家关系低于 0'), apply(s) { rel(s, 'lin', -5); res(s).stone += 100; return '林家送来 100 灵石'; } },
    ],
  };

  /* ---------------- 人口低谷时的补充 ---------------- */
  EV.R01 = {
    name: '远亲来投', category: '婚嫁', weight: 2, cooldown: 3, draw: true, severity: 3,
    bind(s) { const n = P().natives(s).length; if (n >= 10) return null; return { _n: n }; },
    wmod: (s) => (P().living(s).length < 6 ? 4 : 1),
    text: (s) => `一户自称同宗的远亲携家带口来投，愿意改入族谱，归入旁支。`,
    options: [
      { id: 'take', label: '收留入谱', cost: () => '灵谷消耗增加', risk: () => '旁支人多，分支矛盾可能加剧', outcome: () => '增加一对成年族人与一名孩童', apply(s, b, ctx) { const ids = FX.Sim.addRelatives(s, [ctx.hid]); return `收留${ids.map((id) => pp(s, id).name).join('、')}`; } },
      { id: 'no', label: '婉拒', cost: () => '无', risk: () => '无', outcome: () => '无', apply() { return '赠些盘缠打发走了'; } },
    ],
  };

  for (const k in EV) EV[k].id = k;
  FX.EVENTS = EV;
})(typeof globalThis !== 'undefined' ? globalThis : this);
