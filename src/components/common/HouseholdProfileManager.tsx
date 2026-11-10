import React, { useState, useRef } from 'react';
import { Crop, Edit2, Plus, Trash2, Upload, Users } from 'lucide-react';
import { useProfileStore } from '../../stores/useProfileStore';
import {
  HOUSEHOLD_PROFILE_PALETTE,
  type HouseholdProfile,
  type HouseholdRole,
} from '../../types/profiles';
import { decodeImageFileForPreview } from '../../utils/avatarCompressor';
import { HouseholdAvatar } from './HouseholdAvatar';
import { AvatarCropModal } from './AvatarCropModal';

const PROFILE_EMOJI_PRESETS = [
  '🧒', '👧', '👦', '🧑', '👨', '👩', '👶', '🧓', '👵', '🦊', '🐼', '🦁',
  '🐸', '🦄', '🐨', '🐯', '🐰', '🐶', '🐱', '🦉', '🦋', '🦖', '🚀', '⭐',
];

function extractLatestEmoji(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segs = Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)
    );
    return segs[segs.length - 1]?.segment || trimmed;
  }
  const chars = Array.from(trimmed);
  return chars[chars.length - 1] || trimmed;
}

export const HouseholdProfileManager: React.FC = () => {
  const householdProfiles = useProfileStore((s) => s.profiles);
  const upsertHouseholdProfile = useProfileStore((s) => s.upsertHouseholdProfile);
  const setProfileAvatarDataUrl = useProfileStore((s) => s.setProfileAvatarDataUrl);
  const removeProfileAvatar = useProfileStore((s) => s.removeProfileAvatar);
  const deleteHouseholdProfile = useProfileStore((s) => s.deleteHouseholdProfile);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [profName, setProfName] = useState('');
  const [profRole, setProfRole] = useState<HouseholdRole>('kid');
  const [profColor, setProfColor] = useState<string>(HOUSEHOLD_PROFILE_PALETTE[0].hex);
  const [profEmoji, setProfEmoji] = useState<string>('🧒');
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarTargetProfileId, setAvatarTargetProfileId] = useState<string | null>(null);
  const [cropModalState, setCropModalState] = useState<{
    profileId: string;
    previewUrl: string;
    revoke?: () => void;
  } | null>(null);

  const openEditProfile = (hp: HouseholdProfile) => {
    setEditingProfileId(hp.id);
    setIsAddingProfile(false);
    setProfName(hp.name);
    setProfRole(hp.role);
    setProfColor(hp.color);
    setProfEmoji(hp.emoji || (hp.role === 'parent' ? '🧑' : '🧒'));
  };

  const openAddProfile = () => {
    setEditingProfileId(null);
    setIsAddingProfile(true);
    setProfName('');
    setProfRole('kid');
    setProfColor(
      HOUSEHOLD_PROFILE_PALETTE[householdProfiles.length % HOUSEHOLD_PROFILE_PALETTE.length].hex
    );
    setProfEmoji('🧒');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profName.trim()) return;
    await upsertHouseholdProfile({
      id: editingProfileId || undefined,
      name: profName.trim(),
      role: profRole,
      color: profColor,
      emoji: profEmoji,
    });
    setEditingProfileId(null);
    setIsAddingProfile(false);
  };

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !avatarTargetProfileId) return;
    try {
      setAvatarStatus('Decoding photo (including HEIC support)...');
      const { previewUrl, revoke } = await decodeImageFileForPreview(file);
      setAvatarStatus(null);
      setCropModalState({
        profileId: avatarTargetProfileId,
        previewUrl,
        revoke,
      });
    } catch (err: any) {
      setAvatarStatus(err?.message || 'Failed to decode image');
      setTimeout(() => setAvatarStatus(null), 4000);
    }
  };

  const handleCloseCropModal = () => {
    cropModalState?.revoke?.();
    setCropModalState(null);
  };

  const handleSaveCroppedAvatar = async (croppedWebpDataUrl: string) => {
    if (!cropModalState) return;
    const { profileId, revoke } = cropModalState;
    try {
      await setProfileAvatarDataUrl(profileId, croppedWebpDataUrl);
      revoke?.();
      setCropModalState(null);
      setAvatarStatus('Avatar saved & synced!');
      setTimeout(() => setAvatarStatus(null), 2500);
    } catch (err: any) {
      setAvatarStatus(err?.message || 'Failed to save avatar');
    }
  };

  return (
    <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Users className="w-4 h-4 text-sky-400" />
            <span>Household Members & Avatars ({householdProfiles.length})</span>
          </div>
          <span className="text-[11px] text-gray-400 block mt-0.5">
            Global family profiles shared across Chores, Meal Planner, Calendar & Kanban boards. Photos auto-compress to 256×256 WebP.
          </span>
        </div>

        <button
          type="button"
          onClick={openAddProfile}
          className="px-3 py-1.5 rounded-lg bg-sky-600/25 hover:bg-sky-600/35 text-sky-200 border border-sky-500/40 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Member</span>
        </button>
      </div>

      {/* Hidden File Input for Client-Side 256x256 WebP & HEIC Avatar Upload */}
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,image/*"
        onChange={handleAvatarFileSelected}
        className="hidden"
      />

      {avatarStatus && (
        <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-xs text-sky-200">
          {avatarStatus}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {householdProfiles.map((hp) => (
          <div
            key={hp.id}
            className="p-3 rounded-xl bg-gray-900/70 border border-gray-800 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <HouseholdAvatar profile={hp} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white truncate">{hp.name}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                      hp.role === 'parent'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {hp.role}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarTargetProfileId(hp.id);
                      avatarFileInputRef.current?.click();
                    }}
                    className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{hp.avatarDataUrl ? 'Change' : 'Upload Photo'}</span>
                  </button>
                  {hp.avatarDataUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setCropModalState({
                            profileId: hp.id,
                            previewUrl: hp.avatarDataUrl!,
                          })
                        }
                        className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                        title="Adjust photo placement & zoom"
                      >
                        <Crop className="w-3 h-3" />
                        <span>Adjust</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeProfileAvatar(hp.id)}
                        className="text-[11px] text-gray-500 hover:text-rose-400 cursor-pointer"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => openEditProfile(hp)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer"
                title="Edit member"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              {householdProfiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => deleteHouseholdProfile(hp.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                  title="Delete member"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Profile Form */}
      {(isAddingProfile || editingProfileId) && (
        <form
          onSubmit={handleSaveProfile}
          className="p-3.5 rounded-xl bg-gray-950 border border-sky-500/40 space-y-3 mt-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-300">
              {editingProfileId ? 'Edit Household Member' : 'New Household Member'}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingProfileId(null);
                setIsAddingProfile(false);
              }}
              className="text-xs text-gray-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              required
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
              placeholder="Member Name (e.g. Alex)"
              className="px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-700 text-xs text-white"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setProfRole('kid')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                  profRole === 'kid'
                    ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400'
                }`}
              >
                Kid (Chores & Rewards)
              </button>
              <button
                type="button"
                onClick={() => setProfRole('parent')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                  profRole === 'parent'
                    ? 'bg-purple-600/25 border-purple-500 text-purple-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400'
                }`}
              >
                Parent / Adult
              </button>
            </div>
          </div>

          {/* Calming Palette Picker */}
          <div>
            <span className="block text-[11px] text-gray-400 mb-1">Calming Accent Color:</span>
            <div className="flex items-center flex-wrap gap-2">
              {HOUSEHOLD_PROFILE_PALETTE.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() => setProfColor(swatch.hex)}
                  title={swatch.name}
                  className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                    profColor === swatch.hex
                      ? 'border-white scale-110'
                      : 'border-transparent opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
            </div>
          </div>

          {/* Fallback Emoji Picker + Custom Keyboard Emoji Input */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span className="block text-[11px] text-gray-400">
                Fallback Icon (used if no photo is uploaded):
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-400">Custom:</span>
                <input
                  type="text"
                  value={profEmoji}
                  onChange={(e) => setProfEmoji(extractLatestEmoji(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="😀"
                  title="Type or paste any emoji from your keyboard"
                  className="w-12 h-7 px-1.5 rounded-lg bg-gray-900 border border-sky-500/40 focus:border-sky-400 text-center text-sm text-white focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-1.5">
              {PROFILE_EMOJI_PRESETS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setProfEmoji(em)}
                  className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center border cursor-pointer ${
                    profEmoji === em
                      ? 'bg-sky-500/25 border-sky-400'
                      : 'bg-gray-900 border-gray-800'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
            >
              Save Member
            </button>
          </div>
        </form>
      )}

      {/* Interactive Circular Avatar Placement, Zoom & Rotate Modal */}
      <AvatarCropModal
        isOpen={Boolean(cropModalState)}
        imageUrl={cropModalState?.previewUrl || null}
        profileName={
          householdProfiles.find((p) => p.id === cropModalState?.profileId)?.name || 'Family Member'
        }
        profileColor={
          householdProfiles.find((p) => p.id === cropModalState?.profileId)?.color || '#38bdf8'
        }
        onCancel={handleCloseCropModal}
        onSave={handleSaveCroppedAvatar}
      />
    </div>
  );
};
