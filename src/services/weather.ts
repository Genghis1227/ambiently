// Open-Meteo zero-key Weather & Geocoding Service with Dexie caching
import { pruneLocalStorageCachePrefix } from './feeds';

export interface HourlyWeatherPoint {
  time: string;
  temp: number;
  weatherCode: number;
  conditionText: string;
  precipProb: number;
  isDay: boolean;
}

export type WeatherAlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

export interface WeatherAlert {
  id: string;
  event: string;
  severity: WeatherAlertSeverity;
  urgency?: string;
  certainty?: string;
  headline: string;
  description: string;
  instruction?: string;
  effective?: string;
  expires?: string;
  senderName?: string;
  areaDesc?: string;
}

export interface WeatherData {
  locationName: string;
  latitude: number;
  longitude: number;
  currentTemp: number; // in user preferred unit
  apparentTemp: number;
  conditionCode: number;
  conditionText: string;
  isDay: boolean;
  highTemp: number;
  lowTemp: number;
  humidity: number;
  windSpeed: number;
  unit: 'F' | 'C';
  forecast: {
    date: string;
    dayName: string;
    maxTemp: number;
    minTemp: number;
    conditionCode: number;
    conditionText: string;
  }[];
  hourly?: HourlyWeatherPoint[];
  alerts?: WeatherAlert[];
  fetchedAt: number;
}

export interface GeocodingResult {
  id: number;
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
}

// Map WMO weather codes to human text & icon names
export function mapWmoCode(code: number): { text: string; icon: string } {
  switch (code) {
    case 0:
      return { text: 'Clear Sky', icon: 'Sun' };
    case 1:
      return { text: 'Mainly Clear', icon: 'Sun' };
    case 2:
      return { text: 'Partly Cloudy', icon: 'CloudSun' };
    case 3:
      return { text: 'Overcast', icon: 'Cloud' };
    case 45:
    case 48:
      return { text: 'Fog', icon: 'CloudFog' };
    case 51:
    case 53:
    case 55:
      return { text: 'Drizzle', icon: 'CloudDrizzle' };
    case 61:
    case 63:
    case 65:
      return { text: 'Rain', icon: 'CloudRain' };
    case 71:
    case 73:
    case 75:
      return { text: 'Snow', icon: 'Snowflake' };
    case 80:
    case 81:
    case 82:
      return { text: 'Rain Showers', icon: 'CloudRain' };
    case 95:
    case 96:
    case 99:
      return { text: 'Thunderstorm', icon: 'CloudLightning' };
    default:
      return { text: 'Partly Cloudy', icon: 'CloudSun' };
  }
}

export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query.trim()
    )}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Geocoding network error');
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error('Location search failed:', err);
    return [];
  }
}

const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_WEATHER_CACHE_KEYS = 5;
const memoryWeatherCache = new Map<string, WeatherData>();
const inFlightWeatherRequests = new Map<string, Promise<WeatherData>>();

function getWeatherCacheKey(lat: number, lon: number, unit: 'F' | 'C'): string {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}_${unit}`;
}

function getCachedWeather(key: string): { data: WeatherData; isStale: boolean } | null {
  let cached = memoryWeatherCache.get(key);
  if (!cached && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(`ambiently_weather_cache_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as WeatherData;
        if (parsed && typeof parsed.currentTemp === 'number') {
          cached = parsed;
          memoryWeatherCache.set(key, parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }
  if (!cached) return null;
  return {
    data: cached,
    isStale: Date.now() - (cached.fetchedAt || 0) > WEATHER_CACHE_TTL_MS,
  };
}

function setCachedWeather(key: string, data: WeatherData): void {
  if (memoryWeatherCache.has(key)) {
    memoryWeatherCache.delete(key);
  } else if (memoryWeatherCache.size >= MAX_WEATHER_CACHE_KEYS) {
    const oldestKey = memoryWeatherCache.keys().next().value;
    if (oldestKey !== undefined) memoryWeatherCache.delete(oldestKey);
  }
  memoryWeatherCache.set(key, data);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const targetStorageKey = `ambiently_weather_cache_${key}`;
      localStorage.setItem(targetStorageKey, JSON.stringify(data));
      pruneLocalStorageCachePrefix(
        'ambiently_weather_cache_',
        MAX_WEATHER_CACHE_KEYS,
        memoryWeatherCache,
        key,
        (parsed) => (parsed && typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : null)
      );
    } catch {
      // ignore storage errors
    }
  }
}

export interface OpenMeteoHourlyPayload {
  time?: unknown;
  temperature_2m?: unknown;
  weather_code?: unknown;
  precipitation_probability?: unknown;
  is_day?: unknown;
}

export function formatHourlyPointTime(timeStr: string, hour12: boolean): string {
  const match = /T(\d{2}):(\d{2})/.exec(timeStr);
  if (!match) return timeStr;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour)) return timeStr;

  if (!hour12) {
    return `${String(hour).padStart(2, '0')}:${String(Number.isFinite(minute) ? minute : 0).padStart(2, '0')}`;
  }

  const suffix = hour >= 12 ? 'p' : 'a';
  const hour12Val = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12Val}${suffix}`;
}

export function getPeakPrecipProb(
  hourly: HourlyWeatherPoint[] | undefined,
  hours = 6
): number {
  if (!Array.isArray(hourly) || hourly.length === 0) return 0;
  let peak = 0;
  for (const pt of hourly.slice(0, Math.max(1, hours))) {
    if (Number.isFinite(pt.precipProb) && pt.precipProb > peak) {
      peak = pt.precipProb;
    }
  }
  return Math.round(peak);
}

export function getAlertBadgeColors(
  severity: WeatherAlertSeverity,
  isLight = false
): { container: string; pill: string; icon: string } {
  if (severity === 'Extreme') {
    return isLight
      ? {
          container: 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100',
          pill: 'bg-rose-600 text-white',
          icon: 'text-rose-600',
        }
      : {
          container: 'bg-rose-500/15 border-rose-500/45 text-rose-100 hover:bg-rose-500/25',
          pill: 'bg-rose-500 text-white',
          icon: 'text-rose-400',
        };
  }
  if (severity === 'Severe') {
    return isLight
      ? {
          container: 'bg-orange-50 border-orange-300 text-orange-900 hover:bg-orange-100',
          pill: 'bg-orange-600 text-white',
          icon: 'text-orange-600',
        }
      : {
          container: 'bg-orange-500/15 border-orange-500/45 text-orange-100 hover:bg-orange-500/25',
          pill: 'bg-orange-500 text-white',
          icon: 'text-orange-400',
        };
  }
  return isLight
    ? {
        container: 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100',
        pill: 'bg-amber-500 text-slate-950',
        icon: 'text-amber-600',
      }
    : {
        container: 'bg-amber-500/15 border-amber-500/40 text-amber-100 hover:bg-amber-500/25',
        pill: 'bg-amber-400 text-slate-950',
        icon: 'text-amber-400',
      };
}

export function isWithinUsNwsBounds(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  // Continental US, Alaska, Hawaii, Puerto Rico, USVI, and Guam/CNMI
  const inUsMain = lat >= 17.5 && lat <= 72 && lon >= -180 && lon <= -64;
  const inMarianas = lat >= 13 && lat <= 21 && lon >= 144 && lon <= 146.5;
  return inUsMain || inMarianas;
}

export function extractUpcomingHourlyForecast(
  hourlyPayload: OpenMeteoHourlyPayload | undefined,
  options?: { currentTime?: string; nowMs?: number; limit?: number }
): HourlyWeatherPoint[] {
  if (!hourlyPayload || !Array.isArray(hourlyPayload.time)) return [];
  const times = hourlyPayload.time;
  const temps = Array.isArray(hourlyPayload.temperature_2m) ? hourlyPayload.temperature_2m : [];
  const codes = Array.isArray(hourlyPayload.weather_code) ? hourlyPayload.weather_code : [];
  const precips = Array.isArray(hourlyPayload.precipitation_probability)
    ? hourlyPayload.precipitation_probability
    : [];
  const isDays = Array.isArray(hourlyPayload.is_day) ? hourlyPayload.is_day : [];

  const limit = Math.max(1, options?.limit ?? 12);
  const floorHourStr =
    typeof options?.currentTime === 'string' && options.currentTime.length >= 13
      ? `${options.currentTime.slice(0, 13)}:00`
      : null;
  const cutoffMs = (options?.nowMs ?? Date.now()) - 45 * 60 * 1000;

  const result: HourlyWeatherPoint[] = [];
  for (let i = 0; i < times.length && result.length < limit; i++) {
    const timeStr = typeof times[i] === 'string' ? (times[i] as string) : '';
    if (!timeStr) continue;

    if (floorHourStr) {
      if (timeStr < floorHourStr) continue;
    } else {
      const parsedMs = Date.parse(timeStr);
      if (!Number.isFinite(parsedMs) || parsedMs < cutoffMs) continue;
    }

    const rawTemp = Number(temps[i]);
    if (!Number.isFinite(rawTemp)) continue;
    const rawCode = Number(codes[i] ?? 0);
    const rawPrecip = Number(precips[i] ?? 0);
    const precipProb = Number.isFinite(rawPrecip)
      ? Math.max(0, Math.min(100, Math.round(rawPrecip)))
      : 0;
    const cond = mapWmoCode(Number.isFinite(rawCode) ? rawCode : 0);

    result.push({
      time: timeStr,
      temp: Math.round(rawTemp),
      weatherCode: Number.isFinite(rawCode) ? rawCode : 0,
      conditionText: cond.text,
      precipProb,
      isDay: isDays[i] === undefined ? true : Boolean(isDays[i]),
    });
  }

  return result;
}

const ALERT_SEVERITY_RANK: Record<WeatherAlertSeverity, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};

function normalizeAlertSeverity(value: unknown): WeatherAlertSeverity {
  switch (value) {
    case 'Extreme':
    case 'Severe':
    case 'Moderate':
    case 'Minor':
      return value;
    default:
      return 'Unknown';
  }
}

export function parseNwsAlertsResponse(payload: unknown, nowMs = Date.now()): WeatherAlert[] {
  if (!payload || typeof payload !== 'object') return [];
  const rawFeatures = (payload as { features?: unknown }).features;
  if (!Array.isArray(rawFeatures)) return [];

  const parsed: WeatherAlert[] = [];
  const seenIds = new Set<string>();

  for (const feature of rawFeatures) {
    if (!feature || typeof feature !== 'object') continue;
    const props = (feature as { properties?: Record<string, unknown> }).properties;
    if (!props || typeof props !== 'object') continue;

    if (props.status === 'Test' || props.messageType === 'Cancel') continue;

    const endCandidate =
      typeof props.ends === 'string' && props.ends
        ? props.ends
        : typeof props.expires === 'string' && props.expires
          ? props.expires
          : undefined;
    if (endCandidate) {
      const endMs = Date.parse(endCandidate);
      if (Number.isFinite(endMs) && endMs < nowMs) continue;
    }

    const event = typeof props.event === 'string' ? props.event.trim() : '';
    const headline = typeof props.headline === 'string' ? props.headline.trim() : '';
    const description = typeof props.description === 'string' ? props.description.trim() : '';
    if (!event && !headline) continue;

    const rawId =
      (typeof (feature as { id?: unknown }).id === 'string' && (feature as { id: string }).id) ||
      (typeof props.id === 'string' && props.id) ||
      `${event}:${typeof props.effective === 'string' ? props.effective : parsed.length}`;
    if (seenIds.has(rawId)) continue;
    seenIds.add(rawId);

    parsed.push({
      id: rawId,
      event: event || headline || 'Weather Alert',
      severity: normalizeAlertSeverity(props.severity),
      urgency: typeof props.urgency === 'string' ? props.urgency : undefined,
      certainty: typeof props.certainty === 'string' ? props.certainty : undefined,
      headline: headline || event,
      description,
      instruction:
        typeof props.instruction === 'string' && props.instruction.trim()
          ? props.instruction.trim()
          : undefined,
      effective: typeof props.effective === 'string' ? props.effective : undefined,
      expires: typeof props.expires === 'string' ? props.expires : undefined,
      senderName: typeof props.senderName === 'string' ? props.senderName : undefined,
      areaDesc: typeof props.areaDesc === 'string' ? props.areaDesc : undefined,
    });
  }

  parsed.sort((a, b) => ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity]);
  return parsed.slice(0, 10);
}

export async function fetchNwsAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
  if (!isWithinUsNwsBounds(lat, lon)) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/geo+json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return parseNwsAlertsResponse(data);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

const inFlightAlertRequests = new Map<string, Promise<WeatherAlert[]>>();
const memoryAlertCache = new Map<string, { alerts: WeatherAlert[]; fetchedAt: number }>();

/**
 * Cached & in-flight deduplicated zero-key NOAA/NWS active alerts lookup for US coordinates.
 * Runs independently of Open-Meteo so slow or unreachable alert endpoints never delay weather rendering.
 */
export async function fetchWeatherAlerts(
  lat: number,
  lon: number,
  forceRefresh = false
): Promise<WeatherAlert[]> {
  if (!isWithinUsNwsBounds(lat, lon)) return [];
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = memoryAlertCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < 15 * 60 * 1000) {
    return cached.alerts;
  }

  if (!forceRefresh) {
    const pending = inFlightAlertRequests.get(key);
    if (pending) return pending;
  }

  const reqPromise = (async () => {
    const alerts = await fetchNwsAlerts(lat, lon);
    memoryAlertCache.set(key, { alerts, fetchedAt: Date.now() });
    if (memoryAlertCache.size > 20) {
      const oldestKey = memoryAlertCache.keys().next().value;
      if (oldestKey) memoryAlertCache.delete(oldestKey);
    }
    return alerts;
  })();

  inFlightAlertRequests.set(key, reqPromise);
  try {
    return await reqPromise;
  } finally {
    if (inFlightAlertRequests.get(key) === reqPromise) {
      inFlightAlertRequests.delete(key);
    }
  }
}

export async function fetchWeatherData(
  lat: number,
  lon: number,
  locationName: string,
  unit: 'F' | 'C' = 'F',
  forceRefresh: boolean = false
): Promise<WeatherData> {
  const cacheKey = getWeatherCacheKey(lat, lon, unit);
  const cached = getCachedWeather(cacheKey);

  if (!forceRefresh && cached && !cached.isStale && Array.isArray(cached.data.hourly)) {
    return { ...cached.data, locationName };
  }

  if (!forceRefresh) {
    const pending = inFlightWeatherRequests.get(cacheKey);
    if (pending) {
      const shared = await pending;
      return { ...shared, locationName };
    }
  }

  const tempUnitParam = unit === 'F' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto${tempUnitParam}`;

  const requestPromise = (async (): Promise<WeatherData> => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather fetch failed: ${res.statusText}`);
      const data = await res.json();

      const current = data.current;
      const daily = data.daily;
      const condition = mapWmoCode(current.weather_code);

      const forecastDays = (daily.time || []).slice(0, 5).map((dateStr: string, idx: number) => {
        const d = new Date(dateStr + 'T00:00:00');
        const dayName = idx === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' });
        const dayCond = mapWmoCode(daily.weather_code[idx]);
        return {
          date: dateStr,
          dayName,
          maxTemp: Math.round(daily.temperature_2m_max[idx]),
          minTemp: Math.round(daily.temperature_2m_min[idx]),
          conditionCode: daily.weather_code[idx],
          conditionText: dayCond.text,
        };
      });

      const hourly = extractUpcomingHourlyForecast(data.hourly, {
        currentTime: typeof current?.time === 'string' ? current.time : undefined,
        limit: 12,
      });

      const result: WeatherData = {
        locationName,
        latitude: lat,
        longitude: lon,
        currentTemp: Math.round(current.temperature_2m),
        apparentTemp: Math.round(current.apparent_temperature),
        conditionCode: current.weather_code,
        conditionText: condition.text,
        isDay: Boolean(current.is_day),
        highTemp: Math.round(daily.temperature_2m_max[0] ?? current.temperature_2m),
        lowTemp: Math.round(daily.temperature_2m_min[0] ?? current.temperature_2m),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        unit,
        forecast: forecastDays,
        hourly,
        fetchedAt: Date.now(),
      };

      setCachedWeather(cacheKey, result);
      return result;
    } catch (err) {
      if (cached) {
        return { ...cached.data, locationName };
      }
      throw err;
    }
  })();

  inFlightWeatherRequests.set(cacheKey, requestPromise);
  try {
    const resolved = await requestPromise;
    return { ...resolved, locationName };
  } finally {
    if (inFlightWeatherRequests.get(cacheKey) === requestPromise) {
      inFlightWeatherRequests.delete(cacheKey);
    }
  }
}
