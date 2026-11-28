import React from 'react';
import { Menu, User as UserIcon } from 'lucide-react';
import { User } from '../lib/firebase';
import { WorkspaceMode } from '../types/editor';

interface HeaderProps {
  workspace: WorkspaceMode;
  user: User | null;
  studioDisplayName?: string;
  studioUsername?: string;
  onToggleMenu: () => void;
  onSelectWorkspace: (mode: WorkspaceMode) => void;
  onOpenExport: () => void;
  onOpenAuth: (tab?: 'login' | 'signup') => void;
}

export const Header: React.FC<HeaderProps> = ({
  workspace,
  user,
  studioDisplayName,
  studioUsername,
  onToggleMenu,
  onSelectWorkspace,
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

  const isInEditor = workspace === 'timeline' || workspace === 'photo';

  return (
    <header className="shrink-0 border-b border-zinc-800 bg-zinc-950">
      <div className="h-12 md:h-14 px-3 sm:px-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label="Open studio menu"
            className="p-1.5 rounded-md text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
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
        </div>

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

          {isInEditor && (
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
    </header>
  );
};
