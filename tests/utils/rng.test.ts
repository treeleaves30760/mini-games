import { describe, it, expect } from "vitest";
import { makeRng, hashStr, todaySeed, dayIndex } from "~/utils/rng";

describe("makeRng — determinism", () => {
  it("same seed yields the same stream", () => {
    const a = makeRng("hello");
    const b = makeRng("hello");
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = Array.from({ length: 10 }, makeRng("seed-A").next);
    const b = Array.from({ length: 10 }, makeRng("seed-B").next);
    expect(a).not.toEqual(b);
  });

  it("numeric and string seeds are both accepted and deterministic", () => {
    expect(Array.from({ length: 5 }, makeRng(42).next)).toEqual(
      Array.from({ length: 5 }, makeRng(42).next),
    );
  });
});

describe("makeRng — ranges", () => {
  it("next() stays in [0, 1)", () => {
    const r = makeRng("range");
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(min, max) is inclusive on both ends and never out of range", () => {
    const r = makeRng("int");
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 5000; i++) {
      const v = r.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      if (v === 1) sawMin = true;
      if (v === 6) sawMax = true;
    }
    expect(sawMin && sawMax).toBe(true);
  });

  it("float(min, max) stays within [min, max)", () => {
    const r = makeRng("float");
    for (let i = 0; i < 1000; i++) {
      const v = r.float(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
    }
  });

  it("bool(p) respects probability bounds at the extremes", () => {
    const r = makeRng("bool");
    for (let i = 0; i < 100; i++) {
      expect(r.bool(0)).toBe(false);
      expect(r.bool(1)).toBe(true);
    }
  });
});

describe("makeRng — pick / shuffle", () => {
  it("pick returns an element from the array", () => {
    const r = makeRng("pick");
    const arr = ["a", "b", "c", "d"];
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
  });

  it("shuffle is an in-place permutation (no loss, no duplication)", () => {
    const r = makeRng("shuffle");
    const original = Array.from({ length: 50 }, (_, i) => i);
    const arr = original.slice();
    const out = r.shuffle(arr);
    expect(out).toBe(arr); // same reference, in-place
    expect([...arr].sort((x, y) => x - y)).toEqual(original);
  });

  it("shuffle with the same seed is reproducible", () => {
    const make = () => makeRng("same").shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(make()).toEqual(make());
  });
});

describe("seed helpers", () => {
  it("hashStr is a stable unsigned 32-bit integer", () => {
    const h = hashStr("playground");
    expect(h).toBe(hashStr("playground"));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it("todaySeed formats a local date as YYYY-MM-DD", () => {
    expect(todaySeed(new Date(2026, 5, 3))).toBe("2026-06-03");
    expect(todaySeed(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("dayIndex increments by exactly 1 per calendar day", () => {
    const d1 = dayIndex(new Date(2026, 5, 3));
    const d2 = dayIndex(new Date(2026, 5, 4));
    expect(d2 - d1).toBe(1);
  });
});
