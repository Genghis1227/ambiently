import { useDashboardStore } from '../store/dashboardStore';
import { useChoreStore } from '../store/choreStore';
import { isTimeInNightWindow } from './nightMode';
import type { AppSettings } from '../types/dashboard';

const CALMING_CONFETTI_COLORS = [
  '#6B8E7B', // Sage Green
  '#648296', // Slate Blue
  '#B87D87', // Dusty Rose
  '#8C829E', // Lavender-Gray
  '#C99A5B', // Soft Amber
  '#8FA89B', // Soft Mint
  '#D6CFC7', // Warm Greige
];

export function isAmbientlyInNightMode(settings?: AppSettings): boolean {
  const activeSettings = settings || useDashboardStore.getState().settings;
  if (!activeSettings) return false;
  if (activeSettings.nightModeEnabled) return true;
  if (
    activeSettings.nightScheduleEnabled !== false &&
    isTimeInNightWindow(
      new Date(),
      activeSettings.nightModeStart,
      activeSettings.nightModeEnd
    )
  ) {
    return true;
  }
  return false;
}

function playSubtleCelebrationChime(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 gentle triad
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + idx * 0.08 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.08 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.46);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Ignore audio errors on restricted devices
  }
}

export interface ConfettiBurstOptions {
  originX?: number; // 0..1 viewport ratio or pixel coordinate if > 1
  originY?: number; // 0..1 viewport ratio or pixel coordinate if > 1
  accentColor?: string;
  particleCount?: number;
}

/**
 * Triggers a silent visual canvas confetti burst by default (audio off by default).
 * Automatically suppresses BOTH visual confetti and audio when Ambiently is in Night Mode.
 */
export function triggerChoreCelebration(options?: ConfettiBurstOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Guardrail: Suppress both visual confetti and audio when Ambiently is in Night Mode
  if (isAmbientlyInNightMode()) {
    return;
  }

  const householdSettings = useChoreStore.getState().snapshot.householdSettings;
  if (householdSettings?.soundEffectsEnabled) {
    playSubtleCelebrationChime();
  }

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  const palette = options?.accentColor
    ? [options.accentColor, ...CALMING_CONFETTI_COLORS]
    : CALMING_CONFETTI_COLORS;

  const rawX = options?.originX ?? 0.5;
  const rawY = options?.originY ?? 0.55;
  const startX = rawX <= 1 ? rawX * canvas.width : rawX;
  const startY = rawY <= 1 ? rawY * canvas.height : rawY;
  const count = options?.particleCount ?? 38;

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    rotation: number;
    vRot: number;
    alpha: number;
    shape: 'circle' | 'pill';
  }

  const particles: Particle[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const speed = 3.5 + Math.random() * 6.5;
    return {
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      size: 5 + Math.random() * 5,
      color: palette[Math.floor(Math.random() * palette.length)],
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.16,
      alpha: 1,
      shape: Math.random() > 0.45 ? 'pill' : 'circle',
    };
  });

  let frame = 0;
  const maxFrames = 75;

  const animate = () => {
    frame += 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // gentle gravity
      p.vx *= 0.985; // air drag
      p.rotation += p.vRot;
      if (frame > maxFrames * 0.55) {
        p.alpha = Math.max(0, 1 - (frame - maxFrames * 0.55) / (maxFrames * 0.45));
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(-p.size * 0.6, -p.size * 0.3, p.size * 1.2, p.size * 0.6, 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  };

  requestAnimationFrame(animate);
}
