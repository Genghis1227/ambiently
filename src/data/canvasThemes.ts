import type { CanvasBackgroundTheme } from '../types/dashboard';

export interface CanvasThemeOption {
  id: CanvasBackgroundTheme;
  label: string;
  description: string;
  previewClass: string;
  canvasClass: string;
}

export const CANVAS_THEMES: CanvasThemeOption[] = [
  {
    id: 'midnight_dots',
    label: 'Midnight Dots',
    description: 'Deep slate canvas with subtle pinboard dot matrix',
    previewClass: 'bg-[#090d16] bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:8px_8px]',
    canvasClass: 'bg-[#090d16] bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:24px_24px]',
  },
  {
    id: 'warm_cork',
    label: 'Warm Corkboard',
    description: 'Classic warm cork & espresso grain texture',
    previewClass: 'bg-[#2a1b12] bg-[radial-gradient(#5c3d28_1px,transparent_1px)] [background-size:8px_8px]',
    canvasClass: 'bg-[#23170f] bg-[radial-gradient(#4a3221_1.5px,transparent_1.5px)] [background-size:20px_20px]',
  },
  {
    id: 'oled_black',
    label: 'True OLED Black',
    description: 'Zero-glow #000000 pitch black for OLED displays',
    previewClass: 'bg-black border border-gray-800',
    canvasClass: 'bg-black',
  },
  {
    id: 'aurora',
    label: 'Frosted Aurora',
    description: 'Ambient Northern Lights emerald & indigo gradient',
    previewClass: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-emerald-950',
    canvasClass: 'bg-gradient-to-br from-[#060913] via-[#111836] to-[#062825]',
  },
  {
    id: 'blueprint',
    label: 'Blueprint Grid',
    description: 'Architectural navy canvas with crisp cyan grid lines',
    previewClass: 'bg-[#0a192f] border border-cyan-500/30',
    canvasClass:
      'bg-[#071120] bg-[linear-gradient(to_right,#1e3a5f22_1px,transparent_1px),linear-gradient(to_bottom,#1e3a5f22_1px,transparent_1px)] [background-size:32px_32px]',
  },
  {
    id: 'custom',
    label: 'Custom Wallpaper',
    description: 'Use any high-res image URL as your board backdrop',
    previewClass: 'bg-gradient-to-r from-purple-900/60 to-pink-900/60',
    canvasClass: 'bg-[#090d16] bg-cover bg-center bg-no-repeat',
  },
];
