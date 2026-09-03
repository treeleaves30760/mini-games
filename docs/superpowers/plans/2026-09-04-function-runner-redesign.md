# Function Runner Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coefficient-tweaking Function Runner with a write-your-own-function shooter: limited shots, piercing targets, destructible obstacles, four difficulties with guaranteed-solvable puzzles, and a hot-seat PVP mode.

**Architecture:** A framework-free expression parser (`app/utils/expression.ts`) compiles typed `f(x)` into a closure. The game module (`app/games/function-runner.ts`) owns geometry (0.5-unit obstacle cells), the pure shot simulation, the solo puzzle generator (targets placed on hidden solution curves, obstacles kept off them), the solo state machine and the PVP match state. The Vue component renders everything as one SVG and animates each shot before committing the new state.

**Tech Stack:** Vue 3 `<script setup>` + Nuxt 4, plain CSS with the shared tokens, Vitest for `app/games` and `app/utils`.

**Spec:** `docs/superpowers/specs/2026-09-04-function-runner-redesign-design.md`

## Global Constraints

- All player-facing copy is Traditional Chinese; error messages are exactly the strings listed in the spec's 函式語法 section (tests assert them).
- No `eval` and no `new Function`: the parser is a closed grammar.
- Logic modules stay framework-free (they run under plain Node in Vitest); only the component touches Vue.
- Follow the game shell from the README: `.game-page` → `GameTopbar` → `.stage` → `.stage__main` (`.hud`/`.chip`, `.board-wrap` + `.overlay`) and `aside.panel` with `.panel__group` blocks. The panel holds controls, rules and a syntax reference only.
- Board constants are the spec's: solo board x ∈ [0, 20], y ∈ [−8, 8]; PVP board x ∈ [−10, 10]; cell 0.5; target radius 0.4; crater radius 1.1; shot step 0.02.
- Daily seed string stays `${seed}:function-runner:${difficulty}` with difficulty forced to `hard`; `app/pages/daily.vue`, `useDaily.ts` and `app/pages/games/function-runner.vue` are not touched.
- Run tests with `pnpm test` (or `pnpm vitest run <file>` for one file). Commit after every task with the trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016qgdPnB23w4ELPrgxgnUKg
  ```

---

## File map

| File | Responsibility |
| --- | --- |
| `app/utils/expression.ts` (new) | tokenizer, recursive-descent parser, `compileExpression()` |
| `tests/utils/expression.test.ts` (new) | parser behaviour and error messages |
| `app/games/function-runner.ts` (rewrite) | boards and cells, `simulateShot`, solo state (`createSoloGame`/`fireSolo`/`soloStatus`), difficulties + `generateFunctionRunnerPuzzle`, PVP (`generatePvpMatch`/`firePvp`) |
| `tests/games/function-runner.test.ts` (rewrite) | geometry, simulation, solo state, generator well-formedness + solvability, PVP |
| `app/components/games/FunctionRunnerGame.vue` (rewrite) | SVG board, input row, animation, overlays, mode/difficulty panel |
| `app/composables/useGames.ts` | `desc` for `function-runner` |
| `README.md` | one paragraph on the game, utils line in the tree |

Tasks 2–5 build `app/games/function-runner.ts` incrementally (each task appends to the file). Between Task 2 and Task 6 the old component imports names that no longer exist, so the page is broken in the dev server until Task 6 lands; the test suite stays green throughout.

---

### Task 1: Expression parser

**Files:**
- Create: `app/utils/expression.ts`
- Test: `tests/utils/expression.test.ts`

**Interfaces:**
- Produces: `compileExpression(source: string): CompiledExpression` where `CompiledExpression = { ok: true; f: (x: number) => number } | { ok: false; error: string; position: number }`. `position` is the 0-based index into `source` where the problem starts.

- [ ] **Step 1: Write the failing tests**

`tests/utils/expression.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compileExpression } from "~/utils/expression";

function f(source: string): (x: number) => number {
  const compiled = compileExpression(source);
  if (!compiled.ok) throw new Error(`${source}: ${compiled.error}`);
  return compiled.f;
}

function fails(source: string): string {
  const compiled = compileExpression(source);
  expect(compiled.ok).toBe(false);
  return compiled.ok ? "" : compiled.error;
}

describe("expression parser", () => {
  it("evaluates numbers, x and arithmetic with the usual precedence", () => {
    expect(f("2+3*4")(0)).toBe(14);
    expect(f("(2+3)*4")(0)).toBe(20);
    expect(f("10-4-3")(0)).toBe(3);
    expect(f("12/4/3")(0)).toBe(1);
    expect(f("2*x+1")(3)).toBe(7);
    expect(f("x")(2.5)).toBe(2.5);
    expect(f(" 1.5 + .5 ")(0)).toBe(2);
    expect(f("+x")(4)).toBe(4);
  });

  it("makes ^ right-associative and tighter than unary minus", () => {
    expect(f("2^3^2")(0)).toBe(512);
    expect(f("-x^2")(3)).toBe(-9);
    expect(f("(-x)^2")(3)).toBe(9);
    expect(f("2^-1")(0)).toBe(0.5);
    expect(f("-2^2")(0)).toBe(-4);
    expect(f("2*3^2")(0)).toBe(18);
  });

  it("supports implicit multiplication at the precedence of *", () => {
    expect(f("2x")(4)).toBe(8);
    expect(f("3(x+1)")(1)).toBe(6);
    expect(f("(x+1)(x-1)")(3)).toBe(8);
    expect(f("2sin(x)")(Math.PI / 2)).toBeCloseTo(2);
    expect(f("pi x")(2)).toBeCloseTo(2 * Math.PI);
    expect(f("2x^2")(3)).toBe(18);
    expect(f("x x")(3)).toBe(9);
    expect(f("1/2x")(4)).toBe(2);
    expect(f("2 - x")(5)).toBe(-3);
    expect(f("2(3)")(0)).toBe(6);
  });

  it("knows the function table and constants, case-insensitively", () => {
    expect(f("sin(pi/2)")(0)).toBeCloseTo(1);
    expect(f("cos(0)")(0)).toBe(1);
    expect(f("tan(pi/4)")(0)).toBeCloseTo(1);
    expect(f("abs(x-5)")(2)).toBe(3);
    expect(f("sqrt(x)")(16)).toBe(4);
    expect(f("exp(0)")(0)).toBe(1);
    expect(f("e^x")(1)).toBeCloseTo(Math.E);
    expect(f("ln(e)")(0)).toBeCloseTo(1);
    expect(f("log(e^2)")(0)).toBeCloseTo(2);
    expect(f("floor(x)")(2.7)).toBe(2);
    expect(f("SIN(X)")(Math.PI / 2)).toBeCloseTo(1);
  });

  it("accepts typographic minus, times, divide, full-width parens, π and superscripts", () => {
    expect(f("x − 1")(3)).toBe(2);
    expect(f("2 × 3 ÷ 4")(0)).toBe(1.5);
    expect(f("π")(0)).toBeCloseTo(Math.PI);
    expect(f("x²")(3)).toBe(9);
    expect(f("x³")(2)).toBe(8);
    expect(f("（x+1）")(1)).toBe(2);
  });

  it("lets NaN and infinities flow through like JavaScript does", () => {
    expect(f("sqrt(-1)")(0)).toBeNaN();
    expect(f("ln(0)")(0)).toBe(-Infinity);
    expect(f("1/x")(0)).toBe(Infinity);
    expect(f("ln(x)")(0)).toBe(-Infinity);
    expect(f("tan(x)")(Math.PI / 2)).toBeGreaterThan(1e10);
  });

  it("reports readable errors with a position", () => {
    expect(fails("")).toBe("請輸入函式");
    expect(fails("   ")).toBe("請輸入函式");
    expect(fails("2+")).toBe("這裡少了數字或 x");
    expect(fails("*3")).toBe("這裡少了數字或 x");
    expect(fails("sin()")).toBe("這裡少了數字或 x");
    expect(fails("x 2 +")).toBe("這裡少了數字或 x");
    expect(fails("(x+1")).toBe("括號沒有配對");
    expect(fails("x+1)")).toBe("括號沒有配對");
    expect(fails("sin x")).toBe("sin 後面要加括號，例如 sin(x)");
    expect(fails("sinx")).toBe("sin 後面要加括號，例如 sin(x)");
    expect(fails("abs")).toBe("abs 後面要加括號，例如 abs(x)");
    expect(fails("y+1")).toBe("不認識的名稱 y");
    expect(fails("2$3")).toBe("不認識的符號「$」");
    expect(fails("1.2.3")).toBe("數字格式不對");

    const unclosed = compileExpression("x + (2");
    expect(unclosed).toEqual({ ok: false, error: "括號沒有配對", position: 6 });
    const unknown = compileExpression("2 + foo");
    expect(unknown).toEqual({ ok: false, error: "不認識的名稱 foo", position: 4 });
    const symbol = compileExpression("2$3");
    expect(symbol).toEqual({ ok: false, error: "不認識的符號「$」", position: 1 });
  });

  it("never throws on odd input", () => {
    for (const source of ["((((", "))))", "^", "x^", "2^^3", "sin(", "abs", "e e e", "1e5", "x.5", ".", "x..", "--x", "2 3"]) {
      expect(() => compileExpression(source)).not.toThrow();
    }
    expect(f("--x")(2)).toBe(2);
    expect(f("e e e")(0)).toBeCloseTo(Math.E ** 3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/utils/expression.test.ts`
Expected: FAIL — cannot resolve `~/utils/expression`.

- [ ] **Step 3: Write the parser**

`app/utils/expression.ts`:

```ts
/* =========================================================================
   Expression parser — the f(x) a player types in Function Runner.

   A small recursive-descent parser that compiles "2x^2 - 3sin(pi x/4)" into
   a plain (x: number) => number closure. No eval, no Function constructor:
   the grammar is closed, so a typo yields a Chinese error message and a
   position instead of an exception.

     expr    := term (("+" | "-") term)*
     term    := unary (("*" | "/") unary | implicit power)*
     unary   := ("-" | "+") unary | power
     power   := primary ("^" unary)?        right-associative, tighter than unary minus
     primary := number | "x" | constant | name "(" expr ")" | "(" expr ")"

   Implicit multiplication: a value (number, x, constant, ")") directly followed
   by a number, name or "(" is a product, so 2x, 3(x+1), (x+1)(x-1), 2sin(x)
   and "pi x" all parse. It has the precedence of "*", left to right, so
   1/2x is (1/2)·x.
   ========================================================================= */

export type Evaluator = (x: number) => number;

export type CompiledExpression = { ok: true; f: Evaluator } | { ok: false; error: string; position: number };

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  floor: Math.floor,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token =
  | { kind: "number"; value: number; pos: number }
  | { kind: "name"; value: string; pos: number }
  | { kind: "symbol"; value: string; pos: number }
  | { kind: "end"; pos: number };

class ExpressionError extends Error {
  position: number;
  constructor(message: string, position: number) {
    super(message);
    this.position = position;
  }
}

/** Typographic look-alikes players paste from elsewhere. One character each, so positions stay valid. */
const ALIASES: Record<string, string> = { "−": "-", "×": "*", "÷": "/", "（": "(", "）": ")" };

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const raw = source[i];
    const ch = ALIASES[raw] ?? raw;
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      const start = i;
      while (i < source.length && (isDigit(source[i]) || source[i] === ".")) i++;
      const text = source.slice(start, i);
      if (text.indexOf(".") !== text.lastIndexOf(".")) throw new ExpressionError("數字格式不對", start);
      tokens.push({ kind: "number", value: Number(text), pos: start });
      continue;
    }
    if (isLetter(ch)) {
      const start = i;
      while (i < source.length && isLetter(source[i])) i++;
      tokens.push({ kind: "name", value: source.slice(start, i).toLowerCase(), pos: start });
      continue;
    }
    if (ch === "π") {
      tokens.push({ kind: "name", value: "pi", pos: i });
      i++;
      continue;
    }
    if (ch === "²" || ch === "³") {
      tokens.push({ kind: "symbol", value: "^", pos: i });
      tokens.push({ kind: "number", value: ch === "²" ? 2 : 3, pos: i });
      i++;
      continue;
    }
    if ("+-*/^()".includes(ch)) {
      tokens.push({ kind: "symbol", value: ch, pos: i });
      i++;
      continue;
    }
    throw new ExpressionError(`不認識的符號「${raw}」`, i);
  }
  tokens.push({ kind: "end", pos: source.length });
  return tokens;
}

class Parser {
  private i = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Evaluator {
    const f = this.expr();
    // Anything a value could be followed by has been consumed (operators, or an
    // implicit product), so the only token that can remain is a stray ")".
    if (this.peek().kind !== "end") throw new ExpressionError("括號沒有配對", this.peek().pos);
    return f;
  }

  private peek(): Token {
    return this.tokens[this.i];
  }

  private next(): Token {
    return this.tokens[this.i++];
  }

  private isSymbol(value: string): boolean {
    const t = this.peek();
    return t.kind === "symbol" && t.value === value;
  }

  private startsPrimary(): boolean {
    const t = this.peek();
    return t.kind === "number" || t.kind === "name" || (t.kind === "symbol" && t.value === "(");
  }

  private expr(): Evaluator {
    let left = this.term();
    while (this.isSymbol("+") || this.isSymbol("-")) {
      const op = this.next().value;
      const l = left;
      const r = this.term();
      left = op === "+" ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }

  private term(): Evaluator {
    let left = this.unary();
    for (;;) {
      if (this.isSymbol("*") || this.isSymbol("/")) {
        const op = this.next().value;
        const l = left;
        const r = this.unary();
        left = op === "*" ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      } else if (this.startsPrimary()) {
        const l = left;
        const r = this.power();
        left = (x) => l(x) * r(x);
      } else {
        return left;
      }
    }
  }

  private unary(): Evaluator {
    if (this.isSymbol("-")) {
      this.next();
      const inner = this.unary();
      return (x) => -inner(x);
    }
    if (this.isSymbol("+")) {
      this.next();
      return this.unary();
    }
    return this.power();
  }

  private power(): Evaluator {
    const base = this.primary();
    if (!this.isSymbol("^")) return base;
    this.next();
    const exponent = this.unary();
    return (x) => Math.pow(base(x), exponent(x));
  }

  private primary(): Evaluator {
    const t = this.next();
    if (t.kind === "number") {
      const v = t.value;
      return () => v;
    }
    if (t.kind === "name") {
      if (t.value === "x") return (x) => x;
      if (t.value in CONSTANTS) {
        const v = CONSTANTS[t.value];
        return () => v;
      }
      const fn = FUNCTIONS[t.value];
      if (!fn) {
        const prefix = Object.keys(FUNCTIONS).find((name) => t.value.startsWith(name));
        if (prefix) throw new ExpressionError(`${prefix} 後面要加括號，例如 ${prefix}(x)`, t.pos);
        throw new ExpressionError(`不認識的名稱 ${t.value}`, t.pos);
      }
      if (!this.isSymbol("(")) throw new ExpressionError(`${t.value} 後面要加括號，例如 ${t.value}(x)`, this.peek().pos);
      this.next();
      const inner = this.expr();
      this.closeParen();
      return (x) => fn(inner(x));
    }
    if (t.kind === "symbol" && t.value === "(") {
      const inner = this.expr();
      this.closeParen();
      return inner;
    }
    throw new ExpressionError("這裡少了數字或 x", t.pos);
  }

  private closeParen(): void {
    if (!this.isSymbol(")")) throw new ExpressionError("括號沒有配對", this.peek().pos);
    this.next();
  }
}

/** Compile a typed expression into a closure, or explain (in Chinese) where it went wrong. */
export function compileExpression(source: string): CompiledExpression {
  if (source.trim() === "") return { ok: false, error: "請輸入函式", position: 0 };
  try {
    return { ok: true, f: new Parser(tokenize(source)).parse() };
  } catch (err) {
    const failure = err as ExpressionError;
    return { ok: false, error: failure.message, position: failure.position };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/utils/expression.test.ts`
Expected: PASS (8 tests). If `fails("abs")` reports a different position or message, check that a function name at the end of input falls into the `!this.isSymbol("(")` branch, which uses the function's own name.

- [ ] **Step 5: Commit**

```bash
git add app/utils/expression.ts tests/utils/expression.test.ts
git commit -m "feat: expression parser for typed f(x)"
```

---

### Task 2: Board geometry and shot simulation

**Files:**
- Rewrite: `app/games/function-runner.ts` (replace the whole file)
- Rewrite: `tests/games/function-runner.test.ts` (replace the whole file)

**Interfaces:**
- Consumes: nothing from Task 1 yet (the simulation takes a plain `(x: number) => number`).
- Produces (all exported from `~/games/function-runner`):
  - `interface Point { x: number; y: number }`, `interface Board { minX; maxX; minY; maxY; cell }`, `interface Shooter extends Point { dir: 1 | -1 }`, `interface Target extends Point { id: string }`, `type ObstacleShape = { kind: "circle"; cx; cy; r } | { kind: "rect"; cx; cy; w; h }`.
  - constants `CELL = 0.5`, `SOLO_BOARD`, `PVP_BOARD`, `SOLO_SHOOTER = { x: 0, y: 0, dir: 1 }`, `TARGET_RADIUS = 0.4`, `CRATER_RADIUS = 1.1`, `SHOT_STEP = 0.02`.
  - `boardCols(board)`, `boardRows(board)`, `cellIndexAt(board, x, y): number` (−1 outside), `cellCenter(board, index): Point`, `rasterize(board, shape): number[]` (ascending indices), `distancePointToSegment(p, a, b): number`, `craterCells(board, obstacles, impact): number[]`.
  - `type ShotEnd = "edge" | "top" | "bottom" | "obstacle" | "undefined"`, `interface ShotResult { path: Point[]; hits: string[]; impact: Point | null; cleared: number[]; end: ShotEnd }`.
  - `simulateShot(board, obstacles: ReadonlySet<number>, targets: readonly Target[], shooter: Shooter, f: (x: number) => number): ShotResult`.

- [ ] **Step 1: Replace the test file with the geometry and simulation tests**

`tests/games/function-runner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CRATER_RADIUS,
  PVP_BOARD,
  SOLO_BOARD,
  SOLO_SHOOTER,
  TARGET_RADIUS,
  boardCols,
  boardRows,
  cellCenter,
  cellIndexAt,
  craterCells,
  distancePointToSegment,
  rasterize,
  simulateShot,
} from "~/games/function-runner";
import type { Board, Target } from "~/games/function-runner";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/games/function-runner.test.ts`
Expected: FAIL — the old module has none of these exports.

- [ ] **Step 3: Replace the module with geometry and simulation**

`app/games/function-runner.ts` (whole file):

```ts
/* =========================================================================
   Function Runner (座標射擊) — pure game logic.

   The player types f(x). The shot is the curve y = y0 + f(t) − f(0) traced
   from the shooter (x0, y0) in direction `dir` (t ≥ 0): it destroys every
   target it passes within TARGET_RADIUS of, keeps going, and stops at the
   first obstacle cell it enters, blasting a crater of CRATER_RADIUS around
   the impact point. Solo puzzles are generated from hidden solution curves
   so every round is solvable within its shot budget; the hot-seat PVP mode
   reuses the same simulation with two sides of units.

   Obstacles live on a grid of CELL-sized squares indexed row * cols + col.
   ========================================================================= */

export interface Point {
  x: number;
  y: number;
}

export interface Board {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cell: number;
}

export interface Shooter extends Point {
  dir: 1 | -1;
}

export interface Target extends Point {
  id: string;
}

export type ObstacleShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; cx: number; cy: number; w: number; h: number };

export const CELL = 0.5;
export const SOLO_BOARD: Board = { minX: 0, maxX: 20, minY: -8, maxY: 8, cell: CELL };
export const PVP_BOARD: Board = { minX: -10, maxX: 10, minY: -8, maxY: 8, cell: CELL };
export const SOLO_SHOOTER: Shooter = { x: 0, y: 0, dir: 1 };
export const TARGET_RADIUS = 0.4;
export const CRATER_RADIUS = 1.1;
export const SHOT_STEP = 0.02;
/** Sub-sampling distance for obstacle checks along one path segment: a quarter cell. */
const COLLISION_STEP = CELL / 4;

/* ---------------------------------------------------------------------------
   Cells
   --------------------------------------------------------------------------- */

export function boardCols(board: Board): number {
  return Math.round((board.maxX - board.minX) / board.cell);
}

export function boardRows(board: Board): number {
  return Math.round((board.maxY - board.minY) / board.cell);
}

/** Index of the cell containing (x, y), or -1 outside the board. */
export function cellIndexAt(board: Board, x: number, y: number): number {
  const col = Math.floor((x - board.minX) / board.cell);
  const row = Math.floor((y - board.minY) / board.cell);
  if (col < 0 || row < 0 || col >= boardCols(board) || row >= boardRows(board)) return -1;
  return row * boardCols(board) + col;
}

export function cellCenter(board: Board, index: number): Point {
  const cols = boardCols(board);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: board.minX + (col + 0.5) * board.cell, y: board.minY + (row + 0.5) * board.cell };
}

/** Visit every on-board cell whose centre could lie within `radius` of the box [x0, x1] × [y0, y1]. */
function forCellsNear(board: Board, x0: number, x1: number, y0: number, y1: number, radius: number, visit: (index: number, center: Point) => void): void {
  const cols = boardCols(board);
  const rows = boardRows(board);
  const colFrom = Math.max(0, Math.floor((x0 - radius - board.minX) / board.cell));
  const colTo = Math.min(cols - 1, Math.floor((x1 + radius - board.minX) / board.cell));
  const rowFrom = Math.max(0, Math.floor((y0 - radius - board.minY) / board.cell));
  const rowTo = Math.min(rows - 1, Math.floor((y1 + radius - board.minY) / board.cell));
  for (let row = rowFrom; row <= rowTo; row++) {
    for (let col = colFrom; col <= colTo; col++) {
      const index = row * cols + col;
      visit(index, cellCenter(board, index));
    }
  }
}

/** Cells whose centre lies inside the shape (on-board only), ascending. */
export function rasterize(board: Board, shape: ObstacleShape): number[] {
  const halfW = shape.kind === "circle" ? shape.r : shape.w / 2;
  const halfH = shape.kind === "circle" ? shape.r : shape.h / 2;
  const cells: number[] = [];
  forCellsNear(board, shape.cx, shape.cx, shape.cy, shape.cy, Math.max(halfW, halfH), (index, c) => {
    const inside =
      shape.kind === "circle"
        ? Math.hypot(c.x - shape.cx, c.y - shape.cy) <= shape.r
        : Math.abs(c.x - shape.cx) <= shape.w / 2 && Math.abs(c.y - shape.cy) <= shape.h / 2;
    if (inside) cells.push(index);
  });
  return cells;
}

/* ---------------------------------------------------------------------------
   Geometry
   --------------------------------------------------------------------------- */

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* ---------------------------------------------------------------------------
   Shot simulation
   --------------------------------------------------------------------------- */

export type ShotEnd = "edge" | "top" | "bottom" | "obstacle" | "undefined";

export interface ShotResult {
  /** The drawn polyline, starting at the shooter (absolute coordinates). */
  path: Point[];
  /** Ids of the targets destroyed, in the order they were passed. */
  hits: string[];
  /** Where the shot hit an obstacle, if it did. */
  impact: Point | null;
  /** Obstacle cells removed by the crater, ascending. */
  cleared: number[];
  end: ShotEnd;
}

/** First point along a → b (excluding a) that lies inside an obstacle cell. */
function firstObstacleAlong(board: Board, obstacles: ReadonlySet<number>, a: Point, b: Point): Point | null {
  const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / COLLISION_STEP));
  for (let k = 1; k <= samples; k++) {
    const p = { x: a.x + ((b.x - a.x) * k) / samples, y: a.y + ((b.y - a.y) * k) / samples };
    const index = cellIndexAt(board, p.x, p.y);
    if (index >= 0 && obstacles.has(index)) return p;
  }
  return null;
}

/** Obstacle cells within CRATER_RADIUS of the impact point, ascending. */
export function craterCells(board: Board, obstacles: ReadonlySet<number>, impact: Point): number[] {
  const cells: number[] = [];
  forCellsNear(board, impact.x, impact.x, impact.y, impact.y, CRATER_RADIUS, (index, c) => {
    if (obstacles.has(index) && Math.hypot(c.x - impact.x, c.y - impact.y) <= CRATER_RADIUS) cells.push(index);
  });
  return cells;
}

/**
 * Trace one shot. Pure: returns what happened and which cells the crater
 * would remove, without touching `obstacles` or `targets`.
 */
export function simulateShot(
  board: Board,
  obstacles: ReadonlySet<number>,
  targets: readonly Target[],
  shooter: Shooter,
  f: (x: number) => number,
): ShotResult {
  const start: Point = { x: shooter.x, y: shooter.y };
  const result: ShotResult = { path: [start], hits: [], impact: null, cleared: [], end: "edge" };
  const f0 = f(0);
  if (!Number.isFinite(f0)) {
    result.end = "undefined";
    return result;
  }
  const reach = shooter.dir > 0 ? board.maxX - shooter.x : shooter.x - board.minX;
  const steps = Math.round(reach / SHOT_STEP);
  const hit = new Set<string>();
  let prev = start;
  for (let i = 1; i <= steps; i++) {
    const t = i * SHOT_STEP;
    const y = shooter.y + f(t) - f0;
    if (!Number.isFinite(y)) {
      result.end = "undefined";
      break;
    }
    let next: Point = { x: shooter.x + shooter.dir * t, y };
    let last = false;
    if (y > board.maxY || y < board.minY) {
      const bound = y > board.maxY ? board.maxY : board.minY;
      const ratio = (bound - prev.y) / (y - prev.y);
      next = { x: prev.x + (next.x - prev.x) * ratio, y: bound };
      result.end = bound === board.maxY ? "top" : "bottom";
      last = true;
    }
    const impact = firstObstacleAlong(board, obstacles, prev, next);
    if (impact) {
      next = impact;
      result.impact = impact;
      result.cleared = craterCells(board, obstacles, impact);
      result.end = "obstacle";
      last = true;
    }
    for (const target of targets) {
      if (!hit.has(target.id) && distancePointToSegment(target, prev, next) <= TARGET_RADIUS) {
        hit.add(target.id);
        result.hits.push(target.id);
      }
    }
    result.path.push(next);
    prev = next;
    if (last) break;
  }
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/games/function-runner.test.ts`
Expected: PASS (12 tests). The rest of the suite still passes (`pnpm test`) — nothing else imports this module.

- [ ] **Step 5: Commit**

```bash
git add app/games/function-runner.ts tests/games/function-runner.test.ts
git commit -m "feat: function runner board geometry and shot simulation"
```

---

### Task 3: Solo game state

**Files:**
- Modify: `app/games/function-runner.ts` (append)
- Modify: `tests/games/function-runner.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `simulateShot`, `SOLO_BOARD`, `SOLO_SHOOTER`, `rasterize` (Task 2); `compileExpression` (Task 1).
- Produces:
  - `type FunctionRunnerDifficultyKey = "easy" | "normal" | "hard" | "expert"`.
  - `interface FunctionRunnerPuzzle { difficulty: FunctionRunnerDifficultyKey; board: Board; shooter: Shooter; shots: number; targets: Target[]; shapes: ObstacleShape[]; obstacles: number[]; solution: string[] }`.
  - `interface SoloGame { puzzle: FunctionRunnerPuzzle; alive: Set<string>; obstacles: Set<number>; shots: ShotResult[] }`.
  - `createSoloGame(puzzle): SoloGame`, `soloStatus(game): { remaining: number; shotsLeft: number; won: boolean; lost: boolean }`.
  - `type FireError = { ok: false; error: string; position: number | null }`, `type SoloFire = { ok: true; game: SoloGame; result: ShotResult } | FireError`, `fireSolo(game, expression): SoloFire` (never mutates `game`).
  - `F0_UNDEFINED_ERROR = "f(0) 沒有定義，曲線無法從出發點畫起"`.

- [ ] **Step 1: Append the failing tests**

Add to the imports at the top of `tests/games/function-runner.test.ts`: `F0_UNDEFINED_ERROR`, `createSoloGame`, `fireSolo`, `soloStatus`, and the type `FunctionRunnerPuzzle`. Then append:

```ts
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
    expect(game.shots).toEqual([]);
  });

  it("cancels the constant term so the curve always leaves from the shooter", () => {
    const game = createSoloGame(puzzle);
    const flat = fireSolo(game, "0");
    const lifted = fireSolo(game, "7");
    expect(flat.ok && lifted.ok && JSON.stringify(flat.result) === JSON.stringify(lifted.result)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/games/function-runner.test.ts`
Expected: FAIL — `createSoloGame` is not exported.

- [ ] **Step 3: Append the solo state to the module**

Add at the top of `app/games/function-runner.ts` (after the header comment):

```ts
import { compileExpression } from "~/utils/expression";
```

Append at the end of the file:

```ts
/* ---------------------------------------------------------------------------
   Solo puzzles and game state
   --------------------------------------------------------------------------- */

export type FunctionRunnerDifficultyKey = "easy" | "normal" | "hard" | "expert";

export interface FunctionRunnerPuzzle {
  difficulty: FunctionRunnerDifficultyKey;
  board: Board;
  shooter: Shooter;
  shots: number;
  targets: Target[];
  /** The obstacle shapes the generator drew (for tests and debugging). */
  shapes: ObstacleShape[];
  /** Obstacle cells, ascending. */
  obstacles: number[];
  /** One hidden curve per target group; firing them in order clears the board. */
  solution: string[];
}

export interface SoloGame {
  puzzle: FunctionRunnerPuzzle;
  alive: Set<string>;
  obstacles: Set<number>;
  shots: ShotResult[];
}

export interface SoloStatus {
  remaining: number;
  shotsLeft: number;
  won: boolean;
  lost: boolean;
}

export type FireError = { ok: false; error: string; position: number | null };
export type SoloFire = { ok: true; game: SoloGame; result: ShotResult } | FireError;

export const F0_UNDEFINED_ERROR = "f(0) 沒有定義，曲線無法從出發點畫起";

export function createSoloGame(puzzle: FunctionRunnerPuzzle): SoloGame {
  return { puzzle, alive: new Set(puzzle.targets.map((t) => t.id)), obstacles: new Set(puzzle.obstacles), shots: [] };
}

export function soloStatus(game: SoloGame): SoloStatus {
  const remaining = game.alive.size;
  const shotsLeft = game.puzzle.shots - game.shots.length;
  return { remaining, shotsLeft, won: remaining === 0, lost: remaining > 0 && shotsLeft <= 0 };
}

/** Parse the expression and make sure the curve can start at the shooter. */
function prepareShot(expression: string): { ok: true; f: (x: number) => number } | FireError {
  const compiled = compileExpression(expression);
  if (!compiled.ok) return { ok: false, error: compiled.error, position: compiled.position };
  if (!Number.isFinite(compiled.f(0))) return { ok: false, error: F0_UNDEFINED_ERROR, position: null };
  return { ok: true, f: compiled.f };
}

function without<T>(set: ReadonlySet<T>, removed: readonly T[]): Set<T> {
  const next = new Set(set);
  for (const item of removed) next.delete(item);
  return next;
}

export function fireSolo(game: SoloGame, expression: string): SoloFire {
  const status = soloStatus(game);
  if (status.won) return { ok: false, error: "目標已經全部命中", position: null };
  if (status.lost) return { ok: false, error: "射擊次數已用完", position: null };
  const prepared = prepareShot(expression);
  if (!prepared.ok) return prepared;
  const targets = game.puzzle.targets.filter((t) => game.alive.has(t.id));
  const result = simulateShot(game.puzzle.board, game.obstacles, targets, game.puzzle.shooter, prepared.f);
  const next: SoloGame = {
    puzzle: game.puzzle,
    alive: without(game.alive, result.hits),
    obstacles: without(game.obstacles, result.cleared),
    shots: [...game.shots, result],
  };
  return { ok: true, game: next, result };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/games/function-runner.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add app/games/function-runner.ts tests/games/function-runner.test.ts
git commit -m "feat: function runner solo game state"
```

---

### Task 4: Difficulties and the solvable puzzle generator

**Files:**
- Modify: `app/games/function-runner.ts` (append)
- Modify: `tests/games/function-runner.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `Rng` from `~/utils/rng` (`pick`, `shuffle`, `int`, `float`, `bool`); `compileExpression`; Task 2 geometry; Task 3 types.
- Produces:
  - `interface FunctionRunnerDifficulty { key: FunctionRunnerDifficultyKey; label: string; targets: number; shots: number; obstacles: number; groups: number[] }`, `FUNCTION_RUNNER_DIFFICULTIES: FunctionRunnerDifficulty[]`, `getFunctionRunnerDifficulty(key: string)` (falls back to normal).
  - `generateFunctionRunnerPuzzle(rng: Rng, difficultyKey = "normal"): FunctionRunnerPuzzle`.
  - Internal helpers reused by Task 5: `farEnough(p, others, spacing)`, `markWithin(board, blocked, a, b, radius)`, `placeObstacles(rng, board, count, blocked, xRange)`.

- [ ] **Step 1: Append the failing tests**

Extend the imports with `FUNCTION_RUNNER_DIFFICULTIES`, `generateFunctionRunnerPuzzle`, `getFunctionRunnerDifficulty`, `makeRng` (from `~/utils/rng`) and the type `FunctionRunnerDifficulty`. Append:

```ts
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

/** Fire the hidden curves in order through the real pipeline. */
function playSolution(puzzle: FunctionRunnerPuzzle): { remaining: number; used: number } {
  let game = createSoloGame(puzzle);
  for (const expression of puzzle.solution) {
    const fired = fireSolo(game, expression);
    if (!fired.ok) throw new Error(`${expression}: ${fired.error}`);
    game = fired.game;
  }
  return { remaining: game.alive.size, used: game.shots.length };
}

const SEEDS: (string | number)[] = [...Array.from({ length: 300 }, (_, i) => `function-runner-${i}`), ...Array.from({ length: 100 }, (_, i) => i * 7919)];

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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/games/function-runner.test.ts`
Expected: FAIL — `FUNCTION_RUNNER_DIFFICULTIES` is not exported.

- [ ] **Step 3: Append the generator**

Add `import type { Rng } from "~/utils/rng";` next to the other import. Append to `app/games/function-runner.ts`:

```ts
/* ---------------------------------------------------------------------------
   Difficulties and the generator
   --------------------------------------------------------------------------- */

export interface FunctionRunnerDifficulty {
  key: FunctionRunnerDifficultyKey;
  label: string;
  targets: number;
  shots: number;
  obstacles: number;
  /** Targets per hidden curve, largest group first. */
  groups: number[];
}

export const FUNCTION_RUNNER_DIFFICULTIES: FunctionRunnerDifficulty[] = [
  { key: "easy", label: "簡單", targets: 3, shots: 3, obstacles: 0, groups: [1, 1, 1] },
  { key: "normal", label: "普通", targets: 5, shots: 4, obstacles: 2, groups: [2, 2, 1] },
  { key: "hard", label: "困難", targets: 7, shots: 4, obstacles: 4, groups: [3, 2, 2] },
  { key: "expert", label: "專家", targets: 10, shots: 5, obstacles: 6, groups: [3, 3, 2, 2] },
];

export function getFunctionRunnerDifficulty(key: string): FunctionRunnerDifficulty {
  return FUNCTION_RUNNER_DIFFICULTIES.find((d) => d.key === key) ?? FUNCTION_RUNNER_DIFFICULTIES[1];
}

const TARGET_MIN_X = 2;
const TARGET_MAX_X = 19;
const TARGET_MAX_Y = 7;
const TARGET_SPACING = 1.5;
/** A hidden curve must stay this close to the middle until its last target, or the shot would leave the board early. */
const PATH_Y_LIMIT = 7.5;
const PATH_STEP = 0.05;
const OBSTACLE_PATH_MARGIN = 0.75;
const OBSTACLE_TARGET_MARGIN = 1;
const SHOOTER_CLEARANCE = 2;
const GROUP_ATTEMPTS = 200;
const OBSTACLE_ATTEMPTS = 200;
const PUZZLE_ATTEMPTS = 50;

type Family = (rng: Rng) => string;

function linearTerm(b: number): string {
  if (b === 0) return "";
  const size = Math.abs(b) === 1 ? "x" : `${Math.abs(b)}x`;
  return ` ${b < 0 ? "-" : "+"} ${size}`;
}

/** m·x with m = p/q, |m| ≤ 2: "2x", "-x/2", "2x/3". */
const lineFamily: Family = (rng) => {
  const q = rng.pick([1, 2, 3]);
  const p = rng.pick([-3, -2, -1, 1, 2, 3].filter((v) => Math.abs(v / q) <= 2));
  const head = p === 1 ? "x" : p === -1 ? "-x" : `${p}x`;
  return q === 1 ? head : `${head}/${q}`;
};

/** a·x² + b·x with a ∈ {±¼, ±½, ±1}, b ∈ [−3, 3]: "x^2/4 - 3x", "-x^2 + 2x". */
const quadraticFamily: Family = (rng) => {
  const den = rng.pick([1, 2, 4]);
  const head = `${rng.bool() ? "-" : ""}${den === 1 ? "x^2" : `x^2/${den}`}`;
  return head + linearTerm(rng.int(-3, 3));
};

/** A·sin(2πx/p) with p ∈ {4, 8, 12}: "3sin(pi x/2)", "4sin(pi x/4)", "2sin(pi x/6)". */
const sineFamily: Family = (rng) => `${rng.int(2, 6)}sin(pi x/${rng.pick([2, 4, 6])})`;

/** a·|x − c| with a ∈ {±½, ±1}, c ∈ [3, 10]: "abs(x-5)", "-abs(x-6)/2". */
const absFamily: Family = (rng) => `${rng.bool() ? "-" : ""}abs(x-${rng.int(3, 10)})${rng.bool() ? "/2" : ""}`;

const FAMILIES_BY_GROUP_SIZE: Record<number, Family[]> = {
  1: [lineFamily],
  2: [lineFamily, quadraticFamily],
  3: [lineFamily, quadraticFamily, sineFamily, absFamily],
};

interface HiddenCurve {
  expression: string;
  targets: Point[];
  /** The curve as the shot will draw it, from the shooter to the last target. */
  path: Point[];
}

/** The curve as drawn: y = f(x) − f(0). Our own strings always compile. */
function shiftedCurve(expression: string): (x: number) => number {
  const compiled = compileExpression(expression);
  if (!compiled.ok) throw new Error(`function runner: bad hidden curve ${expression}: ${compiled.error}`);
  const f0 = compiled.f(0);
  return (x) => compiled.f(x) - f0;
}

function farEnough(p: Point, others: readonly Point[], spacing: number): boolean {
  return others.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= spacing);
}

function drawHiddenCurve(rng: Rng, size: number, placed: readonly Point[]): HiddenCurve | null {
  for (let attempt = 0; attempt < GROUP_ATTEMPTS; attempt++) {
    const expression = rng.pick(FAMILIES_BY_GROUP_SIZE[size])(rng);
    const g = shiftedCurve(expression);
    const eligible: Point[] = [];
    for (let x = TARGET_MIN_X; x <= TARGET_MAX_X; x++) {
      const y = g(x);
      const rounded = Math.round(y);
      if (Math.abs(y - rounded) < 1e-9 && Math.abs(rounded) <= TARGET_MAX_Y) eligible.push({ x, y: rounded });
    }
    if (eligible.length < size) continue;
    const targets = rng.shuffle(eligible).slice(0, size).sort((a, b) => a.x - b.x);
    if (!targets.every((t, i) => farEnough(t, [...placed, ...targets.slice(0, i)], TARGET_SPACING))) continue;
    const xMax = targets[targets.length - 1].x;
    const path: Point[] = [];
    for (let i = 0, n = Math.round(xMax / PATH_STEP); i <= n; i++) path.push({ x: i * PATH_STEP, y: g(i * PATH_STEP) });
    if (path.some((p) => Math.abs(p.y) > PATH_Y_LIMIT)) continue;
    return { expression, targets, path };
  }
  return null;
}

/** Mark every cell whose centre is closer than `radius` to the segment a–b (a point when a = b). */
function markWithin(board: Board, blocked: Set<number>, a: Point, b: Point, radius: number): void {
  forCellsNear(board, Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y), radius, (index, c) => {
    if (distancePointToSegment(c, a, b) < radius) blocked.add(index);
  });
}

function randomShape(rng: Rng, xMin: number, xMax: number): ObstacleShape {
  const cx = rng.float(xMin, xMax);
  const cy = rng.float(-7, 7);
  return rng.bool() ? { kind: "circle", cx, cy, r: rng.float(0.8, 1.5) } : { kind: "rect", cx, cy, w: 1, h: rng.float(2, 4) };
}

/** Drop `count` shapes whose cells avoid `blocked` and each other; null when one cannot be placed. */
function placeObstacles(rng: Rng, board: Board, count: number, blocked: ReadonlySet<number>, xMin: number, xMax: number): { shapes: ObstacleShape[]; cells: number[] } | null {
  const shapes: ObstacleShape[] = [];
  const occupied = new Set<number>();
  for (let n = 0; n < count; n++) {
    let placed = false;
    for (let attempt = 0; attempt < OBSTACLE_ATTEMPTS && !placed; attempt++) {
      const shape = randomShape(rng, xMin, xMax);
      const cells = rasterize(board, shape);
      if (cells.length === 0 || cells.some((c) => occupied.has(c) || blocked.has(c))) continue;
      shapes.push(shape);
      for (const c of cells) occupied.add(c);
      placed = true;
    }
    if (!placed) return null;
  }
  return { shapes, cells: [...occupied].sort((a, b) => a - b) };
}

function tryGeneratePuzzle(rng: Rng, difficulty: FunctionRunnerDifficulty): FunctionRunnerPuzzle | null {
  const board = SOLO_BOARD;
  const shooter = SOLO_SHOOTER;
  const curves: HiddenCurve[] = [];
  const placed: Point[] = [];
  for (const size of difficulty.groups) {
    const curve = drawHiddenCurve(rng, size, placed);
    if (!curve) return null;
    curves.push(curve);
    placed.push(...curve.targets);
  }
  const targets: Target[] = placed.map((p, i) => ({ id: `t${i + 1}`, x: p.x, y: p.y }));
  const blocked = new Set<number>();
  markWithin(board, blocked, shooter, shooter, SHOOTER_CLEARANCE);
  for (const t of targets) markWithin(board, blocked, t, t, OBSTACLE_TARGET_MARGIN);
  for (const curve of curves) {
    for (let i = 1; i < curve.path.length; i++) markWithin(board, blocked, curve.path[i - 1], curve.path[i], OBSTACLE_PATH_MARGIN);
  }
  const obstacles = placeObstacles(rng, board, difficulty.obstacles, blocked, 3, 18);
  if (!obstacles) return null;
  return {
    difficulty: difficulty.key,
    board,
    shooter,
    shots: difficulty.shots,
    targets,
    shapes: obstacles.shapes,
    obstacles: obstacles.cells,
    solution: curves.map((c) => c.expression),
  };
}

/**
 * Build a round from its answer: draw one hidden curve per target group, put
 * the targets on it, then keep obstacles clear of every curve up to its last
 * target. Firing the curves in order therefore always clears the board.
 */
export function generateFunctionRunnerPuzzle(rng: Rng, difficultyKey = "normal"): FunctionRunnerPuzzle {
  const difficulty = getFunctionRunnerDifficulty(difficultyKey);
  for (let attempt = 0; attempt < PUZZLE_ATTEMPTS; attempt++) {
    const puzzle = tryGeneratePuzzle(rng, difficulty);
    if (puzzle) return puzzle;
  }
  throw new Error(`function runner: no ${difficulty.key} puzzle after ${PUZZLE_ATTEMPTS} attempts`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/games/function-runner.test.ts`
Expected: PASS (23 tests), a few seconds for the 1600 + 1098 generated rounds. If the solvability test lists survivors, print the offending seed's `solution` and targets and check the hidden path really stays within ±7.5 up to its last target; if `puzzleIssues` reports too few obstacles, the retry loop is not regenerating on `placeObstacles` returning null.

- [ ] **Step 5: Commit**

```bash
git add app/games/function-runner.ts tests/games/function-runner.test.ts
git commit -m "feat: function runner difficulties and solvable puzzle generator"
```

---

### Task 5: PVP match

**Files:**
- Modify: `app/games/function-runner.ts` (append)
- Modify: `tests/games/function-runner.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `simulateShot`, `PVP_BOARD`, `prepareShot`, `without`, `farEnough`, `markWithin`, `placeObstacles` (Tasks 2–4).
- Produces:
  - `interface PvpUnit extends Point { id: string; owner: 1 | 2; alive: boolean }`, `interface PvpShot { player: 1 | 2; unitId: string; result: ShotResult }`, `interface PvpMatch { board: Board; units: PvpUnit[]; shapes: ObstacleShape[]; obstacles: Set<number>; turn: 1 | 2; winner: 0 | 1 | 2; shots: PvpShot[] }`.
  - `PVP_UNITS_PER_SIDE = 3`, `PVP_OBSTACLES = 5`, `pvpDirection(owner): 1 | -1`, `pvpAlive(match, owner): PvpUnit[]`, `nextPvpUnit(match, owner, afterId: string | null): PvpUnit | null`.
  - `generatePvpMatch(rng): PvpMatch`, `type PvpFire = { ok: true; match: PvpMatch; result: ShotResult } | FireError`, `firePvp(match, unitId, expression): PvpFire` (never mutates `match`).

- [ ] **Step 1: Append the failing tests**

Extend the imports with `PVP_OBSTACLES`, `PVP_UNITS_PER_SIDE`, `firePvp`, `generatePvpMatch`, `nextPvpUnit`, `pvpAlive`, `pvpDirection` and the type `PvpMatch`. Append:

```ts
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/games/function-runner.test.ts`
Expected: FAIL — `generatePvpMatch` is not exported.

- [ ] **Step 3: Append the PVP logic**

Append to `app/games/function-runner.ts`:

```ts
/* ---------------------------------------------------------------------------
   Hot-seat PVP
   --------------------------------------------------------------------------- */

export interface PvpUnit extends Point {
  id: string;
  owner: 1 | 2;
  alive: boolean;
}

export interface PvpShot {
  player: 1 | 2;
  unitId: string;
  result: ShotResult;
}

export interface PvpMatch {
  board: Board;
  units: PvpUnit[];
  shapes: ObstacleShape[];
  obstacles: Set<number>;
  turn: 1 | 2;
  winner: 0 | 1 | 2;
  shots: PvpShot[];
}

export type PvpFire = { ok: true; match: PvpMatch; result: ShotResult } | FireError;

export const PVP_UNITS_PER_SIDE = 3;
export const PVP_OBSTACLES = 5;
const PVP_ZONES: Record<1 | 2, [number, number]> = { 1: [-9, -6], 2: [6, 9] };
const PVP_UNIT_Y = 6;
const PVP_UNIT_SPACING = 2;
const PVP_UNIT_CLEARANCE = 1.5;
const PVP_OBSTACLE_X = 4;
const UNIT_ATTEMPTS = 200;

/** Player one shoots to the right, player two to the left: "+x" always points at the opponent. */
export function pvpDirection(owner: 1 | 2): 1 | -1 {
  return owner === 1 ? 1 : -1;
}

export function pvpAlive(match: PvpMatch, owner: 1 | 2): PvpUnit[] {
  return match.units.filter((u) => u.owner === owner && u.alive);
}

/** The owner's next living unit after `afterId` in list order (wrapping), or null when none is left. */
export function nextPvpUnit(match: PvpMatch, owner: 1 | 2, afterId: string | null): PvpUnit | null {
  const own = match.units.filter((u) => u.owner === owner);
  const start = afterId ? own.findIndex((u) => u.id === afterId) : -1;
  for (let k = 1; k <= own.length; k++) {
    const unit = own[(start + k) % own.length];
    if (unit.alive) return unit;
  }
  return null;
}

export function generatePvpMatch(rng: Rng): PvpMatch {
  const board = PVP_BOARD;
  for (let attempt = 0; attempt < PUZZLE_ATTEMPTS; attempt++) {
    const units: PvpUnit[] = [];
    for (const owner of [1, 2] as const) {
      for (let n = 1; n <= PVP_UNITS_PER_SIDE; n++) {
        let unit: PvpUnit | null = null;
        for (let tries = 0; tries < UNIT_ATTEMPTS && !unit; tries++) {
          const candidate: PvpUnit = { id: `p${owner}-${n}`, owner, x: rng.int(PVP_ZONES[owner][0], PVP_ZONES[owner][1]), y: rng.int(-PVP_UNIT_Y, PVP_UNIT_Y), alive: true };
          if (farEnough(candidate, units, PVP_UNIT_SPACING)) unit = candidate;
        }
        if (unit) units.push(unit);
      }
    }
    if (units.length !== 2 * PVP_UNITS_PER_SIDE) continue;
    const blocked = new Set<number>();
    for (const u of units) markWithin(board, blocked, u, u, PVP_UNIT_CLEARANCE);
    const obstacles = placeObstacles(rng, board, PVP_OBSTACLES, blocked, -PVP_OBSTACLE_X, PVP_OBSTACLE_X);
    if (!obstacles) continue;
    return { board, units, shapes: obstacles.shapes, obstacles: new Set(obstacles.cells), turn: 1, winner: 0, shots: [] };
  }
  throw new Error(`function runner: no PVP map after ${PUZZLE_ATTEMPTS} attempts`);
}

export function firePvp(match: PvpMatch, unitId: string, expression: string): PvpFire {
  if (match.winner) return { ok: false, error: "對局已經結束", position: null };
  const unit = match.units.find((u) => u.id === unitId);
  if (!unit || unit.owner !== match.turn) return { ok: false, error: "請選自己的單位當出發點", position: null };
  if (!unit.alive) return { ok: false, error: "這個單位已經被消滅", position: null };
  const prepared = prepareShot(expression);
  if (!prepared.ok) return prepared;
  const enemy: 1 | 2 = match.turn === 1 ? 2 : 1;
  const targets: Target[] = pvpAlive(match, enemy).map((u) => ({ id: u.id, x: u.x, y: u.y }));
  const result = simulateShot(match.board, match.obstacles, targets, { x: unit.x, y: unit.y, dir: pvpDirection(unit.owner) }, prepared.f);
  const units = match.units.map((u) => (result.hits.includes(u.id) ? { ...u, alive: false } : u));
  const enemyLeft = units.some((u) => u.owner === enemy && u.alive);
  const next: PvpMatch = {
    ...match,
    units,
    obstacles: without(match.obstacles, result.cleared),
    turn: enemy,
    winner: enemyLeft ? 0 : match.turn,
    shots: [...match.shots, { player: match.turn, unitId, result }],
  };
  return { ok: true, match: next, result };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all suites PASS (the function-runner file now has 28 tests).

- [ ] **Step 5: Commit**

```bash
git add app/games/function-runner.ts tests/games/function-runner.test.ts
git commit -m "feat: function runner hot-seat PVP match"
```

---

### Task 6: The game component

**Files:**
- Rewrite: `app/components/games/FunctionRunnerGame.vue` (whole file)

**Interfaces:**
- Consumes from `~/games/function-runner`: `FUNCTION_RUNNER_DIFFICULTIES`, `TARGET_RADIUS`, `cellCenter`, `createSoloGame`, `firePvp`, `fireSolo`, `generateFunctionRunnerPuzzle`, `generatePvpMatch`, `getFunctionRunnerDifficulty`, `nextPvpUnit`, `pvpAlive`, `soloStatus`. `makeRng` is auto-imported by Nuxt from `app/utils`.
- Produces: the `<FunctionRunnerGame :seed :daily @solved>` component used by `app/pages/games/function-runner.vue` and `app/pages/daily.vue` (props unchanged).

- [ ] **Step 1: Write the component**

`app/components/games/FunctionRunnerGame.vue` (whole file):

```vue
<script setup>
import {
  FUNCTION_RUNNER_DIFFICULTIES,
  TARGET_RADIUS,
  cellCenter,
  createSoloGame,
  firePvp,
  fireSolo,
  generateFunctionRunnerPuzzle,
  generatePvpMatch,
  getFunctionRunnerDifficulty,
  nextPvpUnit,
  pvpAlive,
  soloStatus,
} from "~/games/function-runner";

const accent = "#fb7185";
/** SVG pixels per board unit. */
const UNIT = 50;
/** Room around the plot for the axis labels. */
const PAD = { left: 46, right: 14, top: 14, bottom: 36 };
/** Board units per second while a shot draws, capped at SHOT_MAX_SECONDS. */
const SHOT_SPEED = 25;
const SHOT_MAX_SECONDS = 0.9;
const MAX_TRACES = 8;
const QUICK_KEYS = [
  { label: "x", text: "x" },
  { label: "^", text: "^" },
  { label: "(", text: "(" },
  { label: ")", text: ")" },
  { label: "sin", text: "sin(" },
  { label: "cos", text: "cos(" },
  { label: "abs", text: "abs(" },
  { label: "sqrt", text: "sqrt(" },
];
const SYNTAX = [
  ["2x + 1", "直線"],
  ["x^2/4 - 2x", "拋物線"],
  ["3sin(pi x/4)", "正弦波"],
  ["abs(x-5)", "V 形"],
  ["sqrt(x)、e^x、ln(x+1)", "其他函式"],
  ["1/2x", "視為 (1/2)x"],
];

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const mode = ref("solo");
const difficultyKey = ref("normal");
const effectiveDifficulty = computed(() => (props.daily ? "hard" : difficultyKey.value));
const solo = ref(null);
const match = ref(null);
const shooterId = ref(null);
const lastUnit = { 1: null, 2: null };
const expression = ref("");
const error = ref("");
const firing = ref(false);
const drawing = ref(null);
const traces = ref([]);
const overlay = reactive({ open: false, title: "", sub: "", actions: [] });
const inputEl = ref(null);
let animation = 0;

const board = computed(() => (mode.value === "pvp" ? match.value?.board : solo.value?.puzzle.board) ?? null);
const viewWidth = computed(() => (board.value ? (board.value.maxX - board.value.minX) * UNIT + PAD.left + PAD.right : 0));
const viewHeight = computed(() => (board.value ? (board.value.maxY - board.value.minY) * UNIT + PAD.top + PAD.bottom : 0));
const xTicks = computed(() => (board.value ? range(board.value.minX, board.value.maxX) : []));
const yTicks = computed(() => (board.value ? range(board.value.minY, board.value.maxY) : []));
const obstacles = computed(() => (mode.value === "pvp" ? match.value?.obstacles : solo.value?.obstacles) ?? new Set());
const obstaclePath = computed(() => {
  if (!board.value) return "";
  const half = board.value.cell / 2;
  const size = board.value.cell * UNIT;
  let d = "";
  for (const index of obstacles.value) {
    const c = cellCenter(board.value, index);
    d += `M${sx(c.x - half)} ${sy(c.y + half)}h${size}v${size}h${-size}z`;
  }
  return d;
});
const status = computed(() => (solo.value ? soloStatus(solo.value) : null));
const aliveTargets = computed(() => (solo.value ? solo.value.puzzle.targets.filter((t) => solo.value.alive.has(t.id)) : []));
const aliveUnits = computed(() => (match.value ? match.value.units.filter((u) => u.alive) : []));
const currentUnit = computed(() => (match.value ? (match.value.units.find((u) => u.id === shooterId.value) ?? null) : null));
const inputDisabled = computed(() => firing.value || overlay.open || (mode.value === "pvp" && !currentUnit.value));
const fireDisabled = computed(() => inputDisabled.value || expression.value.trim() === "");

function range(from, to) {
  const out = [];
  for (let v = from; v <= to; v++) out.push(v);
  return out;
}
function sx(x) {
  return PAD.left + (x - board.value.minX) * UNIT;
}
function sy(y) {
  return PAD.top + (board.value.maxY - y) * UNIT;
}
function pointsString(path) {
  return path.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
}
function playerName(player) {
  return player === 1 ? "玩家一" : "玩家二";
}

function soloRng() {
  return makeRng(props.seed == null ? null : `${props.seed}:function-runner:${effectiveDifficulty.value}`);
}

function resetShotView() {
  cancelAnimationFrame(animation);
  firing.value = false;
  drawing.value = null;
  traces.value = [];
  error.value = "";
  expression.value = "";
  overlay.open = false;
}

function newPuzzle() {
  resetShotView();
  solo.value = createSoloGame(generateFunctionRunnerPuzzle(soloRng(), effectiveDifficulty.value));
  focusInput();
}

function retryPuzzle() {
  resetShotView();
  solo.value = createSoloGame(solo.value.puzzle);
  focusInput();
}

function newMatch() {
  resetShotView();
  match.value = generatePvpMatch(makeRng(Date.now()));
  lastUnit[1] = null;
  lastUnit[2] = null;
  shooterId.value = nextPvpUnit(match.value, 1, null)?.id ?? null;
  focusInput();
}

function setMode(next) {
  if (mode.value === next) return;
  mode.value = next;
  if (next === "pvp") newMatch();
  else newPuzzle();
}

function selectUnit(unit) {
  if (firing.value || overlay.open || unit.owner !== match.value.turn || !unit.alive) return;
  shooterId.value = unit.id;
  focusInput();
}

function fire() {
  if (fireDisabled.value) return;
  const outcome = mode.value === "pvp" ? firePvp(match.value, shooterId.value, expression.value) : fireSolo(solo.value, expression.value);
  if (!outcome.ok) {
    error.value = outcome.error;
    return;
  }
  error.value = "";
  animateShot(outcome.result.path, () => commit(outcome));
}

function animateShot(path, done) {
  const points = pointsString(path);
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  const pixels = length * UNIT;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const seconds = reduced ? 0 : Math.min(SHOT_MAX_SECONDS, length / SHOT_SPEED);
  firing.value = true;
  drawing.value = { points, length: pixels, offset: seconds ? pixels : 0 };
  const finish = () => {
    drawing.value = null;
    firing.value = false;
    done();
  };
  if (!seconds) {
    finish();
    return;
  }
  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / (seconds * 1000));
    drawing.value = { points, length: pixels, offset: pixels * (1 - progress) };
    if (progress < 1) animation = requestAnimationFrame(tick);
    else finish();
  };
  animation = requestAnimationFrame(tick);
}

function commit(outcome) {
  traces.value = [...traces.value, pointsString(outcome.result.path)].slice(-MAX_TRACES);
  if (mode.value === "pvp") {
    const shooter = match.value.turn;
    lastUnit[shooter] = shooterId.value;
    match.value = outcome.match;
    shooterId.value = nextPvpUnit(match.value, match.value.turn, lastUnit[match.value.turn])?.id ?? null;
    if (match.value.winner) {
      openOverlay(`${playerName(match.value.winner)}獲勝`, `共 ${match.value.shots.length} 發`, [{ label: "再來一局", accent: true, run: newMatch }]);
    } else {
      expression.value = "";
      focusInput();
    }
    return;
  }
  solo.value = outcome.game;
  const next = soloStatus(solo.value);
  if (next.won) {
    openOverlay("全部命中", `用了 ${solo.value.shots.length} 發`, props.daily ? [{ label: "完成", disabled: true }] : [{ label: "下一題", accent: true, run: newPuzzle }]);
    emit("solved", {});
  } else if (next.lost) {
    const actions = [{ label: props.daily ? "重來" : "重來這題", accent: true, run: retryPuzzle }];
    if (!props.daily) actions.push({ label: "新題目", run: newPuzzle });
    openOverlay("次數用完", `還剩 ${next.remaining} 個目標`, actions);
  } else {
    focusInput(true);
  }
}

function openOverlay(title, sub, actions) {
  overlay.title = title;
  overlay.sub = sub;
  overlay.actions = actions;
  overlay.open = true;
}

function insert(text) {
  const el = inputEl.value;
  const value = expression.value;
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  expression.value = value.slice(0, start) + text + value.slice(end);
  nextTick(() => {
    el?.focus();
    el?.setSelectionRange(start + text.length, start + text.length);
  });
}

function focusInput(selectAll = false) {
  nextTick(() => {
    inputEl.value?.focus();
    if (selectAll) inputEl.value?.select();
  });
}

watch(expression, () => {
  error.value = "";
});
watch(
  () => props.seed,
  () => {
    if (mode.value === "solo") newPuzzle();
  },
);
watch(effectiveDifficulty, () => {
  if (mode.value === "solo") newPuzzle();
});
onMounted(newPuzzle);
onBeforeUnmount(() => cancelAnimationFrame(animation));
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="座標射擊" title-en="Function Runner">
      <template #actions>
        <button v-if="mode === 'pvp'" class="btn btn--accent" @click="newMatch">再來一局</button>
        <button v-else class="btn btn--accent" @click="newPuzzle">{{ daily ? "重來" : "新題目" }}</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <template v-if="mode === 'pvp' && match">
            <div class="chip">
              <span class="chip__label">玩家一</span>
              <span class="chip__value" :class="{ 'is-accent': match.turn === 1 }">{{ pvpAlive(match, 1).length }}</span>
            </div>
            <div class="chip">
              <span class="chip__label">玩家二</span>
              <span class="chip__value" :class="{ 'is-accent': match.turn === 2 }">{{ pvpAlive(match, 2).length }}</span>
            </div>
            <div class="chip">
              <span class="chip__label">回合</span>
              <span class="chip__value">{{ playerName(match.turn) }}</span>
            </div>
          </template>
          <template v-else-if="status">
            <div class="chip">
              <span class="chip__label">目標</span>
              <span class="chip__value is-accent">{{ status.remaining }}/{{ solo.puzzle.targets.length }}</span>
            </div>
            <div class="chip">
              <span class="chip__label">射擊</span>
              <span class="chip__value">{{ status.shotsLeft }}/{{ solo.puzzle.shots }}</span>
            </div>
            <div class="chip">
              <span class="chip__label">難度</span>
              <span class="chip__value">{{ getFunctionRunnerDifficulty(effectiveDifficulty).label }}</span>
            </div>
          </template>
        </div>

        <div class="board-wrap">
          <div v-if="board" class="function-board">
            <svg class="plane" :viewBox="`0 0 ${viewWidth} ${viewHeight}`" role="img" aria-label="座標平面">
              <g class="plane__grid">
                <line v-for="x in xTicks" :key="`v${x}`" :x1="sx(x)" :y1="sy(board.maxY)" :x2="sx(x)" :y2="sy(board.minY)" :class="{ 'is-axis': x === 0 }" />
                <line v-for="y in yTicks" :key="`h${y}`" :x1="sx(board.minX)" :y1="sy(y)" :x2="sx(board.maxX)" :y2="sy(y)" :class="{ 'is-axis': y === 0 }" />
              </g>
              <g class="plane__labels">
                <text v-for="x in xTicks.filter((v) => v % 2 === 0)" :key="`lx${x}`" :x="sx(x)" :y="viewHeight - 12" text-anchor="middle">{{ x }}</text>
                <text v-for="y in yTicks.filter((v) => v % 2 === 0)" :key="`ly${y}`" :x="PAD.left - 10" :y="sy(y) + 4" text-anchor="end">{{ y }}</text>
              </g>
              <path class="plane__obstacles" :d="obstaclePath" />
              <polyline v-for="(points, i) in traces" :key="`trace${i}`" class="plane__trace" :points="points" />

              <template v-if="mode === 'pvp' && match">
                <g
                  v-for="unit in aliveUnits"
                  :key="unit.id"
                  class="plane__unit"
                  :class="{ 'is-hollow': unit.owner === 2, 'is-selected': unit.id === shooterId, 'is-selectable': unit.owner === match.turn && !firing }"
                  :transform="`translate(${sx(unit.x)} ${sy(unit.y)})`"
                  role="button"
                  :tabindex="unit.owner === match.turn ? 0 : -1"
                  :aria-label="`${playerName(unit.owner)}單位 (${unit.x}, ${unit.y})`"
                  :aria-pressed="unit.id === shooterId"
                  @click="selectUnit(unit)"
                  @keydown.enter.prevent="selectUnit(unit)"
                  @keydown.space.prevent="selectUnit(unit)"
                >
                  <circle class="plane__ring" r="17" />
                  <circle class="plane__dot" r="11" />
                  <text class="plane__coord" x="14" y="-14">({{ unit.x }}, {{ unit.y }})</text>
                </g>
              </template>
              <template v-else-if="solo">
                <g v-for="target in aliveTargets" :key="target.id" class="plane__target" :transform="`translate(${sx(target.x)} ${sy(target.y)})`">
                  <circle :r="TARGET_RADIUS * UNIT" />
                  <text class="plane__coord" x="14" y="-14">({{ target.x }}, {{ target.y }})</text>
                </g>
                <g class="plane__shooter" :transform="`translate(${sx(solo.puzzle.shooter.x)} ${sy(solo.puzzle.shooter.y)})`">
                  <circle class="plane__ring" r="17" />
                  <circle class="plane__dot" r="11" />
                </g>
              </template>

              <polyline v-if="drawing" class="plane__shot" :points="drawing.points" :style="{ strokeDasharray: drawing.length, strokeDashoffset: drawing.offset }" />
            </svg>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-for="action in overlay.actions" :key="action.label" class="btn" :class="{ 'btn--accent': action.accent }" :disabled="action.disabled" @click="action.run?.()">
                  {{ action.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <form class="fire" @submit.prevent="fire">
          <span v-if="mode === 'pvp' && currentUnit" class="fire__from">從 ({{ currentUnit.x }}, {{ currentUnit.y }}) 朝{{ match.turn === 1 ? "右" : "左" }}</span>
          <label class="fire__label" for="function-runner-input">f(x) =</label>
          <input
            id="function-runner-input"
            ref="inputEl"
            v-model="expression"
            class="fire__input"
            :class="{ 'is-invalid': error }"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="send"
            placeholder="例如 x^2/4 - 2x"
            :disabled="inputDisabled"
          />
          <button class="btn btn--accent" type="submit" :disabled="fireDisabled">發射</button>
        </form>
        <div class="keys" aria-label="快速輸入">
          <button v-for="key in QUICK_KEYS" :key="key.label" type="button" :disabled="inputDisabled" @click="insert(key.text)">{{ key.label }}</button>
        </div>
        <p class="fire__error" role="alert">{{ error }}</p>
      </div>

      <aside class="panel">
        <div v-if="!daily" class="panel__group">
          <span class="panel__legend">模式</span>
          <div class="seg">
            <button :class="{ 'is-active': mode === 'solo' }" :aria-pressed="mode === 'solo'" @click="setMode('solo')">單人</button>
            <button :class="{ 'is-active': mode === 'pvp' }" :aria-pressed="mode === 'pvp'" @click="setMode('pvp')">雙人</button>
          </div>
        </div>
        <div v-if="mode === 'solo' && !daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button v-for="d in FUNCTION_RUNNER_DIFFICULTIES" :key="d.key" :class="{ 'is-active': difficultyKey === d.key }" :aria-pressed="difficultyKey === d.key" @click="difficultyKey = d.key">
              {{ d.label }}
            </button>
          </div>
        </div>
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p v-if="mode === 'pvp'" class="hint">
            輪流射擊。點自己的單位當出發點，朝對手方向為 +x。曲線打到對方單位就消滅，穿過自己的單位不受影響，撞到障礙物會停下並炸開一小塊。先清光對方三個單位獲勝。
          </p>
          <p v-else class="hint">
            輸入 f(x)，曲線從出發點往右畫，經過目標點就消滅它，一發可以連中多個。曲線一律從出發點畫起，常數項會被抵銷。撞到障礙物會停下並炸開一小塊。次數用完前清光目標就過關。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">語法</span>
          <ul class="syntax">
            <li v-for="[code, note] in SYNTAX" :key="code">
              <code>{{ code }}</code>
              <span>{{ note }}</span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.function-board {
  width: min(92vw, 720px);
  padding: 0.5rem;
  border-radius: var(--r-lg);
  background: var(--ink-950);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}
.plane {
  display: block;
  width: 100%;
  height: auto;
}
.plane__grid line {
  stroke: rgba(255, 246, 232, 0.06);
  stroke-width: 1;
}
.plane__grid line.is-axis {
  stroke: rgba(255, 246, 232, 0.3);
  stroke-width: 1.5;
}
.plane__labels text,
.plane__coord {
  fill: var(--text-faint);
  font-family: var(--font-body);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.plane__coord {
  fill: var(--text-dim);
}
.plane__obstacles {
  fill: var(--ink-500);
  shape-rendering: crispEdges;
}
.plane__trace {
  fill: none;
  stroke: var(--accent);
  stroke-opacity: 0.28;
  stroke-width: 2;
  stroke-linejoin: round;
}
.plane__shot {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.plane__target circle {
  fill: var(--ink-950);
  stroke: var(--accent);
  stroke-width: 3;
}
.plane__dot {
  fill: var(--accent);
}
.plane__ring {
  fill: none;
  stroke: var(--accent);
  stroke-opacity: 0.35;
  stroke-width: 2;
}
.plane__unit .plane__ring {
  stroke-opacity: 0;
}
.plane__unit.is-hollow .plane__dot {
  fill: var(--ink-950);
  stroke: var(--accent);
  stroke-width: 3;
}
.plane__unit.is-selected .plane__ring,
.plane__unit:focus-visible .plane__ring {
  stroke-opacity: 0.9;
}
.plane__unit:focus-visible {
  outline: none;
}
.plane__unit.is-selectable {
  cursor: pointer;
}
.fire {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  width: min(92vw, 720px);
}
.fire__from {
  color: var(--text-dim);
  font-size: 0.9rem;
  white-space: nowrap;
}
.fire__label {
  color: var(--accent);
  font-weight: 700;
  white-space: nowrap;
}
.fire__input {
  flex: 1;
  min-width: 160px;
  min-height: 44px;
  padding: 0 0.8rem;
  border-radius: var(--r-sm);
  border: 1px solid var(--line-strong);
  background: var(--ink-950);
  color: var(--text);
  font: 500 1.05rem/1.2 var(--font-mono);
}
.fire__input::placeholder {
  color: var(--text-faint);
}
.fire__input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--glow-sm);
}
.fire__input.is-invalid {
  border-color: #ff5d6c;
}
.fire__input:disabled {
  opacity: 0.55;
}
.fire__error {
  min-height: 1.4em;
  margin: 0;
  color: #ff5d6c;
  font-size: 0.9rem;
}
.keys {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
}
.keys button {
  min-width: 46px;
  min-height: 36px;
  padding: 0 0.6rem;
  border-radius: var(--r-xs);
  background: var(--ink-800);
  border: 1px solid var(--line);
  color: var(--text-dim);
  font-size: 0.95rem;
  cursor: pointer;
}
.keys button:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}
.keys button:disabled {
  opacity: 0.45;
  cursor: default;
}
.syntax {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.88rem;
}
.syntax li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}
.syntax code {
  color: var(--text);
  font-family: var(--font-mono);
}
.syntax span {
  color: var(--text-faint);
  white-space: nowrap;
}
</style>
```

- [ ] **Step 2: Check it in the browser**

Run: `pnpm dev` and open `http://localhost:3000/games/function-runner`. Verify:
1. The board shows the grid with labels 0…20 and −8…8, five hollow targets with coordinate labels, two obstacles and the filled shooter at the origin; HUD reads 目標 5/5, 射擊 4/4, 難度 普通.
2. Typing `2 +` and pressing Enter shows 「這裡少了數字或 x」 in red under the input and the shot counter does not change.
3. Typing a line through one target (read its coordinates, e.g. (6, 3) → `x/2`) and pressing 發射 draws the curve over ~0.8 s, removes the target, decrements 射擊, and leaves a faint trace.
4. A shot into an obstacle stops there and a bite disappears from it.
5. Missing until 射擊 hits 0 opens 「次數用完」 with 重來這題 / 新題目; clearing all targets opens 「全部命中」 with 下一題.
6. 雙人: six units (three filled left, three hollow right), the first left unit ringed, the label 從 (x, y) 朝右; a shot passes turn to 玩家二 and the label flips to 朝左; wiping a side opens 「玩家一獲勝」.
7. `http://localhost:3000/daily` on a day whose game is function-runner (or temporarily reorder locally) shows no 模式/難度 controls and 重來 in the top bar.
8. Narrow the window to ~400 px: the input row wraps, the quick keys stay tappable, nothing overflows horizontally.

- [ ] **Step 3: Commit**

```bash
git add app/components/games/FunctionRunnerGame.vue
git commit -m "feat: rebuild Function Runner as a write-your-own-function shooter"
```

---

### Task 7: Registry, README and final verification

**Files:**
- Modify: `app/composables/useGames.ts` (the `function-runner` entry's `desc`)
- Modify: `README.md`

- [ ] **Step 1: Update the registry description**

In `app/composables/useGames.ts`, in the entry with `id: "function-runner"`, change `desc: "調係數命中目標點"` to `desc: "寫函式擊中目標點"`.

- [ ] **Step 2: Document the game in the README**

After the "### Board-game AI" section (before "## Design"), add:

```markdown
### Function Runner

座標射擊 is a Graphwar-style shooter: you type `f(x)` and the curve `y = f(x) − f(0)` is fired from the origin, destroying every target it passes and stopping at the first obstacle, where it blasts a small crater. `app/utils/expression.ts` parses the input with a small recursive-descent parser (implicit multiplication, `^`, `sin`/`cos`/`tan`/`abs`/`sqrt`/`exp`/`ln`/`floor`, `pi`/`e`) — no `eval`. Puzzles are generated from hidden solution curves (lines, parabolas, sine waves, V shapes with friendly coefficients) and obstacles are kept clear of them, so every round is solvable within its shot budget; the tests fire the hidden curves through the real simulation for hundreds of seeds and three years of Daily dates. 雙人 is a hot-seat mode on one device: each side has three units, turns alternate, and `+x` always points at the opponent.
```

In the project tree, change the utils line to:

```
│   ├── utils/                     # rng.ts (seeded RNG), sudoku.ts (generator / solver), expression.ts (f(x) parser)
```

- [ ] **Step 3: Run the whole suite and a production build**

Run: `pnpm test`
Expected: all files pass (45 files; the function-runner suite has 28 tests, expression 8).

Run: `pnpm generate`
Expected: exits 0 and `.output/public/games/function-runner/index.html` exists. A template error in the component surfaces here even though the unit tests are green.

- [ ] **Step 4: Commit**

```bash
git add app/composables/useGames.ts README.md
git commit -m "docs: describe the redesigned Function Runner"
```

---

## Self-review notes

- Spec coverage: rules (Task 2–3), difficulty table and solvability (Task 4), PVP (Task 5), syntax + error strings (Task 1), UI/animation/overlays/panel (Task 6), registry + README (Task 7). Daily behaviour: the seed string and forced `hard` live in Task 6's `soloRng`/`effectiveDifficulty`; the daily solvability test lives in Task 4.
- Names used across tasks: `simulateShot`, `ShotResult`, `craterCells`, `rasterize`, `cellCenter`, `createSoloGame`, `fireSolo`, `soloStatus`, `F0_UNDEFINED_ERROR`, `FireError`, `prepareShot`, `without`, `farEnough`, `markWithin`, `placeObstacles`, `forCellsNear`, `PUZZLE_ATTEMPTS`, `generatePvpMatch`, `firePvp`, `nextPvpUnit`, `pvpAlive`, `pvpDirection` — each is defined in the task before it is consumed.
