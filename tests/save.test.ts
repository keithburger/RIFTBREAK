import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, SAVE_KEY, SAVE_VERSION, SaveStore, defaultSave, migrate, type KV } from '../src/save/save';

const mem = (init?: string): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  if (init !== undefined) m.set(SAVE_KEY, init);
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe('save data', () => {
  it('starts from defaults and round-trips through storage', () => {
    const kv = mem();
    const a = new SaveStore(kv);
    expect(a.data).toEqual(defaultSave());
    a.data.shards = 123; a.data.meta.m_might = 3; a.data.classes.push('geomancer'); a.data.settings.music = 0.1; a.data.stats.wins = 2;
    a.save();
    const b = new SaveStore(kv);
    expect(b.data).toEqual(a.data);
  });
  it('migrates v1 → current', () => {
    const v1 = { version: 1, currency: 77, unlocked: ['voidwalker'], meta: { m_hull: 2 }, stats: { runs: 5 } };
    const d = migrate(v1);
    expect(d.v).toBe(SAVE_VERSION);
    expect(d.shards).toBe(77);
    expect(d.classes).toContain('voidwalker');
    expect(d.classes).toContain('vanguard');
    expect(d.meta.m_hull).toBe(2);
    expect(d.stats.runs).toBe(5);
    expect(d.stats.wins).toBe(0);
    expect(d.settings.keys).toEqual(DEFAULT_KEYS);
    expect(d.seen.weapons).toEqual([]);
  });
  it('migrates v2 → current and keeps settings', () => {
    const d = migrate({ v: 2, shards: 9, meta: {}, classes: [], settings: { master: 0.2 }, stats: {} });
    expect(d.v).toBe(SAVE_VERSION);
    expect(d.settings.master).toBe(0.2);
    expect(d.settings.sfx).toBe(defaultSave().settings.sfx);
    expect(d.settings.keys.dash).toBe('Space');
  });
  it('survives corrupt, future or hostile data', () => {
    expect(new SaveStore(mem('{not json')).data).toEqual(defaultSave());
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate({ v: 999 })).toEqual(defaultSave());
    expect(migrate({ v: SAVE_VERSION, shards: 'lots', classes: 'x' }).shards).toBe(0);
    expect(migrate({ v: SAVE_VERSION, shards: -50 }).shards).toBe(0);
    const throwing: KV = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    const s = new SaveStore(throwing);
    expect(s.data).toEqual(defaultSave());
    expect(() => s.save()).not.toThrow();
    expect(() => new SaveStore(null).save()).not.toThrow();
  });
  it('reset restores defaults', () => {
    const s = new SaveStore(mem());
    s.data.shards = 5; s.save(); s.reset();
    expect(s.data.shards).toBe(0);
  });
});
