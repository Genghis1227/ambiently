import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Dices,
  Eye,
  EyeOff,
  Home,
  ListChecks,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  Wifi,
} from 'lucide-react';
import {
  MAX_DECISION_OPTIONS,
  MAX_EMERGENCY_CONTACTS,
  MAX_ROUTINES_PER_WIDGET,
  type DecisionMakerMode,
  type DecisionOption,
  type HouseSitterContact,
  type RoutineCadenceType,
  type RoutineItem,
  type WifiCardDisplayView,
  type WifiSecurityType,
} from '../../types/phase2Widgets';
import { swapAlternatingWeekParity, WEEKDAY_SHORT_LABELS } from '../../utils/routinesEngine';
import {
  DECISION_STARTER_PRESETS,
  DECISION_WHEEL_PALETTE,
  importOptionsFromProfiles,
  importOptionsFromRecipes,
} from '../../utils/decisionEngine';
import { useMealStore } from '../../stores/useMealStore';
import { useProfileStore } from '../../stores/useProfileStore';

interface RoutinesSettingsPanelProps {
  items: RoutineItem[];
  setItems: (next: RoutineItem[]) => void;
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  onClearHistory: () => void;
}

export const RoutinesSettingsPanel: React.FC<RoutinesSettingsPanelProps> = ({
  items,
  setItems,
  compactMode,
  setCompactMode,
  onClearHistory,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('✓');
  const [newCadence, setNewCadence] = useState<RoutineCadenceType>('daily');

  const updateItem = (idx: number, patch: Partial<RoutineItem>) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const moveItem = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    const [moved] = copy.splice(idx, 1);
    copy.splice(target, 0, moved);
    setItems(copy);
  };

  const handleAdd = () => {
    const trimmed = newLabel.trim();
    if (!trimmed || items.length >= MAX_ROUTINES_PER_WIDGET) return;
    const nextItem: RoutineItem = {
      id: `routine-${Date.now()}`,
      label: trimmed.slice(0, 60),
      emoji: newEmoji.trim() || undefined,
      cadence: newCadence,
      ...(newCadence === 'every_n_days' ? { intervalDays: 7 } : {}),
      ...(newCadence === 'alternating_week'
        ? {
            pickupDayOfWeek: 4,
            anchorDate: '2026-01-01',
            weekALabel: 'Trash + Recycling',
            weekBLabel: 'Trash Only',
          }
        : {}),
      completions: [],
    };
    setItems([...items, nextItem]);
    setNewLabel('');
    setNewEmoji('✓');
  };

  return (
    <div className="space-y-3 pt-2 border-t border-gray-800">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
          <ListChecks className="w-4 h-4" />
          <span>Household Check-Ins ({items.length}/{MAX_ROUTINES_PER_WIDGET})</span>
        </div>
        <button
          type="button"
          onClick={onClearHistory}
          className="px-2.5 py-1 rounded-lg bg-gray-950 hover:bg-gray-800 border border-gray-800 text-[11px] font-semibold text-gray-300 cursor-pointer"
        >
          Clear Check-In Stamps
        </button>
      </div>

      {/* Add Row */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newEmoji}
          onChange={(e) => setNewEmoji(e.target.value)}
          maxLength={4}
          className="w-10 text-center rounded-xl bg-gray-950 border border-gray-800 py-2 text-xs text-white"
        />
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder="New tracker (e.g., Feed Dog, HVAC Filter)..."
          className="flex-1 rounded-xl bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white placeholder-gray-500"
        />
        <select
          value={newCadence}
          onChange={(e) => setNewCadence(e.target.value as RoutineCadenceType)}
          className="rounded-xl bg-gray-950 border border-gray-800 px-2 py-2 text-xs text-white"
        >
          <option value="daily">Daily</option>
          <option value="am_pm">AM / PM</option>
          <option value="alternating_week">Alt Week</option>
          <option value="every_n_days">Every N Days</option>
        </select>
        <button
          type="button"
          onClick={handleAdd}
          disabled={items.length >= MAX_ROUTINES_PER_WIDGET}
          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>

      {/* Existing Routines */}
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="p-2.5 rounded-xl bg-gray-950 border border-gray-800 space-y-2"
          >
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={item.emoji || ''}
                onChange={(e) => updateItem(idx, { emoji: e.target.value })}
                placeholder="✓"
                maxLength={4}
                className="w-9 text-center rounded-lg bg-gray-900 border border-gray-800 py-1 text-xs text-white"
              />
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(idx, { label: e.target.value })}
                className="flex-1 rounded-lg bg-gray-900 border border-gray-800 px-2.5 py-1 text-xs text-white"
              />
              <select
                value={item.cadence}
                onChange={(e) => updateItem(idx, { cadence: e.target.value as RoutineCadenceType })}
                className="rounded-lg bg-gray-900 border border-gray-800 px-2 py-1 text-[11px] text-gray-200"
              >
                <option value="daily">Daily</option>
                <option value="am_pm">AM / PM</option>
                <option value="alternating_week">Alt Week</option>
                <option value="every_n_days">Every N Days</option>
              </select>
              <button
                type="button"
                onClick={() => moveItem(idx, -1)}
                disabled={idx === 0}
                className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer"
                title="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveItem(idx, 1)}
                disabled={idx === items.length - 1}
                className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer"
                title="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setItems(items.filter((_, i) => i !== idx))}
                className="p-1 rounded text-gray-500 hover:text-rose-400 cursor-pointer"
                title="Remove routine"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {item.cadence === 'every_n_days' && (
              <div className="flex items-center gap-2 pl-10 text-xs text-gray-300">
                <span>Repeat every</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={item.intervalDays ?? 7}
                  onChange={(e) =>
                    updateItem(idx, {
                      intervalDays: Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1)),
                    })
                  }
                  className="w-16 rounded-lg bg-gray-900 border border-gray-800 px-2 py-1 text-center font-mono text-xs text-white"
                />
                <span>days</span>
              </div>
            )}

            {item.cadence === 'alternating_week' && (
              <div className="space-y-1.5 pl-10">
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={item.weekALabel ?? 'Trash + Recycling'}
                    onChange={(e) => updateItem(idx, { weekALabel: e.target.value })}
                    placeholder="Week A label"
                    className="rounded-lg bg-gray-900 border border-gray-800 px-2 py-1 text-[11px] text-white"
                  />
                  <input
                    type="text"
                    value={item.weekBLabel ?? 'Trash Only'}
                    onChange={(e) => updateItem(idx, { weekBLabel: e.target.value })}
                    placeholder="Week B label"
                    className="rounded-lg bg-gray-900 border border-gray-800 px-2 py-1 text-[11px] text-white"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <select
                    value={item.pickupDayOfWeek ?? 4}
                    onChange={(e) => updateItem(idx, { pickupDayOfWeek: Number(e.target.value) })}
                    className="rounded-lg bg-gray-900 border border-gray-800 px-2 py-1 text-gray-200"
                  >
                    {WEEKDAY_SHORT_LABELS.map((day, dIdx) => (
                      <option key={day} value={dIdx}>
                        Pickup on {day}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      updateItem(idx, {
                        anchorDate: swapAlternatingWeekParity(item.anchorDate, new Date()),
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-700 text-amber-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Swap This Week</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950 border border-gray-800">
        <span className="text-xs text-gray-300 font-medium">Compact Row Density</span>
        <button
          type="button"
          onClick={() => setCompactMode(!compactMode)}
          className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
            compactMode ? 'bg-emerald-500' : 'bg-gray-700'
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow transition-transform ${
              compactMode ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

interface WifiQrSettingsPanelProps {
  ssid: string;
  setSsid: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  security: WifiSecurityType;
  setSecurity: (v: WifiSecurityType) => void;
  hiddenNetwork: boolean;
  setHiddenNetwork: (v: boolean) => void;
  activeView: WifiCardDisplayView;
  setActiveView: (v: WifiCardDisplayView) => void;
  autoHidePasswordSec: number;
  setAutoHidePasswordSec: (v: number) => void;
  homeAddress: string;
  setHomeAddress: (v: string) => void;
  emergencyContacts: HouseSitterContact[];
  setEmergencyContacts: (v: HouseSitterContact[]) => void;
  sitterNotes: string;
  setSitterNotes: (v: string) => void;
}

export const WifiQrSettingsPanel: React.FC<WifiQrSettingsPanelProps> = ({
  ssid,
  setSsid,
  password,
  setPassword,
  security,
  setSecurity,
  hiddenNetwork,
  setHiddenNetwork,
  activeView,
  setActiveView,
  autoHidePasswordSec,
  setAutoHidePasswordSec,
  homeAddress,
  setHomeAddress,
  emergencyContacts,
  setEmergencyContacts,
  sitterNotes,
  setSitterNotes,
}) => {
  const [showPassInput, setShowPassInput] = useState(false);

  const handleAddContact = () => {
    if (emergencyContacts.length >= MAX_EMERGENCY_CONTACTS) return;
    setEmergencyContacts([
      ...emergencyContacts,
      { id: `ec-${Date.now()}`, roleLabel: 'Parents', name: '', phone: '' },
    ]);
  };

  const updateContact = (idx: number, patch: Partial<HouseSitterContact>) => {
    setEmergencyContacts(
      emergencyContacts.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );
  };

  return (
    <div className="space-y-3.5 pt-2 border-t border-gray-800">
      <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
        <Wifi className="w-4 h-4" />
        <span>Guest Wi-Fi QR Network</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <label className="text-[11px] font-semibold text-gray-400 block mb-1">
            Wi-Fi Network Name (SSID)
          </label>
          <input
            type="text"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="e.g., Trinh_Guest"
            className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white placeholder-gray-500"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 block mb-1">
            Security
          </label>
          <select
            value={security}
            onChange={(e) => setSecurity(e.target.value as WifiSecurityType)}
            className="w-full rounded-xl bg-gray-950 border border-gray-800 px-2.5 py-2 text-xs text-white"
          >
            <option value="WPA">WPA / WPA2 / WPA3</option>
            <option value="WEP">WEP (Legacy)</option>
            <option value="nopass">Open (No Password)</option>
          </select>
        </div>
      </div>

      {security !== 'nopass' && (
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-gray-400 block">
            Wi-Fi Password
          </label>
          <div className="relative flex items-center">
            <input
              type={showPassInput ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Guest Wi-Fi password..."
              autoComplete="off"
              className="w-full rounded-xl bg-gray-950 border border-gray-800 pl-3 pr-10 py-2 text-xs font-mono text-white placeholder-gray-500"
            />
            <button
              type="button"
              onClick={() => setShowPassInput((v) => !v)}
              className="absolute right-2.5 text-gray-400 hover:text-white cursor-pointer"
              title={showPassInput ? 'Hide password' : 'Show password'}
            >
              {showPassInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Device-Local Vault Security Notice */}
      <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Device-Local Wi-Fi Vault (Zero Cloud Sync)</span>
        </div>
        <p className="text-[10px] text-emerald-200/80 leading-snug">
          Your Wi-Fi network name, password, security mode, and hidden-SSID setting are saved strictly in this device’s local <code className="font-mono">db.vault</code> and never sync to Supabase Cloud. Tile layout and House-Sitter details still sync across your board.
        </p>
      </div>

      {/* View & Auto-Hide */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="text-[11px] font-semibold text-gray-400 block mb-1">
            Default Card View
          </label>
          <select
            value={activeView}
            onChange={(e) => setActiveView(e.target.value as WifiCardDisplayView)}
            className="w-full rounded-xl bg-gray-950 border border-gray-800 px-2.5 py-2 text-xs text-white"
          >
            <option value="wifi">Wi-Fi QR Code</option>
            <option value="sitter">House-Sitter Info</option>
            <option value="split">Split Side-by-Side</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-gray-400 block mb-1">
            Auto-Hide Password After
          </label>
          <select
            value={autoHidePasswordSec}
            onChange={(e) => setAutoHidePasswordSec(Number(e.target.value))}
            className="w-full rounded-xl bg-gray-950 border border-gray-800 px-2.5 py-2 text-xs text-white"
          >
            <option value={15}>15 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>60 seconds</option>
            <option value={120}>2 minutes</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950 border border-gray-800">
        <span className="text-xs text-gray-300 font-medium">Hidden Wi-Fi SSID (H:true)</span>
        <button
          type="button"
          onClick={() => setHiddenNetwork(!hiddenNetwork)}
          className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
            hiddenNetwork ? 'bg-cyan-500' : 'bg-gray-700'
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow transition-transform ${
              hiddenNetwork ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* House-Sitter / Emergency Contacts Section */}
      <div className="space-y-2.5 pt-2 border-t border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <Home className="w-4 h-4" />
            <span>House-Sitter & Babysitter Info</span>
          </div>
          <button
            type="button"
            onClick={handleAddContact}
            disabled={emergencyContacts.length >= MAX_EMERGENCY_CONTACTS}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 disabled:opacity-40 text-amber-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Add Contact</span>
          </button>
        </div>

        <input
          type="text"
          value={homeAddress}
          onChange={(e) => setHomeAddress(e.target.value)}
          placeholder="Home street address (helpful for 911 / delivery drivers)..."
          className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white placeholder-gray-500"
        />

        {emergencyContacts.length > 0 && (
          <div className="space-y-1.5">
            {emergencyContacts.map((contact, idx) => (
              <div key={contact.id} className="grid grid-cols-12 gap-1.5 items-center">
                <input
                  type="text"
                  value={contact.roleLabel}
                  onChange={(e) => updateContact(idx, { roleLabel: e.target.value })}
                  placeholder="Role"
                  className="col-span-3 rounded-lg bg-gray-950 border border-gray-800 px-2 py-1.5 text-[11px] text-white"
                />
                <input
                  type="text"
                  value={contact.name}
                  onChange={(e) => updateContact(idx, { name: e.target.value })}
                  placeholder="Name"
                  className="col-span-4 rounded-lg bg-gray-950 border border-gray-800 px-2 py-1.5 text-[11px] text-white"
                />
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => updateContact(idx, { phone: e.target.value })}
                  placeholder="Phone"
                  className="col-span-4 rounded-lg bg-gray-950 border border-gray-800 px-2 py-1.5 text-[11px] font-mono text-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    setEmergencyContacts(emergencyContacts.filter((_, i) => i !== idx))
                  }
                  className="col-span-1 p-1 text-gray-500 hover:text-rose-400 cursor-pointer flex justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          rows={3}
          value={sitterNotes}
          onChange={(e) => setSitterNotes(e.target.value)}
          placeholder="Gate code reminders, pet feeding amounts, bedtime routine, breaker box location..."
          className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white placeholder-gray-500"
        />
      </div>
    </div>
  );
};

interface DecisionMakerSettingsPanelProps {
  mode: DecisionMakerMode;
  setMode: (v: DecisionMakerMode) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  options: DecisionOption[];
  setOptions: (v: DecisionOption[]) => void;
  allowMultiVote: boolean;
  setAllowMultiVote: (v: boolean) => void;
  removeWinnerOnSpin: boolean;
  setRemoveWinnerOnSpin: (v: boolean) => void;
  onClearVotesAndEliminated: () => void;
}

export const DecisionMakerSettingsPanel: React.FC<DecisionMakerSettingsPanelProps> = ({
  mode,
  setMode,
  prompt,
  setPrompt,
  options,
  setOptions,
  allowMultiVote,
  setAllowMultiVote,
  removeWinnerOnSpin,
  setRemoveWinnerOnSpin,
  onClearVotesAndEliminated,
}) => {
  const recipes = useMealStore((s) => s.snapshot.recipes);
  const profiles = useProfileStore((s) => s.profiles);
  const [newOptionLabel, setNewOptionLabel] = useState('');

  const handleAddOption = () => {
    const label = newOptionLabel.trim();
    if (!label || options.length >= MAX_DECISION_OPTIONS) return;
    setOptions([
      ...options,
      {
        id: `opt-${Date.now()}`,
        label: label.slice(0, 60),
        color: DECISION_WHEEL_PALETTE[options.length % DECISION_WHEEL_PALETTE.length],
        sourceType: 'custom',
      },
    ]);
    setNewOptionLabel('');
  };

  return (
    <div className="space-y-3 pt-2 border-t border-gray-800">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
          <Dices className="w-4 h-4" />
          <span>Decision Wheel & Poll ({options.length}/{MAX_DECISION_OPTIONS})</span>
        </div>
        <button
          type="button"
          onClick={onClearVotesAndEliminated}
          className="px-2.5 py-1 rounded-lg bg-gray-950 hover:bg-gray-800 border border-gray-800 text-[11px] font-semibold text-gray-300 cursor-pointer"
        >
          Reset Votes & Spins
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-semibold text-gray-400 block mb-1">
            Default Mode
          </label>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-950 p-1 border border-gray-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode('wheel')}
              className={`py-1.5 rounded-lg cursor-pointer ${
                mode === 'wheel' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Wheel
            </button>
            <button
              type="button"
              onClick={() => setMode('poll')}
              className={`py-1.5 rounded-lg cursor-pointer ${
                mode === 'poll' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Poll
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-gray-400 block mb-1">
            Question / Prompt
          </label>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should we pick?"
            className="w-full rounded-xl bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white"
          />
        </div>
      </div>

      {/* Importers */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setOptions(importOptionsFromRecipes(options, recipes, false))}
          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
        >
          <Utensils className="w-3 h-3" />
          <span>Import Saved Recipes</span>
        </button>
        <button
          type="button"
          onClick={() => setOptions(importOptionsFromRecipes(options, recipes, true))}
          className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
        >
          <Sparkles className="w-3 h-3" />
          <span>Import Favorites</span>
        </button>
        <button
          type="button"
          onClick={() => setOptions(importOptionsFromProfiles(options, profiles))}
          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
        >
          <Users className="w-3 h-3" />
          <span>Import Family Members</span>
        </button>
        {DECISION_STARTER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              setPrompt(preset.prompt);
              setOptions(
                preset.options.map((o, idx) => ({
                  id: `opt-${preset.id}-${idx}`,
                  label: o.label,
                  ...(o.emoji ? { emoji: o.emoji } : {}),
                  color: DECISION_WHEEL_PALETTE[idx % DECISION_WHEEL_PALETTE.length],
                  sourceType: 'custom',
                }))
              );
            }}
            className="px-2 py-1 rounded-lg bg-gray-950 hover:bg-gray-800 border border-gray-800 text-[10px] font-semibold text-gray-300 cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Add Custom Option */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newOptionLabel}
          onChange={(e) => setNewOptionLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
          placeholder="Add option..."
          className="flex-1 rounded-xl bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white placeholder-gray-500"
        />
        <button
          type="button"
          onClick={handleAddOption}
          disabled={options.length >= MAX_DECISION_OPTIONS}
          className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>

      {/* Option List */}
      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
        {options.map((opt, idx) => (
          <div
            key={opt.id}
            className="flex items-center gap-2 p-1.5 rounded-xl bg-gray-950 border border-gray-800"
          >
            <input
              type="color"
              value={opt.color || DECISION_WHEEL_PALETTE[idx % DECISION_WHEEL_PALETTE.length]}
              onChange={(e) =>
                setOptions(
                  options.map((o, i) => (i === idx ? { ...o, color: e.target.value } : o))
                )
              }
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
              aria-label={`Color for ${opt.label}`}
            />
            <input
              type="text"
              value={opt.emoji || ''}
              onChange={(e) =>
                setOptions(
                  options.map((o, i) => (i === idx ? { ...o, emoji: e.target.value } : o))
                )
              }
              placeholder="✨"
              maxLength={4}
              className="w-8 text-center rounded-lg bg-gray-900 border border-gray-800 py-1 text-xs text-white"
            />
            <input
              type="text"
              value={opt.label}
              onChange={(e) =>
                setOptions(
                  options.map((o, i) => (i === idx ? { ...o, label: e.target.value } : o))
                )
              }
              className="flex-1 rounded-lg bg-gray-900 border border-gray-800 px-2.5 py-1 text-xs text-white"
            />
            <button
              type="button"
              onClick={() => setOptions(options.filter((_, i) => i !== idx))}
              className="p-1 text-gray-500 hover:text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950 border border-gray-800">
          <span className="text-xs text-gray-300 font-medium">Multi-Vote per Person</span>
          <button
            type="button"
            onClick={() => setAllowMultiVote(!allowMultiVote)}
            className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
              allowMultiVote ? 'bg-blue-500' : 'bg-gray-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow transition-transform ${
                allowMultiVote ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950 border border-gray-800">
          <span className="text-xs text-gray-300 font-medium">Hide Winner Next Spin</span>
          <button
            type="button"
            onClick={() => setRemoveWinnerOnSpin(!removeWinnerOnSpin)}
            className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
              removeWinnerOnSpin ? 'bg-amber-500' : 'bg-gray-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow transition-transform ${
                removeWinnerOnSpin ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
