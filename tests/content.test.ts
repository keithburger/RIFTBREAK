import { describe, expect, it } from 'vitest';
import { contentCounts, validateContent } from '../src/content/registry';
import { ELEMENTS, pairKey } from '../src/sim/types';
import { KINDS } from '../src/sim/weapons';
import { C, equip, mkWorld, orbiting, ringOfDummies, run } from './helpers';

describe('content registry', () => {
  it('is internally consistent', () => {
    expect(validateContent(C)).toEqual([]);
  });
  it('meets every content target', () => {
    const n = contentCounts(C);
    expect(n.weapons).toBe(40);
    expect(n.evolutions).toBe(80);
    expect(n.fusions).toBe(20);
    expect(n.enemies).toBe(64);
    expect(n.bosses).toBe(8);
    expect(n.biomes).toBe(4);
    expect(n.reactions).toBe(45);
    expect(n.classes).toBeGreaterThanOrEqual(6);
    expect(n.passives).toBeGreaterThanOrEqual(24);
    expect(n.relics).toBeGreaterThanOrEqual(24);
    expect(n.encounters).toBeGreaterThanOrEqual(12);
  });
  it('has four weapons per element and every base weapon in exactly one fusion', () => {
    const base = [...C.weapons.values()].filter((w) => !w.fusion);
    for (const el of ELEMENTS) expect(base.filter((w) => w.el === el).length, el).toBe(4);
    const used = C.fusions.flatMap((f) => f.fusion!);
    expect(new Set(used).size).toBe(40);
    for (const f of C.fusions) expect(C.reactions.has(pairKey(f.el, f.base.el2!)), f.id).toBe(true);
  });
  it('gives each biome 16 enemies with a spread of behaviors', () => {
    for (let b = 0; b < 4; b++) {
      const es = [...C.enemies.values()].filter((e) => e.biome === b);
      expect(es.length).toBe(16);
      expect(new Set(es.map((e) => e.move[0])).size, 'movement variety').toBeGreaterThanOrEqual(8);
      // no two enemies in a biome share the same move + attack + trait signature
      const sig = es.map((e) => e.move[0] + '/' + (e.atk?.[0] ?? '-') + '/' + Object.keys(e.traits ?? {}).sort().join(','));
      expect(new Set(sig).size, 'unique behavior signatures').toBe(16);
    }
  });
  it('uses at least 20 distinct weapon behaviors', () => {
    const kinds = new Set([...C.weapons.values()].map((w) => w.base.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(20);
    for (const k of kinds) expect(KINDS[k], k).toBeDefined();
  });
});

/** Every weapon, evolution and fusion must actually deal damage when wielded. */
describe('weapons function in combat', () => {
  const sim = (apply: (w: ReturnType<typeof mkWorld>) => void): number => {
    const w = mkWorld();
    w.god = true;
    apply(w);
    for (const r of [70, 150, 240]) ringOfDummies(w, 10, r);
    run(w, 14, orbiting);
    expect(Number.isFinite(w.player.x + w.player.y)).toBe(true);
    return w.player.weapons[0].dmgDone;
  };
  for (const def of C.weapons.values()) {
    if (def.fusion) {
      it(`fusion ${def.id} deals damage and triggers its own reaction`, () => {
        const w = mkWorld();
        w.god = true;
        equip(w, def);
        for (const r of [70, 150, 240]) ringOfDummies(w, 10, r);
        run(w, 14, orbiting);
        expect(w.player.weapons[0].dmgDone).toBeGreaterThan(0);
        expect(w.stats.reactionIds[C.reactions.get(pairKey(def.el, def.base.el2!))!.id] ?? 0).toBeGreaterThan(0);
      });
      continue;
    }
    it(`${def.id}: base and both evolutions deal damage; evolutions change parameters`, () => {
      expect(sim((w) => equip(w, def, -1, 1)), 'rank 1').toBeGreaterThan(0);
      const w0 = mkWorld();
      equip(w0, def);
      const baseP = JSON.stringify(w0.player.weapons[0].p);
      for (const i of [0, 1]) {
        expect(sim((w) => equip(w, def, i)), def.evos[i].id).toBeGreaterThan(0);
        const w1 = mkWorld();
        equip(w1, def, i);
        expect(JSON.stringify(w1.player.weapons[0].p), def.evos[i].id + ' must differ from base').not.toBe(baseP);
        // an evolution must change mechanics, not only numbers on dmg/cd
        const mech = def.evos[i].ops.filter((o) => !/^(dmg|cd)[*+]/.test(o));
        expect(mech.length, def.evos[i].id + ' mechanical ops').toBeGreaterThan(0);
      }
    });
  }
});
