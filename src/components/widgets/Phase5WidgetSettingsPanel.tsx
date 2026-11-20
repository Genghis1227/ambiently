import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Plus, Server, ShieldAlert, Trash2 } from 'lucide-react';
import {
  MAX_HA_ENTITIES,
  MAX_HOMELAB_SERVICES,
  type HomeAssistantEntityTarget,
  type HomelabDisplayMode,
  type HomelabServiceTarget,
} from '../../types/phase5Widgets';
import {
  HOMELAB_HA_ENTITY_TEMPLATES,
  HOMELAB_SERVICE_PRESETS,
  createHomelabItemId,
  inferIconHintFromEntityId,
  isValidHomeAssistantEntityId,
} from '../../utils/homelabEngine';
import { fetchHomelabCapabilities } from '../../services/homelab';

interface HomelabSettingsPanelProps {
  services: HomelabServiceTarget[];
  setServices: (next: HomelabServiceTarget[]) => void;
  haBaseUrl: string;
  setHaBaseUrl: (val: string) => void;
  haAccessToken: string;
  setHaAccessToken: (val: string) => void;
  haEntities: HomeAssistantEntityTarget[];
  setHaEntities: (next: HomeAssistantEntityTarget[]) => void;
  displayMode: HomelabDisplayMode;
  setDisplayMode: (mode: HomelabDisplayMode) => void;
  showLatency: boolean;
  setShowLatency: (val: boolean) => void;
  refreshIntervalSec: 30 | 60 | 120 | 300;
  setRefreshIntervalSec: (val: 30 | 60 | 120 | 300) => void;
}

export const HomelabSettingsPanel: React.FC<HomelabSettingsPanelProps> = ({
  services,
  setServices,
  haBaseUrl,
  setHaBaseUrl,
  haAccessToken,
  setHaAccessToken,
  haEntities,
  setHaEntities,
  displayMode,
  setDisplayMode,
  showLatency,
  setShowLatency,
  refreshIntervalSec,
  setRefreshIntervalSec,
}) => {
  const [lanAllowed, setLanAllowed] = useState<boolean | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcUrl, setNewSvcUrl] = useState('');
  const [newEntityId, setNewEntityId] = useState('');
  const [newEntityLabel, setNewEntityLabel] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetchHomelabCapabilities(controller.signal)
      .then((res) => setLanAllowed(res.lanAllowed))
      .catch(() => setLanAllowed(null));
    return () => controller.abort();
  }, []);

  const handleAddPresetService = (presetMeta: (typeof HOMELAB_SERVICE_PRESETS)[number]) => {
    if (services.length >= MAX_HOMELAB_SERVICES) return;
    setServices([
      ...services,
      {
        id: createHomelabItemId('svc'),
        name: presetMeta.defaultName,
        url: presetMeta.sampleUrl,
        preset: presetMeta.preset,
        enabled: true,
      },
    ]);
  };

  const handleAddCustomService = () => {
    const cleanUrl = newSvcUrl.trim();
    const cleanName = newSvcName.trim();
    if (!cleanUrl) return;
    if (services.length >= MAX_HOMELAB_SERVICES) return;
    setServices([
      ...services,
      {
        id: createHomelabItemId('svc'),
        name: cleanName || cleanUrl,
        url: cleanUrl,
        preset: 'custom',
        enabled: true,
      },
    ]);
    setNewSvcName('');
    setNewSvcUrl('');
  };

  const handleAddTemplateEntity = (tpl: (typeof HOMELAB_HA_ENTITY_TEMPLATES)[number]) => {
    if (haEntities.length >= MAX_HA_ENTITIES) return;
    if (haEntities.some((e) => e.entityId === tpl.entityId)) return;
    setHaEntities([
      ...haEntities,
      {
        id: createHomelabItemId('ent'),
        entityId: tpl.entityId,
        label: tpl.label,
        iconHint: tpl.iconHint,
        enabled: true,
      },
    ]);
  };

  const handleAddCustomEntity = () => {
    const cleanId = newEntityId.trim().toLowerCase();
    if (!isValidHomeAssistantEntityId(cleanId)) return;
    if (haEntities.length >= MAX_HA_ENTITIES) return;
    if (haEntities.some((e) => e.entityId === cleanId)) return;
    setHaEntities([
      ...haEntities,
      {
        id: createHomelabItemId('ent'),
        entityId: cleanId,
        label: newEntityLabel.trim() || undefined,
        iconHint: inferIconHintFromEntityId(cleanId),
        enabled: true,
      },
    ]);
    setNewEntityId('');
    setNewEntityLabel('');
  };

  return (
    <div className="space-y-5 pt-2 border-t border-gray-800/80">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-cyan-400">
          <Server className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            Home Lab & Home Assistant
          </h3>
        </div>
        {lanAllowed !== null && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
              lanAllowed
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
            }`}
          >
            {lanAllowed ? 'LAN Mode Active' : 'Public HTTPS Only'}
          </span>
        )}
      </div>

      {lanAllowed === false && (
        <div className="p-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 text-[11px] text-amber-200 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Private LAN (<code className="font-mono">192.168.x.x</code> /{' '}
            <code className="font-mono">.local</code>) endpoints are disabled on this server. Set{' '}
            <code className="font-mono">AMBIENTLY_ALLOW_PRIVATE_FEEDS=true</code> in Docker / Pi
            or point to public HTTPS reverse-proxy URLs.
          </span>
        </div>
      )}

      {/* Local / Self-Hosted Services */}
      <div className="space-y-2.5">
        <label className="block text-[11px] font-semibold text-gray-300">
          Self-Hosted Services ({services.length}/{MAX_HOMELAB_SERVICES})
        </label>

        <div className="flex flex-wrap gap-1.5">
          {HOMELAB_SERVICE_PRESETS.map((preset) => (
            <button
              key={preset.preset}
              type="button"
              onClick={() => handleAddPresetService(preset)}
              disabled={services.length >= MAX_HOMELAB_SERVICES}
              className="px-2 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-[10px] font-semibold text-gray-300 hover:text-white cursor-pointer disabled:opacity-40"
            >
              + {preset.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {services.map((svc, idx) => (
            <div
              key={svc.id}
              className="p-2 rounded-xl bg-gray-950/70 border border-gray-800 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={svc.enabled}
                  onChange={(e) => {
                    const next = [...services];
                    next[idx] = { ...svc, enabled: e.target.checked };
                    setServices(next);
                  }}
                  className="accent-cyan-500 cursor-pointer"
                />
                <input
                  type="text"
                  value={svc.name}
                  onChange={(e) => {
                    const next = [...services];
                    next[idx] = { ...svc, name: e.target.value };
                    setServices(next);
                  }}
                  placeholder="Service name"
                  className="flex-1 rounded-lg bg-gray-900 border border-gray-800 px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => setServices(services.filter((s) => s.id !== svc.id))}
                  className="p-1 text-gray-400 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="url"
                value={svc.url}
                onChange={(e) => {
                  const next = [...services];
                  next[idx] = { ...svc, url: e.target.value };
                  setServices(next);
                }}
                placeholder="http://192.168.1.50:3001"
                className="w-full rounded-lg bg-gray-900 border border-gray-800 px-2 py-1 text-[11px] font-mono text-cyan-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
          <input
            type="text"
            value={newSvcName}
            onChange={(e) => setNewSvcName(e.target.value)}
            placeholder="Custom name"
            className="sm:col-span-2 rounded-xl bg-gray-950 border border-gray-800 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
          />
          <input
            type="url"
            value={newSvcUrl}
            onChange={(e) => setNewSvcUrl(e.target.value)}
            placeholder="http://192.168.1.50:8080/health"
            className="sm:col-span-2 rounded-xl bg-gray-950 border border-gray-800 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={handleAddCustomService}
            disabled={!newSvcUrl.trim() || services.length >= MAX_HOMELAB_SERVICES}
            className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Home Assistant Read-Only Entities */}
      <div className="space-y-2.5 pt-3 border-t border-gray-800/70">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-gray-300">
            Home Assistant Read-Only Entities ({haEntities.length}/{MAX_HA_ENTITIES})
          </label>
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
              className="w-full rounded-xl bg-gray-950 border border-gray-800 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">
              Long-Lived Access Token (Never Synced)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={haAccessToken}
                onChange={(e) => setHaAccessToken(e.target.value)}
                autoComplete="off"
                placeholder="Paste Home Assistant token..."
                className="w-full rounded-xl bg-gray-950 border border-gray-800 pl-2.5 pr-9 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
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

        <div className="flex flex-wrap gap-1.5">
          {HOMELAB_HA_ENTITY_TEMPLATES.map((tpl) => (
            <button
              key={tpl.entityId}
              type="button"
              onClick={() => handleAddTemplateEntity(tpl)}
              disabled={
                haEntities.length >= MAX_HA_ENTITIES ||
                haEntities.some((e) => e.entityId === tpl.entityId)
              }
              className="px-2 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-[10px] font-semibold text-gray-300 hover:text-white cursor-pointer disabled:opacity-40"
            >
              + {tpl.label}
            </button>
          ))}
        </div>

        {haEntities.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {haEntities.map((ent, idx) => (
              <div
                key={ent.id}
                className="flex items-center gap-2 p-1.5 rounded-xl bg-gray-950/70 border border-gray-800"
              >
                <input
                  type="checkbox"
                  checked={ent.enabled}
                  onChange={(e) => {
                    const next = [...haEntities];
                    next[idx] = { ...ent, enabled: e.target.checked };
                    setHaEntities(next);
                  }}
                  className="accent-cyan-500 cursor-pointer"
                />
                <span className="text-[11px] font-mono text-cyan-300 truncate flex-1">
                  {ent.entityId}
                </span>
                <input
                  type="text"
                  value={ent.label || ''}
                  onChange={(e) => {
                    const next = [...haEntities];
                    next[idx] = { ...ent, label: e.target.value };
                    setHaEntities(next);
                  }}
                  placeholder="Label"
                  className="w-28 rounded-lg bg-gray-900 border border-gray-800 px-2 py-1 text-[11px] text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setHaEntities(haEntities.filter((e) => e.id !== ent.id))}
                  className="p-1 text-gray-400 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
          <input
            type="text"
            value={newEntityId}
            onChange={(e) => setNewEntityId(e.target.value)}
            placeholder="sensor.living_room_temp"
            className="sm:col-span-2 rounded-xl bg-gray-950 border border-gray-800 px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
          />
          <input
            type="text"
            value={newEntityLabel}
            onChange={(e) => setNewEntityLabel(e.target.value)}
            placeholder="Display label"
            className="sm:col-span-2 rounded-xl bg-gray-950 border border-gray-800 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={handleAddCustomEntity}
            disabled={
              !isValidHomeAssistantEntityId(newEntityId) || haEntities.length >= MAX_HA_ENTITIES
            }
            className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Layout & Polling */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-800/70">
        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1.5">Layout</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['auto', 'split', 'compact'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplayMode(mode)}
                className={`py-2 rounded-xl border text-xs font-semibold capitalize cursor-pointer ${
                  displayMode === mode
                    ? 'bg-cyan-600/20 border-cyan-500/45 text-cyan-200'
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
            {([30, 60, 120, 300] as const).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setRefreshIntervalSec(sec)}
                className={`py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                  refreshIntervalSec === sec
                    ? 'bg-cyan-600/20 border-cyan-500/45 text-cyan-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {sec < 60 ? `${sec}s` : `${sec / 60}m`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 text-xs text-gray-300 cursor-pointer">
        <span>Show service response latency badges (ms)</span>
        <input
          type="checkbox"
          checked={showLatency}
          onChange={(e) => setShowLatency(e.target.checked)}
          className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
        />
      </label>
    </div>
  );
};
