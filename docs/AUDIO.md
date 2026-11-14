# Audio

`src/audio/` is self-contained (imports nothing outside `audio/`). The sim only reports *what
happened* through `fx.sfx(name, x?, y?)`; `app/game.ts` forwards it to `AudioSys` and feeds it
read-only state (listener position, music intensity, low-health danger). Audio never mutates the world.

## Two sources, one fallback rule

Every sound has a **synthesized recipe** (`synth.ts`) that is always available. A **sample** from
`public/audio/` replaces it only once it has been indexed, fetched and decoded. A missing file, a 404,
a failed decode or a not-yet-loaded sample all play the recipe, so the game is never silent by accident
and works with zero asset files.

## Adding or replacing audio (no code changes)

SFX: `public/audio/sfx/<name>.mp3` — `<name>` is the string the game emits (`boss_intro`, `hurt`,
`shot_fire`, …). Variants: `<name>_1.mp3`, `<name>_2.mp3` … (random, never the same twice in a row).
Music: `public/audio/music/<track>.mp3` is one loop; `<track>_1/_2/_3.mp3` are stems (identical length and
tempo) that start sample-aligned and fade in at intensity 0 / 1 / 2. Track ids: `menu`, each biome id,
each boss id, and `boss` (generic fallback). Loops should match the biome tempo in `content/biomes.ts`
(crossfades are quantized to bar lines); keep loops ≤ 45 s — stems are decoded to memory
(~16 MB per stereo stem) and only the menu + current track are kept.

Then run `npm run audio:index` (writes `public/audio/audio-index.json`, the list of loadable files) and
commit both. Names must be lower snake_case. To balance loudness, edit `BUS_TRIM` / per-sound `vol` in
`manifest.ts` instead of re-exporting.

## Mix metadata (`manifest.ts`)

Per sound: bus, priority (0 ambient → 3 critical), max simultaneous voices, throttle gap, pitch spread,
spatial flag, music-duck (`amt`, `hold`), optional synth `sub` layer stacked under a sampled hit.
Boss / level-up / evolve / hurt are priority 3; xp, shards, kills, enemy shots and every `shot_*` are 0.

## Runtime behaviour

- **Voice pool**: `MAX_VOICES` (28) total, per-sound polyphony, per-sound throttle. When full, the
  lowest-priority oldest voice is stolen (short fade-out); a sound that outranks nothing is dropped.
  Expired voices are released lazily — no per-voice timers or `onended` closures.
- **Spatial**: positioned weapon/enemy sounds pan (StereoPanner, only when off-centre) and attenuate with
  distance from the player. UI/player/boss/upgrade sounds are never spatial.
- **Ducking**: big moments dip the music and release smoothly; a lighter duck never undoes a deeper one.
- **Danger**: below 35 % HP the music low-passes and a heartbeat plays; both release when healthy.
- **Music**: sampled stems or the generative sequencer behind one interface. Track changes crossfade at
  the next bar line (max wait 3 s); intensity (0 calm / 1 combat / 2 peak, from crowd size and boss
  phase) changes smoothly. A track whose samples are still loading starts on the generative music and
  hands over at a bar line. Bosses use their own track, else `boss`, else the faster generative boss mix.
- **Performance**: samples load lazily in priority order (≤ 3 parallel); the tab hidden → context
  suspended; a compressor limits the master bus; one 60 ms timer pumps music scheduling.
- **Volumes**: master / effects / music sliders are smoothed (no zipper noise).

## Verifying

`tests/audio.test.ts` (fake Web Audio) checks that every sound the code can emit — scanned from the
source *and* recorded from simulated full runs and all eight bosses — has a recipe and metadata, plus
pooling, stealing, ducking, spatialisation, sample fallback and music crossfades.
In a browser, `?dev` exposes `__rift.audio()` (voices, drops, steals, per-sound play counts, music state).

## Importing generated audio by hand

Automated delivery is not available in the Claude session (its network policy blocks both the
ElevenLabs API and the download host, and no API key is provisioned), so import is manual:

1. In ElevenLabs (Sound Effects / Music), generate a sound and download it. Keep SFX short (≤ 2 s;
   bosses ≤ 4 s) — one clear sound per generation. Don't regenerate a sound you already have.
2. Rename it to its **event id** (below) and put it in `public/audio/sfx/` (or `public/audio/music/`).
   Several takes of one sound: `slash_1.mp3`, `slash_2.mp3` …
3. Optional optimisation (needs ffmpeg), mono 96 kbps SFX normalised to a common loudness:
   `ffmpeg -i in.wav -ac 1 -af loudnorm=I=-18:TP=-2 -b:a 96k public/audio/sfx/<id>.mp3`
   Music: `ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5 -b:a 128k public/audio/music/<track>.mp3`
4. `npm run audio:index`, then `npm test` — `tests/audio.test.ts` fails on a file whose name is not a
   real event id/track, or if the index is stale. Commit the files and `audio-index.json`.

Anything without a file keeps its synthesized sound, so you can import in any order. Suggested order:
weapon sounds and bosses first, then biome/boss music, then UI.

SFX event ids (by mix bus), plus `shot_<element>` for each of: fire frost shock toxin water wind earth arcane light void
- **weapon**: `slash` `whip` `rend` `strike` `zap` `beam` `ray` `lob` `drop` `flame` `nova` `quake` `well` `wind` `wave` `curse` `react` `boom` `bigboom`
- **enemy**: `kill` `elite_die` `eshot` `mortar` `charge` `beep` `reveal` `blink` `block` `elite`
- **player**: `hurt` `dash` `heal` `heartbeat` `revive` `defeat` `victory`
- **pickup**: `xp` `shard` `magnet` `chest`
- **upgrade**: `relic` `levelup` `evolve`
- **ui**: `select` `click`
- **world**: `event` `biome`
- **boss**: `boss_intro` `boss_phase` `boss_break` `boss_die` `ray_charge` `ray_fire`

Music track ids: `menu`, `verdant_fracture`, `ironvault_foundry`, `drowned_archive`, `null_expanse`,
`boss` (generic), and per boss: `mycelial_overmind` `tempest_conductor` `arachnoid_siege_engine`
`cinder_colossus` `tidal_leviathan` `prism_seraph` `hollow_monarch` `rift_sovereign`.
Match each biome loop to its tempo in `src/content/biomes.ts` (96 / 112 / 104 / 120 BPM) and make loops
seamless (loop-point on a bar line); stems of one track must be identical in length.
