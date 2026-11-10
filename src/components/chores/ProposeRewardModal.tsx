import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Link2,
  Image as ImageIcon,
  DollarSign,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { Profile } from '../../types/chores';
import { HouseholdAvatar } from '../common/HouseholdAvatar';

interface ProposeRewardModalProps {
  isOpen: boolean;
  profiles: Profile[];
  defaultProfileId?: string;
  onClose: () => void;
  onSubmitProposal: (proposal: {
    profileId: string;
    title: string;
    sourceUrl?: string;
    imageUrl?: string;
    rawPrice?: number;
  }) => Promise<void> | void;
}

export const ProposeRewardModal: React.FC<ProposeRewardModalProps> = ({
  isOpen,
  profiles,
  defaultProfileId,
  onClose,
  onSubmitProposal,
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    defaultProfileId && defaultProfileId !== 'household'
      ? defaultProfileId
      : profiles[0]?.id || ''
  );
  const [sourceUrl, setSourceUrl] = useState('');
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [rawPriceInput, setRawPriceInput] = useState('');
  const [extractStatus, setExtractStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [extractMessage, setExtractMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleExtractMetadata = async () => {
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) return;

    let normalizedUrl = trimmedUrl;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
      setSourceUrl(normalizedUrl);
    }

    setExtractStatus('loading');
    setExtractMessage('Extracting product details...');

    try {
      const res = await fetch(
        `/api/metadata?url=${encodeURIComponent(normalizedUrl)}`
      );
      const data = await res.json();

      if (!res.ok || data.error) {
        setExtractStatus('error');
        setExtractMessage(
          data.error ||
            'Could not auto-extract details. You can still type the title and image below!'
        );
        return;
      }

      if (data.title && !title.trim()) {
        setTitle(data.title);
      } else if (data.title) {
        setTitle(data.title);
      }

      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
      }

      if (typeof data.rawPrice === 'number' && data.rawPrice > 0) {
        setRawPriceInput(String(data.rawPrice));
      }

      setExtractStatus('success');
      setExtractMessage(
        `Extracted details${data.siteName ? ` from ${data.siteName}` : ''}! Feel free to customize below.`
      );
    } catch {
      setExtractStatus('error');
      setExtractMessage(
        'Could not reach link scraper. You can type the reward title manually below.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedProfileId || isSubmitting) return;

    const parsedPrice = parseFloat(rawPriceInput.replace(/[^0-9.]/g, ''));
    const validPrice =
      !Number.isNaN(parsedPrice) && parsedPrice > 0
        ? Number(parsedPrice.toFixed(2))
        : undefined;

    setIsSubmitting(true);
    try {
      await onSubmitProposal({
        profileId: selectedProfileId,
        title: title.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        rawPrice: validPrice,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        (e.currentTarget as any).__backdropMouseDown =
          e.target === e.currentTarget &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (e.currentTarget as any).__backdropMouseDown) {
          onClose();
        }
        (e.currentTarget as any).__backdropMouseDown = false;
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900/95 text-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Propose a Wishlist Reward
              </h3>
              <p className="text-xs text-slate-400">
                Add an item to the Proposals Tray for parent point appraisal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* 1. Who is wishing for this? */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-2">
              Who is proposing this reward?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {profiles.map((profile) => {
                const isSelected = selectedProfileId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedProfileId(profile.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800/90 border-emerald-500/50 ring-1 ring-emerald-500/30'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <HouseholdAvatar profile={profile} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {profile.name}
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {profile.balance} pts banked
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Product URL + Extract Details Button */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              Product Link (Optional — Auto-Extracts Title, Photo & Price)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2 className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://www.lego.com/... or amazon.com/..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
              <button
                type="button"
                disabled={!sourceUrl.trim() || extractStatus === 'loading'}
                onClick={handleExtractMetadata}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 disabled:opacity-40 transition-colors shrink-0 cursor-pointer"
              >
                {extractStatus === 'loading' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Extract Details</span>
              </button>
            </div>

            {extractStatus !== 'idle' && (
              <div
                className={`mt-2 flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border ${
                  extractStatus === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                    : extractStatus === 'error'
                      ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                {extractStatus === 'success' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                {extractStatus === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                <span>{extractMessage}</span>
              </div>
            )}
          </div>

          {/* 3. Reward Title */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              Reward Name <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. LEGO Creator 3-in-1 Space Roller Coaster, Movie Night, Ice Cream Trip..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          {/* 4. Image URL & Estimated Dollar Price */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Image URL (Optional)
              </label>
              <div className="relative">
                <ImageIcon className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://.../image.jpg"
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Est. Price ($ USD)
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rawPriceInput}
                  onChange={(e) => setRawPriceInput(e.target.value)}
                  placeholder="19.99"
                  className="w-full pl-7 pr-2.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>
          </div>

          {/* Live Card Preview */}
          {(title.trim() || imageUrl.trim()) && (
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-3">
              {imageUrl.trim() ? (
                <img
                  src={imageUrl.trim()}
                  alt={title || 'Preview'}
                  className="w-14 h-14 rounded-lg object-cover bg-slate-900 border border-slate-800 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shrink-0">
                  🎁
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {title.trim() || 'Untitled Reward'}
                </div>
                <div className="text-[11px] text-amber-300/90 mt-0.5">
                  Status: Needs Parent Pricing
                  {rawPriceInput ? ` • Est. $${rawPriceInput}` : ''}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !selectedProfileId || isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-sm disabled:opacity-40 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Send to Proposals Tray</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
