// Contact sheet of the live atlas, grouped by key prefix: node scripts/atlas-sheet.cjs [prefix,prefix…]
// Needs `npm run preview`. Writes screenshots/atlas-<prefix>.png and prints a prefix → count table (the art audit).
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const want = (process.argv[2] || '').split(',').filter(Boolean);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:4173/?dev=1');
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30000 });
  const groups = await page.evaluate(() => {
    const a = window.__rift.game.atlas, g = {};
    for (const k of a.frames.keys()) { const p = k.split('_')[0] + '_'; (g[p] ??= []).push(k); }
    return Object.fromEntries(Object.entries(g).map(([p, ks]) => [p, ks.length]));
  });
  console.log(JSON.stringify(groups));
  for (const p of want) {
    const url = await page.evaluate((prefix) => {
      const a = window.__rift.game.atlas, keys = [...a.frames.keys()].filter((k) => k.startsWith(prefix));
      const cell = 96, cols = 12, rows = Math.ceil(keys.length / cols);
      const c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * cell;
      const x = c.getContext('2d'); x.fillStyle = '#0a0e17'; x.fillRect(0, 0, c.width, c.height);
      keys.forEach((k, i) => { const f = a.frames.get(k), s = Math.min(1, (cell - 8) / Math.max(f.w, f.h)); const w = f.w * s, h = f.h * s; x.drawImage(a.page, f.x, f.y, f.w, f.h, (i % cols) * cell + (cell - w) / 2, Math.floor(i / cols) * cell + (cell - h) / 2, w, h); });
      return c.toDataURL('image/png');
    }, p);
    fs.writeFileSync(`screenshots/atlas-${p.replace(/_/g, '')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
})();
