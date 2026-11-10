import { create } from 'zustand';
import { db, DEFAULT_HOUSEHOLD_PROFILES } from '../services/db';
import type { HouseholdProfile, HouseholdRole } from '../types/profiles';
import { compressAvatarToWebP } from '../utils/avatarCompressor';

let profilePersistListener: ((profiles: HouseholdProfile[]) => void) | null = null;

export function registerProfileSyncListener(
  listener: (profiles: HouseholdProfile[]) => void
): void {
  profilePersistListener = listener;
}

function slugifyProfileId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `p_${base || 'member'}_${suffix}`;
}

export interface ProfileStoreState {
  isInitialized: boolean;
  profiles: HouseholdProfile[];

  initProfileStore: () => Promise<void>;
  upsertHouseholdProfile: (input: {
    id?: string;
    name: string;
    role: HouseholdRole;
    color: string;
    avatarDataUrl?: string;
    emoji?: string;
  }) => Promise<HouseholdProfile>;
  uploadAndSetAvatar: (profileId: string, file: File | Blob) => Promise<string>;
  setProfileAvatarDataUrl: (profileId: string, dataUrl: string) => Promise<void>;
  removeProfileAvatar: (profileId: string) => Promise<void>;
  deleteHouseholdProfile: (profileId: string) => Promise<void>;
  applyRemoteProfiles: (remoteProfiles: HouseholdProfile[]) => Promise<void>;
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  isInitialized: false,
  profiles: DEFAULT_HOUSEHOLD_PROFILES,

  initProfileStore: async () => {
    try {
      const existing = await db.profiles.toArray();
      const active = existing.filter((p) => !p.deletedAt);
      const LEGACY_SAMPLE_IDS = new Set(['p_tony', 'p_anh', 'p_olivia', 'p_alyssa']);
      const isUntouchedLegacySeed =
        active.length > 0 &&
        active.every(
          (p) => LEGACY_SAMPLE_IDS.has(p.id) && p.updatedAt === '1970-01-01T00:00:00.000Z'
        );

      if (existing.length === 0 || isUntouchedLegacySeed) {
        await db.profiles.clear();
        await db.profiles.bulkPut(DEFAULT_HOUSEHOLD_PROFILES);
        set({ profiles: DEFAULT_HOUSEHOLD_PROFILES, isInitialized: true });
        profilePersistListener?.(DEFAULT_HOUSEHOLD_PROFILES);
        return;
      }
      const list = active.length > 0 ? active : DEFAULT_HOUSEHOLD_PROFILES;
      set({ profiles: list, isInitialized: true });
      profilePersistListener?.(list);
    } catch (err) {
      console.warn('Failed to initialize profile store from IndexedDB:', err);
      set({ profiles: DEFAULT_HOUSEHOLD_PROFILES, isInitialized: true });
    }
  },

  upsertHouseholdProfile: async (input) => {
    const nowIso = new Date().toISOString();
    const current = get().profiles;
    const existing = input.id ? current.find((p) => p.id === input.id) : undefined;

    const record: HouseholdProfile = {
      id: existing?.id || input.id || slugifyProfileId(input.name),
      name: input.name.trim() || 'Family Member',
      role: input.role,
      color: input.color,
      avatarDataUrl:
        input.avatarDataUrl !== undefined ? input.avatarDataUrl : existing?.avatarDataUrl,
      emoji: input.emoji !== undefined ? input.emoji : existing?.emoji,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    await db.profiles.put(record);
    const nextProfiles = existing
      ? current.map((p) => (p.id === record.id ? record : p))
      : [...current, record];

    set({ profiles: nextProfiles });
    profilePersistListener?.(nextProfiles);
    return record;
  },

  uploadAndSetAvatar: async (profileId, file) => {
    const dataUrl = await compressAvatarToWebP(file, 256, 0.82);
    const current = get().profiles;
    const target = current.find((p) => p.id === profileId);
    if (!target) {
      throw new Error('Profile not found.');
    }

    const updated: HouseholdProfile = {
      ...target,
      avatarDataUrl: dataUrl,
      updatedAt: new Date().toISOString(),
    };

    await db.profiles.put(updated);
    const nextProfiles = current.map((p) => (p.id === profileId ? updated : p));
    set({ profiles: nextProfiles });
    profilePersistListener?.(nextProfiles);
    return dataUrl;
  },

  setProfileAvatarDataUrl: async (profileId, dataUrl) => {
    const current = get().profiles;
    const target = current.find((p) => p.id === profileId);
    if (!target) {
      throw new Error('Profile not found.');
    }

    const updated: HouseholdProfile = {
      ...target,
      avatarDataUrl: dataUrl,
      updatedAt: new Date().toISOString(),
    };

    await db.profiles.put(updated);
    const nextProfiles = current.map((p) => (p.id === profileId ? updated : p));
    set({ profiles: nextProfiles });
    profilePersistListener?.(nextProfiles);
  },

  removeProfileAvatar: async (profileId) => {
    const current = get().profiles;
    const target = current.find((p) => p.id === profileId);
    if (!target) return;

    const updated: HouseholdProfile = {
      ...target,
      avatarDataUrl: undefined,
      updatedAt: new Date().toISOString(),
    };

    await db.profiles.put(updated);
    const nextProfiles = current.map((p) => (p.id === profileId ? updated : p));
    set({ profiles: nextProfiles });
    profilePersistListener?.(nextProfiles);
  },

  deleteHouseholdProfile: async (profileId) => {
    const nowIso = new Date().toISOString();
    const current = get().profiles;
    const target = current.find((p) => p.id === profileId);
    if (!target) return;

    const tombstone: HouseholdProfile = {
      ...target,
      updatedAt: nowIso,
      deletedAt: nowIso,
    };

    await db.profiles.put(tombstone);
    const nextProfiles = current.filter((p) => p.id !== profileId);
    set({ profiles: nextProfiles });
    profilePersistListener?.(nextProfiles);
  },

  applyRemoteProfiles: async (remoteProfiles) => {
    if (!Array.isArray(remoteProfiles) || remoteProfiles.length === 0) return;

    const LEGACY_SAMPLE_IDS = new Set(['p_tony', 'p_anh', 'p_olivia', 'p_alyssa']);
    const isUntouchedLegacyProfile = (p: HouseholdProfile) =>
      LEGACY_SAMPLE_IDS.has(p.id) && p.updatedAt === '1970-01-01T00:00:00.000Z';

    const localAll = await db.profiles.toArray();
    const legacyIdsToDelete: string[] = [];
    for (const p of localAll) {
      if (isUntouchedLegacyProfile(p)) {
        legacyIdsToDelete.push(p.id);
      }
    }
    if (legacyIdsToDelete.length > 0) {
      await db.profiles.bulkDelete(legacyIdsToDelete);
    }

    const cleanedLocal = localAll.filter((p) => !isUntouchedLegacyProfile(p));
    const localMap = new Map(cleanedLocal.map((p) => [p.id, p]));
    const toPut: HouseholdProfile[] = [];

    for (const remote of remoteProfiles) {
      if (isUntouchedLegacyProfile(remote)) {
        continue;
      }
      const local = localMap.get(remote.id);
      if (!local) {
        toPut.push(remote);
        localMap.set(remote.id, remote);
      } else {
        const localTime = Date.parse(local.updatedAt || '') || 0;
        const remoteTime = Date.parse(remote.updatedAt || '') || 0;
        if (remoteTime >= localTime) {
          toPut.push(remote);
          localMap.set(remote.id, remote);
        }
      }
    }

    if (localMap.size === 0) {
      await db.profiles.bulkPut(DEFAULT_HOUSEHOLD_PROFILES);
      set({ profiles: DEFAULT_HOUSEHOLD_PROFILES });
      profilePersistListener?.(DEFAULT_HOUSEHOLD_PROFILES);
      return;
    }

    if (toPut.length > 0) {
      await db.profiles.bulkPut(toPut);
    }

    const active = Array.from(localMap.values()).filter((p) => !p.deletedAt);
    set({ profiles: active });
    if (legacyIdsToDelete.length > 0 || remoteProfiles.some(isUntouchedLegacyProfile)) {
      profilePersistListener?.(active);
    }
  },
}));
