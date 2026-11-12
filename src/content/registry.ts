/**
 * Content registry: assembles every definition into the ContentDB the simulation consumes and
 * validates cross-references. Adding content = add a def to the relevant file; nothing else.
 */
import '../sim/weaponKinds';
import { MINIONS, KINDS } from '../sim/weapons';
import { ATTACKS, MOVES } from '../sim/enemyAI';
import { HAZARDS } from '../sim/hazards';
import { parseOp } from '../core/ops';
import { ELEMENTS, pairKey, type BossDef, type ContentDB } from '../sim/types';
import { BIOME_DEFS } from './biomes';
import { arachnoidSiegeEngine } from './bosses/arachnoid_siege_engine';
import { cinderColossus } from './bosses/cinder_colossus';
import { hollowMonarch } from './bosses/hollow_monarch';
import { mycelialOvermind } from './bosses/mycelial_overmind';
import { prismSeraph } from './bosses/prism_seraph';
import { riftSovereign } from './bosses/rift_sovereign';
import { tempestConductor } from './bosses/tempest_conductor';
import { tidalLeviathan } from './bosses/tidal_leviathan';
import { CLASS_DEFS } from './classes';
import { ELEMENT_DEFS, REACTION_DEFS } from './elements';
import { ENCOUNTER_DEFS } from './encounters';
import { ENEMY_DEFS } from './enemies';
import { META_DEFS, MODE_DEFS } from './modes';
import { PASSIVE_DEFS } from './passives';
import { RELIC_DEFS } from './relics';
import { FUSION_DEFS, WEAPON_DEFS } from './weapons';

export const BOSS_DEFS: BossDef[] = [mycelialOvermind, tempestConductor, arachnoidSiegeEngine, cinderColossus, tidalLeviathan, prismSeraph, hollowMonarch, riftSovereign];

const byId = <T extends { id: string }>(list: T[], what: string): Map<string, T> => {
  const m = new Map<string, T>();
  for (const d of list) {
    if (m.has(d.id)) throw new Error(`Duplicate ${what} id: ${d.id}`);
    m.set(d.id, d);
  }
  return m;
};

export function buildContent(): ContentDB {
  return {
    elements: byId(ELEMENT_DEFS, 'element') as ContentDB['elements'],
    reactions: new Map(REACTION_DEFS.map((r) => [pairKey(r.a, r.b), r])),
    weapons: byId([...WEAPON_DEFS, ...FUSION_DEFS], 'weapon'),
    fusions: FUSION_DEFS,
    passives: byId(PASSIVE_DEFS, 'passive'),
    relics: byId(RELIC_DEFS, 'relic'),
    classes: byId(CLASS_DEFS, 'class'),
    enemies: byId(ENEMY_DEFS, 'enemy'),
    bosses: byId(BOSS_DEFS, 'boss'),
    biomes: BIOME_DEFS,
    encounters: ENCOUNTER_DEFS,
    modes: byId(MODE_DEFS, 'mode'),
    meta: META_DEFS,
  };
}

let cached: ContentDB | null = null;
export const content = (): ContentDB => (cached ??= buildContent());

/** Returns a list of problems; empty means the content set is internally consistent. */
export function validateContent(c: ContentDB = content()): string[] {
  const err: string[] = [];
  const ops = (where: string, list: readonly string[]): void => { for (const o of list) try { parseOp(o); } catch { err.push(`${where}: bad op "${o}"`); } };
  for (const a of ELEMENTS) for (const b of ELEMENTS) if (a < b && !c.reactions.has(pairKey(a, b))) err.push(`missing reaction ${a}+${b}`);
  if (c.reactions.size !== 45) err.push(`expected 45 reactions, got ${c.reactions.size}`);
  const ids = new Set<string>();
  for (const r of c.reactions.values()) { if (ids.has(r.id)) err.push(`duplicate reaction id ${r.id}`); ids.add(r.id); if (!r.fx.length) err.push(`reaction ${r.id} has no effects`); }
  const evoIds = new Set<string>();
  for (const w of c.weapons.values()) {
    if (!KINDS[w.base.kind]) err.push(`weapon ${w.id}: unknown kind ${w.base.kind}`);
    w.ups.forEach((u, i) => ops(`weapon ${w.id} rank ${i + 2}`, u));
    if (w.fusion) {
      for (const s of w.fusion) if (!c.weapons.has(s) || c.weapons.get(s)!.fusion) err.push(`fusion ${w.id}: bad source ${s}`);
      if (!w.base.el2) err.push(`fusion ${w.id}: needs el2`);
    } else {
      if (w.evos.length !== 2) err.push(`weapon ${w.id}: needs 2 evolutions`);
      if (w.ups.length !== 4) err.push(`weapon ${w.id}: needs 4 rank-ups`);
      for (const e of w.evos) {
        if (!c.passives.has(e.needs)) err.push(`evo ${e.id}: unknown passive ${e.needs}`);
        ops(`evo ${e.id}`, e.ops);
        const k = e.ops.find((o) => o.startsWith('kind='));
        if (k && !KINDS[k.slice(5)]) err.push(`evo ${e.id}: unknown kind`);
        if (evoIds.has(e.id) || c.weapons.has(e.id)) err.push(`duplicate evo id ${e.id}`);
        evoIds.add(e.id);
      }
    }
  }
  for (const p of c.passives.values()) ops(`passive ${p.id}`, p.mods);
  for (const r of c.relics.values()) { if (r.mods) ops(`relic ${r.id}`, r.mods); if (!r.mods && !r.hooks) err.push(`relic ${r.id} does nothing`); }
  for (const m of c.meta) ops(`meta ${m.id}`, m.mods);
  for (const k of c.classes.values()) { if (!c.weapons.has(k.weapon)) err.push(`class ${k.id}: unknown weapon`); ops(`class ${k.id}`, k.mods); }
  for (const e of c.enemies.values()) {
    if (!MOVES[e.move[0]]) err.push(`enemy ${e.id}: unknown move ${e.move[0]}`);
    if (e.atk && !ATTACKS[e.atk[0]]) err.push(`enemy ${e.id}: unknown attack ${e.atk[0]}`);
    if (e.atk?.[0] === 'summon' && !c.enemies.has(String(e.atk[2]))) err.push(`enemy ${e.id}: summons unknown ${e.atk[2]}`);
    if (e.traits?.splitInto && !c.enemies.has(e.traits.splitInto)) err.push(`enemy ${e.id}: splits into unknown`);
    if (e.biome < 0 || e.biome >= c.biomes.length) err.push(`enemy ${e.id}: bad biome`);
  }
  c.biomes.forEach((b, i) => {
    for (const id of b.bosses) if (!c.bosses.has(id)) err.push(`biome ${b.id}: unknown boss ${id}`);
    for (const h of b.hazards) if (!HAZARDS[h.kind]) err.push(`biome ${b.id}: unknown hazard ${h.kind}`);
    for (let t = 0; t < 4; t++) if (![...c.enemies.values()].some((e) => e.biome === i && e.tier === t)) err.push(`biome ${b.id}: no tier ${t} enemies`);
  });
  for (const b of c.bosses.values()) {
    if (b.attacks.length !== b.phases.length + 1) err.push(`boss ${b.id}: attacks/phases mismatch`);
    if (!c.biomes.some((bi) => bi.bosses.includes(b.id))) err.push(`boss ${b.id}: not assigned to a biome`);
  }
  for (const k of ['orbit', 'drone', 'mine', 'spire', 'turret', 'shade']) if (!MINIONS[k]) err.push(`missing minion behavior ${k}`);
  return err;
}

export interface Counts { weapons: number; evolutions: number; fusions: number; enemies: number; bosses: number; biomes: number; reactions: number; classes: number; passives: number; relics: number; encounters: number; modes: number }
export function contentCounts(c: ContentDB = content()): Counts {
  const base = [...c.weapons.values()].filter((w) => !w.fusion);
  return {
    weapons: base.length, evolutions: base.reduce((s, w) => s + w.evos.length, 0), fusions: c.fusions.length, enemies: c.enemies.size, bosses: c.bosses.size,
    biomes: c.biomes.length, reactions: c.reactions.size, classes: c.classes.size, passives: c.passives.size, relics: c.relics.size, encounters: c.encounters.length, modes: c.modes.size,
  };
}
