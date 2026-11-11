import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Crop,
  Edit2,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { db } from '../../services/db';
import { useProfileStore } from '../../stores/useProfileStore';
import {
  HOUSEHOLD_PROFILE_PALETTE,
  resolveProfileColorHex,
  type HouseholdProfile,
  type HouseholdRole,
} from '../../types/profiles';
import {
  compressAvatarToWebP,
  decodeImageFileForPreview,
  getProfileInitials,
} from '../../utils/avatarCompressor';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { AvatarCropModal } from '../common/AvatarCropModal';

export interface HouseholdProfilesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DRAFT_AVATAR_TARGET = '__draft_member__';

const CALM_EMOJI_PRESETS = [
  '🌿',
  '🦋',
  '🛡️',
  '🌸',
  '🦊',
  '🐼',
  '🦉',
  '🐨',
  '🐢',
  '🐻',
  '⭐',
  '🌙',
  '🎨',
  '📚',
  '🚀',
  '🎵',
] as const;

function extractSingleGrapheme(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segs = Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)
    );
    return segs[segs.length - 1]?.segment || '';
  }
  const chars = Array.from(trimmed);
  return chars[chars.length - 1] || '';
}

export const HouseholdProfilesModal: React.FC<HouseholdProfilesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const profiles = useProfileStore((s) => s.profiles);
  const upsertHouseholdProfile = useProfileStore((s) => s.upsertHouseholdProfile);
  const uploadAndSetAvatar = useProfileStore((s) => s.uploadAndSetAvatar);
  const setProfileAvatarDataUrl = useProfileStore((s) => s.setProfileAvatarDataUrl);
  const removeProfileAvatar = useProfileStore((s) => s.removeProfileAvatar);
  const deleteHouseholdProfile = useProfileStore((s) => s.deleteHouseholdProfile);

  const [editorMode, setEditorMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<HouseholdRole>('kid');
  const [formColor, setFormColor] = useState<string>(HOUSEHOLD_PROFILE_PALETTE[0].hex);
  const [formEmoji, setFormEmoji] = useState<string>('');
  const [draftAvatarDataUrl, setDraftAvatarDataUrl] = useState<string | undefined>(undefined);
  const [isSavingMember, setIsSavingMember] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    tone: 'calm' | 'warn';
    message: string;
  } | null>(null);

  const [cropModalState, setCropModalState] = useState<{
    targetId: string;
    previewUrl: string;
    profileName: string;
    profileColor: string;
    revoke?: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const avatarTargetIdRef = useRef<string | null>(null);
  const backdropPointerDownRef = useRef(false);
  const statusTimerRef = useRef<number | null>(null);
  const activeRevokeRef = useRef<(() => void) | undefined>(undefined);
  const isCropModalOpenRef = useRef(false);

  const showTransientStatus = useCallback((message: string, tone: 'calm' | 'warn' = 'calm') => {
    if (statusTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(statusTimerRef.current);
    }
    setStatusBanner({ tone, message });
    if (typeof window !== 'undefined') {
      statusTimerRef.current = window.setTimeout(() => {
        setStatusBanner(null);
        statusTimerRef.current = null;
      }, 3200);
    }
  }, []);

  const closeCropModal = useCallback(() => {
    if (activeRevokeRef.current) {
      activeRevokeRef.current();
      activeRevokeRef.current = undefined;
    }
    isCropModalOpenRef.current = false;
    setCropModalState(null);
  }, []);

  useEffect(() => {
    isCropModalOpenRef.current = Boolean(cropModalState);
  }, [cropModalState]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (isCropModalOpenRef.current) {
          closeCropModal();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen, onClose, closeCropModal]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(statusTimerRef.current);
      }
      if (activeRevokeRef.current) {
        activeRevokeRef.current();
        activeRevokeRef.current = undefined;
      }
    };
  }, []);

  if (!isOpen) return null;

  const openAddForm = () => {
    const nextPalette =
      HOUSEHOLD_PROFILE_PALETTE[profiles.length % HOUSEHOLD_PROFILE_PALETTE.length];
    setEditorMode('add');
    setEditingProfileId(null);
    setFormName('');
    setFormRole('kid');
    setFormColor(nextPalette.hex);
    setFormEmoji('🌿');
    setDraftAvatarDataUrl(undefined);
    setConfirmDeleteId(null);
  };

  const openEditForm = (profile: HouseholdProfile) => {
    setEditorMode('edit');
    setEditingProfileId(profile.id);
    setFormName(profile.name);
    setFormRole(profile.role);
    setFormColor(resolveProfileColorHex(profile.color));
    setFormEmoji(profile.emoji || '');
    setDraftAvatarDataUrl(profile.avatarDataUrl);
    setConfirmDeleteId(null);
  };

  const closeEditorForm = () => {
    setEditorMode('closed');
    setEditingProfileId(null);
    setDraftAvatarDataUrl(undefined);
  };

  const triggerFilePicker = (targetId: string, useCamera = false) => {
    avatarTargetIdRef.current = targetId;
    if (useCamera) {
      cameraInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetId = avatarTargetIdRef.current;
    if (!file || !targetId) return;

    const targetProfile =
      targetId === DRAFT_AVATAR_TARGET ? undefined : profiles.find((p) => p.id === targetId);
    const displayName =
      targetId === DRAFT_AVATAR_TARGET
        ? formName.trim() || 'Family Member'
        : targetProfile?.name || 'Family Member';
    const displayColor =
      targetId === DRAFT_AVATAR_TARGET
        ? resolveProfileColorHex(formColor)
        : resolveProfileColorHex(targetProfile?.color);

    try {
      showTransientStatus('Preparing circular 256×256 WebP preview...');
      const { previewUrl, revoke } = await decodeImageFileForPreview(file);
      if (activeRevokeRef.current) {
        activeRevokeRef.current();
      }
      activeRevokeRef.current = revoke;
      isCropModalOpenRef.current = true;
      setStatusBanner(null);
      setCropModalState({
        targetId,
        previewUrl,
        profileName: displayName,
        profileColor: displayColor,
        revoke,
      });
    } catch (decodeErr) {
      // Fallback: attempt direct one-shot 256x256 WebP center-compression
      try {
        if (targetId === DRAFT_AVATAR_TARGET) {
          const webp = await compressAvatarToWebP(file, 256, 0.82);
          setDraftAvatarDataUrl(webp);
          showTransientStatus('Photo compressed to 256×256 WebP.');
        } else {
          const webp = await uploadAndSetAvatar(targetId, file);
          if (editingProfileId === targetId) {
            setDraftAvatarDataUrl(webp);
          }
          showTransientStatus('Avatar saved as 256×256 WebP.');
        }
      } catch {
        const message =
          decodeErr instanceof Error ? decodeErr.message : 'Could not process selected image.';
        showTransientStatus(message, 'warn');
      }
    }
  };

  const handleSaveCroppedAvatar = async (croppedWebpDataUrl: string) => {
    if (!cropModalState) return;
    const { targetId } = cropModalState;
    try {
      if (targetId === DRAFT_AVATAR_TARGET) {
        setDraftAvatarDataUrl(croppedWebpDataUrl);
        closeCropModal();
        showTransientStatus('Photo ready — save member to finish.');
        return;
      }

      await setProfileAvatarDataUrl(targetId, croppedWebpDataUrl);
      if (editingProfileId === targetId) {
        setDraftAvatarDataUrl(croppedWebpDataUrl);
      }
      closeCropModal();
      showTransientStatus('256×256 WebP avatar saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save avatar.';
      showTransientStatus(msg, 'warn');
    }
  };

  const handleClearAvatar = async (targetId: string) => {
    if (targetId === DRAFT_AVATAR_TARGET) {
      setDraftAvatarDataUrl(undefined);
      showTransientStatus('Reset avatar back to initials.');
      return;
    }

    await removeProfileAvatar(targetId);
    if (editingProfileId === targetId) {
      setDraftAvatarDataUrl(undefined);
    }
    showTransientStatus('Cleared photo back to initials.');
  };

  const handleMoveProfile = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (isReordering || targetIndex < 0 || targetIndex >= profiles.length) return;

    setIsReordering(true);
    try {
      const nowIso = new Date().toISOString();
      const reordered = profiles.slice();
      const movingItem: HouseholdProfile = {
        ...reordered[index],
        updatedAt: nowIso,
      };
      const displacedItem: HouseholdProfile = {
        ...reordered[targetIndex],
        updatedAt: nowIso,
      };

      reordered[index] = displacedItem;
      reordered[targetIndex] = movingItem;

      // 1. Update Zustand profile store order immediately
      useProfileStore.setState({ profiles: reordered });

      // 2. Persist reordered records cleanly to IndexedDB db.profiles when available
      if (typeof indexedDB !== 'undefined') {
        try {
          await db.transaction('rw', db.profiles, async () => {
            const allRows = await db.profiles.toArray();
            const tombstones = allRows.filter((row) => Boolean(row.deletedAt));
            await db.profiles.clear();
            await db.profiles.bulkPut([...reordered, ...tombstones]);
          });
        } catch (dbErr) {
          console.warn('Failed to persist reordered profiles to IndexedDB:', dbErr);
        }
      }

      // 3. Re-upsert moved record in-place so registered sync listeners (chores + cloud/file backup) fire
      await upsertHouseholdProfile({
        id: movingItem.id,
        name: movingItem.name,
        role: movingItem.role,
        color: movingItem.color,
        avatarDataUrl: movingItem.avatarDataUrl,
        emoji: movingItem.emoji,
      });
    } finally {
      setIsReordering(false);
    }
  };

  const handleSubmitMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName || isSavingMember) return;

    setIsSavingMember(true);
    try {
      await upsertHouseholdProfile({
        id: editorMode === 'edit' && editingProfileId ? editingProfileId : undefined,
        name: trimmedName,
        role: formRole,
        color: resolveProfileColorHex(formColor),
        avatarDataUrl: draftAvatarDataUrl,
        emoji: formEmoji.trim() || '',
      });
      showTransientStatus(
        editorMode === 'edit' ? `Updated ${trimmedName}.` : `Added ${trimmedName} to household.`
      );
      closeEditorForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save household member.';
      showTransientStatus(msg, 'warn');
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleConfirmDelete = async (profile: HouseholdProfile) => {
    if (profiles.length <= 1) {
      showTransientStatus('At least one household profile must remain.', 'warn');
      setConfirmDeleteId(null);
      return;
    }

    await deleteHouseholdProfile(profile.id);
    if (editingProfileId === profile.id) {
      closeEditorForm();
    }
    setConfirmDeleteId(null);
    showTransientStatus(`Removed ${profile.name}.`);
  };

  const normalizedFormColor = resolveProfileColorHex(formColor);
  const activePaletteEntry = HOUSEHOLD_PROFILE_PALETTE.find(
    (entry) => entry.hex.toLowerCase() === normalizedFormColor.toLowerCase()
  );
  const editorAvatarTargetId =
    editorMode === 'edit' && editingProfileId ? editingProfileId : DRAFT_AVATAR_TARGET;

  const kidsCount = profiles.filter((p) => p.role === 'kid').length;
  const parentsCount = profiles.filter((p) => p.role === 'parent').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="household-profiles-modal-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-5"
      onMouseDown={(e) => {
        backdropPointerDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPointerDownRef.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropPointerDownRef.current = false;
      }}
    >
      {/* Hidden File Inputs for Library / Camera 256x256 WebP Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        onChange={handleFileSelected}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        capture="user"
        onChange={handleFileSelected}
        className="hidden"
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#6b8f71]/20 border border-[#6b8f71]/40 flex items-center justify-center text-[#a8cbb0] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="household-profiles-modal-title"
                className="text-base font-semibold text-slate-100 tracking-tight truncate"
              >
                Household Profiles &amp; Avatar Studio
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {profiles.length} {profiles.length === 1 ? 'member' : 'members'} ({kidsCount}{' '}
                {kidsCount === 1 ? 'kid' : 'kids'}, {parentsCount}{' '}
                {parentsCount === 1 ? 'parent' : 'parents'}) • Shared across Chores &amp; Meals
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {editorMode === 'closed' && (
              <button
                type="button"
                onClick={openAddForm}
                className="min-h-[44px] px-4 rounded-xl bg-[#6b8f71] hover:bg-[#789d7e] text-white border border-white/15 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Household Profiles Modal"
              className="min-w-[44px] min-h-[44px] rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 border border-transparent hover:border-white/10 inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {statusBanner && (
            <div
              role="status"
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
                statusBanner.tone === 'warn'
                  ? 'bg-[#c99b66]/15 border-[#c99b66]/40 text-[#ebd1b0]'
                  : 'bg-[#6b8f71]/15 border-[#6b8f71]/40 text-[#cce3d0]'
              }`}
            >
              <span>{statusBanner.message}</span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="min-w-[44px] min-h-[44px] -my-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-200 inline-flex items-center justify-center cursor-pointer"
                aria-label="Dismiss status message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Add / Edit Member Studio Form */}
          {editorMode !== 'closed' && (
            <form
              onSubmit={handleSubmitMember}
              className="p-4 sm:p-5 rounded-2xl bg-slate-950/75 border border-slate-700/60 space-y-4"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#a8cbb0]" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    {editorMode === 'edit' ? 'Edit Household Member' : 'New Household Member'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeEditorForm}
                  className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {/* Live Circular Avatar Upload & Preview Row */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3.5 rounded-xl bg-slate-900/80 border border-white/10">
                <div className="flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => triggerFilePicker(editorAvatarTargetId, false)}
                    title="Click or tap to upload avatar photo"
                    className="relative group rounded-full min-w-[64px] min-h-[64px] inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#6b8f71] cursor-pointer shrink-0"
                  >
                    <ProfileAvatar
                      profile={{
                        id: editingProfileId || undefined,
                        name: formName.trim() || 'Member',
                        color: normalizedFormColor,
                        avatarDataUrl: draftAvatarDataUrl,
                      }}
                      size="xl"
                      showRing
                    />
                    <span className="absolute inset-0 rounded-full bg-slate-950/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Camera className="w-5 h-5" />
                    </span>
                  </button>

                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200">
                      Profile Photo (256×256 WebP)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tap avatar to upload JPEG, PNG, WebP, or iPhone HEIC. Fallback initials:{' '}
                      <span className="font-mono text-slate-200">
                        {getProfileInitials(formName || 'Member')}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => triggerFilePicker(editorAvatarTargetId, false)}
                    className="min-h-[44px] px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-slate-700/60 text-xs font-medium text-slate-100 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#a8cbb0]" />
                    <span>{draftAvatarDataUrl ? 'Change' : 'Upload'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerFilePicker(editorAvatarTargetId, true)}
                    className="min-h-[44px] px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-slate-700/60 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Capture photo with device camera"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#9ab4c7]" />
                    <span>Camera</span>
                  </button>

                  {draftAvatarDataUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          isCropModalOpenRef.current = true;
                          setCropModalState({
                            targetId: editorAvatarTargetId,
                            previewUrl: draftAvatarDataUrl,
                            profileName: formName.trim() || 'Family Member',
                            profileColor: normalizedFormColor,
                          });
                        }}
                        className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-slate-700/60 text-xs font-medium text-[#ebd1b0] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Crop className="w-3.5 h-3.5" />
                        <span>Crop</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleClearAvatar(editorAvatarTargetId)}
                        className="min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Remove photo and fall back to initials"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Initials</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Name & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="household-member-name"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    Display Name
                  </label>
                  <input
                    id="household-member-name"
                    type="text"
                    required
                    maxLength={40}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Alex, Maya, Mom, Dad"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-900 border border-slate-700/70 focus:border-[#6b8f71] focus:outline-none text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-300 mb-1.5">
                    Household Role
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormRole('kid')}
                      className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        formRole === 'kid'
                          ? 'bg-[#6b8f71]/25 border-[#6b8f71] text-[#d7eadb]'
                          : 'bg-slate-900 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Kid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormRole('parent')}
                      className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        formRole === 'parent'
                          ? 'bg-[#c99b66]/25 border-[#c99b66] text-[#f2dec4]'
                          : 'bg-slate-900 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Parent</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Calm Science Color Swatch Picker */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-300">
                    Calm Science Accent Color
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {activePaletteEntry ? activePaletteEntry.name : normalizedFormColor}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {HOUSEHOLD_PROFILE_PALETTE.map((swatch) => {
                    const isSelected =
                      normalizedFormColor.toLowerCase() === swatch.hex.toLowerCase();
                    return (
                      <button
                        key={swatch.token}
                        type="button"
                        onClick={() => setFormColor(swatch.hex)}
                        title={swatch.name}
                        aria-label={`Select ${swatch.name}`}
                        aria-pressed={isSelected}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-slate-100 scale-105 shadow-md'
                            : 'border-white/10 opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: swatch.hex }}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Emoji Picker */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-300">
                    Optional Member Emoji{' '}
                    <span className="text-slate-500 font-normal">(or leave blank)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formEmoji}
                      onChange={(e) => setFormEmoji(extractSingleGrapheme(e.target.value))}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="None"
                      aria-label="Custom emoji"
                      className="w-16 min-h-[44px] px-2 rounded-xl bg-slate-900 border border-slate-700/70 focus:border-[#6b8f71] text-center text-base text-slate-100 focus:outline-none"
                    />
                    {formEmoji && (
                      <button
                        type="button"
                        onClick={() => setFormEmoji('')}
                        className="min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        Clear Emoji
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {CALM_EMOJI_PRESETS.map((emoji) => {
                    const active = formEmoji === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setFormEmoji(active ? '' : emoji)}
                        aria-label={`Select emoji ${emoji}`}
                        aria-pressed={active}
                        className={`w-11 h-11 rounded-xl text-lg flex items-center justify-center border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#648296]/30 border-[#648296] text-white'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={closeEditorForm}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formName.trim() || isSavingMember}
                  className="min-h-[44px] px-5 rounded-xl bg-[#6b8f71] hover:bg-[#789d7e] disabled:opacity-50 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSavingMember
                      ? 'Saving...'
                      : editorMode === 'edit'
                        ? 'Save Changes'
                        : 'Create Member'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Ordered Household Members List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Display Order &amp; Members
              </span>
              <span className="text-[11px] text-slate-500">
                Tap avatar to change photo • Use arrows to reorder
              </span>
            </div>

            {profiles.map((hp, index) => {
              const accentHex = resolveProfileColorHex(hp.color);
              const isConfirmingDelete = confirmDeleteId === hp.id;
              const isCurrentlyEditing = editorMode === 'edit' && editingProfileId === hp.id;

              return (
                <div
                  key={hp.id}
                  className={`p-3.5 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrentlyEditing
                      ? 'bg-slate-800/70 border-[#6b8f71]/60'
                      : 'bg-slate-800/40 border-slate-700/60 hover:border-white/15'
                  }`}
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor: accentHex,
                  }}
                >
                  {/* Left: Tappable Avatar + Name + Role + Quick Photo Actions */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => triggerFilePicker(hp.id, false)}
                      title={`Change ${hp.name}'s photo`}
                      aria-label={`Upload or change ${hp.name}'s avatar photo`}
                      className="relative group rounded-full min-w-[52px] min-h-[52px] inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#6b8f71] cursor-pointer shrink-0"
                    >
                      <ProfileAvatar profile={hp} size="lg" showRing />
                      <span className="absolute inset-0 rounded-full bg-slate-950/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Camera className="w-4 h-4" />
                      </span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100 truncate">
                          {hp.name}
                        </span>
                        {hp.emoji && (
                          <span className="text-sm leading-none" aria-hidden="true">
                            {hp.emoji}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${
                            hp.role === 'parent'
                              ? 'bg-[#c99b66]/20 text-[#ebd1b0] border-[#c99b66]/40'
                              : 'bg-[#6b8f71]/20 text-[#cce3d0] border-[#6b8f71]/40'
                          }`}
                        >
                          {hp.role === 'parent' ? 'Parent' : 'Kid'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">#{index + 1}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() => triggerFilePicker(hp.id, false)}
                          className="min-h-[44px] px-3 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-white/10 text-xs font-medium text-slate-300 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-[#a8cbb0]" />
                          <span>{hp.avatarDataUrl ? 'Replace Photo' : 'Upload Photo'}</span>
                        </button>

                        {hp.avatarDataUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                isCropModalOpenRef.current = true;
                                setCropModalState({
                                  targetId: hp.id,
                                  previewUrl: hp.avatarDataUrl!,
                                  profileName: hp.name,
                                  profileColor: accentHex,
                                });
                              }}
                              className="min-h-[44px] px-3 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-white/10 text-xs font-medium text-[#ebd1b0] inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Crop className="w-3.5 h-3.5" />
                              <span>Crop</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleClearAvatar(hp.id)}
                              className="min-h-[44px] px-3 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-white/10 text-xs font-medium text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Initials ({getProfileInitials(hp.name)})</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Reorder Up/Down + Edit + Delete Controls (>= 44px Touch Targets) */}
                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(hp)}
                          className="min-h-[44px] px-3.5 rounded-xl bg-[#b5838d]/25 hover:bg-[#b5838d]/35 border border-[#b5838d]/50 text-xs font-semibold text-[#f3dce1] cursor-pointer"
                        >
                          Confirm Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={index === 0 || isReordering}
                          onClick={() => handleMoveProfile(index, -1)}
                          title={`Move ${hp.name} up`}
                          aria-label={`Move ${hp.name} up`}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900/70 hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none border border-white/10 text-slate-300 hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          disabled={index === profiles.length - 1 || isReordering}
                          onClick={() => handleMoveProfile(index, 1)}
                          title={`Move ${hp.name} down`}
                          aria-label={`Move ${hp.name} down`}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900/70 hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none border border-white/10 text-slate-300 hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditForm(hp)}
                          title={`Edit ${hp.name}`}
                          aria-label={`Edit ${hp.name}`}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900/70 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          disabled={profiles.length <= 1}
                          onClick={() => setConfirmDeleteId(hp.id)}
                          title={
                            profiles.length <= 1
                              ? 'At least one household profile is required'
                              : `Remove ${hp.name}`
                          }
                          aria-label={`Remove ${hp.name}`}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900/70 hover:bg-[#b5838d]/20 disabled:opacity-35 disabled:pointer-events-none border border-white/10 hover:border-[#b5838d]/40 text-slate-400 hover:text-[#eccfd5] inline-flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/10 bg-slate-950/60 shrink-0">
          <span className="text-[11px] text-slate-400">
            Avatars compress locally to circular 256×256 WebP for instant offline &amp; cloud sync.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-slate-100 transition-colors cursor-pointer shrink-0"
          >
            Done
          </button>
        </div>
      </div>

      {/* Circular 256x256 Interactive Pan / Zoom / Rotate Crop Modal */}
      <AvatarCropModal
        isOpen={Boolean(cropModalState)}
        imageUrl={cropModalState?.previewUrl || null}
        profileName={cropModalState?.profileName || 'Family Member'}
        profileColor={cropModalState?.profileColor || '#6b8f71'}
        onCancel={closeCropModal}
        onSave={handleSaveCroppedAvatar}
      />
    </div>
  );
};

export default HouseholdProfilesModal;
