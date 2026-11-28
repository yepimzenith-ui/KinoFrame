import React, { useState } from 'react';
import {
  Blend,
  ChevronDown,
  ChevronRight,
  Film,
  FolderOpen,
  Home,
  Image as ImageIcon,
  Layers,
  Plus,
  Scissors,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { User } from '../lib/firebase';
import { AspectRatioId, WorkspaceMode } from '../types/editor';

interface StudioMenuProps {
  workspace: WorkspaceMode;
  user: User | null;
  studioUsername?: string;
  chosenAspect: AspectRatioId;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectAspect: (aspect: AspectRatioId) => void;
  onSelectWorkspace: (mode: WorkspaceMode) => void;
  onStartEmptyTimeline: (aspect: AspectRatioId) => void;
  onImportVideo: (aspect: AspectRatioId) => void;
  onImportPhoto: () => void;
  onOpenPhotoLab: () => void;
  onOpenPhotoCutout?: () => void;
  onOpenOverlays: () => void;
  onOpenPresets: () => void;
  onOpenAuth: (tab?: 'login' | 'signup') => void;
}

const ASPECT_LIST: { id: AspectRatioId; label: string }[] = [
  { id: '16:9', label: '16:9 Wide' },
  { id: '9:16', label: '9:16 Reels' },
  { id: '1:1', label: '1:1 Square' },
  { id: '4:5', label: '4:5 Social' },
  { id: '2.39:1', label: '2.39:1 Scope' },
];

export const StudioMenu: React.FC<StudioMenuProps> = ({
  workspace,
  user,
  studioUsername,
  chosenAspect,
  mobileOpen,
  onCloseMobile,
  onSelectAspect,
  onSelectWorkspace,
  onStartEmptyTimeline,
  onImportVideo,
  onImportPhoto,
  onOpenPhotoLab,
  onOpenPhotoCutout,
  onOpenOverlays,
  onOpenPresets,
  onOpenAuth,
}) => {
  const [videoSubOpen, setVideoSubOpen] = useState<boolean>(false);
  const [photoSubOpen, setPhotoSubOpen] = useState<boolean>(false);

  const accountLabel = user
    ? studioUsername
      ? `@${studioUsername}`
      : !user.emailVerified
        ? 'Verify Email'
        : user.displayName || user.email?.split('@')[0] || 'Account'
    : 'Log In / Sign Up';

  const renderMenuContent = (isDrawer: boolean) => (
    <div className="h-full flex flex-col justify-between p-3.5 bg-zinc-950 text-zinc-100 select-none">
      <div className="space-y-4 overflow-y-auto studio-scroll pr-0.5">
        {/* Slide-out drawer header */}
        {isDrawer && (
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-sm font-bold tracking-tight text-zinc-50">KinoFrame Menu</span>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close menu"
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* CapCut-style Primary Create Button */}
        <button
          type="button"
          onClick={() => {
            onStartEmptyTimeline(chosenAspect);
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>New Video Project</span>
        </button>

        {/* Primary Menu Links */}
        <nav aria-label="Studio Menu" className="space-y-1">
          <button
            type="button"
            onClick={() => {
              onSelectWorkspace('start');
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              workspace === 'start'
                ? 'bg-zinc-900 text-zinc-50 border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60 border border-transparent'
            }`}
          >
            <Home className="w-4 h-4 shrink-0 text-zinc-300" />
            <span>Home</span>
          </button>

          {/* Video Editor Menu Item + Submenu */}
          <div className="pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onSelectWorkspace('timeline');
                  onCloseMobile();
                }}
                className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  workspace === 'timeline'
                    ? 'bg-zinc-900 text-zinc-50 border border-zinc-700/80'
                    : 'text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900/60 border border-transparent'
                }`}
              >
                <Film className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Video Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setVideoSubOpen((v) => !v)}
                aria-label="Toggle Video Editor options"
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 cursor-pointer"
              >
                {videoSubOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {videoSubOpen && (
              <div className="mt-1 ml-3 pl-3 border-l border-zinc-800 space-y-1.5 py-1">
                <button
                  type="button"
                  onClick={() => {
                    onImportVideo(chosenAspect);
                    onCloseMobile();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-amber-300 hover:bg-zinc-900 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3 h-3 shrink-0" />
                  <span>Import Video Clips</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStartEmptyTimeline(chosenAspect);
                    onCloseMobile();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-zinc-300 hover:bg-zinc-900 cursor-pointer whitespace-nowrap"
                >
                  <FolderOpen className="w-3 h-3 shrink-0 text-zinc-400" />
                  <span>Blank Timeline ({chosenAspect})</span>
                </button>
                <div className="pt-1 px-1">
                  <span className="block text-[10px] font-mono text-zinc-500 mb-1">
                    Canvas Ratio
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    {ASPECT_LIST.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectAspect(item.id)}
                        className={`px-1.5 py-1 rounded text-[10px] font-mono cursor-pointer transition-colors whitespace-nowrap ${
                          chosenAspect === item.id
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Photo Editor Menu Item + Submenu */}
          <div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onOpenPhotoLab();
                  onCloseMobile();
                }}
                className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  workspace === 'photo'
                    ? 'bg-zinc-900 text-zinc-50 border border-zinc-700/80'
                    : 'text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900/60 border border-transparent'
                }`}
              >
                <ImageIcon className="w-4 h-4 shrink-0 text-zinc-300" />
                <span>Photo Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setPhotoSubOpen((v) => !v)}
                aria-label="Toggle Photo Editor options"
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 cursor-pointer"
              >
                {photoSubOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {photoSubOpen && (
              <div className="mt-1 ml-3 pl-3 border-l border-zinc-800 space-y-1 py-1">
                <button
                  type="button"
                  onClick={() => {
                    onImportPhoto();
                    onCloseMobile();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-amber-300 hover:bg-zinc-900 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3 h-3 shrink-0" />
                  <span>Import Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenPhotoLab();
                    onCloseMobile();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-zinc-300 hover:bg-zinc-900 cursor-pointer whitespace-nowrap"
                >
                  <ImageIcon className="w-3 h-3 shrink-0 text-zinc-400" />
                  <span>Open Photo Lab</span>
                </button>
                {onOpenPhotoCutout && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenPhotoCutout();
                      onCloseMobile();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:bg-zinc-900 cursor-pointer whitespace-nowrap"
                  >
                    <Scissors className="w-3 h-3 shrink-0 text-emerald-400" />
                    <span>BG Removal / Cutout</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onOpenOverlays();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-amber-300 hover:bg-zinc-900/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Blend className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Overlays</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenPresets();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Layers className="w-4 h-4 shrink-0 text-zinc-400" />
            <span>Film Presets</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onImportVideo(chosenAspect);
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4 shrink-0 text-zinc-400" />
            <span>Import Media</span>
          </button>
        </nav>
      </div>

      {/* Bottom Account Control */}
      <div className="pt-3 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={() => {
            onOpenAuth('login');
            onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-amber-500/60 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
        >
          <UserIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">{accountLabel}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Persistent Desktop Left Menu on Home */}
      {workspace === 'start' && (
        <aside className="hidden md:block w-56 lg:w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 h-full">
          {renderMenuContent(false)}
        </aside>
      )}

      {/* Slide-out CapCut Menu Drawer (Available anywhere on Mobile/Tablet or via Menu button) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-68 max-w-[82vw] h-full border-r border-zinc-800 bg-zinc-950 shadow-2xl">
            {renderMenuContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
