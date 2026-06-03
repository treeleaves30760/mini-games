/* Tower of Hanoi — framework-free game logic.
   Shared by the Vue component and unit tests.
   Keeps peg/disk state, move legality, move application, win detection,
   and the optimal recursive solver separate from Vue reactivity. */

/** Three pegs: each is an array of disk sizes, largest disk at index 0, top disk last. */
export type Pegs = number[][];

/**
 * Build the initial peg state for n disks.
 * All disks start on peg 0 in order: largest (n) at index 0, smallest (1) on top.
 */
export function initPegs(n: number): Pegs {
  const source: number[] = [];
  for (let i = n; i >= 1; i--) source.push(i);
  return [source, [], []];
}

/**
 * Return true if moving the top disk of peg `from` to peg `to` is legal.
 * Illegal cases:
 *   - source peg is empty
 *   - destination peg's top disk is smaller than the disk being moved
 */
export function isLegalMove(pegs: Pegs, from: number, to: number): boolean {
  const fromPeg = pegs[from];
  if (fromPeg.length === 0) return false;
  const toPeg = pegs[to];
  if (toPeg.length === 0) return true;
  const movingDisk = fromPeg[fromPeg.length - 1];
  const topOfTarget = toPeg[toPeg.length - 1];
  return movingDisk < topOfTarget;
}

/**
 * Apply a move (from → to) to a deep copy of the peg state and return the new state.
 * Caller must ensure the move is legal first (use isLegalMove).
 * The original pegs array is NOT mutated.
 */
export function applyMove(pegs: Pegs, from: number, to: number): Pegs {
  const next: Pegs = pegs.map((p) => [...p]);
  const disk = next[from].pop()!;
  next[to].push(disk);
  return next;
}

/**
 * Return true when all disks are stacked (in order) on the goal peg (index 2).
 * numDisks is required because an empty peg[2] before any disks are moved
 * would otherwise pass (length 0 === 0).
 */
export function isWin(pegs: Pegs, numDisks: number): boolean {
  return pegs[2].length === numDisks;
}

/** A single step in the solver output: move from peg `from` to peg `to`. */
export interface HanoiMove {
  from: number;
  to: number;
}

/**
 * Generate the classic recursive optimal solution for n disks.
 * Moves n disks from peg `source` to peg `target` using `aux` as auxiliary.
 * The returned sequence has exactly 2^n − 1 moves.
 */
export function solveHanoi(
  n: number,
  source: number = 0,
  target: number = 2,
  aux: number = 1
): HanoiMove[] {
  if (n === 0) return [];
  return [
    ...solveHanoi(n - 1, source, aux, target),
    { from: source, to: target },
    ...solveHanoi(n - 1, aux, target, source),
  ];
}
