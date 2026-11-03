// 无头跑局：随机/贪心机器人打很多局，检查没有报错、能走完 8 层
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const runs = +(process.argv[2] || 30);
  const res = await page.evaluate(async (runs) => {
    const J = window.__jl; J.FAST = true;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = { floors: [], wins: 0, turnsMax: 0 };
    for (let r = 0; r < runs; r++) {
      J.newRun();
      let guard = 0;
      while (guard++ < 600) {
        const S = J.S;
        if (S.dead) break;
        if (S.pendingReward) { J.chooseReward(S.pendingReward[Math.floor(Math.random()*S.pendingReward.length)]); continue; }
        if (document.querySelector('#ov.show') && document.querySelector('h1') && /借力打力/.test(document.querySelector('#ov').textContent)) { out.wins++; break; }
        // 贪心：先试一招，再随机走
        const p = J.P();
        const skills = S.skills.slice().sort(() => Math.random() - .5);
        for (const s of skills) { const ts = J.targets(s); if (ts.length && Math.random() < .8) { await J.useSkill(s, ts[Math.floor(Math.random()*ts.length)]); break; } }
        while (J.busy) await sleep(0);
        if (J.S.dead || J.S.pendingReward) continue;
        const pp = J.P();
        if (pp) { const rc = J.reachable(pp.x, pp.y, J.moveRange(), true); const [x, y] = rc[Math.floor(Math.random()*rc.length)]; if (x!==pp.x||y!==pp.y) J.doMove(x, y); }
        await J.endTurn();
        while (J.busy) await sleep(0);
        await sleep(0);
      }
      out.floors.push(J.S.floor);
      out.turnsMax = Math.max(out.turnsMax, J.S.stats.turns);
    }
    return out;
  }, runs);
  const hist = {}; res.floors.forEach(f => hist[f] = (hist[f]||0)+1);
  console.log('局数', runs, '最远层分布', JSON.stringify(hist), '通关', res.wins, '最长回合', res.turnsMax);
  console.log('报错', errors.length ? errors.slice(0,5) : '无');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
