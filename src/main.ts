import "./style.css";
import "./print.css";
import { registerSW } from "virtual:pwa-register";
import { allSections, builtins } from "./model/types";
import type {
  Entry,
  Profile,
  Section,
  Snapshot,
  WindowRule,
} from "./model/types";
import { guard } from "./model/guards";
import { MAX_BACKUP_BYTES, parseBackup } from "./model/schema";
import { checkGaps } from "./model/gaps";
import { rangeLabel, monthString, windowBounds } from "./model/months";
import {
  deleteProfile,
  eraseNotebook,
  openNotebook,
  removeEntry,
  saveEntry,
  saveProfile,
  saveSection,
  snapshot,
} from "./store/db";
import type { Database } from "./store/db";
import { exportBackup, importBackup } from "./store/backup";
import {
  button,
  check,
  copyText,
  el,
  input,
  message,
  monthControl,
  notice,
  select,
} from "./ui/dom";
import { entryTitle, labeledEntry, oneLine, periodText } from "./ui/format";
const root = document.querySelector<HTMLDivElement>("#app")!,
  dialog = document.querySelector<HTMLDialogElement>("#editor")!;
let db: Database,
  data: Snapshot = { entries: [], history: [], profiles: [], sections: [] },
  view = "home",
  ready = false;
let restoreFocus: HTMLElement | null = null;
const symbols: Record<string, string> = {
  about: "◯",
  addresses: "⌂",
  work: "▣",
  providers: "✚",
  medicines: "＋",
  insurance: "◇",
  contacts: "♧",
};
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function act(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    notice(message(error));
  }
}
async function refresh() {
  data = await snapshot(db);
  render();
}
function go(next: string) {
  view = next;
  render();
  document.querySelector<HTMLElement>("#page-title")?.focus();
}
function sections() {
  return allSections(data.sections);
}
function entries(sectionId: string) {
  return data.entries
    .filter((e) => e.sectionId === sectionId)
    .sort((a, b) =>
      (b.period?.from || b.updatedAt).localeCompare(
        a.period?.from || a.updatedAt,
      ),
    );
}
function heading(kicker: string, title: string, description: string) {
  const block = el("header", "page-heading");
  block.append(el("p", "eyebrow", kicker));
  const h = el("h1", "", title);
  h.id = "page-title";
  h.tabIndex = -1;
  block.append(h, el("p", "lede", description));
  return block;
}
function openDialog(title: string) {
  restoreFocus = document.activeElement as HTMLElement;
  dialog.replaceChildren();
  const top = el("header", "dialog-heading");
  const h = el("h2", "", title);
  h.id = "dialog-title";
  top.append(
    h,
    button("Close", () => dialog.close(), "button quiet small"),
  );
  dialog.append(top);
  dialog.showModal();
}
dialog.addEventListener("close", () => {
  dialog.replaceChildren();
  restoreFocus?.focus();
});
function formActions(
  form: HTMLFormElement,
  label: string,
  submit: () => Promise<void>,
) {
  const error = el("p", "error");
  error.setAttribute("role", "alert");
  const actions = el("div", "actions");
  const save = el("button", "button primary", label);
  save.type = "submit";
  actions.append(
    save,
    button("Cancel", () => dialog.close(), "button quiet"),
  );
  form.append(error, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await submit();
      dialog.close();
      await refresh();
      notice("Saved on this device.");
    } catch (err) {
      error.textContent = message(err);
    } finally {
      save.disabled = false;
    }
  });
}
function editor(section: Section, existing?: Entry) {
  openDialog(
    existing
      ? `Edit ${section.name.toLowerCase()} entry`
      : `Add to ${section.name.toLowerCase()}`,
  );
  const form = el("form", "editor-form");
  const controls = new Map<string, HTMLInputElement>();
  for (const f of section.fields) {
    const control = input(
      f.label,
      f.kind === "date" ? "date" : f.kind === "phone" ? "tel" : "text",
      existing?.fields[f.id] || "",
      f.required,
    );
    if (f.kind === "id") {
      control.input.inputMode = "numeric";
      control.input.maxLength = 20;
      control.input.placeholder = "Last four digits only";
    }
    if (f.kind === "number") control.input.inputMode = "decimal";
    const hint = el("span", "field-error");
    const hintId = `hint-${f.id}`;
    hint.id = hintId;
    control.row.append(hint);
    const label = control.row.querySelector(".field-label")!;
    label.id = `label-${f.id}`;
    control.input.setAttribute("aria-labelledby", label.id);
    control.input.setAttribute("aria-describedby", hintId);
    const validate = () => {
      try {
        guard(
          control.input.value,
          section.custom ? "custom" : f.kind,
          section.name,
          f.label,
        );
        control.input.setCustomValidity("");
        hint.textContent = "";
      } catch (err) {
        const text = message(err);
        control.input.setCustomValidity(text);
        hint.textContent = text;
      }
    };
    control.input.addEventListener("input", validate);
    control.input.addEventListener("paste", () => queueMicrotask(validate));
    controls.set(f.id, control.input);
    form.append(control.row);
  }
  let period: () => Entry["period"] = () => undefined;
  if (section.dated) {
    const from = monthControl("From", existing?.period?.from || "", true),
      to = monthControl("To", existing?.period?.to || "");
    const current = check(
      "Current — no end month",
      existing?.period?.current || false,
    );
    const toggle = () => {
      to.row.disabled = current.input.checked;
    };
    current.input.addEventListener("change", toggle);
    toggle();
    const dates = el("div", "date-grid");
    dates.append(from.row, to.row);
    form.append(
      el(
        "p",
        "hint",
        "Months include both the start and end month. Leave the end blank if you need to confirm it.",
      ),
      dates,
      current.row,
    );
    period = () => ({
      from: from.value(),
      to: current.input.checked ? null : to.value() || null,
      current: current.input.checked,
    });
  }
  formActions(form, "Save entry", async () => {
    const now = new Date().toISOString();
    const p = period();
    await saveEntry(
      db,
      {
        id: existing?.id || crypto.randomUUID(),
        sectionId: section.id,
        fields: Object.fromEntries(
          [...controls].map(([key, c]) => [key, c.value]),
        ),
        ...(p ? { period: p } : {}),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      },
      existing?.updatedAt,
    );
  });
  dialog.append(form);
}
function deleteEntry(entry: Entry) {
  openDialog("Delete this entry?");
  dialog.append(
    el(
      "p",
      "",
      "Choose whether to remove its saved versions too. Versions you keep remain visible in History and included in backups.",
    ),
  );
  const history = check("Also delete all saved history for this entry", true);
  dialog.append(history.row);
  const actions = el("div", "actions");
  actions.append(
    button(
      "Delete entry",
      () =>
        act(async () => {
          await removeEntry(db, entry.id, history.input.checked);
          dialog.close();
          await refresh();
          notice(
            history.input.checked
              ? "Entry and its history deleted."
              : "Entry deleted. Saved versions remain in History.",
          );
        }),
      "button danger",
    ),
    button("Cancel", () => dialog.close(), "button quiet"),
  );
  dialog.append(actions);
}
function customEditor() {
  openDialog("Make a custom section");
  const form = el("form", "editor-form"),
    name = input("Section name", "", "", true),
    description = input("Short description"),
    fields = input("Field labels, separated by commas", "text", "", true),
    dated = check("Include from/to months for coverage checks");
  name.input.type = "text";
  fields.input.placeholder = "Reference, Contact, Notes";
  form.append(
    name.row,
    description.row,
    fields.row,
    dated.row,
    el(
      "p",
      "hint",
      "Up to 12 fields. Custom fields use the full-number guard.",
    ),
  );
  formActions(form, "Create section", async () => {
    const labels = fields.input.value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const s: Section = {
      id: `custom-${crypto.randomUUID()}`,
      name: name.input.value,
      description: description.input.value,
      dated: dated.input.checked,
      custom: true,
      fields: labels.map((label, i) => ({
        id: `field-${i + 1}`,
        label,
        kind: "custom",
      })),
    };
    await saveSection(db, s);
    view = s.id;
  });
  dialog.append(form);
}
function renderEntry(entry: Entry, section: Section, historyDate?: string) {
  const card = el("article", "entry-card");
  const title = el("div", "entry-title");
  title.append(el("h2", "", entryTitle(entry, section)));
  if (entry.period) title.append(el("span", "date-badge", periodText(entry)));
  card.append(title);
  if (historyDate)
    card.append(
      el(
        "p",
        "hint",
        `Version before the change on ${historyDate.slice(0, 10)}. ${data.entries.some((e) => e.id === entry.id) ? "" : "The current entry was deleted."}`,
      ),
    );
  const list = el("dl", "details");
  for (const field of section.fields) {
    const value = entry.fields[field.id];
    if (!value) continue;
    const group = el("div", "detail");
    group.append(el("dt", "", field.label));
    const dd = el("dd");
    dd.append(
      el("span", "", value),
      button("Copy", () => copyText(value), "button text-button"),
    );
    dd.lastElementChild?.setAttribute(
      "aria-label",
      `Copy ${field.label.toLowerCase()}`,
    );
    group.append(dd);
    list.append(group);
  }
  card.append(list);
  const actions = el("div", "entry-actions");
  actions.append(
    button(
      "Copy entry",
      () => copyText(labeledEntry(entry, section)),
      "button small",
    ),
    button(
      "Copy as one line",
      () => copyText(oneLine(entry, section)),
      "button small quiet",
    ),
  );
  if (!historyDate)
    actions.append(
      button("Edit", () => editor(section, entry), "button small quiet"),
      button("History", () => showEntryHistory(entry.id), "button small quiet"),
      button("Delete", () => deleteEntry(entry), "button small text-button"),
    );
  card.append(actions);
  return card;
}
function showEntryHistory(id: string) {
  openDialog("Saved versions");
  const rows = data.history
    .filter((h) => h.entryId === id)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  if (!rows.length)
    dialog.append(
      el(
        "p",
        "",
        "No earlier versions yet. Editing an entry saves its previous version here.",
      ),
    );
  for (const h of rows) {
    const s = sections().find((s) => s.id === h.entry.sectionId);
    if (s) dialog.append(renderEntry(h.entry, s, h.savedAt));
  }
}
function home(main: HTMLElement) {
  main.append(
    heading(
      "YOUR PERSONAL ANSWERS NOTEBOOK",
      "A little less paperwork.",
      "Keep the details you reach for, ready for the next form. Saved here on your device.",
    ),
  );
  const summary = el("section", "summary-card");
  const text = el("div");
  text.append(
    el("p", "eyebrow", "ONE PLACE TO COME BACK TO"),
    el(
      "h2",
      "",
      data.entries.length
        ? `${data.entries.length} ${data.entries.length === 1 ? "entry" : "entries"}, together.`
        : "Start with what you know.",
    ),
    el(
      "p",
      "",
      data.entries.length
        ? "Your notebook grows at your pace. Check dates before using them on a form."
        : "Add a name, an address, or a contact. You can fill in the rest whenever you need it.",
    ),
  );
  summary.append(
    text,
    button(
      data.entries.length ? "Check your coverage" : "Add your first details",
      () => (data.entries.length ? go("gaps") : editor(builtins[0])),
      "button primary",
    ),
  );
  main.append(summary);
  const label = el("div", "section-heading");
  label.append(
    el("h2", "", "Your sections"),
    button("+ Custom section", customEditor, "button text-button"),
  );
  main.append(label);
  const grid = el("div", "section-grid");
  for (const section of sections()) {
    const b = button("", () => go(section.id), "section-tile");
    const count = entries(section.id).length;
    b.append(
      el("span", "section-symbol", symbols[section.id] || "▤"),
      el("strong", "", section.name),
      el("span", "", section.description),
      el(
        "small",
        "",
        `${count} ${count === 1 ? "entry" : "entries"} ${count ? "saved" : "· ready when you are"}`,
      ),
    );
    grid.append(b);
  }
  main.append(grid);
  const foot = el("div", "privacy-note");
  foot.append(
    el("strong", "", "Made for your peace of mind."),
    el(
      "span",
      "",
      "No account. No analytics. Your answers stay in this browser. Export a backup to keep a separate copy.",
    ),
  );
  main.append(foot);
}
function sectionView(main: HTMLElement, section: Section) {
  main.append(heading("YOUR SECTIONS", section.name, section.description));
  const toolbar = el("div", "toolbar");
  toolbar.append(
    el(
      "p",
      "hint",
      `${entries(section.id).length} entries saved on this device`,
    ),
    button("+ Add entry", () => editor(section), "button primary"),
  );
  main.append(toolbar);
  const rows = entries(section.id);
  if (!rows.length) {
    const empty = el("section", "empty");
    empty.append(
      el("span", "empty-symbol", symbols[section.id] || "▤"),
      el("h2", "", `Your ${section.name.toLowerCase()} will live here.`),
      el(
        "p",
        "",
        "Add the details once. Copy them whenever the next form asks.",
      ),
      button("Add an entry", () => editor(section), "button primary"),
    );
    main.append(empty);
  } else for (const entry of rows) main.append(renderEntry(entry, section));
}
function ruleControls(
  container: HTMLElement,
  label = "Window",
  initial: WindowRule = { kind: "last", months: 60 },
) {
  const choice = select(
    label,
    [
      ["60", "Last 5 years"],
      ["120", "Last 10 years"],
      ["12", "Last 12 months"],
      ["since", "Since a month"],
      ["custom", "Custom window"],
    ],
    initial.kind === "last" ? String(initial.months) : initial.kind,
  );
  const from = monthControl(
      "Window start",
      initial.kind === "last" ? "" : initial.from,
    ),
    to = monthControl(
      "Window end",
      initial.kind === "custom" ? initial.to : "",
    );
  const extra = el("div", "date-grid");
  extra.append(from.row, to.row);
  container.append(choice.row, extra);
  const update = () => {
    extra.hidden = !["since", "custom"].includes(choice.select.value);
    to.row.hidden = choice.select.value !== "custom";
  };
  choice.select.addEventListener("change", update);
  update();
  return () =>
    choice.select.value === "since"
      ? ({ kind: "since", from: from.value() } as WindowRule)
      : choice.select.value === "custom"
        ? ({ kind: "custom", from: from.value(), to: to.value() } as WindowRule)
        : ({ kind: "last", months: +choice.select.value } as WindowRule);
}
function gapReport(section: Section, rule: WindowRule): HTMLElement {
  const report = el("section", "report");
  try {
    const bounds = windowBounds(rule, today);
    report.append(
      el(
        "p",
        "eyebrow",
        rangeLabel(monthString(bounds[0]), monthString(bounds[1])),
      ),
    );
    const result = checkGaps(entries(section.id), rule, today);
    const count =
      result.gaps.length +
      result.overlaps.length +
      result.missingEnds.length +
      result.missingStarts.length;
    report.append(
      el(
        "h2",
        count ? "attention" : "success",
        count ? "A few dates to check" : "Every month is covered",
      ),
    );
    const ul = el("ul", "report-list");
    for (const gap of result.gaps) ul.append(el("li", "", gap.message));
    for (const overlap of result.overlaps) {
      const titles = overlap.ids
        .map((id) =>
          entryTitle(
            data.entries.find((e) => e.id === id)!,
            section,
          ),
        )
        .join(" / ");
      ul.append(el("li", "", `${overlap.message} ${titles}`));
    }
    for (const id of result.missingEnds)
      ul.append(
        el(
          "li",
          "",
          `${entryTitle(
            data.entries.find((e) => e.id === id)!,
            section,
          )}: add an end month or mark current.`,
        ),
      );
    for (const id of result.missingStarts)
      ul.append(
        el(
          "li",
          "",
          `${entryTitle(
            data.entries.find((e) => e.id === id)!,
            section,
          )}: add a starting month.`,
        ),
      );
    report.append(
      ul,
      el(
        "p",
        "hint",
        "One shared move month is continuous. Two shared months or a contained entry is flagged. Overlaps may be expected for some providers or jobs.",
      ),
    );
  } catch (error) {
    report.append(el("p", "error", message(error)));
  }
  return report;
}
function gaps(main: HTMLElement) {
  main.append(
    heading(
      "A SECOND LOOK AT YOUR DATES",
      "Check your coverage.",
      "Find missing months and dates to review before you submit a form.",
    ),
  );
  const panel = el("form", "panel"),
    section = select(
      "Section",
      sections()
        .filter((s) => s.dated)
        .map((s) => [s.id, s.name]),
      "addresses",
    );
  panel.append(section.row);
  const getRule = ruleControls(panel);
  const submit = el("button", "button primary", "Check coverage");
  submit.type = "submit";
  panel.append(submit);
  const results = el("div");
  panel.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      results.replaceChildren(
        gapReport(
          sections().find((s) => s.id === section.select.value)!,
          getRule(),
        ),
      );
    } catch (error) {
      notice(message(error));
    }
  });
  main.append(panel, results);
}
function profileEditor(existing?: Profile) {
  openDialog(existing ? "Edit form profile" : "Make a form profile");
  const form = el("form", "editor-form"),
    name = input("Profile name", "text", existing?.name || "", true);
  name.input.placeholder = "New patient form";
  form.append(
    name.row,
    el(
      "p",
      "hint",
      "Choose the sections this form asks for. Set a separate coverage window for each dated section.",
    ),
  );
  const controls = sections().map((section) => {
    const rule = existing?.requirements.find((r) => r.sectionId === section.id);
    const toggle = check(section.name, !!rule),
      row = el("section", "profile-choice");
    row.append(toggle.row);
    const windowArea = el("div");
    const read = section.dated
      ? ruleControls(
          windowArea,
          `${section.name} window`,
          rule?.window || undefined,
        )
      : () => null;
    row.append(windowArea);
    windowArea.hidden = !toggle.input.checked;
    toggle.input.addEventListener(
      "change",
      () => (windowArea.hidden = !toggle.input.checked),
    );
    form.append(row);
    return { section, toggle, read };
  });
  formActions(form, "Save profile", async () => {
    await saveProfile(db, {
      id: existing?.id || crypto.randomUUID(),
      name: name.input.value,
      requirements: controls
        .filter((c) => c.toggle.input.checked)
        .map((c) => ({ sectionId: c.section.id, window: c.read() })),
    });
  });
  dialog.append(form);
}
function profileStatus(profile: Profile) {
  const list = el("ul", "profile-status");
  for (const r of profile.requirements) {
    const s = sections().find((s) => s.id === r.sectionId)!;
    let ok = entries(s.id).length > 0;
    let info = ok ? "Ready to review" : "Needs an entry";
    if (r.window) {
      try {
        const g = checkGaps(entries(s.id), r.window, today);
        ok =
          ok &&
          !g.gaps.length &&
          !g.overlaps.length &&
          !g.missingEnds.length &&
          !g.missingStarts.length;
        info = ok ? "Covered" : "Dates need attention";
      } catch {
        ok = false;
        info = "Review the date window";
      }
    }
    list.append(
      el(
        "li",
        ok ? "success" : "attention",
        `${ok ? "✓" : "!"} ${s.name} — ${info}`,
      ),
    );
  }
  return list;
}
function profiles(main: HTMLElement) {
  main.append(
    heading(
      "KEEP EACH FORM STRAIGHT",
      "Form profiles.",
      "Save the sections and time windows a form asks for. Check them together next time.",
    ),
    button("+ New profile", () => profileEditor(), "button primary"),
  );
  if (!data.profiles.length)
    main.append(
      el(
        "p",
        "empty",
        "No profiles yet. Make a checklist for a form you fill in often.",
      ),
    );
  for (const p of data.profiles) {
    const card = el("article", "entry-card");
    card.append(el("h2", "", p.name), profileStatus(p));
    const actions = el("div", "actions");
    actions.append(
      button("View checklist", () => {
        openDialog(p.name);
        dialog.append(profileStatus(p));
        for (const r of p.requirements)
          if (r.window)
            dialog.append(
              gapReport(
                sections().find((s) => s.id === r.sectionId)!,
                r.window,
              ),
            );
      }),
      button("Answers sheet", () => {
        view = "print";
        render();
        buildSheet(
          p.requirements.map((r) => r.sectionId),
          p.name,
        );
      }),
      button("Edit", () => profileEditor(p), "button quiet"),
      button(
        "Delete",
        () => {
          openDialog("Delete this profile?");
          dialog.append(
            el("p", "", "Your entries and history will stay in the notebook."),
            button(
              "Delete profile",
              () =>
                act(async () => {
                  await deleteProfile(db, p.id);
                  dialog.close();
                  await refresh();
                }),
              "button danger",
            ),
          );
        },
        "button text-button",
      ),
    );
    card.append(actions);
    main.append(card);
  }
}
function buildSheet(ids: string[], profileName = "Selected sections") {
  const area = document.querySelector("#answers-sheet")!;
  area.replaceChildren();
  area.append(
    el("p", "eyebrow", "FORM TWIN · ANSWERS SHEET"),
    el("h2", "", profileName),
    el("p", "hint", `Printed on ${today()}`),
  );
  for (const s of sections().filter((s) => ids.includes(s.id))) {
    const section = el("section", "print-section");
    section.append(el("h3", "", s.name));
    const rows = entries(s.id);
    if (!rows.length) section.append(el("p", "", "No entries saved."));
    for (const entry of rows) {
      const item = el("article", "print-entry");
      item.append(el("h4", "", entryTitle(entry, s)));
      for (const f of s.fields)
        if (entry.fields[f.id])
          item.append(el("p", "", `${f.label}: ${entry.fields[f.id]}`));
      if (entry.period) item.append(el("p", "", `Dates: ${periodText(entry)}`));
      section.append(item);
    }
    area.append(section);
  }
  area.append(
    el(
      "footer",
      "sheet-footer",
      "This page holds personal details. Keep it somewhere private.",
    ),
  );
}
function printView(main: HTMLElement) {
  main.append(
    heading(
      "A CALMER WAY TO FILL IN FORMS",
      "Your answers sheet.",
      "Choose only the sections you need. Large notebooks can take more than two pages.",
    ),
  );
  const controls = el("section", "panel no-print"),
    profile = select("Use a form profile", [
      ["", "Choose sections"],
      ...data.profiles.map((p) => [p.id, p.name] as [string, string]),
    ]);
  controls.append(profile.row);
  const choices = sections().map((s) => ({
    id: s.id,
    ...check(s.name, false),
  }));
  const grid = el("div", "choice-grid");
  choices.forEach((c) => grid.append(c.row));
  controls.append(grid);
  const generate = () => {
    const p = data.profiles.find((p) => p.id === profile.select.value);
    const ids = p
      ? p.requirements.map((r) => r.sectionId)
      : choices.filter((c) => c.input.checked).map((c) => c.id);
    if (!ids.length) {
      notice("Choose at least one section to include.");
      return;
    }
    buildSheet(ids, p?.name);
  };
  controls.append(
    button("Build answers sheet", generate, "button primary"),
    button("Print sheet", () => {
      if (!document.querySelector("#answers-sheet")!.childElementCount) {
        notice("Build an answers sheet first.");
        return;
      }
      window.print();
    }),
  );
  profile.select.addEventListener("change", () => {
    grid.hidden = !!profile.select.value;
  });
  main.append(controls, el("section", "answers-sheet"));
  main.lastElementChild!.id = "answers-sheet";
}
function historyView(main: HTMLElement) {
  main.append(
    heading(
      "YOUR EARLIER ANSWERS",
      "Saved history.",
      "Previous versions stay here when an entry changes. Kept versions of deleted entries remain visible and included in backups.",
    ),
  );
  if (!data.history.length)
    main.append(
      el(
        "p",
        "empty",
        "No saved versions yet. Editing an entry saves its previous version automatically.",
      ),
    );
  for (const h of [...data.history].sort((a, b) =>
    b.savedAt.localeCompare(a.savedAt),
  )) {
    const s = sections().find((s) => s.id === h.entry.sectionId);
    if (s) {
      const card = renderEntry(h.entry, s, h.savedAt);
      card.append(
        button(
          "Delete this saved version",
          () => {
            openDialog("Delete this saved version?");
            dialog.append(
              el("p", "", "The current entry will not change."),
              button(
                "Delete version",
                () =>
                  act(async () => {
                    await db.delete("history", h.id);
                    dialog.close();
                    await refresh();
                  }),
                "button danger",
              ),
            );
          },
          "button small text-button",
        ),
      );
      main.append(card);
    }
  }
}
function backups(main: HTMLElement) {
  main.append(
    heading(
      "KEEP A COPY YOU CONTROL",
      "Backups & privacy.",
      "Your notebook is saved in this browser on this device. Clearing browser data can remove it.",
    ),
  );
  const info = el("section", "panel");
  info.append(
    el("h2", "", "Before you export"),
    el(
      "p",
      "",
      "The JSON backup includes every section, profile, current entry and saved history, including history kept after deletion. It is not encrypted and holds personal details. Store it somewhere private.",
    ),
    button(
      "Export everything",
      () =>
        act(async () => {
          const raw = await exportBackup(db),
            url = URL.createObjectURL(
              new Blob([raw], { type: "application/json" }),
            );
          const a = el("a");
          a.href = url;
          a.download = `form-twin-backup-${today()}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          notice("Backup exported, including saved history.");
        }),
      "button primary",
    ),
  );
  main.append(info);
  const imports = el("section", "panel");
  imports.append(
    el("h2", "", "Restore a backup"),
    el(
      "p",
      "",
      "Import replaces this notebook. Export a copy first. The entire file is checked before any stored data changes.",
    ),
  );
  const file = input("Choose a JSON backup", "file");
  file.input.accept = ".json,application/json";
  imports.append(file.row);
  file.input.addEventListener(
    "change",
    () =>
      void act(async () => {
        const selected = file.input.files?.[0];
        if (!selected) return;
        if (selected.size > MAX_BACKUP_BYTES)
          throw new Error("This backup is too large. The limit is 5 MB.");
        const raw = await selected.text();
        const validated = parseBackup(raw);
        openDialog("Replace this notebook?");
        dialog.append(
          el(
            "p",
            "",
            `The checked backup contains ${validated.entries.length} entries, ${validated.history.length} saved versions and ${validated.profiles.length} profiles. This replaces all current data.`,
          ),
          button(
            "Replace with this backup",
            () =>
              act(async () => {
                await importBackup(db, raw);
                dialog.close();
                await refresh();
                notice("Backup restored, including saved history.");
              }),
            "button danger",
          ),
          button("Cancel", () => dialog.close(), "button quiet"),
        );
        file.input.value = "";
      }),
  );
  main.append(imports);
  const privacy = el("section", "panel");
  privacy.append(
    el("h2", "", "Personal means personal"),
    el(
      "p",
      "",
      "No account, analytics, advertising, cloud sync or data upload. Anyone with access to your browser profile can read this notebook; it is not an encrypted vault. Use your device lock and a private browser profile.",
    ),
    el(
      "p",
      "",
      "Keep only the last four digits of ID numbers. Pattern guards help catch common full Social Security and payment card numbers; they cannot recognize every possible identifier. Insurance member IDs, group numbers, phone numbers and postal codes use their own field rules.",
    ),
    el(
      "p",
      "",
      "Offline use is ready when the status says “Offline ready”. Your browser can check this site’s static files for updates when online; your answers are not sent with those requests.",
    ),
  );
  main.append(privacy);
  const danger = el("section", "panel");
  danger.append(
    el("h2", "", "Clear this notebook"),
    el(
      "p",
      "",
      "Permanently remove current entries, saved history, custom sections and profiles from this browser. Exported backup files are separate.",
    ),
    button(
      "Erase all notebook data",
      () => {
        openDialog("Erase all notebook data?");
        const consent = check(
          "I understand this deletes all entries and history on this device",
        );
        dialog.append(
          consent.row,
          button(
            "Erase permanently",
            () =>
              act(async () => {
                if (!consent.input.checked) {
                  notice("Confirm the deletion first.");
                  return;
                }
                await eraseNotebook(db);
                dialog.close();
                await refresh();
                notice("Notebook data erased.");
              }),
            "button danger",
          ),
        );
      },
      "button danger",
    ),
  );
  main.append(danger);
}
function render() {
  root.replaceChildren();
  const shell = el("div", "shell"),
    sidebar = el("aside", "sidebar");
  const brand = button("", () => go("home"), "brand");
  const logo = el("img");
  logo.src = import.meta.env.BASE_URL + "icon.svg";
  logo.alt = "";
  brand.append(logo, el("span", "", "Form Twin"));
  sidebar.append(brand, el("p", "brand-note", "Your answers, together."));
  const nav = el("nav");
  nav.setAttribute("aria-label", "Notebook navigation");
  const addNav = (id: string, name: string, icon = "") => {
    const b = button(
      "",
      () => go(id),
      "nav-item" + (view === id ? " active" : ""),
    );
    const symbol = el("span", "nav-symbol", icon);
    symbol.setAttribute("aria-hidden", "true");
    b.append(symbol, el("span", "", name));
    if (view === id) b.setAttribute("aria-current", "page");
    nav.append(b);
  };
  addNav("home", "Overview", "▦");
  nav.append(el("p", "nav-label", "YOUR SECTIONS"));
  for (const s of sections()) addNav(s.id, s.name, symbols[s.id] || "▤");
  nav.append(
    button("+ Custom section", customEditor, "nav-item custom"),
    el("p", "nav-label", "YOUR TOOLS"),
  );
  for (const [id, name, symbol] of [
    ["gaps", "Check coverage", "◴"],
    ["profiles", "Form profiles", "☷"],
    ["print", "Answers sheet", "▧"],
    ["history", "Saved history", "↶"],
    ["backups", "Backups & privacy", "◇"],
  ])
    addNav(id, name, symbol);
  sidebar.append(nav, el("p", "sidebar-foot", "Just here. Just yours."));
  const workspace = el("div", "workspace"),
    top = el("div", "topbar");
  top.append(
    el("span", "top-label", "A place for the details life asks for."),
    el(
      "span",
      "offline-status",
      ready
        ? "● Offline ready"
        : navigator.onLine
          ? "○ Preparing offline access"
          : "○ Offline access not ready",
    ),
  );
  workspace.append(top);
  const main = el("main");
  main.id = "content";
  workspace.append(main);
  shell.append(sidebar, workspace);
  root.append(shell);
  if (view === "home") home(main);
  else if (view === "gaps") gaps(main);
  else if (view === "profiles") profiles(main);
  else if (view === "print") printView(main);
  else if (view === "history") historyView(main);
  else if (view === "backups") backups(main);
  else {
    const s = sections().find((s) => s.id === view);
    if (s) sectionView(main, s);
    else {
      view = "home";
      home(main);
    }
  }
}
async function start() {
  try {
    db = await openNotebook();
    await refresh();
  } catch {
    root.append(
      heading(
        "STORAGE IS UNAVAILABLE",
        "Your browser could not open the notebook.",
        "Enable site storage or use a standard browser window, then reload. No answers can be saved until storage is available.",
      ),
    );
    return;
  }
  registerSW({
    onOfflineReady() {
      ready = true;
      document.querySelector(".offline-status")!.textContent =
        "● Offline ready";
    },
    onNeedRefresh() {
      notice(
        "An app update is available. Finish editing, export a backup if needed, then close and reopen the app.",
      );
    },
    onRegisterError() {
      notice(
        "Offline access could not be prepared. Keep this page open and try reloading when connected.",
      );
    },
  });
  if ("serviceWorker" in navigator)
    void navigator.serviceWorker.ready.then(() => {
      ready = true;
      document.querySelector(".offline-status")!.textContent =
        "● Offline ready";
    });
  window.addEventListener("focus", () => {
    if (!dialog.open) void act(refresh);
  });
}
void start();
