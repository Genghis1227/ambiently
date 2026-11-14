import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatHourLabel, startOfWeek, useTimePrefs, weekdayLabels } from '../../utils/timePrefs';
import {
  Calendar as CalendarIcon,
  Clock,
  Columns,
  MapPin,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  HelpCircle,
} from 'lucide-react';
import {
  fetchCalendarEvents,
  getCachedCalendarEvents,
  type CalendarEvent,
  type CalendarSource,
  getVisibleCalendarFeedProblems,
  type CalendarFeedStatus,
} from '../../services/feeds';
import { useMealStore } from '../../stores/useMealStore';
import { localDateKey } from '../../utils/dateKey';
import {
  MEAL_PLANNER_CALENDAR_ID,
  MEAL_SLOT_CALENDAR_META,
  MEAL_SLOT_ORDER,
  scheduledMealsToCalendarEvents,
} from '../../utils/mealCalendarEvents';
import { CalendarUrlGuideModal } from '../calendar/CalendarUrlGuideModal';

export type CalendarViewMode = 'agenda' | '3day' | 'week' | 'month';
export type MultiDayLayout = 'cards' | 'timeline';

interface CalendarWidgetProps {
  sources?: CalendarSource[];
  defaultView?: CalendarViewMode;
  multiDayLayout?: MultiDayLayout;
  showMeals?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
  isLight?: boolean;
}

const HOUR_HEIGHT = 58; // pixels per hour for vertical timeline grid
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHourGutter(hour: number, hour12: boolean): string {
  return formatHourLabel(hour, { hour12 });
}

interface TimedEventLayout {
  event: CalendarEvent;
  top: number;
  height: number;
  lane: number;
  totalLanes: number;
  startMs: number;
  endMs: number;
}

function layoutTimedEvents(dayEvents: CalendarEvent[], dayDate: Date): TimedEventLayout[] {
  const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0, 0).getTime();
  const dayEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59, 999).getTime();

  const timed = dayEvents
    .filter((e) => !e.isAllDay)
    .map((e) => {
      const rawStart = new Date(e.start).getTime();
      const rawEnd = e.end ? new Date(e.end).getTime() : rawStart + 30 * 60 * 1000;
      const startMs = Math.max(dayStart, rawStart);
      const endMs = Math.min(dayEnd, Math.max(startMs + 20 * 60 * 1000, rawEnd));
      const startMin = (startMs - dayStart) / (60 * 1000);
      const durationMin = Math.max(25, (endMs - startMs) / (60 * 1000));
      const top = (startMin / 60) * HOUR_HEIGHT;
      const height = Math.max(24, Math.round((durationMin / 60) * HOUR_HEIGHT - 2));

      return {
        event: e,
        top,
        height,
        lane: 0,
        totalLanes: 1,
        startMs,
        endMs,
      };
    })
    .sort((a, b) => a.startMs - b.startMs || (b.endMs - b.startMs) - (a.endMs - a.startMs));

  // Greedy lane assignment for concurrent events
  for (let i = 0; i < timed.length; i++) {
    const item = timed[i];
    const overlaps = timed.filter(
      (other) => other !== item && other.startMs < item.endMs && other.endMs > item.startMs
    );
    if (overlaps.length > 0) {
      const usedLanes = new Set(overlaps.map((o) => o.lane));
      let lane = 0;
      while (usedLanes.has(lane)) {
        lane++;
      }
      item.lane = lane;
      const maxLane = Math.max(lane + 1, ...overlaps.map((o) => o.lane + 1));
      item.totalLanes = Math.max(item.totalLanes, maxLane);
      overlaps.forEach((o) => {
        o.totalLanes = Math.max(o.totalLanes, maxLane);
      });
    }
  }

  return timed;
}

const DEFAULT_SOURCES: CalendarSource[] = [
  {
    id: 'us-holidays',
    name: 'Holidays',
    url: 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics',
    color: '#3b82f6', // Blue
    enabled: true,
  },
];

function formatAge(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function formatTimeShort(date: Date, hour12: boolean = true): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' }).replace(' ', '');
}

function parseEventLocalDate(dateStr: string, isAllDay?: boolean): Date {
  if (isAllDay) {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
    }
  }
  return new Date(dateStr);
}

function formatEventTime(evt: CalendarEvent, hour12: boolean = true): string {
  if (evt.mealSlot) return MEAL_SLOT_CALENDAR_META[evt.mealSlot].label;
  if (evt.isAllDay) return 'All Day';
  const start = new Date(evt.start);
  return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' }).replace(' ', '');
}

function isEventOnDate(evt: CalendarEvent, targetDate: Date): boolean {
  const targetY = targetDate.getFullYear();
  const targetM = targetDate.getMonth();
  const targetD = targetDate.getDate();

  if (evt.isAllDay) {
    const startDate = parseEventLocalDate(evt.start, true);
    const target = new Date(targetY, targetM, targetD, 0, 0, 0, 0);

    if (evt.end) {
      const endDate = parseEventLocalDate(evt.end, true);
      if (endDate.getTime() > startDate.getTime()) {
        // In RFC 5545, DTEND for all-day events is exclusive (midnight of the next day)
        return target.getTime() >= startDate.getTime() && target.getTime() < endDate.getTime();
      }
    }
    return target.getTime() === startDate.getTime();
  }

  const dayStart = new Date(targetY, targetM, targetD, 0, 0, 0, 0).getTime();
  const dayEnd = new Date(targetY, targetM, targetD, 23, 59, 59, 999).getTime();
  const evtStart = new Date(evt.start).getTime();
  const evtEnd = evt.end ? new Date(evt.end).getTime() : evtStart;
  // An event ending exactly at midnight is over before this day starts
  return evtStart <= dayEnd && (evtEnd > dayStart || evtStart >= dayStart);
}

function sortDayEvents(dayEvents: CalendarEvent[]): CalendarEvent[] {
  return [...dayEvents].sort((a, b) => {
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;
    const aTime = parseEventLocalDate(a.start, a.isAllDay).getTime();
    const bTime = parseEventLocalDate(b.start, b.isAllDay).getTime();
    if (aTime !== bTime) return aTime - bTime;
    if (a.mealSlot && b.mealSlot) {
      return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
    }
    if (!a.mealSlot && b.mealSlot) return -1;
    if (a.mealSlot && !b.mealSlot) return 1;
    return 0;
  });
}

const TimelineGridView: React.FC<{
  days: { date: Date; isToday: boolean; events: CalendarEvent[] }[];
  colCount: 3 | 7;
  hasAllDay: boolean;
  timeGridRef: React.RefObject<HTMLDivElement | null>;
  isLight: boolean;
  now: Date;
  hour12: boolean;
  onSelectDay: (detail: { date: Date; events: CalendarEvent[] }) => void;
}> = ({ days, colCount, hasAllDay, timeGridRef, isLight, now, hour12, onSelectDay }) => {
  return (
    <div
      className={`flex-1 flex flex-col justify-between overflow-hidden border rounded-2xl ${
        colCount === 7 ? 'min-w-[560px] md:min-w-0' : ''
      } ${
        isLight ? 'border-slate-200 bg-slate-50/50' : 'border-gray-800/80 bg-gray-950/40'
      }`}
    >
      {/* Day Columns Header */}
      <div
        className={`flex border-b shrink-0 ${
          isLight ? 'bg-slate-100/90 border-slate-200' : 'bg-gray-950/80 border-gray-800'
        }`}
      >
        <div className={`w-12 md:w-14 shrink-0 border-r ${isLight ? 'border-slate-200' : 'border-gray-800/80'}`} />
        <div className={`flex-1 grid ${colCount === 3 ? 'grid-cols-3' : 'grid-cols-7'}`}>
          {days.map((col, idx) => (
            <div
              key={idx}
              onClick={() => {
                if (col.events.length > 0) {
                  onSelectDay({ date: col.date, events: col.events });
                }
              }}
              className={`flex items-center justify-between p-2 md:p-2.5 border-r last:border-r-0 cursor-pointer ${
                isLight ? 'border-slate-200' : 'border-gray-800/80'
              } ${col.isToday ? (isLight ? 'bg-blue-100/60' : 'bg-blue-950/30') : ''}`}
            >
              <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                <span
                  className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-black font-mono shadow-xs shrink-0 ${
                    col.isToday
                      ? 'bg-blue-600 text-white'
                      : isLight
                      ? 'bg-slate-200 text-slate-800'
                      : 'bg-gray-800/80 text-white'
                  }`}
                >
                  {col.date.getDate()}
                </span>
                <div className="flex flex-col leading-tight min-w-0">
                  <span
                    className={`text-[11px] md:text-xs font-bold uppercase tracking-wide truncate ${
                      col.isToday
                        ? isLight ? 'text-blue-900 font-black' : 'text-blue-300 font-black'
                        : isLight ? 'text-slate-800' : 'text-gray-200'
                    }`}
                  >
                    {col.date.toLocaleDateString([], { weekday: 'short' })}
                  </span>
                  <span
                    className={`text-[9.5px] md:text-[10px] font-semibold truncate ${
                      isLight ? 'text-slate-500' : 'text-gray-400'
                    }`}
                  >
                    {col.date.toLocaleDateString([], { month: 'short' })}
                  </span>
                </div>
              </div>
              {col.isToday && colCount === 3 && (
                <span className="text-[9px] md:text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-400 border border-blue-500/40 shadow-xs uppercase tracking-wider hidden sm:inline">
                  Today
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* All-Day Events Row */}
      {hasAllDay && (
        <div
          className={`flex border-b shrink-0 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-gray-950/90 border-gray-800'
          }`}
        >
          <div
            className={`w-12 md:w-14 shrink-0 border-r text-[10px] font-bold uppercase tracking-wider p-1.5 text-right flex items-center justify-end ${
              isLight ? 'border-slate-200 text-slate-500' : 'border-gray-800/80 text-gray-500'
            }`}
          >
            All-Day
          </div>
          <div className={`flex-1 grid ${colCount === 3 ? 'grid-cols-3' : 'grid-cols-7'} gap-1 p-1`}>
            {days.map((col, idx) => (
              <div
                key={idx}
                className={`space-y-1 min-h-[22px] border-r last:border-r-0 px-1 ${
                  isLight ? 'border-slate-200/80' : 'border-gray-800/60'
                }`}
              >
                {col.events
                  .filter((e) => e.isAllDay)
                  .map((evt) => (
                    <div
                      key={evt.uid}
                      onClick={() => onSelectDay({ date: col.date, events: col.events })}
                      style={{ backgroundColor: evt.color || '#3b82f6' }}
                      className="text-[9.5px] md:text-[11px] font-bold text-white px-1.5 py-0.5 rounded truncate cursor-pointer shadow-xs hover:brightness-110"
                      title={evt.mealSlot ? `${MEAL_SLOT_CALENDAR_META[evt.mealSlot].label}: ${evt.summary}` : evt.summary}
                    >
                      {evt.mealSlot
                        ? `${MEAL_SLOT_CALENDAR_META[evt.mealSlot].label}: ${evt.summary}`
                        : evt.summary}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 24-Hour Timed Grid */}
      <div ref={timeGridRef} className="flex-1 overflow-y-auto relative select-none">
        <div className="flex relative" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
          {/* Left Time Gutter */}
          <div
            className={`w-12 md:w-14 shrink-0 relative border-r select-none ${
              isLight ? 'border-slate-200' : 'border-gray-800/80'
            }`}
          >
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ top: hour === 0 ? '4px' : `${hour * HOUR_HEIGHT}px` }}
                className={`absolute right-2 text-[10px] md:text-xs font-mono font-medium ${
                  isLight ? 'text-slate-500' : 'text-gray-500'
                } ${hour === 0 ? '' : '-translate-y-1/2'}`}
              >
                {formatHourGutter(hour, hour12)}
              </div>
            ))}
          </div>

          {/* Grid Body */}
          <div className="flex-1 relative">
            {/* Horizontal Hour Lines */}
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ top: `${hour * HOUR_HEIGHT}px` }}
                className={`absolute left-0 right-0 border-b pointer-events-none ${
                  isLight ? 'border-slate-200/70' : 'border-gray-800/40'
                }`}
              />
            ))}

            {/* Columns */}
            <div className={`grid ${colCount === 3 ? 'grid-cols-3' : 'grid-cols-7'} h-full`}>
              {days.map((col, idx) => {
                const timedLayout = layoutTimedEvents(col.events, col.date);
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

                return (
                  <div
                    key={idx}
                    className={`relative h-full border-r last:border-r-0 ${
                      isLight ? 'border-slate-200/80' : 'border-gray-800/60'
                    } ${col.isToday ? (isLight ? 'bg-blue-50/50' : 'bg-blue-950/10') : ''}`}
                  >
                    {/* Current Time Red Indicator Line */}
                    {col.isToday && (
                      <div
                        style={{ top: `${nowTop}px` }}
                        className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                      >
                        <div className="w-2.5 h-2.5 -left-1.5 -top-1 absolute rounded-full bg-red-500 ring-2 ring-red-400/50 shadow-sm" />
                      </div>
                    )}

                    {/* Timed Event Blocks */}
                    {timedLayout.map((item) => {
                      const isCompact = item.height < 44;
                      return (
                        <div
                          key={item.event.uid}
                          onClick={() => onSelectDay({ date: col.date, events: col.events })}
                          title={`${item.event.summary} (${formatTimeShort(new Date(item.event.start), hour12)}${
                            item.event.end ? ` - ${formatTimeShort(new Date(item.event.end), hour12)}` : ''
                          })${item.event.location ? ` • ${item.event.location}` : ''}`}
                          style={{
                            top: `${item.top}px`,
                            height: `${item.height}px`,
                            left: `calc(${(item.lane / item.totalLanes) * 100}% + 2px)`,
                            width: `calc(${(1 / item.totalLanes) * 100}% - 4px)`,
                            backgroundColor: isLight
                              ? `${item.event.color || '#3b82f6'}22`
                              : `${item.event.color || '#3b82f6'}26`,
                            borderLeftColor: item.event.color || '#3b82f6',
                          }}
                          className={`absolute rounded-lg border-l-4 border-t border-r border-b ${
                            isLight
                              ? 'border-slate-300/80 shadow-xs hover:bg-white'
                              : 'border-gray-700/50 shadow-sm hover:brightness-125'
                          } ${
                            isCompact ? 'px-1.5 py-0 justify-center' : 'p-1.5 md:p-2 justify-start'
                          } text-left overflow-hidden transition-all hover:z-30 cursor-pointer backdrop-blur-xs flex flex-col`}
                        >
                          <div className="flex items-center justify-between gap-1 leading-none">
                            <span className="text-[9.5px] md:text-[10px] font-mono font-bold text-blue-500 truncate">
                              {formatTimeShort(new Date(item.event.start), hour12)}
                              {item.event.end && ` - ${formatTimeShort(new Date(item.event.end), hour12)}`}
                            </span>
                          </div>
                          <div
                            className={`text-[11px] md:text-xs font-bold leading-tight truncate mt-0.5 ${
                              isLight ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            {item.event.summary}
                          </div>
                          {!isCompact && item.event.location && (
                            <div
                              className={`flex items-center gap-0.5 text-[9.5px] truncate mt-0.5 ${
                                isLight ? 'text-slate-500' : 'text-gray-400'
                              }`}
                            >
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{item.event.location}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({
  sources = DEFAULT_SOURCES,
  defaultView = 'agenda',
  multiDayLayout: multiDayLayoutProp = 'cards',
  showMeals = true,
  onUpdateConfig,
  isLight = false,
}) => {
  const { hour12, weekStartsOn } = useTimePrefs();
  const scheduledMeals = useMealStore((s) => s.scheduledMeals);
  const isMealStoreInitialized = useMealStore((s) => s.isInitialized);
  const [view, setView] = useState<CalendarViewMode>(defaultView);
  const [multiDayLayout, setMultiDayLayout] = useState<MultiDayLayout>(multiDayLayoutProp);
  const timeGridRef = useRef<HTMLDivElement>(null);
  // Initialize immediately from cache so canvas carousel/tab switching renders instantly with 0 blank wait
  const [events, setEvents] = useState<CalendarEvent[]>(() => getCachedCalendarEvents(sources)?.events || []);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(() => getCachedCalendarEvents(sources)?.lastFetched || null);
  const [feedProblems, setFeedProblems] = useState<CalendarFeedStatus[]>(() =>
    getVisibleCalendarFeedProblems(sources)
  );
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedDayDetail, setSelectedDayDetail] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    if (!isMealStoreInitialized) {
      void useMealStore.getState().initMealStore();
    }
  }, [isMealStoreInitialized]);

  useEffect(() => {
    setView(defaultView);
  }, [defaultView]);

  useEffect(() => {
    if (multiDayLayoutProp) {
      setMultiDayLayout(multiDayLayoutProp);
    }
  }, [multiDayLayoutProp]);

  // Auto-scroll timeline grid to current hour
  useEffect(() => {
    if ((view === '3day' || view === 'week') && multiDayLayout === 'timeline' && timeGridRef.current) {
      const curHour = new Date().getHours();
      const scrollTarget = Math.max(0, (curHour - 1) * HOUR_HEIGHT);
      timeGridRef.current.scrollTop = scrollTarget;
    }
  }, [view, multiDayLayout]);

  const handleToggleMultiDayLayout = (newLayout: MultiDayLayout) => {
    setMultiDayLayout(newLayout);
    onUpdateConfig?.({ multiDayLayout: newLayout });
  };

  const loadEvents = async (force: boolean = false, background: boolean = false) => {
    if (!background && events.length === 0) {
      setLoading(true);
    }
    setIsSyncing(true);
    try {
      const manualRefresh = force && !background;
      const data = await fetchCalendarEvents(sources, force, manualRefresh);
      setEvents(data);
      setFeedProblems(getVisibleCalendarFeedProblems(sources));
      setLastUpdated(getCachedCalendarEvents(sources)?.lastFetched ?? Date.now());
    } catch (err) {
      console.warn('Failed to load events:', err);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const cached = getCachedCalendarEvents(sources);
    if (cached) {
      setEvents(cached.events);
      setFeedProblems(getVisibleCalendarFeedProblems(sources));
      setLastUpdated(cached.lastFetched);
      if (cached.isStale) {
        // Silently revalidate in background if older than 15 minutes
        loadEvents(true, true);
      }
    } else {
      loadEvents(false, false);
    }

    // Recommended refresh frequency: 15-minute background polling (pauses when tab is hidden)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      loadEvents(true, true);
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [sources]);

  const handleSwitchView = (newView: CalendarViewMode) => {
    setView(newView);
    if (onUpdateConfig) {
      onUpdateConfig({ defaultView: newView });
    }
  };

  const handlePrev = () => {
    if (view === 'month') {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    } else if (view === 'week') {
      setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - 7));
    } else if (view === '3day') {
      setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - 3));
    } else {
      setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - 7));
    }
  };

  const handleNext = () => {
    if (view === 'month') {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    } else if (view === 'week') {
      setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 7));
    } else if (view === '3day') {
      setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 3));
    } else {
      setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 7));
    }
  };

  const handleToday = () => {
    const today = new Date();
    setBaseDate(today);
    setCurrentMonth(today);
  };

  const now = new Date();

  const mealEvents = useMemo(
    () => (showMeals ? scheduledMealsToCalendarEvents(scheduledMeals) : []),
    [showMeals, scheduledMeals]
  );
  const combinedEvents = useMemo(
    () => [...events, ...mealEvents],
    [events, mealEvents]
  );

  // Agenda view events (filtered from baseDate)
  const agendaStartMs = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()).getTime() - 24 * 60 * 60 * 1000;
  // Also keeps events that started earlier and are still going on (a week-long trip, a holiday)
  const baseDayStartMs = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()).getTime();
  const baseDateKey = localDateKey(baseDate);
  const agendaEvents = combinedEvents
    .filter((e) => {
      if (e.calendarId === MEAL_PLANNER_CALENDAR_ID) {
        return e.start >= baseDateKey;
      }
      return (
        parseEventLocalDate(e.start, e.isAllDay).getTime() >= agendaStartMs ||
        (e.end ? parseEventLocalDate(e.end, e.isAllDay).getTime() > baseDayStartMs : false)
      );
    })
    .slice()
    .sort((a, b) => {
      const aTime = parseEventLocalDate(a.start, a.isAllDay).getTime();
      const bTime = parseEventLocalDate(b.start, b.isAllDay).getTime();
      if (aTime !== bTime) return aTime - bTime;
      if (a.mealSlot && b.mealSlot) {
        return MEAL_SLOT_ORDER[a.mealSlot] - MEAL_SLOT_ORDER[b.mealSlot];
      }
      if (!a.mealSlot && b.mealSlot) return -1;
      if (a.mealSlot && !b.mealSlot) return 1;
      return 0;
    });

  // Month View calculations
  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const startDayOfWeek = (startOfMonth.getDay() - weekStartsOn + 7) % 7;
  const totalDaysInMonth = endOfMonth.getDate();

  // 3-Day View calculations (baseDate + 0, +1, +2)
  const threeDays = [0, 1, 2].map((offset) => {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset);
    return {
      date: d,
      isToday: d.toDateString() === now.toDateString(),
      events: combinedEvents.filter((e) => isEventOnDate(e, d)),
    };
  });

  // Week View calculations
  const weekStart = startOfWeek(baseDate, weekStartsOn);

  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + offset);
    return {
      date: d,
      isToday: d.toDateString() === now.toDateString(),
      events: combinedEvents.filter((e) => isEventOnDate(e, d)),
    };
  });
  const weekEnd = weekDays[6].date;

  const hasThreeDaysAllDay = threeDays.some((col) => col.events.some((e) => e.isAllDay));
  const hasWeekAllDay = weekDays.some((col) => col.events.some((e) => e.isAllDay));

  // Header Title
  const getHeaderTitle = () => {
    switch (view) {
      case 'agenda':
        return `Schedule • ${baseDate.toLocaleDateString([], { month: 'short', year: 'numeric' })}`;
      case '3day': {
        const d1 = threeDays[0].date;
        const d3 = threeDays[2].date;
        if (d1.getMonth() === d3.getMonth()) {
          return `${d1.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${d3.getDate()}, ${d3.getFullYear()}`;
        }
        return `${d1.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${d3.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      case 'week':
        return `${weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
      case 'month':
      default:
        return currentMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
    }
  };

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-hidden select-none relative">
      {/* Widget Header with Prominent Top Navigation */}
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-2 pr-28 shrink-0 ${isLight ? 'border-slate-200' : 'border-gray-800/80'}`}>
        {/* Left: Title + Prominent Navigation Buttons */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <CalendarIcon className="w-4 h-4 text-blue-400 shrink-0" />
            <span className={`text-xs md:text-sm font-black uppercase tracking-wider truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {getHeaderTitle()}
            </span>
          </div>

          {/* Top Navigation: Prev / Today / Next */}
          <div className={`flex items-center rounded-xl p-0.5 shadow-sm shrink-0 border ${
            isLight
              ? 'bg-slate-100/90 border-slate-300'
              : 'bg-gray-900/90 border-gray-700/80'
          }`}>
            <button
              type="button"
              onClick={handlePrev}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                isLight
                  ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  : 'text-gray-200 hover:text-white hover:bg-gray-800'
              }`}
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Prev</span>
            </button>
            <button
              type="button"
              onClick={handleToday}
              className={`px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer border ${
                isLight
                  ? 'text-blue-700 hover:bg-blue-100 border-blue-300 bg-blue-50'
                  : 'text-blue-400 hover:text-blue-300 hover:bg-blue-950/60 border-blue-500/30 bg-blue-500/10'
              }`}
              title="Jump to Today"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                isLight
                  ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  : 'text-gray-200 hover:text-white hover:bg-gray-800'
              }`}
              title="Next"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4 text-blue-400" />
            </button>
          </div>
        </div>

        {/* Right: Segmented View Switcher + MultiDay Layout Switcher + Guide + Refresh */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Sub-view Layout Toggle (Cards vs Timeline) for 3-Day and Week views */}
          {(view === '3day' || view === 'week') && (
            <div className={`flex items-center p-0.5 rounded-xl border ${
              isLight
                ? 'bg-slate-100 border-slate-300'
                : 'bg-gray-950/90 border-gray-800'
            }`}>
              <button
                type="button"
                onClick={() => handleToggleMultiDayLayout('cards')}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] md:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  multiDayLayout === 'cards'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Cards in order of time"
              >
                <Columns className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleMultiDayLayout('timeline')}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] md:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  multiDayLayout === 'timeline'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="24-Hour Timeline Grid schedule"
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Timeline</span>
              </button>
            </div>
          )}

          <div className={`flex items-center p-0.5 rounded-xl border ${
            isLight
              ? 'bg-slate-100 border-slate-300'
              : 'bg-gray-950/90 border-gray-800'
          }`}>
            {(['agenda', '3day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleSwitchView(v)}
                className={`px-2.5 py-1 text-[11px] md:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  view === v
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {v === 'agenda' ? 'Agenda' : v === '3day' ? '3-Day' : v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            title="How to connect Google Calendar (.ics)"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLight
                ? 'text-slate-500 hover:text-blue-600 hover:bg-slate-200'
                : 'text-gray-400 hover:text-blue-400 hover:bg-gray-800'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => loadEvents(true, false)}
            disabled={isSyncing}
            title={
              lastUpdated
                ? `Last updated: ${new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' })} (Click to refresh on-demand)`
                : 'Refresh calendar feeds (Auto-refreshes every 15 min)'
            }
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLight
                ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* A calendar that can't be read says so, instead of quietly showing old or no events */}
      {feedProblems.length > 0 && (
        <div
          role="status"
          className={`mb-2 shrink-0 rounded-xl border px-3 py-2 text-xs leading-snug ${
            isLight ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          }`}
        >
          {feedProblems.some((f) => f.noService) ? (
            <span>⚠️ {feedProblems.find((f) => f.noService)?.error}</span>
          ) : (
            feedProblems.map((f) => (
              <div key={f.id}>
                ⚠️ <strong>{f.name}</strong>: {f.error}{' '}
                {f.lastSuccessAt
                  ? `Showing what it had ${formatAge(f.lastSuccessAt)}.`
                  : 'No events from it yet.'}
              </div>
            ))
          )}
        </div>
      )}

      {/* Main Content Area */}
      {view === 'agenda' ? (
        /* Agenda View */
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {agendaEvents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs py-8 text-center">
              <span>{loading ? 'Fetching calendar events...' : 'No upcoming events'}</span>
              {!loading && (
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(true)}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>How to connect Google Calendar</span>
                </button>
              )}
            </div>
          ) : (
            agendaEvents.slice(0, 30).map((evt) => {
              const startDate = parseEventLocalDate(evt.start, evt.isAllDay);
              const isToday = startDate.toDateString() === now.toDateString();

              return (
                <div
                  key={evt.uid}
                  className={`flex items-start gap-3 p-3 rounded-2xl border transition-all ${
                    isToday
                      ? isLight
                        ? 'bg-blue-50/80 border-blue-400/80 shadow-xs'
                        : 'bg-blue-950/25 border-blue-500/50 shadow-sm'
                      : isLight
                      ? 'bg-slate-100/90 border-slate-200/90 hover:border-slate-300'
                      : 'bg-gray-950/50 border-gray-800/80 hover:border-gray-700/90'
                  }`}
                >
                  {/* Color strip */}
                  <div
                    className="w-1.5 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: evt.color || '#3b82f6' }}
                  />

                  {/* Date badge: Month + Day + Weekday */}
                  <div className={`flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl border shrink-0 text-center min-w-[56px] shadow-sm ${
                    isLight
                      ? 'bg-white border-slate-200'
                      : 'bg-gray-900 border-gray-800'
                  }`}>
                    <span className="text-[10px] uppercase font-black tracking-wider text-blue-500">
                      {startDate.toLocaleDateString([], { month: 'short' })}
                    </span>
                    <span className={`text-base md:text-lg font-black font-mono leading-none my-0.5 ${
                      isToday ? 'text-blue-600' : isLight ? 'text-slate-900' : 'text-white'
                    }`}>
                      {startDate.getDate()}
                    </span>
                    <span className={`text-[10px] uppercase font-bold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                      {startDate.toLocaleDateString([], { weekday: 'short' })}
                    </span>
                  </div>

                  {/* Event Details */}
                  <div className="flex-1 min-w-0 py-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-sm md:text-base font-bold truncate ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>
                        {evt.summary}
                      </div>
                      {isToday && (
                        <span className={`text-[9px] uppercase font-extrabold px-2 py-0.5 rounded-md border shrink-0 ${
                          isLight
                            ? 'bg-blue-100 text-blue-700 border-blue-300'
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                        }`}>
                          Today
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-xs font-medium ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                      <span className={`flex items-center gap-1.5 font-mono ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                        <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        {evt.mealSlot
                          ? MEAL_SLOT_CALENDAR_META[evt.mealSlot].label
                          : evt.isAllDay
                          ? 'All Day'
                          : startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' })}
                        {evt.end && !evt.isAllDay && ` – ${new Date(evt.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' })}`}
                      </span>
                      {evt.location && (
                        <span className={`flex items-center gap-1 truncate max-w-[200px] ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                          <MapPin className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-slate-500' : 'text-gray-500'}`} />
                          <span className="truncate">{evt.location}</span>
                        </span>
                      )}
                      {evt.calendarName && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border truncate max-w-[120px] hidden sm:inline ${
                          isLight
                            ? 'bg-slate-200/80 text-slate-700 border-slate-300'
                            : 'bg-white/5 text-gray-400 border-white/5'
                        }`}>
                          {evt.calendarName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : view === '3day' ? (
        multiDayLayout === 'timeline' ? (
          <TimelineGridView
            days={threeDays}
            colCount={3}
            hasAllDay={hasThreeDaysAllDay}
            timeGridRef={timeGridRef}
            isLight={isLight}
            now={now}
            hour12={hour12}
            onSelectDay={setSelectedDayDetail}
          />
        ) : (
          /* 3-Day View (Card-based Day Columns) */
          <div className="grid grid-cols-3 gap-2 md:gap-3 flex-1 min-h-0 overflow-hidden">
            {threeDays.map((col, idx) => {
              const sortedEvents = sortDayEvents(col.events);
              return (
                <div
                  key={idx}
                  className={`flex flex-col rounded-2xl border transition-all overflow-hidden ${
                    col.isToday
                      ? isLight
                        ? 'bg-blue-50/70 border-blue-400/80 shadow-xs ring-1 ring-blue-400/30'
                        : 'bg-blue-950/20 border-blue-500/60 shadow-md ring-1 ring-blue-500/20'
                      : isLight
                      ? 'bg-slate-100/80 border-slate-200/90'
                      : 'bg-gray-950/50 border-gray-800/80'
                  }`}
                >
                  {/* Day Column Header */}
                  <div
                    onClick={() => {
                      if (sortedEvents.length > 0) {
                        setSelectedDayDetail({ date: col.date, events: sortedEvents });
                      }
                    }}
                    className={`p-2.5 md:p-3 border-b flex items-center justify-between shrink-0 cursor-pointer ${
                      col.isToday
                        ? isLight
                          ? 'bg-blue-100/50 border-blue-200'
                          : 'bg-blue-950/40 border-blue-900/50'
                        : isLight
                        ? 'bg-slate-200/40 border-slate-200 hover:bg-slate-200/60'
                        : 'bg-gray-900/40 border-gray-800/80 hover:bg-gray-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-black font-mono shrink-0 shadow-xs ${
                          col.isToday
                            ? 'bg-blue-600 text-white'
                            : isLight
                            ? 'bg-slate-300/80 text-slate-800'
                            : 'bg-gray-800 text-gray-200'
                        }`}
                      >
                        {col.date.getDate()}
                      </span>
                      <div className="flex flex-col leading-tight min-w-0">
                        <span className={`text-xs md:text-sm font-black uppercase tracking-wider truncate ${
                          col.isToday
                            ? isLight ? 'text-blue-900' : 'text-blue-300'
                            : isLight ? 'text-slate-800' : 'text-gray-200'
                        }`}>
                          {col.date.toLocaleDateString([], { weekday: 'short' })}
                        </span>
                        <span className={`text-[10px] md:text-xs font-semibold ${
                          isLight ? 'text-slate-500' : 'text-gray-400'
                        }`}>
                          {col.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {col.isToday && (
                        <span className="text-[9px] md:text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase tracking-wider hidden sm:inline">
                          Today
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          sortedEvents.length > 0
                            ? isLight
                              ? 'bg-slate-200 text-slate-700 font-mono'
                              : 'bg-gray-800 text-gray-300 font-mono'
                            : isLight
                            ? 'text-slate-400'
                            : 'text-gray-500'
                        }`}
                      >
                        {sortedEvents.length}
                      </span>
                    </div>
                  </div>

                  {/* Scrollable Events List */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                    {sortedEvents.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-xs italic ${
                        isLight ? 'text-slate-400' : 'text-gray-500'
                      }`}>
                        No events
                      </div>
                    ) : (
                      sortedEvents.map((evt) => {
                        const startDate = parseEventLocalDate(evt.start, evt.isAllDay);
                        return (
                          <div
                            key={evt.uid}
                            onClick={() => setSelectedDayDetail({ date: col.date, events: sortedEvents })}
                            style={{
                              backgroundColor: `${evt.color || '#3b82f6'}15`,
                              borderLeftColor: evt.color || '#3b82f6',
                            }}
                            className={`p-2 md:p-2.5 rounded-xl border-l-4 border-t border-r border-b text-left cursor-pointer transition-all hover:scale-[1.01] hover:brightness-105 shadow-xs ${
                              isLight
                                ? 'border-slate-200/90 bg-white/80 hover:bg-white'
                                : 'border-gray-800/80 bg-gray-900/50 hover:bg-gray-900/80'
                            }`}
                            title={evt.summary}
                          >
                            {/* Time + Calendar Badge */}
                            <div className="flex items-center justify-between gap-1 text-[10px] md:text-[11px] font-mono leading-none mb-1">
                              <span className="flex items-center gap-1 font-semibold text-blue-400 truncate">
                                <Clock className="w-3 h-3 shrink-0" />
                                {evt.mealSlot
                                  ? MEAL_SLOT_CALENDAR_META[evt.mealSlot].label
                                  : evt.isAllDay
                                  ? 'All Day'
                                  : startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' })}
                                {evt.end && !evt.isAllDay && ` – ${new Date(evt.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' })}`}
                              </span>
                              {evt.calendarName && (
                                <span className={`text-[9px] px-1 py-0.5 rounded truncate max-w-[80px] hidden md:inline ${
                                  isLight ? 'bg-slate-200 text-slate-600' : 'bg-black/40 text-gray-400'
                                }`}>
                                  {evt.calendarName}
                                </span>
                              )}
                            </div>

                            {/* Title */}
                            <div className={`text-xs md:text-sm font-bold line-clamp-2 leading-tight ${
                              isLight ? 'text-slate-900' : 'text-white'
                            }`}>
                              {evt.summary}
                            </div>

                            {/* Location */}
                            {evt.location && (
                              <div className={`flex items-center gap-1 text-[10px] md:text-[11px] truncate mt-1 ${
                                isLight ? 'text-slate-500' : 'text-gray-400'
                              }`}>
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{evt.location}</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : view === 'week' ? (
        multiDayLayout === 'timeline' ? (
          <TimelineGridView
            days={weekDays}
            colCount={7}
            hasAllDay={hasWeekAllDay}
            timeGridRef={timeGridRef}
            isLight={isLight}
            now={now}
            hour12={hour12}
            onSelectDay={setSelectedDayDetail}
          />
        ) : (
          /* Weekly View (Card-based Day Columns) */
          <div className="grid grid-cols-7 gap-1.5 flex-1 min-h-0 overflow-x-auto min-w-[560px] md:min-w-0">
            {weekDays.map((col, idx) => {
              const sortedEvents = sortDayEvents(col.events);
              return (
                <div
                  key={idx}
                  className={`flex flex-col rounded-xl border transition-all overflow-hidden ${
                    col.isToday
                      ? isLight
                        ? 'bg-blue-50/70 border-blue-400/80 shadow-xs ring-1 ring-blue-400/30'
                        : 'bg-blue-950/20 border-blue-500/60 shadow-md ring-1 ring-blue-500/20'
                      : isLight
                      ? 'bg-slate-100/80 border-slate-200/90'
                      : 'bg-gray-950/50 border-gray-800/80'
                  }`}
                >
                  {/* Week Day Column Header */}
                  <div
                    onClick={() => {
                      if (sortedEvents.length > 0) {
                        setSelectedDayDetail({ date: col.date, events: sortedEvents });
                      }
                    }}
                    className={`p-1.5 border-b flex flex-col items-center justify-center shrink-0 cursor-pointer ${
                      col.isToday
                        ? isLight
                          ? 'bg-blue-100/50 border-blue-200'
                          : 'bg-blue-950/40 border-blue-900/50'
                        : isLight
                        ? 'bg-slate-200/40 border-slate-200 hover:bg-slate-200/60'
                        : 'bg-gray-900/40 border-gray-800/80 hover:bg-gray-900/60'
                    }`}
                  >
                    <span className={`text-[10px] uppercase font-black tracking-wider ${
                      col.isToday
                        ? isLight ? 'text-blue-900' : 'text-blue-300'
                        : isLight ? 'text-slate-600' : 'text-gray-400'
                    }`}>
                      {col.date.toLocaleDateString([], { weekday: 'short' })}
                    </span>
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold mt-0.5 ${
                        col.isToday
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isLight
                          ? 'text-slate-800'
                          : 'text-gray-200'
                      }`}
                    >
                      {col.date.getDate()}
                    </span>
                    {sortedEvents.length > 0 && (
                      <span className={`text-[9px] font-mono px-1 rounded-full mt-0.5 ${
                        isLight ? 'bg-slate-200 text-slate-700' : 'bg-gray-800 text-gray-300'
                      }`}>
                        {sortedEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Scrollable Events List */}
                  <div className="flex-1 overflow-y-auto p-1 space-y-1.5 min-h-0">
                    {sortedEvents.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-[10px] ${
                        isLight ? 'text-slate-300' : 'text-gray-600'
                      }`}>
                        —
                      </div>
                    ) : (
                      sortedEvents.map((evt) => {
                        const startDate = parseEventLocalDate(evt.start, evt.isAllDay);
                        return (
                          <div
                            key={evt.uid}
                            onClick={() => setSelectedDayDetail({ date: col.date, events: sortedEvents })}
                            style={{
                              backgroundColor: `${evt.color || '#3b82f6'}18`,
                              borderLeftColor: evt.color || '#3b82f6',
                            }}
                            className={`p-1.5 rounded-lg border-l-3 border-t border-r border-b text-left cursor-pointer transition-all hover:brightness-110 shadow-2xs ${
                              isLight
                                ? 'border-slate-200/90 bg-white/90 hover:bg-white'
                                : 'border-gray-800/80 bg-gray-900/60 hover:bg-gray-900/90'
                            }`}
                            title={`${evt.summary} (${evt.isAllDay ? 'All Day' : formatTimeShort(startDate, hour12)})${evt.location ? ` • ${evt.location}` : ''}`}
                          >
                            <div className="text-[9.5px] font-mono font-bold text-blue-400 truncate leading-none mb-0.5">
                              {evt.mealSlot
                                ? MEAL_SLOT_CALENDAR_META[evt.mealSlot].shortLabel
                                : evt.isAllDay
                                ? 'All Day'
                                : formatTimeShort(startDate, hour12)}
                            </div>
                            <div className={`text-[11px] font-bold truncate leading-tight ${
                              isLight ? 'text-slate-900' : 'text-white'
                            }`}>
                              {evt.summary}
                            </div>
                            {evt.location && (
                              <div className={`text-[9px] truncate flex items-center gap-0.5 mt-0.5 ${
                                isLight ? 'text-slate-500' : 'text-gray-400'
                              }`}>
                                <MapPin className="w-2 h-2 shrink-0" />
                                <span className="truncate">{evt.location}</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Monthly Grid View (Enlarged events and spacious cells) */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* Weekday Labels */}
          <div className={`grid grid-cols-7 gap-1 text-center text-xs font-black pb-1.5 border-b shrink-0 ${
            isLight ? 'text-slate-600 border-slate-200' : 'text-gray-400 border-gray-800'
          }`}>
            {weekdayLabels(weekStartsOn, 'short').map((d) => (
              <span key={d}>{d.toUpperCase()}</span>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 gap-1.5 flex-1 py-1.5 overflow-hidden">
            {/* Blank leading days */}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className={`p-1 rounded-xl border border-transparent ${isLight ? 'bg-slate-200/20' : 'bg-gray-950/10'}`} />
            ))}

            {/* Calendar Days */}
            {Array.from({ length: totalDaysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
              const isToday = dateObj.toDateString() === now.toDateString();
              const dayEvents = sortDayEvents(combinedEvents.filter((e) => isEventOnDate(e, dateObj)));

              return (
                <div
                  key={`day-${day}`}
                  onClick={() => {
                    if (dayEvents.length > 0) {
                      setSelectedDayDetail({ date: dateObj, events: dayEvents });
                    }
                  }}
                  className={`flex flex-col justify-start p-2 rounded-xl border transition-all overflow-hidden ${
                    dayEvents.length > 0 ? isLight ? 'cursor-pointer hover:border-slate-400' : 'cursor-pointer hover:border-gray-600' : ''
                  } ${
                    isToday
                      ? isLight
                        ? 'bg-blue-50/70 border-blue-400/80 shadow-xs'
                        : 'bg-blue-600/15 border-blue-500/80 shadow-md'
                      : isLight
                      ? 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/90'
                      : 'border-gray-800/60 bg-gray-950/40 hover:bg-gray-800/40'
                  }`}
                >
                  {/* Day Number Header */}
                  <div className="flex items-center justify-between mb-1 shrink-0">
                    <span
                      className={`text-xs md:text-sm font-black w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-blue-600 text-white shadow' : isLight ? 'text-slate-800' : 'text-gray-200'
                      }`}
                    >
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: dayEvents[0]?.color || '#3b82f6' }}
                      />
                    )}
                  </div>

                  {/* Google Calendar-Style Event Text & Time Chips (Larger & More Obvious) */}
                  <div className="flex-1 overflow-hidden space-y-1">
                    {dayEvents.slice(0, 3).map((de) => (
                      <div
                        key={de.uid}
                        title={`${de.summary} (${formatEventTime(de, hour12)})${de.location ? ` - ${de.location}` : ''}`}
                        style={{
                          backgroundColor: de.isAllDay
                            ? (de.color || '#3b82f6')
                            : isLight
                            ? `${de.color || '#3b82f6'}33`
                            : `${de.color || '#3b82f6'}26`,
                          borderLeftColor: de.color || '#3b82f6',
                          color: de.isAllDay ? '#ffffff' : isLight ? '#0f172a' : '#f1f5f9',
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold truncate border-l-4 leading-tight shadow-2xs"
                      >
                        {de.mealSlot ? (
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-black/25 shrink-0">
                            {MEAL_SLOT_CALENDAR_META[de.mealSlot].shortLabel}
                          </span>
                        ) : !de.isAllDay ? (
                          <span className="font-mono text-[10px] md:text-[11px] opacity-80 shrink-0">
                            {formatTimeShort(new Date(de.start), hour12)}
                          </span>
                        ) : (
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-black/25 shrink-0">
                            All-Day
                          </span>
                        )}
                        <span className="truncate">{de.summary}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] md:text-xs text-blue-400 font-bold pl-1 block leading-none">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Day Agenda Detail Popover */}
      {selectedDayDetail && (
        <div className={`absolute inset-0 z-40 backdrop-blur-md p-4 flex flex-col justify-between rounded-xl border shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
          isLight
            ? 'bg-white/95 border-slate-300'
            : 'bg-gray-950/95 border-gray-700/80'
        }`}>
          <div className={`flex items-center justify-between border-b pb-2 mb-2 shrink-0 ${
            isLight ? 'border-slate-200' : 'border-gray-800'
          }`}>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-500" />
              <span className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {selectedDayDetail.date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDayDetail(null)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLight
                  ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {selectedDayDetail.events.map((evt) => (
              <div
                key={evt.uid}
                style={{
                  backgroundColor: evt.color ? `${evt.color}15` : isLight ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.15)',
                  borderLeftColor: evt.color || '#3b82f6',
                }}
                className={`p-3 rounded-xl border-l-4 space-y-1 ${
                  isLight
                    ? 'bg-slate-50/90 border-t border-r border-b border-slate-200 shadow-2xs'
                    : 'bg-gray-900/60 border-t border-r border-b border-gray-800'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className={`flex items-center gap-1.5 font-semibold ${isLight ? 'text-blue-600' : 'text-blue-300'}`}>
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    {formatEventTime(evt, hour12)}
                    {evt.end && !evt.isAllDay && ` – ${new Date(evt.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' })}`}
                  </span>
                  {evt.calendarName && (
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${
                      isLight
                        ? 'bg-slate-200/80 text-slate-700 border-slate-300'
                        : 'bg-black/40 text-gray-300 border-white/5'
                    }`}>
                      {evt.calendarName}
                    </span>
                  )}
                </div>
                <div className={`text-sm md:text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{evt.summary}</div>
                {evt.description && (
                  <div className={`text-xs line-clamp-3 leading-relaxed mt-1 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                    {evt.description}
                  </div>
                )}
                {evt.location && (
                  <div className={`text-xs flex items-center gap-1.5 mt-1.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    <MapPin className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span>{evt.location}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={`pt-2 border-t flex justify-end shrink-0 ${isLight ? 'border-slate-200' : 'border-gray-800/80'}`}>
            <button
              type="button"
              onClick={() => setSelectedDayDetail(null)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Google / Apple / Outlook Calendar URL Guide Modal */}
      <CalendarUrlGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />
    </div>
  );
};