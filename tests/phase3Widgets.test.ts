import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSportsLeagues,
  parseEspnScoreboardPayload,
  parseEspnTeamsPayload,
  sanitizeEspnLogoUrl,
} from '../functions/api/sports';
import { parseWikimediaOnThisDayPayload } from '../functions/api/discovery';
import {
  resolveSportsLayoutMode,
  sortAndFilterGamesForWidget,
} from '../src/services/sports';
import {
  CURATED_TRIVIA_ITEMS,
  CURATED_WORD_ITEMS,
  FALLBACK_ON_THIS_DAY_BY_MONTH,
  getDailyTriviaForDate,
  getDailyWordForDate,
  getFallbackHistoryEventsForDate,
} from '../src/utils/dailyDiscoveryData';
import type { SportsGame } from '../src/types/phase3Widgets';

describe('Phase 3 Sports Scoreboard Engine & Proxy Parsers', () => {
  it('normalizes valid sports league lists and sanitizes ESPN logo URLs', () => {
    assert.deepEqual(normalizeSportsLeagues('nfl, nba, invalid, NFL, epl'), ['nfl', 'nba', 'epl']);
    assert.deepEqual(normalizeSportsLeagues(null), []);

    assert.equal(
      sanitizeEspnLogoUrl('https://a.espncdn.com/i/teamlogos/nfl/500/kc.png'),
      'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png'
    );
    assert.equal(sanitizeEspnLogoUrl('https://evil.example.com/logo.png'), undefined);
    assert.equal(sanitizeEspnLogoUrl('javascript:alert(1)'), undefined);
  });

  it('parses ESPN scoreboard events across PRE, LIVE, FINAL, and POSTPONED states', () => {
    const samplePayload = {
      events: [
        {
          id: 'g-live',
          date: '2026-11-19T20:15:00Z',
          competitions: [
            {
              date: '2026-11-19T20:15:00Z',
              venue: { fullName: 'Arrowhead Stadium' },
              broadcasts: [{ names: ['Prime Video'] }],
              situation: { downDistanceText: '3rd & 4 at BUF 32' },
              status: {
                period: 3,
                displayClock: '06:42',
                type: { state: 'in', detail: '06:42 - 3rd Quarter', shortDetail: '6:42 - 3rd' },
              },
              competitors: [
                {
                  homeAway: 'home',
                  score: '24',
                  winner: false,
                  records: [{ summary: '8-2' }],
                  team: {
                    id: '12',
                    abbreviation: 'KC',
                    displayName: 'Kansas City Chiefs',
                    shortDisplayName: 'Chiefs',
                    color: 'e31837',
                    logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png',
                  },
                },
                {
                  homeAway: 'away',
                  score: '21',
                  winner: false,
                  records: [{ summary: '7-3' }],
                  team: {
                    id: '2',
                    abbreviation: 'BUF',
                    displayName: 'Buffalo Bills',
                    shortDisplayName: 'Bills',
                    color: '00338d',
                    logo: 'https://untrusted.host.example/bills.png',
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'g-pre',
          date: '2026-11-22T18:00:00Z',
          competitions: [
            {
              status: { type: { state: 'pre', detail: 'Sun, Nov 22 at 1:00 PM EST', shortDetail: '11/22 - 1:00 PM' } },
              competitors: [
                { homeAway: 'home', score: '0', team: { id: '3', abbreviation: 'SF', shortDisplayName: '49ers' } },
                { homeAway: 'away', score: '0', team: { id: '4', abbreviation: 'SEA', shortDisplayName: 'Seahawks' } },
              ],
            },
          ],
        },
        {
          id: 'g-final',
          date: '2026-11-18T01:00:00Z',
          competitions: [
            {
              status: { type: { state: 'post', completed: true, detail: 'Final/OT', shortDetail: 'Final/OT' } },
              competitors: [
                { homeAway: 'home', score: '30', winner: true, team: { id: '5', abbreviation: 'DET', shortDisplayName: 'Lions' } },
                { homeAway: 'away', score: '27', winner: false, team: { id: '6', abbreviation: 'GB', shortDisplayName: 'Packers' } },
              ],
            },
          ],
        },
        {
          id: 'g-ppd',
          date: '2026-11-20T00:00:00Z',
          competitions: [
            {
              status: { type: { state: 'post', completed: false, name: 'STATUS_POSTPONED', detail: 'Postponed', shortDetail: 'PPD' } },
              competitors: [
                { homeAway: 'home', score: '0', team: { id: '7', abbreviation: 'MIA', shortDisplayName: 'Dolphins' } },
                { homeAway: 'away', score: '0', team: { id: '8', abbreviation: 'NYJ', shortDisplayName: 'Jets' } },
              ],
            },
          ],
        },
      ],
    };

    const parsed = parseEspnScoreboardPayload(samplePayload, 'nfl');
    assert.equal(parsed.length, 4);

    assert.equal(parsed[0].state, 'LIVE');
    assert.equal(parsed[0].homeTeam.score, 24);
    assert.equal(parsed[0].awayTeam.score, 21);
    assert.equal(parsed[0].homeTeam.color, '#E31837');
    assert.equal(parsed[0].homeTeam.logoUrl, 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png');
    assert.equal(parsed[0].awayTeam.logoUrl, undefined);
    assert.equal(parsed[0].broadcast, 'Prime Video');
    assert.equal(parsed[0].situationText, '3rd & 4 at BUF 32');

    assert.equal(parsed[1].state, 'PRE');
    assert.equal(parsed[1].homeTeam.score, null);
    assert.equal(parsed[1].awayTeam.score, null);

    assert.equal(parsed[2].state, 'FINAL');
    assert.equal(parsed[2].homeTeam.isWinner, true);
    assert.equal(parsed[2].homeTeam.score, 30);

    assert.equal(parsed[3].state, 'POSTPONED');
    assert.equal(parsed[3].homeTeam.score, null);
  });

  it('parses ESPN league teams directory cleanly', () => {
    const payload = {
      sports: [
        {
          leagues: [
            {
              teams: [
                {
                  team: {
                    id: '13',
                    abbreviation: 'LAL',
                    displayName: 'Los Angeles Lakers',
                    shortDisplayName: 'Lakers',
                    color: '552583',
                    logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png' }],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const teams = parseEspnTeamsPayload(payload, 'nba');
    assert.equal(teams.length, 1);
    assert.equal(teams[0].abbreviation, 'LAL');
    assert.equal(teams[0].color, '#552583');
  });

  it('prioritizes LIVE and followed-team matchups and resolves responsive layouts', () => {
    const mkGame = (id: string, state: SportsGame['state'], homeAbbr: string): SportsGame => ({
      id,
      league: 'nba',
      leagueLabel: 'NBA',
      state,
      statusDetail: state,
      shortDetail: state,
      startTime: '2026-11-19T23:00:00Z',
      homeTeam: { id: homeAbbr, abbreviation: homeAbbr, name: homeAbbr, shortDisplayName: homeAbbr, score: state === 'PRE' ? null : 100 },
      awayTeam: { id: 'OPP', abbreviation: 'OPP', name: 'Opponent', shortDisplayName: 'Opponent', score: state === 'PRE' ? null : 95 },
    });

    const games = [
      mkGame('g-final', 'FINAL', 'BOS'),
      mkGame('g-pre-fav', 'PRE', 'LAL'),
      mkGame('g-live-other', 'LIVE', 'NYK'),
      mkGame('g-live-fav', 'LIVE', 'DEN'),
    ];

    const sorted = sortAndFilterGamesForWidget(games, {
      followedTeams: [
        { league: 'nba', abbreviation: 'DEN', name: 'Nuggets' },
        { league: 'nba', abbreviation: 'LAL', name: 'Lakers' },
      ],
    });
    assert.deepEqual(
      sorted.map((g) => g.id),
      ['g-live-fav', 'g-live-other', 'g-pre-fav', 'g-final']
    );

    const onlyFavs = sortAndFilterGamesForWidget(games, {
      followedTeams: [{ league: 'nba', abbreviation: 'LAL', name: 'Lakers' }],
      showOnlyFollowedTeams: true,
    });
    assert.deepEqual(onlyFavs.map((g) => g.id), ['g-pre-fav']);

    assert.equal(resolveSportsLayoutMode('auto', 520, 96, 4), 'ticker');
    assert.equal(resolveSportsLayoutMode('auto', 260, 220, 3), 'single');
    assert.equal(resolveSportsLayoutMode('auto', 460, 380, 1), 'single');
    assert.equal(resolveSportsLayoutMode('auto', 520, 420, 4), 'grid');
    assert.equal(resolveSportsLayoutMode('ticker', 520, 420, 4), 'ticker');
  });
});

describe('Phase 3 Daily Discovery Engine & Wikimedia Parser', () => {
  it('sanitizes Wikimedia On This Day events and filters non-Wikimedia URLs', () => {
    const payload = {
      selected: [
        {
          year: 1969,
          text: 'Apollo 12 astronauts Pete Conrad and Alan Bean land on the Moon.',
          pages: [
            {
              titles: { normalized: 'Apollo 12' },
              content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Apollo_12' } },
              thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Apollo_12.jpg/320px-Apollo_12.jpg' },
            },
          ],
        },
        {
          year: 2001,
          text: 'Untrusted URLs are dropped safely.',
          pages: [
            {
              title: 'Test Page',
              content_urls: { desktop: { page: 'https://evil.example.org/wiki' } },
              thumbnail: { source: 'https://evil.example.org/thumb.png' },
            },
          ],
        },
        { year: 'not-a-year', text: 'Ignored' },
      ],
    };

    const events = parseWikimediaOnThisDayPayload(payload);
    assert.equal(events.length, 2);
    assert.equal(events[0].year, 1969);
    assert.equal(events[0].articleUrl, 'https://en.wikipedia.org/wiki/Apollo_12');
    assert.ok(events[0].thumbnailUrl?.startsWith('https://upload.wikimedia.org/'));
    assert.equal(events[1].articleUrl, undefined);
    assert.equal(events[1].thumbnailUrl, undefined);
  });

  it('provides unique offline trivia, word, and fallback On This Day items for every month including Leap Day', () => {
    const triviaIds = new Set(CURATED_TRIVIA_ITEMS.map((t) => t.id));
    assert.equal(triviaIds.size, CURATED_TRIVIA_ITEMS.length);
    assert.ok(CURATED_TRIVIA_ITEMS.length >= 30);

    const wordIds = new Set(CURATED_WORD_ITEMS.map((w) => w.id));
    assert.equal(wordIds.size, CURATED_WORD_ITEMS.length);
    assert.ok(CURATED_WORD_ITEMS.length >= 30);

    assert.ok(FALLBACK_ON_THIS_DAY_BY_MONTH.length >= 24);

    const day0 = getDailyTriviaForDate(new Date(2026, 10, 19), 'science', 0);
    const dayNext = getDailyTriviaForDate(new Date(2026, 10, 19), 'science', 1);
    assert.equal(day0.item.category, 'science');
    assert.notEqual(day0.item.id, dayNext.item.id);

    const wordA = getDailyWordForDate(new Date(2026, 10, 19), 0);
    const wordB = getDailyWordForDate(new Date(2026, 10, 20), 0);
    assert.notEqual(wordA.item.id, wordB.item.id);

    for (let m = 1; m <= 12; m++) {
      const list = getFallbackHistoryEventsForDate(m, 15);
      assert.ok(list.length >= 4, `Expected >= 4 offline history events for month ${m}`);
    }
    const feb29 = getFallbackHistoryEventsForDate(2, 29);
    assert.equal(feb29[0]?.year, 1940);
  });
});
