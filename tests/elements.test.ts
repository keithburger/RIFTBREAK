import { describe, expect, it } from 'vitest';
import { F_NOCRIT, damageEnemy, hitCircle } from '../src/sim/combat';
import { ELEMENTS, pairKey, type ElementId } from '../src/sim/types';
import { C, IDLE, dummy, mkWorld, ringOfDummies } from './helpers';

describe('elemental reactions', () => {
  const pairs: [ElementId, ElementId][] = [];
  for (let i = 0; i < ELEMENTS.length; i++) for (let j = i + 1; j < ELEMENTS.length; j++) pairs.push([ELEMENTS[i], ELEMENTS[j]]);

  it('defines exactly the 45 unordered pairs', () => {
    expect(pairs.length).toBe(45);
    expect(new Set([...C.reactions.values()].map((r) => r.name)).size).toBe(45);
  });

  for (const [a, b] of pairs) {
    it(`${a} + ${b} triggers ${C.reactions.get(pairKey(a, b))!.name} in either order with an observable effect`, () => {
      const def = C.reactions.get(pairKey(a, b))!;
      for (const [first, second] of [[a, b], [b, a]] as [ElementId, ElementId][]) {
        const w = mkWorld();
        w.player.weapons = [];
        w.god = true;
        const e = dummy(w, 300, 0, 1e6);
        const others = [dummy(w, 330, 0, 1e6), dummy(w, 270, 10, 1e6), dummy(w, 300, 40, 1e6)];
        w.step(IDLE);
        const hp0 = [e, ...others].map((x) => x.hp);
        damageEnemy(w, e, 100, first, null, F_NOCRIT);
        expect(e.mark).toBe(first);
        expect(w.stats.reactions).toBe(0);
        const zones0 = w.zones.length, projs0 = w.projs.length, php = (w.player.hp = 50);
        damageEnemy(w, e, 100, second, null, F_NOCRIT);
        expect(w.stats.reactionIds[def.id], `${first}->${second}`).toBe(1);
        expect(e.mark, 'mark consumed').toBeNull();
        const all = [e, ...others];
        const extraDmg = all.some((x, i) => hp0[i] - x.hp > (x === e ? 200.5 : 0.5));
        const status = all.some((x) => x.burnT > 0 || x.poisonT > 0 || x.freezeT > 0 || x.stunT > 0 || x.vulnT > 0 || x.weakT > 0 || x.slowT > 0);
        const moved = all.some((x) => x.kx !== 0 || x.ky !== 0);
        const spawned = w.zones.length > zones0 || w.projs.length > projs0;
        const spread = others.some((x) => x.mark !== null);
        const player = w.player.hp > php || w.player.surgeT > 0;
        expect(extraDmg || status || moved || spawned || spread || player, 'reaction must do something').toBe(true);
        // same element twice never reacts
        const r0 = w.stats.reactions;
        damageEnemy(w, e, 10, second, null, F_NOCRIT);
        damageEnemy(w, e, 10, second, null, F_NOCRIT);
        expect(w.stats.reactions).toBe(r0);
      }
    });
  }

  it('reaction damage never marks or chains (bounded propagation)', () => {
    const w = mkWorld();
    w.player.x = 5000; w.player.weapons = [];
    w.step(IDLE);
    const es = ringOfDummies(w, 0, 0);
    for (let i = 0; i < 40; i++) es.push(dummy(w, 5000 + (i % 8) * 12, (i >> 3) * 12, 1e6));
    w.step(IDLE);
    for (const e of es) { e.mark = 'fire'; e.markT = 6; }
    w.reactBudget = 30;
    // one shock hit on one enemy -> Plasma Burst (area). Its blast must not trigger the other 39.
    damageEnemy(w, es[0], 100, 'shock', null, F_NOCRIT);
    expect(w.stats.reactions).toBe(1);
    expect(es.slice(1).every((e) => e.mark === 'fire')).toBe(true);
  });

  it('caps reactions per step and applies a per-enemy cooldown', () => {
    const w = mkWorld();
    w.player.x = 5000; w.player.weapons = [];
    w.step(IDLE);
    const es = [];
    for (let i = 0; i < 100; i++) es.push(dummy(w, 5000 + (i % 10) * 10, Math.floor(i / 10) * 10, 1e6));
    w.step(IDLE);
    for (const e of es) { e.mark = 'frost'; e.markT = 6; }
    w.reactBudget = 30;
    hitCircle(w, 5045, 45, 400, 10, 'fire', null, F_NOCRIT);
    expect(w.stats.reactions).toBe(30);
    const e = es.find((x) => x.reactCd > 0)!;
    const before = w.stats.reactions;
    w.reactBudget = 30;
    e.mark = 'water';
    damageEnemy(w, e, 10, 'fire', null, F_NOCRIT);
    expect(w.stats.reactions, 'enemy on reaction cooldown').toBe(before);
  });
});
