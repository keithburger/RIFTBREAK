/** Dependency-boundary validation: enforces the layering described in docs/ARCHITECTURE.md. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
const layerOf = (file: string): string => file.replace(/\\/g, '/').split('/')[1];
const importsOf = (file: string): string[] => [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'|import\s+'([^']+)'/g)].map((m) => m[1] ?? m[2]);

/** layer → layers it may import from */
const ALLOWED: Record<string, string[]> = {
  core: ['core'],
  sim: ['core', 'sim'],
  content: ['core', 'sim', 'content'],
  save: ['save'],
  audio: ['audio'],
  input: ['core', 'sim', 'input'], // core: design tokens (joystick geometry)
  render: ['core', 'sim', 'render'],
  ui: ['core', 'sim', 'render', 'save', 'ui'], // core: design tokens
  app: ['core', 'sim', 'content', 'render', 'audio', 'input', 'save', 'ui', 'app'],
};

describe('architecture boundaries', () => {
  const files = walk('src');
  it('every source file belongs to a known layer', () => {
    for (const f of files) expect(Object.keys(ALLOWED), f).toContain(layerOf(f));
  });
  it('layers only import what they are allowed to', () => {
    const bad: string[] = [];
    for (const f of files) {
      const layer = layerOf(f);
      for (const imp of importsOf(f)) {
        if (!imp.startsWith('.')) {
          if (imp === 'pixi.js' && layer !== 'render') bad.push(`${f} imports pixi.js`);
          continue;
        }
        const target = join(f, '..', imp).replace(/\\/g, '/').split('/')[1];
        if (!ALLOWED[layer].includes(target)) bad.push(`${f} (${layer}) → ${imp} (${target})`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('simulation, content and core never touch the DOM, storage, timers or Math.random', () => {
    const bad: string[] = [];
    for (const f of files) {
      if (!['core', 'sim', 'content'].includes(layerOf(f))) continue;
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const re of [/\bdocument\./, /\bwindow\./, /\blocalStorage\b/, /\bMath\.random\b/, /\bDate\.now\b/, /\bperformance\.now\b/, /\bsetTimeout\b/, /\brequestAnimationFrame\b/])
        if (re.test(src)) bad.push(`${f} uses ${re.source}`);
    }
    expect(bad).toEqual([]);
  });
  it('no source file is a monolith', () => {
    for (const f of files) expect(readFileSync(f, 'utf8').split('\n').length, f).toBeLessThan(700);
  });
});
