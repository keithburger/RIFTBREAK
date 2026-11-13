---
paths:
  - "src/render/**"
---
# Rendering & VFX

- Everything on screen is a tinted atlas sprite drawn through `Renderer.sprite(layer, key, …)`.
  There is no per-backend drawing code outside `renderer.ts`; never call PixiJS or Canvas APIs from
  `scene.ts`/`effects.ts`.
- **Art style is defined by `docs/ART_DIRECTION.md` (Desmos-style flat geometry). Read it before
  touching any sprite.** Hard limits: 2–3 colours per sprite; outline = a lighter tint of the
  sprite's own fill (never black/dark); flat fills, crisp edges; no gradients, textures, noise,
  `shadowBlur`, soft sprites or stacked glows.
- Layers (`L`): `GROUND`, `GLOW` (additive; flat shapes only — no halos), `ENT`, `FX` (additive), `TOP`.
- New sprites: add a recipe in `atlas.ts` (runtime-tinted: two greys 0.66 fill / 1.0 outline via the
  `P()`/`flat` helpers; baked colours: `ink()`) or a body in `shapes.ts` using the `Kit` and the
  `render/geometry.ts` helpers (`plot`, `polar`, `rep`, `band`). Keep silhouettes distinct; do not
  add another plain circle or triangle.
- The scene is **read-only** with respect to `World`. Animation is derived from time and entity
  fields; visual-only state lives in `FxSystem`.
- Respect `fx.settings.quality` (0–3): decorative trails/particles/rings must be gated by it.
  Hostile telegraphs, bullets and the player are never reduced.
- Hostile = red/white high-contrast (`TELE` colour, bright bullet cores). Player effects use the
  weapon's element colour. Do not use red for friendly effects.
- Cull with `inView` before emitting sprites; effects check `fx.view`.
- After visual changes: build, `npm run e2e`, then open the relevant PNGs in `screenshots/`.
