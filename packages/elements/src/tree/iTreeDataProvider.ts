import type { StyleColor } from "@tuidom/core/dom/styles/tuiStyle";

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
    /**
     * Компактная строка (VS Code `explorer.compactFolders`): метка из нескольких
     * сегментов, которые рисуются через «/» вместо {@link label}. У строки есть
     * текущий сегмент (по умолчанию последний): он подчёркнут на строке курсора,
     * Left/Right ходят по сегментам, клик по сегменту делает его текущим — см.
     * {@link TreeViewElement.getSegmentIndex}. Меньше двух сегментов — обычная строка.
     */
    readonly labelSegments?: readonly string[];
}

export interface ITreeDataProvider<T> {
    getTreeItem(element: T): ITreeItem;
    getChildren(element?: T): T[] | Promise<T[]>;
    getKey(element: T): string;
    onChange?: (element?: T) => void;
}
