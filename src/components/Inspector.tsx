import React from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClipboardCopy,
  ClipboardPaste,
  Diamond,
  Film,
  FlipHorizontal,
  FlipVertical,
  Lock,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ASPECT_RATIO_OPTIONS,
  CLIP_ANIMATION_OPTIONS,
  DEFAULT_COLOR_GRADE,
  DEFAULT_EFFECTS,
  DEFAULT_MASK,
  DEFAULT_TRANSFORM,
  FILM_PRESETS,
  FONT_OPTIONS,
  MASK_SHAPE_OPTIONS,
  TEXT_STYLE_TEMPLATES,
  VELOCITY_PRESETS,
} from '../data/presets';
import {
  AspectRatioId,
  AudioClip,
  ClipAnimationSettings,
  ClipAnimationType,
  ClipKeyframe,
  ColorGrade,
  EditDocument,
  EffectsSettings,
  FontFamilyId,
  InspectorTab,
  KeyframeEasing,
  MaskBgEffect,
  MaskSettings,
  MaskShape,
  OverlayAnimationType,
  TextOverlay,
  TimelineClip,
  TimelineOverlayItem,
  TransformSettings,
  VelocityPresetId,
  WorkspaceMode,
} from '../types/editor';
import {
  evaluateClipKeyframes,
  evaluateOverlayAtTime,
  HistogramData,
} from '../utils/renderEngine';
import { clamp } from '../utils/timecode';
import { Histogram } from './Histogram';

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
  onSetAspectRatio: (ratio: AspectRatioId) => void;
  onUpdateEffects: (patch: Partial<EffectsSettings>) => void;
  onUpdateAnimation: (patch: Partial<ClipAnimationSettings>) => void;
  onUpdateClipMeta: (clipId: string, patch: Partial<TimelineClip>) => void;
  onToggleClipKeyframe: () => void;
  onUpdateClipKeyframeValues: (patch: Partial<ClipKeyframe>) => void;
  onUpdateGlobalOverlay: (id: string, patch: Partial<TimelineOverlayItem>) => void;
  onToggleOverlayKeyframe: (id: string) => void;
  onUpdateOverlayMotionAtPlayhead: (
    id: string,
    patch: { x?: number; y?: number; scale?: number; rotation?: number; opacity?: number }
  ) => void;
  onDeleteGlobalOverlay: (id: string) => void;
  onUpdateAudioClip: (id: string, patch: Partial<AudioClip>) => void;
  onDeleteAudioClip: (id: string) => void;
  onAddPhotoTextOverlay: () => void;
  onUpdatePhotoTextOverlay: (id: string, patch: Partial<TextOverlay>) => void;
  onRemovePhotoTextOverlay: (id: string) => void;
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
  onSetAspectRatio,
  onUpdateEffects,
  onUpdateAnimation,
  onUpdateClipMeta,
  onToggleClipKeyframe,
  onUpdateClipKeyframeValues,
  onUpdateGlobalOverlay,
  onToggleOverlayKeyframe,
  onUpdateOverlayMotionAtPlayhead,
  onDeleteGlobalOverlay,
  onUpdateAudioClip,
  onDeleteAudioClip,
  onAddPhotoTextOverlay,
  onUpdatePhotoTextOverlay,
  onRemovePhotoTextOverlay,
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

            <div className="space-y-1">
              <label className="block text-[11px] text-zinc-400">Curve Easing</label>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { id: 'linear', label: 'Linear' },
                    { id: 'ease-out', label: 'Ease' },
                    { id: 'ease-in-out', label: 'Smooth' },
                    { id: 'punch', label: 'Punch' },
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
          </div>

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
            <>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">Caption Text</label>
                <input
                  type="text"
                  value={selectedOverlay.text || ''}
                  onChange={(e) =>
                    onUpdateGlobalOverlay(selectedOverlay.id, { text: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">Font Family</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {FONT_OPTIONS.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() =>
                        onUpdateGlobalOverlay(selectedOverlay.id, { fontFamily: font.id })
                      }
                      style={{ fontFamily: font.cssFamily }}
                      className={`px-2.5 py-2 text-xs rounded border text-left truncate cursor-pointer ${
                        selectedOverlay.fontFamily === font.id
                          ? 'border-amber-500 bg-amber-500/15 text-zinc-50'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">Style Preset</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {TEXT_STYLE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() =>
                        onUpdateGlobalOverlay(selectedOverlay.id, {
                          styleTemplate: tpl.id,
                          fontFamily: tpl.fontFamily,
                          fontSize: tpl.fontSize,
                          color: tpl.color,
                          backdrop: tpl.backdrop,
                        })
                      }
                      className={`px-2.5 py-1.5 text-[11px] rounded border text-left cursor-pointer ${
                        selectedOverlay.styleTemplate === tpl.id
                          ? 'border-amber-500 bg-amber-500/10 text-zinc-50'
                          : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedOverlay.backdrop)}
                    onChange={(e) =>
                      onUpdateGlobalOverlay(selectedOverlay.id, { backdrop: e.target.checked })
                    }
                    className="accent-amber-500"
                  />
                  <span>Backdrop Box</span>
                </label>

                <div className="flex items-center gap-1.5">
                  {['#ffffff', '#f59e0b', '#fef08a', '#38bdf8', '#09090b'].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => onUpdateGlobalOverlay(selectedOverlay.id, { color: hex })}
                      aria-label={`Color ${hex}`}
                      className={`w-5 h-5 rounded border cursor-pointer ${
                        selectedOverlay.color === hex
                          ? 'border-amber-400 scale-110'
                          : 'border-zinc-700'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <SliderRow
                label="Letter Spacing"
                value={selectedOverlay.letterSpacing ?? 0}
                min={-2}
                max={16}
                unit="px"
                onChange={(v) =>
                  onUpdateGlobalOverlay(selectedOverlay.id, { letterSpacing: v })
                }
              />
            </>
          )}

          <div className="space-y-3 border-t border-zinc-800/80 pt-4">
            <h3 className="text-xs font-semibold text-zinc-200">Transform Values</h3>
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
              label="Rotation"
              value={Math.round(evaluated.rotation)}
              min={-180}
              max={180}
              unit="°"
              onChange={(v) =>
                onUpdateOverlayMotionAtPlayhead(selectedOverlay.id, { rotation: v })
              }
            />
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

  return (
    <aside className={asideClass}>
      {mobileBar}
      <Histogram data={histogramData} />

      <div className="px-3 py-2.5 border-b border-zinc-800">
        <div className="grid grid-cols-5 gap-1 p-1 bg-zinc-900 rounded-md">
          {(
            [
              { id: 'color', label: 'Color' },
              { id: 'transform', label: 'Crop' },
              { id: 'mask', label: 'Mask' },
              { id: 'effects', label: 'FX' },
              { id: 'animate', label: workspace === 'timeline' ? 'Motion' : 'Text' },
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
              className={`py-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
            </div>
          </div>
        )}

        {activeTab === 'animate' && workspace === 'timeline' && selectedClip && (
          <div className="space-y-4">
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
              <h3 className="text-xs font-semibold text-zinc-200">Velocity Speed Curve</h3>
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

        {/* Photo Lab Text Tab */}
        {activeTab === 'animate' && workspace === 'photo' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-200">Photo Typography</h3>
              <button
                type="button"
                onClick={onAddPhotoTextOverlay}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Text</span>
              </button>
            </div>

            {edits.overlays.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Add titles or captions in 6 different fonts and drag them directly on the photo.
              </p>
            ) : (
              edits.overlays.map((ov) => (
                <div
                  key={ov.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ov.text}
                      onChange={(e) =>
                        onUpdatePhotoTextOverlay(ov.id, { text: e.target.value })
                      }
                      className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => onRemovePhotoTextOverlay(ov.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1">
                    {FONT_OPTIONS.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() =>
                          onUpdatePhotoTextOverlay(ov.id, {
                            fontFamily: font.id as FontFamilyId,
                          })
                        }
                        style={{ fontFamily: font.cssFamily }}
                        className={`px-2 py-1 text-[11px] rounded border text-left truncate cursor-pointer ${
                          ov.fontFamily === font.id
                            ? 'border-amber-500 bg-amber-500/15 text-zinc-50'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-300'
                        }`}
                      >
                        {font.label}
                      </button>
                    ))}
                  </div>

                  <SliderRow
                    label="Size"
                    value={ov.fontSize}
                    min={18}
                    max={96}
                    unit="px"
                    defaultValue={44}
                    onChange={(v) => onUpdatePhotoTextOverlay(ov.id, { fontSize: v })}
                  />
                </div>
              ))
            )}
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
