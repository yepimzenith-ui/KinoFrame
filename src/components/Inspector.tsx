import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Diamond,
  Eraser,
  Film,
  FlipHorizontal,
  FlipVertical,
  Lasso,
  Layers,
  Lock,
  MousePointerClick,
  Paintbrush,
  Pipette,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ASPECT_RATIO_OPTIONS,
  CLIP_ANIMATION_OPTIONS,
  DEFAULT_BG_REMOVAL,
  DEFAULT_COLOR_GRADE,
  DEFAULT_EFFECTS,
  DEFAULT_MASK,
  DEFAULT_TRANSFORM,
  FILM_PRESETS,
  MASK_SHAPE_OPTIONS,
  MIRROR_TILE_OPTIONS,
  DUOTONE_MAP_OPTIONS,
  OVERLAY_BLEND_MODES,
  VELOCITY_PRESETS,
  VISUAL_OVERLAY_PRESETS,
  normalizeTextEffects,
} from '../data/presets';
import {
  AspectRatioId,
  AudioClip,
  BgAutoSubjectType,
  BgBackdropMode,
  BgBrushToolMode,
  BgRemovalMode,
  BgRemovalSettings,
  ClipAnimationSettings,
  ClipAnimationType,
  ClipKeyframe,
  ColorGrade,
  EditDocument,
  EffectsSettings,
  InspectorTab,
  KeyframeEasing,
  MaskBgEffect,
  MaskSettings,
  MaskShape,
  OverlayAnimationType,
  OverlayBlendMode,
  OverlayLayerOrder,
  PhotoVisualOverlay,
  TextOverlay,
  TimelineClip,
  TimelineOverlayItem,
  TransformSettings,
  VelocityPresetId,
  VisualOverlayPresetId,
  WorkspaceMode,
} from '../types/editor';
import {
  evaluateClipKeyframes,
  evaluateOverlayAtTime,
  HistogramData,
} from '../utils/renderEngine';
import { clamp } from '../utils/timecode';
import { Histogram } from './Histogram';
import { TextEffectsEditor, UnifiedTextPatch } from './TextEffectsEditor';

interface InspectorProps {
  edits: EditDocument;
  activeTab: InspectorTab;
  workspace: WorkspaceMode;
  isAuthenticated: boolean;
  cropMode: boolean;
  maskMode: boolean;
  hasCopiedGrade: boolean;
  hasTimelineClips: boolean;
  histogramData: HistogramData | null;
  selectedOverlay: TimelineOverlayItem | null;
  selectedAudioClip: AudioClip | null;
  selectedClip: TimelineClip | null;
  globalTime: number;
  selectedClipStartTime: number;
  selectedClipLength: number;
  onSeek: (time: number) => void;
  onRequireAuth: (reason: string) => void;
  onClearSelectionFocus: () => void;
  onChangeTab: (tab: InspectorTab) => void;
  onToggleCropMode: (active: boolean) => void;
  onToggleMaskMode: (active: boolean) => void;
  onUpdateColor: (patch: Partial<ColorGrade>) => void;
  onApplyPreset: (presetId: string) => void;
  onUpdateTransform: (patch: Partial<TransformSettings>) => void;
  onUpdateMask: (patch: Partial<MaskSettings>) => void;
  bgBrushMode: BgBrushToolMode;
  bgBrushSize: number;
  bgEyedropperActive: boolean;
  onUpdateBgRemoval: (patch: Partial<BgRemovalSettings>) => void;
  onSetBgBrushMode: (mode: BgBrushToolMode) => void;
  onSetBgBrushSize: (size: number) => void;
  onToggleBgEyedropper: () => void;
  onClearBgStrokes: () => void;
  onUndoBgDraw: () => void;
  onExtractCutoutToOverlay: () => void;
  onAddTextBehindSubject: () => void;
  onSetAspectRatio: (ratio: AspectRatioId) => void;
  onUpdateEffects: (patch: Partial<EffectsSettings>) => void;
  onUpdateAnimation: (patch: Partial<ClipAnimationSettings>) => void;
  onUpdateClipMeta: (clipId: string, patch: Partial<TimelineClip>) => void;
  onConvertClipToOverlay?: (clipId: string) => void;
  onToggleClipKeyframe: () => void;
  onUpdateClipKeyframeValues: (patch: Partial<ClipKeyframe>) => void;
  onUpdateGlobalOverlay: (id: string, patch: Partial<TimelineOverlayItem>) => void;
  onToggleOverlayKeyframe: (id: string) => void;
  onUpdateOverlayMotionAtPlayhead: (
    id: string,
    patch: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      tiltX?: number;
      tiltY?: number;
      opacity?: number;
      scaleX?: number;
      scaleY?: number;
      shadowDepth?: number;
      glowIntensity?: number;
      effectIntensity?: number;
      charPhase?: number;
    }
  ) => void;
  onDuplicateGlobalOverlay: (id: string) => void;
  onDeleteGlobalOverlay: (id: string) => void;
  onUpdateAudioClip: (id: string, patch: Partial<AudioClip>) => void;
  onDeleteAudioClip: (id: string) => void;
  selectedPhotoOverlayId?: string | null;
  onSelectPhotoOverlay?: (id: string | null) => void;
  selectedPhotoVisualOverlayId?: string | null;
  onSelectPhotoVisualOverlay?: (id: string | null) => void;
  onAddPhotoTextOverlay: () => void;
  onUpdatePhotoTextOverlay: (id: string, patch: Partial<TextOverlay>) => void;
  onDuplicatePhotoTextOverlay: (id: string) => void;
  onReorderPhotoTextOverlay?: (id: string, dir: -1 | 1) => void;
  onRemovePhotoTextOverlay: (id: string) => void;
  onUpdatePhotoVisualOverlay: (id: string, patch: Partial<PhotoVisualOverlay>) => void;
  onRemovePhotoVisualOverlay: (id: string) => void;
  onOpenOverlaysDrawer: () => void;
  onCopyGrade: () => void;
  onPasteGrade: () => void;
  onResetAll: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  defaultValue = 0,
  onChange,
}) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-300">{label}</span>
        <button
          type="button"
          onDoubleClick={() => onChange(defaultValue)}
          title="Double-click to reset"
          className="font-mono text-[11px] text-zinc-400 hover:text-amber-400 tabular-nums cursor-pointer"
        >
          {value > 0 && min < 0 ? `+${value}` : value}
          {unit}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
        className="studio-slider"
      />
    </div>
  );
};

const AeMotionCurveGraph: React.FC<{
  mode: KeyframeEasing | VelocityPresetId;
}> = ({ mode }) => {
  const pathMap: Record<string, string> = {
    linear: 'M 4 34 L 92 6',
    'ease-out': 'M 4 34 C 22 8, 52 6, 92 6',
    'ease-in-out': 'M 4 34 C 40 34, 56 6, 92 6',
    punch: 'M 4 34 C 14 2, 34 2, 92 6',
    bounce: 'M 4 34 Q 34 2, 54 14 T 76 6 T 92 6',
    montage: 'M 4 34 C 28 32, 32 4, 54 6 S 76 32, 92 6',
    flash: 'M 4 34 C 8 2, 18 2, 92 6',
    hero: 'M 4 34 C 46 34, 50 4, 92 6',
    bullet: 'M 4 34 C 36 32, 42 30, 52 14 S 68 30, 92 6',
  };
  const d = pathMap[mode] || pathMap['ease-in-out'];
  return (
    <svg
      width={96}
      height={40}
      viewBox="0 0 96 40"
      aria-label={`Motion curve preview for ${mode}`}
      className="rounded border border-zinc-800 bg-zinc-950 shrink-0"
    >
      <line x1="0" y1="20" x2="96" y2="20" stroke="#27272a" strokeWidth="1" />
      <line x1="48" y1="0" x2="48" y2="40" stroke="#27272a" strokeWidth="1" />
      <path d={d} fill="none" stroke="#fbbf24" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="4" cy="34" r="2.2" fill="#f59e0b" />
      <circle cx="92" cy="6" r="2.2" fill="#f59e0b" />
    </svg>
  );
};

export const Inspector: React.FC<InspectorProps> = ({
  edits,
  activeTab,
  workspace,
  isAuthenticated,
  cropMode,
  maskMode,
  hasCopiedGrade,
  hasTimelineClips,
  histogramData,
  selectedOverlay,
  selectedAudioClip,
  selectedClip,
  globalTime,
  selectedClipStartTime,
  selectedClipLength,
  onSeek,
  onRequireAuth,
  onClearSelectionFocus,
  onChangeTab,
  onToggleCropMode,
  onToggleMaskMode,
  onUpdateColor,
  onApplyPreset,
  onUpdateTransform,
  onUpdateMask,
  bgBrushMode,
  bgBrushSize,
  bgEyedropperActive,
  onUpdateBgRemoval,
  onSetBgBrushMode,
  onSetBgBrushSize,
  onToggleBgEyedropper,
  onClearBgStrokes,
  onUndoBgDraw,
  onExtractCutoutToOverlay,
  onAddTextBehindSubject,
  onSetAspectRatio,
  onUpdateEffects,
  onUpdateAnimation,
  onUpdateClipMeta,
  onConvertClipToOverlay,
  onToggleClipKeyframe,
  onUpdateClipKeyframeValues,
  onUpdateGlobalOverlay,
  onToggleOverlayKeyframe,
  onUpdateOverlayMotionAtPlayhead,
  onDuplicateGlobalOverlay,
  onDeleteGlobalOverlay,
  onUpdateAudioClip,
  onDeleteAudioClip,
  selectedPhotoOverlayId = null,
  onSelectPhotoOverlay,
  selectedPhotoVisualOverlayId = null,
  onSelectPhotoVisualOverlay,
  onAddPhotoTextOverlay,
  onUpdatePhotoTextOverlay,
  onDuplicatePhotoTextOverlay,
  onReorderPhotoTextOverlay,
  onRemovePhotoTextOverlay,
  onUpdatePhotoVisualOverlay,
  onRemovePhotoVisualOverlay,
  onOpenOverlaysDrawer,
  onCopyGrade,
  onPasteGrade,
  onResetAll,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const asideClass = `${
    mobileOpen
      ? 'fixed lg:static inset-x-0 sm:left-auto sm:right-0 bottom-13 top-auto sm:top-14 lg:inset-auto max-h-[68dvh] sm:max-h-none z-40 flex rounded-t-xl sm:rounded-none border-t border-zinc-700 sm:border-t-0'
      : 'hidden lg:flex'
  } w-full sm:w-80 shrink-0 sm:border-l border-zinc-800 bg-zinc-950 flex-col min-h-0 shadow-2xl lg:shadow-none`;

  const mobileBar = mobileOpen && onCloseMobile ? (
    <div className="lg:hidden px-4 py-2 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 rounded-t-xl sm:rounded-none shrink-0">
      <span className="text-xs font-semibold text-zinc-200">Inspector</span>
      <button
        type="button"
        onClick={onCloseMobile}
        aria-label="Close inspector"
        className="flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
      >
        <span>Done</span>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : null;

  // 1. Track T1 Overlay & Keyframe Inspector (Text, Sticker, or Mask Overlay)
  if (workspace === 'timeline' && selectedOverlay) {
    const localTime = clamp(globalTime - selectedOverlay.startTime, 0, selectedOverlay.duration);
    const evaluated = evaluateOverlayAtTime(selectedOverlay, localTime);
    const sortedKfs = [...selectedOverlay.keyframes].sort((a, b) => a.time - b.time);
    const hasKfAtPlayhead = sortedKfs.some((k) => Math.abs(k.time - localTime) < 0.08);
    const prevKf = [...sortedKfs].reverse().find((k) => k.time < localTime - 0.08);
    const nextKf = sortedKfs.find((k) => k.time > localTime + 0.08);

    const overlayHeading =
      selectedOverlay.kind === 'mask'
        ? 'Mask Overlay'
        : selectedOverlay.kind === 'visual'
          ? 'Cinema Overlay'
          : selectedOverlay.kind === 'video'
            ? 'Video PiP Overlay'
            : selectedOverlay.kind === 'image'
              ? 'Image / Cutout Overlay'
              : selectedOverlay.kind === 'text'
                ? 'Text & Keyframes'
                : 'Sticker & Keyframes';

    return (
      <aside className={asideClass}>
        {mobileBar}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClearSelectionFocus}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-50 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Clip</span>
          </button>
          <span
            className={`text-xs font-semibold ${
              selectedOverlay.kind === 'mask' ? 'text-amber-400' : 'text-sky-400'
            }`}
          >
            {overlayHeading}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-5">
          {/* Keyframes Controller */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100">Keyframes</span>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                +{localTime.toFixed(2)}s / {selectedOverlay.duration.toFixed(1)}s
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!prevKf}
                onClick={() => prevKf && onSeek(selectedOverlay.startTime + prevKf.time)}
                title="Previous keyframe"
                className="p-1.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-35 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) {
                    onRequireAuth('Sign in or create an account to animate overlays with Keyframes.');
                    return;
                  }
                  onToggleOverlayKeyframe(selectedOverlay.id);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  hasKfAtPlayhead
                    ? 'border-amber-400 bg-amber-500 text-zinc-950'
                    : 'border-zinc-700 bg-zinc-950 text-zinc-100 hover:border-amber-400'
                }`}
              >
                {!isAuthenticated ? <Lock className="w-3 h-3 text-amber-400" /> : <Diamond className="w-3 h-3" />}
                <span>{hasKfAtPlayhead ? 'Remove Keyframe' : 'Add Keyframe'}</span>
              </button>

              <button
                type="button"
                disabled={!nextKf}
                onClick={() => nextKf && onSeek(selectedOverlay.startTime + nextKf.time)}
                title="Next keyframe"
                className="p-1.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-35 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {sortedKfs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sortedKfs.map((kf) => (
                  <button
                    key={kf.id}
                    type="button"
                    onClick={() => onSeek(selectedOverlay.startTime + kf.time)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded border cursor-pointer tabular-nums ${
                      Math.abs(kf.time - localTime) < 0.08
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    ◆ {kf.time.toFixed(2)}s
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400">Curve Easing (AE Graph)</label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {selectedOverlay.easing || 'ease-in-out'}
                  </span>
                </div>
                <AeMotionCurveGraph mode={selectedOverlay.easing || 'ease-in-out'} />
              </div>
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    { id: 'linear', label: 'Linear' },
                    { id: 'ease-out', label: 'Ease' },
                    { id: 'ease-in-out', label: 'Smooth' },
                    { id: 'punch', label: 'Punch' },
                    { id: 'bounce', label: 'Bounce' },
                  ] as { id: KeyframeEasing; label: string }[]
                ).map((es) => (
                  <button
                    key={es.id}
                    type="button"
                    onClick={() =>
                      onUpdateGlobalOverlay(selectedOverlay.id, { easing: es.id })
                    }
                    className={`py-1 text-[10px] rounded border cursor-pointer ${
                      (selectedOverlay.easing || 'ease-in-out') === es.id
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    {es.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-300 font-mono">
                  wiggle({(selectedOverlay.wiggleFreq ?? 3).toFixed(1)}, {Math.round(selectedOverlay.wiggleAmp ?? 0)})
                </span>
                {(selectedOverlay.wiggleAmp ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateGlobalOverlay(selectedOverlay.id, { wiggleAmp: 0 })
                    }
                    className="text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    Off
                  </button>
                )}
              </div>
              <SliderRow
                label="Wiggle Amp"
                value={Math.round(selectedOverlay.wiggleAmp ?? 0)}
                min={0}
                max={60}
                defaultValue={0}
                onChange={(v) =>
                  onUpdateGlobalOverlay(selectedOverlay.id, { wiggleAmp: v })
                }
              />
              <SliderRow
                label="Wiggle Freq"
                value={Number((selectedOverlay.wiggleFreq ?? 3).toFixed(1))}
                min={0.5}
                max={16}
                step={0.5}
                unit="Hz"
                defaultValue={3}
                onChange={(v) =>
                  onUpdateGlobalOverlay(selectedOverlay.id, { wiggleFreq: v })
                }
              />
            </div>
          </div>

          {/* Layer Depth Placement (Front vs Behind Cutout Subject) */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Layer Depth</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-400">
                {(selectedOverlay.layerOrder || 'front') === 'behind' ? 'Behind Subject' : 'In Front'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-950 rounded-md border border-zinc-800">
              {(
                [
                  { id: 'front', label: 'In Front' },
                  { id: 'behind', label: 'Behind Subject' },
                ] as { id: OverlayLayerOrder; label: string }[]
              ).map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() =>
                    onUpdateGlobalOverlay(selectedOverlay.id, { layerOrder: pos.id })
                  }
                  className={`py-1.5 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    (selectedOverlay.layerOrder || 'front') === pos.id
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          {(selectedOverlay.kind === 'visual' ||
            selectedOverlay.kind === 'image' ||
            selectedOverlay.kind === 'video') && (
            <div className="space-y-4">
              {(selectedOverlay.kind === 'video' || selectedOverlay.kind === 'image') && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-200">
                      {selectedOverlay.kind === 'video'
                        ? 'Video Overlay Controls'
                        : 'Image Overlay Cutout'}
                    </span>
                    {selectedOverlay.kind === 'video' && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateGlobalOverlay(selectedOverlay.id, {
                            muted: !selectedOverlay.muted,
                          })
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 bg-zinc-950 text-[11px] text-zinc-200 hover:border-amber-500 cursor-pointer"
                      >
                        {selectedOverlay.muted ? (
                          <>
                            <VolumeX className="w-3 h-3 text-zinc-500" />
                            <span>Muted</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3 text-amber-400" />
                            <span>Audio On</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const prevBg = selectedOverlay.bgRemoval || DEFAULT_BG_REMOVAL;
                      onUpdateGlobalOverlay(selectedOverlay.id, {
                        bgRemoval: {
                          ...prevBg,
                          enabled: !prevBg.enabled,
                          mode: prevBg.mode === 'drawn' ? 'auto' : prevBg.mode || 'auto',
                          backdropMode: 'transparent',
                        },
                      });
                    }}
                    className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded border text-xs font-medium transition-colors cursor-pointer ${
                      selectedOverlay.bgRemoval?.enabled
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                        : 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-amber-500'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>
                      {selectedOverlay.bgRemoval?.enabled
                        ? 'BG Removal Active'
                        : 'Remove Overlay Background'}
                    </span>
                  </button>

                  {selectedOverlay.bgRemoval?.enabled && (
                    <div className="space-y-2.5 pt-1 border-t border-zinc-800/80">
                      <div className="grid grid-cols-3 gap-1">
                        {(
                          [
                            { id: 'auto', label: 'Auto' },
                            { id: 'chroma', label: 'Color Key' },
                            { id: 'luma', label: 'Luma Key' },
                          ] as { id: BgRemovalMode; label: string }[]
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              onUpdateGlobalOverlay(selectedOverlay.id, {
                                bgRemoval: {
                                  ...(selectedOverlay.bgRemoval || DEFAULT_BG_REMOVAL),
                                  enabled: true,
                                  mode: m.id,
                                  backdropMode: 'transparent',
                                },
                              })
                            }
                            className={`py-1 text-[10px] rounded border cursor-pointer whitespace-nowrap ${
                              (selectedOverlay.bgRemoval?.mode || 'auto') === m.id
                                ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                                : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      {(selectedOverlay.bgRemoval.mode || 'auto') === 'auto' && (
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              { id: 'smart', label: 'Smart' },
                              { id: 'person', label: 'Person' },
                              { id: 'object', label: 'Object' },
                            ] as { id: BgAutoSubjectType; label: string }[]
                          ).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() =>
                                onUpdateGlobalOverlay(selectedOverlay.id, {
                                  bgRemoval: {
                                    ...(selectedOverlay.bgRemoval || DEFAULT_BG_REMOVAL),
                                    enabled: true,
                                    mode: 'auto',
                                    autoSubjectType: t.id,
                                    backdropMode: 'transparent',
                                  },
                                })
                              }
                              className={`py-1 text-[10px] rounded border cursor-pointer whitespace-nowrap ${
                                (selectedOverlay.bgRemoval?.autoSubjectType || 'smart') === t.id
                                  ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300 font-medium'
                                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}

                      <SliderRow
                        label="Threshold"
                        value={selectedOverlay.bgRemoval.tolerance}
                        min={5}
                        max={95}
                        unit="%"
                        defaultValue={38}
                        onChange={(v) =>
                          onUpdateGlobalOverlay(selectedOverlay.id, {
                            bgRemoval: {
                              ...(selectedOverlay.bgRemoval || DEFAULT_BG_REMOVAL),
                              enabled: true,
                              tolerance: v,
                            },
                          })
                        }
                      />
                      <SliderRow
                        label="Edge Feather"
                        value={selectedOverlay.bgRemoval.softness}
                        min={0}
                        max={80}
                        unit="%"
                        defaultValue={18}
                        onChange={(v) =>
                          onUpdateGlobalOverlay(selectedOverlay.id, {
                            bgRemoval: {
                              ...(selectedOverlay.bgRemoval || DEFAULT_BG_REMOVAL),
                              enabled: true,
                              softness: v,
                            },
                          })
                        }
                      />
                      <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOverlay.bgRemoval.invert}
                          onChange={(e) =>
                            onUpdateGlobalOverlay(selectedOverlay.id, {
                              bgRemoval: {
                                ...(selectedOverlay.bgRemoval || DEFAULT_BG_REMOVAL),
                                enabled: true,
                                invert: e.target.checked,
                              },
                            })
                          }
                          className="accent-amber-500"
                        />
                        <span>Invert Cutout</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {selectedOverlay.kind === 'visual' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">Overlay Effect</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {VISUAL_OVERLAY_PRESETS.map((vp) => (
                      <button
                        key={vp.id}
                        type="button"
                        onClick={() =>
                          onUpdateGlobalOverlay(selectedOverlay.id, {
                            visualOverlayId: vp.id as VisualOverlayPresetId,
                            overlayName: vp.name,
                          })
                        }
                        className={`px-2 py-1.5 text-[11px] rounded border text-left truncate cursor-pointer ${
                          selectedOverlay.visualOverlayId === vp.id
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                            : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        {vp.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">Blend Mode</label>
                <div className="flex flex-wrap gap-1.5">
                  {OVERLAY_BLEND_MODES.map((bm) => (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() =>
                        onUpdateGlobalOverlay(selectedOverlay.id, {
                          blendMode: bm.id as OverlayBlendMode,
                        })
                      }
                      className={`py-1.5 px-2.5 text-[11px] rounded border text-center cursor-pointer whitespace-nowrap ${
                        (selectedOverlay.blendMode ||
                          (selectedOverlay.kind === 'visual' ? 'screen' : 'normal')) === bm.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {bm.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedOverlay.kind === 'mask' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">Cutout Shape</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {MASK_SHAPE_OPTIONS.filter((m) => m.id !== 'none').map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        onUpdateGlobalOverlay(selectedOverlay.id, {
                          maskShape: m.id as Exclude<MaskShape, 'none'>,
                        })
                      }
                      className={`py-1.5 text-[11px] rounded border text-center cursor-pointer ${
                        selectedOverlay.maskShape === m.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <SliderRow
                label="Window Width"
                value={Math.round((selectedOverlay.maskWidth ?? 0.48) * 100)}
                min={10}
                max={120}
                unit="%"
                defaultValue={48}
                onChange={(v) =>
                  onUpdateGlobalOverlay(selectedOverlay.id, { maskWidth: v / 100 })
                }
              />
              <SliderRow
                label="Window Height"
                value={Math.round((selectedOverlay.maskHeight ?? 0.48) * 100)}
                min={10}
                max={120}
                unit="%"
                defaultValue={48}
                onChange={(v) =>
                  onUpdateGlobalOverlay(selectedOverlay.id, { maskHeight: v / 100 })
                }
              />
              <SliderRow
                label="Feather Softness"
                value={Math.round(selectedOverlay.maskFeather ?? 16)}
                min={0}
                max={80}
                unit="px"
                defaultValue={16}
                onChange={(v) => onUpdateGlobalOverlay(selectedOverlay.id, { maskFeather: v })}
              />

              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedOverlay.maskBorder)}
                    onChange={(e) =>
                      onUpdateGlobalOverlay(selectedOverlay.id, { maskBorder: e.target.checked })
                    }
                    className="accent-amber-500"
                  />
                  <span>Frame Outline</span>
                </label>

                <div className="flex items-center gap-1.5">
                  {['#050507', '#09090b', '#18181b', '#0c192c', '#2a1810'].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => onUpdateGlobalOverlay(selectedOverlay.id, { maskColor: hex })}
                      aria-label={`Matte color ${hex}`}
                      className={`w-5 h-5 rounded border cursor-pointer ${
                        selectedOverlay.maskColor === hex
                          ? 'border-amber-400 scale-110'
                          : 'border-zinc-700'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedOverlay.kind === 'text' && (
            <TextEffectsEditor
              text={selectedOverlay.text || ''}
              fontSize={selectedOverlay.fontSize || 44}
              fontFamily={selectedOverlay.fontFamily || 'inter'}
              letterSpacing={selectedOverlay.letterSpacing ?? 0}
              color={selectedOverlay.color || '#ffffff'}
              backdrop={Boolean(selectedOverlay.backdrop)}
              styleTemplate={selectedOverlay.styleTemplate || 'clean'}
              text3d={selectedOverlay.text3d}
              layerOrder={selectedOverlay.layerOrder || 'front'}
              blendMode={selectedOverlay.blendMode || 'normal'}
              x={evaluated.x}
              y={evaluated.y}
              scale={evaluated.scale}
              rotation={evaluated.rotation}
              tiltX={evaluated.tiltX}
              tiltY={evaluated.tiltY}
              opacity={evaluated.opacity}
              onDuplicate={() => onDuplicateGlobalOverlay(selectedOverlay.id)}
              onChange={(patch: UnifiedTextPatch) => {
                const motionPatch: {
                  x?: number;
                  y?: number;
                  scale?: number;
                  rotation?: number;
                  tiltX?: number;
                  tiltY?: number;
                  opacity?: number;
                } = {};
                const staticPatch: Partial<TimelineOverlayItem> = {};
                if (patch.x !== undefined) motionPatch.x = patch.x;
                if (patch.y !== undefined) motionPatch.y = patch.y;
                if (patch.scale !== undefined) motionPatch.scale = patch.scale;
                if (patch.rotation !== undefined) motionPatch.rotation = patch.rotation;
                if (patch.tiltX !== undefined) motionPatch.tiltX = patch.tiltX;
                if (patch.tiltY !== undefined) motionPatch.tiltY = patch.tiltY;
                if (patch.opacity !== undefined) motionPatch.opacity = patch.opacity;
                if (patch.text !== undefined) staticPatch.text = patch.text;
                if (patch.fontSize !== undefined) staticPatch.fontSize = patch.fontSize;
                if (patch.fontFamily !== undefined) staticPatch.fontFamily = patch.fontFamily;
                if (patch.letterSpacing !== undefined)
                  staticPatch.letterSpacing = patch.letterSpacing;
                if (patch.color !== undefined) staticPatch.color = patch.color;
                if (patch.backdrop !== undefined) staticPatch.backdrop = patch.backdrop;
                if (patch.styleTemplate !== undefined)
                  staticPatch.styleTemplate = patch.styleTemplate;
                if (patch.text3d !== undefined) {
                  if (selectedOverlay.keyframes.length === 0) {
                    staticPatch.text3d = patch.text3d;
                  } else if (motionPatch.tiltX === undefined && motionPatch.tiltY === undefined) {
                    staticPatch.text3d = patch.text3d;
                  } else {
                    const { tiltX: _tx, tiltY: _ty, ...rest3d } = patch.text3d;
                    staticPatch.text3d = {
                      ...normalizeTextEffects(selectedOverlay.text3d),
                      ...rest3d,
                    };
                  }
                }
                if (patch.layerOrder !== undefined) staticPatch.layerOrder = patch.layerOrder;
                if (patch.blendMode !== undefined) staticPatch.blendMode = patch.blendMode;

                if (Object.keys(staticPatch).length > 0) {
                  onUpdateGlobalOverlay(selectedOverlay.id, staticPatch);
                }
                if (Object.keys(motionPatch).length > 0) {
                  onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, motionPatch);
                }
              }}
            />
          )}

          <div className="space-y-3 border-t border-zinc-800/80 pt-4">
            <h3 className="text-xs font-semibold text-zinc-200">
              {selectedOverlay.kind === 'text' ? 'Keyframeable Motion & FX' : 'Transform Values'}
            </h3>
            <SliderRow
              label="Scale"
              value={Math.round(evaluated.scale * 100)}
              min={30}
              max={280}
              unit="%"
              defaultValue={100}
              onChange={(v) =>
                onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { scale: v / 100 })
              }
            />
            <SliderRow
              label={selectedOverlay.kind === 'text' ? 'Z Rotation' : 'Rotation'}
              value={Math.round(evaluated.rotation)}
              min={selectedOverlay.kind === 'text' ? -360 : -180}
              max={selectedOverlay.kind === 'text' ? 360 : 180}
              unit="°"
              onChange={(v) =>
                onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { rotation: v })
              }
            />
            {selectedOverlay.kind === 'text' && (
              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="X Rotation"
                  value={Math.round(evaluated.tiltX)}
                  min={-360}
                  max={360}
                  unit="°"
                  onChange={(v) =>
                    onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { tiltX: v })
                  }
                />
                <SliderRow
                  label="Y Rotation"
                  value={Math.round(evaluated.tiltY)}
                  min={-360}
                  max={360}
                  unit="°"
                  onChange={(v) =>
                    onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { tiltY: v })
                  }
                />
              </div>
            )}
            <SliderRow
              label={selectedOverlay.kind === 'mask' ? 'Matte Opacity' : 'Opacity'}
              value={Math.round(evaluated.opacity * 100)}
              min={0}
              max={100}
              unit="%"
              defaultValue={100}
              onChange={(v) =>
                onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { opacity: v / 100 })
              }
            />
            {selectedOverlay.kind === 'text' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <SliderRow
                    label="Scale X Keyframe"
                    value={Math.round(evaluated.scaleX * 100)}
                    min={25}
                    max={250}
                    unit="%"
                    defaultValue={100}
                    onChange={(v) =>
                      onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { scaleX: v / 100 })
                    }
                  />
                  <SliderRow
                    label="Scale Y Keyframe"
                    value={Math.round(evaluated.scaleY * 100)}
                    min={25}
                    max={250}
                    unit="%"
                    defaultValue={100}
                    onChange={(v) =>
                      onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { scaleY: v / 100 })
                    }
                  />
                </div>
                <SliderRow
                  label="3D Depth Keyframe"
                  value={Math.round(evaluated.shadowDepth)}
                  min={0}
                  max={60}
                  unit="px"
                  defaultValue={18}
                  onChange={(v) =>
                    onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { shadowDepth: v })
                  }
                />
                <SliderRow
                  label="Glow Keyframe"
                  value={Math.round(evaluated.glowIntensity)}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={0}
                  onChange={(v) =>
                    onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { glowIntensity: v })
                  }
                />
                <SliderRow
                  label="FX Intensity Keyframe"
                  value={Math.round(evaluated.effectIntensity)}
                  min={0}
                  max={150}
                  unit="%"
                  defaultValue={100}
                  onChange={(v) =>
                    onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { effectIntensity: v })
                  }
                />
                <SliderRow
                  label="Letter Anim Phase"
                  value={Math.round(evaluated.charPhase)}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={100}
                  onChange={(v) =>
                    onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { charPhase: v })
                  }
                />
              </>
            )}
            <SliderRow
              label="Duration"
              value={Number(selectedOverlay.duration.toFixed(1))}
              min={0.3}
              max={20}
              step={0.1}
              unit="s"
              defaultValue={3}
              onChange={(v) => onUpdateGlobalOverlay(selectedOverlay.id, { duration: v })}
            />
          </div>

          <div className="space-y-2 border-t border-zinc-800/80 pt-4">
            <h3 className="text-xs font-semibold text-zinc-200">Entry Animation</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'none', label: 'None' },
                  { id: 'fade', label: 'Fade In' },
                  { id: 'slide-up', label: 'Slide Up' },
                  { id: 'pop', label: 'Pop Scale' },
                ] as { id: OverlayAnimationType; label: string }[]
              ).map((anim) => (
                <button
                  key={anim.id}
                  type="button"
                  onClick={() =>
                    onUpdateGlobalOverlay(selectedOverlay.id, { animationIn: anim.id })
                  }
                  className={`py-1.5 px-2.5 text-xs rounded border text-left cursor-pointer ${
                    selectedOverlay.animationIn === anim.id
                      ? 'border-amber-500 bg-amber-500/10 text-zinc-50'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400'
                  }`}
                >
                  {anim.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={() => onDeleteGlobalOverlay(selectedOverlay.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40 rounded-md border border-red-900/40 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Overlay</span>
          </button>
        </div>
      </aside>
    );
  }

  // 2. Track A1 Audio Inspector
  if (workspace === 'timeline' && selectedAudioClip) {
    return (
      <aside className={asideClass}>
        {mobileBar}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClearSelectionFocus}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-50 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Clip</span>
          </button>
          <span className="text-xs font-semibold text-emerald-400">Audio Track</span>
        </div>

        <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-5">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{selectedAudioClip.name}</p>
            <p className="text-xs font-mono text-zinc-500 mt-0.5 tabular-nums">
              Starts {selectedAudioClip.startTime.toFixed(1)}s · Duration{' '}
              {(selectedAudioClip.trimEnd - selectedAudioClip.trimStart).toFixed(1)}s
            </p>
          </div>

          <div className="space-y-4 border-t border-zinc-800/80 pt-4">
            <SliderRow
              label="Volume"
              value={Math.round(selectedAudioClip.volume * 100)}
              min={0}
              max={150}
              unit="%"
              defaultValue={100}
              onChange={(v) => onUpdateAudioClip(selectedAudioClip.id, { volume: v / 100 })}
            />
            <SliderRow
              label="Fade In"
              value={Number(selectedAudioClip.fadeIn.toFixed(1))}
              min={0}
              max={3}
              step={0.1}
              unit="s"
              defaultValue={0}
              onChange={(v) => onUpdateAudioClip(selectedAudioClip.id, { fadeIn: v })}
            />
            <SliderRow
              label="Fade Out"
              value={Number(selectedAudioClip.fadeOut.toFixed(1))}
              min={0}
              max={3}
              step={0.1}
              unit="s"
              defaultValue={0}
              onChange={(v) => onUpdateAudioClip(selectedAudioClip.id, { fadeOut: v })}
            />
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateAudioClip(selectedAudioClip.id, { muted: !selectedAudioClip.muted })
            }
            className="w-full py-2 rounded-md border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-200 hover:border-zinc-700 flex items-center justify-center gap-2 cursor-pointer"
          >
            {selectedAudioClip.muted ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                <span>Unmute Audio</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mute Audio</span>
              </>
            )}
          </button>
        </div>

        <div className="p-3 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={() => onDeleteAudioClip(selectedAudioClip.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40 rounded-md border border-red-900/40 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Audio</span>
          </button>
        </div>
      </aside>
    );
  }

  // 3. Empty Timeline Inspector State
  if (workspace === 'timeline' && !hasTimelineClips) {
    return (
      <aside className={asideClass}>
        {mobileBar}
        <Histogram data={null} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2.5">
          <div className="w-10 h-10 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 flex items-center justify-center">
            <Film className="w-4 h-4" />
          </div>
          <p className="text-xs font-semibold text-zinc-200">No Clip Selected</p>
          <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[220px]">
            Import or add a video clip or photo to edit Color, Crop, Shape Masks, Optical FX, and Keyframes.
          </p>
        </div>
      </aside>
    );
  }

  // 4. Active Clip / Photo Inspector
  const clipLocalTime = clamp(globalTime - selectedClipStartTime, 0, selectedClipLength);
  const clipKfEval = selectedClip
    ? evaluateClipKeyframes(selectedClip.keyframes, selectedClip.keyframeEasing, clipLocalTime)
    : { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
  const clipHasKf = selectedClip
    ? selectedClip.keyframes.some((k) => Math.abs(k.time - clipLocalTime) < 0.08)
    : false;

  const activeMask = edits.mask || DEFAULT_MASK;
  const activeBg = edits.bgRemoval || DEFAULT_BG_REMOVAL;

  return (
    <aside className={asideClass}>
      {mobileBar}
      <Histogram data={histogramData} />

      <div className="px-2.5 py-2.5 border-b border-zinc-800">
        <div className="grid grid-cols-6 gap-0.5 p-1 bg-zinc-900 rounded-md">
          {(
            [
              { id: 'color', label: 'Color' },
              { id: 'transform', label: 'Crop' },
              { id: 'mask', label: 'Mask' },
              { id: 'cutout', label: 'Cutout' },
              { id: 'effects', label: 'FX' },
              { id: 'animate', label: workspace === 'timeline' ? 'Motion' : 'Layers' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onChangeTab(t.id);
                if (t.id !== 'transform' && cropMode) onToggleCropMode(false);
                if (t.id !== 'mask' && maskMode) onToggleMaskMode(false);
              }}
              className={`py-1.5 text-[10px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === t.id
                  ? 'bg-zinc-800 text-zinc-50'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-5">
        {activeTab === 'color' && (
          <>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-zinc-200">Film Stocks</h3>
                  {!isAuthenticated && <Lock className="w-3 h-3 text-amber-400" />}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateColor({ ...DEFAULT_COLOR_GRADE })}
                  className="text-[11px] text-zinc-500 hover:text-zinc-200 cursor-pointer whitespace-nowrap"
                >
                  Reset Color
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {FILM_PRESETS.map((preset) => {
                  const active = edits.color.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        if (!isAuthenticated) {
                          onRequireAuth(`Sign in or create an account to apply ${preset.name} Film Stock Presets.`);
                          return;
                        }
                        onApplyPreset(preset.id);
                      }}
                      className={`px-2.5 py-2 rounded-md border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-amber-500 bg-amber-500/10 text-zinc-50'
                          : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-medium truncate">{preset.name}</span>
                        {!isAuthenticated && <Lock className="w-2.5 h-2.5 text-amber-400/80 shrink-0" />}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                        {preset.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-zinc-800/80 pt-4 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-200">Light & Tone</h3>
              <SliderRow
                label="Exposure"
                value={edits.color.exposure}
                min={-100}
                max={100}
                onChange={(v) => onUpdateColor({ exposure: v })}
              />
              <SliderRow
                label="Contrast"
                value={edits.color.contrast}
                min={-100}
                max={100}
                onChange={(v) => onUpdateColor({ contrast: v })}
              />
              <SliderRow
                label="Highlights"
                value={edits.color.highlights}
                min={-100}
                max={100}
                onChange={(v) => onUpdateColor({ highlights: v })}
              />
              <SliderRow
                label="Shadows"
                value={edits.color.shadows}
                min={-100}
                max={100}
                onChange={(v) => onUpdateColor({ shadows: v })}
              />
              <SliderRow
                label="Fade"
                value={edits.color.fade}
                min={0}
                max={100}
                onChange={(v) => onUpdateColor({ fade: v })}
              />
            </div>

            <div className="border-t border-zinc-800/80 pt-4 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-200">White Balance & Chroma</h3>
              <SliderRow
                label="Temperature"
                value={edits.color.temperature}
                min={-100}
                max={100}
                onChange={(v) => onUpdateColor({ temperature: v })}
              />
              <SliderRow
                label="Tint"
                value={edits.color.tint}
                min={-100}
                max={100}
                onChange={(v) => onUpdateColor({ tint: v })}
              />
              <SliderRow
                label="Saturation"
                value={edits.color.saturation}
                min={-100}
                max={100}
                onChange={(v) => onUpdateColor({ saturation: v })}
              />
            </div>
          </>
        )}

        {activeTab === 'transform' && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-200">Crop & Ratio</h3>
                <button
                  type="button"
                  onClick={() => onToggleCropMode(!cropMode)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cropMode
                      ? 'bg-amber-500 text-zinc-950 border-amber-500'
                      : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {cropMode ? 'Done Cropping' : 'Edit Crop Box'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {ASPECT_RATIO_OPTIONS.map((opt) => {
                  const active = edits.transform.aspectRatio === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSetAspectRatio(opt.id)}
                      className={`py-1.5 px-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      {opt.id}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-zinc-800/80 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-200">Orientation</h3>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateTransform({
                      ...DEFAULT_TRANSFORM,
                      crop: { ...DEFAULT_TRANSFORM.crop },
                      kenBurns: edits.transform.kenBurns,
                    })
                  }
                  className="text-[11px] text-zinc-500 hover:text-zinc-200 cursor-pointer"
                >
                  Reset Geometry
                </button>
              </div>

              <SliderRow
                label="Straighten"
                value={edits.transform.straighten}
                min={-45}
                max={45}
                step={0.5}
                unit="°"
                onChange={(v) => onUpdateTransform({ straighten: v })}
              />

              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateTransform({ rotation: (edits.transform.rotation + 270) % 360 })
                  }
                  className="flex flex-col items-center gap-1 py-2 rounded-md border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 text-zinc-300 text-[11px] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>-90°</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateTransform({ rotation: (edits.transform.rotation + 90) % 360 })
                  }
                  className="flex flex-col items-center gap-1 py-2 rounded-md border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 text-zinc-300 text-[11px] cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>+90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateTransform({ flipH: !edits.transform.flipH })}
                  className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[11px] cursor-pointer ${
                    edits.transform.flipH
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Flip H</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateTransform({ flipV: !edits.transform.flipV })}
                  className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[11px] cursor-pointer ${
                    edits.transform.flipV
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  <FlipVertical className="w-3.5 h-3.5" />
                  <span>Flip V</span>
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'mask' && (
          <div className="space-y-4">
            {!isAuthenticated && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-amber-200 leading-tight">
                    Sign in to unlock Shape Masks & Blur Cutouts
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onRequireAuth('Sign in or create an account to use Shape Masks and Cutout Reveals.')
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-400 text-zinc-950 hover:bg-amber-300 shrink-0 cursor-pointer"
                >
                  Log In
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-200">Shape Mask</h3>
              <div className="flex items-center gap-2">
                {activeMask.shape !== 'none' && isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateMask({ ...DEFAULT_MASK });
                      if (maskMode) onToggleMaskMode(false);
                    }}
                    className="text-[11px] text-zinc-500 hover:text-zinc-200 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                {activeMask.shape !== 'none' && isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => onToggleMaskMode(!maskMode)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      maskMode
                        ? 'bg-amber-500 text-zinc-950 border-amber-500'
                        : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    <CircleDot className="w-3 h-3" />
                    <span>{maskMode ? 'Done' : 'Handles'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {MASK_SHAPE_OPTIONS.map((m) => {
                const active = activeMask.shape === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) {
                        onRequireAuth('Sign in or create an account to use Shape Masks.');
                        return;
                      }
                      onUpdateMask({ shape: m.id });
                      if (m.id === 'none') {
                        if (maskMode) onToggleMaskMode(false);
                      } else if (!maskMode) {
                        onToggleMaskMode(true);
                      }
                    }}
                    className={`py-2 px-1 text-[11px] rounded border text-center transition-colors cursor-pointer ${
                      active
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {activeMask.shape !== 'none' ? (
              <>
                <div className="border-t border-zinc-800/80 pt-4 space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">
                    Outside Mask Area
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { id: 'cutout', label: 'Cutout' },
                        { id: 'dim', label: 'Dim' },
                        { id: 'blur', label: 'Blur BG' },
                        { id: 'original', label: 'Original' },
                      ] as { id: MaskBgEffect; label: string }[]
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => onUpdateMask({ bgEffect: mode.id })}
                        className={`py-1.5 text-[10px] rounded border cursor-pointer ${
                          activeMask.bgEffect === mode.id
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                            : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-800/80 pt-4 space-y-3">
                  <SliderRow
                    label="Mask Width"
                    value={Math.round(activeMask.width * 100)}
                    min={8}
                    max={125}
                    unit="%"
                    defaultValue={56}
                    onChange={(v) => onUpdateMask({ width: v / 100 })}
                  />
                  <SliderRow
                    label="Mask Height"
                    value={Math.round(activeMask.height * 100)}
                    min={8}
                    max={125}
                    unit="%"
                    defaultValue={56}
                    onChange={(v) => onUpdateMask({ height: v / 100 })}
                  />
                  <SliderRow
                    label="Edge Feather"
                    value={activeMask.feather}
                    min={0}
                    max={80}
                    unit="px"
                    defaultValue={10}
                    onChange={(v) => onUpdateMask({ feather: v })}
                  />
                  <SliderRow
                    label="Mask Rotation"
                    value={activeMask.rotation}
                    min={-180}
                    max={180}
                    unit="°"
                    defaultValue={0}
                    onChange={(v) => onUpdateMask({ rotation: v })}
                  />
                  {activeMask.shape === 'rectangle' && (
                    <SliderRow
                      label="Corner Radius"
                      value={activeMask.cornerRadius}
                      min={0}
                      max={100}
                      unit="%"
                      defaultValue={16}
                      onChange={(v) => onUpdateMask({ cornerRadius: v })}
                    />
                  )}
                </div>

                <label className="flex items-center justify-between pt-1 text-xs text-zinc-300 cursor-pointer">
                  <span>Invert Mask (Cutout Inside)</span>
                  <input
                    type="checkbox"
                    checked={activeMask.invert}
                    onChange={(e) => onUpdateMask({ invert: e.target.checked })}
                    className="accent-amber-500"
                  />
                </label>
              </>
            ) : (
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Pick any shape above to isolate a subject, blur backgrounds, or grade inside a feathered split reveal.
              </p>
            )}
          </div>
        )}

        {activeTab === 'cutout' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                <h3 className="text-xs font-semibold text-zinc-200">Background Removal</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextEnabled = !activeBg.enabled;
                  onUpdateBgRemoval({
                    enabled: nextEnabled,
                    backdropMode:
                      nextEnabled && activeBg.backdropMode === 'original'
                        ? 'transparent'
                        : activeBg.backdropMode,
                  });
                  if (!nextEnabled) onSetBgBrushMode('none');
                }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeBg.enabled
                    ? 'bg-amber-400 text-zinc-950 border-amber-400'
                    : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-amber-500'
                }`}
              >
                {activeBg.enabled ? 'Active' : 'Enable'}
              </button>
            </div>

            {/* Auto vs Pick vs Drawn Primary Mode Switch */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  onUpdateBgRemoval({
                    enabled: true,
                    mode: 'auto',
                    backdropMode:
                      activeBg.backdropMode === 'original' ? 'transparent' : activeBg.backdropMode,
                  });
                  onSetBgBrushMode('none');
                }}
                className={`py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeBg.enabled && activeBg.mode === 'auto'
                    ? 'bg-amber-400 text-zinc-950'
                    : 'text-zinc-300 hover:text-zinc-100'
                }`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateBgRemoval({
                    enabled: true,
                    mode: 'pick',
                    backdropMode:
                      activeBg.backdropMode === 'original' ? 'transparent' : activeBg.backdropMode,
                  });
                  if (bgBrushMode !== 'pick-keep' && bgBrushMode !== 'pick-remove') {
                    onSetBgBrushMode('pick-keep');
                  }
                }}
                className={`py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeBg.enabled && activeBg.mode === 'pick'
                    ? 'bg-amber-400 text-zinc-950'
                    : 'text-zinc-300 hover:text-zinc-100'
                }`}
              >
                Pick Subject
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateBgRemoval({
                    enabled: true,
                    mode: 'drawn',
                    backdropMode:
                      activeBg.backdropMode === 'original' ? 'transparent' : activeBg.backdropMode,
                  });
                  if (
                    bgBrushMode === 'none' ||
                    bgBrushMode === 'pick-keep' ||
                    bgBrushMode === 'pick-remove'
                  ) {
                    onSetBgBrushMode('keep');
                  }
                }}
                className={`py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeBg.enabled && activeBg.mode === 'drawn'
                    ? 'bg-amber-400 text-zinc-950'
                    : 'text-zinc-300 hover:text-zinc-100'
                }`}
              >
                Draw
              </button>
            </div>

            {activeBg.mode === 'auto' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  <span>Auto Subject Focus</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'smart', label: 'Smart' },
                      { id: 'person', label: 'Person' },
                      { id: 'object', label: 'Object' },
                    ] as { id: BgAutoSubjectType; label: string }[]
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        onUpdateBgRemoval({
                          enabled: true,
                          mode: 'auto',
                          autoSubjectType: t.id,
                          backdropMode:
                            activeBg.backdropMode === 'original'
                              ? 'transparent'
                              : activeBg.backdropMode,
                        })
                      }
                      className={`py-1.5 text-[11px] rounded border cursor-pointer whitespace-nowrap ${
                        (activeBg.autoSubjectType || 'smart') === t.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-zinc-300">Pick Subject on Canvas</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateBgRemoval({
                      enabled: true,
                      mode:
                        activeBg.mode === 'drawn' || activeBg.mode === 'chroma' || activeBg.mode === 'luma'
                          ? 'pick'
                          : activeBg.mode,
                      backdropMode:
                        activeBg.backdropMode === 'original'
                          ? 'transparent'
                          : activeBg.backdropMode,
                    });
                    onSetBgBrushMode(bgBrushMode === 'pick-keep' ? 'none' : 'pick-keep');
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                    bgBrushMode === 'pick-keep'
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-emerald-500/60'
                  }`}
                >
                  <MousePointerClick className="w-3 h-3 shrink-0" />
                  <span>Keep +</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateBgRemoval({
                      enabled: true,
                      mode:
                        activeBg.mode === 'drawn' || activeBg.mode === 'chroma' || activeBg.mode === 'luma'
                          ? 'pick'
                          : activeBg.mode,
                      backdropMode:
                        activeBg.backdropMode === 'original'
                          ? 'transparent'
                          : activeBg.backdropMode,
                    });
                    onSetBgBrushMode(bgBrushMode === 'pick-remove' ? 'none' : 'pick-remove');
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                    bgBrushMode === 'pick-remove'
                      ? 'border-red-400 bg-red-500/20 text-red-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-red-500/60'
                  }`}
                >
                  <MousePointerClick className="w-3 h-3 shrink-0" />
                  <span>Remove -</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onExtractCutoutToOverlay}
                className="py-2 px-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Make Overlay
              </button>
              <button
                type="button"
                onClick={onAddTextBehindSubject}
                className="py-2 px-2.5 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Text Behind
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">Backdrop</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'transparent', label: 'Transparent BG' },
                    { id: 'blur', label: 'Portrait Blur' },
                    { id: 'color', label: 'Solid Color' },
                    { id: 'gradient', label: 'Studio Gradient' },
                    { id: 'original', label: 'Original Scene' },
                  ] as { id: BgBackdropMode; label: string }[]
                ).map((bd) => (
                  <button
                    key={bd.id}
                    type="button"
                    onClick={() =>
                      onUpdateBgRemoval({ enabled: true, backdropMode: bd.id })
                    }
                    className={`py-1.5 px-2 text-[11px] rounded border text-left cursor-pointer whitespace-nowrap ${
                      activeBg.enabled && activeBg.backdropMode === bd.id
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {bd.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 border-t border-zinc-800/80 pt-3">
              <label className="block text-xs font-medium text-zinc-300">Cutout Method</label>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { id: 'auto', label: 'Auto Subject' },
                    { id: 'pick', label: 'Pick Subject' },
                    { id: 'drawn', label: 'Drawn Mask' },
                    { id: 'chroma', label: 'Color Key' },
                    { id: 'luma', label: 'Luma Key' },
                  ] as { id: BgRemovalMode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onUpdateBgRemoval({
                        enabled: true,
                        mode: m.id,
                        backdropMode:
                          activeBg.backdropMode === 'original'
                            ? 'transparent'
                            : activeBg.backdropMode,
                      });
                      if (
                        m.id === 'pick' &&
                        bgBrushMode !== 'pick-keep' &&
                        bgBrushMode !== 'pick-remove'
                      ) {
                        onSetBgBrushMode('pick-keep');
                      } else if (m.id === 'drawn' && bgBrushMode === 'none') {
                        onSetBgBrushMode('keep');
                      }
                    }}
                    className={`py-1.5 text-[11px] rounded border cursor-pointer whitespace-nowrap ${
                      activeBg.mode === m.id
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {activeBg.mode === 'chroma' && (
              <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-zinc-300">Key Color</span>
                  <button
                    type="button"
                    onClick={onToggleBgEyedropper}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border cursor-pointer ${
                      bgEyedropperActive
                        ? 'border-amber-400 bg-amber-400 text-zinc-950'
                        : 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-amber-500'
                    }`}
                  >
                    <Pipette className="w-3 h-3" />
                    <span>{bgEyedropperActive ? 'Click Canvas' : 'Eyedropper'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {['#16a34a', '#2563eb', '#f4f4f5', '#09090b', '#38bdf8'].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => onUpdateBgRemoval({ enabled: true, chromaColor: hex })}
                      aria-label={`Key color ${hex}`}
                      className={`w-5 h-5 rounded border cursor-pointer ${
                        activeBg.chromaColor === hex ? 'border-amber-400 scale-110' : 'border-zinc-700'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <input
                    type="color"
                    value={activeBg.chromaColor}
                    onChange={(e) =>
                      onUpdateBgRemoval({ enabled: true, chromaColor: e.target.value })
                    }
                    className="w-5 h-5 rounded bg-transparent border border-zinc-700 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {activeBg.mode === 'luma' && (
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'bright', label: 'Remove Bright' },
                    { id: 'dark', label: 'Remove Dark' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateBgRemoval({ enabled: true, lumaTarget: opt.id })}
                    className={`py-1.5 text-[11px] rounded border cursor-pointer ${
                      activeBg.lumaTarget === opt.id
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t border-zinc-800/80 pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-300">Draw &amp; Touch-Up</span>
                {((activeBg.pickPoints?.length || 0) > 0 ||
                  (activeBg.strokes?.length || 0) > 0 ||
                  (activeBg.drawnPolygons?.length || 0) > 0) && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onUndoBgDraw}
                      className="text-[11px] text-zinc-300 hover:text-amber-300 cursor-pointer"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={onClearBgStrokes}
                      className="text-[11px] text-zinc-400 hover:text-red-300 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateBgRemoval({
                      enabled: true,
                      backdropMode:
                        activeBg.backdropMode === 'original' ? 'transparent' : activeBg.backdropMode,
                    });
                    onSetBgBrushMode(bgBrushMode === 'keep' ? 'none' : 'keep');
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                    bgBrushMode === 'keep'
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <Paintbrush className="w-3 h-3 shrink-0" />
                  <span>Paint +</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeBg.enabled || activeBg.mode !== 'drawn') {
                      onUpdateBgRemoval({
                        enabled: true,
                        mode: 'drawn',
                        backdropMode:
                          activeBg.backdropMode === 'original'
                            ? 'transparent'
                            : activeBg.backdropMode,
                      });
                    }
                    onSetBgBrushMode(bgBrushMode === 'lasso' ? 'none' : 'lasso');
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                    bgBrushMode === 'lasso'
                      ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <Lasso className="w-3 h-3 shrink-0" />
                  <span>Lasso</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateBgRemoval({
                      enabled: true,
                      backdropMode:
                        activeBg.backdropMode === 'original' ? 'transparent' : activeBg.backdropMode,
                    });
                    onSetBgBrushMode(bgBrushMode === 'erase' ? 'none' : 'erase');
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                    bgBrushMode === 'erase'
                      ? 'border-red-400 bg-red-500/20 text-red-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <Eraser className="w-3 h-3 shrink-0" />
                  <span>Erase -</span>
                </button>
              </div>
              {(bgBrushMode === 'keep' || bgBrushMode === 'erase') && (
                <SliderRow
                  label="Brush Size"
                  value={Math.round(bgBrushSize * 100)}
                  min={2}
                  max={14}
                  unit="%"
                  defaultValue={6}
                  onChange={(v) => onSetBgBrushSize(v / 100)}
                />
              )}
            </div>

            <div className="space-y-3 border-t border-zinc-800/80 pt-3">
              <SliderRow
                label="Threshold"
                value={activeBg.tolerance}
                min={5}
                max={95}
                unit="%"
                defaultValue={38}
                onChange={(v) => onUpdateBgRemoval({ enabled: true, tolerance: v })}
              />
              <SliderRow
                label="Edge Feather"
                value={activeBg.softness}
                min={0}
                max={80}
                unit="%"
                defaultValue={18}
                onChange={(v) => onUpdateBgRemoval({ enabled: true, softness: v })}
              />
              <SliderRow
                label="Shrink / Expand"
                value={activeBg.edgeShift}
                min={-40}
                max={40}
                defaultValue={0}
                onChange={(v) => onUpdateBgRemoval({ enabled: true, edgeShift: v })}
              />

              {(activeBg.backdropMode === 'color' || activeBg.backdropMode === 'gradient') && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-300">Backdrop Color</span>
                  <div className="flex items-center gap-1">
                    {['#09090b', '#f4f4f5', '#f59e0b', '#0f172a', '#7c2d12'].map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => onUpdateBgRemoval({ backdropColor: hex })}
                        className={`w-5 h-5 rounded border cursor-pointer ${
                          activeBg.backdropColor === hex
                            ? 'border-amber-400 scale-110'
                            : 'border-zinc-700'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                    <input
                      type="color"
                      value={activeBg.backdropColor}
                      onChange={(e) => onUpdateBgRemoval({ backdropColor: e.target.value })}
                      className="w-5 h-5 rounded bg-transparent border border-zinc-700 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {activeBg.backdropMode === 'blur' && (
                <SliderRow
                  label="Backdrop Blur"
                  value={activeBg.backdropBlur}
                  min={10}
                  max={100}
                  unit="%"
                  defaultValue={55}
                  onChange={(v) => onUpdateBgRemoval({ backdropBlur: v })}
                />
              )}

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeBg.invert}
                    onChange={(e) => onUpdateBgRemoval({ invert: e.target.checked })}
                    className="accent-amber-500"
                  />
                  <span>Invert Cutout</span>
                </label>
                {activeBg.enabled && (
                  <button
                    type="button"
                    onClick={() => onUpdateBgRemoval({ ...DEFAULT_BG_REMOVAL })}
                    className="text-[11px] text-zinc-500 hover:text-zinc-200 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'effects' && (
          <div className="space-y-3.5">
            {!isAuthenticated && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-amber-200 leading-tight">
                    Sign in to apply Action & Optical FX
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onRequireAuth(
                      'Sign in or create an account to use Camera Shake, Chromatic Split, Halation, Grain, and Optical FX.'
                    )
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-400 text-zinc-950 hover:bg-amber-300 shrink-0 cursor-pointer"
                >
                  Log In
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-200">Action & Optical FX</h3>
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => onUpdateEffects({ ...DEFAULT_EFFECTS })}
                  className="text-[11px] text-zinc-500 hover:text-zinc-200 cursor-pointer"
                >
                  Reset FX
                </button>
              )}
            </div>
            <div className={!isAuthenticated ? 'opacity-65 space-y-3.5' : 'space-y-3.5'}>
              <SliderRow
                label="Camera Shake"
                value={edits.effects.shake}
                min={0}
                max={100}
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateEffects({ shake: v })
                    : onRequireAuth('Sign in or create an account to use Camera Shake.')
                }
              />
              <SliderRow
                label="Chromatic Split"
                value={edits.effects.chromatic}
                min={0}
                max={100}
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateEffects({ chromatic: v })
                    : onRequireAuth('Sign in or create an account to use Chromatic Split.')
                }
              />
              <SliderRow
                label="Halation Bloom"
                value={edits.effects.halation}
                min={0}
                max={100}
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateEffects({ halation: v })
                    : onRequireAuth('Sign in or create an account to use Halation Bloom.')
                }
              />
              <SliderRow
                label="VHS Scanlines"
                value={edits.effects.scanlines}
                min={0}
                max={100}
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateEffects({ scanlines: v })
                    : onRequireAuth('Sign in or create an account to use VHS Scanlines.')
                }
              />
              <SliderRow
                label="Vignette"
                value={edits.effects.vignette}
                min={0}
                max={100}
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateEffects({ vignette: v })
                    : onRequireAuth('Sign in or create an account to use Vignette FX.')
                }
              />
              <SliderRow
                label="Film Grain"
                value={edits.effects.grain}
                min={0}
                max={100}
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateEffects({ grain: v })
                    : onRequireAuth('Sign in or create an account to use 35mm Film Grain.')
                }
              />
              <SliderRow
                label="Sharpen"
                value={edits.effects.sharpen}
                min={0}
                max={100}
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateEffects({ sharpen: v })
                    : onRequireAuth('Sign in or create an account to use Optical Sharpen.')
                }
              />
              <SliderRow
                label="Soft Blur"
                value={edits.effects.blur}
                min={0}
                max={16}
                step={0.5}
                unit="px"
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateEffects({ blur: v })
                    : onRequireAuth('Sign in or create an account to use Soft Blur FX.')
                }
              />
              <label className="flex items-center justify-between pt-1 text-xs text-zinc-300 cursor-pointer">
                <span>Impact Flash on Entry</span>
                <input
                  type="checkbox"
                  checked={edits.effects.flashIn}
                  onChange={(e) =>
                    isAuthenticated
                      ? onUpdateEffects({ flashIn: e.target.checked })
                      : onRequireAuth('Sign in or create an account to use Impact Flash FX.')
                  }
                  className="accent-amber-500"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                <span>2.39:1 Cinema Letterbox</span>
                <input
                  type="checkbox"
                  checked={edits.effects.letterbox}
                  onChange={(e) =>
                    isAuthenticated
                      ? onUpdateEffects({ letterbox: e.target.checked })
                      : onRequireAuth('Sign in or create an account to use Cinema Letterbox.')
                  }
                  className="accent-amber-500"
                />
              </label>

              <div className="pt-3 border-t border-zinc-800/80 space-y-3.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                  AE Optics &amp; VFX
                </h4>
                <SliderRow
                  label="Deep Glow"
                  value={edits.effects.glowBloom ?? 0}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    isAuthenticated
                      ? onUpdateEffects({ glowBloom: v })
                      : onRequireAuth('Sign in or create an account to use Deep Glow FX.')
                  }
                />
                <SliderRow
                  label="CC Radial Zoom Blur"
                  value={edits.effects.radialBlur ?? 0}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    isAuthenticated
                      ? onUpdateEffects({ radialBlur: v })
                      : onRequireAuth('Sign in or create an account to use CC Radial Zoom Blur.')
                  }
                />
                <SliderRow
                  label="Directional Motion Blur"
                  value={edits.effects.motionBlur ?? 0}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    isAuthenticated
                      ? onUpdateEffects({ motionBlur: v })
                      : onRequireAuth('Sign in or create an account to use Directional Motion Blur.')
                  }
                />
                <SliderRow
                  label="Digital Glitch"
                  value={edits.effects.glitch ?? 0}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    isAuthenticated
                      ? onUpdateEffects({ glitch: v })
                      : onRequireAuth('Sign in or create an account to use Digital Glitch FX.')
                  }
                />
                <SliderRow
                  label="Mosaic Pixelate"
                  value={edits.effects.pixelate ?? 0}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    isAuthenticated
                      ? onUpdateEffects({ pixelate: v })
                      : onRequireAuth('Sign in or create an account to use Mosaic Pixelate.')
                  }
                />
                <SliderRow
                  label="Posterize Levels"
                  value={edits.effects.posterize ?? 0}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    isAuthenticated
                      ? onUpdateEffects({ posterize: v })
                      : onRequireAuth('Sign in or create an account to use Posterize.')
                  }
                />

                <div className="space-y-1.5">
                  <span className="block text-xs text-zinc-300">Symmetry / Mirror Tile</span>
                  <div className="grid grid-cols-3 gap-1">
                    {MIRROR_TILE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          isAuthenticated
                            ? onUpdateEffects({ mirrorTile: opt.id })
                            : onRequireAuth('Sign in or create an account to use Mirror Tile FX.')
                        }
                        className={`py-1.5 px-1 text-[10px] rounded border cursor-pointer whitespace-nowrap ${
                          (edits.effects.mirrorTile || 'none') === opt.id
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs text-zinc-300">AE Gradient Map / Tritone</span>
                  <div className="flex flex-wrap gap-1">
                    {DUOTONE_MAP_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          isAuthenticated
                            ? onUpdateEffects({ duotone: opt.id })
                            : onRequireAuth('Sign in or create an account to use AE Gradient Maps.')
                        }
                        className={`py-1 px-2 text-[10px] rounded border cursor-pointer whitespace-nowrap ${
                          (edits.effects.duotone || 'none') === opt.id
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'animate' && workspace === 'timeline' && selectedClip && (
          <div className="space-y-4">
            {onConvertClipToOverlay && (
              <div className="rounded-lg border border-violet-500/35 bg-violet-500/10 p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-violet-200">Convert to Overlay</p>
                  <p className="text-[10px] text-zinc-400 truncate">
                    Move clip from Main track to PiP Overlay track
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onConvertClipToOverlay(selectedClip.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-violet-500 hover:bg-violet-400 text-zinc-950 text-[11px] font-semibold shrink-0 cursor-pointer whitespace-nowrap"
                >
                  <Layers className="w-3 h-3" />
                  <span>→ Overlay</span>
                </button>
              </div>
            )}

            {!isAuthenticated && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-amber-200 leading-tight">
                    Sign in to unlock Keyframes & Velocity Curves
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onRequireAuth(
                      'Sign in or create an account to unlock Clip Keyframes, Velocity Speed Curves, and Camera Motion.'
                    )
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-400 text-zinc-950 hover:bg-amber-300 shrink-0 cursor-pointer"
                >
                  Log In
                </button>
              </div>
            )}

            {/* Clip Transform Keyframes */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-100">Clip Keyframes</span>
                <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                  +{clipLocalTime.toFixed(2)}s
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) {
                    onRequireAuth('Sign in or create an account to add Clip Keyframes.');
                    return;
                  }
                  onToggleClipKeyframe();
                }}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                  clipHasKf
                    ? 'border-amber-400 bg-amber-500 text-zinc-950'
                    : 'border-zinc-700 bg-zinc-950 text-zinc-100 hover:border-amber-400'
                }`}
              >
                {!isAuthenticated ? <Lock className="w-3 h-3 text-amber-400" /> : <Diamond className="w-3 h-3" />}
                <span>{clipHasKf ? 'Remove Clip Keyframe' : 'Add Clip Keyframe'}</span>
              </button>

              <SliderRow
                label="Zoom Scale"
                value={Math.round(clipKfEval.scale * 100)}
                min={60}
                max={240}
                unit="%"
                defaultValue={100}
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateClipKeyframeValues({ scale: v / 100 })
                    : onRequireAuth('Sign in or create an account to keyframe clip zoom.')
                }
              />
              <SliderRow
                label="Pan X"
                value={Math.round(clipKfEval.offsetX * 100)}
                min={-40}
                max={40}
                unit="%"
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateClipKeyframeValues({ offsetX: v / 100 })
                    : onRequireAuth('Sign in or create an account to keyframe clip pan.')
                }
              />
              <SliderRow
                label="Tilt Angle"
                value={Math.round(clipKfEval.rotation)}
                min={-30}
                max={30}
                unit="°"
                onChange={(v) =>
                  isAuthenticated
                    ? onUpdateClipKeyframeValues({ rotation: v })
                    : onRequireAuth('Sign in or create an account to keyframe clip rotation.')
                }
              />
            </div>

            {/* Velocity Speed Curve */}
            <div className="border-t border-zinc-800/80 pt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-200">Velocity Speed Curve</h3>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {selectedClip.velocityPreset}
                  </span>
                </div>
                <AeMotionCurveGraph mode={selectedClip.velocityPreset} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {VELOCITY_PRESETS.map((vp) => (
                  <button
                    key={vp.id}
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) {
                        onRequireAuth('Sign in or create an account to use Velocity Speed Curves.');
                        return;
                      }
                      onUpdateClipMeta(selectedClip.id, {
                        velocityPreset: vp.id as VelocityPresetId,
                      });
                    }}
                    className={`py-1.5 px-2.5 text-left rounded border cursor-pointer ${
                      selectedClip.velocityPreset === vp.id
                        ? 'border-amber-500 bg-amber-500/10 text-zinc-50'
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="text-xs font-medium">{vp.label}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{vp.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-800/80 pt-4 space-y-2.5">
              <h3 className="text-xs font-semibold text-zinc-200">In / Out Animation</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {CLIP_ANIMATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) {
                        onRequireAuth('Sign in or create an account to use Clip In/Out Animations.');
                        return;
                      }
                      onUpdateAnimation({ inType: opt.id as ClipAnimationType });
                    }}
                    className={`py-1.5 px-2.5 text-xs rounded border text-left cursor-pointer ${
                      edits.animation.inType === opt.id
                        ? 'border-amber-500 bg-amber-500/10 text-zinc-50'
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-800/80 pt-4 space-y-2.5">
              <h3 className="text-xs font-semibold text-zinc-200">Camera Motion</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'none', label: 'Static' },
                    { id: 'zoom-in', label: 'Slow Zoom In' },
                    { id: 'zoom-out', label: 'Slow Zoom Out' },
                    { id: 'pan-right', label: 'Track Pan' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) {
                        onRequireAuth('Sign in or create an account to use Camera Motion.');
                        return;
                      }
                      onUpdateTransform({ kenBurns: m.id });
                    }}
                    className={`py-1.5 px-2.5 text-xs rounded border text-left cursor-pointer ${
                      edits.transform.kenBurns === m.id
                        ? 'border-amber-500 bg-amber-500/10 text-zinc-50'
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Photo Lab Layers & Text Tab */}
        {activeTab === 'animate' && workspace === 'photo' && (
          <div className="space-y-5">
            {/* Visual & Image Overlays */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-200">Photo Overlays</h3>
                <button
                  type="button"
                  onClick={onOpenOverlaysDrawer}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-100 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Overlay</span>
                </button>
              </div>

              {(edits.visualOverlays || []).length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Layer Light Leaks, 35mm Dust, Film Frames, or custom PNG/PiP images over your photo.
                </p>
              ) : (
                (edits.visualOverlays || []).map((vov) => {
                  const isVovSelected = vov.id === selectedPhotoVisualOverlayId;
                  const vovBg = vov.bgRemoval || DEFAULT_BG_REMOVAL;
                  return (
                    <div
                      key={vov.id}
                      onClick={() => onSelectPhotoVisualOverlay?.(vov.id)}
                      className={`rounded-lg border p-3 space-y-3 transition-colors ${
                        isVovSelected
                          ? 'border-amber-500 bg-zinc-900/80'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {vov.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemovePhotoVisualOverlay(vov.id);
                          }}
                          aria-label={`Remove ${vov.name}`}
                          className="p-1 text-zinc-400 hover:text-red-400 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {vov.kind === 'image' && (
                        <div className="space-y-2.5 rounded-md border border-zinc-800 bg-zinc-950/70 p-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdatePhotoVisualOverlay(vov.id, {
                                bgRemoval: {
                                  ...vovBg,
                                  enabled: !vovBg.enabled,
                                  mode: vovBg.mode === 'drawn' ? 'auto' : vovBg.mode || 'auto',
                                  backdropMode: 'transparent',
                                },
                              });
                            }}
                            className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              vovBg.enabled
                                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-amber-500'
                            }`}
                          >
                            <Scissors className="w-3.5 h-3.5" />
                            <span>
                              {vovBg.enabled ? 'BG Removal Active' : 'Remove Overlay Background'}
                            </span>
                          </button>

                          {vovBg.enabled && (
                            <div className="space-y-2 pt-1 border-t border-zinc-800/80">
                              <div className="grid grid-cols-3 gap-1">
                                {(
                                  [
                                    { id: 'auto', label: 'Auto' },
                                    { id: 'chroma', label: 'Color Key' },
                                    { id: 'luma', label: 'Luma Key' },
                                  ] as { id: BgRemovalMode; label: string }[]
                                ).map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdatePhotoVisualOverlay(vov.id, {
                                        bgRemoval: {
                                          ...vovBg,
                                          enabled: true,
                                          mode: m.id,
                                          backdropMode: 'transparent',
                                        },
                                      });
                                    }}
                                    className={`py-1 text-[10px] rounded border cursor-pointer whitespace-nowrap ${
                                      vovBg.mode === m.id
                                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100'
                                    }`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>

                              {vovBg.mode === 'auto' && (
                                <div className="grid grid-cols-3 gap-1">
                                  {(
                                    [
                                      { id: 'smart', label: 'Smart' },
                                      { id: 'person', label: 'Person' },
                                      { id: 'object', label: 'Object' },
                                    ] as { id: BgAutoSubjectType; label: string }[]
                                  ).map((t) => (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdatePhotoVisualOverlay(vov.id, {
                                          bgRemoval: {
                                            ...vovBg,
                                            enabled: true,
                                            mode: 'auto',
                                            autoSubjectType: t.id,
                                            backdropMode: 'transparent',
                                          },
                                        });
                                      }}
                                      className={`py-1 text-[10px] rounded border cursor-pointer whitespace-nowrap ${
                                        (vovBg.autoSubjectType || 'smart') === t.id
                                          ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300 font-medium'
                                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100'
                                      }`}
                                    >
                                      {t.label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <SliderRow
                                label="Threshold"
                                value={vovBg.tolerance}
                                min={5}
                                max={95}
                                unit="%"
                                defaultValue={38}
                                onChange={(val) =>
                                  onUpdatePhotoVisualOverlay(vov.id, {
                                    bgRemoval: { ...vovBg, enabled: true, tolerance: val },
                                  })
                                }
                              />
                              <SliderRow
                                label="Edge Feather"
                                value={vovBg.softness}
                                min={0}
                                max={80}
                                unit="%"
                                defaultValue={18}
                                onChange={(val) =>
                                  onUpdatePhotoVisualOverlay(vov.id, {
                                    bgRemoval: { ...vovBg, enabled: true, softness: val },
                                  })
                                }
                              />
                              <label
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={vovBg.invert}
                                  onChange={(e) =>
                                    onUpdatePhotoVisualOverlay(vov.id, {
                                      bgRemoval: {
                                        ...vovBg,
                                        enabled: true,
                                        invert: e.target.checked,
                                      },
                                    })
                                  }
                                  className="accent-amber-500"
                                />
                                <span>Invert Cutout</span>
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-950 rounded border border-zinc-800">
                        {(
                          [
                            { id: 'front', label: 'In Front' },
                            { id: 'behind', label: 'Behind Subject' },
                          ] as { id: OverlayLayerOrder; label: string }[]
                        ).map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() =>
                              onUpdatePhotoVisualOverlay(vov.id, { layerOrder: pos.id })
                            }
                            className={`py-1 text-[10px] font-medium rounded cursor-pointer whitespace-nowrap ${
                              (vov.layerOrder || 'front') === pos.id
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {OVERLAY_BLEND_MODES.map((bm) => (
                          <button
                            key={bm.id}
                            type="button"
                            onClick={() =>
                              onUpdatePhotoVisualOverlay(vov.id, { blendMode: bm.id })
                            }
                            className={`py-1 px-2 text-[10px] rounded border cursor-pointer whitespace-nowrap ${
                              vov.blendMode === bm.id
                                ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                                : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                            }`}
                          >
                            {bm.label}
                          </button>
                        ))}
                      </div>

                      <SliderRow
                        label="Opacity"
                        value={Math.round(vov.opacity * 100)}
                        min={5}
                        max={100}
                        unit="%"
                        defaultValue={78}
                        onChange={(val) =>
                          onUpdatePhotoVisualOverlay(vov.id, { opacity: val / 100 })
                        }
                      />
                      <SliderRow
                        label="Scale"
                        value={Math.round(vov.scale * 100)}
                        min={25}
                        max={250}
                        unit="%"
                        defaultValue={100}
                        onChange={(val) =>
                          onUpdatePhotoVisualOverlay(vov.id, { scale: val / 100 })
                        }
                      />
                      <SliderRow
                        label="Rotation"
                        value={Math.round(vov.rotation)}
                        min={-180}
                        max={180}
                        unit="°"
                        defaultValue={0}
                        onChange={(val) =>
                          onUpdatePhotoVisualOverlay(vov.id, { rotation: val })
                        }
                      />
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-zinc-800/80 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-zinc-200">Photo Typography</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onAddTextBehindSubject}
                    className="px-2 py-1 text-[11px] font-semibold rounded bg-amber-400 hover:bg-amber-300 text-zinc-950 cursor-pointer whitespace-nowrap"
                  >
                    Behind Subject
                  </button>
                  <button
                    type="button"
                    onClick={onAddPhotoTextOverlay}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {edits.overlays.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Add titles in front or behind your isolated subject and drag them anywhere on the canvas.
                </p>
              ) : (
                edits.overlays.map((ov, idx) => {
                  const isExpanded =
                    selectedPhotoOverlayId === ov.id ||
                    (!selectedPhotoOverlayId && idx === edits.overlays.length - 1);
                  const fxPreview = normalizeTextEffects(ov.text3d);
                  return (
                    <div
                      key={ov.id}
                      className={`rounded-lg border transition-colors ${
                        isExpanded
                          ? 'border-amber-500/60 bg-zinc-900/60'
                          : 'border-zinc-800 bg-zinc-900/35 hover:border-zinc-700'
                      }`}
                    >
                      <div
                        onClick={() => onSelectPhotoOverlay?.(ov.id)}
                        className="flex items-center justify-between gap-2 px-2.5 py-2 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-zinc-700 shrink-0"
                            style={{ backgroundColor: ov.color }}
                          />
                          <span className="text-xs font-medium text-zinc-100 truncate">
                            {ov.text || 'Untitled Text'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-400 shrink-0">
                            {ov.layerOrder === 'behind'
                              ? 'Behind'
                              : fxPreview.enabled && fxPreview.style !== 'none'
                                ? fxPreview.style
                                : '2D'}
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {onReorderPhotoTextOverlay && edits.overlays.length > 1 && (
                            <>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => onReorderPhotoTextOverlay(ov.id, -1)}
                                title="Send layer down"
                                className="p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === edits.overlays.length - 1}
                                onClick={() => onReorderPhotoTextOverlay(ov.id, 1)}
                                title="Bring layer up"
                                className="p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => onDuplicatePhotoTextOverlay(ov.id)}
                            title="Duplicate text layer"
                            className="p-1 text-zinc-400 hover:text-amber-300 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemovePhotoTextOverlay(ov.id)}
                            title="Remove text layer"
                            className="p-1 text-zinc-400 hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-2.5 pb-3 pt-1 border-t border-zinc-800/80 space-y-3">
                          <TextEffectsEditor
                            text={ov.text}
                            fontSize={ov.fontSize}
                            fontFamily={ov.fontFamily}
                            letterSpacing={ov.letterSpacing ?? 0}
                            color={ov.color}
                            backdrop={ov.backdrop}
                            styleTemplate={ov.styleTemplate}
                            text3d={ov.text3d}
                            layerOrder={ov.layerOrder || 'front'}
                            blendMode={ov.blendMode || 'normal'}
                            x={ov.x}
                            y={ov.y}
                            scale={ov.scale ?? 1}
                            rotation={ov.rotation ?? 0}
                            opacity={ov.opacity ?? 1}
                            onDuplicate={() => onDuplicatePhotoTextOverlay(ov.id)}
                            onChange={(patch) => onUpdatePhotoTextOverlay(ov.id, patch)}
                          />
                          <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-zinc-300 font-mono">
                                wiggle({(ov.wiggleFreq ?? 3).toFixed(1)}, {Math.round(ov.wiggleAmp ?? 0)})
                              </span>
                              {(ov.wiggleAmp ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdatePhotoTextOverlay(ov.id, { wiggleAmp: 0 })
                                  }
                                  className="text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer"
                                >
                                  Off
                                </button>
                              )}
                            </div>
                            <SliderRow
                              label="Wiggle Amp"
                              value={Math.round(ov.wiggleAmp ?? 0)}
                              min={0}
                              max={60}
                              defaultValue={0}
                              onChange={(v) =>
                                onUpdatePhotoTextOverlay(ov.id, { wiggleAmp: v })
                              }
                            />
                            <SliderRow
                              label="Wiggle Freq"
                              value={Number((ov.wiggleFreq ?? 3).toFixed(1))}
                              min={0.5}
                              max={16}
                              step={0.5}
                              unit="Hz"
                              defaultValue={3}
                              onChange={(v) =>
                                onUpdatePhotoTextOverlay(ov.id, { wiggleFreq: v })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCopyGrade}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-50 hover:border-zinc-700 cursor-pointer whitespace-nowrap"
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </button>
          <button
            type="button"
            disabled={!hasCopiedGrade}
            onClick={onPasteGrade}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap ${
              hasCopiedGrade
                ? 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-50 hover:border-zinc-700 cursor-pointer'
                : 'border-zinc-900 bg-zinc-950 text-zinc-600 cursor-not-allowed'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Paste</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onResetAll}
          className="px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 cursor-pointer whitespace-nowrap"
        >
          Reset All
        </button>
      </div>
    </aside>
  );
};
