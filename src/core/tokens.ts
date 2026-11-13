/**
 * Design tokens: the single source of truth for typography, colour, spacing, outlines, shadows,
 * motion and breakpoints. Pure data (no DOM) so UI, input and render can all read it.
 * `ui/theme.ts` mirrors these into CSS custom properties at boot; styles.css only uses `var(--…)`.
 * See docs/ART_DIRECTION.md for the rules behind the values.
 */
export const TOKENS = {
  color: {
    void: '#04060b', bg: '#070a12', panel: '#0c111d', panel2: '#121929', line: '#26324d', lineHi: '#3c4d78',
    txt: '#e8eefc', dim: '#8793b0', mute: '#566082',
    /** Primary accent (cyan) – interactive, friendly. */
    acc: '#5fd4ff', accDeep: '#1d7fa8',
    /** Secondary accent (magenta) – rift / special, used sparingly. */
    acc2: '#ff6ad5',
    /** Reward / rarity. */
    gold: '#ffd24a', xp: '#5fe0b0',
    /** Hostile is always red/white. */
    hostile: '#ff4a5e', hp: '#ff5a6e', hpLow: '#ff2a44',
  },
  font: {
    display: "'Rajdhani', 'Bahnschrift', 'Segoe UI Semibold', system-ui, sans-serif",
    body: "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', sans-serif",
    mono: "ui-monospace, 'Cascadia Mono', Menlo, monospace",
    /** px at the reference width; ui scales with clamp(). */
    size: { xs: 11, sm: 13, md: 15, lg: 20, xl: 28, xxl: 44, hero: 96 },
    track: { tight: '0.04em', wide: '0.14em', caps: '0.24em' },
  },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 },
  /** Chamfer (cut-corner) size in px: the signature silhouette of every panel and button. */
  cut: { sm: 6, md: 10, lg: 16 },
  outline: { hair: 1, line: 2, strong: 3 },
  shadow: {
    panel: '0 10px 30px rgba(0,0,0,.55)',
    text: '0 1px 3px rgba(0,0,0,.8)',
  },
  /** Sprite art rules (docs/ART_DIRECTION.md). */
  art: {
    /** Outline = fill mixed this far toward white. */
    edgeTint: 0.5,
    /** Outline width, logical px. */
    line: 1.5,
    /** Grey of the fill / outline in runtime-tinted (white-authored) sprites. */
    fillGrey: 168,
    maxColors: 3,
  },
  motion: { fast: 90, base: 180, slow: 320, ease: 'cubic-bezier(.2,.8,.2,1)' },
  breakpoint: { phone: 520, tablet: 900, desktop: 1280 },
  /** Mobile joystick. `travel` is the thumb travel radius in CSS px (clamped to 40–50). */
  joystick: {
    travel: 46, base: 124, thumb: 54, deadZone: 0.12,
    /** Touches starting within `capture × travel` of the base centre grab the stick. */
    capture: 2.4,
  },
} as const;

export const clampTravel = (v: number): number => Math.max(40, Math.min(50, v));
