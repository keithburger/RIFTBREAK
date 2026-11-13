// Art-rule audit (docs/ART_DIRECTION.md §1): counts the dominant colours of every baked sprite.
// node scripts/art-audit.cjs   (needs `npm run preview`). A "dominant" colour covers >= 2.5% of opaque pixels;
// antialiasing blends between fill and outline are far below that. Rule: <= 3. Also checks outline lightness.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto('http://localhost:4173/?dev=1');
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30000 });
  const res = await page.evaluate(() => {
    const a = window.__rift.game.atlas, ctx = a.page.getContext('2d');
    const out = { checked: 0, over: [], hist: {} };
    for (const [k, f] of a.frames) {
      if (!/^(e_|boss_|pl_|k_|i_|r_|d_)/.test(k)) continue;
      const d = ctx.getImageData(f.x, f.y, f.w, f.h).data, m = new Map(), W = f.w;
      let flat = 0;
      const px = (x, y) => (y * W + x) * 4;
      // flat pixel = opaque and identical to its right and lower neighbour (antialiased blends never are)
      for (let y = 0; y < f.h - 1; y++) for (let x = 0; x < W - 1; x++) {
        const i = px(x, y), r = px(x + 1, y), dn = px(x, y + 1);
        if (d[i + 3] < 250) continue;
        if (d[i] !== d[r] || d[i + 1] !== d[r + 1] || d[i + 2] !== d[r + 2] || d[i] !== d[dn] || d[i + 1] !== d[dn + 1] || d[i + 2] !== d[dn + 2]) continue;
        flat++; const q = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; m.set(q, (m.get(q) || 0) + 1);
      }
      const dom = [...m.values()].filter((n) => n / Math.max(1, flat) >= 0.02).length;
      out.checked++; out.hist[dom] = (out.hist[dom] || 0) + 1;
      if (dom > 3) out.over.push(k + ':' + dom);
    }
    return out;
  });
  console.log(JSON.stringify(res));
  await browser.close();
  process.exit(res.over.length ? 1 : 0);
})();
