import { describe, expect, it } from 'vitest';
import { arcPts, edgeOf, ink, ngonPts, plotPts, polarPts, starPts, wavePts } from '../src/render/geometry';

const lum = (c: number): number => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

describe('art geometry helpers', () => {
  it('outline is always a lighter tint of the fill (never darker, never a different hue family)', () => {
    for (const fill of [0x3a9bff, 0xff7ae0, 0x7dff8a, 0xffd24a, 0x10301f, 0x808080]) {
      const e = edgeOf(fill);
      expect(lum(e)).toBeGreaterThan(lum(fill));
      const I = ink(fill, 0xffffff);
      expect(I.edge).toBe(e);
      // tint toward white: every channel is >= the fill's channel
      for (const sh of [16, 8, 0]) expect((e >> sh) & 255).toBeGreaterThanOrEqual((fill >> sh) & 255);
    }
  });
  it('builders return the expected point counts and closed curves do not repeat their first point', () => {
    expect(ngonPts(6, 10)).toHaveLength(12);
    expect(starPts(5, 10, 4)).toHaveLength(20);
    expect(plotPts((t) => [Math.cos(t), Math.sin(t)], 0, Math.PI * 2, 40)).toHaveLength(80);
    expect(polarPts(() => 5, 32)).toHaveLength(64);
    const w = wavePts(0, 10, 0, 2, 1, 0, 10);
    expect(w).toHaveLength(22);
    expect(w[0]).toBe(0); expect(w[20]).toBe(10);
    const arc = arcPts(0, 0, 4, 0, Math.PI / 2, 8);
    expect(arc[0]).toBeCloseTo(4); expect(arc[arc.length - 1]).toBeCloseTo(4);
  });
});
