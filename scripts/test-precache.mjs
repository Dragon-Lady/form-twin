import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
const files = [];
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else files.push(relative("dist", p).replaceAll("\\", "/"));
  }
}
walk("dist");
const sw = readFileSync("dist/sw.js", "utf8");
const precache = new Set(
  [...sw.matchAll(/\burl:\s*["']([^"']+)["']/g)].map((m) =>
    decodeURI(m[1]).replace(/^\/form-twin\//, ""),
  ),
);
const assets = files.filter(
  (f) =>
    /\.(?:js|css|html|svg|png|ico|webmanifest|woff2)$/.test(f) && f !== "sw.js",
);
assert(assets.length > 3, "Expected a built app with multiple assets");
for (const f of assets)
  assert(precache.has(f), `Asset missing from precache: ${f}`);
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
assert.equal(manifest.start_url, "/form-twin/");
assert.equal(manifest.scope, "/form-twin/");
console.log(
  `Precache covers all ${assets.length} emitted assets; Pages scope and start URL match.`,
);
