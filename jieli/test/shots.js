const { chromium, devices } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const out = process.argv[2] || '/tmp/claude-0';
  await page.screenshot({ path: out + '/s1-title.png' });
  await page.click('#bNew'); await page.waitForTimeout(600);
  await page.screenshot({ path: out + '/s2-game.png' });
  // 点一个敌人看信息
  const pos = await page.evaluate(() => { const e = window.__jl.enemies()[0]; return [e.x, e.y]; });
  const box = await page.locator('#cv').boundingBox();
  await page.mouse.click(box.x + (pos[0] + .5) * box.width / 7, box.y + (pos[1] + .5) * box.height / 7);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/s3-info.png' });
  await page.click('#endBtn'); await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '/s4-after.png' });
  // 跳到第 8 层看铁佛
  await page.evaluate(() => { const J = window.__jl; J.FAST = true; J.S.floor = 7; J.S.skills.push('shuai','bo'); J.S.pas.zhen = true; J.chooseReward({type:'heal'}); J.FAST = false; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '/s5-boss.png' });
  await page.click('#menuBtn'); await page.click('#mHelp'); await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/s6-help.png' });
  console.log('errors', errors);
  await browser.close();
})();
