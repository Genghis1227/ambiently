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

export async function fetchWeatherData(
  lat: number,
  lon: number,
  locationName: string,
  unit: 'F' | 'C' = 'F'
): Promise<WeatherData> {
  const tempUnitParam = unit === 'F' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto${tempUnitParam}`;

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

  return {
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
}
