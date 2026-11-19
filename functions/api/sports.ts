// Cloudflare Pages Function: /functions/api/sports.ts
// Zero-API-key live sports scoreboard and team lookup proxy

import {
  fetchExternal,
  externalFetchErrorResponse,
  refuseOtherSites,
} from '../_shared/fetchExternal';
import {
  SPORTS_LEAGUE_META,
  type SportsGame,
  type SportsGameState,
  type SportsLeagueId,
  type SportsTeamOption,
  type SportsTeamSummary,
} from '../../src/types/phase3Widgets';

interface PagesContext {
  request: Request;
}

const ALLOWED_SPORTS_HOSTS = ['site.api.espn.com'];
const SPORTS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Ambiently-Display/1.0)',
  Accept: 'application/json',
};

const SCOREBOARD_CACHE_TTL_MS = 45_000;
const MAX_SCOREBOARD_CACHE = 64;
const TEAMS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_TEAMS_CACHE = 16;

interface CachedScoreboardEntry {
  games: SportsGame[];
  expiresAt: number;
}

interface CachedTeamsEntry {
  teams: SportsTeamOption[];
  expiresAt: number;
}

const scoreboardCache = new Map<string, CachedScoreboardEntry>();
const teamsCache = new Map<string, CachedTeamsEntry>();

function isValidLeagueId(raw: string): raw is SportsLeagueId {
  return Object.prototype.hasOwnProperty.call(SPORTS_LEAGUE_META, raw);
}

export function normalizeSportsLeagues(raw: string | null): SportsLeagueId[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const unique: SportsLeagueId[] = [];
  const seen = new Set<SportsLeagueId>();
  for (const token of raw.split(',')) {
    const cleaned = token.trim().toLowerCase();
    if (isValidLeagueId(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      unique.push(cleaned);
      if (unique.length >= 8) break;
    }
  }
  return unique;
}

export function sanitizeEspnLogoUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'a.espncdn.com') {
      return parsed.toString();
    }
  } catch {
    // Ignore malformed logo URLs
  }
  return undefined;
}

function sanitizeHexColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return undefined;
  return `#${cleaned.toUpperCase()}`;
}

function resolveGameState(statusType: any): SportsGameState {
  const rawState = String(statusType?.state || '').toLowerCase();
  if (rawState === 'in') return 'LIVE';
  if (rawState === 'post') {
    const label = `${statusType?.name || ''} ${statusType?.description || ''}`.toLowerCase();
    if ((label.includes('postpon') || label.includes('cancel')) && !statusType?.completed) {
      return 'POSTPONED';
    }
    return 'FINAL';
  }
  return 'PRE';
}

function parseTeamSummary(competitor: any, state: SportsGameState): SportsTeamSummary {
  const team = competitor?.team || {};
  const abbreviation = String(team.abbreviation || team.shortDisplayName || 'TBD')
    .trim()
    .slice(0, 12);
  const name = String(team.displayName || team.name || abbreviation).trim();
  const shortDisplayName = String(team.shortDisplayName || team.name || abbreviation).trim();

  let score: number | null = null;
  if (state !== 'PRE' && state !== 'POSTPONED') {
    const rawScore = competitor?.score;
    if (rawScore !== undefined && rawScore !== null && String(rawScore).trim() !== '') {
      const numeric = Number(rawScore);
      if (Number.isFinite(numeric)) {
        score = numeric;
      }
    }
  }

  const recordRaw = Array.isArray(competitor?.records) ? competitor.records[0]?.summary : undefined;
  const record = typeof recordRaw === 'string' && recordRaw.trim() ? recordRaw.trim() : undefined;

  return {
    id: String(team.id || competitor?.id || abbreviation).trim(),
    abbreviation,
    name,
    shortDisplayName,
    color: sanitizeHexColor(team.color),
    logoUrl: sanitizeEspnLogoUrl(team.logo || team.logos?.[0]?.href),
    ...(record ? { record } : {}),
    score,
    ...(competitor?.winner ? { isWinner: true } : {}),
  };
}

export function parseEspnScoreboardPayload(payload: any, league: SportsLeagueId): SportsGame[] {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const meta = SPORTS_LEAGUE_META[league];
  const games: SportsGame[] = [];

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const comp0 = Array.isArray(event.competitions) ? event.competitions[0] : null;
    const competitors: any[] = Array.isArray(comp0?.competitors) ? comp0.competitors : [];
    if (competitors.length < 2) continue;

    const homeComp = competitors.find((c) => c?.homeAway === 'home') || competitors[0];
    const awayComp = competitors.find((c) => c?.homeAway === 'away') || competitors[1];
    if (!homeComp || !awayComp) continue;

    const status = comp0?.status || event.status || {};
    const statusType = status?.type || {};
    const state = resolveGameState(statusType);

    const period =
      typeof status?.period === 'number' && Number.isFinite(status.period) && status.period > 0
        ? status.period
        : undefined;
    const displayClock =
      typeof status?.displayClock === 'string' && status.displayClock.trim()
        ? status.displayClock.trim()
        : undefined;
    const statusDetail =
      String(statusType?.detail || statusType?.description || state).trim() || state;
    const shortDetail =
      String(statusType?.shortDetail || statusDetail).trim() || statusDetail;
    const startTime = String(comp0?.date || event.date || '').trim();
    const venue =
      typeof comp0?.venue?.fullName === 'string' && comp0.venue.fullName.trim()
        ? comp0.venue.fullName.trim()
        : undefined;
    const broadcastRaw =
      comp0?.broadcasts?.[0]?.names?.[0] || comp0?.geoBroadcasts?.[0]?.media?.shortName;
    const broadcast =
      typeof broadcastRaw === 'string' && broadcastRaw.trim() ? broadcastRaw.trim() : undefined;
    const situationRaw =
      comp0?.situation?.downDistanceText || comp0?.situation?.lastPlay?.text;
    const situationText =
      typeof situationRaw === 'string' && situationRaw.trim() ? situationRaw.trim() : undefined;

    games.push({
      id: String(event.id || `${league}-${awayComp.id}-${homeComp.id}`).trim(),
      league,
      leagueLabel: meta.shortLabel,
      state,
      statusDetail,
      shortDetail,
      ...(period !== undefined ? { period } : {}),
      ...(displayClock ? { displayClock } : {}),
      startTime,
      ...(venue ? { venue } : {}),
      ...(broadcast ? { broadcast } : {}),
      homeTeam: parseTeamSummary(homeComp, state),
      awayTeam: parseTeamSummary(awayComp, state),
      ...(situationText ? { situationText } : {}),
    });
  }

  return games;
}

export function parseEspnTeamsPayload(payload: any, league: SportsLeagueId): SportsTeamOption[] {
  const nested = payload?.sports?.[0]?.leagues?.[0]?.teams;
  const rawList: any[] = Array.isArray(nested)
    ? nested
    : Array.isArray(payload?.teams)
      ? payload.teams
      : [];

  const options: SportsTeamOption[] = [];
  const seen = new Set<string>();

  for (const entry of rawList) {
    const team = entry?.team || entry;
    if (!team || typeof team !== 'object') continue;
    const abbreviation = String(team.abbreviation || '').trim().toUpperCase();
    const name = String(team.displayName || team.name || '').trim();
    if (!abbreviation || !name) continue;
    if (seen.has(abbreviation)) continue;
    seen.add(abbreviation);

    options.push({
      league,
      id: String(team.id || abbreviation).trim(),
      abbreviation,
      name,
      shortDisplayName: String(team.shortDisplayName || team.name || name).trim(),
      color: sanitizeHexColor(team.color),
      logoUrl: sanitizeEspnLogoUrl(team.logos?.[0]?.href || team.logo),
    });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

function setBoundedCache<T>(map: Map<string, T>, key: string, value: T, maxEntries: number): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, value);
}

async function fetchEspnJson(targetUrl: string, maxBytes: number): Promise<any> {
  const res = await fetchExternal(targetUrl, {
    maxBytes,
    timeoutMs: 8000,
    allowedHosts: ALLOWED_SPORTS_HOSTS,
    headers: SPORTS_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Upstream ESPN request returned HTTP ${res.status}`);
  }
  return JSON.parse(res.text);
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const refused = refuseOtherSites(context.request);
  if (refused) return refused;

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const nowMs = Date.now();

  try {
    if (action === 'teams') {
      const leagueRaw = (url.searchParams.get('league') || '').trim().toLowerCase();
      if (!isValidLeagueId(leagueRaw)) {
        return new Response(JSON.stringify({ error: 'Invalid or missing "league" parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const meta = SPORTS_LEAGUE_META[leagueRaw];
      const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 40);

      let teams: SportsTeamOption[];
      const cached = teamsCache.get(leagueRaw);
      if (cached && cached.expiresAt > nowMs) {
        teams = cached.teams;
      } else {
        const endpoint = `https://site.api.espn.com/apis/site/v2/sports/${meta.sport}/${meta.espnLeague}/teams?limit=200`;
        const payload = await fetchEspnJson(endpoint, 3 * 1024 * 1024);
        teams = parseEspnTeamsPayload(payload, leagueRaw);
        setBoundedCache(
          teamsCache,
          leagueRaw,
          { teams, expiresAt: nowMs + TEAMS_CACHE_TTL_MS },
          MAX_TEAMS_CACHE
        );
      }

      const filtered = q
        ? teams.filter(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              t.shortDisplayName.toLowerCase().includes(q) ||
              t.abbreviation.toLowerCase().includes(q)
          )
        : teams;

      return new Response(
        JSON.stringify({
          league: leagueRaw,
          teams: filtered.slice(0, 40),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    }

    const leagues = normalizeSportsLeagues(url.searchParams.get('leagues'));
    if (leagues.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid or missing "leagues" parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const datesParam = url.searchParams.get('dates');
    let validatedDates = '';
    if (datesParam !== null && datesParam.trim() !== '') {
      if (!/^\d{8}$/.test(datesParam.trim())) {
        return new Response(JSON.stringify({ error: 'Invalid "dates" parameter (expected YYYYMMDD)' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      validatedDates = datesParam.trim();
    }

    const resultsByLeague = new Map<SportsLeagueId, SportsGame[]>();
    const missingLeagues: SportsLeagueId[] = [];

    for (const league of leagues) {
      const cacheKey = `${league}:${validatedDates || 'today'}`;
      const hit = scoreboardCache.get(cacheKey);
      if (hit && hit.expiresAt > nowMs) {
        resultsByLeague.set(league, hit.games);
      } else {
        missingLeagues.push(league);
      }
    }

    if (missingLeagues.length > 0) {
      const settled = await Promise.allSettled(
        missingLeagues.map(async (league) => {
          const meta = SPORTS_LEAGUE_META[league];
          const params: string[] = [];
          if (meta.extraQuery) params.push(meta.extraQuery);
          if (validatedDates) params.push(`dates=${validatedDates}`);
          const qs = params.length > 0 ? `?${params.join('&')}` : '';
          const endpoint = `https://site.api.espn.com/apis/site/v2/sports/${meta.sport}/${meta.espnLeague}/scoreboard${qs}`;
          const payload = await fetchEspnJson(endpoint, 3 * 1024 * 1024);
          return { league, games: parseEspnScoreboardPayload(payload, league) };
        })
      );

      let firstError: unknown = null;
      for (const entry of settled) {
        if (entry.status === 'fulfilled') {
          const { league, games } = entry.value;
          resultsByLeague.set(league, games);
          setBoundedCache(
            scoreboardCache,
            `${league}:${validatedDates || 'today'}`,
            { games, expiresAt: nowMs + SCOREBOARD_CACHE_TTL_MS },
            MAX_SCOREBOARD_CACHE
          );
        } else if (!firstError) {
          firstError = entry.reason;
        }
      }

      if (resultsByLeague.size === 0 && firstError) {
        const mapped = externalFetchErrorResponse(firstError);
        if (mapped) return mapped;
        return new Response(
          JSON.stringify({
            error: firstError instanceof Error ? firstError.message : 'Unable to load sports scores',
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
          }
        );
      }
    }

    const games: SportsGame[] = [];
    for (const league of leagues) {
      const items = resultsByLeague.get(league);
      if (items) games.push(...items);
    }

    return new Response(
      JSON.stringify({
        games,
        leagues,
        updatedAt: new Date(nowMs).toISOString(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30, s-maxage=45',
        },
      }
    );
  } catch (err: any) {
    const mapped = externalFetchErrorResponse(err);
    if (mapped) return mapped;
    return new Response(JSON.stringify({ error: err?.message || 'Sports lookup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
