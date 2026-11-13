/** Input abstraction: keyboard (rebindable), touch joystick + dash button, and gamepad. */
import { TOKENS, clampTravel } from '../core/tokens';
import type { InputState } from '../sim/types';

const JOY = { ...TOKENS.joystick, travel: clampTravel(TOKENS.joystick.travel) };

export class Input {
  keys: Record<string, string>;
  private down = new Set<string>();
  private dashLatch = false;
  private state: InputState = { mx: 0, my: 0, dash: false };
  private joy = { id: -1, bx: 0, by: 0, travel: JOY.travel, dx: 0, dy: 0, mag: 0 };
  private padDash = false;
  enabled = true;
  onPause: () => void = () => {};
  onKey: (code: string) => void = () => {};
  /** Joystick visual callback: clamped thumb offset from the base centre in CSS px, null on release. */
  onJoy: (j: { x: number; y: number; active: boolean } | null) => void = () => {};
  /** Supplies the fixed base centre (client px) and travel radius, or null when no stick is shown. */
  joyBase: () => { x: number; y: number; travel: number } | null = () => null;
  touchSeen = false;
  private off: (() => void)[] = [];

  constructor(keys: Record<string, string>, private surface: HTMLElement) {
    this.keys = keys;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, ev: K | string, fn: (e: never) => void, opt?: AddEventListenerOptions): void => {
      t.addEventListener(ev, fn as EventListener, opt);
      this.off.push(() => t.removeEventListener(ev, fn as EventListener));
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.onKey(e.code);
      if (e.code === this.keys.pause) { this.onPause(); e.preventDefault(); return; }
      this.down.add(e.code);
      if (e.code === this.keys.dash) { this.dashLatch = true; e.preventDefault(); }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.down.delete(e.code));
    on(window, 'blur', () => this.reset());
    // Fixed-base joystick on pointer events: the base never moves, the thumb is clamped to `travel`
    // px, and direction persists (normalised) when the finger leaves the visual radius.
    const joyAt = (e: PointerEvent): void => {
      const dx = e.clientX - this.joy.bx, dy = e.clientY - this.joy.by, len = Math.hypot(dx, dy);
      const tr = this.joy.travel;
      this.joy.dx = len > 1e-6 ? dx / len : 0; this.joy.dy = len > 1e-6 ? dy / len : 0;
      this.joy.mag = Math.min(1, len / tr);
      const vis = Math.min(len, tr);
      this.onJoy({ x: this.joy.dx * vis, y: this.joy.dy * vis, active: true });
    };
    const joyEnd = (e: PointerEvent): void => {
      if (e.pointerId !== this.joy.id) return;
      this.releaseJoy();
      try { surface.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    on(surface, 'pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      this.touchSeen = true;
      if (!this.enabled || this.joy.id >= 0) return;
      const base = this.joyBase();
      if (!base) return;
      const reach = JOY.capture * base.travel;
      if (Math.hypot(e.clientX - base.x, e.clientY - base.y) > reach) return;
      this.joy.id = e.pointerId; this.joy.bx = base.x; this.joy.by = base.y; this.joy.travel = base.travel;
      try { surface.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
      joyAt(e);
      e.preventDefault();
    });
    on(surface, 'pointermove', (e: PointerEvent) => { if (e.pointerId === this.joy.id) { joyAt(e); e.preventDefault(); } });
    on(surface, 'pointerup', joyEnd);
    on(surface, 'pointercancel', joyEnd);
    on(surface, 'lostpointercapture', joyEnd);
    on(surface, 'touchstart', () => { this.touchSeen = true; }, { passive: true });
  }

  /** Release the stick: input drops to zero on the very next sample, thumb recentres. */
  private releaseJoy(): void {
    if (this.joy.id < 0) return;
    this.joy.id = -1; this.joy.mag = 0;
    this.onJoy(null);
  }

  pressDash(): void { if (this.enabled) this.dashLatch = true; }

  /** Clear all held state. Called whenever an overlay opens so nothing "sticks". */
  reset(): void {
    this.down.clear();
    this.dashLatch = false;
    this.releaseJoy();
  }

  /** Sample once per simulation step. The dash press is consumed. */
  sample(): InputState {
    const s = this.state, k = this.keys, d = this.down;
    if (!this.enabled) { s.mx = s.my = 0; s.dash = false; return s; }
    let mx = (d.has(k.right) || d.has('ArrowRight') ? 1 : 0) - (d.has(k.left) || d.has('ArrowLeft') ? 1 : 0);
    let my = (d.has(k.down) || d.has('ArrowDown') ? 1 : 0) - (d.has(k.up) || d.has('ArrowUp') ? 1 : 0);
    if (this.joy.id >= 0) {
      const dz = JOY.deadZone;
      if (this.joy.mag > dz) { const m = (this.joy.mag - dz) / (1 - dz); mx = this.joy.dx * m; my = this.joy.dy * m; }
    }
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      if (Math.hypot(p.axes[0], p.axes[1]) > 0.25) { mx = p.axes[0]; my = p.axes[1]; }
      const pressed = !!(p.buttons[0]?.pressed || p.buttons[5]?.pressed || p.buttons[7]?.pressed);
      if (pressed && !this.padDash) this.dashLatch = true;
      this.padDash = pressed;
    }
    s.mx = mx; s.my = my; s.dash = this.dashLatch;
    this.dashLatch = false;
    return s;
  }

  destroy(): void { for (const f of this.off) f(); }
}
