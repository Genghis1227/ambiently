import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon } from 'lucide-react';
import {
  CURATED_AMBIENT_PHOTOS,
  cachePhotosLocally,
  type PhotoItem,
  type PhotoDisplayStyle,
} from '../../services/photos';


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

interface PhotoFrameWidgetProps {
  initialStyle?: PhotoDisplayStyle;
  rotationIntervalSec?: number;
  customPhotos?: PhotoItem[];
  initialSourceLabel?: string;
  initialPolaroidCount?: number;
  initialPolaroidSizeMode?: PolaroidSizeMode;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

export const PhotoFrameWidget: React.FC<PhotoFrameWidgetProps> = ({
  initialStyle = 'ken_burns',
  rotationIntervalSec = 15,
  customPhotos,
  initialSourceLabel = 'Curated',
  initialPolaroidCount = 12,
  initialPolaroidSizeMode = 'mixed',
  onUpdateConfig: _onUpdateConfig,
}) => {
  const [style, setStyle] = useState<PhotoDisplayStyle>(initialStyle);
  const [intervalSec, setIntervalSec] = useState<number>(rotationIntervalSec);
  const [photos, setPhotos] = useState<PhotoItem[]>(
    customPhotos && customPhotos.length > 0 ? customPhotos : CURATED_AMBIENT_PHOTOS
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sourceLabel, setSourceLabel] = useState<string>(initialSourceLabel);

  const [polaroidCount, setPolaroidCount] = useState<number>(initialPolaroidCount);
  const [polaroidSizeMode, setPolaroidSizeMode] = useState<PolaroidSizeMode>(initialPolaroidSizeMode);

  const [scatteredPolaroids, setScatteredPolaroids] = useState<ActivePolaroidItem[]>([]);
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
    const initial: ActivePolaroidItem[] = polaroidSlots.map((slot, idx) => ({
      slotIndex: idx,
      photo: photos[idx % photos.length],
      rotation: slot.rotate,
      zIndex: 10 + idx,
      key: `slot-${idx}-${photos[idx % photos.length].id}-${Date.now()}`,
    }));
    setScatteredPolaroids(initial);
    topZIndexRef.current = 15 + polaroidSlots.length;
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

  // Mosaic active quadrant photos & auto-rotation
  const [mosaicPhotos, setMosaicPhotos] = useState<PhotoItem[]>(() => photos.slice(0, 4));
  const mosaicSlotRef = useRef(0);
  const mosaicIndexRef = useRef(4);

  useEffect(() => {
    if (!photos || photos.length === 0) return;
    setMosaicPhotos(photos.slice(0, 4));
    mosaicSlotRef.current = 0;
    mosaicIndexRef.current = 4 % photos.length;
  }, [photos]);

  useEffect(() => {
    if (style !== 'mosaic' || photos.length <= 1) return;

    // Staggered quadrant rotation: swap one photo every rotation interval
    const timer = setInterval(() => {
      setMosaicPhotos((prev) => {
        if (photos.length <= 1) return prev;
        const currentSlots = prev.length >= 4 ? prev : photos.slice(0, 4);
        const nextIdx = mosaicIndexRef.current % photos.length;
        const nextPhoto = photos[nextIdx];
        mosaicIndexRef.current = (nextIdx + 1) % photos.length;

        const slotToReplace = mosaicSlotRef.current % 4;
        mosaicSlotRef.current = (mosaicSlotRef.current + 1) % 4;

        const updated = [...currentSlots];
        updated[slotToReplace] = nextPhoto;
        return updated;
      });
    }, intervalSec * 1000);

    return () => clearInterval(timer);
  }, [style, photos, intervalSec]);

  const handleShuffleMosaicSlot = (slotIdx: number) => {
    if (photos.length <= 1) return;
    setMosaicPhotos((prev) => {
      const currentSlots = prev.length >= 4 ? prev : photos.slice(0, 4);
      const nextIdx = mosaicIndexRef.current % photos.length;
      const nextPhoto = photos[nextIdx];
      mosaicIndexRef.current = (nextIdx + 1) % photos.length;

      const updated = [...currentSlots];
      updated[slotIdx] = nextPhoto;
      return updated;
    });
  };


  // Sync props to state when widget config updates
  useEffect(() => {
    if (initialStyle) setStyle(initialStyle);
  }, [initialStyle]);

  useEffect(() => {
    if (rotationIntervalSec) setIntervalSec(rotationIntervalSec);
  }, [rotationIntervalSec]);

  useEffect(() => {
    if (customPhotos && customPhotos.length > 0) {
      setPhotos(customPhotos);
      setCurrentIndex(0);
    }
  }, [customPhotos]);

  useEffect(() => {
    if (initialSourceLabel) {
      setSourceLabel(initialSourceLabel);
    }
  }, [initialSourceLabel]);

  // Cache photos on mount for 0ms offline fallback
  useEffect(() => {
    cachePhotosLocally(photos);
  }, [photos]);

  // Slideshow auto-rotation
  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, intervalSec * 1000);
    return () => clearInterval(interval);
  }, [photos, intervalSec]);

  const currentPhoto = photos[currentIndex] || photos[0];

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden select-none bg-black flex flex-col justify-between">
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
                backgroundImage: `url(${currentPhoto.url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              className="absolute inset-0 w-full h-full"
            />
          </AnimatePresence>
          {/* Subtle vignette gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
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
                    src={p.url}
                    alt={p.caption || 'Photo'}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-[11px] text-white truncate font-medium">
                    {p.caption || p.author || 'Captured Moment'}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          ))}
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
                      ? 'p-2 sm:p-3 pb-6 sm:pb-9 ring-1 ring-black/5'
                      : isSmall
                      ? 'p-1 pb-4'
                      : 'p-1.5 sm:p-2 pb-5 sm:pb-7'
                  }`}
                >
                  <div className="w-full flex-1 min-h-0 overflow-hidden rounded-xs bg-gray-900 relative">
                    <img
                      src={item.photo.url}
                      alt={item.photo.caption || 'Polaroid moment'}
                      className="w-full h-full object-cover select-none pointer-events-none"
                      loading="lazy"
                    />
                  </div>
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
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 4. Filmstrip Scrolling Style */}
      {style === 'filmstrip' && (
        <div className="absolute inset-0 flex items-center gap-4 overflow-x-auto p-4 bg-gray-950">
          {photos.map((p, idx) => (
            <div
              key={p.id}
              onClick={() => setCurrentIndex(idx)}
              className={`relative shrink-0 w-44 aspect-[3/2] rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                idx === currentIndex ? 'border-blue-500 scale-105 shadow-xl' : 'border-gray-800 opacity-60'
              }`}
            >
              <img src={p.url} alt={p.caption} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Ambient Top Caption Pill */}
      <div className="relative z-10 p-3 flex items-center justify-between text-white drop-shadow-md pointer-events-none pr-24">
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-xs">
          <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-medium truncate max-w-[160px]">
            {currentPhoto.caption || sourceLabel}
          </span>
          <span className="text-[10px] text-gray-400 font-mono">
            ({currentIndex + 1}/{photos.length})
          </span>
        </div>
      </div>

      {/* Subtle Bottom Photo Attribution */}
      {currentPhoto.author && (
        <div className="relative z-10 p-3 flex items-end justify-end text-white pointer-events-none drop-shadow-lg">
          <div className="text-[11px] text-gray-400 text-right bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/10">
            Photo: <span className="text-gray-200 font-medium">{currentPhoto.author}</span>
          </div>
        </div>
      )}
    </div>
  );
};
