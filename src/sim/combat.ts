import { angDiff, TAU } from '../core/math';
import { spawnBullet, spawnEnemy, spawnPickup, spawnProj, spawnZone } from './entities';
import { pairKey, type ElementId, type Enemy, type ReactionDef, type StatusId, type WP, type WeaponInst } from './types';
import type { World } from './world';

export const F_NOCRIT = 1;
export const F_NOREACT = 2;
export const F_DOT = 4;
export const F_RAW = 8;

let srcOn = false;
let srcX = 0;
let srcY = 0;
const scratch: Enemy[] = [];

export const elCol = (w: World, el: ElementId): number => w.content.elements.get(el)!.col;

/** Core damage entry point for everything that hurts an enemy. Returns damage dealt. */
export function damageEnemy(w: World, e0: Enemy, amount: number, el: ElementId, wi: WeaponInst | null, flags = 0): number {
  const e = e0.link ?? e0;
  if (!e.alive || e.invuln || amount <= 0) return 0;
  if (e.boss && (e.boss.trans > 0 || e.boss.dying > 0)) return 0;
  const p = w.player;
  const s = p.stats;
  let crit = false;
  if (!(flags & F_RAW)) {
    amount *= s.might * p.dynMight;
    if (!(flags & F_NOCRIT) && w.rng.next() < s.crit) {
      crit = true;
      amount *= s.critDmg;
    }
    if (e.elite || e.boss) amount *= s.eliteDmg;
  }
  if (e.vulnT > 0) amount *= 1 + e.vuln;
  if (e.wardT > 0) amount *= 0.2;
  if (e0.link) amount *= 0.35; // body segments forward reduced damage so area attacks cannot multi-hit a boss for full value
  const tr = e.def.traits;
  if (tr) {
    if (tr.front && !(flags & F_DOT)) {
      const dx = (srcOn ? srcX : p.x) - e.x;
      const dy = (srcOn ? srcY : p.y) - e.y;
      if (dx * dx + dy * dy > e.r * e.r && Math.abs(angDiff(e.dir, Math.atan2(dy, dx))) < 1.1) amount *= tr.front;
    }
    if (tr.armor) amount = Math.max(amount * 0.3, amount - tr.armor * w.diff.hp);
  }
  if (e.shield > 0) {
    const ab = Math.min(e.shield, amount);
    e.shield -= ab;
    amount -= ab;
    if (amount <= 0) {
      e.flash = 0.06;
      return 0;
    }
  }
  e.hp -= amount;
  e.flash = 0.12;
  e0.flash = 0.12;
  if (wi) wi.dmgDone += amount;
  w.stats.dmgDealt += amount;
  if (!(flags & F_DOT) || crit) w.fx.dmg(e0.x, e0.y - e0.r, amount, crit, elCol(w, el));
  if (!(flags & (F_NOREACT | F_DOT))) {
    if (e.mark === null || e.mark === el) {
      e.mark = el;
      e.markT = 6;
    } else if (e.reactCd <= 0 && w.reactBudget > 0) {
      const a = e.mark;
      e.mark = null;
      e.reactCd = 0.5;
      w.reactBudget--;
      react(w, e, a, el, amount);
    }
  }
  if (!(flags & F_DOT)) {
    for (const h of p.hooks) h.onHit?.(w, e, amount, crit, wi);
    if (s.lifesteal > 0 && w.rng.next() < s.lifesteal) healPlayer(w, 1);
    if (tr?.retaliate && e.atkT <= 0 && e.alive) {
      e.atkT = tr.retaliate;
      spawnBullet(w, e.x, e.y, Math.atan2(p.y - e.y, p.x - e.x), 230, e.dmg, 6, e.def.col2);
    }
  }
  if (tr?.splitHalf && e.n === 0 && e.hp > 0 && e.hp < e.maxHp * 0.5) {
    e.n = 1;
    const c = spawnEnemy(w, e.def, e.x + 20, e.y, 0);
    c.hp = c.maxHp = e.hp;
    c.n = 1;
    c.noXp = true;
    w.fx.ring(e.x, e.y, 40, e.def.col2);
  }
  if (e.hp <= 0 && e.alive) {
    if (e.boss) e.hp = 0;
    else killEnemy(w, e);
  }
  return amount;
}

const ELITE_XP = [1, 8, 30];

export function killEnemy(w: World, e: Enemy): void {
  if (!e.alive) return;
  e.alive = false;
  const p = w.player;
  const d = e.def;
  w.stats.kills++;
  p.kills++;
  if (e.elite) w.stats.elites++;
  if (!e.noXp) {
    spawnPickup(w, 'xp', e.x, e.y, d.xp * ELITE_XP[e.elite] * w.xpMul);
    const luck = p.stats.luck;
    const r = w.rng.next();
    const hc = 0.009 * luck;
    if (r < hc) spawnPickup(w, 'heal', e.x, e.y, 20);
    else if (r < hc + 0.0012) spawnPickup(w, 'magnet', e.x, e.y);
    else if (r < hc + 0.002) spawnPickup(w, 'bomb', e.x, e.y);
    else if (r < hc + 0.022) spawnPickup(w, 'shard', e.x, e.y, 1);
    if (e.elite) {
      spawnPickup(w, 'chest', e.x, e.y, e.elite);
      spawnPickup(w, 'shard', e.x, e.y, 5 * e.elite);
    }
  }
  const tr = d.traits;
  if (tr) {
    if (tr.splitInto) {
      const cd = w.content.enemies.get(tr.splitInto)!;
      for (let i = 0; i < (tr.splitN ?? 2); i++) {
        const a = (i / (tr.splitN ?? 2)) * TAU;
        const c = spawnEnemy(w, cd, e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
        c.kx = Math.cos(a) * 160;
        c.ky = Math.sin(a) * 160;
      }
    }
    if (tr.pool) spawnZone(w, e.x, e.y, 42 + e.r, 3.5, e.dmg * 0.5, tr.pool, 1, null, { delay: 0.7, tick: 0.5, color: elCol(w, tr.pool), slow: tr.pool === 'frost' ? 0.4 : 0 });
    if (tr.burst) for (let i = 0; i < tr.burst; i++) spawnBullet(w, e.x, e.y, (i / tr.burst) * TAU + e.t, 150, e.dmg * 0.7, 6, d.col2, 3.5);
  }
  if (e.sporeT > 0 && e.sporeW) {
    const sp = e.sporeW.p;
    for (let i = 0; i < 5; i++) {
      const pr = spawnProj(w, e.x, e.y, (i / 5) * TAU + w.rng.next(), sp, e.sporeW, 2);
      pr.sprite = 'p_spore'; pr.r = 7; pr.dmg = sp.dmg * 2.5; pr.pierce = 1; pr.life = 0.6; pr.mode = 0;
      pr.vx = Math.cos(pr.rot) * 320; pr.vy = Math.sin(pr.rot) * 320;
    }
  }
  if (e.curseT > 0 && e.curseW && e.curseW.p.x.spread) {
    let n = e.curseW.p.x.spread;
    for (const o of w.grid.query(e.x, e.y, 200, (scratch.length = 0, scratch))) {
      if (n <= 0) break;
      if (o.alive && o.curseT <= 0 && o !== e) {
        applyCurse(w, o, e.curseW);
        w.fx.line(e.x, e.y, o.x, o.y, e.curseW.p.color, 2, 0.2);
        n--;
      }
    }
  }
  for (const h of p.hooks) h.onKill?.(w, e);
  w.fx.burst(e.x, e.y, d.col, e.elite ? 26 : Math.min(12, 4 + (e.r >> 2)), 150 + e.r * 3, e.r * 0.28);
  w.fx.sfx(e.elite ? 'elite_die' : 'kill', e.x, e.y);
  if (e.elite) w.fx.ring(e.x, e.y, 90, d.col2, 0.4);
}

export function applyCurse(w: World, e: Enemy, wi: WeaponInst): void {
  e.curseT = wi.p.dur * w.player.stats.duration;
  e.curseW = wi;
  applyStatus(w, e, 'vuln', 0.25 + (wi.p.x.vuln ?? 0), e.curseT);
}

export function applyStatus(w: World, e0: Enemy, s: StatusId, pow: number, dur: number): void {
  const e = e0.link ?? e0;
  if (!e.alive) return;
  const big = e.boss !== null || e.elite === 2;
  switch (s) {
    case 'burn':
      e.burn = Math.max(e.burn, pow * w.player.stats.statusPower);
      e.burnT = Math.max(e.burnT, dur);
      break;
    case 'poison':
      e.poison = Math.min(e.poison + pow * w.player.stats.statusPower, pow * w.player.stats.statusPower * 8);
      e.poisonT = Math.max(e.poisonT, dur);
      break;
    case 'slow':
      e.slow = Math.max(e.slow, big ? pow * 0.5 : pow);
      e.slowT = Math.max(e.slowT, dur);
      break;
    case 'freeze':
      if (big) { e.slow = Math.max(e.slow, 0.3); e.slowT = Math.max(e.slowT, dur); } else e.freezeT = Math.max(e.freezeT, e.elite ? dur * 0.5 : dur);
      break;
    case 'stun':
      if (!big) e.stunT = Math.max(e.stunT, e.elite ? dur * 0.5 : dur);
      break;
    case 'vuln':
      e.vuln = Math.max(e.vuln, pow);
      e.vulnT = Math.max(e.vulnT, dur);
      break;
    case 'weak':
      e.weakT = Math.max(e.weakT, dur);
      break;
  }
}

/** Per-enemy status upkeep; called once per step by the enemy system. */
export function tickStatus(w: World, e: Enemy, dt: number): void {
  if (e.markT > 0 && (e.markT -= dt) <= 0) e.mark = null;
  if (e.reactCd > 0) e.reactCd -= dt;
  if (e.slowT > 0 && (e.slowT -= dt) <= 0) e.slow = 0;
  if (e.vulnT > 0 && (e.vulnT -= dt) <= 0) e.vuln = 0;
  if (e.freezeT > 0) e.freezeT -= dt;
  if (e.stunT > 0) e.stunT -= dt;
  if (e.weakT > 0) e.weakT -= dt;
  if (e.hasteT > 0) e.hasteT -= dt;
  if (e.wardT > 0) e.wardT -= dt;
  if (e.sporeT > 0) e.sporeT -= dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.touchT > 0) e.touchT -= dt;
  if (e.burnT > 0 || e.poisonT > 0 || e.curseT > 0) {
    e.dotT -= dt;
    const tick = e.dotT <= 0;
    if (tick) e.dotT += 0.5;
    if (e.burnT > 0) {
      if (tick) damageEnemy(w, e, e.burn * 0.5, 'fire', null, F_DOT | F_RAW | F_NOCRIT);
      if ((e.burnT -= dt) <= 0) e.burn = 0;
    }
    if (e.poisonT > 0 && e.alive) {
      if (tick) damageEnemy(w, e, e.poison * 0.5, 'toxin', null, F_DOT | F_RAW | F_NOCRIT);
      if ((e.poisonT -= dt) <= 0) e.poison = 0;
    }
    if (e.curseT > 0 && e.alive && e.curseW) {
      const cw = e.curseW;
      if (tick) damageEnemy(w, e, cw.p.dmg * 0.5, cw.p.el, cw, F_DOT | F_NOCRIT);
      if ((e.curseT -= dt) <= 0 && e.alive && cw.p.x.expire) {
        w.fx.ring(e.x, e.y, 50, cw.p.color, 0.25);
        hitCircle(w, e.x, e.y, 50, cw.p.dmg * cw.p.x.expire, cw.p, cw);
      }
    }
  }
}

function react(w: World, e: Enemy, a: ElementId, b: ElementId, amount: number): void {
  const def = w.content.reactions.get(pairKey(a, b));
  if (!def) return;
  w.stats.reactions++;
  w.stats.reactionIds[def.id] = (w.stats.reactionIds[def.id] ?? 0) + 1;
  const basis = Math.max(amount, 5 + w.player.level * 2) * w.player.stats.reaction;
  runReaction(w, e, def, basis, b);
  for (const h of w.player.hooks) h.onReact?.(w, e, def);
}

const RFLAGS = F_RAW | F_NOREACT | F_NOCRIT;

/** Resolve a reaction's effect list at an enemy. Reaction damage never marks or re-reacts (chain safeguard). */
export function runReaction(w: World, e: Enemy, def: ReactionDef, basis: number, trigger: ElementId): void {
  const x = e.x;
  const y = e.y;
  w.fx.ring(x, y, 34, def.col, 0.3);
  w.fx.burst(x, y, def.col, 6, 190, 3);
  w.fx.sfx('react', x, y);
  if (w.rng.next() < 0.12) w.fx.text(x, y - e.r - 14, def.name, def.col, 11);
  const sp = w.player.stats.statusPower;
  for (const f of def.fx) {
    switch (f.t) {
      case 'burst':
        if (f.r > 0) { w.fx.ring(x, y, f.r, def.col, 0.25); hitCircle(w, x, y, f.r, basis * f.mult, trigger, null, RFLAGS); }
        else damageEnemy(w, e, basis * f.mult, trigger, null, RFLAGS);
        break;
      case 'status': {
        const pow = f.s === 'burn' || f.s === 'poison' ? basis * f.pow / Math.max(1, sp) * sp : f.pow;
        if (f.r > 0) for (const o of w.grid.query(x, y, f.r)) applyStatus(w, o, f.s, pow, f.dur);
        else applyStatus(w, e, f.s, pow, f.dur);
        break;
      }
      case 'zone':
        spawnZone(w, x, y, f.r, f.dur, basis * f.dps, trigger, 0, null, { slow: f.slow ?? 0, pull: f.pull ?? 0, style: f.style ?? 'pool', color: def.col, noReact: true });
        break;
      case 'chain': {
        let n = f.n;
        let px = x, py = y;
        for (const o of w.grid.query(x, y, 190)) {
          if (n <= 0) break;
          if (o === e || !o.alive) continue;
          w.fx.line(px, py, o.x, o.y, def.col, 2, 0.15);
          px = o.x; py = o.y;
          damageEnemy(w, o, basis * f.mult, trigger, null, RFLAGS);
          n--;
        }
        break;
      }
      case 'pull':
      case 'knock': {
        const sgn = f.t === 'pull' ? -1 : 1;
        for (const o of w.grid.query(x, y, f.r)) {
          if (o.boss || o === e && f.t === 'pull') continue;
          const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy) || 1;
          o.kx += (dx / d) * f.f * sgn;
          o.ky += (dy / d) * f.f * sgn;
        }
        break;
      }
      case 'spread':
        for (const o of w.grid.query(x, y, f.r)) if (o !== e && o.alive && o.mark === null) { o.mark = trigger; o.markT = 6; }
        break;
      case 'shards': {
        const wp: WP = { kind: 'shot', el: trigger, dmg: basis * f.mult, cd: 1, count: 1, speed: 380, range: 260, area: 6, dur: 1, pierce: 1, spread: 0, tick: 0, kb: 0, x: { raw: 1 }, sprite: 'p_shard', color: def.col };
        const off = w.rng.angle();
        for (let i = 0; i < f.n; i++) spawnProj(w, x, y, off + (i / f.n) * TAU, wp, null, 2);
        break;
      }
      case 'execute':
        if (e.alive && !e.boss && e.elite === 0 && e.hp < e.maxHp * f.pct) { w.fx.text(x, y - 20, 'EXECUTE', def.col, 11); killEnemy(w, e); }
        break;
      case 'heal':
        healPlayer(w, f.amt);
        break;
      case 'surge':
        w.player.surgeT = Math.max(w.player.surgeT, f.dur);
        break;
      case 'maxhp':
        if (e.alive) damageEnemy(w, e, e.boss || e.elite ? Math.min(e.maxHp * f.pct, basis * 3) : e.maxHp * f.pct, trigger, null, RFLAGS);
        break;
    }
  }
}

/** Weapon hit: damage plus the weapon's status, knockback, execute and fusion element alternation. */
export function hitEnemy(w: World, e: Enemy, dmg: number, p: WP, wi: WeaponInst | null, flags = 0, fx = 0, fy = 0): number {
  let el = p.el;
  if (p.el2 && wi && wi.flip++ & 1) el = p.el2;
  if (p.x.raw) flags |= RFLAGS;
  const dealt = damageEnemy(w, e, dmg, el, wi, flags);
  if (dealt <= 0) return 0;
  const t = e.link ?? e;
  if (!t.alive) return dealt;
  const st = p.status;
  if (st && (st.ch === undefined || w.rng.next() < st.ch)) applyStatus(w, t, st.s, st.s === 'burn' || st.s === 'poison' ? st.pow * dmg * w.player.stats.might : st.pow, st.dur);
  if (p.kb && !t.boss) {
    let dx = t.x - (fx || w.player.x), dy = t.y - (fy || w.player.y);
    const d = Math.hypot(dx, dy) || 1;
    const k = (p.kb * w.player.stats.knockback) / (1 + t.def.hp / 60);
    t.kx += (dx / d) * k;
    t.ky += (dy / d) * k;
  }
  if (p.exec && !t.boss && t.elite === 0 && t.hp < t.maxHp * p.exec) killEnemy(w, t);
  if (p.lifesteal && w.rng.next() < p.lifesteal) healPlayer(w, 1);
  return dealt;
}

export function hitCircle(w: World, x: number, y: number, r: number, dmg: number, elOrP: ElementId | WP, wi: WeaponInst | null, flags = 0): number {
  const list = w.grid.query(x, y, r);
  srcOn = true; srcX = x; srcY = y;
  let n = 0;
  for (const e of list) {
    if (!e.alive || e.hidden) continue;
    if (typeof elOrP === 'string') damageEnemy(w, e, dmg, elOrP, wi, flags);
    else hitEnemy(w, e, dmg, elOrP, wi, flags, x, y);
    n++;
  }
  srcOn = false;
  return n;
}

export function hitArc(w: World, x: number, y: number, r: number, ang: number, half: number, dmg: number, p: WP, wi: WeaponInst | null): number {
  let n = 0;
  for (const e of w.grid.query(x, y, r)) {
    if (!e.alive || e.hidden) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > e.r && Math.abs(angDiff(ang, Math.atan2(e.y - y, e.x - x))) > half + Math.asin(Math.min(1, e.r / d))) continue;
    hitEnemy(w, e, dmg, p, wi, 0, x, y);
    n++;
  }
  return n;
}

export function hitLine(w: World, x: number, y: number, ang: number, length: number, width: number, dmg: number, p: WP, wi: WeaponInst | null, flags = 0): number {
  const cx = Math.cos(ang), sy = Math.sin(ang);
  const list = w.grid.query(x + cx * length * 0.5, y + sy * length * 0.5, length * 0.5 + width);
  srcOn = true; srcX = x; srcY = y;
  let n = 0;
  for (const e of list) {
    if (!e.alive || e.hidden) continue;
    const dx = e.x - x, dy = e.y - y;
    const along = dx * cx + dy * sy;
    if (along < -e.r || along > length + e.r) continue;
    if (Math.abs(dx * sy - dy * cx) > width * 0.5 + e.r) continue;
    hitEnemy(w, e, dmg, p, wi, flags, x, y);
    n++;
  }
  srcOn = false;
  return n;
}

export function nearestEnemy(w: World, x: number, y: number, maxR: number, skip?: number[] | null, notE?: Enemy | null): Enemy | null {
  let best: Enemy | null = null;
  let bd = maxR * maxR;
  const es = w.enemies;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e.alive || e.hidden || e === notE) continue;
    const dx = e.x - x, dy = e.y - y;
    const d = dx * dx + dy * dy - e.r * e.r;
    if (d < bd && !(skip && skip.includes(e.id))) { bd = d; best = e; }
  }
  return best;
}

export function strongestEnemy(w: World, x: number, y: number, maxR: number): Enemy | null {
  let best: Enemy | null = null;
  let bh = 0;
  for (const e of w.enemies) {
    if (!e.alive || e.hidden) continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy < maxR * maxR && e.hp > bh) { bh = e.hp; best = e; }
  }
  return best;
}

/** Up to n distinct random visible enemies within range. */
export function randomEnemies(w: World, x: number, y: number, maxR: number, n: number): Enemy[] {
  const c: Enemy[] = [];
  for (const e of w.enemies) {
    if (!e.alive || e.hidden) continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy < maxR * maxR) c.push(e);
  }
  if (c.length <= n) return c;
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(w.rng.next() * (c.length - i));
    const t = c[i]; c[i] = c[j]; c[j] = t;
  }
  c.length = n;
  return c;
}

export function healPlayer(w: World, amt: number): void {
  const p = w.player;
  if (w.state !== 'play') return;
  p.hp = Math.min(p.stats.maxHp, p.hp + amt);
}

/** Damage the player. Returns true if damage was taken. */
export function hurtPlayer(w: World, dmg: number, src = 'other'): boolean {
  const p = w.player;
  if (w.state !== 'play' || p.iframes > 0 || p.dashT > 0 || w.god) return false;
  if (p.stats.evasion > 0 && w.rng.next() < p.stats.evasion) {
    p.iframes = 0.25;
    w.fx.text(p.x, p.y - 26, 'DODGE', 0x9fe8ff, 11);
    return false;
  }
  for (const h of p.hooks) if (h.onHurt) dmg = h.onHurt(w, dmg);
  if (dmg <= 0) { p.iframes = 0.4; return false; }
  dmg = Math.max(dmg * 0.2, dmg - p.stats.armor) * p.stats.dmgTaken;
  p.hp -= dmg;
  p.iframes = 0.55;
  p.hurtFlash = 0.3;
  w.stats.dmgTaken += dmg;
  w.stats.hurtBy[src] = (w.stats.hurtBy[src] ?? 0) + dmg;
  w.fx.shake(7);
  w.fx.flash(0xff2244, 0.25);
  w.fx.sfx('hurt');
  w.fx.burst(p.x, p.y, 0xff4466, 10, 220, 3);
  if (p.stats.thorns > 0) hitCircle(w, p.x, p.y, 110, p.stats.thorns * (8 + p.level * 2), 'earth', null, F_NOREACT);
  if (p.hp <= 0) {
    if (p.revives > 0) {
      p.revives--;
      p.hp = p.stats.maxHp * 0.5;
      p.iframes = 3;
      w.fx.banner('SECOND WIND', 'You refuse to fall', 0x9fffd0);
      w.fx.ring(p.x, p.y, 320, 0x9fffd0, 0.6);
      w.fx.sfx('revive');
      for (const e of w.grid.query(p.x, p.y, 320)) {
        if (!e.boss) { const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; e.kx += ((e.x - p.x) / d) * 600; e.ky += ((e.y - p.y) / d) * 600; }
        damageEnemy(w, e, 40 + p.level * 12, 'light', null, F_NOREACT);
      }
      w.bullets.length = 0;
    } else {
      p.hp = 0;
      w.state = 'lost';
      w.fx.sfx('defeat');
    }
  }
  return true;
}
