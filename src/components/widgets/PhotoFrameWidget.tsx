import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image as ImageIcon,
  FolderOpen,
} from 'lucide-react';
import {
  CURATED_AMBIENT_PHOTOS,
  pickLocalPhotoDirectory,
  cachePhotosLocally,
  type PhotoItem,
  type PhotoDisplayStyle,
} from '../../services/photos';

interface PhotoFrameWidgetProps {
  initialStyle?: PhotoDisplayStyle;
  rotationIntervalSec?: number;
  showOverlay?: boolean;
}

export const PhotoFrameWidget: React.FC<PhotoFrameWidgetProps> = ({
  initialStyle = 'ken_burns',
  rotationIntervalSec = 15,
  showOverlay = true,
}) => {
  const [style, setStyle] = useState<PhotoDisplayStyle>(initialStyle);
  const [photos, setPhotos] = useState<PhotoItem[]>(CURATED_AMBIENT_PHOTOS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Cache photos on mount for 0ms offline fallback
  useEffect(() => {
    cachePhotosLocally(photos);
  }, [photos]);

  // Clock overlay tick
  useEffect(() => {
    if (!showOverlay) return;
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [showOverlay]);

  // Slideshow auto-rotation
  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, rotationIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [photos, rotationIntervalSec]);

  const handlePickLocalFolder = async () => {
    const res = await pickLocalPhotoDirectory();
    if (res.success && res.photos.length > 0) {
      setPhotos(res.photos);
      setCurrentIndex(0);
      cachePhotosLocally(res.photos);
    }
  };

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
                scale: { duration: rotationIntervalSec + 3, ease: 'linear' },
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

      {/* 2. Mosaic / Collage Grid Style */}
      {style === 'mosaic' && (
        <div className="absolute inset-0 p-2 grid grid-cols-2 grid-rows-2 gap-2 bg-gray-950">
          {photos.slice(0, 4).map((p, idx) => (
            <div
              key={p.id}
              className={`relative rounded-xl overflow-hidden shadow-md ${
                idx === currentIndex % 4 ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <img src={p.url} alt={p.caption} className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-[11px] text-white truncate font-medium">
                {p.caption}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Scattered Polaroid Stack Style */}
      {style === 'polaroid' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#0c1017]">
          <div className="relative w-full max-w-[280px] aspect-[4/5] bg-white rounded-lg p-3 pb-8 shadow-2xl rotate-2 transition-transform hover:rotate-0">
            <div className="w-full h-[78%] overflow-hidden rounded bg-gray-900">
              <img
                src={currentPhoto.url}
                alt={currentPhoto.caption}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="mt-2 text-center">
              <div className="font-handwriting font-bold text-gray-800 text-sm truncate">
                {currentPhoto.caption || 'Captured Moment'}
              </div>
              {currentPhoto.author && (
                <div className="text-[10px] text-gray-500 font-sans mt-0.5">
                  by {currentPhoto.author}
                </div>
              )}
            </div>
          </div>
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

      {/* Ambient Top Controls & Style Switcher */}
      <div className="relative z-10 p-3 flex items-center justify-between text-white drop-shadow-md">
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 text-xs">
          <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-medium truncate max-w-[140px]">
            {currentPhoto.caption || 'Photo Frame'}
          </span>
        </div>

        {/* Quick Style Switcher & Source Trigger */}
        <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/10">
          {(['ken_burns', 'mosaic', 'polaroid', 'filmstrip'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-2 py-0.5 text-[10px] rounded-full uppercase tracking-wider font-semibold transition-all ${
                style === s ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:text-white'
              }`}
            >
              {s === 'ken_burns' ? 'Ken Burns' : s}
            </button>
          ))}
          <button
            onClick={handlePickLocalFolder}
            title="Select local photos folder"
            className="p-1 rounded-full text-amber-300 hover:bg-white/10 transition-all ml-1"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle Bottom Ambient Clock & Date Overlay */}
      {showOverlay && style === 'ken_burns' && (
        <div className="relative z-10 p-4 flex items-end justify-between text-white pointer-events-none drop-shadow-lg">
          <div>
            <div className="text-3xl md:text-4xl font-light font-mono tracking-tight">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-xs text-gray-300 font-medium">
              {currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </div>
          {currentPhoto.author && (
            <div className="text-[11px] text-gray-400 text-right">
              Photo: <span className="text-gray-200">{currentPhoto.author}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
