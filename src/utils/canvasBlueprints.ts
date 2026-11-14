import type {
  CanvasBackgroundTheme,
  DashboardTab,
  DashboardWidget,
  DefaultWidgetFrameStyle,
  StickyNoteItem,
} from '../types/dashboard';
import { extractHouseholdInheritedDefaults } from './widgetCatalog';
import { getDefaultWidgetStickerMode, isStickerCapableWidget } from './widgetStickerMode';

export type CanvasBlueprintId = 'blank' | 'family_command' | 'kitchen_meals' | 'photo_gallery';

export interface CanvasBlueprintSpec {
  id: CanvasBlueprintId;
  title: string;
  suggestedName: string;
  suggestedIcon: string;
  suggestedTheme: CanvasBackgroundTheme;
  hideNotes: boolean;
  badge: string;
  summary: string;
}

export const CANVAS_BLUEPRINTS: CanvasBlueprintSpec[] = [
  {
    id: 'blank',
    title: 'Blank Canvas',
    suggestedName: '',
    suggestedIcon: 'Pin',
    suggestedTheme: 'midnight_dots',
    hideNotes: false,
    badge: 'Empty Slate',
    summary: 'Start clean and add any mix of tiles or sticky notes.',
  },
  {
    id: 'family_command',
    title: 'Family Command',
    suggestedName: 'Family Command',
    suggestedIcon: 'Home',
    suggestedTheme: 'midnight_dots',
    hideNotes: false,
    badge: '3 Tiles',
    summary: 'Clock & Weather, Agenda Calendar (with Meals), and Chores & Rewards.',
  },
  {
    id: 'kitchen_meals',
    title: 'Kitchen & Meals',
    suggestedName: 'Kitchen & Meals',
    suggestedIcon: 'Utensils',
    suggestedTheme: 'midnight_dots',
    hideNotes: false,
    badge: '2 Tiles + List',
    summary: 'Meal Planner linked to a Shopping List sticky note plus Ambient Stream.',
  },
  {
    id: 'photo_gallery',
    title: 'Ambient Photo Gallery',
    suggestedName: 'Photo Gallery',
    suggestedIcon: 'Image',
    suggestedTheme: 'oled_black',
    hideNotes: true,
    badge: 'Full-Screen',
    summary: 'Full-screen Photo Frame + Sticker Clock & Weather (Sticky Notes hidden).',
  },
];

export interface MaterializedCanvasBlueprint {
  tabUpdates: Partial<Pick<DashboardTab, 'hideNotes' | 'backgroundTheme'>>;
  widgets: DashboardWidget[];
  notes: StickyNoteItem[];
}

export interface MaterializeBlueprintOptions {
  tabId: string;
  existingWidgets: DashboardWidget[];
  defaultWidgetStyle?: DefaultWidgetFrameStyle;
  nowMs?: number;
}

export function materializeCanvasBlueprint(
  blueprintId: CanvasBlueprintId,
  options: MaterializeBlueprintOptions
): MaterializedCanvasBlueprint {
  if (blueprintId === 'blank') {
    return { tabUpdates: {}, widgets: [], notes: [] };
  }

  const nowMs = options.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const defaultStyle = options.defaultWidgetStyle || 'auto';
  const inherited = extractHouseholdInheritedDefaults(options.existingWidgets);
  const { tabId } = options;

  const finalizeWidget = (
    widget: Omit<DashboardWidget, 'mobileOrder' | 'updated_at'>,
    mobileOrder: number
  ): DashboardWidget => {
    const config: Record<string, any> = { ...(widget.config || {}) };
    if (isStickerCapableWidget(widget.type) && typeof config.transparentBg !== 'boolean') {
      config.transparentBg = getDefaultWidgetStickerMode(widget.type, defaultStyle);
    }
    return {
      ...widget,
      mobileOrder,
      config,
      updated_at: nowIso,
    };
  };

  if (blueprintId === 'family_command') {
    const rawWidgets: Array<Omit<DashboardWidget, 'mobileOrder' | 'updated_at'>> = [
      {
        id: `widget-${nowMs}-cw`,
        tabId,
        type: 'clock_weather',
        title: 'Clock & Weather',
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        freeformPos: { xRatio: 0.03, yRatio: 0.04, wRatio: 0.30, hRatio: 0.36, zIndex: 1, rotation: 0 },
        config: {
          locationName: inherited.weather.locationName,
          latitude: inherited.weather.latitude,
          longitude: inherited.weather.longitude,
          unit: inherited.weather.unit,
          ...(inherited.weather.timezone ? { timezone: inherited.weather.timezone } : {}),
          face: 'digital',
          clockFace: 'digital',
          showSeconds: true,
        },
      },
      {
        id: `widget-${nowMs}-chores`,
        tabId,
        type: 'chores',
        title: 'Family Chores & Rewards',
        gridPos: { x: 0, y: 4, w: 4, h: 8 },
        freeformPos: { xRatio: 0.03, yRatio: 0.43, wRatio: 0.30, hRatio: 0.53, zIndex: 2, rotation: 0 },
        config: {
          scope: 'household',
          displayMode: 'tile',
          defaultExpandedSections: ['today', 'review'],
        },
      },
      {
        id: `widget-${nowMs}-calendar`,
        tabId,
        type: 'calendar',
        title: 'Family Calendar',
        gridPos: { x: 4, y: 0, w: 8, h: 12 },
        freeformPos: { xRatio: 0.35, yRatio: 0.04, wRatio: 0.62, hRatio: 0.92, zIndex: 3, rotation: 0 },
        config: {
          defaultView: 'agenda',
          showMeals: true,
          ...(inherited.calendarSources
            ? { sources: inherited.calendarSources.map((s) => ({ ...s })) }
            : {}),
        },
      },
    ];

    return {
      tabUpdates: {},
      widgets: rawWidgets.map((w, idx) => finalizeWidget(w, idx)),
      notes: [],
    };
  }

  if (blueprintId === 'kitchen_meals') {
    const noteId = `note-${nowMs}-shop`;
    const shoppingNote: StickyNoteItem = {
      id: noteId,
      tabId,
      title: '🛒 Shopping List',
      content: '',
      isChecklist: true,
      isShoppingList: true,
      checklistItems: [],
      bgColor: '#bbf7d0',
      fontSize: 'base',
      freeformPos: {
        xRatio: 0.63,
        yRatio: 0.04,
        wRatio: 0.34,
        hRatio: 0.48,
        zIndex: 2,
        rotation: 0,
        isShoppingList: true,
      },
      updated_at: nowIso,
    };

    const rawWidgets: Array<Omit<DashboardWidget, 'mobileOrder' | 'updated_at'>> = [
      {
        id: `widget-${nowMs}-meals`,
        tabId,
        type: 'meals',
        title: 'Family Meal Planner',
        gridPos: { x: 0, y: 0, w: 7, h: 12 },
        freeformPos: { xRatio: 0.03, yRatio: 0.04, wRatio: 0.58, hRatio: 0.92, zIndex: 1, rotation: 0 },
        config: {
          scope: 'three_day',
          visibleSlots: ['breakfast', 'lunch', 'dinner'],
          showCookAvatar: true,
          listNoteId: noteId,
        },
      },
      {
        id: `widget-${nowMs}-embed`,
        tabId,
        type: 'embed',
        title: 'Ambient Stream',
        gridPos: { x: 7, y: 6, w: 5, h: 6 },
        freeformPos: { xRatio: 0.63, yRatio: 0.55, wRatio: 0.34, hRatio: 0.41, zIndex: 3, rotation: 0 },
        config: {
          preset: 'lofi',
          muted: true,
          customUrl: '',
        },
      },
    ];

    return {
      tabUpdates: {},
      widgets: rawWidgets.map((w, idx) => finalizeWidget(w, idx)),
      notes: [shoppingNote],
    };
  }

  // 'photo_gallery'
  const rawWidgets: Array<Omit<DashboardWidget, 'mobileOrder' | 'updated_at'>> = [
    {
      id: `widget-${nowMs}-photos`,
      tabId,
      type: 'photo_frame',
      title: 'Ambient Photo Frame',
      gridPos: { x: 0, y: 0, w: 12, h: 12 },
      freeformPos: { xRatio: 0.02, yRatio: 0.03, wRatio: 0.96, hRatio: 0.94, zIndex: 1, rotation: 0 },
      config: {
        displayStyle: 'ken_burns',
        rotationIntervalSec: 15,
        useCommonSource: true,
        transparentBg: true,
      },
    },
    {
      id: `widget-${nowMs}-clock`,
      tabId,
      type: 'clock_weather',
      title: 'Clock & Weather',
      gridPos: { x: 0, y: 8, w: 4, h: 4 },
      freeformPos: { xRatio: 0.05, yRatio: 0.70, wRatio: 0.28, hRatio: 0.23, zIndex: 5, rotation: 0 },
      config: {
        locationName: inherited.weather.locationName,
        latitude: inherited.weather.latitude,
        longitude: inherited.weather.longitude,
        unit: inherited.weather.unit,
        ...(inherited.weather.timezone ? { timezone: inherited.weather.timezone } : {}),
        face: 'digital',
        clockFace: 'digital',
        clockAlign: 'left',
        showSeconds: false,
        transparentBg: true,
      },
    },
  ];

  return {
    tabUpdates: {
      hideNotes: true,
      backgroundTheme: 'oled_black',
    },
    widgets: rawWidgets.map((w, idx) => finalizeWidget(w, idx)),
    notes: [],
  };
}
