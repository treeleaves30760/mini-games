/* Hashi (Hashiwokakero / Bridges) — framework-free pure game logic.
   Island/bridge generation, legality checks, crossing detection, solving and
   win detection are all deterministic given a seed, so they can be unit-tested
   independently of the Vue component's animation / localStorage / timer.

   Puzzle invariants guaranteed by the generator — and re-checked by
   isValidPuzzle() and solveHashi() before buildPuzzle() hands a puzzle out:
   - Every island's clue equals the total bridges incident to it in the solution.
   - Bridges run only horizontally or vertically between two islands and never
     pass through a third island.
   - At most 2 bridges between any pair of islands.
   - No two bridges cross each other.
   - The solution graph is fully connected (every island reachable from any other).
*/

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single island node. */
export interface Island {
  id: number;
  /** Row (0-based). */
  r: number;
  /** Column (0-based). */
  c: number;
  /** Required bridge count (clue shown to the player). */
  clue: number;
}

/** A directed bridge edge in the solution or in the player's state. */
export interface BridgeEdge {
  id1: number;
  id2: number;
  /** Number of bridges (1 or 2). 0 means "removed" in player state. */
  count: number;
}

/** Full puzzle descriptor returned by the generator. */
export interface HashiPuzzle {
  /** Grid width (columns). */
  gc: number;
  /** Grid height (rows). */
  gr: number;
  islands: Island[];
  /** One valid solution (the one the generator built the puzzle from). */
  solution: BridgeEdge[];
}

/** A player-placed bridge also stores the physical coordinates for rendering. */
export interface PlayerBridge extends BridgeEdge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The four orthogonal direction vectors (N, E, S, W). */
export const DIRS4: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

/**
 * Upper bound on generation attempts per buildPuzzle() call. On the shipped
 * difficulties the first attempt succeeds almost always; the bound only matters
 * for degenerate grids that cannot hold the requested island count.
 */
const MAX_BUILD_ATTEMPTS = 200;

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export interface Difficulty {
  key: string;
  label: string;
  cols: number;
  rows: number;
  targetIslands: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { key: "easy",   label: "簡單", cols: 7,  rows: 7,  targetIslands: 6  },
  { key: "normal", label: "普通", cols: 9,  rows: 9,  targetIslands: 10 },
  { key: "hard",   label: "困難", cols: 11, rows: 11, targetIslands: 14 },
];

// ---------------------------------------------------------------------------
// Puzzle generation
// ---------------------------------------------------------------------------

/**
 * Generate a Hashi puzzle for the given difficulty, using the provided RNG
 * (or seed). Attempts are made until one yields a puzzle that
 *   1. passes the independent rule check (isValidPuzzle),
 *   2. is confirmed solvable by the solver (solveHashi), and
 *   3. holds at least 60% of the difficulty's target island count.
 * If no attempt reaches the island quota, the largest puzzle that passed the
 * first two gates is returned instead, so a solvable puzzle is always handed
 * out whenever the grid can hold one at all. Only a grid too small to hold
 * three islands yields an empty puzzle.
 */
export function buildPuzzle(
  rngOrSeed: Rng | string | number | null | undefined,
  diff: Difficulty,
): HashiPuzzle {
  const rng: Rng =
    rngOrSeed !== null &&
    rngOrSeed !== undefined &&
    typeof (rngOrSeed as Rng).next === "function"
      ? (rngOrSeed as Rng)
      : makeRng(rngOrSeed as string | number | null);

  const { cols: gc, rows: gr, targetIslands: target } = diff;
  const minIslands = Math.ceil(target * 0.6);

  // Largest valid-but-undersized candidate seen so far (fallback only).
  let best: HashiPuzzle | null = null;

  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const result = tryGenerate(rng, gc, gr, target);
    // The generator upholds the rules by construction; the validator and the
    // solver are an independent gate so that a broken puzzle can never reach
    // the player.
    if (!result || !isValidPuzzle(result) || solveHashi(result) === null) {
      continue;
    }
    if (result.islands.length >= minIslands) return result;
    if (!best || result.islands.length > best.islands.length) best = result;
  }

  return best ?? { islands: [], solution: [], gc, gr };
}

/** Internal: one generation attempt.  Returns null if the result is too small. */
function tryGenerate(
  rng: Rng,
  gc: number,
  gr: number,
  target: number,
): HashiPuzzle | null {
  // islandGrid[r][c] = island id (or -1)
  const islandGrid: number[][] = Array.from({ length: gr }, () =>
    Array(gc).fill(-1),
  );
  // occupied[r][c] = 'h' | 'v' | null — cells that a bridge passes through
  const occupied: (string | null)[][] = Array.from({ length: gr }, () =>
    Array(gc).fill(null),
  );

  interface IslandNode {
    id: number;
    r: number;
    c: number;
    degree: number;
  }

  const islandList: IslandNode[] = [];
  const solutionEdges: BridgeEdge[] = [];

  function isInterior(r: number, c: number): boolean {
    return r >= 1 && r < gr - 1 && c >= 1 && c < gc - 1;
  }

  /**
   * True if (r, c) can host a new island: the cell holds neither an island nor
   * a bridge (an island placed on a bridge cell would put that bridge through
   * the island, making the stored solution illegal), and no orthogonal
   * neighbour holds an island. Only interior cells are passed in, so all four
   * neighbours are inside the grid.
   */
  function cellFree(r: number, c: number): boolean {
    if (islandGrid[r][c] !== -1 || occupied[r][c] !== null) return false;
    for (const [dr, dc] of DIRS4) {
      if (islandGrid[r + dr][c + dc] !== -1) return false;
    }
    return true;
  }

  /**
   * True if every cell strictly between the two endpoints is free of islands
   * and of bridges. Any occupied cell is rejected regardless of orientation:
   * a parallel overlap can only arise when the destination sits on an existing
   * bridge, which cellFree() already forbids, so it never needs allowing.
   */
  function canPlaceBridge(
    r1: number,
    c1: number,
    r2: number,
    c2: number,
  ): boolean {
    const dr = r2 > r1 ? 1 : r2 < r1 ? -1 : 0;
    const dc = c2 > c1 ? 1 : c2 < c1 ? -1 : 0;
    let r = r1 + dr;
    let c = c1 + dc;
    while (r !== r2 || c !== c2) {
      if (islandGrid[r][c] !== -1 || occupied[r][c] !== null) return false;
      r += dr;
      c += dc;
    }
    return true;
  }

  function markBridge(
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    orientation: string,
  ): void {
    const dr = r2 > r1 ? 1 : r2 < r1 ? -1 : 0;
    const dc = c2 > c1 ? 1 : c2 < c1 ? -1 : 0;
    let r = r1 + dr;
    let c = c1 + dc;
    while (r !== r2 || c !== c2) {
      occupied[r][c] = orientation;
      r += dr;
      c += dc;
    }
  }

  // Place the first island at a random interior cell.
  {
    const r0 = rng.int(1, gr - 2);
    const c0 = rng.int(1, gc - 2);
    islandGrid[r0][c0] = 0;
    islandList.push({ id: 0, r: r0, c: c0, degree: 0 });
  }

  let attempts = 0;
  const maxAttempts = target * 60;

  while (islandList.length < target && attempts < maxAttempts) {
    attempts++;
    const src = rng.pick(islandList);
    const dir = rng.pick(DIRS4 as [number, number][]);
    const [dr, dc] = dir;
    const orientation = dr === 0 ? "h" : "v";

    const candidates: { r: number; c: number }[] = [];
    const maxDist = orientation === "h" ? gc : gr;

    for (let d = 2; d < maxDist; d++) {
      const nr = src.r + dr * d;
      const nc = src.c + dc * d;
      if (nr < 0 || nr >= gr || nc < 0 || nc >= gc) break;
      if (!isInterior(nr, nc)) continue;
      if (!cellFree(nr, nc)) continue;
      if (!canPlaceBridge(src.r, src.c, nr, nc)) continue;
      candidates.push({ r: nr, c: nc });
    }

    if (candidates.length === 0) continue;

    const dest = rng.pick(candidates);
    const bridgeCount = rng.int(1, 2);

    const newId = islandList.length;
    islandGrid[dest.r][dest.c] = newId;
    islandList.push({ id: newId, r: dest.r, c: dest.c, degree: 0 });

    markBridge(src.r, src.c, dest.r, dest.c, orientation);
    solutionEdges.push({ id1: src.id, id2: newId, count: bridgeCount });
    src.degree += bridgeCount;
    islandList[newId].degree += bridgeCount;
  }

  if (islandList.length < 3) return null;

  // Every island was attached to an existing one by a solution edge, so the
  // solution is a spanning tree; buildPuzzle() re-verifies connectivity along
  // with every other rule through isValidPuzzle() anyway.
  return {
    islands: islandList.map((isl) => ({
      id: isl.id,
      r: isl.r,
      c: isl.c,
      clue: isl.degree,
    })),
    solution: solutionEdges,
    gc,
    gr,
  };
}

// ---------------------------------------------------------------------------
// Solution helpers and validation
// ---------------------------------------------------------------------------

/**
 * Expand a puzzle's solution edges into PlayerBridge records (with endpoint
 * coordinates) so they can be fed to wouldCross() / checkWin(). Every edge is
 * assumed to reference existing islands, which holds for generator output and
 * is checked up front by isValidPuzzle().
 */
export function solutionToBridges(
  puzzle: Pick<HashiPuzzle, "islands" | "solution">,
): PlayerBridge[] {
  const byId = new Map(puzzle.islands.map((isl) => [isl.id, isl]));
  return puzzle.solution.map((e) => {
    const a = byId.get(e.id1)!;
    const b = byId.get(e.id2)!;
    return { ...e, r1: a.r, c1: a.c, r2: b.r, c2: b.c };
  });
}

/**
 * Independent rule check of a puzzle descriptor against its stored solution.
 * Returns true iff:
 *   - there is at least one island, and every island sits inside the grid at a
 *     distinct cell with a distinct id;
 *   - every solution edge joins two distinct existing islands in the same row
 *     or column, carries 1 or 2 bridges, and no third island lies on its path;
 *   - each island pair appears at most once in the solution;
 *   - no two solution bridges cross;
 *   - every clue equals the number of bridges incident to the island;
 *   - the solution connects all islands.
 */
export function isValidPuzzle(puzzle: HashiPuzzle): boolean {
  const { islands, solution, gc, gr } = puzzle;
  if (islands.length === 0) return false;

  const byId = new Map<number, Island>();
  const cells = new Set<string>();
  for (const isl of islands) {
    if (isl.r < 0 || isl.r >= gr || isl.c < 0 || isl.c >= gc) return false;
    const cell = `${isl.r},${isl.c}`;
    if (byId.has(isl.id) || cells.has(cell)) return false;
    byId.set(isl.id, isl);
    cells.add(cell);
  }

  const pairs = new Set<string>();
  for (const e of solution) {
    const a = byId.get(e.id1);
    const b = byId.get(e.id2);
    if (!a || !b || a === b) return false;
    if (e.count < 1 || e.count > 2) return false;
    if (a.r !== b.r && a.c !== b.c) return false;
    if (!pathClear(a, b, islands)) return false;
    const pair = `${Math.min(e.id1, e.id2)}-${Math.max(e.id1, e.id2)}`;
    if (pairs.has(pair)) return false;
    pairs.add(pair);
  }

  const bridges = solutionToBridges(puzzle);
  for (let i = 0; i < bridges.length; i++) {
    const b = bridges[i];
    if (wouldCross(b.r1, b.c1, b.r2, b.c2, bridges.slice(i + 1))) return false;
  }

  // Clue totals and connectivity are exactly the win condition.
  return checkWin(islands, bridges);
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

/**
 * Backtracking solver. Candidate edges are island pairs that share a row or
 * column with no island in between; each candidate is assigned 0, 1 or 2
 * bridges in turn. Pruning: an island may never exceed its clue, it must still
 * be able to reach its clue with the edges left undecided, and a bridge may
 * not cross one already placed. A leaf is accepted when the placed bridges
 * connect all islands. Returns the placed bridges (count > 0 only, in
 * candidate order) or null when the puzzle has no solution.
 *
 * Islands are assumed to occupy distinct cells (true for generator output).
 */
export function solveHashi(
  puzzle: Pick<HashiPuzzle, "islands">,
): BridgeEdge[] | null {
  const islands = puzzle.islands;
  const n = islands.length;
  if (n === 0) return null;

  // Candidate edges, as PlayerBridge records so wouldCross() can be reused.
  // a / b are indices into `islands`.
  const cands: { a: number; b: number; bridge: PlayerBridge }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = islands[i];
      const B = islands[j];
      if (A.r !== B.r && A.c !== B.c) continue;
      if (!pathClear(A, B, islands)) continue;
      cands.push({
        a: i,
        b: j,
        bridge: { id1: A.id, id2: B.id, count: 1, r1: A.r, c1: A.c, r2: B.r, c2: B.c },
      });
    }
  }
  const m = cands.length;

  // crossers[k] = indices of the candidates that would cross candidate k.
  const crossers: number[][] = cands.map((ck) =>
    cands.flatMap((cj, j) => {
      const b = ck.bridge;
      return wouldCross(b.r1, b.c1, b.r2, b.c2, [cj.bridge]) ? [j] : [];
    }),
  );

  const counts: number[] = new Array(m).fill(0);
  const deg: number[] = new Array(n).fill(0);
  // Undecided candidate edges per island.
  const open: number[] = new Array(n).fill(0);
  for (const e of cands) {
    open[e.a]++;
    open[e.b]++;
  }

  /** Island i has not exceeded its clue and can still reach it. */
  const feasible = (i: number): boolean => {
    const need = islands[i].clue - deg[i];
    return need >= 0 && need <= 2 * open[i];
  };

  for (let i = 0; i < n; i++) {
    if (!feasible(i)) return null;
  }

  const ids = islands.map((isl) => isl.id);
  const placed = (): BridgeEdge[] =>
    cands.flatMap((e, k) =>
      counts[k] > 0
        ? [{ id1: e.bridge.id1, id2: e.bridge.id2, count: counts[k] }]
        : [],
    );

  function search(k: number): boolean {
    if (k === m) {
      // feasible() forces deg === clue once an island's last edge is decided
      // (and islands without candidates were rejected up front unless their
      // clue is 0), so only connectivity remains to be checked here.
      return isConnected(ids, placed());
    }
    const e = cands[k];
    const blocked = crossers[k].some((j) => counts[j] > 0);
    open[e.a]--;
    open[e.b]--;
    // Try the larger counts first: it homes in on a solution faster on
    // solvable puzzles and costs nothing extra on unsolvable ones.
    for (let cnt = blocked ? 0 : 2; cnt >= 0; cnt--) {
      counts[k] = cnt;
      deg[e.a] += cnt;
      deg[e.b] += cnt;
      if (feasible(e.a) && feasible(e.b) && search(k + 1)) return true;
      deg[e.a] -= cnt;
      deg[e.b] -= cnt;
    }
    counts[k] = 0;
    open[e.a]++;
    open[e.b]++;
    return false;
  }

  return search(0) ? placed() : null;
}

// ---------------------------------------------------------------------------
// Connectivity check
// ---------------------------------------------------------------------------

/**
 * Return true if all island ids are reachable from the first one via the
 * provided bridge edges (counting only edges with count > 0).
 */
export function isConnected(ids: number[], edges: BridgeEdge[]): boolean {
  if (ids.length === 0) return true;

  const adj = new Map<number, number[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) {
    if (e.count > 0) {
      adj.get(e.id1)?.push(e.id2);
      adj.get(e.id2)?.push(e.id1);
    }
  }

  const visited = new Set<number>();
  const queue: number[] = [ids[0]];
  visited.add(ids[0]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  return visited.size === ids.length;
}

// ---------------------------------------------------------------------------
// Bridge legality (player interaction)
// ---------------------------------------------------------------------------

/**
 * Return true if a bridge between island `src` and island `dst` would cross an
 * existing perpendicular bridge in `playerBridges`.
 *
 * Rule: a horizontal bridge and a vertical bridge cross iff the vertical
 * bridge's column is strictly between the horizontal bridge's columns AND the
 * horizontal bridge's row is strictly between the vertical bridge's rows.
 */
export function wouldCross(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  playerBridges: PlayerBridge[],
): boolean {
  const newH = r1 === r2;

  for (const b of playerBridges) {
    if (b.count === 0) continue;
    const bH = b.r1 === b.r2;
    if (newH === bH) continue; // parallel — never cross

    let hr1: number, hc1: number, hc2: number;
    let vr1: number, vr2: number, vc1: number;

    if (newH) {
      // new is horizontal; b is vertical
      [hr1, hc1, hc2] = [r1, Math.min(c1, c2), Math.max(c1, c2)];
      [vr1, vr2, vc1] = [Math.min(b.r1, b.r2), Math.max(b.r1, b.r2), b.c1];
    } else {
      // new is vertical; b is horizontal
      [hr1, hc1, hc2] = [b.r1, Math.min(b.c1, b.c2), Math.max(b.c1, b.c2)];
      [vr1, vr2, vc1] = [Math.min(r1, r2), Math.max(r1, r2), c1];
    }

    if (vc1 > hc1 && vc1 < hc2 && hr1 > vr1 && hr1 < vr2) {
      return true;
    }
  }
  return false;
}

/**
 * Return true if the straight-line path between two islands is clear of any
 * intervening island.
 *
 * @param islands Full island list for the current puzzle.
 */
export function pathClear(
  isl1: Pick<Island, "r" | "c">,
  isl2: Pick<Island, "r" | "c">,
  islands: Pick<Island, "r" | "c">[],
): boolean {
  const dr = isl2.r === isl1.r ? 0 : isl2.r > isl1.r ? 1 : -1;
  const dc = isl2.c === isl1.c ? 0 : isl2.c > isl1.c ? 1 : -1;
  let r = isl1.r + dr;
  let c = isl1.c + dc;
  while (r !== isl2.r || c !== isl2.c) {
    if (islands.some((i) => i.r === r && i.c === c)) return false;
    r += dr;
    c += dc;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

/**
 * Compute the total bridge count incident to the given island id from the
 * player bridge list.
 */
export function islandDegree(id: number, playerBridges: PlayerBridge[]): number {
  let total = 0;
  for (const b of playerBridges) {
    if (b.id1 === id || b.id2 === id) total += b.count;
  }
  return total;
}

/**
 * Return true iff the player's current bridge placement is a valid win:
 *   1. Every island's degree equals its clue.
 *   2. All islands are connected (single component).
 *
 * Any bridge layout meeting both conditions wins — not only the generator's
 * stored solution. Satisfied-but-disconnected returns false.
 */
export function checkWin(
  islands: Island[],
  playerBridges: PlayerBridge[],
): boolean {
  if (islands.length === 0) return false;

  // Condition 1: all clues satisfied
  for (const isl of islands) {
    if (islandDegree(isl.id, playerBridges) !== isl.clue) return false;
  }

  // Condition 2: fully connected
  return isConnected(
    islands.map((i) => i.id),
    playerBridges,
  );
}
