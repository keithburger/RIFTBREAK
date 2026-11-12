---
name: balance
description: Measure and tune RIFTBREAK balance with seeded simulations (pacing, win rate, boss duration, weapon damage shares, causes of death). Use for any "too hard / too easy / too slow / weapon X is weak" request.
---
# Balance pass

## Measure first
```bash
npm run balance -- 16 standard all        # runs, mode, class|all
npm run balance -- 8 standard geomancer   # isolate a class
npm run balance -- 6 bossrush all
```
Each run prints: outcome, time, level, kills, boss durations, 5-minute checkpoints
(`level / hp / enemy count`), `hurtBy` (damage taken by source) and the build with per-weapon damage.
Bot policies rotate (`smart`, `random`, `weapons`, `passives`) to cover different build shapes.

## Targets
| Metric | Target |
|---|---|
| Standard run length (wins) | 20–27 min |
| Level at 5 / 10 / 20 min | ~20 / ~32 / ~55 |
| Bot win rate (mixed policies) | 35–60 % |
| Boss duration, typical build | 40–100 s |
| Deaths before minute 5 | none |
| Any single weapon's damage share | < 60 % of a 6-weapon build; none ≈ 0 |
| Top `hurtBy` source | no single non-boss source dominating deaths |

## Where the knobs are
- Global curve: `sim/director.ts: difficulty()` (enemy HP/damage/speed, boss HP) and `spawnField()`
  (spawn rate, population cap, elite cadence), `TIER_UNLOCK`, `BIOME_TIME`.
- XP curve: `sim/player.ts: xpForLevel`. Sustain: level-up heal (same file), drop rates in
  `sim/combat.ts: killEnemy`, base regen in `sim/stats.ts`.
- Per-item numbers: the definition in `src/content/*` (weapon `dmg/cd/ups`, enemy `hp/dmg/cost`,
  boss `hp`), offer weights in `sim/upgrades.ts: rollOptions`.

## Rules
- Change one lever at a time and re-run the same seeds; compare before/after lines.
- Fix difficulty with patterns and composition before HP: read `hurtBy` to see *what* kills.
- A weak weapon gets its base/ranks tuned; an overperforming one loses multipliers, not identity.
- Bot results are a proxy. Say so; do not claim "fun" from simulations.

## Finish
```bash
npm test          # includes the full-run pacing guard
```
Record the before/after summary line and the changed knobs in `docs/PROGRESS.md`.
