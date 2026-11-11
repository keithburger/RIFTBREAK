/**
 * 64 native enemy archetypes, 16 per biome. Each composes a movement behavior, an optional attack
 * behavior (both from sim/enemyAI.ts) and traits. tier 0-3 controls when it joins a biome's pool.
 */
import type { EnemyDef, Traits } from '../sim/types';

type Mv = EnemyDef['move'];
type At = NonNullable<EnemyDef['atk']>;
interface X { atk?: At; traits?: Partial<Traits>; group?: number }
const E = (id: string, name: string, biome: number, tier: number, hp: number, spd: number, dmg: number, r: number, xp: number, cost: number,
  look: [string, number], col: number, col2: number, move: Mv, desc: string, x: X = {}): EnemyDef =>
  ({ id, name, desc, biome, tier, hp, spd, dmg, r, xp, cost, look, col, col2, move, ...x });

export const ENEMY_DEFS: EnemyDef[] = [
  // ============================== Biome 0 — Verdant Fracture ==============================
  E('sporeling', 'Sporeling', 0, 0, 10, 95, 8, 10, 1, 1, ['slime', 0], 0x7ddc5a, 0xd8ff9a, ['chase'], 'Swarming fodder.', { group: 3 }),
  E('thornback', 'Thornback', 0, 0, 26, 70, 12, 15, 2, 2.2, ['beetle', 0], 0x4fae6a, 0xffd24a, ['charge', 0.7, 4, 0.55], 'Telegraphed straight-line charges.'),
  E('gust_wisp', 'Gust Wisp', 0, 0, 7, 150, 7, 9, 1, 1, ['wisp', 0], 0xb8ffe0, 0xffffff, ['zigzag', 0.9, 5], 'Fast, erratic, fragile.', { group: 2 }),
  E('spore_spitter', 'Spore Spitter', 0, 1, 20, 75, 9, 13, 2, 2.2, ['pod', 0], 0x9ad04a, 0xe8ff7a, ['kite', 250], 'Keeps its distance and spits.', { atk: ['shoot', 2.6, 190, 430] }),
  E('vine_lasher', 'Vine Lasher', 0, 1, 24, 120, 11, 13, 2, 2.2, ['mantis', 0], 0x3ad6a0, 0xb8ffe0, ['flank', 170, 3.2], 'Circles, then lunges.'),
  E('bloom_pod', 'Bloom Pod', 0, 1, 45, 0, 10, 18, 3, 3, ['star', 0], 0xff7ab8, 0xffd0e8, ['sentry'], 'Rooted; fires rings of seeds.', { atk: ['radial', 3.4, 8, 140, 460] }),
  E('root_crawler', 'Root Crawler', 0, 1, 36, 80, 14, 14, 3, 3, ['worm', 0], 0xa8804a, 0xffd9a0, ['burrow', 4], 'Tunnels unseen and erupts beneath you.'),
  E('briar_swarm', 'Briar Swarm', 0, 2, 12, 105, 9, 9, 1, 1, ['dart', 0], 0x5fae6a, 0xd8ff9a, ['formation'], 'Marches in tight blocks.', { group: 10 }),
  E('bark_guard', 'Bark Guard', 0, 2, 70, 60, 14, 18, 4, 4, ['shield', 0], 0x8a6a3a, 0x8dff4a, ['chase'], 'Frontal bark shrugs off 75% damage.', { traits: { front: 0.25 } }),
  E('pollen_drifter', 'Pollen Drifter', 0, 2, 40, 50, 8, 16, 3, 3, ['jelly', 0], 0xffe07a, 0xfff8c8, ['drift', 0.8], 'Its haze slows you.', { atk: ['field', 115] }),
  E('seed_bomber', 'Seed Bomber', 0, 2, 30, 70, 13, 14, 3, 3, ['tank', 0], 0x6a9a3a, 0xff8a3a, ['kite', 330], 'Lobs telegraphed seed bombs.', { atk: ['mortar', 4, 1, 62, 520] }),
  E('mantis_stalker', 'Mantis Stalker', 0, 2, 34, 140, 16, 13, 4, 3.5, ['mantis', 1], 0x2a8a5a, 0xff4a6a, ['ambush', 150, 1.5], 'Invisible until it pounces.'),
  E('hive_mother', 'Hive Mother', 0, 3, 120, 45, 12, 24, 8, 7, ['cluster', 0], 0x9a7a2a, 0xd8ff5a, ['chase'], 'Births sporelings; bursts into more.', { atk: ['summon', 5, 'sporeling', 3], traits: { splitInto: 'sporeling', splitN: 4 } }),
  E('fungal_brute', 'Fungal Brute', 0, 3, 160, 62, 20, 24, 8, 7, ['skull', 0], 0x6a8a4a, 0xc8ff5a, ['chase'], 'Enrages when wounded; dies in a toxic pool.', { traits: { enrage: 0.7, pool: 'toxin' } }),
  E('wind_dancer', 'Wind Dancer', 0, 3, 44, 130, 11, 13, 4, 4, ['wing', 0], 0xb8ffe0, 0x3ad6a0, ['orbit', 230], 'Orbits you, firing fans.', { atk: ['spread', 3, 3, 0.5, 200, 400] }),
  E('elder_treant', 'Elder Treant', 0, 3, 260, 40, 22, 30, 14, 11, ['tree', 0], 0x5a7a3a, 0xffd24a, ['chase'], 'Regenerates; rains root strikes.', { atk: ['mortar', 4.5, 3, 56, 560], traits: { regen: 0.02 } }),
  // ============================== Biome 1 — Ironvault Foundry ==============================
  E('scrap_drone', 'Scrap Drone', 1, 0, 14, 100, 9, 10, 1, 1, ['drone', 0], 0xb8a08a, 0xff8a3a, ['chase'], 'Cheap, numerous.', { group: 3 }),
  E('ram_bot', 'Ram Bot', 1, 0, 34, 75, 14, 15, 2, 2.4, ['beetle', 1], 0xc86a3a, 0xffd24a, ['charge', 0.8, 5, 0.5], 'Long, fast charges.'),
  E('buzzsaw', 'Buzzsaw', 1, 0, 22, 110, 12, 13, 2, 2, ['saw', 0], 0xd0d0d8, 0xff4a4a, ['swoop', 2.3], 'Slices straight through your position.'),
  E('gun_turret', 'Gun Turret', 1, 1, 50, 0, 10, 17, 3, 3, ['turret', 0], 0x8a8a9a, 0xffb04a, ['sentry'], 'Stationary triple-shot emplacement.', { atk: ['spread', 2.8, 3, 0.25, 230, 480] }),
  E('flame_walker', 'Flame Walker', 1, 1, 40, 85, 11, 14, 3, 3, ['spider', 0], 0xff6a2a, 0xffd24a, ['chase'], 'Leaves burning ground.', { atk: ['trail', 0.45, 22, 2.6] }),
  E('bomber_bot', 'Bomber Bot', 1, 1, 24, 125, 14, 12, 2, 2.4, ['orb', 0], 0xff4a3a, 0xffe08a, ['chase'], 'Primes and detonates beside you.', { atk: ['kamikaze', 85, 90] }),
  E('welder', 'Welder', 1, 1, 36, 115, 11, 13, 3, 3, ['crab', 0], 0xe8a04a, 0x6ad8ff, ['flank', 150, 3], 'Flanks, then sprays sparks point-blank.', { atk: ['spread', 3.2, 5, 1.0, 170, 230] }),
  E('shield_generator', 'Shield Generator', 1, 2, 60, 70, 8, 15, 5, 4.5, ['hex', 0], 0x4ab8e8, 0xb8f0ff, ['kite', 300], 'Projects barriers onto allies.', { atk: ['shield', 5, 190, 0.6] }),
  E('tesla_node', 'Tesla Node', 1, 2, 55, 0, 14, 16, 4, 4, ['crystal', 0], 0xffe94a, 0xffffff, ['sentry'], 'Charges a telegraphed lance.', { atk: ['beam', 4.5, 520, 1.0] }),
  E('mortar_tank', 'Mortar Tank', 1, 2, 90, 45, 15, 20, 5, 5, ['tank', 1], 0x7a6a5a, 0xff8a3a, ['kite', 360], 'Triple mortar barrages.', { atk: ['mortar', 4.5, 3, 58, 560] }),
  E('phalanx_unit', 'Phalanx Unit', 1, 2, 30, 80, 12, 12, 2, 1.6, ['shield', 1], 0x9a9aa8, 0xffd24a, ['formation'], 'Shielded marching line.', { traits: { front: 0.3 }, group: 8 }),
  E('repair_drone', 'Repair Drone', 1, 2, 36, 95, 6, 12, 4, 4, ['ring', 0], 0x6dff9c, 0xd0ffe0, ['kite', 340], 'Heals nearby machines.', { atk: ['heal', 3.5, 190, 0.3] }),
  E('magnet_core', 'Magnet Core', 1, 3, 100, 55, 14, 19, 6, 6, ['gear', 0], 0xc84a6a, 0x6ad8ff, ['chase'], 'Drags you toward it.', { atk: ['pull', 6, 270, 120, 2.2] }),
  E('overclocker', 'Overclocker', 1, 3, 70, 80, 10, 15, 6, 5.5, ['eye', 0], 0xffb040, 0xfff0c0, ['kite', 280], 'Hastes every ally around it.', { atk: ['buff', 4, 220] }),
  E('piston_leaper', 'Piston Leaper', 1, 3, 80, 70, 18, 17, 6, 6, ['knight', 0], 0xa87a5a, 0xff6a2a, ['leap', 3.6, 400], 'Leaps onto your position.'),
  E('forge_golem', 'Forge Golem', 1, 3, 300, 42, 24, 30, 15, 12, ['skull', 1], 0x8a4a2a, 0xffa03a, ['chase'], 'Armored; slams; explodes into slag.', { atk: ['slam', 4, 120, 170], traits: { armor: 3, burst: 10 } }),
  // ============================== Biome 2 — Drowned Archive ==============================
  E('drip_slime', 'Drip Slime', 2, 0, 30, 80, 10, 14, 2, 2, ['slime', 1], 0x4a9aff, 0xb8e0ff, ['chase'], 'Splits in two when slain.', { traits: { splitInto: 'slimelet', splitN: 2 } }),
  E('slimelet', 'Slimelet', 2, 0, 8, 125, 7, 8, 1, 0.8, ['slime', 2], 0x7ac8ff, 0xe0f4ff, ['chase'], 'Tiny and quick.', { group: 5 }),
  E('frost_wisp', 'Frost Wisp', 2, 0, 12, 140, 8, 9, 1, 1.2, ['wisp', 1], 0x8fe4ff, 0xffffff, ['zigzag', 1.0, 4.5], 'Its touch chills you.', { traits: { chill: 1 }, group: 2 }),
  E('ink_squid', 'Ink Squid', 2, 1, 34, 85, 10, 14, 3, 3, ['squid', 0], 0x5a4ac8, 0xc8a8ff, ['kite', 270], 'Five-shot ink fans.', { atk: ['spread', 3, 5, 0.8, 180, 420] }),
  E('tide_crab', 'Tide Crab', 2, 1, 60, 95, 13, 16, 3, 3.2, ['crab', 1], 0x3a8ac8, 0xffb86a, ['flank', 140, 2.8], 'Shelled front; scuttles around you.', { traits: { front: 0.3 } }),
  E('ice_lancer', 'Ice Lancer', 2, 1, 40, 80, 15, 14, 3, 3, ['dart', 1], 0xa8e8ff, 0x4a7aff, ['charge', 0.7, 5, 0.55], 'Charges, leaving frozen ground.', { atk: ['trail', 0.35, 20, 2.5] }),
  E('current_eel', 'Current Eel', 2, 1, 28, 120, 12, 12, 2, 2.4, ['worm', 1], 0x3ad6d6, 0xffe94a, ['swoop', 2.6], 'Darts through in straight passes.'),
  E('tome_mimic', 'Tome Mimic', 2, 2, 55, 150, 17, 14, 5, 4, ['book', 0], 0x8a5ac8, 0xffd24a, ['ambush', 130, 1.5], 'Lies unseen until you pass.'),
  E('rune_caster', 'Rune Caster', 2, 2, 44, 60, 11, 14, 4, 4, ['eye', 1], 0xc77dff, 0xffe0ff, ['blink', 3.5, 220], 'Teleports, then casts rings.', { atk: ['radial', 3.5, 10, 150, 420] }),
  E('bubble_mage', 'Bubble Mage', 2, 2, 40, 70, 12, 14, 4, 4, ['jelly', 1], 0x6ad8ff, 0xffffff, ['kite', 300], 'Slow homing bubbles.', { atk: ['homing', 3.4, 115] }),
  E('scribe_swarm', 'Scribe Swarm', 2, 2, 14, 110, 9, 9, 1, 1, ['hex', 1], 0x9a8ae8, 0xe0d8ff, ['formation'], 'Flying pages in formation.', { group: 10 }),
  E('archive_sentinel', 'Archive Sentinel', 2, 2, 80, 0, 14, 19, 5, 5, ['turret', 1], 0x4a6ac8, 0xc77dff, ['sentry'], 'Sweeps a slow rotating beam.', { atk: ['sweepbeam', 6.5, 380] }),
  E('whirl_spirit', 'Whirl Spirit', 2, 3, 70, 100, 12, 15, 5, 5, ['ring', 1], 0x4ab8ff, 0xb8ffe0, ['orbit', 200], 'Orbits and drags you in.', { atk: ['pull', 5.5, 240, 120, 2] }),
  E('mirror_shade', 'Mirror Shade', 2, 3, 60, 135, 15, 13, 5, 5, ['hound', 0], 0xb8c8e8, 0xffffff, ['intercept', 0.9], 'Predicts your path; phases out of reach.', { traits: { phase: 4 } }),
  E('glacier_hulk', 'Glacier Hulk', 2, 3, 280, 45, 22, 28, 13, 11, ['crystal', 1], 0x8fd0ff, 0xffffff, ['chase'], 'Regenerating wall of ice with a chilling aura.', { atk: ['field', 130], traits: { regen: 0.015 } }),
  E('depth_horror', 'Depth Horror', 2, 3, 240, 55, 20, 27, 14, 12, ['squid', 1], 0x2a3a8a, 0xff4a8a, ['chase'], 'Spawns slimelets; enrages when hurt.', { atk: ['summon', 5, 'slimelet', 4], traits: { enrage: 0.6 } }),
  // ============================== Biome 3 — Null Expanse ==============================
  E('null_mote', 'Null Mote', 3, 0, 16, 105, 10, 9, 1, 1, ['orb', 1], 0x9b5cff, 0xe0d0ff, ['blink', 4, 120], 'Blinks toward you in bursts.', { group: 3 }),
  E('star_shard', 'Star Shard', 3, 0, 14, 170, 10, 9, 1, 1.2, ['star', 1], 0xfff3b8, 0xffffff, ['formation'], 'Very fast volleys of living shards.', { group: 6 }),
  E('void_leech', 'Void Leech', 3, 0, 30, 135, 9, 11, 2, 2, ['worm', 2], 0x6a2ac8, 0xff5ac8, ['chase'], 'Heals itself when it bites.', { traits: { drain: 1 } }),
  E('rift_stalker', 'Rift Stalker', 3, 1, 44, 90, 16, 13, 3, 3.4, ['mantis', 2], 0x7a3ae8, 0xfff3b8, ['blink', 3, 150], 'Blinks beside you and slams.', { atk: ['slam', 3.2, 85, 140] }),
  E('gaze_orb', 'Gaze Orb', 3, 1, 50, 60, 14, 15, 4, 4, ['eye', 2], 0xe8d8ff, 0xff4ad0, ['kite', 320], 'Charges a long lance of light.', { atk: ['beam', 4, 540, 0.9] }),
  E('nova_bomber', 'Nova Bomber', 3, 1, 30, 120, 15, 13, 3, 3, ['orb', 2], 0xffd24a, 0xffffff, ['intercept', 0.6], 'Cuts you off and detonates into a ring.', { atk: ['kamikaze', 90, 100], traits: { burst: 8 } }),
  E('prism_guard', 'Prism Guard', 3, 1, 80, 65, 13, 17, 4, 4.4, ['shield', 2], 0xc8b8ff, 0xfff3b8, ['chase'], 'Frontal prism; fires back when struck.', { traits: { front: 0.25, retaliate: 1.5 } }),
  E('phase_hound', 'Phase Hound', 3, 2, 50, 150, 14, 12, 4, 4, ['hound', 1], 0x8a5cff, 0xffffff, ['intercept', 0.8], 'Fast; flickers out of phase.', { traits: { phase: 3.5 } }),
  E('entropy_weaver', 'Entropy Weaver', 3, 2, 70, 75, 8, 15, 6, 5.5, ['cluster', 1], 0xff5ac8, 0xffd0f0, ['kite', 330], 'Wards allies: they take 80% less damage.', { atk: ['ward', 230] }),
  E('light_archon', 'Light Archon', 3, 2, 70, 70, 12, 16, 5, 5, ['wing', 1], 0xfff3b8, 0xffb86a, ['kite', 290], 'Spiralling streams of light.', { atk: ['spiral', 4.5, 3, 150] }),
  E('shadow_twin', 'Shadow Twin', 3, 2, 90, 100, 14, 14, 5, 5, ['skull', 2], 0x5a3a9a, 0xb89aff, ['flank', 160, 3], 'Splits into two at half health.', { traits: { splitHalf: 1 } }),
  E('chrono_wraith', 'Chrono Wraith', 3, 2, 55, 80, 12, 14, 5, 5, ['wisp', 2], 0x6ad8ff, 0xc8b8ff, ['blink', 3.2, 190], 'Blinks about, dragging a slowing field.', { atk: ['field', 120] }),
  E('gravity_warden', 'Gravity Warden', 3, 3, 150, 55, 18, 21, 8, 8, ['gear', 1], 0x7a4ae8, 0xfff3b8, ['chase'], 'A powerful, long pull.', { atk: ['pull', 5, 280, 140, 2.4] }),
  E('obelisk', 'Null Obelisk', 3, 3, 120, 0, 14, 20, 7, 7, ['crystal', 2], 0x4a2a8a, 0xff5ac8, ['sentry'], 'Seeds lingering void mines around you.', { atk: ['mines', 5, 4, 44] }),
  E('void_maw', 'Void Maw', 3, 3, 110, 85, 20, 19, 8, 8, ['jelly', 2], 0x3a1a6a, 0xc85aff, ['burrow', 3.5], 'Surfaces beneath you from the void.'),
  E('abyss_knight', 'Abyss Knight', 3, 3, 340, 60, 26, 28, 16, 13, ['knight', 1], 0x2a1a4a, 0x9b5cff, ['leap', 4, 420], 'Shielded; leaps; summons motes.', { atk: ['summon', 7, 'null_mote', 3], traits: { front: 0.4 } }),
];
