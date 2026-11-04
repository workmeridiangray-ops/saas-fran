import { describe, expect, it } from "vitest";
import { color } from "./tokens";
import { contrastRatio, isAcceptableBrand } from "./contrast";

describe("design tokens meet WCAG AA", () => {
  it("body and muted text on every surface", () => {
    for (const bg of [color.canvas, color.surface, color.sunken]) {
      expect(contrastRatio(color.ink, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color.muted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("brand as text, and white text on brand", () => {
    expect(contrastRatio(color.brand, color.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#FFFFFF", color.brand)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color.brand, color.brandSoft)).toBeGreaterThanOrEqual(4.5);
  });
  it("every status label pair", () => {
    for (const [name, p] of Object.entries(color.status)) {
      expect(contrastRatio(p.fg, p.bg), name).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("focus ring is visible against page and surface (3:1)", () => {
    expect(contrastRatio(color.focus, color.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color.focus, color.surface)).toBeGreaterThanOrEqual(3);
  });
  it("rejects a company brand colour that is too light", () => {
    expect(isAcceptableBrand("#1E3A8A")).toBe(true);
    expect(isAcceptableBrand("#F5D000")).toBe(false);
  });
});
