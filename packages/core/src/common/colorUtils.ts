/**
 * Sentinel value meaning "use terminal's default color".
 * Must be negative so it's never confused with a packed RGB value (0x000000–0xFFFFFF).
 */
export const DEFAULT_COLOR = -1;

/**
 * Полностью прозрачный цвет (`#RRGGBB00`, CSS `transparent`): при наложении
 * ничего не меняет, а как собственный bg элемента — не красит. Сентинел, а не
 * упаковка с альфой 0: старший байт 0 занят непрозрачными 24-битными числами.
 */
export const TRANSPARENT_COLOR = -2;

/** Максимальное упакованное значение с альфой (`0xFE_FFFFFF`); всё выше — не цвет. */
const MAX_PACKED_COLOR = 0xfeffffff;
/** Множитель старшего байта — альфа хранится через умножение, а не `<<`, чтобы не уйти в отрицательные. */
const ALPHA_UNIT = 0x1000000;

/** Pack three 8-bit channels into a single 24-bit integer. */
export function packRgb(r: number, g: number, b: number): number {
    return (r << 16) | (g << 8) | b;
}

/**
 * Упаковывает цвет с альфой (0..255). Непрозрачный (`a === 255`) даёт обычное
 * 24-битное число — то же, что {@link packRgb}; `a === 0` — {@link TRANSPARENT_COLOR};
 * промежуточная альфа кладётся в старший байт (`0xAARRGGBB`, беззнаковое
 * значение > 0xFFFFFF). Так весь существующий код с 24-битными литералами
 * остаётся валидным без миграции, а полупрозрачность — отличима одним сравнением.
 */
export function packRgba(r: number, g: number, b: number, a: number): number {
    if (a >= 0xff) return packRgb(r, g, b);
    if (a <= 0) return TRANSPARENT_COLOR;
    return a * ALPHA_UNIT + packRgb(r, g, b);
}

/** Extract the red channel (bits 16–23). */
export function unpackR(color: number): number {
    return (color >> 16) & 0xff;
}

/** Extract the green channel (bits 8–15). */
export function unpackG(color: number): number {
    return (color >> 8) & 0xff;
}

/** Extract the blue channel (bits 0–7). */
export function unpackB(color: number): number {
    return color & 0xff;
}

/**
 * Альфа цвета: 255 у 24-битных чисел и сентинелов (`DEFAULT_COLOR` — цвет
 * терминала, он непрозрачен), 0 у {@link TRANSPARENT_COLOR}, иначе старший байт.
 */
export function unpackA(color: number): number {
    if (color === TRANSPARENT_COLOR) return 0;
    if (color <= 0xffffff) return 0xff;
    return color >>> 24;
}

/** true для полупрозрачного цвета (альфа 1..254) — того, что требует композитинга с подложкой. */
export function isTranslucent(color: number): boolean {
    return color > 0xffffff;
}

/**
 * true, если число — легальное значение цвета: 24-битный RGB, упаковка с
 * альфой, {@link DEFAULT_COLOR} или {@link TRANSPARENT_COLOR}. Сентинелы
 * каскада (`INHERITED_*`) и мусор — false.
 */
export function isColorValue(color: number): boolean {
    return (
        color === DEFAULT_COLOR ||
        color === TRANSPARENT_COLOR ||
        (Number.isInteger(color) && color >= 0 && color <= MAX_PACKED_COLOR)
    );
}

/**
 * Накладывает полупрозрачный `fg` на непрозрачную подложку `bg` и возвращает
 * непрозрачный результат: терминал альфы не умеет, поэтому композитинг
 * выполняется заранее (`alpha` — доля 0..1).
 */
export function blendRgb(fg: number, bg: number, alpha: number): number {
    const mix = (f: number, b: number): number => Math.round(f * alpha + b * (1 - alpha));
    return packRgb(mix(unpackR(fg), unpackR(bg)), mix(unpackG(fg), unpackG(bg)), mix(unpackB(fg), unpackB(bg)));
}

/**
 * Композитинг «`color` поверх `under`» (source-over): результат всегда
 * непрозрачен или `DEFAULT_COLOR`. Непрозрачный `color` (и `DEFAULT_COLOR`)
 * возвращается как есть — путь нулевой стоимости, одно сравнение;
 * {@link TRANSPARENT_COLOR} оставляет подложку. Полупрозрачный цвет смешивается
 * с `under` по альфе; если подложка — `DEFAULT_COLOR` (цвет терминала, нам
 * неизвестен), смешивать не с чем — альфа отбрасывается, цвет ложится непрозрачным.
 */
export function compositeOver(color: number, under: number): number {
    if (color <= 0xffffff) return color === TRANSPARENT_COLOR ? under : color;
    const rgb = color & 0xffffff;
    if (under < 0) return rgb;
    return blendRgb(rgb, under, (color >>> 24) / 0xff);
}

/**
 * Разбирает CSS-подобный hex: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`
 * (решётка необязательна, регистр любой) в упакованный цвет (см.
 * {@link packRgba}). Некорректная строка — throw: цвет темы с опечаткой
 * должен падать на разборе, а не красить в чёрный.
 */
export function parseHexColor(hex: string): number {
    const digits = hex.startsWith("#") ? hex.slice(1) : hex;
    const short = digits.length === 3 || digits.length === 4;
    if (!(short || digits.length === 6 || digits.length === 8) || !/^[0-9a-fA-F]+$/.test(digits)) {
        throw new Error(`parseHexColor: некорректный hex-цвет "${hex}"`);
    }
    const channel = (i: number): number => {
        if (short) {
            const d = parseInt(digits[i], 16);
            return d * 16 + d;
        }
        return parseInt(digits.slice(i * 2, i * 2 + 2), 16);
    };
    const hasAlpha = digits.length === 4 || digits.length === 8;
    return packRgba(channel(0), channel(1), channel(2), hasAlpha ? channel(3) : 0xff);
}

/**
 * Обратное к {@link parseHexColor}: `#rrggbb` для непрозрачного, `#rrggbbaa`
 * с альфой, `#00000000` для {@link TRANSPARENT_COLOR}. `DEFAULT_COLOR` hex не
 * имеет — throw.
 */
export function formatHexColor(color: number): string {
    if (color === DEFAULT_COLOR) throw new Error("formatHexColor: DEFAULT_COLOR не имеет hex-представления");
    if (color === TRANSPARENT_COLOR) return "#00000000";
    const hex2 = (n: number): string => n.toString(16).padStart(2, "0");
    const rgb = `#${hex2(unpackR(color))}${hex2(unpackG(color))}${hex2(unpackB(color))}`;
    return isTranslucent(color) ? `${rgb}${hex2(unpackA(color))}` : rgb;
}
