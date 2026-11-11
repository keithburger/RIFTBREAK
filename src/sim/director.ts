/** Run director: difficulty curve, spawning, elites, encounters, bosses, biome and mode flow. */
import { spawnBoss } from './boss';
import { healPlayer, killEnemy } from './combat';
import { ringPos, spawnEnemy } from './entities';
import { gainXp } from './player';
import type { EnemyDef } from './types';
import type { World } from './world';

export const BIOME_TIME = 300;
export const TIER_UNLOCK = [0, 50, 125, 205];

/** Central balance curve. T is total run minutes. */
export function difficulty(w: World): void {
  const T = w.time / 60 + w.cycle * 4;
  const m = w.mode;
  w.diff.hp = (1 + 0.2 * T + 0.06 * T * T) * (m.enemyHp ?? 1);
  w.diff.dmg = 1 + 0.045 * T;
  w.diff.spd = Math.min(1.3, 1 + 0.01 * T) * (m.enemySpd ?? 1);
  w.diff.bossHp = (1 + 0.5 * T + 0.2 * T * T) * (m.enemyHp ?? 1);
  w.xpMul = m.xpMul ?? 1;
}

function pool(w: World): EnemyDef[] {
  const out: EnemyDef[] = [];
  for (const d of w.content.enemies.values()) if (d.biome === w.biomeIdx && w.biomeT >= TIER_UNLOCK[d.tier] * (biomeTime(w) / BIOME_TIME)) out.push(d);
  return out;
}

export const biomeTime = (w: World): number => w.mode.biomeTime ?? BIOME_TIME;

export function spawnGroup(w: World, d: EnemyDef, elite = 0, ang = w.rng.angle()): void {
  const n = elite ? 1 : d.group ?? 1;
  const sentry = d.move[0] === 'sentry';
  let [x, y] = ringPos(w, ang);
  if (sentry) { const r = 240 + w.rng.next() * 140; x = w.player.x + Math.cos(ang) * r; y = w.player.y + Math.sin(ang) * r; }
  const heading = Math.atan2(w.player.y - y, w.player.x - x);
  for (let i = 0; i < n; i++) {
    let ox = 0, oy = 0;
    if (n > 1) {
      if (d.move[0] === 'formation') { const row = Math.floor(i / 5), col = (i % 5) - 2; ox = Math.cos(heading + 1.57) * col * (d.r * 2.6) - Math.cos(heading) * row * d.r * 2.8; oy = Math.sin(heading + 1.57) * col * (d.r * 2.6) - Math.sin(heading) * row * d.r * 2.8; }
      else { ox = (w.rng.next() - 0.5) * 90; oy = (w.rng.next() - 0.5) * 90; }
    }
    const e = spawnEnemy(w, d, x + ox, y + oy, elite);
    if (d.move[0] === 'formation') e.ax = heading;
    if (sentry) w.fx.ring(e.x, e.y, e.r + 20, d.col, 0.5);
  }
}

function spawnField(w: World, dt: number): void {
  const bt = biomeTime(w);
  const k = w.biomeT / bt;
  const rate = (3.2 + k * 4 + (w.time / 60) * 1.0) * (w.mode.spawnMul ?? 1) * w.spawnMul;
  w.spawnAcc += rate * dt;
  const cap = Math.min(520, 80 + w.time * 0.35 + k * 80) * Math.min(1.6, (w.mode.spawnMul ?? 1) * w.spawnMul);
  if (w.spawnAcc <= 0 || w.enemies.length >= cap) { w.spawnAcc = Math.min(w.spawnAcc, 12); return; }
  const ps = pool(w);
  if (!ps.length) return;
  let guard = 12;
  while (w.spawnAcc > 0 && guard-- > 0 && w.enemies.length < cap) {
    const d = w.rng.weighted(ps, (e) => (1 + e.tier * 0.35) / Math.sqrt(e.cost));
    spawnGroup(w, d);
    w.spawnAcc -= d.cost * (d.group ?? 1);
  }
  w.eliteT -= dt;
  if (w.eliteT <= 0) {
    w.eliteT = 55 - Math.min(25, w.time / 60);
    const c = ps.filter((e) => e.tier >= 1 && e.move[0] !== 'sentry' && e.move[0] !== 'formation');
    if (c.length) { spawnGroup(w, w.rng.pick(c), 1); w.fx.sfx('elite'); }
  }
}

function encounters(w: World, dt: number): void {
  for (let i = w.encounters.length - 1; i >= 0; i--) {
    const s = w.encounters[i];
    s.t += dt;
    if (s.def.update(w, s, dt) || s.t > s.def.dur) { w.encounters.splice(i, 1); w.stats.events++; }
  }
  if (w.phase !== 'field') return;
  w.encounterT -= dt;
  if (w.encounterT > 0 || w.encounters.length > 0) return;
  w.encounterT = 42 + w.rng.next() * 16;
  const c = w.content.encounters.filter((e) => w.time >= e.minTime);
  if (!c.length) return;
  startEncounter(w, w.rng.weighted(c, (e) => e.weight).id);
}

export function startEncounter(w: World, id: string): void {
  const def = w.content.encounters.find((e) => e.id === id);
  if (!def) return;
  const s = { def, t: 0, d: {}, ents: [], x: w.player.x, y: w.player.y };
  w.encounters.push(s);
  def.start(w, s);
  w.fx.banner(def.name.toUpperCase(), def.desc, 0xffd27f);
  w.fx.sfx('event');
}

function clearField(w: World): void {
  for (const e of w.enemies) if (e.alive && !e.boss) killEnemy(w, e);
  for (const z of w.zones) if (z.team >= 1) { z.alive = false; z.onEnd = null; }
  w.zones = w.zones.filter((z) => z.alive);
  w.beams = w.beams.filter((b) => b.team === 0);
  w.encounters.length = 0;
  w.spawnMul = 1;
  w.mode = w.content.modes.get(w.mode.id)!;
}

function startBoss(w: World, id: string, hpMul = 1): void {
  clearField(w);
  w.phase = 'boss';
  const def = w.content.bosses.get(id)!;
  spawnBoss(w, def, w.player.x, w.player.y - 300, hpMul);
}

export function enterBiome(w: World, idx: number): void {
  w.biomeIdx = idx % w.content.biomes.length;
  w.biome = w.content.biomes[w.biomeIdx];
  w.biomeT = 0;
  w.phase = 'field';
  w.hazardT.length = 0;
  w.spawnAcc = 6;
  w.encounterT = 30;
  w.eliteT = 45;
  w.stats.biomes++;
  w.fx.banner(w.biome.name.toUpperCase(), w.biome.desc, w.biome.pal.accent);
  w.fx.sfx('biome');
}

export function updateDirector(w: World, dt: number): void {
  difficulty(w);
  const mode = w.mode;
  if (w.bossDown) {
    w.bossDown = null;
    w.arena = null;
    w.phase = 'portal';
    w.portalT = 4.5;
    healPlayer(w, w.player.stats.maxHp * 0.25);
    w.fx.banner('RIFT SEALED', 'The way forward opens', 0x9fffd0);
    if (mode.kind === 'bossrush') gainXp(w, w.player.xpNext * 3.2);
  }
  encounters(w, dt);
  if (w.phase === 'field') {
    w.biomeT += dt;
    if (!w.spawningOff) spawnField(w, dt);
    if (w.biomeT >= biomeTime(w) && !w.spawningOff) {
      const b = w.biome.bosses;
      startBoss(w, b[(w.seed + w.biomeIdx + w.cycle) % 2]);
    }
  } else if (w.phase === 'portal') {
    w.portalT -= dt;
    for (const k of w.pickups) k.pulled = true;
    if (w.portalT > 0) return;
    if (mode.kind === 'bossrush') {
      const order = bossRushOrder(w);
      if (w.bossIdx >= order.length) { w.state = 'won'; w.fx.sfx('victory'); return; }
      const id = order[w.bossIdx++];
      const def = w.content.bosses.get(id)!;
      w.biomeIdx = def.biome; w.biome = w.content.biomes[def.biome];
      w.time = Math.max(w.time, w.bossIdx * 150); // difficulty ramps per boss
      difficulty(w);
      startBoss(w, id, 0.55);
      return;
    }
    const last = w.biomeIdx >= w.content.biomes.length - 1;
    if (last && mode.kind !== 'endless') { w.state = 'won'; w.fx.sfx('victory'); return; }
    if (last) w.cycle++;
    enterBiome(w, w.biomeIdx + 1);
  }
}

export function bossRushOrder(w: World): string[] {
  const out: string[] = [];
  for (const b of w.content.biomes) out.push(b.bosses[0], b.bosses[1]);
  return out;
}

/** Dev/test helper: jump straight to the current biome's boss. */
export function forceBoss(w: World, id?: string): void {
  if (w.boss) return;
  startBoss(w, id ?? w.biome.bosses[(w.seed + w.biomeIdx + w.cycle) % 2]);
}
