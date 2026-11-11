import { applyStatus, damageEnemy, hitCircle, hitLine, healPlayer, randomEnemies, F_NOREACT } from '../sim/combat';
import { spawnPickup } from '../sim/entities';
import type { ClassDef, WP } from '../sim/types';

const dashWP: WP = { kind: 'shot', el: 'void', dmg: 1, cd: 1, count: 1, speed: 1, range: 1, area: 1, dur: 1, pierce: 0, spread: 0, tick: 0, kb: 0, x: {}, sprite: 'p_rend', color: 0x9b5cff };

/** Playable classes: starting weapon, stat profile and a unique trait implemented with hooks. */
export const CLASS_DEFS: ClassDef[] = [
  {
    id: 'vanguard', name: 'Vanguard', desc: 'Sturdy frontline operative.', trait: 'Bulwark: when hit, blast nearby enemies away.',
    weapon: 'ember_carbine', mods: ['armor+1', 'maxHp+20'], col: 0xff8a3a, col2: 0xffe0a0, look: 0, cost: 0,
    hooks: {
      onHurt(w, dmg) {
        const p = w.player;
        w.fx.ring(p.x, p.y, 150, 0xffb86a, 0.3);
        for (const e of w.grid.query(p.x, p.y, 150)) if (!e.boss) { const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; e.kx += ((e.x - p.x) / d) * 420; e.ky += ((e.y - p.y) / d) * 420; }
        return dmg;
      },
    },
  },
  {
    id: 'pyre_warden', name: 'Pyre Warden', desc: 'Master of lingering flame.', trait: 'Wildfire: burning enemies spread their burn when they die.',
    weapon: 'magma_mortar', mods: ['statusPower+0.3'], col: 0xff5a2a, col2: 0xffd24a, look: 1, cost: 0,
    hooks: {
      onKill(w, e) {
        if (e.burnT <= 0) return;
        for (const o of w.grid.query(e.x, e.y, 90)) if (o.alive) applyStatus(w, o, 'burn', e.burn / w.player.stats.statusPower, 3);
      },
    },
  },
  {
    id: 'stormcaller', name: 'Stormcaller', desc: 'Fast-firing conduit of lightning.', trait: 'Static Dash: dashing shocks up to five enemies.',
    weapon: 'arc_coil', mods: ['cooldown*0.92'], col: 0xffe94a, col2: 0xffffff, look: 2, cost: 0,
    hooks: {
      onDash(w) {
        const p = w.player;
        for (const e of randomEnemies(w, p.x, p.y, 260, 5)) { w.fx.line(p.x, p.y, e.x, e.y, 0xffe94a, 3, 0.15); damageEnemy(w, e, 14 + p.level * 3, 'shock', null); }
      },
    },
  },
  {
    id: 'geomancer', name: 'Geomancer', desc: 'Slow, armored, immovable.', trait: 'Tremor: when hit, stun everything around you.',
    weapon: 'boulder_ring', mods: ['maxHp+40', 'armor+2', 'moveSpeed*0.92'], col: 0xd9a05a, col2: 0xffe0b0, look: 3, cost: 150,
    hooks: {
      onHurt(w, dmg) {
        const p = w.player;
        w.fx.ring(p.x, p.y, 160, 0xd9a05a, 0.35);
        for (const e of w.grid.query(p.x, p.y, 160)) applyStatus(w, e, 'stun', 1, 1.2);
        return dmg;
      },
    },
  },
  {
    id: 'voidwalker', name: 'Voidwalker', desc: 'Fragile blink assassin.', trait: 'Rift Step: two dash charges; dashing cuts everything in your path.',
    weapon: 'phase_rend', mods: ['dashCharges+1', 'maxHp*0.85'], col: 0x9b5cff, col2: 0xe0d0ff, look: 4, cost: 200,
    hooks: {
      onDash(w) {
        const p = w.player;
        hitLine(w, p.x, p.y, Math.atan2(p.dashY, p.dashX), 190, 60, 18 + p.level * 4, dashWP, null);
        w.fx.line(p.x, p.y, p.x + p.dashX * 190, p.y + p.dashY * 190, 0x9b5cff, 14, 0.2);
      },
    },
  },
  {
    id: 'alchemist', name: 'Alchemist', desc: 'Reaction specialist.', trait: 'Transmute: +40% reaction damage; reactions may heal and drop experience.',
    weapon: 'venom_spitter', mods: ['reaction+0.4'], col: 0x8dff4a, col2: 0xe0ffb0, look: 5, cost: 250,
    hooks: {
      onReact(w, e) {
        if (w.rng.next() < 0.15) { healPlayer(w, 1); spawnPickup(w, 'xp', e.x, e.y, 2 + w.player.level * 0.3); }
      },
    },
  },
  {
    id: 'dawnblade', name: 'Dawnblade', desc: 'Precise, mobile lancer.', trait: 'Radiance: critical kills grant a brief power surge.',
    weapon: 'dawn_lancer', mods: ['crit+0.1', 'moveSpeed+0.08'], col: 0xfff3b8, col2: 0xffffff, look: 6, cost: 300,
    hooks: {
      onHit(w, e, _d, crit) { if (crit && !e.alive) w.player.surgeT = Math.max(w.player.surgeT, 1.5); },
    },
  },
  {
    id: 'windrunner', name: 'Windrunner', desc: 'Never stops moving.', trait: 'Tailwind: weapons cycle 15% faster while moving; standing still shocks nothing.',
    weapon: 'slipstream', mods: ['moveSpeed+0.2', 'magnet+0.3', 'maxHp*0.9'], col: 0xb8ffe0, col2: 0xffffff, look: 7, cost: 300,
    hooks: {
      tick(w) { if (w.player.moving) w.player.dynHaste *= 1.15; },
    },
  },
];
void hitCircle; void F_NOREACT;
