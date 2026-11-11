import { F_NOREACT, F_RAW, damageEnemy, healPlayer, hitCircle, killEnemy, nearestEnemy, runReaction, applyStatus } from '../sim/combat';
import { spawnPickup } from '../sim/entities';
import { ELEMENTS, type Hooks, type RelicDef } from '../sim/types';

const R = (id: string, name: string, rarity: number, desc: string, mods?: string[], hooks?: Hooks): RelicDef => ({ id, name, rarity, desc, mods, hooks });

/** Relics: run-long build modifiers earned from elites, bosses and events. rarity 1-3. */
export const RELIC_DEFS: RelicDef[] = [
  R('glass_prism', 'Glass Prism', 1, '+40% damage, -30% max HP.', ['might+0.4', 'maxHp*0.7']),
  R('echo_chamber', 'Echo Chamber', 2, 'Weapons have a 20% chance to fire again immediately.', undefined, {
    onFire(w, wi) { if (w.rng.next() < 0.2) wi.cd = Math.min(wi.cd, 0.1); },
  }),
  R('kinetic_battery', 'Kinetic Battery', 1, 'Damage builds while you keep moving (up to +40%).', undefined, {
    tick(w, dt) {
      const p = w.player, rs = p.rs;
      rs.kin = p.moving ? Math.min(1500, (rs.kin ?? 0) + p.moved) : (rs.kin ?? 0) * (1 - Math.min(1, dt * 1.5));
      p.dynMight *= 1 + (rs.kin / 1500) * 0.4;
    },
  }),
  R('stillness_core', 'Stillness Core', 1, 'Standing still for a moment grants +35% damage.', undefined, {
    tick(w, dt) {
      const p = w.player;
      p.rs.still = p.moving ? 0 : (p.rs.still ?? 0) + dt;
      if (p.rs.still > 0.6) p.dynMight *= 1.35;
    },
  }),
  R('corpse_bloom', 'Corpse Bloom', 2, 'Slain enemies have an 18% chance to explode.', undefined, {
    onKill(w, e) {
      if (w.rng.next() >= 0.18) return;
      w.fx.ring(e.x, e.y, 75, 0xff7ab8, 0.25);
      hitCircle(w, e.x, e.y, 75, e.maxHp * 0.3 + 8, 'toxin', null, F_RAW | F_NOREACT);
    },
  }),
  R('vampiric_shard', 'Vampiric Shard', 1, 'Every 25 kills restores 2 HP.', undefined, {
    onKill(w) { const rs = w.player.rs; if ((rs.vamp = (rs.vamp ?? 0) + 1) >= 25) { rs.vamp = 0; healPlayer(w, 2); } },
  }),
  R('overclock', 'Overclock', 2, '-22% cooldowns, but you take +25% damage.', ['cooldown*0.78', 'dmgTaken*1.25']),
  R('reactor_heart', 'Reactor Heart', 2, 'Reactions have a 25% chance to restore a dash charge and 1 HP.', undefined, {
    onReact(w) {
      if (w.rng.next() >= 0.25) return;
      const p = w.player;
      p.dashes = Math.min(p.stats.dashCharges, p.dashes + 1);
      healPlayer(w, 1);
    },
  }),
  R('chain_catalyst', 'Chain Catalyst', 3, 'Every reaction echoes onto a second nearby enemy.', undefined, {
    onReact(w, e, r) {
      if (w.reactBudget <= 0) return;
      const o = nearestEnemy(w, e.x, e.y, 170, null, e);
      if (!o) return;
      w.reactBudget--;
      w.fx.line(e.x, e.y, o.x, o.y, r.col, 2, 0.2);
      runReaction(w, o, r, (6 + w.player.level * 2.5) * w.player.stats.reaction, r.b);
    },
  }),
  R('phase_cloak', 'Phase Cloak', 1, 'Dashing detonates a void burst where you stood.', undefined, {
    onDash(w) {
      const p = w.player;
      w.fx.ring(p.x, p.y, 115, 0x9b5cff, 0.3);
      hitCircle(w, p.x, p.y, 115, 20 + p.level * 5, 'void', null);
    },
  }),
  R('orbital_guardian', 'Orbital Guardian', 2, 'A shield blocks one hit every 12 seconds.', undefined, {
    tick(w, dt) { const p = w.player; p.rs.guardCd = (p.rs.guardCd ?? 0) - dt; p.guard = p.rs.guardCd <= 0 ? 1 : 0; },
    onHurt(w, dmg) {
      const p = w.player;
      if ((p.rs.guardCd ?? 0) > 0) return dmg;
      p.rs.guardCd = 12;
      w.fx.ring(p.x, p.y, 60, 0x7fd8ff, 0.3);
      w.fx.sfx('block');
      return 0;
    },
  }),
  R('gilded_idol', 'Gilded Idol', 1, '+50% shards and better luck.', ['greed+0.5', 'luck+0.2']),
  R('berserker_sigil', 'Berserker Sigil', 2, 'Deal up to +80% damage as your HP falls.', undefined, {
    tick(w) { const p = w.player; p.dynMight *= 1 + (1 - p.hp / p.stats.maxHp) * 0.8; },
  }),
  R('titan_plating', 'Titan Plating', 1, '+4 armor and +40 HP, but -10% move speed.', ['armor+4', 'maxHp+40', 'moveSpeed*0.9']),
  R('lodestone', 'Lodestone', 1, 'Every 18 seconds, all experience flies to you.', undefined, {
    tick(w, dt) {
      const rs = w.player.rs;
      if ((rs.lode = (rs.lode ?? 0) + dt) < 18) return;
      rs.lode = 0;
      for (const k of w.pickups) if (k.kind === 'xp') k.pulled = true;
    },
  }),
  R('second_wind', 'Second Wind', 3, 'Revive once at half HP with a cleansing blast.', ['revives+1']),
  R('prism_lens', 'Prism Lens', 2, 'Critical hits brand unmarked enemies with a random element.', undefined, {
    onHit(w, e, _d, crit) { if (crit && e.alive && e.mark === null) { e.mark = w.rng.pick(ELEMENTS); e.markT = 6; } },
  }),
  R('frenzy_engine', 'Frenzy Engine', 2, 'Kills grant stacking attack speed (up to +40%) that decays.', undefined, {
    onKill(w) { const rs = w.player.rs; rs.frenzy = Math.min(40, (rs.frenzy ?? 0) + 1); },
    tick(w, dt) { const p = w.player; p.rs.frenzy = Math.max(0, (p.rs.frenzy ?? 0) - dt * 4); p.dynHaste *= 1 + p.rs.frenzy * 0.01; },
  }),
  R('gravity_anchor', 'Gravity Anchor', 1, 'Enemies near you are slowed by 25%.', undefined, {
    tick(w, dt) {
      const p = w.player;
      if ((p.rs.anchor = (p.rs.anchor ?? 0) - dt) > 0) return;
      p.rs.anchor = 0.3;
      for (const e of w.grid.query(p.x, p.y, 150)) applyStatus(w, e, 'slow', 0.25, 0.5);
    },
  }),
  R('twin_fates', 'Twin Fates', 3, '+1 projectile on every weapon, -12% damage.', ['amount+1', 'might*0.88']),
  R('chaos_infusion', 'Chaos Infusion', 2, 'Hits have a 12% chance to strike again with a random element.', undefined, {
    onHit(w, e, dmg) {
      const rs = w.player.rs;
      if (rs.chaos || !e.alive || w.rng.next() >= 0.12) return;
      rs.chaos = 1;
      damageEnemy(w, e, dmg * 0.3, w.rng.pick(ELEMENTS), null, F_RAW);
      rs.chaos = 0;
    },
  }),
  R('momentum_drive', 'Momentum Drive', 1, '+15% move speed; +12% damage while moving.', ['moveSpeed+0.15'], {
    tick(w) { if (w.player.moving) w.player.dynMight *= 1.12; },
  }),
  R('executioner', 'Executioner', 3, 'Non-elite enemies below 12% HP are slain outright.', undefined, {
    onHit(w, e) { if (e.alive && !e.boss && e.elite === 0 && e.hp < e.maxHp * 0.12) killEnemy(w, e); },
  }),
  R('time_dilation', 'Time Dilation', 2, 'When hit, all enemies slow to a crawl for 3s (20s cooldown).', undefined, {
    tick(w, dt) { w.player.rs.td = (w.player.rs.td ?? 0) - dt; },
    onHurt(w, dmg) {
      const rs = w.player.rs;
      if ((rs.td ?? 0) <= 0) { rs.td = 20; w.enemySlowT = 3; w.fx.flash(0x6ad8ff, 0.2); }
      return dmg;
    },
  }),
  R('scavenger', 'Scavenger', 1, 'Enemies occasionally drop extra healing.', undefined, {
    onKill(w, e) { if (w.rng.next() < 0.012) spawnPickup(w, 'heal', e.x, e.y, 15); },
  }),
  R('giant_slayer', 'Giant Slayer', 1, '+40% damage to elites and bosses.', ['eliteDmg+0.4']),
];
