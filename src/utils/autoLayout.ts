import type {
  AutoOrganizeMode,
  DashboardWidget,
  FreeformPosition,
  StickyNoteItem,
} from '../types/dashboard';

export interface OrganizedLayoutResult {
  widgetPositions: Record<string, FreeformPosition>;
  notePositions: Record<string, FreeformPosition>;
}

interface LayoutBox {
  id: string;
  kind: 'widget' | 'note';
  priority: number;
  wRatio: number;
  hRatio: number;
  xRatio: number;
  yRatio: number;
}

const WIDGET_PRIORITY: Record<string, number> = {
  calendar: 1,
  photo_frame: 2,
  embed: 3,
  clock_weather: 4,
  sticky_notes: 5,
  weather: 6,
  clock: 7,
  world_clock: 7,
  rss: 8,
  countdown: 9,
  quotes: 10,
  image: 6,
  textbox: 11,
};

/**
 * Tile a list of items into a given rectangular zone [zoneX, zoneY, zoneW, zoneH]
 * using a clean zero-overlap Bento Grid.
 */
function tileBentoInZone(
  items: LayoutBox[],
  zoneX: number,
  zoneY: number,
  zoneW: number,
  zoneH: number,
  gap: number
): Map<string, FreeformPosition> {
  const result = new Map<string, FreeformPosition>();
  const n = items.length;
  if (n === 0) return result;

  if (n === 1) {
    result.set(items[0].id, {
      xRatio: Number(zoneX.toFixed(4)),
      yRatio: Number(zoneY.toFixed(4)),
      wRatio: Number(zoneW.toFixed(4)),
      hRatio: Number(zoneH.toFixed(4)),
      zIndex: 10,
      rotation: 0,
      isFullScreen: false,
    });
    return result;
  }

  if (n === 2 && zoneW >= zoneH * 0.85) {
    // Side-by-side 50/50 split
    const colW = (zoneW - gap) / 2;
    items.forEach((item, idx) => {
      result.set(item.id, {
        xRatio: Number((zoneX + idx * (colW + gap)).toFixed(4)),
        yRatio: Number(zoneY.toFixed(4)),
        wRatio: Number(colW.toFixed(4)),
        hRatio: Number(zoneH.toFixed(4)),
        zIndex: 10 + idx,
        rotation: 0,
        isFullScreen: false,
      });
    });
    return result;
  }

  if (n === 3 && zoneW >= 0.55) {
    // 1 Hero on Left (52% width) + 2 Stacked on Right (48% width)
    const leftW = zoneW * 0.52 - gap / 2;
    const rightW = zoneW - leftW - gap;
    const rightH = (zoneH - gap) / 2;

    result.set(items[0].id, {
      xRatio: Number(zoneX.toFixed(4)),
      yRatio: Number(zoneY.toFixed(4)),
      wRatio: Number(leftW.toFixed(4)),
      hRatio: Number(zoneH.toFixed(4)),
      zIndex: 10,
      rotation: 0,
      isFullScreen: false,
    });

    [items[1], items[2]].forEach((item, idx) => {
      result.set(item.id, {
        xRatio: Number((zoneX + leftW + gap).toFixed(4)),
        yRatio: Number((zoneY + idx * (rightH + gap)).toFixed(4)),
        wRatio: Number(rightW.toFixed(4)),
        hRatio: Number(rightH.toFixed(4)),
        zIndex: 11 + idx,
        rotation: 0,
        isFullScreen: false,
      });
    });
    return result;
  }

  // General N >= 2 Bento Grid
  const aspectRatio = zoneW / Math.max(0.2, zoneH);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspectRatio)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const rowH = (zoneH - gap * (rows - 1)) / rows;

  let index = 0;
  for (let r = 0; r < rows; r++) {
    const remainingItems = n - index;
    const remainingRows = rows - r;
    const itemsInThisRow =
      r === 0 ? Math.floor(remainingItems / remainingRows) : Math.ceil(remainingItems / remainingRows);

    const colW = (zoneW - gap * (itemsInThisRow - 1)) / itemsInThisRow;
    const y = zoneY + r * (rowH + gap);

    for (let c = 0; c < itemsInThisRow; c++) {
      const item = items[index++];
      if (!item) break;
      const x = zoneX + c * (colW + gap);
      result.set(item.id, {
        xRatio: Number(x.toFixed(4)),
        yRatio: Number(y.toFixed(4)),
        wRatio: Number(colW.toFixed(4)),
        hRatio: Number(rowH.toFixed(4)),
        zIndex: 10 + index,
        rotation: 0,
        isFullScreen: false,
      });
    }
  }

  return result;
}

/**
 * 2D Shelf Packing that preserves each item's current aspect ratio & relative size,
 * scaling down proportionally only if needed so all items fit without overlapping.
 */
function packPreservingSizes(
  items: LayoutBox[],
  zoneX: number,
  zoneY: number,
  zoneW: number,
  zoneH: number,
  gap: number
): Map<string, FreeformPosition> {
  const result = new Map<string, FreeformPosition>();
  if (items.length === 0) return result;

  // Sort tallest-first for clean shelf rows
  const sorted = [...items].sort((a, b) => b.hRatio - a.hRatio || b.wRatio - a.wRatio);

  // Try scale factors from 1.0 down to 0.35 until all shelves fit within zoneH
  let chosenScale = 1.0;
  for (let scale = 1.0; scale >= 0.35; scale -= 0.05) {
    let curX = zoneX;
    let curY = zoneY;
    let shelfH = 0;
    let fits = true;

    for (const item of sorted) {
      const w = Math.min(zoneW, Math.max(0.11, item.wRatio * scale));
      const h = Math.min(zoneH, Math.max(0.11, item.hRatio * scale));

      if (curX + w > zoneX + zoneW + 0.001 && curX > zoneX) {
        curX = zoneX;
        curY += shelfH + gap;
        shelfH = 0;
      }

      shelfH = Math.max(shelfH, h);
      curX += w + gap;

      if (curY + shelfH > zoneY + zoneH + 0.005) {
        fits = false;
        break;
      }
    }

    chosenScale = scale;
    if (fits) break;
  }

  // Commit positions at chosenScale
  let curX = zoneX;
  let curY = zoneY;
  let shelfH = 0;

  sorted.forEach((item, idx) => {
    const w = Math.min(zoneW, Math.max(0.11, item.wRatio * chosenScale));
    const h = Math.min(zoneH, Math.max(0.11, item.hRatio * chosenScale));

    if (curX + w > zoneX + zoneW + 0.001 && curX > zoneX) {
      curX = zoneX;
      curY += shelfH + gap;
      shelfH = 0;
    }

    const clampedY = Math.min(zoneY + zoneH - h, curY);
    result.set(item.id, {
      xRatio: Number(curX.toFixed(4)),
      yRatio: Number(Math.max(zoneY, clampedY).toFixed(4)),
      wRatio: Number(w.toFixed(4)),
      hRatio: Number(h.toFixed(4)),
      zIndex: 10 + idx,
      rotation: item.kind === 'note' ? (idx % 2 === 0 ? -1 : 1) : 0,
      isFullScreen: false,
    });

    shelfH = Math.max(shelfH, h);
    curX += w + gap;
  });

  return result;
}

/**
 * Computes non-overlapping normalized positions for all active widgets and sticky notes on a canvas.
 */
export function computeNonOverlappingLayout(
  widgets: DashboardWidget[],
  notes: StickyNoteItem[],
  mode: AutoOrganizeMode = 'bento'
): OrganizedLayoutResult {
  const now = new Date();
  const activeNotes = notes.filter(
    (n) => !n.archivedAt && (!n.expiresAt || new Date(n.expiresAt) > now)
  );

  const widgetBoxes: LayoutBox[] = widgets.map((w) => ({
    id: w.id,
    kind: 'widget',
    priority: WIDGET_PRIORITY[w.type] ?? 15,
    wRatio: w.freeformPos?.wRatio || 0.35,
    hRatio: w.freeformPos?.hRatio || 0.42,
    xRatio: w.freeformPos?.xRatio || 0.1,
    yRatio: w.freeformPos?.yRatio || 0.1,
  }));

  const noteBoxes: LayoutBox[] = activeNotes.map((n) => ({
    id: n.id,
    kind: 'note',
    priority: 25,
    wRatio: n.freeformPos?.wRatio || 0.22,
    hRatio: n.freeformPos?.hRatio || 0.28,
    xRatio: n.freeformPos?.xRatio || 0.2,
    yRatio: n.freeformPos?.yRatio || 0.2,
  }));

  widgetBoxes.sort((a, b) => a.priority - b.priority);

  const zoneX = 0.02;
  const zoneY = 0.03;
  const zoneW = 0.96;
  const zoneH = 0.94;
  const gap = 0.02;

  let combinedMap = new Map<string, FreeformPosition>();

  if (mode === 'split' && widgetBoxes.length > 0 && noteBoxes.length > 0) {
    // Left 63% for Live Widgets, Right 31% for Sticky Notes
    const leftW = 0.63;
    const rightX = zoneX + leftW + gap;
    const rightW = zoneW - leftW - gap;

    const wMap = tileBentoInZone(widgetBoxes, zoneX, zoneY, leftW, zoneH, gap);
    const nMap = tileBentoInZone(noteBoxes, rightX, zoneY, rightW, zoneH, gap);
    wMap.forEach((v, k) => combinedMap.set(k, v));
    nMap.forEach((v, k) => combinedMap.set(k, v));
  } else if (mode === 'pack') {
    combinedMap = packPreservingSizes(
      [...widgetBoxes, ...noteBoxes],
      zoneX,
      zoneY,
      zoneW,
      zoneH,
      gap
    );
  } else {
    // Default 'bento' mode
    combinedMap = tileBentoInZone(
      [...widgetBoxes, ...noteBoxes],
      zoneX,
      zoneY,
      zoneW,
      zoneH,
      gap
    );
  }

  const widgetPositions: Record<string, FreeformPosition> = {};
  const notePositions: Record<string, FreeformPosition> = {};

  for (const w of widgets) {
    const pos = combinedMap.get(w.id);
    if (pos) widgetPositions[w.id] = pos;
  }

  for (const n of activeNotes) {
    const pos = combinedMap.get(n.id);
    if (pos) notePositions[n.id] = pos;
  }

  return { widgetPositions, notePositions };
}

/**
 * Finds an unoccupied (or minimum-overlap) position on the canvas for a newly created widget or sticky note.
 */
export function findOpenCanvasSpot(
  existingItems: { xRatio: number; yRatio: number; wRatio: number; hRatio: number }[],
  targetW: number,
  targetH: number,
  defaultRotation = 0
): FreeformPosition {
  const margin = 0.015;
  const minX = 0.03;
  const maxX = Math.max(minX, 0.97 - targetW);
  const minY = 0.04;
  const maxY = Math.max(minY, 0.96 - targetH);
  const step = 0.05;

  let bestX = minX;
  let bestY = minY;
  let minOverlapArea = Infinity;

  for (let y = minY; y <= maxY + 0.001; y += step) {
    for (let x = minX; x <= maxX + 0.001; x += step) {
      let overlapArea = 0;

      for (const box of existingItems) {
        const xOverlap = Math.max(
          0,
          Math.min(x + targetW + margin, box.xRatio + box.wRatio + margin) -
            Math.max(x, box.xRatio)
        );
        const yOverlap = Math.max(
          0,
          Math.min(y + targetH + margin, box.yRatio + box.hRatio + margin) -
            Math.max(y, box.yRatio)
        );
        overlapArea += xOverlap * yOverlap;
      }

      if (overlapArea === 0) {
        return {
          xRatio: Number(x.toFixed(4)),
          yRatio: Number(y.toFixed(4)),
          wRatio: targetW,
          hRatio: targetH,
          zIndex: 25,
          rotation: defaultRotation,
          isFullScreen: false,
        };
      }

      if (overlapArea < minOverlapArea) {
        minOverlapArea = overlapArea;
        bestX = x;
        bestY = y;
      }
    }
  }

  return {
    xRatio: Number(bestX.toFixed(4)),
    yRatio: Number(bestY.toFixed(4)),
    wRatio: targetW,
    hRatio: targetH,
    zIndex: 25,
    rotation: defaultRotation,
    isFullScreen: false,
  };
}
