import { TAU, at, every } from '../../core/math';
import { arenaPoint, fanShot, laser, moveTo, pAng, ringShot } from '../../sim/boss';
import { spawnBeam, spawnBullet } from '../../sim/entities';
import type { BossAttack, BossDef, Enemy } from '../../sim/types';
import type { World } from '../../sim/world';

const C = 0xfff3b8, C2 = 0x8fe4ff;

function blinkTo(w: World, e: Enemy, x: number, y: number): void {
  w.fx.burst(e.x, e.y, C, 14, 220, 4);
  e.x = x; e.y = y;
  w.fx.ring(x, y, 90, C2, 0.35);
  w.fx.sfx('blink');
}

const spiral: BossAttack = {
  name: 'feather_spiral', dur: 4,
  run(w, e, c, dt) {
    if (!every(c.at, dt, 0.1)) return;
    const arms = 3 + c.phase;
    for (let i = 0; i < arms; i++) spawnBullet(w, e.x, e.y, c.at * 1.9 + (i / arms) * TAU, 160, e.dmg, 6, C, 5);
  },
};
const lattice: BossAttack = {
  name: 'prism_lattice', dur: 4.5,
  run(w, e, c, dt) {
    if (!at(c.at, dt, 0.2) && !(c.phase >= 1 && at(c.at, dt, 2.3))) return;
    const n = 4 + c.phase;
    for (let i = 0; i < n; i++) {
      const [px, py] = i === 0 ? [w.player.x, w.player.y] : arenaPoint(w);
      const a = w.rng.angle();
      spawnBeam(w, px - Math.cos(a) * 700, py - Math.sin(a) * 700, a, 1400, 20, 0.5, e.dmg * 1.3, 'light', 1, null, { delay: 1.2, color: C, tick: 0.15 });
    }
    w.fx.sfx('charge');
  },
};
const lances: BossAttack = {
  name: 'ice_lances', dur: 3,
  run(w, e, c, dt) {
    for (const t of [0.2, 0.9, 1.6]) if (at(c.at, dt, t)) {
      const a = pAng(w, e);
      laser(w, e, a, 820, 18, 0.55, 0.2, e.dmg * 1.3, 0, C2);
      if (c.phase >= 1) { laser(w, e, a + 0.35, 820, 18, 0.55, 0.2, e.dmg * 1.3, 0, C2); laser(w, e, a - 0.35, 820, 18, 0.55, 0.2, e.dmg * 1.3, 0, C2); }
      w.fx.sfx('beam');
    }
  },
};
const rotor: BossAttack = {
  name: 'radiant_rotor', dur: 5.2,
  run(w, e, c, dt) {
    c.d.hold = c.at < 5.1 ? 1 : 0;
    if (at(c.at, dt, 0.1) && w.arena) blinkTo(w, e, w.arena.x, w.arena.y);
    if (at(c.at, dt, 0.3)) {
      const n = 4 + (c.phase >= 2 ? 2 : 0), dir = w.rng.next() < 0.5 ? -1 : 1, off = w.rng.angle();
      for (let i = 0; i < n; i++) laser(w, e, off + (i / n) * TAU, 760, 22, 1.0, 3.6, e.dmg * 1.3, 0.55 * dir, C);
      w.fx.sfx('ray_charge');
    }
    if (c.at > 1.3 && every(c.at, dt, 1.2)) ringShot(w, e.x, e.y, 12, 110, e.dmg, c.at, C2);
  },
};
const mirror: BossAttack = {
  name: 'mirror_step', dur: 3.2,
  run(w, e, c, dt) {
    for (const t of [0.1, 1.1, 2.1]) if (at(c.at, dt, t)) { const [x, y] = arenaPoint(w, 220); blinkTo(w, e, x, y); }
    for (const t of [0.5, 1.5, 2.5]) if (at(c.at, dt, t)) fanShot(w, e.x, e.y, pAng(w, e), 9, 1.4, 220, e.dmg, C);
  },
};

/** Hovering angel of glass: laser lattices, rotating beam arrays, spirals and blink strikes. */
export const prismSeraph: BossDef = {
  id: 'prism_seraph', name: 'Prism Seraph', title: 'Keeper of Frozen Light', desc: 'A crystalline seraph that carves the arena with light.',
  biome: 2, el: 'light', hp: 1700, r: 44, dmg: 16, spd: 90, col: C, col2: C2, phases: [0.66, 0.33],
  attacks: [[spiral, lattice, lances], [rotor, mirror, lattice, spiral, lances], [rotor, lattice, mirror, spiral, lances]],
  update(w, e, c, dt) {
    if (c.d.hold) return;
    const a = pAng(w, e) + Math.PI + Math.sin(c.t * 0.6) * 1.2;
    moveTo(e, w.player.x + Math.cos(a) * 270, w.player.y + Math.sin(a) * 270, 90, dt);
  },
  onPhase(_w, _e, c) { c.d.hold = 0; },
};
