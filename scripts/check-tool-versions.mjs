// Fails when the installed @ondc/build-tools differs from the version that specification
// builds use (BUILD_TOOLS_VERSION in automation-specifications/tooling/versions.env).
//
// build.yaml is parsed by build-tools in the spec workflows and ingested by build-tools here,
// so both sides must run the same version.
//
// Usage: node scripts/check-tool-versions.mjs [path-or-url-to-versions.env]

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const DEFAULT_SOURCE =
    "https://raw.githubusercontent.com/ONDC-Official/automation-specifications/main/tooling/versions.env";
const source = process.argv[2] ?? DEFAULT_SOURCE;

const text = source.startsWith("http")
    ? await (await fetch(source)).text()
    : readFileSync(source, "utf-8");
const pinned = text.match(/^BUILD_TOOLS_VERSION=(\S+)$/m)?.[1];
if (!pinned) {
    console.error(`BUILD_TOOLS_VERSION not found in ${source}`);
    process.exit(2);
}

// build-tools' "exports" hides package.json, so read it from the resolved entry's package root.
const require = createRequire(import.meta.url);
const entry = require.resolve("@ondc/build-tools");
const root = entry.slice(0, entry.lastIndexOf(`${path.sep}@ondc${path.sep}build-tools${path.sep}`)) +
    `${path.sep}@ondc${path.sep}build-tools`;
const installed = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")).version;

if (installed !== pinned) {
    console.error(`@ondc/build-tools is ${installed} here but ${pinned} in ${source}`);
    process.exit(1);
}
console.log(`@ondc/build-tools ${installed} matches ${source}`);
