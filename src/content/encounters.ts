/** Dynamic encounters. The director starts one every ~45-60s during field phases. */
import { TAU, every } from '../core/math';
import { healPlayer } from '../sim/combat';
import { spawnGroup } from '../sim/director';
import { ringPos, spawnEnemy, spawnPickup, spawnZone } from '../sim/entities';
import { ELEMENTS, type Encounter, type EncounterDef, type EnemyDef } from '../sim/types';
import type { World } from '../sim/world';

const biomePool = (w: World, pred: (d: EnemyDef) => boolean): EnemyDef[] => {
  const all = [...w.content.enemies.values()].filter((d) => d.biome === w.biomeIdx);
  const f = all.filter(pred);
  return f.length ? f : all;
};
const mobile = (d: EnemyDef): boolean => d.move[0] !== 'sentry' && d.move[0] !== 'formation';
const allDead = (s: Encounter): boolean => s.ents.every((e) => !e.alive);

/** A courier is not a native enemy: it only exists inside its event. */
const COURIER: EnemyDef = { id: 'courier', name: 'Shard Courier', desc: 'Flees with a fortune.', biome: -1, tier: 0, hp: 90, spd: 190, dmg: 0, r: 14, xp: 6, cost: 0, look: ['ring', 2], col: 0xffd24a, col2: 0xffffff, move: ['kite', 900] };

/** Objective marker: stand inside to fill progress. Returns true when complete. */
function channel(w: World, s: Encounter, dt: number, need: number, color: number): boolean {
  const p = w.player;
  if (s.t < dt * 1.5) spawnZone(w, s.x, s.y, 90, s.def.dur, 0, 'light', 0, null, { style: 'shrine', color, tick: 9 });
  if (Math.hypot(p.x - s.x, p.y - s.y) < 90) {
    s.d.prog = (s.d.prog ?? 0) + dt;
    if (every(s.d.prog, dt, 0.5)) w.fx.text(s.x, s.y - 60, Math.round((s.d.prog / need) * 100) + '%', color, 13);
  }
  return (s.d.prog ?? 0) >= need;
}
function place(w: World, s: Encounter, dist = 280): void {
  const a = w.rng.angle();
  s.x = w.player.x + Math.cos(a) * dist;
  s.y = w.player.y + Math.sin(a) * dist;
}
function closeMarker(w: World, s: Encounter): void {
  for (const z of w.zones) if (z.style === 'shrine' && z.x === s.x && z.y === s.y) z.life = 0.01;
}

export const ENCOUNTER_DEFS: EncounterDef[] = [
  {
    id: 'elite_ambush', name: 'Elite Ambush', desc: 'Two empowered enemies hunt you', weight: 3, minTime: 45, dur: 45,
    start(w, s) {
      const c = biomePool(w, (d) => d.tier >= 1 && mobile(d));
      for (let i = 0; i < 2; i++) { const [x, y] = ringPos(w, w.rng.angle()); s.ents.push(spawnEnemy(w, w.rng.pick(c), x, y, 1)); }
    },
    update: (_w, s) => allDead(s),
  },
  {
    id: 'swarm_rush', name: 'Swarm Rush', desc: 'A dense swarm pours in from one side', weight: 3, minTime: 20, dur: 8,
    start(w, s) { s.d.ang = w.rng.angle(); },
    update(w, s, dt) {
      if (every(s.t, dt, 0.5) && w.enemies.length < 480) {
        const c = biomePool(w, (d) => d.tier === 0 && mobile(d));
        spawnGroup(w, w.rng.pick(c), 0, s.d.ang + (w.rng.next() - 0.5) * 0.7);
        spawnGroup(w, w.rng.pick(c), 0, s.d.ang + (w.rng.next() - 0.5) * 0.7);
      }
      return false;
    },
  },
  {
    id: 'encirclement', name: 'Encirclement', desc: 'They close in from every direction', weight: 2, minTime: 60, dur: 3,
    start(w) {
      const d = w.rng.pick(biomePool(w, (e) => e.tier <= 1 && mobile(e) && e.move[0] === 'chase'));
      const off = w.rng.angle();
      for (let i = 0; i < 26 && w.enemies.length < 500; i++) { const [x, y] = ringPos(w, off + (i / 26) * TAU, -40); spawnEnemy(w, d, x, y); }
    },
    update: () => false,
  },
  {
    id: 'rift_surge', name: 'Rift Surge', desc: 'Stand in the rift to seal it', weight: 2, minTime: 50, dur: 30,
    start(w, s) { place(w, s, 300); },
    update(w, s, dt) {
      if (every(s.t, dt, 1.2) && w.enemies.length < 460) {
        const d = w.rng.pick(biomePool(w, (e) => e.tier <= 1 && mobile(e)));
        const a = w.rng.angle();
        const e = spawnEnemy(w, d, s.x + Math.cos(a) * 60, s.y + Math.sin(a) * 60);
        w.fx.burst(e.x, e.y, 0xc85aff, 5, 120, 3);
      }
      if (channel(w, s, dt, 5, 0xc85aff)) {
        closeMarker(w, s);
        spawnPickup(w, 'chest', s.x, s.y, 1);
        w.fx.ring(s.x, s.y, 200, 0xc85aff, 0.5);
        w.fx.banner('RIFT SEALED', 'A relic remains', 0xc85aff);
        return true;
      }
      return false;
    },
  },
  {
    id: 'treasure_courier', name: 'Shard Courier', desc: 'Catch it before it escapes', weight: 2, minTime: 30, dur: 22,
    start(w, s) {
      const a = w.rng.angle();
      const e = spawnEnemy(w, COURIER, w.player.x + Math.cos(a) * 240, w.player.y + Math.sin(a) * 240);
      e.tag = 'courier';
      e.hp = e.maxHp = COURIER.hp * w.diff.hp;
      s.ents.push(e);
    },
    update(w, s) {
      const e = s.ents[0];
      if (!e.alive) {
        for (let i = 0; i < 6; i++) spawnPickup(w, 'shard', e.x, e.y, 4);
        spawnPickup(w, 'heal', e.x, e.y, 20);
        return true;
      }
      if (s.t > 21) { e.noXp = true; e.alive = false; w.fx.burst(e.x, e.y, 0xffd24a, 8, 200, 3); w.fx.text(e.x, e.y, 'ESCAPED', 0xffd24a, 13); return true; }
      return false;
    },
  },
  {
    id: 'shrine_of_power', name: 'Shrine of Power', desc: 'Stand in the light to be empowered', weight: 2, minTime: 40, dur: 28,
    start(w, s) { place(w, s, 260); },
    update(w, s, dt) {
      if (!channel(w, s, dt, 3.5, 0xfff3b8)) return false;
      closeMarker(w, s);
      w.player.surgeT = 25;
      healPlayer(w, w.player.stats.maxHp * 0.2);
      w.fx.ring(s.x, s.y, 260, 0xfff3b8, 0.6);
      w.fx.banner('EMPOWERED', '+30% damage and attack speed for 25s', 0xfff3b8);
      w.fx.sfx('relic');
      return true;
    },
  },
  {
    id: 'meteor_storm', name: 'Meteor Storm', desc: 'The sky is falling on everyone', weight: 2, minTime: 70, dur: 14,
    start() {},
    update(w, _s, dt) {
      if (every(_s.t, dt, 0.32)) {
        const a = w.rng.angle(), d = 60 + w.rng.next() * 340;
        spawnZone(w, w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d, 64, 0.1, 16 * w.diff.dmg + 30 * w.diff.hp * 0.2, 'fire', 2, null, { delay: 1.15, once: true, style: 'hazard', color: 0xff8a3a });
      }
      return false;
    },
  },
  {
    id: 'cursed_altar', name: 'Cursed Altar', desc: 'Claim a relic... and anger the horde', weight: 2, minTime: 90, dur: 26,
    start(w, s) { place(w, s, 280); },
    update(w, s, dt) {
      if (s.d.taken) {
        if (every(s.t, dt, 0.5)) for (const e of w.enemies) e.hasteT = 1;
        return s.t > s.d.taken + 15;
      }
      if (channel(w, s, dt, 3, 0xff4a6a)) {
        closeMarker(w, s);
        s.d.taken = s.t;
        w.pendingRelics++;
        w.fx.banner('CURSED', 'The horde is enraged', 0xff4a6a);
        w.fx.flash(0xff2244, 0.3);
      }
      return false;
    },
  },
  {
    id: 'supply_drop', name: 'Supply Drop', desc: 'Supplies incoming nearby', weight: 2, minTime: 35, dur: 4,
    start(w, s) {
      place(w, s, 220);
      spawnZone(w, s.x, s.y, 50, 0.1, 0, 'light', 0, null, { delay: 1.5, once: true, style: 'shrine', color: 0x7dffb0 });
    },
    update(w, s, dt) {
      if (s.t >= 1.5 && s.t - dt < 1.5) {
        w.fx.burst(s.x, s.y, 0x7dffb0, 16, 240, 4);
        spawnPickup(w, 'heal', s.x, s.y, 25);
        spawnPickup(w, w.rng.next() < 0.5 ? 'magnet' : 'bomb', s.x, s.y);
        for (let i = 0; i < 3; i++) spawnPickup(w, 'shard', s.x, s.y, 3);
      }
      return false;
    },
  },
  {
    id: 'champion_duel', name: 'Champion', desc: 'A towering champion enters the field', weight: 2, minTime: 110, dur: 60,
    start(w, s) {
      const c = biomePool(w, (d) => d.tier >= 2 && mobile(d));
      const [x, y] = ringPos(w, w.rng.angle());
      s.ents.push(spawnEnemy(w, w.rng.pick(c), x, y, 2));
    },
    update: (_w, s) => allDead(s),
  },
  {
    id: 'elemental_storm', name: 'Elemental Storm', desc: 'Raw elements brand every enemy', weight: 2, minTime: 60, dur: 18,
    start(_w, s) { s.d.el = -1; },
    update(w, s, dt) {
      if (every(s.t, dt, 1.5)) {
        const el = w.rng.pick(ELEMENTS);
        const col = w.content.elements.get(el)!.col;
        for (const e of w.enemies) if (e.mark === null && !e.hidden) { e.mark = el; e.markT = 6; }
        w.fx.ring(w.player.x, w.player.y, 520, col, 0.5);
      }
      return false;
    },
  },
  {
    id: 'blood_moon', name: 'Rift Tide', desc: 'Double spawns, double experience', weight: 2, minTime: 80, dur: 24,
    start(w) { w.spawnMul = 2.1; w.mode = { ...w.mode, xpMul: (w.mode.xpMul ?? 1) * 2 }; },
    update(w, s) {
      if (s.t < 23.5) return false;
      w.spawnMul = 1;
      w.mode = w.content.modes.get(w.mode.id)!;
      return true;
    },
  },
];
