#!/usr/bin/env node

// Сборка npm-пакетов монорепы из packages/*/src:
//
//   Цикл по пакетам в топологическом порядке (владеет им ЭТОТ скрипт —
//   `npm run build --workspaces` порядок не гарантирует):
//     tsc-emit JS + .d.ts (rewriteRelativeImportExtensions переписывает .ts→.js
//     в относительных специфаерах; bare-специфаеры @tuidom/* не трогаются) →
//     пост-проход по .d.ts (tsc расширения в декларациях не переписывает) →
//     патч exports пакета: src/*.ts → dist/*.js → npm pack.
//
//   Патч exports нужен ДО сборки следующего пакета: его tsc резолвит
//   @tuidom/*-импорты через exports уже собранных зависимостей в dist/*.d.ts —
//   чужие исходники не попадают в программу, а типы совпадают с публикуемыми.
//   В finally exports восстанавливаются на src (dev-резолв).
//
// Тесты отсекает exclude в packages/*/tsconfig.build.json; stories/ и demos/
// приватные и не собираются.
//
// Запуск: node scripts/build-package.mjs [--no-pack] [--no-smoke]

import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

// Топологический порядок: каждый пакет собирается после своих зависимостей.
const PACKAGES = ["core", "elements", "terminal-backend", "headless-backend", "testing", "inspector"];

const repoRoot = resolve(import.meta.dirname, "..");

function run(cmd, cwd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: "inherit", cwd });
}

/** tsc не переписывает .ts-расширения в .d.ts — приводим декларации в симметрию с .js сами. */
function rewriteDtsExtensions(distDir) {
    const specifier = /(["'])(\.\.?\/[^"']*)\.ts\1/g;
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.name.endsWith(".d.ts")) {
                const source = readFileSync(path, "utf8");
                const rewritten = source.replace(specifier, "$1$2.js$1");
                if (rewritten !== source) writeFileSync(path, rewritten);
                if (/(["'])(\.\.?\/[^"']*)\.ts\1/.test(rewritten)) {
                    throw new Error(`[build-package] ${path}: остался .ts-специфаер после переписывания`);
                }
            }
        }
    };
    walk(distDir);
}

/** Ставит все tgz в чистый временный проект вне репо и рендерит кадр на голом node — доказывает валидность emit'а. */
function smokeTest(tgzPaths) {
    const dir = mkdtempSync(join(tmpdir(), "tuidom-smoke-"));
    try {
        writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", private: true }));
        run(`npm install --no-audit --no-fund ${tgzPaths.join(" ")}`, dir);
        writeFileSync(
            join(dir, "smoke.mjs"),
            `import { Size } from "@tuidom/core/common/geometryPromitives";
import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { BodyElement } from "@tuidom/elements/body/bodyElement";
import { BoxElement } from "@tuidom/elements/layout/boxElement";
// Глубокий модуль ui-виджета: доказывает, что deep-пути экспортов резолвятся на голом node.
import { MenuBarItemElement } from "@tuidom/elements/menu/menuBarItemElement";
import { HeadlessCaptureBackend } from "@tuidom/headless-backend/headlessCaptureBackend";
// Остальные пакеты — smoke на резолв/загрузку deep-путей.
import { attachInspector } from "@tuidom/inspector/attachInspector";
import { isInsideTmux } from "@tuidom/terminal-backend/terminalEnv";
// Тест-харнесс — публикуемая поверхность: vexx (и любой хост) тестируется им из пакета.
import { renderElement } from "@tuidom/testing/renderElement";
import { TestApp } from "@tuidom/testing/TestApp";

const backend = new HeadlessCaptureBackend(new Size(40, 10));
const app = new TuiApplication(backend);
const body = new BodyElement();
body.title = "smoke";
body.setContent(new BoxElement());
app.root = body;
app.run();
const frame = backend.captureFrame();
const ink = frame.cells.filter((c) => c.char !== " ").length;
if (frame.cols !== 40 || frame.rows !== 10 || ink === 0) {
    console.error("smoke FAILED: empty frame", { cols: frame.cols, rows: frame.rows, ink });
    process.exit(1);
}
const harnessBackend = renderElement(new BoxElement(), 6, 3);
if (harnessBackend.getTextAt === undefined) {
    console.error("smoke FAILED: testing/renderElement вернул не MockTerminalBackend");
    process.exit(1);
}
for (const [name, value] of Object.entries({ MenuBarItemElement, TestApp, attachInspector, isInsideTmux })) {
    if (typeof value !== "function") {
        console.error(\`smoke FAILED: \${name} не функция/класс: \${typeof value}\`);
        process.exit(1);
    }
}
console.log(\`smoke OK: \${ink} non-space cells, 6 пакетов, deep-пути резолвятся\`);
`,
        );
        run("node smoke.mjs", dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const { values: args } = parseArgs({
    options: {
        "no-pack": { type: "boolean", default: false },
        "no-smoke": { type: "boolean", default: false },
    },
});

const DIST_EXPORTS = {
    "./package.json": "./package.json",
    "./*.js": "./dist/*.js",
    "./*": "./dist/*.js",
};

// Оригиналы package.json — для восстановления src-exports в finally (crash-safe).
const originals = new Map();
const tgzPaths = [];

try {
    for (const name of PACKAGES) {
        const pkgDir = join(repoRoot, "packages", name);
        const pkgJsonPath = join(pkgDir, "package.json");
        const originalJson = readFileSync(pkgJsonPath, "utf8");
        originals.set(pkgJsonPath, originalJson);

        rmSync(join(pkgDir, "dist"), { recursive: true, force: true });
        run(`npx tsc -p packages/${name}/tsconfig.build.json`, repoRoot);
        rewriteDtsExtensions(join(pkgDir, "dist"));

        // dist-exports до сборки следующего пакета: его tsc должен резолвить
        // этот пакет в dist/*.d.ts, а не в src.
        const pkgJson = JSON.parse(originalJson);
        pkgJson.exports = DIST_EXPORTS;
        writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 4) + "\n");
        console.log(`[build-package] ${pkgJson.name}: dist/ собран`);

        if (!args["no-pack"]) {
            run(`npm pack --pack-destination "${repoRoot}"`, pkgDir);
            tgzPaths.push(join(repoRoot, `${pkgJson.name.replace(/^@/, "").replace("/", "-")}-${pkgJson.version}.tgz`));
        }
    }

    if (!args["no-pack"] && !args["no-smoke"]) smokeTest(tgzPaths);
} finally {
    for (const [path, contents] of originals) writeFileSync(path, contents);
}

if (tgzPaths.length > 0) {
    console.log("\n[build-package] Пакеты:");
    for (const tgz of tgzPaths) console.log(`  ${tgz}`);
    // Публикуем именно tgz: в них exports уже указывает на dist. `npm publish` из
    // директории пакета взял бы рабочий package.json с dev-exports (src/*.ts) — сломанный пакет.
    console.log("[build-package] Публикация (строго по tgz): for t in tuidom-*.tgz; do npm publish \"$t\" --access public; done");
}
