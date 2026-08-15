# Встроенный терминал: виджетная часть

`TerminalViewElement` (`packages/elements/src/terminal/`) — чистый лист-виджет:
каждый кадр читает сетку ячеек через `ITerminalSurface` (`readCell`/`getCursor`)
и блитит её в grid. Оркестрация — PTY, VT-эмуляция (node-pty + `@xterm/headless`),
упаковка в панель — сторона хоста и живёт в vexx; в tuidom она не переезжает.

Задачи виджетной части:

- **Эволюция контракта `ITerminalSurface`** — сейчас он подогнан под первую
  реализацию хоста (`scrollOffset`/`scrollLines`, `mouseEventsActive`,
  `resize`); по мере появления вторых потребителей зафиксировать контракт как
  публичный (дока + тесты на `FakeTerminalSurface`).
- **Lifecycle-хук у `TUIElement`** — у элементов нет unmount-хука, поэтому
  подписки на поверхность виджет держит сам и рвёт в `dispose()`, а владелец
  обязан его вызвать. Решить: заводить ли общий lifecycle (attached/detached
  уже есть — `onDidConnect`/`onDidDisconnect`; дизайн disposal-контракта
  открыт) или зафиксировать «владелец зовёт dispose()» как контракт.

Критерий готовности: контракт `ITerminalSurface` описан в доке; решение по
disposal записано (ADR в LAYOUT.md или контракт в референсе виджета).
