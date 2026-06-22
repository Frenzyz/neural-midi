import { describe, expect, it } from "vitest";
import { resolveTimeSignature, toNumber } from "./coerce.js";

describe("toNumber", () => {
  it("converts bigint", () => {
    expect(toNumber(4n)).toBe(4);
  });

  it("returns fallback for invalid values", () => {
    expect(toNumber(undefined, 4)).toBe(4);
    expect(toNumber("nope", 8)).toBe(8);
  });
});

describe("resolveTimeSignature", () => {
  it("defaults when scene is missing", () => {
    expect(resolveTimeSignature(undefined)).toEqual({ numerator: 4, denominator: 4 });
  });

  it("defaults when Live returns 0 (inherited signature)", () => {
    expect(resolveTimeSignature({ signatureNumerator: 0n, signatureDenominator: 0n })).toEqual({
      numerator: 4,
      denominator: 4,
    });
  });
});
