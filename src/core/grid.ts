/** Uniform spatial hash for circle entities. Rebuilt every simulation step. */
export interface GridItem {
  x: number;
  y: number;
  r: number;
  _q: number;
}

export class Grid<T extends GridItem> {
  private cells = new Map<number, T[]>();
  private used: T[][] = [];
  private stamp = 1;
  constructor(readonly size = 72) {}

  clear(): void {
    for (const c of this.used) c.length = 0;
    this.used.length = 0;
  }

  insert(it: T): void {
    const s = this.size;
    const x0 = Math.floor((it.x - it.r) / s);
    const x1 = Math.floor((it.x + it.r) / s);
    const y0 = Math.floor((it.y - it.r) / s);
    const y1 = Math.floor((it.y + it.r) / s);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = ((cx & 0xffff) << 16) | (cy & 0xffff);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        if (c.length === 0) this.used.push(c);
        c.push(it);
      }
  }

  /** Collect items whose circles overlap the query circle. Appends to `out` and returns it. */
  query(x: number, y: number, r: number, out: T[] = []): T[] {
    const s = this.size;
    const st = ++this.stamp;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.cells.get(((cx & 0xffff) << 16) | (cy & 0xffff));
        if (!c) continue;
        for (let i = 0; i < c.length; i++) {
          const it = c[i];
          if (it._q === st) continue;
          it._q = st;
          const dx = it.x - x;
          const dy = it.y - y;
          const rr = r + it.r;
          if (dx * dx + dy * dy <= rr * rr) out.push(it);
        }
      }
    return out;
  }
}
