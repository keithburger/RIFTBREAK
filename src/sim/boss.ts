/**
 * Boss framework: phase thresholds, attack rotations, transitions, death sequence and rewards.
 * Individual bosses (src/content/bosses) are scripts built from the helpers exported here.
 */
import { TAU } from '../core/math';
import { killEnemy } from './combat';
import { spawnBeam, spawnBullet, spawnEnemy, spawnPickup, spawnZone } from './entities';
import type { Beam, BossCtl, BossDef, ElementId, Enemy, EnemyDef, Zone } from './types';
import type { World } from './world';

export const ARENA_R = 640;
const bossEnemyDefs = new Map<string, EnemyDef>();

function shellDef(d: BossDef): EnemyDef {
  let e = bossEnemyDefs.get(d.id);
  if (!e) {
    e = { id: d.id, name: d.name, desc: d.desc, biome: d.biome, tier: 9, hp: d.hp, spd: d.spd, dmg: d.dmg, r: d.r, xp: 0, cost: 0, look: ['boss', 0], col: d.col, col2: d.col2, move: ['chase'] };
    bossEnemyDefs.set(d.id, e);
  }
  return e;
}

export function spawnBoss(w: World, def: BossDef, x: number, y: number, hpMul = 1): Enemy {
  const e = spawnEnemy(w, shellDef(def), x, y);
  e.hp = e.maxHp = def.hp * w.diff.bossHp * hpMul;
  e.dmg = def.dmg * w.diff.dmg;
  e.spd = def.spd;
  const c: BossCtl = { def, phase: 0, t: 0, at: 0, atk: 0, dying: 0, trans: 1.6, d: {}, legs: [], segs: [], hx: x, hy: y, order: [] };
  e.boss = c;
  e.tag = 'boss';
  w.boss = e;
  w.arena = { x: w.player.x, y: w.player.y, r: ARENA_R };
  def.init?.(w, e, c);
  w.fx.banner(def.name.toUpperCase(), def.title, def.col);
  w.fx.sfx('boss_intro');
  w.fx.shake(8);
  return e;
}

function clearHostiles(w: World): void {
  for (const b of w.bullets) { w.fx.burst(b.x, b.y, b.color, 1, 60, 2); w.bulletPool.push(b); }
  w.bullets.length = 0;
  for (const z of w.zones) if (z.team === 1) z.alive = false, z.onEnd = null;
  w.zones = w.zones.filter((z) => z.alive);
  w.beams = w.beams.filter((b) => b.team !== 1);
}

export function updateBoss(w: World, e: Enemy, dt: number): void {
  const c = e.boss!;
  const def = c.def;
  c.t += dt;
  if (c.dying > 0) {
    c.dying -= dt;
    e.vx = e.vy = 0;
    if (w.rng.next() < dt * 14) {
      const a = w.rng.angle(), d = w.rng.next() * e.r;
      w.fx.burst(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, w.rng.next() < 0.5 ? def.col : def.col2, 10, 260, 5);
      w.fx.sfx('boom', e.x, e.y);
      w.fx.shake(4);
    }
    if (c.dying <= 0) {
      e.alive = false;
      for (const s of c.segs) s.alive = false;
      w.fx.ring(e.x, e.y, 520, def.col, 0.8);
      w.fx.ring(e.x, e.y, 320, 0xffffff, 0.5);
      w.fx.burst(e.x, e.y, def.col, 60, 520, 7);
      w.fx.burst(e.x, e.y, 0xffffff, 30, 380, 5);
      w.fx.flash(0xffffff, 0.6);
      w.fx.shake(18);
      w.fx.sfx('boss_die');
      for (let i = 0; i < 14; i++) spawnPickup(w, 'xp', e.x, e.y, (w.player.xpNext * 1.6) / 14);
      spawnPickup(w, 'chest', e.x, e.y, 3);
      spawnPickup(w, 'heal', e.x, e.y, 30);
      for (let i = 0; i < 5; i++) spawnPickup(w, 'shard', e.x, e.y, 6);
      w.stats.bosses.push(def.id);
      w.stats.kills++;
      w.boss = null;
      w.bossDown = def.id;
    }
    return;
  }
  if (e.hp <= 0) {
    c.dying = 2.6;
    clearHostiles(w);
    for (const o of w.enemies) if (o !== e && !o.boss && !o.link && o.alive) { o.noXp = true; killEnemy(w, o); }
    w.fx.sfx('boss_break');
    w.fx.flash(def.col, 0.4);
    return;
  }
  if (c.phase < def.phases.length && e.hp / e.maxHp <= def.phases[c.phase]) {
    c.phase++;
    c.trans = 1.3;
    c.at = 0;
    c.atk = 0;
    clearHostiles(w);
    w.fx.ring(e.x, e.y, 420, def.col2, 0.6);
    w.fx.burst(e.x, e.y, def.col2, 30, 400, 5);
    w.fx.shake(12);
    w.fx.flash(def.col2, 0.35);
    w.fx.sfx('boss_phase');
    w.fx.banner('PHASE ' + (c.phase + 1), def.name, def.col2);
    def.onPhase?.(w, e, c);
  }
  if (c.trans > 0) {
    c.trans -= dt;
    e.vx = e.vy = 0;
    return;
  }
  def.update?.(w, e, c, dt);
  const rot = def.attacks[Math.min(c.phase, def.attacks.length - 1)];
  const atk = rot[c.atk % rot.length];
  c.at += dt;
  atk.run(w, e, c, dt);
  if (c.at >= atk.dur) { c.at = 0; c.atk++; }
  // keep inside the arena
  if (w.arena) {
    const dx = e.x - w.arena.x, dy = e.y - w.arena.y, d = Math.hypot(dx, dy);
    const lim = w.arena.r - e.r * 0.5;
    if (d > lim) { e.x = w.arena.x + (dx / d) * lim; e.y = w.arena.y + (dy / d) * lim; }
  }
}

// ------------------------------------------------------------------------------- script helpers
export const pAng = (w: World, e: { x: number; y: number }): number => Math.atan2(w.player.y - e.y, w.player.x - e.x);
export const pDist = (w: World, e: { x: number; y: number }): number => Math.hypot(w.player.y - e.y, w.player.x - e.x);

/** Move toward a point; returns remaining distance. Respects slows. */
export function moveTo(e: Enemy, x: number, y: number, speed: number, dt: number): number {
  const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
  if (d < 2) { e.vx = e.vy = 0; return d; }
  const sp = Math.min(d / dt, speed * (1 - e.slow));
  e.vx = (dx / d) * sp; e.vy = (dy / d) * sp;
  e.x += e.vx * dt; e.y += e.vy * dt;
  e.dir = Math.atan2(dy, dx);
  return d;
}

export function ringShot(w: World, x: number, y: number, n: number, speed: number, dmg: number, off: number, color: number, r = 7, life = 6): void {
  for (let i = 0; i < n; i++) spawnBullet(w, x, y, off + (i / n) * TAU, speed, dmg, r, color, life);
}

export function fanShot(w: World, x: number, y: number, ang: number, n: number, arc: number, speed: number, dmg: number, color: number, r = 7): void {
  for (let i = 0; i < n; i++) spawnBullet(w, x, y, ang + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0), speed, dmg, r, color);
}

/** Telegraphed one-shot blast. */
export function tele(w: World, x: number, y: number, r: number, delay: number, dmg: number, el: ElementId = 'fire', o: Partial<Zone> = {}): Zone {
  return spawnZone(w, x, y, r, 0.1, dmg, el, 1, null, { delay, once: true, style: 'tele', color: 0xff3355, ...o });
}

/** Telegraphed lingering hazard. */
export function hazard(w: World, x: number, y: number, r: number, dur: number, dmg: number, delay: number, color: number, el: ElementId = 'fire', o: Partial<Zone> = {}): Zone {
  return spawnZone(w, x, y, r, dur, dmg, el, 1, null, { delay, tick: 0.5, style: 'tele', color, ...o });
}

/** Telegraphed beam anchored to an enemy. */
export function laser(w: World, e: Enemy, ang: number, len: number, width: number, delay: number, dur: number, dmg: number, rot: number, color: number, o: Partial<Beam> = {}): Beam {
  return spawnBeam(w, e.x, e.y, ang, len, width, dur, dmg, 'light', 1, null, { delay, owner: e, rot, color, tick: 0.15, ...o });
}

export function summon(w: World, id: string, n: number, x: number, y: number, spread = 60): Enemy[] {
  const def = w.content.enemies.get(id);
  const out: Enemy[] = [];
  if (!def || w.enemies.length > 300) return out;
  for (let i = 0; i < n; i++) {
    const a = w.rng.angle();
    const c = spawnEnemy(w, def, x + Math.cos(a) * spread, y + Math.sin(a) * spread);
    c.noXp = true;
    c.tag = 'add';
    out.push(c);
  }
  w.fx.ring(x, y, spread + 20, def.col, 0.3);
  return out;
}

/** Random point inside the arena, at least `min` from the player. */
export function arenaPoint(w: World, min = 0, margin = 80): [number, number] {
  const A = w.arena ?? { x: w.player.x, y: w.player.y, r: ARENA_R };
  for (let i = 0; i < 8; i++) {
    const a = w.rng.angle(), d = Math.sqrt(w.rng.next()) * (A.r - margin);
    const x = A.x + Math.cos(a) * d, y = A.y + Math.sin(a) * d;
    if (Math.hypot(x - w.player.x, y - w.player.y) >= min) return [x, y];
  }
  return [A.x, A.y];
}
