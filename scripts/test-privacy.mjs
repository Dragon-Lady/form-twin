import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Private terms stay outside the repository and are never printed, even on failure.
const privateFile = join(homedir(), ".config", "push-guard", "blocked-terms");
const supplied =
  process.env.PUSH_GUARD_BLOCKED_TERMS ||
  (existsSync(privateFile) ? readFileSync(privateFile, "utf8") : "");
const terms = supplied
  .split(/\r?\n/)
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s && !s.startsWith("#"));
if (process.env.REQUIRE_PRIVATE_TERMS === "true" && !terms.length) {
  console.error("Private privacy terms are required but unavailable.");
  process.exit(1);
}
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
];
const rules = [
  /\/(?:home|Users)\/[a-z0-9_.-]+/i,
  /\b[a-z0-9-]+\.ts\.net\b/i,
  /\b(?:ghp|github_pat|sk_live)_[a-z0-9_]{16,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
function unsafe(text) {
  const lower = text.toLowerCase();
  return (
    terms.some((term) => lower.includes(term)) ||
    rules.some((rule) => rule.test(text))
  );
}
let failures = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const bytes = readFileSync(file);
  if (unsafe(file) || (!bytes.includes(0) && unsafe(bytes.toString("utf8"))))
    failures++;
}
const history = execFileSync(
  "git",
  ["log", "--all", "--format=%an%n%ae%n%cn%n%ce%n%B"],
  { encoding: "utf8" },
);
if (unsafe(history)) failures++;
if (failures) {
  console.error(
    `Privacy check blocked ${failures} item(s). Inspect locally; matched content is withheld.`,
  );
  process.exit(1);
}
console.log(
  `Privacy check passed for ${files.length} files and commit metadata (${terms.length ? "private terms enabled" : "generic rules only"}).`,
);
