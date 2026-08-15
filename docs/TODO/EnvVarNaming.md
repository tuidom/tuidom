# Судьба env-переменной `VEXX_VALIDATE_TREE`

Публичный API tuidom для проверки инвариантов дерева —
`TuiApplication.validateTreeAfterRender` (boolean). Env-переменную
`VEXX_VALIDATE_TREE=1` читает **хост** (vexx) и транслирует в этот флаг; код
tuidom env не читает — имя `VEXX_*` осталось только в комментариях
(`packages/core/src/dom/tuiApplication.ts`, `packages/core/src/dom/validateTree.ts`)
и в доках.

Решить одно из двух:

1. Завести собственную конвенцию `TUIDOM_VALIDATE_TREE` в core (читать env в
   `TuiApplication`?) — удобно всем хостам, но ядро начинает читать окружение.
2. Зафиксировать, что env-конвенция — хостовая, а tuidom предоставляет только
   флаг `validateTreeAfterRender`.

В любом случае: вычистить упоминания `VEXX_*` из комментариев кода core.

Критерий готовности: решение записано, комментарии не упоминают vexx, доки
(LAYOUT.md, arch/TUIDom.md) описывают итоговую конвенцию.
