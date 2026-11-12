# Testing

## Commands
| What | Command | Time |
|---|---|---|
| Types | `npm run typecheck` | ~5 s |
| Content validation | `npm run validate` | ~1 s |
| Fast suite | `npm run test:fast` | ~10 s |
| Full suite (adds full-length bot runs) | `npm test` | ~60 s |
| Balance simulations | `npm run balance -- <runs> <mode> <class\|all>` | ~4 s/run |
| Sim benchmark | `npm run bench -- <enemies> <seconds>` | — |
| Browser verification | `npm run build && npm run preview &` then `npm run e2e` | ~4 min |
| Quick visual probe | `node scripts/look.cjs` | ~1 min |

## Automated tests (`tests/`, Vitest, headless) — 267 tests
| File | Covers |
|---|---|
| `ops.test.ts` | ops DSL, seeded RNG, spatial grid correctness |
| `content.test.ts` | registry validation, all content targets, element/fusion structure, enemy behavior variety; **every weapon, both evolutions and every fusion deal damage in a live sim**, evolutions change mechanics, fusions trigger their own reaction |
| `elements.test.ts` | all 45 reactions fire in both orders with an observable effect; chain safeguards (no re-marking, per-step cap, per-enemy cooldown) |
| `player.test.ts` | movement, dash distance/i-frames/charges, contact damage, armor floor, bullets, telegraphed zones, death, revive, XP/levels, arena confinement |
| `upgrades.test.ts` | always 3 valid distinct options over 140 levels × 6 seeds, rank limits, slot limits, evolution prerequisites, all 20 fusions, stat application, relic pool exhaustion, every relic + class hook in live combat |
| `enemies.test.ts` | **each of the 64 enemies can hurt a passive player** (supports: effect on allies); charge/ambush/burrow/leap telegraphs, shields, splits, summons, phase, regen, drain, kamikaze, sentry, elites; spawn positions, tier unlocks, population cap |
| `bosses.test.ts` | bosses are distinct; **every attack of every phase acts**; each boss is fought through all phases with transition immunity, death sequence and rewards; telegraph minimums; Arachnoid legs + death-ray timing; Leviathan segments; Sovereign arena shrink |
| `sim.test.ts` | determinism (same seed, step batching), full standard run to victory, boss parity coverage, Boss Rush, Endless looping, defeat, mode + meta modifiers, every class, entity/pool bounds, minion cleanup, world isolation, all 12 encounters |
| `sim.fullrun.test.ts` | six full-length non-invulnerable bot runs: ≥ 2 wins, wins in 19–30 min above level 40, no early collapse |
| `save.test.ts` | defaults, round-trip, v1→v3 and v2→v3 migrations, corrupt/future/hostile data, failing storage |
| `architecture.test.ts` | layer import rules, headless purity of `core/sim/content`, file size cap |

## Browser verification (`scripts/e2e.cjs`, Playwright, real production build) — 54 checks
1. **Real player flow, no dev tools:** menu → class select → run → level-up reached by playing →
   pick → pause → settings → quit → codex → reload; save persistence; no `__rift` in production.
2. **Dev-driven coverage (`?dev`):** combat, all 8 bosses spawn/attack with a boss bar, all 4 biomes,
   defeat and victory summaries, restart cleanliness, 500-enemy benchmark.
3. **Canvas 2D fallback (`?renderer=canvas`):** renderer selection and playable combat.
4. **Touch, 390×844 and 844×390:** joystick moves the player, dash button, upgrade-card input
   lockout, cards fit the width, no movement lingering after an overlay, pause button.
5. No uncaught errors or console errors in any session.

Screenshots land in `screenshots/` (git-ignored) with `e2e-report.json`. Look at them — passing
checks do not prove the picture is right.

## Dev tools (`?dev` only, `src/app/dev.ts`)
`__rift.start(class, mode, seed)` · `spawn(id, n, elite)` · `boss(id)` · `xp(levels)` ·
`autoLevel(n)` · `give(weaponId)` · `relic()` · `biome(i)` · `event(id)` · `god(on)` · `speed(x)` ·
`kill()` · `win()` · `await bench(enemies, seconds)`. A perf line (fps, sim/draw ms, enemies,
sprites, quality, renderer) is shown while `?dev` is active.

## Measured results (this container, 2026-11)
| Measurement | Result |
|---|---|
| Sim cost, 500 enemies, level-40 build (`npm run bench -- 500 20`) | **0.65 ms/step avg**, p95 1.5, p99 3.4 → 3.9 % of a 60 Hz frame |
| Sim cost, 800 enemies | 0.97 ms/step avg |
| Browser JS per frame, 500 enemies / ~1500 sprites | sim 2.7 ms + draw submission 1.7 ms |
| Browser total frame time, WebGL, 500 enemies | 203 ms (4.9 fps) — **software rasterizer (SwiftShader), no GPU in this container** |
| Browser total frame time, Canvas fallback, 300 enemies | 57 ms (17 fps), same software environment |

**Not measured:** frame rate on real GPU hardware (desktop, Chromebook, phone). The CPU-side numbers
leave ample headroom for 60 fps, but the 60/30 fps targets are unverified until
`__rift.bench(500, 8)` is run on real devices.

## Optional Claude Code hook
`scripts/hook-post-edit.sh` validates the content registry (~1 s) after an edit under
`src/content/`. It is **not enabled by default**. To enable, add to `.claude/settings.json`:
```json
{ "hooks": { "PostToolUse": [ { "matcher": "Edit|Write",
  "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hook-post-edit.sh", "timeout": 20 } ] } ] } }
```
