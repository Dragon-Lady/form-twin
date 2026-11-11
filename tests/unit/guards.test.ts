import { describe, it, expect } from "vitest";
import {
  forbiddenNumber,
  guard,
  knownCardPrefix,
  luhn,
} from "../../src/model/guards";
import { card, cardPastes, ssn } from "./fixtures";
import type { FieldKind } from "../../src/model/types";
describe("field-aware guards", () => {
  it.each([
    ["zip", "55901-1234"],
    ["zip", "559011234"],
    ["member", "123456789"],
    ["group", "123456789"],
    ["phone", "5551234567"],
  ] as [FieldKind, string][])("allows ordinary %s values", (kind, value) =>
    expect(() => guard(value, kind, "Example", "Field")).not.toThrow(),
  );
  it("allows a Luhn-valid 16-digit member or group ID", () => {
    const n = card().replaceAll(" ", "");
    expect(luhn(n)).toBe(true);
    for (const kind of ["member", "group"] as const)
      expect(() => guard(n, kind, "Insurance", "Member ID")).not.toThrow();
  });
  it.each(["text", "custom", "id"] as const)(
    "refuses shaped SSNs in %s",
    (kind) => {
      for (const sep of ["-", " "])
        expect(forbiddenNumber(ssn().replaceAll("-", sep), kind)).toBe("ssn");
    },
  );
  it("bare nine digits are SSN-shaped only in ID fields", () => {
    const n = ssn().replaceAll("-", "");
    expect(forbiddenNumber(n, "id")).toBe("ssn");
    expect(forbiddenNumber(n, "text")).toBeNull();
    expect(forbiddenNumber(n, "custom")).toBeNull();
  });
  it.each(["000", "666", "900", "999"])(
    "does not identify impossible area %s as an SSN",
    (area) =>
      expect(
        forbiddenNumber([area, "45", "6789"].join("-"), "text"),
      ).toBeNull(),
  );
  it("does not identify impossible group or serial", () => {
    expect(forbiddenNumber(["123", "00", "6789"].join("-"), "text")).toBeNull();
    expect(forbiddenNumber(["123", "45", "0000"].join("-"), "text")).toBeNull();
  });
  it("requires exactly four digits in an ID field", () => {
    expect(() => guard("1234", "id", "About me", "ID")).not.toThrow();
    expect(() => guard("12345", "id", "About me", "ID")).toThrow("last four");
  });
  it.each(["text", "custom"] as const)(
    "refuses known-prefix Luhn cards in %s",
    (kind) => expect(forbiddenNumber(`Notes ${card()} end`, kind)).toBe("card"),
  );
  it.each(cardPastes())("refuses $name without echoing it", ({ value }) => {
    for (const kind of ["text", "custom"] as const) {
      expect(forbiddenNumber(value, kind)).toBe("card");
      try {
        guard(value, kind, "Example section", "Notes");
        throw new Error("expected refusal");
      } catch (error) {
        expect((error as Error).message).toContain(
          "Example section / Notes: remove the full payment card",
        );
        expect((error as Error).message).not.toContain(value);
        expect((error as Error).message).not.toContain(card());
      }
    }
  });
  it("finds a card after preceding numeric groups", () => {
    expect(forbiddenNumber(`12/28 ${card()} 123`, "text")).toBe("card");
  });
  it("does not cut a card-shaped substring out of a longer digit group", () => {
    const digits = card().replaceAll(" ", "");
    expect(forbiddenNumber(`${digits}0000`, "text")).toBeNull();
    expect(forbiddenNumber(`9${digits}99`, "custom")).toBeNull();
  });
  it.each(["12345-6789", "123456789", "202-555-0100", "+1 202 555 0100"])(
    "allows ordinary postal codes and phones in free text (%s)",
    (value) => {
      expect(forbiddenNumber(value, "text")).toBeNull();
      expect(forbiddenNumber(value, "custom")).toBeNull();
    },
  );
  it("requires both known prefix and checksum", () => {
    expect(forbiddenNumber("8".repeat(16), "text")).toBeNull();
    expect(forbiddenNumber(card().slice(0, -1) + "2", "text")).toBeNull();
  });
  it("recognizes major network boundaries", () => {
    const shapes = [
      ["4", 13],
      ["4", 19],
      ["34", 15],
      ["37", 15],
      ["51", 16],
      ["55", 16],
      ["2221", 16],
      ["2720", 16],
      ["6011", 16],
      ["65", 16],
      ["644", 16],
      ["3528", 16],
      ["3589", 19],
      ["36", 14],
      ["62", 19],
    ] as [string, number][];
    for (const [prefix, length] of shapes)
      expect(knownCardPrefix(prefix.padEnd(length, "0"))).toBe(true);
    expect(knownCardPrefix("2220".padEnd(16, "0"))).toBe(false);
    expect(knownCardPrefix("2721".padEnd(16, "0"))).toBe(false);
  });
  it("never echoes the blocked number", () => {
    try {
      guard(ssn(), "text", "Addresses", "Street");
      throw new Error("expected refusal");
    } catch (error) {
      const text = (error as Error).message;
      expect(text).toContain("Addresses / Street");
      expect(text).not.toContain(ssn());
    }
  });
});
