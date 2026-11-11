import { spawnSync } from "node:child_process";
for (const tz of [
  "UTC",
  "America/Chicago",
  "Pacific/Kiritimati",
  "Etc/GMT+12",
]) {
  console.log(`Month calculations: ${tz}`);
  const result = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "tests/unit/months-gaps.test.ts"],
    { stdio: "inherit", env: { ...process.env, TZ: tz } },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
