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
  path: number[];
  target: Rat;
  expression: string[];
}

export const EQUATION_MAZE_DIFFICULTIES: EquationMazeDifficulty[] = [
  { key: "easy", label: "簡單", size: 5, terms: 4, maxNumber: 9, negatives: false, division: false },
  { key: "normal", label: "普通", size: 6, terms: 5, maxNumber: 12, negatives: false, division: true },
  { key: "hard", label: "困難", size: 7, terms: 6, maxNumber: 18, negatives: true, division: true },
  { key: "expert", label: "專家", size: 8, terms: 7, maxNumber: 24, negatives: true, division: true },
];

export function getEquationMazeDifficulty(key: string): EquationMazeDifficulty {
  return EQUATION_MAZE_DIFFICULTIES.find((d) => d.key === key) ?? EQUATION_MAZE_DIFFICULTIES[1];
}

function adjacent(a: number, b: number, size: number): boolean {
  const ar = Math.floor(a / size);
  const ac = a % size;
  const br = Math.floor(b / size);
  const bc = b % size;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

export function areAdjacent(a: number, b: number, size: number): boolean {
  return adjacent(a, b, size);
}

function selfAvoidingPath(size: number, length: number, rng: Rng): number[] {
  for (let attempt = 0; attempt < 400; attempt++) {
    const start = rng.int(0, size * size - 1);
    const path = [start];
    const used = new Set(path);
    while (path.length < length) {
      const options = [path[path.length - 1] - size, path[path.length - 1] + size, path[path.length - 1] - 1, path[path.length - 1] + 1]
        .filter((idx) => idx >= 0 && idx < size * size)
        .filter((idx) => adjacent(path[path.length - 1], idx, size))
        .filter((idx) => !used.has(idx));
      if (!options.length) break;
      const next = rng.pick(options);
      path.push(next);
      used.add(next);
    }
    if (path.length === length) return path;
  }
  return Array.from({ length }, (_, i) => i);
}

function applyTokenOp(acc: Rat, op: string, value: Rat): Rat | null {
  if (op === "+") return radd(acc, value);
  if (op === "-") return rsub(acc, value);
  if (op === "×") return rmul(acc, value);
  if (op === "÷") return rdiv(acc, value);
  return null;
}

export function evaluateTokens(tokens: string[]): Rat | null {
  if (tokens.length < 1 || tokens.length % 2 === 0) return null;
  let acc = rat(Number(tokens[0]));
  if (!acc) return null;
  for (let i = 1; i < tokens.length; i += 2) {
    const next = rat(Number(tokens[i + 1]));
    if (!next) return null;
    acc = applyTokenOp(acc, tokens[i], next);
    if (!acc) return null;
  }
  return acc;
}

export function formatRat(r: Rat | null): string {
  if (!r) return "—";
  return r.d === 1 ? String(r.n) : `${r.n}/${r.d}`;
}

function randomNumber(rng: Rng, difficulty: EquationMazeDifficulty): number {
  const value = rng.int(1, difficulty.maxNumber);
  return difficulty.negatives && rng.int(0, 4) === 0 ? -value : value;
}

function makeExpression(rng: Rng, difficulty: EquationMazeDifficulty): string[] {
  const ops = difficulty.division ? ["+", "-", "×", "÷"] : ["+", "-", "×"];
  for (let attempt = 0; attempt < 200; attempt++) {
    const tokens = [String(randomNumber(rng, difficulty))];
    let current = rat(Number(tokens[0])) as Rat;
    for (let i = 1; i < difficulty.terms; i++) {
      const possible = rng.shuffle([...ops]).slice();
      let placed = false;
      for (const op of possible) {
        const number = randomNumber(rng, difficulty);
        if (op === "÷" && number === 0) continue;
        const next = applyTokenOp(current, op, rat(number) as Rat);
        if (!next) continue;
        if (Math.abs(next.n / next.d) > 200) continue;
        tokens.push(op, String(number));
        current = next;
        placed = true;
        break;
      }
      if (!placed) break;
    }
    if (tokens.length === difficulty.terms * 2 - 1) return tokens;
  }
  const fallback = ["4"];
  for (let i = 1; i < difficulty.terms; i++) fallback.push("+", String(i + 1));
  return fallback;
}

export function generateEquationMazePuzzle(rng: Rng, difficultyKey = "normal"): EquationMazePuzzle {
  const difficulty = getEquationMazeDifficulty(difficultyKey);
  const tokenCount = difficulty.terms * 2 - 1;
  const path = selfAvoidingPath(difficulty.size, tokenCount, rng);
  const expression = makeExpression(rng, difficulty);
  const target = evaluateTokens(expression) ?? rat(24)!;
  const pathSet = new Set(path);
  const cells: MazeCell[] = Array.from({ length: difficulty.size * difficulty.size }, (_, idx) => {
    const pathIndex = path.indexOf(idx);
    if (pathIndex >= 0) {
      return {
        token: expression[pathIndex],
        kind: pathIndex % 2 === 0 ? "number" : "op",
        onSolution: true,
      };
    }
    const kind: MazeTokenKind = rng.bool() ? "number" : "op";
    return {
      token: kind === "number" ? String(randomNumber(rng, difficulty)) : rng.pick(difficulty.division ? ["+", "-", "×", "÷"] : ["+", "-", "×"]),
      kind,
      onSolution: pathSet.has(idx),
    };
  });
  return { difficulty: difficulty.key, size: difficulty.size, cells, path, target, expression };
}

export function selectedTokens(puzzle: EquationMazePuzzle, selected: number[]): string[] {
  return selected.map((idx) => puzzle.cells[idx]?.token ?? "");
}

export function isValidMazeSelection(puzzle: EquationMazePuzzle, selected: number[]): boolean {
  if (!selected.length) return false;
  for (let i = 0; i < selected.length; i++) {
    const cell = puzzle.cells[selected[i]];
    if (!cell) return false;
    if (cell.kind !== (i % 2 === 0 ? "number" : "op")) return false;
    if (i > 0 && !adjacent(selected[i - 1], selected[i], puzzle.size)) return false;
  }
  return true;
}

export function isEquationMazeSolved(puzzle: EquationMazePuzzle, selected: number[]): boolean {
  if (selected.length < puzzle.expression.length) return false;
  if (!isValidMazeSelection(puzzle, selected)) return false;
  return req(evaluateTokens(selectedTokens(puzzle, selected)), puzzle.target);
}
