import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  LayoutGrid,
  Calendar,
  CheckSquare,
  StickyNote,
  Image as ImageIcon,
  Cloud,
  ChevronLeft,
  ChevronRight,
  Lock,
  Wand2,
  Trophy,
  Archive,
  Moon,
  Smartphone,
  HelpCircle,
  Check,
  ExternalLink,
} from 'lucide-react';

export const QUICKSTART_STORAGE_KEY = 'ambiently_quickstart_dismissed_v1';

export function isQuickStartDismissed(): boolean {
  try {
    return localStorage.getItem(QUICKSTART_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setQuickStartDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(QUICKSTART_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(QUICKSTART_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

interface QuickStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenAddWidget?: () => void;
  onOpenCreateNote?: () => void;
  onOpenChoresHub?: () => void;
}

interface WalkthroughSlide {
  id: string;
  shortTitle: string;
  badge: string;
  title: string;
  subtitle: string;
  accentColor: string;
  icon: React.ReactNode;
  steps: {
    icon: React.ReactNode;
    heading: string;
    body: string;
  }[];
  proTip: string;
  ctaLabel?: string;
  ctaAction?: 'add_widget' | 'create_note' | 'chores_hub' | 'settings';
}

const SLIDES: WalkthroughSlide[] = [
  {
    id: 'welcome',
    shortTitle: 'Welcome',
    badge: 'Step 1 of 7 • Getting Started',
    title: 'Welcome to Ambiently',
    subtitle:
      'Your calm, offline-first smart wall display and digital family command center. Here is how your board works in 60 seconds.',
    accentColor: 'from-cyan-500/20 to-blue-600/20 border-cyan-500/30 text-cyan-300',
    icon: <Sparkles className="w-6 h-6 text-cyan-400" />,
    steps: [
      {
        icon: <Lock className="w-4 h-4 text-amber-400" />,
        heading: 'Unlock to Edit, Lock for the Wall',
        body: 'Tap the Lock/Unlock icon on the Navigation Dock to move, resize, or configure tiles. Lock the canvas when finished so family touches on the wall screen never shift your layout.',
      },
      {
        icon: <LayoutGrid className="w-4 h-4 text-blue-400" />,
        heading: 'Add Widget Tiles & Sticky Notes',
        body: 'When the canvas is unlocked, tap the blue "+" button on the Dock to add Clocks, Weather, Calendars, Chores, Photo Frames, Sticky Notes, Countdown timers, or RSS feeds.',
      },
      {
        icon: <Wand2 className="w-4 h-4 text-purple-400" />,
        heading: '1-Tap Auto-Organize (Bento Grid)',
        body: 'Tap the purple Magic Wand on the Dock anytime to automatically snap overlapping tiles and notes into a clean Bento layout—complete with 1-click Undo.',
      },
    ],
    proTip:
      'Hover or tap any widget tile while the canvas is unlocked to reveal its Gear (Settings), Maximize, and Remove controls in the top-right corner.',
    ctaLabel: 'Add a Widget Tile',
    ctaAction: 'add_widget',
  },
  {
    id: 'canvases',
    shortTitle: 'Canvases',
    badge: 'Step 2 of 7 • Multi-Canvas Loop',
    title: 'Canvases, Themes & Auto-Rotation',
    subtitle:
      'Organize your display into dedicated boards—like Family Overview, Weekly Calendar, Chores Hub, and Photo Frame.',
    accentColor: 'from-indigo-500/20 to-purple-600/20 border-indigo-500/30 text-indigo-300',
    icon: <LayoutGrid className="w-6 h-6 text-indigo-400" />,
    steps: [
      {
        icon: <LayoutGrid className="w-4 h-4 text-indigo-400" />,
        heading: 'Up to 8 Custom Canvases',
        body: 'Switch canvases from the Dock or create new ones via "+" → New Canvas (or Settings → Canvases). Each canvas has its own icon, dark or light theme, and optional custom background wallpaper.',
      },
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
        heading: 'Smart Auto-Rotate Carousel',
        body: 'In Settings → Display & Kiosk, enable Auto-Rotate Carousel (15s–300s) so your wall display smoothly cycles through all enabled canvases.',
      },
      {
        icon: <Check className="w-4 h-4 text-cyan-400" />,
        heading: 'Touch-Aware Pause',
        body: 'Touching the screen or opening any modal automatically pauses carousel rotation so the board never switches while someone is reading or checking off a chore.',
      },
    ],
    proTip:
      'Want a canvas dedicated solely to widgets or photos? Toggle "Hide Sticky Notes on this Canvas" inside Settings → Canvases.',
    ctaLabel: 'Manage Canvases in Settings',
    ctaAction: 'settings',
  },
  {
    id: 'calendar',
    shortTitle: 'Calendar',
    badge: 'Step 3 of 7 • Family Schedule',
    title: 'Connecting Google, iCloud & Outlook Calendars',
    subtitle:
      'Merge multiple family, work, school, and holiday calendars onto a single color-coded schedule.',
    accentColor: 'from-blue-500/20 to-sky-600/20 border-blue-500/30 text-blue-300',
    icon: <Calendar className="w-6 h-6 text-blue-400" />,
    steps: [
      {
        icon: <Calendar className="w-4 h-4 text-blue-400" />,
        heading: 'Paste Any Public or Private .ics Link',
        body: 'Unlock the canvas → click the Gear icon on a Calendar tile → paste your Google Calendar "Secret address in iCal format" (.ics) or Apple iCloud webcal:// link and click Add.',
      },
      {
        icon: <LayoutGrid className="w-4 h-4 text-sky-400" />,
        heading: '4 Views + Timeline Grid',
        body: 'Switch directly on the tile header between Agenda, 3-Day, Week, and Month views—and toggle between stacked Cards or an hourly Timeline grid.',
      },
      {
        icon: <HelpCircle className="w-4 h-4 text-emerald-400" />,
        heading: 'Built-In Guide & Rate-Limit Protection',
        body: 'Click the "?" icon on any Calendar tile for step-by-step screenshots on finding your Google Calendar .ics link. Events are cached locally and at the edge for fast, rate-limit-safe syncing.',
      },
    ],
    proTip:
      'You can place different Calendar tiles on different canvases (for example, an Agenda tile on Overview and a full-screen Week view on a Schedule canvas) and they will share cached feed data automatically.',
  },
  {
    id: 'chores',
    shortTitle: 'Chores & Rewards',
    badge: 'Step 4 of 7 • Family Gamification',
    title: 'Chores, Point Banks & Reward Store',
    subtitle:
      'Turn daily routines into an engaging family game with custom avatars, point splitting, and a wishlist Reward Store.',
    accentColor: 'from-emerald-500/20 to-teal-600/20 border-emerald-500/30 text-emerald-300',
    icon: <CheckSquare className="w-6 h-6 text-emerald-400" />,
    steps: [
      {
        icon: <CheckSquare className="w-4 h-4 text-emerald-400" />,
        heading: 'Kid & Parent Profiles + Shared Tasks',
        body: 'Add Kids and Parents in Settings → Household (with photo crop or emoji avatars). Personal chores go to one person; Shared Family Tasks let solo helpers claim full points or split points equally via "Who helped?".',
      },
      {
        icon: <LayoutGrid className="w-4 h-4 text-teal-400" />,
        heading: 'Compact Tile or Full-Screen Canvas Hub',
        body: 'Open the Family Hub from the Checklist icon on the Dock—or open a Chores tile\'s Settings and select "Full-Screen Hub on Canvas" so the 3-column Hub (Point Banks + Daily Chores + Reward Store) rotates with your canvases.',
      },
      {
        icon: <Trophy className="w-4 h-4 text-amber-400" />,
        heading: 'Wishlist Proposals, Parent Drawer & Trophy Case',
        body: 'Family members propose wishes with "+ Wish". Parents tap the Shield icon in the Hub to approve chores, price wishes in points, and fulfill redeemed prizes into the permanent Trophy Case.',
      },
    ],
    proTip:
      'Going on a family trip? Toggle "Vacation Mode" inside the Parent Drawer to pause daily chore generation and overdue penalties until you return.',
    ctaLabel: 'Open Chore & Reward Hub',
    ctaAction: 'chores_hub',
  },
  {
    id: 'notes',
    shortTitle: 'Sticky Notes',
    badge: 'Step 5 of 7 • Reminders & Lists',
    title: 'Sticky Notes, Checklists & Expiration',
    subtitle:
      'Leave quick reminders, grocery checklists, or temporary family announcements right on the board.',
    accentColor: 'from-amber-500/20 to-orange-600/20 border-amber-500/30 text-amber-300',
    icon: <StickyNote className="w-6 h-6 text-amber-400" />,
    steps: [
      {
        icon: <StickyNote className="w-4 h-4 text-amber-400" />,
        heading: 'Freeform Corkboard Notes or Tile Notes',
        body: 'Use "+" → New Sticky Note to pin a freeform note anywhere on a canvas (or set it to show on "All Canvases"), or use a Sticky Notes tile for a neat scrollable list.',
      },
      {
        icon: <CheckSquare className="w-4 h-4 text-emerald-400" />,
        heading: 'Interactive Checklists & Duplicate',
        body: 'Switch any note to Checklist mode to check off items with a tap. Duplicate recurring lists in one click—all checkboxes automatically reset on the copy.',
      },
      {
        icon: <Archive className="w-4 h-4 text-orange-400" />,
        heading: 'Auto-Expire & Archive Recovery',
        body: 'Set temporary notes to expire after 1 Day, 3 Days, or a custom date. Expired or archived notes appear in the amber Archive icon on the Dock where you can Restore them or Delete All.',
      },
    ],
    proTip:
      'Double-tap any freeform sticky note on an unlocked canvas to edit its title, checklist items, font size, or color.',
    ctaLabel: 'Create a Sticky Note',
    ctaAction: 'create_note',
  },
  {
    id: 'photos',
    shortTitle: 'Photos & Kiosk',
    badge: 'Step 6 of 7 • Ambient Display',
    title: 'Shared Photos, Night Mode & Kiosk Lock',
    subtitle:
      'Designed to run 24/7 on wall monitors, kitchen tablets, and Raspberry Pi displays without glare or burn-in.',
    accentColor: 'from-pink-500/20 to-rose-600/20 border-pink-500/30 text-pink-300',
    icon: <ImageIcon className="w-6 h-6 text-pink-400" />,
    steps: [
      {
        icon: <ImageIcon className="w-4 h-4 text-pink-400" />,
        heading: 'Shared Photo Sources (Local, Web Albums & Plex)',
        body: 'In Settings → Shared Photos, connect a local photo folder, Google/iCloud shared web album URLs, curated art, or your Plex Media Server once to power all Photo Frame tiles.',
      },
      {
        icon: <Moon className="w-4 h-4 text-amber-300" />,
        heading: 'Scheduled Night Mode & OLED Clock',
        body: 'Set automatic sleep/wake hours in Settings → Display & Kiosk (or toggle Night Mode manually from Quick Utilities) with a pixel-shifting OLED clock to prevent screen burn-in.',
      },
      {
        icon: <Lock className="w-4 h-4 text-blue-400" />,
        heading: 'Parent PIN Lock & Auto-Hide Toolbar',
        body: 'Set a 4-digit PIN in Settings → Display & Kiosk to protect Settings and Parent Chore approvals. Press "\\" (or tap the Eye icon in Quick Utilities) to hide the Dock for full-screen immersion.',
      },
    ],
    proTip:
      'Adjust "Display Density / UI Scale" (75% to 150%) in Settings → Display & Kiosk to make text readable from across the kitchen on 1080p or 4K screens.',
    ctaLabel: 'Open Display & Photo Settings',
    ctaAction: 'settings',
  },
  {
    id: 'sync',
    shortTitle: 'Sync & Mobile',
    badge: 'Step 7 of 7 • Multi-Device & Backups',
    title: 'Cloud Sync, Backups & Mobile Companion',
    subtitle:
      'Keep your wall display, family tablets, and phones synchronized in real time while retaining full local ownership.',
    accentColor: 'from-violet-500/20 to-cyan-600/20 border-violet-500/30 text-violet-300',
    icon: <Cloud className="w-6 h-6 text-violet-400" />,
    steps: [
      {
        icon: <Cloud className="w-4 h-4 text-cyan-400" />,
        heading: 'Live Cloud Sync & Household Board Sharing',
        body: 'Sign in under Settings → Sync & Backup to enable instant WebSocket sync across devices. Use the QR/Share button on the Dock to invite family members or pair a wall display.',
      },
      {
        icon: <Smartphone className="w-4 h-4 text-emerald-400" />,
        heading: 'Mobile Companion View',
        body: 'On phones, tap the Smartphone icon on the Dock to switch to the pocket-friendly Mobile Companion for checking chores, calendars, and posting notes on the go.',
      },
      {
        icon: <Check className="w-4 h-4 text-amber-400" />,
        heading: '1-Click JSON Backup & PC Auto-Sync',
        body: 'Export or restore a full JSON backup anytime in Settings → Sync & Backup, or bind a local file on your PC/Mac so every board change mirrors to disk automatically.',
      },
    ],
    proTip:
      'You can reopen this Quick Start & How-To guide anytime from the Quick Utilities (sliders) button on the Dock or from the top of the Settings window.',
    ctaLabel: 'Open Sync & Backup Settings',
    ctaAction: 'settings',
  },
];

export const QuickStartModal: React.FC<QuickStartModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenAddWidget,
  onOpenCreateNote,
  onOpenChoresHub,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(() => isQuickStartDismissed());

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickStartDismissed(dontShowAgain);
        onClose();
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => Math.min(SLIDES.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, dontShowAgain, onClose]);

  if (!isOpen) return null;

  const slide = SLIDES[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === SLIDES.length - 1;

  const handleClose = () => {
    setQuickStartDismissed(dontShowAgain);
    onClose();
  };

  const handleTriggerCta = () => {
    if (!slide.ctaAction) return;
    setQuickStartDismissed(dontShowAgain);
    onClose();
    if (slide.ctaAction === 'add_widget') {
      onOpenAddWidget?.();
    } else if (slide.ctaAction === 'create_note') {
      onOpenCreateNote?.();
    } else if (slide.ctaAction === 'chores_hub') {
      onOpenChoresHub?.();
    } else if (slide.ctaAction === 'settings') {
      onOpenSettings?.();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-150"
      onMouseDown={(e) => {
        (e.currentTarget as any).__backdropMouseDown = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (e.currentTarget as any).__backdropMouseDown) {
          handleClose();
        }
        (e.currentTarget as any).__backdropMouseDown = false;
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden cursor-default"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4 bg-gray-950/90 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight truncate">
                Quick Start & How-To Guide
              </h2>
              <p className="text-[11px] text-gray-400 truncate">
                Interactive step-by-step walkthrough • Use arrow keys or tap any topic below
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer shrink-0"
            title="Close guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Topic Jump Bar (Carousel Pills) */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-950/60 border-b border-gray-800/80 overflow-x-auto no-scrollbar shrink-0">
          {SLIDES.map((s, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'bg-gray-900/70 text-gray-400 hover:text-gray-200 hover:bg-gray-800/80 border border-gray-800'
                }`}
              >
                <span className="font-mono text-[10px] opacity-75">{idx + 1}.</span>
                <span>{s.shortTitle}</span>
              </button>
            );
          })}
        </div>

        {/* Slide Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Slide Banner */}
          <div className={`p-4 rounded-2xl bg-gradient-to-br border ${slide.accentColor} flex items-start gap-3.5`}>
            <div className="p-2.5 rounded-xl bg-gray-950/60 border border-white/10 shrink-0 mt-0.5">
              {slide.icon}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-mono uppercase tracking-wider opacity-90 block">
                {slide.badge}
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">
                {slide.title}
              </h3>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                {slide.subtitle}
              </p>
            </div>
          </div>

          {/* 3 Actionable How-To Cards */}
          <div className="space-y-2.5">
            {slide.steps.map((step, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-gray-950/70 border border-gray-800/90 flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center shrink-0 mt-0.5">
                  {step.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    {step.heading}
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Pro Tip & Optional Deep-Link CTA */}
          <div className="p-3.5 rounded-xl bg-blue-950/25 border border-blue-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-blue-200/90 leading-relaxed">
              <strong className="text-blue-300 font-semibold">💡 Pro Tip:</strong> {slide.proTip}
            </div>
            {slide.ctaLabel && slide.ctaAction && (
              <button
                type="button"
                onClick={handleTriggerCta}
                className="px-3 py-1.5 rounded-xl bg-blue-600/25 hover:bg-blue-600/40 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-all"
              >
                <span>{slide.ctaLabel}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Footer Controls: Don't Show Again + Dots + Back / Next */}
        <div className="border-t border-gray-800 px-5 py-3.5 bg-gray-950/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => {
                setDontShowAgain(e.target.checked);
                setQuickStartDismissed(e.target.checked);
              }}
              className="rounded border-gray-700 bg-gray-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
            />
            <span>Don&apos;t show automatically on startup</span>
          </label>

          <div className="flex items-center gap-2 ml-auto">
            {/* Progress Dots */}
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              {SLIDES.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Go to step ${idx + 1}`}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    idx === currentIndex
                      ? 'w-5 bg-cyan-400'
                      : 'w-2 bg-gray-700 hover:bg-gray-500'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={isFirst}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                isFirst
                  ? 'bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 cursor-pointer'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Done</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.min(SLIDES.length - 1, prev + 1))}
                className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
