/**
 * Renderer abstraction: a layered immediate-mode sprite batcher. Everything in the game is drawn
 * as tinted atlas sprites, so the PixiJS (WebGL) and Canvas 2D backends share one tiny interface
 * and gameplay code never touches either.
 */
import { Application, Container, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { ATLAS_SCALE, type Atlas, type Frame } from './atlas';

export const L = { GROUND: 0, GLOW: 1, ENT: 2, FX: 3, TOP: 4 } as const;
const LAYERS = 5;
const ADDITIVE = [false, true, false, true, false];

export interface Renderer {
  readonly kind: 'pixi' | 'canvas';
  readonly canvas: HTMLCanvasElement;
  resize(w: number, h: number): void;
  setBackground(index: number): void;
  begin(camX: number, camY: number, zoom: number): void;
  /** Draw an atlas sprite. sx/sy scale the sprite's logical size. */
  sprite(layer: number, key: string, x: number, y: number, rot: number, sx: number, sy: number, tint: number, alpha: number): void;
  end(): void;
  destroy(): void;
  spriteCount: number;
}

export class PixiRenderer implements Renderer {
  readonly kind = 'pixi' as const;
  spriteCount = 0;
  private world = new Container();
  private layers: Container[] = [];
  private pools: Sprite[][] = [];
  private used: number[] = [];
  private prev: number[] = [];
  private tex = new Map<string, Texture>();
  private bgTex: Texture[] = [];
  private bg!: TilingSprite;
  private w = 1;
  private h = 1;

  private constructor(private app: Application, readonly canvas: HTMLCanvasElement, atlas: Atlas) {
    const base = Texture.from(atlas.page);
    for (const [k, f] of atlas.frames) this.tex.set(k, new Texture({ source: base.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
    this.bgTex = atlas.backgrounds.map((c) => Texture.from(c));
    this.bg = new TilingSprite({ texture: this.bgTex[0], width: 16, height: 16 });
    app.stage.addChild(this.bg, this.world);
    for (let i = 0; i < LAYERS; i++) {
      const c = new Container();
      this.layers.push(c);
      this.pools.push([]);
      this.used.push(0);
      this.prev.push(0);
      this.world.addChild(c);
    }
  }

  static async create(canvas: HTMLCanvasElement, atlas: Atlas): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({ canvas, width: canvas.clientWidth || 800, height: canvas.clientHeight || 600, backgroundColor: 0x05070c, antialias: false, autoStart: false, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, preference: 'webgl', powerPreference: 'high-performance' });
    return new PixiRenderer(app, canvas, atlas);
  }

  resize(w: number, h: number): void {
    this.w = w; this.h = h;
    this.app.renderer.resize(w, h);
    this.bg.width = w; this.bg.height = h;
  }
  setBackground(i: number): void { this.bg.texture = this.bgTex[i % this.bgTex.length]; }
  begin(cx: number, cy: number, zoom: number): void {
    this.world.scale.set(zoom);
    this.world.position.set(this.w / 2 - cx * zoom, this.h / 2 - cy * zoom);
    this.bg.tileScale.set(zoom);
    this.bg.tilePosition.set(this.w / 2 - cx * zoom, this.h / 2 - cy * zoom);
    for (let i = 0; i < LAYERS; i++) this.used[i] = 0;
  }
  sprite(layer: number, key: string, x: number, y: number, rot: number, sx: number, sy: number, tint: number, alpha: number): void {
    const t = this.tex.get(key);
    if (!t) return;
    const pool = this.pools[layer];
    const n = this.used[layer]++;
    let s = pool[n];
    if (!s) {
      s = new Sprite(t);
      s.anchor.set(0.5);
      if (ADDITIVE[layer]) s.blendMode = 'add';
      pool.push(s);
      this.layers[layer].addChild(s);
    }
    s.texture = t;
    s.position.set(x, y);
    s.rotation = rot;
    s.scale.set(sx / ATLAS_SCALE, sy / ATLAS_SCALE);
    s.tint = tint;
    s.alpha = alpha;
    s.visible = true;
  }
  end(): void {
    let total = 0;
    for (let i = 0; i < LAYERS; i++) {
      const pool = this.pools[i];
      for (let j = this.used[i]; j < this.prev[i]; j++) pool[j].visible = false;
      this.prev[i] = this.used[i];
      total += this.used[i];
    }
    this.spriteCount = total;
    this.app.renderer.render(this.app.stage);
  }
  destroy(): void { this.app.destroy(false, { children: true, texture: true }); }
}

/** Canvas 2D fallback used when WebGL is unavailable. Same visuals, fewer glow layers upstream. */
export class CanvasRenderer implements Renderer {
  readonly kind = 'canvas' as const;
  spriteCount = 0;
  private ctx: CanvasRenderingContext2D;
  private keys: string[][] = [];
  private nums: number[][] = [];
  private tints = new Map<string, HTMLCanvasElement>();
  private pattern: CanvasPattern | null = null;
  private patterns: (CanvasPattern | null)[] = [];
  private cx = 0; private cy = 0; private zoom = 1; private w = 1; private h = 1; private dpr = 1;

  constructor(readonly canvas: HTMLCanvasElement, private atlas: Atlas) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < LAYERS; i++) { this.keys.push([]); this.nums.push([]); }
    this.patterns = atlas.backgrounds.map((b) => this.ctx.createPattern(b, 'repeat'));
    this.pattern = this.patterns[0];
  }
  resize(w: number, h: number): void {
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
  }
  setBackground(i: number): void { this.pattern = this.patterns[i % this.patterns.length]; }
  begin(cx: number, cy: number, zoom: number): void {
    this.cx = cx; this.cy = cy; this.zoom = zoom;
    for (let i = 0; i < LAYERS; i++) { this.keys[i].length = 0; this.nums[i].length = 0; }
  }
  sprite(layer: number, key: string, x: number, y: number, rot: number, sx: number, sy: number, tint: number, alpha: number): void {
    this.keys[layer].push(key);
    this.nums[layer].push(x, y, rot, sx, sy, tint, alpha);
  }
  private tinted(key: string, f: Frame, tint: number): HTMLCanvasElement {
    const q = tint & 0xf0f0f0;
    const id = key + q;
    let c = this.tints.get(id);
    if (c) return c;
    if (this.tints.size > 900) this.tints.clear();
    c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const g = c.getContext('2d')!;
    g.drawImage(this.atlas.page, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${(q >> 16) & 255},${(q >> 8) & 255},${q & 255})`;
    g.fillRect(0, 0, f.w, f.h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.atlas.page, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    this.tints.set(id, c);
    return c;
  }
  end(): void {
    const c = this.ctx, z = this.zoom * this.dpr;
    const ox = (this.w / 2) * this.dpr - this.cx * z, oy = (this.h / 2) * this.dpr - this.cy * z;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    if (this.pattern) {
      c.setTransform(z, 0, 0, z, ox, oy);
      c.fillStyle = this.pattern;
      c.fillRect(this.cx - this.w / this.zoom, this.cy - this.h / this.zoom, (this.w * 2) / this.zoom, (this.h * 2) / this.zoom);
    } else { c.fillStyle = '#05070c'; c.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    let total = 0;
    const page = this.atlas.page, frames = this.atlas.frames, inv = 1 / ATLAS_SCALE;
    for (let l = 0; l < LAYERS; l++) {
      c.globalCompositeOperation = ADDITIVE[l] ? 'lighter' : 'source-over';
      const ks = this.keys[l], ns = this.nums[l];
      total += ks.length;
      for (let i = 0, j = 0; i < ks.length; i++, j += 7) {
        const f = frames.get(ks[i]);
        if (!f) continue;
        const x = ns[j], y = ns[j + 1], rot = ns[j + 2], sx = ns[j + 3] * inv, sy = ns[j + 4] * inv, tint = ns[j + 5];
        c.globalAlpha = ns[j + 6] < 0 ? 0 : ns[j + 6] > 1 ? 1 : ns[j + 6];
        if (rot === 0) c.setTransform(z * sx, 0, 0, z * sy, ox + x * z, oy + y * z);
        else { const co = Math.cos(rot), si = Math.sin(rot); c.setTransform(co * z * sx, si * z * sx, -si * z * sy, co * z * sy, ox + x * z, oy + y * z); }
        if (tint === 0xffffff) c.drawImage(page, f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
        else c.drawImage(this.tinted(ks[i], f, tint), -f.w / 2, -f.h / 2);
      }
    }
    this.spriteCount = total;
  }
  destroy(): void { this.tints.clear(); }
}

/** Try WebGL via PixiJS; fall back to Canvas 2D if it is unavailable or initialisation throws. */
export async function createRenderer(canvas: HTMLCanvasElement, atlas: Atlas, force?: string | null): Promise<Renderer> {
  if (force !== 'canvas') {
    try {
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2') && !probe.getContext('webgl')) throw new Error('WebGL unavailable');
      return await PixiRenderer.create(canvas, atlas);
    } catch (err) {
      console.warn('[riftbreak] WebGL renderer failed, using Canvas 2D fallback:', err);
      const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(fresh);
      canvas = fresh;
    }
  }
  return new CanvasRenderer(canvas, atlas);
}

/** Convenience primitives built from sprites. */
export class Draw {
  constructor(public r: Renderer) {}
  line(layer: number, x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha: number, soft = false): void {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    if (soft) this.r.sprite(layer, 'beam', (x1 + x2) / 2, (y1 + y2) / 2, Math.atan2(dy, dx), len / 16, width / 14, color, alpha);
    else this.r.sprite(layer, 'px', (x1 + x2) / 2, (y1 + y2) / 2, Math.atan2(dy, dx), len / 4, width / 4, color, alpha);
  }
  circle(layer: number, key: 'disc' | 'ring' | 'ring2' | 'pool' | 'glow' | 'soft' | 'dash_ring' | 'swirl', x: number, y: number, r: number, color: number, alpha: number, rot = 0): void {
    const ref = key === 'disc' ? 31 : key === 'ring' ? 61 : key === 'ring2' ? 56 : key === 'pool' ? 63 : key === 'glow' ? 48 : key === 'soft' ? 32 : 60;
    this.r.sprite(layer, key, x, y, rot, r / ref, r / ref, color, alpha);
  }
  text(layer: number, s: string, x: number, y: number, size: number, color: number, alpha: number): void {
    const sc = size / 22, adv = size * 0.6;
    let px = x - ((s.length - 1) * adv) / 2;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch !== ' ') this.r.sprite(layer, 'g_' + ch, px, y, 0, sc, sc, color, alpha);
      px += adv;
    }
  }
}
