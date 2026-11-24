import React from 'react';
import { User as UserIcon } from 'lucide-react';
import { User } from '../lib/firebase';
import { WorkspaceMode } from '../types/editor';

interface HeaderProps {
  workspace: WorkspaceMode;
  user: User | null;
  studioDisplayName?: string;
  studioUsername?: string;
  onSelectWorkspace: (mode: WorkspaceMode) => void;
  onOpenPresets: () => void;
  onFocusImport: () => void;
  onOpenExport: () => void;
  onOpenAuth: (tab?: 'login' | 'signup') => void;
}

export const Header: React.FC<HeaderProps> = ({
  workspace,
  user,
  studioDisplayName,
  studioUsername,
  onSelectWorkspace,
  onOpenPresets,
  onFocusImport,
  onOpenExport,
  onOpenAuth,
}) => {
  const shortName = user
    ? studioUsername
      ? `@${studioUsername}`
      : !user.emailVerified
        ? 'Verify Email'
        : (studioDisplayName || user.displayName || user.email?.split('@')[0] || 'Account').split(' ')[0]
    : null;

  return (
    <header className="shrink-0 border-b border-zinc-800 bg-zinc-950 flex flex-col">
      <div className="h-12 md:h-14 px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-8">
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            onSelectWorkspace('start');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-zinc-50 whitespace-nowrap shrink-0"
        >
          KinoFrame
        </a>

        <nav className="hidden md:flex items-center gap-6 lg:gap-7 text-sm font-medium text-zinc-400">
          <button
            type="button"
            onClick={() => onSelectWorkspace('start')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
              workspace === 'start'
                ? 'text-zinc-50 border-amber-500'
                : 'border-transparent hover:text-zinc-100'
            }`}
          >
            Studio Home
          </button>
          <button
            type="button"
            onClick={() => onSelectWorkspace('timeline')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
              workspace === 'timeline'
                ? 'text-zinc-50 border-amber-500'
                : 'border-transparent hover:text-zinc-100'
            }`}
          >
            Video Editor
          </button>
          <button
            type="button"
            onClick={() => onSelectWorkspace('photo')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
              workspace === 'photo'
                ? 'text-zinc-50 border-amber-500'
                : 'border-transparent hover:text-zinc-100'
            }`}
          >
            Photo Editor
          </button>
          <button
            type="button"
            onClick={onOpenPresets}
            className="py-1 border-b-2 border-transparent hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Film Presets
          </button>
          <button
            type="button"
            onClick={onFocusImport}
            className="py-1 border-b-2 border-transparent hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Import
          </button>
        </nav>

        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>{shortName}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="text-xs font-medium text-zinc-300 hover:text-zinc-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="hidden sm:inline">Log In / Sign Up</span>
              <span className="sm:hidden">Log In</span>
            </button>
          )}

          {workspace === 'start' ? (
            <button
              type="button"
              onClick={() => onSelectWorkspace('timeline')}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-zinc-950 bg-zinc-50 rounded-md hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              New Video
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenExport}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-zinc-950 bg-zinc-50 rounded-md hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Export
            </button>
          )}
        </div>
      </div>

      {/* Mobile Navigation Strip */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden h-9 px-3 border-t border-zinc-800/70 flex items-center gap-4 overflow-x-auto text-xs font-medium text-zinc-400"
      >
        <button
          type="button"
          onClick={() => onSelectWorkspace('start')}
          className={`h-full border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
            workspace === 'start' ? 'text-zinc-50 border-amber-500' : 'border-transparent'
          }`}
        >
          Home
        </button>
        <button
          type="button"
          onClick={() => onSelectWorkspace('timeline')}
          className={`h-full border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
            workspace === 'timeline' ? 'text-zinc-50 border-amber-500' : 'border-transparent'
          }`}
        >
          Video
        </button>
        <button
          type="button"
          onClick={() => onSelectWorkspace('photo')}
          className={`h-full border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
            workspace === 'photo' ? 'text-zinc-50 border-amber-500' : 'border-transparent'
          }`}
        >
          Photo
        </button>
        <button
          type="button"
          onClick={onOpenPresets}
          className="h-full border-b-2 border-transparent whitespace-nowrap shrink-0 cursor-pointer"
        >
          Presets
        </button>
        <button
          type="button"
          onClick={onFocusImport}
          className="h-full border-b-2 border-transparent whitespace-nowrap shrink-0 cursor-pointer"
        >
          Import
        </button>
      </nav>
    </header>
  );
};
