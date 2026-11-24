import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import type {
  DailyDiscoveryWidgetConfig,
  DiscoveryActiveSection,
  DiscoveryHistoryEvent,
  DiscoveryTabMode,
  DiscoveryTriviaCategory,
} from '../../types/phase3Widgets';
import {
  getDailyTriviaForDate,
  getDailyWordForDate,
  getFallbackHistoryEventsForDate,
} from '../../utils/dailyDiscoveryData';
import { fetchOnThisDayEvents } from '../../services/dailyDiscovery';
import { useSharedClock } from '../../utils/sharedClock';
import { useDisplayActivity } from '../../utils/displayActivity';

interface DailyDiscoveryWidgetProps {
  title?: string;
  config?: DailyDiscoveryWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

const SECTION_ORDER: DiscoveryActiveSection[] = ['trivia', 'word', 'on_this_day'];

const SECTION_LABELS: Record<DiscoveryActiveSection, string> = {
  trivia: 'Trivia',
  word: 'Word',
  on_this_day: 'On This Day',
};

const TRIVIA_CATEGORY_LABELS: Record<DiscoveryTriviaCategory, string> = {
  all: 'Mix',
  science: 'Science',
  history: 'History',
  nature: 'Nature',
  geography: 'Geography',
  wordplay: 'Wordplay',
};

export const DailyDiscoveryWidget: React.FC<DailyDiscoveryWidgetProps> = ({
  title,
  config,
  isLight = false,
  transparentBg = false,
}) => {
  const { isCanvasOccluded, shouldPauseAnimations } = useDisplayActivity();
  const nowDate = useSharedClock('10s', !isCanvasOccluded);
  const year = nowDate.getFullYear();
  const month = nowDate.getMonth() + 1;
  const day = nowDate.getDate();

  const configuredMode: DiscoveryTabMode =
    config?.mode === 'trivia' || config?.mode === 'word' || config?.mode === 'on_this_day'
      ? config.mode
      : 'rotate';
  const triviaCategory: DiscoveryTriviaCategory = config?.triviaCategory || 'all';
  const autoRotateSec: 0 | 15 | 30 | 60 =
    config?.autoRotateSec === 0 ||
    config?.autoRotateSec === 15 ||
    config?.autoRotateSec === 60
      ? config.autoRotateSec
      : 30;
  const defaultReveal = Boolean(config?.autoRevealAnswer);

  const [activeSection, setActiveSection] = useState<DiscoveryActiveSection>(
    configuredMode === 'rotate' ? 'trivia' : configuredMode
  );
  const [prevConfiguredMode, setPrevConfiguredMode] = useState<DiscoveryTabMode>(configuredMode);
  if (configuredMode !== prevConfiguredMode) {
    setPrevConfiguredMode(configuredMode);
    setActiveSection(configuredMode === 'rotate' ? 'trivia' : configuredMode);
  }

  const [triviaOffset, setTriviaOffset] = useState(0);
  const [wordOffset, setWordOffset] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(defaultReveal);
  const [pauseSeq, setPauseSeq] = useState(0);

  const [prevDefaultReveal, setPrevDefaultReveal] = useState(defaultReveal);
  if (defaultReveal !== prevDefaultReveal) {
    setPrevDefaultReveal(defaultReveal);
    setAnswerRevealed(defaultReveal);
  }

  const dayKey = `${year}-${month}-${day}`;
  const [prevDayKey, setPrevDayKey] = useState(dayKey);
  if (dayKey !== prevDayKey) {
    setPrevDayKey(dayKey);
    setTriviaOffset(0);
    setWordOffset(0);
    setHistoryOffset(0);
    setAnswerRevealed(defaultReveal);
  }

  const [historyResult, setHistoryResult] = useState<{
    dayKey: string;
    events: DiscoveryHistoryEvent[];
    source: 'wikimedia' | 'fallback';
  }>({
    dayKey: '',
    events: [],
    source: 'fallback',
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetchOnThisDayEvents(month, day, controller.signal)
      .then((res) => {
        if (!active) return;
        setHistoryResult({
          dayKey,
          events: res.events,
          source: res.source,
        });
      })
      .catch((err: any) => {
        if (!active || err?.name === 'AbortError') return;
        setHistoryResult({
          dayKey,
          events: getFallbackHistoryEventsForDate(month, day),
          source: 'fallback',
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [dayKey, month, day]);

  // Rotate tabs cleanly when in 'rotate' mode unless paused by recent tap, idle occlusion, or Night Mode
  useEffect(() => {
    if (configuredMode !== 'rotate' || autoRotateSec <= 0 || shouldPauseAnimations) return;
    let intervalId: number | undefined;
    const startRotation = () => {
      intervalId = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        setActiveSection((prev) => {
          const nextIdx = (SECTION_ORDER.indexOf(prev) + 1) % SECTION_ORDER.length;
          return SECTION_ORDER[nextIdx];
        });
      }, autoRotateSec * 1000);
    };

    const delayTimer = window.setTimeout(startRotation, pauseSeq > 0 ? 25_000 : 0);
    return () => {
      window.clearTimeout(delayTimer);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [configuredMode, autoRotateSec, shouldPauseAnimations, pauseSeq]);

  const dailyTrivia = useMemo(
    () => getDailyTriviaForDate(nowDate, triviaCategory, triviaOffset),
    [nowDate, triviaCategory, triviaOffset]
  );

  const dailyWord = useMemo(
    () => getDailyWordForDate(nowDate, wordOffset),
    [nowDate, wordOffset]
  );

  const historyEvents = useMemo(() => {
    if (historyResult.dayKey === dayKey && historyResult.events.length > 0) {
      return historyResult.events;
    }
    return getFallbackHistoryEventsForDate(month, day);
  }, [historyResult, dayKey, month, day]);

  const historySource =
    historyResult.dayKey === dayKey ? historyResult.source : 'fallback';
  const safeHistoryIdx =
    historyEvents.length > 0
      ? ((historyOffset % historyEvents.length) + historyEvents.length) % historyEvents.length
      : 0;
  const activeHistoryEvent = historyEvents[safeHistoryIdx];

  const handleInteractionPause = () => {
    setPauseSeq((s) => s + 1);
  };

  const handleSelectSection = (section: DiscoveryActiveSection) => {
    handleInteractionPause();
    setActiveSection(section);
  };

  const handleStepTrivia = (delta: number) => {
    handleInteractionPause();
    setTriviaOffset((o) => o + delta);
    setAnswerRevealed(defaultReveal);
  };

  const handleStepWord = (delta: number) => {
    handleInteractionPause();
    setWordOffset((o) => o + delta);
  };

  const handleStepHistory = (delta: number) => {
    handleInteractionPause();
    setHistoryOffset((o) => o + delta);
  };

  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';
  const dateLabel = nowDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const yearsAgo = activeHistoryEvent ? Math.max(0, year - activeHistoryEvent.year) : 0;

  return (
    <div
      className={`w-full h-full flex flex-col overflow-hidden select-none ${
        transparentBg ? stickerShadow : ''
      }`}
    >
      {/* Header + Section Switcher */}
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Lightbulb
            className={`w-3.5 h-3.5 shrink-0 ${
              isLight ? 'text-amber-600' : 'text-amber-400'
            }`}
          />
          <span
            className={`text-xs font-bold tracking-tight truncate ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            {title || 'Daily Discovery'}
          </span>
        </div>

        <div
          className={`flex items-center gap-0.5 p-0.5 rounded-lg border shrink-0 ${
            transparentBg
              ? 'border-transparent bg-black/15'
              : isLight
                ? 'bg-slate-100 border-slate-200'
                : 'bg-gray-900/80 border-gray-800'
          }`}
          data-no-drag="true"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {SECTION_ORDER.map((section) => {
            const active = activeSection === section;
            return (
              <button
                key={section}
                type="button"
                onClick={() => handleSelectSection(section)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? isLight
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-500/25 text-amber-200 border border-amber-400/30'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-gray-400 hover:text-white'
                }`}
              >
                {SECTION_LABELS[section]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Card Content */}
      <div
        className={`flex-1 min-h-0 flex flex-col justify-between rounded-2xl p-3 border overflow-y-auto ${
          transparentBg
            ? 'border-transparent bg-transparent'
            : isLight
              ? 'bg-slate-50/90 border-slate-200/85'
              : 'bg-gray-900/55 border-gray-800/85'
        }`}
      >
        {activeSection === 'trivia' ? (
          <>
            <div className="flex flex-col gap-2.5 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      isLight
                        ? 'bg-amber-500/12 text-amber-800 border-amber-500/25'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    <HelpCircle className="w-3 h-3" />
                    {dailyTrivia.item.kind === 'riddle' ? 'Riddle' : 'Trivia'}
                  </span>
                  <span
                    className={`text-[10px] font-semibold ${
                      isLight ? 'text-slate-500' : 'text-gray-400'
                    }`}
                  >
                    {TRIVIA_CATEGORY_LABELS[dailyTrivia.item.category]}
                  </span>
                </div>
                <span className="text-[10px] font-medium text-gray-500">{dateLabel}</span>
              </div>

              <p
                className={`text-sm font-semibold leading-snug ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {dailyTrivia.item.prompt}
              </p>

              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  handleInteractionPause();
                  setAnswerRevealed((r) => !r);
                }}
                aria-expanded={answerRevealed}
                className={`w-full text-left rounded-xl p-2.5 border transition-colors cursor-pointer ${
                  answerRevealed
                    ? isLight
                      ? 'bg-emerald-50 border-emerald-200 text-slate-900'
                      : 'bg-emerald-500/12 border-emerald-500/30 text-white'
                    : isLight
                      ? 'bg-white/90 hover:bg-white border-slate-200 text-slate-700'
                      : 'bg-gray-950/60 hover:bg-gray-950 border-gray-800 text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    {answerRevealed ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Answer
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-amber-400" />
                        <span className={isLight ? 'text-amber-700' : 'text-amber-300'}>
                          Tap to Reveal Answer
                        </span>
                      </>
                    )}
                  </span>
                </div>
                {answerRevealed && (
                  <div className="mt-1.5 space-y-1">
                    <p
                      className={`text-sm font-extrabold ${
                        isLight ? 'text-emerald-900' : 'text-emerald-200'
                      }`}
                    >
                      {dailyTrivia.item.answer}
                    </p>
                    <p
                      className={`text-xs leading-relaxed ${
                        isLight ? 'text-slate-600' : 'text-gray-300'
                      }`}
                    >
                      {dailyTrivia.item.funFact}
                    </p>
                  </div>
                )}
              </button>
            </div>

            <div
              className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-gray-800/35"
              data-no-drag="true"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="text-[10px] text-gray-500 tabular-nums">
                Card {dailyTrivia.index + 1} / {dailyTrivia.total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleStepTrivia(-1)}
                  title="Previous question"
                  className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStepTrivia(1)}
                  title="Next question"
                  className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : activeSection === 'word' ? (
          <>
            <div className="flex flex-col gap-2 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    isLight
                      ? 'bg-indigo-500/10 text-indigo-800 border-indigo-500/25'
                      : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                  }`}
                >
                  <BookOpen className="w-3 h-3" />
                  Word of the Day
                </span>
                <span className="text-[10px] font-semibold italic text-gray-400">
                  {dailyWord.item.partOfSpeech}
                </span>
              </div>

              <div className="flex items-baseline flex-wrap gap-2">
                <h3
                  className={`text-xl font-black tracking-tight ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {dailyWord.item.word}
                </h3>
                <span
                  className={`text-xs font-medium ${
                    isLight ? 'text-slate-500' : 'text-gray-400'
                  }`}
                >
                  {dailyWord.item.phonetic}
                </span>
              </div>

              <p
                className={`text-xs font-medium leading-relaxed ${
                  isLight ? 'text-slate-800' : 'text-gray-200'
                }`}
              >
                {dailyWord.item.definition}
              </p>

              <p
                className={`text-xs italic pl-2.5 border-l-2 ${
                  isLight
                    ? 'border-indigo-400 text-slate-600'
                    : 'border-indigo-400/60 text-gray-300'
                }`}
              >
                &ldquo;{dailyWord.item.example}&rdquo;
              </p>

              {dailyWord.item.origin && (
                <p className="text-[11px] text-gray-500 leading-snug">
                  Origin: {dailyWord.item.origin}
                </p>
              )}
            </div>

            <div
              className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-gray-800/35"
              data-no-drag="true"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="text-[10px] text-gray-500 tabular-nums">
                Word {dailyWord.index + 1} / {dailyWord.total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleStepWord(-1)}
                  title="Previous word"
                  className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStepWord(1)}
                  title="Next word"
                  className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      isLight
                        ? 'bg-sky-500/12 text-sky-800 border-sky-500/25'
                        : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    On This Day • {dateLabel}
                  </span>
                  {historySource === 'fallback' && (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        isLight
                          ? 'bg-slate-200/80 text-slate-600 border-slate-300'
                          : 'bg-gray-800 text-gray-300 border-gray-700'
                      }`}
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      Offline Pack
                    </span>
                  )}
                </div>
              </div>

              {activeHistoryEvent && (
                <div className="flex items-start gap-3">
                  {activeHistoryEvent.thumbnailUrl && (
                    <img
                      src={activeHistoryEvent.thumbnailUrl}
                      alt={activeHistoryEvent.articleTitle || String(activeHistoryEvent.year)}
                      loading="lazy"
                      decoding="async"
                      className="w-16 h-16 rounded-xl object-cover shrink-0 border border-white/10"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-lg font-black tabular-nums ${
                          isLight ? 'text-sky-700' : 'text-sky-300'
                        }`}
                      >
                        {activeHistoryEvent.year}
                      </span>
                      {yearsAgo > 0 && (
                        <span className="text-[11px] font-medium text-gray-400">
                          {yearsAgo} {yearsAgo === 1 ? 'year' : 'years'} ago
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${
                        isLight ? 'text-slate-800' : 'text-gray-200'
                      }`}
                    >
                      {activeHistoryEvent.text}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-gray-800/35"
              data-no-drag="true"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="text-[10px] text-gray-500 tabular-nums">
                Event {safeHistoryIdx + 1} / {historyEvents.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleStepHistory(-1)}
                  title="Previous historical event"
                  className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStepHistory(1)}
                  title="Next historical event"
                  className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
