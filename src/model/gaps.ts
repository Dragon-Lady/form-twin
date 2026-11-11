import { monthIndex, monthString, rangeLabel, windowBounds } from "./months";
import type { Clock, Entry, WindowRule } from "./types";
export interface GapResult {
  gaps: { from: string; to: string; message: string }[];
  overlaps: { ids: [string, string]; message: string }[];
  missingEnds: string[];
  missingStarts: string[];
}
export function checkGaps(
  entries: Entry[],
  rule: WindowRule,
  clock: Clock,
): GapResult {
  const [start, end] = windowBounds(rule, clock),
    today = monthIndex(clock().slice(0, 7));
  const result: GapResult = {
    gaps: [],
    overlaps: [],
    missingEnds: [],
    missingStarts: [],
  };
  const intervals: { id: string; from: number; to: number }[] = [];
  for (const entry of entries) {
    if (!entry.period) {
      result.missingStarts.push(entry.id);
      continue;
    }
    const from = monthIndex(entry.period.from);
    const to = entry.period.current
      ? today
      : entry.period.to
        ? monthIndex(entry.period.to)
        : from;
    if (!entry.period.to && !entry.period.current)
      result.missingEnds.push(entry.id);
    if (to >= start && from <= end) intervals.push({ id: entry.id, from, to });
  }
  const covered = new Set<number>();
  for (const item of intervals)
    for (let m = Math.max(start, item.from); m <= Math.min(end, item.to); m++)
      covered.add(m);
  let open: number | null = null;
  for (let m = start; m <= end + 1; m++) {
    if (m <= end && !covered.has(m)) {
      if (open === null) open = m;
    } else if (open !== null) {
      const from = monthString(open),
        to = monthString(m - 1);
      result.gaps.push({
        from,
        to,
        message: `Nothing covers ${rangeLabel(from, to)}.`,
      });
      open = null;
    }
  }
  for (let i = 0; i < intervals.length; i++)
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i],
        b = intervals[j],
        left = Math.max(a.from, b.from),
        right = Math.min(a.to, b.to);
      const contained =
        (a.from >= b.from && a.to <= b.to) ||
        (b.from >= a.from && b.to <= a.to);
      if (right >= left && (right - left + 1 >= 2 || contained))
        result.overlaps.push({
          ids: [a.id, b.id],
          message: `Two entries overlap during ${rangeLabel(monthString(left), monthString(right))}.`,
        });
    }
  return result;
}
