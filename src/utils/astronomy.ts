export type PolarState = 'normal' | 'always_day' | 'always_night';

export interface SolarArcPoint {
  x: number;
  y: number;
  progress: number;
}

export interface SolarSummary {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  morningGoldenHourEnd: Date | null;
  eveningGoldenHourStart: Date | null;
  dayLengthSec: number;
  daylightDeltaSec: number;
  sunAltitudeDeg: number;
  isDaylight: boolean;
  polarState: PolarState;
  arcPoint: SolarArcPoint;
}

export interface LunarSummary {
  phaseCycle: number; // 0..1 (0 = New, 0.5 = Full)
  phaseAgeDays: number;
  illuminationPct: number;
  phaseName: string;
  isWaxing: boolean;
  daysUntilFullMoon: number;
  daysUntilNewMoon: number;
}

export const SOLAR_ARC_WIDTH = 240;
export const SOLAR_ARC_HEIGHT = 96;
export const SOLAR_HORIZON_Y = 74;
export const SOLAR_START_X = 24;
export const SOLAR_END_X = 216;
export const SOLAR_AMPLITUDE = 56;

const SYNODIC_MONTH_DAYS = 29.530588853;
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function getCalendarDateInTimeZone(
  date: Date,
  timeZone?: string
): { year: number; month: number; day: number } {
  if (timeZone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = formatter.formatToParts(date);
      const year = Number(parts.find((p) => p.type === 'year')?.value);
      const month = Number(parts.find((p) => p.type === 'month')?.value);
      const day = Number(parts.find((p) => p.type === 'day')?.value);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        return { year, month, day };
      }
    } catch {
      // Fallback to local system date if timeZone is invalid
    }
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function solarEphemerisAtJd(jd: number): { declRad: number; eqTimeMin: number } {
  const t = (jd - 2451545.0) / 36525.0;
  const l0 = normalizeDeg(280.46646 + t * (36000.76983 + 0.0003032 * t));
  const m = normalizeDeg(357.52911 + t * (35999.05029 - 0.0001537 * t));
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const mRad = toRad(m);
  const c =
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289;

  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const apparentLong = trueLong - 0.00569 - 0.00478 * Math.sin(toRad(omega));

  const meanObliq =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliqCorr = meanObliq + 0.00256 * Math.cos(toRad(omega));

  const declRad = Math.asin(Math.sin(toRad(obliqCorr)) * Math.sin(toRad(apparentLong)));
  const y = Math.tan(toRad(obliqCorr / 2)) ** 2;
  const l0Rad = toRad(l0);

  const eqTimeMin =
    4 *
    toDeg(
      y * Math.sin(2 * l0Rad) -
        2 * e * Math.sin(mRad) +
        4 * e * y * Math.sin(mRad) * Math.cos(2 * l0Rad) -
        0.5 * y * y * Math.sin(4 * l0Rad) -
        1.25 * e * e * Math.sin(2 * mRad)
    );

  return { declRad, eqTimeMin };
}

function computeSolarDayWindow(
  utcMidnightMs: number,
  latitude: number,
  longitude: number
): {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  morningGoldenHourEnd: Date | null;
  eveningGoldenHourStart: Date | null;
  dayLengthSec: number;
  polarState: PolarState;
} {
  const lat = clamp(latitude, -89.9, 89.9);
  const latRad = toRad(lat);
  const jd0 = utcMidnightMs / 86400000 + 2440587.5;

  // Compute solar noon iteratively
  const approxNoonMin = 720 - 4 * longitude;
  const noonEphem1 = solarEphemerisAtJd(jd0 + approxNoonMin / 1440);
  const noonMin1 = 720 - 4 * longitude - noonEphem1.eqTimeMin;
  const noonEphem2 = solarEphemerisAtJd(jd0 + noonMin1 / 1440);
  const noonMinUtc = 720 - 4 * longitude - noonEphem2.eqTimeMin;
  const solarNoon = new Date(utcMidnightMs + noonMinUtc * 60_000);

  const solveZenith = (
    zenithDeg: number
  ): { rise: Date | null; set: Date | null; state: PolarState } => {
    const cosZ = Math.cos(toRad(zenithDeg));
    const calcHaDeg = (declRad: number): { haDeg: number; state: PolarState } => {
      const cosHa =
        cosZ / (Math.cos(latRad) * Math.cos(declRad)) -
        Math.tan(latRad) * Math.tan(declRad);
      if (cosHa > 1) return { haDeg: 0, state: 'always_night' };
      if (cosHa < -1) return { haDeg: 180, state: 'always_day' };
      return { haDeg: toDeg(Math.acos(cosHa)), state: 'normal' };
    };

    const initial = calcHaDeg(noonEphem2.declRad);
    if (initial.state !== 'normal') {
      return { rise: null, set: null, state: initial.state };
    }

    const riseMin1 = noonMinUtc - 4 * initial.haDeg;
    const setMin1 = noonMinUtc + 4 * initial.haDeg;

    const riseEphem = solarEphemerisAtJd(jd0 + riseMin1 / 1440);
    const riseHa = calcHaDeg(riseEphem.declRad);
    const riseMinFinal =
      riseHa.state === 'normal'
        ? 720 - 4 * longitude - riseEphem.eqTimeMin - 4 * riseHa.haDeg
        : riseMin1;

    const setEphem = solarEphemerisAtJd(jd0 + setMin1 / 1440);
    const setHa = calcHaDeg(setEphem.declRad);
    const setMinFinal =
      setHa.state === 'normal'
        ? 720 - 4 * longitude - setEphem.eqTimeMin + 4 * setHa.haDeg
        : setMin1;

    return {
      rise: new Date(utcMidnightMs + riseMinFinal * 60_000),
      set: new Date(utcMidnightMs + setMinFinal * 60_000),
      state: 'normal',
    };
  };

  const horizon = solveZenith(90.833);
  const golden = solveZenith(84.0);

  let dayLengthSec = 0;
  if (horizon.state === 'always_day') {
    dayLengthSec = 86400;
  } else if (horizon.state === 'always_night') {
    dayLengthSec = 0;
  } else if (horizon.rise && horizon.set) {
    dayLengthSec = Math.max(
      0,
      Math.round((horizon.set.getTime() - horizon.rise.getTime()) / 1000)
    );
  }

  return {
    sunrise: horizon.rise,
    sunset: horizon.set,
    solarNoon,
    morningGoldenHourEnd: golden.rise,
    eveningGoldenHourStart: golden.set,
    dayLengthSec,
    polarState: horizon.state,
  };
}

export function pointOnSolarArc(progress: number): { x: number; y: number } {
  const p = clamp(progress, 0, 1);
  return {
    x: SOLAR_START_X + p * (SOLAR_END_X - SOLAR_START_X),
    y: SOLAR_HORIZON_Y - Math.sin(Math.PI * p) * SOLAR_AMPLITUDE,
  };
}

export function computeSolarSummary(
  date: Date,
  latitude: number,
  longitude: number,
  timeZone?: string
): SolarSummary {
  const safeLat = Number.isFinite(latitude) ? clamp(latitude, -89.9, 89.9) : 30.2672;
  const safeLon = Number.isFinite(longitude) ? clamp(longitude, -180, 180) : -97.7431;

  const { year, month, day } = getCalendarDateInTimeZone(date, timeZone);
  const utcMidnightMs = Date.UTC(year, month - 1, day);

  const todayWin = computeSolarDayWindow(utcMidnightMs, safeLat, safeLon);
  const yesterdayWin = computeSolarDayWindow(utcMidnightMs - 86_400_000, safeLat, safeLon);
  const daylightDeltaSec = todayWin.dayLengthSec - yesterdayWin.dayLengthSec;

  // Instantaneous sun altitude at `date`
  const nowMs = date.getTime();
  const jdNow = nowMs / 86400000 + 2440587.5;
  const nowEphem = solarEphemerisAtJd(jdNow);
  const utcMinutesOfDay =
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    (date.getUTCSeconds() + date.getUTCMilliseconds() / 1000) / 60;
  const trueSolarTimeMin =
    (((utcMinutesOfDay + nowEphem.eqTimeMin + 4 * safeLon) % 1440) + 1440) % 1440;
  const hourAngleDeg = trueSolarTimeMin / 4 - 180;
  const latRad = toRad(safeLat);
  const sinAlt =
    Math.sin(latRad) * Math.sin(nowEphem.declRad) +
    Math.cos(latRad) * Math.cos(nowEphem.declRad) * Math.cos(toRad(hourAngleDeg));
  const sunAltitudeDeg = toDeg(Math.asin(clamp(sinAlt, -1, 1)));

  let isDaylight = false;
  let arcPoint: SolarArcPoint;

  if (todayWin.polarState === 'always_day') {
    isDaylight = true;
    const pt = pointOnSolarArc(0.5);
    arcPoint = { ...pt, progress: 0.5 };
  } else if (todayWin.polarState === 'always_night') {
    isDaylight = false;
    arcPoint = { x: (SOLAR_START_X + SOLAR_END_X) / 2, y: SOLAR_HORIZON_Y + 10, progress: 0 };
  } else if (todayWin.sunrise && todayWin.sunset) {
    const riseMs = todayWin.sunrise.getTime();
    const setMs = todayWin.sunset.getTime();
    if (nowMs >= riseMs && nowMs <= setMs && setMs > riseMs) {
      isDaylight = true;
      const progress = clamp((nowMs - riseMs) / (setMs - riseMs), 0, 1);
      const pt = pointOnSolarArc(progress);
      arcPoint = { ...pt, progress };
    } else if (nowMs < riseMs) {
      isDaylight = false;
      arcPoint = { x: SOLAR_START_X, y: SOLAR_HORIZON_Y + 8, progress: 0 };
    } else {
      isDaylight = false;
      arcPoint = { x: SOLAR_END_X, y: SOLAR_HORIZON_Y + 8, progress: 1 };
    }
  } else {
    isDaylight = sunAltitudeDeg > -0.833;
    const pt = pointOnSolarArc(0.5);
    arcPoint = { ...pt, progress: 0.5 };
  }

  return {
    sunrise: todayWin.sunrise,
    sunset: todayWin.sunset,
    solarNoon: todayWin.solarNoon,
    morningGoldenHourEnd: todayWin.morningGoldenHourEnd,
    eveningGoldenHourStart: todayWin.eveningGoldenHourStart,
    dayLengthSec: todayWin.dayLengthSec,
    daylightDeltaSec,
    sunAltitudeDeg: Math.round(sunAltitudeDeg * 10) / 10,
    isDaylight,
    polarState: todayWin.polarState,
    arcPoint,
  };
}

export function computeLunarSummary(date: Date): LunarSummary {
  const daysSinceEpoch = (date.getTime() - NEW_MOON_EPOCH_MS) / 86_400_000;
  const phaseCycle = ((daysSinceEpoch / SYNODIC_MONTH_DAYS) % 1 + 1) % 1;
  const phaseAgeDays = Math.round(phaseCycle * SYNODIC_MONTH_DAYS * 10) / 10;
  const illuminationPct = Math.round(((1 - Math.cos(2 * Math.PI * phaseCycle)) / 2) * 100);
  const isWaxing = phaseCycle < 0.5;

  let phaseName = 'New Moon';
  if (phaseCycle < 0.035 || phaseCycle >= 0.965) {
    phaseName = 'New Moon';
  } else if (phaseCycle < 0.215) {
    phaseName = 'Waxing Crescent';
  } else if (phaseCycle < 0.285) {
    phaseName = 'First Quarter';
  } else if (phaseCycle < 0.465) {
    phaseName = 'Waxing Gibbous';
  } else if (phaseCycle < 0.535) {
    phaseName = 'Full Moon';
  } else if (phaseCycle < 0.715) {
    phaseName = 'Waning Gibbous';
  } else if (phaseCycle < 0.785) {
    phaseName = 'Last Quarter';
  } else {
    phaseName = 'Waning Crescent';
  }

  const daysUntilFullRaw =
    phaseCycle <= 0.5
      ? (0.5 - phaseCycle) * SYNODIC_MONTH_DAYS
      : (1.5 - phaseCycle) * SYNODIC_MONTH_DAYS;
  const daysUntilNewRaw =
    phaseCycle < 0.01 || phaseCycle > 0.99 ? 0 : (1 - phaseCycle) * SYNODIC_MONTH_DAYS;

  return {
    phaseCycle,
    phaseAgeDays,
    illuminationPct,
    phaseName,
    isWaxing,
    daysUntilFullMoon: Math.round(daysUntilFullRaw),
    daysUntilNewMoon: Math.round(daysUntilNewRaw),
  };
}

/**
 * Generates an SVG path describing the illuminated portion of a lunar disc centered at (radius, radius).
 */
export function buildMoonPhaseSvgPath(radius: number, phaseCycle: number): string {
  const r = Math.max(1, radius);
  const p = ((phaseCycle % 1) + 1) % 1;

  if (p < 0.015 || p > 0.985) {
    return '';
  }

  if (Math.abs(p - 0.5) < 0.015) {
    return `M ${r} 0 A ${r} ${r} 0 1 1 ${r} ${2 * r} A ${r} ${r} 0 1 1 ${r} 0 Z`;
  }

  const rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
  const isWaxing = p < 0.5;
  const outerSweep = isWaxing ? 1 : 0;

  if (rx < 0.05) {
    return `M ${r} 0 A ${r} ${r} 0 0 ${outerSweep} ${r} ${2 * r} L ${r} 0 Z`;
  }

  // Sweep from bottom (r, 2r) back to top (r, 0):
  // 0 = counter-clockwise (curves right), 1 = clockwise (curves left)
  let innerSweep: number;
  if (isWaxing) {
    innerSweep = p < 0.25 ? 0 : 1;
  } else {
    innerSweep = p < 0.75 ? 0 : 1;
  }

  return `M ${r} 0 A ${r} ${r} 0 0 ${outerSweep} ${r} ${2 * r} A ${rx.toFixed(3)} ${r} 0 0 ${innerSweep} ${r} 0 Z`;
}
