/**
 * Synthesized SFX recipes. These are the permanent FALLBACK for every sound: a sample from
 * public/audio/sfx/ replaces a recipe only once it has loaded and decoded; until then (or if the
 * file is absent) the recipe plays. Keep a recipe for every sound name the game can emit.
 */
export type Wave = OscillatorType | 'noise';
export interface Sfx { w: Wave; f: number; f2?: number; d: number; v: number; gap?: number; lp?: number }

export const SYNTH: Record<string, Sfx | Sfx[]> = {
  kill: { w: 'triangle', f: 320, f2: 90, d: 0.09, v: 0.12, gap: 0.04 },
  elite_die: [{ w: 'sawtooth', f: 200, f2: 40, d: 0.4, v: 0.25 }, { w: 'noise', f: 800, d: 0.3, v: 0.2 }],
  hurt: [{ w: 'square', f: 180, f2: 60, d: 0.2, v: 0.3 }, { w: 'noise', f: 500, d: 0.12, v: 0.25 }],
  xp: { w: 'sine', f: 880, f2: 1320, d: 0.05, v: 0.06, gap: 0.03 },
  dash: { w: 'noise', f: 2400, f2: 600, d: 0.16, v: 0.18 },
  boom: [{ w: 'noise', f: 500, f2: 80, d: 0.28, v: 0.22, gap: 0.06 }, { w: 'sine', f: 110, f2: 40, d: 0.25, v: 0.25 }],
  bigboom: [{ w: 'noise', f: 700, f2: 50, d: 0.7, v: 0.4 }, { w: 'sine', f: 90, f2: 28, d: 0.6, v: 0.45 }],
  react: { w: 'triangle', f: 520, f2: 1040, d: 0.1, v: 0.09, gap: 0.06 },
  zap: { w: 'sawtooth', f: 1400, f2: 300, d: 0.07, v: 0.07, gap: 0.05 },
  beam: { w: 'sawtooth', f: 240, f2: 480, d: 0.3, v: 0.1, gap: 0.1 },
  ray: { w: 'sine', f: 1500, f2: 700, d: 0.12, v: 0.1, gap: 0.06 },
  strike: [{ w: 'noise', f: 3000, f2: 300, d: 0.14, v: 0.14, gap: 0.06 }],
  slash: { w: 'noise', f: 3500, f2: 900, d: 0.09, v: 0.12, gap: 0.05 },
  whip: { w: 'noise', f: 4000, f2: 1200, d: 0.07, v: 0.12, gap: 0.05 },
  rend: { w: 'sawtooth', f: 900, f2: 200, d: 0.08, v: 0.08, gap: 0.05 },
  nova: [{ w: 'sine', f: 160, f2: 60, d: 0.3, v: 0.22 }, { w: 'noise', f: 1200, f2: 200, d: 0.25, v: 0.12 }],
  lob: { w: 'sine', f: 300, f2: 500, d: 0.12, v: 0.08, gap: 0.08 },
  drop: { w: 'square', f: 400, f2: 300, d: 0.06, v: 0.07 },
  flame: { w: 'noise', f: 900, f2: 500, d: 0.18, v: 0.06, gap: 0.12 },
  quake: [{ w: 'sine', f: 80, f2: 35, d: 0.35, v: 0.3, gap: 0.1 }],
  well: { w: 'sine', f: 120, f2: 50, d: 0.5, v: 0.2, gap: 0.2 },
  wind: { w: 'noise', f: 600, f2: 1800, d: 0.5, v: 0.1, gap: 0.3 },
  wave: { w: 'noise', f: 400, f2: 1200, d: 0.5, v: 0.14 },
  curse: { w: 'sine', f: 220, f2: 110, d: 0.3, v: 0.1, gap: 0.15 },
  eshot: { w: 'square', f: 260, f2: 180, d: 0.06, v: 0.05, gap: 0.07 },
  mortar: { w: 'sine', f: 500, f2: 150, d: 0.3, v: 0.08, gap: 0.1 },
  charge: { w: 'sawtooth', f: 120, f2: 600, d: 0.5, v: 0.12, gap: 0.2 },
  beep: { w: 'square', f: 1200, d: 0.08, v: 0.08, gap: 0.1 },
  reveal: { w: 'sawtooth', f: 700, f2: 250, d: 0.18, v: 0.12 },
  blink: { w: 'sine', f: 1600, f2: 400, d: 0.14, v: 0.12 },
  block: { w: 'triangle', f: 900, f2: 1400, d: 0.15, v: 0.2 },
  heal: [{ w: 'sine', f: 520, f2: 780, d: 0.18, v: 0.14 }],
  magnet: { w: 'sine', f: 300, f2: 1200, d: 0.4, v: 0.14 },
  shard: { w: 'triangle', f: 1300, f2: 1900, d: 0.07, v: 0.08, gap: 0.04 },
  chest: [{ w: 'triangle', f: 660, d: 0.12, v: 0.18 }, { w: 'triangle', f: 990, d: 0.3, v: 0.18 }],
  relic: [{ w: 'sine', f: 440, f2: 880, d: 0.4, v: 0.2 }, { w: 'triangle', f: 1320, d: 0.4, v: 0.1 }],
  levelup: [{ w: 'triangle', f: 523, d: 0.1, v: 0.2 }, { w: 'triangle', f: 784, d: 0.3, v: 0.2 }],
  evolve: [{ w: 'sawtooth', f: 220, f2: 880, d: 0.6, v: 0.2 }, { w: 'sine', f: 1320, d: 0.6, v: 0.12 }],
  select: { w: 'triangle', f: 700, f2: 1000, d: 0.07, v: 0.14 },
  click: { w: 'square', f: 500, d: 0.03, v: 0.08 },
  elite: { w: 'sawtooth', f: 150, f2: 300, d: 0.4, v: 0.16 },
  event: [{ w: 'triangle', f: 392, d: 0.12, v: 0.16 }, { w: 'triangle', f: 587, d: 0.25, v: 0.16 }],
  biome: [{ w: 'sine', f: 196, f2: 392, d: 0.9, v: 0.22 }],
  boss_intro: [{ w: 'sawtooth', f: 55, f2: 110, d: 1.4, v: 0.35 }, { w: 'noise', f: 300, f2: 1500, d: 1.2, v: 0.15 }],
  boss_phase: [{ w: 'sawtooth', f: 300, f2: 60, d: 0.8, v: 0.3 }, { w: 'noise', f: 2000, f2: 200, d: 0.6, v: 0.2 }],
  boss_break: [{ w: 'noise', f: 3000, f2: 100, d: 1.0, v: 0.3 }],
  boss_die: [{ w: 'noise', f: 1500, f2: 40, d: 1.6, v: 0.45 }, { w: 'sine', f: 120, f2: 25, d: 1.5, v: 0.45 }],
  ray_charge: [{ w: 'sawtooth', f: 80, f2: 900, d: 1.6, v: 0.22 }],
  ray_fire: [{ w: 'sawtooth', f: 900, f2: 120, d: 1.2, v: 0.3 }, { w: 'noise', f: 4000, f2: 600, d: 1.2, v: 0.2 }],
  revive: [{ w: 'sine', f: 330, f2: 990, d: 0.7, v: 0.3 }],
  defeat: [{ w: 'sawtooth', f: 220, f2: 40, d: 1.4, v: 0.3 }],
  victory: [{ w: 'triangle', f: 523, d: 0.2, v: 0.25 }, { w: 'triangle', f: 659, d: 0.4, v: 0.25 }, { w: 'triangle', f: 1046, d: 0.9, v: 0.2 }],
};
export const SHOT: Record<string, number> = { fire: 420, frost: 900, shock: 1300, toxin: 300, water: 520, wind: 1100, earth: 180, arcane: 760, light: 1500, void: 240 };


/** Recipes whose layers are played as a short arpeggio rather than simultaneously. */
export const STAGGER = new Set(['victory', 'levelup', 'chest', 'event']);

export const heartbeat: Sfx[] = [{ w: 'sine', f: 78, f2: 42, d: 0.17, v: 0.4 }];
SYNTH.heartbeat = heartbeat;

/** Recipe for a sound name, including the per-element `shot_<element>` family. */
export function recipe(name: string): Sfx | Sfx[] | undefined {
  const r = SYNTH[name];
  if (r) return r;
  if (name.startsWith('shot_')) {
    const f = SHOT[name.slice(5)] ?? 600;
    return { w: 'triangle', f, f2: f * 0.5, d: 0.07, v: 0.07, gap: 0.06 };
  }
  return undefined;
}

/**
 * Schedules one synth layer. Returns the source node so a caller can stop it early (voice stealing).
 * `noise` is a shared white-noise buffer; `rnd` supplies the noise start offset.
 */
export function synthVoice(ctx: BaseAudioContext, noise: AudioBuffer | null, s: Sfx, when: number, out: AudioNode, pitch = 1): AudioScheduledSourceNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(s.v, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + s.d);
  if (s.w === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(s.f * pitch, when);
    if (s.f2) f.frequency.exponentialRampToValueAtTime(s.f2 * pitch, when + s.d);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(when, Math.random()); src.stop(when + s.d + 0.02);
    return src;
  }
  const o = ctx.createOscillator();
  o.type = s.w;
  o.frequency.setValueAtTime(s.f * pitch, when);
  if (s.f2) o.frequency.exponentialRampToValueAtTime(s.f2 * pitch, when + s.d);
  if (s.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s.lp; o.connect(f); f.connect(g); } else o.connect(g);
  g.connect(out);
  o.start(when); o.stop(when + s.d + 0.02);
  return o;
}

export function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = ctx.sampleRate;
  const b = ctx.createBuffer(1, len, len);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
