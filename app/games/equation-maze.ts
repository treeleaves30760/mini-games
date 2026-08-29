import type { Rng } from "~/utils/rng";
import { radd, rdiv, rmul, rsub, rat, req, type Rat } from "~/games/twenty-four";

export type EquationMazeDifficultyKey = "easy" | "normal" | "hard" | "expert";
export type MazeTokenKind = "number" | "op";

export interface EquationMazeDifficulty {
  key: EquationMazeDifficultyKey;
  label: string;
  size: number;
  terms: number;
  maxNumber: number;
  negatives: boolean;
  division: boolean;
}

export interface MazeCell {
  token: string;
  kind: MazeTokenKind;
  onSolution: boolean;
}

export interface EquationMazePuzzle {
  difficulty: EquationMazeDifficultyKey;
  size: number;
  cells: MazeCell[];
  /** The generator's own solution walk (cell indices). Any other legal walk that hits the target also wins. */
  path: number[];
  target: Rat;
  /** Tokens along `path`, i.e. the intended solution read left to right. */
  expression: string[];
}

/*
 * Generator invariants the difficulty table must keep (checked by the tests):
 * - terms * 2 - 1 <= 2 * size - 1, so a self-avoiding walk of the solution
 *   length exists from every start cell (see selfAvoidingPath);
 * - maxNumber <= VALUE_CAP and (division || !negatives), so every term of the
 *   expression has at least one operator that fits (see makeExpression).
 */
export const EQUATION_MAZE_DIFFICULTIES: EquationMazeDifficulty[] = [
  { key: "easy", label: "簡單", size: 5, terms: 4, maxNumber: 9, negatives: false, division: false },
  { key: "normal", label: "普通", size: 6, terms: 5, maxNumber: 12, negatives: false, division: true },
  { key: "hard", label: "困難", size: 7, terms: 6, maxNumber: 18, negatives: true, division: true },
  { key: "expert", label: "專家", size: 8, terms: 7, maxNumber: 24, negatives: true, division: true },
];

/** Largest magnitude the running value may reach while the solution expression is built. */
const VALUE_CAP = 200;

export function getEquationMazeDifficulty(key: string): EquationMazeDifficulty {
  return EQUATION_MAZE_DIFFICULTIES.find((d) => d.key === key) ?? EQUATION_MAZE_DIFFICULTIES[1];
}

function operatorsFor(difficulty: EquationMazeDifficulty): string[] {
  return difficulty.division ? ["+", "-", "×", "÷"] : ["+", "-", "×"];
}

export function areAdjacent(a: number, b: number, size: number): boolean {
  const ar = Math.floor(a / size);
  const ac = a % size;
  const br = Math.floor(b / size);
  const bc = b % size;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

/** Orthogonal neighbours of a cell, in the fixed order up, down, left, right. */
function neighbours(idx: number, size: number): number[] {
  return [idx - size, idx + size, idx - 1, idx + 1].filter((n) => n >= 0 && n < size * size && areAdjacent(idx, n, size));
}

/**
 * Random self-avoiding walk of `length` cells: a randomised depth-first search
 * that backs out of dead ends instead of restarting. From any start cell a
 * simple path of 2·size − 1 cells exists (walk to the farther side wall, along
 * it to the farther corner, then across that edge), and every difficulty asks
 * for at most that many cells, so the search always ends with a full walk.
 */
function selfAvoidingPath(size: number, length: number, rng: Rng): number[] {
  const path = [rng.int(0, size * size - 1)];
  const used = new Set(path);
  // Neighbours not yet tried from each cell of the walk, indexed by depth.
  const pending = [neighbours(path[0], size)];
  while (path.length < length) {
    const options = pending[pending.length - 1].filter((idx) => !used.has(idx));
    if (!options.length) {
      // Dead end: drop the last cell and resume from the one before it.
      used.delete(path.pop() as number);
      pending.pop();
      continue;
    }
    const next = rng.pick(options);
    pending[pending.length - 1] = options.filter((idx) => idx !== next);
    path.push(next);
    used.add(next);
    pending.push(neighbours(next, size));
  }
  return path;
}

function applyTokenOp(acc: Rat, op: string, value: Rat): Rat | null {
  if (op === "+") return radd(acc, value);
  if (op === "-") return rsub(acc, value);
  if (op === "×") return rmul(acc, value);
  if (op === "÷") return rdiv(acc, value);
  return null;
}

/** Parse an integer token such as "12" or "-7"; operators and blanks are null. */
function tokenValue(token: string): Rat | null {
  return /^-?\d+$/.test(token) ? rat(Number(token)) : null;
}

/**
 * Evaluate a token walk strictly left to right (no operator precedence). Null
 * when the walk is empty, ends on an operator, or contains a token that is not
 * a number or a known operator, and on division by zero.
 */
export function evaluateTokens(tokens: string[]): Rat | null {
  if (tokens.length % 2 === 0) return null;
  let acc = tokenValue(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const next = tokenValue(tokens[i + 1]);
    if (!acc || !next) return null;
    acc = applyTokenOp(acc, tokens[i], next);
  }
  return acc;
}

export function formatRat(r: Rat | null): string {
  if (!r) return "—";
  return r.d === 1 ? String(r.n) : `${r.n}/${r.d}`;
}

/** Operand in 1..maxNumber, negated one time in five when allowed. Never 0, so "÷" is always defined. */
function randomNumber(rng: Rng, difficulty: EquationMazeDifficulty): number {
  const value = rng.int(1, difficulty.maxNumber);
  return difficulty.negatives && rng.int(0, 4) === 0 ? -value : value;
}

/**
 * Build the solution expression term by term, evaluated left to right exactly
 * like the maze. Each term tries the operators in random order, each with a
 * fresh operand, and keeps the first one that leaves the running value within
 * ±VALUE_CAP. One always fits: without negatives either "+" or "-" moves the
 * value back toward zero, and "÷" by a non-zero integer never grows it.
 */
function makeExpression(rng: Rng, difficulty: EquationMazeDifficulty): { tokens: string[]; value: Rat } {
  const ops = operatorsFor(difficulty);
  const first = randomNumber(rng, difficulty);
  const tokens = [String(first)];
  let value = rat(first) as Rat;
  for (let i = 1; i < difficulty.terms; i++) {
    for (const op of rng.shuffle([...ops])) {
      const number = randomNumber(rng, difficulty);
      const next = applyTokenOp(value, op, rat(number) as Rat) as Rat;
      if (Math.abs(next.n / next.d) > VALUE_CAP) continue;
      tokens.push(op, String(number));
      value = next;
      break;
    }
  }
  return { tokens, value };
}

export function generateEquationMazePuzzle(rng: Rng, difficultyKey = "normal"): EquationMazePuzzle {
  const difficulty = getEquationMazeDifficulty(difficultyKey);
  const path = selfAvoidingPath(difficulty.size, difficulty.terms * 2 - 1, rng);
  const { tokens: expression, value: target } = makeExpression(rng, difficulty);
  const ops = operatorsFor(difficulty);
  const pathIndex = new Map(path.map((idx, i) => [idx, i] as const));
  const cells = Array.from({ length: difficulty.size * difficulty.size }, (_, idx): MazeCell => {
    const i = pathIndex.get(idx);
    if (i !== undefined) {
      const kind: MazeTokenKind = i % 2 === 0 ? "number" : "op";
      return { token: expression[i], kind, onSolution: true };
    }
    const kind: MazeTokenKind = rng.bool() ? "number" : "op";
    return {
      token: kind === "number" ? String(randomNumber(rng, difficulty)) : rng.pick(ops),
      kind,
      onSolution: false,
    };
  });
  return { difficulty: difficulty.key, size: difficulty.size, cells, path, target, expression };
}

export function selectedTokens(puzzle: EquationMazePuzzle, selected: number[]): string[] {
  return selected.map((idx) => puzzle.cells[idx]?.token ?? "");
}

/**
 * A selection is a legal walk when it starts on a number, alternates
 * number/operator, only steps between orthogonal neighbours and never revisits
 * a cell. Ending on an operator is allowed so a walk can be validated while it
 * is still being drawn.
 */
export function isValidMazeSelection(puzzle: EquationMazePuzzle, selected: number[]): boolean {
  if (!selected.length) return false;
  const seen = new Set<number>();
  for (let i = 0; i < selected.length; i++) {
    const idx = selected[i];
    const cell = puzzle.cells[idx];
    if (!cell || seen.has(idx)) return false;
    if (cell.kind !== (i % 2 === 0 ? "number" : "op")) return false;
    if (i > 0 && !areAdjacent(selected[i - 1], idx, puzzle.size)) return false;
    seen.add(idx);
  }
  return true;
}

/**
 * Any legal walk at least as long as the intended solution whose value equals
 * the target wins — the generator's own path is just one of them.
 */
export function isEquationMazeSolved(puzzle: EquationMazePuzzle, selected: number[]): boolean {
  if (selected.length < puzzle.expression.length) return false;
  if (!isValidMazeSelection(puzzle, selected)) return false;
  return req(evaluateTokens(selectedTokens(puzzle, selected)), puzzle.target);
}
