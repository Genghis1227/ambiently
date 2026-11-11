import type { HouseholdRole } from './profiles';

export type CadenceType = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'interval' | 'bounty';
export type OverduePolicy = 'zero' | 'half' | 'full' | 'custom';

export interface Profile {
  id: string;
  name: string;
  role?: HouseholdRole;
  color: string;
  avatarUrl?: string;
  avatarDataUrl?: string;
  emoji?: string;
  balance: number;        // Spendable points
  lifetimePoints: number; // Cumulative all-time points
}

export interface ChoreTemplate {
  id: string;
  title: string;
  points: number;
  assignedTo: string | 'shared';
  cadence: CadenceType;
  daysOfWeek?: number[];
  /** When true on a 'weekly' cadence, the chore can be done any day of the week (1x per week max) */
  weeklyAnyDay?: boolean;
  intervalDays?: number;
  intervalAnchorDate?: string; // "YYYY-MM-DD" anchor for interval cadence
  requiresApproval: boolean;
  rolloverUntilDone: boolean;
  overduePolicy: OverduePolicy;
  overdueCustomPct?: number;
  icon?: string;
}

export interface ActiveChoreInstance {
  instanceId: string; // e.g., `${choreId}_${YYYY-MM-DD}`
  choreId: string;
  dateScheduled: string; // "YYYY-MM-DD"
  status: 'pending' | 'awaiting_approval' | 'completed' | 'expired';
  completedBy?: { profileId: string; pointsAwarded: number }[]; // Supports whole-number splits
  completedAt?: string;
  isOverdue: boolean;
}

export interface WishlistReward {
  id: string;
  profileId: string;
  title: string;
  sourceUrl?: string;
  imageUrl?: string;
  rawPrice?: number;
  pointsCost: number;
  status: 'needs_pricing' | 'active_goal' | 'unlocked' | 'pending_fulfillment' | 'fulfilled';
  createdAt: string;
  pricedAt?: string;
  fulfilledAt?: string;
}

export interface TrophyItem {
  id: string;
  year: number;
  profileId: string;
  itemName: string;
  pointsSpent: number;
  dateFulfilled: string;
  imageUrl?: string;  // Stripped after calendar year rollover
  sourceUrl?: string; // Stripped after calendar year rollover
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  type: 'chore_completion' | 'reward_redemption' | 'manual_adjustment' | 'reversion';
  refId: string;
  profileId: string;
  pointsDelta: number;
  note?: string;
  approvedBy?: 'pin' | 'auto';
  canRevert: boolean;
}

export interface ChoreHouseholdSettings {
  vacationMode: boolean;
  pointsPerDollar: number; // e.g. 10 ($1 = 10 pts)
  soundEffectsEnabled: boolean; // default false
  lastRolloverDate?: string; // "YYYY-MM-DD"
  lastPrunedYear?: number;
}

export interface ChoreEngineSnapshot {
  id: 'household_chores';
  profiles: Profile[];
  templates: ChoreTemplate[];
  instances: ActiveChoreInstance[];
  rewards: WishlistReward[];
  trophies: TrophyItem[];
  ledger: LedgerEntry[];
  householdSettings: ChoreHouseholdSettings;
  lastParentActionAt?: string;
  updated_at: string;
}

export interface ChoreWidgetConfig {
  scope?: 'household' | string; // 'household' or a specific Profile.id
  defaultExpandedSections?: ('today' | 'review' | 'completed')[];
  displayMode?: 'tile' | 'hub'; // 'tile' = compact Bento card, 'hub' = full-screen 3-column Chore & Reward Hub on canvas
}
