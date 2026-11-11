import type { Backup, Entry, Section } from "../../src/model/types";
export const now = "2026-01-31T23:59:00.000Z";
export function entry(
  sectionId = "addresses",
  fields: Record<string, string> = {
    street: "14 Example Lane",
    city: "Exampleville",
  },
  from = "2021-02",
  to: string | null = "2026-01",
): Entry {
  return {
    id: crypto.randomUUID(),
    sectionId,
    fields,
    ...(["addresses", "work", "providers", "medicines"].includes(sectionId)
      ? { period: { from, to, current: false } }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}
export function backup(entries: Entry[] = []): Backup {
  return {
    schemaVersion: 1,
    exportedAt: now,
    sections: [],
    entries,
    history: [],
    profiles: [],
  };
}
export function custom(): Section {
  return {
    id: `custom-${crypto.randomUUID()}`,
    name: "Example form",
    description: "Fictional fixture",
    dated: false,
    custom: true,
    fields: [{ id: "notes", label: "Notes", kind: "custom" }],
  };
}
export const ssn = () => ["123", "45", "6789"].join("-");
export const card = () => ["4111", "1111", "1111", "1111"].join(" ");
