# Backend/

Слой движка TUIDom (монорепа пакетов `@tuidom/*`). Хост-приложение — [Vexx](https://github.com/tihonove/vexx).

Абстракция терминального I/O. Определяет интерфейс бэкенда (onInput, onResize, flush, setup, teardown) и три реализации: реальную `NodeTerminalBackend` (Node.js stdin/stdout, Kitty protocol, alternate screen), in-memory `MockTerminalBackend` для тестов (sendKey DSL, screenToString) и `HeadlessCaptureBackend` для `--headless`-режима.

`HeadlessCaptureBackend` — реальное приложение без реального терминала: `setup`/`teardown` — no-op, в stdout ничего не пишет, а `renderFrame` захватывает кадр в `GridSnapshot` (`Rendering/GridSnapshot.ts`) вместо ANSI. Ввод инъектируется тем же путём, что и в `MockTerminalBackend` (через `KeyInputParser` + `serializeKey`), поэтому приложение видит байт-в-байт те же `KeyPressEvent`, что и от терминала. Мышь инъектируется так же — `sendMouse` кодирует событие в SGR (1006) через `serializeMouse` (обратная сторона мышиной ветки `tokenize`) и пропускает через тот же парсер. Драйвит `--headless`: инспектор экспонирует `sendKey`/`sendText`/`sendMouse`/`captureFrame` (см. [Inspector.md (vexx)](https://github.com/tihonove/vexx/blob/main/docs/arch/Inspector.md)), чтобы клиент скриптовал редактор и читал экран для рендера в картинку.

## Пробы терминала

Бэкенд спрашивает терминал о возможностях асинхронно, fire-and-forget: запрос, следом DA1 (`CSI c`) — его отвечают почти все терминалы, и ответы идут в порядке запросов, поэтому «свой» ответ DA1 значит «все ответы уже пришли»; страховочный таймаут 200 мс закрывает молчащий терминал. Ответы съедает бэкенд — до `onInput` они не доходят.

- `probeKeyboardProtocol` — Kitty-флаги (`CSI ? u`).
- `probeTerminalVersion` — XTVERSION (`CSI > 0 q`).
- `probeHostColors` — цвета самого терминала: fg/bg (OSC 10/11) и 16 ANSI-цветов (OSC 4, **по запросу на индекс**: Konsole на мульти-индексный OSC 4 отвечает только первым, tmux отбрасывает ответ не того индекса). Ответ — `HostTerminalColors`, неотвеченное — `undefined` поштучно. Разбор цвета — `parseXColor` (`rgb:R/G/B` на 1–4 цифры канала, устаревший `#…`; ответ может кончаться BEL или ST). Особые случаи: **tmux** отвечает за свою панель сам (fg/bg — с 3.4, палитру пересылает внешнему терминалу — с 3.6), но DA1 отвечает сразу, раньше пересланных ответов — поэтому под tmux проба ждёт все 18 ответов либо 600 мс (своё ожидание у tmux — 500 мс); **GNU Screen** (`STY` без `TMUX`) не отвечает и не пересылает — запросы не шлются, ответ сразу пустой. `MockTerminalBackend`/`HeadlessCaptureBackend` отвечают синхронно полем `hostColors` (по умолчанию `NO_HOST_COLORS`).
