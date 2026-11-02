import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { CANVAS_ICONS } from '../../data/canvasIcons';

interface CreateCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCanvas: (name: string, icon: string) => void;
}

export const CreateCanvasModal: React.FC<CreateCanvasModalProps> = ({
  isOpen,
  onClose,
  onCreateCanvas,
}) => {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Pin');

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreateCanvas(name.trim(), selectedIcon);
    setName('');
    setSelectedIcon('Pin');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col">
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
        <form onSubmit={handleCreate} className="p-5 space-y-4">
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
            <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1 bg-gray-950 rounded-xl border border-gray-800">
              {CANVAS_ICONS.map((item) => {
                const IconComponent = item.icon;
                const isSelected = selectedIcon === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedIcon(item.id)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow'
                        : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800/60'
                    }`}
                  >
                    <IconComponent className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

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
              disabled={!name.trim()}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
            >
              Create Canvas
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
