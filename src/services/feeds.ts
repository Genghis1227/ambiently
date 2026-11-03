// Client service to fetch and normalize calendar and RSS feeds

export interface CalendarEvent {
  uid: string;
  calendarId: string;
  calendarName: string;
  color: string;
  summary: string;
  description?: string;
  location?: string;
  start: string; // ISO string
  end?: string;  // ISO string
  isAllDay: boolean;
}

export interface CalendarSource {
  id: string;
  name: string;
  url: string; // webcal:// or https:// .ics
  color: string;
  enabled: boolean;
}

export interface RssArticle {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

export async function fetchCalendarEvents(sources: CalendarSource[]): Promise<CalendarEvent[]> {
  const enabledSources = sources.filter((s) => s.enabled && s.url.trim());
  if (enabledSources.length === 0) return [];

  const promises = enabledSources.map(async (src) => {
    try {
      let res = await fetch(`/api/ical?url=${encodeURIComponent(src.url.trim())}`);
      if (res.status === 404) {
        res = await fetch(`/functions/api/ical?url=${encodeURIComponent(src.url.trim())}`);
      }
      if (!res.ok) return [];
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return [];
      const data = await res.json();
      return (data.events || []).map((e: any) => ({
        ...e,
        calendarId: src.id,
        calendarName: src.name,
        color: src.color,
      }));
    } catch (err) {
      console.warn(`Failed to fetch calendar ${src.name}:`, err);
      return [];
    }
  });

  const results = await Promise.all(promises);
  const flattened: CalendarEvent[] = results.flat();

  // Sort chronologically
  return flattened.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export async function fetchRssFeed(feedUrl: string): Promise<{ title: string; items: RssArticle[] }> {
  if (!feedUrl || !feedUrl.trim()) return { title: '', items: [] };

  try {
    let res = await fetch(`/api/rss?url=${encodeURIComponent(feedUrl.trim())}`);
    if (res.status === 404) {
      res = await fetch(`/functions/api/rss?url=${encodeURIComponent(feedUrl.trim())}`);
    }
    if (!res.ok) return { title: '', items: [] };
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { title: '', items: [] };
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch RSS feed:', err);
    return { title: '', items: [] };
  }
}
