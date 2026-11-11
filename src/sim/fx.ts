/**
 * Narrow presentation sink. The simulation reports *what happened*; renderers/audio decide how it
 * looks and sounds. Headless runs use NullFx, so gameplay never depends on presentation.
 */
export interface FxSink {
  burst(x: number, y: number, color: number, n: number, speed: number, size?: number): void;
  ring(x: number, y: number, r: number, color: number, dur?: number): void;
  line(x1: number, y1: number, x2: number, y2: number, color: number, width?: number, dur?: number): void;
  /** Crescent/cone sweep. style 0 = blade slash, 1 = spray. */
  slash(x: number, y: number, r: number, ang: number, half: number, color: number, dur: number, style: number): void;
  text(x: number, y: number, s: string, color: number, size?: number): void;
  /** Damage number; implementations may throttle. */
  dmg(x: number, y: number, amount: number, crit: boolean, color: number): void;
  shake(amount: number): void;
  flash(color: number, amount: number): void;
  sfx(name: string, x?: number, y?: number): void;
  banner(title: string, sub: string, color: number): void;
}

export class NullFx implements FxSink {
  burst(): void {}
  ring(): void {}
  line(): void {}
  slash(): void {}
  text(): void {}
  dmg(): void {}
  shake(): void {}
  flash(): void {}
  sfx(): void {}
  banner(): void {}
}
