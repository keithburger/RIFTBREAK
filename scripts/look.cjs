// Quick visual probe: node scripts/look.cjs [query] — screenshots menu + gameplay for inspection.
const { chromium } = require('playwright');
(async () => {
  const q = process.argv[2] || 'dev=1';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto('http://localhost:4173/?' + q);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/look-menu.png' });
  await page.evaluate(() => { window.__rift.start('vanguard', 'standard', 42); window.__rift.god(); window.__rift.autoLevel(14); window.__rift.speed(4); });
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__rift.speed(1));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/look-play.png' });
  const info = await page.evaluate(() => ({ r: window.__rift.game.renderer.kind, t: window.__rift.world.time, en: window.__rift.world.enemies.length, lvl: window.__rift.world.player.level, state: window.__rift.game.state }));
  console.log(JSON.stringify(info), errors.slice(0, 10));
  await browser.close();
})();
