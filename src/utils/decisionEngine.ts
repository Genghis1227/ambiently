import type { DecisionOption } from '../types/phase2Widgets';
import { MAX_DECISION_OPTIONS } from '../types/phase2Widgets';
import type { Recipe } from '../types/meals';
import { resolveProfileColorHex, type HouseholdProfile } from '../types/profiles';

export const DECISION_WHEEL_PALETTE = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
] as const;

export const DEFAULT_DECISION_OPTIONS: DecisionOption[] = [
  { id: 'opt-tacos', label: 'Tacos', emoji: '🌮', color: DECISION_WHEEL_PALETTE[0], sourceType: 'custom' },
  { id: 'opt-pizza', label: 'Pizza Night', emoji: '🍕', color: DECISION_WHEEL_PALETTE[1], sourceType: 'custom' },
  { id: 'opt-pasta', label: 'Pasta', emoji: '🍝', color: DECISION_WHEEL_PALETTE[2], sourceType: 'custom' },
  { id: 'opt-sushi', label: 'Sushi / Poke', emoji: '🍣', color: DECISION_WHEEL_PALETTE[3], sourceType: 'custom' },
  { id: 'opt-burgers', label: 'Burgers', emoji: '🍔', color: DECISION_WHEEL_PALETTE[4], sourceType: 'custom' },
];

export interface DecisionStarterPreset {
  id: string;
  label: string;
  prompt: string;
  options: Array<{ label: string; emoji?: string }>;
}

export const DECISION_STARTER_PRESETS: DecisionStarterPreset[] = [
  {
    id: 'dinner',
    label: 'Dinner Tonight',
    prompt: "What's for dinner tonight?",
    options: [
      { label: 'Tacos', emoji: '🌮' },
      { label: 'Pizza Night', emoji: '🍕' },
      { label: 'Pasta', emoji: '🍝' },
      { label: 'Sushi / Poke', emoji: '🍣' },
      { label: 'Burgers', emoji: '🍔' },
    ],
  },
  {
    id: 'movie',
    label: 'Family Movie Night',
    prompt: 'Which genre for Movie Night?',
    options: [
      { label: 'Animated Classic', emoji: '🦁' },
      { label: 'Comedy', emoji: '😂' },
      { label: 'Sci-Fi Adventure', emoji: '🚀' },
      { label: 'Mystery', emoji: '🕵️' },
      { label: 'Nature Doc', emoji: '🌍' },
    ],
  },
  {
    id: 'weekend',
    label: 'Weekend Outing',
    prompt: 'Where are we headed this weekend?',
    options: [
      { label: 'Park & Picnic', emoji: '🧺' },
      { label: 'Museum', emoji: '🏛️' },
      { label: 'Board Game Café', emoji: '🎲' },
      { label: 'Bike Trail', emoji: '🚲' },
      { label: 'Ice Cream Walk', emoji: '🍦' },
    ],
  },
];

export function resolveDecisionOptions(raw?: unknown): DecisionOption[] {
  if (raw === undefined) {
    return DEFAULT_DECISION_OPTIONS.map((opt) => ({ ...opt }));
  }
  if (!Array.isArray(raw)) return [];

  const resolved: DecisionOption[] = [];
  for (let i = 0; i < raw.length && resolved.length < MAX_DECISION_OPTIONS; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<DecisionOption>;
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 60) : '';
    if (!label) continue;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `opt-${i + 1}`;
    const color =
      typeof item.color === 'string' && item.color.trim()
        ? item.color.trim()
        : DECISION_WHEEL_PALETTE[resolved.length % DECISION_WHEEL_PALETTE.length];
    const emoji = typeof item.emoji === 'string' && item.emoji.trim()
      ? item.emoji.trim().slice(0, 8)
      : undefined;

    resolved.push({
      id,
      label,
      color,
      ...(emoji ? { emoji } : {}),
      ...(item.sourceType ? { sourceType: item.sourceType } : {}),
      ...(item.sourceId ? { sourceId: item.sourceId } : {}),
    });
  }
  return resolved;
}

export function pickRandomOptionIndex(count: number, randomFloat?: number): number {
  if (count <= 0) return -1;
  let value: number;
  if (typeof randomFloat === 'number' && Number.isFinite(randomFloat)) {
    value = Math.max(0, Math.min(0.999999999, randomFloat));
  } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    value = arr[0] / 4294967296;
  } else {
    value = Math.random();
  }
  return Math.min(count - 1, Math.floor(value * count));
}

/**
 * Computes a clockwise CSS rotation angle from `currentRotationDeg` that completes
 * `extraSpins` full turns and lands squarely inside slice `winnerIndex` under the top 12 o'clock pointer.
 */
export function computeWheelSpinTargetDeg(
  currentRotationDeg: number,
  winnerIndex: number,
  totalSlices: number,
  extraSpins: number = 5,
  jitterRatio: number = 0.5
): number {
  if (totalSlices <= 0) return currentRotationDeg;
  const clampedIdx = ((winnerIndex % totalSlices) + totalSlices) % totalSlices;
  const sliceDeg = 360 / totalSlices;
  const safeJitter = Math.max(0.2, Math.min(0.8, jitterRatio));
  const slicePointDeg = (clampedIdx + safeJitter) * sliceDeg;
  const targetMod = (360 - (slicePointDeg % 360)) % 360;
  const base = currentRotationDeg + Math.max(1, extraSpins) * 360;
  const currentMod = ((base % 360) + 360) % 360;
  const forwardDelta = (targetMod - currentMod + 360) % 360;
  return base + forwardDelta;
}

export interface WheelSliceGeometry {
  index: number;
  path: string;
  labelX: number;
  labelY: number;
  textRotationDeg: number;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegFromTop: number): { x: number; y: number } {
  const rad = ((angleDegFromTop - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

export function buildWheelSliceGeometry(
  count: number,
  radius: number,
  cx: number,
  cy: number
): WheelSliceGeometry[] {
  if (count <= 0) return [];
  if (count === 1) {
    const path = [
      `M ${cx} ${cy - radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`,
      'Z',
    ].join(' ');
    return [
      {
        index: 0,
        path,
        labelX: cx,
        labelY: cy - radius * 0.45,
        textRotationDeg: 0,
      },
    ];
  }

  const sliceDeg = 360 / count;
  const largeArcFlag = sliceDeg > 180 ? 1 : 0;
  const slices: WheelSliceGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const startAngle = i * sliceDeg;
    const endAngle = (i + 1) * sliceDeg;
    const midAngle = startAngle + sliceDeg / 2;

    const start = polarToCartesian(cx, cy, radius, startAngle);
    const end = polarToCartesian(cx, cy, radius, endAngle);
    const labelPoint = polarToCartesian(cx, cy, radius * 0.62, midAngle);

    const path = [
      `M ${cx} ${cy}`,
      `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
      'Z',
    ].join(' ');

    // Keep text oriented outwards radially while staying upright when convenient
    const textRotationDeg = midAngle > 180 ? midAngle - 270 : midAngle - 90;

    slices.push({
      index: i,
      path,
      labelX: Number(labelPoint.x.toFixed(2)),
      labelY: Number(labelPoint.y.toFixed(2)),
      textRotationDeg: Number(textRotationDeg.toFixed(2)),
    });
  }

  return slices;
}

export function castPollVote(
  votes: Record<string, string[]> | undefined,
  voterKey: string,
  optionId: string,
  allowMultiVote: boolean = false
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  if (votes) {
    for (const [k, list] of Object.entries(votes)) {
      if (Array.isArray(list) && list.length > 0) {
        next[k] = [...list];
      }
    }
  }

  const existing = next[voterKey] || [];
  const hasOption = existing.includes(optionId);

  if (hasOption) {
    const filtered = existing.filter((id) => id !== optionId);
    if (filtered.length > 0) {
      next[voterKey] = filtered;
    } else {
      delete next[voterKey];
    }
    return next;
  }

  next[voterKey] = allowMultiVote ? [...existing, optionId] : [optionId];
  return next;
}

export interface OptionPollTally {
  optionId: string;
  count: number;
  percentage: number;
  voterKeys: string[];
}

export interface PollTallySummary {
  rows: OptionPollTally[];
  totalVotes: number;
  maxVotes: number;
  leadingOptionIds: string[];
  hasTie: boolean;
}

export function tallyPollVotes(
  options: DecisionOption[],
  votes: Record<string, string[]> | undefined
): PollTallySummary {
  const validOptionIds = new Set(options.map((o) => o.id));
  const votersByOption = new Map<string, string[]>();
  for (const id of validOptionIds) {
    votersByOption.set(id, []);
  }

  let totalVotes = 0;
  if (votes) {
    for (const [voterKey, chosenIds] of Object.entries(votes)) {
      if (!Array.isArray(chosenIds)) continue;
      for (const optionId of chosenIds) {
        const bucket = votersByOption.get(optionId);
        if (!bucket || bucket.includes(voterKey)) continue;
        bucket.push(voterKey);
        totalVotes += 1;
      }
    }
  }

  let maxVotes = 0;
  for (const bucket of votersByOption.values()) {
    if (bucket.length > maxVotes) maxVotes = bucket.length;
  }

  const leadingOptionIds: string[] = [];
  const rows: OptionPollTally[] = options.map((opt) => {
    const voterKeys = votersByOption.get(opt.id) || [];
    const count = voterKeys.length;
    if (maxVotes > 0 && count === maxVotes) {
      leadingOptionIds.push(opt.id);
    }
    return {
      optionId: opt.id,
      count,
      percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
      voterKeys,
    };
  });

  return {
    rows,
    totalVotes,
    maxVotes,
    leadingOptionIds,
    hasTie: leadingOptionIds.length > 1,
  };
}

export function importOptionsFromRecipes(
  existing: DecisionOption[],
  recipes: Recipe[],
  favoritesOnly: boolean = false
): DecisionOption[] {
  const result = existing.map((o) => ({ ...o }));
  const seenLabels = new Set(result.map((o) => o.label.trim().toLowerCase()));

  const candidates = recipes.filter(
    (r) => !r.deletedAt && r.title.trim().length > 0 && (!favoritesOnly || r.isFavorite)
  );

  for (const recipe of candidates) {
    if (result.length >= MAX_DECISION_OPTIONS) break;
    const cleanLabel = recipe.title.trim().slice(0, 60);
    const norm = cleanLabel.toLowerCase();
    if (seenLabels.has(norm)) continue;
    seenLabels.add(norm);
    result.push({
      id: `opt-rec-${recipe.id}`,
      label: cleanLabel,
      emoji: recipe.isFavorite ? '⭐' : '🍽️',
      color: DECISION_WHEEL_PALETTE[result.length % DECISION_WHEEL_PALETTE.length],
      sourceType: 'recipe',
      sourceId: recipe.id,
    });
  }
  return result;
}

export function importOptionsFromProfiles(
  existing: DecisionOption[],
  profiles: HouseholdProfile[]
): DecisionOption[] {
  const result = existing.map((o) => ({ ...o }));
  const seenLabels = new Set(result.map((o) => o.label.trim().toLowerCase()));

  const candidates = profiles.filter((p) => !p.deletedAt && p.name.trim().length > 0);
  for (const profile of candidates) {
    if (result.length >= MAX_DECISION_OPTIONS) break;
    const cleanLabel = profile.name.trim().slice(0, 60);
    const norm = cleanLabel.toLowerCase();
    if (seenLabels.has(norm)) continue;
    seenLabels.add(norm);
    result.push({
      id: `opt-prof-${profile.id}`,
      label: cleanLabel,
      ...(profile.emoji ? { emoji: profile.emoji } : {}),
      color: resolveProfileColorHex(profile.color),
      sourceType: 'profile',
      sourceId: profile.id,
    });
  }
  return result;
}
