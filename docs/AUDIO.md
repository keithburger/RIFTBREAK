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
