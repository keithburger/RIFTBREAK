// Visual probe: node scripts/look.cjs — full-quality screenshots of the menu, mid-run and late-run combat.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:4173/?dev=1');
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/look-menu.png' });
  const scene = async (name, cls, levels, time, biome, secs) => {
    await page.evaluate(([c, l, t, b]) => {
      const r = window.__rift; r.start(c, 'standard', 4242); r.god();
      r.game.save.data.settings.quality = 3; r.game.applySettings();
      r.biome(b); r.autoLevel(l);
      const w = r.world; w.time = t; w.biomeT = 240; w.mode = { ...w.mode, xpMul: 0 }; r.speed(4);
    }, [cls, levels, time, biome]);
    const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
    for (let i = 0; i < secs; i++) { await page.keyboard.down(keys[i % 4]); await page.waitForTimeout(1000); await page.keyboard.up(keys[i % 4]); }
    await page.evaluate((b) => { const r = window.__rift; r.speed(1); const ids = [...r.world.content.enemies.values()].filter((d) => d.biome === b).map((d) => d.id); for (let i = 0; i < 160; i++) r.spawn(ids[i % ids.length], 1, 0); }, biome);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(2600);
    await page.keyboard.up('KeyD');
    await page.screenshot({ path: `screenshots/look-${name}.png` });
    console.log(name, JSON.stringify(await page.evaluate(() => ({ en: window.__rift.world.enemies.length, sprites: window.__rift.game.renderer.spriteCount, kills: window.__rift.world.stats.kills }))));
  };
  await scene('mid', 'stormcaller', 22, 420, 1, 4);
  await scene('late', 'pyre_warden', 55, 1100, 3, 4);
  console.log(errors);
  await browser.close();
})();
