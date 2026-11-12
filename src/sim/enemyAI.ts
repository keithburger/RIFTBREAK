/**
 * Enemy behavior library. An EnemyDef composes one movement behavior, an optional attack behavior
 * and traits. Register new behaviors in MOVES / ATTACKS; content references them by name.
 */
import { TAU, turn } from '../core/math';
import { hurtPlayer, killEnemy, tickStatus } from './combat';
import { updateBoss } from './boss';
import { ringPos, spawnBeam, spawnBullet, spawnEnemy, spawnZone } from './entities';
import type { Enemy } from './types';
import type { World } from './world';

type MoveFn = (w: World, e: Enemy, dt: number, sp: number, a: readonly (number | string)[]) => void;
type AtkFn = (w: World, e: Enemy, dt: number, a: readonly (number | string)[]) => void;
export const MOVES: Record<string, MoveFn> = {};
export const ATTACKS: Record<string, AtkFn> = {};

const TELE = 0xff3355;

function go(e: Enemy, ang: number, sp: number, dt: number, turnRate = 8): void {
  e.dir = turn(e.dir, ang, turnRate * dt);
  e.vx = Math.cos(ang) * sp;
  e.vy = Math.sin(ang) * sp;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}
const toPlayer = (w: World, e: Enemy): number => Math.atan2(w.player.y - e.y, w.player.x - e.x);
const distP = (w: World, e: Enemy): number => Math.hypot(w.player.x - e.x, w.player.y - e.y);
const N = (v: number | string | undefined, d = 0): number => (typeof v === 'number' ? v : d);

// ----------------------------------------------------------------------------- movement
MOVES.chase = (w, e, dt, sp) => go(e, toPlayer(w, e), sp, dt);

/** flank(orbitRadius, lungeEvery): circle the player, then lunge. */
MOVES.flank = (w, e, dt, sp, a) => {
  const d = distP(w, e), ang = toPlayer(w, e);
  e.t += dt;
  if (e.ai === 1) {
    go(e, e.ax, sp * 2.4, dt, 0);
    if (e.t > 0.7) { e.ai = 0; e.t = 0; }
    return;
  }
  const R = N(a[1], 170);
  const side = e.id % 2 ? 1 : -1;
  go(e, ang + side * (d > R + 40 ? 0.5 : d < R - 40 ? 2.2 : 1.45), sp, dt);
  if (e.t > N(a[2], 3.5) && d < R + 120) { e.ai = 1; e.t = 0; e.ax = ang; w.fx.ring(e.x, e.y, e.r + 8, e.def.col2, 0.2); }
};

/** charge(windup, speedMult, dashTime): telegraphed straight-line rush. */
MOVES.charge = (w, e, dt, sp, a) => {
  e.t += dt;
  if (e.ai === 0) {
    go(e, toPlayer(w, e), sp, dt);
    if (distP(w, e) < 300 && e.t > 1.2) {
      e.ai = 1; e.t = 0; e.ax = toPlayer(w, e); e.dir = e.ax; e.vx = e.vy = 0;
      spawnBeam(w, e.x, e.y, e.ax, sp * N(a[2], 4) * N(a[3], 0.6) + 40, e.r * 2, 0.05, 0, 'fire', 1, null, { delay: N(a[1], 0.7), color: TELE });
    }
  } else if (e.ai === 1) {
    e.vx = e.vy = 0;
    if (e.t > N(a[1], 0.7)) { e.ai = 2; e.t = 0; w.fx.sfx('charge', e.x, e.y); }
  } else if (e.ai === 2) {
    go(e, e.ax, sp * N(a[2], 4), dt, 0);
    if (e.t > N(a[3], 0.6)) { e.ai = 3; e.t = 0; }
  } else {
    e.vx = e.vy = 0;
    if (e.t > 0.7) { e.ai = 0; e.t = 0; }
  }
};

/** kite(range): hold a preferred distance and strafe. */
MOVES.kite = (w, e, dt, sp, a) => {
  const d = distP(w, e), ang = toPlayer(w, e), R = N(a[1], 260);
  const side = e.id % 2 ? 1 : -1;
  if (d > R + 50) go(e, ang, sp, dt);
  else if (d < R - 50) go(e, ang + Math.PI, sp * 0.9, dt);
  else go(e, ang + side * 1.57, sp * 0.5, dt);
  e.dir = turn(e.dir, ang, 10 * dt);
};

/** zigzag(amplitude, frequency) */
MOVES.zigzag = (w, e, dt, sp, a) => {
  e.t += dt;
  go(e, toPlayer(w, e) + Math.sin(e.t * N(a[2], 5) + e.id) * N(a[1], 0.9), sp, dt);
};

/** formation: march in a fixed heading as a block, re-aiming after overshooting. */
MOVES.formation = (w, e, dt, sp) => {
  e.t += dt;
  if (e.ai === 0) { e.ai = 1; if (e.ax === 0 && e.ay === 0) e.ax = toPlayer(w, e); }
  go(e, e.ax, sp, dt);
  if (e.t > 3) {
    const d = distP(w, e);
    if (d > 520 || e.t > 9) { e.ax = toPlayer(w, e); e.t = 0; }
  }
};

/** swoop(speedMult): fast straight passes through the player's position with pauses between. */
MOVES.swoop = (w, e, dt, sp, a) => {
  e.t += dt;
  if (e.ai === 0) {
    e.vx = e.vy = 0;
    if (e.t > 0.6) { e.ai = 1; e.t = 0; e.ax = toPlayer(w, e); e.ay = (distP(w, e) + 260) / (sp * N(a[1], 2.2)); }
  } else {
    go(e, e.ax, sp * N(a[1], 2.2), dt, 20);
    if (e.t > e.ay) { e.ai = 0; e.t = 0; }
  }
};

/** ambush(triggerRadius, speedMult): invisible and untargetable until the player strays close. */
MOVES.ambush = (w, e, dt, sp, a) => {
  if (e.ai === 0) {
    e.hidden = true;
    go(e, toPlayer(w, e), sp * 0.35, dt);
    if (distP(w, e) < N(a[1], 150) || e.age > 25) { e.ai = 1; e.t = 0; e.hidden = false; w.fx.ring(e.x, e.y, e.r + 14, e.def.col2, 0.3); w.fx.sfx('reveal', e.x, e.y); }
  } else {
    e.t += dt;
    if (e.t > 0.45) go(e, toPlayer(w, e), sp * N(a[2], 1.6), dt);
  }
};

/** blink(interval, distance): teleport around the player; pauses briefly after arriving. */
MOVES.blink = (w, e, dt, sp, a) => {
  e.t += dt;
  if (e.t > N(a[1], 3)) {
    e.t = -0.45;
    const ang = w.rng.angle(), R = N(a[2], 150);
    w.fx.burst(e.x, e.y, e.def.col, 6, 120, 3);
    e.x = w.player.x + Math.cos(ang) * R;
    e.y = w.player.y + Math.sin(ang) * R;
    w.fx.ring(e.x, e.y, e.r + 12, e.def.col2, 0.3);
  }
  if (e.t >= 0) go(e, toPlayer(w, e), sp, dt); else e.vx = e.vy = 0;
};

/** burrow(surfaceTime): tunnel unseen, erupt under the player with a telegraph, fight, repeat. */
MOVES.burrow = (w, e, dt, sp, a) => {
  e.t += dt;
  if (e.ai === 0) {
    e.hidden = true;
    go(e, toPlayer(w, e), sp * 2.2, dt);
    if (distP(w, e) < 80) {
      e.ai = 1; e.t = 0;
      spawnZone(w, e.x, e.y, 62, 0.1, e.dmg, 'earth', 1, null, { delay: 0.85, once: true, style: 'tele', color: TELE });
    }
  } else if (e.ai === 1) {
    e.vx = e.vy = 0;
    if (e.t > 0.85) { e.ai = 2; e.t = 0; e.hidden = false; w.fx.burst(e.x, e.y, e.def.col, 10, 200, 4); }
  } else {
    go(e, toPlayer(w, e), sp, dt);
    if (e.t > N(a[1], 4)) { e.ai = 0; e.t = 0; }
  }
};

/** orbit(radius): circle the player, tightening slowly. */
MOVES.orbit = (w, e, dt, sp, a) => {
  const d = distP(w, e), ang = toPlayer(w, e);
  const R = Math.max(90, N(a[1], 220) - e.age * 4);
  go(e, ang + (e.id % 2 ? 1 : -1) * (d > R ? 1.1 : 1.75), sp, dt);
  e.dir = turn(e.dir, ang, 10 * dt);
};

/** leap(interval, range): telegraphed jump onto the player's position. */
MOVES.leap = (w, e, dt, sp, a) => {
  e.t += dt;
  if (e.ai === 0) {
    go(e, toPlayer(w, e), sp, dt);
    if (e.t > N(a[1], 4) && distP(w, e) < N(a[2], 380)) {
      e.ai = 1; e.t = 0; e.ax = w.player.x; e.ay = w.player.y; e.n = e.x; e.t2 = e.y;
      spawnZone(w, e.ax, e.ay, e.r + 34, 0.1, e.dmg * 1.3, 'earth', 1, null, { delay: 0.9, once: true, style: 'tele', color: TELE });
    }
  } else {
    const k = Math.min(1, e.t / 0.9);
    e.x = e.n + (e.ax - e.n) * k; e.y = e.t2 + (e.ay - e.t2) * k;
    e.invuln = k < 1;
    if (k >= 1) { e.ai = 0; e.t = 0; e.invuln = false; w.fx.shake(3); w.fx.burst(e.x, e.y, e.def.col, 10, 220, 4); }
  }
};

/** intercept(lead): run at where the player is heading. */
MOVES.intercept = (w, e, dt, sp, a) => {
  const p = w.player, lead = Math.min(N(a[1], 0.8), distP(w, e) / 300);
  go(e, Math.atan2(p.y + p.vy * lead - e.y, p.x + p.vx * lead - e.x), sp, dt);
};

MOVES.sentry = (w, e, dt) => { e.vx = e.vy = 0; e.dir = turn(e.dir, toPlayer(w, e), 3 * dt); };

/** drift(wobble): slow float with noise. */
MOVES.drift = (w, e, dt, sp, a) => {
  e.t += dt;
  go(e, toPlayer(w, e) + Math.sin(e.t * 0.9 + e.id * 1.7) * N(a[1], 0.7), sp, dt, 3);
};

// ----------------------------------------------------------------------------- attacks
function ready(w: World, e: Enemy, dt: number, interval: number, range: number): boolean {
  e.atkT -= dt;
  if (e.atkT > 0 || e.hidden || e.age < 1.2) return false;
  if (distP(w, e) > range) { e.atkT = 0.3; return false; }
  e.atkT = interval * (0.85 + w.rng.next() * 0.3);
  return true;
}

/** shoot(interval, speed, range) */
ATTACKS.shoot = (w, e, dt, a) => {
  if (ready(w, e, dt, N(a[1], 2.5), N(a[3], 420))) { spawnBullet(w, e.x, e.y, toPlayer(w, e), N(a[2], 200), e.dmg, 6, e.def.col2); w.fx.sfx('eshot', e.x, e.y); }
};
/** spread(interval, n, arc, speed, range) */
ATTACKS.spread = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 3), N(a[5], 380))) return;
  const n = N(a[2], 3), arc = N(a[3], 0.6), ang = toPlayer(w, e);
  for (let i = 0; i < n; i++) spawnBullet(w, e.x, e.y, ang + (i / (n - 1) - 0.5) * arc, N(a[4], 190), e.dmg, 6, e.def.col2);
  w.fx.sfx('eshot', e.x, e.y);
};
/** radial(interval, n, speed, range) */
ATTACKS.radial = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 3.5), N(a[4], 400))) return;
  const n = N(a[2], 8), off = w.rng.angle();
  for (let i = 0; i < n; i++) spawnBullet(w, e.x, e.y, off + (i / n) * TAU, N(a[3], 150), e.dmg, 6, e.def.col2, 4);
  w.fx.ring(e.x, e.y, e.r + 16, e.def.col2, 0.25);
  w.fx.sfx('eshot', e.x, e.y);
};
/** mortar(interval, n, radius, range): telegraphed blasts at the player's position. */
ATTACKS.mortar = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 4), N(a[4], 520))) return;
  const n = N(a[2], 1), r = N(a[3], 60), p = w.player;
  for (let i = 0; i < n; i++) {
    const ja = w.rng.angle(), jd = i === 0 ? 0 : 70 + w.rng.next() * 70;
    spawnZone(w, p.x + Math.cos(ja) * jd, p.y + Math.sin(ja) * jd, r, 0.1, e.dmg * 1.2, 'fire', 1, null, { delay: 1 + i * 0.12, once: true, style: 'tele', color: TELE });
  }
  w.fx.sfx('mortar', e.x, e.y);
};
/** beam(interval, length, windup): telegraphed lance. */
ATTACKS.beam = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 5), N(a[2], 500) * 0.9)) return;
  spawnBeam(w, e.x, e.y, toPlayer(w, e), N(a[2], 500), 16, 0.45, e.dmg * 1.3, 'light', 1, null, { delay: N(a[3], 0.9), owner: e, color: e.def.col2, tick: 0.15 });
  w.fx.sfx('charge', e.x, e.y);
};
/** sweepbeam(interval, length): slow rotating beam. */
ATTACKS.sweepbeam = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 7), N(a[2], 380))) return;
  spawnBeam(w, e.x, e.y, toPlayer(w, e) + 1.2 * (e.id % 2 ? 1 : -1), N(a[2], 380), 14, 2.4, e.dmg, 'arcane', 1, null, { delay: 0.9, owner: e, color: e.def.col2, tick: 0.15, rot: 1.0 * (e.id % 2 ? -1 : 1) });
};
/** mines(interval, n, radius): lingering hazards seeded around the player. */
ATTACKS.mines = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 6), 600)) return;
  const p = w.player;
  for (let i = 0; i < N(a[2], 3); i++) {
    const ang = w.rng.angle(), d = 60 + w.rng.next() * 160;
    spawnZone(w, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, N(a[3], 40), 3, e.dmg * 0.8, 'void', 1, null, { delay: 1.2, tick: 0.5, style: 'tele', color: e.def.col2 });
  }
};
/** summon(interval, enemyId, n, cap) */
ATTACKS.summon = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 6), 700)) return;
  if (w.enemies.length > 420) return;
  const def = w.content.enemies.get(String(a[2]));
  if (!def) return;
  for (let i = 0; i < N(a[3], 3); i++) {
    const ang = w.rng.angle();
    const c = spawnEnemy(w, def, e.x + Math.cos(ang) * (e.r + 14), e.y + Math.sin(ang) * (e.r + 14));
    c.noXp = e.noXp;
  }
  w.fx.ring(e.x, e.y, e.r + 24, e.def.col2, 0.3);
};
/** buff(interval, radius): hastes allies. */
ATTACKS.buff = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 4), 900)) return;
  for (const o of w.grid.query(e.x, e.y, N(a[2], 200))) if (o !== e) o.hasteT = 3;
  w.fx.ring(e.x, e.y, N(a[2], 200), 0xffb040, 0.4);
};
/** heal(interval, radius, pct) */
ATTACKS.heal = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 4), 900)) return;
  for (const o of w.grid.query(e.x, e.y, N(a[2], 180))) if (o !== e && !o.boss && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * N(a[3], 0.25)); w.fx.line(e.x, e.y, o.x, o.y, 0x6dff9c, 1.5, 0.2); }
  w.fx.ring(e.x, e.y, N(a[2], 180), 0x6dff9c, 0.4);
};
/** shield(interval, radius, pct): grants allies damage-absorbing barriers. */
ATTACKS.shield = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 5), 900)) return;
  for (const o of w.grid.query(e.x, e.y, N(a[2], 180))) if (o !== e && !o.boss && o.shield <= 0) o.shield = o.maxHp * N(a[3], 0.5);
  w.fx.ring(e.x, e.y, N(a[2], 180), 0x66ccff, 0.4);
};
/** ward(radius): nearby allies take 80% less damage while this enemy lives. */
ATTACKS.ward = (w, e, dt, a) => {
  e.atkT -= dt;
  if (e.atkT > 0) return;
  e.atkT = 0.3;
  let n = 0;
  for (const o of w.grid.query(e.x, e.y, N(a[1], 220))) { if (o === e || o.boss || o.def === e.def) continue; o.wardT = 0.5; if (++n >= 4) break; }
};
/** trail(interval, radius, duration): leaves hazards behind itself. */
ATTACKS.trail = (w, e, dt, a) => {
  e.atkT -= dt;
  if (e.atkT > 0 || e.hidden) return;
  e.atkT = N(a[1], 0.5);
  spawnZone(w, e.x, e.y, N(a[2], 22), N(a[3], 2.5), e.dmg * 0.35, 'fire', 1, null, { delay: 0.6, tick: 0.5, style: 'tele', color: e.def.col2 });
};
/** kamikaze(triggerRadius, blastRadius): stops, primes, detonates. */
ATTACKS.kamikaze = (w, e, dt, a) => {
  if (e.n === 0) {
    if (distP(w, e) < N(a[1], 90) && !e.hidden) {
      e.n = 1; e.atkT = 0.75; e.slow = 1; e.slowT = 1.5;
      spawnZone(w, e.x, e.y, N(a[2], 85), 0.1, e.dmg * 1.6, 'fire', 1, null, { delay: 0.75, once: true, style: 'tele', color: TELE, track: e });
      w.fx.sfx('beep', e.x, e.y);
    }
  } else if ((e.atkT -= dt) <= 0) {
    w.fx.burst(e.x, e.y, 0xffa040, 16, 260, 4);
    w.fx.sfx('boom', e.x, e.y);
    killEnemy(w, e);
  }
};
/** pull(interval, radius, force, duration): drags the player toward itself. */
ATTACKS.pull = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 6), N(a[2], 260))) return;
  spawnZone(w, e.x, e.y, N(a[2], 260), N(a[4], 2), 0, 'void', 1, null, { delay: 0.6, pull: N(a[3], 110), track: e, style: 'pull', color: e.def.col2 });
  w.fx.sfx('well', e.x, e.y);
};
/** field(radius): a slowing field that follows the enemy. */
ATTACKS.field = (w, e, dt, a) => {
  e.atkT -= dt;
  if (e.atkT > 0 || e.hidden) return;
  e.atkT = 1;
  spawnZone(w, e.x, e.y, N(a[1], 110), 1.1, 0, 'frost', 1, null, { slow: 0.4, track: e, tick: 0.2, style: 'field', color: e.def.col2 });
};
/** slam(interval, radius, range): telegraphed blast centred on itself. */
ATTACKS.slam = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 4), N(a[3], 150))) return;
  e.stunT = Math.max(e.stunT, 0.9);
  spawnZone(w, e.x, e.y, N(a[2], 110), 0.1, e.dmg * 1.5, 'earth', 1, null, { delay: 0.85, once: true, style: 'tele', color: TELE });
};
/** spiral(interval, arms, speed): short rotating bullet streams. */
ATTACKS.spiral = (w, e, dt, a) => {
  e.atkT -= dt;
  if (e.hidden || e.age < 1.2) return;
  if (e.atkT <= 0) { e.atkT = N(a[1], 5); e.n = 1.4; }
  if (e.n > 0) {
    const before = e.n;
    e.n -= dt;
    if (Math.floor(before / 0.14) !== Math.floor(e.n / 0.14) && distP(w, e) < 520) {
      const arms = N(a[2], 3);
      for (let i = 0; i < arms; i++) spawnBullet(w, e.x, e.y, e.n * 3 + (i / arms) * TAU, N(a[3], 150), e.dmg, 5, e.def.col2, 4);
    }
    if (e.n <= 0) e.n = 0;
  }
};
/** homing(interval, speed): slow seeking orb. */
ATTACKS.homing = (w, e, dt, a) => {
  if (!ready(w, e, dt, N(a[1], 4), 460)) return;
  const b = spawnBullet(w, e.x, e.y, toPlayer(w, e), N(a[2], 110), e.dmg, 9, e.def.col2, 5, 'b_bubble');
  b.homing = 1.4;
};

// ----------------------------------------------------------------------------- system
const sep: Enemy[] = [];

export function updateEnemies(w: World, dt: number): void {
  const p = w.player;
  const list = w.enemies;
  const globalSlow = w.enemySlowT > 0 ? 0.45 : 1;
  const frame = w.frame;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive) continue;
    e.age += dt;
    tickStatus(w, e, dt);
    if (!e.alive) continue;
    const d = e.def;
    if (e.boss) updateBoss(w, e, dt);
    else if (!e.link) {
      const tr = d.traits;
      if (e.freezeT <= 0 && e.stunT <= 0) {
        let sp = e.spd * (1 - e.slow) * globalSlow;
        if (e.hasteT > 0) sp *= 1.45;
        if (tr?.enrage && e.hp < e.maxHp * 0.5) sp *= 1 + tr.enrage;
        MOVES[d.move[0]](w, e, dt, sp, d.move);
        if (d.atk) ATTACKS[d.atk[0]](w, e, dt * globalSlow, d.atk);
      } else e.vx = e.vy = 0;
      if (tr) {
        if (tr.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * tr.regen * dt);
        if (tr.phase) e.invuln = (e.age + e.t2) % tr.phase > tr.phase * 0.62;
        if (tr.stealth && d.move[0] !== 'ambush') e.hidden = (e.age + e.t2) % 5 > 3 && distP(w, e) > 110;
      }
      if (e.kx !== 0 || e.ky !== 0) {
        e.x += e.kx * dt; e.y += e.ky * dt;
        const k = Math.exp(-7 * dt);
        e.kx *= k; e.ky *= k;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
      }
      // cheap soft separation, alternating halves of the population each frame
      if (((e.id + frame) & 1) === 0 && !e.hidden && d.move[0] !== 'formation') {
        sep.length = 0;
        w.grid.query(e.x, e.y, e.r * 0.8, sep);
        for (let j = 0; j < sep.length && j < 4; j++) {
          const o = sep[j];
          if (o === e || o.boss) continue;
          const dx = e.x - o.x, dy = e.y - o.y, dd = Math.hypot(dx, dy) || 1;
          const push = Math.min(3, (e.r + o.r) * 0.8 - dd) * 0.5;
          if (push > 0) { e.x += (dx / dd) * push; e.y += (dy / dd) * push; }
        }
      }
      // recycle strays far outside the action
      const dxp = e.x - p.x, dyp = e.y - p.y;
      if (dxp * dxp + dyp * dyp > 1500 * 1500 && !e.elite && e.tag === '') {
        const [nx, ny] = ringPos(w, w.rng.angle());
        e.x = nx; e.y = ny; e.ai = 0; e.t = 0; e.ax = e.ay = 0;
      }
    }
    if (w.arena && !e.boss) {
      const dx = e.x - w.arena.x, dy = e.y - w.arena.y, dd = Math.hypot(dx, dy);
      if (dd > w.arena.r - e.r) { e.x = w.arena.x + (dx / dd) * (w.arena.r - e.r); e.y = w.arena.y + (dy / dd) * (w.arena.r - e.r); }
    }
    // contact damage
    if (e.touchT <= 0 && !e.hidden && !e.invuln && e.dmg > 0 && e.freezeT <= 0 && e.age > 0.5) {
      const dx = p.x - e.x, dy = p.y - e.y, rr = e.r + p.r * 0.7;
      if (dx * dx + dy * dy < rr * rr && (!e.boss || e.boss.dying <= 0)) {
        e.touchT = 0.5;
        if (hurtPlayer(w, e.dmg * (e.weakT > 0 ? 0.6 : 1), e.boss ? 'boss:contact' : 'touch:' + d.id)) {
          const tr = d.traits;
          if (tr?.drain) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2);
          if (tr?.chill) p.slowT = 1.5;
        }
      }
    }
  }
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i].alive) list[n++] = list[i];
  list.length = n;
}

export function updateBullets(w: World, dt: number): void {
  const p = w.player;
  const list = w.bullets;
  const slow = w.enemySlowT > 0 ? 0.45 : 1;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.alive) continue;
    b.life -= dt;
    if (b.homing > 0) {
      const sp = Math.hypot(b.vx, b.vy);
      const a = turn(Math.atan2(b.vy, b.vx), Math.atan2(p.y - b.y, p.x - b.x), b.homing * dt);
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    }
    if (b.accel) { const k = 1 + b.accel * dt; b.vx *= k; b.vy *= k; }
    b.x += b.vx * dt * slow; b.y += b.vy * dt * slow;
    const dx = p.x - b.x, dy = p.y - b.y, rr = b.r + p.r * 0.6;
    if (dx * dx + dy * dy < rr * rr) {
      if (hurtPlayer(w, b.dmg, w.boss ? 'boss:bullet' : 'bullet') || p.dashT <= 0) b.alive = false;
    }
    if (b.life <= 0) b.alive = false;
    if (w.arena && (b.x - w.arena.x) ** 2 + (b.y - w.arena.y) ** 2 > (w.arena.r + 40) ** 2) b.alive = false;
  }
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i].alive) list[n++] = list[i];
    else w.bulletPool.push(list[i]);
  }
  list.length = n;
}
