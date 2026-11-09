import { useDashboardStore } from '../store/dashboardStore';

// Tiles that change their own config on a tap (chores, meal plans) run each change after the one
// before it, reading the stored config at that moment. Two quick taps then both count, instead of
// the second one starting from the config as it was before the first was saved.
const chains = new Map<string, Promise<void>>();

export function changeWidgetConfig(
  widgetId: string,
  compute: (config: Record<string, any>) => Record<string, any> | null
): Promise<void> {
  const previous = chains.get(widgetId) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      const store = useDashboardStore.getState();
      const widget = store.widgets.find((w) => w.id === widgetId);
      if (!widget) return;
      const updates = compute(widget.config || {});
      if (updates) await store.updateWidgetConfig(widgetId, updates);
    })
    .catch((err) => {
      console.warn('Could not save the tile change:', err);
    });
  chains.set(widgetId, next);
  return next;
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
