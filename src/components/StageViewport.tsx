import React, { useEffect, useRef, useState } from 'react';
import {
  CircleDot,
  Columns2,
  Crop,
  Film,
  Grid3x3,
  HelpCircle,
  Lock,
  Maximize2,
  Redo2,
  RotateCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DEFAULT_MASK } from '../data/presets';
import {
  AspectRatioId,
  CanvasBgMode,
  CropRect,
  EditDocument,
  MaskSettings,
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
    patch: { x?: number; y?: number; scale?: number; rotation?: number }
  ) => void;
  onDeleteGlobalOverlay: (id: string) => void;
  onMovePhotoOverlay: (id: string, x: number, y: number) => void;
  onRemovePhotoOverlay: (id: string) => void;
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
  onMovePhotoOverlay,
  onRemovePhotoOverlay,
  onSaveProject,
  onImportMedia,
  onOpenMediaDrawer,
  mobileInspectorOpen,
  onToggleMobileInspector,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [splitPos, setSplitPos] = useState<number>(0.5);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  });

  const stageBoxRef = useRef<HTMLDivElement>(null);
  const draggingSplitRef = useRef(false);
  const draggingOverlayRef = useRef<{
    id: string;
    isPhotoLocal: boolean;
    mode: 'move' | 'scale' | 'rotate';
    startY: number;
    startScale: number;
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

      if (draggingMaskRef.current) {
        const drag = draggingMaskRef.current;
        const { startX, startY, startMask } = drag;
        if (drag.mode === 'move') {
          let nx = clamp(startMask.x + (e.clientX - startX) / rect.width, 0.05, 0.95);
          let ny = clamp(startMask.y + (e.clientY - startY) / rect.height, 0.05, 0.95);
          const snapX = Math.abs(nx - 0.5) < 0.025;
          const snapY = Math.abs(ny - 0.5) < 0.025;
          if (snapX) nx = 0.5;
          if (snapY) ny = 0.5;
          setSnapGuides({ x: snapX, y: snapY });
          onChangeMask({ x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) });
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
          let nx = clamp((e.clientX - rect.left) / rect.width, 0.05, 0.95);
          let ny = clamp((e.clientY - rect.top) / rect.height, 0.05, 0.95);
          const snapX = Math.abs(nx - 0.5) < 0.025;
          const snapY = Math.abs(ny - 0.5) < 0.025;
          if (snapX) nx = 0.5;
          if (snapY) ny = 0.5;
          setSnapGuides({ x: snapX, y: snapY });
          if (drag.isPhotoLocal) {
            onMovePhotoOverlay(drag.id, nx, ny);
          } else {
            onMoveOrScaleOverlayAtPlayhead(drag.id, { x: nx, y: ny });
          }
        } else if (drag.mode === 'scale' && !drag.isPhotoLocal) {
          const delta = (e.clientY - drag.startY) / 140;
          const nextScale = clamp(Number((drag.startScale - delta).toFixed(2)), 0.3, 2.8);
          onMoveOrScaleOverlayAtPlayhead(drag.id, { scale: nextScale });
        } else if (drag.mode === 'rotate' && !drag.isPhotoLocal) {
          const ov = globalOverlays.find((o) => o.id === drag.id);
          if (ov) {
            const evaluated = evaluateOverlayAtTime(ov, globalTime - ov.startTime);
            const cx = rect.left + evaluated.x * rect.width;
            const cy = rect.top + evaluated.y * rect.height;
            const angle = Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90);
            const normalized = ((angle + 180) % 360) - 180;
            onMoveOrScaleOverlayAtPlayhead(drag.id, { rotation: normalized });
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
      draggingOverlayRef.current = null;
      draggingCropRef.current = null;
      draggingMaskRef.current = null;
      setSnapGuides({ x: false, y: false });
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
    globalOverlays,
    globalTime,
  ]);

  const crop = edits.transform.crop;
  const visibleGlobalOverlays =
    workspace === 'timeline'
      ? globalOverlays.filter(
          (o) => globalTime >= o.startTime && globalTime <= o.startTime + o.duration
        )
      : [];

  const stageHasContent = workspace === 'photo' || hasTimelineClips;

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

      {/* Main Stage Area */}
      <div
        onClick={() => onSelectGlobalOverlay(null)}
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
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            onClick={() => onSelectGlobalOverlay(null)}
            className="w-full h-full block object-contain"
          />

          {workspace === 'timeline' && !hasTimelineClips && (
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

          {snapGuides.x && (
            <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-amber-400 pointer-events-none z-20" />
          )}
          {snapGuides.y && (
            <div className="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-amber-400 pointer-events-none z-20" />
          )}

          {showGrid && !cropMode && !maskMode && (
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
            </div>
          )}

          {/* Photo Lab local overlay drag targets */}
          {workspace === 'photo' &&
            !cropMode &&
            !maskMode &&
            edits.overlays.map((ov) => (
              <div
                key={ov.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  draggingOverlayRef.current = {
                    id: ov.id,
                    isPhotoLocal: true,
                    mode: 'move',
                    startY: e.clientY,
                    startScale: 1,
                  };
                }}
                style={{ left: `${ov.x * 100}%`, top: `${ov.y * 100}%` }}
                className="group/pov absolute -translate-x-1/2 -translate-y-1/2 min-w-28 px-4 h-10 cursor-move touch-none z-20 rounded border border-transparent hover:border-amber-400/80 hover:bg-amber-400/5 transition-colors"
              >
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePhotoOverlay(ov.id);
                  }}
                  title="Remove caption"
                  className="opacity-0 group-hover/pov:opacity-100 absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-red-400 flex items-center justify-center cursor-pointer transition-opacity"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}

          {/* Timeline Track T1 Keyframed Overlay Selection Boxes (Text, Stickers & Mask Overlays) */}
          {workspace === 'timeline' &&
            !cropMode &&
            !maskMode &&
            visibleGlobalOverlays.map((ov) => {
              const isSelected = ov.id === selectedGlobalOverlayId;
              const evaluated = evaluateOverlayAtTime(ov, globalTime - ov.startTime);
              const boxW =
                ov.kind === 'mask'
                  ? Math.min(92, (ov.maskWidth ?? 0.48) * 100 * evaluated.scale)
                  : Math.min(84, 34 * evaluated.scale);
              const boxH =
                ov.kind === 'mask'
                  ? Math.min(92, (ov.maskHeight ?? 0.48) * 100 * evaluated.scale)
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
                      isPhotoLocal: false,
                      mode: 'move',
                      startY: e.clientY,
                      startScale: evaluated.scale,
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
                      {/* Rotation knob */}
                      <div
                        title="Drag to rotate"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          draggingOverlayRef.current = {
                            id: ov.id,
                            isPhotoLocal: false,
                            mode: 'rotate',
                            startY: e.clientY,
                            startScale: evaluated.scale,
                          };
                        }}
                        className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-zinc-900 border border-amber-400 text-amber-400 flex items-center justify-center cursor-grab touch-none shadow"
                      >
                        <RotateCw className="w-2.5 h-2.5" />
                      </div>
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
                            isPhotoLocal: false,
                            mode: 'scale',
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
