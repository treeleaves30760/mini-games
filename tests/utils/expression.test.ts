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
