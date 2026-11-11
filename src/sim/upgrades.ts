/** Level-up and relic choice generation + application. All normal options are permanent for the run. */
import { describeOp, previewOps } from '../core/ops';
import { recomputeStats } from './stats';
import type { OptionDef, WeaponDef, WeaponInst } from './types';
import { makeWeapon, maxRank, resolveParams } from './weapons';
import type { World } from './world';

export const WEAPON_SLOTS = 6;
export const PASSIVE_SLOTS = 6;

const BOOSTS: [string, string, string][] = [
  ['might+0.04', 'Overcharge', 'Permanently sharpen every weapon.'],
  ['cooldown*0.97', 'Quicken', 'Permanently shorten every cooldown.'],
  ['maxHp+10', 'Fortify', 'Permanently reinforce your hull.'],
  ['area+0.04', 'Expand', 'Permanently widen every effect.'],
  ['moveSpeed+0.03', 'Streamline', 'Permanently move faster.'],
];

interface Cand { o: OptionDef; wgt: number }

const weaponSlots = (w: World): number => w.mode.weaponSlots ?? WEAPON_SLOTS;

export function eligibleEvos(w: World, wi: WeaponInst): number[] {
  if (wi.evo || wi.def.fusion || wi.rank < maxRank(wi.def)) return [];
  const out: number[] = [];
  wi.def.evos.forEach((e, i) => { if (w.player.passives.has(e.needs)) out.push(i); });
  return out;
}

export function eligibleFusions(w: World): WeaponDef[] {
  const ws = w.player.weapons;
  const full = (id: string): boolean => ws.some((x) => x.def.id === id && x.rank >= maxRank(x.def));
  return w.content.fusions.filter((f) => full(f.fusion![0]) && full(f.fusion![1]));
}

function weaponOpt(w: World, d: WeaponDef, kind: 'weapon' | 'fusion'): OptionDef {
  const el2 = d.base.el2;
  return {
    kind, id: d.id, title: d.name, tag: kind === 'fusion' ? 'FUSION' : 'NEW WEAPON', desc: d.desc, icon: d.base.sprite ?? 'p_bolt', el: d.el, el2,
    lines: kind === 'fusion' ? [`Fuses ${w.content.weapons.get(d.fusion![0])!.name} + ${w.content.weapons.get(d.fusion![1])!.name}`, 'Frees one weapon slot'] : [`Damage ${d.base.dmg ?? 10}`, `Cooldown ${d.base.cd ?? 1}s`],
  };
}

export function rollOptions(w: World, n = 3): OptionDef[] {
  const p = w.player;
  const c = w.content;
  const cands: Cand[] = [];
  const wantPassive = new Set<string>();
  for (const wi of p.weapons) {
    const d = wi.def;
    const max = maxRank(d);
    if (!wi.evo && !d.fusion) for (const e of d.evos) wantPassive.add(e.needs);
    for (const i of eligibleEvos(w, wi)) {
      const e = d.evos[i];
      cands.push({ wgt: 7, o: { kind: 'evo', id: d.id, evo: i, title: e.name, tag: 'EVOLUTION', desc: e.desc, lines: [`Evolves ${d.name}`], icon: d.base.sprite ?? 'p_bolt', el: d.el } });
    }
    if (wi.rank < max)
      cands.push({ wgt: 3.2, o: { kind: 'rank', id: d.id, title: d.name, tag: `RANK ${wi.rank + 1}`, desc: '', lines: previewOps(wi.p as unknown as Record<string, unknown>, d.ups[wi.rank - 1]), icon: d.base.sprite ?? 'p_bolt', el: d.el, el2: d.base.el2, rank: wi.rank + 1, max } });
  }
  for (const f of eligibleFusions(w)) cands.push({ wgt: 8, o: weaponOpt(w, f, 'fusion') });
  if (p.weapons.length < weaponSlots(w)) {
    const owned = new Set(p.weapons.map((x) => x.def.id));
    const fresh = [...c.weapons.values()].filter((d) => !d.fusion && !owned.has(d.id));
    const fuseMates = new Set<string>();
    for (const f of c.fusions) { if (owned.has(f.fusion![0])) fuseMates.add(f.fusion![1]); if (owned.has(f.fusion![1])) fuseMates.add(f.fusion![0]); }
    const base = (p.weapons.length < 3 ? 16 : 9) / Math.max(1, fresh.length);
    for (const d of fresh) cands.push({ wgt: base * (fuseMates.has(d.id) ? 3 : 1), o: weaponOpt(w, d, 'weapon') });
  }
  const freeP = p.passives.size < PASSIVE_SLOTS;
  const newP = [...c.passives.values()].filter((d) => !p.passives.has(d.id));
  for (const d of c.passives.values()) {
    const rank = p.passives.get(d.id) ?? 0;
    if (rank >= d.max || (rank === 0 && !freeP)) continue;
    const wgt = rank === 0 ? (8 / Math.max(1, newP.length)) * (wantPassive.has(d.id) ? 4 : 1) : 2.4;
    cands.push({ wgt, o: { kind: 'passive', id: d.id, title: d.name, tag: rank === 0 ? 'NEW PASSIVE' : `RANK ${rank + 1}`, desc: d.desc, lines: d.mods.map(describeOp), icon: 'i_' + d.id, rank: rank + 1, max: d.max } });
  }
  const out: OptionDef[] = [];
  while (out.length < n && cands.length) {
    const pick = w.rng.weighted(cands, (x) => x.wgt);
    cands.splice(cands.indexOf(pick), 1);
    out.push(pick.o);
  }
  const boosts = w.rng.shuffle(BOOSTS.slice());
  while (out.length < n) {
    const b = boosts[out.length % boosts.length];
    out.push({ kind: 'boost', id: b[0], title: b[1], tag: 'BOOST', desc: b[2], lines: [describeOp(b[0])], icon: 'i_boost' });
  }
  return out;
}

export function applyOption(w: World, o: OptionDef): void {
  const p = w.player;
  const c = w.content;
  switch (o.kind) {
    case 'weapon':
      p.weapons.push(makeWeapon(w, c.weapons.get(o.id)!));
      break;
    case 'rank': {
      const wi = p.weapons.find((x) => x.def.id === o.id)!;
      wi.rank++;
      resolveParams(w, wi);
      break;
    }
    case 'evo': {
      const wi = p.weapons.find((x) => x.def.id === o.id)!;
      wi.evo = wi.def.evos[o.evo!];
      wi.st = 0;
      resolveParams(w, wi);
      w.fx.banner(wi.evo.name.toUpperCase(), 'Weapon evolved', 0xffe08a);
      w.fx.sfx('evolve');
      break;
    }
    case 'fusion': {
      const f = c.weapons.get(o.id)!;
      const carried = p.weapons.filter((x) => f.fusion!.includes(x.def.id)).reduce((s, x) => s + x.dmgDone, 0);
      p.weapons = p.weapons.filter((x) => !f.fusion!.includes(x.def.id));
      const wi = makeWeapon(w, f);
      wi.dmgDone = carried;
      p.weapons.push(wi);
      w.fx.banner(f.name.toUpperCase(), 'Weapons fused', 0xff9cf0);
      w.fx.sfx('evolve');
      break;
    }
    case 'passive':
      p.passives.set(o.id, (p.passives.get(o.id) ?? 0) + 1);
      break;
    case 'boost':
      p.boosts.push(o.id);
      break;
    case 'relic':
      p.relics.push(o.id);
      w.fx.sfx('relic');
      break;
    case 'shards':
      w.stats.shards += 15;
      break;
  }
  recomputeStats(w);
  if (o.kind === 'relic') p.revives += c.relics.get(o.id)!.mods?.some((m) => m.startsWith('revives+')) ? 1 : 0;
}

export function rollRelics(w: World, n = 3): OptionDef[] {
  const p = w.player;
  const cands = [...w.content.relics.values()].filter((r) => !p.relics.includes(r.id));
  const out: OptionDef[] = [];
  const TAG = ['', 'RELIC', 'RARE RELIC', 'MYTHIC RELIC'];
  while (out.length < n && cands.length) {
    const r = w.rng.weighted(cands, (x) => (x.rarity === 1 ? 3 : x.rarity === 2 ? 1.6 * p.stats.luck : 0.8 * p.stats.luck));
    cands.splice(cands.indexOf(r), 1);
    out.push({ kind: 'relic', id: r.id, title: r.name, tag: TAG[r.rarity], desc: r.desc, lines: (r.mods ?? []).map(describeOp), icon: 'r_' + r.id, rank: r.rarity });
  }
  while (out.length < n) out.push({ kind: 'shards', id: 'shards', title: 'Shard Cache', tag: 'REWARD', desc: 'A cache of rift shards.', lines: ['+15 Shards'], icon: 'i_shard' });
  return out;
}
