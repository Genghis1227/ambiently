import React, { useState } from 'react';
import { Lightbulb, Loader2, Plus, Search, Trophy, X } from 'lucide-react';
import {
  MAX_FOLLOWED_TEAMS,
  SPORTS_LEAGUE_META,
  type DiscoveryTabMode,
  type DiscoveryTriviaCategory,
  type SportsDisplayMode,
  type SportsFollowedTeam,
  type SportsLeagueId,
  type SportsTeamOption,
} from '../../types/phase3Widgets';
import { fetchLeagueTeams } from '../../services/sports';

const ALL_LEAGUES: SportsLeagueId[] = [
  'nfl',
  'nba',
  'mlb',
  'nhl',
  'mls',
  'epl',
  'ncaaf',
  'ncaab',
];

interface SportsSettingsPanelProps {
  leagues: SportsLeagueId[];
  setLeagues: (next: SportsLeagueId[]) => void;
  followedTeams: SportsFollowedTeam[];
  setFollowedTeams: (next: SportsFollowedTeam[]) => void;
  showOnlyFollowedTeams: boolean;
  setShowOnlyFollowedTeams: (val: boolean) => void;
  displayMode: SportsDisplayMode;
  setDisplayMode: (mode: SportsDisplayMode) => void;
  showRecords: boolean;
  setShowRecords: (val: boolean) => void;
  showBroadcast: boolean;
  setShowBroadcast: (val: boolean) => void;
  refreshMin: 1 | 2 | 5 | 15;
  setRefreshMin: (val: 1 | 2 | 5 | 15) => void;
}

export const SportsSettingsPanel: React.FC<SportsSettingsPanelProps> = ({
  leagues,
  setLeagues,
  followedTeams,
  setFollowedTeams,
  showOnlyFollowedTeams,
  setShowOnlyFollowedTeams,
  displayMode,
  setDisplayMode,
  showRecords,
  setShowRecords,
  showBroadcast,
  setShowBroadcast,
  refreshMin,
  setRefreshMin,
}) => {
  const [searchLeague, setSearchLeague] = useState<SportsLeagueId>(leagues[0] || 'nfl');
  const [teamQuery, setTeamQuery] = useState('');
  const [teamHits, setTeamHits] = useState<SportsTeamOption[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  const toggleLeague = (lg: SportsLeagueId) => {
    if (leagues.includes(lg)) {
      if (leagues.length <= 1) return;
      setLeagues(leagues.filter((x) => x !== lg));
    } else {
      setLeagues([...leagues, lg]);
    }
  };

  const handleLookupTeams = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTeamLoading(true);
    try {
      const results = await fetchLeagueTeams(searchLeague, teamQuery);
      setTeamHits(results.slice(0, 12));
    } catch {
      setTeamHits([]);
    } finally {
      setTeamLoading(false);
    }
  };

  const handleAddFollowedTeam = (option: SportsTeamOption) => {
    if (followedTeams.length >= MAX_FOLLOWED_TEAMS) return;
    const exists = followedTeams.some(
      (f) => f.league === option.league && f.abbreviation === option.abbreviation
    );
    if (exists) return;
    setFollowedTeams([
      ...followedTeams,
      {
        league: option.league,
        abbreviation: option.abbreviation,
        name: option.shortDisplayName || option.name,
        color: option.color,
        logoUrl: option.logoUrl,
      },
    ]);
    if (!leagues.includes(option.league)) {
      setLeagues([...leagues, option.league]);
    }
  };

  const handleRemoveFollowedTeam = (league: SportsLeagueId, abbreviation: string) => {
    setFollowedTeams(
      followedTeams.filter((f) => !(f.league === league && f.abbreviation === abbreviation))
    );
  };

  return (
    <div className="space-y-4 pt-2 border-t border-gray-800/80">
      <div className="flex items-center gap-2 text-amber-400">
        <Trophy className="w-4 h-4" />
        <h3 className="text-xs font-bold uppercase tracking-wider">Live Sports Scoreboard</h3>
      </div>

      {/* League Multi-Select */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
          Leagues Tracked ({leagues.length} selected)
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {ALL_LEAGUES.map((lg) => {
            const active = leagues.includes(lg);
            return (
              <button
                key={lg}
                type="button"
                onClick={() => toggleLeague(lg)}
                className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-600/20 border-amber-500/45 text-amber-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {SPORTS_LEAGUE_META[lg].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Followed Teams Search & Chips */}
      <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-200">
            Favorite Teams ({followedTeams.length}/{MAX_FOLLOWED_TEAMS})
          </span>
          {followedTeams.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyFollowedTeams}
                onChange={(e) => setShowOnlyFollowedTeams(e.target.checked)}
                className="rounded border-gray-700 bg-gray-950 text-amber-500"
              />
              Show only favorites
            </label>
          )}
        </div>

        <form onSubmit={handleLookupTeams} className="flex items-center gap-1.5">
          <select
            value={searchLeague}
            onChange={(e) => setSearchLeague(e.target.value as SportsLeagueId)}
            className="px-2 py-1.5 rounded-lg bg-gray-950 border border-gray-800 text-xs text-white"
          >
            {ALL_LEAGUES.map((lg) => (
              <option key={lg} value={lg}>
                {SPORTS_LEAGUE_META[lg].shortLabel}
              </option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
              placeholder="Search team name or abbr (e.g. Chiefs, Lakers)..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-gray-950 border border-gray-800 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>
          <button
            type="submit"
            disabled={teamLoading}
            className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white cursor-pointer flex items-center gap-1"
          >
            {teamLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Find'}
          </button>
        </form>

        {teamHits.length > 0 && (
          <div className="max-h-36 overflow-y-auto space-y-1 pt-1">
            {teamHits.map((opt) => {
              const added = followedTeams.some(
                (f) => f.league === opt.league && f.abbreviation === opt.abbreviation
              );
              return (
                <button
                  key={`${opt.league}-${opt.id}`}
                  type="button"
                  disabled={added || followedTeams.length >= MAX_FOLLOWED_TEAMS}
                  onClick={() => handleAddFollowedTeam(opt)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-gray-950/70 hover:bg-gray-800/80 disabled:opacity-45 text-left text-xs cursor-pointer"
                >
                  <span className="text-gray-100 font-medium truncate">
                    <span className="text-amber-300 font-bold mr-1.5">{opt.abbreviation}</span>
                    {opt.name}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-1">
                    {added ? 'Following' : (
                      <>
                        <Plus className="w-3 h-3" /> Follow
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {followedTeams.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {followedTeams.map((team) => (
              <span
                key={`${team.league}-${team.abbreviation}`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-200"
              >
                <span className="text-[10px] uppercase text-amber-400">
                  {SPORTS_LEAGUE_META[team.league].shortLabel}
                </span>
                <span>{team.abbreviation}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFollowedTeam(team.league, team.abbreviation)}
                  className="text-amber-300/70 hover:text-white cursor-pointer"
                  aria-label={`Remove ${team.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Layout & Display Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
            Layout Mode
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { id: 'auto', label: 'Auto' },
                { id: 'single', label: 'Card' },
                { id: 'grid', label: 'Grid' },
                { id: 'ticker', label: 'Ticker' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDisplayMode(opt.id)}
                className={`py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                  displayMode === opt.id
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
            Refresh Interval (Paused in Night Mode)
          </label>
          <div className="grid grid-cols-4 gap-1">
            {([1, 2, 5, 15] as const).map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setRefreshMin(min)}
                className={`py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                  refreshMin === min
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {min}m
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showRecords}
            onChange={(e) => setShowRecords(e.target.checked)}
            className="rounded border-gray-700 bg-gray-950 text-blue-500"
          />
          Show team season records
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showBroadcast}
            onChange={(e) => setShowBroadcast(e.target.checked)}
            className="rounded border-gray-700 bg-gray-950 text-blue-500"
          />
          Show TV broadcast channel
        </label>
      </div>
    </div>
  );
};

interface DailyDiscoverySettingsPanelProps {
  mode: DiscoveryTabMode;
  setMode: (mode: DiscoveryTabMode) => void;
  triviaCategory: DiscoveryTriviaCategory;
  setTriviaCategory: (category: DiscoveryTriviaCategory) => void;
  autoRotateSec: 0 | 15 | 30 | 60;
  setAutoRotateSec: (sec: 0 | 15 | 30 | 60) => void;
  autoRevealAnswer: boolean;
  setAutoRevealAnswer: (val: boolean) => void;
}

export const DailyDiscoverySettingsPanel: React.FC<DailyDiscoverySettingsPanelProps> = ({
  mode,
  setMode,
  triviaCategory,
  setTriviaCategory,
  autoRotateSec,
  setAutoRotateSec,
  autoRevealAnswer,
  setAutoRevealAnswer,
}) => {
  return (
    <div className="space-y-4 pt-2 border-t border-gray-800/80">
      <div className="flex items-center gap-2 text-amber-400">
        <Lightbulb className="w-4 h-4" />
        <h3 className="text-xs font-bold uppercase tracking-wider">Daily Discovery & Trivia</h3>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
          Default Card Mode
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {(
            [
              { id: 'rotate', label: 'Rotate All' },
              { id: 'trivia', label: 'Trivia & Riddles' },
              { id: 'word', label: 'Word of the Day' },
              { id: 'on_this_day', label: 'On This Day' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`px-2 py-2 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                mode === opt.id
                  ? 'bg-amber-600/20 border-amber-500/45 text-amber-200'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
            Trivia Topic Filter
          </label>
          <select
            value={triviaCategory}
            onChange={(e) => setTriviaCategory(e.target.value as DiscoveryTriviaCategory)}
            className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-800 text-xs text-white"
          >
            <option value="all">All Topics (Science, History, Nature, Geo, Wordplay)</option>
            <option value="science">Science & Space</option>
            <option value="history">History & Inventions</option>
            <option value="nature">Nature & Wildlife</option>
            <option value="geography">World Geography</option>
            <option value="wordplay">Riddles & Wordplay</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
            Auto-Rotate Cards (When in Rotate All)
          </label>
          <div className="grid grid-cols-4 gap-1">
            {([0, 15, 30, 60] as const).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setAutoRotateSec(sec)}
                className={`py-2 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                  autoRotateSec === sec
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {sec === 0 ? 'Off' : `${sec}s`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={autoRevealAnswer}
          onChange={(e) => setAutoRevealAnswer(e.target.checked)}
          className="rounded border-gray-700 bg-gray-950 text-amber-500"
        />
        Auto-reveal trivia answers on kiosk display
      </label>
    </div>
  );
};
