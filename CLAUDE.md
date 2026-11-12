# RIFTBREAK

Single-player, top-down, survivor-style action roguelite for the browser. Weapons fire automatically;
the player moves, dashes and drafts upgrades into a screen-dominating build across four biomes and
their bosses (~22–25 min standard run). Static site, no backend, no runtime CDN.

Stack: TypeScript (strict) · PixiJS 8 (WebGL) with a Canvas 2D fallback · Vite · Vitest · Playwright.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Type check | `npm run typecheck` |
| Validate content registries | `npm run validate` (≈1 s) |
| Fast tests (≈10 s) | `npm run test:fast` |
| All tests incl. full-length runs (≈60 s) | `npm test` |
| One test file | `npx vitest run tests/bosses.test.ts` |
| Regenerate `content-manifest.json` | `npm run manifest` (after `npm test`) |
| Balance simulations | `npm run balance -- 16 standard all` |
| Headless sim benchmark | `npm run bench -- 500 20` |
| Production build → `dist/` | `npm run build` |
| Browser verification | `npm run preview &` then `npm run e2e` |
| Everything | `npm run verify` |

Dev tools in the browser: append `?dev` to the URL → `window.__rift` (spawn, boss, xp, biome, god,
speed, bench…). `?renderer=canvas` forces the fallback renderer.

## Architecture map (`src/`)

```
core/     math, seeded Rng, spatial Grid, ops DSL            (imports nothing else)
sim/      deterministic simulation — World, combat, weapons, enemy AI, bosses, director, upgrades
content/  data definitions + boss/relic/encounter scripts; registry.ts assembles & validates
render/   procedural atlas, PixiJS + Canvas renderers, effects, scene drawing
audio/ input/ save/   synthesized audio · keyboard/touch/gamepad · versioned save + migrations
ui/       DOM menus, HUD, overlays (talks to the app only via UIHost)
app/      game.ts wires everything and owns the loop; dev.ts = test controls (only with ?dev)
```

Allowed imports are enforced by `tests/architecture.test.ts`:
`core ← sim ← content`, `render` reads `sim`, `ui` reads `sim/render/save`, only `app` sees all.

## Invariants (do not break)

1. **`sim/`, `content/`, `core/` are headless and deterministic.** No DOM, `window`, storage,
   timers, `Date.now` or `Math.random` — all randomness goes through `w.rng`. The sim never imports
   `content/`; it receives a `ContentDB` when a `World` is constructed.
2. **Presentation is one-way.** The sim reports events through the narrow `FxSink` (`w.fx.*`) and
   never reads anything back. Rendering/UI/audio never mutate the world.
3. **Fixed timestep.** `World.step()` advances exactly 1/60 s. Never use frame time in gameplay.
4. **Content is data + small strategies.** New weapons/enemies/relics/biomes/encounters are new
   definitions in `src/content/`; a new *mechanic* is a new registered behavior
   (`registerKind`, `MOVES`, `ATTACKS`, `HAZARDS`, boss attack objects). Never add per-content
   `if (id === …)` branches to engine code.
5. **Every hostile attack is telegraphed** (≥0.5 s beams, ≥0.55 s blasts; hazards ≥1.1 s).
6. **All damage to enemies goes through `damageEnemy`/`hitEnemy`**; all damage to the player through
   `hurtPlayer`. Reaction damage must stay flagged `F_NOREACT` (chain safeguard).
7. **Balance numbers live in data** (`content/*`, `director.ts: difficulty()`, `stats.ts`), not in
   scattered literals.
8. **Level-up options are always permanent for the run.** No consumables in the upgrade pool.
9. **Save schema changes need a migration** in `save/save.ts` (bump `SAVE_VERSION`, add to
   `MIGRATIONS`, extend `tests/save.test.ts`).
10. Dev/test controls stay behind `?dev` (dynamic import); never expose them in normal play.

## Content conventions

- Stable snake_case `id`s; never rename a shipped id (saves and the manifest reference them).
- Tuning uses the ops DSL (`core/ops.ts`): `"dmg*1.25"`, `"count+1"`, `"zone.r=40"`, `"x.flag=1"`.
- Weapons: 4 rank-ups + exactly 2 evolutions (each `needs` a passive id). An evolution must change
  mechanics, not only `dmg`/`cd` (a test enforces this). Every base weapon belongs to one fusion.
- Enemies: `move` + optional `atk` + `traits`; signatures must be unique within a biome.
- After any content change: `npm run validate`, the relevant test file, then `npm run manifest`.

## Verification expectations

- Never claim something works without running it. Sim/content change → `npm run test:fast`.
  Pacing/balance change → `npm run balance` and `npm test`. Anything visual or UI → build, run
  `npm run e2e`, and **look at the screenshots** in `screenshots/`.
- Performance claims require numbers from `npm run bench` (sim) or `__rift.bench()` (browser).
- Update `docs/PROGRESS.md` at milestones; keep it a state snapshot, not a diary.

## Navigating efficiently

- Start from the map above; grep for an id or behavior name before opening files.
- Content lives in few, dense files — read only the block you need (grep the id for its line).
- `src/sim/types.ts` is the single source of truth for every data shape.
- Don't read `dist/`, `node_modules/`, `screenshots/`, `content-manifest.json` (generated).

## More detail

`docs/ARCHITECTURE.md` · `docs/GAME_DESIGN.md` · `docs/CONTENT_GUIDE.md` · `docs/TESTING.md` ·
`docs/PROGRESS.md` · scoped rules in `.claude/rules/` · workflows in `.claude/skills/`
(`/add-weapon`, `/add-enemy`, `/add-boss`, `/add-biome`, `/add-relic`, `/add-feature`, `/balance`,
`/visual-pass`, `/verify`).
