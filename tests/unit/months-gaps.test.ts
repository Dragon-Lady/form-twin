import { describe, it, expect } from "vitest";
import {
  monthIndex,
  monthString,
  monthLabel,
  windowBounds,
} from "../../src/model/months";
import { checkGaps } from "../../src/model/gaps";
import { entry } from "./fixtures";
const clock = () => "2026-01-31T23:59:00-06:00";
const window = { kind: "custom", from: "2022-01", to: "2022-12" } as const;
describe("month math and coverage", () => {
  it.each(["1900-01", "2000-02", "2024-02", "2199-12"])("round trips %s", (m) =>
    expect(monthString(monthIndex(m))).toBe(m),
  );
  it.each(["2022-00", "2022-13", "22-01", "2022-1", "1899-12"])(
    "rejects malformed month %s",
    (m) => expect(() => monthIndex(m)).toThrow(),
  );
  it("labels leap-year February without daily calculations", () =>
    expect(monthLabel("2024-02")).toBe("Feb 2024"));
  it("pins the last day at 11:59 PM using an injected clock", () =>
    expect(
      windowBounds({ kind: "last", months: 60 }, clock).map(monthString),
    ).toEqual(["2021-02", "2026-01"]));
  it("uses inclusive months in the since window", () =>
    expect(
      windowBounds({ kind: "since", from: "2025-12" }, clock).map(monthString),
    ).toEqual(["2025-12", "2026-01"]));
  it("covers a full window even when an entry begins earlier", () => {
    const r = checkGaps(
      [entry("addresses", undefined, "2020-01", "2023-04")],
      window,
      clock,
    );
    expect(r.gaps).toEqual([]);
    expect(r.overlaps).toEqual([]);
  });
  it("finds exactly one missing month", () =>
    expect(
      checkGaps(
        [
          entry("addresses", undefined, "2022-01", "2022-03"),
          entry("addresses", undefined, "2022-05", "2022-12"),
        ],
        window,
        clock,
      ).gaps,
    ).toEqual([
      { from: "2022-04", to: "2022-04", message: "Nothing covers Apr 2022." },
    ]));
  it("accepts one shared move month as continuous", () => {
    const r = checkGaps(
      [
        entry("addresses", undefined, "2022-01", "2022-03"),
        entry("addresses", undefined, "2022-03", "2022-12"),
      ],
      window,
      clock,
    );
    expect(r.gaps).toEqual([]);
    expect(r.overlaps).toEqual([]);
  });
  it("flags two shared months", () =>
    expect(
      checkGaps(
        [
          entry("addresses", undefined, "2022-01", "2022-04"),
          entry("addresses", undefined, "2022-03", "2022-12"),
        ],
        window,
        clock,
      ).overlaps,
    ).toHaveLength(1));
  it("flags a fully contained single-month entry", () =>
    expect(
      checkGaps(
        [
          entry("addresses", undefined, "2022-01", "2022-12"),
          entry("addresses", undefined, "2022-03", "2022-03"),
        ],
        window,
        clock,
      ).overlaps,
    ).toHaveLength(1));
  it("current ends at the injected month", () => {
    const e = entry("addresses", undefined, "2021-01", null);
    e.period!.current = true;
    expect(checkGaps([e], { kind: "last", months: 60 }, clock).gaps).toEqual(
      [],
    );
  });
  it("does not treat a missing end as current", () => {
    const e = entry("addresses", undefined, "2022-01", null),
      r = checkGaps([e], window, clock);
    expect(r.missingEnds).toEqual([e.id]);
    expect(r.gaps[0].from).toBe("2022-02");
  });
  it("does not let an out-of-window entry fill any months", () =>
    expect(
      checkGaps(
        [entry("addresses", undefined, "2021-01", "2021-12")],
        window,
        clock,
      ).gaps[0],
    ).toMatchObject({ from: "2022-01", to: "2022-12" }));
  it("rejects inverted and invalid windows", () => {
    expect(() =>
      windowBounds({ kind: "custom", from: "2024-01", to: "2023-12" }, clock),
    ).toThrow();
    expect(() => windowBounds({ kind: "last", months: 0 }, clock)).toThrow();
  });
});
