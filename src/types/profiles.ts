export type HouseholdRole = 'parent' | 'kid';

export interface HouseholdProfile {
  id: string;                 // UUID or slug (e.g., 'p_parent_1', 'p_kid_1')
  name: string;
  role: HouseholdRole;        // Controls whether profile appears in Kid Chore/Reward views vs. Admin/Kanban
  color: string;              // Calming palette hex/token (Sage, Slate, Dusty Rose, Lavender-Gray, Soft Amber)
  avatarDataUrl?: string;     // Compressed 256x256 WebP Data URL
  emoji?: string;             // Optional selectable icon fallback when no photo is uploaded
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/**
 * Calming, desaturated low-arousal palette for household profiles.
 */
export const HOUSEHOLD_PROFILE_PALETTE = [
  { name: 'Sage Green', hex: '#6b8f71' },
  { name: 'Slate Blue', hex: '#648296' },
  { name: 'Dusty Rose', hex: '#b5838d' },
  { name: 'Lavender-Gray', hex: '#8b7fa8' },
  { name: 'Soft Amber', hex: '#c99b66' },
  { name: 'Seafoam Slate', hex: '#5c8d89' },
  { name: 'Soft Terracotta', hex: '#c47d68' },
  { name: 'Warm Greige', hex: '#8c857b' },
] as const;
