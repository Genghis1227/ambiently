import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CURATED_AMBIENT_PHOTOS,
  cachePhotosLocally,
  getOptimizedPhotoUrl,
  type PhotoItem,
  type PhotoDisplayStyle,
} from '../../services/photos';
import { useDashboardStore } from '../../store/dashboardStore';


export type PolaroidDensity = 6 | 12 | 18 | 24 | 32;
export type PolaroidSizeMode = 'mixed' | 'uniform' | 'small' | 'large';

export interface PolaroidSlotDef {
  id: number;
  top: string;
  left: string;
  rotate: number;
  width: string;
  maxW: string;
  sizeType: 'hero' | 'medium' | 'small';
}

export function generatePolaroidSlots(
  count: number = 12,
  sizeMode: PolaroidSizeMode = 'mixed'
): PolaroidSlotDef[] {
  const safeCount = Math.max(4, Math.min(36, count));

  let cols = 3;
  let rows = 2;
  if (safeCount > 24) {
    cols = 6;
    rows = Math.ceil(safeCount / cols);
  } else if (safeCount > 16) {
    cols = 5;
    rows = Math.ceil(safeCount / cols);
  } else if (safeCount > 8) {
    cols = 4;
    rows = Math.ceil(safeCount / cols);
  } else if (safeCount > 5) {
    cols = 3;
    rows = 2;
  } else {
    cols = 2;
    rows = 2;
  }

  const slots: PolaroidSlotDef[] = [];
  const cellW = 86 / cols;
  const cellH = 80 / rows;

  for (let i = 0; i < safeCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const baseX = 3 + col * cellW;
    const baseY = 7 + row * cellH;

    // Deterministic pseudo-random jitter so positions stay stable
    const jX = (((Math.sin((i + 1) * 12.9898) * 43758.5453) % 1)) * (cellW * 0.42);
    const jY = (((Math.cos((i + 1) * 78.233) * 43758.5453) % 1)) * (cellH * 0.38);

    const left = Math.max(1, Math.min(84, baseX + jX));
    const top = Math.max(5, Math.min(82, baseY + jY));

    // Smooth organic tilt between -12 and +12 degrees
    const rotate = Math.round(Math.sin((i + 1) * 1.73) * 12);

    let widthPct = 22;
    let maxW = 230;
    let sizeType: 'hero' | 'medium' | 'small' = 'medium';

    if (sizeMode === 'mixed') {
      const seed = Math.abs(((Math.sin((i + 1) * 91.733) * 43758.5453) % 1));
      if (seed > 0.7) {
        // Hero Large Print
        sizeType = 'hero';
        widthPct = safeCount > 18 ? 24 : 29;
        maxW = safeCount > 18 ? 260 : 310;
      } else if (seed < 0.32) {
        // Compact Snapshot
        sizeType = 'small';
        widthPct = safeCount > 18 ? 12 : 16;
        maxW = safeCount > 18 ? 135 : 165;
      } else {
        // Classic Medium
        sizeType = 'medium';
        widthPct = safeCount > 18 ? 17 : 22;
        maxW = safeCount > 18 ? 190 : 230;
      }
    } else if (sizeMode === 'small') {
      sizeType = 'small';
      widthPct = safeCount > 18 ? 12 : 15;
      maxW = 150;
    } else if (sizeMode === 'large') {
      sizeType = 'hero';
      widthPct = safeCount > 18 ? 25 : 30;
      maxW = 320;
    } else {
      // Uniform Medium
      sizeType = 'medium';
      widthPct = safeCount > 18 ? 17 : 21;
      maxW = 220;
    }

    slots.push({
      id: i,
      left: `${left.toFixed(1)}%`,
      top: `${top.toFixed(1)}%`,
      rotate,
      width: `${widthPct.toFixed(1)}%`,
      maxW: `${maxW}px`,
      sizeType,
    });
  }

  return slots;
}

interface ActivePolaroidItem {
  slotIndex: number;
  photo: PhotoItem;
  rotation: number;
  zIndex: number;
  key: string;
}

// In-memory runtime cache to preserve continuous rotation across canvas switches & remounts
interface PhotoWidgetRuntimeState {
  signature: string;
  currentIndex: number;
  filmstripIndex: number;
  mosaicPhotos?: PhotoItem[];
  mosaicSlot: number;
  mosaicIndex: number;
  scatteredPolaroids?: ActivePolaroidItem[];
}

const photoRuntimeCache = new Map<string, PhotoWidgetRuntimeState>();

function getPhotosSignature(items: PhotoItem[]): string {
  if (!items || items.length === 0) return 'empty';
  return `${items.length}-${items[0]?.id || ''}-${items[items.length - 1]?.id || ''}`;
}

function loadRuntimeState(key: string, signature: string): PhotoWidgetRuntimeState | null {
  const memory = photoRuntimeCache.get(key);
  if (memory && memory.signature === signature) {
    return memory;
  }
  try {
    const raw = sessionStorage.getItem(`ambiently-photo-progress-${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.signature === signature) {
        photoRuntimeCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveRuntimeState(key: string, state: PhotoWidgetRuntimeState) {
  photoRuntimeCache.set(key, state);
  try {
    sessionStorage.setItem(
      `ambiently-photo-progress-${key}`,
      JSON.stringify({
        signature: state.signature,
        currentIndex: state.currentIndex,
        filmstripIndex: state.filmstripIndex,
        mosaicIndex: state.mosaicIndex,
        mosaicSlot: state.mosaicSlot,
      })
    );
  } catch {
    // ignore
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface PhotoFrameWidgetProps {
  widgetId?: string;
  initialStyle?: PhotoDisplayStyle;
  rotationIntervalSec?: number;
  useCommonSource?: boolean;
  customPhotos?: PhotoItem[];
  initialSourceLabel?: string;
  initialPolaroidCount?: number;
  initialPolaroidSizeMode?: PolaroidSizeMode;
  photoOrder?: 'random' | 'sequential';
  showCaptions?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

export const PhotoFrameWidget: React.FC<PhotoFrameWidgetProps> = ({
  widgetId,
  initialStyle = 'ken_burns',
  rotationIntervalSec = 15,
  useCommonSource,
  customPhotos,
  initialSourceLabel = 'Curated',
  initialPolaroidCount = 12,
  initialPolaroidSizeMode = 'mixed',
  photoOrder = 'random',
  showCaptions = true,
  onUpdateConfig: _onUpdateConfig,
}) => {
  const commonPhotos = useDashboardStore((s) => s.settings.commonPhotos);
  const commonPhotoSourceLabel = useDashboardStore((s) => s.settings.commonPhotoSourceLabel);

  const isUsingCommonSource =
    useCommonSource !== false && Boolean(commonPhotos && commonPhotos.length > 0);
  const resolvedPhotos = isUsingCommonSource
    ? commonPhotos!
    : customPhotos && customPhotos.length > 0
    ? customPhotos
    : CURATED_AMBIENT_PHOTOS;
  const resolvedLabel = isUsingCommonSource
    ? commonPhotoSourceLabel || initialSourceLabel || 'Shared Library'
    : initialSourceLabel || (customPhotos?.length ? 'Custom Photos' : 'Curated');

  const stateKey = widgetId || `photo-state-${resolvedLabel || 'ambient'}`;
  const initialPhotos = resolvedPhotos;
  const initialSig = getPhotosSignature(initialPhotos);
  const savedState = loadRuntimeState(stateKey, initialSig);

  const [style, setStyle] = useState<PhotoDisplayStyle>(initialStyle);
  const [intervalSec, setIntervalSec] = useState<number>(rotationIntervalSec);
  const [photos, setPhotos] = useState<PhotoItem[]>(() => {
    return photoOrder === 'random' ? shuffleArray(initialPhotos) : initialPhotos;
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (savedState?.currentIndex != null && savedState.currentIndex < initialPhotos.length) {
      return savedState.currentIndex;
    }
    return photoOrder === 'random' && initialPhotos.length > 0
      ? Math.floor(Math.random() * initialPhotos.length)
      : 0;
  });
  const [sourceLabel, setSourceLabel] = useState<string>(resolvedLabel);

  const [polaroidCount, setPolaroidCount] = useState<number>(initialPolaroidCount);
  const [polaroidSizeMode, setPolaroidSizeMode] = useState<PolaroidSizeMode>(initialPolaroidSizeMode);

  const [scatteredPolaroids, setScatteredPolaroids] = useState<ActivePolaroidItem[]>(
    () => savedState?.scatteredPolaroids || []
  );
  const [isHovered, setIsHovered] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const topZIndexRef = useRef(30);

  // Sync props to state if parent config updates
  useEffect(() => {
    if (initialPolaroidCount) setPolaroidCount(initialPolaroidCount);
  }, [initialPolaroidCount]);

  useEffect(() => {
    if (initialPolaroidSizeMode) setPolaroidSizeMode(initialPolaroidSizeMode);
  }, [initialPolaroidSizeMode]);

  // Compute dynamic polaroid layout slots based on count and size mode
  const polaroidSlots = React.useMemo(() => {
    return generatePolaroidSlots(polaroidCount, polaroidSizeMode);
  }, [polaroidCount, polaroidSizeMode]);

  // Initialize scattered polaroids when photos or slots change
  useEffect(() => {
    if (!photos || photos.length === 0 || polaroidSlots.length === 0) return;
    setScatteredPolaroids((prev) => {
      if (prev && prev.length === polaroidSlots.length) {
        return prev;
      }
      const initial: ActivePolaroidItem[] = polaroidSlots.map((slot, idx) => ({
        slotIndex: idx,
        photo: photos[idx % photos.length],
        rotation: slot.rotate,
        zIndex: 10 + idx,
        key: `slot-${idx}-${photos[idx % photos.length].id}-${Date.now()}`,
      }));
      topZIndexRef.current = 15 + polaroidSlots.length;
      return initial;
    });
  }, [photos, polaroidSlots]);

  // Randomly update one polaroid at a time from source photos
  useEffect(() => {
    if (style !== 'polaroid' || photos.length === 0) return;

    // Staggered shuffle interval (faster on dense boards to keep them dynamic)
    const baseShuffle = polaroidCount >= 18 ? 2500 : 3800;
    const shuffleMs = Math.max(2000, Math.min(8000, baseShuffle));

    const timer = setInterval(() => {
      setScatteredPolaroids((prev) => {
        if (prev.length === 0) return prev;

        const randomSlotIdx = Math.floor(Math.random() * prev.length);
        const currentSlotItem = prev[randomSlotIdx];
        const slotDef = polaroidSlots[randomSlotIdx] || polaroidSlots[0];

        // Photos visible in other slots
        const otherVisiblePhotoIds = new Set(
          prev
            .filter((_, idx) => idx !== randomSlotIdx)
            .map((item) => item.photo.id)
        );

        // Pick photo not already shown elsewhere
        const candidates = photos.filter((p) => !otherVisiblePhotoIds.has(p.id));
        const pool = candidates.length > 0
          ? candidates
          : photos.filter((p) => p.id !== currentSlotItem.photo.id);
        const finalPool = pool.length > 0 ? pool : photos;

        const nextPhoto = finalPool[Math.floor(Math.random() * finalPool.length)];

        topZIndexRef.current += 1;
        const newZ = topZIndexRef.current;
        const newRotate = (slotDef?.rotate || 0) + Math.round((Math.random() * 6 - 3));

        return prev.map((item, idx) => {
          if (idx !== randomSlotIdx) return item;
          return {
            ...item,
            photo: nextPhoto,
            rotation: newRotate,
            zIndex: newZ,
            key: `slot-${idx}-${nextPhoto.id}-${Date.now()}`,
          };
        });
      });
    }, shuffleMs);

    return () => clearInterval(timer);
  }, [style, photos, intervalSec, polaroidCount, polaroidSlots]);

  const handleShufflePolaroid = (slotIdx: number) => {
    setScatteredPolaroids((prev) => {
      const currentSlotItem = prev[slotIdx];
      if (!currentSlotItem) return prev;
      const slotDef = polaroidSlots[slotIdx] || polaroidSlots[0];

      const otherVisiblePhotoIds = new Set(
        prev.filter((_, idx) => idx !== slotIdx).map((item) => item.photo.id)
      );
      const candidates = photos.filter((p) => !otherVisiblePhotoIds.has(p.id));
      const pool = candidates.length > 0
        ? candidates
        : photos.filter((p) => p.id !== currentSlotItem.photo.id);
      const finalPool = pool.length > 0 ? pool : photos;
      const nextPhoto = finalPool[Math.floor(Math.random() * finalPool.length)];

      topZIndexRef.current += 1;

      return prev.map((item, idx) => {
        if (idx !== slotIdx) return item;
        return {
          ...item,
          photo: nextPhoto,
          rotation: (slotDef?.rotate || 0) + Math.round((Math.random() * 6 - 3)),
          zIndex: topZIndexRef.current,
          key: `slot-${idx}-${nextPhoto.id}-${Date.now()}`,
        };
      });
    });
  };

  // Self-healing photo failure tracking: auto-replaces failed/throttled photos with fresh candidates
  const failedPhotoIdsRef = useRef<Set<string>>(new Set());

  const handlePolaroidError = useCallback((slotIdx: number, photoId: string) => {
    failedPhotoIdsRef.current.add(photoId);
    setScatteredPolaroids((prev) => {
      const currentSlotItem = prev[slotIdx];
      if (!currentSlotItem) return prev;
      const slotDef = polaroidSlots[slotIdx] || polaroidSlots[0];

      const otherVisiblePhotoIds = new Set(
        prev.filter((_, idx) => idx !== slotIdx).map((item) => item.photo.id)
      );
      const candidates = photos.filter(
        (p) => !otherVisiblePhotoIds.has(p.id) && !failedPhotoIdsRef.current.has(p.id)
      );
      const pool = candidates.length > 0
        ? candidates
        : photos.filter((p) => p.id !== photoId && !failedPhotoIdsRef.current.has(p.id));
      const finalPool = pool.length > 0 ? pool : photos;
      const nextPhoto = finalPool[Math.floor(Math.random() * finalPool.length)];

      topZIndexRef.current += 1;

      return prev.map((item, idx) => {
        if (idx !== slotIdx) return item;
        return {
          ...item,
          photo: nextPhoto,
          rotation: (slotDef?.rotate || 0) + Math.round((Math.random() * 6 - 3)),
          zIndex: topZIndexRef.current,
          key: `slot-${idx}-${nextPhoto.id}-${Date.now()}`,
        };
      });
    });
  }, [photos, polaroidSlots]);

  // Mosaic active quadrant photos & auto-rotation
  const [mosaicPhotos, setMosaicPhotos] = useState<PhotoItem[]>(() => {
    if (savedState?.mosaicPhotos && savedState.mosaicPhotos.length >= 4) {
      return savedState.mosaicPhotos;
    }
    return initialPhotos.slice(0, 4);
  });
  const mosaicSlotRef = useRef(savedState?.mosaicSlot ?? 0);
  const mosaicIndexRef = useRef(savedState?.mosaicIndex ?? 4);

  useEffect(() => {
    if (!photos || photos.length === 0) return;
    setMosaicPhotos((prev) => {
      if (prev && prev.length >= 4) return prev;
      mosaicSlotRef.current = 0;
      mosaicIndexRef.current = 4 % photos.length;
      return photos.slice(0, 4);
    });
  }, [photos]);

  useEffect(() => {
    if (style !== 'mosaic' || photos.length <= 1) return;

    // Staggered quadrant rotation: swap one photo every rotation interval
    const timer = setInterval(() => {
      setMosaicPhotos((prev) => {
        if (photos.length <= 1) return prev;
        const currentSlots = prev.length >= 4 ? prev : photos.slice(0, 4);

        let nextPhoto: PhotoItem;
        if (photoOrder === 'random') {
          const currentIds = new Set(currentSlots.map((p) => p.id));
          const candidates = photos.filter((p) => !currentIds.has(p.id));
          const pool = candidates.length > 0 ? candidates : photos;
          nextPhoto = pool[Math.floor(Math.random() * pool.length)];
        } else {
          const nextIdx = mosaicIndexRef.current % photos.length;
          nextPhoto = photos[nextIdx];
          mosaicIndexRef.current = (nextIdx + 1) % photos.length;
        }

        const slotToReplace = mosaicSlotRef.current % 4;
        mosaicSlotRef.current = (mosaicSlotRef.current + 1) % 4;

        const updated = [...currentSlots];
        updated[slotToReplace] = nextPhoto;
        return updated;
      });
    }, intervalSec * 1000);

    return () => clearInterval(timer);
  }, [style, photos, intervalSec, photoOrder, resetTrigger]);

  const handleShuffleMosaicSlot = useCallback((slotIdx: number) => {
    if (photos.length <= 1) return;
    setMosaicPhotos((prev) => {
      const currentSlots = prev.length >= 4 ? prev : photos.slice(0, 4);
      let nextPhoto: PhotoItem;
      if (photoOrder === 'random') {
        const currentIds = new Set(currentSlots.map((p) => p.id));
        const candidates = photos.filter((p) => !currentIds.has(p.id) && !failedPhotoIdsRef.current.has(p.id));
        const pool = candidates.length > 0 ? candidates : photos.filter((p) => !failedPhotoIdsRef.current.has(p.id));
        const finalPool = pool.length > 0 ? pool : photos;
        nextPhoto = finalPool[Math.floor(Math.random() * finalPool.length)];
      } else {
        const nextIdx = mosaicIndexRef.current % photos.length;
        nextPhoto = photos[nextIdx];
        mosaicIndexRef.current = (nextIdx + 1) % photos.length;
      }

      const updated = [...currentSlots];
      updated[slotIdx] = nextPhoto;
      return updated;
    });
  }, [photos, photoOrder]);

  const handleMosaicNext = useCallback(() => {
    if (photos.length <= 1) return;
    setMosaicPhotos((prev) => {
      const pool = photos;
      const count = pool.length;
      if (count <= 4) {
        return [...prev.slice(1), prev[0]];
      }
      const nextBatch: PhotoItem[] = [];
      for (let i = 0; i < 4; i++) {
        const nextIdx = mosaicIndexRef.current % count;
        nextBatch.push(pool[nextIdx]);
        mosaicIndexRef.current = (nextIdx + 1) % count;
      }
      return nextBatch;
    });
    mosaicSlotRef.current = 0;
    setResetTrigger((prev) => prev + 1);
  }, [photos]);

  const handleMosaicPrev = useCallback(() => {
    if (photos.length <= 1) return;
    setMosaicPhotos((prev) => {
      const pool = photos;
      const count = pool.length;
      if (count <= 4) {
        return [prev[prev.length - 1], ...prev.slice(0, prev.length - 1)];
      }
      const prevStart = ((mosaicIndexRef.current - 8) % count + count) % count;
      mosaicIndexRef.current = prevStart;
      const prevBatch: PhotoItem[] = [];
      for (let i = 0; i < 4; i++) {
        const nextIdx = mosaicIndexRef.current % count;
        prevBatch.push(pool[nextIdx]);
        mosaicIndexRef.current = (nextIdx + 1) % count;
      }
      return prevBatch;
    });
    mosaicSlotRef.current = 0;
    setResetTrigger((prev) => prev + 1);
  }, [photos]);

  const handleMosaicError = useCallback((slotIdx: number, photoId: string) => {
    failedPhotoIdsRef.current.add(photoId);
    handleShuffleMosaicSlot(slotIdx);
  }, [handleShuffleMosaicSlot]);

  const handleKenBurnsError = useCallback((photoId: string) => {
    failedPhotoIdsRef.current.add(photoId);
    if (photos.length <= 1) return;
    if (photoOrder === 'random') {
      setCurrentIndex((prev) => {
        let next = Math.floor(Math.random() * photos.length);
        if (photos.length > 1 && next === prev) {
          next = (next + 1) % photos.length;
        }
        return next;
      });
    } else {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }
  }, [photos, photoOrder]);

  const handleFilmstripError = useCallback((photoId: string) => {
    failedPhotoIdsRef.current.add(photoId);
    setFilmstripIndex((prev) => prev + 1);
  }, []);

  // Sync props to state when widget config updates
  useEffect(() => {
    if (initialStyle) setStyle(initialStyle);
  }, [initialStyle]);

  useEffect(() => {
    if (rotationIntervalSec) setIntervalSec(rotationIntervalSec);
  }, [rotationIntervalSec]);

  useEffect(() => {
    if (resolvedPhotos && resolvedPhotos.length > 0) {
      const pool = photoOrder === 'random' ? shuffleArray(resolvedPhotos) : resolvedPhotos;
      setPhotos(pool);
      const newSig = getPhotosSignature(resolvedPhotos);
      const existing = loadRuntimeState(stateKey, newSig);
      if (!existing) {
        // Brand new photo album loaded -> reset to start or random
        setCurrentIndex(photoOrder === 'random' ? Math.floor(Math.random() * resolvedPhotos.length) : 0);
        setFilmstripIndex(0);
        setMosaicPhotos(pool.slice(0, 4));
        mosaicSlotRef.current = 0;
        mosaicIndexRef.current = 4 % resolvedPhotos.length;
      }
    }
  }, [resolvedPhotos, stateKey, photoOrder]);

  useEffect(() => {
    setSourceLabel(resolvedLabel);
  }, [resolvedLabel]);

  // Cache photos on mount for 0ms offline fallback
  useEffect(() => {
    cachePhotosLocally(photos);
  }, [photos]);

  const handleKenBurnsNext = useCallback(() => {
    if (photos.length <= 1) return;
    if (photoOrder === 'random') {
      setCurrentIndex((prev) => {
        let next = Math.floor(Math.random() * photos.length);
        if (photos.length > 1 && next === prev) {
          next = (next + 1) % photos.length;
        }
        return next;
      });
    } else {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }
    setResetTrigger((prev) => prev + 1);
  }, [photos, photoOrder]);

  const handleKenBurnsPrev = useCallback(() => {
    if (photos.length <= 1) return;
    if (photoOrder === 'random') {
      setCurrentIndex((prev) => {
        let next = Math.floor(Math.random() * photos.length);
        if (photos.length > 1 && next === prev) {
          next = (next + 1) % photos.length;
        }
        return next;
      });
    } else {
      setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    }
    setResetTrigger((prev) => prev + 1);
  }, [photos, photoOrder]);

  const handleFilmstripNext = useCallback(() => {
    setFilmstripIndex((prev) => prev + 1);
    setResetTrigger((prev) => prev + 1);
  }, []);

  const handleFilmstripPrev = useCallback(() => {
    setFilmstripIndex((prev) => prev - 1);
    setResetTrigger((prev) => prev + 1);
  }, []);

  // Slideshow auto-rotation for Ken Burns
  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(() => {
      if (photoOrder === 'random') {
        setCurrentIndex((prev) => {
          let next = Math.floor(Math.random() * photos.length);
          if (photos.length > 1 && next === prev) {
            next = (next + 1) % photos.length;
          }
          return next;
        });
      } else {
        setCurrentIndex((prev) => (prev + 1) % photos.length);
      }
    }, intervalSec * 1000);
    return () => clearInterval(interval);
  }, [photos, intervalSec, photoOrder, resetTrigger]);

  // Filmstrip continuous reel index & auto-rotation
  const [filmstripIndex, setFilmstripIndex] = useState(() => savedState?.filmstripIndex ?? 0);

  useEffect(() => {
    if (style !== 'filmstrip' || photos.length <= 1) return;
    const interval = setInterval(() => {
      setFilmstripIndex((prev) => prev + 1);
    }, intervalSec * 1000);
    return () => clearInterval(interval);
  }, [style, photos, intervalSec, resetTrigger]);

  // Keyboard arrow buttons navigation while hovered
  useEffect(() => {
    if (!isHovered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (style === 'filmstrip') {
          handleFilmstripNext();
        } else if (style === 'mosaic') {
          handleMosaicNext();
        } else if (style === 'ken_burns') {
          handleKenBurnsNext();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (style === 'filmstrip') {
          handleFilmstripPrev();
        } else if (style === 'mosaic') {
          handleMosaicPrev();
        } else if (style === 'ken_burns') {
          handleKenBurnsPrev();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isHovered,
    style,
    handleFilmstripNext,
    handleFilmstripPrev,
    handleMosaicNext,
    handleMosaicPrev,
    handleKenBurnsNext,
    handleKenBurnsPrev,
  ]);

  // Save persistent rotation progress across canvas carousel switches & unmounts
  useEffect(() => {
    const currentSig = getPhotosSignature(photos);
    saveRuntimeState(stateKey, {
      signature: currentSig,
      currentIndex,
      filmstripIndex,
      mosaicPhotos,
      mosaicSlot: mosaicSlotRef.current,
      mosaicIndex: mosaicIndexRef.current,
      scatteredPolaroids,
    });
  }, [currentIndex, filmstripIndex, mosaicPhotos, scatteredPolaroids, photos, stateKey]);

  const filmstripActiveIndex = ((filmstripIndex % photos.length) + photos.length) % photos.length;
  const currentPhoto =
    style === 'filmstrip'
      ? photos[filmstripActiveIndex] || photos[0]
      : photos[currentIndex] || photos[0];
  const activeDisplayIndex = style === 'filmstrip' ? filmstripActiveIndex : currentIndex;

  return (
    <div
      className="group relative w-full h-full rounded-2xl overflow-hidden select-none bg-black flex flex-col justify-between"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 1. Ken Burns Ambient Display Style */}
      {style === 'ken_burns' && (
        <div className="absolute inset-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPhoto.id}
              initial={{ scale: 1.0, opacity: 0 }}
              animate={{ scale: 1.15, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                scale: { duration: intervalSec + 3, ease: 'linear' },
                opacity: { duration: 1.2 },
              }}
              style={{
                backgroundImage: `url(${getOptimizedPhotoUrl(currentPhoto.url, 1920)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              className="absolute inset-0 w-full h-full"
            >
              <img
                src={getOptimizedPhotoUrl(currentPhoto.url, 1920)}
                alt=""
                referrerPolicy="no-referrer"
                className="hidden"
                onError={() => handleKenBurnsError(currentPhoto.id)}
              />
            </motion.div>
          </AnimatePresence>
          {/* Subtle vignette gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

          {/* Interactive Navigation Chevrons on Hover for Ken Burns */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleKenBurnsPrev();
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-35 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-md shadow-xl hover:scale-110 active:scale-95"
                title="Previous photo (Go back)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleKenBurnsNext();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-35 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-md shadow-xl hover:scale-110 active:scale-95"
                title="Next photo"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* 2. Mosaic / Collage Grid Style (4-quadrant auto-rotating collection) */}
      {style === 'mosaic' && (
        <div className="absolute inset-0 p-2 grid grid-cols-2 grid-rows-2 gap-2 bg-gray-950">
          {(mosaicPhotos.length >= 4 ? mosaicPhotos : photos.slice(0, 4)).map((p, idx) => (
            <div
              key={`mosaic-slot-${idx}`}
              onClick={() => handleShuffleMosaicSlot(idx)}
              className="relative rounded-xl overflow-hidden shadow-md bg-gray-900 group cursor-pointer"
              title="Click to advance this photo"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, ease: 'easeInOut' }}
                  className="absolute inset-0 w-full h-full"
                >
                  <img
                    src={getOptimizedPhotoUrl(p.url, 800)}
                    alt={p.caption || 'Photo'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={() => handleMosaicError(idx, p.id)}
                  />
                  {showCaptions && (
                    <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-[11px] text-white truncate font-medium">
                      {p.caption || p.author || 'Captured Moment'}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          ))}

          {/* Interactive Navigation Chevrons on Hover for Mosaic */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMosaicPrev();
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-35 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-md shadow-xl hover:scale-110 active:scale-95"
                title="Previous photo collage (Go back)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMosaicNext();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-35 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-md shadow-xl hover:scale-110 active:scale-95"
                title="Next photo collage"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* 3. Scattered Polaroids Style (Multiple scattered photos with random updates) */}
      {style === 'polaroid' && (
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#121622] via-[#0b0e16] to-[#07090f] p-3 select-none">
          {/* Subtle ambient vignette */}
          <div className="absolute inset-0 bg-radial from-transparent via-black/40 to-black/85 pointer-events-none" />

          {/* Render Scattered Polaroid Cards with Dynamic Varied Sizing */}
          {scatteredPolaroids.map((item, idx) => {
            const slotDef = polaroidSlots[idx] || polaroidSlots[0];
            const isHero = slotDef?.sizeType === 'hero';
            const isSmall = slotDef?.sizeType === 'small';

            return (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, scale: 0.75, y: -24, rotate: item.rotation + 6 }}
                animate={{ opacity: 1, scale: 1, y: 0, rotate: item.rotation }}
                transition={{
                  type: 'spring',
                  damping: 17,
                  stiffness: 130,
                  mass: 0.85,
                }}
                whileHover={{
                  scale: 1.15,
                  rotate: 0,
                  zIndex: 70,
                  transition: { duration: 0.18 },
                }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleShufflePolaroid(idx)}
                title="Click to randomly shuffle this polaroid"
                style={{
                  position: 'absolute',
                  top: slotDef.top,
                  left: slotDef.left,
                  width: slotDef.width,
                  maxWidth: slotDef.maxW,
                  zIndex: item.zIndex,
                }}
                className="aspect-[4/5] cursor-pointer touch-manipulation group"
              >
                {/* Classic white polaroid paper frame */}
                <div
                  className={`relative w-full h-full bg-[#fdfbf7] rounded-sm shadow-2xl border border-black/15 flex flex-col justify-between transition-shadow group-hover:shadow-cyan-500/30 ${
                    isHero
                      ? showCaptions ? 'p-2 sm:p-3 pb-6 sm:pb-9 ring-1 ring-black/5' : 'p-2 sm:p-3 pb-3 ring-1 ring-black/5'
                      : isSmall
                      ? showCaptions ? 'p-1 pb-4' : 'p-1'
                      : showCaptions ? 'p-1.5 sm:p-2 pb-5 sm:pb-7' : 'p-1.5 sm:p-2'
                  }`}
                >
                  <div className="w-full flex-1 min-h-0 overflow-hidden rounded-xs bg-gray-900 relative">
                    <img
                      src={getOptimizedPhotoUrl(item.photo.url, isHero ? 800 : 600)}
                      alt={item.photo.caption || 'Polaroid moment'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover select-none pointer-events-none"
                      loading="lazy"
                      onError={() => handlePolaroidError(idx, item.photo.id)}
                    />
                  </div>
                  {showCaptions && (
                    <div className="mt-1 sm:mt-1.5 px-0.5 text-center shrink-0">
                      <div
                        className={`font-handwriting font-bold text-gray-800 truncate tracking-tight ${
                          isHero ? 'text-xs sm:text-sm font-extrabold' : isSmall ? 'text-[9px]' : 'text-[10px] sm:text-xs'
                        }`}
                      >
                        {item.photo.caption || 'Captured Moment'}
                      </div>
                      {item.photo.author && !isSmall && (
                        <div className="text-[8px] sm:text-[9px] text-gray-500 font-sans truncate">
                          {item.photo.author}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 4. Filmstrip Scrolling Style (Infinite centered cinematic reel) */}
      {style === 'filmstrip' && (
        <div className="absolute inset-0 overflow-hidden bg-[#06080d] flex items-center justify-center select-none group">
          {/* Perforated film rails at top and bottom */}
          <div className="absolute top-0 inset-x-0 h-4 bg-black/90 border-b border-white/10 flex items-center justify-between px-2 pointer-events-none z-30 overflow-hidden">
            {Array.from({ length: 32 }).map((_, i) => (
              <div key={i} className="w-2.5 h-1.5 rounded-[1px] bg-white/20 border border-black/40 shrink-0" />
            ))}
          </div>
          <div className="absolute bottom-0 inset-x-0 h-4 bg-black/90 border-t border-white/10 flex items-center justify-between px-2 pointer-events-none z-30 overflow-hidden">
            {Array.from({ length: 32 }).map((_, i) => (
              <div key={i} className="w-2.5 h-1.5 rounded-[1px] bg-white/20 border border-black/40 shrink-0" />
            ))}
          </div>

          {/* Vignette gradients on left and right for seamless entrance/exit */}
          <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#06080d] via-[#06080d]/80 to-transparent pointer-events-none z-25" />
          <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-[#06080d] via-[#06080d]/80 to-transparent pointer-events-none z-25" />

          {/* Interactive Navigation Chevrons on Hover */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleFilmstripPrev();
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-35 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-md shadow-xl hover:scale-110 active:scale-95"
                title="Previous photo (Go back)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleFilmstripNext();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-35 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-md shadow-xl hover:scale-110 active:scale-95"
                title="Next photo"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Window of 7 reel positions centered on filmstripIndex */}
          {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
            const itemIndex = filmstripIndex + offset;
            const photoIndex = ((itemIndex % photos.length) + photos.length) % photos.length;
            const p = photos[photoIndex];
            if (!p) return null;

            const isCenter = offset === 0;

            return (
              <motion.div
                key={itemIndex}
                onClick={() => {
                  if (!isCenter) {
                    setFilmstripIndex(itemIndex);
                  }
                }}
                animate={{
                  x: `${offset * 70}%`,
                  scale: isCenter ? 1.42 : Math.abs(offset) === 1 ? 0.72 : Math.abs(offset) === 2 ? 0.52 : 0.38,
                  opacity: isCenter ? 1 : Math.abs(offset) === 1 ? 0.55 : Math.abs(offset) === 2 ? 0.22 : 0,
                  zIndex: isCenter ? 32 : 10 - Math.abs(offset),
                  filter: isCenter ? 'brightness(105%) contrast(102%)' : 'brightness(60%)',
                }}
                transition={{
                  duration: 0.85,
                  ease: [0.25, 1, 0.5, 1],
                }}
                className={`absolute w-[50%] max-w-[480px] aspect-[16/10] rounded-xl overflow-hidden cursor-pointer shadow-2xl ${
                  isCenter
                    ? 'ring-2 ring-blue-500/90 shadow-[0_25px_60px_rgba(0,0,0,0.95)]'
                    : 'border border-white/10 hover:opacity-75'
                }`}
                title={isCenter ? p.caption : 'Click to center this photo'}
              >
                <img
                  src={getOptimizedPhotoUrl(p.url, 800)}
                  alt={p.caption || 'Film frame'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover select-none pointer-events-none"
                  loading="lazy"
                  onError={() => handleFilmstripError(p.id)}
                />

                {isCenter && showCaptions && (
                  <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent text-center">
                    <div className="text-xs sm:text-sm font-bold text-white truncate drop-shadow-md">
                      {p.caption || 'Captured Moment'}
                    </div>
                    {p.author && (
                      <div className="text-[10px] text-gray-300 font-sans truncate drop-shadow mt-0.5">
                        {p.author}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Ambient Top Caption Pill */}
      {showCaptions && (
        <div className="relative z-40 p-3 flex items-center justify-between text-white drop-shadow-md pointer-events-none pr-24">
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-xs">
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium truncate max-w-[160px]">
              {currentPhoto.caption || sourceLabel}
            </span>
            <span className="text-[10px] text-gray-400 font-mono">
              ({activeDisplayIndex + 1}/{photos.length})
            </span>
          </div>
        </div>
      )}

      {/* Subtle Bottom Photo Attribution (for Ken Burns and Mosaic) */}
      {showCaptions && style !== 'filmstrip' && currentPhoto.author && (
        <div className="relative z-10 p-3 flex items-end justify-end text-white pointer-events-none drop-shadow-lg">
          <div className="text-[11px] text-gray-400 text-right bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/10">
            Photo: <span className="text-gray-200 font-medium">{currentPhoto.author}</span>
          </div>
        </div>
      )}
    </div>
  );
};
