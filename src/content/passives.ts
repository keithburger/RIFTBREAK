import type { PassiveDef } from '../sim/types';

const P = (id: string, name: string, desc: string, max: number, ...mods: string[]): PassiveDef => ({ id, name, desc, max, mods });

/** Passive upgrades. Each rank applies `mods` once more. Several gate weapon evolutions. */
export const PASSIVE_DEFS: PassiveDef[] = [
  P('might', 'Might Core', 'All damage increased.', 5, 'might+0.12'),
  P('haste', 'Haste Coil', 'All cooldowns shortened.', 5, 'cooldown*0.92'),
  P('reach', 'Reach Lens', 'Bigger areas and blasts.', 5, 'area+0.1'),
  P('linger', 'Linger Loop', 'Effects last longer.', 5, 'duration+0.12'),
  P('velocity', 'Velocity Rail', 'Projectiles fly faster and farther.', 5, 'projSpeed+0.12'),
  P('multicast', 'Multicast Array', 'Weapons fire additional projectiles.', 2, 'amount+1'),
  P('vitality', 'Vitality Cell', 'More maximum HP.', 5, 'maxHp+20'),
  P('mending', 'Mending Weave', 'Regenerate HP every second.', 5, 'regen+0.35'),
  P('plating', 'Reactive Plating', 'Flat damage reduction per hit.', 5, 'armor+1.5'),
  P('swiftness', 'Swiftness Fins', 'Move faster.', 5, 'moveSpeed+0.07'),
  P('magnet', 'Magnet Halo', 'Pick up experience from farther away.', 5, 'magnet+0.3'),
  P('insight', 'Insight Shard', 'Gain more experience.', 5, 'growth+0.08'),
  P('fortune', 'Fortune Charm', 'Better drops and rarer relics.', 5, 'luck+0.15'),
  P('precision', 'Precision Scope', 'Higher critical chance.', 5, 'crit+0.07'),
  P('brutality', 'Brutality Edge', 'Critical hits deal more.', 5, 'critDmg+0.25', 'crit+0.02'),
  P('blink', 'Blink Drive', 'Dash recharges faster; +1 charge at rank 3.', 3, 'dashCd*0.82', 'dashCharges+0.34'),
  P('piercing', 'Piercing Tip', 'Projectiles pierce more enemies.', 3, 'pierce+1'),
  P('catalyst', 'Catalyst Prism', 'Elemental reactions hit harder.', 5, 'reaction+0.2'),
  P('virulence', 'Virulence Gland', 'Burn, poison and curses are stronger.', 5, 'statusPower+0.2'),
  P('impact', 'Impact Driver', 'More knockback; hits harder on elites.', 5, 'knockback+0.2', 'eliteDmg+0.06'),
  P('greed', 'Shard Siphon', 'Earn more rift shards.', 5, 'greed+0.15'),
  P('thorns', 'Thorn Lattice', 'Retaliate when struck.', 5, 'thorns+1', 'armor+0.5'),
  P('leech', 'Leech Fang', 'Hits may restore 1 HP.', 5, 'lifesteal+0.012'),
  P('evasion', 'Mirage Veil', 'Chance to avoid damage entirely.', 5, 'evasion+0.05'),
];
