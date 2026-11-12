---
paths:
  - "src/sim/**"
  - "src/core/**"
---
# Gameplay & combat architecture

- A system is a module of functions taking `World` (`updateX(w, dt)`), called from `World.step()` in
  a fixed order. Add new per-step systems there, nowhere else.
- Entity shapes are in `sim/types.ts`. Add fields there and initialise them in `sim/entities.ts`
  spawners; hot entities (`Proj`, `Bullet`) are pooled, so reset **every** field on spawn.
- Hits: `hitEnemy` (weapon hit: status, knockback, execute, fusion element flip) → `damageEnemy`
  (crit, vulnerability, shields, marks/reactions, hooks). Area helpers: `hitCircle/hitArc/hitLine`.
  Flags: `F_NOCRIT`, `F_NOREACT`, `F_DOT`, `F_RAW` (skip player multipliers).
- Spatial queries use `w.grid.query(x, y, r)` (rebuilt each step). Filter `!e.alive || e.hidden`.
  `nearestEnemy/strongestEnemy/randomEnemies` do linear scans and are fine for targeting.
- Player-owned things are `team 0`, hostile `team 1`, neutral hazards `team 2`.
- Telegraphs are just `Zone`/`Beam` with a `delay`; damage only starts after it elapses.
- Per-weapon scratch state: `wi.t`, `wi.st`, `wi.acc`, `wi.flip`. Kind-specific switches live in
  `p.x.*` and are documented in the comment above each `registerKind` block.
- Hooks (`Hooks` in types.ts) are the only way relics/classes alter rules. To add a hook point, add
  it to the interface and call it in exactly one place.
- Caps exist on purpose (zones 420, bullets 900, pickups 380, `reactBudget` 30/step). Respect them.
- The headless `Bot` (`sim/bot.ts`) must keep working: new hostile mechanics should be expressed as
  bullets, zones or beams so both the bot and players can read them.
