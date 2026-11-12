/** Slow: full-length, non-invulnerable bot runs. Guards pacing and winnability. */
import { describe, expect, it } from 'vitest';
import { Bot, runHeadless } from '../src/sim/bot';
import { World } from '../src/sim/world';
import { C } from './helpers';

describe('full standard runs (no invulnerability)', () => {
  it('a competent bot can win, in roughly the intended run length, growing hugely in power', () => {
    const results: { won: boolean; t: number; lvl: number; bosses: number }[] = [];
    const seeds: [number, string][] = [[1000, 'vanguard'], [8919, 'pyre_warden'], [16838, 'stormcaller'], [24757, 'geomancer'], [32676, 'alchemist'], [40595, 'voidwalker']];
    for (const [seed, cls] of seeds) {
      const w = new World({ content: C, seed, classId: cls });
      runHeadless(w, new Bot('smart', 1), 60 * 40);
      results.push({ won: w.state === 'won', t: w.time / 60, lvl: w.player.level, bosses: w.stats.bosses.length });
    }
    console.log(JSON.stringify(results));
    const wins = results.filter((r) => r.won);
    expect(wins.length, 'at least a third of bot runs win').toBeGreaterThanOrEqual(2);
    for (const r of wins) { expect(r.t).toBeGreaterThan(19); expect(r.t).toBeLessThan(30); expect(r.lvl).toBeGreaterThan(40); }
    expect(results.every((r) => r.t > 4), 'no run collapses in the opening minutes').toBe(true);
  });
});
