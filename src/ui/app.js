/* ============================================================
 * ui —— 交互界面。只通过 FX.Game 公开函数操作核心，不直接修改状态。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = G.FX;
  const Game = FX.Game, CF = FX.CONFIG, P = FX.P;

  const UI = {
    s: null, page: 'hall', modals: [], more: false,
    roster: { q: '', sort: 'realm', dir: -1, showGone: false },
    cult: { filterDuty: '', batchDuty: 'seclusion', batchCond: 'attention' },
    chron: { type: '', open: null },
    start: { origin: 'market', surname: '', seed: '' },
    storeKind: 'none', lastSaveWarn: null,
    aiRaw: new Set(), aiDirty: false, // 看原文的条目；输入框聚焦时延后刷新
  };
  const $ = (sel) => document.querySelector(sel);
  const esc = (x) => String(x === undefined || x === null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString('zh-CN');
  const n0 = (x) => Math.round(x).toLocaleString('zh-CN');
  const sign = (x) => (x > 0 ? '+' : '') + n1(x);
  const pl = (id) => { const p = UI.s.people[id]; return p ? `<button class="link" data-act="person" data-id="${p.id}">${esc(p.name)}</button>` : '—'; };
  const bar = (v, cls) => `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;
  const trace = (label, parts) => `<span class="trace" data-act="trace" data-t="${esc(parts)}" title="${esc(parts)}">${label}</span>`;
  const unfinished = (t) => `<div class="unfinished">${esc(t)}</div>`;
  const AI = FX.AI, Agent = FX.Agent;
  // AI 润色块：模板先行，润色到达后替换显示，可切回原文；失败只给一行灰字
  function aiBlock(key, templateHtml, opt) {
    opt = opt || {};
    const text = AI.get(key);
    const raw = UI.aiRaw.has(key);
    if (text && !raw) {
      const body = opt.html ? opt.html(text) : esc(text).split('\n').filter(Boolean).map((x) => `<p>${x}</p>`).join('');
      return `<div class="ai-text">${body}</div><div class="ai-bar"><span class="tag ai-tag" title="由大模型依据真实记录改写，不影响游戏结果">AI 润色</span><button class="link" data-act="aiRaw" data-k="${esc(key)}">看原文</button></div>`;
    }
    let bar = '';
    if (text) bar = `<span class="tag">原文</span><button class="link" data-act="aiRaw" data-k="${esc(key)}">看润色</button>`;
    else if (AI.isPending(key)) bar = '<span class="muted">AI 润色中…（先显示原文）</span>';
    else if (opt.kind) {
      const fail = AI.failure(key);
      const rd = AI.ready();
      if (fail) bar = `<span class="muted">AI 润色未采用：${esc(fail)}，已显示原文。</span>` + (rd.ok ? ` <button class="link" data-act="aiPolish" data-kind="${opt.kind}" data-t="${opt.arg || ''}">重试</button>` : '');
      else if (rd.ok && !opt.auto) bar = `<button class="link" data-act="aiPolish" data-kind="${opt.kind}" data-t="${opt.arg || ''}">${opt.label || 'AI 润色'}</button>`;
    }
    return templateHtml + (bar ? `<div class="ai-bar">${bar}</div>` : '');
  }
  const BR = { main: '嫡系', side: '旁支' };
  const ORIGIN_P = { native: '本家', married_in: '嫁入/入赘', guest: '客卿' };

  function toast(msg, ms) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), ms || 2600);
  }
  function result(r, okMsg) {
    if (!r) return false;
    if (r.ok === false) { toast('✗ ' + r.error); return false; }
    if (okMsg) toast(okMsg);
    if (r.note) toast(r.note, 3500);
    afterAction();
    return true;
  }

  /* ---------- 存档 ---------- */
  let saveTimer = null;
  function afterAction() { scheduleSave(); render(); }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 300); }
  async function autosave() {
    if (!UI.s) return;
    const text = Game.save.serialize(UI.s, Date.now());
    const r = await FX.Store.put('auto', text);
    if (r && r.warn && UI.lastSaveWarn !== r.warn) { UI.lastSaveWarn = r.warn; toast(r.warn, 4000); }
    FX.Store.delSync('auto');
  }
  async function readSave(text) {
    const r = Game.save.deserialize(text);
    if (!r.ok) { toast('读取失败：' + r.error, 5000); return false; }
    UI.s = r.state; UI.modals = []; UI.page = 'hall';
    afterAction();
    openPendingIfAny();
    return true;
  }
  async function loadAuto() {
    const a = await FX.Store.get('auto');
    const b = FX.Store.getSync('auto');
    const pick = [a, b].filter(Boolean).map((t) => { try { return { t, at: JSON.parse(t).meta.savedAt || 0 }; } catch (e) { return null; } }).filter(Boolean).sort((x, y) => y.at - x.at)[0];
    return pick ? pick.t : null;
  }

  /* ---------- 模态 ---------- */
  function pushModal(m) { UI.modals.push(m); render(); setTimeout(() => { const f = document.querySelector('.modal [autofocus], .modal button:not(:disabled)'); if (f) f.focus(); }, 0); }
  function popModal() { UI.modals.pop(); render(); }
  function openPendingIfAny() {
    if (UI.s && UI.s.pending.length && !UI.modals.some((m) => m.type === 'event')) pushModal({ type: 'event' });
  }

  /* ================= 渲染 ================= */
  function render() {
    const root = $('#app');
    if (!UI.s) { root.innerHTML = renderStart() + renderModals(); return; }
    const pages = PAGES();
    const ov = Game.view.overview(UI.s);
    const nav = pages.map((p) => `<button class="${UI.page === p.id ? 'on' : ''}" data-act="page" data-p="${p.id}">${p.name}${p.badge ? `<span class="badge">${p.badge}</span>` : ''}</button>`).join('');
    const mainPages = ['hall', 'roster', 'cult', 'econ', 'chron'];
    const bottom = mainPages.map((id) => { const p = pages.find((x) => x.id === id); return `<button class="${UI.page === id ? 'on' : ''}" data-act="page" data-p="${id}">${p.short || p.name}${p.badge ? `<span class="badge">${p.badge}</span>` : ''}</button>`; }).join('') + `<button data-act="more" class="${mainPages.includes(UI.page) ? '' : 'on'}">更多</button>`;
    const more = UI.more ? `<div class="more-menu">${pages.filter((p) => !mainPages.includes(p.id)).map((p) => `<button data-act="page" data-p="${p.id}">${p.name}</button>`).join('')}</div>` : '';
    root.innerHTML = `
      <div class="app">
        <nav class="side" aria-label="主导航"><div class="brand">家族修仙录</div><div class="sub">${esc(ov.surname)}氏 · 第 ${ov.year} 年</div>${nav}</nav>
        <main id="main">${pages.find((p) => p.id === UI.page).render(ov)}</main>
        <aside class="right" aria-label="提醒与纪事">${renderAside(ov)}</aside>
      </div>
      <nav class="bottom" aria-label="底部导航">${bottom}</nav>${more}
      ${renderModals()}`;
  }

  function PAGES() {
    const s = UI.s;
    const att = FX.Sim.needsAttention(s).length;
    return [
      { id: 'hall', name: '宗祠', render: pageHall, badge: s.pending.length || '' },
      { id: 'roster', name: '族人名册', short: '名册', render: pageRoster },
      { id: 'cult', name: '修炼安排', short: '安排', render: pageCult, badge: att || '' },
      { id: 'econ', name: '产业经营', short: '产业', render: pageEcon },
      { id: 'chron', name: '年代纪事', short: '纪事', render: pageChron },
      { id: 'tree', name: '族谱', render: pageTree },
      { id: 'fac', name: '势力外交', render: pageFac },
      { id: 'rules', name: '家规与设置', render: pageRules },
    ];
  }

  function renderAside(ov) {
    const s = UI.s;
    const items = [];
    if (s.pending.length) items.push(`<p class="warn">⚑ ${s.pending.length} 件事待决断 <button class="link" data-act="openEvent">处理</button></p>`);
    if (ov.attention) items.push(`<p>☐ ${ov.attention} 人差事需处理 <button class="link" data-act="page" data-p="cult">去安排</button></p>`);
    if (ov.requests) items.push(`<p>✉ ${ov.requests} 条族人请求 <button class="link" data-act="page" data-p="hall">查看</button></p>`);
    if (ov.deficit) items.push(`<p class="bad">入不敷出：商铺、洞府、炼丹房效率减半</p>`);
    const ch = FX.H.chronicle(s, s.turn).concat(s.turn > 1 ? FX.H.chronicle(s, s.turn - 1) : []).sort((a, b) => b.year - a.year).slice(0, 12);
    return `<h3>提醒</h3>${items.join('') || '<p class="muted">暂无</p>'}<h3>最近纪事</h3><div class="log">${ch.map((e) => `<p><span class="y">${e.year}年</span>${esc(e.text)}</p>`).join('') || '<p class="muted">尚无</p>'}</div>`;
  }

  /* ---------- 开局 ---------- */
  function renderStart() {
    const o = CF.origins;
    const st = UI.start;
    return `<div class="start">
      <h1 style="text-align:center">家族修仙录</h1>
      <p class="muted" style="text-align:center">经营一个可能延续数百年、也可能一夜覆灭的修仙家族。</p>
      <div class="card"><h3>继续</h3><div class="row">
        <button class="primary" data-act="continue" ${UI.hasAuto ? '' : 'disabled'}>继续上次（自动存档）</button>
        <button data-act="openSaves">读取存档 / 导入</button>
      </div><p class="muted" style="margin:.5em 0 0">存储：${storeLabel()}</p></div>
      <div class="card"><h3>新建家族</h3>
        <div class="grid">${Object.keys(o).map((k) => `<div class="card origin ${st.origin === k ? 'sel' : ''}" data-act="pickOrigin" data-k="${k}" tabindex="0" role="button" aria-pressed="${st.origin === k}">
          <h3>${o[k].name}</h3><p class="muted">${o[k].blurb}</p>
          <div class="stat"><span>老祖</span><b>炼气${CF.realms.stageNames[1][o[k].elderStage - 1]}，50 岁</b></div>
          <div class="stat"><span>族人</span><b>${2 + o[k].family.adults + o[k].family.youths} 人</b></div>
          <div class="stat"><span>灵石 / 灵谷</span><b>${o[k].resources.stone} / ${o[k].resources.grain}</b></div>
          <div class="stat"><span>功法</span><b>${CF.techniques[o[k].technique].name}</b></div>
          <div class="stat"><span>家规</span><b>${CF.rules.succession[o[k].rules.succession].name}·${CF.rules.allocation[o[k].rules.allocation].name}·${CF.rules.foreign[o[k].rules.foreign].name}</b></div>
        </div>`).join('')}</div>
        <div class="row" style="margin-top:1em">
          <label>姓氏 <input type="text" maxlength="2" id="in-surname" value="${esc(st.surname)}" placeholder="留空随机" style="width:6em"></label>
          <label>种子 <input type="text" id="in-seed" value="${esc(st.seed)}" placeholder="留空随机" style="width:10em"></label>
          <button class="primary" data-act="newGame">开宗立族</button>
        </div>
      </div>
      <p class="muted">当前为阶段 1（可玩核心）。外交、危机战斗、交互族谱、完整事件链等尚未完成，界面中均有标注，详见“家规与设置 → 未完成功能”。</p>
    </div>`;
  }
  const storeLabel = () => ({ idb: 'IndexedDB（浏览器本地数据库）', ls: 'localStorage（降级模式）', none: '不可用，请用导出保存' }[UI.storeKind]);

  /* ---------- 宗祠 ---------- */
  function pageHall(ov) {
    const s = UI.s;
    const anc = ov.ancestor;
    const fc = ov.forecast;
    const res = ov.resources;
    const r1 = (k, label, extra) => `<div class="stat"><span>${label}</span><b class="num">${n1(res[k])}${extra || ''}</b></div>`;
    const ancWarn = anc && anc.left <= 15 ? 'bad' : anc && anc.left <= 30 ? 'warn' : '';
    const succ = ov.successors.map((p) => `${pl(p.id)}（${esc(p.realm)}，余寿 ${p.left}）`).join('、') || '<span class="bad">无</span>';
    const hasZhuji = P.living(s).some((p) => p.realm.major >= 2);
    const edgeParts = ov.edgeTarget.parts.map((x) => x.label + ' ' + n1(x.value)).join('；');
    const defParts = ov.defense.parts.map((x) => x.label + ' ' + x.value).join('；');
    const heirAcc = s.family.heirId ? FX.Family.acceptance(s, s.family.heirId, s.family.headId) : null;
    const reqs = s.family.requests.map((q) => `<div class="stat"><span>${pl(q.personId)}：${esc(q.what)} <span class="muted">（${esc(q.why)}；代价：${esc(FX.Family.requestCost(s, q))}）</span></span><span class="row"><button data-act="req" data-id="${q.id}" data-a="1">准</button><button data-act="req" data-id="${q.id}" data-a="0">驳</button></span></div>`).join('');
    const ended = s.ended ? `<div class="card hl"><h2>${esc(s.ended.what)}</h2><p>第 ${s.ended.year} 年 · 评级 <b class="big">${s.ended.rating.grade}</b> ${esc(s.ended.rating.title)} ${esc(s.ended.rating.why)}（${s.ended.rating.total} 分）</p><p class="muted">${s.ended.rating.parts.map((x) => x.label + ' ' + x.value).join('，')}</p><div class="row"><button class="primary" data-act="history">查看《${esc(s.family.surname)}氏家史》</button><button data-act="newRun">再开一局</button></div>${unfinished('当前家史为简版（按章节摘录真实记录）；完整家史与导出属于阶段 4。')}</div>` : '';
    const lr = s.lastReport;
    return `${ended}
      <div class="row between"><h1>${esc(ov.surname)}氏宗祠</h1><div class="row">
        <span class="muted">第 ${ov.turn} 回合 · 第 ${ov.year} 年${ov.phase === 'advancing' ? '（推进中，第 ' + (ov.yearInTurn + 1) + ' 年待续）' : ''}</span>
        <button class="primary" data-act="advance" ${s.ended || s.pending.length || Agent.running ? 'disabled' : ''}>${ov.phase === 'advancing' ? '继续推进' : '推进五年'}</button>
      </div></div>
      ${s.pending.length ? `<div class="card hl"><b>有 ${s.pending.length} 件事等家主决断：</b>${s.pending.map((i) => esc(FX.Ev.def(i.defId).name)).join('、')} <button data-act="openEvent" ${Agent.running ? 'disabled' : ''}>处理</button></div>` : ''}
      ${pageAgent()}
      <div class="grid">
        <div class="card ${ancWarn ? 'hl' : ''}"><h3>老祖寿元</h3>
          ${anc ? `<div class="big ${ancWarn}">${anc.left} 年</div><p>${pl(anc.id)} · ${esc(anc.realm)} · ${trace('战力 ' + anc.power, '最高战力者即老祖/太上长老')}</p>
          <p>可顶上的后继：${succ}</p>${!hasZhuji ? '<p class="muted">族中尚无筑基修士。老祖寿尽而无筑基后继，将群狼环伺。</p>' : ''}` : '<p class="bad">族中已无修士</p>'}
        </div>
        <div class="card"><h3>家主</h3>
          ${ov.head ? `<p>${pl(ov.head.id)} · ${esc(ov.head.realm)} · ${ov.head.age} 岁</p>
          <div class="stat"><span>${trace('家主威望', '来源：功绩、修为、年龄、处置公正；处置不公、决策失败、改家规会折损。低于 50 时重大决定易遇阻')}</span><b class="num">${ov.head.prestige}</b></div>${bar(ov.head.prestige)}
          <div class="stat"><span>${trace('嫡系支持度', '受继承制度、资源分配、家主出身、威望影响；低于 25 将出现抗议与出走')}</span><b class="num">${n0(ov.branches.main.support)}</b></div>${bar(ov.branches.main.support, ov.branches.main.support < 25 ? 'bad' : 'good')}
          <div class="stat"><span>旁支支持度</span><b class="num">${n0(ov.branches.side.support)}</b></div>${bar(ov.branches.side.support, ov.branches.side.support < 25 ? 'bad' : 'good')}
          <p>继承人：${ov.heir ? pl(ov.heir.id) + `（接受度 ${heirAcc.value}，${{ high: '高', mid: '中', low: '低' }[heirAcc.level]}）` : '<span class="muted">未指定</span>'}
          <button data-act="heirPicker" ${s.ended ? 'disabled' : ''}>指定</button> <button data-act="abdicate" ${!ov.heir || s.ended ? 'disabled' : ''}>退位</button></p>` : '<p class="bad">无家主</p>'}
        </div>
        <div class="card"><h3>家族</h3>
          <div class="stat"><span>人口（本家血脉）</span><b class="num">${ov.population}（${ov.natives}）</b></div>
          <div class="stat"><span>家族声望</span><b class="num">${ov.prestige}</b></div>
          <div class="stat"><span>${trace('锋芒', '目标 ' + ov.edgeTarget.total + '：' + edgeParts + '。每年最多变化 3 点；高于 60 被盯上（阶段 3 起影响外部事件）')}</span><b class="num">${n1(ov.edge)}</b></div>${bar(ov.edge, ov.edge > 60 ? 'bad' : '')}
          <div class="stat"><span>${trace('护族战力', defParts || '无')}</span><b class="num">${ov.defense.total}</b></div>
          <div class="stat"><span>里程碑</span><b>${s.family.milestones.length}</b></div>
        </div>
      </div>
      <div class="card"><h3>资源</h3><div class="grid">
        <div>${r1('stone', '灵石', ` <span class="${fc.netStone >= 0 ? 'good' : 'bad'}">${trace('(' + sign(fc.netStone) + '/年)', fc.parts.map((x) => x.label + '：' + x.text).join('；') + '。另有商铺售货与炼丹收支未计入')}</span>`)}${r1('grain', '灵谷', ` <span class="${fc.netGrain >= 0 ? 'good' : 'bad'}">(${sign(fc.netGrain)}/年)</span>`)}${r1('herb', '灵药')}${r1('ore', '矿材')}</div>
        <div>${r1('qiju', '聚气丹')}${r1('heal', '疗伤丹')}${r1('zhuji', '筑基丹')}${r1('rareHerb', '稀有灵药')}${res.yanshou ? r1('yanshou', '延寿丹') : ''}${res.ningdan ? r1('ningdan', '凝丹丹药') : ''}</div>
      </div></div>
      ${reqs ? `<div class="card"><h3>族人请求</h3>${reqs}<p class="muted">未处理的请求在下回合结束时按驳回处理。</p></div>` : ''}
      ${lr ? `<div class="card"><h3>上回合摘要（第 ${lr.fromYear}–${lr.toYear} 年）</h3><p class="muted">灵石 ${sign(lr.delta.stone)}，灵谷 ${sign(lr.delta.grain)}，人口 ${lr.population[0]} → ${lr.population[1]}</p>${lr.entries.length ? aiBlock(AI.turnKey(s, lr.turn), `<div class="log">${lr.entries.slice(-10).map((id) => { const e = FX.H.get(s, id); return e ? `<p><span class="y">${e.year}年</span>${esc(FX.H.text(e))}</p>` : ''; }).join('')}</div>`, { kind: 'turn', arg: lr.turn }) : '<p class="muted">五年无大事。</p>'}<button data-act="page" data-p="chron">查看全部纪事</button></div>` : ''}
      ${pageAdvisor()}
      <div class="row"><button class="danger" data-act="seal" ${s.ended ? 'disabled' : ''}>封存族史（结束本局）</button></div>`;
  }

  /* ---------- 名册 ---------- */
  function pageRoster() {
    const s = UI.s, R = UI.roster;
    let list = Object.values(s.people).filter((p) => R.showGone || p.status === 'alive');
    if (R.q) list = list.filter((p) => p.name.includes(R.q) || p.traits.some((t) => t.includes(R.q)) || P.realmName(p).includes(R.q) || FX.Sim.dutyStatus(s, p).includes(R.q));
    const key = {
      name: (p) => p.name, branch: (p) => p.branch, realm: (p) => P.realmRank(p) * 10000 + p.progress, age: (p) => P.age(s, p), left: (p) => P.lifespanLeft(s, p),
      loyalty: (p) => p.loyalty, ambition: (p) => p.ambition, duty: (p) => FX.Sim.dutyStatus(s, p), apt: (p) => p.aptitude,
    }[R.sort] || ((p) => p.id);
    list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * R.dir; });
    const th = (k, l) => `<th data-act="sort" data-k="${k}" aria-sort="${R.sort === k ? (R.dir > 0 ? 'ascending' : 'descending') : 'none'}">${l}${R.sort === k ? (R.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    return `<h1>族人名册</h1>
      <div class="row"><input type="text" id="in-rq" placeholder="搜索姓名、性格、境界、差事" value="${esc(R.q)}" data-input="rq" style="flex:1;min-width:12em">
      <label><input type="checkbox" data-chg="showGone" ${R.showGone ? 'checked' : ''}> 显示已故/离族</label><span class="muted">${list.length} 人</span></div>
      <table class="resp"><thead><tr>${th('name', '姓名')}${th('branch', '分支')}${th('realm', '境界')}${th('apt', '资质')}${th('age', '年龄')}${th('left', '寿元')}${th('loyalty', '忠诚')}${th('ambition', '野心')}${th('duty', '差事')}<th>性格</th></tr></thead><tbody>
      ${list.map((p) => `<tr class="${p.status !== 'alive' ? 'dead' : p.attention ? 'attn' : ''}">
        <td data-l="姓名">${pl(p.id)}${p.id === s.family.headId ? ' <span class="tag t-warn">家主</span>' : ''}${s.family.elderIds.includes(p.id) ? ' <span class="tag t-good">太上</span>' : ''}${p.origin !== 'native' ? ` <span class="tag">${ORIGIN_P[p.origin]}</span>` : ''}</td>
        <td data-l="分支">${BR[p.branch]}</td><td data-l="境界">${esc(P.realmName(p))}</td><td data-l="资质" class="num">${p.aptitude}</td>
        <td data-l="年龄" class="num">${p.status === 'dead' ? p.deathYear - p.birthYear : P.age(s, p)}</td><td data-l="寿元" class="num">${p.status === 'alive' ? P.lifespanLeft(s, p) : '—'}</td>
        <td data-l="忠诚" class="num ${p.loyalty < 30 ? 'bad' : ''}">${p.loyalty}</td><td data-l="野心" class="num">${p.ambition}</td>
        <td data-l="差事">${esc(FX.Sim.dutyStatus(s, p))}</td><td data-l="性格">${p.traits.map((t) => `<span class="tag" title="${esc(CF.traits.desc[t])}">${t}</span>`).join('')}</td></tr>`).join('')}
      </tbody></table>`;
  }

  /* ---------- 修炼安排 ---------- */
  function pageCult() {
    const s = UI.s, U2 = UI.cult;
    const adults = P.adults(s).sort((a, b) => (!!b.attention - !!a.attention) || (P.realmRank(b) - P.realmRank(a)));
    const att = FX.Sim.needsAttention(s);
    const dutyOpts = (p) => Object.keys(CF.duties).map((k) => { const ok = FX.Sim.dutyAllowed(s, p, k); return `<option value="${k}" ${p.duty.type === k ? 'selected' : ''} ${ok !== true ? 'disabled' : ''}>${CF.duties[k].name}${ok !== true ? '（' + ok + '）' : ''}</option>`; }).join('');
    const gates = P.living(s).map((p) => ({ p, b: Game.breakthroughPreview(s, p.id) })).filter((x) => x.b && x.b.kind && (x.b.can.ok || P.isFull(x.p)));
    const conc = s.family.rules.allocation === 'concentrate';
    const cands = P.living(s).filter((p) => P.hasRoot(p) && p.realm.major > 0).sort((a, b) => b.aptitude - a.aptitude);
    return `<h1>修炼安排</h1>
      <div class="card ${att.length ? 'hl' : ''}"><div class="row between"><div>差事默认沿用上回合。${att.length ? `<b class="warn">${att.length} 人需要处理</b>（新成年、伤愈、被撤职、新入族等，已高亮）` : '无人需要处理。'}</div>
        <div class="row"><button data-act="suggest" data-all="0" ${!att.length ? 'disabled' : ''}>按建议安排需处理者</button><button data-act="suggest" data-all="1">全族按建议重排</button></div></div>
        <div class="row" style="margin-top:.6em">批量：把
          <select data-chg="batchCond"><option value="attention" ${U2.batchCond === 'attention' ? 'selected' : ''}>需处理者</option><option value="none" ${U2.batchCond === 'none' ? 'selected' : ''}>无差事者</option>${Object.keys(CF.duties).map((k) => `<option value="d:${k}" ${U2.batchCond === 'd:' + k ? 'selected' : ''}>当前「${CF.duties[k].name}」者</option>`).join('')}<option value="mortal" ${U2.batchCond === 'mortal' ? 'selected' : ''}>所有凡人</option><option value="lowapt" ${U2.batchCond === 'lowapt' ? 'selected' : ''}>资质低于 45 的修士</option></select>
          改派为 <select data-chg="batchDuty">${Object.keys(CF.duties).filter((k) => !CF.duties[k].locked).map((k) => `<option value="${k}" ${U2.batchDuty === k ? 'selected' : ''}>${CF.duties[k].name}</option>`).join('')}</select>
          <button data-act="batch">执行</button></div>
      </div>
      <div class="card"><h3>差事</h3><table class="resp"><thead><tr><th>族人</th><th>境界 / 修为</th><th>${trace('修炼速度', '点击个人速度可看到各项系数')}</th><th>状态</th><th>差事</th><th></th></tr></thead><tbody>
      ${adults.map((p) => { const sp = FX.CU.breakdown(s, p); return `<tr class="${p.attention ? 'attn' : ''}">
        <td data-l="族人">${pl(p.id)}${p.attention ? ` <span class="tag t-warn">${esc(p.attention)}</span>` : ''}${s.family.focusIds.includes(p.id) ? ' <span class="tag t-good">重点</span>' : ''}</td>
        <td data-l="境界">${esc(P.realmName(p))}${p.realm.major > 0 ? ` <span class="muted num">${n0(p.progress)}/${P.need(p) === Infinity ? '—' : P.need(p)}</span>` : ''}</td>
        <td data-l="修炼速度" class="num">${trace(sp.total + '/年', sp.factors.map((f) => f.label + ' ×' + f.value).join('；'))}</td>
        <td data-l="状态">${p.health.state === 'healthy' ? '健康' : `<span class="bad">${p.health.state === 'heavy' ? '重伤' : '轻伤'}（${Math.ceil(p.health.recoverYears / 5)} 回合）</span>`}</td>
        <td data-l="差事"><select data-chg="duty" data-id="${p.id}" aria-label="${esc(p.name)}的差事" ${p.health.state === 'heavy' ? 'disabled' : ''}>${p.duty.type ? '' : '<option value="">— 待安排 —</option>'}${dutyOpts(p)}</select></td>
        <td>${p.attention ? `<button data-act="keepDuty" data-id="${p.id}" title="确认沿用当前差事">沿用</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="card"><h3>重点培养对象</h3>
        ${conc ? `<p class="muted">集中培养：至多 2 人，修炼 ×1.25、丹药优先；其余修士 ×0.9，且忠诚缓降。</p><div class="row">${cands.slice(0, 12).map((p) => `<label class="tag ${s.family.focusIds.includes(p.id) ? 't-good' : ''}"><input type="checkbox" data-chg="focus" data-id="${p.id}" ${s.family.focusIds.includes(p.id) ? 'checked' : ''}> ${esc(p.name)}（资质 ${p.aptitude}）</label>`).join('')}</div>` : `<p class="muted">现行资源分配为「${CF.rules.allocation[s.family.rules.allocation].name}」，不设重点对象。改为集中培养可在“家规与设置”。</p>`}
      </div>
      <div class="card"><h3>突破</h3>
        <p class="muted">炼气一至八层修满自动晋升。筑基小瓶颈${s.family.settings.autoMinor ? '已设为自动尝试' : '需手动尝试'}（<button class="link" data-act="toggleSet" data-k="autoMinor">切换</button>）。大关需要家主决定。</p>
        ${gates.length ? gates.map(({ p, b }) => `<div class="opt"><div class="row between"><b>${pl(p.id)} 冲击${esc(b.target)}</b><span class="big num ${b.chance >= 60 ? 'good' : b.chance < 30 ? 'bad' : ''}">${b.chance}%</span></div>
          <div class="meta">${b.parts.map((x) => `${esc(x.label)} <b>${typeof x.value === 'number' ? sign(x.value) : x.value}</b>`).join('；')}（上限 ${b.max}%）</div>
          <div class="meta">失败：${b.kind === 'minor' ? '损失一成修为' : `修为跌落 30–50%、重伤，身死概率 <b class="bad">${b.death}%</b>`}；之后休养一回合，下次 -5%。</div>
          <div class="row" style="margin-top:.4em">${b.can.ok ? `<button class="primary" data-act="tryBreak" data-id="${p.id}">尝试突破</button>` : `<span class="muted">${esc(b.can.reason)}</span>`}${b.kind === 'zhuji' && !s.family.resources.zhuji ? '<span class="muted">提示：坊市偶有筑基丹出售（产业经营）。</span>' : ''}</div></div>`).join('') : '<p class="muted">暂无人修为圆满。</p>'}
      </div>`;
  }

  /* ---------- 产业 ---------- */
  function pageEcon() {
    const s = UI.s, b = s.family.buildings, res = s.family.resources;
    const fc = FX.Econ.forecast(s);
    const bl = Object.keys(CF.buildings).map((k) => {
      const d = CF.buildings[k], lv = b[k] || 0;
      const c = FX.Econ.canUpgrade(s, k);
      const cost = lv < d.max ? FX.Econ.upgradeCost(k, lv + 1) : null;
      return `<tr><td data-l="建筑"><b>${d.name}</b> <span class="muted">${esc(d.desc)}</span></td><td data-l="等级" class="num">${lv} / ${d.max}</td>
        <td data-l="年维护" class="num">${d.upkeep * lv}</td><td data-l="升级费用" class="num">${cost ? cost.stone + ' 灵石' + (cost.ore ? ' + ' + cost.ore + ' 矿材' : '') : '—'}</td>
        <td>${d.locked ? '<span class="muted">阶段 3</span>' : `<button data-act="upgrade" data-k="${k}" ${c.ok ? '' : 'disabled'} title="${esc(c.reason || '')}">${lv ? '升级' : '建造'}</button>`}</td></tr>`;
    }).join('');
    const offers = s.market.offers.map((o) => `<tr><td data-l="货物">${CF.items[o.item]}${o.rare ? ' <span class="tag t-warn">稀有</span>' : ''}</td><td data-l="存量" class="num">${o.qty}</td><td data-l="单价" class="num">${n1(o.price)}</td>
      <td><button data-act="buy" data-k="${o.item}" data-q="1" ${o.qty < 1 || res.stone < o.price ? 'disabled' : ''}>买 1</button>${o.qty >= 10 ? ` <button data-act="buy" data-k="${o.item}" data-q="10" ${res.stone < o.price * 10 ? 'disabled' : ''}>买 10</button>` : ''}</td></tr>`).join('');
    const sellable = ['grain', 'herb', 'ore', 'qiju', 'rareHerb'].filter((k) => res[k] >= 1);
    const set = s.family.settings;
    return `<h1>产业经营</h1>
      <div class="card"><h3>年度收支预估</h3>${fc.parts.map((x) => `<div class="stat"><span>${x.label}</span><span>${esc(x.text)}</span></div>`).join('')}
        <div class="stat"><span>净灵石 / 净灵谷</span><b class="${fc.netStone >= 0 ? 'good' : 'bad'}">${sign(fc.netStone)} / ${sign(fc.netGrain)}</b></div>
        <p class="muted">灵谷仓储上限 ${FX.Econ.grainCap(s)}，超出部分每年腐败 10%。商铺每年自动出售多余矿材与灵谷（${b.alchemy ? '' : '无炼丹房时也出售灵药，'}市价：灵谷 ${s.market.prices.grain}，矿材 ${s.market.prices.ore}，灵药 ${s.market.prices.herb}）。</p></div>
      <div class="card"><h3>建筑</h3><table class="resp"><thead><tr><th>建筑</th><th>等级</th><th>年维护</th><th>下一级费用</th><th></th></tr></thead><tbody>${bl}</tbody></table>
        <p class="muted">升级费用 = 一级费用 × 1.8^(目标等级−1)；三级起另需矿材。</p></div>
      <div class="card"><h3>产业链</h3>
        <div class="stat"><span>灵田划作药田</span><span class="row"><button data-act="herb" data-d="-1" ${set.herbPlots <= 0 ? 'disabled' : ''}>−</button><b class="num">${set.herbPlots} / ${b.field || 0} 级</b><button data-act="herb" data-d="1" ${set.herbPlots >= (b.field || 0) ? 'disabled' : ''}>＋</button></span></div>
        <div class="stat"><span>炼丹（灵药 3 + 灵石 5 → 聚气丹；成丹率 60% + 等级×10%）</span><span>${b.alchemy ? `炼丹者 ${FX.Econ.workers(s, 'alchemy').length} 人，每人每年 ${b.alchemy} 炉` : '<span class="muted">尚无炼丹房</span>'}</span></div>
        <div class="stat"><span>筑基丹方</span><span>${s.family.recipes.zhuji ? `已得（稀有灵药 + 40 灵石 → 筑基丹）<label><input type="checkbox" data-chg="set" data-k="craftZhuji" ${set.craftZhuji ? 'checked' : ''}> 优先炼制</label>` : '<span class="muted">未得，可在坊市碰运气</span>'}</span></div>
        <div class="stat"><span>聚气丹分配</span><span><label><input type="checkbox" data-chg="set" data-k="usePills" ${set.usePills ? 'checked' : ''}> 按家规自动分给闭关/历练者</label> 保留 <input type="number" min="0" style="width:5em" data-chg="setNum" data-k="pillReserve" value="${set.pillReserve}"> 颗</span></div>
        <div class="stat"><span>疗伤丹</span><span><label><input type="checkbox" data-chg="set" data-k="useHeal" ${set.useHeal ? 'checked' : ''}> 重伤者自动服用（恢复加倍）</label></span></div>
      </div>
      <div class="card"><h3>坊市（本回合货架）</h3><table class="resp"><thead><tr><th>货物</th><th>存量</th><th>单价</th><th></th></tr></thead><tbody>${offers}</tbody></table>
        <div class="row" style="margin-top:.6em">出售：${sellable.map((k) => `<button data-act="sellAsk" data-k="${k}">${CF.items[k]}（${n0(res[k])}，单价 ${FX.Econ.sellPrice(s, k)}）</button>`).join('') || '<span class="muted">无可售库存</span>'}</div></div>`;
  }

  /* ---------- 纪事 ---------- */
  const CHRON_TYPES = [['', '全部'], ['breakthrough', '突破'], ['death', '死亡'], ['marriage', '婚嫁'], ['event', '事件'], ['succession', '继承'], ['rule', '家规'], ['building', '建设'], ['resource', '经济'], ['leave', '离族'], ['agent', 'AI 家主']];
  function pageChron() {
    const s = UI.s, C2 = UI.chron;
    const es = s.history.filter((e) => (C2.type ? e.type === C2.type : e.severity >= 2)).slice(-400).reverse();
    const byTurn = {};
    for (const e of es) (byTurn[e.turn] = byTurn[e.turn] || []).push(e);
    const turns = Object.keys(byTurn).map(Number).sort((a, b) => b - a);
    return `<div class="row between"><h1>年代纪事</h1><button data-act="history">《${esc(s.family.surname)}氏家史》（简版）</button></div>
      <div class="row">${CHRON_TYPES.map(([k, l]) => `<button class="${C2.type === k ? 'primary' : ''}" data-act="chronType" data-k="${k}">${l}</button>`).join('')}</div>
      <p class="muted">“全部”只列重要度 ≥ 2 的条目；点击条目展开前因与后果。</p>
      ${turns.map((t) => `<div class="card"><h3>第 ${t} 回合</h3>${chronTurn(t, `<div class="log">${byTurn[t].map((e) => {
        const open = C2.open === e.id;
        const causes = open ? FX.H.causeChain(s, e.id, 3) : [];
        const cons = open ? FX.H.consequences(s, e.id) : [];
        return `<p class="clickable" data-act="chronOpen" data-id="${e.id}"><span class="y">${e.year}年</span>${'★'.repeat(Math.max(0, e.severity - 2))}${esc(FX.H.text(e))}${e.firstOf ? ' <span class="tag t-warn">第一次</span>' : ''}</p>
          ${open ? `<div class="opt"><div class="meta">前因：${causes.length ? causes.map((c) => `${c.year}年 ${esc(FX.H.text(c))}`).join(' ← ') : '无记录'}</div><div class="meta">后果：${cons.length ? cons.map((c) => `${c.year}年 ${esc(FX.H.text(c))}`).join('；') : '暂无'}</div><div class="meta">涉及：${e.actors.map(pl).join('、') || '—'}</div></div>` : ''}`;
      }).join('')}</div>`)}</div>`).join('') || '<p class="muted">尚无记录</p>'}`;
  }
  // 只在“全部”视图、且回合已结束时提供整回合润色（按回合批量调一次）
  function chronTurn(t, html) {
    const s = UI.s;
    if (UI.chron.type || (t >= s.turn && !s.ended)) return html;
    return aiBlock(AI.turnKey(s, t), html, { kind: 'turn', arg: t, label: 'AI 润色此回合' });
  }

  /* ---------- AI 家主托管 ---------- */
  function pageAgent() {
    const s = UI.s;
    if (s.ended) return '';
    const rd = AI.ready();
    const recent = Agent.log.slice(-8).reverse().map((x) => `<p class="${x.ok ? '' : 'muted'}"><span class="y">${x.year}年</span>${esc(x.text)}</p>`).join('');
    let ctl;
    if (Agent.running) ctl = `<div class="row"><b class="warn">${esc(Agent.status)}</b><button class="danger" data-act="agentStop" ${Agent.stopRequested ? 'disabled' : ''}>${Agent.stopRequested ? '本步结束后停下…' : '停止托管'}</button></div>`;
    else if (!rd.ok) ctl = `<p class="muted">需要先开启 AI 功能（${esc(rd.reason)}）。<button class="link" data-act="page" data-p="rules">去设置</button></p>`;
    else ctl = `<div class="row"><button class="primary" data-act="agentRun" data-n="1" ${s.pending.length ? 'title="会先替你决断待决事件"' : ''}>托管 1 回合</button><button data-act="agentRun" data-n="5">托管 5 回合</button>${Agent.status ? `<span class="muted">${esc(Agent.status)}</span>` : ''}</div>`;
    return `<div class="card ${Agent.running ? 'hl' : ''}"><h3>AI 家主托管</h3>${ctl}
      <p class="muted">AI 只能从规则此刻允许的操作里挑（差事、建设、买卖、突破、请求、继承人、家规、事件选项），成败仍由规则结算。每一步的理由都记进纪事（筛选“AI 家主”）。模型出错或回复看不懂时托管暂停，局面不动。每回合约调用 1–3 次。</p>
      ${recent ? `<div class="log">${recent}</div>` : ''}</div>`;
  }

  /* ---------- 军师（只在玩家点击时调用）---------- */
  function pageAdvisor() {
    const s = UI.s;
    if (s.ended) return '';
    const rd = AI.ready();
    const key = AI.adviceKey(s);
    const text = AI.get(key);
    let body;
    if (text) body = `<div class="ai-text">${esc(text).split('\n').filter(Boolean).map((x) => `<p>${x}</p>`).join('')}</div><div class="ai-bar"><span class="tag ai-tag">AI 建议</span><span class="muted">仅供参考：成败仍由规则结算，军师看不到未来。</span></div>`;
    else if (AI.isPending(key)) body = '<p class="muted">军师正在思量…（不影响你继续操作）</p>';
    else if (!rd.ok) body = `<p class="muted">军师需要开启 AI 功能（${esc(rd.reason)}）。<button class="link" data-act="page" data-p="rules">去设置</button></p>`;
    else body = (AI.failure(key) ? `<p class="muted">军师未能进言：${esc(AI.failure(key))}</p>` : '<p class="muted">把当前状态摘要（不含存档）发给模型，换几条文字建议。</p>') + '<button data-act="aiPolish" data-kind="advice">请军师进言</button>';
    return `<div class="card"><h3>军师进言</h3>${body}</div>`;
  }

  /* ---------- 家史（简版，只读）---------- */
  function historyTemplate(h) {
    return h.chapters.map((c) => `<h3>${esc(c.title)}</h3><div class="log">${c.nodes.length ? c.nodes.map((n) => `<p><span class="y">${n.year}年</span>${esc(n.text)}</p>`).join('') : '<p class="muted">无记载</p>'}</div>`).join('');
  }
  function historyPolished(text) {
    return esc(text).split('\n').filter(Boolean).map((x) => { const m = /^【(.+?)】\s*(.*)$/.exec(x); return m ? `<h3>${m[1]}</h3>${m[2] ? `<p>${m[2]}</p>` : ''}` : `<p>${x}</p>`; }).join('');
  }

  /* ---------- 族谱（简版）---------- */
  function pageTree() {
    const s = UI.s;
    const gens = {};
    for (const p of Object.values(s.people)) if (p.origin === 'native') (gens[p.generation] = gens[p.generation] || []).push(p);
    return `<h1>族谱</h1>${unfinished('交互树状族谱（缩放、折叠、婚姻连线）属于阶段 2。当前为按世代分组的列表。')}
      ${Object.keys(gens).sort((a, b) => a - b).map((g) => `<div class="card"><h3>第 ${+g + 1} 代</h3>${gens[g].sort((a, b) => a.birthYear - b.birthYear).map((p) => `<div class="stat ${p.status !== 'alive' ? 'muted' : ''}"><span>${pl(p.id)} <span class="tag" style="border-color:${p.branch === 'main' ? 'var(--accent)' : 'var(--good)'}">${BR[p.branch]}</span>${s.family.headList.some((h) => h.id === p.id) ? '<span class="tag t-warn">历任家主</span>' : ''}${p.status === 'dead' ? ' 已故' : p.status === 'left' ? ' 离族' + (p.marriedOutTo ? '（外嫁' + esc(p.marriedOutTo) + '）' : '') : ''}</span>
        <span class="muted">${p.spouseId || p.formerSpouseIds.length ? '配偶 ' + [p.spouseId].concat(p.formerSpouseIds).filter(Boolean).map(pl).join('、') : ''} ${p.fatherId ? '· 父 ' + pl(p.fatherId) : ''}</span></div>`).join('')}</div>`).join('')}`;
  }

  /* ---------- 势力 ---------- */
  function pageFac() {
    const s = UI.s;
    return `<h1>势力外交</h1>${unfinished('势力的独立年度演化、联姻/贸易/赠礼/求援/依附/威慑/扩张等外交行为、危机与自动战斗属于阶段 3。当前关系值会被事件改变，但势力本身尚不行动。')}
      <div class="grid">${Object.values(s.factions).map((f) => `<div class="card"><h3>${f.name}</h3>
        <div class="stat"><span>实力等级</span><b>${f.tier}</b></div>
        <div class="stat"><span>与本族关系</span><b class="${f.relToPlayer < 0 ? 'bad' : 'good'}">${f.relToPlayer}</b></div>
        <div class="stat"><span>核心修士</span><span>${f.core.map((c) => `${esc(c.name)}（${CF.realms.names[c.major]}${CF.realms.stageNames[c.major][c.stage - 1]}，${c.age} 岁）`).join('、')}</span></div>
        <div class="stat"><span>恩怨</span><span>${f.grudges.map((g) => esc(g.what)).join('、') || '无'}</span></div></div>`).join('')}</div>`;
  }

  /* ---------- 家规与设置 ---------- */
  function pageRules() {
    const s = UI.s;
    const cats = [['succession', '继承制度'], ['allocation', '资源分配'], ['foreign', '对外政策']];
    return `<h1>家规与设置</h1>
      <div class="card"><h3>家规</h3><p class="muted">修改：家主威望 -8，受不利影响的分支支持度 -5 到 -10，并做阻力判定；同类家规冷却 4 个回合；新家规下回合起生效，首回合只发挥一半。</p>
      ${cats.map(([k, l]) => { const cd = FX.Family.ruleCooldownLeft(s, k); const cur = s.family.rules[k]; const eff = FX.Family.effectiveRule(s, k); return `<div class="opt"><div class="row between"><b>${l}：${CF.rules[k][cur].name}</b><span class="muted">${cd ? '冷却还剩 ' + cd + ' 回合' : '可修改'}${eff !== cur ? '（过渡期，本回合仍按「' + CF.rules[k][eff].name + '」）' : ''}</span></div>
        ${Object.keys(CF.rules[k]).map((o) => `<div class="stat"><span>${CF.rules[k][o].name} <span class="muted">${esc(CF.rules[k][o].desc)}</span></span>${o === cur ? '<span class="tag t-good">现行</span>' : `<button data-act="rule" data-c="${k}" data-o="${o}" ${cd || s.ended ? 'disabled' : ''}>改为此规</button>`}</div>`).join('')}</div>`; }).join('')}
      </div>
      <div class="card"><h3>存档</h3><p class="muted">存储：${storeLabel()}。每次操作后自动存档。</p><button data-act="openSaves">存档管理 / 导入导出</button></div>
      ${aiSettings()}
      <div class="card"><h3>显示</h3><div class="row">字号 <button data-act="font" data-d="-1">A−</button><button data-act="font" data-d="1">A＋</button><span class="muted">当前 ${Math.round(UI.fontScale * 100)}%</span></div></div>
      <div class="card"><h3>未完成功能（阶段 1）</h3><ul class="muted">
        <li>阶段 2：交互族谱树、完整关系网络（亲密/恩怨已有简版）、分支积怨的事件化、联姻外交。</li>
        <li>阶段 3：外部势力独立演化、七种外交行为、锋芒触发的外部事件、危机部署与自动战斗结算、护族大阵与藏经阁效果、执行外交任务差事。</li>
        <li>阶段 4：其余基础事件（目前 30 个中已做 14 个及其后续节点）、13 条事件链的完整后续、完整家史与导出（当前为按章节摘录的简版）。</li>
        <li>AI 润色：润色文本只存在当前页面，刷新或读档后需重新生成；家史与军师建议暂不支持导出。</li>
        <li>阶段 5：视觉打磨、平衡校准（第 18 章指标）、完整 README 与最终验收。</li>
      </ul></div>`;
  }

  function aiSettings() {
    const c = AI.config();
    const rd = AI.ready();
    return `<div class="card"><h3>AI 功能（DeepSeek，可选）：润色与家主托管</h3>
      <p class="muted">规则算结果，大模型只写文字：它只改写纪事、家史、事件描述和军师建议的文字，不决定任何结果，输出不进存档、不影响状态哈希。关闭或失败时一律显示原模板文字，游戏全程可离线玩。</p>
      <p class="muted">「AI 家主托管」在宗祠里：开启后可让 AI 替你当家若干回合，它只能从规则允许的操作里挑，每步理由记进纪事。</p>
      <p class="warn">开启后，回合纪事、家史摘录、事件描述、家族状态摘要和当下可选操作会发往下方的接口地址（默认 DeepSeek 官方接口）。不发送完整存档。</p>
      <div class="stat"><label for="in-aion">开启 AI 功能</label><input type="checkbox" id="in-aion" data-chg="aiEnabled" ${c.enabled ? 'checked' : ''}></div>
      <div class="stat"><label for="in-aikey">DeepSeek key</label><span class="row"><input type="password" id="in-aikey" autocomplete="off" spellcheck="false" placeholder="${AI.hasKey() ? '已保存（不回显）' : 'sk-…'}" style="width:14em"><button data-act="aiKey">保存 key</button>${AI.hasKey() ? '<button class="danger" data-act="aiKeyClear">清除 key</button>' : ''}</span></div>
      <div class="stat"><label for="in-aimodel">模型</label><span><input type="text" id="in-aimodel" list="ai-models" value="${esc(c.model)}" style="width:12em"><datalist id="ai-models">${AI.models.map((m) => `<option value="${m}">`).join('')}</datalist></span></div>
      <div class="stat"><label for="in-aiurl">接口地址</label><input type="text" id="in-aiurl" value="${esc(c.endpoint)}" style="width:22em;max-width:100%"></div>
      <div class="stat"><label for="in-ailimit">每日调用上限</label><input type="number" id="in-ailimit" min="1" value="${c.dailyLimit}" style="width:6em"></div>
      <div class="row" style="margin-top:.5em"><button data-act="aiSave">保存设置</button><button data-act="aiTest" ${rd.ok ? '' : 'disabled'}>测试连接</button><button class="link" data-act="aiReset">恢复默认地址与模型</button></div>
      <p class="muted">状态：${rd.ok ? '可用' : '不调用（' + esc(rd.reason) + '）'} · 最近一次：${esc(AI.statusText())} · 今日已调用 ${AI.usedToday()} / ${c.dailyLimit} 次</p>
      <p class="muted">key 只存在本浏览器的 localStorage，只发往上面的接口地址；不写进存档、不随导出、不打日志。浏览器直连 DeepSeek 可能被跨域（CORS）拦截，测试连接报“网络错误”时，可把接口地址换成你自己的中转。</p>
    </div>`;
  }

  /* ---------- 模态 ---------- */
  function renderModals() {
    if (!UI.modals.length) return '';
    const m = UI.modals[UI.modals.length - 1];
    const body = MODALS[m.type](m);
    return `<div class="modal-bg" data-act="${m.blocking ? '' : 'bgClose'}"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(m.title || '')}">${body}</div></div>`;
  }
  const MODALS = {
    event(m) {
      const s = UI.s;
      if (!s.pending.length) { setTimeout(popModal, 0); return ''; }
      m.blocking = true;
      const v = FX.Ev.view(s, s.pending[0]);
      const linkNames = (t) => { let x = esc(t); for (const id of v.people) { const p = s.people[id]; if (p) x = x.split(esc(p.name)).join(pl(id)); } return x; };
      const evKey = AI.eventKey(s, s.pending[0]);
      return `<h2>${esc(v.name)} <span class="tag">${esc(v.category)}</span>${v.chain ? ` <span class="tag t-warn">事件链 ${v.chain}</span>` : ''}</h2>
        ${aiBlock(evKey, `<p>${linkNames(v.text)}</p>`, { kind: 'event', label: '换个说法（AI）', html: (t) => `<p>${linkNames(t)}</p>` })}${v.causes.length ? `<p class="muted">起因：${v.causes.map(esc).join('；')}</p>` : ''}
        ${v.options.map((o, i) => `<div class="opt ${o.available ? '' : 'disabled'}"><div class="row between"><b>${i + 1}. ${esc(o.label)}${o.irreversible ? ' <span class="tag t-bad">不可逆</span>' : ''}</b>
          <button class="${o.available ? 'primary' : ''}" data-act="choose" data-i="${v.id}" data-o="${o.id}" data-irr="${o.irreversible ? 1 : ''}" ${o.available ? '' : 'disabled'} ${i === 0 ? 'autofocus' : ''}>选择</button></div>
          <div class="meta">成本：<b>${esc(o.cost)}</b></div><div class="meta">风险：<b>${esc(o.risk)}</b></div>${o.outcome ? `<div class="meta">可能结果：<b>${esc(o.outcome)}</b></div>` : ''}${o.available ? '' : `<div class="meta bad">不可选：${esc(o.reason)}</div>`}</div>`).join('')}
        <p class="muted">可用数字键 1–${v.options.length} 选择。${s.pending.length > 1 ? `还有 ${s.pending.length - 1} 件待决。` : ''}</p>`;
    },
    person(m) {
      const s = UI.s, v = Game.view.person(s, m.id);
      if (!v) return '';
      const p = v.p;
      const bt = Game.breakthroughPreview(s, p.id);
      return `<div class="row between"><h2>${esc(p.name)}</h2><button data-act="close" aria-label="关闭">✕</button></div>
        <p>${p.sex === 'M' ? '男' : '女'} · ${v.age} 岁 · ${BR[p.branch]} · ${ORIGIN_P[p.origin]} · <b>${esc(v.status)}</b>${p.id === s.family.headId ? ' · 家主' : ''}</p>
        <div class="grid"><div>
          <div class="stat"><span>灵根</span><b>${CF.roots.names[p.root.type]}${p.root.mutant ? '（' + p.root.mutant + '：' + CF.roots.mutantTraits[p.root.mutant] + '）' : ''} ${p.root.elements.join('')}</b></div>
          <div class="stat"><span>资质</span><b>${p.aptitude}</b></div>
          <div class="stat"><span>境界</span><b>${esc(v.realm)}${p.realm.major ? ` <span class="muted">${n0(p.progress)}/${v.need === Infinity ? '—' : v.need}</span>` : ''}</b></div>
          <div class="stat"><span>寿元</span><b>${p.status === 'alive' ? v.left + ' / ' + (p.lifespanMax + p.lifespanBonus) : '—'}</b></div>
          <div class="stat"><span>${trace('修炼速度', v.speed.factors.map((f) => f.label + ' ×' + f.value).join('；'))}</span><b>${v.speed.total}/年</b></div>
          <div class="stat"><span>战力</span><b>${v.power}</b></div>
        </div><div>
          <div class="stat"><span>${trace('忠诚', '基线 ' + v.loyaltyBase + '（宗祠、孝顺、家主威望、分支支持度、家规、恩怨），每年向基线靠拢 2 点')}</span><b>${p.loyalty}</b></div>
          <div class="stat"><span>野心</span><b>${p.ambition}</b></div>
          <div class="stat"><span>个人威望</span><b>${n0(p.prestige)}</b></div>
          <div class="stat"><span>私财 / 贡献</span><b>${n0(p.wealth)} / ${n0(p.contribution)}</b></div>
          <div class="stat"><span>性格倾向</span><span>${p.traits.map((t) => `<span class="tag" title="${esc(CF.traits.desc[t])}">${t}</span>`).join('')}</span></div>
          <div class="stat"><span>亲缘</span><span>${p.fatherId ? '父 ' + pl(p.fatherId) + ' ' : ''}${p.motherId ? '母 ' + pl(p.motherId) + ' ' : ''}${p.spouseId ? '配偶 ' + pl(p.spouseId) : ''}</span></div>
        </div></div>
        ${p.childIds.length ? `<p>子女：${p.childIds.map(pl).join('、')}</p>` : ''}
        ${p.traits.map((t) => `<p class="muted" style="margin:.1em 0">· ${t}：${esc(CF.traits.desc[t])}</p>`).join('')}
        ${v.relations.length ? `<p>关系：${v.relations.map((r) => `${pl(r.other)}<span class="${r.type === 'feud' ? 'bad' : 'good'}">（${r.type === 'feud' ? '恩怨' : '亲近'} ${r.strength}${r.tags.length ? '，' + esc(r.tags.join('/')) : ''}）</span>`).join('、')}</p>` : ''}
        ${bt && bt.kind && bt.can.ok ? `<p><button data-act="tryBreak" data-id="${p.id}">冲击${esc(bt.target)}（${bt.chance}%）</button></p>` : ''}
        ${p.status === 'alive' && s.family.resources.yanshou > 0 && p.yanshouTaken < 3 ? `<p><button data-act="yanshou" data-id="${p.id}">服用延寿丹（+${CF.yanshouYears[p.yanshouTaken]} 年）</button></p>` : ''}
        <h3>生平</h3><p>${esc(v.life)}</p>
        <h3>人生记录</h3><div class="log">${v.history.slice().reverse().map((e) => `<p><span class="y">${e.year}年</span>${esc(e.text)}</p>`).join('') || '<p class="muted">无</p>'}</div>`;
    },
    report(m) {
      const s = UI.s, r = s.lastReport;
      if (!r) return '';
      const keys = ['stone', 'grain', 'herb', 'ore', 'qiju', 'zhuji'];
      return `<h2>第 ${r.fromYear}–${r.toYear} 年摘要</h2>
        <p>${keys.filter((k) => r.delta[k]).map((k) => `${CF.items[k]} <b class="${r.delta[k] >= 0 ? 'good' : 'bad'}">${sign(r.delta[k])}</b>`).join('，') || '资源无变化'}；人口 ${r.population[0]} → ${r.population[1]}</p>
        ${r.entries.length ? aiBlock(AI.turnKey(s, r.turn), `<div class="log">${r.entries.map((id) => { const e = FX.H.get(s, id); return e ? `<p><span class="y">${e.year}年</span>${esc(FX.H.text(e))}</p>` : ''; }).join('')}</div>`, { kind: 'turn', arg: r.turn }) : '<p class="muted">五年无大事。</p>'}
        <div class="row"><button class="primary" data-act="close" autofocus>知道了</button></div>`;
    },
    history() {
      const s = UI.s, h = FX.H.familyHistory(s);
      return `<div class="row between"><h2>《${esc(h.title)}》</h2><button data-act="close" aria-label="关闭">✕</button></div>
        <p class="muted">依据族中真实记录按章摘录（简版）。</p>
        ${aiBlock(AI.historyKey(s), historyTemplate(h), { kind: 'history', label: 'AI 润色全文', html: historyPolished })}
        ${unfinished('完整家史（人物列传、评语）与导出属于阶段 4。')}
        <div class="row"><button data-act="close">关闭</button></div>`;
    },
    confirm(m) {
      return `<h2>${esc(m.title)}</h2><p>${esc(m.text)}</p><div class="row"><button class="danger" data-act="confirmYes" autofocus>确定</button><button data-act="close">取消</button></div>`;
    },
    heir() {
      const s = UI.s;
      const ranked = FX.Family.rankCandidates(s, s.family.headId).filter((x) => x.p.id !== s.family.headId);
      return `<div class="row between"><h2>指定继承人</h2><button data-act="close">✕</button></div>
        <p class="muted">现行继承制度：${CF.rules.succession[s.family.rules.succession].name}。指定不等于全族接受，接受度由家规匹配度和分支支持度共同决定。</p>
        ${ranked.slice(0, 10).map((x) => { const a = FX.Family.acceptance(s, x.p.id, s.family.headId); return `<div class="stat"><span>${pl(x.p.id)}（${BR[x.p.branch]}，${esc(P.realmName(x.p))}，${P.age(s, x.p)} 岁）${trace('评分 ' + x.score, x.parts.map((y) => y.label + ' ' + y.value).join('；'))} · 接受度 <b class="${a.level === 'high' ? 'good' : a.level === 'low' ? 'bad' : 'warn'}">${a.value}</b></span><button data-act="setHeir" data-id="${x.p.id}" ${s.family.heirId === x.p.id ? 'disabled' : ''}>立为继承人</button></div>`; }).join('') || '<p class="bad">无合格候选人（需成年、在世、本家血脉）</p>'}`;
    },
    saves(m) {
      const sl = m.slots || {};
      return `<div class="row between"><h2>存档管理</h2><button data-act="close">✕</button></div>
        <p class="muted">存储：${storeLabel()}</p>
        ${['auto', 'slot1', 'slot2', 'slot3'].map((k) => { const meta = sl[k]; return `<div class="stat"><span><b>${k === 'auto' ? '自动存档' : '槽位 ' + k.slice(4)}</b> ${meta ? `<span class="muted">${esc(meta.surname)}氏 · ${esc(meta.originName)} · 第 ${meta.year} 年 · ${meta.population} 人 · ${esc(meta.ratingPreview)}${meta.savedAt ? ' · ' + new Date(meta.savedAt).toLocaleString('zh-CN') : ''}</span>` : '<span class="muted">空</span>'}</span>
          <span class="row">${k !== 'auto' && UI.s ? `<button data-act="saveSlot" data-k="${k}">保存</button>` : ''}${meta ? `<button data-act="loadSlot" data-k="${k}">读取</button>` : ''}${meta && k !== 'auto' ? `<button class="danger" data-act="delSlot" data-k="${k}">删除</button>` : ''}</span></div>`; }).join('')}
        <h3>导出</h3><div class="row"><button data-act="exportFile" ${UI.s ? '' : 'disabled'}>下载 .json 文件</button><button data-act="exportText" ${UI.s ? '' : 'disabled'}>复制为文本</button></div>
        <h3>导入</h3><div class="row"><input type="file" accept=".json,.txt,application/json" id="in-file"><button data-act="importFile">从文件导入</button></div>
        <textarea id="in-text" placeholder="粘贴以 FXZ1: / FXB1: 开头的存档文本，或 JSON"></textarea><div class="row"><button data-act="importText">从文本导入</button></div>
        ${m.exported ? `<h3>存档文本</h3><p class="muted">${m.copied ? '已复制到剪贴板。' : '浏览器不允许自动复制，请手动全选复制：'}</p><textarea readonly>${esc(m.exported)}</textarea>` : ''}`;
    },
    sell(m) {
      const s = UI.s, k = m.k;
      return `<h2>出售${CF.items[k]}</h2><p>库存 ${n0(s.family.resources[k])}，单价 ${FX.Econ.sellPrice(s, k)} 灵石（坊市收购价为市价七成）。</p>
        <div class="row"><input type="number" id="in-sell" min="1" max="${Math.floor(s.family.resources[k])}" value="${Math.floor(s.family.resources[k] / 2) || 1}" style="width:8em"><button class="primary" data-act="sell" data-k="${k}">出售</button><button data-act="close">取消</button></div>`;
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
    page(d) { UI.page = d.p; UI.more = false; render(); const m = $('#main'); if (m) m.scrollTop = 0; G.scrollTo && G.scrollTo(0, 0); },
    more() { UI.more = !UI.more; render(); },
    pickOrigin(d) { UI.start.origin = d.k; render(); },
    newGame() {
      UI.start.surname = ($('#in-surname') || {}).value || '';
      UI.start.seed = ($('#in-seed') || {}).value || '';
      const seed = UI.start.seed || String(Date.now() % 1e9) + '-' + Math.floor(Math.random() * 1e6);
      UI.s = Game.newGame({ origin: UI.start.origin, surname: UI.start.surname, seed });
      UI.page = 'hall';
      afterAction();
      toast(`${UI.s.family.surname}氏开宗立族（种子 ${seed}）`, 3500);
      openPendingIfAny();
    },
    async continue() { const t = await loadAuto(); if (t) readSave(t); },
    newRun() { UI.s = null; UI.modals = []; render(); },
    advance() {
      const r = Game.advance(UI.s);
      if (!r.ok) return toast('✗ ' + r.error);
      afterAction();
      if (r.interrupted) { toast(`第 ${r.year} 年发生大事，推进暂停`); openPendingIfAny(); }
      else if (r.ended) toast('本局结束：' + UI.s.ended.what, 4000);
      else { openPendingIfAny(); pushModal({ type: 'report', title: '回合摘要' }); }
      autoPolish();
    },
    openEvent() { openPendingIfAny(); },
    history() {
      pushModal({ type: 'history', title: '家史' });
      if (UI.s.ended && AI.ready().ok && !AI.failure(AI.historyKey(UI.s))) AI.polishHistory(UI.s); // 结局家史自动润色一次
    },
    aiRaw(d) { if (UI.aiRaw.has(d.k)) UI.aiRaw.delete(d.k); else UI.aiRaw.add(d.k); render(); },
    aiPolish(d) {
      const s = UI.s;
      const k = d.kind;
      const key = k === 'turn' ? AI.turnKey(s, Number(d.t)) : k === 'history' ? AI.historyKey(s) : k === 'advice' ? AI.adviceKey(s) : s.pending[0] ? AI.eventKey(s, s.pending[0]) : null;
      if (!key) return;
      AI.failed.delete(key); // 玩家主动重试
      if (k === 'turn') AI.polishTurn(s, Number(d.t));
      else if (k === 'history') AI.polishHistory(s);
      else if (k === 'advice') AI.advise(s);
      else AI.polishEvent(s, s.pending[0]);
      UI.aiRaw.delete(key);
      render();
    },
    aiKey() {
      const el = $('#in-aikey');
      const v = el ? el.value.trim() : '';
      if (el) el.value = '';
      if (!v) return toast('请先粘贴 key');
      toast(AI.setKey(v) ? 'key 已保存在本浏览器' : '✗ 浏览器不允许本地存储，无法保存 key');
      render();
    },
    async agentRun(d) {
      if (Agent.running) return;
      UI.modals = UI.modals.filter((m) => m.type !== 'event');
      const r = await Agent.run(UI.s, Number(d.n) || 1, { afterTurn: () => { scheduleSave(); autoPolish(); } });
      scheduleSave();
      toast(Agent.status, 4000);
      render();
      if (!r.ok) openPendingIfAny();
    },
    agentStop() { Agent.stop(); render(); },
    aiKeyClear() { AI.setKey(''); toast('key 已清除'); render(); },
    aiSave() {
      const c = AI.saveConfig({ model: ($('#in-aimodel') || {}).value, endpoint: ($('#in-aiurl') || {}).value, dailyLimit: ($('#in-ailimit') || {}).value });
      toast(AI.validEndpoint(c.endpoint) ? '设置已保存' : '已保存，但接口地址无效（需 https），不会调用', 3500);
      render();
    },
    aiReset() { AI.saveConfig({ model: AI.defaults.model, endpoint: AI.defaults.endpoint }); toast('已恢复默认：' + AI.defaults.model); render(); },
    async aiTest() {
      toast('正在测试连接…');
      const r = await AI.testConnection();
      toast(r.ok ? '连接成功' : '连接失败：' + r.reason, 4500);
      render();
    },
    choose(d) {
      const go = () => {
        const r = Game.resolveEvent(UI.s, d.i, d.o);
        if (!r.ok) return toast('✗ ' + r.error);
        toast(r.result || '已处置', 3200);
        UI.modals = UI.modals.filter((m) => m.type !== 'event' && m.type !== 'confirm');
        afterAction();
        if (UI.s.pending.length) openPendingIfAny();
        else if (UI.s.phase === 'advancing' && !UI.s.ended) toast('可点“继续推进”完成本回合剩余年份', 3000);
      };
      if (d.irr) pushModal({ type: 'confirm', title: '不可逆的决定', text: '此选项无法撤回，确定吗？', yes: go });
      else go();
    },
    confirmYes() { const m = UI.modals[UI.modals.length - 1]; UI.modals.pop(); m.yes(); render(); },
    close() { popModal(); },
    bgClose(d, el, ev) { if (ev.target === el) popModal(); },
    person(d) { pushModal({ type: 'person', id: d.id, title: '人物' }); },
    trace(d) { pushModal({ type: 'trace', text: d.t, title: '成因' }); },
    sort(d) { const R = UI.roster; if (R.sort === d.k) R.dir *= -1; else { R.sort = d.k; R.dir = -1; } render(); },
    suggest(d) { result(Game.applySuggestions(UI.s, d.all === '1'), '已按建议安排'); },
    keepDuty(d) { result(Game.confirmDuty(UI.s, d.id)); },
    batch() {
      const s = UI.s, c = UI.cult.batchCond;
      const ids = P.adults(s).filter((p) => c === 'attention' ? FX.Sim.needsAttention(s).includes(p) : c === 'none' ? !p.duty.type : c === 'mortal' ? !(P.hasRoot(p) && p.realm.major > 0) : c === 'lowapt' ? P.hasRoot(p) && p.realm.major > 0 && p.aptitude < 45 : c.startsWith('d:') ? p.duty.type === c.slice(2) : false).map((p) => p.id);
      if (!ids.length) return toast('没有符合条件的族人');
      const r = Game.batchSetDuty(s, ids, UI.cult.batchDuty);
      toast(`已改派 ${r.done} 人${r.failed.length ? '；' + r.failed.length + ' 人不适用：' + r.failed.slice(0, 3).join('，') : ''}`, 4000);
      afterAction();
    },
    tryBreak(d) {
      const s = UI.s, p = s.people[d.id], b = Game.breakthroughPreview(s, d.id);
      pushModal({ type: 'confirm', title: `${p.name}冲击${b.target}`, text: `成功率 ${b.chance}%${b.kind !== 'minor' ? `；失败将跌落修为并重伤，身死概率 ${b.death}%` : ''}${b.kind === 'zhuji' && s.family.resources.zhuji ? '；将消耗筑基丹 1 颗' : ''}。`, yes: () => {
        const r = Game.attemptBreakthrough(s, d.id);
        if (!r.ok) return toast('✗ ' + r.error);
        toast(r.success ? `${p.name}破关成功，成就${r.target}！` : `${p.name}冲击${r.target}失败${r.died ? '，身死道消' : ''}`, 4000);
        afterAction();
        openPendingIfAny();
      } });
    },
    yanshou(d) { const r = Game.useYanshou(UI.s, d.id); if (r.ok) toast(r.text); afterAction(); },
    upgrade(d) { result(Game.upgrade(UI.s, d.k), CF.buildings[d.k].name + '升级完成'); },
    buy(d) { const r = Game.buy(UI.s, d.k, Number(d.q)); result(r, r.ok ? `购入${CF.items[d.k]}×${d.q}，花费 ${r.cost}` : null); },
    sellAsk(d) { pushModal({ type: 'sell', k: d.k, title: '出售' }); },
    sell(d) { const q = Number(($('#in-sell') || {}).value || 0); const r = Game.sell(UI.s, d.k, q); if (r.ok) { popModal(); toast(`得灵石 ${r.gain}`); afterAction(); } else toast('✗ ' + r.error); },
    herb(d) { result(Game.setSetting(UI.s, 'herbPlots', UI.s.family.settings.herbPlots + Number(d.d))); },
    toggleSet(d) { result(Game.setSetting(UI.s, d.k, !UI.s.family.settings[d.k])); },
    chronType(d) { UI.chron.type = d.k; render(); },
    chronOpen(d) { UI.chron.open = UI.chron.open === d.id ? null : d.id; render(); },
    req(d) { result(Game.answerRequest(UI.s, d.id, d.a === '1')); },
    heirPicker() { pushModal({ type: 'heir', title: '继承人' }); },
    setHeir(d) { const r = Game.designateHeir(UI.s, d.id); if (r.ok) { toast(`已立继承人，接受度 ${r.acceptance.value}`); popModal(); afterAction(); } else toast('✗ ' + r.error); },
    abdicate() { pushModal({ type: 'confirm', title: '家主退位', text: '家主退为太上长老，由继承人接任。确定吗？', yes: () => result(Game.abdicate(UI.s), '家主已退位') }); },
    rule(d) {
      const s = UI.s;
      pushModal({ type: 'confirm', title: '修改家规', text: `改为「${CF.rules[d.c][d.o].name}」：家主威望 -8，可能遭到分支阻力；${CF.rules.cooldownTurns} 个回合内不能再改；下回合起生效（首回合一半）。阻力判定通过率约 ${Math.round(FX.Family.resistChance(s, FX.Family.ruleAdverse(s, d.c, d.o)) * 100)}%。`, yes: () => { const r = Game.changeRule(s, d.c, d.o); result(r, r.ok ? '家规已改：' + r.note : null); } });
    },
    seal() { pushModal({ type: 'confirm', title: '封存族史', text: '结束本局并生成评级。此操作不可撤回。', yes: () => { Game.seal(UI.s); afterAction(); } }); },
    font(d) { UI.fontScale = Math.max(0.85, Math.min(1.4, UI.fontScale + Number(d.d) * 0.1)); applyFont(); render(); },
    async openSaves() { const m = { type: 'saves', title: '存档' }; pushModal(m); refreshSlots(m); },
    async saveSlot(d) {
      const doIt = async () => { const r = await FX.Store.put(d.k, Game.save.serialize(UI.s, Date.now())); toast(r.ok ? '已保存' : '✗ ' + r.error); const m = UI.modals.find((x) => x.type === 'saves'); if (m) refreshSlots(m); };
      const m = UI.modals.find((x) => x.type === 'saves');
      if (m && m.slots && m.slots[d.k]) pushModal({ type: 'confirm', title: '覆盖存档', text: '此槽位已有存档，确定覆盖吗？', yes: doIt });
      else doIt();
    },
    async loadSlot(d) { const t = d.k === 'auto' ? await loadAuto() : await FX.Store.get(d.k); if (t) readSave(t); },
    async delSlot(d) { pushModal({ type: 'confirm', title: '删除存档', text: '删除后无法恢复。', yes: async () => { await FX.Store.del(d.k); const m = UI.modals.find((x) => x.type === 'saves'); if (m) refreshSlots(m); } }); },
    exportFile() {
      const ok = FX.Store.download(`${UI.s.family.surname}氏-第${UI.s.year}年.json`, Game.save.serialize(UI.s, Date.now()));
      toast(ok ? '已开始下载' : '浏览器禁止下载，请改用“复制为文本”');
    },
    async exportText() {
      const t = await FX.Store.encodeText(Game.save.serialize(UI.s, Date.now()));
      const copied = await FX.Store.copy(t);
      const m = UI.modals.find((x) => x.type === 'saves');
      if (m) { m.exported = t; m.copied = copied; render(); }
      toast(copied ? '存档文本已复制' : '请手动复制下方文本');
    },
    async importFile() {
      const f = ($('#in-file') || {}).files;
      if (!f || !f[0]) return toast('请先选择文件');
      try { const t = await FX.Store.decodeText(await f[0].text()); readSave(t); } catch (e) { toast('导入失败：' + e.message, 5000); }
    },
    async importText() {
      const v = ($('#in-text') || {}).value;
      if (!v) return toast('请先粘贴存档文本');
      try { const t = await FX.Store.decodeText(v); readSave(t); } catch (e) { toast('导入失败：' + e.message, 5000); }
    },
  };
  const CHG = {
    duty(d, el) { result(Game.setDuty(UI.s, d.id, el.value)); },
    focus(d, el) {
      const cur = UI.s.family.focusIds.slice();
      const next = el.checked ? cur.concat(d.id) : cur.filter((x) => x !== d.id);
      result(Game.setFocus(UI.s, next));
    },
    showGone(d, el) { UI.roster.showGone = el.checked; render(); },
    batchCond(d, el) { UI.cult.batchCond = el.value; },
    batchDuty(d, el) { UI.cult.batchDuty = el.value; },
    set(d, el) { result(Game.setSetting(UI.s, d.k, el.checked)); },
    setNum(d, el) { result(Game.setSetting(UI.s, d.k, Math.max(0, Math.floor(Number(el.value) || 0)))); },
    aiEnabled(d, el) { AI.saveConfig({ enabled: el.checked }); toast(el.checked ? (AI.hasKey() ? 'AI 功能已开启' : 'AI 功能已开启，填写 key 后生效') : 'AI 功能已关闭，全部显示原文、不再托管'); render(); },
  };
  // 每回合结束后批量润色一次（不等待；无 key 或关闭时不发请求）
  function autoPolish() {
    const s = UI.s, r = s && s.lastReport;
    if (!r || !r.entries.length || !AI.ready().ok) return;
    const key = AI.turnKey(s, r.turn);
    if (!AI.failure(key)) AI.polishTurn(s, r.turn);
  }

  function applyFont() { document.documentElement.style.setProperty('--fs', Math.round(15 * UI.fontScale) + 'px'); try { localStorage.setItem('family-xiuxian:font', String(UI.fontScale)); } catch (e) { /* 忽略 */ } }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !el.dataset.act) return;
    const fn = ACT[el.dataset.act];
    if (fn) fn(el.dataset, el, ev);
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-chg]');
    if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el.dataset, el);
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.input === 'rq') {
      UI.roster.q = el.value; const pos = el.selectionStart; render();
      const n = $('#in-rq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
    }
  });
  document.addEventListener('keydown', (ev) => {
    const m = UI.modals[UI.modals.length - 1];
    if (!m) {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.dataset && ev.target.dataset.act === 'pickOrigin') { ev.preventDefault(); ACT.pickOrigin(ev.target.dataset); }
      return;
    }
    if (ev.key === 'Escape' && !m.blocking) { popModal(); return; }
    if (m.type === 'event' && /^[1-9]$/.test(ev.key)) {
      const btns = document.querySelectorAll('.modal [data-act="choose"]');
      const b = btns[Number(ev.key) - 1];
      if (b && !b.disabled) b.click();
    }
  });
  G.addEventListener('beforeunload', () => { if (UI.s) FX.Store.putSync('auto', Game.save.serialize(UI.s, Date.now())); });

  // 润色异步到达：有输入框聚焦时先不重绘，避免冲掉正在输入的内容
  Agent.onStep = () => { scheduleSave(); AI.onUpdate(); };
  AI.onUpdate = () => {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { UI.aiDirty = true; return; }
    render();
  };
  document.addEventListener('focusout', () => { if (UI.aiDirty) { UI.aiDirty = false; setTimeout(() => { const a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) render(); else UI.aiDirty = true; }, 0); } });

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
