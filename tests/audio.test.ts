/**
 * Audio: every sound the game can emit resolves to a recipe + mix metadata, and the engine's
 * pooling, throttling, stealing, ducking, spatialisation, sample fallback and adaptive music
 * behave — against a recording fake of the Web Audio API (Node has none).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AudioSys } from '../src/audio/audio';
import { META, MAX_VOICES, metaOf } from '../src/audio/manifest';
import { SampleBank } from '../src/audio/samples';
import { SYNTH, recipe } from '../src/audio/synth';
import { Bot, runHeadless } from '../src/sim/bot';
import { forceBoss } from '../src/sim/director';
import { NullFx } from '../src/sim/fx';
import { World } from '../src/sim/world';
import { C, strongBuild } from './helpers';

// --- fake Web Audio ------------------------------------------------------------------------------

class Param {
  value = 1;
  history: number[] = [];
  setValueAtTime(v: number): this { this.value = v; this.history.push(v); return this; }
  linearRampToValueAtTime(v: number): this { this.value = v; this.history.push(v); return this; }
  exponentialRampToValueAtTime(v: number): this { this.value = v; return this; }
  setTargetAtTime(v: number): this { this.value = v; this.history.push(v); return this; }
  cancelScheduledValues(): this { return this; }
}
class FNode { disconnected = false; connect<T>(n: T): T { return n; } disconnect(): void { this.disconnected = true; } }
class FGain extends FNode { gain = new Param(); }
class FFilter extends FNode { type = ''; frequency = new Param(); Q = new Param(); }
class FPanner extends FNode { pan = new Param(); }
class FComp extends FNode { threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param(); }
class FSrc extends FNode {
  buffer: unknown = null; loop = false; playbackRate = new Param(); type = ''; frequency = new Param();
  started: number[] = []; stopped = 0;
  start(t = 0): void { this.started.push(t); }
  stop(): void { this.stopped++; }
}
interface FBuf { duration: number; getChannelData(): Float32Array; tag: string }
const buf = (tag: string, duration = 0.5): FBuf => ({ duration, getChannelData: () => new Float32Array(16), tag });

class FCtx {
  currentTime = 0; state = 'running'; sampleRate = 8000; destination = new FNode();
  gains: FGain[] = []; sources: FSrc[] = []; panners: FPanner[] = []; closed = false;
  createGain(): FGain { const g = new FGain(); this.gains.push(g); return g; }
  createBiquadFilter(): FFilter { return new FFilter(); }
  createDynamicsCompressor(): FComp { return new FComp(); }
  createStereoPanner(): FPanner { const p = new FPanner(); this.panners.push(p); return p; }
  createBufferSource(): FSrc { const s = new FSrc(); this.sources.push(s); return s; }
  createOscillator(): FSrc { const s = new FSrc(); this.sources.push(s); return s; }
  createBuffer(_c: number, len: number, rate: number): FBuf { return buf('noise', len / rate); }
  decodeAudioData(_d: ArrayBuffer, ok?: (b: FBuf) => void): Promise<FBuf> { const b = buf('decoded', 4); ok?.(b); return Promise.resolve(b); }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.closed = true; return Promise.resolve(); }
}

const noFetch = (): Promise<never> => Promise.reject(new Error('offline'));
const live: AudioSys[] = [];
function mk(fetcher: ConstructorParameters<typeof AudioSys>[1] = noFetch as never): { a: AudioSys; ctx: FCtx } {
  const ctx = new FCtx();
  const a = new AudioSys(() => ctx as unknown as BaseAudioContext, fetcher);
  a.unlock();
  live.push(a);
  return { a, ctx };
}
afterEach(() => { while (live.length) live.pop()!.destroy(); });
const advance = (ctx: FCtx, s: number): void => { ctx.currentTime += s; };

// --- the catalogue ---------------------------------------------------------------------------------

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });

describe('sound catalogue', () => {
  const literal = new Set<string>();
  for (const f of walk('src')) {
    if (f.replace(/\\/g, '/').startsWith('src/audio/')) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/\bsfx\(\s*'([a-z_]+)'/g)) literal.add(m[1]);
  }

  it('finds the sounds the code triggers (guards the scan itself)', () => {
    expect(literal.size).toBeGreaterThan(40);
    expect(literal.has('boss_intro')).toBe(true);
    expect(literal.has('click')).toBe(true);
  });
  it('every triggered sound has a synth fallback and mix metadata', () => {
    const missing = [...literal].filter((n) => !recipe(n) || !metaOf(n));
    expect(missing).toEqual([]);
  });
  it('every element has a shot sound; shot sounds are low priority and distinct', () => {
    const freqs = new Set<number>();
    for (const id of C.elements.keys()) {
      const r = recipe('shot_' + id);
      expect(r, id).toBeTruthy();
      expect(metaOf('shot_' + id)?.prio).toBe(0);
      freqs.add((Array.isArray(r) ? r[0] : r!).f);
    }
    expect(freqs.size).toBe(C.elements.size);
  });
  it('no metadata without a recipe, and bosses/critical events outrank ambient sounds', () => {
    expect(Object.keys(META).filter((n) => !SYNTH[n])).toEqual([]);
    for (const n of ['boss_intro', 'boss_phase', 'boss_die', 'ray_fire', 'levelup', 'evolve', 'hurt']) expect(META[n].prio, n).toBe(3);
    for (const n of ['xp', 'shard', 'kill', 'eshot']) expect(META[n].prio, n).toBe(0);
  });
  it('sounds actually emitted by full simulated runs and every boss are all covered', () => {
    const heard = new Set<string>();
    class Rec extends NullFx { override sfx(name?: string): void { if (name) heard.add(name); } }
    const w = new World({ content: C, seed: 99, classId: 'vanguard', modeId: 'standard', fx: new Rec() });
    runHeadless(w, new Bot('smart', 9), 150);
    for (const id of C.bosses.keys()) {
      const b = new World({ content: C, seed: 7, classId: 'vanguard', modeId: 'standard', fx: new Rec() });
      b.god = true; b.spawningOff = true; strongBuild(b);
      forceBoss(b, id);
      runHeadless(b, new Bot('smart', 3), 60);
    }
    expect(heard.size).toBeGreaterThan(15);
    expect([...heard].filter((n) => !recipe(n) || !metaOf(n))).toEqual([]);
    expect(heard.has('boss_intro')).toBe(true);
  }, 240000);
});

// --- shipped assets --------------------------------------------------------------------------------

describe('audio assets', () => {
  const dirOf = (d: string): string[] => { try { return readdirSync(join('public/audio', d)).filter((f) => /\.(mp3|ogg|wav|m4a|webm)$/i.test(f)).sort().map((f) => `${d}/${f}`); } catch { return []; } };
  const index = JSON.parse(readFileSync('public/audio/audio-index.json', 'utf8')) as { sfx: string[]; music: string[] };
  const base = (f: string): string => f.replace(/^[a-z]+\//, '').replace(/(?:_\d+)?\.[a-z0-9]+$/i, '');

  it('audio-index.json lists exactly the files on disk (run `npm run audio:index`)', () => {
    expect(index.sfx).toEqual(dirOf('sfx'));
    expect(index.music).toEqual(dirOf('music'));
  });
  it('every sfx file is named after a real event id (so it can never be silently ignored)', () => {
    const known = (n: string): boolean => !!recipe(n) && !!metaOf(n);
    expect(index.sfx.filter((f) => !known(base(f)))).toEqual([]);
  });
  it('every music file is a real track: menu, a biome, a boss, or the generic boss theme', () => {
    const tracks = new Set(['menu', 'boss', ...C.biomes.map((b) => b.id), ...C.bosses.keys()]);
    expect(index.music.filter((f) => !tracks.has(base(f)))).toEqual([]);
  });
});

// --- sound-effect engine ---------------------------------------------------------------------------

describe('sfx engine', () => {
  it('is inert and safe before unlock and without an AudioContext', () => {
    const a = new AudioSys(() => null);
    expect(() => { a.play('hurt'); a.setMusic(null); a.setDanger(1); a.setIntensity(2); a.setVolumes(1, 1, 1); a.destroy(); }).not.toThrow();
    const b = new AudioSys(() => null);
    b.unlock();
    expect(b.stats().running).toBe(false);
  });
  it('plays the synthesized recipe when no sample exists', () => {
    const { a, ctx } = mk();
    a.play('hurt');
    expect(a.stats().synthesized).toBe(1);
    expect(a.stats().sampled).toBe(0);
    expect(ctx.sources.length).toBeGreaterThan(0);
  });
  it('ignores unknown names and zero volume', () => {
    const { a } = mk();
    a.play('definitely_not_a_sound');
    expect(a.stats().played).toBe(0);
    a.setVolumes(0.8, 0, 0.5);
    a.play('hurt');
    expect(a.stats().played).toBe(0);
  });
  it('throttles rapid repeats of one sound', () => {
    const { a } = mk();
    a.play('click'); a.play('click');
    expect(a.stats().played).toBe(1);
    expect(a.stats().throttled).toBe(1);
  });
  it('caps per-sound polyphony by stealing the oldest instance', () => {
    const { a, ctx } = mk();
    for (let i = 0; i < 8; i++) { a.play('boom'); advance(ctx, 0.07); }
    expect(a.stats().voices).toBeLessThanOrEqual(META.boom.voices);
    expect(a.stats().stolen).toBeGreaterThan(0);
  });
  it('never exceeds the global voice budget and lets critical sounds in last', () => {
    const { a } = mk();
    const names = Object.keys(META).sort((p, q) => META[p].prio - META[q].prio);
    for (const n of names) a.play(n);
    for (const el of ['fire', 'frost', 'shock', 'toxin', 'water']) a.play('shot_' + el);
    expect(a.stats().voices).toBeLessThanOrEqual(MAX_VOICES);
    expect(a.stats().byName.boss_die).toBe(1);
    expect(a.stats().dropped + a.stats().stolen).toBeGreaterThan(0);
  });
  it('drops a low-priority sound rather than stealing a critical one when full', () => {
    const { a } = mk();
    const crit = Object.keys(META).filter((n) => META[n].prio === 3);
    for (const n of crit) a.play(n);
    const full = a.stats().voices;
    for (let i = 0; full >= MAX_VOICES && i < 3; i++) a.play('xp');
    expect(a.stats().voices).toBeLessThanOrEqual(MAX_VOICES);
    expect(a.stats().byName.hurt).toBe(1);
  });
  it('expired voices are released', () => {
    const { a, ctx } = mk();
    a.play('hurt');
    expect(a.stats().voices).toBe(1);
    advance(ctx, 5);
    a.play('click');
    expect(a.stats().voices).toBe(1);
  });
  it('plays a decoded sample instead of the recipe, with pitch variance', () => {
    const { a, ctx } = mk();
    a.samples.setIndex({ sfx: ['sfx/hurt.mp3'], music: [] });
    a.samples.put('sfx/hurt.mp3', buf('hurt') as unknown as AudioBuffer);
    a.play('hurt');
    expect(a.stats().sampled).toBe(1);
    expect(a.stats().synthesized).toBe(0);
    const src = ctx.sources.find((s) => (s.buffer as FBuf | null)?.tag === 'hurt')!;
    expect(src).toBeTruthy();
    expect(Math.abs(src.playbackRate.value - 1)).toBeLessThanOrEqual(0.04);
  });
  it('layers a synth sub under a sampled hit that asks for one', () => {
    const { a, ctx } = mk();
    a.samples.setIndex({ sfx: ['sfx/boss_die.mp3'], music: [] });
    a.samples.put('sfx/boss_die.mp3', buf('bd', 2) as unknown as AudioBuffer);
    const before = ctx.sources.length;
    a.play('boss_die');
    const made = ctx.sources.slice(before);
    expect(made.some((s) => (s.buffer as FBuf | null)?.tag === 'bd')).toBe(true);
    expect(made.length).toBeGreaterThan(1); // sample + sub recipe layers
    expect(a.stats().sampled).toBe(1);
  });
  it('falls back to the recipe while a file is indexed but not decoded, and requests it', async () => {
    let asked = '';
    const { a } = mk(((u: string) => { asked = u; return Promise.resolve({ ok: false, json: () => Promise.resolve({}), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }); }) as never);
    a.samples.setIndex({ sfx: ['sfx/hurt.mp3'], music: [] });
    a.play('hurt');
    expect(a.stats().synthesized).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    expect(asked).toBe('audio/sfx/hurt.mp3');
  });
  it('rotates between variants without repeating one twice in a row', () => {
    const { a, ctx } = mk();
    a.samples.setIndex({ sfx: ['sfx/slash_1.mp3', 'sfx/slash_2.mp3', 'sfx/slash_3.mp3'], music: [] });
    for (const i of [1, 2, 3]) a.samples.put(`sfx/slash_${i}.mp3`, buf('s' + i) as unknown as AudioBuffer);
    const tags: string[] = [];
    for (let i = 0; i < 12; i++) { const n = ctx.sources.length; a.play('slash'); advance(ctx, 0.2); const s = ctx.sources.slice(n).find((x) => x.buffer); if (s) tags.push((s.buffer as FBuf).tag); }
    expect(tags.length).toBe(12);
    for (let i = 1; i < tags.length; i++) expect(tags[i]).not.toBe(tags[i - 1]);
    expect(new Set(tags).size).toBeGreaterThan(1);
  });
  it('pans and attenuates positioned sounds only when they are off-centre', () => {
    const { a, ctx } = mk();
    a.setListener(0, 0);
    a.play('slash', 0, 0);
    expect(ctx.panners.length).toBe(0);
    advance(ctx, 1);
    a.play('slash', 800, 0);
    expect(ctx.panners.length).toBe(1);
    expect(ctx.panners[0].pan.value).toBeGreaterThan(0.3);
    advance(ctx, 1);
    a.play('slash', -800, 0);
    expect(ctx.panners[1].pan.value).toBeLessThan(-0.3);
    advance(ctx, 1);
    a.play('click', 800, 0); // UI is never spatial
    expect(ctx.panners.length).toBe(2);
  });
  /** The gain node(s) whose automation changed while `fn` ran (the ducker is the only one a sfx start touches). */
  const touched = (ctx: FCtx, fn: () => void): FGain[] => {
    const before = ctx.gains.map((g) => g.gain.history.length);
    const n = ctx.gains.length;
    fn();
    return ctx.gains.slice(0, n).filter((g, i) => g.gain.history.length > before[i]);
  };
  it('ducks the music for big moments and releases it afterwards', () => {
    const { a, ctx } = mk();
    const t = touched(ctx, () => a.play('boss_intro'));
    expect(t.length).toBe(1);
    const duck = t[0];
    expect(duck.gain.value).toBe(META.boss_intro.duck!.amt);
    a.tick();
    expect(duck.gain.value).toBe(META.boss_intro.duck!.amt); // still held
    advance(ctx, 5);
    a.tick();
    expect(duck.gain.value).toBe(1);
  });
  it('a lighter duck never raises an active deeper one, but extends the hold', () => {
    const { a, ctx } = mk();
    const duck = touched(ctx, () => a.play('boss_intro'))[0];
    advance(ctx, 0.5);
    expect(touched(ctx, () => a.play('boom')).length).toBe(0);
    expect(duck.gain.value).toBe(META.boss_intro.duck!.amt);
  });
  it('low health muffles the music and starts a heartbeat that stops when healthy', () => {
    const { a, ctx } = mk();
    a.setDanger(1);
    a.tick();
    expect(a.stats().byName.heartbeat).toBe(1);
    advance(ctx, 2);
    a.tick();
    expect(a.stats().byName.heartbeat).toBe(2);
    a.setDanger(0);
    advance(ctx, 2);
    a.tick();
    expect(a.stats().byName.heartbeat).toBe(2);
  });
  it('volume changes are smoothed and applied to the right buses', () => {
    const { a, ctx } = mk();
    a.setVolumes(0.5, 0.25, 1);
    const hist = ctx.gains.map((g) => g.gain.history);
    expect(hist.some((h) => h.includes(0.5))).toBe(true);
    expect(hist.some((h) => h.includes(0.25))).toBe(true);
    expect(hist.some((h) => h.includes(0.6))).toBe(true); // music is scaled by 0.6
  });
  it('does nothing after destroy', () => {
    const { a, ctx } = mk();
    a.destroy();
    expect(ctx.closed).toBe(true);
    expect(() => a.play('hurt')).not.toThrow();
    expect(a.stats().running).toBe(false);
  });
});

// --- music ------------------------------------------------------------------------------------------

const GEN = { root: 50, scale: [0, 2, 3, 7, 9], tempo: 100 };
const req = (key: string, extra: Partial<Parameters<AudioSys['setMusic']>[0] & object> = {}): NonNullable<Parameters<AudioSys['setMusic']>[0]> => ({ key, tracks: [key], gen: GEN, intensity: 0, ...extra });
const pump = (a: AudioSys, ctx: FCtx, secs: number): void => { for (let t = 0; t < secs; t += 0.06) { advance(ctx, 0.06); a.tick(); } };

describe('adaptive music', () => {
  it('uses the generative fallback when there are no music files and keeps scheduling', () => {
    const { a, ctx } = mk();
    a.setMusic(req('verdant'));
    expect(a.stats().music).toBe('gen');
    const before = ctx.sources.length;
    pump(a, ctx, 2);
    expect(ctx.sources.length).toBeGreaterThan(before + 10);
  });
  it('higher intensity adds drums to the generative music, at bar boundaries', () => {
    const { a, ctx } = mk();
    a.setMusic(req('verdant'));
    pump(a, ctx, 3);
    const calm = ctx.sources.length;
    pump(a, ctx, 4);
    const calmRate = ctx.sources.length - calm;
    a.setIntensity(2);
    pump(a, ctx, 3); // let the bar roll over
    const peak0 = ctx.sources.length;
    pump(a, ctx, 4);
    expect(ctx.sources.length - peak0).toBeGreaterThan(calmRate * 1.3);
  });
  it('crossfades to a new track, keeps both briefly, then disposes the old one', () => {
    const { a, ctx } = mk();
    a.setMusic(req('verdant'));
    pump(a, ctx, 1);
    a.setMusic(req('ironvault'));
    expect(a.stats().musicKey).toBe('ironvault');
    expect(a.stats().musicLayers).toBe(2);
    pump(a, ctx, 8);
    expect(a.stats().musicLayers).toBe(1);
  });
  it('the same key only changes intensity — no restart', () => {
    const { a } = mk();
    a.setMusic(req('verdant'));
    a.setMusic(req('verdant', { intensity: 2 }));
    expect(a.stats().musicLayers).toBe(1);
  });
  it('plays sampled stems in sync and fades them in with intensity', () => {
    const { a, ctx } = mk();
    a.samples.setIndex({ sfx: [], music: ['music/verdant_1.mp3', 'music/verdant_2.mp3', 'music/verdant_3.mp3'] });
    for (const i of [1, 2, 3]) a.samples.put(`music/verdant_${i}.mp3`, buf('m' + i, 30) as unknown as AudioBuffer);
    a.setMusic(req('verdant'));
    expect(a.stats().music).toBe('stems');
    const stems = ctx.sources.filter((s) => s.loop);
    expect(stems.length).toBe(3);
    expect(new Set(stems.map((s) => s.started[0])).size).toBe(1); // sample-aligned
    a.setIntensity(2);
    a.setIntensity(0);
    const stemGains = ctx.gains.filter((g) => g.gain.history.length > 0 && g.gain.history.every((v) => v === 0 || v === 1));
    expect(stemGains.length).toBeGreaterThanOrEqual(2); // stems 2 and 3 were switched off then on
  });
  it('prefers the most specific track (boss id) and falls back to the generic boss theme', () => {
    const { a, ctx } = mk();
    a.samples.setIndex({ sfx: [], music: ['music/boss.mp3', 'music/hollow_monarch.mp3'] });
    a.samples.put('music/boss.mp3', buf('generic', 30) as unknown as AudioBuffer);
    a.samples.put('music/hollow_monarch.mp3', buf('specific', 30) as unknown as AudioBuffer);
    a.setMusic(req('verdant', { tracks: ['hollow_monarch', 'boss'], boss: true }));
    expect(ctx.sources.some((s) => (s.buffer as FBuf | null)?.tag === 'specific')).toBe(true);
    a.setMusic(req('other', { tracks: ['tidal_leviathan', 'boss'], boss: true }));
    pump(a, ctx, 4);
    expect(ctx.sources.some((s) => (s.buffer as FBuf | null)?.tag === 'generic')).toBe(true);
  });
  it('starts on the generative music while samples load, then hands over', async () => {
    const ok = { ok: true, json: () => Promise.resolve({}), arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    const { a, ctx } = mk((() => Promise.resolve(ok)) as never);
    a.samples.setIndex({ sfx: [], music: ['music/verdant.mp3'] });
    a.setMusic(req('verdant'));
    expect(a.stats().music).toBe('gen');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 5));
    pump(a, ctx, 0.5);
    expect(a.stats().music).toBe('stems');
    expect(a.stats().samplesDecoded).toBe(1);
  });
  it('setMusic(null) fades out and disposes; setMusic before unlock is applied on unlock', () => {
    const { a, ctx } = mk();
    a.setMusic(req('verdant'));
    a.setMusic(null);
    pump(a, ctx, 3);
    expect(a.stats().musicLayers).toBe(0);
    const c2 = new FCtx();
    const b = new AudioSys(() => c2 as unknown as BaseAudioContext, noFetch as never);
    live.push(b);
    b.setMusic(req('menu'));
    b.unlock();
    expect(b.stats().musicKey).toBe('menu');
  });
});

describe('sample bank', () => {
  it('groups variants and stems by name, ordered, ignoring unrelated files', () => {
    const bank = new SampleBank(new FCtx() as unknown as BaseAudioContext, 'audio/', noFetch as never);
    bank.setIndex({ sfx: ['sfx/hurt.mp3', 'sfx/slash_2.ogg', 'sfx/slash_1.ogg', 'sfx/notes.txt', 'sfx/shot_fire.mp3'], music: ['music/boss_2.mp3', 'music/boss_1.mp3', 'music/menu.mp3'] });
    expect(bank.variants('slash')).toEqual(['sfx/slash_1.ogg', 'sfx/slash_2.ogg']);
    expect(bank.variants('shot_fire')).toEqual(['sfx/shot_fire.mp3']);
    expect(bank.variants('notes')).toBeUndefined();
    expect(bank.musicStems('boss')).toEqual(['music/boss_1.mp3', 'music/boss_2.mp3']);
    expect(bank.musicStems('menu')).toEqual(['music/menu.mp3']);
  });
  it('survives a missing index and failed downloads without throwing, and never retries a failure', async () => {
    let calls = 0;
    const bank = new SampleBank(new FCtx() as unknown as BaseAudioContext, 'audio/', (() => { calls++; return Promise.reject(new Error('404')); }) as never);
    expect(await bank.init()).toBe(0);
    expect(bank.ready).toBe(true);
    bank.setIndex({ sfx: ['sfx/a.mp3'], music: [] });
    expect(await bank.load('sfx/a.mp3')).toBeNull();
    const n = calls;
    expect(await bank.load('sfx/a.mp3')).toBeNull();
    expect(calls).toBe(n);
  });
  it('limits concurrent downloads', async () => {
    let active = 0, peak = 0;
    const slow = (() => { active++; peak = Math.max(peak, active); return new Promise((r) => setTimeout(() => { active--; r({ ok: true, json: () => Promise.resolve({}), arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) }); }, 4)); }) as never;
    const bank = new SampleBank(new FCtx() as unknown as BaseAudioContext, 'audio/', slow, 3);
    await Promise.all(Array.from({ length: 10 }, (_, i) => bank.load(`sfx/x${i}.mp3`)));
    expect(peak).toBeLessThanOrEqual(3);
    expect(bank.decoded).toBe(10);
  });
});
