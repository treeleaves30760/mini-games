import { describe, it, expect } from "vitest";
import {
  buildPuzzle,
  isConnected,
  wouldCross,
  pathClear,
  islandDegree,
  checkWin,
  isValidPuzzle,
  solveHashi,
  solutionToBridges,
  DIFFICULTIES,
  type Difficulty,
  type Island,
  type PlayerBridge,
  type BridgeEdge,
  type HashiPuzzle,
} from "~/games/hashi";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a PlayerBridge from two islands (count defaults to 1). */
function mkBridge(
  id1: number,
  id2: number,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  count = 1,
): PlayerBridge {
  return { id1, id2, r1, c1, r2, c2, count };
}

/** Attach island coordinates to id-based edges so checkWin() can consume them. */
function edgesToBridges(islands: Island[], edges: BridgeEdge[]): PlayerBridge[] {
  const byId = new Map(islands.map((i) => [i.id, i]));
  return edges.map((e) => {
    const a = byId.get(e.id1)!;
    const b = byId.get(e.id2)!;
    return mkBridge(e.id1, e.id2, a.r, a.c, b.r, b.c, e.count);
  });
}

/** Grid cells a bridge passes through, endpoints excluded. */
function interiorCells(b: PlayerBridge): string[] {
  const cells: string[] = [];
  if (b.r1 === b.r2) {
    for (let c = Math.min(b.c1, b.c2) + 1; c < Math.max(b.c1, b.c2); c++) cells.push(`${b.r1},${c}`);
  } else if (b.c1 === b.c2) {
    for (let r = Math.min(b.r1, b.r2) + 1; r < Math.max(b.r1, b.r2); r++) cells.push(`${r},${b.c1}`);
  }
  return cells;
}

/**
 * Independent rule checker written straight from the rules of Hashi. It shares
 * no code with the module under test: crossings are detected as two bridges
 * using the same cell, connectivity uses union-find, and "no island on a
 * bridge" is an explicit scan. Returns the list of violations (empty when the
 * bridge layout is a valid solution for the islands).
 */
function ruleViolations(islands: Island[], bridges: PlayerBridge[]): string[] {
  const out: string[] = [];
  const byId = new Map(islands.map((i) => [i.id, i]));
  const live = bridges.filter((b) => b.count > 0);
  const seenPairs = new Set<string>();

  for (const b of live) {
    const name = `bridge ${b.id1}-${b.id2}`;
    const a = byId.get(b.id1);
    const z = byId.get(b.id2);
    if (!a || !z) {
      out.push(`${name} references a missing island`);
      continue;
    }
    if (b.id1 === b.id2) out.push(`${name} joins an island to itself`);
    if (a.r !== b.r1 || a.c !== b.c1 || z.r !== b.r2 || z.c !== b.c2) {
      out.push(`${name} coordinates do not match its islands`);
    }
    if (b.count > 2) out.push(`${name} carries ${b.count} bridges (max 2)`);
    if (b.r1 !== b.r2 && b.c1 !== b.c2) out.push(`${name} is not horizontal or vertical`);
    const pair = `${Math.min(b.id1, b.id2)}-${Math.max(b.id1, b.id2)}`;
    if (seenPairs.has(pair)) out.push(`pair ${pair} is listed twice`);
    seenPairs.add(pair);

    for (const i of islands) {
      if (i.id === b.id1 || i.id === b.id2) continue;
      const onRow =
        b.r1 === b.r2 && i.r === b.r1 &&
        i.c > Math.min(b.c1, b.c2) && i.c < Math.max(b.c1, b.c2);
      const onCol =
        b.c1 === b.c2 && i.c === b.c1 &&
        i.r > Math.min(b.r1, b.r2) && i.r < Math.max(b.r1, b.r2);
      if (onRow || onCol) out.push(`island ${i.id} at (${i.r},${i.c}) lies on ${name}`);
    }
  }

  // Two bridges may never share a cell: that covers perpendicular crossings
  // and parallel overlaps alike.
  const cellUse = new Map<string, string>();
  for (const b of live) {
    for (const cell of interiorCells(b)) {
      const prev = cellUse.get(cell);
      if (prev !== undefined) out.push(`bridges ${prev} and ${b.id1}-${b.id2} both use cell (${cell})`);
      cellUse.set(cell, `${b.id1}-${b.id2}`);
    }
  }

  for (const i of islands) {
    let total = 0;
    for (const b of live) if (b.id1 === i.id || b.id2 === i.id) total += b.count;
    if (total !== i.clue) out.push(`island ${i.id} has ${total} bridges but clue ${i.clue}`);
  }

  const parent = new Map<number, number>(islands.map((i) => [i.id, i.id]));
  const find = (x: number): number => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  for (const b of live) {
    if (byId.has(b.id1) && byId.has(b.id2)) parent.set(find(b.id1), find(b.id2));
  }
  const groups = new Set(islands.map((i) => find(i.id)));
  if (islands.length > 0 && groups.size !== 1) out.push(`islands form ${groups.size} separate groups`);

  return out;
}

/** Islands that sit strictly inside a stored-solution bridge path (explicit scan). */
function islandsOnSolutionPaths(puzzle: HashiPuzzle): string[] {
  const hits: string[] = [];
  for (const b of solutionToBridges(puzzle)) {
    const cells = new Set(interiorCells(b));
    for (const i of puzzle.islands) {
      if (cells.has(`${i.r},${i.c}`)) hits.push(`island ${i.id} on bridge ${b.id1}-${b.id2}`);
    }
  }
  return hits;
}

/**
 * Independent brute-force solver written from the rules (not from the
 * generator or from solveHashi). Enumerates 0/1/2 bridges for every pair of
 * islands that share a row or column with nothing in between, rejects any
 * assignment where two bridges share a cell, and accepts a leaf only when
 * every clue is met and the islands form one group.
 */
function bruteForceSolve(islands: Island[]): BridgeEdge[] | null {
  interface Cand { a: number; b: number; cells: Set<string> }
  const n = islands.length;
  const cands: Cand[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = islands[i];
      const B = islands[j];
      if (A.r !== B.r && A.c !== B.c) continue;
      const cells = new Set(interiorCells(mkBridge(A.id, B.id, A.r, A.c, B.r, B.c)));
      if (islands.some((I) => cells.has(`${I.r},${I.c}`))) continue;
      cands.push({ a: i, b: j, cells });
    }
  }
  const counts: number[] = cands.map(() => 0);
  const deg: number[] = islands.map(() => 0);
  const left: number[] = islands.map(() => 0); // undecided candidates per island
  for (const c of cands) {
    left[c.a]++;
    left[c.b]++;
  }
  const usedCells = new Set<string>();
  const stillOk = (i: number): boolean => {
    const need = islands[i].clue - deg[i];
    return need >= 0 && need <= 2 * left[i];
  };
  const oneGroup = (): boolean => {
    const adj: number[][] = islands.map(() => []);
    cands.forEach((c, k) => {
      if (counts[k] > 0) {
        adj[c.a].push(c.b);
        adj[c.b].push(c.a);
      }
    });
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of adj[u]) {
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    return seen.size === n;
  };
  function rec(k: number): boolean {
    if (k === cands.length) {
      return islands.every((I, i) => deg[i] === I.clue) && oneGroup();
    }
    const c = cands[k];
    const overlaps = [...c.cells].some((cell) => usedCells.has(cell));
    left[c.a]--;
    left[c.b]--;
    for (let cnt = 0; cnt <= 2; cnt++) {
      if (cnt > 0 && overlaps) break;
      counts[k] = cnt;
      deg[c.a] += cnt;
      deg[c.b] += cnt;
      if (cnt > 0) c.cells.forEach((cell) => usedCells.add(cell));
      if (stillOk(c.a) && stillOk(c.b) && rec(k + 1)) return true;
      if (cnt > 0) c.cells.forEach((cell) => usedCells.delete(cell));
      deg[c.a] -= cnt;
      deg[c.b] -= cnt;
    }
    counts[k] = 0;
    left[c.a]++;
    left[c.b]++;
    return false;
  }
  if (n === 0 || !islands.every((_, i) => stillOk(i))) return null;
  if (!rec(0)) return null;
  return cands
    .map((c, k) => ({ id1: islands[c.a].id, id2: islands[c.b].id, count: counts[k] }))
    .filter((e) => e.count > 0);
}

/** A hand-made valid puzzle: four islands on the corners of a square, single bridges. */
function squarePuzzle(): HashiPuzzle {
  return {
    gc: 5,
    gr: 5,
    islands: [
      { id: 0, r: 0, c: 0, clue: 2 },
      { id: 1, r: 0, c: 4, clue: 2 },
      { id: 2, r: 4, c: 0, clue: 2 },
      { id: 3, r: 4, c: 4, clue: 2 },
    ],
    solution: [
      { id1: 0, id2: 1, count: 1 },
      { id1: 0, id2: 2, count: 1 },
      { id1: 1, id2: 3, count: 1 },
      { id1: 2, id2: 3, count: 1 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Headline regression: every generated puzzle must be solvable
// ---------------------------------------------------------------------------

describe("buildPuzzle — every puzzle is solvable and rule-valid (independent brute force)", () => {
  // Before the fix the generator could place a new island on a cell that an
  // earlier solution bridge already passed through, so the stored solution ran
  // through an island and the clues became contradictory (79/300 easy,
  // 246/300 normal and 286/300 hard seeds were unsolvable).
  const SEEDS = 300;

  /** Every check the audit demands, for one puzzle; returns the failures. */
  function auditPuzzle(tag: string, puzzle: HashiPuzzle, minIslands: number): string[] {
    const problems: string[] = [];
    if (puzzle.islands.length < minIslands) {
      problems.push(`${tag}: only ${puzzle.islands.length} islands (quota ${minIslands})`);
    }
    for (const hit of islandsOnSolutionPaths(puzzle)) problems.push(`${tag}: ${hit}`);

    const stored = edgesToBridges(puzzle.islands, puzzle.solution);
    for (const v of ruleViolations(puzzle.islands, stored)) problems.push(`${tag}: stored solution: ${v}`);
    if (!checkWin(puzzle.islands, stored)) problems.push(`${tag}: checkWin rejects the stored solution`);

    const found = bruteForceSolve(puzzle.islands);
    if (!found) {
      problems.push(`${tag}: brute force finds no solution`);
    } else {
      const bridges = edgesToBridges(puzzle.islands, found);
      for (const v of ruleViolations(puzzle.islands, bridges)) problems.push(`${tag}: brute-force solution: ${v}`);
      if (!checkWin(puzzle.islands, bridges)) problems.push(`${tag}: checkWin rejects the brute-force solution`);
    }

    const solved = solveHashi(puzzle);
    if (!solved) {
      problems.push(`${tag}: solveHashi finds no solution`);
    } else {
      const bridges = edgesToBridges(puzzle.islands, solved);
      for (const v of ruleViolations(puzzle.islands, bridges)) problems.push(`${tag}: solveHashi solution: ${v}`);
      if (!checkWin(puzzle.islands, bridges)) problems.push(`${tag}: checkWin rejects the solveHashi solution`);
    }
    return problems;
  }

  for (const diff of DIFFICULTIES) {
    it(`${diff.key}: ${SEEDS} seeds are solvable, rule-valid and accepted by checkWin`, () => {
      const minIslands = Math.ceil(diff.targetIslands * 0.6);
      const problems: string[] = [];
      for (let s = 0; s < SEEDS; s++) {
        const seed = `seed-${s}`;
        problems.push(...auditPuzzle(`${diff.key}/${seed}`, buildPuzzle(seed, diff), minIslands));
      }
      expect(problems).toEqual([]);
    });
  }

  it("Daily Challenge: every date seed of 2026 yields a solvable normal puzzle", () => {
    // The daily page passes a "YYYY-MM-DD" seed and the component always uses
    // the "normal" preset for it.
    const normal = DIFFICULTIES.find((d) => d.key === "normal")!;
    const minIslands = Math.ceil(normal.targetIslands * 0.6);
    const problems: string[] = [];
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 31; d++) {
        if (new Date(2026, m - 1, d).getMonth() !== m - 1) continue;
        const seed = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        problems.push(...auditPuzzle(seed, buildPuzzle(makeRng(seed), normal), minIslands));
      }
    }
    expect(problems).toEqual([]);
  });

  it("regression: the layout from the bug report is unsolvable and is now rejected by the solver", () => {
    // 9×9 "normal" puzzle produced by the old generator. Island (3,7)=3 can
    // only reach (3,3) and (5,7), so it needs 2 bridges to (3,3) and 1 to
    // (5,7); that fills (5,7)=1, leaving (7,7)=2 to take both bridges from
    // (7,5), whose clue is 1. No solution exists.
    const islands: Island[] = [
      { id: 0, r: 1, c: 1, clue: 2 },
      { id: 1, r: 3, c: 1, clue: 4 },
      { id: 2, r: 3, c: 3, clue: 5 },
      { id: 3, r: 3, c: 7, clue: 3 },
      { id: 4, r: 5, c: 1, clue: 1 },
      { id: 5, r: 5, c: 3, clue: 4 },
      { id: 6, r: 5, c: 7, clue: 1 },
      { id: 7, r: 7, c: 3, clue: 3 },
      { id: 8, r: 7, c: 5, clue: 1 },
      { id: 9, r: 7, c: 7, clue: 2 },
    ];
    expect(bruteForceSolve(islands)).toBeNull();
    expect(solveHashi({ islands })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generator invariants
// ---------------------------------------------------------------------------

describe("buildPuzzle — generator invariants across seeds", () => {
  const seeds = ["seed-1", "seed-2", "seed-3", "seed-42", "hashi-test", "2026-06-03"];
  const diff = DIFFICULTIES.find((d) => d.key === "normal")!;

  for (const seed of seeds) {
    describe(`seed "${seed}"`, () => {
      const puzzle = buildPuzzle(makeRng(seed), diff);

      it("produces a non-trivial puzzle (at least 3 islands)", () => {
        expect(puzzle.islands.length).toBeGreaterThanOrEqual(3);
      });

      it("each island clue equals its incident bridge count in the solution", () => {
        const incidence = new Map<number, number>();
        for (const isl of puzzle.islands) incidence.set(isl.id, 0);
        for (const e of puzzle.solution) {
          incidence.set(e.id1, (incidence.get(e.id1) ?? 0) + e.count);
          incidence.set(e.id2, (incidence.get(e.id2) ?? 0) + e.count);
        }
        for (const isl of puzzle.islands) {
          expect(
            incidence.get(isl.id),
            `island ${isl.id} clue=${isl.clue}`,
          ).toBe(isl.clue);
        }
      });

      it("solution has at most 2 bridges between any pair", () => {
        for (const e of puzzle.solution) {
          expect(e.count, `edge ${e.id1}-${e.id2}`).toBeGreaterThanOrEqual(1);
          expect(e.count, `edge ${e.id1}-${e.id2}`).toBeLessThanOrEqual(2);
        }
      });

      it("no two solution bridges cross each other", () => {
        const pb = solutionToBridges(puzzle);
        for (let i = 0; i < pb.length; i++) {
          const b = pb[i];
          const rest = pb.filter((_, idx) => idx !== i);
          expect(
            wouldCross(b.r1, b.c1, b.r2, b.c2, rest),
            `bridge ${b.id1}-${b.id2} crosses another`,
          ).toBe(false);
        }
      });

      it("no solution bridge passes through a third island", () => {
        for (const b of solutionToBridges(puzzle)) {
          expect(
            pathClear({ r: b.r1, c: b.c1 }, { r: b.r2, c: b.c2 }, puzzle.islands),
            `bridge ${b.id1}-${b.id2} runs through an island`,
          ).toBe(true);
        }
      });

      it("solution graph is fully connected", () => {
        const ids = puzzle.islands.map((i) => i.id);
        expect(isConnected(ids, puzzle.solution)).toBe(true);
      });

      it("passes the module's own validator", () => {
        expect(isValidPuzzle(puzzle)).toBe(true);
      });

      it("all bridges are strictly horizontal or strictly vertical", () => {
        const idToIsland = new Map(puzzle.islands.map((i) => [i.id, i]));
        for (const e of puzzle.solution) {
          const a = idToIsland.get(e.id1)!;
          const b = idToIsland.get(e.id2)!;
          const sameRow = a.r === b.r;
          const sameCol = a.c === b.c;
          expect(
            sameRow || sameCol,
            `edge ${e.id1}-${e.id2} is diagonal`,
          ).toBe(true);
        }
      });

      it("islands have unique positions", () => {
        const positions = puzzle.islands.map((i) => `${i.r},${i.c}`);
        expect(new Set(positions).size).toBe(puzzle.islands.length);
      });

      it("all island positions are within the grid", () => {
        for (const isl of puzzle.islands) {
          expect(isl.r).toBeGreaterThanOrEqual(0);
          expect(isl.r).toBeLessThan(puzzle.gr);
          expect(isl.c).toBeGreaterThanOrEqual(0);
          expect(isl.c).toBeLessThan(puzzle.gc);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("buildPuzzle — determinism", () => {
  it("same seed always produces the same puzzle", () => {
    const diff = DIFFICULTIES.find((d) => d.key === "easy")!;
    const p1 = buildPuzzle(makeRng("det-test"), diff);
    const p2 = buildPuzzle(makeRng("det-test"), diff);
    expect(p1.islands).toEqual(p2.islands);
    expect(p1.solution).toEqual(p2.solution);
  });

  it("different seeds produce different puzzles (with overwhelming probability)", () => {
    const diff = DIFFICULTIES.find((d) => d.key === "normal")!;
    const p1 = buildPuzzle(makeRng("seed-A"), diff);
    const p2 = buildPuzzle(makeRng("seed-B"), diff);
    // Island counts or positions should differ
    const same =
      p1.islands.length === p2.islands.length &&
      p1.islands.every(
        (isl, i) => isl.r === p2.islands[i]?.r && isl.c === p2.islands[i]?.c,
      );
    expect(same).toBe(false);
  });

  it("accepts a raw string seed (makeRng is called internally)", () => {
    const diff = DIFFICULTIES.find((d) => d.key === "easy")!;
    const p = buildPuzzle("string-seed-42", diff);
    expect(p.islands.length).toBeGreaterThanOrEqual(3);
    expect(p.gc).toBe(diff.cols);
  });

  it("accepts a numeric seed", () => {
    const diff = DIFFICULTIES.find((d) => d.key === "easy")!;
    const p = buildPuzzle(12345, diff);
    expect(p.islands.length).toBeGreaterThanOrEqual(3);
    expect(p.gc).toBe(diff.cols);
  });
});

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

describe("buildPuzzle — difficulty presets", () => {
  for (const diff of DIFFICULTIES) {
    it(`${diff.key}: grid is ${diff.cols}×${diff.rows}`, () => {
      const p = buildPuzzle(makeRng(`diff-${diff.key}`), diff);
      expect(p.gc).toBe(diff.cols);
      expect(p.gr).toBe(diff.rows);
    });
  }
});

// ---------------------------------------------------------------------------
// Fallbacks for grids that cannot meet the island quota
// ---------------------------------------------------------------------------

describe("buildPuzzle — fallbacks on degenerate grids", () => {
  it("returns an empty-islands puzzle for a 2×2 grid that cannot hold three islands", () => {
    // The only interior cell of a 2×2 grid is (1,1), so every attempt ends
    // with a single island and tryGenerate returns null; after the attempt
    // budget is exhausted there is no candidate to fall back on.
    const tinyDiff: Difficulty = {
      key: "tiny",
      label: "Tiny",
      cols: 2,
      rows: 2,
      targetIslands: 10,
    };
    const p = buildPuzzle(makeRng("fallback-test"), tinyDiff);
    expect(p.gc).toBe(2);
    expect(p.gr).toBe(2);
    expect(p.islands).toEqual([]);
    expect(p.solution).toEqual([]);
  });

  it("returns the largest solvable candidate when no attempt reaches the quota", () => {
    // A 5×5 grid has a 3×3 interior and can hold at most 4 mutually
    // non-adjacent islands, far below the 12-island quota of this preset.
    // Rather than an empty board the player gets the best candidate found.
    const smallDiff: Difficulty = {
      key: "small",
      label: "Small",
      cols: 5,
      rows: 5,
      targetIslands: 20,
    };
    for (const seed of ["fallback-small", "x", "seed-1"]) {
      const p = buildPuzzle(seed, smallDiff);
      expect(p.islands.length, seed).toBeGreaterThanOrEqual(3);
      expect(p.islands.length, seed).toBeLessThan(12);
      expect(isValidPuzzle(p), seed).toBe(true);
      expect(bruteForceSolve(p.islands), seed).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// isValidPuzzle
// ---------------------------------------------------------------------------

describe("isValidPuzzle", () => {
  it("accepts a hand-made valid puzzle", () => {
    expect(isValidPuzzle(squarePuzzle())).toBe(true);
  });

  it("rejects a puzzle without islands", () => {
    expect(isValidPuzzle({ gc: 3, gr: 3, islands: [], solution: [] })).toBe(false);
  });

  it("rejects an island outside the grid", () => {
    const p = squarePuzzle();
    p.islands[3] = { ...p.islands[3], c: 5 }; // gc is 5 → column 5 is out of range
    expect(isValidPuzzle(p)).toBe(false);
    p.islands[3] = { ...p.islands[3], c: 4, r: -1 };
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects duplicate island ids", () => {
    const p = squarePuzzle();
    p.islands[3] = { ...p.islands[3], id: 2 };
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects two islands on the same cell", () => {
    const p = squarePuzzle();
    p.islands[3] = { ...p.islands[3], r: 4, c: 0 }; // same cell as island 2
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects an edge that references an unknown island", () => {
    const p = squarePuzzle();
    p.solution[0] = { id1: 0, id2: 9, count: 1 };
    expect(isValidPuzzle(p)).toBe(false);
    p.solution[0] = { id1: 9, id2: 1, count: 1 };
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects an edge from an island to itself", () => {
    const p = squarePuzzle();
    p.solution[0] = { id1: 0, id2: 0, count: 1 };
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects bridge counts outside 1..2", () => {
    const p = squarePuzzle();
    p.solution[0] = { ...p.solution[0], count: 0 };
    expect(isValidPuzzle(p)).toBe(false);
    p.solution[0] = { ...p.solution[0], count: 3 };
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects a diagonal edge", () => {
    const p = squarePuzzle();
    p.solution[0] = { id1: 0, id2: 3, count: 1 }; // (0,0) → (4,4)
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects a solution bridge that runs through a third island", () => {
    // Clues and connectivity are fine; only the 0-2 bridge is illegal because
    // island 1 sits on its path.
    const p: HashiPuzzle = {
      gc: 5,
      gr: 1,
      islands: [
        { id: 0, r: 0, c: 0, clue: 2 },
        { id: 1, r: 0, c: 2, clue: 2 },
        { id: 2, r: 0, c: 4, clue: 2 },
      ],
      solution: [
        { id1: 0, id2: 1, count: 1 },
        { id1: 1, id2: 2, count: 1 },
        { id1: 0, id2: 2, count: 1 },
      ],
    };
    expect(checkWin(p.islands, solutionToBridges(p))).toBe(true);
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects the same island pair listed twice", () => {
    const p = squarePuzzle();
    p.islands[0].clue = 3;
    p.islands[1].clue = 3;
    p.solution.push({ id1: 1, id2: 0, count: 1 }); // 0-1 again, reversed
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects crossing solution bridges even when clues and connectivity hold", () => {
    // A(2,0)–B(2,4) crosses C(0,2)–D(4,2) at (2,2); E(0,0) ties both parts together.
    const p: HashiPuzzle = {
      gc: 5,
      gr: 5,
      islands: [
        { id: 0, r: 2, c: 0, clue: 2 }, // A
        { id: 1, r: 2, c: 4, clue: 1 }, // B
        { id: 2, r: 0, c: 2, clue: 2 }, // C
        { id: 3, r: 4, c: 2, clue: 1 }, // D
        { id: 4, r: 0, c: 0, clue: 2 }, // E
      ],
      solution: [
        { id1: 0, id2: 1, count: 1 },
        { id1: 2, id2: 3, count: 1 },
        { id1: 0, id2: 4, count: 1 },
        { id1: 4, id2: 2, count: 1 },
      ],
    };
    expect(checkWin(p.islands, solutionToBridges(p))).toBe(true);
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects a clue that does not match the solution", () => {
    const p = squarePuzzle();
    p.islands[0].clue = 3;
    expect(isValidPuzzle(p)).toBe(false);
  });

  it("rejects a disconnected solution", () => {
    const p: HashiPuzzle = {
      gc: 3,
      gr: 3,
      islands: [
        { id: 0, r: 0, c: 0, clue: 1 },
        { id: 1, r: 0, c: 2, clue: 1 },
        { id: 2, r: 2, c: 0, clue: 1 },
        { id: 3, r: 2, c: 2, clue: 1 },
      ],
      solution: [
        { id1: 0, id2: 1, count: 1 },
        { id1: 2, id2: 3, count: 1 },
      ],
    };
    expect(isValidPuzzle(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// solutionToBridges
// ---------------------------------------------------------------------------

describe("solutionToBridges", () => {
  it("attaches the endpoint coordinates of each edge and keeps ids and counts", () => {
    const p = squarePuzzle();
    p.solution[0].count = 2;
    const bridges = solutionToBridges(p);
    expect(bridges).toHaveLength(4);
    expect(bridges[0]).toEqual({ id1: 0, id2: 1, count: 2, r1: 0, c1: 0, r2: 0, c2: 4 });
    expect(bridges[1]).toEqual({ id1: 0, id2: 2, count: 1, r1: 0, c1: 0, r2: 4, c2: 0 });
  });
});

// ---------------------------------------------------------------------------
// solveHashi
// ---------------------------------------------------------------------------

describe("solveHashi", () => {
  it("returns null when there are no islands", () => {
    expect(solveHashi({ islands: [] })).toBeNull();
  });

  it("returns null when a clue exceeds what its neighbours can supply", () => {
    // Island 0 can only reach island 1 (max 2 bridges) but asks for 3.
    const islands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 3 },
      { id: 1, r: 0, c: 2, clue: 3 },
    ];
    expect(solveHashi({ islands })).toBeNull();
  });

  it("solves a chain and never bridges across the middle island", () => {
    // 1 — 2 — 1 in one row: the outer pair is not a candidate because the
    // middle island blocks the path, so the only solution is two single bridges.
    const islands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 1 },
      { id: 1, r: 0, c: 2, clue: 2 },
      { id: 2, r: 0, c: 4, clue: 1 },
    ];
    const solved = solveHashi({ islands });
    expect(solved).toEqual([
      { id1: 0, id2: 1, count: 1 },
      { id1: 1, id2: 2, count: 1 },
    ]);
    expect(checkWin(islands, edgesToBridges(islands, solved!))).toBe(true);
  });

  it("uses double bridges where the clues demand them", () => {
    const islands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 2 },
      { id: 1, r: 0, c: 3, clue: 2 },
    ];
    expect(solveHashi({ islands })).toEqual([{ id1: 0, id2: 1, count: 2 }]);
  });

  it("backtracks out of clue-satisfying but disconnected layouts", () => {
    // Square with every clue 2: two opposite double bridges satisfy all clues
    // but leave two groups, so the solver has to fall back to the 4-cycle.
    const p = squarePuzzle();
    const solved = solveHashi(p);
    expect(solved).not.toBeNull();
    expect(ruleViolations(p.islands, edgesToBridges(p.islands, solved!))).toEqual([]);
    expect(solved).toHaveLength(4);
    expect(solved!.every((e) => e.count === 1)).toBe(true);
  });

  it("refuses crossing bridges", () => {
    // Plus shape: the only two candidate bridges cross at the centre.
    const islands: Island[] = [
      { id: 0, r: 0, c: 2, clue: 1 },
      { id: 1, r: 4, c: 2, clue: 1 },
      { id: 2, r: 2, c: 0, clue: 1 },
      { id: 3, r: 2, c: 4, clue: 1 },
    ];
    expect(bruteForceSolve(islands)).toBeNull();
    expect(solveHashi({ islands })).toBeNull();
  });

  it("finds a solution when only the non-crossing choice works", () => {
    // Same plus shape plus an extra island: the vertical pair must stay
    // unbridged so the horizontal one can be placed, and the vertical islands
    // are reached around the outside instead.
    const islands: Island[] = [
      { id: 0, r: 0, c: 2, clue: 1 },
      { id: 1, r: 4, c: 2, clue: 1 },
      { id: 2, r: 2, c: 0, clue: 2 },
      { id: 3, r: 2, c: 4, clue: 2 },
      { id: 4, r: 0, c: 0, clue: 2 },
      { id: 5, r: 4, c: 4, clue: 2 },
    ];
    const solved = solveHashi({ islands });
    expect(solved).not.toBeNull();
    expect(ruleViolations(islands, edgesToBridges(islands, solved!))).toEqual([]);
    expect(solved!.some((e) => e.id1 === 0 && e.id2 === 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isConnected
// ---------------------------------------------------------------------------

describe("isConnected", () => {
  it("trivially true for an empty list", () => {
    expect(isConnected([], [])).toBe(true);
  });

  it("true for a single island with no edges", () => {
    expect(isConnected([0], [])).toBe(true);
  });

  it("true for a simple chain: 0-1-2", () => {
    const edges: BridgeEdge[] = [
      { id1: 0, id2: 1, count: 1 },
      { id1: 1, id2: 2, count: 1 },
    ];
    expect(isConnected([0, 1, 2], edges)).toBe(true);
  });

  it("false when two islands are isolated from the rest", () => {
    // islands 0,1 connected; island 2 isolated
    const edges: BridgeEdge[] = [{ id1: 0, id2: 1, count: 1 }];
    expect(isConnected([0, 1, 2], edges)).toBe(false);
  });

  it("edges with count=0 do not count for connectivity", () => {
    const edges: BridgeEdge[] = [{ id1: 0, id2: 1, count: 0 }];
    expect(isConnected([0, 1], edges)).toBe(false);
  });

  it("edge referencing an out-of-ids neighbour triggers the ?? [] fallback", () => {
    // ids=[0]; edge 0→99 where 99 is NOT in ids.
    // adj = {0: []}; adj.get(0)?.push(99) → adj = {0: [99]}.
    // BFS: processes 0, visits 99. adj.get(99) = undefined → ?? [] = [] fires.
    // visited={0,99} (size 2) ≠ ids.length (1) → returns false.
    const edges: BridgeEdge[] = [{ id1: 0, id2: 99, count: 1 }];
    expect(isConnected([0], edges)).toBe(false);
  });

  it("double bridge (count=2) still counts as connected", () => {
    const edges: BridgeEdge[] = [{ id1: 0, id2: 1, count: 2 }];
    expect(isConnected([0, 1], edges)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// wouldCross
// ---------------------------------------------------------------------------

describe("wouldCross", () => {
  it("horizontal new bridge does not cross a parallel horizontal existing bridge", () => {
    // existing horizontal bridge: (2,1)-(2,5)
    const existing = [mkBridge(0, 1, 2, 1, 2, 5)];
    // new horizontal bridge: (3,1)-(3,5)
    expect(wouldCross(3, 1, 3, 5, existing)).toBe(false);
  });

  it("vertical new bridge does not cross a parallel vertical existing bridge", () => {
    const existing = [mkBridge(0, 1, 1, 3, 5, 3)];
    expect(wouldCross(1, 4, 5, 4, existing)).toBe(false);
  });

  it("perpendicular bridges that share a crossing cell DO cross", () => {
    // horizontal bridge (2,1)-(2,5) and vertical bridge (0,3)-(4,3)
    // vertical column=3 is between 1 and 5 (strict); horizontal row=2 between 0 and 4 (strict)
    const existing = [mkBridge(0, 1, 2, 1, 2, 5)]; // horizontal
    expect(wouldCross(0, 3, 4, 3, existing)).toBe(true); // new vertical
  });

  it("perpendicular bridges that share only an endpoint do NOT cross", () => {
    // horizontal (2,1)-(2,5); new vertical from (2,5) downward
    const existing = [mkBridge(0, 1, 2, 1, 2, 5)];
    // vertical col=5: vc1=5, hc1=1, hc2=5 → vc1 < hc2 is false (5 < 5 is false)
    expect(wouldCross(2, 5, 6, 5, existing)).toBe(false);
  });

  it("perpendicular bridges whose paths are adjacent but don't intersect do NOT cross", () => {
    // horizontal (2,1)-(2,3); vertical (0,4)-(4,4)  — col 4 is not between 1 and 3
    const existing = [mkBridge(0, 1, 2, 1, 2, 3)];
    expect(wouldCross(0, 4, 4, 4, existing)).toBe(false);
  });

  it("bridges with count=0 are ignored for crossing purposes", () => {
    const existing = [mkBridge(0, 1, 2, 1, 2, 5, 0)]; // count=0, ghost bridge
    expect(wouldCross(0, 3, 4, 3, existing)).toBe(false);
  });

  it("detects crossing among multiple existing bridges", () => {
    const existing = [
      mkBridge(0, 1, 1, 1, 1, 5), // horizontal row=1, cols 1-5
      mkBridge(2, 3, 3, 2, 3, 4), // horizontal row=3, cols 2-4
    ];
    // new vertical col=3, rows 0-5 → crosses both horizontals
    expect(wouldCross(0, 3, 5, 3, existing)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pathClear
// ---------------------------------------------------------------------------

describe("pathClear", () => {
  const islands: Island[] = [
    { id: 0, r: 0, c: 0, clue: 1 },
    { id: 1, r: 0, c: 5, clue: 1 },
    { id: 2, r: 0, c: 2, clue: 2 }, // obstructs path from 0 to 1
    { id: 3, r: 3, c: 0, clue: 1 }, // same column as 0, below
  ];

  it("returns true when path is clear (no islands in between)", () => {
    // 0→3 vertical: rows 1,2 between 0 and 3, none has an island there
    expect(pathClear(islands[0], islands[3], islands)).toBe(true);
  });

  it("returns false when an island lies between the two endpoints", () => {
    // 0→1 horizontal: island 2 at (0,2) is between col 0 and col 5
    expect(pathClear(islands[0], islands[1], islands)).toBe(false);
  });

  it("endpoints themselves are not considered obstructions", () => {
    // ensure we only check strictly between, not at isl1 or isl2
    const twoIslands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 1 },
      { id: 1, r: 0, c: 2, clue: 1 },
    ];
    expect(pathClear(twoIslands[0], twoIslands[1], twoIslands)).toBe(true);
  });

  it("returns true for a clear upward vertical path (dr = -1)", () => {
    // isl2 is ABOVE isl1: isl2.r < isl1.r → dr = -1 (the '-1' ternary branch)
    // island A at (5,3), island B at (1,3), no obstructions in between
    const a: Island = { id: 0, r: 5, c: 3, clue: 1 };
    const b: Island = { id: 1, r: 1, c: 3, clue: 1 };
    expect(pathClear(a, b, [a, b])).toBe(true);
  });

  it("returns true for a clear leftward horizontal path (dc = -1)", () => {
    // isl2 is to the LEFT of isl1: isl2.c < isl1.c → dc = -1 (the '-1' branch)
    // island A at (3,8), island B at (3,2), no obstructions in between
    const a: Island = { id: 0, r: 3, c: 8, clue: 1 };
    const b: Island = { id: 1, r: 3, c: 2, clue: 1 };
    expect(pathClear(a, b, [a, b])).toBe(true);
  });

  it("returns false for a blocked upward path (dr = -1, obstruction)", () => {
    // isl2 is above isl1, and there's an island in between
    const a: Island = { id: 0, r: 5, c: 3, clue: 1 };
    const blocker: Island = { id: 2, r: 3, c: 3, clue: 2 };
    const b: Island = { id: 1, r: 1, c: 3, clue: 1 };
    expect(pathClear(a, b, [a, b, blocker])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// islandDegree
// ---------------------------------------------------------------------------

describe("islandDegree", () => {
  it("returns 0 when no bridges touch the island", () => {
    const bs: PlayerBridge[] = [mkBridge(1, 2, 0, 1, 0, 3)];
    expect(islandDegree(0, bs)).toBe(0);
  });

  it("sums all bridge counts incident to the island", () => {
    const bs: PlayerBridge[] = [
      mkBridge(0, 1, 0, 0, 0, 2, 2), // double bridge to island 1
      mkBridge(0, 2, 0, 0, 2, 0, 1), // single bridge to island 2
    ];
    expect(islandDegree(0, bs)).toBe(3);
  });

  it("counts bridges whether the island is id1 or id2", () => {
    const bs: PlayerBridge[] = [mkBridge(3, 5, 1, 0, 1, 4, 2)];
    expect(islandDegree(3, bs)).toBe(2);
    expect(islandDegree(5, bs)).toBe(2);
  });

  it("zero-count bridges contribute 0", () => {
    const bs: PlayerBridge[] = [mkBridge(0, 1, 0, 0, 0, 3, 0)];
    expect(islandDegree(0, bs)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// checkWin — satisfied AND connected
// ---------------------------------------------------------------------------

describe("checkWin", () => {
  it("returns false for an empty island list", () => {
    expect(checkWin([], [])).toBe(false);
  });

  it("wins when all clues satisfied and islands connected", () => {
    // Simple 3-island chain: 1—2—1
    const islands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 1 },
      { id: 1, r: 0, c: 2, clue: 2 },
      { id: 2, r: 0, c: 4, clue: 1 },
    ];
    const bridges: PlayerBridge[] = [
      mkBridge(0, 1, 0, 0, 0, 2, 1),
      mkBridge(1, 2, 0, 2, 0, 4, 1),
    ];
    expect(checkWin(islands, bridges)).toBe(true);
  });

  it("does NOT win when clues satisfied but graph is disconnected (key invariant)", () => {
    // Two isolated pairs, each internally satisfied, but not connected to each other
    // A: island 0 (clue 1) ↔ island 1 (clue 1)
    // B: island 2 (clue 1) ↔ island 3 (clue 1)
    const islands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 1 },
      { id: 1, r: 0, c: 2, clue: 1 },
      { id: 2, r: 4, c: 0, clue: 1 },
      { id: 3, r: 4, c: 2, clue: 1 },
    ];
    const bridges: PlayerBridge[] = [
      mkBridge(0, 1, 0, 0, 0, 2, 1),
      mkBridge(2, 3, 4, 0, 4, 2, 1),
    ];
    // All clues satisfied (each island has degree 1 = clue 1),
    // but {0,1} and {2,3} are separate components
    expect(checkWin(islands, bridges)).toBe(false);
  });

  it("does NOT win when clues are not yet satisfied", () => {
    const islands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 2 }, // needs 2 but gets 1
      { id: 1, r: 0, c: 3, clue: 2 },
    ];
    const bridges: PlayerBridge[] = [mkBridge(0, 1, 0, 0, 0, 3, 1)];
    expect(checkWin(islands, bridges)).toBe(false);
  });

  it("does NOT win when an island is over its clue", () => {
    const islands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 1 },
      { id: 1, r: 0, c: 3, clue: 1 },
    ];
    // Double bridge but clue is 1 → over
    const bridges: PlayerBridge[] = [mkBridge(0, 1, 0, 0, 0, 3, 2)];
    expect(checkWin(islands, bridges)).toBe(false);
  });

  it("wins with a double bridge satisfying clue=2", () => {
    const islands: Island[] = [
      { id: 0, r: 0, c: 0, clue: 2 },
      { id: 1, r: 0, c: 3, clue: 2 },
    ];
    const bridges: PlayerBridge[] = [mkBridge(0, 1, 0, 0, 0, 3, 2)];
    expect(checkWin(islands, bridges)).toBe(true);
  });

  it("accepts any valid layout, not only the stored solution", () => {
    // Square with clues 2: the stored solution is the 4-cycle of single
    // bridges; the player may instead use two double bridges — except that
    // this leaves two groups, so only layouts that also connect win.
    const p = squarePuzzle();
    const cycle = solutionToBridges(p);
    expect(checkWin(p.islands, cycle)).toBe(true);
    const twoDoubles: PlayerBridge[] = [
      mkBridge(0, 1, 0, 0, 0, 4, 2),
      mkBridge(2, 3, 4, 0, 4, 4, 2),
    ];
    expect(checkWin(p.islands, twoDoubles)).toBe(false);
    // A different connected layout with the same clues wins as well.
    const alt: HashiPuzzle = {
      ...p,
      islands: [
        { id: 0, r: 0, c: 0, clue: 2 },
        { id: 1, r: 0, c: 4, clue: 3 },
        { id: 2, r: 4, c: 0, clue: 1 },
        { id: 3, r: 4, c: 4, clue: 2 },
      ],
    };
    const layout1: PlayerBridge[] = [
      mkBridge(0, 1, 0, 0, 0, 4, 2),
      mkBridge(1, 3, 0, 4, 4, 4, 1),
      mkBridge(2, 3, 4, 0, 4, 4, 1),
    ];
    const layout2: PlayerBridge[] = [
      mkBridge(0, 1, 0, 0, 0, 4, 1),
      mkBridge(0, 2, 0, 0, 4, 0, 1),
      mkBridge(1, 3, 0, 4, 4, 4, 2),
    ];
    expect(checkWin(alt.islands, layout1)).toBe(true);
    expect(checkWin(alt.islands, layout2)).toBe(true);
  });

  it("applying the solution edges wins every generated puzzle", () => {
    const diff = DIFFICULTIES.find((d) => d.key === "easy")!;
    const testSeeds = ["win-a", "win-b", "win-c", "win-d"];
    for (const seed of testSeeds) {
      const puzzle = buildPuzzle(makeRng(seed), diff);
      expect(
        checkWin(puzzle.islands, solutionToBridges(puzzle)),
        `seed "${seed}" solution should win`,
      ).toBe(true);
    }
  });
});
