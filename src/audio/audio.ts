/**
 * Audio engine. Self-contained (imports only from audio/), never blocks gameplay, and degrades
 * gracefully: no AudioContext, a blocked context, missing sample files or a failed decode all fall
 * back to the synthesized recipes so the game is never silent by accident.
 *
 *   sfx voices ──► per-bus trim ─┐
 *                                ├─► sfxGain ─┐
 *   music (stems | generative) ─► danger LPF ─► duck ─► musicGain ─┤
 *                                                                  └─► master ─► limiter ─► out
 */
import { BUS_TRIM, MAX_VOICES, metaOf, type Bus, type SfxMeta } from './manifest';
import { MusicDirector, type MusicRequest } from './music';
import { SampleBank } from './samples';
import { STAGGER, recipe, synthVoice, whiteNoise, type Sfx } from './synth';

export type { MusicRequest } from './music';

interface Voice { name: string; prio: number; start: number; end: number; grp: GainNode; srcs: AudioScheduledSourceNode[] }

const BUSES: Bus[] = ['weapon', 'player', 'enemy', 'boss', 'pickup', 'upgrade', 'ui', 'world'];
const FALLBACK_META: SfxMeta = { bus: 'world', prio: 1, voices: 2 };
const SPATIAL_RANGE = 900; // world units at which a sound is fully attenuated/panned
const TICK_MS = 60;

type CtxFactory = () => BaseAudioContext | null;
type Fetch = ConstructorParameters<typeof SampleBank>[2];

export interface AudioStats {
  running: boolean; voices: number; played: number; dropped: number; stolen: number; throttled: number;
  sampled: number; synthesized: number; samplesIndexed: number; samplesDecoded: number;
  music: 'stems' | 'gen' | null; musicKey: string | null; musicLayers: number;
  /** play() counts by sound name since unlock, for trigger verification. */
  byName: Record<string, number>;
}

export class AudioSys {
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private duckGain!: GainNode;
  private danger!: BiquadFilterNode;
  private buses = new Map<Bus, GainNode>();
  private noise: AudioBuffer | null = null;
  private bank!: SampleBank;
  private music!: MusicDirector;
  private voices: Voice[] = [];
  private last = new Map<string, number>();
  private lastVariant = new Map<string, number>();
  private vol = { master: 0.8, sfx: 0.8, music: 0.5 };
  private listener = { x: 0, y: 0 };
  private duckAmt = 1;
  private duckUntil = 0;
  private dangerLevel = 0;
  private nextBeat = 0;
  private timer: ReturnType<typeof setInterval> | 0 = 0;
  private pendingMusic: MusicRequest | null = null;
  private hiddenSuspend = false;
  private onVis = (): void => this.visibility();
  private c = { played: 0, dropped: 0, stolen: 0, throttled: 0, sampled: 0, synthesized: 0 };
  private byName: Record<string, number> = {};

  /** `factory`/`fetcher` are injectable for tests; defaults use the browser. */
  constructor(private factory: CtxFactory = defaultFactory, private fetcher?: Fetch) {}

  /** Must be called from a user gesture. Safe to call repeatedly; failures leave audio disabled. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const ctx = this.factory();
        if (!ctx) return;
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.sfxGain = ctx.createGain();
        this.musicGain = ctx.createGain();
        this.duckGain = ctx.createGain();
        this.danger = ctx.createBiquadFilter();
        this.danger.type = 'lowpass';
        this.danger.frequency.value = 18000;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
        for (const b of BUSES) { const g = ctx.createGain(); g.gain.value = BUS_TRIM[b]; g.connect(this.sfxGain); this.buses.set(b, g); }
        this.sfxGain.connect(this.master);
        this.danger.connect(this.duckGain); this.duckGain.connect(this.musicGain); this.musicGain.connect(this.master);
        this.master.connect(comp); comp.connect(ctx.destination);
        this.noise = whiteNoise(ctx);
        this.bank = new SampleBank(ctx, 'audio/', this.fetcher);
        this.music = new MusicDirector(ctx, this.danger, this.bank, () => this.noise);
        this.applyVolumes(true);
        this.timer = setInterval(() => this.tick(), TICK_MS);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVis);
        void this.bank.init().then(() => this.onIndex());
      }
      if (this.ctx.state === 'suspended') void (this.ctx as AudioContext).resume?.();
      if (this.pendingMusic) { const r = this.pendingMusic; this.pendingMusic = null; this.music.request(r); }
    } catch { this.ctx = null; }
  }

  /** Smoothed (no zipper noise). */
  setVolumes(master: number, sfx: number, music: number): void {
    this.vol = { master, sfx, music };
    if (this.ctx) this.applyVolumes(false);
  }

  private applyVolumes(immediate: boolean): void {
    const now = this.ctx!.currentTime, tc = immediate ? 0.001 : 0.04;
    this.master.gain.setTargetAtTime(this.vol.master, now, tc);
    this.sfxGain.gain.setTargetAtTime(this.vol.sfx, now, tc);
    this.musicGain.gain.setTargetAtTime(this.vol.music * 0.6, now, tc);
  }

  /** The player's position; spatial sounds pan and fade relative to it. */
  setListener(x: number, y: number): void { this.listener.x = x; this.listener.y = y; }

  /** 0 = healthy … 1 = nearly dead. Muffles the music and starts a heartbeat. */
  setDanger(d: number): void {
    const v = d <= 0 ? 0 : d >= 1 ? 1 : d;
    if (Math.abs(v - this.dangerLevel) < 0.02) return;
    this.dangerLevel = v;
    if (this.ctx) this.danger.frequency.setTargetAtTime(18000 * Math.pow(0.05, v), this.ctx.currentTime, 0.25);
  }

  /** Update the intensity (0 calm · 1 combat · 2 peak) of the current music without changing track. */
  setIntensity(i: number): void { if (this.ctx) this.music.setIntensity(i); else if (this.pendingMusic) this.pendingMusic.intensity = i; }

  setMusic(req: MusicRequest | null): void {
    if (!this.ctx) { this.pendingMusic = req; return; }
    this.music.request(req);
  }

  // --- sound effects -----------------------------------------------------------------------------

  play(name: string, x?: number, y?: number): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.vol.sfx <= 0 || this.vol.master <= 0) return;
    const meta = metaOf(name) ?? FALLBACK_META;
    const def = recipe(name);
    const files = this.bank.variants(name);
    if (!def && !files) return;
    const now = c.currentTime;
    const gap = meta.gap ?? (Array.isArray(def) ? def[0]?.gap : def?.gap) ?? 0.03;
    if (now - (this.last.get(name) ?? -1) < gap) { this.c.throttled++; return; }

    this.prune(now);
    if (!this.admit(name, meta)) { this.c.dropped++; return; }
    this.last.set(name, now);

    // distance attenuation + pan, only for positioned sounds that opt in
    let gain = 1, pan = 0;
    if (meta.spatial && x !== undefined && y !== undefined) {
      const dx = x - this.listener.x, dy = y - this.listener.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      gain = Math.max(0.3, 1 - (d / SPATIAL_RANGE) * 0.7);
      pan = Math.max(-1, Math.min(1, dx / SPATIAL_RANGE)) * 0.6;
    }
    const spread = meta.pitch ?? 0.05;
    const pitch = 1 - spread + Math.random() * spread * 2;

    const grp = c.createGain();
    grp.gain.value = gain;
    let out: AudioNode = grp;
    if (Math.abs(pan) > 0.05 && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner(); p.pan.value = pan; grp.connect(p); out = p;
    }
    out.connect(this.buses.get(meta.bus)!);
    const v: Voice = { name, prio: meta.prio, start: now, end: now, grp, srcs: [] };

    const buf = this.pickSample(name, files);
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf; src.playbackRate.value = pitch;
      const sg = c.createGain(); sg.gain.value = meta.vol ?? 1;
      src.connect(sg); sg.connect(grp); src.start(now);
      v.srcs.push(src); v.end = now + buf.duration / pitch + 0.05;
      if (meta.sub) { const sub = recipe(meta.sub); if (sub) v.end = Math.max(v.end, this.schedule(v, sub, now, grp, pitch, meta.sub)); }
      this.c.sampled++;
    } else if (def) {
      v.end = this.schedule(v, def, now, grp, pitch, name);
      this.c.synthesized++;
    }
    this.voices.push(v);
    this.c.played++;
    this.byName[name] = (this.byName[name] ?? 0) + 1;
    if (meta.duck) this.duck(meta.duck.amt, meta.duck.hold);
  }

  /** Starts all layers of a recipe; returns when the last one ends. */
  private schedule(v: Voice, def: Sfx | Sfx[], when: number, out: AudioNode, pitch: number, name: string): number {
    const layers = Array.isArray(def) ? def : [def];
    let end = when;
    layers.forEach((s, i) => {
      const t = when + (STAGGER.has(name) ? i * 0.11 : 0);
      v.srcs.push(synthVoice(this.ctx!, this.noise, s, t, out, pitch));
      end = Math.max(end, t + s.d + 0.03);
    });
    return end;
  }

  /** Round-robin over loaded variants (never the same one twice in a row); kicks off lazy loads. */
  private pickSample(name: string, files: string[] | undefined): AudioBuffer | null {
    if (!files?.length) return null;
    const ready = files.filter((f) => this.bank.has(f));
    for (const f of files) if (!this.bank.has(f)) void this.bank.load(f);
    if (!ready.length) return null;
    let i = ready.length > 1 ? Math.floor(Math.random() * ready.length) : 0;
    if (ready.length > 1 && i === this.lastVariant.get(name)) i = (i + 1) % ready.length;
    this.lastVariant.set(name, i);
    return this.bank.get(ready[i]) ?? null;
  }

  private prune(now: number): void {
    if (!this.voices.length) return;
    let w = 0;
    for (const v of this.voices) {
      if (v.end > now) this.voices[w++] = v;
      else { try { v.grp.disconnect(); } catch { /* already gone */ } }
    }
    this.voices.length = w;
  }

  /** Voice budget: per-name polyphony first, then the global cap. Steals the quietest/oldest. */
  private admit(name: string, meta: SfxMeta): boolean {
    let same = 0, oldest: Voice | null = null;
    for (const v of this.voices) if (v.name === name) { same++; if (!oldest || v.start < oldest.start) oldest = v; }
    if (same >= meta.voices) {
      if (!oldest) return false;
      this.steal(oldest);
    }
    if (this.voices.length >= MAX_VOICES) {
      let victim: Voice | null = null;
      for (const v of this.voices) if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.start < victim.start)) victim = v;
      if (!victim || victim.prio > meta.prio) return false;
      this.steal(victim);
    }
    return true;
  }

  private steal(v: Voice): void {
    const now = this.ctx!.currentTime;
    v.grp.gain.cancelScheduledValues(now);
    v.grp.gain.setTargetAtTime(0, now, 0.012);
    for (const s of v.srcs) { try { s.stop(now + 0.06); } catch { /* not started */ } }
    v.end = now;
    this.voices.splice(this.voices.indexOf(v), 1);
    this.c.stolen++;
  }

  private duck(amt: number, hold: number): void {
    const now = this.ctx!.currentTime;
    if (amt <= this.duckAmt) {
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.setTargetAtTime(amt, now, 0.03);
      this.duckAmt = amt;
    }
    this.duckUntil = Math.max(this.duckUntil, now + hold);
  }

  // --- housekeeping ------------------------------------------------------------------------------

  /** Timer pump: music scheduling, duck release, heartbeat. Public for deterministic tests. */
  tick(): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    if (this.vol.music > 0) this.music.tick();
    if (this.duckAmt < 1 && now > this.duckUntil) {
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.setTargetAtTime(1, now, 0.4);
      this.duckAmt = 1;
    }
    if (this.dangerLevel > 0.55 && now >= this.nextBeat) {
      this.play('heartbeat');
      this.nextBeat = now + 1.15 - this.dangerLevel * 0.45;
    }
  }

  /** Sample files that exist are loaded in priority order once the index is known. */
  private onIndex(): void {
    const names = this.bank.sfxNames().sort((a, b) => (metaOf(b)?.prio ?? 1) - (metaOf(a)?.prio ?? 1));
    for (const n of names) this.bank.preload(this.bank.variants(n) ?? []);
  }

  private visibility(): void {
    const c = this.ctx as AudioContext | null;
    if (!c || typeof document === 'undefined') return;
    if (document.hidden) { if (c.state === 'running') { this.hiddenSuspend = true; void c.suspend?.(); } }
    else if (this.hiddenSuspend) { this.hiddenSuspend = false; void c.resume?.(); }
  }

  stats(): AudioStats {
    return {
      running: this.ctx?.state === 'running', voices: this.voices.length, ...this.c,
      samplesIndexed: this.ctx ? this.bank.count() : 0, samplesDecoded: this.ctx ? this.bank.decoded : 0,
      music: this.ctx ? this.music.kind : null, musicKey: this.ctx ? this.music.key : null, musicLayers: this.ctx ? this.music.layers : 0,
      byName: { ...this.byName },
    };
  }

  /** Test seam: the sample bank (inject buffers without network). */
  get samples(): SampleBank { return this.bank; }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVis);
    this.music?.destroy();
    for (const v of this.voices) { try { v.grp.disconnect(); } catch { /* ignore */ } }
    this.voices = [];
    void (this.ctx as AudioContext | null)?.close?.();
    this.ctx = null;
  }
}

function defaultFactory(): BaseAudioContext | null {
  const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AC ? new AC({ latencyHint: 'interactive' }) : null;
}
