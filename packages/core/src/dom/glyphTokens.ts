/**
 * Дефолтные глифы виджетов tuidom — Nerd Font (codicon'ы и Font Awesome из
 * Private Use Area). Хост, у которого в терминале нет Nerd Font, перекрывает их
 * таблицей через {@link TUIElement.setGlyphs} — обычно один раз на корне, как
 * палитру темы через setStyleVars; повторный вызов перерисовывает дерево.
 *
 * Контракт значения: ровно одна ячейка терминала (без emoji и широких
 * символов) — виджеты резервируют под глиф одну колонку.
 *
 * Правило: глиф, который рисует виджет, ОБЯЗАН иметь строку здесь.
 */
export const GLYPH_TOKEN_DEFAULTS = {
    // ── Шевроны сворачиваемых строк (TreeViewElement, ListViewElement) ──
    "tree.expanded": "\uF107", // nf-fa-angle_down — chevron, как в nvim-tree/NvChad
    "tree.collapsed": "\uF105", // nf-fa-angle_right

    // ── Вкладки редактора ──
    "editorTab.readOnly": "\uEA75", // nf-cod-lock

    // ── Виды автодополнения по CompletionItemKind (0…24, enum VS Code) — lspkind preset "codicons" ──
    "completionKind.text": "\uEA93",
    "completionKind.method": "\uEA8C",
    "completionKind.function": "\uEA8C",
    "completionKind.constructor": "\uEA8C",
    "completionKind.field": "\uEB5F",
    "completionKind.variable": "\uEA88",
    "completionKind.class": "\uEB5B",
    "completionKind.interface": "\uEB61",
    "completionKind.module": "\uEA8B",
    "completionKind.property": "\uEB65",
    "completionKind.unit": "\uEA96",
    "completionKind.value": "\uEA95",
    "completionKind.enum": "\uEA95",
    "completionKind.keyword": "\uEB62",
    "completionKind.snippet": "\uEB66",
    "completionKind.color": "\uEB5C",
    "completionKind.file": "\uEA7B",
    "completionKind.reference": "\uEB36",
    "completionKind.folder": "\uEA83",
    "completionKind.enumMember": "\uEB5E",
    "completionKind.constant": "\uEB5D",
    "completionKind.struct": "\uEA91",
    "completionKind.event": "\uEA86",
    "completionKind.operator": "\uEB64",
    "completionKind.typeParameter": "\uEA92",
} as const satisfies Readonly<Record<string, string>>;

export type GlyphToken = keyof typeof GLYPH_TOKEN_DEFAULTS;

/** Таблица хоста: любые глифы из {@link GLYPH_TOKEN_DEFAULTS}, не заданные — берутся у предков и из дефолтов. */
export type GlyphTable = Readonly<Partial<Record<GlyphToken, string>>>;
