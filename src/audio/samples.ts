/**
 * Sample bank: discovers files from `audio/audio-index.json`, decodes them lazily with a small
 * concurrency limit and never throws — a missing, corrupt or undecodable file simply stays absent
 * and the synthesized recipe keeps playing.
 */
export interface AudioIndex { sfx: string[]; music: string[] }

const EXT = '(?:mp3|ogg|wav|m4a|webm)';
const SFX_RE = new RegExp(`^sfx/(.+?)(?:_(\\d+))?\\.${EXT}$`);
const MUSIC_RE = new RegExp(`^music/(.+?)(?:_(\\d+))?\\.${EXT}$`);

type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

export class SampleBank {
  private sfxFiles = new Map<string, string[]>();
  private musicFiles = new Map<string, string[]>();
  private buffers = new Map<string, AudioBuffer>();
  private inflight = new Map<string, Promise<AudioBuffer | null>>();
  private failed = new Set<string>();
  private waiting: (() => void)[] = [];
  private active = 0;
  ready = false;
  decoded = 0;

  constructor(private ctx: BaseAudioContext, private base = 'audio/', private fetcher: Fetcher = (u) => fetch(u), private maxParallel = 3) {}

  /** Reads the index. Resolves (never rejects) with the number of indexed files. */
  async init(): Promise<number> {
    try {
      const res = await this.fetcher(this.base + 'audio-index.json');
      if (res.ok) this.setIndex(await res.json() as AudioIndex);
    } catch { /* offline / missing index: synth only */ }
    this.ready = true;
    return this.count();
  }

  setIndex(idx: AudioIndex): void {
    this.sfxFiles.clear(); this.musicFiles.clear();
    const add = (list: string[] | undefined, re: RegExp, into: Map<string, string[]>): void => {
      const tmp = new Map<string, { n: number; f: string }[]>();
      for (const f of list ?? []) {
        const m = re.exec(f);
        if (!m) continue;
        const a = tmp.get(m[1]) ?? [];
        a.push({ n: m[2] ? +m[2] : 0, f });
        tmp.set(m[1], a);
      }
      for (const [k, a] of tmp) into.set(k, a.sort((p, q) => p.n - q.n).map((x) => x.f));
    };
    add(idx.sfx, SFX_RE, this.sfxFiles);
    add(idx.music, MUSIC_RE, this.musicFiles);
  }

  count(): number { let n = 0; for (const a of this.sfxFiles.values()) n += a.length; for (const a of this.musicFiles.values()) n += a.length; return n; }
  sfxNames(): string[] { return [...this.sfxFiles.keys()]; }
  variants(name: string): string[] | undefined { return this.sfxFiles.get(name); }
  musicStems(id: string): string[] | undefined { return this.musicFiles.get(id); }
  get(file: string): AudioBuffer | undefined { return this.buffers.get(file); }
  put(file: string, buf: AudioBuffer): void { this.buffers.set(file, buf); }
  has(file: string): boolean { return this.buffers.has(file); }

  /** Starts (once) loading and decoding a file; resolves to null on any failure. */
  load(file: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(file);
    if (have) return Promise.resolve(have);
    if (this.failed.has(file)) return Promise.resolve(null);
    let p = this.inflight.get(file);
    if (!p) {
      p = this.slot().then(() => this.fetchDecode(file)).finally(() => this.release());
      this.inflight.set(file, p);
    }
    return p;
  }

  /** Fire-and-forget loading of several files, in the order given. */
  preload(files: string[]): void { for (const f of files) void this.load(f); }

  evict(file: string): void { this.buffers.delete(file); this.inflight.delete(file); }

  private slot(): Promise<void> {
    if (this.active < this.maxParallel) { this.active++; return Promise.resolve(); }
    return new Promise((r) => this.waiting.push(() => { this.active++; r(); }));
  }
  private release(): void { this.active--; this.waiting.shift()?.(); }

  private async fetchDecode(file: string): Promise<AudioBuffer | null> {
    try {
      const res = await this.fetcher(this.base + file);
      if (!res.ok) throw new Error('http');
      const data = await res.arrayBuffer();
      const buf = await new Promise<AudioBuffer>((ok, bad) => {
        const p = this.ctx.decodeAudioData(data, ok, bad); // callback form for older Safari
        if (p && typeof p.then === 'function') p.then(ok, bad);
      });
      this.buffers.set(file, buf);
      this.decoded++;
      return buf;
    } catch {
      this.failed.add(file);
      this.inflight.delete(file);
      return null;
    }
  }
}
