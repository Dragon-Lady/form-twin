# Form Twin

Your answers, together. An offline notebook for the details that forms keep asking for: addresses, work history, providers, medicines, insurance, contacts, names and custom lists.

**0.1.0 is under review.** This repository is public; the notebook you create stays in your own browser. There is no hosted deployment yet.

## What it does

- Save dated entries, copy any field, copy the whole entry, or copy a single line.
- Check a section for missing months, overlapping dates and missing end dates.
- Save a checklist for each form, with separate coverage windows per section.
- Print only the sections you choose, or the sections in a saved form profile.
- Keep previous versions when you edit an entry, with the time of the change.
- Export and restore one versioned JSON backup, including saved history.
- Work offline once the app shows **Offline ready**, with no account or cloud sync.

The app starts empty. Examples in tests are fictional and are not loaded into your notebook.

## Privacy and storage

Answers are stored in IndexedDB on the current browser profile. They are **not encrypted**. Anyone who can access that profile can read them. Clearing site data, private browsing, storage eviction or losing the device can remove the notebook. Keep a separate backup somewhere private. Moving to another device means exporting and importing a backup yourself.

The app has no analytics, advertising, third-party fonts, data upload or remote API. Editing, copying, checking dates, printing and restoring backups run locally. The first visit downloads static application files. When online, the browser can check those static files for updates; no notebook answers are attached to those requests. An eventual static hosting provider can see ordinary connection metadata. Offline readiness is tied to the origin and browser profile used for the first visit.

Printed sheets and JSON backups contain personal details. The backup includes **all current entries and all saved history**, including versions retained after deleting an entry. Every deletion asks whether to remove the entry's history too. Retained versions remain visible in Saved history and can be deleted there. Erase all notebook data removes local entries, history, profiles and custom sections; it cannot remove files already exported.

Do not store full government ID or payment card numbers. The dedicated ID field accepts exactly four digits. Pattern guards catch common full Social Security and payment card formats; they are a convenience check, not a complete identifier detector or an encrypted vault.

| Field                                  | Guard behavior                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ID last four                           | Refuses full SSN shapes and bare nine-digit SSNs; accepts only four digits                                                       |
| Free text and custom fields            | Refuses plausible 3-2-4 SSNs with matching dash or space separators; refuses known card prefixes and lengths that also pass Luhn |
| ZIP, phone, member ID and group number | Exempt from SSN/card detection so ordinary postal codes and long insurance IDs work; ZIP/phone have their own format checks      |

The SSN filter excludes areas 000, 666 and 900–999, group 00 and serial 0000. Card prefixes cover common Visa, Mastercard, American Express, Discover, JCB, UnionPay and Diners Club ranges. These heuristics cannot identify every full number and deliberately allow nine bare digits in ordinary text and long IDs in member/group fields. The same rules run on input/paste, saving, import and history validation. Refusals identify the section and field without echoing the rejected number. Custom labels are validated before appearing in those messages.

## Dates, copies and printing

Dates are month-level and inclusive. Last 5 years means the current month plus the preceding 59 months. Last 10 years and Last 12 months follow the same rule. Since a month includes that month through the current month; a custom window includes both endpoints.

A single shared move month is continuous: an address ending in March and the next starting in March do not create an overlap warning. Two or more shared months, or an entry entirely inside another, do. An entry without an end date covers its starting month and is flagged for review unless marked current. Overlaps may be correct for simultaneous jobs or providers; the checker helps you review them and does not decide eligibility for any form.

Month inputs use a month menu and four-digit year field. The supported year range is 1900–2199. Birth dates are calendar dates; providers and medicines use the same month-level ranges as the other dated sections. Other names and their dates are recorded together in a text field.

One-line address copies use commas between populated address fields and dates. Other sections use semicolons. Whole-entry copies include labels and line breaks. Clipboard access needs HTTPS or localhost and a user gesture. If it is denied, the app selects the text and gives manual copy instructions.

Printing starts with no selected sections. A typical short sheet fits one or two pages; a large notebook or unusually long entry may need more. Print styles ask the browser to keep each entry together. No layout can keep an entry taller than a physical page on one page. Only the generated sheet is printed, with a date and a personal-details footer.

## Backups

Backups use `schemaVersion: 1`. Import **replaces** the notebook; it does not merge. Export before replacing it. The app reads, migrates, validates and guard-checks the entire file before opening the write transaction. All stores are replaced within one IndexedDB transaction, with an explicit abort on failure. No file reads, parsing, timers or crypto run inside that transaction.

Version 0 is supported as a development schema with the same record shapes but no history collection. Migration supplies an empty history list. Unknown versions, unknown fields, invalid dates, duplicate IDs and failed guards refuse the entire import. Limits are 5 MB, 5,000 entries, 20,000 history versions, 30 custom sections with 12 fields each, and 50 profiles. Very large exports that exceed the import limits must be reduced before restore.

## Run locally

Use Node 22.12 or newer (below 27), npm and [Socket Firewall](https://github.com/SocketDev/sfw-free). All dependency and browser installs go through `sfw`; dependency lifecycle scripts remain disabled.

```sh
sfw npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

Open the localhost URL Vite prints, under `/form-twin/`. The development server is for UI work; test offline behavior with a production build:

```sh
npm run build
npm run preview
```

Wait for **Offline ready** before disconnecting. If an app update is available, finish editing, export a backup if needed, then close all app tabs/windows and reopen. The app does not force an update while you are editing. PWA installation depends on the browser's support; an ordinary browser tab also works.

## Verify a change

```sh
npm run typecheck
npm test
npm run test:tz
npm run build
npm run test:precache
sfw npx --no-install playwright install chromium firefox
npm run test:e2e
npm run test:privacy
```

On Linux CI, Playwright's `--with-deps` option also installs required browser system libraries. CI bootstraps the pinned `sfw` wrapper, then uses it for package and browser installs. TypeScript runs as a separate check; Vite compilation alone is not a type check.

The time-zone script runs fixed-clock month tests in four zones, including the last day of a month at 23:59. The precache check compares the generated service worker against every emitted app asset. Browser tests use Chromium and Firefox; actual clipboard/paste permissions and PDF output are Chromium-only. Both browsers exercise offline reload and saving after service-worker control. Chromium additionally blocks every routed network host. Accessibility checks cover overview, editing, coverage and backups with axe. See [the review checklist](docs/review-checklist.md) for the required regression mapping.

The privacy script reads private blocked terms from `PUSH_GUARD_BLOCKED_TERMS` or the existing local Push Guard configuration outside the repo. It never prints matches. Set `REQUIRE_PRIVATE_TERMS=true` to require those terms; owner CI does this. Fork PRs receive generic checks without access to repository secrets and still require the maintainer's private check before acceptance. Run Push Guard on every outgoing commit range before pushing; the lightweight privacy script does not replace it. Keep real notebook exports, browser profiles and private logs out of issues and test artifacts.

## Deployment and release hold

The base, manifest scope and start URL are `/form-twin/`. Changing the deployment path requires updating and retesting all three. `vite-plugin-pwa` is the only service-worker mechanism. The only app data dependency is `idb`; Workbox handles the bundled service worker.

Pages never runs on a push or pull request. Its workflow requires all of the following: the expected public repository and owner, the `main` branch, an explicit manual confirmation, and a repository variable `PAGES_DEPLOY_APPROVED` set to `true`. That variable is intentionally unset during review. After separate maintainer approval, configure Pages to use GitHub Actions, enable the gate for the approved deployment and dispatch the workflow, then clear the gate. A protected `github-pages` environment can add another approval layer.

Merging, deploying, tagging and releasing each remain subject to maintainer approval. No npm or PyPI publication is planned.

## Sources and license

The guard design follows [SSA invalid-number guidance](https://secure.ssa.gov/apps10/poms.nsf/lnx/0110201035) and [Cybersource card-type ranges](https://developer.cybersource.com/docs/cybs/en-us/test-data/developer/all/so/test-data/best_practices_intro/card_type_id.html). Transaction handling follows [idb's transaction lifetime guidance](https://github.com/jakearchibald/idb#transaction-lifetime). Offline testing accounts for [Playwright's service-worker interception support](https://playwright.dev/docs/service-workers).

MIT — see [LICENSE](LICENSE).
