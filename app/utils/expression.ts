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
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "　") {
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
      if (Object.hasOwn(CONSTANTS, t.value)) {
        const v = CONSTANTS[t.value];
        return () => v;
      }
      const fn = Object.hasOwn(FUNCTIONS, t.value) ? FUNCTIONS[t.value] : undefined;
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

/**
 * Longest source accepted. Parsing recurses per nesting level and the compiled
 * closures nest per operator, so bounding the text bounds both stacks: nothing a
 * player can type makes evaluation throw.
 */
export const MAX_EXPRESSION_LENGTH = 400;

/** Compile a typed expression into a closure, or explain (in Chinese) where it went wrong. */
export function compileExpression(source: string): CompiledExpression {
  if (source.trim() === "") return { ok: false, error: "請輸入函式", position: 0 };
  if (source.length > MAX_EXPRESSION_LENGTH) return { ok: false, error: `算式太長，最多 ${MAX_EXPRESSION_LENGTH} 個字元`, position: MAX_EXPRESSION_LENGTH };
  try {
    return { ok: true, f: new Parser(tokenize(source)).parse() };
  } catch (err) {
    const failure = err as ExpressionError;
    return { ok: false, error: failure.message, position: failure.position };
  }
}
