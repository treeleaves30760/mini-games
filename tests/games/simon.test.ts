import { describe, it, expect } from "vitest";
import {
  buildSimonSequence,
  checkPress,
  PAD_COUNT,
  SEQ_LEN,
} from "~/games/simon";
import { makeRng } from "~/utils/rng";

// ---- buildSimonSequence -------------------------------------------------------

describe("buildSimonSequence", () => {
  it("returns a sequence of the requested length", () => {
    const seq = buildSimonSequence(makeRng("test"), 10);
    expect(seq).toHaveLength(10);
  });

  it("defaults to SEQ_LEN (30) when no length is passed", () => {
    const seq = buildSimonSequence(makeRng("default"));
    expect(seq).toHaveLength(SEQ_LEN);
  });

  it("every element is a valid pad ID in [0, PAD_COUNT-1]", () => {
    const seq = buildSimonSequence(makeRng("valid"), 50);
    for (const id of seq) {
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(PAD_COUNT - 1);
    }
  });

  it("is deterministic: same seed always produces the same sequence", () => {
    const a = buildSimonSequence(makeRng("seed-42"));
    const b = buildSimonSequence(makeRng("seed-42"));
    expect(a).toEqual(b);
  });

  it("different seeds produce different sequences (probabilistic sanity check)", () => {
    const a = buildSimonSequence(makeRng("seed-A"));
    const b = buildSimonSequence(makeRng("seed-B"));
    // With 30 independent draws from 4 values, P(identical) ≈ (1/4)^30 ≈ 0
    expect(a).not.toEqual(b);
  });

  it("extends by exactly one element per round: round N sequence is prefix of round N+1", () => {
    // The component pre-builds the full sequence; round r uses sequence[0..r-1].
    // Verify the first r elements of a length-(r+1) sequence equal a length-r sequence
    // drawn from the same starting RNG state.
    const rng1 = makeRng("prefix-check");
    const rng2 = makeRng("prefix-check");
    const seqLong = buildSimonSequence(rng1, 5);
    const seqShort = buildSimonSequence(rng2, 4);
    expect(seqLong.slice(0, 4)).toEqual(seqShort);
  });
});

// ---- checkPress — wrong press -----------------------------------------------

describe("checkPress — wrong press", () => {
  it("returns 'wrong' when the pressed pad does not match the expected position", () => {
    // sequence[0] = whatever the first element is; press something different
    const seq = buildSimonSequence(makeRng("wrong-test"), 5);
    const wrongPad = (seq[0] + 1) % PAD_COUNT; // guaranteed ≠ seq[0]
    expect(checkPress(seq, 1, 0, wrongPad)).toEqual({ verdict: "wrong" });
  });

  it("returns 'wrong' mid-sequence when a later press is incorrect", () => {
    const seq = buildSimonSequence(makeRng("mid-wrong"), 5);
    // Round 3, player got first two right, now presses wrong on index 2
    const wrongPad = (seq[2] + 1) % PAD_COUNT;
    expect(checkPress(seq, 3, 2, wrongPad)).toEqual({ verdict: "wrong" });
  });
});

// ---- checkPress — correct partial (in progress) ------------------------------

describe("checkPress — progress (correct but not last press of round)", () => {
  it("returns 'progress' for first of two correct presses in round 2", () => {
    const seq = buildSimonSequence(makeRng("progress-test"), 5);
    // Round 2: player must press seq[0] then seq[1].
    // First press (inputIndex=0) → progress
    expect(checkPress(seq, 2, 0, seq[0])).toEqual({ verdict: "progress" });
  });

  it("returns 'progress' when partway through a longer round", () => {
    const seq = buildSimonSequence(makeRng("progress-mid"), 10);
    // Round 5, inputIndex=3 (4th press), seq[3] is correct but not the 5th press
    expect(checkPress(seq, 5, 3, seq[3])).toEqual({ verdict: "progress" });
  });
});

// ---- checkPress — round complete ---------------------------------------------

describe("checkPress — round-complete", () => {
  it("returns 'round-complete' when the single press of round 1 is correct", () => {
    const seq = buildSimonSequence(makeRng("round1"), 5);
    expect(checkPress(seq, 1, 0, seq[0])).toEqual({ verdict: "round-complete" });
  });

  it("returns 'round-complete' on the final correct press of a multi-press round", () => {
    const seq = buildSimonSequence(makeRng("round3"), 5);
    // Round 3: presses at indices 0, 1, 2.  Index 2 is the last one.
    expect(checkPress(seq, 3, 2, seq[2])).toEqual({ verdict: "round-complete" });
  });

  it("does NOT return round-complete on a non-final correct press", () => {
    const seq = buildSimonSequence(makeRng("not-final"), 5);
    // Round 4, inputIndex=2 — correct press but not the last (index 3 remains)
    const result = checkPress(seq, 4, 2, seq[2]);
    expect(result.verdict).not.toBe("round-complete");
    expect(result.verdict).toBe("progress");
  });
});

// ---- end-to-end simulation: full round --------------------------------------

describe("full-round simulation", () => {
  it("simulating all presses of round N produces the expected sequence of verdicts", () => {
    const seq = buildSimonSequence(makeRng("sim-seed"), SEQ_LEN);
    const roundLen = 5;
    const verdicts: string[] = [];

    for (let i = 0; i < roundLen; i++) {
      const result = checkPress(seq, roundLen, i, seq[i]);
      verdicts.push(result.verdict);
    }

    // First (roundLen-1) presses should be "progress", last is "round-complete"
    expect(verdicts.slice(0, roundLen - 1)).toEqual(
      Array(roundLen - 1).fill("progress"),
    );
    expect(verdicts[roundLen - 1]).toBe("round-complete");
  });

  it("a single wrong press anywhere causes 'wrong' and subsequent presses are not evaluated", () => {
    const seq = buildSimonSequence(makeRng("fail-sim"), SEQ_LEN);
    const roundLen = 4;
    // Introduce error at index 1
    const wrongPad = (seq[1] + 1) % PAD_COUNT;

    expect(checkPress(seq, roundLen, 0, seq[0])).toEqual({ verdict: "progress" });
    expect(checkPress(seq, roundLen, 1, wrongPad)).toEqual({ verdict: "wrong" });
    // After 'wrong', the component stops — but the function itself is stateless;
    // verify it would still report 'wrong' for a bad press regardless of index
    expect(checkPress(seq, roundLen, 2, wrongPad)).toEqual({ verdict: "wrong" });
  });
});
