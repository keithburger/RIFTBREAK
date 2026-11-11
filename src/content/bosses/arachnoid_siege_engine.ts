import { TAU, angDiff, at, every, turn } from '../../core/math';
import { fanShot, hazard, laser, moveTo, pAng, pDist, ringShot, summon, tele } from '../../sim/boss';
import type { BossAttack, BossCtl, BossDef, Enemy } from '../../sim/types';
import type { World } from '../../sim/world';

const C = 0xb8a08a, C2 = 0xff4a3a;
const REACH = 150;

/** Rest position of leg i in world space. Legs 0-3 are the right side, 4-7 the left. */
function restPos(e: Enemy, c: BossCtl, i: number): [number, number] {
  const side = i < 4 ? 1 : -1;
  const a = c.d.rot + side * (0.5 + (i % 4) * 0.56);
  return [e.x + Math.cos(a) * REACH, e.y + Math.sin(a) * REACH];
}

/** Procedural gait: a foot steps when it drifts from its rest point; diagonal pairs alternate. */
function stepLegs(e: Enemy, c: BossCtl, dt: number): void {
  let moving = 0;
  for (const l of c.legs) if (l.t < 1) moving++;
  for (let i = 0; i < c.legs.length; i++) {
    const l = c.legs[i];
    const side = i < 4 ? 1 : -1;
    const ha = c.d.rot + side * (0.5 + (i % 4) * 0.56);
    l.hx = e.x + Math.cos(ha) * e.r * 0.7;
    l.hy = e.y + Math.sin(ha) * e.r * 0.7;
    if (l.t < 1) {
      l.t = Math.min(1, l.t + dt / l.rest);
      const k = l.t * l.t * (3 - 2 * l.t);
      l.fx = l.sx + (l.tx - l.sx) * k;
      l.fy = l.sy + (l.ty - l.sy) * k;
      continue;
    }
    const [rx, ry] = restPos(e, c, i);
    const d = Math.hypot(rx - l.fx, ry - l.fy);
    const group = (i + (i < 4 ? 0 : 1)) % 2;
    if (d > 62 && (moving < 4 || d > 130) && (group === Math.floor(c.t * 4) % 2 || d > 110)) {
      l.sx = l.fx; l.sy = l.fy;
      l.tx = rx + e.vx * 0.35; l.ty = ry + e.vy * 0.35;
      l.t = 0; l.rest = 0.2;
      moving++;
    }
  }
}

/** Slam a leg onto a point: the foot visibly travels there and lands with the blast. */
function slamLeg(w: World, e: Enemy, c: BossCtl, i: number, x: number, y: number, delay: number): void {
  const l = c.legs[i];
  const dx = x - l.hx, dy = y - l.hy, d = Math.hypot(dx, dy) || 1;
  const reach = Math.min(d, l.len * 1.9);
  l.sx = l.fx; l.sy = l.fy; l.tx = l.hx + (dx / d) * reach; l.ty = l.hy + (dy / d) * reach; l.t = 0; l.rest = delay;
  tele(w, l.tx, l.ty, 64, delay, e.dmg * 1.4, 'earth', { onEnd: (w2, z) => { w2.fx.shake(5); w2.fx.burst(z.x, z.y, C2, 10, 240, 4); w2.fx.sfx('boom', z.x, z.y); } });
}

const stomp: BossAttack = {
  name: 'stomp', dur: 3.2,
  run(w, e, c, dt) {
    if (!at(c.at, dt, 0.2) && !at(c.at, dt, 1.7)) return;
    const p = w.player;
    const order = c.legs.map((_, i) => i).sort((a, b) => Math.hypot(c.legs[a].fx - p.x, c.legs[a].fy - p.y) - Math.hypot(c.legs[b].fx - p.x, c.legs[b].fy - p.y));
    for (let k = 0; k < 2 + c.phase; k++) slamLeg(w, e, c, order[k], p.x + (w.rng.next() - 0.5) * 90 * k, p.y + (w.rng.next() - 0.5) * 90 * k, 0.75 + k * 0.12);
  },
};
const cannons: BossAttack = {
  name: 'cannons', dur: 3.5,
  run(w, e, c, dt) {
    if (!every(c.at, dt, 0.5)) return;
    const a = pAng(w, e);
    for (const s of [-1, 1]) fanShot(w, e.x + Math.cos(c.d.rot + s * 1.57) * 40, e.y + Math.sin(c.d.rot + s * 1.57) * 40, a, 3 + c.phase, 0.3, 220, e.dmg, 0xffb04a);
    w.fx.sfx('eshot');
  },
};
const mines: BossAttack = {
  name: 'mines', dur: 2.5,
  run(w, e, c, dt) {
    if (!at(c.at, dt, 0.3)) return;
    for (let i = 0; i < 5 + c.phase; i++) { const a = w.rng.angle(), d = 70 + w.rng.next() * 200; hazard(w, w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d, 46, 5, e.dmg * 0.7, 1.2, 0xff8a3a); }
  },
};
/** The signature attack: a tracking aim-line, a brief lock, then a wide sweeping beam. */
const deathRay: BossAttack = {
  name: 'death_ray', dur: 6.4,
  run(w, e, c, dt) {
    c.d.hold = c.at < 6.3 ? 1 : 0;
    if (at(c.at, dt, 0.1)) {
      const a = pAng(w, e);
      laser(w, e, a, 980, 46, 1.7, 3.2, e.dmg * 1.7, 0, C2);
      if (c.phase >= 2) laser(w, e, a + Math.PI, 980, 46, 1.7, 3.2, e.dmg * 1.7, 0, C2);
      w.fx.banner('DEATH RAY', 'Get out of the line of fire', C2);
      w.fx.sfx('ray_charge');
    }
    if (c.at < 1.3) {
      let first = true;
      for (const b of w.beams) if (b.owner === e) { const target = pAng(w, e) + (first ? 0 : Math.PI); b.ang = turn(b.ang, target, 2.2 * dt); first = false; }
      c.d.rot = turn(c.d.rot, pAng(w, e), 1.5 * dt);
    }
    if (at(c.at, dt, 1.7)) {
      let first = true;
      for (const b of w.beams) if (b.owner === e) { const s = Math.sign(angDiff(b.ang, pAng(w, e) + (first ? 0 : Math.PI))) || 1; b.rot = s * (0.4 + 0.08 * c.phase); first = false; }
      w.fx.shake(14); w.fx.flash(C2, 0.3); w.fx.sfx('ray_fire');
    }
    if (c.at > 1.7 && c.at < 4.9) { w.fx.shake(2); if (c.phase >= 2 && every(c.at, dt, 1.2)) ringShot(w, e.x, e.y, 14, 130, e.dmg, c.at, 0xffb04a); }
  },
};
const drones: BossAttack = { name: 'deploy_drones', dur: 2.2, run(w, e, c, dt) { if (at(c.at, dt, 0.2)) { summon(w, 'scrap_drone', 5, e.x, e.y, 110); summon(w, 'bomber_bot', c.phase, e.x, e.y, 130); } } };
const missiles: BossAttack = {
  name: 'missile_rain', dur: 3.4,
  run(w, e, c, dt) {
    if (c.at < 3 && every(c.at, dt, 0.32)) { const a = w.rng.angle(), d = w.rng.next() * 210; tele(w, w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d, 56, 1.0, e.dmg * 1.2); }
  },
};
const overdrive: BossAttack = {
  name: 'overdrive_stomp', dur: 3,
  run(w, e, c, dt) {
    if (at(c.at, dt, 0.2)) for (let i = 0; i < 8; i++) { const [x, y] = restPos(e, c, i); slamLeg(w, e, c, i, x + Math.cos(c.d.rot) * 30, y + Math.sin(c.d.rot) * 30, 0.9); }
    if (at(c.at, dt, 1.15)) { ringShot(w, e.x, e.y, 22, 180, e.dmg, c.t, 0xffb04a); w.fx.shake(10); }
  },
};

/** Eight-legged walker with a procedural gait, leg slams and a telegraphed death ray. */
export const arachnoidSiegeEngine: BossDef = {
  id: 'arachnoid_siege_engine', name: 'Arachnoid Siege Engine', title: 'Foundry Guardian Mk. VIII', desc: 'An eight-legged war machine. Its death ray sweeps the whole arena.',
  biome: 1, el: 'fire', hp: 1700, r: 70, dmg: 15, spd: 55, col: C, col2: C2, phases: [0.66, 0.33],
  attacks: [[stomp, cannons, deathRay, mines], [missiles, stomp, deathRay, drones, cannons], [overdrive, deathRay, missiles, cannons, stomp]],
  init(_w, e, c) {
    c.d.rot = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const [x, y] = restPos(e, c, i);
      c.legs.push({ hx: e.x, hy: e.y, fx: x, fy: y, tx: x, ty: y, sx: x, sy: y, t: 1, rest: 0.2, len: 88 });
    }
  },
  update(w, e, c, dt) {
    if (!c.d.hold) {
      c.d.rot = turn(c.d.rot, pAng(w, e), 0.9 * dt);
      if (pDist(w, e) > 230) moveTo(e, w.player.x, w.player.y, 55 + c.phase * 12, dt); else e.vx = e.vy = 0;
    } else e.vx = e.vy = 0;
    e.dir = c.d.rot;
    stepLegs(e, c, dt);
  },
  onPhase(_w, _e, c) { c.d.hold = 0; },
};
void TAU;
