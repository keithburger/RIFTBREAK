/**
 * Adaptive music director.
 *
 * Two interchangeable sources behind one interface:
 *  - STEMS: sampled loops from public/audio/music/ that start sample-aligned and fade in with
 *    intensity (see manifest.ts for the file convention).
 *  - GEN: the built-in generative sequencer, used whenever no (or not yet decoded) samples exist.
 *    It is also what plays while a sampled track is still loading, then hands over at a bar line.
 *
 * Track changes crossfade, quantized to the end of the current bar (capped so a change never feels
 * late). Intensity (0 calm · 1 combat · 2 boss/peak) is smoothed, never switched hard.
 */
import { MUSIC_BPM, MUSIC_FADE, MUSIC_KEEP, MUSIC_MAX_WAIT } from './manifest';
import type { SampleBank } from './samples';
import { synthVoice } from './synth';

export interface MusicRequest {
  /** Identity of the musical situation; the same key only updates intensity. */
  key: string;
  /** Sample track ids to try, most specific first (e.g. ['hollow_monarch', 'boss']). */
  tracks: string[];
  /** Generative fallback parameters. */
  gen: { root: number; scale: number[]; tempo: number };
  boss?: boolean;
  /** 0 calm · 1 combat · 2 peak. */
  intensity: number;
}

interface GenState { root: number; scale: number[]; tempo: number; boss: boolean; step: number; next: number; lvl: number; want: number }
interface Stem { src: AudioBufferSourceNode; g: GainNode; lvl: number }
interface Layer { key: string; bus: GainNode; bpm: number; t0: number; gen?: GenState; stems?: Stem[]; track?: string; endAt: number }

export class MusicDirector {
  private cur: Layer | null = null;
  private dying: Layer[] = [];
  private req: MusicRequest | null = null;
  private kept: string[] = [];
  /** Counters exposed for diagnostics and tests. */
  stats = { switches: 0, upgrades: 0, disposed: 0 };

  constructor(private ctx: BaseAudioContext, private out: AudioNode, private bank: SampleBank, private noise: () => AudioBuffer | null) {}

  get key(): string | null { return this.cur?.key ?? null; }
  get kind(): 'stems' | 'gen' | null { return this.cur ? (this.cur.stems ? 'stems' : 'gen') : null; }
  get layers(): number { return this.dying.length + (this.cur ? 1 : 0); }

  request(req: MusicRequest | null): void {
    if (!req) { this.req = null; this.fadeOut(1.2); return; }
    this.req = req;
    if (this.cur && this.cur.key === req.key) { this.setIntensity(req.intensity); return; }
    const now = this.ctx.currentTime;
    const found = this.find(req.tracks);
    const when = this.nextBar(now);
    const ready = found && found.files.every((f) => this.bank.has(f));
    const layer = ready ? this.makeStems(req, found!.id, found!.files, when) : this.makeGen(req, when);
    this.fade(layer, when);
    this.stats.switches++;
    if (found && !ready) void this.upgradeWhenLoaded(req, found.id, found.files);
    if (ready) this.keep(found!.id);
  }

  /**
   * The sample index may arrive after the first request (the menu music is requested at unlock, before
   * `audio-index.json` has been fetched). Re-check: if the current generative music now has a sampled
   * track, load it and hand over at the next bar line.
   */
  reselect(): void {
    const req = this.req, c = this.cur;
    if (!req || !c?.gen) return;
    const found = this.find(req.tracks);
    if (found) void this.upgradeWhenLoaded(req, found.id, found.files);
  }

  setIntensity(i: number): void {
    const c = this.cur;
    if (!c) return;
    const lvl = i < 0.5 ? 0 : i < 1.5 ? 1 : 2;
    if (this.req) this.req.intensity = lvl;
    if (c.gen) c.gen.want = lvl;
    if (c.stems) {
      const now = this.ctx.currentTime;
      for (const s of c.stems) s.g.gain.setTargetAtTime(s.lvl <= lvl ? 1 : 0, now, 0.55);
    }
  }

  /** Scheduling pump; called from the engine's timer. */
  tick(): void {
    const now = this.ctx.currentTime;
    if (this.cur?.gen) this.genTick(this.cur, now);
    if (this.dying.length) {
      const alive: Layer[] = [];
      for (const l of this.dying) { if (now > l.endAt) this.dispose(l); else alive.push(l); }
      this.dying = alive;
    }
  }

  stop(): void { this.req = null; this.fadeOut(0.05); this.tick(); }

  destroy(): void {
    for (const l of this.dying) this.dispose(l);
    if (this.cur) this.dispose(this.cur);
    this.dying = []; this.cur = null; this.req = null;
  }

  // --- source selection --------------------------------------------------------------------------

  private find(ids: string[]): { id: string; files: string[] } | null {
    for (const id of ids) { const files = this.bank.musicStems(id); if (files?.length) return { id, files }; }
    return null;
  }

  private async upgradeWhenLoaded(req: MusicRequest, id: string, files: string[]): Promise<void> {
    const bufs = await Promise.all(files.map((f) => this.bank.load(f)));
    if (!bufs.every(Boolean)) return;
    const c = this.cur;
    if (!c || c.key !== req.key || !c.gen) return; // moved on, or already sampled
    const when = this.nextBar(this.ctx.currentTime);
    this.fade(this.makeStems(this.req ?? req, id, files, when), when);
    this.stats.upgrades++;
    this.keep(id);
  }

  /** Remember decoded tracks; free the oldest beyond the budget (stems are large). */
  private keep(id: string): void {
    this.kept = [...this.kept.filter((k) => k !== id), id];
    while (this.kept.length > MUSIC_KEEP) {
      const old = this.kept.shift()!;
      if (this.cur?.track === old) continue;
      for (const f of this.bank.musicStems(old) ?? []) this.bank.evict(f);
    }
  }

  // --- layers ------------------------------------------------------------------------------------

  private newBus(): GainNode {
    const bus = this.ctx.createGain();
    bus.gain.value = 0.0001;
    bus.connect(this.out);
    return bus;
  }

  private makeStems(req: MusicRequest, id: string, files: string[], when: number): Layer {
    const bus = this.newBus();
    const lvl = Math.round(req.intensity);
    const stems: Stem[] = files.map((f, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.bank.get(f) ?? null;
      src.loop = true;
      const g = this.ctx.createGain();
      const sl = Math.min(i, 2);
      g.gain.value = sl <= lvl ? 1 : 0;
      src.connect(g); g.connect(bus);
      src.start(when);
      return { src, g, lvl: sl };
    });
    return { key: req.key, bus, bpm: MUSIC_BPM[id] ?? req.gen.tempo, t0: when, stems, track: id, endAt: Infinity };
  }

  private makeGen(req: MusicRequest, when: number): Layer {
    const bus = this.newBus();
    const gen: GenState = { root: req.gen.root, scale: req.gen.scale, tempo: req.gen.tempo * (req.boss ? 1.12 : 1), boss: !!req.boss, step: 0, next: when, lvl: Math.round(req.intensity), want: Math.round(req.intensity) };
    return { key: req.key, bus, bpm: gen.tempo, t0: when, gen, endAt: Infinity };
  }

  /** Time of the next bar line of whatever is playing now (or ~now when silent). */
  private nextBar(now: number): number {
    const c = this.cur;
    let t = now + 0.05;
    if (c?.stems) {
      const bar = 240 / c.bpm;
      t = c.t0 + Math.max(0, Math.ceil((now - c.t0) / bar)) * bar;
    } else if (c?.gen) {
      const spb = 15 / c.gen.tempo;
      t = c.gen.next + ((16 - (c.gen.step % 16)) % 16) * spb;
    }
    return t - now > MUSIC_MAX_WAIT || t < now ? now + 0.05 : t;
  }

  private fade(next: Layer, when: number): void {
    const now = this.ctx.currentTime;
    next.bus.gain.setValueAtTime(0.0001, when);
    next.bus.gain.linearRampToValueAtTime(1, when + MUSIC_FADE);
    const old = this.cur;
    if (old) {
      const v = Math.max(0.0001, old.bus.gain.value);
      old.bus.gain.cancelScheduledValues(now);
      old.bus.gain.setValueAtTime(v, now);
      old.bus.gain.linearRampToValueAtTime(v, when);
      old.bus.gain.linearRampToValueAtTime(0.0001, when + MUSIC_FADE);
      old.endAt = when + MUSIC_FADE + 0.15;
      this.dying.push(old);
    }
    this.cur = next;
  }

  private fadeOut(secs: number): void {
    const c = this.cur;
    if (!c) return;
    const now = this.ctx.currentTime;
    const v = Math.max(0.0001, c.bus.gain.value);
    c.bus.gain.cancelScheduledValues(now);
    c.bus.gain.setValueAtTime(v, now);
    c.bus.gain.linearRampToValueAtTime(0.0001, now + secs);
    c.endAt = now + secs + 0.1;
    this.dying.push(c);
    this.cur = null;
  }

  private dispose(l: Layer): void {
    for (const s of l.stems ?? []) { try { s.src.stop(); } catch { /* not started */ } s.src.disconnect(); s.g.disconnect(); }
    l.bus.disconnect();
    this.stats.disposed++;
  }

  // --- generative fallback ------------------------------------------------------------------------

  private note(g: GenState, i: number, oct = 0): number {
    const sc = g.scale;
    const n = g.root + sc[((i % sc.length) + sc.length) % sc.length] + 12 * (oct + Math.floor(i / sc.length));
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  /** Bass pulse + pad + arp; kick/snare/hats at level 1; fills, 16ths and a lead at level 2; boss drone. */
  private genTick(l: Layer, now: number): void {
    const g = l.gen!, out = l.bus, noise = this.noise();
    const spb = 15 / g.tempo;
    if (g.next < now) g.next = now + 0.05;
    const v = (s: Parameters<typeof synthVoice>[2], t: number): void => { synthVoice(this.ctx, noise, s, t, out); };
    while (g.next < now + 0.2) {
      const st = g.step++, t = g.next, bar = Math.floor(st / 16), q = st % 16;
      if (q === 0) g.lvl = g.want;
      const prog = [0, 3, 1, 4][bar % 4];
      const L = g.lvl;
      if (q % 4 === 0 || (L > 0 && q % 2 === 0)) v({ w: 'triangle', f: this.note(g, prog, -2), d: spb * 3, v: 0.2 }, t);
      if (q === 0) {
        for (const k of [0, 2, 4]) v({ w: 'sine', f: this.note(g, prog + k, -1), d: spb * 15, v: 0.06 }, t);
        if (g.boss) v({ w: 'sawtooth', f: this.note(g, 0, -3), d: spb * 15, v: 0.07, lp: 260 }, t);
      }
      const pat = (st * 7 + bar * 3) % 11;
      if (pat < 6 && (L < 2 || q % 2 === 0)) v({ w: 'square', f: this.note(g, prog + [0, 2, 4, 5, 7, 9][pat], 0), d: spb * 1.6, v: 0.028, lp: 1800 }, t);
      if (L > 0) {
        if (q % 4 === 0) v({ w: 'sine', f: 130, f2: 40, d: 0.14, v: 0.3 }, t);
        if (q % 4 === 2) v({ w: 'noise', f: 6000, d: 0.04, v: 0.07 }, t);
        if (q === 4 || q === 12) v({ w: 'noise', f: 1800, f2: 600, d: 0.12, v: 0.14 }, t);
      } else if (q % 8 === 4) v({ w: 'noise', f: 5000, d: 0.03, v: 0.04 }, t);
      if (L > 1) {
        if (q % 2 === 1) v({ w: 'noise', f: 7000, d: 0.025, v: 0.035 }, t);
        if (q % 4 === 0) v({ w: 'sawtooth', f: this.note(g, prog + [0, 2, 4, 2][(q >> 2) % 4], 1), d: spb * 2.4, v: 0.04, lp: 2400 }, t);
        if (bar % 4 === 3 && q >= 12) v({ w: 'noise', f: 2400, f2: 900, d: 0.08, v: 0.1 }, t);
      }
      g.next += spb;
    }
  }
}
