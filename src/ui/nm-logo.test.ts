import { describe, expect, it } from "vitest";
import { NM_LOGO_MARKERS, NM_LOGO_SVG } from "./nm-logo.js";

describe("nm-logo", () => {
  it("contains gradient, border, ring, and four arcs (no text)", () => {
    for (const marker of NM_LOGO_MARKERS) {
      expect(NM_LOGO_SVG).toContain(marker);
    }
    expect(NM_LOGO_SVG).not.toContain("<text");
    expect(NM_LOGO_SVG).not.toContain(">NM<");
    expect(NM_LOGO_SVG.match(/<path d="/g)?.length).toBe(4);
    expect(NM_LOGO_SVG).toContain('viewBox="0 0 88 88"');
  });
});
