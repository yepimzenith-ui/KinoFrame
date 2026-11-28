import React from 'react';
import {
  ArrowRight,
  Clock,
  Cloud,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LogIn,
  Plus,
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
  chosenAspect: AspectRatioId;
  onNewVideoProject: (aspect: AspectRatioId) => void;
  onOpenPhotoLab: () => void;
  onAddClipAndOpenTimeline: (assetId: string, aspect: AspectRatioId) => void;
  onStartPhoto: (assetId: string) => void;
  onImportMedia: () => void;
  onOpenSavedProject: (project: SavedProjectRecord) => void;
  onDeleteSavedProject: (projectId: string) => void;
  onOpenAuth: (tab?: 'login' | 'signup') => void;
}

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
  chosenAspect,
  onNewVideoProject,
  onOpenPhotoLab,
  onAddClipAndOpenTimeline,
  onStartPhoto,
  onImportMedia,
  onOpenSavedProject,
  onDeleteSavedProject,
  onOpenAuth,
}) => {
  const userAssets = assets.filter((a) => !a.isSample);

  return (
    <div className="flex-1 overflow-y-auto studio-scroll bg-[#08080a] px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-5xl mx-auto space-y-8 sm:space-y-10">
        {/* Clean Home Header */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-zinc-800/80 pb-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
              <span>KinoFrame Studio</span>
              <span aria-hidden="true">·</span>
              <span className="text-zinc-500">Video Timeline, Overlays &amp; Photo Lab</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50 text-balance">
              Cut clips, layer cinema overlays, and grade photos.
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNewVideoProject(chosenAspect)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-md bg-amber-400 text-zinc-950 hover:bg-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Film className="w-3.5 h-3.5" />
              <span>New Video Project</span>
            </button>
            <button
              type="button"
              onClick={onOpenPhotoLab}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-amber-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Photo Lab</span>
            </button>
            <button
              type="button"
              onClick={onImportMedia}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-md bg-zinc-50 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Media</span>
            </button>
          </div>
        </section>

        {/* Your Media Library */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-800/80 pb-3.5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-50">Your Clips &amp; Photos</h2>
              <p className="text-xs text-zinc-500">
                {userAssets.length > 0
                  ? `${userAssets.length} local file${userAssets.length === 1 ? '' : 's'} ready to edit.`
                  : 'Upload your own video clips or photos from your device.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onImportMedia}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-700 bg-zinc-900 hover:border-amber-500 text-xs font-medium text-zinc-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Files</span>
            </button>
          </div>

          {userAssets.length === 0 ? (
            <div className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-400">
              <span>No device clips imported yet. Start a Video Project, open Photo Lab, or import clips to begin.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {userAssets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    item.kind === 'video'
                      ? onAddClipAndOpenTimeline(item.id, chosenAspect)
                      : onStartPhoto(item.id)
                  }
                  className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-amber-500 text-left cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-100 truncate">{item.name}</p>
                    <p className="text-[11px] font-mono text-zinc-500">
                      {item.kind === 'video'
                        ? `Video · ${formatDurationShort(item.duration)}`
                        : `Photo · ${item.width}×${item.height}`}
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Saved Cloud Projects Section */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 space-y-5">
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
            <div className="py-4 text-xs text-zinc-500 font-mono">
              Checking studio account session...
            </div>
          ) : !user ? (
            <div className="flex items-center gap-2.5 py-1 text-xs text-zinc-400">
              <Cloud className="w-4 h-4 text-zinc-500 shrink-0" />
              <span>
                Your saved sequences, masks, keyframed overlays, and custom LUT grades will appear here once signed in.
              </span>
            </div>
          ) : !user.emailVerified ? (
            <div className="flex items-center gap-2.5 py-1 text-xs text-amber-300">
              <Cloud className="w-4 h-4 shrink-0" />
              <span>
                Click the verification link sent to {user.email}, then open your account menu to refresh and activate cloud saves.
              </span>
            </div>
          ) : savedProjects.length === 0 ? (
            <div className="py-3 text-xs text-zinc-400">
              No saved projects yet. Open Video Editor or Photo Editor from the menu and click Save to store your work.
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
