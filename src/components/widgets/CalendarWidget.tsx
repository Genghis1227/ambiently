import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, MapPin, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchCalendarEvents, type CalendarEvent, type CalendarSource } from '../../services/feeds';

interface CalendarWidgetProps {
  sources?: CalendarSource[];
  defaultView?: 'agenda' | 'week' | 'month';
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

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({
  sources = DEFAULT_SOURCES,
  defaultView = 'agenda',
}) => {
  const [view, setView] = useState<'agenda' | 'month'>(defaultView === 'month' ? 'month' : 'agenda');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

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

  const now = new Date();
  const upcomingEvents = events.filter((e) => new Date(e.start).getTime() >= now.getTime() - 24 * 60 * 60 * 1000);

  // Simple Month Matrix calculation
  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const startDay = startOfMonth.getDay();
  const totalDays = endOfMonth.getDate();

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-hidden select-none">
      {/* Widget Header */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-2 mb-2 pr-28">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            {view === 'agenda' ? 'Upcoming Schedule' : currentMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setView(view === 'agenda' ? 'month' : 'agenda')}
            className="text-[11px] text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-800/70"
          >
            {view === 'agenda' ? 'Month View' : 'Agenda View'}
          </button>
          <button
            onClick={loadEvents}
            disabled={loading}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800"
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
            upcomingEvents.slice(0, 10).map((evt) => {
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
                      <span className="flex items-center gap-1">
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
      ) : (
        /* Monthly Grid View */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-400 pb-1 border-b border-gray-800">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 flex-1 py-1 text-center">
            {/* Blank leading days */}
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`blank-${i}`} className="p-1 text-gray-700 text-xs" />
            ))}

            {/* Calendar Days */}
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
              const isToday = dateObj.toDateString() === now.toDateString();

              // Check if events exist on this date
              const dayEvents = events.filter((e) => {
                const eDate = new Date(e.start);
                return (
                  eDate.getFullYear() === dateObj.getFullYear() &&
                  eDate.getMonth() === dateObj.getMonth() &&
                  eDate.getDate() === day
                );
              });

              return (
                <div
                  key={`day-${day}`}
                  className={`flex flex-col items-center justify-between p-1 rounded-lg border text-xs transition-all ${
                    isToday
                      ? 'bg-blue-600/20 border-blue-500/80 text-blue-300 font-bold'
                      : 'border-transparent text-gray-300 hover:bg-gray-800/40'
                  }`}
                >
                  <span>{day}</span>
                  <div className="flex gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map((de) => (
                      <span
                        key={de.uid}
                        style={{ backgroundColor: de.color || '#3b82f6' }}
                        className="w-1 h-1 rounded-full"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-gray-800/60 pt-1 text-[10px] text-gray-400">
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              className="flex items-center gap-0.5 hover:text-white"
            >
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="hover:text-blue-400 font-medium"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              className="flex items-center gap-0.5 hover:text-white"
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
