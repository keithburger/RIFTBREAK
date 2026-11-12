---
name: add-boss
description: Add or rework a RIFTBREAK boss encounter (phases, attack scripts, visuals, tests). Use for any boss creation or boss mechanic change.
---
# Add a boss

## Context to load
- One existing script as a template: `src/content/bosses/cinder_colossus.ts` (simple) or
  `arachnoid_siege_engine.ts` (procedural parts, signature attack).
- Helper signatures: `grep -n "^export function\|^export const" src/sim/boss.ts`.
- `BossDef`, `BossAttack`, `BossCtl` in `src/sim/types.ts`.

## Procedure
1. Design: one-sentence identity, a signature mechanic no other boss has, 3 phases
   (`phases: [0.66, 0.33]`), ≥5 distinct attacks, and at least one attack that only appears in the
   final phase. Attack names should be unique across bosses.
2. Create `src/content/bosses/<id>.ts` exporting a `BossDef`:
   - Each attack is `{ name, dur, run(w, e, c, dt) }`; use `at(c.at, dt, t)` / `every(c.at, dt, n)`
     from `core/math` for timing and `c.d.*` for numeric scratch state.
   - Build attacks from `ringShot`, `fanShot`, `tele`, `hazard`, `laser`, `summon`, `moveTo`,
     `arenaPoint`, `spawnBullet/spawnZone/spawnBeam`. Everything that damages needs a telegraph.
   - `update()` handles movement/passive mechanics; set `c.d.hold = 1` during stationary casts and
     clear it in `onPhase`.
   - `attacks[phase]` is the rotation for that phase (`attacks.length === phases.length + 1`).
3. Register: add to `BOSS_DEFS` in `src/content/registry.ts` and to a biome's `bosses` pair in
   `src/content/biomes.ts` (each biome holds exactly two; replacing one removes it from play).
4. Visuals: add a body in `render/shapes.ts: BOSS_BODIES[<id>]` and an animated case in
   `render/scene.ts: drawBoss` (limbs, orbiting parts, charge glows). Use `c.legs`/`c.segs`/`c.d`
   for sim-owned parts; keep purely decorative motion in the draw code.
5. Feedback (intro, phase change, death sequence, rewards) comes from the framework in
   `sim/boss.ts`. Add `w.fx.banner` + `w.fx.sfx` for the signature attack.

## Verify
```bash
npm run validate
npx vitest run tests/bosses.test.ts -t "<Boss Name>"   # every attack acts; all phases; death + rewards; telegraphs
npm run balance -- 8                                    # read bossDur: target 40–100 s for typical builds
npm run build && (npm run preview > /dev/null 2>&1 &) ; sleep 2 ; npm run e2e
```
Then open `screenshots/boss-<id>.png`.

Done when: the generated boss tests pass, boss duration is in range, and the screenshot shows a
readable silhouette with clearly telegraphed attacks.
