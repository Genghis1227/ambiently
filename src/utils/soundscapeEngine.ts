import type {
  SoundscapeChannelId,
  SoundscapeChannelLevels,
  SoundscapePresetId,
  SoundscapeSleepTimerMin,
} from '../types/phase4Widgets';

export interface SoundscapeChannelMeta {
  id: SoundscapeChannelId;
  label: string;
  shortLabel: string;
  description: string;
}

export const SOUNDSCAPE_CHANNELS: SoundscapeChannelMeta[] = [
  {
    id: 'rain',
    label: 'Rain',
    shortLabel: 'Rain',
    description: 'Soft overhead rainfall & leaf patter',
  },
  {
    id: 'fireplace',
    label: 'Fireplace Crackle',
    shortLabel: 'Fireplace',
    description: 'Warm hearth embers with wood pops',
  },
  {
    id: 'brown_noise',
    label: 'Brown Noise',
    shortLabel: 'Brown',
    description: 'Deep warm low-frequency acoustic blanket',
  },
  {
    id: 'ocean',
    label: 'Ocean Waves',
    shortLabel: 'Ocean',
    description: 'Slow rolling coastal surf & tide swell',
  },
  {
    id: 'forest_wind',
    label: 'Forest Wind',
    shortLabel: 'Wind',
    description: 'Gentle pine canopy breeze',
  },
];

export interface SoundscapePresetMeta {
  id: Exclude<SoundscapePresetId, 'custom'>;
  label: string;
  channels: SoundscapeChannelLevels;
}

export const SOUNDSCAPE_PRESETS: Record<Exclude<SoundscapePresetId, 'custom'>, SoundscapePresetMeta> = {
  cozy_hearth: {
    id: 'cozy_hearth',
    label: 'Cozy Hearth',
    channels: { rain: 35, fireplace: 65, brown_noise: 15, ocean: 0, forest_wind: 0 },
  },
  rainy_study: {
    id: 'rainy_study',
    label: 'Rainy Study',
    channels: { rain: 65, fireplace: 20, brown_noise: 30, ocean: 0, forest_wind: 15 },
  },
  coastal_breeze: {
    id: 'coastal_breeze',
    label: 'Coastal Breeze',
    channels: { rain: 0, fireplace: 0, brown_noise: 10, ocean: 70, forest_wind: 30 },
  },
  forest_morning: {
    id: 'forest_morning',
    label: 'Forest Morning',
    channels: { rain: 15, fireplace: 0, brown_noise: 0, ocean: 0, forest_wind: 65 },
  },
  deep_slumber: {
    id: 'deep_slumber',
    label: 'Deep Slumber',
    channels: { rain: 20, fireplace: 0, brown_noise: 70, ocean: 25, forest_wind: 0 },
  },
};

export const DEFAULT_SOUNDSCAPE_CHANNELS: SoundscapeChannelLevels = {
  ...SOUNDSCAPE_PRESETS.cozy_hearth.channels,
};

export const DEFAULT_SOUNDSCAPE_MASTER_VOLUME = 70;

export const SOUNDSCAPE_SLEEP_OPTIONS: SoundscapeSleepTimerMin[] = [0, 15, 30, 60, 90];

function clampLevel(raw: unknown, fallback: number): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function resolveSoundscapeChannels(
  raw?: Partial<SoundscapeChannelLevels> | null
): SoundscapeChannelLevels {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SOUNDSCAPE_CHANNELS };
  }
  const hasAnyChannelKey = SOUNDSCAPE_CHANNELS.some(
    (ch) => raw[ch.id] !== undefined && Number.isFinite(Number(raw[ch.id]))
  );
  if (!hasAnyChannelKey) {
    return { ...DEFAULT_SOUNDSCAPE_CHANNELS };
  }
  return {
    rain: clampLevel(raw.rain, 0),
    fireplace: clampLevel(raw.fireplace, 0),
    brown_noise: clampLevel(raw.brown_noise, 0),
    ocean: clampLevel(raw.ocean, 0),
    forest_wind: clampLevel(raw.forest_wind, 0),
  };
}

export function resolveMasterVolume(raw?: number | null): number {
  return clampLevel(raw, DEFAULT_SOUNDSCAPE_MASTER_VOLUME);
}

export function detectMatchingSoundscapePreset(
  channels: SoundscapeChannelLevels
): SoundscapePresetId {
  for (const preset of Object.values(SOUNDSCAPE_PRESETS)) {
    const exactMatch = SOUNDSCAPE_CHANNELS.every(
      (ch) => channels[ch.id] === preset.channels[ch.id]
    );
    if (exactMatch) return preset.id;
  }
  return 'custom';
}

export function hasAudibleSoundscapeChannel(
  channels: SoundscapeChannelLevels,
  masterVolume: number
): boolean {
  if (masterVolume <= 0) return false;
  return SOUNDSCAPE_CHANNELS.some((ch) => channels[ch.id] > 0);
}

export function shouldAutoFadeOutForNightMode(params: {
  wasNightMode: boolean;
  isNightMode: boolean;
  isPlaying: boolean;
  fadeOutOnNightMode: boolean;
}): boolean {
  return !params.wasNightMode && params.isNightMode && params.isPlaying && params.fadeOutOnNightMode;
}

export function formatSleepTimerRemaining(remainingSec: number): string {
  const safe = Math.max(0, Math.floor(remainingSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export type NoiseBufferKind = 'white' | 'pink' | 'brown' | 'crackle';

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates seamless loopable procedural noise PCM data using a deterministic PRNG and an
 * equal-power boundary crossfade so AudioBufferSourceNode loops cleanly with zero clicks.
 */
export function createCrossfadedNoiseBufferData(
  sampleRate: number,
  durationSec: number,
  kind: NoiseBufferKind,
  seed: number = 0x5f3759df
): Float32Array {
  const safeRate = Math.max(8000, Math.round(sampleRate));
  const safeDuration = Math.max(0.25, durationSec);
  const totalSamples = Math.max(256, Math.round(safeRate * safeDuration));
  const fadeSamples = Math.min(Math.floor(totalSamples * 0.15), Math.round(safeRate * 0.25));
  const raw = new Float32Array(totalSamples + fadeSamples);
  const rand = createMulberry32(seed);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let brownLast = 0;
  let crackleEnv = 0;

  for (let i = 0; i < raw.length; i++) {
    const white = rand() * 2 - 1;

    if (kind === 'white') {
      raw[i] = Math.max(-1, Math.min(1, white * 0.85));
    } else if (kind === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      raw[i] = Math.max(-1, Math.min(1, pink));
    } else if (kind === 'brown') {
      brownLast = (brownLast + 0.025 * white) / 1.025;
      raw[i] = Math.max(-1, Math.min(1, brownLast * 3.2));
    } else {
      // Sparse firewood crackle impulses with crisp exponential snap decay
      if (rand() < 0.0016) {
        crackleEnv = Math.min(1, crackleEnv + 0.35 + rand() * 0.65);
      }
      crackleEnv *= 0.992;
      const sample = white * crackleEnv * 0.95;
      raw[i] = Math.max(-1, Math.min(1, sample));
    }
  }

  const out = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    out[i] = raw[i];
  }

  for (let i = 0; i < fadeSamples; i++) {
    const ratio = i / Math.max(1, fadeSamples);
    const angle = ratio * (Math.PI / 2);
    out[i] = Math.max(
      -1,
      Math.min(1, raw[totalSamples + i] * Math.cos(angle) + raw[i] * Math.sin(angle))
    );
  }

  return out;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

interface ChannelGraph {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
}

export class SoundscapeAudioController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private channelGraphs: Partial<Record<SoundscapeChannelId, ChannelGraph>> = {};
  private fadeTimerId: number | null = null;

  private clearFadeTimer(): void {
    if (this.fadeTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.fadeTimerId);
      this.fadeTimerId = null;
    }
  }

  private createLoopBuffer(ctx: AudioContext, durationSec: number, kind: NoiseBufferKind, seed: number): AudioBuffer {
    const data = createCrossfadedNoiseBufferData(ctx.sampleRate, durationSec, kind, seed);
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  }

  private ensureGraph(channels: SoundscapeChannelLevels, masterVolume: number): boolean {
    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return false;

    if (!this.ctx || this.ctx.state === 'closed') {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return false;
      }

      const ctx = this.ctx;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.connect(ctx.destination);
      this.masterGain = master;

      const pinkBuf = this.createLoopBuffer(ctx, 4.0, 'pink', 0x13572468);
      const brownBuf = this.createLoopBuffer(ctx, 4.5, 'brown', 0x24681357);
      const crackleBuf = this.createLoopBuffer(ctx, 5.0, 'crackle', 0x9e3779b9);

      const startLooped = (buffer: AudioBuffer, playbackRate = 1): AudioBufferSourceNode => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.playbackRate.value = playbackRate;
        src.start();
        return src;
      };

      // 1. Rain: overhead rainfall body + crisp droplet shelf
      const rainSrc = startLooped(pinkBuf, 1.0);
      const rainLowpass = ctx.createBiquadFilter();
      rainLowpass.type = 'lowpass';
      rainLowpass.frequency.value = 1850;
      const rainShelf = ctx.createBiquadFilter();
      rainShelf.type = 'highshelf';
      rainShelf.frequency.value = 3200;
      rainShelf.gain.value = -4;
      const rainGain = ctx.createGain();
      rainGain.gain.value = (channels.rain / 100) * 0.42;
      rainSrc.connect(rainLowpass);
      rainLowpass.connect(rainShelf);
      rainShelf.connect(rainGain);
      rainGain.connect(master);
      this.channelGraphs.rain = { gain: rainGain, sources: [rainSrc] };

      // 2. Fireplace: deep hearth rumble + filtered firewood crackle
      const hearthSrc = startLooped(brownBuf, 0.85);
      const hearthLowpass = ctx.createBiquadFilter();
      hearthLowpass.type = 'lowpass';
      hearthLowpass.frequency.value = 210;
      const hearthMix = ctx.createGain();
      hearthMix.gain.value = 0.65;

      const crackleSrc = startLooped(crackleBuf, 1.0);
      const crackleBand = ctx.createBiquadFilter();
      crackleBand.type = 'bandpass';
      crackleBand.frequency.value = 2200;
      crackleBand.Q.value = 0.9;
      const crackleMix = ctx.createGain();
      crackleMix.gain.value = 0.85;

      const fireGain = ctx.createGain();
      fireGain.gain.value = (channels.fireplace / 100) * 0.55;
      hearthSrc.connect(hearthLowpass);
      hearthLowpass.connect(hearthMix);
      hearthMix.connect(fireGain);
      crackleSrc.connect(crackleBand);
      crackleBand.connect(crackleMix);
      crackleMix.connect(fireGain);
      fireGain.connect(master);
      this.channelGraphs.fireplace = { gain: fireGain, sources: [hearthSrc, crackleSrc] };

      // 3. Brown Noise: warm acoustic blanket
      const brownSrc = startLooped(brownBuf, 1.0);
      const brownLowpass = ctx.createBiquadFilter();
      brownLowpass.type = 'lowpass';
      brownLowpass.frequency.value = 360;
      const brownGain = ctx.createGain();
      brownGain.gain.value = (channels.brown_noise / 100) * 0.52;
      brownSrc.connect(brownLowpass);
      brownLowpass.connect(brownGain);
      brownGain.connect(master);
      this.channelGraphs.brown_noise = { gain: brownGain, sources: [brownSrc] };

      // 4. Ocean Waves: LFO-modulated lowpassed surf swell
      const oceanSrc = startLooped(pinkBuf, 0.78);
      const oceanFilter = ctx.createBiquadFilter();
      oceanFilter.type = 'lowpass';
      oceanFilter.frequency.value = 460;
      oceanFilter.Q.value = 0.7;

      const oceanSwell = ctx.createGain();
      oceanSwell.gain.value = 0.55;
      const oceanLfo = ctx.createOscillator();
      oceanLfo.type = 'sine';
      oceanLfo.frequency.value = 0.11;
      const oceanLfoDepth = ctx.createGain();
      oceanLfoDepth.gain.value = 0.35;
      oceanLfo.connect(oceanLfoDepth);
      oceanLfoDepth.connect(oceanSwell.gain);
      oceanLfo.start();

      const oceanFilterLfoGain = ctx.createGain();
      oceanFilterLfoGain.gain.value = 260;
      oceanLfo.connect(oceanFilterLfoGain);
      oceanFilterLfoGain.connect(oceanFilter.frequency);

      const oceanGain = ctx.createGain();
      oceanGain.gain.value = (channels.ocean / 100) * 0.55;
      oceanSrc.connect(oceanFilter);
      oceanFilter.connect(oceanSwell);
      oceanSwell.connect(oceanGain);
      oceanGain.connect(master);
      this.channelGraphs.ocean = { gain: oceanGain, sources: [oceanSrc, oceanLfo] };

      // 5. Forest Wind: dual slow-sweeping resonant bandpass canopy air
      const windSrc = startLooped(pinkBuf, 0.92);
      const windBandA = ctx.createBiquadFilter();
      windBandA.type = 'bandpass';
      windBandA.frequency.value = 420;
      windBandA.Q.value = 2.4;

      const windBandB = ctx.createBiquadFilter();
      windBandB.type = 'bandpass';
      windBandB.frequency.value = 690;
      windBandB.Q.value = 2.8;

      const windLfoA = ctx.createOscillator();
      windLfoA.type = 'sine';
      windLfoA.frequency.value = 0.08;
      const windLfoAGain = ctx.createGain();
      windLfoAGain.gain.value = 160;
      windLfoA.connect(windLfoAGain);
      windLfoAGain.connect(windBandA.frequency);
      windLfoA.start();

      const windLfoB = ctx.createOscillator();
      windLfoB.type = 'sine';
      windLfoB.frequency.value = 0.13;
      const windLfoBGain = ctx.createGain();
      windLfoBGain.gain.value = 210;
      windLfoB.connect(windLfoBGain);
      windLfoBGain.connect(windBandB.frequency);
      windLfoB.start();

      const windGain = ctx.createGain();
      windGain.gain.value = (channels.forest_wind / 100) * 0.58;
      windSrc.connect(windBandA);
      windSrc.connect(windBandB);
      windBandA.connect(windGain);
      windBandB.connect(windGain);
      windGain.connect(master);
      this.channelGraphs.forest_wind = {
        gain: windGain,
        sources: [windSrc, windLfoA, windLfoB],
      };

      const targetMaster = (masterVolume / 100) * 0.9;
      master.gain.setTargetAtTime(Math.max(0.0001, targetMaster), ctx.currentTime, 0.12);
    }

    return true;
  }

  public start(channels: SoundscapeChannelLevels, masterVolume: number): boolean {
    this.clearFadeTimer();
    const ok = this.ensureGraph(channels, masterVolume);
    if (!ok || !this.ctx || !this.masterGain) return false;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    this.updateMix(channels, masterVolume);
    return true;
  }

  public updateMix(channels: SoundscapeChannelLevels, masterVolume: number): void {
    if (!this.ctx || this.ctx.state === 'closed' || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const scales: Record<SoundscapeChannelId, number> = {
      rain: 0.42,
      fireplace: 0.55,
      brown_noise: 0.52,
      ocean: 0.55,
      forest_wind: 0.58,
    };

    for (const ch of SOUNDSCAPE_CHANNELS) {
      const graph = this.channelGraphs[ch.id];
      if (graph) {
        const target = Math.max(0, (channels[ch.id] / 100) * scales[ch.id]);
        graph.gain.gain.setTargetAtTime(target, now, 0.06);
      }
    }

    const masterTarget = Math.max(0.0001, (masterVolume / 100) * 0.9);
    this.masterGain.gain.setTargetAtTime(masterTarget, now, 0.08);
  }

  public fadeOutAndStop(durationSec: number = 2.4, onComplete?: () => void): void {
    this.clearFadeTimer();
    const safeDuration = Math.max(0.25, durationSec);

    if (!this.ctx || this.ctx.state === 'closed' || !this.masterGain) {
      onComplete?.();
      return;
    }

    const now = this.ctx.currentTime;
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(
        Math.max(0.0001, this.masterGain.gain.value),
        now
      );
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + safeDuration);
    } catch {
      // Fallback for Web Audio implementations rejecting ramp boundaries
      this.masterGain.gain.setTargetAtTime(0.0001, now, safeDuration / 3);
    }

    if (typeof window !== 'undefined') {
      this.fadeTimerId = window.setTimeout(() => {
        this.fadeTimerId = null;
        this.stopImmediate();
        onComplete?.();
      }, Math.round(safeDuration * 1000) + 120);
    }
  }

  public stopImmediate(): void {
    this.clearFadeTimer();
    for (const ch of SOUNDSCAPE_CHANNELS) {
      const graph = this.channelGraphs[ch.id];
      if (!graph) continue;
      for (const src of graph.sources) {
        try {
          src.stop();
        } catch {
          // Ignore already-stopped audio sources
        }
      }
    }
    this.channelGraphs = {};
    this.masterGain = null;

    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      void ctx.close().catch(() => {});
    }
  }

  public dispose(): void {
    this.stopImmediate();
  }
}
