import React, { useState } from 'react';
import {
  ArrowRight,
  Clock,
  Cloud,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LogIn,
  Plus,
  Scissors,
  Sliders,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { User } from '../lib/firebase';
import { SavedProjectRecord } from '../lib/projectsService';
import { AspectRatioId, MediaAsset } from '../types/editor';
import { formatDurationShort } from '../utils/timecode';

interface StartScreenProps {
  assets: MediaAsset[];
  user: User | null;
  studioUsername?: string;
  authLoading: boolean;
  savedProjects: SavedProjectRecord[];
  onStartEmptyTimeline: (aspect: AspectRatioId) => void;
  onAddClipAndOpenTimeline: (assetId: string, aspect: AspectRatioId) => void;
  onStartPhoto: (assetId: string) => void;
  onImportVideo: (aspect: AspectRatioId) => void;
  onImportPhoto: () => void;
  onOpenSavedProject: (project: SavedProjectRecord) => void;
  onDeleteSavedProject: (projectId: string) => void;
  onOpenAuth: (tab?: 'login' | 'signup') => void;
}

const CANVAS_RATIO_CHOICES: { id: AspectRatioId; label: string; sub: string }[] = [
  { id: '16:9', label: '16:9', sub: 'Widescreen' },
  { id: '9:16', label: '9:16', sub: 'Vertical' },
  { id: '1:1', label: '1:1', sub: 'Square' },
  { id: '4:5', label: '4:5', sub: 'Portrait' },
  { id: '2.39:1', label: '2.39:1', sub: 'Cinema' },
];

function formatSavedTime(ms: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export const StartScreen: React.FC<StartScreenProps> = ({
  assets,
  user,
  studioUsername,
  authLoading,
  savedProjects,
  onStartEmptyTimeline,
  onAddClipAndOpenTimeline,
  onStartPhoto,
  onImportVideo,
  onImportPhoto,
  onOpenSavedProject,
  onDeleteSavedProject,
  onOpenAuth,
}) => {
  const [chosenAspect, setChosenAspect] = useState<AspectRatioId>('16:9');
  const userAssets = assets.filter((a) => !a.isSample);
  const samplePhotos = assets.filter((a) => a.isSample && a.kind === 'photo').slice(0, 4);

  return (
    <div className="flex-1 overflow-y-auto studio-scroll bg-[#08080a] px-4 sm:px-6 py-6 sm:py-10">
      <div className="max-w-6xl mx-auto space-y-8 sm:space-y-10">
        {/* Clean Editorial Studio Header */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-5 sm:gap-6 border-b border-zinc-800/80 pb-6 sm:pb-8">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
              <span>KinoFrame Studio</span>
              <span aria-hidden="true">·</span>
              <span className="text-zinc-500">Video Timeline & Photo Grading</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-zinc-50 text-balance">
              Cut clips, sculpt masks, grade color, and export cleanly.
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Start with your own clips or photos, shape every mask, keyframe, and effect yourself, and choose your exact export scope and format.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onImportVideo(chosenAspect)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-md bg-zinc-50 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start md:self-auto"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Clips or Photos</span>
          </button>
        </section>

        {/* Dual Workspace Cards */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Video Editor Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-50">Video Editor</h2>
                  <p className="text-xs text-zinc-500 font-mono">
                    Multi-Track Timeline · Shape Masks · Keyframes · Audio
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-medium text-zinc-300">
                  Canvas Aspect Ratio
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {CANVAS_RATIO_CHOICES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setChosenAspect(r.id)}
                      className={`rounded-lg border py-2 px-1.5 text-center transition-colors cursor-pointer ${
                        chosenAspect === r.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="text-xs font-mono font-semibold">{r.label}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{r.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onImportVideo(chosenAspect)}
                  className="rounded-lg border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15 p-3.5 text-left transition-colors cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                    <span className="flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      Import Your Clips
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-[11px] text-zinc-300">
                    Load MP4, MOV, WebM videos or photos from your device.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onStartEmptyTimeline(chosenAspect)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 p-3.5 text-left transition-colors cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-100">
                    <span className="flex items-center gap-1.5">
                      <Scissors className="w-3.5 h-3.5 text-zinc-400" />
                      Empty Timeline ({chosenAspect})
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Open a blank studio timeline ready for your cuts.
                  </p>
                </button>
              </div>

              {userAssets.length > 0 && (
                <div className="space-y-2">
                  <span className="block text-xs font-medium text-zinc-300">
                    Clips & Photos You Have ({userAssets.length})
                  </span>
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto studio-scroll pr-1">
                    {userAssets.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onAddClipAndOpenTimeline(item.id, chosenAspect)}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/70 hover:border-amber-500 text-left cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-100 truncate">{item.name}</p>
                          <p className="text-[10px] font-mono text-zinc-500">
                            {item.kind === 'video'
                              ? `Video · ${formatDurationShort(item.duration)}`
                              : `Photo · ${item.width}×${item.height}`}
                          </p>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500 font-mono">
              <span>Full Timeline · Selected Clip · Frame Still Export</span>
            </div>
          </div>

          {/* Photo Lab Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-50">Photo Grading Lab</h2>
                    <p className="text-xs text-zinc-500 font-mono">
                      RGB Histogram · Masks · LUTs · Typography
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onImportPhoto}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-zinc-100 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Photo</span>
                </button>
              </div>

              <div className="space-y-2 pt-1">
                <span className="block text-[11px] font-mono text-zinc-500">
                  Optional Sample Frames (or upload your own above)
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  {samplePhotos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => onStartPhoto(photo.id)}
                      className="group relative aspect-16/10 rounded-lg border border-zinc-800 hover:border-amber-500 overflow-hidden bg-zinc-900 text-left cursor-pointer transition-colors"
                    >
                      <img
                        src={photo.src}
                        alt={photo.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
                        <p className="text-xs font-semibold text-zinc-50 truncate">{photo.name}</p>
                        <p className="text-[10px] font-mono text-zinc-300 truncate">
                          {photo.width}×{photo.height}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-4">
              <span className="text-xs text-zinc-500 font-mono">PNG · JPEG · WebP Export</span>
              <button
                type="button"
                onClick={() =>
                  onStartPhoto(
                    userAssets.find((a) => a.kind === 'photo')?.id ||
                      samplePhotos[0]?.id ||
                      'sample-tokyo'
                  )
                }
                className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer whitespace-nowrap"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Open Photo Lab</span>
              </button>
            </div>
          </div>
        </section>

        {/* Saved Cloud Projects Section */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 text-amber-400 flex items-center justify-center shrink-0">
                <FolderOpen className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-zinc-50">Saved Projects</h2>
                <p className="text-xs text-zinc-400">
                  {user
                    ? user.emailVerified
                      ? studioUsername
                        ? `Synced as @${studioUsername} (${user.email})`
                        : `Synced to ${user.email}`
                      : `Verify ${user.email} to activate cloud project saving.`
                    : 'Sign in or create an account to save timelines, masks, keyframes, and photo grades.'}
                </p>
              </div>
            </div>

            {!authLoading && !user ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-amber-500 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log In</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('signup')}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-zinc-50 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Sign Up</span>
                </button>
              </div>
            ) : !authLoading && user && !user.emailVerified ? (
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="px-3.5 py-2 text-xs font-semibold rounded-md bg-amber-400 text-zinc-950 hover:bg-amber-300 transition-colors cursor-pointer shrink-0"
              >
                Verify Email
              </button>
            ) : null}
          </div>

          {authLoading ? (
            <div className="py-6 text-xs text-zinc-500 font-mono">
              Checking studio account session...
            </div>
          ) : !user ? (
            <div className="flex items-center gap-2.5 py-2 text-xs text-zinc-400">
              <Cloud className="w-4 h-4 text-zinc-500 shrink-0" />
              <span>
                Your saved sequences, masks, keyframed overlays, and custom LUT grades will appear here once signed in.
              </span>
            </div>
          ) : !user.emailVerified ? (
            <div className="flex items-center gap-2.5 py-2 text-xs text-amber-300">
              <Cloud className="w-4 h-4 shrink-0" />
              <span>
                Click the verification link sent to {user.email}, then open your account menu to refresh and activate cloud saves.
              </span>
            </div>
          ) : savedProjects.length === 0 ? (
            <div className="py-4 text-xs text-zinc-400">
              No saved projects yet. Open Video Editor or Photo Editor and click Save to store your work.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedProjects.map((project) => {
                const thumb =
                  assets.find((a) => a.id === project.previewAssetId) ||
                  assets.find((a) => a.kind === 'photo') ||
                  assets[0];
                return (
                  <div
                    key={project.id}
                    className="group rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 overflow-hidden flex flex-col justify-between transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenSavedProject(project)}
                      className="text-left cursor-pointer block"
                    >
                      <div className="relative aspect-16/9 bg-zinc-950 overflow-hidden">
                        {thumb && (
                          <img
                            src={thumb.src}
                            alt={project.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-200"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                          <span className="text-xs font-semibold text-zinc-50 truncate">
                            {project.name}
                          </span>
                          <span className="text-[10px] font-mono text-amber-400 shrink-0">
                            {project.mode === 'timeline' ? project.sequenceAspect : 'PHOTO'}
                          </span>
                        </div>
                      </div>
                    </button>

                    <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-t border-zinc-800/80">
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono text-zinc-400 truncate">
                          {project.mode === 'timeline'
                            ? `${project.clipCount} clips · ${formatDurationShort(project.totalDuration)}`
                            : 'Photo Grading Lab'}
                        </p>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{formatSavedTime(project.updatedAtMs)}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenSavedProject(project)}
                          className="px-2.5 py-1 text-[11px] font-medium rounded bg-zinc-800 text-zinc-100 hover:bg-amber-500 hover:text-zinc-950 transition-colors cursor-pointer"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSavedProject(project.id)}
                          title="Delete saved project"
                          aria-label={`Delete ${project.name}`}
                          className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
