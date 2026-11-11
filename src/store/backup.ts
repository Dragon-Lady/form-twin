import type { Database } from "./db";
import { snapshot } from "./db";
import { parseBackup, serializeBackup } from "../model/schema";
import { DataError } from "../model/guards";
export async function exportBackup(
  db: Database,
  now = new Date().toISOString(),
): Promise<string> {
  return serializeBackup(await snapshot(db), now);
}
/** Read/parse/migrate/validate every record before this transaction exists. */
export async function importBackup(
  db: Database,
  raw: string,
  beforePut?: (store: string, index: number) => void,
): Promise<void> {
  const data = parseBackup(raw);
  const tx = db.transaction(
    ["entries", "history", "sections", "profiles", "meta"],
    "readwrite",
  );
  const requests: Promise<unknown>[] = [];
  try {
    for (const store of tx.objectStoreNames)
      requests.push(tx.objectStore(store).clear());
    let index = 0;
    for (const entry of data.entries) {
      beforePut?.("entries", index++);
      requests.push(tx.objectStore("entries").put(entry));
    }
    for (const version of data.history) {
      beforePut?.("history", index++);
      requests.push(tx.objectStore("history").put(version));
    }
    for (const section of data.sections) {
      beforePut?.("sections", index++);
      requests.push(tx.objectStore("sections").put(section));
    }
    for (const profile of data.profiles) {
      beforePut?.("profiles", index++);
      requests.push(tx.objectStore("profiles").put(profile));
    }
    beforePut?.("meta", index);
    requests.push(
      tx.objectStore("meta").put({ id: "last-import", value: data.exportedAt }),
    );
    // Only IndexedDB request promises and tx.done are awaited inside the transaction.
    await Promise.all([...requests, tx.done]);
  } catch {
    try {
      tx.abort();
    } catch {}
    await Promise.allSettled([...requests, tx.done]);
    throw new DataError("The import could not be saved. Nothing was changed.");
  }
}
