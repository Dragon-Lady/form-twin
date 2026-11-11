import { allSections, builtins } from "./types";
import type {
  Backup,
  Entry,
  Field,
  History,
  Profile,
  Section,
  Snapshot,
  WindowRule,
} from "./types";
import { DataError, guard } from "./guards";
import { monthIndex, windowBounds } from "./months";
export const SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (
  message = "The backup contains invalid or unexpected data.",
): never => {
  throw new DataError(message);
};
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  if (Object.keys(value).some((k) => !keys.includes(k))) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 2000): string {
  if (typeof value !== "string" || value.length > max) return fail();
  return value;
}
function id(value: unknown): string {
  const s = text(value, 64);
  if (!uuid.test(s)) return fail();
  return s;
}
function stamp(value: unknown): string {
  const s = text(value, 30);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) ||
    !Number.isFinite(Date.parse(s))
  )
    return fail();
  return s;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") return fail();
  return value;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail();
  return value;
}
function unique<T>(values: T[], key: (v: T) => string): T[] {
  if (new Set(values.map(key)).size !== values.length)
    fail("The backup has duplicate record identifiers.");
  return values;
}
function date(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    monthIndex(value.slice(0, 7));
  } catch {
    return false;
  }
  const y = +value.slice(0, 4),
    m = +value.slice(5, 7),
    d = +value.slice(8);
  return (
    d > 0 &&
    d <=
      [
        31,
        y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
      ][m - 1]
  );
}
export function validateSection(raw: unknown): Section {
  const s = object(raw, [
    "id",
    "name",
    "description",
    "dated",
    "fields",
    "custom",
  ]);
  const sectionId = text(s.id, 80);
  if (!sectionId.startsWith("custom-") || !uuid.test(sectionId.slice(7)))
    fail();
  const name = text(s.name, 60).trim(),
    description = text(s.description, 160);
  if (!name) fail("Give the custom section a name.");
  guard(name, "custom", "Custom section", "Section name");
  guard(description, "custom", "Custom section", "Description");
  if (s.custom !== true) fail();
  const fields = unique(
    list(s.fields, 12).map((raw) => {
      const f = object(raw, ["id", "label", "kind", "required"]),
        fieldId = text(f.id, 64),
        label = text(f.label, 60).trim();
      if (
        !/^[a-z][a-z0-9_-]{0,63}$/.test(fieldId) ||
        ["constructor", "prototype", "__proto__"].includes(fieldId) ||
        !label ||
        f.kind !== "custom"
      )
        fail();
      guard(label, "custom", "Custom section", "Field label");
      return {
        id: fieldId,
        label,
        kind: "custom",
        required: f.required === undefined ? false : bool(f.required),
      } as Field;
    }),
    (f) => f.id,
  );
  if (!fields.length) fail("Add at least one field.");
  return {
    id: sectionId,
    name,
    description,
    dated: bool(s.dated),
    fields,
    custom: true,
  };
}
export function validateEntry(raw: unknown, custom: Section[]): Entry {
  const value = object(raw, [
    "id",
    "sectionId",
    "fields",
    "period",
    "createdAt",
    "updatedAt",
  ]);
  const section = allSections(custom).find((s) => s.id === value.sectionId);
  if (!section) fail("An entry refers to an unknown section.");
  // Validate custom labels before including them in a refusal message.
  const def = section!.custom ? validateSection(section) : section!,
    context = def.name;
  const values = object(
    value.fields,
    def.fields.map((f) => f.id),
  );
  const fields: Record<string, string> = {};
  for (const field of def.fields) {
    const v =
        values[field.id] === undefined ? "" : text(values[field.id]).trim(),
      label = field.label;
    guard(v, def.custom ? "custom" : field.kind, context, label);
    if (field.required && !v)
      fail(`${context} / ${label}: please fill in this field.`);
    if (v && field.kind === "date" && !date(v))
      fail(`${context} / ${label}: use a valid date.`);
    if (
      v &&
      field.kind === "number" &&
      (!/^\d{1,3}(\.\d{1,2})?$/.test(v) || +v > 168)
    )
      fail(`${context} / ${label}: enter a number from 0 to 168.`);
    if (v && field.kind === "phone" && !/^[\d+(). xext-]{3,40}$/i.test(v))
      fail(`${context} / ${label}: use a phone number, not other details.`);
    if (v && field.kind === "zip" && !/^[a-z\d -]{2,12}$/i.test(v))
      fail(`${context} / ${label}: use a postal code, not other details.`);
    fields[field.id] = v;
  }
  let period: Entry["period"];
  if (value.period !== undefined) {
    if (!def.dated) fail("This section does not use a date range.");
    const p = object(value.period, ["from", "to", "current"]);
    const from = text(p.from, 7);
    monthIndex(from);
    const to = p.to === null ? null : text(p.to, 7);
    if (to) monthIndex(to);
    const current = bool(p.current);
    if ((current && to) || (to && monthIndex(to) < monthIndex(from)))
      fail(
        "The end month must follow the start month. Use either an end month or current.",
      );
    period = { from, to, current };
  }
  if (def.dated && !period) fail(`${context}: choose a starting month.`);
  const createdAt = stamp(value.createdAt),
    updatedAt = stamp(value.updatedAt);
  if (updatedAt < createdAt) fail();
  return {
    id: id(value.id),
    sectionId: def.id,
    fields,
    ...(period ? { period } : {}),
    createdAt,
    updatedAt,
  };
}
export function validateRule(raw: unknown): WindowRule {
  const v = object(raw, ["kind", "months", "from", "to"]);
  let rule: WindowRule;
  if (v.kind === "last") {
    if (
      typeof v.months !== "number" ||
      v.from !== undefined ||
      v.to !== undefined
    )
      fail();
    rule = { kind: "last", months: v.months as number };
  } else if (v.kind === "since") {
    if (v.months !== undefined || v.to !== undefined) fail();
    rule = { kind: "since", from: text(v.from, 7) };
  } else if (v.kind === "custom") {
    if (v.months !== undefined) fail();
    rule = { kind: "custom", from: text(v.from, 7), to: text(v.to, 7) };
  } else return fail();
  // Fixed clock validates shape only; future 'since' windows are checked at use time.
  if (rule.kind === "since") monthIndex(rule.from);
  else windowBounds(rule, () => "2199-12-31");
  return rule;
}
export function validateProfile(raw: unknown, custom: Section[]): Profile {
  const v = object(raw, ["id", "name", "requirements"]);
  const name = text(v.name, 80).trim();
  if (!name) fail("Give the form profile a name.");
  guard(name, "custom", "Form profiles", "Profile name");
  const requirements = unique(
    list(v.requirements, 50).map((raw) => {
      const r = object(raw, ["sectionId", "window"]),
        section = allSections(custom).find((s) => s.id === r.sectionId);
      if (!section) fail("A profile refers to an unknown section.");
      if (!section!.dated && r.window !== null)
        fail("A non-dated section cannot have a coverage window.");
      return {
        sectionId: section!.id,
        window: r.window === null ? null : validateRule(r.window),
      };
    }),
    (r) => r.sectionId,
  );
  if (!requirements.length)
    fail("Choose at least one section for the profile.");
  return { id: id(v.id), name, requirements };
}
export function validateBackup(raw: unknown): Backup {
  const v = object(raw, [
    "schemaVersion",
    "exportedAt",
    "sections",
    "entries",
    "history",
    "profiles",
  ]);
  if (v.schemaVersion !== 1)
    fail("This backup version is not supported. Nothing was changed.");
  const sections = unique(
    list(v.sections, 30).map(validateSection),
    (s) => s.id,
  );
  const entries = unique(
    list(v.entries, 5000).map((e) => validateEntry(e, sections)),
    (e) => e.id,
  );
  const history = unique(
    list(v.history, 20000).map((raw) => {
      const h = object(raw, ["id", "entryId", "savedAt", "entry"]);
      const entry = validateEntry(h.entry, sections),
        entryId = id(h.entryId);
      if (entryId !== entry.id)
        fail("A history version refers to a different entry.");
      const savedAt = stamp(h.savedAt);
      if (savedAt < entry.updatedAt) fail();
      return { id: id(h.id), entryId, savedAt, entry } as History;
    }),
    (h) => h.id,
  );
  const profiles = unique(
    list(v.profiles, 50).map((p) => validateProfile(p, sections)),
    (p) => p.id,
  );
  return {
    schemaVersion: 1,
    exportedAt: stamp(v.exportedAt),
    sections,
    entries,
    history,
    profiles,
  };
}
export function parseBackup(raw: string): Backup {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES)
    fail("This backup is too large. The limit is 5 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("This file is not valid JSON. Nothing was changed.");
  }
  // Version 0 used the same record shapes without a history collection.
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>).schemaVersion === 0
  ) {
    const old = object(parsed, [
      "schemaVersion",
      "exportedAt",
      "sections",
      "entries",
      "profiles",
    ]);
    parsed = { ...old, schemaVersion: 1, history: [] };
  }
  return validateBackup(parsed);
}
export function serializeBackup(snapshot: Snapshot, now: string): string {
  return JSON.stringify(
    validateBackup({ schemaVersion: 1, exportedAt: now, ...snapshot }),
    null,
    2,
  );
}
