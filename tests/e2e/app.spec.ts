import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { backup, card, custom, entry, now, ssn } from "../unit/fixtures";
async function start(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "A little less paperwork." }),
  ).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function addName(page: Page, name = "Morgan Example") {
  await nav(page, "About me");
  await page.getByRole("button", { name: "+ Add entry", exact: true }).click();
  await page.getByLabel("Legal name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function importFile(page: Page, value: unknown, confirm = true) {
  await nav(page, "Backups & privacy");
  await page.getByLabel("Choose a JSON backup").setInputFiles({
    name: "example-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
  if (confirm) {
    await page
      .getByRole("button", { name: "Replace with this backup", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
}
async function swReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await expect(page.locator(".offline-status")).toHaveText("● Offline ready");
}
test("create and edit an entry, inspect history, and persist after reload", async ({
  page,
}) => {
  await start(page);
  await addName(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Other names used (include dates)", { exact: true })
    .fill("M. Example, 2020–2022");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await page.reload();
  await nav(page, "About me");
  await expect(
    page.getByText("M. Example, 2020–2022", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText(/Version before the change/),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByText("M. Example, 2020–2022", { exact: true }),
  ).toHaveCount(0);
});
test("clipboard copy and one-line formatting", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Clipboard permissions are Chromium-only.",
  );
  await start(page);
  await importFile(
    page,
    backup([
      entry(
        "addresses",
        {
          street: "14 Example Lane",
          city: "Exampleville",
          state: "EX",
          zip: "00000",
        },
        "2020-01",
        "2022-03",
      ),
    ]),
  );
  await nav(page, "Addresses");
  await page.getByRole("button", { name: "Copy street", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("14 Example Lane");
  await page.getByRole("button", { name: "Copy as one line" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("14 Example Lane, Exampleville, EX, 00000, Jan 2020 – Mar 2022");
});
test("rejected clipboard writes select text with manual instructions", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          Promise.reject(new DOMException("Not allowed", "NotAllowedError")),
      },
    }),
  );
  await start(page);
  await addName(page);
  await page
    .getByRole("button", { name: "Copy legal name", exact: true })
    .click();
  const box = page.getByRole("textbox", { name: "Text to copy" });
  await expect(box).toHaveValue("Morgan Example");
  expect(
    await box.evaluate(
      (e: HTMLTextAreaElement) => e.selectionEnd - e.selectionStart,
    ),
  ).toBe("Morgan Example".length);
  await expect(
    page.getByText(/press Ctrl\+C \(Command\+C on Mac\)/),
  ).toBeVisible();
});
test("custom-field paste uses the same guard and never saves a full number", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Paste permission is Chromium-only.");
  await start(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "+ Custom section" })
    .click();
  await page
    .getByLabel("Section name", { exact: true })
    .fill("Example checklist");
  await page
    .getByLabel("Field labels, separated by commas", { exact: true })
    .fill("Notes");
  await page
    .getByRole("button", { name: "Create section", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add entry", exact: true }).click();
  const field = page.getByRole("dialog").getByLabel("Notes", { exact: true });
  for (const value of [ssn(), card()]) {
    await field.fill("");
    await page.evaluate((value) => navigator.clipboard.writeText(value), value);
    await field.focus();
    await field.press("Control+V");
    await expect(page.locator(".field-error")).toContainText(
      "Example checklist / Notes: remove the full",
    );
    expect(
      await field.evaluate((el: HTMLInputElement) => el.checkValidity()),
    ).toBe(false);
    await expect(page.locator(".field-error")).not.toContainText(value);
  }
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByText("0 entries saved on this device")).toBeVisible();
});
test("allows ZIP+4 and long member IDs and rejects unsafe history on import", async ({
  page,
}) => {
  await start(page);
  await importFile(
    page,
    backup([
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
    ]),
  );
  await nav(page, "Insurance");
  await expect(
    page.getByText(card().replaceAll(" ", ""), { exact: true }),
  ).toBeVisible();
  const incoming = backup();
  const old = entry("about", { legalName: ssn() });
  incoming.history = [
    { id: crypto.randomUUID(), entryId: old.id, entry: old, savedAt: now },
  ];
  await importFile(page, incoming, false);
  await expect(page.getByRole("status")).toContainText("About me / Legal name");
  await expect(page.getByRole("status")).not.toContainText(ssn());
  await nav(page, "Insurance");
  await expect(
    page.getByRole("heading", { name: "Example plan" }),
  ).toBeVisible();
});
test("coverage accepts a shared move month, flags a missing month, and saves a profile", async ({
  page,
}) => {
  await start(page);
  await importFile(
    page,
    backup([
      entry("addresses", undefined, "2022-01", "2022-03"),
      entry(
        "addresses",
        { street: "20 Example Road", city: "Exampleville" },
        "2022-03",
        "2022-12",
      ),
    ]),
  );
  await nav(page, "Check coverage");
  await page.getByLabel("Window", { exact: true }).selectOption("custom");
  await page
    .getByLabel("Window start month", { exact: true })
    .selectOption("01");
  await page.getByLabel("Window start year", { exact: true }).fill("2022");
  await page.getByLabel("Window end month", { exact: true }).selectOption("12");
  await page.getByLabel("Window end year", { exact: true }).fill("2022");
  await page
    .getByRole("button", { name: "Check coverage", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Every month is covered" }),
  ).toBeVisible();
  await nav(page, "Form profiles");
  await page.getByRole("button", { name: "+ New profile" }).click();
  await page
    .getByLabel("Profile name", { exact: true })
    .fill("Example annual form");
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Addresses", exact: true })
    .check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Example annual form" }),
  ).toBeVisible();
  await expect(
    page.getByText("! Addresses — Dates need attention"),
  ).toBeVisible();
});
test("export includes saved history and deletion asks whether to retain it", async ({
  page,
}) => {
  await start(page);
  await addName(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Legal name", { exact: true }).fill("Rowan Example");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByLabel("Also delete all saved history for this entry")
    .uncheck();
  await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await nav(page, "Saved history");
  await expect(
    page.getByRole("heading", { name: "Morgan Example" }),
  ).toBeVisible();
  await expect(page.getByText(/The current entry was deleted/)).toBeVisible();
  await nav(page, "Backups & privacy");
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export everything" }).click();
  const download = await promise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.entries).toHaveLength(0);
  expect(exported.history).toHaveLength(1);
});
test("chosen answers sheet prints within two pages without split entries", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "PDF output is Chromium-only.");
  await start(page);
  await importFile(
    page,
    backup([
      entry(),
      entry("insurance", { plan: "Unselected plan", memberId: "987654321" }),
    ]),
  );
  await nav(page, "Answers sheet");
  await page.getByRole("checkbox", { name: "Addresses", exact: true }).check();
  await page.getByRole("button", { name: "Build answers sheet" }).click();
  await expect(page.locator("#answers-sheet")).toContainText("14 Example Lane");
  await expect(page.locator("#answers-sheet")).not.toContainText(
    "Unselected plan",
  );
  await expect(page.locator("#answers-sheet")).toContainText(
    "This page holds personal details.",
  );
  await page.emulateMedia({ media: "print" });
  expect(
    await page
      .locator(".print-entry")
      .first()
      .evaluate((e) => getComputedStyle(e).breakInside),
  ).toBe("avoid");
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length || 0;
  expect(pages).toBeGreaterThanOrEqual(1);
  expect(pages).toBeLessThanOrEqual(2);
});
test("offline after SW control: reload and save with no network hosts allowed", async ({
  page,
  context,
  browserName,
}) => {
  const external: string[] = [];
  context.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4173/")) external.push(r.url());
  });
  await start(page);
  await swReady(page);
  await context.setOffline(true);
  const networkAttempts: string[] = [];
  // Service-worker network interception is a Chromium Playwright capability.
  // Firefox still exercises offline reload and writes via setOffline below.
  if (browserName === "chromium")
    await context.route("**/*", (route) => {
      networkAttempts.push(route.request().url());
      return route.abort();
    });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A little less paperwork." }),
  ).toBeVisible();
  await addName(page, "Offline Example");
  await nav(page, "Backups & privacy");
  await nav(page, "About me");
  await expect(
    page.getByRole("heading", { name: "Offline Example" }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(networkAttempts).toEqual([]);
});
test("overview, editor and tools have no serious accessibility issues", async ({
  page,
}) => {
  await start(page);
  const audit = async () =>
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
  await audit();
  await nav(page, "Addresses");
  await page.getByRole("button", { name: "+ Add entry", exact: true }).click();
  await audit();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await nav(page, "Check coverage");
  await audit();
  await nav(page, "Backups & privacy");
  await audit();
});
test("small-screen layout fits and remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await addName(page);
  await expect(
    page.getByRole("heading", { name: "Morgan Example" }),
  ).toBeVisible();
});
