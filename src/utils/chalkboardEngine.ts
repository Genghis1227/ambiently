import type {
  ChalkBrushSize,
  ChalkStroke,
  ChalkTool,
  ChalkboardSurface,
} from '../types/phase4Widgets';

export const CHALK_COORD_SCALE = 1000;
export const MAX_CHALK_STROKES = 80;
export const MAX_POINTS_PER_STROKE = 120;

export interface ChalkColorOption {
  id: string;
  hex: string;
  label: string;
}

export const CHALK_COLOR_PALETTE: ChalkColorOption[] = [
  { id: 'white', hex: '#f8fafc', label: 'Chalk White' },
  { id: 'buttercup', hex: '#fde047', label: 'Buttercup' },
  { id: 'mint', hex: '#86efac', label: 'Mint Chalk' },
  { id: 'sky', hex: '#7dd3fc', label: 'Sky Blue' },
  { id: 'rose', hex: '#f9a8d4', label: 'Soft Rose' },
  { id: 'peach', hex: '#fdba74', label: 'Warm Peach' },
  { id: 'lavender', hex: '#c4b5fd', label: 'Lavender' },
  { id: 'charcoal', hex: '#1e293b', label: 'Charcoal Ink' },
];

export const CHALKBOARD_SURFACE_OPTIONS: Array<{
  id: ChalkboardSurface;
  label: string;
  subtitle: string;
}> = [
  { id: 'slate', label: 'Slate Chalkboard', subtitle: 'Deep charcoal chalk matte' },
  { id: 'cork', label: 'Warm Cork', subtitle: 'Tactile earth-toned pinboard' },
  { id: 'whiteboard', label: 'Whiteboard', subtitle: 'Clean bright dry-erase surface' },
];

export interface BoardPoint {
  x: number;
  y: number;
}

const VALID_TOOLS = new Set<ChalkTool>(['chalk', 'marker', 'eraser']);
const VALID_SIZES = new Set<ChalkBrushSize>(['fine', 'medium', 'bold']);
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i;

function clampCoord(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(CHALK_COORD_SCALE, Math.round(value)));
}

/**
 * Converts client pointer coordinates into integer 0..1000 normalized chalkboard coordinates.
 */
export function normalizePointToBoard(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): BoardPoint {
  const safeWidth = rect.width > 0 ? rect.width : 1;
  const safeHeight = rect.height > 0 ? rect.height : 1;
  const normX = ((clientX - rect.left) / safeWidth) * CHALK_COORD_SCALE;
  const normY = ((clientY - rect.top) / safeHeight) * CHALK_COORD_SCALE;
  return {
    x: clampCoord(normX),
    y: clampCoord(normY),
  };
}

function perpendicularDistance(point: BoardPoint, lineStart: BoardPoint, lineEnd: BoardPoint): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }
  const num = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  return num / Math.sqrt(lenSq);
}

function runRdp(points: BoardPoint[], epsilon: number): BoardPoint[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let splitIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      splitIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = runRdp(points.slice(0, splitIndex + 1), epsilon);
    const right = runRdp(points.slice(splitIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

/**
 * Simplifies raw freehand stroke points via radial deduplication and Ramer-Douglas-Peucker
 * decimation, keeping strokes compact for Realtime/Cloud Sync while preserving curves.
 */
export function simplifyPointsRDP(
  rawPoints: ReadonlyArray<BoardPoint>,
  epsilon: number = 2.5
): BoardPoint[] {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return [];

  const clamped = rawPoints.map((pt) => ({ x: clampCoord(pt.x), y: clampCoord(pt.y) }));
  if (clamped.length === 1) return clamped;

  const deduped: BoardPoint[] = [clamped[0]];
  for (let i = 1; i < clamped.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = clamped[i];
    const isLast = i === clamped.length - 1;
    if (isLast || Math.hypot(curr.x - prev.x, curr.y - prev.y) >= 2) {
      if (!isLast || curr.x !== prev.x || curr.y !== prev.y || deduped.length === 1) {
        deduped.push(curr);
      }
    }
  }

  const simplified = deduped.length > 2 ? runRdp(deduped, Math.max(0.5, epsilon)) : deduped;
  if (simplified.length <= MAX_POINTS_PER_STROKE) {
    return simplified;
  }

  const capped: BoardPoint[] = [simplified[0]];
  const step = (simplified.length - 1) / (MAX_POINTS_PER_STROKE - 1);
  for (let i = 1; i < MAX_POINTS_PER_STROKE - 1; i++) {
    capped.push(simplified[Math.round(i * step)]);
  }
  capped.push(simplified[simplified.length - 1]);
  return capped;
}

export function encodeStrokePoints(points: ReadonlyArray<BoardPoint>): number[] {
  const flat: number[] = [];
  const limit = Math.min(points.length, MAX_POINTS_PER_STROKE);
  for (let i = 0; i < limit; i++) {
    flat.push(clampCoord(points[i].x), clampCoord(points[i].y));
  }
  return flat;
}

export function decodeStrokePoints(flat: ReadonlyArray<number>): BoardPoint[] {
  if (!Array.isArray(flat) || flat.length < 2) return [];
  const out: BoardPoint[] = [];
  const usableLen = flat.length - (flat.length % 2);
  const maxNums = Math.min(usableLen, MAX_POINTS_PER_STROKE * 2);
  for (let i = 0; i < maxNums; i += 2) {
    const x = Number(flat[i]);
    const y = Number(flat[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      out.push({ x: clampCoord(x), y: clampCoord(y) });
    }
  }
  return out;
}

export function sanitizeChalkStrokes(raw: unknown): ChalkStroke[] {
  if (!Array.isArray(raw)) return [];
  const clean: ChalkStroke[] = [];

  for (let idx = 0; idx < raw.length; idx++) {
    const item = raw[idx] as Partial<ChalkStroke> | null | undefined;
    if (!item || typeof item !== 'object') continue;
    if (!Array.isArray(item.points)) continue;

    const decoded = decodeStrokePoints(item.points);
    if (decoded.length === 0) continue;

    const tool: ChalkTool = VALID_TOOLS.has(item.tool as ChalkTool)
      ? (item.tool as ChalkTool)
      : 'chalk';
    const size: ChalkBrushSize = VALID_SIZES.has(item.size as ChalkBrushSize)
      ? (item.size as ChalkBrushSize)
      : 'medium';
    const color =
      typeof item.color === 'string' && HEX_COLOR_RE.test(item.color.trim())
        ? item.color.trim()
        : '#f8fafc';
    const id =
      typeof item.id === 'string' && item.id.trim().length > 0
        ? item.id.trim()
        : `stroke-${idx + 1}`;

    clean.push({
      id,
      tool,
      color,
      size,
      points: encodeStrokePoints(decoded),
    });
  }

  return clean.slice(-MAX_CHALK_STROKES);
}

export function appendChalkStroke(
  existing: ReadonlyArray<ChalkStroke>,
  stroke: ChalkStroke
): ChalkStroke[] {
  return sanitizeChalkStrokes([...existing, stroke]);
}

export function undoLastChalkStroke(existing: ReadonlyArray<ChalkStroke>): ChalkStroke[] {
  if (!Array.isArray(existing) || existing.length === 0) return [];
  return existing.slice(0, -1);
}

export function getBrushWidthPx(
  size: ChalkBrushSize,
  tool: ChalkTool,
  canvasMinDim: number
): number {
  const safeMin = Math.max(180, canvasMinDim);
  const ratio = size === 'fine' ? 0.0085 : size === 'bold' ? 0.025 : 0.015;
  const multiplier = tool === 'eraser' ? 2.4 : 1;
  return Math.max(2, Number((safeMin * ratio * multiplier).toFixed(2)));
}

function traceSmoothStrokePath(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<BoardPoint>,
  width: number,
  height: number
): void {
  const toPx = (pt: BoardPoint) => ({
    x: (pt.x / CHALK_COORD_SCALE) * width,
    y: (pt.y / CHALK_COORD_SCALE) * height,
  });

  if (points.length === 1) {
    const p = toPx(points[0]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, ctx.lineWidth / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  const first = toPx(points[0]);
  ctx.moveTo(first.x, first.y);

  if (points.length === 2) {
    const second = toPx(points[1]);
    ctx.lineTo(second.x, second.y);
    ctx.stroke();
    return;
  }

  for (let i = 1; i < points.length - 1; i++) {
    const curr = toPx(points[i]);
    const next = toPx(points[i + 1]);
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
  }

  const last = toPx(points[points.length - 1]);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/**
 * Renders finalized and optional active strokes onto a 2D canvas using quadratic Bezier
 * midpoint smoothing and destination-out erasing for clean Sticker Mode compositing.
 */
export function renderChalkStrokesToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: ReadonlyArray<ChalkStroke>,
  draftStroke?: ChalkStroke | null
): void {
  if (width <= 0 || height <= 0) return;
  ctx.clearRect(0, 0, width, height);

  const minDim = Math.min(width, height);
  const allStrokes = draftStroke ? [...strokes, draftStroke] : strokes;

  for (const stroke of allStrokes) {
    const points = decodeStrokePoints(stroke.points);
    if (points.length === 0) continue;

    const baseWidth = getBrushWidthPx(stroke.size, stroke.tool, minDim);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = '#000000';
      ctx.lineWidth = baseWidth;
      traceSmoothStrokePath(ctx, points, width, height);
    } else if (stroke.tool === 'chalk') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;

      // Soft chalk dust halo
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = baseWidth * 1.4;
      traceSmoothStrokePath(ctx, points, width, height);

      // Textured chalk core
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = baseWidth;
      traceSmoothStrokePath(ctx, points, width, height);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.96;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = baseWidth;
      traceSmoothStrokePath(ctx, points, width, height);
    }

    ctx.restore();
  }
}
