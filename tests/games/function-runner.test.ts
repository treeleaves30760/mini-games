import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import type { Rng } from "~/utils/rng";
import {
  CRATER_RADIUS,
  F0_UNDEFINED_ERROR,
  FIRST_STEP_UNDEFINED_ERROR,
  FUNCTION_RUNNER_DIFFICULTIES,
  PVP_BOARD,
  PVP_OBSTACLES,
  PVP_UNITS_PER_SIDE,
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
  firePvp,
  fireSolo,
  generateFunctionRunnerPuzzle,
  generatePvpMatch,
  getFunctionRunnerDifficulty,
  nextPvpUnit,
  pvpAlive,
  pvpDirection,
  rasterize,
  shotCurve,
  simulateShot,
  soloStatus,
} from "~/games/function-runner";
import type { Board, FunctionRunnerDifficulty, FunctionRunnerPuzzle, PvpMatch, Target } from "~/games/function-runner";

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
    // defined at the shooter but nowhere to the right: the curve could never be drawn
    expect(fireSolo(game, "sqrt(-x)")).toEqual({ ok: false, error: FIRST_STEP_UNDEFINED_ERROR, position: null });
    expect(fireSolo(game, "x".repeat(401))).toMatchObject({ ok: false, error: "算式太長，最多 400 個字元" });
    expect(game.shots).toEqual([]);
  });

  it("cancels the constant term so the curve always leaves from the shooter", () => {
    const game = createSoloGame(puzzle);
    const flat = fireSolo(game, "0");
    const lifted = fireSolo(game, "7");
    expect(flat.ok && lifted.ok && JSON.stringify(flat.result) === JSON.stringify(lifted.result)).toBe(true);
  });
});

/* Independent reading of the spec's placement rules, kept separate from the generator on purpose. */
function puzzleIssues(puzzle: FunctionRunnerPuzzle, difficulty: FunctionRunnerDifficulty): string[] {
  const issues: string[] = [];
  if (puzzle.difficulty !== difficulty.key) issues.push("difficulty key mismatch");
  if (JSON.stringify(puzzle.board) !== JSON.stringify(SOLO_BOARD)) issues.push("board is not the solo board");
  if (JSON.stringify(puzzle.shooter) !== JSON.stringify(SOLO_SHOOTER)) issues.push("shooter moved");
  if (puzzle.shots !== difficulty.shots) issues.push(`${puzzle.shots} shots instead of ${difficulty.shots}`);
  if (puzzle.targets.length !== difficulty.targets) issues.push(`${puzzle.targets.length} targets instead of ${difficulty.targets}`);
  if (puzzle.solution.length !== difficulty.groups.length) issues.push(`${puzzle.solution.length} hidden curves instead of ${difficulty.groups.length}`);
  if (puzzle.shapes.length !== difficulty.obstacles) issues.push(`${puzzle.shapes.length} obstacles instead of ${difficulty.obstacles}`);
  const ids = new Set(puzzle.targets.map((t) => t.id));
  if (ids.size !== puzzle.targets.length) issues.push("duplicate target ids");
  // every hidden curve carries a target at x >= 6, so shots cross the board instead of huddling next to the shooter
  for (const expression of puzzle.solution) {
    const g = shotCurve(expression);
    if (!g) {
      issues.push(`hidden curve ${expression} does not compile`);
      continue;
    }
    const onCurve = puzzle.targets.filter((t) => Math.abs(g(t.x) - t.y) < 1e-6);
    if (onCurve.length === 0) issues.push(`hidden curve ${expression} carries no target`);
    if (!onCurve.some((t) => t.x >= 6)) issues.push(`hidden curve ${expression} never reaches x >= 6`);
  }
  puzzle.targets.forEach((t, i) => {
    if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) issues.push(`non-integer target (${t.x}, ${t.y})`);
    if (t.x < 2 || t.x > 19 || Math.abs(t.y) > 7) issues.push(`target out of range (${t.x}, ${t.y})`);
    for (const other of puzzle.targets.slice(i + 1)) {
      if (Math.hypot(t.x - other.x, t.y - other.y) < 1.5) issues.push(`targets too close (${t.x}, ${t.y}) (${other.x}, ${other.y})`);
    }
  });
  const fromShapes = new Set<number>();
  for (const shape of puzzle.shapes) for (const cell of rasterize(SOLO_BOARD, shape)) fromShapes.add(cell);
  if ([...fromShapes].sort((a, b) => a - b).join() !== puzzle.obstacles.join()) issues.push("obstacle cells do not match the shapes");
  for (let i = 1; i < puzzle.obstacles.length; i++) if (puzzle.obstacles[i - 1] >= puzzle.obstacles[i]) issues.push("obstacle cells not ascending/unique");
  for (const index of puzzle.obstacles) {
    const c = cellCenter(SOLO_BOARD, index);
    if (Math.hypot(c.x, c.y) < 2) issues.push("obstacle crowds the shooter");
    for (const t of puzzle.targets) if (Math.hypot(c.x - t.x, c.y - t.y) < 1) issues.push(`obstacle crowds target (${t.x}, ${t.y})`);
  }
  return issues;
}

/** Fire the hidden curves in order through the real pipeline, stopping early if one curve happens to clear the rest. */
function playSolution(puzzle: FunctionRunnerPuzzle): { remaining: number; used: number } {
  let game = createSoloGame(puzzle);
  for (const expression of puzzle.solution) {
    if (game.alive.size === 0) break;
    const fired = fireSolo(game, expression);
    if (!fired.ok) throw new Error(`${expression}: ${fired.error}`);
    game = fired.game;
  }
  return { remaining: game.alive.size, used: game.shots.length };
}

const SEEDS: (string | number)[] = [...Array.from({ length: 300 }, (_, i) => `function-runner-${i}`), ...Array.from({ length: 100 }, (_, i) => i * 7919)];

/** A seeded RNG with some methods pinned, to walk the generators into their give-up paths. */
function stubRng(overrides: Partial<Rng>): Rng {
  return { ...makeRng("stub"), ...overrides };
}

const DAILY_DATES = Array.from({ length: 3 * 366 }, (_, i) => {
  const d = new Date(2025, 0, 1 + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

describe("puzzle generator", () => {
  it("exposes the spec's difficulty table", () => {
    expect(FUNCTION_RUNNER_DIFFICULTIES.map((d) => [d.key, d.label, d.targets, d.shots, d.obstacles, d.groups])).toEqual([
      ["easy", "簡單", 3, 3, 0, [1, 1, 1]],
      ["normal", "普通", 5, 4, 2, [2, 2, 1]],
      ["hard", "困難", 7, 4, 4, [3, 2, 2]],
      ["expert", "專家", 10, 5, 6, [3, 3, 2, 2]],
    ]);
    for (const d of FUNCTION_RUNNER_DIFFICULTIES) expect(d.groups.reduce((a, b) => a + b, 0)).toBe(d.targets);
    expect(getFunctionRunnerDifficulty("nope").key).toBe("normal");
    expect(generateFunctionRunnerPuzzle(makeRng("default")).difficulty).toBe("normal");
  });

  it("is deterministic per seed and varies across seeds", () => {
    for (const d of FUNCTION_RUNNER_DIFFICULTIES) {
      expect(generateFunctionRunnerPuzzle(makeRng("same"), d.key)).toEqual(generateFunctionRunnerPuzzle(makeRng("same"), d.key));
      const distinct = new Set(SEEDS.slice(0, 60).map((seed) => JSON.stringify(generateFunctionRunnerPuzzle(makeRng(seed), d.key).targets)));
      expect(distinct.size).toBeGreaterThanOrEqual(55);
    }
  });

  it("every round at every difficulty is well-formed and cleared by its hidden curves within the shot budget", () => {
    const issues: string[] = [];
    for (const d of FUNCTION_RUNNER_DIFFICULTIES) {
      for (const seed of SEEDS) {
        const puzzle = generateFunctionRunnerPuzzle(makeRng(seed), d.key);
        for (const issue of puzzleIssues(puzzle, d)) issues.push(`${d.key}/${seed}: ${issue}`);
        const played = playSolution(puzzle);
        if (played.remaining !== 0) issues.push(`${d.key}/${seed}: ${played.remaining} targets survive the solution ${JSON.stringify(puzzle.solution)}`);
        if (played.used > puzzle.shots) issues.push(`${d.key}/${seed}: solution needs ${played.used} shots, budget ${puzzle.shots}`);
      }
    }
    expect(issues).toEqual([]);
  });

  it("every Daily Challenge date (seeded like the component, forced to hard) is solvable", () => {
    const hard = getFunctionRunnerDifficulty("hard");
    const issues: string[] = [];
    for (const date of DAILY_DATES) {
      const puzzle = generateFunctionRunnerPuzzle(makeRng(`${date}:function-runner:hard`), "hard");
      for (const issue of puzzleIssues(puzzle, hard)) issues.push(`${date}: ${issue}`);
      if (playSolution(puzzle).remaining !== 0) issues.push(`${date}: solution does not clear the board`);
    }
    expect(issues).toEqual([]);
  });

  it("uses every curve family across seeds", () => {
    const seen = { line: 0, quadratic: 0, sine: 0, abs: 0 };
    for (const seed of SEEDS) {
      for (const expression of generateFunctionRunnerPuzzle(makeRng(seed), "expert").solution) {
        if (expression.includes("sin")) seen.sine++;
        else if (expression.includes("abs")) seen.abs++;
        else if (expression.includes("^2")) seen.quadratic++;
        else seen.line++;
      }
    }
    for (const count of Object.values(seen)) expect(count).toBeGreaterThan(20);
  });

  it("exposes the drawn curve for an expression and refuses ones that do not compile", () => {
    const g = shotCurve("2x + 5")!;
    expect(g(0)).toBe(0);
    expect(g(3)).toBe(6);
    expect(shotCurve("2 +")).toBeNull();
  });

  it("gives up with an error instead of looping when the RNG never yields a usable round", () => {
    // every hidden line comes out as -2x, whose targets never reach x >= 6
    const stuckCurves = stubRng({ pick: (arr) => arr[0], shuffle: (arr) => arr, int: (min) => min });
    expect(() => generateFunctionRunnerPuzzle(stuckCurves, "normal")).toThrow(/no normal puzzle after 50 attempts/);
    // every obstacle lands on the same cells, so the second one can never be placed
    const stuckObstacles = stubRng({ float: (_min, max) => max });
    expect(() => generateFunctionRunnerPuzzle(stuckObstacles, "normal")).toThrow(/no normal puzzle after 50 attempts/);
  });
});

describe("pvp match", () => {
  function handMatch(units: [number, number, number][], obstacles: Set<number> = new Set()): PvpMatch {
    return {
      board: PVP_BOARD,
      units: units.map(([owner, x, y], i) => ({ id: `p${owner}-${i + 1}`, owner: owner as 1 | 2, x, y, alive: true })),
      shapes: [],
      obstacles,
      turn: 1,
      winner: 0,
      shots: [],
    };
  }

  it("generates legal maps: three units a side in their zones, spaced out, five obstacles clear of every unit", () => {
    const issues: string[] = [];
    for (const seed of SEEDS.slice(0, 200)) {
      const match = generatePvpMatch(makeRng(seed));
      if (match.turn !== 1 || match.winner !== 0 || match.shots.length !== 0) issues.push(`${seed}: bad initial state`);
      if (match.units.length !== 2 * PVP_UNITS_PER_SIDE) issues.push(`${seed}: ${match.units.length} units`);
      if (match.shapes.length !== PVP_OBSTACLES) issues.push(`${seed}: ${match.shapes.length} obstacles`);
      match.units.forEach((u, i) => {
        if (!u.alive || !Number.isInteger(u.x) || !Number.isInteger(u.y) || Math.abs(u.y) > 6) issues.push(`${seed}: bad unit ${JSON.stringify(u)}`);
        if (u.owner === 1 && (u.x < -9 || u.x > -6)) issues.push(`${seed}: player one unit at x=${u.x}`);
        if (u.owner === 2 && (u.x < 6 || u.x > 9)) issues.push(`${seed}: player two unit at x=${u.x}`);
        for (const o of match.units.slice(i + 1)) if (Math.hypot(u.x - o.x, u.y - o.y) < 2) issues.push(`${seed}: units too close`);
      });
      if (pvpAlive(match, 1).length !== 3 || pvpAlive(match, 2).length !== 3) issues.push(`${seed}: alive counts`);
      const cells = new Set<number>();
      for (const shape of match.shapes) for (const c of rasterize(PVP_BOARD, shape)) cells.add(c);
      if (cells.size !== match.obstacles.size || [...cells].some((c) => !match.obstacles.has(c))) issues.push(`${seed}: obstacle cells do not match shapes`);
      for (const index of match.obstacles) {
        const c = cellCenter(PVP_BOARD, index);
        if (Math.abs(c.x) > 5.75) issues.push(`${seed}: obstacle outside the middle band at x=${c.x}`);
        for (const u of match.units) if (Math.hypot(c.x - u.x, c.y - u.y) < 1.5) issues.push(`${seed}: obstacle crowds a unit`);
      }
    }
    expect(issues).toEqual([]);
    expect(generatePvpMatch(makeRng("same"))).toEqual(generatePvpMatch(makeRng("same")));
  });

  it("fires toward the opponent, kills what it passes, flips the turn and declares a winner", () => {
    expect(pvpDirection(1)).toBe(1);
    expect(pvpDirection(2)).toBe(-1);
    let match = handMatch([
      [1, -8, 0],
      [2, 8, 0],
      [2, 8, 3],
    ]);
    const first = firePvp(match, "p1-1", "0");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result.hits).toEqual(["p2-2"]);
    expect(first.match.units.find((u) => u.id === "p2-2")!.alive).toBe(false);
    expect(first.match.turn).toBe(2);
    expect(first.match.winner).toBe(0);
    expect(first.match.shots).toEqual([{ player: 1, unitId: "p1-1", result: first.result }]);
    expect(match.units.every((u) => u.alive)).toBe(true);
    match = first.match;

    const second = firePvp(match, "p2-3", "0");
    expect(second.ok && second.result.hits).toEqual([]);
    expect(second.ok && second.result.path[second.result.path.length - 1].x).toBeCloseTo(-10, 6);
    expect(second.ok && second.match.turn).toBe(1);
    if (second.ok) match = second.match;

    const third = firePvp(match, "p1-1", "3x/16");
    expect(third.ok && third.result.hits).toEqual(["p2-3"]);
    expect(third.ok && third.match.winner).toBe(1);
    expect(third.ok && pvpAlive(third.match, 2)).toEqual([]);
    if (third.ok) expect(firePvp(third.match, "p1-1", "0")).toEqual({ ok: false, error: "對局已經結束", position: null });
  });

  it("only lets the current player fire one of their own living units", () => {
    const match = handMatch([
      [1, -8, 0],
      [1, -7, 4],
      [2, 8, 0],
    ]);
    expect(firePvp(match, "p2-3", "0")).toEqual({ ok: false, error: "請選自己的單位當出發點", position: null });
    expect(firePvp(match, "nope", "0")).toEqual({ ok: false, error: "請選自己的單位當出發點", position: null });
    const dead = { ...match, units: match.units.map((u) => (u.id === "p1-2" ? { ...u, alive: false } : u)) };
    expect(firePvp(dead, "p1-2", "0")).toEqual({ ok: false, error: "這個單位已經被消滅", position: null });
    expect(firePvp(match, "p1-1", "2 +")).toEqual({ ok: false, error: "這裡少了數字或 x", position: 3 });
    expect(firePvp(match, "p1-1", "ln(x)")).toEqual({ ok: false, error: F0_UNDEFINED_ERROR, position: null });
  });

  it("passes through friendly units and keeps craters between turns", () => {
    const wallCells = new Set(rasterize(PVP_BOARD, { kind: "rect", cx: 0, cy: 0, w: 1, h: 6 }));
    const match = handMatch(
      [
        [1, -8, 0],
        [1, -6, 0],
        [2, 8, 0],
      ],
      wallCells,
    );
    const fired = firePvp(match, "p1-1", "0");
    expect(fired.ok).toBe(true);
    if (!fired.ok) return;
    expect(fired.result.hits).toEqual([]);
    expect(fired.result.end).toBe("obstacle");
    expect(fired.match.units.find((u) => u.id === "p1-2")!.alive).toBe(true);
    expect(fired.match.obstacles.size).toBe(wallCells.size - fired.result.cleared.length);
    expect(match.obstacles.size).toBe(wallCells.size);
    const reply = firePvp(fired.match, "p2-3", "0");
    expect(reply.ok && reply.match.obstacles.size).toBeLessThanOrEqual(fired.match.obstacles.size);
  });

  it("suggests the next living unit after the one that just fired", () => {
    const match = handMatch([
      [1, -8, 0],
      [1, -7, 4],
      [1, -6, -4],
      [2, 8, 0],
    ]);
    expect(nextPvpUnit(match, 1, null)!.id).toBe("p1-1");
    expect(nextPvpUnit(match, 1, "p1-1")!.id).toBe("p1-2");
    expect(nextPvpUnit(match, 1, "p1-3")!.id).toBe("p1-1");
    const dead = { ...match, units: match.units.map((u) => (u.id === "p1-2" ? { ...u, alive: false } : u)) };
    expect(nextPvpUnit(dead, 1, "p1-1")!.id).toBe("p1-3");
    const wiped = { ...match, units: match.units.map((u) => (u.owner === 2 ? { ...u, alive: false } : u)) };
    expect(nextPvpUnit(wiped, 2, null)).toBeNull();
  });

  it("gives up with an error instead of looping when the RNG never yields a legal map", () => {
    // every unit lands on the same square, so no side ever gets three units
    const stuckUnits = stubRng({ int: (min) => min });
    expect(() => generatePvpMatch(stuckUnits)).toThrow(/no PVP map after 50 attempts/);
    // units place fine but every obstacle lands on the same cells
    const stuckObstacles = stubRng({ float: (_min, max) => max });
    expect(() => generatePvpMatch(stuckObstacles)).toThrow(/no PVP map after 50 attempts/);
  });
});
