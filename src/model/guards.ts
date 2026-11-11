import type { FieldKind } from "./types";
export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataError";
  }
}
export function luhn(value: string): boolean {
  let sum = 0,
    twice = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let n = +value[i];
    if (twice) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    twice = !twice;
  }
  return sum % 10 === 0;
}
export function knownCardPrefix(n: string): boolean {
  const len = n.length,
    p2 = +n.slice(0, 2),
    p3 = +n.slice(0, 3),
    p4 = +n.slice(0, 4),
    p6 = +n.slice(0, 6);
  return (
    (n[0] === "4" && [13, 16, 19].includes(len)) ||
    (len === 16 && ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720))) ||
    (len === 15 && (p2 === 34 || p2 === 37)) ||
    (len >= 16 &&
      len <= 19 &&
      (p4 === 6011 ||
        p2 === 65 ||
        (p3 >= 644 && p3 <= 649) ||
        (p6 >= 622126 && p6 <= 622925) ||
        (p4 >= 3528 && p4 <= 3589) ||
        p2 === 62)) ||
    (len === 14 &&
      ((p3 >= 300 && p3 <= 305) ||
        (p6 >= 309500 && p6 <= 309599) ||
        [36, 38, 39].includes(p2)))
  );
}
function plausibleSSN(n: string): boolean {
  const area = +n.slice(0, 3);
  return (
    n.length === 9 &&
    area > 0 &&
    area !== 666 &&
    area < 900 &&
    +n.slice(3, 5) !== 0 &&
    +n.slice(5) !== 0
  );
}
export function forbiddenNumber(
  value: string,
  kind: FieldKind,
): "ssn" | "card" | null {
  if (["zip", "phone", "member", "group", "date", "number"].includes(kind))
    return null;
  for (const match of value.matchAll(/(?<!\d)\d{3}([ -])\d{2}\1\d{4}(?!\d)/g))
    if (plausibleSSN(match[0].replace(/\D/g, ""))) return "ssn";
  if (kind === "id")
    for (const match of value.matchAll(/(?<!\d)\d{9}(?!\d)/g))
      if (plausibleSSN(match[0])) return "ssn";
  if (kind === "text" || kind === "custom")
    for (const match of value.matchAll(/\d+(?:[ -]\d+)*/g)) {
      const groups = match[0].split(/[ -]/);
      // A pasted expiry or CVV may share the run with the card. Check each
      // complete-group window, without slicing inside a longer identifier.
      for (let start = 0; start < groups.length; start++) {
        let digits = "";
        for (let end = start; end < groups.length; end++) {
          if (digits.length + groups[end].length > 19) break;
          digits += groups[end];
          if (digits.length >= 13 && knownCardPrefix(digits) && luhn(digits))
            return "card";
        }
      }
    }
  return null;
}
export function guard(
  value: string,
  kind: FieldKind,
  section: string,
  field: string,
): void {
  // Callers use trusted section/field labels; user-supplied labels use generic contexts.
  const found = forbiddenNumber(value, kind);
  if (found)
    throw new DataError(
      `${section} / ${field}: remove the full ${found === "ssn" ? "Social Security" : "payment card"} number. Keep only the last four digits.`,
    );
  if (kind === "id" && value && !/^\d{4}$/.test(value))
    throw new DataError(
      `${section} / ${field}: enter only the last four digits.`,
    );
}
