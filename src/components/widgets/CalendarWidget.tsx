import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  HelpCircle,
} from 'lucide-react';
import { fetchCalendarEvents, type CalendarEvent, type CalendarSource } from '../../services/feeds';
import { CalendarUrlGuideModal } from '../calendar/CalendarUrlGuideModal';

export type CalendarViewMode = 'agenda' | '3day' | 'week' | 'month';

interface CalendarWidgetProps {
  sources?: CalendarSource[];
  defaultView?: CalendarViewMode;
  onUpdateConfig?: (updates: Record<string, any>) => void;
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

const HOUR_HEIGHT = 50; // pixels per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHourGutter(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function formatTimeShort(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
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

function formatEventTime(evt: CalendarEvent): string {
  if (evt.isAllDay) return 'All Day';
  const start = new Date(evt.start);
  return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
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
  return evtStart <= dayEnd && evtEnd >= dayStart;
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
      const height = Math.max(24, (durationMin / 60) * HOUR_HEIGHT - 2);

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

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({
  sources = DEFAULT_SOURCES,
  defaultView = 'agenda',
  onUpdateConfig,
}) => {
  const [view, setView] = useState<CalendarViewMode>(defaultView);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedDayDetail, setSelectedDayDetail] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const timeGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setView(defaultView);
  }, [defaultView]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await fetchCalendarEvents(sources);
      setEvents(data);
    } catch (err) {
      console.warn('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [sources]);

  // Auto-scroll time grid to active morning/afternoon hours
  useEffect(() => {
    if ((view === '3day' || view === 'week') && timeGridRef.current) {
      const currentHour = new Date().getHours();
      const targetHour = Math.max(0, Math.min(18, currentHour - 1));
      timeGridRef.current.scrollTop = targetHour * HOUR_HEIGHT;
    }
  }, [view, baseDate]);

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

  // Agenda view events (filtered from baseDate)
  const agendaStartMs = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()).getTime() - 24 * 60 * 60 * 1000;
  const agendaEvents = events.filter((e) => parseEventLocalDate(e.start, e.isAllDay).getTime() >= agendaStartMs);

  // Month View calculations
  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const startDayOfWeek = startOfMonth.getDay();
  const totalDaysInMonth = endOfMonth.getDate();

  // 3-Day View calculations (baseDate + 0, +1, +2)
  const threeDays = [0, 1, 2].map((offset) => {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset);
    return {
      date: d,
      isToday: d.toDateString() === now.toDateString(),
      events: events.filter((e) => isEventOnDate(e, d)),
    };
  });

  // Week View calculations (Sunday to Saturday)
  const weekStart = new Date(baseDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + offset);
    return {
      date: d,
      isToday: d.toDateString() === now.toDateString(),
      events: events.filter((e) => isEventOnDate(e, d)),
    };
  });
  const weekEnd = weekDays[6].date;

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

  const hasThreeDaysAllDay = threeDays.some((col) => col.events.some((e) => e.isAllDay));
  const hasWeekAllDay = weekDays.some((col) => col.events.some((e) => e.isAllDay));

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-hidden select-none relative">
      {/* Widget Header with Prominent Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 pb-2 mb-2 pr-28 shrink-0">
        {/* Left: Title + Prominent Navigation Buttons */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <CalendarIcon className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-xs md:text-sm font-black text-white uppercase tracking-wider truncate">
              {getHeaderTitle()}
            </span>
          </div>

          {/* Top Navigation: Prev / Today / Next */}
          <div className="flex items-center bg-gray-900/90 border border-gray-700/80 rounded-xl p-0.5 shadow-sm shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-gray-200 hover:text-white hover:bg-gray-800 rounded-lg transition-all cursor-pointer"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Prev</span>
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-black uppercase tracking-wider text-blue-400 hover:text-blue-300 hover:bg-blue-950/60 rounded-lg transition-all cursor-pointer border border-blue-500/30 bg-blue-500/10"
              title="Jump to Today"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-gray-200 hover:text-white hover:bg-gray-800 rounded-lg transition-all cursor-pointer"
              title="Next"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4 text-blue-400" />
            </button>
          </div>
        </div>

        {/* Right: Segmented View Switcher + Guide + Refresh */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-gray-950/90 p-0.5 rounded-xl border border-gray-800">
            {(['agenda', '3day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleSwitchView(v)}
                className={`px-2.5 py-1 text-[11px] md:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  view === v
                    ? 'bg-blue-600 text-white shadow-sm'
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
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={loadEvents}
            disabled={loading}
            title="Reload calendar feeds"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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
                      ? 'bg-blue-950/25 border-blue-500/50 shadow-sm'
                      : 'bg-gray-950/50 border-gray-800/80 hover:border-gray-700/90'
                  }`}
                >
                  {/* Color strip */}
                  <div
                    className="w-1.5 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: evt.color || '#3b82f6' }}
                  />

                  {/* Date badge: Month + Day + Weekday */}
                  <div className="flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl bg-gray-900 border border-gray-800 shrink-0 text-center min-w-[56px] shadow-sm">
                    <span className="text-[10px] uppercase font-black tracking-wider text-blue-400">
                      {startDate.toLocaleDateString([], { month: 'short' })}
                    </span>
                    <span className={`text-base md:text-lg font-black font-mono leading-none my-0.5 ${isToday ? 'text-blue-400' : 'text-white'}`}>
                      {startDate.getDate()}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-gray-400">
                      {startDate.toLocaleDateString([], { weekday: 'short' })}
                    </span>
                  </div>

                  {/* Event Details */}
                  <div className="flex-1 min-w-0 py-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm md:text-base font-bold text-gray-100 truncate">
                        {evt.summary}
                      </div>
                      {isToday && (
                        <span className="text-[9px] uppercase font-extrabold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-300 font-medium">
                      <span className="flex items-center gap-1.5 font-mono text-gray-300">
                        <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        {evt.isAllDay
                          ? 'All Day'
                          : startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {evt.end && !evt.isAllDay && ` – ${new Date(evt.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                      </span>
                      {evt.location && (
                        <span className="flex items-center gap-1 text-gray-400 truncate max-w-[200px]">
                          <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          <span className="truncate">{evt.location}</span>
                        </span>
                      )}
                      {evt.calendarName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-gray-400 border border-white/5 truncate max-w-[120px] hidden sm:inline">
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
        /* 3-Day View (Timed Hours Calendar Grid) */
        <div className="flex-1 flex flex-col justify-between overflow-hidden border border-gray-800/80 rounded-2xl bg-gray-950/40">
          {/* Day Columns Header */}
          <div className="flex border-b border-gray-800 shrink-0 bg-gray-950/80">
            <div className="w-12 md:w-14 shrink-0 border-r border-gray-800/80" />
            <div className="flex-1 grid grid-cols-3">
              {threeDays.map((col, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2 md:p-2.5 border-r border-gray-800/80 last:border-r-0 ${
                    col.isToday ? 'bg-blue-950/30' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-sm md:text-base font-black font-mono shadow ${
                        col.isToday ? 'bg-blue-600 text-white' : 'bg-gray-800/80 text-white'
                      }`}
                    >
                      {col.date.getDate()}
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-xs md:text-sm font-bold text-gray-200 uppercase tracking-wide">
                        {col.date.toLocaleDateString([], { weekday: 'short' })}
                      </span>
                      <span className="text-[10px] md:text-[11px] font-semibold text-gray-400">
                        {col.date.toLocaleDateString([], { month: 'short' })}
                      </span>
                    </div>
                  </div>
                  {col.isToday && (
                    <span className="text-[9px] md:text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-300 border border-blue-500/40 shadow-sm uppercase tracking-wider hidden sm:inline">
                      Today
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* All-Day Events Row */}
          {hasThreeDaysAllDay && (
            <div className="flex border-b border-gray-800 bg-gray-950/90 shrink-0">
              <div className="w-12 md:w-14 shrink-0 border-r border-gray-800/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider p-1.5 text-right flex items-center justify-end">
                All-Day
              </div>
              <div className="flex-1 grid grid-cols-3 gap-1 p-1">
                {threeDays.map((col, idx) => (
                  <div key={idx} className="space-y-1 min-h-[22px] border-r border-gray-800/60 last:border-r-0 px-1">
                    {col.events.filter((e) => e.isAllDay).map((evt) => (
                      <div
                        key={evt.uid}
                        onClick={() => setSelectedDayDetail({ date: col.date, events: col.events })}
                        style={{ backgroundColor: evt.color || '#3b82f6' }}
                        className="text-[10px] md:text-xs font-bold text-white px-2 py-1 rounded truncate cursor-pointer shadow-sm hover:brightness-110"
                        title={evt.summary}
                      >
                        {evt.summary}
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
              <div className="w-12 md:w-14 shrink-0 relative border-r border-gray-800/80 select-none">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ top: hour === 0 ? '4px' : `${hour * HOUR_HEIGHT}px` }}
                    className={`absolute right-2 text-[10px] md:text-xs font-mono font-medium text-gray-500 ${
                      hour === 0 ? '' : '-translate-y-1/2'
                    }`}
                  >
                    {formatHourGutter(hour)}
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
                    className="absolute left-0 right-0 border-b border-gray-800/40 pointer-events-none"
                  />
                ))}

                {/* Columns */}
                <div className="grid grid-cols-3 h-full">
                  {threeDays.map((col, idx) => {
                    const timedLayout = layoutTimedEvents(col.events, col.date);
                    const nowMinutes = now.getHours() * 60 + now.getMinutes();
                    const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

                    return (
                      <div
                        key={idx}
                        className={`relative h-full border-r border-gray-800/60 last:border-r-0 ${
                          col.isToday ? 'bg-blue-950/10' : ''
                        }`}
                      >
                        {/* Current Time Indicator Line */}
                        {col.isToday && (
                          <div
                            style={{ top: `${nowTop}px` }}
                            className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                          >
                            <div className="w-2.5 h-2.5 -left-1.5 -top-1 absolute rounded-full bg-red-500 ring-2 ring-red-400/50 shadow-sm" />
                          </div>
                        )}

                        {/* Timed Event Blocks */}
                        {timedLayout.map((item) => (
                          <div
                            key={item.event.uid}
                            onClick={() => setSelectedDayDetail({ date: col.date, events: col.events })}
                            style={{
                              top: `${item.top}px`,
                              height: `${item.height}px`,
                              left: `calc(${(item.lane / item.totalLanes) * 100}% + 2px)`,
                              width: `calc(${(1 / item.totalLanes) * 100}% - 4px)`,
                              backgroundColor: `${item.event.color || '#3b82f6'}26`,
                              borderLeftColor: item.event.color || '#3b82f6',
                            }}
                            className="absolute rounded-lg border-l-4 border-t border-r border-b border-gray-700/50 p-1.5 text-left overflow-hidden transition-all hover:brightness-125 hover:z-30 cursor-pointer shadow-sm backdrop-blur-xs flex flex-col justify-start"
                          >
                            <div className="text-[10px] md:text-[11px] font-mono font-bold text-blue-300 truncate leading-tight">
                              {formatTimeShort(new Date(item.event.start))}
                              {item.event.end && ` - ${formatTimeShort(new Date(item.event.end))}`}
                            </div>
                            <div className="text-xs md:text-sm font-bold text-white leading-tight truncate mt-0.5">
                              {item.event.summary}
                            </div>
                            {item.height > 44 && item.event.location && (
                              <div className="text-[10px] text-gray-300 truncate flex items-center gap-1 mt-0.5 opacity-90">
                                <MapPin className="w-2.5 h-2.5 shrink-0 text-gray-400" />
                                <span className="truncate">{item.event.location}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : view === 'week' ? (
        /* Weekly View (Timed Hours Calendar Grid) */
        <div className="flex-1 flex flex-col justify-between overflow-hidden border border-gray-800/80 rounded-2xl bg-gray-950/40">
          {/* Day Columns Header */}
          <div className="flex border-b border-gray-800 shrink-0 bg-gray-950/80">
            <div className="w-12 md:w-14 shrink-0 border-r border-gray-800/80" />
            <div className="flex-1 grid grid-cols-7">
              {weekDays.map((col, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col items-center py-1.5 px-1 border-r border-gray-800/80 last:border-r-0 text-center ${
                    col.isToday ? 'bg-blue-950/30' : ''
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-gray-400">
                    {col.date.toLocaleDateString([], { weekday: 'short' })}
                  </span>
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold mt-0.5 ${
                      col.isToday ? 'bg-blue-600 text-white shadow' : 'text-gray-200'
                    }`}
                  >
                    {col.date.getDate()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* All-Day Events Row */}
          {hasWeekAllDay && (
            <div className="flex border-b border-gray-800 bg-gray-950/90 shrink-0">
              <div className="w-12 md:w-14 shrink-0 border-r border-gray-800/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider p-1.5 text-right flex items-center justify-end">
                All-Day
              </div>
              <div className="flex-1 grid grid-cols-7 gap-1 p-1">
                {weekDays.map((col, idx) => (
                  <div key={idx} className="space-y-1 min-h-[20px] border-r border-gray-800/60 last:border-r-0 px-0.5">
                    {col.events.filter((e) => e.isAllDay).map((evt) => (
                      <div
                        key={evt.uid}
                        onClick={() => setSelectedDayDetail({ date: col.date, events: col.events })}
                        style={{ backgroundColor: evt.color || '#3b82f6' }}
                        className="text-[9.5px] font-bold text-white px-1 py-0.5 rounded truncate cursor-pointer shadow-sm hover:brightness-110"
                        title={evt.summary}
                      >
                        {evt.summary}
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
              <div className="w-12 md:w-14 shrink-0 relative border-r border-gray-800/80 select-none">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ top: hour === 0 ? '4px' : `${hour * HOUR_HEIGHT}px` }}
                    className={`absolute right-2 text-[10px] md:text-xs font-mono font-medium text-gray-500 ${
                      hour === 0 ? '' : '-translate-y-1/2'
                    }`}
                  >
                    {formatHourGutter(hour)}
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
                    className="absolute left-0 right-0 border-b border-gray-800/40 pointer-events-none"
                  />
                ))}

                {/* Columns */}
                <div className="grid grid-cols-7 h-full">
                  {weekDays.map((col, idx) => {
                    const timedLayout = layoutTimedEvents(col.events, col.date);
                    const nowMinutes = now.getHours() * 60 + now.getMinutes();
                    const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

                    return (
                      <div
                        key={idx}
                        className={`relative h-full border-r border-gray-800/60 last:border-r-0 ${
                          col.isToday ? 'bg-blue-950/10' : ''
                        }`}
                      >
                        {/* Current Time Indicator Line */}
                        {col.isToday && (
                          <div
                            style={{ top: `${nowTop}px` }}
                            className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                          >
                            <div className="w-2.5 h-2.5 -left-1.5 -top-1 absolute rounded-full bg-red-500 ring-2 ring-red-400/50 shadow-sm" />
                          </div>
                        )}

                        {/* Timed Event Blocks */}
                        {timedLayout.map((item) => (
                          <div
                            key={item.event.uid}
                            onClick={() => setSelectedDayDetail({ date: col.date, events: col.events })}
                            style={{
                              top: `${item.top}px`,
                              height: `${item.height}px`,
                              left: `calc(${(item.lane / item.totalLanes) * 100}% + 1px)`,
                              width: `calc(${(1 / item.totalLanes) * 100}% - 2px)`,
                              backgroundColor: `${item.event.color || '#3b82f6'}26`,
                              borderLeftColor: item.event.color || '#3b82f6',
                            }}
                            className="absolute rounded border-l-2 md:border-l-3 border-t border-r border-b border-gray-700/50 p-1 text-left overflow-hidden transition-all hover:brightness-125 hover:z-30 cursor-pointer shadow-sm backdrop-blur-xs flex flex-col justify-start"
                          >
                            <div className="text-[9px] md:text-[10px] font-mono font-bold text-blue-300 truncate leading-none">
                              {formatTimeShort(new Date(item.event.start))}
                            </div>
                            <div className="text-[10px] md:text-xs font-bold text-white leading-tight truncate mt-0.5">
                              {item.event.summary}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Monthly Grid View (Enlarged events and spacious cells) */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-black text-gray-400 pb-1.5 border-b border-gray-800 shrink-0">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 gap-1.5 flex-1 py-1.5 overflow-hidden">
            {/* Blank leading days */}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="p-1 rounded-xl bg-gray-950/10 border border-transparent" />
            ))}

            {/* Calendar Days */}
            {Array.from({ length: totalDaysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
              const isToday = dateObj.toDateString() === now.toDateString();
              const dayEvents = events.filter((e) => isEventOnDate(e, dateObj));

              return (
                <div
                  key={`day-${day}`}
                  onClick={() => {
                    if (dayEvents.length > 0) {
                      setSelectedDayDetail({ date: dateObj, events: dayEvents });
                    }
                  }}
                  className={`flex flex-col justify-start p-2 rounded-xl border transition-all overflow-hidden ${
                    dayEvents.length > 0 ? 'cursor-pointer hover:border-gray-600' : ''
                  } ${
                    isToday
                      ? 'bg-blue-600/15 border-blue-500/80 shadow-md'
                      : 'border-gray-800/60 bg-gray-950/40 hover:bg-gray-800/40'
                  }`}
                >
                  {/* Day Number Header */}
                  <div className="flex items-center justify-between mb-1 shrink-0">
                    <span
                      className={`text-xs md:text-sm font-black w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-blue-600 text-white shadow' : 'text-gray-200'
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
                        title={`${de.summary} (${formatEventTime(de)})${de.location ? ` - ${de.location}` : ''}`}
                        style={{
                          backgroundColor: de.isAllDay ? (de.color || '#3b82f6') : `${de.color || '#3b82f6'}26`,
                          borderLeftColor: de.color || '#3b82f6',
                          color: de.isAllDay ? '#ffffff' : '#f1f5f9',
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold truncate border-l-4 leading-tight shadow-2xs"
                      >
                        {!de.isAllDay ? (
                          <span className="font-mono text-[10px] md:text-[11px] opacity-80 shrink-0">
                            {formatTimeShort(new Date(de.start))}
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
        <div className="absolute inset-0 z-40 bg-gray-950/95 backdrop-blur-md p-4 flex flex-col justify-between rounded-xl border border-gray-700/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-white">
                {selectedDayDetail.date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDayDetail(null)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {selectedDayDetail.events.map((evt) => (
              <div
                key={evt.uid}
                style={{
                  backgroundColor: `${evt.color || '#3b82f6'}18`,
                  borderLeftColor: evt.color || '#3b82f6',
                }}
                className="p-3 rounded-xl border-l-4 bg-gray-900/60 space-y-1"
              >
                <div className="flex items-center justify-between text-xs text-gray-300 font-mono">
                  <span className="flex items-center gap-1.5 font-semibold text-blue-300">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    {formatEventTime(evt)}
                    {evt.end && !evt.isAllDay && ` – ${new Date(evt.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                  </span>
                  {evt.calendarName && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-black/40 text-gray-300 border border-white/5">
                      {evt.calendarName}
                    </span>
                  )}
                </div>
                <div className="text-sm md:text-base font-bold text-white">{evt.summary}</div>
                {evt.description && (
                  <div className="text-xs text-gray-300 line-clamp-3 leading-relaxed mt-1">
                    {evt.description}
                  </div>
                )}
                {evt.location && (
                  <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-500" />
                    <span>{evt.location}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-gray-800/80 flex justify-end shrink-0">
            <button
              type="button"
              onClick={() => setSelectedDayDetail(null)}
              className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-200 transition-colors cursor-pointer"
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