// Open-Meteo zero-key Weather & Geocoding Service with Dexie caching

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
      // Prune stale weather cache keys beyond active memory keys
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ambiently_weather_cache_')) {
          const subKey = k.slice('ambiently_weather_cache_'.length);
          if (!memoryWeatherCache.has(subKey)) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch {
      // ignore storage errors
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
  if (!forceRefresh && cached && !cached.isStale) {
    return { ...cached.data, locationName };
  }

  const tempUnitParam = unit === 'F' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto${tempUnitParam}`;

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
}
