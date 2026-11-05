import { BrandEngine, resolveBrandToken } from "./BrandEngine";
import type { BrandKit } from "./types";

describe("BrandEngine", () => {
  const brand: BrandKit = {
    id: "sample", name: "Sample", logo: "/logo.svg", fonts: { heading: "Inter" },
    colors: { primary: "#123456" }, instagramHandle: "@sample",
  };

  it("resolves brand tokens recursively without mutating legacy data", () => {
    const engine = new BrandEngine();
    const source = { color: "$brand.colors.primary", font: "${font.heading}", label: "$instagramHandle" };
    const result = engine.resolve(source, brand);
    expect(result.value).toEqual({ color: "#123456", font: "Inter", label: "@sample" });
    expect(result.unresolvedTokens).toEqual([]);
    expect(source.color).toBe("$brand.colors.primary");
  });

  it("reports unresolved references and exposes render tokens", () => {
    const engine = new BrandEngine();
    expect(engine.resolveTokens({ value: "$missing" }, brand)).toEqual({ value: "$missing" });
    expect(engine.resolve({ value: "$missing" }, brand).unresolvedTokens).toEqual(["$missing"]);
    expect(resolveBrandToken("$logo", brand)).toBe("/logo.svg");
    expect(engine.renderTokens(brand)).toMatchObject({ primary: "#123456", "font.heading": "Inter", logoUrl: "/logo.svg" });
  });
});
