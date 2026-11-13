# Progress

State snapshot (not a diary). Update at milestones.

## Status: feature-complete against the content spec; verified in sim and headless browser

| Target | Required | Implemented | Verified by tests |
|---|---:|---:|---:|
| Base weapons | 40 | 40 | 40 |
| Weapon evolutions | 80 | 80 | 80 |
| Fusions | 20 | 20 | 20 |
| Enemy archetypes | 64 | 64 | 64 |
| Bosses | 8 | 8 | 8 |
| Biomes | 4 | 4 | 4 |
| Elemental reactions | 45 | 45 | 45 |
| Classes | ≥ 6 | 8 | 8 |
| Passives | ≥ 24 | 24 | 24 |
| Relics | ≥ 24 | 26 | 26 |
| Encounter types | ≥ 12 | 12 | 12 |
| Modes | standard, endless, boss rush, challenge | 7 | 4 flows + modifiers |

`content-manifest.json`: 251 items, 251 verified, 0 failing.

## Last verification
- `npm run typecheck` ✓ · `npm run validate` ✓ · `npm test` 267/267 ✓ · `npm run build` ✓
- `npm run e2e` 54/54 ✓ (WebGL + Canvas fallback + touch portrait/landscape), no runtime errors
- Balance (`npm run balance -- 16`): bot wins 6/16, wins take 23–27 min at level ~60, typical boss
  40–100 s. Full-run test: 3/6 wins.
- Performance: see `docs/TESTING.md` — sim 0.65 ms/step at 500 enemies; real-GPU frame rate unmeasured.

## Visual overhaul & input repair (latest pass)
- **XP orbiting fixed.** Root cause: pull speed was `380 + pickup.age*300` and `age` never stops
  growing, so a gem older than a few seconds moved > 40 px/step, jumped over the 20 px collect
  radius and oscillated around the player. Now speed ramps with time *since pulled* (`Pickup.pt`),
  is capped (1500 px/s) and the step is clamped to the collect radius. The bob animation also used
  `sin(t*5 + k.x)` (phase changed ~hundreds of rad/s while pulled → shimmer); now uses `k.age`,
  zero while pulled. Regression test in `tests/player.test.ts`. No allocations added.
- **Joystick:** fixed base (CSS-positioned, never script-moved), pointer events + capture,
  46 px travel (clamped 40–50 in `core/tokens.ts`), 12 % dead zone, normalised direction held outside the ring,
  instant release on up/cancel/lostcapture. e2e asserts base fixed, thumb ≤ 50 px, direction kept,
  recentre on release (portrait + landscape).
- **Design system:** `core/tokens.ts` → `ui/theme.ts` → CSS variables; `styles.css` rewritten on tokens.
  `docs/ART_DIRECTION.md` has the rules and the art audit. `scripts/atlas-sheet.cjs` dumps contact sheets.
- **Not done / remaining gaps:** no enemy/boss redraw (needs approved benchmark; ~16 enemies flagged
  "revise"); UI restyled via CSS only — markup of select/armory/codex screens is unchanged; no real
  device or GPU run; headless bench is software-rasterised (4.6 fps @ 494 enemies, sim 3.1 ms/step there).

## Art redraw (Desmos-style) — latest pass
- All sprites, ground tiles and effects follow `docs/ART_DIRECTION.md` (flat, ≤ 3 colours, lighter-tint
  outline, no gradients/glows). Measured with `node scripts/art-audit.cjs`: 155 baked sprites, max 3 colours.
- New: `render/geometry.ts` (ink palette, plot/polar/wave/arc/repeat helpers), `scripts/art-audit.cjs`,
  `tests/geometry.test.ts`; `atlas-sheet.cjs` now draws at 1× and 3×. Gameplay, hitboxes, balance and UI layout untouched.
- Gaps: see ART_DIRECTION §8.

## Known issues / limits
1. **GPU frame rate is unverified.** Only a software rasterizer was available. Run
   `__rift.bench(500, 8)` (`?dev`) on real desktop / Chromebook / phone hardware.
2. **No human playtest.** Balance and pacing come from bot simulations; feel, fun and difficulty
   for real players are unconfirmed. Audio was generated but never listened to.
3. **Dense late-game readability** improved in the last pass but is still busy at full quality with
   many overlapping area effects; judged only from screenshots.
4. **Boss duration variance:** strong builds can still end later bosses in < 25 s; weak builds take
   2–4 min.
5. **Canvas fallback is slow in dense scenes** (tinting cache + per-sprite transforms).
6. **Weapon distinctness:** 40 weapons share 26 behaviors; several differ by parameters/modifiers
   rather than a wholly unique mechanic (e.g. the shot-family weapons).
7. Mobile verified by emulation only (touch events, viewport); no real-device run. Gamepad input and
   key rebinding exist but have no automated test.
8. The atlas is one 4096² texture; very old mobile GPUs with a 2048 limit would need a split.
9. The Claude Code hook is shipped as an opt-in script (`docs/TESTING.md`), not active config.

## Next executable tasks
1. Real-device performance pass → record numbers in `docs/TESTING.md`; tune `BUDGET`/quality tiers.
2. Human playtest → `/balance` on early-game pacing and final-boss difficulty.
3. `/visual-pass` on late-game density (friendly effect alpha, damage-number throttling).
4. Per-weapon signature mechanics for the most similar shot-family weapons.
5. e2e coverage for key rebinding; gamepad smoke test.

## Resume
```bash
npm ci
npm run verify                              # typecheck, validate, tests, manifest, build
(npm run preview > /dev/null 2>&1 &) ; sleep 2 ; npm run e2e
npm run dev                                 # play at the printed URL; add ?dev for tools
```
