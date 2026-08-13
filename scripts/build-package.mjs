#!/usr/bin/env node

// Сборка npm-пакета @tuidom/all из src/:
//
//   tsc-emit JS + .d.ts (rewriteRelativeImportExtensions переписывает .ts→.js
//   в JS-выхлопе) → пост-проход по .d.ts (tsc расширения в декларациях не
//   переписывает — без этого потребителю нужен TS ≥ 5.7) → npm pack →
//   smoke на голом node (без tsx): deep-пути exports + testing/*.
//
// Тесты/истории/бенчи отсекает exclude в tsconfig.build.json; demos/ лежит вне
// src/ и в сборку не попадает физически.
//
// Запуск: node scripts/build-package.mjs [--no-pack] [--no-smoke]

import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

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

/** Ставит tgz в чистый временный проект вне репо и рендерит кадр на голом node — доказывает валидность emit'а. */
function smokeTest(pkgName, tgzPath) {
    const dir = mkdtempSync(join(tmpdir(), "tuidom-smoke-"));
    try {
        writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", private: true }));
        run(`npm install --no-audit --no-fund ${tgzPath}`, dir);
        writeFileSync(
            join(dir, "smoke.mjs"),
            `import { HeadlessCaptureBackend } from "${pkgName}/backend/headlessCaptureBackend";
import { Size } from "${pkgName}/common/geometryPromitives";
import { TuiApplication } from "${pkgName}/dom/tuiApplication";
import { BodyElement } from "${pkgName}/ui/body/bodyElement";
import { BoxElement } from "${pkgName}/ui/layout/boxElement";
// Глубокий модуль ui-виджета: доказывает, что deep-пути экспортов резолвятся на голом node.
import { MenuBarItemElement } from "${pkgName}/ui/menu/menuBarItemElement";
// Тест-харнесс — публикуемая поверхность: vexx (и любой хост) тестируется им из пакета.
import { renderElement } from "${pkgName}/testing/renderElement";
import { TestApp } from "${pkgName}/testing/TestApp";

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
console.log(\`smoke OK: \${ink} non-space cells, MenuBarItemElement=\${typeof MenuBarItemElement}, TestApp=\${typeof TestApp}\`);
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

const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

rmSync(join(repoRoot, "dist"), { recursive: true, force: true });
run("npx tsc -p tsconfig.build.json", repoRoot);
rewriteDtsExtensions(join(repoRoot, "dist"));
console.log("[build-package] dist/ собран");

if (!args["no-pack"]) {
    run("npm pack", repoRoot);
    const tgzPath = join(
        repoRoot,
        `${packageJson.name.replace(/^@/, "").replace("/", "-")}-${packageJson.version}.tgz`,
    );
    if (!args["no-smoke"]) smokeTest(packageJson.name, tgzPath);
    console.log(`\n[build-package] Пакет: ${tgzPath}`);
    console.log("[build-package] Публикация: npm publish --access public");
}
