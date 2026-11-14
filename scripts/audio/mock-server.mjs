#!/usr/bin/env node
/**
 * Local stand-in for the ElevenLabs endpoints the generator uses, so the whole pipeline (tempo fit,
 * loop seam, stems, lock file, credit accounting) can be tested without spending credits:
 *   node scripts/audio/mock-server.mjs 8787 &
 *   ELEVENLABS_API_BASE=http://127.0.0.1:8787 ELEVENLABS_API_KEY=test node scripts/audio/generate.mjs --group music-menu
 * The "music" is a synthetic drums/bass/pad/guitar groove whose tempo is deliberately 3 % off.
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SR = 44100;
const port = +(process.argv[2] || 8787);
let used = 1000;
const stemCache = new Map();

function toMp3(f32s, channels = 1) {
  const dir = mkdtempSync(join(tmpdir(), 'rb-mock-'));
  const raw = join(dir, 'a.f32'), out = join(dir, 'a.mp3');
  writeFileSync(raw, Buffer.from(f32s.buffer, f32s.byteOffset, f32s.byteLength));
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(channels), '-i', raw, '-c:a', 'libmp3lame', '-b:a', '128k', out]);
  const b = readFileSync(out); rmSync(dir, { recursive: true, force: true }); return b;
}
let seed = 1; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function sfx(dur) {
  const n = Math.round(Math.max(0.5, dur) * SR), x = new Float32Array(n);
  const f = 300 + Math.abs(rnd()) * 900;
  for (let i = 0; i < n; i++) { const t = i / SR, e = Math.exp(-t * 6); x[i] = (Math.sin(2 * Math.PI * f * t) * 0.5 + rnd() * 0.3) * e * 0.6; }
  return toMp3(x);
}

function stems(bpm, secs) {
  const n = Math.round(secs * SR), beat = (60 / bpm) * SR;
  const mk = () => new Float32Array(n);
  const drums = mk(), bass = mk(), other = mk(), guitar = mk(), piano = mk(), vocals = mk();
  const lead = Math.round(0.37 * SR); // the first beat is not at t=0, like a real take
  for (let k = 0; ; k++) {
    const s = Math.round(lead + k * beat); if (s >= n) break;
    for (let i = 0; i < 0.06 * SR && s + i < n; i++) drums[s + i] += rnd() * Math.exp(-i / (0.012 * SR)) * (k % 4 === 0 ? 0.9 : k % 2 ? 0.55 : 0.3);
    for (let i = 0; i < 0.4 * SR && s + i < n; i++) bass[s + i] += Math.sin((2 * Math.PI * (k % 8 < 4 ? 55 : 65) * i) / SR) * Math.exp(-i / (0.18 * SR)) * 0.6;
    for (let i = 0; i < 0.2 * SR && s + i < n; i++) guitar[s + i] += Math.sin((2 * Math.PI * (330 + (k % 4) * 55) * i) / SR) * Math.exp(-i / (0.07 * SR)) * 0.3;
  }
  for (let i = 0; i < n; i++) other[i] = (Math.sin((2 * Math.PI * 220 * i) / SR) + Math.sin((2 * Math.PI * 330 * i) / SR)) * 0.12;
  return { drums, bass, other, guitar, piano, vocals };
}

const sumStems = (st) => { const n = st.drums.length, o = new Float32Array(n); for (const k in st) for (let i = 0; i < n; i++) o[i] += st[k][i]; return o; };

function zip(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'rb-zip-'));
  for (const [name, buf] of Object.entries(entries)) writeFileSync(join(dir, name), buf);
  const out = join(dir, 'out.zip');
  spawnSync('python3', ['-I', '-c', `import zipfile,sys,os\nz=zipfile.ZipFile(sys.argv[1],'w')\nfor f in sorted(os.listdir(sys.argv[2])):\n  if f!='out.zip': z.write(os.path.join(sys.argv[2],f),f)\nz.close()`, out, dir]);
  const b = readFileSync(out); rmSync(dir, { recursive: true, force: true }); return b;
}

const spec = { paths: {
  '/v1/sound-generation': { post: { requestBody: { content: { 'application/json': { schema: { required: ['text'], properties: { text: { type: 'string' }, duration_seconds: { type: 'number', minimum: 0.5, maximum: 30 } } } } } } } },
  '/v1/music': { post: { requestBody: { content: { 'application/json': { schema: { properties: { prompt: { type: 'string' }, music_length_ms: { type: 'integer', minimum: 3000, maximum: 600000 } } } } } } } },
  '/v1/music/stem-separation': { post: { requestBody: { content: { 'multipart/form-data': { schema: { required: ['file'], properties: { file: { type: 'string' } } } } } } } },
} };

createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const path = req.url.split('?')[0];
  if (!req.headers['xi-api-key']) { res.writeHead(401).end('{"detail":"no key"}'); return; }
  const send = (code, type, data) => { res.writeHead(code, { 'content-type': type }); res.end(data); };
  if (path === '/v1/user/subscription') return send(200, 'application/json', JSON.stringify({ tier: 'creator', character_count: used, character_limit: 100000 }));
  if (path === '/openapi.json') return send(200, 'application/json', JSON.stringify(spec));
  if (path === '/v1/sound-generation') { const j = JSON.parse(body); used += Math.round((j.duration_seconds || 1) * 20); return send(200, 'audio/mpeg', sfx(j.duration_seconds)); }
  if (path === '/v1/music') {
    const j = JSON.parse(body); const bpm = +(/exactly (\d+) BPM/.exec(j.prompt)?.[1] ?? 100) * 1.03;
    const st = stems(bpm, j.music_length_ms / 1000); used += Math.round(j.music_length_ms / 10);
    const mp3 = toMp3(sumStems(st)); stemCache.set(createHash('md5').update(mp3).digest('hex'), st);
    return send(200, 'audio/mpeg', mp3);
  }
  if (path === '/v1/music/stem-separation') {
    // the mock separates the most recently composed take (sequential use only)
    const st = [...stemCache.values()].at(-1);
    if (!st) return send(400, 'application/json', '{"detail":"unknown take"}');
    used += 3000;
    return send(200, 'application/zip', zip(Object.fromEntries(Object.entries(st).map(([k, v]) => [`${k}.mp3`, toMp3(v)]))));
  }
  send(404, 'application/json', '{"detail":"not found"}');
}).listen(port, '127.0.0.1', () => console.log(`mock elevenlabs on ${port}`));
