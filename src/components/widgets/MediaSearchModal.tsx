import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  Sparkles,
  Sticker,
  Image as ImageIcon,
  Link,
  Upload,
  Loader2,
} from 'lucide-react';
import {
  searchGiphy,
  searchWikimediaImages,
  type MediaSearchResult,
} from '../../services/mediaSearch';

interface MediaSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string, title?: string) => void;
  initialUrl?: string;
}

type MediaTab = 'gifs' | 'stickers' | 'images' | 'custom';

export const MediaSearchModal: React.FC<MediaSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialUrl = '',
}) => {
  const [activeTab, setActiveTab] = useState<MediaTab>('gifs');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [customUrl, setCustomUrl] = useState(initialUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load results when tab or query changes
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'custom') return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (activeTab === 'gifs') {
          const data = await searchGiphy(query, 'gifs', 24);
          setResults(data);
        } else if (activeTab === 'stickers') {
          const data = await searchGiphy(query, 'stickers', 24);
          setResults(data);
        } else if (activeTab === 'images') {
          const data = await searchWikimediaImages(query || 'landscape', 24);
          setResults(data);
        }
      } catch (err) {
        console.error('Error fetching media:', err);
      } finally {
        setLoading(false);
      }
    }, query ? 350 : 0);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isOpen, activeTab, query]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        onSelect(dataUrl, file.name);
        onClose();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    onSelect(customUrl.trim());
    onClose();
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 p-4 bg-gray-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Select Image or GIF
              </h2>
              <p className="text-[11px] text-gray-400">
                Browse millions of animated GIFs, stickers, or enter any web URL
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 px-4 pt-2.5 border-b border-gray-800 bg-gray-950/50 shrink-0">
          {[
            { id: 'gifs' as const, label: 'GIPHY GIFs', icon: <Sparkles className="w-3.5 h-3.5 text-pink-400" /> },
            { id: 'stickers' as const, label: 'Stickers', icon: <Sticker className="w-3.5 h-3.5 text-amber-400" /> },
            { id: 'images' as const, label: 'Photos & Art', icon: <ImageIcon className="w-3.5 h-3.5 text-emerald-400" /> },
            { id: 'custom' as const, label: 'Custom URL / Upload', icon: <Link className="w-3.5 h-3.5 text-cyan-400" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setQuery('');
              }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400 bg-gray-900/90 shadow-sm'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Search bar (for searchable tabs) */}
        {activeTab !== 'custom' && (
          <div className="p-3 border-b border-gray-800/80 bg-gray-900/90 shrink-0 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  activeTab === 'stickers'
                    ? 'Search transparent stickers (e.g., cat, party, coffee)...'
                    : activeTab === 'images'
                    ? 'Search photos (e.g., mountains, sunset, architecture)...'
                    : 'Search animated GIFs on GIPHY (e.g., cheers, celebration, dance)...'
                }
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {activeTab === 'gifs' || activeTab === 'stickers' ? (
              <span className="text-[10px] font-black tracking-widest text-gray-500 uppercase px-1.5 shrink-0">
                via GIPHY
              </span>
            ) : null}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[320px]">
          {activeTab === 'custom' ? (
            /* Custom URL & Local File Upload Tab */
            <div className="space-y-6 max-w-md mx-auto py-4">
              <form onSubmit={handleCustomSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Paste Direct Image or GIF URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder="https://example.com/animation.gif"
                      className="flex-1 px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={!customUrl.trim()}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-bold text-white transition-all cursor-pointer shrink-0 shadow"
                    >
                      Use URL
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-500 block mt-1">
                    Supports .gif, .png, .jpg, .webp, .svg, and dynamic CDN images.
                  </span>
                </div>
              </form>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-gray-800 w-full" />
                <span className="bg-gray-900 px-3 text-[11px] text-gray-500 uppercase font-mono tracking-wider absolute">
                  or upload from device
                </span>
              </div>

              <div className="text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-gray-700/80 hover:border-blue-500/60 bg-gray-950/50 hover:bg-blue-500/5 text-gray-400 hover:text-blue-300 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-800/80 group-hover:bg-blue-500/20 flex items-center justify-center transition-colors">
                    <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block text-white">
                      Upload from Computer / Device
                    </span>
                    <span className="text-[10px] text-gray-500">
                      PNG, JPG, GIF, WebP up to 10MB
                    </span>
                  </div>
                </button>
              </div>
            </div>
          ) : loading ? (
            /* Loading Spinner */
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
              <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
              <span className="text-xs font-medium">Searching {activeTab === 'images' ? 'images' : 'GIPHY'}...</span>
            </div>
          ) : results.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
              <Search className="w-8 h-8 text-gray-600 mb-2" />
              <p className="text-xs font-semibold text-gray-300">No results found</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Try a different search term or check spelling</p>
            </div>
          ) : (
            /* Masonry-Style Responsive Grid */
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.url, item.title);
                    onClose();
                  }}
                  title={item.title}
                  className={`group relative rounded-xl overflow-hidden border border-gray-800 hover:border-blue-500 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer bg-gray-950/70 aspect-square flex items-center justify-center shadow-sm ${
                    activeTab === 'stickers'
                      ? 'bg-[linear-gradient(45deg,#1f2937_25%,transparent_25%),linear-gradient(-45deg,#1f2937_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1f2937_75%),linear-gradient(-45deg,transparent_75%,#1f2937_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]'
                      : ''
                  }`}
                >
                  <img
                    src={item.previewUrl}
                    alt={item.title}
                    loading="lazy"
                    className={`w-full h-full ${
                      activeTab === 'stickers' ? 'object-contain p-2' : 'object-cover'
                    }`}
                  />
                  <div className="absolute inset-0 bg-blue-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center backdrop-blur-xs">
                    <span className="text-[10px] font-bold text-white line-clamp-2">
                      Select
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-gray-800 bg-gray-950/80 shrink-0 flex items-center justify-between text-[11px] text-gray-500">
          <span>Click any image to place it on your canvas</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
