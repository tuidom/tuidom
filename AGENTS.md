TUIDom — DOM-подобный движок терминального UI (вынесен из редактора [Vexx](https://github.com/tihonove/vexx)). Публикуется в npm как `@tuidom/all`; со временем репозиторий станет монорепой с несколькими пакетами.

# Карта

- `src/` — публикуемая поверхность пакета (deep-exports `@tuidom/all/*` → `dist/*.js`):
  - `common/` — примитивы (геометрия, цвета, disposable, шейпинг текста);
  - `dom/` — ядро: `TUIElement`, `TuiApplication`, события, каскад стилей (дефолты токенов — `dom/styles/styleTokens.ts`);
  - `ui/` — виджеты; `backend/` — терминальные бэкенды; `input/` — парсинг ввода; `rendering/` — grid/diff/ANSI;
  - `inspector/` — WebSocket-инспектор (рукописный RFC6455, zero-dep);
  - `testing/` — публикуемый тест-харнесс (`TestApp`, `renderElement`, `expectScreen`; палитра по умолчанию — снапшот Dark+ в `darkPlusStyleVars.ts`, регенерируется из vexx).
- `demos/` — standalone-хосты для ручного прогона (`npm run demo`, `demo:inspect`, …); в пакет не входят.
- `docs/` — LAYOUT.md (layout-модель), STYLES.md (каскад/токены), arch/ (per-слойный справочник), TuidomContracts.md (контракты ядра).
- `scripts/build-package.mjs` — сборка/упаковка (`npm run build` / `npm run pack`), smoke на голом node.

# Правила

- Прод-код — zero runtime dependencies; `ws` и прочее — только devDependencies.
- Тесты колоцированы (`*.test.ts` рядом с кодом); большие сьюты дробить: `tuiElement.events.test.ts`.
- Покрытие — храповик в `vitest.config.ts` (`npm run test:coverage`); недостижимое юнитами — в exclude с комментарием, планку не опускать.
- Иконки/PUA-глифы в константах писать эскейпами `\uXXXX`, не литералами.
- Приватные члены — без подчёркивания, просто модификатор.
- Импорты — относительные, с расширением `.ts` (переписываются при сборке).
- Главный потребитель — vexx: он ставит пакет из npm. Изменил поверхность — прогони его сьют против свежего tgz (`npm i --no-save <tgz>` в checkout vexx) до публикации.
- Сайд-проект storybook/prototyper (соседний репозиторий организации) читает stories через shim — при переезде stories обнови его пути.

# Публикация

`npm run pack` (tsc → rewrite .d.ts → npm pack → smoke), затем `npm publish --access public`. Версию поднимать руками в package.json.
