import { LayoutAnalyzerRegistry } from "./LayoutAnalyzerRegistry";
import type { LayoutAnalyzer } from "./types";

describe("LayoutAnalyzerRegistry", () => {
  it("aggregates registered analysis results and can filter dimensions", async () => {
    const registry = new LayoutAnalyzerRegistry();
    const analyzer: LayoutAnalyzer = {
      id: "hierarchy", dimensions: ["visual-hierarchy"],
      analyze: async () => ({ findings: [{ dimension: "visual-hierarchy", message: "Check headline" }], scores: { "visual-hierarchy": 0.8 } }),
    };
    registry.register(analyzer);
    const result = await registry.analyze({ document: {} as never }, ["visual-hierarchy"]);
    expect(result.findings).toHaveLength(1);
    expect(result.scores?.["visual-hierarchy"]).toBe(0.8);
    expect((await registry.analyze({ document: {} as never }, ["alignment"])).findings).toHaveLength(0);
  });
});
