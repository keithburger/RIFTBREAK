---
name: add-biome
description: Add or rework a RIFTBREAK biome/world (palette, ground texture, decor, hazards, enemy roster, bosses, music). Use for new environments or environmental hazards.
---
# Add a biome

## Context to load
- `src/content/biomes.ts` (whole file, it is short).
- `src/sim/hazards.ts` (short) for hazard kinds.
- `backgrounds()` and `decor()` in `src/render/atlas.ts`.

## Procedure
1. Add a `BiomeDef` to `BIOME_DEFS` with the next `idx`: palette (`bg`, `bg2`, `line`, `accent`,
   `accent2`), two boss ids, two hazards, three decor keys, and a `music` seed (`root` MIDI note,
   scale intervals, tempo).
2. Roster: a biome needs enemies in **all four tiers** (validation fails otherwise) and should have
   16 with ≥8 distinct movement behaviors. Use `/add-enemy` for each; set their `biome` to the new idx.
3. Hazards: reuse `vent, bramble, jet, arc, whirl, geyser, rift, flare` or add a `HAZARDS.<kind>`
   entry. Rules: telegraph ≥ 1.1 s, `team: 2` if it should also hurt enemies, never a zero-warning
   damage source. Parameters `a, b, c` are documented per kind.
4. Bosses: two entries (`/add-boss`). The standard run picks one per biome by seed parity; Boss Rush
   plays both.
5. Art: add a branch for the new `idx` in `backgrounds()` for the 512 px seamless ground tile (a low-contrast plotted-graph construction, no noise/blotches — `docs/ART_DIRECTION.md`), and
   decor shapes in `decor()` (three keys: tall accent, cluster, scatter).
6. Run length: standard mode plays every biome for `BIOME_TIME` (300 s) + boss. A fifth biome
   lengthens the run by ~6 min — adjust `BIOME_TIME` or say so explicitly.
7. Update the tests that assert 4 biomes / 8 bosses / 64 enemies deliberately.

## Verify
```bash
npm run validate && npm run test:fast
npm run balance -- 8
npm run build && (npm run preview > /dev/null 2>&1 &) ; sleep 2 ; npm run e2e
```
Then open `screenshots/biome-<idx>.png`.

Done when: validation passes, a bot can traverse it, and the screenshot shows a palette and ground
pattern clearly distinct from the other biomes with readable enemies on top.
