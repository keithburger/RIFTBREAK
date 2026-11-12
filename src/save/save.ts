/** Versioned persistent data (meta progression, unlocks, settings, stats) with migrations. */
export interface Settings {
  master: number; sfx: number; music: number; shake: number; reduceFlash: boolean; dmgNumbers: boolean;
  quality: number; // -1 auto, 0-3 fixed
  keys: Record<string, string>;
}
export interface SaveData {
  v: number;
  shards: number;
  meta: Record<string, number>;
  classes: string[];
  settings: Settings;
  stats: { runs: number; wins: number; kills: number; bestTime: number; bossKills: Record<string, number>; modeWins: Record<string, number>; bestEndless: number };
  seen: { weapons: string[]; relics: string[]; reactions: string[] };
}
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export const SAVE_KEY = 'riftbreak.save';
export const SAVE_VERSION = 3;
export const DEFAULT_KEYS: Record<string, string> = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', dash: 'Space', pause: 'Escape' };

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION, shards: 0, meta: {}, classes: ['vanguard', 'pyre_warden', 'stormcaller'],
    settings: { master: 0.8, sfx: 0.8, music: 0.5, shake: 1, reduceFlash: false, dmgNumbers: true, quality: -1, keys: { ...DEFAULT_KEYS } },
    stats: { runs: 0, wins: 0, kills: 0, bestTime: 0, bossKills: {}, modeWins: {}, bestEndless: 0 },
    seen: { weapons: [], relics: [], reactions: [] },
  };
}

type Raw = Record<string, unknown>;
/** Each migration upgrades one schema version. Add new ones at the end; never edit old ones. */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  // v1 stored `currency` and a flat `unlocked` list, with no settings object.
  1: (d) => ({ v: 2, shards: d.currency ?? 0, meta: d.meta ?? {}, classes: d.unlocked ?? [], settings: {}, stats: d.stats ?? {} }),
  // v2 lacked codex tracking and key bindings.
  2: (d) => ({ ...d, v: 3, seen: { weapons: [], relics: [], reactions: [] }, settings: { ...(d.settings as Raw), keys: { ...DEFAULT_KEYS } } }),
};

export function migrate(raw: unknown): SaveData {
  const def = defaultSave();
  if (!raw || typeof raw !== 'object') return def;
  let d = raw as Raw;
  let v = typeof d.v === 'number' ? d.v : typeof d.version === 'number' ? (d.version as number) : 1;
  while (v < SAVE_VERSION && MIGRATIONS[v]) { d = MIGRATIONS[v](d); v = d.v as number; }
  if (v !== SAVE_VERSION) return def;
  const s = d as unknown as Partial<SaveData>;
  // merge over defaults so missing/corrupt fields never crash the game
  return {
    v: SAVE_VERSION,
    shards: typeof s.shards === 'number' && isFinite(s.shards) ? Math.max(0, s.shards) : 0,
    meta: { ...(s.meta ?? {}) },
    classes: Array.from(new Set([...def.classes, ...(Array.isArray(s.classes) ? s.classes : [])])),
    settings: { ...def.settings, ...(s.settings ?? {}), keys: { ...DEFAULT_KEYS, ...(s.settings?.keys ?? {}) } },
    stats: { ...def.stats, ...(s.stats ?? {}) },
    seen: { ...def.seen, ...(s.seen ?? {}) },
  };
}

export class SaveStore {
  data: SaveData;
  constructor(private kv: KV | null) { this.data = this.load(); }
  load(): SaveData {
    try {
      const raw = this.kv?.getItem(SAVE_KEY);
      return raw ? migrate(JSON.parse(raw)) : defaultSave();
    } catch { return defaultSave(); }
  }
  save(): void {
    try { this.kv?.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch { /* storage full or blocked: keep playing */ }
  }
  reset(): void { this.data = defaultSave(); this.save(); }
}

export function browserStorage(): KV | null {
  try { const s = window.localStorage; s.getItem(SAVE_KEY); return s; } catch { return null; }
}
