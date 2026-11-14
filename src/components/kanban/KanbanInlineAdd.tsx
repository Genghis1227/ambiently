import React, { useRef, useState } from 'react';
import { Plus } from 'lucide-react';

export interface KanbanInlineAddProps {
  placeholder?: string;
  isLight?: boolean;
  isNightMode?: boolean;
  onAdd: (title: string) => Promise<unknown> | void;
}

export const KanbanInlineAdd: React.FC<KanbanInlineAddProps> = ({
  placeholder = '+ Add card',
  isLight = false,
  isNightMode = false,
  onAdd,
}) => {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue('');
    await onAdd(trimmed);
  };

  return (
    <div
      data-no-drag="true"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-colors ${
        isFocused
          ? isLight
            ? 'bg-white border-slate-400'
            : 'bg-slate-900/90 border-slate-500/70'
          : isLight
          ? 'bg-slate-100/80 border-slate-200/80 hover:border-slate-300'
          : isNightMode
          ? 'bg-slate-900/40 border-slate-800/60'
          : 'bg-slate-950/50 border-slate-800/70 hover:border-slate-700/80'
      }`}
    >
      <Plus
        className={`w-3.5 h-3.5 shrink-0 ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}
      />
      <input
        ref={inputRef}
        type="text"
        data-no-drag="true"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            void handleSubmit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setValue('');
            inputRef.current?.blur();
          }
        }}
        placeholder={placeholder}
        className={`w-full bg-transparent text-xs focus:outline-none select-text ${
          isLight
            ? 'text-slate-800 placeholder-slate-400'
            : 'text-slate-100 placeholder-slate-500'
        }`}
      />
      {value.trim().length > 0 && (
        <button
          type="button"
          data-no-drag="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void handleSubmit();
          }}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold shrink-0 transition-colors cursor-pointer ${
            isLight
              ? 'bg-[#6b8f71] text-white hover:bg-[#5c7d62]'
              : 'bg-[#6b8f71]/80 text-white hover:bg-[#6b8f71]'
          }`}
        >
          Add
        </button>
      )}
    </div>
  );
};
