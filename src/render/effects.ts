/** Visual effects: implements the sim's FxSink with pooled particles, rings, lines and text. */
import type { FxSink } from '../sim/fx';
import { L, type Draw } from './renderer';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: number; rot: number; spin: number; kind: number }
interface Ring { x: number; y: number; r: number; color: number; life: number; max: number }
interface Line { x1: number; y1: number; x2: number; y2: number; color: number; width: number; life: number; max: number }
interface Slash { x: number; y: number; r: number; ang: number; half: number; color: number; life: number; max: number; style: number }
interface Txt { x: number; y: number; s: string; color: number; size: number; life: number; max: number; vy: number }

export interface FxSettings { shake: number; flash: number; quality: number; dmgNumbers: boolean }
const BUDGET = [140, 420, 900, 1600];

export class FxSystem implements FxSink {
  particles: Particle[] = [];
  private pool: Particle[] = [];
  rings: Ring[] = [];
  lines: Line[] = [];
  slashes: Slash[] = [];
  texts: Txt[] = [];
  shakeAmt = 0;
  shakeX = 0;
  shakeY = 0;
  flashCol = 0xffffff;
  flashA = 0;
  settings: FxSettings = { shake: 1, flash: 1, quality: 2, dmgNumbers: true };
  onSfx: (name: string) => void = () => {};
  onBanner: (title: string, sub: string, color: number) => void = () => {};
  /** Only effects inside this rect are spawned (set each frame from the camera). */
  view = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };

  private vis(x: number, y: number): boolean { const v = this.view; return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1; }

  particle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: number, kind = 0): void {
    if (this.particles.length >= BUDGET[this.settings.quality]) return;
    const p = this.pool.pop() ?? ({} as Particle);
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.size = size; p.color = color; p.kind = kind;
    p.rot = Math.random() * 6.28; p.spin = (Math.random() - 0.5) * 10;
    this.particles.push(p);
  }
  burst(x: number, y: number, color: number, n: number, speed: number, size = 3): void {
    if (!this.vis(x, y)) return;
    const q = this.settings.quality;
    n = Math.max(1, Math.round(n * (q === 0 ? 0.3 : q === 1 ? 0.6 : 1)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * (0.3 + Math.random() * 0.7);
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.35, size * (0.6 + Math.random() * 0.8), color, i % 3 === 0 ? 1 : 0);
    }
  }
  ring(x: number, y: number, r: number, color: number, dur = 0.3): void { if (this.vis(x, y) && this.rings.length < 160) this.rings.push({ x, y, r, color, life: dur, max: dur }); }
  line(x1: number, y1: number, x2: number, y2: number, color: number, width = 2, dur = 0.15): void { if ((this.vis(x1, y1) || this.vis(x2, y2)) && this.lines.length < 260) this.lines.push({ x1, y1, x2, y2, color, width, life: dur, max: dur }); }
  slash(x: number, y: number, r: number, ang: number, half: number, color: number, dur: number, style: number): void { if (this.vis(x, y) && this.slashes.length < 120) this.slashes.push({ x, y, r, ang, half, color, life: dur, max: dur, style }); }
  text(x: number, y: number, s: string, color: number, size = 12): void {
    if (!this.vis(x, y) || this.texts.length > 90) return;
    this.texts.push({ x, y, s: s.toUpperCase().replace(/[^A-Z0-9+\-%!.:/ ]/g, ''), color, size, life: 0.9, max: 0.9, vy: -36 });
  }
  dmg(x: number, y: number, amount: number, crit: boolean, color: number): void {
    if (!this.settings.dmgNumbers || !this.vis(x, y)) return;
    const cap = crit ? 70 : this.settings.quality >= 2 ? 44 : 18;
    if (this.texts.length > cap) return;
    const v = amount >= 10000 ? Math.round(amount / 1000) + 'K' : String(Math.max(1, Math.round(amount)));
    this.texts.push({ x: x + (Math.random() - 0.5) * 14, y, s: crit ? v + '!' : v, color: crit ? 0xffe14a : color, size: crit ? 17 : 11, life: 0.6, max: 0.6, vy: -55 });
  }
  shake(amount: number): void { this.shakeAmt = Math.min(22, Math.max(this.shakeAmt, amount * this.settings.shake)); }
  flash(color: number, amount: number): void { const a = amount * this.settings.flash; if (a > this.flashA) { this.flashA = a; this.flashCol = color; } }
  sfx(name: string): void { this.onSfx(name); }
  banner(title: string, sub: string, color: number): void { this.onBanner(title, sub, color); }

  update(dt: number): void {
    const ps = this.particles;
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { this.pool.push(p); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - Math.min(1, dt * 3.5);
      p.vx *= k; p.vy *= k; p.rot += p.spin * dt;
      ps[n++] = p;
    }
    ps.length = n;
    const age = <T extends { life: number }>(arr: T[]): void => { let m = 0; for (let i = 0; i < arr.length; i++) { arr[i].life -= dt; if (arr[i].life > 0) arr[m++] = arr[i]; } arr.length = m; };
    age(this.rings); age(this.lines); age(this.slashes); age(this.texts);
    for (const t of this.texts) { t.y += t.vy * dt; t.vy *= 1 - Math.min(1, dt * 3); }
    if (this.shakeAmt > 0.1) {
      this.shakeX = (Math.random() - 0.5) * 2 * this.shakeAmt; this.shakeY = (Math.random() - 0.5) * 2 * this.shakeAmt;
      this.shakeAmt *= Math.exp(-9 * dt);
    } else this.shakeX = this.shakeY = this.shakeAmt = 0;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 1.8);
  }

  draw(d: Draw): void {
    const r = d.r;
    for (const p of this.particles) {
      const t = p.life / p.max;
      if (p.kind === 1) r.sprite(L.FX, 'shardp', p.x, p.y, Math.atan2(p.vy, p.vx), p.size * 0.22 * (0.5 + t), p.size * 0.22, p.color, t);
      else r.sprite(L.FX, 'soft', p.x, p.y, 0, (p.size * (0.4 + t * 0.6)) / 14, (p.size * (0.4 + t * 0.6)) / 14, p.color, t);
    }
    for (const g of this.rings) {
      const t = 1 - g.life / g.max, e = 1 - (1 - t) * (1 - t);
      // big rings use the thin stroke so large shockwaves stay readable instead of flooding the screen
      const big = g.r > 100;
      d.circle(L.FX, big ? 'ring' : 'ring2', g.x, g.y, g.r * (0.25 + 0.75 * e), g.color, (1 - t) * (big ? 0.7 : 0.9));
    }
    for (const l of this.lines) {
      const t = l.life / l.max;
      d.line(L.FX, l.x1, l.y1, l.x2, l.y2, l.width * 1.8, l.color, t * 0.9, true);
      d.line(L.FX, l.x1, l.y1, l.x2, l.y2, Math.max(1, l.width * 0.6 * t), 0xffffff, t);
    }
    for (const s of this.slashes) {
      const t = s.life / s.max;
      const n = Math.max(1, Math.ceil(s.half / 0.5));
      const sweep = s.style === 0 ? (1 - t) * 0.5 : 0;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * (s.half - 0.45);
        r.sprite(L.FX, 'slash', s.x, s.y, s.ang + off + sweep, (s.r / 62) * (s.style ? 0.6 + (1 - t) * 0.4 : 1), s.r / 62, s.color, t * (s.style ? 0.5 : 0.9));
      }
    }
    for (const x of this.texts) {
      const t = x.life / x.max;
      d.text(L.TOP, x.s, x.x, x.y, x.size * (t > 0.85 ? 1 + (t - 0.85) * 4 : 1), x.color, Math.min(1, t * 2.5));
    }
  }

  clear(): void { this.particles.length = this.rings.length = this.lines.length = this.slashes.length = this.texts.length = 0; this.shakeAmt = 0; this.flashA = 0; }
}
