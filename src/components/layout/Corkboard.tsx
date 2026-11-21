import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type {
  StickyNoteItem,
  StickyNoteChecklistItem,
  DashboardWidget,
  CanvasBackgroundTheme,
  DashboardTab,
  WidgetThemeMode,
  DefaultWidgetFrameStyle,
} from '../../types/dashboard';
import {
  CheckSquare,
  Square,
  Lock,
  Pin,
  Plus,
  Trash2,
  Clock,
  X,
  Maximize2,
  Minimize2,
  Settings,
  RotateCw,
  Edit2,
  Layers,
  MoreHorizontal,
} from 'lucide-react';
import { ClockWeatherWidget } from '../widgets/ClockWeatherWidget';
import { ClockWidget } from '../widgets/ClockWidget';
import { TextBoxWidget } from '../widgets/TextBoxWidget';
import { TileErrorBoundary } from '../common/TileErrorBoundary';
import type { CorkboardContextMenuState } from './CorkboardContextMenu';
import { computeCardDragLayout } from '../../utils/cardDragTransform';
import { useSharedClock } from '../../utils/sharedClock';
import { safeCssBackgroundUrl } from '../../utils/urlSecurity';

const WorldClockWidget = React.lazy(() =>
  import('../widgets/WorldClockWidget').then((m) => ({ default: m.WorldClockWidget }))
);
const WeatherWidget = React.lazy(() =>
  import('../widgets/WeatherWidget').then((m) => ({ default: m.WeatherWidget }))
);
const CountdownWidget = React.lazy(() =>
  import('../widgets/CountdownWidget').then((m) => ({ default: m.CountdownWidget }))
);
const QuotesWidget = React.lazy(() =>
  import('../widgets/QuotesWidget').then((m) => ({ default: m.QuotesWidget }))
);
const MediaEmbedWidget = React.lazy(() =>
  import('../widgets/MediaEmbedWidget').then((m) => ({ default: m.MediaEmbedWidget }))
);
const ImageWidget = React.lazy(() =>
  import('../widgets/ImageWidget').then((m) => ({ default: m.ImageWidget }))
);

const StickyNotesWidget = React.lazy(() =>
  import('../widgets/StickyNotesWidget').then((m) => ({ default: m.StickyNotesWidget }))
);

const ShoppingListNoteBody = React.lazy(() =>
  import('../common/ShoppingListNoteBody').then((m) => ({ default: m.ShoppingListNoteBody }))
);
const CanvasBlueprintPicker = React.lazy(() =>
  import('./CanvasBlueprintPicker').then((m) => ({ default: m.CanvasBlueprintPicker }))
);
const CorkboardNoteModal = React.lazy(() =>
  import('./CorkboardNoteModal').then((m) => ({ default: m.CorkboardNoteModal }))
);
const CorkboardTrashModal = React.lazy(() =>
  import('./CorkboardTrashModal').then((m) => ({ default: m.CorkboardTrashModal }))
);
const CorkboardContextMenu = React.lazy(() =>
  import('./CorkboardContextMenu').then((m) => ({ default: m.CorkboardContextMenu }))
);

const CalendarWidget = React.lazy(() =>
  import('../widgets/CalendarWidget').then((m) => ({ default: m.CalendarWidget }))
);
const RssWidget = React.lazy(() =>
  import('../widgets/RssWidget').then((m) => ({ default: m.RssWidget }))
);
const PhotoFrameWidget = React.lazy(() =>
  import('../widgets/PhotoFrameWidget').then((m) => ({ default: m.PhotoFrameWidget }))
);
const ChoreWidget = React.lazy(() =>
  import('../widgets/ChoreWidget').then((m) => ({ default: m.ChoreWidget }))
);
const MealPlannerWidget = React.lazy(() =>
  import('../widgets/MealPlannerWidget').then((m) => ({ default: m.MealPlannerWidget }))
);
const KanbanWidget = React.lazy(() =>
  import('../widgets/KanbanWidget').then((m) => ({ default: m.KanbanWidget }))
);
const FinanceWidget = React.lazy(() =>
  import('../widgets/FinanceWidget').then((m) => ({ default: m.FinanceWidget }))
);
const TimerWidget = React.lazy(() =>
  import('../widgets/TimerWidget').then((m) => ({ default: m.TimerWidget }))
);
const AirQualityWidget = React.lazy(() =>
  import('../widgets/AirQualityWidget').then((m) => ({ default: m.AirQualityWidget }))
);
const SunMoonWidget = React.lazy(() =>
  import('../widgets/SunMoonWidget').then((m) => ({ default: m.SunMoonWidget }))
);
const RoutinesWidget = React.lazy(() =>
  import('../widgets/RoutinesWidget').then((m) => ({ default: m.RoutinesWidget }))
);
const WifiQrWidget = React.lazy(() =>
  import('../widgets/WifiQrWidget').then((m) => ({ default: m.WifiQrWidget }))
);
const DecisionMakerWidget = React.lazy(() =>
  import('../widgets/DecisionMakerWidget').then((m) => ({ default: m.DecisionMakerWidget }))
);
const SportsWidget = React.lazy(() =>
  import('../widgets/SportsWidget').then((m) => ({ default: m.SportsWidget }))
);
const DailyDiscoveryWidget = React.lazy(() =>
  import('../widgets/DailyDiscoveryWidget').then((m) => ({ default: m.DailyDiscoveryWidget }))
);
const ChalkboardWidget = React.lazy(() =>
  import('../widgets/ChalkboardWidget').then((m) => ({ default: m.ChalkboardWidget }))
);
const SoundscapeWidget = React.lazy(() =>
  import('../widgets/SoundscapeWidget').then((m) => ({ default: m.SoundscapeWidget }))
);
const HomelabWidget = React.lazy(() =>
  import('../widgets/HomelabWidget').then((m) => ({ default: m.HomelabWidget }))
);
import { useDashboardStore } from '../../store/dashboardStore';
import { CANVAS_THEMES, isCanvasThemeLight } from '../../data/canvasThemes';
import { findOpenCanvasSpot } from '../../utils/autoLayout';
import { useIsCursorHidden } from '../../hooks/useIdleCursor';
import {
  resolveWidgetToolbarPlacement,
  shouldShowWidgetToolbarFullscreenButton,
} from '../../utils/widgetToolbarPlacement';
import { isWidgetStickerMode } from '../../utils/widgetStickerMode';
import { inferCuratedCategoryId } from '../../services/photos';
import {
  CARD_DRAG_HOLD_CANCEL_PX,
  CARD_DRAG_HOLD_MS,
  isPointInCanvasEdgeSwipeZone,
  requestCancelActiveCanvasSwipe,
  subscribeCancelActiveCardDrag,
} from '../../utils/canvasSwipe';

const ChoreDashboardView = React.lazy(() =>
  import('../chores/ChoreDashboardView').then((m) => ({ default: m.ChoreDashboardView }))
);

const KanbanBoardView = React.lazy(() =>
  import('../kanban/KanbanBoardView').then((m) => ({ default: m.KanbanBoardView }))
);

const WidgetSettingsModal = React.lazy(() =>
  import('../widgets/WidgetSettingsModal').then((m) => ({ default: m.WidgetSettingsModal }))
);
const PhotoSourcesModal = React.lazy(() =>
  import('../photos/PhotoSourcesModal').then((m) => ({ default: m.PhotoSourcesModal }))
);

interface CorkboardProps {
  notes: StickyNoteItem[];
  widgets?: DashboardWidget[];
  tabs?: DashboardTab[];
  activeTabId?: string;
  dockPaddingClass: string;
  backgroundTheme?: CanvasBackgroundTheme;
  customWallpaperUrl?: string;
  backgroundDimLevel?: number;
  hideNotes?: boolean;
  isCreatorOpen?: boolean;
  onOpenCreator?: () => void;
  onCloseCreator?: () => void;
  isTrashOpen?: boolean;
  onCloseTrash?: () => void;
  onUpdateNotePos: (noteId: string, pos: NonNullable<StickyNoteItem['freeformPos']>) => void;
  onUpdateWidgetPos?: (widgetId: string, gridPos: any, freeformPos: NonNullable<DashboardWidget['freeformPos']>) => void;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
  onPermanentlyDeleteNote?: (noteId: string) => void;
  onPermanentlyDeleteNotes?: (noteIds: string[]) => void;
  onRemoveWidget?: (widgetId: string) => void;
  onAddWidget?: (widget: Partial<DashboardWidget>) => void;
  onOpenAddWidget?: () => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  onUpdateTab?: (tabId: string, updates: Partial<DashboardTab>) => void;
  snapToGrid?: boolean;
  isCanvasLocked?: boolean;
}

const SNAP_COLUMNS = 24;
const SNAP_ROWS = 16;
const SNAP_STEP_X = 1 / SNAP_COLUMNS;
const SNAP_STEP_Y = 1 / SNAP_ROWS;

const COLOR_PALETTE = [
  '#fef08a', // Amber/Yellow
  '#bbf7d0', // Emerald/Green
  '#bae6fd', // Sky/Blue
  '#fbcfe8', // Pink
  '#e9d5ff', // Purple
  '#fed7aa', // Orange
];

const FONT_SIZE_CLASSES: Record<NonNullable<StickyNoteItem['fontSize']>, string> = {
  sm: 'text-[11px] leading-snug',
  base: 'text-xs leading-relaxed',
  lg: 'text-sm md:text-base leading-relaxed font-medium',
  xl: 'text-base md:text-xl leading-snug font-semibold',
};

function isPortalEvent(e: { currentTarget: EventTarget & Element; target: EventTarget | null }): boolean {
  return e.target instanceof Node && !e.currentTarget.contains(e.target);
}

interface StickyCanvasActions {
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
  onPermanentlyDeleteNote?: (noteId: string) => void;
  onPermanentlyDeleteNotes?: (noteIds: string[]) => void;
  onPinNoteToCanvas: (noteId: string) => void;
  onUnpinNoteFromCanvas: (noteId: string) => void;
}

interface CanvasWidgetBodyProps {
  widget: DashboardWidget;
  isWidgetLight: boolean;
  isFramelessWidget: boolean;
  isFullScreen: boolean;
  isCanvasLocked: boolean;
  dockPaddingClass: string;
  canUpdateWidget: boolean;
  onUpdateWidgetConfig: (widgetId: string, config: Record<string, any>) => void;
  onOpenWidgetSettings: (widget: DashboardWidget) => void;
  stickyNotes?: StickyNoteItem[];
  stickyActions?: StickyCanvasActions;
}

const MemoizedCanvasWidgetBody: React.FC<CanvasWidgetBodyProps> = React.memo(({
  widget,
  isWidgetLight,
  isFramelessWidget,
  isFullScreen,
  isCanvasLocked,
  dockPaddingClass,
  canUpdateWidget,
  onUpdateWidgetConfig,
  onOpenWidgetSettings,
  stickyNotes,
  stickyActions,
}) => {
  const handleConfigUpdate = useCallback(
    (updates: Record<string, any>) => {
      if (!canUpdateWidget) return;
      onUpdateWidgetConfig(widget.id, { ...widget.config, ...updates });
    },
    [canUpdateWidget, onUpdateWidgetConfig, widget.id, widget.config]
  );

  const handleOpenSettings = useMemo(
    () => (!isCanvasLocked && canUpdateWidget ? () => onOpenWidgetSettings(widget) : undefined),
    [isCanvasLocked, canUpdateWidget, onOpenWidgetSettings, widget]
  );

  const imageWidgetConfig = useMemo(
    () => ({ ...(widget.config || {}), transparentBg: isFramelessWidget }),
    [widget.config, isFramelessWidget]
  );

  return (
    <TileErrorBoundary label={widget.title} resetKey={widget.updated_at}>
      <React.Suspense fallback={null}>
        {widget.type === 'weather' ? (
        <WeatherWidget
          locationName={widget.config?.locationName}
          latitude={widget.config?.latitude}
          longitude={widget.config?.longitude}
          unit={widget.config?.unit || 'F'}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
        />
      ) : widget.type === 'clock' ? (
        <ClockWidget
          title={widget.title}
          clockFace={widget.config?.clockFace || 'digital'}
          showSeconds={widget.config?.showSeconds ?? true}
          timezone={widget.config?.timezone}
          locationName={widget.config?.locationName}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
        />
      ) : widget.type === 'world_clock' ? (
        <WorldClockWidget
          title={widget.title}
          cities={widget.config?.cities}
          clockFace={widget.config?.clockFace || 'digital'}
          showSeconds={widget.config?.showSeconds ?? true}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'clock_weather' ? (
        <ClockWeatherWidget
          locationName={widget.config?.locationName}
          latitude={widget.config?.latitude}
          longitude={widget.config?.longitude}
          unit={widget.config?.unit || 'F'}
          clockFace={widget.config?.clockFace || widget.config?.face || 'digital'}
          showSeconds={widget.config?.showSeconds ?? true}
          timezone={widget.config?.timezone}
          clockAlign={widget.config?.clockAlign || 'center'}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
        />
      ) : widget.type === 'countdown' ? (
        <CountdownWidget
          eventName={widget.title || widget.config?.eventName}
          targetDate={widget.config?.targetDate}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
        />
      ) : widget.type === 'quotes' ? (
        <QuotesWidget
          customQuotes={widget.config?.customQuotes}
          quoteMode={widget.config?.quoteMode}
          rotationIntervalSec={widget.config?.rotationIntervalSec ?? widget.config?.quoteIntervalSec}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
        />
      ) : widget.type === 'calendar' ? (
        <CalendarWidget
          sources={widget.config?.sources}
          defaultView={widget.config?.defaultView}
          multiDayLayout={widget.config?.multiDayLayout}
          showMeals={widget.config?.showMeals !== false}
          isLight={isWidgetLight}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'rss' ? (
        <RssWidget
          feedUrl={widget.config?.feedUrl}
          textSize={widget.config?.textSize}
          showSnippet={widget.config?.showSnippet !== false}
          isLight={isWidgetLight}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'photo_frame' ? (
        <PhotoFrameWidget
          widgetId={widget.id}
          useCommonSource={widget.config?.useCommonSource}
          initialStyle={widget.config?.displayStyle || 'ken_burns'}
          rotationIntervalSec={widget.config?.rotationIntervalSec || 15}
          customPhotos={widget.config?.customPhotos}
          sourceType={widget.config?.sourceType}
          curatedCategoryId={widget.config?.curatedCategoryId}
          initialSourceLabel={widget.config?.sourceLabel}
          initialPolaroidCount={widget.config?.polaroidCount || 12}
          initialPolaroidSizeMode={widget.config?.polaroidSizeMode || 'mixed'}
          photoOrder={widget.config?.photoOrder || 'random'}
          showCaptions={widget.config?.showCaptions ?? true}
          showDateTaken={widget.config?.showDateTaken}
          mosaicKenBurns={widget.config?.mosaicKenBurns ?? false}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'embed' ? (
        <MediaEmbedWidget
          preset={widget.config?.preset || 'lofi'}
          customUrl={widget.config?.customUrl}
          muted={widget.config?.muted ?? true}
          latitude={widget.config?.latitude}
          longitude={widget.config?.longitude}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'textbox' ? (
        <TextBoxWidget
          content={widget.config?.content}
          fontSize={widget.config?.fontSize}
          fontWeight={widget.config?.fontWeight}
          textAlign={widget.config?.textAlign}
          fontFamily={widget.config?.fontFamily}
          textColor={widget.config?.textColor}
          textShadow={widget.config?.textShadow}
          textTransform={widget.config?.textTransform}
          letterSpacing={widget.config?.letterSpacing}
          bgStyle={widget.config?.bgStyle}
          transparentBg={isFramelessWidget}
          isLight={isWidgetLight}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'image' ? (
        <ImageWidget
          id={widget.id}
          config={imageWidgetConfig}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'sticky_notes' && stickyActions ? (
        <StickyNotesWidget
          notes={stickyNotes || []}
          onAddNote={stickyActions.onAddNote}
          onUpdateNote={stickyActions.onUpdateNote}
          onDeleteNote={stickyActions.onDeleteNote}
          onPermanentlyDeleteNote={stickyActions.onPermanentlyDeleteNote}
          onPermanentlyDeleteNotes={stickyActions.onPermanentlyDeleteNotes}
          onPinNoteToCanvas={stickyActions.onPinNoteToCanvas}
          onUnpinNoteFromCanvas={stickyActions.onUnpinNoteFromCanvas}
          isLight={isWidgetLight}
        />
      ) : widget.type === 'chores' ? (
        isFullScreen ? (
          <React.Suspense fallback={null}>
            <ChoreDashboardView
              isOpen={true}
              mode="canvas"
              title={widget.title}
              config={widget.config}
              isLight={isWidgetLight}
              dockPaddingClass={dockPaddingClass}
              onOpenWidgetSettings={handleOpenSettings}
            />
          </React.Suspense>
        ) : (
          <ChoreWidget
            title={widget.title}
            config={widget.config}
            isLight={isWidgetLight}
            variant="tile"
            onUpdateConfig={handleConfigUpdate}
          />
        )
      ) : widget.type === 'meals' ? (
        <MealPlannerWidget
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'kanban' ? (
        isFullScreen ? (
          <React.Suspense fallback={null}>
            <KanbanBoardView
              isOpen={true}
              mode="canvas"
              widgetId={widget.id}
              title={widget.title}
              config={widget.config}
              isLight={isWidgetLight}
              dockPaddingClass={dockPaddingClass}
              onUpdateConfig={handleConfigUpdate}
              onOpenWidgetSettings={handleOpenSettings}
            />
          </React.Suspense>
        ) : (
          <KanbanWidget
            widgetId={widget.id}
            title={widget.title}
            config={widget.config}
            isLight={isWidgetLight}
            variant="tile"
            onUpdateConfig={handleConfigUpdate}
          />
        )
      ) : widget.type === 'finance' ? (
        <FinanceWidget
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'timer' ? (
        <TimerWidget
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'air_quality' ? (
        <AirQualityWidget
          locationName={widget.config?.locationName}
          latitude={widget.config?.latitude}
          longitude={widget.config?.longitude}
          showPollen={widget.config?.showPollen}
          showUvStrip={widget.config?.showUvStrip}
          refreshIntervalMin={widget.config?.refreshIntervalMin}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
        />
      ) : widget.type === 'sun_moon' ? (
        <SunMoonWidget
          locationName={widget.config?.locationName}
          latitude={widget.config?.latitude}
          longitude={widget.config?.longitude}
          timezone={widget.config?.timezone}
          showGoldenHour={widget.config?.showGoldenHour}
          showMoonDetails={widget.config?.showMoonDetails}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
        />
      ) : widget.type === 'routines' ? (
        <RoutinesWidget
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'wifi_qr' ? (
        <WifiQrWidget
          widgetId={widget.id}
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'decision_maker' ? (
        <DecisionMakerWidget
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'sports' ? (
        <SportsWidget
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'daily_discovery' ? (
        <DailyDiscoveryWidget
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'chalkboard' ? (
        <ChalkboardWidget
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          isCanvasLocked={isCanvasLocked}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'soundscape' ? (
        <SoundscapeWidget
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onUpdateConfig={handleConfigUpdate}
        />
      ) : widget.type === 'homelab' ? (
        <HomelabWidget
          widgetId={widget.id}
          title={widget.title}
          config={widget.config}
          isLight={isWidgetLight}
          transparentBg={isFramelessWidget}
          onOpenSettings={handleOpenSettings}
        />
      ) : null}
      </React.Suspense>
    </TileErrorBoundary>
  );
});

interface CanvasCardEventHandlers {
  onPointerDown: (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => void;
  onBringToFront: (id: string, type: 'note' | 'widget') => void;
  onRotatePointerDown: (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => void;
  onResizePointerDown: (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => void;
  onPointerMove: (e: React.PointerEvent | PointerEvent) => void;
  onPointerUp: (e?: React.PointerEvent | PointerEvent) => void;
  onUpdateWidgetPos?: (
    widgetId: string,
    gridPos: any,
    freeformPos: NonNullable<DashboardWidget['freeformPos']>
  ) => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  onRemoveWidget?: (widgetId: string) => void;
  onUpdateNotePos: (noteId: string, pos: NonNullable<StickyNoteItem['freeformPos']>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
  onOpenNoteEditor: (note: StickyNoteItem) => void;
  onToggleChecklistItem: (note: StickyNoteItem, itemId: string) => void;
  checkIsDragging: () => boolean;
}

interface MemoizedCanvasWidgetCardProps {
  widget: DashboardWidget;
  isWidgetLight: boolean;
  isCanvasLocked: boolean;
  isCursorHidden: boolean;
  isSwipeNavigationActive: boolean;
  defaultWidgetStyle: DefaultWidgetFrameStyle;
  reduceVisualEffects: boolean;
  dockPaddingClass: string;
  topZIndex: number;
  canUpdateWidget: boolean;
  hasUpdateWidgetPos: boolean;
  hasRemoveWidget: boolean;
  isDragging: boolean;
  activeDragPos: { xRatio: number; yRatio: number } | null;
  activeContainerSize: { width: number; height: number } | null;
  isResizing: boolean;
  activeResizeRatio: { wRatio: number; hRatio: number } | null;
  isRotating: boolean;
  activeRotateAngle: number | null;
  isCompactExpanded: boolean;
  stickyNotes?: StickyNoteItem[];
  stickyActions?: StickyCanvasActions;
  onUpdateWidgetConfig: (widgetId: string, config: Record<string, any>) => void;
  onOpenWidgetSettings: (widget: DashboardWidget) => void;
  onSetExpandedCompactToolbarId: React.Dispatch<React.SetStateAction<string | null>>;
  onSetContextMenu: React.Dispatch<React.SetStateAction<CorkboardContextMenuState | null>>;
  handlersRef: React.RefObject<CanvasCardEventHandlers | null>;
}

const DEFAULT_WIDGET_FREEFORM_POS: NonNullable<DashboardWidget['freeformPos']> = {
  xRatio: 0.1,
  yRatio: 0.1,
  wRatio: 0.35,
  hRatio: 0.45,
  zIndex: 5,
  rotation: 0,
};

const MemoizedCanvasWidgetCard: React.FC<MemoizedCanvasWidgetCardProps> = React.memo(({
  widget,
  isWidgetLight,
  isCanvasLocked,
  isCursorHidden,
  isSwipeNavigationActive,
  defaultWidgetStyle,
  reduceVisualEffects,
  dockPaddingClass,
  topZIndex,
  canUpdateWidget,
  hasUpdateWidgetPos,
  hasRemoveWidget,
  isDragging,
  activeDragPos,
  activeContainerSize,
  isResizing,
  activeResizeRatio,
  isRotating,
  activeRotateAngle,
  isCompactExpanded,
  stickyNotes,
  stickyActions,
  onUpdateWidgetConfig,
  onOpenWidgetSettings,
  onSetExpandedCompactToolbarId,
  onSetContextMenu,
  handlersRef,
}) => {
  const pos = widget.freeformPos || DEFAULT_WIDGET_FREEFORM_POS;
  const isFullScreen =
    Boolean(pos.isFullScreen) ||
    (widget.type === 'chores' && widget.config?.displayMode === 'hub') ||
    (widget.type === 'kanban' && widget.config?.displayMode === 'view');
  const isActiveManipulating = isDragging || isResizing || isRotating;
  const isFramelessWidget = isWidgetStickerMode(widget, defaultWidgetStyle);

  const layout = computeCardDragLayout({
    basePos: {
      xRatio: pos.xRatio ?? 0.1,
      yRatio: pos.yRatio ?? 0.1,
      wRatio: pos.wRatio ?? 0.35,
      hRatio: pos.hRatio ?? 0.45,
      rotation: pos.rotation ?? 0,
    },
    isDragging,
    dragPos: activeDragPos,
    containerSize: activeContainerSize,
    isResizing,
    resizeRatio: activeResizeRatio,
    isRotating,
    rotateAngle: activeRotateAngle,
    dragScale: 1.02,
  });

  const toolbarPlacement = resolveWidgetToolbarPlacement({
    isFullScreen,
    yRatio: layout.effectiveYRatio,
    hRatio: layout.effectiveHRatio,
  });
  const isNarrowCardForToolbar = layout.effectiveWRatio < 0.3;
  const isCompactToolbar = toolbarPlacement === 'compact-pill';
  const showCompactExpanded = !isCompactToolbar || isCompactExpanded;
  const showRotateAction = !isFullScreen && !isCanvasLocked && hasUpdateWidgetPos;
  const showSettingsAction = !isCanvasLocked && canUpdateWidget;
  const showLayersAction = !isCanvasLocked && hasUpdateWidgetPos && !isFullScreen;
  const showFullScreenAction =
    hasUpdateWidgetPos && shouldShowWidgetToolbarFullscreenButton(widget.type, isFullScreen);
  const showRemoveAction = !isCanvasLocked && hasRemoveWidget;
  const hasAnyToolbarActions =
    showRotateAction ||
    showSettingsAction ||
    showLayersAction ||
    showFullScreenAction ||
    showRemoveAction;

  const cardSurfaceClasses = isFramelessWidget
    ? isWidgetLight
      ? 'bg-transparent text-slate-800'
      : 'bg-transparent text-white'
    : reduceVisualEffects
      ? isWidgetLight
        ? 'bg-white/98 shadow-xl text-slate-800'
        : 'bg-gray-900/95 shadow-2xl text-white'
      : isWidgetLight
        ? `bg-white/95 ${isActiveManipulating ? '' : 'backdrop-blur-md '}shadow-xl text-slate-800`
        : `bg-gray-900/80 ${isActiveManipulating ? '' : 'backdrop-blur-md '}shadow-2xl text-white`;

  return (
    <div
      data-canvas-card="true"
      data-canvas-fullscreen={isFullScreen ? 'true' : undefined}
      data-canvas-manipulating={isActiveManipulating ? 'true' : undefined}
      onPointerDown={(e) => {
        if (isPortalEvent(e)) return;
        if (shouldYieldToEdgeSwipeCardEvent(e, isSwipeNavigationActive)) return;
        if (!isFullScreen && !isCanvasLocked) {
          handlersRef.current?.onPointerDown(e, widget.id, 'widget', pos);
        }
      }}
      onPointerDownCapture={(e) => {
        if (isPortalEvent(e)) return;
        if (isSwipeNavigationActive) return;
        if (!isFullScreen && !isCanvasLocked && !pos?.isBackground && (pos?.zIndex || 1) < topZIndex) {
          handlersRef.current?.onBringToFront(widget.id, 'widget');
        }
      }}
      onContextMenu={(e) => {
        if (isPortalEvent(e) || isCanvasLocked) return;
        e.preventDefault();
        e.stopPropagation();
        onSetContextMenu({
          x: e.clientX,
          y: e.clientY,
          id: widget.id,
          type: 'widget',
          title: widget.title,
          currentZ: pos.zIndex || 1,
          isBackground: Boolean(pos.isBackground),
          rotation: pos.rotation,
        });
      }}
      onPointerMove={(e) => handlersRef.current?.onPointerMove(e)}
      onPointerUp={(e) => handlersRef.current?.onPointerUp(e)}
      onPointerCancel={(e) => handlersRef.current?.onPointerUp(e)}
      style={
        isFullScreen
          ? {
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              zIndex: 60,
              touchAction: 'pan-y',
              WebkitTouchCallout: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }
          : ({
              position: 'absolute',
              left: `${layout.leftPct}%`,
              top: `${layout.topPct}%`,
              width: `${layout.widthPct}%`,
              height: `${layout.heightPct}%`,
              minWidth: '180px',
              minHeight: isFramelessWidget ? '50px' : '140px',
              maxWidth: '100%',
              maxHeight: '100%',
              transform: layout.transform,
              '--card-z': isActiveManipulating ? 58 : pos.zIndex,
              touchAction: isActiveManipulating ? 'none' : 'pan-y',
              WebkitTouchCallout: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              willChange: layout.willChange,
              transition: isActiveManipulating
                ? 'none'
                : 'left 0.3s cubic-bezier(0.22, 1, 0.36, 1), top 0.3s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s cubic-bezier(0.22, 1, 0.36, 1), height 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.25s ease-out, box-shadow 0.2s',
            } as React.CSSProperties)
      }
      className={`group ${
        isFullScreen
          ? widget.type === 'meals'
            ? 'rounded-none border-0 p-4 overflow-hidden'
            : 'rounded-none border-0 p-0 overflow-hidden'
          : isFramelessWidget
          ? widget.type === 'photo_frame'
            ? 'rounded-2xl border-0 p-0'
            : 'rounded-2xl border-0 p-1'
          : widget.type === 'image'
          ? isWidgetLight ? 'rounded-2xl border border-slate-200/90 p-0' : 'rounded-2xl border border-gray-800/90 p-0'
          : isWidgetLight ? 'rounded-2xl border border-slate-200/90 p-4' : 'rounded-2xl border border-gray-800/90 p-4'
      } ${cardSurfaceClasses} ${isFullScreen ? '' : `z-[var(--card-z)] ${!isCanvasLocked && !isActiveManipulating ? 'hover:z-[55] ' : ''}`}${
        isCanvasLocked || isFullScreen ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${isFullScreen ? '' : isActiveManipulating ? 'touch-none' : 'touch-pan-y'} select-none transition-shadow ${
        isDragging || isRotating
          ? 'ring-2 ring-blue-500 shadow-blue-500/20'
          : isFramelessWidget
          ? ''
          : 'hover:shadow-blue-500/10'
      } flex flex-col justify-between`}
    >
      {/* Elevated Grab-to-Rotate Handle */}
      {!isFullScreen && !isCanvasLocked && hasUpdateWidgetPos && !isCompactToolbar && (
        <div
          data-no-drag="true"
          data-no-canvas-swipe="true"
          data-kiosk-edit-chrome="true"
          onPointerDown={(e) => handlersRef.current?.onRotatePointerDown(e, widget.id, 'widget', pos)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handlersRef.current?.onUpdateWidgetPos?.(widget.id, widget.gridPos, { ...pos, rotation: 0 });
          }}
          title={
            isCursorHidden
              ? undefined
              : 'Grab and drag in a circle to rotate tile (double-click to reset to 0°)'
          }
          className={`absolute ${
            isNarrowCardForToolbar ? 'left-3' : 'left-1/2 -translate-x-1/2'
          } z-50 flex flex-col items-center transition-opacity pointer-events-auto cursor-grab active:cursor-grabbing px-3 ${
            isRotating
              ? 'opacity-100'
              : isCursorHidden
                ? 'opacity-0 pointer-events-none'
                : 'opacity-0 group-hover:opacity-100'
          } ${
            toolbarPlacement === 'outside-bottom'
              ? '-bottom-8 pt-2 flex-col-reverse'
              : '-top-7.5 pb-2'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full bg-gray-950 border border-blue-400 hover:border-blue-300 text-blue-300 hover:text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all ${
              isRotating ? 'ring-2 ring-blue-400 bg-blue-900/60' : ''
            }`}
          >
            <RotateCw className="w-3 h-3" />
          </div>
          <div className="w-0.5 h-1.5 bg-blue-400/60" />
          {isRotating && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-mono font-bold text-[10px] shadow-lg mt-0.5">
              {layout.effectiveRotation}°
            </span>
          )}
        </div>
      )}

      {/* Floating Widget Controls: Outside-top, flipped outside-bottom near top edge, or compact pill */}
      {hasAnyToolbarActions && (
        <div
          data-no-drag="true"
          data-kiosk-edit-chrome="true"
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse' && isCompactToolbar) {
              onSetExpandedCompactToolbarId(widget.id);
            }
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse' && isCompactToolbar) {
              onSetExpandedCompactToolbarId((prev) => (prev === widget.id ? null : prev));
            }
          }}
          className={`absolute z-50 transition-opacity ${
            isCursorHidden ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'
          } ${
            toolbarPlacement === 'outside-top'
              ? 'bottom-full right-2 pb-1.5'
              : toolbarPlacement === 'outside-bottom'
                ? 'top-full right-6 pt-1.5'
                : `left-1/2 -translate-x-1/2 ${
                    isFullScreen && dockPaddingClass === 'pt-20' ? 'top-20' : 'top-1.5'
                  }`
          }`}
        >
          {!showCompactExpanded ? (
            <button
              type="button"
              data-no-drag="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSetExpandedCompactToolbarId(widget.id);
              }}
              title={isCursorHidden ? undefined : 'Tile actions'}
              className={`flex items-center justify-center px-2 py-0.5 rounded-full backdrop-blur-md shadow-lg transition-colors cursor-pointer ${
                isWidgetLight
                  ? 'bg-white/95 border border-slate-300/90 text-slate-600 hover:text-slate-900'
                  : 'bg-gray-950/90 border border-gray-700/80 text-gray-300 hover:text-white'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div
              className={`flex items-center gap-1 backdrop-blur-md px-1.5 py-1 rounded-xl shadow-xl ${
                isWidgetLight
                  ? 'bg-white/95 border border-slate-300/90 text-slate-700'
                  : 'bg-gray-950/90 border border-gray-700/80 shadow-2xl text-gray-300'
              }`}
            >
              {showRotateAction && (
                <button
                  type="button"
                  data-no-canvas-swipe="true"
                  onPointerDown={(e) => handlersRef.current?.onRotatePointerDown(e, widget.id, 'widget', pos)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handlersRef.current?.onUpdateWidgetPos?.(widget.id, widget.gridPos, { ...pos, rotation: 0 });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isRotating && pos.rotation !== 0) {
                      handlersRef.current?.onUpdateWidgetPos?.(widget.id, widget.gridPos, { ...pos, rotation: 0 });
                    }
                  }}
                  title={
                    isCursorHidden
                      ? undefined
                      : pos.rotation !== 0
                        ? `Rotated ${pos.rotation}° — drag to rotate or click to reset to 0°`
                        : 'Drag in a circle to rotate tile'
                  }
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-0.5 transition-all cursor-grab active:cursor-grabbing ${
                    pos.rotation !== 0
                      ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-600 hover:text-white'
                      : isWidgetLight
                        ? 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                        : 'hover:bg-gray-800 text-gray-300 hover:text-white'
                  }`}
                >
                  <RotateCw className="w-3 h-3" />
                  {pos.rotation !== 0 && <span>{pos.rotation}°</span>}
                </button>
              )}
              {showSettingsAction && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCompactToolbar) onSetExpandedCompactToolbarId(null);
                    onOpenWidgetSettings(widget);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={isCursorHidden ? undefined : 'Configure tile title and settings'}
                  className={`p-1 rounded-lg transition-all cursor-pointer ${
                    isWidgetLight
                      ? 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                      : 'hover:bg-gray-800 text-gray-300 hover:text-white'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
              {showLayersAction && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCompactToolbar) onSetExpandedCompactToolbarId(null);
                    const rect = e.currentTarget.getBoundingClientRect();
                    onSetContextMenu({
                      x: rect.left,
                      y: rect.bottom + 6,
                      id: widget.id,
                      type: 'widget',
                      title: widget.title,
                      currentZ: pos.zIndex || 1,
                      isBackground: Boolean(pos.isBackground),
                      rotation: pos.rotation,
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={isCursorHidden ? undefined : 'Layer order & appearance'}
                  className={`p-1 rounded-lg transition-all cursor-pointer ${
                    isWidgetLight
                      ? 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                      : 'hover:bg-gray-800 text-gray-300 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              )}
              {showFullScreenAction && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCompactToolbar) onSetExpandedCompactToolbarId(null);
                    if (isFullScreen) {
                      const nextPos = {
                        ...pos,
                        xRatio: 0.1,
                        yRatio: 0.1,
                        wRatio: 0.45,
                        hRatio: 0.5,
                        rotation: 0,
                        isFullScreen: false,
                      };
                      if (widget.type === 'chores' && canUpdateWidget) {
                        handlersRef.current?.onUpdateWidget?.(widget.id, {
                          freeformPos: nextPos,
                          config: { ...widget.config, displayMode: 'tile' },
                        });
                      } else if (widget.type === 'kanban' && canUpdateWidget) {
                        handlersRef.current?.onUpdateWidget?.(widget.id, {
                          freeformPos: nextPos,
                          config: { ...widget.config, displayMode: 'tile' },
                        });
                      } else {
                        handlersRef.current?.onUpdateWidgetPos?.(widget.id, widget.gridPos, nextPos);
                      }
                    } else {
                      const nextPos = {
                        ...pos,
                        xRatio: 0,
                        yRatio: 0,
                        wRatio: 1,
                        hRatio: 1,
                        rotation: 0,
                        isFullScreen: true,
                      };
                      if (widget.type === 'chores' && canUpdateWidget) {
                        handlersRef.current?.onUpdateWidget?.(widget.id, {
                          freeformPos: nextPos,
                          config: { ...widget.config, displayMode: 'hub' },
                        });
                      } else if (widget.type === 'kanban' && canUpdateWidget) {
                        handlersRef.current?.onUpdateWidget?.(widget.id, {
                          freeformPos: nextPos,
                          config: { ...widget.config, displayMode: 'view' },
                        });
                      } else {
                        handlersRef.current?.onUpdateWidgetPos?.(widget.id, widget.gridPos, nextPos);
                      }
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={
                    isCursorHidden
                      ? undefined
                      : isFullScreen
                        ? 'Restore card size'
                        : 'Fill full screen / canvas'
                  }
                  className={`p-1 rounded-lg transition-all cursor-pointer ${
                    isWidgetLight
                      ? 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                      : 'hover:bg-gray-800 text-gray-300 hover:text-white'
                  }`}
                >
                  {isFullScreen ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              {showRemoveAction && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCompactToolbar) onSetExpandedCompactToolbarId(null);
                    handlersRef.current?.onRemoveWidget?.(widget.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={isCursorHidden ? undefined : 'Remove widget'}
                  className="p-1 rounded-lg hover:bg-red-500/80 text-gray-400 hover:text-white transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom Right Resize Handle */}
      {!isFullScreen && !isCanvasLocked && (
        <div
          data-no-drag="true"
          data-no-canvas-swipe="true"
          data-kiosk-edit-chrome="true"
          onPointerDown={(e) => handlersRef.current?.onResizePointerDown(e, widget.id, 'widget', pos)}
          title={isCursorHidden ? undefined : 'Drag to resize tile'}
          className={`absolute bottom-1 right-1 p-1.5 cursor-nwse-resize z-40 touch-none transition-opacity ${
            isResizing
              ? 'opacity-100'
              : isCursorHidden
                ? 'opacity-0 pointer-events-none'
                : 'opacity-40 group-hover:opacity-100 hover:opacity-100'
          } ${
            isWidgetLight ? 'text-slate-400 hover:text-slate-800' : 'text-gray-400 hover:text-white'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="fill-current">
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="6" cy="10" r="1.5" />
            <circle cx="10" cy="6" r="1.5" />
            <circle cx="2" cy="10" r="1.5" />
            <circle cx="6" cy="6" r="1.5" />
            <circle cx="10" cy="2" r="1.5" />
          </svg>
        </div>
      )}

      {/* Widget Inner Renderers */}
      <div
        className={`relative z-0 isolate w-full h-full flex flex-col justify-between ${
          isFramelessWidget && widget.type === 'photo_frame' && widget.config?.displayStyle === 'polaroid'
            ? 'overflow-visible'
            : 'overflow-hidden'
        } rounded-[inherit]`}
      >
        <MemoizedCanvasWidgetBody
          widget={widget}
          isWidgetLight={isWidgetLight}
          isFramelessWidget={isFramelessWidget}
          isFullScreen={isFullScreen}
          isCanvasLocked={isCanvasLocked}
          dockPaddingClass={dockPaddingClass}
          canUpdateWidget={canUpdateWidget}
          onUpdateWidgetConfig={onUpdateWidgetConfig}
          onOpenWidgetSettings={onOpenWidgetSettings}
          stickyNotes={widget.type === 'sticky_notes' ? stickyNotes : undefined}
          stickyActions={widget.type === 'sticky_notes' ? stickyActions : undefined}
        />
      </div>
    </div>
  );
});

const DEFAULT_NOTE_FREEFORM_POS: NonNullable<StickyNoteItem['freeformPos']> = {
  xRatio: 0.1,
  yRatio: 0.1,
  wRatio: 0.26,
  hRatio: 0.3,
  zIndex: 1,
  rotation: 0,
};

interface MemoizedCanvasStickyNoteCardProps {
  note: StickyNoteItem;
  nowMs: number;
  isCanvasLocked: boolean;
  isCursorHidden: boolean;
  isSwipeNavigationActive: boolean;
  isHighlighted: boolean;
  hasStickyNotesTile: boolean;
  topZIndex: number;
  isDragging: boolean;
  activeDragPos: { xRatio: number; yRatio: number } | null;
  activeContainerSize: { width: number; height: number } | null;
  isResizing: boolean;
  activeResizeRatio: { wRatio: number; hRatio: number } | null;
  isRotating: boolean;
  activeRotateAngle: number | null;
  lastTapRef: React.RefObject<{ id: string; time: number }>;
  onSetContextMenu: React.Dispatch<React.SetStateAction<CorkboardContextMenuState | null>>;
  handlersRef: React.RefObject<CanvasCardEventHandlers | null>;
}

const MemoizedCanvasStickyNoteCard: React.FC<MemoizedCanvasStickyNoteCardProps> = React.memo(({
  note,
  nowMs,
  isCanvasLocked,
  isCursorHidden,
  isSwipeNavigationActive,
  isHighlighted,
  hasStickyNotesTile,
  topZIndex,
  isDragging,
  activeDragPos,
  activeContainerSize,
  isResizing,
  activeResizeRatio,
  isRotating,
  activeRotateAngle,
  lastTapRef,
  onSetContextMenu,
  handlersRef,
}) => {
  const pos = note.freeformPos || DEFAULT_NOTE_FREEFORM_POS;
  const isActiveManipulating = isDragging || isResizing || isRotating;
  const isExpiringSoon =
    Boolean(note.expiresAt) &&
    new Date(note.expiresAt!).getTime() - nowMs < 12 * 60 * 60 * 1000;
  const fontSizeClass = FONT_SIZE_CLASSES[note.fontSize || 'base'];

  const layout = computeCardDragLayout({
    basePos: {
      xRatio: pos.xRatio ?? 0.1,
      yRatio: pos.yRatio ?? 0.1,
      wRatio: pos.wRatio ?? 0.26,
      hRatio: pos.hRatio ?? 0.3,
      rotation: pos.rotation ?? 0,
    },
    isDragging,
    dragPos: activeDragPos,
    containerSize: activeContainerSize,
    isResizing,
    resizeRatio: activeResizeRatio,
    isRotating,
    rotateAngle: activeRotateAngle,
    dragScale: 1.03,
  });

  const handleCheckDragGuard = useCallback(
    () => Boolean(handlersRef.current?.checkIsDragging()),
    [handlersRef]
  );

  return (
    <div
      data-canvas-card="true"
      data-canvas-manipulating={isActiveManipulating ? 'true' : undefined}
      onPointerDown={(e) => {
        if (isPortalEvent(e)) return;
        if (shouldYieldToEdgeSwipeCardEvent(e, isSwipeNavigationActive)) return;
        if (!isCanvasLocked) handlersRef.current?.onPointerDown(e, note.id, 'note', pos);
      }}
      onPointerDownCapture={(e) => {
        if (isPortalEvent(e)) return;
        if (isSwipeNavigationActive) return;
        if (!isCanvasLocked && !pos?.isBackground && (pos?.zIndex || 1) < topZIndex) {
          handlersRef.current?.onBringToFront(note.id, 'note');
        }
      }}
      onContextMenu={(e) => {
        if (isPortalEvent(e) || isCanvasLocked) return;
        e.preventDefault();
        e.stopPropagation();
        onSetContextMenu({
          x: e.clientX,
          y: e.clientY,
          id: note.id,
          type: 'note',
          title: note.title || 'Sticky Note',
          currentZ: pos.zIndex || 1,
          isBackground: Boolean(pos.isBackground),
          rotation: pos.rotation,
        });
      }}
      onPointerMove={(e) => handlersRef.current?.onPointerMove(e)}
      onPointerUp={(e) => {
        if (isPortalEvent(e)) return;
        handlersRef.current?.onPointerUp(e);
        if (!handlersRef.current?.checkIsDragging()) {
          const tapNow = Date.now();
          if (lastTapRef.current.id === note.id && tapNow - lastTapRef.current.time < 350) {
            handlersRef.current?.onOpenNoteEditor(note);
            lastTapRef.current = { id: '', time: 0 };
          } else {
            lastTapRef.current = { id: note.id, time: tapNow };
          }
        }
      }}
      onPointerCancel={(e) => handlersRef.current?.onPointerUp(e)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        handlersRef.current?.onOpenNoteEditor(note);
      }}
      style={{
        position: 'absolute',
        left: `${layout.leftPct}%`,
        top: `${layout.topPct}%`,
        width: `${layout.widthPct}%`,
        height: `${layout.heightPct}%`,
        minWidth: '110px',
        minHeight: '90px',
        maxWidth: '100%',
        maxHeight: '100%',
        transform: layout.transform,
        backgroundColor: note.bgColor || '#fef08a',
        '--card-z': isActiveManipulating ? 58 : pos.zIndex,
        touchAction: isActiveManipulating ? 'none' : 'pan-y',
        WebkitTouchCallout: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        willChange: layout.willChange,
        transition: isActiveManipulating
          ? 'none'
          : 'left 0.3s cubic-bezier(0.22, 1, 0.36, 1), top 0.3s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s cubic-bezier(0.22, 1, 0.36, 1), height 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.25s ease-out, box-shadow 0.2s',
      } as React.CSSProperties}
      className={`group rounded-2xl p-3.5 shadow-2xl text-gray-900 z-[var(--card-z)] ${!isCanvasLocked && !isActiveManipulating ? 'hover:z-[55] ' : ''}${
        isCanvasLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } border border-black/10 ${isActiveManipulating ? 'touch-none' : 'touch-pan-y'} select-none transition-all ${
        isDragging || isRotating
          ? 'ring-2 ring-blue-500/70 shadow-2xl'
          : isHighlighted
          ? 'ring-4 ring-blue-500 shadow-2xl shadow-blue-500/50 scale-105'
          : isExpiringSoon
          ? 'ring-2 ring-amber-500 shadow-amber-500/20'
          : 'hover:shadow-yellow-500/10'
      } flex flex-col justify-between`}
    >
      {/* Top-Center Grab-to-Rotate Handle with Stem */}
      {!isCanvasLocked && (
        <div
          data-no-drag="true"
          data-no-canvas-swipe="true"
          data-kiosk-edit-chrome="true"
          onPointerDown={(e) => handlersRef.current?.onRotatePointerDown(e, note.id, 'note', pos)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handlersRef.current?.onUpdateNotePos(note.id, { ...pos, rotation: 0 });
          }}
          title={isCursorHidden ? undefined : 'Grab and drag in a circle to rotate note (double-click to reset to 0°)'}
          className={`absolute -top-7.5 left-1/2 -translate-x-1/2 flex flex-col items-center z-50 transition-opacity pointer-events-auto cursor-grab active:cursor-grabbing px-3 pb-2 ${
            isRotating ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full bg-gray-900/95 border border-gray-700 hover:border-gray-500 text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all ${
              isRotating ? 'ring-2 ring-blue-400' : ''
            }`}
          >
            <RotateCw className="w-3 h-3" />
          </div>
          <div className="w-0.5 h-1.5 bg-gray-600/70" />
          {isRotating && (
            <span className="px-1.5 py-0.5 rounded-full bg-gray-900 text-white font-mono font-bold text-[10px] shadow mt-0.5">
              {layout.effectiveRotation}°
            </span>
          )}
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto min-h-0 pr-0.5 select-none touch-none"
        style={{
          touchAction: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
        }}
      >
        {/* Note Title & Header Edit Button */}
        <div
          className="font-bold text-xs md:text-sm mb-1.5 flex items-center justify-between border-b border-black/10 pb-1 select-none touch-none"
          style={{
            touchAction: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            userSelect: 'none',
          }}
        >
          <span className="truncate select-none touch-none">
            {note.title ||
              (note.isShoppingList || note.freeformPos?.isShoppingList
                ? '🛒 Shopping List'
                : note.isChecklist
                ? 'Checklist'
                : 'Note')}
          </span>
          <div className="flex items-center gap-1 shrink-0 select-none touch-none">
            {note.expiresAt && (
              <span
                title={isCursorHidden ? undefined : `Expires: ${new Date(note.expiresAt).toLocaleString()}`}
                className={`text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 select-none touch-none ${
                  isExpiringSoon ? 'bg-amber-500/30 text-amber-950 font-bold' : 'bg-black/10 text-gray-700'
                }`}
              >
                <Clock className="w-2.5 h-2.5" />
                {new Date(note.expiresAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
              </span>
            )}
            {!isCanvasLocked && (
              <>
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlersRef.current?.onOpenNoteEditor(note);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded-md text-gray-700 hover:text-blue-900 hover:bg-black/10 active:bg-black/20 transition-all cursor-pointer"
                  title={isCursorHidden ? undefined : 'Edit note'}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onSetContextMenu({
                      x: rect.left,
                      y: rect.bottom + 6,
                      id: note.id,
                      type: 'note',
                      title: note.title || 'Sticky Note',
                      currentZ: pos.zIndex || 1,
                      isBackground: Boolean(pos.isBackground),
                      rotation: pos.rotation,
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded-md text-gray-700 hover:text-blue-900 hover:bg-black/10 active:bg-black/20 transition-all cursor-pointer"
                  title={isCursorHidden ? undefined : 'Layer order (Bring to Front / Send to Back)'}
                >
                  <Layers className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasStickyNotesTile) {
                      handlersRef.current?.onUpdateNote(note.id, { isPinnedToCanvas: false });
                    } else {
                      handlersRef.current?.onDeleteNote(note.id);
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded-md text-gray-700 hover:text-red-900 hover:bg-black/10 active:bg-black/20 transition-all cursor-pointer"
                  title={
                    isCursorHidden
                      ? undefined
                      : hasStickyNotesTile
                        ? 'Close from canvas (remains saved in Notes Tile)'
                        : 'Delete note (move to Archive)'
                  }
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Note Content / Checklist / Shopping List */}
        {note.isShoppingList || note.freeformPos?.isShoppingList ? (
          <React.Suspense fallback={null}>
            <ShoppingListNoteBody
              note={note}
              fontSizeClass={fontSizeClass}
              onUpdateItems={(nextItems) =>
                handlersRef.current?.onUpdateNote(note.id, { checklistItems: nextItems })
              }
              onToggleItem={(itemId) => handlersRef.current?.onToggleChecklistItem(note, itemId)}
              onCheckDragGuard={handleCheckDragGuard}
            />
          </React.Suspense>
        ) : note.isChecklist && note.checklistItems ? (
          <div className="space-y-1.5 mt-1 select-none touch-none">
            {note.checklistItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 w-full text-left select-none touch-none ${fontSizeClass}`}
              >
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlersRef.current?.onToggleChecklistItem(note, item.id);
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  title={isCursorHidden ? undefined : item.done ? 'Mark as incomplete' : 'Mark as complete'}
                  className="p-0.5 -m-0.5 hover:opacity-80 transition-opacity shrink-0 cursor-pointer text-gray-700 hover:text-gray-900"
                >
                  {item.done ? (
                    <CheckSquare className="w-4 h-4 text-emerald-800 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-700 shrink-0" />
                  )}
                </button>
                <span
                  onClick={() => {
                    if (!handlersRef.current?.checkIsDragging()) {
                      handlersRef.current?.onToggleChecklistItem(note, item.id);
                    }
                  }}
                  className={`flex-1 select-none touch-none cursor-pointer ${
                    item.done ? 'line-through opacity-50' : 'font-medium'
                  }`}
                >
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p
            className={`whitespace-pre-wrap break-words select-none touch-none ${fontSizeClass}`}
            style={{
              touchAction: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              userSelect: 'none',
            }}
          >
            {note.content}
          </p>
        )}
      </div>

      {/* Note Bottom Actions: 1-Click Color Swatches, Tilt, Edit & Archive/Delete */}
      <div
        data-kiosk-edit-chrome="true"
        className="flex items-center justify-between gap-1 pt-1.5 border-t border-black/10 mt-1.5 opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity pr-3 shrink-0"
      >
        <div className="flex items-center gap-1">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              data-no-drag="true"
              onClick={(e) => {
                e.stopPropagation();
                handlersRef.current?.onUpdateNote(note.id, { bgColor: color });
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ backgroundColor: color }}
              title={isCursorHidden ? undefined : 'Change note color'}
              className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                (note.bgColor || '#fef08a') === color
                  ? 'border-gray-900 scale-125 ring-1 ring-gray-900/50'
                  : 'border-black/25 hover:scale-110'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            data-no-drag="true"
            onClick={(e) => {
              e.stopPropagation();
              handlersRef.current?.onUpdateNotePos(note.id, {
                ...pos,
                rotation: 0,
              });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="px-1 py-0.5 rounded text-[9px] font-mono text-gray-700 hover:bg-black/10 transition-all cursor-pointer"
            title={isCursorHidden ? undefined : 'Straighten note (0°)'}
          >
            0°
          </button>
          {!isCanvasLocked && (
            <button
              type="button"
              data-no-drag="true"
              onClick={(e) => {
                e.stopPropagation();
                handlersRef.current?.onDeleteNote(note.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg text-gray-700 hover:text-red-700 hover:bg-black/10 active:bg-black/20 transition-all cursor-pointer"
              title={isCursorHidden ? undefined : 'Archive note to Trash'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Right Resize Handle for Sticky Note */}
      {!isCanvasLocked && (
        <div
          data-no-drag="true"
          data-no-canvas-swipe="true"
          data-kiosk-edit-chrome="true"
          onPointerDown={(e) => handlersRef.current?.onResizePointerDown(e, note.id, 'note', pos)}
          title={isCursorHidden ? undefined : 'Drag to resize note (from mini post-it to full poster)'}
          className="absolute bottom-1 right-1 p-1.5 cursor-nwse-resize z-20 opacity-50 group-hover:opacity-100 hover:opacity-100 touch-none text-gray-700 hover:text-black transition-opacity"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="fill-current">
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="6" cy="10" r="1.5" />
            <circle cx="10" cy="6" r="1.5" />
            <circle cx="2" cy="10" r="1.5" />
            <circle cx="6" cy="6" r="1.5" />
            <circle cx="10" cy="2" r="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
});

function shouldYieldToEdgeSwipeCardEvent(
  e: React.PointerEvent,
  isSwipeNavigationActive: boolean
): boolean {
  if (!isSwipeNavigationActive) return false;
  if ((e.target as HTMLElement | null)?.closest?.('[data-no-canvas-swipe="true"]')) {
    return false;
  }
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const settings = useDashboardStore.getState().settings;
  return isPointInCanvasEdgeSwipeZone({
    clientX: e.clientX,
    viewportWidth: vw,
    dockPosition: settings.dockPosition,
    isDockHidden: Boolean(settings.isDockHidden),
  });
}

export const Corkboard: React.FC<CorkboardProps> = ({
  notes,
  widgets = [],
  tabs = [],
  activeTabId = 'tab-corkboard',
  dockPaddingClass,
  backgroundTheme = 'midnight_dots',
  customWallpaperUrl,
  backgroundDimLevel = 45,
  hideNotes = false,
  isCreatorOpen = false,
  onOpenCreator,
  onCloseCreator,
  isTrashOpen = false,
  onCloseTrash,
  onUpdateNotePos,
  onUpdateWidgetPos,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onPermanentlyDeleteNote,
  onPermanentlyDeleteNotes,
  onRemoveWidget,
  onAddWidget,
  onOpenAddWidget,
  onUpdateWidget,
  onUpdateTab,
  snapToGrid = false,
  isCanvasLocked = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const defaultWidgetStyle = useDashboardStore((s) => s.settings.defaultWidgetStyle || 'auto');
  const canvasSwipeEnabled = useDashboardStore((s) => s.settings.canvasSwipeEnabled !== false);
  const reduceVisualEffects = useDashboardStore((s) => Boolean(s.settings.reduceVisualEffects));
  const isCursorHidden = useIsCursorHidden();
  const [expandedCompactToolbarId, setExpandedCompactToolbarId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<'note' | 'widget'>('note');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState<{ xRatio: number; yRatio: number } | null>(null);
  const [activeContainerSize, setActiveContainerSize] = useState<{ width: number; height: number } | null>(null);
  const dragPosRef = useRef<{ xRatio: number; yRatio: number } | null>(null);
  const dragStartPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragTargetInitialPosRef = useRef<NonNullable<DashboardWidget['freeformPos']> | null>(null);
  const isDraggingRef = useRef(false);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const pendingHoldRef = useRef<{
    timerId: ReturnType<typeof setTimeout>;
    cleanup: () => void;
  } | null>(null);

  const isSwipeNavigationActive = canvasSwipeEnabled && tabs.length >= 2;

  const clearPendingHold = useCallback(() => {
    if (pendingHoldRef.current) {
      clearTimeout(pendingHoldRef.current.timerId);
      pendingHoldRef.current.cleanup();
      pendingHoldRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearPendingHold();
    };
  }, [clearPendingHold]);

  const notesRef = useRef(notes);
  const widgetsRef = useRef(widgets);
  const actionsRef = useRef({
    onUpdateWidget,
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    onPermanentlyDeleteNote,
    onPermanentlyDeleteNotes,
  });

  useEffect(() => {
    notesRef.current = notes;
    widgetsRef.current = widgets;
  }, [notes, widgets]);

  useEffect(() => {
    actionsRef.current = {
      onUpdateWidget,
      onAddNote,
      onUpdateNote,
      onDeleteNote,
      onPermanentlyDeleteNote,
      onPermanentlyDeleteNotes,
    };
  }, [
    onUpdateWidget,
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    onPermanentlyDeleteNote,
    onPermanentlyDeleteNotes,
  ]);

  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [photoSourcesTarget, setPhotoSourcesTarget] = useState<{
    widget: DashboardWidget;
    isCommon: boolean;
  } | null>(null);
  const photoModalSettings = useDashboardStore((state) => (photoSourcesTarget ? state.settings : null));
  const applyCommonPhotosToAllWidgets = useDashboardStore((state) => state.applyCommonPhotosToAllWidgets);

  // Resizing state
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingType, setResizingType] = useState<'note' | 'widget'>('widget');
  const [resizeRatio, setResizeRatio] = useState<{ wRatio: number; hRatio: number } | null>(null);
  const resizeRatioRef = useRef<{ wRatio: number; hRatio: number } | null>(null);
  const [resizeStart, setResizeStart] = useState<{ startX: number; startY: number; startW: number; startH: number }>({
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  // Grab-and-Rotate state & active gesture refs
  const activeContainerRectRef = useRef<DOMRect | null>(null);
  const gestureRafRef = useRef<number | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatingType, setRotatingType] = useState<'note' | 'widget'>('note');
  const [rotateAngle, setRotateAngle] = useState<number | null>(null);
  const rotateAngleRef = useRef<number | null>(null);
  const [rotateStart, setRotateStart] = useState<{
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  }>({
    centerX: 0,
    centerY: 0,
    startAngle: 0,
    startRotation: 0,
  });

  // Note Creator & Inline Editor Modal State
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [isShoppingList, setIsShoppingList] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [selectedFontSize, setSelectedFontSize] = useState<NonNullable<StickyNoteItem['fontSize']>>('base');
  const [selectedNoteTabId, setSelectedNoteTabId] = useState<string>(activeTabId);
  const [checklistItems, setChecklistItems] = useState<StickyNoteChecklistItem[]>([]);
  const [expiryOption, setExpiryOption] = useState<'permanent' | '1day' | '3days' | 'custom'>('permanent');
  const [customExpiry, setCustomExpiry] = useState('');
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const [pendingNoteSpot, setPendingNoteSpot] = useState<{ xRatio: number; yRatio: number } | null>(null);

  // Z-Order & Canvas Context Menu state
  const [contextMenu, setContextMenu] = useState<CorkboardContextMenuState | null>(null);

  interface CanvasItemRecord {
    id: string;
    type: 'widget' | 'note';
    zIndex: number;
    isBackground: boolean;
    pos: NonNullable<DashboardWidget['freeformPos']>;
    gridPos?: any;
  }

  const getUnifiedCanvasItems = (): CanvasItemRecord[] => {
    const items: CanvasItemRecord[] = [];
    widgets.forEach((w) => {
      const pos = w.freeformPos || {
        xRatio: 0.1,
        yRatio: 0.1,
        wRatio: 0.35,
        hRatio: 0.45,
        zIndex: 1,
        rotation: 0,
      };
      items.push({
        id: w.id,
        type: 'widget',
        zIndex: pos.isBackground ? 0 : (pos.zIndex ?? 1),
        isBackground: Boolean(pos.isBackground),
        pos,
        gridPos: w.gridPos,
      });
    });

    notes.forEach((n) => {
      const pos = n.freeformPos || {
        xRatio: 0.15,
        yRatio: 0.15,
        wRatio: 0.26,
        hRatio: 0.3,
        zIndex: 1,
        rotation: 0,
      };
      items.push({
        id: n.id,
        type: 'note',
        zIndex: pos.isBackground ? 0 : (pos.zIndex ?? 1),
        isBackground: Boolean(pos.isBackground),
        pos,
      });
    });

    return items;
  };

  const getTopZIndex = () => {
    const items = getUnifiedCanvasItems();
    let max = 1;
    for (const item of items) {
      if (!item.isBackground && item.zIndex > max) {
        max = item.zIndex;
      }
    }
    return max;
  };

  const getNextZIndex = () => {
    return getTopZIndex() + 1;
  };

  const handleBringToFront = (id: string, type: 'widget' | 'note') => {
    const allItems = getUnifiedCanvasItems();
    const targetItem = allItems.find((item) => item.id === id && item.type === type);
    if (!targetItem) {
      setContextMenu(null);
      return;
    }

    // Filter all foreground items excluding target
    const foreground = allItems.filter(
      (item) => !item.isBackground && !(item.id === id && item.type === type)
    );

    // Sort ascending by current zIndex
    foreground.sort((a, b) => a.zIndex - b.zIndex);

    // Re-index remaining foreground items sequentially to guarantee no ties or gaps
    foreground.forEach((item, index) => {
      const normalizedZ = index + 1;
      if (item.zIndex !== normalizedZ) {
        if (item.type === 'widget' && onUpdateWidgetPos) {
          onUpdateWidgetPos(item.id, item.gridPos, {
            ...item.pos,
            zIndex: normalizedZ,
            isBackground: false,
          });
        } else if (item.type === 'note' && onUpdateNotePos) {
          onUpdateNotePos(item.id, {
            ...item.pos,
            zIndex: normalizedZ,
            isBackground: false,
          });
        }
      }
    });

    // Place target item strictly at the top layer
    const topZ = foreground.length + 1;
    if (targetItem.type === 'widget' && onUpdateWidgetPos) {
      onUpdateWidgetPos(id, targetItem.gridPos, {
        ...targetItem.pos,
        zIndex: topZ,
        isBackground: false,
      });
    } else if (targetItem.type === 'note' && onUpdateNotePos) {
      onUpdateNotePos(id, {
        ...targetItem.pos,
        zIndex: topZ,
        isBackground: false,
      });
    }

    setContextMenu(null);
  };

  const handleSendToBack = (id: string, type: 'widget' | 'note') => {
    if (type === 'widget' && onUpdateWidgetPos) {
      const w = widgets.find((x) => x.id === id);
      const pos = w?.freeformPos || {
        xRatio: 0.1,
        yRatio: 0.1,
        wRatio: 0.35,
        hRatio: 0.45,
        zIndex: 0,
        rotation: 0,
      };
      onUpdateWidgetPos(id, w?.gridPos, {
        ...pos,
        zIndex: 0,
        isBackground: true,
      });
    } else if (type === 'note' && onUpdateNotePos) {
      const n = notes.find((x) => x.id === id);
      const pos = n?.freeformPos || {
        xRatio: 0.15,
        yRatio: 0.15,
        wRatio: 0.26,
        hRatio: 0.3,
        zIndex: 0,
        rotation: 0,
      };
      onUpdateNotePos(id, {
        ...pos,
        zIndex: 0,
        isBackground: true,
      });
    }
    setContextMenu(null);
  };

  const handleBringForward = (id: string, type: 'widget' | 'note') => {
    const allItems = getUnifiedCanvasItems();
    const target = allItems.find((i) => i.id === id && i.type === type);
    if (!target) {
      setContextMenu(null);
      return;
    }

    if (target.isBackground) {
      handleBringToFront(id, type);
      return;
    }

    const foreground = allItems.filter((i) => !i.isBackground);
    foreground.sort((a, b) => a.zIndex - b.zIndex);

    const idx = foreground.findIndex((i) => i.id === id && i.type === type);
    if (idx !== -1 && idx < foreground.length - 1) {
      const temp = foreground[idx];
      foreground[idx] = foreground[idx + 1];
      foreground[idx + 1] = temp;
    }

    foreground.forEach((item, index) => {
      const newZ = index + 1;
      if (item.zIndex !== newZ) {
        if (item.type === 'widget' && onUpdateWidgetPos) {
          onUpdateWidgetPos(item.id, item.gridPos, { ...item.pos, zIndex: newZ, isBackground: false });
        } else if (item.type === 'note' && onUpdateNotePos) {
          onUpdateNotePos(item.id, { ...item.pos, zIndex: newZ, isBackground: false });
        }
      }
    });

    setContextMenu(null);
  };

  const handleSendBackward = (id: string, type: 'widget' | 'note') => {
    const allItems = getUnifiedCanvasItems();
    const target = allItems.find((i) => i.id === id && i.type === type);
    if (!target) {
      setContextMenu(null);
      return;
    }

    if (target.isBackground) {
      setContextMenu(null);
      return;
    }

    const foreground = allItems.filter((i) => !i.isBackground);
    foreground.sort((a, b) => a.zIndex - b.zIndex);

    const idx = foreground.findIndex((i) => i.id === id && i.type === type);
    if (idx <= 0) {
      handleSendToBack(id, type);
      return;
    }

    const temp = foreground[idx];
    foreground[idx] = foreground[idx - 1];
    foreground[idx - 1] = temp;

    foreground.forEach((item, index) => {
      const newZ = index + 1;
      if (item.zIndex !== newZ) {
        if (item.type === 'widget' && onUpdateWidgetPos) {
          onUpdateWidgetPos(item.id, item.gridPos, { ...item.pos, zIndex: newZ, isBackground: false });
        } else if (item.type === 'note' && onUpdateNotePos) {
          onUpdateNotePos(item.id, { ...item.pos, zIndex: newZ, isBackground: false });
        }
      }
    });

    setContextMenu(null);
  };

  // Close Context Menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', handleClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const isCoveredByWidget = (
    notePos: { xRatio: number; yRatio: number; wRatio: number; hRatio?: number },
    widgetsList: DashboardWidget[]
  ): boolean => {
    const nW = notePos.wRatio || 0.26;
    const nH = notePos.hRatio || 0.3;
    const nArea = nW * nH;
    if (nArea <= 0) return true;

    for (const w of widgetsList) {
      const wp = w.freeformPos;
      if (!wp) continue;
      const wW = wp.wRatio || 0.35;
      const wH = wp.hRatio || 0.45;

      const xOverlap = Math.max(
        0,
        Math.min(notePos.xRatio + nW, wp.xRatio + wW) - Math.max(notePos.xRatio, wp.xRatio)
      );
      const yOverlap = Math.max(
        0,
        Math.min(notePos.yRatio + nH, wp.yRatio + wH) - Math.max(notePos.yRatio, wp.yRatio)
      );
      const overlapArea = xOverlap * yOverlap;

      // If a widget overlaps more than 50% of the note, it is considered covered
      if (overlapArea / nArea > 0.5) {
        return true;
      }
    }
    return false;
  };

  const handlePinNoteToCanvas = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    // Unhide notes on this canvas if currently hidden
    if (hideNotes && onUpdateTab && activeTabId) {
      onUpdateTab(activeTabId, { hideNotes: false });
    }

    const nextZ = getNextZIndex();
    let targetPos = note.freeformPos ? { ...note.freeformPos, zIndex: nextZ } : null;

    if (!targetPos || isCoveredByWidget(targetPos, widgets)) {
      const openSpot = findOpenCanvasSpot(
        [
          ...widgets.map((w) => w.freeformPos || { xRatio: 0.1, yRatio: 0.1, wRatio: 0.35, hRatio: 0.45 }),
          ...notes
            .filter((n) => n.id !== noteId && n.isPinnedToCanvas !== false)
            .map((n) => n.freeformPos || { xRatio: 0.1, yRatio: 0.1, wRatio: 0.26, hRatio: 0.3 }),
        ],
        targetPos?.wRatio || 0.26,
        targetPos?.hRatio || 0.3,
        targetPos?.rotation || 0
      );
      targetPos = {
        ...openSpot,
        zIndex: nextZ,
      };
    }

    onUpdateNote(noteId, {
      isPinnedToCanvas: true,
      freeformPos: targetPos,
    });

    setHighlightedNoteId(noteId);
    setTimeout(() => {
      setHighlightedNoteId(null);
    }, 2500);
  };

  const handleUnpinNoteFromCanvas = useCallback((noteId: string) => {
    actionsRef.current.onUpdateNote(noteId, { isPinnedToCanvas: false });
  }, []);

  const handlePinNoteRef = useRef(handlePinNoteToCanvas);
  useEffect(() => {
    handlePinNoteRef.current = handlePinNoteToCanvas;
  });

  const handleUpdateWidgetConfig = useCallback(
    (widgetId: string, config: Record<string, any>) => {
      actionsRef.current.onUpdateWidget?.(widgetId, { config });
    },
    []
  );

  const handleOpenWidgetSettings = useCallback((target: DashboardWidget) => {
    setEditingWidget(target);
  }, []);

  const stickyActions = useMemo<StickyCanvasActions>(
    () => ({
      onAddNote: (note) => actionsRef.current.onAddNote(note),
      onUpdateNote: (noteId, updates) => actionsRef.current.onUpdateNote(noteId, updates),
      onDeleteNote: (noteId) => actionsRef.current.onDeleteNote(noteId),
      onPermanentlyDeleteNote: (noteId) => actionsRef.current.onPermanentlyDeleteNote?.(noteId),
      onPermanentlyDeleteNotes: (noteIds) => actionsRef.current.onPermanentlyDeleteNotes?.(noteIds),
      onPinNoteToCanvas: (noteId) => handlePinNoteRef.current(noteId),
      onUnpinNoteFromCanvas: (noteId) => handleUnpinNoteFromCanvas(noteId),
    }),
    [handleUnpinNoteFromCanvas]
  );

  const openNoteEditorForExisting = (note: StickyNoteItem) => {
    if (isCanvasLocked) return;
    const isShop = Boolean(note.isShoppingList || note.freeformPos?.isShoppingList);
    setEditingNoteId(note.id);
    setNewTitle(note.title || '');
    setNewContent(note.content || '');
    setIsChecklist(Boolean(note.isChecklist || isShop));
    setIsShoppingList(isShop);
    setChecklistItems(note.checklistItems ? [...note.checklistItems] : []);
    setSelectedColor(note.bgColor || COLOR_PALETTE[0]);
    setSelectedFontSize(note.fontSize || 'base');
    setSelectedNoteTabId(note.tabId || activeTabId);

    if (note.expiresAt) {
      setExpiryOption('custom');
      try {
        const d = new Date(note.expiresAt);
        const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setCustomExpiry(isoLocal);
      } catch {
        setCustomExpiry('');
      }
    } else {
      setExpiryOption('permanent');
      setCustomExpiry('');
    }
    onOpenCreator?.();
  };

  const resetNoteModal = () => {
    setEditingNoteId(null);
    setNewTitle('');
    setNewContent('');
    setIsChecklist(false);
    setIsShoppingList(false);
    setChecklistItems([]);
    setSelectedColor(COLOR_PALETTE[0]);
    setSelectedFontSize('base');
    setSelectedNoteTabId(activeTabId);
    setExpiryOption('permanent');
    setCustomExpiry('');
    setPendingNoteSpot(null);
    onCloseCreator?.();
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => {
    e.stopPropagation();
    clearPendingHold();
    requestCancelActiveCanvasSwipe();
    if (isCanvasLocked) return;
    if (!containerRef.current) return;

    const cardEl = (e.currentTarget as HTMLElement).closest('[data-canvas-card="true"]');
    const containerRect = containerRef.current.getBoundingClientRect();
    activeContainerRectRef.current = containerRect;
    const cardRect = cardEl?.getBoundingClientRect();

    const fallbackWRatio = cardRect ? cardRect.width / containerRect.width : 0.26;
    const fallbackHRatio = cardRect ? cardRect.height / containerRect.height : 0.3;

    dragTargetInitialPosRef.current = pos || null;
    setResizingId(id);
    setResizingType(type);
    const initialW = pos?.wRatio ?? fallbackWRatio;
    const initialH = pos?.hRatio ?? fallbackHRatio;
    setResizeRatio({ wRatio: initialW, hRatio: initialH });
    resizeRatioRef.current = { wRatio: initialW, hRatio: initialH };
    setResizeStart({
      startX: e.clientX,
      startY: e.clientY,
      startW: initialW,
      startH: initialH,
    });

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleRotatePointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => {
    e.stopPropagation();
    clearPendingHold();
    requestCancelActiveCanvasSwipe();
    if (isCanvasLocked) return;
    const cardEl = (e.currentTarget as HTMLElement).closest('[data-canvas-card="true"]');
    if (!cardEl) return;

    const cardRect = cardEl.getBoundingClientRect();
    const centerX = cardRect.left + cardRect.width / 2;
    const centerY = cardRect.top + cardRect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

    dragTargetInitialPosRef.current = pos || null;
    setRotatingId(id);
    setRotatingType(type);
    const initialRot = pos?.rotation || 0;
    setRotateAngle(initialRot);
    rotateAngleRef.current = initialRot;
    setRotateStart({
      centerX,
      centerY,
      startAngle,
      startRotation: initialRot,
    });

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => {
    if (isCanvasLocked) return;
    if (e.button !== 0) return;
    if (
      (e.target as HTMLElement).closest(
        'button, input, textarea, select, a, label, [role="button"], [role="dialog"], [aria-modal="true"], [data-no-drag="true"]'
      )
    )
      return;

    const cardEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;

    const activateCardDrag = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      activeContainerRectRef.current = rect;
      const containerX = clientX - rect.left;
      const containerY = clientY - rect.top;

      const currentX = (pos?.xRatio ?? 0.1) * rect.width;
      const currentY = (pos?.yRatio ?? 0.1) * rect.height;

      requestCancelActiveCanvasSwipe();

      if (!pos?.isBackground && (pos?.zIndex || 1) < getTopZIndex()) {
        handleBringToFront(id, type);
      }

      dragTargetInitialPosRef.current = pos || null;
      dragStartPointerRef.current = { x: clientX, y: clientY };
      isDraggingRef.current = false;
      lastTapRef.current = { id: '', time: 0 };

      setDraggingId(id);
      setDraggingType(type);
      setActiveContainerSize({ width: rect.width, height: rect.height });
      const initialOffset = {
        x: containerX - currentX,
        y: containerY - currentY,
      };
      setDragOffset(initialOffset);
      const initialPos = pos ? { xRatio: pos.xRatio, yRatio: pos.yRatio } : null;
      setDragPos(initialPos);
      dragPosRef.current = initialPos;

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(12);
        }
      } catch {}

      try {
        if (cardEl?.isConnected) {
          cardEl.setPointerCapture(pointerId);
        }
      } catch {}
    };

    if (!isSwipeNavigationActive) {
      activateCardDrag(startX, startY);
      return;
    }

    clearPendingHold();
    let lastX = startX;
    let lastY = startY;

    const detachHoldListeners = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onHoldMove);
        window.removeEventListener('pointerup', onHoldUp);
        window.removeEventListener('pointercancel', onHoldCancel);
      }
    };

    const onHoldMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > CARD_DRAG_HOLD_CANCEL_PX) {
        lastTapRef.current = { id: '', time: 0 };
        clearPendingHold();
      }
    };

    const onHoldUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      clearPendingHold();
      if (moved <= 6 && !pos?.isBackground && (pos?.zIndex || 1) < getTopZIndex()) {
        handleBringToFront(id, type);
      }
    };

    const onHoldCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      clearPendingHold();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', onHoldMove, { passive: true });
      window.addEventListener('pointerup', onHoldUp, { passive: true });
      window.addEventListener('pointercancel', onHoldCancel, { passive: true });
    }

    const timerId = setTimeout(() => {
      if (pendingHoldRef.current?.timerId !== timerId) return;
      pendingHoldRef.current.cleanup();
      pendingHoldRef.current = null;
      activateCardDrag(lastX, lastY);
    }, CARD_DRAG_HOLD_MS);

    pendingHoldRef.current = { timerId, cleanup: detachHoldListeners };
  };

  const scheduleGestureRender = () => {
    if (gestureRafRef.current !== null || typeof window === 'undefined') return;
    gestureRafRef.current = window.requestAnimationFrame(() => {
      gestureRafRef.current = null;
      if (rotateAngleRef.current !== null) {
        setRotateAngle(rotateAngleRef.current);
      } else if (resizeRatioRef.current) {
        setResizeRatio(resizeRatioRef.current);
      } else if (dragPosRef.current) {
        setDragPos(dragPosRef.current);
      }
    });
  };

  const handlePointerMove = (e: React.PointerEvent | PointerEvent) => {
    if (!rotatingId && !resizingId && !draggingId) return;
    const rect = activeContainerRectRef.current ?? containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // 1. Grab-and-Rotate in progress
    if (rotatingId) {
      if (e.cancelable) e.preventDefault();
      const currentAngle =
        Math.atan2(e.clientY - rotateStart.centerY, e.clientX - rotateStart.centerX) *
        (180 / Math.PI);
      let deltaAngle = currentAngle - rotateStart.startAngle;
      if (deltaAngle > 180) deltaAngle -= 360;
      if (deltaAngle < -180) deltaAngle += 360;

      let nextRotation = Math.round(rotateStart.startRotation + deltaAngle);
      if (Math.abs(nextRotation) <= 2.5) {
        nextRotation = 0;
      }
      nextRotation = Math.max(-60, Math.min(60, nextRotation));

      rotateAngleRef.current = nextRotation;
      scheduleGestureRender();
      return;
    }

    // 2. Resizing in progress
    if (resizingId) {
      if (e.cancelable) e.preventDefault();
      const deltaX = e.clientX - resizeStart.startX;
      const deltaY = e.clientY - resizeStart.startY;
      const deltaWRatio = deltaX / rect.width;
      const deltaHRatio = deltaY / rect.height;

      const minW = resizingType === 'widget' ? 0.14 : 0.08;
      const minH = resizingType === 'widget' ? 0.14 : 0.08;
      const initialPos = dragTargetInitialPosRef.current;
      const maxW = 1.0 - (initialPos?.xRatio ?? 0.1);
      const maxH = 1.0 - (initialPos?.yRatio ?? 0.1);

      let newW = Math.max(minW, Math.min(maxW, resizeStart.startW + deltaWRatio));
      let newH = Math.max(minH, Math.min(maxH, resizeStart.startH + deltaHRatio));

      if (snapToGrid) {
        newW = Math.max(minW, Math.min(maxW, Math.round(newW / SNAP_STEP_X) * SNAP_STEP_X));
        newH = Math.max(minH, Math.min(maxH, Math.round(newH / SNAP_STEP_Y) * SNAP_STEP_Y));
      }

      resizeRatioRef.current = { wRatio: newW, hRatio: newH };
      scheduleGestureRender();
      return;
    }

    // 3. Dragging in progress
    if (draggingId) {
      if (e.cancelable) e.preventDefault();
      const dist = Math.hypot(
        e.clientX - dragStartPointerRef.current.x,
        e.clientY - dragStartPointerRef.current.y
      );
      if (dist > 3) {
        isDraggingRef.current = true;
      }

      const containerX = e.clientX - rect.left;
      const containerY = e.clientY - rect.top;

      const newX = Math.max(0, Math.min(rect.width - 60, containerX - dragOffset.x));
      const newY = Math.max(0, Math.min(rect.height - 60, containerY - dragOffset.y));

      let nextXRatio = newX / rect.width;
      let nextYRatio = newY / rect.height;

      if (snapToGrid) {
        nextXRatio = Math.round(nextXRatio / SNAP_STEP_X) * SNAP_STEP_X;
        nextYRatio = Math.round(nextYRatio / SNAP_STEP_Y) * SNAP_STEP_Y;
        nextXRatio = Math.max(0, Math.min(1.0 - SNAP_STEP_X, nextXRatio));
        nextYRatio = Math.max(0, Math.min(1.0 - SNAP_STEP_Y, nextYRatio));
      }

      dragPosRef.current = { xRatio: nextXRatio, yRatio: nextYRatio };
      scheduleGestureRender();
      return;
    }
  };

  const handlePointerUp = (e?: React.PointerEvent | PointerEvent) => {
    if (gestureRafRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(gestureRafRef.current);
      gestureRafRef.current = null;
    }
    activeContainerRectRef.current = null;

    if (e && 'currentTarget' in e && (e as any).currentTarget && (e as any).pointerId !== undefined) {
      try {
        ((e as any).currentTarget as HTMLElement).releasePointerCapture((e as any).pointerId);
      } catch {}
    }

    // 1. Commit drag
    if (draggingId) {
      const finalPos = dragPosRef.current;
      const initialPos = dragTargetInitialPosRef.current;

      if (isDraggingRef.current && finalPos && initialPos) {
        let targetX = finalPos.xRatio;
        let targetY = finalPos.yRatio;
        if (snapToGrid) {
          targetX = Math.max(0, Math.min(1.0 - SNAP_STEP_X, Math.round(targetX / SNAP_STEP_X) * SNAP_STEP_X));
          targetY = Math.max(0, Math.min(1.0 - SNAP_STEP_Y, Math.round(targetY / SNAP_STEP_Y) * SNAP_STEP_Y));
        }
        if (draggingType === 'note') {
          const note = notes.find((n) => n.id === draggingId);
          const currentZ = note?.freeformPos?.zIndex ?? initialPos.zIndex;
          onUpdateNotePos(draggingId, {
            ...initialPos,
            xRatio: targetX,
            yRatio: targetY,
            zIndex: currentZ,
          });
        } else if (draggingType === 'widget' && onUpdateWidgetPos) {
          const widget = widgetsRef.current.find((w) => w.id === draggingId);
          if (widget) {
            const currentZ = widget.freeformPos?.zIndex ?? initialPos.zIndex;
            onUpdateWidgetPos(draggingId, widget.gridPos, {
              ...initialPos,
              xRatio: targetX,
              yRatio: targetY,
              zIndex: currentZ,
            });
          }
        }
      }

      setDraggingId(null);
      setDragPos(null);
      setActiveContainerSize(null);
      dragPosRef.current = null;
      dragTargetInitialPosRef.current = null;
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 100);
    }

    // 2. Commit rotate
    if (rotatingId) {
      if (rotateAngleRef.current !== null) {
        const nextRotation = rotateAngleRef.current;
        if (rotatingType === 'note') {
          const note = notesRef.current.find((n) => n.id === rotatingId);
          if (note && note.freeformPos) {
            onUpdateNotePos(rotatingId, { ...note.freeformPos, rotation: nextRotation });
          }
        } else if (rotatingType === 'widget' && onUpdateWidgetPos) {
          const widget = widgetsRef.current.find((w) => w.id === rotatingId);
          if (widget && widget.freeformPos) {
            onUpdateWidgetPos(rotatingId, widget.gridPos, { ...widget.freeformPos, rotation: nextRotation });
          }
        }
      }
      setRotatingId(null);
      setRotateAngle(null);
      rotateAngleRef.current = null;
    }

    // 3. Commit resize
    if (resizingId) {
      if (resizeRatioRef.current !== null) {
        let { wRatio, hRatio } = resizeRatioRef.current;
        if (snapToGrid) {
          const minW = resizingType === 'widget' ? 0.14 : 0.08;
          const minH = resizingType === 'widget' ? 0.14 : 0.08;
          wRatio = Math.max(minW, Math.round(wRatio / SNAP_STEP_X) * SNAP_STEP_X);
          hRatio = Math.max(minH, Math.round(hRatio / SNAP_STEP_Y) * SNAP_STEP_Y);
        }
        if (resizingType === 'note') {
          const note = notesRef.current.find((n) => n.id === resizingId);
          if (note && note.freeformPos) {
            onUpdateNotePos(resizingId, { ...note.freeformPos, wRatio, hRatio });
          }
        } else if (resizingType === 'widget' && onUpdateWidgetPos) {
          const widget = widgetsRef.current.find((w) => w.id === resizingId);
          if (widget && widget.freeformPos) {
            onUpdateWidgetPos(resizingId, widget.gridPos, { ...widget.freeformPos, wRatio, hRatio });
          }
        }
      }
      setResizingId(null);
      setResizeRatio(null);
      resizeRatioRef.current = null;
    }
  };

  const handlePointerMoveRef = useRef(handlePointerMove);
  const handlePointerUpRef = useRef(handlePointerUp);

  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove;
    handlePointerUpRef.current = handlePointerUp;
  });

  // Window-level Pointer Event Listeners (ensures gestures are never lost on mobile)
  useEffect(() => {
    if (!draggingId && !rotatingId && !resizingId) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      handlePointerMoveRef.current(e);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      handlePointerUpRef.current(e);
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      if (gestureRafRef.current !== null) {
        cancelAnimationFrame(gestureRafRef.current);
        gestureRafRef.current = null;
      }
      activeContainerRectRef.current = null;
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [draggingId, rotatingId, resizingId]);

  useEffect(() => {
    return subscribeCancelActiveCardDrag(() => {
      if (gestureRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(gestureRafRef.current);
        gestureRafRef.current = null;
      }
      activeContainerRectRef.current = null;
      dragPosRef.current = null;
      dragTargetInitialPosRef.current = null;
      lastTapRef.current = { id: '', time: 0 };
      isDraggingRef.current = true;
      setDraggingId(null);
      setDragPos(null);
      setActiveContainerSize(null);
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 100);
    });
  }, []);

  const handleSaveNoteModal = () => {
    if (!newTitle.trim() && !newContent.trim() && checklistItems.length === 0 && !isShoppingList) return;

    let expiresAt: string | null = null;
    if (expiryOption === '1day') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === '3days') {
      expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === 'custom' && customExpiry) {
      expiresAt = new Date(customExpiry).toISOString();
    }

    const effectiveChecklist = Boolean(isChecklist || isShoppingList);
    const resolvedTitle =
      newTitle.trim() || (isShoppingList ? '🛒 Shopping List' : undefined);

    if (editingNoteId) {
      onUpdateNote(editingNoteId, {
        tabId: selectedNoteTabId || activeTabId,
        title: resolvedTitle,
        content: newContent,
        isChecklist: effectiveChecklist,
        isShoppingList,
        checklistItems: effectiveChecklist ? checklistItems : undefined,
        bgColor: selectedColor,
        fontSize: selectedFontSize,
        expiresAt,
      });
    } else {
      onAddNote({
        tabId: selectedNoteTabId || activeTabId,
        title: resolvedTitle,
        content: newContent,
        isChecklist: effectiveChecklist,
        isShoppingList,
        checklistItems: effectiveChecklist ? checklistItems : [],
        bgColor: selectedColor,
        fontSize: selectedFontSize,
        expiresAt,
        ...(pendingNoteSpot
          ? {
              freeformPos: {
                xRatio: pendingNoteSpot.xRatio,
                yRatio: pendingNoteSpot.yRatio,
                wRatio: 0.24,
                hRatio: 0.28,
                zIndex: getNextZIndex(),
                rotation: -1,
              },
            }
          : {}),
      });
    }

    resetNoteModal();
  };

  const toggleChecklistItem = (note: StickyNoteItem, itemId: string) => {
    if (!note.checklistItems) return;
    const updated = note.checklistItems.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onUpdateNote(note.id, { checklistItems: updated });
  };

  const computeShiftedExpiry = (
    originalExpiresAt: string | null | undefined,
    daysOffset: number
  ): string | null | undefined => {
    if (!originalExpiresAt) return originalExpiresAt;
    if (daysOffset === 0) return originalExpiresAt;
    try {
      const d = new Date(originalExpiresAt);
      if (Number.isNaN(d.getTime())) return originalExpiresAt;
      const nowMs = Date.now();
      // If original date is already in the past, base the shift off today at the same local time of day
      if (d.getTime() < nowMs) {
        const todayBase = new Date();
        todayBase.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
        todayBase.setDate(todayBase.getDate() + daysOffset);
        return todayBase.toISOString();
      }
      d.setDate(d.getDate() + daysOffset);
      return d.toISOString();
    } catch {
      return originalExpiresAt;
    }
  };

  const handleDuplicateNote = (
    noteId: string,
    mode: 'plus1d' | 'plus3d' | 'plus1w' | 'same' | 'edit' = 'plus1d'
  ) => {
    const original = notes.find((n) => n.id === noteId);
    if (!original) return;

    const clonedChecklist = original.checklistItems
      ? original.checklistItems.map((item) => ({
          ...item,
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          done: false, // Reset checked items on duplicate
        }))
      : undefined;

    const clonedContent =
      original.isChecklist && original.content
        ? original.content.replace(/\[x\]/gi, '[ ]')
        : original.content || '';

    if (mode === 'edit') {
      if (isCanvasLocked) return;
      setEditingNoteId(null); // New note (duplicate)
      setNewTitle(original.title ? `${original.title} (Copy)` : '');
      setNewContent(clonedContent);
      setIsChecklist(Boolean(original.isChecklist));
      setIsShoppingList(Boolean(original.isShoppingList));
      setChecklistItems(clonedChecklist ? [...clonedChecklist] : []);
      setSelectedColor(original.bgColor || COLOR_PALETTE[0]);
      setSelectedFontSize(original.fontSize || 'base');
      setSelectedNoteTabId(original.tabId || activeTabId);

      const shiftedIso = computeShiftedExpiry(original.expiresAt, 1);
      if (shiftedIso) {
        setExpiryOption('custom');
        try {
          const d = new Date(shiftedIso);
          const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
          setCustomExpiry(isoLocal);
        } catch {
          setCustomExpiry('');
        }
      } else {
        setExpiryOption('permanent');
        setCustomExpiry('');
      }
      onOpenCreator?.();
      return;
    }

    const daysOffset =
      mode === 'same' ? 0 : mode === 'plus3d' ? 3 : mode === 'plus1w' ? 7 : 1;
    const nextExpiresAt = computeShiftedExpiry(original.expiresAt, daysOffset);

    const originalPos = original.freeformPos || {
      xRatio: 0.1,
      yRatio: 0.1,
      wRatio: 0.26,
      hRatio: 0.3,
      zIndex: 1,
      rotation: 0,
    };

    const offsetPos = {
      ...originalPos,
      xRatio: Math.min(originalPos.xRatio + 0.03, 0.72),
      yRatio: Math.min(originalPos.yRatio + 0.03, 0.72),
      zIndex: getTopZIndex() + 1,
    };

    onAddNote({
      tabId: original.tabId || activeTabId,
      title: original.title ? `${original.title} (Copy)` : undefined,
      content: clonedContent,
      isChecklist: original.isChecklist,
      isShoppingList: original.isShoppingList,
      checklistItems: clonedChecklist,
      bgColor: original.bgColor,
      fontSize: original.fontSize,
      expiresAt: nextExpiresAt,
      freeformPos: offsetPos,
      isPinnedToCanvas: true,
    });
  };

  const hasStickyNotesTile = useMemo(
    () => widgets.some((w) => w.type === 'sticky_notes' && !w.deleted_at),
    [widgets]
  );

  const minuteClock = useSharedClock('minute');
  const nowMs = minuteClock.getTime();

  const activeNotes = useMemo(
    () =>
      notes.filter((n) => {
        if (n.archivedAt) return false;
        if (n.expiresAt && new Date(n.expiresAt).getTime() <= nowMs) return false;
        if (n.isPinnedToCanvas === false) return false;
        // If the canvas has hideNotes active, only hide notes that have not been explicitly pinned to canvas
        if (hideNotes && n.isPinnedToCanvas !== true) return false;
        return true;
      }),
    [notes, nowMs, hideNotes]
  );

  const trashNotes = useMemo(
    () =>
      notes.filter((n) => {
        if (n.archivedAt) return true;
        if (n.expiresAt && new Date(n.expiresAt).getTime() <= nowMs) return true;
        return false;
      }),
    [notes, nowMs]
  );

  const topZIndex = useMemo(() => {
    let max = 1;
    for (const w of widgets) {
      const p = w.freeformPos;
      if (!p?.isBackground && (p?.zIndex ?? 1) > max) max = p?.zIndex ?? 1;
    }
    for (const n of notes) {
      const p = n.freeformPos;
      if (!p?.isBackground && (p?.zIndex ?? 1) > max) max = p?.zIndex ?? 1;
    }
    return max;
  }, [widgets, notes]);

  const cardHandlersRef = useRef<CanvasCardEventHandlers | null>(null);
  useEffect(() => {
    cardHandlersRef.current = {
      onPointerDown: handlePointerDown,
      onBringToFront: handleBringToFront,
      onRotatePointerDown: handleRotatePointerDown,
      onResizePointerDown: handleResizePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onUpdateWidgetPos,
      onUpdateWidget,
      onRemoveWidget,
      onUpdateNotePos,
      onUpdateNote,
      onDeleteNote,
      onOpenNoteEditor: openNoteEditorForExisting,
      onToggleChecklistItem: toggleChecklistItem,
      checkIsDragging: () => isDraggingRef.current,
    };
  });

  const activeThemeObj =
    CANVAS_THEMES.find((t) => t.id === backgroundTheme) || CANVAS_THEMES[0];
  const isCanvasLight = isCanvasThemeLight(backgroundTheme);

  const dimAlpha = Math.max(0, Math.min(0.92, (backgroundDimLevel ?? 45) / 100));
  const safeCustomWallpaperCss =
    backgroundTheme === 'custom' ? safeCssBackgroundUrl(customWallpaperUrl) : null;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => {
        if (isCanvasLocked) return;
        const target = e.target as HTMLElement;
        if (
          target.closest('[data-canvas-card="true"]') ||
          target.closest('[role="dialog"]') ||
          target.closest('[data-no-drag="true"]')
        ) {
          return;
        }
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        const clickXRatio = rect
          ? Math.max(0.02, Math.min(0.74, (e.clientX - rect.left) / rect.width))
          : 0.15;
        const clickYRatio = rect
          ? Math.max(0.04, Math.min(0.7, (e.clientY - rect.top) / rect.height))
          : 0.15;
        const activeTabName = tabs.find((t) => t.id === activeTabId)?.name || 'Canvas';
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          id: 'canvas',
          type: 'canvas',
          title: activeTabName,
          currentZ: 0,
          clickXRatio,
          clickYRatio,
        });
      }}
      style={{
        touchAction: 'none',
        WebkitTouchCallout: 'none',
        ...(safeCustomWallpaperCss ? { backgroundImage: safeCustomWallpaperCss } : {}),
      }}
      className={`relative w-full h-screen overflow-hidden select-none touch-none ${activeThemeObj.canvasClass} ${dockPaddingClass}`}
    >
      {/* Dynamic Dim Overlay for Custom Picture Backgrounds */}
      {safeCustomWallpaperCss && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-200"
          style={{
            backgroundColor: `rgba(9, 13, 22, ${dimAlpha})`,
          }}
        />
      )}

      {/* Snap-to-Grid Ambient Alignment Guide */}
      {snapToGrid && (Boolean(draggingId) || Boolean(resizingId)) && (
        <div
          className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-200"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(59, 130, 246, 0.14) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(59, 130, 246, 0.14) 1px, transparent 1px)
            `,
            backgroundSize: `${(100 / SNAP_COLUMNS).toFixed(4)}% ${(100 / SNAP_ROWS).toFixed(4)}%`,
          }}
        >
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-blue-600/85 backdrop-blur text-white text-[10px] font-semibold tracking-wider uppercase shadow-lg flex items-center gap-1.5 border border-blue-400/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
            Snap to Grid (24×16)
          </div>
        </div>
      )}

      {/* Empty Canvas Onboarding Prompt (when a new canvas has 0 tiles and 0 notes) */}
      {widgets.length === 0 && activeNotes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-6">
          <div className="pointer-events-auto max-w-md w-full rounded-2xl bg-gray-900/85 backdrop-blur-md border border-gray-800 p-6 text-center shadow-2xl space-y-4">
            <p className="text-sm font-bold text-white">This Canvas is Empty</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Add individual widget tiles, pin a sticky note, or launch a starter blueprint tailored to this screen.
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              {isCanvasLocked ? (
                <div className="flex items-center justify-center gap-1.5 text-xs text-amber-400 font-medium py-1.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Canvas layout is locked</span>
                </div>
              ) : (
                <>
                  {onOpenAddWidget && (
                    <button
                      onClick={onOpenAddWidget}
                      className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white border border-gray-700 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-400" />
                      <span>Add Tile</span>
                    </button>
                  )}
                  {onOpenCreator && (
                    <button
                      onClick={() => {
                        setSelectedNoteTabId(activeTabId);
                        onOpenCreator();
                      }}
                      className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
                    >
                      <Pin className="w-3.5 h-3.5" />
                      <span>Pin Note</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {!isCanvasLocked && (
              <React.Suspense fallback={null}>
                <CanvasBlueprintPicker activeTabId={activeTabId} variant="desktop" />
              </React.Suspense>
            )}
          </div>
        </div>
      )}

      {/* Render Freeform Widgets on Corkboard (O(1) per-card memoization + GPU translate3d drag) */}
      {widgets.map((widget) => {
        const widgetThemeMode = (widget.config?.themeMode as WidgetThemeMode) || 'auto';
        const isWidgetLight = widgetThemeMode === 'light' || (widgetThemeMode === 'auto' && isCanvasLight);
        const isDragging = draggingId === widget.id;
        const isRotating = rotatingId === widget.id;
        const isResizing = resizingId === widget.id;

        return (
          <MemoizedCanvasWidgetCard
            key={widget.id}
            widget={widget}
            isWidgetLight={isWidgetLight}
            isCanvasLocked={isCanvasLocked}
            isCursorHidden={isCursorHidden}
            isSwipeNavigationActive={isSwipeNavigationActive}
            defaultWidgetStyle={defaultWidgetStyle}
            reduceVisualEffects={reduceVisualEffects}
            dockPaddingClass={dockPaddingClass}
            topZIndex={topZIndex}
            canUpdateWidget={Boolean(onUpdateWidget)}
            hasUpdateWidgetPos={Boolean(onUpdateWidgetPos)}
            hasRemoveWidget={Boolean(onRemoveWidget)}
            isDragging={isDragging}
            activeDragPos={isDragging ? dragPos : null}
            activeContainerSize={isDragging ? activeContainerSize : null}
            isResizing={isResizing}
            activeResizeRatio={isResizing ? resizeRatio : null}
            isRotating={isRotating}
            activeRotateAngle={isRotating ? rotateAngle : null}
            isCompactExpanded={expandedCompactToolbarId === widget.id}
            stickyNotes={widget.type === 'sticky_notes' ? notes : undefined}
            stickyActions={widget.type === 'sticky_notes' ? stickyActions : undefined}
            onUpdateWidgetConfig={handleUpdateWidgetConfig}
            onOpenWidgetSettings={handleOpenWidgetSettings}
            onSetExpandedCompactToolbarId={setExpandedCompactToolbarId}
            onSetContextMenu={setContextMenu}
            handlersRef={cardHandlersRef}
          />
        );
      })}

      {/* Render All Freeform Notes (O(1) per-card memoization + GPU translate3d drag) */}
      {activeNotes.map((note) => {
        const isDragging = draggingId === note.id;
        const isRotating = rotatingId === note.id;
        const isResizing = resizingId === note.id;

        return (
          <MemoizedCanvasStickyNoteCard
            key={note.id}
            note={note}
            nowMs={nowMs}
            isCanvasLocked={isCanvasLocked}
            isCursorHidden={isCursorHidden}
            isSwipeNavigationActive={isSwipeNavigationActive}
            isHighlighted={highlightedNoteId === note.id}
            hasStickyNotesTile={hasStickyNotesTile}
            topZIndex={topZIndex}
            isDragging={isDragging}
            activeDragPos={isDragging ? dragPos : null}
            activeContainerSize={isDragging ? activeContainerSize : null}
            isResizing={isResizing}
            activeResizeRatio={isResizing ? resizeRatio : null}
            isRotating={isRotating}
            activeRotateAngle={isRotating ? rotateAngle : null}
            lastTapRef={lastTapRef}
            onSetContextMenu={setContextMenu}
            handlersRef={cardHandlersRef}
          />
        );
      })}

      {/* Creator & Inline Editor Modal for Sticky Notes */}
      {isCreatorOpen && (
        <React.Suspense fallback={null}>
          <CorkboardNoteModal
            editingNoteId={editingNoteId}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newContent={newContent}
            setNewContent={setNewContent}
            isChecklist={isChecklist}
            setIsChecklist={setIsChecklist}
            isShoppingList={isShoppingList}
            setIsShoppingList={setIsShoppingList}
            selectedColor={selectedColor}
            setSelectedColor={setSelectedColor}
            selectedFontSize={selectedFontSize}
            setSelectedFontSize={setSelectedFontSize}
            selectedNoteTabId={selectedNoteTabId}
            setSelectedNoteTabId={setSelectedNoteTabId}
            checklistItems={checklistItems}
            setChecklistItems={setChecklistItems}
            expiryOption={expiryOption}
            setExpiryOption={setExpiryOption}
            customExpiry={customExpiry}
            setCustomExpiry={setCustomExpiry}
            colorPalette={COLOR_PALETTE}
            tabs={tabs}
            onClose={resetNoteModal}
            onSave={handleSaveNoteModal}
          />
        </React.Suspense>
      )}

      {/* Trash / Archive Recovery Drawer Modal */}
      {isTrashOpen && (
        <React.Suspense fallback={null}>
          <CorkboardTrashModal
            trashNotes={trashNotes}
            onClose={() => onCloseTrash?.()}
            onUpdateNote={onUpdateNote}
            onPermanentlyDeleteNote={onPermanentlyDeleteNote}
            onPermanentlyDeleteNotes={onPermanentlyDeleteNotes}
          />
        </React.Suspense>
      )}

      {/* Tile Settings & Configuration Modal */}
      {editingWidget && (
        <React.Suspense fallback={null}>
          <WidgetSettingsModal
            isOpen={editingWidget !== null}
            onClose={() => setEditingWidget(null)}
            widget={editingWidget}
            onSave={(widgetId, updates) => {
              if (onUpdateWidget) {
                onUpdateWidget(widgetId, updates);
              }
            }}
            onOpenPhotoSources={(asCommonSource) => {
              if (editingWidget) {
                const latestWidget =
                  useDashboardStore.getState().widgets.find((w) => w.id === editingWidget.id) ||
                  editingWidget;
                setPhotoSourcesTarget({
                  widget: latestWidget,
                  isCommon:
                    asCommonSource !== undefined
                      ? asCommonSource
                      : latestWidget.config?.useCommonSource !== false,
                });
              }
            }}
          />
        </React.Suspense>
      )}

      {/* Per-Widget Photo Sources Hub opened from Tile Settings */}
      {photoSourcesTarget && (() => {
        const activePhotoWidget =
          widgets.find((w) => w.id === photoSourcesTarget.widget.id) || photoSourcesTarget.widget;
        const isUsingCommon = photoSourcesTarget.isCommon;
        const modalSettings = photoModalSettings || useDashboardStore.getState().settings;

        return (
          <React.Suspense fallback={null}>
            <PhotoSourcesModal
              isOpen={true}
              onClose={() => setPhotoSourcesTarget(null)}
              targetWidgetId={activePhotoWidget.id}
              isCommonSource={isUsingCommon}
              initialWebUrls={
                (isUsingCommon
                  ? (modalSettings.commonPhotoSourceType === 'web' ? modalSettings.commonPhotoSourceUrl : '')
                  : (activePhotoWidget.config?.sourceType === 'web' ? activePhotoWidget.config?.sourceUrl : '')) || ''
              }
              currentSourceLabel={
                isUsingCommon
                  ? modalSettings.commonPhotoSourceLabel ||
                    (modalSettings.commonPhotos?.length ? 'Shared Library' : undefined)
                  : activePhotoWidget.config?.sourceLabel
              }
              currentSourceType={
                isUsingCommon
                  ? modalSettings.commonPhotoSourceType
                  : activePhotoWidget.config?.sourceType
              }
              currentCuratedCategoryId={
                isUsingCommon
                  ? modalSettings.commonPhotoCuratedCategory
                  : activePhotoWidget.config?.curatedCategoryId
              }
              currentPhotoCount={
                isUsingCommon
                  ? modalSettings.commonPhotos?.length
                  : activePhotoWidget.config?.customPhotos?.length
              }
              onPhotosLoaded={(newPhotos, sourceName, sourceUrl, sourceType, applyToAll, plexSyncConfig, curatedCategoryId) => {
                if (applyToAll) {
                  applyCommonPhotosToAllWidgets(
                    newPhotos,
                    sourceName,
                    sourceUrl,
                    sourceType,
                    plexSyncConfig,
                    curatedCategoryId,
                    activePhotoWidget.id
                  );
                } else if (onUpdateWidget && newPhotos.length > 0) {
                  const latestPhotoWidget =
                    useDashboardStore.getState().widgets.find((w) => w.id === activePhotoWidget.id) ||
                    activePhotoWidget;
                  onUpdateWidget(latestPhotoWidget.id, {
                    config: {
                      ...latestPhotoWidget.config,
                      useCommonSource: false,
                      customPhotos: newPhotos,
                      sourceLabel: sourceName,
                      sourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
                      sourceType: sourceType || latestPhotoWidget.config?.sourceType,
                      curatedCategoryId:
                        sourceType === 'curated'
                          ? (curatedCategoryId || inferCuratedCategoryId(undefined, sourceName) || 'all')
                          : undefined,
                      plexSyncConfig: sourceType === 'plex' ? plexSyncConfig : undefined,
                    },
                  });
                }
              }}
            />
          </React.Suspense>
        );
      })()}

      {/* Floating Context Menu for Canvas Actions, Z-Order & Layer Management */}
      {contextMenu && (
        <React.Suspense fallback={null}>
          <CorkboardContextMenu
            key={`${contextMenu.type}-${contextMenu.id}`}
            contextMenu={contextMenu}
            tabs={tabs}
            widgets={widgets}
            notes={notes}
            hasStickyNotesTile={hasStickyNotesTile}
            defaultWidgetStyle={defaultWidgetStyle}
            onClose={() => setContextMenu(null)}
            onOpenNoteAtSpot={
              onOpenCreator
                ? (clickXRatio, clickYRatio, shopping) => {
                    resetNoteModal();
                    if (clickXRatio !== undefined && clickYRatio !== undefined) {
                      setPendingNoteSpot({ xRatio: clickXRatio, yRatio: clickYRatio });
                    }
                    setSelectedNoteTabId(activeTabId);
                    if (shopping) {
                      setIsChecklist(true);
                      setIsShoppingList(true);
                      setNewTitle('🛒 Shopping List');
                      setSelectedColor('#bbf7d0');
                    }
                    onOpenCreator();
                  }
                : undefined
            }
            onAddWidget={onAddWidget}
            onOpenAddWidget={onOpenAddWidget}
            onUpdateWidget={onUpdateWidget}
            onUpdateWidgetPos={onUpdateWidgetPos}
            onMoveWidgetToTab={(widgetId, targetTabId) => {
              void useDashboardStore.getState().moveWidgetToTab(widgetId, targetTabId);
            }}
            onMoveWidgetToNewTab={(widgetId, canvasName) => {
              void useDashboardStore.getState().moveWidgetToNewTab(widgetId, canvasName);
            }}
            onUpdateNote={onUpdateNote}
            onUpdateNotePos={onUpdateNotePos}
            onRemoveWidget={onRemoveWidget}
            onDeleteNote={onDeleteNote}
            onEditWidget={(w) => setEditingWidget(w)}
            onEditNote={openNoteEditorForExisting}
            onDuplicateNote={handleDuplicateNote}
            onBringToFront={handleBringToFront}
            onBringForward={handleBringForward}
            onSendBackward={handleSendBackward}
            onSendToBack={handleSendToBack}
            getNextZIndex={getNextZIndex}
            onUpdateRotation={(deg) =>
              setContextMenu((prev) => (prev ? { ...prev, rotation: deg } : null))
            }
          />
        </React.Suspense>
      )}
    </div>
  );
};
