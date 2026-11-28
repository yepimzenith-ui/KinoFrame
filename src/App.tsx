import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { ExportModal } from './components/ExportModal';
import { Header } from './components/Header';
import { Inspector } from './components/Inspector';
import { LeftToolRail } from './components/LeftToolRail';
import { PresetsGallery } from './components/PresetsGallery';
import { SaveProjectModal } from './components/SaveProjectModal';
import { StageViewport } from './components/StageViewport';
import { StartScreen } from './components/StartScreen';
import { StudioMenu } from './components/StudioMenu';
import { Timeline } from './components/Timeline';
import {
  auth,
  createUserWithEmailAndPassword,
  googleProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from './lib/firebase';
import {
  checkUsernameAvailability,
  claimOrUpdateUsername,
  clearPendingUsername,
  deleteProjectFromFirestore,
  getPendingUsername,
  hydrateProjectAssets,
  SavedProjectRecord,
  savePendingUsername,
  saveProjectToFirestore,
  subscribeToUserProjects,
  syncUserProfile,
} from './lib/projectsService';
import {
  ASPECT_RATIO_OPTIONS,
  createDefaultEdits,
  DEFAULT_BG_REMOVAL,
  DEFAULT_COLOR_GRADE,
  DEFAULT_EFFECTS,
  DEFAULT_MASK,
  FILM_PRESETS,
  MASK_OVERLAY_PRESETS,
  normalizeTextEffects,
  SAMPLE_MEDIA_ASSETS,
  TEXT_STYLE_TEMPLATES,
  VISUAL_OVERLAY_PRESETS,
} from './data/presets';
import {
  AspectRatioId,
  AudioAsset,
  AudioClip,
  BgBrushToolMode,
  BgDrawnPolygon,
  BgPickPoint,
  BgRemovalSettings,
  BgRemovalStroke,
  CanvasBgMode,
  ClipAnimationSettings,
  ClipKeyframe,
  ColorGrade,
  CropRect,
  EditDocument,
  EffectsSettings,
  InspectorTab,
  LeftDrawerTab,
  MaskOverlayPresetId,
  MaskSettings,
  MaskShape,
  MediaAsset,
  OverlayLayerOrder,
  PhotoVisualOverlay,
  StickerKind,
  TextOverlay,
  TextStyleTemplateId,
  TimelineClip,
  TimelineOverlayItem,
  TransformSettings,
  VisualOverlayPresetId,
  WorkspaceMode,
} from './types/editor';
import { createBuiltInAudioLibrary, extractPeaksFromAudioFile } from './utils/audioSynth';
import {
  computeHistogram,
  computeTargetDimensions,
  evaluateClipKeyframes,
  evaluateOverlayAtTime,
  extractCutoutAsPngOverlay,
  getSourceDimensions,
  HistogramData,
  preloadOverlayImage,
  renderFrameToCanvas,
} from './utils/renderEngine';
import { clamp } from './utils/timecode';

function cloneEdits(edits: EditDocument): EditDocument {
  return {
    color: { ...edits.color },
    transform: { ...edits.transform, crop: { ...edits.transform.crop } },
    mask: { ...(edits.mask || DEFAULT_MASK) },
    bgRemoval: edits.bgRemoval
      ? {
          ...edits.bgRemoval,
          pickPoints: [...(edits.bgRemoval.pickPoints || [])],
          strokes: [...(edits.bgRemoval.strokes || [])],
          drawnPolygons: [...(edits.bgRemoval.drawnPolygons || [])],
        }
      : { ...DEFAULT_BG_REMOVAL, pickPoints: [], strokes: [], drawnPolygons: [] },
    effects: { ...DEFAULT_EFFECTS, ...edits.effects },
    animation: { ...edits.animation },
    overlays: edits.overlays.map((o) => ({
      ...o,
      text3d: o.text3d ? normalizeTextEffects(o.text3d) : undefined,
    })),
    visualOverlays: (edits.visualOverlays || []).map((o) => ({
      ...o,
      bgRemoval: o.bgRemoval
        ? {
            ...o.bgRemoval,
            pickPoints: [...(o.bgRemoval.pickPoints || [])],
            strokes: [...(o.bgRemoval.strokes || [])],
            drawnPolygons: [...(o.bgRemoval.drawnPolygons || [])],
          }
        : undefined,
    })),
  };
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceMode>('start');
  const [leftTab, setLeftTab] = useState<LeftDrawerTab>('media');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState<boolean>(false);

  const [assets, setAssets] = useState<MediaAsset[]>(SAMPLE_MEDIA_ASSETS);
  const [activeAssetId, setActiveAssetId] = useState<string>(SAMPLE_MEDIA_ASSETS[0].id);
  const [photoEdits, setPhotoEdits] = useState<Record<string, EditDocument>>(() => ({
    'sample-tokyo': createDefaultEdits('none', 'cover'),
  }));

  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>(() =>
    createBuiltInAudioLibrary()
  );

  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [globalOverlays, setGlobalOverlays] = useState<TimelineOverlayItem[]>([]);
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [beatBpm, setBeatBpm] = useState<number>(120);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedGlobalOverlayId, setSelectedGlobalOverlayId] = useState<string | null>(null);
  const [selectedPhotoOverlayId, setSelectedPhotoOverlayId] = useState<string | null>(null);
  const [selectedPhotoVisualOverlayId, setSelectedPhotoVisualOverlayId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

  const [sequenceAspect, setSequenceAspect] = useState<AspectRatioId>('16:9');
  const [playhead, setPlayhead] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('color');
  const [cropMode, setCropMode] = useState<boolean>(false);
  const [maskMode, setMaskMode] = useState<boolean>(false);
  const [bgBrushMode, setBgBrushMode] = useState<BgBrushToolMode>('none');
  const [bgBrushSize, setBgBrushSize] = useState<number>(0.055);
  const [bgEyedropperActive, setBgEyedropperActive] = useState<boolean>(false);
  const [compareSplit, setCompareSplit] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [presetsOpen, setPresetsOpen] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [menuDrawerOpen, setMenuDrawerOpen] = useState<boolean>(false);
  const [chosenAspect, setChosenAspect] = useState<AspectRatioId>('16:9');
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const [authFeatureReason, setAuthFeatureReason] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false);
  const [pendingSaveAfterAuth, setPendingSaveAfterAuth] = useState<boolean>(false);

  const [user, setUser] = useState<User | null>(null);
  const [authRevision, setAuthRevision] = useState<number>(0);
  const isAccountUnlocked = Boolean(user && user.emailVerified);
  const requireAuth = useCallback((reason: string) => {
    setPendingSaveAfterAuth(false);
    setAuthFeatureReason(reason);
    setAuthModalTab('login');
    setAuthModalOpen(true);
  }, []);
  const [studioDisplayName, setStudioDisplayName] = useState<string>('');
  const [studioUsername, setStudioUsername] = useState<string>('');
  const [pendingUsername, setPendingUsername] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [savedProjects, setSavedProjects] = useState<SavedProjectRecord[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>('Untitled Sequence');
  const [isProjectSaved, setIsProjectSaved] = useState<boolean>(false);
  const [savingProject, setSavingProject] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [copiedGrade, setCopiedGrade] = useState<Pick<EditDocument, 'color' | 'effects'> | null>(
    null
  );
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null);
  const [sourceVersion, setSourceVersion] = useState<number>(0);

  const [undoStack, setUndoStack] = useState<EditDocument[]>([]);
  const [redoStack, setRedoStack] = useState<EditDocument[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceMapRef = useRef<Record<string, HTMLImageElement | HTMLVideoElement>>({});
  const overlayVideoMapRef = useRef<Record<string, HTMLVideoElement>>({});
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioPlayersRef = useRef<Record<string, HTMLAudioElement>>({});
  const skipDirtyMarkRef = useRef<boolean>(true);
  const lastHistoryTimestampRef = useRef<number>(0);
  const pendingVideoSeekRef = useRef<{ el: HTMLVideoElement; time: number } | null>(null);
  const lastNeuralReadyBumpRef = useRef<number>(0);
  const workspaceRef = useRef<WorkspaceMode>(workspace);
  workspaceRef.current = workspace;

  const pendingSaveAfterAuthRef = useRef<boolean>(false);
  pendingSaveAfterAuthRef.current = pendingSaveAfterAuth;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthRevision((r) => r + 1);
      setAuthLoading(false);
      if (nextUser) {
        setPendingUsername(getPendingUsername(nextUser.uid));
        if (nextUser.emailVerified) {
          void syncUserProfile(nextUser)
            .then((profile) => {
              setStudioDisplayName(profile.displayName);
              setStudioUsername(profile.username);
              setPendingUsername('');
            })
            .catch(() => {});
          if (pendingSaveAfterAuthRef.current) {
            setPendingSaveAfterAuth(false);
            setSaveModalOpen(true);
          }
        } else {
          setStudioDisplayName(nextUser.displayName || '');
          setStudioUsername('');
        }
      } else {
        setStudioDisplayName('');
        setStudioUsername('');
        setPendingUsername('');
        setSavedProjects([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (authLoading || !user || !user.emailVerified) return;
    const unsub = subscribeToUserProjects(user.uid, (items) => {
      setSavedProjects(items);
    });
    return () => unsub();
  }, [authLoading, user, authRevision]);

  useEffect(() => {
    if (skipDirtyMarkRef.current) {
      skipDirtyMarkRef.current = false;
      return;
    }
    setIsProjectSaved(false);
  }, [clips, globalOverlays, audioClips, photoEdits, sequenceAspect, beatBpm]);

  useEffect(() => {
    if (!statusNotice) return;
    const timer = window.setTimeout(() => setStatusNotice(null), 3800);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  useEffect(() => {
    for (const asset of assets) {
      if (sourceMapRef.current[asset.id]) continue;
      if (asset.kind === 'photo') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          sourceMapRef.current[asset.id] = img;
          setSourceVersion((v) => v + 1);
        };
        img.src = asset.src;
      } else {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.onloadeddata = () => {
          sourceMapRef.current[asset.id] = vid;
          setSourceVersion((v) => v + 1);
        };
        vid.src = asset.src;
      }
    }
  }, [assets]);

  useEffect(() => {
    const activeIds = new Set<string>();
    for (const ov of globalOverlays) {
      if (ov.kind === 'image' && ov.overlaySrc) {
        preloadOverlayImage(ov.overlaySrc, () => setSourceVersion((v) => v + 1));
      } else if (ov.kind === 'video') {
        activeIds.add(ov.id);
        const asset = ov.overlayAssetId
          ? assets.find((a) => a.id === ov.overlayAssetId)
          : undefined;
        const srcUrl = ov.overlaySrc || asset?.src;
        if (srcUrl && !overlayVideoMapRef.current[ov.id]) {
          const vid = document.createElement('video');
          vid.crossOrigin = 'anonymous';
          vid.playsInline = true;
          vid.preload = 'auto';
          vid.muted = ov.muted ?? true;
          vid.onloadeddata = () => {
            setSourceVersion((v) => v + 1);
          };
          vid.src = srcUrl;
          overlayVideoMapRef.current[ov.id] = vid;
        }
      }
    }
    for (const [id, vid] of Object.entries(overlayVideoMapRef.current)) {
      if (!activeIds.has(id)) {
        vid.pause();
        vid.src = '';
        delete overlayVideoMapRef.current[id];
      }
    }
    for (const ed of Object.values(photoEdits)) {
      for (const pov of ed.visualOverlays || []) {
        if (pov.kind === 'image' && pov.imageSrc) {
          preloadOverlayImage(pov.imageSrc, () => setSourceVersion((v) => v + 1));
        }
      }
    }
  }, [globalOverlays, photoEdits, assets]);

  const clipSpans = useMemo(() => {
    let cursor = 0;
    return clips.map((clip) => {
      const len = Math.max(0.15, (clip.trimEnd - clip.trimStart) / clip.speed);
      const start = cursor;
      cursor += len;
      return { clip, start, len };
    });
  }, [clips]);

  const totalDuration = useMemo(() => {
    const v1End =
      clipSpans.length === 0
        ? 0
        : clipSpans[clipSpans.length - 1].start + clipSpans[clipSpans.length - 1].len;
    const maxOverlayEnd = globalOverlays.reduce(
      (mx, o) => Math.max(mx, o.startTime + o.duration),
      0
    );
    return Math.max(v1End, maxOverlayEnd);
  }, [clipSpans, globalOverlays]);

  const activeTimelineSpan = useMemo(() => {
    if (clipSpans.length === 0) return null;
    return (
      clipSpans.find((s) => playhead >= s.start && playhead < s.start + s.len) ||
      clipSpans[clipSpans.length - 1]
    );
  }, [clipSpans, playhead]);

  const inspectedSpan = useMemo(() => {
    if (workspace !== 'timeline') return null;
    return (
      clipSpans.find((s) => s.clip.id === selectedClipId) || activeTimelineSpan || null
    );
  }, [workspace, clipSpans, selectedClipId, activeTimelineSpan]);

  const inspectedClip = inspectedSpan?.clip || null;

  const currentAsset = useMemo(() => {
    if (workspace === 'timeline') {
      if (clips.length === 0) return null;
      const clip = isPlaying ? activeTimelineSpan?.clip : inspectedClip;
      return assets.find((a) => a.id === clip?.assetId) || null;
    }
    return assets.find((a) => a.id === activeAssetId) || assets[0] || null;
  }, [workspace, clips.length, isPlaying, activeTimelineSpan, inspectedClip, assets, activeAssetId]);

  const currentEdits = useMemo<EditDocument>(() => {
    if (workspace === 'timeline') {
      const clip = isPlaying ? activeTimelineSpan?.clip : inspectedClip;
      return clip ? clip.edits : createDefaultEdits('none', 'contain');
    }
    return photoEdits[activeAssetId] || createDefaultEdits('none', 'cover');
  }, [workspace, isPlaying, activeTimelineSpan, inspectedClip, photoEdits, activeAssetId]);

  const stageDimensions = useMemo(() => {
    const srcEl = currentAsset ? sourceMapRef.current[currentAsset.id] : null;
    const { w, h } = srcEl
      ? getSourceDimensions(srcEl)
      : { w: currentAsset?.width || 1280, h: currentAsset?.height || 720 };

    if (workspace === 'timeline') {
      const ratioOpt = ASPECT_RATIO_OPTIONS.find((o) => o.id === sequenceAspect);
      return computeTargetDimensions(w, h, currentEdits, 960, ratioOpt?.ratio ?? 16 / 9);
    }
    return computeTargetDimensions(w, h, currentEdits, 960);
  }, [currentAsset, currentEdits, workspace, sequenceAspect, sourceVersion]);

  const updateCurrentEdits = useCallback(
    (updater: (prev: EditDocument) => EditDocument, recordHistory = true) => {
      if (recordHistory) {
        const now = Date.now();
        if (now - lastHistoryTimestampRef.current > 450) {
          setUndoStack((prev) => [...prev.slice(-29), cloneEdits(currentEdits)]);
          setRedoStack([]);
        }
        lastHistoryTimestampRef.current = now;
      }

      if (workspace === 'timeline') {
        const targetId = inspectedClip?.id;
        if (!targetId) return;
        setClips((prev) =>
          prev.map((c) => (c.id === targetId ? { ...c, edits: updater(c.edits) } : c))
        );
      } else {
        setPhotoEdits((prev) => {
          const base = prev[activeAssetId] || createDefaultEdits('none', 'cover');
          return { ...prev, [activeAssetId]: updater(base) };
        });
      }
    },
    [workspace, inspectedClip, activeAssetId, currentEdits]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    lastHistoryTimestampRef.current = 0;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, cloneEdits(currentEdits)]);
    updateCurrentEdits(() => previous, false);
  }, [undoStack, currentEdits, updateCurrentEdits]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    lastHistoryTimestampRef.current = 0;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, cloneEdits(currentEdits)]);
    updateCurrentEdits(() => next, false);
  }, [redoStack, currentEdits, updateCurrentEdits]);

  const renderCurrentStage = useCallback(() => {
    if (workspace === 'start') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!currentAsset) {
      if (workspace === 'timeline' && globalOverlays.length > 0) {
        renderFrameToCanvas(canvas, null, {
          edits: currentEdits,
          globalTime: playhead,
          globalOverlays,
          overlayVideos: overlayVideoMapRef.current,
          showDrawnGuide: false,
        });
      } else {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHistogramData(null);
      }
      return;
    }

    const span = workspace === 'timeline' ? activeTimelineSpan : null;
    const renderAssetId = span ? span.clip.assetId : currentAsset.id;
    const srcEl = sourceMapRef.current[renderAssetId];
    if (!srcEl) return;

    const editsToRender = span ? span.clip.edits : currentEdits;
    const localTime = span ? Math.max(0, playhead - span.start) : 0;
    const progress01 = span ? clamp(localTime / span.len, 0, 1) : 0;

    renderFrameToCanvas(canvas, srcEl, {
      edits: editsToRender,
      clipProgress: progress01,
      clipTime: localTime,
      clipDuration: span ? span.len : 4,
      globalTime: playhead,
      enableKenBurns: workspace === 'timeline',
      transitionIn: span ? span.clip.transitionIn : 'cut',
      transitionDuration: span ? span.clip.transitionDuration : 0,
      velocityPreset: span ? span.clip.velocityPreset : 'linear',
      clipKeyframes: span ? span.clip.keyframes : [],
      clipKeyframeEasing: span ? span.clip.keyframeEasing : 'ease-out',
      globalOverlays: workspace === 'timeline' ? globalOverlays : [],
      overlayVideos: workspace === 'timeline' ? overlayVideoMapRef.current : undefined,
      showDrawnGuide:
        bgBrushMode !== 'none' || editsToRender.bgRemoval?.mode === 'drawn',
      onAsyncMatteReady: () => {
        const now = performance.now();
        if (now - lastNeuralReadyBumpRef.current > 120) {
          lastNeuralReadyBumpRef.current = now;
          setSourceVersion((v) => v + 1);
        }
      },
    });

    if (compareSplit && originalCanvasRef.current) {
      renderFrameToCanvas(originalCanvasRef.current, srcEl, {
        edits: editsToRender,
        bypassEdits: true,
      });
    }
  }, [
    workspace,
    currentAsset,
    activeTimelineSpan,
    currentEdits,
    playhead,
    compareSplit,
    globalOverlays,
    bgBrushMode,
    sourceVersion,
  ]);

  useEffect(() => {
    if (
      workspace === 'start' ||
      (!currentAsset && globalOverlays.length === 0)
    ) {
      setHistogramData(null);
      return;
    }
    if (isPlaying) return;
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        setHistogramData(computeHistogram(canvas));
      }
    }, 140);
    return () => window.clearTimeout(timer);
  }, [
    workspace,
    isPlaying,
    currentAsset,
    currentEdits,
    globalOverlays.length,
    playhead,
    sourceVersion,
  ]);

  useEffect(() => {
    if (workspace === 'start') return;
    if (!isPlaying) {
      let awaitingSeek = false;
      const span = workspace === 'timeline' ? activeTimelineSpan : null;
      const targetId = span ? span.clip.assetId : currentAsset?.id;
      const srcEl = targetId ? sourceMapRef.current[targetId] : null;
      if (srcEl instanceof HTMLVideoElement) {
        const localTime = span ? Math.max(0, playhead - span.start) : 0;
        const targetVideoTime = span
          ? clamp(span.clip.trimStart + localTime * span.clip.speed, 0, srcEl.duration || 10)
          : 0;
        if (Math.abs(srcEl.currentTime - targetVideoTime) > 0.04) {
          if (srcEl.seeking) {
            pendingVideoSeekRef.current = { el: srcEl, time: targetVideoTime };
            awaitingSeek = true;
          } else {
            const onSeeked = () => {
              const pending = pendingVideoSeekRef.current;
              if (pending && pending.el === srcEl) {
                pendingVideoSeekRef.current = null;
                if (Math.abs(srcEl.currentTime - pending.time) > 0.04) {
                  srcEl.addEventListener('seeked', onSeeked, { once: true });
                  srcEl.currentTime = pending.time;
                  return;
                }
              }
              renderCurrentStage();
            };
            srcEl.addEventListener('seeked', onSeeked, { once: true });
            srcEl.currentTime = targetVideoTime;
            awaitingSeek = true;
          }
        }
      }

      if (workspace === 'timeline') {
        for (const ov of globalOverlays) {
          if (ov.kind !== 'video') continue;
          const ovVid = overlayVideoMapRef.current[ov.id];
          if (!ovVid) continue;
          if (!ovVid.paused) ovVid.pause();
          if (playhead >= ov.startTime && playhead <= ov.startTime + ov.duration && ovVid.readyState >= 1) {
            const targetOvTime = clamp(
              (ov.sourceTrimStart || 0) + (playhead - ov.startTime) * (ov.sourceSpeed || 1),
              0,
              ovVid.duration || ov.sourceDuration || 10
            );
            if (Math.abs(ovVid.currentTime - targetOvTime) > 0.04 && !ovVid.seeking) {
              ovVid.addEventListener('seeked', () => renderCurrentStage(), { once: true });
              ovVid.currentTime = targetOvTime;
            }
          }
        }
      }

      if (!awaitingSeek) {
        renderCurrentStage();
      }
    }
  }, [isPlaying, workspace, activeTimelineSpan, currentAsset, globalOverlays, playhead, renderCurrentStage]);

  useEffect(() => {
    if (!isPlaying || workspace !== 'timeline' || totalDuration <= 0) {
      Object.values(audioPlayersRef.current).forEach((el) => el.pause());
      Object.values(overlayVideoMapRef.current).forEach((el) => el.pause());
      return;
    }

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setPlayhead((prev) => {
        const next = prev + dt;
        return next >= totalDuration ? 0 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (activeVideoRef.current) {
        activeVideoRef.current.pause();
        activeVideoRef.current = null;
      }
      Object.values(overlayVideoMapRef.current).forEach((el) => el.pause());
      Object.values(audioPlayersRef.current).forEach((el) => el.pause());
    };
  }, [isPlaying, workspace, totalDuration]);

  useEffect(() => {
    if (!isPlaying || workspace !== 'timeline') return;

    const span = activeTimelineSpan;
    if (span) {
      const srcEl = sourceMapRef.current[span.clip.assetId];
      if (srcEl instanceof HTMLVideoElement) {
        const localTime = Math.max(0, playhead - span.start);
        const targetVideoTime = clamp(
          span.clip.trimStart + localTime * span.clip.speed,
          0,
          srcEl.duration || 10
        );
        srcEl.playbackRate = span.clip.speed;
        srcEl.muted = span.clip.muted;
        if (srcEl.paused) {
          srcEl.currentTime = targetVideoTime;
          void srcEl.play().catch(() => {});
        } else if (Math.abs(srcEl.currentTime - targetVideoTime) > 0.25) {
          srcEl.currentTime = targetVideoTime;
        }
        activeVideoRef.current = srcEl;
      } else if (activeVideoRef.current) {
        activeVideoRef.current.pause();
        activeVideoRef.current = null;
      }
    }

    for (const ov of globalOverlays) {
      if (ov.kind !== 'video') continue;
      const ovVid = overlayVideoMapRef.current[ov.id];
      if (!ovVid) continue;
      const inside = playhead >= ov.startTime && playhead < ov.startTime + ov.duration;
      if (inside) {
        const targetOvTime = clamp(
          (ov.sourceTrimStart || 0) + (playhead - ov.startTime) * (ov.sourceSpeed || 1),
          0,
          ovVid.duration || ov.sourceDuration || 10
        );
        ovVid.playbackRate = ov.sourceSpeed || 1;
        ovVid.muted = ov.muted ?? true;
        if (ovVid.paused) {
          ovVid.currentTime = targetOvTime;
          void ovVid.play().catch(() => {});
        } else if (Math.abs(ovVid.currentTime - targetOvTime) > 0.25) {
          ovVid.currentTime = targetOvTime;
        }
      } else if (!ovVid.paused) {
        ovVid.pause();
      }
    }

    for (const ac of audioClips) {
      let player = audioPlayersRef.current[ac.id];
      if (!player) {
        player = new Audio(ac.src);
        audioPlayersRef.current[ac.id] = player;
      }
      const dur = Math.max(0.2, ac.trimEnd - ac.trimStart);
      const inside = !ac.muted && playhead >= ac.startTime && playhead < ac.startTime + dur;
      if (inside) {
        const offset = ac.trimStart + (playhead - ac.startTime);
        let gain = ac.volume;
        const localT = playhead - ac.startTime;
        if (ac.fadeIn > 0 && localT < ac.fadeIn) {
          gain *= clamp(localT / ac.fadeIn, 0, 1);
        }
        if (ac.fadeOut > 0 && dur - localT < ac.fadeOut) {
          gain *= clamp((dur - localT) / ac.fadeOut, 0, 1);
        }
        player.volume = clamp(gain, 0, 1);
        if (player.paused) {
          player.currentTime = offset;
          void player.play().catch(() => {});
        } else if (Math.abs(player.currentTime - offset) > 0.3) {
          player.currentTime = offset;
        }
      } else if (!player.paused) {
        player.pause();
      }
    }

    renderCurrentStage();
  }, [isPlaying, workspace, playhead, activeTimelineSpan, globalOverlays, audioClips, renderCurrentStage]);

  const handleSeek = useCallback(
    (time: number) => {
      setIsPlaying(false);
      setPlayhead(time);
      const hit = clipSpans.find((s) => time >= s.start && time < s.start + s.len);
      if (hit) setSelectedClipId(hit.clip.id);
    },
    [clipSpans]
  );

  const handleSplitAtPlayhead = useCallback(() => {
    const span = clipSpans.find(
      (s) => playhead > s.start + 0.12 && playhead < s.start + s.len - 0.12
    );
    if (!span) return;

    const splitOffset = (playhead - span.start) * span.clip.speed;
    const splitPoint = span.clip.trimStart + splitOffset;

    const firstHalf: TimelineClip = {
      ...span.clip,
      trimEnd: Number(splitPoint.toFixed(2)),
    };
    const secondHalf: TimelineClip = {
      ...span.clip,
      id: `clip-${Date.now()}`,
      trimStart: Number(splitPoint.toFixed(2)),
      transitionIn: 'cut',
      keyframes: [],
      edits: cloneEdits(span.clip.edits),
    };

    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === span.clip.id);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(idx, 1, firstHalf, secondHalf);
      return copy;
    });
    setSelectedClipId(secondHalf.id);
  }, [clipSpans, playhead]);

  const handleChopToBeat = useCallback(() => {
    if (!inspectedClip) return;
    const sliceDur = beatBpm > 0 ? Number((60 / beatBpm).toFixed(2)) : 0.5;
    const spanLen = (inspectedClip.trimEnd - inspectedClip.trimStart) / inspectedClip.speed;
    if (spanLen < sliceDur * 1.6) return;

    const parts: TimelineClip[] = [];
    const count = Math.min(8, Math.floor(spanLen / sliceDur));
    for (let i = 0; i < count; i++) {
      const tStart = inspectedClip.trimStart + i * sliceDur * inspectedClip.speed;
      const tEnd =
        i === count - 1
          ? inspectedClip.trimEnd
          : inspectedClip.trimStart + (i + 1) * sliceDur * inspectedClip.speed;
      parts.push({
        ...inspectedClip,
        id: i === 0 ? inspectedClip.id : `clip-${Date.now()}-${i}`,
        name: `${inspectedClip.name.split(' #')[0]} #${i + 1}`,
        trimStart: Number(tStart.toFixed(2)),
        trimEnd: Number(tEnd.toFixed(2)),
        transitionIn: i === 0 ? inspectedClip.transitionIn : 'cut',
        transitionDuration: 0.22,
        keyframes: [],
        edits: cloneEdits(inspectedClip.edits),
      });
    }

    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === inspectedClip.id);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(idx, 1, ...parts);
      return copy;
    });
    setSelectedClipId(parts[0].id);
  }, [inspectedClip, beatBpm]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedGlobalOverlayId) {
      setGlobalOverlays((prev) => prev.filter((o) => o.id !== selectedGlobalOverlayId));
      setSelectedGlobalOverlayId(null);
      return;
    }
    if (selectedAudioId) {
      setAudioClips((prev) => prev.filter((a) => a.id !== selectedAudioId));
      setSelectedAudioId(null);
      return;
    }
    if (selectedClipId) {
      setClips((prev) => prev.filter((c) => c.id !== selectedClipId));
      setSelectedClipId(null);
    }
  }, [selectedGlobalOverlayId, selectedAudioId, selectedClipId]);

  const handleImportFiles = useCallback((fileList: FileList) => {
    Array.from(fileList).forEach((file) => {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) return;

      const url = URL.createObjectURL(file);
      const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const cleanName = file.name.replace(/\.[^.]+$/, '');

      if (isImage) {
        const img = new Image();
        img.onload = () => {
          sourceMapRef.current[id] = img;
          const newAsset: MediaAsset = {
            id,
            name: cleanName,
            kind: 'photo',
            src: url,
            width: img.naturalWidth,
            height: img.naturalHeight,
            duration: 3.0,
          };
          setAssets((prev) => [newAsset, ...prev]);
          setActiveAssetId(id);
          if (workspaceRef.current === 'timeline') {
            const newClip: TimelineClip = {
              id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              assetId: id,
              name: cleanName,
              kind: 'photo',
              trimStart: 0,
              trimEnd: 3.0,
              duration: 3.0,
              speed: 1,
              velocityPreset: 'linear',
              volume: 1,
              muted: false,
              transitionIn: 'cut',
              transitionDuration: 0.3,
              keyframes: [],
              keyframeEasing: 'ease-out',
              edits: createDefaultEdits('none', 'contain'),
            };
            setClips((prev) => [...prev, newClip]);
            setSelectedClipId(newClip.id);
          } else if (workspaceRef.current === 'start') {
            setWorkspace('photo');
          }
          setSourceVersion((v) => v + 1);
        };
        img.src = url;
      } else {
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.playsInline = true;
        vid.onloadedmetadata = () => {
          sourceMapRef.current[id] = vid;
          const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 5;
          const newAsset: MediaAsset = {
            id,
            name: cleanName,
            kind: 'video',
            src: url,
            width: vid.videoWidth || 1280,
            height: vid.videoHeight || 720,
            duration: dur,
          };
          setAssets((prev) => [newAsset, ...prev]);
          setSourceVersion((v) => v + 1);

          const newClip: TimelineClip = {
            id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            assetId: id,
            name: cleanName,
            kind: 'video',
            trimStart: 0,
            trimEnd: Math.min(dur, 15),
            duration: dur,
            speed: 1,
            velocityPreset: 'linear',
            volume: 1,
            muted: false,
            transitionIn: 'cut',
            transitionDuration: 0.35,
            keyframes: [],
            keyframeEasing: 'ease-out',
            edits: createDefaultEdits('none', 'contain'),
          };
          setClips((prev) => [...prev, newClip]);
          setSelectedClipId(newClip.id);
          setSelectedGlobalOverlayId(null);
          setSelectedAudioId(null);
          setWorkspace('timeline');
        };
        vid.src = url;
      }
    });
  }, []);

  const handleImportAudioFiles = useCallback(async (fileList: FileList) => {
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('audio/')) continue;
      const url = URL.createObjectURL(file);
      const id = `uaudio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const cleanName = file.name.replace(/\.[^.]+$/, '');
      const { duration, peaks } = await extractPeaksFromAudioFile(url);
      const newAudio: AudioAsset = {
        id,
        name: cleanName,
        category: 'imported',
        src: url,
        duration,
        peaks,
      };
      setAudioAssets((prev) => [newAudio, ...prev]);
    }
  }, []);

  const handleAddToTimeline = useCallback(
    (assetId: string) => {
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) return;
      const baseDur = asset.kind === 'video' ? Math.max(0.5, asset.duration) : 3.0;
      const newClip: TimelineClip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        assetId: asset.id,
        name: asset.name,
        kind: asset.kind,
        trimStart: 0,
        trimEnd: baseDur,
        duration: baseDur,
        speed: 1,
        velocityPreset: 'linear',
        volume: 1,
        muted: false,
        transitionIn: 'cut',
        transitionDuration: 0.3,
        keyframes: [],
        keyframeEasing: 'ease-out',
        edits: createDefaultEdits('none', 'contain'),
      };
      setClips((prev) => [...prev, newClip]);
      setSelectedClipId(newClip.id);
      setSelectedGlobalOverlayId(null);
      setSelectedAudioId(null);
      setWorkspace('timeline');
      setIsPlaying(false);
    },
    [assets]
  );

  const handleAddAudioClip = useCallback(
    (audioAssetId: string) => {
      const asset = audioAssets.find((a) => a.id === audioAssetId);
      if (!asset) return;
      const newClip: AudioClip = {
        id: `aclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        audioAssetId: asset.id,
        name: asset.name,
        startTime: Number(playhead.toFixed(2)),
        trimStart: 0,
        trimEnd: Math.min(asset.duration, Math.max(1.5, totalDuration - playhead || asset.duration)),
        volume: 0.85,
        fadeIn: asset.category === 'music' ? 0.3 : 0,
        fadeOut: asset.category === 'music' ? 0.5 : 0,
        muted: false,
        peaks: asset.peaks,
        src: asset.src,
      };
      setAudioClips((prev) => [...prev, newClip]);
      setSelectedAudioId(newClip.id);
      setSelectedGlobalOverlayId(null);
      setWorkspace('timeline');
    },
    [audioAssets, playhead, totalDuration]
  );

  const handleSetBgBrushMode = useCallback((mode: BgBrushToolMode) => {
    setBgBrushMode(mode);
    if (mode !== 'none') {
      setCropMode(false);
      setMaskMode(false);
      setBgEyedropperActive(false);
    }
  }, []);

  const handleUpdateBgRemoval = useCallback(
    (patch: Partial<BgRemovalSettings>) => {
      updateCurrentEdits((prev) => ({
        ...prev,
        bgRemoval: {
          ...(prev.bgRemoval || DEFAULT_BG_REMOVAL),
          ...patch,
          pickPoints: patch.pickPoints ?? prev.bgRemoval?.pickPoints ?? [],
          strokes: patch.strokes ?? prev.bgRemoval?.strokes ?? [],
          drawnPolygons: patch.drawnPolygons ?? prev.bgRemoval?.drawnPolygons ?? [],
        },
      }));
    },
    [updateCurrentEdits]
  );

  const handleAddBgStroke = useCallback(
    (stroke: BgRemovalStroke) => {
      updateCurrentEdits(
        (prev) => {
          const bg = prev.bgRemoval || {
            ...DEFAULT_BG_REMOVAL,
            pickPoints: [],
            strokes: [],
            drawnPolygons: [],
          };
          const nextStrokes = [...(bg.strokes || []), stroke].slice(-1200);
          return {
            ...prev,
            bgRemoval: {
              ...bg,
              enabled: true,
              backdropMode: bg.backdropMode === 'original' ? 'transparent' : bg.backdropMode,
              strokes: nextStrokes,
            },
          };
        },
        false
      );
    },
    [updateCurrentEdits]
  );

  const handleAddBgStrokesBatch = useCallback(
    (strokes: BgRemovalStroke[]) => {
      if (strokes.length === 0) return;
      updateCurrentEdits((prev) => {
        const bg = prev.bgRemoval || {
          ...DEFAULT_BG_REMOVAL,
          pickPoints: [],
          strokes: [],
          drawnPolygons: [],
        };
        const nextStrokes = [...(bg.strokes || []), ...strokes].slice(-1400);
        return {
          ...prev,
          bgRemoval: {
            ...bg,
            enabled: true,
            backdropMode: bg.backdropMode === 'original' ? 'transparent' : bg.backdropMode,
            strokes: nextStrokes,
          },
        };
      });
    },
    [updateCurrentEdits]
  );

  const handleAddBgDrawnPolygon = useCallback(
    (poly: BgDrawnPolygon) => {
      updateCurrentEdits((prev) => {
        const bg = prev.bgRemoval || {
          ...DEFAULT_BG_REMOVAL,
          pickPoints: [],
          strokes: [],
          drawnPolygons: [],
        };
        return {
          ...prev,
          bgRemoval: {
            ...bg,
            enabled: true,
            backdropMode: bg.backdropMode === 'original' ? 'transparent' : bg.backdropMode,
            drawnPolygons: [...(bg.drawnPolygons || []), poly],
          },
        };
      });
    },
    [updateCurrentEdits]
  );

  const handleAddBgPickPoint = useCallback(
    (pt: BgPickPoint) => {
      updateCurrentEdits((prev) => {
        const bg = prev.bgRemoval || {
          ...DEFAULT_BG_REMOVAL,
          pickPoints: [],
          strokes: [],
          drawnPolygons: [],
        };
        const nextMode =
          bg.mode === 'drawn' || bg.mode === 'chroma' || bg.mode === 'luma' ? 'pick' : bg.mode;
        return {
          ...prev,
          bgRemoval: {
            ...bg,
            enabled: true,
            mode: nextMode,
            backdropMode: bg.backdropMode === 'original' ? 'transparent' : bg.backdropMode,
            pickPoints: [...(bg.pickPoints || []), pt],
          },
        };
      });
      setStatusNotice(
        pt.action === 'keep'
          ? 'Isolated picked subject.'
          : 'Removed picked subject from frame.'
      );
    },
    [updateCurrentEdits]
  );

  const handleUndoBgDraw = useCallback(() => {
    updateCurrentEdits((prev) => {
      const bg = prev.bgRemoval || {
        ...DEFAULT_BG_REMOVAL,
        pickPoints: [],
        strokes: [],
        drawnPolygons: [],
      };
      const picks = bg.pickPoints || [];
      const strokes = bg.strokes || [];
      const polys = bg.drawnPolygons || [];
      if (picks.length === 0 && strokes.length === 0 && polys.length === 0) return prev;

      const lastPick = picks[picks.length - 1];
      const lastPoly = polys[polys.length - 1];
      const lastStroke = strokes[strokes.length - 1];
      const extractTs = (id?: string) => {
        const parts = (id || '').split('-');
        const num = Number(parts[1]);
        return Number.isFinite(num) ? num : 0;
      };
      const pickTs = lastPick ? extractTs(lastPick.id) : -1;
      const polyTs = lastPoly ? extractTs(lastPoly.id) : -1;
      const strokeTs = lastStroke ? extractTs(lastStroke.groupId || lastStroke.id) : -1;

      if (pickTs >= polyTs && pickTs >= strokeTs && picks.length > 0) {
        return {
          ...prev,
          bgRemoval: { ...bg, pickPoints: picks.slice(0, -1) },
        };
      }

      if (polyTs >= strokeTs && polys.length > 0) {
        return {
          ...prev,
          bgRemoval: { ...bg, drawnPolygons: polys.slice(0, -1) },
        };
      }

      if (lastStroke?.groupId) {
        return {
          ...prev,
          bgRemoval: {
            ...bg,
            strokes: strokes.filter((s) => s.groupId !== lastStroke.groupId),
          },
        };
      }
      return {
        ...prev,
        bgRemoval: { ...bg, strokes: strokes.slice(0, -1) },
      };
    });
  }, [updateCurrentEdits]);

  const handleClearBgStrokes = useCallback(() => {
    updateCurrentEdits((prev) => ({
      ...prev,
      bgRemoval: {
        ...(prev.bgRemoval || DEFAULT_BG_REMOVAL),
        pickPoints: [],
        strokes: [],
        drawnPolygons: [],
      },
    }));
  }, [updateCurrentEdits]);

  const handlePickBgColorAtPoint = useCallback(
    (nx: number, ny: number) => {
      if (!currentAsset) return;
      const span = workspace === 'timeline' ? activeTimelineSpan : null;
      const renderAssetId = span ? span.clip.assetId : currentAsset.id;
      const srcEl = sourceMapRef.current[renderAssetId];
      if (!srcEl) return;

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = Math.max(2, stageDimensions.width);
      sampleCanvas.height = Math.max(2, stageDimensions.height);
      const editsToRender = span ? span.clip.edits : currentEdits;
      const localTime = span ? Math.max(0, playhead - span.start) : 0;
      const progress01 = span ? clamp(localTime / span.len, 0, 1) : 0;

      renderFrameToCanvas(sampleCanvas, srcEl, {
        edits: editsToRender,
        clipProgress: progress01,
        clipTime: localTime,
        clipDuration: span ? span.len : 4,
        globalTime: playhead,
        enableKenBurns: workspace === 'timeline',
        bypassEdits: true,
      });

      const sctx = sampleCanvas.getContext('2d');
      if (!sctx) return;
      const px = clamp(Math.round(nx * (sampleCanvas.width - 1)), 0, sampleCanvas.width - 1);
      const py = clamp(Math.round(ny * (sampleCanvas.height - 1)), 0, sampleCanvas.height - 1);
      const data = sctx.getImageData(px, py, 1, 1).data;
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      const pickedHex = `#${toHex(data[0])}${toHex(data[1])}${toHex(data[2])}`;

      handleUpdateBgRemoval({
        enabled: true,
        mode: 'chroma',
        chromaColor: pickedHex,
        backdropMode:
          currentEdits.bgRemoval?.backdropMode === 'original'
            ? 'transparent'
            : currentEdits.bgRemoval?.backdropMode || 'transparent',
      });
      setBgEyedropperActive(false);
      setStatusNotice(`Keyed background color ${pickedHex.toUpperCase()}.`);
    },
    [
      currentAsset,
      workspace,
      activeTimelineSpan,
      stageDimensions,
      currentEdits,
      playhead,
      handleUpdateBgRemoval,
    ]
  );

  const ensureBgRemovalForBehindLayer = useCallback(() => {
    if (!currentEdits.bgRemoval?.enabled) {
      handleUpdateBgRemoval({
        enabled: true,
        mode: currentEdits.bgRemoval?.mode || 'auto',
        backdropMode: 'original',
      });
    }
  }, [currentEdits.bgRemoval, handleUpdateBgRemoval]);

  const handleAddTextBehindSubject = useCallback(() => {
    const nextBg: BgRemovalSettings = currentEdits.bgRemoval?.enabled
      ? {
          ...currentEdits.bgRemoval,
          backdropMode:
            currentEdits.bgRemoval.backdropMode === 'transparent'
              ? 'transparent'
              : currentEdits.bgRemoval.backdropMode || 'original',
        }
      : {
          ...DEFAULT_BG_REMOVAL,
          enabled: true,
          mode: 'auto',
          backdropMode: 'original',
          strokes: [...(currentEdits.bgRemoval?.strokes || [])],
        };

    if (workspace === 'photo') {
      const newOv: TextOverlay = {
        id: `pov-bg-${Date.now()}`,
        text: 'DEPTH STUDIO',
        x: 0.5,
        y: 0.42,
        fontSize: 64,
        fontFamily: 'oswald',
        color: '#ffffff',
        backdrop: false,
        styleTemplate: 'cinema-3d',
        text3d: normalizeTextEffects({
          enabled: true,
          style: 'extrude',
          depth: 18,
          extrudeColor: '#92400e',
        }),
        layerOrder: 'behind',
        scale: 1,
        rotation: 0,
        opacity: 1,
        blendMode: 'normal',
        animationIn: 'none',
        startTime: 0,
        endTime: 10,
      };
      updateCurrentEdits((prev) => ({
        ...prev,
        bgRemoval: nextBg,
        overlays: [...prev.overlays, newOv],
      }));
      setSelectedPhotoOverlayId(newOv.id);
      setInspectorTab('animate');
      setStatusNotice('Added text behind isolated subject.');
      return;
    }

    if (inspectedClip) {
      setClips((prev) =>
        prev.map((c) =>
          c.id === inspectedClip.id
            ? { ...c, edits: { ...c.edits, bgRemoval: nextBg } }
            : c
        )
      );
    }
    const newOv: TimelineOverlayItem = {
      id: `ov-bg-${Date.now()}`,
      kind: 'text',
      layerOrder: 'behind',
      startTime: Number(playhead.toFixed(2)),
      duration: 2.5,
      x: 0.5,
      y: 0.42,
      scale: 1.25,
      rotation: 0,
      opacity: 1,
      easing: 'ease-out',
      keyframes: [],
      text: 'DEPTH STUDIO',
      fontSize: 64,
      fontFamily: 'oswald',
      letterSpacing: 3,
      color: '#ffffff',
      backdrop: false,
      styleTemplate: 'cinema-3d',
      text3d: normalizeTextEffects({
        enabled: true,
        style: 'extrude',
        depth: 18,
        extrudeColor: '#92400e',
      }),
      animationIn: 'none',
    };
    setGlobalOverlays((prev) => [...prev, newOv]);
    setSelectedGlobalOverlayId(newOv.id);
    setSelectedAudioId(null);
    setWorkspace('timeline');
    setStatusNotice('Added text behind isolated subject on Track T1.');
  }, [
    currentEdits.bgRemoval,
    workspace,
    updateCurrentEdits,
    inspectedClip,
    playhead,
  ]);

  const handleToggleSelectedTextOrAddBehind = useCallback(() => {
    if (workspace === 'photo' && selectedPhotoOverlayId) {
      const target = currentEdits.overlays.find((o) => o.id === selectedPhotoOverlayId);
      if (target) {
        const nextLayer: OverlayLayerOrder =
          (target.layerOrder || 'front') === 'behind' ? 'front' : 'behind';
        updateCurrentEdits((prev) => ({
          ...prev,
          bgRemoval:
            nextLayer === 'behind' && !prev.bgRemoval?.enabled
              ? {
                  ...DEFAULT_BG_REMOVAL,
                  enabled: true,
                  mode: 'auto',
                  backdropMode: 'original',
                }
              : prev.bgRemoval,
          overlays: prev.overlays.map((o) =>
            o.id === target.id ? { ...o, layerOrder: nextLayer } : o
          ),
        }));
        setStatusNotice(
          nextLayer === 'behind'
            ? 'Moved text behind isolated subject.'
            : 'Moved text in front of subject.'
        );
        return;
      }
    }

    if (workspace === 'timeline' && selectedGlobalOverlayId) {
      const target = globalOverlays.find((o) => o.id === selectedGlobalOverlayId);
      if (target && target.kind === 'text') {
        const nextLayer: OverlayLayerOrder =
          (target.layerOrder || 'front') === 'behind' ? 'front' : 'behind';
        if (nextLayer === 'behind') {
          ensureBgRemovalForBehindLayer();
        }
        setGlobalOverlays((prev) =>
          prev.map((o) => (o.id === target.id ? { ...o, layerOrder: nextLayer } : o))
        );
        setStatusNotice(
          nextLayer === 'behind'
            ? 'Moved text behind isolated subject.'
            : 'Moved text in front of subject.'
        );
        return;
      }
    }

    handleAddTextBehindSubject();
  }, [
    workspace,
    selectedPhotoOverlayId,
    currentEdits.overlays,
    updateCurrentEdits,
    selectedGlobalOverlayId,
    globalOverlays,
    ensureBgRemovalForBehindLayer,
    handleAddTextBehindSubject,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      const tag = targetEl?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        targetEl?.isContentEditable
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (workspace !== 'start') {
          if (!isAccountUnlocked) {
            setPendingSaveAfterAuth(true);
            setAuthFeatureReason('Sign in and verify your email to save projects to the cloud.');
            setAuthModalTab('login');
            setAuthModalOpen(true);
          } else {
            setSaveModalOpen(true);
          }
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (workspace !== 'start') {
        const key = e.key.toLowerCase();
        if (key === 'b' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          if (e.shiftKey) {
            handleAddTextBehindSubject();
          } else {
            handleToggleSelectedTextOrAddBehind();
          }
          return;
        }
        if (key === 'c' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setCropMode((prev) => {
            const next = !prev;
            if (next) {
              setMaskMode(false);
              setInspectorTab('transform');
            }
            return next;
          });
          return;
        }
        if (key === 'm' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          if (!isAccountUnlocked) {
            requireAuth('Sign in or create an account to use Shape Masks.');
            return;
          }
          setMaskMode((prev) => {
            const next = !prev;
            if (next) {
              setCropMode(false);
              setInspectorTab('mask');
              if ((currentEdits.mask?.shape || 'none') === 'none') {
                updateCurrentEdits((ed) => ({
                  ...ed,
                  mask: { ...(ed.mask || DEFAULT_MASK), shape: 'circle' },
                }));
              }
            }
            return next;
          });
          return;
        }
      }

      if (workspace === 'timeline') {
        if (e.code === 'Space') {
          e.preventDefault();
          setIsPlaying((p) => !p);
        } else if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          handleSplitAtPlayhead();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          handleDeleteSelected();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleSeek(clamp(playhead - 0.05, 0, totalDuration));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleSeek(clamp(playhead + 0.05, 0, totalDuration));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    workspace,
    isAccountUnlocked,
    requireAuth,
    currentEdits,
    updateCurrentEdits,
    handleUndo,
    handleRedo,
    handleSplitAtPlayhead,
    handleDeleteSelected,
    handleSeek,
    playhead,
    totalDuration,
    handleAddTextBehindSubject,
    handleToggleSelectedTextOrAddBehind,
  ]);

  const handleAddTextTemplate = useCallback(
    (
      templateId: TextStyleTemplateId,
      layerOrder: OverlayLayerOrder = 'front'
    ) => {
      const tpl = TEXT_STYLE_TEMPLATES.find((t) => t.id === templateId) || TEXT_STYLE_TEMPLATES[0];
      if (layerOrder === 'behind') {
        ensureBgRemovalForBehindLayer();
      }
      if (workspace === 'photo') {
        const newOv: TextOverlay = {
          id: `pov-${Date.now()}`,
          text: tpl.preview,
          x: 0.5,
          y: layerOrder === 'behind' ? 0.42 : 0.78,
          fontSize: layerOrder === 'behind' ? Math.max(tpl.fontSize, 56) : tpl.fontSize,
          fontFamily: tpl.fontFamily,
          letterSpacing: tpl.id === 'cinema-3d' || tpl.id === 'anime-impact' ? 2 : 0,
          color: tpl.color,
          backdrop: layerOrder === 'behind' ? false : tpl.backdrop,
          styleTemplate: tpl.id,
          text3d: tpl.text3d ? normalizeTextEffects(tpl.text3d) : undefined,
          layerOrder,
          scale: 1,
          rotation: 0,
          opacity: 1,
          blendMode: 'normal',
          animationIn: 'none',
          startTime: 0,
          endTime: 10,
        };
        updateCurrentEdits((prev) => ({
          ...prev,
          bgRemoval:
            layerOrder === 'behind' && !prev.bgRemoval?.enabled
              ? { ...DEFAULT_BG_REMOVAL, enabled: true, mode: 'auto', backdropMode: 'original' }
              : prev.bgRemoval,
          overlays: [...prev.overlays, newOv],
        }));
        setSelectedPhotoOverlayId(newOv.id);
        setInspectorTab('animate');
        if (layerOrder === 'behind') {
          setStatusNotice('Added text behind isolated subject.');
        }
        return;
      }

      const newOv: TimelineOverlayItem = {
        id: `ov-${Date.now()}`,
        kind: 'text',
        layerOrder,
        startTime: Number(playhead.toFixed(2)),
        duration: 2.0,
        x: 0.5,
        y: layerOrder === 'behind' ? 0.42 : 0.72,
        scale: layerOrder === 'behind' ? 1.2 : 1,
        rotation: 0,
        opacity: 1,
        easing: 'ease-out',
        keyframes: [
          {
            id: `kf-${Date.now()}-a`,
            time: 0,
            x: 0.5,
            y: layerOrder === 'behind' ? 0.48 : 0.78,
            scale: 0.85,
            rotation: 0,
            opacity: 0.2,
          },
          {
            id: `kf-${Date.now()}-b`,
            time: 0.35,
            x: 0.5,
            y: layerOrder === 'behind' ? 0.42 : 0.72,
            scale: layerOrder === 'behind' ? 1.2 : 1,
            rotation: 0,
            opacity: 1,
          },
        ],
        text: tpl.preview,
        fontSize: layerOrder === 'behind' ? Math.max(tpl.fontSize, 56) : tpl.fontSize,
        fontFamily: tpl.fontFamily,
        letterSpacing: tpl.id === 'cinema-3d' || tpl.id === 'anime-impact' ? 2 : 1,
        color: tpl.color,
        backdrop: layerOrder === 'behind' ? false : tpl.backdrop,
        styleTemplate: tpl.id,
        text3d: tpl.text3d ? normalizeTextEffects(tpl.text3d) : undefined,
        animationIn: 'none',
      };
      setGlobalOverlays((prev) => [...prev, newOv]);
      setSelectedGlobalOverlayId(newOv.id);
      setSelectedAudioId(null);
      setWorkspace('timeline');
      if (layerOrder === 'behind') {
        setStatusNotice('Added text behind isolated subject on Track T1.');
      }
    },
    [playhead, workspace, updateCurrentEdits, ensureBgRemovalForBehindLayer]
  );

  const handleDuplicateGlobalOverlay = useCallback((id: string) => {
    let createdId: string | null = null;
    setGlobalOverlays((prev) => {
      const idx = prev.findIndex((o) => o.id === id);
      if (idx === -1) return prev;
      const src = prev[idx];
      createdId = `ov-dup-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const dup: TimelineOverlayItem = {
        ...src,
        id: createdId,
        x: Number((src.x + 0.03).toFixed(4)),
        y: Number((src.y + 0.03).toFixed(4)),
        keyframes: src.keyframes.map((k, kIdx) => ({
          ...k,
          id: `kf-dup-${Date.now()}-${kIdx}`,
          x: Number((k.x + 0.03).toFixed(4)),
          y: Number((k.y + 0.03).toFixed(4)),
        })),
        text3d: src.text3d ? normalizeTextEffects(src.text3d) : undefined,
      };
      const copy = [...prev];
      copy.splice(idx + 1, 0, dup);
      return copy;
    });
    if (createdId) {
      setSelectedGlobalOverlayId(createdId);
      setStatusNotice('Duplicated text overlay layer.');
    }
  }, []);

  const handleDuplicatePhotoTextOverlay = useCallback(
    (id: string) => {
      const createdId = `pov-dup-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      updateCurrentEdits((prev) => {
        const idx = prev.overlays.findIndex((o) => o.id === id);
        if (idx === -1) return prev;
        const src = prev.overlays[idx];
        const dup: TextOverlay = {
          ...src,
          id: createdId,
          x: Number((src.x + 0.03).toFixed(4)),
          y: Number((src.y + 0.03).toFixed(4)),
          text3d: src.text3d ? normalizeTextEffects(src.text3d) : undefined,
        };
        const next = [...prev.overlays];
        next.splice(idx + 1, 0, dup);
        return { ...prev, overlays: next };
      });
      setSelectedPhotoOverlayId(createdId);
      setStatusNotice('Duplicated photo text layer.');
    },
    [updateCurrentEdits]
  );

  const handleReorderPhotoTextOverlay = useCallback(
    (id: string, dir: -1 | 1) => {
      updateCurrentEdits((prev) => {
        const idx = prev.overlays.findIndex((o) => o.id === id);
        const nextIdx = idx + dir;
        if (idx === -1 || nextIdx < 0 || nextIdx >= prev.overlays.length) return prev;
        const next = [...prev.overlays];
        const [item] = next.splice(idx, 1);
        next.splice(nextIdx, 0, item);
        return { ...prev, overlays: next };
      });
    },
    [updateCurrentEdits]
  );

  const handleAddSticker = useCallback(
    (kind: StickerKind) => {
      if (!isAccountUnlocked) {
        requireAuth('Sign in or create an account to add Graphic Stickers.');
        return;
      }
      const newOv: TimelineOverlayItem = {
        id: `ov-${Date.now()}`,
        kind: 'sticker',
        startTime: Number(playhead.toFixed(2)),
        duration: 2.2,
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        opacity: 0.95,
        easing: 'punch',
        keyframes: [
          { id: `kf-${Date.now()}-a`, time: 0, x: 0.5, y: 0.5, scale: 0.7, rotation: -12, opacity: 0.4 },
          { id: `kf-${Date.now()}-b`, time: 0.35, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
        ],
        stickerKind: kind,
        animationIn: 'none',
      };
      setGlobalOverlays((prev) => [...prev, newOv]);
      setSelectedGlobalOverlayId(newOv.id);
      setSelectedAudioId(null);
      setWorkspace('timeline');
    },
    [playhead, isAccountUnlocked, requireAuth]
  );

  const handleApplyShapeMask = useCallback(
    (shape: MaskShape) => {
      if (!isAccountUnlocked) {
        requireAuth('Sign in or create an account to use Shape Masks.');
        return;
      }
      updateCurrentEdits((prev) => ({
        ...prev,
        mask: { ...(prev.mask || DEFAULT_MASK), shape },
      }));
      setInspectorTab('mask');
      setCropMode(false);
      setMaskMode(shape !== 'none');
    },
    [updateCurrentEdits, isAccountUnlocked, requireAuth]
  );

  const handleAddMaskOverlay = useCallback(
    (presetId: MaskOverlayPresetId) => {
      if (!isAccountUnlocked) {
        requireAuth('Sign in or create an account to add Mask Overlays.');
        return;
      }
      const preset =
        MASK_OVERLAY_PRESETS.find((p) => p.id === presetId) || MASK_OVERLAY_PRESETS[0];
      const newOv: TimelineOverlayItem = {
        id: `ov-${Date.now()}`,
        kind: 'mask',
        startTime: Number(playhead.toFixed(2)),
        duration: 2.5,
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        opacity: preset.opacity,
        easing: 'ease-out',
        keyframes: [],
        maskShape: preset.shape,
        maskOverlayStyle: preset.id,
        maskWidth: preset.width,
        maskHeight: preset.height,
        maskFeather: preset.feather,
        maskColor: preset.color,
        maskBorder: preset.border,
        animationIn: 'none',
      };
      setGlobalOverlays((prev) => [...prev, newOv]);
      setSelectedGlobalOverlayId(newOv.id);
      setSelectedAudioId(null);
      setCropMode(false);
      setMaskMode(false);
      setWorkspace('timeline');
    },
    [playhead, isAccountUnlocked, requireAuth]
  );

  // Keyframe CRUD for Track T1 Overlays
  const handleToggleOverlayKeyframe = useCallback(
    (overlayId: string) => {
      if (!isAccountUnlocked) {
        requireAuth('Sign in or create an account to add Motion Keyframes.');
        return;
      }
      setGlobalOverlays((prev) =>
        prev.map((ov) => {
          if (ov.id !== overlayId) return ov;
          const localTime = clamp(Number((playhead - ov.startTime).toFixed(2)), 0, ov.duration);
          const existingIdx = ov.keyframes.findIndex((k) => Math.abs(k.time - localTime) < 0.08);
          if (existingIdx !== -1) {
            return {
              ...ov,
              keyframes: ov.keyframes.filter((_, i) => i !== existingIdx),
            };
          }
          const evalNow = evaluateOverlayAtTime(ov, localTime);
          const newKf = {
            id: `kf-${Date.now()}`,
            time: localTime,
            ...evalNow,
          };
          return {
            ...ov,
            keyframes: [...ov.keyframes, newKf].sort((a, b) => a.time - b.time),
          };
        })
      );
    },
    [playhead, isAccountUnlocked, requireAuth]
  );

  const handleUpdateOverlayMotionAtPlayhead = useCallback(
    (
      overlayId: string,
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
    ) => {
      setGlobalOverlays((prev) =>
        prev.map((ov) => {
          if (ov.id !== overlayId) return ov;
          const localTime = clamp(Number((playhead - ov.startTime).toFixed(2)), 0, ov.duration);
          const { tiltX, tiltY, ...restMotion } = patch;
          const hasTiltPatch = tiltX !== undefined || tiltY !== undefined;
          const hasFxKeyPatch =
            patch.scaleX !== undefined ||
            patch.scaleY !== undefined ||
            patch.shadowDepth !== undefined ||
            patch.glowIntensity !== undefined ||
            patch.effectIntensity !== undefined ||
            patch.charPhase !== undefined;
          if (ov.keyframes.length === 0 && !hasFxKeyPatch) {
            return {
              ...ov,
              ...restMotion,
              ...(hasTiltPatch
                ? {
                    text3d: normalizeTextEffects({
                      ...(ov.text3d || {}),
                      ...(tiltX !== undefined ? { tiltX } : {}),
                      ...(tiltY !== undefined ? { tiltY } : {}),
                    }),
                  }
                : {}),
            };
          }
          const existingIdx = ov.keyframes.findIndex((k) => Math.abs(k.time - localTime) < 0.08);
          if (existingIdx !== -1) {
            const nextKfs = ov.keyframes.map((k, idx) =>
              idx === existingIdx ? { ...k, ...patch } : k
            );
            return { ...ov, keyframes: nextKfs };
          }
          // Auto-insert keyframe at playhead when keyframes already exist (or FX key adjusted)
          const evalNow = evaluateOverlayAtTime(ov, localTime);
          const newKf = {
            id: `kf-${Date.now()}`,
            time: localTime,
            ...evalNow,
            ...patch,
          };
          return {
            ...ov,
            keyframes: [...ov.keyframes, newKf].sort((a, b) => a.time - b.time),
          };
        })
      );
    },
    [playhead]
  );

  // Keyframe CRUD for Track V1 Clips
  const handleToggleClipKeyframe = useCallback(() => {
    if (!isAccountUnlocked) {
      requireAuth('Sign in or create an account to use Clip Keyframes.');
      return;
    }
    if (!inspectedSpan) return;
    const clip = inspectedSpan.clip;
    const localTime = clamp(
      Number((playhead - inspectedSpan.start).toFixed(2)),
      0,
      inspectedSpan.len
    );
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clip.id) return c;
        const idx = c.keyframes.findIndex((k) => Math.abs(k.time - localTime) < 0.08);
        if (idx !== -1) {
          return { ...c, keyframes: c.keyframes.filter((_, i) => i !== idx) };
        }
        const evalNow = evaluateClipKeyframes(c.keyframes, c.keyframeEasing, localTime);
        const newKf: ClipKeyframe = {
          id: `ckf-${Date.now()}`,
          time: localTime,
          ...evalNow,
        };
        return {
          ...c,
          keyframes: [...c.keyframes, newKf].sort((a, b) => a.time - b.time),
        };
      })
    );
  }, [inspectedSpan, playhead, isAccountUnlocked, requireAuth]);

  const handleUpdateClipKeyframeValues = useCallback(
    (patch: Partial<ClipKeyframe>) => {
      if (!isAccountUnlocked) {
        requireAuth('Sign in or create an account to use Clip Keyframes.');
        return;
      }
      if (!inspectedSpan) return;
      const clip = inspectedSpan.clip;
      const localTime = clamp(
        Number((playhead - inspectedSpan.start).toFixed(2)),
        0,
        inspectedSpan.len
      );
      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== clip.id) return c;
          const idx = c.keyframes.findIndex((k) => Math.abs(k.time - localTime) < 0.08);
          if (idx !== -1) {
            return {
              ...c,
              keyframes: c.keyframes.map((k, i) => (i === idx ? { ...k, ...patch } : k)),
            };
          }
          const evalNow = evaluateClipKeyframes(c.keyframes, c.keyframeEasing, localTime);
          const newKf: ClipKeyframe = {
            id: `ckf-${Date.now()}`,
            time: localTime,
            ...evalNow,
            ...patch,
          };
          return {
            ...c,
            keyframes: [...c.keyframes, newKf].sort((a, b) => a.time - b.time),
          };
        })
      );
    },
    [inspectedSpan, playhead, isAccountUnlocked, requireAuth]
  );

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      if (presetId !== 'natural' && !isAccountUnlocked) {
        requireAuth('Sign in or create an account to apply Film Stock Presets.');
        return;
      }
      const preset = FILM_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      updateCurrentEdits((prev) => ({
        ...prev,
        color: {
          ...DEFAULT_COLOR_GRADE,
          ...preset.grade,
          presetId: preset.id,
        },
        effects: {
          ...prev.effects,
          vignette: preset.vignette ?? prev.effects.vignette,
          grain: preset.grain ?? prev.effects.grain,
          halation: preset.halation ?? prev.effects.halation,
        },
      }));
    },
    [updateCurrentEdits, isAccountUnlocked, requireAuth]
  );

  const selectedOverlay = useMemo(
    () => globalOverlays.find((o) => o.id === selectedGlobalOverlayId) || null,
    [globalOverlays, selectedGlobalOverlayId]
  );

  const selectedAudioClip = useMemo(
    () => audioClips.find((a) => a.id === selectedAudioId) || null,
    [audioClips, selectedAudioId]
  );

  const titleLabel =
    workspace === 'timeline'
      ? inspectedClip?.name || 'Empty Sequence'
      : currentAsset?.name || 'Photo Lab';

  const metaLabel =
    workspace === 'timeline'
      ? `${stageDimensions.width}×${stageDimensions.height} · ${sequenceAspect} · ${clips.length} clips`
      : `${stageDimensions.width}×${stageDimensions.height} · ${currentEdits.color.presetId}`;

  const handleRequestSaveProject = useCallback(() => {
    if (!isAccountUnlocked) {
      setPendingSaveAfterAuth(true);
      setAuthFeatureReason('Sign in and verify your email to save projects to the cloud.');
      setAuthModalTab('login');
      setAuthModalOpen(true);
      return;
    }
    setSaveModalOpen(true);
  }, [isAccountUnlocked]);

  const handleConfirmSaveProject = useCallback(
    async (name: string, asNewCopy: boolean) => {
      if (!user) return;
      setSavingProject(true);
      try {
        const res = await saveProjectToFirestore(user, {
          existingProjectId: asNewCopy ? null : currentProjectId,
          name,
          mode: workspace === 'photo' ? 'photo' : 'timeline',
          sequenceAspect,
          beatBpm,
          activeAssetId,
          totalDuration,
          clips,
          globalOverlays,
          audioClips,
          photoEdits,
        });
        setCurrentProjectId(res.projectId);
        setCurrentProjectName(res.name);
        setIsProjectSaved(true);
        setStatusNotice(`Saved "${res.name}" to your cloud workspace.`);
      } finally {
        setSavingProject(false);
      }
    },
    [
      user,
      currentProjectId,
      workspace,
      sequenceAspect,
      beatBpm,
      activeAssetId,
      totalDuration,
      clips,
      globalOverlays,
      audioClips,
      photoEdits,
    ]
  );

  const handleOpenSavedProject = useCallback(
    (project: SavedProjectRecord) => {
      const hydrated = hydrateProjectAssets(project, assets, audioAssets);
      skipDirtyMarkRef.current = true;
      setClips(hydrated.clips);
      setGlobalOverlays(project.globalOverlays);
      setAudioClips(hydrated.audioClips);
      setPhotoEdits(
        Object.keys(project.photoEdits).length > 0
          ? project.photoEdits
          : { [hydrated.activeAssetId]: createDefaultEdits('none', 'cover') }
      );
      setBeatBpm(project.beatBpm || 120);
      setSequenceAspect(project.sequenceAspect || '16:9');
      setActiveAssetId(hydrated.activeAssetId);
      setSelectedClipId(hydrated.clips[0]?.id || null);
      setSelectedGlobalOverlayId(null);
      setSelectedAudioId(null);
      setPlayhead(0);
      setIsPlaying(false);
      setCropMode(false);
      setMaskMode(false);
      setUndoStack([]);
      setRedoStack([]);
      setCurrentProjectId(project.id);
      setCurrentProjectName(project.name);
      setIsProjectSaved(true);
      setWorkspace(project.mode === 'photo' ? 'photo' : 'timeline');

      if (hydrated.missingLocalCount > 0) {
        setStatusNotice(
          `Opened "${project.name}". ${hydrated.missingLocalCount} local disk clip(s) were replaced with studio placeholders.`
        );
      } else {
        setStatusNotice(`Opened "${project.name}".`);
      }
    },
    [assets, audioAssets]
  );

  const handleDeleteSavedProject = useCallback(
    async (projectId: string) => {
      await deleteProjectFromFirestore(projectId);
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
        setIsProjectSaved(false);
      }
      setStatusNotice('Project deleted.');
    },
    [currentProjectId]
  );

  const handleAddVisualOverlay = useCallback(
    (presetId: VisualOverlayPresetId, layerOrder: OverlayLayerOrder = 'front') => {
      const preset =
        VISUAL_OVERLAY_PRESETS.find((p) => p.id === presetId) || VISUAL_OVERLAY_PRESETS[0];
      if (layerOrder === 'behind') {
        ensureBgRemovalForBehindLayer();
      }

      if (workspace === 'photo') {
        const newOv: PhotoVisualOverlay = {
          id: `pov-vis-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          kind: 'visual',
          presetId: preset.id,
          name: preset.name,
          blendMode: preset.defaultBlend,
          layerOrder,
          opacity: preset.defaultOpacity,
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
        };
        updateCurrentEdits((prev) => ({
          ...prev,
          bgRemoval:
            layerOrder === 'behind' && !prev.bgRemoval?.enabled
              ? { ...DEFAULT_BG_REMOVAL, enabled: true, mode: 'auto', backdropMode: 'original' }
              : prev.bgRemoval,
          visualOverlays: [...(prev.visualOverlays || []), newOv],
        }));
        setInspectorTab('animate');
        setStatusNotice(
          `Added "${preset.name}"${layerOrder === 'behind' ? ' behind subject' : ''}.`
        );
        return;
      }

      const newOv: TimelineOverlayItem = {
        id: `ov-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kind: 'visual',
        layerOrder,
        startTime: Number(playhead.toFixed(2)),
        duration: 3.0,
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        opacity: preset.defaultOpacity,
        easing: 'ease-out',
        keyframes: [],
        visualOverlayId: preset.id,
        blendMode: preset.defaultBlend,
        overlayName: preset.name,
        animationIn: 'none',
      };
      setGlobalOverlays((prev) => [...prev, newOv]);
      setSelectedGlobalOverlayId(newOv.id);
      setSelectedAudioId(null);
      setWorkspace('timeline');
      setStatusNotice(
        `Added "${preset.name}"${layerOrder === 'behind' ? ' behind subject' : ''} to Track T1.`
      );
    },
    [playhead, workspace, updateCurrentEdits, ensureBgRemovalForBehindLayer]
  );

  const handleAddImageOverlay = useCallback(
    (asset: MediaAsset, layerOrder: OverlayLayerOrder = 'front') => {
      preloadOverlayImage(asset.src, () => setSourceVersion((v) => v + 1));
      if (layerOrder === 'behind') {
        ensureBgRemovalForBehindLayer();
      }

      if (workspace === 'photo') {
        const newOv: PhotoVisualOverlay = {
          id: `pov-img-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          kind: 'image',
          imageSrc: asset.src,
          name: asset.name,
          blendMode: 'normal',
          layerOrder,
          opacity: asset.isCutoutOverlay ? 1 : 0.92,
          x: asset.isCutoutOverlay ? 0.54 : 0.5,
          y: 0.5,
          scale: asset.isCutoutOverlay ? 0.8 : 0.85,
          rotation: 0,
        };
        updateCurrentEdits((prev) => ({
          ...prev,
          bgRemoval:
            layerOrder === 'behind' && !prev.bgRemoval?.enabled
              ? { ...DEFAULT_BG_REMOVAL, enabled: true, mode: 'auto', backdropMode: 'original' }
              : prev.bgRemoval,
          visualOverlays: [...(prev.visualOverlays || []), newOv],
        }));
        setSelectedPhotoOverlayId(null);
        setSelectedPhotoVisualOverlayId(newOv.id);
        setInspectorTab('animate');
        setStatusNotice(
          `Layered "${asset.name}"${layerOrder === 'behind' ? ' behind subject' : ''}.`
        );
        return;
      }

      const newOv: TimelineOverlayItem = {
        id: `ov-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kind: 'image',
        layerOrder,
        startTime: Number(playhead.toFixed(2)),
        duration: 3.0,
        x: 0.5,
        y: 0.5,
        scale: 0.85,
        rotation: 0,
        opacity: 0.92,
        easing: 'ease-out',
        keyframes: [],
        overlaySrc: asset.src,
        overlayAssetId: asset.id,
        overlayName: asset.name,
        blendMode: 'normal',
        animationIn: 'none',
      };
      setGlobalOverlays((prev) => [...prev, newOv]);
      setSelectedGlobalOverlayId(newOv.id);
      setSelectedAudioId(null);
      setWorkspace('timeline');
      setStatusNotice(
        `Layered "${asset.name}"${layerOrder === 'behind' ? ' behind subject' : ''} onto Track T1.`
      );
    },
    [playhead, workspace, updateCurrentEdits, ensureBgRemovalForBehindLayer]
  );

  const handleAddVideoOverlay = useCallback(
    (asset: MediaAsset, layerOrder: OverlayLayerOrder = 'front') => {
      if (layerOrder === 'behind') {
        ensureBgRemovalForBehindLayer();
      }
      const dur = Number(clamp(asset.duration || 4, 0.5, 20).toFixed(2));
      const newOv: TimelineOverlayItem = {
        id: `ov-vid-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kind: 'video',
        layerOrder,
        startTime: Number(playhead.toFixed(2)),
        duration: dur,
        x: 0.5,
        y: 0.5,
        scale: 0.58,
        rotation: 0,
        opacity: 1,
        easing: 'ease-out',
        keyframes: [],
        overlaySrc: asset.src,
        overlayAssetId: asset.id,
        overlayName: asset.name,
        sourceTrimStart: 0,
        sourceSpeed: 1,
        sourceDuration: asset.duration || dur,
        muted: true,
        blendMode: 'normal',
        animationIn: 'none',
      };
      setGlobalOverlays((prev) => [...prev, newOv]);
      setSelectedGlobalOverlayId(newOv.id);
      setSelectedAudioId(null);
      setWorkspace('timeline');
      setStatusNotice(`Added "${asset.name}" as Video PiP Overlay.`);
    },
    [playhead, ensureBgRemovalForBehindLayer]
  );

  const handleExtractCutoutToOverlay = useCallback(() => {
    if (!currentAsset) {
      setStatusNotice('Load a photo or clip first to extract a cutout overlay.');
      return;
    }
    const span = workspace === 'timeline' ? activeTimelineSpan : null;
    const renderAssetId = span ? span.clip.assetId : currentAsset.id;
    const srcEl = sourceMapRef.current[renderAssetId];
    if (!srcEl) {
      setStatusNotice('Media is still loading...');
      return;
    }
    const editsToExtract = span ? span.clip.edits : currentEdits;
    const extracted = extractCutoutAsPngOverlay(srcEl, editsToExtract, 1080);
    if (!extracted) {
      setStatusNotice('Draw around your character or enable Auto Cutout first.');
      return;
    }

    const id = `cutout-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newAsset: MediaAsset = {
      id,
      name: `${currentAsset.name} Cutout`,
      kind: 'photo',
      src: extracted.dataUrl,
      width: extracted.width,
      height: extracted.height,
      duration: 3.0,
      isCutoutOverlay: true,
    };

    const img = new Image();
    img.onload = () => {
      sourceMapRef.current[id] = img;
      setSourceVersion((v) => v + 1);
    };
    img.src = extracted.dataUrl;
    preloadOverlayImage(extracted.dataUrl, () => setSourceVersion((v) => v + 1));

    setAssets((prev) => [newAsset, ...prev]);
    setBgBrushMode('none');
    handleAddImageOverlay(newAsset, 'front');
    setStatusNotice(`Created cutout overlay "${newAsset.name}"!`);
  }, [
    currentAsset,
    workspace,
    activeTimelineSpan,
    currentEdits,
    handleAddImageOverlay,
  ]);

  const handleConvertClipToOverlay = useCallback(
    (clipId: string) => {
      const span = clipSpans.find((s) => s.clip.id === clipId);
      if (!span) return;
      const { clip, start, len } = span;
      const asset = assets.find((a) => a.id === clip.assetId);
      const ovDur = Number(clamp(len, 0.4, 30).toFixed(2));
      const newOv: TimelineOverlayItem =
        clip.kind === 'video'
          ? {
              id: `ov-conv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              kind: 'video',
              layerOrder: 'front',
              startTime: Number(start.toFixed(2)),
              duration: ovDur,
              x: 0.5,
              y: 0.5,
              scale: 0.65,
              rotation: 0,
              opacity: 1,
              easing: 'ease-out',
              keyframes: [],
              overlaySrc: asset?.src,
              overlayAssetId: clip.assetId,
              overlayName: clip.name,
              sourceTrimStart: clip.trimStart,
              sourceSpeed: clip.speed,
              sourceDuration: clip.duration,
              muted: clip.muted,
              bgRemoval: clip.edits.bgRemoval?.enabled
                ? {
                    ...clip.edits.bgRemoval,
                    pickPoints: [...(clip.edits.bgRemoval.pickPoints || [])],
                    strokes: [...(clip.edits.bgRemoval.strokes || [])],
                    drawnPolygons: [...(clip.edits.bgRemoval.drawnPolygons || [])],
                  }
                : undefined,
              blendMode: 'normal',
              animationIn: 'none',
            }
          : {
              id: `ov-conv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              kind: 'image',
              layerOrder: 'front',
              startTime: Number(start.toFixed(2)),
              duration: ovDur,
              x: 0.5,
              y: 0.5,
              scale: 0.65,
              rotation: 0,
              opacity: 1,
              easing: 'ease-out',
              keyframes: [],
              overlaySrc: asset?.src,
              overlayAssetId: clip.assetId,
              overlayName: clip.name,
              blendMode: 'normal',
              animationIn: 'none',
            };

      const remainingClips = clips.filter((c) => c.id !== clipId);
      setClips(remainingClips);
      setSelectedClipId(remainingClips[0]?.id || null);
      setGlobalOverlays((prev) => [...prev, newOv]);
      setSelectedGlobalOverlayId(newOv.id);
      setSelectedAudioId(null);
      setIsPlaying(false);
      setStatusNotice(`Turned "${clip.name}" into Track Overlay (PiP).`);
    },
    [clipSpans, assets, clips]
  );

  const handleImportOverlayImages = useCallback(
    (fileList: FileList) => {
      Array.from(fileList).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        const url = URL.createObjectURL(file);
        const id = `ovimg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const cleanName = file.name.replace(/\.[^.]+$/, '');
        const img = new Image();
        img.onload = () => {
          sourceMapRef.current[id] = img;
          const newAsset: MediaAsset = {
            id,
            name: cleanName,
            kind: 'photo',
            src: url,
            width: img.naturalWidth,
            height: img.naturalHeight,
            duration: 3.0,
          };
          setAssets((prev) => [newAsset, ...prev]);
          preloadOverlayImage(url, () => setSourceVersion((v) => v + 1));
          handleAddImageOverlay(newAsset);
          setSourceVersion((v) => v + 1);
        };
        img.src = url;
      });
    },
    [handleAddImageOverlay]
  );

  const handleUpdatePhotoVisualOverlay = useCallback(
    (id: string, patch: Partial<PhotoVisualOverlay>) => {
      if (patch.layerOrder === 'behind') {
        ensureBgRemovalForBehindLayer();
      }
      updateCurrentEdits((prev) => ({
        ...prev,
        visualOverlays: (prev.visualOverlays || []).map((o) =>
          o.id === id ? { ...o, ...patch } : o
        ),
      }));
    },
    [updateCurrentEdits, ensureBgRemovalForBehindLayer]
  );

  const handleRemovePhotoVisualOverlay = useCallback(
    (id: string) => {
      updateCurrentEdits((prev) => ({
        ...prev,
        visualOverlays: (prev.visualOverlays || []).filter((o) => o.id !== id),
      }));
      if (selectedPhotoVisualOverlayId === id) {
        setSelectedPhotoVisualOverlayId(null);
      }
    },
    [updateCurrentEdits, selectedPhotoVisualOverlayId]
  );

  const handleTogglePhotoVisualOverlayBg = useCallback(
    (id: string) => {
      updateCurrentEdits((prev) => ({
        ...prev,
        visualOverlays: (prev.visualOverlays || []).map((o) => {
          if (o.id !== id) return o;
          const prevBg = o.bgRemoval || DEFAULT_BG_REMOVAL;
          return {
            ...o,
            bgRemoval: {
              ...prevBg,
              enabled: !prevBg.enabled,
              mode: prevBg.mode === 'drawn' ? 'auto' : prevBg.mode || 'auto',
              backdropMode: 'transparent',
            },
          };
        }),
      }));
    },
    [updateCurrentEdits]
  );

  const resolvePhotoTargetAssetId = useCallback(() => {
    const activeObj = assets.find((a) => a.id === activeAssetId && a.kind === 'photo');
    if (activeObj) return activeObj.id;
    return (
      assets.find((a) => !a.isSample && a.kind === 'photo')?.id ||
      assets.find((a) => a.kind === 'photo')?.id ||
      SAMPLE_MEDIA_ASSETS[0].id
    );
  }, [assets, activeAssetId]);

  const handleSelectWorkspaceMode = useCallback(
    (mode: WorkspaceMode) => {
      setIsPlaying(false);
      setCropMode(false);
      setMaskMode(false);
      setBgBrushMode('none');
      setBgEyedropperActive(false);
      setMobileInspectorOpen(false);
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setDrawerOpen(false);
      }
      if (mode === 'photo') {
        const photoId = resolvePhotoTargetAssetId();
        if (photoId !== activeAssetId) {
          setActiveAssetId(photoId);
        }
        if (leftTab === 'audio' || leftTab === 'stickers') {
          setLeftTab('media');
        }
      }
      setWorkspace(mode);
      setUndoStack([]);
      setRedoStack([]);
    },
    [leftTab, activeAssetId, resolvePhotoTargetAssetId]
  );

  const handleOpenPhotoLabFromMenu = useCallback(() => {
    const targetId = resolvePhotoTargetAssetId();
    const assetObj = assets.find((a) => a.id === targetId);
    setActiveAssetId(targetId);
    setIsPlaying(false);
    setCropMode(false);
    setMaskMode(false);
    setBgBrushMode('none');
    setBgEyedropperActive(false);
    if (leftTab === 'audio' || leftTab === 'stickers') {
      setLeftTab('media');
    }
    setCurrentProjectName(assetObj ? `${assetObj.name} Grade` : 'Photo Lab Edit');
    setWorkspace('photo');
  }, [assets, leftTab, resolvePhotoTargetAssetId]);

  const handleOpenPhotoCutoutFromMenu = useCallback(() => {
    const targetId = resolvePhotoTargetAssetId();
    const assetObj = assets.find((a) => a.id === targetId);
    setActiveAssetId(targetId);
    setIsPlaying(false);
    setCropMode(false);
    setMaskMode(false);
    setBgBrushMode('none');
    setBgEyedropperActive(false);
    setLeftTab('cutout');
    setInspectorTab('cutout');
    setDrawerOpen(true);
    setMobileInspectorOpen(false);
    setCurrentProjectName(assetObj ? `${assetObj.name} Cutout` : 'Photo Lab Cutout');
    setWorkspace('photo');
  }, [assets, resolvePhotoTargetAssetId]);

  const handleOpenOverlaysFromMenu = useCallback(() => {
    setIsPlaying(false);
    setCropMode(false);
    setMaskMode(false);
    setBgBrushMode('none');
    setBgEyedropperActive(false);
    setMobileInspectorOpen(false);
    setLeftTab('overlays');
    setDrawerOpen(true);
    if (workspaceRef.current === 'start') {
      setWorkspace('timeline');
    }
  }, []);

  return (
    <div className="h-dvh w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-100">
      <Header
        workspace={workspace}
        user={user}
        studioDisplayName={studioDisplayName}
        studioUsername={studioUsername}
        onToggleMenu={() => setMenuDrawerOpen((v) => !v)}
        onSelectWorkspace={handleSelectWorkspaceMode}
        onOpenExport={() => {
          setIsPlaying(false);
          setExportOpen(true);
        }}
        onOpenAuth={(tab = 'login') => {
          setPendingSaveAfterAuth(false);
          setAuthFeatureReason(null);
          setAuthModalTab(tab);
          setAuthModalOpen(true);
        }}
      />

      {workspace === 'start' ? (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <StudioMenu
            workspace={workspace}
            user={user}
            studioUsername={studioUsername}
            chosenAspect={chosenAspect}
            mobileOpen={menuDrawerOpen}
            onCloseMobile={() => setMenuDrawerOpen(false)}
            onSelectAspect={setChosenAspect}
            onSelectWorkspace={handleSelectWorkspaceMode}
            onStartEmptyTimeline={(aspect) => {
              skipDirtyMarkRef.current = true;
              setClips([]);
              setGlobalOverlays([]);
              setAudioClips([]);
              setBeatBpm(120);
              setSequenceAspect(aspect);
              setSelectedClipId(null);
              setSelectedGlobalOverlayId(null);
              setSelectedAudioId(null);
              setPlayhead(0);
              setIsPlaying(false);
              setCurrentProjectId(null);
              setCurrentProjectName('Untitled Sequence');
              setIsProjectSaved(false);
              setWorkspace('timeline');
            }}
            onImportVideo={(aspect) => {
              setSequenceAspect(aspect);
              setLeftTab('media');
              setTimeout(() => fileInputRef.current?.click(), 50);
            }}
            onImportPhoto={() => {
              setLeftTab('media');
              setTimeout(() => fileInputRef.current?.click(), 50);
            }}
            onOpenPhotoLab={handleOpenPhotoLabFromMenu}
            onOpenPhotoCutout={handleOpenPhotoCutoutFromMenu}
            onOpenOverlays={handleOpenOverlaysFromMenu}
            onOpenPresets={() => setPresetsOpen(true)}
            onOpenAuth={(tab = 'login') => {
              setPendingSaveAfterAuth(false);
              setAuthFeatureReason(null);
              setAuthModalTab(tab);
              setAuthModalOpen(true);
            }}
          />

          <StartScreen
            assets={assets}
            user={user}
            studioUsername={studioUsername}
            authLoading={authLoading}
            savedProjects={savedProjects}
            chosenAspect={chosenAspect}
            onNewVideoProject={(aspect) => {
              skipDirtyMarkRef.current = true;
              setClips([]);
              setGlobalOverlays([]);
              setAudioClips([]);
              setBeatBpm(120);
              setSequenceAspect(aspect);
              setSelectedClipId(null);
              setSelectedGlobalOverlayId(null);
              setSelectedAudioId(null);
              setPlayhead(0);
              setIsPlaying(false);
              setCurrentProjectId(null);
              setCurrentProjectName('Untitled Sequence');
              setIsProjectSaved(false);
              setWorkspace('timeline');
            }}
            onOpenPhotoLab={handleOpenPhotoLabFromMenu}
            onAddClipAndOpenTimeline={(assetId, aspect) => {
              setSequenceAspect(aspect);
              handleAddToTimeline(assetId);
            }}
            onStartPhoto={(assetId) => {
              const assetObj = assets.find((a) => a.id === assetId);
              setActiveAssetId(assetId);
              setIsPlaying(false);
              setCropMode(false);
              setMaskMode(false);
              if (leftTab === 'audio' || leftTab === 'stickers') {
                setLeftTab('media');
              }
              setCurrentProjectId(null);
              setCurrentProjectName(assetObj ? `${assetObj.name} Grade` : 'Photo Lab Edit');
              setIsProjectSaved(false);
              setWorkspace('photo');
            }}
            onImportMedia={() => {
              setTimeout(() => fileInputRef.current?.click(), 50);
            }}
            onOpenSavedProject={handleOpenSavedProject}
            onDeleteSavedProject={(id) => {
              void handleDeleteSavedProject(id);
            }}
            onOpenAuth={(tab = 'login') => {
              setPendingSaveAfterAuth(false);
              setAuthFeatureReason(null);
              setAuthModalTab(tab);
              setAuthModalOpen(true);
            }}
          />
        </div>
      ) : (
        <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">
          <StudioMenu
            workspace={workspace}
            user={user}
            studioUsername={studioUsername}
            chosenAspect={chosenAspect}
            mobileOpen={menuDrawerOpen}
            onCloseMobile={() => setMenuDrawerOpen(false)}
            onSelectAspect={setChosenAspect}
            onSelectWorkspace={handleSelectWorkspaceMode}
            onStartEmptyTimeline={(aspect) => {
              skipDirtyMarkRef.current = true;
              setClips([]);
              setGlobalOverlays([]);
              setAudioClips([]);
              setBeatBpm(120);
              setSequenceAspect(aspect);
              setSelectedClipId(null);
              setSelectedGlobalOverlayId(null);
              setSelectedAudioId(null);
              setPlayhead(0);
              setIsPlaying(false);
              setCurrentProjectId(null);
              setCurrentProjectName('Untitled Sequence');
              setIsProjectSaved(false);
              setWorkspace('timeline');
            }}
            onImportVideo={(aspect) => {
              setSequenceAspect(aspect);
              setLeftTab('media');
              setTimeout(() => fileInputRef.current?.click(), 50);
            }}
            onImportPhoto={() => {
              setLeftTab('media');
              setTimeout(() => fileInputRef.current?.click(), 50);
            }}
            onOpenPhotoLab={handleOpenPhotoLabFromMenu}
            onOpenPhotoCutout={handleOpenPhotoCutoutFromMenu}
            onOpenOverlays={handleOpenOverlaysFromMenu}
            onOpenPresets={() => setPresetsOpen(true)}
            onOpenAuth={(tab = 'login') => {
              setPendingSaveAfterAuth(false);
              setAuthFeatureReason(null);
              setAuthModalTab(tab);
              setAuthModalOpen(true);
            }}
          />
          <LeftToolRail
            activeTab={leftTab}
            drawerOpen={drawerOpen}
            workspace={workspace}
            isAuthenticated={isAccountUnlocked}
            assets={assets}
            activeAssetId={activeAssetId}
            audioAssets={audioAssets}
            currentEffects={currentEdits.effects}
            currentMaskShape={currentEdits.mask?.shape || 'none'}
            currentBgRemoval={currentEdits.bgRemoval || DEFAULT_BG_REMOVAL}
            bgBrushMode={bgBrushMode}
            bgBrushSize={bgBrushSize}
            bgEyedropperActive={bgEyedropperActive}
            photoVisualOverlays={currentEdits.visualOverlays || []}
            fileInputRef={fileInputRef}
            onRequireAuth={requireAuth}
            onChangeTab={(tab) => {
              setLeftTab(tab);
              if (tab !== 'cutout') {
                setBgBrushMode('none');
                setBgEyedropperActive(false);
              }
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setMobileInspectorOpen(false);
              }
            }}
            onToggleDrawer={() =>
              setDrawerOpen((d) => {
                const next = !d;
                if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
                  setMobileInspectorOpen(false);
                }
                return next;
              })
            }
            onSelectAsset={(id) => {
              const target = assets.find((a) => a.id === id);
              if (!target) return;
              setIsPlaying(false);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
              if (target.kind === 'video') {
                handleAddToTimeline(id);
              } else {
                setActiveAssetId(id);
                if (leftTab === 'audio' || leftTab === 'stickers') {
                  setLeftTab('media');
                }
                setWorkspace('photo');
                setUndoStack([]);
                setRedoStack([]);
              }
            }}
            onAddToTimeline={(id) => {
              handleAddToTimeline(id);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onImportFiles={handleImportFiles}
            onRemoveAsset={(id) => {
              setAssets((prev) => prev.filter((a) => a.id !== id));
              setClips((prev) => prev.filter((c) => c.assetId !== id));
              if (activeAssetId === id) setActiveAssetId(SAMPLE_MEDIA_ASSETS[0].id);
            }}
            onUpdateBgRemoval={handleUpdateBgRemoval}
            onSetBgBrushMode={handleSetBgBrushMode}
            onSetBgBrushSize={setBgBrushSize}
            onToggleBgEyedropper={() => {
              setBgEyedropperActive((prev) => {
                const next = !prev;
                if (next) {
                  setBgBrushMode('none');
                  setCropMode(false);
                  setMaskMode(false);
                }
                return next;
              });
            }}
            onClearBgStrokes={handleClearBgStrokes}
            onUndoBgDraw={handleUndoBgDraw}
            onExtractCutoutToOverlay={handleExtractCutoutToOverlay}
            onAddTextBehindSubject={() => {
              handleAddTextBehindSubject();
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onAddVisualOverlay={(presetId, layerOrder = 'front') => {
              handleAddVisualOverlay(presetId, layerOrder);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onAddImageOverlay={(asset, layerOrder = 'front') => {
              handleAddImageOverlay(asset, layerOrder);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onAddVideoOverlay={(asset, layerOrder = 'front') => {
              handleAddVideoOverlay(asset, layerOrder);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onImportOverlayImages={handleImportOverlayImages}
            onRemovePhotoVisualOverlay={handleRemovePhotoVisualOverlay}
            onTogglePhotoVisualOverlayBg={handleTogglePhotoVisualOverlayBg}
            onAddAudioClip={(id) => {
              handleAddAudioClip(id);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onImportAudioFiles={handleImportAudioFiles}
            onAddTextTemplate={(tplId, layerOrder = 'front') => {
              handleAddTextTemplate(tplId, layerOrder);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onAddSticker={(kind) => {
              handleAddSticker(kind);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onApplyShapeMask={(shape) => {
              handleApplyShapeMask(shape);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onAddMaskOverlay={(presetId) => {
              handleAddMaskOverlay(presetId);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onToggleVisualEffect={(patch) => {
              if (!isAccountUnlocked) {
                requireAuth('Sign in or create an account to apply Visual Effects.');
                return;
              }
              updateCurrentEdits((prev) => ({
                ...prev,
                effects: { ...prev.effects, ...patch },
              }));
            }}
          />

          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <StageViewport
              workspace={workspace}
              isAuthenticated={isAccountUnlocked}
              canvasRef={canvasRef}
              originalCanvasRef={originalCanvasRef}
              canvasWidth={stageDimensions.width}
              canvasHeight={stageDimensions.height}
              edits={currentEdits}
              cropMode={cropMode}
              maskMode={maskMode}
              compareSplit={compareSplit}
              showGrid={showGrid}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              titleLabel={titleLabel}
              metaLabel={metaLabel}
              projectName={currentProjectName}
              isProjectSaved={isProjectSaved}
              savingProject={savingProject}
              hasTimelineClips={clips.length > 0}
              hasGlobalOverlays={globalOverlays.length > 0}
              sequenceAspect={sequenceAspect}
              globalTime={playhead}
              globalOverlays={globalOverlays}
              selectedGlobalOverlayId={selectedGlobalOverlayId}
              bgBrushMode={bgBrushMode}
              bgBrushSize={bgBrushSize}
              bgEyedropperActive={bgEyedropperActive}
              onSetBgBrushMode={handleSetBgBrushMode}
              onSetBgBrushSize={setBgBrushSize}
              onAddBgStroke={handleAddBgStroke}
              onAddBgStrokesBatch={handleAddBgStrokesBatch}
              onAddBgDrawnPolygon={handleAddBgDrawnPolygon}
              onAddBgPickPoint={handleAddBgPickPoint}
              onUndoBgDraw={handleUndoBgDraw}
              onExtractCutoutToOverlay={handleExtractCutoutToOverlay}
              onPickBgColorAtPoint={handlePickBgColorAtPoint}
              onExitBgToolMode={() => {
                setBgBrushMode('none');
                setBgEyedropperActive(false);
              }}
              onToggleCompare={() => setCompareSplit((v) => !v)}
              onToggleGrid={() => setShowGrid((v) => !v)}
              onToggleCropMode={() => {
                setCropMode((v) => {
                  const next = !v;
                  if (next) {
                    setMaskMode(false);
                    setBgBrushMode('none');
                    setBgEyedropperActive(false);
                    setInspectorTab('transform');
                  }
                  return next;
                });
              }}
              onToggleMaskMode={() => {
                if (!isAccountUnlocked) {
                  requireAuth('Sign in or create an account to use Shape Masks.');
                  return;
                }
                setMaskMode((v) => {
                  const next = !v;
                  if (next) {
                    setCropMode(false);
                    setBgBrushMode('none');
                    setBgEyedropperActive(false);
                    setInspectorTab('mask');
                    if ((currentEdits.mask?.shape || 'none') === 'none') {
                      updateCurrentEdits((prev) => ({
                        ...prev,
                        mask: { ...(prev.mask || DEFAULT_MASK), shape: 'circle' },
                      }));
                    }
                  }
                  return next;
                });
              }}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onChangeCrop={(crop: CropRect) =>
                updateCurrentEdits(
                  (prev) => ({
                    ...prev,
                    transform: { ...prev.transform, crop },
                  }),
                  false
                )
              }
              onChangeMask={(patch: Partial<MaskSettings>) =>
                updateCurrentEdits(
                  (prev) => ({
                    ...prev,
                    mask: { ...(prev.mask || DEFAULT_MASK), ...patch },
                  }),
                  false
                )
              }
              onChangeSequenceAspect={setSequenceAspect}
              onChangeBgMode={(bgMode: CanvasBgMode) =>
                updateCurrentEdits((prev) => ({
                  ...prev,
                  transform: { ...prev.transform, bgMode },
                }))
              }
              onToggleFitMode={() =>
                updateCurrentEdits((prev) => ({
                  ...prev,
                  transform: {
                    ...prev.transform,
                    fitMode: prev.transform.fitMode === 'contain' ? 'cover' : 'contain',
                  },
                }))
              }
              onSelectGlobalOverlay={(id) => {
                setSelectedGlobalOverlayId(id);
                setSelectedAudioId(null);
              }}
              onMoveOrScaleOverlayAtPlayhead={handleUpdateOverlayMotionAtPlayhead}
              onDeleteGlobalOverlay={(id) => {
                setGlobalOverlays((prev) => prev.filter((o) => o.id !== id));
                if (selectedGlobalOverlayId === id) setSelectedGlobalOverlayId(null);
              }}
              selectedPhotoOverlayId={selectedPhotoOverlayId}
              onSelectPhotoOverlay={setSelectedPhotoOverlayId}
              onUpdatePhotoOverlay={(id, patch) =>
                updateCurrentEdits(
                  (prev) => ({
                    ...prev,
                    overlays: prev.overlays.map((o) => {
                      if (o.id !== id) return o;
                      const { tiltX, tiltY, ...rest } = patch;
                      const hasTilt = tiltX !== undefined || tiltY !== undefined;
                      return {
                        ...o,
                        ...rest,
                        ...(hasTilt
                          ? {
                              text3d: normalizeTextEffects({
                                ...(o.text3d || {}),
                                ...(tiltX !== undefined ? { tiltX } : {}),
                                ...(tiltY !== undefined ? { tiltY } : {}),
                              }),
                            }
                          : {}),
                      };
                    }),
                  }),
                  false
                )
              }
              onMovePhotoOverlay={(id, x, y) =>
                updateCurrentEdits(
                  (prev) => ({
                    ...prev,
                    overlays: prev.overlays.map((o) => (o.id === id ? { ...o, x, y } : o)),
                  }),
                  false
                )
              }
              onRemovePhotoOverlay={(id) => {
                updateCurrentEdits((prev) => ({
                  ...prev,
                  overlays: prev.overlays.filter((o) => o.id !== id),
                }));
                if (selectedPhotoOverlayId === id) setSelectedPhotoOverlayId(null);
              }}
              selectedPhotoVisualOverlayId={selectedPhotoVisualOverlayId}
              onSelectPhotoVisualOverlay={setSelectedPhotoVisualOverlayId}
              onUpdatePhotoVisualOverlay={(id, patch) =>
                updateCurrentEdits(
                  (prev) => ({
                    ...prev,
                    visualOverlays: (prev.visualOverlays || []).map((o) =>
                      o.id === id ? { ...o, ...patch } : o
                    ),
                  }),
                  false
                )
              }
              onMovePhotoVisualOverlay={(id, x, y) =>
                updateCurrentEdits(
                  (prev) => ({
                    ...prev,
                    visualOverlays: (prev.visualOverlays || []).map((o) =>
                      o.id === id ? { ...o, x, y } : o
                    ),
                  }),
                  false
                )
              }
              onRemovePhotoVisualOverlay={handleRemovePhotoVisualOverlay}
              onOpenCutoutMode={() => {
                setCropMode(false);
                setMaskMode(false);
                setLeftTab('cutout');
                setInspectorTab('cutout');
                if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                  setDrawerOpen(true);
                } else {
                  setDrawerOpen(true);
                  setMobileInspectorOpen(false);
                }
              }}
              onUpdateBgRemovalQuick={handleUpdateBgRemoval}
              onChangePhotoAspect={(ratioId: AspectRatioId) =>
                updateCurrentEdits((prev) => ({
                  ...prev,
                  transform: { ...prev.transform, aspectRatio: ratioId },
                }))
              }
              onTriggerTextBehindShortcut={handleToggleSelectedTextOrAddBehind}
              onSetSelectedOverlayLayerOrder={(id, layerOrder) => {
                if (layerOrder === 'behind') ensureBgRemovalForBehindLayer();
                setGlobalOverlays((prev) =>
                  prev.map((o) => (o.id === id ? { ...o, layerOrder } : o))
                );
                setStatusNotice(
                  layerOrder === 'behind'
                    ? 'Moved text behind isolated subject.'
                    : 'Moved text in front of subject.'
                );
              }}
              onSetPhotoOverlayLayerOrder={(id, layerOrder) => {
                if (layerOrder === 'behind') ensureBgRemovalForBehindLayer();
                updateCurrentEdits((prev) => ({
                  ...prev,
                  overlays: prev.overlays.map((o) =>
                    o.id === id ? { ...o, layerOrder } : o
                  ),
                }));
                setStatusNotice(
                  layerOrder === 'behind'
                    ? 'Moved text behind isolated subject.'
                    : 'Moved text in front of subject.'
                );
              }}
              onSaveProject={handleRequestSaveProject}
              onImportMedia={() => fileInputRef.current?.click()}
              onOpenMediaDrawer={() => {
                setLeftTab('media');
                setDrawerOpen(true);
                setMobileInspectorOpen(false);
              }}
              mobileInspectorOpen={mobileInspectorOpen}
              onToggleMobileInspector={() =>
                setMobileInspectorOpen((v) => {
                  const next = !v;
                  if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
                    setDrawerOpen(false);
                  }
                  return next;
                })
              }
            />

            {workspace === 'timeline' && (
              <Timeline
                clips={clips}
                assets={assets}
                sourceMap={sourceMapRef.current}
                globalOverlays={globalOverlays}
                audioClips={audioClips}
                selectedClipId={inspectedClip?.id || null}
                selectedOverlayId={selectedGlobalOverlayId}
                selectedAudioId={selectedAudioId}
                playhead={playhead}
                totalDuration={totalDuration}
                isPlaying={isPlaying}
                beatBpm={beatBpm}
                onChangeBeatBpm={setBeatBpm}
                onChopToBeat={handleChopToBeat}
                onSelectClip={(id) => {
                  setSelectedClipId(id);
                  setSelectedGlobalOverlayId(null);
                  setSelectedAudioId(null);
                  const span = clipSpans.find((s) => s.clip.id === id);
                  if (span && (playhead < span.start || playhead >= span.start + span.len)) {
                    setPlayhead(span.start + 0.01);
                  }
                }}
                onSelectOverlay={(id) => {
                  setSelectedGlobalOverlayId(id);
                  setSelectedAudioId(null);
                }}
                onSelectAudio={(id) => {
                  setSelectedAudioId(id);
                  setSelectedGlobalOverlayId(null);
                }}
                onSeek={handleSeek}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onStepFrame={(delta) =>
                  handleSeek(clamp(playhead + delta, 0, Math.max(0, totalDuration - 0.01)))
                }
                onSplitAtPlayhead={handleSplitAtPlayhead}
                onDuplicateSelectedClip={() => {
                  if (!inspectedClip) return;
                  const dup: TimelineClip = {
                    ...inspectedClip,
                    id: `clip-${Date.now()}`,
                    keyframes: inspectedClip.keyframes.map((k) => ({ ...k })),
                    edits: cloneEdits(inspectedClip.edits),
                  };
                  setClips((prev) => {
                    const idx = prev.findIndex((c) => c.id === inspectedClip.id);
                    const copy = [...prev];
                    copy.splice(idx + 1, 0, dup);
                    return copy;
                  });
                  setSelectedClipId(dup.id);
                }}
                onConvertClipToOverlay={handleConvertClipToOverlay}
                onDeleteSelected={handleDeleteSelected}
                onMoveClip={(id, dir) => {
                  setClips((prev) => {
                    const idx = prev.findIndex((c) => c.id === id);
                    const nextIdx = idx + dir;
                    if (idx === -1 || nextIdx < 0 || nextIdx >= prev.length) return prev;
                    const copy = [...prev];
                    const [item] = copy.splice(idx, 1);
                    copy.splice(nextIdx, 0, item);
                    return copy;
                  });
                }}
                onReorderClip={(fromIndex, toIndex) => {
                  setClips((prev) => {
                    if (
                      fromIndex < 0 ||
                      fromIndex >= prev.length ||
                      toIndex < 0 ||
                      toIndex >= prev.length ||
                      fromIndex === toIndex
                    ) {
                      return prev;
                    }
                    const copy = [...prev];
                    const [item] = copy.splice(fromIndex, 1);
                    copy.splice(toIndex, 0, item);
                    return copy;
                  });
                }}
                onUpdateClip={(id, patch) => {
                  setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
                }}
                onUpdateOverlay={(id, patch) => {
                  setGlobalOverlays((prev) =>
                    prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
                  );
                }}
                onUpdateAudioClip={(id, patch) => {
                  setAudioClips((prev) =>
                    prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
                  );
                }}
              />
            )}
          </div>

          <Inspector
            edits={currentEdits}
            activeTab={inspectorTab}
            workspace={workspace}
            isAuthenticated={isAccountUnlocked}
            cropMode={cropMode}
            maskMode={maskMode}
            hasCopiedGrade={copiedGrade !== null}
            hasTimelineClips={clips.length > 0}
            histogramData={histogramData}
            selectedOverlay={selectedOverlay}
            selectedAudioClip={selectedAudioClip}
            selectedClip={inspectedClip}
            globalTime={playhead}
            selectedClipStartTime={inspectedSpan?.start || 0}
            selectedClipLength={inspectedSpan?.len || 4}
            onRequireAuth={requireAuth}
            onSeek={handleSeek}
            onClearSelectionFocus={() => {
              setSelectedGlobalOverlayId(null);
              setSelectedAudioId(null);
            }}
            onChangeTab={(tab) => {
              setInspectorTab(tab);
              if (tab !== 'cutout') {
                setBgBrushMode('none');
                setBgEyedropperActive(false);
              }
            }}
            onToggleCropMode={(active) => {
              setCropMode(active);
              if (active) {
                setMaskMode(false);
                setBgBrushMode('none');
                setBgEyedropperActive(false);
              }
            }}
            onToggleMaskMode={(active) => {
              if (active && !isAccountUnlocked) {
                requireAuth('Sign in or create an account to use Shape Masks.');
                return;
              }
              setMaskMode(active);
              if (active) {
                setCropMode(false);
                setBgBrushMode('none');
                setBgEyedropperActive(false);
                if ((currentEdits.mask?.shape || 'none') === 'none') {
                  updateCurrentEdits((prev) => ({
                    ...prev,
                    mask: { ...(prev.mask || DEFAULT_MASK), shape: 'circle' },
                  }));
                }
              }
            }}
            onUpdateColor={(patch: Partial<ColorGrade>) =>
              updateCurrentEdits((prev) => ({
                ...prev,
                color: { ...prev.color, ...patch },
              }))
            }
            onApplyPreset={handleApplyPreset}
            onUpdateTransform={(patch: Partial<TransformSettings>) =>
              updateCurrentEdits((prev) => ({
                ...prev,
                transform: { ...prev.transform, ...patch },
              }))
            }
            onUpdateMask={(patch: Partial<MaskSettings>) =>
              updateCurrentEdits((prev) => ({
                ...prev,
                mask: { ...(prev.mask || DEFAULT_MASK), ...patch },
              }))
            }
            bgBrushMode={bgBrushMode}
            bgBrushSize={bgBrushSize}
            bgEyedropperActive={bgEyedropperActive}
            onUpdateBgRemoval={handleUpdateBgRemoval}
            onSetBgBrushMode={handleSetBgBrushMode}
            onSetBgBrushSize={setBgBrushSize}
            onToggleBgEyedropper={() => {
              setBgEyedropperActive((prev) => {
                const next = !prev;
                if (next) {
                  setBgBrushMode('none');
                  setCropMode(false);
                  setMaskMode(false);
                }
                return next;
              });
            }}
            onClearBgStrokes={handleClearBgStrokes}
            onUndoBgDraw={handleUndoBgDraw}
            onExtractCutoutToOverlay={handleExtractCutoutToOverlay}
            onAddTextBehindSubject={handleAddTextBehindSubject}
            onSetAspectRatio={(ratioId: AspectRatioId) =>
              updateCurrentEdits((prev) => ({
                ...prev,
                transform: { ...prev.transform, aspectRatio: ratioId },
              }))
            }
            onUpdateEffects={(patch: Partial<EffectsSettings>) =>
              updateCurrentEdits((prev) => ({
                ...prev,
                effects: { ...prev.effects, ...patch },
              }))
            }
            onUpdateAnimation={(patch: Partial<ClipAnimationSettings>) =>
              updateCurrentEdits((prev) => ({
                ...prev,
                animation: { ...prev.animation, ...patch },
              }))
            }
            onUpdateClipMeta={(clipId, patch) =>
              setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, ...patch } : c)))
            }
            onConvertClipToOverlay={handleConvertClipToOverlay}
            onToggleClipKeyframe={handleToggleClipKeyframe}
            onUpdateClipKeyframeValues={handleUpdateClipKeyframeValues}
            onUpdateGlobalOverlay={(id, patch) => {
              if (patch.layerOrder === 'behind') {
                ensureBgRemovalForBehindLayer();
              }
              setGlobalOverlays((prev) =>
                prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
              );
            }}
            onToggleOverlayKeyframe={handleToggleOverlayKeyframe}
            onUpdateOverlayMotionAtPlayhead={handleUpdateOverlayMotionAtPlayhead}
            onDuplicateGlobalOverlay={handleDuplicateGlobalOverlay}
            onDeleteGlobalOverlay={(id) => {
              setGlobalOverlays((prev) => prev.filter((o) => o.id !== id));
              setSelectedGlobalOverlayId(null);
            }}
            onUpdateAudioClip={(id, patch) =>
              setAudioClips((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
            }
            onDeleteAudioClip={(id) => {
              setAudioClips((prev) => prev.filter((a) => a.id !== id));
              setSelectedAudioId(null);
            }}
            selectedPhotoOverlayId={selectedPhotoOverlayId}
            onSelectPhotoOverlay={setSelectedPhotoOverlayId}
            selectedPhotoVisualOverlayId={selectedPhotoVisualOverlayId}
            onSelectPhotoVisualOverlay={setSelectedPhotoVisualOverlayId}
            onAddPhotoTextOverlay={() => handleAddTextTemplate('cinema-3d')}
            onUpdatePhotoTextOverlay={(id, patch) => {
              if (patch.layerOrder === 'behind') {
                ensureBgRemovalForBehindLayer();
              }
              updateCurrentEdits((prev) => ({
                ...prev,
                overlays: prev.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
              }));
            }}
            onDuplicatePhotoTextOverlay={handleDuplicatePhotoTextOverlay}
            onReorderPhotoTextOverlay={handleReorderPhotoTextOverlay}
            onRemovePhotoTextOverlay={(id) => {
              updateCurrentEdits((prev) => ({
                ...prev,
                overlays: prev.overlays.filter((o) => o.id !== id),
              }));
              if (selectedPhotoOverlayId === id) setSelectedPhotoOverlayId(null);
            }}
            onUpdatePhotoVisualOverlay={handleUpdatePhotoVisualOverlay}
            onRemovePhotoVisualOverlay={handleRemovePhotoVisualOverlay}
            onOpenOverlaysDrawer={() => {
              setLeftTab('overlays');
              setDrawerOpen(true);
              setMobileInspectorOpen(false);
            }}
            onCopyGrade={() =>
              setCopiedGrade({
                color: { ...currentEdits.color },
                effects: { ...currentEdits.effects },
              })
            }
            onPasteGrade={() => {
              if (!copiedGrade) return;
              updateCurrentEdits((prev) => ({
                ...prev,
                color: { ...copiedGrade.color },
                effects: { ...copiedGrade.effects },
              }));
            }}
            onResetAll={() => {
              setCropMode(false);
              setMaskMode(false);
              setBgBrushMode('none');
              setBgEyedropperActive(false);
              setSelectedPhotoOverlayId(null);
              setSelectedPhotoVisualOverlayId(null);
              updateCurrentEdits(() =>
                createDefaultEdits('none', workspace === 'timeline' ? 'contain' : 'cover')
              );
            }}
            mobileOpen={mobileInspectorOpen}
            onCloseMobile={() => setMobileInspectorOpen(false)}
          />
        </main>
      )}

      <PresetsGallery
        isOpen={presetsOpen}
        isAuthenticated={isAccountUnlocked}
        activePresetId={currentEdits.color.presetId}
        sourceElement={currentAsset ? sourceMapRef.current[currentAsset.id] || null : null}
        baseEdits={currentEdits}
        onApplyPreset={handleApplyPreset}
        onRequireAuth={requireAuth}
        onClose={() => setPresetsOpen(false)}
      />

      <ExportModal
        isOpen={exportOpen}
        isAuthenticated={isAccountUnlocked}
        workspace={workspace}
        projectName={currentProjectName}
        activeAsset={currentAsset}
        activeEdits={currentEdits}
        assets={assets}
        sourceMap={sourceMapRef.current}
        clips={clips}
        selectedClip={inspectedClip}
        playhead={playhead}
        globalOverlays={globalOverlays}
        audioClips={audioClips}
        sequenceAspect={sequenceAspect}
        totalDuration={totalDuration}
        onRequireAuth={requireAuth}
        onClose={() => setExportOpen(false)}
      />

      <AuthModal
        isOpen={authModalOpen}
        initialTab={authModalTab}
        featureNotice={authFeatureReason}
        user={user}
        studioDisplayName={studioDisplayName}
        studioUsername={studioUsername}
        pendingUsername={pendingUsername}
        savedProjectsCount={savedProjects.length}
        authLoading={authLoading}
        onGoogleAuth={async (preferredName, preferredUsername) => {
          const cred = await signInWithPopup(auth, googleProvider);
          const profile = await syncUserProfile(cred.user, preferredName, preferredUsername);
          setStudioDisplayName(profile.displayName);
          setStudioUsername(profile.username);
          setPendingUsername('');
          setAuthFeatureReason(null);
          setStatusNotice(
            profile.username
              ? `Signed in as @${profile.username}.`
              : `Signed in as ${profile.displayName}.`
          );
        }}
        onEmailSignIn={async (emailInput, passwordInput) => {
          const cred = await signInWithEmailAndPassword(auth, emailInput, passwordInput);
          setUser(cred.user);
          setAuthRevision((r) => r + 1);
          if (cred.user.emailVerified) {
            const profile = await syncUserProfile(cred.user);
            setStudioDisplayName(profile.displayName);
            setStudioUsername(profile.username);
            setPendingUsername('');
            setAuthFeatureReason(null);
            setStatusNotice(
              profile.username
                ? `Signed in as @${profile.username}.`
                : `Signed in as ${profile.displayName}.`
            );
            return true;
          }
          setStatusNotice('Verify your email address to activate cloud saving.');
          return false;
        }}
        onEmailSignUp={async ({ email: emailInput, password: passwordInput, username, displayName }) => {
          const cred = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
          const finalDisplay = (displayName || username).trim();
          await updateProfile(cred.user, { displayName: finalDisplay });
          savePendingUsername(cred.user.uid, username);
          setPendingUsername(username);
          setStudioDisplayName(finalDisplay);
          try {
            await sendEmailVerification(cred.user);
            setStatusNotice(`Account created. Check ${emailInput} to verify and activate @${username}.`);
          } catch {
            setStatusNotice(
              `Account created for @${username}. Click "Resend Verification Email" to send your verification link.`
            );
          }
        }}
        onPasswordReset={async (emailInput) => {
          await sendPasswordResetEmail(auth, emailInput);
        }}
        onCheckUsername={(rawUsername) => checkUsernameAvailability(rawUsername, user?.uid)}
        onClaimUsername={async (rawUsername) => {
          if (!user) return;
          const profile = await claimOrUpdateUsername(user, rawUsername, studioDisplayName);
          setStudioDisplayName(profile.displayName);
          setStudioUsername(profile.username);
          setPendingUsername('');
          setStatusNotice(`Handle @${profile.username} reserved to your account.`);
        }}
        onUpdateDisplayName={async (newName) => {
          if (!user) return;
          const profile = await syncUserProfile(user, newName);
          setStudioDisplayName(profile.displayName);
          setStudioUsername(profile.username);
          setStatusNotice(`Updated studio name to ${profile.displayName}.`);
        }}
        onRefreshVerification={async () => {
          const current = auth.currentUser;
          if (!current) return false;
          await current.reload();
          await current.getIdToken(true);
          setUser(current);
          setAuthRevision((r) => r + 1);
          if (current.emailVerified) {
            const profile = await syncUserProfile(current);
            setStudioDisplayName(profile.displayName);
            setStudioUsername(profile.username);
            setPendingUsername('');
            setAuthFeatureReason(null);
            setStatusNotice(
              profile.username
                ? `Email verified! Welcome @${profile.username}.`
                : 'Email verified! Cloud workspace activated.'
            );
            if (pendingSaveAfterAuthRef.current) {
              setPendingSaveAfterAuth(false);
              setSaveModalOpen(true);
            }
            return true;
          }
          return false;
        }}
        onResendVerification={async () => {
          const current = auth.currentUser;
          if (!current) return;
          await sendEmailVerification(current);
        }}
        onSignOut={async () => {
          const uid = auth.currentUser?.uid || user?.uid;
          await signOut(auth);
          if (uid) clearPendingUsername(uid);
          setUser(null);
          setAuthRevision((r) => r + 1);
          setSavedProjects([]);
          setCurrentProjectId(null);
          setIsProjectSaved(false);
          setSaveModalOpen(false);
          setPendingSaveAfterAuth(false);
          setStudioDisplayName('');
          setStudioUsername('');
          setPendingUsername('');
          setAuthFeatureReason(null);
          setStatusNotice('Signed out.');
        }}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthFeatureReason(null);
          setPendingSaveAfterAuth(false);
        }}
      />

      <SaveProjectModal
        isOpen={saveModalOpen}
        currentProjectId={currentProjectId}
        defaultName={currentProjectName}
        mode={workspace === 'photo' ? 'photo' : 'timeline'}
        clipCount={clips.length}
        saving={savingProject}
        onSave={handleConfirmSaveProject}
        onClose={() => setSaveModalOpen(false)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleImportFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {statusNotice && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-medium text-zinc-100 shadow-xl">
          {statusNotice}
        </div>
      )}
    </div>
  );
}
