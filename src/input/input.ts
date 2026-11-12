/** Input abstraction: keyboard (rebindable), touch joystick + dash button, and gamepad. */
import type { InputState } from '../sim/types';

export class Input {
  keys: Record<string, string>;
  private down = new Set<string>();
  private dashLatch = false;
  private state: InputState = { mx: 0, my: 0, dash: false };
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private padDash = false;
  enabled = true;
  onPause: () => void = () => {};
  onKey: (code: string) => void = () => {};
  /** Joystick visual callback (origin + knob in client px, or null when released). */
  onJoy: (j: { ox: number; oy: number; x: number; y: number } | null) => void = () => {};
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
    on(surface, 'touchstart', (e: TouchEvent) => {
      this.touchSeen = true;
      if (!this.enabled) return;
      for (const t of Array.from(e.changedTouches)) if (this.joy.id < 0) { this.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY }; this.onJoy(this.joy); }
      e.preventDefault();
    }, { passive: false });
    on(surface, 'touchmove', (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joy.id) {
        this.joy.x = t.clientX; this.joy.y = t.clientY;
        const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, d = Math.hypot(dx, dy);
        if (d > 70) { this.joy.ox = this.joy.x - (dx / d) * 70; this.joy.oy = this.joy.y - (dy / d) * 70; } // origin follows the thumb
        this.onJoy(this.joy);
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e: TouchEvent): void => { for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joy.id) { this.joy.id = -1; this.onJoy(null); } };
    on(surface, 'touchend', end);
    on(surface, 'touchcancel', end);
  }

  pressDash(): void { if (this.enabled) this.dashLatch = true; }

  /** Clear all held state. Called whenever an overlay opens so nothing "sticks". */
  reset(): void {
    this.down.clear();
    this.dashLatch = false;
    this.joy.id = -1;
    this.onJoy(null);
  }

  /** Sample once per simulation step. The dash press is consumed. */
  sample(): InputState {
    const s = this.state, k = this.keys, d = this.down;
    if (!this.enabled) { s.mx = s.my = 0; s.dash = false; return s; }
    let mx = (d.has(k.right) || d.has('ArrowRight') ? 1 : 0) - (d.has(k.left) || d.has('ArrowLeft') ? 1 : 0);
    let my = (d.has(k.down) || d.has('ArrowDown') ? 1 : 0) - (d.has(k.up) || d.has('ArrowUp') ? 1 : 0);
    if (this.joy.id >= 0) {
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, len = Math.hypot(dx, dy);
      if (len > 8) { const m = Math.min(1, len / 55); mx = (dx / len) * m; my = (dy / len) * m; }
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
