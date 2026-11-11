import { TAU, at, every } from '../../core/math';
import { hazard, laser, moveTo, pAng, tele } from '../../sim/boss';
import { spawnBullet } from '../../sim/entities';
import type { BossAttack, BossDef, Enemy } from '../../sim/types';
import type { World } from '../../sim/world';

const C = 0xff6a2a, C2 = 0xffd24a;

function gapRing(w: World, e: Enemy, n: number, speed: number, off: number): void {
  for (let i = 0; i < n; i++) if (i % 7 > 1) spawnBullet(w, e.x, e.y, off + (i / n) * TAU, speed, e.dmg, 8, C2);
}
function meteor(w: World, e: Enemy, x: number, y: number): void {
  tele(w, x, y, 64, 1.1, e.dmg * 1.3, 'fire', { onEnd: (w2, z) => { w2.fx.burst(z.x, z.y, C, 10, 240, 4); w2.fx.sfx('boom', z.x, z.y); hazard(w2, z.x, z.y, 56, 6, e.dmg * 0.5, 0.4, C); } });
}

const slam: BossAttack = {
  name: 'slam', dur: 3,
  run(w, e, c, dt) {
    c.d.hold = c.at < 1.4 ? 1 : 0;
    if (at(c.at, dt, 0.2)) tele(w, e.x, e.y, 190, 1.0, e.dmg * 1.6, 'earth');
    if (at(c.at, dt, 1.2)) { gapRing(w, e, 28, 170, c.t); if (c.phase >= 2) gapRing(w, e, 28, 120, c.t + 0.4); w.fx.shake(12); w.fx.sfx('bigboom'); }
  },
};
const meteors: BossAttack = {
  name: 'meteor_rain', dur: 3.6,
  run(w, e, c, dt) {
    if (!every(c.at, dt, 0.36 - c.phase * 0.05)) return;
    const a = w.rng.angle(), d = w.rng.next() * 230;
    meteor(w, e, w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d);
  },
};
const breath: BossAttack = {
  name: 'fire_breath', dur: 3.2,
  run(w, e, c, dt) {
    c.d.hold = c.at < 3 ? 1 : 0;
    if (at(c.at, dt, 0.05)) { c.d.a = pAng(w, e); laser(w, e, c.d.a, 420, 120, 0.5, 0.05, 0, 0, 0xff3355); }
    if (c.at > 0.5 && c.at < 2.8 && every(c.at, dt, 0.07)) spawnBullet(w, e.x, e.y, c.d.a + Math.sin((c.at - 0.5) * 2.4) * 0.75, 250, e.dmg, 8, C, 2.2);
    if (every(c.at, dt, 0.4)) w.fx.sfx('flame');
  },
};
const eruption: BossAttack = {
  name: 'eruption', dur: 4,
  run(w, e, c, dt) {
    if (at(c.at, dt, 0.05)) c.d.rot = w.rng.angle();
    if (!every(c.at, dt, 0.28)) return;
    const k = Math.floor(c.at / 0.28);
    for (let i = 0; i < 6; i++) { const a = c.d.rot + (i * TAU) / 6 + k * 0.12; tele(w, e.x + Math.cos(a) * (100 + k * 58), e.y + Math.sin(a) * (100 + k * 58), 46, 0.8, e.dmg * 1.2); }
  },
};
const charge: BossAttack = {
  name: 'molten_charge', dur: 2.6,
  run(w, e, c, dt) {
    c.d.hold = c.at < 2.5 ? 1 : 0;
    if (at(c.at, dt, 0.1)) { c.d.a = pAng(w, e); laser(w, e, c.d.a, 520, e.r * 2, 0.8, 0.05, 0, 0, 0xff3355); w.fx.sfx('charge'); }
    if (c.at > 0.9 && c.at < 1.4) { moveTo(e, e.x + Math.cos(c.d.a) * 100, e.y + Math.sin(c.d.a) * 100, 950, dt); if (every(c.at, dt, 0.1)) hazard(w, e.x, e.y, 50, 4, e.dmg * 0.5, 0.6, C); }
    if (at(c.at, dt, 1.45)) { gapRing(w, e, 21, 160, c.t); w.fx.shake(8); }
  },
};
const cataclysm: BossAttack = {
  name: 'cataclysm', dur: 5,
  run(w, e, c, dt) {
    if (every(c.at, dt, 0.3)) { const a = w.rng.angle(), d = w.rng.next() * 300; meteor(w, e, w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d); }
    if (at(c.at, dt, 1) || at(c.at, dt, 3)) { gapRing(w, e, 28, 150, c.at); w.fx.shake(8); }
  },
};

/** Slow molten giant: gap-ring shockwaves, meteors that leave lava, spoke eruptions, a charge. */
export const cinderColossus: BossDef = {
  id: 'cinder_colossus', name: 'Cinder Colossus', title: 'The Forge That Walks', desc: 'A molten titan that floods the arena with lava and shockwaves.',
  biome: 1, el: 'fire', hp: 1800, r: 64, dmg: 16, spd: 45, col: C, col2: C2, phases: [0.66, 0.33],
  attacks: [[slam, meteors, breath], [eruption, charge, slam, meteors, breath], [cataclysm, charge, eruption, slam, breath]],
  update(w, e, c, dt) { if (!c.d.hold) moveTo(e, w.player.x, w.player.y, 45 + c.phase * 10, dt); },
  onPhase(_w, _e, c) { c.d.hold = 0; },
};
