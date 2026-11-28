import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Film, Image as ImageIcon, Loader2, Lock, X } from 'lucide-react';
import { ASPECT_RATIO_OPTIONS } from '../data/presets';
import {
  AspectRatioId,
  AudioClip,
  EditDocument,
  MediaAsset,
  TimelineClip,
  TimelineOverlayItem,
  WorkspaceMode,
} from '../types/editor';
import {
  computeTargetDimensions,
  getSourceDimensions,
  renderFrameToCanvas,
} from '../utils/renderEngine';
import { clamp } from '../utils/timecode';

interface ExportModalProps {
  isOpen: boolean;
  isAuthenticated: boolean;
  workspace: WorkspaceMode;
  projectName: string;
  activeAsset: MediaAsset | null;
  activeEdits: EditDocument;
  assets: MediaAsset[];
  sourceMap: Record<string, HTMLImageElement | HTMLVideoElement>;
  clips: TimelineClip[];
  selectedClip: TimelineClip | null;
  playhead: number;
  globalOverlays: TimelineOverlayItem[];
  audioClips: AudioClip[];
  sequenceAspect: AspectRatioId;
  totalDuration: number;
  onRequireAuth: (reason: string) => void;
  onClose: () => void;
}

type VideoExportScope = 'full-timeline' | 'selected-clip' | 'current-frame';
type VideoCodecChoice = 'auto' | 'vp9' | 'vp8';

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  isAuthenticated,
  workspace,
  projectName,
  activeAsset,
  activeEdits,
  assets,
  sourceMap,
  clips,
  selectedClip,
  playhead,
  globalOverlays,
  audioClips,
  sequenceAspect,
  totalDuration,
  onRequireAuth,
  onClose,
}) => {
  const [exportScope, setExportScope] = useState<VideoExportScope>('full-timeline');
  const [targetAspect, setTargetAspect] = useState<AspectRatioId>(sequenceAspect);
  const [videoScale, setVideoScale] = useState<'720p' | '1080p'>(isAuthenticated ? '1080p' : '720p');
  const [videoCodec, setVideoCodec] = useState<VideoCodecChoice>('auto');
  const [includeAudio, setIncludeAudio] = useState<boolean>(true);

  const [photoFormat, setPhotoFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>(
    'image/jpeg'
  );
  const [photoMaxEdge, setPhotoMaxEdge] = useState<number>(2400);
  const [jpegQuality, setJpegQuality] = useState<number>(92);
  const [fileName, setFileName] = useState<string>('kinoframe-export');

  const [exporting, setExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetAspect(sequenceAspect);
      if (
        workspace === 'photo' &&
        activeEdits.bgRemoval?.enabled &&
        activeEdits.bgRemoval.backdropMode === 'transparent'
      ) {
        setPhotoFormat('image/png');
      }
      if (!isAuthenticated) {
        setVideoScale('720p');
        setPhotoMaxEdge(1200);
      }
      const slug = (projectName || activeAsset?.name || 'kinoframe-export')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setFileName(slug || 'kinoframe-export');
      setDoneMessage(null);
      setErrorMessage(null);
      setProgress(0);
      if (exportScope === 'selected-clip' && !selectedClip) {
        setExportScope('full-timeline');
      }
    }
  }, [
    isOpen,
    isAuthenticated,
    sequenceAspect,
    projectName,
    activeAsset,
    selectedClip,
    exportScope,
    workspace,
    activeEdits.bgRemoval,
  ]);

  const clipsToRender = useMemo(() => {
    if (exportScope === 'selected-clip' && selectedClip) {
      return [selectedClip];
    }
    return clips;
  }, [exportScope, selectedClip, clips]);

  const maxOverlayEnd = useMemo(() => {
    if (globalOverlays.length === 0) return 0;
    return Math.max(0, ...globalOverlays.map((o) => o.startTime + o.duration));
  }, [globalOverlays]);

  const effectiveExportDuration = useMemo(() => {
    const clipsDur = clipsToRender.reduce(
      (sum, c) => sum + Math.max(0.15, (c.trimEnd - c.trimStart) / c.speed),
      0
    );
    if (exportScope === 'full-timeline') {
      return Math.max(clipsDur, maxOverlayEnd);
    }
    return clipsDur;
  }, [clipsToRender, exportScope, maxOverlayEnd]);

  if (!isOpen) return null;

  const isStillMode = workspace === 'photo' || exportScope === 'current-frame';
  const safeBaseName =
    fileName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || 'kinoframe-export';

  const loadExportOverlayVideos = async (overlaysToLoad: TimelineOverlayItem[]) => {
    const map: Record<string, HTMLVideoElement> = {};
    const videoOverlays = overlaysToLoad.filter((o) => o.kind === 'video');
    await Promise.all(
      videoOverlays.map(async (ov) => {
        const asset = ov.overlayAssetId
          ? assets.find((a) => a.id === ov.overlayAssetId)
          : undefined;
        const srcUrl = ov.overlaySrc || asset?.src;
        if (!srcUrl) return;
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'auto';
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 2500);
          vid.onloadeddata = () => {
            window.clearTimeout(timer);
            resolve();
          };
          vid.onerror = () => {
            window.clearTimeout(timer);
            resolve();
          };
          vid.src = srcUrl;
        });
        map[ov.id] = vid;
      })
    );
    return map;
  };

  const handleStillExport = async () => {
    const hasOverlayOnlyTimeline =
      workspace === 'timeline' && clips.length === 0 && globalOverlays.length > 0;
    const assetForStill =
      workspace === 'photo'
        ? activeAsset
        : selectedClip
          ? { id: selectedClip.assetId, name: selectedClip.name }
          : clips[0]
            ? { id: clips[0].assetId, name: clips[0].name }
            : activeAsset;

    if (!assetForStill && !hasOverlayOnlyTimeline) {
      setErrorMessage('No frame or photo available to export.');
      return;
    }

    const source = assetForStill ? sourceMap[assetForStill.id] || null : null;
    if (!source && !hasOverlayOnlyTimeline) {
      setErrorMessage('Source media is still loading or missing.');
      return;
    }

    setErrorMessage(null);
    const ratioOverride =
      workspace === 'timeline'
        ? ASPECT_RATIO_OPTIONS.find((r) => r.id === targetAspect)?.ratio ?? 16 / 9
        : undefined;
    const { w, h } = source
      ? getSourceDimensions(source)
      : { w: ratioOverride && ratioOverride < 1 ? 1080 : 1920, h: ratioOverride && ratioOverride < 1 ? 1920 : 1080 };
    const maxEdge = photoMaxEdge === 0 ? Math.max(w, h) : photoMaxEdge;
    const dims = computeTargetDimensions(w, h, activeEdits, maxEdge, ratioOverride);

    const offscreen = document.createElement('canvas');
    offscreen.width = dims.width;
    offscreen.height = dims.height;

    const overlayVideos =
      workspace === 'timeline' ? await loadExportOverlayVideos(globalOverlays) : {};
    if (workspace === 'timeline') {
      await Promise.all(
        globalOverlays.map(async (ov) => {
          const v = overlayVideos[ov.id];
          if (!v) return;
          const localT = clamp(
            (ov.sourceTrimStart || 0) + (playhead - ov.startTime) * (ov.sourceSpeed || 1),
            0,
            v.duration || ov.sourceDuration || 10
          );
          if (Math.abs(v.currentTime - localT) > 0.04) {
            await new Promise<void>((resolve) => {
              const timer = window.setTimeout(resolve, 600);
              v.onseeked = () => {
                window.clearTimeout(timer);
                resolve();
              };
              v.currentTime = localT;
            });
          }
        })
      );
    }

    renderFrameToCanvas(offscreen, source, {
      edits: activeEdits,
      globalTime: playhead,
      globalOverlays: workspace === 'timeline' ? globalOverlays : [],
      overlayVideos,
      showDrawnGuide: false,
    });

    Object.values(overlayVideos).forEach((v) => {
      v.src = '';
    });

    const ext =
      photoFormat === 'image/png' ? 'png' : photoFormat === 'image/webp' ? 'webp' : 'jpg';
    const dataUrl = offscreen.toDataURL(photoFormat, jpegQuality / 100);
    const link = document.createElement('a');
    link.download = `${safeBaseName}.${ext}`;
    link.href = dataUrl;
    link.click();

    setDoneMessage(`Exported ${dims.width}×${dims.height} ${ext.toUpperCase()} (${safeBaseName}.${ext}).`);
  };

  const handleVideoExport = async () => {
    const hasOverlayOnly = exportScope === 'full-timeline' && globalOverlays.length > 0;
    if (clipsToRender.length === 0 && !hasOverlayOnly) {
      setErrorMessage('Add at least one clip or overlay to the timeline before exporting video.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setErrorMessage('Your browser does not support MediaRecorder video export.');
      return;
    }

    setExporting(true);
    setProgress(0);
    setDoneMessage(null);
    setErrorMessage(null);

    let audioCtx: AudioContext | null = null;
    const activeSources: AudioBufferSourceNode[] = [];
    let overlayVideosMap: Record<string, HTMLVideoElement> = {};

    try {
      const ratioObj = ASPECT_RATIO_OPTIONS.find((r) => r.id === targetAspect);
      const ratio = ratioObj?.ratio ?? 16 / 9;
      const baseLong = videoScale === '1080p' ? 1920 : 1280;
      let width = ratio >= 1 ? baseLong : Math.round(baseLong * ratio);
      let height = ratio >= 1 ? Math.round(baseLong / ratio) : baseLong;
      width = width - (width % 2);
      height = height - (height % 2);

      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;

      if (exportScope === 'full-timeline') {
        overlayVideosMap = await loadExportOverlayVideos(globalOverlays);
      }

      const videoStream = offscreen.captureStream(30);
      const combinedTracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

      const unmutedAudio =
        includeAudio && exportScope === 'full-timeline'
          ? audioClips.filter((a) => !a.muted)
          : [];

      if (unmutedAudio.length > 0 && typeof AudioContext !== 'undefined') {
        try {
          audioCtx = new AudioContext();
          const dest = audioCtx.createMediaStreamDestination();
          const now = audioCtx.currentTime + 0.05;

          await Promise.all(
            unmutedAudio.map(async (ac) => {
              const res = await fetch(ac.src);
              const arr = await res.arrayBuffer();
              const decoded = await audioCtx!.decodeAudioData(arr);
              const srcNode = audioCtx!.createBufferSource();
              srcNode.buffer = decoded;
              const gain = audioCtx!.createGain();
              gain.gain.setValueAtTime(ac.volume, now + ac.startTime);

              const dur = Math.max(0.2, ac.trimEnd - ac.trimStart);
              if (ac.fadeIn > 0) {
                gain.gain.setValueAtTime(0.001, now + ac.startTime);
                gain.gain.linearRampToValueAtTime(ac.volume, now + ac.startTime + ac.fadeIn);
              }
              if (ac.fadeOut > 0 && dur > ac.fadeOut) {
                gain.gain.setValueAtTime(ac.volume, now + ac.startTime + dur - ac.fadeOut);
                gain.gain.linearRampToValueAtTime(0.001, now + ac.startTime + dur);
              }

              srcNode.connect(gain);
              gain.connect(dest);
              srcNode.start(now + ac.startTime, ac.trimStart, dur);
              activeSources.push(srcNode);
            })
          );

          dest.stream.getAudioTracks().forEach((t) => combinedTracks.push(t));
        } catch {
          // Proceed with video-only if audio decode fails
        }
      }

      const combinedStream = new MediaStream(combinedTracks);
      const preferredMime =
        videoCodec === 'vp8'
          ? 'video/webm;codecs=vp8,opus'
          : videoCodec === 'vp9'
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm;codecs=vp9,opus';

      const mimeType = MediaRecorder.isTypeSupported(preferredMime)
        ? preferredMime
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: videoScale === '1080p' ? 6_000_000 : 3_200_000,
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordingDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };
      });

      recorder.start();

      let cursor = 0;
      const spans = clipsToRender.map((clip) => {
        const len = Math.max(0.15, (clip.trimEnd - clip.trimStart) / clip.speed);
        const start = cursor;
        cursor += len;
        return { clip, start, len };
      });

      const renderDur = effectiveExportDuration;
      const fps = 30;
      const frameIntervalMs = 1000 / fps;
      const startTimeMs = performance.now();

      await new Promise<void>((resolve) => {
        const step = () => {
          const elapsedSec = (performance.now() - startTimeMs) / 1000;
          if (elapsedSec >= renderDur) {
            setProgress(100);
            resolve();
            return;
          }

          setProgress(Math.min(99, Math.round((elapsedSec / renderDur) * 100)));

          const activeSpan =
            spans.length > 0
              ? spans.find((s) => elapsedSec >= s.start && elapsedSec < s.start + s.len) ||
                spans[spans.length - 1]
              : null;

          if (exportScope === 'full-timeline') {
            for (const ov of globalOverlays) {
              if (ov.kind !== 'video') continue;
              const ovVid = overlayVideosMap[ov.id];
              if (!ovVid) continue;
              if (elapsedSec >= ov.startTime && elapsedSec <= ov.startTime + ov.duration) {
                const targetOvTime = clamp(
                  (ov.sourceTrimStart || 0) + (elapsedSec - ov.startTime) * (ov.sourceSpeed || 1),
                  0,
                  ovVid.duration || ov.sourceDuration || 10
                );
                if (Math.abs(ovVid.currentTime - targetOvTime) > 0.08) {
                  ovVid.currentTime = targetOvTime;
                }
              }
            }
          }

          if (activeSpan) {
            const src = sourceMap[activeSpan.clip.assetId] || null;
            const localElapsed = elapsedSec - activeSpan.start;
            const progress01 = clamp(localElapsed / activeSpan.len, 0, 1);

            if (src instanceof HTMLVideoElement) {
              const targetVideoTime = clamp(
                activeSpan.clip.trimStart + localElapsed * activeSpan.clip.speed,
                0,
                src.duration || 10
              );
              if (Math.abs(src.currentTime - targetVideoTime) > 0.08) {
                src.currentTime = targetVideoTime;
              }
            }

            renderFrameToCanvas(offscreen, src, {
              edits: activeSpan.clip.edits,
              clipProgress: progress01,
              clipTime: localElapsed,
              clipDuration: activeSpan.len,
              globalTime: elapsedSec,
              enableKenBurns: true,
              transitionIn: activeSpan.clip.transitionIn,
              transitionDuration: activeSpan.clip.transitionDuration,
              velocityPreset: activeSpan.clip.velocityPreset,
              clipKeyframes: activeSpan.clip.keyframes,
              clipKeyframeEasing: activeSpan.clip.keyframeEasing,
              globalOverlays: exportScope === 'full-timeline' ? globalOverlays : [],
              overlayVideos: exportScope === 'full-timeline' ? overlayVideosMap : undefined,
              showDrawnGuide: false,
            });
          } else if (exportScope === 'full-timeline' && globalOverlays.length > 0) {
            renderFrameToCanvas(offscreen, null, {
              edits: activeEdits,
              globalTime: elapsedSec,
              globalOverlays,
              overlayVideos: overlayVideosMap,
              showDrawnGuide: false,
            });
          }

          setTimeout(step, Math.max(8, frameIntervalMs - 2));
        };
        step();
      });

      recorder.stop();
      const blob = await recordingDone;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeBaseName}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);

      setDoneMessage(
        `Exported ${width}×${height} WebM (${renderDur.toFixed(1)}s) as ${safeBaseName}.webm.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to render video sequence.'
      );
    } finally {
      Object.values(overlayVideosMap).forEach((v) => {
        v.src = '';
      });
      activeSources.forEach((s) => {
        try {
          s.stop();
        } catch {
          // ignore
        }
      });
      if (audioCtx) {
        void audioCtx.close();
      }
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">
              {workspace === 'photo' ? 'Export Graded Photo' : 'Choose What to Export'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Select the exact source, format, resolution, and filename
            </p>
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={onClose}
            aria-label="Close export dialog"
            className="p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto studio-scroll">
          {/* Section 1: What You Have -> Choose Source Scope */}
          {workspace === 'timeline' ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">
                1. What You Have — Select What to Export
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => setExportScope('full-timeline')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    exportScope === 'full-timeline'
                      ? 'border-amber-500 bg-amber-500/15 text-zinc-50'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Film className="w-3.5 h-3.5 text-amber-400" />
                    <span>Full Edit</span>
                  </div>
                  <p className="text-[10px] font-mono text-zinc-400 mt-1">
                    {clips.length > 0 ? `${clips.length} clips` : `${globalOverlays.length} overlays`} ·{' '}
                    {totalDuration.toFixed(1)}s
                  </p>
                </button>

                <button
                  type="button"
                  disabled={exporting || !selectedClip}
                  onClick={() => setExportScope('selected-clip')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    exportScope === 'selected-clip'
                      ? 'border-amber-500 bg-amber-500/15 text-zinc-50'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold truncate">
                    <Film className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">Selected Clip</span>
                  </div>
                  <p className="text-[10px] font-mono text-zinc-400 mt-1 truncate">
                    {selectedClip ? selectedClip.name : 'None selected'}
                  </p>
                </button>

                <button
                  type="button"
                  disabled={exporting || (clips.length === 0 && globalOverlays.length === 0)}
                  onClick={() => setExportScope('current-frame')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    exportScope === 'current-frame'
                      ? 'border-amber-500 bg-amber-500/15 text-zinc-50'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Frame Still</span>
                  </div>
                  <p className="text-[10px] font-mono text-zinc-400 mt-1">
                    PNG / JPG / WebP
                  </p>
                </button>
              </div>

              {clipsToRender.length > 0 && exportScope !== 'current-frame' && (
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    Clips included ({clipsToRender.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {clipsToRender.slice(0, 6).map((c) => (
                      <span
                        key={c.id}
                        className="px-2 py-0.5 text-[11px] rounded bg-zinc-800 text-zinc-200 truncate max-w-[160px]"
                      >
                        {c.name}
                      </span>
                    ))}
                    {clipsToRender.length > 6 && (
                      <span className="px-2 py-0.5 text-[11px] font-mono text-zinc-400">
                        +{clipsToRender.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            activeAsset && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5 flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200 truncate">{activeAsset.name}</span>
                <span className="font-mono text-zinc-400 shrink-0">
                  {activeAsset.width}×{activeAsset.height}
                </span>
              </div>
            )
          )}

          {/* Section 2: Export Format & Settings */}
          {isStillMode ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Image Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'image/jpeg', label: 'JPEG' },
                      { id: 'image/png', label: 'PNG' },
                      { id: 'image/webp', label: 'WebP' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPhotoFormat(f.id)}
                      className={`py-2 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
                        photoFormat === f.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Output Size
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { edge: 0, label: 'Original', locked: !isAuthenticated },
                    { edge: 2400, label: '2400px', locked: !isAuthenticated },
                    { edge: 1200, label: '1200px Web', locked: false },
                  ].map((sz) => (
                    <button
                      key={sz.edge}
                      type="button"
                      onClick={() => {
                        if (sz.locked) {
                          onClose();
                          onRequireAuth(`Sign in or create an account to export at ${sz.label} resolution.`);
                          return;
                        }
                        setPhotoMaxEdge(sz.edge);
                      }}
                      className={`py-1.5 text-xs font-mono rounded-md border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                        photoMaxEdge === sz.edge
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <span>{sz.label}</span>
                      {sz.locked && <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {photoFormat !== 'image/png' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">Compression Quality</span>
                    <span className="font-mono text-zinc-400 tabular-nums">{jpegQuality}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    value={jpegQuality}
                    onChange={(e) => setJpegQuality(Number(e.target.value))}
                    className="studio-slider"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Export Aspect Ratio
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['16:9', '9:16', '1:1', '4:5', '2.39:1'] as AspectRatioId[]).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      disabled={exporting}
                      onClick={() => setTargetAspect(ratio)}
                      className={`py-1.5 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
                        targetAspect === ratio
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">
                    Resolution
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['720p', '1080p'] as const).map((res) => {
                      const locked = res === '1080p' && !isAuthenticated;
                      return (
                        <button
                          key={res}
                          type="button"
                          disabled={exporting}
                          onClick={() => {
                            if (locked) {
                              onClose();
                              onRequireAuth('Sign in or create an account to unlock 1080p HD Video Export.');
                              return;
                            }
                            setVideoScale(res);
                          }}
                          className={`py-2 text-xs font-mono rounded-md border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                            videoScale === res
                              ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          <span>{res}</span>
                          {locked && <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">
                    Video Codec
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'auto', label: 'Auto' },
                        { id: 'vp9', label: 'VP9' },
                        { id: 'vp8', label: 'VP8' },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={exporting}
                        onClick={() => setVideoCodec(c.id)}
                        className={`py-2 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
                          videoCodec === c.id
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {exportScope === 'full-timeline' && audioClips.length > 0 && (
                <label className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-300 cursor-pointer">
                  <span>Include Track A1 audio ({audioClips.length} tracks)</span>
                  <input
                    type="checkbox"
                    checked={includeAudio}
                    disabled={exporting}
                    onChange={(e) => setIncludeAudio(e.target.checked)}
                    className="accent-amber-500"
                  />
                </label>
              )}

              {exporting && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      Encoding video...
                    </span>
                    <span className="font-mono text-amber-400 tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Output File Name */}
          <div className="space-y-1.5">
            <label htmlFor="export-filename" className="block text-xs font-medium text-zinc-300">
              Export File Name
            </label>
            <div className="flex items-center gap-2">
              <input
                id="export-filename"
                type="text"
                disabled={exporting}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="flex-1 px-3 py-2 text-xs font-mono bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
              />
              <span className="text-xs font-mono text-zinc-500 shrink-0">
                {isStillMode
                  ? photoFormat === 'image/png'
                    ? '.png'
                    : photoFormat === 'image/webp'
                      ? '.webp'
                      : '.jpg'
                  : '.webm'}
              </span>
            </div>
          </div>

          {errorMessage && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
              {errorMessage}
            </p>
          )}

          {doneMessage && (
            <p className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900/50 rounded-md px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{doneMessage}</span>
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
            <button
              type="button"
              disabled={exporting}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 hover:text-zinc-50 rounded-md border border-zinc-800 bg-zinc-900 cursor-pointer whitespace-nowrap"
            >
              Close
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={isStillMode ? handleStillExport : handleVideoExport}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-zinc-50 hover:bg-amber-400 rounded-md transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {exporting
                  ? 'Rendering...'
                  : isStillMode
                    ? 'Download Image'
                    : 'Render & Download'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
