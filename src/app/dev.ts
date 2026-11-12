/**
 * Developer / test controls. Loaded only when the URL contains ?dev — never part of normal play.
 * Exposed as window.__rift for the console, the e2e script and the benchmark.
 */
import { forceBoss, enterBiome, startEncounter } from '../sim/director';
import { spawnEnemy, ringPos } from '../sim/entities';
import { gainXp } from '../sim/player';
import { applyOption, rollOptions, rollRelics } from '../sim/upgrades';
import type { Game } from './game';

export function installDev(game: Game): void {
  game.showPerf = true;
  const api = {
    game,
    get world() { return game.world; },
    /** Start a run with a fixed seed for reproduction. */
    start(classId = 'vanguard', modeId = 'standard', seed = 12345) { game.seedOverride = seed; game.startRun(classId, modeId); },
    spawn(id: string, n = 1, elite = 0) { const w = game.world; if (!w) return; const d = w.content.enemies.get(id); if (!d) return; for (let i = 0; i < n; i++) { const [x, y] = ringPos(w, w.rng.angle(), -200); spawnEnemy(w, d, x, y, elite); } },
    boss(id?: string) { if (game.world) forceBoss(game.world, id); },
    xp(levels = 1) { const w = game.world; if (w) for (let i = 0; i < levels; i++) gainXp(w, w.player.xpNext / w.player.stats.growth + 0.01); },
    /** Auto-pick n level-ups without showing the UI. */
    autoLevel(n = 10) { const w = game.world; if (!w) return; for (let i = 0; i < n; i++) { w.player.level++; applyOption(w, rollOptions(w)[0]); } },
    give(weaponId: string) { const w = game.world; if (w) applyOption(w, { kind: 'weapon', id: weaponId, title: '', tag: '', desc: '', lines: [], icon: '' }); },
    relic() { const w = game.world; if (w) applyOption(w, rollRelics(w)[0]); },
    biome(i: number) { if (game.world) enterBiome(game.world, i); },
    event(id: string) { if (game.world) startEncounter(game.world, id); },
    god(on = true) { if (game.world) game.world.god = on; },
    speed(x = 1) { game.speed = x; },
    kill() { const w = game.world; if (w) { w.player.hp = 0; w.state = 'lost'; } },
    win() { const w = game.world; if (w) w.state = 'won'; },
    /** Dense-combat benchmark: n enemies, strong build, returns frame statistics after `seconds`. */
    async bench(n = 500, seconds = 8) {
      api.start('vanguard', 'standard', 777);
      const w = game.world!;
      w.god = true; w.spawningOff = true;
      api.autoLevel(40);
      w.mode = { ...w.mode, xpMul: 0 }; // no level-up pauses while measuring
      const ids = [...w.content.enemies.values()].filter((d) => d.biome === 0 && d.move[0] !== 'sentry').map((d) => d.id);
      const top = (): void => { while (w.enemies.length < n) api.spawn(ids[w.enemies.length % ids.length], 1); };
      top();
      const timer = setInterval(top, 250);
      await new Promise((r) => setTimeout(r, 1500));
      game.frameMs.length = 0;
      await new Promise((r) => setTimeout(r, seconds * 1000));
      clearInterval(timer);
      const f = game.frameMs.slice().sort((a, b) => a - b);
      const avg = f.reduce((s, x) => s + x, 0) / f.length;
      return { frames: f.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p50: +f[Math.floor(f.length * 0.5)].toFixed(2), p95: +f[Math.floor(f.length * 0.95)].toFixed(2), p99: +f[Math.floor(f.length * 0.99)].toFixed(2), simMs: +game.simMs.toFixed(2), drawMs: +game.renderMs.toFixed(2), enemies: w.enemies.length, sprites: game.renderer.spriteCount, renderer: game.renderer.kind, quality: game.fx.settings.quality };
    },
  };
  (window as unknown as { __rift: typeof api }).__rift = api;
}
