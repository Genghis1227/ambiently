export type ChalkboardSurface = 'slate' | 'cork' | 'whiteboard';

export type ChalkTool = 'chalk' | 'marker' | 'eraser';

export type ChalkBrushSize = 'fine' | 'medium' | 'bold';

export interface ChalkStroke {
  id: string;
  tool: ChalkTool;
  color: string;
  size: ChalkBrushSize;
  /** Flattened normalized integer coordinates [x0, y0, x1, y1, ...] in 0..1000 board space */
  points: number[];
}

export interface ChalkboardWidgetConfig {
  surface?: ChalkboardSurface;
  defaultTool?: 'chalk' | 'marker';
  defaultColor?: string;
  defaultSize?: ChalkBrushSize;
  showToolbar?: boolean;
  confirmBeforeClear?: boolean;
  allowDrawingWhenLocked?: boolean;
  strokes?: ChalkStroke[];
  transparentBg?: boolean;
  themeMode?: 'auto' | 'light' | 'dark';
}

export type SoundscapeChannelId =
  | 'rain'
  | 'fireplace'
  | 'brown_noise'
  | 'ocean'
  | 'forest_wind';

export type SoundscapePresetId =
  | 'custom'
  | 'cozy_hearth'
  | 'rainy_study'
  | 'coastal_breeze'
  | 'forest_morning'
  | 'deep_slumber';

export type SoundscapeSleepTimerMin = 0 | 15 | 30 | 60 | 90;

export type SoundscapeChannelLevels = Record<SoundscapeChannelId, number>;

export interface SoundscapeWidgetConfig {
  channels?: Partial<SoundscapeChannelLevels>;
  masterVolume?: number;
  activePreset?: SoundscapePresetId;
  fadeOutOnNightMode?: boolean;
  defaultSleepTimerMin?: SoundscapeSleepTimerMin;
  transparentBg?: boolean;
  themeMode?: 'auto' | 'light' | 'dark';
}
