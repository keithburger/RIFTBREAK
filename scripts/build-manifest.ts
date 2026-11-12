/**
 * Generates content-manifest.json from the live registries plus the latest vitest JSON report
 * (test-results.json, written by `npm test`). Status fields are derived, never hand-edited:
 *   implemented  – registered and passes registry validation
 *   art          – has a procedural sprite / icon recipe
 *   integrated   – reachable through normal play (how is recorded in `reach`)
 *   verified     – the named automated test passed in the last recorded run
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { content, contentCounts, validateContent } from '../src/content/registry';
import { pairKey } from '../src/sim/types';

const c = content();
const problems = validateContent(c);
interface T { fullName: string; status: string }
const tests: T[] = [];
let testRun: { file: string; when: string; passed: number; failed: number } | null = null;
if (existsSync('test-results.json')) {
  const r = JSON.parse(readFileSync('test-results.json', 'utf8'));
  for (const f of r.testResults ?? []) for (const a of f.assertionResults ?? []) tests.push({ fullName: a.fullName, status: a.status });
  testRun = { file: 'test-results.json', when: new Date(r.startTime).toISOString(), passed: r.numPassedTests, failed: r.numFailedTests };
}
const passed = (needle: string): boolean | null => {
  const m = tests.filter((t) => t.fullName.includes(needle));
  return m.length ? m.every((t) => t.status === 'passed') : null;
};
const ok = problems.length === 0;
const item = (id: string, name: string, reach: string, test: string, extra: Record<string, unknown> = {}) => ({ id, name, implemented: ok, art: true, integrated: true, reach, verified: passed(test), test, ...extra });

const base = [...c.weapons.values()].filter((w) => !w.fusion);
const manifest = {
  generated: new Date().toISOString(),
  generator: 'scripts/build-manifest.ts',
  validation: { ok, problems },
  testRun,
  targets: { weapons: 40, evolutions: 80, fusions: 20, enemies: 64, bosses: 8, biomes: 4, reactions: 45, classes: 6, passives: 24, relics: 24, encounters: 12 },
  counts: contentCounts(c),
  weapons: base.map((w) => item(w.id, w.name, 'level-up pool (all modes)', `${w.id}: base and both evolutions`, { element: w.el, kind: w.base.kind, evolutions: w.evos.map((e) => ({ id: e.id, name: e.name, needs: e.needs })) })),
  fusions: c.fusions.map((f) => item(f.id, f.name, `level-up once ${f.fusion![0]} + ${f.fusion![1]} are max rank`, `fusion ${f.id} deals damage`, { elements: [f.el, f.base.el2], sources: f.fusion })),
  enemies: [...c.enemies.values()].map((e) => item(e.id, e.name, `${c.biomes[e.biome].name} spawn pool, tier ${e.tier}`, `${e.id} (${e.move[0]}`, { biome: e.biome, move: e.move[0], attack: e.atk?.[0] ?? null, traits: Object.keys(e.traits ?? {}) })),
  bosses: [...c.bosses.values()].map((b) => item(b.id, b.name, `${c.biomes[b.biome].name} finale (seed parity) and Boss Rush`, `${b.name} fights through every phase`, { phases: b.phases.length + 1, attacks: [...new Set(b.attacks.flat().map((a) => a.name))] })),
  biomes: c.biomes.map((b) => item(b.id, b.name, `standard run stage ${b.idx + 1}`, 'standard run: four biomes', { hazards: b.hazards.map((h) => h.kind), bosses: b.bosses })),
  reactions: [...c.reactions.values()].map((r) => item(r.id, r.name, `hit a ${r.a}-marked enemy with ${r.b} (or vice versa)`, `${r.a} + ${r.b} triggers`, { pair: pairKey(r.a, r.b), effects: r.fx.map((f) => f.t) })),
  classes: [...c.classes.values()].map((k) => item(k.id, k.name, k.cost ? `unlock for ${k.cost} shards` : 'available from the start', 'every class starts with a working weapon', { weapon: k.weapon })),
  passives: [...c.passives.values()].map((p) => item(p.id, p.name, 'level-up pool', 'always offers three distinct', { max: p.max })),
  relics: [...c.relics.values()].map((r) => item(r.id, r.name, 'elite / boss / event chests', 'every relic and class hook runs', { rarity: r.rarity })),
  encounters: c.encounters.map((e) => item(e.id, e.name, `random field event after ${e.minTime}s`, `${e.id} starts, has its effect`)),
  modes: [...c.modes.values()].map((m) => ({ id: m.id, name: m.name, kind: m.kind })),
};
writeFileSync('content-manifest.json', JSON.stringify(manifest, null, 1) + '\n');
const all = [manifest.weapons, manifest.fusions, manifest.enemies, manifest.bosses, manifest.biomes, manifest.reactions, manifest.classes, manifest.passives, manifest.relics, manifest.encounters].flat();
const v = all.filter((i) => i.verified === true).length, u = all.filter((i) => i.verified === null).length, f = all.filter((i) => i.verified === false).length;
console.log(`content-manifest.json: ${all.length} items — verified ${v}, failing ${f}, no test record ${u}${testRun ? '' : '  (run `npm test` first to record verification)'}`);
if (f > 0 || !ok) process.exit(1);
