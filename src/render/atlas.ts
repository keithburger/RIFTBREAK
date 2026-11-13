/**
 * Procedural art atlas. Every sprite in the game is drawn here with Canvas 2D at startup and
 * packed into one texture page, so both renderer backends batch everything in a single draw path.
 * Sprites that get tinted at runtime (projectiles, particles, glyphs) are authored in white.
 */
import { hashStr } from '../core/rng';
import type { BiomeDef, ContentDB } from '../sim/types';
import { EDGE_WHITE, FILL_GREY, LINE, TAU, bandStroke, flat, ink, mixC, rgb, starPts, tracePts, wire, type Ctx } from './geometry';
import { BODIES, BOSS_BODIES, PLAYER_SHIPS, drawEmblem, type Kit, makeKit } from './shapes';

export const ATLAS_SCALE = 2;
const PAGE = 4096;

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
    if (tint !== 0xffffff) {
      const dx = (S - f.w * sc) / 2, dy = (S - f.h * sc) / 2;
      c.globalCompositeOperation = 'multiply'; c.fillStyle = css(tint); c.fillRect(0, 0, S, S);
      c.globalCompositeOperation = 'destination-in'; c.drawImage(this.page, f.x, f.y, f.w, f.h, dx, dy, f.w * sc, f.h * sc);
    }
    if (bg) {
      c.globalCompositeOperation = 'destination-over';
      c.fillStyle = css(mix(bg, 0, 0.72));
      c.fillRect(0, 0, S, S);
    }
    url = cv.toDataURL();
    this.icons.set(id, url);
    return url;
  }
}

// ----------------------------------------------------------------------------------------------
// Runtime-tinted sprites are authored in two greys (fill 0.66, outline 1.0) via flat()/wire()/bandStroke(),
// so a single tint renders as "element colour with a lighter outline". Baked sprites use ink().
const poly = (c: Ctx, pts: number[]): void => { tracePts(c, pts); flat(c); };
const disc = (c: Ctx, x: number, y: number, r: number): void => { c.beginPath(); c.arc(x, y, r, 0, TAU); flat(c); };
const line = (c: Ctx, pts: number[], w?: number): void => { tracePts(c, pts, false); wire(c, w); };
const arcLine = (c: Ctx, x: number, y: number, r: number, a0: number, a1: number, w?: number): void => { c.beginPath(); c.arc(x, y, r, a0, a1); wire(c, w); };

function basics(a: Atlas): void {
  a.add('px', 4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(-2, -2, 4, 4); });
  // Flat discs. 'soft' and 'glow' keep their keys/radii (scene scales rely on them) but are plain flat discs now.
  a.add('disc', 64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 31, 0, TAU); c.fill(); });
  a.add('soft', 64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 31.5, 0, TAU); c.fill(); });
  a.add('glow', 96, 96, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 47.5, 0, TAU); c.fill(); });
  // A shaded Desmos region: flat fill (grey) bounded by a crisp white curve, plus one inner construction circle.
  a.add('pool', 128, 128, (c) => {
    c.beginPath(); c.arc(0, 0, 62.5, 0, TAU); c.fillStyle = 'rgb(92,92,92)'; c.fill();
    c.strokeStyle = EDGE_WHITE; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.arc(0, 0, 31, 0, TAU); c.lineWidth = LINE; c.stroke();
  });
  a.add('ring', 128, 128, (c) => { c.beginPath(); c.arc(0, 0, 61, 0, TAU); wire(c, 3); });
  a.add('ring2', 128, 128, (c) => { c.beginPath(); c.arc(0, 0, 56, 0, TAU); wire(c, 5); });
  a.add('dash_ring', 128, 128, (c) => { c.setLineDash([9, 8]); c.beginPath(); c.arc(0, 0, 60, 0, TAU); wire(c, 3); });
  // Archimedean spirals r = 8 + 52t, four arms (repeated construction).
  a.add('swirl', 128, 128, (c) => { for (let k = 0; k < 4; k++) { c.beginPath(); for (let t = 0; t <= 1.001; t += 0.05) { const r = 8 + t * 52, an = k * 1.5708 + t * 3.2; t === 0 ? c.moveTo(Math.cos(an) * r, Math.sin(an) * r) : c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } wire(c, 3); } });
  // Beam: flat strip, lighter edge lines on both long sides (visible half-height 7 of 32).
  a.add('beam', 16, 32, (c) => { c.fillStyle = FILL_GREY; c.fillRect(-8, -7, 16, 14); c.fillStyle = EDGE_WHITE; c.fillRect(-8, -7, 16, 1.6); c.fillRect(-8, 5.4, 16, 1.6); });
  a.add('spark', 32, 32, (c) => { tracePts(c, starPts(4, 15, 3.4, -Math.PI / 2)); flat(c); });
  a.add('shardp', 20, 12, (c) => { tracePts(c, [9, 0, -6, 4, -9, 0, -6, -4]); flat(c, 1.2); });
  // Slash: annular sector (inner r 30 → outer r 62) over ±0.5 rad.
  a.add('slash', 128, 128, (c) => { c.beginPath(); c.arc(0, 0, 61, -0.5, 0.5); c.arc(0, 0, 30, 0.5, -0.5, true); c.closePath(); flat(c, 2); });
  a.add('tri', 24, 24, (c) => { tracePts(c, [10, 0, -8, 8, -8, -8]); flat(c, 1.4); });
  a.add('vignette', 8, 8, (c) => { c.fillStyle = '#000'; c.fillRect(-4, -4, 8, 8); });
}

function glyphs(a: Atlas): void {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-%!.:/';
  for (const ch of chars)
    a.add('g_' + ch, 18, 26, (c) => {
      c.font = "800 22px 'Segoe UI','Trebuchet MS',system-ui,sans-serif";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#fff'; // one flat colour, no outline (text is tinted by the scene)
      c.fillText(ch, 0, 1);
    });
}

/** Projectile / weapon-icon sprites: two-grey flat art, tinted with the element colour at draw time. */
function projectiles(a: Atlas): void {
  const P = (key: string, w: number, h: number, d: (c: Ctx) => void): void => a.add(key, w, h, d);
  const C = Math.cos, S = Math.sin;
  P('p_bolt', 30, 14, (c) => { poly(c, [14, 0, 2, 5, -13, 2, -13, -2, 2, -5]); line(c, [-8, 0, 7, 0], 1.2); });
  P('p_shard', 30, 14, (c) => { poly(c, [14, 0, -2, 6, -13, 0, -2, -6]); line(c, [-2, -6, -2, 6], 1.2); });
  P('p_bomb', 28, 28, (c) => { disc(c, 0, 0, 10); arcLine(c, 0, 0, 5, 0, TAU, 1.2); poly(c, [7, -9, 12, -13, 13, -8]); });
  P('p_cone', 34, 34, (c) => { c.beginPath(); c.moveTo(-12, 0); c.arc(-12, 0, 28, -0.5, 0.5); c.closePath(); flat(c); arcLine(c, -12, 0, 12, -0.5, 0.5, 1.4); arcLine(c, -12, 0, 20, -0.5, 0.5, 1.4); });
  P('p_ring', 34, 34, (c) => { arcLine(c, 0, 0, 13, 0, TAU, 3); disc(c, 0, 0, 5); for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; line(c, [C(an) * 14, S(an) * 14, C(an) * 17, S(an) * 17], 1.6); } });
  P('p_blade', 36, 20, (c) => { poly(c, [16, 0, 2, 8, -15, 3, -9, 0, -15, -3, 2, -8]); line(c, [-8, 0, 11, 0], 1.2); });
  P('p_mine', 28, 28, (c) => { tracePts(c, starPts(6, 12.5, 6.5, 0)); flat(c); arcLine(c, 0, 0, 3.2, 0, TAU, 1.4); });
  P('p_beam', 34, 34, (c) => { c.beginPath(); c.moveTo(-14, 10); c.lineTo(14, -10); bandStroke(c, 4); line(c, [-14, 3, 9, -15], 1.4); line(c, [-9, 15, 14, -3], 1.4); });
  P('p_zap', 34, 34, (c) => { poly(c, [4, -15, -8, 2, -1, 2, -5, 15, 9, -3, 2, -3]); });
  P('p_drone', 34, 34, (c) => { poly(c, [14, 0, 0, 8, -10, 5, -6, 0, -10, -5, 0, -8]); arcLine(c, 3, 0, 3, 0, TAU, 1.4); poly(c, [-13, -12, -5, -12, -5, -9, -13, -9]); poly(c, [-13, 9, -5, 9, -5, 12, -13, 12]); });
  P('p_strike', 34, 34, (c) => { poly(c, [2, -16, -7, -1, 0, -1, -4, 9, 8, -5, 1, -5]); c.beginPath(); c.ellipse(0, 12, 11, 3.5, 0, 0, TAU); wire(c, 2); });
  P('p_whip', 34, 34, (c) => { c.beginPath(); c.moveTo(-14, 10); c.bezierCurveTo(-4, -16, 4, 14, 15, -10); bandStroke(c, 3); disc(c, 15, -10, 3.2); });
  P('p_glob', 26, 22, (c) => { disc(c, 3, 0, 8); poly(c, [-2, 6, -12, 0, -2, -6]); arcLine(c, 4, 1, 3.5, 0, TAU, 1.2); });
  P('p_aura', 34, 34, (c) => { disc(c, 0, 0, 15); for (let i = 0; i < 5; i++) { const an = i * 1.2566; arcLine(c, C(an) * 8, S(an) * 8, 3, 0, TAU, 1.4); } });
  P('p_trail', 34, 34, (c) => { for (let i = 0; i < 4; i++) disc(c, -13 + i * 7.5, 8 - i * 5, 2 + i * 1.15); });
  P('p_mote', 22, 18, (c) => { c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, TAU); flat(c); poly(c, [-6, 0, -11, -5, -9, 0, -11, 5]); arcLine(c, 4, 0, 1.6, 0, TAU, 1.2); });
  P('p_spore', 18, 18, (c) => { disc(c, 0, 0, 5); for (let i = 0; i < 6; i++) disc(c, C(i * 1.047) * 7.2, S(i * 1.047) * 7.2, 1.6); });
  P('p_wave', 40, 100, (c) => { c.beginPath(); c.arc(-34, 0, 48, -0.95, 0.95); bandStroke(c, 5); arcLine(c, -42, 0, 44, -0.8, 0.8, 1.6); arcLine(c, -50, 0, 40, -0.6, 0.6, 1.6); });
  P('p_bubble', 30, 30, (c) => { arcLine(c, 0, 0, 12, 0, TAU, 2.6); arcLine(c, 0, 0, 7, -2.6, -1.2, 1.6); });
  P('p_geyser', 34, 34, (c) => { poly(c, [-5, 14, -3, -4, -9, -8, 0, -15, 9, -8, 3, -4, 5, 14]); c.beginPath(); c.ellipse(0, 13, 12, 3, 0, 0, TAU); wire(c, 2); });
  P('p_drop', 20, 26, (c) => { poly(c, [0, -12, 6, 2, 0, 10, -6, 2]); line(c, [0, -7, 0, 5], 1.2); });
  P('p_crescent', 34, 34, (c) => { c.beginPath(); c.arc(0, 0, 15, -1.9, 1.9); c.arc(-7, 0, 13, 1.5, -1.5, true); c.closePath(); flat(c); });
  P('p_twister', 34, 34, (c) => { for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(S(i) * 2, -12 + i * 8, 14 - i * 3, 3.5, 0, 0, TAU); wire(c, 2.4); } });
  P('p_slash', 34, 34, (c) => { c.beginPath(); c.arc(-8, 0, 22, -0.9, 0.9); c.arc(-14, 0, 20, 0.7, -0.7, true); c.closePath(); flat(c); });
  P('p_feather', 26, 12, (c) => { poly(c, [12, 0, 2, 4, -11, 3, -6, 0, -11, -3, 2, -4]); line(c, [-6, 0, 9, 0], 1.2); });
  P('p_rock', 34, 34, (c) => { poly(c, [14, -2, 9, 10, -3, 14, -13, 6, -14, -5, -5, -13, 7, -12]); line(c, [-5, -13, -2, 1, 14, -2], 1.3); });
  P('p_fissure', 34, 34, (c) => { line(c, [-15, 6, -6, -2, 0, 5, 7, -6, 15, -1], 3.4); line(c, [-6, -2, -9, -12], 2); line(c, [7, -6, 10, -14], 2); line(c, [0, 5, 2, 14], 2); });
  P('p_spire', 30, 40, (c) => { poly(c, [0, -18, 7, 2, 4, 16, -4, 16, -7, 2]); line(c, [0, -12, 0, 12], 1.2); poly(c, [-11, 16, -8, 4, -5, 16]); poly(c, [11, 16, 9, 7, 6, 16]); });
  P('p_missile', 26, 12, (c) => { poly(c, [12, 0, 5, 4, -8, 4, -12, 6, -10, 0, -12, -6, -8, -4, 5, -4]); line(c, [-6, 0, 8, 0], 1.2); });
  P('p_turret', 34, 34, (c) => { poly(c, [-10, -10, 2, -10, 8, -4, 8, 4, 2, 10, -10, 10]); poly(c, [6, -2.5, 16, -2.5, 16, 2.5, 6, 2.5]); arcLine(c, -2, 0, 4, 0, TAU, 1.4); });
  P('p_sweep', 34, 34, (c) => { arcLine(c, 0, 0, 14, 0, TAU, 2); line(c, [0, 0, 13, -5], 3.4); disc(c, 0, 0, 4); });
  // Spiral well: three Archimedean arms r = 3 + 12t.
  P('p_well', 34, 34, (c) => { for (let k = 0; k < 3; k++) { c.beginPath(); for (let t = 0; t <= 1.001; t += 0.08) { const r = 3 + t * 12, an = k * 2.094 + t * 3; t === 0 ? c.moveTo(C(an) * r, S(an) * r) : c.lineTo(C(an) * r, S(an) * r); } wire(c, 2.2); } disc(c, 0, 0, 3.4); });
  P('p_ray', 34, 34, (c) => { line(c, [-15, 8, -2, -4, 4, 6, 15, -10], 3.6); poly(c, [-2, -4, 2, -9, 6, -4, 2, 1]); });
  P('p_disc', 30, 30, (c) => { arcLine(c, 0, 0, 10, 0, TAU, 3.6); for (let i = 0; i < 4; i++) { const an = i * 1.5708; poly(c, [C(an) * 14, S(an) * 14, C(an + 0.5) * 9, S(an + 0.5) * 9, C(an - 0.2) * 9, S(an - 0.2) * 9]); } });
  P('p_sigil', 34, 34, (c) => { arcLine(c, 0, 0, 14, 0, TAU, 2); line(c, [0, -11, 9.5, 5.5, -9.5, 5.5, 0, -11], 2); line(c, [0, 11, 9.5, -5.5, -9.5, -5.5, 0, 11], 2); });
  P('p_spear', 44, 12, (c) => { poly(c, [21, 0, 8, 4.5, 6, 1.5, -20, 1.5, -20, -1.5, 6, -1.5, 8, -4.5]); });
  P('p_void', 64, 64, (c) => { c.beginPath(); c.arc(0, 0, 29, 0, TAU); c.fillStyle = FILL_GREY; c.fill(); c.strokeStyle = EDGE_WHITE; c.lineWidth = 3; c.stroke(); arcLine(c, 0, 0, 16, 0, TAU, 1.6); arcLine(c, 0, 0, 5, 0, TAU, 1.6); });
  P('p_shade', 34, 34, (c) => { poly(c, [14, 0, 2, 7, -4, 13, -13, 9, -7, 3, -14, 0, -7, -3, -13, -9, -4, -13, 2, -7]); c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; tracePts(c, [7, -2.4, 3, -3.6, 3, -1]); c.fill(); tracePts(c, [7, 2.4, 3, 3.6, 3, 1]); c.fill(); c.restore(); });
  P('p_curse', 34, 34, (c) => { c.beginPath(); c.ellipse(0, 0, 14, 8, 0, 0, TAU); wire(c, 2.2); disc(c, 0, 0, 4.6); for (let i = 0; i < 5; i++) line(c, [-10 + i * 5, -9, -11 + i * 5.5, -14], 1.8); });
  P('p_rend', 34, 34, (c) => { for (let i = -1; i <= 1; i++) poly(c, [-13 + i * 3, 12 + i * 5, 0 + i * 5, 1 + i * 5, 13 + i * 3, -12 + i * 5, 2 + i * 5, -2 + i * 5]); });
  P('b_orb', 24, 24, (c) => { disc(c, 0, 0, 9); arcLine(c, 0, 0, 4.2, 0, TAU, 1.4); });
  P('b_bubble', 28, 28, (c) => { disc(c, 0, 0, 11); arcLine(c, 0, 0, 5.5, 0, TAU, 1.6); });
}

function pickups(a: Atlas): void {
  // XP gems: one rhombus, facets added per tier (geometry, not colour, marks the tier) — fill + lighter edge only.
  const gem = (key: string, col: number, tier: number): void => a.add(key, 18, 22, (c) => {
    const I = ink(col), kite = [0, -9, 6.2, 0, 0, 9, -6.2, 0];
    tracePts(c, kite); c.fillStyle = rgb(I.fill); c.fill(); c.strokeStyle = rgb(I.edge); c.lineWidth = LINE; c.lineJoin = 'miter'; c.stroke();
    const ln = (pts: number[]): void => { tracePts(c, pts, false); c.lineWidth = 1.1; c.stroke(); };
    ln([0, -9, 0, 9]);
    if (tier >= 1) ln([-6.2, 0, 6.2, 0]);
    if (tier >= 2) { tracePts(c, [0, -4.5, 3.1, 0, 0, 4.5, -3.1, 0]); c.stroke(); }
    if (tier >= 3) { ln([-3.1, -4.5, 3.1, -4.5]); ln([-3.1, 4.5, 3.1, 4.5]); }
  });
  gem('k_xp0', 0x5ad8ff, 0); gem('k_xp1', 0x7dff8a, 1); gem('k_xp2', 0xffd24a, 2); gem('k_xp3', 0xff7ae0, 3);
  // Icons: dark tone of the hue as fill, the hue as outline, one accent where needed.
  a.add('k_heal', 26, 26, (c) => {
    const col = 0x7dffb0; c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fillStyle = rgb(mixC(col, 0, 0.62)); c.fill(); c.strokeStyle = rgb(col); c.lineWidth = LINE * 1.3; c.stroke();
    c.fillStyle = rgb(col); c.fillRect(-2, -6, 4, 12); c.fillRect(-6, -2, 12, 4);
  });
  a.add('k_magnet', 26, 26, (c) => {
    const I = ink(0x4aa8e0, 0xffffff);
    c.lineJoin = 'miter'; c.lineCap = 'butt';
    c.beginPath(); c.arc(0, 1, 7, 0, Math.PI); c.moveTo(-7, 1); c.lineTo(-7, -8); c.moveTo(7, 1); c.lineTo(7, -8);
    c.lineWidth = 5 + LINE * 2; c.strokeStyle = rgb(I.edge); c.stroke(); c.lineWidth = 5; c.strokeStyle = rgb(I.fill); c.stroke();
    c.fillStyle = rgb(I.accent); c.fillRect(-9.5, -9, 5, 3.5); c.fillRect(4.5, -9, 5, 3.5);
  });
  a.add('k_bomb', 26, 26, (c) => {
    const col = 0xffd27f; c.beginPath(); c.arc(0, 2, 9, 0, TAU); c.fillStyle = rgb(mixC(col, 0, 0.62)); c.fill(); c.strokeStyle = rgb(col); c.lineWidth = LINE * 1.3; c.stroke();
    c.beginPath(); c.moveTo(4, -6); c.lineTo(8, -11); c.stroke();
    c.fillStyle = '#fff'; tracePts(c, starPts(4, 3.2, 1, 0, 8.5, -11.5)); c.fill();
  });
  a.add('k_chest', 36, 32, (c) => {
    const col = 0xffd24a; c.lineJoin = 'miter'; c.lineWidth = LINE * 1.3; c.strokeStyle = rgb(col); c.fillStyle = rgb(mixC(col, 0, 0.62));
    tracePts(c, [-13, -3, -9, -11, 9, -11, 13, -3, 13, 11, -13, 11]); c.fill(); c.stroke();
    tracePts(c, [-13, -3, 13, -3], false); c.stroke();
    c.fillStyle = rgb(col); tracePts(c, [0, -6.5, 4, -0.5, 0, 5.5, -4, -0.5]); c.fill();
  });
  const shardArt = (c: Ctx, s: number): void => {
    const I = ink(0x9b5cff, 0xe8c8ff);
    tracePts(c, [1 * s, -9 * s, 6 * s, -1 * s, -1 * s, 9 * s, -6 * s, 1 * s]); c.fillStyle = rgb(I.fill); c.fill(); c.strokeStyle = rgb(I.edge); c.lineWidth = LINE; c.lineJoin = 'miter'; c.stroke();
    tracePts(c, [1 * s, -9 * s, 6 * s, -1 * s, 0, 0]); c.fillStyle = rgb(I.accent); c.fill(); c.stroke();
  };
  a.add('k_shard', 18, 22, (c) => shardArt(c, 1));
  a.add('i_shard', 34, 34, (c) => shardArt(c, 1.5));
}

/** Ground scenery: three plotted constructions per biome, low-contrast, flat. */
function decor(a: Atlas, biomes: BiomeDef[]): void {
  for (const b of biomes) {
    const k: Kit = makeKit(null as unknown as Ctx, mix(b.pal.bg, b.pal.line, 0.65), mix(b.pal.bg, b.pal.accent, 0.5), 1);
    b.decor.forEach((key, i) => a.add(key, 96, 96, (c) => {
      k.c = c;
      const seed = hashStr(key);
      if (i === 0) { // rose r = 38·cos(3θ) with a centre dot
        k.polar((an) => 38 * Math.cos(3 * an), 0, 120, (seed % 7) * 0.05);
        k.disc(0, 0, 5, 1);
      } else if (i === 1) { // nested triangles, each rotated half a turn (Sierpinski-style)
        k.body(k.ngon(3, 38, -Math.PI / 2)); k.dark(k.ngon(3, 22, Math.PI / 2)); k.core(k.ngon(3, 9, -Math.PI / 2));
      } else { // ring + eight repeated tick marks + diamond
        k.band((c2) => c2.arc(0, 0, 28, 0, TAU), 6);
        k.rep(8, () => k.line([34, 0, 42, 0], 2.5), 0.2 + (seed % 5) * 0.05);
        k.core(k.ngon(4, 8, 0));
      }
    }));
  }
}

/** Seamless 512 px ground tiles drawn as plotted graphs on graph paper. Deterministic; no noise. */
function backgrounds(a: Atlas, biomes: BiomeDef[]): void {
  for (const b of biomes) {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d')!;
    const bg = b.pal.bg;
    const minor = css(mix(bg, b.pal.line, 0.16)), major = css(mix(bg, b.pal.line, 0.3)), curve = css(mix(bg, b.pal.accent, 0.22));
    c.fillStyle = css(bg);
    c.fillRect(0, 0, S, S);
    const wrapped = (fn: (ox: number, oy: number) => void): void => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };
    const grid = (step: number, col: string, w: number): void => {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath();
      for (let i = 0; i <= S; i += step) { c.moveTo(i, 0); c.lineTo(i, S); c.moveTo(0, i); c.lineTo(S, i); }
      c.stroke();
    };
    grid(32, minor, 1);
    grid(128, major, 1.5);
    c.lineJoin = 'round';
    if (b.idx === 1) { // foundry: circles r=64,128 on every major intersection + diagonals
      c.strokeStyle = curve; c.lineWidth = 1.5;
      for (let x = 0; x < S; x += 128) for (let y = 0; y < S; y += 128) wrapped((ox, oy) => { for (const r of [64, 128]) { c.beginPath(); c.arc(x + ox, y + oy, r, 0, TAU); c.stroke(); } });
      c.fillStyle = css(mix(bg, b.pal.accent, 0.3));
      for (let x = 0; x < S; x += 128) for (let y = 0; y < S; y += 128) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); }
    } else if (b.idx === 2) { // archive: hexagonal lattice with a dot at every centre
      c.strokeStyle = curve; c.lineWidth = 1.5;
      for (let y = 0; y <= S; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x <= S; x += 64) {
        c.beginPath(); for (let k = 0; k < 6; k++) { const an = k * 1.0472 + 0.5236; c.lineTo(x + Math.cos(an) * 36.9, y + Math.sin(an) * 36.9); } c.closePath(); c.stroke();
        c.fillStyle = curve; c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill();
      }
    } else if (b.idx === 3) { // null expanse: polar grid + Fermat-spiral points (phyllotaxis)
      c.strokeStyle = curve; c.lineWidth = 1.2;
      for (let r = 32; r <= 256; r += 32) { c.beginPath(); c.arc(256, 256, r, 0, TAU); c.stroke(); }
      c.beginPath(); for (let i = 0; i < 24; i++) { const an = (i / 24) * TAU; c.moveTo(256, 256); c.lineTo(256 + Math.cos(an) * 256, 256 + Math.sin(an) * 256); } c.stroke();
      c.fillStyle = css(mix(bg, b.pal.accent2, 0.7));
      for (let i = 1; i < 120; i++) { const r = 22 * Math.sqrt(i), an = i * 2.39996; if (r > 250) break; c.beginPath(); c.arc(256 + Math.cos(an) * r, 256 + Math.sin(an) * r, 2.2, 0, TAU); c.fill(); }
    } else { // verdant: y = A·sin(2π·k·x/512 + φ) on four rows, plus dots at the crests
      c.strokeStyle = curve; c.lineWidth = 1.8;
      const rows = [[64, 1, 22, 0], [192, 2, 26, 1.3], [320, 3, 24, 2.1], [448, 2, 28, 0.4]];
      for (const [y0, kx, A, ph] of rows) {
        c.beginPath();
        for (let x = 0; x <= S; x += 4) { const y = y0 + A * Math.sin((TAU * kx * x) / S + ph); x === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
        c.fillStyle = css(mix(bg, b.pal.accent, 0.6));
        for (let m = 0; m < kx; m++) { const x = ((Math.PI / 2 - ph + TAU * m) / (TAU * kx)) * S; c.beginPath(); c.arc(((x % S) + S) % S, y0 - A, 2.6, 0, TAU); c.fill(); }
      }
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
