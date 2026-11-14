/**
 * Mix metadata for every sound the game can emit. This is data, not code: bus routing, priority
 * (who gets stolen first when the voice budget is full), polyphony, throttle, ducking and an
 * optional synth "sub" layer that is stacked under a sampled hit for weight.
 *
 * Asset convention (see docs/AUDIO.md): drop `public/audio/sfx/<name>.mp3` (or `<name>_1.mp3`,
 * `<name>_2.mp3` … for random variants) and run `npm run audio:index`. No code change is needed;
 * a name with no file keeps playing its synthesized recipe from synth.ts.
 */

export type Bus = 'weapon' | 'player' | 'enemy' | 'boss' | 'pickup' | 'upgrade' | 'ui' | 'world';

export interface SfxMeta {
  bus: Bus;
  /** 0 ambient (first to be dropped) … 3 critical (never stolen by lower priorities). */
  prio: 0 | 1 | 2 | 3;
  /** Max simultaneous instances of this name. */
  voices: number;
  /** Minimum seconds between two starts of this name (overrides the recipe's own gap). */
  gap?: number;
  /** Per-sound trim applied to a sample, 0..2. */
  vol?: number;
  /** Random pitch spread, ± fraction (0.06 = ±6 %). */
  pitch?: number;
  /** Pan and attenuate by world position when x/y are supplied. */
  spatial?: boolean;
  /** Briefly lower the music: gain multiplier and hold time in seconds. */
  duck?: { amt: number; hold: number };
  /** Synth recipe stacked under the sample (weight/sub-bass). Not played when only the recipe plays. */
  sub?: string;
}

/** Per-bus trim so loudness is balanced without re-exporting assets. */
export const BUS_TRIM: Record<Bus, number> = { weapon: 0.85, player: 1, enemy: 0.7, boss: 1.1, pickup: 0.6, upgrade: 1, ui: 0.8, world: 0.9 };

/** Hard ceiling on simultaneous sound-effect voices (Web Audio nodes are the real cost). */
export const MAX_VOICES = 28;

const M = (bus: Bus, prio: SfxMeta['prio'], voices: number, extra: Partial<SfxMeta> = {}): SfxMeta => ({ bus, prio, voices, ...extra });
const W = (voices = 3, extra: Partial<SfxMeta> = {}): SfxMeta => M('weapon', 1, voices, { spatial: true, pitch: 0.06, ...extra });
const E = (voices = 3, extra: Partial<SfxMeta> = {}): SfxMeta => M('enemy', 0, voices, { spatial: true, pitch: 0.08, ...extra });
const BOSS = (voices = 1, extra: Partial<SfxMeta> = {}): SfxMeta => M('boss', 3, voices, { pitch: 0.02, ...extra });

export const META: Record<string, SfxMeta> = {
  // --- weapons: one distinct voice per delivery shape -------------------------------------------
  slash: W(3), whip: W(3), rend: W(3), strike: W(3), zap: W(4), beam: W(2), ray: W(2),
  lob: W(3), drop: W(3), flame: W(2), nova: W(2, { prio: 2, sub: 'bigboom' }), quake: W(2, { prio: 2 }),
  well: W(2), wind: W(2), wave: W(2, { prio: 2 }), curse: W(2), react: W(4, { prio: 1 }),
  boom: W(4, { prio: 2, sub: 'quake', duck: { amt: 0.8, hold: 0.1 } }),
  bigboom: W(2, { prio: 3, sub: 'quake', duck: { amt: 0.55, hold: 0.45 } }),
  // --- enemies ---------------------------------------------------------------------------------
  kill: E(5, { gap: 0.04 }), elite_die: M('enemy', 2, 2, { spatial: true, sub: 'quake', duck: { amt: 0.75, hold: 0.25 } }),
  eshot: E(4), mortar: E(2, { prio: 1 }), charge: E(2, { prio: 1 }), beep: E(2, { prio: 1 }),
  reveal: E(2, { prio: 1 }), blink: E(2, { prio: 1 }), block: E(3, { prio: 1 }), elite: M('enemy', 2, 1, { duck: { amt: 0.8, hold: 0.3 } }),
  // --- player ----------------------------------------------------------------------------------
  hurt: M('player', 3, 2, { pitch: 0.04, duck: { amt: 0.7, hold: 0.2 } }),
  dash: M('player', 2, 2, { pitch: 0.05 }), heal: M('player', 2, 2), heartbeat: M('player', 2, 1, { pitch: 0.01, gap: 0.2 }),
  revive: M('player', 3, 1, { duck: { amt: 0.4, hold: 1.0 } }),
  defeat: M('player', 3, 1, { duck: { amt: 0.25, hold: 2.0 } }), victory: M('player', 3, 1, { duck: { amt: 0.3, hold: 2.0 } }),
  // --- pickups / upgrades ----------------------------------------------------------------------
  xp: M('pickup', 0, 4, { pitch: 0.12 }), shard: M('pickup', 0, 4, { pitch: 0.1 }), magnet: M('pickup', 1, 1),
  chest: M('pickup', 2, 1, { duck: { amt: 0.7, hold: 0.4 } }),
  relic: M('upgrade', 3, 1, { duck: { amt: 0.5, hold: 0.8 } }), levelup: M('upgrade', 3, 1, { duck: { amt: 0.5, hold: 0.6 } }),
  evolve: M('upgrade', 3, 1, { duck: { amt: 0.4, hold: 1.0 }, sub: 'bigboom' }),
  // --- UI --------------------------------------------------------------------------------------
  select: M('ui', 2, 2, { pitch: 0.02 }), click: M('ui', 2, 3, { pitch: 0.02, gap: 0.02 }),
  // --- world / bosses --------------------------------------------------------------------------
  event: M('world', 2, 1, { duck: { amt: 0.75, hold: 0.4 } }), biome: M('world', 3, 1, { duck: { amt: 0.5, hold: 1.2 } }),
  boss_intro: BOSS(1, { duck: { amt: 0.3, hold: 1.6 }, sub: 'quake' }),
  boss_phase: BOSS(1, { duck: { amt: 0.4, hold: 0.9 }, sub: 'bigboom' }),
  boss_break: BOSS(1, { duck: { amt: 0.5, hold: 1.0 } }),
  boss_die: BOSS(1, { duck: { amt: 0.25, hold: 2.2 }, sub: 'bigboom' }),
  ray_charge: BOSS(2, { duck: { amt: 0.6, hold: 1.7 } }),
  ray_fire: BOSS(2, { duck: { amt: 0.45, hold: 1.3 }, sub: 'quake' }),
};

/** `shot_<element>`: the auto-fire of every projectile weapon. Very frequent, so lowest priority. */
export const SHOT_META: SfxMeta = M('weapon', 0, 4, { spatial: true, pitch: 0.1, gap: 0.05 });

export function metaOf(name: string): SfxMeta | undefined {
  return META[name] ?? (name.startsWith('shot_') ? SHOT_META : undefined);
}

// --- music --------------------------------------------------------------------------------------

/**
 * Sample music is discovered the same way: `public/audio/music/<track>.mp3` is a single loop;
 * `<track>_1.mp3`, `<track>_2.mp3`, `<track>_3.mp3` are stems that start together and fade in with
 * intensity (stem 1 always, stem 2 from intensity 1, stem 3 from intensity 2). Stems of one track
 * must have identical length and tempo. Track ids:
 *   menu · <biome id> · <boss id> · boss (generic boss theme, used when a boss has no own track)
 */
export const MUSIC_FADE = 2.2;
/** A new track waits at most this long for the current bar to end before crossfading. */
export const MUSIC_MAX_WAIT = 3;
/** Decoded stems of at most this many tracks are kept in memory (menu + current). */
export const MUSIC_KEEP = 2;

/**
 * Tempo of each sampled track, used to quantize crossfades to its bar lines. Must match
 * scripts/audio/catalog.json (tests/audio-catalog.test.ts). Tracks not listed use the biome tempo.
 */
export const MUSIC_BPM: Record<string, number> = {
  menu: 84, verdant_fracture: 96, ironvault_foundry: 112, drowned_archive: 104, null_expanse: 120, boss: 124,
  mycelial_overmind: 100, tempest_conductor: 132, arachnoid_siege_engine: 118, cinder_colossus: 108,
  tidal_leviathan: 90, prism_seraph: 128, hollow_monarch: 110, rift_sovereign: 140,
};
