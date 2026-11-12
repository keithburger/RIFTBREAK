import { content } from '../src/content/registry';
import { spawnEnemy } from '../src/sim/entities';
import type { Enemy, InputState, WeaponDef } from '../src/sim/types';
import { makeWeapon, maxRank, resolveParams } from '../src/sim/weapons';
import { STEP, World, type WorldOpts } from '../src/sim/world';

export const C = content();
export const IDLE: InputState = { mx: 0, my: 0, dash: false };

export function mkWorld(o: Partial<WorldOpts> = {}): World {
  const w = new World({ content: C, seed: 1234, classId: 'vanguard', ...o });
  w.spawningOff = true;
  w.encounterT = 1e9;
  return w;
}

/** Step for `seconds`; `input` may be a function of the world for scripted movement. */
export function run(w: World, seconds: number, input: InputState | ((w: World) => InputState) = IDLE): void {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && w.state === 'play'; i++) w.step(typeof input === 'function' ? input(w) : input);
}

/** Circle-strafe and dash every ~2s: exercises movement- and dash-driven weapons. */
export function orbiting(w: World): InputState {
  return { mx: Math.cos(w.time * 1.3), my: Math.sin(w.time * 1.3), dash: w.frame % 120 === 60 };
}

export function dummy(w: World, x: number, y: number, hp = 1e7, id = 'sporeling'): Enemy {
  const e = spawnEnemy(w, C.enemies.get(id)!, x, y);
  e.hp = e.maxHp = hp;
  e.dmg = 0;
  return e;
}

export function ringOfDummies(w: World, n: number, r: number, hp = 1e7): Enemy[] {
  const out: Enemy[] = [];
  for (let i = 0; i < n; i++) out.push(dummy(w, w.player.x + Math.cos((i / n) * 6.283) * r, w.player.y + Math.sin((i / n) * 6.283) * r, hp));
  return out;
}

export function equip(w: World, def: WeaponDef, evo = -1, rank = -1): void {
  const wi = makeWeapon(w, def);
  wi.rank = rank > 0 ? rank : maxRank(def);
  if (evo >= 0) wi.evo = def.evos[evo];
  resolveParams(w, wi);
  w.player.weapons = [wi];
}

/** A strong, varied build for boss/long-run tests. */
export function strongBuild(w: World): void {
  w.player.weapons = [];
  for (const id of ['ember_carbine', 'arc_coil', 'frost_shards', 'arcane_missiles', 'thunderstrike', 'radiant_chakram']) {
    const wi = makeWeapon(w, C.weapons.get(id)!);
    wi.rank = 5;
    resolveParams(w, wi);
    w.player.weapons.push(wi);
  }
}

/** Order-independent digest of the simulation state for determinism checks. */
export function digest(w: World): string {
  const p = w.player;
  let h = 0;
  for (const e of w.enemies) h = (h * 31 + Math.round(e.x * 10) + Math.round(e.y * 10) * 7 + Math.round(e.hp)) | 0;
  return [w.frame, p.x.toFixed(3), p.y.toFixed(3), p.hp.toFixed(2), p.level, w.stats.kills, w.enemies.length, w.projs.length, w.pickups.length, h].join('|');
}
