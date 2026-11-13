/** Mirrors core/tokens.ts into CSS custom properties. Called once at boot, before the first paint. */
import { TOKENS, clampTravel } from '../core/tokens';

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function applyTheme(root: HTMLElement = document.documentElement): void {
  const set = (k: string, v: string | number): void => root.style.setProperty('--' + k, String(v));
  for (const [k, v] of Object.entries(TOKENS.color)) set(kebab(k), v);
  for (const [k, v] of Object.entries(TOKENS.font)) if (typeof v === 'string') set('font-' + k, v);
  for (const [k, v] of Object.entries(TOKENS.font.size)) set('fs-' + k, v + 'px');
  for (const [k, v] of Object.entries(TOKENS.font.track)) set('track-' + k, v);
  for (const [k, v] of Object.entries(TOKENS.space)) set('s' + k, v + 'px');
  for (const [k, v] of Object.entries(TOKENS.cut)) set('cut-' + k, v + 'px');
  for (const [k, v] of Object.entries(TOKENS.outline)) set('ol-' + k, v + 'px');
  for (const [k, v] of Object.entries(TOKENS.shadow)) set('sh-' + k, v);
  set('t-fast', TOKENS.motion.fast + 'ms'); set('t-base', TOKENS.motion.base + 'ms'); set('t-slow', TOKENS.motion.slow + 'ms');
  set('ease', TOKENS.motion.ease);
  const j = TOKENS.joystick;
  set('joy-base', j.base + 'px'); set('joy-thumb', j.thumb + 'px'); set('joy-travel', clampTravel(j.travel) + 'px');
}
