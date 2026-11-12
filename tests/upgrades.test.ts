import { describe, expect, it } from 'vitest';
import { PASSIVE_SLOTS, WEAPON_SLOTS, applyOption, eligibleEvos, eligibleFusions, rollOptions, rollRelics } from '../src/sim/upgrades';
import { makeWeapon, maxRank, resolveParams } from '../src/sim/weapons';
import { Bot } from '../src/sim/bot';
import { C, mkWorld } from './helpers';

describe('upgrades', () => {
  it('always offers three distinct, valid, permanent options', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = mkWorld({ seed });
      const bot = new Bot('random', seed);
      for (let lvl = 0; lvl < 140; lvl++) {
        const opts = rollOptions(w);
        expect(opts.length).toBe(3);
        expect(new Set(opts.map((o) => o.kind + o.id + (o.evo ?? ''))).size).toBe(3);
        for (const o of opts) {
          expect(['weapon', 'rank', 'evo', 'fusion', 'passive', 'boost']).toContain(o.kind);
          expect(o.title.length).toBeGreaterThan(0);
          expect(o.lines.length + o.desc.length).toBeGreaterThan(0);
          if (o.kind === 'rank') { const wi = w.player.weapons.find((x) => x.def.id === o.id)!; expect(wi.rank).toBeLessThan(maxRank(wi.def)); }
          if (o.kind === 'weapon') expect(w.player.weapons.length).toBeLessThan(WEAPON_SLOTS);
          if (o.kind === 'passive') expect(w.player.passives.get(o.id) ?? 0).toBeLessThan(C.passives.get(o.id)!.max);
        }
        applyOption(w, bot.choose(w, opts));
        expect(w.player.weapons.length).toBeLessThanOrEqual(WEAPON_SLOTS);
        expect(w.player.passives.size).toBeLessThanOrEqual(PASSIVE_SLOTS);
        for (const wi of w.player.weapons) expect(wi.rank).toBeLessThanOrEqual(maxRank(wi.def));
        for (const [id, r] of w.player.passives) expect(r).toBeLessThanOrEqual(C.passives.get(id)!.max);
      }
      // a fully built character still gets three lasting boosts
      expect(rollOptions(w).every((o) => o.kind === 'boost' || o.kind === 'evo' || o.kind === 'fusion' || o.kind === 'rank' || o.kind === 'passive' || o.kind === 'weapon')).toBe(true);
    }
  });

  it('ranking a weapon up improves it and shows a before → after preview', () => {
    const w = mkWorld();
    const wi = w.player.weapons[0];
    const dmg0 = wi.p.dmg;
    const opt = { kind: 'rank' as const, id: wi.def.id, title: '', tag: '', desc: '', lines: [], icon: '' };
    applyOption(w, opt);
    expect(wi.rank).toBe(2);
    expect(wi.p.dmg).toBeGreaterThan(dmg0);
    const w2 = mkWorld();
    const offer = rollOptions(w2, 60).find((o) => o.kind === 'rank')!;
    expect(offer.lines.join(' ')).toMatch(/→/);
  });

  it('evolution needs max rank AND the linked passive', () => {
    const w = mkWorld();
    const wi = w.player.weapons[0];
    const [evoA, evoB] = wi.def.evos;
    expect(eligibleEvos(w, wi)).toEqual([]);
    wi.rank = maxRank(wi.def); resolveParams(w, wi);
    expect(eligibleEvos(w, wi), 'max rank alone is not enough').toEqual([]);
    w.player.passives.set(evoA.needs, 1);
    expect(eligibleEvos(w, wi)).toEqual([0]);
    w.player.passives.set(evoB.needs, 1);
    expect(eligibleEvos(w, wi)).toEqual([0, 1]);
    wi.rank = maxRank(wi.def) - 1;
    expect(eligibleEvos(w, wi), 'passive alone is not enough').toEqual([]);
    wi.rank = maxRank(wi.def);
    const offer = rollOptions(w, 80).find((o) => o.kind === 'evo' && o.evo === 1)!;
    expect(offer).toBeDefined();
    applyOption(w, offer);
    expect(wi.evo).toBe(evoB);
    expect(eligibleEvos(w, wi), 'cannot evolve twice').toEqual([]);
    expect(rollOptions(w, 80).some((o) => o.kind === 'rank' && o.id === wi.def.id)).toBe(false);
  });

  it('fusion needs both weapons at max rank, consumes them and frees a slot', () => {
    for (const f of C.fusions) {
      const w = mkWorld();
      w.player.weapons = f.fusion!.map((id) => makeWeapon(w, C.weapons.get(id)!));
      expect(eligibleFusions(w), f.id).toEqual([]);
      w.player.weapons[0].rank = 5;
      expect(eligibleFusions(w), f.id + ' one maxed').toEqual([]);
      w.player.weapons[1].rank = 5;
      expect(eligibleFusions(w).map((x) => x.id)).toEqual([f.id]);
      const offer = rollOptions(w, 80).find((o) => o.kind === 'fusion')!;
      expect(offer.id).toBe(f.id);
      applyOption(w, offer);
      expect(w.player.weapons.map((x) => x.def.id)).toEqual([f.id]);
      expect(w.player.weapons[0].p.el2).toBeDefined();
    }
  });

  it('passives and relic stat mods change the stat block', () => {
    const w = mkWorld();
    const m0 = w.player.stats.might, hp0 = w.player.stats.maxHp;
    applyOption(w, { kind: 'passive', id: 'might', title: '', tag: '', desc: '', lines: [], icon: '' });
    applyOption(w, { kind: 'passive', id: 'vitality', title: '', tag: '', desc: '', lines: [], icon: '' });
    expect(w.player.stats.might).toBeCloseTo(m0 + 0.12);
    expect(w.player.stats.maxHp).toBe(hp0 + 20);
    expect(w.player.hp, 'max HP gain also heals').toBe(hp0 + 20);
    applyOption(w, { kind: 'relic', id: 'second_wind', title: '', tag: '', desc: '', lines: [], icon: '' });
    expect(w.player.revives).toBe(1);
    expect(w.player.hooks.length).toBeGreaterThan(0);
  });

  it('relic choices are unowned and run out gracefully', () => {
    const w = mkWorld();
    const seen = new Set<string>();
    for (let i = 0; i < C.relics.size + 3; i++) {
      const opts = rollRelics(w);
      expect(opts.length).toBe(3);
      for (const o of opts) if (o.kind === 'relic') expect(w.player.relics).not.toContain(o.id);
      applyOption(w, opts[0]);
      if (opts[0].kind === 'relic') seen.add(opts[0].id);
    }
    expect(seen.size).toBe(C.relics.size);
    expect(rollRelics(w).every((o) => o.kind === 'shards')).toBe(true);
  });

  it('every relic and class hook runs in live combat without error', () => {
    for (const cls of C.classes.keys()) {
      const w = mkWorld({ classId: cls, seed: 9 });
      w.spawningOff = false;
      w.god = true;
      for (const r of C.relics.keys()) applyOption(w, { kind: 'relic', id: r, title: '', tag: '', desc: '', lines: [], icon: '' });
      const bot = new Bot('smart', 2);
      w.god = false; w.player.stats.maxHp = 1e6; w.player.hp = 1e6;
      for (let i = 0; i < 60 * 40 && w.state === 'play'; i++) { const inp = bot.input(w); inp.dash = i % 90 === 0; w.step(inp); bot.resolve(w); }
      expect(w.stats.kills, cls).toBeGreaterThan(20);
      expect(Number.isFinite(w.player.hp + w.player.x + w.stats.dmgDealt)).toBe(true);
    }
  });
});
