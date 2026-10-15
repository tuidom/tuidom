#!/usr/bin/env node
// Гейт «движок снимается в V8-снапшот»: весь граф публикуемых пакетов собирается
// в один CJS (esbuild), из него строится `node --build-snapshot`, и после
// десериализации прогоняются места, которые раньше держали нативные объекты.
//
// Хост (diode) собирается в SEA с `useSnapshot`: верхний уровень модулей движка
// исполняется при сборке снапшота, а не при запуске. Нативный объект, созданный
// на уровне модуля (`Intl.*`, HTTPParser от импорта `node:http`, сокеты, таймеры),
// не сериализуется — сборка падает `CheckGlobalAndEternalHandles failed`.
//
// Запуск: npm run check:snapshot

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { build } from "esbuild";

// Публикуемые пакеты; `stories` приватный и в хост не попадает.
const PACKAGES = ["core", "elements", "terminal-backend", "headless-backend", "testing", "inspector"];

const repoRoot = resolve(import.meta.dirname, "..");

function collectModules(dir) {
    const result = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) result.push(...collectModules(path));
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
            result.push(path);
        }
    }
    return result;
}

const modules = PACKAGES.flatMap((pkg) => collectModules(join(repoRoot, "packages", pkg, "src"))).sort();

// Пространства имён держим в массиве: иначе esbuild выбросит «неиспользуемые» модули,
// и их верхний уровень в снапшот не попадёт.
const entry = `
import v8 from "node:v8";
${modules.map((path, i) => `import * as m${i} from ${JSON.stringify(path)};`).join("\n")}
globalThis.__tuidomModules = [${modules.map((_, i) => `m${i}`).join(", ")}];

import { measureTextWidth } from ${JSON.stringify(join(repoRoot, "packages/core/src/common/measureTextWidth.ts"))};
import { DisplayLine } from ${JSON.stringify(join(repoRoot, "packages/core/src/common/displayLine.ts"))};
import { InspectorServer } from ${JSON.stringify(join(repoRoot, "packages/inspector/src/InspectorServer.ts"))};

v8.startupSnapshot.setDeserializeMainFunction(async () => {
    // Ленивые нативные объекты обязаны ожить после десериализации.
    const text = "a\\u4e2d\\u{1F600}\\t";
    const width = measureTextWidth(text);
    const lineWidth = new DisplayLine(text).displayWidth;
    if (width !== 8 || lineWidth !== 8) throw new Error(\`ширина \${width}/\${lineWidth}, ожидалось 8\`);
    const server = new InspectorServer({ dispatch: async () => ({}) });
    const { port } = await server.listen();
    server.dispose();
    if (!(port > 0)) throw new Error(\`InspectorServer не поднялся: порт \${port}\`);
    console.log(\`snapshot OK: \${globalThis.__tuidomModules.length} модулей\`);
});
`;

const dir = mkdtempSync(join(tmpdir(), "tuidom-snapshot-"));
try {
    const probe = join(dir, "probe.cjs");
    const blob = join(dir, "probe.blob");
    await build({
        stdin: { contents: entry, resolveDir: repoRoot, loader: "ts" },
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node24",
        outfile: probe,
        logLevel: "warning",
    });
    execFileSync(process.execPath, ["--snapshot-blob", blob, "--build-snapshot", probe], { stdio: "inherit" });
    const output = execFileSync(process.execPath, ["--snapshot-blob", blob], { encoding: "utf8" });
    process.stdout.write(output);
    if (!output.includes("snapshot OK")) {
        console.error("snapshot FAILED: десериализованный main не дошёл до конца");
        process.exit(1);
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}
