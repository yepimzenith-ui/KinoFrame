import React, { useEffect, useRef, useState } from 'react';
import {
  Blend,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Eraser,
  Film,
  Image as ImageIcon,
  Lasso,
  Layers,
  Lock,
  MousePointerClick,
  Music,
  Paintbrush,
  Pause,
  Pipette,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  DEFAULT_BG_REMOVAL,
  FONT_OPTIONS,
  MASK_OVERLAY_PRESETS,
  MASK_SHAPE_OPTIONS,
  STICKER_OPTIONS,
  TEXT_STYLE_TEMPLATES,
  VISUAL_OVERLAY_PRESETS,
} from '../data/presets';
import {
  AudioAsset,
  BgAutoSubjectType,
  BgBackdropMode,
  BgBrushToolMode,
  BgRemovalMode,
  BgRemovalSettings,
  EffectsSettings,
  LeftDrawerTab,
  MaskOverlayPresetId,
  MaskShape,
  MediaAsset,
  OverlayLayerOrder,
  PhotoVisualOverlay,
  StickerKind,
  TextStyleTemplateId,
  VisualOverlayPresetId,
  WorkspaceMode,
} from '../types/editor';
import { formatDurationShort } from '../utils/timecode';

interface LeftToolRailProps {
  activeTab: LeftDrawerTab;
  drawerOpen: boolean;
  workspace: WorkspaceMode;
  isAuthenticated: boolean;
  assets: MediaAsset[];
  activeAssetId: string;
  audioAssets: AudioAsset[];
  currentEffects: EffectsSettings;
  currentMaskShape: MaskShape;
  currentBgRemoval: BgRemovalSettings;
  bgBrushMode: BgBrushToolMode;
  bgBrushSize: number;
  bgEyedropperActive: boolean;
  photoVisualOverlays: PhotoVisualOverlay[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onChangeTab: (tab: LeftDrawerTab) => void;
  onToggleDrawer: () => void;
  onRequireAuth: (reason: string) => void;
  onSelectAsset: (assetId: string) => void;
  onAddToTimeline: (assetId: string) => void;
  onImportFiles: (files: FileList) => void;
  onRemoveAsset: (assetId: string) => void;
  onUpdateBgRemoval: (patch: Partial<BgRemovalSettings>) => void;
  onSetBgBrushMode: (mode: BgBrushToolMode) => void;
  onSetBgBrushSize: (size: number) => void;
  onToggleBgEyedropper: () => void;
  onClearBgStrokes: () => void;
  onUndoBgDraw: () => void;
  onExtractCutoutToOverlay: () => void;
  onAddTextBehindSubject: () => void;
  onAddVisualOverlay: (presetId: VisualOverlayPresetId, layerOrder?: OverlayLayerOrder) => void;
  onAddImageOverlay: (asset: MediaAsset, layerOrder?: OverlayLayerOrder) => void;
  onAddVideoOverlay: (asset: MediaAsset, layerOrder?: OverlayLayerOrder) => void;
  onImportOverlayImages: (files: FileList) => void;
  onRemovePhotoVisualOverlay: (id: string) => void;
  onTogglePhotoVisualOverlayBg?: (id: string) => void;
  onAddAudioClip: (audioAssetId: string) => void;
  onImportAudioFiles: (files: FileList) => void;
  onAddTextTemplate: (
    templateId: TextStyleTemplateId,
    layerOrder?: OverlayLayerOrder
  ) => void;
  onAddSticker: (kind: StickerKind) => void;
  onApplyShapeMask: (shape: MaskShape) => void;
  onAddMaskOverlay: (presetId: MaskOverlayPresetId) => void;
  onToggleVisualEffect: (patch: Partial<EffectsSettings>) => void;
}

export const LeftToolRail: React.FC<LeftToolRailProps> = ({
  activeTab,
  drawerOpen,
  workspace,
  isAuthenticated,
  assets,
  activeAssetId,
  audioAssets,
  currentEffects,
  currentMaskShape,
  currentBgRemoval,
  bgBrushMode,
  bgBrushSize,
  bgEyedropperActive,
  photoVisualOverlays,
  fileInputRef,
  onChangeTab,
  onToggleDrawer,
  onRequireAuth,
  onSelectAsset,
  onAddToTimeline,
  onImportFiles,
  onRemoveAsset,
  onUpdateBgRemoval,
  onSetBgBrushMode,
  onSetBgBrushSize,
  onToggleBgEyedropper,
  onClearBgStrokes,
  onUndoBgDraw,
  onExtractCutoutToOverlay,
  onAddTextBehindSubject,
  onAddVisualOverlay,
  onAddImageOverlay,
  onAddVideoOverlay,
  onImportOverlayImages,
  onRemovePhotoVisualOverlay,
  onTogglePhotoVisualOverlayBg,
  onAddAudioClip,
  onImportAudioFiles,
  onAddTextTemplate,
  onAddSticker,
  onApplyShapeMask,
  onAddMaskOverlay,
  onToggleVisualEffect,
}) => {
  const [mediaFilter, setMediaFilter] = useState<'all' | 'photo' | 'video'>('all');
  const [audioFilter, setAudioFilter] = useState<'all' | 'music' | 'sfx'>('all');
  const [textLayerOrder, setTextLayerOrder] = useState<OverlayLayerOrder>('front');
  const [overlayLayerOrder, setOverlayLayerOrder] = useState<OverlayLayerOrder>('front');
  const [dragOver, setDragOver] = useState(false);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const [previewAudioId, setPreviewAudioId] = useState<string | null>(null);
  const previewAudioElRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const overlayImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewAudioElRef.current) {
        previewAudioElRef.current.pause();
        previewAudioElRef.current = null;
      }
    };
  }, []);

  const allRailItems: {
    id: LeftDrawerTab;
    label: string;
    icon: React.ReactNode;
    timelineOnly?: boolean;
    requiresAuth?: boolean;
  }[] = [
    { id: 'media', label: 'Media', icon: <Layers className="w-4 h-4" /> },
    { id: 'cutout', label: 'BG Remove', icon: <Scissors className="w-4 h-4" /> },
    { id: 'overlays', label: 'Overlays', icon: <Blend className="w-4 h-4" /> },
    { id: 'audio', label: 'Audio', icon: <Music className="w-4 h-4" />, timelineOnly: true },
    { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
    { id: 'masks', label: 'Masks', icon: <CircleDot className="w-4 h-4" />, requiresAuth: true },
    { id: 'stickers', label: 'Stickers', icon: <Sticker className="w-4 h-4" />, timelineOnly: true, requiresAuth: true },
    { id: 'effects', label: 'Effects', icon: <Sparkles className="w-4 h-4" />, requiresAuth: true },
  ];

  const railItems =
    workspace === 'photo' ? allRailItems.filter((item) => !item.timelineOnly) : allRailItems;

  const togglePreviewAudio = (audio: AudioAsset) => {
    if (previewAudioId === audio.id && previewAudioElRef.current) {
      previewAudioElRef.current.pause();
      setPreviewAudioId(null);
      return;
    }
    if (previewAudioElRef.current) {
      previewAudioElRef.current.pause();
    }
    const el = new Audio(audio.src);
    el.onended = () => setPreviewAudioId(null);
    void el.play().catch(() => {});
    previewAudioElRef.current = el;
    setPreviewAudioId(audio.id);
  };

  const filteredAssets = assets.filter((a) =>
    mediaFilter === 'all' ? true : a.kind === mediaFilter
  );
  const filteredAudio = audioAssets.filter((a) =>
    audioFilter === 'all'
      ? true
      : a.category === audioFilter || (audioFilter === 'music' && a.category === 'imported')
  );

  return (
    <div className="order-3 lg:order-none flex flex-col lg:flex-row shrink-0 min-h-0 bg-zinc-950 border-t lg:border-t-0 lg:border-r border-zinc-800 relative">
      <nav
        aria-label="Studio tools"
        className="w-full lg:w-16 h-13 lg:h-auto shrink-0 lg:border-r border-zinc-800/80 flex flex-row lg:flex-col items-center justify-around lg:justify-start px-2 lg:px-0 py-1 lg:py-2.5 gap-1 bg-zinc-950 overflow-x-auto"
      >
        {railItems.map((item) => {
          const active = drawerOpen && activeTab === item.id;
          const locked = Boolean(item.requiresAuth && !isAuthenticated);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (active) onToggleDrawer();
                else {
                  onChangeTab(item.id);
                  if (!drawerOpen) onToggleDrawer();
                }
              }}
              className={`relative min-w-13 lg:w-13 py-1.5 lg:py-2.5 px-2 lg:px-0 rounded-lg flex flex-col items-center justify-center gap-0.5 lg:gap-1 transition-colors cursor-pointer shrink-0 ${
                active
                  ? 'bg-zinc-800/90 text-amber-400'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              {locked && (
                <Lock className="w-2.5 h-2.5 text-amber-400 absolute top-1 right-1.5" aria-hidden="true" />
              )}
              {item.icon}
              <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}

        <div className="hidden lg:block mt-auto pt-2">
          <button
            type="button"
            onClick={onToggleDrawer}
            title={drawerOpen ? 'Collapse drawer' : 'Expand drawer'}
            aria-label={drawerOpen ? 'Collapse tool drawer' : 'Expand tool drawer'}
            className="p-2 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
          >
            {drawerOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <aside className="fixed lg:static inset-x-0 bottom-13 lg:bottom-auto z-40 w-full lg:w-68 max-h-[58dvh] lg:max-h-none border-t lg:border-t-0 border-zinc-700 lg:border-zinc-800 rounded-t-xl lg:rounded-none shadow-2xl lg:shadow-none shrink-0 flex flex-col min-h-0 bg-zinc-950">
          <div className="lg:hidden px-3.5 py-2 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 rounded-t-xl">
            <span className="text-xs font-semibold capitalize text-zinc-200">{activeTab} Tools</span>
            <button
              type="button"
              onClick={onToggleDrawer}
              aria-label="Close tool sheet"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {activeTab === 'media' && (
            <>
              <div className="p-3.5 border-b border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-100">Media Library</h2>
                  <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                    {assets.length} files
                  </span>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files?.length) onImportFiles(e.dataTransfer.files);
                  }}
                  className={`rounded-lg border border-dashed p-2.5 transition-colors ${
                    dragOver
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-1 text-xs font-medium text-zinc-200 hover:text-amber-400 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>Import Clips or Photos</span>
                  </button>
                  <p className="text-[10px] text-zinc-500 text-center mt-0.5">
                    MP4, WebM, MOV, JPG, PNG
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 rounded-md">
                  {(['all', 'photo', 'video'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setMediaFilter(tab)}
                      className={`py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        mediaFilter === tab
                          ? 'bg-zinc-800 text-zinc-50'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tab === 'all' ? 'All' : tab === 'photo' ? 'Photos' : 'Clips'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-4">
                {(() => {
                  const yourMedia = filteredAssets.filter((a) => !a.isSample);
                  const sampleMedia = filteredAssets.filter((a) => a.isSample);

                  const renderAssetCard = (asset: MediaAsset) => {
                    const isActive = asset.id === activeAssetId && workspace === 'photo';
                    const loadFailed = failedIds[asset.id];
                    return (
                      <div
                        key={asset.id}
                        className={`group rounded-lg border overflow-hidden transition-colors ${
                          isActive
                            ? 'border-amber-500 bg-zinc-900'
                            : 'border-zinc-800/90 bg-zinc-900/40 hover:border-zinc-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectAsset(asset.id)}
                          className="w-full block text-left cursor-pointer"
                        >
                          <div className="relative aspect-video w-full bg-zinc-900 overflow-hidden">
                            {loadFailed ? (
                              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-1">
                                {asset.kind === 'video' ? (
                                  <Film className="w-4 h-4" />
                                ) : (
                                  <ImageIcon className="w-4 h-4" />
                                )}
                                <span className="text-[10px] truncate max-w-[85%]">{asset.name}</span>
                              </div>
                            ) : asset.kind === 'video' ? (
                              <video
                                src={asset.src}
                                muted
                                playsInline
                                preload="metadata"
                                onError={() => setFailedIds((p) => ({ ...p, [asset.id]: true }))}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={asset.src}
                                alt={asset.name}
                                referrerPolicy="no-referrer"
                                onError={() => setFailedIds((p) => ({ ...p, [asset.id]: true }))}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                        </button>
                        <div className="px-2.5 py-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectAsset(asset.id)}
                            className="min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <p className="text-xs font-medium text-zinc-100 truncate">{asset.name}</p>
                            <p className="text-[10px] font-mono text-zinc-500 tabular-nums truncate">
                              {asset.kind === 'video'
                                ? `Clip · ${formatDurationShort(asset.duration)}`
                                : `Photo · ${asset.width}×${asset.height}`}
                            </p>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onAddToTimeline(asset.id)}
                              title="Add to Timeline"
                              aria-label={`Add ${asset.name} to timeline`}
                              className="p-1.5 rounded bg-zinc-800 text-zinc-200 hover:bg-amber-500 hover:text-zinc-950 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            {!asset.isSample && (
                              <button
                                type="button"
                                onClick={() => onRemoveAsset(asset.id)}
                                aria-label={`Delete ${asset.name}`}
                                className="p-1.5 rounded text-zinc-500 hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-zinc-300">
                            Your Clips & Photos
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {yourMedia.length}
                          </span>
                        </div>
                        {yourMedia.length === 0 ? (
                          <div className="py-5 px-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 text-center space-y-2">
                            <p className="text-[11px] text-zinc-400">
                              No local clips imported yet.
                            </p>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-3 py-1.5 text-[11px] font-medium bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 rounded-md text-zinc-100 transition-colors cursor-pointer"
                            >
                              Choose Files from Device
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">{yourMedia.map(renderAssetCard)}</div>
                        )}
                      </div>

                      {sampleMedia.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-zinc-500">
                              Optional Studio Samples
                            </span>
                            <span className="text-[10px] font-mono text-zinc-600">
                              {sampleMedia.length}
                            </span>
                          </div>
                          <div className="space-y-2">{sampleMedia.map(renderAssetCard)}</div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}

          {activeTab === 'cutout' && (
            <>
              <div className="p-3.5 border-b border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-semibold text-zinc-100">Background Removal</h2>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Auto person detection, pick subject, or draw cutout
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextEnabled = !currentBgRemoval.enabled;
                      onUpdateBgRemoval({
                        enabled: nextEnabled,
                        backdropMode:
                          nextEnabled && currentBgRemoval.backdropMode === 'original'
                            ? 'transparent'
                            : currentBgRemoval.backdropMode,
                      });
                      if (!nextEnabled) onSetBgBrushMode('none');
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                      currentBgRemoval.enabled
                        ? 'border-amber-400 bg-amber-400 text-zinc-950'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-amber-500'
                    }`}
                  >
                    {currentBgRemoval.enabled ? 'Active' : 'Enable'}
                  </button>
                </div>

                {/* Primary Mode Switch: Auto vs Pick Subject vs Draw */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 rounded-md">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateBgRemoval({
                        enabled: true,
                        mode: 'auto',
                        backdropMode:
                          currentBgRemoval.backdropMode === 'original'
                            ? 'transparent'
                            : currentBgRemoval.backdropMode,
                      });
                      if (
                        bgBrushMode === 'lasso' ||
                        bgBrushMode === 'pick-keep' ||
                        bgBrushMode === 'pick-remove'
                      ) {
                        onSetBgBrushMode('none');
                      }
                    }}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer transition-colors whitespace-nowrap ${
                      currentBgRemoval.enabled && currentBgRemoval.mode === 'auto'
                        ? 'bg-zinc-800 text-amber-300'
                        : 'text-zinc-400 hover:text-zinc-100'
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
                          currentBgRemoval.backdropMode === 'original'
                            ? 'transparent'
                            : currentBgRemoval.backdropMode,
                      });
                      if (bgBrushMode !== 'pick-keep' && bgBrushMode !== 'pick-remove') {
                        onSetBgBrushMode('pick-keep');
                      }
                    }}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer transition-colors whitespace-nowrap ${
                      currentBgRemoval.enabled && currentBgRemoval.mode === 'pick'
                        ? 'bg-zinc-800 text-amber-300'
                        : 'text-zinc-400 hover:text-zinc-100'
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
                          currentBgRemoval.backdropMode === 'original'
                            ? 'transparent'
                            : currentBgRemoval.backdropMode,
                      });
                      if (
                        bgBrushMode === 'none' ||
                        bgBrushMode === 'pick-keep' ||
                        bgBrushMode === 'pick-remove'
                      ) {
                        onSetBgBrushMode('keep');
                      }
                    }}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer transition-colors whitespace-nowrap ${
                      currentBgRemoval.enabled && currentBgRemoval.mode === 'drawn'
                        ? 'bg-zinc-800 text-amber-300'
                        : 'text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    Draw
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onExtractCutoutToOverlay}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-zinc-100 hover:bg-amber-300 text-zinc-950 font-semibold text-[11px] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>Make Overlay</span>
                  </button>
                  <button
                    type="button"
                    onClick={onAddTextBehindSubject}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-[11px] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Type className="w-3.5 h-3.5 shrink-0" />
                    <span>Text Behind</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-4">
                {/* Auto Subject Detection Target (Person vs Smart vs Object) */}
                {currentBgRemoval.mode === 'auto' && (
                  <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/45 p-2.5">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] font-semibold text-zinc-200">
                        Auto Subject Target
                      </span>
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
                                currentBgRemoval.backdropMode === 'original'
                                  ? 'transparent'
                                  : currentBgRemoval.backdropMode,
                            })
                          }
                          className={`py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                            (currentBgRemoval.autoSubjectType || 'smart') === t.id
                              ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Click-to-Pick Subject (Keep or Remove) */}
                <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/45 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-200">
                      Pick Subject on Canvas
                    </span>
                    {((currentBgRemoval.pickPoints?.length || 0) > 0 ||
                      (currentBgRemoval.strokes?.length || 0) > 0 ||
                      (currentBgRemoval.drawnPolygons?.length || 0) > 0) && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onUndoBgDraw}
                          className="text-[10px] text-zinc-300 hover:text-amber-300 cursor-pointer"
                        >
                          Undo
                        </button>
                        <button
                          type="button"
                          onClick={onClearBgStrokes}
                          className="text-[10px] text-zinc-400 hover:text-red-400 flex items-center gap-0.5 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Clear</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateBgRemoval({
                          enabled: true,
                          mode: currentBgRemoval.mode === 'drawn' ? 'pick' : currentBgRemoval.mode === 'chroma' || currentBgRemoval.mode === 'luma' ? 'pick' : currentBgRemoval.mode,
                          backdropMode:
                            currentBgRemoval.backdropMode === 'original'
                              ? 'transparent'
                              : currentBgRemoval.backdropMode,
                        });
                        onSetBgBrushMode(bgBrushMode === 'pick-keep' ? 'none' : 'pick-keep');
                      }}
                      className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'pick-keep'
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-emerald-500/60'
                      }`}
                    >
                      <MousePointerClick className="w-3 h-3 shrink-0" />
                      <span>Keep Subject +</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateBgRemoval({
                          enabled: true,
                          mode: currentBgRemoval.mode === 'drawn' ? 'pick' : currentBgRemoval.mode === 'chroma' || currentBgRemoval.mode === 'luma' ? 'pick' : currentBgRemoval.mode,
                          backdropMode:
                            currentBgRemoval.backdropMode === 'original'
                              ? 'transparent'
                              : currentBgRemoval.backdropMode,
                        });
                        onSetBgBrushMode(bgBrushMode === 'pick-remove' ? 'none' : 'pick-remove');
                      }}
                      className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'pick-remove'
                          ? 'border-red-400 bg-red-500/20 text-red-300'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-red-500/60'
                      }`}
                    >
                      <MousePointerClick className="w-3 h-3 shrink-0" />
                      <span>Remove Subject -</span>
                    </button>
                  </div>
                </div>

                {/* Draw & Touch-Up Tools */}
                <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/45 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-200">
                      {currentBgRemoval.mode === 'drawn' ? 'Draw Character Tools' : 'Touch-Up Brush'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateBgRemoval({
                          enabled: true,
                          backdropMode:
                            currentBgRemoval.backdropMode === 'original'
                              ? 'transparent'
                              : currentBgRemoval.backdropMode,
                        });
                        onSetBgBrushMode(bgBrushMode === 'keep' ? 'none' : 'keep');
                      }}
                      className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'keep'
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <Paintbrush className="w-3 h-3 shrink-0" />
                      <span>Paint +</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateBgRemoval({
                          enabled: true,
                          mode: currentBgRemoval.mode === 'auto' ? 'drawn' : currentBgRemoval.mode,
                          backdropMode:
                            currentBgRemoval.backdropMode === 'original'
                              ? 'transparent'
                              : currentBgRemoval.backdropMode,
                        });
                        onSetBgBrushMode(bgBrushMode === 'lasso' ? 'none' : 'lasso');
                      }}
                      className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'lasso'
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
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
                            currentBgRemoval.backdropMode === 'original'
                              ? 'transparent'
                              : currentBgRemoval.backdropMode,
                        });
                        onSetBgBrushMode(bgBrushMode === 'erase' ? 'none' : 'erase');
                      }}
                      className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                        bgBrushMode === 'erase'
                          ? 'border-red-400 bg-red-500/20 text-red-300'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <Eraser className="w-3 h-3 shrink-0" />
                      <span>Erase -</span>
                    </button>
                  </div>
                  {(bgBrushMode === 'keep' || bgBrushMode === 'erase') && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>Brush Size</span>
                        <span className="font-mono text-zinc-200">{Math.round(bgBrushSize * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={140}
                        value={Math.round(bgBrushSize * 1000)}
                        onChange={(e) => onSetBgBrushSize(Number(e.target.value) / 1000)}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>

                {/* Quick Backdrop Presets */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-zinc-300">
                    Backdrop Mode
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        {
                          id: 'transparent',
                          label: 'Transparent',
                          desc: 'Checkerboard PNG cutout',
                        },
                        {
                          id: 'blur',
                          label: 'Portrait Blur',
                          desc: 'Soft DSLR backdrop',
                        },
                        {
                          id: 'color',
                          label: 'Solid Studio',
                          desc: 'Clean color backdrop',
                        },
                        {
                          id: 'original',
                          label: 'Keep Scene',
                          desc: 'Text behind subject',
                        },
                      ] as { id: BgBackdropMode; label: string; desc: string }[]
                    ).map((preset) => {
                      const active =
                        currentBgRemoval.enabled && currentBgRemoval.backdropMode === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            onUpdateBgRemoval({
                              enabled: true,
                              backdropMode: preset.id,
                            })
                          }
                          className={`rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                            active
                              ? 'border-amber-500 bg-amber-500/15 text-zinc-50'
                              : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-700'
                          }`}
                        >
                          <div className="text-[11px] font-semibold">{preset.label}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5 leading-tight">
                            {preset.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* All Cutout Key Modes */}
                <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                  <span className="block text-[11px] font-medium text-zinc-300">
                    Cutout Method
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900 rounded-md">
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
                              currentBgRemoval.backdropMode === 'original'
                                ? 'transparent'
                                : currentBgRemoval.backdropMode,
                          });
                          if (m.id === 'drawn' && bgBrushMode === 'none') {
                            onSetBgBrushMode('keep');
                          } else if (
                            m.id === 'pick' &&
                            bgBrushMode !== 'pick-keep' &&
                            bgBrushMode !== 'pick-remove'
                          ) {
                            onSetBgBrushMode('pick-keep');
                          }
                        }}
                        className={`py-1.5 text-[11px] font-medium rounded cursor-pointer transition-colors whitespace-nowrap ${
                          currentBgRemoval.mode === m.id
                            ? 'bg-zinc-800 text-amber-300'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chroma Key Picker */}
                {currentBgRemoval.mode === 'chroma' && (
                  <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
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
                        <span>{bgEyedropperActive ? 'Click Canvas...' : 'Eyedropper'}</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {['#16a34a', '#2563eb', '#f4f4f5', '#09090b', '#38bdf8'].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() =>
                            onUpdateBgRemoval({ enabled: true, chromaColor: hex })
                          }
                          aria-label={`Key color ${hex}`}
                          className={`w-6 h-6 rounded border cursor-pointer ${
                            currentBgRemoval.chromaColor === hex
                              ? 'border-amber-400 scale-105'
                              : 'border-zinc-700'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      <input
                        type="color"
                        value={currentBgRemoval.chromaColor}
                        onChange={(e) =>
                          onUpdateBgRemoval({ enabled: true, chromaColor: e.target.value })
                        }
                        aria-label="Custom key color"
                        className="w-6 h-6 rounded bg-transparent border border-zinc-700 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* Luma Key Target */}
                {currentBgRemoval.mode === 'luma' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'bright', label: 'Remove Bright / Sky' },
                        { id: 'dark', label: 'Remove Dark BG' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onUpdateBgRemoval({ enabled: true, lumaTarget: opt.id })
                        }
                        className={`py-1.5 px-2 text-[11px] rounded border cursor-pointer ${
                          currentBgRemoval.lumaTarget === opt.id
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-medium'
                            : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Edge Controls */}
                <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Threshold / Tolerance</span>
                      <span className="font-mono text-zinc-200">{currentBgRemoval.tolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={currentBgRemoval.tolerance}
                      onChange={(e) =>
                        onUpdateBgRemoval({ enabled: true, tolerance: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Edge Feather</span>
                      <span className="font-mono text-zinc-200">{currentBgRemoval.softness}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={currentBgRemoval.softness}
                      onChange={(e) =>
                        onUpdateBgRemoval({ enabled: true, softness: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Edge Shrink / Expand</span>
                      <span className="font-mono text-zinc-200">{currentBgRemoval.edgeShift}</span>
                    </div>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      value={currentBgRemoval.edgeShift}
                      onChange={(e) =>
                        onUpdateBgRemoval({ enabled: true, edgeShift: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>

                  {(currentBgRemoval.backdropMode === 'color' ||
                    currentBgRemoval.backdropMode === 'gradient') && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-zinc-400">Backdrop Color</span>
                      <div className="flex items-center gap-1">
                        {['#09090b', '#f4f4f5', '#f59e0b', '#0f172a', '#7c2d12'].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => onUpdateBgRemoval({ backdropColor: hex })}
                            className={`w-5 h-5 rounded border cursor-pointer ${
                              currentBgRemoval.backdropColor === hex
                                ? 'border-amber-400 scale-105'
                                : 'border-zinc-700'
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                        <input
                          type="color"
                          value={currentBgRemoval.backdropColor}
                          onChange={(e) => onUpdateBgRemoval({ backdropColor: e.target.value })}
                          className="w-5 h-5 rounded bg-transparent border border-zinc-700 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {currentBgRemoval.backdropMode === 'blur' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">Backdrop Blur</span>
                        <span className="font-mono text-zinc-200">{currentBgRemoval.backdropBlur}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={currentBgRemoval.backdropBlur}
                        onChange={(e) =>
                          onUpdateBgRemoval({ backdropBlur: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentBgRemoval.invert}
                        onChange={(e) => onUpdateBgRemoval({ invert: e.target.checked })}
                        className="accent-amber-500"
                      />
                      <span>Invert Cutout</span>
                    </label>
                    {currentBgRemoval.enabled && (
                      <button
                        type="button"
                        onClick={() => onUpdateBgRemoval({ ...DEFAULT_BG_REMOVAL })}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        Reset Cutout
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'overlays' && (
            <>
              <div className="p-3.5 border-b border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-semibold text-zinc-100">Cinema &amp; PiP Overlays</h2>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Layer glows, frames &amp; images in front or behind subject
                    </p>
                  </div>
                </div>

                {/* Overlay Layer Depth Selector */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900 rounded-md">
                  {(
                    [
                      { id: 'front', label: 'In Front' },
                      { id: 'behind', label: 'Behind Subject' },
                    ] as { id: OverlayLayerOrder; label: string }[]
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setOverlayLayerOrder(pos.id)}
                      className={`py-1 text-[11px] font-medium rounded cursor-pointer transition-colors whitespace-nowrap ${
                        overlayLayerOrder === pos.id
                          ? 'bg-zinc-800 text-amber-300'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => overlayImageInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 hover:border-amber-500 text-xs font-medium text-zinc-200 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>Import PNG / Image Overlay</span>
                </button>
                <input
                  ref={overlayImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      onImportOverlayImages(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
              </div>

              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-4">
                {workspace === 'photo' && photoVisualOverlays.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-amber-300">
                        Active on Photo ({photoVisualOverlays.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {photoVisualOverlays.map((ov) => (
                        <div
                          key={ov.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-100 truncate">{ov.name}</p>
                            <p className="text-[10px] font-mono text-zinc-400">
                              {ov.blendMode} · {Math.round(ov.opacity * 100)}%
                              {ov.bgRemoval?.enabled ? ' · Cutout' : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {ov.kind === 'image' && onTogglePhotoVisualOverlayBg && (
                              <button
                                type="button"
                                onClick={() => onTogglePhotoVisualOverlayBg(ov.id)}
                                title={
                                  ov.bgRemoval?.enabled
                                    ? 'Disable overlay BG removal'
                                    : 'Remove overlay background'
                                }
                                className={`p-1 rounded cursor-pointer ${
                                  ov.bgRemoval?.enabled
                                    ? 'text-emerald-300 bg-emerald-500/20'
                                    : 'text-zinc-400 hover:text-amber-300'
                                }`}
                              >
                                <Scissors className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onRemovePhotoVisualOverlay(ov.id)}
                              aria-label={`Remove ${ov.name}`}
                              className="p-1 text-zinc-400 hover:text-red-400 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <span className="block text-[11px] font-medium text-zinc-300">
                    Light Leaks, Textures &amp; Frames
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                      {VISUAL_OVERLAY_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onAddVisualOverlay(preset.id, overlayLayerOrder)}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-amber-500 overflow-hidden text-left transition-colors cursor-pointer group"
                      >
                        <div
                          className="h-11 w-full bg-zinc-950 border-b border-zinc-800/80 relative"
                          style={{ backgroundImage: preset.previewCss }}
                        >
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-zinc-950/80 text-[9px] font-mono text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity">
                            + Add
                          </span>
                        </div>
                        <div className="p-2">
                          <div className="text-[11px] font-semibold text-zinc-100 truncate">
                            {preset.name}
                          </div>
                          <div className="text-[10px] text-zinc-500 leading-snug line-clamp-2 mt-0.5">
                            {preset.desc}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {assets.some((a) => a.kind === 'video') && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                    <span className="block text-[11px] font-medium text-zinc-300">
                      Add Video as PiP Overlay
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {assets
                        .filter((a) => a.kind === 'video')
                        .slice(0, 6)
                        .map((vid) => (
                          <button
                            key={`pip-vid-${vid.id}`}
                            type="button"
                            onClick={() => onAddVideoOverlay(vid, overlayLayerOrder)}
                            className="rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-amber-500 overflow-hidden text-left transition-colors cursor-pointer"
                          >
                            <div className="aspect-video bg-zinc-950 overflow-hidden relative">
                              <video
                                src={vid.src}
                                muted
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-cover opacity-85"
                              />
                              <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-zinc-950/80 text-[9px] font-mono text-amber-300">
                                VID
                              </span>
                            </div>
                            <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                              <span className="text-[10px] font-medium text-zinc-200 truncate">
                                {vid.name}
                              </span>
                              <Plus className="w-3 h-3 text-amber-400 shrink-0" />
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {assets.some((a) => a.kind === 'photo') && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                    <span className="block text-[11px] font-medium text-zinc-300">
                      Layer Photo / Cutout as Overlay
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {assets
                        .filter((a) => a.kind === 'photo')
                        .slice(0, 8)
                        .map((photo) => (
                          <button
                            key={`pip-${photo.id}`}
                            type="button"
                            onClick={() => onAddImageOverlay(photo, overlayLayerOrder)}
                            className="rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-amber-500 overflow-hidden text-left transition-colors cursor-pointer"
                          >
                            <div
                              className="aspect-video bg-zinc-950 overflow-hidden"
                              style={
                                photo.isCutoutOverlay
                                  ? {
                                      backgroundImage:
                                        'linear-gradient(45deg, #1f1f24 25%, transparent 25%), linear-gradient(-45deg, #1f1f24 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f1f24 75%), linear-gradient(-45deg, transparent 75%, #1f1f24 75%)',
                                      backgroundSize: '12px 12px',
                                    }
                                  : undefined
                              }
                            >
                              <img
                                src={photo.src}
                                alt={photo.name}
                                referrerPolicy="no-referrer"
                                className={`w-full h-full ${
                                  photo.isCutoutOverlay ? 'object-contain' : 'object-cover'
                                } opacity-90`}
                              />
                            </div>
                            <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                              <span className="text-[10px] font-medium text-zinc-200 truncate">
                                {photo.name}
                              </span>
                              <Plus className="w-3 h-3 text-amber-400 shrink-0" />
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'audio' && (
            <>
              <div className="p-3.5 border-b border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-100">Audio & Sound FX</h2>
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    className="text-[11px] font-medium text-amber-400 hover:text-amber-300 cursor-pointer whitespace-nowrap"
                  >
                    + Import MP3/WAV
                  </button>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        onImportAudioFiles(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 rounded-md">
                  {(['all', 'music', 'sfx'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setAudioFilter(tab)}
                      className={`py-1 text-[11px] font-medium rounded capitalize cursor-pointer ${
                        audioFilter === tab
                          ? 'bg-zinc-800 text-zinc-50'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tab === 'sfx' ? 'SFX' : tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-2">
                {filteredAudio.map((audio) => {
                  const playingPreview = previewAudioId === audio.id;
                  return (
                    <div
                      key={audio.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => togglePreviewAudio(audio)}
                          aria-label={playingPreview ? 'Stop preview' : 'Preview audio'}
                          className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          {playingPreview ? (
                            <Pause className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-zinc-100 truncate">{audio.name}</p>
                          <p className="text-[10px] font-mono text-zinc-500 tabular-nums">
                            {audio.category.toUpperCase()} · {audio.duration.toFixed(1)}s
                            {audio.bpm ? ` · ${audio.bpm} BPM` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onAddAudioClip(audio.id)}
                          title="Add to Audio Track"
                          className="p-1.5 rounded bg-zinc-800 text-zinc-200 hover:bg-emerald-500 hover:text-zinc-950 transition-colors cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="h-5 flex items-end gap-[2px] px-0.5">
                        {audio.peaks.slice(0, 32).map((p, idx) => (
                          <div
                            key={idx}
                            style={{ height: `${Math.round(p * 100)}%` }}
                            className="flex-1 bg-emerald-500/45 rounded-[1px]"
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'text' && (
            <>
              <div className="p-3.5 border-b border-zinc-800 space-y-2.5">
                <div>
                  <h2 className="text-xs font-semibold text-zinc-100">Text &amp; 3D-Style Titles</h2>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Editable 2D typography with 3D extrusion, chrome, glass, glow &amp; layers
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onAddTextBehindSubject}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>+ Text Behind Character</span>
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-950/15 font-mono text-[10px]">
                    B
                  </kbd>
                </button>

                <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900 rounded-md">
                  {(
                    [
                      { id: 'front', label: 'In Front' },
                      { id: 'behind', label: 'Behind Subject' },
                    ] as { id: OverlayLayerOrder; label: string }[]
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setTextLayerOrder(pos.id)}
                      className={`py-1.5 text-[11px] font-medium rounded cursor-pointer transition-colors whitespace-nowrap ${
                        textLayerOrder === pos.id
                          ? 'bg-zinc-800 text-amber-300'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>

                {textLayerOrder === 'behind' && !currentBgRemoval.enabled && (
                  <p className="text-[10px] text-amber-300/90 leading-snug">
                    BG Removal will turn on automatically so text sits behind your subject.
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-2.5">
                {TEXT_STYLE_TEMPLATES.map((tpl) => {
                  const cssFam =
                    FONT_OPTIONS.find((f) => f.id === tpl.fontFamily)?.cssFamily || 'sans-serif';
                  const previewStyle: React.CSSProperties = { fontFamily: cssFam };
                  if (tpl.id === 'cinema-3d') {
                    previewStyle.textShadow =
                      '1px 1px 0 #d97706, 2px 2px 0 #b45309, 3px 3px 0 #92400e, 4px 4px 7px rgba(0,0,0,0.85)';
                  } else if (tpl.id === 'anime-impact') {
                    previewStyle.color = '#fef08a';
                    previewStyle.textShadow =
                      '2px 2px 0 #dc2626, 4px 4px 0 #09090b, -2px -2px 0 #38bdf8';
                    previewStyle.transform = 'skewX(-10deg)';
                  } else if (tpl.id === 'chrome-metal') {
                    previewStyle.backgroundImage =
                      'linear-gradient(180deg, #ffffff 0%, #cbd5e1 44%, #334155 52%, #f8fafc 100%)';
                    previewStyle.WebkitBackgroundClip = 'text';
                    previewStyle.WebkitTextFillColor = 'transparent';
                  } else if (tpl.id === 'glass-gloss') {
                    previewStyle.color = '#e0f2fe';
                    previewStyle.textShadow = '0 0 10px rgba(125,211,252,0.75)';
                    previewStyle.WebkitTextStroke = '0.8px rgba(255,255,255,0.85)';
                  } else if (tpl.id === 'neon-cyber') {
                    previewStyle.color = '#f0f9ff';
                    previewStyle.textShadow =
                      '0 0 6px #38bdf8, 0 0 14px #38bdf8, 2px 2px 0 #0369a1';
                  } else if (tpl.id === 'triple-layer') {
                    previewStyle.color = '#ffffff';
                    previewStyle.textShadow = '3px 3px 0 #f59e0b, 6px 6px 0 #38bdf8';
                  } else if (tpl.id === 'gold-emboss') {
                    previewStyle.backgroundImage =
                      'linear-gradient(180deg, #fffbeb 0%, #fde68a 40%, #b45309 65%, #fef3c7 100%)';
                    previewStyle.WebkitBackgroundClip = 'text';
                    previewStyle.WebkitTextFillColor = 'transparent';
                  } else if (tpl.id === 'gradient-punch') {
                    previewStyle.backgroundImage = 'linear-gradient(165deg, #ffffff 0%, #f97316 100%)';
                    previewStyle.WebkitBackgroundClip = 'text';
                    previewStyle.WebkitTextFillColor = 'transparent';
                  }

                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => onAddTextTemplate(tpl.id, textLayerOrder)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-amber-500 p-3 text-left transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="h-11 rounded bg-zinc-950 border border-zinc-800/80 flex items-center justify-center px-2 overflow-hidden">
                        <span
                          style={previewStyle}
                          className={`truncate text-base ${
                            tpl.id === 'amber-tag'
                              ? 'bg-amber-500 text-zinc-950 px-2.5 py-0.5 rounded font-bold text-sm'
                              : tpl.id === 'lower-third'
                                ? 'bg-zinc-900 text-zinc-100 px-2.5 py-0.5 rounded border border-zinc-700 text-xs'
                                : tpl.id === 'cinema-sub'
                                  ? 'text-amber-200 italic'
                                  : 'text-zinc-50 font-bold tracking-wider'
                          }`}
                        >
                          {tpl.preview}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-200">{tpl.name}</span>
                        <span className="text-[11px] text-amber-400">+ Add</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'masks' && (
            <>
              <div className="p-3.5 border-b border-zinc-800">
                <h2 className="text-xs font-semibold text-zinc-100">Masks & Cutout Overlays</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Shape masks on clips/photos or animated matte overlays
                </p>
              </div>
              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-5">
                {!isAuthenticated && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] text-amber-200 leading-tight">
                        Log in to unlock Shape Masks & Overlays
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onRequireAuth('Sign in or create an account to use Shape Masks & Matte Overlays.')
                      }
                      className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-400 text-zinc-950 hover:bg-amber-300 shrink-0 cursor-pointer"
                    >
                      Log In
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-300">
                      {workspace === 'timeline' ? 'Selected Clip Mask' : 'Photo Shape Mask'}
                    </span>
                    {currentMaskShape !== 'none' && isAuthenticated && (
                      <button
                        type="button"
                        onClick={() => onApplyShapeMask('none')}
                        className="text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer"
                      >
                        Clear Mask
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MASK_SHAPE_OPTIONS.filter((m) => m.id !== 'none').map((m) => {
                      const active = currentMaskShape === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            if (!isAuthenticated) {
                              onRequireAuth(`Sign in or create an account to apply the ${m.label} Shape Mask.`);
                              return;
                            }
                            onApplyShapeMask(active ? 'none' : m.id);
                          }}
                          className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                            active
                              ? 'border-amber-500 bg-amber-500/15 text-zinc-50'
                              : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold">{m.label}</span>
                            {!isAuthenticated && <Lock className="w-3 h-3 text-amber-400/80 shrink-0" />}
                          </div>
                          <div className="text-[10px] text-zinc-500 leading-snug mt-0.5">
                            {m.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {workspace === 'timeline' && (
                  <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-zinc-300">
                        Mask Overlays (Track T1)
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">Keyframed</span>
                    </div>
                    <div className="space-y-2">
                      {MASK_OVERLAY_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            if (!isAuthenticated) {
                              onRequireAuth(`Sign in or create an account to add the ${preset.name} Mask Overlay.`);
                              return;
                            }
                            onAddMaskOverlay(preset.id);
                          }}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-amber-500 p-2.5 text-left transition-colors cursor-pointer flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-100">{preset.name}</div>
                            <div className="text-[10px] text-zinc-500 leading-snug mt-0.5">
                              {preset.desc}
                            </div>
                          </div>
                          {!isAuthenticated ? (
                            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <span className="text-[11px] text-amber-400 shrink-0">+ Add</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'stickers' && (
            <>
              <div className="p-3.5 border-b border-zinc-800">
                <h2 className="text-xs font-semibold text-zinc-100">Graphic Overlays</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Vector HUDs & camera marks for Track T1
                </p>
              </div>
              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-3">
                {!isAuthenticated && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] text-amber-200 leading-tight">
                        Log in to unlock Stickers & HUD Overlays
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onRequireAuth('Sign in or create an account to add Graphic Stickers & HUD Overlays.')
                      }
                      className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-400 text-zinc-950 hover:bg-amber-300 shrink-0 cursor-pointer"
                    >
                      Log In
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 content-start">
                  {STICKER_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        if (!isAuthenticated) {
                          onRequireAuth(`Sign in or create an account to add the ${st.label} graphic overlay.`);
                          return;
                        }
                        onAddSticker(st.id);
                      }}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-amber-500 p-2.5 text-left transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-zinc-100">{st.label}</span>
                        {!isAuthenticated && <Lock className="w-3 h-3 text-amber-400/80 shrink-0" />}
                      </div>
                      <div className="text-[10px] text-zinc-500 leading-snug">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'effects' && (
            <>
              <div className="p-3.5 border-b border-zinc-800">
                <h2 className="text-xs font-semibold text-zinc-100">Quick Visual FX</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  One-click optical & action toggles
                </p>
              </div>
              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-2">
                {!isAuthenticated && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] text-amber-200 leading-tight">
                        Log in to apply Visual Effects
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onRequireAuth(
                          'Sign in or create a free account to apply Visual Effects like Camera Shake, Chromatic Split, Halation, and 35mm Grain.'
                        )
                      }
                      className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-400 text-zinc-950 hover:bg-amber-300 shrink-0 cursor-pointer"
                    >
                      Log In
                    </button>
                  </div>
                )}
                {[
                  ...(workspace === 'timeline'
                    ? [
                        {
                          label: 'Camera Shake',
                          desc: 'High-energy handheld impact',
                          active: currentEffects.shake > 0,
                          onClick: () =>
                            onToggleVisualEffect({ shake: currentEffects.shake > 0 ? 0 : 45 }),
                        },
                        {
                          label: 'Flash Cut In',
                          desc: 'Bright white strobe on entry',
                          active: currentEffects.flashIn,
                          onClick: () =>
                            onToggleVisualEffect({ flashIn: !currentEffects.flashIn }),
                        },
                      ]
                    : []),
                  {
                    label: 'Chromatic RGB Split',
                    desc: 'Prismatic edge dispersion',
                    active: currentEffects.chromatic > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        chromatic: currentEffects.chromatic > 0 ? 0 : 48,
                      }),
                  },
                  {
                    label: 'Halation Bloom',
                    desc: 'Warm cinema highlight glow',
                    active: currentEffects.halation > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        halation: currentEffects.halation > 0 ? 0 : 52,
                      }),
                  },
                  {
                    label: 'VHS Scanlines',
                    desc: 'Retro CRT horizontal scan',
                    active: currentEffects.scanlines > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        scanlines: currentEffects.scanlines > 0 ? 0 : 55,
                      }),
                  },
                  {
                    label: '2.39:1 Letterbox Bars',
                    desc: 'Widescreen cinema matte',
                    active: currentEffects.letterbox,
                    onClick: () =>
                      onToggleVisualEffect({ letterbox: !currentEffects.letterbox }),
                  },
                  {
                    label: '35mm Film Grain',
                    desc: 'Organic halide texture',
                    active: currentEffects.grain > 0,
                    onClick: () =>
                      onToggleVisualEffect({ grain: currentEffects.grain > 0 ? 0 : 28 }),
                  },
                  {
                    label: 'Deep Glow (AE)',
                    desc: 'High-threshold optical bloom',
                    active: (currentEffects.glowBloom ?? 0) > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        glowBloom: (currentEffects.glowBloom ?? 0) > 0 ? 0 : 62,
                      }),
                  },
                  {
                    label: 'CC Radial Zoom Blur',
                    desc: 'AE radial punch focus streaks',
                    active: (currentEffects.radialBlur ?? 0) > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        radialBlur: (currentEffects.radialBlur ?? 0) > 0 ? 0 : 48,
                      }),
                  },
                  {
                    label: 'Directional Motion Blur',
                    desc: 'Fast whip-pan directional blur',
                    active: (currentEffects.motionBlur ?? 0) > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        motionBlur: (currentEffects.motionBlur ?? 0) > 0 ? 0 : 52,
                      }),
                  },
                  {
                    label: 'Digital Slice Glitch',
                    desc: 'Horizontal RGB block displacement',
                    active: (currentEffects.glitch ?? 0) > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        glitch: (currentEffects.glitch ?? 0) > 0 ? 0 : 55,
                      }),
                  },
                  {
                    label: 'Mirror / Quad Kaleid',
                    desc: 'Cycles Off → Half Mirror → Quad Tile',
                    active: (currentEffects.mirrorTile || 'none') !== 'none',
                    statusText:
                      currentEffects.mirrorTile === 'quad'
                        ? 'QUAD'
                        : currentEffects.mirrorTile === 'mirror-h'
                          ? 'MIRROR'
                          : 'OFF',
                    onClick: () =>
                      onToggleVisualEffect({
                        mirrorTile:
                          currentEffects.mirrorTile === 'quad'
                            ? 'none'
                            : currentEffects.mirrorTile === 'mirror-h'
                              ? 'quad'
                              : 'mirror-h',
                      }),
                  },
                  {
                    label: 'Mosaic Pixelate',
                    desc: 'Crisp block pixel grid FX',
                    active: (currentEffects.pixelate ?? 0) > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        pixelate: (currentEffects.pixelate ?? 0) > 0 ? 0 : 42,
                      }),
                  },
                  {
                    label: 'Posterize',
                    desc: 'Stylized tonal color banding',
                    active: (currentEffects.posterize ?? 0) > 0,
                    onClick: () =>
                      onToggleVisualEffect({
                        posterize: (currentEffects.posterize ?? 0) > 0 ? 0 : 65,
                      }),
                  },
                  {
                    label: 'Cyber Neon Duotone',
                    desc: 'AE Tritone violet/cyan gradient map',
                    active: currentEffects.duotone === 'cyber',
                    onClick: () =>
                      onToggleVisualEffect({
                        duotone: currentEffects.duotone === 'cyber' ? 'none' : 'cyber',
                      }),
                  },
                ].map((fx) => (
                  <button
                    key={fx.label}
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) {
                        onRequireAuth(`Sign in or create an account to use the ${fx.label} effect.`);
                        return;
                      }
                      fx.onClick();
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      fx.active
                        ? 'border-amber-500 bg-amber-500/10 text-zinc-50'
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{fx.label}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{fx.desc}</div>
                    </div>
                    {!isAuthenticated ? (
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <span className="text-[11px] font-mono text-amber-400 shrink-0">
                        {'statusText' in fx && fx.statusText ? fx.statusText : fx.active ? 'ON' : 'OFF'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
};
