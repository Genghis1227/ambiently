export type TimerMode = 'countdown' | 'pomodoro';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface TimerItem {
  id: string;
  label: string;
  durationSec: number;
  status: TimerStatus;
  endsAt?: string | null;
  remainingSec?: number;
  completedAt?: string | null;
  mode?: TimerMode;
  pomodoroPhase?: 'focus' | 'break';
}

export interface TimerPreset {
  id: string;
  label: string;
  durationSec: number;
  icon?: string;
  mode?: TimerMode;
  pomodoroPhase?: 'focus' | 'break';
}

export interface TimerWidgetConfig {
  timers?: TimerItem[];
  chimeEnabled?: boolean;
  defaultFocusMin?: number;
  defaultBreakMin?: number;
  transparentBg?: boolean;
}

export const MAX_TIMERS_PER_WIDGET = 6;

export interface AirQualityWidgetConfig {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  showPollen?: boolean;
  showUvStrip?: boolean;
  refreshIntervalMin?: 15 | 30 | 60;
  transparentBg?: boolean;
}

export interface SunMoonWidgetConfig {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  showGoldenHour?: boolean;
  showMoonDetails?: boolean;
  transparentBg?: boolean;
}
