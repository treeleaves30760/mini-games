import { describe, it, expect } from "vitest";
import {
  CAPACITY,
  DIFFICULTIES,
  MAX_ATTEMPTS,
  topRun,
  isComplete,
  canPour,
  pour,
  isSolved,
  solve,
  generatePuzzle,
} from "~/games/water-sort";
import type { State, Move } from "~/games/water-sort";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Reference rules, written from the game description and independent of the
// module helpers. Everything the module returns is replayed through these.
// ---------------------------------------------------------------------------
const CAP = 4;

function refTop(tube: number[]): { color: number; run: number } {
  const color = tube[tube.length - 1];
  let run = 0;
  while (run < tube.length && tube[tube.length - 1 - run] === color) run++;
  return { color, run };
}

function refCanPour(state: State, from: number, to: number): boolean {
  if (from === to) return false;
  const src = state[from];
  const dst = state[to];
  if (src.length === 0) return false;
  if (dst.length === CAP) return false;
  if (dst.length === 0) return true;
  return refTop(dst).color === refTop(src).color;
}

function refPour(state: State, from: number, to: number): State {
  const next = state.map((t) => t.slice());
  const { run } = refTop(next[from]);
  const space = CAP - next[to].length;
  const n = Math.min(run, space);
  const moved = next[from].splice(next[from].length - n, n);
  next[to].push(...moved);
  return next;
}

function refSolved(state: State): boolean {
  for (const t of state) {
    if (t.length === 0) continue;
    if (t.length !== CAP) return false;
    for (const c of t) if (c !== t[0]) return false;
  }
  return true;
}

/** Exhaustive BFS over the reference rules; small boards only. */
function refSolvable(start: State): boolean {
  const key = (s: State) => s.map((t) => t.join(",")).sort().join("|");
  const seen = new Set<string>([key(start)]);
  const queue: State[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const s = queue[head];
    if (refSolved(s)) return true;
    for (let a = 0; a < s.length; a++) {
      for (let b = 0; b < s.length; b++) {
        if (!refCanPour(s, a, b)) continue;
        const n = refPour(s, a, b);
        const k = key(n);
        if (!seen.has(k)) {
          seen.add(k);
          queue.push(n);
        }
      }
    }
  }
  return false;
}

/** Replay a move list with the reference rules; every move must be legal. */
function replay(start: State, moves: Move[]): State {
  let s = start;
  moves.forEach(([from, to], i) => {
    expect(refCanPour(s, from, to), `move ${i}: ${from}->${to} must be legal`).toBe(true);
    s = refPour(s, from, to);
  });
  return s;
}

function sortedUnits(state: State): number[] {
  return state.flat().sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("constants", () => {
  it("tubes hold four units and the difficulties are 4 / 6 / 8 colours", () => {
    expect(CAPACITY).toBe(4);
    expect(DIFFICULTIES.map((d) => d.label)).toEqual(["簡單", "普通", "困難"]);
    expect(DIFFICULTIES.map((d) => d.colors)).toEqual([4, 6, 8]);
    expect(MAX_ATTEMPTS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// topRun / isComplete
// ---------------------------------------------------------------------------
describe("topRun / isComplete", () => {
  it("counts consecutive top units of the same colour", () => {
    expect(topRun([])).toBe(0);
    expect(topRun([1])).toBe(1);
    expect(topRun([1, 2, 2])).toBe(2);
    expect(topRun([2, 2, 2, 2])).toBe(4);
    expect(topRun([2, 2, 1])).toBe(1);
  });

  it("a tube is complete only when full of one colour", () => {
    expect(isComplete([3, 3, 3, 3])).toBe(true);
    expect(isComplete([3, 3, 3])).toBe(false);
    expect(isComplete([3, 3, 3, 1])).toBe(false);
    expect(isComplete([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canPour
// ---------------------------------------------------------------------------
describe("canPour", () => {
  const state: State = [
    [0, 1, 1], // top colour 1, run 2
    [2, 1], // top colour 1
    [], // empty
    [0, 2, 2, 2], // full
    [1, 0], // top colour 0
  ];

  it("refuses pouring a tube into itself", () => {
    expect(canPour(state, 0, 0)).toBe(false);
    expect(canPour(state, 2, 2)).toBe(false);
  });

  it("refuses pouring from an empty tube", () => {
    expect(canPour(state, 2, 0)).toBe(false);
    expect(canPour(state, 2, 4)).toBe(false);
  });

  it("refuses pouring into a full tube", () => {
    expect(canPour(state, 1, 3)).toBe(false);
    expect(canPour([[2], [2, 2, 2, 2]], 0, 1)).toBe(false);
  });

  it("refuses a mismatched top colour", () => {
    expect(canPour(state, 0, 4)).toBe(false);
    expect(canPour(state, 4, 1)).toBe(false);
  });

  it("allows pouring into an empty tube or onto the same colour", () => {
    expect(canPour(state, 0, 2)).toBe(true);
    expect(canPour(state, 4, 2)).toBe(true);
    expect(canPour(state, 0, 1)).toBe(true);
    expect(canPour(state, 1, 0)).toBe(true);
  });

  it("agrees with the reference rule on every pair of a mixed board", () => {
    for (let a = 0; a < state.length; a++) {
      for (let b = 0; b < state.length; b++) {
        expect(canPour(state, a, b), `${a}->${b}`).toBe(refCanPour(state, a, b));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// pour
// ---------------------------------------------------------------------------
describe("pour", () => {
  it("pours the whole top run when it fits", () => {
    const s: State = [[0, 1, 1], [1], []];
    expect(pour(s, 0, 1)).toEqual([[0], [1, 1, 1], []]);
  });

  it("pours only as many units as fit (partial pour)", () => {
    const s: State = [[1, 1, 1], [0, 0, 1], []];
    expect(pour(s, 0, 1)).toEqual([[1, 1], [0, 0, 1, 1], []]);
  });

  it("moves the full run into an empty tube", () => {
    const s: State = [[2, 0, 0, 0], [], []];
    expect(pour(s, 0, 1)).toEqual([[2], [0, 0, 0], []]);
  });

  it("moves an entire single-colour tube into an empty tube", () => {
    const s: State = [[3, 3], []];
    expect(pour(s, 0, 1)).toEqual([[], [3, 3]]);
  });

  it("does not mutate the input state", () => {
    const s: State = [[0, 1, 1], [1], []];
    const copy = s.map((t) => t.slice());
    pour(s, 0, 1);
    expect(s).toEqual(copy);
  });

  it("matches the reference pour on a variety of legal moves", () => {
    const s: State = [[0, 1, 1], [2, 1], [], [0, 2, 2], [1, 0], [2]];
    for (let a = 0; a < s.length; a++) {
      for (let b = 0; b < s.length; b++) {
        if (!refCanPour(s, a, b)) continue;
        expect(pour(s, a, b), `${a}->${b}`).toEqual(refPour(s, a, b));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isSolved
// ---------------------------------------------------------------------------
describe("isSolved", () => {
  it("is true when every tube is empty or full of one colour", () => {
    expect(isSolved([[0, 0, 0, 0], [], [1, 1, 1, 1]])).toBe(true);
    expect(isSolved([[], []])).toBe(true);
    expect(isSolved([])).toBe(true);
  });

  it("is false with a partial tube, even if single-coloured", () => {
    expect(isSolved([[0, 0, 0], [0], []])).toBe(false);
  });

  it("is false with a full tube of mixed colours", () => {
    expect(isSolved([[0, 0, 0, 1], [1, 1, 1, 0]])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// solve
// ---------------------------------------------------------------------------
describe("solve", () => {
  it("returns an empty move list for a solved board", () => {
    expect(solve([[0, 0, 0, 0], []])).toEqual([]);
    expect(solve([], 5)).toEqual([]);
  });

  it("returns null when no pour is possible", () => {
    const stuck: State = [[0, 1, 0, 1], [1, 0, 1, 0]];
    expect(solve(stuck)).toBeNull();
    expect(refSolvable(stuck)).toBe(false);
  });

  it("returns null when the node budget is exhausted", () => {
    const s: State = [[0, 1, 0, 1], [1, 0, 1, 0], [], []];
    expect(refSolvable(s)).toBe(true);
    expect(solve(s, 0)).toBeNull();
    expect(solve(s, 1)).toBeNull();
    expect(solve(s)).not.toBeNull();
  });

  it("returns null after exhausting every reachable state when no colour can fill a tube", () => {
    const s: State = [[0, 1, 0], [1, 0, 1], [], []];
    expect(refSolvable(s)).toBe(false);
    expect(solve(s)).toBeNull();
  });

  it("finds a legal solution for a small hand-made puzzle", () => {
    const s: State = [
      [0, 1, 2, 0],
      [1, 2, 0, 1],
      [2, 0, 1, 2],
      [],
      [],
    ];
    const moves = solve(s);
    expect(moves).not.toBeNull();
    const end = replay(s, moves!);
    expect(refSolved(end)).toBe(true);
    expect(isSolved(end)).toBe(true);
    expect(sortedUnits(end)).toEqual(sortedUnits(s));
  });

  it("uses a partial pour when that is the only way forward", () => {
    // Found by exhaustive search: solvable with partial pours, unsolvable when
    // every pour must move its whole run.
    const s: State = [[1, 1, 2, 0], [1, 0], [0, 1, 2], [0, 2, 2]];
    expect(refSolvable(s)).toBe(true);
    const moves = solve(s);
    expect(moves).not.toBeNull();
    let cur = s;
    let partial = 0;
    for (const [from, to] of moves!) {
      if (refTop(cur[from]).run > CAP - cur[to].length) partial++;
      cur = refPour(cur, from, to);
    }
    expect(partial).toBeGreaterThan(0);
    expect(refSolved(replay(s, moves!))).toBe(true);
  });

  it("agrees with the exhaustive reference search on random three-colour boards", () => {
    const rng = makeRng("solve-agreement");
    let solvable = 0;
    let unsolvable = 0;
    for (let i = 0; i < 150; i++) {
      const units = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2];
      rng.shuffle(units);
      const empties = rng.int(0, 1);
      const s: State = [units.slice(0, 4), units.slice(4, 8), units.slice(8, 12)];
      for (let e = 0; e < empties; e++) s.push([]);
      const moves = solve(s);
      const expected = refSolvable(s);
      expect(moves !== null, `board ${i}`).toBe(expected);
      if (moves) {
        expect(refSolved(replay(s, moves))).toBe(true);
        solvable++;
      } else {
        unsolvable++;
      }
    }
    expect(solvable).toBeGreaterThan(0);
    expect(unsolvable).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// generatePuzzle
// ---------------------------------------------------------------------------
describe("generatePuzzle", () => {
  it("is deterministic for the same seed", () => {
    const a = generatePuzzle(makeRng("2026-09-04"), { colors: 6 });
    const b = generatePuzzle(makeRng("2026-09-04"), { colors: 6 });
    expect(a).toEqual(b);
  });

  it("differs across seeds", () => {
    const a = generatePuzzle(makeRng("a"), { colors: 6 });
    const b = generatePuzzle(makeRng("b"), { colors: 6 });
    expect(a).not.toEqual(b);
  });

  it("defaults to two empty tubes and honours a custom count", () => {
    const def = generatePuzzle(makeRng(1), { colors: 4 });
    expect(def).toHaveLength(6);
    expect(def.filter((t) => t.length === 0)).toHaveLength(2);

    const three = generatePuzzle(makeRng(1), { colors: 4, emptyTubes: 3 });
    expect(three).toHaveLength(7);
    expect(three.filter((t) => t.length === 0)).toHaveLength(3);
  });

  it("throws instead of returning an unsolvable board when attempts run out", () => {
    // One colour always yields a complete tube, which is rejected every time.
    expect(() => generatePuzzle(makeRng(3), { colors: 1 })).toThrow(/solvable/);
    // Without an empty tube no pour is ever possible, so every shuffle fails the solver.
    expect(() => generatePuzzle(makeRng(5), { colors: 3, emptyTubes: 0 })).toThrow(/solvable/);
  });

  for (const { label, colors } of DIFFICULTIES) {
    it(`${label} (${colors} colours): 60 seeds are well-formed and solvable by the reference rules`, () => {
      for (let seed = 0; seed < 60; seed++) {
        const rng = makeRng(`${label}-${seed}`);
        const state = generatePuzzle(rng, { colors });

        // Shape: colours full tubes, two empties, each colour exactly four times.
        expect(state).toHaveLength(colors + 2);
        expect(state.slice(0, colors).every((t) => t.length === CAP)).toBe(true);
        expect(state.slice(colors)).toEqual([[], []]);
        const counts = new Map<number, number>();
        for (const c of state.flat()) counts.set(c, (counts.get(c) ?? 0) + 1);
        expect(counts.size).toBe(colors);
        for (const n of counts.values()) expect(n).toBe(CAP);

        // No trivial start.
        for (const t of state) {
          expect(t.every((c) => c === t[0]) && t.length === CAP).toBe(false);
        }

        // Solvable: the module's own move list is legal under the reference rules.
        const moves = solve(state);
        expect(moves, `seed ${seed}`).not.toBeNull();
        expect(moves!.length).toBeGreaterThan(0);
        const end = replay(state, moves!);
        expect(refSolved(end)).toBe(true);
        expect(sortedUnits(end)).toEqual(sortedUnits(state));
      }
    });
  }

  it("簡單 boards are confirmed solvable by the exhaustive reference search", () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = generatePuzzle(makeRng(`easy-bfs-${seed}`), { colors: 4 });
      expect(refSolvable(state), `seed ${seed}`).toBe(true);
    }
  });
});
