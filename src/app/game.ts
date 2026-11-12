/** Application lifecycle: owns the loop and wires simulation, rendering, audio, input, UI and save. */
import { AudioSys } from '../audio/audio';
import { content } from '../content/registry';
import { Input } from '../input/input';
import { buildAtlas, type Atlas } from '../render/atlas';
import { FxSystem } from '../render/effects';
import { Draw, createRenderer, type Renderer } from '../render/renderer';
import { drawScene, type View } from '../render/scene';
import { SaveStore, browserStorage } from '../save/save';
import { Bot } from '../sim/bot';
import type { ContentDB, OptionDef } from '../sim/types';
import { applyOption, rollOptions, rollRelics } from '../sim/upgrades';
import { STEP, World } from '../sim/world';
import { UI, type UIHost } from '../ui/ui';

type State = 'menu' | 'run' | 'pause' | 'choice' | 'end';

export class Game implements UIHost {
  content: ContentDB;
  atlas!: Atlas;
  renderer!: Renderer;
  draw!: Draw;
  fx = new FxSystem();
  audio = new AudioSys();
  input!: Input;
  save: SaveStore;
  ui!: UI;
  world: World | null = null;
  state: State = 'menu';
  speed = 1;
  seedOverride: number | null = null;
  showPerf = false;
  frameMs: number[] = [];
  simMs = 0;
  renderMs = 0;
  private attract: World | null = null;
  private bot = new Bot('smart', 3);
  private view: View = { x: 0, y: 0, zoom: 1, w: 800, h: 600 };
  private acc = 0;
  private last = 0;
  private frame = 0;
  private ema = 16;
  private qTimer = 0;
  private autoQ = 2;
  private run = { classId: 'vanguard', modeId: 'standard' };
  private musicKey = '';
  private raf = 0;
  private rebindCb: ((code: string) => void) | null = null;

  get rendererKind(): string { return this.renderer.kind; }

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLElement) {
    this.content = content();
    this.save = new SaveStore(browserStorage());
  }

  async init(forceRenderer?: string | null): Promise<void> {
    this.atlas = buildAtlas(this.content);
    this.renderer = await createRenderer(this.canvas, this.atlas, forceRenderer);
    this.canvas = this.renderer.canvas;
    this.draw = new Draw(this.renderer);
    this.input = new Input(this.save.data.settings.keys, this.canvas);
    this.ui = new UI(this.uiRoot, this);
    this.fx.onSfx = (n) => { if (this.state !== 'menu') this.audio.play(n); };
    this.fx.onBanner = (t, s, c) => { if (this.state !== 'menu') this.ui.banner(t, s, c); };
    this.input.onPause = () => this.pauseToggle();
    this.input.onKey = (code) => { if (this.rebindCb) { const cb = this.rebindCb; this.rebindCb = null; cb(code); } };
    this.input.onJoy = (j) => { this.ui.joystick(this.state === 'run' ? j : null); if (this.input.touchSeen) this.ui.setTouch(true); };
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', () => { this.ui.setTouch(true); unlock(); }, { passive: true });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'run') this.pauseToggle(); });
    this.applySettings();
    this.resize();
    this.toMenu();
    this.last = performance.now();
    const loop = (now: number): void => { this.raf = requestAnimationFrame(loop); this.tick(now); };
    this.raf = requestAnimationFrame(loop);
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.view.w = w; this.view.h = h;
    this.view.zoom = Math.max(0.45, Math.min(2, Math.sqrt(w * h) / 900));
    this.renderer.resize(w, h);
    const ww = this.world ?? this.attract;
    if (ww) ww.view = { w: w / this.view.zoom, h: h / this.view.zoom };
  }

  applySettings(): void {
    const s = this.save.data.settings;
    this.audio.setVolumes(s.master, s.sfx, s.music);
    this.fx.settings.shake = s.shake;
    this.fx.settings.flash = s.reduceFlash ? 0.25 : 1;
    this.fx.settings.dmgNumbers = s.dmgNumbers;
    this.fx.settings.quality = s.quality < 0 ? this.autoQ : s.quality;
    if (this.renderer.kind === 'canvas') this.fx.settings.quality = Math.min(1, this.fx.settings.quality);
    this.input.keys = s.keys;
  }

  sfx(name: string): void { this.audio.play(name); }
  dash(): void { this.input.pressDash(); }
  rebind(_action: string, done: (code: string) => void): void { this.rebindCb = done; }

  private newWorld(classId: string, modeId: string, seed: number): World {
    const w = new World({ content: this.content, seed, classId, modeId, metaRanks: this.save.data.meta, fx: this.fx, view: { w: this.view.w / this.view.zoom, h: this.view.h / this.view.zoom } });
    this.view.x = w.player.x; this.view.y = w.player.y;
    return w;
  }

  toMenu(): void {
    this.state = 'menu';
    this.world = null;
    this.fx.clear();
    const classes = [...this.content.classes.keys()];
    this.attract = this.newWorld(classes[Math.floor(Math.random() * classes.length)], 'standard', (Math.random() * 1e9) | 0);
    this.attract.god = true;
    this.attract.time = 200; // start the backdrop mid-action
    this.attract.biomeT = 200;
    this.attract.pendingLevels = 9;
    this.bot.resolve(this.attract);
    this.renderer.setBackground(0);
    this.audio.setMusic({ root: 45, scale: [0, 3, 5, 7, 10], tempo: 84 }, 0);
    this.musicKey = 'menu';
    this.ui.showMenu();
  }
  quitToMenu(): void { this.toMenu(); }

  startRun(classId: string, modeId: string): void {
    this.run = { classId, modeId };
    this.attract = null;
    this.fx.clear();
    this.world = this.newWorld(classId, modeId, this.seedOverride ?? ((Date.now() ^ (Math.random() * 1e9)) >>> 0));
    this.state = 'run';
    this.acc = 0;
    this.input.reset();
    this.ui.closeScreens();
    this.ui.closeOverlay();
    this.ui.showHud();
    this.musicKey = '';
    const w = this.world;
    this.fx.banner(w.biome.name.toUpperCase(), w.mode.name, w.biome.pal.accent);
    this.save.data.stats.runs++;
    this.save.save();
  }
  restart(): void { this.startRun(this.run.classId, this.run.modeId); }

  pauseToggle(): void {
    if (this.state === 'run' && this.world) { this.state = 'pause'; this.input.reset(); this.ui.showPause(this.world); }
    else if (this.state === 'pause') this.resume();
  }
  resume(): void {
    if (this.state !== 'pause') return;
    this.ui.closeOverlay();
    this.input.reset();
    this.state = 'run';
    this.last = performance.now();
  }

  private openChoice(relic: boolean): void {
    const w = this.world!;
    this.state = 'choice';
    this.input.reset();
    const opts = relic ? rollRelics(w) : rollOptions(w);
    this.audio.play(relic ? 'chest' : 'levelup');
    this.ui.showChoice(relic ? 'Relic Found' : 'Level Up', relic ? 'Choose one — it lasts the whole run' : `Level ${w.player.level - w.pendingLevels + 1} · choose an upgrade`, opts, (o: OptionDef) => {
      if (relic) w.pendingRelics--; else w.pendingLevels--;
      applyOption(w, o);
      const seen = this.save.data.seen;
      if ((o.kind === 'weapon' || o.kind === 'fusion') && !seen.weapons.includes(o.id)) seen.weapons.push(o.id);
      if (o.kind === 'relic' && !seen.relics.includes(o.id)) seen.relics.push(o.id);
      this.input.reset();
      this.state = 'run';
      this.last = performance.now();
    });
  }

  private endRun(): void {
    const w = this.world!;
    this.state = 'end';
    this.input.reset();
    const st = this.save.data.stats;
    const won = w.state === 'won';
    const unlocked: string[] = [];
    let shards = Math.floor(w.stats.shards + (w.time / 60) * 2 + (won ? 50 : 0));
    for (const id of w.stats.bosses) {
      if (!st.bossKills[id]) { shards += 25; unlocked.push(`First defeat: ${this.content.bosses.get(id)!.name} (+25 shards)`); }
      st.bossKills[id] = (st.bossKills[id] ?? 0) + 1;
      shards += 15;
    }
    if (won) {
      st.wins++;
      if (!st.modeWins[w.mode.id]) { shards += 40; unlocked.push(`First clear: ${w.mode.name} (+40 shards)`); }
      st.modeWins[w.mode.id] = (st.modeWins[w.mode.id] ?? 0) + 1;
      if (w.mode.kind === 'standard' && (st.bestTime === 0 || w.time < st.bestTime)) st.bestTime = w.time;
    }
    if (w.mode.kind === 'endless') st.bestEndless = Math.max(st.bestEndless, w.time);
    st.kills += w.stats.kills;
    this.save.data.shards += shards;
    this.save.save();
    this.audio.setMusic(null);
    this.ui.showEnd({ won, mode: `${w.player.cls.name} · ${w.mode.name}`, time: w.time, level: w.player.level, kills: w.stats.kills, bosses: w.stats.bosses.length, shards, reactions: w.stats.reactions, weapons: this.ui.weaponRows(w.player.weapons), unlocked });
  }

  private tick(now: number): void {
    const raw = now - this.last;
    this.last = now;
    const dt = Math.min(0.1, raw / 1000);
    this.frame++;
    this.ema += (raw - this.ema) * 0.05;
    if (this.frameMs.length < 20000) this.frameMs.push(raw);
    const w = this.world;
    const t0 = performance.now();
    if (this.state === 'run' && w) {
      this.acc += dt * this.speed;
      let steps = 0;
      const max = 6 * Math.max(1, this.speed);
      while (this.acc >= STEP && steps < max) {
        w.step(this.input.sample());
        this.acc -= STEP;
        steps++;
        if (w.state !== 'play') { this.endRun(); break; }
        if (w.pendingLevels > 0) { this.openChoice(false); break; }
        if (w.pendingRelics > 0) { this.openChoice(true); break; }
      }
      if (steps >= max) this.acc = 0;
    } else if (this.state === 'menu' && this.attract) {
      const a = this.attract;
      a.step(this.bot.input(a));
      this.bot.resolve(a);
      if (a.time > 285 || a.state !== 'play') { a.time = 200; a.biomeT = 200; }
    }
    if (this.state === 'run' || this.state === 'menu') this.fx.update(dt);
    const t1 = performance.now();
    this.render(now / 1000, dt);
    const t2 = performance.now();
    this.simMs += (t1 - t0 - this.simMs) * 0.05;
    this.renderMs += (t2 - t1 - this.renderMs) * 0.05;
    if (this.state === 'run' && w) {
      if (this.frame % 4 === 0) this.ui.updateHud(w);
      const key = w.biome.id + (w.boss ? 'B' : '');
      if (key !== this.musicKey) { this.musicKey = key; this.renderer.setBackground(w.biomeIdx); this.audio.setMusic(w.biome.music, w.boss ? 1 : 0); }
      if (this.showPerf && this.frame % 20 === 0) this.ui.setPerf(`${(1000 / this.ema).toFixed(0)} fps  ${this.ema.toFixed(1)} ms (sim ${this.simMs.toFixed(1)} draw ${this.renderMs.toFixed(1)})  enemies ${w.enemies.length}  sprites ${this.renderer.spriteCount}  q${this.fx.settings.quality}  ${this.renderer.kind}`);
    }
    this.ui.flash(this.fx.flashCol, this.fx.flashA);
    // adaptive quality: shed decorative effects first, never simulation
    this.qTimer += dt;
    if (this.qTimer > 2 && this.save.data.settings.quality < 0 && this.state === 'run') {
      this.qTimer = 0;
      const cap = this.renderer.kind === 'canvas' ? 1 : 3;
      if (this.ema > 24 && this.autoQ > 0) this.autoQ--;
      else if (this.ema < 14 && this.autoQ < cap) this.autoQ++;
      this.fx.settings.quality = Math.min(cap, this.autoQ);
    }
  }

  private render(t: number, dt: number): void {
    const w = this.world ?? this.attract;
    if (!w) return;
    const v = this.view, p = w.player;
    const k = 1 - Math.exp(-10 * dt);
    v.x += (p.x + p.vx * 0.12 - v.x) * k;
    v.y += (p.y + p.vy * 0.12 - v.y) * k;
    const hw = v.w / v.zoom / 2 + 120, hh = v.h / v.zoom / 2 + 120;
    this.fx.view.x0 = v.x - hw; this.fx.view.x1 = v.x + hw; this.fx.view.y0 = v.y - hh; this.fx.view.y1 = v.y + hh;
    const cx = v.x + this.fx.shakeX, cy = v.y + this.fx.shakeY;
    this.renderer.begin(cx, cy, v.zoom);
    drawScene(this.draw, w, this.fx, { ...v, x: cx, y: cy }, t);
    this.renderer.end();
  }

  destroy(): void { cancelAnimationFrame(this.raf); this.input.destroy(); this.audio.destroy(); this.renderer.destroy(); }
}
