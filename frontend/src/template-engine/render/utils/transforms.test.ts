import { applySnapDeltaToPositions } from "./transforms";

describe("transient snap translation", () => {
  it("applies one SnapResult delta to every selected draft node without mutating inputs", () => {
    const positions = [{ x: 18, y: 29 }, { x: 48, y: 59 }];
    const snapped = applySnapDeltaToPositions(positions, { x: -3, y: 1.5 });
    expect(snapped).toEqual([{ x: 15, y: 30.5 }, { x: 45, y: 60.5 }]);
    expect(positions).toEqual([{ x: 18, y: 29 }, { x: 48, y: 59 }]);
  });
});
