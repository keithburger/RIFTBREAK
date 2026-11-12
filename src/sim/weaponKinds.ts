/**
 * Weapon behavior kinds. Each `registerKind` block is one self-contained attack behavior tuned by
 * WP params. To add a new mechanic, add a block here (plus a MINIONS entry if it needs a persistent
 * helper entity) — the engine, combat and content loaders do not change.
 */
import { TAU, turn } from '../core/math';
import { applyCurse, applyStatus, hitArc, hitCircle, hitEnemy, hitLine, nearestEnemy, randomEnemies, strongestEnemy } from './combat';
import { spawnBeam, spawnMinion, spawnProj, spawnZone } from './entities';
import type { Enemy, WP, WeaponInst } from './types';
import { MINIONS, MINION_END, area, chainFrom, cnt, dur, lobTo, maintain, registerKind, zoneFrom } from './weapons';
import type { World } from './world';

// ---------------------------------------------------------------------------------------------
// Aiming
// ---------------------------------------------------------------------------------------------
function aim(w: World, p: WP): number | null {
  const pl = w.player;
  switch (p.aim) {
    case 'facing':
    case 'move':
      return pl.facing;
    case 'random':
      return w.rng.angle();
    case 'strong': {
      const e = strongestEnemy(w, pl.x, pl.y, Math.min(650, p.range * 1.1));
      return e ? Math.atan2(e.y - pl.y, e.x - pl.x) : null;
    }
    default: {
      const e = nearestEnemy(w, pl.x, pl.y, Math.min(650, p.range * 1.1));
      return e ? Math.atan2(e.y - pl.y, e.x - pl.x) : null;
    }
  }
}

function volley(w: World, wi: WeaponInst): boolean {
  const p = wi.p;
  const pl = w.player;
  const n = cnt(w, p);
  if (p.aim === 'multi') {
    const ts = randomEnemies(w, pl.x, pl.y, Math.min(650, p.range), n);
    if (!ts.length) return false;
    for (let i = 0; i < n; i++) {
      const t = ts[i % ts.length];
      const pr = spawnProj(w, pl.x, pl.y, Math.atan2(t.y - pl.y, t.x - pl.x) + (i >= ts.length ? (w.rng.next() - 0.5) * 0.5 : 0), p, wi);
      pr.target = t;
    }
  } else {
    const a = aim(w, p);
    if (a === null) return false;
    const spread = p.spread || (n > 1 ? 0.14 * (n - 1) : 0);
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * spread : 0;
      const pr = spawnProj(w, pl.x + Math.cos(a) * 12, pl.y + Math.sin(a) * 12, p.aim === 'random' ? w.rng.angle() : a + off, p, wi);
      if (p.x.spin) pr.spin = p.x.spin;
      if (p.x.back) spawnProj(w, pl.x, pl.y, a + off + Math.PI, p, wi);
    }
  }
  w.fx.sfx('shot_' + p.el, pl.x, pl.y);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------------------------

/** shot — aimed projectile volley. x: back (also fire behind), spin, dashBeam (dash leaves a beam). burst: extra volleys. */
registerKind('shot', {
  fire(w, wi) {
    if (!volley(w, wi)) return false;
    if (wi.p.burst) { wi.st = wi.p.burst - 1; wi.t = 0.09; }
  },
  update(w, wi, dt) {
    if (wi.st > 0 && (wi.t -= dt) <= 0) { wi.st--; wi.t = 0.09; volley(w, wi); }
  },
  dash(w, wi) {
    const p = wi.p;
    if (!p.x.dashBeam) return;
    const pl = w.player;
    spawnBeam(w, pl.x, pl.y, Math.atan2(pl.dashY, pl.dashX), 300, area(w, 34), dur(w, 1.2), p.dmg * p.x.dashBeam, p.el, 0, wi, { color: p.color, tick: 0.2 });
    w.fx.sfx('beam');
  },
});

/** lob — arcing shells that ignore enemies until landing, then explode. split: bomblets. zone: leaves a pool. */
registerKind('lob', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const n = cnt(w, p);
    const ts = randomEnemies(w, pl.x, pl.y, p.range, n);
    if (!ts.length) return false;
    for (let i = 0; i < n; i++) {
      const t = ts[i % ts.length];
      const jx = i >= ts.length ? (w.rng.next() - 0.5) * 90 : 0;
      const pr = spawnProj(w, pl.x, pl.y, 0, p, wi);
      lobTo(pr, t.x + t.vx * 0.4 + jx, t.y + t.vy * 0.4 + jx, 0.55);
    }
    w.fx.sfx('lob');
  },
});

/** cone — short-range continuous spray toward the nearest enemy. x: ground (burning ground at the tip). */
registerKind('cone', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const r = area(w, p.range);
    const e = nearestEnemy(w, pl.x, pl.y, r * 1.5);
    if (!e) return false;
    wi.t = turn(wi.t, Math.atan2(e.y - pl.y, e.x - pl.x), 0.9);
    hitArc(w, pl.x, pl.y, r, wi.t, p.spread / 2, p.dmg, p, wi);
    w.fx.slash(pl.x, pl.y, r, wi.t, p.spread / 2, p.color, 0.16, 1);
    if (p.x.ground && w.rng.next() < 0.3) zoneFrom(w, pl.x + Math.cos(wi.t) * r * 0.75, pl.y + Math.sin(wi.t) * r * 0.75, p, wi);
    if (w.rng.next() < 0.3) w.fx.sfx('flame');
  },
});

/** nova — radial blast centred on the player. x: double (delayed larger second ring), dash (also fires on dash). */
function nova(w: World, wi: WeaponInst, scale = 1): void {
  const p = wi.p, pl = w.player;
  const r = area(w, p.area) * scale;
  w.fx.ring(pl.x, pl.y, r, p.color, 0.35);
  w.fx.sfx('nova');
  hitCircle(w, pl.x, pl.y, r, p.dmg, p, wi);
  if (p.x.double) spawnZone(w, pl.x, pl.y, r * 1.5, 0.1, p.dmg * p.x.double, p.el, 0, wi, { delay: 0.55, once: true, style: 'strike', color: p.color, status: p.status ?? null });
}
registerKind('nova', {
  fire(w, wi) { nova(w, wi); },
  dash(w, wi) { if (wi.p.x.dash) nova(w, wi, wi.p.x.dash); },
});

/** orbit — blades circling the player. x: block (destroy enemy bullets), launch (blades fire outward each cooldown), ring2 (counter-rotating outer ring), shrap, aura (slowing field). */
registerKind('orbit', {
  update(w, wi) {
    const n = cnt(w, wi.p) * (wi.p.x.ring2 ? 2 : 1);
    if (wi.st !== n) maintain(w, wi, 'orbit', n);
  },
});
MINIONS.orbit = (w, m, dt) => {
  const p = m.wi.p, pl = w.player;
  const total = m.wi.st || 1;
  const outer = p.x.ring2 && m.idx % 2 === 1;
  const R = area(w, p.range) * (outer ? 1.7 : 1);
  const a = (outer ? -1 : 1) * m.t * p.speed + (m.idx / total) * TAU;
  m.x = pl.x + Math.cos(a) * R;
  m.y = pl.y + Math.sin(a) * R;
  m.ang = a + Math.PI / 2;
  m.r = area(w, p.area);
  m.st -= dt;
  if (m.st <= 0) {
    m.st = p.tick;
    const hit = hitCircle(w, m.x, m.y, m.r, p.dmg, p, m.wi);
    if (hit && p.x.shrap) for (let i = 0; i < 2; i++) { const c = spawnProj(w, m.x, m.y, w.rng.angle(), p, m.wi, 2); c.sprite = 'p_shard'; c.r = 5; c.dmg = p.dmg * 0.5; c.life = 0.45; c.vx = Math.cos(c.rot) * 380; c.vy = Math.sin(c.rot) * 380; c.pierce = 1; }
    if (p.x.aura && m.idx === 0) for (const e of w.grid.query(pl.x, pl.y, R + 50)) applyStatus(w, e, 'slow', p.x.aura, p.tick + 0.2);
  }
  if (p.x.block) for (const b of w.bullets) { const dx = b.x - m.x, dy = b.y - m.y; if (dx * dx + dy * dy < (m.r + b.r) ** 2) { b.alive = false; b.life = 0; w.fx.burst(b.x, b.y, p.color, 3, 100, 2); } }
  if (p.x.launch) {
    m.vx -= dt;
    if (m.vx <= 0) {
      m.vx = p.x.launch * w.player.stats.cooldown;
      const c = spawnProj(w, m.x, m.y, a, p, m.wi, 2);
      c.vx = Math.cos(a) * 420; c.vy = Math.sin(a) * 420; c.life = 0.9; c.pierce = 3; c.dmg = p.dmg * 1.5; c.r = m.r;
    }
  }
};

/** mine — proximity mines dropped at the player's feet. x: seek (crawl toward enemies). zone: leaves a field. */
registerKind('mine', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const n = cnt(w, p);
    for (let i = 0; i < n; i++) {
      const a = w.rng.angle(), d = n > 1 ? 30 + w.rng.next() * 50 : 0;
      spawnMinion(w, 'mine', pl.x + Math.cos(a) * d, pl.y + Math.sin(a) * d, wi, dur(w, p.dur));
    }
    w.fx.sfx('drop');
  },
});
MINIONS.mine = (w, m, dt) => {
  const p = m.wi.p;
  m.r = 10;
  if (m.t < 0.4) return;
  const trig = area(w, p.area);
  const e = nearestEnemy(w, m.x, m.y, p.x.seek ? 300 : trig);
  if (!e) return;
  const d = Math.hypot(e.x - m.x, e.y - m.y);
  if (p.x.seek && d > trig) { m.x += ((e.x - m.x) / d) * p.x.seek * dt; m.y += ((e.y - m.y) / d) * p.x.seek * dt; }
  if (d - e.r < trig) {
    const r = area(w, p.explode ?? 60);
    w.fx.ring(m.x, m.y, r, p.color, 0.3);
    w.fx.burst(m.x, m.y, p.color, 12, 240, 4);
    w.fx.sfx('boom', m.x, m.y);
    hitCircle(w, m.x, m.y, r, p.dmg, p, m.wi);
    if (p.zone) zoneFrom(w, m.x, m.y, p, m.wi);
    m.life = 0;
  }
};

/** beam — sustained beam(s) from the player. x: track (rotates toward target), ramp (damage ramps over its life), strong (targets highest HP). */
registerKind('beam', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const a = aim(w, p.x.strong ? { ...p, aim: 'strong' } : p);
    if (a === null) return false;
    const n = cnt(w, p);
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * (p.spread || 0.3 * (n - 1)) : 0;
      spawnBeam(w, pl.x, pl.y, a + off, p.range, area(w, p.area), dur(w, p.dur), p.dmg, p.el, 0, wi, { follow: true, tick: p.tick, color: p.color, ramp: p.x.ramp ?? 0, rot: p.x.track ? (w.rng.next() < 0.5 ? -1 : 1) * p.x.track : 0 });
    }
    w.fx.sfx('beam');
  },
});

/** sweep — beams rotating around the player. */
registerKind('sweep', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const n = cnt(w, p);
    wi.t += 1.3;
    for (let i = 0; i < n; i++)
      spawnBeam(w, pl.x, pl.y, wi.t + (i / n) * TAU, area(w, p.range), p.area, dur(w, p.dur), p.dmg, p.el, 0, wi, { follow: true, tick: p.tick, color: p.color, rot: p.speed });
    w.fx.sfx('beam');
  },
});

/** chain — lightning that jumps between enemies. count: independent chains. x: chainBoom (each jump explodes). */
registerKind('chain', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const starts = randomEnemies(w, pl.x, pl.y, p.range, cnt(w, p));
    if (!starts.length) return false;
    const visited: number[] = [];
    for (const e of starts) {
      visited.push(e.id);
      w.fx.line(pl.x, pl.y, e.x, e.y, p.color, 3, 0.14);
      hitEnemy(w, e, p.dmg, p, wi);
      if (p.x.chainBoom) hitCircle(w, e.x, e.y, area(w, p.x.chainBoom), p.dmg * 0.5, p, wi);
      chainFrom(w, e, p, wi, p.chain ?? 3, p.dmg * 0.8, visited);
    }
    w.fx.sfx('zap');
  },
});

/** drone — autonomous drones that zap enemies near themselves. chain: zaps arc onward. */
registerKind('drone', {
  update(w, wi) { const n = cnt(w, wi.p); if (wi.st !== n) maintain(w, wi, 'drone', n); },
});
MINIONS.drone = (w, m, dt) => {
  const p = m.wi.p, pl = w.player;
  const a = m.t * 0.9 + (m.idx / (m.wi.st || 1)) * TAU;
  const tx = pl.x + Math.cos(a) * 70, ty = pl.y + Math.sin(a) * 70;
  m.x += (tx - m.x) * Math.min(1, dt * 5);
  m.y += (ty - m.y) * Math.min(1, dt * 5);
  m.st -= dt * pl.dynHaste;
  if (m.st > 0) return;
  const e = nearestEnemy(w, m.x, m.y, p.range);
  if (!e) { m.st = 0.15; return; }
  m.st = p.cd * pl.stats.cooldown;
  m.ang = Math.atan2(e.y - m.y, e.x - m.x);
  w.fx.line(m.x, m.y, e.x, e.y, p.color, 2.5, 0.12);
  w.fx.sfx('zap', m.x, m.y);
  hitEnemy(w, e, p.dmg, p, m.wi);
  if (p.chain) chainFrom(w, e, p, m.wi, p.chain, p.dmg * 0.7, [e.id]);
};

/** strike — delayed blasts on enemies. x: strong, track (follows its target), row (line of strikes), heal (leaves mending pools), pass (kills re-mark more enemies). zone: leaves a field. */
function strikeAt(w: World, wi: WeaponInst, x: number, y: number, target: Enemy | null, delay: number, gen: number): void {
  const p = wi.p;
  spawnZone(w, x, y, area(w, p.area), 0.1, p.dmg, p.el, 0, wi, {
    delay, once: true, style: 'strike', color: p.color, status: p.status ?? null, track: p.x.track ? target : null, kb: p.kb,
    onEnd: (w2, z) => {
      w2.fx.burst(z.x, z.y, p.color, 8, 200, 3.5);
      w2.fx.line(z.x, z.y - 400, z.x, z.y, p.color, 5, 0.12);
      w2.fx.sfx('strike', z.x, z.y);
      if (p.zone) zoneFrom(w2, z.x, z.y, p, wi, p.x.heal ? { heal: p.x.heal, style: 'heal' } : {});
      if (p.x.pass && gen < 2 && target && !target.alive)
        for (const t of randomEnemies(w2, z.x, z.y, 260, p.x.pass)) strikeAt(w2, wi, t.x, t.y, t, 0.5, gen + 1);
    },
  });
}
registerKind('strike', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const n = cnt(w, p);
    if (p.x.strong) {
      const e = strongestEnemy(w, pl.x, pl.y, p.range);
      if (!e) return false;
      for (let i = 0; i < n; i++) strikeAt(w, wi, e.x, e.y, e, 0.4 + i * 0.25, 0);
      return;
    }
    const ts = randomEnemies(w, pl.x, pl.y, p.range, p.x.row ? 1 : n);
    if (!ts.length) return false;
    if (p.x.row) {
      const t = ts[0];
      const a = Math.atan2(t.y - pl.y, t.x - pl.x);
      const m = p.x.row + n - 1;
      for (let i = 0; i < m; i++) strikeAt(w, wi, pl.x + Math.cos(a) * (60 + i * area(w, p.area) * 1.5), pl.y + Math.sin(a) * (60 + i * area(w, p.area) * 1.5), null, 0.3 + i * 0.09, 0);
    } else for (const t of ts) strikeAt(w, wi, t.x, t.y, t, p.x.delay ?? 0.4, 0);
  },
});

/** whip — line strike alternating sides. x: both, linger (leaves a live current), stride (extra lashes per distance moved). */
function lash(w: World, wi: WeaponInst): void {
  const p = wi.p, pl = w.player;
  const e = nearestEnemy(w, pl.x, pl.y, p.range * 1.2);
  let a = e ? Math.atan2(e.y - pl.y, e.x - pl.x) : pl.facing;
  if ((wi.flip & 1) && !e) a += Math.PI;
  const L = area(w, p.range), W = area(w, p.area);
  const dirs = p.x.both ? [a, a + Math.PI] : [a];
  for (const d of dirs) {
    hitLine(w, pl.x, pl.y, d, L, W, p.dmg, p, wi);
    w.fx.line(pl.x, pl.y, pl.x + Math.cos(d) * L, pl.y + Math.sin(d) * L, p.color, W * 0.5, 0.16);
    if (p.x.linger) spawnBeam(w, pl.x, pl.y, d, L, W * 0.6, dur(w, p.x.linger), p.dmg * 0.3, p.el, 0, wi, { tick: 0.25, color: p.color });
  }
  w.fx.sfx('whip');
}
registerKind('whip', {
  fire(w, wi) { lash(w, wi); },
  update(w, wi) {
    if (!wi.p.x.stride) return;
    wi.acc += w.player.moved;
    if (wi.acc >= wi.p.x.stride) { wi.acc = 0; lash(w, wi); }
  },
});

/** aura — damaging field that follows the player. x: spore (enemies dying inside burst into spores). */
registerKind('aura', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    spawnZone(w, pl.x, pl.y, area(w, p.area), p.cd * pl.stats.cooldown + 0.05, p.dmg, p.el, 0, wi, { follow: true, tick: p.tick, style: 'aura', color: p.color, status: p.status ?? null, slow: p.x.slow ?? 0 });
    if (p.x.spore) for (const e of w.grid.query(pl.x, pl.y, area(w, p.area))) { e.sporeT = 2; e.sporeW = wi; }
  },
});

/** trail — pools dropped as the player moves. x: step (distance between pools), ignite (dash detonates every pool). */
registerKind('trail', {
  update(w, wi) {
    const p = wi.p, pl = w.player;
    wi.acc += pl.moved;
    if (wi.acc < (p.x.step ?? 40)) return;
    wi.acc = 0;
    spawnZone(w, pl.x, pl.y, area(w, p.area), dur(w, p.dur), p.dmg, p.el, 0, wi, { tick: p.tick, style: 'pool', color: p.color, status: p.status ?? null, slow: p.x.slow ?? 0 });
  },
  dash(w, wi) {
    const p = wi.p;
    if (!p.x.ignite) return;
    for (const z of w.zones) if (z.wi === wi && z.alive) {
      w.fx.ring(z.x, z.y, z.r * 1.7, 0xffb347, 0.3);
      hitCircle(w, z.x, z.y, z.r * 1.7, p.dmg * p.x.ignite, p, wi);
      z.life = 0.05;
    }
    w.fx.sfx('boom');
  },
});

/** fissure — telegraphed ground cracks radiating from the player. x: linger (cracks persist), repeat (aftershock). */
registerKind('fissure', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const n = cnt(w, p);
    const ts = randomEnemies(w, pl.x, pl.y, p.range, n);
    for (let i = 0; i < n; i++) {
      const t = ts[i];
      const a = t ? Math.atan2(t.y - pl.y, t.x - pl.x) : w.rng.angle();
      const life = p.x.linger ? dur(w, p.x.linger) : 0.12;
      spawnBeam(w, pl.x, pl.y, a, area(w, p.range), area(w, p.area), life, p.dmg, p.el, 0, wi, { delay: 0.25, tick: p.x.linger ? 0.35 : 9, color: p.color });
      if (p.x.repeat) spawnBeam(w, pl.x, pl.y, a + 0.2, area(w, p.range), area(w, p.area), 0.12, p.dmg * p.x.repeat, p.el, 0, wi, { delay: 0.8, tick: 9, color: p.color });
    }
    w.fx.shake(2);
    w.fx.sfx('quake');
  },
});

/** spire — pylons erupting at enemies, pulsing damage. x: shatter (burst into shards on expiry), link (beams between spires). */
registerKind('spire', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const ts = randomEnemies(w, pl.x, pl.y, p.range, cnt(w, p));
    if (!ts.length) return false;
    for (const t of ts) { spawnMinion(w, 'spire', t.x, t.y, wi, dur(w, p.dur)); w.fx.burst(t.x, t.y, p.color, 6, 150, 3); }
    w.fx.sfx('quake');
  },
});
MINIONS.spire = (w, m, dt) => {
  const p = m.wi.p;
  m.st -= dt;
  if (m.st > 0) return;
  m.st = p.tick;
  const r = area(w, p.area);
  w.fx.ring(m.x, m.y, r, p.color, 0.2);
  hitCircle(w, m.x, m.y, r, p.dmg, p, m.wi);
  if (p.x.link) for (const o of w.minions) if (o !== m && o.kind === 'spire' && o.wi === m.wi && o.x > m.x) {
    const d = Math.hypot(o.x - m.x, o.y - m.y);
    if (d < 420) { hitLine(w, m.x, m.y, Math.atan2(o.y - m.y, o.x - m.x), d, 22, p.dmg * p.x.link, p, m.wi); w.fx.line(m.x, m.y, o.x, o.y, p.color, 4, 0.2); }
  }
};
MINION_END.spire = (w, m) => {
  const p = m.wi.p;
  if (!p.x.shatter) return;
  for (let i = 0; i < p.x.shatter; i++) { const c = spawnProj(w, m.x, m.y, (i / p.x.shatter) * TAU, p, m.wi, 2); c.sprite = 'p_shard'; c.vx = Math.cos(c.rot) * 400; c.vy = Math.sin(c.rot) * 400; c.life = 0.6; c.r = 7; c.pierce = 2; c.dmg = p.dmg * 1.5; }
  w.fx.burst(m.x, m.y, p.color, 10, 220, 4);
};

/** turret — stationary sentries that shoot. x: obelisk (emit a rotating beam instead). */
registerKind('turret', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const max = cnt(w, p);
    const mine = w.minions.filter((m) => m.wi === wi && m.kind === 'turret');
    if (mine.length >= max) mine[0].life = 0;
    const m = spawnMinion(w, 'turret', pl.x, pl.y, wi, dur(w, p.dur));
    m.st = 0.3;
    w.fx.sfx('drop');
  },
});
MINIONS.turret = (w, m, dt) => {
  const p = m.wi.p;
  m.st -= dt;
  if (p.x.obelisk) {
    m.ang += dt * 1.6;
    if (m.st <= 0) { m.st = 0.2; hitLine(w, m.x, m.y, m.ang, area(w, p.x.obelisk), 26, p.dmg, p, m.wi); hitLine(w, m.x, m.y, m.ang + Math.PI, area(w, p.x.obelisk), 26, p.dmg, p, m.wi); }
    return;
  }
  if (m.st > 0) return;
  const e = nearestEnemy(w, m.x, m.y, p.range);
  if (!e) { m.st = 0.15; return; }
  m.st = p.tick;
  m.ang = Math.atan2(e.y - m.y, e.x - m.x);
  spawnProj(w, m.x, m.y, m.ang, p, m.wi, 1);
};

/** well — gravity wells that drag enemies in, then collapse. x: shards (collapse flings shards). */
registerKind('well', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const ts = randomEnemies(w, pl.x, pl.y, p.range, cnt(w, p));
    if (!ts.length) return false;
    for (const t of ts)
      spawnZone(w, t.x, t.y, area(w, p.area), dur(w, p.dur), p.dmg, p.el, 0, wi, {
        tick: p.tick, pull: p.x.pull ?? 60, style: 'well', color: p.color, collapse: p.x.collapse ?? 4,
        onEnd: p.x.shards ? (w2, z) => { for (let i = 0; i < p.x.shards; i++) { const c = spawnProj(w2, z.x, z.y, (i / p.x.shards) * TAU, p, wi, 2); c.sprite = 'p_shard'; c.vx = Math.cos(c.rot) * 360; c.vy = Math.sin(c.rot) * 360; c.r = 7; c.life = 0.8; c.pierce = 3; c.dmg = p.dmg * 2; } } : null,
      });
    w.fx.sfx('well');
  },
});

/** ray — instant refracting light ray. bounce: refractions. x: split (each refraction forks a side ray). */
registerKind('ray', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const starts = randomEnemies(w, pl.x, pl.y, p.range, cnt(w, p));
    if (!starts.length) return false;
    for (const s of starts) {
      const visited = [s.id];
      let cur: Enemy = s;
      let px = pl.x, py = pl.y;
      for (let i = 0; i <= (p.bounce ?? 2); i++) {
        w.fx.line(px, py, cur.x, cur.y, p.color, 4, 0.16);
        hitEnemy(w, cur, p.dmg, p, wi);
        if (p.x.split) {
          const side = nearestEnemy(w, cur.x, cur.y, 220, visited, cur);
          if (side) { visited.push(side.id); w.fx.line(cur.x, cur.y, side.x, side.y, p.color, 2.5, 0.16); hitEnemy(w, side, p.dmg * p.x.split, p, wi); }
        }
        const nx = nearestEnemy(w, cur.x, cur.y, 260, visited, cur);
        if (!nx) break;
        visited.push(nx.id);
        px = cur.x; py = cur.y; cur = nx;
      }
    }
    w.fx.sfx('ray');
  },
});

/** stride — fires only as the player covers ground. x: step (distance per volley), boom (dash shockwaves). */
registerKind('stride', {
  update(w, wi) {
    const p = wi.p, pl = w.player;
    wi.acc += pl.moved;
    if (wi.acc < (p.x.step ?? 130) * pl.stats.cooldown) return;
    wi.acc = 0;
    const n = cnt(w, p);
    wi.t += 0.7;
    for (let i = 0; i < n; i++) spawnProj(w, pl.x, pl.y, wi.t + (i / n) * TAU, p, wi);
    w.fx.sfx('shot_wind');
  },
  dash(w, wi) {
    const p = wi.p, pl = w.player;
    if (!p.x.boom) return;
    const r = area(w, p.x.boom);
    w.fx.ring(pl.x, pl.y, r, p.color, 0.3);
    hitCircle(w, pl.x, pl.y, r, p.dmg * 3, p, wi);
    spawnZone(w, pl.x + pl.dashX * 150, pl.y + pl.dashY * 150, r, 0.1, p.dmg * 3, p.el, 0, wi, { delay: 0.22, once: true, style: 'strike', color: p.color, kb: 300 });
    w.fx.sfx('nova');
  },
});

/** shade — autonomous melee echoes that dash between enemies. */
registerKind('shade', {
  update(w, wi) { const n = cnt(w, wi.p); if (wi.st !== n) maintain(w, wi, 'shade', n); },
});
MINIONS.shade = (w, m, dt) => {
  const p = m.wi.p, pl = w.player;
  m.st -= dt * pl.dynHaste;
  let t = m.target;
  if (!t || !t.alive || t.hidden) {
    if (m.st > 0) { m.x += (pl.x + Math.cos(m.idx * 2.1) * 50 - m.x) * Math.min(1, dt * 3); m.y += (pl.y + Math.sin(m.idx * 2.1) * 50 - m.y) * Math.min(1, dt * 3); return; }
    const c = randomEnemies(w, pl.x, pl.y, p.range, 3);
    t = m.target = c.length ? c[m.idx % c.length] : null;
    if (!t) { m.st = 0.2; return; }
  }
  const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy) || 1;
  m.ang = Math.atan2(dy, dx);
  const step = p.speed * dt;
  if (d - t.r > step + 6) { m.x += (dx / d) * step; m.y += (dy / d) * step; return; }
  const r = area(w, p.area);
  w.fx.slash(m.x, m.y, r, m.ang, 1.6, p.color, 0.14, 0);
  hitCircle(w, t.x, t.y, r, p.dmg, p, m.wi);
  if (p.explode && !t.alive) { w.fx.ring(t.x, t.y, area(w, p.explode), p.color, 0.25); hitCircle(w, t.x, t.y, area(w, p.explode), p.dmg, p, m.wi); }
  m.target = null;
  m.st = p.cd * pl.stats.cooldown;
};

/** curse — afflict random enemies with a decaying, vulnerability-inducing hex. x: spread (on death), expire (burst when it ends), vuln. */
registerKind('curse', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    let n = cnt(w, p);
    let any = false;
    for (const e of randomEnemies(w, pl.x, pl.y, p.range, n * 3)) {
      if (n <= 0) break;
      if (e.curseT > 0) continue;
      applyCurse(w, e, wi);
      hitEnemy(w, e, p.dmg, p, wi);
      w.fx.line(pl.x, pl.y, e.x, e.y, p.color, 1.5, 0.2);
      n--; any = true;
    }
    if (!any) return false;
    w.fx.sfx('curse');
  },
});

/** rend — instant slashes that appear on enemies. x: multi (repeat cuts). zone: leaves rifts. */
registerKind('rend', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const ts = randomEnemies(w, pl.x, pl.y, p.range, cnt(w, p));
    if (!ts.length) return false;
    for (const t of ts) {
      const r = area(w, p.area);
      w.fx.slash(t.x, t.y, r * 1.3, w.rng.angle(), 1.2, p.color, 0.18, 0);
      hitCircle(w, t.x, t.y, r, p.dmg, p, wi);
      for (let i = 1; i < (p.x.multi ?? 1); i++) spawnZone(w, t.x, t.y, r, 0.1, p.dmg * 0.6, p.el, 0, wi, { delay: i * 0.12, once: true, style: 'rend', color: p.color, track: t });
      if (p.zone) zoneFrom(w, t.x, t.y, p, wi);
    }
    w.fx.sfx('rend');
  },
});

/** tornado — roaming vortices that chase enemies and drag them in. x: fling (throws enemies outward instead). */
registerKind('tornado', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const n = cnt(w, p);
    for (let i = 0; i < n; i++) {
      const a = w.rng.angle();
      spawnZone(w, pl.x, pl.y, area(w, p.area), dur(w, p.dur), p.dmg, p.el, 0, wi, { tick: p.tick, wander: p.speed, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, pull: p.x.fling ? 0 : p.x.pull ?? 50, kb: p.x.fling ?? 0, style: 'twister', color: p.color });
    }
    w.fx.sfx('wind');
  },
});

/** arc — melee slash toward the nearest enemy. x: spin (full circle), wave (launch a travelling crescent). */
registerKind('arc', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const r = area(w, p.range);
    const e = nearestEnemy(w, pl.x, pl.y, r * 1.6);
    if (!e && !p.x.spin) return false;
    const a = e ? Math.atan2(e.y - pl.y, e.x - pl.x) : pl.facing;
    const half = p.x.spin ? Math.PI : p.spread / 2;
    hitArc(w, pl.x, pl.y, r, a, half, p.dmg, p, wi);
    w.fx.slash(pl.x, pl.y, r, a, half, p.color, 0.2, 0);
    w.fx.sfx('slash');
    if (p.x.wave) {
      const n = cnt(w, p);
      for (let i = 0; i < n; i++) {
        const c = spawnProj(w, pl.x, pl.y, a + (i - (n - 1) / 2) * 0.35, p, wi, 1);
        c.sprite = 'p_crescent'; c.r = r * 0.45; c.pierce = 99; c.dmg = p.dmg * p.x.wave; c.vx = Math.cos(c.rot) * 520; c.vy = Math.sin(c.rot) * 520; c.life = 0.9; c.scale = r / 60;
      }
    }
  },
});

/** rain — a steady drizzle of small strikes around the player, biased toward enemies. */
registerKind('rain', {
  fire(w, wi) {
    const p = wi.p, pl = w.player;
    const n = cnt(w, p);
    for (let i = 0; i < n; i++) {
      let x: number, y: number;
      const ts = w.rng.next() < 0.65 ? randomEnemies(w, pl.x, pl.y, p.range, 1) : [];
      if (ts.length) { x = ts[0].x + (w.rng.next() - 0.5) * 40; y = ts[0].y + (w.rng.next() - 0.5) * 40; }
      else { const a = w.rng.angle(), d = Math.sqrt(w.rng.next()) * p.range; x = pl.x + Math.cos(a) * d; y = pl.y + Math.sin(a) * d; }
      spawnZone(w, x, y, area(w, p.area), 0.1, p.dmg, p.el, 0, wi, { delay: 0.28, once: true, style: 'drop', color: p.color, status: p.status ?? null });
    }
  },
});
