import { TAU, at, every, turn } from '../../core/math';
import { hazard, laser, pAng, ringShot } from '../../sim/boss';
import { spawnBullet, spawnEnemy, spawnZone } from '../../sim/entities';
import type { BossAttack, BossCtl, BossDef, Enemy, EnemyDef } from '../../sim/types';
import type { World } from '../../sim/world';

const C = 0x3a9bff, C2 = 0x9fe8ff;
const SEGS = 11;
/** Body segments are linked shells: hits on them damage the head. Not a native enemy. */
const SEG: EnemyDef = { id: 'leviathan_seg', name: 'Leviathan Coil', desc: '', biome: 2, tier: 9, hp: 1, spd: 0, dmg: 14, r: 30, xp: 0, cost: 0, look: ['seg', 0], col: C, col2: C2, move: ['chase'] };

function swim(e: Enemy, c: BossCtl, tx: number, ty: number, speed: number, dt: number, rate = 2.2): void {
  c.d.h = turn(c.d.h, Math.atan2(ty - e.y, tx - e.x), rate * dt);
  const sp = speed * (1 - e.slow);
  e.vx = Math.cos(c.d.h) * sp; e.vy = Math.sin(c.d.h) * sp;
  e.x += e.vx * dt; e.y += e.vy * dt;
  e.dir = c.d.h;
}
function cruise(w: World, e: Enemy, c: BossCtl, dt: number): void {
  const A = w.arena!;
  const a = c.t * 0.55;
  swim(e, c, A.x + Math.cos(a) * 400, A.y + Math.sin(a) * 400, 210 + c.phase * 30, dt);
}

const barrage: BossAttack = {
  name: 'circle_barrage', dur: 5,
  run(w, e, c, dt) {
    cruise(w, e, c, dt);
    if (!every(c.at, dt, 0.7 - c.phase * 0.1)) return;
    for (let i = 0; i < 3; i++) { const s = c.segs[w.rng.int(0, c.segs.length - 1)]; const b = spawnBullet(w, s.x, s.y, pAng(w, s), 125, e.dmg, 10, C2, 5, 'b_bubble'); b.homing = 1.0; }
    w.fx.sfx('eshot');
  },
};
const lunge: BossAttack = {
  name: 'lunge', dur: 3.4,
  run(w, e, c, dt) {
    if (at(c.at, dt, 0.1)) { c.d.h = pAng(w, e); laser(w, e, c.d.h, 950, 80, 0.9, 0.05, 0, 0, 0xff3355); w.fx.sfx('charge'); }
    if (c.at < 0.9) { e.vx = e.vy = 0; return; }
    if (c.at < 2.0) { swim(e, c, e.x + Math.cos(c.d.h) * 100, e.y + Math.sin(c.d.h) * 100, 780, dt, 0); if (c.phase >= 2 && every(c.at, dt, 0.25)) ringShot(w, e.x, e.y, 8, 140, e.dmg, c.at, C2); }
    else cruise(w, e, c, dt);
  },
};
const whirlpool: BossAttack = {
  name: 'whirlpool', dur: 5,
  run(w, e, c, dt) {
    cruise(w, e, c, dt);
    const A = w.arena!;
    if (at(c.at, dt, 0.2)) { spawnZone(w, A.x, A.y, 540, 4, 0, 'water', 1, null, { pull: 95, style: 'pull', color: C, delay: 0.4 }); hazard(w, A.x, A.y, 110, 4.2, e.dmg, 1.0, C, 'water'); w.fx.sfx('well'); }
    if (c.at > 1 && every(c.at, dt, 0.9)) ringShot(w, A.x, A.y, 16, 150, e.dmg, c.at * 0.7, C2);
  },
};
const wall: BossAttack = {
  name: 'tidal_wall', dur: 4.6,
  run(w, e, c, dt) {
    cruise(w, e, c, dt);
    if (!at(c.at, dt, 0.3) && !at(c.at, dt, 2.4)) return;
    const A = w.arena!;
    const d = (w.rng.int(0, 3) * TAU) / 4;
    const gap = w.rng.int(4, 16);
    for (let i = 0; i < 22; i++) {
      if (i >= gap && i < gap + 3) continue;
      const off = (i - 10.5) * 60;
      spawnBullet(w, A.x - Math.cos(d) * 620 + Math.cos(d + 1.57) * off, A.y - Math.sin(d) * 620 + Math.sin(d + 1.57) * off, d, 190, e.dmg, 12, C, 8, 'b_bubble');
    }
    w.fx.sfx('wave');
  },
};

const encircle: BossAttack = {
  name: 'constrict', dur: 5.5,
  run(w, e, c, dt) {
    // coil around the player: the body itself becomes a closing wall
    const a = c.t * 1.1, R = 300 - Math.min(90, c.at * 22);
    swim(e, c, w.player.x + Math.cos(a) * R, w.player.y + Math.sin(a) * R, 330, dt, 3.2);
    if (c.at > 1 && every(c.at, dt, 0.55)) for (const i of [2, 6, 10]) { const s = c.segs[i]; spawnBullet(w, s.x, s.y, pAng(w, s), 135, e.dmg, 8, C2, 4); }
  },
};

/** Segmented serpent: the whole body is a hazard; lunges, whirlpools and walls of water. */
export const tidalLeviathan: BossDef = {
  id: 'tidal_leviathan', name: 'Tidal Leviathan', title: 'Coil of the Drowned Archive', desc: 'A colossal serpent whose coils fill the arena.',
  biome: 2, el: 'water', hp: 1900, r: 42, dmg: 16, spd: 210, col: C, col2: C2, phases: [0.66, 0.33],
  attacks: [[barrage, lunge, whirlpool], [wall, lunge, barrage, whirlpool, lunge], [encircle, wall, lunge, whirlpool, barrage]],
  init(w, e, c) {
    c.d.h = Math.PI / 2;
    for (let i = 0; i < SEGS; i++) {
      const s = spawnEnemy(w, SEG, e.x, e.y - (i + 1) * 34);
      s.link = e; s.noXp = true; s.tag = 'seg'; s.dmg = e.dmg * 0.8; s.r = 30 - i * 1.2; s.hp = s.maxHp = 1e9;
      c.segs.push(s);
    }
  },
  update(_w, e, c) {
    let px = e.x, py = e.y;
    for (const s of c.segs) {
      const dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy) || 1;
      const gap = 34;
      if (d > gap) { s.x = px + (dx / d) * gap; s.y = py + (dy / d) * gap; }
      s.dir = Math.atan2(py - s.y, px - s.x);
      s.hp = s.maxHp;
      px = s.x; py = s.y;
    }
  },
};
