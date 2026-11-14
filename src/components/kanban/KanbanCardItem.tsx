import React from 'react';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import {
  resolveKanbanTagHex,
  resolveKanbanTagLabel,
  type KanbanCard,
} from '../../types/kanban';
import { ProfileAvatar } from '../common/ProfileAvatar';

export interface KanbanCardItemProps {
  card: KanbanCard;
  isLight?: boolean;
  isNightMode?: boolean;
  isDragging?: boolean;
  canStepLeft?: boolean;
  canStepRight?: boolean;
  showChevrons?: boolean;
  onOpenCard: (card: KanbanCard) => void;
  onStepLeft?: (cardId: string) => void;
  onStepRight?: (cardId: string) => void;
  cardDragProps?: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
  handleDragProps?: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
  shouldSuppressClick?: () => boolean;
}

export const KanbanCardItem: React.FC<KanbanCardItemProps> = React.memo(({
  card,
  isLight = false,
  isNightMode = false,
  isDragging = false,
  canStepLeft = false,
  canStepRight = false,
  showChevrons = true,
  onOpenCard,
  onStepLeft,
  onStepRight,
  cardDragProps,
  handleDragProps,
  shouldSuppressClick,
}) => {
  const tagHex = resolveKanbanTagHex(card.tagColor);
  const tagLabel = resolveKanbanTagLabel(card);
  const checklistCount = card.checklist?.length || 0;
  const checkedCount = checklistCount
    ? card.checklist.filter((item) => item.checked).length
    : 0;
  const isAllChecklistDone = checklistCount > 0 && checkedCount === checklistCount;
  const isDoneColumn = card.columnId === 'done';

  const cardSurfaceClass = isLight
    ? isNightMode
      ? 'bg-slate-200/80 border-slate-300/60 text-slate-700'
      : 'bg-white/90 hover:bg-white border-slate-200/80 hover:border-slate-300/90 text-slate-800 shadow-xs'
    : isNightMode
    ? 'bg-slate-900/55 border-slate-800/55 text-slate-300'
    : 'bg-slate-900/75 hover:bg-slate-900/95 border-slate-700/45 hover:border-slate-600/65 text-slate-100';

  const chevronBtnClass = isLight
    ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/70'
    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80';

  return (
    <div
      data-kanban-card-id={card.id}
      data-no-drag="true"
      {...cardDragProps}
      onClick={(e) => {
        e.stopPropagation();
        if (shouldSuppressClick?.()) return;
        onOpenCard(card);
      }}
      className={`group/kcard relative rounded-xl border px-2.5 py-2 transition-colors select-none cursor-pointer ${cardSurfaceClass} ${
        isDragging ? 'opacity-35 scale-[0.99]' : 'opacity-100'
      }`}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        {/* Touch-friendly drag handle */}
        <button
          type="button"
          data-no-drag="true"
          {...handleDragProps}
          onClick={(e) => e.stopPropagation()}
          style={{ touchAction: 'none' }}
          title="Drag card"
          aria-label="Drag card"
          className={`mt-0.5 p-0.5 -ml-1 rounded shrink-0 cursor-grab active:cursor-grabbing opacity-50 group-hover/kcard:opacity-90 transition-opacity ${
            isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-200'
          }`}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Main Card Body */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {tagHex && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border leading-none"
                style={{
                  backgroundColor: isNightMode ? `${tagHex}1a` : `${tagHex}24`,
                  borderColor: isNightMode ? `${tagHex}38` : `${tagHex}52`,
                  color: isLight ? '#334155' : '#e2e8f0',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: tagHex }}
                />
                {tagLabel && <span className="truncate max-w-[140px]">{tagLabel}</span>}
              </span>
            </div>
          )}

          <p
            className={`text-xs font-medium leading-snug break-words ${
              isDoneColumn
                ? isLight
                  ? 'text-slate-500 line-through decoration-slate-400/70'
                  : 'text-slate-400 line-through decoration-slate-500/70'
                : ''
            }`}
          >
            {card.title}
          </p>

          {(checklistCount > 0 || (card.assigneeIds && card.assigneeIds.length > 0)) && (
            <div className="flex items-center justify-between gap-2 pt-0.5">
              {/* Conditional compact checklist progress pill: only rendered when items exist */}
              {checklistCount > 0 ? (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${
                    isAllChecklistDone
                      ? 'bg-[#6b8f71]/20 border-[#6b8f71]/40 text-[#9fc2a5]'
                      : isLight
                      ? 'bg-slate-100 border-slate-200/90 text-slate-600'
                      : 'bg-slate-800/80 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <CheckSquare className="w-2.5 h-2.5 shrink-0" />
                  <span>
                    {checkedCount}/{checklistCount}
                  </span>
                </span>
              ) : (
                <span />
              )}

              {/* Global Profile Avatar(s) */}
              {card.assigneeIds && card.assigneeIds.length > 0 && (
                <div className="flex items-center -space-x-1.5 shrink-0">
                  {card.assigneeIds.slice(0, 4).map((profileId) => (
                    <ProfileAvatar
                      key={profileId}
                      profileId={profileId}
                      size="xs"
                      showRing={!isNightMode}
                      className="ring-1 ring-black/20"
                    />
                  ))}
                  {card.assigneeIds.length > 4 && (
                    <span
                      className={`w-5 h-5 rounded-full text-[9px] font-semibold inline-flex items-center justify-center border ${
                        isLight
                          ? 'bg-slate-200 border-slate-300 text-slate-700'
                          : 'bg-slate-800 border-slate-600 text-slate-200'
                      }`}
                    >
                      +{card.assigneeIds.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Single-Tap Cross-Column Chevrons for Wall Kiosk ergonomics */}
        {showChevrons && (canStepLeft || canStepRight) && (
          <div
            data-no-drag="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 shrink-0 self-center pl-0.5"
          >
            {canStepLeft && onStepLeft && (
              <button
                type="button"
                data-no-drag="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onStepLeft(card.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Move card left"
                aria-label="Move card to previous column"
                className={`p-1 rounded-lg transition-colors cursor-pointer ${chevronBtnClass}`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {canStepRight && onStepRight && (
              <button
                type="button"
                data-no-drag="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onStepRight(card.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Move card right"
                aria-label="Move card to next column"
                className={`p-1 rounded-lg transition-colors cursor-pointer ${chevronBtnClass}`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

KanbanCardItem.displayName = 'KanbanCardItem';
