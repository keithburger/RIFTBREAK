/**
 * The generated-audio catalog (scripts/audio/catalog.json) must cover exactly the sounds and tracks
 * the game uses, with no duplicate prompts (every sound gets its own identity and no credits are
 * spent twice), and the tempo/loop/tempo-fit helpers must behave on synthetic signals.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { META, MUSIC_BPM } from '../src/audio/manifest';
import { C } from './helpers';
// @ts-expect-error plain-JS helper module (no types)
import { estimateTempo, loopBars } from '../scripts/audio/lib.mjs';

interface Sfx { id: string; bus: string; dur: number; n?: number; prompt: string }
interface Track { id: string; kind: string; bpm: number; bars?: number; prompt: string }
const cat = JSON.parse(readFileSync('scripts/audio/catalog.json', 'utf8')) as { sfx: Sfx[]; music: Track[]; stemGroups: Record<string, string[]> };

describe('audio catalog', () => {
  const expected = [...Object.keys(META), ...[...C.elements.keys()].map((id) => `shot_${id}`)].sort();

  it('covers every sound id the game can emit — exactly once', () => {
    expect(cat.sfx.map((s) => s.id).sort()).toEqual(expected);
    expect(expected.length).toBeGreaterThanOrEqual(63);
  });
  it('every sfx is routed to the same bus as its mix metadata and has a sane duration', () => {
    for (const s of cat.sfx) {
      const bus = s.id.startsWith('shot_') ? 'weapon' : META[s.id].bus;
      expect(s.bus, s.id).toBe(bus);
      expect(s.dur, s.id).toBeGreaterThanOrEqual(0.5); // API minimum
      expect(s.dur, s.id).toBeLessThanOrEqual(5);
      expect(s.n ?? 1, s.id).toBeLessThanOrEqual(3);
    }
  });
  it('no two sounds or tracks share a prompt (unique sonic identities, no duplicate spend)', () => {
    const prompts = [...cat.sfx, ...cat.music].map((x) => x.prompt.trim().toLowerCase());
    expect(new Set(prompts).size).toBe(prompts.length);
  });
  it('lists the menu, every biome, every boss and the generic boss theme', () => {
    expect(cat.music.map((m) => m.id).sort()).toEqual(['menu', 'boss', ...C.biomes.map((b) => b.id), ...C.bosses.keys()].sort());
  });
  it('biome tracks use the biome tempo; engine tempo table matches the catalog', () => {
    for (const b of C.biomes) expect(cat.music.find((m) => m.id === b.id)?.bpm, b.id).toBe(b.music.tempo);
    for (const m of cat.music) expect(MUSIC_BPM[m.id], m.id).toBe(m.bpm);
    expect(Object.keys(MUSIC_BPM).sort()).toEqual(cat.music.map((m) => m.id).sort());
  });
  it('music prompts state their tempo and every loop fits the memory budget (≤ 45 s)', () => {
    for (const m of cat.music) {
      expect(m.prompt, m.id).toContain(`exactly ${m.bpm} BPM`);
      expect(loopBars(m.bpm) * 240 / m.bpm, m.id).toBeLessThanOrEqual(45);
      expect(loopBars(m.bpm), m.id).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('audio pipeline helpers', () => {
  /** Click track at `bpm`, first beat at `lead` s, with an accented downbeat every 4. */
  const clicks = (bpm: number, lead: number, secs = 40, sr = 11025): Float32Array => {
    const x = new Float32Array(secs * sr);
    for (let k = 0; ; k++) {
      const s = Math.round((lead + (k * 60) / bpm) * sr);
      if (s >= x.length - 200) break;
      for (let i = 0; i < 150; i++) x[s + i] += (k % 4 === 0 ? 1 : 0.6) * Math.exp(-i / 30) * Math.sin(i * 0.9);
    }
    return x;
  };
  it('estimates a drifted tempo and the beat phase', () => {
    const e = estimateTempo(clicks(86.5, 0.37), 11025, 84) as { bpm: number; phase: number };
    expect(Math.abs(e.bpm - 86.5)).toBeLessThan(0.4);
    const period = 60 / e.bpm;
    const off = ((e.phase - 0.37) % period + period) % period;
    expect(Math.min(off, period - off)).toBeLessThan(0.03);
  });
  it('does not lock onto half/double time (search is bounded around the target)', () => {
    const e = estimateTempo(clicks(120, 0.1), 11025, 120) as { bpm: number };
    expect(Math.abs(e.bpm - 120)).toBeLessThan(0.6);
  });
});
