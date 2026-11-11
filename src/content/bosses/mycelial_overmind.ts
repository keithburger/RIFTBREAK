import { TAU, at, every } from '../../core/math';
import { arenaPoint, fanShot, hazard, moveTo, pAng, ringShot, summon, tele } from '../../sim/boss';
import type { BossAttack, BossDef, Enemy } from '../../sim/types';
import type { World } from '../../sim/world';

const C = 0x9dff5a, C2 = 0xff7ab8;

function rootLine(w: World, e: Enemy, ang: number, n = 7): void {
  for (let i = 0; i < n; i++) tele(w, e.x + Math.cos(ang) * (90 + i * 62), e.y + Math.sin(ang) * (90 + i * 62), 34, 0.7 + i * 0.09, e.dmg, 'earth');
}

const volley: BossAttack = { name: 'spore_volley', dur: 4, run(w, e, c, dt) { if (every(c.at, dt, 0.8)) { fanShot(w, e.x, e.y, pAng(w, e), 5 + c.phase * 2, 0.9, 150, e.dmg, C); w.fx.sfx('eshot'); } } };
const roots: BossAttack = {
  name: 'root_lines', dur: 4,
  run(w, e, c, dt) {
    if (!at(c.at, dt, 0.3) && !at(c.at, dt, 2)) return;
    const a = pAng(w, e);
    rootLine(w, e, a);
    if (c.phase >= 1) { rootLine(w, e, a + 0.45); rootLine(w, e, a - 0.45); }
    w.fx.sfx('quake');
  },
};
const brood: BossAttack = { name: 'brood', dur: 3, run(w, e, c, dt) { if (at(c.at, dt, 0.2)) summon(w, 'sporeling', 4 + c.phase * 2, e.x, e.y, 90); } };
const clouds: BossAttack = {
  name: 'spore_clouds', dur: 5,
  run(w, e, c, dt) {
    if (every(c.at, dt, 1.1)) hazard(w, w.player.x, w.player.y, 70, 5, e.dmg * 0.6, 1.1, C, 'toxin');
    if (every(c.at, dt, 1.6)) ringShot(w, e.x, e.y, 14, 120, e.dmg, c.at, C2);
  },
};
const bloom: BossAttack = {
  name: 'bloom', dur: 6,
  run(w, e, c, dt) {
    if (at(c.at, dt, 0.3)) for (let i = 0; i < 2; i++) { const [x, y] = arenaPoint(w, 200); summon(w, 'bloom_pod', 1, x, y, 0); }
    if (every(c.at, dt, 1.5)) for (let i = 0; i < 6; i++) rootLine(w, e, c.at * 0.4 + (i * TAU) / 6, 8);
  },
};

/** Rooted fungal core: zone denial, telegraphed root lines and escalating broods. */
export const mycelialOvermind: BossDef = {
  id: 'mycelial_overmind', name: 'Mycelial Overmind', title: 'Heart of the Verdant Fracture', desc: 'A rooted fungal intelligence that smothers the arena in spores and roots.',
  biome: 0, el: 'toxin', hp: 1500, r: 62, dmg: 14, spd: 30, col: C, col2: C2, phases: [0.66, 0.33],
  attacks: [[volley, roots, brood], [volley, clouds, roots, brood], [bloom, clouds, volley, roots]],
  update(w, e, _c, dt) { if (w.arena) moveTo(e, w.arena.x, w.arena.y - 60, 30, dt); },
};
