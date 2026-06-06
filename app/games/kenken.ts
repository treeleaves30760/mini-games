import type { Rng } from "~/utils/rng";

export type KenKenDifficultyKey = "easy" | "normal" | "hard" | "expert";
export type KenKenOp = "=" | "+" | "-" | "×" | "÷";

export interface KenKenDifficulty {
  key: KenKenDifficultyKey;
  label: string;
  size: number;
  maxCage: number;
  minMultiCages: number;
}

export interface KenKenCage {
  id: number;
  cells: number[];
  op: KenKenOp;
  target: number;
}

export interface KenKenPuzzle {
  difficulty: KenKenDifficultyKey;
  size: number;
  solution: number[];
  cages: KenKenCage[];
  cageOf: number[];
}

export const KENKEN_DIFFICULTIES: KenKenDifficulty[] = [
  { key: "easy", label: "簡單", size: 4, maxCage: 2, minMultiCages: 4 },
  { key: "normal", label: "普通", size: 5, maxCage: 3, minMultiCages: 7 },
  { key: "hard", label: "困難", size: 6, maxCage: 4, minMultiCages: 10 },
  { key: "expert", label: "專家", size: 7, maxCage: 4, minMultiCages: 14 },
];

export function getKenKenDifficulty(key: string): KenKenDifficulty {
  return KENKEN_DIFFICULTIES.find((d) => d.key === key) ?? KENKEN_DIFFICULTIES[1];
}

export function generateLatinSolution(size: number, rng: Rng): number[] {
  const rows = Array.from({ length: size }, (_, i) => i);
  const cols = Array.from({ length: size }, (_, i) => i);
  const symbols = Array.from({ length: size }, (_, i) => i + 1);
  rng.shuffle(rows);
  rng.shuffle(cols);
  rng.shuffle(symbols);

  const grid: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      grid.push(symbols[(rows[r] + cols[c]) % size]);
    }
  }
  return grid;
}

function neighbors(idx: number, size: number): number[] {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out: number[] = [];
  if (r > 0) out.push(idx - size);
  if (r + 1 < size) out.push(idx + size);
  if (c > 0) out.push(idx - 1);
  if (c + 1 < size) out.push(idx + 1);
  return out;
}

function cageOp(values: number[], rng: Rng, difficulty: KenKenDifficulty): Pick<KenKenCage, "op" | "target"> {
  if (values.length === 1) return { op: "=", target: values[0] };
  if (values.length === 2) {
    const [a, b] = values;
    const candidates: Pick<KenKenCage, "op" | "target">[] = [
      { op: "+", target: a + b },
      { op: "×", target: a * b },
      { op: "-", target: Math.abs(a - b) },
    ];
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    if (lo !== 0 && hi % lo === 0) candidates.push({ op: "÷", target: hi / lo });
    const weighted =
      difficulty.key === "easy"
        ? candidates.filter((x) => x.op === "+" || x.op === "×")
        : difficulty.key === "normal"
          ? candidates
          : [...candidates, ...candidates.filter((x) => x.op === "-" || x.op === "÷")];
    return rng.pick(weighted.length ? weighted : candidates);
  }
  if (difficulty.key === "expert" && values.every((v) => v > 1) && rng.bool()) {
    return { op: "×", target: values.reduce((a, b) => a * b, 1) };
  }
  return { op: "+", target: values.reduce((a, b) => a + b, 0) };
}

export function buildCages(size: number, solution: number[], rng: Rng, difficulty: KenKenDifficulty): KenKenCage[] {
  const unassigned = new Set(Array.from({ length: size * size }, (_, i) => i));
  const cages: KenKenCage[] = [];
  let multiCages = 0;

  while (unassigned.size) {
    const start = rng.pick([...unassigned]);
    const remaining = unassigned.size;
    const desired =
      remaining <= 2
        ? remaining
        : Math.min(
            difficulty.maxCage,
            rng.int(1, difficulty.maxCage) + (multiCages < difficulty.minMultiCages ? 1 : 0),
            remaining,
          );
    const cells = [start];
    unassigned.delete(start);

    while (cells.length < desired) {
      const frontier = cells
        .flatMap((cell) => neighbors(cell, size))
        .filter((cell) => unassigned.has(cell));
      if (!frontier.length) break;
      const next = rng.pick(frontier);
      cells.push(next);
      unassigned.delete(next);
    }

    if (cells.length > 1) multiCages++;
    const values = cells.map((cell) => solution[cell]);
    const op = cageOp(values, rng, difficulty);
    cages.push({ id: cages.length, cells, ...op });
  }

  return cages;
}

export function generateKenKenPuzzle(rng: Rng, difficultyKey: string = "normal"): KenKenPuzzle {
  const difficulty = getKenKenDifficulty(difficultyKey);
  const solution = generateLatinSolution(difficulty.size, rng);
  const cages = buildCages(difficulty.size, solution, rng, difficulty);
  const cageOf = new Array(difficulty.size * difficulty.size).fill(-1);
  for (const cage of cages) {
    for (const cell of cage.cells) cageOf[cell] = cage.id;
  }
  return {
    difficulty: difficulty.key,
    size: difficulty.size,
    solution,
    cages,
    cageOf,
  };
}

export function cageLabel(cage: KenKenCage): string {
  return cage.op === "=" ? String(cage.target) : `${cage.target}${cage.op}`;
}

export function cageSatisfied(cage: KenKenCage, cells: (number | null)[]): boolean {
  const values = cage.cells.map((idx) => cells[idx]);
  if (values.some((value) => value === null)) return false;
  const nums = values as number[];
  if (cage.op === "=") return nums[0] === cage.target;
  if (cage.op === "+") return nums.reduce((a, b) => a + b, 0) === cage.target;
  if (cage.op === "×") return nums.reduce((a, b) => a * b, 1) === cage.target;
  if (cage.op === "-") {
    if (nums.length !== 2) return false;
    return Math.abs(nums[0] - nums[1]) === cage.target;
  }
  if (cage.op === "÷") {
    if (nums.length !== 2) return false;
    const hi = Math.max(nums[0], nums[1]);
    const lo = Math.min(nums[0], nums[1]);
    return lo !== 0 && hi / lo === cage.target && hi % lo === 0;
  }
  return false;
}

export function cellHasDuplicate(cells: (number | null)[], size: number, idx: number): boolean {
  const value = cells[idx];
  if (value === null) return false;
  const row = Math.floor(idx / size);
  const col = idx % size;
  for (let c = 0; c < size; c++) {
    const other = row * size + c;
    if (other !== idx && cells[other] === value) return true;
  }
  for (let r = 0; r < size; r++) {
    const other = r * size + col;
    if (other !== idx && cells[other] === value) return true;
  }
  return false;
}

export function isKenKenSolved(puzzle: KenKenPuzzle, cells: (number | null)[]): boolean {
  if (cells.some((value) => value === null)) return false;
  for (let i = 0; i < cells.length; i++) {
    if (cellHasDuplicate(cells, puzzle.size, i)) return false;
  }
  return puzzle.cages.every((cage) => cageSatisfied(cage, cells));
}
