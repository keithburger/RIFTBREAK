/**
 * Seeded headless balance simulations.  npm run balance -- [runs] [mode] [class|all]
 * Prints per-run outcome, pacing checkpoints, boss durations and weapon damage shares.
 */
import { content, validateContent } from '../src/content/registry';
import { Bot, runHeadless, type BotPolicy } from '../src/sim/bot';
import { World } from '../src/sim/world';

const runs = Number(process.argv[2] ?? 4);
const modeId = process.argv[3] ?? 'standard';
const clsArg = process.argv[4] ?? 'all';
const c = content();
const errs = validateContent(c);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
const classes = clsArg === 'all' ? [...c.classes.keys()] : [clsArg];
const policies: BotPolicy[] = ['smart', 'random', 'weapons', 'passives'];
const agg = { won: 0, time: 0, level: 0, n: 0 };
const weaponDmg = new Map<string, number>();
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
  const cls = classes[i % classes.length];
  const w = new World({ content: c, seed: 1000 + i * 7919, classId: cls, modeId });
  const bot = new Bot(policies[i % policies.length], i + 1);
  const marks: string[] = [];
  let nextMark = 300, bossStart = 0;
  const bossDur: string[] = [];
  runHeadless(w, bot, 60 * 40, (ww) => {
    if (ww.time >= nextMark) { marks.push(`${nextMark / 60}m L${ww.player.level} hp${Math.round(ww.player.hp)} en${ww.enemies.length}`); nextMark += 300; }
    if (ww.boss && !bossStart) bossStart = ww.time;
    if (!ww.boss && bossStart) { bossDur.push((ww.time - bossStart).toFixed(0) + 's'); bossStart = 0; }
  });
  agg.n++; agg.time += w.time; agg.level += w.player.level; if (w.state === 'won') agg.won++;
  for (const wi of w.player.weapons) weaponDmg.set(wi.evo?.name ?? wi.def.name, (weaponDmg.get(wi.evo?.name ?? wi.def.name) ?? 0) + wi.dmgDone);
  console.log(`#${i} ${cls}/${bot.policy} ${w.state.toUpperCase()} t=${(w.time / 60).toFixed(1)}m L${w.player.level} kills=${w.stats.kills} bosses=[${w.stats.bosses.length}] bossDur=[${bossDur.join(',')}] react=${w.stats.reactions} dmgTaken=${Math.round(w.stats.dmgTaken)} maxEn=${w.stats.maxEnemies} biome=${w.biomeIdx}${w.boss ? ' @boss:' + w.boss.def.id + ' ' + Math.round((w.boss.hp / w.boss.maxHp) * 100) + '%' : ''}`);
  console.log('   ' + marks.join(' | '));
  console.log('   build: ' + w.player.weapons.map((x) => `${x.evo?.name ?? x.def.name}[${x.rank}] ${(x.dmgDone / 1000).toFixed(0)}k`).join(', '));
}
console.log(`\nwin ${agg.won}/${agg.n}  avgTime ${(agg.time / agg.n / 60).toFixed(1)}m  avgLevel ${(agg.level / agg.n).toFixed(1)}  wall ${((Date.now() - t0) / 1000).toFixed(1)}s`);
