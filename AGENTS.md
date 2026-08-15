TUIDom — DOM-подобный движок терминального UI (вынесен из редактора [Vexx](https://github.com/tihonove/vexx)). Монорепа на **чистых npm workspaces** (без pnpm/turbo/lerna); публикуется набором lockstep-пакетов `@tuidom/*`.

# Карта

- `packages/` — воркспейсы; у публикуемых deep-exports (`@tuidom/<pkg>/*` → `dist/*.js`):
  - `core/` — ядро: `common/` (примитивы), `dom/` (`TUIElement`, `TuiApplication`, события, каскад стилей, `OverlayLayer`), `rendering/` (grid/diff/ANSI), `input/` (парсинг ввода — нужен всем бэкендам), `backend/iTerminalBackend.ts` (контракт бэкенда);
  - `elements/` — виджеты (бывший `ui/`, без префикса: `@tuidom/elements/body/…`);
  - `terminal-backend/` — реальный терминал (tty, Kitty); `headless-backend/` — рендер в память (скриншоты/e2e);
  - `inspector/` — WebSocket-инспектор (рукописный RFC6455, zero-dep); зависит от core+elements;
  - `testing/` — публикуемый тест-харнесс (`TestApp`, `renderElement`, `expectScreen`, `mockTerminalBackend`; палитра — снапшот Dark+ в `darkPlusStyleVars.ts`, регенерируется из vexx; `storyTypes`/`perfFixtures` публикуются — их тянет vexx);
  - `stories/` — **приватный**: все `*.stories.ts`, перф-бенчи, демо-виджеты (`FocusableBox`, `WASDScrollableElement`).
- `demos/` — приватный воркспейс: standalone-хосты (`npm run demo`, `demo:inspect`, …).
- `docs/` — LAYOUT.md, STYLES.md, arch/, TuidomContracts.md.
- `scripts/build-package.mjs` — сборка/упаковка (`npm run build` / `npm run pack`); `scripts/set-version.mjs` — lockstep-подъём версий.

# Правила

- Граф зависимостей пакетов (только вниз): elements→core; terminal-backend→core; headless-backend→core; testing→core,elements; inspector→core,elements. Новые рёбра — только осознанно.
- **Импорты**: внутри пакета — относительные с расширением `.ts`; между пакетами — bare без расширения (`@tuidom/core/common/colorUtils`). Кросс-пакетный специфаер с `.ts` ломает опубликованный пакет — ловится eslint-правилом `no-restricted-imports`.
- Dev-резолв: exports каждого пакета в git указывает на `src/*.ts`; build-скрипт временно подменяет на `dist/*.js` при сборке/pack и восстанавливает. Если package.json пакетов «грязные» после упавшей сборки — `git checkout packages/*/package.json`.
- Тест-зависимости между пакетами (тесты core импортируют `@tuidom/testing` и т.п.) в package.json не декларируются — работают через workspace-симлинки; публикуемые прод-зависимости декларируются точными lockstep-пинами.
- Единственный `tsconfig.json` — корневой (одна программа: typecheck, eslint projectService, редактор). Пакетные конфиги сборки называются строго `tsconfig.build.json`.
- Прод-код — zero runtime dependencies (кроме `@tuidom/*`); `ws` и прочее — только devDependencies корня.
- Тесты колоцированы (`*.test.ts` рядом с кодом); большие сьюты дробить: `tuiElement.events.test.ts`.
- Покрытие — общий храповик в корневом `vitest.config.ts` (`npm run test:coverage`); пакет `stories` исключён целиком; недостижимое юнитами — в exclude с комментарием, планку не опускать.
- Иконки/PUA-глифы в константах писать эскейпами `\uXXXX`, не литералами.
- Приватные члены — без подчёркивания, просто модификатор.
- Главный потребитель — vexx: он ставит пакеты из npm. Изменил поверхность — прогони его сьют против свежих tgz (`npm i --no-save ../tuidom/tuidom/tuidom-*.tgz` в checkout vexx) до публикации.
- Сайд-проект storybook/prototyper (соседний репозиторий) сидит на `@tuidom/core` — при изменении `rendering/`/`common/` его тоже стоит прогнать.

# Публикация

`npm run set-version X.Y.Z` (lockstep, правит и внутренние пины) → `npm run pack` (топологическая сборка → rewrite .d.ts → npm pack каждого → smoke шести tgz на голом node) → публиковать **строго tgz** (в них exports уже на dist; publish из директории пакета взял бы dev-exports): `for t in tuidom-*.tgz; do npm publish "$t" --access public; done`.
