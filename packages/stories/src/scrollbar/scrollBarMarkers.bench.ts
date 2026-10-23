import type { IScrollBarMarker } from "@tuidom/elements/scrollbar/iScrollable";
import { getScrollBarMarkerCells } from "@tuidom/elements/scrollbar/scrollBarRenderer";
import { bench, describe } from "vitest";

// Бенчмарки раскладки меток полосы прокрутки. Запуск: `npm run test:perf`.
//
// Сценарий хоста: файл на 200 К строк, каретка на слове с вхождением в каждой строке — 200 К
// одно-строчных меток одного вида плюс несколько блоков SCM и диагностик. Раскладка считается
// раз на массив: кадр, который только прокручивает или двигает каретку, получает готовые клетки.

const ROWS = 200_000;
const TRACK = 38;

function makeMarkers(): IScrollBarMarker[] {
    const markers: IScrollBarMarker[] = [];
    for (let row = 0; row < ROWS; row++) markers.push({ start: row, end: row + 1, color: 0x11223380, priority: 10 });
    markers.push({ start: 100, end: 160, color: 0x22aa22ff, priority: 20 });
    markers.push({ start: 5000, end: 5003, color: 0xaa2222ff, priority: 30 });
    markers.push({ start: 150_000, end: 150_001, color: 0xaaaa22ff, priority: 25 });
    return markers;
}

const sameMarkers = makeMarkers();
const shuffledMarkers = makeMarkers().sort(() => Math.random() - 0.5);

describe("getScrollBarMarkerCells — 200k marks", () => {
    bench("same array (a frame that scrolls)", () => {
        getScrollBarMarkerCells(TRACK, ROWS, sameMarkers);
    });

    bench("new array, marks in row order (a caret move)", () => {
        getScrollBarMarkerCells(TRACK, ROWS, sameMarkers.slice());
    });

    bench("new array, marks shuffled", () => {
        getScrollBarMarkerCells(TRACK, ROWS, shuffledMarkers.slice());
    });
});
