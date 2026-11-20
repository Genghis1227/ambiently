import React from 'react';
import { Pencil, Trash2, Volume2 } from 'lucide-react';
import type {
  ChalkBrushSize,
  ChalkboardSurface,
  SoundscapeChannelLevels,
  SoundscapeSleepTimerMin,
} from '../../types/phase4Widgets';
import { CHALKBOARD_SURFACE_OPTIONS } from '../../utils/chalkboardEngine';
import {
  SOUNDSCAPE_PRESETS,
  SOUNDSCAPE_SLEEP_OPTIONS,
  detectMatchingSoundscapePreset,
} from '../../utils/soundscapeEngine';

interface ChalkboardSettingsPanelProps {
  surface: ChalkboardSurface;
  setSurface: (next: ChalkboardSurface) => void;
  defaultTool: 'chalk' | 'marker';
  setDefaultTool: (next: 'chalk' | 'marker') => void;
  defaultSize: ChalkBrushSize;
  setDefaultSize: (next: ChalkBrushSize) => void;
  showToolbar: boolean;
  setShowToolbar: (val: boolean) => void;
  confirmBeforeClear: boolean;
  setConfirmBeforeClear: (val: boolean) => void;
  allowDrawingWhenLocked: boolean;
  setAllowDrawingWhenLocked: (val: boolean) => void;
  strokeCount: number;
  clearRequested: boolean;
  onRequestClearBoard: () => void;
}

export const ChalkboardSettingsPanel: React.FC<ChalkboardSettingsPanelProps> = ({
  surface,
  setSurface,
  defaultTool,
  setDefaultTool,
  defaultSize,
  setDefaultSize,
  showToolbar,
  setShowToolbar,
  confirmBeforeClear,
  setConfirmBeforeClear,
  allowDrawingWhenLocked,
  setAllowDrawingWhenLocked,
  strokeCount,
  clearRequested,
  onRequestClearBoard,
}) => {
  return (
    <div className="space-y-4 pt-2 border-t border-gray-800/80">
      <div className="flex items-center gap-2 text-emerald-400">
        <Pencil className="w-4 h-4" />
        <h3 className="text-xs font-bold uppercase tracking-wider">
          Family Chalkboard & Doodle Pad
        </h3>
      </div>

      {/* Surface Texture */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
          Board Surface (when outlined)
        </label>
        <div className="grid grid-cols-3 gap-2">
          {CHALKBOARD_SURFACE_OPTIONS.map((opt) => {
            const active = surface === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSurface(opt.id)}
                className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <div className="text-xs font-semibold">{opt.label}</div>
                <div className="text-[10px] opacity-75 mt-0.5 leading-tight">{opt.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Default Tool & Size */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
            Default Tool
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(['chalk', 'marker'] as const).map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => setDefaultTool(tool)}
                className={`py-2 rounded-xl border text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  defaultTool === tool
                    ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {tool}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
            Default Brush Size
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['fine', 'medium', 'bold'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setDefaultSize(sz)}
                className={`py-2 rounded-xl border text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  defaultSize === sz
                    ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-2.5">
        <label className="flex items-center justify-between gap-3 text-xs text-gray-300 cursor-pointer">
          <span>Show chalk tray toolbar by default</span>
          <input
            type="checkbox"
            checked={showToolbar}
            onChange={(e) => setShowToolbar(e.target.checked)}
            className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-gray-300 cursor-pointer">
          <span>Require two-tap confirmation before clearing canvas</span>
          <input
            type="checkbox"
            checked={confirmBeforeClear}
            onChange={(e) => setConfirmBeforeClear(e.target.checked)}
            className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-gray-300 cursor-pointer">
          <span>Allow kids/family sketching when Canvas Editing is PIN-locked</span>
          <input
            type="checkbox"
            checked={allowDrawingWhenLocked}
            onChange={(e) => setAllowDrawingWhenLocked(e.target.checked)}
            className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
          />
        </label>
      </div>

      {/* Clear Action */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-800/70">
        <span className="text-[11px] text-gray-400">
          {clearRequested
            ? 'Board will be cleared on Save'
            : `${strokeCount} saved stroke${strokeCount === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          disabled={strokeCount === 0 || clearRequested}
          onClick={onRequestClearBoard}
          className="px-3 py-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{clearRequested ? 'Cleared on Save' : 'Clear All Strokes'}</span>
        </button>
      </div>
    </div>
  );
};

interface SoundscapeSettingsPanelProps {
  channels: SoundscapeChannelLevels;
  setChannels: (next: SoundscapeChannelLevels) => void;
  masterVolume: number;
  setMasterVolume: (val: number) => void;
  defaultSleepTimerMin: SoundscapeSleepTimerMin;
  setDefaultSleepTimerMin: (val: SoundscapeSleepTimerMin) => void;
  fadeOutOnNightMode: boolean;
  setFadeOutOnNightMode: (val: boolean) => void;
}

export const SoundscapeSettingsPanel: React.FC<SoundscapeSettingsPanelProps> = ({
  channels,
  setChannels,
  masterVolume,
  setMasterVolume,
  defaultSleepTimerMin,
  setDefaultSleepTimerMin,
  fadeOutOnNightMode,
  setFadeOutOnNightMode,
}) => {
  const activePreset = detectMatchingSoundscapePreset(channels);

  return (
    <div className="space-y-4 pt-2 border-t border-gray-800/80">
      <div className="flex items-center gap-2 text-cyan-400">
        <Volume2 className="w-4 h-4" />
        <h3 className="text-xs font-bold uppercase tracking-wider">
          Offline Ambient Soundscape Mixer
        </h3>
      </div>

      {/* Preset Selection */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
          Starting Mix Preset
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {Object.values(SOUNDSCAPE_PRESETS).map((preset) => {
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setChannels({ ...preset.channels })}
                className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-600/20 border-cyan-500/45 text-cyan-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Master Volume */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300 mb-1.5">
          <span>Default Master Volume</span>
          <span className="font-mono text-cyan-300">{masterVolume}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={masterVolume}
          onChange={(e) => setMasterVolume(Number(e.target.value))}
          className="w-full accent-cyan-500 cursor-pointer"
        />
      </div>

      {/* Default Sleep Timer */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
          Default Sleep Timer
        </label>
        <div className="grid grid-cols-5 gap-1.5">
          {SOUNDSCAPE_SLEEP_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => setDefaultSleepTimerMin(min)}
              className={`py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                defaultSleepTimerMin === min
                  ? 'bg-indigo-600/20 border-indigo-500/45 text-indigo-200'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {min === 0 ? 'Off' : `${min}m`}
            </button>
          ))}
        </div>
      </div>

      {/* Scheduled Night Mode Fade-Out */}
      <label className="flex items-center justify-between gap-3 text-xs text-gray-300 cursor-pointer pt-1">
        <div>
          <span className="block font-semibold">Auto fade-out on Scheduled Night Mode</span>
          <span className="text-[10px] text-gray-500">
            Smoothly ramps volume down and suspends audio when Night Mode activates
          </span>
        </div>
        <input
          type="checkbox"
          checked={fadeOutOnNightMode}
          onChange={(e) => setFadeOutOnNightMode(e.target.checked)}
          className="w-4 h-4 accent-cyan-500 rounded cursor-pointer shrink-0"
        />
      </label>
    </div>
  );
};
