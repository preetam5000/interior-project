import { DEFAULT_AUTOMATION_STAGES } from "./types";

describe("automation architecture", () => {
  it("declares the future workflow stages in the requested order", () => {
    expect(DEFAULT_AUTOMATION_STAGES.map((stage) => stage.id)).toEqual([
      "google-drive", "ai-analysis", "image-enhancement", "template-selection", "brand-kit",
      "caption-generation", "approval", "instagram-publish", "analytics",
    ]);
  });
});
