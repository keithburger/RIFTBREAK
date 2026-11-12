import type { GridItem } from '../core/grid';
import type { World } from './world';

export type ElementId = 'fire' | 'frost' | 'shock' | 'toxin' | 'water' | 'wind' | 'earth' | 'arcane' | 'light' | 'void';
export const ELEMENTS: readonly ElementId[] = ['fire', 'frost', 'shock', 'toxin', 'water', 'wind', 'earth', 'arcane', 'light', 'void'];
export type StatusId = 'burn' | 'poison' | 'slow' | 'freeze' | 'stun' | 'vuln' | 'weak';

export interface Stats {
  might: number; cooldown: number; area: number; duration: number; projSpeed: number; amount: number;
  maxHp: number; regen: number; armor: number; moveSpeed: number; magnet: number; growth: number; luck: number;
  crit: number; critDmg: number; dashCd: number; dashCharges: number; pierce: number; reaction: number;
  statusPower: number; knockback: number; revives: number; greed: number; thorns: number; lifesteal: number;
  evasion: number; eliteDmg: number; dmgTaken: number;
}
export type StatKey = keyof Stats;

export interface StatusSpec { s: StatusId; pow: number; dur: number; ch?: number }
export interface ZoneSpec { r?: number; dur?: number; dps?: number; tick?: number; slow?: number; pull?: number; grow?: number; style?: string; collapse?: number }

/** Resolved weapon parameters. Content tunes these through the ops DSL. */
export interface WP {
  kind: string;
  el: ElementId;
  el2?: ElementId;
  dmg: number; cd: number; count: number; speed: number; range: number; area: number; dur: number; pierce: number;
  spread: number; tick: number; kb: number;
  aim?: 'near' | 'facing' | 'random' | 'move' | 'strong' | 'multi';
  burst?: number; homing?: number; bounce?: number; split?: number; explode?: number; chain?: number;
  returns?: number; grow?: number; tickR?: number; trailZone?: number; lifesteal?: number; exec?: number;
  zone?: ZoneSpec;
  status?: StatusSpec;
  /** Kind-specific switches set by evolutions (documented next to each kind). */
  x: Record<string, number>;
  sprite: string;
  color: number;
}

export interface EvoDef { id: string; name: string; desc: string; needs: string; ops: string[] }
export interface WeaponDef {
  id: string; name: string; desc: string; el: ElementId;
  base: Partial<WP> & { kind: string };
  ups: string[][];
  evos: EvoDef[];
  fusion?: [string, string];
}
export interface WeaponInst {
  def: WeaponDef; rank: number; evo: EvoDef | null; p: WP; cd: number; t: number; st: number; acc: number;
  dmgDone: number; flip: number;
}

export interface Traits {
  front: number; armor: number; splitInto: string; splitN: number; pool: ElementId; burst: number; regen: number;
  enrage: number; phase: number; retaliate: number; splitHalf: number; drain: number; chill: number; stealth: number;
}
export interface EnemyDef {
  id: string; name: string; desc: string; biome: number; tier: number;
  hp: number; spd: number; dmg: number; r: number; xp: number; cost: number;
  look: [string, number]; col: number; col2: number;
  move: [string, ...number[]];
  atk?: [string, ...(number | string)[]];
  traits?: Partial<Traits>;
  group?: number;
}

export interface Leg { hx: number; hy: number; fx: number; fy: number; tx: number; ty: number; sx: number; sy: number; t: number; rest: number; len: number }
export interface BossCtl {
  def: BossDef; phase: number; t: number; at: number; atk: number; dying: number; trans: number;
  d: Record<string, number>; legs: Leg[]; segs: Enemy[]; hx: number; hy: number; order: number[];
}
export interface BossAttack { name: string; dur: number; run(w: World, e: Enemy, c: BossCtl, dt: number): void }
export interface BossDef {
  id: string; name: string; title: string; desc: string; biome: number; el: ElementId;
  hp: number; r: number; dmg: number; spd: number; col: number; col2: number;
  /** HP fractions at which the next phase begins, descending. */
  phases: number[];
  /** attacks[phase] is the rotation used during that phase. */
  attacks: BossAttack[][];
  init?(w: World, e: Enemy, c: BossCtl): void;
  /** Runs every step in addition to the current attack (movement, passive mechanics). */
  update?(w: World, e: Enemy, c: BossCtl, dt: number): void;
  onPhase?(w: World, e: Enemy, c: BossCtl): void;
}

export interface Enemy extends GridItem {
  id: number; def: EnemyDef; vx: number; vy: number; hp: number; maxHp: number; dmg: number; spd: number;
  alive: boolean; elite: number;
  mark: ElementId | null; markT: number; reactCd: number;
  burn: number; burnT: number; poison: number; poisonT: number; slow: number; slowT: number; freezeT: number;
  stunT: number; vuln: number; vulnT: number; weakT: number; curseT: number; curseW: WeaponInst | null; sporeT: number; sporeW: WeaponInst | null;
  dotT: number; kx: number; ky: number;
  ai: number; t: number; t2: number; ax: number; ay: number; dir: number; atkT: number; n: number;
  flash: number; age: number; shield: number; hidden: boolean; invuln: boolean; touchT: number;
  boss: BossCtl | null; link: Enemy | null; hasteT: number; wardT: number; noXp: boolean; tag: string;
}

export interface Proj {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number; el: ElementId; life: number; age: number;
  pierce: number; hits: number[]; p: WP; wi: WeaponInst | null; sprite: string; color: number; rot: number; spin: number;
  gen: number; bounce: number; homing: number; mode: number; tx: number; ty: number; tickT: number; zoneT: number;
  scale: number; alive: boolean; target: Enemy | null; kills: number;
}
export interface Zone {
  x: number; y: number; r: number; life: number; max: number; delay: number; tick: number; tickT: number; dmg: number;
  el: ElementId; team: number; wi: WeaponInst | null; slow: number; pull: number; grow: number; vx: number; vy: number;
  once: boolean; follow: boolean; track: Enemy | null; style: string; color: number; status: StatusSpec | null;
  collapse: number; kb: number; heal: number; wander: number; alive: boolean; noReact: boolean;
  onEnd: ((w: World, z: Zone) => void) | null;
}
export interface Beam {
  x: number; y: number; ang: number; len: number; width: number; life: number; max: number; delay: number;
  tick: number; tickT: number; dmg: number; el: ElementId; team: number; wi: WeaponInst | null; follow: boolean;
  owner: Enemy | null; rot: number; color: number; status: StatusSpec | null; alive: boolean; ramp: number;
}
export interface Bullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; color: number; sprite: string;
  homing: number; accel: number; alive: boolean;
}
export interface Minion {
  kind: string; x: number; y: number; vx: number; vy: number; life: number; t: number; ang: number; wi: WeaponInst;
  idx: number; target: Enemy | null; alive: boolean; r: number; st: number;
}
export type PickupKind = 'xp' | 'heal' | 'magnet' | 'bomb' | 'chest' | 'shard';
export interface Pickup { kind: PickupKind; x: number; y: number; vx: number; vy: number; value: number; age: number; pulled: boolean; alive: boolean }

export interface Hooks {
  onKill?(w: World, e: Enemy): void;
  onHit?(w: World, e: Enemy, dmg: number, crit: boolean, wi: WeaponInst | null): void;
  onDash?(w: World): void;
  onHurt?(w: World, dmg: number): number;
  onReact?(w: World, e: Enemy, r: ReactionDef): void;
  onFire?(w: World, wi: WeaponInst): void;
  tick?(w: World, dt: number): void;
}

export interface PassiveDef { id: string; name: string; desc: string; max: number; mods: string[] }
export interface RelicDef { id: string; name: string; desc: string; rarity: number; mods?: string[]; hooks?: Hooks }
export interface ClassDef {
  id: string; name: string; desc: string; trait: string; weapon: string; mods: string[]; col: number; col2: number;
  look: number; cost: number; hooks?: Hooks;
}
export interface MetaDef { id: string; name: string; desc: string; max: number; cost: number; mods: string[] }

export type ReactionFx =
  | { t: 'burst'; mult: number; r: number }
  | { t: 'status'; s: StatusId; pow: number; dur: number; r: number }
  | { t: 'zone'; r: number; dur: number; dps: number; slow?: number; pull?: number; style?: string }
  | { t: 'chain'; n: number; mult: number }
  | { t: 'pull'; r: number; f: number }
  | { t: 'knock'; r: number; f: number }
  | { t: 'spread'; r: number }
  | { t: 'shards'; n: number; mult: number }
  | { t: 'execute'; pct: number }
  | { t: 'heal'; amt: number }
  | { t: 'surge'; dur: number }
  | { t: 'maxhp'; pct: number };
export interface ReactionDef { id: string; a: ElementId; b: ElementId; name: string; desc: string; col: number; fx: ReactionFx[] }

export interface ElementDef { id: ElementId; name: string; col: number; col2: number; desc: string }

export interface HazardDef { kind: string; every: number; a: number; b: number; c: number }
export interface BiomeDef {
  id: string; name: string; desc: string; idx: number;
  pal: { bg: number; bg2: number; line: number; accent: number; accent2: number };
  bosses: [string, string]; hazards: HazardDef[]; decor: string[];
  music: { root: number; scale: number[]; tempo: number };
}

export interface Encounter { def: EncounterDef; t: number; d: Record<string, number>; ents: Enemy[]; x: number; y: number }
export interface EncounterDef {
  id: string; name: string; desc: string; weight: number; minTime: number; dur: number;
  start(w: World, s: Encounter): void;
  /** Return true when finished. */
  update(w: World, s: Encounter, dt: number): boolean;
}

export interface ModeDef {
  id: string; name: string; desc: string; kind: 'standard' | 'endless' | 'bossrush' | 'challenge';
  mods?: string[]; enemyHp?: number; enemySpd?: number; spawnMul?: number; xpMul?: number; weaponSlots?: number;
  biomeTime?: number; startLevel?: number;
}

export interface ContentDB {
  elements: Map<ElementId, ElementDef>;
  reactions: Map<string, ReactionDef>;
  weapons: Map<string, WeaponDef>;
  fusions: WeaponDef[];
  passives: Map<string, PassiveDef>;
  relics: Map<string, RelicDef>;
  classes: Map<string, ClassDef>;
  enemies: Map<string, EnemyDef>;
  bosses: Map<string, BossDef>;
  biomes: BiomeDef[];
  encounters: EncounterDef[];
  modes: Map<string, ModeDef>;
  meta: MetaDef[];
}

export interface Player {
  x: number; y: number; vx: number; vy: number; r: number; hp: number; facing: number; mx: number; my: number;
  moving: boolean; dashT: number; dashCd: number; dashes: number; dashX: number; dashY: number; iframes: number;
  level: number; xp: number; xpNext: number;
  weapons: WeaponInst[]; passives: Map<string, number>; relics: string[]; boosts: string[];
  cls: ClassDef; stats: Stats; hooks: Hooks[]; rs: Record<string, number>;
  dynMight: number; dynHaste: number; dynSpeed: number; surgeT: number; revives: number; slowT: number; hurtFlash: number;
  moved: number; kills: number; guard: number;
}

export interface OptionDef {
  kind: 'weapon' | 'rank' | 'evo' | 'fusion' | 'passive' | 'boost' | 'relic' | 'shards';
  id: string; evo?: number; title: string; tag: string; desc: string; lines: string[]; icon: string;
  el?: ElementId; el2?: ElementId; rank?: number; max?: number;
}

export interface RunStats {
  kills: number; dmgDealt: number; dmgTaken: number; reactions: number; shards: number; bosses: string[];
  events: number; elites: number; maxEnemies: number; reactionIds: Record<string, number>; biomes: number; hurtBy: Record<string, number>;
}

export interface InputState { mx: number; my: number; dash: boolean }

export const pairKey = (a: ElementId, b: ElementId): string => (a < b ? `${a}+${b}` : `${b}+${a}`);
