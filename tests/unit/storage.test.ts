import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  openNotebook,
  saveEntry,
  snapshot,
  removeEntry,
  saveSection,
  saveProfile,
} from "../../src/store/db";
import type { Database } from "../../src/store/db";
import { exportBackup, importBackup } from "../../src/store/backup";
import {
  parseBackup,
  validateBackup,
  validateEntry,
} from "../../src/model/schema";
import { backup, card, cardPastes, custom, entry, now, ssn } from "./fixtures";
let db: Database;
beforeEach(async () => {
  db = await openNotebook("test-" + crypto.randomUUID());
});
afterEach(() => db.close());
describe("storage and backups", () => {
  it("round trips every collection, including saved history and profiles", async () => {
    const e = entry();
    await saveEntry(db, e);
    const updated = {
      ...e,
      fields: { ...e.fields, street: "20 Example Road" },
      updatedAt: "2026-02-01T12:00:00.000Z",
    };
    await saveEntry(db, updated, e.updatedAt);
    const section = custom();
    await saveSection(db, section);
    await saveProfile(db, {
      id: crypto.randomUUID(),
      name: "Example profile",
      requirements: [
        { sectionId: "addresses", window: { kind: "last", months: 60 } },
      ],
    });
    const before = await snapshot(db),
      raw = await exportBackup(db, now);
    expect(JSON.parse(raw).history).toHaveLength(1);
    await importBackup(db, raw);
    expect(await snapshot(db)).toEqual(before);
  });
  it("rolls back all stores when the final record fails", async () => {
    const old = entry();
    await saveEntry(db, old);
    await db.put("meta", { id: "existing", value: "keep" });
    const before = await snapshot(db);
    const incoming = backup([
      entry(),
      entry("insurance", {
        plan: "Example plan",
        memberId: card().replaceAll(" ", ""),
      }),
    ]);
    incoming.sections = [custom()];
    incoming.profiles = [
      {
        id: crypto.randomUUID(),
        name: "Example profile",
        requirements: [{ sectionId: "addresses", window: null }],
      },
    ];
    await expect(
      importBackup(db, JSON.stringify(incoming), (store) => {
        if (store === "meta") throw new Error("Injected last-record failure");
      }),
    ).rejects.toThrow("Nothing was changed");
    expect(await snapshot(db)).toEqual(before);
    expect(await db.get("meta", "existing")).toEqual({
      id: "existing",
      value: "keep",
    });
  });
  it.each(["broken", "future", "duplicate", "unknown-field"])(
    "rejects %s backups without changing storage",
    async (kind) => {
      await saveEntry(db, entry());
      const before = await snapshot(db),
        incoming: any = backup([entry()]);
      let raw = "not json";
      if (kind === "future") incoming.schemaVersion = 99;
      if (kind === "duplicate") incoming.entries.push(incoming.entries[0]);
      if (kind === "unknown-field") incoming.entries[0].hidden = ssn();
      if (kind !== "broken") raw = JSON.stringify(incoming);
      await expect(importBackup(db, raw)).rejects.toThrow();
      expect(await snapshot(db)).toEqual(before);
    },
  );
  it("validates every imported entry before opening the write transaction", async () => {
    const incoming = backup([entry(), entry("about", { legalName: ssn() })]);
    const spy = vi.spyOn(db, "transaction");
    await expect(importBackup(db, JSON.stringify(incoming))).rejects.toThrow(
      "About me / Legal name",
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("guards imported saved history even without a live entry", async () => {
    const incoming = backup();
    const e = entry("about", { legalName: card() });
    incoming.history = [
      { id: crypto.randomUUID(), entryId: e.id, entry: e, savedAt: now },
    ];
    await expect(importBackup(db, JSON.stringify(incoming))).rejects.toThrow(
      "payment card",
    );
    expect((await snapshot(db)).history).toEqual([]);
  });
  it.each(cardPastes())(
    "refuses $name in imported entries and history before any write",
    async ({ value }) => {
      await saveEntry(db, entry());
      const before = await snapshot(db);
      for (const isCustom of [false, true]) {
        for (const collection of ["entries", "history"] as const) {
          const section = custom();
          const unsafe = isCustom
            ? { ...entry("about", { notes: value }), sectionId: section.id }
            : entry("about", {
                legalName: "Morgan Example",
                otherNames: value,
              });
          const incoming = backup();
          if (isCustom) incoming.sections = [section];
          if (collection === "entries") incoming.entries = [unsafe];
          else
            incoming.history = [
              {
                id: crypto.randomUUID(),
                entryId: unsafe.id,
                entry: unsafe,
                savedAt: now,
              },
            ];
          const spy = vi.spyOn(db, "transaction");
          const error = await importBackup(db, JSON.stringify(incoming)).then(
            () => null,
            (error: Error) => error,
          );
          expect(spy).not.toHaveBeenCalled();
          spy.mockRestore();
          expect(error?.message).toContain(
            isCustom ? "Example form / Notes" : "About me / Other names used",
          );
          expect(error?.message).toContain("remove the full payment card");
          expect(error?.message).not.toContain(value);
          expect(error?.message).not.toContain(card());
          expect(await snapshot(db)).toEqual(before);
        }
      }
    },
  );
  it("refuses card details on save and leaves the entry and its history unchanged", async () => {
    const original = entry("about", { legalName: "Morgan Example" });
    await saveEntry(db, original);
    const before = await snapshot(db);
    for (const { value } of cardPastes()) {
      await expect(
        saveEntry(
          db,
          {
            ...original,
            fields: { ...original.fields, otherNames: value },
            updatedAt: "2026-02-01T12:00:00.000Z",
          },
          original.updatedAt,
        ),
      ).rejects.toThrow("remove the full payment card");
      expect(await snapshot(db)).toEqual(before);
    }
  });
  it("guards custom values and labels without reflecting numbers", async () => {
    const section = custom(),
      incoming = backup();
    section.fields[0].label = ssn();
    incoming.sections = [section];
    expect(() => validateBackup(incoming)).toThrow("Field label");
    section.fields[0].label = "Notes";
    incoming.entries = [
      { ...entry("about", { notes: card() }), sectionId: section.id },
    ];
    try {
      parseBackup(JSON.stringify(incoming));
      throw new Error("expected");
    } catch (error) {
      expect((error as Error).message).toContain("Example form / Notes");
      expect((error as Error).message).not.toContain(card());
    }
  });
  it("does not permit custom fields to opt out of guards", () => {
    const section: any = custom();
    section.fields[0].kind = "member";
    const incoming = backup();
    incoming.sections = [section];
    expect(() => validateBackup(incoming)).toThrow();
  });
  it("refuses guarded edits and keeps current/history unchanged", async () => {
    const e = entry("about", { legalName: "Morgan Example" });
    await saveEntry(db, e);
    await expect(
      saveEntry(
        db,
        {
          ...e,
          fields: { legalName: ssn() },
          updatedAt: "2026-02-01T12:00:00.000Z",
        },
        e.updatedAt,
      ),
    ).rejects.toThrow();
    expect(await snapshot(db)).toMatchObject({
      entries: [validateEntry(e, [])],
      history: [],
    });
  });
  it("records the old version and detects stale concurrent edits", async () => {
    const e = entry();
    await saveEntry(db, e);
    const edited = { ...e, updatedAt: "2026-02-01T12:00:00.000Z" };
    await saveEntry(db, edited, e.updatedAt);
    await expect(
      saveEntry(
        db,
        { ...e, updatedAt: "2026-02-02T12:00:00.000Z" },
        e.updatedAt,
      ),
    ).rejects.toThrow("another tab");
    expect((await snapshot(db)).history).toHaveLength(1);
  });
  it.each([true, false])(
    "delete history choice %s is explicit and exported",
    async (remove) => {
      const e = entry();
      await saveEntry(db, e);
      await saveEntry(
        db,
        { ...e, updatedAt: "2026-02-01T12:00:00.000Z" },
        e.updatedAt,
      );
      await removeEntry(db, e.id, remove);
      const exported = JSON.parse(await exportBackup(db, now));
      expect(exported.entries).toHaveLength(0);
      expect(exported.history).toHaveLength(remove ? 0 : 1);
    },
  );
  it("migrates schema 0 before validation and guards migrated data", () => {
    const old: any = backup([entry()]);
    old.schemaVersion = 0;
    delete old.history;
    expect(parseBackup(JSON.stringify(old)).history).toEqual([]);
    old.entries = [entry("about", { legalName: ssn() })];
    expect(() => parseBackup(JSON.stringify(old))).toThrow("Social Security");
  });
  it("accepts valid dates and rejects impossible dates", () => {
    expect(() =>
      validateEntry(
        entry("about", {
          legalName: "Example Person",
          birthDate: "2024-02-29",
        }),
        [],
      ),
    ).not.toThrow();
    expect(() =>
      validateEntry(
        entry("about", {
          legalName: "Example Person",
          birthDate: "2023-02-29",
        }),
        [],
      ),
    ).toThrow("valid date");
  });
  it("accepts ZIP+4 and long member IDs during import", async () => {
    const data = backup([
      entry("addresses", {
        street: "Example Lane",
        city: "Exampleville",
        zip: "55901-1234",
      }),
      entry("insurance", {
        plan: "Example plan",
        memberId: card().replaceAll(" ", ""),
        groupNumber: "123456789",
      }),
    ]);
    await importBackup(db, JSON.stringify(data));
    expect((await snapshot(db)).entries).toHaveLength(2);
  });
});
