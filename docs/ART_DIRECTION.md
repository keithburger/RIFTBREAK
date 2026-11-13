# RIFTBREAK — Art Direction

**Source of truth for every sprite, effect, ground tile and icon.** If another file disagrees
(a skill, a rule, a comment), this file wins and the other file is wrong — fix it.

## 0. The look in one sentence
*Clean math plotted in Desmos:* simple, exact geometry — circles, arcs, curves, lines, polygons and
repeated constructions — in flat colour with crisp edges, so every sprite looks hand-built from
equations, never painted, textured or generated.

## 1. The rules (hard limits)
1. **2–3 colours per sprite, total.** Fill, outline, and at most one accent. Nothing else, ever.
2. **The outline is a lighter tint of that sprite's own fill** (`edge = mix(fill, white, 0.5)`).
   No black, no dark, no contrasting outline colour. Outline width is **1.5 logical px** everywhere
   (`TOKENS.art.line`); limbs/bands are drawn as a wider *lighter* stroke under a narrower fill stroke.
3. **Flat fills, crisp edges.** No gradients, no textures, no noise, no shading overlays, no inner
   shadows, no `shadowBlur`, no soft/blurred sprites, no partial-alpha layering *inside* a sprite.
   (Translucency is allowed only as a whole-sprite alpha set by the scene, e.g. a telegraph zone.)
4. **No stacked glows.** There is no halo under entities. Emphasis comes from geometry (a ring, a
   cross-hair, a bigger silhouette), not light. Additive layers are used for pure flat shapes only.
5. **Geometry carries identity, not colour.** Enemies and attacks are told apart by silhouette and
   construction. Do not add a colour to make something distinct.
6. **Built from equations.** Prefer constructions you could type into a graphing calculator:
   `ngon`, `star`, superellipses `|x|^p+|y|^p=r^p`, roses `r=cos(kθ)`, spirals `r=a+bθ`,
   `y=A·sin(kx)` waves, circles/arcs/ellipses, and `rep(n, …)` (the same part rotated n times).
   Use the helpers in `render/geometry.ts` and the Kit in `render/shapes.ts` — do not hand-roll
   Canvas calls in a sprite recipe unless a helper is missing (then add the helper).
7. **Readable at real size.** Judge sprites at 1× (the size they appear in play), not zoomed in.
   Minimum feature size 2 px; no detail that disappears at 1×.
8. **No bare placeholder shapes.** A lone circle/triangle is not a sprite; build it from at least a
   second construction (a ring, a cut-out, a repeated element).

## 2. Colour semantics (unchanged — gameplay depends on them)
| Meaning | Colour | Where |
|---|---|---|
| Hostile / telegraph | red `#ff3355` family + white core | enemy bullets (red body, white core), blasts, beams, boss bar |
| Friendly | the weapon's **element** colour — never red | projectiles, zones, minions |
| XP | cyan → green → gold → pink by value | `k_xp0‑3` |
| Heal / magnet / bomb / chest / shard | green / blue / amber / gold / violet | pickups |
| Reward / rarity | gold | evolutions, relics, chests |
| Interactive UI | cyan `acc`; magenta `acc2` only for rift/special | UI |
Enemy bodies take `def.col` (fill) and `def.col2` (accent) from content; bosses likewise.

## 3. How a sprite is made (the "ink" contract)
```
ink(fill, accent?) → { fill, edge = lighter tint of fill, accent }   // render/geometry.ts
```
- **Baked sprites** (enemies, bosses, ships, pickups, emblems, decor): painted with the Kit —
  `body` (fill + edge), `core` (accent + edge), `dark` (a *knock-out*: a transparent hole with an
  edge outline — not a darker colour), `disc`, `line`, `band`, `plot`, `polar`, `rep`.
- **Runtime-tinted sprites** (projectiles, rings, pools, beams, slashes, glyphs): authored in **two
  greys** — fill `0.66`, outline `1.0` — and tinted by multiplication with one element colour, so
  they render as *element colour with a lighter outline* in both renderers with no extra sprites.
  Pure line/ring sprites are single-tone `1.0`.
- **Translucent regions** (zones, telegraphs) are Desmos "shaded regions": a flat disc at the
  scene's alpha plus a crisp full-alpha boundary ring (the `pool` sprite).

## 4. Distinctness contract
| Class | Construction language | Logical size |
|---|---|---|
| Pickups | single small facet/icon, own colour, lighter edge | 14–22 |
| Weapon projectiles | elongated / ring / arc forms, element colour | 8–40 |
| Enemies | one geometric family per `look`, + accent core/eye | 24–64 (elite ×1.3) |
| Bosses | multi-part symmetric constructions, ≥ 4× enemy area | 160–320 |
| Player ships | chevron/arrow family; the player also has a ring under it | 36 |
Hostile attacks stay the highest-contrast things on screen: red body + lighter-red edge + white
core, never reduced by `fx.settings.quality`.

## 5. Atlas pipeline & naming
Everything is drawn into one atlas page at start-up (`render/atlas.ts: buildAtlas`), so a sprite is
a **recipe + a key**.
- Key = `<group>_<name>`; groups: `pl_` player, `e_` enemy, `boss_` boss, `p_` projectile, `k_`
  pickup, `i_` passive icon, `r_` relic icon, `g_` glyph, `d_` decor, `b_` bullet.
- New group → a `function group(a: Atlas)` in `atlas.ts` called from `buildAtlas`; enemy/boss
  bodies go in the `BODIES` / `BOSS_BODIES` registries (no engine branches on ids).
- Ground tiles: 512 px seamless; a plotted-graph construction per biome (see `backgrounds()`),
  low contrast so entities always out-rank the ground.
- Tokens for every number here live in `src/core/tokens.ts` (`TOKENS.art`).

## 6. UI language
- Chamfered (cut-corner) panels and buttons (`--cut-*`), flat dark surfaces, 1 px line, no
  gradient text, no glow. One accent per component; hover = lighter surface + accent edge.
- Type: display stack for headings/numerals (caps, tracking `--track-wide`), body stack for prose.
  System fonts only (offline, no CDN).
- Hierarchy in the HUD: HP > timer > boss bar > build slots > kills. Centre of the screen is clear.
- Mobile: fixed joystick bottom-left (46 px travel), dash bottom-right, build slots top-left.
  Touch targets ≥ 44 px; respect safe-area insets. Motion 90/180/320 ms; honour reduced-motion.

## 7. Review workflow (`/visual-pass`)
`npm run build && npm run preview &` then
`node scripts/atlas-sheet.cjs e_,boss_,k_,p_,b_,pl_,i_,r_ 1,3` → `screenshots/atlas-<group>-<1|3>x.png`
(1× = true game scale, 3× = inspection; white-authored groups are tinted like the game does);
`node scripts/art-audit.cjs` **measures** rule 1 (≤ 3 flat colours per baked sprite; exits 1 on a
violation); live captures via `scripts/look.cjs` (dense late-game scene) and `npm run e2e`.
`tests/geometry.test.ts` pins rule 2 (outline is always a lighter tint of the fill).
Check: nothing glows, shapes identifiable at 1×, hostile attacks still the loudest thing in a dense scene.

## 8. Status (after the full redraw pass)
**Done — applied to every sprite family**
| Family | Count | What changed |
|---|---:|---|
| Enemies `e_` | 66 | Kit repainted flat (fill + lighter-tint outline + one accent; dark parts are knock-outs). Organic bodies rebuilt from equations: slime (superellipse), jelly (half-disc + sine tentacles), tree (rose r=cos 3.5θ), eye (lens curve), squid (sine tentacles), cluster (repeated triangles), orb/ring/shield (bands, ellipses, arcs). Polygon/disc bodies kept their silhouettes on purpose (readability, hit-size perception) and take the new treatment. |
| Bosses `boss_` | 8 | Same Kit; Mycelial Overmind rebuilt as a spiked repeated-polygon ring. Live parts in `scene.ts` (legs, limbs, joints, orbiters) use fill + lighter edge via `limb()/knob()`; all boss/elite/player/bullet/zone halos removed. |
| Player ships `pl_` | 8 | Kit repaint; the player also gets a plotted ring under it for findability. |
| Projectiles `p_`, `b_` | 42 | Re-authored in two greys (fill 0.66 / outline 1.0), no shading overlays, no alpha layers. |
| Pickups `k_`, `i_shard` | 10 | XP tiers share one rhombus; facet lines mark the tier (geometry, not colour). Icons: dark tone + hue outline (+ one accent). |
| Emblems `i_`, `r_` | 52 | Flat dark tile, hue outline, lighter-tint glyph; no `shadowBlur`. DOM icons now multiply-tint (outline survives). |
| Decor `d_` | 12 | Plotted constructions (rose, nested triangles, ring + ticks), opaque, low contrast. |
| Ground tiles | 4 | Graph paper + one plotted construction per biome: sine rows (Verdant), circles on a square grid (Foundry), hex lattice (Archive), polar grid + Fermat-spiral points (Null). Deterministic, seamless, no noise/blotches. |
| Effects | — | `soft`/`glow` are now flat discs; `pool` is a shaded region with a crisp boundary; `beam`, `slash`, `spark`, rings, glyphs flat. No halo layers remain in `scene.ts`/`effects.ts`. |

**Measured:** `art-audit.cjs` → 155 baked sprites checked, **28 use 2 colours, 127 use 3, 0 use more.**
Build, 271 unit tests, and 64/64 browser checks pass; sim cost unchanged (benchmark drawMs ≈ 1.4 ms both
before and after in the software rasterizer).

**Remaining gaps (honest)**
1. **Judged by screenshots only** — no human playtest, no real-GPU run; dense late-game readability was
   inspected in one software-rendered scene (`look-late.png`) plus the 8 boss fights.
2. **Silhouette variety is inherited.** ~45 enemy bodies are the previous polygon/disc designs re-inked;
   families that share a `look` still differ mainly by variant/accent, as before.
3. **Damage numbers are single-colour text with no outline** (rule: no dark outline). Over very bright
   zones they are less legible than before; if it bites, give numbers a flat plate shape, not an outline.
4. **Knock-out holes show the ground**, so on bright pickup/zone overlap they read as local ground colour.
5. **Minimum feature size** of the XP-gem facets (1.1 px) is below the 2 px rule at 1× — they read as a
   texture of the gem rather than lines; acceptable but a candidate for removal if gems feel busy.
6. Passive/relic emblem glyphs are still the old hand-listed shapes (re-inked, not redrawn).
