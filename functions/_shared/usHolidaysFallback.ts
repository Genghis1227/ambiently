// Built-in deterministic US Holidays generator used when Google Calendar's public
// holiday feed rate-limits shared edge egress IPs (HTTP 429) or is unreachable.

export interface FallbackCalendarEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  isAllDay: boolean;
}

const US_HOLIDAY_CALENDAR_IDS = new Set([
  'en.usa#holiday@group.v.calendar.google.com',
  'en.usa.official#holiday@group.v.calendar.google.com',
]);

export function isGoogleUsHolidaysUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.toLowerCase().endsWith('calendar.google.com')) {
      return false;
    }
    const match = parsed.pathname.match(/\/calendar\/ical\/([^/]+)\/public\//i);
    if (!match || !match[1]) return false;
    const decodedId = decodeURIComponent(match[1]).toLowerCase();
    return US_HOLIDAY_CALENDAR_IDS.has(decodedId);
  } catch {
    return false;
  }
}

function nthWeekdayOfMonth(year: number, month1Based: number, weekday0Sun: number, nth: number): number {
  const firstDayWeekday = new Date(Date.UTC(year, month1Based - 1, 1)).getUTCDay();
  const offset = (weekday0Sun - firstDayWeekday + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

function lastWeekdayOfMonth(year: number, month1Based: number, weekday0Sun: number): number {
  const lastDate = new Date(Date.UTC(year, month1Based, 0));
  const lastDay = lastDate.getUTCDate();
  const lastWeekday = lastDate.getUTCDay();
  const offset = (lastWeekday - weekday0Sun + 7) % 7;
  return lastDay - offset;
}

// Anonymous Gregorian algorithm for Easter Sunday
function computeEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function formatAllDayIso(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00`;
}

interface RawHolidaySpec {
  slug: string;
  summary: string;
  year: number;
  month: number;
  day: number;
  federalObserved?: boolean;
}

function collectHolidaysForYear(year: number): RawHolidaySpec[] {
  const easter = computeEasterSunday(year);
  const thanksgivingDay = nthWeekdayOfMonth(year, 11, 4, 4);

  const specs: RawHolidaySpec[] = [
    { slug: 'new-years-day', summary: "New Year's Day", year, month: 1, day: 1, federalObserved: true },
    {
      slug: 'mlk-day',
      summary: 'Martin Luther King Jr. Day',
      year,
      month: 1,
      day: nthWeekdayOfMonth(year, 1, 1, 3),
    },
    { slug: 'valentines-day', summary: "Valentine's Day", year, month: 2, day: 14 },
    {
      slug: 'presidents-day',
      summary: "Presidents' Day",
      year,
      month: 2,
      day: nthWeekdayOfMonth(year, 2, 1, 3),
    },
    { slug: 'st-patricks-day', summary: "St. Patrick's Day", year, month: 3, day: 17 },
    { slug: 'easter-sunday', summary: 'Easter Sunday', year, month: easter.month, day: easter.day },
    {
      slug: 'mothers-day',
      summary: "Mother's Day",
      year,
      month: 5,
      day: nthWeekdayOfMonth(year, 5, 0, 2),
    },
    {
      slug: 'memorial-day',
      summary: 'Memorial Day',
      year,
      month: 5,
      day: lastWeekdayOfMonth(year, 5, 1),
    },
    { slug: 'juneteenth', summary: 'Juneteenth', year, month: 6, day: 19, federalObserved: true },
    {
      slug: 'fathers-day',
      summary: "Father's Day",
      year,
      month: 6,
      day: nthWeekdayOfMonth(year, 6, 0, 3),
    },
    { slug: 'independence-day', summary: 'Independence Day', year, month: 7, day: 4, federalObserved: true },
    {
      slug: 'labor-day',
      summary: 'Labor Day',
      year,
      month: 9,
      day: nthWeekdayOfMonth(year, 9, 1, 1),
    },
    {
      slug: 'indigenous-peoples-day',
      summary: "Indigenous Peoples' Day",
      year,
      month: 10,
      day: nthWeekdayOfMonth(year, 10, 1, 2),
    },
    { slug: 'halloween', summary: 'Halloween', year, month: 10, day: 31 },
    { slug: 'veterans-day', summary: 'Veterans Day', year, month: 11, day: 11, federalObserved: true },
    { slug: 'thanksgiving', summary: 'Thanksgiving Day', year, month: 11, day: thanksgivingDay },
    {
      slug: 'day-after-thanksgiving',
      summary: 'Day after Thanksgiving',
      year,
      month: 11,
      day: thanksgivingDay + 1,
    },
    { slug: 'christmas-eve', summary: 'Christmas Eve', year, month: 12, day: 24 },
    { slug: 'christmas-day', summary: 'Christmas Day', year, month: 12, day: 25, federalObserved: true },
    { slug: 'new-years-eve', summary: "New Year's Eve", year, month: 12, day: 31 },
  ];

  const withObserved: RawHolidaySpec[] = [];
  for (const h of specs) {
    withObserved.push(h);
    if (h.federalObserved) {
      const dt = new Date(Date.UTC(h.year, h.month - 1, h.day));
      const dow = dt.getUTCDay();
      if (dow === 6) {
        // Saturday federal holiday observed on preceding Friday
        const obs = new Date(Date.UTC(h.year, h.month - 1, h.day - 1));
        withObserved.push({
          slug: `${h.slug}-observed`,
          summary: `${h.summary} (Observed)`,
          year: obs.getUTCFullYear(),
          month: obs.getUTCMonth() + 1,
          day: obs.getUTCDate(),
        });
      } else if (dow === 0) {
        // Sunday federal holiday observed on following Monday
        const obs = new Date(Date.UTC(h.year, h.month - 1, h.day + 1));
        withObserved.push({
          slug: `${h.slug}-observed`,
          summary: `${h.summary} (Observed)`,
          year: obs.getUTCFullYear(),
          month: obs.getUTCMonth() + 1,
          day: obs.getUTCDate(),
        });
      }
    }
  }

  return withObserved;
}

export function generateUsHolidayEvents(rangeStart: Date, rangeEnd: Date): FallbackCalendarEvent[] {
  const startYear = rangeStart.getUTCFullYear() - 1;
  const endYear = rangeEnd.getUTCFullYear() + 1;
  const events: FallbackCalendarEvent[] = [];
  const seenUids = new Set<string>();

  for (let year = startYear; year <= endYear; year++) {
    for (const h of collectHolidaysForYear(year)) {
      const evtStart = new Date(Date.UTC(h.year, h.month - 1, h.day));
      const evtEnd = new Date(Date.UTC(h.year, h.month - 1, h.day + 1));
      if (evtEnd < rangeStart || evtStart > rangeEnd) continue;

      const startIso = formatAllDayIso(evtStart);
      const endIso = formatAllDayIso(evtEnd);
      const uid = `builtin-us-holiday-${h.slug}-${startIso.slice(0, 10)}`;
      if (seenUids.has(uid)) continue;
      seenUids.add(uid);

      events.push({
        uid,
        summary: h.summary,
        description: 'Public holiday in the United States',
        location: '',
        start: startIso,
        end: endIso,
        isAllDay: true,
      });
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}
