/* ============================================================
 * economy —— 资源产出、建筑、坊市、炼丹、消耗与入不敷出
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const C = () => FX.CONFIG;
  const R = FX.RNG;
  const U = FX.U;
  const P = () => FX.P;

  const E = {};

  E.deficitEff = (s) => (s.family.deficit ? C().economy.deficitEff : 1);

  // 个人差事效率：年老、伤病、家规
  E.personEff = (s, p) => {
    let e = 1;
    if (P().isOld(s, p)) e *= C().cultivation.oldAgeCoef;
    e *= P().healthCoef(p);
    e *= FX.Family.ruleBlend(s, 'allocation', (r) => C().rules.allocation[r].dutyEff);
    return e;
  };
  E.workers = (s, duty) => P().living(s).filter((p) => p.duty.type === duty && P().isAdult(s, p));
  // 差事人手加成：每人 +15%，上限为建筑等级 × 每级岗位数
  E.dutyBuilding = { field: 'field', shop: 'shop', industry: 'mine' };
  E.slots = (s, duty) => (s.family.buildings[E.dutyBuilding[duty]] || 0) * C().economy.slotsPerLevel;
  E.staffEff = (s, duty) => Math.min(E.slots(s, duty), U.sum(E.workers(s, duty), (p) => E.personEff(s, p)));
  E.managerMult = (s, duty) => 1 + C().economy.managerBonus * E.staffEff(s, duty);
  E.labor = (s, duty) => C().economy.laborYield[duty] * E.staffEff(s, duty);
  E.hasElement = (s, duty, els) => E.workers(s, duty).some((p) => p.root.elements.some((e) => els.includes(e)));

  E.upkeepCut = (s) => {
    const eff = U.sum(E.workers(s, 'industry'), (p) => E.personEff(s, p));
    return Math.min(C().economy.industryUpkeepMax, eff * C().economy.industryUpkeepCut);
  };

  E.grainCap = (s) => C().economy.grainCapBase + C().economy.grainCapPerField * (s.family.buildings.field || 0);

  E.consumption = (s) => {
    const up = C().realms.upkeep;
    let grain = 0, stone = 0;
    for (const p of P().living(s)) {
      const m = p.realm.major;
      grain += up[m][0];
      let st = up[m][1];
      if (p.duty.type === 'seclusion') st *= 1 + C().realms.seclusionStoneExtra;
      stone += st;
    }
    return { grain, stone };
  };

  E.upkeep = (s) => {
    let total = 0;
    for (const k in C().buildings) total += C().buildings[k].upkeep * (s.family.buildings[k] || 0);
    return total * (1 - E.upkeepCut(s));
  };

  // 产出预估（界面用，与结算同一套公式；不含随机）
  E.forecast = (s) => {
    const cf = C().economy, b = s.family.buildings, d = E.deficitEff(s);
    const out = { grain: 0, herb: 0, stone: 0, ore: 0, parts: [] };
    const fl = b.field || 0;
    const herbPlots = Math.min(s.family.settings.herbPlots, fl);
    // 入不敷出时：商铺、洞府、炼丹房效率减半；灵田灵矿靠人力照常产出，避免死亡螺旋
    const fm = E.managerMult(s, 'field') * (E.hasElement(s, 'field', ['木', '土']) ? 1 + C().roots.elementBonus : 1);
    const fLab = fl ? E.labor(s, 'field') * (fl - herbPlots) / fl : 0;
    out.grain += (fl - herbPlots) * cf.fieldGrain * fm + fLab;
    out.herb += herbPlots * cf.fieldHerb * fm;
    if (fl) out.parts.push({ label: '灵田 ' + fl + ' 级', text: `灵谷 ${Math.round((fl - herbPlots) * cf.fieldGrain * fm + fLab)}（含人手 ${Math.round(fLab)}），灵药 ${U.round1(herbPlots * cf.fieldHerb * fm)}（人手加成 ×${U.round1(fm)}）` });
    const ml = b.mine || 0;
    if (ml) {
      const me = (s.family.lowMine ? cf.fallenMineEff : 1) * E.managerMult(s, 'industry') * (E.hasElement(s, 'industry', ['金']) ? 1 + C().roots.elementBonus : 1);
      const lab = E.labor(s, 'industry');
      out.stone += ml * cf.mineStone * me + lab; out.ore += ml * cf.mineOre * me;
      out.parts.push({ label: '灵矿 ' + ml + ' 级', text: `灵石 ${Math.round(ml * cf.mineStone * me + lab)}（含人手 ${Math.round(lab)}），矿材 ${Math.round(ml * cf.mineOre * me)}${s.family.lowMine ? '（旧矿效率低）' : ''}` });
    }
    const sl = b.shop || 0;
    if (sl) {
      const pol = FX.Family.ruleBlend(s, 'foreign', (r) => C().rules.foreign[r].shop);
      const v = (sl * cf.shopBase * E.managerMult(s, 'shop') + E.labor(s, 'shop')) * pol * d;
      out.stone += v;
      out.parts.push({ label: '商铺 ' + sl + ' 级', text: `基础收入 ${Math.round(v)}（对外政策 ×${U.round1(pol)}），另售库存` });
    }
    const cons = E.consumption(s);
    out.upkeep = E.upkeep(s);
    out.consume = cons;
    out.parts.push({ label: '建筑维护', text: `-${Math.round(out.upkeep)} 灵石（产业管理减免 ${Math.round(E.upkeepCut(s) * 100)}%）` });
    out.parts.push({ label: '族人消耗', text: `-${cons.grain} 灵谷，-${Math.round(cons.stone)} 灵石` });
    out.netStone = out.stone - out.upkeep - cons.stone;
    out.netGrain = out.grain - cons.grain;
    return out;
  };

  E.alchemyRate = (s, p) => {
    const a = C().economy.alchemy;
    let r = a.baseRate + a.perLevel * (s.family.buildings.alchemy || 0);
    if (p.root.elements.includes('木') || p.root.elements.includes('火')) r += a.elementBonus;
    if (p.root.mutant === '冰') r += C().roots.mutantAlchemy;
    return Math.min(0.98, r * E.personEff(s, p));
  };

  E.clampAll = (s) => {
    const caps = C().economy.caps, res = s.family.resources;
    for (const k in res) {
      if (!Number.isFinite(res[k])) res[k] = 0;
      res[k] = U.clamp(res[k], 0, caps[k] !== undefined ? caps[k] : 99999);
      if (k !== 'stone' && k !== 'grain' && k !== 'herb' && k !== 'ore') res[k] = Math.floor(res[k]);
    }
    res.stone = Math.round(res.stone * 10) / 10;
    res.grain = Math.round(res.grain * 10) / 10;
    res.herb = Math.round(res.herb * 10) / 10;
    res.ore = Math.round(res.ore * 10) / 10;
  };

  /* ---------- 年度产业收支 ---------- */
  E.yearly = (s) => {
    const cf = C().economy, res = s.family.resources, r = s.rng;
    const before = { stone: res.stone, grain: res.grain };
    // 价格波动
    for (const k in cf.prices) s.market.prices[k] = U.round1(cf.prices[k] * (1 + R.range(r, -cf.priceSwing, cf.priceSwing)));
    const f = E.forecast(s);
    res.grain += f.grain; res.herb += f.herb; res.stone += f.stone; res.ore += f.ore;
    // 炼丹
    if ((s.family.buildings.alchemy || 0) > 0) {
      for (const p of E.workers(s, 'alchemy')) {
        if (!P().hasRoot(p)) continue;
        let made = 0, madeZ = 0, n = 0;
        for (let i = 0; i < s.family.buildings.alchemy; i++) {
          const a = cf.alchemy;
          if (s.family.recipes.zhuji && s.family.settings.craftZhuji && res.rareHerb >= 1 && res.stone >= a.zhujiStone) {
            res.rareHerb--; res.stone -= a.zhujiStone; n++;
            if (R.chance(r, E.alchemyRate(s, p) * 0.6)) { res.zhuji++; madeZ++; }
          } else if (res.herb >= a.herb && res.stone >= a.stone) {
            res.herb -= a.herb; res.stone -= a.stone; n++;
            if (R.chance(r, E.alchemyRate(s, p))) { res.qiju++; made++; }
          }
        }
        if (n) FX.H.add(s, { type: 'alchemy', tags: ['产业'], actors: [p.id], key: 'alchemy', params: { name: p.name, n, item: madeZ ? '筑基丹' : '聚气丹', made: madeZ || made }, severity: madeZ ? 3 : 1 });
      }
    }
    // 商铺出售库存
    const sl = s.family.buildings.shop || 0;
    if (sl) {
      let capV = sl * cf.shopSellCapPerLevel * E.deficitEff(s);
      const reserveGrain = E.consumption(s).grain * cf.grainReserveYears;
      const sellable = [
        ['ore', Math.max(0, res.ore - s.family.settings.oreReserve)],
        ['grain', Math.max(0, res.grain - reserveGrain)],
      ];
      if (!(s.family.buildings.alchemy > 0)) sellable.push(['herb', Math.max(0, res.herb - 6)]);
      for (const [k, avail] of sellable) {
        if (capV <= 0) break;
        const price = s.market.prices[k];
        const qty = Math.min(avail, Math.floor(capV / price));
        if (qty <= 0) continue;
        res[k] -= qty; res.stone += qty * price; capV -= qty * price;
      }
    }
    // 支出
    res.stone -= f.upkeep;
    const cons = E.consumption(s);
    res.stone -= cons.stone;
    res.grain -= cons.grain;
    // 历练收益在 simulation 里处理
    // 入不敷出
    if (res.stone < 0) {
      const gap = Math.round(-res.stone);
      res.stone = 0;
      if (!s.family.deficit) s.family.deficitSince = s.year;
      s.family.deficit = true;
      s.family.deficitYears++;
      FX.H.add(s, { type: 'resource', tags: ['经济', '入不敷出'], key: 'deficit', params: { gap }, severity: 2 });
      for (const p of P().living(s)) p.loyalty = U.clamp(p.loyalty - cf.deficitLoyalty, 0, 100);
      if (s.family.deficitYears === 1 && s.year - (s.family.deficitHitYear || -99) >= 10) s.family.deficitHitYear = s.year;
      if (s.family.deficitHitYear === s.year) for (const b of ['main', 'side']) s.family.branches[b].support = U.clamp(s.family.branches[b].support - cf.deficitSupport * 3, 0, 100);
    } else if (s.family.deficit && res.stone > f.upkeep) {
      s.family.deficit = false;
      s.family.deficitYears = 0;
    }
    s.family.famine = 0;
    if (res.grain < 0) {
      const gap = Math.round(-res.grain);
      s.family.famine = U.clamp(gap / Math.max(1, cons.grain), 0, 1);
      res.grain = 0;
      FX.H.add(s, { type: 'resource', tags: ['经济', '饥荒'], key: 'famine', params: { gap }, severity: 3 });
      for (const p of P().living(s)) {
        p.loyalty = U.clamp(p.loyalty - 3, 0, 100);
        if (p.health.state === 'healthy' && R.chance(r, cf.famineHealthChance)) p.health = { state: 'light', recoverYears: C().life.lightInjuryYears };
      }
    }
    const cap = E.grainCap(s);
    if (res.grain > cap) res.grain -= (res.grain - cap) * cf.grainRot;
    // 贡献
    for (const p of P().adults(s)) if (p.duty.type) p.contribution += (C().dutyContribution[p.duty.type] || 1) * E.personEff(s, p);
    E.clampAll(s);
    const hid = null;
    if (res.stone > (s.records.peaks.stone ? s.records.peaks.stone.value : 0)) s.records.peaks.stone = { value: res.stone, hid, year: s.year };
    return { stone: res.stone - before.stone, grain: res.grain - before.grain };
  };

  /* ---------- 建筑 ---------- */
  E.upgradeCost = (key, target) => {
    const b = C().buildings[key];
    const stone = Math.round(b.cost * Math.pow(C().upgradeGrowth, target - 1));
    const ore = target >= C().upgradeOreFrom ? C().upgradeOrePerLevel * (target - C().upgradeOreFrom + 1) : 0;
    return { stone, ore };
  };
  E.canUpgrade = (s, key) => {
    const b = C().buildings[key];
    if (!b) return { ok: false, reason: '无此建筑' };
    if (b.locked) return { ok: false, reason: '阶段 3 开放（未完成）' };
    const lv = s.family.buildings[key] || 0;
    if (lv >= b.max) return { ok: false, reason: '已达最高等级' };
    const cost = E.upgradeCost(key, lv + 1);
    if (s.family.resources.stone < cost.stone) return { ok: false, reason: '灵石不足（需 ' + cost.stone + '）', cost };
    if (s.family.resources.ore < cost.ore) return { ok: false, reason: '矿材不足（需 ' + cost.ore + '）', cost };
    return { ok: true, cost };
  };
  E.upgrade = (s, key) => {
    const c = E.canUpgrade(s, key);
    if (!c.ok) return { ok: false, error: c.reason };
    s.family.resources.stone -= c.cost.stone;
    s.family.resources.ore -= c.cost.ore;
    s.family.buildings[key] = (s.family.buildings[key] || 0) + 1;
    if (key === 'mine' && s.family.lowMine && s.family.buildings.mine >= 2) s.family.lowMine = false;
    const hid = FX.H.add(s, { type: 'building', tags: ['产业', '建设'], key: 'build', params: { bname: C().buildings[key].name, level: s.family.buildings[key], cost: c.cost.stone }, severity: s.family.buildings[key] >= 3 ? 2 : 1 });
    if (key === 'cave' && s.family.buildings.cave === 5) FX.Family.milestone(s, 'cave5', '洞府灵脉升至 5 级', hid);
    return { ok: true, hid };
  };

  /* ---------- 坊市 ---------- */
  E.refreshMarket = (s) => {
    const m = C().market, r = s.rng;
    const offers = [];
    for (const st of m.staples) offers.push({ item: st.item, qty: st.qty, price: U.round1(st.price * (1 + R.range(r, -m.priceSwing, m.priceSwing))) });
    const slots = Math.floor(m.rareSlotsBase + m.rareSlotsPerShop * (s.family.buildings.shop || 0));
    const pool = m.rare.filter((x) => !(x.item === 'recipeZhuji' && s.family.recipes.zhuji));
    for (let i = 0; i < slots; i++) {
      const it = R.weighted(r, pool, (x) => x.w);
      if (!it) break;
      const ex = offers.find((o) => o.item === it.item);
      if (ex) { ex.qty++; continue; }
      offers.push({ item: it.item, qty: 1, price: Math.round(it.price * (1 + R.range(r, -m.priceSwing, m.priceSwing))), rare: true });
    }
    s.market.offers = offers;
  };
  E.buy = (s, item, qty) => {
    const o = s.market.offers.find((x) => x.item === item);
    qty = Math.max(1, Math.floor(qty || 1));
    if (!o || o.qty < qty) return { ok: false, error: '坊市存货不足' };
    const cost = Math.round(o.price * qty);
    if (s.family.resources.stone < cost) return { ok: false, error: '灵石不足（需 ' + cost + '）' };
    s.family.resources.stone -= cost;
    o.qty -= qty;
    if (item === 'recipeZhuji') s.family.recipes.zhuji = true;
    else s.family.resources[item] = (s.family.resources[item] || 0) + qty;
    E.clampAll(s);
    const hid = FX.H.add(s, { type: 'trade', tags: ['坊市'], key: 'market_buy', params: { item: C().items[item], qty, cost }, severity: o.rare ? 2 : 1 });
    return { ok: true, cost, hid };
  };
  E.sellPrice = (s, item) => U.round1((s.market.prices[item] || C().economy.prices[item] || 1) * C().market.sellRatio);
  E.sell = (s, item, qty) => {
    qty = Math.floor(qty);
    if (!['grain', 'herb', 'ore', 'qiju', 'rareHerb'].includes(item)) return { ok: false, error: '此物不可出售' };
    if (qty <= 0 || s.family.resources[item] < qty) return { ok: false, error: '库存不足' };
    const gain = Math.round(E.sellPrice(s, item) * qty);
    s.family.resources[item] -= qty;
    s.family.resources.stone += gain;
    E.clampAll(s);
    return { ok: true, gain };
  };

  FX.Econ = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
