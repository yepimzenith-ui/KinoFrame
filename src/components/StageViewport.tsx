import React, { useEffect, useRef, useState } from 'react';
import {
  CircleDot,
  Columns2,
  Crop,
  Eraser,
  Film,
  Grid3x3,
  HelpCircle,
  Lasso,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  MousePointerClick,
  Paintbrush,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scan,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DEFAULT_BG_REMOVAL, DEFAULT_MASK } from '../data/presets';
import {
  AspectRatioId,
  BgBrushToolMode,
  BgDrawnPolygon,
  BgPickPoint,
  BgRemovalSettings,
  BgRemovalStroke,
  CanvasBgMode,
  CropRect,
  EditDocument,
  MaskSettings,
  OverlayLayerOrder,
  TimelineOverlayItem,
  WorkspaceMode,
} from '../types/editor';
import { evaluateOverlayAtTime } from '../utils/renderEngine';
import { clamp } from '../utils/timecode';

interface StageViewportProps {
  workspace: WorkspaceMode;
  isAuthenticated?: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  originalCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasWidth: number;
  canvasHeight: number;
  edits: EditDocument;
  cropMode: boolean;
  maskMode: boolean;
  compareSplit: boolean;
  showGrid: boolean;
  canUndo: boolean;
  canRedo: boolean;
  titleLabel: string;
  metaLabel: string;
  projectName: string;
  isProjectSaved: boolean;
  savingProject: boolean;
  hasTimelineClips: boolean;
  hasGlobalOverlays?: boolean;
  sequenceAspect: AspectRatioId;
  globalTime: number;
  globalOverlays: TimelineOverlayItem[];
  selectedGlobalOverlayId: string | null;
  onToggleCompare: () => void;
  onToggleGrid: () => void;
  onToggleCropMode: () => void;
  onToggleMaskMode: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onChangeCrop: (crop: CropRect) => void;
  onChangeMask: (patch: Partial<MaskSettings>) => void;
  onChangeSequenceAspect: (aspect: AspectRatioId) => void;
  onChangeBgMode: (mode: CanvasBgMode) => void;
  onToggleFitMode: () => void;
  onSelectGlobalOverlay: (id: string | null) => void;
  onMoveOrScaleOverlayAtPlayhead: (
    id: string,
    patch: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      tiltX?: number;
      tiltY?: number;
    }
  ) => void;
  onDeleteGlobalOverlay: (id: string) => void;
  selectedPhotoOverlayId?: string | null;
  onSelectPhotoOverlay?: (id: string | null) => void;
  onUpdatePhotoOverlay?: (
    id: string,
    patch: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      tiltX?: number;
      tiltY?: number;
    }
  ) => void;
  onMovePhotoOverlay: (id: string, x: number, y: number) => void;
  onRemovePhotoOverlay: (id: string) => void;
  selectedPhotoVisualOverlayId?: string | null;
  onSelectPhotoVisualOverlay?: (id: string | null) => void;
  onUpdatePhotoVisualOverlay?: (
    id: string,
    patch: { x?: number; y?: number; scale?: number; rotation?: number }
  ) => void;
  onMovePhotoVisualOverlay: (id: string, x: number, y: number) => void;
  onRemovePhotoVisualOverlay: (id: string) => void;
  bgBrushMode?: BgBrushToolMode;
  bgBrushSize?: number;
  bgEyedropperActive?: boolean;
  onSetBgBrushMode?: (mode: BgBrushToolMode) => void;
  onSetBgBrushSize?: (size: number) => void;
  onAddBgStroke?: (stroke: BgRemovalStroke) => void;
  onAddBgStrokesBatch?: (strokes: BgRemovalStroke[]) => void;
  onAddBgDrawnPolygon?: (poly: BgDrawnPolygon) => void;
  onAddBgPickPoint?: (pt: BgPickPoint) => void;
  onUndoBgDraw?: () => void;
  onExtractCutoutToOverlay?: () => void;
  onPickBgColorAtPoint?: (nx: number, ny: number) => void;
  onExitBgToolMode?: () => void;
  onOpenCutoutMode?: () => void;
  onUpdateBgRemovalQuick?: (patch: Partial<BgRemovalSettings>) => void;
  onChangePhotoAspect?: (aspect: AspectRatioId) => void;
  onTriggerTextBehindShortcut?: () => void;
  onSetSelectedOverlayLayerOrder?: (id: string, layerOrder: OverlayLayerOrder) => void;
  onSetPhotoOverlayLayerOrder?: (id: string, layerOrder: OverlayLayerOrder) => void;
  onSaveProject: () => void;
  onImportMedia: () => void;
  onOpenMediaDrawer: () => void;
  mobileInspectorOpen?: boolean;
  onToggleMobileInspector?: () => void;
}

export const StageViewport: React.FC<StageViewportProps> = ({
  workspace,
  isAuthenticated = false,
  canvasRef,
  originalCanvasRef,
  canvasWidth,
  canvasHeight,
  edits,
  cropMode,
  maskMode,
  compareSplit,
  showGrid,
  canUndo,
  canRedo,
  titleLabel,
  metaLabel,
  projectName,
  isProjectSaved,
  savingProject,
  hasTimelineClips,
  hasGlobalOverlays = false,
  sequenceAspect,
  globalTime,
  globalOverlays,
  selectedGlobalOverlayId,
  onToggleCompare,
  onToggleGrid,
  onToggleCropMode,
  onToggleMaskMode,
  onUndo,
  onRedo,
  onChangeCrop,
  onChangeMask,
  onChangeSequenceAspect,
  onChangeBgMode,
  onToggleFitMode,
  onSelectGlobalOverlay,
  onMoveOrScaleOverlayAtPlayhead,
  onDeleteGlobalOverlay,
  selectedPhotoOverlayId = null,
  onSelectPhotoOverlay,
  onUpdatePhotoOverlay,
  onMovePhotoOverlay,
  onRemovePhotoOverlay,
  selectedPhotoVisualOverlayId = null,
  onSelectPhotoVisualOverlay,
  onUpdatePhotoVisualOverlay,
  onMovePhotoVisualOverlay,
  onRemovePhotoVisualOverlay,
  bgBrushMode = 'none',
  bgBrushSize = 0.055,
  bgEyedropperActive = false,
  onSetBgBrushMode,
  onSetBgBrushSize,
  onAddBgStroke,
  onAddBgStrokesBatch,
  onAddBgDrawnPolygon,
  onAddBgPickPoint,
  onUndoBgDraw,
  onExtractCutoutToOverlay,
  onPickBgColorAtPoint,
  onExitBgToolMode,
  onOpenCutoutMode,
  onUpdateBgRemovalQuick,
  onChangePhotoAspect,
  onTriggerTextBehindShortcut,
  onSetSelectedOverlayLayerOrder,
  onSetPhotoOverlayLayerOrder,
  onSaveProject,
  onImportMedia,
  onOpenMediaDrawer,
  mobileInspectorOpen,
  onToggleMobileInspector,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [splitPos, setSplitPos] = useState<number>(0.5);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);
  const [turnAxis, setTurnAxis] = useState<'z' | 'y' | 'x'>('z');
  const [dragAngleHint, setDragAngleHint] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);
  const [liveLassoPoints, setLiveLassoPoints] = useState<{ x: number; y: number }[]>([]);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  const stageBoxRef = useRef<HTMLDivElement>(null);
  const draggingSplitRef = useRef(false);
  const paintingBrushRef = useRef(false);
  const lastBrushPtRef = useRef<{ x: number; y: number } | null>(null);
  const strokeGroupIdRef = useRef<string>('');
  const queuedStrokesRef = useRef<BgRemovalStroke[]>([]);
  const brushRafRef = useRef<number | null>(null);
  const liveLassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  const draggingOverlayRef = useRef<{
    id: string;
    targetType: 'global' | 'photo-text' | 'photo-visual';
    mode: 'move' | 'scale' | 'rotate' | 'rotate-x' | 'rotate-y';
    startX: number;
    startY: number;
    startScale: number;
    startTiltX?: number;
    startTiltY?: number;
  } | null>(null);
  const draggingCropRef = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se';
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);
  const draggingMaskRef = useRef<{
    mode: 'move' | 'resize' | 'rotate';
    startX: number;
    startY: number;
    startMask: MaskSettings;
  } | null>(null);

  const activeMask = edits.mask || DEFAULT_MASK;
  const selectedMaskOverlay =
    workspace === 'timeline'
      ? globalOverlays.find((o) => o.id === selectedGlobalOverlayId && o.kind === 'mask') || null
      : null;

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const box = stageBoxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (draggingSplitRef.current) {
        setSplitPos(clamp((e.clientX - rect.left) / rect.width, 0.05, 0.95));
        return;
      }

      const snapAxis = (val: number, forceDisable = false): { snapped: number; guide: number | null } => {
        if (!snapEnabled || forceDisable) {
          return { snapped: Number(val.toFixed(4)), guide: null };
        }
        const anchors = [0.5, 1 / 3, 2 / 3];
        for (const a of anchors) {
          if (Math.abs(val - a) < 0.022) {
            return { snapped: Number(a.toFixed(4)), guide: a };
          }
        }
        return { snapped: Number(val.toFixed(4)), guide: null };
      };

      if (draggingMaskRef.current) {
        const drag = draggingMaskRef.current;
        const { startX, startY, startMask } = drag;
        if (drag.mode === 'move') {
          const sx = snapAxis(clamp(startMask.x + (e.clientX - startX) / rect.width, 0.05, 0.95), e.altKey);
          const sy = snapAxis(clamp(startMask.y + (e.clientY - startY) / rect.height, 0.05, 0.95), e.altKey);
          setSnapGuides({ x: sx.guide, y: sy.guide });
          onChangeMask({ x: sx.snapped, y: sy.snapped });
        } else if (drag.mode === 'resize') {
          const cx = rect.left + startMask.x * rect.width;
          const cy = rect.top + startMask.y * rect.height;
          const distW = Math.abs(e.clientX - cx) * 2 / rect.width;
          const distH = Math.abs(e.clientY - cy) * 2 / rect.height;
          onChangeMask({
            width: Number(clamp(distW, 0.08, 1.25).toFixed(3)),
            height: Number(clamp(distH, 0.08, 1.25).toFixed(3)),
          });
        } else if (drag.mode === 'rotate') {
          const cx = rect.left + startMask.x * rect.width;
          const cy = rect.top + startMask.y * rect.height;
          const angle = Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90);
          const normalized = ((angle + 180) % 360) - 180;
          onChangeMask({ rotation: normalized });
        }
        return;
      }

      if (draggingOverlayRef.current) {
        const drag = draggingOverlayRef.current;
        if (drag.mode === 'move') {
          const sx = snapAxis(clamp((e.clientX - rect.left) / rect.width, -0.15, 1.15), e.altKey);
          const sy = snapAxis(clamp((e.clientY - rect.top) / rect.height, -0.15, 1.15), e.altKey);
          setSnapGuides({ x: sx.guide, y: sy.guide });
          if (drag.targetType === 'photo-text') {
            if (onUpdatePhotoOverlay) {
              onUpdatePhotoOverlay(drag.id, { x: sx.snapped, y: sy.snapped });
            } else {
              onMovePhotoOverlay(drag.id, sx.snapped, sy.snapped);
            }
          } else if (drag.targetType === 'photo-visual') {
            if (onUpdatePhotoVisualOverlay) {
              onUpdatePhotoVisualOverlay(drag.id, { x: sx.snapped, y: sy.snapped });
            } else {
              onMovePhotoVisualOverlay(drag.id, sx.snapped, sy.snapped);
            }
          } else {
            onMoveOrScaleOverlayAtPlayhead(drag.id, { x: sx.snapped, y: sy.snapped });
          }
        } else if (drag.mode === 'scale') {
          const delta = (e.clientY - drag.startY) / 140;
          const nextScale = clamp(Number((drag.startScale - delta).toFixed(2)), 0.25, 3.5);
          if (drag.targetType === 'photo-text') {
            onUpdatePhotoOverlay?.(drag.id, { scale: nextScale });
          } else if (drag.targetType === 'photo-visual') {
            onUpdatePhotoVisualOverlay?.(drag.id, { scale: nextScale });
          } else if (drag.targetType === 'global') {
            onMoveOrScaleOverlayAtPlayhead(drag.id, { scale: nextScale });
          }
        } else if (
          drag.mode === 'rotate' ||
          drag.mode === 'rotate-x' ||
          drag.mode === 'rotate-y'
        ) {
          const activeAxis: 'x' | 'y' | 'z' =
            drag.mode === 'rotate-x'
              ? 'x'
              : drag.mode === 'rotate-y'
                ? 'y'
                : drag.targetType === 'photo-text' ||
                    (drag.targetType === 'global' &&
                      globalOverlays.find((o) => o.id === drag.id)?.kind === 'text')
                  ? turnAxis
                  : 'z';

          if (activeAxis === 'y') {
            const nextTiltY = clamp(
              Math.round((drag.startTiltY ?? 0) + (e.clientX - drag.startX) * 0.85),
              -360,
              360
            );
            setDragAngleHint(`Y: ${nextTiltY > 0 ? `+${nextTiltY}` : nextTiltY}°`);
            if (drag.targetType === 'photo-text') {
              onUpdatePhotoOverlay?.(drag.id, { tiltY: nextTiltY });
            } else if (drag.targetType === 'global') {
              onMoveOrScaleOverlayAtPlayhead(drag.id, { tiltY: nextTiltY });
            }
          } else if (activeAxis === 'x') {
            const nextTiltX = clamp(
              Math.round((drag.startTiltX ?? 0) - (e.clientY - drag.startY) * 0.85),
              -360,
              360
            );
            setDragAngleHint(`X: ${nextTiltX > 0 ? `+${nextTiltX}` : nextTiltX}°`);
            if (drag.targetType === 'photo-text') {
              onUpdatePhotoOverlay?.(drag.id, { tiltX: nextTiltX });
            } else if (drag.targetType === 'global') {
              onMoveOrScaleOverlayAtPlayhead(drag.id, { tiltX: nextTiltX });
            }
          } else if (drag.targetType === 'photo-text') {
            const ov = edits.overlays.find((o) => o.id === drag.id);
            if (ov) {
              const cx = rect.left + ov.x * rect.width;
              const cy = rect.top + ov.y * rect.height;
              const angle = Math.round(
                (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90
              );
              const normalized = ((angle + 180) % 360) - 180;
              setDragAngleHint(`Z: ${normalized > 0 ? `+${normalized}` : normalized}°`);
              onUpdatePhotoOverlay?.(drag.id, { rotation: normalized });
            }
          } else if (drag.targetType === 'photo-visual') {
            const vov = (edits.visualOverlays || []).find((o) => o.id === drag.id);
            if (vov) {
              const cx = rect.left + vov.x * rect.width;
              const cy = rect.top + vov.y * rect.height;
              const angle = Math.round(
                (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90
              );
              const normalized = ((angle + 180) % 360) - 180;
              setDragAngleHint(`Z: ${normalized > 0 ? `+${normalized}` : normalized}°`);
              onUpdatePhotoVisualOverlay?.(drag.id, { rotation: normalized });
            }
          } else if (drag.targetType === 'global') {
            const ov = globalOverlays.find((o) => o.id === drag.id);
            if (ov) {
              const evaluated = evaluateOverlayAtTime(ov, globalTime - ov.startTime);
              const cx = rect.left + evaluated.x * rect.width;
              const cy = rect.top + evaluated.y * rect.height;
              const angle = Math.round(
                (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90
              );
              const normalized = ((angle + 180) % 360) - 180;
              setDragAngleHint(`Z: ${normalized > 0 ? `+${normalized}` : normalized}°`);
              onMoveOrScaleOverlayAtPlayhead(drag.id, { rotation: normalized });
            }
          }
        }
        return;
      }

      if (draggingCropRef.current) {
        const { mode, startX, startY, startCrop } = draggingCropRef.current;
        const dx = (e.clientX - startX) / rect.width;
        const dy = (e.clientY - startY) / rect.height;
        const minSize = 0.12;

        if (mode === 'move') {
          const nx = clamp(startCrop.x + dx, 0, 1 - startCrop.width);
          const ny = clamp(startCrop.y + dy, 0, 1 - startCrop.height);
          onChangeCrop({ ...startCrop, x: nx, y: ny });
        } else if (mode === 'nw') {
          const right = startCrop.x + startCrop.width;
          const bottom = startCrop.y + startCrop.height;
          const nx = clamp(startCrop.x + dx, 0, right - minSize);
          const ny = clamp(startCrop.y + dy, 0, bottom - minSize);
          onChangeCrop({ x: nx, y: ny, width: right - nx, height: bottom - ny });
        } else if (mode === 'ne') {
          const bottom = startCrop.y + startCrop.height;
          const nw = clamp(startCrop.width + dx, minSize, 1 - startCrop.x);
          const ny = clamp(startCrop.y + dy, 0, bottom - minSize);
          onChangeCrop({ x: startCrop.x, y: ny, width: nw, height: bottom - ny });
        } else if (mode === 'sw') {
          const right = startCrop.x + startCrop.width;
          const nx = clamp(startCrop.x + dx, 0, right - minSize);
          const nh = clamp(startCrop.height + dy, minSize, 1 - startCrop.y);
          onChangeCrop({ x: nx, y: startCrop.y, width: right - nx, height: nh });
        } else if (mode === 'se') {
          const nw = clamp(startCrop.width + dx, minSize, 1 - startCrop.x);
          const nh = clamp(startCrop.height + dy, minSize, 1 - startCrop.y);
          onChangeCrop({ x: startCrop.x, y: startCrop.y, width: nw, height: nh });
        }
      }
    };

    const handlePointerUp = () => {
      draggingSplitRef.current = false;
      paintingBrushRef.current = false;
      lastBrushPtRef.current = null;
      if (queuedStrokesRef.current.length > 0) {
        const flush = queuedStrokesRef.current.splice(0, queuedStrokesRef.current.length);
        if (onAddBgStrokesBatch) onAddBgStrokesBatch(flush);
        else if (onAddBgStroke) flush.forEach(onAddBgStroke);
      }
      if (liveLassoPointsRef.current.length >= 3 && onAddBgDrawnPolygon) {
        onAddBgDrawnPolygon({
          id: `poly-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          action: 'keep',
          points: liveLassoPointsRef.current,
        });
      }
      liveLassoPointsRef.current = [];
      setLiveLassoPoints([]);
      draggingOverlayRef.current = null;
      draggingCropRef.current = null;
      draggingMaskRef.current = null;
      setSnapGuides({ x: null, y: null });
      setDragAngleHint(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [
    onChangeCrop,
    onChangeMask,
    onMoveOrScaleOverlayAtPlayhead,
    onMovePhotoOverlay,
    onUpdatePhotoOverlay,
    onMovePhotoVisualOverlay,
    onAddBgStroke,
    onAddBgStrokesBatch,
    onAddBgDrawnPolygon,
    globalOverlays,
    globalTime,
    edits.overlays,
    edits.visualOverlays,
    onUpdatePhotoVisualOverlay,
    snapEnabled,
    turnAxis,
  ]);

  const crop = edits.transform.crop;
  const showTransparentChecker =
    Boolean(edits.bgRemoval?.enabled) && edits.bgRemoval?.backdropMode === 'transparent';
  const isBgInteractive = bgEyedropperActive || bgBrushMode !== 'none';
  const visibleGlobalOverlays =
    workspace === 'timeline'
      ? globalOverlays.filter(
          (o) => globalTime >= o.startTime && globalTime <= o.startTime + o.duration
        )
      : [];

  const stageHasContent = workspace === 'photo' || hasTimelineClips || hasGlobalOverlays;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#060608] relative">
      {/* Top Stage Bar */}
      <div className="h-10 shrink-0 px-2.5 sm:px-4 border-b border-zinc-800/80 flex items-center justify-between gap-2 sm:gap-4 bg-zinc-950">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <span className="text-xs font-semibold text-zinc-100 truncate">{titleLabel}</span>
          <span className="hidden sm:inline text-zinc-700" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline text-[11px] font-mono text-zinc-500 tabular-nums whitespace-nowrap shrink-0">
            {metaLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto studio-scroll shrink-0 max-w-[74%] sm:max-w-none">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className={`p-1.5 rounded-md transition-colors ${
              canUndo
                ? 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 cursor-pointer'
                : 'text-zinc-700 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className={`p-1.5 rounded-md transition-colors ${
              canRedo
                ? 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 cursor-pointer'
                : 'text-zinc-700 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={() => setZoom((z) => clamp(Number((z - 0.25).toFixed(2)), 0.5, 2))}
            title="Zoom out"
            aria-label="Zoom out"
            className="p-1.5 rounded-md text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Reset zoom to 100%"
            className="px-1.5 py-1 text-[11px] font-mono text-zinc-300 hover:text-zinc-50 tabular-nums cursor-pointer"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => clamp(Number((z + 0.25).toFixed(2)), 0.5, 2))}
            title="Zoom in"
            aria-label="Zoom in"
            className="p-1.5 rounded-md text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-800 mx-1" />

          <button
            type="button"
            disabled={!stageHasContent}
            onClick={onToggleCropMode}
            title="Crop Frame (C)"
            className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap disabled:opacity-40 ${
              cropMode
                ? 'bg-amber-500 text-zinc-950 cursor-pointer'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 cursor-pointer'
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Crop</span>
          </button>

          <button
            type="button"
            disabled={!stageHasContent}
            onClick={onToggleMaskMode}
            title="Edit Shape Mask (M)"
            className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap disabled:opacity-40 ${
              maskMode
                ? 'bg-amber-500 text-zinc-950 cursor-pointer'
                : activeMask.shape !== 'none'
                  ? 'bg-zinc-800 text-amber-400 cursor-pointer'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 cursor-pointer'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span>Mask</span>
            {!isAuthenticated && <Lock className="w-2.5 h-2.5 text-amber-400" />}
          </button>

          <button
            type="button"
            onClick={onToggleGrid}
            title="Rule of Thirds Guide"
            aria-label="Rule of thirds grid"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              showGrid
                ? 'bg-zinc-800 text-amber-400'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50'
            }`}
          >
            <Grid3x3 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowSafeZones((s) => !s)}
            title="AE Title / Action Safe Zones & Center Crosshair"
            aria-label="Toggle title and action safe zones"
            aria-pressed={showSafeZones}
            className={`flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              showSafeZones
                ? 'bg-zinc-800 text-amber-400'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Safe</span>
          </button>

          <button
            type="button"
            onClick={() => setSnapEnabled((s) => !s)}
            title="Toggle Canvas Snapping (or hold Alt while dragging for free placement)"
            aria-label="Toggle canvas snapping"
            aria-pressed={snapEnabled}
            className={`flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              snapEnabled
                ? 'bg-zinc-800 text-amber-400'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{snapEnabled ? 'Snap' : 'Free'}</span>
          </button>

          <button
            type="button"
            disabled={!stageHasContent}
            onClick={onToggleCompare}
            title="Before / After Split"
            className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap disabled:opacity-40 ${
              compareSplit
                ? 'bg-zinc-800 text-amber-400 cursor-pointer'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 cursor-pointer'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Compare</span>
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen((v) => !v)}
            title="Keyboard Shortcuts"
            aria-label="Keyboard shortcuts"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              shortcutsOpen
                ? 'bg-zinc-800 text-amber-400'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-800 mx-1" />

          {onToggleMobileInspector && (
            <button
              type="button"
              onClick={onToggleMobileInspector}
              title="Open Inspector"
              className={`lg:hidden flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mobileInspectorOpen
                  ? 'border-amber-500 bg-amber-500 text-zinc-950'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          )}

          <button
            type="button"
            disabled={savingProject}
            onClick={onSaveProject}
            title={`Save "${projectName}" (Ctrl+S)`}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
              isProjectSaved
                ? 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-zinc-100'
                : 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingProject ? 'Saving...' : isProjectSaved ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Shortcuts Popover */}
      {shortcutsOpen && (
        <div className="absolute top-12 right-4 z-40 w-64 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-semibold text-zinc-100">Keyboard Shortcuts</span>
            <button
              type="button"
              onClick={() => setShortcutsOpen(false)}
              className="p-1 text-zinc-500 hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 text-[11px]">
            {[
              { key: 'B', desc: 'Text Behind Character / Flip Layer' },
              { key: 'Shift+B', desc: 'Add New Text Behind Subject' },
              { key: 'Space', desc: 'Play / Pause timeline' },
              { key: 'S', desc: 'Split clip at playhead' },
              { key: '← / →', desc: 'Step 1 frame' },
              { key: 'C', desc: 'Toggle Crop frame' },
              { key: 'M', desc: 'Toggle Mask frame' },
              { key: 'Del', desc: 'Remove selected item' },
              { key: 'Ctrl+Z / Y', desc: 'Undo / Redo edits' },
              { key: 'Ctrl+S', desc: 'Save project to cloud' },
            ].map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">{s.desc}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-amber-400">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Cutout Brush / Lasso / Eyedropper Toolbar */}
      {isBgInteractive && (
        <div className="px-3 py-1.5 bg-zinc-900/95 border-b border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            {bgEyedropperActive ? (
              <span className="text-amber-200 font-medium truncate">
                Eyedropper active: click any background color on canvas to key it out
              </span>
            ) : (
              <>
                {onSetBgBrushMode && (
                  <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-md border border-zinc-800 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onSetBgBrushMode('pick-keep')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'pick-keep'
                          ? 'bg-emerald-500/25 text-emerald-300'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <MousePointerClick className="w-3 h-3" />
                      <span>Pick Keep +</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetBgBrushMode('pick-remove')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'pick-remove'
                          ? 'bg-red-500/25 text-red-300'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <MousePointerClick className="w-3 h-3" />
                      <span>Pick Remove -</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetBgBrushMode('keep')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'keep'
                          ? 'bg-emerald-500/25 text-emerald-300'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <Paintbrush className="w-3 h-3" />
                      <span>Paint +</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetBgBrushMode('lasso')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'lasso'
                          ? 'bg-amber-500/25 text-amber-300'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <Lasso className="w-3 h-3" />
                      <span>Draw Lasso</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetBgBrushMode('erase')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'erase'
                          ? 'bg-red-500/25 text-red-300'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <Eraser className="w-3 h-3" />
                      <span>Erase -</span>
                    </button>
                  </div>
                )}

                {(bgBrushMode === 'pick-keep' || bgBrushMode === 'pick-remove') && (
                  <span className="hidden md:inline text-[11px] text-zinc-400">
                    {bgBrushMode === 'pick-keep'
                      ? 'Click on a person or object to keep it'
                      : 'Click on any person or subject to remove it'}
                  </span>
                )}

                {(bgBrushMode === 'keep' || bgBrushMode === 'erase') && onSetBgBrushSize && (
                  <div className="hidden sm:flex items-center gap-1.5 px-2">
                    <span className="text-[10px] text-zinc-400">Size</span>
                    <input
                      type="range"
                      min={15}
                      max={140}
                      value={Math.round(bgBrushSize * 1000)}
                      onChange={(e) => onSetBgBrushSize(Number(e.target.value) / 1000)}
                      className="w-20"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onUndoBgDraw && (
              <button
                type="button"
                onClick={onUndoBgDraw}
                title="Undo last stroke or outline"
                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Undo</span>
              </button>
            )}
            {onExtractCutoutToOverlay && (
              <button
                type="button"
                onClick={onExtractCutoutToOverlay}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-100 hover:bg-amber-300 text-zinc-950 font-semibold text-[11px] cursor-pointer whitespace-nowrap"
              >
                <Layers className="w-3 h-3" />
                <span>Make Overlay</span>
              </button>
            )}
            {onExitBgToolMode && (
              <button
                type="button"
                onClick={onExitBgToolMode}
                className="px-2.5 py-1 rounded bg-amber-400 text-zinc-950 font-semibold text-[11px] hover:bg-amber-300 cursor-pointer shrink-0"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Stage Area */}
      <div
        onClick={() => {
          onSelectGlobalOverlay(null);
          onSelectPhotoOverlay?.(null);
          onSelectPhotoVisualOverlay?.(null);
        }}
        className="flex-1 min-h-0 overflow-auto studio-scroll flex items-center justify-center p-4 relative select-none"
      >
        <div
          ref={stageBoxRef}
          onClick={(e) => e.stopPropagation()}
          className="relative shadow-2xl border border-zinc-800/80 bg-zinc-950 overflow-hidden transition-transform duration-150 ease-out"
          style={{
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            maxWidth: zoom === 1 ? '100%' : `${zoom * 100}%`,
            maxHeight: zoom === 1 ? '100%' : `${zoom * 100}%`,
            width: canvasWidth >= canvasHeight ? 'min(100%, 740px)' : 'auto',
            height: canvasHeight > canvasWidth ? 'min(100%, 420px)' : 'auto',
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            backgroundImage: showTransparentChecker
              ? 'linear-gradient(45deg, #1f1f24 25%, transparent 25%), linear-gradient(-45deg, #1f1f24 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f1f24 75%), linear-gradient(-45deg, transparent 75%, #1f1f24 75%)'
              : undefined,
            backgroundSize: showTransparentChecker ? '18px 18px' : undefined,
            backgroundPosition: showTransparentChecker
              ? '0 0, 0 9px, 9px -9px, -9px 0'
              : undefined,
            backgroundColor: showTransparentChecker ? '#131317' : undefined,
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            onClick={() => {
              onSelectGlobalOverlay(null);
              onSelectPhotoOverlay?.(null);
              onSelectPhotoVisualOverlay?.(null);
            }}
            className="w-full h-full block object-contain"
          />

          {/* Cutout Eyedropper, Freehand Lasso & Smooth Brush Surface */}
          {isBgInteractive && !cropMode && !maskMode && (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                const box = stageBoxRef.current;
                if (!box) return;
                const rect = box.getBoundingClientRect();
                const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);

                if (bgEyedropperActive) {
                  onPickBgColorAtPoint?.(nx, ny);
                  return;
                }
                if (bgBrushMode === 'pick-keep' || bgBrushMode === 'pick-remove') {
                  onAddBgPickPoint?.({
                    id: `pick-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    x: Number(nx.toFixed(4)),
                    y: Number(ny.toFixed(4)),
                    action: bgBrushMode === 'pick-keep' ? 'keep' : 'remove',
                  });
                  return;
                }
                if (bgBrushMode === 'lasso') {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  paintingBrushRef.current = true;
                  const pt = { x: Number(nx.toFixed(4)), y: Number(ny.toFixed(4)) };
                  liveLassoPointsRef.current = [pt];
                  setLiveLassoPoints([pt]);
                  return;
                }
                if (bgBrushMode === 'keep' || bgBrushMode === 'erase') {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  paintingBrushRef.current = true;
                  strokeGroupIdRef.current = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                  lastBrushPtRef.current = { x: nx, y: ny };
                  const initialStroke: BgRemovalStroke = {
                    id: `bgst-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    x: Number(nx.toFixed(4)),
                    y: Number(ny.toFixed(4)),
                    radius: bgBrushSize,
                    action: bgBrushMode,
                    groupId: strokeGroupIdRef.current,
                  };
                  if (onAddBgStrokesBatch) {
                    onAddBgStrokesBatch([initialStroke]);
                  } else {
                    onAddBgStroke?.(initialStroke);
                  }
                }
              }}
              onPointerMove={(e) => {
                const box = stageBoxRef.current;
                if (!box) return;
                const rect = box.getBoundingClientRect();
                const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
                setBrushCursor({ x: nx, y: ny });

                if (!paintingBrushRef.current || bgBrushMode === 'none') return;

                if (bgBrushMode === 'lasso') {
                  const pts = liveLassoPointsRef.current;
                  const last = pts[pts.length - 1];
                  if (!last || Math.hypot(nx - last.x, ny - last.y) >= 0.008) {
                    const nextPt = { x: Number(nx.toFixed(4)), y: Number(ny.toFixed(4)) };
                    pts.push(nextPt);
                    setLiveLassoPoints([...pts]);
                  }
                  return;
                }

                if (bgBrushMode !== 'keep' && bgBrushMode !== 'erase') return;

                const last = lastBrushPtRef.current;
                if (!last) {
                  lastBrushPtRef.current = { x: nx, y: ny };
                  return;
                }
                const dist = Math.hypot(nx - last.x, ny - last.y);
                const step = Math.max(0.006, bgBrushSize * 0.28);
                if (dist < step) return;

                const steps = Math.min(18, Math.ceil(dist / step));
                const action = bgBrushMode;
                for (let s = 1; s <= steps; s++) {
                  const t = s / steps;
                  queuedStrokesRef.current.push({
                    id: `bgst-${Date.now()}-${s}-${Math.random().toString(36).slice(2, 5)}`,
                    x: Number((last.x + (nx - last.x) * t).toFixed(4)),
                    y: Number((last.y + (ny - last.y) * t).toFixed(4)),
                    radius: bgBrushSize,
                    action,
                    groupId: strokeGroupIdRef.current,
                  });
                }
                lastBrushPtRef.current = { x: nx, y: ny };

                if (brushRafRef.current === null) {
                  brushRafRef.current = requestAnimationFrame(() => {
                    brushRafRef.current = null;
                    if (queuedStrokesRef.current.length === 0) return;
                    const batch = queuedStrokesRef.current.splice(0, queuedStrokesRef.current.length);
                    if (onAddBgStrokesBatch) {
                      onAddBgStrokesBatch(batch);
                    } else if (onAddBgStroke) {
                      batch.forEach(onAddBgStroke);
                    }
                  });
                }
              }}
              onPointerUp={() => {
                paintingBrushRef.current = false;
                lastBrushPtRef.current = null;
                if (queuedStrokesRef.current.length > 0) {
                  const batch = queuedStrokesRef.current.splice(0, queuedStrokesRef.current.length);
                  if (onAddBgStrokesBatch) onAddBgStrokesBatch(batch);
                  else if (onAddBgStroke) batch.forEach(onAddBgStroke);
                }
                if (liveLassoPointsRef.current.length >= 3 && onAddBgDrawnPolygon) {
                  onAddBgDrawnPolygon({
                    id: `poly-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    action: 'keep',
                    points: liveLassoPointsRef.current,
                  });
                }
                liveLassoPointsRef.current = [];
                setLiveLassoPoints([]);
              }}
              onPointerLeave={() => {
                setBrushCursor(null);
              }}
              className={`absolute inset-0 z-30 touch-none ${
                bgEyedropperActive ||
                bgBrushMode === 'lasso' ||
                bgBrushMode === 'pick-keep' ||
                bgBrushMode === 'pick-remove'
                  ? 'cursor-crosshair'
                  : 'cursor-none'
              }`}
            >
              {(edits.bgRemoval?.pickPoints || []).map((pt) => (
                <div
                  key={pt.id}
                  style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 shadow-md flex items-center justify-center text-[11px] font-bold pointer-events-none ${
                    pt.action === 'keep'
                      ? 'border-emerald-300 bg-emerald-500/80 text-zinc-950'
                      : 'border-red-300 bg-red-500/85 text-white'
                  }`}
                >
                  {pt.action === 'keep' ? '+' : '−'}
                </div>
              ))}

              {liveLassoPoints.length >= 2 && (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <polygon
                    points={liveLassoPoints.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill="rgba(245, 158, 11, 0.16)"
                    stroke="#f59e0b"
                    strokeWidth="0.6"
                    strokeDasharray="1.6 1"
                  />
                </svg>
              )}

              {brushCursor && (bgBrushMode === 'keep' || bgBrushMode === 'erase') && (
                <div
                  style={{
                    left: `${brushCursor.x * 100}%`,
                    top: `${brushCursor.y * 100}%`,
                    width: `${bgBrushSize * 200}%`,
                    aspectRatio: '1 / 1',
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 pointer-events-none ${
                    bgBrushMode === 'keep'
                      ? 'border-emerald-400 bg-emerald-400/15'
                      : 'border-red-400 bg-red-400/15'
                  }`}
                />
              )}
            </div>
          )}

          {workspace === 'timeline' && !stageHasContent && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-zinc-950/95">
              <div className="w-11 h-11 rounded-xl border border-zinc-800 bg-zinc-900 text-amber-400 flex items-center justify-center mb-3">
                <Film className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Your timeline is empty</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                Upload the video clips or photos you have, or pick from the Media Library on the left.
              </p>
              <div className="flex items-center gap-2.5 mt-4">
                <button
                  type="button"
                  onClick={onImportMedia}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-zinc-50 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Your Clips</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenMediaDrawer}
                  className="px-3.5 py-2 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-amber-500 transition-colors cursor-pointer"
                >
                  Open Media Library
                </button>
              </div>
            </div>
          )}

          <canvas
            ref={originalCanvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className={`absolute inset-0 w-full h-full block pointer-events-none ${
              compareSplit ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              clipPath: compareSplit ? `inset(0 ${(1 - splitPos) * 100}% 0 0)` : undefined,
            }}
          />

          {compareSplit && (
            <>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 cursor-ew-resize touch-none z-30"
                style={{ left: `${splitPos * 100}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  draggingSplitRef.current = true;
                }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-amber-400 text-zinc-950 flex items-center justify-center shadow-lg text-[10px] font-bold">
                  ↔
                </div>
              </div>
              <div className="absolute top-2.5 left-2.5 px-2 py-0.5 text-[10px] font-mono bg-zinc-950/80 text-zinc-200 rounded pointer-events-none z-20">
                Original
              </div>
              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 text-[10px] font-mono bg-zinc-950/80 text-amber-300 rounded pointer-events-none z-20">
                Graded
              </div>
            </>
          )}

          {snapGuides.x !== null && (
            <div
              style={{ left: `${snapGuides.x * 100}%` }}
              className="absolute top-0 bottom-0 w-px border-l border-dashed border-amber-400 pointer-events-none z-20"
            />
          )}
          {snapGuides.y !== null && (
            <div
              style={{ top: `${snapGuides.y * 100}%` }}
              className="absolute left-0 right-0 h-px border-t border-dashed border-amber-400 pointer-events-none z-20"
            />
          )}

          {showGrid && !cropMode && !maskMode && (
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
            </div>
          )}

          {showSafeZones && !cropMode && !maskMode && (
            <div data-testid="ae-safe-zones" className="absolute inset-0 pointer-events-none z-10">
              {/* Action Safe 90% */}
              <div className="absolute inset-[5%] border border-amber-400/45">
                <span className="absolute top-1 left-1.5 text-[9px] font-mono text-amber-300/75 select-none">
                  90% ACTION SAFE
                </span>
              </div>
              {/* Title Safe 80% */}
              <div className="absolute inset-[10%] border border-dashed border-sky-400/50">
                <span className="absolute top-1 left-1.5 text-[9px] font-mono text-sky-300/75 select-none">
                  80% TITLE SAFE
                </span>
              </div>
              {/* AE Center Crosshair */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-px bg-amber-400/75" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-5 bg-amber-400/75" />
            </div>
          )}

          {/* Photo Lab visual / PiP overlay drag, scale & rotate targets */}
          {workspace === 'photo' &&
            !cropMode &&
            !maskMode &&
            (edits.visualOverlays || [])
              .filter((vov) => vov.kind === 'image')
              .map((vov) => {
                const isSelected = vov.id === selectedPhotoVisualOverlayId;
                return (
                  <div
                    key={vov.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectPhotoOverlay?.(null);
                      onSelectPhotoVisualOverlay?.(vov.id);
                      draggingOverlayRef.current = {
                        id: vov.id,
                        targetType: 'photo-visual',
                        mode: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        startScale: vov.scale,
                      };
                    }}
                    style={{
                      left: `${vov.x * 100}%`,
                      top: `${vov.y * 100}%`,
                      width: `${Math.min(82, 34 * vov.scale)}%`,
                      height: `${Math.min(72, 32 * vov.scale)}%`,
                      transform: `translate(-50%, -50%) rotate(${vov.rotation}deg)`,
                    }}
                    className={`group/vov absolute cursor-move touch-none z-20 rounded border transition-colors ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/5'
                        : 'border-transparent hover:border-amber-400/75 hover:bg-amber-400/5'
                    }`}
                  >
                    {isSelected && (
                      <>
                        <div
                          title="Drag to rotate"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            draggingOverlayRef.current = {
                              id: vov.id,
                              targetType: 'photo-visual',
                              mode: 'rotate',
                              startX: e.clientX,
                              startY: e.clientY,
                              startScale: vov.scale,
                            };
                          }}
                          className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-zinc-900 border border-amber-400 text-amber-400 flex items-center justify-center cursor-grab touch-none shadow"
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                        </div>
                        <div
                          title="Drag up/down to scale"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            draggingOverlayRef.current = {
                              id: vov.id,
                              targetType: 'photo-visual',
                              mode: 'scale',
                              startX: e.clientX,
                              startY: e.clientY,
                              startScale: vov.scale,
                            };
                          }}
                          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-xs bg-amber-400 border border-zinc-950 cursor-nwse-resize touch-none"
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemovePhotoVisualOverlay(vov.id);
                      }}
                      title="Remove overlay"
                      className={`${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover/vov:opacity-100'
                      } absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-red-400 flex items-center justify-center cursor-pointer transition-opacity`}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}

          {/* Photo Lab local text overlay drag, scale & rotate targets */}
          {workspace === 'photo' &&
            !cropMode &&
            !maskMode &&
            edits.overlays.map((ov) => {
              const sc = ov.scale ?? 1;
              const rot = ov.rotation ?? 0;
              const tX = ov.text3d?.tiltX ?? 0;
              const tY = ov.text3d?.tiltY ?? 0;
              const isSelected = ov.id === selectedPhotoOverlayId;
              const boxW = clamp(32 * sc, 16, 88);
              const boxH = clamp(14 * sc, 8, 56);
              return (
                <div
                  key={ov.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectPhotoOverlay?.(ov.id);
                    draggingOverlayRef.current = {
                      id: ov.id,
                      targetType: 'photo-text',
                      mode: 'move',
                      startX: e.clientX,
                      startY: e.clientY,
                      startScale: sc,
                      startTiltX: tX,
                      startTiltY: tY,
                    };
                  }}
                  style={{
                    left: `${ov.x * 100}%`,
                    top: `${ov.y * 100}%`,
                    width: `${boxW}%`,
                    height: `${boxH}%`,
                    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                  }}
                  className={`group/pov absolute cursor-move touch-none z-20 rounded border transition-colors ${
                    isSelected
                      ? 'border-amber-400 bg-amber-400/5'
                      : 'border-transparent hover:border-amber-400/70 hover:bg-amber-400/5'
                  }`}
                >
                  {isSelected && (
                    <>
                      <div
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap"
                      >
                        <div className="flex items-center rounded bg-zinc-950/95 border border-zinc-700 p-0.5 shadow">
                          {(['z', 'y', 'x'] as const).map((ax) => (
                            <button
                              key={ax}
                              type="button"
                              onClick={() => setTurnAxis(ax)}
                              title={`Turn ${ax.toUpperCase()} axis`}
                              className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded cursor-pointer ${
                                turnAxis === ax
                                  ? ax === 'y'
                                    ? 'bg-sky-500 text-zinc-950'
                                    : ax === 'x'
                                      ? 'bg-violet-400 text-zinc-950'
                                      : 'bg-amber-400 text-zinc-950'
                                  : 'text-zinc-400 hover:text-zinc-100'
                              }`}
                            >
                              {ax}
                            </button>
                          ))}
                        </div>
                        {onSetPhotoOverlayLayerOrder && (
                          <button
                            type="button"
                            onClick={() =>
                              onSetPhotoOverlayLayerOrder(
                                ov.id,
                                (ov.layerOrder || 'front') === 'behind' ? 'front' : 'behind'
                              )
                            }
                            title="Put text behind or in front of subject (B)"
                            className={`px-1.5 py-0.5 text-[9px] font-bold rounded border cursor-pointer shadow ${
                              (ov.layerOrder || 'front') === 'behind'
                                ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                                : 'bg-zinc-950/95 border-zinc-700 text-zinc-300 hover:border-amber-400 hover:text-amber-300'
                            }`}
                          >
                            {(ov.layerOrder || 'front') === 'behind' ? 'Behind' : 'Front'}
                          </button>
                        )}
                        <div
                          title={`Drag to turn ${turnAxis.toUpperCase()} axis`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            draggingOverlayRef.current = {
                              id: ov.id,
                              targetType: 'photo-text',
                              mode: 'rotate',
                              startX: e.clientX,
                              startY: e.clientY,
                              startScale: sc,
                              startTiltX: tX,
                              startTiltY: tY,
                            };
                          }}
                          className={`w-5 h-5 rounded-full bg-zinc-900 border flex items-center justify-center cursor-grab touch-none shadow ${
                            turnAxis === 'y'
                              ? 'border-sky-400 text-sky-300'
                              : turnAxis === 'x'
                                ? 'border-violet-400 text-violet-300'
                                : 'border-amber-400 text-amber-400'
                          }`}
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                        </div>
                        {dragAngleHint && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-amber-400/70 text-[10px] font-mono text-amber-300">
                            {dragAngleHint}
                          </span>
                        )}
                      </div>

                      <div
                        title="Drag left/right to turn Y axis"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          draggingOverlayRef.current = {
                            id: ov.id,
                            targetType: 'photo-text',
                            mode: 'rotate-y',
                            startX: e.clientX,
                            startY: e.clientY,
                            startScale: sc,
                            startTiltX: tX,
                            startTiltY: tY,
                          };
                        }}
                        className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-4 h-4 rounded-xs bg-zinc-950 border border-sky-400 text-sky-300 text-[9px] font-bold flex items-center justify-center cursor-ew-resize touch-none shadow"
                      >
                        Y
                      </div>

                      <div
                        title="Drag up/down to pitch X axis"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          draggingOverlayRef.current = {
                            id: ov.id,
                            targetType: 'photo-text',
                            mode: 'rotate-x',
                            startX: e.clientX,
                            startY: e.clientY,
                            startScale: sc,
                            startTiltX: tX,
                            startTiltY: tY,
                          };
                        }}
                        className="absolute top-1/2 -left-2.5 -translate-y-1/2 w-4 h-4 rounded-xs bg-zinc-950 border border-violet-400 text-violet-300 text-[9px] font-bold flex items-center justify-center cursor-ns-resize touch-none shadow"
                      >
                        X
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePhotoOverlay(ov.id);
                    }}
                    title="Remove text"
                    className={`${
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover/pov:opacity-100'
                    } absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-red-400 flex items-center justify-center cursor-pointer transition-opacity`}
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                  {isSelected && (
                    <div
                      title="Drag up/down to scale"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        draggingOverlayRef.current = {
                          id: ov.id,
                          targetType: 'photo-text',
                          mode: 'scale',
                          startX: e.clientX,
                          startY: e.clientY,
                          startScale: sc,
                        };
                      }}
                      className="absolute -bottom-1.5 -right-1.5 w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-xs bg-amber-400 border border-zinc-950 cursor-nwse-resize touch-none"
                    />
                  )}
                </div>
              );
            })}

          {/* Timeline Track T1 Keyframed Overlay Selection Boxes */}
          {workspace === 'timeline' &&
            !cropMode &&
            !maskMode &&
            visibleGlobalOverlays.map((ov) => {
              const isSelected = ov.id === selectedGlobalOverlayId;
              const evaluated = evaluateOverlayAtTime(ov, globalTime - ov.startTime);
              const boxW =
                ov.kind === 'mask'
                  ? Math.min(92, (ov.maskWidth ?? 0.48) * 100 * evaluated.scale)
                  : ov.kind === 'visual'
                    ? 24
                    : ov.kind === 'video'
                      ? Math.min(92, 46 * evaluated.scale)
                      : ov.kind === 'image'
                        ? Math.min(82, 34 * evaluated.scale)
                        : Math.min(84, 34 * evaluated.scale);
              const boxH =
                ov.kind === 'mask'
                  ? Math.min(92, (ov.maskHeight ?? 0.48) * 100 * evaluated.scale)
                  : ov.kind === 'visual'
                    ? 24
                    : ov.kind === 'video'
                      ? Math.min(85, 40 * evaluated.scale)
                      : ov.kind === 'image'
                        ? Math.min(72, 32 * evaluated.scale)
                        : Math.min(50, 14 * evaluated.scale);
              const isCircularMask =
                ov.kind === 'mask' && (ov.maskShape === 'circle' || ov.maskShape === 'ellipse');

              return (
                <div
                  key={ov.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectGlobalOverlay(ov.id);
                    draggingOverlayRef.current = {
                      id: ov.id,
                      targetType: 'global',
                      mode: 'move',
                      startX: e.clientX,
                      startY: e.clientY,
                      startScale: evaluated.scale,
                      startTiltX: evaluated.tiltX,
                      startTiltY: evaluated.tiltY,
                    };
                  }}
                  style={{
                    left: `${evaluated.x * 100}%`,
                    top: `${evaluated.y * 100}%`,
                    width: `${boxW}%`,
                    height: `${boxH}%`,
                    transform: `translate(-50%, -50%) rotate(${evaluated.rotation}deg)`,
                  }}
                  className={`absolute cursor-move touch-none z-20 border transition-colors ${
                    isCircularMask ? 'rounded-full' : 'rounded'
                  } ${
                    isSelected
                      ? ov.kind === 'mask'
                        ? 'border-amber-400 border-dashed bg-transparent'
                        : 'border-amber-400 bg-amber-400/5'
                      : 'border-transparent hover:border-white/35'
                  }`}
                >
                  {isSelected && (
                    <>
                      {/* Rotation knob (+ AE X/Y/Z axis selector for text) */}
                      {ov.kind === 'text' ? (
                        <>
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap"
                          >
                            <div className="flex items-center rounded bg-zinc-950/95 border border-zinc-700 p-0.5 shadow">
                              {(['z', 'y', 'x'] as const).map((ax) => (
                                <button
                                  key={ax}
                                  type="button"
                                  onClick={() => setTurnAxis(ax)}
                                  title={`Turn ${ax.toUpperCase()} axis`}
                                  className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded cursor-pointer ${
                                    turnAxis === ax
                                      ? ax === 'y'
                                        ? 'bg-sky-500 text-zinc-950'
                                        : ax === 'x'
                                          ? 'bg-violet-400 text-zinc-950'
                                          : 'bg-amber-400 text-zinc-950'
                                      : 'text-zinc-400 hover:text-zinc-100'
                                  }`}
                                >
                                  {ax}
                                </button>
                              ))}
                            </div>
                            {onSetSelectedOverlayLayerOrder && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSetSelectedOverlayLayerOrder(
                                    ov.id,
                                    (ov.layerOrder || 'front') === 'behind' ? 'front' : 'behind'
                                  )
                                }
                                title="Put text behind or in front of character (B)"
                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded border cursor-pointer shadow ${
                                  (ov.layerOrder || 'front') === 'behind'
                                    ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                                    : 'bg-zinc-950/95 border-zinc-700 text-zinc-300 hover:border-amber-400 hover:text-amber-300'
                                }`}
                              >
                                {(ov.layerOrder || 'front') === 'behind' ? 'Behind' : 'Front'}
                              </button>
                            )}
                            <div
                              title={`Drag to turn ${turnAxis.toUpperCase()} axis`}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                draggingOverlayRef.current = {
                                  id: ov.id,
                                  targetType: 'global',
                                  mode: 'rotate',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  startScale: evaluated.scale,
                                  startTiltX: evaluated.tiltX,
                                  startTiltY: evaluated.tiltY,
                                };
                              }}
                              className={`w-5 h-5 rounded-full bg-zinc-900 border flex items-center justify-center cursor-grab touch-none shadow ${
                                turnAxis === 'y'
                                  ? 'border-sky-400 text-sky-300'
                                  : turnAxis === 'x'
                                    ? 'border-violet-400 text-violet-300'
                                    : 'border-amber-400 text-amber-400'
                              }`}
                            >
                              <RotateCw className="w-2.5 h-2.5" />
                            </div>
                            {dragAngleHint && (
                              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-amber-400/70 text-[10px] font-mono text-amber-300">
                                {dragAngleHint}
                              </span>
                            )}
                          </div>

                          <div
                            title="Drag left/right to turn Y axis"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              draggingOverlayRef.current = {
                                id: ov.id,
                                targetType: 'global',
                                mode: 'rotate-y',
                                startX: e.clientX,
                                startY: e.clientY,
                                startScale: evaluated.scale,
                                startTiltX: evaluated.tiltX,
                                startTiltY: evaluated.tiltY,
                              };
                            }}
                            className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-4 h-4 rounded-xs bg-zinc-950 border border-sky-400 text-sky-300 text-[9px] font-bold flex items-center justify-center cursor-ew-resize touch-none shadow"
                          >
                            Y
                          </div>

                          <div
                            title="Drag up/down to pitch X axis"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              draggingOverlayRef.current = {
                                id: ov.id,
                                targetType: 'global',
                                mode: 'rotate-x',
                                startX: e.clientX,
                                startY: e.clientY,
                                startScale: evaluated.scale,
                                startTiltX: evaluated.tiltX,
                                startTiltY: evaluated.tiltY,
                              };
                            }}
                            className="absolute top-1/2 -left-2.5 -translate-y-1/2 w-4 h-4 rounded-xs bg-zinc-950 border border-violet-400 text-violet-300 text-[9px] font-bold flex items-center justify-center cursor-ns-resize touch-none shadow"
                          >
                            X
                          </div>
                        </>
                      ) : (
                        <div
                          title="Drag to rotate"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            draggingOverlayRef.current = {
                              id: ov.id,
                              targetType: 'global',
                              mode: 'rotate',
                              startX: e.clientX,
                              startY: e.clientY,
                              startScale: evaluated.scale,
                            };
                          }}
                          className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-zinc-900 border border-amber-400 text-amber-400 flex items-center justify-center cursor-grab touch-none shadow"
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                        </div>
                      )}
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteGlobalOverlay(ov.id);
                        }}
                        title="Remove overlay"
                        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-red-400 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                      <div
                        title="Drag up/down to scale"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          draggingOverlayRef.current = {
                            id: ov.id,
                            targetType: 'global',
                            mode: 'scale',
                            startX: e.clientX,
                            startY: e.clientY,
                            startScale: evaluated.scale,
                          };
                        }}
                        className="absolute -bottom-1.5 -right-1.5 w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-xs bg-amber-400 border border-zinc-950 cursor-nwse-resize touch-none"
                      />
                    </>
                  )}
                </div>
              );
            })}

          {/* Interactive Clip / Photo Shape Mask Handles */}
          {maskMode && !selectedMaskOverlay && activeMask.shape !== 'none' && (
            <div className="absolute inset-0 z-30 pointer-events-none">
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  draggingMaskRef.current = {
                    mode: 'move',
                    startX: e.clientX,
                    startY: e.clientY,
                    startMask: { ...activeMask },
                  };
                }}
                style={{
                  left: `${activeMask.x * 100}%`,
                  top: `${activeMask.y * 100}%`,
                  width: `${activeMask.width * 100}%`,
                  height: `${activeMask.height * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${activeMask.rotation}deg)`,
                }}
                className={`pointer-events-auto touch-none absolute border-2 border-dashed border-amber-400 cursor-move ${
                  activeMask.shape === 'circle' || activeMask.shape === 'ellipse'
                    ? 'rounded-full'
                    : 'rounded-md'
                }`}
              >
                {/* Center Reticle */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 border border-zinc-950 pointer-events-none" />

                {/* Top Rotation Knob */}
                <div
                  title="Drag to rotate mask"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    draggingMaskRef.current = {
                      mode: 'rotate',
                      startX: e.clientX,
                      startY: e.clientY,
                      startMask: { ...activeMask },
                    };
                  }}
                  className="absolute -top-7 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-zinc-900 border border-amber-400 text-amber-400 flex items-center justify-center cursor-grab touch-none shadow"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                </div>

                {/* Corner Resize Handles */}
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                  const posCls =
                    corner === 'nw'
                      ? '-top-1.5 -left-1.5 cursor-nwse-resize'
                      : corner === 'ne'
                        ? '-top-1.5 -right-1.5 cursor-nesw-resize'
                        : corner === 'sw'
                          ? '-bottom-1.5 -left-1.5 cursor-nesw-resize'
                          : '-bottom-1.5 -right-1.5 cursor-nwse-resize';
                  return (
                    <div
                      key={corner}
                      title="Drag to resize mask"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        draggingMaskRef.current = {
                          mode: 'resize',
                          startX: e.clientX,
                          startY: e.clientY,
                          startMask: { ...activeMask },
                        };
                      }}
                      className={`absolute w-4 h-4 sm:w-3.5 sm:h-3.5 bg-amber-400 border border-zinc-950 rounded-xs touch-none ${posCls}`}
                    />
                  );
                })}
              </div>

              <div className="pointer-events-auto absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 px-2.5 sm:px-3 py-1 rounded-md bg-zinc-950/90 border border-zinc-800 text-[10px] sm:text-[11px] text-zinc-200 flex items-center gap-2.5 sm:gap-3 shadow-lg whitespace-nowrap">
                <span className="hidden sm:inline">Drag center to move · Corners to resize · Knob to rotate</span>
                <span className="sm:hidden">Drag to move · Corners resize</span>
                <button
                  type="button"
                  onClick={onToggleMaskMode}
                  className="text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {cropMode && (
            <div className="absolute inset-0 z-30 bg-black/50">
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  draggingCropRef.current = {
                    mode: 'move',
                    startX: e.clientX,
                    startY: e.clientY,
                    startCrop: { ...crop },
                  };
                }}
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                }}
                className="absolute border-2 border-amber-400 bg-transparent cursor-move touch-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              >
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30 pointer-events-none" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30 pointer-events-none" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30 pointer-events-none" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30 pointer-events-none" />

                {(
                  [
                    { key: 'nw', cls: '-top-1.5 -left-1.5 cursor-nwse-resize' },
                    { key: 'ne', cls: '-top-1.5 -right-1.5 cursor-nesw-resize' },
                    { key: 'sw', cls: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
                    { key: 'se', cls: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
                  ] as const
                ).map((h) => (
                  <div
                    key={h.key}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      draggingCropRef.current = {
                        mode: h.key,
                        startX: e.clientX,
                        startY: e.clientY,
                        startCrop: { ...crop },
                      };
                    }}
                    className={`absolute w-4 h-4 sm:w-3.5 sm:h-3.5 bg-amber-400 border border-zinc-950 rounded-xs touch-none ${h.cls}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Photo Lab Quick Cutout & Framing Bar */}
      {workspace === 'photo' && (
        <div className="h-10 shrink-0 px-2.5 sm:px-4 border-t border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-2 sm:gap-3 overflow-x-auto studio-scroll">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!edits.bgRemoval?.enabled) {
                  onUpdateBgRemovalQuick?.({
                    ...DEFAULT_BG_REMOVAL,
                    ...(edits.bgRemoval || {}),
                    enabled: true,
                    mode: edits.bgRemoval?.mode || 'auto',
                    backdropMode:
                      !edits.bgRemoval?.backdropMode ||
                      edits.bgRemoval.backdropMode === 'original'
                        ? 'transparent'
                        : edits.bgRemoval.backdropMode,
                  });
                }
                onOpenCutoutMode?.();
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors cursor-pointer whitespace-nowrap ${
                edits.bgRemoval?.enabled
                  ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              <Scissors className="w-3 h-3 shrink-0" />
              <span>{edits.bgRemoval?.enabled ? 'BG Cutout On' : 'Remove BG'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdateBgRemovalQuick?.({
                  ...DEFAULT_BG_REMOVAL,
                  ...(edits.bgRemoval || {}),
                  enabled: true,
                  mode: 'auto',
                  backdropMode:
                    !edits.bgRemoval?.enabled || edits.bgRemoval?.backdropMode === 'original'
                      ? 'transparent'
                      : edits.bgRemoval.backdropMode,
                });
                onExitBgToolMode?.();
              }}
              className={`px-2 py-1 text-[11px] rounded border cursor-pointer whitespace-nowrap ${
                edits.bgRemoval?.enabled && edits.bgRemoval?.mode === 'auto'
                  ? 'border-amber-400 bg-amber-500/15 text-amber-300 font-medium'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100'
              }`}
            >
              Auto
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdateBgRemovalQuick?.({
                  ...DEFAULT_BG_REMOVAL,
                  ...(edits.bgRemoval || {}),
                  enabled: true,
                  mode: 'pick',
                  backdropMode:
                    !edits.bgRemoval?.enabled || edits.bgRemoval?.backdropMode === 'original'
                      ? 'transparent'
                      : edits.bgRemoval.backdropMode,
                });
                onSetBgBrushMode?.(bgBrushMode === 'pick-keep' ? 'none' : 'pick-keep');
              }}
              className={`px-2 py-1 text-[11px] rounded border cursor-pointer whitespace-nowrap ${
                bgBrushMode === 'pick-keep'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 font-medium'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100'
              }`}
            >
              Pick
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdateBgRemovalQuick?.({
                  ...DEFAULT_BG_REMOVAL,
                  ...(edits.bgRemoval || {}),
                  enabled: true,
                  mode: 'drawn',
                  backdropMode:
                    !edits.bgRemoval?.enabled || edits.bgRemoval?.backdropMode === 'original'
                      ? 'transparent'
                      : edits.bgRemoval.backdropMode,
                });
                onSetBgBrushMode?.(bgBrushMode === 'keep' ? 'none' : 'keep');
              }}
              className={`px-2 py-1 text-[11px] rounded border cursor-pointer whitespace-nowrap ${
                bgBrushMode === 'keep' || bgBrushMode === 'lasso'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 font-medium'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100'
              }`}
            >
              Draw
            </button>

            {edits.bgRemoval?.enabled && (
              <>
                <div className="flex items-center gap-0.5 bg-zinc-900 p-0.5 rounded border border-zinc-800">
                  {(
                    [
                      { id: 'transparent', label: 'Transparent' },
                      { id: 'blur', label: 'Blur BG' },
                      { id: 'color', label: 'Solid' },
                    ] as const
                  ).map((bd) => (
                    <button
                      key={bd.id}
                      type="button"
                      onClick={() =>
                        onUpdateBgRemovalQuick?.({ enabled: true, backdropMode: bd.id })
                      }
                      className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer whitespace-nowrap ${
                        edits.bgRemoval?.backdropMode === bd.id
                          ? 'bg-zinc-800 text-amber-400 font-medium'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {bd.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onExtractCutoutToOverlay?.()}
                  className="px-2 py-1 text-[11px] font-semibold rounded bg-amber-400 hover:bg-amber-300 text-zinc-950 cursor-pointer whitespace-nowrap"
                >
                  Make Overlay
                </button>
              </>
            )}

            {onTriggerTextBehindShortcut && (
              <button
                type="button"
                onClick={onTriggerTextBehindShortcut}
                title="Add or flip Text Behind Character (B)"
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded border border-amber-500/45 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 cursor-pointer whitespace-nowrap"
              >
                <Type className="w-3 h-3 shrink-0" />
                <span>Text Behind</span>
                <kbd className="hidden sm:inline px-1 rounded bg-zinc-950/80 border border-amber-500/35 text-[9px] font-mono text-amber-300">
                  B
                </kbd>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-zinc-500 whitespace-nowrap">Canvas:</span>
            {(['original', '9:16', '16:9', '4:5', '1:1'] as AspectRatioId[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => onChangePhotoAspect?.(ratio)}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  edits.transform.aspectRatio === ratio
                    ? 'bg-zinc-800 text-amber-400'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {ratio === 'original' ? 'Orig' : ratio}
              </button>
            ))}
            <button
              type="button"
              onClick={onToggleFitMode}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-zinc-300 hover:text-zinc-50 rounded bg-zinc-900 border border-zinc-800 cursor-pointer whitespace-nowrap"
            >
              <Maximize2 className="w-3 h-3" />
              <span>{edits.transform.fitMode === 'contain' ? 'Fit Frame' : 'Fill Frame'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Sequence Framing Bar (Timeline mode) */}
      {workspace === 'timeline' && (
        <div className="h-9 shrink-0 px-2.5 sm:px-4 border-t border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-2 sm:gap-4 overflow-x-auto studio-scroll">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[11px] text-zinc-500 mr-1 whitespace-nowrap">Canvas:</span>
            {(['9:16', '16:9', '1:1', '4:5', '2.39:1'] as AspectRatioId[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => onChangeSequenceAspect(ratio)}
                className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  sequenceAspect === ratio
                    ? 'bg-zinc-800 text-amber-400'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onTriggerTextBehindShortcut && (
              <button
                type="button"
                onClick={onTriggerTextBehindShortcut}
                title="Add or flip Text Behind Character (B)"
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded border border-amber-500/45 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 cursor-pointer whitespace-nowrap"
              >
                <Type className="w-3 h-3 shrink-0" />
                <span>Text Behind</span>
                <kbd className="hidden sm:inline px-1 rounded bg-zinc-950/80 border border-amber-500/35 text-[9px] font-mono text-amber-300">
                  B
                </kbd>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleFitMode}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-zinc-300 hover:text-zinc-50 rounded bg-zinc-900 border border-zinc-800 cursor-pointer whitespace-nowrap"
            >
              <Maximize2 className="w-3 h-3" />
              <span>{edits.transform.fitMode === 'contain' ? 'Fit Frame' : 'Fill Frame'}</span>
            </button>

            <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded border border-zinc-800">
              {(['blur', 'black', 'slate'] as CanvasBgMode[]).map((bg) => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => onChangeBgMode(bg)}
                  className={`px-2 py-0.5 text-[10px] rounded capitalize cursor-pointer whitespace-nowrap ${
                    edits.transform.bgMode === bg
                      ? 'bg-zinc-800 text-amber-400'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {bg === 'blur' ? 'Blur BG' : bg}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
