import { TAU, at, every } from '../../core/math';
import { fanShot, moveTo, pAng, ringShot, summon, tele } from '../../sim/boss';
import { spawnBeam, spawnBullet, spawnZone } from '../../sim/entities';
import type { BossAttack, BossDef, Enemy } from '../../sim/types';
import type { World } from '../../sim/world';

const C = 0x9b5cff, C2 = 0xff5ac8;

/** A ring of orbs that closes on a point, with gaps to slip through. */
export function collapseRing(w: World, x: number, y: number, n: number, radius: number, speed: number, dmg: number, color: number, off: number): void {
  for (let i = 0; i < n; i++) {
    if (i % Math.ceil(n / 2) < 2) continue;
    const a = off + (i / n) * TAU;
    spawnBullet(w, x + Math.cos(a) * radius, y + Math.sin(a) * radius, a + Math.PI, speed, dmg, 8, color, radius / speed);
  }
}
function blinkSlash(w: World, e: Enemy): void {
  const a = w.rng.angle();
  w.fx.burst(e.x, e.y, C, 12, 200, 4);
  e.x = w.player.x + Math.cos(a) * 150; e.y = w.player.y + Math.sin(a) * 150;
  w.fx.ring(e.x, e.y, 70, C2, 0.3);
  w.fx.sfx('blink');
  tele(w, e.x, e.y, 125, 0.7, e.dmg * 1.4, 'void', { onEnd: (w2, z) => { w2.fx.slash(z.x, z.y, 125, 0, Math.PI, C, 0.25, 0); w2.fx.sfx('slash'); } });
}

const slashes: BossAttack = {
  name: 'blink_slash', dur: 4,
  run(w, e, c, dt) {
    const n = c.phase >= 2 ? 5 : 3, gap = c.phase >= 2 ? 0.75 : 1.1;
    for (let k = 0; k < n; k++) if (at(c.at, dt, 0.1 + k * gap)) blinkSlash(w, e);
  },
};
const collapse: BossAttack = {
  name: 'collapse_ring', dur: 4,
  run(w, e, c, dt) {
    const p = w.player;
    if (at(c.at, dt, 0.2)) { collapseRing(w, p.x, p.y, 20, 380, 105, e.dmg, C, w.rng.angle()); w.fx.ring(p.x, p.y, 380, C, 0.5); w.fx.sfx('well'); }
    if (c.phase >= 1 && at(c.at, dt, 2.0)) collapseRing(w, p.x, p.y, 20, 380, 105, e.dmg, C2, w.rng.angle());
  },
};
const orbs: BossAttack = {
  name: 'orb_fan', dur: 3,
  run(w, e, c, dt) {
    if (every(c.at, dt, 0.5)) fanShot(w, e.x, e.y, pAng(w, e), 5 + c.phase, 0.7, 230, e.dmg, C2);
    if (at(c.at, dt, 0.2)) for (const s of [-1, 1]) { const b = spawnBullet(w, e.x, e.y, pAng(w, e) + s, 120, e.dmg, 11, C, 5, 'b_bubble'); b.homing = 1.3; }
  },
};
const gravity: BossAttack = {
  name: 'gravity_well', dur: 4.2,
  run(w, e, c, dt) {
    if (at(c.at, dt, 0.1)) { spawnZone(w, e.x, e.y, 460, 3.2, 0, 'void', 1, null, { pull: 125, track: e, style: 'pull', color: C, delay: 0.4 }); w.fx.sfx('well'); }
    if (c.at > 0.8 && every(c.at, dt, 0.8)) ringShot(w, e.x, e.y, 14, 150, e.dmg, c.at, C2);
  },
};
const crown: BossAttack = { name: 'hollow_court', dur: 2.5, run(w, e, c, dt) { if (at(c.at, dt, 0.2)) { summon(w, 'void_leech', 3, e.x, e.y, 100); summon(w, 'null_mote', 3, e.x, e.y, 130); } } };
const riftLines: BossAttack = {
  name: 'rift_lines', dur: 4.6,
  run(w, e, c, dt) {
    if (!at(c.at, dt, 0.2) && !at(c.at, dt, 2.3)) return;
    const a = w.rng.angle(), p = w.player;
    for (let i = -2; i <= 2; i++) {
      const off = (i + 0.5) * 150;
      const ox = p.x + Math.cos(a + 1.57) * off, oy = p.y + Math.sin(a + 1.57) * off;
      spawnBeam(w, ox - Math.cos(a) * 700, oy - Math.sin(a) * 700, a, 1400, 26, 0.5, e.dmg * 1.4, 'void', 1, null, { delay: 1.1, color: C2, tick: 0.15 });
    }
    w.fx.sfx('charge');
  },
};

/** Teleporting void king: blink slashes, closing orb rings, gravity and parallel rifts. */
export const hollowMonarch: BossDef = {
  id: 'hollow_monarch', name: 'Hollow Monarch', title: 'Sovereign of Nothing', desc: 'A crowned absence that blinks, pulls and collapses space.',
  biome: 3, el: 'void', hp: 2000, r: 48, dmg: 18, spd: 60, col: C, col2: C2, phases: [0.66, 0.33],
  attacks: [[slashes, collapse, orbs], [gravity, slashes, crown, collapse, orbs], [riftLines, slashes, collapse, gravity, orbs]],
  update(w, e, _c, dt) { moveTo(e, w.player.x, w.player.y, 60, dt); },
};
