import { describe, expect, it } from "vitest";
import {
  CRATER_RADIUS,
  F0_UNDEFINED_ERROR,
  PVP_BOARD,
  SOLO_BOARD,
  SOLO_SHOOTER,
  TARGET_RADIUS,
  boardCols,
  boardRows,
  cellCenter,
  cellIndexAt,
  craterCells,
  createSoloGame,
  distancePointToSegment,
  fireSolo,
  rasterize,
  simulateShot,
  soloStatus,
} from "~/games/function-runner";
import type { Board, FunctionRunnerPuzzle, Target } from "~/games/function-runner";

const board: Board = SOLO_BOARD;

function wall(cx: number, cy: number, w: number, h: number): Set<number> {
  return new Set(rasterize(board, { kind: "rect", cx, cy, w, h }));
}

function targetsAt(...points: [number, number][]): Target[] {
  return points.map(([x, y], i) => ({ id: `t${i + 1}`, x, y }));
}

describe("board cells", () => {
  it("has the spec's boards and constants", () => {
    expect(SOLO_BOARD).toEqual({ minX: 0, maxX: 20, minY: -8, maxY: 8, cell: 0.5 });
    expect(PVP_BOARD).toEqual({ minX: -10, maxX: 10, minY: -8, maxY: 8, cell: 0.5 });
    expect(SOLO_SHOOTER).toEqual({ x: 0, y: 0, dir: 1 });
    expect(TARGET_RADIUS).toBe(0.4);
    expect(CRATER_RADIUS).toBe(1.1);
    expect(boardCols(board)).toBe(40);
    expect(boardRows(board)).toBe(32);
  });

  it("maps points to cells and back", () => {
    expect(cellIndexAt(board, 0.1, -7.9)).toBe(0);
    expect(cellIndexAt(board, 0.6, -8)).toBe(1);
    expect(cellIndexAt(board, 19.9, 7.9)).toBe(40 * 32 - 1);
    for (const [x, y] of [
      [-0.1, 0],
      [20, 0],
      [0, 8],
      [0, -8.1],
    ]) {
      expect(cellIndexAt(board, x, y)).toBe(-1);
    }
    expect(cellCenter(board, 0)).toEqual({ x: 0.25, y: -7.75 });
    expect(cellCenter(board, 41)).toEqual({ x: 0.75, y: -7.25 });
    for (let index = 0; index < 40 * 32; index += 37) {
      const c = cellCenter(board, index);
      expect(cellIndexAt(board, c.x, c.y)).toBe(index);
    }
  });

  it("rasterizes circles and rectangles by cell centre, on-board only, ascending", () => {
    const circle = rasterize(board, { kind: "circle", cx: 5, cy: 0, r: 1 });
    expect(circle).toHaveLength(12);
    for (const index of circle) {
      const c = cellCenter(board, index);
      expect(Math.hypot(c.x - 5, c.y)).toBeLessThanOrEqual(1);
    }
    expect([...circle].sort((a, b) => a - b)).toEqual(circle);

    const rect = rasterize(board, { kind: "rect", cx: 5, cy: 0, w: 1, h: 2 });
    expect(rect).toHaveLength(8);
    for (const index of rect) {
      const c = cellCenter(board, index);
      expect(Math.abs(c.x - 5)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(c.y)).toBeLessThanOrEqual(1);
    }

    const edge = rasterize(board, { kind: "circle", cx: 0, cy: 0, r: 1 });
    expect(edge.length).toBeGreaterThan(0);
    for (const index of edge) expect(cellCenter(board, index).x).toBeGreaterThan(0);
  });

  it("measures point-to-segment distance", () => {
    expect(distancePointToSegment({ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 })).toBe(1);
    expect(distancePointToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(4);
    expect(distancePointToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
    expect(distancePointToSegment({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeCloseTo(0);
  });
});

describe("shot simulation", () => {
  it("traces a flat shot across the board and pierces every target within reach", () => {
    const shot = simulateShot(board, new Set(), targetsAt([5, 0], [10, 0.3], [15, 1]), SOLO_SHOOTER, () => 0);
    expect(shot.hits).toEqual(["t1", "t2"]);
    expect(shot.end).toBe("edge");
    expect(shot.impact).toBeNull();
    expect(shot.cleared).toEqual([]);
    expect(shot.path[0]).toEqual({ x: 0, y: 0 });
    expect(shot.path[shot.path.length - 1].x).toBeCloseTo(20, 6);
    expect(shot.path.every((p) => p.y === 0)).toBe(true);
  });

  it("starts the curve at the shooter by subtracting f(0)", () => {
    const shot = simulateShot(board, new Set(), targetsAt([3, 6]), SOLO_SHOOTER, (x) => 2 * x + 5);
    expect(shot.path[0]).toEqual({ x: 0, y: 0 });
    expect(shot.path[50].y).toBeCloseTo(2, 9);
    expect(shot.hits).toEqual(["t1"]);
    expect(shot.end).toBe("top");
  });

  it("stops at the first obstacle, blasts a crater and never reaches what lies behind", () => {
    const obstacles = wall(8, 0, 1, 4);
    const shot = simulateShot(board, obstacles, targetsAt([4, 0], [12, 0]), SOLO_SHOOTER, () => 0);
    expect(shot.end).toBe("obstacle");
    expect(shot.hits).toEqual(["t1"]);
    expect(shot.impact).not.toBeNull();
    const impact = shot.impact!;
    expect(impact.x).toBeGreaterThanOrEqual(7.5);
    expect(impact.x).toBeLessThan(7.7);
    expect(shot.path[shot.path.length - 1]).toEqual(impact);
    expect(shot.cleared.length).toBeGreaterThan(0);
    for (const index of shot.cleared) {
      expect(obstacles.has(index)).toBe(true);
      const c = cellCenter(board, index);
      expect(Math.hypot(c.x - impact.x, c.y - impact.y)).toBeLessThanOrEqual(CRATER_RADIUS);
    }
    expect(shot.cleared).toEqual(craterCells(board, obstacles, impact));
    const far = cellIndexAt(board, 8.4, 1.9);
    expect(obstacles.has(far)).toBe(true);
    expect(shot.cleared).not.toContain(far);
  });

  it("ends when the curve leaves through the top or bottom edge, clipped to the boundary", () => {
    const up = simulateShot(board, new Set(), targetsAt([3, 6], [5, 8]), SOLO_SHOOTER, (x) => 2 * x);
    expect(up.end).toBe("top");
    expect(up.hits).toEqual(["t1"]);
    const last = up.path[up.path.length - 1];
    expect(last.y).toBe(8);
    expect(last.x).toBeCloseTo(4, 6);

    const down = simulateShot(board, new Set(), [], SOLO_SHOOTER, (x) => -x);
    expect(down.end).toBe("bottom");
    const bottom = down.path[down.path.length - 1];
    expect(bottom.y).toBe(-8);
    expect(bottom.x).toBeCloseTo(8, 6);
  });

  it("ends where the function stops being defined", () => {
    const shot = simulateShot(board, new Set(), targetsAt([2, 0], [6, 0]), SOLO_SHOOTER, (x) => (x > 3 ? NaN : 0));
    expect(shot.end).toBe("undefined");
    expect(shot.hits).toEqual(["t1"]);
    expect(shot.path[shot.path.length - 1].x).toBeCloseTo(3, 6);

    const dead = simulateShot(board, new Set(), targetsAt([2, 0]), SOLO_SHOOTER, (x) => 1 / x);
    expect(dead.end).toBe("undefined");
    expect(dead.path).toEqual([{ x: 0, y: 0 }]);
    expect(dead.hits).toEqual([]);
  });

  it("draws jumps as vertical segments, so a step cannot tunnel through a wall", () => {
    const obstacles = wall(6, 2.5, 1, 1);
    const shot = simulateShot(board, obstacles, targetsAt([6, 5]), SOLO_SHOOTER, (x) => (x < 6 ? 0 : 5));
    expect(shot.end).toBe("obstacle");
    expect(shot.hits).toEqual([]);
    expect(shot.impact!.y).toBeGreaterThanOrEqual(2);
    expect(shot.impact!.y).toBeLessThanOrEqual(3);
  });

  it("shoots leftwards for a mirrored shooter", () => {
    const shot = simulateShot(board, new Set(), targetsAt([15, 0], [15, 3]), { x: 20, y: 0, dir: -1 }, () => 0);
    expect(shot.hits).toEqual(["t1"]);
    expect(shot.end).toBe("edge");
    expect(shot.path[shot.path.length - 1].x).toBeCloseTo(0, 6);
  });

  it("does not modify its inputs", () => {
    const obstacles = wall(8, 0, 1, 4);
    const before = [...obstacles].sort((a, b) => a - b);
    const targets = targetsAt([4, 0]);
    const snapshot = JSON.stringify(targets);
    simulateShot(board, obstacles, targets, SOLO_SHOOTER, () => 0);
    expect([...obstacles].sort((a, b) => a - b)).toEqual(before);
    expect(JSON.stringify(targets)).toBe(snapshot);
  });
});

describe("solo game", () => {
  const wallShape = { kind: "rect", cx: 12, cy: 0, w: 1, h: 4 } as const;
  const puzzle: FunctionRunnerPuzzle = {
    difficulty: "normal",
    board: SOLO_BOARD,
    shooter: SOLO_SHOOTER,
    shots: 2,
    targets: [
      { id: "t1", x: 4, y: 0 },
      { id: "t2", x: 6, y: 3 },
    ],
    shapes: [wallShape],
    obstacles: rasterize(SOLO_BOARD, wallShape),
    solution: ["0", "x/2"],
  };

  it("starts with every target alive, every obstacle standing and no shots fired", () => {
    const game = createSoloGame(puzzle);
    expect([...game.alive]).toEqual(["t1", "t2"]);
    expect(game.obstacles.size).toBe(puzzle.obstacles.length);
    expect(game.shots).toEqual([]);
    expect(soloStatus(game)).toEqual({ remaining: 2, shotsLeft: 2, won: false, lost: false });
  });

  it("applies a shot without mutating the previous state", () => {
    const game = createSoloGame(puzzle);
    const fired = fireSolo(game, "0");
    expect(fired.ok).toBe(true);
    if (!fired.ok) return;
    expect(fired.result.hits).toEqual(["t1"]);
    expect(fired.result.end).toBe("obstacle");
    expect([...fired.game.alive]).toEqual(["t2"]);
    expect(fired.game.obstacles.size).toBe(puzzle.obstacles.length - fired.result.cleared.length);
    expect(fired.game.shots).toHaveLength(1);
    expect(soloStatus(fired.game)).toEqual({ remaining: 1, shotsLeft: 1, won: false, lost: false });
    expect([...game.alive]).toEqual(["t1", "t2"]);
    expect(game.obstacles.size).toBe(puzzle.obstacles.length);
    expect(game.shots).toEqual([]);
  });

  it("wins when the last target falls and refuses further shots", () => {
    let game = createSoloGame(puzzle);
    for (const expression of puzzle.solution) {
      const fired = fireSolo(game, expression);
      expect(fired.ok).toBe(true);
      if (fired.ok) game = fired.game;
    }
    expect(soloStatus(game)).toEqual({ remaining: 0, shotsLeft: 0, won: true, lost: false });
    expect(fireSolo(game, "x")).toEqual({ ok: false, error: "目標已經全部命中", position: null });
  });

  it("loses when the shots run out with targets left", () => {
    let game = createSoloGame(puzzle);
    for (let i = 0; i < 2; i++) {
      const fired = fireSolo(game, "5x");
      expect(fired.ok).toBe(true);
      if (fired.ok) game = fired.game;
    }
    expect(soloStatus(game)).toEqual({ remaining: 2, shotsLeft: 0, won: false, lost: true });
    expect(fireSolo(game, "0")).toEqual({ ok: false, error: "射擊次數已用完", position: null });
  });

  it("rejects bad input without spending a shot", () => {
    const game = createSoloGame(puzzle);
    expect(fireSolo(game, "2 +")).toEqual({ ok: false, error: "這裡少了數字或 x", position: 3 });
    expect(fireSolo(game, "ln(x)")).toEqual({ ok: false, error: F0_UNDEFINED_ERROR, position: null });
    expect(fireSolo(game, "1/x")).toEqual({ ok: false, error: F0_UNDEFINED_ERROR, position: null });
    expect(game.shots).toEqual([]);
  });

  it("cancels the constant term so the curve always leaves from the shooter", () => {
    const game = createSoloGame(puzzle);
    const flat = fireSolo(game, "0");
    const lifted = fireSolo(game, "7");
    expect(flat.ok && lifted.ok && JSON.stringify(flat.result) === JSON.stringify(lifted.result)).toBe(true);
  });
});
