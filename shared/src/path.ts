export interface Vec {
  x: number;
  y: number;
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Fixed lane path. Waypoints are cells (col,row); enemies walk between cell centers.
 * `progress` is distance in cells from the first waypoint. After `laneLength` the enemy is in the
 * Yard, which continues in the direction of the last segment for `yardLength` cells.
 */
export class LanePath {
  readonly points: Vec[];
  readonly cum: number[];
  readonly laneLength: number;
  readonly yardLength: number;
  readonly totalLength: number;
  readonly exitDir: Vec;
  private readonly cells = new Set<string>();

  constructor(waypoints: [number, number][], yardLength: number) {
    this.points = waypoints.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }));
    this.cum = [0];
    for (let i = 1; i < this.points.length; i++) {
      this.cum.push(this.cum[i - 1] + dist(this.points[i - 1], this.points[i]));
    }
    this.laneLength = this.cum[this.cum.length - 1];
    this.yardLength = yardLength;
    this.totalLength = this.laneLength + yardLength;
    const a = this.points[this.points.length - 2];
    const b = this.points[this.points.length - 1];
    const d = dist(a, b) || 1;
    this.exitDir = { x: (b.x - a.x) / d, y: (b.y - a.y) / d };

    for (let i = 1; i < waypoints.length; i++) {
      const [c0, r0] = waypoints[i - 1];
      const [c1, r1] = waypoints[i];
      const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
      for (let s = 0; s <= steps; s++) {
        const t = steps === 0 ? 0 : s / steps;
        this.cells.add(key(Math.round(c0 + (c1 - c0) * t), Math.round(r0 + (r1 - r0) * t)));
      }
    }
  }

  isPathCell(col: number, row: number): boolean {
    return this.cells.has(key(col, row));
  }

  pathCells(): [number, number][] {
    return [...this.cells].map((k) => k.split(",").map(Number) as [number, number]);
  }

  /** Position (in cells) for a progress value; beyond laneLength continues into the Yard. */
  pos(progress: number): Vec {
    if (progress >= this.laneLength) {
      const end = this.points[this.points.length - 1];
      const over = progress - this.laneLength;
      return { x: end.x + this.exitDir.x * over, y: end.y + this.exitDir.y * over };
    }
    if (progress <= 0) return { ...this.points[0] };
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < progress) i++;
    const seg = this.cum[i] - this.cum[i - 1];
    const t = seg === 0 ? 0 : (progress - this.cum[i - 1]) / seg;
    const a = this.points[i - 1];
    const b = this.points[i];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
}

function key(c: number, r: number): string {
  return `${c},${r}`;
}
