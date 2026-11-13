/**
 * Shared construction helpers for the Desmos-style art (docs/ART_DIRECTION.md).
 * Everything here is flat: solid fills, crisp strokes, no gradients, no shadows.
 */
import { TOKENS } from '../core/tokens';

export type Ctx = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
export const LINE: number = TOKENS.art.line;

export const rgb = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
export const mixC = (a: number, b: number, t: number): number =>
  (Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t) << 16) |
  (Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t) << 8) |
  Math.round((a & 255) + ((b & 255) - (a & 255)) * t);

/** A sprite's whole palette: fill, an outline that is a lighter tint of the fill, and one accent. */
export interface Ink { fill: number; edge: number; accent: number }
export const edgeOf = (fill: number): number => mixC(fill, 0xffffff, TOKENS.art.edgeTint);
export const ink = (fill: number, accent: number = fill): Ink => ({ fill, edge: edgeOf(fill), accent });

/** Grey levels for runtime-tinted sprites: tint × fill grey = element colour; tint × 255 = lighter edge. */
export const FILL_GREY = `rgb(${TOKENS.art.fillGrey},${TOKENS.art.fillGrey},${TOKENS.art.fillGrey})`;
export const EDGE_WHITE = '#fff';

// ---- path builders (points are flat [x0,y0,x1,y1,…]) -------------------------------------------
export function tracePts(c: Ctx, pts: number[], close = true): void {
  c.beginPath();
  for (let i = 0; i < pts.length; i += 2) i ? c.lineTo(pts[i], pts[i + 1]) : c.moveTo(pts[i], pts[i + 1]);
  if (close) c.closePath();
}

export function ngonPts(n: number, rad: number, rot = 0, cx = 0, cy = 0): number[] {
  const o: number[] = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; o.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
  return o;
}

export function starPts(n: number, r1: number, r2: number, rot = 0, cx = 0, cy = 0): number[] {
  const o: number[] = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, rr = i % 2 ? r2 : r1; o.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  return o;
}

/** Sample a parametric curve (x(t), y(t)) for t in [t0, t1]. */
export function plotPts(f: (t: number) => [number, number], t0 = 0, t1 = TAU, n = 56): number[] {
  const o: number[] = [];
  const m = t1 - t0 >= TAU - 1e-6 ? n : n + 1; // closed curves do not repeat the first point
  for (let i = 0; i < m; i++) { const [x, y] = f(t0 + ((t1 - t0) * i) / n); o.push(x, y); }
  return o;
}

/** Sample a polar curve r(θ). */
export function polarPts(r: (a: number) => number, n = 64, rot = 0, cx = 0, cy = 0): number[] {
  return plotPts((a) => { const rr = r(a); return [cx + Math.cos(a + rot) * rr, cy + Math.sin(a + rot) * rr]; }, 0, TAU, n);
}

/** A sine wave from x0 to x1 about height y: y + amp·sin(2π·cycles·s + phase), s in [0,1]. */
export function wavePts(x0: number, x1: number, y: number, amp: number, cycles: number, phase = 0, n = 16): number[] {
  const o: number[] = [];
  for (let i = 0; i <= n; i++) { const s = i / n; o.push(x0 + (x1 - x0) * s, y + amp * Math.sin(TAU * cycles * s + phase)); }
  return o;
}

/** Points on an arc (a0→a1) of radius r. */
export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 20): number[] {
  return plotPts((a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r], a0, a1, n);
}

/** Run `fn(i, angle)` n times with the canvas rotated about the origin (a repeated construction). */
export function repeat(c: Ctx, n: number, fn: (i: number, a: number) => void, a0 = 0, step = TAU / n): void {
  for (let i = 0; i < n; i++) { const a = a0 + i * step; c.save(); c.rotate(a); fn(i, a); c.restore(); }
}

// ---- flat painters for runtime-tinted (white-authored) sprites -----------------------------------
/** Fill the current path flat grey and outline it in white (→ element colour + lighter edge when tinted). */
export function flat(c: Ctx, w = LINE): void {
  c.fillStyle = FILL_GREY; c.strokeStyle = EDGE_WHITE; c.lineWidth = w;
  c.lineJoin = 'miter'; c.miterLimit = 3;
  c.fill(); c.stroke();
}
/** Stroke the current path as a single white line. */
export function wire(c: Ctx, w = LINE * 1.4): void {
  c.strokeStyle = EDGE_WHITE; c.lineWidth = w; c.lineJoin = 'round'; c.stroke();
}
/** A thick band: lighter outline stroke underneath, fill-grey stroke on top (tinted: edge lighter than fill). */
export function bandStroke(c: Ctx, w: number): void {
  c.lineCap = 'butt';
  c.strokeStyle = EDGE_WHITE; c.lineWidth = w + LINE * 2; c.stroke();
  c.strokeStyle = FILL_GREY; c.lineWidth = w; c.stroke();
}
