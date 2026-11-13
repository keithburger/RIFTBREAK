/** Draws a World through the Draw/Renderer abstraction. Read-only with respect to the simulation. */
import { TAU } from '../core/math';
import type { Beam, Enemy, Zone } from '../sim/types';
import type { World } from '../sim/world';
import type { FxSystem } from './effects';
import { edgeOf } from './geometry';
import { L, type Draw } from './renderer';

export interface View { x: number; y: number; zoom: number; w: number; h: number }

const TELE = 0xff3355;
const PROJ_REF: Record<string, number> = { p_wave: 46, p_void: 30, p_rock: 14, p_bubble: 12, p_crescent: 15, p_disc: 12, p_bomb: 10, p_spear: 9, p_blade: 12, p_glob: 9, p_shard: 8, p_bolt: 7, p_missile: 8, p_mote: 8, p_feather: 7, p_spore: 6 };
const MINION_SPRITE: Record<string, string> = { drone: 'p_drone', turret: 'p_turret', spire: 'p_spire', shade: 'p_shade', mine: 'p_mine' };
/** Two-stroke limb / joint: a lighter-tint outline under the fill colour (docs/ART_DIRECTION.md). */
const limb = (d: Draw, layer: number, x1: number, y1: number, x2: number, y2: number, w: number, col: number): void => {
  d.line(layer, x1, y1, x2, y2, w + 3, edgeOf(col), 1); d.line(layer, x1, y1, x2, y2, w, col, 1);
};
const knob = (d: Draw, layer: number, x: number, y: number, rad: number, col: number): void => {
  d.circle(layer, 'disc', x, y, rad + 1.5, edgeOf(col), 1); d.circle(layer, 'disc', x, y, rad, col, 1);
};
const cellHash = (x: number, y: number, s: number): number => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >> 13)) * 1274126177; return (h ^ (h >> 16)) >>> 0; };

export function drawScene(d: Draw, w: World, fx: FxSystem, v: View, t: number): void {
  const r = d.r;
  const q = fx.settings.quality;
  const hw = v.w / v.zoom / 2 + 90, hh = v.h / v.zoom / 2 + 90;
  const x0 = v.x - hw, x1 = v.x + hw, y0 = v.y - hh, y1 = v.y + hh;
  const inView = (x: number, y: number, m: number): boolean => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
  const p = w.player;
  const el = w.content.elements;

  // ---- decor
  const CELL = 250;
  const dk = w.biome.decor;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
      const h = cellHash(cx, cy, w.biomeIdx + 1);
      if (h % 100 > 52) continue;
      const s = 0.55 + ((h >> 8) % 70) / 100;
      r.sprite(L.GROUND, dk[(h >> 4) % dk.length], cx * CELL + ((h >> 12) % CELL), cy * CELL + ((h >> 20) % CELL), (((h >> 6) % 100) / 100 - 0.5) * 0.8, s, s, 0xffffff, 0.55);
    }

  // ---- arena boundary
  if (w.arena) {
    const A = w.arena, n = 90, col = w.biome.pal.accent;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.05;
      const x = A.x + Math.cos(a) * A.r, y = A.y + Math.sin(a) * A.r;
      if (!inView(x, y, 20)) continue;
      r.sprite(L.GROUND, 'tri', x, y, a + Math.PI, 1.1, 0.8 + Math.sin(t * 3 + i) * 0.2, col, 0.75);
    }
  }

  // ---- zones
  for (const z of w.zones) if (inView(z.x, z.y, z.r)) drawZone(d, z, t, q);

  // ---- pickups
  for (const k of w.pickups) {
    if (!inView(k.x, k.y, 20)) continue;
    const bob = k.pulled ? 0 : Math.sin(k.age * 5) * 2; // stable per-pickup phase (k.x changes while pulled)
    const key = k.kind === 'xp' ? (k.value < 3 ? 'k_xp0' : k.value < 10 ? 'k_xp1' : k.value < 40 ? 'k_xp2' : 'k_xp3') : 'k_' + k.kind;
    const s = k.kind === 'chest' ? 1.2 + Math.sin(t * 4) * 0.08 : Math.min(1, k.age * 6);
    r.sprite(L.ENT, key, k.x, k.y + bob, 0, s, s, 0xffffff, 1);
    if (k.kind === 'chest') r.sprite(L.FX, 'spark', k.x, k.y - 22, t * 2, 0.5, 0.5, 0xfff3b8, 0.8);
  }

  // ---- minions
  for (const m of w.minions) {
    if (!inView(m.x, m.y, 40)) continue;
    const wp = m.wi.p;
    if (m.kind === 'orbit') {
      const s = m.r / 12;
      r.sprite(L.ENT, wp.sprite, m.x, m.y, m.ang + (wp.sprite === 'p_rock' ? m.t * 2 : 0), s, s, wp.color, 1);
    } else {
      const key = MINION_SPRITE[m.kind] ?? 'p_drone';
      const pop = Math.min(1, m.t * 5);
      const s = (m.kind === 'spire' ? 1.3 : m.kind === 'turret' ? 1.1 : 1) * pop;
      const rot = m.kind === 'spire' ? 0 : m.kind === 'mine' ? m.t : m.ang;
      r.sprite(L.ENT, key, m.x, m.y, rot, s, s, wp.color, m.kind === 'shade' ? 0.85 : 1);
      if (m.kind === 'mine' && m.t > 0.4) r.sprite(L.FX, 'soft', m.x, m.y, 0, 0.5, 0.5, 0xffffff, 0.4 + Math.sin(t * 10) * 0.4);
      if (m.kind === 'turret' && wp.x.obelisk) for (const o of [0, Math.PI]) { const L2 = wp.x.obelisk * p.stats.area; d.line(L.FX, m.x, m.y, m.x + Math.cos(m.ang + o) * L2, m.y + Math.sin(m.ang + o) * L2, 22, wp.color, 0.7, true); }
    }
  }

  // ---- enemies
  let n = 0;
  for (const e of w.enemies) {
    if (!inView(e.x, e.y, e.r + 60)) continue;
    n++;
    if (e.boss) drawBoss(d, w, fx, e, t, q);
    else drawEnemy(d, w, e, t, q);
    if (e.mark) r.sprite(L.TOP, 'disc', e.x, e.y - e.r - 7, 0, 0.16, 0.16, el.get(e.mark)!.col, 0.95);
  }
  void n;

  // ---- player
  if (w.state !== 'lost') {
    const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(t * 20) % 2 === 0 ? 0.45 : 1;
    const col = p.cls.col;
    d.circle(L.GROUND, 'ring', p.x, p.y, 27, col, 0.55); // findability comes from a plotted ring, not a halo
    if (p.surgeT > 0) d.circle(L.FX, 'dash_ring', p.x, p.y, 30, 0xffe08a, 0.8, t * 3);
    if (p.moving || p.dashT > 0) {
      const back = p.facing + Math.PI;
      const k = p.dashT > 0 ? 3 : 1;
      for (let i = 0; i < k; i++) fx.particle(p.x + Math.cos(back) * 12, p.y + Math.sin(back) * 12, Math.cos(back + (Math.random() - 0.5) * 0.7) * 120, Math.sin(back + (Math.random() - 0.5) * 0.7) * 120, 0.25, p.dashT > 0 ? 9 : 5, col);
    }
    if (p.dashT > 0) for (let i = 1; i <= 3; i++) r.sprite(L.FX, 'pl_' + p.cls.id, p.x - p.dashX * i * 22, p.y - p.dashY * i * 22, p.facing, 1.1, 1.1, col, 0.35 - i * 0.08);
    r.sprite(L.ENT, 'pl_' + p.cls.id, p.x, p.y, p.facing, 1.15, 1.15, p.hurtFlash > 0 ? 0xff7080 : 0xffffff, blink);
    if (p.guard) d.circle(L.FX, 'ring2', p.x, p.y, 26, 0x7fd8ff, 0.7 + Math.sin(t * 5) * 0.2);
    const dc = p.stats.dashCharges;
    for (let i = 0; i < dc; i++) r.sprite(L.TOP, 'disc', p.x + (i - (dc - 1) / 2) * 9, p.y + 26, 0, 0.11, 0.11, i < p.dashes ? 0x9fe8ff : 0x334455, 0.9);
    if (p.slowT > 0) d.circle(L.FX, 'dash_ring', p.x, p.y, 22, 0x8fe4ff, 0.7, -t * 2);
  }

  // ---- projectiles
  for (const pr of w.projs) {
    if (!inView(pr.x, pr.y, pr.r + 30)) continue;
    const s = (pr.r / (PROJ_REF[pr.sprite] ?? 8)) * (pr.mode === 1 ? pr.scale : 1);
    if (pr.sprite === 'p_void') { r.sprite(L.GLOW, 'p_void', pr.x, pr.y, t * 2, s, s, pr.color, 0.9); r.sprite(L.FX, 'swirl', pr.x, pr.y, -t * 4, s * 0.5, s * 0.5, pr.color, 0.6); continue; }
    r.sprite(L.ENT, pr.sprite, pr.x, pr.y, pr.rot, s, s, pr.color, 1);
    if (q >= 2 && (w.frame & 1) === 0 && pr.mode !== 3) fx.particle(pr.x, pr.y, -pr.vx * 0.05, -pr.vy * 0.05, 0.22, Math.min(9, pr.r * 0.7), pr.color);
  }

  // ---- enemy bullets (always high-contrast: red body, lighter-red edge, white core)
  for (const b of w.bullets) {
    if (!inView(b.x, b.y, 20)) continue;
    const s = b.r / 9;
    r.sprite(L.ENT, b.sprite, b.x, b.y, 0, s, s, b.color, 1);
    r.sprite(L.FX, 'soft', b.x, b.y, 0, s * 0.3, s * 0.3, 0xffffff, 0.9);
  }

  // ---- beams
  for (const b of w.beams) drawBeam(d, b, t);

  fx.draw(d);
}

function drawZone(d: Draw, z: Zone, t: number, q: number): void {
  const r = d.r;
  const tele = z.life > z.max - z.delay;
  const fade = Math.min(1, z.life * 4);
  if (z.team >= 1) {
    const col = z.style === 'hazard' || z.style === 'field' || z.style === 'pull' ? z.color : TELE;
    if (tele) {
      const k = 1 - (z.life - (z.max - z.delay)) / z.delay;
      d.circle(L.GROUND, 'disc', z.x, z.y, z.r, col, 0.1 + k * 0.08);
      d.circle(L.GROUND, 'disc', z.x, z.y, z.r * k, col, 0.22);
      d.circle(L.GROUND, 'ring', z.x, z.y, z.r, col, 0.9);
      if (k > 0.75) d.circle(L.FX, 'ring', z.x, z.y, z.r, 0xffffff, (k - 0.75) * 3);
    } else if (z.style === 'pull') {
      d.circle(L.GROUND, 'swirl', z.x, z.y, z.r, col, 0.2 * fade, -t * 2.5);
      d.circle(L.GROUND, 'swirl', z.x, z.y, z.r * 0.55, col, 0.34 * fade, -t * 4);
      d.circle(L.GROUND, 'dash_ring', z.x, z.y, z.r, col, 0.45 * fade, t * 0.3);
    } else if (z.style === 'field') {
      d.circle(L.GROUND, 'disc', z.x, z.y, z.r, col, 0.1 * fade);
      d.circle(L.GROUND, 'dash_ring', z.x, z.y, z.r, col, 0.6 * fade, t * 0.6);
    } else {
      d.circle(L.GROUND, 'pool', z.x, z.y, z.r, col, (0.75 + Math.sin(t * 8 + z.x) * 0.15) * fade);
      if (z.once) d.circle(L.FX, 'soft', z.x, z.y, z.r * 1.15, 0xffffff, 0.55 * fade);
    }
    return;
  }
  const c = z.color;
  switch (z.style) {
    case 'strike': case 'drop': case 'rend': {
      if (tele) { const k = (z.life - (z.max - z.delay)) / z.delay; d.circle(L.GROUND, 'ring', z.x, z.y, z.r * (0.3 + k * 0.7), c, 0.55 * (1 - k * 0.5)); }
      else { d.circle(L.FX, 'soft', z.x, z.y, z.r * 1.2, c, fade * 0.45); d.circle(L.FX, 'ring', z.x, z.y, z.r, 0xffffff, fade * 0.6); }
      break;
    }
    case 'aura':
      d.circle(L.GROUND, 'pool', z.x, z.y, z.r, c, 0.3);
      d.circle(L.GROUND, 'dash_ring', z.x, z.y, z.r * 0.96, c, 0.5, t * 0.4);
      break;
    case 'well':
      d.circle(L.GROUND, 'swirl', z.x, z.y, z.r, c, 0.55 * fade, -t * 3);
      d.circle(L.GLOW, 'swirl', z.x, z.y, z.r * 0.6, c, 0.6 * fade, -t * 5);
      d.circle(L.GROUND, 'disc', z.x, z.y, z.r * 0.22, 0x05030a, 0.9 * fade);
      d.circle(L.FX, 'ring', z.x, z.y, z.r * 0.24, c, fade);
      break;
    case 'twister':
      for (let i = 0; i < 3; i++) d.circle(i ? L.GLOW : L.GROUND, 'swirl', z.x + Math.sin(t * 7 + i) * 4, z.y + Math.cos(t * 6 + i) * 4, z.r * (1 - i * 0.28), c, (0.4 + i * 0.12) * fade, t * (5 + i * 3));
      break;
    case 'shrine':
      d.circle(L.GROUND, 'pool', z.x, z.y, z.r, c, 0.35);
      d.circle(L.GROUND, 'dash_ring', z.x, z.y, z.r, c, 0.9, t * 0.8);
      r.sprite(L.FX, 'spark', z.x, z.y, t, 1.2, 1.2, c, 0.8);
      break;
    case 'heal':
      d.circle(L.GROUND, 'pool', z.x, z.y, z.r, 0x7dffb0, 0.5 * fade);
      d.circle(L.GROUND, 'dash_ring', z.x, z.y, z.r * 0.7, 0x7dffb0, 0.6 * fade, t);
      break;
    case 'spark':
      d.circle(L.GROUND, 'pool', z.x, z.y, z.r, c, 0.4 * fade);
      if (q >= 1) for (let i = 0; i < 3; i++) { const a = t * 9 + i * 2.1 + z.x; r.sprite(L.FX, 'spark', z.x + Math.cos(a * 1.7) * z.r * 0.6, z.y + Math.sin(a * 1.3) * z.r * 0.6, a, 0.5, 0.5, c, 0.8 * fade); }
      break;
    default:
      d.circle(L.GROUND, 'pool', z.x, z.y, z.r, c, 0.5 * fade);
  }
}

function drawBeam(d: Draw, b: Beam, t: number): void {
  const x2 = b.x + Math.cos(b.ang) * b.len, y2 = b.y + Math.sin(b.ang) * b.len;
  const tele = b.life > b.max - b.delay;
  if (tele) {
    const k = 1 - (b.life - (b.max - b.delay)) / b.delay;
    const col = b.team === 1 ? TELE : b.color;
    d.line(L.GROUND, b.x, b.y, x2, y2, b.width, col, 0.1 + k * 0.14);
    d.line(L.GROUND, b.x, b.y, x2, y2, Math.max(2, b.width * k), col, 0.28);
    d.line(L.FX, b.x, b.y, x2, y2, 2, b.team === 1 ? 0xffffff : col, 0.35 + k * 0.5);
    return;
  }
  const fade = Math.min(1, b.life * 6);
  const pulse = 1 + Math.sin(t * 40) * 0.08;
  d.line(L.FX, b.x, b.y, x2, y2, b.width * 2.6 * pulse, b.color, 0.75 * fade, true);
  d.line(L.FX, b.x, b.y, x2, y2, b.width * 0.42, 0xffffff, 0.95 * fade);
  if (b.team === 1) d.line(L.GROUND, b.x, b.y, x2, y2, b.width, TELE, 0.25 * fade);
}

function drawEnemy(d: Draw, w: World, e: Enemy, t: number, q: number): void {
  const r = d.r;
  const def = e.def;
  const key = e.link ? 'e_leviathan_seg' : 'e_' + def.id;
  if (e.hidden) {
    if (def.move[0] === 'burrow') { d.circle(L.GROUND, 'dash_ring', e.x, e.y, e.r * 0.9, def.col, 0.3, t * 3); return; }
    r.sprite(L.ENT, key, e.x, e.y, e.dir, e.r / def.r, e.r / def.r, 0xffffff, 0.07);
    return;
  }
  const spawn = Math.min(1, e.age * 3.5);
  const frozen = e.freezeT > 0;
  const wob = frozen ? 0 : Math.sin(t * 7 + e.id * 1.3) * 0.05;
  const s = (e.r / def.r) * spawn;
  const tint = frozen ? 0x8fd0ff : e.stunT > 0 ? 0xffffa0 : e.vulnT > 0 ? 0xffb0f0 : e.poisonT > 0 ? 0xc8ffb0 : e.burnT > 0 ? 0xffc8a0 : 0xffffff;
  const rot = def.look[0] === 'saw' || def.look[0] === 'gear' ? t * 6 + e.id : def.move[0] === 'sentry' && def.look[0] !== 'turret' ? Math.sin(t + e.id) * 0.2 : e.dir;
  if (e.elite) {
    d.circle(L.GROUND, 'ring2', e.x, e.y, e.r * 1.45, e.elite === 2 ? 0xff5a8a : 0xffd24a, 0.75 + Math.sin(t * 6) * 0.2);
    const bw = e.r * 2.2, f = Math.max(0, e.hp / e.maxHp);
    d.line(L.TOP, e.x - bw / 2, e.y - e.r - 14, e.x + bw / 2, e.y - e.r - 14, 4, 0x1a1a22, 0.9);
    d.line(L.TOP, e.x - bw / 2, e.y - e.r - 14, e.x - bw / 2 + bw * f, e.y - e.r - 14, 3, 0xffd24a, 1);
  }
  r.sprite(L.ENT, key, e.x, e.y, rot, s * (1 + wob), s * (1 - wob), tint, e.invuln ? 0.35 : 1);
  if (e.flash > 0) r.sprite(L.FX, key, e.x, e.y, rot, s, s, 0xffffff, Math.min(0.85, e.flash * 7));
  if (e.shield > 0) d.circle(L.FX, 'ring', e.x, e.y, e.r * 1.3, 0x66ccff, 0.8);
  if (e.wardT > 0) d.circle(L.FX, 'dash_ring', e.x, e.y, e.r * 1.3, 0xff5ac8, 0.8, t * 2);
  if (e.hasteT > 0 && q >= 1) r.sprite(L.FX, 'tri', e.x - Math.cos(e.dir) * e.r * 1.3, e.y - Math.sin(e.dir) * e.r * 1.3, e.dir, 0.6, 0.6, 0xffb040, 0.8);
  if (e.curseT > 0) r.sprite(L.TOP, 'p_curse', e.x, e.y + e.r + 8, 0, 0.4, 0.4, 0x9b5cff, 0.9);
  if (frozen && q >= 1) r.sprite(L.FX, 'spark', e.x, e.y, e.id, e.r / 14, e.r / 14, 0xcfefff, 0.5);
}

// --------------------------------------------------------------------------------------- bosses
function drawBoss(d: Draw, w: World, fx: FxSystem, e: Enemy, t: number, q: number): void {
  const r = d.r;
  const c = e.boss!;
  const def = c.def;
  const key = 'boss_' + def.id;
  const dying = c.dying > 0;
  const jx = dying ? (Math.random() - 0.5) * 8 : 0, jy = dying ? (Math.random() - 0.5) * 8 : 0;
  const x = e.x + jx, y = e.y + jy;
  const R = e.r;
  const col = def.col, col2 = def.col2;
  const tintBody = e.freezeT > 0 || e.slow > 0.2 ? 0xb8e0ff : 0xffffff;
  if (c.trans > 0) { const k = (c.trans % 0.5) / 0.5; d.circle(L.FX, 'ring2', x, y, R * (1 + k * 3), col2, 1 - k); }
  let rot = e.dir;
  switch (def.id) {
    case 'arachnoid_siege_engine': {
      rot = c.d.rot;
      c.legs.forEach((l, i) => {
        const dx = l.fx - l.hx, dy = l.fy - l.hy;
        const dist = Math.min(Math.hypot(dx, dy), l.len * 2 - 1) || 1;
        const a = Math.atan2(dy, dx);
        const h = Math.sqrt(Math.max(0, l.len * l.len - (dist / 2) * (dist / 2)));
        const side = i < 4 ? -1 : 1;
        const kx = l.hx + Math.cos(a) * (dist / 2) + Math.cos(a + 1.5708) * h * side;
        const ky = l.hy + Math.sin(a) * (dist / 2) + Math.sin(a + 1.5708) * h * side;
        const lift = l.t < 1 ? Math.sin(l.t * Math.PI) : 0;
        limb(d, L.ENT, l.hx, l.hy, kx, ky, 8, col); limb(d, L.ENT, kx, ky, l.fx, l.fy, 5.5, col);
        knob(d, L.ENT, kx, ky, 6, col2);
        r.sprite(L.ENT, 'tri', l.fx, l.fy, a, 1.3 + lift * 0.7, 1.3 + lift * 0.7, edgeOf(col), 1);
      });
      r.sprite(L.ENT, key, x, y, rot, 1, 1, tintBody, 1);
      const cx = x + Math.cos(rot) * R * 1.25, cy = y + Math.sin(rot) * R * 1.25;
      const charging = c.d.hold ? 1 : 0;
      d.circle(L.FX, 'disc', cx, cy, 14 + charging * (24 + Math.sin(t * 30) * 8), col2, 0.6);
      if (charging) d.circle(L.FX, 'ring', cx, cy, 20 + (24 + Math.sin(t * 30) * 8), 0xffffff, 0.9);
      if (charging && q >= 1) for (let i = 0; i < 2; i++) { const a = Math.random() * TAU; fx.burst(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40, col2, 1, 30, 3); }
      break;
    }
    case 'mycelial_overmind': {
      rot = t * 0.2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.sin(t * 0.8 + i) * 0.25;
        const mx = x + Math.cos(a) * R * 1.1, my = y + Math.sin(a) * R * 1.1;
        const ex = x + Math.cos(a + Math.sin(t * 1.7 + i * 2) * 0.3) * R * 1.9, ey = y + Math.sin(a + Math.sin(t * 1.7 + i * 2) * 0.3) * R * 1.9;
        limb(d, L.ENT, x, y, mx, my, 10, col); limb(d, L.ENT, mx, my, ex, ey, 6, col);
        knob(d, L.ENT, ex, ey, 6, col2);
      }
      r.sprite(L.ENT, key, x, y, rot, 1 + Math.sin(t * 2.2) * 0.03, 1 + Math.sin(t * 2.2) * 0.03, tintBody, 1);
      d.circle(L.FX, 'dash_ring', x, y, R * 1.5, col, 0.5, -t * 0.7);
      break;
    }
    case 'tempest_conductor': {
      const flap = Math.sin(t * 9) * 0.35;
      for (const s of [-1, 1]) {
        const a = rot + s * (1.9 + flap);
        r.sprite(L.ENT, 'p_blade', x + Math.cos(a) * R * 1.0, y + Math.sin(a) * R * 1.0, a, 3.2, 2.6, col2, 0.95);
        r.sprite(L.ENT, 'p_blade', x + Math.cos(a + s * 0.5) * R * 0.9, y + Math.sin(a + s * 0.5) * R * 0.9, a + s * 0.5, 2.4, 2, col, 0.9);
      }
      r.sprite(L.ENT, key, x, y, rot, 1, 1, tintBody, 1);
      if (q >= 1 && Math.random() < 0.3) { const a = Math.random() * TAU; fx.line(x, y, x + Math.cos(a) * R * 2, y + Math.sin(a) * R * 2, col, 2, 0.1); }
      break;
    }
    case 'cinder_colossus': {
      for (const s of [-1, 1]) {
        const a = rot + s * 1.25 + Math.sin(t * 2 + s) * 0.2;
        const fxp = x + Math.cos(a) * R * 1.45, fyp = y + Math.sin(a) * R * 1.45;
        knob(d, L.ENT, fxp, fyp, R * 0.4, col); d.circle(L.ENT, 'disc', fxp, fyp, R * 0.16, col2, 1);
      }
      r.sprite(L.ENT, key, x, y, rot, 1, 1, tintBody, 1);
      if (q >= 2 && Math.random() < 0.5) fx.particle(x + (Math.random() - 0.5) * R, y + (Math.random() - 0.5) * R, 0, -40, 0.6, 5, col2);
      break;
    }
    case 'tidal_leviathan': {
      r.sprite(L.ENT, key, x, y, rot, 1, 1, tintBody, 1);
      break;
    }
    case 'prism_seraph': {
      rot = t * 0.3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t * 0.8;
        const rr = R * (1.5 + Math.sin(t * 2 + i) * 0.15);
        r.sprite(L.ENT, 'p_blade', x + Math.cos(a) * rr, y + Math.sin(a) * rr, a + 1.57, 2.6, 2, i % 2 ? col2 : col, 0.95);
      }
      r.sprite(L.ENT, key, x, y, rot, 1, 1, tintBody, 1);
      d.circle(L.FX, 'ring2', x, y, R * 0.75, col, 0.7 + Math.sin(t * 4) * 0.2);
      break;
    }
    case 'hollow_monarch': {
      rot = Math.atan2(w.player.y - y, w.player.x - x);
      d.circle(L.GROUND, 'swirl', x, y, R * 2.2, col, 0.4, -t * 1.5);
      r.sprite(L.ENT, key, x, y, rot, 1, 1, tintBody, 0.82 + Math.sin(t * 13) * 0.12);
      for (let i = 0; i < 5; i++) { const a = t * 1.4 + (i / 5) * TAU; r.sprite(L.FX, 'tri', x + Math.cos(a) * R * 1.5, y + Math.sin(a) * R * 1.5, a + 1.57, 1.2, 1.2, col2, 0.9); }
      break;
    }
    case 'rift_sovereign': {
      rot = t * 0.5;
      d.circle(L.GROUND, 'dash_ring', x, y, R * 2.0, col, 0.6, t * 0.9);
      d.circle(L.GROUND, 'dash_ring', x, y, R * 2.5, col2, 0.4, -t * 0.6);
      r.sprite(L.ENT, key, x, y, rot, 1, 1, tintBody, 1);
      r.sprite(L.ENT, key, x, y, -rot * 1.5, 0.55, 0.55, 0xffffff, 0.9);
      const cols = [0xff6a2a, 0x8fe4ff, 0xffe94a, 0x9b5cff];
      for (let i = 0; i < 4; i++) { const a = -t * 1.1 + (i / 4) * TAU; const ox = x + Math.cos(a) * R * 1.7, oy = y + Math.sin(a) * R * 1.7; knob(d, L.ENT, ox, oy, 10, cols[i]); }
      break;
    }
    default:
      r.sprite(L.ENT, key, x, y, rot, 1, 1, tintBody, 1);
  }
  if (e.flash > 0 || dying) r.sprite(L.FX, key, x, y, rot, 1, 1, 0xffffff, dying ? 0.4 + Math.random() * 0.4 : Math.min(0.22, e.flash * 2));
}
