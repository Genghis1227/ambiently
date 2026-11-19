import {
  DEFAULT_SPORTS_LEAGUES,
  MAX_FOLLOWED_TEAMS,
  SPORTS_LEAGUE_META,
  type SportsDisplayMode,
  type SportsFollowedTeam,
  type SportsGame,
  type SportsLeagueId,
  type SportsTeamOption,
  type SportsWidgetConfig,
} from '../types/phase3Widgets';

const SPORTS_CACHE_STORAGE_KEY = 'ambiently_sports_scoreboard_cache_v1';
const MAX_CLIENT_CACHE_LEAGUES = 16;
const STALE_CLIENT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredLeagueScoreboardEntry {
  games: SportsGame[];
  savedAtMs: number;
}

const memoryScoreboardCache = new Map<SportsLeagueId, StoredLeagueScoreboardEntry>();
let hydratedFromStorage = false;

function hydrateCacheFromStorage(): void {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(SPORTS_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, StoredLeagueScoreboardEntry>;
    if (!parsed || typeof parsed !== 'object') return;
    const cutoff = Date.now() - STALE_CLIENT_CACHE_MAX_AGE_MS;
    for (const [k, entry] of Object.entries(parsed)) {
      if (
        Object.prototype.hasOwnProperty.call(SPORTS_LEAGUE_META, k) &&
        entry &&
        Array.isArray(entry.games) &&
        typeof entry.savedAtMs === 'number' &&
        entry.savedAtMs >= cutoff
      ) {
        memoryScoreboardCache.set(k as SportsLeagueId, entry);
      }
    }
  } catch {
    // Ignore storage corruption
  }
}

function persistCacheToStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const serialized: Record<string, StoredLeagueScoreboardEntry> = {};
    for (const [k, entry] of memoryScoreboardCache.entries()) {
      serialized[k] = entry;
    }
    localStorage.setItem(SPORTS_CACHE_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore quota errors
  }
}

function setCachedLeagueGames(league: SportsLeagueId, games: SportsGame[], nowMs: number): void {
  hydrateCacheFromStorage();
  if (memoryScoreboardCache.has(league)) {
    memoryScoreboardCache.delete(league);
  } else if (memoryScoreboardCache.size >= MAX_CLIENT_CACHE_LEAGUES) {
    const oldest = memoryScoreboardCache.keys().next().value;
    if (oldest) memoryScoreboardCache.delete(oldest);
  }
  memoryScoreboardCache.set(league, { games, savedAtMs: nowMs });
}

export function resolveSportsLeagues(leagues?: unknown): SportsLeagueId[] {
  if (!Array.isArray(leagues)) return [...DEFAULT_SPORTS_LEAGUES];
  const unique: SportsLeagueId[] = [];
  const seen = new Set<SportsLeagueId>();
  for (const item of leagues) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().toLowerCase() as SportsLeagueId;
    if (Object.prototype.hasOwnProperty.call(SPORTS_LEAGUE_META, cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      unique.push(cleaned);
      if (unique.length >= 8) break;
    }
  }
  return unique.length > 0 ? unique : [...DEFAULT_SPORTS_LEAGUES];
}

export function resolveFollowedTeams(teams?: unknown): SportsFollowedTeam[] {
  if (!Array.isArray(teams)) return [];
  const out: SportsFollowedTeam[] = [];
  const seen = new Set<string>();
  for (const raw of teams) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Partial<SportsFollowedTeam>;
    const league =
      typeof candidate.league === 'string'
        ? (candidate.league.trim().toLowerCase() as SportsLeagueId)
        : undefined;
    const abbreviation =
      typeof candidate.abbreviation === 'string'
        ? candidate.abbreviation.trim().toUpperCase().slice(0, 12)
        : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : abbreviation;
    if (!league || !Object.prototype.hasOwnProperty.call(SPORTS_LEAGUE_META, league) || !abbreviation) {
      continue;
    }
    const key = `${league}:${abbreviation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      league,
      abbreviation,
      name: name || abbreviation,
      ...(typeof candidate.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(candidate.color.trim())
        ? { color: candidate.color.trim().toUpperCase() }
        : {}),
      ...(typeof candidate.logoUrl === 'string' &&
      candidate.logoUrl.trim().startsWith('https://a.espncdn.com/')
        ? { logoUrl: candidate.logoUrl.trim() }
        : {}),
    });
    if (out.length >= MAX_FOLLOWED_TEAMS) break;
  }
  return out;
}

export function isFollowedTeamInGame(game: SportsGame, followed: SportsFollowedTeam[]): boolean {
  if (!followed.length) return false;
  const homeAbbr = game.homeTeam.abbreviation.toUpperCase();
  const awayAbbr = game.awayTeam.abbreviation.toUpperCase();
  return followed.some(
    (f) => f.league === game.league && (f.abbreviation === homeAbbr || f.abbreviation === awayAbbr)
  );
}

function stateSortRank(game: SportsGame, followed: SportsFollowedTeam[]): number {
  const isFollowed = isFollowedTeamInGame(game, followed);
  if (game.state === 'LIVE') return isFollowed ? 0 : 1;
  if (isFollowed) return 2;
  if (game.state === 'PRE') return 3;
  if (game.state === 'FINAL') return 4;
  return 5;
}

export function sortAndFilterGamesForWidget(
  games: SportsGame[],
  config?: SportsWidgetConfig
): SportsGame[] {
  const followed = resolveFollowedTeams(config?.followedTeams);
  const onlyFollowed = Boolean(config?.showOnlyFollowedTeams && followed.length > 0);
  const pool = onlyFollowed ? games.filter((g) => isFollowedTeamInGame(g, followed)) : games.slice();

  return pool.sort((a, b) => {
    const rankDiff = stateSortRank(a, followed) - stateSortRank(b, followed);
    if (rankDiff !== 0) return rankDiff;
    const aMs = Date.parse(a.startTime || '') || 0;
    const bMs = Date.parse(b.startTime || '') || 0;
    if (aMs !== bMs) return aMs - bMs;
    return a.id.localeCompare(b.id);
  });
}

export function resolveSportsLayoutMode(
  configured: SportsDisplayMode | undefined,
  width: number,
  height: number,
  gameCount: number
): Exclude<SportsDisplayMode, 'auto'> {
  if (configured === 'single' || configured === 'grid' || configured === 'ticker') {
    return configured;
  }
  if (height > 0 && height <= 125 && width >= 260) {
    return 'ticker';
  }
  if (gameCount === 1 || (width > 0 && width < 300 && height > 0 && height < 260)) {
    return 'single';
  }
  return 'grid';
}

export function getCachedSportsGames(leagues: SportsLeagueId[]): SportsGame[] {
  hydrateCacheFromStorage();
  const out: SportsGame[] = [];
  for (const league of resolveSportsLeagues(leagues)) {
    const hit = memoryScoreboardCache.get(league);
    if (hit?.games?.length) {
      out.push(...hit.games);
    }
  }
  return out;
}

export async function fetchSportsScoreboard(
  leagues: SportsLeagueId[],
  signal?: AbortSignal
): Promise<{ games: SportsGame[]; isStaleCache: boolean }> {
  const resolved = resolveSportsLeagues(leagues);
  const endpoint = `/api/sports?leagues=${encodeURIComponent(resolved.join(','))}`;

  try {
    const res = await fetch(endpoint, { signal });
    if (!res.ok) {
      throw new Error(`Sports API returned HTTP ${res.status}`);
    }
    const payload = (await res.json()) as { games?: SportsGame[] };
    const games = Array.isArray(payload?.games) ? payload.games : [];

    const nowMs = Date.now();
    const byLeague = new Map<SportsLeagueId, SportsGame[]>();
    for (const lg of resolved) {
      byLeague.set(lg, []);
    }
    for (const game of games) {
      const bucket = byLeague.get(game.league);
      if (bucket) bucket.push(game);
    }
    for (const [lg, lgGames] of byLeague.entries()) {
      setCachedLeagueGames(lg, lgGames, nowMs);
    }
    persistCacheToStorage();

    return { games, isStaleCache: false };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    const cached = getCachedSportsGames(resolved);
    if (cached.length > 0) {
      return { games: cached, isStaleCache: true };
    }
    throw err;
  }
}

export async function fetchLeagueTeams(
  league: SportsLeagueId,
  query = '',
  signal?: AbortSignal
): Promise<SportsTeamOption[]> {
  const params = new URLSearchParams({
    action: 'teams',
    league,
  });
  if (query.trim()) {
    params.set('q', query.trim().slice(0, 40));
  }
  const res = await fetch(`/api/sports?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`Team lookup returned HTTP ${res.status}`);
  }
  const payload = (await res.json()) as { teams?: SportsTeamOption[] };
  return Array.isArray(payload?.teams) ? payload.teams : [];
}
