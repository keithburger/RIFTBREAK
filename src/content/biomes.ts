import type { BiomeDef } from '../sim/types';

/** Four worlds. Enemy rosters come from EnemyDef.biome; hazard kinds from sim/hazards.ts. */
export const BIOME_DEFS: BiomeDef[] = [
  {
    id: 'verdant_fracture', idx: 0, name: 'Verdant Fracture', desc: 'An overgrown crystal wilderness',
    pal: { bg: 0x0a1712, bg2: 0x11261b, line: 0x1c4a33, accent: 0x8dff4a, accent2: 0x3ad6a0 },
    bosses: ['mycelial_overmind', 'tempest_conductor'],
    hazards: [{ kind: 'vent', every: 9, a: 70, b: 9, c: 0 }, { kind: 'bramble', every: 14, a: 85, b: 0, c: 0 }],
    decor: ['d_fern', 'd_crystal', 'd_spore'],
    music: { root: 50, scale: [0, 2, 3, 7, 9], tempo: 96 },
  },
  {
    id: 'ironvault_foundry', idx: 1, name: 'Ironvault Foundry', desc: 'A dead forge that still burns',
    pal: { bg: 0x15100c, bg2: 0x231911, line: 0x4a3320, accent: 0xff8a3a, accent2: 0xffd24a },
    bosses: ['arachnoid_siege_engine', 'cinder_colossus'],
    hazards: [{ kind: 'jet', every: 7, a: 420, b: 11, c: 0 }, { kind: 'arc', every: 10, a: 75, b: 12, c: 0 }],
    decor: ['d_gear', 'd_pipe', 'd_slag'],
    music: { root: 45, scale: [0, 1, 5, 7, 8], tempo: 112 },
  },
  {
    id: 'drowned_archive', idx: 2, name: 'Drowned Archive', desc: 'A flooded library of frozen knowledge',
    pal: { bg: 0x07111e, bg2: 0x0d1c32, line: 0x1d3a66, accent: 0x4ab8ff, accent2: 0xc77dff },
    bosses: ['tidal_leviathan', 'prism_seraph'],
    hazards: [{ kind: 'whirl', every: 11, a: 120, b: 90, c: 5 }, { kind: 'geyser', every: 6, a: 70, b: 13, c: 0 }],
    decor: ['d_rune', 'd_pillar', 'd_ice'],
    music: { root: 48, scale: [0, 2, 4, 7, 11], tempo: 104 },
  },
  {
    id: 'null_expanse', idx: 3, name: 'Null Expanse', desc: 'Where the rift bleeds through',
    pal: { bg: 0x0c0717, bg2: 0x160c2a, line: 0x35205f, accent: 0x9b5cff, accent2: 0xfff3b8 },
    bosses: ['hollow_monarch', 'rift_sovereign'],
    hazards: [{ kind: 'rift', every: 8, a: 55, b: 12, c: 45 }, { kind: 'flare', every: 9, a: 100, b: 18, c: 0 }],
    decor: ['d_shard', 'd_star', 'd_obelisk'],
    music: { root: 43, scale: [0, 1, 4, 6, 10], tempo: 120 },
  },
];
