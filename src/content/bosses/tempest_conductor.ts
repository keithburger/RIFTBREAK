import { TAU, at, every } from '../../core/math';
import { fanShot, laser, moveTo, pAng, pDist, ringShot, tele } from '../../sim/boss';
import { spawnZone } from '../../sim/entities';
import type { BossAttack, BossDef } from '../../sim/types';

const C = 0xffe94a, C2 = 0xb8ffe0;

const dive: BossAttack = {
  name: 'dive', dur: 3.4,
  run(w, e, c, dt) {
    const k = c.at % 1.7;
    if (c.at > 3.39) { c.d.busy = 0; return; }
    c.d.busy = 1;
    if (k < dt * 1.01) { c.d.a = pAng(w, e); laser(w, e, c.d.a, 640, e.r * 1.6, 0.75, 0.05, 0, 0, 0xff3355); w.fx.sfx('charge'); }
    if (k > 0.75 && k < 1.15) {
      moveTo(e, e.x + Math.cos(c.d.a) * 100, e.y + Math.sin(c.d.a) * 100, 1500, dt);
      if (c.phase >= 2 && every(c.at, dt, 0.07)) tele(w, e.x, e.y, 46, 0.6, e.dmg, 'shock');
    }
  },
};
const feathers: BossAttack = { name: 'feather_fan', dur: 3, run(w, e, c, dt) { if (every(c.at, dt, 0.6)) { fanShot(w, e.x, e.y, pAng(w, e), 7 + c.phase, 1.2, 210, e.dmg, C2); w.fx.sfx('eshot'); } } };
const cells: BossAttack = {
  name: 'storm_cells', dur: 3.5,
  run(w, e, c, dt) {
    if (!every(c.at, dt, 1.0)) return;
    const p = w.player;
    tele(w, p.x, p.y, 60, 0.9, e.dmg * 1.2, 'shock');
    for (let i = 0; i < 5 + c.phase * 2; i++) { const a = w.rng.angle(), d = 90 + w.rng.next() * 190; tele(w, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 50, 0.9 + w.rng.next() * 0.3, e.dmg, 'shock'); }
  },
};
const cross: BossAttack = {
  name: 'cross_bolt', dur: 4,
  run(w, e, c, dt) {
    c.d.busy = c.at < 3.9 ? 1 : 0;
    if (at(c.at, dt, 0.2)) { const o = w.rng.angle(); for (let i = 0; i < 4; i++) laser(w, e, o + (i * TAU) / 4, 720, 22, 1.0, 2.6, e.dmg * 1.2, 0.5, C); w.fx.sfx('beam'); }
  },
};
const gale: BossAttack = {
  name: 'gale', dur: 3.2,
  run(w, e, c, dt) {
    c.d.busy = c.at < 3.1 ? 1 : 0;
    if (at(c.at, dt, 0.1)) { spawnZone(w, e.x, e.y, 430, 2.3, 0, 'wind', 1, null, { pull: 120, track: e, style: 'pull', color: C2, delay: 0.3 }); w.fx.sfx('wind'); }
    if (at(c.at, dt, 2.6)) { ringShot(w, e.x, e.y, 24, 190, e.dmg, c.t, C); w.fx.shake(5); }
  },
};
const cage: BossAttack = {
  name: 'cage', dur: 3.6,
  run(w, e, c, dt) {
    const p = w.player;
    if (at(c.at, dt, 0.2)) { c.d.cx = p.x; c.d.cy = p.y; for (let i = 0; i < 14; i++) tele(w, p.x + Math.cos((i / 14) * TAU) * 250, p.y + Math.sin((i / 14) * TAU) * 250, 52, 1.0, e.dmg * 1.2, 'shock'); }
    if (at(c.at, dt, 1.2)) for (let i = 0; i < 9; i++) tele(w, c.d.cx + Math.cos((i / 9) * TAU) * 140, c.d.cy + Math.sin((i / 9) * TAU) * 140, 46, 1.0, e.dmg * 1.2, 'shock');
    if (at(c.at, dt, 2.2)) tele(w, c.d.cx, c.d.cy, 80, 0.9, e.dmg * 1.4, 'shock');
  },
};

/** Fast aerial duelist: telegraphed dives, lightning grids, rotating bolts and a closing cage. */
export const tempestConductor: BossDef = {
  id: 'tempest_conductor', name: 'Tempest Conductor', title: 'Voice of the Storm', desc: 'A storm-borne raptor that dives, cages and conducts lightning.',
  biome: 0, el: 'shock', hp: 1400, r: 46, dmg: 14, spd: 150, col: C, col2: C2, phases: [0.66, 0.33],
  attacks: [[dive, feathers, cells], [dive, cross, feathers, gale, cells], [dive, cage, cross, gale, feathers]],
  update(w, e, c, dt) {
    if (c.d.busy) return;
    const a = pAng(w, e) + 1.35 * (pDist(w, e) < 300 ? 1.25 : 0.7);
    moveTo(e, e.x + Math.cos(a) * 100, e.y + Math.sin(a) * 100, 150, dt);
  },
  onPhase(_w, _e, c) { c.d.busy = 0; },
};
