import eslint from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["**/dist/", "node_modules/", "coverage/", "*.config.*", "scripts/"],
    },

    eslint.configs.recommended,

    // Самый злой typescript-eslint пресет с type-aware правилами
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["eslint.config.ts"],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },

    // Prettier — отключает конфликтующие ESLint-правила и репортит нарушения форматирования
    eslintPluginPrettier,

    {
        files: ["**/*.test.ts"],
        rules: {
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/unbound-method": "off",
            // Мок-реализации async-интерфейсов часто не содержат await — это норма для тестов.
            "@typescript-eslint/require-await": "off",
        },
    },
    {
        // ANSI-последовательности в парсерах/бэкендах — контрольные символы в регэкспах законны.
        files: [
            "packages/core/src/input/**",
            "packages/terminal-backend/src/**",
            "packages/headless-backend/src/**",
            "packages/testing/src/**",
            "demos/**",
        ],
        rules: {
            "no-control-regex": "off",
        },
    },
    {
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "off",
            // Форсируем явный спецификатор видимости на всех членах класса
            "@typescript-eslint/explicit-member-accessibility": ["error", { accessibility: "explicit" }],
            // Разрешаем числа в template literals
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            // Сортировка импортов по группам:
            // 1. Node built-in модули (node:*)
            // 2. Внешние пакеты (npm)
            // 3. Относительные импорты, поднимающиеся вверх (../)
            // 4. Локальные импорты (./)
            "simple-import-sort/imports": [
                "error",
                {
                    groups: [["^node:"], ["^[^.]"], ["^\\.\\."], ["^\\./"]],
                },
            ],
            "simple-import-sort/exports": "warn",
            // Кросс-пакетные импорты — строго без расширения: bare-специфаер с .ts
            // rewriteRelativeImportExtensions не переписывает, и у потребителя из npm
            // такой путь не резолвится (тихая мина в опубликованном пакете).
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@tuidom/**/*.ts"],
                            message: "Кросс-пакетный импорт — без расширения .ts: @tuidom/<pkg>/<путь>.",
                        },
                    ],
                },
            ],
            // Запрещаем inline import() в аннотациях типов — используй import type вместо этого
            "no-restricted-syntax": [
                "error",
                {
                    selector: "TSImportType",
                    message: "Не используй inline import() для типов. Добавь `import type { ... }` в начало файла.",
                },
            ],
        },
    },
);
