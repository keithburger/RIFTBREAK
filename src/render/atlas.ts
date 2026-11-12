/**
 * Procedural art atlas. Every sprite in the game is drawn here with Canvas 2D at startup and
 * packed into one texture page, so both renderer backends batch everything in a single draw path.
 * Sprites that get tinted at runtime (projectiles, particles, glyphs) are authored in white.
 */
import { hashStr } from '../core/rng';
import type { BiomeDef, ContentDB } from '../sim/types';
import { BODIES, BOSS_BODIES, PLAYER_SHIPS, drawEmblem, type Kit, makeKit } from './shapes';

export const ATLAS_SCALE = 2;
const PAGE = 4096;
type Ctx = CanvasRenderingContext2D;

export interface Frame { x: number; y: number; w: number; h: number }

export const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
export const mix = (a: number, b: number, t: number): number => {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

export class Atlas {
  page: HTMLCanvasElement;
  frames = new Map<string, Frame>();
  backgrounds: HTMLCanvasElement[] = [];
  private ctx: Ctx;
  private px = 2;
  private py = 2;
  private rowH = 0;
  private icons = new Map<string, string>();

  constructor() {
    this.page = document.createElement('canvas');
    this.page.width = this.page.height = PAGE;
    this.ctx = this.page.getContext('2d')!;
  }

  /** Add a sprite of logical size w×h. `draw` paints around the origin at the sprite centre. */
  add(key: string, w: number, h: number, draw: (c: Ctx) => void): void {
    const pw = Math.ceil(w * ATLAS_SCALE), ph = Math.ceil(h * ATLAS_SCALE);
    if (this.px + pw + 2 > PAGE) { this.px = 2; this.py += this.rowH + 2; this.rowH = 0; }
    if (this.py + ph + 2 > PAGE) { console.warn('atlas full, skipping', key); return; }
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(this.px, this.py, pw, ph);
    c.clip();
    c.translate(this.px + pw / 2, this.py + ph / 2);
    c.scale(ATLAS_SCALE, ATLAS_SCALE);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    draw(c);
    c.restore();
    this.frames.set(key, { x: this.px, y: this.py, w: pw, h: ph });
    this.px += pw + 2;
    if (ph > this.rowH) this.rowH = ph;
  }

  /** Data URL of a sprite for DOM UI, optionally tinted and framed. Cached. */
  icon(key: string, tint = 0xffffff, bg = 0): string {
    const id = key + tint + '_' + bg;
    let url = this.icons.get(id);
    if (url) return url;
    const f = this.frames.get(key) ?? this.frames.get('p_bolt')!;
    const S = 72;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d')!;
    const sc = Math.min((S * 0.74) / f.w, (S * 0.74) / f.h);
    c.drawImage(this.page, f.x, f.y, f.w, f.h, (S - f.w * sc) / 2, (S - f.h * sc) / 2, f.w * sc, f.h * sc);
    if (tint !== 0xffffff) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = css(tint, 0.82); c.fillRect(0, 0, S, S); }
    if (bg) {
      c.globalCompositeOperation = 'destination-over';
      const g = c.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.62);
      g.addColorStop(0, css(mix(bg, 0, 0.45)));
      g.addColorStop(1, css(mix(bg, 0, 0.86)));
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
    }
    url = cv.toDataURL();
    this.icons.set(id, url);
    return url;
  }
}

// ----------------------------------------------------------------------------------------------
const glow = (c: Ctx, col: string, blur: number): void => { c.shadowColor = col; c.shadowBlur = blur * ATLAS_SCALE; };

function basics(a: Atlas): void {
  a.add('px', 4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(-2, -2, 4, 4); });
  a.add('disc', 64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 31, 0, 7); c.fill(); });
  a.add('soft', 64, 64, (c) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); });
  a.add('glow', 96, 96, (c) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 48); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.25, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-48, -48, 96, 96); });
  a.add('pool', 128, 128, (c) => { const g = c.createRadialGradient(0, 0, 10, 0, 0, 63); g.addColorStop(0, 'rgba(255,255,255,0.20)'); g.addColorStop(0.8, 'rgba(255,255,255,0.34)'); g.addColorStop(0.93, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 63, 0, 7); c.fill(); });
  a.add('ring', 128, 128, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 61, 0, 7); c.stroke(); });
  a.add('ring2', 128, 128, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 7; glow(c, '#fff', 4); c.beginPath(); c.arc(0, 0, 56, 0, 7); c.stroke(); });
  a.add('dash_ring', 128, 128, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([9, 8]); c.beginPath(); c.arc(0, 0, 60, 0, 7); c.stroke(); });
  a.add('swirl', 128, 128, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 3; for (let k = 0; k < 4; k++) { c.beginPath(); for (let t = 0; t <= 1; t += 0.05) { const r = 8 + t * 52, an = k * 1.57 + t * 3.2; const x = Math.cos(an) * r, y = Math.sin(an) * r; t === 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.globalAlpha = 0.75; c.stroke(); } });
  a.add('beam', 16, 32, (c) => { const g = c.createLinearGradient(0, -16, 0, 16); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,0.75)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(0.65, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-8, -16, 16, 32); });
  a.add('spark', 32, 32, (c) => { c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 : 15, an = (i / 8) * Math.PI * 2; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.fill(); });
  a.add('shardp', 20, 12, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, 4); c.lineTo(-9, 0); c.lineTo(-6, -4); c.fill(); });
  a.add('slash', 128, 128, (c) => { const g = c.createRadialGradient(0, 0, 30, 0, 0, 62); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.55)'); g.addColorStop(0.95, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 62, -0.5, 0.5); c.fill(); });
  a.add('tri', 24, 24, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(10, 0); c.lineTo(-8, 8); c.lineTo(-8, -8); c.fill(); });
  a.add('vignette', 8, 8, (c) => { c.fillStyle = '#000'; c.fillRect(-4, -4, 8, 8); });
}

function glyphs(a: Atlas): void {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-%!.:/';
  for (const ch of chars)
    a.add('g_' + ch, 18, 26, (c) => {
      c.font = "800 22px 'Trebuchet MS','Segoe UI',system-ui,sans-serif";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(ch, 0, 1);
      c.fillStyle = '#fff';
      c.fillText(ch, 0, 1);
    });
}

/** White projectile / weapon-icon sprites, tinted with the element colour at draw time. */
function projectiles(a: Atlas): void {
  const W = '#fff', G = 'rgba(255,255,255,0.55)';
  const P = (key: string, w: number, h: number, d: (c: Ctx) => void): void => a.add(key, w, h, (c) => { c.fillStyle = W; c.strokeStyle = W; c.lineWidth = 2; d(c); });
  const path = (c: Ctx, pts: number[], close = true): void => { c.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? c.lineTo(pts[i], pts[i + 1]) : c.moveTo(pts[i], pts[i + 1]); if (close) c.closePath(); };
  P('p_bolt', 30, 14, (c) => { path(c, [14, 0, 2, 5, -13, 2, -13, -2, 2, -5]); c.fill(); });
  P('p_shard', 30, 14, (c) => { path(c, [14, 0, -2, 6, -13, 0, -2, -6]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.25)'; path(c, [14, 0, -2, 6, -13, 0]); c.fill(); });
  P('p_bomb', 28, 28, (c) => { c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill(); c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(-2, 2, 6, 0, 7); c.fill(); c.fillStyle = W; path(c, [7, -9, 12, -13, 13, -8]); c.fill(); });
  P('p_cone', 34, 34, (c) => { for (let i = 0; i < 3; i++) { c.globalAlpha = 1 - i * 0.28; c.beginPath(); c.moveTo(-12, 0); c.arc(-12, 0, 12 + i * 8, -0.5, 0.5); c.fill(); } });
  P('p_ring', 34, 34, (c) => { c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill(); for (let i = 0; i < 8; i++) { const an = (i / 8) * 6.283; path(c, [Math.cos(an) * 14, Math.sin(an) * 14, Math.cos(an) * 17, Math.sin(an) * 17], false); c.stroke(); } });
  P('p_blade', 36, 20, (c) => { path(c, [16, 0, 2, 8, -15, 3, -9, 0, -15, -3, 2, -8]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.22)'; path(c, [16, 0, 2, 8, -15, 3, -9, 0]); c.fill(); });
  P('p_mine', 28, 28, (c) => { for (let i = 0; i < 6; i++) { const an = (i / 6) * 6.283; path(c, [Math.cos(an) * 12, Math.sin(an) * 12, Math.cos(an + 0.35) * 7, Math.sin(an + 0.35) * 7, Math.cos(an - 0.35) * 7, Math.sin(an - 0.35) * 7]); c.fill(); } c.beginPath(); c.arc(0, 0, 7.5, 0, 7); c.fill(); c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(0, 0, 3, 0, 7); c.fill(); });
  P('p_beam', 34, 34, (c) => { c.lineWidth = 6; path(c, [-14, 10, 14, -10], false); c.stroke(); c.lineWidth = 2; path(c, [-14, 3, 9, -15], false); c.stroke(); path(c, [-9, 15, 14, -3], false); c.stroke(); });
  P('p_zap', 34, 34, (c) => { path(c, [4, -15, -8, 2, -1, 2, -5, 15, 9, -3, 2, -3]); c.fill(); });
  P('p_drone', 34, 34, (c) => { path(c, [14, 0, 0, 8, -10, 5, -6, 0, -10, -5, 0, -8]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(3, 0, 3.5, 0, 7); c.fill(); c.fillStyle = W; c.fillRect(-13, -12, 8, 3); c.fillRect(-13, 9, 8, 3); });
  P('p_strike', 34, 34, (c) => { path(c, [2, -16, -7, -1, 0, -1, -4, 9, 8, -5, 1, -5]); c.fill(); c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 12, 11, 3.5, 0, 0, 7); c.stroke(); });
  P('p_whip', 34, 34, (c) => { c.lineWidth = 4; c.beginPath(); c.moveTo(-14, 10); c.bezierCurveTo(-4, -16, 4, 14, 15, -10); c.stroke(); c.beginPath(); c.arc(15, -10, 3, 0, 7); c.fill(); });
  P('p_glob', 26, 22, (c) => { c.beginPath(); c.arc(3, 0, 8, 0, 7); c.fill(); path(c, [-2, 6, -12, 0, -2, -6]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(5, 2, 4, 0, 7); c.fill(); });
  P('p_aura', 34, 34, (c) => { c.globalAlpha = 0.5; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill(); c.globalAlpha = 1; for (let i = 0; i < 5; i++) { const an = i * 1.256; c.beginPath(); c.arc(Math.cos(an) * 8, Math.sin(an) * 8, 3, 0, 7); c.fill(); } });
  P('p_trail', 34, 34, (c) => { for (let i = 0; i < 4; i++) { c.globalAlpha = 0.4 + i * 0.2; c.beginPath(); c.arc(-12 + i * 8, 8 - i * 5, 3 + i * 1.6, 0, 7); c.fill(); } });
  P('p_mote', 22, 18, (c) => { c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, 7); c.fill(); path(c, [-6, 0, -11, -5, -9, 0, -11, 5]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(4, 0, 1.8, 0, 7); c.fill(); });
  P('p_spore', 18, 18, (c) => { c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill(); for (let i = 0; i < 6; i++) { const an = i * 1.047; c.beginPath(); c.arc(Math.cos(an) * 7, Math.sin(an) * 7, 1.6, 0, 7); c.fill(); } });
  P('p_wave', 40, 100, (c) => { c.lineWidth = 7; c.beginPath(); c.arc(-34, 0, 48, -0.95, 0.95); c.stroke(); c.lineWidth = 3; c.globalAlpha = 0.6; c.beginPath(); c.arc(-40, 0, 44, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(-46, 0, 40, -0.6, 0.6); c.stroke(); });
  P('p_bubble', 30, 30, (c) => { c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 12, 0, 7); c.stroke(); c.globalAlpha = 0.28; c.fill(); c.globalAlpha = 1; c.beginPath(); c.arc(-4, -4, 3, 0, 7); c.fill(); });
  P('p_geyser', 34, 34, (c) => { path(c, [-5, 14, -3, -4, -9, -8, 0, -15, 9, -8, 3, -4, 5, 14]); c.fill(); c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 13, 12, 3, 0, 0, 7); c.stroke(); });
  P('p_drop', 20, 26, (c) => { path(c, [0, -12, 6, 2, 0, 10, -6, 2]); c.fill(); });
  P('p_crescent', 34, 34, (c) => { c.beginPath(); c.arc(0, 0, 15, -1.9, 1.9); c.arc(-7, 0, 13, 1.5, -1.5, true); c.fill(); });
  P('p_twister', 34, 34, (c) => { c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(Math.sin(i) * 2, -12 + i * 8, 14 - i * 3, 3.5, 0, 0, 7); c.stroke(); } });
  P('p_slash', 34, 34, (c) => { c.beginPath(); c.arc(-8, 0, 22, -0.9, 0.9); c.arc(-14, 0, 20, 0.7, -0.7, true); c.fill(); });
  P('p_feather', 26, 12, (c) => { path(c, [12, 0, 2, 4, -11, 3, -6, 0, -11, -3, 2, -4]); c.fill(); });
  P('p_rock', 34, 34, (c) => { path(c, [14, -2, 9, 10, -3, 14, -13, 6, -14, -5, -5, -13, 7, -12]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.28)'; path(c, [14, -2, 9, 10, -3, 14, -13, 6, -2, 1]); c.fill(); c.strokeStyle = G; path(c, [-5, -13, -2, 1, 14, -2], false); c.stroke(); });
  P('p_fissure', 34, 34, (c) => { c.lineWidth = 4; path(c, [-15, 6, -6, -2, 0, 5, 7, -6, 15, -1], false); c.stroke(); c.lineWidth = 2; path(c, [-6, -2, -9, -12], false); c.stroke(); path(c, [7, -6, 10, -14], false); c.stroke(); path(c, [0, 5, 2, 14], false); c.stroke(); });
  P('p_spire', 30, 40, (c) => { path(c, [0, -18, 7, 2, 4, 16, -4, 16, -7, 2]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.28)'; path(c, [0, -18, 7, 2, 4, 16, 0, 16]); c.fill(); c.fillStyle = W; path(c, [-11, 16, -8, 4, -5, 16]); c.fill(); path(c, [11, 16, 9, 7, 6, 16]); c.fill(); });
  P('p_missile', 26, 12, (c) => { path(c, [12, 0, 5, 4, -8, 4, -12, 6, -10, 0, -12, -6, -8, -4, 5, -4]); c.fill(); });
  P('p_turret', 34, 34, (c) => { path(c, [-10, -10, 2, -10, 8, -4, 8, 4, 2, 10, -10, 10]); c.fill(); c.fillRect(6, -2.5, 10, 5); c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(-2, 0, 4, 0, 7); c.fill(); });
  P('p_sweep', 34, 34, (c) => { c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.stroke(); c.lineWidth = 5; path(c, [0, 0, 13, -5], false); c.stroke(); c.beginPath(); c.arc(0, 0, 4, 0, 7); c.fill(); });
  P('p_well', 34, 34, (c) => { c.lineWidth = 2.5; for (let k = 0; k < 3; k++) { c.beginPath(); for (let t = 0; t <= 1; t += 0.08) { const r = 3 + t * 12, an = k * 2.09 + t * 3; t === 0 ? c.moveTo(Math.cos(an) * r, Math.sin(an) * r) : c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.stroke(); } c.beginPath(); c.arc(0, 0, 3.5, 0, 7); c.fill(); });
  P('p_ray', 34, 34, (c) => { c.lineWidth = 4; path(c, [-15, 8, -2, -4, 4, 6, 15, -10], false); c.stroke(); path(c, [-2, -4, 2, -9, 6, -4, 2, 1]); c.fill(); });
  P('p_disc', 30, 30, (c) => { c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.stroke(); for (let i = 0; i < 4; i++) { const an = i * 1.57; path(c, [Math.cos(an) * 14, Math.sin(an) * 14, Math.cos(an + 0.5) * 9, Math.sin(an + 0.5) * 9, Math.cos(an - 0.2) * 9, Math.sin(an - 0.2) * 9]); c.fill(); } });
  P('p_sigil', 34, 34, (c) => { c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.stroke(); path(c, [0, -11, 9.5, 5.5, -9.5, 5.5]); c.stroke(); path(c, [0, 11, 9.5, -5.5, -9.5, -5.5]); c.stroke(); });
  P('p_spear', 44, 12, (c) => { path(c, [21, 0, 8, 4.5, 6, 1.5, -20, 1.5, -20, -1.5, 6, -1.5, 8, -4.5]); c.fill(); });
  P('p_void', 64, 64, (c) => { const g = c.createRadialGradient(0, 0, 4, 0, 0, 30); g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(0.7, 'rgba(255,255,255,0.55)'); g.addColorStop(0.9, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.fill(); });
  P('p_shade', 34, 34, (c) => { path(c, [14, 0, 2, 7, -4, 13, -13, 9, -7, 3, -14, 0, -7, -3, -13, -9, -4, -13, 2, -7]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.6)'; path(c, [7, -2, 3, -3, 3, -1]); c.fill(); path(c, [7, 2, 3, 3, 3, 1]); c.fill(); });
  P('p_curse', 34, 34, (c) => { c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 0, 14, 8, 0, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill(); for (let i = 0; i < 5; i++) { path(c, [-10 + i * 5, -9, -11 + i * 5.5, -14], false); c.stroke(); } });
  P('p_rend', 34, 34, (c) => { for (let i = -1; i <= 1; i++) { path(c, [-13 + i * 3, 12 + i * 5, 0 + i * 5, 1 + i * 5, 13 + i * 3, -12 + i * 5, 2 + i * 5, -2 + i * 5]); c.fill(); } });
  P('b_orb', 24, 24, (c) => { c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill(); c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(0, 0, 4.5, 0, 7); c.fill(); });
  P('b_bubble', 28, 28, (c) => { c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.stroke(); c.globalAlpha = 0.4; c.fill(); });
}

function pickups(a: Atlas): void {
  const gem = (key: string, col: number): void => a.add(key, 18, 22, (c) => {
    glow(c, css(col, 0.9), 4);
    const g = c.createLinearGradient(-6, -9, 6, 9); g.addColorStop(0, css(mix(col, 0xffffff, 0.7))); g.addColorStop(1, css(col));
    c.fillStyle = g; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 0); c.lineTo(0, 9); c.lineTo(-6, 0); c.closePath(); c.fill();
    c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(0, -9); c.lineTo(-6, 0); c.lineTo(0, -1); c.fill();
  });
  gem('k_xp0', 0x5ad8ff); gem('k_xp1', 0x7dff8a); gem('k_xp2', 0xffd24a); gem('k_xp3', 0xff7ae0);
  a.add('k_heal', 26, 26, (c) => { glow(c, '#7dffb0', 5); c.fillStyle = '#10301f'; c.strokeStyle = '#7dffb0'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#7dffb0'; c.fillRect(-2, -6, 4, 12); c.fillRect(-6, -2, 12, 4); });
  a.add('k_magnet', 26, 26, (c) => { glow(c, '#7fd8ff', 5); c.strokeStyle = '#7fd8ff'; c.lineWidth = 5; c.lineCap = 'butt'; c.beginPath(); c.arc(0, 1, 7, 0, Math.PI); c.stroke(); c.beginPath(); c.moveTo(-7, 1); c.lineTo(-7, -8); c.moveTo(7, 1); c.lineTo(7, -8); c.stroke(); c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(-7, -8); c.lineTo(-7, -5); c.moveTo(7, -8); c.lineTo(7, -5); c.stroke(); });
  a.add('k_bomb', 26, 26, (c) => { glow(c, '#ffd27f', 5); c.fillStyle = '#3a2a10'; c.strokeStyle = '#ffd27f'; c.lineWidth = 2; c.beginPath(); c.arc(0, 2, 9, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.moveTo(4, -6); c.lineTo(8, -11); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(8, -11, 2, 0, 7); c.fill(); });
  a.add('k_chest', 36, 32, (c) => { glow(c, '#ffd24a', 7); c.fillStyle = '#4a3410'; c.strokeStyle = '#ffd24a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-13, -3); c.lineTo(-9, -11); c.lineTo(9, -11); c.lineTo(13, -3); c.lineTo(13, 11); c.lineTo(-13, 11); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-13, -3); c.lineTo(13, -3); c.stroke(); c.fillStyle = '#fff3b8'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 0); c.lineTo(0, 6); c.lineTo(-4, 0); c.fill(); });
  a.add('k_shard', 18, 22, (c) => { glow(c, '#c77dff', 5); c.fillStyle = '#e8c8ff'; c.beginPath(); c.moveTo(1, -9); c.lineTo(6, -1); c.lineTo(-1, 9); c.lineTo(-6, 1); c.closePath(); c.fill(); c.fillStyle = '#9b5cff'; c.beginPath(); c.moveTo(1, -9); c.lineTo(6, -1); c.lineTo(0, 0); c.fill(); });
  a.add('i_shard', 34, 34, (c) => { glow(c, '#c77dff', 5); c.fillStyle = '#e8c8ff'; c.beginPath(); c.moveTo(2, -14); c.lineTo(10, -2); c.lineTo(-2, 14); c.lineTo(-10, 2); c.closePath(); c.fill(); c.fillStyle = '#9b5cff'; c.beginPath(); c.moveTo(2, -14); c.lineTo(10, -2); c.lineTo(0, 0); c.fill(); });
}

function decor(a: Atlas, biomes: BiomeDef[]): void {
  for (const b of biomes) {
    const k: Kit = makeKit(null as unknown as Ctx, mix(b.pal.line, b.pal.accent, 0.25), mix(b.pal.accent, 0, 0.35), 1);
    b.decor.forEach((key, i) => a.add(key, 96, 96, (c) => {
      k.c = c;
      c.globalAlpha = 0.75;
      const seed = hashStr(key);
      if (i === 0) { for (let j = 0; j < 5; j++) { const an = -1.2 + j * 0.6 + (seed % 7) * 0.05; k.body([0, 10, Math.cos(an - 1.57) * 6 + Math.cos(an) * 22, 10 + Math.sin(an - 1.57) * 6 + Math.sin(an) * -22 - 12, Math.cos(an) * 40, -Math.abs(Math.sin(an + 1.57)) * 38 + 6]); } }
      else if (i === 1) { k.body([-10, 30, -18, 2, -8, -34, 6, -22, 12, 30]); k.body([8, 30, 14, 0, 24, -14, 30, 6, 26, 30]); k.core([-8, -34, -4, -6, -12, 4]); }
      else { k.body(k.ngon(7, 26, seed % 6)); k.core(k.ngon(5, 9, 1)); for (let j = 0; j < 4; j++) { const an = j * 1.57 + 0.4; k.body(k.ngon(4, 7, an, Math.cos(an) * 36, Math.sin(an) * 36)); } }
    }));
  }
}

function backgrounds(a: Atlas, biomes: BiomeDef[]): void {
  for (const b of biomes) {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d')!;
    c.fillStyle = css(b.pal.bg);
    c.fillRect(0, 0, S, S);
    let s = hashStr(b.id);
    const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    // soft tonal blotches (wrapped so the tile is seamless)
    for (let i = 0; i < 26; i++) {
      const x = rnd() * S, y = rnd() * S, r = 50 + rnd() * 120;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, css(i % 3 ? b.pal.bg2 : mix(b.pal.bg2, b.pal.accent, 0.1), 0.5));
        g.addColorStop(1, css(b.pal.bg2, 0));
        c.fillStyle = g;
        c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    c.strokeStyle = css(b.pal.line, 0.42);
    c.lineWidth = 1.5;
    if (b.idx === 1) { // foundry: plate grid + rivets
      for (let i = 0; i < S; i += 128) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, S); c.moveTo(0, i); c.lineTo(S, i); c.stroke(); }
      c.fillStyle = css(b.pal.line, 0.8);
      for (let x = 0; x < S; x += 128) for (let y = 0; y < S; y += 128) for (const [dx, dy] of [[10, 10], [118, 10], [10, 118], [118, 118]]) { c.beginPath(); c.arc(x + dx, y + dy, 2.5, 0, 7); c.fill(); }
      c.strokeStyle = css(b.pal.accent, 0.1); c.lineWidth = 6;
      for (let i = 0; i < 4; i++) { const y = 64 + i * 128; c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
    } else if (b.idx === 2) { // archive: hex tiles + rune dots
      for (let y = 0; y <= S; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x <= S; x += 64) { c.beginPath(); for (let k = 0; k < 6; k++) { const an = k * 1.047 + 0.5236; c.lineTo(x + Math.cos(an) * 36, y + Math.sin(an) * 36); } c.closePath(); c.stroke(); }
      c.fillStyle = css(b.pal.accent, 0.22);
      for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(rnd() * S, rnd() * S, 1.6, 0, 7); c.fill(); }
    } else if (b.idx === 3) { // null expanse: star field + fracture lines
      for (let i = 0; i < 120; i++) { c.fillStyle = css(i % 5 ? b.pal.accent : b.pal.accent2, 0.15 + rnd() * 0.4); const r = rnd() * 1.8 + 0.4; c.beginPath(); c.arc(rnd() * S, rnd() * S, r, 0, 7); c.fill(); }
      for (let i = 0; i < 7; i++) { let x = rnd() * S, y = rnd() * S; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 120; y += (rnd() - 0.5) * 120; c.lineTo(x, y); } c.stroke(); }
    } else { // verdant: organic veins + moss flecks
      for (let i = 0; i < 9; i++) { let x = rnd() * S, y = rnd() * S; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { const nx = x + (rnd() - 0.5) * 180, ny = y + (rnd() - 0.5) * 180; c.quadraticCurveTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 80, nx, ny); x = nx; y = ny; } c.stroke(); }
      for (let i = 0; i < 90; i++) { c.fillStyle = css(i % 4 ? b.pal.line : b.pal.accent, 0.25 + rnd() * 0.3); c.beginPath(); c.arc(rnd() * S, rnd() * S, rnd() * 2.4 + 0.6, 0, 7); c.fill(); }
    }
    a.backgrounds.push(cv);
  }
}

const PASSIVE_GLYPH: Record<string, [string, number]> = {
  might: ['blade', 0xff6a5a], haste: ['bolt', 0xffe94a], reach: ['rings', 0x6ad8ff], linger: ['hourglass', 0xc8a8ff], velocity: ['chevrons', 0x9ae8ff],
  multicast: ['triple', 0xff9cf0], vitality: ['heart', 0xff5a7a], mending: ['plus', 0x7dffb0], plating: ['shield', 0xb8c8d8], swiftness: ['wing', 0xb8ffe0],
  magnet: ['magnet', 0x7fd8ff], insight: ['star', 0xffd24a], fortune: ['clover', 0x8dff4a], precision: ['target', 0xff8a3a], brutality: ['burst', 0xff4a4a],
  blink: ['dash', 0x9b5cff], piercing: ['spear', 0xfff3b8], catalyst: ['flask', 0xff7ae0], virulence: ['drop', 0x8dff4a], impact: ['fist', 0xd9a05a],
  greed: ['coin', 0xc77dff], thorns: ['thorn', 0x5fae6a], leech: ['fang', 0xff5a8a], evasion: ['ghost', 0xc8d8ff],
};
const GLYPHS = ['blade', 'bolt', 'rings', 'hourglass', 'chevrons', 'triple', 'heart', 'plus', 'shield', 'wing', 'magnet', 'star', 'clover', 'target', 'burst', 'dash', 'spear', 'flask', 'drop', 'fist', 'coin', 'thorn', 'fang', 'ghost'];
const RARITY_COL = [0, 0x8ad8ff, 0xc77dff, 0xffd24a];

export function buildAtlas(content: ContentDB): Atlas {
  const a = new Atlas();
  basics(a);
  glyphs(a);
  projectiles(a);
  pickups(a);
  const extra = [...content.enemies.values()];
  for (const d of extra) {
    const size = d.r * 3.4 + 12;
    a.add('e_' + d.id, size, size, (c) => { const k = makeKit(c, d.col, d.col2, d.r); (BODIES[d.look[0]] ?? BODIES.slime)(k, d.look[1]); });
  }
  a.add('e_courier', 60, 60, (c) => BODIES.ring(makeKit(c, 0xffd24a, 0xffffff, 14), 2));
  a.add('e_leviathan_seg', 110, 110, (c) => BODIES.seg(makeKit(c, 0x3a9bff, 0x9fe8ff, 30), 0));
  for (const b of content.bosses.values()) {
    const size = Math.min(300, b.r * 3.6 + 30);
    a.add('boss_' + b.id, size, size, (c) => BOSS_BODIES[b.id]?.(makeKit(c, b.col, b.col2, b.r)));
  }
  for (const cl of content.classes.values()) a.add('pl_' + cl.id, 56, 56, (c) => PLAYER_SHIPS[cl.look % PLAYER_SHIPS.length](makeKit(c, cl.col, cl.col2, 13)));
  for (const p of content.passives.values()) { const g = PASSIVE_GLYPH[p.id] ?? ['star', 0xffffff]; a.add('i_' + p.id, 36, 36, (c) => drawEmblem(c, g[0], g[1], 0)); }
  a.add('i_boost', 36, 36, (c) => drawEmblem(c, 'chevrons', 0xfff3b8, 0));
  for (const r of content.relics.values()) { const h = hashStr(r.id); a.add('r_' + r.id, 36, 36, (c) => drawEmblem(c, GLYPHS[h % GLYPHS.length], RARITY_COL[r.rarity], 1 + (h >> 8) % 3)); }
  decor(a, content.biomes);
  backgrounds(a, content.biomes);
  return a;
}
