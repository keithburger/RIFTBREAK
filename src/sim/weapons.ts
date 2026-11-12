/**
 * Weapon engine: parameter resolution, the fire loop, and the shared primitives every weapon is
 * built from (projectiles, zones, beams, minions). Behaviors themselves live in weaponKinds.ts and
 * register here by name; content selects one with `base.kind`.
 */
import { applyOps } from '../core/ops';
import { TAU, angDiff, turn } from '../core/math';
import { F_NOREACT, applyCurse, applyStatus, damageEnemy, elCol, healPlayer, hitArc, hitCircle, hitEnemy, hitLine, nearestEnemy, randomEnemies, strongestEnemy } from './combat';
import { spawnBeam, spawnMinion, spawnProj, spawnZone } from './entities';
import type { Enemy, Minion, Proj, WP, WeaponDef, WeaponInst, Zone } from './types';
import type { World } from './world';

export interface WeaponKind {
  /** Called when the cooldown elapses. Return false to retry shortly (e.g. no target). */
  fire?(w: World, wi: WeaponInst): boolean | void;
  /** Called every step (persistent / movement-driven kinds). */
  update?(w: World, wi: WeaponInst, dt: number): void;
  /** Called when the player starts a dash. */
  dash?(w: World, wi: WeaponInst): void;
}
export const KINDS: Record<string, WeaponKind> = {};
export const registerKind = (name: string, k: WeaponKind): void => { KINDS[name] = k; };
export const MINIONS: Record<string, (w: World, m: Minion, dt: number) => void> = {};

const WP_DEFAULTS: WP = { kind: 'shot', el: 'arcane', dmg: 10, cd: 1, count: 1, speed: 400, range: 420, area: 8, dur: 1, pierce: 0, spread: 0, tick: 0.3, kb: 0, x: {}, sprite: '', color: 0xffffff };

export function resolveParams(w: World, wi: WeaponInst): void {
  const d = wi.def;
  const p = structuredClone({ ...WP_DEFAULTS, ...d.base, x: { ...(d.base.x ?? {}) } }) as WP;
  p.el = d.base.el ?? d.el;
  for (let i = 0; i < wi.rank - 1 && i < d.ups.length; i++) applyOps(p, d.ups[i]);
  if (wi.evo) applyOps(p, wi.evo.ops);
  if (!p.sprite) p.sprite = 'p_bolt';
  if (p.color === 0xffffff) p.color = elCol(w, p.el);
  wi.p = p;
}

export function makeWeapon(w: World, def: WeaponDef): WeaponInst {
  const wi: WeaponInst = { def, rank: 1, evo: null, p: null as unknown as WP, cd: 0.4, t: 0, st: 0, acc: 0, dmgDone: 0, flip: 0 };
  resolveParams(w, wi);
  return wi;
}

export const maxRank = (d: WeaponDef): number => d.ups.length + 1;

export function updateWeapons(w: World, dt: number): void {
  const p = w.player;
  const rate = p.dynHaste * (p.surgeT > 0 ? 1.35 : 1);
  for (const wi of p.weapons) {
    const k = KINDS[wi.p.kind];
    k.update?.(w, wi, dt);
    if (!k.fire) continue;
    wi.cd -= dt * rate;
    if (wi.cd <= 0) {
      if (k.fire(w, wi) === false) wi.cd = 0.12;
      else {
        wi.cd += wi.p.cd * p.stats.cooldown;
        if (wi.cd < 0) wi.cd = 0;
        for (const h of p.hooks) h.onFire?.(w, wi);
      }
    }
  }
}

export function weaponsOnDash(w: World): void {
  for (const wi of w.player.weapons) KINDS[wi.p.kind].dash?.(w, wi);
}

export const cnt = (w: World, p: WP): number => Math.max(1, Math.round(p.count + w.player.stats.amount));
export const area = (w: World, v: number): number => v * w.player.stats.area;
export const dur = (w: World, v: number): number => v * w.player.stats.duration;

export function zoneFrom(w: World, x: number, y: number, p: WP, wi: WeaponInst | null, o: Partial<Zone> = {}): Zone {
  const z = p.zone ?? {};
  return spawnZone(w, x, y, area(w, z.r ?? 40), dur(w, z.dur ?? 2.5), p.dmg * (z.dps ?? 0.3), p.el, 0, wi, {
    tick: z.tick ?? 0.4, slow: z.slow ?? 0, pull: z.pull ?? 0, grow: z.grow ?? 0, style: z.style ?? 'pool', color: p.color,
    collapse: z.collapse ?? 0, ...o,
  });
}

// ---------------------------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------------------------
const hitScratch: Enemy[] = [];

export function chainFrom(w: World, e: Enemy, p: WP, wi: WeaponInst | null, jumps: number, dmg: number, visited: number[]): void {
  let cur = e;
  for (let i = 0; i < jumps; i++) {
    const nx = nearestEnemy(w, cur.x, cur.y, 190, visited, cur);
    if (!nx) break;
    visited.push(nx.id);
    w.fx.line(cur.x, cur.y, nx.x, nx.y, p.color, 2.5, 0.14);
    hitEnemy(w, nx, dmg, p, wi);
    if (p.x.chainBoom) hitCircle(w, nx.x, nx.y, area(w, p.x.chainBoom), dmg * 0.5, p, wi);
    cur = nx;
  }
}

function projEnd(w: World, pr: Proj): void {
  const p = pr.p;
  if (pr.mode === 1 || p.x.endBoom) {
    const r = area(w, p.explode ?? p.x.endBoom ?? 40) * (pr.gen ? 0.7 : 1);
    w.fx.ring(pr.x, pr.y, r, p.color, 0.3);
    w.fx.burst(pr.x, pr.y, p.color, 10, 220, 4);
    w.fx.sfx('boom', pr.x, pr.y);
    hitCircle(w, pr.x, pr.y, r, pr.dmg * (p.x.endBoom && pr.mode !== 1 ? p.x.endMult ?? 1.5 : 1), p, pr.wi);
    if (r > 70) w.fx.shake(3);
  }
  if (p.zone && !p.trailZone && pr.zoneT >= 0 && pr.gen === 0) zoneFrom(w, pr.x, pr.y, p, pr.wi);
  if (pr.mode === 1 && p.split && pr.gen === 0)
    for (let i = 0; i < p.split; i++) {
      const a = (i / p.split) * TAU + w.rng.next();
      const c = spawnProj(w, pr.x, pr.y, a, p, pr.wi, 1);
      lobTo(c, pr.x + Math.cos(a) * 70, pr.y + Math.sin(a) * 70, 0.35);
      c.dmg = pr.dmg * 0.5;
    }
}

export function lobTo(pr: Proj, tx: number, ty: number, t: number): void {
  pr.mode = 1; pr.tx = tx; pr.ty = ty; pr.life = t;
  pr.vx = (tx - pr.x) / t; pr.vy = (ty - pr.y) / t;
}

function projHit(w: World, pr: Proj, e: Enemy): void {
  const p = pr.p;
  const wasAlive = e.alive;
  hitEnemy(w, e, pr.dmg, p, pr.wi, 0, pr.x - pr.vx * 0.05, pr.y - pr.vy * 0.05);
  pr.hits.push(e.id);
  if (pr.hits.length > 28) pr.hits.shift();
  w.fx.burst(pr.x, pr.y, pr.color, 2, 120, 2.5);
  if (wasAlive && !(e.link ?? e).alive) {
    pr.kills++;
    if (p.x.devour) { pr.r *= 1.05; pr.scale *= 1.05; pr.dmg *= 1.04; }
    if (p.x.brood && pr.gen < 2) {
      const c = spawnProj(w, pr.x, pr.y, pr.rot + 2.4, p, pr.wi, pr.gen + 1);
      c.life = 2.5;
    }
  }
  if (p.explode && pr.gen < 2) {
    const r = area(w, p.explode);
    w.fx.ring(pr.x, pr.y, r, p.color, 0.22);
    hitCircle(w, pr.x, pr.y, r, pr.dmg * 0.6, p, pr.wi);
  }
  if (p.chain && pr.gen < 2) chainFrom(w, e, p, pr.wi, p.chain, pr.dmg * 0.5, [e.id]);
  if (p.split && pr.gen === 0 && pr.mode !== 1) {
    for (let i = 0; i < p.split; i++) {
      const c = spawnProj(w, pr.x, pr.y, pr.rot + (i - (p.split - 1) / 2) * 0.5 + (p.x.splitRadial ? (i / p.split) * TAU : 0), p, pr.wi, 1);
      c.dmg = pr.dmg * 0.5; c.r = pr.r * 0.75; c.scale = 0.7; c.hits.push(e.id); c.life = Math.min(c.life, 0.5); c.mode = 0;
    }
    pr.gen = 1;
  }
  if (p.zone && !p.trailZone && pr.zoneT >= 0 && pr.gen === 0) { zoneFrom(w, pr.x, pr.y, p, pr.wi); pr.zoneT = -1; }
  if (p.x.shrap && w.rng.next() < 0.5) {
    const c = spawnProj(w, pr.x, pr.y, w.rng.angle(), p, pr.wi, 2);
    c.dmg = pr.dmg * 0.4; c.r = 5; c.scale = 0.5; c.life = 0.4;
  }
  if (pr.bounce > 0) {
    pr.bounce--;
    const nx = nearestEnemy(w, pr.x, pr.y, 340, pr.hits, e);
    if (nx) {
      const sp = Math.hypot(pr.vx, pr.vy);
      const a = Math.atan2(nx.y - pr.y, nx.x - pr.x);
      pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp; pr.rot = a;
      pr.life = Math.max(pr.life, 0.7);
      pr.target = nx;
      return;
    }
    if (p.x.lastBoom) { hitCircle(w, pr.x, pr.y, area(w, p.x.lastBoom), pr.dmg, p, pr.wi); w.fx.ring(pr.x, pr.y, area(w, p.x.lastBoom), p.color, 0.3); }
  }
  if (--pr.pierce < 0) { if (p.x.lastBoom && pr.bounce <= 0) { hitCircle(w, pr.x, pr.y, area(w, p.x.lastBoom), pr.dmg, p, pr.wi); w.fx.ring(pr.x, pr.y, area(w, p.x.lastBoom), p.color, 0.3); } pr.alive = false; }
}

export function updateProjectiles(w: World, dt: number): void {
  const pl = w.player;
  const list = w.projs;
  for (let i = 0; i < list.length; i++) {
    const pr = list[i];
    const p = pr.p;
    pr.age += dt;
    pr.life -= dt;
    if (pr.mode === 1) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.scale = 1 + Math.sin(Math.PI * Math.min(1, pr.age / (pr.age + Math.max(0.0001, pr.life)))) * 0.7;
      pr.rot += dt * 6;
      if (pr.life <= 0) { projEnd(w, pr); pr.alive = false; }
      continue;
    }
    if (pr.mode === 2) {
      // returning: fly out for half the life, then accelerate home
      if (pr.life < 0) pr.life = 0.01;
      const half = (p.range / Math.max(1, p.speed * pl.stats.projSpeed)) * 0.5;
      if (pr.age > half) {
        if (pr.tx === 0) { pr.tx = 1; pr.hits.length = 0; if (p.x.hold) { pr.mode = 3; pr.ty = dur(w, p.x.hold); } }
        const a = Math.atan2(pl.y - pr.y, pl.x - pr.x);
        const sp = p.speed * pl.stats.projSpeed * 1.25;
        pr.vx += (Math.cos(a) * sp - pr.vx) * Math.min(1, dt * 5);
        pr.vy += (Math.sin(a) * sp - pr.vy) * Math.min(1, dt * 5);
        const dx = pl.x - pr.x, dy = pl.y - pr.y;
        if (dx * dx + dy * dy < 30 * 30 || pr.age > half * 6 + 3) pr.alive = false;
      }
      pr.life = 1;
      pr.rot += dt * 14;
    } else if (pr.mode === 3) {
      pr.ty -= dt;
      pr.rot += dt * 20;
      pr.life = 1;
      pr.tickT -= dt;
      if (pr.tickT <= 0) { pr.tickT = 0.2; hitCircle(w, pr.x, pr.y, pr.r * 2.2, pr.dmg * 0.5, p, pr.wi); }
      if (pr.ty <= 0) pr.mode = 2;
      continue;
    } else if (pr.spin) pr.rot += pr.spin * dt;
    if (pr.homing > 0) {
      pr.tickT -= dt;
      if ((!pr.target || !pr.target.alive || pr.target.hidden) && pr.tickT <= 0 && !p.tickR) {
        pr.tickT = 0.15;
        pr.target = nearestEnemy(w, pr.x, pr.y, 420, pr.hits);
      }
      const t = pr.target;
      if (t && t.alive) {
        const sp = Math.hypot(pr.vx, pr.vy);
        const a = turn(Math.atan2(pr.vy, pr.vx), Math.atan2(t.y - pr.y, t.x - pr.x), pr.homing * dt);
        pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp; pr.rot = a;
      }
    }
    if (p.grow) { const g = 1 + p.grow * dt; pr.r *= g; pr.scale *= g; }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    if (p.trailZone) {
      pr.zoneT -= dt;
      if (pr.zoneT <= 0) { pr.zoneT = p.trailZone; zoneFrom(w, pr.x, pr.y, p, pr.wi); }
    }
    if (p.tickR) {
      pr.tickT -= dt;
      if (pr.tickT <= 0) {
        pr.tickT = p.tick;
        const before = w.stats.kills;
        hitCircle(w, pr.x, pr.y, pr.r, pr.dmg, p, pr.wi);
        if (p.x.devour) { const k = Math.min(6, w.stats.kills - before); if (k > 0) { pr.r *= 1 + 0.03 * k; pr.scale *= 1 + 0.03 * k; } }
      }
    } else if (pr.alive) {
      hitScratch.length = 0;
      w.grid.query(pr.x, pr.y, pr.r, hitScratch);
      for (let j = 0; j < hitScratch.length && pr.alive; j++) {
        const e = hitScratch[j];
        if (!e.alive || e.hidden || pr.hits.includes(e.id)) continue;
        projHit(w, pr, e);
      }
    }
    if (pr.alive && pr.life <= 0) { projEnd(w, pr); pr.alive = false; }
  }
  // compact + recycle
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const pr = list[i];
    if (pr.alive) list[n++] = pr;
    else { pr.wi = null; pr.target = null; w.projPool.push(pr); }
  }
  list.length = n;
}

// ---------------------------------------------------------------------------------------------
// Zones, beams, minions
// ---------------------------------------------------------------------------------------------
export function updateZones(w: World, dt: number): void {
  const pl = w.player;
  for (const z of w.zones) {
    z.life -= dt;
    if (z.track) { if (z.track.alive) { z.x = z.track.x; z.y = z.track.y; } else z.track = null; }
    if (z.follow) { z.x = pl.x; z.y = pl.y; }
    const active = z.life <= z.max - z.delay;
    if (active) {
      if (z.wander) {
        const t = nearestEnemy(w, z.x, z.y, 500);
        const a = t ? Math.atan2(t.y - z.y, t.x - z.x) : Math.atan2(z.vy, z.vx) + (w.rng.next() - 0.5) * 0.3;
        z.vx += (Math.cos(a) * z.wander - z.vx) * Math.min(1, dt * 2);
        z.vy += (Math.sin(a) * z.wander - z.vy) * Math.min(1, dt * 2);
      }
      z.x += z.vx * dt; z.y += z.vy * dt;
      if (z.grow) z.r += z.grow * dt;
      if (z.team >= 1 && z.pull) {
        const dx = z.x - pl.x, dy = z.y - pl.y, d = Math.hypot(dx, dy);
        if (d < z.r && d > 4 && pl.dashT <= 0) { pl.x += (dx / d) * z.pull * dt; pl.y += (dy / d) * z.pull * dt; }
      }
      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT += z.tick;
        if (z.team !== 1) {
          const fl = z.noReact ? F_NOREACT : 0;
          for (const e of w.grid.query(z.x, z.y, z.r)) {
            if (!e.alive || e.hidden) continue;
            if (z.dmg > 0) {
              if (z.wi) hitEnemy(w, e, z.dmg, NOSTATUS(z.wi.p), z.wi, fl, z.x, z.y);
              else damageEnemy(w, e, z.dmg, z.el, null, fl | 8);
            }
            if (!e.alive) continue;
            if (z.status) applyStatus(w, e, z.status.s, z.status.s === 'burn' || z.status.s === 'poison' ? z.status.pow * z.dmg : z.status.pow, z.status.dur);
            if (z.slow) applyStatus(w, e, 'slow', z.slow, z.tick + 0.3);
            if ((z.pull || z.kb) && !e.boss) {
              const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy) || 1;
              const f = z.pull ? z.pull : -z.kb;
              e.kx += (dx / d) * f; e.ky += (dy / d) * f;
            }
          }
        }
        if (z.team >= 1) {
          const dx = z.x - pl.x, dy = z.y - pl.y;
          if (dx * dx + dy * dy < (z.r + pl.r * 0.5) ** 2) {
            if (z.dmg > 0) hurtP(w, z.dmg, z.team === 2 ? 'hazard' : w.boss ? 'boss:zone' : 'zone');
            if (z.slow) pl.slowT = Math.max(pl.slowT, z.tick + 0.2);
          }
        }
        if (z.heal > 0) {
          const dx = z.x - pl.x, dy = z.y - pl.y;
          if (dx * dx + dy * dy < z.r * z.r) healPlayer(w, z.heal);
        }
        if (z.once) { z.tickT = 1e9; z.life = Math.min(z.life, 0.18); if (z.team === 0) w.fx.burst(z.x, z.y, z.color, 5, 160, 3); }
      }
    }
    if (z.life <= 0) {
      z.alive = false;
      if (z.collapse) {
        w.fx.ring(z.x, z.y, z.r * 1.6, z.color, 0.35);
        w.fx.burst(z.x, z.y, z.color, 16, 300, 4);
        w.fx.sfx('boom', z.x, z.y);
        w.fx.shake(4);
        if (z.wi) hitCircle(w, z.x, z.y, z.r * 1.6, z.dmg * z.collapse, z.wi.p, z.wi);
      }
      z.onEnd?.(w, z);
    }
  }
  let n = 0;
  for (let i = 0; i < w.zones.length; i++) if (w.zones[i].alive) w.zones[n++] = w.zones[i];
  w.zones.length = n;
}

// Late-bound to avoid a module cycle with combat (hurtPlayer lives there).
import { hurtPlayer as hurtP } from './combat';

const noStatusCache = new WeakMap<WP, WP>();
function NOSTATUS(p: WP): WP {
  if (!p.status && !p.kb && !p.exec) return p;
  let c = noStatusCache.get(p);
  if (!c) { c = { ...p, status: undefined, kb: 0, exec: 0 }; noStatusCache.set(p, c); }
  return c;
}

export function updateBeams(w: World, dt: number): void {
  const pl = w.player;
  for (const b of w.beams) {
    b.life -= dt;
    if (b.follow) { b.x = pl.x; b.y = pl.y; }
    if (b.owner) { if (b.owner.alive) { b.x = b.owner.x; b.y = b.owner.y; } else { b.alive = false; continue; } }
    const active = b.life <= b.max - b.delay;
    if (active || b.team === 0) b.ang += b.rot * dt;
    if (active) {
      b.tickT -= dt;
      if (b.tickT <= 0) {
        b.tickT += b.tick;
        if (b.team === 0 && b.wi) {
          const prog = 1 - b.life / Math.max(0.001, b.max - b.delay);
          hitLine(w, b.x, b.y, b.ang, b.len, b.width, b.dmg * (1 + b.ramp * prog), b.wi.p, b.wi);
        } else if (b.team === 1) {
          const cx = Math.cos(b.ang), sy = Math.sin(b.ang);
          const dx = pl.x - b.x, dy = pl.y - b.y;
          const along = dx * cx + dy * sy;
          if (along > -pl.r && along < b.len + pl.r && Math.abs(dx * sy - dy * cx) < b.width * 0.5 + pl.r * 0.6 && b.dmg > 0) hurtP(w, b.dmg, w.boss ? 'boss:beam' : 'beam');
        }
      }
    }
    if (b.life <= 0) b.alive = false;
  }
  let n = 0;
  for (let i = 0; i < w.beams.length; i++) if (w.beams[i].alive) w.beams[n++] = w.beams[i];
  w.beams.length = n;
}

export function updateMinions(w: World, dt: number): void {
  for (const m of w.minions) {
    m.t += dt;
    m.life -= dt;
    if (m.life <= 0 || !w.player.weapons.includes(m.wi)) { m.alive = false; MINION_END[m.kind]?.(w, m); continue; }
    MINIONS[m.kind](w, m, dt);
  }
  let n = 0;
  for (let i = 0; i < w.minions.length; i++) if (w.minions[i].alive) w.minions[n++] = w.minions[i];
  w.minions.length = n;
}
export const MINION_END: Record<string, (w: World, m: Minion) => void> = {};

/** Keep exactly `n` permanent minions of a kind alive for this weapon. */
export function maintain(w: World, wi: WeaponInst, kind: string, n: number): void {
  let have = 0;
  for (const m of w.minions) if (m.wi === wi && m.kind === kind) { if (have >= n) m.life = 0; else m.idx = have; have++; }
  for (; have < n; have++) spawnMinion(w, kind, w.player.x, w.player.y, wi, Infinity, have);
  wi.st = n;
}
