/** Headless autopilot used by tests, balance simulations and benchmarks. Not shipped in gameplay. */
import { Rng } from '../core/rng';
import type { InputState, OptionDef } from './types';
import { applyOption, rollOptions, rollRelics } from './upgrades';
import { STEP, type World } from './world';

export type BotPolicy = 'smart' | 'random' | 'weapons' | 'passives';

export class Bot {
  private rng: Rng;
  private in: InputState = { mx: 0, my: 0, dash: false };
  constructor(readonly policy: BotPolicy = 'smart', seed = 7) {
    this.rng = new Rng(seed);
  }

  input(w: World): InputState {
    const p = w.player;
    let fx = 0, fy = 0, danger = 0;
    for (const e of w.enemies) {
      if (!e.alive || e.hidden) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) - e.r;
      const reach = e.boss ? 300 : e.def.move[0] === 'charge' || e.elite ? 170 : 92;
      if (e.boss && d > 280) { fx -= (dx / (d + e.r)) * 0.3; fy -= (dy / (d + e.r)) * 0.3; continue; }
      if (d > reach) continue;
      const k = (reach - d) / reach / Math.max(12, d);
      fx += dx * k * (e.boss ? 3 : 1); fy += dy * k * (e.boss ? 3 : 1);
      if (d < 34) danger++;
    }
    for (const b of w.bullets) {
      const dx = p.x - b.x, dy = p.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 170 * 170) continue;
      const d = Math.sqrt(d2) || 1;
      // sidestep perpendicular to the bullet's travel
      const side = Math.sign(dx * b.vy - dy * b.vx) || 1;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      fx += ((b.vy / sp) * side * 1.6 + dx / d) * (170 - d) / 170 / 6;
      fy += ((-b.vx / sp) * side * 1.6 + dy / d) * (170 - d) / 170 / 6;
      if (d < 30) danger++;
    }
    for (const z of w.zones) {
      if (z.team === 0) {
        if (z.style === 'shrine') { const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy) || 1; if (d > 40) { fx += (dx / d) * 0.12; fy += (dy / d) * 0.12; } }
        continue;
      }
      if (z.dmg <= 0 && !z.pull) continue;
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
      const edge = z.dmg > 0 ? z.r + 45 : z.r * 0.5;
      if (d < edge) { const k = z.dmg > 0 ? (d < z.r + 12 ? 1.3 : 0.6) : 0.25; fx += (dx / d) * k; fy += (dy / d) * k; }
    }
    for (const b of w.beams) {
      if (b.team !== 1) continue;
      const cx = Math.cos(b.ang), sy = Math.sin(b.ang);
      const dx = p.x - b.x, dy = p.y - b.y;
      const along = dx * cx + dy * sy;
      if (along < -40 || along > b.len + 40) continue;
      const perp = dx * sy - dy * cx;
      const lim = b.width * 0.5 + 70 + Math.abs(b.rot) * 90;
      if (Math.abs(perp) < lim) {
        const s = b.rot !== 0 ? -Math.sign(b.rot) : Math.sign(perp) || 1; // run with the sweep direction
        fx += sy * s * 0.9; fy += -cx * s * 0.9;
      }
    }
    let best = 1e9, bx = 0, by = 0;
    for (const k of w.pickups) {
      const d = Math.hypot(k.x - p.x, k.y - p.y) * (k.kind === 'chest' ? 0.3 : k.kind === 'heal' && p.hp < p.stats.maxHp * 0.6 ? 0.3 : 1);
      if (d < best) { best = d; bx = k.x - p.x; by = k.y - p.y; }
    }
    if (best < 600) { const d = Math.hypot(bx, by) || 1; fx += (bx / d) * 0.16; fy += (by / d) * 0.16; }
    if (w.arena) {
      const dx = w.arena.x - p.x, dy = w.arena.y - p.y, d = Math.hypot(dx, dy);
      if (d > w.arena.r - 160) { fx += (dx / d) * 0.5; fy += (dy / d) * 0.5; }
    }
    // gentle default orbit keeps movement-driven weapons working
    const t = w.time * 0.5;
    fx += Math.cos(t) * 0.035; fy += Math.sin(t) * 0.035;
    const l = Math.hypot(fx, fy);
    const i = this.in;
    if (l > 0.02) { i.mx = fx / l; i.my = fy / l; } else { i.mx = 0; i.my = 0; }
    i.dash = danger > 0 && p.dashes > 0;
    return i;
  }

  choose(w: World, opts: OptionDef[]): OptionDef {
    if (this.policy === 'random') return this.rng.pick(opts);
    const score = (o: OptionDef): number => {
      const nw = w.player.weapons.length;
      switch (o.kind) {
        case 'evo': case 'fusion': return 100;
        case 'rank': return this.policy === 'passives' ? 20 : 50;
        case 'weapon': return this.policy === 'weapons' ? 70 : nw < 4 ? 60 : 25;
        case 'passive': return this.policy === 'passives' ? 60 : (o.rank ?? 1) === 1 ? 35 : 30;
        case 'relic': return 10 + (o.rank ?? 1);
        default: return 1;
      }
    };
    let b = opts[0], bs = -1;
    for (const o of opts) { const s = score(o) + this.rng.next() * 8; if (s > bs) { bs = s; b = o; } }
    return b;
  }

  /** Resolve any queued level-ups and relic choices. */
  resolve(w: World): void {
    while (w.pendingLevels > 0 && w.state === 'play') { w.pendingLevels--; applyOption(w, this.choose(w, rollOptions(w))); }
    while (w.pendingRelics > 0 && w.state === 'play') { w.pendingRelics--; applyOption(w, this.choose(w, rollRelics(w))); }
  }
}

/** Run a world with a bot until it ends or `maxSeconds` of game time pass. */
export function runHeadless(w: World, bot: Bot, maxSeconds: number, onStep?: (w: World) => void): World {
  const steps = Math.ceil(maxSeconds / STEP);
  for (let i = 0; i < steps && w.state === 'play'; i++) {
    w.step(bot.input(w));
    bot.resolve(w);
    onStep?.(w);
  }
  return w;
}
