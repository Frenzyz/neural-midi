import { describe, expect, it } from "vitest";
import { NM_BRAND_MARKERS, NM_BRAND_SVG } from "./brand-logo.js";

describe("brand-logo", () => {
  it("renders geometric NM monogram with M horizontal bars", () => {
    for (const marker of NM_BRAND_MARKERS) {
      expect(NM_BRAND_SVG).toContain(marker);
    }
    expect(NM_BRAND_SVG).not.toContain("<text");
    expect(NM_BRAND_SVG).not.toMatch(/<path\b/);
    expect(NM_BRAND_SVG.match(/<rect/g)?.length).toBe(6);
    expect(NM_BRAND_SVG).toContain('fill="#e8e6f0"');
    expect(NM_BRAND_SVG).toContain('transform="rotate(76');
  });
});
