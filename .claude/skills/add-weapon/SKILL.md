---
name: add-weapon
description: Add a new RIFTBREAK weapon (base weapon with 5 ranks and two evolutions, or a fusion). Use when asked to add, design or replace a weapon or evolution.
---
# Add a weapon

## Context to load (only these)
- `src/content/weapons.ts` — grep an existing weapon of the closest kind and read just that block.
- The comment above the matching `registerKind('<kind>'` block in `src/sim/weaponKinds.ts`.
- `WP` in `src/sim/types.ts` if you need a param you have not seen.

## Procedure
1. **Pick the behavior.** `grep -n "registerKind(" src/sim/weaponKinds.ts` lists every kind
   (shot, lob, cone, nova, orbit, mine, beam, sweep, chain, drone, strike, whip, aura, trail,
   fissure, spire, turret, well, ray, stride, shade, curse, rend, tornado, arc, rain). Most new
   weapons are an existing kind with new params/modifiers (`homing`, `bounce`, `split`, `explode`,
   `chain`, `returns`, `zone`, `trailZone`, `status`, `x.*`).
2. **Only if the mechanic is truly new**, add a `registerKind('name', { fire, update, dash })` block
   in `weaponKinds.ts` built from the engine primitives (`spawnProj`, `spawnZone`, `spawnBeam`,
   `spawnMinion`, `hitCircle/hitArc/hitLine`, `chainFrom`, `zoneFrom`). Persistent helpers get a
   `MINIONS.<kind>` entry. Document its `x.*` switches in the comment. Do not touch `combat.ts` or
   `weapons.ts` unless a primitive is missing.
3. **Add the definition** with `W(id, name, element, desc, base, ups, evoA, evoB)`:
   - 4 rank-ups as ops lists; 2 evolutions via `E(id, name, needsPassiveId, desc, ops)`.
   - Each evolution must change mechanics (an op other than `dmg`/`cd`).
   - `base.sprite` must be an existing `p_*` key, or add one in `render/atlas.ts: projectiles()`
     (white, ~28 px, distinctive silhouette) and, if its size is unusual, a `PROJ_REF` entry in
     `render/scene.ts`.
4. **Fusion instead?** Use `F(id, name, sourceA, sourceB, el, el2, desc, base, U)`. Note the
   invariant "every base weapon belongs to exactly one fusion" — a new fusion needs two new base
   weapons, or replaces an existing fusion.
5. Element balance: tests expect 4 base weapons per element. Adding a weapon to an element means
   updating that test's expectation deliberately (and saying so).
6. Audio: `w.fx.sfx('<name>')`; reuse a name from `audio/audio.ts` or add a recipe to `S`.

## Verify (acceptance)
```bash
npm run validate
npx vitest run tests/content.test.ts tests/upgrades.test.ts -t "<weapon id>"
npm run balance -- 6        # its damage share in the build lines should be neither ~0 nor dominant
npm run manifest
```
Then build and look at it: `?dev` → `__rift.start(); __rift.give('<id>'); __rift.god()`.

Done when: validation passes, the generated weapon test passes for base + both evolutions, it is
visibly distinct in play, and its damage share in balance runs is within ~0.3×–3× of its peers.
