import React, { useEffect, useState } from 'react';
import { Disc3, Eye, EyeOff, KeyRound, Lock, Music, Tv } from 'lucide-react';
import type { NowPlayingDisplayMode, NowPlayingSource } from '../../types/nowPlaying';
import { getPlexServers, getPlexToken, type PlexServerResource } from '../../services/plex';

interface NowPlayingSettingsPanelProps {
  source: NowPlayingSource;
  setSource: (source: NowPlayingSource) => void;
  haBaseUrl: string;
  setHaBaseUrl: (url: string) => void;
  haAccessToken: string;
  setHaAccessToken: (token: string) => void;
  haEntityId: string;
  setHaEntityId: (entityId: string) => void;
  allowControls: boolean;
  setAllowControls: (val: boolean) => void;
  requirePinForControls: boolean;
  setRequirePinForControls: (val: boolean) => void;
  plexServerClientId: string;
  setPlexServerClientId: (id: string) => void;
  plexServerName: string;
  setPlexServerName: (name: string) => void;
  plexPlayerFilter: string;
  setPlexPlayerFilter: (val: string) => void;
  displayMode: NowPlayingDisplayMode;
  setDisplayMode: (mode: NowPlayingDisplayMode) => void;
  showProgress: boolean;
  setShowProgress: (val: boolean) => void;
  refreshIntervalSec: 10 | 15 | 30 | 60;
  setRefreshIntervalSec: (val: 10 | 15 | 30 | 60) => void;
}

export const NowPlayingSettingsPanel: React.FC<NowPlayingSettingsPanelProps> = ({
  source,
  setSource,
  haBaseUrl,
  setHaBaseUrl,
  haAccessToken,
  setHaAccessToken,
  haEntityId,
  setHaEntityId,
  allowControls,
  setAllowControls,
  requirePinForControls,
  setRequirePinForControls,
  plexServerClientId,
  setPlexServerClientId,
  plexServerName,
  setPlexServerName,
  plexPlayerFilter,
  setPlexPlayerFilter,
  displayMode,
  setDisplayMode,
  showProgress,
  setShowProgress,
  refreshIntervalSec,
  setRefreshIntervalSec,
}) => {
  const [showToken, setShowToken] = useState(false);
  const [plexServers, setPlexServers] = useState<PlexServerResource[]>([]);
  const [hasPlexAccount, setHasPlexAccount] = useState<boolean | null>(null);

  useEffect(() => {
    if (source !== 'plex') return;
    let active = true;
    void getPlexToken().then(async (token) => {
      if (!active) return;
      if (!token) {
        setHasPlexAccount(false);
        setPlexServers([]);
        return;
      }
      setHasPlexAccount(true);
      try {
        const list = await getPlexServers(token);
        if (active) setPlexServers(list);
      } catch {
        if (active) setPlexServers([]);
      }
    });
    return () => {
      active = false;
    };
  }, [source]);

  return (
    <div className="space-y-5 pt-2 border-t border-gray-800/80">
      <div className="flex items-center gap-2 text-emerald-400">
        <Disc3 className="w-4 h-4" />
        <h3 className="text-xs font-bold uppercase tracking-wider">Now Playing Source</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSource('home_assistant')}
          className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer ${
            source === 'home_assistant'
              ? 'bg-emerald-600/20 border-emerald-500/45 text-emerald-200'
              : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Home Assistant Player</span>
        </button>
        <button
          type="button"
          onClick={() => setSource('plex')}
          className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer ${
            source === 'plex'
              ? 'bg-amber-600/20 border-amber-500/45 text-amber-200'
              : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          <span>Plex Active Sessions</span>
        </button>
      </div>

      {source === 'home_assistant' ? (
        <div className="space-y-3 p-3 rounded-xl bg-gray-950/60 border border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-300">
              Home Assistant <code className="font-mono text-emerald-300">media_player</code>
            </span>
            <span className="text-[10px] text-emerald-300 flex items-center gap-1">
              <KeyRound className="w-3 h-3" />
              Token stays in local db.vault
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Home Assistant URL</label>
              <input
                type="url"
                value={haBaseUrl}
                onChange={(e) => setHaBaseUrl(e.target.value)}
                placeholder="http://homeassistant.local:8123"
                className="w-full rounded-xl bg-gray-900 border border-gray-800 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                Long-Lived Access Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={haAccessToken}
                  onChange={(e) => setHaAccessToken(e.target.value)}
                  autoComplete="off"
                  placeholder="Optional if already saved in Homelab"
                  className="w-full rounded-xl bg-gray-900 border border-gray-800 pl-2.5 pr-9 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-gray-400 mb-1">Media Player Entity ID</label>
            <input
              type="text"
              value={haEntityId}
              onChange={(e) => setHaEntityId(e.target.value)}
              placeholder="media_player.living_room_sonos"
              className="w-full rounded-xl bg-gray-900 border border-gray-800 px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowControls}
                onChange={(e) => setAllowControls(e.target.checked)}
                className="accent-emerald-500 cursor-pointer"
              />
              <span>Show Play / Pause / Skip / Mute controls</span>
            </label>

            {allowControls && (
              <label className="flex items-center gap-1.5 text-xs text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requirePinForControls}
                  onChange={(e) => setRequirePinForControls(e.target.checked)}
                  className="accent-amber-500 cursor-pointer"
                />
                <Lock className="w-3 h-3" />
                <span>Require Parent PIN</span>
              </label>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-3 rounded-xl bg-gray-950/60 border border-gray-800">
          {hasPlexAccount === false && (
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/35 text-[11px] text-amber-200">
              Pair your Plex account from the Dock Quick Menu first to display active Plex
              streams.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Plex Server</label>
              <select
                value={plexServerClientId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setPlexServerClientId(nextId);
                  const found = plexServers.find((s) => s.clientIdentifier === nextId);
                  setPlexServerName(found?.name || '');
                }}
                className="w-full rounded-xl bg-gray-900 border border-gray-800 px-2.5 py-2 text-xs text-white"
              >
                <option value="">{plexServerName || 'First Available Plex Server'}</option>
                {plexServers.map((s) => (
                  <option key={s.clientIdentifier} value={s.clientIdentifier}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                Room / Player Name Filter (Optional)
              </label>
              <input
                type="text"
                value={plexPlayerFilter}
                onChange={(e) => setPlexPlayerFilter(e.target.value)}
                placeholder="e.g. Living Room TV"
                className="w-full rounded-xl bg-gray-900 border border-gray-800 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Presentation & Polling */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-800/70">
        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">Layout</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['auto', 'card', 'compact'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplayMode(mode)}
                className={`py-2 rounded-xl border text-xs font-semibold capitalize cursor-pointer ${
                  displayMode === mode
                    ? 'bg-emerald-600/20 border-emerald-500/45 text-emerald-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">
            Refresh Interval
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {([10, 15, 30, 60] as const).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setRefreshIntervalSec(sec)}
                className={`py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                  refreshIntervalSec === sec
                    ? 'bg-emerald-600/20 border-emerald-500/45 text-emerald-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {sec < 60 ? `${sec}s` : '1m'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 text-xs text-gray-300 cursor-pointer">
        <span>Show playback progress bar</span>
        <input
          type="checkbox"
          checked={showProgress}
          onChange={(e) => setShowProgress(e.target.checked)}
          className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
        />
      </label>
    </div>
  );
};
