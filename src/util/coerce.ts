/** Live SDK numeric properties may be bigint at runtime despite TS types. */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Scene time signatures are often 0 when inherited from the song — treat as unset. */
export function resolveTimeSignature(scene: {
  signatureNumerator?: unknown;
  signatureDenominator?: unknown;
} | undefined): { numerator: number; denominator: number } {
  const numerator = toNumber(scene?.signatureNumerator, 4);
  const denominator = toNumber(scene?.signatureDenominator, 4);
  return {
    numerator: numerator > 0 ? numerator : 4,
    denominator: denominator > 0 ? denominator : 4,
  };
}
