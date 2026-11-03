// 一步前瞻机器人：枚举 走位×招式，模拟敌人出手，挑最好的。用来确认能打通、看难度。
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const runs = +(process.argv[2] || 10);
  const res = await page.evaluate(async (runs) => {
    const J = window.__jl; J.FAST = true;
    const out = { floors: [], wins: 0, turns: [], hpAtEnd: [] };
    async function evalPlan(mv, sk, ti, order) {
      const S0 = JSON.stringify(J.S); J.SIM = true;
      const k0 = J.S.stats.kills;
      const doMv = () => { if (mv) { const p = J.P(); if (p) J.doMove(mv[0], mv[1]); } };
      if (order === 0) doMv();
      if (sk) { const ts = J.targets(sk); const t = ts[ti]; if (t) await J.useSkill(sk, t); else { J.S = JSON.parse(S0); J.SIM = false; return -1e9; } }
      if (order === 1) { const p = J.P(); if (p && mv && J.reachable(p.x, p.y, J.moveRange(), true).some(([a,b])=>a===mv[0]&&b===mv[1])) J.doMove(mv[0], mv[1]); }
      let score;
      if (J.S.dead) score = -1e6;
      else if (J.floorCleared()) score = 1e5 + (J.P() ? J.P().hp*100 : 0);
      else {
        for (const u of J.enemies().filter(u => u.armed)) { if (J.S.dead) break; await J.doIntent(u); }
        const p = J.P();
        score = (J.S.dead ? -1e6 : 0) + (J.S.stats.kills - k0) * 40 + (p ? p.hp * 60 : 0) + (J.floorCleared() ? 1e4 : 0);
        // 敌人残血
        for (const e of J.enemies()) score -= e.hp * 3;
      }
      J.S = JSON.parse(S0); J.SIM = false;
      return score;
    }
    for (let r = 0; r < runs; r++) {
      await new Promise(r=>setTimeout(r,5)); J.newRun();
      let guard = 0, won = false;
      while (guard++ < 800) {
        await new Promise(r=>setTimeout(r,1));
        const S = J.S;
        if (S.dead) break;
        if (S.pendingReward) { const o = S.pendingReward; const pr = o.find(x=>x.type==='heal' && J.P().hp<=2) || o.find(x=>x.type==='sk') || o[0]; J.chooseReward(pr); continue; }
        if (/借力打力/.test(document.querySelector('#ov').textContent)) { won = true; break; }
        const p = J.P();
        const moves = [null, ...J.reachable(p.x, p.y, J.moveRange(), true).filter(([x,y])=>x!==p.x||y!==p.y)];
        let best = { s: -Infinity };
        const acts = [[null, 0]];
        for (const sk of S.skills) J.targets(sk).forEach((_, i) => acts.push([sk, i]));
        for (const mv of moves) for (const [sk, ti] of acts) for (const order of (sk && mv ? [0,1] : [0])) {
          // act-first plans need targets computed before move; ti indexes current targets anyway
          const s = await evalPlan(mv, sk, ti, order) + Math.random();
          if (s > best.s) best = { s, mv, sk, ti, order };
        }
        if (best.order === 0 && best.mv) J.doMove(best.mv[0], best.mv[1]);
        if (best.sk) { const t = J.targets(best.sk)[best.ti]; if (t) await J.useSkill(best.sk, t); }
        await new Promise(r=>setTimeout(r,0));
        if (best.order === 1 && best.mv && J.P()) J.doMove(best.mv[0], best.mv[1]);
        if (J.S.dead || J.S.pendingReward) continue;
        if (/借力打力/.test(document.querySelector('#ov').textContent)) { won = true; break; }
        if (document.querySelector('#ov.show')) continue;
        window.__hist=(window.__hist||[]); if(J.S.floor===1) window.__hist.push({t:J.S.turn,hp:J.P()&&J.P().hp,best:best.s,sk:best.sk,mv:best.mv,dang:J.enemies().filter(u=>u.armed).length}); const hp0=J.P().hp; await J.endTurn(); if(J.P()&&J.P().hp<hp0) window.__hist.push('HIT '+(hp0-J.P().hp));
      }
      if (won) out.wins++;
      if (guard>=800) out.stuck = (out.stuck||[]).concat([{f:J.S.floor,t:J.S.turn,busy:J.busy,ov:document.querySelector('#ov').textContent.slice(0,40),en:J.enemies().length,k:J.S.floorKills,g:J.S.goal,m:J.S.markers.length,boss:J.S.bossDead}]);
      if (J.S.dead && J.S.stats.turns<12) out.h=(out.h||[]).concat([window.__hist]); window.__hist=[]; if (J.S.dead && J.S.stats.turns<12) out.early=(out.early||[]).concat([window.__last]);
      out.floors.push(J.S.floor); out.turns.push(J.S.stats.turns);
    }
    return out;
  }, runs);
  const hist = {}; res.floors.forEach(f => hist[f] = (hist[f]||0)+1);
  console.log('局数', runs, '最远层', JSON.stringify(hist), '通关', res.wins, '回合', res.turns.join(','));
  console.log(JSON.stringify(res.stuck)); console.log(JSON.stringify(res.h)); if(res.early) require('fs').writeFileSync('/tmp/claude-0/early.json', JSON.stringify(res.early));
  console.log('报错', errors.length ? errors.slice(0,5) : '无');
  await browser.close();
})();
