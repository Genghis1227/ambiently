export type HouseholdRole = 'parent' | 'kid';

/**
 * Calming, desaturated low-arousal Calm Science palette tokens/hexes for household profiles.
 */
export const HOUSEHOLD_PROFILE_PALETTE = [
  { token: 'sage', name: 'Sage Green', hex: '#6b8f71' },
  { token: 'slate', name: 'Slate Blue', hex: '#648296' },
  { token: 'dusty_rose', name: 'Dusty Rose', hex: '#b5838d' },
  { token: 'lavender_gray', name: 'Lavender-Gray', hex: '#8b7fa8' },
  { token: 'soft_amber', name: 'Soft Amber', hex: '#c99b66' },
  { token: 'seafoam_slate', name: 'Seafoam Slate', hex: '#5c8d89' },
  { token: 'soft_terracotta', name: 'Soft Terracotta', hex: '#c47d68' },
  { token: 'warm_greige', name: 'Warm Greige', hex: '#8c857b' },
] as const;

export type CalmSciencePaletteToken = (typeof HOUSEHOLD_PROFILE_PALETTE)[number]['token'];

export interface HouseholdProfile {
  id: string;                 // UUID or slug (e.g., 'p_parent_1', 'p_kid_1')
  name: string;
  role: HouseholdRole;        // Controls whether profile appears in Kid Chore/Reward views vs. Admin/Kanban
  color: string;              // Calm Science palette token or hex (e.g., '#6b8f71')
  avatarDataUrl?: string;     // Compressed 256x256 Base64 WebP Data URL
  emoji?: string;             // Optional selectable icon fallback when no photo is uploaded
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/**
 * Resolves either a Calm Science palette token (e.g. 'sage') or hex string to a valid hex color.
 */
export function resolveProfileColorHex(colorOrToken: string | undefined): string {
  if (!colorOrToken) return '#6b8f71';
  const trimmed = colorOrToken.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('rgb') || trimmed.startsWith('hsl')) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  const match = HOUSEHOLD_PROFILE_PALETTE.find(
    (entry) => entry.token === lower || entry.name.toLowerCase() === lower
  );
  return match ? match.hex : '#6b8f71';
}
