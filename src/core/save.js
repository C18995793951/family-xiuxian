/* ============================================================
 * save（核心部分）—— 序列化、校验、迁移、校验和
 * 真正读写 IndexedDB / localStorage 的适配器在 ui 一侧。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const U = FX.U;

  const SV = {};

  SV.hashState = (s) => U.hash(JSON.stringify(s));

  SV.meta = (s) => {
    const p = FX.P.player(s);
    const r = FX.Sim.rating(s);
    return {
      name: p.name,
      origin: s.origin,
      originName: FX.CONFIG.origins[s.origin].name,
      seed: s.seed,
      year: s.year,
      age: FX.P.age(s, p),
      realm: FX.P.realmName(p),
      ratingPreview: r.grade + ' ' + r.total,
      ended: !!s.ended,
    };
  };

  SV.serialize = (s, savedAt) => {
    const stateStr = JSON.stringify(s);
    const save = { schemaVersion: s.schemaVersion, gameVersion: s.gameVersion, meta: Object.assign(SV.meta(s), { savedAt: savedAt || null }), state: s, checksum: U.hash(stateStr) };
    return JSON.stringify(save);
  };

  // 迁移函数表：从 vN 升到 vN+1
  SV.migrations = {
    // v3 → v4：加入宗门道功、拜入记录、献书记录、墟市代寻
    3: (st) => { Object.assign(st.player, { merit: 0, joinTried: {}, submitted: [], orders: [] }); st.schemaVersion = 4; return st; },
  };

  const REQUIRED = {
    state: ['schemaVersion', 'seed', 'origin', 'rng', 't', 'year', 'places', 'factions', 'people', 'relations', 'markets', 'pending', 'eventQueue', 'history', 'records', 'player', 'aiLog'],
    player: ['id', 'stone', 'inv', 'manuals', 'visited', 'stats', 'merit', 'joinTried', 'submitted', 'orders'],
  };

  // 依次：解析 → 版本 → 结构 → 校验和 → 引用完整性。任何一步失败都返回可读错误，不进入半加载状态。
  SV.deserialize = (text) => {
    let save;
    try { save = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, error: '存档不是有效的 JSON：' + e.message }; }
    if (!save || typeof save !== 'object' || !save.state) return { ok: false, error: '存档结构缺失 state 字段' };
    const cur = FX.CONFIG.schemaVersion;
    let st = save.state;
    if (typeof save.schemaVersion !== 'number') return { ok: false, error: '缺少 schemaVersion' };
    if (save.schemaVersion === 1) return { ok: false, error: '这是旧版“经营家族”的存档，个人主角版无法读取' };
    if (save.schemaVersion === 2) return { ok: false, error: '这是换成《仙业》世界之前的存档（灵根、炼气那一套），世界和境界都变了，无法读取' };
    if (save.schemaVersion > cur) return { ok: false, error: `存档版本 ${save.schemaVersion} 比游戏版本 ${cur} 新，请更新游戏` };
    // 校验和针对原始 state 计算
    if (save.checksum && U.hash(JSON.stringify(st)) !== save.checksum) return { ok: false, error: '校验和不符，存档可能已损坏或被改动' };
    let v = save.schemaVersion;
    while (v < cur) {
      const m = SV.migrations[v];
      if (!m) return { ok: false, error: `无法从存档版本 ${v} 迁移到 ${cur}` };
      st = m(JSON.parse(JSON.stringify(st)));
      v++;
    }
    for (const k of REQUIRED.state) if (!(k in st)) return { ok: false, error: '存档缺少字段 state.' + k };
    for (const k of REQUIRED.player) if (!(k in st.player)) return { ok: false, error: '存档缺少字段 player.' + k };
    if (!Array.isArray(st.rng.s) || st.rng.s.length !== 4) return { ok: false, error: '随机数状态损坏' };
    if (typeof st.t !== 'number' || typeof st.year !== 'number') return { ok: false, error: '时间字段类型错误' };
    // 引用完整性
    try {
      FX.Sim.check(st);
    } catch (e) {
      return { ok: false, error: '引用完整性检查失败：' + e.message };
    }
    return { ok: true, state: st, meta: save.meta };
  };

  FX.Save = SV;
})(typeof globalThis !== 'undefined' ? globalThis : this);
