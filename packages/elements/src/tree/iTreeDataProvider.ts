import type { StyleColor } from "@tuidom/core/dom/styles/tuiStyle";

/** Inline-действие строки ({@link ITreeItem.actions}): глиф-кнопка у правого края. */
export interface ITreeItemAction {
    /** Заголовок: рисуется вместо глифа, если {@link icon} не задан. */
    readonly label: string;
    /** Готовый глиф (напр. codicon). */
    readonly icon?: string;
    /**
     * Глиф действия на строке не под мышью — в том числе на строке курсора и
     * выделенной (`.dirty:not(:hover)` эталона): ● изменённого редактора в Open
     * Editors стоит всегда, а под мышью становится ×. Без него действие видно
     * только на строке под мышью, курсора и выделенных. Клик — то же действие.
     */
    readonly idleIcon?: string;
}

export interface ITreeItem {
    readonly label: string;
    readonly icon?: string;
    readonly iconColor?: StyleColor;
    readonly collapsible: boolean;
    /** Помечает элемент как символическую ссылку: рисуется стрелка-badge у левого края. */
    readonly symlink?: boolean;
    /** Буква-бейдж статуса (1–2 символа), рисуется у правого края строки (напр. git-статус). */
    readonly badge?: string;
    /** Упакованный RGB-цвет имени: переопределяет fg спана метки (напр. git-статус). */
    readonly labelColor?: StyleColor;
    /** Метка курсивом (превью-вкладка в Open Editors эталона). */
    readonly italic?: boolean;
    /**
     * Компактная строка (VS Code `explorer.compactFolders`): метка из нескольких
     * сегментов, которые рисуются через «/» вместо {@link label}. У строки есть
     * текущий сегмент (по умолчанию последний): он подчёркнут на строке курсора,
     * Left/Right ходят по сегментам, клик по сегменту делает его текущим — см.
     * {@link TreeViewElement.getSegmentIndex}. Меньше двух сегментов — обычная строка.
     */
    readonly labelSegments?: readonly string[];
    /**
     * Вторичный текст после метки через пробел, приглушённым цветом
     * (`TreeItem.description` VS Code). На узкой ширине обрезается первым.
     */
    readonly description?: string;
    /**
     * Inline-действия строки (пункты `view/item/context` с `group: "inline"` у
     * VS Code): глифы у правого края viewport'а, только на строке под мышью,
     * курсора и выделенных (вне строки под мышью действие с {@link ITreeItemAction.idleIcon}
     * рисует его).
     * Клик — {@link TreeViewElement.onInlineAction}.
     */
    readonly actions?: readonly ITreeItemAction[];
}

export interface ITreeDataProvider<T> {
    getTreeItem(element: T): ITreeItem;
    getChildren(element?: T): T[] | Promise<T[]>;
    getKey(element: T): string;
    onChange?: (element?: T) => void;
}
