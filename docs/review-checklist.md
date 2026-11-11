# 0.1.0 review checklist

This is a draft implementation. Independent review and fresh test runs are required before acceptance. Use fictional data only, including in failure reports and screenshots.

| Requirement                      | Implementation                                                                                     | Evidence to rerun                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1. All-or-nothing import         | `src/store/backup.ts`: prevalidation, single transaction, only IDB promises, explicit abort        | `storage.test.ts`: inject failure at the final metadata record; compare every original store and metadata |
| 2. Field-aware SSN guard         | `src/model/guards.ts`: shaped 3-2-4, bare nine digits only for ID fields, invalid-range exclusions | `guards.test.ts`, `storage.test.ts`: ZIP+4 and member/group allow cases                                   |
| 3. Field-aware card guard        | Known prefixes/lengths plus Luhn in text/custom only                                               | Luhn-valid member ID allowed by unit and browser tests                                                    |
| 4. Import and paste guards       | Schema checks before write; input/paste validation in editor                                       | Custom paste refusal, unsafe import/current/history tests; error does not echo the number                 |
| 5. Guarded, exported history     | Version snapshots, explicit deletion choice, visible retained history                              | Round-trip and saved-version guard tests; browser export after retaining deleted history                  |
| 6. Move-month semantics          | `src/model/gaps.ts`: inclusive months; one shared boundary allowed; containment flagged            | `months-gaps.test.ts`: adjacency, missing months, 2+ overlap, containment                                 |
| 7. Injected clock                | Gap code accepts a clock and does not construct dates                                              | Fixed 23:59 month-end cases; `npm run test:tz` across four zones                                          |
| 8. Portable month controls       | Month menu plus four-digit year input                                                              | Chromium/Firefox date-window and editor workflows                                                         |
| 9. Clipboard and fallback        | Gesture copy with selected-text fallback                                                           | Chromium clipboard/paste tests; rejected-write fallback in both browsers                                  |
| 10. Public repo; deployment held | Manual Pages workflow with public/owner/main/input/variable gates                                  | Read `.github/workflows/pages.yml`; verify approval variable is unset and there are no deployments        |
| 11. Scanner-safe fixtures        | Fictional people; SSN/card test strings assembled at runtime                                       | Private privacy check and Push Guard over complete outgoing history before first public push              |

Also check separate `tsc --noEmit`, exact dependency pins, lockfile, author/committer identity, no attribution trailers, service-worker precache coverage, offline save/reload, zero-host interception in Chromium, responsive layout, selected-only print output and axe results.

Review limits: browser automation does not establish universal accessibility or every browser's PWA-install behavior. Printing checks a representative small sheet, not an arbitrary page-count guarantee. Guards are documented heuristics. There is no encryption, server, sync, autofill extension or OCR. No live notebook data is seeded or committed.
