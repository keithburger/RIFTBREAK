/** Headless simulation benchmark: npm run bench -- [enemies] [seconds]. Measures ms per sim step. */
import { content } from '../src/content/registry';
import { Bot } from '../src/sim/bot';
import { ringPos, spawnEnemy } from '../src/sim/entities';
import { World } from '../src/sim/world';

const n = Number(process.argv[2] ?? 500);
const secs = Number(process.argv[3] ?? 20);
const c = content();
const w = new World({ content: c, seed: 777, classId: 'vanguard' });
const bot = new Bot('smart', 1);
w.god = true; w.spawningOff = true;
w.pendingLevels = 40; bot.resolve(w);
const ids = [...c.enemies.values()].filter((d) => d.biome === 0 && d.move[0] !== 'sentry');
const top = (): void => { while (w.enemies.length < n) { const [x, y] = ringPos(w, w.rng.angle(), -200); spawnEnemy(w, ids[w.enemies.length % ids.length], x, y); } };
const times: number[] = [];
for (let i = 0; i < secs * 60; i++) {
  if (i % 15 === 0) top();
  const t = performance.now();
  w.step(bot.input(w));
  times.push(performance.now() - t);
  bot.resolve(w);
}
times.sort((a, b) => a - b);
const avg = times.reduce((s, x) => s + x, 0) / times.length;
console.log(JSON.stringify({ enemies: n, steps: times.length, avgMs: +avg.toFixed(3), p95: +times[Math.floor(times.length * 0.95)].toFixed(3), p99: +times[Math.floor(times.length * 0.99)].toFixed(3), max: +times[times.length - 1].toFixed(2), kills: w.stats.kills, entities: w.entityCount(), budgetPct: +((avg / 16.67) * 100).toFixed(1) }));
