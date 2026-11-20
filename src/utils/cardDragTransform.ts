export interface CardLayoutBasePos {
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
  rotation: number;
}

export interface ComputeCardDragLayoutParams {
  basePos: CardLayoutBasePos;
  isDragging: boolean;
  dragPos: { xRatio: number; yRatio: number } | null;
  containerSize: { width: number; height: number } | null;
  isResizing: boolean;
  resizeRatio: { wRatio: number; hRatio: number } | null;
  isRotating: boolean;
  rotateAngle: number | null;
  dragScale: number;
}

export interface ComputedCardDragLayout {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  transform: string;
  willChange: string;
  effectiveXRatio: number;
  effectiveYRatio: number;
  effectiveWRatio: number;
  effectiveHRatio: number;
  effectiveRotation: number;
}

/**
 * Computes card positioning styles for freeform canvas cards. During an active drag, keeps `left`
 * and `top` anchored at the card's initial coordinates and applies pointer displacement purely via
 * GPU-composited `translate3d(...)` to eliminate per-frame layout reflow.
 */
export function computeCardDragLayout({
  basePos,
  isDragging,
  dragPos,
  containerSize,
  isResizing,
  resizeRatio,
  isRotating,
  rotateAngle,
  dragScale,
}: ComputeCardDragLayoutParams): ComputedCardDragLayout {
  const effectiveXRatio = isDragging && dragPos ? dragPos.xRatio : basePos.xRatio;
  const effectiveYRatio = isDragging && dragPos ? dragPos.yRatio : basePos.yRatio;
  const effectiveWRatio = isResizing && resizeRatio ? resizeRatio.wRatio : basePos.wRatio;
  const effectiveHRatio = isResizing && resizeRatio ? resizeRatio.hRatio : basePos.hRatio;
  const effectiveRotation =
    isRotating && rotateAngle !== null ? rotateAngle : basePos.rotation;

  const canGpuTranslate =
    isDragging &&
    dragPos !== null &&
    containerSize !== null &&
    containerSize.width > 0 &&
    containerSize.height > 0;

  if (canGpuTranslate) {
    const dxPx = Math.round((dragPos.xRatio - basePos.xRatio) * containerSize.width * 100) / 100;
    const dyPx = Math.round((dragPos.yRatio - basePos.yRatio) * containerSize.height * 100) / 100;
    return {
      leftPct: basePos.xRatio * 100,
      topPct: basePos.yRatio * 100,
      widthPct: effectiveWRatio * 100,
      heightPct: effectiveHRatio * 100,
      transform: `translate3d(${dxPx}px, ${dyPx}px, 0) rotate(${effectiveRotation}deg) scale(${dragScale})`,
      willChange: 'transform',
      effectiveXRatio,
      effectiveYRatio,
      effectiveWRatio,
      effectiveHRatio,
      effectiveRotation,
    };
  }

  return {
    leftPct: effectiveXRatio * 100,
    topPct: effectiveYRatio * 100,
    widthPct: effectiveWRatio * 100,
    heightPct: effectiveHRatio * 100,
    transform: `translate3d(0px, 0px, 0) rotate(${effectiveRotation}deg) scale(${isDragging ? dragScale : 1})`,
    willChange: isRotating ? 'transform' : isResizing ? 'width, height' : isDragging ? 'left, top, transform' : 'auto',
    effectiveXRatio,
    effectiveYRatio,
    effectiveWRatio,
    effectiveHRatio,
    effectiveRotation,
  };
}
