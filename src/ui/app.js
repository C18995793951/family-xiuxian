/* ============================================================
 * ui —— 交互界面。只通过 FX.Game 公开函数操作核心，不直接修改状态。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = G.FX;
  const Game = FX.Game, CF = FX.CONFIG, P = FX.P, T = FX.T;

  const UI = {
    s: null, page: 'now', modals: [], more: false,
    start: { origin: 'loose', surname: '', given: '', sex: '', seed: '' },
    chron: { filter: 'pov' },
    people: { tab: 'here' },
    storeKind: 'none', lastSaveWarn: null, hasAuto: false, fontScale: 1,
  };
  const $ = (sel) => document.querySelector(sel);
  const esc = (x) => String(x === undefined || x === null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (x) => Math.round(x).toLocaleString('zh-CN');
  const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString('zh-CN');
  const pl = (id) => { const p = UI.s.people[id]; return p ? `<button class="link" data-act="person" data-id="${p.id}">${esc(p.name)}</button>` : '—'; };
  const placeLink = (id) => { const p = UI.s.places[id]; return p ? `<button class="link" data-act="place" data-id="${p.id}">${esc(p.name)}</button>` : '—'; };
  const bar = (v, cls) => `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;
  const trace = (label, parts) => `<span class="trace" data-act="trace" data-t="${esc(parts)}" title="${esc(parts)}">${label}</span>`;
  const stars = (n, max) => '●'.repeat(n) + '○'.repeat(Math.max(0, (max || 5) - n));
  const DANGER = ['太平', '偶有妖物', '有些凶险', '凶险', '十分凶险', '九死一生'];
  const QI = ['稀薄', '稀薄', '平平', '尚可', '浓郁', '极浓'];
  const realmOf = (realm) => P.realmName({ realm });
  const techLine = (t) => t.kind === 'lianqi' ? `练炁术 · 真炁${CF.tierNames[t.tier]} · 采「${t.attrs.join('」「')}」气，忌「${t.opp.join('」「')}」` : t.kind === 'kaifu' ? `开府真法 · ${CF.gradeNames[t.grade]}` : '';
  const progLabel = (m) => (m === 0 ? '气感' : m === 1 ? '胎息' : '修为');

  function toast(msg, ms) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), ms || 2600);
  }

  /* ---------- 存档 ---------- */
  let saveTimer = null;
  function afterAction() {
    scheduleSave();
    if (UI.s && UI.s.ended && !UI.modals.some((m) => m.type === 'ending')) UI.modals.push({ type: 'ending', blocking: false });
    else if (UI.s && UI.s.pending.length && !UI.modals.some((m) => m.type === 'event')) UI.modals.push({ type: 'event' });
    render();
    focusModal();
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 300); }
  async function autosave() {
    if (!UI.s) return;
    const r = await FX.Store.put('auto', Game.save.serialize(UI.s, Date.now()));
    if (r && r.warn && UI.lastSaveWarn !== r.warn) { UI.lastSaveWarn = r.warn; toast(r.warn, 4000); }
    FX.Store.delSync('auto');
  }
  async function readSave(text) {
    const r = Game.save.deserialize(text);
    if (!r.ok) { toast('读取失败：' + r.error, 5000); return false; }
    UI.s = r.state; UI.modals = []; UI.page = 'now';
    afterAction();
    return true;
  }
  async function loadAuto() {
    const a = await FX.Store.get('auto');
    const b = FX.Store.getSync('auto');
    const pick = [a, b].filter(Boolean).map((t) => { try { return { t, at: JSON.parse(t).meta.savedAt || 0 }; } catch (e) { return null; } }).filter(Boolean).sort((x, y) => y.at - x.at)[0];
    return pick ? pick.t : null;
  }
  const storeLabel = () => ({ idb: 'IndexedDB', ls: 'localStorage（降级）', none: '不可用，请用导出' }[UI.storeKind] || UI.storeKind);

  /* ---------- 模态 ---------- */
  function focusModal() { setTimeout(() => { const f = document.querySelector('.modal [autofocus], .modal button:not(:disabled)'); if (f) f.focus(); }, 0); }
  function pushModal(m) { UI.modals.push(m); render(); focusModal(); }
  function popModal() { UI.modals.pop(); render(); }

  /* ================= 渲染 ================= */
  const PAGES = [
    { id: 'now', name: '此刻' },
    { id: 'map', name: '地图' },
    { id: 'people', name: '人物' },
    { id: 'bag', name: '行囊' },
    { id: 'sect', name: '宗门' },
    { id: 'chron', name: '纪事' },
    { id: 'sys', name: '存档与设置', short: '设置' },
  ];
  function render() {
    const root = $('#app');
    if (!UI.s) { root.innerHTML = renderStart() + renderModals(); return; }
    const ov = Game.view.overview(UI.s);
    const nav = PAGES.map((p) => `<button class="${UI.page === p.id ? 'on' : ''}" data-act="page" data-p="${p.id}">${p.name}</button>`).join('');
    const bottom = PAGES.map((p) => `<button class="${UI.page === p.id ? 'on' : ''}" data-act="page" data-p="${p.id}">${p.short || p.name}</button>`).join('');
    root.innerHTML = `
      <div class="app">
        <nav class="side" aria-label="主导航"><div class="brand">家族修仙录</div><div class="sub">${esc(CF.world.region)}</div><div class="sub">${esc(ov.me.name)} · ${esc(ov.date)}</div>${nav}</nav>
        <main id="main"><div class="mtop">${esc(ov.me.name)} · ${esc(ov.date)}${UI.s.pending.length ? ' · <button class="link" data-act="openEvent">有事待决断</button>' : ''}</div>${PAGE[UI.page](ov)}</main>
        <aside class="right" aria-label="最近经历">${renderAside()}</aside>
      </div>
      <nav class="bottom" aria-label="底部导航">${bottom}</nav>
      ${renderModals()}`;
  }

  function feedHtml(list) {
    return list.map((e) => `<p class="${e.pov ? '' : 'rumor'}"><span class="y">${esc(T.fmt(e.t))}</span>${esc(e.text)}</p>`).join('') || '<p class="muted">尚无</p>';
  }
  function renderAside() {
    const s = UI.s;
    const warn = s.pending.length ? `<p class="warn">⚑ 眼前有事要决断 <button class="link" data-act="openEvent">处理</button></p>` : '';
    return `<h3>最近经历</h3>${warn}<div class="log">${feedHtml(Game.view.feed(s, 18))}</div>`;
  }

  /* ---------- 开局 ---------- */
  function renderStart() {
    const o = CF.origins, st = UI.start;
    return `<div class="start">
      <h1 style="text-align:center">家族修仙录</h1>
      <p class="muted" style="text-align:center">${esc(CF.world.region)}，东弥州有名的穷土，灵机匮乏，没有大派。<br>你只是一个十六岁的少年。世界不会等你，也不保证你走运。</p>
      <div class="card"><h3>继续</h3><div class="row">
        <button class="primary" data-act="continue" ${UI.hasAuto ? '' : 'disabled'}>继续上次（自动存档）</button>
        <button data-act="openSaves">读取存档 / 导入</button>
      </div><p class="muted" style="margin:.5em 0 0">存储：${storeLabel()}</p></div>
      <div class="card"><h3>新的一生</h3>
        <div class="grid">${Object.keys(o).map((k) => `<div class="card origin ${st.origin === k ? 'sel' : ''}" data-act="pickOrigin" data-k="${k}" tabindex="0" role="button" aria-pressed="${st.origin === k}">
          <h3>${o[k].name}</h3><p class="muted">${o[k].blurb}</p>
          <div class="stat"><span>起点</span><b>${realmOf(o[k].realm)}</b></div>
          <div class="stat"><span>符钱</span><b>${o[k].stone}</b></div>
          <div class="stat"><span>练炁术</span><b>${o[k].technique ? CF.techniques[o[k].technique].name : '无'}</b></div>
          <div class="stat"><span>身家</span><b>${Object.entries(o[k].inv).map(([i, n]) => CF.items[i].name + '×' + n).join('、') || '无'}</b></div>
        </div>`).join('')}</div>
        <div class="row" style="margin-top:1em">
          <label>姓 <input type="text" id="in-surname" maxlength="2" value="${esc(st.surname)}" placeholder="随机" style="width:5em"></label>
          <label>名 <input type="text" id="in-given" maxlength="3" value="${esc(st.given)}" placeholder="随机" style="width:6em"></label>
          <label>性别 <select id="in-sex"><option value="">随机</option><option value="M" ${st.sex === 'M' ? 'selected' : ''}>男</option><option value="F" ${st.sex === 'F' ? 'selected' : ''}>女</option></select></label>
          <label>种子 <input type="text" id="in-seed" value="${esc(st.seed)}" placeholder="随机" style="width:9em"></label>
          <button class="primary" data-act="newGame">踏入仙途</button>
        </div>
        <p class="muted">资质与世界由种子决定。种子相同、选择相同，这一生就逐位相同。修道家族子弟的家族会以你的姓氏命名。</p>
        <p class="muted">世界与设定取自鹓扶君《仙业》的东弥州南域：胎息、练炁、筑基、紫府、洞玄、金丹，玄真派、五光宗、花神府、金谷墟市、地渊。</p>
      </div></div>`;
  }

  /* ---------- 此刻 ---------- */
  const PAGE = {};
  PAGE.now = (ov) => {
    const s = UI.s, me = ov.me;
    const A = Game.actions(s);
    const grp = (g) => A.filter((a) => a.group === g);
    const btn = (a) => `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason || '')}">${esc(a.label)}</button>`;
    const need = ov.need === Infinity ? 0 : ov.need;
    const prog = need ? Math.min(100, (me.progress / need) * 100) : 0;
    const health = me.health.state === 'healthy' ? '<span class="good">无恙</span>' : `<span class="bad">${me.health.state === 'heavy' ? '重伤' : '轻伤'}</span>（还需 ${T.dur(me.health.days)}）`;
    const bt = ov.breakthrough;
    const place = ov.place;
    const pv = Game.view.place(s, place.id);
    const travel = place.links.map((l) => { const to = s.places[l.to]; const a = A.find((x) => x.type === 'travel' && x.to === l.to); return `<button data-act="do" data-i="${a ? A.indexOf(a) : -1}" ${a ? '' : 'disabled'}>${esc(to.name)} <span class="muted">${l.days} 天 · ${DANGER[to.danger]}${s.player.visited.includes(to.id) ? '' : ' · 未去过'}</span></button>`; }).join('');
    const reqList = (list) => `<div class="reqs">${list.map((r) => `<div class="${r.ok ? 'good' : r.optional ? 'muted' : 'bad'}">${r.ok ? '✓' : r.optional ? '·' : '✗'} ${esc(r.label)}${r.note ? ' <span class="muted">' + esc(r.note) + '</span>' : ''}</div>`).join('')}</div>`;
    const fit = ov.fit;
    const disabled = s.ended || s.pending.length;
    return `
      <div class="grid">
        <div class="card hl">
          <div class="row between"><h2 style="margin:0">${esc(me.name)}</h2><span class="muted">${me.sex === 'M' ? '男' : '女'} · ${ov.age} 岁 · ${esc(ov.faction ? ov.faction.name : '散修')}</span></div>
          <div class="big">${esc(ov.realmTitle)}${ov.title ? ' <span class="tag">' + esc(ov.title) + '</span>' : ''}</div>
          ${need ? `<div class="row between"><span class="muted">${progLabel(me.realm.major)}</span><span class="num">${n1(me.progress)} / ${need}${ov.full ? ' <span class="warn">已圆满</span>' : ''}</span></div>${bar(prog, ov.full ? 'good' : '')}` : ''}
          <div class="stat"><span>${trace('修炼速度', ov.speed.factors.map((f) => f.label + ' ×' + f.value).join('；'))}</span><b>${ov.speed.total} / 年</b></div>
          <div class="stat"><span>寿元</span><b class="${ov.left < 15 ? 'bad' : ''}">余 ${ov.left} 年（上限 ${ov.lifespan}）</b></div>
          <div class="stat"><span>伤势</span><b>${health}</b></div>
          <div class="stat"><span>${trace('斗法战力', ov.power.factors.map((f) => f.label + ' ×' + f.value).join('；'))}</span><b>${ov.power.total}</b></div>
          <div class="stat"><span>资质</span><b>${me.aptitude}${me.daoji ? ' · ' + CF.daojiNames[me.daoji] : ''}${me.yixiang ? ' · ' + CF.yixiangNames[me.yixiang] : ''}</b></div>
          <div class="stat"><span>${me.realm.major >= 4 ? '法门' : '练炁术'}</span><b>${ov.tech.kind === 'none' ? '<span class="muted">尚无</span>' : '《' + esc(ov.tech.name) + '》'}</b></div>
          ${fit ? `<div class="stat"><span>${trace('采气', fit.label)}</span><b class="${fit.value >= 1 ? 'good' : fit.value < 0.5 ? 'bad' : ''}">${esc(fit.short)} ×${fit.value}</b></div>` : ''}
          <div class="stat"><span>符钱</span><b>${n0(ov.stone)}</b></div>
          ${ov.faction && (ov.faction.type === 'sect' || ov.faction.type === 'clan') ? `<div class="stat"><span>${esc(CF.house.meritName)}</span><b>${n0(ov.merit)} <button class="link" data-act="page" data-p="sect">${ov.faction.type === 'clan' ? '族中库藏' : '长老房'}</button></b></div>` : ''}
          ${ov.pillUntil ? `<div class="stat"><span>${esc(CF.items.qiju.name)}药力</span><b>至 ${T.fmt(ov.pillUntil)}</b></div>` : ''}
          <div class="stat"><span>性格</span><span>${me.traits.map((t) => `<span class="tag" title="${esc(CF.traits.desc[t])}">${t}</span>`).join('')}</span></div>
        </div>
        <div class="card">
          <div class="row between"><h2 style="margin:0">${placeLink(place.id)}</h2><span class="tag">${esc(pv.typeName)}</span></div>
          <div class="stat"><span>灵机</span><b>${stars(place.qi)} ${QI[place.qi]} · 属「${esc(place.attr)}」${FX.CU.qiFor(s, me) < place.qi ? ' <span class="bad">（你是外人，只能借到 ' + FX.CU.qiFor(s, me) + ' 级）</span>' : ''}</b></div>
          <div class="stat"><span>危险</span><b class="${place.danger >= 3 ? 'bad' : ''}">${stars(place.danger)} ${DANGER[place.danger]}</b></div>
          <div class="stat"><span>势力</span><b>${pv.faction ? esc(pv.faction.name) : '无人管辖'}</b></div>
          <div class="stat"><span>此地的人</span><b>${pv.people.length} 人 <button class="link" data-act="page" data-p="people">看看</button></b></div>
          ${pv.market ? `<div class="stat"><span>${place.type === 'city' ? '集市' : '货架'}</span><b><button class="link" data-act="page" data-p="bag">去逛逛</button></b></div>` : ''}
          <h3 style="margin-top:.8em">道路</h3><div class="col">${travel || '<span class="muted">无路可走</span>'}</div>
        </div>
      </div>
      ${bt ? `<div class="card ${bt.can.ok ? 'hl' : ''}"><h3>${bt.kind === 'taixi' ? '参悟胎息' : '冲击' + esc(bt.target)}</h3>
        <p>成功率 <b class="big">${bt.chance}%</b>${bt.death ? ` · <span class="bad">失败时约 ${bt.death}% 身死${bt.tianfa ? '（天罚）' : ''}</span>` : ''} · 需 ${T.dur(bt.days)}</p>
        <p class="muted">${bt.parts.map((x) => esc(x.label) + ' ' + (x.value > 0 ? '+' : '') + x.value).join('；')}</p>
        ${reqList(ov.reqs)}
        ${bt.can.ok ? '' : `<p class="bad">暂不能${bt.kind === 'taixi' ? '参悟' : '冲关'}：${esc(bt.can.reason)}</p>`}</div>` : ov.reqs.length ? `<div class="card"><h3>转入练炁</h3>${reqList(ov.reqs)}<p class="muted">练炁没有关隘：两样齐了，胎息便自然转入练炁一层。</p></div>` : ''}
      <div class="card"><h3>做什么</h3>${disabled ? '<p class="warn">眼前的事要先处理。</p>' : ''}
        ${['修炼', '外出', '营生', '宗门', '物品'].map((g) => { const list = grp(g).filter((a) => g !== '宗门' || a.ok || !/^要回到/.test(a.reason)); return list.length ? `<div class="act-group"><span class="muted">${g}</span><div class="row">${list.map(btn).join('')}</div></div>` : ''; }).join('')}
        <p class="muted" style="margin-bottom:0">闭关一年以上可能被打扰；游历多半一无所获，偶有遭遇。练炁以后可以把符钱炼进去修行，奢费但不挑地方。时间一过就回不来。</p>
      </div>`;
  };

  /* ---------- 地图 ---------- */
  PAGE.map = () => {
    const s = UI.s, me = P.player(s);
    const cw = CF.world, K = 80, pad = 50;
    const W = (cw.gridW - 1) * K + pad * 2, H = (cw.gridH - 1) * K + pad * 2;
    const X = (p) => pad + p.x * K, Y = (p) => pad + p.y * K;
    const places = Object.values(s.places);
    const lines = [];
    for (const a of places) for (const l of a.links) if (a.id < l.to) {
      const b = s.places[l.to];
      lines.push(`<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" class="road"/><text x="${(X(a) + X(b)) / 2}" y="${(Y(a) + Y(b)) / 2 - 4}" class="days">${l.days}天</text>`);
    }
    const nodes = places.map((p) => {
      const here = p.id === me.locationId, seen = s.player.visited.includes(p.id);
      return `<g class="node t-${p.type} ${here ? 'here' : ''} ${seen ? 'seen' : ''}" data-act="place" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}">
        <circle cx="${X(p)}" cy="${Y(p)}" r="${here ? 13 : 10}"/>
        <text x="${X(p)}" y="${Y(p) + 28}" class="pname">${esc(p.name)}</text></g>`;
    }).join('');
    return `<h2>地图 <span class="muted">${esc(cw.region)}</span></h2>
      <div class="card map-wrap"><svg viewBox="0 0 ${W} ${H}" class="map" role="img" aria-label="世界地图">${lines.join('')}${nodes}</svg></div>
      <p class="muted">点地点看详情。${Object.keys(cw.placeTypes).map((k) => `<span class="legend t-${k}">●</span>${esc(cw.placeTypes[k].name)}`).join(' ')}；描金边的是你去过的地方，大圈是你所在之处。</p>`;
  };

  /* ---------- 人物 ---------- */
  PAGE.people = () => {
    const s = UI.s, me = P.player(s);
    const A = Game.actions(s);
    const tab = UI.people.tab;
    let body;
    if (tab === 'here') {
      const pv = Game.view.place(s, me.locationId);
      body = pv.people.length ? `<table class="resp"><thead><tr><th>姓名</th><th>境界</th><th>势力</th><th>交情</th><th></th></tr></thead><tbody>${pv.people.map((q) => {
        const acts = A.filter((a) => a.npc === q.id);
        return `<tr><td data-l="姓名">${pl(q.id)}</td><td data-l="境界">${esc(q.realm)}</td><td data-l="势力">${esc(q.faction)}</td><td data-l="交情" class="${q.rel < 0 ? 'bad' : q.rel >= 40 ? 'good' : ''}">${q.rel || '素不相识'}</td>
          <td>${acts.map((a) => `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason)}">${a.type === 'befriend' ? '拜访' : '请教'}</button>`).join(' ')}</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="muted">此地没有别人。</p>';
    } else {
      const rels = P.relationsOf(s, me.id).map((r) => ({ r, q: s.people[r.a === me.id ? r.b : r.a] })).sort((a, b) => b.r.strength - a.r.strength);
      body = rels.length ? `<table class="resp"><thead><tr><th>姓名</th><th>境界</th><th>势力</th><th>所在</th><th>交情</th></tr></thead><tbody>${rels.map(({ r, q }) => `<tr class="${P.alive(q) ? '' : 'dead'}"><td data-l="姓名">${pl(q.id)}</td><td data-l="境界">${P.alive(q) ? esc(P.realmName(q)) : '已故'}</td><td data-l="势力">${esc(P.factionName(s, q))}</td><td data-l="所在">${P.alive(q) ? placeLink(q.locationId) : '—'}</td><td data-l="交情" class="${r.strength < 0 ? 'bad' : r.strength >= 40 ? 'good' : ''}">${r.strength}${r.tags.length ? ' <span class="muted">' + esc(r.tags.join('/')) + '</span>' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">你还不认识谁。去拜访或游历时会结识人。</p>';
    }
    return `<h2>人物</h2><div class="row tabs"><button class="${tab === 'here' ? 'on' : ''}" data-act="peopleTab" data-k="here">此地的人</button><button class="${tab === 'known' ? 'on' : ''}" data-act="peopleTab" data-k="known">我认识的人</button></div>
      <div class="card">${body}</div><p class="muted">交情到 ${CF.relations.consultMin} 以上，可以向修为比你高的人请教，每人每年一次，对方也可能婉拒。</p>`;
  };

  /* ---------- 行囊与坊市 ---------- */
  PAGE.bag = (ov) => {
    const s = UI.s;
    const A = Game.actions(s);
    const inv = Object.entries(ov.inv).filter(([, n]) => n > 0);
    const useBtn = (k) => { const a = A.find((x) => x.type === 'use' && x.item === k); return a ? `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason)}">服用</button>` : ''; };
    const m = s.markets[ov.place.id];
    const sellable = inv.filter(([k]) => CF.items[k]);
    const learn = A.filter((a) => a.type === 'learn');
    const orders = A.filter((a) => a.type === 'order');
    const coming = s.player.orders;
    const orderCard = orders.length || coming.length ? `<div class="card"><h3>托人代寻 <span class="muted">（今年没上架的稀罕货，加五成价托墟市去别处寻，到期一定送到）</span></h3>
        ${coming.length ? `<p>在途：${coming.map((o) => esc(FX.World.itemName(o.item)) + '（约 ' + T.fmt(o.due) + ' 到）').join('、')}</p>` : ''}
        ${orders.map((a) => `<div class="stat"><span>${esc(FX.World.itemName(a.item))}</span><span class="row"><b>${a.cost} 符钱</b><button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason)}">托人代寻</button></span></div>`).join('')}
        ${orders.length ? '' : '<p class="muted">要托人代寻，得去金谷墟市（浮玉泊）。</p>'}</div>` : '';
    return `<h2>行囊</h2>
      <div class="card"><div class="stat"><span>符钱</span><b class="big">${n0(ov.stone)}</b></div>
        ${inv.length ? inv.map(([k, n]) => `<div class="stat"><span>${esc(CF.items[k].name)} ×${n} <span class="muted">${esc(CF.items[k].desc)}</span></span><span class="row">${useBtn(k)}${m ? `<button data-act="sell" data-k="${k}" data-n="1">卖 1</button>${n > 1 ? `<button data-act="sell" data-k="${k}" data-n="${n}">全卖（${n}）</button>` : ''} <span class="muted">${FX.World.sellPrice(s, k)}/个</span>` : ''}</span></div>`).join('') : '<p class="muted">身无长物。</p>'}
        <h3>法门</h3>${ov.manuals.length ? ov.manuals.map((t) => `<div class="stat"><span>《${esc(CF.techniques[t].name)}》 <span class="muted">${esc(techLine(CF.techniques[t]))} · ${esc(CF.techniques[t].desc)}</span></span><span>${t === ov.me.techniqueId || t === ov.me.kaifuId ? '<span class="tag t-good">正在修</span>' : (() => { const a = learn.find((x) => x.tech === t); return a ? `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason)}">${ov.me.techniqueId ? '改修' : '研习'}（1 个月）</button>` : ''; })()}</span></div>`).join('') : '<p class="muted">还没有任何法门。胎息之后要有一门练炁术才能往下修。</p>'}
      </div>
      ${m ? `<div class="card"><h3>${esc(ov.place.name)}${ov.place.type === 'city' ? '集市' : '货架'} <span class="muted">（${m.year} 年的货，每年换一次）</span></h3>
        ${m.stock.map((x) => `<div class="stat"><span>${esc(FX.World.itemName(x.item))} <span class="muted">存 ${x.qty} · ${esc(x.item.startsWith('tech:') ? techLine(CF.techniques[x.item.slice(5)]) : CF.items[x.item].desc)}</span></span><span class="row"><b>${x.price} 符钱</b><button data-act="buy" data-k="${esc(x.item)}" ${x.qty > 0 && ov.stone >= x.price ? '' : 'disabled'}>买 1</button></span></div>`).join('')}
        ${sellable.length ? '' : '<p class="muted">卖东西：行囊里的灵草、妖物材料等按七成收。</p>'}</div>` : `<div class="card"><p class="muted">此地买卖不了东西。凡人国有集市，仙道墟市和宗门山门有货架。</p></div>`}
      ${orderCard}`;
  };

  /* ---------- 宗门 ---------- */
  PAGE.sect = (ov) => {
    const s = UI.s, v = Game.view.house(s), M = CF.house.meritName;
    const A = Game.actions(s);
    const btn = (a, text, quiet) => (a ? `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason || '')}">${esc(text || a.label)}</button>${a.ok || !a.reason || quiet ? '' : ' <span class="muted">' + esc(a.reason) + '</span>'}` : '');
    const parts = (ps) => ps.map((x) => x.label + ' ' + (x.value > 0 ? '+' : '') + x.value).join('；');
    if (!v.member) {
      const cond = (j) => (!j ? '不收外人' : j.closed ? j.closed : `至少${CF.realms.names[j.minMajor]}${j.maxAge ? '，年不过 ' + j.maxAge : ''}；每年可求一回`);
      return `<h2>宗门</h2>
        <div class="card"><p class="muted" style="margin:0">散修来去自由，可功法、外药都得自己去墟市买。拜入宗门后，根本法门向长老房请授便是，每年领俸禄；做差事、领符诏除妖、上交妖物内丹和道书抄本都能记${esc(M)}，再拿${esc(M)}去长老房换冲关外药和更好的功法。</p></div>
        ${v.sects.map((x) => { const a = A.find((y) => y.type === 'join' && y.fid === x.f.id); return `<div class="card"><div class="row between"><h3 style="margin:0">${esc(x.f.name)}</h3><span class="muted">${placeLink(x.seat.id)}${x.route && x.route.days ? ' · 约 ' + x.route.days + ' 天路程' : x.route ? ' · 就在此地' : ''}</span></div>
          <p class="muted">${esc(x.f.blurb)}</p>
          <div class="stat"><span>拜入条件</span><b>${esc(cond(x.join))}</b></div>
          ${x.join && !x.join.closed ? `<div class="stat"><span>${trace('成功率', parts(x.chance.parts))}</span><b>${x.chance.chance}%</b></div>` : ''}
          <div class="row">${a ? btn(a) : x.can === true ? '' : '<span class="muted">' + esc(x.can) + '</span>'}</div></div>`; }).join('')}`;
    }
    const f = v.faction, clan = f.type === 'clan';
    const lib = v.library.map((e) => {
      const a = A.find((x) => x.type === 'sect_learn' && x.tech === e.tech);
      const learn = A.find((x) => x.type === 'learn' && x.tech === e.tech);
      const right = e.using ? '<span class="tag t-good">正在修</span>' : e.owned ? (learn ? btn(learn, (ov.me.techniqueId ? '改修' : '研习') + '（1 个月）') : '<span class="muted">已得</span>') : btn(a, e.merit ? `${e.merit} ${M}` : '请授', true);
      return `<div class="stat"><span>《${esc(e.t.name)}》 <span class="muted">${esc(techLine(e.t))} · ${esc(e.t.desc)}${e.note ? ' · ' + esc(e.note) : ''}${e.minMajor ? ' · ' + CF.realms.names[e.minMajor] + '以后才传' : ''}</span></span><span class="row">${right}</span></div>`;
    }).join('');
    const store = v.store.map((e) => {
      const a = A.find((x) => x.type === 'redeem' && x.item === e.item);
      return `<div class="stat"><span>${esc(e.it.name)}${e.have ? ' <span class="muted">（已有 ' + e.have + '）</span>' : ''} <span class="muted">${esc(e.it.desc)}${e.minMajor ? ' · ' + CF.realms.names[e.minMajor] + '以后才换' : ''}</span></span><span class="row">${btn(a, e.merit + ' ' + M, true)}</span></div>`;
    }).join('');
    const subs = A.filter((x) => x.type === 'submit');
    const work = A.find((x) => x.type === 'work');
    const mission = A.find((x) => x.type === 'mission');
    return `<h2>${clan ? '家族' : '宗门'} <span class="muted">${esc(f.name)}</span></h2>
      <div class="card hl">
        <div class="stat"><span>${esc(M)}</span><b class="big">${n0(v.merit)}</b></div>
        <div class="stat"><span>每年俸禄（按你如今的境界）</span><b>符钱 ${v.stipend.stone}${v.stipend.qiju ? '、' + esc(CF.items.qiju.name) + '×' + v.stipend.qiju : ''}</b></div>
        <div class="stat"><span>${clan ? '族中' : '山门'}</span><b>${placeLink(v.seat.id)}${v.atSeat ? ' <span class="good">（你在这里）</span>' : ' <span class="muted">（请授、兑换、上交、领差事都要回来办）</span>'}</b></div>
        <p class="muted" style="margin-bottom:0">${clan ? '族里' : '奉事房'}的差事每月记 ${v.taskMerit} ${esc(M)}，另给符钱；${clan ? '替家族除妖' : '领符诏除妖'}打赢了记 ${v.missionMerit} ${esc(M)}，逃了就算没办成。</p>
        <div class="row" style="margin-top:.5em">${work ? btn(work) : ''}${mission ? btn(mission) : ''}</div>
      </div>
      <div class="card"><h3>${clan ? '家传功法' : '长老房 · 传功'}</h3>${lib || '<p class="muted">没有可传的功法。</p>'}</div>
      <div class="card"><h3>${clan ? '族中库藏' : '长老房 · 库藏'} <span class="muted">（常备，随时可换）</span></h3>${store}</div>
      <div class="card"><h3>${clan ? '上交族中' : '功德房 · 上交'}</h3>
        ${subs.length ? `<div class="col">${subs.map((a) => `<div>${btn(a)}</div>`).join('')}</div>` : `<p class="muted">行囊里没有可上交的东西。${Object.entries(v.submit).map(([k, n]) => esc(CF.items[k].name) + '每件记 ' + n).join('、')}；本门没有的道书抄本按价值记，每部只记一次。</p>`}
      </div>`;
  };

  /* ---------- 纪事 ---------- */
  PAGE.chron = () => {
    const s = UI.s, f = UI.chron.filter;
    const list = s.history.filter((e) => (f === 'pov' ? e.pov : f === 'rumor' ? !e.pov && e.severity >= 2 : e.pov || e.severity >= 2)).slice(-400).reverse();
    return `<h2>纪事</h2><div class="row tabs">${[['pov', '亲历'], ['rumor', '传闻'], ['all', '全部']].map(([k, n]) => `<button class="${f === k ? 'on' : ''}" data-act="chronFilter" data-k="${k}">${n}</button>`).join('')}</div>
      <div class="card log">${list.map((e) => `<p class="${e.pov ? '' : 'rumor'}"><span class="y">${esc(T.fmt(e.t))}</span>${esc(FX.H.text(e))}</p>`).join('') || '<p class="muted">尚无</p>'}</div>
      ${s.history.length > 400 ? '<p class="muted">只列最近 400 条。</p>' : ''}`;
  };

  /* ---------- 存档与设置 ---------- */
  PAGE.sys = () => `<h2>存档与设置</h2>
    <div class="card"><div class="row"><button data-act="openSaves">存档管理 / 导入导出</button><button data-act="life">看生平</button><button class="danger" data-act="askNew">另开一生</button></div>
      <p class="muted">每次行动后自动存档。种子：${esc(UI.s.seed)}</p></div>
    <div class="card"><h3>字号</h3><div class="row"><button data-act="font" data-d="-1">小一号</button><button data-act="font" data-d="1">大一号</button></div></div>
    <div class="card"><h3>这一版</h3><p>个人主角版，世界与设定换成了《仙业》的东弥州南域。主角、世界、时间、修炼、遭遇、拜入宗门与宗门传功都已能玩。势力行动、秘密与剧情线在第 2 阶段，大模型生成事件在第 3 阶段接入。</p>
      <p class="muted">两条原则：不强行制造奇遇，多数日子什么都不发生；不保证你走运，有些努力就是没有回报。</p></div>`;

  /* ---------- 模态 ---------- */
  function renderModals() {
    if (!UI.modals.length) return '';
    const m = UI.modals[UI.modals.length - 1];
    const body = MODALS[m.type](m);
    return `<div class="modal-bg" data-act="${m.blocking ? '' : 'bgClose'}"><div class="modal" role="dialog" aria-modal="true">${body}</div></div>`;
  }
  const MODALS = {
    event(m) {
      const s = UI.s;
      if (!s.pending.length) { setTimeout(popModal, 0); return ''; }
      m.blocking = true;
      const v = Game.pendingEvents(s)[0];
      return `<h2>${esc(v.name)} <span class="tag">${esc(v.category)}</span></h2>
        <p>${esc(v.text)}</p>${v.causes.length ? `<p class="muted">起因：${v.causes.map(esc).join('；')}</p>` : ''}
        ${v.options.map((o, i) => `<div class="opt ${o.available ? '' : 'disabled'}"><div class="row between"><b>${i + 1}. ${esc(o.label)}</b>
          <button class="${o.available ? 'primary' : ''}" data-act="choose" data-i="${v.id}" data-o="${o.id}" ${o.available ? '' : 'disabled'} ${i === 0 ? 'autofocus' : ''}>选择</button></div>
          <div class="meta">代价：<b>${esc(o.cost)}</b></div><div class="meta">风险：<b>${esc(o.risk)}</b></div>${o.outcome ? `<div class="meta">可能结果：<b>${esc(o.outcome)}</b></div>` : ''}
          ${o.chance ? `<div class="meta">${trace('成功率怎么算', o.chance.parts.map((x) => x.label + ' ' + x.value).join('；'))}</div>` : ''}${o.available ? '' : `<div class="meta bad">不可选：${esc(o.reason)}</div>`}</div>`).join('')}
        <p class="muted">可用数字键 1–${v.options.length} 选择。成败由规则掷骰决定。</p>`;
    },
    person(m) {
      const s = UI.s, v = Game.view.person(s, m.id);
      if (!v) return '';
      const p = v.p;
      return `<div class="row between"><h2>${esc(p.name)}</h2><button data-act="close" aria-label="关闭">✕</button></div>
        <p>${p.sex === 'M' ? '男' : '女'} · ${v.age} 岁 · ${esc(v.faction)} · ${p.status === 'alive' ? '在' + esc(v.place) : '已故'}</p>
        <div class="stat"><span>境界</span><b>${esc(v.realmTitle)}</b></div>
        <div class="stat"><span>战力</span><b>${v.power}</b></div>
        ${p.daoji ? `<div class="stat"><span>根基</span><b>${CF.daojiNames[p.daoji]}${p.yixiang ? ' · ' + CF.yixiangNames[p.yixiang] : ''}</b></div>` : ''}
        ${v.isMe ? `<div class="stat"><span>资质</span><b>${p.aptitude}</b></div>` : `<div class="stat"><span>与你的交情</span><b>${v.rel ? v.rel.strength + (v.rel.tags.length ? '（' + esc(v.rel.tags.join('/')) + '）' : '') : '素不相识'}</b></div>`}
        <div class="stat"><span>性格</span><span>${p.traits.map((t) => `<span class="tag" title="${esc(CF.traits.desc[t])}">${t}</span>`).join('')}</span></div>
        ${v.isMe ? `<h3>生平</h3><p>${esc(v.life)}</p>` : ''}
        <h3>${v.isMe ? '人生记录' : '你与此人'}</h3><div class="log">${v.history.slice().reverse().map((e) => `<p><span class="y">${esc(T.fmt(e.t))}</span>${esc(e.text)}</p>`).join('') || '<p class="muted">无</p>'}</div>`;
    },
    place(m) {
      const s = UI.s, v = Game.view.place(s, m.id);
      const p = v.place;
      const A = Game.actions(s);
      const next = v.route && v.route.path.length > 1 ? A.find((a) => a.type === 'travel' && a.to === v.route.path[1]) : null;
      return `<div class="row between"><h2>${esc(p.name)}</h2><button data-act="close" aria-label="关闭">✕</button></div>
        <p>${esc(v.typeName)}${v.faction ? ' · ' + esc(v.faction.name) : ''}${v.here ? ' · <b class="warn">你在这里</b>' : v.visited ? ' · 去过' : ' · 没去过'}</p>
        <div class="stat"><span>灵机</span><b>${stars(p.qi)} ${QI[p.qi]} · 属「${esc(p.attr)}」</b></div>
        ${v.fit ? `<div class="stat"><span>你在此采气</span><b class="${v.fit.value >= 1 ? 'good' : v.fit.value < 0.5 ? 'bad' : ''}">${esc(v.fit.short)} ×${v.fit.value}</b></div>` : ''}
        ${v.faction && v.faction.blurb ? `<p class="muted">${esc(v.faction.blurb)}</p>` : ''}
        <div class="stat"><span>危险</span><b class="${p.danger >= 3 ? 'bad' : ''}">${stars(p.danger)} ${DANGER[p.danger]}</b></div>
        <div class="stat"><span>相邻</span><span>${p.links.map((l) => esc(s.places[l.to].name) + ' ' + l.days + '天').join('、')}</span></div>
        ${v.here ? '' : v.route ? `<p>从你所在之处出发：${v.route.path.map((id) => esc(s.places[id].name)).join(' → ')}，共 ${v.route.days} 天。路是一段一段走的，每段都可能出事。</p>
          ${next ? `<div class="row"><button class="primary" data-act="do" data-i="${A.indexOf(next)}" data-close="1">先走第一段：${esc(next.label)}</button></div>` : ''}` : ''}
        ${v.visited ? `<p class="muted">此地有 ${v.people.length} 人${v.market ? '，可以买卖东西' : ''}。</p>` : ''}`;
    },
    ending() {
      const s = UI.s, p = P.player(s), r = Game.view.rating(s);
      return `<h2>${esc(p.name)}的一生</h2>
        <p class="big">${esc(r.grade)} · ${esc(r.title)}（${r.total} 分）</p>
        <p class="muted">${r.parts.map((x) => esc(x.label) + ' ' + x.value).join('；')}</p>
        <p>${esc(FX.H.lifeSummary(s, p))}</p>
        <div class="row"><button data-act="close">再看看纪事</button><button class="primary" data-act="newRun">另开一生</button></div>`;
    },
    life() {
      const s = UI.s, p = P.player(s);
      return `<div class="row between"><h2>生平</h2><button data-act="close" aria-label="关闭">✕</button></div><p>${esc(FX.H.lifeSummary(s, p))}</p>`;
    },
    confirm(m) {
      return `<h2>${esc(m.title)}</h2><p>${esc(m.text)}</p><div class="row"><button class="danger" data-act="confirmYes" autofocus>确定</button><button data-act="close">取消</button></div>`;
    },
    saves(m) {
      const sl = m.slots || {};
      return `<div class="row between"><h2>存档管理</h2><button data-act="close">✕</button></div>
        <p class="muted">存储：${storeLabel()}</p>
        ${['auto', 'slot1', 'slot2', 'slot3'].map((k) => { const meta = sl[k]; return `<div class="stat"><span><b>${k === 'auto' ? '自动存档' : '槽位 ' + k.slice(4)}</b> ${meta ? `<span class="muted">${esc(meta.name || '?')} · ${esc(meta.originName)} · ${meta.year} 年 · ${meta.age} 岁 · ${esc(meta.realm)}${meta.ended ? ' · 已身故' : ''}${meta.savedAt ? ' · ' + new Date(meta.savedAt).toLocaleString('zh-CN') : ''}</span>` : '<span class="muted">空</span>'}</span>
          <span class="row">${k !== 'auto' && UI.s ? `<button data-act="saveSlot" data-k="${k}">保存</button>` : ''}${meta ? `<button data-act="loadSlot" data-k="${k}">读取</button>` : ''}${meta && k !== 'auto' ? `<button class="danger" data-act="delSlot" data-k="${k}">删除</button>` : ''}</span></div>`; }).join('')}
        <h3>导出</h3><div class="row"><button data-act="exportFile" ${UI.s ? '' : 'disabled'}>下载 .json 文件</button><button data-act="exportText" ${UI.s ? '' : 'disabled'}>复制为文本</button></div>
        <h3>导入</h3><div class="row"><input type="file" accept=".json,.txt,application/json" id="in-file"><button data-act="importFile">从文件导入</button></div>
        <textarea id="in-text" placeholder="粘贴以 FXZ1: / FXB1: 开头的存档文本，或 JSON"></textarea><div class="row"><button data-act="importText">从文本导入</button></div>
        ${m.exported ? `<h3>存档文本</h3><p class="muted">${m.copied ? '已复制到剪贴板。' : '浏览器不允许自动复制，请手动全选复制：'}</p><textarea readonly>${esc(m.exported)}</textarea>` : ''}`;
    },
    trace(m) {
      return `<h3>成因分解</h3><p>${esc(m.text).split('；').join('<br>')}</p><button data-act="close" autofocus>关闭</button>`;
    },
  };

  /* ================= 交互 ================= */
  async function refreshSlots(m) {
    const slots = {};
    for (const k of ['auto', 'slot1', 'slot2', 'slot3']) {
      const t = k === 'auto' ? await loadAuto() : await FX.Store.get(k);
      if (t) try { slots[k] = JSON.parse(t).meta; } catch (e) { slots[k] = null; }
    }
    m.slots = slots;
    render();
  }

  const ACT = {
    page(d) { UI.page = d.p; UI.modals = UI.modals.filter((m) => m.type === 'event' || m.type === 'ending'); render(); G.scrollTo && G.scrollTo(0, 0); },
    pickOrigin(d) { UI.start.origin = d.k; render(); },
    newGame() {
      UI.start.surname = ($('#in-surname') || {}).value || '';
      UI.start.given = ($('#in-given') || {}).value || '';
      UI.start.sex = ($('#in-sex') || {}).value || '';
      UI.start.seed = ($('#in-seed') || {}).value || '';
      const seed = UI.start.seed || String(Date.now() % 1e9) + '-' + Math.floor(Math.random() * 1e6);
      UI.s = Game.newGame({ origin: UI.start.origin, surname: UI.start.surname, given: UI.start.given, sex: UI.start.sex, seed });
      UI.page = 'now'; UI.modals = [];
      afterAction();
      toast(`${P.player(UI.s).name}踏入仙途（种子 ${seed}）`, 3500);
    },
    async continue() { const t = await loadAuto(); if (t) readSave(t); },
    newRun() { UI.s = null; UI.modals = []; render(); },
    askNew() { pushModal({ type: 'confirm', title: '另开一生', text: '当前这一生会留在自动存档里，直到新的一生开始后被覆盖。要继续保留，先存到槽位。', onYes: () => { UI.s = null; UI.modals = []; render(); } }); },
    do(d, el) {
      const a = Game.actions(UI.s)[Number(d.i)];
      if (!a) return;
      if (el && el.dataset.close) UI.modals = UI.modals.filter((m) => m.type !== 'place');
      const r = Game.act(UI.s, a);
      if (!r.ok) { toast('✗ ' + r.error); return; }
      if (r.text) toast(r.text);
      afterAction();
    },
    buy(d) { const r = Game.buy(UI.s, d.k, 1); toast(r.ok ? r.text : '✗ ' + r.error); if (r.ok) afterAction(); },
    sell(d) { const r = Game.sell(UI.s, d.k, Number(d.n)); toast(r.ok ? r.text : '✗ ' + r.error); if (r.ok) afterAction(); },
    choose(d) {
      const r = Game.choose(UI.s, d.i, d.o);
      if (!r.ok) { toast('✗ ' + r.error); return; }
      UI.modals = UI.modals.filter((m) => m.type !== 'event');
      toast(r.result || '已决断', 3500);
      afterAction();
    },
    openEvent() { afterAction(); },
    person(d) { pushModal({ type: 'person', id: d.id }); },
    place(d) { pushModal({ type: 'place', id: d.id }); },
    life() { pushModal({ type: 'life' }); },
    peopleTab(d) { UI.people.tab = d.k; render(); },
    chronFilter(d) { UI.chron.filter = d.k; render(); },
    trace(d) { pushModal({ type: 'trace', text: d.t }); },
    close() { popModal(); },
    bgClose(d, el, ev) { if (ev.target === el) popModal(); },
    confirmYes() { const m = UI.modals[UI.modals.length - 1]; UI.modals.pop(); if (m.onYes) m.onYes(); render(); },
    font(d) { UI.fontScale = Math.max(0.8, Math.min(1.5, UI.fontScale + Number(d.d) * 0.1)); applyFont(); },
    openSaves() { const m = { type: 'saves' }; pushModal(m); refreshSlots(m); },
    async saveSlot(d) {
      const r = await FX.Store.put(d.k, Game.save.serialize(UI.s, Date.now()));
      toast(r.ok ? '已保存到槽位 ' + d.k.slice(4) : '✗ ' + r.error);
      refreshSlots(UI.modals[UI.modals.length - 1]);
    },
    async loadSlot(d) { const t = d.k === 'auto' ? await loadAuto() : await FX.Store.get(d.k); if (t && (await readSave(t))) toast('已读取'); },
    async delSlot(d) { await FX.Store.del(d.k); refreshSlots(UI.modals[UI.modals.length - 1]); },
    exportFile() {
      const p = P.player(UI.s);
      const ok = FX.Store.download(`修仙录-${p.name}-${UI.s.year}年.json`, Game.save.serialize(UI.s, Date.now()));
      toast(ok ? '已开始下载' : '下载失败，请改用复制文本');
    },
    async exportText() {
      const m = UI.modals[UI.modals.length - 1];
      m.exported = await FX.Store.encodeText(Game.save.serialize(UI.s, Date.now()));
      m.copied = await FX.Store.copy(m.exported);
      render();
    },
    async importFile() {
      const f = $('#in-file') && $('#in-file').files[0];
      if (!f) return toast('请先选择文件');
      try { readSave(await FX.Store.decodeText(await f.text())); } catch (e) { toast('读取失败：' + e.message, 5000); }
    },
    async importText() {
      const t = ($('#in-text') || {}).value;
      if (!t) return toast('请先粘贴存档文本');
      try { readSave(await FX.Store.decodeText(t)); } catch (e) { toast('读取失败：' + e.message, 5000); }
    },
  };

  function applyFont() { document.documentElement.style.setProperty('--fs', Math.round(15 * UI.fontScale) + 'px'); try { localStorage.setItem('family-xiuxian:font', String(UI.fontScale)); } catch (e) { /* 忽略 */ } }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !el.dataset.act) return;
    const fn = ACT[el.dataset.act];
    if (fn) fn(el.dataset, el, ev);
  });
  document.addEventListener('keydown', (ev) => {
    const m = UI.modals[UI.modals.length - 1];
    if (!m) {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.dataset && ['pickOrigin', 'place'].includes(ev.target.dataset.act)) { ev.preventDefault(); ACT[ev.target.dataset.act](ev.target.dataset); }
      return;
    }
    if (ev.key === 'Escape' && !m.blocking) { popModal(); return; }
    if (m.type === 'event' && /^[1-9]$/.test(ev.key)) {
      const b = document.querySelectorAll('.modal [data-act="choose"]')[Number(ev.key) - 1];
      if (b && !b.disabled) b.click();
    }
  });
  G.addEventListener('beforeunload', () => { if (UI.s) FX.Store.putSync('auto', Game.save.serialize(UI.s, Date.now())); });

  async function boot() {
    try { UI.fontScale = Number(localStorage.getItem('family-xiuxian:font')) || 1; } catch (e) { UI.fontScale = 1; }
    applyFont();
    UI.storeKind = await FX.Store.init();
    UI.hasAuto = !!(await loadAuto());
    if (UI.storeKind === 'none') toast('浏览器不允许本地存储：请用“导出”保存进度', 6000);
    render();
  }
  FX.UI = UI;
  boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
