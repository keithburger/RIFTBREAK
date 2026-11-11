/**
 * Tiny patch DSL used by content definitions for tuning:
 *   "dmg*1.25"  multiply     "count+1"  add     "explode=60" / "aim=facing"  assign
 * Paths may be nested ("zone.r=50"); missing intermediate objects are created.
 */
const RE = /^([\w.]+)([+*=])(.+)$/;

export interface Op {
  path: string;
  op: '+' | '*' | '=';
  value: number | string;
}

export function parseOp(s: string): Op {
  const m = RE.exec(s);
  if (!m) throw new Error(`Bad op "${s}"`);
  const n = Number(m[3]);
  return { path: m[1], op: m[2] as Op['op'], value: Number.isNaN(n) ? m[3] : n };
}

export function applyOps<T extends object>(target: T, ops: readonly string[]): T {
  for (const s of ops) {
    const { path, op, value } = parseOp(s);
    const keys = path.split('.');
    let o = target as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
      o = o[keys[i]] as Record<string, unknown>;
    }
    const k = keys[keys.length - 1];
    if (op === '=') o[k] = value;
    else {
      const cur = typeof o[k] === 'number' ? (o[k] as number) : op === '*' ? 1 : 0;
      o[k] = op === '+' ? cur + (value as number) : cur * (value as number);
    }
  }
  return target;
}

const LABEL: Record<string, string> = {
  dmg: 'Damage', cd: 'Cooldown', count: 'Amount', speed: 'Speed', range: 'Range', area: 'Area', dur: 'Duration',
  pierce: 'Pierce', kb: 'Knockback', chain: 'Chains', bounce: 'Bounces', explode: 'Blast radius', burst: 'Burst',
  tick: 'Tick interval', homing: 'Homing', split: 'Splits', spread: 'Spread',
  might: 'Damage', cooldown: 'Cooldown', duration: 'Duration', projSpeed: 'Projectile speed', amount: 'Amount',
  maxHp: 'Max HP', regen: 'HP regen/s', armor: 'Armor', moveSpeed: 'Move speed', magnet: 'Pickup range',
  growth: 'XP gain', luck: 'Luck', crit: 'Crit chance', critDmg: 'Crit damage', dashCd: 'Dash cooldown',
  dashCharges: 'Dash charges', reaction: 'Reaction damage', statusPower: 'Status potency', knockback: 'Knockback',
  revives: 'Revives', greed: 'Shard gain', thorns: 'Thorns', lifesteal: 'Lifesteal', evasion: 'Evasion',
  eliteDmg: 'Elite/Boss damage', dmgTaken: 'Damage taken',
};
const PCT = new Set(['crit', 'evasion', 'lifesteal', 'might', 'area', 'duration', 'projSpeed', 'moveSpeed', 'magnet', 'growth', 'luck', 'critDmg', 'reaction', 'statusPower', 'knockback', 'greed', 'eliteDmg']);

const fmt = (v: number): string => (Math.abs(v) >= 10 || Number.isInteger(v) ? String(Math.round(v * 10) / 10) : v.toFixed(2).replace(/0$/, ''));

/** Human readable one-line description of an op, e.g. "Damage +25%". */
export function describeOp(s: string): string {
  const { path, op, value } = parseOp(s);
  const label = LABEL[path] ?? path;
  if (typeof value !== 'number') return `${label}: ${value}`;
  if (op === '*') {
    const p = Math.round((value - 1) * 100);
    return `${label} ${p >= 0 ? '+' : ''}${p}%`;
  }
  if (op === '+') return PCT.has(path) ? `${label} ${value >= 0 ? '+' : ''}${Math.round(value * 100)}%` : `${label} ${value >= 0 ? '+' : ''}${fmt(value)}`;
  return `${label} ${fmt(value)}`;
}

/** Before → after preview for numeric top-level fields touched by ops. */
export function previewOps(before: Record<string, unknown>, ops: readonly string[]): string[] {
  const after = applyOps(structuredClone(before) as Record<string, unknown>, ops);
  const out: string[] = [];
  for (const s of ops) {
    const { path } = parseOp(s);
    if (path.includes('.')) {
      out.push(describeOp(s));
      continue;
    }
    const a = before[path];
    const b = after[path];
    const label = LABEL[path] ?? path;
    if (typeof a === 'number' && typeof b === 'number') out.push(`${label} ${fmt(a)} → ${fmt(b)}`);
    else out.push(describeOp(s));
  }
  return out;
}
