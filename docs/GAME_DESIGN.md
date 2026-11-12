# Game design

## Loop
Menu → class + mode → run → (move, dash, auto-attack → XP → pick 1 of 3 permanent upgrades) →
elites / encounters / hazards → boss → next biome → … → victory or defeat → shards → Armory unlocks.

**Standard run:** 4 biomes × 300 s field phase + boss ≈ 22–27 min. Each biome has two possible
bosses chosen by seed parity, so all eight appear across runs; Boss Rush plays all eight in a row.

## Player
100 HP, 215 px/s, dash (0.17 s, i-frames, 2.4 s recharge), 0.25 HP/s regen, +5 % max HP per level.
6 weapon slots, 6 passive slots, unlimited relics. 28 stats (`Stats` in `sim/types.ts`).

## Weapons — 40 base, 4 per element
5 ranks each. At max rank a weapon can **evolve** down one of two paths, each requiring a specific
passive. Two max-rank weapons of a designated pair can **fuse** (20 fusions; every weapon belongs to
exactly one); the fusion replaces both, frees a slot, and alternates two elements so it triggers
its own reaction.

| Element | Weapons |
|---|---|
| Fire | Ember Carbine · Magma Mortar · Flame Jet · Sunflare |
| Frost | Frost Shards · Rime Halo · Cryo Mines · Winter Lance |
| Shock | Arc Coil · Tesla Drone · Thunderstrike · Volt Whip |
| Toxin | Venom Spitter · Spore Cloud · Caustic Wake · Parasite Swarm |
| Water | Tidal Wave · Bubble Trap · Geyser · Rain Caller |
| Wind | Gale Blades · Twister · Zephyr Edge · Slipstream |
| Earth | Boulder Ring · Seismic Slam · Crystal Spires · Rail Boulder |
| Arcane | Arcane Missiles · Arcane Sentry · Runic Sweep · Singularity Seed |
| Light | Prism Ray · Radiant Chakram · Judgment Sigil · Dawn Lancer |
| Void | Null Sphere · Echo Shade · Entropy Field · Phase Rend |

Behaviors (26 kinds): aimed/homing/bouncing/returning/lobbed projectiles, cones, novas, orbiters,
mines, beams, sweeps, chain lightning, drones, delayed strikes, whips, auras, movement trails,
fissures, spires, turrets, gravity wells, refracting rays, stride- and dash-triggered attacks,
autonomous shades, curses, instant rends, roaming tornadoes, melee arcs, rain.

## Elements and reactions
A hit marks an enemy with its element for 6 s. A hit of a *different* element consumes the mark
and triggers that pair's reaction (45 pairs, all defined; see the Codex in-game or
`content/elements.ts`). Effects are composed from: burst, status, zone, chain, pull, knock, spread,
shards, execute, heal, surge, max-HP damage. Safeguards: reaction damage never marks or reacts,
0.5 s per-enemy cooldown, 30 reactions per step.

Statuses: burn, poison (stacking), slow, freeze, stun, vulnerable, weakened. Bosses and champions
resist hard crowd control.

## Enemies — 64 archetypes, 16 per biome
Each = movement (15 behaviors) + optional attack (19) + traits (14). Signatures are unique within a
biome. Tiers 0–3 join the spawn pool at 0 / 50 / 125 / 205 s. Elites (×7 HP) and champions (×22 HP)
drop relic chests.

## Bosses
| Biome | Boss | Identity |
|---|---|---|
| Verdant Fracture | Mycelial Overmind | rooted core: root lines, spore clouds, broods, blooms |
| | Tempest Conductor | aerial duelist: dives, lightning grids, cross-bolts, closing cage |
| Ironvault Foundry | Arachnoid Siege Engine | 8-leg procedural walker: leg slams, cannons, telegraphed death ray |
| | Cinder Colossus | gap-ring shockwaves, lava-leaving meteors, spoke eruptions, charge |
| Drowned Archive | Tidal Leviathan | 11-segment serpent: lunges, whirlpool, tidal walls, constrict |
| | Prism Seraph | laser lattices, rotating beam rotor, spirals, blink volleys |
| Null Expanse | Hollow Monarch | blink slashes, collapsing orb rings, gravity, parallel rifts |
| | Rift Sovereign | cycles fire/frost/storm/void aspects, twin beams, shrinking arena |

All have 3 phases (66 % / 33 %), a 1.3 s invulnerable transition, a 2.6 s death sequence and drop a
relic chest, XP shower, heal and shards.

## Biomes
| Biome | Hazards |
|---|---|
| Verdant Fracture | toxic vents · slowing brambles |
| Ironvault Foundry | flame jets · electrified plates |
| Drowned Archive | whirlpools · frost geysers |
| Null Expanse | drifting rifts · light flares |

Hazards are telegraphed ≥ 1.1 s and (except jets) hurt enemies too.

## Build pieces
- **Classes (8):** Vanguard, Pyre Warden, Stormcaller (free); Geomancer, Voidwalker, Alchemist,
  Dawnblade, Windrunner (150–300 shards). Each has a starting weapon, stat profile and hook trait.
- **Passives (24):** rank 2–5 stat upgrades; 16 of them gate evolutions.
- **Relics (26):** 3 rarities; stat trade-offs or hook-driven behaviors (echo fire, kill frenzy,
  reaction echo, execute, time dilation, …). From elite/boss chests and events.
- **Encounters (12):** Elite Ambush, Swarm Rush, Encirclement, Rift Surge, Shard Courier, Shrine of
  Power, Meteor Storm, Cursed Altar, Supply Drop, Champion, Elemental Storm, Rift Tide.
- **Modes (7):** Rift Run, Endless, Boss Rush, and challenges Glass Cannon, Infestation, Twin Oath,
  Rift Sprint.
- **Meta (10):** permanent Armory upgrades bought with shards.

## Difficulty curve (`director.ts: difficulty()`, T = minutes)
enemy HP × (1 + 0.2T + 0.07T²) · damage × (1 + 0.045T) · speed × min(1.3, 1 + 0.01T) ·
boss HP × (1 + 0.5T + 0.3T²). Spawn budget and population cap rise with time (cap ≤ 520).
