# RIFTBREAK — Art Direction

Target: **premium geometric sci-fi** — sharp silhouettes, restrained neon, controlled bloom, dark
atmospheric ground. Numbers live in `src/core/tokens.ts` (mirrored to CSS by `src/ui/theme.ts`);
this file holds the *rules*. Change a token, not a literal.

## 1. Principles
1. **Silhouette first.** Every enemy/boss/weapon must be identifiable as a flat black shape at 32 px.
   Prefer chamfered polygons, blades, wedges and rings; avoid round blobs, flowers, faces.
2. **One accent per object.** A body has a dark base, one accent hue, one emissive core. No rainbow.
3. **Colour is semantics** (never break these):
   | Meaning | Colour | Where |
   |---|---|---|
   | Hostile / telegraph | red + white high-contrast core | enemy bullets, beams, blast zones, boss bar |
   | Player friendly | the weapon's **element** colour (never red) | projectiles, zones, minions |
   | XP | cyan→green→gold→pink diamonds by value | pickups `k_xp0-3` |
   | Heal / magnet / bomb / chest | green cross / blue magnet / amber bomb / gold chest | pickups |
   | Reward / rarity | gold (evolution, relic) | UI + chests |
   | Interactive UI | cyan `acc`; magenta `acc2` only for rift/special |  |
4. **Controlled bloom.** One additive glow per object, ≤ 0.45 alpha, gated by `fx.settings.quality`.
   Hostile telegraphs, bullets and the player are never reduced by quality.
5. **Dark ground.** Backgrounds stay below ~25 % luminance; the brightest things on screen are
   hostile attacks, then the player, then friendly effects, then pickups.

## 2. Pickups vs. weapons vs. enemies vs. bosses (distinctness contract)
| Class | Shape language | Size (logical px) | Glow |
|---|---|---|---|
| Pickups | small faceted diamond / icon glyph, no outline-heavy body | 14–22 | tight, own colour |
| Weapon projectiles/zones | elongated or ring forms in element colour, white core | 8–40 | additive, element |
| Enemies | angular bodies with keyline + 1 eye/core | 24–64 (elite ×1.3) | none or tiny |
| Bosses | multi-part, symmetric, ≥ 4× enemy area, animated parts | 160–320 | rim only |
| Player ships | chevron/arrow family, bright rim, always the highest-contrast friendly shape | 36 | engine only |

## 3. Construction recipe (`render/shapes.ts` Kit)
keyline (1.5–2 px dark) → gradient body (dark→mid, top-left light) → rim light (1 px, accent) →
emissive core (white→accent). Sprites are authored at logical size × `ATLAS_SCALE` (2).

## 4. Asset pipeline & naming
Everything is drawn into a single atlas page at start-up (`render/atlas.ts: buildAtlas`), so a
sprite is **a recipe + a key**. Conventions (enforced by the contact-sheet audit, §6):
- Key = `<group>_<name>`; groups: `pl_` player, `e_` enemy, `boss_` boss, `p_` projectile, `k_`
  pickup, `i_` icon, `g_` glyph/fx, `r_` relic icon, `d_` decor, `b_` background tile.
- Tinted-at-runtime sprites are authored **white**; baked-colour sprites carry their own palette.
- New group → add a `function group(a: Atlas)` in `atlas.ts` and call it from `buildAtlas`;
  bodies for enemies/bosses go in the `BODIES` / `BOSS_BODIES` registries (no engine branches).
- Atlas page budget: 4096²; check `a.frames` size before adding a group (see PROGRESS "limits").
- To swap in authored bitmaps later, register them via `Atlas.add(key, w, h, draw)` with a draw
  callback that `drawImage`s the loaded image; nothing downstream changes.

## 5. UI language
- Chamfered (cut-corner) panels and buttons (`--cut-*`), flat dark surfaces, 1 px keyline, **no**
  gradient text, no stacked glows. One accent per component; hover = lighter surface + accent edge.
- Type: display stack for headings/numerals (caps, tracking `--track-wide`), body stack for prose.
  No webfont (offline, no CDN) — system stacks only.
- Hierarchy in the HUD: HP > timer > boss bar > build slots > kills. Centre of the screen is clear.
- Mobile: joystick bottom-left (fixed base, 46 px travel), dash bottom-right, build slots top-left;
  both thumb zones are free of HUD. Touch targets ≥ 44 px. Respect safe-area insets.
- Motion: 90/180/320 ms, `cubic-bezier(.2,.8,.2,1)`; honour `prefers-reduced-motion`.

## 6. Audit workflow
`npm run preview &` → `node scripts/atlas-sheet.cjs e_,boss_,k_,p_,pl_` writes
`screenshots/atlas-*.png` contact sheets and prints per-group frame counts.

### Current audit (from the live atlas)
| Group | Count | Verdict | Notes |
|---|---:|---|---|
| `pl_` player ships | 8 | **Retain** | Clear chevron family, good rim light. |
| `k_` pickups | 9 | **Retain** | Distinct from everything else; XP tiers read by hue. |
| `p_` projectiles | 40 | **Retain** (spot-check) | Element-tinted; verify vs. new ground in late game. |
| `e_` enemies | 66 | **Retain ≈50 / Revise ≈16** | Revise organic/cartoon bodies (flower, spore clusters, blobs, round faces) toward chamfered silhouettes. No wholesale replacement. |
| `boss_` bosses | 8 | **Retain** | Re-review after enemy revision for consistency. |
| `i_`/`r_`/`g_` icons & glyphs | 95 | **Retain** | Re-tint through tokens if palette shifts. |
| `d_`/`b_` decor/backgrounds | 14 | **Revise (low)** | Keep dark; reduce noise contrast under boss arenas. |
Nothing is classed *Replace*. The "revise" list needs an approved benchmark (one enemy, one boss
body, one pickup redrawn to this document) before batch work — **awaiting sign-off**.
