/**
 * World: the complete deterministic simulation state for one run. It knows nothing about
 * rendering, audio, DOM or storage. Presentation observes it and receives events through FxSink.
 */
import { Grid } from '../core/grid';
import { Rng } from '../core/rng';
import { updateDirector } from './director';
import { updateBullets, updateEnemies } from './enemyAI';
import { NullFx, type FxSink } from './fx';
import { updateHazards } from './hazards';
import { createPlayer, updatePickups, updatePlayer } from './player';
import { recomputeStats } from './stats';
import type { Beam, BiomeDef, Bullet, ContentDB, Encounter, Enemy, InputState, Minion, ModeDef, Pickup, Player, Proj, RunStats, Zone } from './types';
import { makeWeapon, updateBeams, updateMinions, updateProjectiles, updateWeapons, updateZones } from './weapons';

export interface WorldOpts {
  content: ContentDB;
  seed: number;
  classId: string;
  modeId?: string;
  metaRanks?: Record<string, number>;
  fx?: FxSink;
  view?: { w: number; h: number };
}

export const STEP = 1 / 60;

export class World {
  content: ContentDB;
  seed: number;
  rng: Rng;
  fx: FxSink;
  mode: ModeDef;
  metaRanks: Record<string, number>;
  time = 0;
  frame = 0;
  state: 'play' | 'won' | 'lost' = 'play';
  phase: 'field' | 'boss' | 'portal' = 'field';
  biomeIdx = 0;
  cycle = 0;
  biome: BiomeDef;
  biomeT = 0;
  portalT = 0;
  bossIdx = 0;
  player: Player;
  enemies: Enemy[] = [];
  grid = new Grid<Enemy>(72);
  projs: Proj[] = [];
  projPool: Proj[] = [];
  bullets: Bullet[] = [];
  bulletPool: Bullet[] = [];
  zones: Zone[] = [];
  beams: Beam[] = [];
  minions: Minion[] = [];
  pickups: Pickup[] = [];
  encounters: Encounter[] = [];
  boss: Enemy | null = null;
  bossDown: string | null = null;
  arena: { x: number; y: number; r: number } | null = null;
  view: { w: number; h: number };
  diff = { hp: 1, dmg: 1, spd: 1, bossHp: 1 };
  xpMul = 1;
  spawnMul = 1;
  spawnAcc = 0;
  eliteT = 50;
  encounterT = 40;
  hazardT: number[] = [];
  xpOverflow = 0;
  pendingLevels = 0;
  pendingRelics = 0;
  reactBudget = 0;
  enemySlowT = 0;
  nextId = 1;
  god = false;
  spawningOff = false;
  stats: RunStats = { kills: 0, dmgDealt: 0, dmgTaken: 0, reactions: 0, shards: 0, bosses: [], events: 0, elites: 0, maxEnemies: 0, reactionIds: {}, biomes: 0 };

  constructor(o: WorldOpts) {
    this.content = o.content;
    this.seed = o.seed;
    this.rng = new Rng(o.seed);
    this.fx = o.fx ?? new NullFx();
    this.mode = o.content.modes.get(o.modeId ?? 'standard')!;
    this.metaRanks = o.metaRanks ?? {};
    this.view = o.view ?? { w: 1200, h: 700 };
    this.biome = o.content.biomes[0];
    const cls = o.content.classes.get(o.classId)!;
    this.player = createPlayer(cls);
    recomputeStats(this);
    this.player.hp = this.player.stats.maxHp;
    this.player.revives = this.player.stats.revives;
    this.player.dashes = this.player.stats.dashCharges;
    this.player.weapons.push(makeWeapon(this, o.content.weapons.get(cls.weapon)!));
    if (this.mode.startLevel) this.pendingLevels += this.mode.startLevel - 1;
    if (this.mode.kind === 'bossrush') { this.phase = 'portal'; this.portalT = 3; }
  }

  /** Advance the simulation by one fixed step. */
  step(input: InputState, dt = STEP): void {
    if (this.state !== 'play') return;
    this.time += dt;
    this.frame++;
    this.reactBudget = 30;
    if (this.enemySlowT > 0) this.enemySlowT -= dt;
    const g = this.grid;
    g.clear();
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) if (es[i].alive) g.insert(es[i]);
    updatePlayer(this, input, dt);
    updateWeapons(this, dt);
    updateProjectiles(this, dt);
    updateMinions(this, dt);
    updateZones(this, dt);
    updateBeams(this, dt);
    updateEnemies(this, dt);
    updateBullets(this, dt);
    updatePickups(this, dt);
    updateHazards(this, dt);
    updateDirector(this, dt);
    if (es.length > this.stats.maxEnemies) this.stats.maxEnemies = es.length;
  }

  /** Count of live entities, used by leak tests and the perf HUD. */
  entityCount(): number {
    return this.enemies.length + this.projs.length + this.bullets.length + this.zones.length + this.beams.length + this.minions.length + this.pickups.length;
  }
}
