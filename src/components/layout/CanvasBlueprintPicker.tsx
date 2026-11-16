import React from 'react';
import { Sparkles } from 'lucide-react';
import { CANVAS_BLUEPRINTS } from '../../utils/canvasBlueprints';
import { useDashboardStore } from '../../store/dashboardStore';

interface CanvasBlueprintPickerProps {
  activeTabId: string;
  variant?: 'desktop' | 'mobile';
}

export const CanvasBlueprintPicker: React.FC<CanvasBlueprintPickerProps> = ({
  activeTabId,
  variant = 'desktop',
}) => {
  const starterBlueprints = CANVAS_BLUEPRINTS.filter((bp) => bp.id !== 'blank');

  if (variant === 'mobile') {
    return (
      <div className="pt-2 border-t border-gray-800/60 text-left space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>Or Launch a Starter Blueprint</span>
        </span>
        <div className="space-y-1.5">
          {starterBlueprints.map((bp) => (
            <button
              key={bp.id}
              type="button"
              onClick={() => void useDashboardStore.getState().applyCanvasBlueprint(activeTabId, bp.id)}
              className="w-full p-2.5 rounded-xl bg-gray-900/80 hover:bg-emerald-600/15 border border-gray-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">{bp.title}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-gray-800 text-[10px] font-semibold text-gray-400 shrink-0">
                  {bp.badge}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{bp.summary}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-3 border-t border-gray-800/80 text-left space-y-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          Quick-Start Blueprints
        </span>
        <span className="text-gray-500 font-normal normal-case">1-tap layout</span>
      </div>
      <div className="space-y-1.5">
        {starterBlueprints.map((bp) => (
          <button
            key={bp.id}
            type="button"
            onClick={() => void useDashboardStore.getState().applyCanvasBlueprint(activeTabId, bp.id)}
            className="w-full p-2.5 rounded-xl bg-gray-950/75 hover:bg-emerald-600/15 border border-gray-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-100 group-hover:text-emerald-300 transition-colors">
                {bp.title}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-gray-800 text-[10px] font-semibold text-gray-400 group-hover:text-emerald-200 shrink-0">
                {bp.badge}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{bp.summary}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
