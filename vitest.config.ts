import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/**/*.test.ts", "demos/**/*.test.ts"],
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
            include: ["src/**/*.ts"],
            exclude: [
                "src/**/*.test.ts",
                "src/**/*.bench.ts", // перф-бенчмарки, гоняются отдельным test:perf
                "src/**/*.stories.ts",
                "src/testing/perfFixtures.ts", // фикстуры только для бенчей

                // --- Чистые типы: нечего исполнять ---
                "src/common/iTerminalSurface.ts",
                "src/inspector/index.ts", // barrel re-export
                "src/dom/styles/index.ts", // barrel re-export
                "src/backend/iTerminalBackend.ts",
                "src/input/rawTerminalToken.ts",
                "src/ui/tree/iTreeDataProvider.ts",
                "src/ui/scrollbar/iScrollable.ts", // только интерфейсы (type guards удалены как мёртвые)
                "src/testing/storyTypes.ts", // только типы story-контракта

                // --- Непокрываемо юнит-тестами ---
                "src/backend/nodeTerminalBackend.ts", // реальный tty/stdin/stdout
                "src/inspector/InspectorDriver.ts", // только интерфейс write/capture-порта
                "src/inspector/InspectorServer.ts", // рукописный ws-транспорт (смоук-тест)
                "src/inspector/ws/**", // рукописный RFC6455 фрейминг
                "src/inspector/attachInspector.ts", // поднимает реальный сервер (смоук-тест)
            ],
        },
    },
});
