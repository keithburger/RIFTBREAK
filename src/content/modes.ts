import type { MetaDef, ModeDef } from '../sim/types';

export const MODE_DEFS: ModeDef[] = [
  { id: 'standard', name: 'Rift Run', kind: 'standard', desc: 'Four worlds, four bosses. Seal the rift.' },
  { id: 'endless', name: 'Endless', kind: 'endless', desc: 'The worlds loop and harden. Survive as long as you can.' },
  { id: 'bossrush', name: 'Boss Rush', kind: 'bossrush', desc: 'All eight bosses back to back.', startLevel: 14 },
  { id: 'glass', name: 'Challenge: Glass Cannon', kind: 'challenge', desc: '+80% damage, 40% max HP.', mods: ['might+0.8', 'maxHp*0.4'] },
  { id: 'swarm', name: 'Challenge: Infestation', kind: 'challenge', desc: 'Twice the enemies, each weaker.', spawnMul: 2, enemyHp: 0.7 },
  { id: 'oath', name: 'Challenge: Twin Oath', kind: 'challenge', desc: 'Only two weapon slots, +60% damage.', weaponSlots: 2, mods: ['might+0.6'] },
  { id: 'sprint', name: 'Challenge: Rift Sprint', kind: 'challenge', desc: 'Half-length worlds, double experience.', biomeTime: 150, xpMul: 2 },
];

/** Persistent upgrades bought with shards. Cost of the next rank = cost * (rank + 1). */
export const META_DEFS: MetaDef[] = [
  { id: 'm_hull', name: 'Reinforced Hull', desc: '+8 max HP per rank.', max: 5, cost: 30, mods: ['maxHp+8'] },
  { id: 'm_might', name: 'Tuned Emitters', desc: '+4% damage per rank.', max: 5, cost: 40, mods: ['might+0.04'] },
  { id: 'm_haste', name: 'Rapid Cyclers', desc: '-3% cooldowns per rank.', max: 5, cost: 40, mods: ['cooldown*0.97'] },
  { id: 'm_speed', name: 'Light Frame', desc: '+3% move speed per rank.', max: 3, cost: 35, mods: ['moveSpeed+0.03'] },
  { id: 'm_magnet', name: 'Wide Collector', desc: '+15% pickup range per rank.', max: 3, cost: 25, mods: ['magnet+0.15'] },
  { id: 'm_growth', name: 'Data Uplink', desc: '+5% experience per rank.', max: 5, cost: 45, mods: ['growth+0.05'] },
  { id: 'm_greed', name: 'Shard Refinery', desc: '+10% shards per rank.', max: 5, cost: 35, mods: ['greed+0.1'] },
  { id: 'm_armor', name: 'Ablative Layer', desc: '+1 armor per rank.', max: 3, cost: 50, mods: ['armor+1'] },
  { id: 'm_luck', name: 'Lucky Circuit', desc: '+10% luck per rank.', max: 3, cost: 40, mods: ['luck+0.1'] },
  { id: 'm_revive', name: 'Emergency Reboot', desc: 'Revive once per run.', max: 1, cost: 400, mods: ['revives+1'] },
];
