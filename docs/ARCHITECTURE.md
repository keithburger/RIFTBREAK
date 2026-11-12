# Architecture

## Layers and allowed imports

```
core ◄── sim ◄── content
           ▲        ▲
        render      │        save   audio   input(→sim types)
           ▲        │          ▲      ▲       ▲
           ui ──────┼──────────┘      │       │
           ▲        │                 │       │
           └────── app (game.ts) ─────┴───────┘     the only layer that sees everything
```
Enforced by `tests/architecture.test.ts` (imports, no DOM/timers/`Math.random` in `core|sim|content`,
no file ≥ 700 lines).

| Layer | Responsibility | Key files |
|---|---|---|
| `core/` | math helpers, seeded `Rng`, spatial `Grid`, ops DSL | `ops.ts`, `grid.ts` |
| `sim/` | the whole game as a deterministic, headless simulation | see below |
| `content/` | definitions and scripts; assembled + validated by `registry.ts` | one file per content type, `bosses/*` |
| `render/` | procedural atlas, renderer backends, effects, scene | `atlas.ts`, `shapes.ts`, `renderer.ts`, `effects.ts`, `scene.ts` |
| `audio/` | synthesized SFX + generative music | `audio.ts` |
| `input/` | keyboard (rebindable), touch joystick, gamepad → `InputState` | `input.ts` |
| `save/` | versioned save, migrations, settings | `save.ts` |
| `ui/` | DOM menus, HUD, overlays via `UIHost` | `ui.ts`, `styles.css` |
| `app/` | lifecycle, loop, state machine, wiring; dev tools | `game.ts`, `dev.ts`, `main.ts` |

## Simulation (`src/sim`)

`World` (`world.ts`) holds all run state. `World.step(input)` advances exactly 1/60 s:

```
grid rebuild → updatePlayer → updateWeapons → updateProjectiles → updateMinions → updateZones
→ updateBeams → updateEnemies (AI, statuses, bosses, contact) → updateBullets → updatePickups
→ updateHazards → updateDirector (difficulty, spawning, encounters, boss/biome/mode flow)
```

| File | Owns |
|---|---|
| `types.ts` | every data shape (entities, defs, `ContentDB`, `Hooks`, `Stats`) |
| `entities.ts` | spawners + pools (`Proj`, `Bullet` are pooled) |
| `combat.ts` | `damageEnemy`, `hitEnemy`, area hits, statuses, reactions, `hurtPlayer`, targeting |
| `weapons.ts` | weapon engine: params, fire loop, projectile/zone/beam/minion updates |
| `weaponKinds.ts` | 26 registered weapon behaviors (`registerKind`) + minion behaviors |
| `enemyAI.ts` | `MOVES` (15) and `ATTACKS` (19) behavior registries, enemy system, enemy bullets |
| `boss.ts` | boss framework (phases, rotations, transition, death, rewards) + script helpers |
| `hazards.ts` | biome hazard kinds (`HAZARDS`) |
| `director.ts` | `difficulty()` curve, spawning, elites, encounter scheduling, biome/boss/mode flow |
| `upgrades.ts` | level-up and relic option generation + application |
| `player.ts`, `stats.ts` | movement/dash/xp/pickups; stat block from class+mode+meta+passives+relics |
| `fx.ts` | `FxSink` — the one-way event channel to presentation (`NullFx` when headless) |
| `bot.ts` | autopilot for tests, balance runs and the menu backdrop |

Rules of the sim: no imports from `content/` (a `ContentDB` is injected), no presentation, all
randomness through `w.rng`, teams `0` player / `1` hostile / `2` neutral, telegraphs are zones or
beams with a `delay`.

## Extension points

| To add… | Write… | Register in | Engine changes |
|---|---|---|---|
| Weapon / evolution / fusion | a def (`W`/`E`/`F`) | `content/weapons.ts` | none |
| New weapon mechanic | `registerKind` block | `sim/weaponKinds.ts` | none |
| Enemy | an `E(...)` row | `content/enemies.ts` | none |
| Enemy behavior | `MOVES.x` / `ATTACKS.x` | `sim/enemyAI.ts` | none |
| Boss | a script file | `content/bosses/`, `registry.ts`, `biomes.ts` | none (+ draw case) |
| Biome / hazard | `BiomeDef` / `HAZARDS.x` | `content/biomes.ts`, `sim/hazards.ts` | none (+ ground art) |
| Reaction | an `R(...)` row | `content/elements.ts` | none unless a new `ReactionFx` type |
| Relic / passive / class / meta | a def with ops and/or `Hooks` | matching content file | none |
| Encounter | `EncounterDef` | `content/encounters.ts` | none |
| Mode | `ModeDef` | `content/modes.ts` | only for a new flow `kind` |

The ops DSL (`core/ops.ts`) — `"dmg*1.25"`, `"count+1"`, `"zone.r=40"`, `"kind=beam"` — is how ranks,
evolutions, passives, relics, classes, modes and meta upgrades express tuning as data.

## Presentation

- **Atlas** (`render/atlas.ts`, `shapes.ts`): every sprite is drawn with Canvas 2D at startup into
  one 4096² page (enemies, bosses, projectiles, icons, glyphs, decor) plus four seamless ground tiles.
- **Renderer** (`render/renderer.ts`): a layered immediate-mode sprite batcher with two backends,
  `PixiRenderer` (WebGL) and `CanvasRenderer` (fallback, chosen automatically if WebGL is missing or
  PixiJS init throws; force with `?renderer=canvas`). Layers: ground, additive glow, entities,
  additive FX, top.
- **Scene** (`render/scene.ts`): read-only pass over `World`. **Effects** (`render/effects.ts`):
  implements `FxSink` with pooled particles, rings, lines, slashes, text; owns shake/flash and the
  quality level (0–3, auto-adapts to frame time; decorative effects shed first).
- **App loop** (`app/game.ts`): fixed-step accumulator (max 6 steps/frame × speed), state machine
  `menu | run | pause | choice | end`, save/unlock bookkeeping, adaptive quality, music switching.

## Persistence

`save/save.ts`: `SaveData` v3 `{ shards, meta, classes, settings, stats, seen }` in
`localStorage['riftbreak.save']`. `migrate()` upgrades v1→v2→v3 and merges over defaults so corrupt
or partial data never crashes. Storage failures are swallowed (the game stays playable).
