import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DashboardWidget, FreeformPosition, WidgetType } from '../src/types/dashboard';
import {
  WIDGET_CATEGORIES,
  WIDGET_CATALOG_ENTRIES,
  buildWidgetPayloadFromVariant,
  countActiveTabWidgetsForEntry,
  extractHouseholdInheritedDefaults,
  filterWidgetCatalog,
  getDefaultTitleForWidgetType,
  isClockFamilyType,
  isDefaultModeFamilyTitle,
  isTextFamilyType,
} from '../src/utils/widgetCatalog';
import { CANVAS_BLUEPRINTS, materializeCanvasBlueprint } from '../src/utils/canvasBlueprints';

const ALL_WIDGET_TYPES: WidgetType[] = [
  'clock_weather',
  'clock',
  'world_clock',
  'weather',
  'sticky_notes',
  'photo_frame',
  'calendar',
  'countdown',
  'rss',
  'quotes',
  'embed',
  'textbox',
  'image',
  'chores',
  'meals',
  'kanban',
  'finance',
];

function makeWidget(
  id: string,
  type: WidgetType,
  overrides: Partial<DashboardWidget> = {}
): DashboardWidget {
  return {
    id,
    tabId: 'tab-home',
    type,
    title: type,
    gridPos: { x: 0, y: 0, w: 4, h: 4 },
    freeformPos: { xRatio: 0.1, yRatio: 0.1, wRatio: 0.3, hRatio: 0.4, zIndex: 1, rotation: 0 },
    config: {},
    updated_at: '2026-11-14T12:00:00.000Z',
    ...overrides,
  };
}

function boxesOverlap(a: FreeformPosition, b: FreeformPosition): boolean {
  const epsilon = 1e-6;
  const xOverlap = a.xRatio < b.xRatio + b.wRatio - epsilon && b.xRatio < a.xRatio + a.wRatio - epsilon;
  const yOverlap = a.yRatio < b.yRatio + b.hRatio - epsilon && b.yRatio < a.yRatio + a.hRatio - epsilon;
  return xOverlap && yOverlap;
}

describe('widgetCatalog', () => {
  it('covers all 17 WidgetTypes cleanly across 14 entries and 4 categories', () => {
    assert.equal(WIDGET_CATALOG_ENTRIES.length, 14);
    assert.deepEqual(
      WIDGET_CATEGORIES.map((c) => c.id),
      ['all', 'household', 'time_weather', 'media_ambient', 'text_feeds']
    );

    const seenTypes = new Set<WidgetType>();
    for (const entry of WIDGET_CATALOG_ENTRIES) {
      for (const variant of entry.variants) {
        assert.equal(seenTypes.has(variant.type), false, `Duplicate variant type ${variant.type}`);
        seenTypes.add(variant.type);
      }
    }

    assert.equal(seenTypes.size, ALL_WIDGET_TYPES.length);
    for (const expectedType of ALL_WIDGET_TYPES) {
      assert.equal(seenTypes.has(expectedType), true, `Missing widget type ${expectedType}`);
    }
  });

  it('filters by category and resolves matchedVariantType for variant search queries', () => {
    const householdItems = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'household', '');
    assert.deepEqual(
      householdItems.map((i) => i.entry.id),
      ['calendar', 'meals', 'chores', 'kanban', 'sticky_notes']
    );

    const worldSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'world');
    assert.equal(worldSearch.length, 1);
    assert.equal(worldSearch[0].entry.id, 'clock_group');
    assert.equal(worldSearch[0].matchedVariantType, 'world_clock');

    const quoteSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'quotes');
    assert.equal(quoteSearch.length, 1);
    assert.equal(quoteSearch[0].entry.id, 'text_group');
    assert.equal(quoteSearch[0].matchedVariantType, 'quotes');

    const clockSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'time_weather', 'clock');
    assert.equal(clockSearch[0].entry.id, 'clock_group');
    assert.equal(clockSearch[0].matchedVariantType, undefined);

    const noMatch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'media_ambient', 'kanban');
    assert.equal(noMatch.length, 0);

    const financeSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'text_feeds', 'bitcoin');
    assert.equal(financeSearch.length, 1);
    assert.equal(financeSearch[0].entry.id, 'finance');

    const stocksSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'stocks');
    assert.equal(stocksSearch[0].entry.id, 'finance');
  });

  it('counts active-tab widgets per catalog entry excluding other tabs and tombstones', () => {
    const clockEntry = WIDGET_CATALOG_ENTRIES.find((e) => e.id === 'clock_group')!;
    const widgets: DashboardWidget[] = [
      makeWidget('w1', 'clock_weather', { tabId: 'tab-home' }),
      makeWidget('w2', 'clock', { tabId: 'tab-home' }),
      makeWidget('w3', 'world_clock', { tabId: 'tab-home', deleted_at: '2026-11-14T13:00:00.000Z' }),
      makeWidget('w4', 'world_clock', { tabId: 'tab-other' }),
      makeWidget('w5', 'weather', { tabId: 'tab-home' }),
    ];

    assert.equal(countActiveTabWidgetsForEntry(clockEntry, widgets, 'tab-home'), 2);
    assert.equal(countActiveTabWidgetsForEntry(clockEntry, widgets, 'tab-other'), 1);
  });

  it('inherits newest Weather location and Calendar sources into newly built widgets', () => {
    const existing: DashboardWidget[] = [
      makeWidget('old-weather', 'weather', {
        updated_at: '2026-11-10T10:00:00.000Z',
        config: { locationName: 'Dallas, TX', latitude: 32.7767, longitude: -96.797, unit: 'F' },
      }),
      makeWidget('deleted-weather', 'clock_weather', {
        updated_at: '2026-11-14T15:00:00.000Z',
        deleted_at: '2026-11-14T15:05:00.000Z',
        config: { locationName: 'Mars Base', latitude: 0, longitude: 0, unit: 'C' },
      }),
      makeWidget('new-weather', 'clock_weather', {
        updated_at: '2026-11-14T14:00:00.000Z',
        config: {
          locationName: 'Seattle, WA',
          latitude: 47.6062,
          longitude: -122.3321,
          unit: 'C',
          timezone: 'America/Los_Angeles',
        },
      }),
      makeWidget('cal-1', 'calendar', {
        config: {
          sources: [
            { id: 'fam', name: 'Family', url: 'https://example.com/fam.ics', color: '#10b981', enabled: true },
          ],
        },
      }),
    ];

    const inherited = extractHouseholdInheritedDefaults(existing);
    assert.equal(inherited.hasCustomWeather, true);
    assert.equal(inherited.weather.locationName, 'Seattle, WA');
    assert.equal(inherited.weather.unit, 'C');
    assert.equal(inherited.weather.timezone, 'America/Los_Angeles');
    assert.equal(inherited.calendarSources?.length, 1);

    const clockEntry = WIDGET_CATALOG_ENTRIES.find((e) => e.id === 'clock_group')!;
    const cwPayload = buildWidgetPayloadFromVariant(clockEntry.variants[0], 'tab-2', existing);
    assert.equal(cwPayload.tabId, 'tab-2');
    assert.equal(cwPayload.config?.locationName, 'Seattle, WA');
    assert.equal(cwPayload.config?.latitude, 47.6062);
    assert.equal(cwPayload.config?.unit, 'C');

    const calEntry = WIDGET_CATALOG_ENTRIES.find((e) => e.id === 'calendar')!;
    const calPayload = buildWidgetPayloadFromVariant(calEntry.variants[0], 'tab-2', existing);
    assert.deepEqual(calPayload.config?.sources, existing[3].config.sources);
    // Cloned so edits to new widget don't mutate source widget config
    assert.notEqual(calPayload.config?.sources?.[0], existing[3].config.sources[0]);

    const fallback = extractHouseholdInheritedDefaults([]);
    assert.equal(fallback.hasCustomWeather, false);
    assert.equal(fallback.weather.locationName, 'Austin, TX');
    assert.equal(fallback.calendarSources, undefined);
  });

  it('identifies Clock and Text mode families and default titles accurately', () => {
    assert.equal(isClockFamilyType('clock_weather'), true);
    assert.equal(isClockFamilyType('clock'), true);
    assert.equal(isClockFamilyType('world_clock'), true);
    assert.equal(isClockFamilyType('weather'), false);

    assert.equal(isTextFamilyType('textbox'), true);
    assert.equal(isTextFamilyType('quotes'), true);
    assert.equal(isTextFamilyType('rss'), false);

    assert.equal(isDefaultModeFamilyTitle('clock', 'Ambient Clock'), true);
    assert.equal(isDefaultModeFamilyTitle('clock', 'Kitchen Clock'), false);
    assert.equal(isDefaultModeFamilyTitle('text', 'Daily Inspiration & Affirmations'), true);
    assert.equal(isDefaultModeFamilyTitle('text', 'House Rules'), false);
    assert.equal(getDefaultTitleForWidgetType('world_clock'), 'World Timezone Clock');
  });
});

describe('canvasBlueprints', () => {
  it('materializes Blank, Family Command, Kitchen & Meals, and Ambient Photo Gallery blueprints', () => {
    assert.deepEqual(
      CANVAS_BLUEPRINTS.map((bp) => bp.id),
      ['blank', 'family_command', 'kitchen_meals', 'photo_gallery']
    );

    const existing: DashboardWidget[] = [
      makeWidget('w-loc', 'weather', {
        config: { locationName: 'Denver, CO', latitude: 39.7392, longitude: -104.9903, unit: 'F' },
      }),
      makeWidget('w-cal', 'calendar', {
        config: {
          sources: [{ id: 'school', name: 'School', url: 'https://example.com/s.ics', color: '#3b82f6', enabled: true }],
        },
      }),
    ];

    const blank = materializeCanvasBlueprint('blank', {
      tabId: 'tab-blank',
      existingWidgets: existing,
      nowMs: 1000,
    });
    assert.equal(blank.widgets.length, 0);
    assert.equal(blank.notes.length, 0);

    const family = materializeCanvasBlueprint('family_command', {
      tabId: 'tab-fam',
      existingWidgets: existing,
      nowMs: 2000,
    });
    assert.deepEqual(
      family.widgets.map((w) => w.type),
      ['clock_weather', 'chores', 'calendar']
    );
    assert.equal(family.widgets[0].config.locationName, 'Denver, CO');
    assert.equal(family.widgets[2].config.showMeals, true);
    assert.deepEqual(family.widgets[2].config.sources, existing[1].config.sources);
    for (let i = 0; i < family.widgets.length; i++) {
      for (let j = i + 1; j < family.widgets.length; j++) {
        assert.equal(
          boxesOverlap(family.widgets[i].freeformPos, family.widgets[j].freeformPos),
          false,
          'Family Command widgets must not overlap'
        );
      }
    }

    const kitchen = materializeCanvasBlueprint('kitchen_meals', {
      tabId: 'tab-kitchen',
      existingWidgets: existing,
      nowMs: 3000,
    });
    assert.equal(kitchen.widgets.length, 2);
    assert.equal(kitchen.notes.length, 1);
    const shopNote = kitchen.notes[0];
    assert.equal(shopNote.isShoppingList, true);
    assert.equal(kitchen.widgets[0].type, 'meals');
    assert.equal(kitchen.widgets[0].config.listNoteId, shopNote.id);
    const kitchenBoxes = [
      ...kitchen.widgets.map((w) => w.freeformPos),
      ...kitchen.notes.map((n) => n.freeformPos),
    ];
    for (let i = 0; i < kitchenBoxes.length; i++) {
      for (let j = i + 1; j < kitchenBoxes.length; j++) {
        assert.equal(
          boxesOverlap(kitchenBoxes[i], kitchenBoxes[j]),
          false,
          'Kitchen & Meals widgets and Shopping List note must not overlap'
        );
      }
    }

    const gallery = materializeCanvasBlueprint('photo_gallery', {
      tabId: 'tab-photos',
      existingWidgets: existing,
      defaultWidgetStyle: 'bordered',
      nowMs: 4000,
    });
    assert.equal(gallery.tabUpdates.hideNotes, true);
    assert.equal(gallery.tabUpdates.backgroundTheme, 'oled_black');
    assert.equal(gallery.widgets[0].type, 'photo_frame');
    assert.equal(gallery.widgets[0].config.transparentBg, true);
    assert.equal(gallery.widgets[1].type, 'clock_weather');
    assert.equal(gallery.widgets[1].config.transparentBg, true);
    assert.equal(gallery.widgets[1].config.locationName, 'Denver, CO');
  });
});
