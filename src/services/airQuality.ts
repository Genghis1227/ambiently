import { pruneLocalStorageCachePrefix } from './feeds';

export type AirQualityBadgeTone = 'emerald' | 'amber' | 'orange' | 'rose' | 'purple';

export interface AqiClassification {
  level: 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very_unhealthy' | 'hazardous';
  label: string;
  guidance: string;
  badgeTone: AirQualityBadgeTone;
}

export interface UvClassification {
  level: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';
  label: string;
  guidance: string;
  badgeTone: AirQualityBadgeTone;
}

export interface PollenClassification {
  level: 'none' | 'low' | 'moderate' | 'high' | 'unavailable';
  label: string;
  value: number | null;
}

export interface HourlyUvSlot {
  hour24: number;
  label: string;
  uvIndex: number;
}

export interface AirQualityData {
  locationName: string;
  latitude: number;
  longitude: number;
  usAqi: number;
  pm25: number;
  pm10: number;
  ozone: number;
  uvIndex: number;
  peakUv: number;
  treePollen: number | null;
  grassPollen: number | null;
  weedPollen: number | null;
  hasPollenData: boolean;
  hourlyUvSlots: HourlyUvSlot[];
  fetchedAt: number;
}

export function classifyUsAqi(aqi: number): AqiClassification {
  const safe = Number.isFinite(aqi) ? Math.max(0, aqi) : 0;
  if (safe <= 50) {
    return {
      level: 'good',
      label: 'Good',
      guidance: 'Clean air — ideal for outdoor time',
      badgeTone: 'emerald',
    };
  }
  if (safe <= 100) {
    return {
      level: 'moderate',
      label: 'Moderate',
      guidance: 'Acceptable air quality for most people',
      badgeTone: 'amber',
    };
  }
  if (safe <= 150) {
    return {
      level: 'sensitive',
      label: 'Sensitive',
      guidance: 'Sensitive groups should limit long exertion',
      badgeTone: 'orange',
    };
  }
  if (safe <= 200) {
    return {
      level: 'unhealthy',
      label: 'Unhealthy',
      guidance: 'Reduce prolonged outdoor activity',
      badgeTone: 'rose',
    };
  }
  if (safe <= 300) {
    return {
      level: 'very_unhealthy',
      label: 'Very Unhealthy',
      guidance: 'Avoid strenuous outdoor exertion',
      badgeTone: 'purple',
    };
  }
  return {
    level: 'hazardous',
    label: 'Hazardous',
    guidance: 'Stay indoors and keep windows closed',
    badgeTone: 'purple',
  };
}

export function classifyUvIndex(uv: number): UvClassification {
  const safe = Number.isFinite(uv) ? Math.max(0, uv) : 0;
  if (safe < 3) {
    return {
      level: 'low',
      label: 'Low',
      guidance: 'Minimal sun protection needed',
      badgeTone: 'emerald',
    };
  }
  if (safe < 6) {
    return {
      level: 'moderate',
      label: 'Moderate',
      guidance: 'Sunglasses & SPF 30+ midday',
      badgeTone: 'amber',
    };
  }
  if (safe < 8) {
    return {
      level: 'high',
      label: 'High',
      guidance: 'Hat & sunscreen recommended',
      badgeTone: 'orange',
    };
  }
  if (safe < 11) {
    return {
      level: 'very_high',
      label: 'Very High',
      guidance: 'Seek shade & reapply SPF 30+',
      badgeTone: 'rose',
    };
  }
  return {
    level: 'extreme',
    label: 'Extreme',
    guidance: 'Avoid peak midday sun exposure',
    badgeTone: 'purple',
  };
}

export function classifyPollenLevel(
  grains: number | null | undefined,
  kind: 'tree' | 'grass' | 'weed'
): PollenClassification {
  if (grains === null || grains === undefined || !Number.isFinite(grains)) {
    return { level: 'unavailable', label: 'Unavailable', value: null };
  }
  const value = Math.max(0, Math.round(grains * 10) / 10);
  if (value < 1) {
    return { level: 'none', label: 'None', value };
  }

  const [lowMax, modMax] =
    kind === 'tree' ? [15, 90] : kind === 'grass' ? [5, 20] : [10, 50];

  if (value < lowMax) {
    return { level: 'low', label: 'Low', value };
  }
  if (value < modMax) {
    return { level: 'moderate', label: 'Moderate', value };
  }
  return { level: 'high', label: 'High', value };
}

function numOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function numOrZero(val: unknown): number {
  const n = numOrNull(val);
  return n === null ? 0 : n;
}

function maxNullable(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

const TARGET_UV_HOURS: Array<{ hour24: number; label: string }> = [
  { hour24: 9, label: '9a' },
  { hour24: 12, label: '12p' },
  { hour24: 15, label: '3p' },
  { hour24: 18, label: '6p' },
];

export function normalizeOpenMeteoAirQuality(
  raw: Record<string, any>,
  lat: number,
  lon: number,
  locationName: string,
  fetchedAt: number = Date.now()
): AirQualityData {
  const current = (raw?.current && typeof raw.current === 'object' ? raw.current : {}) as Record<
    string,
    unknown
  >;
  const hourly = (raw?.hourly && typeof raw.hourly === 'object' ? raw.hourly : {}) as Record<
    string,
    unknown
  >;

  const treePollen = maxNullable([
    numOrNull(current.alder_pollen),
    numOrNull(current.birch_pollen),
    numOrNull(current.olive_pollen),
  ]);
  const grassPollen = numOrNull(current.grass_pollen);
  const weedPollen = maxNullable([
    numOrNull(current.mugwort_pollen),
    numOrNull(current.ragweed_pollen),
  ]);
  const hasPollenData =
    treePollen !== null || grassPollen !== null || weedPollen !== null;

  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const uvs = Array.isArray(hourly.uv_index) ? hourly.uv_index : [];

  const uvByHour = new Map<number, number>();
  let peakUv = numOrZero(current.uv_index);

  for (let i = 0; i < times.length; i++) {
    const timeStr = typeof times[i] === 'string' ? times[i] : '';
    const uvVal = numOrNull(uvs[i]);
    if (uvVal === null) continue;
    if (uvVal > peakUv) peakUv = uvVal;

    const hourMatch = timeStr.match(/T(\d{2}):/);
    if (hourMatch) {
      const hr = Number(hourMatch[1]);
      if (!uvByHour.has(hr)) {
        uvByHour.set(hr, Math.round(uvVal * 10) / 10);
      }
    }
  }

  const hourlyUvSlots: HourlyUvSlot[] = TARGET_UV_HOURS.filter((slot) =>
    uvByHour.has(slot.hour24)
  ).map((slot) => ({
    hour24: slot.hour24,
    label: slot.label,
    uvIndex: uvByHour.get(slot.hour24) ?? 0,
  }));

  return {
    locationName,
    latitude: lat,
    longitude: lon,
    usAqi: Math.round(numOrZero(current.us_aqi)),
    pm25: Math.round(numOrZero(current.pm2_5) * 10) / 10,
    pm10: Math.round(numOrZero(current.pm10) * 10) / 10,
    ozone: Math.round(numOrZero(current.ozone)),
    uvIndex: Math.round(numOrZero(current.uv_index) * 10) / 10,
    peakUv: Math.round(peakUv * 10) / 10,
    treePollen,
    grassPollen,
    weedPollen,
    hasPollenData,
    hourlyUvSlots,
    fetchedAt,
  };
}

const AQI_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_AQI_CACHE_KEYS = 5;
const AQI_STORAGE_PREFIX = 'ambiently_aqi_cache_';
const memoryAqiCache = new Map<string, AirQualityData>();

function getAqiCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

function getCachedAqi(key: string): { data: AirQualityData; isStale: boolean } | null {
  let cached = memoryAqiCache.get(key);
  if (!cached && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(`${AQI_STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as AirQualityData;
        if (parsed && typeof parsed.usAqi === 'number') {
          cached = parsed;
          memoryAqiCache.set(key, parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }
  if (!cached) return null;
  return {
    data: cached,
    isStale: Date.now() - (cached.fetchedAt || 0) > AQI_CACHE_TTL_MS,
  };
}

function setCachedAqi(key: string, data: AirQualityData): void {
  if (memoryAqiCache.has(key)) {
    memoryAqiCache.delete(key);
  } else if (memoryAqiCache.size >= MAX_AQI_CACHE_KEYS) {
    const oldestKey = memoryAqiCache.keys().next().value;
    if (oldestKey !== undefined) memoryAqiCache.delete(oldestKey);
  }
  memoryAqiCache.set(key, data);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(`${AQI_STORAGE_PREFIX}${key}`, JSON.stringify(data));
      pruneLocalStorageCachePrefix(
        AQI_STORAGE_PREFIX,
        MAX_AQI_CACHE_KEYS,
        memoryAqiCache,
        key,
        (parsed) => (parsed && typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : null)
      );
    } catch {
      // ignore storage errors
    }
  }
}

export async function fetchAirQualityData(
  lat: number,
  lon: number,
  locationName: string,
  forceRefresh: boolean = false
): Promise<{ data: AirQualityData; isStaleCache: boolean }> {
  const cacheKey = getAqiCacheKey(lat, lon);
  const cached = getCachedAqi(cacheKey);
  if (!forceRefresh && cached && !cached.isStale) {
    return {
      data: { ...cached.data, locationName },
      isStaleCache: false,
    };
  }

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&hourly=uv_index,us_aqi&timezone=auto&forecast_days=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Air quality fetch failed: ${res.statusText}`);
    const raw = (await res.json()) as Record<string, any>;
    const normalized = normalizeOpenMeteoAirQuality(raw, lat, lon, locationName);
    setCachedAqi(cacheKey, normalized);
    return { data: normalized, isStaleCache: false };
  } catch (err) {
    if (cached) {
      return {
        data: { ...cached.data, locationName },
        isStaleCache: true,
      };
    }
    throw err;
  }
}
