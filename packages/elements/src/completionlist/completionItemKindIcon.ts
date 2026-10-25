import { GLYPH_TOKEN_DEFAULTS, type GlyphToken } from "@tuidom/core/dom/glyphTokens";

/**
 * Глиф-токены для `CompletionItemKind` (числовые значения enum VS Code 0…24).
 * Дефолты — codicon-глифы (Private Use Area), как в nvim-cmp / lspkind preset
 * "codicons"; хост без Nerd Font перекрывает их через `setGlyphs`.
 *
 * TUIDom-локальный, без зависимостей от Editor/Extensions — принимает сырое
 * число `kind`.
 */
const KIND_TOKENS: readonly GlyphToken[] = [
    "completionKind.text",
    "completionKind.method",
    "completionKind.function",
    "completionKind.constructor",
    "completionKind.field",
    "completionKind.variable",
    "completionKind.class",
    "completionKind.interface",
    "completionKind.module",
    "completionKind.property",
    "completionKind.unit",
    "completionKind.value",
    "completionKind.enum",
    "completionKind.keyword",
    "completionKind.snippet",
    "completionKind.color",
    "completionKind.file",
    "completionKind.reference",
    "completionKind.folder",
    "completionKind.enumMember",
    "completionKind.constant",
    "completionKind.struct",
    "completionKind.event",
    "completionKind.operator",
    "completionKind.typeParameter",
];

/** Глиф-токен для `CompletionItemKind`; неизвестный/отсутствующий kind — как Text. */
export function kindGlyphToken(kind: number | undefined): GlyphToken {
    if (kind === undefined) return "completionKind.text";
    return KIND_TOKENS[kind] ?? "completionKind.text";
}

/** Дефолтный (Nerd Font) глиф для `CompletionItemKind`, без таблицы хоста. */
export function kindIcon(kind: number | undefined): string {
    return GLYPH_TOKEN_DEFAULTS[kindGlyphToken(kind)];
}
