import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { useKanbanStore } from '../src/stores/useKanbanStore.ts';
import {
  resolveWidgetActiveBoardId,
  type KanbanBoard,
  type KanbanCard,
  type KanbanEngineSnapshot,
  type KanbanWidgetConfig,
} from '../src/types/kanban.ts';

function seedKanbanStore(
  boards: KanbanBoard[] = [],
  cards: KanbanCard[] = []
): void {
  const nowIso = '2026-11-01T12:00:00.000Z';
  const snapshot: KanbanEngineSnapshot = {
    id: 'household_kanban',
    boards,
    cards,
    deletedBoardIds: [],
    deletedCardIds: [],
    updated_at: nowIso,
  };
  useKanbanStore.setState({
    isInitialized: true,
    boards,
    cards,
    snapshot,
  });
}

describe('useKanbanStore & Multi-Board Kanban Engine', () => {
  beforeEach(() => {
    const initialBoard: KanbanBoard = {
      id: 'board-main',
      name: 'Household Maintenance',
      autoArchiveDays: 7,
      sortOrder: 1000,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    seedKanbanStore([initialBoard], []);
  });

  it('sets completedAt on entering done, preserves it when reordering in done, and clears it when moved back out', async () => {
    const t0 = new Date('2026-11-01T10:00:00.000Z');
    const cardA = await useKanbanStore.getState().addCard({
      boardId: 'board-main',
      columnId: 'todo',
      title: 'Replace HVAC filters',
      now: t0,
    });
    const cardB = await useKanbanStore.getState().addCard({
      boardId: 'board-main',
      columnId: 'done',
      title: 'Clean dryer vent',
      now: t0,
    });

    assert.ok(cardA);
    assert.ok(cardB);
    assert.equal(cardA.completedAt, undefined);
    assert.equal(cardB.completedAt, t0.toISOString());

    // Step cardA: todo -> in_progress -> done
    const tInProgress = new Date('2026-11-01T11:00:00.000Z');
    await useKanbanStore.getState().stepCardColumn(cardA.id, 'right', tInProgress);
    let currentA = useKanbanStore.getState().cards.find((c) => c.id === cardA.id)!;
    assert.equal(currentA.columnId, 'in_progress');
    assert.equal(currentA.completedAt, undefined);

    const tDone = new Date('2026-11-02T14:30:00.000Z');
    await useKanbanStore.getState().stepCardColumn(cardA.id, 'right', tDone);
    currentA = useKanbanStore.getState().cards.find((c) => c.id === cardA.id)!;
    assert.equal(currentA.columnId, 'done');
    assert.equal(currentA.completedAt, tDone.toISOString());

    // Reordering inside 'done' must preserve original completedAt
    const tReorder = new Date('2026-11-03T09:00:00.000Z');
    await useKanbanStore.getState().moveCard(cardA.id, 'done', 0, tReorder);
    currentA = useKanbanStore.getState().cards.find((c) => c.id === cardA.id)!;
    assert.equal(currentA.columnId, 'done');
    assert.equal(currentA.completedAt, tDone.toISOString());

    // Moving back out of 'done' clears completedAt
    const tReopen = new Date('2026-11-03T10:00:00.000Z');
    await useKanbanStore.getState().stepCardColumn(cardA.id, 'left', tReopen);
    currentA = useKanbanStore.getState().cards.find((c) => c.id === cardA.id)!;
    assert.equal(currentA.columnId, 'in_progress');
    assert.equal(currentA.completedAt, undefined);

    // Moving from 'done' directly to 'todo' also clears completedAt
    await useKanbanStore.getState().moveCard(cardB.id, 'todo', 0, tReopen);
    const currentB = useKanbanStore.getState().cards.find((c) => c.id === cardB.id)!;
    assert.equal(currentB.columnId, 'todo');
    assert.equal(currentB.completedAt, undefined);
  });

  it('evaluates autoArchiveDays threshold accurately and supports manual archiveAllDone', async () => {
    const manualOnlyBoard = await useKanbanStore.getState().createBoard({
      name: 'Manual Archive Board',
      autoArchiveDays: null,
    });
    assert.ok(manualOnlyBoard);

    const completedAt = new Date('2026-11-01T12:00:00.000Z');
    const cAuto = await useKanbanStore.getState().addCard({
      boardId: 'board-main',
      columnId: 'done',
      title: 'Fix porch latch',
      now: completedAt,
    });
    const cDisabled = await useKanbanStore.getState().addCard({
      boardId: manualOnlyBoard.id,
      columnId: 'done',
      title: 'Print filament spool clip',
      now: completedAt,
    });
    assert.ok(cAuto && cDisabled);

    // Day 6 + 23h (before 7-day threshold): should NOT archive yet
    const beforeThreshold = new Date('2026-11-08T11:59:59.000Z');
    const countBefore = await useKanbanStore.getState().evaluateAutoArchive(beforeThreshold);
    assert.equal(countBefore, 0);
    assert.equal(
      useKanbanStore.getState().cards.find((c) => c.id === cAuto.id)?.isArchived,
      false
    );

    // Day 7 exact threshold: should archive board-main card ONLY, not manualOnlyBoard card
    const atThreshold = new Date('2026-11-08T12:00:00.000Z');
    const countAt = await useKanbanStore.getState().evaluateAutoArchive(atThreshold);
    assert.equal(countAt, 1);

    const autoAfter = useKanbanStore.getState().cards.find((c) => c.id === cAuto.id)!;
    const disabledAfter = useKanbanStore.getState().cards.find((c) => c.id === cDisabled.id)!;
    assert.equal(autoAfter.isArchived, true);
    assert.equal(autoAfter.archivedAt, atThreshold.toISOString());
    assert.equal(disabledAfter.isArchived, false);

    // Manual Archive All Done sweeps remaining Done cards on the target board only
    await useKanbanStore.getState().addCard({
      boardId: manualOnlyBoard.id,
      columnId: 'todo',
      title: 'Keep me in todo',
    });
    const swept = await useKanbanStore.getState().archiveAllDone(manualOnlyBoard.id, atThreshold);
    assert.equal(swept, 1);
    const manualCards = useKanbanStore.getState().cards.filter((c) => c.boardId === manualOnlyBoard.id);
    assert.equal(manualCards.find((c) => c.id === cDisabled.id)?.isArchived, true);
    assert.equal(manualCards.find((c) => c.title === 'Keep me in todo')?.isArchived, false);
  });

  it('maintains independent activeBoardId per widget instance and falls back cleanly on board deletion', async () => {
    const tripBoard = await useKanbanStore.getState().createBoard({
      name: 'Trip Packing',
      autoArchiveDays: null,
    });
    assert.ok(tripBoard);

    const widgetKitchen: KanbanWidgetConfig = {
      widgetInstanceId: 'widget-kitchen',
      activeBoardId: 'board-main',
      activeColumnId: 'in_progress',
    };
    const widgetHallway: KanbanWidgetConfig = {
      widgetInstanceId: 'widget-hallway',
      activeBoardId: tripBoard.id,
      activeColumnId: 'todo',
    };

    const boards = useKanbanStore.getState().boards;
    assert.equal(resolveWidgetActiveBoardId(widgetKitchen, boards), 'board-main');
    assert.equal(resolveWidgetActiveBoardId(widgetHallway, boards), tripBoard.id);

    // Deleting tripBoard leaves widgetKitchen untouched and falls back widgetHallway safely
    await useKanbanStore.getState().deleteBoard(tripBoard.id);
    const remainingBoards = useKanbanStore.getState().boards;
    assert.equal(resolveWidgetActiveBoardId(widgetKitchen, remainingBoards), 'board-main');
    assert.equal(resolveWidgetActiveBoardId(widgetHallway, remainingBoards), 'board-main');
  });

  it('permanently deletes Done cards on clearDoneCards while Archive Drawer restore preserves checklists', async () => {
    const tripBoard = await useKanbanStore.getState().createBoard({
      name: 'Camping Checklist',
      autoArchiveDays: 7,
    });
    assert.ok(tripBoard);

    const packingCard = await useKanbanStore.getState().addCard({
      boardId: tripBoard.id,
      columnId: 'done',
      title: 'Pack Tent Gear',
      assigneeIds: ['prof-1', 'prof-2'],
      checklist: [
        { id: 'chk-1', text: 'Tent stakes', checked: true },
        { id: 'chk-2', text: 'Rain fly', checked: true },
      ],
    });
    const activeTodo = await useKanbanStore.getState().addCard({
      boardId: tripBoard.id,
      columnId: 'todo',
      title: 'Buy propane canisters',
    });
    assert.ok(packingCard && activeTodo);

    // Archive packingCard so it sits safely in Archive Drawer
    await useKanbanStore.getState().archiveAllDone(tripBoard.id);

    // Add two fresh Done cards and clear Done permanently
    const trashDone1 = await useKanbanStore.getState().addCard({
      boardId: tripBoard.id,
      columnId: 'done',
      title: 'Check tire pressure',
    });
    const trashDone2 = await useKanbanStore.getState().addCard({
      boardId: tripBoard.id,
      columnId: 'done',
      title: 'Charge flashlights',
    });
    const otherBoardDone = await useKanbanStore.getState().addCard({
      boardId: 'board-main',
      columnId: 'done',
      title: 'Other board card stays',
    });
    assert.ok(trashDone1 && trashDone2 && otherBoardDone);

    const deletedCount = await useKanbanStore.getState().clearDoneCards(tripBoard.id);
    assert.equal(deletedCount, 2);

    const stateAfterClear = useKanbanStore.getState();
    assert.equal(stateAfterClear.cards.some((c) => c.id === trashDone1.id), false);
    assert.equal(stateAfterClear.cards.some((c) => c.id === trashDone2.id), false);
    assert.ok(stateAfterClear.snapshot.deletedCardIds?.includes(trashDone1.id));
    assert.ok(stateAfterClear.snapshot.deletedCardIds?.includes(trashDone2.id));

    // Todo card, other board Done card, and archived packingCard MUST still exist
    assert.equal(stateAfterClear.cards.some((c) => c.id === activeTodo.id), true);
    assert.equal(stateAfterClear.cards.some((c) => c.id === otherBoardDone.id), true);
    assert.equal(stateAfterClear.cards.some((c) => c.id === packingCard.id), true);

    // Restore packingCard from Archive back to To Do -> checklist intact & completedAt cleared
    await useKanbanStore.getState().restoreArchivedCard(packingCard.id, 'todo');
    const restored = useKanbanStore.getState().cards.find((c) => c.id === packingCard.id)!;
    assert.equal(restored.isArchived, false);
    assert.equal(restored.archivedAt, undefined);
    assert.equal(restored.columnId, 'todo');
    assert.equal(restored.completedAt, undefined);
    assert.deepEqual(restored.checklist, [
      { id: 'chk-1', text: 'Tent stakes', checked: true },
      { id: 'chk-2', text: 'Rain fly', checked: true },
    ]);

    // Archive another card then test emptyArchive only removes archived cards on that board
    const toArchiveThenEmpty = await useKanbanStore.getState().addCard({
      boardId: tripBoard.id,
      columnId: 'done',
      title: 'Seasonal sweep',
    });
    assert.ok(toArchiveThenEmpty);
    await useKanbanStore.getState().archiveAllDone(tripBoard.id);
    const emptied = await useKanbanStore.getState().emptyArchive(tripBoard.id);
    assert.equal(emptied, 1);
    assert.equal(useKanbanStore.getState().cards.some((c) => c.id === toArchiveThenEmpty.id), false);
    assert.equal(useKanbanStore.getState().cards.some((c) => c.id === restored.id), true);
  });

  it('reorders cards cleanly under repeated fractional bisections and syncs remote rows LWW', async () => {
    const c1 = await useKanbanStore.getState().addCard({
      boardId: 'board-main',
      columnId: 'in_progress',
      title: 'Card 1',
    });
    const c2 = await useKanbanStore.getState().addCard({
      boardId: 'board-main',
      columnId: 'in_progress',
      title: 'Card 2',
    });
    const c3 = await useKanbanStore.getState().addCard({
      boardId: 'board-main',
      columnId: 'in_progress',
      title: 'Card 3',
    });
    assert.ok(c1 && c2 && c3);

    // Repeatedly swap index 1 & index 0 to collapse float gap and trigger clean reindex
    for (let i = 0; i < 24; i += 1) {
      await useKanbanStore.getState().moveCard(i % 2 === 0 ? c2.id : c1.id, 'in_progress', 1);
    }

    const ordered = useKanbanStore
      .getState()
      .cards.filter((c) => c.boardId === 'board-main' && c.columnId === 'in_progress')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    assert.equal(ordered.length, 3);
    assert.ok(ordered[0].sortOrder < ordered[1].sortOrder);
    assert.ok(ordered[1].sortOrder < ordered[2].sortOrder);

    // Remote row LWW test: ignore stale update, apply newer update
    const remoteBoardNew: KanbanBoard = {
      id: 'board-main',
      name: 'Household Updated Remotely',
      autoArchiveDays: 14,
      sortOrder: 1000,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    };
    await useKanbanStore.getState().applyRemoteBoardRow(remoteBoardNew, 'UPDATE');
    assert.equal(
      useKanbanStore.getState().boards.find((b) => b.id === 'board-main')?.name,
      'Household Updated Remotely'
    );

    const staleBoard: KanbanBoard = {
      ...remoteBoardNew,
      name: 'Stale Name Should Be Ignored',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    await useKanbanStore.getState().applyRemoteBoardRow(staleBoard, 'UPDATE');
    assert.equal(
      useKanbanStore.getState().boards.find((b) => b.id === 'board-main')?.name,
      'Household Updated Remotely'
    );
  });
});
