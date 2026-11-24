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
  DEFAULT_COLOR_GRADE,
  DEFAULT_MASK,
  FILM_PRESETS,
  MASK_OVERLAY_PRESETS,
  SAMPLE_MEDIA_ASSETS,
  TEXT_STYLE_TEMPLATES,
} from './data/presets';
import {
  AspectRatioId,
  AudioAsset,
  AudioClip,
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
  StickerKind,
  TextOverlay,
  TimelineClip,
  TimelineOverlayItem,
  TransformSettings,
  WorkspaceMode,
} from './types/editor';
import { createBuiltInAudioLibrary, extractPeaksFromAudioFile } from './utils/audioSynth';
import {
  computeHistogram,
  computeTargetDimensions,
  evaluateClipKeyframes,
  evaluateOverlayAtTime,
  getSourceDimensions,
  HistogramData,
  renderFrameToCanvas,
} from './utils/renderEngine';
import { clamp } from './utils/timecode';

function cloneEdits(edits: EditDocument): EditDocument {
  return {
    color: { ...edits.color },
    transform: { ...edits.transform, crop: { ...edits.transform.crop } },
    mask: { ...(edits.mask || DEFAULT_MASK) },
    effects: { ...edits.effects },
    animation: { ...edits.animation },
    overlays: edits.overlays.map((o) => ({ ...o })),
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
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

  const [sequenceAspect, setSequenceAspect] = useState<AspectRatioId>('16:9');
  const [playhead, setPlayhead] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('color');
  const [cropMode, setCropMode] = useState<boolean>(false);
  const [maskMode, setMaskMode] = useState<boolean>(false);
  const [compareSplit, setCompareSplit] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [presetsOpen, setPresetsOpen] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const [authFeatureReason, setAuthFeatureReason] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false);
  const [pendingSaveAfterAuth, setPendingSaveAfterAuth] = useState<boolean>(false);

  const [user, setUser] = useState<User | null>(null);
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
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioPlayersRef = useRef<Record<string, HTMLAudioElement>>({});
  const skipDirtyMarkRef = useRef<boolean>(true);
  const workspaceRef = useRef<WorkspaceMode>(workspace);
  workspaceRef.current = workspace;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
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
          if (pendingSaveAfterAuth) {
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
  }, [pendingSaveAfterAuth]);

  useEffect(() => {
    if (authLoading || !user || !user.emailVerified) return;
    const unsub = subscribeToUserProjects(user.uid, (items) => {
      setSavedProjects(items);
    });
    return () => unsub();
  }, [authLoading, user]);

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
    if (clipSpans.length === 0) return 0;
    const last = clipSpans[clipSpans.length - 1];
    return last.start + last.len;
  }, [clipSpans]);

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
        setUndoStack((prev) => [...prev.slice(-29), cloneEdits(currentEdits)]);
        setRedoStack([]);
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
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, cloneEdits(currentEdits)]);
    updateCurrentEdits(() => previous, false);
  }, [undoStack, currentEdits, updateCurrentEdits]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
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
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHistogramData(null);
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
    });

    if (compareSplit && originalCanvasRef.current) {
      renderFrameToCanvas(originalCanvasRef.current, srcEl, {
        edits: editsToRender,
        bypassEdits: true,
      });
    }

    setHistogramData(computeHistogram(canvas));
  }, [
    workspace,
    currentAsset,
    activeTimelineSpan,
    currentEdits,
    playhead,
    compareSplit,
    globalOverlays,
    sourceVersion,
  ]);

  useEffect(() => {
    if (workspace === 'start') return;
    if (!isPlaying) {
      const span = workspace === 'timeline' ? activeTimelineSpan : null;
      const targetId = span ? span.clip.assetId : currentAsset?.id;
      const srcEl = targetId ? sourceMapRef.current[targetId] : null;
      if (srcEl instanceof HTMLVideoElement) {
        const localTime = span ? Math.max(0, playhead - span.start) : 0;
        const targetVideoTime = span
          ? clamp(span.clip.trimStart + localTime * span.clip.speed, 0, srcEl.duration || 10)
          : 0;
        if (Math.abs(srcEl.currentTime - targetVideoTime) > 0.05) {
          srcEl.addEventListener('seeked', () => renderCurrentStage(), { once: true });
          srcEl.currentTime = targetVideoTime;
          return;
        }
      }
      renderCurrentStage();
    }
  }, [isPlaying, workspace, activeTimelineSpan, currentAsset, playhead, renderCurrentStage]);

  useEffect(() => {
    if (!isPlaying || workspace !== 'timeline' || totalDuration <= 0) {
      Object.values(audioPlayersRef.current).forEach((el) => el.pause());
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
  }, [isPlaying, workspace, playhead, activeTimelineSpan, audioClips, renderCurrentStage]);

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
    user,
    currentEdits,
    updateCurrentEdits,
    handleUndo,
    handleRedo,
    handleSplitAtPlayhead,
    handleDeleteSelected,
    handleSeek,
    playhead,
    totalDuration,
  ]);

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

  const handleAddTextTemplate = useCallback(
    (templateId: 'clean' | 'bold-kinetic' | 'cinema-sub' | 'lower-third' | 'amber-tag') => {
      const tpl = TEXT_STYLE_TEMPLATES.find((t) => t.id === templateId) || TEXT_STYLE_TEMPLATES[0];
      if (workspace === 'photo') {
        const newOv: TextOverlay = {
          id: `pov-${Date.now()}`,
          text: tpl.preview,
          x: 0.5,
          y: 0.8,
          fontSize: tpl.fontSize,
          fontFamily: tpl.fontFamily,
          color: tpl.color,
          backdrop: tpl.backdrop,
          styleTemplate: tpl.id,
          animationIn: 'none',
          startTime: 0,
          endTime: 10,
        };
        updateCurrentEdits((prev) => ({
          ...prev,
          overlays: [...prev.overlays, newOv],
        }));
        setInspectorTab('animate');
        return;
      }

      const newOv: TimelineOverlayItem = {
        id: `ov-${Date.now()}`,
        kind: 'text',
        startTime: Number(playhead.toFixed(2)),
        duration: 2.0,
        x: 0.5,
        y: 0.72,
        scale: 1,
        rotation: 0,
        opacity: 1,
        easing: 'ease-out',
        keyframes: [
          { id: `kf-${Date.now()}-a`, time: 0, x: 0.5, y: 0.78, scale: 0.85, rotation: 0, opacity: 0.2 },
          { id: `kf-${Date.now()}-b`, time: 0.35, x: 0.5, y: 0.72, scale: 1, rotation: 0, opacity: 1 },
        ],
        text: tpl.preview,
        fontSize: tpl.fontSize,
        fontFamily: tpl.fontFamily,
        letterSpacing: 1,
        color: tpl.color,
        backdrop: tpl.backdrop,
        styleTemplate: tpl.id,
        animationIn: 'none',
      };
      setGlobalOverlays((prev) => [...prev, newOv]);
      setSelectedGlobalOverlayId(newOv.id);
      setSelectedAudioId(null);
      setWorkspace('timeline');
    },
    [playhead, workspace, updateCurrentEdits]
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
      patch: { x?: number; y?: number; scale?: number; rotation?: number; opacity?: number }
    ) => {
      setGlobalOverlays((prev) =>
        prev.map((ov) => {
          if (ov.id !== overlayId) return ov;
          const localTime = clamp(Number((playhead - ov.startTime).toFixed(2)), 0, ov.duration);
          if (ov.keyframes.length === 0) {
            return { ...ov, ...patch };
          }
          const existingIdx = ov.keyframes.findIndex((k) => Math.abs(k.time - localTime) < 0.08);
          if (existingIdx !== -1) {
            const nextKfs = ov.keyframes.map((k, idx) =>
              idx === existingIdx ? { ...k, ...patch } : k
            );
            return { ...ov, keyframes: nextKfs };
          }
          // Auto-insert keyframe at playhead when keyframes already exist
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

  return (
    <div className="h-dvh w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-100">
      <Header
        workspace={workspace}
        user={user}
        studioDisplayName={studioDisplayName}
        studioUsername={studioUsername}
        onSelectWorkspace={(mode) => {
          setIsPlaying(false);
          setCropMode(false);
          setMaskMode(false);
          setMobileInspectorOpen(false);
          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setDrawerOpen(false);
          }
          if (mode === 'photo' && (leftTab === 'audio' || leftTab === 'stickers')) {
            setLeftTab('media');
          }
          setWorkspace(mode);
          setUndoStack([]);
          setRedoStack([]);
        }}
        onOpenPresets={() => setPresetsOpen(true)}
        onFocusImport={() => {
          if (workspace === 'start') setWorkspace('timeline');
          setLeftTab('media');
          setMobileInspectorOpen(false);
          if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
            setDrawerOpen(true);
          } else {
            setDrawerOpen(false);
          }
          setTimeout(() => fileInputRef.current?.click(), 50);
        }}
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
        <>
          <StartScreen
            assets={assets}
            user={user}
            studioUsername={studioUsername}
            authLoading={authLoading}
            savedProjects={savedProjects}
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
            onImportVideo={(aspect) => {
              setSequenceAspect(aspect);
              setWorkspace('timeline');
              setLeftTab('media');
              setDrawerOpen(true);
              setTimeout(() => fileInputRef.current?.click(), 50);
            }}
            onImportPhoto={() => {
              setWorkspace('photo');
              setLeftTab('media');
              setDrawerOpen(true);
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
        </>
      ) : (
        <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">
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
            fileInputRef={fileInputRef}
            onRequireAuth={requireAuth}
            onChangeTab={(tab) => {
              setLeftTab(tab);
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
            onAddAudioClip={(id) => {
              handleAddAudioClip(id);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(false);
              }
            }}
            onImportAudioFiles={handleImportAudioFiles}
            onAddTextTemplate={(tplId) => {
              handleAddTextTemplate(tplId);
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
              sequenceAspect={sequenceAspect}
              globalTime={playhead}
              globalOverlays={globalOverlays}
              selectedGlobalOverlayId={selectedGlobalOverlayId}
              onToggleCompare={() => setCompareSplit((v) => !v)}
              onToggleGrid={() => setShowGrid((v) => !v)}
              onToggleCropMode={() => {
                setCropMode((v) => {
                  const next = !v;
                  if (next) {
                    setMaskMode(false);
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
              onMovePhotoOverlay={(id, x, y) =>
                updateCurrentEdits(
                  (prev) => ({
                    ...prev,
                    overlays: prev.overlays.map((o) => (o.id === id ? { ...o, x, y } : o)),
                  }),
                  false
                )
              }
              onRemovePhotoOverlay={(id) =>
                updateCurrentEdits((prev) => ({
                  ...prev,
                  overlays: prev.overlays.filter((o) => o.id !== id),
                }))
              }
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
            onChangeTab={setInspectorTab}
            onToggleCropMode={(active) => {
              setCropMode(active);
              if (active) setMaskMode(false);
            }}
            onToggleMaskMode={(active) => {
              if (active && !isAccountUnlocked) {
                requireAuth('Sign in or create an account to use Shape Masks.');
                return;
              }
              setMaskMode(active);
              if (active) {
                setCropMode(false);
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
            onToggleClipKeyframe={handleToggleClipKeyframe}
            onUpdateClipKeyframeValues={handleUpdateClipKeyframeValues}
            onUpdateGlobalOverlay={(id, patch) =>
              setGlobalOverlays((prev) =>
                prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
              )
            }
            onToggleOverlayKeyframe={handleToggleOverlayKeyframe}
            onUpdateOverlayMotionAtPlayhead={handleUpdateOverlayMotionAtPlayhead}
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
            onAddPhotoTextOverlay={() => handleAddTextTemplate('bold-kinetic')}
            onUpdatePhotoTextOverlay={(id, patch) =>
              updateCurrentEdits((prev) => ({
                ...prev,
                overlays: prev.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
              }))
            }
            onRemovePhotoTextOverlay={(id) =>
              updateCurrentEdits((prev) => ({
                ...prev,
                overlays: prev.overlays.filter((o) => o.id !== id),
              }))
            }
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
          } else {
            setStatusNotice('Verify your email address to activate cloud saving.');
          }
        }}
        onEmailSignUp={async ({ email: emailInput, password: passwordInput, username, displayName }) => {
          const cred = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
          const finalDisplay = (displayName || username).trim();
          await updateProfile(cred.user, { displayName: finalDisplay });
          savePendingUsername(cred.user.uid, username);
          setPendingUsername(username);
          setStudioDisplayName(finalDisplay);
          await sendEmailVerification(cred.user);
          setStatusNotice(`Account created. Check ${emailInput} to verify and activate @${username}.`);
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
          if (current.emailVerified) {
            setUser({ ...current });
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
            if (pendingSaveAfterAuth) {
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
          await signOut(auth);
          setCurrentProjectId(null);
          setIsProjectSaved(false);
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

      {statusNotice && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-medium text-zinc-100 shadow-xl">
          {statusNotice}
        </div>
      )}
    </div>
  );
}
