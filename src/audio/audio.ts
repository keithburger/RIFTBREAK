/** Self-contained synthesized audio: SFX recipes + a small generative music sequencer. Never blocks gameplay. */
type Wave = OscillatorType | 'noise';
interface Sfx { w: Wave; f: number; f2?: number; d: number; v: number; gap?: number; lp?: number }

const S: Record<string, Sfx | Sfx[]> = {
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
const SHOT: Record<string, number> = { fire: 420, frost: 900, shock: 1300, toxin: 300, water: 520, wind: 1100, earth: 180, arcane: 760, light: 1500, void: 240 };

export class AudioSys {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private vol = { master: 0.8, sfx: 0.8, music: 0.5 };
  private music = { root: 50, scale: [0, 2, 3, 7, 9], tempo: 100, intensity: 0, on: false, step: 0, next: 0 };
  private timer = 0;

  /** Must be called from a user gesture. Safe to call repeatedly; failures leave audio disabled. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        const comp = this.ctx.createDynamicsCompressor();
        this.sfxGain.connect(this.master); this.musicGain.connect(this.master);
        this.master.connect(comp); comp.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, len);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.setVolumes(this.vol.master, this.vol.sfx, this.vol.music);
        this.timer = window.setInterval(() => this.tick(), 60);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.vol = { master, sfx, music };
    if (!this.ctx) return;
    this.master.gain.value = master; this.sfxGain.gain.value = sfx; this.musicGain.gain.value = music * 0.6;
  }

  private voice(s: Sfx, when: number, out: GainNode, pitch = 1): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(s.v, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + s.d);
    if (s.w === 'noise') {
      const src = c.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(s.f * pitch, when);
      if (s.f2) f.frequency.exponentialRampToValueAtTime(s.f2 * pitch, when + s.d);
      src.connect(f); f.connect(g); g.connect(out);
      src.start(when, Math.random()); src.stop(when + s.d + 0.02);
    } else {
      const o = c.createOscillator();
      o.type = s.w;
      o.frequency.setValueAtTime(s.f * pitch, when);
      if (s.f2) o.frequency.exponentialRampToValueAtTime(s.f2 * pitch, when + s.d);
      if (s.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s.lp; o.connect(f); f.connect(g); } else o.connect(g);
      g.connect(out);
      o.start(when); o.stop(when + s.d + 0.02);
    }
  }

  play(name: string): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.vol.sfx <= 0) return;
    let def: Sfx | Sfx[] | undefined = S[name];
    if (!def && name.startsWith('shot_')) def = { w: 'triangle', f: SHOT[name.slice(5)] ?? 600, f2: (SHOT[name.slice(5)] ?? 600) * 0.5, d: 0.07, v: 0.07, gap: 0.06 };
    if (!def) return;
    const now = c.currentTime;
    const first = Array.isArray(def) ? def[0] : def;
    const lastT = this.last.get(name) ?? -1;
    if (now - lastT < (first.gap ?? 0.03)) return;
    this.last.set(name, now);
    const pitch = 0.94 + Math.random() * 0.12;
    if (Array.isArray(def)) def.forEach((s, i) => this.voice(s, now + (name === 'victory' || name === 'levelup' || name === 'chest' || name === 'event' ? i * 0.11 : 0), this.sfxGain, pitch));
    else this.voice(def, now, this.sfxGain, pitch);
  }

  setMusic(m: { root: number; scale: number[]; tempo: number } | null, intensity = 0): void {
    if (!m) { this.music.on = false; return; }
    this.music.root = m.root; this.music.scale = m.scale; this.music.tempo = m.tempo; this.music.intensity = intensity;
    if (!this.music.on) { this.music.on = true; this.music.next = this.ctx ? this.ctx.currentTime + 0.1 : 0; }
  }

  private note(i: number, oct = 0): number {
    const sc = this.music.scale;
    const n = this.music.root + sc[((i % sc.length) + sc.length) % sc.length] + 12 * (oct + Math.floor(i / sc.length));
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  /** Generative sequencer: bass pulse, slow pad, pentatonic arp; drums join at higher intensity. */
  private tick(): void {
    const c = this.ctx, m = this.music;
    if (!c || c.state !== 'running' || !m.on || this.vol.music <= 0) return;
    const spb = 60 / m.tempo / 4;
    if (m.next < c.currentTime) m.next = c.currentTime + 0.05;
    while (m.next < c.currentTime + 0.2) {
      const st = m.step++, t = m.next, bar = Math.floor(st / 16), q = st % 16;
      const prog = [0, 3, 1, 4][bar % 4];
      if (q % 4 === 0 || (m.intensity > 0 && q % 2 === 0)) this.voice({ w: 'triangle', f: this.note(prog, -2), d: spb * 3, v: 0.2 }, t, this.musicGain);
      if (q === 0) for (const k of [0, 2, 4]) this.voice({ w: 'sine', f: this.note(prog + k, -1), d: spb * 15, v: 0.06 }, t, this.musicGain);
      const pat = (st * 7 + bar * 3) % 11;
      if (pat < 6) this.voice({ w: 'square', f: this.note(prog + [0, 2, 4, 5, 7, 9][pat], 0), d: spb * 1.6, v: 0.028, lp: 1800 }, t, this.musicGain);
      if (m.intensity > 0) {
        if (q % 4 === 0) this.voice({ w: 'sine', f: 130, f2: 40, d: 0.14, v: 0.3 }, t, this.musicGain);
        if (q % 4 === 2) this.voice({ w: 'noise', f: 6000, d: 0.04, v: 0.07 }, t, this.musicGain);
        if (q === 4 || q === 12) this.voice({ w: 'noise', f: 1800, f2: 600, d: 0.12, v: 0.14 }, t, this.musicGain);
      } else if (q % 8 === 4) this.voice({ w: 'noise', f: 5000, d: 0.03, v: 0.04 }, t, this.musicGain);
      m.next += spb;
    }
  }

  destroy(): void { clearInterval(this.timer); void this.ctx?.close(); this.ctx = null; }
}
