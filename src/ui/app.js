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
    fold: {}, sectTab: 'main', bagTab: 'items',
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
  const DANGER = ['太平', '偶有妖物', '有些凶险', '凶险', '十分凶险', '九死一生', '金丹也会殒命', '元神方可涉足'];
  const QI = ['稀薄', '稀薄', '平平', '尚可', '浓郁', '极浓', '灵窟', '洞天'];
  const realmOf = (realm) => P.realmName({ realm });
  const ART_TYPES = { atk: '攻伐', def: '护身', dun: '遁法', xiu: '辅修' };
  const typeLine = (t) => t.type.map((x) => ART_TYPES[x]).join('、');
  // 一门道术眼下的威能（按进境）
  const artEff = (p, k) => {
    const t = CF.techniques[k], A = FX.Ars, out = [];
    if (t.type.includes('atk')) out.push('战力 +' + Math.round(A.artVal(p, k, 'atk') * 100) + '%');
    if (t.type.includes('def')) out.push('战力 +' + Math.round(A.artVal(p, k, 'def') * 100) + '%、落败重伤少 ' + Math.round(A.artVal(p, k, 'defHurt') * 100) + '%');
    if (t.type.includes('dun')) out.push('逃遁 +' + Math.round(A.artVal(p, k, 'dunFlee')) + '、赶路省 ' + Math.round(A.artVal(p, k, 'dunTravel') * 100) + '%');
    return out.join('；');
  };
  const gearEff = (p, g) => {
    const A = FX.Ars, v = (k) => A.gearValFor(p, g, k);
    const weak = A.useF(p, g) < 1 ? '（境界不够，驱策吃力）' : '';
    if (g.slot === 'atk') return '战力 ×' + Math.round(v('atk') * 100) / 100 + weak;
    if (g.slot === 'def') return '战力 ×' + Math.round(v('def') * 100) / 100 + '、落败重伤少 ' + Math.round(v('defHurt') * 100) + '%' + weak;
    return '逃遁 +' + Math.round(v('dunFlee')) + '、赶路省 ' + Math.round(v('dunTravel') * 100) + '%' + weak;
  };
  const techLine = (t) => t.kind === 'shu' ? `${CF.shuRankNames[t.rank]} · ${typeLine(t)}` : t.kind === 'lianqi' ? `练炁术 · 成「${t.qi || t.name}」${FX.P.qiGrade(t)} · ${t.any ? '诸般灵气都采得' : '采「' + t.attrs.join('」「') + '」气，忌「' + t.opp.join('」「') + '」'}` : t.kind === 'kaifu' ? `开府真法 · ${CF.gradeNames[t.grade]}` : t.kind === 'dao' ? `道书 · ${CF.gradeNames[t.grade]} · 金丹以后修行 ×${t.mult}` : '';
  // 返虚关隘前的三条道途：各自的成功率、劫关数、将来渡三灾的好处
  const fanxuPaths = (A) => {
    const FP = CF.realms.fanxuPaths;
    const rows = CF.realms.fanxuPathOrder.map((k) => {
      const fp = FP[k], a = A.find((x) => x.type === 'breakthrough' && x.path === k);
      return `<div class="stat"><span><b>${esc(fp.name)}</b> <span class="muted">${fp.gates.length} 关 · 每关基础 ${fp.base}% · 失败身死约 ${Math.round(fp.death * 1000) / 10}% · 修为折 ${Math.round(fp.need * 100)}%${fp.zai ? ' · 渡三灾 +' + fp.zai : ''}</span><br><span class="muted">${esc(fp.desc)}</span>${a && !a.ok && a.reason && !/修为未圆满|休养|重伤|洞天/.test(a.reason) ? `<br><span class="bad">${esc(a.reason)}</span>` : ''}</span>${a ? `<button style="white-space:nowrap" data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason || '')}">选它</button>` : ''}</div>`;
    }).join('');
    return `<p class="muted" style="margin-bottom:.3em">返虚能自判关隘：道劫总量不增不减，关数越少每一关越酷烈，却越省时日。冲关成败与道途无关，选定后不能再改。</p>${rows}`;
  };
  const progLabel = (m) => (m === 0 ? '气感' : m === 1 ? '胎息' : m === 7 ? '修为（感悟）' : '修为');

  function toast(msg, ms) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove(); // 连点时只留最近两条，免得盖住按钮
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
    if (G.scrollTo) G.scrollTo(0, 0);
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
  // 导航按要办的事分：修行在此刻，买东西都在采买，跑图在地图；纪事、人物、天下大事合成见闻
  const PAGES = [
    { id: 'now', name: '此刻' },
    { id: 'shop', name: '采买' },
    { id: 'map', name: '地图' },
    { id: 'bag', name: '行囊' },
    { id: 'sect', name: '宗门' },
    { id: 'chron', name: '见闻', also: ['people', 'sagas'] },
    { id: 'sys', name: '存档与设置', short: '设置' },
  ];
  const navOn = (p) => UI.page === p.id || (p.also || []).includes(UI.page);
  function render() {
    const root = $('#app');
    if (!UI.s) { root.innerHTML = renderStart() + renderModals(); return; }
    const ov = Game.view.overview(UI.s);
    const nav = PAGES.map((p) => `<button class="${navOn(p) ? 'on' : ''}" data-act="page" data-p="${p.id}">${p.name}</button>`).join('');
    const bottom = PAGES.map((p) => `<button class="${navOn(p) ? 'on' : ''}" data-act="page" data-p="${p.id}">${p.short || p.name}</button>`).join('');
    root.innerHTML = `
      <div class="app">
        <nav class="side" aria-label="主导航"><div class="brand">家族修仙录</div><div class="sub">${esc(CF.world.region)}</div><div class="sub">${esc(ov.me.name)} · ${esc(ov.date)}</div>${nav}</nav>
        <main id="main" class="p-${UI.page}"><div class="mtop">${esc(ov.me.name)} · ${esc(ov.date)}${UI.s.pending.length ? ' · <button class="link" data-act="openEvent">有事待决断</button>' : ''}</div>${PAGE[UI.page](ov)}</main>
        <aside class="right" aria-label="最近经历">${renderAside()}</aside>
      </div>
      <nav class="bottom" aria-label="底部导航">${bottom}</nav>
      ${renderModals()}`;
    if (UI.page === 'map' && UI.centerMap) { UI.centerMap = false; centerMap(); }
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
      ${FX.PWA && FX.PWA.web && !FX.PWA.standalone ? phoneCard() : ''}
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
  const autoPillBtn = () => {
    const on = UI.s.player.autoPill !== false;
    return `<button class="link" data-act="autoPill" data-v="${on ? 0 : 1}" title="闭关、修炼时药力一尽就从行囊里续服一颗；点一下切换">${on ? '自动续服（开）' : '自动续服（关）'}</button>`;
  };
  // 天下大事：日期开局就排好，提前几年有风声；正在进行的高亮
  const sagaCard = (s) => {
    // 和你沾边的排前面；沾不上边的折成一行
    const all = Game.view.sagas(s).filter((x) => x.known);
    const list = all.filter((x) => x.relevant);
    const far = all.filter((x) => !x.relevant);
    if (!all.length) return '';
    return `<div class="card"><h3>天下大事</h3>${far.length ? `<p class="muted" style="margin:.2em 0">与你无关：${far.map((x) => esc(x.name) + '（' + (x.open ? '正在进行' : x.year + ' 年') + '）').join('、')}</p>` : ''}${list.map((x) => {
      const when = x.open ? (x.done ? '<span class="muted">这回你已经去过了</span>' : `<span class="good">正在进行</span>，到 ${x.until} 年为止`) : x.year === s.year ? '今年' : `${x.year} 年（还有 ${x.year - s.year} 年）`;
      return `<div class="saga"><div class="row between"><b>${esc(x.name)}</b><span>${when}</span></div><div class="muted">${esc(x.hint)}</div></div>`;
    }).join('')}</div>`;
  };
  // 可折叠的一段：状态记在 UI.fold 里（重绘不丢）
  const isOpen = (k, def) => (UI.fold[k] === undefined ? !!def : UI.fold[k]);
  const foldBtn = (k, def, label, n) => `<button class="link fold" data-act="fold" data-k="${k}" data-def="${def ? 1 : 0}" aria-expanded="${isOpen(k, def)}">${isOpen(k, def) ? '收起' : esc(label || '展开')}${n !== undefined && !isOpen(k, def) ? '（' + n + '）' : ''}</button>`;
  const desc = (x) => `<span class="desc clamp" data-act="unclamp" title="${esc(x)}">${esc(x)}</span>`;
  const subTabs = (key, tabs) => `<div class="row tabs sub">${tabs.map(([k, n]) => `<button class="${UI[key] === k ? 'on' : ''}" data-act="subTab" data-key="${key}" data-k="${k}">${n}</button>`).join('')}</div>`;

  // 此刻页的行动页签；“再来一次”记的是上一个可重复的行动
  const ACT_TABS = ['修炼', '外出', '营生', '宗门', '物品'];
  const LAST_KEYS = ['type', 'days', 'to', 'npc', 'item', 'tech', 'fid', 'gid', 'n', 'path', 'zf', 'hall', 'coin', 'until'];
  const repeatable = (a) => ['修炼', '外出', '营生', '宗门'].includes(a.group) && !['breakthrough', 'travel', 'leave', 'join', 'hall', 'learn', 'dongfu', 'dongtian', 'sect_learn'].includes(a.type);
  const sameAct = (a, L) => LAST_KEYS.every((k) => (L.until && k === 'days') || a[k] === L[k]);
  const remember = (k, v) => { try { localStorage.setItem('family-xiuxian:' + k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } };

  PAGE.now = (ov) => {
    const s = UI.s, me = ov.me;
    const A = Game.actions(s);
    const grp = (g) => A.filter((a) => a.group === g);
    const btn = (a, cls) => `<button class="${cls || ''}" data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason || '')}">${esc(a.label)}</button>`;
    const need = ov.need === Infinity ? 0 : ov.need;
    const prog = need ? Math.min(100, (me.progress / need) * 100) : 0;
    const health = me.health.state === 'healthy' ? '<span class="good">无恙</span>' : `<span class="bad">${me.health.state === 'heavy' ? '重伤' : '轻伤'}</span> <span class="muted">${T.dur(me.health.days)}</span>`;
    const bt = ov.breakthrough;
    const place = ov.place;
    const pv = Game.view.place(s, place.id);
    const travel = place.links.map((l) => { const to = s.places[l.to]; const a = A.find((x) => x.type === 'travel' && x.to === l.to); return `<button data-act="do" data-i="${a ? A.indexOf(a) : -1}" ${a && a.ok ? '' : 'disabled'} title="${esc(a ? a.reason : '')}">${esc(to.name)} <span class="muted">${a ? a.days : l.days} 天 · ${DANGER[to.danger]}${to.region && to.region !== place.region ? ' · ' + esc(to.region) : ''}${s.player.visited.includes(to.id) ? '' : ' · 未去过'}${a && !a.ok ? ' · ' + esc(CF.realms.names[l.minMajor] || '') + '以后才过得去' : ''}</span></button>`; }).join('');
    // 缺的东西就地给出来路：此地货架买、长老房换、托人代寻，或赶去有货的地方
    const route = routeMemo(s);
    const go = (id, text) => { if (!id || id === me.locationId) return ''; const r = route(id); return r ? `<button class="link" data-act="goto" data-id="${id}">${esc(text || '赶过去')} ${r.days} 天</button>` : ''; };
    // 卡关时的“下一步”：核心 Guide 照世界状态算出的几条路，每条落到一个按钮上
    const gd = FX.Guide.next(s);
    const gIdx = (a) => A.findIndex((x) => x.type === a.type && LAST_KEYS.every((k) => x[k] === a[k]));
    const gBtn = (w, cls) => {
      const st = w && w.step;
      if (!st) return '';
      if (st.act) { const i = gIdx(st.act); return i < 0 ? '' : st.qty ? `<button class="${cls || ''}" data-act="doN" data-i="${i}" data-n="${st.qty}">捐 ${n0(st.qty * A[i].cost)} 符钱</button>` : `<button class="${cls || ''}" data-act="do" data-i="${i}">${esc(A[i].label)}</button>`; }
      if (st.buy) return `<button class="${cls || ''}" data-act="buy" data-k="${esc(st.buy)}" data-n="1">买下</button>`;
      if (st.goto) { const r = route(st.goto); return `<button class="${cls || ''}" data-act="goto" data-id="${st.goto}">去${esc(s.places[st.goto].name)}${r ? ' · ' + r.days + ' 天' : ''}</button>`; }
      return '';
    };
    const guideHtml = (g) => !g ? '' : g.best ? `<div class="guide"><div><b class="warn">下一步</b> ${esc(g.best.text)}</div><div class="row src">${gBtn(g.best, 'primary')}</div>${g.ways.length > 1 ? `<div class="muted small">也可以：${g.ways.slice(1, 3).map((w) => esc(w.text) + ' ' + gBtn(w)).join('；')}</div>` : ''}</div>`
      : `<div class="guide bad small">眼下想不出去哪弄到，去采买页看看 <button class="link" data-act="page" data-p="shop">采买</button></div>`;
    const reqSrc = (r) => {
      if (!r.ok && !r.optional && gd && !gd.need.soon && gd.need.label === r.label) return guideHtml(gd);
      if (r.ok) { const u = r.item && A.find((a) => a.type === 'use' && a.item === r.item && a.ok); return u ? `<div class="row src"><button data-act="do" data-i="${A.indexOf(u)}">${esc(u.label)}</button></div>` : ''; }
      if (r.item && CF.items[r.item]) { const b = srcBtns(s, A, r.item, sourcesOf(s, A, r.item, route)); return (b.html ? `<div class="row src">${b.html}</div>` : '') + (b.why.length && !b.ready ? `<div class="muted small">${esc(b.why.join('；'))}</div>` : ''); }
      if (r.kaifu) {
        // 开府真法：手里有的直接研习，长老房能请授的、此地货架有的直接给按钮
        const kf = (t) => CF.techniques[t] && CF.techniques[t].kind === 'kaifu';
        const ready = A.filter((a) => (a.type === 'learn' || a.type === 'sect_learn') && a.ok && kf(a.tech)).slice(0, 2)
          .map((a) => `<button data-act="do" data-i="${A.indexOf(a)}">${a.type === 'learn' ? '研习' : a.cost ? '换' : '请授'}《${esc(CF.techniques[a.tech].name)}》${a.cost ? ' · ' + n0(a.cost) + ' ' + esc(CF.house.meritName) : ''}</button>`);
        const m = FX.World.hasMarket(s, me.locationId) ? s.markets[me.locationId] : null;
        if (!ready.length && m) m.stock.filter((x) => x.qty > 0 && x.item.startsWith('tech:') && kf(x.item.slice(5)) && x.price <= s.player.stone).slice(0, 2)
          .forEach((x) => ready.push(`<button data-act="buy" data-k="${esc(x.item)}" data-n="1">买《${esc(CF.techniques[x.item.slice(5)].name)}》 · ${n0(x.price)} 符钱</button>`));
        return `<div class="row src">${ready.join('')}<button data-act="page" data-p="shop" data-tab="need">${ready.length ? '别的来路' : '去采买看来路'}</button></div>`;
      }
      if (r.items && r.items.length) return `<div class="row src"><button data-act="page" data-p="shop" data-tab="need">去采买看来路</button></div>`;
      return '';
    };
    const reqList = (list) => `<div class="reqs">${list.map((r) => `<div class="${r.ok ? 'good' : r.optional ? 'muted' : 'bad'}">${r.ok ? '✓' : r.optional ? '·' : '✗'} ${esc(r.label)}${r.note && !(r.ok && r.item) && !(gd && !gd.need.soon && gd.need.label === r.label && !r.ok) ? ' <span class="muted">' + esc(r.note) + '</span>' : ''}${reqSrc(r)}</div>`).join('')}</div>`;
    const fit = ov.fit;
    const disabled = s.ended || s.pending.length;
    const member = ov.faction && (ov.faction.type === 'sect' || ov.faction.type === 'clan');
    // 手机上看不到右栏的“最近经历”，在顶上留两三条
    const recent = Game.view.feed(s, 12).filter((e) => e.pov).slice(0, 3);
    const recentCard = recent.length ? `<div class="card recent narrow-only"><div class="row between"><b class="warn">刚才</b><button class="link" data-act="page" data-p="chron">全部纪事</button></div>${feedHtml(recent)}</div>` : '';
    // 冲关：成功率、要什么、按钮放在一处
    const btActs = A.filter((a) => a.type === 'breakthrough' && !a.path);
    // 冲关不只看运气：把还能稳稳添上的几分把握点出来
    const upTips = [];
    if (bt && !['minor', 'taixi', 'zhangguan'].includes(bt.kind) && bt.chance < bt.max) {
      const B = CF.breakthrough;
      const acc = (bt.parts.find((x) => /^圆满后积累/.test(x.label)) || { value: 0 }).value;
      const y1 = A.find((a) => a.type === 'cultivate' && a.days === 360 && !a.until && !a.coin);
      if (need && me.progress >= need && acc < B.accumMax) upTips.push(`圆满后接着闭关打磨，每年 +${B.accumPerYear}%，至多 +${B.accumMax}%${acc ? '（已 +' + acc + '%）' : ''}${y1 && y1.ok ? ` <button class="link" data-act="do" data-i="${A.indexOf(y1)}">闭关 1 年</button>` : ''}`);
      const fm = FX.Sect.mine(s), seat = fm && s.places[fm.seatId];
      if (!bt.parts.some((x) => /^灵机/.test(x.label))) upTips.push(`到灵机 ${B.qiBonusMin} 级以上的地方冲关 +${B.qiBonus}%${seat && seat.qi >= B.qiBonusMin && me.locationId !== seat.id ? '，山门' + esc(seat.name) + '就是 ' + go(seat.id, '回山门') : ''}`);
      if (bt.kind === 'zifu' && bt.kaifu && CF.techniques[bt.kaifu].grade < 3) {
        const better = Object.keys(CF.techniques).filter((t) => CF.techniques[t].kind === 'kaifu' && CF.techniques[t].grade > CF.techniques[bt.kaifu].grade && techWhere(s, t));
        upTips.push(`开府真法品第越高越好，有了就算，不必改修：${better.map((t) => `${esc(CF.gradeNames[CF.techniques[t].grade])}《${esc(CF.techniques[t].name)}》${B.yixiangMod[CF.techniques[t].grade] > 0 ? '+' : ''}${B.yixiangMod[CF.techniques[t].grade]}%（${esc(techWhere(s, t))}）`).join('；')}`);
      }
    }
    const btCard = bt ? `<div class="card ${bt.can.ok ? 'hl' : ''}"><h3>${bt.kind === 'taixi' ? '参悟胎息' : esc(bt.verb + bt.target)}</h3>
        <p style="margin:.2em 0">成功率 <b class="big">${bt.chance}%</b>${bt.death ? ` · <span class="bad">失败时约 ${bt.death}% 身死${bt.kind === 'mizhang' ? '（失道之祸）' : bt.tianfa ? '（天罚）' : ''}</span>` : bt.kind === 'zhangguan' ? ' · <span class="good">没破开也无祸患</span>' : ''} · 需 ${T.dur(bt.days)}</p>
        ${btActs.length ? `<div class="row">${btActs.map((a) => btn(a, a.ok ? 'primary' : '')).join('')}</div>` : ''}
        ${bt.kind === 'fanxu' ? fanxuPaths(A) : ''}
        ${reqList(ov.reqs)}
        ${bt.can.ok ? '' : `<p class="bad" style="margin:.3em 0">暂不能${bt.kind === 'taixi' ? '参悟' : '冲关'}：${esc(bt.can.reason)}</p>`}
        ${upTips.length ? `<div class="up-tips small"><span class="muted">还能添把握：</span>${upTips.map((t) => `<div>· ${t}</div>`).join('')}</div>` : ''}
        <div>${foldBtn('btParts', false, '成功率怎么算')}</div>${isOpen('btParts', false) ? `<p class="muted">${bt.parts.map((x) => esc(x.label) + ' ' + (x.value > 0 ? '+' : '') + x.value).join('；')}</p>` : ''}</div>`
      : ov.reqs.length ? `<div class="card"><h3>转入练炁</h3>${reqList(ov.reqs)}<p class="muted">练炁没有关隘：两样齐了，胎息便自然转入练炁一层。</p></div>` : '';
    // 做什么：按类分页签；修炼页里“闭关到圆满”在最前，时长做成小格子；大事放在页签上面
    const until = A.find((a) => a.type === 'cultivate' && a.until);
    const listOf = (g) => {
      // 换不了的功法（道基已成等）只在采买页说明，不占做什么里的位置
      let list = grp(g).filter((a) => (g !== '宗门' || a.ok || !/^要回到/.test(a.reason)) && (a.type !== 'learn' || a.ok));
      if (bt) list = list.filter((a) => a.type !== 'breakthrough');
      return list;
    };
    const big = listOf('大事').filter((a) => a.ok || !/已经/.test(a.reason)); // 这回已经办过的不再占位
    const tabs = ACT_TABS.filter((g) => listOf(g).length);
    const tab = tabs.includes(UI.actTab) ? UI.actTab : tabs[0];
    const chip = (a, text) => `<button class="chip" data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason || a.label)}">${esc(text)}</button>`;
    let actBody = '';
    if (tab === '修炼') {
      const L = listOf('修炼');
      const durs = L.filter((a) => a.type === 'cultivate' && !a.until && !a.coin);
      const coins = L.filter((a) => a.type === 'cultivate' && a.coin);
      const rests = L.filter((a) => a.type === 'rest');
      const rest = L.filter((a) => a.type !== 'cultivate' && a.type !== 'rest');
      const verb = durs.length ? durs[0].label.split(' ')[0] : '修炼';
      actBody = `${rests.length ? `<div class="act-group"><span class="bad">有伤在身，先静养</span><div class="chips">${rests.map((a) => chip(a, T.dur(a.days))).join('')}</div></div>` : ''}
        ${until ? `<button class="primary wide" data-act="do" data-i="${A.indexOf(until)}" ${until.ok ? '' : 'disabled'} title="${esc(until.reason || '')}">${esc(until.label)}</button>` : ''}
        ${durs.length ? `<div class="act-group"><span class="muted">${esc(verb)} <span class="small">· 一年以上是闭关，可能被打扰，被打扰就停下</span></span><div class="chips">${durs.map((a) => chip(a, T.dur(a.days))).join('')}</div></div>` : ''}
        ${coins.length ? `<div class="act-group"><span class="muted">以符钱修行 <span class="small">· 把符钱炼进去，奢费但不挑地方</span></span><div class="chips long">${coins.map((a) => chip(a, T.dur(a.days) + ' · ' + n0(a.cost) + ' 符钱')).join('')}</div></div>` : ''}
        ${rest.length ? `<div class="row">${rest.map((a) => btn(a)).join('')}</div>` : ''}`;
    } else if (tab) {
      actBody = `<div class="row">${listOf(tab).map((a) => btn(a)).join('')}</div>${tab === '外出' ? '<p class="muted small" style="margin-bottom:0">游历多半一无所获，偶有遭遇。远路去地图页一键赶过去。</p>' : ''}`;
    }
    // 要紧的事：和你沾边、快到的天下大事；散修能去拜的宗门；长老房白给的功法；元神未入殿。每条带一个直接去办的按钮
    const tips = [];
    if (gd && gd.need.soon && gd.best) tips.push(`<b class="warn">${esc(gd.need.label)}</b> ${esc(gd.best.text)}${gd.ways.length > 1 ? '；也可以' + esc(gd.ways[1].text) : ''}`);
    for (const x of Game.view.sagas(s)) {
      if (!x.known || !x.relevant || x.done || !(x.open || x.year - s.year <= 3)) continue;
      tips.push(`<b class="warn">${esc(x.name)}</b> <span class="small">${x.open ? '正在进行，到 ' + x.until + ' 年' : x.year === s.year ? '今年' : '还有 ' + (x.year - s.year) + ' 年'}</span> <span class="muted small">${esc(x.hint)}</span> ${x.open ? go(x.at) : ''}`);
    }
    if (!ov.faction || ov.faction.type !== 'sect') {
      const hv = Game.view.house(s);
      const sects = (hv.sects || []).filter((x) => x.join && !x.join.closed && (x.can === true || /^要回到/.test(x.can))).sort((a, b) => (a.route ? a.route.days : 1e9) - (b.route ? b.route.days : 1e9)).slice(0, 2);
      for (const x of sects) tips.push(`散修没有俸禄和长老房。可去${placeLink(x.seat.id)}求入<b>${esc(x.f.name)}</b> <span class="muted small">至少${esc(CF.realms.names[x.join.minMajor])}${x.join.maxAge ? '，年不过 ' + x.join.maxAge + '（你 ' + ov.age + ' 岁）' : ''}，成功率 ${x.chance.chance}%</span> ${go(x.seat.id)}`);
    } else {
      const fm = FX.Sect.mine(s);
      if (fm && fm.seatId && !s.player.dongfu && !s.player.dongtian && !FX.Sect.atSeat(s, fm)) tips.push(`你不在山门。领差事、长老房、山门灵机都在${placeLink(fm.seatId)} ${go(fm.seatId, '回山门')}`);
      const free = A.filter((a) => a.type === 'sect_learn' && a.ok && !a.cost && !s.player.manuals.includes(a.tech));
      if (free.length) tips.push(`长老房可请授${free.map((a) => '《' + esc(CF.techniques[a.tech].name) + '》').join('')}，不收${esc(CF.house.meritName)} <button class="link" data-act="page" data-p="shop" data-tab="books">去请授</button>`);
      if (me.realm.major >= 7 && FX.Sect.hallRank && ov.faction.key === 'yuchen' && !me.hall) tips.push(`你已成元神，可以入玉宸九殿任职，各殿职权不同 <button class="link" data-act="page" data-p="sect">去挑殿</button>`);
    }
    const sagaMini = tips.length ? `<div class="saga-mini">${tips.map((t) => `<div>${t}</div>`).join('')}<button class="link small" data-act="page" data-p="sagas">全部大事</button></div>` : '';
    const actCard = `<div class="card acts"><h3>做什么</h3>${disabled ? `<p class="warn">眼前的事要先处理。 ${s.pending.length ? '<button class="link" data-act="openEvent">去处理</button>' : ''}</p>` : ''}
        ${sagaMini}
        ${big.length ? `<div class="act-group"><span class="warn">大事</span><div class="row">${big.map((a) => btn(a, a.ok ? 'primary' : '')).join('')}</div></div>` : ''}
        ${tabs.length > 1 ? `<div class="row tabs acts-tabs">${tabs.map((g) => { const n = listOf(g).filter((a) => a.ok).length; return `<button class="${g === tab ? 'on' : ''}" data-act="subTab" data-key="actTab" data-k="${g}">${g}${g !== tab && n ? ' <span class="muted small">' + n + '</span>' : ''}</button>`; }).join('')}</div>` : ''}
        ${actBody}
      </div>`;
    // 快捷栏：手机竖屏时贴在底部导航上面，横屏时放在右栏顶上。左边“再来一次”，右边冲关或闭关到圆满
    const primary = (bt && btActs.find((a) => a.ok)) || big.find((a) => a.ok) || (until && until.ok ? until : null);
    const lastA = UI.last ? A.find((a) => sameAct(a, UI.last)) : null;
    const again = lastA && lastA.ok && lastA !== primary ? lastA : null;
    const risky = primary && primary.type === 'breakthrough' && bt && bt.death;
    // 冲不了、也没得修的时候，快捷栏放“下一步”
    const gq = !primary && gd && !gd.need.soon && gd.best && gd.best.step ? gBtn(gd.best, 'primary') : '';
    const qbar = s.ended ? '' : s.pending.length ? '<div class="qbar"><button class="primary" data-act="openEvent">处理眼前的事</button></div>'
      : gq ? `<div class="qbar">${again ? `<button data-act="do" data-i="${A.indexOf(again)}" title="${esc(again.label)}"><span class="muted small">再来</span> ${esc(again.label)}</button>` : ''}${gq}</div>`
      : primary || again ? `<div class="qbar">${again ? `<button data-act="do" data-i="${A.indexOf(again)}" title="${esc(again.label)}"><span class="muted small">再来</span> ${esc(again.label)}</button>` : ''}${primary ? `<button class="primary${risky ? ' risky' : ''}${primary === until && tab === '修炼' ? ' dup' : ''}" data-act="${risky ? 'doRisk' : 'do'}" data-i="${A.indexOf(primary)}" title="${esc(primary.label)}">${esc(primary.label)}</button>` : ''}</div>` : '';
    return `
      <div class="now-cols"><div class="col-a">
      ${recentCard}
      <div class="card hl">
        <div class="row between"><h2 style="margin:0">${esc(me.name)}</h2><span class="muted">${me.sex === 'M' ? '男' : '女'} · ${ov.age} 岁 · ${esc(ov.faction ? ov.faction.name : '散修')}</span></div>
        <div class="big">${esc(ov.realmTitle)}${ov.title ? ' <span class="tag">' + esc(ov.title) + '</span>' : ''}</div>
        ${need ? `<div class="row between"><span class="muted">${progLabel(me.realm.major)}</span><span class="num">${n1(me.progress)} / ${need}${ov.full ? ' <span class="warn">已圆满</span>' : ''}</span></div>${bar(prog, ov.full ? 'good' : '')}` : ''}
        <div class="kv">
          <div><span class="muted">寿元</span> <b class="${ov.left < 15 ? 'bad' : ''}">余 ${n0(ov.left)} 年</b></div>
          <div><span class="muted">伤势</span> <b>${health}</b></div>
          <div><span class="muted">${trace('修炼', ov.speed.factors.map((f) => f.label + ' ×' + f.value).join('；'))}</span> <b>${ov.speed.total}/年</b></div>
          <div><span class="muted">${trace('战力', ov.power.factors.map((f) => f.label + ' ×' + f.value).join('；'))}</span> <b>${n1(ov.power.total)}</b></div>
          <div><span class="muted">符钱</span> <b>${n0(ov.stone)}</b></div>
          ${member ? `<div><span class="muted">${esc(CF.house.meritName)}</span> <b>${n0(ov.merit)}</b> <button class="link" data-act="page" data-p="sect">${ov.faction.type === 'clan' ? '族中' : '长老房'}</button></div>` : ''}
        </div>
        <div style="margin-top:.3em">${foldBtn('meMore', false, '根基、法门、采气')}</div>
        ${isOpen('meMore', false) ? `
          <div class="stat"><span>寿元上限</span><b>${n0(ov.lifespan)} 年</b></div>
          <div class="stat"><span>资质</span><b>${me.aptitude}${P.rootNames(me).length ? ' · ' + esc(P.rootNames(me).join(' · ')) : ''}</b></div>
          <div class="stat"><span>${me.realm.major >= 4 ? '法门' : '练炁术'}</span><b>${ov.tech.kind === 'none' ? '<span class="muted">尚无</span>' : '《' + esc(ov.tech.name) + '》'}</b></div>
          ${fit ? `<div class="stat"><span>${trace('采气', fit.label)}</span><b class="${fit.value >= 1 ? 'good' : fit.value < 0.5 ? 'bad' : ''}">${esc(fit.short)} ×${fit.value}</b></div>` : ''}
          ${member ? `<div class="stat"><span>职位</span><b>${esc(FX.Sect.postName(s, ov.faction, me))}</b></div>` : ''}
          ${ov.pillUntil || (me.realm.major >= 2 && s.player.inv.qiju) ? `<div class="stat"><span>${esc(CF.items.qiju.name)}</span><b>${ov.pillUntil ? '药力至 ' + T.fmt(ov.pillUntil) + ' · ' : ''}${autoPillBtn()}</b></div>` : ''}
          <div class="stat"><span>性格</span><span>${me.traits.map((t) => `<span class="tag" title="${esc(CF.traits.desc[t])}">${t}</span>`).join('')}</span></div>` : ''}
      </div>
      ${btCard}
      </div><div class="col-b">${actCard}${qbar}</div><div class="col-c">
      <div class="grid">
        <div class="card">
          <div class="row between"><h2 style="margin:0">${placeLink(place.id)}</h2><span class="tag">${esc((place.region || '南域') + ' · ' + pv.typeName)}</span></div>
          <div class="stat"><span>灵机</span><b>${stars(place.qi)} ${QI[place.qi]} · 属「${esc(place.attr)}」${FX.CU.qiFor(s, me) < place.qi ? ' <span class="bad">（你是外人，只能借到 ' + FX.CU.qiFor(s, me) + ' 级）</span>' : ''}</b></div>
          <div class="stat"><span>危险</span><b class="${place.danger >= 3 ? 'bad' : ''}">${stars(Math.min(5, place.danger))} ${DANGER[place.danger]}</b></div>
          ${s.player.dongfu ? `<div class="stat"><span>洞府</span><b>${s.player.dongfu === place.id ? '<span class="good">就在此地</span> <span class="muted">（灵机 +' + CF.dongfu.qiBonus + '，闭关少受打扰）</span>' : placeLink(s.player.dongfu) + ' <button class="link" data-act="goto" data-id="' + s.player.dongfu + '">回去</button>'}</b></div>` : ''}
          <div class="stat"><span>势力</span><b>${pv.faction ? esc(pv.faction.name) : '无人管辖'}</b></div>
          <div class="stat"><span>此地的人</span><b>${pv.people.length} 人 <button class="link" data-act="page" data-p="people">看看</button></b></div>
          ${pv.market ? `<div class="stat"><span>${place.type === 'city' ? '集市' : '货架'}</span><b><button class="link" data-act="page" data-p="shop">去采买</button></b></div>` : ''}
          <h3 style="margin-top:.8em">道路 <span class="muted small">远路去地图页一键赶过去</span></h3><div class="col">${travel || '<span class="muted">无路可走</span>'}</div>
        </div>
      </div></div></div>`;
  };

  /* ---------- 地图 ---------- */
  const MAP = { K: 110, pad: 60, scale: 0.45 };
  PAGE.map = () => {
    const s = UI.s, me = P.player(s);
    const cw = CF.world, K = MAP.K, pad = MAP.pad;
    const places = Object.values(s.places);
    const xs = places.map((p) => p.x), ys = places.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const W = (Math.max(...xs) - x0) * K + pad * 2, H = (Math.max(...ys) - y0) * K + pad * 2;
    const X = (p) => pad + (p.x - x0) * K, Y = (p) => pad + (p.y - y0) * K;
    const canGo = me.realm.major >= cw.outer.gate.minMajor;
    const lines = [];
    for (const a of places) for (const l of a.links) if (a.id < l.to) {
      const b = s.places[l.to];
      lines.push(`<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" class="road${l.minMajor ? ' gate' : ''}"/><text x="${(X(a) + X(b)) / 2}" y="${(Y(a) + Y(b)) / 2 - 6}" class="days">${l.days}天</text>`);
    }
    // 地域名字（南域、中域……）写在各自地点的中间
    const regions = {};
    for (const p of places) { const k = p.region || '南域'; (regions[k] = regions[k] || []).push(p); }
    const labels = Object.keys(regions).map((k) => { const l = regions[k]; const cx = l.reduce((a, p) => a + X(p), 0) / l.length, cy = l.reduce((a, p) => a + Y(p), 0) / l.length; return `<text x="${cx}" y="${cy - 40}" class="region">${esc(k)}</text>`; }).join('');
    const nodes = places.map((p) => {
      const here = p.id === me.locationId, seen = s.player.visited.includes(p.id);
      const far = p.outer && !canGo && !seen;
      return `<g class="node t-${p.type} ${here ? 'here' : ''} ${seen ? 'seen' : ''} ${far ? 'far' : ''}" data-act="place" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}">
        <circle cx="${X(p)}" cy="${Y(p)}" r="${here ? 18 : 13}"/>
        <text x="${X(p)}" y="${Y(p) + 38}" class="pname">${esc(p.name)}</text></g>`;
    }).join('');
    // 地点一览：按地域分组，写明从这里过去要几天，可一键赶过去
    const order = ['南域', '中域', '东域', '北域', '西域', '东海'];
    const regionKeys = Object.keys(regions).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
    const list = regionKeys.map((k) => {
      const rows = regions[k].slice().sort((a, b) => a.name.localeCompare(b.name, 'zh')).map((p) => {
        const v = Game.view.place(s, p.id);
        const go = v.here ? '<span class="tag t-good">你在这里</span>' : v.route ? `<button data-act="goto" data-id="${p.id}">赶过去 ${v.route.days} 天</button>` : `<span class="muted small">${esc(v.blocked || '走不通')}</span>`;
        return `<div class="stat"><span><button class="link" data-act="place" data-id="${p.id}">${esc(p.name)}</button> <span class="muted small">${esc(v.typeName)}${v.faction ? ' · ' + esc(v.faction.name) : ''} · 灵机${p.qi} · ${DANGER[p.danger]}${v.visited ? '' : ' · 没去过'}</span></span><span class="row">${go}</span></div>`;
      }).join('');
      const mine = regions[k].some((p) => p.id === me.locationId), fk = 'map-' + k;
      return `<div class="row between" style="margin-top:.5em"><h3 style="margin:0">${esc(k)} <span class="muted small">${regions[k].length} 处</span></h3>${foldBtn(fk, mine, '展开')}</div>${isOpen(fk, mine) ? rows : ''}`;
    }).join('');
    return `<h2>地图 <span class="muted">东弥州</span></h2>
      <div class="card map-wrap" id="map-wrap"><svg viewBox="0 0 ${W} ${H}" class="map" style="width:${Math.round(W * MAP.scale)}px" role="img" aria-label="世界地图">${labels}${lines.join('')}${nodes}</svg></div>
      <p class="muted small">可左右拖动；点地点看详情。${Object.keys(cw.placeTypes).map((k) => `<span class="legend t-${k}">●</span>${esc(cw.placeTypes[k].name)}`).join(' ')}；描金边的是去过的地方，大圈是你所在之处，虚线要${esc(CF.realms.names[cw.outer.gate.minMajor])}才过得去。</p>
      <div class="card"><h3 style="margin:0">地点一览 <span class="muted small">一段一段地走，路上出事就停下</span></h3>${list}</div>
      <p class="muted small">南域是东弥州有名的穷土。往北隔着万里荒原是中域；玉宸派本宗在东域宵明大泽，赤明派在北域鹿台山，魔道的怙照宗在西域极西，再往东是东海龙宫。${canGo ? '你已能驾遁光过去。' : '要到金丹，才驾得起遁光越过荒原。'}</p>`;
  };
  // 地图打开时把你所在之处滚到中间
  const centerMap = () => {
    const wrap = document.getElementById('map-wrap'), here = wrap && wrap.querySelector('.node.here circle');
    if (!wrap || !here) return;
    const svg = wrap.querySelector('svg'), vb = svg.viewBox.baseVal, k = svg.clientWidth / vb.width;
    wrap.scrollLeft = Math.max(0, Number(here.getAttribute('cx')) * k - wrap.clientWidth / 2);
    wrap.scrollTop = Math.max(0, Number(here.getAttribute('cy')) * k - wrap.clientHeight / 2);
  };

  /* ---------- 人物 ---------- */
  // 见闻：纪事、人物、天下大事三页互相切换
  const seenTabs = (cur) => `<div class="row tabs sub">${[['chron', '纪事'], ['people', '人物'], ['sagas', '天下大事']].map(([k, n]) => `<button class="${cur === k ? 'on' : ''}" data-act="page" data-p="${k}">${n}</button>`).join('')}</div>`;
  PAGE.sagas = () => `<h2>天下大事</h2>${seenTabs('sagas')}${sagaCard(UI.s) || '<div class="card"><p class="muted" style="margin:0">眼下没有什么风声。</p></div>'}
    <p class="muted small">大事的日子开局就排定了，提前三年有风声。和你沾边、快到了的，此刻页「做什么」上面也会提一句。</p>`;

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
      const rels = P.relationsOf(s, me.id).map((r) => ({ r, q: s.people[r.a === me.id ? r.b : r.a] })).sort((a, b) => (P.alive(b.q) - P.alive(a.q)) || b.r.strength - a.r.strength);
      body = rels.length ? `<table class="resp"><thead><tr><th>姓名</th><th>境界</th><th>势力</th><th>所在</th><th>交情</th></tr></thead><tbody>${rels.map(({ r, q }) => `<tr class="${P.alive(q) ? '' : 'dead'}"><td data-l="姓名">${pl(q.id)}</td><td data-l="境界">${P.alive(q) ? esc(P.realmName(q)) : '已故'}</td><td data-l="势力">${esc(P.factionName(s, q))}</td><td data-l="所在">${P.alive(q) ? placeLink(q.locationId) + (q.locationId !== me.locationId ? ' <button class="link" data-act="goto" data-id="' + q.locationId + '">去找</button>' : '') : '—'}</td><td data-l="交情" class="${r.strength < 0 ? 'bad' : r.strength >= 40 ? 'good' : ''}">${r.strength}${r.tags.length ? ' <span class="muted">' + esc(r.tags.join('/')) + '</span>' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">你还不认识谁。去拜访或游历时会结识人。</p>';
    }
    return `<h2>人物</h2>${seenTabs('people')}<div class="row tabs"><button class="${tab === 'here' ? 'on' : ''}" data-act="peopleTab" data-k="here">此地的人</button><button class="${tab === 'known' ? 'on' : ''}" data-act="peopleTab" data-k="known">我认识的人</button></div>
      <div class="card">${body}</div><p class="muted">交情到 ${CF.relations.consultMin} 以上，可以向修为比你高的人请教，每人每年一次，对方也可能婉拒。</p>`;
  };

  /* ---------- 采买：此地货架、宗门长老房（库藏与传功）、托人代寻合在一处，按用途分 ---------- */
  const MATERIALS = ['miluo', 'huanghua', 'lingtian', 'ganyin'];
  const shopCat = (key) => {
    if (key.startsWith('tech:')) { const t = CF.techniques[key.slice(5)]; return t && t.kind === 'shu' ? 'arts' : 'books'; }
    const it = CF.items[key];
    if (!it) return 'pills';
    if (it.gear || MATERIALS.includes(key)) return 'gear';
    return it.book ? 'books' : 'pills';
  };
  const keyName = (key) => key.startsWith('tech:') ? '《' + CF.techniques[key.slice(5)].name + '》' : CF.items[key].name;
  // 一次重绘里算过的路程记下来，免得每样东西都重算一遍
  const routeMemo = (s) => { const me = P.player(s), m = {}; return (id) => (id in m ? m[id] : (m[id] = FX.World.route(s, me.locationId, id, me))); };
  // 一门功法平时出在哪：哪类地方的货架常备或偶有、哪家长老房传（照配置说，不看今年有没有货）
  const techWhere = (s, t) => {
    const key = 'tech:' + t, out = [], MK = CF.market;
    const me = P.player(s);
    const names = (ty) => {
      const ps = Object.values(s.places).filter((p) => p.type === ty);
      if (!ps.length) return null;
      const far = !ps.some((p) => p.id === me.locationId || FX.World.route(s, me.locationId, p.id, me));
      return [ps.slice(0, 2).map((p) => p.name).join('、') + (ps.length > 2 ? '等处' : ''), far ? '，眼下去不了' : ''];
    };
    for (const ty in MK) {
      const d = MK[ty];
      const n = d && d.staples && names(ty);
      if (!n) continue;
      if (d.staples.some((x) => x.item === key)) out.push(n[0] + '的货架常备' + n[1]);
      else if ((d.rare || []).some((x) => x.item === key)) out.push(n[0] + '的货架偶尔有' + n[1]);
    }
    const libs = Object.values(s.factions).filter((f) => FX.Sect.library(f).some((e) => e.tech === t));
    if (libs.length) out.push(libs.slice(0, 3).map((f) => f.name).join('、') + '的长老房传给门人');
    const jk = CF.saga.jiaokao, jf = Object.values(s.factions).find((f) => f.key === jk.faction);
    for (const m in jk.upperGift) if (jk.upperGift[m] === key && jf) out.push(jf.name + '弟子' + CF.realms.names[m] + '时在' + jk.name + '评上考，赏这一门');
    return out.join('；');
  };
  // 一样东西眼下有哪些来路：此地货架、长老房、托人代寻；去过的别处今年有货也列上
  function sourcesOf(s, A, key, route) {
    const here = P.player(s).locationId;
    const m = FX.World.hasMarket(s, here) ? s.markets[here] : null;
    const tech = key.startsWith('tech:') ? key.slice(5) : null;
    const o = {
      market: m ? m.stock.find((x) => x.item === key && x.qty > 0) : null,
      redeem: tech ? null : A.find((a) => a.type === 'redeem' && a.item === key),
      learns: tech ? A.filter((a) => a.type === 'sect_learn' && a.tech === tech) : [],
      order: A.find((a) => a.type === 'order' && a.item === key),
      elsewhere: [],
    };
    for (const id in s.markets) {
      if (id === here || !s.player.visited.includes(id)) continue;
      const x = s.markets[id].stock.find((y) => y.item === key && y.qty > 0);
      const r = x && route(id);
      if (r) o.elsewhere.push({ id, name: s.places[id].name, days: r.days, price: x.price });
    }
    o.elsewhere.sort((a, b) => a.days - b.days);
    return o;
  }
  // 来路做成按钮：能办的直接办；长老房要回山门的给“回山门换”；办不了的灰掉并说明
  function srcBtns(s, A, key, src) {
    const M = CF.house.meritName, out = [], why = [];
    const f = FX.Sect.mine(s), away = f ? FX.Sect.awayReason(s, f) : '';
    const x = src.market;
    let live = false, poor = false, ready = false;
    if (x) {
      const can = Math.min(x.qty, Math.floor(s.player.stone / x.price));
      out.push(`<button data-act="buy" data-k="${esc(key)}" data-n="1" ${can >= 1 ? '' : 'disabled'} title="此地货架，存 ${x.qty}">买 · ${n0(x.price)} 符钱</button>`);
      if (!key.startsWith('tech:') && x.qty >= 5 && can >= 5) out.push(`<button data-act="buy" data-k="${esc(key)}" data-n="5">买 5</button>`);
      if (can >= 1) live = ready = true; else { why.push('符钱不够'); poor = true; }
    }
    const meritBtn = (a, text) => {
      if (a.ok) { live = ready = true; return `<button data-act="do" data-i="${A.indexOf(a)}">${esc(text)}</button>`; }
      if (a.reason === away) { live = true; return `<button data-act="goto" data-id="${f.seatId}" title="${esc(a.reason)}">回山门${esc(text)}</button>`; }
      why.push(a.reason);
      if (/不够/.test(a.reason)) poor = true;
      return `<button disabled title="${esc(a.reason)}">${esc(text)}</button>`;
    };
    if (src.redeem) {
      const a = src.redeem;
      out.push(meritBtn(a, '换 · ' + n0(a.cost) + ' ' + M));
      if (a.ok && ['qiju', 'heal'].includes(key) && a.cost * 5 <= s.player.merit) out.push(`<button data-act="doN" data-i="${A.indexOf(a)}" data-n="5">换 5</button>`);
    }
    for (const a of src.learns) out.push(meritBtn(a, a.zf ? '凭符诏取' : a.cost ? '换 · ' + n0(a.cost) + ' ' + M : '请授'));
    if (src.order) {
      const a = src.order;
      out.push(`<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.label)}">代寻 · ${n0(a.cost)} 符钱</button>`);
      if (a.ok) live = ready = true; else { why.push(a.reason); if (/不够/.test(a.reason)) poor = true; }
    }
    if (!live && !x) src.elsewhere.slice(0, 2).forEach((e) => out.push(`<button data-act="goto" data-id="${e.id}" title="今年${esc(e.name)}有货，${n0(e.price)} 符钱">去${esc(e.name)} · ${e.days} 天</button>`));
    if (!live && !x && src.elsewhere.length) live = true;
    // 道功不够、手里符钱多的，指一条捐输的路
    const dn = A.find((a) => a.type === 'donate' && (a.ok || a.reason === away) && s.player.stone >= a.cost);
    if (dn && why.some((w) => /道功不够/.test(w))) {
      const lack = Math.max(0, ...[src.redeem, ...src.learns].filter((a) => a && /道功不够/.test(a.reason)).map((a) => a.cost - s.player.merit));
      const n = Math.ceil(lack / dn.gain);
      out.push(dn.ok && n >= 1 && n * dn.cost <= s.player.stone ? `<button data-act="doN" data-i="${A.indexOf(dn)}" data-n="${n}" title="向功德殿捐输 ${n} 份">捐 ${n0(n * dn.cost)} 符钱补足${esc(M)}</button>` : '<button data-act="page" data-p="sect" data-tab="give">拿符钱捐输换道功</button>');
    }
    return { html: out.join(''), why: [...new Set(why.filter(Boolean))], live, poor, ready };
  }
  function shopRow(s, A, key, src, tag) {
    const tech = key.startsWith('tech:') ? CF.techniques[key.slice(5)] : null;
    const it = tech ? null : CF.items[key];
    const me = P.player(s);
    const owned = tech && s.player.manuals.includes(key.slice(5));
    const have = tech ? (me.techniqueId === key.slice(5) || me.kaifuId === key.slice(5) ? '正在修' : owned ? '已得' : '') : s.player.inv[key] ? '有 ' + s.player.inv[key] : '';
    const lrn = owned ? A.find((a) => a.type === 'learn' && a.tech === key.slice(5)) : null;
    const b = owned ? { html: lrn ? `<button data-act="do" data-i="${A.indexOf(lrn)}" ${lrn.ok ? '' : 'disabled'} title="${esc(lrn.reason || '')}">${esc(lrn.label.replace(/《.*》/, ''))}（1 个月）</button>` : '', why: lrn && !lrn.ok ? [lrn.reason] : [] } : srcBtns(s, A, key, src);
    const tw = !b.html && tech && !owned ? techWhere(s, key.slice(5)) : '';
    const where = !b.html && it && it.where ? '<br><span class="muted small">去处：' + esc(it.where) + '</span>' : tw ? '<br><span class="muted small">去处：' + esc(tw) + '</span>' : '';
    return `<div class="stat"><span><b>${esc(keyName(key))}</b>${tag ? ' <span class="tag t-warn">' + esc(tag) + '</span>' : ''}${have ? ' <span class="muted small">' + have + '</span>' : ''}
      ${tech ? '<br><span class="muted small">' + esc(techLine(tech)) + '</span>' : ''}<br>${desc(tech ? tech.desc : it.desc)}${where}${b.why.length && !b.ready ? '<br><span class="bad small">' + esc(b.why.join('；')) + '</span>' : ''}</span>
      <span class="row">${b.html}</span></div>`;
  }
  // 冲关缺的东西：要的在前，可选的在后；十三味大药缺的外药也算
  function neededKeys(s, ov) {
    const out = [];
    for (const r of ov.reqs) {
      if (r.ok) continue;
      if (r.item && CF.items[r.item]) out.push([r.item, r.optional ? '可选' : '冲关要']);
      if (r.items) r.items.forEach((k) => out.push([k, '大药']));
      if (r.kaifu) for (const k in CF.techniques) if (CF.techniques[k].kind === 'kaifu') out.push(['tech:' + k, '冲关要']);
    }
    return out;
  }
  PAGE.shop = (ov) => {
    const s = UI.s, A = Game.actions(s), me = ov.me, M = CF.house.meritName;
    const route = routeMemo(s);
    const here = me.locationId, m = FX.World.hasMarket(s, here) ? s.markets[here] : null;
    const f = FX.Sect.mine(s), v = f ? Game.view.house(s) : null;
    const keys = new Set();
    if (m) m.stock.forEach((x) => { if (x.qty > 0) keys.add(x.item); });
    for (const a of A) { if (a.type === 'redeem' || a.type === 'order') keys.add(a.item); if (a.type === 'sect_learn' || a.type === 'learn') keys.add('tech:' + a.tech); }
    // 筑基以后，比手上更好的开府真法也列出来（没货的折在下面，写明出在哪）
    if (me.realm.major === 3) { const kg = Math.max(0, ...s.player.manuals.filter((t) => CF.techniques[t].kind === 'kaifu').map((t) => CF.techniques[t].grade)); for (const t in CF.techniques) if (CF.techniques[t].kind === 'kaifu' && CF.techniques[t].grade > kg) keys.add('tech:' + t); }
    // 开府真法只列能弄到的；其余要的东西不论有没有来路都列出来，好知道去哪找
    const need = neededKeys(s, ov).filter(([k]) => !k.startsWith('tech:') || keys.has(k));
    const needSet = new Map(need);
    // 用不上的折起来：低两个大境界的关隘外药、不如身上那件的法器、已得的功法
    const stMin = {}; if (v) v.store.forEach((e) => { stMin[e.item] = e.minMajor || 0; });
    const past = (k) => {
      if (k.startsWith('tech:')) return (CF.techniques[k.slice(5)].kind === 'lianqi' && me.realm.major >= 3) || (s.player.manuals.includes(k.slice(5)) && !A.some((a) => a.type === 'learn' && a.tech === k.slice(5) && a.ok));
      const it = CF.items[k];
      if (it.gear) { const b = FX.Ars.best(me, it.gear.slot); return !!b && b.grade >= it.gear.grade; }
      if (needSet.has(k)) return false;
      // 关隘外药过了那一关就用不上了
      const B = CF.breakthrough;
      if (k === B.zhuji.pillItem && me.realm.major >= 3) return true;
      for (const ms in B.minorNeeds) if (B.minorNeeds[ms].item === k) { const [M, S] = ms.split('.').map(Number); if (me.realm.major > M || (me.realm.major === M && me.realm.stage > S)) return true; }
      return stMin[k] !== undefined && !['qiju', 'heal', 'yanshou'].includes(k) && stMin[k] + 2 <= me.realm.major;
    };
    const TABS = [['need', '冲关要的'], ['pills', '丹药灵物'], ['books', '功法'], ['arts', '道术'], ['gear', '法器宝材'], ['sell', '卖出']];
    const rowsOf = (cat) => [...keys].filter((k) => shopCat(k) === cat && !needSet.has(k));
    const counts = { need: need.length, sell: m ? Object.values(s.player.inv).filter((n) => n > 0).length : 0 };
    for (const [c] of TABS.slice(1, 5)) counts[c] = rowsOf(c).length;
    let tab = UI.shopTab;
    if (!tab || !TABS.some(([k]) => k === tab) || (tab === 'need' && !need.length)) tab = need.length ? 'need' : 'pills';
    // 页头：手头的钱、此地能办什么、最近的货架和山门
    let nearest = null;
    if (!m) for (const id in s.markets) { if (!s.player.visited.includes(id)) continue; const r = route(id); if (r && (!nearest || r.days < nearest.days)) nearest = { id, days: r.days }; }
    const coming = s.player.orders || [];
    const head = `<div class="card hl"><div class="kv"><div><span class="muted">符钱</span> <b>${n0(ov.stone)}</b></div>${f ? `<div><span class="muted">${esc(M)}</span> <b>${n0(ov.merit)}</b></div>` : ''}</div>
      <p class="small" style="margin:.4em 0 0">${m ? `此地有${ov.place.type === 'city' ? '集市' : '货架'}（${m.year} 年的货，每年一换）` : `此地没有货架${nearest ? `，最近的是${placeLink(nearest.id)} <button class="link" data-act="goto" data-id="${nearest.id}">赶过去 ${nearest.days} 天</button>` : ''}`}${f ? (v.atSeat ? '；你在山门，长老房可以换' : `；长老房要回${placeLink(f.seatId)}才能换 <button class="link" data-act="goto" data-id="${f.seatId}">赶回去</button>`) : '；拜入宗门后可拿' + esc(M) + '向长老房换'}。</p>
      ${coming.length ? `<p class="small muted" style="margin:.3em 0 0">托人代寻在途：${coming.map((o) => esc(FX.World.itemName(o.item)) + '（约 ' + T.fmt(o.due) + ' 到）').join('、')}</p>` : ''}</div>`;
    const tabsHtml = `<div class="row tabs sub">${TABS.filter(([k]) => k !== 'need' || need.length).map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-act="subTab" data-key="shopTab" data-k="${k}">${n}${counts[k] ? ' <span class="muted small">' + counts[k] + '</span>' : ''}</button>`).join('')}</div>`;
    let body;
    if (tab === 'sell') {
      const inv = Object.entries(ov.inv).filter(([k, n]) => n > 0 && CF.items[k]);
      body = !m ? '<p class="muted">此地收不了货。凡人国有集市，仙道墟市和宗门山门有货架。</p>'
        : inv.length ? inv.map(([k, n]) => `<div class="stat"><span>${esc(CF.items[k].name)} ×${n}</span><span class="row"><span class="muted small">${FX.World.sellPrice(s, k)}/个</span><button data-act="sell" data-k="${k}" data-n="1">卖 1</button>${n > 1 ? `<button data-act="sell" data-k="${k}" data-n="${n}">全卖</button>` : ''}</span></div>`).join('') + '<p class="muted small">按七成收。</p>'
          : '<p class="muted">行囊里没有能卖的。</p>';
    } else if (tab === 'need') {
      body = need.map(([k, t]) => shopRow(s, A, k, sourcesOf(s, A, k, route), t)).join('') + '<p class="muted small">按冲关卡片列的来：标「冲关要」的不齐不能冲，标「可选」「大药」的添把握或品第。</p>';
    } else {
      const all = rowsOf(tab).map((k) => ({ k, src: sourcesOf(s, A, k, route) }));
      const rows = all.map((x) => Object.assign(x, { b: srcBtns(s, A, x.k, x.src) }));
      rows.forEach((x) => { if (x.k.startsWith('tech:') && A.some((a) => a.type === 'learn' && a.tech === x.k.slice(5) && a.ok)) x.b.live = true; });
      const now = rows.filter((x) => !past(x.k) && (x.b.live || x.b.poor)), later = rows.filter((x) => !past(x.k) && !x.b.live && !x.b.poor), old = rows.filter((x) => past(x.k));
      now.sort((a, b) => b.b.live - a.b.live);
      const fk = 'shop-' + tab;
      body = `${now.map((x) => shopRow(s, A, x.k, x.src)).join('') || '<p class="muted">眼下这里没有能买能换的。</p>'}
        ${later.length ? `<div>${foldBtn(fk + '-later', false, '境界未到或眼下换不了的', later.length)}</div>${isOpen(fk + '-later', false) ? later.map((x) => shopRow(s, A, x.k, x.src)).join('') : ''}` : ''}
        ${old.length ? `<div>${foldBtn(fk + '-old', false, tab === 'arts' ? '已经得了的' : tab === 'books' ? (me.realm.major >= 3 ? '已经得了的、用不上的' : '已经得了的') : '你如今用不上的', old.length)}</div>${isOpen(fk + '-old', false) ? old.map((x) => shopRow(s, A, x.k, x.src)).join('') : ''}` : ''}`;
    }
    return `<h2>采买</h2>${head}${tabsHtml}<div class="card">${body}</div>`;
  };

  /* ---------- 行囊与坊市 ---------- */
  PAGE.bag = (ov) => {
    const s = UI.s;
    const A = Game.actions(s);
    const inv = Object.entries(ov.inv).filter(([, n]) => n > 0);
    const useBtn = (k) => { const a = A.find((x) => x.type === 'use' && x.item === k); return (a ? `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason)}">服用</button>` : '') ; };
    const buyBtns = (x) => {
      const can = Math.min(x.qty, Math.floor(ov.stone / x.price));
      if (x.item.startsWith('tech:')) return `<button data-act="buy" data-k="${esc(x.item)}" data-n="1" ${can >= 1 ? '' : 'disabled'}>买下</button>`;
      return `<button data-act="buy" data-k="${esc(x.item)}" data-n="1" ${can >= 1 ? '' : 'disabled'}>买 1</button>${x.qty >= 5 ? `<button data-act="buy" data-k="${esc(x.item)}" data-n="5" ${can >= 5 ? '' : 'disabled'}>买 5</button>` : ''}${can > 1 && can !== 5 ? `<button data-act="buy" data-k="${esc(x.item)}" data-n="${can}">${can === x.qty ? '全买' : '买得起的全买'}（${can}）</button>` : ''}`;
    };
    const m = s.markets[ov.place.id];
    const sellable = inv.filter(([k]) => CF.items[k]);
    const learn = A.filter((a) => a.type === 'learn');
    const orders = A.filter((a) => a.type === 'order');
    const coming = s.player.orders;
    const orderCard = orders.length || coming.length ? `<div class="card"><h3>托人代寻 <span class="muted small">今年没上架的稀罕货，加五成价托墟市去别处寻，到期一定送到</span></h3>
        ${coming.length ? `<p>在途：${coming.map((o) => esc(FX.World.itemName(o.item)) + '（约 ' + T.fmt(o.due) + ' 到）').join('、')}</p>` : ''}
        ${orders.map((a) => `<div class="stat"><span>${esc(FX.World.itemName(a.item))}</span><span class="row"><b>${a.cost} 符钱</b><button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason)}">托人代寻</button></span></div>`).join('')}
        ${orders.length ? '' : '<p class="muted">要托人代寻，得去金谷墟市（浮玉泊）。</p>'}</div>` : '';
    // 道术与神通
    const me = ov.me, artsK = ov.manuals.filter((t) => CF.techniques[t].kind === 'shu');
    const prac = A.filter((a) => a.type === 'practice');
    const artsCard = `<div class="card"><h3>道术与神通</h3><p class="muted small">得了玉简还要参习：入门、小成、中成、大成。攻伐、护身各算最好的一门；神通要金丹法力才使得出。</p>
      ${artsK.length ? artsK.map((k) => {
        const t = CF.techniques[k], lv = FX.Ars.level(me, k), xp = (me.arts || {})[k] || 0, th = CF.arts.xp[t.rank];
        const mine = prac.filter((a) => a.tech === k), why = (mine.find((a) => !a.ok) || {}).reason;
        const eff = lv ? artEff(me, k) : '';
        return `<div class="stat"><span>《${esc(t.name)}》 <span class="tag">${esc(CF.shuRankNames[t.rank])}</span> <b>${esc(FX.Ars.levelName(lv))}</b>${lv < 4 ? ` <span class="muted">${Math.floor(xp)}/${th[lv]}</span>` : ''}<br><span class="muted small">${esc(typeLine(t))}${eff ? ' · 眼下' + esc(eff) : ''}</span><br>${desc(t.desc)}</span>
          <span class="row">${lv < 4 ? mine.map((a) => `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason)}">参习 ${esc(T.dur(a.days))}</button>`).join('') : '<span class="tag t-good">大成</span>'}${why ? ' <span class="muted small">' + esc(why) + '</span>' : ''}</span></div>`;
      }).join('') : '<p class="muted">还没有道术。坊市里十几枚符钱就能买到下乘道术，宗门长老房也传；大派的神通要拿道功换。</p>'}</div>`;
    const books = ov.manuals.filter((t) => CF.techniques[t].kind !== 'shu');
    const bookCard = `<div class="card"><h3>法门</h3>${books.length ? books.map((t) => `<div class="stat"><span>《${esc(CF.techniques[t].name)}》 <span class="muted small">${esc(techLine(CF.techniques[t]))}</span><br>${desc(CF.techniques[t].desc)}</span><span>${t === ov.me.techniqueId || t === ov.me.kaifuId ? '<span class="tag t-good">正在修</span>' : (() => { const a = learn.find((x) => x.tech === t); return a ? `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason)}">${ov.me.techniqueId ? '改修' : '研习'}（1 个月）</button>` : ''; })()}</span></div>`).join('') : '<p class="muted">还没有任何法门。胎息之后要有一门练炁术才能往下修。</p>'}</div>`;
    // 法器
    const gear = me.gear || [];
    const ga = A.filter((a) => a.group === '法器');
    const gShort = (a) => a.type === 'jilian' ? '祭炼 ' + a.n + ' 道（' + n0(a.cost) + '）' : a.type === 'lianxing' ? '炼形（' + n0(a.cost) + '）' : a.type === 'lianhua' ? '炼化 ' + T.dur(a.days) : a.type === 'chongzhu' ? '熔' + CF.items[a.item].name + '重铸' : '卖 ' + n0(a.gain);
    const gearCard = `<div class="card"><h3>法器</h3><p class="muted small">攻伐、护身、遁行三类各用最好的一件。炼形一次至多十道禁制；上品符器再炼形就成了法器，要金丹法力和本命精血；道器只有纯阳以上掌控得了。</p>
      ${gear.length ? gear.map((g) => {
        const inUse = FX.Ars.best(me, g.slot) === g;
        const acts = ga.filter((a) => a.gid === g.id);
        const lx = acts.find((a) => a.type === 'lianxing' && !a.ok) || acts.find((a) => a.type === 'jilian' && !a.ok);
        const ling = g.ling === undefined ? 100 : Math.floor(g.ling);
        return `<div class="stat"><span><b>${esc(g.name)}</b> <span class="tag">${esc(CF.gear.slotNames[g.slot])}</span> ${esc(FX.Ars.gradeName(g))} · ${g.jin} 道禁制${inUse ? ' <span class="tag t-good">在用</span>' : ''}<br><span class="muted small">${esc(gearEff(me, g))} · 材质够炼形到${esc(CF.gear.gradeNames[g.cap])}${g.grade >= 4 && ling < 100 ? ' · 器灵炼化 ' + ling + '%' : ''}${lx ? ' · ' + esc(lx.reason) : ''}</span></span>
          <span class="row">${acts.map((a) => `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.label + (a.reason ? '：' + a.reason : ''))}">${esc(gShort(a))}</button>`).join('')}</span></div>`;
      }).join('') : '<p class="muted">身上没有符器。坊市里有飞剑、法衣、飞梭，宗门库藏也能拿道功换。</p>'}</div>`;
    const itemCard = `<div class="card"><div class="stat"><span>符钱</span><b class="big">${n0(ov.stone)}</b></div>
        ${inv.length ? inv.map(([k, n]) => `<div class="stat"><span>${esc(CF.items[k].name)} ×${n}<br>${desc(CF.items[k].desc)}</span><span class="row">${useBtn(k)}${m ? `<button data-act="sell" data-k="${k}" data-n="1">卖 1</button>${n > 1 ? `<button data-act="sell" data-k="${k}" data-n="${n}">全卖（${n}）</button>` : ''} <span class="muted small">${FX.World.sellPrice(s, k)}/个</span>` : ''}</span></div>`).join('') : '<p class="muted">身无长物。</p>'}
        ${ov.me.realm.major >= 2 && s.player.inv.qiju ? `<p class="muted small" style="margin:.4em 0 0">闭关、修炼时${esc(CF.items.qiju.name)}药力一尽就从行囊里续服一颗 · ${autoPillBtn()}</p>` : ''}
      </div>`;
    const marketCard = m ? `<div class="card"><h3>${esc(ov.place.name)}${ov.place.type === 'city' ? '集市' : '货架'} <span class="muted small">${m.year} 年的货，每年换一次</span></h3>
        ${m.stock.map((x) => `<div class="stat"><span>${esc(FX.World.itemName(x.item))} <span class="muted small">存 ${x.qty}</span><br>${desc(x.item.startsWith('tech:') ? techLine(CF.techniques[x.item.slice(5)]) + ' · ' + CF.techniques[x.item.slice(5)].desc : CF.items[x.item].desc)}</span><span class="row"><b>${n0(x.price)}</b>${buyBtns(x)}</span></div>`).join('')}
        ${sellable.length ? '<p class="muted small">卖东西在“物品”一栏，按七成收。</p>' : '<p class="muted small">卖东西：行囊里的灵草、妖物材料等按七成收。</p>'}</div>` : `<div class="card"><p class="muted">此地买卖不了东西。凡人国有集市，仙道墟市和宗门山门有货架。</p></div>`;
    if (!['items', 'books', 'gear'].includes(UI.bagTab)) UI.bagTab = 'items';
    const tab = UI.bagTab;
    void marketCard; void orderCard;
    return `<h2>行囊</h2>
      ${subTabs('bagTab', [['items', '物品'], ['books', '功法 ' + (books.length + artsK.length)], ['gear', '法器 ' + gear.length]])}
      ${tab === 'items' ? itemCard : tab === 'books' ? bookCard + artsCard : gearCard}
      <p class="muted small">买丹药、换功法法器都在「采买」页：此地货架、长老房、托人代寻放在一起比。 <button class="link" data-act="page" data-p="shop">去采买</button></p>`;
  };

  /* ---------- 宗门 ---------- */
  PAGE.sect = (ov) => {
    const s = UI.s, v = Game.view.house(s), M = CF.house.meritName;
    const A = Game.actions(s);
    const btn = (a, text, quiet) => (a ? `<button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'} title="${esc(a.reason || '')}">${esc(text || a.label)}</button>${a.ok || !a.reason || quiet ? '' : ' <span class="muted small">' + esc(a.reason) + '</span>'}` : '');
    const parts = (ps) => ps.map((x) => x.label + ' ' + (x.value > 0 ? '+' : '') + x.value).join('；');
    if (!v.member) {
      const cond = (j) => (!j ? '不收外人' : j.closed ? j.closed : `至少${CF.realms.names[j.minMajor]}${j.maxAge ? '，年不过 ' + j.maxAge : ''}；每年可求一回`);
      return `<h2>宗门</h2>
        <div class="card"><p class="muted" style="margin:0">散修来去自由，可功法、外药都得自己去墟市买。拜入宗门后，根本法门向长老房请授便是，每年领俸禄；做差事、领符诏除妖、上交妖物内丹和道书抄本都能记${esc(M)}，再拿${esc(M)}去长老房换冲关外药和更好的功法。</p></div>
        ${v.sects.map((x) => { const a = A.find((y) => y.type === 'join' && y.fid === x.f.id); return `<div class="card"><div class="row between"><h3 style="margin:0">${esc(x.f.name)}</h3><span class="muted">${placeLink(x.seat.id)}${x.route && x.route.days ? ' · 约 ' + x.route.days + ' 天路程 <button class="link" data-act="goto" data-id="' + x.seat.id + '">赶过去</button>' : x.route ? ' · 就在此地' : ''}</span></div>
          <p class="muted">${esc(x.f.blurb)}</p>
          <div class="stat"><span>拜入条件</span><b>${esc(cond(x.join))}</b></div>
          ${x.join && !x.join.closed ? `<div class="stat"><span>${trace('成功率', parts(x.chance.parts))}</span><b>${x.chance.chance}%</b></div>` : ''}
          <div class="row">${a ? btn(a) : x.can === true ? '' : '<span class="muted">' + esc(x.can) + '</span>'}</div></div>`; }).join('')}`;
    }
    const f = v.faction, clan = f.type === 'clan', major = ov.me.realm.major;
    // 传功：能换的在前；已得的、境界还不够的折起来
    const libRow = (e) => {
      const a = A.find((x) => x.type === 'sect_learn' && x.tech === e.tech && !x.zf);
      const zfa = A.find((x) => x.type === 'sect_learn' && x.tech === e.tech && x.zf);
      const learn = A.find((x) => x.type === 'learn' && x.tech === e.tech);
      const cost = a ? a.cost : e.merit;
      const right = e.using ? '<span class="tag t-good">正在修</span>' : e.owned ? (learn ? btn(learn, (ov.me.techniqueId ? '改修' : '研习') + '（1 个月）') : '<span class="muted">已得</span>') : btn(a, cost ? `${n0(cost)} ${M}` : '请授', true) + (zfa ? btn(zfa, '凭符诏取', true) : '');
      const why = !e.owned && a && !a.ok && a.reason ? ' · <span class="bad">' + esc(a.reason) + '</span>' : '';
      return `<div class="stat"><span>《${esc(e.t.name)}》${e.zf ? ' <span class="tag">二十五正法·' + esc(e.zf) + '</span>' : ''}<br><span class="muted small">${esc(techLine(e.t))}${e.note ? ' · ' + esc(e.note) : ''}${e.minMajor ? ' · ' + CF.realms.names[e.minMajor] + '以后才传' : ''}${e.req ? ' · 要' + esc(e.req) : ''}${why}</span><br>${desc(e.t.desc)}</span><span class="row">${right}</span></div>`;
    };
    const libNow = v.library.filter((e) => !e.owned && !(e.minMajor > major));
    const libLater = v.library.filter((e) => !e.owned && e.minMajor > major);
    const libHave = v.library.filter((e) => e.owned);
    const libHtml = `${libNow.length ? libNow.map(libRow).join('') : '<p class="muted">眼下没有能请授的了。</p>'}
      ${libLater.length ? `<div>${foldBtn('libLater', false, '境界到了才传的', libLater.length)}</div>${isOpen('libLater', false) ? libLater.map(libRow).join('') : ''}` : ''}
      ${libHave.length ? `<div>${foldBtn('libHave', false, '已经得了的', libHave.length)}</div>${isOpen('libHave', false) ? libHave.map(libRow).join('') : ''}` : ''}`;
    const storeRow = (e) => {
      const a = A.find((x) => x.type === 'redeem' && x.item === e.item);
      const cost = a ? a.cost : e.merit;
      const many = a && a.ok && cost * 5 <= v.merit && ['qiju', 'heal'].includes(e.item) ? `<button data-act="doN" data-i="${A.indexOf(a)}" data-n="5">换 5 份（${n0(cost * 5)}）</button>` : '';
      return `<div class="stat"><span>${esc(e.it.name)}${e.have ? ' <span class="muted small">已有 ' + e.have + '</span>' : ''}${e.minMajor ? ' <span class="muted small">' + CF.realms.names[e.minMajor] + '以后</span>' : ''}<br>${desc(e.it.desc)}</span><span class="row">${btn(a, n0(cost) + ' ' + M, true)}${cost < e.merit ? ' <s class="muted small">' + n0(e.merit) + '</s>' : ''}${many}</span></div>`;
    };
    // 用不上的折起来：境界还没到的；低两个大境界的关隘外药；不如身上那件的法器
    const past = (e) => {
      const it = CF.items[e.item];
      if (it.gear) { const b = FX.Ars.best(ov.me, it.gear.slot); return !!b && b.grade >= it.gear.grade; }
      return !['qiju', 'heal', 'yanshou'].includes(e.item) && (e.minMajor || 0) + 2 <= major;
    };
    const stLater = v.store.filter((e) => e.minMajor > major), stPast = v.store.filter((e) => !(e.minMajor > major) && past(e));
    const stNow = v.store.filter((e) => !stLater.includes(e) && !stPast.includes(e));
    const storeHtml = `${stNow.map(storeRow).join('') || '<p class="muted">眼下没有用得上的。</p>'}${stLater.length ? `<div>${foldBtn('stLater', false, '境界到了才换的', stLater.length)}</div>${isOpen('stLater', false) ? stLater.map(storeRow).join('') : ''}` : ''}${stPast.length ? `<div>${foldBtn('stPast', false, '你如今用不上的', stPast.length)}</div>${isOpen('stPast', false) ? stPast.map(storeRow).join('') : ''}` : ''}`;
    const subs = A.filter((x) => x.type === 'submit');
    const work = A.find((x) => x.type === 'work');
    const mission = A.find((x) => x.type === 'mission');
    const canLib = libNow.filter((e) => { const a = A.find((x) => x.type === 'sect_learn' && x.tech === e.tech); return a && a.ok; }).length;
    const canStore = stNow.filter((e) => { const a = A.find((x) => x.type === 'redeem' && x.item === e.item); return a && a.ok; }).length;
    const tr = A.find((x) => x.type === 'transfer');
    const lv = A.find((x) => x.type === 'leave');
    const up = !clan && f.key === 'xuanzhen' ? `<p class="muted">玄真派是玉宸派下辖的道脉。到了金丹，可去东域宵明大泽的玉宸派本宗持道脉符书改投，${esc(M)}照记，不看运气。宵明大泽是灵窟，日后冲击元神正用得上。</p>` : '';
    const dn = A.find((x) => x.type === 'donate');
    const ten = dn && dn.ok && dn.cost * 10 <= ov.stone ? `<button data-act="doN" data-i="${A.indexOf(dn)}" data-n="10">捐 10 份（${n0(dn.cost * 10)} 符钱）</button>` : '';
    const hundred = dn && dn.ok && dn.cost * 100 <= ov.stone ? `<button data-act="doN" data-i="${A.indexOf(dn)}" data-n="100">捐 100 份（${n0(dn.cost * 100)} 符钱）</button>` : '';
    // 玉宸九殿：元神以后入殿任职，各殿职权不同
    const halls = A.filter((x) => x.type === 'hall');
    const HD = CF.house.halls, myHall = ov.me.hall;
    const awayR = FX.Sect.awayReason(s, f);
    const hallAway = halls.some((a) => a.reason === awayR);
    const hallCard = f.key === 'yuchen' && (halls.length || myHall) ? `<div class="card ${myHall ? '' : 'hl'}"><h3>玉宸九殿</h3>
        ${myHall ? `<p>你在<b>${esc(HD.defs[myHall].name)}</b>任${esc(HD.rankNames[FX.Sect.hallRank(ov.me)])}：${esc(HD.defs[myHall].duty)}。<br><span class="good">职权：${esc(HD.defs[myHall].perk)}</span></p>` : '<p class="warn">你已成元神，可以入九殿任职了。各殿职权不同，挑一处；转殿要隔 ' + HD.every + ' 年。元神为长老，返虚为副殿主，纯阳以上为殿主，职权跟着加重。</p>'}
        ${hallAway && (!myHall || isOpen('halls', false)) ? `<p class="bad small">入殿、转殿${esc(awayR)}。 <button class="link" data-act="goto" data-id="${v.seat.id}">赶回去</button></p>` : ''}
        ${myHall ? `<div>${foldBtn('halls', false, '其余八殿')}</div>` : ''}
        ${!myHall || isOpen('halls', false) ? halls.map((a) => { const d = HD.defs[a.hall]; return `<div class="stat"><span><b>${esc(d.name)}</b> <span class="muted small">${esc(d.duty)}</span><br><span class="small">${esc(d.perk)}</span>${a.ok || a.reason === awayR ? '' : '<br><span class="bad small">' + esc(a.reason) + '</span>'}</span><span class="row"><button data-act="do" data-i="${A.indexOf(a)}" ${a.ok ? '' : 'disabled'}>${myHall ? '转入' : '入此殿'}</button></span></div>`; }).join('') : ''}
      </div>` : '';
    const tab = UI.sectTab || 'main';
    const rb = v.atSeat ? null : routeMemo(s)(v.seat.id);
    const awayBar = v.atSeat ? '' : `<p class="warn small" style="margin-top:0">你不在山门：请授、兑换、上交${dn ? '、捐输' : ''}都要回${placeLink(v.seat.id)}办。 <button class="link" data-act="goto" data-id="${v.seat.id}">赶回去${rb ? ' ' + rb.days + ' 天' : ''}</button></p>`;
    const toShop = '<p class="muted small" style="margin-top:0">想和墟市的货一起比价，去「采买」页：长老房、货架、托人代寻都在那里。 <button class="link" data-act="page" data-p="shop">去采买</button></p>';
    const body = tab === 'lib' ? `<div class="card">${awayBar}${toShop}${libHtml}</div>`
      : tab === 'store' ? `<div class="card">${awayBar}<p class="muted small" style="margin-top:0">常备，随时可换。手头 ${n0(v.merit)} ${esc(M)}。</p>${toShop}${storeHtml}</div>`
      : tab === 'give' ? `<div class="card">${awayBar}<h3>${clan ? '上交族中' : '功德房 · 上交'}</h3>
          ${subs.length ? `<div class="col">${subs.map((a) => `<div>${btn(a)}</div>`).join('')}</div>` : `<p class="muted">行囊里没有可上交的东西。${Object.entries(v.submit).map(([k, n]) => esc(CF.items[k].name) + '每件记 ' + n).join('、')}；本门没有的道书抄本按价值记，每部只记一次。</p>`}
          ${dn ? `<h3>功德殿 · 捐输</h3><p class="muted">八派六宗的门人可以拿符钱折${esc(M)}，每 ${n0(dn.cost)} 符钱记 ${dn.gain} ${esc(M)}。</p><div class="row">${btn(dn)}${ten}${hundred}</div>` : ''}</div>`
      : `<div class="card hl">
          <div class="stat"><span>${esc(M)}</span><b class="big">${n0(v.merit)}</b></div>
          <div class="stat"><span>职位</span><b>${esc(v.postName)}${v.leader && v.post < 3 ? ' <span class="muted">· ' + (clan ? '家主' : '掌门') + '是' + esc(v.leader.name) + '（' + esc(P.realmName(v.leader)) + '）</span>' : ''}</b></div>
          <div class="stat"><span>每年俸禄</span><b>符钱 ${n0(v.stipend.stone)}${v.stipend.qiju ? '、' + esc(CF.items.qiju.name) + '×' + v.stipend.qiju : ''}</b></div>
          <div class="stat"><span>${clan ? '族中' : '山门'}</span><b>${placeLink(v.seat.id)}${v.atSeat ? ' <span class="good">（你在这里）</span>' : ` <button class="link" data-act="goto" data-id="${v.seat.id}">赶回去</button>`}</b></div>
          ${v.atSeat ? '' : '<p class="muted small" style="margin:.3em 0 0">请授、兑换、上交、领差事都要回山门办。</p>'}
          <p class="muted small" style="margin-bottom:0">${clan ? '族里' : '奉事房'}的差事每月记 ${v.taskMerit} ${esc(M)}，另给符钱；${clan ? '替家族除妖' : '领符诏除妖'}打赢了记 ${v.missionMerit} ${esc(M)}，逃了就算没办成。</p>
          <div class="row" style="margin-top:.5em">${work ? btn(work) : ''}${mission ? btn(mission) : ''}</div>
        </div>
        ${hallCard}
        <div class="card"><h3>去留</h3>${up}${tr ? `<div class="row">${btn(tr)}</div>` : ''}
          ${lv ? `<div class="row"><button class="danger" data-act="doAsk" data-i="${A.indexOf(lv)}">${esc(lv.label)}</button></div>` : ''}
          <p class="muted small" style="margin-bottom:0">辞出以后就是散修，可以去求入别的宗门；八派六宗要金丹才收。</p></div>`;
    return `<h2>${clan ? '家族' : '宗门'} <span class="muted">${esc(f.name)}</span></h2>
      ${subTabs('sectTab', [['main', '概况'], ['lib', (clan ? '家传' : '传功') + (canLib ? ' · ' + canLib + ' 可换' : '')], ['store', '库藏' + (canStore ? ' · ' + canStore + ' 可换' : '')], ['give', '上交' + (dn ? '·捐输' : '') + (subs.length ? ' · ' + subs.length : '')]])}
      ${body}`;
  };

  /* ---------- 纪事 ---------- */
  PAGE.chron = () => {
    const s = UI.s, f = UI.chron.filter;
    const list = s.history.filter((e) => (f === 'pov' ? e.pov : f === 'rumor' ? !e.pov && e.severity >= 2 : e.pov || e.severity >= 2)).slice(-400).reverse();
    return `<h2>纪事</h2>${seenTabs('chron')}<div class="row tabs">${[['pov', '亲历'], ['rumor', '传闻'], ['all', '全部']].map(([k, n]) => `<button class="${f === k ? 'on' : ''}" data-act="chronFilter" data-k="${k}">${n}</button>`).join('')}</div>
      <div class="card log">${list.map((e) => `<p class="${e.pov ? '' : 'rumor'}"><span class="y">${esc(T.fmt(e.t))}</span>${esc(FX.H.text(e))}</p>`).join('') || '<p class="muted">尚无</p>'}</div>
      ${s.history.length > 400 ? '<p class="muted">只列最近 400 条。</p>' : ''}`;
  };

  /* ---------- 存档与设置 ---------- */
  // 手机上玩：网页版里教人加到主屏幕；单文件版里给出网页版的网址
  function phoneCard() {
    const W = FX.PWA || {};
    if (W.web && W.standalone) return `<div class="card"><h3>手机上玩</h3><p class="good" style="margin:0">已经装在主屏幕上了，断网也能玩。</p><p class="muted small" style="margin-bottom:0">存档只在这台手机里；换手机、清浏览器数据之前，先在存档管理里导出一份。</p></div>`;
    if (W.web) {
      const how = W.wechat ? '在微信里打开的话，先点右上角「…」选「在浏览器打开」，再按下面的办法加到主屏幕。'
        : W.ios ? '用 Safari 打开本页，点底部的分享按钮（方框带向上箭头），选「添加到主屏幕」。'
        : '点浏览器菜单里的「添加到主屏幕」或「安装应用」。';
      return `<div class="card hl"><h3>装到手机主屏幕</h3><p style="margin-top:0">装好以后像 App 一样从主屏幕打开，全屏、断网也能玩。${esc(how)}</p>
        ${W.canPrompt ? '<div class="row"><button class="primary" data-act="installApp">装到主屏幕</button></div>' : ''}
        <p class="muted small" style="margin-bottom:0">存档只在这台手机里；换手机、清浏览器数据之前，先在存档管理里导出一份。电脑上的存档用「复制为文本」，在手机上「从文本导入」即可。</p></div>`;
    }
    return `<div class="card"><h3>手机上玩</h3><p style="margin-top:0">用手机浏览器打开 <a href="${esc(W.url || '')}" target="_blank" rel="noopener">${esc(W.url || '')}</a>，再加到主屏幕，就能像 App 一样全屏、离线玩。</p><p class="muted small" style="margin-bottom:0">这里的存档带不过去，要先在存档管理里「复制为文本」，到手机上「从文本导入」。</p></div>`;
  }
  PAGE.sys = () => `<h2>存档与设置</h2>
    <div class="card"><div class="row"><button data-act="openSaves">存档管理 / 导入导出</button><button data-act="life">看生平</button><button class="danger" data-act="askNew">另开一生</button></div>
      <p class="muted">每次行动后自动存档。种子：${esc(UI.s.seed)}</p></div>
    <div class="card"><h3>字号</h3><div class="row"><button data-act="font" data-d="-1">小一号</button><button data-act="font" data-d="1">大一号</button></div></div>
    ${phoneCard()}
    <div class="card"><h3>这一版</h3><p>个人主角版，世界与设定取自《仙业》的东弥州：从南域起步，结成金丹后可遁过万里荒原，去中域、东域、西域、北域与东海。境界从胎息、练炁、筑基、紫府、洞玄、金丹一路到元神、返虚、纯阳、合道，九难过尽成大冶仙人；每过一道大关定一回根底（真炁品秩、道基、紫府异象、先天金汞、金丹品第、元神法相），前面的成色影响后面。拜入宗门与宗门传功，后期的天下大事（地渊开启、撷芳宴、道脉校考、天魔潮、丹元大会、四院大比）、玉宸派/赤明派/怙照宗三家大派、玉宸九殿任职、金丹十三味大药、法器与道术神通、洞府与洞天、仇家都已能玩。怀悟洞主、苗南老祖、君尧、颜熙真君等原著配角也在世上。势力行动、秘密与剧情线在第 2 阶段，大模型生成事件在第 3 阶段接入。</p>
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
        ${P.rootNames(p).length ? `<div class="stat"><span>根基</span><b>${esc(P.rootNames(p).join(' · '))}</b></div>` : ''}
        ${(p.gear || []).length ? `<div class="stat"><span>法器</span><b>${p.gear.map((g) => esc(FX.Ars.title(g))).join('、')}</b></div>` : ''}
        ${Object.keys(p.arts || {}).some((k) => FX.Ars.level(p, k) > 0) ? `<div class="stat"><span>道术神通</span><b>${Object.keys(p.arts).filter((k) => FX.Ars.level(p, k) > 0).map((k) => esc(FX.Ars.artLabel(p, k))).join('、')}</b></div>` : ''}
        ${p.bio ? `<p class="muted">《仙业》人物 · ${esc(p.bio)}</p>` : ''}
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
        <p>${esc(p.region || '南域')} · ${esc(v.typeName)}${v.faction ? ' · ' + esc(v.faction.name) : ''}${v.here ? ' · <b class="warn">你在这里</b>' : v.visited ? ' · 去过' : ' · 没去过'}</p>
        <div class="stat"><span>灵机</span><b>${stars(p.qi)} ${QI[p.qi]} · 属「${esc(p.attr)}」</b></div>
        ${v.fit ? `<div class="stat"><span>你在此采气</span><b class="${v.fit.value >= 1 ? 'good' : v.fit.value < 0.5 ? 'bad' : ''}">${esc(v.fit.short)} ×${v.fit.value}</b></div>` : ''}
        ${p.blurb ? `<p class="muted">${esc(p.blurb)}</p>` : ''}
        ${v.faction && v.faction.blurb ? `<p class="muted">${esc(v.faction.blurb)}</p>` : ''}
        <div class="stat"><span>危险</span><b class="${p.danger >= 3 ? 'bad' : ''}">${stars(Math.min(5, p.danger))} ${DANGER[p.danger]}</b></div>
        <div class="stat"><span>相邻</span><span>${p.links.map((l) => esc(s.places[l.to].name) + ' ' + l.days + '天').join('、')}</span></div>
        ${v.blocked ? `<p class="warn">${esc(v.blocked)}。</p>` : ''}
        ${v.here ? '' : v.route ? `<p>从你所在之处出发：${v.route.path.map((id) => esc(s.places[id].name)).join(' → ')}，共 ${v.route.days} 天。路是一段一段走的，每段都可能出事。</p>
          ${next ? `<div class="row"><button class="primary" data-act="goto" data-id="${p.id}">一路赶过去（${v.route.days} 天）</button><button data-act="do" data-i="${A.indexOf(next)}" data-close="1">只走第一段</button></div>` : ''}` : ''}
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
        <h3>导出</h3><div class="row"><button data-act="exportFile" ${UI.s ? '' : 'disabled'}>下载 .json 文件</button><button data-act="exportText" ${UI.s ? '' : 'disabled'}>复制为文本</button>${FX.PWA && FX.PWA.canShareFile() ? `<button data-act="shareSave" ${UI.s ? '' : 'disabled'}>分享存档文件</button>` : ''}</div>
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
    page(d) { UI.page = d.p; if (d.tab) UI[d.p + 'Tab'] = d.tab; UI.centerMap = d.p === 'map'; UI.modals = UI.modals.filter((m) => m.type === 'event' || m.type === 'ending'); render(); G.scrollTo && G.scrollTo(0, 0); },
    subTab(d) { UI[d.key] = d.k; if (d.key === 'actTab') remember('actTab', d.k); render(); },
    fold(d) { UI.fold[d.k] = !(UI.fold[d.k] === undefined ? d.def === '1' : UI.fold[d.k]); try { localStorage.setItem('family-xiuxian:fold', JSON.stringify(UI.fold)); } catch (e) { /* 忽略 */ } render(); },
    unclamp(d, el) { el.classList.toggle('clamp'); },
    // 一路赶到某地：按最短路一段一段走，路上出事、走不通就停下
    goto(d) {
      const s = UI.s, to = s.places[d.id];
      UI.modals = UI.modals.filter((m) => m.type !== 'place');
      let legs = 0, why = '';
      while (legs < 40) {
        const me = P.player(s);
        if (me.locationId === d.id) break;
        const v = Game.view.place(s, d.id);
        if (!v.route || v.route.path.length < 2) { why = v.blocked || '走不通'; break; }
        const a = Game.actions(s).find((x) => x.type === 'travel' && x.to === v.route.path[1]);
        if (!a || !a.ok) { why = a ? a.reason : '此刻走不了'; break; }
        const r = Game.act(s, a);
        if (!r.ok) { why = r.error; break; }
        legs++;
        if (s.pending.length || s.ended || r.interrupted) { why = s.pending.length ? '路上出了事，先处理' : r.text || ''; break; }
      }
      const arrived = P.player(s).locationId === d.id;
      toast(arrived ? `到了${to.name}${legs > 1 ? '（走了 ' + legs + ' 段）' : ''}` : (legs ? `走了 ${legs} 段，停在${s.places[P.player(s).locationId].name}：` : '✗ ') + why, 3500);
      if (arrived && UI.page === 'map') UI.page = 'now';
      afterAction();
    },
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
      if (G.scrollTo) G.scrollTo(0, 0);
      toast(`${P.player(UI.s).name}踏入仙途（种子 ${seed}）`, 3500);
    },
    async continue() { const t = await loadAuto(); if (t) readSave(t); },
    newRun() { UI.s = null; UI.modals = []; render(); },
    askNew() { pushModal({ type: 'confirm', title: '另开一生', text: '当前这一生会留在自动存档里，直到新的一生开始后被覆盖。要继续保留，先存到槽位。', onYes: () => { UI.s = null; UI.modals = []; render(); } }); },
    do(d, el) {
      const a = Game.actions(UI.s)[Number(d.i)];
      if (!a) return;
      if (a.warn && !d.sure) { pushModal({ type: 'confirm', title: a.label, text: a.warn + '确定吗？', onYes: () => ACT.do({ i: d.i, sure: '1' }) }); return; }
      if (el && el.dataset.close) UI.modals = UI.modals.filter((m) => m.type !== 'place');
      const r = Game.act(UI.s, a);
      if (!r.ok) { toast('✗ ' + r.error); return; }
      if (repeatable(a)) { UI.last = {}; for (const k of LAST_KEYS) if (a[k] !== undefined) UI.last[k] = a[k]; remember('last', UI.last); }
      if (r.text) toast(r.text);
      afterAction();
    },
    // 快捷栏里的冲关有身死之险：先问一句，免得连点闭关时误点
    doRisk(d) {
      const a = Game.actions(UI.s)[Number(d.i)];
      if (!a) return;
      const bt = Game.view.overview(UI.s).breakthrough;
      pushModal({ type: 'confirm', title: a.label, text: `成功率 ${bt ? bt.chance : '?'}%，失败时约 ${bt ? bt.death : '?'}% 身死。确定现在冲关吗？`, onYes: () => ACT.do({ i: d.i }) });
    },
    buy(d) { const r = Game.buy(UI.s, d.k, Number(d.n) || 1); toast(r.ok ? r.text : '✗ ' + r.error); if (r.ok) afterAction(); },
    doAsk(d) {
      const a = Game.actions(UI.s)[Number(d.i)];
      if (!a) return;
      pushModal({ type: 'confirm', title: a.label, text: '这一步回不了头，确定吗？', onYes: () => { const r = Game.act(UI.s, a); toast(r.ok ? r.text || '已办' : '✗ ' + r.error); if (r.ok) afterAction(); } });
    },
    doN(d) {
      const a = Game.actions(UI.s)[Number(d.i)];
      if (!a) return;
      const r = Game.act(UI.s, Object.assign({}, a, { qty: Number(d.n) }));
      if (!r.ok) { toast('✗ ' + r.error); return; }
      if (r.text) toast(r.text);
      afterAction();
    },
    autoPill(d) { Game.setOption(UI.s, 'autoPill', d.v === '1'); toast(d.v === '1' ? '闭关时会自动续服' : '不再自动服用'); afterAction(); },
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
    async shareSave() {
      const p = P.player(UI.s);
      const r = await FX.PWA.shareFile(`修仙录-${p.name}-${UI.s.year}年.json`, Game.save.serialize(UI.s, Date.now()));
      if (r === false) toast('这个浏览器分享不了文件，请改用下载或复制文本');
    },
    async installApp() { const ok = await FX.PWA.prompt(); toast(ok ? '已装到主屏幕' : '没有安装'); render(); },
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
    try { UI.fold = JSON.parse(localStorage.getItem('family-xiuxian:fold') || '{}') || {}; } catch (e) { UI.fold = {}; }
    try { UI.last = JSON.parse(localStorage.getItem('family-xiuxian:last') || 'null'); UI.actTab = JSON.parse(localStorage.getItem('family-xiuxian:actTab') || 'null'); } catch (e) { UI.last = null; }
    applyFont();
    UI.storeKind = await FX.Store.init();
    UI.hasAuto = !!(await loadAuto());
    if (UI.storeKind === 'none') toast('浏览器不允许本地存储：请用“导出”保存进度', 6000);
    if (FX.PWA) FX.PWA.onchange = () => { if (!UI.modals.length && (!UI.s || UI.page === 'sys')) render(); };
    render();
  }
  FX.UI = UI;
  boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
