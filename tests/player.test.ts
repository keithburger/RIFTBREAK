import { describe, expect, it } from 'vitest';
import { hurtPlayer } from '../src/sim/combat';
import { spawnBullet, spawnPickup, spawnZone } from '../src/sim/entities';
import { xpForLevel, gainXp } from '../src/sim/player';
import { BASE_SPEED } from '../src/sim/stats';
import { IDLE, dummy, mkWorld, run } from './helpers';

describe('player', () => {
  it('moves at base speed, normalises diagonals', () => {
    const w = mkWorld(); w.player.weapons = [];
    run(w, 1, { mx: 1, my: 0, dash: false });
    expect(w.player.x).toBeCloseTo(BASE_SPEED * w.player.stats.moveSpeed, 0);
    const w2 = mkWorld();
    run(w2, 1, { mx: 1, my: 1, dash: false });
    expect(Math.hypot(w2.player.x, w2.player.y)).toBeCloseTo(BASE_SPEED * w2.player.stats.moveSpeed, 0);
  });
  it('dash covers distance, grants i-frames, consumes and recharges a charge', () => {
    const w = mkWorld(); w.player.weapons = [];
    run(w, 0.5, { mx: 1, my: 0, dash: false });
    w.player.iframes = 0;
    const x0 = w.player.x;
    w.step({ mx: 1, my: 0, dash: true });
    expect(w.player.dashes).toBe(0);
    expect(hurtPlayer(w, 50)).toBe(false);
    run(w, 0.2, IDLE);
    expect(w.player.x - x0).toBeGreaterThan(130);
    w.step({ mx: 1, my: 0, dash: true });
    expect(w.player.dashT, 'no dash without a charge').toBeLessThanOrEqual(0);
    run(w, 3, IDLE);
    expect(w.player.dashes).toBe(1);
  });
  it('takes contact damage with invulnerability frames, reduced by armor', () => {
    const w = mkWorld(); w.player.weapons = [];
    const e = dummy(w, 0, 0); e.dmg = 20;
    run(w, 1.2, IDLE);
    expect(w.player.hp).toBeCloseTo(w.player.stats.maxHp - (20 - w.player.stats.armor), -1);
    const hp = w.player.hp;
    expect(hurtPlayer(w, 20), 'i-frames block').toBe(false);
    expect(w.player.hp).toBe(hp);
    w.player.iframes = 0; w.player.stats.armor = 100;
    hurtPlayer(w, 20);
    expect(hp - w.player.hp, 'armor floor is 20%').toBeCloseTo(4, 5);
  });
  it('is hit by enemy bullets, hostile zones respect their telegraph', () => {
    const w = mkWorld(); w.player.weapons = []; w.player.iframes = 0;
    spawnBullet(w, -60, 0, 0, 300, 10);
    run(w, 0.4, IDLE);
    expect(w.stats.dmgTaken).toBeGreaterThan(0);
    const w2 = mkWorld(); w2.player.weapons = []; w2.player.iframes = 0;
    spawnZone(w2, 0, 0, 80, 0.1, 30, 'fire', 1, null, { delay: 1, once: true });
    run(w2, 0.9, IDLE);
    expect(w2.stats.dmgTaken, 'no damage during telegraph').toBe(0);
    run(w2, 0.3, IDLE);
    expect(w2.stats.dmgTaken).toBeGreaterThan(0);
  });
  it('dies at 0 HP, or revives once when a revive is held', () => {
    const w = mkWorld(); w.player.iframes = 0;
    hurtPlayer(w, 1e6);
    expect(w.state).toBe('lost');
    const w2 = mkWorld(); w2.player.iframes = 0; w2.player.revives = 1;
    hurtPlayer(w2, 1e6);
    expect(w2.state).toBe('play');
    expect(w2.player.hp).toBeCloseTo(w2.player.stats.maxHp * 0.5);
    w2.player.iframes = 0;
    hurtPlayer(w2, 1e6);
    expect(w2.state).toBe('lost');
  });
  it('collects experience, levels up and queues a choice per level', () => {
    const w = mkWorld(); w.player.weapons = [];
    spawnPickup(w, 'xp', 30, 0, xpForLevel(1) + xpForLevel(2) + 1);
    run(w, 1.5, IDLE);
    expect(w.player.level).toBe(3);
    expect(w.pendingLevels).toBe(2);
    gainXp(w, 1e5);
    expect(w.pendingLevels).toBe(w.player.level - 1);
    for (let l = 1; l < 80; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });
  it('is confined by a boss arena', () => {
    const w = mkWorld(); w.player.weapons = [];
    w.arena = { x: 0, y: 0, r: 200 };
    run(w, 3, { mx: 1, my: 0, dash: false });
    expect(Math.hypot(w.player.x, w.player.y)).toBeLessThanOrEqual(200);
  });
});
