/** Biome hazards. All are telegraphed (>= 1.1s) so they can never deal unavoidable damage. */
import { spawnBeam, spawnZone } from './entities';
import type { ElementId, HazardDef } from './types';
import type { World } from './world';

type HazardFn = (w: World, h: HazardDef, x: number, y: number) => void;
export const HAZARDS: Record<string, HazardFn> = {
  /** vent(radius, dmg): toxic burst that hurts everything. */
  vent: (w, h, x, y) => { spawnZone(w, x, y, h.a, 2.2, h.b * w.diff.dmg, 'toxin', 2, null, { delay: 1.3, tick: 0.5, style: 'hazard', color: 0x9dff5a }); },
  /** bramble(radius): slowing thicket, no damage. */
  bramble: (w, h, x, y) => { spawnZone(w, x, y, h.a, 9, 0, 'earth', 2, null, { delay: 1.1, slow: 0.4, tick: 0.25, style: 'hazard', color: 0x5fae6a }); },
  /** jet(length, dmg): flame jet along a line. */
  jet: (w, h, x, y) => { spawnBeam(w, x, y, w.rng.angle(), h.a, 30, 1.6, h.b * w.diff.dmg, 'fire', 1, null, { delay: 1.3, tick: 0.3, color: 0xff7a2a }); },
  /** arc(radius, dmg): electrified plate that pulses twice. */
  arc: (w, h, x, y) => { spawnZone(w, x, y, h.a, 1.4, h.b * w.diff.dmg, 'shock', 2, null, { delay: 1.2, tick: 0.6, style: 'hazard', color: 0xffe14a }); },
  /** whirl(radius, pull): whirlpool that drags everything inward. */
  whirl: (w, h, x, y) => { spawnZone(w, x, y, h.a, 5, h.c * w.diff.dmg, 'water', 2, null, { delay: 1.2, pull: h.b, tick: 0.6, style: 'pull', color: 0x4ab8ff }); },
  /** geyser(radius, dmg): frost eruption that chills. */
  geyser: (w, h, x, y) => { spawnZone(w, x, y, h.a, 0.1, h.b * w.diff.dmg, 'frost', 2, null, { delay: 1.4, once: true, slow: 0.5, style: 'hazard', color: 0x9fe8ff }); },
  /** rift(radius, dmg, speed): drifting void tear. */
  rift: (w, h, x, y) => { const a = w.rng.angle(); spawnZone(w, x, y, h.a, 8, h.b * w.diff.dmg, 'void', 2, null, { delay: 1.3, tick: 0.5, vx: Math.cos(a) * h.c, vy: Math.sin(a) * h.c, style: 'hazard', color: 0xb06bff }); },
  /** flare(radius, dmg): light pillar – a large, slow, single blast. */
  flare: (w, h, x, y) => { spawnZone(w, x, y, h.a, 0.1, h.b * w.diff.dmg, 'light', 2, null, { delay: 1.8, once: true, style: 'hazard', color: 0xfff2b0 }); },
};

export function updateHazards(w: World, dt: number): void {
  if (w.phase !== 'field') return;
  const hz = w.biome.hazards;
  for (let i = 0; i < hz.length; i++) {
    w.hazardT[i] = (w.hazardT[i] ?? hz[i].every * 0.6) - dt;
    if (w.hazardT[i] > 0) continue;
    w.hazardT[i] = hz[i].every * (0.7 + w.rng.next() * 0.6);
    const a = w.rng.angle(), d = 80 + w.rng.next() * 330;
    HAZARDS[hz[i].kind](w, hz[i], w.player.x + w.player.vx * 0.6 + Math.cos(a) * d, w.player.y + w.player.vy * 0.6 + Math.sin(a) * d);
  }
}
export type { ElementId };
