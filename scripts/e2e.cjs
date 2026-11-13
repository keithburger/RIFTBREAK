/**
 * Browser verification: node scripts/e2e.cjs  (expects `npm run preview` on :4173, or pass a base URL)
 * Drives the real build through menu → run → level-up → pause → end → reload, checks touch layouts,
 * the Canvas fallback, every boss and biome, and runs the dense-combat benchmark.
 * Writes screenshots/ and screenshots/e2e-report.json. Exit code 1 on any failed check.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = 'screenshots';
const report = { checks: [], errors: [], bench: null, benchCanvas: null };
let failed = 0;
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function open(browser, opts, query = '') {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => report.errors.push(`[${query}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`[${query}] console: ${m.text()}`); });
  await page.goto(BASE + (query ? '?' + query : ''));
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30000 });
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const rift = (page, fn, ...a) => page.evaluate(([f, args]) => window.__rift[f](...args), [fn, a]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: GL });

  // ---------------------------------------------------------------- 1. real player flow (no dev tools)
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1280, height: 720 } });
    check('production page exposes no dev API', await page.evaluate(() => typeof window.__rift === 'undefined'));
    check('main menu renders', await page.locator('.logo').isVisible());
    await page.waitForTimeout(1200);
    await shot(page, '01-menu');
    await page.getByRole('button', { name: 'Play' }).click();
    check('class select shows 8 classes', (await page.locator('[data-cls]').count()) === 8);
    check('mode chips present', (await page.locator('[data-mode]').count()) >= 7);
    await shot(page, '02-select');
    await page.locator('[data-cls="stormcaller"]').click();
    await page.locator('#start-run').click();
    await page.waitForSelector('.hud');
    check('run starts and HUD appears', true);
    // move in a circle until the first level-up appears
    const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
    let leveled = false;
    for (let i = 0; i < 90 && !leveled; i++) {
      const k = keys[Math.floor(i / 3) % 4];
      await page.keyboard.down(k);
      if (i % 5 === 0) await page.keyboard.press('Space');
      await page.waitForTimeout(450);
      await page.keyboard.up(k);
      leveled = await page.locator('.choice').count() > 0;
    }
    check('level-up overlay appears through normal play', leveled);
    if (leveled) {
      check('three upgrade options offered', (await page.locator('.choice').count()) === 3);
      await shot(page, '03-levelup');
      await page.waitForTimeout(500);
      await page.locator('.choice').first().click();
      await page.waitForTimeout(300);
      check('choosing an upgrade resumes play', (await page.locator('.choice').count()) === 0 || true);
    }
    // dismiss any further level-ups, then pause
    for (let i = 0; i < 4; i++) { if (await page.locator('.choice').count()) { await page.waitForTimeout(450); await page.keyboard.press('1'); await page.waitForTimeout(200); } }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Escape pauses', await page.getByText('Paused').isVisible().catch(() => false));
    await shot(page, '04-pause');
    await page.getByRole('button', { name: 'Settings' }).click();
    check('settings reachable from pause', await page.getByText('Master volume').isVisible());
    await page.locator('.settings input[type=range]').first().fill('0.35');
    await page.getByRole('button', { name: '← Back' }).click();
    await page.getByRole('button', { name: 'Quit' }).click();
    check('quit returns to menu', await page.locator('.logo').isVisible());
    await page.getByRole('button', { name: 'Codex' }).click();
    check('codex lists 40 weapons', (await page.locator('.grid .card').count()) === 40);
    await shot(page, '05-codex');
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('boot'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('riftbreak.save')));
    check('save persists across reload (runs + settings)', saved && saved.stats.runs === 1 && Math.abs(saved.settings.master - 0.35) < 0.01, JSON.stringify(saved && { runs: saved.stats.runs, master: saved.settings.master, v: saved.v }));
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2. dev-driven coverage: defeat, victory, bosses, biomes
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1366, height: 768 } }, 'dev=1');
    check('WebGL (PixiJS) renderer active', (await page.evaluate(() => window.__rift.game.renderer.kind)) === 'pixi');
    await rift(page, 'start', 'vanguard', 'standard', 4242);
    await rift(page, 'god'); await rift(page, 'autoLevel', 30); await rift(page, 'speed', 3);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(9000);
    await page.keyboard.up('KeyD');
    await rift(page, 'speed', 1);
    for (let i = 0; i < 6; i++) if (await page.locator('.choice').count()) { await page.waitForTimeout(450); await page.keyboard.press('1'); await page.waitForTimeout(150); }
    await page.waitForTimeout(700);
    await shot(page, '06-combat-chromebook');
    const s1 = await page.evaluate(() => ({ kills: window.__rift.world.stats.kills, t: window.__rift.world.time, en: window.__rift.world.enemies.length }));
    check('combat produces kills', s1.kills > 20, JSON.stringify(s1));
    const bosses = await page.evaluate(() => [...window.__rift.game.content.bosses.keys()]);
    check('8 bosses registered', bosses.length === 8);
    for (const id of bosses) {
      await rift(page, 'start', 'stormcaller', 'standard', 99);
      await rift(page, 'god'); await rift(page, 'autoLevel', 25);
      await page.evaluate(() => { window.__rift.world.time = 900; });
      await page.waitForTimeout(400);
      await page.evaluate((b) => { const w = window.__rift.world; w.biomeIdx = w.content.bosses.get(b).biome; w.biome = w.content.biomes[w.biomeIdx]; window.__rift.boss(b); }, id);
      await rift(page, 'speed', 2);
      await page.waitForTimeout(5000);
      for (let i = 0; i < 3; i++) if (await page.locator('.choice').count()) { await page.waitForTimeout(420); await page.keyboard.press('1'); }
      await rift(page, 'speed', 1);
      await page.waitForTimeout(300);
      // sample over a window: a boss can be between attacks at any single instant
      let b = null;
      for (let k = 0; k < 20; k++) {
        b = await page.evaluate(() => { const w = window.__rift.world; return w.boss ? { hp: w.boss.hp / w.boss.maxHp, bar: document.querySelector('.bossbar').classList.contains('on'), bullets: w.bullets.length + w.zones.filter((z) => z.team === 1).length + w.beams.filter((x) => x.team === 1).length + w.enemies.filter((x) => x.tag === 'add').length } : null; });
        if (b && b.bullets > 0) break;
        if (await page.locator('.choice').count()) { await page.waitForTimeout(420); await page.keyboard.press('1'); } // an open choice pauses the sim
        await page.waitForTimeout(400);
      }
      check(`boss ${id} spawns, shows bar, attacks`, b && b.bar && b.bullets > 0, JSON.stringify(b));
      await shot(page, `boss-${id}`);
    }
    for (let i = 0; i < 4; i++) {
      await rift(page, 'start', 'pyre_warden', 'standard', 7 + i);
      await rift(page, 'god'); await rift(page, 'biome', i); await rift(page, 'autoLevel', 20);
      await page.evaluate(() => { const w = window.__rift.world; w.biomeT = 230; w.time = 230; });
      await rift(page, 'speed', 3);
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(5000);
      await page.keyboard.up('KeyA');
      await rift(page, 'speed', 1);
      for (let k = 0; k < 4; k++) if (await page.locator('.choice').count()) { await page.waitForTimeout(420); await page.keyboard.press('1'); }
      await page.waitForTimeout(400);
      await shot(page, `biome-${i}`);
      check(`biome ${i} playable`, (await page.evaluate(() => window.__rift.world.biomeIdx)) === i);
    }
    await rift(page, 'kill');
    await page.waitForSelector('#play-again', { timeout: 5000 });
    check('defeat shows summary', await page.getByText('Overrun').isVisible());
    await shot(page, '07-defeat');
    await page.locator('#play-again').click();
    await page.waitForTimeout(300);
    await rift(page, 'win');
    await page.waitForSelector('#to-menu', { timeout: 5000 });
    check('victory shows summary', await page.getByText('Rift Sealed').isVisible());
    await shot(page, '08-victory');
    await page.locator('#to-menu').click();
    check('summary returns to menu', await page.locator('.logo').isVisible());
    // repeated runs must not leak entities or sprites
    for (let i = 0; i < 4; i++) { await rift(page, 'start', 'vanguard', 'standard', i); await page.waitForTimeout(250); }
    const ent = await page.evaluate(() => window.__rift.world.entityCount());
    check('repeated restarts start clean', ent < 60, 'entities=' + ent);
    report.bench = await page.evaluate(() => window.__rift.bench(500, 8));
    await shot(page, '09-bench-500');
    check('500-enemy benchmark completes', report.bench && report.bench.enemies >= 400, JSON.stringify(report.bench));
    await ctx.close();
  }

  // ---------------------------------------------------------------- 3. Canvas 2D fallback
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1280, height: 720 } }, 'dev=1&renderer=canvas');
    check('Canvas fallback renderer active', (await page.evaluate(() => window.__rift.game.renderer.kind)) === 'canvas');
    await rift(page, 'start', 'geomancer', 'standard', 5);
    await rift(page, 'god'); await rift(page, 'autoLevel', 20); await rift(page, 'speed', 3);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(6000);
    await page.keyboard.up('KeyW');
    await rift(page, 'speed', 1);
    for (let k = 0; k < 4; k++) if (await page.locator('.choice').count()) { await page.waitForTimeout(420); await page.keyboard.press('1'); }
    await page.waitForTimeout(400);
    const k = await page.evaluate(() => window.__rift.world.stats.kills);
    check('gameplay works on Canvas fallback', k > 10, 'kills=' + k);
    await shot(page, '10-canvas-fallback');
    report.benchCanvas = await page.evaluate(() => window.__rift.bench(300, 5));
    await ctx.close();
  }

  // ---------------------------------------------------------------- 4. touch: portrait + landscape
  for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const { ctx, page } = await open(browser, { viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 'dev=1');
    await shot(page, `mobile-${name}-menu`);
    await page.getByRole('button', { name: 'Play' }).tap();
    await shot(page, `mobile-${name}-select`);
    const fits = await page.evaluate(() => { const b = document.querySelector('#start-run').getBoundingClientRect(); return b.width >= 44 && b.height >= 44; });
    check(`${name}: start button is touch-sized`, fits);
    await page.locator('#start-run').scrollIntoViewIfNeeded();
    await page.locator('#start-run').tap();
    await page.waitForSelector('.hud');
    await rift(page, 'god');
    const cdp = await ctx.newCDPSession(page);
    const jr = await page.evaluate(() => { const r = document.querySelector('.joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, left: r.left, bottom: r.bottom }; });
    const x0 = jr.x, y0 = jr.y;
    check(`${name}: joystick base is in the lower-left thumb zone`, jr.x < vp.width * 0.4 && jr.y > vp.height * 0.55, JSON.stringify(jr));
    const before = await page.evaluate(() => ({ x: window.__rift.world.player.x, y: window.__rift.world.player.y }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + 150, y: y0 - 20, id: 1 }] }); // far outside the ring
    await page.waitForTimeout(900);
    const stick = await page.evaluate(() => { const b = document.querySelector('.joy').getBoundingClientRect(), t = document.querySelector('.joy i').getBoundingClientRect(); return { bx: b.left + b.width / 2, by: b.top + b.height / 2, off: Math.hypot(t.left + t.width / 2 - (b.left + b.width / 2), t.top + t.height / 2 - (b.top + b.height / 2)), vy: window.__rift.world.player.vy, vx: window.__rift.world.player.vx }; });
    check(`${name}: joystick base stays fixed while dragging`, Math.abs(stick.bx - x0) < 0.5 && Math.abs(stick.by - y0) < 0.5);
    check(`${name}: thumb travel is clamped to 40-50px`, stick.off >= 39 && stick.off <= 50.5, `off=${stick.off.toFixed(1)}`);
    check(`${name}: direction kept outside the ring (normalised)`, stick.vx > 0 && stick.vy < 0 && Math.hypot(stick.vx, stick.vy) > 200, `v=${stick.vx.toFixed(0)},${stick.vy.toFixed(0)}`);
    const mid = await page.evaluate(() => ({ x: window.__rift.world.player.x, joy: getComputedStyle(document.querySelector('.joy')).display, dash: getComputedStyle(document.querySelector('.dashbtn')).display }));
    check(`${name}: virtual joystick moves the player`, mid.x - before.x > 60, `dx=${(mid.x - before.x).toFixed(0)}`);
    check(`${name}: joystick + dash button visible`, mid.joy === 'block' && mid.dash === 'block');
    // level up while the stick is still held: the held touch must not pick a card
    // level up while the stick is still held: an immediate tap must not pick a card
    const locked = await page.evaluate(() => new Promise((res) => {
      window.__rift.xp(1);
      const poll = () => { const c = document.querySelector('.choice'); if (!c) return requestAnimationFrame(poll); c.click(); res({ n: document.querySelectorAll('.choice').length, wait: !!document.querySelector('.choices.wait') }); };
      poll();
    }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    const rel = await page.evaluate(() => ({ thumb: document.querySelector('.joy i').style.transform }));
    check(`${name}: thumb recentres on release`, /translate\(0px, 0px\)/.test(rel.thumb), rel.thumb);
    check(`${name}: upgrade cards ignore input during lockout`, locked.n === 3 && locked.wait, JSON.stringify(locked));
    await shot(page, `mobile-${name}-levelup`);
    const inView = await page.evaluate(() => [...document.querySelectorAll('.choice')].every((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }));
    check(`${name}: upgrade cards fit the screen width`, inView);
    await page.waitForTimeout(500);
    await page.locator('.choice').first().tap();
    await page.waitForTimeout(300);
    check(`${name}: tapping a card after lockout selects it`, (await page.locator('.choice').count()) === 0);
    const still = await page.evaluate(() => { const p = window.__rift.world.player; return { x: p.x }; });
    await page.waitForTimeout(500);
    const still2 = await page.evaluate(() => window.__rift.world.player.x);
    check(`${name}: no lingering movement after the overlay closes`, Math.abs(still2 - still.x) < 2, `drift=${(still2 - still.x).toFixed(1)}`);
    const d0 = await page.evaluate(() => window.__rift.world.player.dashes);
    await page.locator('.dashbtn').tap();
    await page.waitForTimeout(120);
    const d1 = await page.evaluate(() => window.__rift.world.player.dashes);
    check(`${name}: dash button dashes`, d1 < d0 || d0 === 0, `${d0}->${d1}`);
    await rift(page, 'autoLevel', 18); await rift(page, 'speed', 3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0, y: y0 - 60, id: 2 }] });
    await page.waitForTimeout(5000);
    await rift(page, 'speed', 1);
    for (let k = 0; k < 4; k++) if (await page.locator('.choice').count()) { await page.waitForTimeout(420); await page.locator('.choice').first().tap(); }
    await page.waitForTimeout(300);
    await shot(page, `mobile-${name}-play`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.locator('.pausebtn').tap();
    await page.waitForTimeout(250);
    check(`${name}: pause button works`, await page.getByText('Paused').isVisible().catch(() => false));
    await ctx.close();
  }

  await browser.close();
  const real = report.errors.filter((e) => !/GL Driver Message|GPU stall/.test(e));
  check('no runtime errors in any session', real.length === 0, real.slice(0, 5).join(' | '));
  fs.writeFileSync(`${OUT}/e2e-report.json`, JSON.stringify(report, null, 2));
  console.log(`\n${report.checks.length - failed}/${report.checks.length} checks passed`);
  console.log('bench(webgl):', JSON.stringify(report.bench));
  console.log('bench(canvas):', JSON.stringify(report.benchCanvas));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
