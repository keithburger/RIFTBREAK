/** DOM user interface: menus, HUD and overlays. Talks to the game only through UIHost. */
import { TOKENS, clampTravel } from '../core/tokens';
import './styles.css';
import { applyTheme } from './theme';
import type { Atlas } from '../render/atlas';
import { DEFAULT_KEYS, type SaveStore } from '../save/save';
import type { ContentDB, ElementId, OptionDef, WeaponDef, WeaponInst } from '../sim/types';
import type { World } from '../sim/world';

export interface UIHost {
  content: ContentDB;
  atlas: Atlas;
  save: SaveStore;
  rendererKind: string;
  sfx(name: string): void;
  startRun(classId: string, modeId: string): void;
  resume(): void;
  quitToMenu(): void;
  restart(): void;
  applySettings(): void;
  pauseToggle(): void;
  dash(): void;
  rebind(action: string, done: (code: string) => void): void;
}
export interface EndInfo { won: boolean; mode: string; time: number; level: number; kills: number; bosses: number; shards: number; reactions: number; weapons: { name: string; icon: string; col: number; dmg: number }[]; unlocked: string[] }

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string): string => s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!);
const fmtTime = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmtNum = (n: number): string => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : String(Math.round(n)));
const KEYNAME = (c: string): string => c.replace('Key', '').replace('Digit', '').replace('Arrow', '↑ '.slice(0, 0) + 'Arrow ');

export class UI {
  private root: HTMLElement;
  private screen: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private hud: HTMLElement | null = null;
  private hudRefs: Record<string, HTMLElement> = {};
  private hudKey = '';
  private selClass: string;
  private selMode = 'standard';
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private joyEl: HTMLElement;
  overlayOpen = false;

  constructor(root: HTMLElement, private host: UIHost) {
    this.root = root;
    applyTheme();
    this.selClass = host.save.data.classes[0] ?? 'vanguard';
    this.joyEl = this.el('div', 'joy', '<i></i>');
    this.joyEl.setAttribute('aria-hidden', 'true');
    root.appendChild(this.joyEl);
  }

  private el(tag: string, cls: string, html = ''): HTMLElement {
    const e = document.createElement(tag);
    e.className = cls;
    e.innerHTML = html;
    return e;
  }
  private btn(label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = this.el('button', cls, label) as HTMLButtonElement;
    b.addEventListener('click', () => { this.host.sfx('click'); fn(); });
    return b;
  }
  private elCol(el?: ElementId): number { return el ? this.host.content.elements.get(el)!.col : 0x6ad8ff; }
  private icon(o: { icon: string; el?: ElementId; kind?: string }): string {
    if (o.icon.startsWith('p_')) return this.host.atlas.icon(o.icon, 0xffffff, this.elCol(o.el));
    return this.host.atlas.icon(o.icon);
  }
  private weaponIcon(d: WeaponDef): string { return this.host.atlas.icon(d.base.sprite ?? 'p_bolt', 0xffffff, this.elCol(d.el)); }

  private setScreen(e: HTMLElement | null): void {
    this.screen?.remove();
    this.screen = e;
    if (e) this.root.appendChild(e);
  }
  private setOverlay(e: HTMLElement | null): void {
    this.overlay?.remove();
    this.overlay = e;
    this.overlayOpen = !!e;
    this.joyVis();
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler); this.keyHandler = null; }
    if (e) this.root.appendChild(e);
  }
  closeOverlay(): void { this.setOverlay(null); }
  closeScreens(): void { this.setScreen(null); }

  // ------------------------------------------------------------------------------------ menus
  showMenu(): void {
    this.setOverlay(null);
    this.hideHud();
    const s = this.el('div', 'screen home', `<div class="logo">RIFTBREAK</div><div class="tagline">Seal the rift &nbsp;·&nbsp; Become the storm</div>`);
    const m = this.el('div', 'menu');
    m.append(
      this.btn('Play', 'btn primary', () => this.showSelect()),
      this.btn('Armory', 'btn', () => this.showArmory()),
      this.btn('Codex', 'btn', () => this.showCodex('weapons')),
      this.btn('Settings', 'btn', () => this.showSettings(() => this.showMenu())),
    );
    s.append(m);
    const st = this.host.save.data;
    s.append(this.el('div', 'foot', `<span class="shards">${Math.floor(st.shards)}</span> &nbsp;·&nbsp; Runs ${st.stats.runs} &nbsp;·&nbsp; Wins ${st.stats.wins} &nbsp;·&nbsp; Best ${st.stats.bestTime ? fmtTime(st.stats.bestTime) : '—'}<br><br>WASD / arrows to move · Space to dash · Esc to pause · weapons fire automatically`));
    this.setScreen(s);
  }

  private topbar(title: string, back: () => void): HTMLElement {
    const t = this.el('div', 'topbar', `<h2>${title}</h2><span class="shards" data-shards>${Math.floor(this.host.save.data.shards)}</span>`);
    t.prepend(this.btn('← Back', 'btn small', back));
    return t;
  }

  showSelect(): void {
    const c = this.host.content, sv = this.host.save;
    const s = this.el('div', 'screen');
    s.append(this.topbar('Choose your operative', () => this.showMenu()));
    const chips = this.el('div', 'chips');
    const desc = this.el('div', 'modedesc');
    for (const m of c.modes.values()) {
      const b = this.btn(m.name, 'chip' + (m.id === this.selMode ? ' sel' : ''), () => { this.selMode = m.id; this.showSelect(); });
      b.dataset.mode = m.id;
      chips.append(b);
    }
    desc.textContent = c.modes.get(this.selMode)!.desc;
    s.append(chips, desc);
    const g = this.el('div', 'grid');
    if (!sv.data.classes.includes(this.selClass)) this.selClass = sv.data.classes[0];
    for (const k of c.classes.values()) {
      const owned = sv.data.classes.includes(k.id);
      const w = c.weapons.get(k.weapon)!;
      const card = this.el('button', 'card' + (k.id === this.selClass ? ' sel' : '') + (owned ? '' : ' locked'), `<img src="${this.host.atlas.icon('pl_' + k.id, 0xffffff, k.col)}" alt=""><div><b>${esc(k.name)}</b><small>${esc(k.desc)}</small><em>${esc(k.trait)}</em><small>Starts with ${esc(w.name)}</small>${owned ? '' : `<em>🔒 Unlock for ◆ ${k.cost}</em>`}</div>`);
      card.style.setProperty('--c', hex(k.col));
      card.dataset.cls = k.id;
      card.addEventListener('click', () => {
        if (owned) { this.selClass = k.id; this.host.sfx('click'); this.showSelect(); }
        else if (sv.data.shards >= k.cost) { sv.data.shards -= k.cost; sv.data.classes.push(k.id); sv.save(); this.selClass = k.id; this.host.sfx('relic'); this.showSelect(); }
        else this.host.sfx('hurt');
      });
      g.append(card);
    }
    s.append(g);
    const row = this.el('div', 'row');
    row.style.marginTop = '16px';
    const go = this.btn('Enter the Rift', 'btn primary', () => this.host.startRun(this.selClass, this.selMode));
    go.id = 'start-run';
    row.append(go);
    s.append(row);
    this.setScreen(s);
  }

  showArmory(): void {
    const sv = this.host.save;
    const s = this.el('div', 'screen');
    s.append(this.topbar('Armory', () => this.showMenu()));
    const g = this.el('div', 'grid');
    for (const m of this.host.content.meta) {
      const rank = sv.data.meta[m.id] ?? 0;
      const cost = m.cost * (rank + 1);
      const maxed = rank >= m.max;
      const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      const card = this.el('button', 'card' + (maxed ? ' sel' : ''), `<div><b>${esc(m.name)}</b><small>${esc(m.desc)}</small><div class="pips">${pips}</div><em>${maxed ? 'MAXED' : '◆ ' + cost}</em></div>`);
      card.style.setProperty('--c', '#c77dff');
      card.addEventListener('click', () => {
        if (maxed || sv.data.shards < cost) { this.host.sfx('hurt'); return; }
        sv.data.shards -= cost; sv.data.meta[m.id] = rank + 1; sv.save(); this.host.sfx('relic'); this.showArmory();
      });
      g.append(card);
    }
    s.append(g, this.el('div', 'foot', 'Permanent upgrades apply to every run.'));
    this.setScreen(s);
  }

  showCodex(tab: string): void {
    const c = this.host.content, a = this.host.atlas;
    const s = this.el('div', 'screen');
    s.append(this.topbar('Codex', () => this.showMenu()));
    const tabs = this.el('div', 'tabs');
    for (const t of ['weapons', 'fusions', 'enemies', 'bosses', 'reactions', 'relics', 'passives'])
      tabs.append(this.btn(t, 'chip' + (t === tab ? ' sel' : ''), () => this.showCodex(t)));
    s.append(tabs);
    const g = this.el('div', 'grid');
    const add = (img: string, col: number, title: string, body: string, extra = ''): void => {
      const d = this.el('div', 'card', `<img src="${img}" alt=""><div><b>${esc(title)}</b><small>${esc(body)}</small>${extra}</div>`);
      d.style.setProperty('--c', hex(col));
      g.append(d);
    };
    if (tab === 'weapons') for (const w of c.weapons.values()) { if (w.fusion) continue; add(this.weaponIcon(w), this.elCol(w.el), w.name, w.desc, w.evos.map((e) => `<em>◈ ${esc(e.name)} — needs ${esc(c.passives.get(e.needs)!.name)}</em><small>${esc(e.desc)}</small>`).join('')); }
    else if (tab === 'fusions') for (const f of c.fusions) add(this.weaponIcon(f), this.elCol(f.el), f.name, f.desc, `<em>${esc(c.weapons.get(f.fusion![0])!.name)} + ${esc(c.weapons.get(f.fusion![1])!.name)}</em><small>Both at max rank · ${f.el} / ${f.base.el2}</small>`);
    else if (tab === 'enemies') for (const e of c.enemies.values()) add(a.icon('e_' + e.id), e.col, e.name, e.desc, `<em>${esc(c.biomes[e.biome].name)}</em>`);
    else if (tab === 'bosses') for (const b of c.bosses.values()) add(a.icon('boss_' + b.id), b.col, b.name, b.desc, `<em>${esc(b.title)} · ${esc(c.biomes[b.biome].name)}</em><small>Defeated ${this.host.save.data.stats.bossKills[b.id] ?? 0}×</small>`);
    else if (tab === 'reactions') for (const r of c.reactions.values()) add(a.icon('p_ring', r.col), r.col, r.name, r.desc, `<em>${r.a} + ${r.b}</em>`);
    else if (tab === 'relics') for (const r of c.relics.values()) add(a.icon('r_' + r.id), [0, 0x8ad8ff, 0xc77dff, 0xffd24a][r.rarity], r.name, r.desc);
    else for (const p of c.passives.values()) add(a.icon('i_' + p.id), 0x6ad8ff, p.name, p.desc, `<small>Max rank ${p.max}</small>`);
    s.append(g);
    this.setScreen(s);
  }

  showSettings(back: () => void, asOverlay = false): void {
    const sv = this.host.save, st = sv.data.settings;
    const s = this.el('div', asOverlay ? 'overlay' : 'screen');
    s.append(this.topbar('Settings', back));
    const box = this.el('div', 'settings');
    const changed = (): void => { sv.save(); this.host.applySettings(); };
    const range = (label: string, key: 'master' | 'sfx' | 'music' | 'shake'): void => {
      const l = this.el('label', '', `<span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${st[key]}">`);
      l.querySelector('input')!.addEventListener('input', (e) => { st[key] = Number((e.target as HTMLInputElement).value); changed(); });
      box.append(l);
    };
    const check = (label: string, key: 'reduceFlash' | 'dmgNumbers'): void => {
      const l = this.el('label', '', `<span>${label}</span><input type="checkbox" ${st[key] ? 'checked' : ''}>`);
      l.querySelector('input')!.addEventListener('change', (e) => { st[key] = (e.target as HTMLInputElement).checked; changed(); });
      box.append(l);
    };
    range('Master volume', 'master'); range('Effects volume', 'sfx'); range('Music volume', 'music'); range('Screen shake', 'shake');
    check('Reduce flashes', 'reduceFlash'); check('Damage numbers', 'dmgNumbers');
    const ql = this.el('label', '', `<span>Graphics quality</span><select>${[['-1', 'Auto'], ['0', 'Low'], ['1', 'Medium'], ['2', 'High'], ['3', 'Ultra']].map(([v, n]) => `<option value="${v}" ${String(st.quality) === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`);
    ql.querySelector('select')!.addEventListener('change', (e) => { st.quality = Number((e.target as HTMLSelectElement).value); changed(); });
    box.append(ql);
    for (const action of Object.keys(DEFAULT_KEYS)) {
      const l = this.el('label', '', `<span>Key: ${action}</span>`);
      const b = this.el('button', 'keybtn', KEYNAME(st.keys[action]));
      b.addEventListener('click', () => { b.classList.add('wait'); b.textContent = 'press a key'; this.host.rebind(action, (code) => { st.keys[action] = code; b.classList.remove('wait'); b.textContent = KEYNAME(code); changed(); }); });
      l.append(b);
      box.append(l);
    }
    box.append(this.el('label', '', `<span>Renderer</span><span>${this.host.rendererKind === 'pixi' ? 'WebGL (PixiJS)' : 'Canvas 2D fallback'}</span>`));
    if (!asOverlay) {
      const reset = this.btn('Reset all progress', 'btn small', () => { if (confirm('Erase all RIFTBREAK progress?')) { sv.reset(); this.host.applySettings(); this.showMenu(); } });
      box.append(reset);
    }
    s.append(box);
    if (asOverlay) this.setOverlay(s); else this.setScreen(s);
  }

  // ------------------------------------------------------------------------------------ HUD
  showHud(): void {
    this.hideHud();
    const h = this.el('div', 'hud', `
      <div class="vig"></div><div class="lowhp" data-r="lowhp"></div><div class="flash" data-r="flash"></div>
      <div class="xpbar"><i data-r="xp"></i></div>
      <div class="hud-tl"><div class="hpbar"><i data-r="hp"></i><span data-r="hptxt"></span></div><div class="lvl">LV <b data-r="lvl">1</b></div></div>
      <div class="hud-tc"><div class="timer" data-r="timer">0:00</div><div class="biome" data-r="biome"></div>
        <div class="bossbar" data-r="boss"><div class="name" data-r="bossname"></div><div class="bar"><i data-r="bosshp"></i><span data-r="bossmarks"></span></div></div></div>
      <div class="hud-tr"><div class="k"><div>☠ <span data-r="kills">0</span></div><div class="shards" data-r="shards">0</div></div><button class="pausebtn" data-r="pause" aria-label="Pause">❚❚</button></div>
      <div class="hud-bl"><div class="slots" data-r="relics"></div><div class="slots" data-r="passives"></div><div class="slots" data-r="weapons"></div></div>
      <div class="banner" data-r="banner"><b></b><span></span></div>
      <button class="dashbtn" data-r="dash">DASH</button>
      <div class="perf" data-r="perf"></div>`);
    h.querySelectorAll<HTMLElement>('[data-r]').forEach((e) => (this.hudRefs[e.dataset.r!] = e));
    this.hudRefs.pause.addEventListener('click', () => this.host.pauseToggle());
    const dash = this.hudRefs.dash;
    dash.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.host.dash(); }, { passive: false });
    dash.addEventListener('mousedown', () => this.host.dash());
    this.hud = h;
    this.joyVis();
    this.hudKey = '';
    this.root.prepend(h);
  }
  hideHud(): void { this.hud?.remove(); this.hud = null; this.joyVis(); }
  private joyVis(): void { this.joyEl.classList.toggle('live', !!this.hud && !this.overlayOpen); }
  setTouch(on: boolean): void { this.root.classList.toggle('touch', on); }

  updateHud(w: World): void {
    const r = this.hudRefs, p = w.player;
    if (!this.hud) return;
    const hpf = Math.max(0, p.hp / p.stats.maxHp);
    r.hp.style.width = hpf * 100 + '%';
    r.hptxt.textContent = `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`;
    r.lowhp.style.opacity = hpf < 0.3 ? String(1 - hpf / 0.3) : '0';
    r.xp.style.width = Math.min(100, (p.xp / p.xpNext) * 100) + '%';
    r.lvl.textContent = String(p.level);
    r.timer.textContent = fmtTime(w.time);
    r.biome.textContent = w.biome.name + (w.cycle ? ` · loop ${w.cycle + 1}` : '');
    r.kills.textContent = fmtNum(w.stats.kills);
    r.shards.textContent = String(Math.floor(w.stats.shards));
    r.dash.classList.toggle('cd', p.dashes <= 0);
    const b = w.boss;
    if (b && b.boss) {
      if (!r.boss.classList.contains('on')) {
        r.boss.classList.add('on');
        r.boss.style.setProperty('--c', hex(b.boss.def.col));
        r.bossname.textContent = b.boss.def.name;
        r.bossmarks.innerHTML = b.boss.def.phases.map((f) => `<u style="left:${f * 100}%"></u>`).join('');
      }
      r.bosshp.style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
    } else r.boss.classList.remove('on');
    const key = p.weapons.map((x) => x.def.id + x.rank + (x.evo?.id ?? '')).join() + '|' + [...p.passives].join() + '|' + p.relics.join();
    if (key !== this.hudKey) {
      this.hudKey = key;
      r.weapons.innerHTML = p.weapons.map((x) => `<div class="slot" style="--c:${hex(x.evo || x.def.fusion ? 0xffd24a : this.elCol(x.def.el))}" title="${esc(x.evo?.name ?? x.def.name)}"><img src="${this.weaponIcon(x.def)}" alt=""><span>${x.evo ? '★' : x.def.fusion ? '◈' + x.rank : x.rank}</span></div>`).join('');
      r.passives.innerHTML = [...p.passives].map(([id, rk]) => `<div class="slot sm" title="${esc(this.host.content.passives.get(id)!.name)}"><img src="${this.host.atlas.icon('i_' + id)}" alt=""><span>${rk}</span></div>`).join('');
      r.relics.innerHTML = p.relics.map((id) => `<div class="slot sm" title="${esc(this.host.content.relics.get(id)!.name)}"><img src="${this.host.atlas.icon('r_' + id)}" alt=""></div>`).join('');
    }
  }
  setPerf(s: string): void { if (this.hudRefs.perf) this.hudRefs.perf.textContent = s; }

  banner(title: string, sub: string, color: number): void {
    const b = this.hudRefs.banner;
    if (!b || !this.hud) return;
    b.style.setProperty('--c', hex(color));
    b.children[0].textContent = title;
    b.children[1].textContent = sub;
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
  }
  flash(color: number, a: number): void {
    const f = this.hudRefs.flash;
    if (!f || !this.hud) return;
    f.style.background = hex(color);
    f.style.opacity = String(Math.min(0.6, a));
  }
  /** Fixed joystick base centre (client px) – null unless the stick is on screen. */
  joyBase(): { x: number; y: number; travel: number } | null {
    if (!this.hud || this.overlayOpen || !this.root.classList.contains('touch')) return null;
    const r = this.joyEl.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, travel: clampTravel(TOKENS.joystick.travel) };
  }
  /** Thumb offset from the base centre (already clamped by Input), or null = recentre instantly. */
  joystick(j: { x: number; y: number; active: boolean } | null): void {
    const thumb = this.joyEl.firstElementChild as HTMLElement;
    this.joyEl.classList.toggle('on', !!j);
    thumb.style.transform = j ? `translate(${j.x.toFixed(1)}px, ${j.y.toFixed(1)}px)` : 'translate(0px, 0px)';
  }

  // ------------------------------------------------------------------------------------ overlays
  /** Upgrade / relic choice. Cards ignore input briefly so held movement can't mis-select. */
  showChoice(title: string, sub: string, opts: OptionDef[], pick: (o: OptionDef) => void): void {
    const o = this.el('div', 'overlay');
    o.append(this.el('h2', '', title), this.el('div', 'sub', sub));
    const box = this.el('div', 'choices wait');
    let ready = false;
    const choose = (opt: OptionDef): void => { if (!ready) return; ready = false; this.host.sfx('select'); this.setOverlay(null); pick(opt); };
    opts.forEach((opt, i) => {
      const col = opt.kind === 'relic' ? [0, 0x8ad8ff, 0xc77dff, 0xffd24a][opt.rank ?? 1] : opt.kind === 'evo' || opt.kind === 'fusion' ? 0xffd24a : opt.el ? this.elCol(opt.el) : 0x6ad8ff;
      const pips = opt.max && opt.kind !== 'relic' ? `<div class="pips">${Array.from({ length: opt.max }, (_, k) => `<i class="${k < (opt.rank ?? 0) ? 'on' : ''}"></i>`).join('')}</div>` : '';
      const c = this.el('button', `choice ${opt.kind}`, `<kbd>${i + 1}</kbd><span class="tag">${esc(opt.tag)}${opt.el ? ' · ' + opt.el + (opt.el2 ? ' / ' + opt.el2 : '') : ''}</span><div class="head"><img src="${this.icon(opt)}" alt=""><b>${esc(opt.title)}</b></div>${opt.desc ? `<p>${esc(opt.desc)}</p>` : ''}<ul>${opt.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>${pips}`);
      c.style.setProperty('--c', hex(col));
      c.dataset.choice = String(i);
      c.addEventListener('click', () => choose(opt));
      box.append(c);
    });
    o.append(box);
    this.setOverlay(o);
    window.setTimeout(() => { ready = true; box.classList.remove('wait'); }, 380);
    this.keyHandler = (e) => { const i = Number(e.key) - 1; if (i >= 0 && i < opts.length) choose(opts[i]); };
    window.addEventListener('keydown', this.keyHandler);
  }

  private dmgRows(ws: { name: string; icon: string; col: number; dmg: number }[]): string {
    const max = Math.max(1, ...ws.map((x) => x.dmg));
    return ws.slice().sort((a, b) => b.dmg - a.dmg).map((x) => `<div class="dmgrow" style="--c:${hex(x.col)}"><img src="${x.icon}" alt=""><div>${esc(x.name)}<div class="bar"><i style="width:${(x.dmg / max) * 100}%"></i></div></div><span>${fmtNum(x.dmg)}</span></div>`).join('');
  }
  weaponRows(ws: WeaponInst[]): { name: string; icon: string; col: number; dmg: number }[] {
    return ws.map((x) => ({ name: x.evo?.name ?? x.def.name, icon: this.weaponIcon(x.def), col: this.elCol(x.def.el), dmg: x.dmgDone }));
  }

  showPause(w: World): void {
    const p = w.player, s = p.stats;
    const o = this.el('div', 'overlay');
    o.append(this.el('h2', '', 'Paused'), this.el('div', 'sub', `${p.cls.name} · ${w.mode.name} · seed ${w.seed}`));
    const panel = this.el('div', 'panel', `<div class="stats">
      <div class="stat"><small>Damage</small><b>${Math.round(s.might * 100)}%</b></div><div class="stat"><small>Cooldown</small><b>${Math.round(s.cooldown * 100)}%</b></div>
      <div class="stat"><small>Area</small><b>${Math.round(s.area * 100)}%</b></div><div class="stat"><small>Crit</small><b>${Math.round(s.crit * 100)}%</b></div>
      <div class="stat"><small>Armor</small><b>${s.armor.toFixed(1)}</b></div><div class="stat"><small>Speed</small><b>${Math.round(s.moveSpeed * 100)}%</b></div>
      <div class="stat"><small>Amount</small><b>+${s.amount}</b></div><div class="stat"><small>Reactions</small><b>${fmtNum(w.stats.reactions)}</b></div></div>
      <div style="margin-top:10px">${this.dmgRows(this.weaponRows(p.weapons))}</div>`);
    const row = this.el('div', 'row');
    row.append(
      this.btn('Resume', 'btn primary', () => this.host.resume()),
      this.btn('Settings', 'btn', () => this.showSettings(() => this.showPause(w), true)),
      this.btn('Restart', 'btn', () => this.host.restart()),
      this.btn('Quit', 'btn', () => this.host.quitToMenu()),
    );
    o.append(panel, row);
    this.setOverlay(o);
  }

  showEnd(e: EndInfo): void {
    const o = this.el('div', 'overlay ' + (e.won ? 'win' : 'lose'));
    o.append(this.el('h2', '', e.won ? 'Rift Sealed' : 'Overrun'), this.el('div', 'sub', e.mode));
    const panel = this.el('div', 'panel', `<div class="stats">
      <div class="stat"><small>Time</small><b>${fmtTime(e.time)}</b></div><div class="stat"><small>Level</small><b>${e.level}</b></div>
      <div class="stat"><small>Kills</small><b>${fmtNum(e.kills)}</b></div><div class="stat"><small>Bosses</small><b>${e.bosses}</b></div>
      <div class="stat"><small>Reactions</small><b>${fmtNum(e.reactions)}</b></div><div class="stat"><small>Shards earned</small><b class="shards">${e.shards}</b></div></div>
      ${e.unlocked.length ? `<p style="color:#ffd24a;letter-spacing:.1em">${e.unlocked.map(esc).join('<br>')}</p>` : ''}
      <div style="margin-top:10px">${this.dmgRows(e.weapons)}</div>`);
    const row = this.el('div', 'row');
    const again = this.btn('Play again', 'btn primary', () => this.host.restart());
    again.id = 'play-again';
    const menu = this.btn('Main menu', 'btn', () => this.host.quitToMenu());
    menu.id = 'to-menu';
    row.append(again, menu);
    o.append(panel, row);
    this.setOverlay(o);
  }
}
