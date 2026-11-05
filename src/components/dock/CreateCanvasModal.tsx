import React, { useRef, useState, useEffect } from 'react';
import { X, Plus, Palette, Upload, SunDim } from 'lucide-react';
import { CANVAS_ICONS } from '../../data/canvasIcons';
import { CANVAS_THEMES } from '../../data/canvasThemes';
import {
  CURATED_WALLPAPER_PRESETS,
  processUploadedWallpaper,
} from '../../utils/imageUpload';
import type { CanvasBackgroundTheme } from '../../types/dashboard';
import { MAX_CANVASES } from '../../types/dashboard';

interface CreateCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCanvas: (
    name: string,
    icon: string,
    backgroundTheme?: CanvasBackgroundTheme,
    customWallpaperUrl?: string,
    backgroundDimLevel?: number
  ) => void;
  existingCanvasCount?: number;
}

export const CreateCanvasModal: React.FC<CreateCanvasModalProps> = ({
  isOpen,
  onClose,
  onCreateCanvas,
  existingCanvasCount = 0,
}) => {
  const isLimitReached = existingCanvasCount >= MAX_CANVASES;
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Pin');
  const [selectedTheme, setSelectedTheme] = useState<CanvasBackgroundTheme>('midnight_dots');
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState('');
  const [backgroundDimLevel, setBackgroundDimLevel] = useState<number>(45);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const dataUrl = await processUploadedWallpaper(file);
      setCustomWallpaperUrl(dataUrl);
      setSelectedTheme('custom');
    } catch (err) {
      console.error('Failed to process uploaded wallpaper:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreateCanvas(
      name.trim(),
      selectedIcon,
      selectedTheme,
      selectedTheme === 'custom' ? customWallpaperUrl.trim() : undefined,
      backgroundDimLevel
    );
    setName('');
    setSelectedIcon('Pin');
    setSelectedTheme('midnight_dots');
    setCustomWallpaperUrl('');
    setBackgroundDimLevel(45);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Create New Canvas</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-5 overflow-y-auto space-y-4">
          {isLimitReached && (
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex flex-col gap-1">
              <span className="font-bold flex items-center gap-1.5">
                <span>⚠️</span> Canvas Limit Reached ({existingCanvasCount}/{MAX_CANVASES})
              </span>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                You have reached the maximum limit of {MAX_CANVASES} canvases. Please remove an existing canvas to create a new one.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
              Canvas / Board Name
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Photos, Living Room, Kitchen Display, Office..."
              className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
              Choose an Icon
            </label>
            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1 bg-gray-950 rounded-xl border border-gray-800">
              {CANVAS_ICONS.map((item) => {
                const IconComponent = item.icon;
                const isSelected = selectedIcon === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedIcon(item.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow'
                        : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800/60'
                    }`}
                  >
                    <IconComponent className="w-4 h-4 mb-1" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Canvas Background Theme Picker */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-1.5">
              <Palette className="w-3.5 h-3.5 text-emerald-400" />
              <span>Canvas Background Theme</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CANVAS_THEMES.map((theme) => {
                const isSelected = selectedTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedTheme(theme.id)}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                        : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg shrink-0 ${theme.previewClass}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{theme.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedTheme === 'custom' && (
            <div className="space-y-3 p-3 rounded-xl bg-gray-950 border border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Upload Picture (Up to 4K UHD) or Paste URL
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploading ? 'Processing...' : 'Upload Picture'}</span>
                </button>
              </div>

              {/* 4K Curated Photo Presets */}
              <div className="grid grid-cols-4 gap-1.5">
                {CURATED_WALLPAPER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setCustomWallpaperUrl(preset.url)}
                    title={preset.label}
                    className={`relative h-11 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                      customWallpaperUrl === preset.url
                        ? 'border-emerald-400 ring-1 ring-emerald-400'
                        : 'border-gray-800 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={preset.thumbUrl}
                      alt={preset.label}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={customWallpaperUrl.startsWith('data:') ? 'Uploaded Local Picture (4K Ready)' : customWallpaperUrl}
                onChange={(e) => setCustomWallpaperUrl(e.target.value)}
                placeholder="https://images.unsplash.com/photo-..."
                className="w-full rounded-lg bg-gray-900 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />

              {/* Background Dim Level Slider */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-gray-300 mb-1">
                  <span className="flex items-center gap-1 font-semibold">
                    <SunDim className="w-3.5 h-3.5 text-amber-400" />
                    Background Dim Level
                  </span>
                  <span className="font-mono font-bold text-emerald-400">{backgroundDimLevel}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={backgroundDimLevel}
                  onChange={(e) => setBackgroundDimLevel(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                  <span>0% (Full Brightness)</span>
                  <span>45% (Balanced)</span>
                  <span>90% (Deep Dark)</span>
                </div>
              </div>

              {/* Live Wallpaper + Dim Preview */}
              {customWallpaperUrl && (
                <div
                  className="relative h-20 rounded-xl overflow-hidden border border-gray-800 flex items-center justify-center"
                  style={{
                    backgroundImage: `linear-gradient(rgba(9, 13, 22, ${
                      backgroundDimLevel / 100
                    }), rgba(9, 13, 22, ${Math.min(
                      0.95,
                      backgroundDimLevel / 100 + 0.1
                    )})), url("${customWallpaperUrl}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <span className="px-2.5 py-1 rounded-md bg-gray-900/75 backdrop-blur-sm border border-white/10 text-[10px] font-semibold text-white shadow">
                    Live Background Preview ({backgroundDimLevel}% Dim)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isUploading || isLimitReached}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
            >
              {isLimitReached ? 'Limit Reached' : 'Create Canvas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
