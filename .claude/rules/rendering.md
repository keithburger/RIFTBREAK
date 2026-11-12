---
paths:
  - "src/render/**"
---
# Rendering & VFX

- Everything on screen is a tinted atlas sprite drawn through `Renderer.sprite(layer, key, …)`.
  There is no per-backend drawing code outside `renderer.ts`; never call PixiJS or Canvas APIs from
  `scene.ts`/`effects.ts`.
- Layers (`L`): `GROUND`, `GLOW` (additive), `ENT`, `FX` (additive), `TOP`.
- New sprites: add a recipe in `atlas.ts` (white if tinted at runtime, baked colours otherwise) or
  a body in `shapes.ts` using the `Kit` (keyline → gradient body → rim → emissive core). Keep
  silhouettes distinct; do not add another plain circle or triangle.
- The scene is **read-only** with respect to `World`. Animation is derived from time and entity
  fields; visual-only state lives in `FxSystem`.
- Respect `fx.settings.quality` (0–3): decorative glows/trails/particles must be gated by it.
  Hostile telegraphs, bullets and the player are never reduced.
- Hostile = red/white high-contrast (`TELE` colour, bright bullet cores). Player effects use the
  weapon's element colour. Do not use red for friendly effects.
- Cull with `inView` before emitting sprites; effects check `fx.view`.
- After visual changes: build, `npm run e2e`, then open the relevant PNGs in `screenshots/`.
