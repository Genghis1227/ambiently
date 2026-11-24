const validZoneCache = new Map<string, string | undefined>();
const offsetFormatterCache = new Map<string, Intl.DateTimeFormat>();
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export interface WorldClockCity {
  id: string;
  cityName: string;
  country?: string;
  timezone: string; // IANA timezone e.g. 'Asia/Tokyo', 'Europe/London'
}

export const DEFAULT_WORLD_CITIES: WorldClockCity[] = [
  {
    id: 'wc-tokyo',
    cityName: 'Tokyo',
    country: 'Japan',
    timezone: 'Asia/Tokyo',
  },
];

function getSafeTimezone(timezone?: string): string | undefined {
  if (!timezone) return undefined;
  if (validZoneCache.has(timezone)) return validZoneCache.get(timezone);
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    validZoneCache.set(timezone, timezone);
    return timezone;
  } catch {
    validZoneCache.set(timezone, undefined);
    return undefined;
  }
}

export function getZoneOffsetMinutes(now: Date, timezone?: string): number {
  const safeZone = getSafeTimezone(timezone);
  if (!safeZone) return 0;
  try {
    let partsFormatter = offsetFormatterCache.get(safeZone);
    if (!partsFormatter) {
      partsFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: safeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      offsetFormatterCache.set(safeZone, partsFormatter);
    }
    const parts = partsFormatter.formatToParts(now);
    const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    const y = getPart('year');
    const m = getPart('month') - 1;
    const d = getPart('day');
    const h = getPart('hour') % 24;
    const min = getPart('minute');
    const s = getPart('second');
    const targetUtc = Date.UTC(y, m, d, h, min, s);
    const actualUtc = now.getTime();
    return Math.round((targetUtc - actualUtc) / 60000);
  } catch {
    return 0;
  }
}

export interface FormattedZoneTime {
  hoursMinutes: string;
  ampm: string;
  seconds: string;
  hour24: number;
  minuteNum: number;
  secondNum: number;
  dateStr: string;
  tzShort: string;
  diffLabel: string;
  isDaytime: boolean;
}

export function getFormattedTimeForZone(
  now: Date,
  timezone?: string,
  hour12: boolean = true
): FormattedZoneTime {
  const safeZone = getSafeTimezone(timezone);
  const cacheKey = safeZone || '__local__';

  let partsFormatter = partsFormatterCache.get(cacheKey);
  if (!partsFormatter) {
    partsFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
    partsFormatterCache.set(cacheKey, partsFormatter);
  }

  const parts = partsFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const rawHour24 = parseInt(getPart('hour'), 10);
  const hour24 = Number.isNaN(rawHour24) ? now.getHours() : rawHour24 % 24;
  const minuteNum = parseInt(getPart('minute'), 10) || 0;
  const secondNum = parseInt(getPart('second'), 10) || 0;
  const tzShort = getPart('timeZoneName') || 'Local';

  const hour12Num = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hoursMinutes = `${String(hour12 ? hour12Num : hour24).padStart(2, '0')}:${String(minuteNum).padStart(2, '0')}`;
  const ampm = hour12 ? (hour24 >= 12 ? 'PM' : 'AM') : '';
  const seconds = String(secondNum).padStart(2, '0');

  let dateFormatter = dateFormatterCache.get(cacheKey);
  if (!dateFormatter) {
    dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeZone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    dateFormatterCache.set(cacheKey, dateFormatter);
  }
  const dateStr = dateFormatter.format(now);

  // Compute hour difference relative to device local time
  let diffLabel = 'Local Time';
  if (safeZone) {
    try {
      const targetYear = parseInt(getPart('year'), 10);
      const targetMonth = parseInt(getPart('month'), 10) - 1;
      const targetDay = parseInt(getPart('day'), 10);
      const targetAsUtc = Date.UTC(targetYear, targetMonth, targetDay, hour24, minuteNum);
      const localAsUtc = Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes()
      );
      const diffHours = Math.round((targetAsUtc - localAsUtc) / (1000 * 60 * 60) * 2) / 2;
      if (diffHours === 0) {
        diffLabel = 'Same as local';
      } else if (diffHours > 0) {
        diffLabel = `+${diffHours}h ahead`;
      } else {
        diffLabel = `${diffHours}h behind`;
      }
    } catch {
      diffLabel = safeZone;
    }
  }

  const isDaytime = hour24 >= 6 && hour24 < 18;

  return {
    hoursMinutes,
    ampm,
    seconds,
    hour24,
    minuteNum,
    secondNum,
    dateStr,
    tzShort,
    diffLabel,
    isDaytime,
  };
}
