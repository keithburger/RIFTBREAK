/**
 * Audio post-processing helpers (plain Node + ffmpeg, no dependencies). Used by generate.mjs and
 * unit-tested in tests/audio-pipeline.test.ts with synthetic signals.
 */
import { spawnSync } from 'node:child_process';

export const SR = 44100;

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 1 << 30, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${cmd} failed (${r.status}): ${String(r.stderr).slice(-600)}`);
  return r;
}
export const ff = (args, opts = {}) => run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-loglevel', opts.loglevel || 'error', ...args], opts);

/** Duration in seconds (container) and exact sample count of the first audio stream. */
export function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration,duration_ts,sample_rate,channels:format=duration', '-of', 'json', file]);
  const j = JSON.parse(r.stdout);
  const s = j.streams?.[0] ?? {};
  return { duration: +(s.duration ?? j.format?.duration ?? 0), samples: s.duration_ts ? +s.duration_ts : 0, sr: +(s.sample_rate ?? 0), ch: +(s.channels ?? 0) };
}

/** Max level (dBFS) and mean level via ffmpeg's volumedetect. -Infinity when silent. */
export function levels(file) {
  const r = ff(['-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { allowFail: true, loglevel: 'info' });
  const max = /max_volume: (-?[\d.]+|-inf) dB/.exec(String(r.stderr)), mean = /mean_volume: (-?[\d.]+|-inf) dB/.exec(String(r.stderr));
  const n = (m) => (m && m[1] !== '-inf' ? +m[1] : -Infinity);
  return { max: n(max), mean: n(mean) };
}

/** Integrated loudness (LUFS) via loudnorm's analysis pass; null when it cannot be measured. */
export function lufs(file) {
  const r = ff(['-i', file, '-af', 'loudnorm=I=-16:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { allowFail: true, loglevel: 'info' });
  const text = String(r.stderr);
  const m = /"input_i"\s*:\s*"(-?[\d.]+|-inf)"/.exec(text);
  if (!m || m[1] === '-inf') return null;
  const v = +m[1];
  return Number.isFinite(v) && v > -69 ? v : null;
}

/** Decodes to mono float32 at `sr` and returns the samples. */
export function decodeMono(file, sr = 11025) {
  const r = ff(['-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { binary: true });
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)));
}

/** Onset-strength envelope (half-wave-rectified RMS rise) at `rate` frames per second. */
export function onsetEnvelope(x, sr, rate = 200) {
  const hop = Math.max(1, Math.round(sr / rate)), n = Math.floor(x.length / hop);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < hop; j++) { const v = x[i * hop + j]; s += v * v; } e[i] = Math.sqrt(s / hop); }
  const o = new Float32Array(n);
  let mean = 0;
  for (let i = 1; i < n; i++) { const d = e[i] - e[i - 1]; o[i] = d > 0 ? d : 0; mean += o[i]; }
  mean /= Math.max(1, n);
  for (let i = 0; i < n; i++) o[i] = Math.max(0, o[i] - mean * 0.5);
  return { env: o, rate: sr / hop };
}

/** Comb score of a tempo/phase: mean onset strength sampled on the beat grid (linear interpolation). */
function comb(env, rate, period, phase) {
  let s = 0, k = 0;
  for (let t = phase; t * rate < env.length - 1; t += period) {
    const p = t * rate, i = Math.floor(p), f = p - i;
    s += env[i] * (1 - f) + env[i + 1] * f; k++;
  }
  return k ? s / k : 0;
}

/**
 * Estimates the tempo within ±`span` of `target` BPM and the beat phase (seconds into the file of
 * a beat). Searching only near the intended tempo removes half/double-time ambiguity.
 */
export function estimateTempo(x, sr, target, span = 0.14) {
  const { env, rate } = onsetEnvelope(x, sr);
  let best = { bpm: target, phase: 0, score: -1 };
  const steps = 560;
  for (let i = 0; i <= steps; i++) {
    const bpm = target * (1 - span + (2 * span * i) / steps), period = 60 / bpm;
    // bar-level accent (4 beats) weighs in so a strong 1 beats an equally regular off-beat
    for (let p = 0; p < 24; p++) {
      const phase = (p / 24) * period;
      const sc = comb(env, rate, period, phase) + 0.35 * comb(env, rate, period * 4, phase);
      if (sc > best.score) best = { bpm, phase, score: sc };
    }
  }
  // refine the phase on a finer grid at the chosen tempo
  const period = 60 / best.bpm;
  for (let p = -12; p <= 12; p++) {
    const phase = (best.phase + (p / 12) * (period / 24) + period) % period;
    const sc = comb(env, rate, period, phase) + 0.35 * comb(env, rate, period * 4, phase);
    if (sc > best.score) best = { bpm: best.bpm, phase, score: sc };
  }
  return best;
}

/** Loop length in whole bars: the largest multiple of 4 whose duration stays ≤ maxSec. */
export function loopBars(bpm, maxSec = 44) {
  const bar = 240 / bpm;
  return Math.max(4, Math.floor(maxSec / bar / 4) * 4);
}

/**
 * Turns a longer take (PCM wav) into an exactly `len`-sample loop whose wrap is seamless: the audio
 * that follows the loop end is folded (equal-power crossfade) over the loop start, so the last sample
 * flows straight into the first. `start` seconds are skipped, `ovl` seconds are folded. Done in
 * small sample-exact passes (one combined filtergraph is fragile across ffmpeg versions).
 */
export function makeLoop(input, output, start, len, ovl, tmp) {
  const s0 = Math.round(start * SR), o = Math.round(ovl * SR);
  const fmt = `aformat=sample_fmts=flt:sample_rates=${SR}:channel_layouts=stereo`;
  const seg = (name, from, to, extra = '') => {
    const f = `${tmp}/${name}.wav`;
    ff(['-i', input, '-af', `${fmt},atrim=start_sample=${from}:end_sample=${to},asetpts=N/SR/TB${extra}`, '-c:a', 'pcm_f32le', f]);
    return f;
  };
  const head = seg('head', s0, s0 + o, `,afade=t=in:d=${ovl.toFixed(5)}:curve=qsin`);
  const tail = seg('tail', s0 + len, s0 + len + o, `,afade=t=out:d=${ovl.toFixed(5)}:curve=qsin`);
  const rest = seg('rest', s0 + o, s0 + len);
  const mid = `${tmp}/mid.wav`;
  ff(['-i', head, '-i', tail, '-filter_complex', `amix=inputs=2:normalize=0:duration=longest,${fmt}`, '-c:a', 'pcm_f32le', mid]);
  ff(['-i', mid, '-i', rest, '-filter_complex', `[0:a][1:a]concat=n=2:v=0:a=1,atrim=end_sample=${len},asetpts=N/SR/TB`, '-c:a', 'pcm_f32le', output]);
}
