import { describe, expect, it } from 'vitest';
import { damageEnemy, killEnemy, nearestEnemy, F_NOCRIT } from '../src/sim/combat';
import { TIER_UNLOCK, spawnGroup } from '../src/sim/director';
import { spawnEnemy } from '../src/sim/entities';
import { C, IDLE, mkWorld, orbiting, run } from './helpers';

const SUPPORT = new Set(['shield_generator', 'repair_drone', 'overclocker', 'entropy_weaver']);

function tank(seed = 3) {
  const w = mkWorld({ seed });
  w.player.weapons = [];
  w.player.stats.maxHp = 1e7; w.player.hp = 1e7; w.player.stats.regen = 0;
  return w;
}

describe('every enemy archetype is a functioning threat', () => {
  for (const def of C.enemies.values()) {
    it(`${def.id} (${def.move[0]}${def.atk ? ' + ' + def.atk[0] : ''})`, () => {
      if (SUPPORT.has(def.id)) {
        const w = tank();
        const s = spawnEnemy(w, def, 120, 0);
        const allies = [0, 1, 2].map((i) => { const a = spawnEnemy(w, C.enemies.get('scrap_drone')!, 150 + i * 20, 30); a.hp = a.maxHp * 0.4; return a; });
        const hp0 = allies[0].hp;
        let effect = false;
        for (let i = 0; i < 60 * 12; i++) { w.step(IDLE); for (const a of allies) { a.x = s.x + 30; a.y = s.y + 20; if (a.shield > 0 || a.hasteT > 0 || a.wardT > 0 || a.hp > hp0 + 0.01) effect = true; } }
        expect(effect, 'support effect on allies').toBe(true);
        return;
      }
      let hurt = false;
      for (const input of [IDLE, orbiting]) {
        const w = tank();
        for (let i = 0; i < 3; i++) spawnGroup(w, def);
        run(w, 45, input === IDLE ? IDLE : (ww) => ({ ...orbiting(ww), dash: false }));
        for (const e of w.enemies) expect(Number.isFinite(e.x + e.y + e.hp), 'finite state').toBe(true);
        if (w.stats.dmgTaken > 0) { hurt = true; break; }
      }
      expect(hurt, 'can damage the player').toBe(true);
    });
  }
});

describe('enemy behaviors', () => {
  it('charge: telegraphs, then rushes much faster than it walks', () => {
    const w = tank();
    const e = spawnEnemy(w, C.enemies.get('thornback')!, 250, 0);
    let telegraphed = false, maxSpeed = 0, sawWindup = false;
    for (let i = 0; i < 60 * 8; i++) {
      w.step(IDLE);
      if (e.ai === 1) { sawWindup = true; if (w.beams.some((b) => b.team === 1 && b.delay > 0.3)) telegraphed = true; expect(Math.hypot(e.vx, e.vy)).toBe(0); }
      if (e.ai === 2) maxSpeed = Math.max(maxSpeed, Math.hypot(e.vx, e.vy));
    }
    expect(sawWindup && telegraphed).toBe(true);
    expect(maxSpeed).toBeGreaterThan(e.spd * 3);
  });
  it('ambush and burrow enemies are hidden and untargetable until they strike', () => {
    for (const id of ['mantis_stalker', 'root_crawler', 'tome_mimic', 'void_maw']) {
      const w = tank();
      const e = spawnEnemy(w, C.enemies.get(id)!, 420, 0);
      w.step(IDLE);
      expect(e.hidden, id).toBe(true);
      expect(nearestEnemy(w, 0, 0, 2000), id).toBeNull();
      run(w, 30, IDLE);
      expect(w.stats.dmgTaken, id + ' eventually strikes').toBeGreaterThan(0);
    }
  });
  it('burrow and leap attacks are telegraphed before they land', () => {
    for (const id of ['root_crawler', 'piston_leaper']) {
      const w = tank();
      spawnEnemy(w, C.enemies.get(id)!, id === 'piston_leaper' ? 390 : 200, 0);
      let teleAt = -1, hitAt = -1;
      for (let i = 0; i < 60 * 20 && hitAt < 0; i++) {
        w.step(IDLE);
        if (teleAt < 0 && w.zones.some((z) => z.team === 1 && z.delay >= 0.8)) teleAt = w.time;
        if (w.stats.dmgTaken > 0) hitAt = w.time;
      }
      expect(teleAt, id).toBeGreaterThan(0);
      expect(hitAt - teleAt, id + ' warning time').toBeGreaterThanOrEqual(0.75);
    }
  });
  it('frontal shields reduce damage from the front only', () => {
    const w = tank();
    const e = spawnEnemy(w, C.enemies.get('bark_guard')!, 200, 0);
    e.hp = e.maxHp = 1e6;
    w.step(IDLE);
    e.dir = Math.PI; // facing the player at the origin
    const front = damageEnemy(w, e, 100, 'fire', null, F_NOCRIT);
    w.player.x = 400; // now behind it
    const back = damageEnemy(w, e, 100, 'fire', null, F_NOCRIT);
    expect(front).toBeCloseTo(25);
    expect(back).toBeCloseTo(100);
  });
  it('split, split-at-half, summon, death pool and death burst traits work', () => {
    const w = tank();
    const slime = spawnEnemy(w, C.enemies.get('drip_slime')!, 300, 0);
    killEnemy(w, slime);
    expect(w.enemies.filter((e) => e.alive && e.def.id === 'slimelet').length).toBe(2);
    const twin = spawnEnemy(w, C.enemies.get('shadow_twin')!, 300, 100);
    damageEnemy(w, twin, twin.maxHp * 0.6, 'fire', null, F_NOCRIT);
    expect(w.enemies.filter((e) => e.alive && e.def.id === 'shadow_twin').length).toBe(2);
    const brute = spawnEnemy(w, C.enemies.get('fungal_brute')!, 300, 200);
    const z0 = w.zones.length;
    killEnemy(w, brute);
    expect(w.zones.length).toBe(z0 + 1);
    expect(w.zones[w.zones.length - 1].delay, 'death pool is telegraphed').toBeGreaterThan(0.5);
    const golem = spawnEnemy(w, C.enemies.get('forge_golem')!, 300, 300);
    const b0 = w.bullets.length;
    killEnemy(w, golem);
    expect(w.bullets.length).toBe(b0 + 10);
    const w2 = tank();
    spawnEnemy(w2, C.enemies.get('hive_mother')!, 300, 0);
    run(w2, 14, IDLE);
    expect(w2.enemies.filter((e) => e.def.id === 'sporeling').length).toBeGreaterThanOrEqual(3);
  });
  it('phase, regen, drain, kamikaze and sentry traits work', () => {
    const w = tank();
    const hound = spawnEnemy(w, C.enemies.get('phase_hound')!, 600, 0);
    let inv = 0, vis = 0;
    for (let i = 0; i < 60 * 8; i++) { w.step(IDLE); hound.x = 600; if (hound.invuln) inv++; else vis++; }
    expect(inv).toBeGreaterThan(30); expect(vis).toBeGreaterThan(30);
    hound.invuln = true;
    expect(damageEnemy(w, hound, 50, 'fire', null)).toBe(0);
    const treant = spawnEnemy(w, C.enemies.get('elder_treant')!, 900, 0);
    treant.hp = treant.maxHp * 0.5;
    const h0 = treant.hp;
    run(w, 2, IDLE);
    expect(treant.hp).toBeGreaterThan(h0);
    const w2 = tank();
    const bomber = spawnEnemy(w2, C.enemies.get('bomber_bot')!, 150, 0);
    run(w2, 6, IDLE);
    expect(bomber.alive, 'kamikaze detonates itself').toBe(false);
    expect(w2.stats.dmgTaken).toBeGreaterThan(0);
    const w3 = tank();
    const turret = spawnEnemy(w3, C.enemies.get('gun_turret')!, 300, 0);
    run(w3, 5, IDLE);
    expect([turret.x, turret.y]).toEqual([300, 0]);
    const w4 = tank();
    const leech = spawnEnemy(w4, C.enemies.get('void_leech')!, 60, 0);
    leech.hp = leech.maxHp * 0.3;
    const lh = leech.hp;
    run(w4, 3, IDLE);
    expect(leech.hp).toBeGreaterThan(lh);
  });
  it('elites are tougher and drop a relic chest', () => {
    const w = tank();
    const d = C.enemies.get('thornback')!;
    const n = spawnEnemy(w, d, 300, 0), e = spawnEnemy(w, d, 300, 50, 1);
    expect(e.maxHp).toBeGreaterThan(n.maxHp * 5);
    expect(e.r).toBeGreaterThan(n.r);
    killEnemy(w, e);
    expect(w.pickups.some((p) => p.kind === 'chest')).toBe(true);
  });
});

describe('spawning', () => {
  it('spawns outside the view (sentries materialise at range), respects tiers and the population cap', () => {
    const w = mkWorld({ seed: 11 });
    w.spawningOff = false;
    w.god = true;
    w.player.weapons = [];
    const seenTier = new Map<number, number>();
    const known = new Set<number>();
    for (let i = 0; i < 60 * 240; i++) {
      w.step(IDLE);
      for (const e of w.enemies) {
        if (known.has(e.id)) continue;
        known.add(e.id);
        if (e.age > 0.05 || e.tag !== '' ) continue;
        const d = Math.hypot(e.x - w.player.x, e.y - w.player.y);
        if (!seenTier.has(e.def.tier)) seenTier.set(e.def.tier, w.biomeT);
        if (e.def.move[0] === 'sentry') expect(d).toBeGreaterThan(200);
        else if (e.elite === 0 && w.encounters.length === 0 && !e.noXp && e.def.id !== 'sporeling' && e.def.id !== 'slimelet') expect(d, e.def.id).toBeGreaterThan(Math.min(w.view.w, w.view.h) / 2 - 60);
        expect(e.def.biome).toBe(w.biomeIdx);
      }
      expect(w.enemies.length).toBeLessThanOrEqual(560);
    }
    for (const [tier, t] of seenTier) expect(t, `tier ${tier} unlock`).toBeGreaterThanOrEqual(TIER_UNLOCK[tier] - 0.1);
    expect(seenTier.size).toBe(4);
    expect(w.enemies.length).toBeGreaterThan(100);
  });
});
