import { hitCircle, healPlayer, F_NOREACT } from './combat';
import { BASE_DASH_CD, BASE_MAGNET, BASE_SPEED, baseStats } from './stats';
import type { ClassDef, InputState, Player } from './types';
import { weaponsOnDash } from './weapons';
import type { World } from './world';

export const xpForLevel = (lvl: number): number => Math.floor(5 + lvl * 5 + Math.pow(lvl, 1.8) * 0.5);

export function createPlayer(cls: ClassDef): Player {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 13, hp: 100, facing: 0, mx: 0, my: 0, moving: false, dashT: 0, dashCd: 0, dashes: 1,
    dashX: 1, dashY: 0, iframes: 1, level: 1, xp: 0, xpNext: xpForLevel(1), weapons: [], passives: new Map(), relics: [],
    boosts: [], cls, stats: baseStats(), hooks: [], rs: {}, dynMight: 1, dynHaste: 1, dynSpeed: 1, surgeT: 0, revives: 0,
    slowT: 0, hurtFlash: 0, moved: 0, kills: 0, guard: 0,
  };
}

export function gainXp(w: World, v: number): void {
  const p = w.player;
  p.xp += v * p.stats.growth;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpForLevel(p.level);
    w.pendingLevels++;
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.05);
  }
}

export function updatePlayer(w: World, input: InputState, dt: number): void {
  const p = w.player;
  const s = p.stats;
  if (p.iframes > 0) p.iframes -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  if (p.slowT > 0) p.slowT -= dt;
  if (p.surgeT > 0) p.surgeT -= dt;
  // dynamic multipliers are rebuilt each step by relic/class tick hooks
  p.dynMight = p.surgeT > 0 ? 1.3 : 1;
  p.dynHaste = 1;
  p.dynSpeed = 1;
  for (const h of p.hooks) h.tick?.(w, dt);

  let mx = input.mx, my = input.my;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  p.moving = ml > 0.05;
  if (p.moving) p.facing = Math.atan2(my, mx);
  p.mx = mx; p.my = my;

  if (p.dashes < s.dashCharges) {
    p.dashCd -= dt;
    if (p.dashCd <= 0) { p.dashes++; p.dashCd = BASE_DASH_CD * s.dashCd; }
  }
  if (input.dash && p.dashes > 0 && p.dashT <= 0) {
    if (p.dashes >= s.dashCharges) p.dashCd = BASE_DASH_CD * s.dashCd;
    p.dashes--;
    p.dashT = 0.17;
    p.dashX = Math.cos(p.facing); p.dashY = Math.sin(p.facing);
    p.iframes = Math.max(p.iframes, 0.3);
    w.fx.sfx('dash');
    w.fx.burst(p.x, p.y, p.cls.col, 8, 160, 3);
    for (const h of p.hooks) h.onDash?.(w);
    weaponsOnDash(w);
  }
  const ox = p.x, oy = p.y;
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.dashX * 900 * dt; p.y += p.dashY * 900 * dt;
  } else {
    const sp = BASE_SPEED * s.moveSpeed * p.dynSpeed * (p.slowT > 0 ? 0.6 : 1);
    p.vx = mx * sp; p.vy = my * sp;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  if (w.arena) {
    const dx = p.x - w.arena.x, dy = p.y - w.arena.y, d = Math.hypot(dx, dy);
    if (d > w.arena.r - p.r) { p.x = w.arena.x + (dx / d) * (w.arena.r - p.r); p.y = w.arena.y + (dy / d) * (w.arena.r - p.r); }
  }
  p.moved = Math.hypot(p.x - ox, p.y - oy);
  if (s.regen > 0 && p.hp < s.maxHp) p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);
}

const PULL_BASE = 420, PULL_ACCEL = 900, PULL_MAX = 1500, COLLECT_R = 20;

export function updatePickups(w: World, dt: number): void {
  const p = w.player;
  const mr = BASE_MAGNET * p.stats.magnet;
  const list = w.pickups;
  for (const k of list) {
    k.age += dt;
    const dx = p.x - k.x, dy = p.y - k.y;
    const d2 = dx * dx + dy * dy;
    if (!k.pulled && d2 < mr * mr && k.age > 0.25) k.pulled = true;
    if (k.pulled) {
      // Speed ramps with time *since the pull began* (not pickup age) and is capped, and the step is
      // clamped to the remaining distance, so a gem can never overshoot or skip the collect radius.
      const d = Math.sqrt(d2) || 1;
      k.pt += dt;
      const sp = Math.min(PULL_MAX, PULL_BASE + k.pt * PULL_ACCEL);
      const step = sp * dt;
      if (d <= COLLECT_R + step) { k.x = p.x; k.y = p.y; k.alive = false; collect(w, k.kind, k.value, k.x, k.y); }
      else { k.x += (dx / d) * step; k.y += (dy / d) * step; }
    } else {
      k.x += k.vx * dt; k.y += k.vy * dt;
      k.vx *= 1 - Math.min(1, dt * 5); k.vy *= 1 - Math.min(1, dt * 5);
      if (k.kind !== 'xp' && k.kind !== 'chest' && k.age > 40) k.alive = false;
    }
  }
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i].alive) list[n++] = list[i];
  list.length = n;
}

function collect(w: World, kind: string, value: number, x: number, y: number): void {
  const p = w.player;
  switch (kind) {
    case 'xp':
      gainXp(w, value);
      w.fx.sfx('xp');
      break;
    case 'heal':
      healPlayer(w, value + p.stats.maxHp * 0.1);
      w.fx.text(x, y - 20, '+HP', 0x7dffb0, 13);
      w.fx.sfx('heal');
      break;
    case 'magnet':
      for (const k of w.pickups) if (k.kind === 'xp' || k.kind === 'shard') k.pulled = true;
      w.fx.ring(x, y, 500, 0x7fd8ff, 0.5);
      w.fx.sfx('magnet');
      break;
    case 'bomb':
      w.fx.ring(x, y, 520, 0xffd27f, 0.5);
      w.fx.flash(0xffe0a0, 0.3);
      w.fx.shake(10);
      w.fx.sfx('bigboom');
      hitCircle(w, x, y, 520, 60 + p.level * 14, 'fire', null, F_NOREACT);
      break;
    case 'chest':
      w.pendingRelics++;
      w.fx.sfx('chest');
      break;
    case 'shard':
      w.stats.shards += value * p.stats.greed;
      w.fx.sfx('shard');
      break;
  }
}
