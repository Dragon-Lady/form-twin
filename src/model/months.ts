import type { Clock, WindowRule } from "./types";
export function monthIndex(value: string): number {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
    +value.slice(0, 4) < 1900 ||
    +value.slice(0, 4) > 2199
  )
    throw new Error("Use a month and a four-digit year from 1900 to 2199.");
  return +value.slice(0, 4) * 12 + +value.slice(5) - 1;
}
export function monthString(value: number): string {
  return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
}
const names = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export function monthLabel(value: string): string {
  const index = monthIndex(value);
  return `${names[index % 12]} ${Math.floor(index / 12)}`;
}
export function rangeLabel(from: string, to: string): string {
  return from === to
    ? monthLabel(from)
    : `${monthLabel(from)} to ${monthLabel(to)}`;
}
export function windowBounds(rule: WindowRule, clock: Clock): [number, number] {
  const today = monthIndex(clock().slice(0, 7));
  if (rule.kind === "last") {
    if (!Number.isInteger(rule.months) || rule.months < 1 || rule.months > 1200)
      throw new Error("Choose a window from 1 to 1200 months.");
    const from = today - rule.months + 1;
    monthIndex(monthString(from));
    return [from, today];
  }
  const from = monthIndex(rule.from),
    to = rule.kind === "since" ? today : monthIndex(rule.to);
  if (to < from)
    throw new Error("The end month must be on or after the start month.");
  return [from, to];
}
