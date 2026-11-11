import type React from 'react';
import { useEffect, useRef } from 'react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useChoreStore } from '../../stores/useChoreStore';
import { isAmbientlyInNightMode } from '../../utils/confetti';
import { resolveProfileColorHex } from '../../types/profiles';

const CALM_SCIENCE_CONFETTI_COLORS = [
  '#6b8f71', // Sage Green
  '#648296', // Slate Blue
  '#b5838d', // Dusty Rose
  '#8b7fa8', // Lavender-Gray
  '#c99b66', // Muted Warm Amber
  '#5c8d89', // Seafoam Slate
  '#c47d68', // Soft Terracotta
  '#8c857b', // Warm Greige
] as const;

export interface ConfettiCelebrationProps {
  active?: boolean;
  triggerKey?: number | string;
  originX?: number;
  originY?: number;
  accentColor?: string;
  particleCount?: number;
  playSound?: boolean;
  onComplete?: () => void;
}

interface BurstRuntimeOptions {
  originX?: number;
  originY?: number;
  accentColor?: string;
  particleCount?: number;
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
  alpha: number;
  shape: 'circle' | 'pill' | 'tile';
}

function isNightModeSuppressed(): boolean {
  const currentSettings = useDashboardStore.getState().settings;
  return Boolean(currentSettings?.nightModeEnabled) || isAmbientlyInNightMode(currentSettings);
}

function maybePlayCalmCelebrationChime(playSound: boolean): void {
  if (!playSound) return;
  if (isNightModeSuppressed()) return;

  const soundEffectsEnabled =
    useChoreStore.getState().snapshot.householdSettings?.soundEffectsEnabled === true;
  if (!soundEffectsEnabled) return;

  try {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const triadNotes = [523.25, 659.25, 783.99]; // Gentle C5-E5-G5 sine triad
    triadNotes.forEach((freq, idx) => {
      const startOffset = ctx.currentTime + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startOffset);

      gain.gain.setValueAtTime(0.0008, startOffset);
      gain.gain.exponentialRampToValueAtTime(0.05, startOffset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startOffset + 0.44);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startOffset);
      osc.stop(startOffset + 0.45);
    });

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 950);
  } catch {
    // Ignore audio context restrictions on locked/muted kiosk browsers
  }
}

function resolvePalette(accentColor?: string): string[] {
  if (!accentColor) {
    return [...CALM_SCIENCE_CONFETTI_COLORS];
  }
  const resolved = resolveProfileColorHex(accentColor);
  return [resolved, resolved, ...CALM_SCIENCE_CONFETTI_COLORS];
}

function resolveOriginCoord(raw: number | undefined, fallbackRatio: number, span: number): number {
  const val = raw ?? fallbackRatio;
  const px = val >= 0 && val <= 1 ? val * span : val;
  return Math.max(0, Math.min(span, px));
}

function runCanvasParticleBurst(
  canvas: HTMLCanvasElement,
  options: BurstRuntimeOptions,
  onDone?: () => void
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx || isNightModeSuppressed()) {
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    onDone?.();
    return () => {};
  }

  const width = Math.max(1, window.innerWidth || canvas.clientWidth || 1024);
  const height = Math.max(1, window.innerHeight || canvas.clientHeight || 768);
  canvas.width = width;
  canvas.height = height;

  const palette = resolvePalette(options.accentColor);
  const startX = resolveOriginCoord(options.originX, 0.5, width);
  const startY = resolveOriginCoord(options.originY, 0.55, height);
  const count = Math.max(1, Math.min(120, Math.round(options.particleCount ?? 38)));

  const shapes: ConfettiParticle['shape'][] = ['circle', 'pill', 'tile'];
  const particles: ConfettiParticle[] = Array.from({ length: count }, (_, idx) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.18;
    const speed = 3.2 + Math.random() * 6.4;
    return {
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.4,
      size: 5 + Math.random() * 5,
      color: palette[Math.floor(Math.random() * palette.length)],
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.15,
      alpha: 0.95,
      shape: shapes[idx % shapes.length],
    };
  });

  let frame = 0;
  const maxFrames = 74;
  let rafId: number | null = null;
  let cancelled = false;

  const finish = () => {
    if (cancelled) return;
    cancelled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onDone?.();
  };

  const tick = () => {
    if (cancelled) return;

    // Immediate mid-flight suppression if Night Mode becomes active
    if (isNightModeSuppressed()) {
      finish();
      return;
    }

    frame += 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fadeThreshold = maxFrames * 0.55;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.17; // gentle low-arousal gravity
      p.vx *= 0.985; // subtle air drag
      p.rotation += p.vRot;

      if (frame > fadeThreshold) {
        p.alpha = Math.max(0, 0.95 * (1 - (frame - fadeThreshold) / (maxFrames - fadeThreshold)));
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.48, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'pill') {
        const w = p.size * 1.25;
        const h = p.size * 0.56;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, 2.5);
          ctx.fill();
        } else {
          ctx.fillRect(-w / 2, -h / 2, w, h);
        }
      } else {
        const side = p.size * 0.82;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(-side / 2, -side / 2, side, side, 1.8);
          ctx.fill();
        } else {
          ctx.fillRect(-side / 2, -side / 2, side, side);
        }
      }

      ctx.restore();
    }

    if (frame < maxFrames) {
      rafId = window.requestAnimationFrame(tick);
    } else {
      finish();
    }
  };

  rafId = window.requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(rafId);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}

/**
 * Imperative helper to fire a Calm Science desaturated HTML5 canvas confetti burst.
 * Audio is strictly OFF by default (`playSound = false`).
 * Suppresses ALL visual particles and ALL audio when Night Mode is active.
 */
// oxlint-disable-next-line react/only-export-components
export function fireConfettiCelebration(options?: {
  originX?: number;
  originY?: number;
  accentColor?: string;
  particleCount?: number;
  playSound?: boolean;
}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (isNightModeSuppressed()) {
    return;
  }

  const playSound = options?.playSound === true;
  maybePlayCalmCelebrationChime(playSound);

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  runCanvasParticleBurst(
    canvas,
    {
      originX: options?.originX,
      originY: options?.originY,
      accentColor: options?.accentColor,
      particleCount: options?.particleCount,
    },
    () => {
      canvas.remove();
    }
  );
}

export const ConfettiCelebration: React.FC<ConfettiCelebrationProps> = ({
  active,
  triggerKey,
  originX,
  originY,
  accentColor,
  particleCount,
  playSound = false,
  onComplete,
}) => {
  const settings = useDashboardStore((s) => s.settings);
  const nightModeEnabled = useDashboardStore((s) => s.settings.nightModeEnabled);
  const isNightMode = Boolean(nightModeEnabled) || isAmbientlyInNightMode(settings);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanupBurstRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef<(() => void) | undefined>(onComplete);
  const prevStateRef = useRef<{
    mounted: boolean;
    active: boolean | undefined;
    triggerKey: number | string | undefined;
  }>({
    mounted: false,
    active: undefined,
    triggerKey: undefined,
  });

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const prev = prevStateRef.current;
    let shouldFire = false;

    if (typeof active === 'boolean') {
      if (active) {
        const becameActive = !prev.mounted || !prev.active;
        const keyChanged = triggerKey !== undefined && triggerKey !== prev.triggerKey;
        shouldFire = becameActive || keyChanged;
      } else {
        cleanupBurstRef.current?.();
        cleanupBurstRef.current = null;
      }
    } else if (triggerKey !== undefined && triggerKey !== '' && triggerKey !== 0) {
      shouldFire = !prev.mounted || triggerKey !== prev.triggerKey;
    } else if (
      prev.mounted &&
      prev.triggerKey !== undefined &&
      triggerKey !== undefined &&
      triggerKey !== prev.triggerKey &&
      triggerKey !== ''
    ) {
      shouldFire = true;
    }

    prevStateRef.current = {
      mounted: true,
      active,
      triggerKey,
    };

    if (!shouldFire) {
      if (isNightMode && cleanupBurstRef.current) {
        cleanupBurstRef.current();
        cleanupBurstRef.current = null;
      }
      return;
    }

    // Strict Night Mode suppression: zero visual particles and zero audio
    if (isNightMode || isNightModeSuppressed()) {
      cleanupBurstRef.current?.();
      cleanupBurstRef.current = null;
      onCompleteRef.current?.();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') {
      onCompleteRef.current?.();
      return;
    }

    cleanupBurstRef.current?.();
    maybePlayCalmCelebrationChime(playSound === true);

    cleanupBurstRef.current = runCanvasParticleBurst(
      canvas,
      {
        originX,
        originY,
        accentColor,
        particleCount,
      },
      () => {
        cleanupBurstRef.current = null;
        onCompleteRef.current?.();
      }
    );
  }, [active, triggerKey, originX, originY, accentColor, particleCount, playSound, isNightMode]);

  useEffect(() => {
    return () => {
      cleanupBurstRef.current?.();
      cleanupBurstRef.current = null;
    };
  }, []);

  if (isNightMode) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-screen h-screen pointer-events-none z-[9999]"
    />
  );
};

export default ConfettiCelebration;
