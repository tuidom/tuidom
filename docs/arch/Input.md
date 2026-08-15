# Input/

Слой движка TUIDom (монорепа пакетов `@tuidom/*`). Хост-приложение — [Vexx](https://github.com/tihonove/vexx).

Пайплайн парсинга терминального ввода: сырые байты stdin → токены → `KeyPressEvent`. Включает токенизатор stdin, отслеживание мыши, stateful парсер клавиатурных событий (keydown/keypress/keyup в browser-like стиле) и обратную сериализацию для тестов.
