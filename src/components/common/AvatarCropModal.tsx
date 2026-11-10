import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, Move, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { renderCroppedAvatarToWebP, type AvatarCropTransform } from '../../utils/avatarCompressor';

export interface AvatarCropModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  profileName: string;
  profileColor?: string;
  onCancel: () => void;
  onSave: (croppedWebpDataUrl: string) => Promise<void> | void;
}

const PREVIEW_SIZE = 256;

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  isOpen,
  imageUrl,
  profileName,
  profileColor = '#38bdf8',
  onCancel,
  onSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);
  const backdropMouseDownRef = useRef(false);

  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImageReady, setIsImageReady] = useState(false);

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  // Load image element when imageUrl changes
  useEffect(() => {
    if (!isOpen || !imageUrl) {
      loadedImgRef.current = null;
      setIsImageReady(false);
      return;
    }

    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setRotationDeg(0);
    setIsImageReady(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImgRef.current = img;
      setIsImageReady(true);
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl]);

  // Clamp pan offsets so the image always covers the circular frame
  const clampOffsets = useCallback(
    (nextX: number, nextY: number, nextZoom: number, nextRot: number) => {
      const img = loadedImgRef.current;
      if (!img) return { x: nextX, y: nextY };

      const srcW = img.naturalWidth || img.width || 1;
      const srcH = img.naturalHeight || img.height || 1;
      const normRot = ((nextRot % 360) + 360) % 360;
      const isRot90 = normRot === 90 || normRot === 270;
      const effW = isRot90 ? srcH : srcW;
      const effH = isRot90 ? srcW : srcH;

      const baseScale = Math.max(PREVIEW_SIZE / effW, PREVIEW_SIZE / effH);
      const finalScale = baseScale * nextZoom;

      const drawnW = effW * finalScale;
      const drawnH = effH * finalScale;

      const maxPanX = Math.max(0, (drawnW - PREVIEW_SIZE) / 2) / PREVIEW_SIZE;
      const maxPanY = Math.max(0, (drawnH - PREVIEW_SIZE) / 2) / PREVIEW_SIZE;

      return {
        x: Math.max(-maxPanX, Math.min(maxPanX, nextX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, nextY)),
      };
    },
    []
  );

  // Draw live preview onto the 256x256 canvas
  useEffect(() => {
    if (!isOpen || !isImageReady || !canvasRef.current || !loadedImgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = loadedImgRef.current;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const normRot = ((rotationDeg % 360) + 360) % 360;
    const isRot90 = normRot === 90 || normRot === 270;
    const effW = isRot90 ? srcH : srcW;
    const effH = isRot90 ? srcW : srcH;

    const baseScale = Math.max(PREVIEW_SIZE / effW, PREVIEW_SIZE / effH);
    const finalScale = baseScale * zoom;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

    ctx.save();
    ctx.translate(PREVIEW_SIZE / 2 + offsetX * PREVIEW_SIZE, PREVIEW_SIZE / 2 + offsetY * PREVIEW_SIZE);
    if (normRot !== 0) {
      ctx.rotate((normRot * Math.PI) / 180);
    }
    ctx.scale(finalScale, finalScale);
    ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
    ctx.restore();
  }, [isOpen, isImageReady, zoom, offsetX, offsetY, rotationDeg]);

  if (!isOpen || !imageUrl) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startOffsetX: offsetX,
      startOffsetY: offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const displaySize = rect.width || PREVIEW_SIZE;
    const dx = (e.clientX - dragStartRef.current.pointerX) / displaySize;
    const dy = (e.clientY - dragStartRef.current.pointerY) / displaySize;

    const clamped = clampOffsets(
      dragStartRef.current.startOffsetX + dx,
      dragStartRef.current.startOffsetY + dy,
      zoom,
      rotationDeg
    );
    setOffsetX(clamped.x);
    setOffsetY(clamped.y);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    const nextZoom = Math.max(1, Math.min(3.5, Number((zoom + delta).toFixed(2))));
    const clamped = clampOffsets(offsetX, offsetY, nextZoom, rotationDeg);
    setZoom(nextZoom);
    setOffsetX(clamped.x);
    setOffsetY(clamped.y);
  };

  const handleZoomChange = (nextZoom: number) => {
    const clampedZoom = Math.max(1, Math.min(3.5, nextZoom));
    const clamped = clampOffsets(offsetX, offsetY, clampedZoom, rotationDeg);
    setZoom(clampedZoom);
    setOffsetX(clamped.x);
    setOffsetY(clamped.y);
  };

  const handleRotate = (deltaDeg: number) => {
    const nextRot = (rotationDeg + deltaDeg + 360) % 360;
    const clamped = clampOffsets(offsetX, offsetY, zoom, nextRot);
    setRotationDeg(nextRot);
    setOffsetX(clamped.x);
    setOffsetY(clamped.y);
  };

  const handleReset = () => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setRotationDeg(0);
  };

  const handleConfirmSave = async () => {
    if (!imageUrl) return;
    setIsSaving(true);
    try {
      const transform: AvatarCropTransform = {
        zoom,
        offsetX,
        offsetY,
        rotationDeg,
      };
      const dataUrl = await renderCroppedAvatarToWebP(imageUrl, transform, 256, 0.85);
      await onSave(dataUrl);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9950] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropMouseDownRef.current && e.target === e.currentTarget) {
          onCancel();
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800 bg-gray-950/70">
          <div>
            <h3 className="text-sm font-bold text-white">Position Avatar Photo</h3>
            <p className="text-[11px] text-gray-400">
              Drag to center {profileName}&apos;s photo and adjust zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Circular Interactive Viewport */}
        <div className="p-5 flex flex-col items-center space-y-4">
          <div className="relative flex items-center justify-center">
            <div
              className="relative w-56 h-56 rounded-full overflow-hidden shadow-2xl bg-gray-950 select-none"
              style={{
                border: `4px solid ${profileColor}`,
                boxShadow: `0 0 28px -6px ${profileColor}55`,
              }}
            >
              <canvas
                ref={canvasRef}
                width={PREVIEW_SIZE}
                height={PREVIEW_SIZE}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                className={`w-full h-full touch-none ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              />

              {/* Subtle rule-of-thirds alignment grid while dragging */}
              {isDragging && (
                <div className="inset-0 absolute pointer-events-none grid grid-cols-3 grid-rows-3">
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-white/20" />
                  <div className="border-r border-white/20" />
                  <div />
                </div>
              )}
            </div>

            <div className="absolute -bottom-2.5 px-2.5 py-0.5 rounded-full bg-gray-950/90 border border-gray-700 text-[10px] text-gray-300 flex items-center gap-1 pointer-events-none shadow-md">
              <Move className="w-3 h-3 text-sky-400" />
              <span>Drag photo to reposition</span>
            </div>
          </div>

          {/* Zoom Slider */}
          <div className="w-full space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span className="font-semibold">Zoom</span>
              <span className="font-mono text-sky-400">{zoom.toFixed(2)}×</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleZoomChange(zoom - 0.15)}
                className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white cursor-pointer"
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min={1}
                max={3.5}
                step={0.02}
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="flex-1 accent-sky-500 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => handleZoomChange(zoom + 0.15)}
                className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white cursor-pointer"
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Rotate & Reset Controls */}
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleRotate(-90)}
                className="px-2.5 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 border border-gray-700/80 text-xs text-gray-200 flex items-center gap-1 cursor-pointer"
                title="Rotate 90° counter-clockwise"
              >
                <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                <span>Rotate Left</span>
              </button>
              <button
                type="button"
                onClick={() => handleRotate(90)}
                className="px-2.5 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 border border-gray-700/80 text-xs text-gray-200 flex items-center gap-1 cursor-pointer"
                title="Rotate 90° clockwise"
              >
                <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                <span>Rotate Right</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1.5 rounded-lg bg-gray-950 hover:bg-gray-800 border border-gray-800 text-xs text-gray-400 hover:text-white cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-800 bg-gray-950/60">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || !isImageReady}
            onClick={handleConfirmSave}
            className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-sky-600/25"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Photo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
