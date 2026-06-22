import { describe, expect, it } from "vitest";
import { NM_LOGO_MARKERS, NM_LOGO_SVG } from "./nm-logo.js";

describe("nm-logo", () => {
  it("contains radial gradient, border, ring, arcs, and NM text", () => {
    for (const marker of NM_LOGO_MARKERS) {
      expect(NM_LOGO_SVG).toContain(marker);
    }
    expect(NM_LOGO_SVG.match(/<path d="/g)?.length).toBeGreaterThanOrEqual(3);
    expect(NM_LOGO_SVG).toContain('viewBox="0 0 88 88"');
  });
});
