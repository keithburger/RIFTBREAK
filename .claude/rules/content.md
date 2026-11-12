---
paths:
  - "src/content/**"
  - "content-manifest.json"
---
# Content additions

- One definition per item in the matching file; `registry.ts` picks it up from the exported array
  (bosses also need adding to `BOSS_DEFS`). Do not hand-edit `content-manifest.json`.
- Prefer composing existing behaviors. Check the registered names first:
  weapon kinds in `sim/weaponKinds.ts`, enemy `MOVES`/`ATTACKS` in `sim/enemyAI.ts`, hazards in
  `sim/hazards.ts`, boss helpers in `sim/boss.ts`, reaction effect types in `types.ts: ReactionFx`.
- Only write a new behavior when the mechanic genuinely does not exist; then register it and
  document its params in a one-line comment.
- Descriptions are compact and state numbers or the mechanical change ("Bolts pierce everything…"),
  never flavour-only text.
- Weapon sprite keys (`base.sprite`, `p_*`) must exist in `render/atlas.ts: projectiles()`.
  Enemy `look: [body, variant]` must name a body in `render/shapes.ts: BODIES`.
- Baseline numbers: fodder ≈ 10 HP / 8 dmg / cost 1; tier-3 bruisers ≈ 250–340 HP / cost 11–13;
  rank-1 weapons ≈ 12–20 sustained DPS; bosses 1400–2400 base HP (scaled by `diff.bossHp`).
- Required follow-up: `npm run validate` → the relevant test file → `npm run manifest`.
