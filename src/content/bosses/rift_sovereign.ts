import { TAU, at, every } from '../../core/math';
import { fanShot, hazard, laser, moveTo, pAng, pDist, ringShot, summon, tele } from '../../sim/boss';
import { spawnBullet, spawnZone } from '../../sim/entities';
import type { BossAttack, BossDef } from '../../sim/types';
import { collapseRing } from './hollow_monarch';

const C = 0xff7ae0, C2 = 0xfff3b8;
const FIRE = 0xff6a2a, FROST = 0x8fe4ff, SHOCK = 0xffe94a, VOID = 0x9b5cff;

const aspectFire: BossAttack = {
  name: 'aspect_of_fire', dur: 4,
  run(w, e, c, dt) {
    if (every(c.at, dt, 0.4)) { const a = w.rng.angle(), d = w.rng.next() * 200; tele(w, w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d, 60, 1.0, e.dmg * 1.2, 'fire'); }
    if (every(c.at, dt, 1.0)) fanShot(w, e.x, e.y, pAng(w, e), 7 + c.phase, 1.0, 220, e.dmg, FIRE);
  },
};
const aspectFrost: BossAttack = {
  name: 'aspect_of_frost', dur: 4,
  run(w, e, c, dt) {
    if (at(c.at, dt, 0.2) || at(c.at, dt, 2.1)) {
      const off = w.rng.angle();
      for (let i = 0; i < 12; i++) laser(w, e, off + (i / 12) * TAU, 820, 16, 1.0, 0.35, e.dmg * 1.2, 0, FROST);
      hazard(w, w.player.x, w.player.y, 95, 3, 0, 0.6, FROST, 'frost', { slow: 0.4 });
      w.fx.sfx('beam');
    }
  },
};
const aspectShock: BossAttack = {
  name: 'aspect_of_storm', dur: 3.6,
  run(w, e, c, dt) {
    if (!every(c.at, dt, 0.42 - c.phase * 0.05)) return;
    const p = w.player;
    tele(w, p.x + p.vx * 0.35, p.y + p.vy * 0.35, 54, 0.75, e.dmg * 1.2, 'shock', { color: SHOCK });
  },
};
const aspectVoid: BossAttack = {
  name: 'aspect_of_void', dur: 4.4,
  run(w, e, c, dt) {
    if (at(c.at, dt, 0.1)) { spawnZone(w, e.x, e.y, 480, 3.4, 0, 'void', 1, null, { pull: 120, track: e, style: 'pull', color: VOID, delay: 0.4 }); w.fx.sfx('well'); }
    if (at(c.at, dt, 0.6) || at(c.at, dt, 2.2)) collapseRing(w, w.player.x, w.player.y, 18, 400, 110, e.dmg, VOID, w.rng.angle());
  },
};
const beams: BossAttack = {
  name: 'sovereign_beams', dur: 5.5,
  run(w, e, c, dt) {
    c.d.hold = c.at < 5.3 ? 1 : 0;
    if (at(c.at, dt, 0.2)) {
      const n = c.phase >= 2 ? 3 : 2, off = pAng(w, e) + Math.PI / n, dir = w.rng.next() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) laser(w, e, off + (i / n) * TAU, 900, 26, 1.1, 3.8, e.dmg * 1.5, 0.6 * dir, C);
      w.fx.sfx('ray_charge');
    }
    if (c.at > 1.3 && every(c.at, dt, 1.3)) ringShot(w, e.x, e.y, 14, 130, e.dmg, c.at, C2);
  },
};
const tide: BossAttack = { name: 'rift_tide', dur: 2.5, run(w, e, c, dt) { if (at(c.at, dt, 0.2)) { summon(w, 'null_mote', 4, e.x, e.y, 120); summon(w, 'phase_hound', 1 + (c.phase >= 2 ? 1 : 0), e.x, e.y, 140); } } };
const cataclysm: BossAttack = {
  name: 'cataclysm', dur: 6,
  run(w, e, c, dt) {
    if (every(c.at, dt, 0.11)) for (let i = 0; i < 4; i++) spawnBullet(w, e.x, e.y, c.at * 1.5 + (i / 4) * TAU, 150, e.dmg, 6, [FIRE, FROST, SHOCK, VOID][i], 5);
    if (every(c.at, dt, 0.8)) tele(w, w.player.x, w.player.y, 64, 0.9, e.dmg * 1.3, 'arcane');
  },
};

/** Final boss: cycles elemental aspects, then shrinks the arena and unleashes all of them. */
export const riftSovereign: BossDef = {
  id: 'rift_sovereign', name: 'Rift Sovereign', title: 'The Wound Between Worlds', desc: 'The rift given will. It wields every element and closes the arena around you.',
  biome: 3, el: 'arcane', hp: 2400, r: 58, dmg: 19, spd: 70, col: C, col2: C2, phases: [0.66, 0.33],
  attacks: [[aspectFire, aspectFrost, aspectShock], [aspectVoid, beams, aspectFire, tide, aspectFrost, aspectShock], [cataclysm, beams, aspectVoid, aspectShock, aspectFrost, tide]],
  update(w, e, c, dt) {
    if (c.d.hold) return;
    if (pDist(w, e) > 260) moveTo(e, w.player.x, w.player.y, 70, dt); else e.vx = e.vy = 0;
    if (c.phase >= 2 && w.arena && w.arena.r > 470) w.arena.r -= 40 * dt;
  },
  onPhase(w, _e, c) { c.d.hold = 0; if (c.phase === 2) w.fx.banner('THE RIFT CLOSES IN', 'The arena is shrinking', C); },
};
