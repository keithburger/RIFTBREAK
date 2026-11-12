import { describe, expect, it } from 'vitest';
import { Bot, runHeadless } from '../src/sim/bot';
import { bossRushOrder, difficulty, startEncounter } from '../src/sim/director';
import { World } from '../src/sim/world';
import { makeWeapon } from '../src/sim/weapons';
import { spawnEnemy } from '../src/sim/entities';
import { C, IDLE, digest, mkWorld, run, strongBuild } from './helpers';

const live = (seed: number, classId = 'vanguard', modeId = 'standard'): World => new World({ content: C, seed, classId, modeId });

describe('determinism', () => {
  it('same seed and inputs reproduce the exact same run', () => {
    const a = live(4242), b = live(4242);
    runHeadless(a, new Bot('smart', 9), 90);
    runHeadless(b, new Bot('smart', 9), 90);
    expect(digest(a)).toBe(digest(b));
    expect(a.stats.kills).toBeGreaterThan(50);
  });
  it('different seeds diverge', () => {
    const a = live(1), b = live(2);
    runHeadless(a, new Bot('smart', 9), 60);
    runHeadless(b, new Bot('smart', 9), 60);
    expect(digest(a)).not.toBe(digest(b));
  });
  it('simulation is independent of how steps are batched per frame', () => {
    const a = live(77), b = live(77);
    const ba = new Bot('smart', 3), bb = new Bot('smart', 3);
    for (let i = 0; i < 1800; i++) { a.step(ba.input(a)); ba.resolve(a); }
    for (let f = 0; f < 300; f++) for (let k = 0; k < 6; k++) { b.step(bb.input(b)); bb.resolve(b); }
    expect(digest(a)).toBe(digest(b));
  });
});

describe('game flow', () => {
  it('standard run: four biomes, four bosses, victory', () => {
    const w = live(31);
    const orig = C.modes.get('standard')!;
    w.mode = { ...orig, biomeTime: 20 };
    C.modes.set('standard', w.mode); // encounters/bosses restore the mode from the registry
    try {
      w.god = true;
      strongBuild(w);
      const bot = new Bot('smart', 1);
      const biomes = new Set<number>(), phases = new Set<string>();
      runHeadless(w, bot, 60 * 12, (ww) => { biomes.add(ww.biomeIdx); phases.add(ww.phase); });
      expect(w.state).toBe('won');
      expect([...biomes].sort()).toEqual([0, 1, 2, 3]);
      expect(phases).toEqual(new Set(['field', 'boss', 'portal']));
      expect(w.stats.bosses.length).toBe(4);
      w.stats.bosses.forEach((id, i) => expect(C.biomes[i].bosses).toContain(id));
      expect(w.player.relics.length, 'boss chests grant relics').toBeGreaterThanOrEqual(4);
      const t = w.time;
      w.step(IDLE);
      expect(w.time, 'a finished world no longer advances').toBe(t);
    } finally { C.modes.set('standard', orig); }
  });
  it('both bosses of every biome are reachable in standard runs (seed parity)', () => {
    const seen = new Set<string>();
    for (const seed of [10, 11]) for (let b = 0; b < 4; b++) seen.add(C.biomes[b].bosses[(seed + b) % 2]);
    expect(seen.size).toBe(8);
  });
  it('boss rush: all eight bosses in order, then victory', () => {
    const w = live(5, 'stormcaller', 'bossrush');
    w.god = true;
    expect(w.pendingLevels).toBe(13);
    strongBuild(w);
    runHeadless(w, new Bot('smart', 1), 60 * 30);
    expect(w.state).toBe('won');
    expect(w.stats.bosses).toEqual(bossRushOrder(w));
    expect(w.stats.bosses.length).toBe(8);
  });
  it('endless: loops past the last biome and keeps scaling', () => {
    const w = live(6, 'vanguard', 'endless');
    const orig = C.modes.get('endless')!;
    w.mode = { ...orig, biomeTime: 8 };
    C.modes.set('endless', w.mode);
    w.god = true;
    strongBuild(w);
    let hp0 = 0;
    try {
      runHeadless(w, new Bot('smart', 1), 60 * 14, (ww) => { if (ww.cycle === 0 && ww.biomeIdx === 0) hp0 = ww.diff.hp; if (ww.cycle >= 1 && ww.phase === 'field') ww.state = 'lost'; });
    } finally { C.modes.set('endless', orig); }
    expect(w.cycle).toBeGreaterThanOrEqual(1);
    expect(w.biomeIdx).toBe(0);
    difficulty(w);
    expect(w.diff.hp).toBeGreaterThan(hp0 * 2.5);
  });
  it('an undefended player is eventually defeated', () => {
    const w = live(3);
    w.player.weapons = [];
    run(w, 240, IDLE);
    expect(w.state).toBe('lost');
    expect(w.player.hp).toBe(0);
  });
  it('mode modifiers and meta upgrades apply', () => {
    const base = live(1).player.stats;
    const glass = live(1, 'vanguard', 'glass').player.stats;
    expect(glass.maxHp).toBeCloseTo(base.maxHp * 0.4);
    expect(glass.might).toBeCloseTo(base.might + 0.8);
    const oath = live(2, 'vanguard', 'oath');
    oath.god = true;
    runHeadless(oath, new Bot('weapons', 1), 120);
    expect(oath.player.weapons.length).toBeLessThanOrEqual(2);
    const meta = new World({ content: C, seed: 1, classId: 'vanguard', metaRanks: { m_hull: 5, m_might: 2, m_revive: 1 } });
    expect(meta.player.stats.maxHp).toBe(base.maxHp + 40);
    expect(meta.player.stats.might).toBeCloseTo(base.might + 0.08);
    expect(meta.player.revives).toBe(1);
    const sprint = live(1, 'vanguard', 'sprint'), swarm = live(1, 'vanguard', 'swarm');
    sprint.step(IDLE); swarm.step(IDLE);
    expect(sprint.xpMul).toBe(2);
    expect(swarm.diff.hp).toBeCloseTo(0.7, 1);
  });
  it('every class starts with a working weapon and distinct stats', () => {
    const sigs = new Set<string>();
    for (const k of C.classes.values()) {
      const w = live(8, k.id);
      w.god = true;
      expect(w.player.weapons[0].def.id).toBe(k.weapon);
      runHeadless(w, new Bot('smart', 1), 45);
      expect(w.stats.kills, k.id).toBeGreaterThan(5);
      sigs.add(JSON.stringify(k.mods) + k.weapon);
    }
    expect(sigs.size).toBe(C.classes.size);
  });
});

describe('resource cleanup', () => {
  it('entity counts stay bounded over a long dense run and pools are reused', () => {
    const w = live(15);
    w.god = true;
    const bot = new Bot('smart', 2);
    let peak = 0;
    runHeadless(w, bot, 60 * 9, (ww) => { const n = ww.entityCount(); if (n > peak) peak = n; });
    expect(w.stats.kills).toBeGreaterThan(2000);
    expect(peak).toBeLessThan(3500);
    expect(w.projPool.length + w.projs.length, 'projectile objects are recycled, not leaked').toBeLessThan(1500);
    expect(w.zones.length).toBeLessThanOrEqual(420);
    expect(w.bullets.length).toBeLessThanOrEqual(900);
    expect(w.minions.every((m) => w.player.weapons.includes(m.wi)), 'no orphaned minions').toBe(true);
  });
  it('minions of a fused weapon are removed with it', () => {
    const w = mkWorld();
    w.god = true;
    strongBuild(w);
    
    w.player.weapons = [makeWeapon(w, C.weapons.get('tesla_drone')!), makeWeapon(w, C.weapons.get('rime_halo')!)];
    run(w, 1, IDLE);
    expect(w.minions.length).toBe(3);
    w.player.weapons = [];
    run(w, 0.1, IDLE);
    expect(w.minions.length).toBe(0);
  });
  it('many consecutive worlds do not share state', () => {
    const d: string[] = [];
    for (let i = 0; i < 5; i++) { const w = live(99); runHeadless(w, new Bot('smart', 1), 20); d.push(digest(w)); }
    expect(new Set(d).size).toBe(1);
  });
});

describe('encounters', () => {
  for (const def of C.encounters) {
    it(`${def.id} starts, has its effect, and ends`, () => {
      const w = live(50);
      w.god = true;
      strongBuild(w);
      w.time = 240; w.biomeT = 150; w.encounterT = 1e9; w.spawningOff = true;
      w.step(IDLE);
      const before = { en: w.enemies.length, pk: w.pickups.length, relics: w.pendingRelics, zones: w.zones.length };
      startEncounter(w, def.id);
      expect(w.encounters.length).toBe(1);
      const bot = new Bot('smart', 1);
      let peakEn = 0, elites = 0, surge = 0, mult = 1, marks = 0, hazards = 0, haste = 0, xpm = 1, pk = 0, courier = false;
      for (let i = 0; i < 60 * (def.dur + 8) && w.encounters.length; i++) {
        w.step(bot.input(w));
        w.pendingLevels = 0;
        peakEn = Math.max(peakEn, w.enemies.length);
        elites = Math.max(elites, w.enemies.filter((e) => e.elite > 0).length);
        surge = Math.max(surge, w.player.surgeT); mult = Math.max(mult, w.spawnMul); xpm = Math.max(xpm, w.xpMul);
        marks = Math.max(marks, w.enemies.filter((e) => e.mark).length);
        hazards = Math.max(hazards, w.zones.filter((z) => z.team === 2).length);
        haste = Math.max(haste, w.enemies.filter((e) => e.hasteT > 0).length);
        pk = Math.max(pk, w.pickups.length);
        if (w.enemies.some((e) => e.tag === 'courier')) courier = true;
        if (def.id === 'elemental_storm' && i % 30 === 0 && w.enemies.length < 20) startDummy(w);
        if (def.id === 'cursed_altar' && i % 60 === 0 && w.enemies.length < 5) startDummy(w);
      }
      expect(w.encounters.length, 'ended').toBe(0);
      expect(w.stats.events).toBe(1);
      const effect: Record<string, boolean> = {
        elite_ambush: elites >= 2, swarm_rush: peakEn > before.en + 15, encirclement: peakEn >= before.en + 20, rift_surge: w.pendingRelics + w.player.relics.length > before.relics || peakEn > before.en,
        treasure_courier: courier, shrine_of_power: surge > 10, meteor_storm: hazards > 2, cursed_altar: w.pendingRelics + w.player.relics.length > before.relics && haste > 0,
        supply_drop: pk > before.pk + 2, champion_duel: elites >= 1, elemental_storm: marks > 0, blood_moon: mult > 2 && xpm === 2,
      };
      expect(effect[def.id], 'effect observed').toBe(true);
      if (def.id === 'blood_moon') { expect(w.spawnMul).toBe(1); w.step(IDLE); expect(w.xpMul).toBe(1); }
    });
  }
});

function startDummy(w: World): void {
  
  for (let i = 0; i < 8; i++) { const e = spawnEnemy(w, C.enemies.get('bark_guard')!, w.player.x + 300 + i * 10, w.player.y + 200); e.hp = e.maxHp = 1e6; e.dmg = 0; }
}
