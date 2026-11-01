import React, { useRef, useState } from 'react';
import type { StickyNoteItem } from '../../types/dashboard';
import { CheckSquare, Square, Pin } from 'lucide-react';

interface CorkboardProps {
  notes: StickyNoteItem[];
  dockPaddingClass: string;
  onUpdateNotePos: (noteId: string, pos: NonNullable<StickyNoteItem['freeformPos']>) => void;
}

export const Corkboard: React.FC<CorkboardProps> = ({
  notes,
  dockPaddingClass,
  onUpdateNotePos,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent, note: StickyNoteItem) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = (note.freeformPos?.xRatio ?? 0.1) * rect.width;
    const currentY = (note.freeformPos?.yRatio ?? 0.1) * rect.height;

    setDraggingId(note.id);
    setDragOffset({
      x: e.clientX - currentX,
      y: e.clientY - currentY,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const note = notes.find((n) => n.id === draggingId);
    if (!note || !note.freeformPos) return;

    const newX = Math.max(0, Math.min(rect.width - 200, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(rect.height - 200, e.clientY - dragOffset.y));

    onUpdateNotePos(draggingId, {
      ...note.freeformPos,
      xRatio: newX / rect.width,
      yRatio: newY / rect.height,
    });
  };

  const handlePointerUp = () => {
    setDraggingId(null);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative w-full h-screen overflow-hidden select-none bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:24px_24px] ${dockPaddingClass}`}
    >
      {notes.map((note) => {
        const pos = note.freeformPos || {
          xRatio: 0.1,
          yRatio: 0.1,
          wRatio: 0.3,
          hRatio: 0.3,
          zIndex: 1,
          rotation: 0,
        };

        return (
          <div
            key={note.id}
            onPointerDown={(e) => handlePointerDown(e, note)}
            style={{
              position: 'absolute',
              left: `${pos.xRatio * 100}%`,
              top: `${pos.yRatio * 100}%`,
              width: `${Math.max(220, pos.wRatio * 1000)}px`,
              transform: `rotate(${pos.rotation}deg)`,
              backgroundColor: note.bgColor || '#fef08a',
              zIndex: draggingId === note.id ? 50 : pos.zIndex,
            }}
            className="rounded-xl p-5 shadow-2xl text-gray-900 cursor-grab active:cursor-grabbing border border-black/10 transition-shadow hover:shadow-yellow-500/10"
          >
            {/* Visual Pin */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full bg-red-600 shadow-md border-2 border-red-700/60" />
            </div>

            {/* Note Title */}
            {note.title && (
              <h3 className="font-bold text-base mb-2 flex items-center justify-between border-b border-black/10 pb-1">
                <span>{note.title}</span>
                <Pin className="w-3.5 h-3.5 text-gray-700/60" />
              </h3>
            )}

            {/* Note Body */}
            {note.isChecklist && note.checklistItems ? (
              <div className="space-y-1.5 mt-2">
                {note.checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <CheckSquare className="w-4 h-4 text-emerald-700" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-600" />
                    )}
                    <span className={item.done ? 'line-through opacity-50' : ''}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};
