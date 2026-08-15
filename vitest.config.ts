import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["packages/*/src/**/*.test.ts", "demos/**/*.test.ts"],
        coverage: {
            skipFull: true,
            reportOnFailure: true,
            provider: "v8",
            // Храповик: CI падает при регрессе покрытия, планка сама ползёт вверх,
            // когда покрытие растёт (autoUpdate перезаписывает числа ниже).
            thresholds: {
                autoUpdate: true,
                statements: 99.17,
                branches: 99.48,
                functions: 98.26,
                lines: 99.26,
            },
            reporter: ["text", "lcov", "json", "json-summary", "text-summary"],
            include: ["packages/*/src/**/*.ts"],
            exclude: [
                "packages/*/src/**/*.test.ts",
                "packages/stories/**", // stories и перф-бенчи, гоняются отдельным test:perf
                "packages/testing/src/perfFixtures.ts", // фикстуры только для бенчей

                // --- Чистые типы: нечего исполнять ---
                "packages/core/src/common/iTerminalSurface.ts",
                "packages/inspector/src/index.ts", // barrel re-export
                "packages/core/src/dom/styles/index.ts", // barrel re-export
                "packages/core/src/backend/iTerminalBackend.ts",
                "packages/core/src/input/rawTerminalToken.ts",
                "packages/elements/src/tree/iTreeDataProvider.ts",
                "packages/elements/src/scrollbar/iScrollable.ts", // только интерфейсы (type guards удалены как мёртвые)
                "packages/testing/src/storyTypes.ts", // только типы story-контракта

                // --- Непокрываемо юнит-тестами ---
                "packages/terminal-backend/src/nodeTerminalBackend.ts", // реальный tty/stdin/stdout
                "packages/inspector/src/InspectorDriver.ts", // только интерфейс write/capture-порта
                "packages/inspector/src/InspectorServer.ts", // рукописный ws-транспорт (смоук-тест)
                "packages/inspector/src/ws/**", // рукописный RFC6455 фрейминг
                "packages/inspector/src/attachInspector.ts", // поднимает реальный сервер (смоук-тест)
            ],
        },
    },
});
