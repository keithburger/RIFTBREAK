// Contact sheets of the live atlas: node scripts/atlas-sheet.cjs [prefix,prefix…] [scale,scale…]
// Needs `npm run preview`. Writes screenshots/atlas-<prefix>-<scale>x.png and prints a prefix → count table.
// Sprites are drawn at true game scale (1 logical px = 1 css px) and at zoomed scales for inspection.
// Runtime-tinted groups (p_, b_, g_ …) are multiplied with a friendly cyan / hostile red like the game does.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const want = (process.argv[2] || '').split(',').filter(Boolean);
  const scales = (process.argv[3] || '1,3').split(',').map(Number);
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
  for (const p of want) for (const sc of scales) {
    const url = await page.evaluate(([prefix, scale]) => {
      const a = window.__rift.game.atlas, keys = [...a.frames.keys()].filter((k) => k.startsWith(prefix));
      const tint = prefix === 'b_' ? '#ff3355' : ['p_', 'g_', 'ring', 'beam', 'pool', 'soft', 'glow', 'disc', 'slash', 'swirl', 'spark', 'tri', 'dash'].some((t) => prefix.startsWith(t)) ? '#5fd4ff' : null;
      const maxW = Math.max(...keys.map((k) => a.frames.get(k).w / 2)), maxH = Math.max(...keys.map((k) => a.frames.get(k).h / 2));
      const cw = Math.ceil(maxW * scale) + 14, ch = Math.ceil(maxH * scale) + 14;
      const cols = Math.max(1, Math.floor(1260 / cw)), rows = Math.ceil(keys.length / cols);
      const c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
      const x = c.getContext('2d'); x.fillStyle = '#0b1210'; x.fillRect(0, 0, c.width, c.height);
      const tmp = document.createElement('canvas'), t = tmp.getContext('2d');
      keys.forEach((k, i) => {
        const f = a.frames.get(k), w = (f.w / 2) * scale, h = (f.h / 2) * scale;
        let src = a.page, sx = f.x, sy = f.y, sw = f.w, sh = f.h;
        if (tint) { tmp.width = f.w; tmp.height = f.h; t.clearRect(0, 0, f.w, f.h); t.globalCompositeOperation = 'source-over'; t.drawImage(a.page, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h); t.globalCompositeOperation = 'multiply'; t.fillStyle = tint; t.fillRect(0, 0, f.w, f.h); t.globalCompositeOperation = 'destination-in'; t.drawImage(a.page, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h); src = tmp; sx = 0; sy = 0; }
        x.imageSmoothingEnabled = true;
        x.drawImage(src, sx, sy, sw, sh, (i % cols) * cw + (cw - w) / 2, Math.floor(i / cols) * ch + (ch - h) / 2, w, h);
      });
      return c.toDataURL('image/png');
    }, [p, sc]);
    fs.writeFileSync(`screenshots/atlas-${p.replace(/_/g, '')}-${sc}x.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
})();
