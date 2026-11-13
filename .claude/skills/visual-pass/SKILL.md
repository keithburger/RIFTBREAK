---
name: visual-pass
description: Review and improve RIFTBREAK visuals (sprites, VFX, readability, UI polish) using real browser screenshots. Use for art direction, effect, HUD or legibility work.
---
# Visual pass

## Capture
```bash
npm run build && (npm run preview > /dev/null 2>&1 &) ; sleep 2
node scripts/look.cjs                 # screenshots/look-menu.png, look-play.png
npm run e2e                           # full set: bosses, biomes, mobile, fallback renderer
```
Open the PNGs with the Read tool. For a specific scene, copy `scripts/look.cjs` and drive
`window.__rift` (`start`, `god`, `autoLevel`, `give`, `spawn`, `boss`, `biome`, `speed`).

The headless browser uses a software rasterizer, so automatic quality drops to 0 there. To capture
full effects, in the page run:
`__rift.game.save.data.settings.quality = 3; __rift.game.applySettings()`.

## Checklist (judge the screenshot, not the code)
1. The player is instantly findable; hostile bullets and telegraphs are the highest-contrast things on screen.
2. Friendly effects never use the hostile red; each element reads as its own colour.
3. Enemy silhouettes are distinguishable at gameplay scale; elites and bosses stand out.
4. Dense scenes: can you still trace threats? If not, lower alpha/size of friendly effects first (there are no glows to trim — remove shapes, not light).
5. Art follows `docs/ART_DIRECTION.md`: ≤ 3 flat colours per sprite, outline = lighter tint of the fill (no black/dark outline), no gradients/glows/texture, built from circles/arcs/curves/polygons/repeats; no bare circle or triangle. Judge at **1×** game scale.
6. HUD is small, legible and clear of the play area; text has contrast on every biome.
7. Mobile portrait and landscape: nothing clipped, buttons ≥ 44 px, cards fit the width.

## Where to change things
- Sprites: `render/atlas.ts` (projectiles, pickups, glyphs, backgrounds), `render/shapes.ts`
  (enemy/boss/player bodies, emblems), shared construction helpers in `render/geometry.ts`.
  Contact sheets for review: `node scripts/atlas-sheet.cjs e_,boss_,p_,k_,pl_`.
- Per-entity drawing and animation: `render/scene.ts`. Particles/rings/text: `render/effects.ts`.
- What the sim emits: `w.fx.burst/ring/line/slash/text/shake/flash` call sites in `src/sim`.
- UI: `ui/styles.css`, `ui/ui.ts`.

## Finish
Re-capture and compare before/after. Only describe something as improved if you looked at the new
screenshot. Keep quality gating (`fx.settings.quality`) on anything decorative.
