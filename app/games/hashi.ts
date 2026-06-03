/* Hashi (Hashiwokakero / Bridges) — framework-free pure game logic.
   Island/bridge generation, legality checks, crossing detection, and win
   detection are all deterministic given a seed, so they can be unit-tested
   independently of the Vue component's animation / localStorage / timer.

   Puzzle invariants guaranteed by the generator:
   - Every island's clue equals the total bridges incident to it in the solution.
   - Bridges run only horizontally or vertically between two islands.
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
  /** The unique valid solution — use for verification. */
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
 * (or seed).  Makes up to 40 attempts and returns the first valid result.
 * The returned puzzle is guaranteed to have a connected solution.
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

  for (let attempt = 0; attempt < 40; attempt++) {
    const result = tryGenerate(rng, gc, gr, target);
    if (result && result.islands.length >= Math.ceil(target * 0.6)) {
      return result;
    }
  }
  // fallback: one more attempt, return empty puzzle on failure
  return (
    tryGenerate(rng, gc, gr, target) ?? {
      islands: [],
      solution: [],
      gc,
      gr,
    }
  );
}

/** Internal: one generation attempt.  Returns null if the result is invalid. */
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

  function allNeighborsEmpty(r: number, c: number): boolean {
    for (const [dr, dc] of DIRS4) {
      const nr = r + dr;
      const nc = c + dc;
      /* c8 ignore start */
      if (nr >= 0 && nr < gr && nc >= 0 && nc < gc) {
        if (islandGrid[nr][nc] !== -1) return false;
      }
      /* c8 ignore stop */
    }
    return islandGrid[r][c] === -1;
  }

  function canPlaceBridge(
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    orientation: string,
  ): boolean {
    const dr = r2 > r1 ? 1 : r2 < r1 ? -1 : 0;
    const dc = c2 > c1 ? 1 : c2 < c1 ? -1 : 0;
    let r = r1 + dr;
    let c = c1 + dc;
    while (r !== r2 || c !== c2) {
      if (islandGrid[r][c] !== -1) return false;
      if (occupied[r][c] !== null && occupied[r][c] !== orientation)
        return false;
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
      if (!allNeighborsEmpty(nr, nc)) continue;
      if (!canPlaceBridge(src.r, src.c, nr, nc, orientation)) continue;
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

  // Verify all islands are connected via solution edges (BFS).
  /* c8 ignore start */
  if (!isConnected(islandList.map((n) => n.id), solutionEdges)) return null;
  /* c8 ignore stop */

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
 * Satisfied-but-disconnected returns false.
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
