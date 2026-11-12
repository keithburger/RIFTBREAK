import { describe, expect, it } from 'vitest';
import { applyOps, describeOp, parseOp, previewOps } from '../src/core/ops';
import { Grid } from '../src/core/grid';
import { Rng } from '../src/core/rng';

describe('ops DSL', () => {
  it('parses add, multiply and assign', () => {
    expect(parseOp('dmg*1.25')).toEqual({ path: 'dmg', op: '*', value: 1.25 });
    expect(parseOp('count+1')).toEqual({ path: 'count', op: '+', value: 1 });
    expect(parseOp('aim=facing')).toEqual({ path: 'aim', op: '=', value: 'facing' });
    expect(() => parseOp('nonsense')).toThrow();
  });
  it('applies nested paths and creates missing objects', () => {
    const o = applyOps({ dmg: 10, x: {} } as Record<string, unknown>, ['dmg*2', 'zone.r=40', 'zone.r*1.5', 'x.flag=1', 'color=0xff0000']);
    expect(o.dmg).toBe(20);
    expect(o.zone).toEqual({ r: 60 });
    expect(o.x).toEqual({ flag: 1 });
    expect(o.color).toBe(0xff0000);
  });
  it('describes and previews changes', () => {
    expect(describeOp('dmg*1.3')).toBe('Damage +30%');
    expect(describeOp('cooldown*0.92')).toBe('Cooldown -8%');
    expect(previewOps({ dmg: 10, count: 1 }, ['dmg*1.5', 'count+1'])).toEqual(['Damage 10 → 15', 'Amount 1 → 2']);
  });
});

describe('core utilities', () => {
  it('rng is deterministic per seed', () => {
    const a = new Rng(5), b = new Rng(5), c = new Rng(6);
    const sa = Array.from({ length: 20 }, () => a.next());
    expect(sa).toEqual(Array.from({ length: 20 }, () => b.next()));
    expect(sa).not.toEqual(Array.from({ length: 20 }, () => c.next()));
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });
  it('grid query returns exactly the overlapping circles, once each', () => {
    const g = new Grid<{ x: number; y: number; r: number; _q: number; id: number }>(72);
    const items = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 37 - 300, y: Math.floor(i / 20) * 41 - 300, r: 5 + (i % 9) * 12, _q: 0, id: i }));
    for (const it of items) g.insert(it);
    for (const [qx, qy, qr] of [[0, 0, 90], [-250, 200, 30], [120, -80, 300]]) {
      const got = g.query(qx, qy, qr).map((i) => i.id).sort((a, b) => a - b);
      const want = items.filter((i) => Math.hypot(i.x - qx, i.y - qy) <= qr + i.r).map((i) => i.id);
      expect(got).toEqual(want);
    }
  });
});
