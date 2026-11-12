---
name: add-enemy
description: Add a new RIFTBREAK enemy archetype or a new enemy movement/attack behavior. Use when asked to add, change or rebalance an enemy type.
---
# Add an enemy

## Context to load
- `src/content/enemies.ts` — read the header and 2–3 rows of the target biome (`grep -n "Biome 2"`).
- `grep -n "^MOVES\.\|^ATTACKS\." src/sim/enemyAI.ts` for the behavior list and their param comments.
- `Traits` in `src/sim/types.ts`.

## Procedure
1. Decide what response it demands from the player that its biome-mates do not (dodge a telegraph,
   prioritise it, reposition, burst it…). If you cannot name one, redesign it.
2. Compose `move` + optional `atk` + `traits`. Its signature (`move/atk/traits`) must be unique in
   the biome — a test enforces this.
   - Moves: chase, flank, charge, kite, zigzag, formation, swoop, ambush, blink, burrow, orbit,
     leap, intercept, sentry, drift.
   - Attacks: shoot, spread, radial, mortar, beam, sweepbeam, mines, summon, buff, heal, shield,
     ward, trail, kamikaze, pull, field, slam, spiral, homing.
   - Traits: front, armor, splitInto/splitN, pool, burst, regen, enrage, phase, retaliate,
     splitHalf, drain, chill, stealth.
3. New behavior needed? Add `MOVES.name` / `ATTACKS.name` in `enemyAI.ts` with a `/** name(params) */`
   comment. Express every attack as bullets, zones or beams; anything that deals damage must have a
   telegraph (`delay`) — invariant 5 in CLAUDE.md.
4. Add the row with
   `E(id, name, biome, tier, hp, spd, dmg, r, xp, cost, look, col, col2, move, desc, {atk, traits, group})`.
   `tier` 0–3 controls when it enters the pool; `cost` is its spawn budget (≈ hp/25, more if dangerous).
5. Look: reuse a `BODIES` family with a new variant/colours, or add a body in `render/shapes.ts`
   (facing +x, built with the Kit). The sprite is generated automatically from the def.
6. Each biome currently has exactly 16 enemies (tests assert 64 total / 16 per biome). Adding a 65th
   means updating those expectations on purpose.

## Verify
```bash
npm run validate
npx vitest run tests/enemies.test.ts -t "<enemy id>"   # must be able to hurt a passive player
npx vitest run tests/content.test.ts -t "behaviors"
npm run balance -- 6 && npm run manifest
```
Look at it: `?dev` → `__rift.start(); __rift.god(); __rift.spawn('<id>', 5)`.

Done when: it passes the threat test, its telegraphs are readable in a screenshot, and balance
runs show no new early-death spike (check the `hurtBy` lines).
