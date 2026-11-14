export type KanbanColumnId = 'todo' | 'in_progress' | 'done';

export interface KanbanChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface KanbanBoard {
  id: string;
  name: string;
  autoArchiveDays: number | null; // null = disabled; e.g., 7 = archive 7 days after entering 'done'
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanCard {
  id: string;
  boardId: string;
  columnId: KanbanColumnId;
  title: string;
  tagColor?: string;              // Optional Calm Science palette token/hex
  tagLabel?: string;              // Optional short tag text
  assigneeIds: string[];          // References HouseholdProfile.id
  checklist: KanbanChecklistItem[];
  sortOrder: number;
  isArchived: boolean;
  completedAt?: string;           // Set when moved into 'done', cleared if moved back out
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanWidgetConfig {
  widgetInstanceId: string;
  activeBoardId: string;          // Independent per widget instance!
  activeColumnId?: KanbanColumnId;
  displayMode?: 'tile' | 'view';
}

export interface KanbanColumnMeta {
  id: KanbanColumnId;
  label: string;
  shortLabel: string;
}

export const KANBAN_COLUMNS: readonly KanbanColumnMeta[] = [
  { id: 'todo', label: 'To Do', shortLabel: 'To Do' },
  { id: 'in_progress', label: 'In Progress', shortLabel: 'In Progress' },
  { id: 'done', label: 'Done', shortLabel: 'Done' },
] as const;

export interface KanbanTagColorOption {
  token: string;
  label: string;
  hex: string;
}

/**
 * Desaturated Calm Science tag palette tailored for low-arousal daylight and Night Mode readability.
 */
export const KANBAN_TAG_PALETTE: readonly KanbanTagColorOption[] = [
  { token: 'sage', label: 'Sage', hex: '#6b8f71' },
  { token: 'slate', label: 'Slate', hex: '#648296' },
  { token: 'dusty_rose', label: 'Dusty Rose', hex: '#b5838d' },
  { token: 'soft_amber', label: 'Soft Amber', hex: '#c99b66' },
  { token: 'lavender_gray', label: 'Lavender-Gray', hex: '#8b7fa8' },
] as const;

export const KANBAN_AUTO_ARCHIVE_OPTIONS: readonly (number | null)[] = [
  null,
  1,
  3,
  7,
  14,
  30,
] as const;

export function resolveKanbanTagHex(colorOrToken?: string): string | undefined {
  if (!colorOrToken) return undefined;
  const trimmed = colorOrToken.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('#') || trimmed.startsWith('rgb') || trimmed.startsWith('hsl')) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  const match = KANBAN_TAG_PALETTE.find(
    (entry) => entry.token === lower || entry.label.toLowerCase() === lower
  );
  return match ? match.hex : undefined;
}

export function resolveKanbanTagLabel(card: Pick<KanbanCard, 'tagColor' | 'tagLabel'>): string | undefined {
  const custom = card.tagLabel?.trim();
  if (custom) return custom;
  if (!card.tagColor) return undefined;
  const lower = card.tagColor.trim().toLowerCase();
  const match = KANBAN_TAG_PALETTE.find(
    (entry) => entry.token === lower || entry.hex.toLowerCase() === lower
  );
  return match?.label;
}

export function getSortedKanbanBoards(boards: KanbanBoard[]): KanbanBoard[] {
  return [...boards].sort(
    (a, b) => (a.sortOrder - b.sortOrder) || a.createdAt.localeCompare(b.createdAt)
  );
}

/**
 * Resolves the effective active board ID for a specific widget instance without mutating other widgets.
 */
export function resolveWidgetActiveBoardId(
  config: Partial<KanbanWidgetConfig> | undefined,
  boards: KanbanBoard[]
): string {
  const sorted = getSortedKanbanBoards(boards);
  if (config?.activeBoardId && sorted.some((b) => b.id === config.activeBoardId)) {
    return config.activeBoardId;
  }
  return sorted[0]?.id || '';
}

export interface KanbanEngineSnapshot {
  id: 'household_kanban';
  boards: KanbanBoard[];
  cards: KanbanCard[];
  deletedBoardIds?: string[];
  deletedCardIds?: string[];
  updated_at: string;
}
