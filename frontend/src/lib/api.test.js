import { can, formatIST, formatISTScheduleAction, istDateParts, istInputToUTC, utcToISTInput } from "./api";

describe("IST date and time helpers", () => {
  test("converts 9:00 AM IST to the expected UTC timestamp", () => {
    expect(istInputToUTC("2026-10-22T09:00")).toBe("2026-10-22T03:30:00.000Z");
  });

  describe("media deletion permissions", () => {
    test("allows admins and managers but not designers or viewers", () => {
      expect(can({ role: "admin" }, "deleteMedia")).toBe(true);
      expect(can({ role: "manager" }, "deleteMedia")).toBe(true);
      expect(can({ role: "designer" }, "deleteMedia")).toBe(false);
      expect(can({ role: "viewer" }, "deleteMedia")).toBe(false);
    });
  });

  test("displays a UTC timestamp as 9:00 AM IST", () => {
    expect(formatIST("2026-10-22T03:30:00Z")).toBe("22 Oct 2026, 09:00 AM IST");
  });

  test("round-trips UTC schedule values into the IST date-time input", () => {
    const utc = istInputToUTC("2026-10-22T09:00");
    expect(utcToISTInput(utc)).toBe("2026-10-22T09:00");
  });

  test("uses the IST calendar day around UTC month boundaries", () => {
    expect(istDateParts("2026-10-31T20:00:00Z")).toEqual({ year: 2026, month: 11, day: 1 });
  });

  test("renders historical schedule actions without exposing UTC", () => {
    expect(formatISTScheduleAction("Scheduled for 2026-10-22 03:30 UTC")).toBe("Scheduled for 22 Oct 2026, 09:00 AM IST");
  });
});
