#!/usr/bin/env node

// Lockstep-подъём версии всех публикуемых пакетов монорепы:
//
//   node scripts/set-version.mjs 0.2.0
//
// Правит `version` и внутренние точные пины `@tuidom/*` во всех публикуемых
// package.json атомарно (приватные stories/demos сидят на "*" и не трогаются),
// затем нужно прогнать `npm install` для синхронизации package-lock.
// `npm version --workspaces` не годится: он не обновляет dependency-ranges.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PUBLISHED = ["core", "elements", "terminal-backend", "headless-backend", "testing", "inspector"];

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/.test(version)) {
    console.error("Использование: node scripts/set-version.mjs <X.Y.Z>");
    process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, "..");
const names = new Set(PUBLISHED.map((p) => `@tuidom/${p}`));

for (const pkg of PUBLISHED) {
    const path = join(repoRoot, "packages", pkg, "package.json");
    const json = JSON.parse(readFileSync(path, "utf8"));
    json.version = version;
    for (const dep of Object.keys(json.dependencies ?? {})) {
        if (names.has(dep)) json.dependencies[dep] = version;
    }
    writeFileSync(path, JSON.stringify(json, null, 4) + "\n");
    console.log(`${json.name} -> ${version}`);
}

console.log("> npm install (синхронизация package-lock)");
execSync("npm install --no-audit --no-fund", { stdio: "inherit", cwd: repoRoot });
