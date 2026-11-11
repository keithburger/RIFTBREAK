export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const angDiff = (a: number, b: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
};
/** Rotate angle `a` toward `b` by at most `max` radians. */
export const turn = (a: number, b: number, max: number): number => {
  const d = angDiff(a, b);
  return Math.abs(d) <= max ? b : a + Math.sign(d) * max;
};
/** True when a timer running at `t` crossed a multiple of `interval` during the last `dt`. */
export const every = (t: number, dt: number, interval: number, offset = 0): boolean =>
  Math.floor((t - offset) / interval) > Math.floor((t - dt - offset) / interval);
/** True when timer `t` crossed `moment` during the last `dt`. */
export const at = (t: number, dt: number, moment: number): boolean => t >= moment && t - dt < moment;
export const ease = (t: number): number => t * t * (3 - 2 * t);
