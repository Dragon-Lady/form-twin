let nextLabel = 0;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}
export function button(
  text: string,
  action: () => unknown,
  cls = "button",
): HTMLButtonElement {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", () => {
    void action();
  });
  return b;
}
export function input(
  label: string,
  type = "text",
  value = "",
  required = false,
): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = el("label", "field");
  const caption = el("span", "field-label", label);
  caption.id = `control-label-${nextLabel++}`;
  row.append(caption);
  const control = el("input");
  control.setAttribute("aria-labelledby", caption.id);
  control.type = type;
  control.value = value;
  control.required = required;
  control.maxLength = 2000;
  control.autocomplete = "off";
  row.append(control);
  return { row, input: control };
}
export function select(
  label: string,
  options: [string, string][],
  value = "",
): { row: HTMLLabelElement; select: HTMLSelectElement } {
  const row = el("label", "field");
  const caption = el("span", "field-label", label);
  caption.id = `control-label-${nextLabel++}`;
  row.append(caption);
  const control = el("select");
  control.setAttribute("aria-labelledby", caption.id);
  for (const [key, name] of options) {
    const op = el("option", "", name);
    op.value = key;
    control.append(op);
  }
  control.value = value;
  row.append(control);
  return { row, select: control };
}
export function monthControl(
  label: string,
  value = "",
  required = false,
): { row: HTMLFieldSetElement; value: () => string } {
  const row = el("fieldset", "month-field");
  row.append(el("legend", "field-label", label));
  const month = select(
    `${label} month`,
    [
      ["", "Month"],
      ...[
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
      ].map((n, i) => [String(i + 1).padStart(2, "0"), n] as [string, string]),
    ],
    value.slice(5),
  );
  const year = input(`${label} year`, "text", value.slice(0, 4), required);
  year.input.inputMode = "numeric";
  year.input.pattern = "[0-9]{4}";
  year.input.maxLength = 4;
  year.input.placeholder = "Year";
  month.select.required = required;
  const pair = el("div", "month-pair");
  pair.append(month.row, year.row);
  row.append(pair);
  return {
    row,
    value: () => {
      if (!month.select.value && !year.input.value) return "";
      if (!month.select.value || !year.input.value)
        throw new Error(
          `Complete both the month and year for ${label.toLowerCase()}.`,
        );
      return `${year.input.value}-${month.select.value}`;
    },
  };
}
export function check(
  label: string,
  checked = false,
): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = el("label", "check"),
    control = el("input");
  control.type = "checkbox";
  control.checked = checked;
  row.append(control, el("span", "", label));
  return { row, input: control };
}
export function notice(message: string): void {
  const area = document.querySelector("#notices")!;
  area.replaceChildren(el("div", "toast", message));
}
export function message(error: unknown): string {
  return error instanceof Error && ["DataError", "Error"].includes(error.name)
    ? error.message
    : "The change could not be saved. Your existing answers are unchanged. Try exporting a backup.";
}
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notice("Copied.");
  } catch {
    const old = document.querySelector("#copy-fallback");
    old?.remove();
    const panel = el("section", "copy-fallback");
    panel.id = "copy-fallback";
    panel.setAttribute("aria-label", "Manual copy");
    const instructions = el(
      "p",
      "",
      "Copy is unavailable here. The text is selected — press Ctrl+C (Command+C on Mac).",
    );
    const box = el("textarea");
    box.value = text;
    box.readOnly = true;
    box.setAttribute("aria-label", "Text to copy");
    panel.append(
      instructions,
      box,
      button("Close", () => panel.remove(), "button small"),
    );
    document.body.append(panel);
    box.focus();
    box.select();
    notice("Text selected. Press Ctrl+C to copy.");
  }
}
