---
name: add-relic
description: Add a RIFTBREAK relic, passive upgrade, class or persistent meta upgrade (build modifiers). Use when asked for new build-defining items or stat upgrades.
---
# Add a relic / passive / class / meta upgrade

## Context to load
- The target file only: `src/content/relics.ts`, `passives.ts`, `classes.ts` or `modes.ts`.
- `Hooks` and `Stats` in `src/sim/types.ts`.

## Procedure
- **Relic** — `R(id, name, rarity 1-3, desc, mods?, hooks?)`.
  - Pure stat relic: `mods` ops on `Stats` keys (`'might+0.4'`, `'maxHp*0.7'`).
  - Behavioral relic: `hooks` — `onKill`, `onHit`, `onDash`, `onHurt` (return the new damage),
    `onReact`, `onFire`, `tick`. Per-relic counters go in `w.player.rs.<key>`; dynamic multipliers
    are set in `tick` on `p.dynMight / dynHaste / dynSpeed` (they reset every step).
  - A relic should change *how* a build plays (a condition, a trade-off, a trigger), not just add
    a flat bonus a passive already offers. Guard recursive triggers (see `chaos_infusion`).
  - The icon is generated automatically from the id and rarity.
- **Passive** — `P(id, name, desc, maxRank, ...mods)`. Add a glyph mapping in
  `render/atlas.ts: PASSIVE_GLYPH`. Passives can gate evolutions (`EvoDef.needs`).
- **Class** — entry in `CLASS_DEFS`: starting weapon id, stat `mods`, unlock `cost`, and a `hooks`
  trait described in `trait`. Add a ship in `render/shapes.ts: PLAYER_SHIPS` if `look` is new.
- **Meta upgrade** — entry in `META_DEFS` (`max`, `cost`, `mods`); the cost of rank n is `cost × n`.
- New stat? Add it to `Stats`, `baseStats()` in `sim/stats.ts`, a label in `core/ops.ts`, and apply
  it in exactly one place in the sim.
- New hook point? Add it to `Hooks` and call it from exactly one place.

## Verify
```bash
npm run validate
npx vitest run tests/upgrades.test.ts      # runs every relic and class hook in live combat
npm run manifest
```
Try it in a `?dev` session: `__rift.start(); __rift.relic()` grants a rolled relic through
`applyOption`, which rebuilds stats and hooks (pushing an id onto `player.relics` by hand does not).

Done when: tests pass and the description states the exact numbers the code applies.
