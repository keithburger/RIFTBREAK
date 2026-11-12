---
name: add-feature
description: Add a new system or cross-cutting feature to RIFTBREAK (new game mode, encounter type, progression system, UI screen, input method, setting). Use when the request is not just new content.
---
# Add a feature

## 1. Place it
Decide which layer owns it before writing code (see the map in CLAUDE.md):

| Feature touches… | Goes in | Contract |
|---|---|---|
| Rules, entities, timing | `src/sim/` | headless, deterministic, uses `w.rng` |
| Definitions / scripts | `src/content/` | data + small functions calling sim helpers |
| How it looks | `src/render/` | read-only over `World`, sprites via `Renderer` |
| How it sounds | `src/audio/audio.ts` | triggered by `w.fx.sfx(name)` |
| Menus, HUD | `src/ui/` | through `UIHost` only |
| Persistence | `src/save/save.ts` | versioned + migration |
| Wiring, loop, lifecycle | `src/app/game.ts` | the only place layers meet |

If the sim must tell presentation something new, extend `FxSink` (`sim/fx.ts`) and implement it in
`render/effects.ts` and `NullFx`. If presentation needs to *read* something, expose a field on
`World` — never call into render from sim.

## 2. Common recipes
- **Game mode**: add a `ModeDef` in `content/modes.ts`. Existing knobs: `mods`, `enemyHp`,
  `enemySpd`, `spawnMul`, `xpMul`, `weaponSlots`, `biomeTime`, `startLevel`. New flow → a new
  `kind` handled in `sim/director.ts: updateDirector`.
- **Encounter**: add an `EncounterDef` in `content/encounters.ts` (`start`, `update → done`,
  `dur`, `weight`, `minTime`). It must end on its own and undo any global change it made.
- **Per-step system**: `updateX(w, dt)` in a new `sim/` module, called from `World.step()`.
- **Setting**: field in `Settings` (+ default, + migration if the shape changes), control in
  `ui.ts: showSettings`, applied in `game.ts: applySettings`.
- **UI screen/overlay**: method on `UI`; overlays opened mid-run go through the game state
  machine (`state: 'menu'|'run'|'pause'|'choice'|'end'`) and reset input.
- **Dev control**: add to `app/dev.ts` only.

## 3. Verify
```bash
npm run typecheck && npm run test:fast     # includes the architecture-boundary test
```
Add a focused test in `tests/` for new rules (build worlds with `tests/helpers.ts`). For anything
visible: `npm run build`, start `npm run preview`, run `npm run e2e`, then inspect screenshots —
extend `scripts/e2e.cjs` with a check for the new flow. Update `docs/ARCHITECTURE.md` if a boundary
or extension point changed and `docs/PROGRESS.md` with the new state.

Done when: the boundaries test passes, the feature has a test that would fail without it, and (if
visible) there is a screenshot you have actually looked at.
