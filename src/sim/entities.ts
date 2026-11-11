import type { Beam, Bullet, ElementId, Enemy, EnemyDef, Minion, Pickup, PickupKind, Proj, WP, WeaponInst, Zone } from './types';
import type { World } from './world';

export const ELITE_HP = [1, 7, 22];
export const ELITE_SIZE = [1, 1.35, 1.75];

export function spawnEnemy(w: World, def: EnemyDef, x: number, y: number, elite = 0): Enemy {
  const hp = def.hp * w.diff.hp * ELITE_HP[elite];
  const e: Enemy = {
    id: w.nextId++, def, x, y, r: def.r * ELITE_SIZE[elite], _q: 0, vx: 0, vy: 0, hp, maxHp: hp,
    dmg: def.dmg * w.diff.dmg * (elite ? 1.4 : 1), spd: def.spd * w.diff.spd, alive: true, elite,
    mark: null, markT: 0, reactCd: 0, burn: 0, burnT: 0, poison: 0, poisonT: 0, slow: 0, slowT: 0, freezeT: 0,
    stunT: 0, vuln: 0, vulnT: 0, weakT: 0, curseT: 0, curseW: null, sporeT: 0, sporeW: null, dotT: w.rng.next() * 0.5, kx: 0, ky: 0,
    ai: 0, t: 0, t2: w.rng.next() * 3, ax: 0, ay: 0, dir: Math.atan2(w.player.y - y, w.player.x - x),
    atkT: 1 + w.rng.next() * 2, n: 0, flash: 0, age: 0, shield: 0, hidden: false, invuln: false, touchT: 0,
    boss: null, link: null, hasteT: 0, wardT: 0, noXp: false, tag: '',
  };
  w.enemies.push(e);
  return e;
}

function newProj(): Proj {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 0, dmg: 0, el: 'fire', life: 0, age: 0, pierce: 0, hits: [], p: null as unknown as WP,
    wi: null, sprite: '', color: 0, rot: 0, spin: 0, gen: 0, bounce: 0, homing: 0, mode: 0, tx: 0, ty: 0, tickT: 0,
    zoneT: 0, scale: 1, alive: false, target: null, kills: 0,
  };
}

/** Spawn a player projectile. `mode`: 0 straight, 1 lobbed (no collision until landing), 2 returning, 3 held in place. */
export function spawnProj(w: World, x: number, y: number, ang: number, p: WP, wi: WeaponInst | null, gen = 0): Proj {
  const o = w.projPool.pop() ?? newProj();
  const s = w.player.stats;
  const speed = p.speed * s.projSpeed;
  o.x = x; o.y = y; o.vx = Math.cos(ang) * speed; o.vy = Math.sin(ang) * speed;
  o.r = p.area * (p.kind === 'shot' || p.kind === 'stride' ? Math.sqrt(s.area) : s.area);
  o.dmg = p.dmg; o.el = p.el; o.life = Math.max(0.15, p.range / Math.max(1, speed)); o.age = 0;
  o.pierce = p.pierce + s.pierce; o.hits.length = 0; o.p = p; o.wi = wi; o.sprite = p.sprite; o.color = p.color;
  o.rot = ang; o.spin = 0; o.gen = gen; o.bounce = p.bounce ?? 0; o.homing = p.homing ?? 0;
  o.mode = p.returns ? 2 : 0; o.tx = 0; o.ty = 0; o.tickT = 0; o.zoneT = 0; o.scale = 1; o.alive = true;
  o.target = null; o.kills = 0;
  w.projs.push(o);
  return o;
}

export function spawnZone(w: World, x: number, y: number, r: number, dur: number, dmg: number, el: ElementId, team: number, wi: WeaponInst | null, o: Partial<Zone> = {}): Zone {
  const z: Zone = {
    x, y, r, life: dur, max: dur, delay: 0, tick: 0.4, tickT: 0, dmg, el, team, wi, slow: 0, pull: 0, grow: 0, vx: 0, vy: 0,
    once: false, follow: false, track: null, style: 'pool', color: 0xffffff, status: null, collapse: 0, kb: 0, heal: 0,
    wander: 0, alive: true, noReact: false, onEnd: null, ...o,
  };
  if (z.delay > 0) z.max = z.life = dur + z.delay;
  if (w.zones.length < 420) w.zones.push(z);
  return z;
}

export function spawnBeam(w: World, x: number, y: number, ang: number, len: number, width: number, dur: number, dmg: number, el: ElementId, team: number, wi: WeaponInst | null, o: Partial<Beam> = {}): Beam {
  const b: Beam = {
    x, y, ang, len, width, life: dur, max: dur, delay: 0, tick: 0.2, tickT: 0, dmg, el, team, wi, follow: false, owner: null,
    rot: 0, color: 0xffffff, status: null, alive: true, ramp: 0, ...o,
  };
  if (b.delay > 0) b.max = b.life = dur + b.delay;
  w.beams.push(b);
  return b;
}

export function spawnBullet(w: World, x: number, y: number, ang: number, speed: number, dmg: number, r = 6, color = 0xff5566, life = 6, sprite = 'b_orb'): Bullet {
  const b = w.bulletPool.pop() ?? ({} as Bullet);
  b.x = x; b.y = y; b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed; b.r = r; b.dmg = dmg; b.life = life;
  b.color = color; b.sprite = sprite; b.homing = 0; b.accel = 0; b.alive = true;
  if (w.bullets.length < 900) w.bullets.push(b);
  return b;
}

export function spawnMinion(w: World, kind: string, x: number, y: number, wi: WeaponInst, life: number, idx = 0): Minion {
  const m: Minion = { kind, x, y, vx: 0, vy: 0, life, t: 0, ang: 0, wi, idx, target: null, alive: true, r: 14, st: 0 };
  w.minions.push(m);
  return m;
}

export function spawnPickup(w: World, kind: PickupKind, x: number, y: number, value = 1): Pickup | null {
  if (kind === 'xp' && w.pickups.length > 380) {
    w.xpOverflow += value;
    return null;
  }
  if (kind === 'xp' && w.xpOverflow > 0) {
    value += w.xpOverflow;
    w.xpOverflow = 0;
  }
  const a = w.rng.angle();
  const sp = 40 + w.rng.next() * 60;
  const pk: Pickup = { kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, age: 0, pulled: false, alive: true };
  w.pickups.push(pk);
  return pk;
}

/** Position on the spawn ring just outside the view around the player. */
export function ringPos(w: World, ang: number, extra = 0): [number, number] {
  const r = Math.hypot(w.view.w, w.view.h) / 2 + 70 + extra;
  let x = w.player.x + Math.cos(ang) * r;
  let y = w.player.y + Math.sin(ang) * r;
  if (w.arena) {
    const dx = x - w.arena.x, dy = y - w.arena.y, d = Math.hypot(dx, dy);
    if (d > w.arena.r - 30) { x = w.arena.x + (dx / d) * (w.arena.r - 30); y = w.arena.y + (dy / d) * (w.arena.r - 30); }
  }
  return [x, y];
}
