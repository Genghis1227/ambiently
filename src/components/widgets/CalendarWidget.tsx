import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { fetchCalendarEvents, type CalendarEvent, type CalendarSource } from '../../services/feeds';

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

function isEventOnDate(evt: CalendarEvent, targetDate: Date): boolean {
  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0).getTime();
  const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999).getTime();
  const evtStart = new Date(evt.start).getTime();
  const evtEnd = evt.end ? new Date(evt.end).getTime() : evtStart;
  return evtStart <= dayEnd && evtEnd >= dayStart;
}

function formatEventTime(evt: CalendarEvent): string {
  if (evt.isAllDay) return 'All Day';
  const start = new Date(evt.start);
  return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
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

  const handleSwitchView = (newView: CalendarViewMode) => {
    setView(newView);
    if (onUpdateConfig) {
      onUpdateConfig({ defaultView: newView });
    }
  };

  const now = new Date();
  const upcomingEvents = events.filter((e) => new Date(e.start).getTime() >= now.getTime() - 24 * 60 * 60 * 1000);

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
        return 'Upcoming Schedule';
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
      {/* Widget Header */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-gray-800/80 pb-2 mb-2 pr-28 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarIcon className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
            {getHeaderTitle()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Segmented View Switcher: Agenda | 3-Day | Week | Month */}
          <div className="flex items-center bg-gray-950/80 p-0.5 rounded-lg border border-gray-800">
            {(['agenda', '3day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleSwitchView(v)}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${
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
            onClick={loadEvents}
            disabled={loading}
            title="Reload calendar feeds"
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {view === 'agenda' ? (
        /* Agenda View */
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {upcomingEvents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs py-8">
              <span>{loading ? 'Fetching calendar events...' : 'No upcoming events'}</span>
            </div>
          ) : (
            upcomingEvents.slice(0, 15).map((evt) => {
              const startDate = new Date(evt.start);
              const isToday = startDate.toDateString() === now.toDateString();

              return (
                <div
                  key={evt.uid}
                  className="flex items-start gap-2.5 p-2 rounded-xl bg-gray-950/40 border border-gray-800/60 hover:border-gray-700/80 transition-all"
                >
                  {/* Color strip */}
                  <div
                    className="w-1.5 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: evt.color || '#3b82f6' }}
                  />

                  {/* Date badge */}
                  <div className="flex flex-col items-center justify-center px-2 py-1 rounded-lg bg-gray-900 border border-gray-800 shrink-0 text-center min-w-[42px]">
                    <span className="text-[9px] uppercase font-bold text-gray-400">
                      {startDate.toLocaleDateString([], { weekday: 'short' })}
                    </span>
                    <span className={`text-sm font-extrabold font-mono ${isToday ? 'text-blue-400' : 'text-white'}`}>
                      {startDate.getDate()}
                    </span>
                  </div>

                  {/* Event Details */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-100 truncate">
                      {evt.summary}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-2.5 h-2.5" />
                        {evt.isAllDay
                          ? 'All Day'
                          : startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {evt.location && (
                        <span className="flex items-center gap-0.5 truncate max-w-[120px]">
                          <MapPin className="w-2.5 h-2.5" />
                          {evt.location}
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
        /* 3-Day View */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="grid grid-cols-3 gap-2 flex-1 overflow-hidden py-1">
            {threeDays.map((col, idx) => (
              <div
                key={idx}
                className={`flex flex-col h-full rounded-xl border p-2 overflow-hidden ${
                  col.isToday
                    ? 'bg-blue-600/10 border-blue-500/50 shadow-sm'
                    : 'bg-gray-950/40 border-gray-800/60'
                }`}
              >
                {/* Column Day Header */}
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-800/80 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                        col.isToday ? 'bg-blue-600 text-white shadow' : 'text-gray-300'
                      }`}
                    >
                      {col.date.getDate()}
                    </span>
                    <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                      {col.date.toLocaleDateString([], { weekday: 'short' })}
                    </span>
                  </div>
                  {col.isToday && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/25 text-blue-300">
                      Today
                    </span>
                  )}
                </div>

                {/* Day Events Stack */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                  {col.events.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10px] text-gray-600 italic py-6">
                      No events
                    </div>
                  ) : (
                    col.events.map((evt) => (
                      <div
                        key={evt.uid}
                        style={{
                          backgroundColor: `${evt.color || '#3b82f6'}1a`,
                          borderLeftColor: evt.color || '#3b82f6',
                        }}
                        className="p-1.5 rounded-lg border-l-2 text-left bg-gray-900/60 hover:bg-gray-800/70 transition-colors"
                      >
                        <div className="text-[9px] font-mono text-gray-300 flex items-center gap-1 font-semibold">
                          <Clock className="w-2.5 h-2.5 text-blue-400" />
                          {formatEventTime(evt)}
                        </div>
                        <div className="text-xs font-semibold text-white truncate mt-0.5">
                          {evt.summary}
                        </div>
                        {evt.location && (
                          <div className="text-[9px] text-gray-400 flex items-center gap-0.5 truncate mt-0.5">
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            {evt.location}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 3-Day Navigation Controls */}
          <div className="flex items-center justify-between border-t border-gray-800/60 pt-1 text-[10px] text-gray-400 shrink-0">
            <button
              type="button"
              onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - 3))}
              className="flex items-center gap-0.5 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3" /> Prev 3 Days
            </button>
            <button
              type="button"
              onClick={() => setBaseDate(new Date())}
              className="hover:text-blue-400 font-medium transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 3))}
              className="flex items-center gap-0.5 hover:text-white transition-colors cursor-pointer"
            >
              Next 3 Days <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : view === 'week' ? (
        /* Weekly View (7 Days) */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="grid grid-cols-7 gap-1 flex-1 overflow-hidden py-1">
            {weekDays.map((col, idx) => (
              <div
                key={idx}
                className={`flex flex-col h-full rounded-xl border p-1 overflow-hidden ${
                  col.isToday
                    ? 'bg-blue-600/10 border-blue-500/50 shadow-sm'
                    : 'bg-gray-950/40 border-gray-800/60'
                }`}
              >
                {/* Column Header */}
                <div className="flex flex-col items-center pb-1 mb-1 border-b border-gray-800/70 shrink-0 text-center">
                  <span className="text-[9px] uppercase font-bold text-gray-400">
                    {col.date.toLocaleDateString([], { weekday: 'narrow' })}
                  </span>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold mt-0.5 ${
                      col.isToday ? 'bg-blue-600 text-white shadow' : 'text-gray-200'
                    }`}
                  >
                    {col.date.getDate()}
                  </span>
                </div>

                {/* Day Events Stack */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
                  {col.events.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[8px] text-gray-600 italic py-4">
                      —
                    </div>
                  ) : (
                    col.events.map((evt) => (
                      <div
                        key={evt.uid}
                        title={`${evt.summary} (${formatEventTime(evt)})${evt.location ? ` - ${evt.location}` : ''}`}
                        style={{
                          backgroundColor: evt.isAllDay ? (evt.color || '#3b82f6') : `${evt.color || '#3b82f6'}22`,
                          borderLeftColor: evt.color || '#3b82f6',
                          color: evt.isAllDay ? '#ffffff' : '#f1f5f9',
                        }}
                        className="p-1 rounded border-l-2 text-left text-[9px] leading-tight hover:brightness-125 transition-all cursor-pointer"
                      >
                        <div className="font-mono text-[7.5px] font-bold opacity-80 truncate">
                          {formatEventTime(evt)}
                        </div>
                        <div className="font-medium truncate">{evt.summary}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Week Navigation Controls */}
          <div className="flex items-center justify-between border-t border-gray-800/60 pt-1 text-[10px] text-gray-400 shrink-0">
            <button
              type="button"
              onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - 7))}
              className="flex items-center gap-0.5 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3" /> Prev Week
            </button>
            <button
              type="button"
              onClick={() => setBaseDate(new Date())}
              className="hover:text-blue-400 font-medium transition-colors cursor-pointer"
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 7))}
              className="flex items-center gap-0.5 hover:text-white transition-colors cursor-pointer"
            >
              Next Week <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        /* Monthly Grid View (Google Calendar Style with event text & time) */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-400 pb-1 border-b border-gray-800 shrink-0">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 gap-1 flex-1 py-1 overflow-hidden">
            {/* Blank leading days */}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="p-1 text-gray-800 rounded-lg" />
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
                  className={`flex flex-col justify-start p-1 rounded-lg border text-xs transition-all overflow-hidden ${
                    dayEvents.length > 0 ? 'cursor-pointer' : ''
                  } ${
                    isToday
                      ? 'bg-blue-600/15 border-blue-500/80 shadow-sm'
                      : 'border-gray-800/50 bg-gray-950/30 hover:bg-gray-800/40 hover:border-gray-700'
                  }`}
                >
                  {/* Day Number Header */}
                  <div className="flex items-center justify-between mb-0.5 shrink-0">
                    <span
                      className={`text-[10px] font-semibold w-4 h-4 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-blue-600 text-white font-bold' : 'text-gray-300'
                      }`}
                    >
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: dayEvents[0]?.color || '#3b82f6' }}
                      />
                    )}
                  </div>

                  {/* Google Calendar-Style Event Text & Time Chips */}
                  <div className="flex-1 overflow-hidden space-y-0.5">
                    {dayEvents.slice(0, 2).map((de) => (
                      <div
                        key={de.uid}
                        title={`${de.summary} (${formatEventTime(de)})${de.location ? ` - ${de.location}` : ''}`}
                        style={{
                          backgroundColor: de.isAllDay ? (de.color || '#3b82f6') : `${de.color || '#3b82f6'}26`,
                          borderLeftColor: de.color || '#3b82f6',
                          color: de.isAllDay ? '#ffffff' : '#f1f5f9',
                        }}
                        className="flex items-center gap-1 px-1 py-0.5 rounded text-[8px] font-medium truncate border-l-2 leading-tight"
                      >
                        {!de.isAllDay && (
                          <span className="font-mono text-[7px] opacity-80 shrink-0">
                            {formatEventTime(de)}
                          </span>
                        )}
                        <span className="truncate">{de.summary}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-[7.5px] text-gray-400 font-bold pl-0.5 block leading-none">
                        +{dayEvents.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Month Navigation Controls */}
          <div className="flex items-center justify-between border-t border-gray-800/60 pt-1 text-[10px] text-gray-400 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              className="flex items-center gap-0.5 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date())}
              className="hover:text-blue-400 font-medium transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              className="flex items-center gap-0.5 hover:text-white transition-colors cursor-pointer"
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Selected Day Agenda Detail Popover */}
      {selectedDayDetail && (
        <div className="absolute inset-0 z-40 bg-gray-950/95 backdrop-blur-md p-3.5 flex flex-col justify-between rounded-xl border border-gray-700/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-white">
                {selectedDayDetail.date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDayDetail(null)}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {selectedDayDetail.events.map((evt) => (
              <div
                key={evt.uid}
                style={{
                  backgroundColor: `${evt.color || '#3b82f6'}18`,
                  borderLeftColor: evt.color || '#3b82f6',
                }}
                className="p-2 rounded-xl border-l-3 bg-gray-900/60"
              >
                <div className="flex items-center justify-between text-[10px] text-gray-300 font-mono mb-0.5">
                  <span className="flex items-center gap-1 font-semibold">
                    <Clock className="w-3 h-3 text-blue-400" />
                    {formatEventTime(evt)}
                    {evt.end && !evt.isAllDay && ` - ${new Date(evt.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/30 text-gray-400">
                    {evt.calendarName}
                  </span>
                </div>
                <div className="text-xs font-bold text-white mb-0.5">{evt.summary}</div>
                {evt.description && (
                  <div className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed mb-1">
                    {evt.description}
                  </div>
                )}
                {evt.location && (
                  <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3 shrink-0 text-gray-500" />
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
              className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
