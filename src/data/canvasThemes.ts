import type { CanvasBackgroundTheme } from '../types/dashboard';

export interface CanvasThemeOption {
  id: CanvasBackgroundTheme;
  label: string;
  description: string;
  previewClass: string;
  canvasClass: string;
  isLight?: boolean;
}

export const CANVAS_THEMES: CanvasThemeOption[] = [
  {
    id: 'midnight_dots',
    label: 'Midnight Dots',
    description: 'Deep slate canvas with subtle pinboard dot matrix',
    previewClass: 'bg-[#090d16] bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:8px_8px]',
    canvasClass: 'bg-[#090d16] bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:24px_24px]',
    isLight: false,
  },
  {
    id: 'paper_dots',
    label: 'Daylight Dots',
    description: 'Crisp off-white stationery with soft slate dot matrix',
    previewClass: 'bg-[#f8fafc] bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:8px_8px] border border-slate-300',
    canvasClass: 'bg-[#f8fafc] bg-[radial-gradient(#cbd5e1_1.5px,transparent_1.5px)] [background-size:24px_24px]',
    isLight: true,
  },
  {
    id: 'warm_linen',
    label: 'Warm Linen',
    description: 'Natural cream parchment with warm fiber grain',
    previewClass: 'bg-[#fbf7ee] bg-[radial-gradient(#d6c7b2_1px,transparent_1px)] [background-size:8px_8px] border border-stone-300',
    canvasClass: 'bg-[#fbf7ee] bg-[radial-gradient(#d6c7b2_1.5px,transparent_1.5px)] [background-size:20px_20px]',
    isLight: true,
  },
  {
    id: 'minimal_light',
    label: 'Studio White',
    description: 'Pure modern light gray studio backdrop',
    previewClass: 'bg-slate-100 border border-slate-300',
    canvasClass: 'bg-slate-100',
    isLight: true,
  },
  {
    id: 'warm_cork',
    label: 'Warm Corkboard',
    description: 'Classic warm cork & espresso grain texture',
    previewClass: 'bg-[#2a1b12] bg-[radial-gradient(#5c3d28_1px,transparent_1px)] [background-size:8px_8px]',
    canvasClass: 'bg-[#23170f] bg-[radial-gradient(#4a3221_1.5px,transparent_1.5px)] [background-size:20px_20px]',
    isLight: false,
  },
  {
    id: 'oled_black',
    label: 'True OLED Black',
    description: 'Zero-glow #000000 pitch black for OLED displays',
    previewClass: 'bg-black border border-gray-800',
    canvasClass: 'bg-black',
    isLight: false,
  },
  {
    id: 'aurora',
    label: 'Frosted Aurora',
    description: 'Ambient Northern Lights emerald & indigo gradient',
    previewClass: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-emerald-950',
    canvasClass: 'bg-gradient-to-br from-[#060913] via-[#111836] to-[#062825]',
    isLight: false,
  },
  {
    id: 'blueprint',
    label: 'Blueprint Grid',
    description: 'Architectural navy canvas with crisp cyan grid lines',
    previewClass: 'bg-[#0a192f] border border-cyan-500/30',
    canvasClass:
      'bg-[#071120] bg-[linear-gradient(to_right,#1e3a5f22_1px,transparent_1px),linear-gradient(to_bottom,#1e3a5f22_1px,transparent_1px)] [background-size:32px_32px]',
    isLight: false,
  },
  {
    id: 'custom',
    label: 'Custom Wallpaper',
    description: 'Use any high-res image URL as your board backdrop',
    previewClass: 'bg-gradient-to-r from-purple-900/60 to-pink-900/60',
    canvasClass: 'bg-[#090d16] bg-cover bg-center bg-no-repeat',
    isLight: false,
  },
];

export function isCanvasThemeLight(themeId?: string): boolean {
  if (!themeId) return false;
  const theme = CANVAS_THEMES.find((t) => t.id === themeId);
  return Boolean(theme?.isLight);
}

