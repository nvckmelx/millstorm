import type { Snapshot } from "@millstorm/shared";

/** Keeps the last two snapshots and interpolates between them, one snapshot interval behind. */
export class SnapBuffer {
  prev: Snapshot | null = null;
  cur: Snapshot | null = null;
  private prevAt = 0;
  private curAt = 0;

  push(s: Snapshot): void {
    if (this.cur && s.tick <= this.cur.tick) return;
    this.prev = this.cur;
    this.prevAt = this.curAt;
    this.cur = s;
    this.curAt = performance.now();
  }

  reset(): void {
    this.prev = this.cur = null;
  }

  alpha(now = performance.now()): number {
    if (!this.prev) return 1;
    const span = Math.max(1, this.curAt - this.prevAt);
    return Math.min(1, Math.max(0, (now - this.curAt) / span));
  }
}
