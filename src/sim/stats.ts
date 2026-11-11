import { applyOps } from '../core/ops';
import type { Player, Stats } from './types';
import type { World } from './world';

export const BASE_SPEED = 215;
export const BASE_MAGNET = 95;
export const BASE_DASH_CD = 2.4;

export function baseStats(): Stats {
  return {
    might: 1, cooldown: 1, area: 1, duration: 1, projSpeed: 1, amount: 0, maxHp: 100, regen: 0.25, armor: 0,
    moveSpeed: 1, magnet: 1, growth: 1, luck: 1, crit: 0.05, critDmg: 2, dashCd: 1, dashCharges: 1, pierce: 0,
    reaction: 1, statusPower: 1, knockback: 1, revives: 0, greed: 1, thorns: 0, lifesteal: 0, evasion: 0,
    eliteDmg: 1, dmgTaken: 1,
  };
}

/** Rebuild the player's stat block from class, mode, meta, passives, relics and boosts. */
export function recomputeStats(w: World): void {
  const p: Player = w.player;
  const s = baseStats();
  const c = w.content;
  applyOps(s, p.cls.mods);
  if (w.mode.mods) applyOps(s, w.mode.mods);
  for (const m of c.meta) {
    const rank = w.metaRanks[m.id] ?? 0;
    for (let i = 0; i < rank; i++) applyOps(s, m.mods);
  }
  for (const [id, rank] of p.passives) {
    const d = c.passives.get(id)!;
    for (let i = 0; i < rank; i++) applyOps(s, d.mods);
  }
  for (const id of p.relics) {
    const d = c.relics.get(id)!;
    if (d.mods) applyOps(s, d.mods);
  }
  applyOps(s, p.boosts);
  s.cooldown = Math.max(0.25, s.cooldown);
  s.dashCd = Math.max(0.3, s.dashCd);
  s.dashCharges = Math.floor(s.dashCharges + 0.001);
  s.amount = Math.floor(s.amount + 0.001);
  s.evasion = Math.min(0.6, s.evasion);
  s.crit = Math.min(1, s.crit);
  s.dmgTaken = Math.max(0.2, s.dmgTaken);
  const ratio = p.stats ? p.hp / p.stats.maxHp : 1;
  const grew = p.stats ? s.maxHp - p.stats.maxHp : 0;
  p.stats = s;
  if (grew > 0) p.hp += grew;
  p.hp = Math.min(s.maxHp, Math.max(1, grew !== 0 ? p.hp : ratio * s.maxHp));
  p.hooks = [];
  if (p.cls.hooks) p.hooks.push(p.cls.hooks);
  for (const id of p.relics) {
    const d = c.relics.get(id)!;
    if (d.hooks) p.hooks.push(d.hooks);
  }
}
