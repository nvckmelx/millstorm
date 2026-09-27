import { DATA, LanePath, type SnapPlayer } from "@millstorm/shared";
import { DEFENDER_COLORS, armorColor } from "./look";

const B = DATA.balance;
const PATH = new LanePath(B.map.path, B.map.yardLengthCells);
const PATH_CELLS = PATH.pathCells();

/** Draws a small, non-interpolated view of someone's lane (scouting and ally status). */
export function drawMiniField(canvas: HTMLCanvasElement, p: SnapPlayer): void {
  const { cols, rows } = B.map;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 80;
  const cell = cssW / cols;
  const cssH = cell * (rows + 1.2);
  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = `${cssH}px`;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#9fd36b";
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#d8b27a";
  for (const [x, y] of PATH_CELLS) ctx.fillRect(x * cell, y * cell, cell, cell);
  ctx.fillRect(PATH.points[PATH.points.length - 1].x * cell - cell / 2, rows * cell, cell, cell * 1.2);
  for (const [, typeIdx, col, row, level] of p.d) {
    ctx.fillStyle = DEFENDER_COLORS[DATA.defenderIds[typeIdx]] ?? "#999";
    ctx.fillRect(col * cell + 1, row * cell + 1, cell - 2, cell - 2);
    if (level >= 3) {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(col * cell + 1, row * cell + 1, cell - 2, cell - 2);
    }
  }
  for (const [, typeIdx, prog100] of p.e) {
    const type = DATA.enemyIds[typeIdx];
    const def = B.enemies[type];
    const prog = Math.min(prog100 / 100, PATH.laneLength + 1);
    const pos = PATH.pos(prog);
    ctx.fillStyle = armorColor(def.armor);
    ctx.strokeStyle = "#3b2a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pos.x * cell, pos.y * cell, Math.max(1.8, cell * (def.hp >= 900 ? 0.45 : 0.25)), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
