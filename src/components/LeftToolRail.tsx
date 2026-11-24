import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Film,
  Image as ImageIcon,
  Layers,
  Lock,
  Music,
  Pause,
  Play,
  Plus,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import {
  FONT_OPTIONS,
  MASK_OVERLAY_PRESETS,
  MASK_SHAPE_OPTIONS,
  STICKER_OPTIONS,
  TEXT_STYLE_TEMPLATES,
} from '../data/presets';
import {
  AudioAsset,
  EffectsSettings,
  LeftDrawerTab,
  MaskOverlayPresetId,
  MaskShape,
  MediaAsset,
  StickerKind,
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
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onChangeTab: (tab: LeftDrawerTab) => void;
  onToggleDrawer: () => void;
  onRequireAuth: (reason: string) => void;
  onSelectAsset: (assetId: string) => void;
  onAddToTimeline: (assetId: string) => void;
  onImportFiles: (files: FileList) => void;
  onRemoveAsset: (assetId: string) => void;
  onAddAudioClip: (audioAssetId: string) => void;
  onImportAudioFiles: (files: FileList) => void;
  onAddTextTemplate: (
    templateId: 'clean' | 'bold-kinetic' | 'cinema-sub' | 'lower-third' | 'amber-tag'
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
  fileInputRef,
  onChangeTab,
  onToggleDrawer,
  onRequireAuth,
  onSelectAsset,
  onAddToTimeline,
  onImportFiles,
  onRemoveAsset,
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
  const [dragOver, setDragOver] = useState(false);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const [previewAudioId, setPreviewAudioId] = useState<string | null>(null);
  const previewAudioElRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        onImportFiles(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />
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
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-100 truncate">{asset.name}</p>
                            <p className="text-[10px] font-mono text-zinc-500 tabular-nums truncate">
                              {asset.kind === 'video'
                                ? `Clip · ${formatDurationShort(asset.duration)}`
                                : `Photo · ${asset.width}×${asset.height}`}
                            </p>
                          </div>
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
              <div className="p-3.5 border-b border-zinc-800">
                <h2 className="text-xs font-semibold text-zinc-100">Text & Fonts</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Click any style to add to canvas
                </p>
              </div>
              <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-2.5">
                {TEXT_STYLE_TEMPLATES.map((tpl) => {
                  const cssFam =
                    FONT_OPTIONS.find((f) => f.id === tpl.fontFamily)?.cssFamily || 'sans-serif';
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => onAddTextTemplate(tpl.id)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-amber-500 p-3 text-left transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="h-11 rounded bg-zinc-950 border border-zinc-800/80 flex items-center justify-center px-2 overflow-hidden">
                        <span
                          style={{ fontFamily: cssFam }}
                          className={`truncate text-base ${
                            tpl.id === 'amber-tag'
                              ? 'bg-amber-500 text-zinc-950 px-2.5 py-0.5 rounded font-bold text-sm'
                              : tpl.id === 'lower-third'
                                ? 'bg-zinc-900 text-zinc-100 px-2.5 py-0.5 rounded border border-zinc-700 text-xs'
                                : tpl.id === 'cinema-sub'
                                  ? 'text-amber-200 italic'
                                  : 'text-zinc-50 font-bold'
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
                        {fx.active ? 'ON' : 'OFF'}
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
