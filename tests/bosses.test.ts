import { describe, expect, it } from 'vitest';
import { BOSS_DEFS } from '../src/content/registry';
import { spawnBoss } from '../src/sim/boss';
import { Bot } from '../src/sim/bot';
import { damageEnemy, F_NOCRIT } from '../src/sim/combat';
import { forceBoss } from '../src/sim/director';
import { C, IDLE, mkWorld, run, strongBuild } from './helpers';

const hostile = (w: ReturnType<typeof mkWorld>): number =>
  w.bullets.length + w.zones.filter((z) => z.team === 1).length + w.beams.filter((b) => b.team === 1).length + w.enemies.filter((e) => e.tag === 'add').length;

describe('bosses', () => {
  it('all eight are distinct: no two share an attack set', () => {
    expect(BOSS_DEFS.length).toBe(8);
    const sets = BOSS_DEFS.map((b) => [...new Set(b.attacks.flat().map((a) => a.name))].sort().join(','));
    expect(new Set(sets).size).toBe(8);
    for (const b of BOSS_DEFS) {
      expect(b.phases.length, b.id + ' has multiple phases').toBeGreaterThanOrEqual(2);
      expect(new Set(b.attacks.flat().map((a) => a.name)).size, b.id + ' attack variety').toBeGreaterThanOrEqual(5);
      // later phases must introduce attacks the first phase lacks
      const p0 = new Set(b.attacks[0].map((a) => a.name));
      expect(b.attacks[b.attacks.length - 1].some((a) => !p0.has(a.name)), b.id + ' final phase adds mechanics').toBe(true);
    }
    const shared = new Map<string, number>();
    for (const b of BOSS_DEFS) for (const n of new Set(b.attacks.flat().map((a) => a.name))) shared.set(n, (shared.get(n) ?? 0) + 1);
    expect([...shared.values()].filter((v) => v > 1).length, 'attacks reused across bosses').toBeLessThanOrEqual(3);
  });

  for (const def of BOSS_DEFS) {
    describe(def.name, () => {
      it('every attack in every phase does something', () => {
        for (let ph = 0; ph < def.attacks.length; ph++)
          for (let ai = 0; ai < def.attacks[ph].length; ai++) {
            const w = mkWorld({ seed: 5 + ai });
            w.god = true; w.player.weapons = [];
            w.time = 600; w.step(IDLE);
            const e = spawnBoss(w, def, 0, -300);
            const c = e.boss!;
            c.trans = 0; c.phase = ph; c.atk = ai; c.at = 0;
            const atk = def.attacks[ph][ai];
            let peak = 0, moved = 0, px = e.x, py = e.y, teleports = 0;
            const steps = Math.round((atk.dur - 0.05) * 60);
            for (let i = 0; i < steps; i++) {
              // orbit so aimed attacks have a moving target
              w.step({ mx: Math.cos(i * 0.02), my: Math.sin(i * 0.02), dash: false });
              c.phase = ph; c.atk = ai;
              peak = Math.max(peak, hostile(w));
              const d = Math.hypot(e.x - px, e.y - py);
              if (d > 60) teleports++;
              moved = Math.max(moved, d * 60);
              px = e.x; py = e.y;
            }
            expect(peak > 0 || moved > 400 || teleports > 0, `${def.id} phase ${ph} attack ${atk.name}`).toBe(true);
            expect(Number.isFinite(e.x + e.y)).toBe(true);
          }
      });

      it('fights through every phase, dies with a sequence, and pays out rewards', () => {
        const w = mkWorld({ seed: 21 });
        w.god = true;
        strongBuild(w);
        w.time = 300; w.step(IDLE);
        forceBoss(w, def.id);
        const e = w.boss!;
        expect(w.phase).toBe('boss');
        expect(w.arena).not.toBeNull();
        e.hp = e.maxHp = 9000;
        const bot = new Bot('smart', 4);
        const phases = new Set<number>();
        let sawTransition = false, sawDying = false, immuneOk = true;
        for (let i = 0; i < 60 * 200 && !w.stats.bosses.includes(def.id); i++) {
          w.step(bot.input(w));
          w.pendingLevels = 0;
          if (!e.boss) break;
          phases.add(e.boss.phase);
          if (e.boss.trans > 0 && e.boss.t > 2) { sawTransition = true; const hp = e.hp; damageEnemy(w, e, 500, 'fire', null, F_NOCRIT); if (e.hp !== hp) immuneOk = false; }
          if (e.boss.dying > 0) sawDying = true;
        }
        expect([...phases].sort(), 'all phases reached').toEqual(def.phases.map((_, i) => i).concat(def.phases.length));
        expect(sawTransition && immuneOk, 'phase transition with immunity').toBe(true);
        expect(sawDying, 'death sequence').toBe(true);
        expect(w.stats.bosses).toContain(def.id);
        expect(e.alive).toBe(false);
        expect(w.boss).toBeNull();
        expect(w.pickups.some((p) => p.kind === 'chest'), 'relic chest').toBe(true);
        expect(w.pickups.filter((p) => p.kind === 'xp').length, 'xp shower').toBeGreaterThan(5);
        expect(w.enemies.filter((x) => x.alive).length, 'adds and segments cleared').toBe(0);
        run(w, 0.1, IDLE);
        expect(w.phase).toBe('portal');
        expect(w.arena).toBeNull();
        run(w, 6, IDLE);
        expect(w.pendingRelics, 'chest collected during the portal phase').toBeGreaterThan(0);
        expect(w.phase).toBe('field');
        expect(w.biomeIdx).toBe(1);
      });

      it('can hurt a player who does not dodge, and its telegraphs give warning', () => {
        const w = mkWorld({ seed: 8 });
        w.player.weapons = [];
        w.player.stats.maxHp = 1e7; w.player.hp = 1e7;
        w.time = 300; w.step(IDLE);
        const e = spawnBoss(w, def, 0, -280);
        run(w, 40, IDLE);
        expect(w.stats.dmgTaken).toBeGreaterThan(0);
        expect(e.alive).toBe(true);
        for (const z of w.zones) if (z.team === 1 && z.dmg > 0 && z.once) expect(z.delay, 'blast telegraph').toBeGreaterThanOrEqual(0.55);
        for (const b of w.beams) if (b.team === 1 && b.dmg > 0) expect(b.delay, 'beam telegraph').toBeGreaterThanOrEqual(0.5);
      });
    });
  }

  it('Arachnoid Siege Engine: eight articulated legs walk, and the death ray is telegraphed', () => {
    const def = C.bosses.get('arachnoid_siege_engine')!;
    const w = mkWorld({ seed: 2 });
    w.player.weapons = [];
    w.player.stats.maxHp = 1e7; w.player.hp = 1e7;
    w.time = 300; w.step(IDLE);
    const e = spawnBoss(w, def, 0, -520);
    const c = e.boss!;
    expect(c.legs.length).toBe(8);
    c.trans = 0;
    // walking: feet lift and replant, and never stretch past the leg's reach
    let steps = 0;
    const planted = c.legs.map((l) => [l.fx, l.fy]);
    for (let i = 0; i < 60 * 6; i++) {
      w.step(IDLE);
      c.atk = 1; // cannons: lets it keep walking
      for (const l of c.legs) { if (l.t < 1) steps++; expect(Math.hypot(l.fx - l.hx, l.fy - l.hy)).toBeLessThan(l.len * 2 + 60); }
    }
    expect(steps).toBeGreaterThan(40);
    expect(c.legs.filter((l, i) => Math.hypot(l.fx - planted[i][0], l.fy - planted[i][1]) > 30).length, 'legs that moved').toBe(8);
    // death ray
    const idx = def.attacks[0].findIndex((a) => a.name === 'death_ray');
    c.phase = 0; c.atk = idx; c.at = 0;
    w.player.iframes = 0;
    const dmg0 = w.stats.dmgTaken;
    let firstHit = -1, beamDelay = 0, tracked = false, a0 = NaN;
    for (let i = 0; i < 60 * 6; i++) {
      w.player.x = e.x + 200 + i * 0.3; w.player.y = e.y + 150; // slowly strafing target
      w.step(IDLE);
      c.atk = idx;
      const ray = w.beams.find((b) => b.owner === e && b.width > 40);
      if (ray) { beamDelay = Math.max(beamDelay, ray.delay); if (Number.isNaN(a0)) a0 = ray.ang; else if (c.at < 1.2 && Math.abs(ray.ang - a0) > 1e-4) tracked = true; }
      if (firstHit < 0 && w.stats.dmgTaken > dmg0 + 0.01) firstHit = c.at;
    }
    expect(beamDelay, 'telegraph duration').toBeGreaterThanOrEqual(1.5);
    expect(tracked, 'aim line tracks during the wind-up').toBe(true);
    expect(firstHit, 'no ray damage during the telegraph').toBeGreaterThanOrEqual(1.7);
  });

  it('Tidal Leviathan: segments follow the head and forward damage to it', () => {
    const w = mkWorld({ seed: 2 });
    w.god = true; w.player.weapons = [];
    w.time = 300; w.step(IDLE);
    const e = spawnBoss(w, C.bosses.get('tidal_leviathan')!, 0, -300);
    const c = e.boss!;
    expect(c.segs.length).toBeGreaterThanOrEqual(10);
    run(w, 5, IDLE);
    for (let i = 1; i < c.segs.length; i++) expect(Math.hypot(c.segs[i].x - c.segs[i - 1].x, c.segs[i].y - c.segs[i - 1].y)).toBeLessThan(40);
    const hp = e.hp;
    damageEnemy(w, c.segs[5], 300, 'fire', null, F_NOCRIT);
    expect(e.hp).toBeCloseTo(hp - 300);
  });

  it('Rift Sovereign shrinks the arena in its final phase', () => {
    const w = mkWorld({ seed: 2 });
    w.god = true; w.player.weapons = [];
    w.time = 300; w.step(IDLE);
    const e = spawnBoss(w, C.bosses.get('rift_sovereign')!, 0, -300);
    const r0 = w.arena!.r;
    e.hp = e.maxHp * 0.2;
    run(w, 10, IDLE);
    expect(e.boss!.phase).toBe(2);
    expect(w.arena!.r).toBeLessThan(r0 - 50);
  });
});
