import type { Entry, Section } from "../model/types";
import { monthLabel } from "../model/months";
export function periodText(entry: Entry): string {
  return entry.period
    ? `${monthLabel(entry.period.from)} – ${entry.period.current ? "current" : entry.period.to ? monthLabel(entry.period.to) : "end month missing"}`
    : "";
}
export function entryTitle(entry: Entry, section: Section): string {
  return entry.fields[section.fields[0].id] || section.name;
}
export function oneLine(entry: Entry, section: Section): string {
  // Address components use commas; every other section uses semicolons.
  const values = section.fields.map((f) => entry.fields[f.id]).filter(Boolean);
  if (entry.period) values.push(periodText(entry));
  return values.join(section.id === "addresses" ? ", " : "; ");
}
export function labeledEntry(entry: Entry, section: Section): string {
  const rows = section.fields
    .filter((f) => entry.fields[f.id])
    .map((f) => `${f.label}: ${entry.fields[f.id]}`);
  if (entry.period) rows.push(`Dates: ${periodText(entry)}`);
  return rows.join("\n");
}
