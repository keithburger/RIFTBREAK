#!/usr/bin/env node
/**
 * ElevenLabs audio generator. Runs on a GitHub Actions runner (the API key is a repo secret and
 * the Claude sandbox cannot reach the API). Plain Node 22 + ffmpeg; no dependencies.
 *
 *   node scripts/audio/generate.mjs --probe
 *   node scripts/audio/generate.mjs --group sfx|music-menu|music-biomes|music-bosses|music|all
 *        [--only id,id] [--limit N] [--dry-run] [--force] [--max-credits N]
 *
 * Safety / cost rules
 *  - The key is read from ELEVENLABS_API_KEY only, sent only as the xi-api-key header, and scrubbed
 *    from every log line. It is never written to a file.
 *  - scripts/audio/audio-lock.json records a hash of each entry's prompt+params; an entry whose
 *    output files exist and hash matches is skipped, so nothing is ever generated twice.
 *  - Credits are measured from /v1/user/subscription before and after each item; --max-credits stops
 *    the run when the budget is spent.
 *  - Music is generated once per track; stems come from the stem-separation endpoint (same take, so
 *    they are sample-synchronized). If that endpoint is unavailable the full mix is shipped as one loop.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, ff, run, probe, levels, lufs, decodeMono, estimateTempo, loopBars, makeLoop } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CATALOG = JSON.parse(readFileSync(join(HERE, 'catalog.json'), 'utf8'));
const OUT = process.env.AUDIO_OUT_DIR || join(ROOT, 'public', 'audio'); // test seam
const LOCK_FILE = process.env.AUDIO_LOCK_FILE || join(HERE, 'audio-lock.json');
const REPORT_DIR = process.env.AUDIO_REPORT_DIR || join(HERE, 'reports');
const OUT_SFX = join(OUT, 'sfx');
const OUT_MUSIC = join(OUT, 'music');
const RAW_DIR = process.env.AUDIO_RAW_DIR || join(ROOT, 'audio-raw');
const API = (process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io').replace(/\/$/, '');
const KEY = process.env.ELEVENLABS_API_KEY || '';
const PIPELINE = 4; // bump to force a re-master of everything (changes the hash)
const SFX_MODEL = 'eleven_text_to_sound_v2';
const MUSIC_MODELS = (process.env.AUDIO_MUSIC_MODELS || 'music_v2_5,music_v1').split(','); // newest first; falls back on a 4xx
let MUSIC_MODEL = MUSIC_MODELS[0];

// Per-bus loudness targets (LUFS, integrated) so the mix starts balanced before BUS_TRIM.
const SFX_LUFS = { weapon: -21, enemy: -23, player: -17, pickup: -24, upgrade: -16, ui: -22, world: -18, boss: -13 };
const MAX_BOOST = 18; // dB; a take needing more is rejected and re-rolled
const SFX_STEREO = new Set(['boss', 'upgrade', 'world']);
const MUSIC_LUFS = -17;

// ---------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const DRY = flag('dry-run'), FORCE = flag('force'), REMASTER = flag('remaster'); // remaster: ignore the lock, keep cached takes (no credits)
const MAX_CREDITS = +opt('max-credits', '0') || Infinity;
const LIMIT = +opt('limit', '0') || Infinity;
const ONLY = new Set((opt('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean));
const GROUP = opt('group', flag('probe') ? 'probe' : 'sfx');

const scrub = (s) => { let t = String(s); if (KEY.length >= 8) t = t.split(KEY).join('***'); return t.replace(/xi-api-key[^\s,}]*/gi, 'xi-api-key: ***'); };
const log = (...a) => console.log(scrub(a.join(' ')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const lock = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : { sfx: {}, music: {} };
const saveLock = () => writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2) + '\n');
const report = { startedAt: new Date().toISOString(), group: GROUP, dry: DRY, items: [], credits: { start: null, end: null, used: 0 } };

async function api(path, { method = 'POST', json, form, query, text = false, meta = false } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'xi-api-key': KEY, ...(json ? { 'content-type': 'application/json' } : {}) },
        body: form ?? (json ? JSON.stringify(json) : undefined),
      });
      if (res.ok) {
        const data = text ? await res.text() : Buffer.from(await res.arrayBuffer());
        if (!meta) return data;
        const cost = {};
        for (const [k, v] of res.headers) if (/cost|credit|character/i.test(k)) cost[k] = v;
        return { data, cost };
      }
      const body = scrub((await res.text()).slice(0, 500));
      const err = new Error(`${method} ${path} -> HTTP ${res.status}: ${body}`);
      err.status = res.status;
      if (res.status === 429 || res.status >= 500) { lastErr = err; await sleep(1500 * 2 ** attempt); continue; }
      throw err;
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e; await sleep(1500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

async function credits() {
  try {
    const s = JSON.parse(await api('/v1/user/subscription', { method: 'GET', text: true }));
    return { used: s.character_count, limit: s.character_limit, tier: s.tier, resetUnix: s.next_character_count_reset_unix };
  } catch (e) { log('credits: unavailable (' + e.message + ')'); return null; }
}

// --- probe -----------------------------------------------------------------------------------
async function probeApi() {
  const out = { at: new Date().toISOString(), api: API.replace(/^https?:\/\//, '') };
  const sub = await credits();
  out.subscription = sub ? { tier: sub.tier, creditsUsed: sub.used, creditsLimit: sub.limit, creditsRemaining: sub.limit - sub.used } : null;
  try {
    const spec = JSON.parse(await api('/openapi.json', { method: 'GET', text: true }));
    const want = ['/v1/sound-generation', '/v1/music', '/v1/music/stem-separation', '/v1/music/compose', '/v1/music/detailed'];
    out.paths = Object.keys(spec.paths).filter((p) => /sound-generation|\/music/.test(p)).sort();
    out.endpoints = {};
    const deref = (o) => (o && o.$ref ? o.$ref.replace('#/', '').split('/').reduce((a, k) => a?.[k], spec) : o);
    for (const p of want) {
      const post = spec.paths[p]?.post;
      if (!post) { out.endpoints[p] = null; continue; }
      const body = deref(post.requestBody?.content?.['application/json']?.schema) || deref(post.requestBody?.content?.['multipart/form-data']?.schema);
      out.endpoints[p] = {
        contentTypes: Object.keys(post.requestBody?.content || {}),
        required: body?.required || [],
        properties: Object.fromEntries(Object.entries(body?.properties || {}).map(([k, v]) => { const d = deref(v); return [k, [d?.type || (d?.anyOf || []).map((a) => deref(a)?.type).filter(Boolean).join('|'), d?.enum ? d.enum.slice(0, 10) : undefined, d?.minimum, d?.maximum].filter((x) => x !== undefined)]; })),
        params: (post.parameters || []).map((q) => `${deref(q).in}:${deref(q).name}`),
      };
    }
  } catch (e) { out.openapiError = e.message; }
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, 'probe.json'), JSON.stringify(out, null, 2) + '\n');
  log(JSON.stringify(out, null, 2));
  return out;
}

// --- sfx -------------------------------------------------------------------------------------
const sfxFiles = (e) => Array.from({ length: e.n || 1 }, (_, i) => `${e.id}${(e.n || 1) > 1 ? `_${i + 1}` : ''}.mp3`);
const sfxPrompt = (e, i) => `${e.prompt}. ${CATALOG.sfxStyle}${CATALOG.sfxVariants[i] ? ' ' + CATALOG.sfxVariants[i] : ''}`.trim();
const sfxHash = (e) => sha(JSON.stringify([PIPELINE, SFX_MODEL, e.id, e.bus, e.dur, e.n || 1, e.prompt, CATALOG.sfxStyle, CATALOG.sfxVariants]));

function masterSfx(raw, outFile, bus, dur) {
  const stereo = SFX_STEREO.has(bus);
  const tmp = outFile + '.tmp.wav';
  // Trim leading/trailing silence, loosening the threshold (and finally not trimming) for very short or quiet sounds.
  let p = null;
  for (const th of ['-50dB', '-62dB', null]) {
    const trim = th ? `silenceremove=start_periods=1:start_threshold=${th}:start_silence=0.004` : 'anull';
    const chain = th ? `${trim},areverse,${trim},areverse` : trim;
    ff(['-i', raw, '-af', `${chain},aresample=${SR}`, '-ac', stereo ? '2' : '1', '-c:a', 'pcm_f32le', tmp]);
    p = probe(tmp);
    if (p.duration >= 0.08) break;
  }
  if (p.duration < 0.08) throw new Error('sound is empty after trimming');
  if (levels(tmp).max < -60) throw new Error('sound is silent');
  const target = SFX_LUFS[bus] ?? -20;
  const m = lufs(tmp);
  let gain;
  if (m != null) gain = target - m;
  else gain = -3 - levels(tmp).max; // too short to meter: peak-normalise instead
  if (gain > MAX_BOOST) throw new Error(`take too quiet (needs +${gain.toFixed(0)} dB)`); // would just amplify the noise floor
  gain = Math.max(-24, Math.min(24, gain));
  const tail = Math.min(0.03, p.duration / 4);
  ff(['-i', tmp, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:attack=1:release=30:level=false,afade=t=in:d=0.002,afade=t=out:st=${(p.duration - tail).toFixed(4)}:d=${tail.toFixed(4)}`,
    '-ar', String(SR), '-c:a', 'libmp3lame', '-b:a', stereo ? '128k' : '96k', outFile]);
  rmSync(tmp, { force: true });
  return { dur: +p.duration.toFixed(2), gain: +gain.toFixed(1), loud: m == null ? null : +m.toFixed(1) };
}

async function genSfx(e) {
  const files = sfxFiles(e), hash = sfxHash(e);
  const have = files.every((f) => existsSync(join(OUT_SFX, f)));
  if (!FORCE && !REMASTER && have && lock.sfx[e.id]?.hash === hash) return { id: e.id, status: 'skipped' };
  if (DRY) return { id: e.id, status: 'would-generate', takes: files.length };
  const info = [], costs = [];
  const NUDGE = ' Clearly audible, full volume, strong distinct transient.';
  for (let i = 0; i < files.length; i++) {
    let done = false, lastErr;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const text = sfxPrompt(e, i) + (attempt ? NUDGE : '');
      const raw = join(RAW_DIR, 'sfx', attempt ? `${files[i]}.a${attempt}` : files[i]);
      mkdirSync(dirname(raw), { recursive: true });
      const rawHash = sha(JSON.stringify([SFX_MODEL, text, e.dur, e.infl ?? 0.4]));
      const metaFile = raw + '.json';
      const cached = !FORCE && existsSync(raw) && existsSync(metaFile) && JSON.parse(readFileSync(metaFile, 'utf8')).hash === rawHash;
      try {
        if (!cached) {
          const { data: audio, cost } = await api('/v1/sound-generation', { meta: true, query: { output_format: 'mp3_44100_128' }, json: { text, duration_seconds: e.dur, prompt_influence: e.infl ?? 0.4, model_id: SFX_MODEL } });
          costs.push(cost);
          writeFileSync(raw, audio);
          writeFileSync(metaFile, JSON.stringify({ hash: rawHash }));
        }
        mkdirSync(OUT_SFX, { recursive: true });
        const r = masterSfx(raw, join(OUT_SFX, files[i]), e.bus, e.dur);
        info.push({ ...r, attempt });
        done = true;
      } catch (err) {
        if (err.status) throw err; // API/auth errors are not a quality problem
        lastErr = err;
        log(`  ${files[i]} attempt ${attempt + 1}: ${err.message}${attempt < 2 ? ' — re-rolling' : ''}`);
      }
    }
    if (!done) throw lastErr;
  }
  lock.sfx[e.id] = { hash, files, at: new Date().toISOString() };
  saveLock();
  return { id: e.id, status: 'generated', takes: files.length, info, cost: costs.filter((c) => c && Object.keys(c).length) };
}

// --- music -----------------------------------------------------------------------------------
const musicHash = (m) => sha(JSON.stringify([PIPELINE, m.id, m.bpm, m.bars || 0, m.prompt, CATALOG.musicStyle, CATALOG.stemGroups]));
const musicPrompt = (m) => `${m.prompt} ${CATALOG.musicStyle}`;

function extractZip(zip, dir) {
  mkdirSync(dir, { recursive: true });
  const f = join(dir, 'stems.zip');
  writeFileSync(f, zip);
  const r = run('unzip', ['-o', '-q', f, '-d', dir], { allowFail: true });
  if (r.status !== 0) run('python3', ['-I', '-m', 'zipfile', '-e', f, dir]);
  rmSync(f, { force: true });
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(join(d, x.name)) : [join(d, x.name)]));
  return walk(dir).filter((p) => /\.(mp3|wav|flac|ogg|m4a)$/i.test(p));
}

/** Groups stem files into up to 3 intensity layers by name; anything unrecognised joins layer 1. */
function groupStems(files) {
  const groups = { 1: [], 2: [], 3: [] };
  for (const f of files) {
    const name = f.toLowerCase().split('/').pop();
    const g = Object.entries(CATALOG.stemGroups).find(([, keys]) => keys.some((k) => name.includes(k)));
    groups[g ? g[0] : 1].push(f);
  }
  return groups;
}

function mixTo(files, out, extra = []) {
  const inputs = files.flatMap((f) => ['-i', f]);
  const filt = files.length > 1 ? `${files.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${files.length}:normalize=0[o]` : '[0:a]anull[o]';
  ff([...inputs, '-filter_complex', `${filt};[o]aresample=${SR},aformat=channel_layouts=stereo${extra.length ? ',' + extra.join(',') : ''}[x]`, '-map', '[x]', '-c:a', 'pcm_f32le', out]);
}

/** Tempo-fits, loop-folds, loudness-matches and encodes the layers. Returns a summary. */
function masterMusic(m, layers, outBase, work) {
  let bars = m.bars || loopBars(m.bpm);
  const barSec = 240 / m.bpm, ovl = Math.min(barSec, 2.5);
  let len = Math.round(bars * barSec * SR);
  const full = join(work, 'full.wav');
  mixTo(layers.flatMap((l) => l.files), full);
  const est = estimateTempo(decodeMono(full), 11025, m.bpm);
  let factor = m.bpm / est.bpm; // >1 speeds up
  const fit = Math.abs(1 - factor) > 0.004 && Math.abs(1 - factor) < 0.15;
  if (!fit) factor = 1;
  const tempo = fit ? [`atempo=${factor.toFixed(5)}`] : [];
  // phase of the beat grid after correction
  const fitted = join(work, 'fitted.wav');
  mixTo(layers.flatMap((l) => l.files), fitted, tempo);
  const ph = estimateTempo(decodeMono(fitted), 11025, m.bpm, 0.0001).phase;
  const start = ph + barSec; // skip one bar of intro, land on a beat
  const have = probe(fitted).duration;
  // a take that came back shorter than asked gets a shorter (still whole-bar, multiple-of-4) loop instead of a re-buy
  while (start + (bars * barSec) + ovl > have - 0.05 && bars > 8) bars -= 4;
  len = Math.round(bars * barSec * SR);
  const need = start + len / SR + ovl;
  if (have < need - 0.05) throw new Error(`take too short after tempo fit: ${have.toFixed(1)} s < ${need.toFixed(1)} s`);
  const wavs = layers.map((l, i) => {
    const raw = join(work, `layer${i}.wav`), loop = join(work, `loop${i}.wav`);
    mixTo(l.files, raw, tempo);
    makeLoop(raw, loop, start, len, ovl, work);
    return loop;
  });
  // one gain for all layers, measured on their sum, so the mix at peak intensity hits the target
  const sum = join(work, 'sum.wav');
  mixTo(wavs, sum);
  const measured = lufs(sum);
  const gain = Math.max(-24, Math.min(24, measured == null ? -3 - levels(sum).max : MUSIC_LUFS - measured));
  const names = wavs.map((_, i) => (wavs.length === 1 ? `${m.id}.mp3` : `${m.id}_${i + 1}.mp3`));
  mkdirSync(OUT_MUSIC, { recursive: true });
  wavs.forEach((w, i) => {
    ff(['-i', w, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.94:attack=2:release=40:level=false`, '-ar', String(SR), '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', join(OUT_MUSIC, names[i])]);
  });
  const lens = names.map((n) => probe(join(OUT_MUSIC, n)));
  return { files: names, bars, loopSec: +(len / SR).toFixed(2), estBpm: +est.bpm.toFixed(2), tempoFactor: +factor.toFixed(4), gain: +gain.toFixed(1), loud: measured == null ? null : +measured.toFixed(1), decoded: lens.map((l) => +l.duration.toFixed(3)) };
}

async function genMusic(m, caps) {
  const bars = m.bars || loopBars(m.bpm), hash = musicHash(m);
  const lk = lock.music[m.id];
  if (!FORCE && !REMASTER && lk?.hash === hash && lk.files.every((f) => existsSync(join(OUT_MUSIC, f)))) return { id: m.id, status: 'skipped' };
  const barSec = 240 / m.bpm;
  const lengthMs = Math.ceil((bars + 4) * barSec * 1000 / 100) * 100;
  if (DRY) return { id: m.id, status: 'would-generate', bpm: m.bpm, bars, requestMs: lengthMs };
  const work = mkdtempSync(join(tmpdir(), 'rb-music-'));
  const raw = join(RAW_DIR, 'music', m.id);
  mkdirSync(raw, { recursive: true });
  const fullFile = join(raw, 'full.mp3'), metaFile = join(raw, 'meta.json');
  let musicCost = null;
  const rawHash = sha(JSON.stringify([m.id, m.bpm, bars, musicPrompt(m), lengthMs]));
  const cached = !FORCE && existsSync(fullFile) && existsSync(metaFile) && JSON.parse(readFileSync(metaFile, 'utf8')).hash === rawHash;
  if (cached) log(`  ${m.id}: re-mastering from the cached take (no credits spent)`);
  else {
    rmSync(raw, { recursive: true, force: true }); mkdirSync(raw, { recursive: true });
    let take = null;
    for (;;) {
      try {
        const r = await api('/v1/music', { meta: true, query: { output_format: 'mp3_44100_128' }, json: { prompt: musicPrompt(m), music_length_ms: lengthMs, model_id: MUSIC_MODEL, force_instrumental: true } });
        take = r.data; musicCost = r.cost; break;
      } catch (e) {
        const i = MUSIC_MODELS.indexOf(MUSIC_MODEL);
        if (e.status >= 400 && e.status < 500 && e.status !== 429 && i < MUSIC_MODELS.length - 1) { log(`  ${MUSIC_MODEL} rejected (${e.status}); trying ${MUSIC_MODELS[i + 1]}`); MUSIC_MODEL = MUSIC_MODELS[i + 1]; continue; }
        throw e;
      }
    }
    writeFileSync(fullFile, take);
    writeFileSync(metaFile, JSON.stringify({ hash: rawHash, model: MUSIC_MODEL }));
  }
  const audio = readFileSync(fullFile);
  let layers = [{ files: [fullFile] }], stemInfo = 'none (full mix only)', stemReport = '';
  if (caps.stems) {
    try {
      const form = new FormData();
      form.set('file', new Blob([audio], { type: 'audio/mpeg' }), `${m.id}.mp3`);
      form.set('stem_variation_id', 'six_stems_v1');
      const stemDir = join(raw, 'stems');
      let files = existsSync(stemDir) ? readdirSync(stemDir).filter((x) => /\.(mp3|wav|flac|ogg|m4a)$/i.test(x)).map((x) => join(stemDir, x)) : [];
      if (!files.length) {
        const zip = await api('/v1/music/stem-separation', { query: { output_format: 'mp3_44100_128' }, form });
        files = extractZip(zip, stemDir);
      }
      const g = groupStems(files);
      const out = [1, 2, 3].map((k) => ({ k, files: g[k] })).filter((x) => x.files.length);
      // drop layers that are effectively silent (e.g. an absent vocal stem)
      const live = out.filter((l) => { const t = join(work, 'chk.wav'); mixTo(l.files, t); l.peak = +levels(t).max.toFixed(1); return l.peak > -40; });
      stemReport = files.map((f) => { const lv = levels(f); return `${f.split('/').pop()}:${lv.max.toFixed(0)}dB`; }).join(' ') + ' | groups ' + out.map((l) => `${l.k}=${l.files.length}f@${l.peak}dB`).join(' ');
      if (live.length >= 2) { layers = live; stemInfo = `${files.length} stems -> ${live.length} layers`; }
    } catch (e) { log(`  stems unavailable for ${m.id}: ${e.message}`); stemInfo = 'separation failed: ' + scrub(e.message).slice(0, 120); }
  }
  mkdirSync(OUT_MUSIC, { recursive: true });
  for (const f of readdirSync(OUT_MUSIC, { withFileTypes: true }).filter((x) => x.isFile() && new RegExp(`^${m.id}(_\\d+)?\\.mp3$`).test(x.name))) rmSync(join(OUT_MUSIC, f.name));
  const info = masterMusic(m, layers, m.id, work);
  rmSync(work, { recursive: true, force: true });
  lock.music[m.id] = { hash, files: info.files, at: new Date().toISOString() };
  saveLock();
  return { id: m.id, status: 'generated', model: MUSIC_MODEL, cost: musicCost, stems: stemInfo, stemReport, ...info };
}

// --- driver ----------------------------------------------------------------------------------
async function main() {
  if (!KEY && !DRY && !/^(http:\/\/(127\.0\.0\.1|localhost))/.test(API)) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(2); }
  // Fail fast (before any request) on the most likely misconfiguration: pasting the key's ID instead of its secret.
  if (KEY && !/^sk_/.test(KEY) && /elevenlabs\.io/.test(API) && !DRY) {
    console.error('ELEVENLABS_API_KEY does not look like an API key (secret keys start with "sk_"; it may be the key\'s ID). '
      + 'Create or rotate a key in ElevenLabs > Developers > API keys, copy the sk_... value shown once, and save it as the repository secret.');
    process.exit(2);
  }
  if (GROUP === 'probe') { await probeApi(); return; }
  let sfx = [], music = [];
  const g = GROUP;
  if (g === 'sfx' || g === 'all') sfx = CATALOG.sfx;
  const kinds = g === 'music' || g === 'all' ? ['menu', 'biome', 'boss'] : g === 'music-menu' ? ['menu'] : g === 'music-biomes' ? ['biome'] : g === 'music-bosses' ? ['boss'] : [];
  music = CATALOG.music.filter((m) => kinds.includes(m.kind));
  if (ONLY.size) { sfx = CATALOG.sfx.filter((e) => ONLY.has(e.id)); music = CATALOG.music.filter((m) => ONLY.has(m.id)); }
  if (!sfx.length && !music.length) { console.error('nothing selected (group/only)'); process.exit(2); }

  let caps = { stems: false };
  if (music.length) {
    const probeOut = await probeApi();
    const mp = probeOut.endpoints?.['/v1/music'];
    if (!mp) { console.error('The /v1/music endpoint is not in the API spec — refusing to generate music'); process.exit(3); }
    caps.stems = !!probeOut.endpoints?.['/v1/music/stem-separation'] || !probeOut.openapiError; // spec unreadable -> try once
    if (probeOut.endpoints?.['/v1/music/stem-separation'] === null) caps.stems = false;
    log(`capabilities: music ok, stem separation ${caps.stems ? 'available' : 'NOT available (full-mix loops)'}`);
  }
  const before = DRY ? null : await credits();
  report.credits.start = before?.used ?? null;
  if (before) log(`credits: ${before.limit - before.used} remaining of ${before.limit} (${before.tier})`);
  else if (!DRY) log('credits: meter unavailable for this key (needs the user_read scope) — spend is bounded by --limit and per-request cost headers in the run report');

  let done = 0, spent = 0;
  const queue = [...sfx.map((e) => ({ kind: 'sfx', e })), ...music.map((m) => ({ kind: 'music', e: m }))];
  const conc = 3;
  let next = 0, stop = false;
  const worker = async () => {
    while (!stop) {
      const job = queue[next++];
      if (!job) return;
      if (done >= LIMIT) { stop = true; return; }
      let r;
      try { r = job.kind === 'sfx' ? await genSfx(job.e) : await genMusic(job.e, caps); }
      catch (err) { r = { id: job.e.id, status: 'failed', error: scrub(err.message).slice(0, 300) }; }
      if (r.status === 'generated' || r.status === 'failed') done++;
      report.items.push(r);
      log(`${job.kind} ${r.id}: ${r.status}${r.error ? ' — ' + r.error : ''}${r.takes ? ` (${r.takes} takes)` : ''}${r.stems ? ` [${r.stems}]` : ''}`);
      if (r.status === 'generated' && MAX_CREDITS !== Infinity) {
        const now = await credits();
        spent = before && now ? now.used - before.used : 0;
        if (spent > MAX_CREDITS) { log(`credit budget reached (${spent} > ${MAX_CREDITS}); stopping`); stop = true; }
      }
    }
  };
  // music runs serially (long, expensive calls); sfx in parallel
  if (music.length && !sfx.length) { await worker(); } else await Promise.all(Array.from({ length: conc }, worker));
  const after = DRY ? null : await credits();
  report.credits.end = after?.used ?? null;
  report.credits.used = before && after ? after.used - before.used : null;
  report.finishedAt = new Date().toISOString();
  mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  writeFileSync(join(REPORT_DIR, `run-${GROUP}-${stamp}.json`), JSON.stringify(report, null, 2) + '\n');
  const failed = report.items.filter((i) => i.status === 'failed');
  log(`done: ${report.items.filter((i) => i.status === 'generated').length} generated, ${report.items.filter((i) => i.status === 'skipped').length} skipped, ${failed.length} failed; credits used ${report.credits.used ?? 'n/a'}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(scrub(e.stack || e.message)); process.exit(1); });
