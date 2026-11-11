/**
 * Shape language for all procedural sprites. A Kit paints layered geometric forms with a consistent
 * treatment: dark keyline, gradient body, light rim and emissive cores. Bodies face +x.
 */
type Ctx = CanvasRenderingContext2D;

const rgb = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const lerpC = (a: number, b: number, t: number): number =>
  (Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t) << 16) |
  (Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t) << 8) |
  Math.round((a & 255) + ((b & 255) - (a & 255)) * t);

export interface Kit {
  c: Ctx; col: number; col2: number; r: number;
  body(pts: number[]): void;
  core(pts: number[]): void;
  dark(pts: number[]): void;
  disc(x: number, y: number, rad: number, kind?: number): void;
  line(pts: number[], w: number, bright?: boolean): void;
  ngon(n: number, rad: number, rot?: number, cx?: number, cy?: number): number[];
  star(n: number, r1: number, r2: number, rot?: number, cx?: number, cy?: number): number[];
  eye(x: number, y: number, rad: number): void;
}

export function makeKit(c: Ctx, col: number, col2: number, r: number): Kit {
  const trace = (k: Kit, pts: number[]): void => {
    k.c.beginPath();
    for (let i = 0; i < pts.length; i += 2) i ? k.c.lineTo(pts[i], pts[i + 1]) : k.c.moveTo(pts[i], pts[i + 1]);
    k.c.closePath();
  };
  const paintBody = (k: Kit): void => {
    const c2 = k.c, R = k.r * 1.3;
    c2.lineWidth = 4; c2.strokeStyle = 'rgba(4,6,12,0.9)'; c2.stroke();
    const g = c2.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, rgb(lerpC(k.col, 0xffffff, 0.28)));
    g.addColorStop(0.55, rgb(k.col));
    g.addColorStop(1, rgb(lerpC(k.col, 0x000000, 0.5)));
    c2.fillStyle = g; c2.fill();
    c2.lineWidth = 1.4; c2.strokeStyle = rgb(lerpC(k.col, 0xffffff, 0.55), 0.9); c2.stroke();
  };
  const paintCore = (k: Kit): void => {
    const c2 = k.c;
    c2.save();
    c2.shadowColor = rgb(k.col2); c2.shadowBlur = 10;
    c2.fillStyle = rgb(lerpC(k.col2, 0xffffff, 0.35)); c2.fill();
    c2.restore();
  };
  const k: Kit = {
    c, col, col2, r,
    body(pts) { trace(k, pts); paintBody(k); },
    core(pts) { trace(k, pts); paintCore(k); },
    dark(pts) { trace(k, pts); k.c.fillStyle = 'rgba(6,8,16,0.72)'; k.c.fill(); },
    disc(x, y, rad, kind = 0) {
      k.c.beginPath(); k.c.arc(x, y, rad, 0, Math.PI * 2);
      if (kind === 0) paintBody(k); else if (kind === 1) paintCore(k); else { k.c.fillStyle = 'rgba(6,8,16,0.72)'; k.c.fill(); }
    },
    line(pts, w, bright = false) {
      const c2 = k.c;
      c2.beginPath();
      for (let i = 0; i < pts.length; i += 2) i ? c2.lineTo(pts[i], pts[i + 1]) : c2.moveTo(pts[i], pts[i + 1]);
      c2.lineWidth = w + 2.5; c2.strokeStyle = 'rgba(4,6,12,0.9)'; c2.stroke();
      c2.lineWidth = w; c2.strokeStyle = rgb(bright ? lerpC(k.col2, 0xffffff, 0.3) : lerpC(k.col, 0x000000, 0.15)); c2.stroke();
    },
    ngon(n, rad, rot = 0, cx = 0, cy = 0) {
      const o: number[] = [];
      for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; o.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
      return o;
    },
    star(n, r1, r2, rot = 0, cx = 0, cy = 0) {
      const o: number[] = [];
      for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? r2 : r1; o.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      return o;
    },
    eye(x, y, rad) { k.disc(x, y, rad, 2); k.disc(x + rad * 0.2, y, rad * 0.55, 1); },
  };
  return k;
}

type Body = (k: Kit, v: number) => void;
const sc = (pts: number[], u: number): number[] => pts.map((p) => p * u);

/** Enemy silhouettes. `v` selects a variant so one family yields several distinct looks. */
export const BODIES: Record<string, Body> = {
  slime(k, v) {
    const u = k.r;
    k.body(k.ngon(12, u * 1.05).map((p, i) => (i % 2 ? p * 0.92 : p * (i % 4 === 0 ? 1 : 0.85))));
    if (v === 1) for (const a of [2.4, 3.14, 3.9]) k.disc(Math.cos(a) * u * 1.15, Math.sin(a) * u * 1.15, u * 0.24);
    k.eye(u * 0.3, v === 2 ? 0 : -u * 0.32, u * 0.26);
    if (v !== 2) k.eye(u * 0.3, u * 0.32, u * 0.26);
  },
  beetle(k, v) {
    const u = k.r;
    if (v === 0) { k.body(sc([1.1, 0, 0.5, 0.75, -0.7, 0.8, -1.1, 0.3, -1.1, -0.3, -0.7, -0.8, 0.5, -0.75], u)); k.core(sc([1.55, 0, 0.9, 0.22, 0.9, -0.22], u)); k.line(sc([-0.8, 0, 0.6, 0], u), 1.5); for (const s of [-1, 1]) k.core(sc([0.2, 0.42 * s, -0.3, 0.6 * s, -0.3, 0.3 * s], u)); }
    else { k.body(sc([0.6, 0.85, -1.1, 0.8, -1.1, -0.8, 0.6, -0.85, 1.5, 0], u)); k.dark(sc([0.3, 0.5, -0.8, 0.5, -0.8, -0.5, 0.3, -0.5], u)); k.core(sc([1.5, 0, 0.8, 0.5, 0.95, 0, 0.8, -0.5], u)); for (const s of [-1, 1]) k.disc(-0.5 * u, 0.95 * s * u, u * 0.22); }
  },
  wisp(k, v) {
    const u = k.r;
    for (let i = 0; i <= v; i++) { const o = (i - v / 2) * 0.55; k.body(sc([0.4, o + 0.35, -1.9, o * 1.8, 0.4, o - 0.35], u)); }
    k.disc(0.25 * u, 0, u * 0.8);
    k.disc(0.35 * u, 0, u * 0.4, 1);
  },
  pod(k) {
    const u = k.r;
    for (const s of [-1, 0, 1]) k.body(sc([-0.2, s * 0.5, -1.4, s * 1.0 - 0.3, -1.5, s * 1.0 + 0.3], u));
    k.disc(0, 0, u * 0.95);
    k.dark(k.ngon(8, u * 0.5, 0, u * 0.45, 0));
    k.disc(u * 0.5, 0, u * 0.26, 1);
  },
  mantis(k, v) {
    const u = k.r, L = 1.2 + v * 0.25;
    for (const s of [-1, 1]) { k.body(sc([0.2, 0.3 * s, L, 0.95 * s, L + 0.45, 0.25 * s, L - 0.1, 0.55 * s], u)); }
    k.body(sc([1.0, 0, 0.1, 0.5, -1.3, 0.22, -1.3, -0.22, 0.1, -0.5], u));
    k.core(sc([0.75, 0, 0.35, 0.18, 0.35, -0.18], u));
    if (v) k.line(sc([-1.2, 0, -0.1, 0], u), 1.4, true);
  },
  star(k, v) {
    const u = k.r;
    if (v === 0) { for (let i = 0; i < 6; i++) { const a = i * 1.047; k.disc(Math.cos(a) * u * 0.72, Math.sin(a) * u * 0.72, u * 0.42); } k.disc(0, 0, u * 0.55); k.disc(0, 0, u * 0.28, 1); }
    else { k.body(k.star(4, u * 1.5, u * 0.38)); k.core(k.star(4, u * 0.6, u * 0.16)); }
  },
  worm(k, v) {
    const u = k.r;
    for (let i = 3; i >= 1; i--) k.disc(-i * u * 0.62, Math.sin(i * 1.4) * u * 0.18, u * (0.75 - i * 0.12));
    k.disc(0.1 * u, 0, u * 0.82);
    for (const s of [-1, 1]) k.core(sc([0.6, 0.25 * s, 1.35, 0.45 * s, 0.85, 0.05 * s], u));
    if (v === 1) k.line(sc([-1.9, 0, -0.4, 0], u), 1.6, true);
    if (v === 2) k.dark(k.ngon(6, u * 0.35, 0, u * 0.2, 0));
  },
  dart(k, v) {
    const u = k.r;
    if (v === 0) { k.body(sc([1.3, 0, -0.9, 0.95, -0.4, 0, -0.9, -0.95], u)); k.core(sc([0.6, 0, -0.1, 0.25, -0.1, -0.25], u)); }
    else { k.body(sc([1.9, 0, 0.3, 0.42, -1.2, 0.7, -0.7, 0, -1.2, -0.7, 0.3, -0.42], u)); k.core(sc([1.9, 0, 0.9, 0.16, 0.9, -0.16], u)); k.dark(sc([0.2, 0.2, -0.5, 0.3, -0.5, -0.3, 0.2, -0.2], u)); }
  },
  shield(k, v) {
    const u = k.r;
    k.disc(-0.15 * u, 0, u * 0.85);
    k.eye(-0.05 * u, 0, u * 0.3);
    const c = k.c;
    if (v === 0) { c.beginPath(); c.arc(0, 0, u * 1.15, -1.05, 1.05); c.arc(0, 0, u * 0.9, 1.05, -1.05, true); c.closePath(); c.lineWidth = 4; c.strokeStyle = 'rgba(4,6,12,0.9)'; c.stroke(); c.fillStyle = rgb(k.col2); c.fill(); }
    else if (v === 1) { k.body(sc([0.75, 1.1, 1.15, 1.1, 1.15, -1.1, 0.75, -1.1], u)); k.core(sc([0.88, 0.8, 1.02, 0.8, 1.02, -0.8, 0.88, -0.8], u)); }
    else { k.body(sc([1.45, 0, 0.65, 1.0, 0.65, -1.0], u)); k.core(sc([1.2, 0, 0.8, 0.5, 0.8, -0.5], u)); }
  },
  jelly(k, v) {
    const u = k.r, c = k.c;
    for (let i = 0; i < 3 + v; i++) { const o = (i - (2 + v) / 2) * (1.3 / (2 + v)); k.line([-0.2 * u, o * u, -0.9 * u, o * u * 1.3 + Math.sin(i * 2) * 3, -1.55 * u, o * u * 1.1], 2, i % 2 === 0); }
    c.beginPath(); c.arc(0, 0, u, -1.57, 1.57); c.closePath();
    k.body([]);
    c.beginPath(); c.arc(0, 0, u, -1.57, 1.57); c.closePath();
    c.lineWidth = 4; c.strokeStyle = 'rgba(4,6,12,0.9)'; c.stroke(); c.fillStyle = rgb(k.col); c.fill(); c.lineWidth = 1.4; c.strokeStyle = rgb(lerpC(k.col, 0xffffff, 0.6)); c.stroke();
    k.disc(0.42 * u, 0, u * (v === 2 ? 0.42 : 0.3), 1);
  },
  tank(k, v) {
    const u = k.r;
    for (const s of [-1, 1]) k.body(sc([0.9, 0.62 * s, 0.9, 1.0 * s, -1.0, 1.0 * s, -1.0, 0.62 * s], u));
    k.body(sc([0.8, 0.7, -0.9, 0.7, -0.9, -0.7, 0.8, -0.7], u));
    if (v) { k.body(sc([0.2, 0.42, 1.5, 0.42, 1.5, 0.16, 0.2, 0.16], u)); k.body(sc([0.2, -0.42, 1.5, -0.42, 1.5, -0.16, 0.2, -0.16], u)); }
    else k.body(sc([0.2, 0.16, 1.45, 0.16, 1.45, -0.16, 0.2, -0.16], u));
    k.disc(-0.05 * u, 0, u * 0.46);
    k.disc(-0.05 * u, 0, u * 0.2, 1);
  },
  cluster(k, v) {
    const u = k.r;
    const n = 6 + v;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + 0.3; k.disc(Math.cos(a) * u * 0.68, Math.sin(a) * u * 0.68, u * 0.42); k.disc(Math.cos(a) * u * 0.68, Math.sin(a) * u * 0.68, u * 0.16, 1); }
    k.disc(0, 0, u * 0.56);
    k.eye(u * 0.08, 0, u * 0.3);
  },
  skull(k, v) {
    const u = k.r;
    for (let i = 0; i <= v; i++) for (const s of [-1, 1]) k.body(sc([-0.2 - i * 0.3, 0.75 * s, -0.5 - i * 0.35, 1.45 * s, -0.75 - i * 0.3, 0.7 * s], u));
    k.body(sc([1.05, 0.35, 0.6, 0.9, -0.6, 0.95, -1.05, 0.4, -1.05, -0.4, -0.6, -0.95, 0.6, -0.9, 1.05, -0.35], u));
    for (const s of [-1, 1]) { k.dark(k.ngon(5, u * 0.28, 0, 0.4 * u, 0.38 * s * u)); k.disc(0.45 * u, 0.38 * s * u, u * 0.13, 1); }
    k.core(sc([1.0, 0.2, 0.75, 0.1, 0.75, -0.1, 1.0, -0.2], u));
  },
  wing(k, v) {
    const u = k.r;
    for (const s of [-1, 1]) { k.body(sc([0.3, 0.2 * s, -0.5, 1.6 * s, -1.2, 1.5 * s, -0.5, 0.3 * s], u)); if (v) k.core(sc([-0.3, 0.7 * s, -0.7, 1.35 * s, -0.8, 0.9 * s], u)); }
    k.body(sc([1.25, 0, 0, 0.42, -0.9, 0, 0, -0.42], u));
    k.core(sc([0.7, 0, 0.1, 0.18, 0.1, -0.18], u));
  },
  tree(k) {
    const u = k.r;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; k.body([Math.cos(a - 0.35) * u * 0.6, Math.sin(a - 0.35) * u * 0.6, Math.cos(a) * u * 1.3, Math.sin(a) * u * 1.3, Math.cos(a + 0.35) * u * 0.6, Math.sin(a + 0.35) * u * 0.6]); }
    k.body(k.ngon(7, u * 0.78, 0.22));
    k.dark(k.ngon(7, u * 0.45, 0.22));
    for (const s of [-1, 1]) k.disc(0.2 * u, 0.2 * s * u, u * 0.1, 1);
  },
  drone(k) {
    const u = k.r;
    k.line(sc([-0.9, -0.9, 0.9, 0.9], u), 2.5); k.line(sc([-0.9, 0.9, 0.9, -0.9], u), 2.5);
    for (const [x, y] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) k.disc(x * u * 0.9, y * u * 0.9, u * 0.3);
    k.body(k.ngon(6, u * 0.6));
    k.disc(u * 0.12, 0, u * 0.22, 1);
  },
  saw(k) {
    const u = k.r;
    k.body(k.star(10, u * 1.15, u * 0.72, 0.1));
    k.dark(k.ngon(10, u * 0.5));
    k.disc(0, 0, u * 0.24, 1);
  },
  turret(k, v) {
    const u = k.r;
    k.body(k.ngon(8, u, 0.39));
    k.dark(k.ngon(8, u * 0.7, 0.39));
    if (v === 0) k.body(sc([0.1, 0.2, 1.35, 0.2, 1.35, -0.2, 0.1, -0.2], u));
    else for (const a of [-0.5, 0, 0.5]) k.body([Math.cos(a) * u * 0.3 - Math.sin(a) * 2, Math.sin(a) * u * 0.3 + Math.cos(a) * 2, Math.cos(a) * u * 1.3, Math.sin(a) * u * 1.3, Math.cos(a) * u * 0.3 + Math.sin(a) * 2, Math.sin(a) * u * 0.3 - Math.cos(a) * 2]);
    k.disc(0, 0, u * 0.42);
    k.disc(0, 0, u * 0.2, 1);
  },
  spider(k) {
    const u = k.r;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.line([0, 0, (0.7 - i * 0.55) * u, s * u * 0.9, (1.1 - i * 0.8) * u, s * u * 1.4], 2);
    k.disc(-0.55 * u, 0, u * 0.62);
    k.disc(0.3 * u, 0, u * 0.5);
    k.core(k.ngon(4, u * 0.28, 0, -0.55 * u, 0));
    for (const s of [-1, 1]) k.disc(0.55 * u, 0.18 * s * u, u * 0.1, 1);
  },
  orb(k, v) {
    const u = k.r, c = k.c;
    k.disc(0, 0, u * 0.82);
    c.beginPath(); c.ellipse(0, 0, u * 1.3, u * 0.42, v * 0.6 + 0.4, 0, 6.3); c.lineWidth = 3.5; c.strokeStyle = 'rgba(4,6,12,0.9)'; c.stroke(); c.lineWidth = 1.6; c.strokeStyle = rgb(k.col2); c.stroke();
    if (v === 2) k.core(k.star(4, u * 0.6, u * 0.2)); else if (v === 0) { k.dark(k.ngon(3, u * 0.5, 0)); k.disc(0, 0, u * 0.2, 1); } else k.disc(0, 0, u * 0.36, 1);
  },
  crab(k, v) {
    const u = k.r;
    for (const s of [-1, 1]) { k.body(sc([0.3, 0.8 * s, 1.1, 1.25 * s, 1.5, 0.75 * s, 1.0, 0.85 * s, 1.15, 0.45 * s, 0.6, 0.5 * s], u)); k.line(sc([-0.4, 0.7 * s, -0.9, 1.35 * s], u), 2); k.line(sc([-0.1, 0.8 * s, -0.3, 1.45 * s], u), 2); }
    k.body(sc([0.7, 0, 0.45, 0.85, -0.6, 0.95, -0.95, 0, -0.6, -0.95, 0.45, -0.85], u));
    if (v) k.core(sc([0.1, 0.5, -0.5, 0.55, -0.7, 0, -0.5, -0.55, 0.1, -0.5, 0.25, 0], u)); else k.dark(sc([0.1, 0.5, -0.5, 0.55, -0.7, 0, -0.5, -0.55, 0.1, -0.5], u));
    for (const s of [-1, 1]) k.disc(0.55 * u, 0.25 * s * u, u * 0.12, 1);
  },
  hex(k, v) {
    const u = k.r;
    if (v === 0) { k.body(k.ngon(6, u * 1.1)); k.dark(k.ngon(6, u * 0.78)); k.core(k.ngon(6, u * 0.42)); }
    else { k.body(sc([1.2, 0, 0.1, 0.8, -1.1, 0.5, -0.6, 0, -1.1, -0.5, 0.1, -0.8], u)); k.line(sc([-0.4, 0.3, 0.5, 0.2], u), 1.3, true); k.line(sc([-0.4, -0.3, 0.5, -0.2], u), 1.3, true); }
  },
  crystal(k, v) {
    const u = k.r;
    k.body(sc([-0.2, -0.3, -1.1, -1.0, -0.6, 0.1], u));
    k.body(sc([-0.2, 0.3, -1.0, 1.05, -0.5, 0], u));
    k.body(sc([1.25, 0, 0.3, 0.7, -0.7, 0.35, -0.7, -0.35, 0.3, -0.7], u));
    k.core(sc([1.0, 0, 0.3, 0.38, -0.2, 0, 0.3, -0.38], u));
    if (v >= 1) k.body(sc([0.5, 0.6, 0.2, 1.4, -0.1, 0.7], u));
    if (v === 2) k.body(sc([0.5, -0.6, 0.2, -1.4, -0.1, -0.7], u));
  },
  ring(k, v) {
    const u = k.r, c = k.c;
    c.beginPath(); c.arc(0, 0, u * 0.95, 0, 6.3); c.lineWidth = u * 0.42 + 3; c.strokeStyle = 'rgba(4,6,12,0.9)'; c.stroke(); c.lineWidth = u * 0.42; c.strokeStyle = rgb(k.col); c.stroke(); c.lineWidth = 1.3; c.strokeStyle = rgb(lerpC(k.col, 0xffffff, 0.6)); c.stroke();
    k.disc(0, 0, u * 0.34, 1);
    for (let i = 0; i < 2 + v; i++) { const a = (i / (2 + v)) * 6.283; k.disc(Math.cos(a) * u * 0.95, Math.sin(a) * u * 0.95, u * 0.2, 1); }
  },
  gear(k, v) {
    const u = k.r;
    const pts: number[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; for (const [da, rr] of [[-0.14, 0.8], [-0.1, 1.15], [0.1, 1.15], [0.14, 0.8]]) pts.push(Math.cos(a + da) * u * rr, Math.sin(a + da) * u * rr); }
    k.body(pts);
    k.dark(k.ngon(8, u * 0.56));
    if (v) k.core(k.star(4, u * 0.46, u * 0.18, 0.78)); else k.disc(0, 0, u * 0.28, 1);
  },
  eye(k, v) {
    const u = k.r, c = k.c;
    if (v >= 1) for (let i = 0; i < 6 + v * 2; i++) { const a = (i / (6 + v * 2)) * 6.283; k.body([Math.cos(a - 0.14) * u * 0.9, Math.sin(a - 0.14) * u * 0.9, Math.cos(a) * u * 1.4, Math.sin(a) * u * 1.4, Math.cos(a + 0.14) * u * 0.9, Math.sin(a + 0.14) * u * 0.9]); }
    c.beginPath(); c.moveTo(-u * 1.15, 0); c.quadraticCurveTo(0, -u * 1.1, u * 1.15, 0); c.quadraticCurveTo(0, u * 1.1, -u * 1.15, 0); c.closePath();
    c.lineWidth = 4; c.strokeStyle = 'rgba(4,6,12,0.9)'; c.stroke(); c.fillStyle = rgb(k.col); c.fill(); c.lineWidth = 1.4; c.strokeStyle = rgb(lerpC(k.col, 0xffffff, 0.6)); c.stroke();
    k.disc(u * 0.15, 0, u * 0.5, 2);
    k.disc(u * 0.22, 0, u * 0.28, 1);
  },
  knight(k, v) {
    const u = k.r;
    for (const s of [-1, 1]) k.body(sc([0.2, 0.6 * s, 0.4, 1.3 * s, -0.7, 1.2 * s, -0.8, 0.6 * s], u));
    k.body(sc([1.0, 0, 0.5, 0.75, -0.9, 0.6, -0.9, -0.6, 0.5, -0.75], u));
    k.dark(sc([0.85, 0, 0.5, 0.42, 0.25, 0.42, 0.25, -0.42, 0.5, -0.42], u));
    k.core(sc([0.75, 0.25, 0.4, 0.25, 0.4, 0.1, 0.75, 0.1], u)); k.core(sc([0.75, -0.25, 0.4, -0.25, 0.4, -0.1, 0.75, -0.1], u));
    if (v) k.core(sc([-0.9, 0.25, -1.5, 0, -0.9, -0.25], u)); else k.line(sc([-0.6, 0, 0.1, 0], u), 1.5, true);
  },
  squid(k, v) {
    const u = k.r;
    for (let i = 0; i < 4 + v; i++) { const o = (i - (3 + v) / 2) * (1.2 / (3 + v)); k.line([-0.3 * u, o * u, -1.0 * u, o * u * 1.6 + Math.sin(i * 3) * 4, -1.7 * u, o * u * 1.2], 2.2, i % 2 === 1); }
    k.body(sc([1.35, 0, 0.2, 0.85, -0.5, 0.65, -0.5, -0.65, 0.2, -0.85], u));
    for (const s of [-1, 1]) k.eye(0.15 * u, 0.4 * s * u, u * 0.2);
    if (v) k.core(sc([1.2, 0, 0.7, 0.2, 0.7, -0.2], u));
  },
  book(k) {
    const u = k.r;
    k.body(sc([1.0, 0.85, -1.0, 0.85, -1.0, -0.85, 1.0, -0.85], u));
    k.dark(sc([0.8, 0.65, -0.1, 0.65, -0.1, -0.65, 0.8, -0.65], u));
    k.line(sc([-0.25, 0.8, -0.25, -0.8], u), 2, true);
    for (let i = 0; i < 4; i++) k.core(sc([1.0, -0.6 + i * 0.4, 1.35, -0.5 + i * 0.4, 1.0, -0.4 + i * 0.4], u));
    k.disc(0.35 * u, 0, u * 0.18, 1);
  },
  hound(k, v) {
    const u = k.r;
    k.body(sc([1.4, 0, 0.5, 0.5, -0.4, 0.85, -1.3, 0.3, -0.9, 0, -1.3, -0.3, -0.4, -0.85, 0.5, -0.5], u));
    for (const s of [-1, 1]) { k.body(sc([0.5, 0.4 * s, 0.1, 1.05 * s, -0.1, 0.5 * s], u)); k.disc(0.75 * u, 0.2 * s * u, u * 0.1, 1); }
    if (v) k.core(sc([-0.2, 0.25, -0.9, 0, -0.2, -0.25], u)); else k.line(sc([-0.8, 0, 0.3, 0], u), 1.5, true);
  },
  seg(k) {
    const u = k.r;
    for (const s of [-1, 1]) k.body(sc([0.2, 0.8 * s, -0.5, 1.5 * s, -0.7, 0.7 * s], u));
    k.disc(0, 0, u);
    k.dark(k.ngon(6, u * 0.6));
    k.core(sc([0.5, 0, 0, 0.3, -0.4, 0, 0, -0.3], u));
  },
};

/** Boss bodies: larger, layered, each with its own silhouette. Animated parts are drawn live. */
export const BOSS_BODIES: Record<string, (k: Kit) => void> = {
  mycelial_overmind(k) {
    const u = k.r;
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; k.disc(Math.cos(a) * u * 0.82, Math.sin(a) * u * 0.82, u * 0.4); k.disc(Math.cos(a) * u * 0.82, Math.sin(a) * u * 0.82, u * 0.15, 1); }
    k.body(k.ngon(9, u * 0.85, 0.35));
    k.dark(k.ngon(9, u * 0.6, 0.35));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283 + 0.3; k.core(k.ngon(5, u * 0.12, a, Math.cos(a) * u * 0.36, Math.sin(a) * u * 0.36)); }
    k.eye(0, 0, u * 0.24);
  },
  tempest_conductor(k) {
    const u = k.r;
    k.body(sc([1.5, 0, 0.5, 0.42, -0.2, 0.9, -1.1, 0.5, -0.7, 0, -1.1, -0.5, -0.2, -0.9, 0.5, -0.42], u));
    k.dark(sc([0.7, 0, 0.1, 0.4, -0.5, 0, 0.1, -0.4], u));
    k.core(sc([1.5, 0, 0.9, 0.16, 0.9, -0.16], u));
    k.core(k.star(4, u * 0.3, u * 0.1, 0, -0.05 * u, 0));
    for (const s of [-1, 1]) k.core(sc([-0.6, 0.35 * s, -1.4, 0.75 * s, -0.9, 0.2 * s], u));
  },
  arachnoid_siege_engine(k) {
    const u = k.r;
    k.body(sc([-0.3, 0.6, -1.1, 0.8, -1.35, 0, -1.1, -0.8, -0.3, -0.6], u));
    k.dark(sc([-0.5, 0.4, -1.0, 0.5, -1.15, 0, -1.0, -0.5, -0.5, -0.4], u));
    k.body(k.ngon(8, u * 0.82, 0.39));
    for (const s of [-1, 1]) { k.body(sc([0.2, 0.55 * s, 0.9, 0.75 * s, 0.9, 0.5 * s, 0.3, 0.35 * s], u)); k.core(sc([0.9, 0.72 * s, 1.05, 0.62 * s, 0.9, 0.52 * s], u)); }
    k.dark(k.ngon(8, u * 0.55, 0.39));
    k.body(sc([0.3, 0.14, 1.25, 0.2, 1.25, -0.2, 0.3, -0.14], u));
    k.disc(1.25 * u, 0, u * 0.16, 1);
    k.disc(0, 0, u * 0.3, 1);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + 0.39; k.disc(Math.cos(a) * u * 0.68, Math.sin(a) * u * 0.68, u * 0.06, 1); }
  },
  cinder_colossus(k) {
    const u = k.r;
    for (const s of [-1, 1]) { k.body(sc([0.1, 0.7 * s, 0.6, 1.25 * s, -0.2, 1.45 * s, -0.8, 1.0 * s, -0.5, 0.6 * s], u)); k.core(sc([0.2, 1.05 * s, -0.2, 1.25 * s, -0.4, 0.95 * s], u)); }
    k.body(sc([1.0, 0, 0.7, 0.7, -0.4, 0.9, -1.0, 0.45, -1.0, -0.45, -0.4, -0.9, 0.7, -0.7], u));
    k.core(sc([0.6, 0.1, 0.1, 0.5, -0.1, 0.15, -0.6, 0.3, -0.2, -0.1, -0.5, -0.5, 0.2, -0.3, 0.5, -0.5], u));
    k.dark(sc([0.95, 0.25, 0.6, 0.3, 0.6, -0.3, 0.95, -0.25], u));
    for (const s of [-1, 1]) k.disc(0.78 * u, 0.14 * s * u, u * 0.07, 1);
  },
  tidal_leviathan(k) {
    const u = k.r;
    for (const s of [-1, 1]) { k.body(sc([0, 0.7 * s, -0.6, 1.7 * s, -1.0, 0.8 * s], u)); k.core(sc([-0.3, 0.9 * s, -0.6, 1.4 * s, -0.75, 0.9 * s], u)); }
    k.body(sc([1.6, 0, 0.9, 0.7, -0.5, 1.0, -1.1, 0.5, -1.1, -0.5, -0.5, -1.0, 0.9, -0.7], u));
    for (const s of [-1, 1]) { k.core(sc([1.6, 0.05 * s, 1.0, 0.45 * s, 1.1, 0.1 * s], u)); k.eye(0.45 * u, 0.5 * s * u, u * 0.2); }
    k.dark(sc([0.2, 0.3, -0.7, 0.3, -0.7, -0.3, 0.2, -0.3], u));
    k.line(sc([-0.6, 0, 0.1, 0], u), 2, true);
  },
  prism_seraph(k) {
    const u = k.r;
    k.body(k.star(6, u * 1.15, u * 0.5, 0.52));
    k.dark(k.ngon(6, u * 0.6));
    k.core(k.star(3, u * 0.55, u * 0.2, 0));
    k.core(k.star(3, u * 0.55, u * 0.2, 1.047));
    k.disc(0, 0, u * 0.16, 2);
  },
  hollow_monarch(k) {
    const u = k.r;
    k.body(sc([0.2, 1.0, -1.3, 1.3, -0.8, 0.5, -1.5, 0, -0.8, -0.5, -1.3, -1.3, 0.2, -1.0, 0.9, -0.5, 0.9, 0.5], u));
    k.dark(k.ngon(7, u * 0.62, 0));
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) k.core([Math.cos(a - 0.12) * u * 0.85, Math.sin(a - 0.12) * u * 0.85, Math.cos(a) * u * (a === 0 ? 1.55 : 1.3), Math.sin(a) * u * (a === 0 ? 1.55 : 1.3), Math.cos(a + 0.12) * u * 0.85, Math.sin(a + 0.12) * u * 0.85]);
    for (const s of [-1, 1]) k.core(sc([0.35, 0.16 * s, 0.1, 0.34 * s, 0.05, 0.12 * s], u));
  },
  rift_sovereign(k) {
    const u = k.r;
    k.body(k.star(8, u * 1.2, u * 0.7, 0.2));
    k.dark(k.ngon(8, u * 0.72, 0.2));
    k.body(k.star(4, u * 0.78, u * 0.3, 0));
    k.core(k.star(4, u * 0.5, u * 0.14, 0.785));
    k.disc(0, 0, u * 0.2, 2);
    k.disc(0, 0, u * 0.1, 1);
  },
};

/** Player craft, one per class look. */
export const PLAYER_SHIPS: ((k: Kit) => void)[] = [
  (k) => { const u = k.r; k.body(sc([1.3, 0, 0.2, 0.9, -1.0, 0.8, -0.6, 0, -1.0, -0.8, 0.2, -0.9], u)); k.dark(sc([0.5, 0, 0, 0.4, -0.4, 0, 0, -0.4], u)); k.core(sc([1.3, 0, 0.7, 0.2, 0.7, -0.2], u)); k.disc(0, 0, u * 0.18, 1); },
  (k) => { const u = k.r; for (const s of [-1, 1]) k.body(sc([0.4, 0.3 * s, 0.9, 1.1 * s, -0.9, 0.9 * s, -0.5, 0.3 * s], u)); k.body(sc([1.35, 0, 0.3, 0.5, -1.0, 0.35, -1.0, -0.35, 0.3, -0.5], u)); k.core(sc([0.9, 0, 0.2, 0.25, -0.3, 0, 0.2, -0.25], u)); },
  (k) => { const u = k.r; k.body(sc([1.4, 0, 0.1, 0.5, -0.5, 1.1, -1.1, 0.4, -0.7, 0, -1.1, -0.4, -0.5, -1.1, 0.1, -0.5], u)); k.core(sc([0.6, -0.5, -0.1, 0, 0.3, 0, -0.4, 0.6, 0.2, 0.05, -0.2, 0.05], u)); },
  (k) => { const u = k.r; k.body(k.ngon(6, u * 1.1, 0)); k.dark(k.ngon(6, u * 0.75, 0)); k.core(k.ngon(4, u * 0.42, 0)); for (const s of [-1, 1]) k.body(sc([0.9, 0.5 * s, 1.35, 0.35 * s, 0.9, 0.15 * s], u)); },
  (k) => { const u = k.r; k.body(sc([1.5, 0, 0, 0.45, -0.6, 1.2, -0.5, 0.3, -1.3, 0, -0.5, -0.3, -0.6, -1.2, 0, -0.45], u)); k.core(sc([1.1, 0, 0.2, 0.2, -0.6, 0, 0.2, -0.2], u)); },
  (k) => { const u = k.r; k.disc(-0.1 * u, 0, u * 0.85); k.dark(k.ngon(6, u * 0.55, 0, -0.1 * u, 0)); k.disc(-0.1 * u, 0, u * 0.28, 1); k.body(sc([1.4, 0, 0.6, 0.35, 0.6, -0.35], u)); for (const s of [-1, 1]) k.disc(-0.7 * u, 0.85 * s * u, u * 0.22, 1); },
  (k) => { const u = k.r; k.body(sc([1.7, 0, 0.3, 0.3, -0.2, 0.9, -1.0, 0.6, -0.6, 0, -1.0, -0.6, -0.2, -0.9, 0.3, -0.3], u)); k.core(sc([1.7, 0, 0.5, 0.14, -0.4, 0, 0.5, -0.14], u)); },
  (k) => { const u = k.r; for (const s of [-1, 1]) { k.body(sc([0.5, 0.2 * s, -0.3, 1.25 * s, -1.4, 1.0 * s, -0.6, 0.25 * s], u)); k.core(sc([-0.3, 0.6 * s, -0.9, 0.95 * s, -0.7, 0.5 * s], u)); } k.body(sc([1.3, 0, 0.1, 0.38, -0.8, 0, 0.1, -0.38], u)); k.disc(0.2 * u, 0, u * 0.15, 1); },
];

/** UI emblem: framed glyph on a tinted tile. `frame` 0 = passive, 1-3 = relic frame styles. */
export function drawEmblem(c: Ctx, glyph: string, col: number, frame: number): void {
  const S = 16;
  c.save();
  const g = c.createLinearGradient(-S, -S, S, S);
  g.addColorStop(0, rgb(lerpC(col, 0x000000, 0.55)));
  g.addColorStop(1, rgb(lerpC(col, 0x000000, 0.86)));
  c.fillStyle = g;
  c.strokeStyle = rgb(col, 0.9);
  c.lineWidth = 1.6;
  c.beginPath();
  if (frame === 0) c.roundRect(-S, -S, S * 2, S * 2, 6);
  else if (frame === 1) for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.5236; c.lineTo(Math.cos(a) * 17.5, Math.sin(a) * 17.5); }
  else if (frame === 2) { c.moveTo(0, -17.5); c.lineTo(17.5, 0); c.lineTo(0, 17.5); c.lineTo(-17.5, 0); }
  else c.arc(0, 0, 16.5, 0, 7);
  c.closePath();
  c.fill();
  c.stroke();
  c.shadowColor = rgb(col); c.shadowBlur = 8;
  c.fillStyle = rgb(lerpC(col, 0xffffff, 0.55));
  c.strokeStyle = c.fillStyle;
  c.lineWidth = 2.4;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const P = (pts: number[], fill = true): void => { c.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? c.lineTo(pts[i], pts[i + 1]) : c.moveTo(pts[i], pts[i + 1]); if (fill) { c.closePath(); c.fill(); } else c.stroke(); };
  const s = frame ? 0.82 : 1;
  c.scale(s, s);
  switch (glyph) {
    case 'blade': P([0, -11, 3.5, -3, 3.5, 5, -3.5, 5, -3.5, -3]); P([-6, 5, 6, 5], false); P([0, 5, 0, 10], false); break;
    case 'bolt': P([3, -11, -6, 1, -1, 1, -3, 11, 6, -2, 1, -2]); break;
    case 'rings': for (const r of [3, 7, 11]) { c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); } break;
    case 'hourglass': P([-7, -10, 7, -10, 0, 0]); P([-7, 10, 7, 10, 0, 0]); break;
    case 'chevrons': for (const x of [-7, -1, 5]) P([x, -8, x + 6, 0, x, 8], false); break;
    case 'triple': for (const [x, y] of [[0, -6], [-6, 5], [6, 5]]) { c.beginPath(); c.arc(x, y, 3.6, 0, 7); c.fill(); } break;
    case 'heart': c.beginPath(); c.moveTo(0, 9); c.bezierCurveTo(-14, -1, -7, -12, 0, -4); c.bezierCurveTo(7, -12, 14, -1, 0, 9); c.fill(); break;
    case 'plus': c.fillRect(-3, -10, 6, 20); c.fillRect(-10, -3, 20, 6); break;
    case 'shield': P([0, -11, 9, -7, 8, 3, 0, 11, -8, 3, -9, -7]); break;
    case 'wing': P([-10, 6, 10, -9, 5, 0, 9, 2, 2, 5, 5, 8]); break;
    case 'magnet': c.lineWidth = 5; c.lineCap = 'butt'; c.beginPath(); c.arc(0, 1, 6.5, 0, Math.PI); c.stroke(); P([-6.5, 1, -6.5, -9], false); P([6.5, 1, 6.5, -9], false); break;
    case 'star': { const o: number[] = []; for (let i = 0; i < 10; i++) { const a = -1.57 + i * 0.628, r = i % 2 ? 4.6 : 11; o.push(Math.cos(a) * r, Math.sin(a) * r); } P(o); break; }
    case 'clover': for (const [x, y] of [[0, -5], [5, 0], [0, 5], [-5, 0]]) { c.beginPath(); c.arc(x, y, 4.4, 0, 7); c.fill(); } break;
    case 'target': c.beginPath(); c.arc(0, 0, 8, 0, 7); c.stroke(); P([0, -12, 0, -5], false); P([0, 12, 0, 5], false); P([-12, 0, -5, 0], false); P([12, 0, 5, 0], false); c.beginPath(); c.arc(0, 0, 2, 0, 7); c.fill(); break;
    case 'burst': { const o: number[] = []; for (let i = 0; i < 16; i++) { const a = i * 0.3927, r = i % 2 ? 5 : 11.5; o.push(Math.cos(a) * r, Math.sin(a) * r); } P(o); break; }
    case 'dash': P([-10, -6, -2, 0, -10, 6]); P([0, -8, 10, 0, 0, 8]); break;
    case 'spear': P([10, -10, 3, -8, 8, -3]); P([6, -6, -10, 10], false); break;
    case 'flask': P([-3, -10, 3, -10, 3, -3, 9, 9, -9, 9, -3, -3]); break;
    case 'drop': c.beginPath(); c.moveTo(0, -11); c.bezierCurveTo(10, 2, 7, 10, 0, 10); c.bezierCurveTo(-7, 10, -10, 2, 0, -11); c.fill(); break;
    case 'fist': P([-8, -6, 8, -6, 10, 2, 6, 9, -6, 9, -10, 2]); break;
    case 'coin': P([0, -11, 8, 0, 0, 11, -8, 0]); break;
    case 'thorn': { const o: number[] = []; for (let i = 0; i < 12; i++) { const a = i * 0.5236, r = i % 2 ? 6 : 12; o.push(Math.cos(a) * r, Math.sin(a) * r); } P(o); break; }
    case 'fang': P([-7, -9, -1, -9, -3, 9]); P([1, -9, 7, -9, 4, 6]); break;
    default: P([-8, 10, -8, -3, 0, -11, 8, -3, 8, 10, 4, 6, 0, 10, -4, 6]); break;
  }
  c.restore();
}
