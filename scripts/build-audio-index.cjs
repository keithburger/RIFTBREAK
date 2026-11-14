#!/usr/bin/env node
/**
 * Scans public/audio/{sfx,music} and writes public/audio/audio-index.json, the list of sample
 * files the game may load. Run after adding or removing audio files: `npm run audio:index`.
 * Plain Node, no dependencies. Exits non-zero if a file name does not follow the convention.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'public', 'audio');
const EXT = /\.(mp3|ogg|wav|m4a|webm)$/i;
const list = (dir) => {
  const d = path.join(root, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => EXT.test(f)).sort().map((f) => `${dir}/${f}`);
};
const idx = { sfx: list('sfx'), music: list('music') };
const bad = [...idx.sfx, ...idx.music].filter((f) => !/^(sfx|music)\/[a-z0-9]+(?:_[a-z0-9]+)*\.[a-z0-9]+$/.test(f));
if (bad.length) { console.error('Audio file names must be snake_case:\n  ' + bad.join('\n  ')); process.exit(1); }
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'audio-index.json'), JSON.stringify(idx, null, 2) + '\n');
console.log(`audio-index.json: ${idx.sfx.length} sfx, ${idx.music.length} music files`);
