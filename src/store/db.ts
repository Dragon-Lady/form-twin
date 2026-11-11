import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type {
  Entry,
  History,
  Profile,
  Section,
  Snapshot,
} from "../model/types";
import {
  validateEntry,
  validateProfile,
  validateSection,
} from "../model/schema";
import { DataError } from "../model/guards";
export interface TwinDB extends DBSchema {
  entries: { key: string; value: Entry };
  history: { key: string; value: History; indexes: { "by-entry": string } };
  sections: { key: string; value: Section };
  profiles: { key: string; value: Profile };
  meta: { key: string; value: { id: string; value: string } };
}
export type Database = IDBPDatabase<TwinDB>;
export async function openNotebook(name = "form-twin"): Promise<Database> {
  let database: Database;
  database = await openDB<TwinDB>(name, 1, {
    upgrade(db) {
      db.createObjectStore("entries", { keyPath: "id" });
      db.createObjectStore("history", { keyPath: "id" }).createIndex(
        "by-entry",
        "entryId",
      );
      db.createObjectStore("sections", { keyPath: "id" });
      db.createObjectStore("profiles", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "id" });
    },
    blocking() {
      database.close();
    },
  });
  return database;
}
export async function snapshot(db: Database): Promise<Snapshot> {
  const tx = db.transaction(
    ["entries", "history", "sections", "profiles"],
    "readonly",
  );
  const [entries, history, sections, profiles] = await Promise.all([
    tx.objectStore("entries").getAll(),
    tx.objectStore("history").getAll(),
    tx.objectStore("sections").getAll(),
    tx.objectStore("profiles").getAll(),
  ]);
  await tx.done;
  return { entries, history, sections, profiles };
}
export async function saveEntry(
  db: Database,
  raw: Entry,
  expected?: string,
): Promise<void> {
  const sections = await db.getAll("sections");
  const entry = validateEntry(raw, sections);
  const historyId = crypto.randomUUID(),
    savedAt = entry.updatedAt;
  const tx = db.transaction(["entries", "history"], "readwrite");
  try {
    const old = await tx.objectStore("entries").get(entry.id);
    if (
      (expected !== undefined && old?.updatedAt !== expected) ||
      (expected === undefined && old)
    )
      throw new DataError(
        "This entry changed in another tab. Reopen it before saving.",
      );
    if (old)
      await tx
        .objectStore("history")
        .put({ id: historyId, entryId: old.id, entry: old, savedAt });
    await tx.objectStore("entries").put(entry);
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
export async function removeEntry(
  db: Database,
  id: string,
  deleteHistory: boolean,
): Promise<void> {
  const tx = db.transaction(["entries", "history"], "readwrite");
  await tx.objectStore("entries").delete(id);
  if (deleteHistory) {
    const keys = await tx
      .objectStore("history")
      .index("by-entry")
      .getAllKeys(id);
    for (const key of keys) await tx.objectStore("history").delete(key);
  }
  await tx.done;
}
export async function saveSection(db: Database, raw: Section): Promise<void> {
  await db.put("sections", validateSection(raw));
}
export async function saveProfile(db: Database, raw: Profile): Promise<void> {
  await db.put("profiles", validateProfile(raw, await db.getAll("sections")));
}
export async function deleteProfile(db: Database, id: string): Promise<void> {
  await db.delete("profiles", id);
}
export async function eraseNotebook(db: Database): Promise<void> {
  const tx = db.transaction(
    ["entries", "history", "sections", "profiles", "meta"],
    "readwrite",
  );
  for (const store of tx.objectStoreNames) void tx.objectStore(store).clear();
  await tx.done;
}
