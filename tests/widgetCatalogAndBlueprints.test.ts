import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
import {
  LEGACY_DEFAULT_COUNTDOWN_TARGET,
  nextChristmasLocal,
  resolveCountdownTarget,
} from '../src/utils/countdownTarget';
import { DEFAULT_WIDGETS } from '../src/services/db';

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
  'routines',
  'wifi_qr',
  'decision_maker',
  'finance',
  'timer',
  'air_quality',
  'sun_moon',
  'sports',
  'daily_discovery',
  'chalkboard',
  'soundscape',
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
  it('covers all 27 WidgetTypes cleanly across 24 entries and 4 categories', () => {
    assert.equal(WIDGET_CATALOG_ENTRIES.length, 24);
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
      ['calendar', 'meals', 'chores', 'kanban', 'routines', 'wifi_qr', 'decision_maker', 'sticky_notes', 'timer']
    );

    const recyclingResults = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'recycling');
    assert.equal(recyclingResults.some((r) => r.entry.id === 'routines'), true);

    const babysitterResults = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'babysitter');
    assert.equal(babysitterResults.some((r) => r.entry.id === 'wifi_qr'), true);

    const spinnerResults = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'spinner');
    assert.equal(spinnerResults.some((r) => r.entry.id === 'decision_maker'), true);

    const timeWeatherItems = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'time_weather', '');
    assert.equal(timeWeatherItems.some((i) => i.entry.id === 'air_quality'), true);
    assert.equal(timeWeatherItems.some((i) => i.entry.id === 'sun_moon'), true);

    assert.equal(
      filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'kitchen timer')[0]?.entry.id,
      'timer'
    );
    assert.equal(filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'pomodoro').length, 0);
    assert.equal(
      filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'pollen')[0]?.entry.id,
      'air_quality'
    );
    assert.equal(
      filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'golden hour')[0]?.entry.id,
      'sun_moon'
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

    const watchListSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'watch list');
    assert.equal(watchListSearch.length, 1);
    assert.equal(watchListSearch[0].entry.id, 'finance');

    const marketsWatchListSearch = filterWidgetCatalog(
      WIDGET_CATALOG_ENTRIES,
      'all',
      'markets and watch list'
    );
    assert.equal(marketsWatchListSearch.length, 1);
    assert.equal(marketsWatchListSearch[0].entry.id, 'finance');

    const financeEntry = marketsWatchListSearch[0].entry;
    const financePayload = buildWidgetPayloadFromVariant(financeEntry.variants[0], 'tab-home', []);
    assert.equal(financePayload.tabId, 'tab-home');
    assert.equal(financePayload.type, 'finance');
    assert.equal(financePayload.title, 'Markets & Watchlist');
    assert.ok(Array.isArray(financePayload.config?.watchlist));
    assert.ok((financePayload.config?.watchlist?.length || 0) >= 5);

    const sportsSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'text_feeds', 'scoreboard');
    assert.equal(sportsSearch.some((r) => r.entry.id === 'sports'), true);
    const nflSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'nfl');
    assert.equal(nflSearch[0]?.entry.id, 'sports');
    const sportsPayload = buildWidgetPayloadFromVariant(nflSearch[0].entry.variants[0], 'tab-home', []);
    assert.equal(sportsPayload.type, 'sports');
    assert.equal(sportsPayload.title, 'Live Sports Scoreboard');
    assert.deepEqual(sportsPayload.config?.leagues, ['nfl', 'nba']);

    for (const term of ['trivia', 'riddle', 'on this day']) {
      const discoverySearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', term);
      assert.equal(discoverySearch[0]?.entry.id, 'daily_discovery');
    }
    const discoveryEntry = WIDGET_CATALOG_ENTRIES.find((e) => e.id === 'daily_discovery')!;
    const discoveryPayload = buildWidgetPayloadFromVariant(
      discoveryEntry.variants[0],
      'tab-home',
      []
    );
    assert.equal(discoveryPayload.type, 'daily_discovery');
    assert.equal(discoveryPayload.title, 'Daily Discovery');
    assert.equal(discoveryPayload.config?.mode, 'rotate');

    for (const term of ['sketchpad', 'doodle', 'chalkboard']) {
      const chalkSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'media_ambient', term);
      assert.equal(chalkSearch[0]?.entry.id, 'chalkboard');
    }
    const chalkEntry = WIDGET_CATALOG_ENTRIES.find((e) => e.id === 'chalkboard')!;
    const chalkPayload = buildWidgetPayloadFromVariant(chalkEntry.variants[0], 'tab-home', []);
    assert.equal(chalkPayload.type, 'chalkboard');
    assert.equal(chalkPayload.title, 'Family Chalkboard & Doodle Pad');
    assert.deepEqual(chalkPayload.config?.strokes, []);

    for (const term of ['soundscape', 'brown noise', 'ocean waves']) {
      const soundSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'media_ambient', term);
      assert.equal(soundSearch[0]?.entry.id, 'soundscape');
    }
    assert.equal(
      filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'media_ambient', 'fireplace').some(
        (r) => r.entry.id === 'soundscape'
      ),
      true
    );
    const soundEntry = WIDGET_CATALOG_ENTRIES.find((e) => e.id === 'soundscape')!;
    const soundPayload = buildWidgetPayloadFromVariant(soundEntry.variants[0], 'tab-home', []);
    assert.equal(soundPayload.type, 'soundscape');
    assert.equal(soundPayload.title, 'Ambient Soundscape Mixer');
    assert.equal(soundPayload.config?.fadeOutOnNightMode, true);

    assert.equal(getDefaultTitleForWidgetType('kanban'), 'Project Board (Kanban)');
    const projectBoardSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'project board');
    assert.equal(projectBoardSearch.length, 1);
    assert.equal(projectBoardSearch[0].entry.id, 'kanban');

    const taskBoardSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'task board');
    assert.equal(taskBoardSearch.length, 1);
    assert.equal(taskBoardSearch[0].entry.id, 'kanban');

    const kanbanSearch = filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, 'all', 'kanban');
    assert.equal(kanbanSearch.length, 1);
    assert.equal(kanbanSearch[0].entry.id, 'kanban');

    const kanbanPayload = buildWidgetPayloadFromVariant(
      kanbanSearch[0].entry.variants[0],
      'tab-home',
      []
    );
    assert.equal(kanbanPayload.title, 'Project Board (Kanban)');
  });

  it('prevents AddWidgetModal and CreateCanvasModal from resetting state via onClose effect dependencies', () => {
    const repoRoot = process.cwd();
    const modalPaths = [
      path.join(repoRoot, 'src/components/widgets/AddWidgetModal.tsx'),
      path.join(repoRoot, 'src/components/dock/CreateCanvasModal.tsx'),
    ];

    for (const filePath of modalPaths) {
      const source = fs.readFileSync(filePath, 'utf8');
      const effects = source.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\n\s*\},\s*\[[^\]]*\]\);/g) || [];
      assert.ok(effects.length > 0, `${path.basename(filePath)} should have useEffect hooks`);

      for (const block of effects) {
        const depsMatch = block.match(/\}\s*,\s*\[([^\]]*)\]\);$/);
        const deps = depsMatch ? depsMatch[1] : '';
        if (/\bonClose\b/.test(deps)) {
          assert.equal(
            /set(SelectedCategory|SearchQuery|SelectedBlueprint|Name|SelectedIcon|SelectedTheme)/.test(block),
            false,
            `${path.basename(filePath)} must not reset modal state inside a useEffect depending on onClose`
          );
          assert.equal(
            /keydown/.test(block),
            false,
            `${path.basename(filePath)} Escape listener must not depend on onClose`
          );
        }
      }

      assert.equal(
        /if\s*\(\s*isOpen\s*!==\s*prevIsOpen\s*\)/.test(source),
        true,
        `${path.basename(filePath)} should reset modal state only on closed->open isOpen transitions`
      );
    }
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

    const seattleWeather = [
      {
        id: 'w-seattle',
        tabId: 'tab-1',
        type: 'weather' as const,
        title: 'Weather',
        gridPos: { x: 0, y: 0, w: 3, h: 3 },
        config: {
          locationName: 'Seattle, WA',
          latitude: 47.6062,
          longitude: -122.3321,
          timezone: 'America/Los_Angeles',
        },
      },
    ];
    const aqiEntry = WIDGET_CATALOG_ENTRIES.find((e) => e.id === 'air_quality')!;
    const sunMoonEntry = WIDGET_CATALOG_ENTRIES.find((e) => e.id === 'sun_moon')!;
    const aqiPayload = buildWidgetPayloadFromVariant(aqiEntry.variants[0], 'tab-2', seattleWeather);
    const sunMoonPayload = buildWidgetPayloadFromVariant(
      sunMoonEntry.variants[0],
      'tab-2',
      seattleWeather
    );
    assert.equal(aqiPayload.config?.locationName, 'Seattle, WA');
    assert.equal(aqiPayload.config?.latitude, 47.6062);
    assert.equal(aqiPayload.config?.longitude, -122.3321);
    assert.equal(sunMoonPayload.config?.locationName, 'Seattle, WA');
    assert.equal(sunMoonPayload.config?.latitude, 47.6062);
    assert.equal(sunMoonPayload.config?.longitude, -122.3321);
    assert.equal(sunMoonPayload.config?.timezone, 'America/Los_Angeles');
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

describe('Countdown default date', () => {
  const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()].join('-');

  it('counts down to the next 25 December at local midnight when no date is chosen', () => {
    assert.equal(ymd(nextChristmasLocal(new Date(2026, 10, 18, 12))), '2026-12-25-0');
    // On the day itself it stays on that day, then moves to next year
    assert.equal(ymd(nextChristmasLocal(new Date(2026, 11, 25, 23, 59))), '2026-12-25-0');
    assert.equal(ymd(nextChristmasLocal(new Date(2026, 11, 26, 0, 1))), '2027-12-25-0');

    for (const raw of [undefined, '', LEGACY_DEFAULT_COUNTDOWN_TARGET, 'not a date']) {
      assert.equal(ymd(resolveCountdownTarget(raw, new Date(2027, 0, 5))), '2027-12-25-0');
    }
  });

  it('keeps a date chosen in the countdown settings', () => {
    const chosen = new Date(2027, 6, 4, 9, 30).toISOString();
    assert.equal(resolveCountdownTarget(chosen, new Date(2027, 0, 5)).toISOString(), chosen);
    // Midnight UTC on 25 December saved from the settings (with milliseconds) is a real choice
    assert.equal(
      resolveCountdownTarget('2026-12-25T00:00:00.000Z').toISOString(),
      '2026-12-25T00:00:00.000Z'
    );
  });

  it('no longer stores a fixed date in new or starter countdowns', () => {
    const entry = WIDGET_CATALOG_ENTRIES.find((e) => e.variants.some((v) => v.type === 'countdown'));
    const variant = entry?.variants.find((v) => v.type === 'countdown');
    assert.ok(variant);
    assert.equal(variant.defaultConfig.targetDate, undefined);
    const starter = DEFAULT_WIDGETS.find((w) => w.type === 'countdown');
    assert.ok(starter);
    assert.equal(starter.config?.targetDate, undefined);
  });
});
