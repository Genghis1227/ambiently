export const MAX_FOLLOWED_TEAMS = 12;

export type SportsLeagueId =
  | 'nfl'
  | 'nba'
  | 'mlb'
  | 'nhl'
  | 'mls'
  | 'epl'
  | 'ncaaf'
  | 'ncaab';

export interface SportsLeagueMeta {
  id: SportsLeagueId;
  label: string;
  shortLabel: string;
  sport: string;
  espnLeague: string;
  extraQuery?: string;
}

export const SPORTS_LEAGUE_META: Record<SportsLeagueId, SportsLeagueMeta> = {
  nfl: {
    id: 'nfl',
    label: 'NFL',
    shortLabel: 'NFL',
    sport: 'football',
    espnLeague: 'nfl',
  },
  nba: {
    id: 'nba',
    label: 'NBA',
    shortLabel: 'NBA',
    sport: 'basketball',
    espnLeague: 'nba',
  },
  mlb: {
    id: 'mlb',
    label: 'MLB',
    shortLabel: 'MLB',
    sport: 'baseball',
    espnLeague: 'mlb',
  },
  nhl: {
    id: 'nhl',
    label: 'NHL',
    shortLabel: 'NHL',
    sport: 'hockey',
    espnLeague: 'nhl',
  },
  mls: {
    id: 'mls',
    label: 'MLS',
    shortLabel: 'MLS',
    sport: 'soccer',
    espnLeague: 'usa.1',
  },
  epl: {
    id: 'epl',
    label: 'Premier League',
    shortLabel: 'EPL',
    sport: 'soccer',
    espnLeague: 'eng.1',
  },
  ncaaf: {
    id: 'ncaaf',
    label: 'NCAA Football',
    shortLabel: 'NCAAF',
    sport: 'football',
    espnLeague: 'college-football',
    extraQuery: 'groups=80&limit=100',
  },
  ncaab: {
    id: 'ncaab',
    label: 'NCAA Basketball',
    shortLabel: 'NCAAB',
    sport: 'basketball',
    espnLeague: 'mens-college-basketball',
    extraQuery: 'groups=50&limit=100',
  },
};

export const DEFAULT_SPORTS_LEAGUES: SportsLeagueId[] = ['nfl', 'nba'];

export type SportsGameState = 'PRE' | 'LIVE' | 'FINAL' | 'POSTPONED';
export type SportsDisplayMode = 'auto' | 'single' | 'grid' | 'ticker';

export interface SportsTeamSummary {
  id: string;
  abbreviation: string;
  name: string;
  shortDisplayName: string;
  color?: string;
  logoUrl?: string;
  record?: string;
  score: number | null;
  isWinner?: boolean;
}

export interface SportsGame {
  id: string;
  league: SportsLeagueId;
  leagueLabel: string;
  state: SportsGameState;
  statusDetail: string;
  shortDetail: string;
  period?: number;
  displayClock?: string;
  startTime: string;
  venue?: string;
  broadcast?: string;
  homeTeam: SportsTeamSummary;
  awayTeam: SportsTeamSummary;
  situationText?: string;
}

export interface SportsFollowedTeam {
  league: SportsLeagueId;
  abbreviation: string;
  name: string;
  color?: string;
  logoUrl?: string;
}

export interface SportsTeamOption {
  league: SportsLeagueId;
  id: string;
  abbreviation: string;
  name: string;
  shortDisplayName: string;
  color?: string;
  logoUrl?: string;
}

export interface SportsWidgetConfig {
  leagues?: SportsLeagueId[];
  followedTeams?: SportsFollowedTeam[];
  showOnlyFollowedTeams?: boolean;
  displayMode?: SportsDisplayMode;
  showRecords?: boolean;
  showBroadcast?: boolean;
  refreshIntervalMin?: 1 | 2 | 5 | 15;
  themeMode?: 'auto' | 'light' | 'dark';
  transparentBg?: boolean;
}

export type DiscoveryTabMode = 'rotate' | 'trivia' | 'word' | 'on_this_day';
export type DiscoveryActiveSection = 'trivia' | 'word' | 'on_this_day';
export type DiscoveryTriviaCategory =
  | 'all'
  | 'science'
  | 'history'
  | 'nature'
  | 'geography'
  | 'wordplay';

export interface DiscoveryTriviaItem {
  id: string;
  category: Exclude<DiscoveryTriviaCategory, 'all'>;
  kind: 'trivia' | 'riddle';
  prompt: string;
  answer: string;
  funFact: string;
}

export interface DiscoveryWordItem {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  origin?: string;
}

export interface DiscoveryHistoryEvent {
  year: number;
  text: string;
  articleTitle?: string;
  articleUrl?: string;
  thumbnailUrl?: string;
}

export interface DailyDiscoveryApiPayload {
  month: number;
  day: number;
  source: 'wikimedia' | 'fallback';
  events: DiscoveryHistoryEvent[];
  updatedAt: string;
}

export interface DailyDiscoveryWidgetConfig {
  mode?: DiscoveryTabMode;
  triviaCategory?: DiscoveryTriviaCategory;
  autoRotateSec?: 0 | 15 | 30 | 60;
  autoRevealAnswer?: boolean;
  themeMode?: 'auto' | 'light' | 'dark';
  transparentBg?: boolean;
}
