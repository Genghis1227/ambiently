import type { DashboardWidget, DefaultWidgetFrameStyle } from '../types/dashboard';

export const STICKER_CAPABLE_WIDGET_TYPES = new Set<DashboardWidget['type']>([
  'image',
  'textbox',
  'clock',
  'world_clock',
  'clock_weather',
  'weather',
  'countdown',
  'quotes',
  'photo_frame',
]);

export function isStickerCapableWidget(type?: DashboardWidget['type']): boolean {
  if (!type) return false;
  return STICKER_CAPABLE_WIDGET_TYPES.has(type);
}

export function getDefaultWidgetStickerMode(
  type?: DashboardWidget['type'],
  defaultStyle: DefaultWidgetFrameStyle = 'auto'
): boolean {
  if (!isStickerCapableWidget(type)) return false;
  if (defaultStyle === 'sticker') return true;
  if (defaultStyle === 'bordered') return false;
  // 'auto': Photos/GIFs and Text Boxes default to Sticker mode; other tiles default to With Borders
  return type === 'image' || type === 'textbox';
}

export function isWidgetStickerMode(
  widget?: DashboardWidget | null,
  defaultStyle: DefaultWidgetFrameStyle = 'auto'
): boolean {
  if (!widget || !isStickerCapableWidget(widget.type)) return false;

  if (widget.type === 'textbox') {
    if (widget.config?.bgStyle === 'glass' || widget.config?.bgStyle === 'solid') {
      return false;
    }
    if (typeof widget.config?.transparentBg === 'boolean') {
      return widget.config.transparentBg;
    }
    if (widget.config?.bgStyle === 'transparent') {
      return true;
    }
    return getDefaultWidgetStickerMode('textbox', defaultStyle);
  }

  if (typeof widget.config?.transparentBg === 'boolean') {
    return widget.config.transparentBg;
  }

  return getDefaultWidgetStickerMode(widget.type, defaultStyle);
}
