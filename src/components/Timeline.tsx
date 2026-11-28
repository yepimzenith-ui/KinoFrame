import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  Magnet,
  Pause,
  Play,
  Scissors,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { TRANSITION_OPTIONS } from '../data/presets';
import {
  AudioClip,
  MediaAsset,
  TimelineClip,
  TimelineOverlayItem,
  TransitionType,
} from '../types/editor';
import { renderFrameToCanvas } from '../utils/renderEngine';
import { clamp, formatTimecode } from '../utils/timecode';

interface TimelineProps {
  clips: TimelineClip[];
  assets: MediaAsset[];
  sourceMap: Record<string, HTMLImageElement | HTMLVideoElement>;
  globalOverlays: TimelineOverlayItem[];
  audioClips: AudioClip[];
  selectedClipId: string | null;
  selectedOverlayId: string | null;
  selectedAudioId: string | null;
  playhead: number;
  totalDuration: number;
  isPlaying: boolean;
  beatBpm: number;
  onChangeBeatBpm: (bpm: number) => void;
  onChopToBeat: () => void;
  onSelectClip: (clipId: string) => void;
  onSelectOverlay: (overlayId: string) => void;
  onSelectAudio: (audioId: string) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onStepFrame: (delta: number) => void;
  onSplitAtPlayhead: () => void;
  onDuplicateSelectedClip: () => void;
  onConvertClipToOverlay: (clipId: string) => void;
  onDeleteSelected: () => void;
  onMoveClip: (clipId: string, dir: -1 | 1) => void;
  onReorderClip: (fromIndex: number, toIndex: number) => void;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  onUpdateOverlay: (id: string, patch: Partial<TimelineOverlayItem>) => void;
  onUpdateAudioClip: (id: string, patch: Partial<AudioClip>) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  clips,
  assets,
  sourceMap,
  globalOverlays,
  audioClips,
  selectedClipId,
  selectedOverlayId,
  selectedAudioId,
  playhead,
  totalDuration,
  isPlaying,
  beatBpm,
  onChangeBeatBpm,
  onChopToBeat,
  onSelectClip,
  onSelectOverlay,
  onSelectAudio,
  onSeek,
  onTogglePlay,
  onStepFrame,
  onSplitAtPlayhead,
  onDuplicateSelectedClip,
  onConvertClipToOverlay,
  onDeleteSelected,
  onMoveClip,
  onReorderClip,
  onUpdateClip,
  onUpdateOverlay,
  onUpdateAudioClip,
}) => {
  const TRACK_LABEL_WIDTH = 56;
  const [pxPerSec, setPxPerSec] = useState<number>(84);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [openTransClipId, setOpenTransClipId] = useState<string | null>(null);
  const [snapLineSec, setSnapLineSec] = useState<number | null>(null);
  const [dragHud, setDragHud] = useState<{ xPx: number; label: string } | null>(null);
  const [skim, setSkim] = useState<{
    time: number;
    xPx: number;
    clientX: number;
    topY: number;
  } | null>(null);

  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const skimCanvasRef = useRef<HTMLCanvasElement>(null);
  const skimVideoCacheRef = useRef<Record<string, HTMLVideoElement>>({});
  const isScrubbingRef = useRef<boolean>(false);

  const selectedClip = clips.find((c) => c.id === selectedClipId) || null;
  const effectiveDuration = Math.max(8, totalDuration + 2);
  const timelineWidth = Math.max(760, effectiveDuration * pxPerSec + 120);

  const computeTimeFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - TRACK_LABEL_WIDTH;
    return clamp(x / pxPerSec, 0, Math.max(0.05, totalDuration));
  };

  const getClipEffectiveLength = (clip: TimelineClip) =>
    Math.max(0.15, (clip.trimEnd - clip.trimStart) / clip.speed);

  let cursor = 0;
  const clipSpans = clips.map((clip) => {
    const len = getClipEffectiveLength(clip);
    const start = cursor;
    cursor += len;
    return { clip, start, len };
  });

  const rulerTicks: number[] = [];
  const tickStep = pxPerSec >= 110 ? 0.5 : pxPerSec >= 65 ? 1 : 2;
  for (let t = 0; t <= Math.ceil(effectiveDuration); t = Number((t + tickStep).toFixed(2))) {
    rulerTicks.push(t);
  }

  const beatMarkers: number[] = [];
  if (beatBpm > 0) {
    const beatSec = 60 / beatBpm;
    for (let bt = beatSec; bt <= effectiveDuration; bt += beatSec) {
      beatMarkers.push(Number(bt.toFixed(3)));
    }
  }

  const snapTime = (rawTime: number, includePlayhead = true): { time: number; snappedTo: number | null } => {
    if (!snapEnabled) {
      return { time: Number(Math.max(0, rawTime).toFixed(2)), snappedTo: null };
    }
    const thresholdSec = Math.max(0.12, 10 / pxPerSec);
    const targets: number[] = [0];
    if (includePlayhead) targets.push(playhead);
    for (const s of clipSpans) {
      targets.push(s.start, s.start + s.len);
    }
    for (const ov of globalOverlays) {
      targets.push(ov.startTime, ov.startTime + ov.duration);
    }
    for (const b of beatMarkers) {
      targets.push(b);
    }
    let best = rawTime;
    let bestDist = thresholdSec;
    let snappedTo: number | null = null;
    for (const target of targets) {
      const dist = Math.abs(rawTime - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = target;
        snappedTo = target;
      }
    }
    return { time: Number(Math.max(0, best).toFixed(2)), snappedTo };
  };

  const startScrub = (e: React.PointerEvent) => {
    e.stopPropagation();
    const targetEl = e.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore if synthetic event
    }
    isScrubbingRef.current = true;
    setSkim(null);
    const first = snapTime(computeTimeFromClientX(e.clientX), false);
    setSnapLineSec(first.snappedTo);
    onSeek(clamp(first.time, 0, Math.max(0.05, totalDuration)));
    const onMove = (ev: PointerEvent) => {
      const next = snapTime(computeTimeFromClientX(ev.clientX), false);
      setSnapLineSec(next.snappedTo);
      onSeek(clamp(next.time, 0, Math.max(0.05, totalDuration)));
    };
    const onUp = () => {
      isScrubbingRef.current = false;
      setSnapLineSec(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const skimmedSpan =
    skim && clipSpans.length > 0
      ? clipSpans.find((s) => skim.time >= s.start && skim.time < s.start + s.len) ||
        clipSpans[clipSpans.length - 1]
      : null;

  useEffect(() => {
    if (!skim || !skimmedSpan) return;
    const canvas = skimCanvasRef.current;
    if (!canvas) return;
    const { clip, start, len } = skimmedSpan;
    const localTime = Math.max(0, skim.time - start);
    const progress01 = clamp(localTime / len, 0, 1);

    const drawWithSource = (el: HTMLImageElement | HTMLVideoElement) => {
      renderFrameToCanvas(canvas, el, {
        edits: clip.edits,
        clipProgress: progress01,
        clipTime: localTime,
        clipDuration: len,
        globalTime: skim.time,
        enableKenBurns: true,
        transitionIn: clip.transitionIn,
        transitionDuration: clip.transitionDuration,
        velocityPreset: clip.velocityPreset,
        clipKeyframes: clip.keyframes,
        clipKeyframeEasing: clip.keyframeEasing,
        globalOverlays,
      });
    };

    const srcEl = sourceMap[clip.assetId];
    if (!srcEl) return;

    if (clip.kind === 'photo' || srcEl instanceof HTMLImageElement) {
      drawWithSource(srcEl);
      return;
    }

    const asset = assets.find((a) => a.id === clip.assetId);
    if (!asset) {
      drawWithSource(srcEl);
      return;
    }

    let previewVid = skimVideoCacheRef.current[clip.assetId];
    if (!previewVid) {
      previewVid = document.createElement('video');
      previewVid.muted = true;
      previewVid.playsInline = true;
      previewVid.preload = 'auto';
      previewVid.crossOrigin = 'anonymous';
      previewVid.src = asset.src;
      skimVideoCacheRef.current[clip.assetId] = previewVid;
    }

    const targetTime = clamp(
      clip.trimStart + localTime * clip.speed,
      0,
      previewVid.duration || clip.duration || 10
    );

    if (previewVid.readyState >= 2) {
      drawWithSource(previewVid);
      if (Math.abs(previewVid.currentTime - targetTime) > 0.14) {
        previewVid.onseeked = () => drawWithSource(previewVid!);
        previewVid.currentTime = targetTime;
      }
    } else {
      drawWithSource(srcEl);
    }
  }, [skim, skimmedSpan, sourceMap, assets, globalOverlays]);

  useEffect(() => {
    const cache = skimVideoCacheRef.current;
    return () => {
      Object.values(cache).forEach((v) => {
        v.src = '';
      });
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="h-52 sm:h-60 lg:h-72 shrink-0 border-t border-zinc-800 bg-zinc-950 flex flex-col relative"
    >
      {/* Floating Cursor-Following Clip Skimmer Preview */}
      {skim && skimmedSpan && (
        <div
          style={{
            left: `${clamp(skim.clientX, 92, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 92)}px`,
            top: `${Math.max(8, skim.topY - 126)}px`,
          }}
          className="fixed -translate-x-1/2 z-50 pointer-events-none rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden w-40"
        >
          <div className="aspect-video w-full bg-black relative overflow-hidden">
            <canvas ref={skimCanvasRef} width={160} height={90} className="w-full h-full block" />
            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-zinc-950/85 text-[10px] font-mono text-amber-300 tabular-nums">
              {formatTimecode(skim.time)}
            </div>
          </div>
          <div className="px-2 py-1 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium text-zinc-100 truncate">
              {skimmedSpan.clip.name}
            </span>
            <span className="text-[9px] font-mono text-zinc-500 shrink-0">Click to seek</span>
          </div>
        </div>
      )}

      <div className="h-10 shrink-0 px-2.5 sm:px-4 border-b border-zinc-800/80 flex items-center justify-between gap-2 sm:gap-3 overflow-x-auto studio-scroll">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onStepFrame(-0.05)}
            title="Step Back 1 Frame"
            aria-label="Step back"
            className="p-1.5 rounded text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title="Play / Pause (Space)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-100 text-zinc-950 hover:bg-amber-400 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={() => onStepFrame(0.05)}
            title="Step Forward 1 Frame"
            aria-label="Step forward"
            className="p-1.5 rounded text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <span className="ml-2 font-mono text-xs text-zinc-200 tabular-nums whitespace-nowrap">
            {formatTimecode(playhead)}{' '}
            <span className="text-zinc-500">/ {formatTimecode(totalDuration)}</span>
          </span>

          <div className="w-px h-4 bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={onSplitAtPlayhead}
            disabled={clips.length === 0}
            title="Split clip at playhead (S)"
            className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-800 bg-zinc-900 text-[11px] font-medium text-zinc-200 hover:border-amber-500 hover:text-amber-300 disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Scissors className="w-3 h-3" />
            <span>Split</span>
          </button>

          <button
            type="button"
            onClick={onChopToBeat}
            disabled={!selectedClip}
            title="Auto-chop selected clip into fast beat cuts"
            className="flex items-center gap-1 px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-[11px] font-medium text-amber-300 hover:bg-amber-500 hover:text-zinc-950 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Zap className="w-3 h-3" />
            <span>Chop Beat</span>
          </button>

          <button
            type="button"
            onClick={onDuplicateSelectedClip}
            disabled={!selectedClip}
            title="Duplicate selected clip"
            className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-800 bg-zinc-900 text-[11px] font-medium text-zinc-200 hover:border-zinc-600 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Copy className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => selectedClip && onConvertClipToOverlay(selectedClip.id)}
            disabled={!selectedClip}
            title="Turn selected clip into Track T1 PiP Overlay (CapCut style)"
            className="flex items-center gap-1 px-2 py-1 rounded border border-violet-500/40 bg-violet-500/15 text-[11px] font-medium text-violet-200 hover:bg-violet-500 hover:text-zinc-950 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Layers className="w-3 h-3" />
            <span>→ Overlay</span>
          </button>

          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={!selectedClip && !selectedOverlayId && !selectedAudioId}
            title="Delete selected item (Del)"
            className="p-1.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-red-400 hover:border-red-900/60 disabled:opacity-40 cursor-pointer shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {selectedClip && (
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={selectedClip.speed}
              onChange={(e) =>
                onUpdateClip(selectedClip.id, { speed: Number(e.target.value) })
              }
              aria-label="Clip playback speed"
              className="px-2 py-1 text-[11px] font-mono bg-zinc-900 border border-zinc-800 rounded text-zinc-200 cursor-pointer"
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1.0x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2.0x</option>
              <option value={4}>4.0x</option>
            </select>

            {selectedClip.kind === 'video' && (
              <button
                type="button"
                onClick={() =>
                  onUpdateClip(selectedClip.id, { muted: !selectedClip.muted })
                }
                title={selectedClip.muted ? 'Unmute clip' : 'Mute clip'}
                className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-50 cursor-pointer"
              >
                {selectedClip.muted ? (
                  <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => onMoveClip(selectedClip.id, -1)}
              title="Move clip left"
              className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-50 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMoveClip(selectedClip.id, 1)}
              title="Move clip right"
              className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-50 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSnapEnabled((s) => !s)}
            title="Magnetic Timeline Snap"
            className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              snapEnabled
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Magnet className="w-3 h-3" />
            <span>Snap</span>
          </button>

          <select
            value={beatBpm}
            onChange={(e) => onChangeBeatBpm(Number(e.target.value))}
            aria-label="Beat grid BPM"
            title="Beat Grid Snap Markers"
            className="px-2 py-1 text-[11px] font-mono bg-zinc-900 border border-zinc-800 rounded text-zinc-200 cursor-pointer"
          >
            <option value={0}>Beat Grid: Off</option>
            <option value={120}>120 BPM</option>
            <option value={140}>140 BPM</option>
            <option value={160}>160 BPM</option>
          </select>

          <input
            type="range"
            min={44}
            max={240}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            aria-label="Timeline zoom"
            className="studio-slider w-20"
          />
        </div>
      </div>

      <div
        ref={trackRef}
        onWheel={(e) => {
          const el = trackRef.current;
          if (!el) return;
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setPxPerSec((prev) => clamp(Math.round(prev - e.deltaY * 0.25), 44, 240));
            return;
          }
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
            el.scrollLeft += e.deltaY;
          }
        }}
        onPointerMove={(e) => {
          if (
            e.pointerType === 'touch' ||
            isScrubbingRef.current ||
            dragHud !== null ||
            totalDuration <= 0
          ) {
            return;
          }
          const el = trackRef.current;
          const secEl = sectionRef.current;
          if (!el || !secEl) return;
          const rect = el.getBoundingClientRect();
          const relX = e.clientX - rect.left + el.scrollLeft - TRACK_LABEL_WIDTH;
          if (relX < 0) {
            setSkim(null);
            return;
          }
          const time = clamp(relX / pxPerSec, 0, totalDuration);
          setSkim({
            time,
            xPx: time * pxPerSec,
            clientX: e.clientX,
            topY: secEl.getBoundingClientRect().top,
          });
        }}
        onPointerLeave={() => setSkim(null)}
        className="flex-1 overflow-x-auto overflow-y-auto studio-scroll relative bg-[#0c0c0f] select-none"
      >
        <div style={{ width: `${timelineWidth}px` }} className="min-h-full relative flex">
          <div className="w-14 shrink-0 sticky left-0 z-30 bg-zinc-950 border-r border-zinc-800 flex flex-col">
            <div className="h-7 sm:h-6 border-b border-zinc-800" />
            <div className="h-10 border-b border-zinc-800/60 flex items-center justify-center text-[10px] font-medium text-sky-400 tracking-tight">
              Overlay
            </div>
            <div className="h-16 sm:h-20 border-b border-zinc-800/60 flex items-center justify-center text-[10px] font-medium text-amber-400 tracking-tight">
              Main
            </div>
            <div className="h-14 flex items-center justify-center text-[10px] font-medium text-emerald-400 tracking-tight">
              Audio
            </div>
          </div>

          <div className="flex-1 relative">
            {/* Beat Markers across Tracks */}
            {beatMarkers.map((bt) => (
              <div
                key={`beat-${bt}`}
                style={{ left: `${bt * pxPerSec}px` }}
                className="absolute top-7 sm:top-6 bottom-0 w-px bg-amber-500/12 pointer-events-none z-10"
              />
            ))}

            {/* Time Ruler (Draggable Scrub for Desktop + Touch) */}
            <div
              onPointerDown={startScrub}
              className="h-7 sm:h-6 border-b border-zinc-800 bg-zinc-950/90 relative cursor-ew-resize touch-none"
            >
              {rulerTicks.map((sec) => (
                <div
                  key={sec}
                  style={{ left: `${sec * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 border-l border-zinc-800 pl-1.5 pt-1 text-[10px] font-mono text-zinc-500 tabular-nums pointer-events-none"
                >
                  {formatTimecode(sec)}
                </div>
              ))}
              {beatMarkers.map((bt) => (
                <div
                  key={`bt-${bt}`}
                  style={{ left: `${bt * pxPerSec}px` }}
                  className="absolute bottom-0 w-1 h-1.5 -ml-0.5 bg-amber-500/70 rounded-t-xs pointer-events-none"
                />
              ))}
            </div>

            {/* Track T1: Text, Stickers & Mask Overlays with Keyframe Diamonds */}
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget && totalDuration > 0) {
                  onSeek(computeTimeFromClientX(e.clientX));
                }
              }}
              className="h-10 border-b border-zinc-800/60 relative bg-zinc-950/40"
            >
              {globalOverlays.map((ov) => {
                const leftPx = ov.startTime * pxPerSec;
                const widthPx = Math.max(36, ov.duration * pxPerSec);
                const isSel = ov.id === selectedOverlayId;
                const colorClass =
                  ov.kind === 'mask'
                    ? isSel
                      ? 'bg-amber-500/25 border-amber-400 text-amber-100'
                      : 'bg-amber-950/60 border-amber-700/70 text-amber-200 hover:border-amber-500'
                    : ov.kind === 'visual' || ov.kind === 'image' || ov.kind === 'video'
                      ? isSel
                        ? 'bg-violet-500/25 border-violet-400 text-violet-100'
                        : 'bg-violet-950/60 border-violet-700/70 text-violet-200 hover:border-violet-500'
                      : isSel
                        ? 'bg-sky-500/25 border-sky-400 text-sky-100'
                        : 'bg-sky-950/60 border-sky-800/70 text-sky-200 hover:border-sky-500';
                const labelText =
                  ov.kind === 'mask'
                    ? `Mask · ${ov.maskShape || 'shape'}`
                    : ov.kind === 'visual'
                      ? `FX · ${ov.overlayName || ov.visualOverlayId || 'Overlay'}`
                      : ov.kind === 'video'
                        ? `PiP · ${ov.overlayName || 'Video'}`
                        : ov.kind === 'image'
                          ? `PiP · ${ov.overlayName || 'Cutout'}`
                          : ov.kind === 'text'
                            ? ov.text || 'Text'
                            : ov.stickerKind;

                return (
                  <div
                    key={ov.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      try {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      } catch {
                        // ignore
                      }
                      onSelectOverlay(ov.id);
                      const startX = e.clientX;
                      const origStart = ov.startTime;
                      const onMove = (ev: PointerEvent) => {
                        const dt = (ev.clientX - startX) / pxPerSec;
                        const snapped = snapTime(Math.max(0, origStart + dt), true);
                        setSnapLineSec(snapped.snappedTo);
                        setDragHud({
                          xPx: snapped.time * pxPerSec,
                          label: `${formatTimecode(snapped.time)}`,
                        });
                        onUpdateOverlay(ov.id, { startTime: snapped.time });
                      };
                      const onUp = () => {
                        setSnapLineSec(null);
                        setDragHud(null);
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                        window.removeEventListener('pointercancel', onUp);
                      };
                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', onUp);
                      window.addEventListener('pointercancel', onUp);
                    }}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    className={`absolute top-1.5 bottom-1.5 rounded px-2 flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing touch-none border text-[11px] overflow-hidden ${colorClass}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {ov.layerOrder === 'behind' && (
                        <span className="px-1 py-0.2 rounded bg-amber-500/25 border border-amber-500/40 text-[9px] font-mono text-amber-300 shrink-0">
                          Behind
                        </span>
                      )}
                      <span className="truncate font-medium">{labelText}</span>
                    </div>

                    {/* Keyframe Diamond Markers */}
                    {ov.keyframes.map((kf) => {
                      const kfLeft = clamp((kf.time / Math.max(0.1, ov.duration)) * 100, 3, 97);
                      return (
                        <button
                          key={kf.id}
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectOverlay(ov.id);
                            onSeek(ov.startTime + kf.time);
                          }}
                          title={`Keyframe at +${kf.time.toFixed(2)}s`}
                          style={{ left: `${kfLeft}%` }}
                          className="absolute bottom-0.5 -translate-x-1/2 w-2 h-2 rotate-45 bg-amber-400 border border-zinc-950 hover:scale-125 cursor-pointer z-20"
                        />
                      );
                    })}

                    <div
                      title="Drag to resize duration"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        try {
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        } catch {
                          // ignore
                        }
                        const startX = e.clientX;
                        const origDur = ov.duration;
                        const onMove = (ev: PointerEvent) => {
                          const dt = (ev.clientX - startX) / pxPerSec;
                          const snappedEnd = snapTime(
                            ov.startTime + clamp(origDur + dt, 0.2, 30),
                            true
                          );
                          const nextDur = clamp(
                            Number((snappedEnd.time - ov.startTime).toFixed(2)),
                            0.2,
                            30
                          );
                          setSnapLineSec(snappedEnd.snappedTo);
                          setDragHud({
                            xPx: (ov.startTime + nextDur) * pxPerSec,
                            label: `${nextDur.toFixed(2)}s`,
                          });
                          onUpdateOverlay(ov.id, { duration: nextDur });
                        };
                        const onUp = () => {
                          setSnapLineSec(null);
                          setDragHud(null);
                          window.removeEventListener('pointermove', onMove);
                          window.removeEventListener('pointerup', onUp);
                          window.removeEventListener('pointercancel', onUp);
                        };
                        window.addEventListener('pointermove', onMove);
                        window.addEventListener('pointerup', onUp);
                        window.addEventListener('pointercancel', onUp);
                      }}
                      className="w-1.5 self-stretch bg-white/25 hover:bg-amber-300 cursor-ew-resize shrink-0 -mr-2"
                    />
                  </div>
                );
              })}
            </div>

            {/* Track V1: Main Clips with Keyframe Diamonds */}
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget && totalDuration > 0) {
                  onSeek(computeTimeFromClientX(e.clientX));
                }
              }}
              className="h-16 sm:h-20 border-b border-zinc-800/60 relative flex items-center"
            >
              {clips.length === 0 ? (
                <div className="px-4 text-xs text-zinc-500">
                  {globalOverlays.length > 0
                    ? 'Main track is empty — Track Overlay items above remain active. Add clips anytime or preview & export.'
                    : 'Add clips or photos from the Media Library or use Chop Beat to build fast cuts.'}
                </div>
              ) : (
                clipSpans.map(({ clip, start, len }, index) => {
                  const asset = assets.find((a) => a.id === clip.assetId);
                  const isSel = clip.id === selectedClipId;
                  const widthPx = Math.max(28, len * pxPerSec);
                  const leftPx = start * pxPerSec;

                  return (
                    <React.Fragment key={clip.id}>
                      <div
                        onPointerDown={(e) => {
                          if (e.button !== 0 || clips.length < 2) return;
                          const startX = e.clientX;
                          let currentIndex = index;
                          let moved = false;
                          const onMove = (ev: PointerEvent) => {
                            const dx = ev.clientX - startX;
                            if (!moved && Math.abs(dx) < 18) return;
                            moved = true;
                            const targetTime = clamp(
                              start + len / 2 + dx / pxPerSec,
                              0,
                              totalDuration
                            );
                            const targetIdx = clipSpans.findIndex(
                              (s) => targetTime >= s.start && targetTime <= s.start + s.len
                            );
                            if (targetIdx !== -1 && targetIdx !== currentIndex) {
                              onReorderClip(currentIndex, targetIdx);
                              currentIndex = targetIdx;
                            }
                          };
                          const onUp = () => {
                            window.removeEventListener('pointermove', onMove);
                            window.removeEventListener('pointerup', onUp);
                            window.removeEventListener('pointercancel', onUp);
                          };
                          window.addEventListener('pointermove', onMove);
                          window.addEventListener('pointerup', onUp);
                          window.addEventListener('pointercancel', onUp);
                        }}
                        onClick={(e) => {
                          onSelectClip(clip.id);
                          if (totalDuration > 0) {
                            onSeek(computeTimeFromClientX(e.clientX));
                          }
                        }}
                        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                        className={`absolute top-1.5 bottom-1.5 rounded-md border overflow-hidden cursor-pointer transition-colors ${
                          isSel
                            ? 'border-amber-500 ring-1 ring-amber-500/40 bg-zinc-800'
                            : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                        }`}
                      >
                        {asset && asset.kind === 'photo' && (
                          <img
                            src={asset.src}
                            alt={clip.name}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
                          />
                        )}
                        <div className="absolute inset-x-0 top-0 h-1 bg-[repeating-linear-gradient(to_right,rgba(255,255,255,0.22)_0px,rgba(255,255,255,0.22)_6px,transparent_6px,transparent_12px)] pointer-events-none" />

                        <div className="relative z-10 h-full px-2 py-1.5 flex flex-col justify-between bg-gradient-to-t from-zinc-950/90 via-zinc-950/30 to-zinc-950/60">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-medium text-zinc-100 truncate">
                              {clip.name}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-300 tabular-nums shrink-0">
                              {len.toFixed(2)}s
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 truncate">
                            {clip.edits.bgRemoval?.enabled && (
                              <span className="text-emerald-400">Cutout</span>
                            )}
                            {clip.edits.mask && clip.edits.mask.shape !== 'none' && (
                              <span className="text-amber-400">Mask:{clip.edits.mask.shape}</span>
                            )}
                            {clip.velocityPreset !== 'linear' && (
                              <span className="text-amber-300">{clip.velocityPreset}</span>
                            )}
                            {clip.speed !== 1 && <span>{clip.speed}x</span>}
                            {clip.edits.effects.shake > 0 && <span>Shake</span>}
                          </div>
                        </div>

                        {/* Clip Keyframe Diamonds */}
                        {clip.keyframes.map((kf) => {
                          const kfLeft = clamp((kf.time / Math.max(0.1, len)) * 100, 4, 96);
                          return (
                            <button
                              key={kf.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectClip(clip.id);
                                onSeek(start + kf.time);
                              }}
                              title={`Clip keyframe at +${kf.time.toFixed(2)}s`}
                              style={{ left: `${kfLeft}%` }}
                              className="absolute bottom-1 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-amber-400 border border-zinc-950 hover:scale-125 cursor-pointer z-20"
                            />
                          );
                        })}

                        <div
                          title="Drag to trim start"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            try {
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            } catch {
                              // ignore
                            }
                            const startX = e.clientX;
                            const origStart = clip.trimStart;
                            const onMove = (ev: PointerEvent) => {
                              const delta = ((ev.clientX - startX) / pxPerSec) * clip.speed;
                              const nextStart = clamp(origStart + delta, 0, clip.trimEnd - 0.15);
                              const nextLen = (clip.trimEnd - nextStart) / clip.speed;
                              setDragHud({
                                xPx: leftPx,
                                label: `In ${nextStart.toFixed(2)}s · ${nextLen.toFixed(2)}s`,
                              });
                              onUpdateClip(clip.id, { trimStart: Number(nextStart.toFixed(2)) });
                            };
                            const onUp = () => {
                              setDragHud(null);
                              window.removeEventListener('pointermove', onMove);
                              window.removeEventListener('pointerup', onUp);
                              window.removeEventListener('pointercancel', onUp);
                            };
                            window.addEventListener('pointermove', onMove);
                            window.addEventListener('pointerup', onUp);
                            window.addEventListener('pointercancel', onUp);
                          }}
                          className="absolute top-0 left-0 bottom-0 w-2 bg-zinc-200/15 hover:bg-amber-400 cursor-ew-resize z-20 touch-none"
                        />

                        <div
                          title="Drag to trim end"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            try {
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            } catch {
                              // ignore
                            }
                            const startX = e.clientX;
                            const origEnd = clip.trimEnd;
                            const maxEnd = clip.kind === 'video' ? clip.duration : 20;
                            const onMove = (ev: PointerEvent) => {
                              const delta = ((ev.clientX - startX) / pxPerSec) * clip.speed;
                              const nextEnd = clamp(origEnd + delta, clip.trimStart + 0.15, maxEnd);
                              const nextLen = (nextEnd - clip.trimStart) / clip.speed;
                              setDragHud({
                                xPx: leftPx + nextLen * pxPerSec,
                                label: `Len ${nextLen.toFixed(2)}s`,
                              });
                              onUpdateClip(clip.id, { trimEnd: Number(nextEnd.toFixed(2)) });
                            };
                            const onUp = () => {
                              setDragHud(null);
                              window.removeEventListener('pointermove', onMove);
                              window.removeEventListener('pointerup', onUp);
                              window.removeEventListener('pointercancel', onUp);
                            };
                            window.addEventListener('pointermove', onMove);
                            window.addEventListener('pointerup', onUp);
                            window.addEventListener('pointercancel', onUp);
                          }}
                          className="absolute top-0 right-0 bottom-0 w-2 bg-zinc-200/15 hover:bg-amber-400 cursor-ew-resize z-20 touch-none"
                        />
                      </div>

                      {index > 0 && (
                        <div
                          style={{ left: `${leftPx}px` }}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-30"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenTransClipId((prev) => (prev === clip.id ? null : clip.id));
                            }}
                            title={`Transition: ${clip.transitionIn}`}
                            className={`w-5 h-5 rounded flex items-center justify-center border shadow cursor-pointer transition-colors ${
                              clip.transitionIn !== 'cut'
                                ? 'bg-amber-500 border-amber-300 text-zinc-950'
                                : 'bg-zinc-900 border-zinc-600 text-zinc-300 hover:border-amber-400'
                            }`}
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                          </button>

                          {openTransClipId === clip.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute bottom-7 left-1/2 -translate-x-1/2 w-36 rounded-lg border border-zinc-700 bg-zinc-950 p-1.5 shadow-2xl z-40 space-y-0.5"
                            >
                              {TRANSITION_OPTIONS.map((tr) => (
                                <button
                                  key={tr.id}
                                  type="button"
                                  onClick={() => {
                                    onUpdateClip(clip.id, {
                                      transitionIn: tr.id as TransitionType,
                                    });
                                    setOpenTransClipId(null);
                                  }}
                                  className={`w-full text-left px-2 py-1 text-[11px] rounded cursor-pointer ${
                                    clip.transitionIn === tr.id
                                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                                      : 'text-zinc-200 hover:bg-zinc-800'
                                  }`}
                                >
                                  {tr.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {/* Track A1: Audio & Sound FX */}
            <div className="h-14 relative bg-zinc-950/30">
              {audioClips.map((ac) => {
                const dur = Math.max(0.2, ac.trimEnd - ac.trimStart);
                const leftPx = ac.startTime * pxPerSec;
                const widthPx = Math.max(32, dur * pxPerSec);
                const isSel = ac.id === selectedAudioId;

                return (
                  <div
                    key={ac.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      try {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      } catch {
                        // ignore
                      }
                      onSelectAudio(ac.id);
                      const startX = e.clientX;
                      const origStart = ac.startTime;
                      const onMove = (ev: PointerEvent) => {
                        const dt = (ev.clientX - startX) / pxPerSec;
                        const snapped = snapTime(Math.max(0, origStart + dt), true);
                        setSnapLineSec(snapped.snappedTo);
                        setDragHud({
                          xPx: snapped.time * pxPerSec,
                          label: formatTimecode(snapped.time),
                        });
                        onUpdateAudioClip(ac.id, { startTime: snapped.time });
                      };
                      const onUp = () => {
                        setSnapLineSec(null);
                        setDragHud(null);
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                        window.removeEventListener('pointercancel', onUp);
                      };
                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', onUp);
                      window.addEventListener('pointercancel', onUp);
                    }}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    className={`absolute top-1.5 bottom-1.5 rounded-md border px-2 py-1 flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing touch-none ${
                      isSel
                        ? 'border-emerald-400 bg-emerald-950/70'
                        : 'border-emerald-800/70 bg-emerald-950/40 hover:border-emerald-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="font-medium text-emerald-100 truncate">
                        {ac.muted ? `${ac.name} (Muted)` : ac.name}
                      </span>
                      <span className="font-mono text-emerald-300/80 tabular-nums shrink-0">
                        {dur.toFixed(1)}s
                      </span>
                    </div>
                    <div className="h-4 flex items-end gap-[2px] pointer-events-none">
                      {ac.peaks.map((pk, idx) => (
                        <div
                          key={idx}
                          style={{ height: `${Math.round(pk * 100)}%` }}
                          className="flex-1 bg-emerald-400/55 rounded-[1px]"
                        />
                      ))}
                    </div>
                    <div
                      title="Trim audio duration"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        try {
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        } catch {
                          // ignore
                        }
                        const startX = e.clientX;
                        const origEnd = ac.trimEnd;
                        const onMove = (ev: PointerEvent) => {
                          const dt = (ev.clientX - startX) / pxPerSec;
                          const nextEnd = clamp(Number((origEnd + dt).toFixed(2)), ac.trimStart + 0.2, 60);
                          const nextDur = nextEnd - ac.trimStart;
                          setDragHud({
                            xPx: (ac.startTime + nextDur) * pxPerSec,
                            label: `${nextDur.toFixed(2)}s`,
                          });
                          onUpdateAudioClip(ac.id, { trimEnd: nextEnd });
                        };
                        const onUp = () => {
                          setDragHud(null);
                          window.removeEventListener('pointermove', onMove);
                          window.removeEventListener('pointerup', onUp);
                          window.removeEventListener('pointercancel', onUp);
                        };
                        window.addEventListener('pointermove', onMove);
                        window.addEventListener('pointerup', onUp);
                        window.addEventListener('pointercancel', onUp);
                      }}
                      className="absolute top-0 right-0 bottom-0 w-2 bg-emerald-400/20 hover:bg-emerald-400 cursor-ew-resize touch-none"
                    />
                  </div>
                );
              })}
            </div>

            {/* Magnetic Snap Indicator Line */}
            {snapLineSec !== null && (
              <div
                style={{ left: `${snapLineSec * pxPerSec}px` }}
                className="absolute top-0 bottom-0 w-px bg-amber-400/90 pointer-events-none z-35"
              />
            )}

            {/* Live Trim / Drag HUD */}
            {dragHud && (
              <div
                style={{ left: `${dragHud.xPx}px` }}
                className="absolute top-1 -translate-x-1/2 px-1.5 py-0.5 rounded bg-amber-400 text-zinc-950 font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap shadow-lg pointer-events-none z-50"
              >
                {dragHud.label}
              </div>
            )}

            {/* Cursor Skimmer Line (Laptop Mouse/Trackpad Hover) */}
            {skim && (
              <div
                style={{ left: `${skim.xPx}px` }}
                className="absolute top-0 bottom-0 w-px bg-zinc-200/80 pointer-events-none z-35"
              >
                <div className="px-1 py-0.5 -translate-x-1/2 rounded-b bg-zinc-100 text-zinc-950 font-mono text-[9px] font-semibold tabular-nums whitespace-nowrap shadow">
                  {formatTimecode(skim.time)}
                </div>
              </div>
            )}

            {/* Playhead Needle (Draggable Scrub Handle) */}
            <div
              style={{ left: `${playhead * pxPerSec}px` }}
              className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-40 pointer-events-none"
            >
              <div
                onPointerDown={startScrub}
                title="Drag to scrub playhead"
                className="pointer-events-auto touch-none cursor-ew-resize w-5 h-5 -ml-[9px] -mt-1 flex items-start justify-center"
              >
                <div className="w-3 h-3 bg-amber-500 rotate-45 rounded-[1px] shadow" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
