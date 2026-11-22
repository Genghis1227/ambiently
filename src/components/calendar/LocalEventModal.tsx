import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Clock, MapPin, Pencil, Trash2, Users, X } from 'lucide-react';
import { LOCAL_EVENT_COLORS, type LocalFamilyEvent } from '../../types/calendarEvents';
import type { HouseholdProfile } from '../../types/profiles';
import { createBackdropDismissHandlers } from '../../utils/modalBackdropGuard';
import { ProfileAvatar } from '../common/ProfileAvatar';

export interface LocalEventFormInput {
  id?: string;
  title: string;
  date: string;
  endDate?: string;
  isAllDay: boolean;
  startTime?: string;
  endTime?: string;
  color: string;
  profileIds?: string[];
  location?: string;
  notes?: string;
}

interface LocalEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: Date | null;
  editingEvent?: LocalFamilyEvent | null;
  profiles: HouseholdProfile[];
  onSave: (input: LocalEventFormInput) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}

function toLocalDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface LocalEventModalContentProps {
  onClose: () => void;
  initialDate?: Date | null;
  editingEvent?: LocalFamilyEvent | null;
  profiles: HouseholdProfile[];
  onSave: (input: LocalEventFormInput) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}

const LocalEventModalContent: React.FC<LocalEventModalContentProps> = ({
  onClose,
  initialDate,
  editingEvent,
  profiles,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState(() => editingEvent?.title ?? '');
  const [date, setDate] = useState(
    () => editingEvent?.date ?? toLocalDateInput(initialDate || new Date())
  );
  const [endDate, setEndDate] = useState(
    () =>
      editingEvent?.endDate ??
      editingEvent?.date ??
      toLocalDateInput(initialDate || new Date())
  );
  const [isAllDay, setIsAllDay] = useState(() => editingEvent?.isAllDay ?? true);
  const [startTime, setStartTime] = useState(() => editingEvent?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(() => editingEvent?.endTime ?? '10:00');
  const [color, setColor] = useState(() => editingEvent?.color ?? LOCAL_EVENT_COLORS[0]);
  const [profileIds, setProfileIds] = useState<string[]>(() => editingEvent?.profileIds ?? []);
  const [location, setLocation] = useState(() => editingEvent?.location ?? '');
  const [notes, setNotes] = useState(() => editingEvent?.notes ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeProfiles = profiles.filter((p) => !p.deletedAt);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const toggleProfile = (profileId: string) => {
    setProfileIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg('Please enter an event title.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErrorMsg('Please choose a valid start date.');
      return;
    }

    const resolvedEndDate =
      endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate > date ? endDate : undefined;

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onSave({
        id: editingEvent?.id,
        title: trimmedTitle,
        date,
        endDate: resolvedEndDate,
        isAllDay,
        startTime: isAllDay ? undefined : startTime || '09:00',
        endTime: isAllDay ? undefined : endTime || undefined,
        color,
        profileIds,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save event.');
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent || !onDelete || isSaving) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsSaving(true);
    try {
      await onDelete(editingEvent.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete event.');
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editingEvent ? 'Edit family event' : 'Add family event'}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 cursor-pointer"
      {...createBackdropDismissHandlers(onClose)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden cursor-default animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 bg-gray-950/70 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
              {editingEvent ? (
                <Pencil className="w-4 h-4" />
              ) : (
                <CalendarPlus className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {editingEvent ? 'Edit Family Event' : 'Add Family Event'}
              </h2>
              <p className="text-[11px] text-gray-400">
                Saved directly on your synced household calendar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close family event dialog"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Event Title
            </label>
            <input
              type="text"
              autoFocus
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Soccer practice, Dentist checkup, Family dinner"
              className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-500/70"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  const next = e.target.value;
                  setDate(next);
                  if (!endDate || endDate < next) {
                    setEndDate(next);
                  }
                }}
                className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500/70"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500/70"
              />
            </div>
          </div>

          {/* All-day + Time row */}
          <div className="rounded-xl bg-gray-950/60 border border-gray-800/90 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-200 font-medium">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span>All-Day Event</span>
              </div>
              <button
                type="button"
                aria-pressed={isAllDay}
                onClick={() => setIsAllDay((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  isAllDay ? 'bg-teal-500' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isAllDay ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {!isAllDay && (
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-800/80">
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg bg-gray-900 border border-gray-700 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500/70"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg bg-gray-900 border border-gray-700 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500/70"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Color Tag */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Color Accent
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {LOCAL_EVENT_COLORS.map((hex) => {
                const selected = color.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColor(hex)}
                    aria-label={`Color ${hex}`}
                    aria-pressed={selected}
                    className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                      selected
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
            </div>
          </div>

          {/* Household Members */}
          {activeProfiles.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                <Users className="w-3.5 h-3.5" />
                <span>Household Members</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {activeProfiles.map((profile) => {
                  const isSelected = profileIds.includes(profile.id);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => toggleProfile(profile.id)}
                      aria-pressed={isSelected}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/20 border-teal-500/60 text-teal-100'
                          : 'bg-gray-950/70 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                      }`}
                    >
                      <ProfileAvatar profile={profile} size="xs" />
                      <span>{profile.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Location & Notes */}
          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>Location (optional)</span>
              </label>
              <input
                type="text"
                maxLength={160}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Community Field #2"
                className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-teal-500/70"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Notes (optional)
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bring water bottle, snacks, etc."
                className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3.5 py-2 text-xs text-white placeholder-gray-500 resize-none focus:outline-none focus:border-teal-500/70"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/35 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-2 border-t border-gray-800 flex items-center justify-between gap-3">
            <div>
              {editingEvent && onDelete && (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isSaving}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    confirmDelete
                      ? 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{confirmDelete ? 'Confirm Delete' : 'Delete'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                {isSaving ? 'Saving...' : editingEvent ? 'Save Changes' : 'Add Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export const LocalEventModal: React.FC<LocalEventModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  editingEvent,
  profiles,
  onSave,
  onDelete,
}) => {
  if (!isOpen) return null;
  const resetKey = editingEvent?.id ?? (initialDate ? `new:${toLocalDateInput(initialDate)}` : 'new');

  return (
    <LocalEventModalContent
      key={resetKey}
      onClose={onClose}
      initialDate={initialDate}
      editingEvent={editingEvent}
      profiles={profiles}
      onSave={onSave}
      onDelete={onDelete}
    />
  );
};
