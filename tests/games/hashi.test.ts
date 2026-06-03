import { describe, it, expect } from "vitest";
import {
  buildPuzzle,
  isConnected,
  wouldCross,
  pathClear,
  islandDegree,
  checkWin,
  DIFFICULTIES,
  type Difficulty,
  type Island,
  type PlayerBridge,
  type BridgeEdge,
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
        // Build player-bridge list from solution for crossing check
        const idToIsland = new Map(puzzle.islands.map((i) => [i.id, i]));
        const pb: PlayerBridge[] = puzzle.solution.map((e) => {
          const a = idToIsland.get(e.id1)!;
          const b = idToIsland.get(e.id2)!;
          return mkBridge(e.id1, e.id2, a.r, a.c, b.r, b.c, e.count);
        });
        for (let i = 0; i < pb.length; i++) {
          const b = pb[i];
          // Check bridge b against all bridges AFTER it (avoid self-check)
          const rest = pb.filter((_, idx) => idx !== i);
          expect(
            wouldCross(b.r1, b.c1, b.r2, b.c2, rest),
            `bridge ${b.id1}-${b.id2} crosses another`,
          ).toBe(false);
        }
      });

      it("solution graph is fully connected", () => {
        const ids = puzzle.islands.map((i) => i.id);
        expect(isConnected(ids, puzzle.solution)).toBe(true);
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

  it("accepts a raw string seed (false branch of Rng-object check, line 103)", () => {
    // When rngOrSeed is a string (not an Rng object), buildPuzzle calls makeRng()
    // internally. The false branch of `typeof rngOrSeed.next === 'function'` fires.
    const diff = DIFFICULTIES.find((d) => d.key === "easy")!;
    const p = buildPuzzle("string-seed-42", diff);
    expect(p.islands.length).toBeGreaterThanOrEqual(3);
    expect(p.gc).toBe(diff.cols);
  });

  it("accepts a numeric seed (false branch of Rng-object check, line 103)", () => {
    // Same — passing a number triggers the false branch.
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
// Fallback path (line 118): tryGenerate always returns null → empty puzzle
// ---------------------------------------------------------------------------

describe("buildPuzzle — degenerate 2×2 grid forces fallback empty puzzle", () => {
  // With a 2×2 grid the generator can never place more than 1 island (the
  // first one, at r=1,c=1 — the only interior cell), so tryGenerate always
  // returns null (islandList.length < 3). After 40+1 attempts the ?-fallback
  // on line 118 fires and returns { islands: [], solution: [], gc: 2, gr: 2 }.
  it("returns an empty-islands puzzle for an impossibly tiny grid", () => {
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

  it("edge referencing an out-of-ids neighbour triggers the ?? [] fallback (line 300)", () => {
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

  it("returns true for a clear upward vertical path (dr = -1, line 364)", () => {
    // isl2 is ABOVE isl1: isl2.r < isl1.r → dr = -1 (the '-1' ternary branch)
    // island A at (5,3), island B at (1,3), no obstructions in between
    const a: Island = { id: 0, r: 5, c: 3, clue: 1 };
    const b: Island = { id: 1, r: 1, c: 3, clue: 1 };
    expect(pathClear(a, b, [a, b])).toBe(true);
  });

  it("returns true for a clear leftward horizontal path (dc = -1, line 365)", () => {
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

  it("applying the solution edges wins every generated puzzle", () => {
    const diff = DIFFICULTIES.find((d) => d.key === "easy")!;
    const testSeeds = ["win-a", "win-b", "win-c", "win-d"];
    for (const seed of testSeeds) {
      const puzzle = buildPuzzle(makeRng(seed), diff);
      const idToIsland = new Map(puzzle.islands.map((i) => [i.id, i]));
      const solutionBridges: PlayerBridge[] = puzzle.solution.map((e) => {
        const a = idToIsland.get(e.id1)!;
        const b = idToIsland.get(e.id2)!;
        return mkBridge(e.id1, e.id2, a.r, a.c, b.r, b.c, e.count);
      });
      expect(
        checkWin(puzzle.islands, solutionBridges),
        `seed "${seed}" solution should win`,
      ).toBe(true);
    }
  });
});
